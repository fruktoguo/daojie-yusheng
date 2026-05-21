import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'SERVER_DATABASE_URL/DATABASE_URL missing', answers: 'flush worker with-db proof 依赖真实数据库连接', excludes: '不证明跨节点竞争或生产压测', completionMapping: 'release:proof:flush-task-worker' }, null, 2));
    return;
  }

  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  const previousMode = process.env.SERVER_FLUSH_TASK_RUNTIME_MODE;
  process.env.SERVER_RUNTIME_ROLE = 'worker';
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'worker';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const poolProvider = app.get(DatabasePoolProvider);
  const ledger = app.get(FlushLedgerService);
  const playerPresencePersistence = app.get(PlayerDomainPersistenceService);
  const instancePersistence = app.get(InstanceDomainPersistenceService);
  const worldRuntime = app.get(WorldRuntimeService);
  const pool = poolProvider.getPool('player-flush-ledger') ?? poolProvider.getPool('flush-ledger');
  assert(pool, 'expected flush ledger database pool');

  const playerId = `flush_worker_db_player_${Date.now().toString(36)}`;
  const retryPlayerId = `${playerId}_retry`;
  const instanceId = `public:flush_worker_db_instance_${Date.now().toString(36)}`;
  const staleInstanceId = `${instanceId}_stale`;

  try {
    assert.equal(ledger.isEnabled(), true, 'flush ledger should be enabled');
    assert.equal(playerPresencePersistence.isEnabled(), true, 'player domain persistence should be enabled');
    assert.equal(instancePersistence.isEnabled(), true, 'instance domain persistence should be enabled');
    await cleanupAll(pool, [playerId, retryPlayerId], [instanceId, staleInstanceId]);

    await ledger.upsertFlushTask({
      scope: 'player',
      id: playerId,
      domain: 'presence',
      priority: 'high',
      latestRevision: 11,
      payloadJson: {
        online: true,
        inWorld: true,
        lastHeartbeatAt: 12345,
        offlineSinceAt: null,
        runtimeOwnerId: 'worker-api-1',
        sessionEpoch: 9,
        versionSeed: 11,
      },
    });
    const playerTasks = await ledger.claimReadyFlushTasks({ workerId: 'flush-worker-db:presence', scope: 'player', domain: 'presence', limit: 10 });
    assert.equal(playerTasks.length, 1);
    await playerPresencePersistence.savePlayerPresence(playerId, playerTasks[0]?.payloadJson as never);
    assert.equal(await ledger.markFlushTaskFlushed(playerTasks[0]!), true);
    assert.deepEqual(await playerPresencePersistence.loadPlayerPresence(playerId), {
      playerId,
      online: true,
      inWorld: true,
      lastHeartbeatAt: 12345,
      offlineSinceAt: null,
      runtimeOwnerId: 'worker-api-1',
      sessionEpoch: 9,
      transferState: null,
      transferTargetNodeId: null,
    });
    assert.equal((await ledger.claimReadyFlushTasks({ workerId: 'flush-worker-db:presence-repeat', scope: 'player', domain: 'presence', limit: 10 })).length, 0);

    await ledger.upsertFlushTask({
      scope: 'player',
      id: retryPlayerId,
      domain: 'presence',
      priority: 'low',
      latestRevision: 14,
      nextAttemptAt: new Date().toISOString(),
      payloadJson: { kind: 'player_presence', inWorld: true },
    });
    const retryTasks = await ledger.claimReadyFlushTasks({ workerId: 'flush-worker-db:retry', scope: 'player', domain: 'presence', limit: 10 });
    assert.equal(retryTasks.length, 1);
    assert.equal(await ledger.markFlushTaskRetry(retryTasks[0]!, 5_000), true);
    const retryRow = await fetchFlushRow(pool, 'player', retryPlayerId, 'presence');
    assert.ok(retryRow);
    assert.equal(Number(retryRow?.flushed_version ?? 0), 0);
    assert.ok(retryRow?.next_attempt_at);

    await ledger.upsertFlushTask({
      scope: 'instance',
      id: instanceId,
      domain: 'time',
      priority: 'normal',
      latestRevision: 13,
      ownershipEpoch: 5,
      payloadJson: {
        kind: 'instance_domain_state',
        domain: 'time',
        payload: { version: 2, savedAt: 1, templateId: 't1', tick: 3, tickSpeed: 1, paused: false },
      },
    });
    const instanceTasks = await ledger.claimReadyFlushTasks({ workerId: 'flush-worker-db:instance', scope: 'instance', domain: 'time', limit: 10 });
    assert.equal(instanceTasks.length, 1);
    await instancePersistence.saveInstanceCheckpoint(instanceId, (instanceTasks[0]?.payloadJson as Record<string, unknown>)?.payload);
    assert.equal(await ledger.markFlushTaskFlushed(instanceTasks[0]!), true);
    assert.deepEqual(await instancePersistence.loadInstanceCheckpoint(instanceId), { version: 2, savedAt: 1, templateId: 't1', tick: 3, tickSpeed: 1, paused: false });
    assert.equal((await ledger.claimReadyFlushTasks({ workerId: 'flush-worker-db:instance-repeat', scope: 'instance', domain: 'time', limit: 10 })).length, 0);

    worldRuntime.setInstanceRuntime(staleInstanceId, { meta: { persistent: true, ownershipEpoch: 7 } } as never);
    await ledger.upsertFlushTask({
      scope: 'instance',
      id: staleInstanceId,
      domain: 'time',
      priority: 'normal',
      latestRevision: 15,
      ownershipEpoch: 6,
      payloadJson: null,
    });
    const staleTasks = await ledger.claimReadyFlushTasks({ workerId: 'flush-worker-db:stale', scope: 'instance', domain: 'time', limit: 10 });
    assert.equal(staleTasks.length, 1);
    const staleRuntime = worldRuntime.getInstanceRuntime(staleInstanceId) as { meta?: { persistent?: boolean; ownershipEpoch?: number } } | undefined;
    assert.equal(staleRuntime?.meta?.persistent, true);
    assert.equal(staleRuntime?.meta?.ownershipEpoch, 7);
    assert.equal(await ledger.markFlushTaskFlushed(staleTasks[0]!), true);
    assert.equal(await instancePersistence.loadInstanceCheckpoint(staleInstanceId), null);
    const staleRow = await fetchFlushRow(pool, 'instance', staleInstanceId, 'time');
    assert.ok(staleRow);
    assert.equal(Number(staleRow?.flushed_version ?? 0), 15);

    console.log(JSON.stringify({
      ok: true,
      playerClaimed: playerTasks.length,
      retryClaimed: retryTasks.length,
      instanceClaimed: instanceTasks.length,
      staleClaimed: staleTasks.length,
      answers: 'flush worker 的真实 DB ledger claim / retry / flush / fencing 路径已验证：player presence 写入真源、invalid payload 进入 retry、instance checkpoint 写入真源、stale ownership epoch 不写入只 mark flushed、重复 claim 不再返回已 flushed 任务。',
      excludes: '不证明跨节点竞争或 5000/10000 容量压测。',
      completionMapping: 'release:proof:flush-task-worker',
    }, null, 2));
  } finally {
    await cleanupAll(pool, [playerId, retryPlayerId], [instanceId, staleInstanceId]).catch(() => undefined);
    await app.close().catch(() => undefined);
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
}

async function cleanupAll(pool: Pool, playerIds: string[], instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_checkpoint WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
}

async function fetchFlushRow(pool: Pool, scope: 'player' | 'instance', id: string, domain: string): Promise<Record<string, unknown> | null> {
  const table = scope === 'player' ? 'player_flush_ledger' : 'instance_flush_ledger';
  const column = scope === 'player' ? 'player_id' : 'instance_id';
  const result = await pool.query(`SELECT * FROM ${table} WHERE ${column} = $1 AND domain = $2 LIMIT 1`, [id, domain]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

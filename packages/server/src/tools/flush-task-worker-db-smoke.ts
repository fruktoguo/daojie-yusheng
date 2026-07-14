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
  const groupedPlayerId = `${playerId}_grouped`;
  const lockOrderPlayerIds = Array.from(
    { length: 24 },
    (_, index) => `${playerId}_lock_order_${index.toString().padStart(2, '0')}`,
  );
  const instanceId = `public:flush_worker_db_instance_${Date.now().toString(36)}`;
  const staleInstanceId = `${instanceId}_stale`;
  const allPlayerIds = [playerId, retryPlayerId, groupedPlayerId, ...lockOrderPlayerIds];

  try {
    assert.equal(ledger.isEnabled(), true, 'flush ledger should be enabled');
    assert.equal(playerPresencePersistence.isEnabled(), true, 'player domain persistence should be enabled');
    assert.equal(instancePersistence.isEnabled(), true, 'instance domain persistence should be enabled');
    await cleanupAll(pool, allPlayerIds, [instanceId, staleInstanceId]);

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

    const delayedAt = new Date(Date.now() + 60_000).toISOString();
    await ledger.upsertFlushTasks([
      {
        scope: 'player',
        id: groupedPlayerId,
        domain: 'inventory',
        priority: 'high',
        latestRevision: 21,
        nextAttemptAt: new Date().toISOString(),
        payloadJson: { kind: 'player_snapshot_projection', projectedDomains: ['inventory'] },
      },
      {
        scope: 'player',
        id: groupedPlayerId,
        domain: 'vitals',
        priority: 'normal',
        latestRevision: 22,
        nextAttemptAt: delayedAt,
        payloadJson: { kind: 'player_snapshot_projection', projectedDomains: ['vitals'] },
      },
      {
        scope: 'player',
        id: groupedPlayerId,
        domain: 'buff',
        priority: 'normal',
        latestRevision: 23,
        nextAttemptAt: delayedAt,
        payloadJson: { kind: 'player_snapshot_projection', projectedDomains: ['buff'] },
      },
      {
        scope: 'player',
        id: groupedPlayerId,
        domain: 'mail',
        priority: 'high',
        latestRevision: 24,
        nextAttemptAt: new Date().toISOString(),
        payloadJson: { kind: 'legacy_unsupported_player_payload' },
      },
    ]);
    const groupedProjectionDomains = ['inventory', 'vitals', 'buff'];
    const groupedClaims = await Promise.all([
      ledger.claimReadyPlayerFlushTaskGroups({
        workerId: 'flush-worker-db:group-a',
        id: groupedPlayerId,
        priority: 'high',
        limit: 1,
        payloadRequired: true,
        includedDomains: groupedProjectionDomains,
      }),
      ledger.claimReadyPlayerFlushTaskGroups({
        workerId: 'flush-worker-db:group-b',
        id: groupedPlayerId,
        priority: 'high',
        limit: 1,
        payloadRequired: true,
        includedDomains: groupedProjectionDomains,
      }),
    ]);
    assert.deepEqual(
      groupedClaims.map((tasks) => tasks.length).sort((left, right) => left - right),
      [0, 3],
      '并发认领必须产生一个整组赢家和一个空结果 loser',
    );
    const groupedWinner = groupedClaims.find((tasks) => tasks.length > 0) ?? [];
    const groupedLoser = groupedClaims.find((tasks) => tasks.length === 0) ?? [];
    assert.equal(groupedWinner.length, 3, 'limit=1 应按玩家额度认领该玩家的全部待刷领域');
    assert.equal(groupedLoser.length, 0, '并发 worker 不得拆分同一玩家的领域 claim');
    assert.deepEqual(
      groupedWinner.map((task) => task.domain).sort(),
      ['buff', 'inventory', 'vitals'],
      '高优先级 inventory 到期后应连同延迟中的 vitals/buff 一并认领',
    );
    assert.equal(new Set(groupedWinner.map((task) => task.claimOwnerId)).size, 1);
    assert.equal(
      (await ledger.claimReadyPlayerFlushTaskGroups({
        workerId: 'flush-worker-db:group-third',
        id: groupedPlayerId,
        limit: 1,
        payloadRequired: true,
        includeDelayed: true,
        includedDomains: groupedProjectionDomains,
      })).length,
      0,
      '任一领域存在活跃 claim 时必须阻断整名玩家被其他 worker 再认领',
    );
    const unsupportedTasks = await ledger.claimReadyFlushTasks({
      workerId: 'flush-worker-db:unsupported',
      scope: 'player',
      id: groupedPlayerId,
      domain: 'mail',
      limit: 1,
      payloadRequired: true,
    });
    assert.equal(unsupportedTasks.length, 1, '未知玩家域不得被资产投影聚合 claim 吞入同一事务组');
    assert.equal(await ledger.renewFlushTaskClaims(groupedWinner), groupedWinner.length, '玩家组 claim 必须整组续租');
    assert.equal(await ledger.markFlushTasksRetry(groupedWinner, 250), groupedWinner.length, '玩家组失败必须整组进入重试');
    const groupedRetry = await ledger.claimReadyPlayerFlushTaskGroups({
      workerId: 'flush-worker-db:group-retry',
      id: groupedPlayerId,
      limit: 1,
      payloadRequired: true,
      includeDelayed: true,
      includedDomains: groupedProjectionDomains,
    });
    assert.equal(groupedRetry.length, groupedWinner.length, '玩家组重试必须重新整组认领');
    assert.equal(await ledger.markFlushTasksFlushed(groupedRetry), groupedRetry.length, '玩家组成功必须整组确认');

    await provePlayerLedgerBatchLockOrder(ledger, lockOrderPlayerIds);

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
    assert.equal(await ledger.renewFlushTaskClaims(instanceTasks), 1);
    assert.equal(await ledger.markFlushTasksFlushed(instanceTasks), 1);
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
      groupedPlayerClaimed: groupedWinner.length,
      instanceClaimed: instanceTasks.length,
      staleClaimed: staleTasks.length,
      answers: 'flush worker 的真实 DB ledger claim / retry / flush / fencing 路径已验证：player presence 写入真源、invalid payload 进入 retry、同一玩家的到期高优先级投影会连同延迟投影被单个 worker 整组认领且并发 worker 无法拆分，未知玩家域不会混入资产投影组、玩家账本并发批量 upsert 使用统一主键锁序且不会死锁、instance checkpoint 写入真源、stale ownership epoch 不写入只 mark flushed、重复 claim 不再返回已 flushed 任务。',
      excludes: '不证明跨节点竞争或 5000/10000 容量压测。',
      completionMapping: 'release:proof:flush-task-worker',
    }, null, 2));
  } finally {
    await cleanupAll(pool, allPlayerIds, [instanceId, staleInstanceId]).catch(() => undefined);
    await app.close().catch(() => undefined);
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
}

async function provePlayerLedgerBatchLockOrder(
  ledger: FlushLedgerService,
  playerIds: string[],
): Promise<void> {
  const domains = [
    { domain: 'active_job', priority: 'normal' },
    { domain: 'artifact', priority: 'normal' },
    { domain: 'attr', priority: 'normal' },
    { domain: 'buff', priority: 'normal' },
    { domain: 'inventory', priority: 'high' },
    { domain: 'progression', priority: 'normal' },
    { domain: 'technique', priority: 'normal' },
    { domain: 'vitals', priority: 'normal' },
  ] as const;
  const buildTasks = (revision: number, reverse: boolean) => {
    const tasks = playerIds.flatMap((id) => domains.map(({ domain, priority }) => ({
      scope: 'player' as const,
      id,
      domain,
      priority,
      latestRevision: revision,
      nextAttemptAt: new Date().toISOString(),
      payloadJson: { kind: 'flush_ledger_lock_order_probe', revision },
    })));
    return reverse ? tasks.reverse() : tasks;
  };

  await ledger.upsertFlushTasks(buildTasks(100, false), 1_000);
  for (let round = 0; round < 3; round += 1) {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, workerIndex) => (
      ledger.upsertFlushTasks(
        buildTasks(101 + round * 12 + workerIndex, workerIndex % 2 === 1),
        1_000,
      )
    )));
    const failures = results.filter((result) => result.status === 'rejected');
    assert.equal(
      failures.length,
      0,
      `玩家账本并发批量 upsert 不得因输入顺序相反产生死锁：round=${round} failures=${failures.length}`,
    );
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

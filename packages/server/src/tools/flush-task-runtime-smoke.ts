import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';

async function main(): Promise<void> {
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'inline';
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下可验证统一 flush task runtime 从 dirty 采集、ledger 认领到 mark flushed 的闭环。',
      excludes: '不证明真实生产压测或跨节点故障注入。',
      completionMapping: 'release:proof:stage4.flush-task-runtime',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const ledger = new FlushLedgerService({ getPool: () => pool } as never);
  const wakeup = new FlushWakeupService();
  const playerId = `flush_task_player_${Date.now().toString(36)}`;
  const instanceId = `public:flush_task_instance_${Date.now().toString(36)}`;
  const smokeDomain = `flush_task_smoke_${Date.now().toString(36)}`;
  const extraPlayerDomain = `${smokeDomain}_extra_player`;
  const extraInstanceDomain = `${smokeDomain}_extra_instance`;
  let playerFlushCalls = 0;
  let instanceFlushCalls = 0;
  const playerFlushDomains: string[][] = [];
  const instanceFlushDomains: string[][] = [];

  const playerRuntime = {
    listDirtyPlayerDomains() {
      return new Map([[playerId, new Set([smokeDomain, extraPlayerDomain])]]);
    },
    getPersistenceRevision() {
      return 11;
    },
  };
  const playerFlush = {
    async flushPlayerDomains(targetPlayerId: string, domains: Iterable<string>) {
      assert.equal(targetPlayerId, playerId);
      playerFlushCalls += 1;
      playerFlushDomains.push(Array.from(domains).sort());
    },
  };
  const worldRuntime = {
    listDirtyPersistentInstanceDomains() {
      return [{ instanceId, domains: [smokeDomain, extraInstanceDomain] }];
    },
    getInstanceRuntime(targetInstanceId: string) {
      assert.equal(targetInstanceId, instanceId);
      return {
        meta: { persistent: true, ownershipEpoch: 3 },
        getPersistenceRevision() {
          return 17;
        },
      };
    },
    async flushInstanceDomains(targetInstanceId: string, domains?: string[] | null) {
      assert.equal(targetInstanceId, instanceId);
      instanceFlushDomains.push([...(domains ?? [])].sort());
      instanceFlushCalls += 1;
      return { skipped: false };
    },
  };

  const runtime = new FlushTaskRuntimeService(
    playerRuntime as never,
    worldRuntime as never,
    playerFlush as never,
    ledger,
    wakeup,
  );

  try {
    await ledger.onModuleInit();
    await cleanupRows(pool, playerId, instanceId);
    const processed = await runtime.runOnce('flush-task-runtime-smoke');
    assert.equal(processed, 4);
    assert.equal(playerFlushCalls, 1);
    assert.equal(instanceFlushCalls, 1);
    assert.deepEqual(playerFlushDomains, [[extraPlayerDomain, smokeDomain].sort()]);
    assert.deepEqual(instanceFlushDomains, [[extraInstanceDomain, smokeDomain].sort()]);
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(playerId)));
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));
    const readyPlayers = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe', scope: 'player', domain: smokeDomain, limit: 10 });
    const readyInstances = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe', scope: 'instance', domain: smokeDomain, limit: 10 });
    assert.equal(readyPlayers.length, 0);
    assert.equal(readyInstances.length, 0);
    const readyExtraPlayers = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe-extra', scope: 'player', domain: extraPlayerDomain, limit: 10 });
    const readyExtraInstances = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe-extra', scope: 'instance', domain: extraInstanceDomain, limit: 10 });
    assert.equal(readyExtraPlayers.length, 0);
    assert.equal(readyExtraInstances.length, 0);
    const priorityPlayerId = `${playerId}_priority`;
    await ledger.upsertFlushTask({
      scope: 'player',
      id: priorityPlayerId,
      domain: 'inventory',
      priority: 'high',
      latestRevision: 21,
      nextAttemptAt: new Date().toISOString(),
    });
    await ledger.upsertFlushTask({
      scope: 'player',
      id: priorityPlayerId,
      domain: 'progression',
      priority: 'normal',
      latestRevision: 22,
      nextAttemptAt: new Date().toISOString(),
    });
    await ledger.upsertFlushTask({
      scope: 'player',
      id: priorityPlayerId,
      domain: 'body_training',
      priority: 'low',
      latestRevision: 23,
      nextAttemptAt: new Date().toISOString(),
    });
    const highPriority = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:priority-high', scope: 'player', priority: 'high', limit: 10 });
    const normalPriority = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:priority-normal', scope: 'player', priority: 'normal', limit: 10 });
    const lowPriority = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:priority-low', scope: 'player', priority: 'low', limit: 10 });
    assert.equal(highPriority.some((task) => task.id === priorityPlayerId && task.domain === 'inventory' && task.priority === 'high'), true);
    assert.equal(normalPriority.some((task) => task.id === priorityPlayerId && task.domain === 'progression' && task.priority === 'normal'), true);
    assert.equal(lowPriority.some((task) => task.id === priorityPlayerId && task.domain === 'body_training' && task.priority === 'low'), true);
    await cleanupRows(pool, priorityPlayerId, instanceId);
    console.log(JSON.stringify({
      ok: true,
      processed,
      playerFlushCalls,
      instanceFlushCalls,
      answers: '统一 flush task runtime 已完成 dirty 采集、ledger priority claim、执行 flush action 与 mark flushed 闭环。',
      excludes: '不证明真实生产压测或跨节点故障注入。',
      completionMapping: 'release:proof:stage4.flush-task-runtime',
    }, null, 2));
  } finally {
    await cleanupRows(pool, playerId, instanceId).catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, playerId: string, instanceId: string): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE player_id = $1', [playerId]);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = $1', [instanceId]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

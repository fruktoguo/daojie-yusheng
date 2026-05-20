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
  let playerFlushCalls = 0;
  let instanceFlushCalls = 0;

  const playerRuntime = {
    listDirtyPlayerDomains() {
      return new Map([[playerId, new Set([smokeDomain])]]);
    },
    getPersistenceRevision() {
      return 11;
    },
  };
  const playerFlush = {
    async flushPlayer(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      playerFlushCalls += 1;
    },
  };
  const worldRuntime = {
    listDirtyPersistentInstanceDomains() {
      return [{ instanceId, domains: [smokeDomain] }];
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
      assert.deepEqual(domains, [smokeDomain]);
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
    const processed = await runtime.runOnce('flush-task-runtime-smoke', { playerDomain: smokeDomain, instanceDomain: smokeDomain });
    assert.equal(processed, 2);
    assert.equal(playerFlushCalls, 1);
    assert.equal(instanceFlushCalls, 1);
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(playerId)));
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));
    const readyPlayers = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe', scope: 'player', domain: smokeDomain, limit: 10 });
    const readyInstances = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe', scope: 'instance', domain: smokeDomain, limit: 10 });
    assert.equal(readyPlayers.length, 0);
    assert.equal(readyInstances.length, 0);
    console.log(JSON.stringify({
      ok: true,
      processed,
      playerFlushCalls,
      instanceFlushCalls,
      answers: '统一 flush task runtime 已完成 dirty 采集、ledger claim、执行 flush action 与 mark flushed 闭环。',
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

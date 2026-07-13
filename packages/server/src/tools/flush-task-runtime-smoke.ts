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
  const smokeDomain = 'time';
  const extraInstanceDomain = 'ground_item';
  let playerPresenceCalls = 0;
  let instanceFlushCalls = 0;
  let playerDirty = true;
  const instanceDirtyDomains = new Set([smokeDomain, extraInstanceDomain]);
  const playerPresencePayloads: unknown[] = [];
  const instanceFlushDomains: string[][] = [];

  const playerRuntime = {
    listDirtyPlayerDomains() {
      return playerDirty ? new Map([[playerId, new Set(['presence'])]]) : new Map();
    },
    describePersistencePresence(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return {
        playerId: targetPlayerId,
        online: true,
        inWorld: true,
        runtimeOwnerId: `runtime:${targetPlayerId}`,
        sessionEpoch: 3,
        lastHeartbeatAt: Date.now(),
        offlineSinceAt: null,
      };
    },
    getPersistenceRevision() {
      return 11;
    },
    markPersistenceDomainsStaged() {
      playerDirty = false;
    },
  };
  const playerFlush = {
    async flushPlayerDomains() {
      return undefined;
    },
  };
  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async loadPlayerPresence(playerIdForPresence: string) {
      assert.equal(playerIdForPresence, playerId);
      return {
        runtimeOwnerId: `runtime:${playerIdForPresence}`,
        sessionEpoch: 3,
      };
    },
    async savePlayerPresence(playerIdForPresence: string, payload: unknown) {
      assert.equal(playerIdForPresence, playerId);
      playerPresenceCalls += 1;
      playerPresencePayloads.push(payload);
    },
    async savePlayerSnapshotProjectionDomains() {
      return undefined;
    },
  };
  const worldRuntime = {
    instanceDomainPersistenceService: {
      isEnabled() {
        return true;
      },
      async saveInstanceCheckpoint() {
        return undefined;
      },
      async saveMonsterRuntimeDelta() {
        return undefined;
      },
      async replaceMonsterRuntimeStates() {
        return undefined;
      },
      async saveOverlayChunk() {
        return undefined;
      },
      async replaceGroundItemTiles() {
        return undefined;
      },
      async saveInstanceRecoveryWatermark() {
        return undefined;
      },
      async saveContainerState() {
        return undefined;
      },
      async saveBuildingRoomFengShuiState() {
        return undefined;
      },
    },
    listDirtyPersistentInstanceDomains() {
      return instanceDirtyDomains.size > 0
        ? [{ instanceId, domains: Array.from(instanceDirtyDomains) }]
        : [];
    },
    getInstanceRuntime(targetInstanceId: string) {
      assert.equal(targetInstanceId, instanceId);
      return {
        meta: { persistent: true, ownershipEpoch: 3, kind: 'public' },
        template: { id: 'flush-task-runtime-smoke' },
        tick: 17,
        tickSpeed: 1,
        paused: false,
        getPersistenceRevision() {
          return 17;
        },
        getPersistenceDomainRevision() {
          return 17;
        },
        isDirtyDomainHighPriority() {
          return true;
        },
        capturePersistenceDomainFlushSnapshot(domains: string[]) {
          return {
            persistenceRevision: 17,
            domainRevisions: Object.fromEntries(domains.map((domain) => [domain, 17])),
          };
        },
        buildGroundPersistenceDelta() {
          return {
            fullReplace: false,
            tileIndices: [4],
            entries: [{ tileIndex: 4, items: [{ itemId: 'rat_tail', count: 1 }] }],
          };
        },
        markPersistenceDomainsStaged(domains: string[]) {
          for (const domain of domains) instanceDirtyDomains.delete(domain);
          return undefined;
        },
        markPersistenceDomainsPersisted() {
          return undefined;
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
    undefined,
    undefined,
    playerDomainPersistenceService as never,
  );

  try {
    await ledger.onModuleInit();
    await cleanupRows(pool, playerId, instanceId);
    const instanceProcessed = await runtime.runOnce('flush-task-runtime-smoke');
    assert.equal(instanceProcessed, 2);
    await pool.query(
      'UPDATE player_flush_ledger SET next_attempt_at = now() WHERE player_id = $1 AND domain = $2',
      [playerId, 'presence'],
    );
    const playerProcessed = await runtime.runOnce('flush-task-runtime-smoke:player');
    assert.equal(playerProcessed, 1);
    const processed = instanceProcessed + playerProcessed;
    assert.equal(playerPresenceCalls, 1);
    assert.equal(instanceFlushCalls, 0);
    assert.deepEqual(instanceFlushDomains, []);
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(playerId)));
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));
    const readyPlayers = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe', scope: 'player', domain: 'presence', limit: 10 });
    const readyInstances = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe', scope: 'instance', domain: smokeDomain, limit: 10 });
    assert.equal(readyPlayers.length, 0);
    assert.equal(readyInstances.length, 0);
    const readyExtraInstances = await ledger.claimReadyFlushTasks({ workerId: 'flush-task-runtime-smoke:probe-extra', scope: 'instance', domain: extraInstanceDomain, limit: 10 });
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
      playerPresenceCalls,
      instanceFlushCalls,
      answers: '统一 flush task runtime 已完成 dirty 采集、durable payload staging、ledger priority claim 与 mark flushed 闭环；instance 的 time/ground_item 直接从 payload 写入分域 persistence，player presence 也被收口清理。',
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

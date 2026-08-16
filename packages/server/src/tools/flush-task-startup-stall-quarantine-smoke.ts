import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { isNonRecoverableReplayPlayerPayloadError } from '../persistence/flush-failure-policy';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import type { FlushTask } from '../persistence/flush-task.types';

const STALL_CATEGORY = 'startup_deterministic_stall';

function buildProjectionTask(playerId: string, latestRevision: number): FlushTask {
  return {
    scope: 'player',
    id: playerId,
    domain: 'market_storage',
    priority: 'high',
    latestRevision,
    ownershipEpoch: null,
    runtimeOwnerId: null,
    fencingToken: null,
    idempotencyKey: `startup-stall-smoke:${playerId}:${latestRevision}`,
    payloadJson: {
      kind: 'player_snapshot_projection',
      snapshot: { playerId, savedAt: Date.now() },
      projectedDomains: ['market_storage'],
      projectionVersion: latestRevision,
      domainRevision: latestRevision,
      runtimeRevision: 1,
      stagingGenerationId: `smoke:${playerId}`,
    },
    dirtySinceAt: new Date().toISOString(),
    nextAttemptAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'inline';
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下可验证启动重放确定性失败会隔离 payload 并继续启动，单玩家数据坏不再阻断服务端启动。',
      excludes: '不证明真实生产压测或跨节点故障注入。',
      completionMapping: 'release:proof:stage4.flush-task-startup-stall-quarantine',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const ledger = new FlushLedgerService({ getPool: () => pool } as never);
  const wakeup = new FlushWakeupService();
  const playerA = `startup_stall_a_${Date.now().toString(36)}`;
  const playerB = `startup_stall_b_${Date.now().toString(36)}`;

  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async loadPlayerPresence() {
      return { runtimeOwnerId: 'runtime:startup-stall-smoke', sessionEpoch: 1 };
    },
    async savePlayerPresence() {
      return undefined;
    },
    async savePlayerSnapshotProjectionDomains() {
      throw new Error(
        `replace_market_storage_refused_empty_overwrite:playerId=${playerA} table=player_market_storage_item`,
      );
    },
    async savePlayerSnapshotProjectionDomainBatch() {
      throw new Error(
        `replace_market_storage_refused_empty_overwrite:playerId=${playerA} table=player_market_storage_item`,
      );
    },
  };
  const playerRuntime = {
    markPersistenceDomainsPersistedByRevision() {
      return undefined;
    },
  };
  const worldRuntime = {};
  const playerFlush = {
    async flushPlayerDomains() {
      return undefined;
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
  const processPlayerTasks = (
    tasks: FlushTask[],
    options?: { failFastDeterministicPayload?: boolean; preserveTechniqueComprehensionTruthOnEmptyOverwrite?: boolean },
  ): Promise<number> => (runtime as unknown as {
    processPlayerTasks: (
      tasks: FlushTask[],
      options?: { failFastDeterministicPayload?: boolean; preserveTechniqueComprehensionTruthOnEmptyOverwrite?: boolean },
    ) => Promise<number>;
  }).processPlayerTasks(tasks, options);

  try {
    await ledger.onModuleInit();
    await pool.query('DELETE FROM player_flush_ledger WHERE player_id = ANY($1::varchar[])', [[playerA, playerB]]);

    // —— 纯函数判定：确定性数据错误 → 不可恢复；环境错误 → 可重试 ——
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('replace_market_storage_refused_empty_overwrite:playerId=x table=player_market_storage_item'),
    ), true);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('replace_inventory_refused_empty_overwrite:playerId=x table=player_inventory_item'),
    ), true);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('player_presence_incomplete_fence:x:expectedOwner=o:expectedEpoch=1'),
    ), true);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('player_snapshot_projection_incomplete_fence:x:expectedOwner=o:expectedEpoch=1'),
    ), true);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('player_snapshot_projection_presence_loader_unavailable:x'),
    ), true);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('timeout exceeded when trying to connect'),
    ), false);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(
      new Error('deadlock detected'),
    ), false);
    assert.equal(isNonRecoverableReplayPlayerPayloadError(new Error('random transient failure')), false);
    assert.equal(isNonRecoverableReplayPlayerPayloadError('not an error'), false);

    // —— 场景 A：启动重放（failFast）确定性失败 → 隔离整组 payload 并继续，不抛错 ——
    await ledger.upsertFlushTask(buildProjectionTask(playerA, 1));
    const claimedA = await ledger.claimReadyPlayerFlushTaskGroups({
      workerId: 'startup-stall-smoke:replay',
      limit: 10,
      payloadRequired: true,
      includeDelayed: true,
    });
    const groupA = claimedA.filter((task) => task.id === playerA);
    assert.equal(groupA.length, 1);
    const processedA = await processPlayerTasks(groupA, {
      failFastDeterministicPayload: true,
      preserveTechniqueComprehensionTruthOnEmptyOverwrite: true,
    });
    assert.equal(processedA, 1);
    const rowA = await pool.query<{
      failure_category: string | null;
      claimed_by: string | null;
      next_attempt_at: Date | null;
    }>(
      "SELECT failure_category, claimed_by, next_attempt_at FROM player_flush_ledger WHERE player_id = $1 AND domain = 'market_storage'",
      [playerA],
    );
    assert.equal(rowA.rows.length, 1);
    assert.equal(rowA.rows[0].failure_category, STALL_CATEGORY);
    assert.equal(rowA.rows[0].claimed_by, null);
    assert.equal(rowA.rows[0].next_attempt_at, null);
    const pendingA = await ledger.countPendingPayloadTasks({ scope: 'player', id: playerA });
    assert.equal(pendingA, 0);
    const reClaimedA = await ledger.claimReadyPlayerFlushTaskGroups({
      workerId: 'startup-stall-smoke:probe',
      limit: 10,
      payloadRequired: true,
      includeDelayed: true,
    });
    assert.equal(reClaimedA.filter((task) => task.id === playerA).length, 0);
    // 人工解除隔离（failure_category 置 NULL）后恢复认领
    await pool.query('UPDATE player_flush_ledger SET failure_category = NULL WHERE player_id = $1', [playerA]);
    const releasedA = await ledger.claimReadyFlushTasks({
      workerId: 'startup-stall-smoke:released',
      scope: 'player',
      id: playerA,
      payloadRequired: true,
      includeDelayed: true,
      limit: 10,
    });
    assert.equal(releasedA.filter((task) => task.id === playerA).length, 1);

    // —— 场景 B：运行期（非 failFast）确定性失败 → 保持指数退避重试，不隔离 ——
    await ledger.upsertFlushTask(buildProjectionTask(playerB, 1));
    const claimedB = await ledger.claimReadyPlayerFlushTaskGroups({
      workerId: 'startup-stall-smoke:cycle',
      limit: 10,
      payloadRequired: true,
      includeDelayed: true,
    });
    const groupB = claimedB.filter((task) => task.id === playerB);
    assert.equal(groupB.length, 1);
    const processedB = await processPlayerTasks(groupB, {});
    assert.equal(processedB, 0);
    const rowB = await pool.query<{
      failure_category: string | null;
      next_attempt_at: Date | null;
    }>(
      "SELECT failure_category, next_attempt_at FROM player_flush_ledger WHERE player_id = $1 AND domain = 'market_storage'",
      [playerB],
    );
    assert.equal(rowB.rows.length, 1);
    assert.equal(rowB.rows[0].failure_category, null);
    assert.ok(rowB.rows[0].next_attempt_at !== null && new Date(rowB.rows[0].next_attempt_at).getTime() > Date.now());
    const pendingB = await ledger.countPendingPayloadTasks({ scope: 'player', id: playerB });
    assert.equal(pendingB, 1);

    console.log(JSON.stringify({
      ok: true,
      processedA,
      processedB,
      answers: '启动重放确定性失败（空覆盖守卫/fence 不完整/非法载荷）会隔离玩家整组 durable payload（failure_category=startup_deterministic_stall）并继续启动，pending 归零、不再被 claim；人工解除隔离后恢复认领。运行期非 failFast 路径保持指数退避重试，不隔离。',
      excludes: '不证明真实生产压测或跨节点故障注入。',
      completionMapping: 'release:proof:stage4.flush-task-startup-stall-quarantine',
    }, null, 2));
  } finally {
    await pool.query('DELETE FROM player_flush_ledger WHERE player_id = ANY($1::varchar[])', [[playerA, playerB]]).catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

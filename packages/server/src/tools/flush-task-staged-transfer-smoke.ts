import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import type { FlushTask } from '../persistence/flush-task.types';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

async function main(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  const previousMode = process.env.SERVER_FLUSH_TASK_RUNTIME_MODE;
  process.env.SERVER_RUNTIME_ROLE = 'api';
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'off';
  try {
    await verifyPlayerSingleFlightAndStagedTransfer();
    await verifyStagingCoalescesHighFrequencyRevisions();
    await verifyShutdownDrainWaitsForStaging();
    await verifyShutdownDrainPropagatesInFlightFailure();
    await verifyFallbackSnapshotExpandsToSingleDomainTasks();
    await verifyProjectionStagingClaimsCompleteRuntimeFence();
    await verifyRejectedLedgerGenerationKeepsDirty();
    await verifyPartiallyAcceptedLedgerGenerationMarksOnlyAccepted();
    await verifyShutdownRetriesSupersededGeneration();
    await verifyHeldInstanceDomainIsNotStaged();
    await verifyCompleteInstancePayloadStaging();
    await verifyStoppedEpochStartupReplay();
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: '统一 staging 已按 generation single-flight，高频修订在内存合并窗口内不重复覆盖 ledger；批量 CAS 只转移实际接受的 dirty 义务，被更新 generation 覆盖的领域会保留并在关机冻结阶段有界重试；玩家投影在 fence 不完整时会先 claim ownership 并重读完整 fence；被 durable 事务 hold 的实例域不会生成竞态 payload；实例覆盖完整 payload 与恢复前 replay。',
    excludes: '不证明真实 PostgreSQL 多进程 claim 竞争；该部分由 flush-ledger DB smoke 覆盖。',
    completionMapping: 'flush-task-staged-transfer',
  }, null, 2));
}

async function verifyHeldInstanceDomainIsNotStaged(): Promise<void> {
  const instanceId = 'held-instance-domain-staging';
  let held = true;
  const staged: FlushTask[] = [];
  const instance = {
    meta: { persistent: true, ownershipEpoch: 3 },
    getPersistenceRevision: () => 1,
    getPersistenceDomainRevision: () => 1,
    getStagedPersistenceDomainRevision: () => 0,
    isPersistenceDomainHeld: (domain: string) => held && domain === 'tile_resource',
    capturePersistenceDomainFlushSnapshot: () => ({
      persistenceRevision: 1,
      domainRevisions: new Map([['tile_resource', 1]]),
      dirtyTileResourceByKey: new Map([['ore', new Set([1])]]),
    }),
    buildTileResourcePersistenceDelta: () => ({
      fullReplace: false,
      upserts: [{ resourceKey: 'ore', tileIndex: 1, value: 3 }],
      deletes: [],
    }),
    markPersistenceDomainsStaged: () => undefined,
  };
  const runtime = new FlushTaskRuntimeService(
    { listUnstagedPlayerDomainRevisions: () => new Map() } as never,
    {
      listDirtyPersistentInstanceDomains: () => [{ instanceId, domains: ['tile_resource'] }],
      getInstanceRuntime: () => instance,
      buildDomainDeltaBatch: () => [{
        instanceId,
        fullReplace: false,
        upserts: [{ resourceKey: 'ore', tileIndex: 1, value: 3 }],
        deletes: [],
        flushSnapshot: instance.capturePersistenceDomainFlushSnapshot(),
      }],
    } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async (tasks: FlushTask[]) => {
        staged.push(...tasks);
        return tasks.length;
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  await runtime.stageDirtyTasksOnce();
  assert.equal(staged.length, 0, 'persistence hold 期间不得把事务前快照写入 ledger');
  held = false;
  await runtime.stageDirtyTasksOnce();
  assert.equal(staged.length, 1, 'hold 释放后仍须正常承接未落库实例域');
}

async function verifyStagingCoalescesHighFrequencyRevisions(): Promise<void> {
  const playerId = 'staging-coalesce-player';
  let playerRevision = 1;
  const playerWrites: FlushTask[][] = [];
  const runtime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => new Map([[playerId, new Map([['technique', playerRevision]])]]),
      getPersistenceRevision: () => playerRevision,
      describePersistencePresence: () => ({
        online: true,
        inWorld: true,
        runtimeOwnerId: 'runtime-owner-coalesce',
        sessionEpoch: 1,
      }),
      buildPersistenceSnapshot: () => ({
        version: 1,
        savedAt: playerRevision,
        placement: { templateId: 'map-1', x: 1, y: 1 },
        techniques: [],
      }),
      markPersistenceDomainsStaged: () => undefined,
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async (tasks: FlushTask[]) => {
        playerWrites.push(tasks);
        return tasks.length;
      },
      countPendingPayloadTasks: async () => 0,
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );
  await runtime.stageDirtyTasksOnce();
  playerRevision = 2;
  await runtime.stageDirtyTasksOnce();
  assert.equal(playerWrites.length, 1, '普通玩家域在合并窗口内不得重复覆盖 ledger');
  await runtime.drainForShutdown();
  assert.equal(playerWrites.length, 2, '关机最终 staging 必须绕过合并窗口');
  assert.equal((playerWrites.at(-1)?.[0]?.payloadJson as { domainRevision?: number }).domainRevision, 2);

  let instanceRevision = 1;
  let instanceHighPriority = false;
  const instanceWrites: FlushTask[][] = [];
  const instanceRuntime = {
    meta: { persistent: true, ownershipEpoch: 3 },
    getPersistenceRevision: () => instanceRevision,
    getPersistenceDomainRevision: () => instanceRevision,
    getStagedPersistenceDomainRevision: () => 0,
    isDirtyDomainHighPriority: () => instanceHighPriority,
    capturePersistenceDomainFlushSnapshot: () => ({
      persistenceRevision: instanceRevision,
      domainRevisions: new Map([['tile_resource', instanceRevision]]),
      dirtyTileResourceByKey: new Map(),
    }),
    markPersistenceDomainsStaged: () => undefined,
  };
  const instanceService = new FlushTaskRuntimeService(
    { listUnstagedPlayerDomainRevisions: () => new Map() } as never,
    {
      listDirtyPersistentInstanceDomains: () => [{ instanceId: 'instance-coalesce', domains: ['tile_resource'] }],
      getInstanceRuntime: () => instanceRuntime,
      buildDomainDeltaBatch: () => [{
        instanceId: 'instance-coalesce',
        upserts: [],
        deletes: [],
        flushSnapshot: instanceRuntime.capturePersistenceDomainFlushSnapshot(),
      }],
    } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async (tasks: FlushTask[]) => {
        instanceWrites.push(tasks);
        return tasks.length;
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );
  await instanceService.stageDirtyTasksOnce();
  instanceRevision = 2;
  await instanceService.stageDirtyTasksOnce();
  assert.equal(instanceWrites.length, 1, '自动地图变化在合并窗口内不得重复覆盖 ledger');
  instanceHighPriority = true;
  await instanceService.stageDirtyTasksOnce();
  assert.equal(instanceWrites.length, 2, '玩家主动高优先级变更必须绕过合并窗口');
}

async function verifyShutdownDrainPropagatesInFlightFailure(): Promise<void> {
  const playerId = 'shutdown-drain-failure-player';
  let ledgerAttempts = 0;
  let firstLedgerStarted = false;
  let releaseFirstLedger: (() => void) | null = null;
  const firstLedgerBlocked = new Promise<void>((resolve) => { releaseFirstLedger = resolve; });
  const runtime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => new Map([[playerId, new Map([['presence', 1]])]]),
      getPersistenceRevision: () => 1,
      describePersistencePresence: () => ({
        online: false,
        inWorld: true,
        runtimeOwnerId: 'runtime-owner-shutdown-failure',
        sessionEpoch: 1,
        versionSeed: 1,
      }),
      markPersistenceDomainsStaged: () => undefined,
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async () => {
        ledgerAttempts += 1;
        if (ledgerAttempts === 1) {
          firstLedgerStarted = true;
          await firstLedgerBlocked;
          throw new Error('in_flight_staging_failed');
        }
        return 1;
      },
      countPendingPayloadTasks: async () => 0,
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  const staging = runtime.stageDirtyTasksOnce();
  const observedStaging = staging.catch((error: unknown) => error);
  await waitUntil(() => firstLedgerStarted);
  const drain = runtime.drainForShutdown();
  releaseFirstLedger?.();
  const stagingError = await observedStaging;
  assert.match(String(stagingError), /in_flight_staging_failed/);
  await assert.rejects(drain, /flush_task_shutdown_drain_failed/);
  assert.equal(ledgerAttempts, 2, 'in-flight 失败后仍应尝试最终 staging，但 drain 必须保持失败语义');
}

async function verifyProjectionStagingClaimsCompleteRuntimeFence(): Promise<void> {
  const playerId = 'staging-claim-fence-player';
  let presence: { online: boolean; inWorld: boolean; runtimeOwnerId: string | null; sessionEpoch: number | null } = {
    online: false,
    inWorld: true,
    runtimeOwnerId: null,
    sessionEpoch: 9,
  };
  let claimCount = 0;
  let stagedTransferCount = 0;
  const staged: FlushTask[] = [];
  const playerRuntime = {
    listUnstagedPlayerDomainRevisions: () => new Map([[playerId, new Map([['inventory', 3]])]]),
    getPersistenceRevision: () => 3,
    describePersistencePresence: () => ({ ...presence }),
    ensureRuntimeOwnershipClaimed: async () => {
      claimCount += 1;
      presence = { ...presence, runtimeOwnerId: 'runtime-owner-claimed', sessionEpoch: 10 };
      return { runtimeOwnerId: presence.runtimeOwnerId, sessionEpoch: presence.sessionEpoch };
    },
    buildPersistenceSnapshot: () => ({
      version: 1,
      savedAt: 3,
      placement: { templateId: 'map-1', x: 1, y: 1 },
      inventory: { items: [{ itemId: 'ore', count: 1 }] },
    }),
    markPersistenceDomainsStaged: () => {
      stagedTransferCount += 1;
    },
  };
  const runtime = new FlushTaskRuntimeService(
    playerRuntime as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async (tasks: FlushTask[]) => {
        staged.push(...tasks);
        return tasks.length;
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );
  await runtime.stageDirtyTasksOnce();
  assert.equal(claimCount, 1);
  assert.equal(stagedTransferCount, 1);
  assert.equal(staged.length, 1);
  assert.equal(staged[0]?.runtimeOwnerId, 'runtime-owner-claimed');
  assert.equal((staged[0]?.payloadJson as { runtimeOwnerId?: unknown }).runtimeOwnerId, 'runtime-owner-claimed');
  assert.equal((staged[0]?.payloadJson as { sessionEpoch?: unknown }).sessionEpoch, 10);

  let failedLedgerWrites = 0;
  let failedStagedTransfers = 0;
  const failedRuntime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => new Map([[playerId, new Map([['inventory', 4]])]]),
      getPersistenceRevision: () => 4,
      describePersistencePresence: () => ({ online: false, inWorld: true, runtimeOwnerId: null, sessionEpoch: 10 }),
      ensureRuntimeOwnershipClaimed: async () => null,
      buildPersistenceSnapshot: playerRuntime.buildPersistenceSnapshot,
      markPersistenceDomainsStaged: () => { failedStagedTransfers += 1; },
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async () => {
        failedLedgerWrites += 1;
        return 0;
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );
  await assert.rejects(
    () => failedRuntime.stageDirtyTasksOnce(),
    /player_flush_staging_runtime_ownership_claim_failed/,
  );
  assert.equal(failedLedgerWrites, 0);
  assert.equal(failedStagedTransfers, 0, 'claim 失败不得把 dirty obligation 转移给 ledger');
}

async function verifyRejectedLedgerGenerationKeepsDirty(): Promise<void> {
  const playerId = 'staging-generation-rejected-player';
  let dirty = true;
  const runtime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => dirty
        ? new Map([[playerId, new Map([['inventory', 5]])]])
        : new Map(),
      getPersistenceRevision: () => 5,
      describePersistencePresence: () => ({
        online: true,
        inWorld: true,
        runtimeOwnerId: 'runtime-owner-generation',
        sessionEpoch: 12,
      }),
      buildPersistenceSnapshot: () => ({
        version: 1,
        savedAt: 5,
        placement: { templateId: 'map-1', x: 1, y: 1 },
        inventory: { items: [{ itemId: 'ore', count: 1 }] },
      }),
      markPersistenceDomainsStaged: () => { dirty = false; },
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async () => 0,
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  await runtime.stageDirtyTasksOnce();
  assert.equal(dirty, true, 'ledger 拒绝 generation 时必须保留 runtime dirty obligation');
}

async function verifyPartiallyAcceptedLedgerGenerationMarksOnlyAccepted(): Promise<void> {
  const playerId = 'staging-generation-partial-player';
  const dirtyDomains = new Set(['inventory', 'technique']);
  let attempts = 0;
  const runtime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => dirtyDomains.size > 0
        ? new Map([[playerId, new Map(Array.from(dirtyDomains, (domain) => [domain, 7] as const))]])
        : new Map(),
      getPersistenceRevision: () => 7,
      describePersistencePresence: () => ({
        online: true,
        inWorld: true,
        runtimeOwnerId: 'runtime-owner-generation-partial',
        sessionEpoch: 13,
      }),
      buildPersistenceSnapshot: () => ({
        version: 1,
        savedAt: 7,
        placement: { templateId: 'map-1', x: 1, y: 1 },
        inventory: { items: [{ itemId: 'ore', count: 1 }] },
        techniques: [],
      }),
      markPersistenceDomainsStaged: (_id: string, revisions: Map<string, number>) => {
        for (const domain of revisions.keys()) {
          dirtyDomains.delete(domain);
        }
      },
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasksDetailed: async (tasks: FlushTask[]) => {
        attempts += 1;
        const acceptedTasks = attempts === 1
          ? tasks.filter((task) => task.domain === 'inventory')
          : tasks;
        return {
          changed: acceptedTasks.length,
          accepted: acceptedTasks.map((task) => ({
            scope: task.scope,
            id: task.id,
            domain: task.domain,
            ownershipEpoch: task.ownershipEpoch ?? null,
          })),
        };
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  await runtime.stageDirtyTasksOnce();
  assert.deepEqual(Array.from(dirtyDomains), ['technique'], '部分 CAS 失败时只允许转移实际接受的领域');
  await runtime.stageDirtyTasksOnce();
  assert.equal(dirtyDomains.size, 0, '被更新 generation 覆盖的领域必须在下一轮重建并转移');
  assert.equal(attempts, 2);
}

async function verifyShutdownRetriesSupersededGeneration(): Promise<void> {
  const playerId = 'shutdown-staging-generation-retry-player';
  let dirty = true;
  let attempts = 0;
  const runtime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => dirty
        ? new Map([[playerId, new Map([['presence', 9]])]])
        : new Map(),
      getPersistenceRevision: () => 9,
      describePersistencePresence: () => ({
        online: false,
        inWorld: true,
        runtimeOwnerId: 'runtime-owner-shutdown-generation',
        sessionEpoch: 14,
        versionSeed: 9,
      }),
      markPersistenceDomainsStaged: () => { dirty = false; },
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasksDetailed: async (tasks: FlushTask[]) => {
        attempts += 1;
        if (attempts === 1) {
          return { changed: 0, accepted: [] };
        }
        return {
          changed: tasks.length,
          accepted: tasks.map((task) => ({
            scope: task.scope,
            id: task.id,
            domain: task.domain,
            ownershipEpoch: task.ownershipEpoch ?? null,
          })),
        };
      },
      countPendingPayloadTasks: async () => 0,
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  await runtime.drainForShutdown();
  assert.equal(attempts, 2, '关机冻结后 generation 被覆盖必须立即重建，不能静默漏刷');
  assert.equal(dirty, false);
}

async function verifyShutdownDrainWaitsForStaging(): Promise<void> {
  const playerId = 'shutdown-drain-staging-player';
  let currentRevision = 1;
  let stagedRevision = 0;
  let releaseLedger: (() => void) | null = null;
  let ledgerStarted = false;
  let ledgerUpsertCount = 0;
  let pendingCountChecks = 0;
  const ledgerBlocked = new Promise<void>((resolve) => { releaseLedger = resolve; });
  const runtime = new FlushTaskRuntimeService(
    {
      listUnstagedPlayerDomainRevisions: () => currentRevision > stagedRevision
        ? new Map([[playerId, new Map([['presence', currentRevision]])]])
        : new Map(),
      getPersistenceRevision: () => currentRevision,
      describePersistencePresence: () => ({
        online: true,
        inWorld: true,
        runtimeOwnerId: 'runtime-owner-shutdown',
        sessionEpoch: 1,
        versionSeed: 1,
      }),
      markPersistenceDomainsStaged: (_id: string, revisions: Map<string, number>) => {
        stagedRevision = Math.max(stagedRevision, revisions.get('presence') ?? 0);
      },
    } as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async () => {
        ledgerUpsertCount += 1;
        ledgerStarted = true;
        if (ledgerUpsertCount === 1) {
          await ledgerBlocked;
        }
        return 1;
      },
      countPendingPayloadTasks: async () => {
        pendingCountChecks += 1;
        return 0;
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );
  const staging = runtime.stageDirtyTasksOnce();
  await waitUntil(() => ledgerStarted);
  let drainCompleted = false;
  const drain = runtime.drainForShutdown().then(() => { drainCompleted = true; });
  await Promise.resolve();
  assert.equal(drainCompleted, false, 'shutdown drain 必须等待当前 staging ledger IO');
  currentRevision = 2;
  releaseLedger?.();
  await Promise.all([staging, drain]);
  assert.equal(drainCompleted, true);
  assert.equal(stagedRevision, 2, 'runtime freeze 后的最终 staging 必须捕获在途 staging 期间产生的新 revision');
  assert.equal(ledgerUpsertCount, 2, 'shutdown drain 必须执行最后一次 staging');
  assert.ok(pendingCountChecks >= 2, 'shutdown drain 必须 replay 并复核 durable payload pending 已归零');
}

async function verifyFallbackSnapshotExpandsToSingleDomainTasks(): Promise<void> {
  const playerId = 'staged-transfer-fallback-player';
  const player = {
    playerId,
    templateId: 'map-1',
    dirtyDomains: new Set<string>(),
    persistentRevision: 2,
    persistedRevision: 1,
    runtimeOwnerId: 'runtime-owner-fallback',
    sessionEpoch: 8,
  };
  const playerRuntime = Object.create(PlayerRuntimeService.prototype) as {
    players: Map<string, typeof player>;
    buildPersistenceSnapshot: () => unknown;
    describePersistencePresence: () => unknown;
    listDirtyPlayerDomains: () => Map<string, Set<string>>;
  };
  playerRuntime.players = new Map([[playerId, player]]);
  playerRuntime.buildPersistenceSnapshot = () => ({
    version: 1,
    savedAt: Date.now(),
    placement: { templateId: 'map-1', x: 1, y: 1 },
  });
  playerRuntime.describePersistencePresence = () => ({
    online: false,
    inWorld: false,
    runtimeOwnerId: player.runtimeOwnerId,
    sessionEpoch: player.sessionEpoch,
    versionSeed: player.persistentRevision,
  });
  const staged: FlushTask[] = [];
  const runtime = new FlushTaskRuntimeService(
    playerRuntime as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    {
      isEnabled: () => true,
      upsertFlushTasks: async (tasks: FlushTask[]) => {
        staged.push(...tasks);
        return tasks.length;
      },
    } as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  await runtime.stageDirtyTasksOnce();
  assert.ok(staged.length > 10, 'fallback snapshot 应展开为全部 projectable 单域 task');
  assert.equal(staged.some((task) => task.domain === 'snapshot'), false);
  assert.equal(staged.every((task) => {
    const payload = task.payloadJson as { projectedDomains?: string[]; stagingDomain?: string };
    return payload.projectedDomains?.length === 1
      && payload.projectedDomains[0] === task.domain
      && payload.stagingDomain === 'snapshot';
  }), true);
  assert.equal(player.persistedRevision, 1);
  assert.equal(playerRuntime.listDirtyPlayerDomains().size, 0, '整组 durable 后 fallback obligation 应转移给 ledger');
  const stagedCount = staged.length;
  await runtime.stageDirtyTasksOnce();
  assert.equal(staged.length, stagedCount, '已转移的 fallback 不得重复 stage');
}

async function verifyPlayerSingleFlightAndStagedTransfer(): Promise<void> {
  const playerId = 'staged-transfer-player';
  const player = {
    playerId,
    templateId: 'map-1',
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
    persistedRevision: 1,
    runtimeOwnerId: 'runtime-owner-1',
    sessionEpoch: 7,
  };
  const playerRuntime = Object.create(PlayerRuntimeService.prototype) as {
    players: Map<string, typeof player>;
    buildPersistenceSnapshot: () => unknown;
    describePersistencePresence: () => unknown;
    markPersistenceDirtyDomains: (target: typeof player, domains: string[]) => void;
    bumpPersistentRevision: (target: typeof player) => void;
    listDirtyPlayerDomains: () => Map<string, Set<string>>;
  };
  playerRuntime.players = new Map([[playerId, player]]);
  playerRuntime.buildPersistenceSnapshot = () => ({
    version: 1,
    savedAt: Date.now(),
    placement: { templateId: 'map-1', x: 1, y: 1 },
    inventory: { items: [{ itemId: 'ore', count: 1 }] },
  });
  playerRuntime.describePersistencePresence = () => ({
    online: true,
    inWorld: true,
    runtimeOwnerId: player.runtimeOwnerId,
    sessionEpoch: player.sessionEpoch,
  });
  playerRuntime.markPersistenceDirtyDomains(player, ['inventory']);
  playerRuntime.bumpPersistentRevision(player);

  const stagedBatches: FlushTask[][] = [];
  let releaseFirstBatch: (() => void) | null = null;
  const firstBatchBlocked = new Promise<void>((resolve) => {
    releaseFirstBatch = resolve;
  });
  const ledger = {
    isEnabled: () => true,
    upsertFlushTasks: async (tasks: FlushTask[]) => {
      stagedBatches.push(tasks);
      if (stagedBatches.length === 1) {
        await firstBatchBlocked;
      }
      return tasks.length;
    },
  };
  const runtime = new FlushTaskRuntimeService(
    playerRuntime as never,
    { listDirtyPersistentInstanceDomains: () => [] } as never,
    { flushPlayerDomains: async () => true } as never,
    ledger as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  const first = runtime.stageDirtyTasksOnce();
  const overlapping = runtime.stageDirtyTasksOnce();
  await waitUntil(() => stagedBatches.length === 1);
  playerRuntime.markPersistenceDirtyDomains(player, ['inventory']);
  playerRuntime.bumpPersistentRevision(player);
  releaseFirstBatch?.();
  await Promise.all([first, overlapping]);

  assert.equal(stagedBatches.length, 1, '重叠 stage 必须复用同一 in-flight 周期');
  assert.deepEqual(Array.from(player.dirtyDomains), ['inventory'], 'staging IO 期间的新同域变更不能被清除');
  assert.equal(player.persistedRevision, 1, 'staged 不能冒充最终 DB persisted');

  await runtime.stageDirtyTasksOnce();
  assert.equal(stagedBatches.length, 2, '并发新修订必须进入下一批');
  assert.deepEqual(Array.from(player.dirtyDomains), [], '第二个捕获修订写入 ledger 后应转移 dirty 义务');
  assert.equal(player.persistedRevision, 1, '义务转移后仍不能推进 persistedRevision');
  assert.equal(playerRuntime.listDirtyPlayerDomains().size, 0, '已 staged 的全局 revision 不能触发 shutdown fallback 重写');

  await runtime.stageDirtyTasksOnce();
  assert.equal(stagedBatches.length, 2, '相同 domain revision 不得重复 upsert');
  const firstTask = stagedBatches[0]?.[0];
  const secondTask = stagedBatches[1]?.[0];
  assert.ok(firstTask && secondTask);
  assert.ok(secondTask.latestRevision > firstTask.latestRevision, 'ledger latestRevision 必须使用单调 projectionVersion');
  assert.equal(firstTask.fencingToken, secondTask.fencingToken, '同一进程/会话的 generation fencing token 必须稳定');
  assert.equal((firstTask.payloadJson as { domainRevision?: number }).domainRevision, 1);
  assert.equal((secondTask.payloadJson as { domainRevision?: number }).domainRevision, 2);
}

async function verifyCompleteInstancePayloadStaging(): Promise<void> {
  const instanceId = 'staged-transfer-instance';
  const dirtyDomains = new Set(['tile_cell', 'temporary_tile', 'ground_item', 'building', 'room', 'fengshui']);
  const domainRevisions = new Map(Array.from(dirtyDomains, (domain) => [domain, 1]));
  const stagedRevisions = new Map<string, number>();
  let containerDirty = true;
  let clearedContainerRevision: number | null = null;
  const instance = {
    meta: { persistent: true, ownershipEpoch: 4 },
    tick: 9,
    getPersistenceRevision: () => 20,
    getPersistenceDomainRevision: (domain: string) => domainRevisions.get(domain) ?? 0,
    getStagedPersistenceDomainRevision: (domain: string) => stagedRevisions.get(domain) ?? 0,
    capturePersistenceDomainFlushSnapshot: (domains: string[]) => ({
      persistenceRevision: 20,
      domainRevisions: new Map(domains.map((domain) => [domain, domainRevisions.get(domain) ?? 0])),
      fullReplaceDomains: new Set(domains),
    }),
    markPersistenceDomainsStaged: (domains: string[], snapshot: { domainRevisions?: Map<string, number> }) => {
      for (const domain of domains) {
        const revision = snapshot.domainRevisions?.get(domain) ?? 0;
        stagedRevisions.set(domain, revision);
        if ((domainRevisions.get(domain) ?? 0) === revision) {
          dirtyDomains.delete(domain);
        }
      }
    },
    buildRuntimeTilePersistenceEntries: () => [{ tileIndex: 1, tileType: 'stone' }],
    buildTemporaryTilePersistenceEntries: () => [{ tileIndex: 2, tileType: 'wall' }],
    buildGroundPersistenceDelta: () => ({ fullReplace: true }),
    buildGroundPersistenceEntries: () => [{ tileIndex: 3, items: [] }],
    buildBuildingRoomFengShuiPersistenceState: () => ({
      buildings: [{ id: 'b1' }],
      rooms: [{ id: 'r1' }],
      fengShui: [{ roomId: 'r1' }],
    }),
  };
  const staged: FlushTask[] = [];
  const ledger = {
    isEnabled: () => true,
    upsertFlushTasks: async (tasks: FlushTask[]) => {
      staged.push(...tasks);
      return tasks.length;
    },
  };
  const worldRuntime = {
    listDirtyPersistentInstanceDomains: () => [{
      instanceId,
      domains: [...dirtyDomains, ...(containerDirty ? ['container_state'] : [])],
    }],
    getInstanceRuntime: () => instance,
    worldRuntimeLootContainerService: {
      getContainerPersistenceRevision: () => 3,
      buildContainerPersistenceStates: () => [{ containerId: 'c1', sourceId: 's1', entries: [] }],
      clearPersisted: (_instanceId: string, expectedRevision: number) => {
        clearedContainerRevision = expectedRevision;
        if (expectedRevision === 3) {
          containerDirty = false;
          return true;
        }
        return false;
      },
    },
  };
  const runtime = new FlushTaskRuntimeService(
    { listUnstagedPlayerDomainRevisions: () => new Map() } as never,
    worldRuntime as never,
    { flushPlayerDomains: async () => true } as never,
    ledger as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  await runtime.stageDirtyTasksOnce();
  assert.deepEqual(staged.map((task) => task.domain), [
    'building',
    'container_state',
    'ground_item',
    'temporary_tile',
    'tile_cell',
  ]);
  assert.equal(staged.every((task) => task.payloadJson !== null), true, '所有真实实例脏域都必须有 durable payload');
  const buildingPayload = staged.find((task) => task.domain === 'building')?.payloadJson as { stagedDomains?: string[] };
  assert.deepEqual(buildingPayload.stagedDomains, ['building', 'fengshui', 'room'], '建筑/房间/风水必须合并为一个任务');
  const groundPayload = staged.find((task) => task.domain === 'ground_item')?.payloadJson as { payload?: { fullReplace?: boolean } };
  assert.equal(groundPayload.payload?.fullReplace, true, 'ground_item fullReplace 必须带完整 durable payload');
  assert.equal(clearedContainerRevision, 3, 'container staged transfer 必须按 expected revision 清 dirty');
  assert.equal(dirtyDomains.size, 0);

  await runtime.stageDirtyTasksOnce();
  assert.equal(staged.length, 5, '已 staged 的实例修订不得重复 upsert');
  const firstTileTask = staged.find((task) => task.domain === 'tile_cell');
  assert.ok(firstTileTask);
  domainRevisions.set('tile_cell', 2);
  dirtyDomains.add('tile_cell');
  await runtime.stageDirtyTasksOnce();
  const tileTasks = staged.filter((task) => task.domain === 'tile_cell');
  assert.equal(tileTasks.length, 2, '单域 revision 增长必须再次 stage');
  assert.ok(
    (tileTasks[1]?.latestRevision ?? 0) > firstTileTask.latestRevision,
    '即使实例全局 persistenceRevision 不变，ledger projectionVersion 也必须严格增长',
  );
  assert.equal(instance.getPersistenceRevision(), 20, '测试期间实例全局 revision 保持不变');
}

async function verifyStoppedEpochStartupReplay(): Promise<void> {
  const instanceId = 'startup-replay-stopped-instance';
  let pending = 1;
  let claimed = false;
  let saved = 0;
  const task: FlushTask = {
    scope: 'instance',
    id: instanceId,
    domain: 'tile_cell',
    priority: 'normal',
    latestRevision: 5,
    ownershipEpoch: 8,
    fencingToken: 'legacy-token',
    claimOwnerId: 'startup-claim',
    payloadJson: {
      kind: 'instance_domain_state',
      domain: 'tile_cell',
      revision: 5,
      payload: [{ tileIndex: 1, tileType: 'stone' }],
    },
  };
  const ledger = {
    isEnabled: () => true,
    countPendingPayloadTasks: async (filter: { scope?: string; id?: string; ownershipEpoch?: number }) => {
      assert.deepEqual(filter, { scope: 'instance', id: instanceId, ownershipEpoch: 8 });
      return pending;
    },
    claimReadyFlushTasks: async (input: { scope: string; id?: string; ownershipEpoch?: number; payloadRequired?: boolean; includeDelayed?: boolean }) => {
      assert.equal(input.scope, 'instance');
      assert.equal(input.id, instanceId);
      assert.equal(input.ownershipEpoch, 8);
      assert.equal(input.payloadRequired, true);
      assert.equal(input.includeDelayed, true);
      if (claimed) return [];
      claimed = true;
      return [task];
    },
    renewFlushTaskClaim: async () => true,
    markFlushTaskFlushed: async () => {
      pending = 0;
      return true;
    },
    markFlushTasksRetry: async () => 0,
    markFlushTaskRetry: async () => true,
  };
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {
      instanceDomainPersistenceService: {
        replaceRuntimeTileCells: async () => { saved += 1; },
        saveInstanceRecoveryWatermark: async () => undefined,
        saveTileDamageDeltaBatch: async () => undefined,
        saveTileResourceDeltaBatch: async () => undefined,
        saveInstanceRecoveryWatermarkBatch: async () => undefined,
      },
      getInstanceRuntime: () => null,
    } as never,
    { flushPlayerDomains: async () => { throw new Error('startup replay cannot use runtime fallback'); } } as never,
    ledger as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      loadInstanceCatalog: async () => ({ status: 'active', runtime_status: 'stopped', ownership_epoch: 8 }),
    } as never,
  );
  const processed = await runtime.replayDurablePayloadsBeforeRecovery({ instanceId, ownershipEpoch: 8 });
  assert.equal(processed, 1);
  assert.equal(saved, 1, '同 ownership epoch 的 stopped catalog payload 必须在 hydrate 前写入真源');
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('wait_until_timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') process.env[name] = value;
  else delete process.env[name];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

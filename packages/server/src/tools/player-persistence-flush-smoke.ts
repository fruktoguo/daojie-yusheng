import assert from 'node:assert/strict';

import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';

function buildSnapshot(savedAt: number): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt,
    placement: {
      instanceId: 'public:yunlai_town',
      templateId: 'yunlai_town',
      x: 12,
      y: 8,
      facing: 2,
    },
    worldPreference: {
      linePreset: 'real',
    },
    vitals: {
      hp: 80,
      maxHp: 100,
      qi: 30,
      maxQi: 100,
    },
    progression: {
      foundation: 2,
      combatExp: 40,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    attrState: undefined,
    unlockedMapIds: ['yunlai_town'],
    inventory: {
      revision: 1,
      capacity: 24,
      items: [{ itemId: 'spirit_stone', count: 5 }],
    },
    equipment: {
      revision: 1,
      slots: [],
    },
    artifacts: {
      revision: 0,
      slots: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    quests: {
      revision: 1,
      entries: [],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleTargetingMode: 'auto',
      retaliatePlayerTargetId: null,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}

function createHarness(durableOperationService: Record<string, unknown> | null = null) {
  const fullProjectionCalls: string[] = [];
  const selectiveProjectionCalls: Array<{
    playerId: string;
    domains: string[];
    allowInventoryEmptyOverwrite?: boolean;
    allowEquipmentEmptyOverwrite?: boolean;
    allowArtifactEmptyOverwrite?: boolean;
    allowBuffEmptyOverwrite?: boolean;
  }> = [];
  const presenceCalls: string[] = [];
  const markedPersisted: string[] = [];
  const workerSubmitCalls: string[] = [];
  const offlineGainCalls: Array<{ playerId: string; payload: unknown; durationMs: number }> = [];
  const assetCoordinatorCalls: string[][] = [];
  const persistenceCallOrder: string[] = [];
  const hydrationByPlayerId = new Map<string, boolean>();
  const recoveryWatermarkByPlayerId = new Map<string, boolean>();
  let offlineGainShouldFail = false;
  let leaseWritable = true;

  const playerRuntimeService = {
    dirtyDomains: new Map<string, Set<string>>(),
    snapshots: new Map<string, PersistedPlayerSnapshot>(),
    offlineGainSessionsByPlayerId: new Map<string, { accumulatedPayload: unknown; accumulatedDurationMs?: number }>(),
    async runExclusiveAssetMutation<T>(playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
      assetCoordinatorCalls.push([...playerIds]);
      return action();
    },
    listDirtyPlayers() {
      return Array.from(this.dirtyDomains.keys());
    },
    listDirtyPlayerDomains() {
      return new Map(
        Array.from(this.dirtyDomains.entries(), ([playerId, domains]) => [playerId, new Set(domains)]),
      );
    },
    buildPersistenceSnapshot(playerId: string) {
      return this.snapshots.get(playerId) ?? null;
    },
    isPlayerHydratedFromPersistence(playerId: string) {
      return hydrationByPlayerId.get(playerId) ?? true;
    },
    markPersisted(playerId: string) {
      markedPersisted.push(playerId);
    },
    describePersistencePresence(playerId: string) {
      return {
        online: true,
        inWorld: true,
        lastHeartbeatAt: 123,
        offlineSinceAt: null,
        runtimeOwnerId: `runtime:${playerId}:1`,
        sessionEpoch: 1,
        transferState: 'idle',
        transferTargetNodeId: null,
        versionSeed: 123,
      };
    },
  };

  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async savePlayerPresence(playerId: string) {
      persistenceCallOrder.push(`presence:${playerId}`);
      presenceCalls.push(playerId);
    },
    async savePlayerSnapshotProjection(playerId: string) {
      fullProjectionCalls.push(playerId);
    },
    async savePlayerSnapshotProjectionDomains(
      playerId: string,
      _snapshot: PersistedPlayerSnapshot,
      domains: Iterable<string>,
      options?: {
        allowInventoryEmptyOverwrite?: boolean;
        allowEquipmentEmptyOverwrite?: boolean;
        allowArtifactEmptyOverwrite?: boolean;
        allowBuffEmptyOverwrite?: boolean;
      },
    ) {
      persistenceCallOrder.push(`projection:${playerId}`);
      selectiveProjectionCalls.push({
        playerId,
        domains: Array.from(domains).sort(),
        allowInventoryEmptyOverwrite: options?.allowInventoryEmptyOverwrite,
        allowEquipmentEmptyOverwrite: options?.allowEquipmentEmptyOverwrite,
        allowArtifactEmptyOverwrite: options?.allowArtifactEmptyOverwrite,
        allowBuffEmptyOverwrite: options?.allowBuffEmptyOverwrite,
      });
    },
    async updatePlayerOfflineGainAccumulated(playerId: string, payload: unknown, durationMs: number) {
      if (offlineGainShouldFail) {
        throw new Error('offline gain write failed');
      }
      offlineGainCalls.push({ playerId, payload, durationMs });
    },
    async hasRecoveryWatermark(playerId: string) {
      return recoveryWatermarkByPlayerId.get(playerId) ?? false;
    },
  };

  const persistenceWorkerPool = {
    isEnabled() {
      return true;
    },
    async submit(taskName: string) {
      workerSubmitCalls.push(taskName);
      return null;
    },
  };

  const service = new PlayerPersistenceFlushService(
    playerRuntimeService as never,
    playerDomainPersistenceService as never,
    persistenceWorkerPool as never,
    undefined,
    undefined,
    undefined,
    undefined,
    durableOperationService as never,
  );
  service.setLeaseGuard({
    isPlayerPersistenceWritable() {
      return leaseWritable;
    },
  });

  return {
    service,
    playerRuntimeService,
    playerDomainPersistenceService,
    fullProjectionCalls,
    selectiveProjectionCalls,
    presenceCalls,
    markedPersisted,
    workerSubmitCalls,
    offlineGainCalls,
    assetCoordinatorCalls,
    persistenceCallOrder,
    setOfflineGainFailure(value: boolean) {
      offlineGainShouldFail = value;
    },
    setLeaseWritable(value: boolean) {
      leaseWritable = value;
    },
    setHydrationState(playerId: string, hydrated: boolean, hasRecoveryWatermark: boolean) {
      hydrationByPlayerId.set(playerId, hydrated);
      recoveryWatermarkByPlayerId.set(playerId, hasRecoveryWatermark);
    },
  };
}

async function testUnresolvedDurableCommitBlocksFlush(): Promise<void> {
  const blockedPlayerId = 'player:durable-unknown';
  const harness = createHarness({
    isPlayerCommitOutcomeUnresolved(playerId: string) {
      return playerId === blockedPlayerId;
    },
  });
  harness.playerRuntimeService.dirtyDomains.set(blockedPlayerId, new Set(['inventory']));
  harness.playerRuntimeService.snapshots.set(blockedPlayerId, buildSnapshot(120_000));

  await assert.rejects(
    harness.service.flushPlayer(blockedPlayerId),
    /player_flush_blocked_by_unresolved_durable_commit/,
  );
  assert.deepEqual(harness.selectiveProjectionCalls, []);
}

async function testOwnershipPresenceFlushPrecedesProjection(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:ownership-rotation-order';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['presence', 'inventory']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(120_500));

  await harness.service.flushPlayer(playerId);

  assert.deepEqual(harness.persistenceCallOrder, [
    `presence:${playerId}`,
    `projection:${playerId}`,
  ]);
}

async function testQueuedCycleRechecksUnresolvedDurableCommitAfterAssetLock(): Promise<void> {
  const blockedPlayerId = 'player:queued-durable-unknown';
  let unresolved = false;
  const harness = createHarness({
    isPlayerCommitOutcomeUnresolved(playerId: string) {
      return playerId === blockedPlayerId && unresolved;
    },
  });
  harness.playerRuntimeService.dirtyDomains.set(blockedPlayerId, new Set(['inventory']));
  harness.playerRuntimeService.snapshots.set(blockedPlayerId, buildSnapshot(125_000));

  let notifyQueued!: () => void;
  const queued = new Promise<void>((resolve) => {
    notifyQueued = resolve;
  });
  let releaseAssetLock!: () => void;
  const assetLock = new Promise<void>((resolve) => {
    releaseAssetLock = resolve;
  });
  harness.playerRuntimeService.runExclusiveAssetMutation = async <T>(
    _playerIds: readonly string[],
    action: () => Promise<T> | T,
  ): Promise<T> => {
    notifyQueued();
    await assetLock;
    return action();
  };

  const flush = harness.service.flushDirtyPlayers();
  await queued;
  unresolved = true;
  releaseAssetLock();
  await flush;

  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.markedPersisted, []);
}

async function testShutdownCycleReportsNestedWorkerFailure(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:shutdown-worker-failure';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(126_000));
  harness.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains = async () => {
    throw new Error('simulated_nested_player_flush_failure');
  };

  await assert.rejects(
    harness.service.flushAllNow(),
    /player_shutdown_flush_failed/,
  );
  assert.deepEqual(harness.markedPersisted, []);
}

async function testShutdownCycleReportsUnresolvedFence(): Promise<void> {
  const playerId = 'player:shutdown-durable-unknown';
  const harness = createHarness({
    isPlayerCommitOutcomeUnresolved(targetPlayerId: string) {
      return targetPlayerId === playerId;
    },
  });
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(127_000));

  await assert.rejects(
    harness.service.flushAllNow(),
    /player_shutdown_flush_failed/,
  );
  assert.deepEqual(harness.selectiveProjectionCalls, []);
}

async function testFlushUsesAssetCoordinator(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:asset-coordinator';
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(902));
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory']));

  await harness.service.flushPlayer(playerId);

  assert.deepEqual(harness.assetCoordinatorCalls, [[playerId]]);
  assert.equal(harness.selectiveProjectionCalls.length, 1);
}

async function testPresenceOnlyFlush(): Promise<void> {
  const harness = createHarness();
  harness.playerRuntimeService.dirtyDomains.set('player:presence', new Set(['presence']));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.presenceCalls, ['player:presence']);
  assert.deepEqual(harness.markedPersisted, ['player:presence']);
  assert.deepEqual(harness.assetCoordinatorCalls, [['player:presence']]);
}

async function testShutdownFlushUsesAssetCoordinator(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:shutdown-coordinator';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(110_000));

  await harness.service.flushAllNow();

  assert.deepEqual(harness.assetCoordinatorCalls, [[playerId]]);
  assert.equal(harness.selectiveProjectionCalls.length, 1);
}

async function testManualFlushRejectsNonHydratedExistingPlayer(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:manual-non-hydrated';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(115_000));
  harness.setHydrationState(playerId, false, true);

  await harness.service.flushPlayer(playerId);

  assert.deepEqual(harness.assetCoordinatorCalls, [[playerId]]);
  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.markedPersisted, []);
}

async function testSelectiveProjectionFlush(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:selective';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory', 'presence']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(120_000));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, [
    {
      playerId,
      domains: ['inventory'],
      allowInventoryEmptyOverwrite: true,
      allowEquipmentEmptyOverwrite: false,
      allowArtifactEmptyOverwrite: false,
      allowBuffEmptyOverwrite: false,
    },
  ]);
  assert.deepEqual(harness.presenceCalls, [playerId]);
  assert.deepEqual(harness.markedPersisted, [playerId]);
}

async function testWalletSelectiveProjectionFlush(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:fallback';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['wallet']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(180_000));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, [
    {
      playerId,
      domains: ['wallet'],
      allowInventoryEmptyOverwrite: false,
      allowEquipmentEmptyOverwrite: false,
      allowArtifactEmptyOverwrite: false,
      allowBuffEmptyOverwrite: false,
    },
  ]);
  assert.deepEqual(harness.presenceCalls, []);
  assert.deepEqual(harness.markedPersisted, [playerId]);
}

async function testBuffSelectiveProjectionAllowsEmptyOverwrite(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:buff-expired';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['buff', 'attr']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(210_000));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, [
    {
      playerId,
      domains: ['attr', 'buff'],
      allowInventoryEmptyOverwrite: false,
      allowEquipmentEmptyOverwrite: false,
      allowArtifactEmptyOverwrite: false,
      allowBuffEmptyOverwrite: true,
    },
  ]);
  assert.deepEqual(harness.presenceCalls, []);
  assert.deepEqual(harness.markedPersisted, [playerId]);
}

async function testEquipmentSelectiveProjectionAllowsEmptyOverwrite(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:all-equipment-unequipped';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['equipment', 'attr']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(220_000));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, [
    {
      playerId,
      domains: ['attr', 'equipment'],
      allowInventoryEmptyOverwrite: false,
      allowEquipmentEmptyOverwrite: true,
      allowArtifactEmptyOverwrite: false,
      allowBuffEmptyOverwrite: false,
    },
  ]);
  assert.deepEqual(harness.presenceCalls, []);
  assert.deepEqual(harness.markedPersisted, [playerId]);
}

async function testLeaseGuardBlocksFlush(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:lease-guard';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['presence']));
  harness.setLeaseWritable(false);

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.presenceCalls, []);
  assert.deepEqual(harness.markedPersisted, []);
}

async function testSnapshotFallbackDomainRejected(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:snapshot-domain';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['snapshot']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(240_000));

  await assert.rejects(
    () => harness.service.flushPlayer(playerId),
    /player_domain_delta_required:player:snapshot-domain:snapshot/,
  );
  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.presenceCalls, []);
  assert.deepEqual(harness.markedPersisted, []);
}

async function testOfflineGainFlushRunsWithoutDirtyPlayers(): Promise<void> {
  const harness = createHarness();
  harness.playerRuntimeService.offlineGainSessionsByPlayerId.set('player:offline', {
    accumulatedPayload: { progress: 12 },
    accumulatedDurationMs: 60_000,
  });

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.markedPersisted, []);
  assert.deepEqual(harness.offlineGainCalls, [
    { playerId: 'player:offline', payload: { progress: 12 }, durationMs: 60_000 },
  ]);
}

async function testOfflineGainShutdownFlushFailureBubbles(): Promise<void> {
  const harness = createHarness();
  harness.playerRuntimeService.offlineGainSessionsByPlayerId.set('player:offline-fail', {
    accumulatedPayload: { progress: 99 },
    accumulatedDurationMs: 120_000,
  });
  harness.setOfflineGainFailure(true);

  await assert.rejects(
    () => harness.service.flushAllNow(),
    /offline_gain_flush_failed:player:offline-fail/,
  );
  assert.deepEqual(harness.offlineGainCalls, []);
}

async function testWorkerPoolSubmitIsNotUsed(): Promise<void> {
  const harness = createHarness();
  const playerId = 'player:worker-submit-removed';
  harness.playerRuntimeService.dirtyDomains.set(playerId, new Set(['inventory', 'presence']));
  harness.playerRuntimeService.snapshots.set(playerId, buildSnapshot(260_000));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.workerSubmitCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, [
    {
      playerId,
      domains: ['inventory'],
      allowInventoryEmptyOverwrite: true,
      allowEquipmentEmptyOverwrite: false,
      allowArtifactEmptyOverwrite: false,
      allowBuffEmptyOverwrite: false,
    },
  ]);
}

async function main(): Promise<void> {
  await testFlushUsesAssetCoordinator();
  await testPresenceOnlyFlush();
  await testShutdownFlushUsesAssetCoordinator();
  await testManualFlushRejectsNonHydratedExistingPlayer();
  await testSelectiveProjectionFlush();
  await testWalletSelectiveProjectionFlush();
  await testBuffSelectiveProjectionAllowsEmptyOverwrite();
  await testEquipmentSelectiveProjectionAllowsEmptyOverwrite();
  await testLeaseGuardBlocksFlush();
  await testSnapshotFallbackDomainRejected();
  await testOfflineGainFlushRunsWithoutDirtyPlayers();
  await testOfflineGainShutdownFlushFailureBubbles();
  await testWorkerPoolSubmitIsNotUsed();
  await testUnresolvedDurableCommitBlocksFlush();
  await testOwnershipPresenceFlushPrecedesProjection();
  await testQueuedCycleRechecksUnresolvedDurableCommitAfterAssetLock();
  await testShutdownCycleReportsNestedWorkerFailure();
  await testShutdownCycleReportsUnresolvedFence();

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'PlayerPersistenceFlushService 现已先进入玩家资产串行器再拍快照，并只写玩家分域表：presence-only 直写、同一玩家本轮受支持脏域通过一次事务批量提交、wallet 分域投影；批量内部逐域比较 watermark，运行时 inventory/equipment/buff dirty flush 显式允许最后一行正常清空，snapshot fallback 脏域会硬失败，lease 失效时不会继续提交；离线收益累积即使没有普通 dirty player 也会刷新，shutdown 失败会冒泡。',
        completionMapping: 'release:proof:with-db.player-persistence-flush-strategy',
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

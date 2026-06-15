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

function createHarness() {
  const fullProjectionCalls: string[] = [];
  const selectiveProjectionCalls: Array<{
    playerId: string;
    domains: string[];
    allowInventoryEmptyOverwrite?: boolean;
    allowEquipmentEmptyOverwrite?: boolean;
    allowBuffEmptyOverwrite?: boolean;
  }> = [];
  const presenceCalls: string[] = [];
  const markedPersisted: string[] = [];
  const workerSubmitCalls: string[] = [];
  let leaseWritable = true;

  const playerRuntimeService = {
    dirtyDomains: new Map<string, Set<string>>(),
    snapshots: new Map<string, PersistedPlayerSnapshot>(),
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
        allowBuffEmptyOverwrite?: boolean;
      },
    ) {
      selectiveProjectionCalls.push({
        playerId,
        domains: Array.from(domains).sort(),
        allowInventoryEmptyOverwrite: options?.allowInventoryEmptyOverwrite,
        allowEquipmentEmptyOverwrite: options?.allowEquipmentEmptyOverwrite,
        allowBuffEmptyOverwrite: options?.allowBuffEmptyOverwrite,
      });
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
  );
  service.setLeaseGuard({
    isPlayerPersistenceWritable() {
      return leaseWritable;
    },
  });

  return {
    service,
    playerRuntimeService,
    fullProjectionCalls,
    selectiveProjectionCalls,
    presenceCalls,
    markedPersisted,
    workerSubmitCalls,
    setLeaseWritable(value: boolean) {
      leaseWritable = value;
    },
  };
}

async function testPresenceOnlyFlush(): Promise<void> {
  const harness = createHarness();
  harness.playerRuntimeService.dirtyDomains.set('player:presence', new Set(['presence']));

  await harness.service.flushDirtyPlayers();

  assert.deepEqual(harness.fullProjectionCalls, []);
  assert.deepEqual(harness.selectiveProjectionCalls, []);
  assert.deepEqual(harness.presenceCalls, ['player:presence']);
  assert.deepEqual(harness.markedPersisted, ['player:presence']);
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
      allowBuffEmptyOverwrite: false,
    },
  ]);
}

async function main(): Promise<void> {
  await testPresenceOnlyFlush();
  await testSelectiveProjectionFlush();
  await testWalletSelectiveProjectionFlush();
  await testBuffSelectiveProjectionAllowsEmptyOverwrite();
  await testEquipmentSelectiveProjectionAllowsEmptyOverwrite();
  await testLeaseGuardBlocksFlush();
  await testSnapshotFallbackDomainRejected();
  await testWorkerPoolSubmitIsNotUsed();

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'PlayerPersistenceFlushService 现已只写玩家分域表：presence-only 直写、受支持脏域 selective projection、wallet 分域投影；运行时 inventory/equipment/buff dirty flush 显式允许最后一行正常清空，snapshot fallback 脏域会硬失败，lease 失效时不会继续提交。',
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

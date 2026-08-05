import assert from 'node:assert/strict';

import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  await testIdlePlayersSkipCraftPipeline();
  await testCraftBatchKeepsPerPlayerIsolation();
  await testCraftTickRecordsFixedPerformanceDimensions();
  await testStatisticDiffOnlyRunsForRealMutation();
  await testBuildingStatisticFastPathMatchesFullDiff();

  console.log(JSON.stringify({
    ok: true,
    cases: ['idle_players_skip_craft_pipeline', 'active_and_queued_players_are_selected', 'batched_craft_tick_keeps_player_isolation', 'craft_tick_records_fixed_performance_dimensions', 'unchanged_tick_skips_statistics_diff', 'statistic_signal_records_diff', 'async_tick_records_after_resolution', 'building_statistic_fast_path_matches_full_diff'],
  }, null, 2));
}

async function testIdlePlayersSkipCraftPipeline(): Promise<void> {
  const players = new Map<string, Record<string, unknown>>([
    ['player:craft-idle', { playerId: 'player:craft-idle', techniqueActivityQueue: [] }],
    ['player:craft-active', { playerId: 'player:craft-active', miningJob: { remainingTicks: 3 } }],
    ['player:craft-queued', { playerId: 'player:craft-queued', techniqueActivityQueue: [{ queueId: 'queue:1' }] }],
  ]);
  let activeKindReads = 0;
  let contextBuilds = 0;
  let compatibilityChecks = 0;
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer: (playerId: string) => players.get(playerId) ?? null,
    } as never,
    {
      ensureAlchemyLikeActiveJobResourceCompatibilityMutation: () => {
        compatibilityChecks += 1;
        return { ok: true };
      },
      listActiveTechniqueActivityKinds: () => {
        activeKindReads += 1;
        return [];
      },
      hasAnyActiveTechniqueActivity: () => false,
      buildPipelineContext: () => {
        contextBuilds += 1;
        return {};
      },
    } as never,
    { flushCraftMutation() {} } as never,
  );

  assert.deepEqual(
    service.listTickablePlayerIds([...players.keys(), 'player:missing']),
    ['player:craft-active', 'player:craft-queued'],
  );
  await service.advanceCraftJobs(['player:craft-idle'], {});
  assert.equal(activeKindReads, 0);
  assert.equal(contextBuilds, 0);
  assert.equal(compatibilityChecks, 0);
}

async function testStatisticDiffOnlyRunsForRealMutation(): Promise<void> {
  const player = { playerId: 'player:technique-statistics-hotpath' };
  let captureCount = 0;
  let recordCount = 0;
  const statisticOptions: unknown[] = [];
  let nextResult: unknown = buildResult();
  const service: any = Object.create(CraftPanelRuntimeService.prototype);
  service.pipeline = {
    hasStrategy: () => true,
    tick: () => nextResult,
  };
  service.playerRuntimeService = {
    captureOfflineGainBeforeTick: () => ({ snapshot: ++captureCount }),
    recordAssetStatisticMutation: (...args: unknown[]) => {
      recordCount += 1;
      statisticOptions.push(args[3]);
    },
  };

  const unchanged = service.tickTechniqueActivity(player, 'mining');
  assert.equal((unchanged as { ok?: boolean }).ok, true);
  assert.equal(recordCount, 0, '纯 active_job 进度不应触发全量统计差分');

  nextResult = buildResult({ attrChanged: true });
  service.tickTechniqueActivity(player, 'transmission');
  assert.equal(recordCount, 1, '职业经验变化必须进入统计差分');
  assert.equal(statisticOptions[0], undefined, '非建造技艺继续使用原统计路径');

  nextResult = Promise.resolve(buildResult({ inventoryChanged: true }));
  await service.tickTechniqueActivity(player, 'gather');
  assert.equal(recordCount, 2, '异步技艺结算完成后必须补记统计差分');
  assert.equal(statisticOptions[1], undefined, '带背包变化的技艺不能走职业专用路径');

  nextResult = buildResult({ attrChanged: true, craftRealmExpGain: 1 });
  service.tickTechniqueActivity(player, 'building');
  assert.equal(recordCount, 3, '建造职业经验变化必须进入统计差分');
  assert.deepEqual(statisticOptions[2], { progressionAndProfessionOnly: true });
  assert.equal(captureCount, 7);

}

async function testBuildingStatisticFastPathMatchesFullDiff(): Promise<void> {
  const fast = createStatisticService();
  const reference = createStatisticService();
  const fastPlayer = createStatisticPlayer('player:building-stat-fast');
  const referencePlayer = structuredClone(fastPlayer);
  referencePlayer.playerId = 'player:building-stat-reference';

  const fastBefore = fast.captureOfflineGainBeforeTick(fastPlayer);
  const referenceBefore = reference.captureOfflineGainBeforeTick(referencePlayer);
  fast.offlineGainSessionsByPlayerId.set(fastPlayer.playerId, createOfflineStatisticSession(fastBefore));
  reference.offlineGainSessionsByPlayerId.set(referencePlayer.playerId, createOfflineStatisticSession(referenceBefore));

  for (const player of [fastPlayer, referencePlayer]) {
    player.realm.progress += 17;
    player.foundation += 3;
    player.buildingSkill.exp += 4;
  }

  fast.recordAssetStatisticMutation(fastPlayer, fastBefore, undefined, { progressionAndProfessionOnly: true });
  reference.recordAssetStatisticMutation(referencePlayer, referenceBefore);

  assert.deepEqual(
    normalizeComparable(projectStatisticSnapshot(fast.playerStatisticSnapshotsByPlayerId.get(fastPlayer.playerId))),
    normalizeComparable(projectStatisticSnapshot(reference.playerStatisticSnapshotsByPlayerId.get(referencePlayer.playerId))),
  );
  assert.deepEqual(
    normalizeComparable(fast.offlineGainSessionsByPlayerId.get(fastPlayer.playerId).accumulatedPayload),
    normalizeComparable(reference.offlineGainSessionsByPlayerId.get(referencePlayer.playerId).accumulatedPayload),
  );

  const onlineFast = createStatisticService();
  const onlineReference = createStatisticService();
  const onlineFastPlayer = createStatisticPlayer('player:building-stat-online-fast');
  const onlineReferencePlayer = structuredClone(onlineFastPlayer);
  onlineReferencePlayer.playerId = 'player:building-stat-online-reference';
  onlineFastPlayer.sessionId = 'session:building-stat-online-fast';
  onlineReferencePlayer.sessionId = 'session:building-stat-online-reference';
  const onlineFastBefore = onlineFast.captureOfflineGainBeforeTick(onlineFastPlayer);
  const onlineReferenceBefore = onlineReference.captureOfflineGainBeforeTick(onlineReferencePlayer);
  for (const player of [onlineFastPlayer, onlineReferencePlayer]) {
    player.realm.progress += 9;
    player.buildingSkill.exp += 2;
  }
  onlineFast.recordAssetStatisticMutation(
    onlineFastPlayer,
    onlineFastBefore,
    undefined,
    { progressionAndProfessionOnly: true },
  );
  onlineReference.recordAssetStatisticMutation(onlineReferencePlayer, onlineReferenceBefore);
  assert.deepEqual(
    normalizeComparable(onlineFast.onlineStatisticDeltas),
    normalizeComparable(onlineReference.onlineStatisticDeltas),
  );

  const protectedPlayer = createStatisticPlayer('player:building-stat-no-scan');
  const protectedService = createStatisticService();
  const protectedBefore = protectedService.captureOfflineGainBeforeTick(protectedPlayer);
  protectedPlayer.inventory.items = new Proxy(protectedPlayer.inventory.items, {
    get(target, property, receiver) {
      if (property === Symbol.iterator || property === 'map' || property === 'forEach') {
        throw new Error('building_profession_fast_path_traversed_inventory');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  protectedPlayer.techniques.techniques = new Proxy(protectedPlayer.techniques.techniques, {
    get(target, property, receiver) {
      if (property === Symbol.iterator || property === 'map' || property === 'forEach') {
        throw new Error('building_profession_fast_path_traversed_techniques');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  protectedPlayer.buildingSkill.exp += 1;
  protectedService.recordAssetStatisticMutation(
    protectedPlayer,
    protectedBefore,
    undefined,
    { progressionAndProfessionOnly: true },
  );
}

function createStatisticService(): any {
  const service: any = Object.create(PlayerRuntimeService.prototype);
  service.playerStatisticSnapshotsByPlayerId = new Map();
  service.offlineGainSessionsByPlayerId = new Map();
  service.playerStatisticTickContextsByPlayerId = new Map();
  service.assetMutationContext = { getStore: () => null };
  service.contentTemplateRepository = null;
  service.playerProgressionService = {
    getRealmRuntimeExpToNext: (level: number) => 1000 + Math.max(1, Math.floor(Number(level) || 1)),
  };
  service.onlineStatisticDeltas = [];
  service.recordPlayerStatisticTotals = (_playerId: string, delta: unknown) => {
    service.onlineStatisticDeltas.push(delta);
  };
  service.queueOnlinePlayerStatisticReport = (_playerId: string, _player: unknown, delta: unknown) => {
    service.onlineStatisticDeltas.push(delta);
  };
  return service;
}

function createStatisticPlayer(playerId: string): any {
  return {
    playerId,
    sessionId: null,
    realm: { realmLv: 35, progress: 12345, progressToNext: 99999 },
    foundation: 100,
    rootFoundation: 50,
    combatExp: 200,
    bodyTraining: { level: 10, exp: 20, expToNext: 100 },
    techniques: {
      techniques: Array.from({ length: 200 }, (_, index) => ({
        techId: `tech:${index}`,
        name: `功法${index}`,
        level: 20,
        exp: index,
        expToNext: 1000,
      })),
    },
    inventory: {
      items: Array.from({ length: 200 }, (_, index) => ({
        itemId: `item:${index}`,
        name: `物品${index}`,
        count: 1,
      })),
      lockedItems: [],
    },
    alchemySkill: { level: 10, exp: 1, expToNext: 100 },
    forgingSkill: { level: 11, exp: 2, expToNext: 110 },
    buildingSkill: { level: 12, exp: 3, expToNext: 120 },
    gatherSkill: { level: 13, exp: 4, expToNext: 130 },
    enhancementSkill: { level: 14, exp: 5, expToNext: 140 },
    miningSkill: { level: 15, exp: 6, expToNext: 150 },
  };
}

function createOfflineStatisticSession(baselinePayload: unknown): any {
  return {
    startedAt: Date.now() - 10_000,
    baselinePayload,
    accumulatedPayload: {
      spiritStones: { gained: 0, lost: 0, net: 0 },
      items: [],
      progress: [],
      techniques: [],
      professions: [],
    },
    accumulatedDurationMs: 0,
  };
}

function projectStatisticSnapshot(snapshot: any): unknown {
  if (!snapshot) {
    return null;
  }
  return {
    inventoryItems: snapshot.inventoryItems,
    realm: snapshot.realm,
    foundation: snapshot.foundation,
    rootFoundation: snapshot.rootFoundation,
    combatExp: snapshot.combatExp,
    bodyTraining: snapshot.bodyTraining,
    techniques: snapshot.techniques,
    professions: snapshot.professions,
  };
}

function normalizeComparable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

async function testCraftBatchKeepsPerPlayerIsolation(): Promise<void> {
  const players = new Map([
    ['player:craft-fail', { playerId: 'player:craft-fail', miningJob: { remainingTicks: 1 } }],
    ['player:craft-ok', { playerId: 'player:craft-ok', miningJob: { remainingTicks: 1 } }],
  ]);
  const ticked: string[] = [];
  const flushed: string[] = [];
  const notices: string[] = [];
  const warnings: string[] = [];
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer: (playerId: string) => players.get(playerId) ?? null,
      runtimeEventBusService: null,
    } as never,
    {
      listActiveTechniqueActivityKinds: () => ['mining'],
      hasAnyActiveTechniqueActivity: () => true,
      tickTechniqueActivity: (player: { playerId: string }) => {
        ticked.push(player.playerId);
        if (player.playerId === 'player:craft-fail') {
          throw new Error('expected craft failure');
        }
        return buildResult({ panelChanged: true });
      },
      buildPipelineContext: () => ({}),
    } as never,
    {
      flushCraftMutation: (playerId: string) => flushed.push(playerId),
    } as never,
  );
  (service as any).logger = { error() {}, warn(message: string) { warnings.push(message); } };

  await service.advanceCraftJobs([...players.keys()], {
    queuePlayerNotice: (playerId: string) => {
      notices.push(playerId);
      return Promise.reject(new Error('expected notice failure'));
    },
  });
  await Promise.resolve();

  assert.deepEqual(ticked, ['player:craft-fail', 'player:craft-ok']);
  assert.deepEqual(flushed, ['player:craft-ok']);
  assert.deepEqual(notices, ['player:craft-fail']);
  assert.equal(warnings.length, 1, '异步通知失败必须被捕获，不能形成 unhandledRejection');
}

async function testCraftTickRecordsFixedPerformanceDimensions(): Promise<void> {
  const players = new Map([
    ['player:craft-sync', { playerId: 'player:craft-sync', miningJob: { remainingTicks: 2 } }],
    ['player:craft-async', { playerId: 'player:craft-async', enhancementJob: { remainingTicks: 1 } }],
  ]);
  const perfCounts = new Map<string, number>();
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer: (playerId: string) => players.get(playerId) ?? null,
    } as never,
    {
      ensureAlchemyLikeActiveJobResourceCompatibilityMutation: () => ({ ok: true }),
      listActiveTechniqueActivityKinds: (player: { playerId: string }) => (
        player.playerId === 'player:craft-sync' ? ['mining'] : ['enhancement']
      ),
      hasAnyActiveTechniqueActivity: () => true,
      tickTechniqueActivity: () => buildResult(),
      tickEnhancementDurably: () => Promise.resolve(buildResult({ inventoryChanged: true })),
    } as never,
    { flushCraftMutation() {} } as never,
  );

  await service.advanceCraftJobs(
    [...players.keys()],
    {},
    undefined,
    (key: string, durationMs: number, count = 1) => {
      assert.equal(Number.isFinite(durationMs) && durationMs >= 0, true);
      perfCounts.set(key, (perfCounts.get(key) ?? 0) + count);
    },
  );

  assert.equal(perfCounts.get('instance.craftJob.compatibilityMs'), 2);
  assert.equal(perfCounts.get('instance.craftJob.activeKindPlanMs'), 2);
  assert.equal(perfCounts.get('instance.craftJob.miningMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.enhancementMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.syncAdvanceMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.asyncBoundaryMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.progressOnlyMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.assetMutationMs'), 1);
  assert.equal(perfCounts.get('instance.craftJob.mutationFlushMs'), 2);
  assert.equal(perfCounts.has('instance.craftJob.queueAdvanceMs'), false);
}

function buildResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    panelChanged: false,
    inventoryChanged: false,
    equipmentChanged: false,
    attrChanged: false,
    craftRealmExpGain: 0,
    messages: [],
    groundDrops: [],
    ...overrides,
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

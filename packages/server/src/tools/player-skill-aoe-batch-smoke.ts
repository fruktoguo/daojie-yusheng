import assert from 'node:assert/strict';

import {
  Direction,
  TileType,
  createNumericRatioDivisors,
  createNumericStats,
  decodeMessage,
  encodeMessage,
  fromWireTick,
  tickPayloadType,
  toWireTick,
} from '@mud/shared';

import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { WorldRuntimeCombatActionService } from '../runtime/world/combat/world-runtime-combat-action.service';
import { WorldRuntimePlayerSkillDispatchService } from '../runtime/world/combat/world-runtime-player-skill-dispatch.service';
import { shouldAggregatePlayerSkillPresentation } from '../runtime/world/combat/player-skill-cast-summary.helpers';
import { applyMiningExpForTileDamage, applyMiningExpForTileDamageBatch, spawnTileDrops } from '../runtime/world/combat/tile-drop.helpers';
import {
  createTileCombatAttributes,
  createTileCombatNumericStats,
  createTileCombatRatioDivisors,
} from '../runtime/world/query/world-runtime.observation.helpers';

const MAP_SIZE = 21;
const TARGET_COUNT = MAP_SIZE * MAP_SIZE;

function createMapInstance(rows: string[], instanceId: string): MapInstanceRuntime {
  const height = rows.length;
  const width = Array.from(rows[0] ?? '').length;
  const cellCount = width * height;
  return new MapInstanceRuntime({
    instanceId,
    template: {
      id: `${instanceId}:template`,
      name: '多目标地块批量 Smoke',
      width,
      height,
      terrainRows: rows,
      walkableMask: Uint8Array.from({ length: cellCount }, () => 0),
      blocksSightMask: Uint8Array.from({ length: cellCount }, () => 1),
      portalIndexByTile: Int32Array.from({ length: cellCount }, () => -1),
      safeZoneMask: Uint8Array.from({ length: cellCount }, () => 0),
      baseAuraByTile: Int32Array.from({ length: cellCount }, () => 0),
      baseTileResourceEntries: [],
      npcs: [],
      landmarks: [],
      containers: [],
      safeZones: [],
      portals: [],
      spawnX: Math.floor(width / 2),
      spawnY: Math.floor(height / 2),
      source: { mapLv: 1 },
    },
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '多目标地块批量 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function createCaster(skill: any, instanceId: string): any {
  const numericStats = createNumericStats();
  numericStats.maxHp = 1_000;
  numericStats.maxQi = 1_000;
  numericStats.physAtk = 10;
  numericStats.spellAtk = 100;
  numericStats.maxQiOutputPerTick = 1_000;
  numericStats.viewRange = 30;
  return {
    playerId: 'player:aoe-batch',
    sessionId: 'session:aoe-batch',
    instanceId,
    x: Math.floor(MAP_SIZE / 2),
    y: Math.floor(MAP_SIZE / 2),
    facing: Direction.East,
    selfRevision: 1,
    persistentRevision: 1,
    hp: 1_000,
    maxHp: 1_000,
    qi: 1_000,
    maxQi: 1_000,
    combatExp: 0,
    realmLv: 1,
    realm: { realmLv: 1 },
    attrs: {
      revision: 1,
      finalAttrs: {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        strength: 0,
        meridians: 0,
      },
      numericStats,
      ratioDivisors: createNumericRatioDivisors(),
      craftEffectStats: {},
    },
    buffs: { revision: 1, buffs: [] },
    combat: { cooldownReadyTickBySkillId: {}, combatAttackIntensity: 10 },
    actions: { revision: 1, actions: [{ id: skill.id, type: 'skill', skillEnabled: true }] },
    techniques: {
      revision: 1,
      techniques: [{ techId: 'technique.aoe_batch', level: 1, skills: [skill] }],
    },
    equipment: { revision: 1, slots: [] },
    inventory: { revision: 1, items: [] },
  };
}

function createRuntimeHarness(attacker: any, instance: MapInstanceRuntime) {
  let currentTick = 1;
  const actionLabels: any[] = [];
  const combatEffects: any[] = [];
  const attackEffects: any[] = [];
  const damageFloats: any[] = [];
  const resolutionFloats: any[] = [];
  const notices: any[] = [];
  const combatOutcomes: any[] = [];
  const receivedItems: any[] = [];
  const sectionDurations = new Map<string, { totalMs: number; count: number }>();
  const playerRuntimeService = {
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, attacker.playerId);
      return attacker;
    },
    getPlayer(playerId: string) {
      return playerId === attacker.playerId ? attacker : null;
    },
    listPlayerSnapshots() {
      return [attacker];
    },
    recordActivity() {},
    markPersistenceDirtyDomains(target: any, domains: string[]) {
      target.dirtyDomains = new Set([...(target.dirtyDomains ?? []), ...domains]);
    },
    bumpPersistentRevision(target: any) {
      target.persistentRevision = Math.max(0, Math.trunc(Number(target.persistentRevision) || 0)) + 1;
    },
    spendQi(_playerId: string, amount: number) {
      attacker.qi -= amount;
    },
    setSkillCooldownReadyTick(_playerId: string, skillId: string, readyTick: number) {
      attacker.combat.cooldownReadyTickBySkillId[skillId] = readyTick;
    },
    receiveInventoryItem(_playerId: string, item: any) {
      receivedItems.push(item);
    },
  };
  const playerCombatService = new PlayerCombatService(playerRuntimeService as any);
  const castSkillToMonster = playerCombatService.castSkillToMonster.bind(playerCombatService);
  let castSkillToMonsterCount = 0;
  playerCombatService.castSkillToMonster = (castAttacker, target, skillId, currentTick, distance, applyTargetBuff, options) => {
    castSkillToMonsterCount += 1;
    return castSkillToMonster(castAttacker, target, skillId, currentTick, distance, applyTargetBuff, options);
  };
  const dispatchService = new WorldRuntimePlayerSkillDispatchService(
    playerRuntimeService as any,
    playerCombatService as any,
    new WorldRuntimeCombatActionService(),
  );
  const deps = {
    resolveCurrentTickForPlayerId() {
      return currentTick;
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      assert.equal(instanceId, instance.meta.instanceId);
      return instance;
    },
    playerRuntimeService,
    combatOutcomes,
    logger: { debug() {}, log() {}, warn() {}, error() {} },
    queuePlayerNotice(playerId: string, text: string, kind: string, castId: string, combat: any, structured: any) {
      notices.push({ playerId, text, kind, castId, combat, structured });
    },
    pushActionLabelEffect(instanceId: string, x: number, y: number, text: string) {
      actionLabels.push({ instanceId, x, y, text });
    },
    pushCombatEffect(instanceId: string, effect: any) {
      combatEffects.push({ instanceId, effect });
    },
    pushAttackEffect(...args: any[]) {
      attackEffects.push(args);
    },
    pushDamageFloatEffect(...args: any[]) {
      damageFloats.push(args);
    },
    pushCombatTextFloatEffect(...args: any[]) {
      resolutionFloats.push(args);
    },
    worldRuntimeFormationService: {
      mitigateTerrainDamage(_instanceId: string, _x: number, _y: number, damage: number) {
        return damage;
      },
    },
    worldRuntimeSectService: {},
    recordPendingCommandSectionDuration(key: string, durationMs: number, count = 1) {
      const current = sectionDurations.get(key) ?? { totalMs: 0, count: 0 };
      current.totalMs += Math.max(0, Number(durationMs) || 0);
      current.count += Math.max(0, Math.trunc(Number(count) || 0));
      sectionDurations.set(key, current);
    },
  };
  return {
    playerCombatService,
    dispatchService,
    deps,
    actionLabels,
    combatEffects,
    attackEffects,
    damageFloats,
    resolutionFloats,
    notices,
    combatOutcomes,
    receivedItems,
    sectionDurations,
    getCastSkillToMonsterCount() {
      return castSkillToMonsterCount;
    },
    resetCastSkillToMonsterCount() {
      castSkillToMonsterCount = 0;
    },
    setCurrentTick(value: number) {
      currentTick = value;
    },
    clearPresentation() {
      actionLabels.length = 0;
      combatEffects.length = 0;
      attackEffects.length = 0;
      damageFloats.length = 0;
      resolutionFloats.length = 0;
      notices.length = 0;
    },
  };
}

function createTileTargets(): Array<{ kind: 'tile'; x: number; y: number }> {
  const targets: Array<{ kind: 'tile'; x: number; y: number }> = [];
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      targets.push({ kind: 'tile', x, y });
    }
  }
  return targets;
}

function testDamageAggregationBoundary(): void {
  assert.equal(shouldAggregatePlayerSkillPresentation(8, [{ type: 'damage' }]), false);
  assert.equal(shouldAggregatePlayerSkillPresentation(9, [{ type: 'damage' }]), true);
  assert.equal(shouldAggregatePlayerSkillPresentation(9, [{ type: 'buff' }]), false);
}

function testSkillTargetPlanReusesCategoryRelationResolution(): void {
  const skill = {
    id: 'skill.target-relation-cache',
    name: '关系缓存测试术',
    range: 2,
    targeting: { range: 2, shape: 'area', radius: 1, maxTargets: 9 },
    effects: [{ type: 'damage', damageKind: 'spell', formula: 1 }],
  };
  const instance = createMapInstance(['LLL', 'LLL', 'LLL'], 'instance:target-relation-cache');
  const attacker = createCaster(skill, instance.meta.instanceId);
  attacker.x = 1;
  attacker.y = 1;
  let targetingRulesReadCount = 0;
  Object.defineProperty(attacker.combat, 'combatTargetingRules', {
    configurable: true,
    get() {
      targetingRulesReadCount += 1;
      return { hostile: ['terrain'], friendly: [] };
    },
  });
  const harness = createRuntimeHarness(attacker, instance);

  const targets = harness.dispatchService.collectSkillTargetsFromAnchor(
    attacker,
    skill,
    { x: 1, y: 1 },
    harness.deps,
    { kind: 'tile', x: 1, y: 1 },
  );
  assert.equal(targets.filter((target) => target.kind === 'tile').length, 5);
  assert.equal(targetingRulesReadCount, 1, '同一次目标规划中的地形关系只能解析一次');
}

function assertAggregatedPresentation(harness: ReturnType<typeof createRuntimeHarness>, expectedDamage: number): void {
  assert.equal(harness.actionLabels.length, 1);
  assert.equal(harness.attackEffects.length, 0);
  assert.equal(harness.damageFloats.length, 0);
  assert.equal(harness.resolutionFloats.length, 0);
  assert.equal(harness.combatEffects.length, 1);
  const effect = harness.combatEffects[0].effect;
  assert.equal(effect.type, 'damage_summary');
  assert.deepEqual(effect.tile, {
    targetCount: TARGET_COUNT,
    hitCount: TARGET_COUNT,
    totalDamage: expectedDamage * TARGET_COUNT,
    uniformDamage: expectedDamage,
  });
  const summaryNotices = harness.notices.filter((notice) => notice.combat?.summary);
  assert.equal(summaryNotices.length, 1);
  assert.equal(summaryNotices[0].text, '');
  assert.deepEqual(summaryNotices[0].combat.summary.tile, effect.tile);
}

async function testLargeTileCastBatchesAuthorityAndPresentation(): Promise<void> {
  const skill = {
    id: 'skill.aoe_spirit_ore_batch',
    name: '万矿归元',
    cost: 0,
    cooldown: 1,
    range: 20,
    targeting: { range: 20, shape: 'square', radius: 10, maxTargets: TARGET_COUNT },
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'caster.stat.spellAtk' } }],
  };
  const instance = createMapInstance(Array.from({ length: MAP_SIZE }, () => 'L'.repeat(MAP_SIZE)), 'instance:aoe-batch');
  const attacker = createCaster(skill, instance.meta.instanceId);
  const harness = createRuntimeHarness(attacker, instance);
  const targets = createTileTargets();
  const getTileCombatState = instance.getTileCombatState.bind(instance);
  let tileStateReadCount = 0;
  const damageTilesBatch = instance.damageTilesBatch.bind(instance);
  let batchOptions: Record<string, unknown> | null = null;
  instance.damageTilesBatch = (entries: readonly unknown[], options: Record<string, unknown>) => {
    batchOptions = options;
    return damageTilesBatch(entries as never, options as never);
  };
  instance.getTileCombatState = (x: number, y: number) => {
    tileStateReadCount += 1;
    return getTileCombatState(x, y);
  };
  const castOptions = {
    prevalidatedTargets: true,
    skipResourceAndCooldown: true,
    targetX: attacker.x,
    targetY: attacker.y,
  };

  const firstWorldRevision = instance.worldRevision;
  const firstPersistentRevision = instance.persistentRevision;
  harness.playerCombatService.resetSkillDamageCacheStats();
  await harness.dispatchService.dispatchSkillTargets(attacker, skill.id, skill, targets, harness.deps as any, castOptions);
  const firstCacheStats = harness.playerCombatService.getSkillDamageCacheStats();
  assert.deepEqual(firstCacheStats, {
    formulaHits: 0,
    formulaMisses: 1,
    tilePipelineHits: 0,
    tilePipelineMisses: 1,
    bypasses: 0,
  });
  assert.equal(harness.getCastSkillToMonsterCount(), 1);
  assert.equal(tileStateReadCount, TARGET_COUNT);
  assert.equal(instance.worldRevision, firstWorldRevision + 1);
  assert.equal(instance.persistentRevision, firstPersistentRevision + 1);
  assert.equal(instance.dirtyTileDamageIndices.size, TARGET_COUNT);
  assert.equal(instance.staticTileSyncDirtyTileKeys.size, TARGET_COUNT);
  const firstTileState = instance.getTileCombatState(0, 0);
  const firstDamage = (firstTileState?.maxHp ?? 0) - (firstTileState?.hp ?? 0);
  assert.ok(Number.isFinite(firstDamage) && firstDamage > 0);
  assertAggregatedPresentation(harness, firstDamage);
  assert.equal(harness.combatOutcomes.length, 1);
  assert.equal(harness.combatOutcomes[0].result.batch, true);
  assert.equal(harness.combatOutcomes[0].result.fastPathCount, TARGET_COUNT);
  assert.equal(harness.combatOutcomes[0].result.fallbackCount, 0);
  assert.equal(batchOptions?.assumeUniqueEntries, true);
  assert.equal(typeof batchOptions?.recordBatchSectionDuration, 'function');
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.entryResolveMs')?.count, TARGET_COUNT);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.dropRollMs')?.count, TARGET_COUNT);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.mutationMs')?.count, TARGET_COUNT);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.stateWriteMs')?.count, TARGET_COUNT);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.staticSyncMs')?.count, TARGET_COUNT);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.finalizeMs')?.count, 1);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.fastPathEntries')?.count, TARGET_COUNT);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.tileBatch.damageApply.dirtyEntries')?.count, TARGET_COUNT);

  harness.clearPresentation();
  harness.setCurrentTick(2);
  attacker.qi -= 1;
  tileStateReadCount = 0;
  harness.playerCombatService.resetSkillDamageCacheStats();
  harness.resetCastSkillToMonsterCount();
  const secondWorldRevision = instance.worldRevision;
  await harness.dispatchService.dispatchSkillTargets(attacker, skill.id, skill, targets, harness.deps as any, castOptions);
  assert.deepEqual(harness.playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: 1,
    formulaMisses: 0,
    tilePipelineHits: 1,
    tilePipelineMisses: 0,
    bypasses: 0,
  });
  assert.equal(harness.getCastSkillToMonsterCount(), 1);
  assert.equal(tileStateReadCount, TARGET_COUNT);
  assert.equal(instance.worldRevision, secondWorldRevision + 1);
  assertAggregatedPresentation(harness, firstDamage);

  harness.clearPresentation();
  harness.setCurrentTick(3);
  attacker.attrs.numericStats.spellAtk = 120;
  attacker.attrs.revision += 1;
  harness.playerCombatService.resetSkillDamageCacheStats();
  harness.resetCastSkillToMonsterCount();
  const thirdHpBefore = instance.getTileCombatState(0, 0)?.hp ?? 0;
  tileStateReadCount = 0;
  await harness.dispatchService.dispatchSkillTargets(attacker, skill.id, skill, targets, harness.deps as any, castOptions);
  assert.deepEqual(harness.playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: 0,
    formulaMisses: 1,
    tilePipelineHits: 0,
    tilePipelineMisses: 1,
    bypasses: 0,
  });
  assert.equal(harness.getCastSkillToMonsterCount(), 1);
  assert.equal(tileStateReadCount, TARGET_COUNT);
  const thirdDamage = thirdHpBefore - (instance.getTileCombatState(0, 0)?.hp ?? 0);
  assert.ok(thirdDamage > firstDamage);
  assertAggregatedPresentation(harness, thirdDamage);
  assert.equal(Array.from(instance.staticTileSyncDirtyTileKeys).every((entry) => Number.isInteger(entry)), true);
  const consumedStaticTiles = instance.consumeStaticTileSyncDirtyTiles();
  assert.equal(consumedStaticTiles.tileKeys.length, TARGET_COUNT);
  assert.equal(consumedStaticTiles.tileKeys.includes('0,0'), true);
  assert.equal(consumedStaticTiles.tileKeys.includes(`${MAP_SIZE - 1},${MAP_SIZE - 1}`), true);
}

async function testEnemyTargetsKeepPerTargetAuthorityAndAggregatePresentation(): Promise<void> {
  const skill = {
    id: 'skill.aoe_enemy_summary',
    name: '九霄震敌',
    cost: 0,
    cooldown: 1,
    range: 20,
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'caster.stat.spellAtk' } }],
  };
  const instanceId = 'instance:aoe-enemy-summary';
  const attacker = createCaster(skill, instanceId);
  const monsters = new Map<string, any>();
  let snapshotLookupCount = 0;
  let runtimeRefLookupCount = 0;
  for (let index = 0; index < 9; index += 1) {
    const numericStats = createNumericStats();
    numericStats.maxHp = 1_000;
    monsters.set(`monster:${index}`, {
      runtimeId: `monster:${index}`,
      monsterId: 'monster.summary_target',
      name: `汇总目标${index + 1}`,
      x: index,
      y: 0,
      hp: 1_000,
      maxHp: 1_000,
      qi: 0,
      maxQi: 0,
      alive: true,
      level: 1,
      tier: 'normal',
      attrs: {},
      numericStats,
      ratioDivisors: createNumericRatioDivisors(),
      buffs: [],
    });
  }
  const instance = {
    meta: { instanceId },
    worldRevision: 0,
    getMonster(runtimeId: string) {
      snapshotLookupCount += 1;
      return monsters.get(runtimeId) ?? null;
    },
    getMonsterRuntimeRef(runtimeId: string) {
      runtimeRefLookupCount += 1;
      return monsters.get(runtimeId) ?? null;
    },
    applyTemporaryBuffToMonster() {},
    applyDamageToMonster(runtimeId: string, damage: number) {
      const monster = monsters.get(runtimeId);
      if (!monster) return null;
      const appliedDamage = Math.min(monster.hp, Math.max(0, Math.round(damage)));
      monster.hp -= appliedDamage;
      monster.alive = monster.hp > 0;
      return { monster, appliedDamage, defeated: !monster.alive };
    },
  };
  const harness = createRuntimeHarness(attacker, instance as any);
  harness.playerCombatService.resetSkillDamageCacheStats();
  await harness.dispatchService.dispatchSkillTargets(
    attacker,
    skill.id,
    skill,
    Array.from(monsters.keys(), (monsterId) => ({ kind: 'monster', monsterId })),
    {
      ...harness.deps,
      handlePlayerMonsterKill: async () => undefined,
    } as any,
    {
      prevalidatedTargets: true,
      skipResourceAndCooldown: true,
      targetX: attacker.x,
      targetY: attacker.y,
    },
  );
  assert.deepEqual(harness.playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: 8,
    formulaMisses: 1,
    tilePipelineHits: 0,
    tilePipelineMisses: 0,
    bypasses: 0,
  });
  assert.equal(harness.getCastSkillToMonsterCount(), 9);
  assert.equal(snapshotLookupCount, 0);
  assert.equal(runtimeRefLookupCount, 9);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.monsterRuntimeRefCalls')?.count, 9);
  assert.equal(harness.sectionDurations.has('pendingCommands.castSkill.monsterSnapshotFallbackCalls'), false);
  assert.equal(harness.actionLabels.length, 1);
  assert.equal(harness.attackEffects.length, 0);
  assert.equal(harness.damageFloats.length, 0);
  assert.equal(harness.combatEffects.length, 1);
  assert.deepEqual(harness.combatEffects[0].effect.enemy, {
    targetCount: 9,
    hitCount: 9,
    totalDamage: 900,
    uniformDamage: 100,
  });
  for (const monster of monsters.values()) {
    assert.equal(monster.hp, 900);
  }
}

async function testMonsterKillRewardUsesSynchronousEntryInTargetOrder(): Promise<void> {
  const skill = {
    id: 'skill.kill_reward_sync',
    name: '逐妖结算',
    cost: 0,
    cooldown: 1,
    range: 20,
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'caster.stat.spellAtk' } }],
  };
  const instanceId = 'instance:kill-reward-sync';
  const attacker = createCaster(skill, instanceId);
  const monsters = new Map<string, any>();
  const settlementOrder: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const runtimeId = `monster:kill-sync:${index}`;
    monsters.set(runtimeId, {
      runtimeId,
      monsterId: 'monster.kill_sync_target',
      name: `同步结算目标${index + 1}`,
      x: index,
      y: 0,
      hp: 1,
      maxHp: 1,
      qi: 0,
      maxQi: 0,
      alive: true,
      level: 1,
      tier: 'normal',
      attrs: {},
      numericStats: createNumericStats(),
      ratioDivisors: createNumericRatioDivisors(),
      buffs: [],
    });
  }
  const instance = {
    meta: { instanceId },
    worldRevision: 0,
    getMonster(runtimeId: string) {
      return monsters.get(runtimeId) ?? null;
    },
    applyTemporaryBuffToMonster() {},
    applyDamageToMonster(runtimeId: string, damage: number) {
      const monster = monsters.get(runtimeId);
      if (!monster) return null;
      settlementOrder.push(`damage:${runtimeId}`);
      const appliedDamage = Math.min(monster.hp, Math.max(0, Math.round(damage)));
      monster.hp -= appliedDamage;
      monster.alive = monster.hp > 0;
      return { monster, appliedDamage, defeated: !monster.alive };
    },
  };
  const harness = createRuntimeHarness(attacker, instance as any);
  let asyncFallbackCalls = 0;
  await harness.dispatchService.dispatchSkillTargets(
    attacker,
    skill.id,
    skill,
    Array.from(monsters.keys(), (monsterId) => ({ kind: 'monster', monsterId })),
    {
      ...harness.deps,
      handlePlayerMonsterKillSynchronously(_instance: unknown, monster: any, playerId: string) {
        assert.equal(playerId, attacker.playerId);
        settlementOrder.push(`reward:${monster.runtimeId}`);
      },
      async handlePlayerMonsterKill() {
        asyncFallbackCalls += 1;
      },
    } as any,
    {
      prevalidatedTargets: true,
      skipResourceAndCooldown: true,
      targetX: attacker.x,
      targetY: attacker.y,
    },
  );
  assert.deepEqual(settlementOrder, [
    'damage:monster:kill-sync:0',
    'reward:monster:kill-sync:0',
    'damage:monster:kill-sync:1',
    'reward:monster:kill-sync:1',
    'damage:monster:kill-sync:2',
    'reward:monster:kill-sync:2',
  ]);
  assert.equal(asyncFallbackCalls, 0);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.killRewardSyncCalls')?.count, 3);
  assert.equal(harness.sectionDurations.has('pendingCommands.castSkill.killRewardAsyncFallbackCalls'), false);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.monsterSnapshotFallbackCalls')?.count, 3);
  assert.equal(harness.sectionDurations.has('pendingCommands.castSkill.monsterRuntimeRefCalls'), false);
}

async function testMonsterKillRewardStillAwaitsAsyncFallback(): Promise<void> {
  const skill = {
    id: 'skill.kill_reward_async_fallback',
    name: '异步兼容结算',
    cost: 0,
    cooldown: 1,
    range: 20,
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'caster.stat.spellAtk' } }],
  };
  const instanceId = 'instance:kill-reward-async-fallback';
  const attacker = createCaster(skill, instanceId);
  const runtimeId = 'monster:kill-async:0';
  const numericStats = createNumericStats();
  const monster = {
    runtimeId,
    monsterId: 'monster.kill_async_target',
    name: '异步回退目标',
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    qi: 0,
    maxQi: 0,
    alive: true,
    level: 1,
    tier: 'normal',
    attrs: {},
    numericStats,
    ratioDivisors: createNumericRatioDivisors(),
    buffs: [],
  };
  const settlementOrder: string[] = [];
  const instance = {
    meta: { instanceId },
    worldRevision: 0,
    getMonster(targetRuntimeId: string) {
      return targetRuntimeId === runtimeId ? monster : null;
    },
    applyTemporaryBuffToMonster() {},
    applyDamageToMonster(targetRuntimeId: string, damage: number) {
      assert.equal(targetRuntimeId, runtimeId);
      settlementOrder.push('damage');
      const appliedDamage = Math.min(monster.hp, Math.max(0, Math.round(damage)));
      monster.hp -= appliedDamage;
      monster.alive = monster.hp > 0;
      return { monster, appliedDamage, defeated: !monster.alive };
    },
  };
  const harness = createRuntimeHarness(attacker, instance as any);
  let releaseReward!: () => void;
  const rewardGate = new Promise<void>((resolve) => {
    releaseReward = resolve;
  });
  const dispatchPromise = harness.dispatchService.dispatchSkillTargets(
    attacker,
    skill.id,
    skill,
    [{ kind: 'monster', monsterId: runtimeId }],
    {
      ...harness.deps,
      async handlePlayerMonsterKill() {
        settlementOrder.push('reward:start');
        await rewardGate;
        settlementOrder.push('reward:end');
      },
    } as any,
    {
      prevalidatedTargets: true,
      skipResourceAndCooldown: true,
      targetX: attacker.x,
      targetY: attacker.y,
    },
  );
  assert.deepEqual(settlementOrder, ['damage', 'reward:start']);
  releaseReward();
  await dispatchPromise;
  assert.deepEqual(settlementOrder, ['damage', 'reward:start', 'reward:end']);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.killRewardAsyncFallbackCalls')?.count, 1);
  assert.equal(harness.sectionDurations.has('pendingCommands.castSkill.killRewardSyncCalls'), false);
  assert.equal(harness.sectionDurations.get('pendingCommands.castSkill.monsterSnapshotFallbackCalls')?.count, 1);
  assert.equal(harness.sectionDurations.has('pendingCommands.castSkill.monsterRuntimeRefCalls'), false);
}

async function testTargetDependentTileFormulaKeepsPerTargetResolution(): Promise<void> {
  const skill = {
    id: 'skill.target_hp_tile_dispatch',
    name: '照脉裂矿',
    cost: 0,
    cooldown: 1,
    range: 3,
    targeting: { range: 3, shape: 'square', radius: 1, maxTargets: 9 },
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'target.hp' } }],
  };
  const instance = createMapInstance(['LLL', 'LLL', 'LLL'], 'instance:target-formula-fallback');
  const attacker = createCaster(skill, instance.meta.instanceId);
  attacker.x = 1;
  attacker.y = 1;
  const harness = createRuntimeHarness(attacker, instance);
  const targets: any[] = [];
  let expectedTotalDamage = 0;
  let index = 0;
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      instance.damageTile(x, y, index + 1);
      const state = instance.getTileCombatState(x, y);
      assert.ok(state && state.hp > 0);
      expectedTotalDamage += state.hp;
      targets.push({ kind: 'tile', x, y, state });
      index += 1;
    }
  }

  harness.playerCombatService.resetSkillDamageCacheStats();
  await harness.dispatchService.dispatchSkillTargets(attacker, skill.id, skill, targets, harness.deps as any, {
    prevalidatedTargets: true,
    skipResourceAndCooldown: true,
    targetX: 1,
    targetY: 1,
  });
  assert.equal(harness.getCastSkillToMonsterCount(), 9);
  assert.deepEqual(harness.playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: 0,
    formulaMisses: 0,
    tilePipelineHits: 0,
    tilePipelineMisses: 0,
    bypasses: 9,
  });
  assert.deepEqual(harness.combatEffects[0].effect.tile, {
    targetCount: 9,
    hitCount: 9,
    totalDamage: expectedTotalDamage,
    destroyedCount: 9,
  });
}

function createMiningExpHarness() {
  const craftRealmExp: number[] = [];
  let appliedProgressionCount = 0;
  return {
    service: {
      playerProgressionService: {
        getRealmRuntimeExpToNext(level: number) {
          return 5 + level;
        },
        grantCraftRealmExp(_player: any, amount: number) {
          craftRealmExp.push(Math.max(0, Math.round(amount)));
          return { changed: true };
        },
      },
      applyProgressionResult() {
        appliedProgressionCount += 1;
      },
    },
    craftRealmExp,
    getAppliedProgressionCount() {
      return appliedProgressionCount;
    },
  };
}

function testMiningExpBatchMatchesSequentialSettlement(): void {
  const skill = {
    id: 'skill.mining_exp_batch',
    name: '聚脉采灵',
    cost: 0,
    cooldown: 1,
    effects: [{ type: 'damage', formula: 1 }],
  };
  const sequentialAttacker = createCaster(skill, 'instance:mining-exp-sequential');
  sequentialAttacker.realm.realmLv = 10;
  sequentialAttacker.miningSkill = { level: 1, exp: 4, expToNext: 6 };
  const batchedAttacker = structuredClone(sequentialAttacker);
  const entries = Array.from({ length: 24 }, (_, entryIndex) => ({
    tileType: entryIndex % 3 === 0 ? TileType.BlackIronOre : TileType.SpiritOre,
    appliedDamage: entryIndex % 7 === 0 ? 0 : 1,
  }));
  const sequentialHarness = createMiningExpHarness();
  const batchedHarness = createMiningExpHarness();
  let sequentialGain = 0;
  let sequentialHitCount = 0;
  for (const entry of entries) {
    const result = applyMiningExpForTileDamage({
      attacker: sequentialAttacker,
      tileType: entry.tileType,
      appliedDamage: entry.appliedDamage,
      playerRuntimeService: sequentialHarness.service,
    });
    sequentialGain += result.gained;
    if (result.changed) sequentialHitCount += 1;
  }
  const batched = applyMiningExpForTileDamageBatch({
    attacker: batchedAttacker,
    entries,
    playerRuntimeService: batchedHarness.service,
  });

  assert.equal(batched.gained, sequentialGain);
  assert.equal(batched.hitCount, sequentialHitCount);
  assert.deepEqual(batchedAttacker.miningSkill, sequentialAttacker.miningSkill);
  assert.equal(
    batchedHarness.craftRealmExp.reduce((sum, amount) => sum + amount, 0),
    sequentialHarness.craftRealmExp.reduce((sum, amount) => sum + amount, 0),
  );
  assert.equal(batchedHarness.craftRealmExp.length, 1);
  assert.equal(batchedHarness.getAppliedProgressionCount(), 1);
  assert.equal(sequentialHarness.craftRealmExp.length, sequentialHitCount);
}

function testDamageSummaryProtobufRoundTrip(): void {
  const payload = {
    p: [],
    e: [],
    fx: [{
      type: 'damage_summary' as const,
      x: 10,
      y: 20,
      color: '#ffffff',
      enemy: {
        targetCount: 9,
        hitCount: 8,
        totalDamage: 720,
        defeatedCount: 2,
      },
      tile: {
        targetCount: 441,
        hitCount: 441,
        totalDamage: 44_100,
        destroyedCount: 3,
        uniformDamage: 100,
      },
    }],
  };
  const decoded = fromWireTick(decodeMessage(tickPayloadType, encodeMessage(tickPayloadType, toWireTick(payload))));
  assert.deepEqual(decoded.fx, payload.fx);
}

function testSpecialTileFallsBackToSingleMutation(): void {
  const instance = createMapInstance(['.L.', '...', '...'], 'instance:aoe-batch-fallback');
  const temporary = instance.createTemporaryTile(2, 1, TileType.Stone, 100, 10, 1);
  assert.equal(temporary.created, true);
  const worldRevision = instance.worldRevision;
  const persistentRevision = instance.persistentRevision;
  const sectionCounts = new Map<string, number>();
  const result = instance.damageTilesBatch([
    { x: 1, y: 0, damage: 1 },
    { x: 2, y: 1, damage: 1 },
  ], {
    recordBatchSectionDuration(section, _durationMs, count = 1) {
      sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + count);
    },
  });
  assert.equal(result.fastPathCount, 1);
  assert.equal(result.fallbackCount, 1);
  assert.equal(result.results[0]?.appliedDamage, 1);
  assert.equal(result.results[1]?.temporary, true);
  assert.equal(instance.worldRevision, worldRevision + 2);
  assert.equal(instance.persistentRevision, persistentRevision + 2);
  assert.equal(sectionCounts.get('fastPathEntries'), 1);
  assert.equal(sectionCounts.get('fallbackEntries'), 1);
  assert.equal(sectionCounts.get('fallbackTemporaryEntries'), 1);
}

function testTileDropUsesInventoryOnlyStatistics(): void {
  let receivedOptions: Record<string, unknown> | undefined;
  spawnTileDrops({
    playerId: 'player:tile-drop-statistics',
    tileDrops: [{ itemId: 'ore.test', count: 2 }],
    deps: {
      contentTemplateRepository: {
        createItem(itemId: string, count: number) {
          return { itemId, count };
        },
      },
      playerRuntimeService: {
        getPlayer() {
          return { miningSkill: { level: 1 }, attrs: { numericStats: {} } };
        },
        receiveInventoryItem(_playerId: string, _item: unknown, options: Record<string, unknown>) {
          receivedOptions = options;
        },
      },
      queuePlayerNotice() {},
    } as never,
  });
  assert.equal(receivedOptions?.inventoryOnlyStatistics, true);
}

function testSelfCastOnlyAppliesSelfDirectedEffects(): void {
  const skill = {
    id: 'skill.xuanjin_huilan',
    name: '涌',
    cost: 0,
    cooldown: 1,
    range: 0,
    requiresTarget: false,
    targeting: { shape: 'box', width: 3, height: 3, maxTargets: 9 },
    effects: [
      { type: 'damage', damageKind: 'spell', formula: 100 },
      {
        type: 'buff',
        target: 'target',
        buffId: 'buff.water_frost_mark',
        name: '锁流',
        category: 'debuff',
        duration: 20,
      },
      {
        type: 'buff',
        target: 'self',
        buffId: 'buff.water_glide',
        name: '潮势',
        category: 'buff',
        duration: 20,
      },
    ],
  };
  const attacker = createCaster(skill, 'instance:self-cast-effects');
  const appliedBuffIds: string[] = [];
  const playerCombatService = new PlayerCombatService({
    spendQi() {},
    setSkillCooldownReadyTick() {},
    applyTemporaryBuff(playerId: string, buff: { buffId: string }) {
      assert.equal(playerId, attacker.playerId);
      appliedBuffIds.push(buff.buffId);
    },
    healPlayer() {},
  } as any);

  const result = playerCombatService.castSelfSkill(attacker, skill.id, 1);

  assert.equal(result.totalDamage, 0);
  assert.equal(result.hitCount, 0);
  assert.deepEqual(result.damageRolls, []);
  assert.deepEqual(result.targetBuffs, []);
  assert.deepEqual(result.selfBuffs.map((buff: { buffId: string }) => buff.buffId), ['buff.water_glide']);
  assert.deepEqual(appliedBuffIds, ['buff.water_glide']);
}

function testPlayerSkillAttributeDirtyScopeEndsBeforeDamageApplication(): void {
  const skill = {
    id: 'skill.attribute_dirty_boundary',
    name: '归一',
    cost: 0,
    cooldown: 1,
    range: 1,
    effects: [
      { type: 'damage', damageKind: 'spell', formula: 100 },
      {
        type: 'buff',
        target: 'target',
        buffId: 'buff.attribute_dirty_boundary',
        name: '定息',
        category: 'debuff',
        duration: 5,
        stats: { spellDef: -10 },
      },
      {
        type: 'buff',
        target: 'target',
        buffId: 'buff.attribute_dirty_boundary.second',
        name: '凝息',
        category: 'debuff',
        duration: 5,
        stats: { dodge: -10 },
      },
    ],
  };
  const attacker = createCaster(skill, 'instance:attribute-dirty-boundary');
  const target = createCaster(skill, 'instance:attribute-dirty-boundary');
  target.playerId = 'player:attribute-dirty-target';
  const order: string[] = [];
  const playerCombatService = new PlayerCombatService({
    ensurePlayerAttributesFresh(playerId: string) {
      order.push(`fresh:${playerId}`);
    },
    withDeferredAttributeRecalculation(playerId: string, callback: () => unknown) {
      order.push(`scope:start:${playerId}`);
      const value = callback();
      order.push(`scope:end:${playerId}`);
      return { value };
    },
    spendQi() {},
    setSkillCooldownReadyTick() {},
    applyTemporaryBuff(playerId: string) {
      order.push(`buff:${playerId}`);
    },
    healPlayer() {},
    setRetaliatePlayerTarget() {
      order.push('retaliate');
    },
    applyDamage(playerId: string) {
      order.push(`damage:${playerId}`);
    },
  } as any);

  const result = playerCombatService.castSkill(attacker, target, skill.id, 1, 1);

  assert.ok(result.totalDamage > 0);
  assert.ok(order.indexOf(`buff:${target.playerId}`) > order.indexOf(`scope:start:${target.playerId}`));
  assert.ok(order.indexOf(`scope:end:${target.playerId}`) < order.indexOf(`damage:${target.playerId}`));
  assert.ok(order.indexOf(`scope:end:${attacker.playerId}`) < order.indexOf(`damage:${target.playerId}`));
}

function createTileCombatTarget(hp: number): any {
  return {
    runtimeId: `tile:target:${hp}`,
    monsterId: TileType.SpiritOre,
    hp,
    maxHp: hp,
    qi: 0,
    maxQi: 0,
    attrs: {
      finalAttrs: createTileCombatAttributes(),
      numericStats: createTileCombatNumericStats(hp),
      ratioDivisors: createTileCombatRatioDivisors(),
    },
    buffs: [],
  };
}

function testTargetDependentFormulaBypassesReuse(): void {
  const skill = {
    id: 'skill.target_hp_formula',
    name: '照见本命',
    cost: 0,
    cooldown: 1,
    range: 1,
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'target.hp' } }],
  };
  const attacker = createCaster(skill, 'instance:formula-fallback');
  const playerCombatService = new PlayerCombatService({} as any);
  const attackerState = playerCombatService.createCombatPlayerState(attacker);
  const resolved = { skill, level: 1, readyTick: 0, skipQiCost: true, skipCooldownCheck: true };
  const options = {
    isTileTarget: true,
    skipResourceAndCooldown: true,
    skipRangeValidation: true,
    formulaCacheOwner: attacker,
    targetCount: 2,
  };
  playerCombatService.resetSkillDamageCacheStats();
  const first = playerCombatService.executeResolvedSkillCast(
    attackerState,
    createTileCombatTarget(10),
    resolved,
    1,
    0,
    {},
    options,
  );
  const second = playerCombatService.executeResolvedSkillCast(
    attackerState,
    createTileCombatTarget(20),
    resolved,
    1,
    0,
    {},
    options,
  );
  assert.equal(first.totalDamage, 10);
  assert.equal(second.totalDamage, 20);
  assert.deepEqual(playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: 0,
    formulaMisses: 0,
    tilePipelineHits: 0,
    tilePipelineMisses: 0,
    bypasses: 2,
  });
}

function testCraftSkillFormulaUsesAllLevelsAndInvalidatesReuse(): void {
  const craftFormulaVars = [
    'caster.craft.alchemy.level',
    'caster.craft.forging.level',
    'caster.craft.enhancement.level',
    'caster.craft.transmission.level',
    'caster.craft.gather.level',
    'caster.craft.mining.level',
    'caster.craft.building.level',
    'caster.craft.formation.level',
  ];
  const skill = {
    id: 'skill.craft_level_formula',
    name: '百艺归元',
    cost: 0,
    cooldown: 1,
    range: 1,
    effects: [{
      type: 'damage',
      damageKind: 'spell',
      formula: {
        op: 'mul',
        args: [
          100,
          {
            op: 'add',
            args: [
              1,
              { var: 'caster.stat.moveSpeed', scale: 0.001 },
              { var: 'caster.realmLv', scale: 0.12 },
              ...craftFormulaVars.map((variable) => ({ var: variable, scale: 0.1 })),
            ],
          },
        ],
      },
    }],
  };
  const attacker = createCaster(skill, 'instance:craft-formula');
  attacker.realmLv = 1;
  attacker.realm = { realmLv: 42 };
  attacker.attrs.numericStats.moveSpeed = 1_000;
  attacker.alchemySkill = { level: 1 };
  attacker.forgingSkill = { level: 2 };
  attacker.enhancementSkill = { level: 3 };
  attacker.transmissionSkill = { level: 4 };
  attacker.gatherSkill = { level: 5 };
  attacker.miningSkill = { level: 6 };
  attacker.buildingSkill = { level: 7 };
  attacker.formationSkill = { level: 8 };

  const playerCombatService = new PlayerCombatService({} as any);
  const resolved = { skill, level: 1, readyTick: 0, skipQiCost: true, skipCooldownCheck: true };
  const options = {
    isTileTarget: true,
    skipResourceAndCooldown: true,
    skipRangeValidation: true,
    formulaCacheOwner: attacker,
    targetCount: 1,
  };
  playerCombatService.resetSkillDamageCacheStats();
  const first = playerCombatService.executeResolvedSkillCast(
    playerCombatService.createCombatPlayerState(attacker),
    createTileCombatTarget(100_000),
    resolved,
    1,
    0,
    {},
    options,
  );
  assert.equal(first.totalDamage, 1_064);

  attacker.realm = undefined;
  attacker.realmLv = 43;
  attacker.alchemySkill.level = 11;
  const second = playerCombatService.executeResolvedSkillCast(
    playerCombatService.createCombatPlayerState(attacker),
    createTileCombatTarget(100_000),
    resolved,
    2,
    0,
    {},
    options,
  );
  assert.equal(second.totalDamage, 1_176);
  assert.deepEqual(playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: 0,
    formulaMisses: 2,
    tilePipelineHits: 0,
    tilePipelineMisses: 2,
    bypasses: 0,
  });
}

async function main(): Promise<void> {
  testDamageAggregationBoundary();
  testSkillTargetPlanReusesCategoryRelationResolution();
  await testLargeTileCastBatchesAuthorityAndPresentation();
  await testEnemyTargetsKeepPerTargetAuthorityAndAggregatePresentation();
  await testMonsterKillRewardUsesSynchronousEntryInTargetOrder();
  await testMonsterKillRewardStillAwaitsAsyncFallback();
  await testTargetDependentTileFormulaKeepsPerTargetResolution();
  testMiningExpBatchMatchesSequentialSettlement();
  testSpecialTileFallsBackToSingleMutation();
  testTileDropUsesInventoryOnlyStatistics();
  testSelfCastOnlyAppliesSelfDirectedEffects();
  testPlayerSkillAttributeDirtyScopeEndsBeforeDamageApplication();
  testTargetDependentFormulaBypassesReuse();
  testCraftSkillFormulaUsesAllLevelsAndInvalidatesReuse();
  testDamageSummaryProtobufRoundTrip();
  console.log(JSON.stringify({
    ok: true,
    case: 'player-skill-aoe-batch',
    targetCount: TARGET_COUNT,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

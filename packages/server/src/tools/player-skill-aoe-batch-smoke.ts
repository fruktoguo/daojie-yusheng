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
    targetMode: 'tile',
    targeting: { range: 20, shape: 'square', radius: 10, maxTargets: TARGET_COUNT, targetMode: 'tile' },
    effects: [{ type: 'damage', damageKind: 'spell', formula: { var: 'caster.stat.spellAtk' } }],
  };
  const instance = createMapInstance(Array.from({ length: MAP_SIZE }, () => 'L'.repeat(MAP_SIZE)), 'instance:aoe-batch');
  const attacker = createCaster(skill, instance.meta.instanceId);
  const harness = createRuntimeHarness(attacker, instance);
  const targets = createTileTargets();
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
    formulaHits: TARGET_COUNT - 1,
    formulaMisses: 1,
    tilePipelineHits: TARGET_COUNT - 1,
    tilePipelineMisses: 1,
    bypasses: 0,
  });
  assert.equal(instance.worldRevision, firstWorldRevision + 1);
  assert.equal(instance.persistentRevision, firstPersistentRevision + 1);
  assert.equal(instance.dirtyTileDamageIndices.size, TARGET_COUNT);
  assert.equal(instance.staticTileSyncDirtyTileKeys.size, TARGET_COUNT);
  const firstDamage = instance.getTileCombatState(0, 0)?.maxHp - instance.getTileCombatState(0, 0)?.hp;
  assert.ok(Number.isFinite(firstDamage) && firstDamage > 0);
  assertAggregatedPresentation(harness, firstDamage);
  assert.equal(harness.combatOutcomes.length, 1);
  assert.equal(harness.combatOutcomes[0].result.batch, true);
  assert.equal(harness.combatOutcomes[0].result.fastPathCount, TARGET_COUNT);
  assert.equal(harness.combatOutcomes[0].result.fallbackCount, 0);

  harness.clearPresentation();
  harness.setCurrentTick(2);
  attacker.qi -= 1;
  harness.playerCombatService.resetSkillDamageCacheStats();
  const secondWorldRevision = instance.worldRevision;
  await harness.dispatchService.dispatchSkillTargets(attacker, skill.id, skill, targets, harness.deps as any, castOptions);
  assert.deepEqual(harness.playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: TARGET_COUNT,
    formulaMisses: 0,
    tilePipelineHits: TARGET_COUNT,
    tilePipelineMisses: 0,
    bypasses: 0,
  });
  assert.equal(instance.worldRevision, secondWorldRevision + 1);
  assertAggregatedPresentation(harness, firstDamage);

  harness.clearPresentation();
  harness.setCurrentTick(3);
  attacker.attrs.numericStats.spellAtk = 120;
  attacker.attrs.revision += 1;
  harness.playerCombatService.resetSkillDamageCacheStats();
  const thirdHpBefore = instance.getTileCombatState(0, 0)?.hp ?? 0;
  await harness.dispatchService.dispatchSkillTargets(attacker, skill.id, skill, targets, harness.deps as any, castOptions);
  assert.deepEqual(harness.playerCombatService.getSkillDamageCacheStats(), {
    formulaHits: TARGET_COUNT - 1,
    formulaMisses: 1,
    tilePipelineHits: TARGET_COUNT - 1,
    tilePipelineMisses: 1,
    bypasses: 0,
  });
  const thirdDamage = thirdHpBefore - (instance.getTileCombatState(0, 0)?.hp ?? 0);
  assert.ok(thirdDamage > firstDamage);
  assertAggregatedPresentation(harness, thirdDamage);
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
  const result = instance.damageTilesBatch([
    { x: 1, y: 0, damage: 1 },
    { x: 2, y: 1, damage: 1 },
  ]);
  assert.equal(result.fastPathCount, 1);
  assert.equal(result.fallbackCount, 1);
  assert.equal(result.results[0].result?.appliedDamage, 1);
  assert.equal(result.results[1].result?.temporary, true);
  assert.equal(instance.worldRevision, worldRevision + 2);
  assert.equal(instance.persistentRevision, persistentRevision + 2);
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

async function main(): Promise<void> {
  testDamageAggregationBoundary();
  await testLargeTileCastBatchesAuthorityAndPresentation();
  await testEnemyTargetsKeepPerTargetAuthorityAndAggregatePresentation();
  testSpecialTileFallsBackToSingleMutation();
  testTargetDependentFormulaBypassesReuse();
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

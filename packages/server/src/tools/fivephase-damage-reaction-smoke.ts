import assert from 'node:assert/strict';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime.js';
import { MapTemplateRepository } from '../runtime/map/map-template.repository.js';
import { CombatReactionRegistry } from '../runtime/combat/combat-reaction-registry.js';
import { registerFivePhaseDevourReaction } from '../runtime/combat/reactions/monster/fivephase-devour.reaction.js';

function createInstance(monsterSpawns: unknown[]): MapInstanceRuntime {
  const templates = new MapTemplateRepository();
  templates.registerRuntimeMapTemplate({
    id: 'fivephase_damage_reaction_smoke',
    name: '五行噬脉反应烟测',
    width: 5,
    height: 5,
    routeDomain: 'system',
    tiles: ['.....', '.....', '.....', '.....', '.....'],
    spawnPoint: { x: 1, y: 1 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  return new MapInstanceRuntime({
    instanceId: 'public:fivephase_damage_reaction_smoke',
    template: templates.getOrThrow('fivephase_damage_reaction_smoke'),
    monsterSpawns,
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '五行噬脉反应烟测',
    instanceOrigin: 'smoke',
  } as never);
}

function createMonsterSpawn(input: {
  runtimeId: string;
  monsterId: string;
  skills?: unknown[];
  hp?: number;
  maxHp?: number;
}) {
  return {
    runtimeId: input.runtimeId,
    monsterId: input.monsterId,
    name: input.monsterId,
    char: '兽',
    color: '#8060a0',
    level: 1,
    x: 2,
    y: 2,
    hp: input.hp ?? 1000,
    maxHp: input.maxHp ?? 1000,
    alive: true,
    aggroRange: 8,
    leashRange: 12,
    attackRange: 1,
    attackCooldownTicks: 2,
    wanderRadius: 0,
    skills: input.skills ?? [],
    buffs: [],
    baseAttrs: { constitution: 10, spirit: 10, strength: 10 },
    baseNumericStats: { maxHp: input.maxHp ?? 1000, maxQi: 20, attack: 10, defense: 5, speed: 5 },
  };
}

function main(): void {
  {
    let recalculateCalls = 0;
    let persistenceDirtyCalls = 0;
    let revisionCalls = 0;
    const registry = new CombatReactionRegistry<unknown>();
    registerFivePhaseDevourReaction(registry, {
      recalculateMonsterDerivedState: () => { recalculateCalls += 1; },
      markMonsterRuntimePersistenceDirty: () => { persistenceDirtyCalls += 1; },
      bumpWorldRevision: () => { revisionCalls += 1; },
    });
    const target = createMonsterSpawn({
      runtimeId: 'monster:fivephase-direct-negative',
      monsterId: 'm_fivephase_devourer',
      skills: [],
    });
    const result = registry.dispatch({
      phase: 'afterDamage',
      targetKind: 'monster',
      target,
      damage: 10,
      appliedDamage: 10,
      damageElement: 'fire',
      currentTick: 1,
    });
    assert.equal(result.changed, false, '无副本被动技能的同名怪物不得报告状态变化');
    assert.equal(target.buffs.length, 0);
    assert.equal(recalculateCalls, 0);
    assert.equal(persistenceDirtyCalls, 0);
    assert.equal(revisionCalls, 0);
  }

  {
    const wolfId = 'monster:wolf';
    const instance = createInstance([createMonsterSpawn({ runtimeId: wolfId, monsterId: 'm_common_wolf' })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(wolfId, 10, undefined, 'fire'));
    assert.doesNotThrow(() => instance.applyDamageToMonster(wolfId, 10, undefined, 'fire'));
    const wolf = instance.getMonster(wolfId);
    assert.equal(wolf?.buffs?.some((buff: { buffId?: string }) => String(buff.buffId ?? '').includes('fivephase')), false);
  }

  {
    const bossId = 'monster:fivephase-wild';
    const instance = createInstance([createMonsterSpawn({
      runtimeId: bossId,
      monsterId: 'm_fivephase_devourer',
      skills: [],
      hp: 400,
      maxHp: 1000,
    })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(bossId, 200, undefined, 'water'));
    const boss = instance.getMonster(bossId);
    assert.equal(
      boss?.buffs?.some((buff: { buffId?: string }) => String(buff.buffId ?? '').includes('dungeon_fivephase')),
      false,
      '现世同 ID Boss 未挂副本被动时不得触发噬脉或归元',
    );
  }

  {
    const bossId = 'monster:fivephase-devour-only';
    const instance = createInstance([createMonsterSpawn({
      runtimeId: bossId,
      monsterId: 'm_fivephase_devourer',
      skills: [{ id: 'skill.dungeon_fivephase_devour_passive', active: false, effects: [] }],
      hp: 400,
      maxHp: 1000,
    })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(bossId, 200, undefined, 'fire'));
    const boss = instance.getMonster(bossId);
    assert.equal(boss?.buffs?.find((buff: { buffId?: string }) => buff.buffId === 'buff.dungeon_fivephase_devour_resist_fire')?.stacks, 1);
    assert.equal(
      boss?.buffs?.some((buff: { buffId?: string }) => buff.buffId === 'buff.dungeon_fivephase_origin'),
      false,
      '只有噬脉被动时不得触发归元',
    );
  }

  {
    const bossId = 'monster:fivephase-origin-only';
    const instance = createInstance([createMonsterSpawn({
      runtimeId: bossId,
      monsterId: 'm_fivephase_devourer',
      skills: [{ id: 'skill.dungeon_fivephase_origin_passive', active: false, effects: [] }],
      hp: 400,
      maxHp: 1000,
    })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(bossId, 200, undefined, 'water'));
    const boss = instance.getMonster(bossId);
    assert.equal(
      boss?.buffs?.some((buff: { buffId?: string }) => buff.buffId === 'buff.dungeon_fivephase_devour_resist_water'),
      false,
      '只有归元被动时不得叠加噬脉减伤',
    );
    const origin = boss?.buffs?.find((buff: { buffId?: string }) => buff.buffId === 'buff.dungeon_fivephase_origin');
    assert.equal(origin?.stacks, 1, '归元保留基础一层的既有数值语义');
    assert.equal(origin?.remainingTicks, 1000, '归元保留既有运行时计时语义');
    assert.equal(origin?.duration, 999, '归元保留既有展示时长语义');
  }

  console.log(JSON.stringify({ ok: true, case: 'fivephase-damage-reaction' }));
}

main();

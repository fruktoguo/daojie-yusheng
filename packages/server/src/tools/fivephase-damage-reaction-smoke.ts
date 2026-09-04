import assert from 'node:assert/strict';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime.js';
import { MapTemplateRepository } from '../runtime/map/map-template.repository.js';

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
    baseAttrs: { constitution: 10, spirit: 10, strength: 10 },
    baseNumericStats: { maxHp: input.maxHp ?? 1000, maxQi: 20, attack: 10, defense: 5, speed: 5 },
  };
}

function main(): void {
  {
    const wolfId = 'monster:wolf';
    const instance = createInstance([createMonsterSpawn({ runtimeId: wolfId, monsterId: 'm_common_wolf' })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(wolfId, 10, undefined, 'fire'));
    assert.doesNotThrow(() => instance.applyDamageToMonster(wolfId, 10, undefined, 'fire'));
    const wolf = instance.getMonster(wolfId);
    assert.equal(wolf?.buffs?.some((buff: { buffId?: string }) => String(buff.buffId ?? '').includes('fivephase')), false);
  }

  {
    const bossId = 'monster:fivephase';
    const instance = createInstance([createMonsterSpawn({
      runtimeId: bossId,
      monsterId: 'm_fivephase_devourer',
      skills: [{ id: 'skill.dungeon_fivephase_devour_passive', active: false, effects: [] }],
      hp: 1000,
      maxHp: 1000,
    })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(bossId, 10, undefined, 'fire'));
    assert.doesNotThrow(() => instance.applyDamageToMonster(bossId, 10, undefined, 'fire'));
    const boss = instance.getMonster(bossId);
    const fireBuff = boss?.buffs?.find((buff: { buffId?: string }) => buff.buffId === 'buff.dungeon_fivephase_devour_resist_fire');
    assert.equal(fireBuff?.stacks, 2);
    assert.equal(fireBuff?.name, '噬火');
  }

  {
    const bossId = 'monster:fivephase-origin';
    const instance = createInstance([createMonsterSpawn({
      runtimeId: bossId,
      monsterId: 'm_fivephase_devourer',
      hp: 400,
      maxHp: 1000,
    })]);
    assert.doesNotThrow(() => instance.applyDamageToMonster(bossId, 200, undefined, 'water'));
    const boss = instance.getMonster(bossId);
    assert.ok(boss && boss.hp <= 300);
    assert.equal(boss?.buffs?.some((buff: { buffId?: string }) => buff.buffId === 'buff.dungeon_fivephase_origin'), true);
  }

  console.log(JSON.stringify({ ok: true, case: 'fivephase-damage-reaction' }));
}

main();

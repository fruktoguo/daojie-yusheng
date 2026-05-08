// @ts-nocheck

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { buildMonsterObservation } from '../runtime/world/world-runtime.observation.helpers';
import { Direction, formatDisplayCurrentMax, formatDisplayInteger, resolveMonsterTemplateRecord } from '@mud/shared';

const verdantMapIds = [
  'verdant_vine_vale_01_entry',
  'verdant_vine_vale_02_slope',
  'verdant_vine_vale_03_bridge',
  'verdant_vine_vale_04_garden',
  'verdant_vine_vale_05_inner_hollow',
  'verdant_vine_vale_06_heart_gate',
];

const expectedMainlineMonsterCounts: Record<string, number> = {
  verdant_vine_vale_01_entry: 18,
  verdant_vine_vale_02_slope: 18,
  verdant_vine_vale_03_bridge: 18,
  verdant_vine_vale_04_garden: 13,
  verdant_vine_vale_05_inner_hollow: 3,
  verdant_vine_vale_06_heart_gate: 3,
};

function assertRuntimeMonsters(repository: ContentTemplateRepository, mapId: string) {
  const monsters = repository.createRuntimeMonstersForMap(mapId);
  assert.ok(monsters.length > 0, `${mapId} should create runtime monsters from map monsterSpawns`);
  assert.ok(monsters.every((monster) => monster.runtimeId.startsWith(`monster:${mapId}:`)), `${mapId} runtime monster ids should include map id`);
  assert.ok(monsters.some((monster) => monster.monsterId.startsWith('m_verdant_')), `${mapId} should use verdant monster templates`);
  assert.equal(new Set(monsters.map((monster) => monster.runtimeId)).size, monsters.length, `${mapId} runtime monster ids should be unique`);
  return monsters.length;
}

function main() {
  const repository = new ContentTemplateRepository();
  repository.loadAll();
  const mapTemplateRepository = new MapTemplateRepository();
  mapTemplateRepository.loadAll();

  const counts: Record<string, number> = {};
  for (const mapId of verdantMapIds) {
    counts[mapId] = assertRuntimeMonsters(repository, mapId);
    assert.equal(
      counts[mapId],
      expectedMainlineMonsterCounts[mapId],
      `${mapId} should follow main spawn population semantics`,
    );
  }

  const rootMapMonsters = repository.createRuntimeMonstersForMap('cleft_blade_plain');
  assert.equal(rootMapMonsters.length, 31, 'root map fallback should follow main spawn population semantics');

  const yunlaiMonsters = repository.createRuntimeMonstersForMap('yunlai_town');
  assert.equal(yunlaiMonsters.length, 24, 'ordinary yunlai spawns should use main maxAlive population');
  assert.equal(
    yunlaiMonsters.find((monster) => monster.monsterId === 'm_town_rat_south')?.respawnTicks,
    10,
    'map monster spawn without respawnTicks override should use current template respawnSec',
  );
  assert.equal(
    yunlaiMonsters.find((monster) => monster.monsterId === 'm_gate_thug')?.respawnTicks,
    10,
    'ordinary map monster spawn without respawnTicks override should use current template respawnSec',
  );
  assertRuntimeMonsterStatsMatchGenerated(repository, mapTemplateRepository);
  assertOrdinaryMonsterSpawnAcceleration(repository, mapTemplateRepository);
  assertHuanlingZhenrenInitialWoundedBuff(repository, mapTemplateRepository);

  console.log(JSON.stringify({
    ok: true,
    case: 'content-monster-spawn',
    verdantMapCounts: counts,
    rootMapCount: rootMapMonsters.length,
    yunlaiMapCount: yunlaiMonsters.length,
  }, null, 2));
}

function assertRuntimeMonsterStatsMatchGenerated(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const generatedPath = path.resolve(__dirname, '../../data/generated/monster-runtime-stats.json');
  const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf-8'));
  const expected = generated.records?.m_town_rat_south;
  assert.ok(expected, 'generated monster stats should include m_town_rat_south');
  const template = repository.monsterRuntimeTemplates.get('m_town_rat_south');
  assert.ok(template, 'runtime monster template should include m_town_rat_south');
  assert.deepEqual(
    template.attrs,
    expected.attrs,
    'runtime monster attrs should use the same tendency formula as generated monster stats',
  );
  for (const key of ['maxHp', 'maxQi', 'physAtk', 'spellAtk', 'moveSpeed']) {
    assert.equal(
      template.numericStats[key],
      expected.numericStats[key],
      `runtime monster ${key} should match generated monster stats`,
    );
  }

  const monsterContentPath = path.resolve(__dirname, '../../data/content/monsters/云来镇.json');
  const baselinesPath = path.resolve(__dirname, '../../data/content/realm-attr-baselines.json');
  const rawMonster = JSON.parse(fs.readFileSync(monsterContentPath, 'utf-8'))
    .find((entry) => entry.id === 'm_town_rat_south');
  const baselines = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
  const dynamicLevel2 = resolveMonsterTemplateRecord({ ...rawMonster, level: 2 }, undefined, baselines);
  const dynamicMapId = 'smoke_dynamic_monster_level';
  repository.monsterRuntimeStatesByMapId.set(dynamicMapId, [{
    runtimeId: `monster:${dynamicMapId}:m_town_rat_south:0`,
    x: 10,
    y: 10,
    hp: 999999,
    alive: true,
    respawnLeft: 0,
    respawnTicks: 10,
    facing: Direction.South,
    level: 2,
  }]);
  const dynamicSpawn = repository.createRuntimeMonstersForMap(dynamicMapId)[0];
  assert.ok(dynamicSpawn, 'runtime monster spawn should support dynamic level state');
  assert.equal(dynamicSpawn.level, 2, 'dynamic monster spawn should use state level override');
  assert.deepEqual(dynamicSpawn.baseAttrs, dynamicLevel2.resolvedAttrs, 'dynamic level spawn attrs should be recalculated from tendency formula');
  assert.equal(dynamicSpawn.baseNumericStats.maxHp, dynamicLevel2.computedStats.maxHp, 'dynamic level spawn maxHp should be recalculated from tendency formula');
  assert.equal(dynamicSpawn.baseNumericStats.physAtk, dynamicLevel2.computedStats.physAtk, 'dynamic level spawn physAtk should be recalculated from tendency formula');

  const instance = new MapInstanceRuntime({
    instanceId: 'smoke:dynamic_monster_level',
    template: mapTemplateRepository.getOrThrow('yunlai_town'),
    monsterSpawns: [dynamicSpawn],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const dynamicLevel3 = resolveMonsterTemplateRecord({ ...rawMonster, level: 3 }, undefined, baselines);
  instance.hydrateMonsterRuntimeStates([{
    runtimeId: dynamicSpawn.runtimeId,
    monsterId: dynamicSpawn.monsterId,
    monsterName: dynamicSpawn.name,
    monsterTier: dynamicSpawn.tier,
    monsterLevel: 3,
    x: dynamicSpawn.x,
    y: dynamicSpawn.y,
    hp: dynamicSpawn.maxHp,
    maxHp: dynamicSpawn.maxHp,
    alive: true,
    respawnLeft: 0,
    respawnTicks: dynamicSpawn.respawnTicks,
    statePayload: {},
  }]);
  const hydrated = instance.listMonsters().find((entry) => entry.runtimeId === dynamicSpawn.runtimeId);
  assert.ok(hydrated, 'hydrated dynamic monster should stay in runtime instance');
  assert.equal(hydrated.level, 3, 'hydrated dynamic monster should accept persisted level override');
  assert.deepEqual(hydrated.baseAttrs, dynamicLevel3.resolvedAttrs, 'hydrated dynamic monster attrs should be recalculated from tendency formula');
  assert.equal(hydrated.baseNumericStats.maxHp, dynamicLevel3.computedStats.maxHp, 'hydrated dynamic monster maxHp should be recalculated from tendency formula');
}

function assertOrdinaryMonsterSpawnAcceleration(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const instance = new MapInstanceRuntime({
    instanceId: 'smoke:yunlai_town',
    template: mapTemplateRepository.getOrThrow('yunlai_town'),
    monsterSpawns: repository.createRuntimeMonstersForMap('yunlai_town'),
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const group = instance.listMonsters()
    .filter((monster) => monster.monsterId === 'm_town_rat_south')
    .sort((left, right) => left.runtimeId.localeCompare(right.runtimeId, 'zh-CN'));
  assert.equal(group.length, 6, 'ordinary spawn group should use main maxAlive population');
  assert.ok(group.every((monster) => monster.alive), 'ordinary spawn group should start alive when tiles are available');
  for (const monster of group) {
    const result = instance.applyDamageToMonster(monster.runtimeId, monster.hp, undefined);
    assert.equal(result?.defeated, true, `${monster.runtimeId} should be defeated`);
  }
  const defeatedGroup = instance.listMonsters().filter((monster) => monster.monsterId === 'm_town_rat_south');
  assert.ok(defeatedGroup.every((monster) => monster.alive === false), 'ordinary spawn group should be fully defeated');
  assert.ok(
    defeatedGroup.every((monster) => monster.respawnLeft === 5),
    'first timely ordinary clear should accelerate 10 tick respawn to 5 ticks',
  );
}

function assertHuanlingZhenrenInitialWoundedBuff(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const spawns = repository.createRuntimeMonstersForMap('ruined_cavern_manor');
  const spawn = spawns.find((monster) => monster.monsterId === 'm_huanling_zhenren');
  assert.ok(spawn, 'ruined_cavern_manor should spawn 重伤的唤灵真人');
  assert.equal(spawn.baseAttrs.spirit, Math.round(spawn.baseAttrs.constitution * 0.4), '重伤的唤灵真人 神识倾向 should resolve to 40%');
  assert.equal(spawn.baseAttrs.strength, Math.round(spawn.baseAttrs.constitution * 0.4), '重伤的唤灵真人 力道倾向 should resolve to 40%');
  assert.equal(spawn.baseAttrs.perception, spawn.baseAttrs.constitution, '重伤的唤灵真人 身法倾向 should resolve to 100%');
  assert.equal(spawn.baseAttrs.talent, spawn.baseAttrs.constitution, '重伤的唤灵真人 根骨倾向 should resolve to 100%');
  assert.equal(spawn.baseAttrs.meridians, spawn.baseAttrs.constitution, '重伤的唤灵真人 经脉倾向 should resolve to 100%');
  assert.ok(
    spawn.initialBuffs?.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded'),
    '重伤的唤灵真人 runtime spawn should keep configured initial wounded debuff',
  );
  assert.ok(spawn.baseNumericStats.antiCrit > 0, '重伤的唤灵真人 template should resolve nonzero monster antiCrit');
  assert.ok(spawn.baseNumericStats.maxQi > 0, '重伤的唤灵真人 template should resolve nonzero monster maxQi');

  const instance = new MapInstanceRuntime({
    instanceId: 'smoke:ruined_cavern_manor',
    template: mapTemplateRepository.getOrThrow('ruined_cavern_manor'),
    monsterSpawns: spawns,
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const monster = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(monster, '重伤的唤灵真人 should exist in runtime instance');
  assert.ok(
    monster.buffs.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded' && buff.category === 'debuff'),
    '重伤的唤灵真人 should start with visible wounded debuff',
  );
  const woundedBuff = monster.buffs.find((buff) => buff.buffId === 'buff.huanling_zhenren_wounded');
  assert.equal(woundedBuff?.statMode, 'percent', 'wounded debuff should use percent stat mode');
  assert.equal(woundedBuff?.stats?.maxHp, -4444, 'wounded debuff should reduce maxHp by 4444%');
  assert.equal(woundedBuff?.stats?.antiCrit, -4444, 'wounded debuff should reduce antiCrit by 4444%');
  assert.equal(monster.baseNumericStats.antiCrit, spawn.baseNumericStats.antiCrit, 'monster base antiCrit should survive runtime clone');
  assert.ok(monster.numericStats.antiCrit < spawn.baseNumericStats.antiCrit, 'wounded debuff should suppress monster antiCrit');
  assert.ok(monster.maxQi > 0, 'monster runtime should keep nonzero maxQi');
  assert.equal(monster.qi, monster.maxQi, 'monster runtime should start with full qi');
  const observation = buildMonsterObservation(Number.MAX_SAFE_INTEGER, monster);
  assert.ok(
    observation.lines.some((line) => line.label === '灵力' && line.value === formatDisplayCurrentMax(monster.qi, monster.maxQi)),
    'monster observation should expose current/max qi',
  );
  assert.ok(
    observation.lines.some((line) => line.label === '免爆' && line.value === formatDisplayInteger(monster.numericStats.antiCrit)),
    'monster observation should expose resolved antiCrit',
  );
  assert.ok(monster.maxHp < spawn.maxHp, 'wounded debuff should suppress monster maxHp through percent stat mode');

  instance.tickOnce();
  const afterTick = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(
    afterTick?.buffs.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded'),
    'infinite wounded debuff should survive monster buff tick',
  );

  const defeated = instance.applyDamageToMonster(afterTick.runtimeId, afterTick.hp, undefined);
  assert.equal(defeated?.defeated, true, '重伤的唤灵真人 should be defeated for respawn regression');
  for (let i = 0; i < spawn.respawnTicks; i += 1) {
    instance.tickOnce();
  }
  const respawned = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(respawned?.alive, '重伤的唤灵真人 should respawn after configured respawn ticks');
  assert.ok(
    respawned.buffs.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded'),
    'respawned 重伤的唤灵真人 should rebuild initial wounded debuff',
  );
  assert.equal(respawned.qi, respawned.maxQi, 'respawned 重伤的唤灵真人 should recover full qi');
}

main();

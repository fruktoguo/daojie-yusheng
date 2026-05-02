// @ts-nocheck

import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { buildMonsterObservation } from '../runtime/world/world-runtime.observation.helpers';

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
  assert.equal(monster.baseNumericStats.antiCrit, spawn.baseNumericStats.antiCrit, 'monster base antiCrit should survive runtime clone');
  assert.equal(monster.numericStats.antiCrit, spawn.baseNumericStats.antiCrit, 'monster runtime antiCrit should survive derived stat recalculation');
  assert.ok(monster.maxQi > 0, 'monster runtime should keep nonzero maxQi');
  assert.equal(monster.qi, monster.maxQi, 'monster runtime should start with full qi');
  const observation = buildMonsterObservation(Number.MAX_SAFE_INTEGER, monster);
  assert.ok(
    observation.lines.some((line) => line.label === '灵力' && line.value === `${monster.qi} / ${monster.maxQi}`),
    'monster observation should expose current/max qi',
  );
  assert.ok(
    observation.lines.some((line) => line.label === '免爆' && line.value === `${monster.numericStats.antiCrit}`),
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

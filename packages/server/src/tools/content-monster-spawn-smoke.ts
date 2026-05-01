// @ts-nocheck

import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

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
    30,
    'map monster spawn respawnTicks should override template respawnSec',
  );
  assert.equal(
    yunlaiMonsters.find((monster) => monster.monsterId === 'm_gate_thug')?.respawnTicks,
    15,
    'map monster spawn respawnTicks should override ordinary template respawnSec',
  );
  assertOrdinaryMonsterSpawnAcceleration(repository, mapTemplateRepository);

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
    defeatedGroup.every((monster) => monster.respawnLeft === 15),
    'first timely ordinary clear should accelerate 30 tick respawn to 15 ticks',
  );
}

main();

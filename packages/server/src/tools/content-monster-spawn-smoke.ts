// @ts-nocheck

import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';

const verdantMapIds = [
  'verdant_vine_vale_01_entry',
  'verdant_vine_vale_02_slope',
  'verdant_vine_vale_03_bridge',
  'verdant_vine_vale_04_garden',
  'verdant_vine_vale_05_inner_hollow',
  'verdant_vine_vale_06_heart_gate',
];

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

  const counts: Record<string, number> = {};
  for (const mapId of verdantMapIds) {
    counts[mapId] = assertRuntimeMonsters(repository, mapId);
  }

  const rootMapMonsters = repository.createRuntimeMonstersForMap('cleft_blade_plain');
  assert.ok(rootMapMonsters.length > 0, 'root map fallback should still create monsters');

  console.log(JSON.stringify({
    ok: true,
    case: 'content-monster-spawn',
    verdantMapCounts: counts,
    rootMapCount: rootMapMonsters.length,
  }, null, 2));
}

main();

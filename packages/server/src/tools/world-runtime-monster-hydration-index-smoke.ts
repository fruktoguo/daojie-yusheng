import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

function createBlazewoodInstance() {
  const contentRepository = new ContentTemplateRepository();
  contentRepository.loadAll();
  const mapTemplateRepository = new MapTemplateRepository();
  mapTemplateRepository.loadAll();
  const mapId = 'blazewood_waste';
  return new MapInstanceRuntime({
    instanceId: `smoke:${mapId}:${Date.now()}`,
    template: mapTemplateRepository.getOrThrow(mapId),
    monsterSpawns: contentRepository.createRuntimeMonstersForMap(mapId),
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
}

function findBlazewoodKing(instance: MapInstanceRuntime) {
  const monster = instance.listMonsters().find((entry) => entry.monsterId === 'm_blazewood_king');
  assert.ok(monster, 'blazewood king should exist in smoke instance');
  return monster;
}

function assertHydratedAliveMonsterReindexesFinalTile() {
  const instance = createBlazewoodInstance();
  const monster = findBlazewoodKing(instance);
  const spawnX = monster.x;
  const spawnY = monster.y;
  const spawnTileIndex = instance.toTileIndex(spawnX, spawnY);
  const restoredX = spawnX;
  const restoredY = spawnY + 2;
  const restoredTileIndex = instance.toTileIndex(restoredX, restoredY);

  assert.equal(instance.monsterRuntimeIdByTile.get(spawnTileIndex), monster.runtimeId, 'template spawn tile should start indexed');
  instance.hydrateMonsterRuntimeStates([{
    runtimeId: monster.runtimeId,
    monsterId: monster.monsterId,
    monsterName: monster.name,
    monsterTier: monster.tier,
    monsterLevel: monster.level,
    tileIndex: restoredTileIndex,
    x: restoredX,
    y: restoredY,
    hp: monster.maxHp,
    maxHp: monster.maxHp,
    alive: true,
    respawnLeft: 0,
    respawnTicks: monster.respawnTicks,
    statePayload: {},
  }]);

  assert.equal(instance.monsterRuntimeIdByTile.has(spawnTileIndex), false, 'hydration should clear stale template spawn index');
  assert.equal(instance.monsterRuntimeIdByTile.get(restoredTileIndex), monster.runtimeId, 'hydration should index the final persisted monster tile');
  assert.equal(instance.isOpenTile(spawnX, spawnY), true, 'old template spawn tile should become open after monster moved by hydration');
  assert.equal(instance.isOpenTile(restoredX, restoredY), false, 'final monster tile should remain blocked by the live monster');
}

function assertHydratedDeadMonsterDoesNotOccupyTiles() {
  const instance = createBlazewoodInstance();
  const monster = findBlazewoodKing(instance);
  const spawnX = monster.x;
  const spawnY = monster.y;
  const spawnTileIndex = instance.toTileIndex(spawnX, spawnY);
  const restoredX = spawnX;
  const restoredY = spawnY + 2;
  const restoredTileIndex = instance.toTileIndex(restoredX, restoredY);

  instance.hydrateMonsterRuntimeStates([{
    runtimeId: monster.runtimeId,
    monsterId: monster.monsterId,
    monsterName: monster.name,
    monsterTier: monster.tier,
    monsterLevel: monster.level,
    tileIndex: restoredTileIndex,
    x: restoredX,
    y: restoredY,
    hp: 0,
    maxHp: monster.maxHp,
    alive: false,
    respawnLeft: monster.respawnTicks,
    respawnTicks: monster.respawnTicks,
    statePayload: {},
  }]);

  assert.equal(instance.monsterRuntimeIdByTile.has(spawnTileIndex), false, 'dead hydrated monster should clear stale spawn index');
  assert.equal(instance.monsterRuntimeIdByTile.has(restoredTileIndex), false, 'dead hydrated monster should not block its persisted tile');
  assert.equal(instance.isOpenTile(spawnX, spawnY), true, 'dead hydrated monster should leave old spawn tile open');
  assert.equal(instance.isOpenTile(restoredX, restoredY), true, 'dead hydrated monster should leave persisted tile open');
}

function main() {
  assertHydratedAliveMonsterReindexesFinalTile();
  assertHydratedDeadMonsterDoesNotOccupyTiles();
  process.stdout.write(JSON.stringify({
    ok: true,
    case: 'world-runtime-monster-hydration-index',
  }, null, 2));
  process.stdout.write('\n');
}

main();

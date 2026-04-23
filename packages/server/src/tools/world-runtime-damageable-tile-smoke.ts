// @ts-nocheck

import assert from 'node:assert/strict';

import { calculateTerrainDurability, getTileTraversalCost, TileType } from '@mud/shared';

import { WorldSyncMapSnapshotService } from '../network/world-sync-map-snapshot.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { findPathPointsOnMap } from '../runtime/world/world-runtime.path-planning.helpers';

function createTemplate() {
  return {
    id: 'tile_smoke_map',
    name: '地块摧毁 Smoke',
    width: 3,
    height: 3,
    terrainRows: [
      '.#.',
      '...',
      '...',
    ],
    walkableMask: Uint8Array.from([
      1, 0, 1,
      1, 1, 1,
      1, 1, 1,
    ]),
    blocksSightMask: Uint8Array.from([
      0, 1, 0,
      0, 0, 0,
      0, 0, 0,
    ]),
    baseAuraByTile: Int32Array.from({ length: 9 }, () => 0),
    baseTileResourceEntries: [],
    npcs: [],
    landmarks: [],
    containers: [],
    safeZones: [],
    portals: [],
    spawnX: 0,
    spawnY: 0,
    source: {},
  };
}

function createStoneTemplate(terrainRealmLv: number) {
  return {
    ...createTemplate(),
    terrainRows: [
      '.o.',
      '...',
      '...',
    ],
    walkableMask: Uint8Array.from([
      1, 0, 1,
      1, 1, 1,
      1, 1, 1,
    ]),
    blocksSightMask: Uint8Array.from([
      0, 1, 0,
      0, 0, 0,
      0, 0, 0,
    ]),
    source: {
      terrainRealmLv,
    },
  };
}

function createInstance(template = createTemplate()) {
  return new MapInstanceRuntime({
    instanceId: 'instance:tile-smoke',
    template,
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: 'Tile Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function createSnapshotService(instance: MapInstanceRuntime) {
  return new WorldSyncMapSnapshotService(
    {
      getInstanceTileState(instanceId: string, x: number, y: number) {
        assert.equal(instanceId, 'instance:tile-smoke');
        return {
          aura: 0,
          resources: [],
          combat: instance.getTileCombatState(x, y),
        };
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

function testDamagedTileShowsHpBarPayload() {
  const template = createTemplate();
  const instance = createInstance(template);
  const snapshotService = createSnapshotService(instance);
  const maxHp = instance.getTileCombatState(1, 0)?.maxHp ?? 0;

  assert.ok(maxHp > 0);
  instance.damageTile(1, 0, 1);

  const tile = snapshotService.buildTileSyncState(template, 'instance:tile-smoke', 1, 0);
  assert.equal(tile?.type, TileType.Wall);
  assert.equal(tile?.walkable, false);
  assert.equal(tile?.blocksSight, true);
  assert.equal(tile?.hpVisible, true);
  assert.equal(tile?.maxHp, maxHp);
  assert.equal(tile?.hp, maxHp - 1);
}

function testDestroyedTileTurnsIntoFloorProjection() {
  const template = createTemplate();
  const instance = createInstance(template);
  const snapshotService = createSnapshotService(instance);
  const destroyed = instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);

  assert.equal(destroyed?.destroyed, true);
  assert.equal(instance.isWalkable(1, 0), true);
  assert.equal(instance.isTileSightBlocked(1, 0), false);
  assert.equal(instance.getTileTraversalCost(1, 0), getTileTraversalCost(TileType.Floor));

  const tile = snapshotService.buildTileSyncState(template, 'instance:tile-smoke', 1, 0);
  assert.equal(tile?.type, TileType.Floor);
  assert.equal(tile?.walkable, true);
  assert.equal(tile?.blocksSight, false);
  assert.equal(tile?.hp, undefined);
  assert.equal(tile?.maxHp, undefined);
  assert.equal(tile?.hpVisible, undefined);
}

function testDestroyedTileBecomesPathReachable() {
  const instance = createInstance(createTemplate());

  const pathBeforeDestroy = findPathPointsOnMap(instance, 'player:smoke', 0, 0, [{ x: 1, y: 0 }]);
  assert.equal(pathBeforeDestroy, null);

  instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);

  const pathAfterDestroy = findPathPointsOnMap(instance, 'player:smoke', 0, 0, [{ x: 1, y: 0 }]);
  assert.deepEqual(pathAfterDestroy, [{ x: 1, y: 0 }]);
}

function testStoneDurabilityScalesWithTerrainRealmLv() {
  const lowRealmInstance = createInstance(createStoneTemplate(1));
  const highRealmInstance = createInstance(createStoneTemplate(10));

  const lowRealmHp = lowRealmInstance.getTileCombatState(1, 0)?.maxHp ?? 0;
  const highRealmHp = highRealmInstance.getTileCombatState(1, 0)?.maxHp ?? 0;

  assert.equal(lowRealmHp, calculateTerrainDurability(1, 50));
  assert.equal(highRealmHp, calculateTerrainDurability(10, 50));
  assert.ok(highRealmHp > lowRealmHp);
}

testDamagedTileShowsHpBarPayload();
testDestroyedTileTurnsIntoFloorProjection();
testDestroyedTileBecomesPathReachable();
testStoneDurabilityScalesWithTerrainRealmLv();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-damageable-tile' }, null, 2));

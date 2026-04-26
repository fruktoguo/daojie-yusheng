// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { TileType } = require("@mud/shared");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { findPathPointsOnMap } = require("../runtime/world/world-runtime.path-planning.helpers");

function main() {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "sparse_smoke",
    name: "稀疏地图烟测",
    width: 3,
    height: 3,
    routeDomain: "system",
    tiles: [
      "...",
      "...",
      "...",
    ],
    spawnPoint: { x: 1, y: 1 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: "public:sparse_smoke",
    template: templateRepository.getOrThrow("sparse_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "稀疏地图烟测",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });

  assert.equal(instance.isInBounds(4, 1), false);
  assert.equal(instance.activateRuntimeTile(3, 1, TileType.Floor).created, true);
  assert.equal(instance.activateRuntimeTile(4, 1, TileType.Floor).created, true);
  assert.equal(instance.activateRuntimeTile(4, 1, TileType.Stone).created, false);
  assert.equal(instance.getBaseTileType(4, 1), TileType.Floor);
  assert.equal(instance.isWalkable(4, 1), true);

  const path = findPathPointsOnMap(instance, "player:none", 1, 1, [{ x: 4, y: 1 }], true);
  assert.deepEqual(path, [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
  ]);

  assert.equal(instance.activateRuntimeTile(5, 1, TileType.Stone).created, true);
  const combat = instance.getTileCombatState(5, 1);
  assert.equal(combat.tileType, TileType.Stone);
  assert.ok(combat.maxHp > 0);
  const damaged = instance.damageTile(5, 1, combat.maxHp);
  assert.equal(damaged.destroyed, true);
  assert.equal(instance.getEffectiveTileType(5, 1), TileType.Floor);

  const runtimeTileEntries = instance.buildRuntimeTilePersistenceEntries();
  assert.deepEqual(runtimeTileEntries, [
    { x: 3, y: 1, tileType: TileType.Floor },
    { x: 4, y: 1, tileType: TileType.Floor },
    { x: 5, y: 1, tileType: TileType.Stone },
  ]);
  const restored = new MapInstanceRuntime({
    instanceId: "public:sparse_smoke_restored",
    template: templateRepository.getOrThrow("sparse_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "稀疏地图恢复烟测",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  restored.hydrateRuntimeTiles(runtimeTileEntries);
  assert.equal(restored.isInBounds(5, 1), true);
  assert.equal(restored.getBaseTileType(5, 1), TileType.Stone);

  console.log("world-runtime-sparse-map-smoke passed");
}

main();

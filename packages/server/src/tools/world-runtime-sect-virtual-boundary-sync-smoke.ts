// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { TileType } = require("@mud/shared");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");

function main() {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "sect_virtual_boundary_sync_smoke",
    name: "宗门虚拟边界同步烟测",
    width: 3,
    height: 3,
    routeDomain: "sect:virtual-boundary-sync",
    sectMap: true,
    sectId: "sect:virtual-boundary-sync",
    sectCoreX: 1,
    sectCoreY: 1,
    tiles: [
      "ooo",
      "oPo",
      "ooo",
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
    instanceId: "sect:virtual_boundary_sync_smoke",
    template: templateRepository.getOrThrow("sect_virtual_boundary_sync_smoke"),
    monsterSpawns: [],
    kind: "sect",
    persistent: true,
    createdAt: Date.now(),
    displayName: "宗门虚拟边界同步烟测",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "sect",
    defaultEntry: false,
    canDamageTile: true,
  });

  const virtualBoundary = instance.getTileCombatState(3, 1);
  assert.equal(virtualBoundary.virtualBoundary, true);
  assert.equal(virtualBoundary.tileType, TileType.Stone);
  assert.equal(instance.getEffectiveTileType(3, 1), TileType.Stone);
  assert.equal(instance.isTileSightBlocked(3, 1), true);

  instance.consumeStaticTileSyncDirtyTiles();
  const previousStaticRevision = instance.getStaticTileSyncRevision();
  const previousSightRevision = instance.sightBlockingRevision;

  const opened = instance.damageTile(3, 1, virtualBoundary.maxHp);
  assert.equal(opened.destroyed, true);
  assert.equal(opened.virtualBoundary, true);
  assert.equal(instance.getEffectiveTileType(3, 1), TileType.Floor);
  assert.equal(instance.isTileSightBlocked(3, 1), false);
  assert.equal(instance.sightBlockingRevision, previousSightRevision + 1);
  assert.ok(instance.getStaticTileSyncRevision() > previousStaticRevision);

  const staticPlan = instance.consumeStaticTileSyncDirtyTiles();
  assert.ok(staticPlan.tileKeys.includes("3,1"));

  const repeatedDirtyTileIndex = instance.toTileIndex(3, 1);
  const repeatedDirtyBaselineRevision = instance.getStaticTileSyncRevision();
  assert.equal(instance.markStaticTileSyncDirtyByIndex(repeatedDirtyTileIndex, { sightBlockingChanged: true }), true);
  const repeatedDirtyFirstRevision = instance.getStaticTileSyncRevision();
  assert.ok(repeatedDirtyFirstRevision > repeatedDirtyBaselineRevision);
  assert.equal(instance.markStaticTileSyncDirtyByIndex(repeatedDirtyTileIndex, { sightBlockingChanged: true }), false);
  assert.ok(instance.getStaticTileSyncRevision() > repeatedDirtyFirstRevision);
  const repeatedDirtyPlan = instance.consumeStaticTileSyncDirtyTiles();
  assert.equal(repeatedDirtyPlan.tileKeys.filter((key) => key === "3,1").length, 1);

  console.log("world-runtime-sect-virtual-boundary-sync-smoke passed");
}

main();

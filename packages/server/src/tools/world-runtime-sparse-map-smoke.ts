// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { TileType } = require("@mud/shared");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { findPathPointsOnMap } = require("../runtime/world/world-runtime.path-planning.helpers");
const { isHostileSkill } = require("../runtime/world/world-runtime.normalization.helpers");

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

  instance.connectPlayer({ playerId: "player:observer", sessionId: "session:observer", preferredX: 1, preferredY: 1 });
  instance.connectPlayer({ playerId: "player:target", sessionId: "session:target", preferredX: 4, preferredY: 1 });
  instance.containersById.set("sparse:container", {
    id: "sparse:container",
    name: "模板外宝箱",
    x: 4,
    y: 1,
    char: "箱",
    color: "#c18b46",
    grade: "common",
  });
  instance.monstersByRuntimeId.set("monster:sparse:1", {
    runtimeId: "monster:sparse:1",
    monsterId: "sparse_monster",
    name: "模板外妖兽",
    char: "兽",
    color: "#c44",
    tier: "mortal_blood",
    x: 4,
    y: 1,
    hp: 10,
    maxHp: 10,
    alive: true,
  });
  const view = instance.buildPlayerView("player:observer", 4);
  assert.ok(view.visibleTileKeys.includes("4,1"));
  assert.ok(view.visiblePlayers.some((entry) => entry.playerId === "player:target"));
  assert.ok(view.localContainers.some((entry) => entry.id === "sparse:container"));
  assert.ok(view.localMonsters.some((entry) => entry.runtimeId === "monster:sparse:1"));

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

  assert.equal(instance.activateRuntimeTile(6, 1, TileType.Floor).created, true);
  assert.equal(instance.canCreateTemporaryTile(6, 1), true);
  const temporary = instance.createTemporaryTile(6, 1, TileType.Stone, 123, 60, 10, {
    ownerPlayerId: 'player:observer',
    sourceSkillId: 'skill.yi_kunlun_point_stone',
  });
  assert.equal(temporary.created, true);
  assert.equal(instance.getEffectiveTileType(6, 1), TileType.Stone);
  assert.equal(instance.isWalkable(6, 1), false);
  assert.equal(instance.getTileCombatState(6, 1).hp, 123);
  assert.equal(instance.damageTile(6, 1, 23).hp, 100);
  assert.equal(instance.damageTile(6, 1, 100).destroyed, true);
  assert.equal(instance.getEffectiveTileType(6, 1), TileType.Floor);

  instance.createTemporaryTile(6, 1, TileType.Stone, 77, 60, 10);
  assert.equal(instance.advanceTemporaryTiles(69), false);
  assert.equal(instance.getEffectiveTileType(6, 1), TileType.Stone);
  assert.equal(instance.advanceTemporaryTiles(70), true);
  assert.equal(instance.getEffectiveTileType(6, 1), TileType.Floor);

  assert.equal(instance.activateRuntimeTile(7, 1, TileType.Floor).created, true);
  instance.createTemporaryTile(7, 1, TileType.Stone, 55, 60, 10);
  assert.equal(instance.advanceTemporaryTiles(999, () => true), false);
  assert.equal(instance.getEffectiveTileType(7, 1), TileType.Stone);
  assert.equal(instance.advanceTemporaryTiles(999, () => false), true);
  assert.equal(instance.getEffectiveTileType(7, 1), TileType.Floor);

  instance.createTemporaryTile(2, 2, TileType.Stone, 88, 60, 120, {
    ownerPlayerId: 'player:observer',
    sourceSkillId: 'skill.yi_kunlun_point_stone',
  });
  assert.equal(isHostileSkill({
    id: 'skill.yi_kunlun_point_stone',
    effects: [{ type: 'temporary_tile' }],
  }), false);
  const temporaryTileEntries = instance.buildTemporaryTilePersistenceEntries();
  assert.deepEqual(temporaryTileEntries, [
    {
      tileIndex: 8,
      x: 2,
      y: 2,
      tileType: TileType.Stone,
      hp: 88,
      maxHp: 88,
      expiresAtTick: 180,
      ownerPlayerId: 'player:observer',
      sourceSkillId: 'skill.yi_kunlun_point_stone',
      createdAt: temporaryTileEntries[0].createdAt,
      modifiedAt: temporaryTileEntries[0].modifiedAt,
    },
  ]);
  const restarted = new MapInstanceRuntime({
    instanceId: "public:sparse_smoke_restarted",
    template: templateRepository.getOrThrow("sparse_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "稀疏地图重启烟测",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  restarted.hydrateTemporaryTiles(temporaryTileEntries);
  assert.equal(restarted.getEffectiveTileType(2, 2), TileType.Stone);
  assert.equal(restarted.getTileCombatState(2, 2).hp, 88);
  assert.equal(restarted.advanceTemporaryTiles(179), false);
  assert.equal(restarted.getEffectiveTileType(2, 2), TileType.Stone);

  const destroyedBase = instance.activateRuntimeTile(8, 1, TileType.Stone);
  assert.equal(destroyedBase.created, true);
  instance.hydrateTileDamage([{
    tileIndex: destroyedBase.tileIndex,
    x: 8,
    y: 1,
    hp: 0,
    maxHp: 50,
    destroyed: true,
    respawnLeft: 1,
    modifiedAt: Date.now(),
  }]);
  assert.equal(instance.getEffectiveTileType(8, 1), TileType.Floor);
  assert.equal(instance.canCreateTemporaryTile(8, 1), true);
  assert.equal(instance.createTemporaryTile(8, 1, TileType.Stone, 33, 60, 200).created, true);
  assert.equal(instance.advanceTileRecovery(() => false), true);
  assert.equal(instance.damageTile(8, 1, 33).destroyed, true);
  const blockedRecoveryState = instance.getTileCombatState(8, 1);
  assert.equal(blockedRecoveryState.destroyed, true);
  assert.ok(blockedRecoveryState.respawnLeft > 0);

  console.log("world-runtime-sparse-map-smoke passed");
}

main();

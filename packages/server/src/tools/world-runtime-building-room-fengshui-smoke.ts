// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { TileType, calculateTerrainDurability } = require("@mud/shared");
const { RuntimeTilePlane } = require("../runtime/map/runtime-tile-plane");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { compileBuildingDefinitions } = require("../runtime/building/building-content.repository");
const { BuildingTopologyIndex } = require("../runtime/building/building-topology-index.service");
const {
  createRuntimeTilePlaneRoomCellProvider,
  detectRooms,
} = require("../runtime/building/room-detection.service");
const {
  calculateFengShuiSnapshot,
  compileFengShuiRules,
  inferRoomRole,
} = require("../runtime/building/fengshui-calculator.service");

function main() {
  const catalog = compileBuildingDefinitions([
    {
      id: "stone_wall",
      name: "石墙",
      placement: { layer: "structure", footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: true, blocksSight: true, roomBoundary: 100 },
      visual: { tileType: TileType.Wall },
      fengShui: { elementVector: { earth: 10 }, stability: 6 },
    },
    {
      id: "wooden_door",
      name: "木门",
      placement: { layer: "structure", footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: false, blocksSight: false, roomBoundary: 100, opening: "door" },
      visual: { tileType: TileType.Door },
      fengShui: { elementVector: { wood: 4 }, traits: ["opening.door"], qiLeak: 2 },
    },
    {
      id: "plain_floor",
      name: "地板",
      placement: { layer: "floor", footprint: [{ dx: 0, dy: 0 }] },
      topology: { roofCoverage: 100 },
      visual: { tileType: TileType.Floor },
      fengShui: { stability: 2 },
    },
    {
      id: "spirit_wood_shelf",
      name: "灵木架",
      placement: { layer: "furniture", footprint: [{ dx: 0, dy: 0 }] },
      fengShui: {
        elementVector: { wood: 30 },
        traits: ["storage.shelf", "element.wood_source"],
        comfort: 4,
      },
    },
    {
      id: "alchemy_furnace",
      name: "丹炉",
      placement: { layer: "facility", footprint: [{ dx: 0, dy: 0 }] },
      fengShui: {
        elementVector: { fire: 20 },
        traits: ["facility.alchemy.heat_source"],
        comfort: -2,
        stability: 4,
        shaEmit: 3,
      },
    },
    {
      id: "scripture_platform",
      name: "藏经台",
      placement: { layer: "facility", footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: true },
      fengShui: {
        elementVector: { wood: 18, earth: 4 },
        traits: ["facility.scripture_platform", "storage.scripture"],
        comfort: 3,
        stability: 10,
      },
    },
    {
      id: "jade_bed_extensible",
      name: "玉床",
      placement: { layer: "furniture", footprint: [{ dx: 0, dy: 0 }] },
      fengShui: {
        elementVector: { earth: 12 },
        traits: ["comfort.rest", "material.jade"],
        comfort: 18,
        stability: 8,
      },
    },
  ]);

  assert.equal(catalog.defs.length, 7);
  assert.ok(catalog.traitIdsByKey.get("facility.alchemy.heat_source") > 0);
  assert.ok(catalog.traitIdsByKey.get("comfort.rest") > 0);
  assert.ok(catalog.traitIdsByKey.get("facility.scripture_platform") > 0);

  const plane = new RuntimeTilePlane(25, 64);
  const topology = new BuildingTopologyIndex(plane.getCellCapacity());
  const floor = catalog.defById.get("plain_floor");
  const wall = catalog.defById.get("stone_wall");
  const door = catalog.defById.get("wooden_door");

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const cell = plane.activateCell(x, y, TileType.Floor);
      topology.applyBuildingToCells(floor, [cell]);
    }
  }

  for (let x = 0; x < 5; x += 1) {
    topology.applyBuildingToCells(x === 2 ? door : wall, [plane.getCellIndex(x, 0)]);
    topology.applyBuildingToCells(wall, [plane.getCellIndex(x, 4)]);
  }
  for (let y = 1; y < 4; y += 1) {
    topology.applyBuildingToCells(wall, [plane.getCellIndex(0, y)]);
    topology.applyBuildingToCells(wall, [plane.getCellIndex(4, y)]);
  }

  const provider = createRuntimeTilePlaneRoomCellProvider(plane, topology);
  const detection = detectRooms(provider, {
    instanceId: "test:building-room",
    role: "alchemy",
    topologyRevision: 1,
    contentRevision: 1,
    updatedAtTick: 7,
  });

  assert.equal(detection.deferredStartCells.length, 0);
  assert.equal(detection.rooms.length, 1);
  const room = detection.rooms[0];
  assert.equal(room.enclosed, true);
  assert.equal(room.area, 9);
  assert.equal(room.doorCount, 1);
  assert.equal(room.windowCount, 0);
  assert.equal(room.roofCoverageRatio, 100);
  assert.equal(detection.roomIdByCell[plane.getCellIndex(2, 2)], 1);

  const aggregate = createAggregate(room.id);
  addCompiledContribution(aggregate, catalog.defById.get("spirit_wood_shelf"), catalog);
  addCompiledContribution(aggregate, catalog.defById.get("alchemy_furnace"), catalog);
  aggregate.area = room.area;
  aggregate.perimeter = room.perimeter;
  aggregate.doorCount = room.doorCount;
  aggregate.windowCount = room.windowCount;
  aggregate.roofCoverage = room.roofCoverageRatio;
  aggregate.qiRaw = 1800;

  const rules = compileFengShuiRules(catalog, [
    {
      id: "closed_room",
      when: [{ enclosedIs: true }],
      scoreDelta: 80,
      reasonCode: "enclosure.closed",
      severity: "good",
    },
    {
      id: "alchemy_heat_source",
      when: [{ roomRoleIs: "alchemy" }, { traitAtLeast: ["facility.alchemy.heat_source", 1] }],
      scoreDelta: 60,
      reasonCode: "trait.alchemy_heat_source",
      severity: "good",
    },
    {
      id: "element_generates_function",
      when: [{ elementGeneratesFunction: true }],
      scoreDelta: 45,
      reasonCode: "element.generates_function",
      severity: "good",
    },
    {
      id: "qi_dense",
      when: [{ metricGte: ["qiDensity", 120] }],
      scoreDelta: 40,
      reasonCode: "qi.dense",
      severity: "good",
    },
    {
      id: "rest_furniture_extensible",
      when: [{ traitAtLeast: ["comfort.rest", 1] }],
      scoreDelta: 25,
      reasonCode: "trait.rest_comfort",
      severity: "good",
    },
  ]);

  let snapshot = calculateFengShuiSnapshot(room, aggregate, rules, { revision: 1, updatedAtTick: 8 });
  assert.equal(snapshot.primaryElement, "wood");
  assert.equal(snapshot.functionElement, "fire");
  assert.equal(snapshot.grade, "blessed");
  assert.equal(snapshot.reasons.some((reason) => reason.code === "element.generates_function"), true);
  assert.equal(snapshot.reasons.find((reason) => reason.code === "element.generates_function")?.delta, 135);
  assert.equal(snapshot.reasons.find((reason) => reason.code === "shell.closed")?.delta, 240);
  assert.equal(snapshot.reasons.some((reason) => reason.code === "trait.rest_comfort"), false);

  addCompiledContribution(aggregate, catalog.defById.get("jade_bed_extensible"), catalog);
  snapshot = calculateFengShuiSnapshot(room, aggregate, rules, { revision: 2, updatedAtTick: 9 });
  assert.equal(snapshot.reasons.some((reason) => reason.code === "comfort.good"), true);
  assert.ok(snapshot.score > 700);

  const storageAggregate = createAggregate(room.id);
  addCompiledContribution(storageAggregate, catalog.defById.get("spirit_wood_shelf"), catalog);
  assert.equal(inferRoomRole(catalog, room, storageAggregate).role, "storage");

  const mixedAggregate = createAggregate(room.id);
  addCompiledContribution(mixedAggregate, catalog.defById.get("alchemy_furnace"), catalog);
  addCompiledContribution(mixedAggregate, catalog.defById.get("jade_bed_extensible"), catalog);
  assert.equal(inferRoomRole(catalog, room, mixedAggregate).role, "generic");
  assertScripturePlatformProjectsAfterCompletion(catalog, rules);

  const leakingAggregate = createAggregate(room.id);
  addCompiledContribution(leakingAggregate, catalog.defById.get("alchemy_furnace"), catalog);
  leakingAggregate.area = room.area;
  leakingAggregate.roofCoverage = room.roofCoverageRatio;
  leakingAggregate.qiRaw = 1800;
  leakingAggregate.qiLeak = 2;
  const leakingRoom = { ...room, role: "alchemy" };
  const leakingSnapshot = calculateFengShuiSnapshot(leakingRoom, leakingAggregate, rules, { revision: 3, updatedAtTick: 10 });
  assert.equal(leakingSnapshot.reasons.some((reason) => reason.code === "qi.leak" && reason.delta < 0), true);
  assert.equal(leakingSnapshot.reasons.some((reason) => reason.code === "sha.exposed" && reason.delta < 0), true);

  const screenedAggregate = createAggregate(room.id);
  addCompiledContribution(screenedAggregate, catalog.defById.get("alchemy_furnace"), catalog);
  screenedAggregate.area = room.area;
  screenedAggregate.roofCoverage = room.roofCoverageRatio;
  screenedAggregate.qiRaw = 1800;
  screenedAggregate.shaReduce = 10;
  screenedAggregate.shaRaw = Math.max(0, screenedAggregate.shaEmit - screenedAggregate.shaReduce);
  const screenedSnapshot = calculateFengShuiSnapshot(leakingRoom, screenedAggregate, rules, { revision: 4, updatedAtTick: 11 });
  assert.equal(screenedSnapshot.reasons.some((reason) => reason.code === "sha.reduced" && reason.delta > 0), true);
  assert.ok(screenedSnapshot.score > leakingSnapshot.score);

  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "building_room_runtime_smoke",
    name: "建筑房间烟测",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑房间烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.configureBuildingRuntime(catalog, rules);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      assert.equal(instance.placeBuildingInstance({ defId: "plain_floor", x, y }).ok, true);
    }
  }
  const duplicateFloor = instance.placeBuildingInstance({ defId: "plain_floor", x: 2, y: 2 });
  assert.equal(duplicateFloor.ok, false);
  assert.equal(duplicateFloor.reason, "building_layer_overlap");
  const wallIds = [];
  for (let x = 0; x < 5; x += 1) {
    const top = instance.placeBuildingInstance({ defId: x === 2 ? "wooden_door" : "stone_wall", x, y: 0 });
    assert.equal(top.ok, true);
    if (x !== 2) wallIds.push(top.building.id);
    const bottom = instance.placeBuildingInstance({ defId: "stone_wall", x, y: 4 });
    assert.equal(bottom.ok, true);
    wallIds.push(bottom.building.id);
  }
  for (let y = 1; y < 4; y += 1) {
    const left = instance.placeBuildingInstance({ defId: "stone_wall", x: 0, y });
    const right = instance.placeBuildingInstance({ defId: "stone_wall", x: 4, y });
    assert.equal(left.ok, true);
    assert.equal(right.ok, true);
    wallIds.push(left.building.id, right.building.id);
  }
  assert.equal(instance.placeBuildingInstance({ defId: "alchemy_furnace", x: 2, y: 2 }).ok, true);
  assert.equal(instance.placeBuildingInstance({ defId: "spirit_wood_shelf", x: 1, y: 1 }).ok, true);
  const runtimeRooms = instance.listRoomSummaries();
  assert.equal(runtimeRooms.length, 1);
  assert.equal(runtimeRooms[0].enclosed, true);
  assert.equal(runtimeRooms[0].role, "alchemy");
  const runtimeFengShui = instance.getFengShuiSnapshotAt(2, 2);
  assert.ok(runtimeFengShui);
  assert.equal(runtimeFengShui.reasons.some((reason) => reason.code === "trait.alchemy_heat_source"), true);
  assert.ok(instance.buildBuildingPersistenceEntries().length >= 1);
  const persistenceState = instance.buildBuildingRoomFengShuiPersistenceState();
  assert.ok(persistenceState.buildings.some((entry) => entry.cells?.some((cell) => cell.previousTileType === TileType.Floor)));
  const recoveredInstance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑房间恢复烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  recoveredInstance.configureBuildingRuntime(catalog, rules);
  const hydrateResult = recoveredInstance.hydrateBuildingRoomFengShuiState(persistenceState);
  assert.equal(hydrateResult.rebuilt, true);
  assert.equal(recoveredInstance.buildingById.size, instance.buildingById.size);
  assert.equal(recoveredInstance.listRoomSummaries().length, 1);
  assert.ok(recoveredInstance.getFengShuiSnapshotAt(2, 2));
  const recoveredDamagedWall = recoveredInstance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 1);
  assert.ok(recoveredDamagedWall);
  assert.equal(recoveredInstance.damageTile(recoveredDamagedWall.x, recoveredDamagedWall.y, Number.MAX_SAFE_INTEGER).destroyed, true);
  assert.equal(recoveredInstance.listRoomSummaries().length, 0);
  assert.equal(recoveredInstance.getFengShuiSnapshotAt(2, 2), null);
  const recoveredWall = recoveredInstance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 2);
  assert.ok(recoveredWall);
  assert.equal(recoveredInstance.deconstructBuildingInstance(recoveredWall.id).ok, true);
  assert.equal(recoveredInstance.tilePlane.getTileType(recoveredInstance.toTileIndex(0, 2)), TileType.Floor);

  const wallToOpen = instance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 2);
  assert.ok(wallToOpen);
  const removed = instance.deconstructBuildingInstance(wallToOpen.id);
  assert.equal(removed.ok, true);
  const openRooms = instance.listRoomSummaries();
  assert.equal(openRooms.length, 0);
  const openedFengShui = instance.getFengShuiSnapshotAt(2, 2);
  assert.equal(openedFengShui, null);

  const staticTemplateRepository = new MapTemplateRepository();
  staticTemplateRepository.registerRuntimeMapTemplate({
    id: "static_room_damage_smoke",
    name: "静态房间破坏烟测",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      "#####",
      "#...#",
      "+...#",
      "#...#",
      "#####",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const staticInstance = new MapInstanceRuntime({
    instanceId: "real:static_room_damage_smoke",
    template: staticTemplateRepository.getOrThrow("static_room_damage_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "静态房间破坏烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  staticInstance.configureBuildingRuntime(catalog, rules);
  const staticRooms = staticInstance.listRoomSummaries();
  assert.equal(staticRooms.length, 1);
  assert.equal(staticRooms[0].area, 9);
  assert.equal(staticRooms[0].doorCount, 1);
  const staticInitialFengShui = staticInstance.getFengShuiSnapshotAt(2, 2);
  assert.ok(staticInitialFengShui);
  const damagedWall = staticInstance.damageTile(0, 1, 1);
  assert.ok(damagedWall);
  assert.equal(damagedWall.destroyed, false);
  const staticDamagedFengShui = staticInstance.getFengShuiSnapshotAt(2, 2);
  assert.ok(staticDamagedFengShui);
  assert.ok(staticDamagedFengShui.score < staticInitialFengShui.score);
  assert.equal(staticDamagedFengShui.reasons.some((reason) => reason.code === "integrity.penalty"), true);
  const brokenWall = staticInstance.damageTile(0, 1, Number.MAX_SAFE_INTEGER);
  assert.ok(brokenWall);
  assert.equal(brokenWall.destroyed, true);
  assert.equal(staticInstance.listRoomSummaries().length, 0);
  assert.equal(staticInstance.getFengShuiSnapshotAt(2, 2), null);
  staticTemplateRepository.registerRuntimeMapTemplate({
    id: "static_outdoor_wall_ground_smoke",
    name: "静态室外墙地面烟测",
    width: 3,
    height: 3,
    routeDomain: "system",
    tiles: [",,,", ",#,", ",,,"],
    spawnPoint: { x: 1, y: 1 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const outdoorWallInstance = new MapInstanceRuntime({
    instanceId: "real:static_outdoor_wall_ground_smoke",
    template: staticTemplateRepository.getOrThrow("static_outdoor_wall_ground_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "静态室外墙地面烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  assert.equal(outdoorWallInstance.getTileLayerState(1, 1)?.terrain, "grass");
  assert.equal(outdoorWallInstance.damageTile(1, 1, Number.MAX_SAFE_INTEGER).destroyed, true);
  assert.equal(outdoorWallInstance.getEffectiveTileType(1, 1), TileType.Grass);
  assert.equal(outdoorWallInstance.getTileLayerState(1, 1)?.legacyTileType, TileType.Grass);
  staticTemplateRepository.registerRuntimeMapTemplate({
    id: "static_stone_build_block_smoke",
    name: "静态石块建造阻挡烟测",
    width: 3,
    height: 3,
    routeDomain: "system",
    tiles: ["...", ".o.", "..."],
    spawnPoint: { x: 0, y: 0 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const staticStoneBuildInstance = new MapInstanceRuntime({
    instanceId: "real:static_stone_build_block_smoke",
    template: staticTemplateRepository.getOrThrow("static_stone_build_block_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "静态石块建造阻挡烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  staticStoneBuildInstance.configureBuildingRuntime(catalog, rules);
  const blockedByStone = staticStoneBuildInstance.placeBuildingInstance({ defId: "stone_wall", x: 1, y: 1 });
  assert.equal(blockedByStone.ok, false);
  assert.equal(blockedByStone.reason, "tile_not_clear");
  assert.equal(staticStoneBuildInstance.damageTile(1, 1, Number.MAX_SAFE_INTEGER).destroyed, true);
  assert.equal(staticStoneBuildInstance.getEffectiveTileType(1, 1), TileType.Floor);
  const buildAfterStoneDestroyed = staticStoneBuildInstance.placeBuildingInstance({ defId: "stone_wall", x: 1, y: 1 });
  assert.equal(buildAfterStoneDestroyed.ok, true);
  const yunlaiRepository = new MapTemplateRepository();
  yunlaiRepository.loadAll();
  const yunlaiReplaceWallInstance = new MapInstanceRuntime({
    instanceId: "real:yunlai_replace_static_wall_smoke",
    template: yunlaiRepository.getOrThrow("yunlai_town"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "云来镇替换静态墙烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  yunlaiReplaceWallInstance.configureBuildingRuntime(catalog, rules);
  const replaceX = 14;
  const replaceY = 43;
  const replaceTileIndex = yunlaiReplaceWallInstance.toTileIndex(replaceX, replaceY);
  assert.equal(yunlaiReplaceWallInstance.getTileLayerState(replaceX, replaceY)?.legacyTileType, TileType.Wall);
  assert.equal(yunlaiReplaceWallInstance.damageTile(replaceX, replaceY, Number.MAX_SAFE_INTEGER).destroyed, true);
  const demolishedGroundType = yunlaiReplaceWallInstance.getEffectiveTileType(replaceX, replaceY);
  assert.notEqual(demolishedGroundType, TileType.Wall);
  assert.equal(yunlaiReplaceWallInstance.getTileLayerState(replaceX, replaceY)?.structure, null);
  const replacement = yunlaiReplaceWallInstance.placeBuildingInstance({
    requestId: "build:req:replace-static-wall",
    defId: "stone_wall",
    x: replaceX,
    y: replaceY,
    state: "building",
    buildStrength: 1,
    buildRemainingTicks: 1,
    ownerPlayerId: "player:replace-wall",
  });
  assert.equal(replacement.ok, true);
  yunlaiReplaceWallInstance.playersById.set("player:replace-wall", { playerId: "player:replace-wall", x: replaceX, y: replaceY - 1 });
  assert.equal(yunlaiReplaceWallInstance.startBuildingConstruction(replacement.building.id, "player:replace-wall").ok, true);
  const replaceAutoTick = yunlaiReplaceWallInstance.tickOnce();
  assert.equal(replaceAutoTick.completedBuildings.length, 0);
  assert.equal(replacement.building.state, "building");
  assert.equal(replacement.building.buildRemainingTicks, 1);
  const replacePlayer = {
    playerId: "player:replace-wall",
    dirtyDomains: new Set(),
    buildingSkill: { level: 1, exp: 0, expToNext: 60 },
    buildingJob: {
      buildingId: replacement.building.id,
      buildingName: "石墙",
      instanceId: yunlaiReplaceWallInstance.meta.instanceId,
      remainingTicks: 1,
      totalTicks: 1,
      workRemainingTicks: 1,
      workTotalTicks: 1,
      phase: "building",
    },
  };
  const replaceRuntime = Object.create(WorldRuntimeService.prototype);
  replaceRuntime.contentTemplateRepository = {};
  replaceRuntime.playerRuntimeService = {
    getPlayer(playerId) {
      return playerId === replacePlayer.playerId ? replacePlayer : null;
    },
    markPersistenceDirtyDomains(player, domains) {
      for (const domain of domains) {
        player.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(player) {
      player.persistentRevision = (player.persistentRevision ?? 0) + 1;
    },
  };
  replaceRuntime.getInstanceRuntime = () => yunlaiReplaceWallInstance;
  replaceRuntime.refreshPlayerContextActions = () => {};
  const replaceCompletionResult = WorldRuntimeService.prototype.tickBuildingConstruction.call(
    replaceRuntime,
    replacePlayer.playerId,
  );
  assert.equal(replaceCompletionResult.ok, true);
  assert.equal(replacement.building.state, "active");
  assert.equal(replacePlayer.buildingJob, null);
  assert.equal(yunlaiReplaceWallInstance.tileDamageByTile.has(replaceTileIndex), false);
  assert.equal(yunlaiReplaceWallInstance.getEffectiveTileType(replaceX, replaceY), TileType.Wall);
  assert.equal(yunlaiReplaceWallInstance.getTileLayerState(replaceX, replaceY)?.legacyTileType, TileType.Wall);
  assert.equal(yunlaiReplaceWallInstance.deconstructBuildingInstance(replacement.building.id).ok, true);
  assert.equal(yunlaiReplaceWallInstance.getEffectiveTileType(replaceX, replaceY), demolishedGroundType);
  const yunlaiInstance = new MapInstanceRuntime({
    instanceId: "real:yunlai_room_guard_smoke",
    template: yunlaiRepository.getOrThrow("yunlai_town"),
    monsterSpawns: [],
    kind: "public",
    persistent: false,
    createdAt: Date.now(),
    displayName: "云来镇房间守卫烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const yunlaiRooms = yunlaiInstance.listRoomSummaries();
  assert.ok(yunlaiRooms.length >= 4);
  assert.equal(yunlaiRooms.some((room) => room.area > 256 && room.roofCoverageRatio < 60), false);
  for (const yunlaiRoom of yunlaiRooms) {
    const snapshot = yunlaiInstance.getFengShuiSnapshot(yunlaiRoom.id);
    if (yunlaiRoom.role === "generic") {
      assert.ok(snapshot.score <= 520);
      if (snapshot.score === 300) {
        assert.equal(snapshot.grade, "minor_good");
      }
    }
  }
  const yunlaiApothecaryRoom = yunlaiInstance.getBuildingRoomFengShuiAt(40, 38)?.room;
  assert.ok(yunlaiApothecaryRoom);
  assert.ok(yunlaiApothecaryRoom.area < 256);
  const cellarInstance = new MapInstanceRuntime({
    instanceId: "real:yunlai_cellar_room_smoke",
    template: yunlaiRepository.getOrThrow("yunlai_town_apothecary_cellar"),
    monsterSpawns: [],
    kind: "public",
    persistent: false,
    createdAt: Date.now(),
    displayName: "云来镇药铺地窖房间烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const cellarRooms = cellarInstance.listRoomSummaries();
  assert.ok(cellarRooms.length >= 1);
  assert.ok(cellarRooms.some((room) => room.area > 100 && room.doorCount >= 1));
  assert.ok(cellarInstance.getFengShuiSnapshotAt(8, 9));

  const commandTemplateRepository = new MapTemplateRepository();
  commandTemplateRepository.registerRuntimeMapTemplate({
    id: "building_command_runtime_smoke",
    name: "建筑命令烟测",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const commandInstance = new MapInstanceRuntime({
    instanceId: "real:building_command_runtime_smoke",
    template: commandTemplateRepository.getOrThrow("building_command_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑命令烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const commandPlayer = {
    playerId: "player:building:1",
    sectId: "sect:building:1",
    hp: 100,
    dirtyDomains: new Set(),
    buildingSkill: {
      level: 4,
      exp: 0,
      expToNext: 96,
    },
    inventory: {
      revision: 1,
      items: [
        { itemId: "earthbearing_stone", name: "承脉石", type: "material", materialCategory: "ore", count: 4 },
        { itemId: "spiritwood_heart", name: "生灵木心", type: "material", materialCategory: "exotic", count: 4 },
      ],
    },
  };
  commandInstance.playersById.set(commandPlayer.playerId, { playerId: commandPlayer.playerId, x: 2, y: 2 });
  const commandRuntime = Object.create(WorldRuntimeService.prototype);
  commandRuntime.tick = 77;
  commandRuntime.buildingOperationResultsByKey = new Map();
  commandRuntime.buildingOperationAuditLog = [];
  commandRuntime.playerRuntimeService = {
    getPlayer(playerId) {
      return playerId === commandPlayer.playerId ? commandPlayer : null;
    },
    consumeInventoryItemByItemId(_playerId, itemId, count) {
      const item = commandPlayer.inventory.items.find((entry) => entry.itemId === itemId);
      assert.ok(item);
      assert.ok(item.count >= count);
      item.count -= count;
      commandPlayer.inventory.revision += 1;
    },
    bumpPersistentRevision(player) {
      player.persistentRevision = (player.persistentRevision ?? 0) + 1;
    },
    markPersistenceDirtyDomains(player, domains) {
      if (!(player.dirtyDomains instanceof Set)) {
        player.dirtyDomains = new Set();
      }
      for (const domain of domains) {
        player.dirtyDomains.add(domain);
      }
    },
  };
  commandRuntime.getPlayerLocationOrThrow = () => ({ instanceId: commandInstance.meta.instanceId });
  commandRuntime.getInstanceRuntimeOrThrow = () => commandInstance;
  commandRuntime.getInstanceRuntime = () => commandInstance;
  commandRuntime.refreshPlayerContextActions = () => {};
  const buildStrength = 30;
  const placeResult = WorldRuntimeService.prototype.handleBuildPlaceIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "build:req:1",
    defId: "stone_wall",
    x: 1,
    y: 1,
    buildStrength,
    selectedMaterialItemIds: ["earthbearing_stone"],
  });
  assert.equal(placeResult.ok, true);
  assert.equal(placeResult.building.defId, "stone_wall");
  assert.equal(placeResult.building.state, "building");
  assert.equal(placeResult.building.buildStrength, buildStrength);
  assert.equal(placeResult.building.builderSkillLevel, commandPlayer.buildingSkill.level);
  assert.equal(placeResult.building.buildRemainingTicks, buildStrength);
  assert.equal(placeResult.building.activeBuilderPlayerId, null);
  const commandWallCompiled = commandInstance.buildingCatalog.defById.get("stone_wall");
  assert.equal(commandWallCompiled?.durabilityMultiplier, 50);
  const expectedWallMaxHp = Math.max(
    1,
    Math.trunc(
      calculateTerrainDurability(
        commandPlayer.buildingSkill.level,
        Math.max(0.01, Number(commandWallCompiled?.durabilityMultiplier ?? 1)),
      ) * buildStrength,
    ),
  );
  assert.equal(placeResult.building.maxHp, expectedWallMaxHp);
  const commandBuilding = commandInstance.buildingById.get(placeResult.building.id);
  assert.ok(commandBuilding);
  assert.equal(commandInstance.tilePlane.getTileType(commandInstance.toTileIndex(1, 1)), TileType.Floor);
  assert.equal(commandPlayer.buildingSkill.exp, 0);
  assert.equal(commandPlayer.inventory.items.find((entry) => entry.itemId === "earthbearing_stone").count, 3);
  const duplicatePlaceResult = WorldRuntimeService.prototype.handleBuildPlaceIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "build:req:1",
    defId: "stone_wall",
    x: 1,
    y: 1,
    selectedMaterialItemIds: ["earthbearing_stone"],
  });
  assert.equal(duplicatePlaceResult.ok, true);
  assert.equal(duplicatePlaceResult.duplicate, true);
  assert.equal(commandPlayer.inventory.items.find((entry) => entry.itemId === "earthbearing_stone").count, 3);
  const startBuildResult = WorldRuntimeService.prototype.handleStartBuildingConstruction.call(
    commandRuntime,
    commandPlayer.playerId,
    placeResult.building.id,
  );
  assert.equal(startBuildResult.ok, true);
  assert.equal(startBuildResult.building.activeBuilderPlayerId, commandPlayer.playerId);
  WorldRuntimeService.prototype.dispatchStartBuildingConstruction.call(commandRuntime, commandPlayer.playerId, placeResult.building.id);
  assert.equal(commandPlayer.buildingJob.remainingTicks, buildStrength);
  let previousBuildingExp = commandPlayer.buildingSkill.exp;
  for (let index = 0; index < buildStrength - 1; index += 1) {
    const pendingTick = commandInstance.tickOnce();
    assert.equal(pendingTick.completedBuildings.length, 0);
    assert.equal(commandBuilding.buildRemainingTicks, buildStrength - index);
    const tickResult = WorldRuntimeService.prototype.tickBuildingConstruction.call(commandRuntime, commandPlayer.playerId);
    assert.equal(tickResult.ok, true);
    assert.ok(commandPlayer.buildingSkill.exp > previousBuildingExp);
    assert.equal(commandPlayer.buildingJob.remainingTicks, buildStrength - index - 1);
    previousBuildingExp = commandPlayer.buildingSkill.exp;
  }
  const completionTick = commandInstance.tickOnce();
  assert.equal(completionTick.completedBuildings.length, 0);
  assert.equal(commandBuilding.state, "building");
  const completionResult = WorldRuntimeService.prototype.tickBuildingConstruction.call(commandRuntime, commandPlayer.playerId);
  assert.equal(completionResult.ok, true);
  assert.equal(commandBuilding.state, "active");
  assert.ok(commandPlayer.buildingSkill.exp > previousBuildingExp);
  const finalBuildingExp = commandPlayer.buildingSkill.exp;
  assert.equal(commandPlayer.buildingJob, null);
  assert.equal(commandInstance.tilePlane.getTileType(commandInstance.toTileIndex(1, 1)), TileType.Wall);
  const completedWallCombat = commandInstance.getTileCombatState(1, 1);
  assert.equal(completedWallCombat?.building, true);
  assert.equal(completedWallCombat?.hp, expectedWallMaxHp);
  assert.equal(completedWallCombat?.maxHp, expectedWallMaxHp);
  const damagedBuiltWall = commandInstance.damageTile(1, 1, 10);
  assert.equal(damagedBuiltWall?.building, true);
  assert.equal(damagedBuiltWall?.hp, expectedWallMaxHp - 10);
  assert.equal(commandInstance.tileDamageByTile.has(commandInstance.toTileIndex(1, 1)), false);
  WorldRuntimeService.prototype.tickBuildingConstruction.call(commandRuntime, commandPlayer.playerId);
  assert.equal(commandPlayer.buildingSkill.exp, finalBuildingExp);
  assert.equal(commandPlayer.dirtyDomains.has("profession"), true);
  const roomPatch = WorldRuntimeService.prototype.buildCurrentRoomSummaryPatch.call(commandRuntime, commandPlayer.playerId);
  assert.equal(roomPatch.instanceId, commandInstance.meta.instanceId);
  const observe = WorldRuntimeService.prototype.buildFengShuiObserveView.call(commandRuntime, commandPlayer.playerId, {
    x: 2,
    y: 2,
    overlay: true,
  });
  assert.ok(observe.overlay);
  assertWangQiObserveRespectsPlayerView();
  const deconstructResult = WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:1",
    buildingId: placeResult.building.id,
  });
  assert.equal(deconstructResult.ok, true);
  const duplicateDeconstructResult = WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:1",
    buildingId: placeResult.building.id,
  });
  assert.equal(duplicateDeconstructResult.ok, true);
  assert.equal(duplicateDeconstructResult.duplicate, true);
  assert.ok(commandRuntime.listBuildingOperationAudit(10).length >= 2);
  assert.equal(typeof commandInstance.lastBuildingRoomRebuildStats.durationMs, "number");
  assert.equal(Array.isArray(commandInstance.buildingRoomDeferredStartCells), true);
  assert.equal(commandInstance.repairBuildingRoomFengShuiState().ok, true);

  console.log("world-runtime-building-room-fengshui-smoke passed");
}

function assertWangQiObserveRespectsPlayerView() {
  const playerId = "player:wangqi:fov";
  const visibleRoom = createRoomSummary("room:visible", 1, 1);
  const hiddenRoom = createRoomSummary("room:hidden", 2, 1);
  const visibleSnapshot = createFengShuiSnapshot("room:visible", 10);
  const hiddenSnapshot = createFengShuiSnapshot("room:hidden", -20);
  const instance = {
    meta: { instanceId: "test:wangqi:fov" },
    playersById: new Map([[playerId, { playerId, x: 1, y: 1 }]]),
    tilePlane: {
      getCellCount: () => 2,
      getX: (cellIndex) => cellIndex === 0 ? 1 : 2,
      getY: () => 1,
    },
    roomIdByCell: Int32Array.from([1, 2]),
    roomIdsByHandle: [undefined, "room:visible", "room:hidden"],
    roomsById: new Map([
      ["room:visible", visibleRoom],
      ["room:hidden", hiddenRoom],
    ]),
    fengShuiByRoomId: new Map([
      ["room:visible", visibleSnapshot],
      ["room:hidden", hiddenSnapshot],
    ]),
    getPersistenceRevision: () => 1,
    isInBounds: (x, y) => (x === 1 || x === 2) && y === 1,
    toTileIndex: (x, y) => (x === 1 && y === 1 ? 0 : x === 2 && y === 1 ? 1 : -1),
    getFengShuiSnapshot: (roomId) => roomId === "room:visible" ? visibleSnapshot : roomId === "room:hidden" ? hiddenSnapshot : null,
    getFengShuiSnapshotAt: (x, y) => x === 1 && y === 1 ? visibleSnapshot : x === 2 && y === 1 ? hiddenSnapshot : null,
  };
  const runtime = Object.create(WorldRuntimeService.prototype);
  runtime.playerRuntimeService = {
    getPlayer: (id) => id === playerId ? { playerId } : null,
  };
  runtime.getPlayerLocationOrThrow = () => ({ instanceId: instance.meta.instanceId });
  runtime.getInstanceRuntimeOrThrow = () => instance;
  runtime.getPlayerView = () => ({
    visibleTileIndices: [0],
    visibleTileKeys: ["1,1"],
  });

  const overlayView = WorldRuntimeService.prototype.buildFengShuiObserveView.call(runtime, playerId, {
    x: 2,
    y: 1,
    overlay: true,
  });
  assert.deepEqual(overlayView.overlay.cells.map((cell) => `${cell.x},${cell.y}`), ["1,1"]);
  assert.equal(overlayView.detail, null);

  const hiddenRoomView = WorldRuntimeService.prototype.buildFengShuiObserveView.call(runtime, playerId, {
    roomId: "room:hidden",
    overlay: false,
  });
  assert.equal(hiddenRoomView.detail, null);

  const visibleRoomView = WorldRuntimeService.prototype.buildFengShuiObserveView.call(runtime, playerId, {
    roomId: "room:visible",
    overlay: false,
  });
  assert.equal(visibleRoomView.detail?.room.id, "room:visible");
}

function createRoomSummary(id, x, y) {
  return {
    id,
    instanceId: "test:wangqi:fov",
    role: "generic",
    enclosed: true,
    semiOutdoor: false,
    minX: x,
    minY: y,
    maxX: x,
    maxY: y,
    area: 1,
    perimeter: 4,
    doorCount: 0,
    windowCount: 0,
    roofCoverageRatio: 100,
    roomHash: id,
    topologyRevision: 1,
    contentRevision: 1,
    updatedAtTick: 1,
  };
}

function createFengShuiSnapshot(roomId, score) {
  return {
    instanceId: "test:wangqi:fov",
    roomId,
    score,
    grade: score >= 0 ? "plain" : "bad",
    primaryElement: "earth",
    functionElement: "earth",
    shapeScore: 0,
    enclosureScore: 0,
    qiScore: 0,
    shaScore: 0,
    comfortScore: 0,
    integrityScore: 0,
    elementScore: 0,
    formationScore: 0,
    reasons: [],
    revision: 1,
    updatedAtTick: 1,
  };
}

function assertScripturePlatformProjectsAfterCompletion(catalog, rules) {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "scripture_platform_projection_smoke",
    name: "藏经台投影烟测",
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
    instanceId: "real:scripture_platform_projection_smoke",
    template: templateRepository.getOrThrow("scripture_platform_projection_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "藏经台投影烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.configureBuildingRuntime(catalog, rules);
  const result = instance.placeBuildingInstance({
    buildingId: "building:scripture:projection",
    defId: "scripture_platform",
    x: 1,
    y: 1,
    state: "active",
  });
  assert.equal(result.ok, true);
  const projected = instance.collectLocalBuildings(1, 1, 5);
  assert.equal(projected.some((entry) => entry.id === "building:scripture:projection" && entry.name === "藏经台"), true);
}

function createAggregate(roomId) {
  return {
    roomId,
    area: 0,
    perimeter: 0,
    doorCount: 0,
    windowCount: 0,
    roofCoverage: 0,
    elementVector: new Int32Array(5),
    traitCounts: new Map(),
    traitKeys: new Set(),
    comfort: 0,
    stability: 0,
    qiRaw: 0,
    qiAffinity: 0,
    qiLeak: 0,
    shaRaw: 0,
    shaEmit: 0,
    shaReduce: 0,
    integrityPenalty: 0,
    formationScore: 0,
    topologyRevision: 1,
    aggregateRevision: 1,
  };
}

function addCompiledContribution(aggregate, compiled, catalog) {
  for (let index = 0; index < compiled.elementVector.length; index += 1) {
    aggregate.elementVector[index] += compiled.elementVector[index];
  }
  for (const traitId of compiled.traitIds) {
    aggregate.traitCounts.set(traitId, (aggregate.traitCounts.get(traitId) ?? 0) + 1);
    const traitKey = catalog?.traitKeysById?.[traitId];
    if (traitKey) aggregate.traitKeys.add(traitKey);
  }
  aggregate.comfort += compiled.fengShuiContrib[0] ?? 0;
  aggregate.stability += compiled.fengShuiContrib[1] ?? 0;
  aggregate.qiAffinity += Math.max(0, compiled.fengShuiContrib[2] ?? 0);
  aggregate.qiLeak += Math.max(0, compiled.fengShuiContrib[3] ?? 0);
  aggregate.shaEmit += Math.max(0, compiled.fengShuiContrib[4] ?? 0);
  aggregate.shaReduce += Math.max(0, compiled.fengShuiContrib[5] ?? 0);
  aggregate.shaRaw = Math.max(0, aggregate.shaEmit - aggregate.shaReduce);
}

main();

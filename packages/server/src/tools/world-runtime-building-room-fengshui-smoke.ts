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

/**
 * isolateSpawnFromBuildArea：把烟测地图的出生点移出地图。
 *
 * 建筑禁建区包含出生点周围 3x3，而烟测地图只有 3x3~5x5，
 * 出生点保护区会覆盖整个建造区。这里把出生点移出地图，
 * 让既有用例只验证被测规则；出生点禁建由 assertBuildingProtectedPlacementRules 专项覆盖。
 */
function isolateSpawnFromBuildArea(repository, templateId) {
  const template = repository.getOrThrow(templateId);
  template.spawnX = -1000;
  template.spawnY = -1000;
  return template;
}

/** createProtectedPlacementInstance：9x9 空地，出生点 (8,8)，用于验证建筑禁建区。 */
function createProtectedPlacementInstance(catalog, rules, instanceId) {
  const repository = new MapTemplateRepository();
  repository.registerRuntimeMapTemplate({
    id: "building_protected_placement_smoke",
    name: "建筑禁建区烟测",
    width: 9,
    height: 9,
    routeDomain: "system",
    tiles: Array.from({ length: 9 }, () => "........."),
    spawnPoint: { x: 8, y: 8 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId,
    template: repository.getOrThrow("building_protected_placement_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑禁建区烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.configureBuildingRuntime(catalog, rules);
  return instance;
}

/** assertBuildingProtectedPlacementRules：建筑禁建区必须覆盖保护点位周围 3x3，避免把传送点/NPC/出生点围死。 */
function assertBuildingProtectedPlacementRules(catalog, rules) {
  // 出生点 (8,8) 的 3x3 为 (7,7)..(8,8)。
  const spawnInstance = createProtectedPlacementInstance(catalog, rules, "real:building_protected_spawn_smoke");
  const spawnBlocked = spawnInstance.placeBuildingInstance({ defId: "stone_wall", x: 7, y: 7 });
  assert.equal(spawnBlocked.ok, false);
  assert.equal(spawnBlocked.reason, "protected_placement_spawn");
  assert.equal(spawnInstance.placeBuildingInstance({ defId: "stone_wall", x: 6, y: 6 }).ok, true);

  // 传送点 (2,2) 的 3x3 邻域禁建，第 2 圈放行。
  const portalInstance = createProtectedPlacementInstance(catalog, rules, "real:building_protected_portal_ring_smoke");
  portalInstance.getPortalAtTile = (x, y) => (x === 2 && y === 2 ? { id: "portal:ring", x, y } : null);
  const portalAdjacent = portalInstance.placeBuildingInstance({ defId: "stone_wall", x: 3, y: 3 });
  assert.equal(portalAdjacent.ok, false);
  assert.equal(portalAdjacent.reason, "protected_placement_portal");
  assert.equal(portalInstance.placeBuildingInstance({ defId: "stone_wall", x: 4, y: 4 }).ok, true);

  // NPC (5,0) 的 3x3 邻域禁建。
  const npcInstance = createProtectedPlacementInstance(catalog, rules, "real:building_protected_npc_ring_smoke");
  npcInstance.npcIdByTile.set(npcInstance.toTileIndex(5, 0), "npc:protected");
  const npcAdjacent = npcInstance.placeBuildingInstance({ defId: "stone_wall", x: 4, y: 1 });
  assert.equal(npcAdjacent.ok, false);
  assert.equal(npcAdjacent.reason, "protected_placement_npc");
  assert.equal(npcInstance.placeBuildingInstance({ defId: "stone_wall", x: 3, y: 2 }).ok, true);

  // 其它传送点落在本图的着陆格 (0,6)，其 3x3 邻域同样禁建。
  const landingInstance = createProtectedPlacementInstance(catalog, rules, "real:building_protected_landing_smoke");
  landingInstance.listAllPortals = () => [
    { id: "portal:landing", x: 0, y: 0, targetMapId: "building_protected_placement_smoke", targetX: 0, targetY: 6 },
  ];
  const landingAdjacent = landingInstance.placeBuildingInstance({ defId: "stone_wall", x: 1, y: 7 });
  assert.equal(landingAdjacent.ok, false);
  assert.equal(landingAdjacent.reason, "protected_placement_portal");
  assert.equal(landingInstance.placeBuildingInstance({ defId: "stone_wall", x: 2, y: 6 }).ok, true);

  // 宗门山门（带 sectId）只保护本格，否则宗门无法在自家山门旁营建。
  const sectInstance = createProtectedPlacementInstance(catalog, rules, "real:building_protected_sect_portal_smoke");
  sectInstance.getPortalAtTile = (x, y) => (x === 2 && y === 2 ? { id: "portal:sect", x, y, sectId: "sect:alpha" } : null);
  assert.equal(sectInstance.placeBuildingInstance({ defId: "stone_wall", x: 3, y: 3 }).ok, true);
  const sectCenter = sectInstance.placeBuildingInstance({ defId: "stone_wall", x: 2, y: 2 });
  assert.equal(sectCenter.ok, false);
  assert.equal(sectCenter.reason, "protected_placement_portal");

  // 启动自检：邻域违规的存量建筑必须被摧毁，并带出 owner 供宝库返还。
  const hydrateInstance = createProtectedPlacementInstance(catalog, rules, "real:building_protected_hydrate_ring_smoke");
  hydrateInstance.getPortalAtTile = (x, y) => (x === 2 && y === 2 ? { id: "portal:hydrate", x, y } : null);
  const hydrateResult = hydrateInstance.hydrateBuildingRoomFengShuiState({
    buildings: [{
      id: "building:protected:ring",
      defId: "stone_wall",
      x: 3,
      y: 3,
      state: "active",
      hp: 100,
      maxHp: 100,
      ownerPlayerId: "player:ring",
      cells: [{ tileIndex: hydrateInstance.toTileIndex(3, 3), x: 3, y: 3 }],
    }],
    rooms: [],
    roomCells: [],
    fengShui: [],
  });
  assert.equal(hydrateResult.skippedProtectedPlacementCount, 1);
  assert.equal(hydrateInstance.buildingById.has("building:protected:ring"), false);
  assert.equal(hydrateResult.skippedBuildings.length, 1);
  assert.equal(hydrateResult.skippedBuildings[0].id, "building:protected:ring");
  assert.equal(hydrateResult.skippedBuildings[0].ownerPlayerId, "player:ring");
  assert.equal(hydrateResult.skippedBuildings[0].reason, "protected_placement_portal");

  assertPrunedVaultRecoveryGuard(catalog, rules);
}

/** buildViolatingVaultState：构造一个落在传送点 (2,2) 邻域内的违规宝库持久化快照。 */
function buildViolatingVaultState(instance) {
  return {
    buildings: [{
      id: "building:vault:ring",
      defId: "treasure_vault",
      x: 3,
      y: 3,
      state: "active",
      hp: 100,
      maxHp: 100,
      ownerPlayerId: "player:vault",
      cells: [{ tileIndex: instance.toTileIndex(3, 3), x: 3, y: 3 }],
    }],
    rooms: [],
    roomCells: [],
    fengShui: [],
  };
}

/** assertPrunedVaultRecoveryGuard：宝库库存返还失败时必须豁免摧毁，避免玩家资产滞留在无法访问的建筑里。 */
function assertPrunedVaultRecoveryGuard(catalog, rules) {
  // 预检必须先于 hydrate 找出会被摧毁的宝库，并带出 owner 供邮件返还。
  const scanInstance = createProtectedPlacementInstance(catalog, rules, "real:building_vault_scan_smoke");
  scanInstance.getPortalAtTile = (x, y) => (x === 2 && y === 2 ? { id: "portal:vault", x, y } : null);
  const prunable = scanInstance.listPrunableVaultBuildings(buildViolatingVaultState(scanInstance));
  assert.equal(prunable.length, 1);
  assert.equal(prunable[0].id, "building:vault:ring");
  assert.equal(prunable[0].ownerPlayerId, "player:vault");
  assert.equal(prunable[0].reason, "protected_placement_portal");
  // 合规宝库不进入预检，避免误返还。
  const compliantInstance = createProtectedPlacementInstance(catalog, rules, "real:building_vault_compliant_smoke");
  assert.equal(compliantInstance.listPrunableVaultBuildings(buildViolatingVaultState(compliantInstance)).length, 0);

  // 返还成功：豁免名单为空 → 宝库被摧毁。
  const destroyInstance = createProtectedPlacementInstance(catalog, rules, "real:building_vault_destroy_smoke");
  destroyInstance.getPortalAtTile = (x, y) => (x === 2 && y === 2 ? { id: "portal:vault", x, y } : null);
  const destroyed = destroyInstance.hydrateBuildingRoomFengShuiState(buildViolatingVaultState(destroyInstance), { keepBuildingIds: new Set() });
  assert.equal(destroyed.skippedProtectedPlacementCount, 1);
  assert.equal(destroyed.keptProtectedPlacementCount, 0);
  assert.equal(destroyInstance.buildingById.has("building:vault:ring"), false);

  // 返还失败：进入豁免名单 → 宝库原地保留，等待下次启动或 GM 处理。
  const keepInstance = createProtectedPlacementInstance(catalog, rules, "real:building_vault_keep_smoke");
  keepInstance.getPortalAtTile = (x, y) => (x === 2 && y === 2 ? { id: "portal:vault", x, y } : null);
  const kept = keepInstance.hydrateBuildingRoomFengShuiState(
    buildViolatingVaultState(keepInstance),
    { keepBuildingIds: new Set(["building:vault:ring"]) },
  );
  assert.equal(kept.skippedProtectedPlacementCount, 0);
  assert.equal(kept.keptProtectedPlacementCount, 1);
  assert.equal(kept.skippedBuildings.length, 0);
  assert.equal(keepInstance.buildingById.has("building:vault:ring"), true);
}

function assertFengShuiTickEndCoalescing(instance) {
  const initialSnapshot = instance.getFengShuiSnapshotAt(2, 2);
  assert.ok(initialSnapshot);

  instance.tickOnce();
  assert.equal(instance.damageTile(0, 1, 1)?.building, true);
  assert.equal(instance.damageTile(0, 1, 1)?.building, true);
  assert.equal(instance.hasPendingBuildingRoomFengShuiChanges(), true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), true);
  assert.equal(instance.getFengShuiSnapshotAt(2, 2), initialSnapshot, "同息内标脏不得提前替换风水快照");

  const localFinalize = instance.finalizePendingBuildingRoomFengShuiChanges();
  assert.equal(localFinalize.flushed, true);
  assert.equal(localFinalize.mode, "local");
  assert.equal(localFinalize.requestCount, 2);
  assert.equal(localFinalize.coalescedRequestCount, 1);
  assert.equal(localFinalize.dirtyCellCount, 1);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), false);
  const finalizedSnapshot = instance.getFengShuiSnapshotAt(2, 2);
  assert.ok(finalizedSnapshot);
  assert.notEqual(finalizedSnapshot, initialSnapshot, "息末必须原子替换新的风水快照");

  assert.equal(instance.damageTile(0, 1, 1)?.building, true);
  const sameTickFinalize = instance.finalizePendingBuildingRoomFengShuiChanges();
  assert.equal(sameTickFinalize.flushed, false);
  assert.equal(sameTickFinalize.reason, "already_finalized_this_tick");
  assert.equal(instance.getFengShuiSnapshotAt(2, 2), finalizedSnapshot);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), true);
  instance.tickOnce();
  const nextTickFinalize = instance.finalizePendingBuildingRoomFengShuiChanges();
  assert.equal(nextTickFinalize.flushed, true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), false);

  instance.tickOnce();
  assert.equal(instance.damageTile(0, 1, 1)?.building, true);
  const recalculateImmediately = instance.recalculateFengShuiForRoomIdsImmediately;
  instance.recalculateFengShuiForRoomIdsImmediately = () => {
    throw new Error("fengshui_finalize_smoke_failure");
  };
  assert.throws(
    () => instance.finalizePendingBuildingRoomFengShuiChanges(),
    /fengshui_finalize_smoke_failure/,
  );
  assert.equal(instance.hasPendingBuildingRoomFengShuiChanges(), true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), true);
  instance.recalculateFengShuiForRoomIdsImmediately = recalculateImmediately;
  instance.tickOnce();
  assert.equal(instance.finalizePendingBuildingRoomFengShuiChanges().flushed, true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), false);

  instance.tickOnce();
  assert.equal(instance.markFengShuiDirtyAfterRoomInfluenceChange(instance.toTileIndex(2, 2), "smoke_local"), true);
  assert.equal(instance.markRoomsAndFengShuiDirtyAfterTopologyChange({ reason: "smoke_topology", dirtyCellCount: 1 }), true);
  assert.equal(instance.pendingBuildingRoomFengShuiState.topologyDirty, true);
  assert.equal(instance.pendingBuildingRoomFengShuiState.dirtyRoomIds.size, 0, "拓扑脏必须覆盖局部房间计划");
  assert.equal(instance.isPersistenceDomainHeld("room"), true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), true);
  const topologyFinalize = instance.finalizePendingBuildingRoomFengShuiChanges();
  assert.equal(topologyFinalize.flushed, true);
  assert.equal(topologyFinalize.mode, "topology");
  assert.equal(topologyFinalize.requestCount, 2);
  assert.equal(topologyFinalize.coalescedRequestCount, 1);
  assert.equal(instance.isPersistenceDomainHeld("room"), false);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), false);

  instance.tickSpeed = 10;
  assert.equal(instance.markFengShuiDirtyAfterRoomInfluenceChange(instance.toTileIndex(2, 2), "smoke_cadence"), true);
  for (let offset = 1; offset < 10; offset += 1) {
    instance.tickOnce();
  }
  assert.equal(instance.shouldFinalizePendingBuildingRoomFengShuiChanges(), false);
  const cadenceWait = instance.finalizePendingBuildingRoomFengShuiChanges();
  assert.equal(cadenceWait.flushed, false);
  assert.equal(cadenceWait.reason, "cadence_wait");
  assert.equal(cadenceWait.remainingTicks, 1);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), true);
  instance.tickOnce();
  assert.equal(instance.shouldFinalizePendingBuildingRoomFengShuiChanges(), true);
  assert.equal(instance.finalizePendingBuildingRoomFengShuiChanges().flushed, true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), false);
  instance.tickSpeed = 1;
}

async function main() {
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
      id: "wide_stone_wall",
      name: "宽石墙",
      placement: { layer: "structure", footprint: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }] },
      topology: { blocksMove: true, blocksSight: true, roomBoundary: 100 },
      visual: { tileType: TileType.Wall },
      fengShui: { elementVector: { earth: 16 }, stability: 8 },
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
      economy: { durabilityMultiplier: 100 },
    },
    {
      id: "spirit_screen",
      name: "影壁",
      placement: { layer: "structure", footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: true, blocksSight: true, roomBoundary: 70, shaShield: 60 },
      fengShui: {
        elementVector: { earth: 8 },
        traits: ["sha.screen"],
        stability: 5,
        shaReduce: 10,
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
    {
      id: "treasure_vault",
      name: "宝库",
      placement: { layer: "furniture", footprint: [{ dx: 0, dy: 0 }] },
      treasureVault: { capacity: 80 },
    },
  ]);

  assert.equal(catalog.defs.length, 10);
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
  assertActiveInteractableBuildingsProjectAfterCompletion(catalog, rules);

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
  isolateSpawnFromBuildArea(templateRepository, "building_room_runtime_smoke");
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
  assert.equal(instance.listRoomSummaries().length, 0, "本息结束前不得发布半成品房间派生状态");
  assert.equal(instance.hasPendingBuildingRoomFengShuiChanges(), true);
  assert.equal(instance.isPersistenceDomainHeld("room"), true);
  assert.equal(instance.isPersistenceDomainHeld("fengshui"), true);
  const setupFinalize = instance.finalizePendingBuildingRoomFengShuiChanges();
  assert.equal(setupFinalize.flushed, true);
  assert.equal(setupFinalize.mode, "topology");
  assert.ok(setupFinalize.requestCount > 1);
  assert.ok(setupFinalize.coalescedRequestCount > 0);
  const runtimeRooms = instance.listRoomSummaries();
  assert.equal(runtimeRooms.length, 1);
  assert.equal(runtimeRooms[0].enclosed, true);
  assert.equal(runtimeRooms[0].role, "alchemy");
  const runtimeFengShui = instance.getFengShuiSnapshotAt(2, 2);
  assert.ok(runtimeFengShui);
  assert.equal(runtimeFengShui.reasons.some((reason) => reason.code === "trait.alchemy_heat_source"), true);
  assertFengShuiTickEndCoalescing(instance);
  assert.ok(instance.buildBuildingPersistenceEntries().length >= 1);
  const namedBuilding = instance.buildingById.values().next().value;
  assert.ok(namedBuilding);
  namedBuilding.name = "自定义建筑名";
  namedBuilding.accessPolicies = {
    use: {
      schemaVersion: 1,
      mode: "conditional",
      operator: "any",
      conditions: [{ type: "relation", relations: ["close_friend"] }],
      revision: 3,
    },
  };
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
  assert.equal(recoveredInstance.buildingById.get(namedBuilding.id)?.name, "自定义建筑名");
  assert.deepEqual(recoveredInstance.buildingById.get(namedBuilding.id)?.accessPolicies, {
    use: {
      schemaVersion: 1,
      mode: "conditional",
      operator: "any",
      conditions: [{ type: "relation", relations: ["close_friend"] }],
      revision: 3,
    },
  });
  assert.equal(recoveredInstance.listRoomSummaries().length, 1);
  assert.ok(recoveredInstance.getFengShuiSnapshotAt(2, 2));
  const staleBuildingState = {
    ...persistenceState,
    buildings: [
      ...persistenceState.buildings,
      {
        id: "building:removed:def",
        defId: "removed_building_def",
        x: 3,
        y: 3,
        state: "active",
        hp: 1,
        maxHp: 1,
        cells: [{ tileIndex: recoveredInstance.toTileIndex(3, 3), x: 3, y: 3 }],
      },
    ],
  };
  const staleRecoveredInstance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_stale_def_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑未知定义清理烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  staleRecoveredInstance.configureBuildingRuntime(catalog, rules);
  const staleHydrateResult = staleRecoveredInstance.hydrateBuildingRoomFengShuiState(staleBuildingState);
  assert.equal(staleHydrateResult.skippedUnknownDefCount, 1);
  assert.equal(staleRecoveredInstance.buildingById.has("building:removed:def"), false);
  assert.equal(staleRecoveredInstance.buildBuildingRoomFengShuiPersistenceState().buildings.some((entry) => entry.defId === "removed_building_def"), false);
  const protectedPlacementInstance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_protected_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑保护点位烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  protectedPlacementInstance.configureBuildingRuntime(catalog, rules);
  protectedPlacementInstance.getPortalAtTile = (x, y) => (x === 1 && y === 1 ? { id: "portal:building:blocked", x, y } : null);
  const protectedPlacementResult = protectedPlacementInstance.placeBuildingInstance({ defId: "stone_wall", x: 1, y: 1 });
  assert.equal(protectedPlacementResult.ok, false);
  assert.equal(protectedPlacementResult.reason, "protected_placement_portal");
  const protectedHydrateResult = protectedPlacementInstance.hydrateBuildingRoomFengShuiState({
    buildings: [{
      id: "building:protected:portal",
      defId: "stone_wall",
      x: 1,
      y: 1,
      state: "active",
      hp: 100,
      maxHp: 100,
      cells: [{ tileIndex: protectedPlacementInstance.toTileIndex(1, 1), x: 1, y: 1 }],
    }],
    rooms: [],
    roomCells: [],
    fengShui: [],
  });
  assert.equal(protectedHydrateResult.skippedProtectedPlacementCount, 1);
  assert.equal(protectedPlacementInstance.buildingById.has("building:protected:portal"), false);

  const protectedFootprintPlacementInstance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_protected_footprint_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑保护点位 footprint 烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  protectedFootprintPlacementInstance.configureBuildingRuntime(catalog, rules);
  // 传送点 (3,1) 落在锚点 (1,1) 的 3x3 之外，只能由 footprint 远端格 (2,1) 的邻域命中。
  protectedFootprintPlacementInstance.getPortalAtTile = (x, y) => (x === 3 && y === 1 ? { id: "portal:building:footprint", x, y } : null);
  const protectedFootprintPlaceResult = protectedFootprintPlacementInstance.placeBuildingInstance({ defId: "wide_stone_wall", x: 1, y: 1 });
  assert.equal(protectedFootprintPlaceResult.ok, false);
  assert.equal(protectedFootprintPlaceResult.reason, "protected_placement_portal");
  assert.equal(protectedFootprintPlaceResult.x, 2);
  assert.equal(protectedFootprintPlaceResult.y, 1);

  const protectedFootprintHydrateInstance = new MapInstanceRuntime({
    instanceId: "real:building_room_runtime_protected_footprint_hydrate_smoke",
    template: templateRepository.getOrThrow("building_room_runtime_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑保护点位 footprint 恢复烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  protectedFootprintHydrateInstance.configureBuildingRuntime(catalog, rules);
  protectedFootprintHydrateInstance.getPortalAtTile = (x, y) => (x === 2 && y === 1 ? { id: "portal:building:footprint:hydrate", x, y } : null);
  const anchorTileIndex = protectedFootprintHydrateInstance.toTileIndex(1, 1);
  const portalTileIndex = protectedFootprintHydrateInstance.toTileIndex(2, 1);
  const anchorPreviousTileType = protectedFootprintHydrateInstance.tilePlane.getTileType(anchorTileIndex);
  const portalPreviousTileType = protectedFootprintHydrateInstance.tilePlane.getTileType(portalTileIndex);
  protectedFootprintHydrateInstance.applyBuildingVisualTileType(anchorTileIndex, catalog.defById.get("wide_stone_wall"));
  protectedFootprintHydrateInstance.applyBuildingVisualTileType(portalTileIndex, catalog.defById.get("wide_stone_wall"));
  assert.equal(protectedFootprintHydrateInstance.tilePlane.getTileType(portalTileIndex), TileType.Wall);
  const protectedFootprintHydrateResult = protectedFootprintHydrateInstance.hydrateBuildingRoomFengShuiState({
    buildings: [{
      id: "building:protected:footprint:portal",
      defId: "wide_stone_wall",
      x: 1,
      y: 1,
      state: "active",
      hp: 100,
      maxHp: 100,
      cells: [
        { tileIndex: anchorTileIndex, x: 1, y: 1, previousTileType: anchorPreviousTileType },
        { tileIndex: portalTileIndex, x: 2, y: 1, previousTileType: portalPreviousTileType },
      ],
    }],
    rooms: [],
    roomCells: [],
    fengShui: [],
  });
  assert.equal(protectedFootprintHydrateResult.skippedProtectedPlacementCount, 1);
  assert.equal(protectedFootprintHydrateResult.restoredSkippedBuildingTileCellCount, 2);
  assert.equal(protectedFootprintHydrateInstance.buildingById.has("building:protected:footprint:portal"), false);
  assert.equal(protectedFootprintHydrateInstance.tilePlane.getTileType(anchorTileIndex), anchorPreviousTileType);
  assert.equal(protectedFootprintHydrateInstance.tilePlane.getTileType(portalTileIndex), portalPreviousTileType);
  assert.equal(protectedFootprintHydrateInstance.buildRuntimeTilePersistenceEntries().length, 0);
  assertBuildingProtectedPlacementRules(catalog, rules);
  const recoveredDamagedWall = recoveredInstance.buildBuildingPersistenceEntries()
    .find((entry) => entry.defId === "stone_wall" && entry.x === 0 && entry.y === 1);
  assert.ok(recoveredDamagedWall);
  assert.equal(recoveredInstance.damageTile(recoveredDamagedWall.x, recoveredDamagedWall.y, Number.MAX_SAFE_INTEGER).destroyed, true);
  assert.equal(recoveredInstance.listRoomSummaries().length, 1, "拓扑变化在本息结束前必须继续暴露上一版房间快照");
  assert.equal(recoveredInstance.finalizePendingBuildingRoomFengShuiChanges().flushed, true);
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
  assert.equal(instance.listRoomSummaries().length, 1);
  instance.tickOnce();
  assert.equal(instance.finalizePendingBuildingRoomFengShuiChanges().flushed, true);
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
  isolateSpawnFromBuildArea(staticTemplateRepository, "static_room_damage_smoke");
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
  assert.equal(staticInstance.getFengShuiSnapshotAt(2, 2), staticInitialFengShui);
  assert.equal(staticInstance.finalizePendingBuildingRoomFengShuiChanges().flushed, true);
  const staticDamagedFengShui = staticInstance.getFengShuiSnapshotAt(2, 2);
  assert.ok(staticDamagedFengShui);
  assert.ok(staticDamagedFengShui.score < staticInitialFengShui.score);
  assert.equal(staticDamagedFengShui.reasons.some((reason) => reason.code === "integrity.penalty"), true);
  staticInstance.tickOnce();
  const brokenWall = staticInstance.damageTile(0, 1, Number.MAX_SAFE_INTEGER);
  assert.ok(brokenWall);
  assert.equal(brokenWall.destroyed, true);
  assert.equal(staticInstance.listRoomSummaries().length, 1);
  assert.equal(staticInstance.finalizePendingBuildingRoomFengShuiChanges().flushed, true);
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
  isolateSpawnFromBuildArea(staticTemplateRepository, "static_outdoor_wall_ground_smoke");
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
  isolateSpawnFromBuildArea(staticTemplateRepository, "static_stone_build_block_smoke");
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
    x: replaceX,
    y: replaceY - 1,
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

  const legacyDirtyInstance = new MapInstanceRuntime({
    instanceId: "real:legacy_building_deconstruct_dirty_smoke",
    template: yunlaiRepository.getOrThrow("yunlai_town"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "旧建筑拆除地块同步烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  legacyDirtyInstance.configureBuildingRuntime(catalog, rules);
  const legacyWall = catalog.defById.get("stone_wall");
  const legacyDirtyX = 14;
  const legacyDirtyY = 43;
  const legacyDirtyCell = legacyDirtyInstance.toTileIndex(legacyDirtyX, legacyDirtyY);
  legacyDirtyInstance.buildingById.set("building:legacy:dirty", {
    id: "building:legacy:dirty",
    defId: legacyWall.id,
    defHandle: legacyWall.handle,
    instanceId: legacyDirtyInstance.meta.instanceId,
    x: legacyDirtyX,
    y: legacyDirtyY,
    rotation: 0,
    ownerPlayerId: "player:legacy:dirty",
    ownerSectId: null,
    roomId: null,
    hp: legacyWall.maxHp,
    maxHp: legacyWall.maxHp,
    state: "active",
    createdAtTick: legacyDirtyInstance.tick,
    updatedAtTick: legacyDirtyInstance.tick,
    revision: 1,
  });
  legacyDirtyInstance.buildingCellsById.set("building:legacy:dirty", [legacyDirtyCell]);
  legacyDirtyInstance.buildingPreviousTileTypeById.delete("building:legacy:dirty");
  legacyDirtyInstance.consumeStaticTileSyncDirtyTiles();
  assert.equal(legacyDirtyInstance.deconstructBuildingInstance("building:legacy:dirty").ok, true);
  const legacyDirtyPlan = legacyDirtyInstance.consumeStaticTileSyncDirtyTiles();
  assert.ok(legacyDirtyPlan.tileKeys.includes(`${legacyDirtyX},${legacyDirtyY}`));

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
  isolateSpawnFromBuildArea(commandTemplateRepository, "building_command_runtime_smoke");
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
    x: 2,
    y: 2,
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
  assert.equal(commandPlayer.buildingJob.jobType, "building");
  assert.equal(commandPlayer.buildingJob.jobVersion, 1);
  assert.equal(
    commandPlayer.buildingJob.jobRunId.startsWith(`job:${commandPlayer.playerId}:building:`),
    true,
  );
  assert.equal(commandPlayer.buildingJob.remainingTicks, buildStrength);
  let previousBuildingExp = commandPlayer.buildingSkill.exp;
  let previousJobVersion = commandPlayer.buildingJob.jobVersion;
  for (let index = 0; index < buildStrength - 1; index += 1) {
    const pendingTick = commandInstance.tickOnce();
    assert.equal(pendingTick.completedBuildings.length, 0);
    assert.equal(commandBuilding.buildRemainingTicks, buildStrength - index);
    const tickResult = WorldRuntimeService.prototype.tickBuildingConstruction.call(commandRuntime, commandPlayer.playerId);
    assert.equal(tickResult.ok, true);
    assert.ok(commandPlayer.buildingSkill.exp > previousBuildingExp);
    assert.equal(commandPlayer.buildingJob.remainingTicks, buildStrength - index - 1);
    assert.equal(commandPlayer.buildingJob.jobVersion, previousJobVersion + 1);
    previousJobVersion = commandPlayer.buildingJob.jobVersion;
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
  commandBuilding.ownerPlayerId = "player:other-builder";
  const foreignDeconstructResult = await WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:foreign",
    buildingId: placeResult.building.id,
  });
  assert.equal(foreignDeconstructResult.ok, false);
  assert.equal(foreignDeconstructResult.reason, "building_owner_mismatch");
  commandBuilding.ownerPlayerId = null;
  const ownerlessDeconstructResult = await WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:ownerless",
    buildingId: placeResult.building.id,
  });
  assert.equal(ownerlessDeconstructResult.ok, false);
  assert.equal(ownerlessDeconstructResult.reason, "building_owner_mismatch");
  commandBuilding.ownerPlayerId = commandPlayer.playerId;
  const deconstructResult = await WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
    requestId: "deconstruct:req:1",
    buildingId: placeResult.building.id,
  });
  assert.equal(deconstructResult.ok, true);
  const duplicateDeconstructResult = await WorldRuntimeService.prototype.handleBuildDeconstructIntent.call(commandRuntime, commandPlayer.playerId, {
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

function assertActiveInteractableBuildingsProjectAfterCompletion(catalog, rules) {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "active_interactable_building_projection_smoke",
    name: "完工交互建筑投影烟测",
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
  isolateSpawnFromBuildArea(templateRepository, "active_interactable_building_projection_smoke");
  const instance = new MapInstanceRuntime({
    instanceId: "real:active_interactable_building_projection_smoke",
    template: templateRepository.getOrThrow("active_interactable_building_projection_smoke"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "完工交互建筑投影烟测",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.configureBuildingRuntime(catalog, rules);
  const wallResult = instance.placeBuildingInstance({
    buildingId: "building:wall:projection",
    defId: "stone_wall",
    x: 0,
    y: 0,
    state: "active",
  });
  assert.equal(wallResult.ok, true);
  const shelfResult = instance.placeBuildingInstance({
    buildingId: "building:shelf:projection",
    defId: "spirit_wood_shelf",
    x: 1,
    y: 1,
    state: "active",
  });
  assert.equal(shelfResult.ok, true);
  const furnaceResult = instance.placeBuildingInstance({
    buildingId: "building:furnace:projection",
    defId: "alchemy_furnace",
    x: 2,
    y: 1,
    state: "active",
  });
  assert.equal(furnaceResult.ok, true);
  const bedResult = instance.placeBuildingInstance({
    buildingId: "building:bed:projection",
    defId: "jade_bed_extensible",
    x: 1,
    y: 2,
    state: "active",
  });
  assert.equal(bedResult.ok, true);
  const scriptureResult = instance.placeBuildingInstance({
    buildingId: "building:scripture:projection",
    defId: "scripture_platform",
    x: 3,
    y: 1,
    state: "active",
  });
  assert.equal(scriptureResult.ok, true);
  const screenResult = instance.placeBuildingInstance({
    buildingId: "building:screen:projection",
    defId: "spirit_screen",
    x: 2,
    y: 3,
    state: "active",
  });
  assert.equal(screenResult.ok, true);
  assert.equal(catalog.defById.get("scripture_platform")?.durabilityMultiplier, 100);
  assert.equal(instance.isWalkable(3, 1), false);
  const projected = instance.collectLocalBuildings(2, 2, 5);
  assert.equal(projected.some((entry) => entry.id === "building:wall:projection"), false);
  assert.equal(projected.some((entry) => entry.id === "building:shelf:projection" && entry.name === "灵木架"), true);
  assert.equal(projected.some((entry) => entry.id === "building:furnace:projection" && entry.name === "丹炉"), true);
  assert.equal(projected.some((entry) => entry.id === "building:bed:projection" && entry.name === "玉床"), true);
  assert.equal(projected.some((entry) => entry.id === "building:scripture:projection" && entry.name === "藏经台"), true);
  assert.equal(projected.some((entry) => entry.id === "building:screen:projection" && entry.name === "影壁"), true);
  assert.equal(projected.every((entry) => entry.remainingTicks === undefined && entry.totalTicks === undefined), true);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { TileType } = require("@mud/shared");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { getDefaultBuildingRuntime } = require("../runtime/building/building-default-content");

function main() {
  const size = Number(process.env.BUILDING_ROOM_BENCH_SIZE || 32);
  const iterations = Number(process.env.BUILDING_ROOM_BENCH_ITERATIONS || 25);
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "bench_building_room_fengshui",
    name: "建筑房间风水基准",
    width: size,
    height: size,
    routeDomain: "system",
    tiles: Array.from({ length: size }, () => ".".repeat(size)),
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
    instanceId: "bench:building_room_fengshui",
    template: templateRepository.getOrThrow("bench_building_room_fengshui"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "建筑房间风水基准",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "bench",
    defaultEntry: true,
    canDamageTile: true,
  });
  const runtime = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(runtime.catalog, runtime.rules);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const tileIndex = instance.tilePlane.activateCell(x, y, TileType.Floor);
      instance.ensureCellStorageCapacity(tileIndex + 1);
    }
  }

  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const base = 2 + (iteration % Math.max(1, size - 8));
    const startedAt = Date.now();
    placeSmallRoom(instance, base, 2 + (iteration % 4));
    samples.push(Date.now() - startedAt);
  }

  const overlay = buildOverlaySample(instance, Math.floor(size / 2), Math.floor(size / 2), 12);
  const sorted = samples.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  const avg = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);

  assert.ok(instance.lastBuildingRoomRebuildStats.roomCount >= 0);
  assert.ok(Buffer.byteLength(JSON.stringify(overlay), "utf8") < 64 * 1024);
  assert.ok(p95 < 150, `building_room_recalc_p95_too_high:${p95}`);
  const openProbe = buildOpenMapProbe(128);
  assert.ok(openProbe.ms < 20, `open_map_no_opening_probe_too_high:${openProbe.ms}`);
  console.log(JSON.stringify({
    ok: true,
    size,
    iterations,
    roomCount: instance.roomsById.size,
    fengShuiCount: instance.fengShuiByRoomId.size,
    deferredCount: instance.buildingRoomDeferredStartCells.length,
    placeAndRecalcMs: {
      avg: Number(avg.toFixed(2)),
      p95,
      max: sorted[sorted.length - 1] ?? 0,
    },
    overlay: {
      cellCount: overlay.cells.length,
      bytes: Buffer.byteLength(JSON.stringify(overlay), "utf8"),
    },
    lastRebuildStats: instance.lastBuildingRoomRebuildStats,
    openMapNoOpeningProbe: openProbe,
  }, null, 2));
}

function placeSmallRoom(instance, x0, y0) {
  for (let y = y0; y < y0 + 5; y += 1) {
    for (let x = x0; x < x0 + 5; x += 1) {
      instance.placeBuildingInstance({ defId: "plain_floor", x, y, buildingId: `bench:floor:${x}:${y}` });
    }
  }
  for (let x = x0; x < x0 + 5; x += 1) {
    instance.placeBuildingInstance({ defId: x === x0 + 2 ? "wooden_door" : "stone_wall", x, y: y0, buildingId: `bench:wall:${x}:${y0}` });
    instance.placeBuildingInstance({ defId: "stone_wall", x, y: y0 + 4, buildingId: `bench:wall:${x}:${y0 + 4}` });
  }
  for (let y = y0 + 1; y < y0 + 4; y += 1) {
    instance.placeBuildingInstance({ defId: "stone_wall", x: x0, y, buildingId: `bench:wall:${x0}:${y}` });
    instance.placeBuildingInstance({ defId: "stone_wall", x: x0 + 4, y, buildingId: `bench:wall:${x0 + 4}:${y}` });
  }
  instance.placeBuildingInstance({ defId: "scripture_platform", x: x0 + 2, y: y0 + 2, buildingId: `bench:scripture:${x0}:${y0}` });
}

function buildOverlaySample(instance, centerX, centerY, radius) {
  const cells = [];
  for (let cellIndex = 0; cellIndex < instance.tilePlane.getCellCount(); cellIndex += 1) {
    const x = instance.tilePlane.getX(cellIndex);
    const y = instance.tilePlane.getY(cellIndex);
    if (Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) > radius) continue;
    const roomId = instance.roomIdsByHandle[instance.roomIdByCell[cellIndex]];
    if (!roomId) continue;
    const snapshot = instance.fengShuiByRoomId.get(roomId);
    if (!snapshot) continue;
    cells.push({ x, y, roomId, score: snapshot.score, grade: snapshot.grade, revision: snapshot.revision });
  }
  return { instanceId: instance.meta.instanceId, revision: instance.getPersistenceRevision(), cells };
}

function buildOpenMapProbe(size) {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "bench_open_room_probe",
    name: "开放地图房间探针",
    width: size,
    height: size,
    routeDomain: "system",
    tiles: Array.from({ length: size }, () => ".".repeat(size)),
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
    instanceId: "bench:open_room_probe",
    template: templateRepository.getOrThrow("bench_open_room_probe"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "开放地图房间探针",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "bench",
    defaultEntry: true,
    canDamageTile: true,
  });
  const runtime = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(runtime.catalog, runtime.rules);
  const startedAt = Date.now();
  const result = instance.placeBuildingInstance({ defId: "stone_wall", x: Math.floor(size / 2), y: Math.floor(size / 2), buildingId: "bench:open_probe_wall" });
  const ms = Date.now() - startedAt;
  assert.equal(result.ok, true);
  assert.equal(instance.roomsById.size, 0);
  return {
    size,
    ms,
    deferredCount: instance.buildingRoomDeferredStartCells.length,
  };
}

main();

/**
 * 房间检测服务。
 * 基于 BFS 洪水填充算法从建筑拓扑中识别封闭房间，
 * 计算房间面积、屋顶覆盖率和开口类型，供风水系统使用。
 */
import {
  BUILDING_OPENING_KIND_ID_BY_KEY,
  TileType,
  isTileTypeWalkable,
  type RoomInstance,
} from '@mud/shared';

import type { BuildingTopologyIndex } from './building-topology-index.service';

export interface RoomDetectionCellProvider {
  getCellCount(): number;
  getCellCapacity?(): number;
  getX(cellIndex: number): number;
  getY(cellIndex: number): number;
  getCellIndex(x: number, y: number): number;
  isInteriorCandidate(cellIndex: number): boolean;
  isBoundaryCell(cellIndex: number): boolean;
  getOpeningKind(cellIndex: number): number;
  getRoofCoverage(cellIndex: number): number;
  getTileType?(cellIndex: number): string;
  getMinX?(): number;
  getMaxX?(): number;
  getMinY?(): number;
  getMaxY?(): number;
}

export interface RoomDetectionOptions {
  instanceId: string;
  role?: RoomInstance['role'];
  topologyRevision?: number;
  contentRevision?: number;
  updatedAtTick?: number;
  maxCellsPerRoom?: number;
}

export interface RoomDetectionResult {
  rooms: RoomInstance[];
  roomIdByCell: Int32Array;
  deferredStartCells: number[];
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// 大型半户外房间面积阈值，超出此面积且屋顶覆盖率低于 60% 时不计入房间
const LARGE_SEMI_OUTDOOR_ROOM_AREA = 256;
const MIN_LARGE_ROOM_ROOF_COVERAGE_RATIO = 60;

export class RoomDetectionService {
  detectRooms(provider: RoomDetectionCellProvider, options: RoomDetectionOptions): RoomDetectionResult {
    return detectRooms(provider, options);
  }
}

export function detectRooms(provider: RoomDetectionCellProvider, options: RoomDetectionOptions): RoomDetectionResult {
  const count = Math.max(0, Math.trunc(Number(provider.getCellCount()) || 0));
  const capacity = Math.max(count, Math.trunc(Number(provider.getCellCapacity?.()) || 0));
  const visited = new Uint8Array(Math.max(1, capacity));
  const roomIdByCell = new Int32Array(Math.max(1, capacity));
  const queue = new Int32Array(Math.max(1, count));
  const rooms: RoomInstance[] = [];
  const deferredStartCells: number[] = [];
  const maxCellsPerRoom = Math.max(1, Math.trunc(Number(options.maxCellsPerRoom) || 4096));
  const startCells = collectRoomStartCells(provider, count, capacity);

  for (let startIndex = 0; startIndex < startCells.length; startIndex += 1) {
    const start = startCells[startIndex] ?? -1;
    if (visited[start] || !provider.isInteriorCandidate(start)) {
      continue;
    }

    const state = floodRoom(provider, visited, queue, start, maxCellsPerRoom);
    if (state.deferred === true) {
      deferredStartCells.push(start);
      continue;
    }

    if (!shouldAcceptDetectedRoom(state)) {
      continue;
    }

    const roomHandle = rooms.length + 1;
    rooms.push({
      id: `room:${options.instanceId}:${roomHandle}`,
      instanceId: options.instanceId,
      role: options.role ?? 'generic',
      enclosed: !state.touchesOpenEdge,
      semiOutdoor: state.roofCoverageRatio < 60,
      minX: state.minX,
      minY: state.minY,
      maxX: state.maxX,
      maxY: state.maxY,
      area: state.cellCount,
      perimeter: state.perimeter,
      doorCount: state.doorCount,
      windowCount: state.windowCount,
      roofCoverageRatio: state.roofCoverageRatio,
      roomHash: buildRoomHash(state),
      topologyRevision: Math.max(0, Math.trunc(Number(options.topologyRevision) || 0)),
      contentRevision: Math.max(0, Math.trunc(Number(options.contentRevision) || 0)),
      updatedAtTick: Math.max(0, Math.trunc(Number(options.updatedAtTick) || 0)),
    });
    for (let index = 0; index < state.cellCount; index += 1) {
      roomIdByCell[state.cells[index]] = roomHandle;
    }
  }

  return { rooms, roomIdByCell, deferredStartCells };
}

function collectRoomStartCells(
  provider: RoomDetectionCellProvider,
  count: number,
  capacity: number,
): number[] {
  const marks = new Uint8Array(Math.max(1, capacity));
  const starts: number[] = [];
  for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    const opening = provider.getOpeningKind(cellIndex);
    if (opening === BUILDING_OPENING_KIND_ID_BY_KEY.none) {
      continue;
    }
    if (provider.isInteriorCandidate(cellIndex)) {
      pushRoomStartCell(starts, marks, cellIndex);
      continue;
    }
    const x = provider.getX(cellIndex);
    const y = provider.getY(cellIndex);
    for (const [dx, dy] of NEIGHBORS) {
      const candidate = provider.getCellIndex(x + dx, y + dy);
      if (candidate >= 0 && provider.isInteriorCandidate(candidate)) {
        pushRoomStartCell(starts, marks, candidate);
      }
    }
  }
  return starts;
}

function pushRoomStartCell(starts: number[], marks: Uint8Array, cellIndex: number): void {
  if (cellIndex < 0 || marks[cellIndex]) {
    return;
  }
  marks[cellIndex] = 1;
  starts.push(cellIndex);
}

function shouldAcceptDetectedRoom(state: {
  touchesOpenEdge: boolean;
  doorCount: number;
  windowCount: number;
  cellCount: number;
  roofCoverageRatio: number;
}): boolean {
  if (state.touchesOpenEdge || state.doorCount + state.windowCount <= 0) {
    return false;
  }
  if (
    state.cellCount > LARGE_SEMI_OUTDOOR_ROOM_AREA
    && state.roofCoverageRatio < MIN_LARGE_ROOM_ROOF_COVERAGE_RATIO
  ) {
    return false;
  }
  return true;
}

export function createRuntimeTilePlaneRoomCellProvider(
  plane: {
    getCellCount(): number;
    getCellCapacity?(): number;
    getX(cellIndex: number): number;
    getY(cellIndex: number): number;
    getCellIndex(x: number, y: number): number;
    isWalkable(cellIndex: number): boolean;
    getTileType(cellIndex: number): string;
  },
  topology: BuildingTopologyIndex,
  options: {
    getEffectiveTileType?: (cellIndex: number) => string;
    isTopologySuppressed?: (cellIndex: number) => boolean;
    countEntryTilesAsOpenings?: boolean;
  } = {},
): RoomDetectionCellProvider {
  const getTileType = (cellIndex: number) => {
    const effective = options.getEffectiveTileType?.(cellIndex);
    return typeof effective === 'string' && effective.length > 0 ? effective : plane.getTileType(cellIndex);
  };
  const isTopologySuppressed = (cellIndex: number) => options.isTopologySuppressed?.(cellIndex) === true;
  return {
    getCellCount: () => plane.getCellCount(),
    getCellCapacity: () => Math.max(plane.getCellCapacity?.() ?? 0, topology.structureHandleByCell.length),
    getX: (cellIndex) => plane.getX(cellIndex),
    getY: (cellIndex) => plane.getY(cellIndex),
    getCellIndex: (x, y) => plane.getCellIndex(x, y),
    isInteriorCandidate: (cellIndex) => isTileTypeWalkableForRoom(getTileType(cellIndex)) && !isRuntimeRoomBoundaryCell(getTileType, topology, cellIndex, isTopologySuppressed),
    isBoundaryCell: (cellIndex) => isRuntimeRoomBoundaryCell(getTileType, topology, cellIndex, isTopologySuppressed),
    getOpeningKind: (cellIndex) => getRuntimeOpeningKind(getTileType, topology, cellIndex, isTopologySuppressed, options.countEntryTilesAsOpenings === true),
    getRoofCoverage: (cellIndex) => !isTopologySuppressed(cellIndex) && topology.roofCoverageByCell[cellIndex] > 0
      ? topology.roofCoverageByCell[cellIndex]
      : getRuntimeStaticRoofCoverage(getTileType, cellIndex),
    getTileType,
    getMinX: () => Math.trunc(Number((plane as { minX?: number }).minX) || 0),
    getMaxX: () => Math.trunc(Number((plane as { maxX?: number }).maxX) || 0),
    getMinY: () => Math.trunc(Number((plane as { minY?: number }).minY) || 0),
    getMaxY: () => Math.trunc(Number((plane as { maxY?: number }).maxY) || 0),
  };
}

function floodRoom(
  provider: RoomDetectionCellProvider,
  visited: Uint8Array,
  queue: Int32Array,
  start: number,
  maxCellsPerRoom: number,
) {
  let head = 0;
  let tail = 0;
  let cellCount = 0;
  let perimeter = 0;
  let doorCount = 0;
  let windowCount = 0;
  let roofCoverageSum = 0;
  let touchesOpenEdge = false;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const cells = new Int32Array(maxCellsPerRoom);

  visited[start] = 1;
  queue[tail] = start;
  tail += 1;

  while (head < tail) {
    const cellIndex = queue[head];
    head += 1;
    if (cellCount >= maxCellsPerRoom) {
      if (!touchesOpenEdge) {
        return { deferred: true as const, cells, cellCount };
      }
      cellCount += 1;
    } else {
      cells[cellCount] = cellIndex;
      cellCount += 1;
    }

    const x = provider.getX(cellIndex);
    const y = provider.getY(cellIndex);
    if (isNearOpenMapEdge(provider, x, y)) {
      touchesOpenEdge = true;
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    roofCoverageSum += clampInt(provider.getRoofCoverage(cellIndex), 0, 100);
    const interiorOpening = provider.getOpeningKind(cellIndex);
    if (interiorOpening === BUILDING_OPENING_KIND_ID_BY_KEY.door) doorCount += 1;
    if (interiorOpening === BUILDING_OPENING_KIND_ID_BY_KEY.window) windowCount += 1;

    for (const [dx, dy] of NEIGHBORS) {
      const next = provider.getCellIndex(x + dx, y + dy);
      if (next < 0) {
        touchesOpenEdge = true;
        perimeter += 1;
        continue;
      }
      if (provider.isBoundaryCell(next)) {
        perimeter += 1;
        const opening = provider.getOpeningKind(next);
        if (opening === BUILDING_OPENING_KIND_ID_BY_KEY.door) doorCount += 1;
        if (opening === BUILDING_OPENING_KIND_ID_BY_KEY.window) windowCount += 1;
        continue;
      }
      if (!provider.isInteriorCandidate(next)) {
        perimeter += 1;
        continue;
      }
      if (!visited[next]) {
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  const roofCoverageRatio = cellCount > 0 ? Math.round(roofCoverageSum / cellCount) : 0;
  return {
    deferred: false as const,
    cells,
    cellCount,
    perimeter,
    doorCount,
    windowCount,
    roofCoverageRatio,
    touchesOpenEdge,
    minX,
    minY,
    maxX,
    maxY,
  };
}

function isRuntimeRoomBoundaryCell(
  getTileType: (cellIndex: number) => string,
  topology: BuildingTopologyIndex,
  cellIndex: number,
  isTopologySuppressed: (cellIndex: number) => boolean,
): boolean {
  return (!isTopologySuppressed(cellIndex) && topology.isRoomBoundary(cellIndex)) || isStaticRoomBoundaryTile(getTileType(cellIndex));
}

function getRuntimeOpeningKind(
  getTileType: (cellIndex: number) => string,
  topology: BuildingTopologyIndex,
  cellIndex: number,
  isTopologySuppressed: (cellIndex: number) => boolean,
  countEntryTilesAsOpenings: boolean,
): number {
  const topologyOpening = isTopologySuppressed(cellIndex)
    ? BUILDING_OPENING_KIND_ID_BY_KEY.none
    : topology.getOpeningKind(cellIndex);
  if (topologyOpening !== BUILDING_OPENING_KIND_ID_BY_KEY.none) {
    return topologyOpening;
  }
  return getStaticRoomOpeningKind(getTileType(cellIndex), countEntryTilesAsOpenings);
}

function getRuntimeStaticRoofCoverage(
  getTileType: (cellIndex: number) => string,
  cellIndex: number,
): number {
  const tileType = getTileType(cellIndex);
  return tileType === TileType.Floor || tileType === TileType.Door || tileType === TileType.Stairs || tileType === TileType.Portal
    ? 100
    : 0;
}

export function isRoomTopologyTileType(tileType: string): boolean {
  return isStaticRoomBoundaryTile(tileType)
    || tileType === TileType.Floor
    || tileType === TileType.Stairs
    || tileType === TileType.Portal;
}

export function getStaticRoomOpeningKind(tileType: string, countEntryTilesAsOpenings = false): number {
  if (tileType === TileType.Door) return BUILDING_OPENING_KIND_ID_BY_KEY.door;
  if (tileType === TileType.Window || tileType === TileType.BrokenWindow) return BUILDING_OPENING_KIND_ID_BY_KEY.window;
  if (countEntryTilesAsOpenings && (tileType === TileType.Stairs || tileType === TileType.Portal)) {
    return BUILDING_OPENING_KIND_ID_BY_KEY.door;
  }
  return BUILDING_OPENING_KIND_ID_BY_KEY.none;
}

export function isStaticRoomBoundaryTile(tileType: string): boolean {
  return tileType === TileType.Wall
    || tileType === TileType.Door
    || tileType === TileType.Window
    || tileType === TileType.BrokenWindow
    || tileType === TileType.HouseEave
    || tileType === TileType.HouseCorner
    || tileType === TileType.ScreenWall;
}

function isTileTypeWalkableForRoom(tileType: string): boolean {
  return isTileTypeWalkable(tileType as TileType);
}

function isNearOpenMapEdge(provider: RoomDetectionCellProvider, x: number, y: number): boolean {
  const minX = provider.getMinX?.();
  const maxX = provider.getMaxX?.();
  const minY = provider.getMinY?.();
  const maxY = provider.getMaxY?.();
  if (
    !Number.isFinite(minX)
    || !Number.isFinite(maxX)
    || !Number.isFinite(minY)
    || !Number.isFinite(maxY)
  ) {
    return false;
  }
  return x <= Number(minX) || x >= Number(maxX) || y <= Number(minY) || y >= Number(maxY);
}

function buildRoomHash(state: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cellCount: number;
  perimeter: number;
  doorCount: number;
  windowCount: number;
  roofCoverageRatio: number;
  touchesOpenEdge: boolean;
}): string {
  const values = [
    state.minX,
    state.minY,
    state.maxX,
    state.maxY,
    state.cellCount,
    state.perimeter,
    state.doorCount,
    state.windowCount,
    state.roofCoverageRatio,
    state.touchesOpenEdge ? 1 : 0,
  ];
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Math.trunc(value) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (Math.trunc(value) >>> 8) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function clampInt(value: unknown, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

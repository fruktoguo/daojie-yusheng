/**
 * 建筑拓扑索引服务。
 * 为房间检测提供结构/地板/设施/拓扑遮罩的运行时 TypedArray 索引，
 * 索引在地图加载期构建，运行时只读查询，不在 tick 内修改。
 */
import {
  BUILDING_OPENING_KIND_ID_BY_KEY,
  BUILDING_TOPOLOGY_ROOM_BOUNDARY,
  type CompiledBuildingDef,
} from '@mud/shared';

/** 建筑拓扑索引：按 cellIndex 存储结构/地板/设施/遮罩/屋顶/煞盾等 TypedArray。 */
export class BuildingTopologyIndex {
  structureHandleByCell: Uint32Array;
  floorHandleByCell: Uint32Array;
  facilityHandleByCell: Uint32Array;
  topologyMaskByCell: Uint32Array;
  roomBoundaryByCell: Uint8Array;
  openingKindByCell: Uint8Array;
  roofCoverageByCell: Uint8Array;
  shaShieldByCell: Uint8Array;

  constructor(initialCapacity: number) {
    const capacity = Math.max(1, Math.trunc(Number(initialCapacity)) || 1);
    this.structureHandleByCell = new Uint32Array(capacity);
    this.floorHandleByCell = new Uint32Array(capacity);
    this.facilityHandleByCell = new Uint32Array(capacity);
    this.topologyMaskByCell = new Uint32Array(capacity);
    this.roomBoundaryByCell = new Uint8Array(capacity);
    this.openingKindByCell = new Uint8Array(capacity);
    this.roofCoverageByCell = new Uint8Array(capacity);
    this.shaShieldByCell = new Uint8Array(capacity);
  }

  ensureCapacity(requiredCapacity: number): void {
    const required = Math.max(1, Math.trunc(Number(requiredCapacity)) || 1);
    if (required <= this.structureHandleByCell.length) {
      return;
    }
    const nextCapacity = nextPowerOfTwo(required);
    this.structureHandleByCell = growUint32(this.structureHandleByCell, nextCapacity);
    this.floorHandleByCell = growUint32(this.floorHandleByCell, nextCapacity);
    this.facilityHandleByCell = growUint32(this.facilityHandleByCell, nextCapacity);
    this.topologyMaskByCell = growUint32(this.topologyMaskByCell, nextCapacity);
    this.roomBoundaryByCell = growUint8(this.roomBoundaryByCell, nextCapacity);
    this.openingKindByCell = growUint8(this.openingKindByCell, nextCapacity);
    this.roofCoverageByCell = growUint8(this.roofCoverageByCell, nextCapacity);
    this.shaShieldByCell = growUint8(this.shaShieldByCell, nextCapacity);
  }

  clearCell(cellIndex: number): void {
    if (!this.hasCell(cellIndex)) return;
    this.structureHandleByCell[cellIndex] = 0;
    this.floorHandleByCell[cellIndex] = 0;
    this.facilityHandleByCell[cellIndex] = 0;
    this.topologyMaskByCell[cellIndex] = 0;
    this.roomBoundaryByCell[cellIndex] = 0;
    this.openingKindByCell[cellIndex] = 0;
    this.roofCoverageByCell[cellIndex] = 0;
    this.shaShieldByCell[cellIndex] = 0;
  }

  applyBuildingToCells(compiled: CompiledBuildingDef, cellIndices: readonly number[]): void {
    for (const rawCellIndex of cellIndices) {
      const cellIndex = Math.trunc(Number(rawCellIndex));
      if (!Number.isFinite(cellIndex) || cellIndex < 0) continue;
      this.ensureCapacity(cellIndex + 1);
      if (compiled.layerId === 1) {
        this.structureHandleByCell[cellIndex] = compiled.handle;
      } else if (compiled.layerId === 2) {
        this.floorHandleByCell[cellIndex] = compiled.handle;
      } else if (compiled.layerId === 3) {
        this.facilityHandleByCell[cellIndex] = compiled.handle;
      }
      this.topologyMaskByCell[cellIndex] |= compiled.topologyMask;
      if ((compiled.topologyMask & BUILDING_TOPOLOGY_ROOM_BOUNDARY) !== 0) {
        this.roomBoundaryByCell[cellIndex] = Math.max(this.roomBoundaryByCell[cellIndex], compiled.roomBoundary);
      }
      this.openingKindByCell[cellIndex] = Math.max(this.openingKindByCell[cellIndex], compiled.openingKind);
      this.roofCoverageByCell[cellIndex] = Math.max(this.roofCoverageByCell[cellIndex], compiled.roofCoverage);
      this.shaShieldByCell[cellIndex] = Math.max(this.shaShieldByCell[cellIndex], compiled.shaShield);
    }
  }

  isRoomBoundary(cellIndex: number): boolean {
    return this.hasCell(cellIndex) && this.roomBoundaryByCell[cellIndex] > 0;
  }

  getOpeningKind(cellIndex: number): number {
    return this.hasCell(cellIndex) ? this.openingKindByCell[cellIndex] : BUILDING_OPENING_KIND_ID_BY_KEY.none;
  }

  private hasCell(cellIndex: number): boolean {
    return Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex < this.structureHandleByCell.length;
  }
}

function growUint32(source: Uint32Array, capacity: number): Uint32Array {
  const next = new Uint32Array(capacity);
  next.set(source);
  return next;
}

function growUint8(source: Uint8Array, capacity: number): Uint8Array {
  const next = new Uint8Array(capacity);
  next.set(source);
  return next;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

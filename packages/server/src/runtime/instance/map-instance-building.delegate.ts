/**
 * MapInstanceBuildingDelegate — 建筑/房间/风水领域委托接口。
 *
 * 这是从 MapInstanceRuntime 提取建筑相关逻辑的目标落点。
 * 当前阶段只定义接口契约；后续实现将把 map-instance.runtime.ts 中
 * 对应方法的逻辑迁移到此处，MapInstanceRuntime 保留薄委托调用。
 *
 * 设计意图：
 * - 将 ~800 行建筑/房间/风水逻辑从 7000 行巨型类中解耦
 * - 委托持有 MapInstanceRuntime 引用以访问 tilePlane、occupancy 等共享状态
 * - 不改变运行时语义，纯结构重构
 */

import type { MapInstanceRuntime } from './map-instance.runtime';

// ─── 辅助类型 ───────────────────────────────────────────────────────────────

/** 建筑放置输入参数 */
export interface PlaceBuildingInput {
  defId: string;
  x: number;
  y: number;
  direction?: number;
  ownerId?: string;
  [key: string]: unknown;
}

/** 通用操作结果 */
export interface BuildingOperationResult {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

/** 房间/风水重建选项 */
export interface RebuildFengShuiOptions {
  reason?: string;
  startedAt?: number;
  fullTopologyRebuild?: boolean;
  dirtyCellCount?: number;
  [key: string]: unknown;
}

/** 建筑施工推进结果 */
export interface BuildingConstructionAdvanceResult {
  id: string;
  [key: string]: unknown;
}

// ─── 委托接口 ───────────────────────────────────────────────────────────────

export interface MapInstanceBuildingDelegate {
  /** 配置建筑运行时：注入 catalog 和风水规则表。 */
  configureBuildingRuntime(catalog: unknown, fengShuiRules?: unknown[]): void;

  /** 服务端权威放置建筑实例。 */
  placeBuildingInstance(input: PlaceBuildingInput): BuildingOperationResult;

  /** 开始建筑施工（绑定建造者）。 */
  startBuildingConstruction(buildingId: string, playerId: string): BuildingOperationResult;

  /** 停止建筑施工（解绑建造者）。 */
  stopBuildingConstruction(buildingId: string, playerId: string): BuildingOperationResult;

  /** 拆除建筑实例。 */
  deconstructBuildingInstance(buildingId: string): BuildingOperationResult;

  /** 全量重建建筑/房间/风水状态。 */
  rebuildBuildingRoomFengShuiState(options?: RebuildFengShuiOptions): unknown;

  /** 为指定建筑应用拓扑索引。 */
  applyBuildingTopologyForBuilding(buildingId: string): void;

  /** 检查指定 cell 在指定 layer 是否存在建筑重叠。 */
  hasBuildingLayerOverlapAtCell(cellIndex: number, layerId: number): boolean;

  /** 重建指定 cell 列表的建筑拓扑索引。 */
  rebuildBuildingTopologyCells(cellIndices: number[]): { repairedCellCount: number; orphanReferenceCount: number };

  /** 拓扑变化后重算房间和风水。 */
  recalculateRoomsAndFengShuiAfterTopologyChange(options?: RebuildFengShuiOptions): unknown;

  /** 判断 cell 变化是否需要触发房间重算。 */
  shouldRecalculateRoomsForTileMutation(cellIndex: number, previousTileType?: number | null, nextTileType?: number | null): boolean;

  /** 房间影响区域内物品/资源变化后只重算受影响房间风水。 */
  recalculateFengShuiAfterRoomInfluenceChange(cellIndex: number, reason?: string): boolean;

  /** GM 修复：全量重建并报告修复结果。 */
  repairBuildingRoomFengShuiState(): BuildingOperationResult;

  /** 按坐标获取房间风水快照。 */
  getBuildingRoomFengShuiAt(x: number, y: number): unknown | null;

  /** 重建 roomId -> cell index 列表索引。 */
  rebuildRoomCellIndices(): void;

  /** 构建房间聚合快照（可选只重算指定房间）。 */
  buildRoomAggregates(roomIds?: string[] | null): Map<string, unknown>;

  /** 收集指定房间集合内的建筑条目。 */
  collectBuildingEntriesForRoomAggregate(roomIds: Set<string>): Set<string>;

  /** 收集指定 cell 上的建筑 ID（递归邻接）。 */
  collectBuildingIdsAtCellForAggregate(cellIndex: number, buildingIds: Set<string>, visitedCells: Set<number>): void;

  /** 解析建筑所属房间 ID。 */
  resolveBuildingRoomId(buildingId: string): string | undefined;

  /** 列出所有建筑摘要。 */
  listBuildingSummaries(): unknown[];

  /** 列出所有房间摘要。 */
  listRoomSummaries(): unknown[];

  /** 获取指定房间的风水快照。 */
  getFengShuiSnapshot(roomId: string): unknown | null;

  /** 设置房间角色。 */
  setRoomRole(roomId: string, role: string): BuildingOperationResult;

  /** 按坐标获取风水快照。 */
  getFengShuiSnapshotAt(x: number, y: number): unknown | null;

  /** 按坐标获取风水运势值。 */
  getFengShuiLuckAt(x: number, y: number): number | null;

  /** tick 内推进所有在建建筑的施工进度。 */
  advanceBuildingConstruction(): BuildingConstructionAdvanceResult[];

  /** 建筑完工后激活拓扑和视觉投影，返回受影响的持久化域列表。 */
  activatePlacedBuildingTopologyAndVisual(building: unknown): string[];
}

// ─── 工厂（占位） ──────────────────────────────────────────────────────────

/**
 * 创建委托实例。
 * TODO: 实现时将 MapInstanceRuntime 中的建筑方法逻辑迁移至此。
 */
export function createMapInstanceBuildingDelegate(
  _instance: MapInstanceRuntime,
): MapInstanceBuildingDelegate {
  throw new Error(
    'MapInstanceBuildingDelegate 尚未实现——当前仅定义接口契约，' +
    '实际逻辑仍在 MapInstanceRuntime 内。',
  );
}

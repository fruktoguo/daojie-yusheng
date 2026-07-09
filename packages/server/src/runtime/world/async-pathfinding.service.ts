/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { findBoundedPath, type PathPoint, type PathfindingTaskInput, type PathfindingTaskResult } from '@mud/shared';

import { EncodingWorkerPoolService } from '../../concurrency/encoding-worker-pool.service';

/** 从 instance 提取 staticGrid 所需的最小接口 */
interface PathfindingInstancePort {
  template: { width: number; height: number; id: string };
  meta?: { instanceId?: string };
  staticTileSyncRevision?: number;
  getStaticTileSyncRevision?(): number;
  isWalkable?(x: number, y: number): boolean;
  getTileTraversalCost?(x: number, y: number): number;
  toTileIndex?(x: number, y: number): number;
}

const MAX_STATIC_GRID_CACHE_ENTRIES = 128;

@Injectable()
export class AsyncPathfindingService {
  /** 缓存的 staticGrid，按实例对象与静态寻路 revision 复用。 */
  private gridCache = new Map<string, {
    instance: PathfindingInstancePort;
    staticRevision: number;
    workerRevision: number;
    walkable: Uint8Array;
    traversalCost: Uint16Array;
  }>();
  /** worker revision 单调递增，避免同 ID 实例销毁重建后命中 worker 旧网格。 */
  private nextWorkerRevision = 1;

  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
  ) {}

  /**
   * 异步寻路。Worker 可用时通过 pool 执行，否则同步 fallback。
   * 适用于 tick 外的玩家寻路意图解析。
   */
  async findPathAsync(
    instance: PathfindingInstancePort,
    blocked: Uint8Array,
    startX: number,
    startY: number,
    goals: PathPoint[],
    maxExpandedNodes?: number,
    maxPathLength?: number,
  ): Promise<PathfindingTaskResult> {
    const width = instance.template.width;
    const height = instance.template.height;
    const total = width * height;
    const limits = {
      maxExpandedNodes: maxExpandedNodes ?? total,
      maxPathLength: maxPathLength ?? total,
    };
    const grid = this.getOrBuildGrid(instance);

    if (!this.encodingPool) {
      return this.executeSyncFallback(grid, blocked, startX, startY, goals, limits, width, height);
    }

    const input: PathfindingTaskInput = {
      // PathfindingTaskInput 的 mapId 是 worker 缓存命名空间；必须使用实例 ID，不能使用模板 ID。
      mapId: resolvePathfindingInstanceId(instance),
      mapRevision: grid.workerRevision,
      width,
      height,
      walkable: grid.walkable,
      traversalCost: grid.traversalCost,
      blocked,
      startX,
      startY,
      goals,
      maxExpandedNodes: limits.maxExpandedNodes,
      maxPathLength: limits.maxPathLength,
    };

    const result = await this.encodingPool.submit<PathfindingTaskInput, PathfindingTaskResult>(
      'pathfind',
      input,
      (payload) => this.executeSyncFallback(
        { walkable: payload.walkable!, traversalCost: payload.traversalCost! },
        payload.blocked,
        payload.startX,
        payload.startY,
        payload.goals,
        { maxExpandedNodes: payload.maxExpandedNodes, maxPathLength: payload.maxPathLength },
        payload.width,
        payload.height,
      ),
      500,
    );

    if (result.ok && result.result) {
      return result.result;
    }
    return this.executeSyncFallback(grid, blocked, startX, startY, goals, limits, width, height);
  }

  /** 清理主线静态网格缓存；运行时 reset 后必须重建，不复用旧实例网格。 */
  clearCache(): void {
    this.gridCache.clear();
  }

  private getOrBuildGrid(instance: PathfindingInstancePort): {
    workerRevision: number;
    walkable: Uint8Array;
    traversalCost: Uint16Array;
  } {
    const instanceId = resolvePathfindingInstanceId(instance);
    const staticRevision = resolveStaticPathfindingRevision(instance);
    const cached = this.gridCache.get(instanceId);

    if (cached && cached.instance === instance && cached.staticRevision === staticRevision) {
      // Map 删后重插即可保持最近使用顺序，淘汰冷实例而不是活跃实例。
      this.gridCache.delete(instanceId);
      this.gridCache.set(instanceId, cached);
      return cached;
    }

    const width = instance.template.width;
    const height = instance.template.height;
    const total = width * height;
    const walkable = new Uint8Array(total);
    const traversalCost = new Uint16Array(total);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        walkable[index] = instance.isWalkable?.(x, y) ? 1 : 0;
        traversalCost[index] = instance.getTileTraversalCost?.(x, y) ?? 1;
      }
    }

    const workerRevision = this.allocateWorkerRevision();
    const entry = { instance, staticRevision, workerRevision, walkable, traversalCost };
    this.gridCache.set(instanceId, entry);
    if (this.gridCache.size > MAX_STATIC_GRID_CACHE_ENTRIES) {
      const firstKey = this.gridCache.keys().next().value;
      if (firstKey) this.gridCache.delete(firstKey);
    }
    return entry;
  }

  private allocateWorkerRevision(): number {
    const revision = this.nextWorkerRevision;
    this.nextWorkerRevision = revision >= Number.MAX_SAFE_INTEGER - 1 ? 1 : revision + 1;
    return revision;
  }

  private executeSyncFallback(
    grid: { walkable: Uint8Array; traversalCost: Uint16Array },
    blocked: Uint8Array,
    startX: number,
    startY: number,
    goals: PathPoint[],
    limits: { maxExpandedNodes: number; maxPathLength: number },
    width: number,
    height: number,
  ): PathfindingTaskResult {
    const result = findBoundedPath(
      { mapId: 'server_async', mapRevision: 0, width, height, walkable: grid.walkable, traversalCost: grid.traversalCost },
      blocked,
      startX,
      startY,
      goals,
      limits,
    );

    if (result.status === 'success') {
      return { status: 'success', path: result.path, expandedNodes: result.expandedNodes, reachedGoal: result.reachedGoal, complete: result.complete };
    }
    return { status: 'failed', path: [], expandedNodes: result.expandedNodes, reason: result.reason };
  }
}

function resolvePathfindingInstanceId(instance: PathfindingInstancePort): string {
  const instanceId = typeof instance.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
  return instanceId || instance.template.id;
}

function resolveStaticPathfindingRevision(instance: PathfindingInstancePort): number {
  const revision = typeof instance.getStaticTileSyncRevision === 'function'
    ? instance.getStaticTileSyncRevision()
    : instance.staticTileSyncRevision;
  return Math.max(0, Math.trunc(Number(revision) || 0));
}

/**
 * 服务端异步寻路入口。
 * 从 MapInstanceRuntime 提取 staticGrid，通过 EncodingWorkerPool 异步执行 A* 寻路。
 * 用于 tick 外的玩家寻路意图解析（enqueueMoveTo），不阻塞 tick。
 *
 * 特性开关：SERVER_PATHFINDING_WORKER_ENABLED（默认关闭，走同步 fallback）
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { findBoundedPath, type PathPoint, type PathfindingTaskInput, type PathfindingTaskResult } from '@mud/shared';

import { EncodingWorkerPoolService } from '../../concurrency/encoding-worker-pool.service';

/** 是否启用寻路 Worker */
function isPathfindingWorkerEnabled(): boolean {
  return process.env.SERVER_PATHFINDING_WORKER_ENABLED === 'true';
}

/** 从 instance 提取 staticGrid 所需的最小接口 */
interface PathfindingInstancePort {
  template: { width: number; height: number; id: string };
  meta?: { instanceId?: string };
  mapRevision?: number;
  isWalkable?(x: number, y: number): boolean;
  getTileTraversalCost?(x: number, y: number): number;
  toTileIndex?(x: number, y: number): number;
}

@Injectable()
export class AsyncPathfindingService {
  private readonly logger = new Logger(AsyncPathfindingService.name);
  private readonly enabled = isPathfindingWorkerEnabled();

  /** 缓存的 staticGrid，按 (instanceId, mapRevision) 复用 */
  private gridCache = new Map<string, {
    mapRevision: number;
    walkable: Uint8Array;
    traversalCost: Uint16Array;
  }>();

  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
  ) {}

  /**
   * 异步寻路。Worker 启用时通过 pool 执行，否则同步 fallback。
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

    // 提取或复用 staticGrid
    const grid = this.getOrBuildGrid(instance);

    if (!this.enabled || !this.encodingPool?.isEnabled()) {
      // 同步 fallback：直接调用 shared 的 findBoundedPath
      return this.executeSyncFallback(grid, blocked, startX, startY, goals, limits, width, height);
    }

    // 异步路径：通过 worker pool
    const input: PathfindingTaskInput = {
      mapId: instance.template.id,
      mapRevision: instance.mapRevision ?? 0,
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
      500, // 500ms deadline
    );

    return result.ok && result.result ? result.result : { status: 'failed', path: [], expandedNodes: 0, reason: 'worker_error' };
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return this.enabled;
  }

  private getOrBuildGrid(instance: PathfindingInstancePort): { walkable: Uint8Array; traversalCost: Uint16Array } {
    const instanceId = instance.meta?.instanceId ?? instance.template.id;
    const revision = instance.mapRevision ?? 0;
    const cached = this.gridCache.get(instanceId);

    if (cached && cached.mapRevision === revision) {
      return cached;
    }

    const width = instance.template.width;
    const height = instance.template.height;
    const total = width * height;
    const walkable = new Uint8Array(total);
    const traversalCost = new Uint16Array(total);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        walkable[index] = instance.isWalkable?.(x, y) ? 1 : 0;
        traversalCost[index] = instance.getTileTraversalCost?.(x, y) ?? 1;
      }
    }

    const entry = { mapRevision: revision, walkable, traversalCost };
    this.gridCache.set(instanceId, entry);

    // 限制缓存大小
    if (this.gridCache.size > 100) {
      const firstKey = this.gridCache.keys().next().value;
      if (firstKey) this.gridCache.delete(firstKey);
    }

    return entry;
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

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
  mapRevision?: number;
  isWalkable?(x: number, y: number): boolean;
  getTileTraversalCost?(x: number, y: number): number;
  toTileIndex?(x: number, y: number): number;
}

@Injectable()
export class AsyncPathfindingService {
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
      500,
    );

    if (result.ok && result.result) {
      return result.result;
    }
    return this.executeSyncFallback(grid, blocked, startX, startY, goals, limits, width, height);
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

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        walkable[index] = instance.isWalkable?.(x, y) ? 1 : 0;
        traversalCost[index] = instance.getTileTraversalCost?.(x, y) ?? 1;
      }
    }

    const entry = { mapRevision: revision, walkable, traversalCost };
    this.gridCache.set(instanceId, entry);
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

/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  findBoundedPath,
  type PathPoint,
  type PathfindingBatchRequest,
  type PathfindingBatchTaskInput,
  type PathfindingBatchTaskResult,
  type PathfindingTaskResult,
} from '@mud/shared';

import { EncodingWorkerPoolService } from '../../concurrency/encoding-worker-pool.service';

/** 从 instance 提取 staticGrid 所需的最小接口 */
interface PathfindingInstancePort {
  template: { width: number; height: number; id: string };
  meta?: { instanceId?: string };
  staticPathingRevision?: number;
  getStaticPathingRevision?(): number;
  isCellIndexWalkable?(cellIndex: number): boolean;
  isWalkable?(x: number, y: number): boolean;
  getStaticTileTraversalCost?(x: number, y: number): number;
  getTileTraversalCost?(x: number, y: number): number;
  toTileIndex?(x: number, y: number): number;
}

const MAX_STATIC_GRID_CACHE_ENTRIES = 128;
/** 单批上限控制 Worker 单任务尾延迟；同实例超量请求会拆成多个公平排队的批次。 */
export const ASYNC_PATHFINDING_MAX_REQUESTS_PER_BATCH = 32;
/** 为 AOI/FOV 等编码任务保留 Worker 容量，寻路不能把整个 EncodingWorkerPool 塞满。 */
export const ASYNC_PATHFINDING_MAX_IN_FLIGHT_BATCHES = 4;
const ASYNC_PATHFINDING_BASE_DEADLINE_MS = 500;
const ASYNC_PATHFINDING_PER_REQUEST_DEADLINE_MS = 25;
const ASYNC_PATHFINDING_MAX_DEADLINE_MS = 1_500;

interface QueuedPathfindingRequest {
  request: PathfindingBatchRequest;
  resolve: (result: PathfindingTaskResult) => void;
}

interface PendingPathfindingBatch {
  key: string;
  mapId: string;
  mapRevision: number;
  width: number;
  height: number;
  walkable: Uint8Array;
  traversalCost: Uint16Array;
  requests: QueuedPathfindingRequest[];
}

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
  /** 同一事件循环内按 instance+revision 聚合，避免逐玩家 postMessage。 */
  private readonly pendingBatchByKey = new Map<string, PendingPathfindingBatch>();
  /** 已封装批次等待受控提交；数组只持有共享静态网格引用，不复制网格字节。 */
  private readonly readyBatches: PendingPathfindingBatch[] = [];
  private batchFlushScheduled = false;
  private inFlightBatchCount = 0;
  private submittedBatchCount = 0;
  private submittedRequestCount = 0;
  private maxObservedInFlightBatchCount = 0;

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
    return this.findPathByBlockedIndicesAsync(
      instance,
      collectBlockedIndices(blocked),
      startX,
      startY,
      goals,
      maxExpandedNodes,
      maxPathLength,
    );
  }

  /**
   * 生产路径使用稀疏动态阻挡，并在当前事件循环内自动并入实例批任务。
   * 返回 Promise 保持原调用语义；背压发生在 Worker 提交边界，不制造无界 pendingTasks。
   */
  async findPathByBlockedIndicesAsync(
    instance: PathfindingInstancePort,
    blockedIndices: Uint32Array,
    startX: number,
    startY: number,
    goals: PathPoint[],
    maxExpandedNodes?: number,
    maxPathLength?: number,
  ): Promise<PathfindingTaskResult> {
    const width = instance.template.width;
    const height = instance.template.height;
    const total = width * height;
    const request: PathfindingBatchRequest = {
      blockedIndices,
      startX,
      startY,
      goals,
      maxExpandedNodes: maxExpandedNodes ?? total,
      maxPathLength: maxPathLength ?? total,
    };
    const grid = this.getOrBuildGrid(instance);
    if (!this.encodingPool) {
      return this.executeSyncRequest(grid, request, width, height);
    }
    const mapId = resolvePathfindingInstanceId(instance);
    const key = `${mapId}\u0000${grid.workerRevision}`;
    let batch = this.pendingBatchByKey.get(key);
    if (!batch) {
      batch = {
        key,
        mapId,
        mapRevision: grid.workerRevision,
        width,
        height,
        walkable: grid.walkable,
        traversalCost: grid.traversalCost,
        requests: [],
      };
      this.pendingBatchByKey.set(key, batch);
    }
    const result = new Promise<PathfindingTaskResult>((resolve) => {
      batch!.requests.push({ request, resolve });
    });
    this.scheduleBatchFlush();
    return result;
  }

  /** 清理主线静态网格缓存；运行时 reset 后必须重建，不复用旧实例网格。 */
  clearCache(): void {
    this.gridCache.clear();
  }

  /** 只读诊断，用于证明批次数、请求复用率与并发背压。 */
  getBatchDiagnostics(): {
    submittedBatchCount: number;
    submittedRequestCount: number;
    inFlightBatchCount: number;
    readyBatchCount: number;
    maxObservedInFlightBatchCount: number;
  } {
    return {
      submittedBatchCount: this.submittedBatchCount,
      submittedRequestCount: this.submittedRequestCount,
      inFlightBatchCount: this.inFlightBatchCount,
      readyBatchCount: this.readyBatches.length,
      maxObservedInFlightBatchCount: this.maxObservedInFlightBatchCount,
    };
  }

  private scheduleBatchFlush(): void {
    if (this.batchFlushScheduled) {
      return;
    }
    this.batchFlushScheduled = true;
    queueMicrotask(() => {
      this.batchFlushScheduled = false;
      this.flushPendingBatches();
    });
  }

  /** 按实例轮转切块，避免一个大型实例长期压住其他实例的寻路结果。 */
  private flushPendingBatches(): void {
    const pending = Array.from(this.pendingBatchByKey.values());
    this.pendingBatchByKey.clear();
    let hasRemaining = true;
    while (hasRemaining) {
      hasRemaining = false;
      for (const batch of pending) {
        if (batch.requests.length === 0) {
          continue;
        }
        hasRemaining = true;
        this.readyBatches.push({
          ...batch,
          requests: batch.requests.splice(0, ASYNC_PATHFINDING_MAX_REQUESTS_PER_BATCH),
        });
      }
    }
    this.drainReadyBatches();
  }

  private drainReadyBatches(): void {
    while (
      this.inFlightBatchCount < ASYNC_PATHFINDING_MAX_IN_FLIGHT_BATCHES
      && this.readyBatches.length > 0
    ) {
      const batch = this.readyBatches.shift();
      if (!batch) {
        return;
      }
      this.inFlightBatchCount += 1;
      this.maxObservedInFlightBatchCount = Math.max(
        this.maxObservedInFlightBatchCount,
        this.inFlightBatchCount,
      );
      this.submittedBatchCount += 1;
      this.submittedRequestCount += batch.requests.length;
      void this.executeWorkerBatch(batch).finally(() => {
        this.inFlightBatchCount -= 1;
        this.drainReadyBatches();
      });
    }
  }

  private async executeWorkerBatch(batch: PendingPathfindingBatch): Promise<void> {
    const input: PathfindingBatchTaskInput = {
      mapId: batch.mapId,
      mapRevision: batch.mapRevision,
      width: batch.width,
      height: batch.height,
      walkable: batch.walkable,
      traversalCost: batch.traversalCost,
      requests: batch.requests.map((entry) => entry.request),
    };
    const deadlineMs = Math.min(
      ASYNC_PATHFINDING_MAX_DEADLINE_MS,
      ASYNC_PATHFINDING_BASE_DEADLINE_MS
        + batch.requests.length * ASYNC_PATHFINDING_PER_REQUEST_DEADLINE_MS,
    );
    let results: PathfindingTaskResult[];
    try {
      const workerResult = await this.encodingPool!.submit<PathfindingBatchTaskInput, PathfindingBatchTaskResult>(
        'pathfind-batch',
        input,
        (payload) => this.executeSyncBatch(payload),
        deadlineMs,
      );
      results = workerResult.ok
        && Array.isArray(workerResult.result?.results)
        && workerResult.result.results.length === batch.requests.length
        ? workerResult.result.results
        : this.executeSyncBatch(input).results;
    }
    catch {
      results = this.executeSyncBatch(input).results;
    }
    for (let index = 0; index < batch.requests.length; index += 1) {
      batch.requests[index].resolve(results[index] ?? createPathfindingFailure('batch_result_missing'));
    }
  }

  private executeSyncBatch(input: PathfindingBatchTaskInput): PathfindingBatchTaskResult {
    const blocked = new Uint8Array(Math.max(0, input.width * input.height));
    const grid = { walkable: input.walkable, traversalCost: input.traversalCost };
    const results = input.requests.map((request) => {
      try {
        applySparseBlockedIndices(blocked, request.blockedIndices, 1);
        return this.executeSyncRequest(grid, request, input.width, input.height, blocked);
      }
      catch {
        return createPathfindingFailure('batch_request_failed');
      }
      finally {
        applySparseBlockedIndices(blocked, request.blockedIndices, 0);
      }
    });
    return { results };
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
    // 静态网格构建完成后只读；SharedArrayBuffer 让多个批任务/Worker 共享同一份字节。
    const walkable = createSharedUint8Array(total);
    const traversalCost = createSharedUint16Array(total);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        // 静态网格不能混入阵法边界、单位占位等玩家相关动态阻挡；它们由每次任务的 blocked 掩码承载。
        const staticWalkable = typeof instance.isCellIndexWalkable === 'function'
          ? instance.isCellIndexWalkable(index)
          : instance.isWalkable?.(x, y) === true;
        const staticTraversalCost = typeof instance.getStaticTileTraversalCost === 'function'
          ? instance.getStaticTileTraversalCost(x, y)
          : instance.getTileTraversalCost?.(x, y) ?? 1;
        walkable[index] = staticWalkable ? 1 : 0;
        traversalCost[index] = Number.isFinite(staticTraversalCost) && staticTraversalCost > 0
          ? Math.min(0xffff, Math.max(1, Math.trunc(staticTraversalCost)))
          : 1;
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

  private executeSyncRequest(
    grid: { walkable: Uint8Array; traversalCost: Uint16Array },
    request: PathfindingBatchRequest,
    width: number,
    height: number,
    reusableBlocked?: Uint8Array,
  ): PathfindingTaskResult {
    const blocked = reusableBlocked ?? new Uint8Array(Math.max(0, width * height));
    if (!reusableBlocked) {
      applySparseBlockedIndices(blocked, request.blockedIndices, 1);
    }
    const result = findBoundedPath(
      { mapId: 'server_async', mapRevision: 0, width, height, walkable: grid.walkable, traversalCost: grid.traversalCost },
      blocked,
      request.startX,
      request.startY,
      request.goals,
      {
        maxExpandedNodes: request.maxExpandedNodes,
        maxPathLength: request.maxPathLength,
        maxGoalDistance: request.maxGoalDistance,
        allowPartialPath: request.allowPartialPath,
      },
    );

    if (result.status === 'success') {
      return { status: 'success', path: result.path, expandedNodes: result.expandedNodes, reachedGoal: result.reachedGoal, complete: result.complete };
    }
    return createPathfindingFailure(result.reason, result.expandedNodes);
  }
}

function createSharedUint8Array(length: number): Uint8Array {
  return typeof SharedArrayBuffer === 'function'
    ? new Uint8Array(new SharedArrayBuffer(length * Uint8Array.BYTES_PER_ELEMENT))
    : new Uint8Array(length);
}

function createSharedUint16Array(length: number): Uint16Array {
  return typeof SharedArrayBuffer === 'function'
    ? new Uint16Array(new SharedArrayBuffer(length * Uint16Array.BYTES_PER_ELEMENT))
    : new Uint16Array(length);
}

function collectBlockedIndices(blocked: Uint8Array): Uint32Array {
  const indices: number[] = [];
  for (let index = 0; index < blocked.length; index += 1) {
    if (blocked[index] !== 0) {
      indices.push(index);
    }
  }
  return Uint32Array.from(indices);
}

function applySparseBlockedIndices(target: Uint8Array, indices: Uint32Array, value: 0 | 1): void {
  if (!(indices instanceof Uint32Array)) {
    return;
  }
  for (const index of indices) {
    if (index < target.length) {
      target[index] = value;
    }
  }
}

function createPathfindingFailure(reason = 'pathfinding_failed', expandedNodes = 0): PathfindingTaskResult {
  return { status: 'failed', path: [], expandedNodes, reason };
}

function resolvePathfindingInstanceId(instance: PathfindingInstancePort): string {
  const instanceId = typeof instance.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
  return instanceId || instance.template.id;
}

function resolveStaticPathfindingRevision(instance: PathfindingInstancePort): number {
  const revision = typeof instance.getStaticPathingRevision === 'function'
    ? instance.getStaticPathingRevision()
    : instance.staticPathingRevision;
  return Math.max(0, Math.trunc(Number(revision) || 0));
}

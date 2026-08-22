/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * Encoding Worker 入口。
 * 在 worker_threads 中运行，处理 A* 寻路。
 * 不依赖 NestJS 容器，直接 import shared 纯函数。
 */
import { parentPort } from 'node:worker_threads';
import { findBoundedPath, type PathfindingStaticGrid } from '@mud/shared';
import type {
  PathfindingBatchRequest,
  PathfindingBatchTaskInput,
  PathfindingBatchTaskResult,
  PathfindingTaskInput,
  PathfindingTaskResult,
} from '@mud/shared';

import type { WorkerTaskEnvelope, WorkerTaskResult } from '../worker-task.types';

if (!parentPort) {
  throw new Error('encoding.worker.ts must be run as a worker_threads Worker');
}

parentPort.on('message', (envelope: WorkerTaskEnvelope) => {
  const startedAt = performance.now();
  try {
    const result = handleTask(envelope);
    const response: WorkerTaskResult = {
      taskId: envelope.taskId,
      ok: true,
      result,
      durationMs: performance.now() - startedAt,
    };
    parentPort!.postMessage(response);
  } catch (err: unknown) {
    const response: WorkerTaskResult = {
      taskId: envelope.taskId,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - startedAt,
    };
    parentPort!.postMessage(response);
  }
});

function handleTask(envelope: WorkerTaskEnvelope): unknown {
  switch (envelope.kind) {
    case 'pathfind':
      return handlePathfind(envelope.payload);
    case 'pathfind-batch':
      return handlePathfindBatch(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

/** 缓存的 staticGrid，按 (mapId, mapRevision) 复用 */
let cachedGrid: PathfindingStaticGrid | null = null;

function handlePathfind(payload: unknown): PathfindingTaskResult {
  const input = payload as PathfindingTaskInput;
  const grid = resolvePathfindingGrid(input);
  if (!grid) {
    return { status: 'failed', path: [], expandedNodes: 0, reason: 'missing_grid_data' };
  }
  return executePathfindingRequest(
    grid,
    input.blocked,
    input,
  );
}

/** 同实例的一批请求只解析一份静态网格，并复用一张动态阻挡 scratch。 */
function handlePathfindBatch(payload: unknown): PathfindingBatchTaskResult {
  const input = payload as PathfindingBatchTaskInput;
  const requests = Array.isArray(input?.requests) ? input.requests : [];
  const grid = resolvePathfindingGrid(input);
  if (!grid) {
    return {
      results: requests.map(() => ({
        status: 'failed',
        path: [],
        expandedNodes: 0,
        reason: 'missing_grid_data',
      })),
    };
  }
  const blocked = new Uint8Array(Math.max(0, input.width * input.height));
  const results: PathfindingTaskResult[] = [];
  for (const request of requests) {
    try {
      applySparseBlockedIndices(blocked, request.blockedIndices, 1);
      results.push(executePathfindingRequest(grid, blocked, request));
    }
    catch {
      results.push({ status: 'failed', path: [], expandedNodes: 0, reason: 'batch_request_failed' });
    }
    finally {
      applySparseBlockedIndices(blocked, request.blockedIndices, 0);
    }
  }
  return { results };
}

function resolvePathfindingGrid(input: {
  mapId: string;
  mapRevision: number;
  width: number;
  height: number;
  walkable?: Uint8Array;
  traversalCost?: Uint16Array;
}): PathfindingStaticGrid | null {
  if (
    cachedGrid
    && cachedGrid.mapId === input.mapId
    && cachedGrid.mapRevision === input.mapRevision
    && cachedGrid.width === input.width
    && cachedGrid.height === input.height
  ) {
    return cachedGrid;
  }
  if (!input.walkable || !input.traversalCost) {
    return null;
  }
  cachedGrid = {
    mapId: input.mapId,
    mapRevision: input.mapRevision,
    width: input.width,
    height: input.height,
    walkable: input.walkable,
    traversalCost: input.traversalCost,
  };
  return cachedGrid;
}

function executePathfindingRequest(
  grid: PathfindingStaticGrid,
  blocked: Uint8Array,
  request: Pick<
    PathfindingBatchRequest,
    'startX' | 'startY' | 'goals' | 'maxExpandedNodes' | 'maxPathLength' | 'maxGoalDistance' | 'allowPartialPath'
  >,
): PathfindingTaskResult {
  const result = findBoundedPath(
    grid,
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
    return {
      status: 'success',
      path: result.path,
      expandedNodes: result.expandedNodes,
      reachedGoal: result.reachedGoal,
      complete: result.complete,
    };
  }

  return {
    status: 'failed',
    path: [],
    expandedNodes: result.expandedNodes,
    reason: result.reason,
  };
}

function applySparseBlockedIndices(target: Uint8Array, indices: Uint32Array, value: 0 | 1): void {
  if (!(indices instanceof Uint32Array)) {
    return;
  }
  for (const index of indices) {
  }
}


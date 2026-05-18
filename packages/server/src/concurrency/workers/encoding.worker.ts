/**
 * Encoding Worker 入口。
 * 在 worker_threads 中运行，处理 AOI envelope 编码、A* 寻路、FOV 计算。
 * 不依赖 NestJS 容器，直接 import shared 纯函数。
 */
import { parentPort } from 'node:worker_threads';
import { findBoundedPath, type PathfindingStaticGrid } from '@mud/shared';
import type { PathfindingTaskInput, PathfindingTaskResult } from '@mud/shared';

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
    case 'envelope-encode':
      return handleEnvelopeEncode(envelope.payload);
    case 'pathfind':
      return handlePathfind(envelope.payload);
    case 'fov':
      return handleFov(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

function handleEnvelopeEncode(payload: unknown): Buffer {
  // 将 envelope POJO 编码为 UTF-8 JSON bytes
  return Buffer.from(JSON.stringify(payload), 'utf-8');
}

/** 缓存的 staticGrid，按 (mapId, mapRevision) 复用 */
let cachedGrid: PathfindingStaticGrid | null = null;

function handlePathfind(payload: unknown): PathfindingTaskResult {
  const input = payload as PathfindingTaskInput;

  // 更新或复用缓存
  if (
    !cachedGrid
    || cachedGrid.mapId !== input.mapId
    || cachedGrid.mapRevision !== input.mapRevision
    || (input.walkable && input.traversalCost)
  ) {
    if (!input.walkable || !input.traversalCost) {
      return { status: 'failed', path: [], expandedNodes: 0, reason: 'missing_grid_data' };
    }
    cachedGrid = {
      mapId: input.mapId,
      mapRevision: input.mapRevision,
      width: input.width,
      height: input.height,
      walkable: input.walkable,
      traversalCost: input.traversalCost,
    };
  }

  const result = findBoundedPath(
    cachedGrid,
    input.blocked,
    input.startX,
    input.startY,
    input.goals,
    {
      maxExpandedNodes: input.maxExpandedNodes,
      maxPathLength: input.maxPathLength,
      maxGoalDistance: input.maxGoalDistance,
      allowPartialPath: input.allowPartialPath,
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

function handleFov(_payload: unknown): unknown {
  // TODO: Phase 3 实现 FOV 计算
  return null;
}

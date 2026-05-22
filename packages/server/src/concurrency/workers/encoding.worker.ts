/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
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

function handleFov(payload: unknown): { visibleIndices: number[] } {
  const input = payload as {
    blocksSightMask: Uint8Array;
    width: number;
    height: number;
    originX: number;
    originY: number;
    radius: number;
  };

  const { blocksSightMask, width, height, originX, originY, radius } = input;
  const visibleSet = new Set<number>();

  // 原点始终可见
  if (originX >= 0 && originX < width && originY >= 0 && originY < height) {
    visibleSet.add(originY * width + originX);
  }

  // 8 八分区 shadowcasting
  const octants: [number, number, number, number][] = [
    [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
    [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
  ];

  for (const [xx, xy, yx, yy] of octants) {
    castLightOctant(
      width, height, originX, originY, radius,
      1, 1, 0, xx, xy, yx, yy,
      blocksSightMask, visibleSet,
    );
  }

  return { visibleIndices: Array.from(visibleSet) };
}

function castLightOctant(
  width: number, height: number,
  ox: number, oy: number, radius: number,
  row: number, startSlope: number, endSlope: number,
  xx: number, xy: number, yx: number, yy: number,
  mask: Uint8Array, visible: Set<number>,
): void {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;

  for (let i = row; i <= radius; i++) {
    let blocked = false;
    for (let dx = -i; dx <= 0; dx++) {
      const dy = -i;
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      const mapX = ox + dx * xx + dy * xy;
      const mapY = oy + dx * yx + dy * yy;

      if (mapX < 0 || mapX >= width || mapY < 0 || mapY >= height) {
        blocked = true;
        nextStartSlope = rSlope;
        continue;
      }

      const distSq = dx * dx + dy * dy;
      if (distSq > radius * radius) {
        blocked = true;
        nextStartSlope = rSlope;
        continue;
      }

      const index = mapY * width + mapX;
      visible.add(index);

      if (mask[index]) {
        if (!blocked) {
          castLightOctant(
            width, height, ox, oy, radius,
            i + 1, nextStartSlope, lSlope,
            xx, xy, yx, yy, mask, visible,
          );
        }
        blocked = true;
        nextStartSlope = rSlope;
      } else {
        if (blocked) {
          nextStartSlope = rSlope;
        }
        blocked = false;
      }
    }
    if (blocked) break;
  }
}

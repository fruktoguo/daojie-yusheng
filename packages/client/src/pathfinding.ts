/**
 * 客户端寻路包装层，复用 shared 中的纯函数寻路核心。
 */

import { deltaToDirection, Direction, findBoundedPath, getTileTraversalCost, Tile } from '@mud/shared';
import type { PathfindingTaskInput, PathfindingTaskResult } from '@mud/shared';

// ─── Web Worker 异步寻路 ───────────────────────────────────────

let pathWorker: Worker | null = null;
let pendingResolve: ((result: PathfindingTaskResult) => void) | null = null;

/** 是否禁用寻路 Worker（调试参数） */
function isPathWorkerDisabled(): boolean {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search).has('disablePathWorker');
}

/** 获取或创建寻路 Worker */
function getPathWorker(): Worker | null {
  if (isPathWorkerDisabled()) return null;
  if (pathWorker) return pathWorker;
  try {
    pathWorker = new Worker(
      new URL('./workers/pathfinding.worker.ts', import.meta.url),
      { type: 'module' },
    );
    pathWorker.onmessage = (event: MessageEvent<PathfindingTaskResult>) => {
      if (pendingResolve) {
        pendingResolve(event.data);
        pendingResolve = null;
      }
    };
    pathWorker.onerror = () => {
      // Worker 失败时 fallback 到同步
      pathWorker = null;
    };
    return pathWorker;
  } catch {
    return null;
  }
}

/** 异步寻路入口（通过 Web Worker）。Worker 不可用时 fallback 到同步。 */
export async function findPathAsync(
  tiles: Tile[][],
  sx: number, sy: number,
  ex: number, ey: number,
): Promise<Direction[] | null> {
  const worker = getPathWorker();
  if (!worker) {
    return findPath(tiles, sx, sy, ex, ey);
  }

  const rows = tiles.length;
  if (rows === 0) return null;
  const cols = tiles[0].length;
  if (sx === ex && sy === ey) return [];
  if (ey < 0 || ey >= rows || ex < 0 || ex >= cols) return null;
  if (!tiles[ey]?.[ex]?.walkable) return null;

  const total = rows * cols;
  const walkable = new Uint8Array(total);
  const traversalCost = new Uint16Array(total);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tile = tiles[y]?.[x];
      if (!tile) continue;
      const index = y * cols + x;
      walkable[index] = tile.walkable ? 1 : 0;
      traversalCost[index] = getTileTraversalCost(tile.type);
    }
  }

  const input: PathfindingTaskInput = {
    mapId: 'client_preview',
    mapRevision: 0,
    width: cols,
    height: rows,
    walkable,
    traversalCost,
    blocked: new Uint8Array(total),
    startX: sx,
    startY: sy,
    goals: [{ x: ex, y: ey }],
    maxExpandedNodes: total,
    maxPathLength: total,
  };

  const result = await new Promise<PathfindingTaskResult>((resolve) => {
    pendingResolve = resolve;
    worker.postMessage(input, [walkable.buffer, traversalCost.buffer, input.blocked.buffer]);
  });

  if (result.status !== 'success' || !result.complete) {
    return null;
  }

  const directions: Direction[] = [];
  let currentX = sx;
  let currentY = sy;
  for (const step of result.path) {
    const direction = deltaToDirection(step.x - currentX, step.y - currentY);
    if (direction === null) return null;
    directions.push(direction);
    currentX = step.x;
    currentY = step.y;
  }
  return directions;
}

/** A* 寻路，返回 Direction[] 路径；不可达返回 null */
export function findPath(
  tiles: Tile[][],
  sx: number, sy: number,
  ex: number, ey: number,
): Direction[] | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const rows = tiles.length;
  if (rows === 0) return null;
  const cols = tiles[0].length;

  if (sx === ex && sy === ey) return [];
  if (ey < 0 || ey >= rows || ex < 0 || ex >= cols) return null;
  if (!tiles[ey]?.[ex]?.walkable) return null;

  const total = rows * cols;
  const walkable = new Uint8Array(total);
  const traversalCost = new Uint16Array(total);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tile = tiles[y]?.[x];
      if (!tile) {
        continue;
      }
      const index = y * cols + x;
      walkable[index] = tile.walkable ? 1 : 0;
      traversalCost[index] = getTileTraversalCost(tile.type);
    }
  }

  const result = findBoundedPath(
    {
      mapId: 'client_preview',
      mapRevision: 0,
      width: cols,
      height: rows,
      walkable,
      traversalCost,
    },
    new Uint8Array(total),
    sx,
    sy,
    [{ x: ex, y: ey }],
    {
      maxExpandedNodes: total,
      maxPathLength: total,
    },
  );
  if (result.status !== 'success' || !result.complete) {
    return null;
  }

  const directions: Direction[] = [];
  let currentX = sx;
  let currentY = sy;
  for (const step of result.path) {
    const direction = deltaToDirection(step.x - currentX, step.y - currentY);
    if (direction === null) {
      return null;
    }
    directions.push(direction);
    /** currentX：当前X。 */
    currentX = step.x;
    /** currentY：当前Y。 */
    currentY = step.y;
  }

  return directions;
}




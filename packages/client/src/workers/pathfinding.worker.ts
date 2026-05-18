/**
 * 客户端寻路 Web Worker。
 * 接收寻路请求，调用 shared/pathfinding 的 findBoundedPath，返回结果。
 * 按 (mapId, mapRevision) 缓存 staticGrid，避免每次传输大数组。
 */
import { findBoundedPath, type PathfindingStaticGrid } from '@mud/shared';
import type { PathfindingTaskInput, PathfindingTaskResult } from '@mud/shared';

/** 缓存的 staticGrid */
let cachedGrid: PathfindingStaticGrid | null = null;

self.onmessage = (event: MessageEvent<PathfindingTaskInput>) => {
  const input = event.data;
  try {
    const result = handlePathfindRequest(input);
    self.postMessage(result);
  } catch (err: unknown) {
    const errorResult: PathfindingTaskResult = {
      status: 'failed',
      path: [],
      expandedNodes: 0,
      reason: err instanceof Error ? err.message : 'unknown_error',
    };
    self.postMessage(errorResult);
  }
};

function handlePathfindRequest(input: PathfindingTaskInput): PathfindingTaskResult {
  // 更新或复用缓存的 staticGrid
  if (
    !cachedGrid
    || cachedGrid.mapId !== input.mapId
    || cachedGrid.mapRevision !== input.mapRevision
    || (input.walkable && input.traversalCost)
  ) {
    if (!input.walkable || !input.traversalCost) {
      return {
        status: 'failed',
        path: [],
        expandedNodes: 0,
        reason: 'missing_grid_data',
      };
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

  const searchResult = findBoundedPath(
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

  if (searchResult.status === 'success') {
    return {
      status: 'success',
      path: searchResult.path,
      expandedNodes: searchResult.expandedNodes,
      reachedGoal: searchResult.reachedGoal,
      complete: searchResult.complete,
    };
  }

  return {
    status: 'failed',
    path: [],
    expandedNodes: searchResult.expandedNodes,
    reason: searchResult.reason,
  };
}

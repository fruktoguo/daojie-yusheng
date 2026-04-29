/**
 * 格子距离计算工具：支持按共享常量切换范围判定口径。
 */
import { GAME_RANGE_DISTANCE_METRIC, type GridDistanceMetric } from './constants/gameplay/distance';
import type { GridPoint } from './targeting';

/** 两点间欧氏距离的平方 */
export function distanceSquared(from: GridPoint, to: GridPoint): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return dx * dx + dy * dy;
}

/** 两点间曼哈顿距离 */
export function manhattanDistance(from: GridPoint, to: GridPoint): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/** 两点间切比雪夫距离。 */
export function chebyshevDistance(from: GridPoint, to: GridPoint): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

/** 偏移量对应的格距。 */
export function offsetDistance(dx: number, dy: number, metric: GridDistanceMetric = GAME_RANGE_DISTANCE_METRIC): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  switch (metric) {
    case 'euclidean':
      return Math.hypot(absX, absY);
    case 'chebyshev':
      return Math.max(absX, absY);
    case 'manhattan':
    default:
      return absX + absY;
  }
}

/** 两点间格距，默认按共享常量口径计算。 */
export function gridDistance(
  from: GridPoint,
  to: GridPoint,
  metric: GridDistanceMetric = GAME_RANGE_DISTANCE_METRIC,
): number {
  return offsetDistance(to.x - from.x, to.y - from.y, metric);
}

/** 判断给定偏移是否在指定范围内。 */
export function isOffsetInRange(
  dx: number,
  dy: number,
  range: number,
  metric: GridDistanceMetric = GAME_RANGE_DISTANCE_METRIC,
): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  // 1 格射程统一允许斜向相邻，避免欧氏口径下对角线需要额外特判。
  const effectiveMetric = metric === 'euclidean' && range === 1 ? 'chebyshev' : metric;
  switch (metric) {
    case 'euclidean':
      return effectiveMetric === 'chebyshev'
        ? Math.max(Math.abs(dx), Math.abs(dy)) <= range
        : dx * dx + dy * dy <= range * range;
    case 'chebyshev':
      return Math.max(Math.abs(dx), Math.abs(dy)) <= range;
    case 'manhattan':
    default:
      return Math.abs(dx) + Math.abs(dy) <= range;
  }
}

/** 判断目标是否在指定范围内。 */
export function isPointInRange(
  origin: GridPoint,
  target: GridPoint,
  range: number,
  metric: GridDistanceMetric = GAME_RANGE_DISTANCE_METRIC,
): boolean {
  return isOffsetInRange(target.x - origin.x, target.y - origin.y, range, metric);
}

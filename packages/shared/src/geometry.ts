/**
 * 格子距离计算工具：欧氏距离平方、范围判定、曼哈顿距离。
 */
import type { GridPoint } from './targeting';

/** 两点间欧氏距离的平方 */
export function distanceSquared(from: GridPoint, to: GridPoint): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return dx * dx + dy * dy;
}

/** 判断目标是否在指定范围内（欧氏距离） */
export function isPointInRange(origin: GridPoint, target: GridPoint, range: number): boolean {
  return distanceSquared(origin, target) <= range * range;
}

/** 两点间曼哈顿距离 */
export function manhattanDistance(from: GridPoint, to: GridPoint): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

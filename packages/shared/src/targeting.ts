/**
 * 技能目标选取几何计算：单体、直线、范围三种形状的受影响格子计算。
 */
import { isPointInRange } from './geometry';

/** 格子坐标 */
export interface GridPoint {
  x: number;
  y: number;
}

/** 目标选取形状 */
export type TargetingShape = 'single' | 'line' | 'area';

/** 目标选取几何参数 */
export interface TargetingGeometrySpec {
  range: number;
  shape?: TargetingShape;
  radius?: number;
}

/** 用 Bresenham 算法计算两点间直线经过的格子 */
export function getLineCells(start: GridPoint, end: GridPoint): GridPoint[] {
  const cells: GridPoint[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const sx = start.x < end.x ? 1 : -1;
  const sy = start.y < end.y ? 1 : -1;
  let err = dx - dy;

  while (true) {
    cells.push({ x, y });
    if (x === end.x && y === end.y) {
      break;
    }
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return cells;
}

/** 计算以中心点为圆心、指定半径内的所有格子 */
export function getAreaCells(center: GridPoint, radius: number): GridPoint[] {
  const cells: GridPoint[] = [];
  const normalizedRadius = Math.max(0, radius);
  for (let dy = -normalizedRadius; dy <= normalizedRadius; dy += 1) {
    for (let dx = -normalizedRadius; dx <= normalizedRadius; dx += 1) {
      if (dx * dx + dy * dy > normalizedRadius * normalizedRadius) {
        continue;
      }
      cells.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return cells;
}

/** 根据施法者位置、锚点和几何参数，计算受影响的格子列表 */
export function computeAffectedCellsFromAnchor(
  origin: GridPoint,
  anchor: GridPoint,
  spec: TargetingGeometrySpec,
): GridPoint[] {
  if (!isPointInRange(origin, anchor, spec.range)) {
    return [];
  }
  if (spec.shape === 'line') {
    return getLineCells(origin, anchor).slice(1);
  }
  if (spec.shape === 'area') {
    return getAreaCells(anchor, spec.radius ?? 1);
  }
  return [{ x: anchor.x, y: anchor.y }];
}

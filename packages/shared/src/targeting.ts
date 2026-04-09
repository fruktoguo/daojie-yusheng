/**
 * 技能目标选取几何计算：单体、直线、范围、矩形、环带、棋盘等形状的受影响格子计算。
 */
import { isPointInRange } from './geometry';

/** 格子坐标 */
export interface GridPoint {
  x: number;
  y: number;
}

/** 目标选取形状 */
export type TargetingShape = 'single' | 'line' | 'area' | 'box' | 'ring' | 'checkerboard';

/** 目标选取几何参数 */
export interface TargetingGeometrySpec {
  range: number;
  shape?: TargetingShape;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  checkerParity?: 'even' | 'odd';
}

export interface TargetingGeometryModifiers {
  extraRange?: number;
  extraArea?: number;
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

/** 计算以中心点为圆心、内外半径限定的环带格子 */
export function getRingCells(center: GridPoint, innerRadius: number, outerRadius: number): GridPoint[] {
  const cells: GridPoint[] = [];
  const normalizedOuterRadius = Math.max(0, Math.floor(outerRadius));
  const normalizedInnerRadius = Math.max(0, Math.min(normalizedOuterRadius, Math.floor(innerRadius)));
  const innerSquared = normalizedInnerRadius * normalizedInnerRadius;
  const outerSquared = normalizedOuterRadius * normalizedOuterRadius;
  for (let dy = -normalizedOuterRadius; dy <= normalizedOuterRadius; dy += 1) {
    for (let dx = -normalizedOuterRadius; dx <= normalizedOuterRadius; dx += 1) {
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > outerSquared || distanceSquared <= innerSquared) {
        continue;
      }
      cells.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return cells;
}

/** 计算以中心点附近展开、指定宽高的矩形格子 */
export function getBoxCells(center: GridPoint, width: number, height: number): GridPoint[] {
  const cells: GridPoint[] = [];
  const normalizedWidth = Math.max(1, Math.floor(width));
  const normalizedHeight = Math.max(1, Math.floor(height));
  const left = Math.floor((normalizedWidth - 1) / 2);
  const right = normalizedWidth - 1 - left;
  const top = Math.floor((normalizedHeight - 1) / 2);
  const bottom = normalizedHeight - 1 - top;
  for (let dy = -top; dy <= bottom; dy += 1) {
    for (let dx = -left; dx <= right; dx += 1) {
      cells.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return cells;
}

/** 计算交错棋盘格范围 */
export function getCheckerboardCells(
  center: GridPoint,
  width: number,
  height: number,
  parity: 'even' | 'odd' = 'even',
): GridPoint[] {
  const normalizedWidth = Math.max(1, Math.floor(width));
  const normalizedHeight = Math.max(1, Math.floor(height));
  const left = Math.floor((normalizedWidth - 1) / 2);
  const top = Math.floor((normalizedHeight - 1) / 2);
  return getBoxCells(center, normalizedWidth, normalizedHeight).filter((cell) => {
    const dx = cell.x - center.x + left;
    const dy = cell.y - center.y + top;
    const even = (dx + dy) % 2 === 0;
    return parity === 'even' ? even : !even;
  });
}

function getLinePerpendicularOffsets(width: number, dx: number, dy: number): GridPoint[] {
  const normalizedWidth = Math.max(1, Math.floor(width));
  const negative = Math.floor((normalizedWidth - 1) / 2);
  const positive = normalizedWidth - 1 - negative;
  const offsets: GridPoint[] = [];
  const expandAlongX = Math.abs(dy) > Math.abs(dx);
  for (let step = -negative; step <= positive; step += 1) {
    offsets.push(expandAlongX ? { x: step, y: 0 } : { x: 0, y: step });
  }
  return offsets;
}

function getWideLineCells(start: GridPoint, end: GridPoint, width: number): GridPoint[] {
  const line = getLineCells(start, end).slice(1);
  if (line.length === 0) {
    return [];
  }
  const offsets = getLinePerpendicularOffsets(width, end.x - start.x, end.y - start.y);
  const cells: GridPoint[] = [];
  const seen = new Set<string>();
  for (const point of line) {
    for (const offset of offsets) {
      const cell = { x: point.x + offset.x, y: point.y + offset.y };
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

export function buildEffectiveTargetingGeometry(
  spec: TargetingGeometrySpec,
  modifiers?: TargetingGeometryModifiers,
): TargetingGeometrySpec {
  const extraRange = Math.max(0, Math.floor(modifiers?.extraRange ?? 0));
  const extraArea = Math.max(0, Math.floor(modifiers?.extraArea ?? 0));
  const shape = spec.shape ?? 'single';
  const effective: TargetingGeometrySpec = {
    ...spec,
    shape,
    range: Math.max(0, Math.floor(spec.range) + extraRange),
  };

  if (extraArea <= 0) {
    return effective;
  }
  if (shape === 'single') {
    effective.shape = 'box';
    effective.width = 1 + extraArea * 2;
    effective.height = 1 + extraArea * 2;
    return effective;
  }
  if (shape === 'line') {
    effective.width = Math.max(1, Math.floor(spec.width ?? 1) + extraArea * 2);
    return effective;
  }
  if (shape === 'area') {
    effective.radius = Math.max(0, Math.floor(spec.radius ?? 1) + extraArea);
    return effective;
  }
  if (shape === 'ring') {
    effective.radius = Math.max(0, Math.floor(spec.radius ?? 1) + extraArea);
    effective.innerRadius = Math.max(
      0,
      Math.floor(spec.innerRadius ?? Math.max((spec.radius ?? 1) - 1, 0)) - extraArea,
    );
    return effective;
  }
  effective.width = Math.max(1, Math.floor(spec.width ?? 1) + extraArea * 2);
  effective.height = Math.max(1, Math.floor(spec.height ?? spec.width ?? 1) + extraArea * 2);
  return effective;
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
    return getWideLineCells(origin, anchor, spec.width ?? 1);
  }
  if (spec.shape === 'area') {
    return getAreaCells(anchor, spec.radius ?? 1);
  }
  if (spec.shape === 'ring') {
    return getRingCells(anchor, spec.innerRadius ?? Math.max((spec.radius ?? 1) - 1, 0), spec.radius ?? 1);
  }
  if (spec.shape === 'box') {
    return getBoxCells(anchor, spec.width ?? 1, spec.height ?? spec.width ?? 1);
  }
  if (spec.shape === 'checkerboard') {
    return getCheckerboardCells(anchor, spec.width ?? 1, spec.height ?? spec.width ?? 1, spec.checkerParity ?? 'even');
  }
  return [{ x: anchor.x, y: anchor.y }];
}

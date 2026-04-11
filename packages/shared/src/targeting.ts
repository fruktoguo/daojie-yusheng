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
export type TargetingShape = 'single' | 'line' | 'area' | 'box' | 'orientedBox' | 'ring' | 'checkerboard';

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

export interface TargetingGeometryResolution {
  finalRange?: number;
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

function getOrientedBoxCells(origin: GridPoint, anchor: GridPoint, width: number, height: number): GridPoint[] {
  const normalizedWidth = Math.max(1, Math.floor(width));
  const normalizedHeight = Math.max(1, Math.floor(height));
  const dirX = anchor.x - origin.x;
  const dirY = anchor.y - origin.y;
  if (dirX === 0 && dirY === 0) {
    return getBoxCells(anchor, normalizedWidth, normalizedHeight);
  }
  const forwardLength = Math.hypot(dirX, dirY);
  const forwardX = dirX / forwardLength;
  const forwardY = dirY / forwardLength;
  const lateralX = -forwardY;
  const lateralY = forwardX;
  const halfWidth = normalizedWidth / 2;
  const halfHeight = normalizedHeight / 2;
  const padding = Math.ceil(halfWidth + halfHeight) + 1;
  const minX = anchor.x - padding;
  const maxX = anchor.x + padding;
  const minY = anchor.y - padding;
  const maxY = anchor.y + padding;
  const cells: GridPoint[] = [];
  const epsilon = 1e-9;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const offsetX = x - anchor.x;
      const offsetY = y - anchor.y;
      const lateralProjection = offsetX * lateralX + offsetY * lateralY;
      const forwardProjection = offsetX * forwardX + offsetY * forwardY;
      if (Math.abs(lateralProjection) > halfWidth - epsilon) {
        continue;
      }
      if (Math.abs(forwardProjection) > halfHeight - epsilon) {
        continue;
      }
      cells.push({ x, y });
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

function getDistanceSquaredToSegment(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return px * px + py * py;
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  const closestX = start.x + dx * t;
  const closestY = start.y + dy * t;
  const offsetX = point.x - closestX;
  const offsetY = point.y - closestY;
  return offsetX * offsetX + offsetY * offsetY;
}

function getWideLineCells(start: GridPoint, end: GridPoint, width: number): GridPoint[] {
  const line = getLineCells(start, end);
  if (line.length <= 1) {
    return [];
  }
  const normalizedWidth = Math.max(1, Math.floor(width));
  if (normalizedWidth <= 1) {
    return line.slice(1);
  }
  const halfThickness = (normalizedWidth - 1) / 2;
  const padding = Math.ceil(halfThickness);
  const cells: GridPoint[] = [];
  const seen = new Set<string>();
  const minX = Math.min(start.x, end.x) - padding;
  const maxX = Math.max(start.x, end.x) + padding;
  const minY = Math.min(start.y, end.y) - padding;
  const maxY = Math.max(start.y, end.y) + padding;
  const maxDistanceSquared = halfThickness * halfThickness + 1e-9;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (x === start.x && y === start.y) {
        continue;
      }
      if (getDistanceSquaredToSegment({ x, y }, start, end) > maxDistanceSquared) {
        continue;
      }
      const key = `${x},${y}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      cells.push({ x, y });
    }
  }
  return cells;
}

function normalizeTargetingShape(spec: TargetingGeometrySpec): TargetingShape {
  return spec.shape ?? 'single';
}

function resolveSingleTargetingGeometry(range: number, extraArea: number): TargetingGeometrySpec {
  if (extraArea <= 0) {
    return { range, shape: 'single' };
  }
  return {
    range,
    shape: 'box',
    width: 1 + extraArea * 2,
    height: 1 + extraArea * 2,
  };
}

function resolveLineTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'line',
    width: Math.max(1, Math.floor(spec.width ?? 1) + extraArea * 2),
  };
}

function resolveAreaTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'area',
    radius: Math.max(0, Math.floor(spec.radius ?? 1) + extraArea),
  };
}

function resolveRingTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'ring',
    radius: Math.max(0, Math.floor(spec.radius ?? 1) + extraArea),
    innerRadius: Math.max(
      0,
      Math.floor(spec.innerRadius ?? Math.max((spec.radius ?? 1) - 1, 0)) - extraArea,
    ),
  };
}

function resolveBoxLikeTargetingGeometry(
  spec: TargetingGeometrySpec,
  range: number,
  extraArea: number,
  shape: 'box' | 'orientedBox' | 'checkerboard',
): TargetingGeometrySpec {
  return {
    range,
    shape,
    width: Math.max(1, Math.floor(spec.width ?? 1) + extraArea * 2),
    height: Math.max(1, Math.floor(spec.height ?? spec.width ?? 1) + extraArea * 2),
    checkerParity: spec.checkerParity,
  };
}

export function resolveTargetingGeometry(
  spec: TargetingGeometrySpec,
  resolution?: TargetingGeometryResolution,
): TargetingGeometrySpec {
  const shape = normalizeTargetingShape(spec);
  const range = Math.max(0, Math.floor(resolution?.finalRange ?? spec.range));
  const extraArea = Math.max(0, Math.floor(resolution?.extraArea ?? 0));

  if (shape === 'single') {
    return resolveSingleTargetingGeometry(range, extraArea);
  }
  if (shape === 'line') {
    return resolveLineTargetingGeometry(spec, range, extraArea);
  }
  if (shape === 'area') {
    return resolveAreaTargetingGeometry(spec, range, extraArea);
  }
  if (shape === 'ring') {
    return resolveRingTargetingGeometry(spec, range, extraArea);
  }
  if (shape === 'box' || shape === 'orientedBox' || shape === 'checkerboard') {
    return resolveBoxLikeTargetingGeometry(spec, range, extraArea, shape);
  }
  return { ...spec, shape, range };
}

export function buildEffectiveTargetingGeometry(
  spec: TargetingGeometrySpec,
  modifiers?: TargetingGeometryModifiers,
): TargetingGeometrySpec {
  const extraRange = Math.max(0, Math.floor(modifiers?.extraRange ?? 0));
  const shape = spec.shape ?? 'single';
  return resolveTargetingGeometry({ ...spec, shape }, {
    finalRange: Math.max(0, Math.floor(spec.range) + extraRange),
    extraArea: modifiers?.extraArea,
  });
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
  if (spec.shape === 'orientedBox') {
    return getOrientedBoxCells(origin, anchor, spec.width ?? 1, spec.height ?? spec.width ?? 1);
  }
  if (spec.shape === 'checkerboard') {
    return getCheckerboardCells(anchor, spec.width ?? 1, spec.height ?? spec.width ?? 1, spec.checkerParity ?? 'even');
  }
  return [{ x: anchor.x, y: anchor.y }];
}

/**
 * 技能目标选取几何计算：单体、直线、范围、矩形、环带、棋盘等形状的受影响格子计算。
 */
import { isPointInRange } from './geometry';

/** 格子坐标 */
export interface GridPoint {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;
}

/** 目标选取形状 */
export type TargetingShape = 'single' | 'line' | 'area' | 'box' | 'orientedBox' | 'ring' | 'checkerboard';

/** 目标选取几何参数 */
export interface TargetingGeometrySpec {
/**
 * range：范围相关字段。
 */

  range: number;  
  /**
 * shape：shape相关字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：radiu相关字段。
 */

  radius?: number;  
  /**
 * innerRadius：innerRadiu相关字段。
 */

  innerRadius?: number;  
  /**
 * width：width相关字段。
 */

  width?: number;  
  /**
 * height：height相关字段。
 */

  height?: number;  
  /**
 * checkerParity：checkerParity相关字段。
 */

  checkerParity?: 'even' | 'odd';
}

/** 目标几何附加参数：保存额外距离/面积类修饰。 */
export interface TargetingGeometryModifiers {
/**
 * extraRange：extra范围相关字段。
 */

  extraRange?: number;  
  /**
 * extraArea：extraArea相关字段。
 */

  extraArea?: number;
}

/** 目标几何解析结果：放大后的最终命中范围参数。 */
export interface TargetingGeometryResolution {
/**
 * finalRange：final范围相关字段。
 */

  finalRange?: number;  
  /**
 * extraArea：extraArea相关字段。
 */

  extraArea?: number;
}

/** 使用 Bresenham 算法枚举两点连线经过的格子。 */
export function getLineCells(start: GridPoint, end: GridPoint): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 计算以中心点为圆心、指定半径内的圆形覆盖格子。 */
export function getAreaCells(center: GridPoint, radius: number): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 计算以中心点为圆心、内外半径限定的环形覆盖格子。 */
export function getRingCells(center: GridPoint, innerRadius: number, outerRadius: number): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 计算以中心点为中心展开的矩形覆盖格子。 */
export function getBoxCells(center: GridPoint, width: number, height: number): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 计算沿朝向展开的定向矩形覆盖格子。 */
function getOrientedBoxCells(origin: GridPoint, anchor: GridPoint, width: number, height: number): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 计算棋盘交错分布的覆盖格子。 */
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

/** 计算点到线段的距离平方，用于粗略厚线判断。 */
function getDistanceSquaredToSegment(point: GridPoint, start: GridPoint, end: GridPoint): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 计算带宽度的直线覆盖格子。 */
function getWideLineCells(start: GridPoint, end: GridPoint, width: number): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 取出目标几何形状，默认按单体解析。 */
function normalizeTargetingShape(spec: TargetingGeometrySpec): TargetingShape {
  return spec.shape ?? 'single';
}

/** 单体技能若带额外范围，则扩成以目标为中心的小方块。 */
function resolveSingleTargetingGeometry(range: number, extraArea: number): TargetingGeometrySpec {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 直线技能在保持射程不变的前提下扩展线宽。 */
function resolveLineTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'line',
    width: Math.max(1, Math.floor(spec.width ?? 1) + extraArea * 2),
  };
}

/** 圆形范围技能在原半径基础上叠加额外面积。 */
function resolveAreaTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'area',
    radius: Math.max(0, Math.floor(spec.radius ?? 1) + extraArea),
  };
}

/** 环形技能同时扩展外半径并收缩内半径。 */
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

/** 方形、定向矩形和棋盘格共用的尺寸扩展逻辑。 */
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

/** 按形状和修饰参数解析最终命中的几何范围。 */
export function resolveTargetingGeometry(
  spec: TargetingGeometrySpec,
  resolution?: TargetingGeometryResolution,
): TargetingGeometrySpec {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 把额外射程和额外面积并入基础目标几何。 */
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

/** 根据施法者位置、锚点和几何参数，计算最终受影响格子。 */
export function computeAffectedCellsFromAnchor(
  origin: GridPoint,
  anchor: GridPoint,
  spec: TargetingGeometrySpec,
): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

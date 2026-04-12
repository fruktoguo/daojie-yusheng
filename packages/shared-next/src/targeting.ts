/**
 * 技能目标选取几何计算：单体、直线、范围、矩形、环带、棋盘等形状的受影响格子计算。
 */
import { isPointInRange } from './geometry';

/** 格子坐标 */
export interface GridPoint {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
}

/** 目标选取形状 */
export type TargetingShape = 'single' | 'line' | 'area' | 'box' | 'orientedBox' | 'ring' | 'checkerboard';

/** 目标选取几何参数 */
export interface TargetingGeometrySpec {
/** range：定义该变量以承载业务值。 */
  range: number;
  shape?: TargetingShape;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  checkerParity?: 'even' | 'odd';
}

/** TargetingGeometryModifiers：定义该接口的能力与字段约束。 */
export interface TargetingGeometryModifiers {
  extraRange?: number;
  extraArea?: number;
}

/** TargetingGeometryResolution：定义该接口的能力与字段约束。 */
export interface TargetingGeometryResolution {
  finalRange?: number;
  extraArea?: number;
}

/** 用 Bresenham 算法计算两点间直线经过的格子 */
export function getLineCells(start: GridPoint, end: GridPoint): GridPoint[] {
/** cells：定义该变量以承载业务值。 */
  const cells: GridPoint[] = [];
/** x：定义该变量以承载业务值。 */
  let x = start.x;
/** y：定义该变量以承载业务值。 */
  let y = start.y;
/** dx：定义该变量以承载业务值。 */
  const dx = Math.abs(end.x - start.x);
/** dy：定义该变量以承载业务值。 */
  const dy = Math.abs(end.y - start.y);
/** sx：定义该变量以承载业务值。 */
  const sx = start.x < end.x ? 1 : -1;
/** sy：定义该变量以承载业务值。 */
  const sy = start.y < end.y ? 1 : -1;
/** err：定义该变量以承载业务值。 */
  let err = dx - dy;

  while (true) {
    cells.push({ x, y });
    if (x === end.x && y === end.y) {
      break;
    }
/** e2：定义该变量以承载业务值。 */
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
/** cells：定义该变量以承载业务值。 */
  const cells: GridPoint[] = [];
/** normalizedRadius：定义该变量以承载业务值。 */
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
/** cells：定义该变量以承载业务值。 */
  const cells: GridPoint[] = [];
/** normalizedOuterRadius：定义该变量以承载业务值。 */
  const normalizedOuterRadius = Math.max(0, Math.floor(outerRadius));
/** normalizedInnerRadius：定义该变量以承载业务值。 */
  const normalizedInnerRadius = Math.max(0, Math.min(normalizedOuterRadius, Math.floor(innerRadius)));
/** innerSquared：定义该变量以承载业务值。 */
  const innerSquared = normalizedInnerRadius * normalizedInnerRadius;
/** outerSquared：定义该变量以承载业务值。 */
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
/** cells：定义该变量以承载业务值。 */
  const cells: GridPoint[] = [];
/** normalizedWidth：定义该变量以承载业务值。 */
  const normalizedWidth = Math.max(1, Math.floor(width));
/** normalizedHeight：定义该变量以承载业务值。 */
  const normalizedHeight = Math.max(1, Math.floor(height));
/** left：定义该变量以承载业务值。 */
  const left = Math.floor((normalizedWidth - 1) / 2);
/** right：定义该变量以承载业务值。 */
  const right = normalizedWidth - 1 - left;
/** top：定义该变量以承载业务值。 */
  const top = Math.floor((normalizedHeight - 1) / 2);
/** bottom：定义该变量以承载业务值。 */
  const bottom = normalizedHeight - 1 - top;
  for (let dy = -top; dy <= bottom; dy += 1) {
    for (let dx = -left; dx <= right; dx += 1) {
      cells.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return cells;
}

/** getOrientedBoxCells：执行对应的业务逻辑。 */
function getOrientedBoxCells(origin: GridPoint, anchor: GridPoint, width: number, height: number): GridPoint[] {
/** normalizedWidth：定义该变量以承载业务值。 */
  const normalizedWidth = Math.max(1, Math.floor(width));
/** normalizedHeight：定义该变量以承载业务值。 */
  const normalizedHeight = Math.max(1, Math.floor(height));
/** dirX：定义该变量以承载业务值。 */
  const dirX = anchor.x - origin.x;
/** dirY：定义该变量以承载业务值。 */
  const dirY = anchor.y - origin.y;
  if (dirX === 0 && dirY === 0) {
    return getBoxCells(anchor, normalizedWidth, normalizedHeight);
  }
/** forwardLength：定义该变量以承载业务值。 */
  const forwardLength = Math.hypot(dirX, dirY);
/** forwardX：定义该变量以承载业务值。 */
  const forwardX = dirX / forwardLength;
/** forwardY：定义该变量以承载业务值。 */
  const forwardY = dirY / forwardLength;
/** lateralX：定义该变量以承载业务值。 */
  const lateralX = -forwardY;
/** lateralY：定义该变量以承载业务值。 */
  const lateralY = forwardX;
/** halfWidth：定义该变量以承载业务值。 */
  const halfWidth = normalizedWidth / 2;
/** halfHeight：定义该变量以承载业务值。 */
  const halfHeight = normalizedHeight / 2;
/** padding：定义该变量以承载业务值。 */
  const padding = Math.ceil(halfWidth + halfHeight) + 1;
/** minX：定义该变量以承载业务值。 */
  const minX = anchor.x - padding;
/** maxX：定义该变量以承载业务值。 */
  const maxX = anchor.x + padding;
/** minY：定义该变量以承载业务值。 */
  const minY = anchor.y - padding;
/** maxY：定义该变量以承载业务值。 */
  const maxY = anchor.y + padding;
/** cells：定义该变量以承载业务值。 */
  const cells: GridPoint[] = [];
/** epsilon：定义该变量以承载业务值。 */
  const epsilon = 1e-9;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const offsetX = x - anchor.x;
      const offsetY = y - anchor.y;
/** lateralProjection：定义该变量以承载业务值。 */
      const lateralProjection = offsetX * lateralX + offsetY * lateralY;
/** forwardProjection：定义该变量以承载业务值。 */
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
/** parity：定义该变量以承载业务值。 */
  parity: 'even' | 'odd' = 'even',
): GridPoint[] {
/** normalizedWidth：定义该变量以承载业务值。 */
  const normalizedWidth = Math.max(1, Math.floor(width));
/** normalizedHeight：定义该变量以承载业务值。 */
  const normalizedHeight = Math.max(1, Math.floor(height));
/** left：定义该变量以承载业务值。 */
  const left = Math.floor((normalizedWidth - 1) / 2);
/** top：定义该变量以承载业务值。 */
  const top = Math.floor((normalizedHeight - 1) / 2);
  return getBoxCells(center, normalizedWidth, normalizedHeight).filter((cell) => {
/** dx：定义该变量以承载业务值。 */
    const dx = cell.x - center.x + left;
/** dy：定义该变量以承载业务值。 */
    const dy = cell.y - center.y + top;
/** even：定义该变量以承载业务值。 */
    const even = (dx + dy) % 2 === 0;
    return parity === 'even' ? even : !even;
  });
}

/** getDistanceSquaredToSegment：执行对应的业务逻辑。 */
function getDistanceSquaredToSegment(point: GridPoint, start: GridPoint, end: GridPoint): number {
/** dx：定义该变量以承载业务值。 */
  const dx = end.x - start.x;
/** dy：定义该变量以承载业务值。 */
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
/** px：定义该变量以承载业务值。 */
    const px = point.x - start.x;
/** py：定义该变量以承载业务值。 */
    const py = point.y - start.y;
    return px * px + py * py;
  }
/** t：定义该变量以承载业务值。 */
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
/** closestX：定义该变量以承载业务值。 */
  const closestX = start.x + dx * t;
/** closestY：定义该变量以承载业务值。 */
  const closestY = start.y + dy * t;
/** offsetX：定义该变量以承载业务值。 */
  const offsetX = point.x - closestX;
/** offsetY：定义该变量以承载业务值。 */
  const offsetY = point.y - closestY;
  return offsetX * offsetX + offsetY * offsetY;
}

/** getWideLineCells：执行对应的业务逻辑。 */
function getWideLineCells(start: GridPoint, end: GridPoint, width: number): GridPoint[] {
/** line：定义该变量以承载业务值。 */
  const line = getLineCells(start, end);
  if (line.length <= 1) {
    return [];
  }
/** normalizedWidth：定义该变量以承载业务值。 */
  const normalizedWidth = Math.max(1, Math.floor(width));
  if (normalizedWidth <= 1) {
    return line.slice(1);
  }
/** halfThickness：定义该变量以承载业务值。 */
  const halfThickness = (normalizedWidth - 1) / 2;
/** padding：定义该变量以承载业务值。 */
  const padding = Math.ceil(halfThickness);
/** cells：定义该变量以承载业务值。 */
  const cells: GridPoint[] = [];
/** seen：定义该变量以承载业务值。 */
  const seen = new Set<string>();
/** minX：定义该变量以承载业务值。 */
  const minX = Math.min(start.x, end.x) - padding;
/** maxX：定义该变量以承载业务值。 */
  const maxX = Math.max(start.x, end.x) + padding;
/** minY：定义该变量以承载业务值。 */
  const minY = Math.min(start.y, end.y) - padding;
/** maxY：定义该变量以承载业务值。 */
  const maxY = Math.max(start.y, end.y) + padding;
/** maxDistanceSquared：定义该变量以承载业务值。 */
  const maxDistanceSquared = halfThickness * halfThickness + 1e-9;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (x === start.x && y === start.y) {
        continue;
      }
      if (getDistanceSquaredToSegment({ x, y }, start, end) > maxDistanceSquared) {
        continue;
      }
/** key：定义该变量以承载业务值。 */
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

/** normalizeTargetingShape：执行对应的业务逻辑。 */
function normalizeTargetingShape(spec: TargetingGeometrySpec): TargetingShape {
  return spec.shape ?? 'single';
}

/** resolveSingleTargetingGeometry：执行对应的业务逻辑。 */
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

/** resolveLineTargetingGeometry：执行对应的业务逻辑。 */
function resolveLineTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'line',
    width: Math.max(1, Math.floor(spec.width ?? 1) + extraArea * 2),
  };
}

/** resolveAreaTargetingGeometry：执行对应的业务逻辑。 */
function resolveAreaTargetingGeometry(spec: TargetingGeometrySpec, range: number, extraArea: number): TargetingGeometrySpec {
  return {
    range,
    shape: 'area',
    radius: Math.max(0, Math.floor(spec.radius ?? 1) + extraArea),
  };
}

/** resolveRingTargetingGeometry：执行对应的业务逻辑。 */
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

/** resolveBoxLikeTargetingGeometry：执行对应的业务逻辑。 */
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

/** resolveTargetingGeometry：执行对应的业务逻辑。 */
export function resolveTargetingGeometry(
  spec: TargetingGeometrySpec,
  resolution?: TargetingGeometryResolution,
): TargetingGeometrySpec {
/** shape：定义该变量以承载业务值。 */
  const shape = normalizeTargetingShape(spec);
/** range：定义该变量以承载业务值。 */
  const range = Math.max(0, Math.floor(resolution?.finalRange ?? spec.range));
/** extraArea：定义该变量以承载业务值。 */
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

/** buildEffectiveTargetingGeometry：执行对应的业务逻辑。 */
export function buildEffectiveTargetingGeometry(
  spec: TargetingGeometrySpec,
  modifiers?: TargetingGeometryModifiers,
): TargetingGeometrySpec {
/** extraRange：定义该变量以承载业务值。 */
  const extraRange = Math.max(0, Math.floor(modifiers?.extraRange ?? 0));
/** shape：定义该变量以承载业务值。 */
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


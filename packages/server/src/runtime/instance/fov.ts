/**
 * fov.ts — 纯函数 FOV（视野）shadowcasting 模块。
 *
 * 标准 8 八分区递归 shadowcasting 算法，无外部依赖。
 * 所有函数均为纯函数，通过回调获取地块遮挡信息。
 */

/** 判断地块是否阻挡视线的回调类型。 */
export type SightBlockedFn = (cellIndex: number) => boolean;

/** 坐标转索引。 */
function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/** 坐标是否在地图边界内。 */
function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/** 欧氏距离平方范围检测（与游戏默认 euclidean 口径一致）。 */
function isInRadius(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius;
}

/** 切比雪夫距离。 */
function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** 8 八分区变换矩阵。 */
const OCTANTS: ReadonlyArray<[number, number, number, number]> = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

/**
 * castLight — 单八分区递归 shadowcasting。
 *
 * 将可见地块索引写入 visibleSet。
 */
export function castLight(
  width: number,
  height: number,
  originX: number,
  originY: number,
  radius: number,
  isSightBlocked: SightBlockedFn,
  visibleSet: Set<number>,
): void {
  if (!inBounds(originX, originY, width, height)) return;
  visibleSet.add(toIndex(originX, originY, width));
  for (const [xx, xy, yx, yy] of OCTANTS) {
    castLightOctant(width, height, originX, originY, 1, 1.0, 0.0, radius, xx, xy, yx, yy, isSightBlocked, visibleSet);
  }
}

function castLightOctant(
  width: number,
  height: number,
  originX: number,
  originY: number,
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  isSightBlocked: SightBlockedFn,
  visibleSet: Set<number>,
): void {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;
  for (let distance = row; distance <= radius; distance++) {
    let blocked = false;
    for (let deltaX = -distance; deltaX <= 0; deltaX++) {
      const deltaY = -distance;
      const currentX = originX + deltaX * xx + deltaY * xy;
      const currentY = originY + deltaX * yx + deltaY * yy;

      const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);
      const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);

      if (startSlope < rightSlope) continue;
      if (endSlope > leftSlope) break;

      if (isInRadius(deltaX, deltaY, radius) && inBounds(currentX, currentY, width, height)) {
        visibleSet.add(toIndex(currentX, currentY, width));
      }

      const cellBlocked = !inBounds(currentX, currentY, width, height) || isSightBlocked(toIndex(currentX, currentY, width));

      if (blocked) {
        if (cellBlocked) {
          nextStartSlope = rightSlope;
          continue;
        }
        blocked = false;
        startSlope = nextStartSlope;
        continue;
      }
      if (cellBlocked && distance < radius) {
        blocked = true;
        castLightOctant(width, height, originX, originY, distance + 1, startSlope, leftSlope, radius, xx, xy, yx, yy, isSightBlocked, visibleSet);
        nextStartSlope = rightSlope;
      }
    }
    if (blocked) break;
  }
}

/**
 * collectVisibleTileIndices — 收集从 origin 出发、指定半径内所有可见地块索引。
 */
export function collectVisibleTileIndices(
  width: number,
  height: number,
  originX: number,
  originY: number,
  radius: number,
  isSightBlocked: SightBlockedFn,
): Set<number> {
  const visibleSet = new Set<number>();
  castLight(width, height, originX, originY, radius, isSightBlocked, visibleSet);
  return visibleSet;
}

/**
 * canSeeTileFrom — 判断从 (fromX, fromY) 是否能看到 (toX, toY)。
 */
export function canSeeTileFrom(
  width: number,
  height: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  isSightBlocked: SightBlockedFn,
): boolean {
  if (!inBounds(fromX, fromY, width, height) || !inBounds(toX, toY, width, height)) return false;
  if (chebyshev(fromX, fromY, toX, toY) > radius) return false;
  const visible = collectVisibleTileIndices(width, height, fromX, fromY, radius, isSightBlocked);
  return visible.has(toIndex(toX, toY, width));
}

/**
 * 客户端寻路包装层，复用 shared 中的纯函数寻路核心。
 */

import { deltaToDirection, Direction, findBoundedPath, getTileTraversalCost, Tile } from '@mud/shared-next';

/** A* 寻路，返回 Direction[] 路径；不可达返回 null */
export function findPath(
  tiles: Tile[][],
  sx: number, sy: number,
  ex: number, ey: number,
): Direction[] | null {
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




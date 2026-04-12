/**
 * 客户端寻路包装层，复用 shared 中的纯函数寻路核心。
 */

import { deltaToDirection, Direction, findBoundedPath, getTileTraversalCost, Tile } from '@mud/shared';

/** A* 寻路，返回 Direction[] 路径；不可达返回 null */
export function findPath(
  tiles: Tile[][],
  sx: number, sy: number,
  ex: number, ey: number,
): Direction[] | null {
/** rows：定义该变量以承载业务值。 */
  const rows = tiles.length;
  if (rows === 0) return null;
/** cols：定义该变量以承载业务值。 */
  const cols = tiles[0].length;

  if (sx === ex && sy === ey) return [];
  if (ey < 0 || ey >= rows || ex < 0 || ex >= cols) return null;
  if (!tiles[ey]?.[ex]?.walkable) return null;

/** total：定义该变量以承载业务值。 */
  const total = rows * cols;
/** walkable：定义该变量以承载业务值。 */
  const walkable = new Uint8Array(total);
/** traversalCost：定义该变量以承载业务值。 */
  const traversalCost = new Uint16Array(total);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tile = tiles[y]?.[x];
      if (!tile) {
        continue;
      }
/** index：定义该变量以承载业务值。 */
      const index = y * cols + x;
      walkable[index] = tile.walkable ? 1 : 0;
      traversalCost[index] = getTileTraversalCost(tile.type);
    }
  }

/** result：定义该变量以承载业务值。 */
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

/** directions：定义该变量以承载业务值。 */
  const directions: Direction[] = [];
/** currentX：定义该变量以承载业务值。 */
  let currentX = sx;
/** currentY：定义该变量以承载业务值。 */
  let currentY = sy;
  for (const step of result.path) {
    const direction = deltaToDirection(step.x - currentX, step.y - currentY);
    if (direction === null) {
      return null;
    }
    directions.push(direction);
    currentX = step.x;
    currentY = step.y;
  }

  return directions;
}

/**
 * 客户端 A* 寻路 —— 基于地块通行代价的最短路径搜索
 */

import { CARDINAL_DIRECTION_STEPS, deltaToDirection, Direction, getTileTraversalCost, manhattanDistance, Tile } from '@mud/shared';

interface HeapNode {
  index: number;
  score: number;
}

/** 用于 A* 的最小堆，按 score 排序 */
class MinHeap {
  private items: HeapNode[] = [];

  push(node: HeapNode) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.items.length === 0) return undefined;
    const head = this.items[0];
    const tail = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = tail;
      this.bubbleDown(0);
    }
    return head;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].score <= this.items[index].score) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number) {
    const last = this.items.length - 1;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left <= last && this.items[left].score < this.items[smallest].score) {
        smallest = left;
      }
      if (right <= last && this.items[right].score < this.items[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

const MIN_STEP_COST = 1;

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

  const heuristic = (x: number, y: number) => manhattanDistance({ x, y }, { x: ex, y: ey }) * MIN_STEP_COST;
  const total = rows * cols;
  const startIndex = sy * cols + sx;
  const goalIndex = ey * cols + ex;
  const gScore = new Float64Array(total);
  gScore.fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(total);
  parent.fill(-1);
  const closed = new Uint8Array(total);
  const heap = new MinHeap();

  gScore[startIndex] = 0;
  heap.push({ index: startIndex, score: heuristic(sx, sy) });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) break;
    if (closed[current.index]) continue;
    closed[current.index] = 1;

    if (current.index === goalIndex) {
      const path: Direction[] = [];
      let node = goalIndex;
      while (node !== startIndex && node !== -1) {
        const prev = parent[node];
        if (prev === -1) return null;
        const dx = (node % cols) - (prev % cols);
        const dy = Math.floor(node / cols) - Math.floor(prev / cols);
        const dir = deltaToDirection(dx, dy);
        if (dir === null) return null;
        path.push(dir);
        node = prev;
      }
      path.reverse();
      return path;
    }

    const x = current.index % cols;
    const y = Math.floor(current.index / cols);
    for (const { dx, dy } of CARDINAL_DIRECTION_STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (!tiles[ny]?.[nx]?.walkable) continue;

      const nextIndex = ny * cols + nx;
      if (closed[nextIndex]) continue;

      const nextScore = gScore[current.index] + getTileTraversalCost(tiles[ny][nx].type);
      if (nextScore >= gScore[nextIndex]) continue;

      gScore[nextIndex] = nextScore;
      parent[nextIndex] = current.index;
      heap.push({
        index: nextIndex,
        score: nextScore + heuristic(nx, ny),
      });
    }
  }

  return null;
}

/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：出生点、传送阵选址与道路网络生成。
 */
import { hashStringToUint32, valueNoise2D, ProcgenRng } from './procgen-random';

/** 从起点做四连通 BFS，返回步数距离（-1 = 不可达）。 */
export function bfsDistances(width: number, height: number, mask: Uint8Array, startIndex: number): Int32Array {
  const distances = new Int32Array(width * height).fill(-1);
  if (mask[startIndex] === 0) return distances;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIndex;
  distances[startIndex] = 0;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;
    const next = distances[index] + 1;
    if (x > 0 && mask[index - 1] === 1 && distances[index - 1] === -1) { distances[index - 1] = next; queue[tail++] = index - 1; }
    if (x < width - 1 && mask[index + 1] === 1 && distances[index + 1] === -1) { distances[index + 1] = next; queue[tail++] = index + 1; }
    if (y > 0 && mask[index - width] === 1 && distances[index - width] === -1) { distances[index - width] = next; queue[tail++] = index - width; }
    if (y < height - 1 && mask[index + width] === 1 && distances[index + width] === -1) { distances[index + width] = next; queue[tail++] = index + width; }
  }
  return distances;
}

/** 出生点：最大连通块里离地图中心最近的可走格（进图体验稳定、可预期）。 */
export function pickSpawn(width: number, height: number, mask: Uint8Array, labels: Int32Array, sizes: number[]): number {
  let mainLabel = 0;
  for (let label = 1; label < sizes.length; label += 1) {
    if (sizes[label] > sizes[mainLabel]) mainLabel = label;
  }
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] !== mainLabel) continue;
    const x = index % width;
    const y = (index - x) / width;
    const distance = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** 出口传送阵：按离出生点 BFS 距离从远到近挑选，彼此保持间隔，保证"探索到尽头才有出口"。 */
export function pickExits(
  width: number,
  distances: Int32Array,
  count: number,
  minSeparation: number,
): number[] {
  const ranked: number[] = [];
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] > 0) ranked.push(index);
  }
  ranked.sort((a, b) => distances[b] - distances[a] || a - b);
  const exits: number[] = [];
  for (const index of ranked) {
    if (exits.length >= count) break;
    const x = index % width;
    const y = (index - x) / width;
    let tooClose = false;
    for (const exit of exits) {
      const ex = exit % width;
      const ey = (exit - ex) / width;
      if (Math.abs(ex - x) + Math.abs(ey - y) < minSeparation) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) exits.push(index);
  }
  return exits;
}

/** 额外兴趣点：主连通块内彼此远离的随机格，用于让道路网延伸出分支。 */
export function pickPois(
  width: number,
  distances: Int32Array,
  count: number,
  avoid: readonly number[],
  rng: ProcgenRng,
): number[] {
  const pois: number[] = [];
  for (let attempt = 0; attempt < count * 60 && pois.length < count; attempt += 1) {
    const index = rng.int(0, distances.length - 1);
    if (distances[index] < 8) continue;
    let tooClose = false;
    for (const other of [...pois, ...avoid]) {
      const ox = other % width;
      const oy = (other - ox) / width;
      const x = index % width;
      const y = (index - x) / width;
      if (Math.abs(ox - x) + Math.abs(oy - y) < 10) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) pois.push(index);
  }
  return pois;
}

/**
 * 道路网络：从每个目标点向"已成网格子"跑一次代价 Dijkstra（代价带噪声抖动，
 * 使道路自然蜿蜒），把途经格写入网络。结果是以出生点为根的树状路网。
 */
export function buildRoadNetwork(
  width: number,
  height: number,
  mask: Uint8Array,
  spawnIndex: number,
  targets: readonly number[],
  wobble: number,
  seed: string,
): Set<number> {
  const network = new Set<number>([spawnIndex]);
  const noiseSeed = hashStringToUint32(`${seed}:road`);
  const cellCost = (index: number): number => {
    const x = index % width;
    const y = (index - x) / width;
    return 1 + valueNoise2D(x / 3, y / 3, noiseSeed) * wobble * 6;
  };
  for (const target of targets) {
    if (mask[target] === 0 || network.has(target)) continue;
    // 简单堆：小图规模下用有序插入数组即可（地图 ≤ 数万格，目标数 ≤ 十几个）
    const bestCost = new Float64Array(width * height).fill(Infinity);
    const previous = new Int32Array(width * height).fill(-1);
    const open: number[] = [target];
    bestCost[target] = 0;
    let reached = -1;
    while (open.length > 0) {
      let bestOpenPos = 0;
      for (let pos = 1; pos < open.length; pos += 1) {
        if (bestCost[open[pos]] < bestCost[open[bestOpenPos]]) bestOpenPos = pos;
      }
      const current = open.splice(bestOpenPos, 1)[0];
      if (network.has(current)) {
        reached = current;
        break;
      }
      const x = current % width;
      const y = (current - x) / width;
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || mask[neighbor] === 0) continue;
        const cost = bestCost[current] + cellCost(neighbor);
        if (cost < bestCost[neighbor]) {
          bestCost[neighbor] = cost;
          previous[neighbor] = current;
          if (!open.includes(neighbor)) open.push(neighbor);
        }
      }
    }
    for (let cursor = reached; cursor !== -1; cursor = previous[cursor]) {
      network.add(cursor);
    }
  }
  network.delete(spawnIndex);
  return network;
}

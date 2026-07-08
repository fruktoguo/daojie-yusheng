/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：可走性掩码、连通块分析、连通性保证（凿通/回填）。
 */
import { ProcgenRng } from './procgen-random';
import type { ProcgenConnectivitySpec } from './procgen-types';
import { requireProcgenTile, type ProcgenTileCatalog } from './procgen-catalog';

/** 由 terrain+structure 计算可走掩码（1=可走）。与运行时口径一致：地形可走且结构不阻挡。 */
export function buildWalkableMask(
  width: number,
  height: number,
  terrainIds: readonly string[],
  structureIds: readonly (string | null)[],
  catalog: ProcgenTileCatalog,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const terrainDef = requireProcgenTile(catalog, 'terrain', terrainIds[index]);
    if (!terrainDef.walkable) continue;
    const structureId = structureIds[index];
    if (structureId !== null) {
      const structureDef = requireProcgenTile(catalog, 'structure', structureId);
      if (structureDef.blocksMove !== false) continue;
    }
    mask[index] = 1;
  }
  return mask;
}

export interface ProcgenRegions {
  /** 每格所属连通块编号；-1 表示不可走。 */
  labels: Int32Array;
  /** 各连通块的格数，下标即编号。 */
  sizes: number[];
}

/** 四连通 flood fill 找出全部可走连通块。 */
export function findRegions(width: number, height: number, mask: Uint8Array): ProcgenRegions {
  const labels = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || labels[start] !== -1) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let size = 0;
    while (head < tail) {
      const index = queue[head++];
      size += 1;
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0 && mask[index - 1] === 1 && labels[index - 1] === -1) { labels[index - 1] = label; queue[tail++] = index - 1; }
      if (x < width - 1 && mask[index + 1] === 1 && labels[index + 1] === -1) { labels[index + 1] = label; queue[tail++] = index + 1; }
      if (y > 0 && mask[index - width] === 1 && labels[index - width] === -1) { labels[index - width] = label; queue[tail++] = index - width; }
      if (y < height - 1 && mask[index + width] === 1 && labels[index + width] === -1) { labels[index + width] = label; queue[tail++] = index + width; }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

function collectRegionSamples(labels: Int32Array, label: number, limit: number): number[] {
  const samples: number[] = [];
  const stride = Math.max(1, Math.floor(labels.length / (limit * 4)));
  for (let index = 0; index < labels.length; index += stride) {
    if (labels[index] === label) samples.push(index);
    if (samples.length >= limit) break;
  }
  if (samples.length === 0) {
    for (let index = 0; index < labels.length; index += 1) {
      if (labels[index] === label) { samples.push(index); break; }
    }
  }
  return samples;
}

/** 在两格之间凿一条带轻微抖动的走廊，把沿途改成可走地形并清掉结构。 */
function carveCorridor(
  width: number,
  fromIndex: number,
  toIndex: number,
  terrainIds: string[],
  structureIds: (string | null)[],
  mask: Uint8Array,
  carveTile: string,
  rng: ProcgenRng,
): number {
  let x = fromIndex % width;
  let y = (fromIndex - x) / width;
  const targetX = toIndex % width;
  const targetY = (toIndex - targetX) / width;
  let carved = 0;
  let guard = 0;
  while ((x !== targetX || y !== targetY) && guard < 4096) {
    guard += 1;
    // 朝目标推进，带 25% 概率的侧向抖动，让通道不是笔直切口
    const stepAxis = rng.chance(0.5) ? 'x' : 'y';
    if (rng.chance(0.25)) {
      if (stepAxis === 'x' && y !== targetY) y += targetY > y ? 1 : -1;
      else if (x !== targetX) x += targetX > x ? 1 : -1;
      else if (y !== targetY) y += targetY > y ? 1 : -1;
    } else if (stepAxis === 'x' && x !== targetX) {
      x += targetX > x ? 1 : -1;
    } else if (y !== targetY) {
      y += targetY > y ? 1 : -1;
    } else if (x !== targetX) {
      x += targetX > x ? 1 : -1;
    }
    const index = y * width + x;
    if (mask[index] === 0) {
      terrainIds[index] = carveTile;
      structureIds[index] = null;
      mask[index] = 1;
      carved += 1;
    }
  }
  return carved;
}

/** 把 target 区域回填为不可走的 fillTile。 */
function fillRegion(
  labels: Int32Array,
  targetLabel: number,
  terrainIds: string[],
  structureIds: (string | null)[],
  mask: Uint8Array,
  fillTile: string,
): number {
  let filled = 0;
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === targetLabel) {
      terrainIds[index] = fillTile;
      structureIds[index] = null;
      mask[index] = 0;
      filled += 1;
    }
  }
  return filled;
}

/**
 * 连通性保证：反复合并/回填，直到全图只剩一个可走连通块。
 * - 小于 fillThreshold 的碎块一律回填为 fillTile（噪声残渣）。
 * - carve 模式：把每个次级区域与最大区域间凿通走廊；fill 模式：全部回填。
 *
 * 每轮处理当前**所有**非主区域，再重新 flood fill 复核；轮数上限按区域数动态放宽，
 * 避免"区域数超过固定轮数时循环耗尽、留下大量孤块"。最终仍无法收敛到单块时抛错，
 * 而不是把多连通块地图静默交付。
 */
export function ensureConnectivity(
  width: number,
  height: number,
  terrainIds: string[],
  structureIds: (string | null)[],
  mask: Uint8Array,
  spec: ProcgenConnectivitySpec,
  baseTerrain: string,
  fillTile: string,
  rng: ProcgenRng,
): { carvedCells: number; filledCells: number; regionCount: number } {
  const carveTile = spec.carveTile ?? baseTerrain;
  const fillThreshold = spec.fillThreshold ?? 8;
  let carvedCells = 0;
  let filledCells = 0;
  const initialRegions = findRegions(width, height, mask);
  // 上限按初始区域数放宽：每轮至少消掉一个区域，留足余量应对凿通不完全的重试。
  const maxRounds = Math.max(8, initialRegions.sizes.length + 8);
  for (let round = 0; round < maxRounds; round += 1) {
    const regions = findRegions(width, height, mask);
    if (regions.sizes.length <= 1) {
      return { carvedCells, filledCells, regionCount: regions.sizes.length };
    }
    let mainLabel = 0;
    for (let label = 1; label < regions.sizes.length; label += 1) {
      if (regions.sizes[label] > regions.sizes[mainLabel]) mainLabel = label;
    }
    const mainSamples = spec.mode === 'carve' ? collectRegionSamples(regions.labels, mainLabel, 64) : [];
    // 本轮处理全部非主区域：小碎块或 fill 模式回填，其余凿通到主块。
    for (let targetLabel = 0; targetLabel < regions.sizes.length; targetLabel += 1) {
      if (targetLabel === mainLabel) continue;
      if (spec.mode === 'fill' || regions.sizes[targetLabel] < fillThreshold) {
        filledCells += fillRegion(regions.labels, targetLabel, terrainIds, structureIds, mask, fillTile);
        continue;
      }
      const targetSamples = collectRegionSamples(regions.labels, targetLabel, 64);
      let bestFrom = targetSamples[0];
      let bestTo = mainSamples[0];
      let bestDistance = Infinity;
      for (const from of targetSamples) {
        const fx = from % width;
        const fy = (from - fx) / width;
        for (const to of mainSamples) {
          const tx = to % width;
          const ty = (to - tx) / width;
          const distance = Math.abs(fx - tx) + Math.abs(fy - ty);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestFrom = from;
            bestTo = to;
          }
        }
      }
      carvedCells += carveCorridor(width, bestFrom, bestTo, terrainIds, structureIds, mask, carveTile, rng);
    }
  }
  const finalRegions = findRegions(width, height, mask);
  if (finalRegions.sizes.length > 1) {
    throw new Error(`procgen_connectivity_failed:${finalRegions.sizes.length}`);
  }
  return { carvedCells, filledCells, regionCount: finalRegions.sizes.length };
}

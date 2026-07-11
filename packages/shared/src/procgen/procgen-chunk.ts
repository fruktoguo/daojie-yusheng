/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限流式地形：按 chunk 网格、只依赖 (seed, chunkX, chunkY) 确定性生成一块地貌。
 *
 * 与有界秘境（BSP 分区 + 拓扑门位 + 全局 BFS）不同，这里没有全局矩形、没有边界、
 * 没有房间——地图是一片可以无限延展的连续自然地貌。跨块无缝的关键：地形取自
 * **世界坐标连续的 fBm 噪声** `fbmNoise2D(worldX, worldY, ...)`，相邻块采样同一片噪声，
 * 边界值天然一致，绝不做「按本块 min/max 归一化」（那正是分块跳变的根源），
 * 而是对原始 [0,1) 噪声施加**固定**对比拉伸，处处同一函数、处处无缝。
 *
 * 平滑（元胞多数派）在块边界需要邻块的格子，故生成时带 overscan：多算一圈 margin，
 * 平滑后裁掉。因每格按世界坐标确定性生成，overscan 的格子与邻块逐位一致，跨界自洽。
 */
import { fbmNoise2D, hashStringToUint32, ProcgenRng } from './procgen-random';
import { smoothTerrain } from './procgen-fields';
import { stampStructures } from './procgen-chunk-assemble';
import type { FurnitureAnchor, InfiniteStructureSpec } from './procgen-chunk-structures';
import type { ProcgenFieldSpec } from './procgen-types';

/** biome 判定规则：在对比拉伸后的 [0,1] 高程/湿度上取区间，首条命中优先。 */
export interface InfiniteBiomeRule {
  tile: string;
  elevation?: readonly [number, number];
  moisture?: readonly [number, number];
}

/** 结构散布规则：只在指定地形上按密度撒（树/石/竹等），逐块确定性。 */
export interface InfiniteScatterRule {
  tile: string;
  density: number;
  onTerrain: readonly string[];
}

export interface InfiniteWorldSpec {
  seed: string;
  chunkSize: number;
  elevation: ProcgenFieldSpec;
  moisture: ProcgenFieldSpec;
  /** 原始 fBm 集中在 0.5 附近，用固定系数绕 0.5 拉开对比（处处同一函数，保持无缝）。 */
  contrast: number;
  baseTerrain: string;
  biomes: readonly InfiniteBiomeRule[];
  smoothIterations: number;
  scatter: readonly InfiniteScatterRule[];
  /** 结构镶嵌（可选）：在连续自然地貌上点阵撒下城镇/地牢/小屋，不切矩形、不包裹山墙。 */
  structures?: InfiniteStructureSpec;
}

export interface WorldChunk {
  cx: number;
  cy: number;
  size: number;
  terrainIds: string[];
  surfaceIds: (string | null)[];
  structureIds: (string | null)[];
  /** 家具锚点（局部格坐标 + 汉字字形）：demo 直接画字，不进结构层、不参与 walkable。 */
  furniture: FurnitureAnchor[];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 绕 0.5 做固定对比拉伸；处处同一映射，不破坏无缝。 */
function expand(v: number, contrast: number): number {
  return clamp01((v - 0.5) * contrast + 0.5);
}

/** 世界坐标 (wx,wy) 处的地形 id：连续噪声 → 对比拉伸 → 首条命中的 biome 规则。 */
function terrainAtWorld(
  spec: InfiniteWorldSpec,
  elevSeed: number,
  moistSeed: number,
  wx: number,
  wy: number,
): string {
  const e = expand(fbmNoise2D(wx, wy, elevSeed, spec.elevation.octaves, spec.elevation.persistence, spec.elevation.scale, spec.elevation.warp ?? 0), spec.contrast);
  const m = expand(fbmNoise2D(wx, wy, moistSeed, spec.moisture.octaves, spec.moisture.persistence, spec.moisture.scale, spec.moisture.warp ?? 0), spec.contrast);
  for (const rule of spec.biomes) {
    if (rule.elevation && (e < rule.elevation[0] || e > rule.elevation[1])) continue;
    if (rule.moisture && (m < rule.moisture[0] || m > rule.moisture[1])) continue;
    return rule.tile;
  }
  return spec.baseTerrain;
}

/** 生成 (cx,cy) 块的三层。只依赖 (seed,cx,cy)，可按需生成/丢弃/复算，无需持久化像素。 */
export function generateChunk(spec: InfiniteWorldSpec, cx: number, cy: number): WorldChunk {
  const size = spec.chunkSize;
  const iters = Math.max(0, Math.floor(spec.smoothIterations));
  // overscan：平滑影响半径 = 迭代数，多留 1 格确保裁剪区完全不受 padded 边缘 clamp 影响。
  const margin = iters > 0 ? iters + 1 : 0;
  const pad = size + margin * 2;
  const elevSeed = hashStringToUint32(`${spec.seed}:elev`);
  const moistSeed = hashStringToUint32(`${spec.seed}:moist`);
  const originX = cx * size - margin;
  const originY = cy * size - margin;

  let padded = new Array<string>(pad * pad);
  for (let ly = 0; ly < pad; ly += 1) {
    for (let lx = 0; lx < pad; lx += 1) {
      padded[ly * pad + lx] = terrainAtWorld(spec, elevSeed, moistSeed, originX + lx, originY + ly);
    }
  }
  if (iters > 0) padded = smoothTerrain(pad, pad, padded, iters);

  const terrainIds = new Array<string>(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      terrainIds[y * size + x] = padded[(y + margin) * pad + (x + margin)];
    }
  }
  const surfaceIds = new Array<string | null>(size * size).fill(null);
  const structureIds = new Array<string | null>(size * size).fill(null);
  const furniture: FurnitureAnchor[] = [];

  // 结构散布：逐块独立确定性种子；边界结构不需要邻块信息，故无跨块冲突。
  const rng = new ProcgenRng(`${spec.seed}:chunk:${cx}:${cy}:scatter`);
  for (let i = 0; i < size * size; i += 1) {
    const terrain = terrainIds[i];
    for (const rule of spec.scatter) {
      if (!rule.onTerrain.includes(terrain)) continue;
      if (rng.chance(rule.density)) { structureIds[i] = rule.tile; break; }
    }
  }
  // 结构镶嵌：自然地貌与散点铺完后，点阵撒下与本块相交的城镇/地牢/小屋。
  // 只写结构自身 footprint，故周围保持自然；跨块结构由相邻块各自 stamp 出一致结果。
  if (spec.structures) {
    stampStructures(spec.seed, size, spec.structures, cx, cy, terrainIds, surfaceIds, structureIds, furniture);
  }
  return { cx, cy, size, terrainIds, surfaceIds, structureIds, furniture };
}

/** 默认无限世界：温带自然地貌（深水—浅滩—草原—丘陵—峭壁，湿地散生竹林）。 */
export const INFINITE_WORLD_DEFAULT: InfiniteWorldSpec = {
  seed: 'infinite',
  chunkSize: 48,
  elevation: { scale: 42, octaves: 4, persistence: 0.5, warp: 0.4 },
  moisture: { scale: 34, octaves: 3, persistence: 0.5, warp: 0.3 },
  contrast: 2.4,
  baseTerrain: 'grass',
  biomes: [
    { tile: 'water', elevation: [0, 0.30] },
    { tile: 'mud', elevation: [0.30, 0.36] },
    { tile: 'cliff', elevation: [0.80, 1] },
    { tile: 'hill', elevation: [0.66, 0.80] },
    { tile: 'swamp', elevation: [0.36, 0.66], moisture: [0.72, 1] },
    { tile: 'floor', elevation: [0.36, 0.50], moisture: [0, 0.26] },
  ],
  smoothIterations: 2,
  scatter: [
    { tile: 'tree', density: 0.05, onTerrain: ['grass'] },
    { tile: 'bamboo', density: 0.06, onTerrain: ['swamp'] },
    { tile: 'stone', density: 0.04, onTerrain: ['hill'] },
    { tile: 'spirit_ore', density: 0.015, onTerrain: ['hill'] },
  ],
};

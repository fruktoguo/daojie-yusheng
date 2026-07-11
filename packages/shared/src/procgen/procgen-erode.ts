/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：区域边界侵蚀。
 *
 * BSP 叶是严格矩形，区与区之间只隔着一条笔直的 1 格 gutter，整张图因而被切成规整的
 * 矩形网格，拼接痕迹一眼可见。这里按噪声把区的外圈啃掉若干格，让区间屏障
 * 变成一条**厚度起伏、蜿蜒**的山脊，而不是一条直线缝。
 *
 * 屏障必须始终不可走：区间若在门位之外还能通行，锁门、宝库、临界路就全被绕开了。
 * 所以侵蚀只做减法（可走 → 山体），绝不开口子。
 *
 * 两条硬约束：
 *   1. 侵蚀深度上限按区型分档。open/maze/corridor 是自然地貌，啃了更像山；
 *      dungeon/vault/boss 是人造建筑，方正本就合理，且房间可能贴着区边缘
 *      （vault 的房间自 (1,1) 起），啃一格就破墙，故深度为 0。
 *   2. 门位及其引线必须完好。门位就在区边上（borderDistance = 0），不保护必被啃掉，
 *      门一断，整个区就从图上掉线。
 */
import { generateField } from './procgen-fields';
import { buildWalkableMask } from './procgen-connect';
import type { ProcgenTileCatalog } from './procgen-catalog';
import type { ProcgenRect, ProcgenRegionKind, ProcgenRegionNode } from './procgen-types';

/** 各区型的最大侵蚀深度（格）。0 = 保持矩形。 */
const ERODE_DEPTH: Record<ProcgenRegionKind, number> = {
  open: 3,
  corridor: 2,
  transition: 3,
  // 城镇是开放聚落：地面整片可走、房子稀疏点缀，外圈啃成起伏地界更像自然村落而非方盒。
  // 门位引线受 PORT_GUARD_RADIUS 保护，街道引道在核心内，侵蚀不会切断连通。
  town: 3,
  // 迷宫不能事后啃：它的可走面是通道网络而非实心。骨架的最外圈本在 margin = baseRadius + 1，
  // 但 wobble 的偏移上限是 pitch/5（2~3 格），会把骨架推进侵蚀带里，通道就被拦腰啃断。
  // 侵蚀迷宫边界得在生成器内部做、且骨架豁免，见 procgen-maze.ts 的 borderErosion。
  maze: 0,
  // 人造建筑方正本就合理，且房间可能贴着区边缘（vault 的房间自 (1,1) 起），啃一格就破墙。
  dungeon: 0,
  vault: 0,
  boss: 0,
};

/**
 * 门位保护半径（切比雪夫）。取 3 = 最大侵蚀深度：引线上凡是可能被啃的格
 * （borderDistance ≤ 2），到门位的切比雪夫距离都 ≤ 2，因此落在保护区内。
 */
const PORT_GUARD_RADIUS = 3;

/** 边界噪声：尺度取中，太小则山脊碎成锯齿，太大则整条边一起进退、看着还是直的。 */
const ERODE_NOISE = { scale: 9, octaves: 2, persistence: 0.5, warp: 0.4 } as const;

/**
 * 该区允许啃的深度。区若薄到「两边各啃 maxDepth 就没有内部核心了」，一律不啃 ——
 * 否则 pruneRegionToCore 找不到种子，会把整个区裁成山体。
 */
function erodeDepthOf(region: ProcgenRegionNode): number {
  const maxDepth = ERODE_DEPTH[region.kind];
  if (maxDepth <= 0) return 0;
  return Math.min(region.rect.w, region.rect.h) > maxDepth * 2 ? maxDepth : 0;
}

/**
 * 按噪声啃掉各区外圈，把矩形边界推成蜿蜒山脊。返回被啃掉的格数。
 *
 * 必须在所有区域生成完毕之后、connectRegions 凿门廊之前调用：
 * 门廊凿在 gutter 上，若先凿后啃，门廊会被啃回山体。
 */
export function erodeRegionBorders(
  regions: readonly ProcgenRegionNode[],
  width: number,
  height: number,
  terrainIds: string[],
  structureIds: (string | null)[],
  wallTile: string,
  seed: string,
  catalog: ProcgenTileCatalog,
): number {
  const noise = generateField(width, height, ERODE_NOISE, `${seed}:erode`);

  // 门位保护掩码：门位周围 PORT_GUARD_RADIUS 的切比雪夫方邻域一律不啃。
  const guarded = new Uint8Array(width * height);
  for (const region of regions) {
    for (const port of region.ports) {
      for (let dy = -PORT_GUARD_RADIUS; dy <= PORT_GUARD_RADIUS; dy += 1) {
        for (let dx = -PORT_GUARD_RADIUS; dx <= PORT_GUARD_RADIUS; dx += 1) {
          const x = port.x + dx;
          const y = port.y + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          guarded[y * width + x] = 1;
        }
      }
    }
  }

  let eroded = 0;
  for (const region of regions) {
    const maxDepth = erodeDepthOf(region);
    if (maxDepth <= 0) continue;
    const { x: rx, y: ry, w: rw, h: rh } = region.rect;
    for (let y = ry; y < ry + rh; y += 1) {
      for (let x = rx; x < rx + rw; x += 1) {
        // 只有外圈够得着：内部核心（borderDistance ≥ maxDepth）恒不受影响，
        // 因此剩余可走面仍是连通的 —— 啃掉的永远是一条沿边的连通带。
        const borderDistance = Math.min(x - rx, rx + rw - 1 - x, y - ry, ry + rh - 1 - y);
        if (borderDistance >= maxDepth) continue;
        const index = y * width + x;
        if (guarded[index] === 1) continue;
        if (terrainIds[index] === wallTile && structureIds[index] === null) continue;
        const depth = Math.round(noise[index] * maxDepth);
        if (borderDistance >= depth) continue;
        terrainIds[index] = wallTile;
        structureIds[index] = null;
        eroded += 1;
      }
    }
  }

  // 啃完之后收尾：区边缘残留的格可能被树石与新山体合围成小孤岛
  // （内侧被一棵树挡住，两侧恰好啃穿）。按定义裁掉 —— 区的可走面 ≔ 与内部核心连通的部分。
  const mask = buildWalkableMask(width, height, terrainIds, structureIds, catalog);
  for (const region of regions) {
    const maxDepth = erodeDepthOf(region);
    if (maxDepth <= 0) continue;
    eroded += pruneRegionToCore(region.rect, maxDepth, mask, terrainIds, structureIds, wallTile, width);
  }
  return eroded;
}

/**
 * 把区内与「内部核心」四连通不可达的可走格填成山体，返回填掉的格数。
 *
 * 核心 ≔ borderDistance ≥ maxDepth 的可走格，它们永远啃不到，故必然存活。
 * 门位及其引线受保护未被啃，一路通到核心，因此裁剪不会切断任何一扇门。
 */
function pruneRegionToCore(
  rect: ProcgenRect,
  maxDepth: number,
  mask: Uint8Array,
  terrainIds: string[],
  structureIds: (string | null)[],
  wallTile: string,
  width: number,
): number {
  const queue: number[] = [];
  const reached = new Set<number>();
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const borderDistance = Math.min(x - rect.x, rect.x + rect.w - 1 - x, y - rect.y, rect.y + rect.h - 1 - y);
      if (borderDistance < maxDepth) continue;
      const index = y * width + x;
      if (mask[index] !== 1) continue;
      reached.add(index);
      queue.push(index);
    }
  }

  const inRect = (x: number, y: number): boolean => x >= rect.x && y >= rect.y
    && x < rect.x + rect.w && y < rect.y + rect.h;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = (index - x) / width;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      // 只在本区内扩散：区外要么是 gutter 山体，要么归邻区自己裁剪。
      if (!inRect(nx, ny)) continue;
      const next = ny * width + nx;
      if (mask[next] !== 1 || reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  let pruned = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const index = y * width + x;
      if (mask[index] !== 1 || reached.has(index)) continue;
      terrainIds[index] = wallTile;
      structureIds[index] = null;
      mask[index] = 0;
      pruned += 1;
    }
  }
  return pruned;
}

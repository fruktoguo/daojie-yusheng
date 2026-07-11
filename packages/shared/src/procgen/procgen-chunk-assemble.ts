/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限世界 · 结构镶嵌调度：世界结构点阵 + 四类结构分发。
 *
 * 世界按 gridSize 划槽，每槽 (seed,sx,sy) 确定性 roll 放不放/放什么/放槽内哪个抖动位。
 * 生成某 chunk 时扫所有 footprint 与本块相交的槽各自 stamp，只写结构自身格——跨块由
 * 相邻块各自 stamp 出一致结果，故无缝。reach 外扩量必须覆盖最大结构伸展，否则边缘漏画。
 */
import { ProcgenRng } from './procgen-random';
import {
  drawBuilding, overlaps, pickKind,
  type ChunkWriter, type FurnitureAnchor, type InfiniteStructureSpec,
} from './procgen-chunk-structures';
import { stampTown } from './procgen-chunk-town';
import { stampDungeon, stampMaze } from './procgen-chunk-dungeon';

/** footprint 外扩：覆盖城镇半径(≤26)/地牢伸展(≤24)/迷宫半宽(≤20) 的最大值，留余量。 */
const STRUCT_REACH = 32;

/** 散落小屋：1~3 栋独立建筑（各含家具），直接嵌在自然地貌里。中心 (ccx,ccy)。 */
function stampRoom(rng: ProcgenRng, ccx: number, ccy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const n = rng.int(1, 3);
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const bw = rng.int(6, 8);
    const bh = rng.int(6, 7);
    const ox = ccx + rng.int(-7, 7);
    const oy = ccy + rng.int(-7, 7);
    if (placed.some((p) => overlaps(ox, oy, bw, bh, p, 1))) continue;
    drawBuilding(rng, ox, oy, bw, bh, spec, w);
    placed.push({ x: ox, y: oy, w: bw, h: bh });
  }
}

/**
 * 世界结构点阵调度：扫所有 footprint 可能与本 chunk 相交的槽，逐槽确定性 stamp。
 * 只写落在本块的格与家具锚点，跨块结构由相邻块各自 stamp 出一致结果，天然无缝。
 */
export function stampStructures(
  seed: string,
  size: number,
  spec: InfiniteStructureSpec,
  cx: number,
  cy: number,
  terrain: string[],
  surface: (string | null)[],
  structure: (string | null)[],
  furniture: FurnitureAnchor[],
): void {
  const g = spec.gridSize;
  const worldX0 = cx * size;
  const worldY0 = cy * size;
  const writer: ChunkWriter = { terrain, surface, structure, furniture, worldX0, worldY0, size };
  const sx0 = Math.floor((worldX0 - STRUCT_REACH) / g);
  const sx1 = Math.floor((worldX0 + size + STRUCT_REACH) / g);
  const sy0 = Math.floor((worldY0 - STRUCT_REACH) / g);
  const sy1 = Math.floor((worldY0 + size + STRUCT_REACH) / g);
  for (let sy = sy0; sy <= sy1; sy += 1) {
    for (let sx = sx0; sx <= sx1; sx += 1) {
      const rng = new ProcgenRng(`${seed}:struct:${sx}:${sy}`);
      if (!rng.chance(spec.density)) continue;
      // 结构中心在槽内抖动，留 margin 防相邻槽结构交叠。
      const margin = Math.max(2, Math.min(Math.floor(g / 2) - 1, Math.floor(STRUCT_REACH / 2)));
      const span = Math.max(0, g - 2 * margin - 1);
      const ox = sx * g + margin + rng.int(0, span);
      const oy = sy * g + margin + rng.int(0, span);
      const kind = pickKind(rng, spec);
      if (kind === 'town') stampTown(rng, ox, oy, spec, writer);
      else if (kind === 'dungeon') stampDungeon(rng, ox, oy, spec, writer);
      else if (kind === 'maze') stampMaze(rng, ox, oy, spec, writer);
      else stampRoom(rng, ox, oy, spec, writer);
    }
  }
}

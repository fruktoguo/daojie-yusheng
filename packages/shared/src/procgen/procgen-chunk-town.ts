/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限世界 · 城镇生成器：街道网格 + 街区建筑。
 *
 * 与「圆内随机撒房」不同，这里像真实城镇：中心十字为主干道，两侧按固定间距铺巷道，
 * 街道把城镇切成一格格街区；每个街区内放一栋较大的建筑（门朝街、四周留空地当院子）。
 * 街道走 surface 层、建筑走 structure 层、地面压平成 groundTile——边缘直接过渡回自然地貌，
 * 没有外墙包裹。建筑内由 drawBuilding 顺手摆家具（沿墙一圈汉字陈设）。
 */
import { ProcgenRng } from './procgen-random';
import {
  drawBuilding, putStructure, putSurface, putTerrain,
  type ChunkWriter, type InfiniteStructureSpec,
} from './procgen-chunk-structures';

/** 城镇半宽/半高各自取值（故城镇非正方、更自然）——半径 18~26 即 36~52 见方的大镇。 */
const TOWN_HALF: readonly [number, number] = [18, 26];
/** 街区间距（街道网格 pitch）：决定街区大小与建筑密度。 */
const BLOCK_PITCH: readonly [number, number] = [13, 17];

/** 从中心向两侧按 pitch 铺街，返回落在 [lo,hi] 内的街坐标（含中心，升序）。 */
function axisLines(center: number, lo: number, hi: number, pitch: number): number[] {
  const out: number[] = [];
  for (let v = center; v >= lo; v -= pitch) out.push(v);
  for (let v = center + pitch; v <= hi; v += pitch) out.push(v);
  return out.sort((a, b) => a - b);
}

/** 竖向街道：x=sx，半宽 extra（0→1 格巷道，1→3 格主干道）。 */
function drawVStreet(w: ChunkWriter, sx: number, y0: number, y1: number, tile: string, extra: number): void {
  for (let gy = y0; gy <= y1; gy += 1) for (let ox = -extra; ox <= extra; ox += 1) putSurface(w, sx + ox, gy, tile);
}

/** 横向街道：y=sy，半宽 extra。 */
function drawHStreet(w: ChunkWriter, sy: number, x0: number, x1: number, tile: string, extra: number): void {
  for (let gx = x0; gx <= x1; gx += 1) for (let oy = -extra; oy <= extra; oy += 1) putSurface(w, gx, sy + oy, tile);
}

/** 街区内放一栋建筑：内缩离街 2 格，建筑填街区大部分但留院子；街区太小则留作空地/广场。 */
function placeBlockBuilding(
  rng: ProcgenRng, ax0: number, ay0: number, ax1: number, ay1: number,
  spec: InfiniteStructureSpec, w: ChunkWriter,
): void {
  const bx0 = ax0 + 2, by0 = ay0 + 2, bx1 = ax1 - 2, by1 = ay1 - 2;
  const availW = bx1 - bx0 + 1, availH = by1 - by0 + 1;
  if (availW < 6 || availH < 6) return;
  const bw = Math.min(availW, rng.int(6, 10));
  const bh = Math.min(availH, rng.int(6, 9));
  const bx = bx0 + rng.int(0, availW - bw);
  const by = by0 + rng.int(0, availH - bh);
  drawBuilding(rng, bx, by, bw, bh, spec, w);
}

/** 城镇：街道网格 + 逐街区建筑。中心 (ccx,ccy)。 */
export function stampTown(rng: ProcgenRng, ccx: number, ccy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const pal = spec.palette;
  const halfW = rng.intInRange(TOWN_HALF);
  const halfH = rng.intInRange(TOWN_HALF);
  const x0 = ccx - halfW, y0 = ccy - halfH, x1 = ccx + halfW, y1 = ccy + halfH;

  // 1. 压平城镇地面 + 清散点（城镇边缘直接过渡回自然，无外墙）。
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) { putTerrain(w, gx, gy, pal.groundTile); putStructure(w, gx, gy, null); }
  }

  // 2. 街道网格：两侧巷道（宽 1，street）+ 中心十字主干道（宽 3，road）。
  const pitch = rng.intInRange(BLOCK_PITCH);
  const streetXs = axisLines(ccx, x0 + 3, x1 - 3, pitch);
  const streetYs = axisLines(ccy, y0 + 3, y1 - 3, pitch);
  for (const sx of streetXs) drawVStreet(w, sx, y0, y1, pal.streetTile, 0);
  for (const sy of streetYs) drawHStreet(w, sy, x0, x1, pal.streetTile, 0);
  drawVStreet(w, ccx, y0, y1, pal.roadTile, 1);
  drawHStreet(w, ccy, x0, x1, pal.roadTile, 1);

  // 3. 街区内建筑：相邻街围成的街区各放一栋大建筑（含家具）。
  const xb = [x0 - 1, ...streetXs, x1 + 1];
  const yb = [y0 - 1, ...streetYs, y1 + 1];
  for (let i = 0; i < xb.length - 1; i += 1) {
    for (let j = 0; j < yb.length - 1; j += 1) placeBlockBuilding(rng, xb[i], yb[j], xb[i + 1], yb[j + 1], spec, w);
  }
}

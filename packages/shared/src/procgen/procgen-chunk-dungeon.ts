/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限世界 · 地牢 + 迷宫生成器。
 *
 * 地牢：围绕中心紧凑抖动布下 8~14 间较大石墙房间，相邻房间宽走廊相连，房间内摆家具——
 * 一座嵌在野外的地表地下城，四周仍是自然草木。
 * 迷宫：迭代回溯在 cell 网格上凿出蜿蜒单连通通道，braid 拆一部分死胡同成环，中心藏宝箱。
 * 两者都只写自身 footprint、伸展受限（≤ 调度层 reach），保证跨块无缝。
 */
import { ProcgenRng } from './procgen-random';
import {
  carveCorridor, drawRoomBox, putFurniture, putStructure, putTerrain,
  type ChunkWriter, type InfiniteStructureSpec,
} from './procgen-chunk-structures';

/** 地牢房间簇围绕中心的最大抖动半径。 */
const DUNGEON_SPREAD = 20;

/** 地牢：多间大房间 + 宽走廊网络，房间内摆家具。中心 (ccx,ccy)。 */
export function stampDungeon(rng: ProcgenRng, ccx: number, ccy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const pal = spec.palette;
  const count = rng.int(8, 14);
  let prevX = ccx;
  let prevY = ccy;
  for (let i = 0; i < count; i += 1) {
    const rw = rng.int(6, 9);
    const rh = rng.int(6, 8);
    const rcx = ccx + rng.int(-DUNGEON_SPREAD, DUNGEON_SPREAD);
    const rcy = ccy + rng.int(-DUNGEON_SPREAD, DUNGEON_SPREAD);
    drawRoomBox(rng, rcx - (rw >> 1), rcy - (rh >> 1), rw, rh, pal, w, true);
    if (i > 0) carveCorridor(prevX, prevY, rcx, rcy, pal, w, 2);
    prevX = rcx;
    prevY = rcy;
  }
}

/** 迷宫：cell 网格迭代回溯凿通道 + braid 成环，中心藏宝箱。中心 (ccx,ccy)。 */
export function stampMaze(rng: ProcgenRng, ccx: number, ccy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const pal = spec.palette;
  const cols = rng.int(14, 20);
  const rows = rng.int(14, 20);
  const gx0 = ccx - cols;
  const gy0 = ccy - rows;
  // 1. 迷宫区先全铺墙（floor 地面 + wall 结构），随后逐格凿出通道。
  for (let ry = 0; ry <= 2 * rows; ry += 1) {
    for (let rx = 0; rx <= 2 * cols; rx += 1) {
      putTerrain(w, gx0 + rx, gy0 + ry, pal.floorTile);
      putStructure(w, gx0 + rx, gy0 + ry, pal.wallTile);
    }
  }
  // cell (c,r) 落在奇数偏移格（通道），中间偶数格是可打通的隔墙。
  const cellX = (c: number): number => gx0 + 1 + 2 * c;
  const cellY = (r: number): number => gy0 + 1 + 2 * r;
  const clear = (x: number, y: number): void => putStructure(w, x, y, null);
  // 2. 迭代回溯（显式栈，避免深递归）。
  const visited = new Uint8Array(cols * rows);
  const startC = cols >> 1;
  const startR = rows >> 1;
  const stack: Array<[number, number]> = [[startC, startR]];
  visited[startR * cols + startC] = 1;
  clear(cellX(startC), cellY(startR));
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length > 0) {
    const [c, r] = stack[stack.length - 1];
    const open: Array<readonly [number, number]> = [];
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr * cols + nc]) open.push([dc, dr]);
    }
    if (open.length === 0) { stack.pop(); continue; }
    const [dc, dr] = rng.pick(open);
    const nc = c + dc;
    const nr = r + dr;
    visited[nr * cols + nc] = 1;
    clear(cellX(c) + dc, cellY(r) + dr);
    clear(cellX(nc), cellY(nr));
    stack.push([nc, nr]);
  }
  // 3. braid：随机拆约 12% 的隔墙成环，让迷宫有多条路而非纯树。
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!rng.chance(0.12)) continue;
      const [dc, dr] = rng.pick(dirs);
      const nc = c + dc;
      const nr = r + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) clear(cellX(c) + dc, cellY(r) + dr);
    }
  }
  // 4. 中心藏宝箱（家具字形）。
  putFurniture(w, cellX(startC), cellY(startR), '箱');
}

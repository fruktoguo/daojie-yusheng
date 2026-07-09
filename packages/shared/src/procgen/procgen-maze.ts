/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：迷宫区与走廊区。
 *
 * 迷宫用 Recursive Backtracker（随机化 DFS），产出的是生成树 —— 内部必然单连通，
 * 这是全图连通性归纳证明的基例之一。随后按 braidRate 拆死胡同成环：纯完美迷宫在 MMO 里
 * 会造成大量无效折返，braiding 降低寻路挫败感。
 *
 * 门位（port）是生成前预留的构造不变量：生成完毕后从门格向区内凿 stub，撞到第一条通道即停。
 * 这样「门 → 区内连通」恒成立，不需要事后靠全局 carve 去补。
 */
import { ProcgenRng } from './procgen-random';
import { RegionCanvas } from './procgen-canvas';
import type { ProcgenCorridorSpec, ProcgenMazeSpec } from './procgen-types';

/** 区内局部坐标的门位。side 指该门位于区的哪条边，决定 stub 的凿入方向。 */
export interface LocalPort {
  x: number;
  y: number;
  side: 'N' | 'E' | 'S' | 'W';
}

const INWARD: Record<LocalPort['side'], [number, number]> = {
  N: [0, 1],
  S: [0, -1],
  W: [1, 0],
  E: [-1, 0],
};

/**
 * 从门格沿凿入方向挖，撞到第一个已通格就停（门与区内通道之间不留断点）。
 * 门格自身总是被挖通。
 */
export function carvePortStub(canvas: RegionCanvas, port: LocalPort): void {
  const [dx, dy] = INWARD[port.side];
  let x = port.x;
  let y = port.y;
  const limit = canvas.width + canvas.height;
  for (let step = 0; step < limit; step += 1) {
    canvas.setStructure(x, y, null);
    const nx = x + dx;
    const ny = y + dy;
    if (!canvas.inBounds(nx, ny)) return;
    if (canvas.getStructure(nx, ny) === null) return;
    x = nx;
    y = ny;
  }
}

/** 迷宫的通道格落在奇数局部坐标上。门位必须对齐到此 pitch，否则 stub 会多凿一格墙。 */
export function alignToMazePitch(value: number, limit: number): number {
  const odd = value % 2 === 1 ? value : value + 1;
  return Math.min(Math.max(1, odd), limit % 2 === 1 ? limit : limit - 1);
}

/** 生成迷宫区。canvas 的 terrain 已由调用方填为该区底色。 */
export function generateMaze(
  canvas: RegionCanvas,
  ports: readonly LocalPort[],
  spec: ProcgenMazeSpec,
  seed: string,
): void {
  const rng = new ProcgenRng(seed);
  const { width, height } = canvas;
  if (spec.floorTile) {
    for (let index = 0; index < canvas.terrainIds.length; index += 1) canvas.terrainIds[index] = spec.floorTile;
  }
  for (let index = 0; index < canvas.structureIds.length; index += 1) canvas.structureIds[index] = spec.wallTile;

  const cols = Math.floor((width - 1) / 2);
  const rows = Math.floor((height - 1) / 2);
  if (cols < 2 || rows < 2) {
    // 区太小排不下迷宫单元格：整体挖空退化为小空地，仍保证连通。
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) canvas.setStructure(x, y, null);
    for (const port of ports) carvePortStub(canvas, port);
    return;
  }

  const visited = new Uint8Array(cols * rows);
  const stack: number[] = [0];
  visited[0] = 1;
  canvas.setStructure(1, 1, null);
  // 方向顺序固定为 N/E/S/W，随机只发生在「从可行方向里挑一个」，保证同 seed 同迷宫。
  const deltas: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const cx = current % cols;
    const cy = (current - cx) / cols;
    const open: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const nx = cx + deltas[d][0];
      const ny = cy + deltas[d][1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited[ny * cols + nx] === 1) continue;
      open.push(d);
    }
    if (open.length === 0) {
      stack.pop();
      continue;
    }
    const direction = open[rng.int(0, open.length - 1)];
    const nx = cx + deltas[direction][0];
    const ny = cy + deltas[direction][1];
    // 拆掉两个单元格之间的墙，再挖通目标单元格。
    canvas.setStructure(cx * 2 + 1 + deltas[direction][0], cy * 2 + 1 + deltas[direction][1], null);
    canvas.setStructure(nx * 2 + 1, ny * 2 + 1, null);
    visited[ny * cols + nx] = 1;
    stack.push(ny * cols + nx);
  }

  const braidRate = Math.min(1, Math.max(0, spec.braidRate ?? 0));
  if (braidRate > 0) braidDeadEnds(canvas, cols, rows, braidRate, new ProcgenRng(`${seed}:braid`));
  for (const port of ports) carvePortStub(canvas, port);
}

/** 拆死胡同：只有一条通路的单元格，按概率再拆一堵非边界墙，把树变成有环图。 */
function braidDeadEnds(canvas: RegionCanvas, cols: number, rows: number, braidRate: number, rng: ProcgenRng): void {
  const deltas: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const x = cx * 2 + 1;
      const y = cy * 2 + 1;
      const walls: Array<[number, number]> = [];
      let openCount = 0;
      for (const [dx, dy] of deltas) {
        if (canvas.getStructure(x + dx, y + dy) === null) openCount += 1;
        else if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < cols && cy + dy < rows) walls.push([x + dx, y + dy]);
      }
      if (openCount !== 1 || walls.length === 0) continue;
      if (!rng.chance(braidRate)) continue;
      const [wx, wy] = walls[rng.int(0, walls.length - 1)];
      canvas.setStructure(wx, wy, null);
    }
  }
}

/** 生成走廊区：细条叶，整体挖空作为连接组织，四周不设墙。 */
export function generateCorridor(canvas: RegionCanvas, ports: readonly LocalPort[], spec: ProcgenCorridorSpec): void {
  if (spec.floorTile) {
    for (let index = 0; index < canvas.terrainIds.length; index += 1) canvas.terrainIds[index] = spec.floorTile;
  }
  for (let index = 0; index < canvas.structureIds.length; index += 1) canvas.structureIds[index] = null;
  for (const port of ports) carvePortStub(canvas, port);
}

/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：迷宫区与走廊区。
 *
 * 迷宫用 Recursive Backtracker（随机化 DFS）在**低分辨率单元格**上跑，产出生成树 ——
 * 内部必然单连通，这是全图连通性归纳证明的基例之一。随后按 braidRate 拆死胡同成环：
 * 纯完美迷宫在 MMO 里会造成大量无效折返，braiding 降低寻路挫败感。
 *
 * 拓扑不直接画成砖墙。它被栅格化成一条**通道骨架**，再由噪声调制的距离场撑成
 * 宽窄不一的峡谷，墙体则是厚实、边缘起伏的山崖地形。详见 procgen-maze-terrain.ts。
 *
 * 门位（port）是生成前预留的构造不变量。它被直接接进骨架，而骨架恒可走，
 * 所以「门 → 区内连通」按构造成立，连事后凿 stub 都不需要。
 */
import { ProcgenRng } from './procgen-random';
import { RegionCanvas } from './procgen-canvas';
import { generateField } from './procgen-fields';
import { CHAMFER_UNIT, buildRadiusField, chamferDistance, pruneToSeeds, stampSegment, stampWobblySegment } from './procgen-maze-terrain';
import type { ProcgenCorridorSpec, ProcgenMazeSpec } from './procgen-types';

/** 单元格四邻连接位。方向顺序固定 N/E/S/W，随机只发生在「从可行方向里挑一个」。 */
const LINK_N = 1;
const LINK_E = 2;
const LINK_S = 4;
const LINK_W = 8;
const LINK_BITS = [LINK_N, LINK_E, LINK_S, LINK_W] as const;
const LINK_OPPOSITE = [LINK_S, LINK_W, LINK_N, LINK_E] as const;
const CELL_DELTAS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** 山体迷宫的噪声场：尺度取小，让山脊边缘细碎而不是大块起伏。 */
const MAZE_NOISE = { scale: 7, octaves: 3, persistence: 0.55, warp: 0.35 } as const;

const DEFAULT_CELL_PITCH: readonly [number, number] = [11, 14];
const DEFAULT_CORRIDOR_RADIUS: readonly [number, number] = [2, 2];
const DEFAULT_ROUGHNESS = 0.75;
const DEFAULT_WOBBLE = 0.4;

function popcount4(bits: number): number {
  return (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1) + ((bits >> 3) & 1);
}

/**
 * 在单元格图上跑随机化 DFS，返回每个单元格的连接位掩码。
 * braid 也在这一层做：拆的是拓扑边，而不是栅格里的某块砖。
 */
function buildMazeLinks(cols: number, rows: number, braidRate: number, rng: ProcgenRng): Uint8Array {
  const links = new Uint8Array(cols * rows);
  const visited = new Uint8Array(cols * rows);
  const stack: number[] = [0];
  visited[0] = 1;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const cx = current % cols;
    const cy = (current - cx) / cols;
    const open: number[] = [];
    for (let d = 0; d < 4; d += 1) {
      const nx = cx + CELL_DELTAS[d][0];
      const ny = cy + CELL_DELTAS[d][1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited[ny * cols + nx] === 1) continue;
      open.push(d);
    }
    if (open.length === 0) {
      stack.pop();
      continue;
    }
    const direction = open[rng.int(0, open.length - 1)];
    const nx = cx + CELL_DELTAS[direction][0];
    const ny = cy + CELL_DELTAS[direction][1];
    const next = ny * cols + nx;
    links[current] |= LINK_BITS[direction];
    links[next] |= LINK_OPPOSITE[direction];
    visited[next] = 1;
    stack.push(next);
  }

  if (braidRate <= 0) return links;
  // 死胡同（只有一条连接）按概率再开一条边，把生成树变成有环图。
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const cell = cy * cols + cx;
      if (popcount4(links[cell]) !== 1) continue;
      if (!rng.chance(braidRate)) continue;
      const closed: number[] = [];
      for (let d = 0; d < 4; d += 1) {
        if ((links[cell] & LINK_BITS[d]) !== 0) continue;
        const nx = cx + CELL_DELTAS[d][0];
        const ny = cy + CELL_DELTAS[d][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        closed.push(d);
      }
      if (closed.length === 0) continue;
      const direction = closed[rng.int(0, closed.length - 1)];
      const next = (cy + CELL_DELTAS[direction][1]) * cols + (cx + CELL_DELTAS[direction][0]);
      links[cell] |= LINK_BITS[direction];
      links[next] |= LINK_OPPOSITE[direction];
    }
  }
  return links;
}

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

/**
 * 沿一根轴均匀铺开单元格中心，两端各留 margin 格给山体。
 *
 * 不能简单取 `c * pitch + pitch/2`：那样最后一个中心落在 (cols-1)*pitch 处，
 * 区尾部会剩下最多一个 pitch 宽的死墙 —— 骨架根本没经过那里，距离场自然把它全填成山。
 */
function buildCenters(length: number, pitch: number, margin: number): number[] {
  const usable = length - margin * 2;
  if (usable < pitch) return [Math.floor(length / 2)];
  const count = Math.floor(usable / pitch) + 1;
  const spacing = usable / (count - 1);
  const centers: number[] = [];
  for (let i = 0; i < count; i += 1) centers.push(margin + Math.round(i * spacing));
  return centers;
}

/** 找出数组里离 value 最近的那一项的下标。 */
function nearestIndex(centers: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < centers.length; i += 1) {
    if (Math.abs(centers[i] - value) < Math.abs(centers[best] - value)) best = i;
  }
  return best;
}

/** 把门位接进骨架：找最近的单元格中心，拉一条 L 形引线过去。 */
function stampPortLead(
  seeds: Uint8Array,
  width: number,
  height: number,
  port: LocalPort,
  centersX: readonly number[],
  centersY: readonly number[],
): void {
  const targetX = centersX[nearestIndex(centersX, port.x)];
  const targetY = centersY[nearestIndex(centersY, port.y)];
  // 从门位先沿进入轴走到目标行/列，再折向中心；两段都是轴对齐的。
  if (port.side === 'N' || port.side === 'S') {
    stampSegment(seeds, width, height, port.x, port.y, port.x, targetY);
    stampSegment(seeds, width, height, port.x, targetY, targetX, targetY);
  } else {
    stampSegment(seeds, width, height, port.x, port.y, targetX, port.y);
    stampSegment(seeds, width, height, targetX, port.y, targetX, targetY);
  }
}

/**
 * 把单元格图栅格化成通道骨架：中心点 + 相连单元格之间的蜿蜒线段。
 *
 * 线段抖动而非笔直：直线骨架配上再强的宽度噪声，看起来仍是「加厚的网格墙」。
 * 抖动幅度限制在 pitch/5 以内；偶尔撞穿相邻山体只会多开一条环路，不影响连通性。
 */
function stampSkeleton(
  seeds: Uint8Array,
  width: number,
  height: number,
  links: Uint8Array,
  centersX: readonly number[],
  centersY: readonly number[],
  pitch: number,
  wobble: number,
  rng: ProcgenRng,
): void {
  const cols = centersX.length;
  // 抖动幅度必须显著小于半间距，否则相邻通道会频繁撞穿，山体碎成孤峰、迷宫感散掉。
  const maxOffset = Math.max(1, Math.floor(pitch / 5));
  for (let cy = 0; cy < centersY.length; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const x = centersX[cx];
      const y = centersY[cy];
      seeds[y * width + x] = 1;
      // 只画 E/S 两个方向，另外两个方向由邻居画，避免每条边画两遍。
      const cell = cy * cols + cx;
      if ((links[cell] & LINK_E) !== 0) {
        stampWobblySegment(seeds, width, height, x, y, centersX[cx + 1], y, maxOffset, wobble, rng);
      }
      if ((links[cell] & LINK_S) !== 0) {
        stampWobblySegment(seeds, width, height, x, y, x, centersY[cy + 1], maxOffset, wobble, rng);
      }
    }
  }
}

/**
 * 生成山崖迷宫区。canvas 的 terrain 已由调用方填为该区底色。
 *
 * 与旧的砖墙迷宫不同，这里 structure 层保持全空，墙体完全由 terrain 层的山体地形承担 ——
 * 这样 dual-grid 渲染会把相邻山体自动融合成连绵的山，而不是一格格孤立的墙。
 */
export function generateMaze(
  canvas: RegionCanvas,
  ports: readonly LocalPort[],
  spec: ProcgenMazeSpec,
  seed: string,
): void {
  const rng = new ProcgenRng(seed);
  const { width, height } = canvas;
  const floorTile = spec.floorTile;
  for (let index = 0; index < canvas.structureIds.length; index += 1) canvas.structureIds[index] = null;

  const pitch = rng.intInRange(spec.cellPitch ?? DEFAULT_CELL_PITCH);
  const baseRadius = rng.intInRange(spec.corridorRadius ?? DEFAULT_CORRIDOR_RADIUS);
  // 留出至少一圈山体，免得通道贴着区边缘、blit 后与邻区的 gutter 连成一片。
  const margin = baseRadius + 1;
  const centersX = buildCenters(width, pitch, margin);
  const centersY = buildCenters(height, pitch, margin);
  if (centersX.length < 2 || centersY.length < 2) {
    // 区太小排不下单元格：整体铺成空地，仍保证连通（门位天然落在可走面上）。
    if (floorTile) for (let index = 0; index < canvas.terrainIds.length; index += 1) canvas.terrainIds[index] = floorTile;
    return;
  }

  const links = buildMazeLinks(centersX.length, centersY.length, Math.min(1, Math.max(0, spec.braidRate ?? 0)), rng);

  // 骨架 = 单元格中心 + 连接段 + 门位引线。距离场以它为源。
  const seeds = new Uint8Array(width * height);
  stampSkeleton(seeds, width, height, links, centersX, centersY, pitch, spec.wobble ?? DEFAULT_WOBBLE, rng);
  for (const port of ports) stampPortLead(seeds, width, height, port, centersX, centersY);

  const distance = chamferDistance(width, height, seeds);
  const noise = generateField(width, height, MAZE_NOISE, `${seed}:ridge`);
  const radius = buildRadiusField(noise, baseRadius, spec.roughness ?? DEFAULT_ROUGHNESS);

  // 先定可走面，再裁掉与骨架四连通不可达的孤岛，最后才落地形。
  const walkable = new Uint8Array(distance.length);
  for (let index = 0; index < distance.length; index += 1) {
    walkable[index] = distance[index] <= radius[index] ? 1 : 0;
  }
  pruneToSeeds(width, height, seeds, walkable);

  for (let index = 0; index < walkable.length; index += 1) {
    if (walkable[index] === 0) {
      canvas.terrainIds[index] = spec.wallTerrain;
      continue;
    }
    // 贴着山体的最外一圈铺成山脚，让峡谷壁有个坡度过渡而不是一刀切。
    const isSlope = spec.slopeTile !== undefined && distance[index] > radius[index] - CHAMFER_UNIT;
    if (isSlope) canvas.terrainIds[index] = spec.slopeTile as string;
    else if (floorTile) canvas.terrainIds[index] = floorTile;
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

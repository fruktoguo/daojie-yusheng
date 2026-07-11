/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限世界结构镶嵌 · 基元库：类型、三层+家具写入器、建筑/房间/走廊/家具的绘制原语。
 *
 * 各具体结构生成器（城镇 / 地牢 / 迷宫）都 import 这里的原语，只负责「怎么布局」，
 * 不重复实现「怎么落格」。写入器只写落在本 chunk 局部范围的世界格，跨块结构由相邻
 * 块各自 stamp 出一致结果——这是跨块无缝的前提（结构完全由世界槽 seed 决定）。
 *
 * 家具不进结构层（composeTileTypeFromLayers 会忽略非枚举结构 id），而是独立锚点：
 * 局部格坐标 + 一个汉字字形，demo 渲染层直接把汉字画在格上——无需家具贴图。
 */
import { ProcgenRng } from './procgen-random';

/** 结构各槽位地块 + 建筑构件。主题只换这份映射即换皮。 */
export interface InfiniteStructurePalette {
  wallTile: string;
  doorTile: string;
  windowTile: string;
  /** 室内地板（terrain 层，压平脚下自然地貌）。 */
  floorTile: string;
  /** 聚落压平地面（terrain 层）。 */
  groundTile: string;
  /** 巷道/小径（surface 层）。 */
  streetTile: string;
  /** 主干道（surface 层，比巷道更正式）。 */
  roadTile: string;
}

/** 家具锚点：局部格坐标 + 展示字形，demo 直接画汉字，不依赖贴图。 */
export interface FurnitureAnchor {
  x: number;
  y: number;
  glyph: string;
}

/** 结构点阵参数：网格、密度、四类结构权重。 */
export interface InfiniteStructureSpec {
  /** 世界结构槽边长（格）——放大它即整体放大结构规模。 */
  gridSize: number;
  /** 每槽放结构的概率。 */
  density: number;
  palette: InfiniteStructurePalette;
  townWeight: number;
  dungeonWeight: number;
  mazeWeight: number;
  roomWeight: number;
  /** 墙上开窗概率。 */
  windowChance: number;
}

/** 三层 + 家具写入器：只落本 chunk [0,size) 局部范围的世界格，跨块由邻块各自 stamp。 */
export interface ChunkWriter {
  terrain: string[];
  surface: (string | null)[];
  structure: (string | null)[];
  furniture: FurnitureAnchor[];
  worldX0: number;
  worldY0: number;
  size: number;
}

/** 世界格是否落在本 chunk 局部范围内。 */
export function inChunk(w: ChunkWriter, wx: number, wy: number): boolean {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  return lx >= 0 && ly >= 0 && lx < w.size && ly < w.size;
}

export function putTerrain(w: ChunkWriter, wx: number, wy: number, tile: string): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.terrain[ly * w.size + lx] = tile;
}

export function putSurface(w: ChunkWriter, wx: number, wy: number, tile: string | null): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.surface[ly * w.size + lx] = tile;
}

export function putStructure(w: ChunkWriter, wx: number, wy: number, tile: string | null): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.structure[ly * w.size + lx] = tile;
}

/** 家具锚点：只收落在本 chunk 的（跨块房间由邻块各收自己那半，家具是单格点不重复）。 */
export function putFurniture(w: ChunkWriter, wx: number, wy: number, glyph: string): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.furniture.push({ x: lx, y: ly, glyph });
}

/** 两矩形是否在 gap 间距内交叠。 */
export function overlaps(
  x: number, y: number, bw: number, bh: number,
  p: { x: number; y: number; w: number; h: number }, gap: number,
): boolean {
  return x - gap < p.x + p.w && x + bw + gap > p.x && y - gap < p.y + p.h && y + bh + gap > p.y;
}

/** 家具字形池：demo 直接把汉字画在格上，一眼可辨是何陈设。 */
const FURNITURE_GLYPHS = ['床', '柜', '案', '炉', '榻', '箱', '瓮', '几', '架', '屏', '缸', '桌'];

/**
 * 房间内摆家具：沿内墙一圈按概率放家具字形，中央留出通道。
 * 房间内部不足 3×3 不摆（太挤）——这也是「房间不能太小」的下限保障。
 */
export function furnishRoom(rng: ProcgenRng, x: number, y: number, rw: number, rh: number, w: ChunkWriter): void {
  const ix0 = x + 1, iy0 = y + 1, ix1 = x + rw - 2, iy1 = y + rh - 2;
  if (ix1 - ix0 < 2 || iy1 - iy0 < 2) return;
  for (let gy = iy0; gy <= iy1; gy += 1) {
    for (let gx = ix0; gx <= ix1; gx += 1) {
      const onInnerEdge = gx === ix0 || gx === ix1 || gy === iy0 || gy === iy1;
      if (!onInnerEdge) continue;
      if (rng.chance(0.32)) putFurniture(w, gx, gy, rng.pick(FURNITURE_GLYPHS));
    }
  }
}

/**
 * 画一栋建筑：wall 外框 + 一扇 door + 随机 window + 室内 floor + 沿墙家具。
 * 脚下 terrain 一律压成 floorTile，避免墙飘在水/崖上。房间尺寸由调用方给（宜 ≥6）。
 */
export function drawBuilding(
  rng: ProcgenRng, x: number, y: number, bw: number, bh: number,
  spec: InfiniteStructureSpec, w: ChunkWriter,
): void {
  const pal = spec.palette;
  const doorSide = rng.int(0, 3);
  let doorX: number;
  let doorY: number;
  if (doorSide === 0) { doorX = x + 1 + rng.int(0, Math.max(0, bw - 3)); doorY = y; }
  else if (doorSide === 1) { doorX = x + 1 + rng.int(0, Math.max(0, bw - 3)); doorY = y + bh - 1; }
  else if (doorSide === 2) { doorX = x; doorY = y + 1 + rng.int(0, Math.max(0, bh - 3)); }
  else { doorX = x + bw - 1; doorY = y + 1 + rng.int(0, Math.max(0, bh - 3)); }
  for (let dy = 0; dy < bh; dy += 1) {
    for (let dx = 0; dx < bw; dx += 1) {
      const gx = x + dx;
      const gy = y + dy;
      putTerrain(w, gx, gy, pal.floorTile);
      const edge = dx === 0 || dy === 0 || dx === bw - 1 || dy === bh - 1;
      if (!edge) { putStructure(w, gx, gy, null); continue; }
      if (gx === doorX && gy === doorY) { putStructure(w, gx, gy, pal.doorTile); continue; }
      const corner = (dx === 0 || dx === bw - 1) && (dy === 0 || dy === bh - 1);
      if (!corner && rng.chance(spec.windowChance)) putStructure(w, gx, gy, pal.windowTile);
      else putStructure(w, gx, gy, pal.wallTile);
    }
  }
  furnishRoom(rng, x, y, bw, bh, w);
}

/** 画一间石墙房间（地牢/迷宫用）：wall 框 + floor 内 + 可选家具。房间外不动（保持自然）。 */
export function drawRoomBox(
  rng: ProcgenRng, x: number, y: number, rw: number, rh: number,
  pal: InfiniteStructurePalette, w: ChunkWriter, furnish: boolean,
): void {
  for (let dy = 0; dy < rh; dy += 1) {
    for (let dx = 0; dx < rw; dx += 1) {
      const gx = x + dx;
      const gy = y + dy;
      const edge = dx === 0 || dy === 0 || dx === rw - 1 || dy === rh - 1;
      putTerrain(w, gx, gy, pal.floorTile);
      putStructure(w, gx, gy, edge ? pal.wallTile : null);
    }
  }
  if (furnish) furnishRoom(rng, x, y, rw, rh, w);
}

/** L 形走廊（可加宽）：铺 floor 并清墙，让房间互通、走廊也嵌在自然里。 */
export function carveCorridor(
  x0: number, y0: number, x1: number, y1: number,
  pal: InfiniteStructurePalette, w: ChunkWriter, width: number,
): void {
  const half = Math.max(0, Math.floor((width - 1) / 2));
  const cut = (gx: number, gy: number): void => {
    for (let oy = -half; oy <= half; oy += 1) {
      for (let ox = -half; ox <= half; ox += 1) {
        putTerrain(w, gx + ox, gy + oy, pal.floorTile);
        putStructure(w, gx + ox, gy + oy, null);
      }
    }
  };
  let x = x0;
  while (x !== x1) { cut(x, y0); x += x < x1 ? 1 : -1; }
  let y = y0;
  while (y !== y1) { cut(x1, y); y += y < y1 ? 1 : -1; }
  cut(x1, y1);
}

/** 四类结构加权挑选。 */
export function pickKind(rng: ProcgenRng, spec: InfiniteStructureSpec): 'town' | 'dungeon' | 'maze' | 'room' {
  const total = spec.townWeight + spec.dungeonWeight + spec.mazeWeight + spec.roomWeight;
  let r = rng.next() * total;
  if ((r -= spec.townWeight) < 0) return 'town';
  if ((r -= spec.dungeonWeight) < 0) return 'dungeon';
  if ((r -= spec.mazeWeight) < 0) return 'maze';
  return 'room';
}

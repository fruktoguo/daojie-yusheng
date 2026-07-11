/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限世界结构镶嵌：在连续自然地貌上「点阵撒下」成组结构（城镇/地牢/小屋），
 * 让世界既像真实旷野、又散落地下城与聚落——而非把整图切成被墙包裹的矩形分区。
 *
 * 与有界秘境的 BSP 分区正相反：这里没有全局矩形、没有门位拓扑、没有 BFS 连通。
 * 结构由「世界结构点阵」决定：世界按 gridSize 划成槽，每槽 (seed,sx,sy) 确定性地
 * roll 是否放结构、放什么、放在槽内哪个抖动位置。生成某 chunk 时，扫所有 footprint
 * 与本块相交的槽、各自 stamp——因结构完全由 (seed,sx,sy) 决定世界坐标，相邻 chunk
 * 对同一结构写入逐格一致，跨块无缝；且只写结构自身 footprint、绝不动周围，故结构
 * 像「镶嵌」在自然地貌里，边缘直接过渡回草原/森林，没有生硬的包裹墙。
 */
import { ProcgenRng } from './procgen-random';

/** 结构各槽位地块：墙/门/窗/室内地板/聚落地面/街道。主题只换这份映射即换皮。 */
export interface InfiniteStructurePalette {
  wallTile: string;
  doorTile: string;
  windowTile: string;
  /** 室内地板（terrain 层，压平脚下自然地貌）。 */
  floorTile: string;
  /** 聚落压平地面（terrain 层）。 */
  groundTile: string;
  /** 街道/小径（surface 层）。 */
  streetTile: string;
}

/** 结构点阵参数：网格、密度、各类结构权重与尺寸。 */
export interface InfiniteStructureSpec {
  /** 世界结构槽边长（格）。 */
  gridSize: number;
  /** 每槽放结构的概率。 */
  density: number;
  palette: InfiniteStructurePalette;
  townWeight: number;
  dungeonWeight: number;
  roomWeight: number;
  /** 城镇压平半径。 */
  townRadius: readonly [number, number];
  /** 城镇房屋数。 */
  townHouses: readonly [number, number];
  /** 地牢房间数。 */
  dungeonRooms: readonly [number, number];
  /** 墙上开窗概率。 */
  windowChance: number;
}

/** 三层写入器：只写落在本 chunk [0,size) 局部范围内的世界格，跨块部分由邻块各自 stamp。 */
interface ChunkWriter {
  terrain: string[];
  surface: (string | null)[];
  structure: (string | null)[];
  worldX0: number;
  worldY0: number;
  size: number;
}

function putTerrain(w: ChunkWriter, wx: number, wy: number, tile: string): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.terrain[ly * w.size + lx] = tile;
}

function putSurface(w: ChunkWriter, wx: number, wy: number, tile: string | null): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.surface[ly * w.size + lx] = tile;
}

function putStructure(w: ChunkWriter, wx: number, wy: number, tile: string | null): void {
  const lx = wx - w.worldX0;
  const ly = wy - w.worldY0;
  if (lx < 0 || ly < 0 || lx >= w.size || ly >= w.size) return;
  w.structure[ly * w.size + lx] = tile;
}

/** 地牢房间簇围绕结构中心的最大抖动半径（决定地牢紧凑度，并锚定 reach 外扩量）。 */
const DUNGEON_SPREAD = 12;

/** 结构类型加权挑选。 */
function pickKind(rng: ProcgenRng, spec: InfiniteStructureSpec): 'town' | 'dungeon' | 'room' {
  const total = spec.townWeight + spec.dungeonWeight + spec.roomWeight;
  let r = rng.next() * total;
  if ((r -= spec.townWeight) < 0) return 'town';
  if ((r -= spec.dungeonWeight) < 0) return 'dungeon';
  return 'room';
}

/**
 * 世界结构点阵调度：扫所有 footprint 可能与本 chunk 相交的槽，逐槽确定性 stamp。
 * 只写落在本块的格，跨块结构由相邻块各自 stamp 出一致结果，天然无缝。
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
): void {
  const g = spec.gridSize;
  const worldX0 = cx * size;
  const worldY0 = cy * size;
  const writer: ChunkWriter = { terrain, surface, structure, worldX0, worldY0, size };
  // 结构最大伸展（城镇半径 / 地牢紧凑簇半径）决定 footprint 外扩：向外多扫若干槽，
  // 保证 footprint 伸进本块的边缘结构不被漏画——这是跨块无缝的前提。
  const reach = Math.max(spec.townRadius[1], DUNGEON_SPREAD + 6, 8) + 2;
  const sx0 = Math.floor((worldX0 - reach) / g);
  const sx1 = Math.floor((worldX0 + size + reach) / g);
  const sy0 = Math.floor((worldY0 - reach) / g);
  const sy1 = Math.floor((worldY0 + size + reach) / g);
  for (let sy = sy0; sy <= sy1; sy += 1) {
    for (let sx = sx0; sx <= sx1; sx += 1) {
      const rng = new ProcgenRng(`${seed}:struct:${sx}:${sy}`);
      if (!rng.chance(spec.density)) continue;
      // 结构中心在槽内抖动，留 margin 防相邻槽结构交叠。
      const margin = Math.max(2, Math.min(Math.floor(g / 2) - 1, Math.floor(reach / 2)));
      const span = Math.max(0, g - 2 * margin - 1);
      const ox = sx * g + margin + rng.int(0, span);
      const oy = sy * g + margin + rng.int(0, span);
      const kind = pickKind(rng, spec);
      if (kind === 'town') stampTown(rng, ox, oy, spec, writer);
      else if (kind === 'dungeon') stampDungeon(rng, ox, oy, spec, writer);
      else stampRoom(rng, ox, oy, spec, writer);
    }
  }
}

/**
 * 城镇：一片圆形压平地面 + 稀疏小屋 + 连到镇心的街道。圆形边缘直接过渡回自然地貌，
 * 没有外墙包裹——远看像旷野中的聚落。
 */
function stampTown(rng: ProcgenRng, cx: number, cy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const pal = spec.palette;
  const r = rng.intInRange(spec.townRadius);
  const r2 = r * r;
  // 1. 压平地面：圆内 terrain→groundTile、清散点 structure。
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy > r2) continue;
      putTerrain(w, cx + dx, cy + dy, pal.groundTile);
      putStructure(w, cx + dx, cy + dy, null);
    }
  }
  // 2. 稀疏房屋：圆内抖动布点，房屋须整体在圆内且互不重叠。
  const count = rng.intInRange(spec.townHouses);
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const bw = rng.int(4, 6);
    const bh = rng.int(4, 5);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const hx = cx + rng.int(-r + 1, r - bw);
      const hy = cy + rng.int(-r + 1, r - bh);
      if (!houseInCircle(hx, hy, bw, bh, cx, cy, r)) continue;
      if (placed.some((p) => overlaps(hx, hy, bw, bh, p, 1))) continue;
      drawBuilding(rng, hx, hy, bw, bh, spec, w);
      // 街道：门前引一条到镇心的小径（surface 层，不动 terrain/structure）。
      streetToCenter(hx + (bw >> 1), hy + bh - 1, cx, cy, pal.streetTile, w);
      placed.push({ x: hx, y: hy, w: bw, h: bh });
      break;
    }
  }
}

/** 房屋整体是否落在压平圆内（四角都在圆内即可）。 */
function houseInCircle(x: number, y: number, bw: number, bh: number, cx: number, cy: number, r: number): boolean {
  const r2 = r * r;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x, y], [x + bw - 1, y], [x, y + bh - 1], [x + bw - 1, y + bh - 1],
  ];
  return corners.every(([px, py]) => (px - cx) ** 2 + (py - cy) ** 2 <= r2);
}

/** 两矩形是否在 gap 间距内交叠。 */
function overlaps(
  x: number, y: number, bw: number, bh: number,
  p: { x: number; y: number; w: number; h: number }, gap: number,
): boolean {
  return x - gap < p.x + p.w && x + bw + gap > p.x && y - gap < p.y + p.h && y + bh + gap > p.y;
}

/**
 * 画一栋建筑：wall 外框 + 一扇 door + 随机 window + 室内 floor。
 * 脚下 terrain 一律压成 floorTile，避免露出自然地貌导致墙飘在水/崖上。
 */
function drawBuilding(
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
}

/** 从 (fx,fy) 到镇心 (cx,cy) 铺一条 L 形街道（surface 层）。 */
function streetToCenter(fx: number, fy: number, cx: number, cy: number, street: string, w: ChunkWriter): void {
  let y = fy;
  while (y !== cy) { putSurface(w, fx, y, street); y += y < cy ? 1 : -1; }
  let x = fx;
  while (x !== cx) { putSurface(w, x, cy, street); x += x < cx ? 1 : -1; }
}

/**
 * 地牢/地表遗迹：数间石墙房间沿主轴排布，相邻房间走廊连通，房间外一律不动——
 * 像野外一座半塌的地下城，四周仍是自然草木，而非把整块地包成山洞。
 */
function stampDungeon(rng: ProcgenRng, cx: number, cy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const pal = spec.palette;
  const count = rng.intInRange(spec.dungeonRooms);
  // 房间围绕结构中心紧凑抖动布点，相邻房间走廊相连——伸展受 DUNGEON_SPREAD 限制，
  // 既连成一座地表地牢，又保证不越出 reach 外扩范围（跨块无缝前提）。
  let prevX = cx;
  let prevY = cy;
  for (let i = 0; i < count; i += 1) {
    const rw = rng.int(4, 7);
    const rh = rng.int(4, 6);
    const rectCx = cx + rng.int(-DUNGEON_SPREAD, DUNGEON_SPREAD);
    const rectCy = cy + rng.int(-DUNGEON_SPREAD, DUNGEON_SPREAD);
    drawRoomBox(rectCx - (rw >> 1), rectCy - (rh >> 1), rw, rh, pal, w);
    if (i > 0) carveCorridor(prevX, prevY, rectCx, rectCy, pal, w);
    prevX = rectCx;
    prevY = rectCy;
  }
}

/** 画一间石墙房间：wall 框 + floor 内。房间外不动（保持自然）。 */
function drawRoomBox(
  x: number, y: number, rw: number, rh: number, pal: InfiniteStructurePalette, w: ChunkWriter,
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
}

/** 房间间走廊：L 形，铺 floor 并清墙，让房间互通、走廊也嵌在自然里。 */
function carveCorridor(
  x0: number, y0: number, x1: number, y1: number, pal: InfiniteStructurePalette, w: ChunkWriter,
): void {
  const cut = (gx: number, gy: number): void => {
    putTerrain(w, gx, gy, pal.floorTile);
    putStructure(w, gx, gy, null);
  };
  let x = x0;
  while (x !== x1) { cut(x, y0); x += x < x1 ? 1 : -1; }
  let y = y0;
  while (y !== y1) { cut(x1, y); y += y < y1 ? 1 : -1; }
  cut(x1, y1);
}

/** 散落小屋：1-2 栋独立建筑，直接嵌在自然地貌里。 */
function stampRoom(rng: ProcgenRng, cx: number, cy: number, spec: InfiniteStructureSpec, w: ChunkWriter): void {
  const n = rng.int(1, 2);
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const bw = rng.int(4, 6);
    const bh = rng.int(4, 5);
    const ox = cx + rng.int(-4, 4);
    const oy = cy + rng.int(-4, 4);
    if (placed.some((p) => overlaps(ox, oy, bw, bh, p, 1))) continue;
    drawBuilding(rng, ox, oy, bw, bh, spec, w);
    placed.push({ x: ox, y: oy, w: bw, h: bh });
  }
}

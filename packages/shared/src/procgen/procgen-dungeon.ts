/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：地牢区、宝库区、boss 房。
 *
 * 地牢在区内再嵌套一层 BSP 划出房间格，逐格放房，然后**递归连接子树的代表房**——
 * 只连叶兄弟房会在树的内部节点处留下割点，导致某些门到某些房不可达。
 * 递归连代表房产出的是一棵连通树，配合门位 stub，「门 → 区内任意房」恒可达。
 */
import { ProcgenRng } from './procgen-random';
import { RegionCanvas } from './procgen-canvas';
import { type LocalPort } from './procgen-maze';
import type { ProcgenAnchorKind, ProcgenBossSpec, ProcgenDungeonSpec, ProcgenRect, ProcgenVaultSpec } from './procgen-types';

/** 区内局部坐标的内容锚点，由调用方转成全局坐标。 */
export interface LocalAnchor {
  x: number;
  y: number;
  kind: ProcgenAnchorKind;
}

function fillStructure(canvas: RegionCanvas, tile: string | null): void {
  for (let index = 0; index < canvas.structureIds.length; index += 1) canvas.structureIds[index] = tile;
}

function fillTerrain(canvas: RegionCanvas, tile: string | undefined): void {
  if (!tile) return;
  for (let index = 0; index < canvas.terrainIds.length; index += 1) canvas.terrainIds[index] = tile;
}

/** 挖空矩形内部（保留其四周一圈作为墙）。 */
function carveInterior(canvas: RegionCanvas, rect: ProcgenRect): void {
  for (let y = rect.y + 1; y < rect.y + rect.h - 1; y += 1) {
    for (let x = rect.x + 1; x < rect.x + rect.w - 1; x += 1) canvas.setStructure(x, y, null);
  }
}

/** L 形直角走廊（宽 1、无抖动）。先水平后垂直或反之，由 rng 决定。 */
function carveElbow(canvas: RegionCanvas, x1: number, y1: number, x2: number, y2: number, rng: ProcgenRng): void {
  const horizontalFirst = rng.chance(0.5);
  const stepX = (y: number): void => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) canvas.setStructure(x, y, null);
  };
  const stepY = (x: number): void => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) canvas.setStructure(x, y, null);
  };
  if (horizontalFirst) {
    stepX(y1);
    stepY(x2);
  } else {
    stepY(x1);
    stepX(y2);
  }
}

/** 走廊穿过房墙的地方开门：周界上凡是被挖通的格子，改成 door。 */
function punchDoors(canvas: RegionCanvas, rooms: readonly ProcgenRect[], doorTile: string): void {
  for (const room of rooms) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      for (const y of [room.y, room.y + room.h - 1]) {
        if (canvas.getStructure(x, y) === null) canvas.setStructure(x, y, doorTile);
      }
    }
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (const x of [room.x, room.x + room.w - 1]) {
        if (canvas.getStructure(x, y) === null) canvas.setStructure(x, y, doorTile);
      }
    }
  }
}

function centerOf(rect: ProcgenRect): [number, number] {
  return [rect.x + Math.floor(rect.w / 2), rect.y + Math.floor(rect.h / 2)];
}

/** 房间与区边之间留出的山体厚度。没有它，房间墙贴着 rect 边，区界就是一条直墙。 */
const ROOM_INSET = 2;

/**
 * 从门位向指定房间的中心凿一条 L 形通道：先沿进入方向直入，再折向中心。
 *
 * 不能用 carvePortStub（沿进入方向一直线挖到「撞见第一条已有通路」为止）：门位是共享边的
 * 中点，可以贴在区的角上。这时那条直线会沿着房间外侧的墙带一路凿穿整个区，
 * 自始至终没进过房间 —— 房间于是被彻底封死，整块掉线。
 * 折向中心则保证通道必然进入房间内部。
 */
function carvePortElbow(canvas: RegionCanvas, port: LocalPort, targetX: number, targetY: number): void {
  const runX = (y: number, from: number, to: number): void => {
    for (let x = Math.min(from, to); x <= Math.max(from, to); x += 1) canvas.setStructure(x, y, null);
  };
  const runY = (x: number, from: number, to: number): void => {
    for (let y = Math.min(from, to); y <= Math.max(from, to); y += 1) canvas.setStructure(x, y, null);
  };
  if (port.side === 'N' || port.side === 'S') {
    runY(port.x, port.y, targetY);
    runX(targetY, port.x, targetX);
  } else {
    runX(port.y, port.x, targetX);
    runY(targetX, port.y, targetY);
  }
}

/** 离门位最近的房间（曼哈顿距离），门位通道凿向它。 */
function nearestRoom(rooms: readonly ProcgenRect[], port: LocalPort): ProcgenRect {
  let best = rooms[0];
  let bestDistance = Infinity;
  for (const room of rooms) {
    const [cx, cy] = centerOf(room);
    const distance = Math.abs(cx - port.x) + Math.abs(cy - port.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = room;
    }
  }
  return best;
}

/** 标记一个矩形的四周一圈（房间墙所在的格）。 */
function markPerimeter(keep: Uint8Array, canvas: RegionCanvas, room: ProcgenRect): void {
  for (let x = room.x; x < room.x + room.w; x += 1) {
    for (const y of [room.y, room.y + room.h - 1]) {
      if (canvas.inBounds(x, y)) keep[canvas.index(x, y)] = 1;
    }
  }
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (const x of [room.x, room.x + room.w - 1]) {
      if (canvas.inBounds(x, y)) keep[canvas.index(x, y)] = 1;
    }
  }
}

/**
 * 把房间周界之外那些「多余的墙」溶解成山体地形。
 *
 * 生成算法是「先用墙填满整个区，再挖出房间和走廊」，于是未被挖到的地方全是砖墙 ——
 * 整个区就成了一大块实心矩形，区边界一览无余、拼接痕迹刺眼。溶解之后，房间是凿在
 * 山里的石室，走廊是山中隧道，区边界化进周围连绵的山里。
 *
 * 只动 `structure === wallTile` 的格：门位 stub、走廊、房门在此前都已把 structure 置空
 * 或改成 door，terrain 仍是可走的 floorTile，因此一格都不会被误伤。
 */
function dissolveSpareWalls(
  canvas: RegionCanvas,
  rooms: readonly ProcgenRect[],
  wallTile: string,
  wallTerrain: string,
): void {
  const keep = new Uint8Array(canvas.width * canvas.height);
  for (const room of rooms) markPerimeter(keep, canvas, room);
  for (let index = 0; index < canvas.structureIds.length; index += 1) {
    if (canvas.structureIds[index] !== wallTile || keep[index] === 1) continue;
    canvas.structureIds[index] = null;
    canvas.terrainIds[index] = wallTerrain;
  }
}

/** 在 cell 内按 jitter 内缩出一间房，尊重 minRoom 下限。 */
function makeRoom(cell: ProcgenRect, minRoom: number, jitter: readonly [number, number], rng: ProcgenRng): ProcgenRect {
  const maxInsetX = Math.max(0, Math.floor((cell.w - minRoom) / 2));
  const maxInsetY = Math.max(0, Math.floor((cell.h - minRoom) / 2));
  const insetX = Math.min(maxInsetX, rng.intInRange(jitter));
  const insetY = Math.min(maxInsetY, rng.intInRange(jitter));
  return { x: cell.x + insetX, y: cell.y + insetY, w: cell.w - insetX * 2, h: cell.h - insetY * 2 };
}

/** 递归：切 cell、放房、连接两个子树的代表房，返回本子树的代表房。 */
function placeRooms(
  canvas: RegionCanvas,
  cell: ProcgenRect,
  depth: number,
  minRoom: number,
  jitter: readonly [number, number],
  rooms: ProcgenRect[],
  rng: ProcgenRng,
): ProcgenRect {
  const splittableX = cell.w >= minRoom * 2 + 2;
  const splittableY = cell.h >= minRoom * 2 + 2;
  if (depth <= 0 || (!splittableX && !splittableY)) {
    const room = makeRoom(cell, minRoom, jitter, rng);
    carveInterior(canvas, room);
    rooms.push(room);
    return room;
  }
  const vertical = splittableX && splittableY ? cell.w >= cell.h : splittableX;
  let a: ProcgenRect;
  let b: ProcgenRect;
  if (vertical) {
    const cut = rng.int(cell.x + minRoom + 1, cell.x + cell.w - minRoom - 1);
    a = { x: cell.x, y: cell.y, w: cut - cell.x, h: cell.h };
    b = { x: cut, y: cell.y, w: cell.x + cell.w - cut, h: cell.h };
  } else {
    const cut = rng.int(cell.y + minRoom + 1, cell.y + cell.h - minRoom - 1);
    a = { x: cell.x, y: cell.y, w: cell.w, h: cut - cell.y };
    b = { x: cell.x, y: cut, w: cell.w, h: cell.y + cell.h - cut };
  }
  const repA = placeRooms(canvas, a, depth - 1, minRoom, jitter, rooms, rng);
  const repB = placeRooms(canvas, b, depth - 1, minRoom, jitter, rooms, rng);
  const [ax, ay] = centerOf(repA);
  const [bx, by] = centerOf(repB);
  carveElbow(canvas, ax, ay, bx, by, rng);
  return rng.chance(0.5) ? repA : repB;
}

/** 生成地牢区。返回区内局部坐标的锚点（每间房按概率放宝箱/怪物）。 */
export function generateDungeon(
  canvas: RegionCanvas,
  ports: readonly LocalPort[],
  spec: ProcgenDungeonSpec,
  seed: string,
): LocalAnchor[] {
  const rng = new ProcgenRng(seed);
  fillTerrain(canvas, spec.floorTile);
  fillStructure(canvas, spec.wallTile);
  const minRoom = Math.max(3, Math.floor(spec.minRoom ?? 5));
  const jitter = spec.jitter ?? [1, 2];
  const roomTargetArea = Math.max(36, Math.floor(spec.roomTargetArea ?? 180));
  const area = canvas.width * canvas.height;
  const depth = Math.max(1, Math.floor(Math.log2(Math.max(2, area / roomTargetArea))));
  const rooms: ProcgenRect[] = [];
  // 房间只在内缩后的范围里放，给区边留一圈山体。
  const field: ProcgenRect = {
    x: ROOM_INSET, y: ROOM_INSET,
    w: canvas.width - ROOM_INSET * 2, h: canvas.height - ROOM_INSET * 2,
  };
  placeRooms(canvas, field, depth, minRoom, jitter, rooms, rng);
  // 先凿门位通道再开门：通道在房墙上留下的豁口，正好被 punchDoors 变成门。
  for (const port of ports) {
    const [cx, cy] = centerOf(nearestRoom(rooms, port));
    carvePortElbow(canvas, port, cx, cy);
  }
  punchDoors(canvas, rooms, spec.doorTile);
  dissolveSpareWalls(canvas, rooms, spec.wallTile, spec.wallTerrain);

  const anchorRng = new ProcgenRng(`${seed}:anchors`);
  const anchors: LocalAnchor[] = [];
  for (const room of rooms) {
    const [cx, cy] = centerOf(room);
    if (canvas.getStructure(cx, cy) !== null) continue;
    if (anchorRng.chance(0.45)) anchors.push({ x: cx, y: cy, kind: 'monster' });
    else if (anchorRng.chance(0.35)) anchors.push({ x: cx, y: cy, kind: 'chest' });
  }
  return anchors;
}

/** 宝库 / boss 房的边长上限。 */
const VAULT_MAX_SIDE = 15;
const BOSS_MAX_SIDE = 23;

/**
 * 区中央的房间矩形，边长封顶。
 *
 * 房间若铺满整个区（只内缩 ROOM_INSET），房墙就把 BSP 叶的矩形轮廓原样描了出来，
 * 一张图看着就是几个方盒子拼的。封顶之后，房间外剩下的大片区域全被 dissolveSpareWalls
 * 溶成山体，区界埋进连绵的山里，门位通道也随之变成一条穿山隧道。
 */
function centeredRoom(canvas: RegionCanvas, maxSide: number): ProcgenRect {
  const w = Math.min(canvas.width - ROOM_INSET * 2, maxSide);
  const h = Math.min(canvas.height - ROOM_INSET * 2, maxSide);
  return { x: Math.floor((canvas.width - w) / 2), y: Math.floor((canvas.height - h) / 2), w, h };
}

/** 生成宝库区：单封闭房 + 朝前驱的一扇门 + 对称柱阵 + 中心宝箱。读起来像设计而非随机。 */
export function generateVault(canvas: RegionCanvas, ports: readonly LocalPort[], spec: ProcgenVaultSpec): LocalAnchor[] {
  fillTerrain(canvas, spec.floorTile);
  fillStructure(canvas, spec.wallTile);
  const room = centeredRoom(canvas, VAULT_MAX_SIDE);
  carveInterior(canvas, room);
  // 只开一扇门：多个 port 时取第一个（拓扑保证宝库是度为 1 的死端旁支）。
  // 通道从区边凿到房心，途中穿过宝库墙；punchDoors 把那个洞变成门 ——
  // 门长在宝库墙上，而不是悬在区边的山体里。
  const [cx, cy] = centerOf(room);
  for (const port of ports) {
    carvePortElbow(canvas, port, cx, cy);
    break;
  }
  punchDoors(canvas, [room], spec.doorTile);
  dissolveSpareWalls(canvas, [room], spec.wallTile, spec.wallTerrain);

  if (spec.pillarTile) {
    for (const dx of [-2, 2]) for (const dy of [-2, 2]) canvas.setStructure(cx + dx, cy + dy, spec.pillarTile);
  }
  return [{ x: cx, y: cy, kind: 'chest' }];
}

/** 生成 boss 房：大 chamber + 宽入口 + 中心 boss 锚点。 */
export function generateBossRoom(
  canvas: RegionCanvas,
  ports: readonly LocalPort[],
  spec: ProcgenBossSpec,
  seed: string,
): LocalAnchor[] {
  const rng = new ProcgenRng(seed);
  fillTerrain(canvas, spec.floorTile);
  fillStructure(canvas, spec.wallTile);
  const room = centeredRoom(canvas, BOSS_MAX_SIDE);
  carveInterior(canvas, room);
  const entranceWidth = Math.max(1, rng.intInRange(spec.entranceWidth ?? [2, 3]));
  const [cx, cy] = centerOf(room);
  for (const port of ports) {
    // 入口加宽：沿边界向两侧平移出多条并行通道，最终汇于房心。
    const horizontal = port.side === 'N' || port.side === 'S';
    for (let offset = 0; offset < entranceWidth; offset += 1) {
      const x = horizontal ? port.x + offset : port.x;
      const y = horizontal ? port.y : port.y + offset;
      if (!canvas.inBounds(x, y)) break;
      carvePortElbow(canvas, { x, y, side: port.side }, cx, cy);
    }
  }
  // boss 房不装门：通道在房墙上凿出的豁口保持敞开（structure 已是 null，溶解不会碰它）。
  dissolveSpareWalls(canvas, [room], spec.wallTile, spec.wallTerrain);

  if (spec.pillarTile) {
    for (const dx of [-3, 3]) for (const dy of [-3, 3]) canvas.setStructure(cx + dx, cy + dy, spec.pillarTile);
  }
  return [{ x: cx, y: cy, kind: 'boss' }];
}

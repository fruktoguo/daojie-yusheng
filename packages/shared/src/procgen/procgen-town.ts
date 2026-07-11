/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：城镇区。
 *
 * 与地牢相反——地牢整区填墙再挖房间，城镇整区可走再点缀房子：地面是可走 terrain，
 * 房子是 structure 层墙/门/窗（有门可进），房间之间的开放空地即街道。街道引道从每个
 * 预留门位「先垂直区边直入核心、再折向镇心」（照搬 carvePortElbow 的防贴边教训），
 * 保证「门 → 镇内」构造连通且不被房屋阻断。房屋只落在 erode 深度之内的核心区，
 * 外圈交给 erodeRegionBorders 啃成起伏地界，融进周围自然（town 的 ERODE_DEPTH>0）。
 */
import { ProcgenRng } from './procgen-random';
import { RegionCanvas } from './procgen-canvas';
import { type LocalPort } from './procgen-maze';
import { type LocalAnchor } from './procgen-dungeon';
import type { ProcgenTownSpec } from './procgen-types';

/** 房屋须落在 borderDistance ≥ 此值的核心，避开 town 的 erode 侵蚀带（ERODE_DEPTH.town=3）。 */
const TOWN_CORE_INSET = 4;

function fillTerrain(canvas: RegionCanvas, tile: string | undefined): void {
  if (!tile) return;
  for (let index = 0; index < canvas.terrainIds.length; index += 1) canvas.terrainIds[index] = tile;
}

/**
 * 从门位到镇心凿一条 L 形街道：先沿进入方向直入、再折向镇心。清 structure（防房挡）、
 * 铺 street 铺装、并占位（reserved）避免房屋压街。直入段垂直区边、快速进核心，
 * 使街道落在 erode 带内的格都紧邻门位（受 PORT_GUARD_RADIUS 保护），不会被啃断。
 */
function carveStreet(
  canvas: RegionCanvas,
  port: LocalPort,
  tx: number,
  ty: number,
  streetTile: string | undefined,
  reserved: Uint8Array,
): void {
  const paint = (x: number, y: number): void => {
    if (!canvas.inBounds(x, y)) return;
    canvas.setStructure(x, y, null);
    if (streetTile) canvas.setSurface(x, y, streetTile);
    reserved[canvas.index(x, y)] = 1;
  };
  const runX = (y: number, from: number, to: number): void => {
    for (let x = Math.min(from, to); x <= Math.max(from, to); x += 1) paint(x, y);
  };
  const runY = (x: number, from: number, to: number): void => {
    for (let y = Math.min(from, to); y <= Math.max(from, to); y += 1) paint(x, y);
  };
  if (port.side === 'N' || port.side === 'S') {
    runY(port.x, port.y, ty);
    runX(ty, port.x, tx);
  } else {
    runX(port.y, port.x, tx);
    runY(tx, port.y, ty);
  }
}

/** 门朝镇心开：返回该朝向边中点的墙格局部下标。 */
function pickDoorLocal(canvas: RegionCanvas, x0: number, y0: number, bw: number, bh: number): number {
  const toCenterX = canvas.width / 2 - (x0 + bw / 2);
  const toCenterY = canvas.height / 2 - (y0 + bh / 2);
  const midX = x0 + Math.floor(bw / 2);
  const midY = y0 + Math.floor(bh / 2);
  if (Math.abs(toCenterX) > Math.abs(toCenterY)) {
    return canvas.index(toCenterX > 0 ? x0 + bw - 1 : x0, midY);
  }
  return canvas.index(midX, toCenterY > 0 ? y0 + bh - 1 : y0);
}

/** 包围盒（含 keepClear 外扩）须全在核心内、未被占。terrain 已整片可走，无需查地形。 */
function canPlaceHouse(
  canvas: RegionCanvas,
  reserved: Uint8Array,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
  keepClear: number,
): boolean {
  for (let y = y0 - keepClear; y < y0 + bh + keepClear; y += 1) {
    for (let x = x0 - keepClear; x < x0 + bw + keepClear; x += 1) {
      if (x < TOWN_CORE_INSET || y < TOWN_CORE_INSET) return false;
      if (x >= canvas.width - TOWN_CORE_INSET || y >= canvas.height - TOWN_CORE_INSET) return false;
      if (reserved[canvas.index(x, y)] === 1) return false;
    }
  }
  return true;
}

/** 画一栋房：墙框 + 朝镇心的门 + 可选窗 + 室内地板，占位并收集内部可走格。 */
function drawHouse(
  canvas: RegionCanvas,
  reserved: Uint8Array,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
  spec: ProcgenTownSpec,
  rng: ProcgenRng,
): number[] {
  const doorIndex = pickDoorLocal(canvas, x0, y0, bw, bh);
  for (let y = y0; y < y0 + bh; y += 1) {
    for (let x = x0; x < x0 + bw; x += 1) {
      reserved[canvas.index(x, y)] = 1;
      const onPerimeter = x === x0 || x === x0 + bw - 1 || y === y0 || y === y0 + bh - 1;
      if (!onPerimeter) continue;
      if (canvas.index(x, y) === doorIndex) { canvas.setStructure(x, y, spec.doorTile); continue; }
      if (spec.windowTile && rng.chance(spec.windowChance ?? 0)) { canvas.setStructure(x, y, spec.windowTile); continue; }
      canvas.setStructure(x, y, spec.wallTile);
    }
  }
  const interior: number[] = [];
  for (let y = y0 + 1; y < y0 + bh - 1; y += 1) {
    for (let x = x0 + 1; x < x0 + bw - 1; x += 1) {
      if (canvas.getStructure(x, y) !== null) continue;
      if (spec.houseFloorTile) canvas.setSurface(x, y, spec.houseFloorTile);
      interior.push(canvas.index(x, y));
    }
  }
  return interior;
}

/** 房内可走格按概率放宝箱/怪物锚点。 */
function houseContent(canvas: RegionCanvas, interior: readonly number[], spec: ProcgenTownSpec, rng: ProcgenRng, out: LocalAnchor[]): void {
  const content = spec.content;
  if (!content || interior.length === 0) return;
  const toXY = (index: number): LocalAnchor => ({ x: index % canvas.width, y: Math.floor(index / canvas.width), kind: 'chest' });
  if (content.chestChance && rng.chance(content.chestChance)) out.push(toXY(interior[rng.int(0, interior.length - 1)]));
  if (content.monsterChance && rng.chance(content.monsterChance)) {
    out.push({ ...toXY(interior[rng.int(0, interior.length - 1)]), kind: 'monster' });
  }
}

/** 生成城镇区：可走地面 + 门位街道 + 镇心广场 + 稀疏房群。返回区内局部锚点。 */
export function generateTown(
  canvas: RegionCanvas,
  ports: readonly LocalPort[],
  spec: ProcgenTownSpec,
  seed: string,
): LocalAnchor[] {
  const rng = new ProcgenRng(seed);
  fillTerrain(canvas, spec.groundTile);

  const reserved = new Uint8Array(canvas.width * canvas.height);
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);

  // 街道骨架：每门位引一条街到镇心，再在镇心开一片广场。
  for (const port of ports) carveStreet(canvas, port, cx, cy, spec.streetTile, reserved);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (!canvas.inBounds(x, y)) continue;
      canvas.setStructure(x, y, null);
      if (spec.streetTile) canvas.setSurface(x, y, spec.streetTile);
      reserved[canvas.index(x, y)] = 1;
    }
  }

  // 房群：数量按核心面积上限夹取，逐栋随机选址避开街道与彼此。
  const anchors: LocalAnchor[] = [];
  const size = spec.houseSize ?? { width: [4, 7], height: [4, 6] };
  const core = Math.max(0, (canvas.width - TOWN_CORE_INSET * 2)) * Math.max(0, (canvas.height - TOWN_CORE_INSET * 2));
  const cap = Math.max(1, Math.floor(core / 90));
  const want = Math.min(cap, Math.max(1, rng.intInRange(spec.houseCount ?? [4, 8])));
  let placed = 0;
  for (let i = 0; i < want; i += 1) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const bw = rng.intInRange(size.width);
      const bh = rng.intInRange(size.height);
      if (bw < 4 || bh < 4) continue;
      const x0 = rng.int(TOWN_CORE_INSET, canvas.width - TOWN_CORE_INSET - bw);
      const y0 = rng.int(TOWN_CORE_INSET, canvas.height - TOWN_CORE_INSET - bh);
      if (x0 < TOWN_CORE_INSET || y0 < TOWN_CORE_INSET) continue;
      if (!canPlaceHouse(canvas, reserved, x0, y0, bw, bh, 1)) continue;
      houseContent(canvas, drawHouse(canvas, reserved, x0, y0, bw, bh, spec, rng), spec, rng, anchors);
      placed += 1;
      break;
    }
  }
  void placed;
  return anchors;
}

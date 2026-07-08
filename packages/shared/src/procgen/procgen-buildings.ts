/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：房屋生成（产 structure 层字符 + 内容锚点）。
 *
 * 房子 = structure 层墙/门/窗字符围合而成，room-detection 与风水引擎会自动接管，
 * 不需要造 BuildingInstance。三种风格（院落/遗迹/村落）共用同一套画房逻辑，参数区分。
 */
import { ProcgenRng } from './procgen-random';
import { edgeDistanceOf } from './procgen-fields';
import type { ProcgenBuildingSpec, ProcgenContentAnchor } from './procgen-types';

export interface ProcgenBuildingResult {
  /** 房屋包围盒占地掩码（1=已占），供后续结构散布绕开。 */
  reserved: Uint8Array;
  contentAnchors: ProcgenContentAnchor[];
}

interface BuildContext {
  width: number;
  height: number;
  terrainIds: readonly string[];
  structureIds: (string | null)[];
  surfaceIds: (string | null)[];
  reserved: Uint8Array;
  allowed: ReadonlySet<string>;
  spec: ProcgenBuildingSpec;
  anchors: ProcgenContentAnchor[];
}

/** 矩形（含 keepClear 外扩）内全部格可建：terrain 允许、未被占、未触边界。 */
function canPlace(ctx: BuildContext, x0: number, y0: number, bw: number, bh: number, keepClear: number): boolean {
  for (let y = y0 - keepClear; y < y0 + bh + keepClear; y += 1) {
    for (let x = x0 - keepClear; x < x0 + bw + keepClear; x += 1) {
      if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) return false;
      const index = y * ctx.width + x;
      if (ctx.reserved[index] === 1) return false;
      if (edgeDistanceOf(x, y, ctx.width, ctx.height) < 2) return false;
      // 只要求墙体所在的包围盒落在允许地形上（外扩净空只查占用/边界）。
      const insideBox = x >= x0 && x < x0 + bw && y >= y0 && y < y0 + bh;
      if (insideBox && !ctx.allowed.has(ctx.terrainIds[index])) return false;
    }
  }
  return true;
}

/** 门朝地图中心开：返回该朝向边上一个中点墙格与其“室外”一格。 */
function pickDoorCell(ctx: BuildContext, x0: number, y0: number, bw: number, bh: number): number {
  const cx = x0 + bw / 2;
  const cy = y0 + bh / 2;
  const toCenterX = ctx.width / 2 - cx;
  const toCenterY = ctx.height / 2 - cy;
  const midX = x0 + Math.floor(bw / 2);
  const midY = y0 + Math.floor(bh / 2);
  if (Math.abs(toCenterX) > Math.abs(toCenterY)) {
    const wallX = toCenterX > 0 ? x0 + bw - 1 : x0;
    return midY * ctx.width + wallX;
  }
  const wallY = toCenterY > 0 ? y0 + bh - 1 : y0;
  return wallY * ctx.width + midX;
}

/** 画一栋房：墙框 + 门 + 可选窗/内墙/地板/碎物 + 内容锚点。 */
function drawHouse(ctx: BuildContext, x0: number, y0: number, bw: number, bh: number, rng: ProcgenRng): void {
  const { width, spec } = ctx;
  const wall = spec.wallTile ?? 'wall';
  const door = spec.doorTile ?? 'door';
  const isRuins = spec.style === 'ruins';
  const breakage = isRuins ? spec.ruinBreakage ?? 0.35 : 0;
  const doorIndex = pickDoorCell(ctx, x0, y0, bw, bh);
  for (let y = y0; y < y0 + bh; y += 1) {
    for (let x = x0; x < x0 + bw; x += 1) {
      const index = y * width + x;
      ctx.reserved[index] = 1;
      const onPerimeter = x === x0 || x === x0 + bw - 1 || y === y0 || y === y0 + bh - 1;
      if (!onPerimeter) continue;
      if (index === doorIndex) { ctx.structureIds[index] = door; continue; }
      // 遗迹按残缺率删墙段（门始终保留）；其余墙按开窗率换窗。
      if (breakage > 0 && rng.chance(breakage)) { ctx.structureIds[index] = null; continue; }
      if (spec.windowTile && rng.chance(spec.windowChance ?? 0)) { ctx.structureIds[index] = spec.windowTile; continue; }
      ctx.structureIds[index] = wall;
    }
  }
  // 院落：够大时加一道内墙切成两间，内墙中点留内门。
  if (spec.style === 'courtyard' && Math.min(bw, bh) >= 7) {
    if (bw >= bh) {
      const wx = x0 + Math.floor(bw / 2);
      const gate = y0 + Math.floor(bh / 2);
      for (let y = y0 + 1; y < y0 + bh - 1; y += 1) ctx.structureIds[y * width + wx] = y === gate ? door : wall;
    } else {
      const wy = y0 + Math.floor(bh / 2);
      const gate = x0 + Math.floor(bw / 2);
      for (let x = x0 + 1; x < x0 + bw - 1; x += 1) ctx.structureIds[wy * width + x] = x === gate ? door : wall;
    }
  }
  // 室内地板与碎物、内容锚点：收集内部无结构可走格。
  const interior: number[] = [];
  for (let y = y0 + 1; y < y0 + bh - 1; y += 1) {
    for (let x = x0 + 1; x < x0 + bw - 1; x += 1) {
      const index = y * width + x;
      if (ctx.structureIds[index] !== null) continue;
      if (spec.floorTile) ctx.surfaceIds[index] = spec.floorTile;
      interior.push(index);
    }
  }
  if (isRuins && spec.ruinDebrisTile) {
    for (const index of interior) if (rng.chance(0.15)) ctx.structureIds[index] = spec.ruinDebrisTile;
  }
  placeContent(ctx, interior, rng);
}

/** 在房屋内部可走格放宝箱/怪物锚点（避开已被碎物占的格）。 */
function placeContent(ctx: BuildContext, interior: readonly number[], rng: ProcgenRng): void {
  const content = ctx.spec.content;
  if (!content) return;
  const free = interior.filter((index) => ctx.structureIds[index] === null);
  if (free.length === 0) return;
  if (content.chestChance && rng.chance(content.chestChance)) {
    const index = free[rng.int(0, free.length - 1)];
    ctx.anchors.push({ x: index % ctx.width, y: Math.floor(index / ctx.width), kind: 'chest' });
  }
  if (content.monsterChance && rng.chance(content.monsterChance)) {
    const index = free[rng.int(0, free.length - 1)];
    ctx.anchors.push({ x: index % ctx.width, y: Math.floor(index / ctx.width), kind: 'monster' });
  }
}

/** 尝试放一栋房：随机选址若干次，成功则画房并返回 true。 */
function tryPlaceOne(ctx: BuildContext, keepClear: number, rng: ProcgenRng): boolean {
  const { spec } = ctx;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const bw = rng.intInRange(spec.size.width);
    const bh = rng.intInRange(spec.size.height);
    if (bw < 4 || bh < 4) continue;
    const x0 = rng.int(2, ctx.width - bw - 2);
    const y0 = rng.int(2, ctx.height - bh - 2);
    if (x0 < 2 || y0 < 2) continue;
    if (!canPlace(ctx, x0, y0, bw, bh, keepClear)) continue;
    drawHouse(ctx, x0, y0, bw, bh, rng);
    return true;
  }
  return false;
}

/**
 * 生成房屋。village 每个 count 展开为一簇小房（villageHouses 栋、彼此挨近），
 * 其它风格每个 count 为一栋。返回占地掩码与内容锚点。
 */
export function placeBuildings(
  width: number,
  height: number,
  terrainIds: readonly string[],
  structureIds: (string | null)[],
  surfaceIds: (string | null)[],
  spec: ProcgenBuildingSpec,
  rng: ProcgenRng,
): ProcgenBuildingResult {
  const ctx: BuildContext = {
    width,
    height,
    terrainIds,
    structureIds,
    surfaceIds,
    reserved: new Uint8Array(width * height),
    allowed: new Set(spec.on),
    spec,
    anchors: [],
  };
  const keepClear = Math.max(1, Math.floor(spec.keepClear ?? 3));
  const count = rng.intInRange(spec.count);
  for (let i = 0; i < count; i += 1) {
    if (spec.style === 'village') {
      const houses = rng.intInRange(spec.villageHouses ?? [3, 5]);
      // 村落内房屋挨近（净空取半），形成聚落感；道路网会自动把门连起来。
      for (let h = 0; h < houses; h += 1) tryPlaceOne(ctx, Math.max(1, Math.floor(keepClear / 2)), rng);
    } else {
      tryPlaceOne(ctx, keepClear, rng);
    }
  }
  return { reserved: ctx.reserved, contentAnchors: ctx.anchors };
}

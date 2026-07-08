/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：结构层放置（散布 / 成簇 / 邻近约束 / 最小间距）。
 */
import { ProcgenRng } from './procgen-random';
import type { ProcgenStructureRule } from './procgen-types';

interface PlacementContext {
  width: number;
  height: number;
  terrainIds: readonly string[];
  structureIds: (string | null)[];
  /** 保留占地掩码（如房屋包围盒，1=禁止散布），可选。 */
  reserved?: Uint8Array;
}

/** 检查 (x,y) 半径 radius 内是否存在指定 terrain 地块之一。 */
function hasNearbyTerrain(
  context: PlacementContext,
  x: number,
  y: number,
  tiles: ReadonlySet<string>,
  radius: number,
): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= context.width || ny >= context.height) continue;
      if (tiles.has(context.terrainIds[ny * context.width + nx])) return true;
    }
  }
  return false;
}

function isCandidateCell(context: PlacementContext, rule: ProcgenStructureRule, allowedTerrain: ReadonlySet<string>, nearSet: ReadonlySet<string> | null, x: number, y: number): boolean {
  const index = y * context.width + x;
  if (context.reserved && context.reserved[index] === 1) return false;
  if (context.structureIds[index] !== null) return false;
  if (!allowedTerrain.has(context.terrainIds[index])) return false;
  if (nearSet && rule.nearTiles && !hasNearbyTerrain(context, x, y, nearSet, rule.nearTiles.radius)) return false;
  return true;
}

/** 独立散布：逐格按概率放置，配合粗网格实现最小间距。 */
function placeScattered(context: PlacementContext, rule: ProcgenStructureRule, allowedTerrain: ReadonlySet<string>, nearSet: ReadonlySet<string> | null, rng: ProcgenRng): void {
  const density = rule.density ?? 0;
  if (density <= 0) return;
  const spacing = Math.max(0, Math.floor(rule.minSpacing ?? 0));
  const coarseWidth = spacing > 0 ? Math.ceil(context.width / spacing) : 0;
  const coarseHeight = spacing > 0 ? Math.ceil(context.height / spacing) : 0;
  const occupied = spacing > 0 ? new Set<number>() : null;
  for (let y = 0; y < context.height; y += 1) {
    for (let x = 0; x < context.width; x += 1) {
      if (!rng.chance(density)) continue;
      if (!isCandidateCell(context, rule, allowedTerrain, nearSet, x, y)) continue;
      if (occupied && spacing > 0) {
        // 粗网格间距检查：相邻粗格已有同类结构则跳过。
        // 必须裁剪列/行边界，否则一维 key 会在行边界回绕，把跨整行的两个远格误判为冲突。
        const cx = Math.floor(x / spacing);
        const cy = Math.floor(y / spacing);
        let blocked = false;
        for (let dy = -1; dy <= 1 && !blocked; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= coarseHeight) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            if (nx < 0 || nx >= coarseWidth) continue;
            if (occupied.has(ny * coarseWidth + nx)) {
              blocked = true;
              break;
            }
          }
        }
        if (blocked) continue;
        occupied.add(cy * coarseWidth + cx);
      }
      context.structureIds[y * context.width + x] = rule.tile;
    }
  }
}

/** 成簇放置：随机选种子格，再随机游走生长成一片（矿脉、石群、林地）。 */
function placeClusters(context: PlacementContext, rule: ProcgenStructureRule, allowedTerrain: ReadonlySet<string>, nearSet: ReadonlySet<string> | null, rng: ProcgenRng): void {
  if (!rule.clusters) return;
  const clusterCount = rng.intInRange(rule.clusters.count);
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    let seedX = -1;
    let seedY = -1;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const x = rng.int(0, context.width - 1);
      const y = rng.int(0, context.height - 1);
      if (isCandidateCell(context, rule, allowedTerrain, nearSet, x, y)) {
        seedX = x;
        seedY = y;
        break;
      }
    }
    if (seedX < 0) continue;
    const targetSize = rng.intInRange(rule.clusters.size);
    let cursorX = seedX;
    let cursorY = seedY;
    let placed = 0;
    for (let step = 0; step < targetSize * 6 && placed < targetSize; step += 1) {
      const index = cursorY * context.width + cursorX;
      if (isCandidateCell(context, rule, allowedTerrain, nearSet, cursorX, cursorY)) {
        context.structureIds[index] = rule.tile;
        placed += 1;
      }
      // 随机游走，偶尔跳回种子附近，让簇保持团状而不是长条
      if (rng.chance(0.2)) {
        cursorX = seedX + rng.int(-2, 2);
        cursorY = seedY + rng.int(-2, 2);
      } else {
        cursorX += rng.int(-1, 1);
        cursorY += rng.int(-1, 1);
      }
      cursorX = Math.max(0, Math.min(context.width - 1, cursorX));
      cursorY = Math.max(0, Math.min(context.height - 1, cursorY));
    }
  }
}

/**
 * 按规则顺序在 structureIds 上原地散布结构（null=无结构）。
 * structureIds 可预先含房屋墙门等（会被跳过不覆盖）；reserved 标记禁止散布的占地。
 */
export function placeStructures(
  width: number,
  height: number,
  terrainIds: readonly string[],
  rules: readonly ProcgenStructureRule[],
  rng: ProcgenRng,
  structureIds: (string | null)[] = new Array<string | null>(width * height).fill(null),
  reserved?: Uint8Array,
): (string | null)[] {
  const context: PlacementContext = {
    width,
    height,
    terrainIds,
    structureIds,
    reserved,
  };
  for (const rule of rules) {
    const allowedTerrain = new Set(rule.on);
    const nearSet = rule.nearTiles ? new Set(rule.nearTiles.tiles) : null;
    const ruleRng = rng.fork(`structure:${rule.tile}`);
    placeClusters(context, rule, allowedTerrain, nearSet, ruleRng);
    placeScattered(context, rule, allowedTerrain, nearSet, ruleRng);
  }
  return context.structureIds;
}

/** 清除出生点/传送阵周边的结构净空（放置完出生点后调用）。 */
export function clearStructuresAround(
  width: number,
  height: number,
  structureIds: (string | null)[],
  rules: readonly ProcgenStructureRule[],
  centerX: number,
  centerY: number,
): void {
  for (const rule of rules) {
    const radius = Math.floor(rule.keepClearOfSpawn ?? 0);
    if (radius <= 0) continue;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const index = y * width + x;
        if (structureIds[index] === rule.tile) {
          structureIds[index] = null;
        }
      }
    }
  }
}

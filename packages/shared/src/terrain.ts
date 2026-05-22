/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 地形系统：移动消耗、地形字符映射、可通行判定、地形耐久度计算。
 */
import { TileType } from './world-core-types';
import {
  StructureType,
  getStructureOreLevel,
  isStructureTypeOre,
  resolveTileLayerSeedFromTileType,
} from './map-layer-types';
import {
  BASE_MOVE_POINTS_PER_TICK,
  MAX_STORED_MOVE_POINTS,
  MOVE_POINT_UNIT,
  MOVE_SPEED_SOFT_CAP,
  MOVE_SPEED_SOFT_CAP_LOG_GAIN,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TERRAIN_REALM_BASE_HP,
  TERRAIN_REALM_HP_GROWTH_RATE,
  TILE_TRAVERSAL_COST,
  TILE_TYPE_TO_MAP_CHAR,
} from './constants/gameplay/terrain';
import { HOUSE_DECOR_BLOCK_SIGHT_TILE_TYPES, HOUSE_DECOR_WALKABLE_TILE_TYPES } from './constants/gameplay/house-terrain';

export {
  BASE_MOVE_POINTS_PER_TICK,
  MAX_STORED_MOVE_POINTS,
  MOVE_POINT_UNIT,
  MOVE_SPEED_SOFT_CAP,
  MOVE_SPEED_SOFT_CAP_LOG_GAIN,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TERRAIN_REALM_BASE_HP,
  TERRAIN_REALM_HP_GROWTH_RATE,
  TILE_TRAVERSAL_COST,
  TILE_TYPE_TO_MAP_CHAR,
} from './constants/gameplay/terrain';

/** 地图字符 → 地形类型（反向映射） */
export const MAP_CHAR_TO_TILE_TYPE: Record<string, TileType> = Object.fromEntries(
  Object.entries(TILE_TYPE_TO_MAP_CHAR).map(([type, char]) => [char, type]),
) as Record<string, TileType>;

export const DEFAULT_TILE_DURABILITY_MULTIPLIER_BY_TYPE: Partial<Record<TileType, number>> = {
  [TileType.Wall]: 50,
  [TileType.Cloud]: 3,
  [TileType.Tree]: 10,
  [TileType.Bamboo]: 8,
  [TileType.Cliff]: 50,
  [TileType.Stone]: 50,
  [TileType.SpiritOre]: 10000,
  [TileType.BlackIronOre]: 2000,
  [TileType.BrokenSwordHeap]: 2,
  [TileType.Door]: 14,
  [TileType.Window]: 10,
  [TileType.ScreenWall]: 50,
};

export function getDefaultTileDurabilityMultiplier(type: TileType | string | undefined | null): number | null {
  if (!type) {
    return null;
  }
  const multiplier = DEFAULT_TILE_DURABILITY_MULTIPLIER_BY_TYPE[type as TileType];
  return Number.isFinite(multiplier) && multiplier !== undefined && multiplier > 0 ? multiplier : null;
}

/** 判断地块类型是否为矿脉（可获得挖矿经验）。 */
export function isOreMinableTileType(type: TileType | string | undefined | null): boolean {
  if (isStructureTypeOre(type as StructureType)) {
    return true;
  }
  return isStructureTypeOre(resolveTileLayerSeedFromTileType(type).structure);
}

/** 矿脉地块等级映射（用于挖矿经验计算）。 */
export const ORE_TILE_LEVEL: Partial<Record<TileType, number>> = {
  [TileType.BlackIronOre]: 11,
  [TileType.SpiritOre]: 20,
};

export function getOreMiningLevel(type: TileType | string | undefined | null): number | null {
  return getStructureOreLevel(type as StructureType)
    ?? getStructureOreLevel(resolveTileLayerSeedFromTileType(type).structure);
}

/** 获取地形移动消耗 */
export function getTileTraversalCost(type: TileType): number {
  return TILE_TRAVERSAL_COST[type] ?? 400;
}

/** 地图字符转地形类型 */
export function getTileTypeFromMapChar(char: string): TileType {
  return MAP_CHAR_TO_TILE_TYPE[char] ?? TileType.Floor;
}

/** 地形类型转地图字符 */
export function getMapCharFromTileType(type: TileType): string {
  return TILE_TYPE_TO_MAP_CHAR[type] ?? TILE_TYPE_TO_MAP_CHAR[TileType.Floor];
}

/** 判断地形是否可通行 */
export function isTileTypeWalkable(type: TileType): boolean {
  return (
    type === TileType.Floor ||
    type === TileType.Road ||
    type === TileType.Trail ||
    type === TileType.Door ||
    type === TileType.Portal ||
    type === TileType.Stairs ||
    type === TileType.StoneStairs ||
    type === TileType.Grass ||
    type === TileType.Hill ||
    type === TileType.Mud ||
    type === TileType.Swamp ||
    type === TileType.ColdBog ||
    type === TileType.MoltenPool ||
    type === TileType.CloudFloor ||
    HOUSE_DECOR_WALKABLE_TILE_TYPES.has(type)
  );
}

/** 判断地形是否阻挡视线 */
export function doesTileTypeBlockSight(type: TileType): boolean {
  return type === TileType.Wall
    || type === TileType.Cloud
    || type === TileType.Tree
    || type === TileType.Bamboo
    || type === TileType.Cliff
    || type === TileType.Stone
    || type === TileType.SpiritOre
    || type === TileType.BlackIronOre
    || type === TileType.BrokenSwordHeap
    || HOUSE_DECOR_BLOCK_SIGHT_TILE_TYPES.has(type);
}

/** 根据移速属性计算每 tick 实际移动点数 */
export function getEffectiveMoveSpeed(moveSpeed: number): number {
  const raw = Number.isFinite(moveSpeed) ? Math.max(0, moveSpeed) : 0;
  return raw <= MOVE_SPEED_SOFT_CAP ? raw : MOVE_SPEED_SOFT_CAP + MOVE_SPEED_SOFT_CAP_LOG_GAIN * Math.log2(raw / MOVE_SPEED_SOFT_CAP);
}

export function getMovePointsPerTick(moveSpeed: number): number {
  return Math.max(1, Math.round(BASE_MOVE_POINTS_PER_TICK + (Number.isFinite(moveSpeed) ? Math.max(0, moveSpeed) : 0)));
}

export function getMaxStoredMovePoints(moveSpeed: number, requiredMovePoints = 0): number {
  const required = Number.isFinite(requiredMovePoints) ? Math.max(0, Math.trunc(requiredMovePoints)) : 0;
  return Math.max(MAX_STORED_MOVE_POINTS, getMovePointsPerTick(moveSpeed), required);
}

/** 地形耐久度材质类型 */
export type TerrainDurabilityMaterial =
  | 'vine'
  | 'wood'
  | 'bamboo'
  | 'ironwood'
  | 'spiritWood'
  | 'stone'
  | 'runeStone'
  | 'metal'
  | 'blackIron'
  | 'skyMetal'
  | 'spiritOre'
  | 'blackIronOre'
  | 'brokenSwordHeap';

/** 获取地图境界等级对应的基础血量。 */
export function getTerrainRealmBaseHp(realmLv: number): number {
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
  return TERRAIN_REALM_BASE_HP * Math.pow(TERRAIN_REALM_HP_GROWTH_RATE, normalizedRealmLv - 1);
}

/** 根据地图境界等级和配置倍率计算地形最终耐久度。 */
export function calculateTerrainDurability(
  realmLv: number,
  multiplier: number,
): number {
  return Math.max(1, Math.round(getTerrainRealmBaseHp(realmLv) * multiplier));
}

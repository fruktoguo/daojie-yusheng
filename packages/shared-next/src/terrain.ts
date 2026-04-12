/**
 * 地形系统：移动消耗、地形字符映射、可通行判定、地形耐久度计算。
 */
import { TileType } from './types';
import {
  BASE_MOVE_POINTS_PER_TICK,
  MAX_STORED_MOVE_POINTS,
  MOVE_POINT_UNIT,
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
    type === TileType.Grass ||
    type === TileType.Hill ||
    type === TileType.Mud ||
    type === TileType.Swamp ||
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
export function getMovePointsPerTick(moveSpeed: number): number {
  return BASE_MOVE_POINTS_PER_TICK + (Number.isFinite(moveSpeed) ? Math.max(0, moveSpeed) : 0);
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
/** normalizedRealmLv：定义该变量以承载业务值。 */
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

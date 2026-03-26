/**
 * 地形系统：移动消耗、地形字符映射、可通行判定、地形耐久度计算。
 */
import { TechniqueGrade, TileType } from './types';
import {
  BASE_MOVE_POINTS_PER_TICK,
  MAX_STORED_MOVE_POINTS,
  MOVE_POINT_UNIT,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TERRAIN_GRADE_BASE_HP,
  TERRAIN_MATERIAL_MULTIPLIERS,
  TILE_TRAVERSAL_COST,
  TILE_TYPE_TO_MAP_CHAR,
} from './constants/gameplay/terrain';

export {
  BASE_MOVE_POINTS_PER_TICK,
  MAX_STORED_MOVE_POINTS,
  MOVE_POINT_UNIT,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TERRAIN_GRADE_BASE_HP,
  TERRAIN_MATERIAL_MULTIPLIERS,
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
    type === TileType.CloudFloor
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
    || type === TileType.BlackIronOre;
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
  | 'skyMetal';

/** 获取品阶基础血量 */
export function getTerrainGradeBaseHp(grade: TechniqueGrade): number {
  return TERRAIN_GRADE_BASE_HP[grade];
}

/** 获取材质耐久度倍率 */
export function getTerrainMaterialMultiplier(material: TerrainDurabilityMaterial): number {
  return TERRAIN_MATERIAL_MULTIPLIERS[material];
}

/** 根据品阶和材质计算地形最终耐久度 */
export function calculateTerrainDurability(
  grade: TechniqueGrade,
  material: TerrainDurabilityMaterial,
): number {
  return Math.max(1, Math.round(getTerrainGradeBaseHp(grade) * getTerrainMaterialMultiplier(material)));
}

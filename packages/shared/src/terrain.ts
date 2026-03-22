/**
 * 地形系统：移动消耗、地形字符映射、可通行判定、地形耐久度计算。
 */
import { TechniqueGrade, TileType } from './types';

/** 移动点数基本单位 */
export const MOVE_POINT_UNIT = 100;
/** 每 tick 基础移动点数 */
export const BASE_MOVE_POINTS_PER_TICK = MOVE_POINT_UNIT;
/** 最大可累积移动点数 */
export const MAX_STORED_MOVE_POINTS = MOVE_POINT_UNIT * 4;

/** 各地形类型的移动消耗 */
export const TILE_TRAVERSAL_COST: Record<TileType, number> = {
  [TileType.Floor]: 100,
  [TileType.Road]: 30,
  [TileType.Trail]: 50,
  [TileType.Wall]: 400,
  [TileType.Door]: 100,
  [TileType.Window]: 400,
  [TileType.BrokenWindow]: 400,
  [TileType.Portal]: 100,
  [TileType.Stairs]: 100,
  [TileType.Grass]: 80,
  [TileType.Hill]: 120,
  [TileType.Mud]: 200,
  [TileType.Swamp]: 300,
  [TileType.Water]: 400,
  [TileType.Tree]: 400,
  [TileType.Stone]: 400,
};

/** 地形类型 → 地图字符 */
export const TILE_TYPE_TO_MAP_CHAR: Record<TileType, string> = {
  [TileType.Floor]: '.',
  [TileType.Road]: '=',
  [TileType.Trail]: ':',
  [TileType.Wall]: '#',
  [TileType.Door]: '+',
  [TileType.Window]: 'W',
  [TileType.BrokenWindow]: 'B',
  [TileType.Portal]: 'P',
  [TileType.Stairs]: 'S',
  [TileType.Grass]: ',',
  [TileType.Hill]: '^',
  [TileType.Mud]: ';',
  [TileType.Swamp]: '%',
  [TileType.Water]: '~',
  [TileType.Tree]: 'T',
  [TileType.Stone]: 'o',
};

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
    type === TileType.Swamp
  );
}

/** 判断地形是否阻挡视线 */
export function doesTileTypeBlockSight(type: TileType): boolean {
  return type === TileType.Wall || type === TileType.Tree || type === TileType.Stone;
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

// 地形基础血量直接取自 value-budget 中“功法满层目标价值”的各品阶最大值。
export const TERRAIN_GRADE_BASE_HP = {
  mortal: 132,
  yellow: 192,
  mystic: 420,
  earth: 660,
  heaven: 1320,
  spirit: 2640,
  saint: 5280,
  emperor: 10560,
} satisfies Record<TechniqueGrade, number>;

/** 各材质的耐久度倍率 */
export const TERRAIN_MATERIAL_MULTIPLIERS = {
  vine: 3,
  wood: 10,
  bamboo: 8,
  ironwood: 14,
  spiritWood: 18,
  stone: 50,
  runeStone: 70,
  metal: 100,
  blackIron: 120,
  skyMetal: 160,
} satisfies Record<TerrainDurabilityMaterial, number>;

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

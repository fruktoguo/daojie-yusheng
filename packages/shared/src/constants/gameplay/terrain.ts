import type { TechniqueGrade, TileType } from '../../types';

/**
 * 地块与地形规则常量。
 */

/** 地形被摧毁后的自动恢复时间（息） */
export const TERRAIN_DESTROYED_RESTORE_TICKS = 7200;

/** 地形恢复受阻时的顺延时间（息） */
export const TERRAIN_RESTORE_RETRY_DELAY_TICKS = 60;

/** 可摧毁地形每息自动恢复比例 */
export const TERRAIN_REGEN_RATE_PER_TICK = 0.001;

/** 移动点数基本单位 */
export const MOVE_POINT_UNIT = 100;

/** 每 tick 基础移动点数 */
export const BASE_MOVE_POINTS_PER_TICK = MOVE_POINT_UNIT;

/** 最大可累积移动点数 */
export const MAX_STORED_MOVE_POINTS = MOVE_POINT_UNIT * 4;

/** 各地形类型的移动消耗 */
export const TILE_TRAVERSAL_COST: Record<TileType, number> = {
  floor: 100,
  road: 30,
  trail: 50,
  wall: 400,
  door: 100,
  window: 400,
  broken_window: 400,
  portal: 100,
  stairs: 100,
  grass: 80,
  hill: 120,
  mud: 200,
  swamp: 300,
  water: 400,
  tree: 400,
  stone: 400,
};

/** 地形类型到地图字符的映射 */
export const TILE_TYPE_TO_MAP_CHAR: Record<TileType, string> = {
  floor: '.',
  road: '=',
  trail: ':',
  wall: '#',
  door: '+',
  window: 'W',
  broken_window: 'B',
  portal: 'P',
  stairs: 'S',
  grass: ',',
  hill: '^',
  mud: ';',
  swamp: '%',
  water: '~',
  tree: 'T',
  stone: 'o',
};

/** 地形耐久度的品阶基础血量 */
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
} as const;

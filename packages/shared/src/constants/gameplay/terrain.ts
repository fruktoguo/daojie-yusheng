/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
import type { TileType } from '../../world-core-types';
import { HOUSE_DECOR_TILE_TRAVERSAL_COST, HOUSE_DECOR_TILE_TYPE_TO_MAP_CHAR } from './house-terrain';

/**
 * 地块与地形规则常量。
 */

/** 地形被摧毁后的自动恢复时间（息） */
export const TERRAIN_DESTROYED_RESTORE_TICKS = 7200;

/** 地形恢复受阻时的顺延时间（息） */
export const TERRAIN_RESTORE_RETRY_DELAY_TICKS = 60;

/** 可摧毁地形每息自动恢复比例 */
export const TERRAIN_REGEN_RATE_PER_TICK = 0.01;

/** 移动点数基本单位 */
export const MOVE_POINT_UNIT = 100;

/** 每 tick 基础移动点数 */
export const BASE_MOVE_POINTS_PER_TICK = MOVE_POINT_UNIT;

/** 最大可累积移动点数（不允许跨 tick 累积，最多存储 1 tick 基础产出） */
export const MAX_STORED_MOVE_POINTS = MOVE_POINT_UNIT * 1;

/** 移速软衰减起点 */
export const MOVE_SPEED_SOFT_CAP = MOVE_POINT_UNIT * 5;

/** 移速软衰减后每翻倍提供的有效移速增量 */
export const MOVE_SPEED_SOFT_CAP_LOG_GAIN = MOVE_POINT_UNIT * 3;

/** 各地形类型的移动消耗 */
export const TILE_TRAVERSAL_COST: Record<TileType, number> = {
  floor: 100,
  road: 30,
  trail: 50,
  wall: 400,
  door: 100,
  window: 400,
  ...HOUSE_DECOR_TILE_TRAVERSAL_COST,
  portal: 100,
  stairs: 100,
  stone_stairs: 100,
  grass: 80,
  hill: 120,
  cliff: 400,
  mud: 200,
  swamp: 300,
  cold_bog: 360,
  molten_pool: 800,
  water: 400,
  cloud: 400,
  cloud_floor: 90,
  void: 400,
  tree: 400,
  bamboo: 400,
  stone: 400,
  spirit_ore: 400,
  black_iron_ore: 400,
  broken_sword_heap: 400,
};

/** 地形类型到地图字符的映射 */
export const TILE_TYPE_TO_MAP_CHAR: Record<TileType, string> = {
  floor: '.',
  road: '=',
  trail: ':',
  wall: '#',
  door: '+',
  window: 'W',
  ...HOUSE_DECOR_TILE_TYPE_TO_MAP_CHAR,
  portal: 'P',
  stairs: 'S',
  stone_stairs: '梯',
  grass: ',',
  hill: '^',
  cliff: '崖',
  mud: ';',
  swamp: '%',
  cold_bog: '寒',
  molten_pool: '熔',
  water: '~',
  cloud: '云',
  cloud_floor: '霞',
  void: '空',
  tree: 'T',
  bamboo: '竹',
  stone: 'o',
  spirit_ore: 'L',
  black_iron_ore: '铁',
  broken_sword_heap: '刃',
};

/** 地形耐久度的基础生命值倍率。 */
export const TERRAIN_REALM_BASE_HP = 100;

/** 地图境界等级每提升一级的生命成长倍率。 */
export const TERRAIN_REALM_HP_GROWTH_RATE = 1.4;

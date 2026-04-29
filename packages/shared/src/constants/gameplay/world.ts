import type { MapTimeConfig, TimePhaseId } from '../../types';

/**
 * 地图世界常量（视野、昼夜与时间流）。
 */

/** 新角色默认出生地图 ID。 */
export const DEFAULT_PLAYER_MAP_ID = 'yunlai_town';

/** 默认视野范围（半径，格子数） */
export const VIEW_RADIUS = 10;

/** 视野尺寸 */
export const VIEW_SIZE = VIEW_RADIUS * 2 + 1;

/** 游戏一天长度（息） */
export const GAME_DAY_TICKS = 7200;

/** 昼夜环境效果来源 ID */
export const WORLD_TIME_SOURCE_ID = 'world:time';

/** 夜色环境效果 Buff ID */
export const WORLD_DARKNESS_BUFF_ID = 'world:darkness';

/** 夜色环境效果持续时间 */
export const WORLD_DARKNESS_BUFF_DURATION = 2;

/** 时间段定义（昼夜循环中的一个阶段） */
export interface TimePhaseDefinition {
/**
 * id：ID标识。
 */

  id: TimePhaseId;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * startTick：starttick相关字段。
 */

  startTick: number;  
  /**
 * endTick：endtick相关字段。
 */

  endTick: number;  
  /**
 * skyLightPercent：skyLightPercent相关字段。
 */

  skyLightPercent: number;  
  /**
 * tint：tint相关字段。
 */

  tint: string;  
  /**
 * overlayAlpha：overlayAlpha相关字段。
 */

  overlayAlpha: number;
}

/** 昼夜各时段配置表 */
export const GAME_TIME_PHASES: TimePhaseDefinition[] = [
  { id: 'deep_night', label: '子夜', startTick: 0, endTick: 900, skyLightPercent: 50, tint: '#06101c', overlayAlpha: 0.48 },
  { id: 'late_night', label: '深宵', startTick: 900, endTick: 1500, skyLightPercent: 60, tint: '#0a1726', overlayAlpha: 0.42 },
  { id: 'before_dawn', label: '残夜', startTick: 1500, endTick: 2100, skyLightPercent: 70, tint: '#102132', overlayAlpha: 0.34 },
  { id: 'dawn', label: '破晓', startTick: 2100, endTick: 2700, skyLightPercent: 90, tint: '#6f88a8', overlayAlpha: 0.16 },
  { id: 'day', label: '白昼', startTick: 2700, endTick: 5400, skyLightPercent: 100, tint: '#f6e7bf', overlayAlpha: 0.02 },
  { id: 'dusk', label: '黄昏', startTick: 5400, endTick: 6000, skyLightPercent: 90, tint: '#9d6e46', overlayAlpha: 0.14 },
  { id: 'first_night', label: '初夜', startTick: 6000, endTick: 6600, skyLightPercent: 80, tint: '#3a4768', overlayAlpha: 0.24 },
  { id: 'night', label: '夜色', startTick: 6600, endTick: 6900, skyLightPercent: 70, tint: '#1f2941', overlayAlpha: 0.32 },
  { id: 'midnight', label: '夜阑', startTick: 6900, endTick: GAME_DAY_TICKS, skyLightPercent: 60, tint: '#111b2d', overlayAlpha: 0.4 },
];

/** 夜色层数对视野的衰减系数表 */
export const DARKNESS_STACK_TO_VISION_MULTIPLIER = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

/** 默认地图时间配置 */
export const DEFAULT_MAP_TIME_CONFIG: MapTimeConfig = {
  offsetTicks: 0,
  scale: 1,
  light: {
    base: 0,
    timeInfluence: 100,
  },
  palette: {},
};

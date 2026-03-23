/**
 * 全局游戏常量兼容层。
 *
 * 说明：
 * - 新增常量分组目录位于 `./constants/`。
 * - 当前文件仍保留旧导出路径，逐步承接迁移期兼容。
 */
import { TECHNIQUE_EXP_BASE, TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';
import { TechniqueGrade } from './types';

export {
  TICK_INTERVAL,
  TICK_BUDGET,
  DEATH_WAIT_TIME,
  DISCONNECT_RETAIN_TIME,
  PLAYER_HEARTBEAT_INTERVAL_MS,
  PLAYER_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC,
  RESPAWN_HP_RATIO,
  DEATH_EXP_PENALTY,
  PERSIST_INTERVAL,
  SERVER_PORT,
} from './constants/gameplay/core';
export {
  VIEW_RADIUS,
  VIEW_SIZE,
  GAME_DAY_TICKS,
  WORLD_TIME_SOURCE_ID,
  WORLD_DARKNESS_BUFF_ID,
  WORLD_DARKNESS_BUFF_DURATION,
  GAME_TIME_PHASES,
  DARKNESS_STACK_TO_VISION_MULTIPLIER,
  DEFAULT_MAP_TIME_CONFIG,
} from './constants/gameplay/world';
export type { TimePhaseDefinition } from './constants/gameplay/world';
export {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  TILE_AURA_HALF_LIFE_TICKS,
  TILE_AURA_HALF_LIFE_RATE_SCALE,
  TILE_AURA_HALF_LIFE_RATE_SCALED,
} from './constants/gameplay/aura';
export { SENSE_QI_OVERLAY_STYLE } from './constants/visuals/aura';
export {
  DEFAULT_BASE_ATTRS,
  BASE_MAX_QI,
  BASE_PHYS_ATK,
  BASE_SPELL_ATK,
  BASE_PHYS_DEF,
  BASE_SPELL_DEF,
  BASE_HIT,
  BASE_MAX_QI_OUTPUT_PER_TICK,
  BASE_HP_REGEN_RATE,
  BASE_QI_REGEN_RATE,
  HP_PER_CONSTITUTION,
  BASE_MAX_HP,
  ELEMENT_KEYS,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_VALUE_TYPES,
  DEFAULT_RATIO_DIVISOR,
  ATTR_TO_NUMERIC_WEIGHTS,
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
} from './constants/gameplay/attributes';
export {
  DEFAULT_INVENTORY_CAPACITY,
  GROUND_ITEM_EXPIRE_TICKS,
} from './constants/gameplay/inventory';
export {
  DEFAULT_PLAYER_REALM_STAGE,
  PLAYER_REALM_ORDER,
  PLAYER_REALM_CONFIG,
  PLAYER_REALM_NUMERIC_TEMPLATES,
} from './constants/gameplay/realm';
export { EQUIP_SLOTS } from './constants/gameplay/equipment';
export {
  CULTIVATE_EXP_PER_TICK,
  AUTO_IDLE_CULTIVATION_DELAY_TICKS,
  TECHNIQUE_EXP_BASE,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_GRADE_EXP_BASE_FACTORS,
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_EXP_TABLE,
} from './constants/gameplay/technique';
export * from './constants/ui';
export * from './constants/visuals';

/** 根据经验倍率与品阶计算功法实际经验需求 */
export function scaleTechniqueExp(expFactor: number, grade: TechniqueGrade = 'mortal'): number {
  if (expFactor <= 0) return 0;
  const gradeIndex = Math.max(0, TECHNIQUE_GRADE_ORDER.indexOf(grade));
  return Math.max(0, Math.round(expFactor * TECHNIQUE_EXP_BASE * (2 ** gradeIndex)));
}

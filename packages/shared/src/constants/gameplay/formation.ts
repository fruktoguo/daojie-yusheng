/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 阵法系统游戏数值常量。
 */

/** 阵法消耗灵石的物品 ID */
export const FORMATION_SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/** 阵法默认最低灵石数量 */
export const FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT = 1;

/** 每颗灵石提供的灵气预算 */
export const FORMATION_AURA_PER_SPIRIT_STONE = 100;

/** 每颗灵石默认消耗的灵力 */
export const FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE = 100;

/** 阵法默认持续时长（小时） */
export const FORMATION_DEFAULT_DURATION_HOURS = 2;

/** 阵法持续时长步进（小时） */
export const FORMATION_DEFAULT_DURATION_STEP_HOURS = 2;

/** 阵法最短持续时间（分钟） */
export const FORMATION_DEFAULT_MIN_DURATION_MINUTES = 1;

/** 最短持续时间的成本倍率 */
export const FORMATION_DEFAULT_MIN_DURATION_COST_MULTIPLIER = 1 / 8;

/** 短持续时间参考点（分钟） */
export const FORMATION_DEFAULT_SHORT_DURATION_REFERENCE_MINUTES = 10;

/** 短持续时间参考点的成本倍率 */
export const FORMATION_DEFAULT_SHORT_DURATION_REFERENCE_COST_MULTIPLIER = 1 / 6;

/** 范围成本几何增长比率 */
export const FORMATION_DEFAULT_GROWTH_COST_RATIO = 1.5;

/** 阵法最低效果值 */
export const FORMATION_DEFAULT_MIN_EFFECT_VALUE = 1;

/** 效果值到灵气成本的换算比率 */
export const FORMATION_DEFAULT_EFFECT_COST_RATIO = 100;

/** 分配百分比下限 */
export const FORMATION_ALLOCATION_MIN_PERCENT = 0;

/** 分配百分比上限 */
export const FORMATION_ALLOCATION_MAX_PERCENT = 100;

/** 分配百分比总和 */
export const FORMATION_ALLOCATION_TOTAL_PERCENT = 100;

/** 默认三等分分配百分比 */
export const FORMATION_DEFAULT_ALLOCATION_PERCENT = FORMATION_ALLOCATION_TOTAL_PERCENT / 3;

/** 持续时间日基准百分比 */
export const FORMATION_DAILY_DURATION_BASE_PERCENT = FORMATION_DEFAULT_ALLOCATION_PERCENT;

/** 每日 tick 数 */
export const FORMATION_TICKS_PER_DAY = 86_400;

/** 默认阵眼显示字符 */
export const DEFAULT_FORMATION_VISUAL_CHAR = '◎';

/** 默认阵眼显示颜色 */
export const DEFAULT_FORMATION_VISUAL_COLOR = '#4da3ff';

/** 默认阵法范围高亮颜色 */
export const DEFAULT_FORMATION_RANGE_HIGHLIGHT_COLOR = '#3b82f6';

/** 默认每灵气伤害值 */
export const FORMATION_DEFAULT_DAMAGE_PER_AURA = 100;

/** 阵法技艺每级提供的强度指数增幅 */
export const FORMATION_SKILL_STRENGTH_BONUS_PER_LEVEL = 0.05;

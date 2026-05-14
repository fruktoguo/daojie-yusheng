/**
 * 强化系统游戏数值常量。
 */

/** 默认强化等级 */
export const DEFAULT_ENHANCE_LEVEL = 0;

/** 最大强化等级 */
export const MAX_ENHANCE_LEVEL = 999;

/** 普通坊市可交易的最大强化等级；更高强化等级只允许私下交易或拍卖行。 */
export const MARKET_MAX_ENHANCE_LEVEL = 20;

/** 每级强化属性增幅比率 */
export const ENHANCEMENT_RATE_PER_LEVEL = 0.1;

/** 各目标强化等级对应的基础成功率 */
export const ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL = [
  0.5,
  0.45,
  0.45,
  0.4,
  0.4,
  0.4,
  0.35,
  0.35,
  0.35,
  0.35,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
] as const;

/** 强化基础耗时（tick） */
export const ENHANCEMENT_BASE_JOB_TICKS = 5;

/** 每物品等级额外耗时（tick） */
export const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;

/** 每级强化额外速度加成 */
export const ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL = 0.02;

/** 强化行动 ID */
export const ENHANCEMENT_ACTION_ID = 'enhancement:open';

/** 强化锤标签 */
export const ENHANCEMENT_HAMMER_TAG = 'enhancement_hammer';

/** 强化灵石物品 ID */
export const ENHANCEMENT_SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
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

/**
 * 各目标强化等级对应的基础成功率（覆盖 +1..+10）。
 * +11 及以上由 `ENHANCEMENT_HIGH_LEVEL_BASE_SUCCESS_RATE` × `(1 - ENHANCEMENT_HIGH_LEVEL_DECAY_PER_LEVEL) ^ (level - threshold)` 公式生成。
 */
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
] as const;

/** 强化目标等级达到该阈值后，每步成功率被封顶（防止 modifier 把概率推到 100%）。 */
export const ENHANCEMENT_HIGH_LEVEL_THRESHOLD = 11;

/** 高等级强化（targetEnhanceLevel ≥ 阈值）每步成功率的渐近上限。 */
export const ENHANCEMENT_HIGH_LEVEL_MAX_SUCCESS_RATE = 0.5;

/** 高等级强化阈值处（target = 阈值）的基础成功率起点。 */
export const ENHANCEMENT_HIGH_LEVEL_BASE_SUCCESS_RATE = 0.3;

/** 高等级强化阈值之后，每高 1 级基础成功率乘以的衰减系数 = 1 − 该值；指数衰减不归零。 */
export const ENHANCEMENT_HIGH_LEVEL_DECAY_PER_LEVEL = 0.05;

/** 高等级强化基础成功率下限：指数衰减永不归零，但工程上需要明确底板，避免概率落到肉眼归零。 */
export const ENHANCEMENT_HIGH_LEVEL_MIN_SUCCESS_RATE = 0.01;

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

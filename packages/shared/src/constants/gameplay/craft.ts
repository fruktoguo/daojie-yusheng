/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 制作与炼丹系统常量。
 */

/** 制作技能经验 tick 除数 */
export const CRAFT_SKILL_EXP_TICK_DIVISOR = 3600;

/** 制作技能等级衰减率 */
export const CRAFT_SKILL_LEVEL_DECAY_RATE = 0.95;

/** 制作失败时经验获取比率 */
export const CRAFT_SKILL_FAILURE_EXP_RATE = 0.25;

/** 制作技能经验补偿截止等级 */
export const CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL = 20;

/** 炼丹预设最大数量 */
export const ALCHEMY_MAX_PRESET_COUNT = 24;

/** 兼容旧存档字段；炼丹/炼器不再有玩家可见准备阶段。 */
export const ALCHEMY_PREPARATION_TICKS = 0;

/** 丹炉单次产出数量 */
export const ALCHEMY_FURNACE_OUTPUT_COUNT = 6;

/** 法宝炼制基础成功率系数：五行完全匹配时基础成功率也只有 10%。 */
export const ARTIFACT_CRAFT_BASE_SUCCESS_RATE = 0.1;

// ─── 挖矿技艺 ───────────────────────────────────────────────────────────────

/** 挖矿每级对地块伤害提升比率（指数底数 1.02，即每级 +2% 复利）。 */
export const MINING_DAMAGE_BONUS_PER_LEVEL = 0.02;

/** 挖矿每级增加的矿物额外概率。 */
export const MINING_DROP_RATE_BONUS_PER_LEVEL = 0.01;

/** 矿物基础爆率对应的单次伤害占地块最大生命比例。 */
export const MINING_DROP_BASE_DAMAGE_MAX_HP_RATIO = 0.001;

/** 矿物所在地图每提升一级提供的独立爆率倍率。 */
export const MINING_DROP_MAP_LEVEL_MULTIPLIER_PER_LEVEL = 1.1;

/** 攻击者境界每高于矿物等级一级时保留的爆率比例。 */
export const MINING_DROP_OVERLEVEL_MULTIPLIER_PER_LEVEL = 0.8;

/** 攻击者境界每低于矿物等级一级时保留的爆率比例。 */
export const MINING_DROP_UNDERLEVEL_MULTIPLIER_PER_LEVEL = 0.9;

/** 单次矿物掉落触发概率上限；超出期望转为随机数量。 */
export const MINING_DROP_MAX_TRIGGER_CHANCE = 0.1;

/** 挖矿经验：每次对矿脉造成伤害视为 0.3 息动作。 */
export const MINING_EXP_BASE_ACTION_TICKS = 0.3;

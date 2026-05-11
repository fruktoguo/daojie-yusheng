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

/** 炼丹准备阶段 tick 数 */
export const ALCHEMY_PREPARATION_TICKS = 10;

/** 丹炉单次产出数量 */
export const ALCHEMY_FURNACE_OUTPUT_COUNT = 6;

// ─── 挖矿技艺 ───────────────────────────────────────────────────────────────

/** 挖矿每级对地块伤害提升比率（指数底数 1.02，即每级 +2% 复利）。 */
export const MINING_DAMAGE_BONUS_PER_LEVEL = 0.02;

/** 挖矿经验：每次对矿脉造成伤害视为 0.3 息动作。 */
export const MINING_EXP_BASE_ACTION_TICKS = 0.3;

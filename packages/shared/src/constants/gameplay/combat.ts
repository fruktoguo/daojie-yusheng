/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 战斗成长与境界压制规则常量。
 */

/** 每境界属性指数成长率 */
export const REALM_ATTRIBUTE_GROWTH_RATE = 0.1;

/** 每境界战斗线性成长率 */
export const REALM_COMBAT_LINEAR_GROWTH_RATE = 0.02;

/** 高境界对低境界的伤害加成率 */
export const REALM_DAMAGE_ADVANTAGE_RATE = 0.2;

/** 低境界对高境界的伤害衰减率 */
export const REALM_DAMAGE_DISADVANTAGE_RATE = 0.2;

/** 战斗经验达到多少倍差距时，命中/闪避优势封顶翻倍 */
export const COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD = 5;

/** 战斗经验比较时附带的基础值，避免低值阶段被零值直接拉满优势 */
export const COMBAT_EXPERIENCE_ADVANTAGE_BASELINE = 100;

/** 普通攻击受战斗经验影响时的总伤害倍率下限 */
export const BASIC_ATTACK_COMBAT_EXPERIENCE_DAMAGE_MULTIPLIER_MIN = 0.5;

/** 普通攻击受战斗经验影响时的总伤害倍率上限（最高 2 倍平 A） */
export const BASIC_ATTACK_COMBAT_EXPERIENCE_DAMAGE_MULTIPLIER_MAX = 2;

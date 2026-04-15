/**
 * 仇恨系统默认常量。
 */

/** 自动索敌每息对范围内目标增加的基础仇恨值。 */
export const DEFAULT_PASSIVE_THREAT_PER_TICK = 1;

/** 默认达到多少仇恨后开始主动追击或攻击。 */
export const DEFAULT_AGGRO_THRESHOLD = 1;

/** 距离仇恨乘区每增加一格的衰减倍率。 */
export const THREAT_DISTANCE_FALLOFF_PER_TILE = 0.9;

/** 目标丢失或死亡后，每息按当前仇恨值衰减的比例。 */
export const LOST_TARGET_THREAT_DECAY_RATIO = 0.1;

/** 目标丢失或死亡后，每息额外按自身最大生命值衰减的比例。 */
export const LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO = 0.01;

/** 单条仇恨记录允许累计的最大值。 */
export const MAX_THREAT_VALUE = 1e15;

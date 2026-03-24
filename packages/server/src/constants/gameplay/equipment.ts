/**
 * 装备效果模块的常量，便于多个服务统一访问。
 */

/** 噬元侵骨 Buff ID。 */
export const SOUL_DEVOUR_EROSION_BUFF_ID = 'equip.soul_devour_erosion';
/** 装备动态效果的 Redis/命名空间前缀 */
export const EQUIP_DYNAMIC_SOURCE_PREFIX = 'equip-effect:';
/** 装备效果运行期状态存储在玩家对象上的符号键 */
export const RUNTIME_STATE_KEY = Symbol('equipment-runtime-states');
/** 装备效果用于追踪最近时间段的符号键 */
export const LAST_TIME_PHASE_KEY = Symbol('equipment-last-time-phase');

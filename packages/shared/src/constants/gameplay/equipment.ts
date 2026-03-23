/**
 * 装备系统通用常量。
 */

/** 装备槽位列表。 */
export const EQUIP_SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory'] as const;

/** 装备槽位整理顺序。 */
export const EQUIP_SLOT_SORT_ORDER = {
  weapon: 0,
  head: 1,
  body: 2,
  legs: 3,
  accessory: 4,
} as const;

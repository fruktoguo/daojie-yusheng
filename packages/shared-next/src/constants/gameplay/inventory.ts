/**
 * 背包与掉落物规则常量。
 */

import type { ItemType } from '../../types';

/** 默认背包容量。 */
export const DEFAULT_INVENTORY_CAPACITY = 200;

/** 地面物品保留时间，单位为息。 */
export const GROUND_ITEM_EXPIRE_TICKS = 7200;

/** 物品类型集合。 */
export const ITEM_TYPES: ItemType[] = ['consumable', 'equipment', 'material', 'quest_item', 'skill_book'];

/** 可直接在背包中使用的物品类型集合。 */
export const ITEM_USABLE_TYPES: ItemType[] = ['consumable', 'skill_book'];

/** 背包整理时的物品类型排序权重。 */
export const ITEM_TYPE_SORT_ORDER: Record<ItemType, number> = {
  equipment: 0,
  consumable: 1,
  material: 2,
  skill_book: 3,
  quest_item: 4,
};

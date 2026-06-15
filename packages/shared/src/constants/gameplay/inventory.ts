/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 背包与掉落物规则常量。
 */

import type { ItemType } from '../../item-runtime-types';

/** 默认背包容量。 */
export const DEFAULT_INVENTORY_CAPACITY = 200;

/** 地面物品保留时间，单位为息。 */
export const GROUND_ITEM_EXPIRE_TICKS = 7200;

/** 瞬回类药品默认共享冷却，单位为息。 */
export const DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS = 60;

/** 物品类型集合。 */
export const ITEM_TYPES: ItemType[] = ['consumable', 'equipment', 'artifact', 'material', 'quest_item', 'skill_book'];

/** 可直接在背包中使用的物品类型集合。 */
export const ITEM_USABLE_TYPES: ItemType[] = ['consumable', 'skill_book'];

/** 背包整理时的物品类型排序权重。 */
export const ITEM_TYPE_SORT_ORDER: Record<ItemType, number> = {
  equipment: 0,
  artifact: 1,
  consumable: 2,
  material: 3,
  skill_book: 4,
  quest_item: 5,
};

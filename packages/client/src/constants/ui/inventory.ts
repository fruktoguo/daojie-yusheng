/**
 * 背包面板相关常量。
 */

import type { ItemType } from '@mud/shared-next';

/** 背包筛选标签的可选值。 */
export type InventoryFilter = 'all' | ItemType;

/** 背包筛选页签定义。 */
export const INVENTORY_FILTER_TABS: Array<{
/**
 * id：ID标识。
 */
 id: InventoryFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'equipment', label: '装备' },
  { id: 'material', label: '材料' },
  { id: 'skill_book', label: '功法书' },
  { id: 'consumable', label: '消耗品' },
  { id: 'quest_item', label: '任务物' },
];

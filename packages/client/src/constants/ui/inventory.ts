/**
 * 背包面板相关常量。
 */

import type { ItemType } from '@mud/shared';
import { t } from '../../ui/i18n';

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
  { id: 'all', label: t('inventory.filter.all', undefined) },
  { id: 'equipment', label: t('inventory.filter.equipment', undefined) },
  { id: 'material', label: t('inventory.filter.material', undefined) },
  { id: 'skill_book', label: t('inventory.filter.skill-book', undefined) },
  { id: 'consumable', label: t('inventory.filter.consumable', undefined) },
  { id: 'quest_item', label: t('inventory.filter.quest-item', undefined) },
];

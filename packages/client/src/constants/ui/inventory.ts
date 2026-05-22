/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
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

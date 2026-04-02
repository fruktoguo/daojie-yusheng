/**
 * 背包面板私有展示常量。
 */

import { ITEM_USABLE_TYPES, type ItemType } from '@mud/shared-next';

/** 背包面板注入浮动提示样式时使用的节点 ID。 */
export const INVENTORY_PANEL_TOOLTIP_STYLE_ID = 'inventory-panel-tooltip-style';

/** 可直接在背包内使用的物品类型集合。 */
export const INVENTORY_PANEL_USABLE_ITEM_TYPES: ReadonlySet<ItemType> = new Set(ITEM_USABLE_TYPES);

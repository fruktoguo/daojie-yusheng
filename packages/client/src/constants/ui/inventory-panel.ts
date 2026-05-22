/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 背包面板私有展示常量。
 */

import { ITEM_USABLE_TYPES, type ItemType } from '@mud/shared';

/** 背包面板注入浮动提示样式时使用的节点 ID。 */
export const INVENTORY_PANEL_TOOLTIP_STYLE_ID = 'inventory-panel-tooltip-style';

/** 可直接在背包内使用的物品类型集合。 */
export const INVENTORY_PANEL_USABLE_ITEM_TYPES: ReadonlySet<ItemType> = new Set(ITEM_USABLE_TYPES);

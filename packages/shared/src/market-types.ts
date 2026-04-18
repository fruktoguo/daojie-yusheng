/**
 * 坊市共享类型：承接订单、盘口、成交记录与托管仓视图。
 */
import type { ItemStack } from './item-runtime-types';

/** 坊市订单方向 */
export type MarketOrderSide = 'buy' | 'sell';

/** 坊市订单状态 */
export type MarketOrderStatus = 'open' | 'filled' | 'cancelled';

/** 坊市托管仓 */
export interface MarketStorage {
  items: ItemStack[];
}

/** 坊市列表里的物品摘要 */
export interface MarketListedItemView {
  itemKey: string;
  item: ItemStack;
  sellOrderCount: number;
  sellQuantity: number;
  lowestSellPrice?: number;
  buyOrderCount: number;
  buyQuantity: number;
  highestBuyPrice?: number;
}

/** 坊市盘口价位 */
export interface MarketPriceLevelView {
  unitPrice: number;
  quantity: number;
  orderCount: number;
}

/** 坊市单个物品盘口 */
export interface MarketOrderBookView {
  itemKey: string;
  item: ItemStack;
  sells: MarketPriceLevelView[];
  buys: MarketPriceLevelView[];
}

/** 玩家视角下的坊市成交记录方向 */
export type MarketTradeHistorySide = 'buy' | 'sell';

/** 玩家可见的坊市成交记录 */
export interface MarketTradeHistoryEntryView {
  id: string;
  side: MarketTradeHistorySide;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  createdAt: number;
}

/** 玩家可见的坊市自有订单 */
export interface MarketOwnOrderView {
  id: string;
  side: MarketOrderSide;
  status: MarketOrderStatus;
  itemKey: string;
  item: ItemStack;
  remainingQuantity: number;
  unitPrice: number;
  createdAt: number;
}

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
/**
 * items：MarketStorage 内部字段。
 */

  items: ItemStack[];
}

/** 坊市列表里的物品摘要 */
export interface MarketListedItemView {
/**
 * itemKey：MarketListedItemView 内部字段。
 */

  itemKey: string;  
  /**
 * item：MarketListedItemView 内部字段。
 */

  item: ItemStack;  
  /**
 * sellOrderCount：MarketListedItemView 内部字段。
 */

  sellOrderCount: number;  
  /**
 * sellQuantity：MarketListedItemView 内部字段。
 */

  sellQuantity: number;  
  /**
 * lowestSellPrice：MarketListedItemView 内部字段。
 */

  lowestSellPrice?: number;  
  /**
 * buyOrderCount：MarketListedItemView 内部字段。
 */

  buyOrderCount: number;  
  /**
 * buyQuantity：MarketListedItemView 内部字段。
 */

  buyQuantity: number;  
  /**
 * highestBuyPrice：MarketListedItemView 内部字段。
 */

  highestBuyPrice?: number;
}

/** 坊市盘口价位 */
export interface MarketPriceLevelView {
/**
 * unitPrice：MarketPriceLevelView 内部字段。
 */

  unitPrice: number;  
  /**
 * quantity：MarketPriceLevelView 内部字段。
 */

  quantity: number;  
  /**
 * orderCount：MarketPriceLevelView 内部字段。
 */

  orderCount: number;
}

/** 坊市单个物品盘口 */
export interface MarketOrderBookView {
/**
 * itemKey：MarketOrderBookView 内部字段。
 */

  itemKey: string;  
  /**
 * item：MarketOrderBookView 内部字段。
 */

  item: ItemStack;  
  /**
 * sells：MarketOrderBookView 内部字段。
 */

  sells: MarketPriceLevelView[];  
  /**
 * buys：MarketOrderBookView 内部字段。
 */

  buys: MarketPriceLevelView[];
}

/** 玩家视角下的坊市成交记录方向 */
export type MarketTradeHistorySide = 'buy' | 'sell';

/** 玩家可见的坊市成交记录 */
export interface MarketTradeHistoryEntryView {
/**
 * id：MarketTradeHistoryEntryView 内部字段。
 */

  id: string;  
  /**
 * side：MarketTradeHistoryEntryView 内部字段。
 */

  side: MarketTradeHistorySide;  
  /**
 * itemId：MarketTradeHistoryEntryView 内部字段。
 */

  itemId: string;  
  /**
 * itemName：MarketTradeHistoryEntryView 内部字段。
 */

  itemName: string;  
  /**
 * quantity：MarketTradeHistoryEntryView 内部字段。
 */

  quantity: number;  
  /**
 * unitPrice：MarketTradeHistoryEntryView 内部字段。
 */

  unitPrice: number;  
  /**
 * createdAt：MarketTradeHistoryEntryView 内部字段。
 */

  createdAt: number;
}

/** 玩家可见的坊市自有订单 */
export interface MarketOwnOrderView {
/**
 * id：MarketOwnOrderView 内部字段。
 */

  id: string;  
  /**
 * side：MarketOwnOrderView 内部字段。
 */

  side: MarketOrderSide;  
  /**
 * status：MarketOwnOrderView 内部字段。
 */

  status: MarketOrderStatus;  
  /**
 * itemKey：MarketOwnOrderView 内部字段。
 */

  itemKey: string;  
  /**
 * item：MarketOwnOrderView 内部字段。
 */

  item: ItemStack;  
  /**
 * remainingQuantity：MarketOwnOrderView 内部字段。
 */

  remainingQuantity: number;  
  /**
 * unitPrice：MarketOwnOrderView 内部字段。
 */

  unitPrice: number;  
  /**
 * createdAt：MarketOwnOrderView 内部字段。
 */

  createdAt: number;
}

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
 * items：集合字段。
 */

  items: ItemStack[];
}

/** 坊市列表里的物品摘要 */
export interface MarketListedItemView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * sellOrderCount：数量或计量字段。
 */

  sellOrderCount: number;  
  /**
 * sellQuantity：sellQuantity相关字段。
 */

  sellQuantity: number;  
  /**
 * lowestSellPrice：lowestSell价格数值。
 */

  lowestSellPrice?: number;  
  /**
 * buyOrderCount：数量或计量字段。
 */

  buyOrderCount: number;  
  /**
 * buyQuantity：buyQuantity相关字段。
 */

  buyQuantity: number;  
  /**
 * highestBuyPrice：highestBuy价格数值。
 */

  highestBuyPrice?: number;
}

/** 坊市盘口价位 */
export interface MarketPriceLevelView {
/**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;  
  /**
 * orderCount：数量或计量字段。
 */

  orderCount: number;
}

/** 坊市单个物品盘口 */
export interface MarketOrderBookView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * sells：sell相关字段。
 */

  sells: MarketPriceLevelView[];  
  /**
 * buys：buy相关字段。
 */

  buys: MarketPriceLevelView[];
}

/** 玩家视角下的坊市成交记录方向 */
export type MarketTradeHistorySide = 'buy' | 'sell';

/** 玩家可见的坊市成交记录 */
export interface MarketTradeHistoryEntryView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * side：side相关字段。
 */

  side: MarketTradeHistorySide;  
  /**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * itemName：道具名称名称或显示文本。
 */

  itemName: string;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;  
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;
}

/** 玩家可见的坊市自有订单 */
export interface MarketOwnOrderView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * side：side相关字段。
 */

  side: MarketOrderSide;  
  /**
 * status：statu状态或数据块。
 */

  status: MarketOrderStatus;  
  /**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * remainingQuantity：remainingQuantity相关字段。
 */

  remainingQuantity: number;  
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;
}

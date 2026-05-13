/**
 * 坊市共享类型：承接订单、盘口、成交记录与托管仓视图。
 */
import type { TechniqueCategory } from './cultivation-types';
import type { EquipSlot, ItemStack, ItemType } from './item-runtime-types';

/** 坊市订单方向 */
export type MarketOrderSide = 'buy' | 'sell';

/** 坊市订单状态 */
export type MarketOrderStatus = 'open' | 'filled' | 'cancelled';
/** 拍卖行分栏 */
export type AuctionHouseTab = 'participate' | 'mine';
/** 拍卖行展示状态 */
export type AuctionLotStatus = 'active' | 'consigning' | 'sold' | 'failed';
/** 拍卖行道具二级分类。 */
export type AuctionListingSubType = EquipSlot | TechniqueCategory | 'herb' | 'special' | 'other';

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
/** 成交记录来源：普通坊市成交或拍卖行成交。 */
export type MarketTradeSource = 'market' | 'auction';

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
 * source：成交来源。
 */

  source: MarketTradeSource;
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

/** 拍卖行分页分类计数。 */
export interface AuctionListingCountsView {
/**
 * categoryCounts：主分类数量。
 */

  categoryCounts: Partial<Record<ItemType | 'all', number>>;
}

/** 拍卖行顶部摘要，只保留当前界面需要的轻量统计。 */
export interface AuctionListingSummaryView {
/**
 * activeLots：正在拍卖数量。
 */

  activeLots: number;
  /**
 * buyoutLots：可一口价数量。
 */

  buyoutLots: number;
  /**
 * totalCurrentPrice：当前页可见拍品当前价合计。
 */

  totalCurrentPrice: number;
  /**
 * myBidCount：我的求购竞价数量。
 */

  myBidCount: number;
  /**
 * myConsignments：我的寄拍数量。
 */

  myConsignments: number;
  /**
 * consigningLots：寄拍中数量。
 */

  consigningLots: number;
  /**
 * soldLots：我的寄拍已成交数量。
 */

  soldLots?: number;
  /**
 * failedLots：我的寄拍流拍数量。
 */

  failedLots?: number;
  /**
 * storageCount：坊市托管仓物品数量。
 */

  storageCount: number;
}

/** 拍卖行分页中的单个拍品摘要。 */
export interface AuctionBidRecordView {
/**
 * bidderLabel：出价人展示名。
 */

  bidderLabel: string;
  /**
 * unitPrice：出价价格。
 */

  unitPrice: number;
  /**
 * createdAtMs：出价时间戳。
 */

  createdAtMs: number;
}

/** 拍卖行分页中的单个拍品摘要。 */
export interface AuctionLotPageEntry {
/**
 * id：拍品行 ID。
 */

  id: string;
  /**
 * itemKey：客户端使用的坊市条目 key。
 */

  itemKey: string;
  /**
 * item：服务端投影的轻量预览物品。
 */

  item?: ItemStack;
  /**
 * itemId：道具 ID。
 */

  itemId: string;
  /**
 * itemType：道具大类。
 */

  itemType: ItemType;
  /**
 * itemSubType：道具二级分类。
 */

  itemSubType?: AuctionListingSubType;
  /**
 * enhanceLevel：强化等级。
 */

  enhanceLevel?: number;
  /**
 * currentPrice：当前价。
 */

  currentPrice: number;
  /**
 * buyoutPrice：一口价，没有卖盘时为空。
 */

  buyoutPrice?: number | null;
  /**
 * bidCount：出价档位数量。
 */

  bidCount: number;
  /**
 * bids：当前页拍品的轻量出价记录。
 */

  bids?: AuctionBidRecordView[];
  /**
 * startAtMs：拍卖展示开始时间。
 */

  startAtMs: number;
  /**
 * durationSeconds：拍卖展示持续秒数。
 */

  durationSeconds: number;
  /**
 * status：展示状态。
 */

  status: AuctionLotStatus;
  /**
 * statusLabel：展示状态文案。
 */

  statusLabel: string;
  /**
 * sellerLabel：寄拍来源摘要。
 */

  sellerLabel: string;
  /**
 * lotNo：短编号。
 */

  lotNo: string;
  /**
 * heat：排序热度。
 */

  heat: number;
  /**
 * remainingQuantity：剩余数量。
 */

  remainingQuantity?: number;
  /**
 * orderId：我的寄拍对应订单 ID。
 */

  orderId?: string;
  /**
 * orderSide：我的寄拍对应订单方向。
 */

  orderSide?: MarketOrderSide;
}

export type AuctionFilterCategory = ItemType | 'all';
export type AuctionFilterSubType = AuctionListingSubType | 'all';

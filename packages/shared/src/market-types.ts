/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 坊市共享类型：承接订单、盘口、成交记录与托管仓视图。
 */
import type { TechniqueCategory, TechniqueGrade } from './cultivation-types';
import type { EquipSlot, ItemStack, ItemType } from './item-runtime-types';

/** 坊市订单方向 */
export type MarketOrderSide = 'buy' | 'sell';

/** 坊市订单状态 */
export type MarketOrderStatus = 'open' | 'filled' | 'cancelled';
/** 拍卖行分栏 */
export type AuctionHouseTab = 'participate' | 'mine' | 'history';
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
/** 成交记录来源：普通坊市成交、拍卖行成交或传法台成交。 */
export type MarketTradeSource = 'market' | 'auction' | 'transmission';

/** 把任意输入归一化成合法的成交来源，未知值一律退回普通坊市。 */
export function normalizeMarketTradeSource(value: unknown): MarketTradeSource {
  return value === 'auction' || value === 'transmission' ? value : 'market';
}
/** 成交记录范围：全服共享最近记录或玩家自己的记录。 */
export type MarketTradeHistoryScope = 'all' | 'mine';

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
 * counterpartyLabel：对手方玩家名。
 */

  counterpartyLabel?: string;
  /**
 * buyerLabel：买家玩家名，全服成交记录使用。
 */

  buyerLabel?: string;
  /**
 * sellerLabel：卖家玩家名，全服成交记录使用。
 */

  sellerLabel?: string;
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

/** 传法台分栏：可求取的寄售，或自己寄售中的功法残卷。 */
export type TransmissionTab = 'participate' | 'mine';
/** 传法台服务端分页排序。 */
export type TransmissionListingSort = 'price_asc' | 'price_desc' | 'realm_desc' | 'grade_desc' | 'newest';

/** 传法台分页中的单卷功法残卷摘要，一卷一单、一口价。 */
export interface TransmissionLotPageEntry {
  /** 拍品行 ID，等同 itemKey。 */
  id: string;
  /** 客户端使用的传法台条目 key。 */
  itemKey: string;
  /** 服务端投影的轻量预览物品，带 learnTechniqueId 供悬浮详情展示功法。 */
  item?: ItemStack;
  /** 道具 ID，恒为自创功法残卷。 */
  itemId: string;
  /** 道具主分类。 */
  itemType: ItemType;
  /** 功法子分类。 */
  itemSubType?: AuctionListingSubType;
  /** 功法名称；服务端从自创功法模板投影，避免客户端先取详情才能展示。 */
  techniqueName: string;
  /** 功法类别；模板缺失时不伪造分类。 */
  techniqueCategory?: TechniqueCategory;
  /** 功法品阶；模板缺失时回退到残卷实例字段。 */
  techniqueGrade?: TechniqueGrade;
  /** 功法要求境界等级。 */
  techniqueRealmLv?: number;
  /** 一口价售价。 */
  price: number;
  /** 传法者标签，默认匿名。 */
  sellerLabel: string;
  /** 是否是自己的寄售。 */
  isMine: boolean;
  /** 剩余数量。 */
  remainingQuantity: number;
  /** 寄售时间戳。 */
  createdAt: number;
  /** 订单 ID；仅自己的寄售会在客户端显示撤回入口。 */
  orderId: string;
}

/** 传法台分栏计数。 */
export interface TransmissionListingCountsView {
  participate: number;
  mine: number;
  /** 当前分栏在搜索条件下的功法分类计数。 */
  categoryCounts: Partial<Record<TechniqueCategory | 'all', number>>;
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

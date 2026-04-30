import type { AccountRedeemCodesRes } from './api-contracts';
import type { AlchemyRecipeCatalogEntry, SyncedAlchemyPanelState, SyncedEnhancementPanelState } from './crafting-types';
import type { ObservedTileEntityDetail } from './detail-view-types';
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView } from './market-types';
import type { MailDetailView, MailPageView, MailSummaryView } from './mail-types';
import type { QuestRuntimeStateView } from './quest-types';
import type { Suggestion } from './world-view-types';
import type { EquipSlot, ItemType } from './item-runtime-types';
import type { TechniqueCategory } from './cultivation-types';
import type { InventorySlotUpdateEntry, EquipmentSlotUpdateEntry, MarketListingPageEntry, MarketOwnOrderSyncEntry, MarketStorageSyncEntry, SyncedInventoryCooldownState, SyncedInventorySnapshot, SyncedLootWindowState, SyncedNpcShopView } from './synced-panel-types';

/** 战利品窗口更新视图。 */
export interface LootWindowUpdateView {
/**
 * window：窗口相关字段。
 */

  window: SyncedLootWindowState | null;
}

/** 兑换码结果视图。 */
export interface RedeemCodesResultView {
/**
 * result：结果相关字段。
 */

  result: AccountRedeemCodesRes;
}

/** 背包面板更新视图。 */
export interface InventoryUpdateView {
/**
 * inventory：背包相关字段。
 */

  inventory?: SyncedInventorySnapshot;  
  /**
 * capacity：capacity相关字段。
 */

  capacity?: number;  
  /**
 * size：数量或计量字段。
 */

  size?: number;  
  /**
 * slots：slot相关字段。
 */

  slots?: InventorySlotUpdateEntry[];  
  /**
 * cooldowns：冷却相关字段。
 */

  cooldowns?: SyncedInventoryCooldownState[];  
  /**
 * serverTick：servertick相关字段。
 */

  serverTick?: number;
}

/** 装备面板更新视图。 */
export interface EquipmentUpdateView {
/**
 * slots：slot相关字段。
 */

  slots: EquipmentSlotUpdateEntry[];
}

/** 坊市首页同步视图。 */
export interface MarketUpdateView {
/**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;  
  /**
 * listedItems：列表占位字段；完整盘面统一走 MarketListings 分页通道。
 */

  listedItems: MarketListedItemView[];  
  /**
 * myOrders：my订单相关字段。
 */

  myOrders: MarketOwnOrderView[];  
  /**
 * storage：storage相关字段。
 */

  storage: MarketStorage;
}

/** 坊市分页分类计数，按服务端分页分组口径统计。 */
export interface MarketListingCountsView {
/**
 * categoryCounts：主分类数量。
 */

  categoryCounts: Partial<Record<ItemType | 'all', number>>;
  /**
 * equipmentSlotCounts：装备部位数量。
 */

  equipmentSlotCounts: Partial<Record<EquipSlot | 'all', number>>;
  /**
 * techniqueCategoryCounts：功法书分类数量。
 */

  techniqueCategoryCounts: Partial<Record<TechniqueCategory | 'all', number>>;
}

/** 坊市分页列表视图。 */
export interface MarketListingsView {
/**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;  
  /**
 * page：page相关字段。
 */

  page: number;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize: number;  
  /**
 * total：数量或计量字段。
 */

  total: number;  
  /**
 * category：category相关字段。
 */

  category: ItemType | 'all';  
  /**
 * equipmentSlot：装备Slot相关字段。
 */

  equipmentSlot: EquipSlot | 'all';  
  /**
 * techniqueCategory：功法Category相关字段。
 */

  techniqueCategory: TechniqueCategory | 'all';  
  /**
 * counts：当前坊市全局分类数量。
 */

  counts?: MarketListingCountsView;
  /**
 * items：集合字段。
 */

  items: MarketListingPageEntry[];
}

/** 坊市订单列表视图。 */
export interface MarketOrdersView {
/**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;  
  /**
 * orders：订单相关字段。
 */

  orders: MarketOwnOrderSyncEntry[];
}

/** 坊市寄存仓库视图。 */
export interface MarketStorageView {
/**
 * items：集合字段。
 */

  items: MarketStorageSyncEntry[];
}

/** 坊市订单簿视图。 */
export interface MarketItemBookView {
/**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;  
  /**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * book：book相关字段。
 */

  book: MarketOrderBookView | null;
}

/** 坊市成交历史视图。 */
export interface MarketTradeHistoryView {
/**
 * page：page相关字段。
 */

  page: number;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize: number;  
  /**
 * totalVisible：total可见相关字段。
 */

  totalVisible: number;  
  /**
 * records：record相关字段。
 */

  records: MarketTradeHistoryEntryView[];
}

/** NPC 商店同步视图。 */
export interface NpcShopSyncView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * shop：shop相关字段。
 */

  shop: SyncedNpcShopView | null;  
  /**
 * error：error相关字段。
 */

  error?: string;
}

/** 炼制面板同步视图。 */
export interface AlchemyPanelSyncView {
/**
 * state：状态状态或数据块。
 */

  state: SyncedAlchemyPanelState | null;  
  /**
 * catalogVersion：目录Version相关字段。
 */

  catalogVersion: number;  
  /**
 * catalog：目录相关字段。
 */

  catalog?: AlchemyRecipeCatalogEntry[];  
  /**
 * error：error相关字段。
 */

  error?: string;
}

/** 强化面板同步视图。 */
export interface EnhancementPanelSyncView {
/**
 * state：状态状态或数据块。
 */

  state: SyncedEnhancementPanelState | null;  
  /**
 * error：error相关字段。
 */

  error?: string;
}

/** NPC 可接任务列表视图。 */
export interface NpcQuestsView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * npcName：NPC名称名称或显示文本。
 */

  npcName: string;  
  /**
 * quests：集合字段。
 */

  quests: QuestRuntimeStateView[];
}

/** 地块运行时资源项视图。 */
export interface TileRuntimeResourceView {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * effectiveValue：effective值数值。
 */

  effectiveValue?: number;  
  /**
 * level：等级数值。
 */

  level?: number;  
  /**
 * sourceValue：来源值数值。
 */

  sourceValue?: number;
}

/** 地块运行时详情视图。 */
export interface TileRuntimeDetailView {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * destroyed：destroyed相关字段。
 */

  destroyed?: boolean;  
  /**
 * restoreTicksLeft：restoretickLeft相关字段。
 */

  restoreTicksLeft?: number;  
  /**
 * resources：resource相关字段。
 */

  resources: TileRuntimeResourceView[];  
  /**
 * entities：entity相关字段。
 */

  entities?: ObservedTileEntityDetail[];
}

/** 任务列表更新视图。 */
export interface QuestUpdateView {
/**
 * quests：集合字段。
 */

  quests: QuestRuntimeStateView[];
}

/** 邮件摘要同步视图。 */
export interface MailSummarySyncView {
/**
 * summary：摘要状态或数据块。
 */

  summary: MailSummaryView;
}

/** 邮件分页同步视图。 */
export interface MailPageSyncView {
/**
 * page：page相关字段。
 */

  page: MailPageView;
}

/** 邮件详情同步视图。 */
export interface MailDetailSyncView {
/**
 * detail：详情状态或数据块。
 */

  detail: MailDetailView | null;  
  /**
 * error：error相关字段。
 */

  error?: string;
}

/** 邮件操作结果视图。 */
export interface MailOpResultView {
/**
 * operation：operation相关字段。
 */

  operation: 'markRead' | 'claim' | 'delete';  
  /**
 * ok：ok相关字段。
 */

  ok: boolean;  
  /**
 * mailIds：邮件ID相关字段。
 */

  mailIds: string[];  
  /**
 * message：message相关字段。
 */

  message?: string;
}

/** 建议面板同步视图。 */
export interface SuggestionUpdateView {
/**
 * suggestions：suggestion相关字段。
 */

  suggestions: Suggestion[];
}

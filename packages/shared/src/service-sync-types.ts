import type { AccountRedeemCodesRes } from './api-contracts';
import type { AlchemyRecipeCatalogEntry, SyncedAlchemyPanelState, SyncedEnhancementPanelState } from './crafting-types';
import type { ObservedTileEntityDetail } from './detail-view-types';
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView } from './market-types';
import type { MailDetailView, MailPageView, MailSummaryView } from './mail-types';
import type { QuestState } from './quest-types';
import type { Suggestion } from './world-view-types';
import type { EquipSlot, ItemType } from './item-runtime-types';
import type { TechniqueCategory } from './cultivation-types';
import type { InventorySlotUpdateEntry, EquipmentSlotUpdateEntry, MarketListingPageEntry, MarketOwnOrderSyncEntry, MarketStorageSyncEntry, SyncedInventoryCooldownState, SyncedInventorySnapshot, SyncedLootWindowState, SyncedNpcShopView } from './synced-panel-types';

/** 战利品窗口更新视图。 */
export interface LootWindowUpdateView {
/**
 * window：LootWindowUpdateView 内部字段。
 */

  window: SyncedLootWindowState | null;
}

/** 兑换码结果视图。 */
export interface RedeemCodesResultView {
/**
 * result：RedeemCodesResultView 内部字段。
 */

  result: AccountRedeemCodesRes;
}

/** 背包面板更新视图。 */
export interface InventoryUpdateView {
/**
 * inventory：InventoryUpdateView 内部字段。
 */

  inventory?: SyncedInventorySnapshot;  
  /**
 * capacity：InventoryUpdateView 内部字段。
 */

  capacity?: number;  
  /**
 * size：InventoryUpdateView 内部字段。
 */

  size?: number;  
  /**
 * slots：InventoryUpdateView 内部字段。
 */

  slots?: InventorySlotUpdateEntry[];  
  /**
 * cooldowns：InventoryUpdateView 内部字段。
 */

  cooldowns?: SyncedInventoryCooldownState[];  
  /**
 * serverTick：InventoryUpdateView 内部字段。
 */

  serverTick?: number;
}

/** 装备面板更新视图。 */
export interface EquipmentUpdateView {
/**
 * slots：EquipmentUpdateView 内部字段。
 */

  slots: EquipmentSlotUpdateEntry[];
}

/** 坊市首页同步视图。 */
export interface MarketUpdateView {
/**
 * currencyItemId：MarketUpdateView 内部字段。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：MarketUpdateView 内部字段。
 */

  currencyItemName: string;  
  /**
 * listedItems：MarketUpdateView 内部字段。
 */

  listedItems: MarketListedItemView[];  
  /**
 * myOrders：MarketUpdateView 内部字段。
 */

  myOrders: MarketOwnOrderView[];  
  /**
 * storage：MarketUpdateView 内部字段。
 */

  storage: MarketStorage;
}

/** 坊市分页列表视图。 */
export interface MarketListingsView {
/**
 * currencyItemId：MarketListingsView 内部字段。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：MarketListingsView 内部字段。
 */

  currencyItemName: string;  
  /**
 * page：MarketListingsView 内部字段。
 */

  page: number;  
  /**
 * pageSize：MarketListingsView 内部字段。
 */

  pageSize: number;  
  /**
 * total：MarketListingsView 内部字段。
 */

  total: number;  
  /**
 * category：MarketListingsView 内部字段。
 */

  category: ItemType | 'all';  
  /**
 * equipmentSlot：MarketListingsView 内部字段。
 */

  equipmentSlot: EquipSlot | 'all';  
  /**
 * techniqueCategory：MarketListingsView 内部字段。
 */

  techniqueCategory: TechniqueCategory | 'all';  
  /**
 * items：MarketListingsView 内部字段。
 */

  items: MarketListingPageEntry[];
}

/** 坊市订单列表视图。 */
export interface MarketOrdersView {
/**
 * currencyItemId：MarketOrdersView 内部字段。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：MarketOrdersView 内部字段。
 */

  currencyItemName: string;  
  /**
 * orders：MarketOrdersView 内部字段。
 */

  orders: MarketOwnOrderSyncEntry[];
}

/** 坊市寄存仓库视图。 */
export interface MarketStorageView {
/**
 * items：MarketStorageView 内部字段。
 */

  items: MarketStorageSyncEntry[];
}

/** 坊市订单簿视图。 */
export interface MarketItemBookView {
/**
 * currencyItemId：MarketItemBookView 内部字段。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：MarketItemBookView 内部字段。
 */

  currencyItemName: string;  
  /**
 * itemKey：MarketItemBookView 内部字段。
 */

  itemKey: string;  
  /**
 * book：MarketItemBookView 内部字段。
 */

  book: MarketOrderBookView | null;
}

/** 坊市成交历史视图。 */
export interface MarketTradeHistoryView {
/**
 * page：MarketTradeHistoryView 内部字段。
 */

  page: number;  
  /**
 * pageSize：MarketTradeHistoryView 内部字段。
 */

  pageSize: number;  
  /**
 * totalVisible：MarketTradeHistoryView 内部字段。
 */

  totalVisible: number;  
  /**
 * records：MarketTradeHistoryView 内部字段。
 */

  records: MarketTradeHistoryEntryView[];
}

/** NPC 商店同步视图。 */
export interface NpcShopSyncView {
/**
 * npcId：NpcShopSyncView 内部字段。
 */

  npcId: string;  
  /**
 * shop：NpcShopSyncView 内部字段。
 */

  shop: SyncedNpcShopView | null;  
  /**
 * error：NpcShopSyncView 内部字段。
 */

  error?: string;
}

/** 炼制面板同步视图。 */
export interface AlchemyPanelSyncView {
/**
 * state：AlchemyPanelSyncView 内部字段。
 */

  state: SyncedAlchemyPanelState | null;  
  /**
 * catalogVersion：AlchemyPanelSyncView 内部字段。
 */

  catalogVersion: number;  
  /**
 * catalog：AlchemyPanelSyncView 内部字段。
 */

  catalog?: AlchemyRecipeCatalogEntry[];  
  /**
 * error：AlchemyPanelSyncView 内部字段。
 */

  error?: string;
}

/** 强化面板同步视图。 */
export interface EnhancementPanelSyncView {
/**
 * state：EnhancementPanelSyncView 内部字段。
 */

  state: SyncedEnhancementPanelState | null;  
  /**
 * error：EnhancementPanelSyncView 内部字段。
 */

  error?: string;
}

/** NPC 可接任务列表视图。 */
export interface NpcQuestsView {
/**
 * npcId：NpcQuestsView 内部字段。
 */

  npcId: string;  
  /**
 * npcName：NpcQuestsView 内部字段。
 */

  npcName: string;  
  /**
 * quests：NpcQuestsView 内部字段。
 */

  quests: QuestState[];
}

/** 地块运行时资源项视图。 */
export interface TileRuntimeResourceView {
/**
 * key：TileRuntimeResourceView 内部字段。
 */

  key: string;  
  /**
 * label：TileRuntimeResourceView 内部字段。
 */

  label: string;  
  /**
 * value：TileRuntimeResourceView 内部字段。
 */

  value: number;  
  /**
 * effectiveValue：TileRuntimeResourceView 内部字段。
 */

  effectiveValue?: number;  
  /**
 * level：TileRuntimeResourceView 内部字段。
 */

  level?: number;  
  /**
 * sourceValue：TileRuntimeResourceView 内部字段。
 */

  sourceValue?: number;
}

/** 地块运行时详情视图。 */
export interface TileRuntimeDetailView {
/**
 * mapId：TileRuntimeDetailView 内部字段。
 */

  mapId: string;  
  /**
 * x：TileRuntimeDetailView 内部字段。
 */

  x: number;  
  /**
 * y：TileRuntimeDetailView 内部字段。
 */

  y: number;  
  /**
 * hp：TileRuntimeDetailView 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：TileRuntimeDetailView 内部字段。
 */

  maxHp?: number;  
  /**
 * destroyed：TileRuntimeDetailView 内部字段。
 */

  destroyed?: boolean;  
  /**
 * restoreTicksLeft：TileRuntimeDetailView 内部字段。
 */

  restoreTicksLeft?: number;  
  /**
 * resources：TileRuntimeDetailView 内部字段。
 */

  resources: TileRuntimeResourceView[];  
  /**
 * entities：TileRuntimeDetailView 内部字段。
 */

  entities?: ObservedTileEntityDetail[];
}

/** 任务列表更新视图。 */
export interface QuestUpdateView {
/**
 * quests：QuestUpdateView 内部字段。
 */

  quests: QuestState[];
}

/** 邮件摘要同步视图。 */
export interface MailSummarySyncView {
/**
 * summary：MailSummarySyncView 内部字段。
 */

  summary: MailSummaryView;
}

/** 邮件分页同步视图。 */
export interface MailPageSyncView {
/**
 * page：MailPageSyncView 内部字段。
 */

  page: MailPageView;
}

/** 邮件详情同步视图。 */
export interface MailDetailSyncView {
/**
 * detail：MailDetailSyncView 内部字段。
 */

  detail: MailDetailView | null;  
  /**
 * error：MailDetailSyncView 内部字段。
 */

  error?: string;
}

/** 邮件操作结果视图。 */
export interface MailOpResultView {
/**
 * operation：MailOpResultView 内部字段。
 */

  operation: 'markRead' | 'claim' | 'delete';  
  /**
 * ok：MailOpResultView 内部字段。
 */

  ok: boolean;  
  /**
 * mailIds：MailOpResultView 内部字段。
 */

  mailIds: string[];  
  /**
 * message：MailOpResultView 内部字段。
 */

  message?: string;
}

/** 建议面板同步视图。 */
export interface SuggestionUpdateView {
/**
 * suggestions：SuggestionUpdateView 内部字段。
 */

  suggestions: Suggestion[];
}

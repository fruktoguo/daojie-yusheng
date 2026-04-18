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
  window: SyncedLootWindowState | null;
}

/** 兑换码结果视图。 */
export interface RedeemCodesResultView {
  result: AccountRedeemCodesRes;
}

/** 背包面板更新视图。 */
export interface InventoryUpdateView {
  inventory?: SyncedInventorySnapshot;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
  cooldowns?: SyncedInventoryCooldownState[];
  serverTick?: number;
}

/** 装备面板更新视图。 */
export interface EquipmentUpdateView {
  slots: EquipmentSlotUpdateEntry[];
}

/** 坊市首页同步视图。 */
export interface MarketUpdateView {
  currencyItemId: string;
  currencyItemName: string;
  listedItems: MarketListedItemView[];
  myOrders: MarketOwnOrderView[];
  storage: MarketStorage;
}

/** 坊市分页列表视图。 */
export interface MarketListingsView {
  currencyItemId: string;
  currencyItemName: string;
  page: number;
  pageSize: number;
  total: number;
  category: ItemType | 'all';
  equipmentSlot: EquipSlot | 'all';
  techniqueCategory: TechniqueCategory | 'all';
  items: MarketListingPageEntry[];
}

/** 坊市订单列表视图。 */
export interface MarketOrdersView {
  currencyItemId: string;
  currencyItemName: string;
  orders: MarketOwnOrderSyncEntry[];
}

/** 坊市寄存仓库视图。 */
export interface MarketStorageView {
  items: MarketStorageSyncEntry[];
}

/** 坊市订单簿视图。 */
export interface MarketItemBookView {
  currencyItemId: string;
  currencyItemName: string;
  itemKey: string;
  book: MarketOrderBookView | null;
}

/** 坊市成交历史视图。 */
export interface MarketTradeHistoryView {
  page: number;
  pageSize: number;
  totalVisible: number;
  records: MarketTradeHistoryEntryView[];
}

/** NPC 商店同步视图。 */
export interface NpcShopSyncView {
  npcId: string;
  shop: SyncedNpcShopView | null;
  error?: string;
}

/** 炼制面板同步视图。 */
export interface AlchemyPanelSyncView {
  state: SyncedAlchemyPanelState | null;
  catalogVersion: number;
  catalog?: AlchemyRecipeCatalogEntry[];
  error?: string;
}

/** 强化面板同步视图。 */
export interface EnhancementPanelSyncView {
  state: SyncedEnhancementPanelState | null;
  error?: string;
}

/** NPC 可接任务列表视图。 */
export interface NpcQuestsView {
  npcId: string;
  npcName: string;
  quests: QuestState[];
}

/** 地块运行时资源项视图。 */
export interface TileRuntimeResourceView {
  key: string;
  label: string;
  value: number;
  effectiveValue?: number;
  level?: number;
  sourceValue?: number;
}

/** 地块运行时详情视图。 */
export interface TileRuntimeDetailView {
  mapId: string;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  destroyed?: boolean;
  restoreTicksLeft?: number;
  resources: TileRuntimeResourceView[];
  entities?: ObservedTileEntityDetail[];
}

/** 任务列表更新视图。 */
export interface QuestUpdateView {
  quests: QuestState[];
}

/** 邮件摘要同步视图。 */
export interface MailSummarySyncView {
  summary: MailSummaryView;
}

/** 邮件分页同步视图。 */
export interface MailPageSyncView {
  page: MailPageView;
}

/** 邮件详情同步视图。 */
export interface MailDetailSyncView {
  detail: MailDetailView | null;
  error?: string;
}

/** 邮件操作结果视图。 */
export interface MailOpResultView {
  operation: 'markRead' | 'claim' | 'delete';
  ok: boolean;
  mailIds: string[];
  message?: string;
}

/** 建议面板同步视图。 */
export interface SuggestionUpdateView {
  suggestions: Suggestion[];
}

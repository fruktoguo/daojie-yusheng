import type { TechniqueCategory, TechniqueGrade } from './cultivation-types';
import type { ConsumableBuffDef, EquipmentEffectDef, EquipSlot, ItemStack, ItemType } from './item-runtime-types';
import type { LootSearchProgressView, LootSourceKind } from './loot-view-types';
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView } from './market-types';

/**
 * 面板与低频同步里复用的轻量视图类型。
 */

/** 轻量物品实例态：只保留实例字段和少量兜底展示信息。 */
export interface SyncedItemStack {
  itemId: string;
  count: number;
  name?: string;
  type?: ItemType;
  desc?: string;
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: EquipSlot;
  equipAttrs?: ItemStack['equipAttrs'];
  equipStats?: ItemStack['equipStats'];
  equipValueStats?: ItemStack['equipValueStats'];
  effects?: EquipmentEffectDef[];
  healAmount?: number;
  healPercent?: number;
  qiPercent?: number;
  cooldown?: number;
  consumeBuffs?: ConsumableBuffDef[];
  tags?: string[];
  enhanceLevel?: number;
  alchemySuccessRate?: number;
  alchemySpeedRate?: number;
  mapUnlockId?: string;
  mapUnlockIds?: string[];
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

/** 背包完整快照。 */
export interface SyncedInventorySnapshot {
  items: SyncedItemStack[];
  capacity: number;
  cooldowns?: SyncedInventoryCooldownState[];
  serverTick?: number;
}

/** 背包物品冷却状态。 */
export interface SyncedInventoryCooldownState {
  itemId: string;
  cooldown: number;
  startedAtTick: number;
}

/** 背包面板局部更新项。 */
export interface InventorySlotUpdateEntry {
  slotIndex: number;
  item: SyncedItemStack | null;
}

/** 装备槽位局部更新项。 */
export interface EquipmentSlotUpdateEntry {
  slot: EquipSlot;
  item: SyncedItemStack | null;
}

/** 背包面板增量视图。 */
export interface PanelInventoryDeltaView {
  r: number;
  full?: 1;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
}

/** 装备面板增量视图。 */
export interface PanelEquipmentDeltaView {
  r: number;
  full?: 1;
  slots: EquipmentSlotUpdateEntry[];
}

/** 战利品窗口里的单条来源视图。 */
export interface SyncedLootWindowItemView {
  itemKey: string;
  item: SyncedItemStack;
}

/** 战利品窗口来源视图。 */
export interface SyncedLootWindowSourceView {
  sourceId: string;
  kind: LootSourceKind;
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
  searchable: boolean;
  search?: LootSearchProgressView;
  items: SyncedLootWindowItemView[];
  emptyText?: string;
}

/** 战利品窗口完整状态。 */
export interface SyncedLootWindowState {
  tileX: number;
  tileY: number;
  title: string;
  sources: SyncedLootWindowSourceView[];
}

/** 坊市分页里某个物品的变体统计。 */
export interface MarketListingVariantEntry {
  itemKey: string;
  item: ItemStack;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
  sellOrderCount: number;
  sellQuantity: number;
  buyOrderCount: number;
  buyQuantity: number;
}

/** 坊市分页里的一条商品摘要。 */
export interface MarketListingPageEntry {
  itemId: string;
  item: ItemStack;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
  canEnhance: boolean;
  variants: MarketListingVariantEntry[];
}

/** 玩家自己的坊市订单条目。 */
export interface MarketOwnOrderSyncEntry {
  id: string;
  side: 'buy' | 'sell';
  status: 'open' | 'filled' | 'cancelled';
  itemKey: string;
  item: ItemStack;
  remainingQuantity: number;
  unitPrice: number;
  createdAt: number;
}

/** 坊市寄存仓库里的单条物品。 */
export interface MarketStorageSyncEntry {
  itemKey: string;
  item: ItemStack;
  count: number;
}

/** NPC 商店里的单条商品视图。 */
export interface SyncedNpcShopItemView {
  itemId: string;
  item: SyncedItemStack;
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** NPC 商店完整视图。 */
export interface SyncedNpcShopView {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: SyncedNpcShopItemView[];
}

export type {
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  MarketTradeHistoryEntryView,
};

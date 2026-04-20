import type { TechniqueCategory, TechniqueGrade } from './cultivation-types';
import type { ConsumableBuffDef, EquipmentEffectDef, EquipSlot, ItemStack, ItemType } from './item-runtime-types';
import type { LootSearchProgressView, LootSourceKind } from './loot-view-types';
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView } from './market-types';

/**
 * 面板与低频同步里复用的轻量视图类型。
 */

/** 轻量物品实例态：只保留实例字段和少量兜底展示信息。 */
export interface SyncedItemStack {
/**
 * itemId：SyncedItemStack 内部字段。
 */

  itemId: string;  
  /**
 * count：SyncedItemStack 内部字段。
 */

  count: number;  
  /**
 * name：SyncedItemStack 内部字段。
 */

  name?: string;  
  /**
 * type：SyncedItemStack 内部字段。
 */

  type?: ItemType;  
  /**
 * desc：SyncedItemStack 内部字段。
 */

  desc?: string;  
  /**
 * groundLabel：SyncedItemStack 内部字段。
 */

  groundLabel?: string;  
  /**
 * grade：SyncedItemStack 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * level：SyncedItemStack 内部字段。
 */

  level?: number;  
  /**
 * equipSlot：SyncedItemStack 内部字段。
 */

  equipSlot?: EquipSlot;  
  /**
 * equipAttrs：SyncedItemStack 内部字段。
 */

  equipAttrs?: ItemStack['equipAttrs'];  
  /**
 * equipStats：SyncedItemStack 内部字段。
 */

  equipStats?: ItemStack['equipStats'];  
  /**
 * equipValueStats：SyncedItemStack 内部字段。
 */

  equipValueStats?: ItemStack['equipValueStats'];  
  /**
 * effects：SyncedItemStack 内部字段。
 */

  effects?: EquipmentEffectDef[];  
  /**
 * healAmount：SyncedItemStack 内部字段。
 */

  healAmount?: number;  
  /**
 * healPercent：SyncedItemStack 内部字段。
 */

  healPercent?: number;  
  /**
 * qiPercent：SyncedItemStack 内部字段。
 */

  qiPercent?: number;  
  /**
 * cooldown：SyncedItemStack 内部字段。
 */

  cooldown?: number;  
  /**
 * consumeBuffs：SyncedItemStack 内部字段。
 */

  consumeBuffs?: ConsumableBuffDef[];  
  /**
 * tags：SyncedItemStack 内部字段。
 */

  tags?: string[];  
  /**
 * enhanceLevel：SyncedItemStack 内部字段。
 */

  enhanceLevel?: number;  
  /**
 * alchemySuccessRate：SyncedItemStack 内部字段。
 */

  alchemySuccessRate?: number;  
  /**
 * alchemySpeedRate：SyncedItemStack 内部字段。
 */

  alchemySpeedRate?: number;  
  /**
 * mapUnlockId：SyncedItemStack 内部字段。
 */

  mapUnlockId?: string;  
  /**
 * mapUnlockIds：SyncedItemStack 内部字段。
 */

  mapUnlockIds?: string[];  
  /**
 * tileAuraGainAmount：SyncedItemStack 内部字段。
 */

  tileAuraGainAmount?: number;  
  /**
 * allowBatchUse：SyncedItemStack 内部字段。
 */

  allowBatchUse?: boolean;
}

/** 背包完整快照。 */
export interface SyncedInventorySnapshot {
/**
 * items：SyncedInventorySnapshot 内部字段。
 */

  items: SyncedItemStack[];  
  /**
 * capacity：SyncedInventorySnapshot 内部字段。
 */

  capacity: number;  
  /**
 * cooldowns：SyncedInventorySnapshot 内部字段。
 */

  cooldowns?: SyncedInventoryCooldownState[];  
  /**
 * serverTick：SyncedInventorySnapshot 内部字段。
 */

  serverTick?: number;
}

/** 背包物品冷却状态。 */
export interface SyncedInventoryCooldownState {
/**
 * itemId：SyncedInventoryCooldownState 内部字段。
 */

  itemId: string;  
  /**
 * cooldown：SyncedInventoryCooldownState 内部字段。
 */

  cooldown: number;  
  /**
 * startedAtTick：SyncedInventoryCooldownState 内部字段。
 */

  startedAtTick: number;
}

/** 背包面板局部更新项。 */
export interface InventorySlotUpdateEntry {
/**
 * slotIndex：InventorySlotUpdateEntry 内部字段。
 */

  slotIndex: number;  
  /**
 * item：InventorySlotUpdateEntry 内部字段。
 */

  item: SyncedItemStack | null;
}

/** 装备槽位局部更新项。 */
export interface EquipmentSlotUpdateEntry {
/**
 * slot：EquipmentSlotUpdateEntry 内部字段。
 */

  slot: EquipSlot;  
  /**
 * item：EquipmentSlotUpdateEntry 内部字段。
 */

  item: SyncedItemStack | null;
}

/** 背包面板增量视图。 */
export interface PanelInventoryDeltaView {
/**
 * r：PanelInventoryDeltaView 内部字段。
 */

  r: number;  
  /**
 * full：PanelInventoryDeltaView 内部字段。
 */

  full?: 1;  
  /**
 * capacity：PanelInventoryDeltaView 内部字段。
 */

  capacity?: number;  
  /**
 * size：PanelInventoryDeltaView 内部字段。
 */

  size?: number;  
  /**
 * slots：PanelInventoryDeltaView 内部字段。
 */

  slots?: InventorySlotUpdateEntry[];
}

/** 装备面板增量视图。 */
export interface PanelEquipmentDeltaView {
/**
 * r：PanelEquipmentDeltaView 内部字段。
 */

  r: number;  
  /**
 * full：PanelEquipmentDeltaView 内部字段。
 */

  full?: 1;  
  /**
 * slots：PanelEquipmentDeltaView 内部字段。
 */

  slots: EquipmentSlotUpdateEntry[];
}

/** 战利品窗口里的单条来源视图。 */
export interface SyncedLootWindowItemView {
/**
 * itemKey：SyncedLootWindowItemView 内部字段。
 */

  itemKey: string;  
  /**
 * item：SyncedLootWindowItemView 内部字段。
 */

  item: SyncedItemStack;
}

/** 战利品窗口来源视图。 */
export interface SyncedLootWindowSourceView {
/**
 * sourceId：SyncedLootWindowSourceView 内部字段。
 */

  sourceId: string;  
  /**
 * kind：SyncedLootWindowSourceView 内部字段。
 */

  kind: LootSourceKind;  
  /**
 * title：SyncedLootWindowSourceView 内部字段。
 */

  title: string;  
  /**
 * desc：SyncedLootWindowSourceView 内部字段。
 */

  desc?: string;  
  /**
 * grade：SyncedLootWindowSourceView 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * searchable：SyncedLootWindowSourceView 内部字段。
 */

  searchable: boolean;  
  /**
 * search：SyncedLootWindowSourceView 内部字段。
 */

  search?: LootSearchProgressView;  
  /**
 * items：SyncedLootWindowSourceView 内部字段。
 */

  items: SyncedLootWindowItemView[];  
  /**
 * emptyText：SyncedLootWindowSourceView 内部字段。
 */

  emptyText?: string;
}

/** 战利品窗口完整状态。 */
export interface SyncedLootWindowState {
/**
 * tileX：SyncedLootWindowState 内部字段。
 */

  tileX: number;  
  /**
 * tileY：SyncedLootWindowState 内部字段。
 */

  tileY: number;  
  /**
 * title：SyncedLootWindowState 内部字段。
 */

  title: string;  
  /**
 * sources：SyncedLootWindowState 内部字段。
 */

  sources: SyncedLootWindowSourceView[];
}

/** 坊市分页里某个物品的变体统计。 */
export interface MarketListingVariantEntry {
/**
 * itemKey：MarketListingVariantEntry 内部字段。
 */

  itemKey: string;  
  /**
 * item：MarketListingVariantEntry 内部字段。
 */

  item: ItemStack;  
  /**
 * lowestSellPrice：MarketListingVariantEntry 内部字段。
 */

  lowestSellPrice?: number;  
  /**
 * highestBuyPrice：MarketListingVariantEntry 内部字段。
 */

  highestBuyPrice?: number;  
  /**
 * sellOrderCount：MarketListingVariantEntry 内部字段。
 */

  sellOrderCount: number;  
  /**
 * sellQuantity：MarketListingVariantEntry 内部字段。
 */

  sellQuantity: number;  
  /**
 * buyOrderCount：MarketListingVariantEntry 内部字段。
 */

  buyOrderCount: number;  
  /**
 * buyQuantity：MarketListingVariantEntry 内部字段。
 */

  buyQuantity: number;
}

/** 坊市分页里的一条商品摘要。 */
export interface MarketListingPageEntry {
/**
 * itemId：MarketListingPageEntry 内部字段。
 */

  itemId: string;  
  /**
 * item：MarketListingPageEntry 内部字段。
 */

  item: ItemStack;  
  /**
 * lowestSellPrice：MarketListingPageEntry 内部字段。
 */

  lowestSellPrice?: number;  
  /**
 * highestBuyPrice：MarketListingPageEntry 内部字段。
 */

  highestBuyPrice?: number;  
  /**
 * canEnhance：MarketListingPageEntry 内部字段。
 */

  canEnhance: boolean;  
  /**
 * variants：MarketListingPageEntry 内部字段。
 */

  variants: MarketListingVariantEntry[];
}

/** 玩家自己的坊市订单条目。 */
export interface MarketOwnOrderSyncEntry {
/**
 * id：MarketOwnOrderSyncEntry 内部字段。
 */

  id: string;  
  /**
 * side：MarketOwnOrderSyncEntry 内部字段。
 */

  side: 'buy' | 'sell';  
  /**
 * status：MarketOwnOrderSyncEntry 内部字段。
 */

  status: 'open' | 'filled' | 'cancelled';  
  /**
 * itemKey：MarketOwnOrderSyncEntry 内部字段。
 */

  itemKey: string;  
  /**
 * item：MarketOwnOrderSyncEntry 内部字段。
 */

  item: ItemStack;  
  /**
 * remainingQuantity：MarketOwnOrderSyncEntry 内部字段。
 */

  remainingQuantity: number;  
  /**
 * unitPrice：MarketOwnOrderSyncEntry 内部字段。
 */

  unitPrice: number;  
  /**
 * createdAt：MarketOwnOrderSyncEntry 内部字段。
 */

  createdAt: number;
}

/** 坊市寄存仓库里的单条物品。 */
export interface MarketStorageSyncEntry {
/**
 * itemKey：MarketStorageSyncEntry 内部字段。
 */

  itemKey: string;  
  /**
 * item：MarketStorageSyncEntry 内部字段。
 */

  item: ItemStack;  
  /**
 * count：MarketStorageSyncEntry 内部字段。
 */

  count: number;
}

/** NPC 商店里的单条商品视图。 */
export interface SyncedNpcShopItemView {
/**
 * itemId：SyncedNpcShopItemView 内部字段。
 */

  itemId: string;  
  /**
 * item：SyncedNpcShopItemView 内部字段。
 */

  item: SyncedItemStack;  
  /**
 * unitPrice：SyncedNpcShopItemView 内部字段。
 */

  unitPrice: number;  
  /**
 * remainingQuantity：SyncedNpcShopItemView 内部字段。
 */

  remainingQuantity?: number;  
  /**
 * stockLimit：SyncedNpcShopItemView 内部字段。
 */

  stockLimit?: number;  
  /**
 * refreshAt：SyncedNpcShopItemView 内部字段。
 */

  refreshAt?: number;
}

/** NPC 商店完整视图。 */
export interface SyncedNpcShopView {
/**
 * npcId：SyncedNpcShopView 内部字段。
 */

  npcId: string;  
  /**
 * npcName：SyncedNpcShopView 内部字段。
 */

  npcName: string;  
  /**
 * dialogue：SyncedNpcShopView 内部字段。
 */

  dialogue: string;  
  /**
 * currencyItemId：SyncedNpcShopView 内部字段。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：SyncedNpcShopView 内部字段。
 */

  currencyItemName: string;  
  /**
 * items：SyncedNpcShopView 内部字段。
 */

  items: SyncedNpcShopItemView[];
}

export type {
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  MarketTradeHistoryEntryView,
};

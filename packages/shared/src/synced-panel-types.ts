import type { TechniqueCategory, TechniqueGrade } from './cultivation-types';
import type { ConsumableBuffDef, EquipmentEffectDef, EquipSlot, ItemStack, ItemType, TileResourceGainDef } from './item-runtime-types';
import type { LootSearchProgressView, LootSourceKind } from './loot-view-types';
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView } from './market-types';

/**
 * 面板与低频同步里复用的轻量视图类型。
 */

/** 轻量物品实例态：只保留实例字段和少量兜底展示信息。 */
export interface SyncedItemStack {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
  /**
 * name：名称名称或显示文本。
 */

  name?: string;
  /**
 * type：type相关字段。
 */

  type?: ItemType;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * groundLabel：groundLabel名称或显示文本。
 */

  groundLabel?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * equipSlot：equipSlot相关字段。
 */

  equipSlot?: EquipSlot;
  /**
 * equipAttrs：equipAttr相关字段。
 */

  equipAttrs?: ItemStack['equipAttrs'];
  /**
 * equipStats：equipStat相关字段。
 */

  equipStats?: ItemStack['equipStats'];
  /**
 * equipValueStats：equip值Stat相关字段。
 */

  equipValueStats?: ItemStack['equipValueStats'];
  /**
 * effects：effect相关字段。
 */

  effects?: EquipmentEffectDef[];
  /**
 * healAmount：数量或计量字段。
 */

  healAmount?: number;
  /**
 * healPercent：healPercent相关字段。
 */

  healPercent?: number;
  /**
 * qiPercent：qiPercent相关字段。
 */

  qiPercent?: number;
  /**
 * cooldown：冷却相关字段。
 */

  cooldown?: number;
  /**
 * consumeBuffs：consumeBuff相关字段。
 */

  consumeBuffs?: ConsumableBuffDef[];
  /**
 * tags：tag相关字段。
 */

  tags?: string[];
  /**
 * enhanceLevel：enhance等级数值。
 */

  enhanceLevel?: number;
  /**
 * alchemySuccessRate：炼丹SuccessRate数值。
 */

  alchemySuccessRate?: number;
  /**
 * alchemySpeedRate：炼丹SpeedRate数值。
 */

  alchemySpeedRate?: number;
  /**
 * enhancementSuccessRate：强化SuccessRate数值。
 */

  enhancementSuccessRate?: number;
  /**
 * enhancementSpeedRate：强化SpeedRate数值。
 */

  enhancementSpeedRate?: number;
  /**
 * mapUnlockId：地图UnlockID标识。
 */

  mapUnlockId?: string;
  /**
 * mapUnlockIds：地图UnlockID相关字段。
 */

  mapUnlockIds?: string[];
  /**
 * respawnBindMapId：使用后绑定的复活地图 ID。
 */

  respawnBindMapId?: string;
  /**
 * tileAuraGainAmount：数量或计量字段。
 */

  tileAuraGainAmount?: number;
  /**
 * tileResourceGains：集合字段。
 */

  tileResourceGains?: TileResourceGainDef[];
  /**
   * spiritualRootSeedTier：灵根幼苗品阶。
   */

  spiritualRootSeedTier?: ItemStack['spiritualRootSeedTier'];
  /**
   * allowBatchUse：allowBatchUse相关字段。
   */

  allowBatchUse?: boolean;
}

/** 背包完整快照。 */
export interface SyncedInventorySnapshot {
/**
 * items：集合字段。
 */

  items: SyncedItemStack[];
  /**
 * capacity：capacity相关字段。
 */

  capacity: number;
  /**
 * cooldowns：冷却相关字段。
 */

  cooldowns?: SyncedInventoryCooldownState[];
  /**
 * serverTick：servertick相关字段。
 */

  serverTick?: number;
}

/** 背包物品冷却状态。 */
export interface SyncedInventoryCooldownState {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * cooldown：冷却相关字段。
 */

  cooldown: number;
  /**
 * startedAtTick：startedAttick相关字段。
 */

  startedAtTick: number;
}

/** 背包面板局部更新项。 */
export interface InventorySlotUpdateEntry {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;
  /**
 * item：道具相关字段。
 */

  item: SyncedItemStack | null;
}

/** 装备槽位局部更新项。 */
export interface EquipmentSlotUpdateEntry {
/**
 * slot：slot相关字段。
 */

  slot: EquipSlot;
  /**
 * item：道具相关字段。
 */

  item: SyncedItemStack | null;
}

/** 背包面板增量视图。 */
export interface PanelInventoryDeltaView {
/**
 * r：r相关字段。
 */

  r: number;
  /**
 * full：full相关字段。
 */

  full?: 1;
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
}

/** 装备面板增量视图。 */
export interface PanelEquipmentDeltaView {
/**
 * r：r相关字段。
 */

  r: number;
  /**
 * full：full相关字段。
 */

  full?: 1;
  /**
 * slots：slot相关字段。
 */

  slots: EquipmentSlotUpdateEntry[];
}

/** 战利品窗口里的单条来源视图。 */
export interface SyncedLootWindowItemView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;
  /**
 * item：道具相关字段。
 */

  item: SyncedItemStack;
}

/** 战利品窗口来源视图。 */
export interface SyncedLootWindowSourceView {
/**
 * sourceId：来源ID标识。
 */

  sourceId: string;
  /**
 * kind：kind相关字段。
 */

  kind: LootSourceKind;
  /**
 * title：title名称或显示文本。
 */

  title: string;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * searchable：searchable相关字段。
 */

  searchable: boolean;
  /**
 * search：search相关字段。
 */

  search?: LootSearchProgressView;
  /**
 * items：集合字段。
 */

  items: SyncedLootWindowItemView[];
  /**
 * emptyText：emptyText名称或显示文本。
 */

  emptyText?: string;
  /**
 * variant：来源附加变体标识。
 */

  variant?: 'herb';
  /**
 * herb：草药采集摘要。
 */

  herb?: {
    grade?: TechniqueGrade;
    level?: number;
    nativeGatherTicks?: number;
    gatherTicks?: number;
    respawnRemainingTicks?: number;
  };
  /**
 * destroyed：资源点是否已被摧毁。
 */

  destroyed?: boolean;
}

/** 战利品窗口完整状态。 */
export interface SyncedLootWindowState {
/**
 * tileX：tileX相关字段。
 */

  tileX: number;
  /**
 * tileY：tileY相关字段。
 */

  tileY: number;
  /**
 * title：title名称或显示文本。
 */

  title: string;
  /**
 * sources：来源相关字段。
 */

  sources: SyncedLootWindowSourceView[];
}

/** 坊市材料细分类型。 */
export type MarketMaterialSubType = 'herb' | 'special' | 'other';
/** 坊市列表条目的二级分类。 */
export type MarketListingSubType = EquipSlot | TechniqueCategory | MarketMaterialSubType | 'other';

/** 坊市分页里的一条商品摘要。 */
export interface MarketListingPageEntry {
/**
 * itemKey：客户端使用的坊市条目 key。
 */

  itemKey: string;
  /**
 * item：服务端补齐后的预览物品，避免客户端目录滞后导致名称或类型丢失。
 */

  item?: ItemStack;
  /**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * itemType：道具大类。
 */

  itemType: ItemType;
  /**
 * itemSubType：道具二级分类。
 */

  itemSubType?: MarketListingSubType;
  /**
 * enhanceLevel：强化等级；不同强化等级视为不同条目。
 */

  enhanceLevel?: number;
  /**
 * lowestSellPrice：lowestSell价格数值。
 */

  lowestSellPrice?: number;
  /**
 * sellOrderCount：卖单数量。
 */

  sellOrderCount?: number;
  /**
 * sellQuantity：卖盘总量。
 */

  sellQuantity?: number;
  /**
 * highestBuyPrice：highestBuy价格数值。
 */

  highestBuyPrice?: number;
  /**
 * buyOrderCount：买单数量。
 */

  buyOrderCount?: number;
  /**
 * buyQuantity：买盘总量。
 */

  buyQuantity?: number;
}

/** 玩家自己的坊市订单条目。 */
export interface MarketOwnOrderSyncEntry {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * side：side相关字段。
 */

  side: 'buy' | 'sell';
  /**
 * status：statu状态或数据块。
 */

  status: 'open' | 'filled' | 'cancelled';
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

/** 坊市寄存仓库里的单条物品。 */
export interface MarketStorageSyncEntry {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;
  /**
 * item：道具相关字段。
 */

  item: ItemStack;
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** NPC 商店里的单条商品视图。 */
export interface SyncedNpcShopItemView {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * item：道具相关字段。
 */

  item: SyncedItemStack;
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;
  /**
 * remainingQuantity：remainingQuantity相关字段。
 */

  remainingQuantity?: number;
  /**
 * stockLimit：stockLimit相关字段。
 */

  stockLimit?: number;
  /**
 * refreshAt：refreshAt相关字段。
 */

  refreshAt?: number;
}

/** NPC 商店完整视图。 */
export interface SyncedNpcShopView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;
  /**
 * npcName：NPC名称名称或显示文本。
 */

  npcName: string;
  /**
 * dialogue：dialogue相关字段。
 */

  dialogue: string;
  /**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;
  /**
 * items：集合字段。
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

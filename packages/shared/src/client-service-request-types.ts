import type { EquipSlot, ItemType } from './item-runtime-types';
import type { TechniqueCategory } from './cultivation-types';
import type { MailFilter } from './mail-types';
import type { AlchemyIngredientSelection, EnhancementTargetRef } from './crafting-types';

/** 请求坊市首页。 */
export interface RequestMarketView {}

/** 请求坊市分页列表。 */
export interface RequestMarketListingsView {
/**
 * page：RequestMarketListingsView 内部字段。
 */

  page: number;  
  /**
 * pageSize：RequestMarketListingsView 内部字段。
 */

  pageSize?: number;  
  /**
 * category：RequestMarketListingsView 内部字段。
 */

  category?: ItemType | 'all';  
  /**
 * equipmentSlot：RequestMarketListingsView 内部字段。
 */

  equipmentSlot?: EquipSlot | 'all';  
  /**
 * techniqueCategory：RequestMarketListingsView 内部字段。
 */

  techniqueCategory?: TechniqueCategory | 'all';
}

/** 请求邮件分页。 */
export interface RequestMailPageView {
/**
 * page：RequestMailPageView 内部字段。
 */

  page: number;  
  /**
 * pageSize：RequestMailPageView 内部字段。
 */

  pageSize?: number;  
  /**
 * filter：RequestMailPageView 内部字段。
 */

  filter?: MailFilter;
}

/** 请求邮件摘要。 */
export interface RequestMailSummaryView {}

/** 请求邮件详情。 */
export interface RequestMailDetailView {
/**
 * mailId：RequestMailDetailView 内部字段。
 */

  mailId: string;
}

/** 请求 NPC 任务。 */
export interface RequestNpcQuestsView {
/**
 * npcId：RequestNpcQuestsView 内部字段。
 */

  npcId: string;
}

/** 接受 NPC 任务。 */
export interface AcceptNpcQuestView {
/**
 * npcId：AcceptNpcQuestView 内部字段。
 */

  npcId: string;  
  /**
 * questId：AcceptNpcQuestView 内部字段。
 */

  questId: string;
}

/** 提交 NPC 任务。 */
export interface SubmitNpcQuestView {
/**
 * npcId：SubmitNpcQuestView 内部字段。
 */

  npcId: string;  
  /**
 * questId：SubmitNpcQuestView 内部字段。
 */

  questId: string;
}

/** 请求详情面板。 */
export interface RequestDetailView {
/**
 * kind：RequestDetailView 内部字段。
 */

  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';  
  /**
 * id：RequestDetailView 内部字段。
 */

  id: string;
}

/** 邮件已读。 */
export interface MarkMailReadView {
/**
 * mailIds：MarkMailReadView 内部字段。
 */

  mailIds: string[];
}

/** 领取邮件附件。 */
export interface ClaimMailAttachmentsView {
/**
 * mailIds：ClaimMailAttachmentsView 内部字段。
 */

  mailIds: string[];
}

/** 删除邮件。 */
export interface DeleteMailView {
/**
 * mailIds：DeleteMailView 内部字段。
 */

  mailIds: string[];
}

/** 请求订单簿。 */
export interface RequestMarketItemBookView {
/**
 * itemKey：RequestMarketItemBookView 内部字段。
 */

  itemKey: string;
}

/** 请求成交历史。 */
export interface RequestMarketTradeHistoryView {
/**
 * page：RequestMarketTradeHistoryView 内部字段。
 */

  page: number;
}

/** 请求属性详情。 */
export interface RequestAttrDetailView {}

/** 请求排行榜。 */
export interface RequestLeaderboardView {
/**
 * limit：RequestLeaderboardView 内部字段。
 */

  limit?: number;
}

/** 请求世界概览。 */
export interface RequestWorldSummaryView {}

/** 创建卖单。 */
export interface CreateMarketSellOrderView {
/**
 * slotIndex：CreateMarketSellOrderView 内部字段。
 */

  slotIndex: number;  
  /**
 * quantity：CreateMarketSellOrderView 内部字段。
 */

  quantity: number;  
  /**
 * unitPrice：CreateMarketSellOrderView 内部字段。
 */

  unitPrice: number;
}

/** 创建买单。 */
export interface CreateMarketBuyOrderView {
/**
 * itemKey：CreateMarketBuyOrderView 内部字段。
 */

  itemKey: string;  
  /**
 * quantity：CreateMarketBuyOrderView 内部字段。
 */

  quantity: number;  
  /**
 * unitPrice：CreateMarketBuyOrderView 内部字段。
 */

  unitPrice: number;
}

/** 购买挂单。 */
export interface BuyMarketItemView {
/**
 * itemKey：BuyMarketItemView 内部字段。
 */

  itemKey: string;  
  /**
 * quantity：BuyMarketItemView 内部字段。
 */

  quantity: number;
}

/** 出售背包物品。 */
export interface SellMarketItemView {
/**
 * slotIndex：SellMarketItemView 内部字段。
 */

  slotIndex: number;  
  /**
 * quantity：SellMarketItemView 内部字段。
 */

  quantity: number;
}

/** 取消订单。 */
export interface CancelMarketOrderView {
/**
 * orderId：CancelMarketOrderView 内部字段。
 */

  orderId: string;
}

/** 领取坊市寄存仓库。 */
export interface ClaimMarketStorageView {}

/** 请求 NPC 商店。 */
export interface RequestNpcShopView {
/**
 * npcId：RequestNpcShopView 内部字段。
 */

  npcId: string;
}

/** 购买 NPC 商店商品。 */
export interface BuyNpcShopItemView {
/**
 * npcId：BuyNpcShopItemView 内部字段。
 */

  npcId: string;  
  /**
 * itemId：BuyNpcShopItemView 内部字段。
 */

  itemId: string;  
  /**
 * quantity：BuyNpcShopItemView 内部字段。
 */

  quantity: number;
}

/** 请求炼制面板。 */
export interface RequestAlchemyPanelView {
/**
 * knownCatalogVersion：RequestAlchemyPanelView 内部字段。
 */

  knownCatalogVersion?: number;
}

/** 保存炼制预设。 */
export interface SaveAlchemyPresetView {
/**
 * presetId：SaveAlchemyPresetView 内部字段。
 */

  presetId?: string;  
  /**
 * recipeId：SaveAlchemyPresetView 内部字段。
 */

  recipeId: string;  
  /**
 * name：SaveAlchemyPresetView 内部字段。
 */

  name: string;  
  /**
 * ingredients：SaveAlchemyPresetView 内部字段。
 */

  ingredients: AlchemyIngredientSelection[];
}

/** 删除炼制预设。 */
export interface DeleteAlchemyPresetView {
/**
 * presetId：DeleteAlchemyPresetView 内部字段。
 */

  presetId: string;
}

/** 开始炼制。 */
export interface StartAlchemyView {
/**
 * recipeId：StartAlchemyView 内部字段。
 */

  recipeId: string;  
  /**
 * ingredients：StartAlchemyView 内部字段。
 */

  ingredients: AlchemyIngredientSelection[];  
  /**
 * quantity：StartAlchemyView 内部字段。
 */

  quantity: number;
}

/** 取消炼制。 */
export interface CancelAlchemyView {}

/** 请求强化面板。 */
export interface RequestEnhancementPanelView {}

/** 开始强化。 */
export interface StartEnhancementView {
/**
 * target：StartEnhancementView 内部字段。
 */

  target: EnhancementTargetRef;  
  /**
 * protection：StartEnhancementView 内部字段。
 */

  protection?: EnhancementTargetRef | null;  
  /**
 * targetLevel：StartEnhancementView 内部字段。
 */

  targetLevel?: number;  
  /**
 * protectionStartLevel：StartEnhancementView 内部字段。
 */

  protectionStartLevel?: number | null;
}

/** 取消强化。 */
export interface CancelEnhancementView {}

/** 使用背包物品。 */
export interface UseItemView {
/**
 * slotIndex：UseItemView 内部字段。
 */

  slotIndex: number;  
  /**
 * count：UseItemView 内部字段。
 */

  count?: number;
}

/** 丢弃背包物品。 */
export interface DropItemView {
/**
 * slotIndex：DropItemView 内部字段。
 */

  slotIndex: number;  
  /**
 * count：DropItemView 内部字段。
 */

  count: number;
}

/** 摧毁背包物品。 */
export interface DestroyItemView {
/**
 * slotIndex：DestroyItemView 内部字段。
 */

  slotIndex: number;  
  /**
 * count：DestroyItemView 内部字段。
 */

  count: number;
}

/** 拿取地面掉落或容器战利品。 */
export interface TakeLootView {
/**
 * sourceId：TakeLootView 内部字段。
 */

  sourceId: string;  
  /**
 * itemKey：TakeLootView 内部字段。
 */

  itemKey?: string;  
  /**
 * takeAll：TakeLootView 内部字段。
 */

  takeAll?: boolean;
}

/** 请求整理背包。 */
export interface SortInventoryView {}

/** 装备背包物品。 */
export interface EquipView {
/**
 * slotIndex：EquipView 内部字段。
 */

  slotIndex: number;
}

/** 卸下装备。 */
export interface UnequipView {
/**
 * slot：UnequipView 内部字段。
 */

  slot: EquipSlot;
}

/** 开始或停止修炼。 */
export interface CultivateView {
/**
 * techId：CultivateView 内部字段。
 */

  techId: string | null;
}

/** 释放技能。 */
export interface CastSkillView {
/**
 * skillId：CastSkillView 内部字段。
 */

  skillId: string;  
  /**
 * targetPlayerId：CastSkillView 内部字段。
 */

  targetPlayerId?: string | null;  
  /**
 * targetMonsterId：CastSkillView 内部字段。
 */

  targetMonsterId?: string | null;  
  /**
 * targetRef：CastSkillView 内部字段。
 */

  targetRef?: string | null;
}

/** 兑换码提交。 */
export interface RedeemCodesView {
/**
 * codes：RedeemCodesView 内部字段。
 */

  codes: string[];
}

/** 请求任务列表。 */
export interface RequestQuestsView {}

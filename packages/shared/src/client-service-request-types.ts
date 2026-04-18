import type { EquipSlot, ItemType } from './item-runtime-types';
import type { TechniqueCategory } from './cultivation-types';
import type { MailFilter } from './mail-types';
import type { AlchemyIngredientSelection, EnhancementTargetRef } from './crafting-types';

/** 请求坊市首页。 */
export interface RequestMarketView {}

/** 请求坊市分页列表。 */
export interface RequestMarketListingsView {
  page: number;
  pageSize?: number;
  category?: ItemType | 'all';
  equipmentSlot?: EquipSlot | 'all';
  techniqueCategory?: TechniqueCategory | 'all';
}

/** 请求邮件分页。 */
export interface RequestMailPageView {
  page: number;
  pageSize?: number;
  filter?: MailFilter;
}

/** 请求邮件摘要。 */
export interface RequestMailSummaryView {}

/** 请求邮件详情。 */
export interface RequestMailDetailView {
  mailId: string;
}

/** 请求 NPC 任务。 */
export interface RequestNpcQuestsView {
  npcId: string;
}

/** 接受 NPC 任务。 */
export interface AcceptNpcQuestView {
  npcId: string;
  questId: string;
}

/** 提交 NPC 任务。 */
export interface SubmitNpcQuestView {
  npcId: string;
  questId: string;
}

/** 请求详情面板。 */
export interface RequestDetailView {
  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';
  id: string;
}

/** 邮件已读。 */
export interface MarkMailReadView {
  mailIds: string[];
}

/** 领取邮件附件。 */
export interface ClaimMailAttachmentsView {
  mailIds: string[];
}

/** 删除邮件。 */
export interface DeleteMailView {
  mailIds: string[];
}

/** 请求订单簿。 */
export interface RequestMarketItemBookView {
  itemKey: string;
}

/** 请求成交历史。 */
export interface RequestMarketTradeHistoryView {
  page: number;
}

/** 请求属性详情。 */
export interface RequestAttrDetailView {}

/** 请求排行榜。 */
export interface RequestLeaderboardView {
  limit?: number;
}

/** 请求世界概览。 */
export interface RequestWorldSummaryView {}

/** 创建卖单。 */
export interface CreateMarketSellOrderView {
  slotIndex: number;
  quantity: number;
  unitPrice: number;
}

/** 创建买单。 */
export interface CreateMarketBuyOrderView {
  itemKey: string;
  quantity: number;
  unitPrice: number;
}

/** 购买挂单。 */
export interface BuyMarketItemView {
  itemKey: string;
  quantity: number;
}

/** 出售背包物品。 */
export interface SellMarketItemView {
  slotIndex: number;
  quantity: number;
}

/** 取消订单。 */
export interface CancelMarketOrderView {
  orderId: string;
}

/** 领取坊市寄存仓库。 */
export interface ClaimMarketStorageView {}

/** 请求 NPC 商店。 */
export interface RequestNpcShopView {
  npcId: string;
}

/** 购买 NPC 商店商品。 */
export interface BuyNpcShopItemView {
  npcId: string;
  itemId: string;
  quantity: number;
}

/** 请求炼制面板。 */
export interface RequestAlchemyPanelView {
  knownCatalogVersion?: number;
}

/** 保存炼制预设。 */
export interface SaveAlchemyPresetView {
  presetId?: string;
  recipeId: string;
  name: string;
  ingredients: AlchemyIngredientSelection[];
}

/** 删除炼制预设。 */
export interface DeleteAlchemyPresetView {
  presetId: string;
}

/** 开始炼制。 */
export interface StartAlchemyView {
  recipeId: string;
  ingredients: AlchemyIngredientSelection[];
  quantity: number;
}

/** 取消炼制。 */
export interface CancelAlchemyView {}

/** 请求强化面板。 */
export interface RequestEnhancementPanelView {}

/** 开始强化。 */
export interface StartEnhancementView {
  target: EnhancementTargetRef;
  protection?: EnhancementTargetRef | null;
  targetLevel?: number;
  protectionStartLevel?: number | null;
}

/** 取消强化。 */
export interface CancelEnhancementView {}

/** 使用背包物品。 */
export interface UseItemView {
  slotIndex: number;
  count?: number;
}

/** 丢弃背包物品。 */
export interface DropItemView {
  slotIndex: number;
  count: number;
}

/** 摧毁背包物品。 */
export interface DestroyItemView {
  slotIndex: number;
  count: number;
}

/** 拿取地面掉落或容器战利品。 */
export interface TakeLootView {
  sourceId: string;
  itemKey?: string;
  takeAll?: boolean;
}

/** 请求整理背包。 */
export interface SortInventoryView {}

/** 装备背包物品。 */
export interface EquipView {
  slotIndex: number;
}

/** 卸下装备。 */
export interface UnequipView {
  slot: EquipSlot;
}

/** 开始或停止修炼。 */
export interface CultivateView {
  techId: string | null;
}

/** 释放技能。 */
export interface CastSkillView {
  skillId: string;
  targetPlayerId?: string | null;
  targetMonsterId?: string | null;
  targetRef?: string | null;
}

/** 兑换码提交。 */
export interface RedeemCodesView {
  codes: string[];
}

/** 请求任务列表。 */
export interface RequestQuestsView {}

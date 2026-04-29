import type { EquipSlot, ItemType } from './item-runtime-types';
import type { TechniqueCategory } from './cultivation-types';
import type { MailFilter } from './mail-types';
import type { AlchemyIngredientSelection, CraftQueueStartMode, EnhancementTargetRef } from './crafting-types';

/** 请求坊市首页。 */
export interface RequestMarketView {}

/** 请求坊市分页列表。 */
export interface RequestMarketListingsView {
/**
 * page：page相关字段。
 */

  page: number;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize?: number;  
  /**
 * category：category相关字段。
 */

  category?: ItemType | 'all';  
  /**
 * equipmentSlot：装备Slot相关字段。
 */

  equipmentSlot?: EquipSlot | 'all';  
  /**
 * techniqueCategory：功法Category相关字段。
 */

  techniqueCategory?: TechniqueCategory | 'all';
}

/** 请求邮件分页。 */
export interface RequestMailPageView {
/**
 * page：page相关字段。
 */

  page: number;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize?: number;  
  /**
 * filter：filter相关字段。
 */

  filter?: MailFilter;
}

/** 请求邮件摘要。 */
export interface RequestMailSummaryView {}

/** 请求邮件详情。 */
export interface RequestMailDetailView {
/**
 * mailId：邮件ID标识。
 */

  mailId: string;
}

/** 请求 NPC 任务。 */
export interface RequestNpcQuestsView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;
}

/** 接受 NPC 任务。 */
export interface AcceptNpcQuestView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * questId：任务ID标识。
 */

  questId: string;
}

/** 提交 NPC 任务。 */
export interface SubmitNpcQuestView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * questId：任务ID标识。
 */

  questId: string;
}

/** 请求详情面板。 */
export interface RequestDetailView {
/**
 * kind：kind相关字段。
 */

  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';  
  /**
 * id：ID标识。
 */

  id: string;
}

/** 邮件已读。 */
export interface MarkMailReadView {
/**
 * mailIds：邮件ID相关字段。
 */

  mailIds: string[];
}

/** 领取邮件附件。 */
export interface ClaimMailAttachmentsView {
/**
 * mailIds：邮件ID相关字段。
 */

  mailIds: string[];
}

/** 删除邮件。 */
export interface DeleteMailView {
/**
 * mailIds：邮件ID相关字段。
 */

  mailIds: string[];
}

/** 请求订单簿。 */
export interface RequestMarketItemBookView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;
}

/** 请求成交历史。 */
export interface RequestMarketTradeHistoryView {
/**
 * page：page相关字段。
 */

  page: number;
}

/** 请求属性详情。 */
export interface RequestAttrDetailView {}

/** 请求排行榜。 */
export interface RequestLeaderboardView {
/**
 * limit：limit相关字段。
 */

  limit?: number;
}

/** 请求玩家击杀榜坐标追索结果。 */
export interface RequestLeaderboardPlayerLocationsView {
/**
 * playerIds：玩家ID列表。
 */

  playerIds: string[];
}

/** 请求世界概览。 */
export interface RequestWorldSummaryView {}

/** 停止当前连续采摘。 */
export interface StopLootHarvestView {}

/** 开始当前草药采集。 */
export interface StartGatherView {
/**
 * sourceId：来源 ID。
 */

  sourceId: string;
  /**
 * itemKey：道具 Key。
 */

  itemKey?: string;
}

/** 取消当前草药采集。 */
export interface CancelGatherView {}

/** 创建卖单。 */
export interface CreateMarketSellOrderView {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;  
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;
}

/** 创建买单。 */
export interface CreateMarketBuyOrderView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;  
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;
}

/** 购买挂单。 */
export interface BuyMarketItemView {
/**
 * itemKey：道具Key标识。
 */

  itemKey: string;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;
}

/** 出售背包物品。 */
export interface SellMarketItemView {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;
}

/** 取消订单。 */
export interface CancelMarketOrderView {
/**
 * orderId：订单ID标识。
 */

  orderId: string;
}

/** 领取坊市寄存仓库。 */
export interface ClaimMarketStorageView {}

/** 请求 NPC 商店。 */
export interface RequestNpcShopView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;
}

/** 购买 NPC 商店商品。 */
export interface BuyNpcShopItemView {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;
}

/** 请求炼制面板。 */
export interface RequestAlchemyPanelView {
/**
 * knownCatalogVersion：known目录Version相关字段。
 */

  knownCatalogVersion?: number;
}

/** 保存炼制预设。 */
export interface SaveAlchemyPresetView {
/**
 * presetId：presetID标识。
 */

  presetId?: string;  
  /**
 * recipeId：recipeID标识。
 */

  recipeId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * ingredients：ingredient相关字段。
 */

  ingredients: AlchemyIngredientSelection[];
}

/** 删除炼制预设。 */
export interface DeleteAlchemyPresetView {
/**
 * presetId：presetID标识。
 */

  presetId: string;
}

/** 开始炼制。 */
export interface StartAlchemyView {
/**
 * recipeId：recipeID标识。
 */

  recipeId: string;  
  /**
 * ingredients：ingredient相关字段。
 */

  ingredients: AlchemyIngredientSelection[];  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;
  /**
 * queueMode：制造队列启动方式。
 */

  queueMode?: CraftQueueStartMode;
}

/** 取消炼制。 */
export interface CancelAlchemyView {}

/** 请求强化面板。 */
export interface RequestEnhancementPanelView {}

/** 开始强化。 */
export interface StartEnhancementView {
/**
 * target：目标相关字段。
 */

  target: EnhancementTargetRef;  
  /**
 * protection：protection相关字段。
 */

  protection?: EnhancementTargetRef | null;  
  /**
 * targetLevel：目标等级数值。
 */

  targetLevel?: number;  
  /**
 * protectionStartLevel：protectionStart等级数值。
 */

  protectionStartLevel?: number | null;
  /**
 * queueMode：制造队列启动方式。
 */

  queueMode?: CraftQueueStartMode;
}

/** 取消强化。 */
export interface CancelEnhancementView {}

/** 使用背包物品。 */
export interface UseItemView {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;  
  /**
 * count：数量或计量字段。
 */

  count?: number;
  /**
 * sectName：使用建宗令时提交的宗门名称。
 */

  sectName?: string;
  /**
 * sectMark：使用建宗令时提交的单字宗门印记。
 */

  sectMark?: string;
}

/** 丢弃背包物品。 */
export interface DropItemView {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 摧毁背包物品。 */
export interface DestroyItemView {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 拿取地面掉落或容器战利品。 */
export interface TakeLootView {
/**
 * sourceId：来源ID标识。
 */

  sourceId: string;  
  /**
 * itemKey：道具Key标识。
 */

  itemKey?: string;  
  /**
 * takeAll：takeAll相关字段。
 */

  takeAll?: boolean;
}

/** 请求整理背包。 */
export interface SortInventoryView {}

/** 装备背包物品。 */
export interface EquipView {
/**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;
}

/** 卸下装备。 */
export interface UnequipView {
/**
 * slot：slot相关字段。
 */

  slot: EquipSlot;
}

/** 开始或停止修炼。 */
export interface CultivateView {
/**
 * techId：techID标识。
 */

  techId: string | null;
}

/** 释放技能。 */
export interface CastSkillView {
/**
 * skillId：技能ID标识。
 */

  skillId: string;  
  /**
 * targetPlayerId：目标玩家ID标识。
 */

  targetPlayerId?: string | null;  
  /**
 * targetMonsterId：目标怪物ID标识。
 */

  targetMonsterId?: string | null;  
  /**
 * targetRef：目标Ref相关字段。
 */

  targetRef?: string | null;
}

/** 兑换码提交。 */
export interface RedeemCodesView {
/**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 请求任务列表。 */
export interface RequestQuestsView {}

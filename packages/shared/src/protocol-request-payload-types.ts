import type {
  AckSystemMessagesRequestView,
  ActionRequestView,
  ChatRequestView,
  DebugResetSpawnRequestView,
  HeartbeatRequestView,
  HeavenGateActionRequestView,
  HelloRequestView,
  InspectTileRuntimeRequestView,
  MoveRequestView,
  MoveToRequestView,
  NavigateQuestRequestView,
  PingRequestView,
  UpdateAutoBattleSkillsRequestView,
  UpdateAutoBattleTargetingModeRequestView,
  UpdateAutoUsePillsRequestView,
  UpdateCombatTargetingRulesRequestView,
  UpdateTechniqueSkillAvailabilityRequestView,
  UsePortalRequestView,
} from './client-core-request-types';
import type {
  AcceptNpcQuestView,
  BuyMarketItemView,
  BuyNpcShopItemView,
  CancelAlchemyView,
  CancelEnhancementView,
  CancelMarketOrderView,
  CastSkillView,
  ClaimMailAttachmentsView,
  ClaimMarketStorageView,
  CreateMarketBuyOrderView,
  CreateMarketSellOrderView,
  CultivateView,
  DeleteAlchemyPresetView,
  DeleteMailView,
  DestroyItemView,
  DropItemView,
  EquipView,
  MarkMailReadView,
  RedeemCodesView,
  RequestAlchemyPanelView,
  RequestAttrDetailView,
  RequestDetailView,
  RequestEnhancementPanelView,
  RequestLeaderboardView,
  RequestMailDetailView,
  RequestMailPageView,
  RequestMailSummaryView,
  RequestMarketItemBookView,
  RequestMarketListingsView,
  RequestMarketTradeHistoryView,
  RequestMarketView,
  RequestNpcQuestsView,
  RequestNpcShopView,
  RequestQuestsView,
  RequestWorldSummaryView,
  SaveAlchemyPresetView,
  SellMarketItemView,
  SortInventoryView,
  StartAlchemyView,
  StartEnhancementView,
  SubmitNpcQuestView,
  TakeLootView,
  UnequipView,
  UseItemView,
} from './client-service-request-types';
import type {
  CreateSuggestionRequestView,
  GmGetStateRequestView,
  GmMarkSuggestionCompletedRequestView,
  GmRemoveBotsRequestView,
  GmRemoveSuggestionRequestView,
  GmResetPlayerRequestView,
  GmSpawnBotsRequestView,
  GmUpdatePlayerRequestView,
  MarkSuggestionRepliesReadRequestView,
  ReplySuggestionRequestView,
  RequestSuggestionsView,
  VoteSuggestionRequestView,
} from './client-social-admin-request-types';

/** 握手就绪声明：游客链路仅允许声明续连 sid 或首登落点。 */
export interface NEXT_C2S_Hello extends HelloRequestView {}
/** 移动指令 */
export interface NEXT_C2S_Move extends MoveRequestView {}
/** 点击目标点移动 */
export interface NEXT_C2S_MoveTo extends MoveToRequestView {}
/** 以任务为目标启动自动导航 */
export interface NEXT_C2S_NavigateQuest extends NavigateQuestRequestView {}
/** 在线心跳 */
export interface NEXT_C2S_Heartbeat extends HeartbeatRequestView {}
/** 客户端主动延迟探测 */
export interface NEXT_C2S_Ping extends PingRequestView {}
/** 地图格子运行时详情查询。 */
export interface NEXT_C2S_InspectTileRuntime extends InspectTileRuntimeRequestView {}
/** GM 总览状态请求。 */
export interface NEXT_C2S_GmGetState extends GmGetStateRequestView {}
/** GM 批量生成机器人请求。 */
export interface NEXT_C2S_GmSpawnBots extends GmSpawnBotsRequestView {}
/** GM 批量移除机器人请求。 */
export interface NEXT_C2S_GmRemoveBots extends GmRemoveBotsRequestView {}
/** GM 直接调整玩家位置、状态和自动战斗开关。 */
export interface NEXT_C2S_GmUpdatePlayer extends GmUpdatePlayerRequestView {}
/** GM 重置玩家状态请求。 */
export interface NEXT_C2S_GmResetPlayer extends GmResetPlayerRequestView {}
/** 动作指令 */
export interface NEXT_C2S_Action extends ActionRequestView {}
/** 更新自动战斗技能配置。 */
export interface NEXT_C2S_UpdateAutoBattleSkills extends UpdateAutoBattleSkillsRequestView {}
/** 更新自动用药配置。 */
export interface NEXT_C2S_UpdateAutoUsePills extends UpdateAutoUsePillsRequestView {}
/** 更新自动战斗目标选择规则。 */
export interface NEXT_C2S_UpdateCombatTargetingRules extends UpdateCombatTargetingRulesRequestView {}
/** 更新自动战斗目标模式。 */
export interface NEXT_C2S_UpdateAutoBattleTargetingMode extends UpdateAutoBattleTargetingModeRequestView {}
/** 切换功法技能开关。 */
export interface NEXT_C2S_UpdateTechniqueSkillAvailability extends UpdateTechniqueSkillAvailabilityRequestView {}
/** 调试：回出生点 */
export interface NEXT_C2S_DebugResetSpawn extends DebugResetSpawnRequestView {}
/** 聊天消息 */
export interface NEXT_C2S_Chat extends ChatRequestView {}
/** 系统消息已读回执。 */
export interface NEXT_C2S_AckSystemMessages extends AckSystemMessagesRequestView {}
/** 请求坊市首页数据。 */
export interface NEXT_C2S_RequestMarket extends RequestMarketView {}
/** 请求坊市分页列表。 */
export interface NEXT_C2S_RequestMarketListings extends RequestMarketListingsView {}
/** 请求邮件摘要。 */
export interface NEXT_C2S_RequestMailSummary extends RequestMailSummaryView {}
/** 请求邮件分页列表。 */
export interface NEXT_C2S_RequestMailPage extends RequestMailPageView {}
/** 请求邮件详情。 */
export interface NEXT_C2S_RequestMailDetail extends RequestMailDetailView {}
/** 请求当前任务列表。 */
export interface NEXT_C2S_RequestQuests extends RequestQuestsView {}
/** 请求指定 NPC 的可接任务。 */
export interface NEXT_C2S_RequestNpcQuests extends RequestNpcQuestsView {}
/** 接受 NPC 任务。 */
export interface NEXT_C2S_AcceptNpcQuest extends AcceptNpcQuestView {}
/** 提交 NPC 任务。 */
export interface NEXT_C2S_SubmitNpcQuest extends SubmitNpcQuestView {}
/** 请求指定实体或地面对象的详情面板。 */
export interface NEXT_C2S_RequestDetail extends RequestDetailView {}
/** 标记邮件已读。 */
export interface NEXT_C2S_MarkMailRead extends MarkMailReadView {}
/** 领取邮件附件。 */
export interface NEXT_C2S_ClaimMailAttachments extends ClaimMailAttachmentsView {}
/** 删除邮件。 */
export interface NEXT_C2S_DeleteMail extends DeleteMailView {}
/** 请求坊市指定物品的订单簿。 */
export interface NEXT_C2S_RequestMarketItemBook extends RequestMarketItemBookView {}
/** 请求坊市成交历史分页。 */
export interface NEXT_C2S_RequestMarketTradeHistory extends RequestMarketTradeHistoryView {}
/** 请求属性详情面板。 */
export interface NEXT_C2S_RequestAttrDetail extends RequestAttrDetailView {}
/** 请求排行榜数据。 */
export interface NEXT_C2S_RequestLeaderboard extends RequestLeaderboardView {}
/** 请求世界概览统计。 */
export interface NEXT_C2S_RequestWorldSummary extends RequestWorldSummaryView {}
/** 创建坊市卖单。 */
export interface NEXT_C2S_CreateMarketSellOrder extends CreateMarketSellOrderView {}
/** 创建坊市买单。 */
export interface NEXT_C2S_CreateMarketBuyOrder extends CreateMarketBuyOrderView {}
/** 直接购买坊市挂单物品。 */
export interface NEXT_C2S_BuyMarketItem extends BuyMarketItemView {}
/** 直接向坊市出售背包物品。 */
export interface NEXT_C2S_SellMarketItem extends SellMarketItemView {}
/** 取消坊市订单。 */
export interface NEXT_C2S_CancelMarketOrder extends CancelMarketOrderView {}
/** 领取坊市寄售仓库。 */
export interface NEXT_C2S_ClaimMarketStorage extends ClaimMarketStorageView {}
/** 请求触发当前位置传送点。 */
export interface NEXT_C2S_UsePortal extends UsePortalRequestView {}
/** 请求 NPC 商店面板。 */
export interface NEXT_C2S_RequestNpcShop extends RequestNpcShopView {}
/** 购买 NPC 商店商品。 */
export interface NEXT_C2S_BuyNpcShopItem extends BuyNpcShopItemView {}
/** 请求炼制面板。 */
export interface NEXT_C2S_RequestAlchemyPanel extends RequestAlchemyPanelView {}
/** 保存炼制预设。 */
export interface NEXT_C2S_SaveAlchemyPreset extends SaveAlchemyPresetView {}
/** 删除炼制预设。 */
export interface NEXT_C2S_DeleteAlchemyPreset extends DeleteAlchemyPresetView {}
/** 开始炼制。 */
export interface NEXT_C2S_StartAlchemy extends StartAlchemyView {}
/** 取消炼制。 */
export interface NEXT_C2S_CancelAlchemy extends CancelAlchemyView {}
/** 请求强化面板。 */
export interface NEXT_C2S_RequestEnhancementPanel extends RequestEnhancementPanelView {}
/** 开始装备强化。 */
export interface NEXT_C2S_StartEnhancement extends StartEnhancementView {}
/** 取消强化。 */
export interface NEXT_C2S_CancelEnhancement extends CancelEnhancementView {}
/** 天门功能操作。 */
export interface NEXT_C2S_HeavenGateAction extends HeavenGateActionRequestView {}
/** 使用背包物品。 */
export interface NEXT_C2S_UseItem extends UseItemView {}
/** 丢弃背包物品。 */
export interface NEXT_C2S_DropItem extends DropItemView {}
/** 彻底摧毁背包物品。 */
export interface NEXT_C2S_DestroyItem extends DestroyItemView {}
/** 拿取地面掉落或容器战利品。 */
export interface NEXT_C2S_TakeLoot extends TakeLootView {}
/** 请求整理背包。 */
export interface NEXT_C2S_SortInventory extends SortInventoryView {}
/** 装备背包物品。 */
export interface NEXT_C2S_Equip extends EquipView {}
/** 卸下指定装备槽位。 */
export interface NEXT_C2S_Unequip extends UnequipView {}
/** 开始或停止修炼功法。 */
export interface NEXT_C2S_Cultivate extends CultivateView {}
/** 释放技能。 */
export interface NEXT_C2S_CastSkill extends CastSkillView {}
/** 兑换码提交请求。 */
export interface NEXT_C2S_RedeemCodes extends RedeemCodesView {}
/** 主动请求最新建议列表 */
export interface NEXT_C2S_RequestSuggestions extends RequestSuggestionsView {}
/** 创建建议 */
export interface NEXT_C2S_CreateSuggestion extends CreateSuggestionRequestView {}
/** 建议投票 */
export interface NEXT_C2S_VoteSuggestion extends VoteSuggestionRequestView {}
/** 回复建议。 */
export interface NEXT_C2S_ReplySuggestion extends ReplySuggestionRequestView {}
/** 标记某条建议的回复已读。 */
export interface NEXT_C2S_MarkSuggestionRepliesRead extends MarkSuggestionRepliesReadRequestView {}
/** GM 标记建议已完成。 */
export interface NEXT_C2S_GmMarkSuggestionCompleted extends GmMarkSuggestionCompletedRequestView {}
/** GM 删除建议。 */
export interface NEXT_C2S_GmRemoveSuggestion extends GmRemoveSuggestionRequestView {}

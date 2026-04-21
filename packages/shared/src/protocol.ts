/**
 * 前后端通信协议：定义事件名，以及引导包、世界增量、面板增量、详情包等共享载荷。
 * NEXT_C2S = 客户端→服务端，NEXT_S2C = 服务端→客户端。
 */
import type { ElementKey } from './numeric';
import { AttrBonus, Attributes, NumericStatPercentages } from './attribute-types';
import { BodyTrainingState, PlayerRealmState, PlayerRealmStage, PlayerSpecialStats, TechniqueCategory, TechniqueGrade, TechniqueLayerDef, TechniqueRealm, TechniqueState } from './cultivation-types';
import type { GmPerformanceSnapshot, GmPlayerSummary } from './gm-runtime-types';
import { ConsumableBuffDef, EquipmentEffectDef, EquipmentSlots, EquipSlot, Inventory, ItemStack, ItemType } from './item-runtime-types';
import { PlayerState } from './player-runtime-types';
import type { LeaderboardView, RealmUpdateView, WorldSummaryView } from './protocol-envelope-types';
import type * as RequestPayloads from './protocol-request-payload-types';
import type * as ResponsePayloads from './protocol-response-payload-types';
import type {
  NEXT_S2C_ContainerDetail,
  NEXT_S2C_GroundDetail,
  NEXT_S2C_NpcDetail,
  NEXT_S2C_MonsterDetail,
  NEXT_S2C_PanelActionDelta,
  NEXT_S2C_PanelAttrDelta,
  NEXT_S2C_PanelBuffDelta,
  NEXT_S2C_PanelEquipmentDelta,
  NEXT_S2C_PanelInventoryDelta,
  NEXT_S2C_PanelTechniqueDelta,
  NEXT_S2C_PlayerDetail,
  NEXT_S2C_PortalDetail,
} from './protocol-response-payload-types';
import type { BootstrapView, MapStaticView } from './session-sync-types';
import type { AlchemyPanelSyncView, EnhancementPanelSyncView, MailDetailSyncView, NpcShopSyncView } from './service-sync-types';
import { SkillDef, TemporaryBuffState } from './skill-types';
import { Direction, EntityKind, GameTimeState, MapMeta, MapRouteDomain, MapTimeConfig, MonsterAggroMode, MonsterTier, PortalRouteDomain, RenderEntity, Tile, VisibleBuffState, VisibleTile } from './world-core-types';
import { NumericRatioDivisors, NumericStats, NumericStatBreakdownMap } from './numeric';
import type { ActionDef, ActionType, CombatEffect } from './action-combat-types';
import type { AccountRedeemCodesRes } from './api-contracts';
import type { AttrDetailView } from './attr-detail-types';
import type { AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules } from './automation-types';
import type { ObservedTileEntityDetail, ObservationLootPreview, ObservationLootPreviewEntry } from './detail-view-types';
import type { AlchemyIngredientSelection, AlchemyRecipeCatalogEntry, EnhancementTargetRef, SyncedAlchemyPanelState, SyncedEnhancementPanelState } from './crafting-types';
import type { GroundItemEntryView, GroundItemPileView, LootSearchProgressView, LootSourceKind } from './loot-view-types';
import type { MailAttachment, MailDetailView, MailFilter, MailPageView, MailSummaryView, MailTemplateArg } from './mail-types';
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView } from './market-types';
import type { ObservationInsight } from './observation-types';
import type { AttrUpdateView } from './panel-update-types';
import type { QuestLine, QuestObjectiveType, QuestState } from './quest-types';
import type { EquipmentSlotUpdateEntry, InventorySlotUpdateEntry, MarketListingPageEntry, MarketOwnOrderSyncEntry, MarketStorageSyncEntry, SyncedInventoryCooldownState, SyncedInventorySnapshot, SyncedItemStack, SyncedLootWindowState, SyncedNpcShopView } from './synced-panel-types';
import type { MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot, NpcQuestMarker, Suggestion } from './world-view-types';

export type * from './protocol-request-payload-types';
export type * from './protocol-response-payload-types';

/** server-next 客户端发往服务端的事件名集合。 */
export const NEXT_C2S = {
  Hello: 'n:c:hello',
  Move: 'n:c:move',
  MoveTo: 'n:c:moveTo',
  NavigateQuest: 'n:c:navigateQuest',
  Heartbeat: 'n:c:heartbeat',
  UseAction: 'n:c:useAction',
  RequestDetail: 'n:c:requestDetail',
  RequestTileDetail: 'n:c:requestTileDetail',
  GmGetState: 'n:c:gmGetState',
  GmSpawnBots: 'n:c:gmSpawnBots',
  GmRemoveBots: 'n:c:gmRemoveBots',
  GmUpdatePlayer: 'n:c:gmUpdatePlayer',
  GmResetPlayer: 'n:c:gmResetPlayer',
  RequestSuggestions: 'n:c:requestSuggestions',
  CreateSuggestion: 'n:c:createSuggestion',
  VoteSuggestion: 'n:c:voteSuggestion',
  ReplySuggestion: 'n:c:replySuggestion',
  MarkSuggestionRepliesRead: 'n:c:markSuggestionRepliesRead',
  GmMarkSuggestionCompleted: 'n:c:gmMarkSuggestionCompleted',
  GmRemoveSuggestion: 'n:c:gmRemoveSuggestion',
  RequestMailSummary: 'n:c:requestMailSummary',
  RequestMailPage: 'n:c:requestMailPage',
  RequestMailDetail: 'n:c:requestMailDetail',
  RedeemCodes: 'n:c:redeemCodes',
  MarkMailRead: 'n:c:markMailRead',
  ClaimMailAttachments: 'n:c:claimMailAttachments',
  DeleteMail: 'n:c:deleteMail',
  RequestQuests: 'n:c:requestQuests',
  RequestNpcQuests: 'n:c:requestNpcQuests',
  AcceptNpcQuest: 'n:c:acceptNpcQuest',
  SubmitNpcQuest: 'n:c:submitNpcQuest',
  RequestMarket: 'n:c:requestMarket',
  RequestMarketListings: 'n:c:requestMarketListings',
  RequestMarketItemBook: 'n:c:requestMarketItemBook',
  RequestMarketTradeHistory: 'n:c:requestMarketTradeHistory',
  RequestAttrDetail: 'n:c:requestAttrDetail',
  RequestLeaderboard: 'n:c:requestLeaderboard',
  RequestLeaderboardPlayerLocations: 'n:c:requestLeaderboardPlayerLocations',
  RequestWorldSummary: 'n:c:requestWorldSummary',
  CreateMarketSellOrder: 'n:c:createMarketSellOrder',
  CreateMarketBuyOrder: 'n:c:createMarketBuyOrder',
  BuyMarketItem: 'n:c:buyMarketItem',
  SellMarketItem: 'n:c:sellMarketItem',
  CancelMarketOrder: 'n:c:cancelMarketOrder',
  ClaimMarketStorage: 'n:c:claimMarketStorage',
  UsePortal: 'n:c:usePortal',
  UseItem: 'n:c:useItem',
  DropItem: 'n:c:dropItem',
  DestroyItem: 'n:c:destroyItem',
  StopLootHarvest: 'n:c:stopLootHarvest',
  StartGather: 'n:c:startGather',
  CancelGather: 'n:c:cancelGather',
  TakeGround: 'n:c:takeGround',
  SortInventory: 'n:c:sortInventory',
  Equip: 'n:c:equip',
  Unequip: 'n:c:unequip',
  Cultivate: 'n:c:cultivate',
  CastSkill: 'n:c:castSkill',
  RequestNpcShop: 'n:c:requestNpcShop',
  BuyNpcShopItem: 'n:c:buyNpcShopItem',
  RequestAlchemyPanel: 'n:c:requestAlchemyPanel',
  SaveAlchemyPreset: 'n:c:saveAlchemyPreset',
  DeleteAlchemyPreset: 'n:c:deleteAlchemyPreset',
  StartAlchemy: 'n:c:startAlchemy',
  CancelAlchemy: 'n:c:cancelAlchemy',
  RequestEnhancementPanel: 'n:c:requestEnhancementPanel',
  StartEnhancement: 'n:c:startEnhancement',
  CancelEnhancement: 'n:c:cancelEnhancement',
  UpdateAutoBattleSkills: 'n:c:updateAutoBattleSkills',
  UpdateAutoUsePills: 'n:c:updateAutoUsePills',
  UpdateCombatTargetingRules: 'n:c:updateCombatTargetingRules',
  UpdateAutoBattleTargetingMode: 'n:c:updateAutoBattleTargetingMode',
  UpdateTechniqueSkillAvailability: 'n:c:updateTechniqueSkillAvailability',
  DebugResetSpawn: 'n:c:debugResetSpawn',
  Chat: 'n:c:chat',
  AckSystemMessages: 'n:c:ackSystemMessages',
  HeavenGateAction: 'n:c:heavenGateAction',
  Ping: 'n:c:ping',
} as const;

/** server-next 服务端发往客户端的事件名集合。 */
export const NEXT_S2C = {
  Bootstrap: 'n:s:bootstrap',
  InitSession: 'n:s:initSession',
  MapEnter: 'n:s:mapEnter',
  MapStatic: 'n:s:mapStatic',
  Realm: 'n:s:realm',
  WorldDelta: 'n:s:worldDelta',
  SelfDelta: 'n:s:selfDelta',
  PanelDelta: 'n:s:panelDelta',
  LootWindowUpdate: 'n:s:lootWindowUpdate',
  QuestNavigateResult: 'n:s:questNavigateResult',
  Notice: 'n:s:notice',
  SuggestionUpdate: 'n:s:suggestionUpdate',
  MailSummary: 'n:s:mailSummary',
  MailPage: 'n:s:mailPage',
  MailDetail: 'n:s:mailDetail',
  RedeemCodesResult: 'n:s:redeemCodesResult',
  MailOpResult: 'n:s:mailOpResult',
  Quests: 'n:s:quests',
  NpcQuests: 'n:s:npcQuests',
  MarketUpdate: 'n:s:marketUpdate',
  MarketListings: 'n:s:marketListings',
  MarketOrders: 'n:s:marketOrders',
  MarketStorage: 'n:s:marketStorage',
  MarketItemBook: 'n:s:marketItemBook',
  MarketTradeHistory: 'n:s:marketTradeHistory',
  AttrDetail: 'n:s:attrDetail',
  Leaderboard: 'n:s:leaderboard',
  LeaderboardPlayerLocations: 'n:s:leaderboardPlayerLocations',
  WorldSummary: 'n:s:worldSummary',
  Detail: 'n:s:detail',
  TileDetail: 'n:s:tileDetail',
  NpcShop: 'n:s:npcShop',
  AlchemyPanel: 'n:s:alchemyPanel',
  EnhancementPanel: 'n:s:enhancementPanel',
  GmState: 'n:s:gmState',
  Error: 'n:s:error',
  Kick: 'n:s:kick',
  Pong: 'n:s:pong',
} as const;

/** next 客户端事件名联合。 */
export type NEXT_C2S_EventName = typeof NEXT_C2S[keyof typeof NEXT_C2S];

/** next 服务端事件名联合。 */
export type NEXT_S2C_EventName = typeof NEXT_S2C[keyof typeof NEXT_S2C];

/** 中性客户端事件表导出；保留 NEXT_* 作为兼容别名。 */
export const C2S = NEXT_C2S;

/** 中性服务端事件表导出；保留 NEXT_* 作为兼容别名。 */
export const S2C = NEXT_S2C;

/** 中性客户端事件名联合。 */
export type ClientToServerEventName = NEXT_C2S_EventName;

/** 中性服务端事件名联合。 */
export type ServerToClientEventName = NEXT_S2C_EventName;

/** 首次连接引导包：同步自身状态、首屏地图和小地图图鉴。 */
export interface NEXT_S2C_Bootstrap extends BootstrapView {}

/** 地图静态快照：地图元数据、小地图、静态地块和标记增量。 */
export interface NEXT_S2C_MapStatic extends MapStaticView {}

/** 面板总增量，按模块拆分下发。首连阶段允许只发 revision 占位，完整面板以 Bootstrap.self 为真源。 */
export interface NEXT_S2C_PanelDelta {
/**
 * inv：inv相关字段。
 */

  inv?: NEXT_S2C_PanelInventoryDelta;  
  /**
 * eq：eq相关字段。
 */

  eq?: NEXT_S2C_PanelEquipmentDelta;  
  /**
 * tech：tech相关字段。
 */

  tech?: NEXT_S2C_PanelTechniqueDelta;  
  /**
 * attr：attr相关字段。
 */

  attr?: NEXT_S2C_PanelAttrDelta;  
  /**
 * act：act相关字段。
 */

  act?: NEXT_S2C_PanelActionDelta;  
  /**
 * buff：buff相关字段。
 */

  buff?: NEXT_S2C_PanelBuffDelta;
}

// ===== Payload 类型 =====

/** 高频 tick 增量：同步可见实体、地面物品、战斗特效和剩余路径。 */
export interface NEXT_S2C_Tick extends ResponsePayloads.NEXT_S2C_Tick {}

// ===== 修仙系统 Payload =====

/** 属性面板低频更新。 */
export interface NEXT_S2C_AttrUpdate extends ResponsePayloads.NEXT_S2C_AttrUpdate {}

/** 功法面板更新。 */
export interface NEXT_S2C_TechniqueUpdate extends ResponsePayloads.NEXT_S2C_TechniqueUpdate {}

/** 行动面板更新。 */
export interface NEXT_S2C_ActionsUpdate extends ResponsePayloads.NEXT_S2C_ActionsUpdate {}

/** 炼制面板同步包。 */
export interface NEXT_S2C_AlchemyPanel extends AlchemyPanelSyncView {}

/** 强化面板同步包。 */
export interface NEXT_S2C_EnhancementPanel extends EnhancementPanelSyncView {}

/** 通用详情包，根据 kind 携带不同目标的详情。 */
export interface NEXT_S2C_Detail {
/**
 * kind：kind相关字段。
 */

  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';  
  /**
 * id：ID标识。
 */

  id: string;  
  /**
 * error：error相关字段。
 */

  error?: string;  
  /**
 * npc：NPC相关字段。
 */

  npc?: NEXT_S2C_NpcDetail;  
  /**
 * monster：怪物相关字段。
 */

  monster?: NEXT_S2C_MonsterDetail;  
  /**
 * player：玩家引用。
 */

  player?: NEXT_S2C_PlayerDetail;  
  /**
 * portal：portal相关字段。
 */

  portal?: NEXT_S2C_PortalDetail;  
  /**
 * ground：ground相关字段。
 */

  ground?: NEXT_S2C_GroundDetail;  
  /**
 * container：container相关字段。
 */

  container?: NEXT_S2C_ContainerDetail;
}

/** 属性详情包。 */
export interface NEXT_S2C_AttrDetail extends AttrDetailView {}

/** 邮件详情同步包。 */
export interface NEXT_S2C_MailDetail extends MailDetailSyncView {}

// ===== 建议系统 Payload =====

/** 建议系统的收发载荷。 */

/** next 客户端事件与载荷映射，作为 client/server/shared 的统一类型真源。 */
export interface NEXT_C2S_PayloadMap extends Record<NEXT_C2S_EventName, unknown> {
/**
 * [NEXT_C2S.Hello]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Hello]: RequestPayloads.NEXT_C2S_Hello;  
  /**
 * [NEXT_C2S.Move]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Move]: RequestPayloads.NEXT_C2S_Move;  
  /**
 * [NEXT_C2S.MoveTo]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.MoveTo]: RequestPayloads.NEXT_C2S_MoveTo;  
  /**
 * [NEXT_C2S.NavigateQuest]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.NavigateQuest]: RequestPayloads.NEXT_C2S_NavigateQuest;  
  /**
 * [NEXT_C2S.Heartbeat]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Heartbeat]: RequestPayloads.NEXT_C2S_Heartbeat;  
  /**
 * [NEXT_C2S.UseAction]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UseAction]: RequestPayloads.NEXT_C2S_Action;  
  /**
 * [NEXT_C2S.RequestDetail]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestDetail]: RequestPayloads.NEXT_C2S_RequestDetail;  
  /**
 * [NEXT_C2S.RequestTileDetail]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestTileDetail]: RequestPayloads.NEXT_C2S_InspectTileRuntime;  
  /**
 * [NEXT_C2S.GmGetState]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmGetState]: RequestPayloads.NEXT_C2S_GmGetState;  
  /**
 * [NEXT_C2S.GmSpawnBots]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmSpawnBots]: RequestPayloads.NEXT_C2S_GmSpawnBots;  
  /**
 * [NEXT_C2S.GmRemoveBots]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmRemoveBots]: RequestPayloads.NEXT_C2S_GmRemoveBots;  
  /**
 * [NEXT_C2S.GmUpdatePlayer]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmUpdatePlayer]: RequestPayloads.NEXT_C2S_GmUpdatePlayer;  
  /**
 * [NEXT_C2S.GmResetPlayer]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmResetPlayer]: RequestPayloads.NEXT_C2S_GmResetPlayer;  
  /**
 * [NEXT_C2S.RequestSuggestions]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestSuggestions]: RequestPayloads.NEXT_C2S_RequestSuggestions;  
  /**
 * [NEXT_C2S.CreateSuggestion]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CreateSuggestion]: RequestPayloads.NEXT_C2S_CreateSuggestion;  
  /**
 * [NEXT_C2S.VoteSuggestion]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.VoteSuggestion]: RequestPayloads.NEXT_C2S_VoteSuggestion;  
  /**
 * [NEXT_C2S.ReplySuggestion]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.ReplySuggestion]: RequestPayloads.NEXT_C2S_ReplySuggestion;  
  /**
 * [NEXT_C2S.MarkSuggestionRepliesRead]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.MarkSuggestionRepliesRead]: RequestPayloads.NEXT_C2S_MarkSuggestionRepliesRead;  
  /**
 * [NEXT_C2S.GmMarkSuggestionCompleted]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmMarkSuggestionCompleted]: RequestPayloads.NEXT_C2S_GmMarkSuggestionCompleted;  
  /**
 * [NEXT_C2S.GmRemoveSuggestion]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.GmRemoveSuggestion]: RequestPayloads.NEXT_C2S_GmRemoveSuggestion;  
  /**
 * [NEXT_C2S.RequestMailSummary]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMailSummary]: RequestPayloads.NEXT_C2S_RequestMailSummary;  
  /**
 * [NEXT_C2S.RequestMailPage]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMailPage]: RequestPayloads.NEXT_C2S_RequestMailPage;  
  /**
 * [NEXT_C2S.RequestMailDetail]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMailDetail]: RequestPayloads.NEXT_C2S_RequestMailDetail;  
  /**
 * [NEXT_C2S.RedeemCodes]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RedeemCodes]: RequestPayloads.NEXT_C2S_RedeemCodes;  
  /**
 * [NEXT_C2S.MarkMailRead]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.MarkMailRead]: RequestPayloads.NEXT_C2S_MarkMailRead;  
  /**
 * [NEXT_C2S.ClaimMailAttachments]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.ClaimMailAttachments]: RequestPayloads.NEXT_C2S_ClaimMailAttachments;  
  /**
 * [NEXT_C2S.DeleteMail]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.DeleteMail]: RequestPayloads.NEXT_C2S_DeleteMail;  
  /**
 * [NEXT_C2S.RequestQuests]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestQuests]: RequestPayloads.NEXT_C2S_RequestQuests;  
  /**
 * [NEXT_C2S.RequestNpcQuests]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestNpcQuests]: RequestPayloads.NEXT_C2S_RequestNpcQuests;  
  /**
 * [NEXT_C2S.AcceptNpcQuest]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.AcceptNpcQuest]: RequestPayloads.NEXT_C2S_AcceptNpcQuest;  
  /**
 * [NEXT_C2S.SubmitNpcQuest]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.SubmitNpcQuest]: RequestPayloads.NEXT_C2S_SubmitNpcQuest;  
  /**
 * [NEXT_C2S.RequestMarket]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMarket]: RequestPayloads.NEXT_C2S_RequestMarket;  
  /**
 * [NEXT_C2S.RequestMarketListings]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMarketListings]: RequestPayloads.NEXT_C2S_RequestMarketListings;  
  /**
 * [NEXT_C2S.RequestMarketItemBook]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMarketItemBook]: RequestPayloads.NEXT_C2S_RequestMarketItemBook;  
  /**
 * [NEXT_C2S.RequestMarketTradeHistory]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestMarketTradeHistory]: RequestPayloads.NEXT_C2S_RequestMarketTradeHistory;  
  /**
 * [NEXT_C2S.RequestAttrDetail]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestAttrDetail]: RequestPayloads.NEXT_C2S_RequestAttrDetail;  
  /**
 * [NEXT_C2S.RequestLeaderboard]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestLeaderboard]: RequestPayloads.NEXT_C2S_RequestLeaderboard;  
  /**
 * [NEXT_C2S.RequestLeaderboardPlayerLocations]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestLeaderboardPlayerLocations]: RequestPayloads.NEXT_C2S_RequestLeaderboardPlayerLocations;  
  /**
 * [NEXT_C2S.RequestWorldSummary]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestWorldSummary]: RequestPayloads.NEXT_C2S_RequestWorldSummary;  
  /**
 * [NEXT_C2S.StopLootHarvest]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.StopLootHarvest]: RequestPayloads.NEXT_C2S_StopLootHarvest;  
  /**
 * [NEXT_C2S.StartGather]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.StartGather]: RequestPayloads.NEXT_C2S_StartGather;  
  /**
 * [NEXT_C2S.CancelGather]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CancelGather]: RequestPayloads.NEXT_C2S_CancelGather;  
  /**
 * [NEXT_C2S.CreateMarketSellOrder]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CreateMarketSellOrder]: RequestPayloads.NEXT_C2S_CreateMarketSellOrder;  
  /**
 * [NEXT_C2S.CreateMarketBuyOrder]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CreateMarketBuyOrder]: RequestPayloads.NEXT_C2S_CreateMarketBuyOrder;  
  /**
 * [NEXT_C2S.BuyMarketItem]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.BuyMarketItem]: RequestPayloads.NEXT_C2S_BuyMarketItem;  
  /**
 * [NEXT_C2S.SellMarketItem]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.SellMarketItem]: RequestPayloads.NEXT_C2S_SellMarketItem;  
  /**
 * [NEXT_C2S.CancelMarketOrder]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CancelMarketOrder]: RequestPayloads.NEXT_C2S_CancelMarketOrder;  
  /**
 * [NEXT_C2S.ClaimMarketStorage]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.ClaimMarketStorage]: RequestPayloads.NEXT_C2S_ClaimMarketStorage;  
  /**
 * [NEXT_C2S.UsePortal]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UsePortal]: RequestPayloads.NEXT_C2S_UsePortal;  
  /**
 * [NEXT_C2S.UseItem]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UseItem]: RequestPayloads.NEXT_C2S_UseItem;  
  /**
 * [NEXT_C2S.DropItem]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.DropItem]: RequestPayloads.NEXT_C2S_DropItem;  
  /**
 * [NEXT_C2S.DestroyItem]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.DestroyItem]: RequestPayloads.NEXT_C2S_DestroyItem;  
  /**
 * [NEXT_C2S.TakeGround]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.TakeGround]: RequestPayloads.NEXT_C2S_TakeLoot;  
  /**
 * [NEXT_C2S.SortInventory]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.SortInventory]: RequestPayloads.NEXT_C2S_SortInventory;  
  /**
 * [NEXT_C2S.Equip]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Equip]: RequestPayloads.NEXT_C2S_Equip;  
  /**
 * [NEXT_C2S.Unequip]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Unequip]: RequestPayloads.NEXT_C2S_Unequip;  
  /**
 * [NEXT_C2S.Cultivate]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Cultivate]: RequestPayloads.NEXT_C2S_Cultivate;  
  /**
 * [NEXT_C2S.CastSkill]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CastSkill]: RequestPayloads.NEXT_C2S_CastSkill;  
  /**
 * [NEXT_C2S.RequestNpcShop]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestNpcShop]: RequestPayloads.NEXT_C2S_RequestNpcShop;  
  /**
 * [NEXT_C2S.BuyNpcShopItem]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.BuyNpcShopItem]: RequestPayloads.NEXT_C2S_BuyNpcShopItem;  
  /**
 * [NEXT_C2S.RequestAlchemyPanel]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestAlchemyPanel]: RequestPayloads.NEXT_C2S_RequestAlchemyPanel;  
  /**
 * [NEXT_C2S.SaveAlchemyPreset]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.SaveAlchemyPreset]: RequestPayloads.NEXT_C2S_SaveAlchemyPreset;  
  /**
 * [NEXT_C2S.DeleteAlchemyPreset]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.DeleteAlchemyPreset]: RequestPayloads.NEXT_C2S_DeleteAlchemyPreset;  
  /**
 * [NEXT_C2S.StartAlchemy]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.StartAlchemy]: RequestPayloads.NEXT_C2S_StartAlchemy;  
  /**
 * [NEXT_C2S.CancelAlchemy]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CancelAlchemy]: RequestPayloads.NEXT_C2S_CancelAlchemy;  
  /**
 * [NEXT_C2S.RequestEnhancementPanel]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.RequestEnhancementPanel]: RequestPayloads.NEXT_C2S_RequestEnhancementPanel;  
  /**
 * [NEXT_C2S.StartEnhancement]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.StartEnhancement]: RequestPayloads.NEXT_C2S_StartEnhancement;  
  /**
 * [NEXT_C2S.CancelEnhancement]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.CancelEnhancement]: RequestPayloads.NEXT_C2S_CancelEnhancement;  
  /**
 * [NEXT_C2S.UpdateAutoBattleSkills]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UpdateAutoBattleSkills]: RequestPayloads.NEXT_C2S_UpdateAutoBattleSkills;  
  /**
 * [NEXT_C2S.UpdateAutoUsePills]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UpdateAutoUsePills]: RequestPayloads.NEXT_C2S_UpdateAutoUsePills;  
  /**
 * [NEXT_C2S.UpdateCombatTargetingRules]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UpdateCombatTargetingRules]: RequestPayloads.NEXT_C2S_UpdateCombatTargetingRules;  
  /**
 * [NEXT_C2S.UpdateAutoBattleTargetingMode]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UpdateAutoBattleTargetingMode]: RequestPayloads.NEXT_C2S_UpdateAutoBattleTargetingMode;  
  /**
 * [NEXT_C2S.UpdateTechniqueSkillAvailability]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.UpdateTechniqueSkillAvailability]: RequestPayloads.NEXT_C2S_UpdateTechniqueSkillAvailability;  
  /**
 * [NEXT_C2S.DebugResetSpawn]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.DebugResetSpawn]: RequestPayloads.NEXT_C2S_DebugResetSpawn;  
  /**
 * [NEXT_C2S.Chat]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Chat]: RequestPayloads.NEXT_C2S_Chat;  
  /**
 * [NEXT_C2S.AckSystemMessages]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.AckSystemMessages]: RequestPayloads.NEXT_C2S_AckSystemMessages;  
  /**
 * [NEXT_C2S.HeavenGateAction]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.HeavenGateAction]: RequestPayloads.NEXT_C2S_HeavenGateAction;  
  /**
 * [NEXT_C2S.Ping]：NEXT_C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_C2S.Ping]: RequestPayloads.NEXT_C2S_Ping;
}

/** next 服务端事件与载荷映射，作为 bootstrap/panel/delta 的共享护栏。 */
export interface NEXT_S2C_PayloadMap extends Record<NEXT_S2C_EventName, unknown> {
/**
 * [NEXT_S2C.Bootstrap]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Bootstrap]: NEXT_S2C_Bootstrap;  
  /**
 * [NEXT_S2C.InitSession]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.InitSession]: ResponsePayloads.NEXT_S2C_InitSession;  
  /**
 * [NEXT_S2C.MapEnter]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MapEnter]: ResponsePayloads.NEXT_S2C_MapEnter;  
  /**
 * [NEXT_S2C.MapStatic]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MapStatic]: NEXT_S2C_MapStatic;  
  /**
 * [NEXT_S2C.Realm]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Realm]: ResponsePayloads.NEXT_S2C_Realm;  
  /**
 * [NEXT_S2C.WorldDelta]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.WorldDelta]: ResponsePayloads.NEXT_S2C_WorldDelta;  
  /**
 * [NEXT_S2C.SelfDelta]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.SelfDelta]: ResponsePayloads.NEXT_S2C_SelfDelta;  
  /**
 * [NEXT_S2C.PanelDelta]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.PanelDelta]: NEXT_S2C_PanelDelta;  
  /**
 * [NEXT_S2C.LootWindowUpdate]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.LootWindowUpdate]: ResponsePayloads.NEXT_S2C_LootWindowUpdate;  
  /**
 * [NEXT_S2C.QuestNavigateResult]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.QuestNavigateResult]: ResponsePayloads.NEXT_S2C_QuestNavigateResult;  
  /**
 * [NEXT_S2C.Notice]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Notice]: ResponsePayloads.NEXT_S2C_Notice;  
  /**
 * [NEXT_S2C.SuggestionUpdate]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.SuggestionUpdate]: ResponsePayloads.NEXT_S2C_SuggestionUpdate;  
  /**
 * [NEXT_S2C.MailSummary]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MailSummary]: ResponsePayloads.NEXT_S2C_MailSummary;  
  /**
 * [NEXT_S2C.MailPage]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MailPage]: ResponsePayloads.NEXT_S2C_MailPage;  
  /**
 * [NEXT_S2C.MailDetail]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MailDetail]: NEXT_S2C_MailDetail;  
  /**
 * [NEXT_S2C.RedeemCodesResult]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.RedeemCodesResult]: ResponsePayloads.NEXT_S2C_RedeemCodesResult;  
  /**
 * [NEXT_S2C.MailOpResult]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MailOpResult]: ResponsePayloads.NEXT_S2C_MailOpResult;  
  /**
 * [NEXT_S2C.Quests]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Quests]: ResponsePayloads.NEXT_S2C_QuestUpdate;  
  /**
 * [NEXT_S2C.NpcQuests]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.NpcQuests]: ResponsePayloads.NEXT_S2C_NpcQuests;  
  /**
 * [NEXT_S2C.MarketUpdate]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MarketUpdate]: ResponsePayloads.NEXT_S2C_MarketUpdate;  
  /**
 * [NEXT_S2C.MarketListings]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MarketListings]: ResponsePayloads.NEXT_S2C_MarketListings;  
  /**
 * [NEXT_S2C.MarketOrders]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MarketOrders]: ResponsePayloads.NEXT_S2C_MarketOrders;  
  /**
 * [NEXT_S2C.MarketStorage]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MarketStorage]: ResponsePayloads.NEXT_S2C_MarketStorage;  
  /**
 * [NEXT_S2C.MarketItemBook]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MarketItemBook]: ResponsePayloads.NEXT_S2C_MarketItemBook;  
  /**
 * [NEXT_S2C.MarketTradeHistory]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.MarketTradeHistory]: ResponsePayloads.NEXT_S2C_MarketTradeHistory;  
  /**
 * [NEXT_S2C.AttrDetail]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.AttrDetail]: NEXT_S2C_AttrDetail;  
  /**
 * [NEXT_S2C.Leaderboard]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Leaderboard]: ResponsePayloads.NEXT_S2C_Leaderboard;  
  /**
 * [NEXT_S2C.LeaderboardPlayerLocations]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.LeaderboardPlayerLocations]: ResponsePayloads.NEXT_S2C_LeaderboardPlayerLocations;  
  /**
 * [NEXT_S2C.WorldSummary]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.WorldSummary]: ResponsePayloads.NEXT_S2C_WorldSummary;  
  /**
 * [NEXT_S2C.Detail]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Detail]: NEXT_S2C_Detail;  
  /**
 * [NEXT_S2C.TileDetail]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.TileDetail]: ResponsePayloads.NEXT_S2C_TileDetail;  
  /**
 * [NEXT_S2C.NpcShop]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.NpcShop]: ResponsePayloads.NEXT_S2C_NpcShop;  
  /**
 * [NEXT_S2C.AlchemyPanel]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.AlchemyPanel]: NEXT_S2C_AlchemyPanel;  
  /**
 * [NEXT_S2C.EnhancementPanel]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.EnhancementPanel]: NEXT_S2C_EnhancementPanel;  
  /**
 * [NEXT_S2C.GmState]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.GmState]: ResponsePayloads.NEXT_S2C_GmState;  
  /**
 * [NEXT_S2C.Error]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Error]: ResponsePayloads.NEXT_S2C_Error;  
  /**
 * [NEXT_S2C.Kick]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Kick]: undefined;  
  /**
 * [NEXT_S2C.Pong]：NEXT_S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [NEXT_S2C.Pong]: ResponsePayloads.NEXT_S2C_Pong;
}

/** 根据 next 客户端事件名读取对应载荷类型。 */
export type NEXT_C2S_EventPayload<TEvent extends NEXT_C2S_EventName> = NEXT_C2S_PayloadMap[TEvent];

/** 根据 next 服务端事件名读取对应载荷类型。 */
export type NEXT_S2C_EventPayload<TEvent extends NEXT_S2C_EventName> = NEXT_S2C_PayloadMap[TEvent];

/** 根据中性客户端事件名读取对应载荷类型。 */
export type ClientToServerEventPayload<TEvent extends ClientToServerEventName> = NEXT_C2S_PayloadMap[TEvent];

/** 根据中性服务端事件名读取对应载荷类型。 */
export type ServerToClientEventPayload<TEvent extends ServerToClientEventName> = NEXT_S2C_PayloadMap[TEvent];

/** 中性客户端事件载荷映射。 */
export type ClientToServerPayloadMap = NEXT_C2S_PayloadMap;

/** 中性服务端事件载荷映射。 */
export type ServerToClientPayloadMap = NEXT_S2C_PayloadMap;

/** 更短的中性事件载荷映射别名。 */
export type C2S_PayloadMap = NEXT_C2S_PayloadMap;
export type S2C_PayloadMap = NEXT_S2C_PayloadMap;

/** 更短的中性事件载荷查询别名。 */
export type C2S_EventPayload<TEvent extends ClientToServerEventName> = NEXT_C2S_PayloadMap[TEvent];
export type S2C_EventPayload<TEvent extends ServerToClientEventName> = NEXT_S2C_PayloadMap[TEvent];

/** protocol.ts 内部定义的中性载荷/视图片段别名。 */
export type S2C_Bootstrap = NEXT_S2C_Bootstrap;
export type S2C_MapStatic = NEXT_S2C_MapStatic;
export type S2C_PanelDelta = NEXT_S2C_PanelDelta;
export type S2C_Tick = NEXT_S2C_Tick;
export type S2C_AttrUpdate = NEXT_S2C_AttrUpdate;
export type S2C_TechniqueUpdate = NEXT_S2C_TechniqueUpdate;
export type S2C_ActionsUpdate = NEXT_S2C_ActionsUpdate;
export type S2C_AlchemyPanel = NEXT_S2C_AlchemyPanel;
export type S2C_EnhancementPanel = NEXT_S2C_EnhancementPanel;
export type S2C_Detail = NEXT_S2C_Detail;
export type S2C_AttrDetail = NEXT_S2C_AttrDetail;
export type S2C_MailDetail = NEXT_S2C_MailDetail;

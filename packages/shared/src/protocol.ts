/**
 * 前后端通信协议：定义事件名，以及引导包、世界增量、面板增量、详情包等共享载荷。
 * C2S = 客户端→服务端，S2C = 服务端→客户端。
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
  S2C_ContainerDetail,
  S2C_GroundDetail,
  S2C_NpcDetail,
  S2C_MonsterDetail,
  S2C_PanelActionDelta,
  S2C_PanelAttrDelta,
  S2C_PanelBuffDelta,
  S2C_PanelEquipmentDelta,
  S2C_PanelInventoryDelta,
  S2C_PanelTechniqueDelta,
  S2C_PlayerDetail,
  S2C_PortalDetail,
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

/** 客户端发往服务端的事件名集合。 */
export const C2S = {
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
  CreateFormation: 'n:c:createFormation',
  SetFormationActive: 'n:c:setFormationActive',
  RefillFormation: 'n:c:refillFormation',
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

/** 服务端发往客户端的事件名集合。 */
export const S2C = {
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

/** 客户端事件名联合。 */
export type C2S_EventName = typeof C2S[keyof typeof C2S];

/** 服务端事件名联合。 */
export type S2C_EventName = typeof S2C[keyof typeof S2C];

/** 中性客户端事件名联合。 */
export type ClientToServerEventName = C2S_EventName;

/** 中性服务端事件名联合。 */
export type ServerToClientEventName = S2C_EventName;

/** 首次连接引导包：同步自身状态、首屏地图和小地图图鉴。 */
export interface S2C_Bootstrap extends BootstrapView {}

/** 地图静态快照：地图元数据、小地图、静态地块和标记增量。 */
export interface S2C_MapStatic extends MapStaticView {}

/** 面板总增量，按模块拆分下发。首连阶段允许只发 revision 占位，完整面板以 Bootstrap.self 为真源。 */
export interface S2C_PanelDelta {
/**
 * inv：inv相关字段。
 */

  inv?: S2C_PanelInventoryDelta;  
  /**
 * eq：eq相关字段。
 */

  eq?: S2C_PanelEquipmentDelta;  
  /**
 * tech：tech相关字段。
 */

  tech?: S2C_PanelTechniqueDelta;  
  /**
 * attr：attr相关字段。
 */

  attr?: S2C_PanelAttrDelta;  
  /**
 * act：act相关字段。
 */

  act?: S2C_PanelActionDelta;  
  /**
 * buff：buff相关字段。
 */

  buff?: S2C_PanelBuffDelta;
}

// ===== Payload 类型 =====

/** 高频 tick 增量：同步可见实体、地面物品、战斗特效和剩余路径。 */
export interface S2C_Tick extends ResponsePayloads.S2C_Tick {}

// ===== 修仙系统 Payload =====

/** 属性面板低频更新。 */
export interface S2C_AttrUpdate extends ResponsePayloads.S2C_AttrUpdate {}

/** 功法面板更新。 */
export interface S2C_TechniqueUpdate extends ResponsePayloads.S2C_TechniqueUpdate {}

/** 行动面板更新。 */
export interface S2C_ActionsUpdate extends ResponsePayloads.S2C_ActionsUpdate {}

/** 炼制面板同步包。 */
export interface S2C_AlchemyPanel extends AlchemyPanelSyncView {}

/** 强化面板同步包。 */
export interface S2C_EnhancementPanel extends EnhancementPanelSyncView {}

/** 通用详情包，根据 kind 携带不同目标的详情。 */
export interface S2C_Detail {
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

  npc?: S2C_NpcDetail;  
  /**
 * monster：怪物相关字段。
 */

  monster?: S2C_MonsterDetail;  
  /**
 * player：玩家引用。
 */

  player?: S2C_PlayerDetail;  
  /**
 * portal：portal相关字段。
 */

  portal?: S2C_PortalDetail;  
  /**
 * ground：ground相关字段。
 */

  ground?: S2C_GroundDetail;  
  /**
 * container：container相关字段。
 */

  container?: S2C_ContainerDetail;
}

/** 属性详情包。 */
export interface S2C_AttrDetail extends AttrDetailView {}

/** 邮件详情同步包。 */
export interface S2C_MailDetail extends MailDetailSyncView {}

// ===== 建议系统 Payload =====

/** 建议系统的收发载荷。 */

/** 客户端事件与载荷映射，作为 client/server/shared 的统一类型真源。 */
export interface C2S_PayloadMap extends Record<C2S_EventName, unknown> {
/**
 * [C2S.Hello]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Hello]: RequestPayloads.C2S_Hello;  
  /**
 * [C2S.Move]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Move]: RequestPayloads.C2S_Move;  
  /**
 * [C2S.MoveTo]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.MoveTo]: RequestPayloads.C2S_MoveTo;  
  /**
 * [C2S.NavigateQuest]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.NavigateQuest]: RequestPayloads.C2S_NavigateQuest;  
  /**
 * [C2S.Heartbeat]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Heartbeat]: RequestPayloads.C2S_Heartbeat;  
  /**
 * [C2S.UseAction]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UseAction]: RequestPayloads.C2S_Action;  
  /**
 * [C2S.RequestDetail]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestDetail]: RequestPayloads.C2S_RequestDetail;  
  /**
 * [C2S.RequestTileDetail]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestTileDetail]: RequestPayloads.C2S_InspectTileRuntime;  
  /**
 * [C2S.GmGetState]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmGetState]: RequestPayloads.C2S_GmGetState;  
  /**
 * [C2S.GmSpawnBots]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmSpawnBots]: RequestPayloads.C2S_GmSpawnBots;  
  /**
 * [C2S.GmRemoveBots]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmRemoveBots]: RequestPayloads.C2S_GmRemoveBots;  
  /**
 * [C2S.GmUpdatePlayer]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmUpdatePlayer]: RequestPayloads.C2S_GmUpdatePlayer;  
  /**
 * [C2S.GmResetPlayer]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmResetPlayer]: RequestPayloads.C2S_GmResetPlayer;  
  /**
 * [C2S.RequestSuggestions]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestSuggestions]: RequestPayloads.C2S_RequestSuggestions;  
  /**
 * [C2S.CreateSuggestion]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CreateSuggestion]: RequestPayloads.C2S_CreateSuggestion;  
  /**
 * [C2S.VoteSuggestion]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.VoteSuggestion]: RequestPayloads.C2S_VoteSuggestion;  
  /**
 * [C2S.ReplySuggestion]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.ReplySuggestion]: RequestPayloads.C2S_ReplySuggestion;  
  /**
 * [C2S.MarkSuggestionRepliesRead]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.MarkSuggestionRepliesRead]: RequestPayloads.C2S_MarkSuggestionRepliesRead;  
  /**
 * [C2S.GmMarkSuggestionCompleted]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmMarkSuggestionCompleted]: RequestPayloads.C2S_GmMarkSuggestionCompleted;  
  /**
 * [C2S.GmRemoveSuggestion]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.GmRemoveSuggestion]: RequestPayloads.C2S_GmRemoveSuggestion;  
  /**
 * [C2S.RequestMailSummary]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMailSummary]: RequestPayloads.C2S_RequestMailSummary;  
  /**
 * [C2S.RequestMailPage]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMailPage]: RequestPayloads.C2S_RequestMailPage;  
  /**
 * [C2S.RequestMailDetail]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMailDetail]: RequestPayloads.C2S_RequestMailDetail;  
  /**
 * [C2S.RedeemCodes]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RedeemCodes]: RequestPayloads.C2S_RedeemCodes;  
  /**
 * [C2S.MarkMailRead]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.MarkMailRead]: RequestPayloads.C2S_MarkMailRead;  
  /**
 * [C2S.ClaimMailAttachments]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.ClaimMailAttachments]: RequestPayloads.C2S_ClaimMailAttachments;  
  /**
 * [C2S.DeleteMail]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.DeleteMail]: RequestPayloads.C2S_DeleteMail;  
  /**
 * [C2S.RequestQuests]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestQuests]: RequestPayloads.C2S_RequestQuests;  
  /**
 * [C2S.RequestNpcQuests]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestNpcQuests]: RequestPayloads.C2S_RequestNpcQuests;  
  /**
 * [C2S.AcceptNpcQuest]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.AcceptNpcQuest]: RequestPayloads.C2S_AcceptNpcQuest;  
  /**
 * [C2S.SubmitNpcQuest]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.SubmitNpcQuest]: RequestPayloads.C2S_SubmitNpcQuest;  
  /**
 * [C2S.RequestMarket]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMarket]: RequestPayloads.C2S_RequestMarket;  
  /**
 * [C2S.RequestMarketListings]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMarketListings]: RequestPayloads.C2S_RequestMarketListings;  
  /**
 * [C2S.RequestMarketItemBook]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMarketItemBook]: RequestPayloads.C2S_RequestMarketItemBook;  
  /**
 * [C2S.RequestMarketTradeHistory]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestMarketTradeHistory]: RequestPayloads.C2S_RequestMarketTradeHistory;  
  /**
 * [C2S.RequestAttrDetail]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestAttrDetail]: RequestPayloads.C2S_RequestAttrDetail;  
  /**
 * [C2S.RequestLeaderboard]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestLeaderboard]: RequestPayloads.C2S_RequestLeaderboard;  
  /**
 * [C2S.RequestLeaderboardPlayerLocations]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestLeaderboardPlayerLocations]: RequestPayloads.C2S_RequestLeaderboardPlayerLocations;  
  /**
 * [C2S.RequestWorldSummary]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestWorldSummary]: RequestPayloads.C2S_RequestWorldSummary;  
  /**
 * [C2S.StopLootHarvest]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.StopLootHarvest]: RequestPayloads.C2S_StopLootHarvest;  
  /**
 * [C2S.StartGather]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.StartGather]: RequestPayloads.C2S_StartGather;  
  /**
 * [C2S.CancelGather]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CancelGather]: RequestPayloads.C2S_CancelGather;  
  /**
 * [C2S.CreateMarketSellOrder]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CreateMarketSellOrder]: RequestPayloads.C2S_CreateMarketSellOrder;  
  /**
 * [C2S.CreateMarketBuyOrder]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CreateMarketBuyOrder]: RequestPayloads.C2S_CreateMarketBuyOrder;  
  /**
 * [C2S.BuyMarketItem]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.BuyMarketItem]: RequestPayloads.C2S_BuyMarketItem;  
  /**
 * [C2S.SellMarketItem]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.SellMarketItem]: RequestPayloads.C2S_SellMarketItem;  
  /**
 * [C2S.CancelMarketOrder]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CancelMarketOrder]: RequestPayloads.C2S_CancelMarketOrder;  
  /**
 * [C2S.ClaimMarketStorage]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.ClaimMarketStorage]: RequestPayloads.C2S_ClaimMarketStorage;  
  /**
 * [C2S.UsePortal]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UsePortal]: RequestPayloads.C2S_UsePortal;  
  /**
 * [C2S.UseItem]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UseItem]: RequestPayloads.C2S_UseItem;  
  [C2S.CreateFormation]: RequestPayloads.C2S_CreateFormation;
  [C2S.SetFormationActive]: RequestPayloads.C2S_SetFormationActive;
  [C2S.RefillFormation]: RequestPayloads.C2S_RefillFormation;
  /**
 * [C2S.DropItem]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.DropItem]: RequestPayloads.C2S_DropItem;  
  /**
 * [C2S.DestroyItem]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.DestroyItem]: RequestPayloads.C2S_DestroyItem;  
  /**
 * [C2S.TakeGround]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.TakeGround]: RequestPayloads.C2S_TakeLoot;  
  /**
 * [C2S.SortInventory]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.SortInventory]: RequestPayloads.C2S_SortInventory;  
  /**
 * [C2S.Equip]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Equip]: RequestPayloads.C2S_Equip;  
  /**
 * [C2S.Unequip]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Unequip]: RequestPayloads.C2S_Unequip;  
  /**
 * [C2S.Cultivate]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Cultivate]: RequestPayloads.C2S_Cultivate;  
  /**
 * [C2S.CastSkill]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CastSkill]: RequestPayloads.C2S_CastSkill;  
  /**
 * [C2S.RequestNpcShop]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestNpcShop]: RequestPayloads.C2S_RequestNpcShop;  
  /**
 * [C2S.BuyNpcShopItem]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.BuyNpcShopItem]: RequestPayloads.C2S_BuyNpcShopItem;  
  /**
 * [C2S.RequestAlchemyPanel]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestAlchemyPanel]: RequestPayloads.C2S_RequestAlchemyPanel;  
  /**
 * [C2S.SaveAlchemyPreset]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.SaveAlchemyPreset]: RequestPayloads.C2S_SaveAlchemyPreset;  
  /**
 * [C2S.DeleteAlchemyPreset]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.DeleteAlchemyPreset]: RequestPayloads.C2S_DeleteAlchemyPreset;  
  /**
 * [C2S.StartAlchemy]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.StartAlchemy]: RequestPayloads.C2S_StartAlchemy;  
  /**
 * [C2S.CancelAlchemy]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CancelAlchemy]: RequestPayloads.C2S_CancelAlchemy;  
  /**
 * [C2S.RequestEnhancementPanel]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.RequestEnhancementPanel]: RequestPayloads.C2S_RequestEnhancementPanel;  
  /**
 * [C2S.StartEnhancement]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.StartEnhancement]: RequestPayloads.C2S_StartEnhancement;  
  /**
 * [C2S.CancelEnhancement]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.CancelEnhancement]: RequestPayloads.C2S_CancelEnhancement;  
  /**
 * [C2S.UpdateAutoBattleSkills]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UpdateAutoBattleSkills]: RequestPayloads.C2S_UpdateAutoBattleSkills;  
  /**
 * [C2S.UpdateAutoUsePills]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UpdateAutoUsePills]: RequestPayloads.C2S_UpdateAutoUsePills;  
  /**
 * [C2S.UpdateCombatTargetingRules]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UpdateCombatTargetingRules]: RequestPayloads.C2S_UpdateCombatTargetingRules;  
  /**
 * [C2S.UpdateAutoBattleTargetingMode]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UpdateAutoBattleTargetingMode]: RequestPayloads.C2S_UpdateAutoBattleTargetingMode;  
  /**
 * [C2S.UpdateTechniqueSkillAvailability]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.UpdateTechniqueSkillAvailability]: RequestPayloads.C2S_UpdateTechniqueSkillAvailability;  
  /**
 * [C2S.DebugResetSpawn]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.DebugResetSpawn]: RequestPayloads.C2S_DebugResetSpawn;  
  /**
 * [C2S.Chat]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Chat]: RequestPayloads.C2S_Chat;  
  /**
 * [C2S.AckSystemMessages]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.AckSystemMessages]: RequestPayloads.C2S_AckSystemMessages;  
  /**
 * [C2S.HeavenGateAction]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.HeavenGateAction]: RequestPayloads.C2S_HeavenGateAction;  
  /**
 * [C2S.Ping]：C2S_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [C2S.Ping]: RequestPayloads.C2S_Ping;
}

/** 服务端事件与载荷映射，作为 bootstrap/panel/delta 的共享护栏。 */
export interface S2C_PayloadMap extends Record<S2C_EventName, unknown> {
/**
 * [S2C.Bootstrap]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Bootstrap]: S2C_Bootstrap;  
  /**
 * [S2C.InitSession]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.InitSession]: ResponsePayloads.S2C_InitSession;  
  /**
 * [S2C.MapEnter]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MapEnter]: ResponsePayloads.S2C_MapEnter;  
  /**
 * [S2C.MapStatic]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MapStatic]: S2C_MapStatic;  
  /**
 * [S2C.Realm]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Realm]: ResponsePayloads.S2C_Realm;  
  /**
 * [S2C.WorldDelta]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.WorldDelta]: ResponsePayloads.S2C_WorldDelta;  
  /**
 * [S2C.SelfDelta]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.SelfDelta]: ResponsePayloads.S2C_SelfDelta;  
  /**
 * [S2C.PanelDelta]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.PanelDelta]: S2C_PanelDelta;  
  /**
 * [S2C.LootWindowUpdate]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.LootWindowUpdate]: ResponsePayloads.S2C_LootWindowUpdate;  
  /**
 * [S2C.QuestNavigateResult]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.QuestNavigateResult]: ResponsePayloads.S2C_QuestNavigateResult;  
  /**
 * [S2C.Notice]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Notice]: ResponsePayloads.S2C_Notice;  
  /**
 * [S2C.SuggestionUpdate]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.SuggestionUpdate]: ResponsePayloads.S2C_SuggestionUpdate;  
  /**
 * [S2C.MailSummary]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MailSummary]: ResponsePayloads.S2C_MailSummary;  
  /**
 * [S2C.MailPage]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MailPage]: ResponsePayloads.S2C_MailPage;  
  /**
 * [S2C.MailDetail]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MailDetail]: S2C_MailDetail;  
  /**
 * [S2C.RedeemCodesResult]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.RedeemCodesResult]: ResponsePayloads.S2C_RedeemCodesResult;  
  /**
 * [S2C.MailOpResult]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MailOpResult]: ResponsePayloads.S2C_MailOpResult;  
  /**
 * [S2C.Quests]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Quests]: ResponsePayloads.S2C_QuestUpdate;  
  /**
 * [S2C.NpcQuests]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.NpcQuests]: ResponsePayloads.S2C_NpcQuests;  
  /**
 * [S2C.MarketUpdate]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MarketUpdate]: ResponsePayloads.S2C_MarketUpdate;  
  /**
 * [S2C.MarketListings]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MarketListings]: ResponsePayloads.S2C_MarketListings;  
  /**
 * [S2C.MarketOrders]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MarketOrders]: ResponsePayloads.S2C_MarketOrders;  
  /**
 * [S2C.MarketStorage]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MarketStorage]: ResponsePayloads.S2C_MarketStorage;  
  /**
 * [S2C.MarketItemBook]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MarketItemBook]: ResponsePayloads.S2C_MarketItemBook;  
  /**
 * [S2C.MarketTradeHistory]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.MarketTradeHistory]: ResponsePayloads.S2C_MarketTradeHistory;  
  /**
 * [S2C.AttrDetail]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.AttrDetail]: S2C_AttrDetail;  
  /**
 * [S2C.Leaderboard]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Leaderboard]: ResponsePayloads.S2C_Leaderboard;  
  /**
 * [S2C.LeaderboardPlayerLocations]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.LeaderboardPlayerLocations]: ResponsePayloads.S2C_LeaderboardPlayerLocations;  
  /**
 * [S2C.WorldSummary]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.WorldSummary]: ResponsePayloads.S2C_WorldSummary;  
  /**
 * [S2C.Detail]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Detail]: S2C_Detail;  
  /**
 * [S2C.TileDetail]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.TileDetail]: ResponsePayloads.S2C_TileDetail;  
  /**
 * [S2C.NpcShop]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.NpcShop]: ResponsePayloads.S2C_NpcShop;  
  /**
 * [S2C.AlchemyPanel]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.AlchemyPanel]: S2C_AlchemyPanel;  
  /**
 * [S2C.EnhancementPanel]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.EnhancementPanel]: S2C_EnhancementPanel;  
  /**
 * [S2C.GmState]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.GmState]: ResponsePayloads.S2C_GmState;  
  /**
 * [S2C.Error]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Error]: ResponsePayloads.S2C_Error;  
  /**
 * [S2C.Kick]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Kick]: undefined;  
  /**
 * [S2C.Pong]：S2C_PayloadMap 协议映射条目，用于描述事件到 payload 类型的映射。
 */

  [S2C.Pong]: ResponsePayloads.S2C_Pong;
}

/** 根据客户端事件名读取对应载荷类型。 */
export type C2S_EventPayload<TEvent extends C2S_EventName> = C2S_PayloadMap[TEvent];

/** 根据服务端事件名读取对应载荷类型。 */
export type S2C_EventPayload<TEvent extends S2C_EventName> = S2C_PayloadMap[TEvent];

/** 根据中性客户端事件名读取对应载荷类型。 */
export type ClientToServerEventPayload<TEvent extends ClientToServerEventName> = C2S_PayloadMap[TEvent];

/** 根据中性服务端事件名读取对应载荷类型。 */
export type ServerToClientEventPayload<TEvent extends ServerToClientEventName> = S2C_PayloadMap[TEvent];

/** 中性客户端事件载荷映射。 */
export type ClientToServerPayloadMap = C2S_PayloadMap;

/** 中性服务端事件载荷映射。 */
export type ServerToClientPayloadMap = S2C_PayloadMap;

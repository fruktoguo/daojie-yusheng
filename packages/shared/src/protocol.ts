/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 前后端通信协议：定义事件名，以及引导包、世界增量、面板增量、详情包等共享载荷。
 * C2S = 客户端→服务端，S2C = 服务端→客户端。
 *
 * 本文件是协议的统一 barrel，接口定义按域拆分到：
 * - protocol-core.ts（会话、移动、系统、面板）
 * - protocol-combat.ts（战斗、行动）
 * - protocol-craft.ts（炼丹、强化）
 * - protocol-social.ts（邮件、建议、聊天）
 * - protocol-market.ts（市场，当前为域标记）
 */
import type * as RequestPayloads from './protocol-request-payload-types';
import type * as ResponsePayloads from './protocol-response-payload-types';

// ===== 域文件 re-export =====
export * from './protocol-core';
export * from './protocol-combat';
export * from './protocol-craft';
export * from './protocol-social';
export * from './protocol-market';

export type * from './protocol-request-payload-types';
export type * from './protocol-response-payload-types';

// ===== 域文件接口引用（供 PayloadMap 使用） =====
import type { S2C_Bootstrap, S2C_MapStatic, S2C_PanelDelta, S2C_Detail, S2C_AttrDetail } from './protocol-core';
import type { S2C_AlchemyPanel, S2C_EnhancementPanel } from './protocol-craft';
import type { S2C_MailDetail } from './protocol-social';
import type { C2S_RequestContentTemplates, S2C_ContentTemplates } from './content-resolver-types';

// ===== 本地 shadowing 接口（与 export type * 同名，必须留在本文件以避免 TS2308） =====

/** 高频 tick 增量：同步可见实体、地面物品、战斗特效和剩余路径。 */
export interface S2C_Tick extends ResponsePayloads.S2C_Tick {}

/** 属性面板低频更新。 */
export interface S2C_AttrUpdate extends ResponsePayloads.S2C_AttrUpdate {}

/** 功法面板更新。 */
export interface S2C_TechniqueUpdate extends ResponsePayloads.S2C_TechniqueUpdate {}

/** 行动面板更新。 */
export interface S2C_ActionsUpdate extends ResponsePayloads.S2C_ActionsUpdate {}

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
  RequestAuctionListings: 'n:c:requestAuctionListings',
  RequestMarketItemBook: 'n:c:requestMarketItemBook',
  RequestMarketTradeHistory: 'n:c:requestMarketTradeHistory',
  RequestAttrDetail: 'n:c:requestAttrDetail',
  RequestLeaderboard: 'n:c:requestLeaderboard',
  RequestLeaderboardPlayerLocations: 'n:c:requestLeaderboardPlayerLocations',
  RequestWorldSummary: 'n:c:requestWorldSummary',
  CreateMarketSellOrder: 'n:c:createMarketSellOrder',
  CreateMarketBuyOrder: 'n:c:createMarketBuyOrder',
  PlaceAuctionBid: 'n:c:placeAuctionBid',
  BuyoutAuctionLot: 'n:c:buyoutAuctionLot',
  BuyMarketItem: 'n:c:buyMarketItem',
  SellMarketItem: 'n:c:sellMarketItem',
  CancelMarketOrder: 'n:c:cancelMarketOrder',
  ClaimMarketStorage: 'n:c:claimMarketStorage',
  UsePortal: 'n:c:usePortal',
  UseItem: 'n:c:useItem',
  CreateFormation: 'n:c:createFormation',
  SetFormationActive: 'n:c:setFormationActive',
  RefillFormation: 'n:c:refillFormation',
  BuildPlaceIntent: 'n:c:buildPlaceIntent',
  BuildDeconstruct: 'n:c:buildDeconstruct',
  RoomSetRole: 'n:c:roomSetRole',
  FengShuiObserve: 'n:c:fengShuiObserve',
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
  AckOfflineGainReports: 'n:c:ackOfflineGainReports',
  HeavenGateAction: 'n:c:heavenGateAction',
  Ping: 'n:c:ping',
  ReportMinimapVersions: 'n:c:reportMinimapVersions',
  RequestContentTemplates: 'n:c:requestContentTemplates',
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
  OfflineGainReports: 'n:s:offlineGainReports',
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
  AuctionListings: 'n:s:auctionListings',
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
  BuildResult: 'n:s:buildResult',
  RoomSummaryPatch: 'n:s:roomSummaryPatch',
  FengShuiOverlayPatch: 'n:s:fengShuiOverlayPatch',
  FengShuiDetail: 'n:s:fengShuiDetail',
  GmState: 'n:s:gmState',
  Error: 'n:s:error',
  Kick: 'n:s:kick',
  Pong: 'n:s:pong',
  MinimapLibraryManifest: 'n:s:minimapLibraryManifest',
  MinimapLibraryDelta: 'n:s:minimapLibraryDelta',
  ContentTemplates: 'n:s:contentTemplates',
} as const;

/** 客户端事件名联合。 */
export type C2S_EventName = typeof C2S[keyof typeof C2S];

/** 服务端事件名联合。 */
export type S2C_EventName = typeof S2C[keyof typeof S2C];

/** 中性客户端事件名联合。 */
export type ClientToServerEventName = C2S_EventName;

/** 中性服务端事件名联合。 */
export type ServerToClientEventName = S2C_EventName;

/** 客户端事件与载荷映射，作为 client/server/shared 的统一类型真源。 */
export interface C2S_PayloadMap extends Record<C2S_EventName, unknown> {
  [C2S.Hello]: RequestPayloads.C2S_Hello;
  [C2S.Move]: RequestPayloads.C2S_Move;
  [C2S.MoveTo]: RequestPayloads.C2S_MoveTo;
  [C2S.NavigateQuest]: RequestPayloads.C2S_NavigateQuest;
  [C2S.Heartbeat]: RequestPayloads.C2S_Heartbeat;
  [C2S.UseAction]: RequestPayloads.C2S_Action;
  [C2S.RequestDetail]: RequestPayloads.C2S_RequestDetail;
  [C2S.RequestTileDetail]: RequestPayloads.C2S_InspectTileRuntime;
  [C2S.GmGetState]: RequestPayloads.C2S_GmGetState;
  [C2S.GmSpawnBots]: RequestPayloads.C2S_GmSpawnBots;
  [C2S.GmRemoveBots]: RequestPayloads.C2S_GmRemoveBots;
  [C2S.GmUpdatePlayer]: RequestPayloads.C2S_GmUpdatePlayer;
  [C2S.GmResetPlayer]: RequestPayloads.C2S_GmResetPlayer;
  [C2S.RequestSuggestions]: RequestPayloads.C2S_RequestSuggestions;
  [C2S.CreateSuggestion]: RequestPayloads.C2S_CreateSuggestion;
  [C2S.VoteSuggestion]: RequestPayloads.C2S_VoteSuggestion;
  [C2S.ReplySuggestion]: RequestPayloads.C2S_ReplySuggestion;
  [C2S.MarkSuggestionRepliesRead]: RequestPayloads.C2S_MarkSuggestionRepliesRead;
  [C2S.GmMarkSuggestionCompleted]: RequestPayloads.C2S_GmMarkSuggestionCompleted;
  [C2S.GmRemoveSuggestion]: RequestPayloads.C2S_GmRemoveSuggestion;
  [C2S.RequestMailSummary]: RequestPayloads.C2S_RequestMailSummary;
  [C2S.RequestMailPage]: RequestPayloads.C2S_RequestMailPage;
  [C2S.RequestMailDetail]: RequestPayloads.C2S_RequestMailDetail;
  [C2S.RedeemCodes]: RequestPayloads.C2S_RedeemCodes;
  [C2S.MarkMailRead]: RequestPayloads.C2S_MarkMailRead;
  [C2S.ClaimMailAttachments]: RequestPayloads.C2S_ClaimMailAttachments;
  [C2S.DeleteMail]: RequestPayloads.C2S_DeleteMail;
  [C2S.RequestQuests]: RequestPayloads.C2S_RequestQuests;
  [C2S.RequestNpcQuests]: RequestPayloads.C2S_RequestNpcQuests;
  [C2S.AcceptNpcQuest]: RequestPayloads.C2S_AcceptNpcQuest;
  [C2S.SubmitNpcQuest]: RequestPayloads.C2S_SubmitNpcQuest;
  [C2S.RequestMarket]: RequestPayloads.C2S_RequestMarket;
  [C2S.RequestMarketListings]: RequestPayloads.C2S_RequestMarketListings;
  [C2S.RequestAuctionListings]: RequestPayloads.C2S_RequestAuctionListings;
  [C2S.RequestMarketItemBook]: RequestPayloads.C2S_RequestMarketItemBook;
  [C2S.RequestMarketTradeHistory]: RequestPayloads.C2S_RequestMarketTradeHistory;
  [C2S.RequestAttrDetail]: RequestPayloads.C2S_RequestAttrDetail;
  [C2S.RequestLeaderboard]: RequestPayloads.C2S_RequestLeaderboard;
  [C2S.RequestLeaderboardPlayerLocations]: RequestPayloads.C2S_RequestLeaderboardPlayerLocations;
  [C2S.RequestWorldSummary]: RequestPayloads.C2S_RequestWorldSummary;
  [C2S.StopLootHarvest]: RequestPayloads.C2S_StopLootHarvest;
  [C2S.StartGather]: RequestPayloads.C2S_StartGather;
  [C2S.CancelGather]: RequestPayloads.C2S_CancelGather;
  [C2S.CreateMarketSellOrder]: RequestPayloads.C2S_CreateMarketSellOrder;
  [C2S.CreateMarketBuyOrder]: RequestPayloads.C2S_CreateMarketBuyOrder;
  [C2S.PlaceAuctionBid]: RequestPayloads.C2S_PlaceAuctionBid;
  [C2S.BuyoutAuctionLot]: RequestPayloads.C2S_BuyoutAuctionLot;
  [C2S.BuyMarketItem]: RequestPayloads.C2S_BuyMarketItem;
  [C2S.SellMarketItem]: RequestPayloads.C2S_SellMarketItem;
  [C2S.CancelMarketOrder]: RequestPayloads.C2S_CancelMarketOrder;
  [C2S.ClaimMarketStorage]: RequestPayloads.C2S_ClaimMarketStorage;
  [C2S.UsePortal]: RequestPayloads.C2S_UsePortal;
  [C2S.UseItem]: RequestPayloads.C2S_UseItem;
  [C2S.CreateFormation]: RequestPayloads.C2S_CreateFormation;
  [C2S.SetFormationActive]: RequestPayloads.C2S_SetFormationActive;
  [C2S.RefillFormation]: RequestPayloads.C2S_RefillFormation;
  [C2S.BuildPlaceIntent]: RequestPayloads.C2S_BuildPlaceIntent;
  [C2S.BuildDeconstruct]: RequestPayloads.C2S_BuildDeconstruct;
  [C2S.RoomSetRole]: RequestPayloads.C2S_RoomSetRole;
  [C2S.FengShuiObserve]: RequestPayloads.C2S_FengShuiObserve;
  [C2S.DropItem]: RequestPayloads.C2S_DropItem;
  [C2S.DestroyItem]: RequestPayloads.C2S_DestroyItem;
  [C2S.TakeGround]: RequestPayloads.C2S_TakeLoot;
  [C2S.SortInventory]: RequestPayloads.C2S_SortInventory;
  [C2S.Equip]: RequestPayloads.C2S_Equip;
  [C2S.Unequip]: RequestPayloads.C2S_Unequip;
  [C2S.Cultivate]: RequestPayloads.C2S_Cultivate;
  [C2S.CastSkill]: RequestPayloads.C2S_CastSkill;
  [C2S.RequestNpcShop]: RequestPayloads.C2S_RequestNpcShop;
  [C2S.BuyNpcShopItem]: RequestPayloads.C2S_BuyNpcShopItem;
  [C2S.RequestAlchemyPanel]: RequestPayloads.C2S_RequestAlchemyPanel;
  [C2S.SaveAlchemyPreset]: RequestPayloads.C2S_SaveAlchemyPreset;
  [C2S.DeleteAlchemyPreset]: RequestPayloads.C2S_DeleteAlchemyPreset;
  [C2S.StartAlchemy]: RequestPayloads.C2S_StartAlchemy;
  [C2S.CancelAlchemy]: RequestPayloads.C2S_CancelAlchemy;
  [C2S.RequestEnhancementPanel]: RequestPayloads.C2S_RequestEnhancementPanel;
  [C2S.StartEnhancement]: RequestPayloads.C2S_StartEnhancement;
  [C2S.CancelEnhancement]: RequestPayloads.C2S_CancelEnhancement;
  [C2S.UpdateAutoBattleSkills]: RequestPayloads.C2S_UpdateAutoBattleSkills;
  [C2S.UpdateAutoUsePills]: RequestPayloads.C2S_UpdateAutoUsePills;
  [C2S.UpdateCombatTargetingRules]: RequestPayloads.C2S_UpdateCombatTargetingRules;
  [C2S.UpdateAutoBattleTargetingMode]: RequestPayloads.C2S_UpdateAutoBattleTargetingMode;
  [C2S.UpdateTechniqueSkillAvailability]: RequestPayloads.C2S_UpdateTechniqueSkillAvailability;
  [C2S.DebugResetSpawn]: RequestPayloads.C2S_DebugResetSpawn;
  [C2S.Chat]: RequestPayloads.C2S_Chat;
  [C2S.AckSystemMessages]: RequestPayloads.C2S_AckSystemMessages;
  [C2S.AckOfflineGainReports]: RequestPayloads.C2S_AckOfflineGainReports;
  [C2S.HeavenGateAction]: RequestPayloads.C2S_HeavenGateAction;
  [C2S.Ping]: RequestPayloads.C2S_Ping;
  [C2S.ReportMinimapVersions]: RequestPayloads.C2S_ReportMinimapVersions;
  [C2S.RequestContentTemplates]: C2S_RequestContentTemplates;
}

/** 服务端事件与载荷映射，作为 bootstrap/panel/delta 的共享护栏。 */
export interface S2C_PayloadMap extends Record<S2C_EventName, unknown> {
  [S2C.Bootstrap]: S2C_Bootstrap;
  [S2C.InitSession]: ResponsePayloads.S2C_InitSession;
  [S2C.MapEnter]: ResponsePayloads.S2C_MapEnter;
  [S2C.MapStatic]: S2C_MapStatic;
  [S2C.Realm]: ResponsePayloads.S2C_Realm;
  [S2C.WorldDelta]: ResponsePayloads.S2C_WorldDelta;
  [S2C.SelfDelta]: ResponsePayloads.S2C_SelfDelta;
  [S2C.PanelDelta]: S2C_PanelDelta;
  [S2C.LootWindowUpdate]: ResponsePayloads.S2C_LootWindowUpdate;
  [S2C.QuestNavigateResult]: ResponsePayloads.S2C_QuestNavigateResult;
  [S2C.Notice]: ResponsePayloads.S2C_Notice;
  [S2C.OfflineGainReports]: ResponsePayloads.S2C_OfflineGainReports;
  [S2C.SuggestionUpdate]: ResponsePayloads.S2C_SuggestionUpdate;
  [S2C.MailSummary]: ResponsePayloads.S2C_MailSummary;
  [S2C.MailPage]: ResponsePayloads.S2C_MailPage;
  [S2C.MailDetail]: S2C_MailDetail;
  [S2C.RedeemCodesResult]: ResponsePayloads.S2C_RedeemCodesResult;
  [S2C.MailOpResult]: ResponsePayloads.S2C_MailOpResult;
  [S2C.Quests]: ResponsePayloads.S2C_QuestUpdate;
  [S2C.NpcQuests]: ResponsePayloads.S2C_NpcQuests;
  [S2C.MarketUpdate]: ResponsePayloads.S2C_MarketUpdate;
  [S2C.MarketListings]: ResponsePayloads.S2C_MarketListings;
  [S2C.AuctionListings]: ResponsePayloads.S2C_AuctionListings;
  [S2C.MarketOrders]: ResponsePayloads.S2C_MarketOrders;
  [S2C.MarketStorage]: ResponsePayloads.S2C_MarketStorage;
  [S2C.MarketItemBook]: ResponsePayloads.S2C_MarketItemBook;
  [S2C.MarketTradeHistory]: ResponsePayloads.S2C_MarketTradeHistory;
  [S2C.AttrDetail]: S2C_AttrDetail;
  [S2C.Leaderboard]: ResponsePayloads.S2C_Leaderboard;
  [S2C.LeaderboardPlayerLocations]: ResponsePayloads.S2C_LeaderboardPlayerLocations;
  [S2C.WorldSummary]: ResponsePayloads.S2C_WorldSummary;
  [S2C.Detail]: S2C_Detail;
  [S2C.TileDetail]: ResponsePayloads.S2C_TileDetail;
  [S2C.NpcShop]: ResponsePayloads.S2C_NpcShop;
  [S2C.AlchemyPanel]: S2C_AlchemyPanel;
  [S2C.EnhancementPanel]: S2C_EnhancementPanel;
  [S2C.BuildResult]: ResponsePayloads.S2C_BuildResult;
  [S2C.RoomSummaryPatch]: ResponsePayloads.S2C_RoomSummaryPatch;
  [S2C.FengShuiOverlayPatch]: ResponsePayloads.S2C_FengShuiOverlayPatch;
  [S2C.FengShuiDetail]: ResponsePayloads.S2C_FengShuiDetail;
  [S2C.GmState]: ResponsePayloads.S2C_GmState;
  [S2C.Error]: ResponsePayloads.S2C_Error;
  [S2C.Kick]: undefined;
  [S2C.Pong]: ResponsePayloads.S2C_Pong;
  [S2C.MinimapLibraryManifest]: ResponsePayloads.S2C_MinimapLibraryManifest;
  [S2C.MinimapLibraryDelta]: ResponsePayloads.S2C_MinimapLibraryDelta;
  [S2C.ContentTemplates]: S2C_ContentTemplates;
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

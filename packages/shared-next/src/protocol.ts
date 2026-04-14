/**
 * 前后端通信协议：事件名定义与所有 Payload 类型。
 * C2S = 客户端→服务端，S2C = 服务端→客户端。
 */
import type { ElementKey } from './numeric';
import { Direction, PlayerState, Tile, VisibleTile, RenderEntity, MapMeta, Attributes, Inventory, EquipmentSlots, TechniqueState, ActionDef, AttrBonus, EquipSlot, EntityKind, NpcQuestMarker, ObservationInsight, PlayerRealmState, PlayerRealmStage, PlayerSpecialStats, QuestState, CombatEffect, AutoBattleSkillConfig, ItemType, QuestLine, QuestObjectiveType, GameTimeState, MapTimeConfig, MonsterAggroMode, MonsterTier, NumericStatPercentages, TechniqueCategory, TechniqueGrade, GroundItemPileView, LootSearchProgressView, VisibleBuffState, TemporaryBuffState, ActionType, SkillDef, TechniqueAttrCurves, TechniqueLayerDef, TechniqueRealm, GroundItemEntryView, LootSourceKind, MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot, Suggestion, ItemStack, EquipmentEffectDef, ConsumableBuffDef, MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView, MapRouteDomain, PortalRouteDomain, MailSummaryView, MailPageView, MailDetailView, MailFilter, MailTemplateArg, MailAttachment, BodyTrainingState } from './types';
import { NumericRatioDivisors, NumericStats } from './numeric';

// ===== 事件名 =====

/** 客户端 → 服务端 */
export const C2S = {
  Move: 'c:move',
  MoveTo: 'c:moveTo',
  NavigateQuest: 'c:navigateQuest',
  Heartbeat: 'c:heartbeat',
  Ping: 'c:ping',
  GmGetState: 'c:gmGetState',
  GmSpawnBots: 'c:gmSpawnBots',
  GmRemoveBots: 'c:gmRemoveBots',
  GmUpdatePlayer: 'c:gmUpdatePlayer',
  GmResetPlayer: 'c:gmResetPlayer',
  Action: 'c:action',
  UpdateAutoBattleSkills: 'c:updateAutoBattleSkills',
  DebugResetSpawn: 'c:debugResetSpawn',
  Chat: 'c:chat',
  AckSystemMessages: 'c:ackSystemMessages',
  UseItem: 'c:useItem',
  DropItem: 'c:dropItem',
  DestroyItem: 'c:destroyItem',
  TakeLoot: 'c:takeLoot',
  SortInventory: 'c:sortInventory',
  InspectTileRuntime: 'c:inspectTileRuntime',
  Equip: 'c:equip',
  Unequip: 'c:unequip',
  Cultivate: 'c:cultivate',
  RequestSuggestions: 'c:requestSuggestions',
  RequestMailSummary: 'c:requestMailSummary',
  RequestMailPage: 'c:requestMailPage',
  RequestMailDetail: 'c:requestMailDetail',
  RedeemCodes: 'c:redeemCodes',
  MarkMailRead: 'c:markMailRead',
  ClaimMailAttachments: 'c:claimMailAttachments',
  DeleteMail: 'c:deleteMail',
  CreateSuggestion: 'c:createSuggestion',
  VoteSuggestion: 'c:voteSuggestion',
  ReplySuggestion: 'c:replySuggestion',
  MarkSuggestionRepliesRead: 'c:markSuggestionRepliesRead',
  GmMarkSuggestionCompleted: 'c:gmMarkSuggestionCompleted',
  GmRemoveSuggestion: 'c:gmRemoveSuggestion',
  RequestMarket: 'c:requestMarket',
  RequestMarketItemBook: 'c:requestMarketItemBook',
  RequestMarketTradeHistory: 'c:requestMarketTradeHistory',
  CreateMarketSellOrder: 'c:createMarketSellOrder',
  CreateMarketBuyOrder: 'c:createMarketBuyOrder',
  BuyMarketItem: 'c:buyMarketItem',
  SellMarketItem: 'c:sellMarketItem',
  CancelMarketOrder: 'c:cancelMarketOrder',
  ClaimMarketStorage: 'c:claimMarketStorage',
  RequestNpcShop: 'c:requestNpcShop',
  BuyNpcShopItem: 'c:buyNpcShopItem',
  HeavenGateAction: 'c:heavenGateAction',
} as const;

/** 服务端 → 客户端 */
export const S2C = {
  Init: 's:init',
  Tick: 's:tick',
  MapStaticSync: 's:mapStaticSync',
  RealmUpdate: 's:realmUpdate',
  Pong: 's:pong',
  GmState: 's:gmState',
  // 预留事件：当前服务端尚未正式使用
  Enter: 's:enter',
  Leave: 's:leave',
  Kick: 's:kick',
  Error: 's:error',
  // 预留事件：当前服务端尚未正式使用
  Dead: 's:dead',
  Respawn: 's:respawn',
  AttrUpdate: 's:attrUpdate',
  InventoryUpdate: 's:inventoryUpdate',
  EquipmentUpdate: 's:equipmentUpdate',
  TechniqueUpdate: 's:techniqueUpdate',
  ActionsUpdate: 's:actionsUpdate',
  LootWindowUpdate: 's:lootWindowUpdate',
  TileRuntimeDetail: 's:tileRuntimeDetail',
  QuestUpdate: 's:questUpdate',
  QuestNavigateResult: 's:questNavigateResult',
  SystemMsg: 's:systemMsg',
  MailSummary: 's:mailSummary',
  MailPage: 's:mailPage',
  MailDetail: 's:mailDetail',
  RedeemCodesResult: 's:redeemCodesResult',
  MailOpResult: 's:mailOpResult',
  SuggestionUpdate: 's:suggestionUpdate',
  MarketUpdate: 's:marketUpdate',
  MarketItemBook: 's:marketItemBook',
  MarketTradeHistory: 's:marketTradeHistory',
  NpcShop: 's:npcShop',
} as const;

/** server-next 客户端 → 服务端 */
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
  RequestMarketItemBook: 'n:c:requestMarketItemBook',
  RequestMarketTradeHistory: 'n:c:requestMarketTradeHistory',
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
  TakeGround: 'n:c:takeGround',
  SortInventory: 'n:c:sortInventory',
  Equip: 'n:c:equip',
  Unequip: 'n:c:unequip',
  Cultivate: 'n:c:cultivate',
  CastSkill: 'n:c:castSkill',
  RequestNpcShop: 'n:c:requestNpcShop',
  BuyNpcShopItem: 'n:c:buyNpcShopItem',
  UpdateAutoBattleSkills: 'n:c:updateAutoBattleSkills',
  UpdateTechniqueSkillAvailability: 'n:c:updateTechniqueSkillAvailability',
  DebugResetSpawn: 'n:c:debugResetSpawn',
  Chat: 'n:c:chat',
  AckSystemMessages: 'n:c:ackSystemMessages',
  HeavenGateAction: 'n:c:heavenGateAction',
  Ping: 'n:c:ping',
} as const;

/** server-next 服务端 → 客户端 */
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
  MarketItemBook: 'n:s:marketItemBook',
  MarketTradeHistory: 'n:s:marketTradeHistory',
  Detail: 'n:s:detail',
  TileDetail: 'n:s:tileDetail',
  NpcShop: 'n:s:npcShop',
  GmState: 'n:s:gmState',
  Error: 'n:s:error',
  Kick: 'n:s:kick',
  Pong: 'n:s:pong',
} as const;

/** NEXT_S2C_Bootstrap：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_Bootstrap {
/** self：定义该变量以承载业务值。 */
  self: PlayerState;
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta;
  minimap?: MapMinimapSnapshot;
  visibleMinimapMarkers?: MapMinimapMarker[];
/** minimapLibrary：定义该变量以承载业务值。 */
  minimapLibrary: MapMinimapArchiveEntry[];
/** tiles：定义该变量以承载业务值。 */
  tiles: VisibleTile[][];
/** players：定义该变量以承载业务值。 */
  players: RenderEntity[];
  time?: GameTimeState;
  auraLevelBaseValue?: number;
}
/** NEXT_S2C_LootWindowUpdate：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_LootWindowUpdate {
/** window：定义该变量以承载业务值。 */
  window: SyncedLootWindowState | null;
}

/** NEXT_S2C_QuestNavigateResult：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_QuestNavigateResult {
/** questId：定义该变量以承载业务值。 */
  questId: string;
/** ok：定义该变量以承载业务值。 */
  ok: boolean;
  error?: string;
}

/** NEXT_S2C_RedeemCodesResult：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_RedeemCodesResult {
/** result：定义该变量以承载业务值。 */
  result: AccountRedeemCodesRes;
}

/** NEXT_S2C_GmState：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_GmState {
/** players：定义该变量以承载业务值。 */
  players: GmPlayerSummary[];
/** mapIds：定义该变量以承载业务值。 */
  mapIds: string[];
/** botCount：定义该变量以承载业务值。 */
  botCount: number;
/** perf：定义该变量以承载业务值。 */
  perf: GmPerformanceSnapshot;
}

/** NEXT_S2C_InitSession：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_InitSession {
/** sid：定义该变量以承载业务值。 */
  sid: string;
/** pid：定义该变量以承载业务值。 */
  pid: string;
/** t：定义该变量以承载业务值。 */
  t: number;
  resumed?: boolean;
}

/** NEXT_S2C_MapEnter：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_MapEnter {
/** iid：定义该变量以承载业务值。 */
  iid: string;
/** mid：定义该变量以承载业务值。 */
  mid: string;
/** n：定义该变量以承载业务值。 */
  n: string;
/** k：定义该变量以承载业务值。 */
  k: string;
/** w：定义该变量以承载业务值。 */
  w: number;
/** h：定义该变量以承载业务值。 */
  h: number;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
}

/** NEXT_S2C_MapStatic：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_MapStatic {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
  mapMeta?: MapMeta;
  minimap?: MapMinimapSnapshot;
  minimapLibrary?: MapMinimapArchiveEntry[];
  tiles?: VisibleTile[][];
  tilesOriginX?: number;
  tilesOriginY?: number;
  tilePatches?: VisibleTilePatch[];
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibleMinimapMarkerAdds?: MapMinimapMarker[];
  visibleMinimapMarkerRemoves?: string[];
}

/** NEXT_S2C_NoticeItem：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_NoticeItem {
  id?: number;
  messageId?: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'info' | 'success' | 'warn' | 'travel' | 'combat' | 'loot' | 'system' | 'chat' | 'grudge' | 'quest';
/** text：定义该变量以承载业务值。 */
  text: string;
  from?: string;
  occurredAt?: number;
  persistUntilAck?: boolean;
}

/** NEXT_S2C_Notice：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_Notice {
/** items：定义该变量以承载业务值。 */
  items: NEXT_S2C_NoticeItem[];
}

/** NEXT_S2C_Realm：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_Realm {
/** realm：定义该变量以承载业务值。 */
  realm: PlayerRealmState | null;
}

/** NEXT_S2C_WorldPlayerPatch：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldPlayerPatch {
/** id：定义该变量以承载业务值。 */
  id: string;
  x?: number;
  y?: number;
  sc?: number | null;
  rm?: 1;
}

/** NEXT_S2C_WorldMonsterPatch：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldMonsterPatch {
/** id：定义该变量以承载业务值。 */
  id: string;
  mid?: string;
  x?: number;
  y?: number;
  hp?: number;
  maxHp?: number;
  n?: string;
  c?: string;
  tr?: MonsterTier;
  sc?: number | null;
  rm?: 1;
}

/** NEXT_S2C_WorldNpcPatch：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldNpcPatch {
/** id：定义该变量以承载业务值。 */
  id: string;
  x?: number;
  y?: number;
  n?: string;
  ch?: string;
  c?: string;
  sh?: 1;
  qm?: NpcQuestMarker | null;
  rm?: 1;
}

/** NEXT_S2C_WorldPortalPatch：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldPortalPatch {
/** id：定义该变量以承载业务值。 */
  id: string;
  x?: number;
  y?: number;
  tm?: string;
  tr?: 0 | 1;
  rm?: 1;
}

/** NEXT_S2C_WorldGroundPatch：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldGroundPatch {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  items?: GroundItemEntryView[] | null;
}

/** NEXT_S2C_WorldContainerPatch：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldContainerPatch {
/** id：定义该变量以承载业务值。 */
  id: string;
  x?: number;
  y?: number;
  n?: string;
  ch?: string;
  c?: string;
  rm?: 1;
}

/** NEXT_S2C_WorldDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_WorldDelta {
/** t：定义该变量以承载业务值。 */
  t: number;
/** wr：定义该变量以承载业务值。 */
  wr: number;
/** sr：定义该变量以承载业务值。 */
  sr: number;
  p?: NEXT_S2C_WorldPlayerPatch[];
  m?: NEXT_S2C_WorldMonsterPatch[];
  n?: NEXT_S2C_WorldNpcPatch[];
  o?: NEXT_S2C_WorldPortalPatch[];
  g?: NEXT_S2C_WorldGroundPatch[];
  c?: NEXT_S2C_WorldContainerPatch[];
  threatArrows?: [string, string][];
  threatArrowAdds?: [string, string][];
  threatArrowRemoves?: [string, string][];
  fx?: CombatEffect[];
  path?: [number, number][];
  dt?: number;
  time?: GameTimeState;
  auraLevelBaseValue?: number;
  v?: VisibleTile[][];
  tp?: VisibleTilePatch[];
  mid?: string;
}

/** NEXT_S2C_SelfDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_SelfDelta {
/** sr：定义该变量以承载业务值。 */
  sr: number;
  iid?: string;
  mid?: string;
  x?: number;
  y?: number;
  f?: Direction;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
}

/** NEXT_S2C_PanelInventoryDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelInventoryDelta {
/** r：定义该变量以承载业务值。 */
  r: number;
  full?: 1;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
}

/** NEXT_S2C_PanelEquipmentDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelEquipmentDelta {
/** r：定义该变量以承载业务值。 */
  r: number;
  full?: 1;
/** slots：定义该变量以承载业务值。 */
  slots: EquipmentSlotUpdateEntry[];
}

/** NEXT_S2C_PanelTechniqueDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelTechniqueDelta {
/** r：定义该变量以承载业务值。 */
  r: number;
  full?: 1;
  techniques?: TechniqueUpdateEntry[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** NEXT_S2C_PanelAttrDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelAttrDelta {
/** r：定义该变量以承载业务值。 */
  r: number;
  full?: 1;
  stage?: PlayerRealmStage;
  baseAttrs?: Attributes;
  bonuses?: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  specialStats?: PlayerSpecialStats;
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
  lifespanYears?: number | null;
  realmProgress?: number;
  realmProgressToNext?: number;
  realmBreakthroughReady?: boolean;
}

/** NEXT_S2C_PanelActionDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelActionDelta {
/** r：定义该变量以承载业务值。 */
  r: number;
  full?: 1;
  actions?: ActionUpdateEntry[];
  removeActionIds?: string[];
  actionOrder?: string[];
  autoBattle?: boolean;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  cultivationActive?: boolean;
  senseQiActive?: boolean;
}

/** NEXT_S2C_PanelBuffDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelBuffDelta {
/** r：定义该变量以承载业务值。 */
  r: number;
  full?: 1;
  buffs?: VisibleBuffState[];
  removeBuffIds?: string[];
}

/** NEXT_S2C_PanelDelta：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PanelDelta {
  inv?: NEXT_S2C_PanelInventoryDelta;
  eq?: NEXT_S2C_PanelEquipmentDelta;
  tech?: NEXT_S2C_PanelTechniqueDelta;
  attr?: NEXT_S2C_PanelAttrDelta;
  act?: NEXT_S2C_PanelActionDelta;
  buff?: NEXT_S2C_PanelBuffDelta;
}

// ===== Payload 类型 =====

/** 移动指令 */
export interface C2S_Move {
/** d：定义该变量以承载业务值。 */
  d: Direction;
}

/** 点击目标点移动 */
export interface C2S_MoveTo {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  ignoreVisibilityLimit?: boolean;
  allowNearestReachable?: boolean;
  packedPath?: string;
  packedPathSteps?: number;
  pathStartX?: number;
  pathStartY?: number;
}

/** 以任务为目标启动自动导航 */
export interface C2S_NavigateQuest {
/** questId：定义该变量以承载业务值。 */
  questId: string;
}

/** 在线心跳 */
export interface C2S_Heartbeat {
  clientAt?: number;
}

/** 客户端主动延迟探测 */
export interface C2S_Ping {
/** clientAt：定义该变量以承载业务值。 */
  clientAt: number;
}

/** C2S_InspectTileRuntime：定义该接口的能力与字段约束。 */
export interface C2S_InspectTileRuntime {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
}

/** 服务端立即回显延迟探测 */
export interface S2C_Pong {
/** clientAt：定义该变量以承载业务值。 */
  clientAt: number;
/** serverAt：定义该变量以承载业务值。 */
  serverAt: number;
}

/** C2S_GmGetState：定义该接口的能力与字段约束。 */
export interface C2S_GmGetState {}

/** C2S_GmSpawnBots：定义该接口的能力与字段约束。 */
export interface C2S_GmSpawnBots {
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** C2S_GmRemoveBots：定义该接口的能力与字段约束。 */
export interface C2S_GmRemoveBots {
  playerIds?: string[];
  all?: boolean;
}

/** C2S_GmUpdatePlayer：定义该接口的能力与字段约束。 */
export interface C2S_GmUpdatePlayer {
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** autoBattle：定义该变量以承载业务值。 */
  autoBattle: boolean;
}

/** C2S_GmResetPlayer：定义该接口的能力与字段约束。 */
export interface C2S_GmResetPlayer {
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
}

/** 动作指令 */
export interface C2S_Action {
  type?: string;
  actionId?: string;
  target?: string;
}

/** C2S_UpdateAutoBattleSkills：定义该接口的能力与字段约束。 */
export interface C2S_UpdateAutoBattleSkills {
/** skills：定义该变量以承载业务值。 */
  skills: AutoBattleSkillConfig[];
}

/** C2S_UpdateTechniqueSkillAvailability：定义该接口的能力与字段约束。 */
export interface C2S_UpdateTechniqueSkillAvailability {
/** techId：定义该变量以承载业务值。 */
  techId: string;
/** enabled：定义该变量以承载业务值。 */
  enabled: boolean;
}

/** 调试：回出生点 */
export interface C2S_DebugResetSpawn {
  force?: boolean;
}

/** 聊天消息 */
export interface C2S_Chat {
/** message：定义该变量以承载业务值。 */
  message: string;
}

/** C2S_AckSystemMessages：定义该接口的能力与字段约束。 */
export interface C2S_AckSystemMessages {
/** ids：定义该变量以承载业务值。 */
  ids: string[];
}

/** C2S_RequestMarket：定义该接口的能力与字段约束。 */
export interface C2S_RequestMarket {}

/** C2S_RequestMailSummary：定义该接口的能力与字段约束。 */
export interface C2S_RequestMailSummary {}

/** C2S_RequestMailPage：定义该接口的能力与字段约束。 */
export interface C2S_RequestMailPage {
/** page：定义该变量以承载业务值。 */
  page: number;
  pageSize?: number;
  filter?: MailFilter;
}

/** C2S_RequestMailDetail：定义该接口的能力与字段约束。 */
export interface C2S_RequestMailDetail {
/** mailId：定义该变量以承载业务值。 */
  mailId: string;
}

/** C2S_RequestQuests：定义该接口的能力与字段约束。 */
export interface C2S_RequestQuests {}

/** C2S_RequestNpcQuests：定义该接口的能力与字段约束。 */
export interface C2S_RequestNpcQuests {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
}

/** C2S_AcceptNpcQuest：定义该接口的能力与字段约束。 */
export interface C2S_AcceptNpcQuest {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** questId：定义该变量以承载业务值。 */
  questId: string;
}

/** C2S_SubmitNpcQuest：定义该接口的能力与字段约束。 */
export interface C2S_SubmitNpcQuest {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** questId：定义该变量以承载业务值。 */
  questId: string;
}

/** C2S_RequestDetail：定义该接口的能力与字段约束。 */
export interface C2S_RequestDetail {
/** kind：定义该变量以承载业务值。 */
  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';
/** id：定义该变量以承载业务值。 */
  id: string;
}

/** C2S_MarkMailRead：定义该接口的能力与字段约束。 */
export interface C2S_MarkMailRead {
/** mailIds：定义该变量以承载业务值。 */
  mailIds: string[];
}

/** C2S_ClaimMailAttachments：定义该接口的能力与字段约束。 */
export interface C2S_ClaimMailAttachments {
/** mailIds：定义该变量以承载业务值。 */
  mailIds: string[];
}

/** C2S_DeleteMail：定义该接口的能力与字段约束。 */
export interface C2S_DeleteMail {
/** mailIds：定义该变量以承载业务值。 */
  mailIds: string[];
}

/** C2S_RequestMarketItemBook：定义该接口的能力与字段约束。 */
export interface C2S_RequestMarketItemBook {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
}

/** C2S_RequestMarketTradeHistory：定义该接口的能力与字段约束。 */
export interface C2S_RequestMarketTradeHistory {
/** page：定义该变量以承载业务值。 */
  page: number;
}

/** C2S_CreateMarketSellOrder：定义该接口的能力与字段约束。 */
export interface C2S_CreateMarketSellOrder {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
}

/** C2S_CreateMarketBuyOrder：定义该接口的能力与字段约束。 */
export interface C2S_CreateMarketBuyOrder {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
}

/** C2S_BuyMarketItem：定义该接口的能力与字段约束。 */
export interface C2S_BuyMarketItem {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
}

/** C2S_SellMarketItem：定义该接口的能力与字段约束。 */
export interface C2S_SellMarketItem {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
}

/** C2S_CancelMarketOrder：定义该接口的能力与字段约束。 */
export interface C2S_CancelMarketOrder {
/** orderId：定义该变量以承载业务值。 */
  orderId: string;
}

/** C2S_ClaimMarketStorage：定义该接口的能力与字段约束。 */
export interface C2S_ClaimMarketStorage {}

/** C2S_RequestNpcShop：定义该接口的能力与字段约束。 */
export interface C2S_RequestNpcShop {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
}

/** C2S_BuyNpcShopItem：定义该接口的能力与字段约束。 */
export interface C2S_BuyNpcShopItem {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
}

/** C2S_HeavenGateAction：定义该接口的能力与字段约束。 */
export interface C2S_HeavenGateAction {
/** action：定义该变量以承载业务值。 */
  action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter';
  element?: ElementKey;
}

/** Tick 增量实体数据（支持 null 表示清除字段） */
export interface TickRenderEntity {
/** id：定义该变量以承载业务值。 */
  id: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  char?: string;
  color?: string;
  name?: string | null;
  kind?: EntityKind | 'player' | null;
  monsterTier?: MonsterTier | null;
  monsterScale?: number | null;
  hp?: number | null;
  maxHp?: number | null;
  qi?: number | null;
  maxQi?: number | null;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
  buffs?: VisibleBuffState[] | null;
}

/** ObservationLootPreviewEntry：定义该接口的能力与字段约束。 */
export interface ObservationLootPreviewEntry {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
/** count：定义该变量以承载业务值。 */
  count: number;
/** chance：定义该变量以承载业务值。 */
  chance: number;
}

/** ObservationLootPreview：定义该接口的能力与字段约束。 */
export interface ObservationLootPreview {
/** entries：定义该变量以承载业务值。 */
  entries: ObservationLootPreviewEntry[];
  emptyText?: string;
}

/** ObservedTileEntityDetail：定义该接口的能力与字段约束。 */
export interface ObservedTileEntityDetail {
/** id：定义该变量以承载业务值。 */
  id: string;
  name?: string;
  kind?: EntityKind | 'player' | null;
  monsterTier?: MonsterTier | null;
  monsterScale?: number | null;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
  lootPreview?: ObservationLootPreview | null;
  buffs?: VisibleBuffState[] | null;
}

/** 地面物品堆增量补丁 */
export interface GroundItemPilePatch {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  items?: GroundItemEntryView[] | null;
}

/** 视野内地块增量补丁 */
export interface VisibleTilePatch {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** tile：定义该变量以承载业务值。 */
  tile: VisibleTile | null;
}

/** S2C_Tick：定义该接口的能力与字段约束。 */
export interface S2C_Tick {
  p: TickRenderEntity[];                          // 玩家可见实体（含自身）
  t?: VisibleTilePatch[];                         // 视野内地块动态 patch
  e: TickRenderEntity[];                          // 怪物 / NPC 可见实体
  r?: string[];                                   // 当前 tick 离开视野的实体 ID
  threatArrows?: [string, string][];              // 仇恨箭头完整快照（仅首包/重同步）
  threatArrowAdds?: [string, string][];           // 仇恨箭头增量新增
  threatArrowRemoves?: [string, string][];        // 仇恨箭头增量移除
  g?: GroundItemPilePatch[];                      // 视野内地面物品 patch
  fx?: CombatEffect[];                            // 当前 tick 触发的战斗特效
  v?: VisibleTile[][];                            // 视野 tiles（null 表示当前不可见）
  dt?: number;                                    // 实际 tick 间隔（毫秒）
  m?: string;                                     // 当前地图 ID（跨图时用于同步客户端状态）
  path?: [number, number][];                      // 当前剩余路径点
  hp?: number;                                    // 当前玩家 HP
  qi?: number;                                    // 当前玩家灵力
  f?: Direction;                                  // 当前玩家朝向
  time?: GameTimeState;                           // 当前地图时间状态
  auraLevelBaseValue?: number;                    // 灵气等级基准值
}

/** 地图静态同步：低频重同步当前地图元数据、小地图与静态标记 */
export interface S2C_MapStaticSync {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
  mapMeta?: MapMeta;
  minimap?: MapMinimapSnapshot;
  minimapLibrary?: MapMinimapArchiveEntry[];
  tiles?: VisibleTile[][];
  tilesOriginX?: number;
  tilesOriginY?: number;
  tilePatches?: VisibleTilePatch[];
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibleMinimapMarkerAdds?: MapMinimapMarker[];
  visibleMinimapMarkerRemoves?: string[];
}

/** 实体进入视野 */
export interface S2C_Enter {
/** entity：定义该变量以承载业务值。 */
  entity: RenderEntity;
}

/** 实体离开视野 */
export interface S2C_Leave {
/** entityId：定义该变量以承载业务值。 */
  entityId: string;
}

/** 初始化数据（连接成功后发送） */
export interface S2C_Init {
/** self：定义该变量以承载业务值。 */
  self: PlayerState;
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta;
  minimap?: MapMinimapSnapshot;
  visibleMinimapMarkers?: MapMinimapMarker[];
/** minimapLibrary：定义该变量以承载业务值。 */
  minimapLibrary: MapMinimapArchiveEntry[];
/** tiles：定义该变量以承载业务值。 */
  tiles: VisibleTile[][];
  players: RenderEntity[]; // 初始可见玩家实体（含自身）
  time?: GameTimeState;
  auraLevelBaseValue?: number;
}

/** GM 玩家摘要 */
export interface GmPlayerSummary {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** roleName：定义该变量以承载业务值。 */
  roleName: string;
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
  accountName?: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** dead：定义该变量以承载业务值。 */
  dead: boolean;
/** autoBattle：定义该变量以承载业务值。 */
  autoBattle: boolean;
/** isBot：定义该变量以承载业务值。 */
  isBot: boolean;
}

/** GM 网络流量分桶统计 */
export interface GmNetworkBucket {
/** key：定义该变量以承载业务值。 */
  key: string;
/** label：定义该变量以承载业务值。 */
  label: string;
/** bytes：定义该变量以承载业务值。 */
  bytes: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** GM CPU 统计快照 */
export interface GmCpuSectionSnapshot {
/** key：定义该变量以承载业务值。 */
  key: string;
/** label：定义该变量以承载业务值。 */
  label: string;
/** totalMs：定义该变量以承载业务值。 */
  totalMs: number;
/** percent：定义该变量以承载业务值。 */
  percent: number;
/** count：定义该变量以承载业务值。 */
  count: number;
/** avgMs：定义该变量以承载业务值。 */
  avgMs: number;
}

/** GM CPU 统计快照 */
export interface GmCpuSnapshot {
/** cores：定义该变量以承载业务值。 */
  cores: number;
/** loadAvg1m：定义该变量以承载业务值。 */
  loadAvg1m: number;
/** loadAvg5m：定义该变量以承载业务值。 */
  loadAvg5m: number;
/** loadAvg15m：定义该变量以承载业务值。 */
  loadAvg15m: number;
/** processUptimeSec：定义该变量以承载业务值。 */
  processUptimeSec: number;
/** systemUptimeSec：定义该变量以承载业务值。 */
  systemUptimeSec: number;
/** userCpuMs：定义该变量以承载业务值。 */
  userCpuMs: number;
/** systemCpuMs：定义该变量以承载业务值。 */
  systemCpuMs: number;
/** rssMb：定义该变量以承载业务值。 */
  rssMb: number;
/** heapUsedMb：定义该变量以承载业务值。 */
  heapUsedMb: number;
/** heapTotalMb：定义该变量以承载业务值。 */
  heapTotalMb: number;
/** externalMb：定义该变量以承载业务值。 */
  externalMb: number;
/** profileStartedAt：定义该变量以承载业务值。 */
  profileStartedAt: number;
/** profileElapsedSec：定义该变量以承载业务值。 */
  profileElapsedSec: number;
/** breakdown：定义该变量以承载业务值。 */
  breakdown: GmCpuSectionSnapshot[];
}

/** GmPathfindingFailureBucket：定义该接口的能力与字段约束。 */
export interface GmPathfindingFailureBucket {
/** reason：定义该变量以承载业务值。 */
  reason: string;
/** label：定义该变量以承载业务值。 */
  label: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** GmPathfindingSnapshot：定义该接口的能力与字段约束。 */
export interface GmPathfindingSnapshot {
/** statsStartedAt：定义该变量以承载业务值。 */
  statsStartedAt: number;
/** statsElapsedSec：定义该变量以承载业务值。 */
  statsElapsedSec: number;
/** workerCount：定义该变量以承载业务值。 */
  workerCount: number;
/** runningWorkers：定义该变量以承载业务值。 */
  runningWorkers: number;
/** idleWorkers：定义该变量以承载业务值。 */
  idleWorkers: number;
/** peakRunningWorkers：定义该变量以承载业务值。 */
  peakRunningWorkers: number;
/** queueDepth：定义该变量以承载业务值。 */
  queueDepth: number;
/** peakQueueDepth：定义该变量以承载业务值。 */
  peakQueueDepth: number;
/** enqueued：定义该变量以承载业务值。 */
  enqueued: number;
/** dispatched：定义该变量以承载业务值。 */
  dispatched: number;
/** completed：定义该变量以承载业务值。 */
  completed: number;
/** succeeded：定义该变量以承载业务值。 */
  succeeded: number;
/** failed：定义该变量以承载业务值。 */
  failed: number;
/** cancelled：定义该变量以承载业务值。 */
  cancelled: number;
/** droppedPending：定义该变量以承载业务值。 */
  droppedPending: number;
/** droppedStaleResults：定义该变量以承载业务值。 */
  droppedStaleResults: number;
/** avgQueueMs：定义该变量以承载业务值。 */
  avgQueueMs: number;
/** maxQueueMs：定义该变量以承载业务值。 */
  maxQueueMs: number;
/** avgRunMs：定义该变量以承载业务值。 */
  avgRunMs: number;
/** maxRunMs：定义该变量以承载业务值。 */
  maxRunMs: number;
/** avgExpandedNodes：定义该变量以承载业务值。 */
  avgExpandedNodes: number;
/** maxExpandedNodes：定义该变量以承载业务值。 */
  maxExpandedNodes: number;
/** failureReasons：定义该变量以承载业务值。 */
  failureReasons: GmPathfindingFailureBucket[];
}

/** GmTickSnapshot：定义该接口的能力与字段约束。 */
export interface GmTickSnapshot {
/** lastMapId：定义该变量以承载业务值。 */
  lastMapId: string | null;
/** lastMs：定义该变量以承载业务值。 */
  lastMs: number;
/** windowElapsedSec：定义该变量以承载业务值。 */
  windowElapsedSec: number;
/** windowTickCount：定义该变量以承载业务值。 */
  windowTickCount: number;
/** windowTotalMs：定义该变量以承载业务值。 */
  windowTotalMs: number;
/** windowAvgMs：定义该变量以承载业务值。 */
  windowAvgMs: number;
/** windowBusyPercent：定义该变量以承载业务值。 */
  windowBusyPercent: number;
}

/** GM 性能快照 */
export interface GmPerformanceSnapshot {
/** cpuPercent：定义该变量以承载业务值。 */
  cpuPercent: number;
/** memoryMb：定义该变量以承载业务值。 */
  memoryMb: number;
/** tickMs：定义该变量以承载业务值。 */
  tickMs: number;
/** tick：定义该变量以承载业务值。 */
  tick: GmTickSnapshot;
/** cpu：定义该变量以承载业务值。 */
  cpu: GmCpuSnapshot;
/** pathfinding：定义该变量以承载业务值。 */
  pathfinding: GmPathfindingSnapshot;
/** networkStatsStartedAt：定义该变量以承载业务值。 */
  networkStatsStartedAt: number;
/** networkStatsElapsedSec：定义该变量以承载业务值。 */
  networkStatsElapsedSec: number;
/** networkInBytes：定义该变量以承载业务值。 */
  networkInBytes: number;
/** networkOutBytes：定义该变量以承载业务值。 */
  networkOutBytes: number;
/** networkInBuckets：定义该变量以承载业务值。 */
  networkInBuckets: GmNetworkBucket[];
/** networkOutBuckets：定义该变量以承载业务值。 */
  networkOutBuckets: GmNetworkBucket[];
}

/** GM 状态推送 */
export interface S2C_GmState {
/** players：定义该变量以承载业务值。 */
  players: GmPlayerSummary[];
/** mapIds：定义该变量以承载业务值。 */
  mapIds: string[];
/** botCount：定义该变量以承载业务值。 */
  botCount: number;
/** perf：定义该变量以承载业务值。 */
  perf: GmPerformanceSnapshot;
}

/** 错误信息 */
export interface S2C_Error {
/** code：定义该变量以承载业务值。 */
  code: string;
/** message：定义该变量以承载业务值。 */
  message: string;
}

// ===== 修仙系统 Payload =====

/** 使用物品 */
export interface C2S_UseItem {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
  count?: number;
}

/** 丢弃物品 */
export interface C2S_DropItem {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** 摧毁物品 */
export interface C2S_DestroyItem {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** 拿取战利品 */
export interface C2S_TakeLoot {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
  itemKey?: string;
  takeAll?: boolean;
}

/** 整理背包 */
export interface C2S_SortInventory {}

/** 装备物品 */
export interface C2S_Equip {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
}

/** 卸下装备 */
export interface C2S_Unequip {
/** slot：定义该变量以承载业务值。 */
  slot: EquipSlot;
}

/** 修炼功法 */
export interface C2S_Cultivate {
  techId: string | null; // null 表示停止修炼
}

/** C2S_RedeemCodes：定义该接口的能力与字段约束。 */
export interface C2S_RedeemCodes {
/** codes：定义该变量以承载业务值。 */
  codes: string[];
}

/** 属性更新 */
export interface S2C_AttrUpdate {
  baseAttrs?: Attributes;
  bonuses?: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  maxHp?: number;
  qi?: number;
  specialStats?: PlayerSpecialStats;
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
  lifespanYears?: number | null;
  realmProgress?: number;
  realmProgressToNext?: number;
  realmBreakthroughReady?: boolean;
  alchemySkill?: PlayerState['alchemySkill'];
}

/** 境界低频同步：完整下发当前境界展示、突破与开天门详情 */
export interface S2C_RealmUpdate {
/** realm：定义该变量以承载业务值。 */
  realm: PlayerRealmState | null;
}

/** 网络轻量物品实例态：已知模板只发实例与兜底字段，静态定义优先由客户端本地目录补齐 */
export interface SyncedItemStack {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
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

/** SyncedInventorySnapshot：定义该接口的能力与字段约束。 */
export interface SyncedInventorySnapshot {
/** items：定义该变量以承载业务值。 */
  items: SyncedItemStack[];
/** capacity：定义该变量以承载业务值。 */
  capacity: number;
  cooldowns?: SyncedInventoryCooldownState[];
  serverTick?: number;
}

/** SyncedInventoryCooldownState：定义该接口的能力与字段约束。 */
export interface SyncedInventoryCooldownState {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** cooldown：定义该变量以承载业务值。 */
  cooldown: number;
/** startedAtTick：定义该变量以承载业务值。 */
  startedAtTick: number;
}

/** 背包更新 */
export interface InventorySlotUpdateEntry {
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
/** item：定义该变量以承载业务值。 */
  item: SyncedItemStack | null;
}

/** S2C_InventoryUpdate：定义该接口的能力与字段约束。 */
export interface S2C_InventoryUpdate {
  inventory?: SyncedInventorySnapshot;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
  cooldowns?: SyncedInventoryCooldownState[];
  serverTick?: number;
}

/** 装备更新 */
export interface EquipmentSlotUpdateEntry {
/** slot：定义该变量以承载业务值。 */
  slot: EquipSlot;
/** item：定义该变量以承载业务值。 */
  item: SyncedItemStack | null;
}

/** S2C_EquipmentUpdate：定义该接口的能力与字段约束。 */
export interface S2C_EquipmentUpdate {
/** slots：定义该变量以承载业务值。 */
  slots: EquipmentSlotUpdateEntry[];
}

/** S2C_RedeemCodesResult：定义该接口的能力与字段约束。 */
export interface S2C_RedeemCodesResult {
/** result：定义该变量以承载业务值。 */
  result: AccountRedeemCodesRes;
}

/** 功法增量更新条目 */
export interface TechniqueUpdateEntry {
/** techId：定义该变量以承载业务值。 */
  techId: string;
  level?: number;
  exp?: number;
  expToNext?: number;
  realmLv?: number;
  realm?: TechniqueRealm;
  skillsEnabled?: boolean | null;
  name?: string | null;
  grade?: TechniqueGrade | null;
  category?: TechniqueCategory | null;
  skills?: SkillDef[] | null;
  layers?: TechniqueLayerDef[] | null;
  attrCurves?: TechniqueAttrCurves | null;
}

/** 功法更新 */
export interface S2C_TechniqueUpdate {
/** techniques：定义该变量以承载业务值。 */
  techniques: TechniqueUpdateEntry[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** 行动增量更新条目 */
export interface ActionUpdateEntry {
/** id：定义该变量以承载业务值。 */
  id: string;
  cooldownLeft?: number;
  autoBattleEnabled?: boolean | null;
  autoBattleOrder?: number | null;
  skillEnabled?: boolean | null;
  name?: string | null;
  type?: ActionType | null;
  desc?: string | null;
  range?: number | null;
  requiresTarget?: boolean | null;
  targetMode?: 'any' | 'entity' | 'tile' | null;
}

/** 行动列表更新 */
export interface S2C_ActionsUpdate {
/** actions：定义该变量以承载业务值。 */
  actions: ActionUpdateEntry[];
  removeActionIds?: string[];
  actionOrder?: string[];
  autoBattle?: boolean;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  cultivationActive?: boolean;
  senseQiActive?: boolean;
}

/** 战利品窗口更新 */
export interface SyncedLootWindowItemView {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: SyncedItemStack;
}

/** SyncedLootWindowSourceView：定义该接口的能力与字段约束。 */
export interface SyncedLootWindowSourceView {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
/** kind：定义该变量以承载业务值。 */
  kind: LootSourceKind;
/** title：定义该变量以承载业务值。 */
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
/** searchable：定义该变量以承载业务值。 */
  searchable: boolean;
  search?: LootSearchProgressView;
/** items：定义该变量以承载业务值。 */
  items: SyncedLootWindowItemView[];
  emptyText?: string;
}

/** SyncedLootWindowState：定义该接口的能力与字段约束。 */
export interface SyncedLootWindowState {
/** tileX：定义该变量以承载业务值。 */
  tileX: number;
/** tileY：定义该变量以承载业务值。 */
  tileY: number;
/** title：定义该变量以承载业务值。 */
  title: string;
/** sources：定义该变量以承载业务值。 */
  sources: SyncedLootWindowSourceView[];
}

/** S2C_LootWindowUpdate：定义该接口的能力与字段约束。 */
export interface S2C_LootWindowUpdate {
/** window：定义该变量以承载业务值。 */
  window: SyncedLootWindowState | null;
}

/** S2C_MarketUpdate：定义该接口的能力与字段约束。 */
export interface S2C_MarketUpdate {
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** listedItems：定义该变量以承载业务值。 */
  listedItems: MarketListedItemView[];
/** myOrders：定义该变量以承载业务值。 */
  myOrders: MarketOwnOrderView[];
/** storage：定义该变量以承载业务值。 */
  storage: MarketStorage;
}

/** S2C_MarketItemBook：定义该接口的能力与字段约束。 */
export interface S2C_MarketItemBook {
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** book：定义该变量以承载业务值。 */
  book: MarketOrderBookView | null;
}

/** S2C_MarketTradeHistory：定义该接口的能力与字段约束。 */
export interface S2C_MarketTradeHistory {
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** totalVisible：定义该变量以承载业务值。 */
  totalVisible: number;
/** records：定义该变量以承载业务值。 */
  records: MarketTradeHistoryEntryView[];
}

/** SyncedNpcShopItemView：定义该接口的能力与字段约束。 */
export interface SyncedNpcShopItemView {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** item：定义该变量以承载业务值。 */
  item: SyncedItemStack;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** SyncedNpcShopView：定义该接口的能力与字段约束。 */
export interface SyncedNpcShopView {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** npcName：定义该变量以承载业务值。 */
  npcName: string;
/** dialogue：定义该变量以承载业务值。 */
  dialogue: string;
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** items：定义该变量以承载业务值。 */
  items: SyncedNpcShopItemView[];
}

/** S2C_NpcShop：定义该接口的能力与字段约束。 */
export interface S2C_NpcShop {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** shop：定义该变量以承载业务值。 */
  shop: SyncedNpcShopView | null;
  error?: string;
}

/** NEXT_S2C_NpcQuests：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_NpcQuests {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** npcName：定义该变量以承载业务值。 */
  npcName: string;
/** quests：定义该变量以承载业务值。 */
  quests: QuestState[];
}

/** NEXT_S2C_PortalDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PortalDetail {
/** id：定义该变量以承载业务值。 */
  id: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  kind?: string;
/** targetMapId：定义该变量以承载业务值。 */
  targetMapId: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  trigger?: 'manual' | 'auto';
}

/** NEXT_S2C_GroundDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_GroundDetail {
/** sourceId：定义该变量以承载业务值。 */
  sourceId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** items：定义该变量以承载业务值。 */
  items: ItemStack[];
}

/** NEXT_S2C_ContainerDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_ContainerDetail {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** grade：定义该变量以承载业务值。 */
  grade: number;
  desc?: string;
}

/** NEXT_S2C_NpcDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_NpcDetail {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** dialogue：定义该变量以承载业务值。 */
  dialogue: string;
  role?: string;
  hasShop?: 1;
  questCount?: number;
  questMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight;
}

/** NEXT_S2C_MonsterDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_MonsterDetail {
/** id：定义该变量以承载业务值。 */
  id: string;
/** mid：定义该变量以承载业务值。 */
  mid: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** level：定义该变量以承载业务值。 */
  level: number;
/** tier：定义该变量以承载业务值。 */
  tier: MonsterTier;
/** alive：定义该变量以承载业务值。 */
  alive: boolean;
  respawnTicks?: number;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

/** NEXT_S2C_PlayerDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_PlayerDetail {
/** id：定义该变量以承载业务值。 */
  id: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
/** maxQi：定义该变量以承载业务值。 */
  maxQi: number;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

/** NEXT_S2C_TileDetail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_TileDetail {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  aura?: number;
  safeZone?: {
/** x：定义该变量以承载业务值。 */
    x: number;
/** y：定义该变量以承载业务值。 */
    y: number;
/** radius：定义该变量以承载业务值。 */
    radius: number;
  };
  portal?: NEXT_S2C_PortalDetail;
  ground?: NEXT_S2C_GroundDetail;
  entities?: ObservedTileEntityDetail[];
  error?: string;
}

/** NEXT_S2C_Detail：定义该接口的能力与字段约束。 */
export interface NEXT_S2C_Detail {
/** kind：定义该变量以承载业务值。 */
  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';
/** id：定义该变量以承载业务值。 */
  id: string;
  error?: string;
  npc?: NEXT_S2C_NpcDetail;
  monster?: NEXT_S2C_MonsterDetail;
  player?: NEXT_S2C_PlayerDetail;
  portal?: NEXT_S2C_PortalDetail;
  ground?: NEXT_S2C_GroundDetail;
  container?: NEXT_S2C_ContainerDetail;
}

/** S2C_TileRuntimeDetail：定义该接口的能力与字段约束。 */
export interface S2C_TileRuntimeDetail {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  hp?: number;
  maxHp?: number;
  destroyed?: boolean;
  restoreTicksLeft?: number;
  resources: Array<{
/** key：定义该变量以承载业务值。 */
    key: string;
/** label：定义该变量以承载业务值。 */
    label: string;
/** value：定义该变量以承载业务值。 */
    value: number;
    effectiveValue?: number;
    level?: number;
    sourceValue?: number;
  }>;
  entities?: ObservedTileEntityDetail[];
}

/** 任务列表更新 */
export interface S2C_QuestUpdate {
/** quests：定义该变量以承载业务值。 */
  quests: QuestState[];
}

/** 任务自动导航回执 */
export interface S2C_QuestNavigateResult {
/** questId：定义该变量以承载业务值。 */
  questId: string;
/** ok：定义该变量以承载业务值。 */
  ok: boolean;
  error?: string;
}

/** 系统消息 */
export interface S2C_SystemMsg {
  id?: string;
/** text：定义该变量以承载业务值。 */
  text: string;
  kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
  from?: string;
  occurredAt?: number;
  persistUntilAck?: boolean;
  floating?: {
/** x：定义该变量以承载业务值。 */
    x: number;
/** y：定义该变量以承载业务值。 */
    y: number;
/** text：定义该变量以承载业务值。 */
    text: string;
    color?: string;
  };
}

/** S2C_MailSummary：定义该接口的能力与字段约束。 */
export interface S2C_MailSummary {
/** summary：定义该变量以承载业务值。 */
  summary: MailSummaryView;
}

/** S2C_MailPage：定义该接口的能力与字段约束。 */
export interface S2C_MailPage {
/** page：定义该变量以承载业务值。 */
  page: MailPageView;
}

/** S2C_MailDetail：定义该接口的能力与字段约束。 */
export interface S2C_MailDetail {
/** detail：定义该变量以承载业务值。 */
  detail: MailDetailView | null;
  error?: string;
}

/** S2C_MailOpResult：定义该接口的能力与字段约束。 */
export interface S2C_MailOpResult {
/** operation：定义该变量以承载业务值。 */
  operation: 'markRead' | 'claim' | 'delete';
/** ok：定义该变量以承载业务值。 */
  ok: boolean;
/** mailIds：定义该变量以承载业务值。 */
  mailIds: string[];
  message?: string;
}

// ===== 建议系统 Payload =====

/** 建议系统 Payload */

/** 主动请求最新建议列表 */
export interface C2S_RequestSuggestions {}

/** 创建建议 */
export interface C2S_CreateSuggestion {
/** title：定义该变量以承载业务值。 */
  title: string;
/** description：定义该变量以承载业务值。 */
  description: string;
}

/** 建议投票 */
export interface C2S_VoteSuggestion {
/** suggestionId：定义该变量以承载业务值。 */
  suggestionId: string;
/** vote：定义该变量以承载业务值。 */
  vote: 'up' | 'down';
}

/** C2S_ReplySuggestion：定义该接口的能力与字段约束。 */
export interface C2S_ReplySuggestion {
/** suggestionId：定义该变量以承载业务值。 */
  suggestionId: string;
/** content：定义该变量以承载业务值。 */
  content: string;
}

/** C2S_MarkSuggestionRepliesRead：定义该接口的能力与字段约束。 */
export interface C2S_MarkSuggestionRepliesRead {
/** suggestionId：定义该变量以承载业务值。 */
  suggestionId: string;
}

/** C2S_GmMarkSuggestionCompleted：定义该接口的能力与字段约束。 */
export interface C2S_GmMarkSuggestionCompleted {
/** suggestionId：定义该变量以承载业务值。 */
  suggestionId: string;
}

/** C2S_GmRemoveSuggestion：定义该接口的能力与字段约束。 */
export interface C2S_GmRemoveSuggestion {
/** suggestionId：定义该变量以承载业务值。 */
  suggestionId: string;
}

/** 建议列表更新 */
export interface S2C_SuggestionUpdate {
/** suggestions：定义该变量以承载业务值。 */
  suggestions: Suggestion[];
}

/** GmCreateMailReq：定义该接口的能力与字段约束。 */
export interface GmCreateMailReq {
  templateId?: string;
  args?: MailTemplateArg[];
  fallbackTitle?: string;
  fallbackBody?: string;
  attachments?: MailAttachment[];
  senderLabel?: string;
  expireAt?: number | null;
}

// ===== HTTP 接口 =====

/** 注册请求 */
export interface AuthRegisterReq {
/** accountName：定义该变量以承载业务值。 */
  accountName: string;
/** password：定义该变量以承载业务值。 */
  password: string;
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
/** roleName：定义该变量以承载业务值。 */
  roleName: string;
}

/** 登录请求 */
export interface AuthLoginReq {
/** loginName：定义该变量以承载业务值。 */
  loginName: string;
/** password：定义该变量以承载业务值。 */
  password: string;
}

/** 刷新令牌请求 */
export interface AuthRefreshReq {
/** refreshToken：定义该变量以承载业务值。 */
  refreshToken: string;
}

/** 令牌响应 */
export interface AuthTokenRes {
/** accessToken：定义该变量以承载业务值。 */
  accessToken: string;
/** refreshToken：定义该变量以承载业务值。 */
  refreshToken: string;
}

/** GmListSuggestionsQuery：定义该接口的能力与字段约束。 */
export interface GmListSuggestionsQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

/** GmReplySuggestionReq：定义该接口的能力与字段约束。 */
export interface GmReplySuggestionReq {
/** content：定义该变量以承载业务值。 */
  content: string;
}

/** GmSuggestionListRes：定义该接口的能力与字段约束。 */
export interface GmSuggestionListRes {
/** items：定义该变量以承载业务值。 */
  items: Suggestion[];
/** total：定义该变量以承载业务值。 */
  total: number;
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** totalPages：定义该变量以承载业务值。 */
  totalPages: number;
/** keyword：定义该变量以承载业务值。 */
  keyword: string;
}

/** 显示名可用性检查响应 */
export interface DisplayNameAvailabilityRes {
/** available：定义该变量以承载业务值。 */
  available: boolean;
  message?: string;
}

/** 修改密码请求 */
export interface AccountUpdatePasswordReq {
/** currentPassword：定义该变量以承载业务值。 */
  currentPassword: string;
/** newPassword：定义该变量以承载业务值。 */
  newPassword: string;
}

/** 修改显示名请求 */
export interface AccountUpdateDisplayNameReq {
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
}

/** AccountUpdateDisplayNameRes：定义该接口的能力与字段约束。 */
export interface AccountUpdateDisplayNameRes {
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
}

/** 修改角色名请求 */
export interface AccountUpdateRoleNameReq {
/** roleName：定义该变量以承载业务值。 */
  roleName: string;
}

/** AccountUpdateRoleNameRes：定义该接口的能力与字段约束。 */
export interface AccountUpdateRoleNameRes {
/** roleName：定义该变量以承载业务值。 */
  roleName: string;
}

/** BasicOkRes：定义该接口的能力与字段约束。 */
export interface BasicOkRes {
/** ok：定义该变量以承载业务值。 */
  ok: true;
}

/** GM 登录请求 */
export interface GmLoginReq {
/** password：定义该变量以承载业务值。 */
  password: string;
}

/** GmLoginRes：定义该接口的能力与字段约束。 */
export interface GmLoginRes {
/** accessToken：定义该变量以承载业务值。 */
  accessToken: string;
/** expiresInSec：定义该变量以承载业务值。 */
  expiresInSec: number;
}

/** GM 修改密码请求 */
export interface GmChangePasswordReq {
/** currentPassword：定义该变量以承载业务值。 */
  currentPassword: string;
/** newPassword：定义该变量以承载业务值。 */
  newPassword: string;
}

/** GM 直接修改玩家账号密码请求 */
export interface GmUpdateManagedPlayerPasswordReq {
/** newPassword：定义该变量以承载业务值。 */
  newPassword: string;
}

/** GM 直接修改玩家账号请求 */
export interface GmUpdateManagedPlayerAccountReq {
/** username：定义该变量以承载业务值。 */
  username: string;
}

/** GM 管理的玩家元信息 */
export interface GmManagedPlayerMeta {
  userId?: string;
/** isBot：定义该变量以承载业务值。 */
  isBot: boolean;
/** online：定义该变量以承载业务值。 */
  online: boolean;
/** inWorld：定义该变量以承载业务值。 */
  inWorld: boolean;
  lastHeartbeatAt?: string;
  offlineSinceAt?: string;
  updatedAt?: string;
/** dirtyFlags：定义该变量以承载业务值。 */
  dirtyFlags: string[];
}

/** GM 管理的玩家摘要 */
export interface GmManagedPlayerSummary {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** roleName：定义该变量以承载业务值。 */
  roleName: string;
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
  accountName?: string;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** realmLabel：定义该变量以承载业务值。 */
  realmLabel: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
/** dead：定义该变量以承载业务值。 */
  dead: boolean;
/** autoBattle：定义该变量以承载业务值。 */
  autoBattle: boolean;
  autoBattleStationary?: boolean;
/** autoRetaliate：定义该变量以承载业务值。 */
  autoRetaliate: boolean;
/** meta：定义该变量以承载业务值。 */
  meta: GmManagedPlayerMeta;
}

/** GM 可查看的账号信息 */
export interface GmManagedAccountRecord {
/** userId：定义该变量以承载业务值。 */
  userId: string;
/** username：定义该变量以承载业务值。 */
  username: string;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: string;
/** totalOnlineSeconds：定义该变量以承载业务值。 */
  totalOnlineSeconds: number;
}

/** GM 管理的玩家完整记录（含快照） */
export interface GmManagedPlayerRecord extends GmManagedPlayerSummary {
  account?: GmManagedAccountRecord;
/** snapshot：定义该变量以承载业务值。 */
  snapshot: PlayerState;
/** persistedSnapshot：定义该变量以承载业务值。 */
  persistedSnapshot: unknown;
}

/** GmPlayerSortMode：定义该类型的结构与数据语义。 */
export type GmPlayerSortMode = 'realm-desc' | 'realm-asc' | 'online' | 'map' | 'name';

/** GmListPlayersQuery：定义该接口的能力与字段约束。 */
export interface GmListPlayersQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sort?: GmPlayerSortMode;
}

/** GmPlayerListPage：定义该接口的能力与字段约束。 */
export interface GmPlayerListPage {
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** total：定义该变量以承载业务值。 */
  total: number;
/** totalPages：定义该变量以承载业务值。 */
  totalPages: number;
/** keyword：定义该变量以承载业务值。 */
  keyword: string;
/** sort：定义该变量以承载业务值。 */
  sort: GmPlayerSortMode;
}

/** GmPlayerSummaryStats：定义该接口的能力与字段约束。 */
export interface GmPlayerSummaryStats {
/** totalPlayers：定义该变量以承载业务值。 */
  totalPlayers: number;
/** onlinePlayers：定义该变量以承载业务值。 */
  onlinePlayers: number;
/** offlineHangingPlayers：定义该变量以承载业务值。 */
  offlineHangingPlayers: number;
/** offlinePlayers：定义该变量以承载业务值。 */
  offlinePlayers: number;
}

/** GmStateRes：定义该接口的能力与字段约束。 */
export interface GmStateRes {
/** players：定义该变量以承载业务值。 */
  players: GmManagedPlayerSummary[];
/** playerPage：定义该变量以承载业务值。 */
  playerPage: GmPlayerListPage;
/** playerStats：定义该变量以承载业务值。 */
  playerStats: GmPlayerSummaryStats;
/** mapIds：定义该变量以承载业务值。 */
  mapIds: string[];
/** botCount：定义该变量以承载业务值。 */
  botCount: number;
/** perf：定义该变量以承载业务值。 */
  perf: GmPerformanceSnapshot;
}

/** RedeemCodeGroupRewardItem：定义该接口的能力与字段约束。 */
export interface RedeemCodeGroupRewardItem {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** RedeemCodeGroupView：定义该接口的能力与字段约束。 */
export interface RedeemCodeGroupView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** rewards：定义该变量以承载业务值。 */
  rewards: RedeemCodeGroupRewardItem[];
/** totalCodeCount：定义该变量以承载业务值。 */
  totalCodeCount: number;
/** usedCodeCount：定义该变量以承载业务值。 */
  usedCodeCount: number;
/** activeCodeCount：定义该变量以承载业务值。 */
  activeCodeCount: number;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: string;
/** updatedAt：定义该变量以承载业务值。 */
  updatedAt: string;
}

/** RedeemCodeCodeView：定义该接口的能力与字段约束。 */
export interface RedeemCodeCodeView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** groupId：定义该变量以承载业务值。 */
  groupId: string;
/** code：定义该变量以承载业务值。 */
  code: string;
/** status：定义该变量以承载业务值。 */
  status: 'active' | 'used' | 'destroyed';
/** usedByPlayerId：定义该变量以承载业务值。 */
  usedByPlayerId: string | null;
/** usedByRoleName：定义该变量以承载业务值。 */
  usedByRoleName: string | null;
/** usedAt：定义该变量以承载业务值。 */
  usedAt: string | null;
/** destroyedAt：定义该变量以承载业务值。 */
  destroyedAt: string | null;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: string;
/** updatedAt：定义该变量以承载业务值。 */
  updatedAt: string;
}

/** GmRedeemCodeGroupListRes：定义该接口的能力与字段约束。 */
export interface GmRedeemCodeGroupListRes {
/** groups：定义该变量以承载业务值。 */
  groups: RedeemCodeGroupView[];
}

/** GmRedeemCodeGroupDetailRes：定义该接口的能力与字段约束。 */
export interface GmRedeemCodeGroupDetailRes {
/** group：定义该变量以承载业务值。 */
  group: RedeemCodeGroupView;
/** codes：定义该变量以承载业务值。 */
  codes: RedeemCodeCodeView[];
}

/** GmCreateRedeemCodeGroupReq：定义该接口的能力与字段约束。 */
export interface GmCreateRedeemCodeGroupReq {
/** name：定义该变量以承载业务值。 */
  name: string;
/** rewards：定义该变量以承载业务值。 */
  rewards: RedeemCodeGroupRewardItem[];
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** GmUpdateRedeemCodeGroupReq：定义该接口的能力与字段约束。 */
export interface GmUpdateRedeemCodeGroupReq {
/** name：定义该变量以承载业务值。 */
  name: string;
/** rewards：定义该变量以承载业务值。 */
  rewards: RedeemCodeGroupRewardItem[];
}

/** GmCreateRedeemCodeGroupRes：定义该接口的能力与字段约束。 */
export interface GmCreateRedeemCodeGroupRes {
/** group：定义该变量以承载业务值。 */
  group: RedeemCodeGroupView;
/** codes：定义该变量以承载业务值。 */
  codes: string[];
}

/** GmAppendRedeemCodesReq：定义该接口的能力与字段约束。 */
export interface GmAppendRedeemCodesReq {
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** GmAppendRedeemCodesRes：定义该接口的能力与字段约束。 */
export interface GmAppendRedeemCodesRes {
/** group：定义该变量以承载业务值。 */
  group: RedeemCodeGroupView;
/** codes：定义该变量以承载业务值。 */
  codes: string[];
}

/** AccountRedeemCodesReq：定义该接口的能力与字段约束。 */
export interface AccountRedeemCodesReq {
/** codes：定义该变量以承载业务值。 */
  codes: string[];
}

/** AccountRedeemCodeResult：定义该接口的能力与字段约束。 */
export interface AccountRedeemCodeResult {
/** code：定义该变量以承载业务值。 */
  code: string;
/** ok：定义该变量以承载业务值。 */
  ok: boolean;
/** message：定义该变量以承载业务值。 */
  message: string;
  groupName?: string;
  rewards?: RedeemCodeGroupRewardItem[];
}

/** AccountRedeemCodesRes：定义该接口的能力与字段约束。 */
export interface AccountRedeemCodesRes {
/** results：定义该变量以承载业务值。 */
  results: AccountRedeemCodeResult[];
}

/** GmDatabaseBackupKind：定义该类型的结构与数据语义。 */
export type GmDatabaseBackupKind = 'hourly' | 'daily' | 'manual' | 'pre_import';

/** GmDatabaseJobType：定义该类型的结构与数据语义。 */
export type GmDatabaseJobType = 'backup' | 'restore';

/** GmDatabaseJobStatus：定义该类型的结构与数据语义。 */
export type GmDatabaseJobStatus = 'running' | 'completed' | 'failed';

/** GmDatabaseBackupRecord：定义该接口的能力与字段约束。 */
export interface GmDatabaseBackupRecord {
/** id：定义该变量以承载业务值。 */
  id: string;
/** kind：定义该变量以承载业务值。 */
  kind: GmDatabaseBackupKind;
/** fileName：定义该变量以承载业务值。 */
  fileName: string;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: string;
/** sizeBytes：定义该变量以承载业务值。 */
  sizeBytes: number;
}

/** GmDatabaseJobSnapshot：定义该接口的能力与字段约束。 */
export interface GmDatabaseJobSnapshot {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: GmDatabaseJobType;
/** status：定义该变量以承载业务值。 */
  status: GmDatabaseJobStatus;
/** startedAt：定义该变量以承载业务值。 */
  startedAt: string;
  finishedAt?: string;
  kind?: GmDatabaseBackupKind;
  backupId?: string;
  sourceBackupId?: string;
  error?: string;
}

/** GmDatabaseStateRes：定义该接口的能力与字段约束。 */
export interface GmDatabaseStateRes {
/** backups：定义该变量以承载业务值。 */
  backups: GmDatabaseBackupRecord[];
  runningJob?: GmDatabaseJobSnapshot;
  lastJob?: GmDatabaseJobSnapshot;
  persistenceEnabled?: boolean;
  compatScope?: 'persistent_documents_only';
  restoreMode?: 'replace_persistent_documents';
  note?: string;
  automation?: {
/** retentionEnforced：定义该变量以承载业务值。 */
    retentionEnforced: boolean;
/** schedulesActive：定义该变量以承载业务值。 */
    schedulesActive: boolean;
/** restoreRequiresMaintenance：定义该变量以承载业务值。 */
    restoreRequiresMaintenance: boolean;
/** preImportBackupEnabled：定义该变量以承载业务值。 */
    preImportBackupEnabled: boolean;
  };
  retention: {
/** hourly：定义该变量以承载业务值。 */
    hourly: number;
/** daily：定义该变量以承载业务值。 */
    daily: number;
  };
  schedules: {
/** hourly：定义该变量以承载业务值。 */
    hourly: string;
/** daily：定义该变量以承载业务值。 */
    daily: string;
  };
}

/** GmTriggerDatabaseBackupRes：定义该接口的能力与字段约束。 */
export interface GmTriggerDatabaseBackupRes {
/** job：定义该变量以承载业务值。 */
  job: GmDatabaseJobSnapshot;
  compatScope?: 'persistent_documents_only';
  documentsCount?: number;
}

/** GmRestoreDatabaseReq：定义该接口的能力与字段约束。 */
export interface GmRestoreDatabaseReq {
/** backupId：定义该变量以承载业务值。 */
  backupId: string;
}

/** GmPlayerDetailRes：定义该接口的能力与字段约束。 */
export interface GmPlayerDetailRes {
/** player：定义该变量以承载业务值。 */
  player: GmManagedPlayerRecord;
}

/** GmEditorTechniqueOption：定义该接口的能力与字段约束。 */
export interface GmEditorTechniqueOption {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  skills?: SkillDef[];
  layers?: TechniqueLayerDef[];
}

/** GmEditorItemOption：定义该接口的能力与字段约束。 */
export interface GmEditorItemOption {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: EquipSlot;
  desc?: string;
  equipAttrs?: ItemStack['equipAttrs'];
  equipStats?: ItemStack['equipStats'];
  equipValueStats?: ItemStack['equipValueStats'];
  tags?: string[];
  effects?: EquipmentEffectDef[];
  healAmount?: number;
  healPercent?: number;
  qiPercent?: number;
  cooldown?: number;
  consumeBuffs?: ConsumableBuffDef[];
  enhanceLevel?: number;
  alchemySuccessRate?: number;
  alchemySpeedRate?: number;
  mapUnlockId?: string;
  mapUnlockIds?: string[];
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

/** GmEditorRealmOption：定义该接口的能力与字段约束。 */
export interface GmEditorRealmOption {
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** displayName：定义该变量以承载业务值。 */
  displayName: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  phaseName?: string;
  review?: string;
}

/** GmEditorBuffOption：定义该接口的能力与字段约束。 */
export interface GmEditorBuffOption extends TemporaryBuffState {}

/** GmEditorCatalogRes：定义该接口的能力与字段约束。 */
export interface GmEditorCatalogRes {
/** techniques：定义该变量以承载业务值。 */
  techniques: GmEditorTechniqueOption[];
/** items：定义该变量以承载业务值。 */
  items: GmEditorItemOption[];
/** realmLevels：定义该变量以承载业务值。 */
  realmLevels: GmEditorRealmOption[];
/** buffs：定义该变量以承载业务值。 */
  buffs: GmEditorBuffOption[];
}


/** GmPlayerUpdateSection：定义该类型的结构与数据语义。 */
export type GmPlayerUpdateSection =
  | 'basic'
  | 'position'
  | 'realm'
  | 'buffs'
  | 'techniques'
  | 'items'
  | 'quests';

/** GmUpdatePlayerReq：定义该接口的能力与字段约束。 */
export interface GmUpdatePlayerReq {
/** snapshot：定义该变量以承载业务值。 */
  snapshot: Partial<PlayerState>;
  section?: GmPlayerUpdateSection;
}

/** GmSetPlayerBodyTrainingLevelReq：定义该接口的能力与字段约束。 */
export interface GmSetPlayerBodyTrainingLevelReq {
/** level：定义该变量以承载业务值。 */
  level: number;
}

/** GmAddPlayerFoundationReq：定义该接口的能力与字段约束。 */
export interface GmAddPlayerFoundationReq {
/** amount：定义该变量以承载业务值。 */
  amount: number;
}

/** GmAddPlayerCombatExpReq：定义该接口的能力与字段约束。 */
export interface GmAddPlayerCombatExpReq {
/** amount：定义该变量以承载业务值。 */
  amount: number;
}

/** GmSpawnBotsReq：定义该接口的能力与字段约束。 */
export interface GmSpawnBotsReq {
/** anchorPlayerId：定义该变量以承载业务值。 */
  anchorPlayerId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** GmRemoveBotsReq：定义该接口的能力与字段约束。 */
export interface GmRemoveBotsReq {
  playerIds?: string[];
  all?: boolean;
}

/** GmShortcutRunRes：定义该接口的能力与字段约束。 */
export interface GmShortcutRunRes {
/** ok：定义该变量以承载业务值。 */
  ok: true;
/** totalPlayers：定义该变量以承载业务值。 */
  totalPlayers: number;
/** queuedRuntimePlayers：定义该变量以承载业务值。 */
  queuedRuntimePlayers: number;
/** updatedOfflinePlayers：定义该变量以承载业务值。 */
  updatedOfflinePlayers: number;
  totalInvalidInventoryStacksRemoved?: number;
  totalInvalidMarketStorageStacksRemoved?: number;
  totalInvalidEquipmentRemoved?: number;
  totalCombatExpGranted?: number;
  totalFoundationGranted?: number;
  totalMaps?: number;
  queuedRuntimeMaps?: number;
  totalHerbContainers?: number;
  totalHerbStockAdded?: number;
  targetMapId?: string;
  targetX?: number;
  targetY?: number;
}

/** GM 地图传送点记录 */
export interface GmMapPortalRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** targetMapId：定义该变量以承载业务值。 */
  targetMapId: string;
/** targetX：定义该变量以承载业务值。 */
  targetX: number;
/** targetY：定义该变量以承载业务值。 */
  targetY: number;
  kind?: 'portal' | 'stairs';
  trigger?: 'manual' | 'auto';
  routeDomain?: PortalRouteDomain;
  allowPlayerOverlap?: boolean;
  hidden?: boolean;
  observeTitle?: string;
  observeDesc?: string;
}

/** GM 地图灵气记录 */
export interface GmMapAuraRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** value：定义该变量以承载业务值。 */
  value: number;
}

/** GM 地图气机记录 */
export interface GmMapResourceRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** resourceKey：定义该变量以承载业务值。 */
  resourceKey: string;
/** value：定义该变量以承载业务值。 */
  value: number;
}

/** GM 地图安全区记录 */
export interface GmMapSafeZoneRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** radius：定义该变量以承载业务值。 */
  radius: number;
}

/** GM 地图地标记录 */
export interface GmMapLandmarkRecord {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  desc?: string;
  resourceNodeId?: string;
  container?: GmMapContainerRecord;
}

/** GM 地图掉落物记录 */
export interface GmMapDropRecord {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: ItemType;
/** count：定义该变量以承载业务值。 */
  count: number;
  chance?: number;
}

/** GM 地图容器随机池记录 */
export interface GmMapContainerLootPoolRecord {
  rolls?: number;
  chance?: number;
  minLevel?: number;
  maxLevel?: number;
  minGrade?: TechniqueGrade;
  maxGrade?: TechniqueGrade;
  tagGroups?: string[][];
  countMin?: number;
  countMax?: number;
  allowDuplicates?: boolean;
}

/** GM 地图容器记录 */
export interface GmMapContainerRecord {
  grade?: TechniqueGrade;
  refreshTicks?: number;
  char?: string;
  color?: string;
  drops?: GmMapDropRecord[];
  lootPools?: GmMapContainerLootPoolRecord[];
}

/** GM 地图任务记录 */
export interface GmMapQuestRecord {
/** id：定义该变量以承载业务值。 */
  id: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
  line?: QuestLine;
  chapter?: string;
  story?: string;
  objectiveType?: QuestObjectiveType;
  objectiveText?: string;
  targetName?: string;
  targetMapId?: string;
  targetX?: number;
  targetY?: number;
  targetNpcId?: string;
  targetNpcName?: string;
  targetMonsterId?: string;
  targetTechniqueId?: string;
  targetRealmStage?: string | number;
  required?: number;
  targetCount?: number;
  rewardItemId?: string;
  rewardText?: string;
  reward?: GmMapDropRecord[];
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
  submitNpcId?: string;
  submitNpcName?: string;
  submitMapId?: string;
  submitX?: number;
  submitY?: number;
  relayMessage?: string;
  unlockBreakthroughRequirementIds?: string[];
}

/** GmMapNpcShopItemRecord：定义该接口的能力与字段约束。 */
export interface GmMapNpcShopItemRecord {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
  price?: number;
  stockLimit?: number;
  refreshSeconds?: number;
  priceFormula?: 'technique_realm_square_grade';
}

/** GM 地图 NPC 记录 */
export interface GmMapNpcRecord {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** dialogue：定义该变量以承载业务值。 */
  dialogue: string;
  role?: string;
  shopItems?: GmMapNpcShopItemRecord[];
  quests?: GmMapQuestRecord[];
}

/** GM 地图怪物刷新点记录 */
export interface GmMapMonsterSpawnRecord {
/** id：定义该变量以承载业务值。 */
  id: string;
  templateId?: string;
  name?: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  char?: string;
  color?: string;
  grade?: TechniqueGrade;
  hp?: number;
  maxHp?: number;
  attack?: number;
  count?: number;
  radius?: number;
  maxAlive?: number;
  wanderRadius?: number;
  aggroRange?: number;
  viewRange?: number;
  aggroMode?: MonsterAggroMode;
  respawnSec?: number;
  respawnTicks?: number;
  level?: number;
  attrs?: Partial<Attributes>;
  statPercents?: NumericStatPercentages;
  skills?: string[];
  tier?: MonsterTier;
  expMultiplier?: number;
  drops?: GmMapDropRecord[];
}

/** GM 完整地图文档 */
export interface GmMapDocument {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
  height: number;
  routeDomain?: MapRouteDomain;
  terrainProfileId?: string;
  terrainRealmLv?: number;
  parentMapId?: string;
  parentOriginX?: number;
  parentOriginY?: number;
  floorLevel?: number;
  floorName?: string;
  spaceVisionMode?: 'isolated' | 'parent_overlay';
  description?: string;
  dangerLevel?: number;
  recommendedRealm?: string;
/** tiles：定义该变量以承载业务值。 */
  tiles: string[];
/** portals：定义该变量以承载业务值。 */
  portals: GmMapPortalRecord[];
  spawnPoint: {
/** x：定义该变量以承载业务值。 */
    x: number;
/** y：定义该变量以承载业务值。 */
    y: number;
  };
  time?: MapTimeConfig;
  auras?: GmMapAuraRecord[];
  resources?: GmMapResourceRecord[];
  safeZones?: GmMapSafeZoneRecord[];
  landmarks?: GmMapLandmarkRecord[];
/** npcs：定义该变量以承载业务值。 */
  npcs: GmMapNpcRecord[];
/** monsterSpawns：定义该变量以承载业务值。 */
  monsterSpawns: GmMapMonsterSpawnRecord[];
}

/** GM 地图摘要 */
export interface GmMapSummary {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
  height: number;
  description?: string;
  terrainRealmLv?: number;
  dangerLevel?: number;
  recommendedRealm?: string;
/** portalCount：定义该变量以承载业务值。 */
  portalCount: number;
/** npcCount：定义该变量以承载业务值。 */
  npcCount: number;
/** monsterSpawnCount：定义该变量以承载业务值。 */
  monsterSpawnCount: number;
}

/** GmMapListRes：定义该接口的能力与字段约束。 */
export interface GmMapListRes {
/** maps：定义该变量以承载业务值。 */
  maps: GmMapSummary[];
}

/** GmMapDetailRes：定义该接口的能力与字段约束。 */
export interface GmMapDetailRes {
/** map：定义该变量以承载业务值。 */
  map: GmMapDocument;
}

/** GmUpdateMapReq：定义该接口的能力与字段约束。 */
export interface GmUpdateMapReq {
/** map：定义该变量以承载业务值。 */
  map: GmMapDocument;
}

// ===== GM 世界管理 =====

/** GM 运行时地图实体 */
export interface GmRuntimeEntity {
/** id：定义该变量以承载业务值。 */
  id: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'player' | 'monster' | 'npc' | 'container';
  hp?: number;
  maxHp?: number;
  dead?: boolean;
  alive?: boolean;
  targetPlayerId?: string;
  respawnLeft?: number;
  online?: boolean;
  autoBattle?: boolean;
  isBot?: boolean;
}

/** GM 运行时地图快照响应 */
export interface GmMapRuntimeRes {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
  height: number;
  /** 视口区域内的地块，tiles[dy][dx]，dy/dx 相对于请求的 x,y */
  tiles: (VisibleTile | null)[][];
  /** 视口区域内的实体 */
  entities: GmRuntimeEntity[];
  /** 当前地图时间状态 */
  time: GameTimeState;
  /** 当前地图时间配置 */
  timeConfig: MapTimeConfig;
  /** 当前 tick 倍率，0=暂停 */
  tickSpeed: number;
  /** 地图 tick 是否暂停 */
  tickPaused: boolean;
}

/** GM 修改地图 tick 速率请求 */
export interface GmUpdateMapTickReq {
  speed?: number;
  paused?: boolean;
}

/** GM 修改地图时间配置请求 */
export interface GmUpdateMapTimeReq {
  scale?: number;
  offsetTicks?: number;
}

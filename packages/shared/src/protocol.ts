/**
 * 前后端通信协议：事件名定义与所有 Payload 类型。
 * C2S = 客户端→服务端，S2C = 服务端→客户端。
 */
import type { ElementKey } from './numeric';
import { Direction, PlayerState, Tile, VisibleTile, RenderEntity, MapMeta, Attributes, Inventory, EquipmentSlots, TechniqueState, ActionDef, AttrBonus, EquipSlot, EntityKind, NpcQuestMarker, ObservationInsight, PlayerRealmState, PlayerSpecialStats, QuestState, CombatEffect, AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, ItemType, QuestLine, QuestObjectiveType, GameTimeState, MapTimeConfig, MonsterAggroMode, MonsterInitialBuffDef, MonsterTier, NumericStatPercentages, TechniqueCategory, TechniqueGrade, GroundItemPileView, LootSearchProgressView, VisibleBuffState, TemporaryBuffState, ActionType, SkillDef, TechniqueAttrCurves, TechniqueLayerDef, TechniqueRealm, GroundItemEntryView, LootSourceKind, LootSourceVariant, LootWindowHerbMeta, MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot, Suggestion, ItemStack, EquipmentEffectDef, ConsumableBuffDef, MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView, MarketPriceLevelView, MarketOrderSide, MapRouteDomain, PortalRouteDomain, MailSummaryView, MailPageView, MailDetailView, MailFilter, MailTemplateArg, MailAttachment, BodyTrainingState, AlchemyIngredientSelection, AlchemyRecipeCatalogEntry, SyncedAlchemyPanelState } from './types';
import { NumericRatioDivisors, NumericStatBreakdownMap, NumericStats } from './numeric';

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
  UpdateAutoUsePills: 'c:updateAutoUsePills',
  UpdateAutoBattleTargetingMode: 'c:updateAutoBattleTargetingMode',
  UpdateTechniqueSkillAvailability: 'c:updateTechniqueSkillAvailability',
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
  RequestMarketListings: 'c:requestMarketListings',
  RequestMarketItemBook: 'c:requestMarketItemBook',
  RequestMarketTradeHistory: 'c:requestMarketTradeHistory',
  RequestAttrDetail: 'c:requestAttrDetail',
  RequestLeaderboard: 'c:requestLeaderboard',
  CreateMarketSellOrder: 'c:createMarketSellOrder',
  CreateMarketBuyOrder: 'c:createMarketBuyOrder',
  BuyMarketItem: 'c:buyMarketItem',
  SellMarketItem: 'c:sellMarketItem',
  CancelMarketOrder: 'c:cancelMarketOrder',
  ClaimMarketStorage: 'c:claimMarketStorage',
  RequestNpcShop: 'c:requestNpcShop',
  BuyNpcShopItem: 'c:buyNpcShopItem',
  RequestAlchemyPanel: 'c:requestAlchemyPanel',
  SaveAlchemyPreset: 'c:saveAlchemyPreset',
  DeleteAlchemyPreset: 'c:deleteAlchemyPreset',
  StartAlchemy: 'c:startAlchemy',
  CancelAlchemy: 'c:cancelAlchemy',
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
  MarketListings: 's:marketListings',
  MarketOrders: 's:marketOrders',
  MarketStorage: 's:marketStorage',
  MarketItemBook: 's:marketItemBook',
  MarketTradeHistory: 's:marketTradeHistory',
  AttrDetail: 's:attrDetail',
  Leaderboard: 's:leaderboard',
  NpcShop: 's:npcShop',
  AlchemyPanel: 's:alchemyPanel',
} as const;

/** server-next 客户端 → 服务端 */
export const NEXT_C2S = {
  Hello: 'n:c:hello',
  Move: 'n:c:move',
  MoveTo: 'n:c:moveTo',
  NavigateQuest: 'n:c:navigateQuest',
  UseAction: 'n:c:useAction',
  UpdateTechniqueSkillAvailability: 'n:c:updateTechniqueSkillAvailability',
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
  UpdateAutoUsePills: 'n:c:updateAutoUsePills',
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

export interface NEXT_S2C_Bootstrap {
  self: PlayerState;
  mapMeta: MapMeta;
  minimap?: MapMinimapSnapshot;
  visibleMinimapMarkers?: MapMinimapMarker[];
  minimapLibrary: MapMinimapArchiveEntry[];
  tiles: VisibleTile[][];
  players: RenderEntity[];
  time?: GameTimeState;
  auraLevelBaseValue?: number;
}
export interface NEXT_S2C_LootWindowUpdate {
  window: SyncedLootWindowState | null;
}

export interface NEXT_S2C_QuestNavigateResult {
  questId: string;
  ok: boolean;
  error?: string;
}

export interface NEXT_S2C_RedeemCodesResult {
  result: AccountRedeemCodesRes;
}

export interface NEXT_S2C_GmState {
  players: GmPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}
export interface NEXT_S2C_MapStatic {
  mapId: string;
  mapMeta?: MapMeta;
  minimap?: MapMinimapSnapshot;
  minimapLibrary?: MapMinimapArchiveEntry[];
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibleMinimapMarkerAdds?: MapMinimapMarker[];
  visibleMinimapMarkerRemoves?: string[];
}
export interface NEXT_S2C_Realm {
  realm: PlayerRealmState | null;
}

// ===== Payload 类型 =====

/** 移动指令 */
export interface C2S_Move {
  d: Direction;
}

/** 点击目标点移动 */
export interface C2S_MoveTo {
  x: number;
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
  questId: string;
}

/** 在线心跳 */
export interface C2S_Heartbeat {
  clientAt?: number;
}

/** 客户端主动延迟探测 */
export interface C2S_Ping {
  clientAt: number;
}

export interface C2S_InspectTileRuntime {
  x: number;
  y: number;
}

/** 服务端立即回显延迟探测 */
export interface S2C_Pong {
  clientAt: number;
  serverAt: number;
}

export interface C2S_GmGetState {}

export interface C2S_GmSpawnBots {
  count: number;
}

export interface C2S_GmRemoveBots {
  playerIds?: string[];
  all?: boolean;
}

export interface C2S_GmUpdatePlayer {
  playerId: string;
  mapId: string;
  x: number;
  y: number;
  hp: number;
  autoBattle: boolean;
}

export interface C2S_GmResetPlayer {
  playerId: string;
}

/** 动作指令 */
export interface C2S_Action {
  type?: string;
  actionId?: string;
  target?: string;
}

export interface C2S_UpdateAutoBattleSkills {
  skills: AutoBattleSkillConfig[];
}

export interface C2S_UpdateAutoUsePills {
  pills: AutoUsePillConfig[];
}

export interface C2S_UpdateAutoBattleTargetingMode {
  mode: AutoBattleTargetingMode;
}

export interface C2S_UpdateTechniqueSkillAvailability {
  techId: string;
  enabled: boolean;
}

/** 调试：回出生点 */
export interface C2S_DebugResetSpawn {
  force?: boolean;
}

/** 聊天消息 */
export interface C2S_Chat {
  message: string;
}

export interface C2S_AckSystemMessages {
  ids: string[];
}

export interface C2S_RequestMarket {}

export interface C2S_RequestMarketListings {
  page: number;
  pageSize?: number;
  category?: ItemType | 'all';
  equipmentSlot?: EquipSlot | 'all';
  techniqueCategory?: TechniqueCategory | 'all';
}

export interface C2S_RequestMailSummary {}

export interface C2S_RequestMailPage {
  page: number;
  pageSize?: number;
  filter?: MailFilter;
}

export interface C2S_RequestMailDetail {
  mailId: string;
}

export interface C2S_MarkMailRead {
  mailIds: string[];
}

export interface C2S_ClaimMailAttachments {
  mailIds: string[];
}

export interface C2S_DeleteMail {
  mailIds: string[];
}

export interface C2S_RequestMarketItemBook {
  itemId: string;
}

export interface C2S_RequestMarketTradeHistory {
  page: number;
}

export interface C2S_RequestAttrDetail {}

export interface C2S_RequestLeaderboard {
  limit?: number;
}

export interface C2S_CreateMarketSellOrder {
  slotIndex: number;
  quantity: number;
  unitPrice: number;
}

export interface C2S_CreateMarketBuyOrder {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

export interface C2S_BuyMarketItem {
  itemKey: string;
  quantity: number;
}

export interface C2S_SellMarketItem {
  slotIndex: number;
  quantity: number;
}

export interface C2S_CancelMarketOrder {
  orderId: string;
}

export interface C2S_ClaimMarketStorage {}

export interface C2S_RequestNpcShop {
  npcId: string;
}

export interface C2S_BuyNpcShopItem {
  npcId: string;
  itemId: string;
  quantity: number;
}

export interface C2S_RequestAlchemyPanel {
  knownCatalogVersion?: number;
}

export interface C2S_SaveAlchemyPreset {
  presetId?: string;
  recipeId: string;
  name: string;
  ingredients: AlchemyIngredientSelection[];
}

export interface C2S_DeleteAlchemyPreset {
  presetId: string;
}

export interface C2S_StartAlchemy {
  recipeId: string;
  ingredients: AlchemyIngredientSelection[];
  quantity: number;
}

export interface C2S_CancelAlchemy {}

export interface C2S_HeavenGateAction {
  action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter';
  element?: ElementKey;
}

/** Tick 增量实体数据（支持 null 表示清除字段） */
export interface TickRenderEntity {
  id: string;
  x: number;
  y: number;
  char?: string;
  color?: string;
  name?: string | null;
  kind?: EntityKind | 'player' | null;
  monsterTier?: MonsterTier | null;
  monsterScale?: number | null;
  hp?: number | null;
  maxHp?: number | null;
  respawnRemainingTicks?: number | null;
  respawnTotalTicks?: number | null;
  qi?: number | null;
  maxQi?: number | null;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
  buffs?: VisibleBuffState[] | null;
}

export interface ObservationLootPreviewEntry {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance: number;
}

export interface ObservationLootPreview {
  entries: ObservationLootPreviewEntry[];
  emptyText?: string;
}

export interface ObservedTileEntityDetail {
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
  sourceId: string;
  x: number;
  y: number;
  items?: GroundItemEntryView[] | null;
}

/** 视野内地块增量补丁 */
export interface VisibleTilePatch {
  x: number;
  y: number;
  tile: VisibleTile;
}

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
  mapId: string;
  mapMeta?: MapMeta;
  minimap?: MapMinimapSnapshot;
  minimapLibrary?: MapMinimapArchiveEntry[];
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibleMinimapMarkerAdds?: MapMinimapMarker[];
  visibleMinimapMarkerRemoves?: string[];
}

/** 实体进入视野 */
export interface S2C_Enter {
  entity: RenderEntity;
}

/** 实体离开视野 */
export interface S2C_Leave {
  entityId: string;
}

/** 初始化数据（连接成功后发送） */
export interface S2C_Init {
  self: PlayerState;
  mapMeta: MapMeta;
  minimap?: MapMinimapSnapshot;
  visibleMinimapMarkers?: MapMinimapMarker[];
  minimapLibrary: MapMinimapArchiveEntry[];
  tiles: VisibleTile[][];
  players: RenderEntity[]; // 初始可见玩家实体（含自身）
  time?: GameTimeState;
  auraLevelBaseValue?: number;
}

/** GM 玩家摘要 */
export interface GmPlayerSummary {
  id: string;
  name: string;
  roleName: string;
  displayName: string;
  accountName?: string;
  mapId: string;
  mapName: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  autoBattle: boolean;
  isBot: boolean;
}

/** GM 网络流量分桶统计 */
export interface GmNetworkBucket {
  key: string;
  label: string;
  bytes: number;
  count: number;
}

/** GM CPU 统计快照 */
export interface GmCpuSectionSnapshot {
  key: string;
  label: string;
  totalMs: number;
  percent: number;
  count: number;
  avgMs: number;
}

/** GM CPU 统计快照 */
export interface GmCpuSnapshot {
  cores: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  processUptimeSec: number;
  systemUptimeSec: number;
  userCpuMs: number;
  systemCpuMs: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  profileStartedAt: number;
  profileElapsedSec: number;
  breakdown: GmCpuSectionSnapshot[];
}

export interface GmPathfindingFailureBucket {
  reason: string;
  label: string;
  count: number;
}

export interface GmPathfindingSnapshot {
  statsStartedAt: number;
  statsElapsedSec: number;
  workerCount: number;
  runningWorkers: number;
  idleWorkers: number;
  peakRunningWorkers: number;
  queueDepth: number;
  peakQueueDepth: number;
  enqueued: number;
  dispatched: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  droppedPending: number;
  droppedStaleResults: number;
  avgQueueMs: number;
  maxQueueMs: number;
  avgRunMs: number;
  maxRunMs: number;
  avgExpandedNodes: number;
  maxExpandedNodes: number;
  failureReasons: GmPathfindingFailureBucket[];
}

export interface GmTickSnapshot {
  lastMapId: string | null;
  lastMs: number;
  windowElapsedSec: number;
  windowTickCount: number;
  windowTotalMs: number;
  windowAvgMs: number;
  windowBusyPercent: number;
}

/** GM 性能快照 */
export interface GmPerformanceSnapshot {
  cpuPercent: number;
  memoryMb: number;
  tickMs: number;
  tick: GmTickSnapshot;
  cpu: GmCpuSnapshot;
  pathfinding: GmPathfindingSnapshot;
  networkStatsStartedAt: number;
  networkStatsElapsedSec: number;
  networkInBytes: number;
  networkOutBytes: number;
  networkInBuckets: GmNetworkBucket[];
  networkOutBuckets: GmNetworkBucket[];
}

/** GM 状态推送 */
export interface S2C_GmState {
  players: GmPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}

/** 错误信息 */
export interface S2C_Error {
  code: string;
  message: string;
}

// ===== 修仙系统 Payload =====

/** 使用物品 */
export interface C2S_UseItem {
  slotIndex: number;
  count?: number;
}

/** 丢弃物品 */
export interface C2S_DropItem {
  slotIndex: number;
  count: number;
}

/** 摧毁物品 */
export interface C2S_DestroyItem {
  slotIndex: number;
  count: number;
}

/** 拿取战利品 */
export interface C2S_TakeLoot {
  sourceId: string;
  itemKey?: string;
  takeAll?: boolean;
}

/** 整理背包 */
export interface C2S_SortInventory {}

/** 装备物品 */
export interface C2S_Equip {
  slotIndex: number;
}

/** 卸下装备 */
export interface C2S_Unequip {
  slot: EquipSlot;
}

/** 修炼功法 */
export interface C2S_Cultivate {
  techId: string | null; // null 表示停止修炼
}

export interface C2S_RedeemCodes {
  codes: string[];
}

/** 属性更新 */
export interface S2C_AttrUpdate {
  baseAttrs?: Attributes;
  bonuses?: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  numericStatBreakdowns?: NumericStatBreakdownMap;
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
  realm: PlayerRealmState | null;
}

/** 网络轻量物品实例态：已知模板只发实例与兜底字段，静态定义优先由客户端本地目录补齐 */
export interface SyncedItemStack {
  itemId: string;
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
  consumeBuffs?: ConsumableBuffDef[];
  tags?: string[];
  alchemySuccessRate?: number;
  alchemySpeedRate?: number;
  mapUnlockId?: string;
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

export interface SyncedInventorySnapshot {
  items: SyncedItemStack[];
  capacity: number;
}

/** 背包更新 */
export interface InventorySlotUpdateEntry {
  slotIndex: number;
  item: SyncedItemStack | null;
}

export interface S2C_InventoryUpdate {
  inventory?: SyncedInventorySnapshot;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
}

/** 装备更新 */
export interface EquipmentSlotUpdateEntry {
  slot: EquipSlot;
  item: SyncedItemStack | null;
}

export interface S2C_EquipmentUpdate {
  slots: EquipmentSlotUpdateEntry[];
}

export interface S2C_RedeemCodesResult {
  result: AccountRedeemCodesRes;
}

/** 功法增量更新条目 */
export interface TechniqueUpdateEntry {
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
  techniques: TechniqueUpdateEntry[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** 行动增量更新条目 */
export interface ActionUpdateEntry {
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
  actions: ActionUpdateEntry[];
  removeActionIds?: string[];
  actionOrder?: string[];
  autoBattle?: boolean;
  autoUsePills?: AutoUsePillConfig[];
  autoBattleTargetingMode?: AutoBattleTargetingMode;
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
  itemKey: string;
  item: SyncedItemStack;
}

export interface SyncedLootWindowSourceView {
  sourceId: string;
  kind: LootSourceKind;
  variant?: LootSourceVariant;
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
  searchable: boolean;
  search?: LootSearchProgressView;
  herb?: LootWindowHerbMeta;
  destroyed?: boolean;
  items: SyncedLootWindowItemView[];
  emptyText?: string;
}

export interface SyncedLootWindowState {
  tileX: number;
  tileY: number;
  title: string;
  sources: SyncedLootWindowSourceView[];
}

export interface S2C_LootWindowUpdate {
  window: SyncedLootWindowState | null;
}

export interface S2C_MarketUpdate {
  currencyItemId: string;
  currencyItemName: string;
  listedItems: MarketListedItemView[];
  myOrders: MarketOwnOrderView[];
  storage: MarketStorage;
}

export interface MarketListingPageEntry {
  itemId: string;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
}

export interface S2C_MarketListings {
  currencyItemId: string;
  currencyItemName: string;
  page: number;
  pageSize: number;
  total: number;
  category: ItemType | 'all';
  equipmentSlot: EquipSlot | 'all';
  techniqueCategory: TechniqueCategory | 'all';
  items: MarketListingPageEntry[];
}

export interface MarketOwnOrderSyncEntry {
  id: string;
  side: MarketOrderSide;
  status: 'open' | 'filled' | 'cancelled';
  itemId: string;
  remainingQuantity: number;
  unitPrice: number;
  createdAt: number;
}

export interface S2C_MarketOrders {
  currencyItemId: string;
  currencyItemName: string;
  orders: MarketOwnOrderSyncEntry[];
}

export interface MarketStorageSyncEntry {
  itemId: string;
  count: number;
}

export interface S2C_MarketStorage {
  items: MarketStorageSyncEntry[];
}

export interface MarketItemBookSyncView {
  itemId: string;
  sells: MarketPriceLevelView[];
  buys: MarketPriceLevelView[];
}

export interface S2C_MarketItemBook {
  currencyItemId: string;
  currencyItemName: string;
  itemId: string;
  book: MarketItemBookSyncView | null;
}

export interface S2C_MarketTradeHistory {
  page: number;
  pageSize: number;
  totalVisible: number;
  records: Array<{
    id: string;
    side: 'buy' | 'sell';
    itemId: string;
    quantity: number;
    unitPrice: number;
    createdAt: number;
  }>;
}

export interface SyncedNpcShopItemView {
  itemId: string;
  item: SyncedItemStack;
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

export interface SyncedNpcShopView {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: SyncedNpcShopItemView[];
}

export interface S2C_NpcShop {
  npcId: string;
  shop: SyncedNpcShopView | null;
  error?: string;
}

export interface S2C_AlchemyPanel {
  state: SyncedAlchemyPanelState | null;
  catalogVersion: number;
  catalog?: AlchemyRecipeCatalogEntry[];
  error?: string;
}

export interface S2C_TileRuntimeDetail {
  mapId: string;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  destroyed?: boolean;
  restoreTicksLeft?: number;
  resources: Array<{
    key: string;
    label: string;
    value: number;
    effectiveValue?: number;
    level?: number;
    sourceValue?: number;
  }>;
  entities?: ObservedTileEntityDetail[];
}

/** 任务列表更新 */
export interface S2C_QuestUpdate {
  quests: Array<{
    id: string;
    status: QuestState['status'];
    progress: number;
  }>;
}

export interface S2C_AttrDetail {
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs: Attributes;
  numericStats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
  numericStatBreakdowns: NumericStatBreakdownMap;
  alchemySkill?: PlayerState['alchemySkill'];
}

export interface LeaderboardPlayerEntry {
  rank: number;
  playerId: string;
  playerName: string;
}

export interface LeaderboardRealmEntry extends LeaderboardPlayerEntry {
  realmLv: number;
  realmName: string;
  realmShortName?: string;
  progress: number;
  foundation: number;
}

export interface LeaderboardMonsterKillEntry extends LeaderboardPlayerEntry {
  totalKills: number;
  eliteKills: number;
  bossKills: number;
}

export interface LeaderboardSpiritStoneEntry extends LeaderboardPlayerEntry {
  spiritStoneCount: number;
}

export interface LeaderboardPlayerKillEntry extends LeaderboardPlayerEntry {
  playerKillCount: number;
}

export interface LeaderboardDeathEntry extends LeaderboardPlayerEntry {
  deathCount: number;
}

export interface LeaderboardBodyTrainingEntry extends LeaderboardPlayerEntry {
  level: number;
  exp: number;
  expToNext: number;
}

export interface LeaderboardSupremeAttrEntry {
  attr: 'constitution' | 'spirit' | 'perception' | 'talent';
  label: string;
  playerId: string;
  playerName: string;
  value: number;
}

export interface S2C_Leaderboard {
  generatedAt: number;
  limit: number;
  boards: {
    realm: LeaderboardRealmEntry[];
    monsterKills: LeaderboardMonsterKillEntry[];
    spiritStones: LeaderboardSpiritStoneEntry[];
    playerKills: LeaderboardPlayerKillEntry[];
    deaths: LeaderboardDeathEntry[];
    bodyTraining: LeaderboardBodyTrainingEntry[];
    supremeAttrs: LeaderboardSupremeAttrEntry[];
  };
}

/** 任务自动导航回执 */
export interface S2C_QuestNavigateResult {
  questId: string;
  ok: boolean;
  error?: string;
}

/** 系统消息 */
export interface S2C_SystemMsg {
  id?: string;
  text: string;
  kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';
  from?: string;
  occurredAt?: number;
  persistUntilAck?: boolean;
  floating?: {
    x: number;
    y: number;
    text: string;
    color?: string;
  };
}

export interface S2C_MailSummary {
  summary: MailSummaryView;
}

export interface S2C_MailPage {
  page: MailPageView;
}

export interface S2C_MailDetail {
  detail: MailDetailView | null;
  error?: string;
}

export interface S2C_MailOpResult {
  operation: 'markRead' | 'claim' | 'delete';
  ok: boolean;
  mailIds: string[];
  message?: string;
}

// ===== 建议系统 Payload =====

/** 建议系统 Payload */

/** 主动请求最新建议列表 */
export interface C2S_RequestSuggestions {}

/** 创建建议 */
export interface C2S_CreateSuggestion {
  title: string;
  description: string;
}

/** 建议投票 */
export interface C2S_VoteSuggestion {
  suggestionId: string;
  vote: 'up' | 'down';
}

export interface C2S_ReplySuggestion {
  suggestionId: string;
  content: string;
}

export interface C2S_MarkSuggestionRepliesRead {
  suggestionId: string;
}

export interface C2S_GmMarkSuggestionCompleted {
  suggestionId: string;
}

export interface C2S_GmRemoveSuggestion {
  suggestionId: string;
}

/** 建议列表更新 */
export interface S2C_SuggestionUpdate {
  suggestions: Suggestion[];
}

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
  accountName: string;
  password: string;
  displayName: string;
  roleName: string;
}

/** 登录请求 */
export interface AuthLoginReq {
  loginName: string;
  password: string;
}

/** 刷新令牌请求 */
export interface AuthRefreshReq {
  refreshToken: string;
}

/** 令牌响应 */
export interface AuthTokenRes {
  accessToken: string;
  refreshToken: string;
}

export interface GmListSuggestionsQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface GmReplySuggestionReq {
  content: string;
}

export interface GmSuggestionListRes {
  items: Suggestion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  keyword: string;
}

/** 显示名可用性检查响应 */
export interface DisplayNameAvailabilityRes {
  available: boolean;
  message?: string;
}

/** 修改密码请求 */
export interface AccountUpdatePasswordReq {
  currentPassword: string;
  newPassword: string;
}

/** 修改显示名请求 */
export interface AccountUpdateDisplayNameReq {
  displayName: string;
}

export interface AccountUpdateDisplayNameRes {
  displayName: string;
}

/** 修改角色名请求 */
export interface AccountUpdateRoleNameReq {
  roleName: string;
}

export interface AccountUpdateRoleNameRes {
  roleName: string;
}

export interface BasicOkRes {
  ok: true;
}

/** GM 登录请求 */
export interface GmLoginReq {
  password: string;
}

export interface GmLoginRes {
  accessToken: string;
  expiresInSec: number;
}

/** GM 修改密码请求 */
export interface GmChangePasswordReq {
  currentPassword: string;
  newPassword: string;
}

/** GM 直接修改玩家账号密码请求 */
export interface GmUpdateManagedPlayerPasswordReq {
  newPassword: string;
}

/** GM 直接修改玩家账号请求 */
export interface GmUpdateManagedPlayerAccountReq {
  username: string;
}

/** GM 管理的玩家元信息 */
export interface GmManagedPlayerMeta {
  userId?: string;
  isBot: boolean;
  online: boolean;
  inWorld: boolean;
  lastHeartbeatAt?: string;
  offlineSinceAt?: string;
  updatedAt?: string;
  dirtyFlags: string[];
}

/** GM 管理的玩家摘要 */
export interface GmManagedPlayerSummary {
  id: string;
  name: string;
  roleName: string;
  displayName: string;
  accountName?: string;
  realmLv: number;
  realmLabel: string;
  mapId: string;
  mapName: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi: number;
  dead: boolean;
  autoBattle: boolean;
  autoBattleStationary?: boolean;
  autoRetaliate: boolean;
  meta: GmManagedPlayerMeta;
}

/** GM 可查看的账号信息 */
export interface GmManagedAccountRecord {
  userId: string;
  username: string;
  createdAt: string;
  totalOnlineSeconds: number;
}

/** GM 管理的玩家完整记录（含快照） */
export interface GmManagedPlayerRecord extends GmManagedPlayerSummary {
  account?: GmManagedAccountRecord;
  snapshot: PlayerState;
  persistedSnapshot: unknown;
}

export interface GmStateRes {
  players: GmManagedPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}

export interface RedeemCodeGroupRewardItem {
  itemId: string;
  count: number;
}

export interface RedeemCodeGroupView {
  id: string;
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
  totalCodeCount: number;
  usedCodeCount: number;
  activeCodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RedeemCodeCodeView {
  id: string;
  groupId: string;
  code: string;
  status: 'active' | 'used' | 'destroyed';
  usedByPlayerId: string | null;
  usedByRoleName: string | null;
  usedAt: string | null;
  destroyedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GmRedeemCodeGroupListRes {
  groups: RedeemCodeGroupView[];
}

export interface GmRedeemCodeGroupDetailRes {
  group: RedeemCodeGroupView;
  codes: RedeemCodeCodeView[];
}

export interface GmCreateRedeemCodeGroupReq {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
  count: number;
}

export interface GmUpdateRedeemCodeGroupReq {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
}

export interface GmCreateRedeemCodeGroupRes {
  group: RedeemCodeGroupView;
  codes: string[];
}

export interface GmAppendRedeemCodesReq {
  count: number;
}

export interface GmAppendRedeemCodesRes {
  group: RedeemCodeGroupView;
  codes: string[];
}

export interface AccountRedeemCodesReq {
  codes: string[];
}

export interface AccountRedeemCodeResult {
  code: string;
  ok: boolean;
  message: string;
  groupName?: string;
  rewards?: RedeemCodeGroupRewardItem[];
}

export interface AccountRedeemCodesRes {
  results: AccountRedeemCodeResult[];
}

export type GmDatabaseBackupKind = 'hourly' | 'daily' | 'manual' | 'pre_import';

export type GmDatabaseJobType = 'backup' | 'restore';

export type GmDatabaseJobStatus = 'running' | 'completed' | 'failed';

export interface GmDatabaseBackupRecord {
  id: string;
  kind: GmDatabaseBackupKind;
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

export interface GmDatabaseJobSnapshot {
  id: string;
  type: GmDatabaseJobType;
  status: GmDatabaseJobStatus;
  startedAt: string;
  finishedAt?: string;
  kind?: GmDatabaseBackupKind;
  backupId?: string;
  sourceBackupId?: string;
  error?: string;
}

export interface GmDatabaseStateRes {
  backups: GmDatabaseBackupRecord[];
  runningJob?: GmDatabaseJobSnapshot;
  lastJob?: GmDatabaseJobSnapshot;
  persistenceEnabled?: boolean;
  compatScope?: 'persistent_documents_only';
  restoreMode?: 'replace_persistent_documents';
  note?: string;
  automation?: {
    retentionEnforced: boolean;
    schedulesActive: boolean;
    restoreRequiresMaintenance: boolean;
    preImportBackupEnabled: boolean;
  };
  retention: {
    hourly: number;
    daily: number;
  };
  schedules: {
    hourly: string;
    daily: string;
  };
}

export interface GmTriggerDatabaseBackupRes {
  job: GmDatabaseJobSnapshot;
  compatScope?: 'persistent_documents_only';
  documentsCount?: number;
}

export interface GmRestoreDatabaseReq {
  backupId: string;
}

export interface GmPlayerDetailRes {
  player: GmManagedPlayerRecord;
}

export interface GmEditorTechniqueOption {
  id: string;
  name: string;
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  skills?: SkillDef[];
  layers?: TechniqueLayerDef[];
}

export interface GmEditorItemOption {
  itemId: string;
  name: string;
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
  consumeBuffs?: ConsumableBuffDef[];
  alchemySuccessRate?: number;
  alchemySpeedRate?: number;
  mapUnlockId?: string;
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

export interface GmEditorRealmOption {
  realmLv: number;
  displayName: string;
  name: string;
  phaseName?: string;
  review?: string;
}

export interface GmEditorBuffOption extends TemporaryBuffState {}

export interface GmEditorCatalogRes {
  techniques: GmEditorTechniqueOption[];
  items: GmEditorItemOption[];
  realmLevels: GmEditorRealmOption[];
  buffs: GmEditorBuffOption[];
}


export type GmPlayerUpdateSection =
  | 'basic'
  | 'position'
  | 'realm'
  | 'buffs'
  | 'techniques'
  | 'items'
  | 'quests';

export interface GmUpdatePlayerReq {
  snapshot: Partial<PlayerState>;
  section?: GmPlayerUpdateSection;
}

export interface GmSpawnBotsReq {
  anchorPlayerId: string;
  count: number;
}

export interface GmRemoveBotsReq {
  playerIds?: string[];
  all?: boolean;
}

export interface GmShortcutRunRes {
  ok: true;
  totalPlayers: number;
  queuedRuntimePlayers: number;
  updatedOfflinePlayers: number;
  targetMapId: string;
  targetX: number;
  targetY: number;
}

/** GM 地图传送点记录 */
export interface GmMapPortalRecord {
  x: number;
  y: number;
  targetMapId: string;
  targetX: number;
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
  x: number;
  y: number;
  value: number;
}

/** GM 地图气机记录 */
export interface GmMapResourceRecord {
  x: number;
  y: number;
  resourceKey: string;
  value: number;
}

/** GM 地图安全区记录 */
export interface GmMapSafeZoneRecord {
  x: number;
  y: number;
  radius: number;
}

/** GM 地图地标记录 */
export interface GmMapLandmarkRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  desc?: string;
  resourceNodeId?: string;
  container?: GmMapContainerRecord;
}

/** GM 地图资源节点分组中的单个布点 */
export interface GmMapResourceNodePlacementRecord {
  x: number;
  y: number;
  id?: string;
  name?: string;
  desc?: string;
}

/** GM 地图资源节点分组记录 */
export interface GmMapResourceNodeGroupRecord {
  resourceNodeId: string;
  idPrefix?: string;
  name?: string;
  desc?: string;
  placements: GmMapResourceNodePlacementRecord[];
}

/** GM 地图掉落物记录 */
export interface GmMapDropRecord {
  itemId: string;
  name: string;
  type: ItemType;
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
  variant?: LootSourceVariant;
  grade?: TechniqueGrade;
  refreshTicks?: number;
  refreshTicksMin?: number;
  refreshTicksMax?: number;
  char?: string;
  color?: string;
  drops?: GmMapDropRecord[];
  lootPools?: GmMapContainerLootPoolRecord[];
}

/** GM 地图任务记录 */
export interface GmMapQuestRecord {
  id: string;
  title: string;
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

export interface GmMapNpcShopItemRecord {
  itemId: string;
  price?: number;
  stockLimit?: number;
  refreshSeconds?: number;
  priceFormula?: 'technique_realm_square_grade';
}

/** GM 地图 NPC 记录 */
export interface GmMapNpcRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  dialogue: string;
  role?: string;
  shopItems?: GmMapNpcShopItemRecord[];
  quests?: GmMapQuestRecord[];
}

/** GM 地图怪物刷新点记录 */
export interface GmMapMonsterSpawnRecord {
  id: string;
  templateId?: string;
  name?: string;
  x: number;
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
  initialBuffs?: MonsterInitialBuffDef[];
  skills?: string[];
  tier?: MonsterTier;
  expMultiplier?: number;
  drops?: GmMapDropRecord[];
}

/** GM 完整地图文档 */
export interface GmMapDocument {
  id: string;
  name: string;
  width: number;
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
  tiles: string[];
  portals: GmMapPortalRecord[];
  spawnPoint: {
    x: number;
    y: number;
  };
  time?: MapTimeConfig;
  auras?: GmMapAuraRecord[];
  resources?: GmMapResourceRecord[];
  safeZones?: GmMapSafeZoneRecord[];
  landmarks?: GmMapLandmarkRecord[];
  resourceNodeGroups?: GmMapResourceNodeGroupRecord[];
  npcs: GmMapNpcRecord[];
  monsterSpawns: GmMapMonsterSpawnRecord[];
}

/** GM 地图摘要 */
export interface GmMapSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  description?: string;
  terrainRealmLv?: number;
  dangerLevel?: number;
  recommendedRealm?: string;
  portalCount: number;
  npcCount: number;
  monsterSpawnCount: number;
  catalogMode?: 'main' | 'piece';
  catalogGroupId?: string;
  catalogGroupName?: string;
  sourcePath?: string;
}

export interface GmMapListRes {
  maps: GmMapSummary[];
}

export interface GmMapDetailRes {
  map: GmMapDocument;
}

export interface GmUpdateMapReq {
  map: GmMapDocument;
}

// ===== GM 世界管理 =====

/** GM 运行时地图实体 */
export interface GmRuntimeEntity {
  id: string;
  x: number;
  y: number;
  char: string;
  color: string;
  name: string;
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
  mapId: string;
  mapName: string;
  width: number;
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

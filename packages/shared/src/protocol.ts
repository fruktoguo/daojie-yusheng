/**
 * 前后端通信协议：事件名定义与所有 Payload 类型。
 * C2S = 客户端→服务端，S2C = 服务端→客户端。
 */
import type { ElementKey } from './numeric';
import { Direction, PlayerState, Tile, VisibleTile, RenderEntity, MapMeta, Attributes, Inventory, EquipmentSlots, TechniqueState, ActionDef, AttrBonus, EquipSlot, EntityKind, NpcQuestMarker, ObservationInsight, PlayerRealmState, PlayerSpecialStats, QuestState, CombatEffect, AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, ItemType, QuestLine, QuestObjectiveType, GameTimeState, MapTimeConfig, MonsterAggroMode, MonsterInitialBuffDef, MonsterTier, NumericStatPercentages, TechniqueCategory, TechniqueGrade, GroundItemPileView, LootSearchProgressView, VisibleBuffState, TemporaryBuffState, ActionType, SkillDef, TechniqueAttrCurves, TechniqueLayerDef, TechniqueRealm, GroundItemEntryView, LootSourceKind, LootSourceVariant, LootWindowHerbMeta, MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot, Suggestion, ItemStack, EquipmentEffectDef, ConsumableBuffDef, MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView, MarketPriceLevelView, MarketOrderSide, MapRouteDomain, PortalRouteDomain, MailSummaryView, MailPageView, MailDetailView, MailFilter, MailTemplateArg, MailAttachment, BodyTrainingState, AlchemyIngredientSelection, AlchemyRecipeCatalogEntry, SyncedAlchemyPanelState, EnhancementTargetRef, SyncedEnhancementPanelState } from './types';
import { NumericRatioDivisors, NumericStatBreakdownMap, NumericStats } from './numeric';

// ===== 事件名 =====

/** 客户端 → 服务端 */
export const C2S = {
  Move: 'c:move',
  MoveTo: 'c:moveTo',
  NavigateQuest: 'c:navigateQuest',
  NavigateMapPoint: 'c:navigateMapPoint',
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
  UpdateCombatTargetingRules: 'c:updateCombatTargetingRules',
  UpdateAutoBattleTargetingMode: 'c:updateAutoBattleTargetingMode',
  UpdateTechniqueSkillAvailability: 'c:updateTechniqueSkillAvailability',
  DebugResetSpawn: 'c:debugResetSpawn',
  Chat: 'c:chat',
  AckSystemMessages: 'c:ackSystemMessages',
  UseItem: 'c:useItem',
  DropItem: 'c:dropItem',
  DestroyItem: 'c:destroyItem',
  TakeLoot: 'c:takeLoot',
  CloseLootWindow: 'c:closeLootWindow',
  StopLootHarvest: 'c:stopLootHarvest',
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
  RequestWorldSummary: 'c:requestWorldSummary',
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
  RequestEnhancementPanel: 'c:requestEnhancementPanel',
  StartEnhancement: 'c:startEnhancement',
  CancelEnhancement: 'c:cancelEnhancement',
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
  WorldSummary: 's:worldSummary',
  NpcShop: 's:npcShop',
  AlchemyPanel: 's:alchemyPanel',
  EnhancementPanel: 's:enhancementPanel',
} as const;

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

/** 以地图坐标为目标启动自动导航，可跨图前往 */
export interface C2S_NavigateMapPoint {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
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

/** C2S_UpdateAutoUsePills：定义该接口的能力与字段约束。 */
export interface C2S_UpdateAutoUsePills {
/** pills：定义该变量以承载业务值。 */
  pills: AutoUsePillConfig[];
}

/** C2S_UpdateCombatTargetingRules：定义该接口的能力与字段约束。 */
export interface C2S_UpdateCombatTargetingRules {
/** combatTargetingRules：定义该变量以承载业务值。 */
  combatTargetingRules: NonNullable<PlayerState['combatTargetingRules']>;
}

/** C2S_UpdateAutoBattleTargetingMode：定义该接口的能力与字段约束。 */
export interface C2S_UpdateAutoBattleTargetingMode {
/** mode：定义该变量以承载业务值。 */
  mode: AutoBattleTargetingMode;
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

/** C2S_RequestMarketListings：定义该接口的能力与字段约束。 */
export interface C2S_RequestMarketListings {
/** page：定义该变量以承载业务值。 */
  page: number;
  pageSize?: number;
  category?: ItemType | 'all';
  equipmentSlot?: EquipSlot | 'all';
  techniqueCategory?: TechniqueCategory | 'all';
}

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

/** C2S_RequestAttrDetail：定义该接口的能力与字段约束。 */
export interface C2S_RequestAttrDetail {}

/** C2S_RequestLeaderboard：定义该接口的能力与字段约束。 */
export interface C2S_RequestLeaderboard {
  limit?: number;
}

/** C2S_RequestWorldSummary：定义该接口的能力与字段约束。 */
export interface C2S_RequestWorldSummary {}

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
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
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

/** C2S_RequestAlchemyPanel：定义该接口的能力与字段约束。 */
export interface C2S_RequestAlchemyPanel {
  knownCatalogVersion?: number;
}

/** C2S_SaveAlchemyPreset：定义该接口的能力与字段约束。 */
export interface C2S_SaveAlchemyPreset {
  presetId?: string;
/** recipeId：定义该变量以承载业务值。 */
  recipeId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** ingredients：定义该变量以承载业务值。 */
  ingredients: AlchemyIngredientSelection[];
}

/** C2S_DeleteAlchemyPreset：定义该接口的能力与字段约束。 */
export interface C2S_DeleteAlchemyPreset {
/** presetId：定义该变量以承载业务值。 */
  presetId: string;
}

/** C2S_StartAlchemy：定义该接口的能力与字段约束。 */
export interface C2S_StartAlchemy {
/** recipeId：定义该变量以承载业务值。 */
  recipeId: string;
/** ingredients：定义该变量以承载业务值。 */
  ingredients: AlchemyIngredientSelection[];
/** quantity：定义该变量以承载业务值。 */
  quantity: number;
}

/** C2S_CancelAlchemy：定义该接口的能力与字段约束。 */
export interface C2S_CancelAlchemy {}

/** C2S_RequestEnhancementPanel：定义该接口的能力与字段约束。 */
export interface C2S_RequestEnhancementPanel {}

/** C2S_StartEnhancement：定义该接口的能力与字段约束。 */
export interface C2S_StartEnhancement {
/** target：定义该变量以承载业务值。 */
  target: EnhancementTargetRef;
  protection?: EnhancementTargetRef | null;
  targetLevel?: number;
  protectionStartLevel?: number | null;
}

/** C2S_CancelEnhancement：定义该接口的能力与字段约束。 */
export interface C2S_CancelEnhancement {}

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
  badge?: RenderEntity['badge'] | null;
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
  tile: VisibleTile;
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

/** 关闭拿取窗口 */
export interface C2S_CloseLootWindow {}

/** 停止当前连续采摘 */
export interface C2S_StopLootHarvest {}

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
  gatherSkill?: PlayerState['gatherSkill'];
  enhancementSkill?: PlayerState['enhancementSkill'];
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
  enhancementSuccessRate?: number;
  enhancementSpeedRate?: number;
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
  autoUsePills?: AutoUsePillConfig[];
  combatTargetingRules?: PlayerState['combatTargetingRules'];
  autoBattleTargetingMode?: AutoBattleTargetingMode;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  retaliatePlayerTargetId?: string | null;
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
  variant?: LootSourceVariant;
/** title：定义该变量以承载业务值。 */
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
/** searchable：定义该变量以承载业务值。 */
  searchable: boolean;
  search?: LootSearchProgressView;
  herb?: LootWindowHerbMeta;
  destroyed?: boolean;
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

/** MarketListingPageEntry：定义该接口的能力与字段约束。 */
export interface MarketListingVariantEntry {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
/** sellOrderCount：定义该变量以承载业务值。 */
  sellOrderCount: number;
/** sellQuantity：定义该变量以承载业务值。 */
  sellQuantity: number;
/** buyOrderCount：定义该变量以承载业务值。 */
  buyOrderCount: number;
/** buyQuantity：定义该变量以承载业务值。 */
  buyQuantity: number;
}

/** MarketListingPageEntry：定义该接口的能力与字段约束。 */
export interface MarketListingPageEntry {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
/** canEnhance：定义该变量以承载业务值。 */
  canEnhance: boolean;
/** variants：定义该变量以承载业务值。 */
  variants: MarketListingVariantEntry[];
}

/** S2C_MarketListings：定义该接口的能力与字段约束。 */
export interface S2C_MarketListings {
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** total：定义该变量以承载业务值。 */
  total: number;
/** category：定义该变量以承载业务值。 */
  category: ItemType | 'all';
/** equipmentSlot：定义该变量以承载业务值。 */
  equipmentSlot: EquipSlot | 'all';
/** techniqueCategory：定义该变量以承载业务值。 */
  techniqueCategory: TechniqueCategory | 'all';
/** items：定义该变量以承载业务值。 */
  items: MarketListingPageEntry[];
}

/** MarketOwnOrderSyncEntry：定义该接口的能力与字段约束。 */
export interface MarketOwnOrderSyncEntry {
/** id：定义该变量以承载业务值。 */
  id: string;
/** side：定义该变量以承载业务值。 */
  side: MarketOrderSide;
/** status：定义该变量以承载业务值。 */
  status: 'open' | 'filled' | 'cancelled';
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** remainingQuantity：定义该变量以承载业务值。 */
  remainingQuantity: number;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
}

/** S2C_MarketOrders：定义该接口的能力与字段约束。 */
export interface S2C_MarketOrders {
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** orders：定义该变量以承载业务值。 */
  orders: MarketOwnOrderSyncEntry[];
}

/** MarketStorageSyncEntry：定义该接口的能力与字段约束。 */
export interface MarketStorageSyncEntry {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** S2C_MarketStorage：定义该接口的能力与字段约束。 */
export interface S2C_MarketStorage {
/** items：定义该变量以承载业务值。 */
  items: MarketStorageSyncEntry[];
}

/** MarketItemBookSyncView：定义该接口的能力与字段约束。 */
export interface MarketItemBookSyncView {
/** itemKey：定义该变量以承载业务值。 */
  itemKey: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** sells：定义该变量以承载业务值。 */
  sells: MarketPriceLevelView[];
/** buys：定义该变量以承载业务值。 */
  buys: MarketPriceLevelView[];
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
  book: MarketItemBookSyncView | null;
}

/** S2C_MarketTradeHistory：定义该接口的能力与字段约束。 */
export interface S2C_MarketTradeHistory {
/** page：定义该变量以承载业务值。 */
  page: number;
/** pageSize：定义该变量以承载业务值。 */
  pageSize: number;
/** totalVisible：定义该变量以承载业务值。 */
  totalVisible: number;
  records: Array<{
/** id：定义该变量以承载业务值。 */
    id: string;
/** side：定义该变量以承载业务值。 */
    side: 'buy' | 'sell';
/** itemId：定义该变量以承载业务值。 */
    itemId: string;
/** quantity：定义该变量以承载业务值。 */
    quantity: number;
/** unitPrice：定义该变量以承载业务值。 */
    unitPrice: number;
/** createdAt：定义该变量以承载业务值。 */
    createdAt: number;
  }>;
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

/** S2C_AlchemyPanel：定义该接口的能力与字段约束。 */
export interface S2C_AlchemyPanel {
/** state：定义该变量以承载业务值。 */
  state: SyncedAlchemyPanelState | null;
/** catalogVersion：定义该变量以承载业务值。 */
  catalogVersion: number;
  catalog?: AlchemyRecipeCatalogEntry[];
  error?: string;
}

/** S2C_EnhancementPanel：定义该接口的能力与字段约束。 */
export interface S2C_EnhancementPanel {
/** state：定义该变量以承载业务值。 */
  state: SyncedEnhancementPanelState | null;
  error?: string;
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
  quests: Array<{
/** id：定义该变量以承载业务值。 */
    id: string;
/** status：定义该变量以承载业务值。 */
    status: QuestState['status'];
/** progress：定义该变量以承载业务值。 */
    progress: number;
  }>;
}

/** S2C_AttrDetail：定义该接口的能力与字段约束。 */
export interface S2C_AttrDetail {
/** baseAttrs：定义该变量以承载业务值。 */
  baseAttrs: Attributes;
/** bonuses：定义该变量以承载业务值。 */
  bonuses: AttrBonus[];
/** finalAttrs：定义该变量以承载业务值。 */
  finalAttrs: Attributes;
/** numericStats：定义该变量以承载业务值。 */
  numericStats: NumericStats;
/** ratioDivisors：定义该变量以承载业务值。 */
  ratioDivisors: NumericRatioDivisors;
/** numericStatBreakdowns：定义该变量以承载业务值。 */
  numericStatBreakdowns: NumericStatBreakdownMap;
  alchemySkill?: PlayerState['alchemySkill'];
  gatherSkill?: PlayerState['gatherSkill'];
  enhancementSkill?: PlayerState['enhancementSkill'];
}

/** LeaderboardPlayerEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardPlayerEntry {
/** rank：定义该变量以承载业务值。 */
  rank: number;
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** playerName：定义该变量以承载业务值。 */
  playerName: string;
}

/** LeaderboardRealmEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardRealmEntry extends LeaderboardPlayerEntry {
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** realmName：定义该变量以承载业务值。 */
  realmName: string;
  realmShortName?: string;
/** progress：定义该变量以承载业务值。 */
  progress: number;
/** foundation：定义该变量以承载业务值。 */
  foundation: number;
}

/** LeaderboardMonsterKillEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardMonsterKillEntry extends LeaderboardPlayerEntry {
/** totalKills：定义该变量以承载业务值。 */
  totalKills: number;
/** eliteKills：定义该变量以承载业务值。 */
  eliteKills: number;
/** bossKills：定义该变量以承载业务值。 */
  bossKills: number;
}

/** LeaderboardSpiritStoneEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardSpiritStoneEntry extends LeaderboardPlayerEntry {
/** spiritStoneCount：定义该变量以承载业务值。 */
  spiritStoneCount: number;
}

/** LeaderboardPlayerKillEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardPlayerKillEntry extends LeaderboardPlayerEntry {
/** playerKillCount：定义该变量以承载业务值。 */
  playerKillCount: number;
}

/** LeaderboardDeathEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardDeathEntry extends LeaderboardPlayerEntry {
/** deathCount：定义该变量以承载业务值。 */
  deathCount: number;
}

/** LeaderboardBodyTrainingEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardBodyTrainingEntry extends LeaderboardPlayerEntry {
/** level：定义该变量以承载业务值。 */
  level: number;
/** exp：定义该变量以承载业务值。 */
  exp: number;
/** expToNext：定义该变量以承载业务值。 */
  expToNext: number;
}

/** LeaderboardSupremeAttrEntry：定义该接口的能力与字段约束。 */
export interface LeaderboardSupremeAttrEntry {
/** attr：定义该变量以承载业务值。 */
  attr: 'constitution' | 'spirit' | 'perception' | 'talent';
/** label：定义该变量以承载业务值。 */
  label: string;
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** playerName：定义该变量以承载业务值。 */
  playerName: string;
/** value：定义该变量以承载业务值。 */
  value: number;
}

/** LeaderboardWorldActionCounts：定义该接口的能力与字段约束。 */
export interface LeaderboardWorldActionCounts {
/** cultivation：定义该变量以承载业务值。 */
  cultivation: number;
/** combat：定义该变量以承载业务值。 */
  combat: number;
/** alchemy：定义该变量以承载业务值。 */
  alchemy: number;
/** enhancement：定义该变量以承载业务值。 */
  enhancement: number;
}

/** LeaderboardWorldRealmCounts：定义该接口的能力与字段约束。 */
export interface LeaderboardWorldRealmCounts {
/** initial：定义该变量以承载业务值。 */
  initial: number;
/** mortal：定义该变量以承载业务值。 */
  mortal: number;
/** qiRefiningOrAbove：定义该变量以承载业务值。 */
  qiRefiningOrAbove: number;
}

/** LeaderboardWorldKillCounts：定义该接口的能力与字段约束。 */
export interface LeaderboardWorldKillCounts {
/** normalMonsters：定义该变量以承载业务值。 */
  normalMonsters: number;
/** eliteMonsters：定义该变量以承载业务值。 */
  eliteMonsters: number;
/** bossMonsters：定义该变量以承载业务值。 */
  bossMonsters: number;
/** playerKills：定义该变量以承载业务值。 */
  playerKills: number;
/** playerDeaths：定义该变量以承载业务值。 */
  playerDeaths: number;
}

/** LeaderboardWorldSummary：定义该接口的能力与字段约束。 */
export interface LeaderboardWorldSummary {
/** totalSpiritStones：定义该变量以承载业务值。 */
  totalSpiritStones: number;
/** actionCounts：定义该变量以承载业务值。 */
  actionCounts: LeaderboardWorldActionCounts;
/** realmCounts：定义该变量以承载业务值。 */
  realmCounts: LeaderboardWorldRealmCounts;
/** killCounts：定义该变量以承载业务值。 */
  killCounts: LeaderboardWorldKillCounts;
}

/** S2C_Leaderboard：定义该接口的能力与字段约束。 */
export interface S2C_Leaderboard {
/** generatedAt：定义该变量以承载业务值。 */
  generatedAt: number;
/** limit：定义该变量以承载业务值。 */
  limit: number;
  boards: {
/** realm：定义该变量以承载业务值。 */
    realm: LeaderboardRealmEntry[];
/** monsterKills：定义该变量以承载业务值。 */
    monsterKills: LeaderboardMonsterKillEntry[];
/** spiritStones：定义该变量以承载业务值。 */
    spiritStones: LeaderboardSpiritStoneEntry[];
/** playerKills：定义该变量以承载业务值。 */
    playerKills: LeaderboardPlayerKillEntry[];
/** deaths：定义该变量以承载业务值。 */
    deaths: LeaderboardDeathEntry[];
/** bodyTraining：定义该变量以承载业务值。 */
    bodyTraining: LeaderboardBodyTrainingEntry[];
/** supremeAttrs：定义该变量以承载业务值。 */
    supremeAttrs: LeaderboardSupremeAttrEntry[];
  };
}

/** S2C_WorldSummary：定义该接口的能力与字段约束。 */
export interface S2C_WorldSummary {
/** generatedAt：定义该变量以承载业务值。 */
  generatedAt: number;
/** summary：定义该变量以承载业务值。 */
  summary: LeaderboardWorldSummary;
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
  kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';
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
/** deviceId：定义该变量以承载业务值。 */
  deviceId?: string;
}

/** 登录请求 */
export interface AuthLoginReq {
/** loginName：定义该变量以承载业务值。 */
  loginName: string;
/** password：定义该变量以承载业务值。 */
  password: string;
/** deviceId：定义该变量以承载业务值。 */
  deviceId?: string;
}

/** 刷新令牌请求 */
export interface AuthRefreshReq {
/** refreshToken：定义该变量以承载业务值。 */
  refreshToken: string;
/** deviceId：定义该变量以承载业务值。 */
  deviceId?: string;
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

/** GM 直接封禁玩家账号请求 */
export interface GmBanManagedPlayerReq {
/** reason：定义该变量以承载业务值。 */
  reason?: string;
}

/** GM 按风险阈值批量封禁请求 */
export interface GmBanPlayersByRiskReq {
/** minRiskScore：定义该变量以承载业务值。 */
  minRiskScore: number;
/** reason：定义该变量以承载业务值。 */
  reason?: string;
/** expectedMatchedPlayers：定义该变量以承载业务值。 */
  expectedMatchedPlayers?: number;
/** expectedTargetSnapshotHash：定义该变量以承载业务值。 */
  expectedTargetSnapshotHash?: string;
/** previewToken：定义该变量以承载业务值。 */
  previewToken?: string;
  keyword?: string;
  sort?: GmPlayerSortMode;
  presence?: GmPlayerPresenceFilter;
  behavior?: GmPlayerBehaviorFilter;
  accountStatus?: GmPlayerAccountStatusFilter;
}

/** GM 按风险阈值批量封禁预览响应 */
export interface GmBanPlayersByRiskPreviewRes {
  ok: true;
  matchedPlayers: number;
  minRiskScore: number;
  targetSnapshotHash: string;
  previewToken: string;
  samples: GmManagedPlayerSummary[];
}

/** GM 按风险阈值批量封禁响应 */
export interface GmBanPlayersByRiskRes {
/** ok：定义该变量以承载业务值。 */
  ok: true;
/** matchedPlayers：定义该变量以承载业务值。 */
  matchedPlayers: number;
/** bannedPlayers：定义该变量以承载业务值。 */
  bannedPlayers: number;
/** skippedPlayers：定义该变量以承载业务值。 */
  skippedPlayers: number;
/** minRiskScore：定义该变量以承载业务值。 */
  minRiskScore: number;
}

/** GM 可查看的账号状态 */
export type GmManagedAccountStatus = 'active' | 'banned';

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
/** behaviors：定义该变量以承载业务值。 */
  behaviors: GmManagedPlayerBehavior[];
  accountStatus: GmManagedPlayerAccountStatus;
/** riskScore：定义该变量以承载业务值。 */
  riskScore: number;
/** riskLevel：定义该变量以承载业务值。 */
  riskLevel: GmPlayerRiskLevel;
/** riskTags：定义该变量以承载业务值。 */
  riskTags: string[];
/** isRiskAdmin：定义该变量以承载业务值。 */
  isRiskAdmin: boolean;
  /** meta：定义该变量以承载业务值。 */
  meta: GmManagedPlayerMeta;
}

/** GM 可查看的账号信息 */
export interface GmManagedAccountRecord {
/** userId：定义该变量以承载业务值。 */
  userId: string;
/** username：定义该变量以承载业务值。 */
  username: string;
/** isRiskAdmin：定义该变量以承载业务值。 */
  isRiskAdmin: boolean;
/** status：定义该变量以承载业务值。 */
  status: GmManagedAccountStatus;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: string;
/** totalOnlineSeconds：定义该变量以承载业务值。 */
  totalOnlineSeconds: number;
  bannedAt?: string;
  banReason?: string;
  bannedBy?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  lastLoginDeviceId?: string;
}

/** GM 风险操作审计记录 */
export interface GmRiskOperationAuditRecord {
  id: string;
  action: 'batch-ban-by-risk';
  operator: string;
  reason?: string;
  minRiskScore: number;
  matchedPlayers: number;
  bannedPlayers: number;
  skippedPlayers: number;
  keyword?: string;
  sort?: GmPlayerSortMode;
  presence?: GmPlayerPresenceFilter;
  behavior?: GmPlayerBehaviorFilter;
  accountStatus?: GmPlayerAccountStatusFilter;
  createdAt: string;
}

/** GmPlayerRiskLevel：定义该类型的结构与数据语义。 */
export type GmPlayerRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** GmPlayerRiskFactorKey：定义该类型的结构与数据语义。 */
export type GmPlayerRiskFactorKey =
  | 'account-integrity'
  | 'account-name-pattern'
  | 'similar-account-cluster'
  | 'account-age'
  | 'shared-ip-cluster'
  | 'shared-device-cluster'
  | 'market-transfer';

/** GmPlayerRiskFactor：定义该接口的能力与字段约束。 */
export interface GmPlayerRiskFactor {
/** key：定义该变量以承载业务值。 */
  key: GmPlayerRiskFactorKey;
/** label：定义该变量以承载业务值。 */
  label: string;
/** score：定义该变量以承载业务值。 */
  score: number;
/** maxScore：定义该变量以承载业务值。 */
  maxScore: number;
/** summary：定义该变量以承载业务值。 */
  summary: string;
/** evidence：定义该变量以承载业务值。 */
  evidence: string[];
}

/** GmPlayerRiskReport：定义该接口的能力与字段约束。 */
export interface GmPlayerRiskReport {
/** score：定义该变量以承载业务值。 */
  score: number;
/** maxScore：定义该变量以承载业务值。 */
  maxScore: number;
/** level：定义该变量以承载业务值。 */
  level: GmPlayerRiskLevel;
/** overview：定义该变量以承载业务值。 */
  overview: string;
/** generatedAt：定义该变量以承载业务值。 */
  generatedAt: string;
/** factors：定义该变量以承载业务值。 */
  factors: GmPlayerRiskFactor[];
/** recommendations：定义该变量以承载业务值。 */
  recommendations: string[];
}

/** GM 管理的玩家完整记录（含快照） */
export interface GmManagedPlayerRecord extends GmManagedPlayerSummary {
  account?: GmManagedAccountRecord;
  riskReport: GmPlayerRiskReport;
/** snapshot：定义该变量以承载业务值。 */
  snapshot: PlayerState;
/** persistedSnapshot：定义该变量以承载业务值。 */
  persistedSnapshot: unknown;
}

/** GmPlayerSortMode：定义该类型的结构与数据语义。 */
export type GmPlayerSortMode = 'realm-desc' | 'realm-asc' | 'online' | 'map' | 'name' | 'risk-desc' | 'risk-asc';

/** GmPlayerPresenceFilter：定义该类型的结构与数据语义。 */
export type GmPlayerPresenceFilter = 'all' | 'online' | 'offline-hanging' | 'offline';

/** GmManagedPlayerBehavior：定义该类型的结构与数据语义。 */
export type GmManagedPlayerBehavior = 'combat' | 'cultivation' | 'alchemy' | 'enhancement' | 'gather';

/** GmPlayerBehaviorFilter：定义该类型的结构与数据语义。 */
export type GmPlayerBehaviorFilter = 'all' | GmManagedPlayerBehavior;

/** GmManagedPlayerAccountStatus：定义该类型的结构与数据语义。 */
export type GmManagedPlayerAccountStatus = 'normal' | 'banned' | 'abnormal';

/** GmPlayerAccountStatusFilter：定义该类型的结构与数据语义。 */
export type GmPlayerAccountStatusFilter = 'all' | GmManagedPlayerAccountStatus;

/** GmListPlayersQuery：定义该接口的能力与字段约束。 */
export interface GmListPlayersQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sort?: GmPlayerSortMode;
  presence?: GmPlayerPresenceFilter;
  behavior?: GmPlayerBehaviorFilter;
  accountStatus?: GmPlayerAccountStatusFilter;
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
/** presence：定义该变量以承载业务值。 */
  presence: GmPlayerPresenceFilter;
/** behavior：定义该变量以承载业务值。 */
  behavior: GmPlayerBehaviorFilter;
  accountStatus: GmPlayerAccountStatusFilter;
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
/** riskAuditLogs：定义该变量以承载业务值。 */
  riskAuditLogs: GmRiskOperationAuditRecord[];
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
export type GmDatabaseBackupKind = 'hourly' | 'daily' | 'manual' | 'uploaded' | 'pre_import';

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

/** GmUploadDatabaseBackupRes：定义该接口的能力与字段约束。 */
export interface GmUploadDatabaseBackupRes {
/** backup：定义该变量以承载业务值。 */
  backup: GmDatabaseBackupRecord;
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
  enhancementSuccessRate?: number;
  enhancementSpeedRate?: number;
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

/** GM 地图资源节点分组中的单个布点 */
export interface GmMapResourceNodePlacementRecord {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  id?: string;
  name?: string;
  desc?: string;
}

/** GM 地图资源节点分组记录 */
export interface GmMapResourceNodeGroupRecord {
/** resourceNodeId：定义该变量以承载业务值。 */
  resourceNodeId: string;
  idPrefix?: string;
  name?: string;
  desc?: string;
/** placements：定义该变量以承载业务值。 */
  placements: GmMapResourceNodePlacementRecord[];
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
  initialBuffs?: MonsterInitialBuffDef[];
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
  resourceNodeGroups?: GmMapResourceNodeGroupRecord[];
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
  catalogMode?: 'main' | 'piece';
  catalogGroupId?: string;
  catalogGroupName?: string;
  sourcePath?: string;
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

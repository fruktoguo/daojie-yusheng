/**
 * 前后端通信协议：定义事件名，以及引导包、世界增量、面板增量、详情包等共享载荷。
 * NEXT_C2S = 客户端→服务端，NEXT_S2C = 服务端→客户端。
 */
// TODO(next:T22): 给 bootstrap / mapStatic / panelDelta / detail 这类共享载荷继续补字段一致性与新增字段门禁，避免 shared 合同先绿后漏。
// TODO(next:T23): 把协议字段一致性检查继续扩到 reset / projection / 审计脚本链路，避免 shared-only 通过却在调用端掉队。
import type { ElementKey } from './numeric';
import { Direction, PlayerState, Tile, VisibleTile, RenderEntity, MapMeta, Attributes, Inventory, EquipmentSlots, TechniqueState, ActionDef, AttrBonus, EquipSlot, EntityKind, NpcQuestMarker, ObservationInsight, PlayerRealmState, PlayerRealmStage, PlayerSpecialStats, QuestState, CombatEffect, AutoBattleSkillConfig, AutoUsePillConfig, AutoBattleTargetingMode, CombatTargetingRules, ItemType, QuestLine, QuestObjectiveType, GameTimeState, MapTimeConfig, MonsterAggroMode, MonsterTier, NumericStatPercentages, TechniqueCategory, TechniqueGrade, GroundItemPileView, LootSearchProgressView, VisibleBuffState, TemporaryBuffState, ActionType, SkillDef, TechniqueAttrCurves, TechniqueLayerDef, TechniqueRealm, GroundItemEntryView, LootSourceKind, MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot, Suggestion, ItemStack, EquipmentEffectDef, ConsumableBuffDef, MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView, MapRouteDomain, PortalRouteDomain, MailSummaryView, MailPageView, MailDetailView, MailFilter, MailTemplateArg, MailAttachment, BodyTrainingState, AlchemyIngredientSelection, AlchemyRecipeCatalogEntry, SyncedAlchemyPanelState, EnhancementTargetRef, SyncedEnhancementPanelState } from './types';
import { NumericRatioDivisors, NumericStats, NumericStatBreakdownMap } from './numeric';

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

/** 首次连接引导包：同步自身状态、首屏地图和小地图图鉴。 */
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
/** 战利品窗口增量：同步当前可拾取源与条目。 */
export interface NEXT_S2C_LootWindowUpdate {
  window: SyncedLootWindowState | null;
}

/** 任务自动导航回执：返回自动寻路是否成功。 */
export interface NEXT_S2C_QuestNavigateResult {
  questId: string;
  ok: boolean;
  error?: string;
}

/** 握手就绪声明：游客链路仅允许声明续连 sid 或首登落点。 */
export interface NEXT_C2S_Hello {
  sessionId?: string;
  mapId?: string;
  preferredX?: number;
  preferredY?: number;
}

/** 兑换码兑换结果：返回每个兑换码的奖励结果。 */
export interface NEXT_S2C_RedeemCodesResult {
  result: AccountRedeemCodesRes;
}

/** GM 总览状态：在线玩家、地图列表、机器人数量和性能快照。 */
export interface NEXT_S2C_GmState {
  players: GmPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}

/** 会话初始化包：下发会话 ID、角色 ID 和服务器时间。 */
export interface NEXT_S2C_InitSession {
  sid: string;
  pid: string;
  t: number;
  resumed?: boolean;
}

/** 地图进入包：同步地图实例、地图基础信息和进入坐标。 */
export interface NEXT_S2C_MapEnter {
  iid: string;
  mid: string;
  n: string;
  k: string;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** 地图静态快照：地图元数据、小地图、静态地块和标记增量。 */
export interface NEXT_S2C_MapStatic {
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

/** 单条通知消息，支持持久化待确认标记。 */
export interface NEXT_S2C_NoticeItem {
  id?: number;
  messageId?: string;
  kind: 'info' | 'success' | 'warn' | 'travel' | 'combat' | 'loot' | 'system' | 'chat' | 'grudge' | 'quest';
  text: string;
  from?: string;
  occurredAt?: number;
  persistUntilAck?: boolean;
}

/** 通知消息批次。 */
export interface NEXT_S2C_Notice {
  items: NEXT_S2C_NoticeItem[];
}

/** 境界面板快照。 */
export interface NEXT_S2C_Realm {
  realm: PlayerRealmState | null;
}

/** 世界增量中的玩家实体补丁。 */
export interface NEXT_S2C_WorldPlayerPatch {
  id: string;
  x?: number;
  y?: number;
  sc?: number | null;
  rm?: 1;
}

/** 世界增量中的怪物实体补丁。 */
export interface NEXT_S2C_WorldMonsterPatch {
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

/** 世界增量中的 NPC 实体补丁。 */
export interface NEXT_S2C_WorldNpcPatch {
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

/** 世界增量中的传送点补丁。 */
export interface NEXT_S2C_WorldPortalPatch {
  id: string;
  x?: number;
  y?: number;
  tm?: string;
  tr?: 0 | 1;
  rm?: 1;
}

/** 世界增量中的地面掉落补丁。 */
export interface NEXT_S2C_WorldGroundPatch {
  sourceId: string;
  x: number;
  y: number;
  items?: GroundItemEntryView[] | null;
}

/** 世界增量中的容器实体补丁。 */
export interface NEXT_S2C_WorldContainerPatch {
  id: string;
  x?: number;
  y?: number;
  n?: string;
  ch?: string;
  c?: string;
  rm?: 1;
}

/** 世界增量包：同步可见实体、战斗特效、路径、时间和地图局部补丁。 */
export interface NEXT_S2C_WorldDelta {
  t: number;
  wr: number;
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

/** 自身状态增量：位置、朝向、生命和灵力。 */
export interface NEXT_S2C_SelfDelta {
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

/** 背包面板增量。 */
export interface NEXT_S2C_PanelInventoryDelta {
  r: number;
  full?: 1;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
}

/** 装备面板增量。 */
export interface NEXT_S2C_PanelEquipmentDelta {
  r: number;
  full?: 1;
  slots: EquipmentSlotUpdateEntry[];
}

/** 功法面板增量。 */
export interface NEXT_S2C_PanelTechniqueDelta {
  r: number;
  full?: 1;
  techniques?: TechniqueUpdateEntry[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** 属性面板增量。 */
export interface NEXT_S2C_PanelAttrDelta {
  r: number;
  full?: 1;
  stage?: PlayerRealmStage;
  baseAttrs?: Attributes;
  bonuses?: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  numericStatBreakdowns?: NumericStatBreakdownMap;
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

/** 行动面板增量。 */
export interface NEXT_S2C_PanelActionDelta {
  r: number;
  full?: 1;
  actions?: ActionUpdateEntry[];
  removeActionIds?: string[];
  actionOrder?: string[];
  autoBattle?: boolean;
  autoUsePills?: AutoUsePillConfig[];
  combatTargetingRules?: CombatTargetingRules;
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

/** Buff 面板增量。 */
export interface NEXT_S2C_PanelBuffDelta {
  r: number;
  full?: 1;
  buffs?: VisibleBuffState[];
  removeBuffIds?: string[];
}

/** 面板总增量，按模块拆分下发。 */
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
export interface NEXT_C2S_Move {
  d: Direction;
}

/** 点击目标点移动 */
export interface NEXT_C2S_MoveTo {
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
export interface NEXT_C2S_NavigateQuest {
  questId: string;
}

/** 在线心跳 */
export interface NEXT_C2S_Heartbeat {
  clientAt?: number;
}

/** 客户端主动延迟探测 */
export interface NEXT_C2S_Ping {
  clientAt: number;
}

/** 地图格子运行时详情查询。 */
export interface NEXT_C2S_InspectTileRuntime {
  x: number;
  y: number;
}

/** 服务端立即回显延迟探测 */
export interface NEXT_S2C_Pong {
  clientAt: number;
  serverAt: number;
}

/** GM 总览状态请求。 */
export interface NEXT_C2S_GmGetState {}

/** GM 批量生成机器人请求。 */
export interface NEXT_C2S_GmSpawnBots {
  count: number;
}

/** GM 批量移除机器人请求。 */
export interface NEXT_C2S_GmRemoveBots {
  playerIds?: string[];
  all?: boolean;
}

/** GM 直接调整玩家位置、状态和自动战斗开关。 */
export interface NEXT_C2S_GmUpdatePlayer {
  playerId: string;
  mapId: string;
  x: number;
  y: number;
  hp: number;
  autoBattle: boolean;
}

/** GM 重置玩家状态请求。 */
export interface NEXT_C2S_GmResetPlayer {
  playerId: string;
}

/** 动作指令 */
export interface NEXT_C2S_Action {
  type?: string;
  actionId?: string;
  target?: string;
}

/** 更新自动战斗技能配置。 */
export interface NEXT_C2S_UpdateAutoBattleSkills {
  skills: AutoBattleSkillConfig[];
}

/** 更新自动用药配置。 */
export interface NEXT_C2S_UpdateAutoUsePills {
  pills: AutoUsePillConfig[];
}

/** 更新自动战斗目标选择规则。 */
export interface NEXT_C2S_UpdateCombatTargetingRules {
  combatTargetingRules: CombatTargetingRules;
}

/** 更新自动战斗目标模式。 */
export interface NEXT_C2S_UpdateAutoBattleTargetingMode {
  mode: AutoBattleTargetingMode;
}

/** 切换功法技能开关。 */
export interface NEXT_C2S_UpdateTechniqueSkillAvailability {
  techId: string;
  enabled: boolean;
}

/** 调试：回出生点 */
export interface NEXT_C2S_DebugResetSpawn {
  force?: boolean;
}

/** 聊天消息 */
export interface NEXT_C2S_Chat {
  message: string;
}

/** 系统消息已读回执。 */
export interface NEXT_C2S_AckSystemMessages {
  ids: string[];
}

/** 请求坊市首页数据。 */
export interface NEXT_C2S_RequestMarket {}

/** 请求坊市分页列表。 */
export interface NEXT_C2S_RequestMarketListings {
  page: number;
  pageSize?: number;
  category?: ItemType | 'all';
  equipmentSlot?: EquipSlot | 'all';
  techniqueCategory?: TechniqueCategory | 'all';
}

/** 请求邮件摘要。 */
export interface NEXT_C2S_RequestMailSummary {}

/** 请求邮件分页列表。 */
export interface NEXT_C2S_RequestMailPage {
  page: number;
  pageSize?: number;
  filter?: MailFilter;
}

/** 请求邮件详情。 */
export interface NEXT_C2S_RequestMailDetail {
  mailId: string;
}

/** 请求当前任务列表。 */
export interface NEXT_C2S_RequestQuests {}

/** 请求指定 NPC 的可接任务。 */
export interface NEXT_C2S_RequestNpcQuests {
  npcId: string;
}

/** 接受 NPC 任务。 */
export interface NEXT_C2S_AcceptNpcQuest {
  npcId: string;
  questId: string;
}

/** 提交 NPC 任务。 */
export interface NEXT_C2S_SubmitNpcQuest {
  npcId: string;
  questId: string;
}

/** 请求指定实体或地面对象的详情面板。 */
export interface NEXT_C2S_RequestDetail {
  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';
  id: string;
}

/** 标记邮件已读。 */
export interface NEXT_C2S_MarkMailRead {
  mailIds: string[];
}

/** 领取邮件附件。 */
export interface NEXT_C2S_ClaimMailAttachments {
  mailIds: string[];
}

/** 删除邮件。 */
export interface NEXT_C2S_DeleteMail {
  mailIds: string[];
}

/** 请求坊市指定物品的订单簿。 */
export interface NEXT_C2S_RequestMarketItemBook {
  itemKey: string;
}

/** 请求坊市成交历史分页。 */
export interface NEXT_C2S_RequestMarketTradeHistory {
  page: number;
}

/** 请求属性详情面板。 */
export interface NEXT_C2S_RequestAttrDetail {}

/** 请求排行榜数据。 */
export interface NEXT_C2S_RequestLeaderboard {
  limit?: number;
}

/** 请求世界概览统计。 */
export interface NEXT_C2S_RequestWorldSummary {}

/** 创建坊市卖单。 */
export interface NEXT_C2S_CreateMarketSellOrder {
  slotIndex: number;
  quantity: number;
  unitPrice: number;
}

/** 创建坊市买单。 */
export interface NEXT_C2S_CreateMarketBuyOrder {
  itemKey: string;
  quantity: number;
  unitPrice: number;
}

/** 直接购买坊市挂单物品。 */
export interface NEXT_C2S_BuyMarketItem {
  itemKey: string;
  quantity: number;
}

/** 直接向坊市出售背包物品。 */
export interface NEXT_C2S_SellMarketItem {
  slotIndex: number;
  quantity: number;
}

/** 取消坊市订单。 */
export interface NEXT_C2S_CancelMarketOrder {
  orderId: string;
}

/** 领取坊市寄售仓库。 */
export interface NEXT_C2S_ClaimMarketStorage {}

/** 请求触发当前位置传送点。 */
export interface NEXT_C2S_UsePortal {}

/** 请求 NPC 商店面板。 */
export interface NEXT_C2S_RequestNpcShop {
  npcId: string;
}

/** 购买 NPC 商店商品。 */
export interface NEXT_C2S_BuyNpcShopItem {
  npcId: string;
  itemId: string;
  quantity: number;
}

/** 请求炼制面板。 */
export interface NEXT_C2S_RequestAlchemyPanel {
  knownCatalogVersion?: number;
}

/** 保存炼制预设。 */
export interface NEXT_C2S_SaveAlchemyPreset {
  presetId?: string;
  recipeId: string;
  name: string;
  ingredients: AlchemyIngredientSelection[];
}

/** 删除炼制预设。 */
export interface NEXT_C2S_DeleteAlchemyPreset {
  presetId: string;
}

/** 开始炼制。 */
export interface NEXT_C2S_StartAlchemy {
  recipeId: string;
  ingredients: AlchemyIngredientSelection[];
  quantity: number;
}

/** 取消炼制。 */
export interface NEXT_C2S_CancelAlchemy {}

/** 请求强化面板。 */
export interface NEXT_C2S_RequestEnhancementPanel {}

/** 开始装备强化。 */
export interface NEXT_C2S_StartEnhancement {
  target: EnhancementTargetRef;
  protection?: EnhancementTargetRef | null;
  targetLevel?: number;
  protectionStartLevel?: number | null;
}

/** 取消强化。 */
export interface NEXT_C2S_CancelEnhancement {}

/** 天门功能操作。 */
export interface NEXT_C2S_HeavenGateAction {
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
  qi?: number | null;
  maxQi?: number | null;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
  buffs?: VisibleBuffState[] | null;
}

/** 观察详情里的掉落预览条目。 */
export interface ObservationLootPreviewEntry {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance: number;
}

/** 观察详情里的掉落预览列表。 */
export interface ObservationLootPreview {
  entries: ObservationLootPreviewEntry[];
  emptyText?: string;
}

/** 地块详情里可见实体的汇总信息。 */
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
  tile: VisibleTile | null;
}

/** 高频 tick 增量：同步可见实体、地面物品、战斗特效和剩余路径。 */
export interface NEXT_S2C_Tick {
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

/** 地图静态同步：低频重同步地图元数据、小地图与静态标记。 */
export interface NEXT_S2C_MapStaticSync {
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

/** 实体进入视野的单条事件。 */
export interface NEXT_S2C_Enter {
  entity: RenderEntity;
}

/** 实体离开视野的单条事件。 */
export interface NEXT_S2C_Leave {
  entityId: string;
}

/** 连接成功后的首屏初始化数据。 */
export interface NEXT_S2C_Init {
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

/** GM 玩家列表里的单条摘要。 */
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

/** GM 网络流量按业务桶拆分的统计项。 */
export interface GmNetworkBucket {
  key: string;
  label: string;
  bytes: number;
  count: number;
}

/** GM CPU 分段统计项。 */
export interface GmCpuSectionSnapshot {
  key: string;
  label: string;
  totalMs: number;
  percent: number;
  count: number;
  avgMs: number;
}

/** GM CPU / 内存 / 负载快照。 */
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

/** 路径搜索失败原因的统计条目。 */
export interface GmPathfindingFailureBucket {
  reason: string;
  label: string;
  count: number;
}

/** 路径搜索运行统计快照。 */
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

/** tick 调度运行统计快照。 */
export interface GmTickSnapshot {
  lastMapId: string | null;
  lastMs: number;
  windowElapsedSec: number;
  windowTickCount: number;
  windowTotalMs: number;
  windowAvgMs: number;
  windowBusyPercent: number;
}

/** GM 总性能快照。 */
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

/** GM 状态推送。 */
export interface NEXT_S2C_GmState {
  players: GmPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}

/** 错误响应。 */
export interface NEXT_S2C_Error {
  code: string;
  message: string;
}

// ===== 修仙系统 Payload =====

/** 使用背包物品。 */
export interface NEXT_C2S_UseItem {
  slotIndex: number;
  count?: number;
}

/** 丢弃背包物品。 */
export interface NEXT_C2S_DropItem {
  slotIndex: number;
  count: number;
}

/** 彻底摧毁背包物品。 */
export interface NEXT_C2S_DestroyItem {
  slotIndex: number;
  count: number;
}

/** 拿取地面掉落或容器战利品。 */
export interface NEXT_C2S_TakeLoot {
  sourceId: string;
  itemKey?: string;
  takeAll?: boolean;
}

/** 请求整理背包。 */
export interface NEXT_C2S_SortInventory {}

/** 装备背包物品。 */
export interface NEXT_C2S_Equip {
  slotIndex: number;
}

/** 卸下指定装备槽位。 */
export interface NEXT_C2S_Unequip {
  slot: EquipSlot;
}

/** 开始或停止修炼功法。 */
export interface NEXT_C2S_Cultivate {
  techId: string | null; // null 表示停止修炼
}

/** 释放技能。 */
export interface NEXT_C2S_CastSkill {
  skillId: string;
  targetPlayerId?: string | null;
  targetMonsterId?: string | null;
  targetRef?: string | null;
}

/** 兑换码提交请求。 */
export interface NEXT_C2S_RedeemCodes {
  codes: string[];
}

/** 属性面板低频更新。 */
export interface NEXT_S2C_AttrUpdate {
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
  gatherSkill?: PlayerState['gatherSkill'];
  enhancementSkill?: PlayerState['enhancementSkill'];
}

/** 境界低频同步：完整下发当前境界展示、突破与开天门详情。 */
export interface NEXT_S2C_RealmUpdate {
  realm: PlayerRealmState | null;
}

/** 轻量物品实例态：只保留实例字段和少量兜底展示信息。 */
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

/** 背包完整快照。 */
export interface SyncedInventorySnapshot {
  items: SyncedItemStack[];
  capacity: number;
  cooldowns?: SyncedInventoryCooldownState[];
  serverTick?: number;
}

/** 背包物品冷却状态。 */
export interface SyncedInventoryCooldownState {
  itemId: string;
  cooldown: number;
  startedAtTick: number;
}

/** 背包面板局部更新项。 */
export interface InventorySlotUpdateEntry {
  slotIndex: number;
  item: SyncedItemStack | null;
}

/** 背包面板更新。 */
export interface NEXT_S2C_InventoryUpdate {
  inventory?: SyncedInventorySnapshot;
  capacity?: number;
  size?: number;
  slots?: InventorySlotUpdateEntry[];
  cooldowns?: SyncedInventoryCooldownState[];
  serverTick?: number;
}

/** 装备槽位局部更新项。 */
export interface EquipmentSlotUpdateEntry {
  slot: EquipSlot;
  item: SyncedItemStack | null;
}

/** 装备面板更新。 */
export interface NEXT_S2C_EquipmentUpdate {
  slots: EquipmentSlotUpdateEntry[];
}

/** 兑换码结果回包。 */
export interface NEXT_S2C_RedeemCodesResult {
  result: AccountRedeemCodesRes;
}

/** 功法面板局部更新项。 */
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

/** 功法面板更新。 */
export interface NEXT_S2C_TechniqueUpdate {
  techniques: TechniqueUpdateEntry[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板局部更新项。 */
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

/** 行动面板更新。 */
export interface NEXT_S2C_ActionsUpdate {
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

/** 战利品窗口里的单条来源视图。 */
export interface SyncedLootWindowItemView {
  itemKey: string;
  item: SyncedItemStack;
}

/** 战利品窗口来源视图。 */
export interface SyncedLootWindowSourceView {
  sourceId: string;
  kind: LootSourceKind;
  title: string;
  desc?: string;
  grade?: TechniqueGrade;
  searchable: boolean;
  search?: LootSearchProgressView;
  items: SyncedLootWindowItemView[];
  emptyText?: string;
}

/** 战利品窗口完整状态。 */
export interface SyncedLootWindowState {
  tileX: number;
  tileY: number;
  title: string;
  sources: SyncedLootWindowSourceView[];
}

/** 战利品窗口增量更新。 */
export interface NEXT_S2C_LootWindowUpdate {
  window: SyncedLootWindowState | null;
}

/** 坊市首页同步包。 */
export interface NEXT_S2C_MarketUpdate {
  currencyItemId: string;
  currencyItemName: string;
  listedItems: MarketListedItemView[];
  myOrders: MarketOwnOrderView[];
  storage: MarketStorage;
}

/** 坊市分页里某个物品的变体统计。 */
export interface MarketListingVariantEntry {
  itemKey: string;
  item: ItemStack;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
  sellOrderCount: number;
  sellQuantity: number;
  buyOrderCount: number;
  buyQuantity: number;
}

/** 坊市分页里的一条商品摘要。 */
export interface MarketListingPageEntry {
  itemId: string;
  item: ItemStack;
  lowestSellPrice?: number;
  highestBuyPrice?: number;
  canEnhance: boolean;
  variants: MarketListingVariantEntry[];
}

/** 坊市分页列表。 */
export interface NEXT_S2C_MarketListings {
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

/** 玩家自己的坊市订单条目。 */
export interface MarketOwnOrderSyncEntry {
  id: string;
  side: 'buy' | 'sell';
  status: 'open' | 'filled' | 'cancelled';
  itemKey: string;
  item: ItemStack;
  remainingQuantity: number;
  unitPrice: number;
  createdAt: number;
}

/** 玩家自己的坊市订单列表。 */
export interface NEXT_S2C_MarketOrders {
  currencyItemId: string;
  currencyItemName: string;
  orders: MarketOwnOrderSyncEntry[];
}

/** 坊市寄存仓库里的单条物品。 */
export interface MarketStorageSyncEntry {
  itemKey: string;
  item: ItemStack;
  count: number;
}

/** 坊市寄存仓库同步。 */
export interface NEXT_S2C_MarketStorage {
  items: MarketStorageSyncEntry[];
}

/** 单个物品的坊市订单簿。 */
export interface NEXT_S2C_MarketItemBook {
  currencyItemId: string;
  currencyItemName: string;
  itemKey: string;
  book: MarketOrderBookView | null;
}

/** 坊市成交历史分页。 */
export interface NEXT_S2C_MarketTradeHistory {
  page: number;
  pageSize: number;
  totalVisible: number;
  records: MarketTradeHistoryEntryView[];
}

/** NPC 商店里的单条商品视图。 */
export interface SyncedNpcShopItemView {
  itemId: string;
  item: SyncedItemStack;
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** NPC 商店完整视图。 */
export interface SyncedNpcShopView {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: SyncedNpcShopItemView[];
}

/** NPC 商店同步包。 */
export interface NEXT_S2C_NpcShop {
  npcId: string;
  shop: SyncedNpcShopView | null;
  error?: string;
}

/** 炼制面板同步包。 */
export interface NEXT_S2C_AlchemyPanel {
  state: SyncedAlchemyPanelState | null;
  catalogVersion: number;
  catalog?: AlchemyRecipeCatalogEntry[];
  error?: string;
}

/** 强化面板同步包。 */
export interface NEXT_S2C_EnhancementPanel {
  state: SyncedEnhancementPanelState | null;
  error?: string;
}

/** NPC 可接任务列表。 */
export interface NEXT_S2C_NpcQuests {
  npcId: string;
  npcName: string;
  quests: QuestState[];
}

/** 传送点详情包。 */
export interface NEXT_S2C_PortalDetail {
  id: string;
  x: number;
  y: number;
  kind?: string;
  targetMapId: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  trigger?: 'manual' | 'auto';
}

/** 地面掉落详情包。 */
export interface NEXT_S2C_GroundDetail {
  sourceId: string;
  x: number;
  y: number;
  items: ItemStack[];
}

/** 容器详情包。 */
export interface NEXT_S2C_ContainerDetail {
  id: string;
  name: string;
  x: number;
  y: number;
  grade: number;
  desc?: string;
}

/** NPC 详情包。 */
export interface NEXT_S2C_NpcDetail {
  id: string;
  name: string;
  char: string;
  color: string;
  x: number;
  y: number;
  dialogue: string;
  role?: string;
  hasShop?: 1;
  questCount?: number;
  questMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight;
}

/** 怪物详情包。 */
export interface NEXT_S2C_MonsterDetail {
  id: string;
  mid: string;
  name: string;
  char: string;
  color: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  tier: MonsterTier;
  alive: boolean;
  respawnTicks?: number;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

/** 玩家详情包。 */
export interface NEXT_S2C_PlayerDetail {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

/** 地块详情包。 */
export interface NEXT_S2C_TileDetail {
  x: number;
  y: number;
  aura?: number;
  safeZone?: {
    x: number;
    y: number;
    radius: number;
  };
  portal?: NEXT_S2C_PortalDetail;
  ground?: NEXT_S2C_GroundDetail;
  entities?: ObservedTileEntityDetail[];
  error?: string;
}

/** 通用详情包，根据 kind 携带不同目标的详情。 */
export interface NEXT_S2C_Detail {
  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';
  id: string;
  error?: string;
  npc?: NEXT_S2C_NpcDetail;
  monster?: NEXT_S2C_MonsterDetail;
  player?: NEXT_S2C_PlayerDetail;
  portal?: NEXT_S2C_PortalDetail;
  ground?: NEXT_S2C_GroundDetail;
  container?: NEXT_S2C_ContainerDetail;
}

/** 地块运行时详情包，供 GM 或调试面板查看。 */
export interface NEXT_S2C_TileRuntimeDetail {
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

/** 任务列表更新。 */
export interface NEXT_S2C_QuestUpdate {
  quests: QuestState[];
}

/** 属性详情包。 */
export interface NEXT_S2C_AttrDetail {
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs: Attributes;
  numericStats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
  numericStatBreakdowns: NumericStatBreakdownMap;
  alchemySkill?: PlayerState['alchemySkill'];
  gatherSkill?: PlayerState['gatherSkill'];
  enhancementSkill?: PlayerState['enhancementSkill'];
}

/** 排行榜通用玩家条目。 */
export interface LeaderboardPlayerEntry {
  rank: number;
  playerId: string;
  playerName: string;
}

/** 境界排行榜条目。 */
export interface LeaderboardRealmEntry extends LeaderboardPlayerEntry {
  realmLv: number;
  realmName: string;
  realmShortName?: string;
  progress: number;
  foundation: number;
}

/** 击杀怪物排行榜条目。 */
export interface LeaderboardMonsterKillEntry extends LeaderboardPlayerEntry {
  totalKills: number;
  eliteKills: number;
  bossKills: number;
}

/** 灵石榜条目。 */
export interface LeaderboardSpiritStoneEntry extends LeaderboardPlayerEntry {
  spiritStoneCount: number;
}

/** 玩家击杀榜条目。 */
export interface LeaderboardPlayerKillEntry extends LeaderboardPlayerEntry {
  playerKillCount: number;
}

/** 死亡榜条目。 */
export interface LeaderboardDeathEntry extends LeaderboardPlayerEntry {
  deathCount: number;
}

/** 体修榜条目。 */
export interface LeaderboardBodyTrainingEntry extends LeaderboardPlayerEntry {
  level: number;
  exp: number;
  expToNext: number;
}

/** 四项至尊属性榜条目。 */
export interface LeaderboardSupremeAttrEntry {
  attr: 'constitution' | 'spirit' | 'perception' | 'talent';
  label: string;
  playerId: string;
  playerName: string;
  value: number;
}

/** 世界活跃行为统计。 */
export interface LeaderboardWorldActionCounts {
  cultivation: number;
  combat: number;
  alchemy: number;
  enhancement: number;
}

/** 世界境界分布统计。 */
export interface LeaderboardWorldRealmCounts {
  initial: number;
  mortal: number;
  qiRefiningOrAbove: number;
}

/** 世界击杀与死亡统计。 */
export interface LeaderboardWorldKillCounts {
  normalMonsters: number;
  eliteMonsters: number;
  bossMonsters: number;
  playerKills: number;
  playerDeaths: number;
}

/** 世界概览统计摘要。 */
export interface LeaderboardWorldSummary {
  totalSpiritStones: number;
  actionCounts: LeaderboardWorldActionCounts;
  realmCounts: LeaderboardWorldRealmCounts;
  killCounts: LeaderboardWorldKillCounts;
}

/** 排行榜同步包。 */
export interface NEXT_S2C_Leaderboard {
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

/** 世界概览同步包。 */
export interface NEXT_S2C_WorldSummary {
  generatedAt: number;
  summary: LeaderboardWorldSummary;
}

/** 任务自动导航回执。 */
export interface NEXT_S2C_QuestNavigateResult {
  questId: string;
  ok: boolean;
  error?: string;
}

/** 系统消息，支持浮字展示。 */
export interface NEXT_S2C_SystemMsg {
  id?: string;
  text: string;
  kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
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

/** 邮件摘要同步包。 */
export interface NEXT_S2C_MailSummary {
  summary: MailSummaryView;
}

/** 邮件分页同步包。 */
export interface NEXT_S2C_MailPage {
  page: MailPageView;
}

/** 邮件详情同步包。 */
export interface NEXT_S2C_MailDetail {
  detail: MailDetailView | null;
  error?: string;
}

/** 邮件操作结果。 */
export interface NEXT_S2C_MailOpResult {
  operation: 'markRead' | 'claim' | 'delete';
  ok: boolean;
  mailIds: string[];
  message?: string;
}

// ===== 建议系统 Payload =====

/** 建议系统的收发载荷。 */

/** 主动请求最新建议列表 */
export interface NEXT_C2S_RequestSuggestions {}

/** 创建建议 */
export interface NEXT_C2S_CreateSuggestion {
  title: string;
  description: string;
}

/** 建议投票 */
export interface NEXT_C2S_VoteSuggestion {
  suggestionId: string;
  vote: 'up' | 'down';
}

/** 回复建议。 */
export interface NEXT_C2S_ReplySuggestion {
  suggestionId: string;
  content: string;
}

/** 标记某条建议的回复已读。 */
export interface NEXT_C2S_MarkSuggestionRepliesRead {
  suggestionId: string;
}

/** GM 标记建议已完成。 */
export interface NEXT_C2S_GmMarkSuggestionCompleted {
  suggestionId: string;
}

/** GM 删除建议。 */
export interface NEXT_C2S_GmRemoveSuggestion {
  suggestionId: string;
}

/** 建议列表更新。 */
export interface NEXT_S2C_SuggestionUpdate {
  suggestions: Suggestion[];
}

/** next 客户端事件与载荷映射，作为 client/server/shared 的统一类型真源。 */
export interface NEXT_C2S_PayloadMap extends Record<NEXT_C2S_EventName, unknown> {
  [NEXT_C2S.Hello]: NEXT_C2S_Hello;
  [NEXT_C2S.Move]: NEXT_C2S_Move;
  [NEXT_C2S.MoveTo]: NEXT_C2S_MoveTo;
  [NEXT_C2S.NavigateQuest]: NEXT_C2S_NavigateQuest;
  [NEXT_C2S.Heartbeat]: NEXT_C2S_Heartbeat;
  [NEXT_C2S.UseAction]: NEXT_C2S_Action;
  [NEXT_C2S.RequestDetail]: NEXT_C2S_RequestDetail;
  [NEXT_C2S.RequestTileDetail]: NEXT_C2S_InspectTileRuntime;
  [NEXT_C2S.GmGetState]: NEXT_C2S_GmGetState;
  [NEXT_C2S.GmSpawnBots]: NEXT_C2S_GmSpawnBots;
  [NEXT_C2S.GmRemoveBots]: NEXT_C2S_GmRemoveBots;
  [NEXT_C2S.GmUpdatePlayer]: NEXT_C2S_GmUpdatePlayer;
  [NEXT_C2S.GmResetPlayer]: NEXT_C2S_GmResetPlayer;
  [NEXT_C2S.RequestSuggestions]: NEXT_C2S_RequestSuggestions;
  [NEXT_C2S.CreateSuggestion]: NEXT_C2S_CreateSuggestion;
  [NEXT_C2S.VoteSuggestion]: NEXT_C2S_VoteSuggestion;
  [NEXT_C2S.ReplySuggestion]: NEXT_C2S_ReplySuggestion;
  [NEXT_C2S.MarkSuggestionRepliesRead]: NEXT_C2S_MarkSuggestionRepliesRead;
  [NEXT_C2S.GmMarkSuggestionCompleted]: NEXT_C2S_GmMarkSuggestionCompleted;
  [NEXT_C2S.GmRemoveSuggestion]: NEXT_C2S_GmRemoveSuggestion;
  [NEXT_C2S.RequestMailSummary]: NEXT_C2S_RequestMailSummary;
  [NEXT_C2S.RequestMailPage]: NEXT_C2S_RequestMailPage;
  [NEXT_C2S.RequestMailDetail]: NEXT_C2S_RequestMailDetail;
  [NEXT_C2S.RedeemCodes]: NEXT_C2S_RedeemCodes;
  [NEXT_C2S.MarkMailRead]: NEXT_C2S_MarkMailRead;
  [NEXT_C2S.ClaimMailAttachments]: NEXT_C2S_ClaimMailAttachments;
  [NEXT_C2S.DeleteMail]: NEXT_C2S_DeleteMail;
  [NEXT_C2S.RequestQuests]: NEXT_C2S_RequestQuests;
  [NEXT_C2S.RequestNpcQuests]: NEXT_C2S_RequestNpcQuests;
  [NEXT_C2S.AcceptNpcQuest]: NEXT_C2S_AcceptNpcQuest;
  [NEXT_C2S.SubmitNpcQuest]: NEXT_C2S_SubmitNpcQuest;
  [NEXT_C2S.RequestMarket]: NEXT_C2S_RequestMarket;
  [NEXT_C2S.RequestMarketListings]: NEXT_C2S_RequestMarketListings;
  [NEXT_C2S.RequestMarketItemBook]: NEXT_C2S_RequestMarketItemBook;
  [NEXT_C2S.RequestMarketTradeHistory]: NEXT_C2S_RequestMarketTradeHistory;
  [NEXT_C2S.RequestAttrDetail]: NEXT_C2S_RequestAttrDetail;
  [NEXT_C2S.RequestLeaderboard]: NEXT_C2S_RequestLeaderboard;
  [NEXT_C2S.RequestWorldSummary]: NEXT_C2S_RequestWorldSummary;
  [NEXT_C2S.CreateMarketSellOrder]: NEXT_C2S_CreateMarketSellOrder;
  [NEXT_C2S.CreateMarketBuyOrder]: NEXT_C2S_CreateMarketBuyOrder;
  [NEXT_C2S.BuyMarketItem]: NEXT_C2S_BuyMarketItem;
  [NEXT_C2S.SellMarketItem]: NEXT_C2S_SellMarketItem;
  [NEXT_C2S.CancelMarketOrder]: NEXT_C2S_CancelMarketOrder;
  [NEXT_C2S.ClaimMarketStorage]: NEXT_C2S_ClaimMarketStorage;
  [NEXT_C2S.UsePortal]: NEXT_C2S_UsePortal;
  [NEXT_C2S.UseItem]: NEXT_C2S_UseItem;
  [NEXT_C2S.DropItem]: NEXT_C2S_DropItem;
  [NEXT_C2S.DestroyItem]: NEXT_C2S_DestroyItem;
  [NEXT_C2S.TakeGround]: NEXT_C2S_TakeLoot;
  [NEXT_C2S.SortInventory]: NEXT_C2S_SortInventory;
  [NEXT_C2S.Equip]: NEXT_C2S_Equip;
  [NEXT_C2S.Unequip]: NEXT_C2S_Unequip;
  [NEXT_C2S.Cultivate]: NEXT_C2S_Cultivate;
  [NEXT_C2S.CastSkill]: NEXT_C2S_CastSkill;
  [NEXT_C2S.RequestNpcShop]: NEXT_C2S_RequestNpcShop;
  [NEXT_C2S.BuyNpcShopItem]: NEXT_C2S_BuyNpcShopItem;
  [NEXT_C2S.RequestAlchemyPanel]: NEXT_C2S_RequestAlchemyPanel;
  [NEXT_C2S.SaveAlchemyPreset]: NEXT_C2S_SaveAlchemyPreset;
  [NEXT_C2S.DeleteAlchemyPreset]: NEXT_C2S_DeleteAlchemyPreset;
  [NEXT_C2S.StartAlchemy]: NEXT_C2S_StartAlchemy;
  [NEXT_C2S.CancelAlchemy]: NEXT_C2S_CancelAlchemy;
  [NEXT_C2S.RequestEnhancementPanel]: NEXT_C2S_RequestEnhancementPanel;
  [NEXT_C2S.StartEnhancement]: NEXT_C2S_StartEnhancement;
  [NEXT_C2S.CancelEnhancement]: NEXT_C2S_CancelEnhancement;
  [NEXT_C2S.UpdateAutoBattleSkills]: NEXT_C2S_UpdateAutoBattleSkills;
  [NEXT_C2S.UpdateAutoUsePills]: NEXT_C2S_UpdateAutoUsePills;
  [NEXT_C2S.UpdateCombatTargetingRules]: NEXT_C2S_UpdateCombatTargetingRules;
  [NEXT_C2S.UpdateAutoBattleTargetingMode]: NEXT_C2S_UpdateAutoBattleTargetingMode;
  [NEXT_C2S.UpdateTechniqueSkillAvailability]: NEXT_C2S_UpdateTechniqueSkillAvailability;
  [NEXT_C2S.DebugResetSpawn]: NEXT_C2S_DebugResetSpawn;
  [NEXT_C2S.Chat]: NEXT_C2S_Chat;
  [NEXT_C2S.AckSystemMessages]: NEXT_C2S_AckSystemMessages;
  [NEXT_C2S.HeavenGateAction]: NEXT_C2S_HeavenGateAction;
  [NEXT_C2S.Ping]: NEXT_C2S_Ping;
}

/** next 服务端事件与载荷映射，作为 bootstrap/panel/delta 的共享护栏。 */
export interface NEXT_S2C_PayloadMap extends Record<NEXT_S2C_EventName, unknown> {
  [NEXT_S2C.Bootstrap]: NEXT_S2C_Bootstrap;
  [NEXT_S2C.InitSession]: NEXT_S2C_InitSession;
  [NEXT_S2C.MapEnter]: NEXT_S2C_MapEnter;
  [NEXT_S2C.MapStatic]: NEXT_S2C_MapStatic;
  [NEXT_S2C.Realm]: NEXT_S2C_Realm;
  [NEXT_S2C.WorldDelta]: NEXT_S2C_WorldDelta;
  [NEXT_S2C.SelfDelta]: NEXT_S2C_SelfDelta;
  [NEXT_S2C.PanelDelta]: NEXT_S2C_PanelDelta;
  [NEXT_S2C.LootWindowUpdate]: NEXT_S2C_LootWindowUpdate;
  [NEXT_S2C.QuestNavigateResult]: NEXT_S2C_QuestNavigateResult;
  [NEXT_S2C.Notice]: NEXT_S2C_Notice;
  [NEXT_S2C.SuggestionUpdate]: NEXT_S2C_SuggestionUpdate;
  [NEXT_S2C.MailSummary]: NEXT_S2C_MailSummary;
  [NEXT_S2C.MailPage]: NEXT_S2C_MailPage;
  [NEXT_S2C.MailDetail]: NEXT_S2C_MailDetail;
  [NEXT_S2C.RedeemCodesResult]: NEXT_S2C_RedeemCodesResult;
  [NEXT_S2C.MailOpResult]: NEXT_S2C_MailOpResult;
  [NEXT_S2C.Quests]: NEXT_S2C_QuestUpdate;
  [NEXT_S2C.NpcQuests]: NEXT_S2C_NpcQuests;
  [NEXT_S2C.MarketUpdate]: NEXT_S2C_MarketUpdate;
  [NEXT_S2C.MarketListings]: NEXT_S2C_MarketListings;
  [NEXT_S2C.MarketOrders]: NEXT_S2C_MarketOrders;
  [NEXT_S2C.MarketStorage]: NEXT_S2C_MarketStorage;
  [NEXT_S2C.MarketItemBook]: NEXT_S2C_MarketItemBook;
  [NEXT_S2C.MarketTradeHistory]: NEXT_S2C_MarketTradeHistory;
  [NEXT_S2C.AttrDetail]: NEXT_S2C_AttrDetail;
  [NEXT_S2C.Leaderboard]: NEXT_S2C_Leaderboard;
  [NEXT_S2C.WorldSummary]: NEXT_S2C_WorldSummary;
  [NEXT_S2C.Detail]: NEXT_S2C_Detail;
  [NEXT_S2C.TileDetail]: NEXT_S2C_TileDetail;
  [NEXT_S2C.NpcShop]: NEXT_S2C_NpcShop;
  [NEXT_S2C.AlchemyPanel]: NEXT_S2C_AlchemyPanel;
  [NEXT_S2C.EnhancementPanel]: NEXT_S2C_EnhancementPanel;
  [NEXT_S2C.GmState]: NEXT_S2C_GmState;
  [NEXT_S2C.Error]: NEXT_S2C_Error;
  [NEXT_S2C.Kick]: undefined;
  [NEXT_S2C.Pong]: NEXT_S2C_Pong;
}

/** 根据 next 客户端事件名读取对应载荷类型。 */
export type NEXT_C2S_EventPayload<TEvent extends NEXT_C2S_EventName> = NEXT_C2S_PayloadMap[TEvent];

/** 根据 next 服务端事件名读取对应载荷类型。 */
export type NEXT_S2C_EventPayload<TEvent extends NEXT_S2C_EventName> = NEXT_S2C_PayloadMap[TEvent];

/** GM 发信请求，支持模板或自定义正文。 */
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

/** GM 建议列表查询条件。 */
export interface GmListSuggestionsQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

/** GM 回复建议请求。 */
export interface GmReplySuggestionReq {
  content: string;
}

/** GM 建议列表响应。 */
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

/** 修改显示名后的回包。 */
export interface AccountUpdateDisplayNameRes {
  displayName: string;
}

/** 修改角色名请求 */
export interface AccountUpdateRoleNameReq {
  roleName: string;
}

/** 修改角色名后的回包。 */
export interface AccountUpdateRoleNameRes {
  roleName: string;
}

/** 通用成功回包。 */
export interface BasicOkRes {
  ok: true;
}

/** GM 登录请求 */
export interface GmLoginReq {
  password: string;
}

/** GM 登录结果。 */
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

/** GM 玩家列表的排序方式。 */
export type GmPlayerSortMode = 'realm-desc' | 'realm-asc' | 'online' | 'map' | 'name';

/** GM 玩家列表查询条件。 */
export interface GmListPlayersQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sort?: GmPlayerSortMode;
}

/** GM 玩家列表分页结果。 */
export interface GmPlayerListPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  keyword: string;
  sort: GmPlayerSortMode;
}

/** GM 玩家统计摘要。 */
export interface GmPlayerSummaryStats {
  totalPlayers: number;
  onlinePlayers: number;
  offlineHangingPlayers: number;
  offlinePlayers: number;
}

/** GM 总状态响应。 */
export interface GmStateRes {
  players: GmManagedPlayerSummary[];
  playerPage: GmPlayerListPage;
  playerStats: GmPlayerSummaryStats;
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}

/** 兑换码组里的单个奖励条目。 */
export interface RedeemCodeGroupRewardItem {
  itemId: string;
  count: number;
}

/** 兑换码组视图。 */
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

/** 兑换码单码视图。 */
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

/** 兑换码组列表响应。 */
export interface GmRedeemCodeGroupListRes {
  groups: RedeemCodeGroupView[];
}

/** 兑换码组详情响应。 */
export interface GmRedeemCodeGroupDetailRes {
  group: RedeemCodeGroupView;
  codes: RedeemCodeCodeView[];
}

/** 创建兑换码组请求。 */
export interface GmCreateRedeemCodeGroupReq {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
  count: number;
}

/** 更新兑换码组请求。 */
export interface GmUpdateRedeemCodeGroupReq {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
}

/** 创建兑换码组响应。 */
export interface GmCreateRedeemCodeGroupRes {
  group: RedeemCodeGroupView;
  codes: string[];
}

/** 为指定兑换码组追加码数量的请求。 */
export interface GmAppendRedeemCodesReq {
  count: number;
}

/** 追加兑换码后的响应。 */
export interface GmAppendRedeemCodesRes {
  group: RedeemCodeGroupView;
  codes: string[];
}

/** 账户侧兑换码兑换请求。 */
export interface AccountRedeemCodesReq {
  codes: string[];
}

/** 单个兑换码的兑换结果。 */
export interface AccountRedeemCodeResult {
  code: string;
  ok: boolean;
  message: string;
  groupName?: string;
  rewards?: RedeemCodeGroupRewardItem[];
}

/** 兑换码批量兑换响应。 */
export interface AccountRedeemCodesRes {
  results: AccountRedeemCodeResult[];
}

/** 数据库备份的来源类型。 */
export type GmDatabaseBackupKind = 'hourly' | 'daily' | 'manual' | 'pre_import';

/** 数据库作业类型。 */
export type GmDatabaseJobType = 'backup' | 'restore';

/** 数据库作业状态。 */
export type GmDatabaseJobStatus = 'running' | 'completed' | 'failed';

/** 单个数据库备份记录。 */
export interface GmDatabaseBackupRecord {
  id: string;
  kind: GmDatabaseBackupKind;
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

/** 数据库备份/恢复作业快照。 */
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

/** 数据库管理状态响应。 */
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

/** 触发数据库备份后的响应。 */
export interface GmTriggerDatabaseBackupRes {
  job: GmDatabaseJobSnapshot;
  compatScope?: 'persistent_documents_only';
  documentsCount?: number;
}

/** 触发数据库恢复的请求。 */
export interface GmRestoreDatabaseReq {
  backupId: string;
}

/** GM 玩家详情响应。 */
export interface GmPlayerDetailRes {
  player: GmManagedPlayerRecord;
}

/** GM 编辑器里的功法候选项。 */
export interface GmEditorTechniqueOption {
  id: string;
  name: string;
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  skills?: SkillDef[];
  layers?: TechniqueLayerDef[];
}

/** GM 编辑器里的物品候选项。 */
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

/** GM 编辑器里的境界候选项。 */
export interface GmEditorRealmOption {
  realmLv: number;
  displayName: string;
  name: string;
  phaseName?: string;
  review?: string;
}

/** GM 编辑器里的 Buff 候选项。 */
export interface GmEditorBuffOption extends TemporaryBuffState {}

/** GM 编辑器目录响应。 */
export interface GmEditorCatalogRes {
  techniques: GmEditorTechniqueOption[];
  items: GmEditorItemOption[];
  realmLevels: GmEditorRealmOption[];
  buffs: GmEditorBuffOption[];
}


/** GM 更新玩家时允许单独提交的字段分组。 */
export type GmPlayerUpdateSection =
  | 'basic'
  | 'position'
  | 'realm'
  | 'buffs'
  | 'techniques'
  | 'items'
  | 'quests';

/** GM 更新玩家请求。 */
export interface GmUpdatePlayerReq {
  snapshot: Partial<PlayerState>;
  section?: GmPlayerUpdateSection;
}

/** GM 设置玩家体修等级请求。 */
export interface GmSetPlayerBodyTrainingLevelReq {
  level: number;
}

/** GM 增加玩家道基请求。 */
export interface GmAddPlayerFoundationReq {
  amount: number;
}

/** GM 增加玩家战斗经验请求。 */
export interface GmAddPlayerCombatExpReq {
  amount: number;
}

/** GM 生成机器人请求。 */
export interface GmSpawnBotsReq {
  anchorPlayerId: string;
  count: number;
}

/** GM 移除机器人的请求。 */
export interface GmRemoveBotsReq {
  playerIds?: string[];
  all?: boolean;
}

/** GM 快捷执行结果。 */
export interface GmShortcutRunRes {
  ok: true;
  totalPlayers: number;
  queuedRuntimePlayers: number;
  updatedOfflinePlayers: number;
  totalInvalidInventoryStacksRemoved?: number;
  totalInvalidMarketStorageStacksRemoved?: number;
  totalInvalidEquipmentRemoved?: number;
  totalCombatExpGranted?: number;
  totalFoundationGranted?: number;
  targetMapId?: string;
  targetX?: number;
  targetY?: number;
}

/** GM 地图传送点记录。 */
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

/** GM 地图灵气记录。 */
export interface GmMapAuraRecord {
  x: number;
  y: number;
  value: number;
}

/** GM 地图气机记录。 */
export interface GmMapResourceRecord {
  x: number;
  y: number;
  resourceKey: string;
  value: number;
}

/** GM 地图安全区记录。 */
export interface GmMapSafeZoneRecord {
  x: number;
  y: number;
  radius: number;
}

/** GM 地图地标记录。 */
export interface GmMapLandmarkRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  desc?: string;
  resourceNodeId?: string;
  container?: GmMapContainerRecord;
}

/** GM 地图掉落物记录。 */
export interface GmMapDropRecord {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance?: number;
}

/** GM 地图容器随机池记录。 */
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

/** GM 地图容器记录。 */
export interface GmMapContainerRecord {
  grade?: TechniqueGrade;
  refreshTicks?: number;
  char?: string;
  color?: string;
  drops?: GmMapDropRecord[];
  lootPools?: GmMapContainerLootPoolRecord[];
}

/** GM 地图任务记录。 */
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

/** GM 地图 NPC 商店商品记录。 */
export interface GmMapNpcShopItemRecord {
  itemId: string;
  price?: number;
  stockLimit?: number;
  refreshSeconds?: number;
  priceFormula?: 'technique_realm_square_grade';
}

/** GM 地图 NPC 记录。 */
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

/** GM 地图怪物刷新点记录。 */
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
  skills?: string[];
  tier?: MonsterTier;
  expMultiplier?: number;
  drops?: GmMapDropRecord[];
}

/** GM 编辑器里的完整地图文档。 */
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
  npcs: GmMapNpcRecord[];
  monsterSpawns: GmMapMonsterSpawnRecord[];
}

/** GM 地图列表摘要。 */
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
}

/** GM 地图列表响应。 */
export interface GmMapListRes {
  maps: GmMapSummary[];
}

/** GM 地图详情响应。 */
export interface GmMapDetailRes {
  map: GmMapDocument;
}

/** GM 更新地图请求。 */
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

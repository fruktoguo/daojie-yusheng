/**
 * 前后端通信协议：事件名定义与所有 Payload 类型。
 * C2S = 客户端→服务端，S2C = 服务端→客户端。
 */
import { Direction, PlayerState, Tile, VisibleTile, RenderEntity, MapMeta, Attributes, Inventory, EquipmentSlots, TechniqueState, ActionDef, AttrBonus, EquipSlot, EntityKind, NpcQuestMarker, ObservationInsight, PlayerRealmState, QuestState, CombatEffect, AutoBattleSkillConfig, ItemType, QuestLine, QuestObjectiveType, GameTimeState, MapTimeConfig, MonsterAggroMode, TechniqueGrade, GroundItemPileView, LootWindowState, VisibleBuffState, ActionType, SkillDef, TechniqueAttrCurves, TechniqueLayerDef, TechniqueRealm, GroundItemEntryView, MapMinimapArchiveEntry, MapMinimapMarker, MapMinimapSnapshot, Suggestion, ItemStack, EquipmentEffectDef, MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, MarketTradeHistoryEntryView, MapRouteDomain, PortalRouteDomain } from './types';
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
  CreateSuggestion: 'c:createSuggestion',
  VoteSuggestion: 'c:voteSuggestion',
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
} as const;

/** 服务端 → 客户端 */
export const S2C = {
  Init: 's:init',
  Tick: 's:tick',
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
  SuggestionUpdate: 's:suggestionUpdate',
  MarketUpdate: 's:marketUpdate',
  MarketItemBook: 's:marketItemBook',
  MarketTradeHistory: 's:marketTradeHistory',
} as const;

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

/** 调试：回出生点 */
export interface C2S_DebugResetSpawn {
  force?: boolean;
}

/** 聊天消息 */
export interface C2S_Chat {
  message: string;
}

export interface C2S_RequestMarket {}

export interface C2S_RequestMarketItemBook {
  itemKey: string;
}

export interface C2S_RequestMarketTradeHistory {
  page: number;
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

/** Tick 增量实体数据（支持 null 表示清除字段） */
export interface TickRenderEntity {
  id: string;
  x: number;
  y: number;
  char?: string;
  color?: string;
  name?: string | null;
  kind?: EntityKind | 'player' | null;
  hp?: number | null;
  maxHp?: number | null;
  qi?: number | null;
  maxQi?: number | null;
  npcQuestMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight | null;
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
  threatArrows?: [string, string][];             // 可见实体 ID 对：owner -> target
  g?: GroundItemPilePatch[];                      // 视野内地面物品 patch
  fx?: CombatEffect[];                            // 当前 tick 触发的战斗特效
  v?: VisibleTile[][];                            // 视野 tiles（null 表示当前不可见）
  dt?: number;                                    // 实际 tick 间隔（毫秒）
  m?: string;                                     // 当前地图 ID（跨图时用于同步客户端状态）
  mapMeta?: MapMeta;                              // 当前地图元数据
  minimap?: MapMinimapSnapshot;                   // 当前地图已解锁时的完整 mini 地图静态标记
  visibleMinimapMarkers?: MapMinimapMarker[];     // 当前视野内可见的静态地图标记
  minimapLibrary?: MapMinimapArchiveEntry[];      // 已解锁地图图鉴（全图）
  path?: [number, number][];                      // 当前剩余路径点
  hp?: number;                                    // 当前玩家 HP
  qi?: number;                                    // 当前玩家灵力
  f?: Direction;                                  // 当前玩家朝向
  time?: GameTimeState;                           // 当前地图时间状态
  auraLevelBaseValue?: number;                    // 灵气等级基准值
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

/** GM 性能快照 */
export interface GmPerformanceSnapshot {
  cpuPercent: number;
  memoryMb: number;
  tickMs: number;
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

/** 属性更新 */
export interface S2C_AttrUpdate {
  baseAttrs?: Attributes;
  bonuses?: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  maxHp?: number;
  qi?: number;
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
  lifespanYears?: number | null;
  realm?: PlayerRealmState | null;
}

/** 背包更新 */
export interface S2C_InventoryUpdate {
  inventory: Inventory;
}

/** 装备更新 */
export interface S2C_EquipmentUpdate {
  equipment: EquipmentSlots;
}

/** 功法增量更新条目 */
export interface TechniqueUpdateEntry {
  techId: string;
  level: number;
  exp: number;
  expToNext: number;
  realm: TechniqueRealm;
  name?: string | null;
  grade?: TechniqueGrade | null;
  skills?: SkillDef[] | null;
  layers?: TechniqueLayerDef[] | null;
  attrCurves?: TechniqueAttrCurves | null;
}

/** 功法更新 */
export interface S2C_TechniqueUpdate {
  techniques: TechniqueUpdateEntry[];
  cultivatingTechId?: string;
}

/** 行动增量更新条目 */
export interface ActionUpdateEntry {
  id: string;
  cooldownLeft: number;
  autoBattleEnabled?: boolean | null;
  autoBattleOrder?: number | null;
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
  autoBattle?: boolean;
  autoRetaliate?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  senseQiActive?: boolean;
}

/** 战利品窗口更新 */
export interface S2C_LootWindowUpdate {
  window: LootWindowState | null;
}

export interface S2C_MarketUpdate {
  currencyItemId: string;
  currencyItemName: string;
  listedItems: MarketListedItemView[];
  myOrders: MarketOwnOrderView[];
  storage: MarketStorage;
}

export interface S2C_MarketItemBook {
  currencyItemId: string;
  currencyItemName: string;
  itemKey: string;
  book: MarketOrderBookView | null;
}

export interface S2C_MarketTradeHistory {
  page: number;
  pageSize: number;
  totalVisible: number;
  records: MarketTradeHistoryEntryView[];
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
    level?: number;
    sourceValue?: number;
  }>;
}

/** 任务列表更新 */
export interface S2C_QuestUpdate {
  quests: QuestState[];
}

/** 任务自动导航回执 */
export interface S2C_QuestNavigateResult {
  questId: string;
  ok: boolean;
  error?: string;
}

/** 系统消息 */
export interface S2C_SystemMsg {
  text: string;
  kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot';
  from?: string;
  floating?: {
    x: number;
    y: number;
    text: string;
    color?: string;
  };
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

// ===== HTTP 接口 =====

/** 注册请求 */
export interface AuthRegisterReq {
  username: string;
  password: string;
  displayName: string;
}

/** 登录请求 */
export interface AuthLoginReq {
  username: string;
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

export interface GmPlayerDetailRes {
  player: GmManagedPlayerRecord;
}

export interface GmEditorTechniqueOption {
  id: string;
  name: string;
  grade?: TechniqueGrade;
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
}

export interface GmEditorRealmOption {
  realmLv: number;
  displayName: string;
  name: string;
  phaseName?: string;
  review?: string;
}

export interface GmEditorCatalogRes {
  techniques: GmEditorTechniqueOption[];
  items: GmEditorItemOption[];
  realmLevels: GmEditorRealmOption[];
}

export type GmPlayerUpdateSection =
  | 'basic'
  | 'position'
  | 'realm'
  | 'techniques'
  | 'items'
  | 'quests';

export interface GmUpdatePlayerReq {
  snapshot: PlayerState;
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

/** GM 地图地标记录 */
export interface GmMapLandmarkRecord {
  id: string;
  name: string;
  x: number;
  y: number;
  desc?: string;
  container?: GmMapContainerRecord;
}

/** GM 地图掉落物记录 */
export interface GmMapDropRecord {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance?: number;
}

/** GM 地图容器记录 */
export interface GmMapContainerRecord {
  grade?: TechniqueGrade;
  refreshTicks?: number;
  drops?: GmMapDropRecord[];
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
  quests?: GmMapQuestRecord[];
}

/** GM 地图怪物刷新点记录 */
export interface GmMapMonsterSpawnRecord {
  id: string;
  templateId?: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  grade?: TechniqueGrade;
  hp: number;
  maxHp?: number;
  attack: number;
  count?: number;
  radius?: number;
  maxAlive?: number;
  aggroRange?: number;
  viewRange?: number;
  aggroMode?: MonsterAggroMode;
  respawnSec?: number;
  respawnTicks?: number;
  level?: number;
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
  landmarks?: GmMapLandmarkRecord[];
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
  dangerLevel?: number;
  recommendedRealm?: string;
  portalCount: number;
  npcCount: number;
  monsterSpawnCount: number;
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

/**
 * HTTP / GM API 合同层：定义账号、GM、数据库、地图编辑和管理面所用的请求/响应类型。
 * 这些结构不参与 NEXT_C2S / NEXT_S2C 事件映射，单独拆出以避免 protocol.ts 混入过多非 socket 合同。
 */
import type {
  Attributes,
  NumericStatPercentages,
} from './attribute-types';
import type {
  MailAttachment,
  MailFilter,
  MailTemplateArg,
  MailSummaryView,
  MailPageView,
  MailDetailView,
} from './mail-types';
import type { QuestLine, QuestObjectiveType } from './quest-types';
import type { Suggestion } from './world-view-types';
import type { TechniqueCategory, TechniqueGrade, TechniqueLayerDef } from './cultivation-types';
import type { ConsumableBuffDef, EquipmentEffectDef, EquipSlot, ItemStack, ItemType } from './item-runtime-types';
import type { PlayerState } from './player-runtime-types';
import type { SkillDef, TemporaryBuffState } from './skill-types';
import type { GameTimeState, MapRouteDomain, MapTimeConfig, MonsterAggroMode, MonsterTier, PortalRouteDomain, VisibleTile } from './world-core-types';
import type { GmPerformanceSnapshot } from './gm-runtime-types';

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
  scope?: 'persistent_documents_only';
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
  scope?: 'persistent_documents_only';
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

/** GM 运行时地图请求查询参数。 */
export interface GmMapRuntimeQuery {
  x?: number;
  y?: number;
  radius?: number;
}

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

/** GM 重置性能统计的响应。 */
export interface GmResetPerfRes {
  ok: true;
  scope: 'network' | 'cpu' | 'pathfinding';
}

/** GM 广播邮件请求。 */
export interface GmBroadcastMailReq {
  title: string;
  content: string;
  templateArgs?: MailTemplateArg[];
  attachments?: MailAttachment[];
  expireAt?: string;
}

/** GM 给单个玩家发邮件请求。 */
export interface GmSendPlayerMailReq extends GmBroadcastMailReq {
  playerId: string;
}

/** GM 发邮件响应。 */
export interface GmSendMailRes {
  ok: true;
  mailIds: string[];
}

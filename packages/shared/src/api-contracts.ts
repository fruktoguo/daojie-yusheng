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
/**
 * accountName：AuthRegisterReq 内部字段。
 */

  accountName: string;  
  /**
 * password：AuthRegisterReq 内部字段。
 */

  password: string;  
  /**
 * displayName：AuthRegisterReq 内部字段。
 */

  displayName: string;  
  /**
 * roleName：AuthRegisterReq 内部字段。
 */

  roleName: string;
}

/** 登录请求 */
export interface AuthLoginReq {
/**
 * loginName：AuthLoginReq 内部字段。
 */

  loginName: string;  
  /**
 * password：AuthLoginReq 内部字段。
 */

  password: string;
}

/** 刷新令牌请求 */
export interface AuthRefreshReq {
/**
 * refreshToken：AuthRefreshReq 内部字段。
 */

  refreshToken: string;
}

/** 令牌响应 */
export interface AuthTokenRes {
/**
 * accessToken：AuthTokenRes 内部字段。
 */

  accessToken: string;  
  /**
 * refreshToken：AuthTokenRes 内部字段。
 */

  refreshToken: string;
}

/** GM 建议列表查询条件。 */
export interface GmListSuggestionsQuery {
/**
 * page：GmListSuggestionsQuery 内部字段。
 */

  page?: number;  
  /**
 * pageSize：GmListSuggestionsQuery 内部字段。
 */

  pageSize?: number;  
  /**
 * keyword：GmListSuggestionsQuery 内部字段。
 */

  keyword?: string;
}

/** GM 回复建议请求。 */
export interface GmReplySuggestionReq {
/**
 * content：GmReplySuggestionReq 内部字段。
 */

  content: string;
}

/** GM 建议列表响应。 */
export interface GmSuggestionListRes {
/**
 * items：GmSuggestionListRes 内部字段。
 */

  items: Suggestion[];  
  /**
 * total：GmSuggestionListRes 内部字段。
 */

  total: number;  
  /**
 * page：GmSuggestionListRes 内部字段。
 */

  page: number;  
  /**
 * pageSize：GmSuggestionListRes 内部字段。
 */

  pageSize: number;  
  /**
 * totalPages：GmSuggestionListRes 内部字段。
 */

  totalPages: number;  
  /**
 * keyword：GmSuggestionListRes 内部字段。
 */

  keyword: string;
}

/** 显示名可用性检查响应 */
export interface DisplayNameAvailabilityRes {
/**
 * available：DisplayNameAvailabilityRes 内部字段。
 */

  available: boolean;  
  /**
 * message：DisplayNameAvailabilityRes 内部字段。
 */

  message?: string;
}

/** 修改密码请求 */
export interface AccountUpdatePasswordReq {
/**
 * currentPassword：AccountUpdatePasswordReq 内部字段。
 */

  currentPassword: string;  
  /**
 * newPassword：AccountUpdatePasswordReq 内部字段。
 */

  newPassword: string;
}

/** 修改显示名请求 */
export interface AccountUpdateDisplayNameReq {
/**
 * displayName：AccountUpdateDisplayNameReq 内部字段。
 */

  displayName: string;
}

/** 修改显示名后的回包。 */
export interface AccountUpdateDisplayNameRes {
/**
 * displayName：AccountUpdateDisplayNameRes 内部字段。
 */

  displayName: string;
}

/** 修改角色名请求 */
export interface AccountUpdateRoleNameReq {
/**
 * roleName：AccountUpdateRoleNameReq 内部字段。
 */

  roleName: string;
}

/** 修改角色名后的回包。 */
export interface AccountUpdateRoleNameRes {
/**
 * roleName：AccountUpdateRoleNameRes 内部字段。
 */

  roleName: string;
}

/** 通用成功回包。 */
export interface BasicOkRes {
/**
 * ok：BasicOkRes 内部字段。
 */

  ok: true;
}

/** GM 登录请求 */
export interface GmLoginReq {
/**
 * password：GmLoginReq 内部字段。
 */

  password: string;
}

/** GM 登录结果。 */
export interface GmLoginRes {
/**
 * accessToken：GmLoginRes 内部字段。
 */

  accessToken: string;  
  /**
 * expiresInSec：GmLoginRes 内部字段。
 */

  expiresInSec: number;
}

/** GM 修改密码请求 */
export interface GmChangePasswordReq {
/**
 * currentPassword：GmChangePasswordReq 内部字段。
 */

  currentPassword: string;  
  /**
 * newPassword：GmChangePasswordReq 内部字段。
 */

  newPassword: string;
}

/** GM 直接修改玩家账号密码请求 */
export interface GmUpdateManagedPlayerPasswordReq {
/**
 * newPassword：GmUpdateManagedPlayerPasswordReq 内部字段。
 */

  newPassword: string;
}

/** GM 直接修改玩家账号请求 */
export interface GmUpdateManagedPlayerAccountReq {
/**
 * username：GmUpdateManagedPlayerAccountReq 内部字段。
 */

  username: string;
}

/** GM 管理的玩家元信息 */
export interface GmManagedPlayerMeta {
/**
 * userId：GmManagedPlayerMeta 内部字段。
 */

  userId?: string;  
  /**
 * isBot：GmManagedPlayerMeta 内部字段。
 */

  isBot: boolean;  
  /**
 * online：GmManagedPlayerMeta 内部字段。
 */

  online: boolean;  
  /**
 * inWorld：GmManagedPlayerMeta 内部字段。
 */

  inWorld: boolean;  
  /**
 * lastHeartbeatAt：GmManagedPlayerMeta 内部字段。
 */

  lastHeartbeatAt?: string;  
  /**
 * offlineSinceAt：GmManagedPlayerMeta 内部字段。
 */

  offlineSinceAt?: string;  
  /**
 * updatedAt：GmManagedPlayerMeta 内部字段。
 */

  updatedAt?: string;  
  /**
 * dirtyFlags：GmManagedPlayerMeta 内部字段。
 */

  dirtyFlags: string[];
}

/** GM 管理的玩家摘要 */
export interface GmManagedPlayerSummary {
/**
 * id：GmManagedPlayerSummary 内部字段。
 */

  id: string;  
  /**
 * name：GmManagedPlayerSummary 内部字段。
 */

  name: string;  
  /**
 * roleName：GmManagedPlayerSummary 内部字段。
 */

  roleName: string;  
  /**
 * displayName：GmManagedPlayerSummary 内部字段。
 */

  displayName: string;  
  /**
 * accountName：GmManagedPlayerSummary 内部字段。
 */

  accountName?: string;  
  /**
 * realmLv：GmManagedPlayerSummary 内部字段。
 */

  realmLv: number;  
  /**
 * realmLabel：GmManagedPlayerSummary 内部字段。
 */

  realmLabel: string;  
  /**
 * mapId：GmManagedPlayerSummary 内部字段。
 */

  mapId: string;  
  /**
 * mapName：GmManagedPlayerSummary 内部字段。
 */

  mapName: string;  
  /**
 * x：GmManagedPlayerSummary 内部字段。
 */

  x: number;  
  /**
 * y：GmManagedPlayerSummary 内部字段。
 */

  y: number;  
  /**
 * hp：GmManagedPlayerSummary 内部字段。
 */

  hp: number;  
  /**
 * maxHp：GmManagedPlayerSummary 内部字段。
 */

  maxHp: number;  
  /**
 * qi：GmManagedPlayerSummary 内部字段。
 */

  qi: number;  
  /**
 * dead：GmManagedPlayerSummary 内部字段。
 */

  dead: boolean;  
  /**
 * autoBattle：GmManagedPlayerSummary 内部字段。
 */

  autoBattle: boolean;  
  /**
 * autoBattleStationary：GmManagedPlayerSummary 内部字段。
 */

  autoBattleStationary?: boolean;  
  /**
 * autoRetaliate：GmManagedPlayerSummary 内部字段。
 */

  autoRetaliate: boolean;  
  /**
 * meta：GmManagedPlayerSummary 内部字段。
 */

  meta: GmManagedPlayerMeta;
}

/** GM 可查看的账号信息 */
export interface GmManagedAccountRecord {
/**
 * userId：GmManagedAccountRecord 内部字段。
 */

  userId: string;  
  /**
 * username：GmManagedAccountRecord 内部字段。
 */

  username: string;  
  /**
 * createdAt：GmManagedAccountRecord 内部字段。
 */

  createdAt: string;  
  /**
 * totalOnlineSeconds：GmManagedAccountRecord 内部字段。
 */

  totalOnlineSeconds: number;
}

/** GM 管理的玩家完整记录（含快照） */
export interface GmManagedPlayerRecord extends GmManagedPlayerSummary {
/**
 * account：GmManagedPlayerRecord 内部字段。
 */

  account?: GmManagedAccountRecord;  
  /**
 * snapshot：GmManagedPlayerRecord 内部字段。
 */

  snapshot: PlayerState;  
  /**
 * persistedSnapshot：GmManagedPlayerRecord 内部字段。
 */

  persistedSnapshot: unknown;
}

/** GM 玩家列表的排序方式。 */
export type GmPlayerSortMode = 'realm-desc' | 'realm-asc' | 'online' | 'map' | 'name';

/** GM 玩家列表查询条件。 */
export interface GmListPlayersQuery {
/**
 * page：GmListPlayersQuery 内部字段。
 */

  page?: number;  
  /**
 * pageSize：GmListPlayersQuery 内部字段。
 */

  pageSize?: number;  
  /**
 * keyword：GmListPlayersQuery 内部字段。
 */

  keyword?: string;  
  /**
 * sort：GmListPlayersQuery 内部字段。
 */

  sort?: GmPlayerSortMode;
}

/** GM 玩家列表分页结果。 */
export interface GmPlayerListPage {
/**
 * page：GmPlayerListPage 内部字段。
 */

  page: number;  
  /**
 * pageSize：GmPlayerListPage 内部字段。
 */

  pageSize: number;  
  /**
 * total：GmPlayerListPage 内部字段。
 */

  total: number;  
  /**
 * totalPages：GmPlayerListPage 内部字段。
 */

  totalPages: number;  
  /**
 * keyword：GmPlayerListPage 内部字段。
 */

  keyword: string;  
  /**
 * sort：GmPlayerListPage 内部字段。
 */

  sort: GmPlayerSortMode;
}

/** GM 玩家统计摘要。 */
export interface GmPlayerSummaryStats {
/**
 * totalPlayers：GmPlayerSummaryStats 内部字段。
 */

  totalPlayers: number;  
  /**
 * onlinePlayers：GmPlayerSummaryStats 内部字段。
 */

  onlinePlayers: number;  
  /**
 * offlineHangingPlayers：GmPlayerSummaryStats 内部字段。
 */

  offlineHangingPlayers: number;  
  /**
 * offlinePlayers：GmPlayerSummaryStats 内部字段。
 */

  offlinePlayers: number;
}

/** GM 总状态响应。 */
export interface GmStateRes {
/**
 * players：GmStateRes 内部字段。
 */

  players: GmManagedPlayerSummary[];  
  /**
 * playerPage：GmStateRes 内部字段。
 */

  playerPage: GmPlayerListPage;  
  /**
 * playerStats：GmStateRes 内部字段。
 */

  playerStats: GmPlayerSummaryStats;  
  /**
 * mapIds：GmStateRes 内部字段。
 */

  mapIds: string[];  
  /**
 * botCount：GmStateRes 内部字段。
 */

  botCount: number;  
  /**
 * perf：GmStateRes 内部字段。
 */

  perf: GmPerformanceSnapshot;
}

/** 兑换码组里的单个奖励条目。 */
export interface RedeemCodeGroupRewardItem {
/**
 * itemId：RedeemCodeGroupRewardItem 内部字段。
 */

  itemId: string;  
  /**
 * count：RedeemCodeGroupRewardItem 内部字段。
 */

  count: number;
}

/** 兑换码组视图。 */
export interface RedeemCodeGroupView {
/**
 * id：RedeemCodeGroupView 内部字段。
 */

  id: string;  
  /**
 * name：RedeemCodeGroupView 内部字段。
 */

  name: string;  
  /**
 * rewards：RedeemCodeGroupView 内部字段。
 */

  rewards: RedeemCodeGroupRewardItem[];  
  /**
 * totalCodeCount：RedeemCodeGroupView 内部字段。
 */

  totalCodeCount: number;  
  /**
 * usedCodeCount：RedeemCodeGroupView 内部字段。
 */

  usedCodeCount: number;  
  /**
 * activeCodeCount：RedeemCodeGroupView 内部字段。
 */

  activeCodeCount: number;  
  /**
 * createdAt：RedeemCodeGroupView 内部字段。
 */

  createdAt: string;  
  /**
 * updatedAt：RedeemCodeGroupView 内部字段。
 */

  updatedAt: string;
}

/** 兑换码单码视图。 */
export interface RedeemCodeCodeView {
/**
 * id：RedeemCodeCodeView 内部字段。
 */

  id: string;  
  /**
 * groupId：RedeemCodeCodeView 内部字段。
 */

  groupId: string;  
  /**
 * code：RedeemCodeCodeView 内部字段。
 */

  code: string;  
  /**
 * status：RedeemCodeCodeView 内部字段。
 */

  status: 'active' | 'used' | 'destroyed';  
  /**
 * usedByPlayerId：RedeemCodeCodeView 内部字段。
 */

  usedByPlayerId: string | null;  
  /**
 * usedByRoleName：RedeemCodeCodeView 内部字段。
 */

  usedByRoleName: string | null;  
  /**
 * usedAt：RedeemCodeCodeView 内部字段。
 */

  usedAt: string | null;  
  /**
 * destroyedAt：RedeemCodeCodeView 内部字段。
 */

  destroyedAt: string | null;  
  /**
 * createdAt：RedeemCodeCodeView 内部字段。
 */

  createdAt: string;  
  /**
 * updatedAt：RedeemCodeCodeView 内部字段。
 */

  updatedAt: string;
}

/** 兑换码组列表响应。 */
export interface GmRedeemCodeGroupListRes {
/**
 * groups：GmRedeemCodeGroupListRes 内部字段。
 */

  groups: RedeemCodeGroupView[];
}

/** 兑换码组详情响应。 */
export interface GmRedeemCodeGroupDetailRes {
/**
 * group：GmRedeemCodeGroupDetailRes 内部字段。
 */

  group: RedeemCodeGroupView;  
  /**
 * codes：GmRedeemCodeGroupDetailRes 内部字段。
 */

  codes: RedeemCodeCodeView[];
}

/** 创建兑换码组请求。 */
export interface GmCreateRedeemCodeGroupReq {
/**
 * name：GmCreateRedeemCodeGroupReq 内部字段。
 */

  name: string;  
  /**
 * rewards：GmCreateRedeemCodeGroupReq 内部字段。
 */

  rewards: RedeemCodeGroupRewardItem[];  
  /**
 * count：GmCreateRedeemCodeGroupReq 内部字段。
 */

  count: number;
}

/** 更新兑换码组请求。 */
export interface GmUpdateRedeemCodeGroupReq {
/**
 * name：GmUpdateRedeemCodeGroupReq 内部字段。
 */

  name: string;  
  /**
 * rewards：GmUpdateRedeemCodeGroupReq 内部字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
}

/** 创建兑换码组响应。 */
export interface GmCreateRedeemCodeGroupRes {
/**
 * group：GmCreateRedeemCodeGroupRes 内部字段。
 */

  group: RedeemCodeGroupView;  
  /**
 * codes：GmCreateRedeemCodeGroupRes 内部字段。
 */

  codes: string[];
}

/** 为指定兑换码组追加码数量的请求。 */
export interface GmAppendRedeemCodesReq {
/**
 * count：GmAppendRedeemCodesReq 内部字段。
 */

  count: number;
}

/** 追加兑换码后的响应。 */
export interface GmAppendRedeemCodesRes {
/**
 * group：GmAppendRedeemCodesRes 内部字段。
 */

  group: RedeemCodeGroupView;  
  /**
 * codes：GmAppendRedeemCodesRes 内部字段。
 */

  codes: string[];
}

/** 账户侧兑换码兑换请求。 */
export interface AccountRedeemCodesReq {
/**
 * codes：AccountRedeemCodesReq 内部字段。
 */

  codes: string[];
}

/** 单个兑换码的兑换结果。 */
export interface AccountRedeemCodeResult {
/**
 * code：AccountRedeemCodeResult 内部字段。
 */

  code: string;  
  /**
 * ok：AccountRedeemCodeResult 内部字段。
 */

  ok: boolean;  
  /**
 * message：AccountRedeemCodeResult 内部字段。
 */

  message: string;  
  /**
 * groupName：AccountRedeemCodeResult 内部字段。
 */

  groupName?: string;  
  /**
 * rewards：AccountRedeemCodeResult 内部字段。
 */

  rewards?: RedeemCodeGroupRewardItem[];
}

/** 兑换码批量兑换响应。 */
export interface AccountRedeemCodesRes {
/**
 * results：AccountRedeemCodesRes 内部字段。
 */

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
/**
 * id：GmDatabaseBackupRecord 内部字段。
 */

  id: string;  
  /**
 * kind：GmDatabaseBackupRecord 内部字段。
 */

  kind: GmDatabaseBackupKind;  
  /**
 * fileName：GmDatabaseBackupRecord 内部字段。
 */

  fileName: string;  
  /**
 * createdAt：GmDatabaseBackupRecord 内部字段。
 */

  createdAt: string;  
  /**
 * sizeBytes：GmDatabaseBackupRecord 内部字段。
 */

  sizeBytes: number;
}

/** 数据库备份/恢复作业快照。 */
export interface GmDatabaseJobSnapshot {
/**
 * id：GmDatabaseJobSnapshot 内部字段。
 */

  id: string;  
  /**
 * type：GmDatabaseJobSnapshot 内部字段。
 */

  type: GmDatabaseJobType;  
  /**
 * status：GmDatabaseJobSnapshot 内部字段。
 */

  status: GmDatabaseJobStatus;  
  /**
 * startedAt：GmDatabaseJobSnapshot 内部字段。
 */

  startedAt: string;  
  /**
 * finishedAt：GmDatabaseJobSnapshot 内部字段。
 */

  finishedAt?: string;  
  /**
 * kind：GmDatabaseJobSnapshot 内部字段。
 */

  kind?: GmDatabaseBackupKind;  
  /**
 * backupId：GmDatabaseJobSnapshot 内部字段。
 */

  backupId?: string;  
  /**
 * sourceBackupId：GmDatabaseJobSnapshot 内部字段。
 */

  sourceBackupId?: string;  
  /**
 * error：GmDatabaseJobSnapshot 内部字段。
 */

  error?: string;
}

/** 数据库管理状态响应。 */
export interface GmDatabaseStateRes {
/**
 * backups：GmDatabaseStateRes 内部字段。
 */

  backups: GmDatabaseBackupRecord[];  
  /**
 * runningJob：GmDatabaseStateRes 内部字段。
 */

  runningJob?: GmDatabaseJobSnapshot;  
  /**
 * lastJob：GmDatabaseStateRes 内部字段。
 */

  lastJob?: GmDatabaseJobSnapshot;  
  /**
 * persistenceEnabled：GmDatabaseStateRes 内部字段。
 */

  persistenceEnabled?: boolean;  
  /**
 * scope：GmDatabaseStateRes 内部字段。
 */

  scope?: 'persistent_documents_only';  
  /**
 * restoreMode：GmDatabaseStateRes 内部字段。
 */

  restoreMode?: 'replace_persistent_documents';  
  /**
 * note：GmDatabaseStateRes 内部字段。
 */

  note?: string;  
  /**
 * automation：GmDatabaseStateRes 内部字段。
 */

  automation?: {  
  /**
 * retentionEnforced：GmDatabaseStateRes 内部字段。
 */

    retentionEnforced: boolean;    
    /**
 * schedulesActive：GmDatabaseStateRes 内部字段。
 */

    schedulesActive: boolean;    
    /**
 * restoreRequiresMaintenance：GmDatabaseStateRes 内部字段。
 */

    restoreRequiresMaintenance: boolean;    
    /**
 * preImportBackupEnabled：GmDatabaseStateRes 内部字段。
 */

    preImportBackupEnabled: boolean;
  };  
  /**
 * retention：GmDatabaseStateRes 内部字段。
 */

  retention: {  
  /**
 * hourly：GmDatabaseStateRes 内部字段。
 */

    hourly: number;    
    /**
 * daily：GmDatabaseStateRes 内部字段。
 */

    daily: number;
  };  
  /**
 * schedules：GmDatabaseStateRes 内部字段。
 */

  schedules: {  
  /**
 * hourly：GmDatabaseStateRes 内部字段。
 */

    hourly: string;    
    /**
 * daily：GmDatabaseStateRes 内部字段。
 */

    daily: string;
  };
}

/** 触发数据库备份后的响应。 */
export interface GmTriggerDatabaseBackupRes {
/**
 * job：GmTriggerDatabaseBackupRes 内部字段。
 */

  job: GmDatabaseJobSnapshot;  
  /**
 * scope：GmTriggerDatabaseBackupRes 内部字段。
 */

  scope?: 'persistent_documents_only';  
  /**
 * documentsCount：GmTriggerDatabaseBackupRes 内部字段。
 */

  documentsCount?: number;
}

/** 触发数据库恢复的请求。 */
export interface GmRestoreDatabaseReq {
/**
 * backupId：GmRestoreDatabaseReq 内部字段。
 */

  backupId: string;
}

/** GM 玩家详情响应。 */
export interface GmPlayerDetailRes {
/**
 * player：GmPlayerDetailRes 内部字段。
 */

  player: GmManagedPlayerRecord;
}

/** GM 编辑器里的功法候选项。 */
export interface GmEditorTechniqueOption {
/**
 * id：GmEditorTechniqueOption 内部字段。
 */

  id: string;  
  /**
 * name：GmEditorTechniqueOption 内部字段。
 */

  name: string;  
  /**
 * grade：GmEditorTechniqueOption 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * category：GmEditorTechniqueOption 内部字段。
 */

  category?: TechniqueCategory;  
  /**
 * realmLv：GmEditorTechniqueOption 内部字段。
 */

  realmLv?: number;  
  /**
 * skills：GmEditorTechniqueOption 内部字段。
 */

  skills?: SkillDef[];  
  /**
 * layers：GmEditorTechniqueOption 内部字段。
 */

  layers?: TechniqueLayerDef[];
}

/** GM 编辑器里的物品候选项。 */
export interface GmEditorItemOption {
/**
 * itemId：GmEditorItemOption 内部字段。
 */

  itemId: string;  
  /**
 * name：GmEditorItemOption 内部字段。
 */

  name: string;  
  /**
 * type：GmEditorItemOption 内部字段。
 */

  type: ItemType;  
  /**
 * groundLabel：GmEditorItemOption 内部字段。
 */

  groundLabel?: string;  
  /**
 * grade：GmEditorItemOption 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * level：GmEditorItemOption 内部字段。
 */

  level?: number;  
  /**
 * equipSlot：GmEditorItemOption 内部字段。
 */

  equipSlot?: EquipSlot;  
  /**
 * desc：GmEditorItemOption 内部字段。
 */

  desc?: string;  
  /**
 * equipAttrs：GmEditorItemOption 内部字段。
 */

  equipAttrs?: ItemStack['equipAttrs'];  
  /**
 * equipStats：GmEditorItemOption 内部字段。
 */

  equipStats?: ItemStack['equipStats'];  
  /**
 * equipValueStats：GmEditorItemOption 内部字段。
 */

  equipValueStats?: ItemStack['equipValueStats'];  
  /**
 * tags：GmEditorItemOption 内部字段。
 */

  tags?: string[];  
  /**
 * effects：GmEditorItemOption 内部字段。
 */

  effects?: EquipmentEffectDef[];  
  /**
 * healAmount：GmEditorItemOption 内部字段。
 */

  healAmount?: number;  
  /**
 * healPercent：GmEditorItemOption 内部字段。
 */

  healPercent?: number;  
  /**
 * qiPercent：GmEditorItemOption 内部字段。
 */

  qiPercent?: number;  
  /**
 * cooldown：GmEditorItemOption 内部字段。
 */

  cooldown?: number;  
  /**
 * consumeBuffs：GmEditorItemOption 内部字段。
 */

  consumeBuffs?: ConsumableBuffDef[];  
  /**
 * enhanceLevel：GmEditorItemOption 内部字段。
 */

  enhanceLevel?: number;  
  /**
 * alchemySuccessRate：GmEditorItemOption 内部字段。
 */

  alchemySuccessRate?: number;  
  /**
 * alchemySpeedRate：GmEditorItemOption 内部字段。
 */

  alchemySpeedRate?: number;  
  /**
 * mapUnlockId：GmEditorItemOption 内部字段。
 */

  mapUnlockId?: string;  
  /**
 * mapUnlockIds：GmEditorItemOption 内部字段。
 */

  mapUnlockIds?: string[];  
  /**
 * tileAuraGainAmount：GmEditorItemOption 内部字段。
 */

  tileAuraGainAmount?: number;  
  /**
 * allowBatchUse：GmEditorItemOption 内部字段。
 */

  allowBatchUse?: boolean;
}

/** GM 编辑器里的境界候选项。 */
export interface GmEditorRealmOption {
/**
 * realmLv：GmEditorRealmOption 内部字段。
 */

  realmLv: number;  
  /**
 * displayName：GmEditorRealmOption 内部字段。
 */

  displayName: string;  
  /**
 * name：GmEditorRealmOption 内部字段。
 */

  name: string;  
  /**
 * phaseName：GmEditorRealmOption 内部字段。
 */

  phaseName?: string;  
  /**
 * review：GmEditorRealmOption 内部字段。
 */

  review?: string;
}

/** GM 编辑器里的 Buff 候选项。 */
export interface GmEditorBuffOption extends TemporaryBuffState {}

/** GM 编辑器目录响应。 */
export interface GmEditorCatalogRes {
/**
 * techniques：GmEditorCatalogRes 内部字段。
 */

  techniques: GmEditorTechniqueOption[];  
  /**
 * items：GmEditorCatalogRes 内部字段。
 */

  items: GmEditorItemOption[];  
  /**
 * realmLevels：GmEditorCatalogRes 内部字段。
 */

  realmLevels: GmEditorRealmOption[];  
  /**
 * buffs：GmEditorCatalogRes 内部字段。
 */

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
/**
 * snapshot：GmUpdatePlayerReq 内部字段。
 */

  snapshot: Partial<PlayerState>;  
  /**
 * section：GmUpdatePlayerReq 内部字段。
 */

  section?: GmPlayerUpdateSection;
}

/** GM 设置玩家体修等级请求。 */
export interface GmSetPlayerBodyTrainingLevelReq {
/**
 * level：GmSetPlayerBodyTrainingLevelReq 内部字段。
 */

  level: number;
}

/** GM 增加玩家道基请求。 */
export interface GmAddPlayerFoundationReq {
/**
 * amount：GmAddPlayerFoundationReq 内部字段。
 */

  amount: number;
}

/** GM 增加玩家战斗经验请求。 */
export interface GmAddPlayerCombatExpReq {
/**
 * amount：GmAddPlayerCombatExpReq 内部字段。
 */

  amount: number;
}

/** GM 生成机器人请求。 */
export interface GmSpawnBotsReq {
/**
 * anchorPlayerId：GmSpawnBotsReq 内部字段。
 */

  anchorPlayerId: string;  
  /**
 * count：GmSpawnBotsReq 内部字段。
 */

  count: number;
}

/** GM 移除机器人的请求。 */
export interface GmRemoveBotsReq {
/**
 * playerIds：GmRemoveBotsReq 内部字段。
 */

  playerIds?: string[];  
  /**
 * all：GmRemoveBotsReq 内部字段。
 */

  all?: boolean;
}

/** GM 快捷执行结果。 */
export interface GmShortcutRunRes {
/**
 * ok：GmShortcutRunRes 内部字段。
 */

  ok: true;  
  /**
 * totalPlayers：GmShortcutRunRes 内部字段。
 */

  totalPlayers: number;  
  /**
 * queuedRuntimePlayers：GmShortcutRunRes 内部字段。
 */

  queuedRuntimePlayers: number;  
  /**
 * updatedOfflinePlayers：GmShortcutRunRes 内部字段。
 */

  updatedOfflinePlayers: number;  
  /**
 * totalInvalidInventoryStacksRemoved：GmShortcutRunRes 内部字段。
 */

  totalInvalidInventoryStacksRemoved?: number;  
  /**
 * totalInvalidMarketStorageStacksRemoved：GmShortcutRunRes 内部字段。
 */

  totalInvalidMarketStorageStacksRemoved?: number;  
  /**
 * totalInvalidEquipmentRemoved：GmShortcutRunRes 内部字段。
 */

  totalInvalidEquipmentRemoved?: number;  
  /**
 * totalCombatExpGranted：GmShortcutRunRes 内部字段。
 */

  totalCombatExpGranted?: number;  
  /**
 * totalFoundationGranted：GmShortcutRunRes 内部字段。
 */

  totalFoundationGranted?: number;  
  /**
 * targetMapId：GmShortcutRunRes 内部字段。
 */

  targetMapId?: string;  
  /**
 * targetX：GmShortcutRunRes 内部字段。
 */

  targetX?: number;  
  /**
 * targetY：GmShortcutRunRes 内部字段。
 */

  targetY?: number;
}

/** GM 地图传送点记录。 */
export interface GmMapPortalRecord {
/**
 * x：GmMapPortalRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapPortalRecord 内部字段。
 */

  y: number;  
  /**
 * targetMapId：GmMapPortalRecord 内部字段。
 */

  targetMapId: string;  
  /**
 * targetX：GmMapPortalRecord 内部字段。
 */

  targetX: number;  
  /**
 * targetY：GmMapPortalRecord 内部字段。
 */

  targetY: number;  
  /**
 * kind：GmMapPortalRecord 内部字段。
 */

  kind?: 'portal' | 'stairs';  
  /**
 * trigger：GmMapPortalRecord 内部字段。
 */

  trigger?: 'manual' | 'auto';  
  /**
 * routeDomain：GmMapPortalRecord 内部字段。
 */

  routeDomain?: PortalRouteDomain;  
  /**
 * allowPlayerOverlap：GmMapPortalRecord 内部字段。
 */

  allowPlayerOverlap?: boolean;  
  /**
 * hidden：GmMapPortalRecord 内部字段。
 */

  hidden?: boolean;  
  /**
 * observeTitle：GmMapPortalRecord 内部字段。
 */

  observeTitle?: string;  
  /**
 * observeDesc：GmMapPortalRecord 内部字段。
 */

  observeDesc?: string;
}

/** GM 地图灵气记录。 */
export interface GmMapAuraRecord {
/**
 * x：GmMapAuraRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapAuraRecord 内部字段。
 */

  y: number;  
  /**
 * value：GmMapAuraRecord 内部字段。
 */

  value: number;
}

/** GM 地图气机记录。 */
export interface GmMapResourceRecord {
/**
 * x：GmMapResourceRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapResourceRecord 内部字段。
 */

  y: number;  
  /**
 * resourceKey：GmMapResourceRecord 内部字段。
 */

  resourceKey: string;  
  /**
 * value：GmMapResourceRecord 内部字段。
 */

  value: number;
}

/** GM 地图安全区记录。 */
export interface GmMapSafeZoneRecord {
/**
 * x：GmMapSafeZoneRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapSafeZoneRecord 内部字段。
 */

  y: number;  
  /**
 * radius：GmMapSafeZoneRecord 内部字段。
 */

  radius: number;
}

/** GM 地图地标记录。 */
export interface GmMapLandmarkRecord {
/**
 * id：GmMapLandmarkRecord 内部字段。
 */

  id: string;  
  /**
 * name：GmMapLandmarkRecord 内部字段。
 */

  name: string;  
  /**
 * x：GmMapLandmarkRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapLandmarkRecord 内部字段。
 */

  y: number;  
  /**
 * desc：GmMapLandmarkRecord 内部字段。
 */

  desc?: string;  
  /**
 * resourceNodeId：GmMapLandmarkRecord 内部字段。
 */

  resourceNodeId?: string;  
  /**
 * container：GmMapLandmarkRecord 内部字段。
 */

  container?: GmMapContainerRecord;
}

/** GM 地图掉落物记录。 */
export interface GmMapDropRecord {
/**
 * itemId：GmMapDropRecord 内部字段。
 */

  itemId: string;  
  /**
 * name：GmMapDropRecord 内部字段。
 */

  name: string;  
  /**
 * type：GmMapDropRecord 内部字段。
 */

  type: ItemType;  
  /**
 * count：GmMapDropRecord 内部字段。
 */

  count: number;  
  /**
 * chance：GmMapDropRecord 内部字段。
 */

  chance?: number;
}

/** GM 地图容器随机池记录。 */
export interface GmMapContainerLootPoolRecord {
/**
 * rolls：GmMapContainerLootPoolRecord 内部字段。
 */

  rolls?: number;  
  /**
 * chance：GmMapContainerLootPoolRecord 内部字段。
 */

  chance?: number;  
  /**
 * minLevel：GmMapContainerLootPoolRecord 内部字段。
 */

  minLevel?: number;  
  /**
 * maxLevel：GmMapContainerLootPoolRecord 内部字段。
 */

  maxLevel?: number;  
  /**
 * minGrade：GmMapContainerLootPoolRecord 内部字段。
 */

  minGrade?: TechniqueGrade;  
  /**
 * maxGrade：GmMapContainerLootPoolRecord 内部字段。
 */

  maxGrade?: TechniqueGrade;  
  /**
 * tagGroups：GmMapContainerLootPoolRecord 内部字段。
 */

  tagGroups?: string[][];  
  /**
 * countMin：GmMapContainerLootPoolRecord 内部字段。
 */

  countMin?: number;  
  /**
 * countMax：GmMapContainerLootPoolRecord 内部字段。
 */

  countMax?: number;  
  /**
 * allowDuplicates：GmMapContainerLootPoolRecord 内部字段。
 */

  allowDuplicates?: boolean;
}

/** GM 地图容器记录。 */
export interface GmMapContainerRecord {
/**
 * grade：GmMapContainerRecord 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * refreshTicks：GmMapContainerRecord 内部字段。
 */

  refreshTicks?: number;  
  /**
 * char：GmMapContainerRecord 内部字段。
 */

  char?: string;  
  /**
 * color：GmMapContainerRecord 内部字段。
 */

  color?: string;  
  /**
 * drops：GmMapContainerRecord 内部字段。
 */

  drops?: GmMapDropRecord[];  
  /**
 * lootPools：GmMapContainerRecord 内部字段。
 */

  lootPools?: GmMapContainerLootPoolRecord[];
}

/** GM 地图任务记录。 */
export interface GmMapQuestRecord {
/**
 * id：GmMapQuestRecord 内部字段。
 */

  id: string;  
  /**
 * title：GmMapQuestRecord 内部字段。
 */

  title: string;  
  /**
 * desc：GmMapQuestRecord 内部字段。
 */

  desc: string;  
  /**
 * line：GmMapQuestRecord 内部字段。
 */

  line?: QuestLine;  
  /**
 * chapter：GmMapQuestRecord 内部字段。
 */

  chapter?: string;  
  /**
 * story：GmMapQuestRecord 内部字段。
 */

  story?: string;  
  /**
 * objectiveType：GmMapQuestRecord 内部字段。
 */

  objectiveType?: QuestObjectiveType;  
  /**
 * objectiveText：GmMapQuestRecord 内部字段。
 */

  objectiveText?: string;  
  /**
 * targetName：GmMapQuestRecord 内部字段。
 */

  targetName?: string;  
  /**
 * targetMapId：GmMapQuestRecord 内部字段。
 */

  targetMapId?: string;  
  /**
 * targetX：GmMapQuestRecord 内部字段。
 */

  targetX?: number;  
  /**
 * targetY：GmMapQuestRecord 内部字段。
 */

  targetY?: number;  
  /**
 * targetNpcId：GmMapQuestRecord 内部字段。
 */

  targetNpcId?: string;  
  /**
 * targetNpcName：GmMapQuestRecord 内部字段。
 */

  targetNpcName?: string;  
  /**
 * targetMonsterId：GmMapQuestRecord 内部字段。
 */

  targetMonsterId?: string;  
  /**
 * targetTechniqueId：GmMapQuestRecord 内部字段。
 */

  targetTechniqueId?: string;  
  /**
 * targetRealmStage：GmMapQuestRecord 内部字段。
 */

  targetRealmStage?: string | number;  
  /**
 * required：GmMapQuestRecord 内部字段。
 */

  required?: number;  
  /**
 * targetCount：GmMapQuestRecord 内部字段。
 */

  targetCount?: number;  
  /**
 * rewardItemId：GmMapQuestRecord 内部字段。
 */

  rewardItemId?: string;  
  /**
 * rewardText：GmMapQuestRecord 内部字段。
 */

  rewardText?: string;  
  /**
 * reward：GmMapQuestRecord 内部字段。
 */

  reward?: GmMapDropRecord[];  
  /**
 * nextQuestId：GmMapQuestRecord 内部字段。
 */

  nextQuestId?: string;  
  /**
 * requiredItemId：GmMapQuestRecord 内部字段。
 */

  requiredItemId?: string;  
  /**
 * requiredItemCount：GmMapQuestRecord 内部字段。
 */

  requiredItemCount?: number;  
  /**
 * submitNpcId：GmMapQuestRecord 内部字段。
 */

  submitNpcId?: string;  
  /**
 * submitNpcName：GmMapQuestRecord 内部字段。
 */

  submitNpcName?: string;  
  /**
 * submitMapId：GmMapQuestRecord 内部字段。
 */

  submitMapId?: string;  
  /**
 * submitX：GmMapQuestRecord 内部字段。
 */

  submitX?: number;  
  /**
 * submitY：GmMapQuestRecord 内部字段。
 */

  submitY?: number;  
  /**
 * relayMessage：GmMapQuestRecord 内部字段。
 */

  relayMessage?: string;  
  /**
 * unlockBreakthroughRequirementIds：GmMapQuestRecord 内部字段。
 */

  unlockBreakthroughRequirementIds?: string[];
}

/** GM 地图 NPC 商店商品记录。 */
export interface GmMapNpcShopItemRecord {
/**
 * itemId：GmMapNpcShopItemRecord 内部字段。
 */

  itemId: string;  
  /**
 * price：GmMapNpcShopItemRecord 内部字段。
 */

  price?: number;  
  /**
 * stockLimit：GmMapNpcShopItemRecord 内部字段。
 */

  stockLimit?: number;  
  /**
 * refreshSeconds：GmMapNpcShopItemRecord 内部字段。
 */

  refreshSeconds?: number;  
  /**
 * priceFormula：GmMapNpcShopItemRecord 内部字段。
 */

  priceFormula?: 'technique_realm_square_grade';
}

/** GM 地图 NPC 记录。 */
export interface GmMapNpcRecord {
/**
 * id：GmMapNpcRecord 内部字段。
 */

  id: string;  
  /**
 * name：GmMapNpcRecord 内部字段。
 */

  name: string;  
  /**
 * x：GmMapNpcRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapNpcRecord 内部字段。
 */

  y: number;  
  /**
 * char：GmMapNpcRecord 内部字段。
 */

  char: string;  
  /**
 * color：GmMapNpcRecord 内部字段。
 */

  color: string;  
  /**
 * dialogue：GmMapNpcRecord 内部字段。
 */

  dialogue: string;  
  /**
 * role：GmMapNpcRecord 内部字段。
 */

  role?: string;  
  /**
 * shopItems：GmMapNpcRecord 内部字段。
 */

  shopItems?: GmMapNpcShopItemRecord[];  
  /**
 * quests：GmMapNpcRecord 内部字段。
 */

  quests?: GmMapQuestRecord[];
}

/** GM 地图怪物刷新点记录。 */
export interface GmMapMonsterSpawnRecord {
/**
 * id：GmMapMonsterSpawnRecord 内部字段。
 */

  id: string;  
  /**
 * templateId：GmMapMonsterSpawnRecord 内部字段。
 */

  templateId?: string;  
  /**
 * name：GmMapMonsterSpawnRecord 内部字段。
 */

  name?: string;  
  /**
 * x：GmMapMonsterSpawnRecord 内部字段。
 */

  x: number;  
  /**
 * y：GmMapMonsterSpawnRecord 内部字段。
 */

  y: number;  
  /**
 * char：GmMapMonsterSpawnRecord 内部字段。
 */

  char?: string;  
  /**
 * color：GmMapMonsterSpawnRecord 内部字段。
 */

  color?: string;  
  /**
 * grade：GmMapMonsterSpawnRecord 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * hp：GmMapMonsterSpawnRecord 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：GmMapMonsterSpawnRecord 内部字段。
 */

  maxHp?: number;  
  /**
 * attack：GmMapMonsterSpawnRecord 内部字段。
 */

  attack?: number;  
  /**
 * count：GmMapMonsterSpawnRecord 内部字段。
 */

  count?: number;  
  /**
 * radius：GmMapMonsterSpawnRecord 内部字段。
 */

  radius?: number;  
  /**
 * maxAlive：GmMapMonsterSpawnRecord 内部字段。
 */

  maxAlive?: number;  
  /**
 * wanderRadius：GmMapMonsterSpawnRecord 内部字段。
 */

  wanderRadius?: number;  
  /**
 * aggroRange：GmMapMonsterSpawnRecord 内部字段。
 */

  aggroRange?: number;  
  /**
 * viewRange：GmMapMonsterSpawnRecord 内部字段。
 */

  viewRange?: number;  
  /**
 * aggroMode：GmMapMonsterSpawnRecord 内部字段。
 */

  aggroMode?: MonsterAggroMode;  
  /**
 * respawnSec：GmMapMonsterSpawnRecord 内部字段。
 */

  respawnSec?: number;  
  /**
 * respawnTicks：GmMapMonsterSpawnRecord 内部字段。
 */

  respawnTicks?: number;  
  /**
 * level：GmMapMonsterSpawnRecord 内部字段。
 */

  level?: number;  
  /**
 * attrs：GmMapMonsterSpawnRecord 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * statPercents：GmMapMonsterSpawnRecord 内部字段。
 */

  statPercents?: NumericStatPercentages;  
  /**
 * skills：GmMapMonsterSpawnRecord 内部字段。
 */

  skills?: string[];  
  /**
 * tier：GmMapMonsterSpawnRecord 内部字段。
 */

  tier?: MonsterTier;  
  /**
 * expMultiplier：GmMapMonsterSpawnRecord 内部字段。
 */

  expMultiplier?: number;  
  /**
 * drops：GmMapMonsterSpawnRecord 内部字段。
 */

  drops?: GmMapDropRecord[];
}

/** GM 编辑器里的完整地图文档。 */
export interface GmMapDocument {
/**
 * id：GmMapDocument 内部字段。
 */

  id: string;  
  /**
 * name：GmMapDocument 内部字段。
 */

  name: string;  
  /**
 * width：GmMapDocument 内部字段。
 */

  width: number;  
  /**
 * height：GmMapDocument 内部字段。
 */

  height: number;  
  /**
 * routeDomain：GmMapDocument 内部字段。
 */

  routeDomain?: MapRouteDomain;  
  /**
 * terrainProfileId：GmMapDocument 内部字段。
 */

  terrainProfileId?: string;  
  /**
 * terrainRealmLv：GmMapDocument 内部字段。
 */

  terrainRealmLv?: number;  
  /**
 * parentMapId：GmMapDocument 内部字段。
 */

  parentMapId?: string;  
  /**
 * parentOriginX：GmMapDocument 内部字段。
 */

  parentOriginX?: number;  
  /**
 * parentOriginY：GmMapDocument 内部字段。
 */

  parentOriginY?: number;  
  /**
 * floorLevel：GmMapDocument 内部字段。
 */

  floorLevel?: number;  
  /**
 * floorName：GmMapDocument 内部字段。
 */

  floorName?: string;  
  /**
 * spaceVisionMode：GmMapDocument 内部字段。
 */

  spaceVisionMode?: 'isolated' | 'parent_overlay';  
  /**
 * description：GmMapDocument 内部字段。
 */

  description?: string;  
  /**
 * dangerLevel：GmMapDocument 内部字段。
 */

  dangerLevel?: number;  
  /**
 * recommendedRealm：GmMapDocument 内部字段。
 */

  recommendedRealm?: string;  
  /**
 * tiles：GmMapDocument 内部字段。
 */

  tiles: string[];  
  /**
 * portals：GmMapDocument 内部字段。
 */

  portals: GmMapPortalRecord[];  
  /**
 * spawnPoint：GmMapDocument 内部字段。
 */

  spawnPoint: {  
  /**
 * x：GmMapDocument 内部字段。
 */

    x: number;    
    /**
 * y：GmMapDocument 内部字段。
 */

    y: number;
  };  
  /**
 * time：GmMapDocument 内部字段。
 */

  time?: MapTimeConfig;  
  /**
 * auras：GmMapDocument 内部字段。
 */

  auras?: GmMapAuraRecord[];  
  /**
 * resources：GmMapDocument 内部字段。
 */

  resources?: GmMapResourceRecord[];  
  /**
 * safeZones：GmMapDocument 内部字段。
 */

  safeZones?: GmMapSafeZoneRecord[];  
  /**
 * landmarks：GmMapDocument 内部字段。
 */

  landmarks?: GmMapLandmarkRecord[];  
  /**
 * npcs：GmMapDocument 内部字段。
 */

  npcs: GmMapNpcRecord[];  
  /**
 * monsterSpawns：GmMapDocument 内部字段。
 */

  monsterSpawns: GmMapMonsterSpawnRecord[];
}

/** GM 地图列表摘要。 */
export interface GmMapSummary {
/**
 * id：GmMapSummary 内部字段。
 */

  id: string;  
  /**
 * name：GmMapSummary 内部字段。
 */

  name: string;  
  /**
 * width：GmMapSummary 内部字段。
 */

  width: number;  
  /**
 * height：GmMapSummary 内部字段。
 */

  height: number;  
  /**
 * description：GmMapSummary 内部字段。
 */

  description?: string;  
  /**
 * terrainRealmLv：GmMapSummary 内部字段。
 */

  terrainRealmLv?: number;  
  /**
 * dangerLevel：GmMapSummary 内部字段。
 */

  dangerLevel?: number;  
  /**
 * recommendedRealm：GmMapSummary 内部字段。
 */

  recommendedRealm?: string;  
  /**
 * portalCount：GmMapSummary 内部字段。
 */

  portalCount: number;  
  /**
 * npcCount：GmMapSummary 内部字段。
 */

  npcCount: number;  
  /**
 * monsterSpawnCount：GmMapSummary 内部字段。
 */

  monsterSpawnCount: number;
}

/** GM 地图列表响应。 */
export interface GmMapListRes {
/**
 * maps：GmMapListRes 内部字段。
 */

  maps: GmMapSummary[];
}

/** GM 地图详情响应。 */
export interface GmMapDetailRes {
/**
 * map：GmMapDetailRes 内部字段。
 */

  map: GmMapDocument;
}

/** GM 更新地图请求。 */
export interface GmUpdateMapReq {
/**
 * map：GmUpdateMapReq 内部字段。
 */

  map: GmMapDocument;
}

// ===== GM 世界管理 =====

/** GM 运行时地图实体 */
export interface GmRuntimeEntity {
/**
 * id：GmRuntimeEntity 内部字段。
 */

  id: string;  
  /**
 * x：GmRuntimeEntity 内部字段。
 */

  x: number;  
  /**
 * y：GmRuntimeEntity 内部字段。
 */

  y: number;  
  /**
 * char：GmRuntimeEntity 内部字段。
 */

  char: string;  
  /**
 * color：GmRuntimeEntity 内部字段。
 */

  color: string;  
  /**
 * name：GmRuntimeEntity 内部字段。
 */

  name: string;  
  /**
 * kind：GmRuntimeEntity 内部字段。
 */

  kind: 'player' | 'monster' | 'npc' | 'container';  
  /**
 * hp：GmRuntimeEntity 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：GmRuntimeEntity 内部字段。
 */

  maxHp?: number;  
  /**
 * dead：GmRuntimeEntity 内部字段。
 */

  dead?: boolean;  
  /**
 * alive：GmRuntimeEntity 内部字段。
 */

  alive?: boolean;  
  /**
 * targetPlayerId：GmRuntimeEntity 内部字段。
 */

  targetPlayerId?: string;  
  /**
 * respawnLeft：GmRuntimeEntity 内部字段。
 */

  respawnLeft?: number;  
  /**
 * online：GmRuntimeEntity 内部字段。
 */

  online?: boolean;  
  /**
 * autoBattle：GmRuntimeEntity 内部字段。
 */

  autoBattle?: boolean;  
  /**
 * isBot：GmRuntimeEntity 内部字段。
 */

  isBot?: boolean;
}

/** GM 运行时地图快照响应 */
export interface GmMapRuntimeRes {
/**
 * mapId：GmMapRuntimeRes 内部字段。
 */

  mapId: string;  
  /**
 * mapName：GmMapRuntimeRes 内部字段。
 */

  mapName: string;  
  /**
 * width：GmMapRuntimeRes 内部字段。
 */

  width: number;  
  /**
 * height：GmMapRuntimeRes 内部字段。
 */

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
/**
 * speed：GmUpdateMapTickReq 内部字段。
 */

  speed?: number;  
  /**
 * paused：GmUpdateMapTickReq 内部字段。
 */

  paused?: boolean;
}

/** GM 修改地图时间配置请求 */
export interface GmUpdateMapTimeReq {
/**
 * scale：GmUpdateMapTimeReq 内部字段。
 */

  scale?: number;  
  /**
 * offsetTicks：GmUpdateMapTimeReq 内部字段。
 */

  offsetTicks?: number;
}

/** GM 运行时地图请求查询参数。 */
export interface GmMapRuntimeQuery {
/**
 * x：GmMapRuntimeQuery 内部字段。
 */

  x?: number;  
  /**
 * y：GmMapRuntimeQuery 内部字段。
 */

  y?: number;  
  /**
 * radius：GmMapRuntimeQuery 内部字段。
 */

  radius?: number;
}

/** GM 发信请求，支持模板或自定义正文。 */
export interface GmCreateMailReq {
/**
 * templateId：GmCreateMailReq 内部字段。
 */

  templateId?: string;  
  /**
 * args：GmCreateMailReq 内部字段。
 */

  args?: MailTemplateArg[];  
  /**
 * fallbackTitle：GmCreateMailReq 内部字段。
 */

  fallbackTitle?: string;  
  /**
 * fallbackBody：GmCreateMailReq 内部字段。
 */

  fallbackBody?: string;  
  /**
 * attachments：GmCreateMailReq 内部字段。
 */

  attachments?: MailAttachment[];  
  /**
 * senderLabel：GmCreateMailReq 内部字段。
 */

  senderLabel?: string;  
  /**
 * expireAt：GmCreateMailReq 内部字段。
 */

  expireAt?: number | null;
}

/** GM 重置性能统计的响应。 */
export interface GmResetPerfRes {
/**
 * ok：GmResetPerfRes 内部字段。
 */

  ok: true;  
  /**
 * scope：GmResetPerfRes 内部字段。
 */

  scope: 'network' | 'cpu' | 'pathfinding';
}

/** GM 广播邮件请求。 */
export interface GmBroadcastMailReq {
/**
 * title：GmBroadcastMailReq 内部字段。
 */

  title: string;  
  /**
 * content：GmBroadcastMailReq 内部字段。
 */

  content: string;  
  /**
 * templateArgs：GmBroadcastMailReq 内部字段。
 */

  templateArgs?: MailTemplateArg[];  
  /**
 * attachments：GmBroadcastMailReq 内部字段。
 */

  attachments?: MailAttachment[];  
  /**
 * expireAt：GmBroadcastMailReq 内部字段。
 */

  expireAt?: string;
}

/** GM 给单个玩家发邮件请求。 */
export interface GmSendPlayerMailReq extends GmBroadcastMailReq {
/**
 * playerId：GmSendPlayerMailReq 内部字段。
 */

  playerId: string;
}

/** GM 发邮件响应。 */
export interface GmSendMailRes {
/**
 * ok：GmSendMailRes 内部字段。
 */

  ok: true;  
  /**
 * mailIds：GmSendMailRes 内部字段。
 */

  mailIds: string[];
}

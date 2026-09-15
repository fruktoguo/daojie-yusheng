/**
 * GM 玩家管理领域契约。
 *
 * 包含 GM 登录/改密、高危操作 scope 常量、托管玩家元信息/摘要/完整记录、
 * 玩家风险报告、玩家列表查询与分页、玩家统计摘要以及 GM 总状态响应。
 */

import type { PlayerState } from '../player-runtime-types';
import type { GmPerformanceSnapshot } from '../gm-runtime-types';
/** GM 高危操作 scope（与服务端 GM_HIGH_RISK_CONFIRMATION_CONTRACT 对齐）。 */
export const GM_HIGH_RISK_SCOPES = Object.freeze({
  disasterRecovery: 'gm:disaster_recovery',
  secret: 'gm:secret',
  environment: 'gm:environment',
  runtimeOperation: 'gm:runtime_operation',
});

/** GM 高危操作二次确认短语（须与请求体 confirmationPhrase 精确匹配）。 */
export const GM_HIGH_RISK_CONFIRMATION_PHRASES = Object.freeze({
  databaseRestore: 'RESTORE SERVER PERSISTENCE',
  databaseCleanup: 'CLEAN DATABASE TABLE',
  secretRead: 'READ GM SECRET',
  secretWrite: 'WRITE GM SECRET',
  secretDelete: 'DELETE GM SECRET',
  environmentSet: 'SET RUNTIME ENV',
  environmentDelete: 'DELETE RUNTIME ENV',
  environmentReload: 'RELOAD RUNTIME ENV',
  serverRestart: 'RESTART SERVER',
});

/** 管理端默认申请的全部高危 scope 列表。 */
export const GM_ALL_HIGH_RISK_SCOPES = Object.freeze(
  Object.values(GM_HIGH_RISK_SCOPES),
);

/** GM 登录请求 */
export interface GmLoginReq {
/**
 * password：password相关字段。
 */

  password: string;
  /**
   * scopes：登录时申请的高危 scope 列表。
   * 未传时服务端仅签发 SERVER_GM_TOKEN_SCOPES/GM_TOKEN_SCOPES 默认值（可为空）。
   */
  scopes?: string[];
  /** scope：scopes 的单值别名。 */
  scope?: string | string[];
  /** role：GM 角色标识（可选）。 */
  role?: string;
}

/** GM 登录结果。 */
export interface GmLoginRes {
/**
 * accessToken：accessToken标识。
 */

  accessToken: string;
  /**
 * expiresInSec：expireInSec相关字段。
 */

  expiresInSec: number;
}

/** GM 修改密码请求 */
export interface GmChangePasswordReq {
/**
 * currentPassword：currentPassword相关字段。
 */

  currentPassword: string;
  /**
 * newPassword：newPassword相关字段。
 */

  newPassword: string;
}

/** GM 直接修改玩家账号密码请求 */
export interface GmUpdateManagedPlayerPasswordReq {
/**
 * newPassword：newPassword相关字段。
 */

  newPassword: string;
}

/** GM 直接修改玩家账号请求 */
export interface GmUpdateManagedPlayerAccountReq {
/**
 * username：username名称或显示文本。
 */

  username: string;
}

/** GM 管理的玩家元信息 */
export interface GmManagedPlayerMeta {
/**
 * userId：userID标识。
 */

  userId?: string;
  /**
 * isBot：启用开关或状态标识。
 */

  isBot: boolean;
  /**
 * online：online相关字段。
 */

  online: boolean;
  /**
 * inWorld：in世界相关字段。
 */

  inWorld: boolean;
  /**
 * lastHeartbeatAt：lastHeartbeatAt相关字段。
 */

  lastHeartbeatAt?: string;
  /**
 * offlineSinceAt：offlineSinceAt相关字段。
 */

  offlineSinceAt?: string;
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt?: string;
  /**
 * dirtyFlags：dirtyFlag相关字段。
 */

  dirtyFlags: string[];
}

/** GM 可查看的账号风险状态。 */
export type GmManagedPlayerAccountStatus = 'normal' | 'banned' | 'abnormal';

/** GM 可查看的账号状态。 */
export type GmManagedAccountStatus = 'active' | 'banned';

/** GM 直接封禁玩家账号请求。 */
export interface GmBanManagedPlayerReq {
  reason?: string;
}

/** GM 玩家风险等级。 */
export type GmPlayerRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** GM 玩家风险维度。 */
export type GmPlayerRiskFactorKey =
  | 'account-integrity'
  | 'account-name-pattern'
  | 'similar-account-cluster'
  | 'account-age'
  | 'shared-ip-cluster'
  | 'shared-device-cluster'
  | 'market-transfer';

/** GM 玩家风险因子。 */
export interface GmPlayerRiskFactor {
  key: GmPlayerRiskFactorKey;
  label: string;
  score: number;
  maxScore: number;
  summary: string;
  evidence: string[];
}

/** GM 玩家风险报告。 */
export interface GmPlayerRiskReport {
  score: number;
  maxScore: number;
  level: GmPlayerRiskLevel;
  overview: string;
  generatedAt: string;
  factors: GmPlayerRiskFactor[];
  recommendations: string[];
}

/** GM 管理的玩家摘要 */
export interface GmManagedPlayerSummary {
/**
 * id：ID标识。
 */

  id: string;
  /** 玩家可见数字编号，按注册顺序分配。 */
  playerNo?: number | null;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
  /**
 * accountName：account名称名称或显示文本。
 */

  accountName?: string;
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv: number;
  /**
 * realmLabel：realmLabel名称或显示文本。
 */

  realmLabel: string;
  /**
 * mapId：地图ID标识。
 */

  mapId: string;
  /**
 * mapName：地图名称名称或显示文本。
 */

  mapName: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * hp：hp相关字段。
 */

  hp: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp: number;
  /**
 * qi：qi相关字段。
 */

  qi: number;
  /**
 * dead：dead相关字段。
 */

  dead: boolean;
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle: boolean;
  /**
 * autoBattleStationary：autoBattleStationary相关字段。
 */

  autoBattleStationary?: boolean;
  /**
 * autoRetaliate：autoRetaliate相关字段。
 */

  autoRetaliate: boolean;
  /** 账号状态，供 GM 低频列表和详情筛选。 */
  accountStatus: GmManagedPlayerAccountStatus;
  /** 当前风险总分。 */
  riskScore: number;
  /** 当前风险等级。 */
  riskLevel: GmPlayerRiskLevel;
  /** 命中的风险标签。 */
  riskTags: string[];
  /** 是否在 GM 风险白名单。当前主线默认 false，预留给运维真源接入。 */
  isRiskAdmin: boolean;
  /**
 * meta：meta相关字段。
 */

  meta: GmManagedPlayerMeta;
}

/** GM 可查看的账号信息 */
export interface GmManagedAccountRecord {
/**
 * userId：userID标识。
 */

  userId: string;
  /** 玩家可见数字编号，按注册顺序分配。 */
  playerNo?: number | null;
  /**
 * username：username名称或显示文本。
 */

  username: string;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * totalOnlineSeconds：totalOnlineSecond相关字段。
 */

  totalOnlineSeconds: number;
  /** 是否在 GM 风险白名单。当前主线默认 false。 */
  isRiskAdmin: boolean;
  /** 账号状态。 */
  status: GmManagedAccountStatus;
  bannedAt?: string;
  banReason?: string;
  bannedBy?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  lastLoginDeviceId?: string;
}

/** GM 管理的玩家完整记录（含快照） */
export interface GmPlayerDatabaseTableView {
/**
 * table：table相关字段。
 */

  table: string;
  /**
 * rowCount：数量或计量字段。
 */

  rowCount: number;
  /**
 * payload：payload相关字段。
 */

  payload: unknown;
}

/** GM 管理的玩家完整记录（含快照） */
export interface GmManagedPlayerRecord extends GmManagedPlayerSummary {
/**
 * account：数量或计量字段。
 */

  account?: GmManagedAccountRecord;
  /** 详情页按需展示的风险报告。 */
  riskReport: GmPlayerRiskReport;
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: PlayerState;
 /**
 * persistedSnapshot：persisted快照状态或数据块。
 */

  persistedSnapshot: unknown;
  /**
 * databaseTables：数据库按表视图。
 */

  databaseTables: GmPlayerDatabaseTableView[];
  /** 功德月卡池状态，来自活动持久化真源。 */
  monthCard?: GmManagedPlayerMonthCardView | null;
}

/** GM 玩家详情里的功德月卡池视图。 */
export interface GmManagedPlayerMonthCardView {
  totalPoolMerit: number;
  remainingPoolMerit: number;
  startAt: number | null;
  expireAt: number | null;
  lastClaimDate: string | null;
  eternalEnabled: boolean;
  dailySignInFixedMeritBonus: number;
}

/** GM 玩家列表的排序方式。 */
export type GmPlayerSortMode = 'realm-desc' | 'realm-asc' | 'online' | 'map' | 'name' | 'risk-desc' | 'risk-asc';

/** GM 玩家账号状态筛选。 */
export type GmPlayerAccountStatusFilter = 'all' | GmManagedPlayerAccountStatus;

/** GM 玩家列表查询条件。 */
export interface GmListPlayersQuery {
/**
 * page：page相关字段。
 */

  page?: number;
  /**
 * pageSize：数量或计量字段。
 */

  pageSize?: number;
  /**
 * keyword：keyword相关字段。
 */

  keyword?: string;
  /**
 * sort：sort相关字段。
 */

  sort?: GmPlayerSortMode;
  /** 账号状态筛选。 */
  accountStatus?: GmPlayerAccountStatusFilter;
  /** 是否包含 GM 内存页的重型运行态容器估算。 */
  includeMemoryEstimate?: boolean | string;
  /** 是否包含玩家列表分页。 */
  includePlayers?: boolean | string;
  /** 是否绕过 GM 玩家列表缓存。 */
  refresh?: boolean | string;
}

/** GM 玩家列表分页结果。 */
export interface GmPlayerListPage {
/**
 * page：page相关字段。
 */

  page: number;
  /**
 * pageSize：数量或计量字段。
 */

  pageSize: number;
  /**
 * total：数量或计量字段。
 */

  total: number;
  /**
 * totalPages：totalPage相关字段。
 */

  totalPages: number;
  /**
 * keyword：keyword相关字段。
 */

  keyword: string;
  /**
 * sort：sort相关字段。
 */

  sort: GmPlayerSortMode;
  /** 当前账号状态筛选。 */
  accountStatus: GmPlayerAccountStatusFilter;
}

/** GM 玩家统计摘要。 */
export interface GmPlayerSummaryStats {
/**
 * totalPlayers：集合字段。
 */

  totalPlayers: number;
  /**
 * onlinePlayers：集合字段。
 */

  onlinePlayers: number;
  /**
 * offlineHangingPlayers：集合字段。
 */

  offlineHangingPlayers: number;
  /**
 * offlinePlayers：集合字段。
 */

  offlinePlayers: number;
}

/** GM 玩家列表查询响应。 */
export interface GmPlayerListRes {
  /** 当前页玩家摘要。 */
  players: GmManagedPlayerSummary[];
  /** 当前分页元信息。 */
  playerPage: GmPlayerListPage;
  /** 当前筛选条件下的统计摘要。 */
  playerStats: GmPlayerSummaryStats;
  /** 当前筛选条件下的机器人数量。 */
  botCount: number;
}

/** GM 总状态响应。 */
export interface GmStateRes {
/**
 * players：集合字段。
 */

  players: GmManagedPlayerSummary[];
  /**
 * playerPage：玩家Page相关字段。
 */

  playerPage: GmPlayerListPage;
  /**
 * playerStats：玩家Stat相关字段。
 */

  playerStats: GmPlayerSummaryStats;
  /**
 * mapIds：地图ID相关字段。
 */

  mapIds: string[];
  /**
 * botCount：数量或计量字段。
 */

  botCount: number;
  /**
 * perf：perf相关字段。
 */

  perf: GmPerformanceSnapshot;
  /**
 * operations：GM 运维操作状态。
 */

  operations?: {
    /**
 * maintenanceActive：维护中开关是否启用。
 */

    maintenanceActive: boolean;
    /**
 * restartRequested：是否已经发起本轮重启。
 */

    restartRequested: boolean;
  };
}


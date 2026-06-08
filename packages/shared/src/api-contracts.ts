/**
 * 本文件负责前后端共享的类型、常量或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时要保持跨端无副作用和依赖一致，避免引入只适用于浏览器或只适用于服务端的私有状态。
 */
import type {
  AttrKey,
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
import type { QuestLine, QuestObjectiveType, QuestState } from './quest-types';
import type { TechniqueCategory, TechniqueGrade, TechniqueLayerDef, TechniqueLayerGains } from './cultivation-types';
import type { ConsumableBuffDef, EquipmentEffectDef, EquipSlot, ItemStack, ItemType, TileResourceGainDef } from './item-runtime-types';
import type { PlayerState } from './player-runtime-types';
import type { SkillDef, TemporaryBuffState } from './skill-types';
import type { GameTimeState, MapRouteDomain, MapTimeConfig, MonsterAggroMode, MonsterTier, PortalRouteDomain, VisibleTile } from './world-core-types';
import type { GmPerformanceSnapshot } from './gm-runtime-types';
import type { InteractableKind, StructureType, SurfaceType, TerrainType } from './map-layer-types';

export const AUTH_REGISTER_ACTIVATION_REQUIRED_CODE = 'REGISTRATION_ACTIVATION_REQUIRED';

/** 注册请求 */
export interface AuthRegisterReq {
/**
 * accountName：account名称名称或显示文本。
 */

  accountName: string;
  /**
 * password：password相关字段。
 */

  password: string;
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
  /**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
  /** 邀请码，来自注册页可选输入或邀请链接预填。 */
  invitationCode?: string;
  /** 同 IP 已注册时要求输入的激活码。 */
  activationCode?: string;
}

/** 登录请求 */
export interface AuthLoginReq {
/**
 * loginName：login名称名称或显示文本。
 */

  loginName: string;
  /**
 * password：password相关字段。
 */

  password: string;
}

/** 刷新令牌请求 */
export interface AuthRefreshReq {
/**
 * refreshToken：refreshToken标识。
 */

  refreshToken: string;
  /**
 * deviceId：客户端设备标识。
 */
  deviceId?: string;
}

/** 令牌响应 */
export interface AuthTokenRes {
/**
 * accessToken：accessToken标识。
 */

  accessToken: string;
  /**
 * refreshToken：refreshToken标识。
 */

  refreshToken: string;
}

/** GM 坊市交易记录查询条件。 */
export interface GmMarketTradeListQuery {
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数，服务端会限制范围。 */
  pageSize?: number;
  /** 玩家关键字：纯数字识别为 player_no（玩家序号），其它当作 playerId 精确匹配。 */
  playerKeyword?: string;
  /** 物品关键字：服务端按 contentTemplateRepository.getItemName 反查匹配的 itemId 集合。 */
  itemKeyword?: string;
}

/** GM 坊市交易记录条目，按交易完成时间倒序返回。 */
export interface GmMarketTradeItem {
  /** 成交记录 ID。 */
  id: string;
  /** 成交来源：常规坊市挂单 / 拍卖行。 */
  source: 'market' | 'auction';
  /** 买家 playerId。 */
  buyerId: string;
  /** 卖家 playerId。 */
  sellerId: string;
  /** 买家玩家序号（player_no），可能为空（旧账号未回填）。 */
  buyerNo?: number | null;
  /** 卖家玩家序号。 */
  sellerNo?: number | null;
  /** 买家显示名。 */
  buyerName?: string | null;
  /** 卖家显示名。 */
  sellerName?: string | null;
  /** 物品 ID。 */
  itemId: string;
  /** 物品中文名（服务端从模板表解析）。 */
  itemName: string;
  /** 成交数量。 */
  quantity: number;
  /** 成交单价（灵石/件）。 */
  unitPrice: number;
  /** 成交总价 = quantity × unitPrice，由服务端预算好。 */
  totalCost: number;
  /** 成交完成时间（毫秒 epoch）。 */
  createdAt: number;
}

/** GM 坊市交易记录响应。 */
export interface GmMarketTradeListRes {
  items: GmMarketTradeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 解析后的玩家关键字（去除首尾空白；空字符串表示无条件）。 */
  playerKeyword: string;
  /** 解析后的物品关键字。 */
  itemKeyword: string;
}

/** GM AI 生成功法列表查询条件。 */
export interface GmGeneratedTechniqueListQuery {
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数，服务端固定限制到最多 50。 */
  pageSize?: number;
}

/** GM AI 生成功法列表摘要。列表响应不携带大 JSON。 */
export interface GmGeneratedTechniqueSummary {
  id: string;
  generationId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  name: string;
  grade?: string | null;
  category?: string | null;
  realmLv?: number | null;
  status: string;
  isPublished: boolean;
  createdByPlayerId: string;
}

/** GM AI 生成功法分页信息。 */
export interface GmGeneratedTechniqueListPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** GM AI 生成功法列表响应。 */
export interface GmGeneratedTechniqueListRes {
  techniques: GmGeneratedTechniqueSummary[];
  page: GmGeneratedTechniqueListPage;
}

/** GM AI 生成功法详情响应，rawJson 保留数据库记录原貌供管理端查看。 */
export interface GmGeneratedTechniqueDetailRes {
  technique: GmGeneratedTechniqueSummary & {
    schemaVersion: number;
    usageScope: string;
    modelName?: string | null;
    /** 玩家自定义提示词快照，不包含通用 system/user prompt 全量请求。 */
    promptSnapshot?: string | null;
    validationReport?: unknown;
    template: unknown;
    rawJson: unknown;
  };
}

/** GM AI 生成功法任务列表查询条件。 */
export interface GmTechniqueGenerationJobListQuery {
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数，服务端固定限制到最多 50。 */
  pageSize?: number;
}

/** GM AI 生成功法任务摘要。 */
export interface GmTechniqueGenerationJobSummary {
  id: string;
  playerId: string;
  status: string;
  requestedCategory?: string | null;
  rolledGrade?: string | null;
  rolledRealmLv?: number | null;
  draftTechniqueId?: string | null;
  modelName?: string | null;
  attemptCount: number;
  itemConsumed: boolean;
  itemSpend: number;
  consumedAt?: string | null;
  itemRefunded: boolean;
  refundedAt?: string | null;
  draftExpireAt?: string | null;
  finishedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GM AI 生成功法任务列表响应。 */
export interface GmTechniqueGenerationJobListRes {
  jobs: GmTechniqueGenerationJobSummary[];
  page: GmGeneratedTechniqueListPage;
}

/** GM AI 生成功法任务详情响应。 */
export interface GmTechniqueGenerationJobDetailRes {
  job: GmTechniqueGenerationJobSummary & {
    playerContext?: string | null;
    rawJson: unknown;
  };
}

/** 显示名可用性检查响应 */
export interface DisplayNameAvailabilityRes {
/**
 * available：available相关字段。
 */

  available: boolean;
  /**
 * message：message相关字段。
 */

  message?: string;
}

/** 修改密码请求 */
export interface AccountUpdatePasswordReq {
/**
 * currentPassword：currentPassword相关字段。
 */

  currentPassword: string;
  /**
 * newPassword：newPassword相关字段。
 */

  newPassword: string;
}

/** 修改显示名请求 */
export interface AccountUpdateDisplayNameReq {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
}

/** 修改显示名后的回包。 */
export interface AccountUpdateDisplayNameRes {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
}

/** 修改角色名请求 */
export interface AccountUpdateRoleNameReq {
/**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
}

/** 修改角色名后的回包。 */
export interface AccountUpdateRoleNameRes {
/**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
}

/** 通用成功回包。 */
export interface BasicOkRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
}

/** GM 登录请求 */
export interface GmLoginReq {
/**
 * password：password相关字段。
 */

  password: string;
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

/** 兑换码组里的单个奖励条目。 */
export interface RedeemCodeGroupRewardItem {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 兑换码组视图。 */
export interface RedeemCodeGroupView {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
  /**
 * totalCodeCount：数量或计量字段。
 */

  totalCodeCount: number;
  /**
 * usedCodeCount：数量或计量字段。
 */

  usedCodeCount: number;
  /**
 * activeCodeCount：数量或计量字段。
 */

  activeCodeCount: number;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: string;
}

/** 兑换码单码视图。 */
export interface RedeemCodeCodeView {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * groupId：groupID标识。
 */

  groupId: string;
  /**
 * code：code相关字段。
 */

  code: string;
  /**
 * status：statu状态或数据块。
 */

  status: 'active' | 'used' | 'destroyed';
  /**
 * usedByPlayerId：usedBy玩家ID标识。
 */

  usedByPlayerId: string | null;
  /**
 * usedByRoleName：usedByRole名称名称或显示文本。
 */

  usedByRoleName: string | null;
  /**
 * usedAt：usedAt相关字段。
 */

  usedAt: string | null;
  /**
 * destroyedAt：destroyedAt相关字段。
 */

  destroyedAt: string | null;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: string;
}

/** 兑换码组列表响应。 */
export interface GmRedeemCodeGroupListRes {
/**
 * groups：group相关字段。
 */

  groups: RedeemCodeGroupView[];
}

/** 兑换码组详情响应。 */
export interface GmRedeemCodeGroupDetailRes {
/**
 * group：group相关字段。
 */

  group: RedeemCodeGroupView;
  /**
 * codes：code相关字段。
 */

  codes: RedeemCodeCodeView[];
}

/** 创建兑换码组请求。 */
export interface GmCreateRedeemCodeGroupReq {
/**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 更新兑换码组请求。 */
export interface GmUpdateRedeemCodeGroupReq {
/**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
}

/** 创建兑换码组响应。 */
export interface GmCreateRedeemCodeGroupRes {
/**
 * group：group相关字段。
 */

  group: RedeemCodeGroupView;
  /**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 为指定兑换码组追加码数量的请求。 */
export interface GmAppendRedeemCodesReq {
/**
 * count：数量或计量字段。
 */

  count: number;
}

/** 追加兑换码后的响应。 */
export interface GmAppendRedeemCodesRes {
/**
 * group：group相关字段。
 */

  group: RedeemCodeGroupView;
  /**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 账户侧兑换码兑换请求。 */
export interface AccountRedeemCodesReq {
/**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 单个兑换码的兑换结果。 */
export interface AccountRedeemCodeResult {
/**
 * code：code相关字段。
 */

  code: string;
  /**
 * ok：ok相关字段。
 */

  ok: boolean;
  /**
 * message：message相关字段。
 */

  message: string;
  /**
 * groupName：group名称名称或显示文本。
 */

  groupName?: string;
  /**
 * rewards：reward相关字段。
 */

  rewards?: RedeemCodeGroupRewardItem[];
}

/** 兑换码批量兑换响应。 */
export interface AccountRedeemCodesRes {
/**
 * results：结果相关字段。
 */

  results: AccountRedeemCodeResult[];
}

/** GM 服务端控制台日志级别。 */
export type GmServerLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';

/** GM 服务端控制台日志单行记录。 */
export interface GmServerLogEntry {
/**
 * seq：日志递增序号。
 */

  seq: number;
  /**
 * at：日志采集时间。
 */

  at: string;
  /**
 * level：日志级别。
 */

  level: GmServerLogLevel;
  /**
 * line：日志文本。
 */

  line: string;
}

/** GM 服务端控制台日志读取响应。 */
export interface GmServerLogsRes {
/**
 * entries：日志行集合。
 */

  entries: GmServerLogEntry[];
  /**
 * nextBeforeSeq：继续向上翻时使用的游标。
 */

  nextBeforeSeq?: number;
  /**
 * hasMore：是否还有更早日志。
 */

  hasMore: boolean;
  /**
 * limit：本次读取行数上限。
 */

  limit: number;
  /**
 * bufferSize：当前内存缓冲行数。
 */

  bufferSize: number;
}

/** GM worker 监控状态。 */
export type GmWorkerStatus = 'active' | 'pending' | 'idle' | 'warn' | 'error' | 'unknown';

/** GM worker 监控分类。 */
export type GmWorkerKind = 'player_flush' | 'instance_flush' | 'outbox' | 'database_backup' | 'cleanup';

export interface GmWorkerRuntimeRow {
  id: string;
  label: string;
  enabled: boolean;
  running: boolean;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  processedCount: number;
}

export interface GmWorkerTopology {
  currentRole: string;
  recommendedTopology: string;
  apiRoleExpected: boolean;
  workerRoleExpected: boolean;
  localWorkers: GmWorkerRuntimeRow[];
  note?: string;
}

/** GM worker 单项工作状态。 */
export interface GmWorkerRow {
/**
 * id：worker 稳定 ID。
 */

  id: string;
  /**
 * label：GM 展示名称。
 */

  label: string;
  /**
 * kind：worker 分类。
 */

  kind: GmWorkerKind;
  /**
 * status：当前状态。
 */

  status: GmWorkerStatus;
  /**
 * domain：账本或工作域。
 */

  domain?: string;
  /**
 * ownershipEpoch：实例 ownership epoch。
 */

  ownershipEpoch?: number;
  /**
 * pendingCount：待处理数量。
 */

  pendingCount: number;
  /**
 * claimedCount：当前被认领数量。
 */

  claimedCount: number;
  /**
 * delayedCount：延迟重试数量。
 */

  delayedCount: number;
  /**
 * writeCount：统计窗口内完成/写入数量。
 */

  writeCount: number;
  /**
 * writesPerSecond：统计窗口内吞吐。
 */

  writesPerSecond: number;
  backlogGrowthPerSecond?: number;
  /**
 * deadLetterCount：死信数量。
 */

  deadLetterCount?: number;
  /**
 * oldestPendingAt：最早待处理时间。
 */

  oldestPendingAt?: string | null;
  /**
 * latestUpdatedAt：最近更新时间。
 */

  latestUpdatedAt?: string | null;
  /**
 * note：补充说明。
 */

  note?: string;
  enabled?: boolean;
  running?: boolean;
  lastHeartbeatAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  processedCount?: number;
  runtimeRole?: string;
  /** stalePayloadCount：payload 为空的积压记录数（worker 无法处理，需等玩家上线重新 stage）。 */
  stalePayloadCount?: number;
}

/** GM worker 告警项。 */
export interface GmWorkerAlert {
/**
 * workerId：关联 worker ID。
 */

  workerId: string;
  /**
 * level：告警等级。
 */

  level: 'warn' | 'error';
  /**
 * reason：告警原因。
 */

  reason: string;
  /**
 * count：相关数量。
 */

  count?: number;
}

/** GM worker 容量诊断：数据库连接池快照。 */
export interface GmWorkerPoolStats {
/**
 * totalCount：池中连接总数。
 */

  totalCount: number;
  /**
 * idleCount：空闲连接数。
 */

  idleCount: number;
  /**
 * waitingCount：等待连接数。
 */

  waitingCount: number;
}

/** GM worker 容量诊断：PostgreSQL 锁等待摘要。 */
export interface GmWorkerLockWaitSummary {
/**
 * waitingCount：当前锁等待数量。
 */

  waitingCount: number;
  /**
 * checkedAt：采样时间戳。
 */

  checkedAt: number;
  /**
 * error：锁等待采样错误。
 */

  error?: string;
}

/** GM worker 容量诊断：最近 flush 耗时。 */
export interface GmWorkerFlushCapacity {
/**
 * totalMs：最近一轮总耗时。
 */

  totalMs: number;
  /**
 * dbWriteMs：最近一轮 DB 写入耗时。
 */

  dbWriteMs: number;
  /**
 * entityCount：玩家数或实例数。
 */

  entityCount: number;
  /**
 * domainCounts：domain 写入计数。
 */

  domainCounts: Record<string, number>;
  /**
 * coalescedDomainCount：被合并窗口延迟的 domain 数。
 */

  coalescedDomainCount?: number;
}

/** GM worker 容量诊断：失败摘要。 */
export interface GmWorkerFailureCapacity {
/**
 * total：内存窗口内失败总数。
 */

  total: number;
  /**
 * byCategory：按失败分类统计。
 */

  byCategory: Record<string, number>;
  /**
 * byDomain：按 scope/domain 统计。
 */

  byDomain: Record<string, number>;
}

/** GM worker 容量诊断。 */
export interface GmWorkerCapacity {
/**
 * pgPools：按用途拆分的数据库连接池状态。
 */

  pgPools?: {
    runtimeCritical?: GmWorkerPoolStats | null;
    flush?: GmWorkerPoolStats | null;
    outbox?: GmWorkerPoolStats | null;
    gmDiagnostics?: GmWorkerPoolStats | null;
  } | null;
  /**
 * pgLockWait：PostgreSQL 锁等待摘要。
 */

  pgLockWait?: GmWorkerLockWaitSummary | null;
  /**
 * player：最近玩家 flush 容量指标。
 */

  player?: GmWorkerFlushCapacity | null;
  /**
 * map：最近地图 flush 容量指标。
 */

  map?: GmWorkerFlushCapacity | null;
  /**
 * failures：flush 失败窗口摘要。
 */

  failures?: GmWorkerFailureCapacity | null;
}

/** GM worker 监控响应。 */
export interface GmWorkerStateRes {
/**
 * generatedAt：采样生成时间。
 */

  generatedAt: string;
  /**
 * windowSeconds：吞吐统计窗口。
 */

  windowSeconds: number;
  /**
 * rows：worker 状态列表。
 */

  rows: GmWorkerRow[];
  /**
 * alerts：告警列表。
 */

  alerts: GmWorkerAlert[];
  /**
 * sources：本次采样的数据源状态。
 */

  sources: {
    flushLedgerEnabled: boolean;
    outboxEnabled: boolean;
    backupWorkerHeartbeatActive: boolean;
    runtimeRole?: string;
    backgroundWorkerCount?: number;
  };
  /**
 * capacity：flush worker 容量和反压诊断。
 */

  capacity?: GmWorkerCapacity;
  topology?: GmWorkerTopology;
  scheduler?: {
    initialized: boolean;
    stopping: boolean;
    barrier: Record<string, unknown> | null;
    tasks: Array<{
      id: string;
      kind: string;
      scope: string;
      priority: string;
      enabled: boolean;
      running: boolean;
      paused: boolean;
      status: string;
      lastHeartbeatAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastFailure: string | null;
      processedCount: number;
      nextRunAt: string | null;
      backlogCount: number;
      lastDurationMs: number;
      runCount: number;
      failureCount: number;
      nodeId?: string;
      runtimeRole?: string;
      snapshotUpdatedAt?: string;
    }>;
    governor?: {
      availableParallelism: number;
      cpuReserve: number;
      flushPoolWaiting: number;
      lockWaitCount: number;
      backlogCount: number;
      backlogPressureLevel: 'low' | 'medium' | 'high' | 'critical';
    } | null;
  } | null;
  /**
 * note：补充说明。
 */

  note?: string;
}

/** GM 诊断查询请求。 */
export interface GmDiagnosticsQueryReq {
/**
 * command：GM 诊断指令。
 */

  command: string;
  /**
 * limit：结果行数上限。
 */

  limit?: number;
  /**
 * confirm：确认执行写操作（exec 命令需要此标志为 true）。
 */

  confirm?: boolean;
}

/** GM 诊断查询结果集。 */
export interface GmDiagnosticsResultSet {
/**
 * title：结果集标题。
 */

  title: string;
  /**
 * columns：列名集合。
 */

  columns: string[];
  /**
 * rows：结果行集合。
 */

  rows: Array<Record<string, unknown>>;
  /**
 * rowCount：返回行数。
 */

  rowCount: number;
  /**
 * truncated：是否被行数上限截断。
 */

  truncated: boolean;
}

/** GM 诊断查询响应。 */
export interface GmDiagnosticsQueryRes {
/**
 * ok：是否执行成功。
 */

  ok: boolean;
  /**
 * command：规范化后的指令。
 */

  command: string;
  /**
 * executedAt：执行时间。
 */

  executedAt: string;
  /**
 * durationMs：耗时毫秒。
 */

  durationMs: number;
  /**
 * resultSets：结果集集合。
 */

  resultSets: GmDiagnosticsResultSet[];
  /**
 * message：提示或错误信息。
 */

  message?: string;
  /**
 * warnings：安全限制或截断提示。
 */

  warnings?: string[];
}

/** 数据库备份的来源类型。 */
export type GmDatabaseBackupKind = 'hourly' | 'daily' | 'manual' | 'pre_import' | 'uploaded';

/** 数据库作业类型。 */
export type GmDatabaseJobType = 'backup' | 'restore';

/** 数据库作业状态。 */
export type GmDatabaseJobStatus = 'running' | 'completed' | 'failed';

/** 数据库备份文件格式。 */
export type GmDatabaseBackupFormat = 'postgres_custom_dump' | 'legacy_json_snapshot';

/** 数据库备份作用域。 */
export type GmDatabaseBackupScope = 'server_persistence' | 'legacy_persistent_documents';

/** 数据库恢复模式。 */
export type GmDatabaseRestoreMode = 'replace_server_persistence';

/** 数据库备份/恢复作业日志级别。 */
export type GmDatabaseJobLogLevel = 'info' | 'error';

/** 单个数据库备份记录。 */
export interface GmDatabaseBackupRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * kind：kind相关字段。
 */

  kind: GmDatabaseBackupKind;
  /**
 * fileName：file名称名称或显示文本。
 */

  fileName: string;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * sizeBytes：规模Byte相关字段。
 */

  sizeBytes: number;
  /**
 * format：备份文件格式。
 */

  format?: GmDatabaseBackupFormat;
  /**
 * documentsCount：数量或计量字段。
 */

  documentsCount?: number;
  /**
 * checksumSha256：校验摘要相关字段。
 */

  checksumSha256?: string;
  /**
 * tablesCount：结构化表快照数量。
 */

  tablesCount?: number;
  /**
 * tablesChecksumSha256：结构化表校验摘要。
 */

  tablesChecksumSha256?: string;
}

/** 数据库备份/恢复作业日志。 */
export interface GmDatabaseJobLogEntry {
/**
 * at：日志时间。
 */

  at: string;
  /**
 * level：日志级别。
 */

  level: GmDatabaseJobLogLevel;
  /**
 * message：日志内容。
 */

  message: string;
  /**
 * phase：作业阶段。
 */

  phase?: string;
}

/** 数据库备份/恢复作业快照。 */
export interface GmDatabaseJobSnapshot {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * type：type相关字段。
 */

  type: GmDatabaseJobType;
  /**
 * status：statu状态或数据块。
 */

  status: GmDatabaseJobStatus;
  /**
 * startedAt：startedAt相关字段。
 */

  startedAt: string;
  /**
 * finishedAt：finishedAt相关字段。
 */

  finishedAt?: string;
  /**
 * kind：kind相关字段。
 */

  kind?: GmDatabaseBackupKind;
  /**
 * backupId：backupID标识。
 */

  backupId?: string;
  /**
 * sourceBackupId：来源BackupID标识。
 */

  sourceBackupId?: string;
  /**
 * error：error相关字段。
 */

  error?: string;
  /**
 * phase：当前或结束阶段。
 */

  phase?: string;
  /**
 * checkpointBackupId：导入前检查点备份 ID。
 */

  checkpointBackupId?: string;
  /**
 * appliedAt：恢复实际写入完成时间。
 */

  appliedAt?: string;
  /**
 * logs：最近作业日志。
 */

  logs?: GmDatabaseJobLogEntry[];
}

/** 数据库管理状态响应。 */
export interface GmDatabaseStateRes {
/**
 * backups：backup相关字段。
 */

  backups: GmDatabaseBackupRecord[];
  /**
 * runningJob：runningJob相关字段。
 */

  runningJob?: GmDatabaseJobSnapshot;
  /**
 * lastJob：lastJob相关字段。
 */

  lastJob?: GmDatabaseJobSnapshot;
  /**
 * recentJobLogs：最近数据库任务日志。
 */

  recentJobLogs?: GmDatabaseJobLogEntry[];
  /**
 * persistenceEnabled：启用开关或状态标识。
 */

  persistenceEnabled?: boolean;
  /**
 * scope：scope相关字段。
 */

  scope?: GmDatabaseBackupScope;
  /**
 * restoreMode：restoreMode相关字段。
 */

  restoreMode?: GmDatabaseRestoreMode;
  /**
 * note：note相关字段。
 */

  note?: string;
  /**
 * automation：automation相关字段。
 */

  automation?: {
  /**
 * retentionEnforced：retentionEnforced相关字段。
 */

    retentionEnforced: boolean;
    /**
 * schedulesActive：schedule激活状态相关字段。
 */

    schedulesActive: boolean;
    /**
 * restoreRequiresMaintenance：restoreRequireMaintenance相关字段。
 */

    restoreRequiresMaintenance: boolean;
    /**
 * preImportBackupEnabled：启用开关或状态标识。
 */

    preImportBackupEnabled: boolean;
  };
  /**
 * retention：retention相关字段。
 */

  retention: {
  /**
 * hourly：hourly相关字段。
 */

    hourly: number;
    /**
 * daily：daily相关字段。
 */

    daily: number;
  };
  /**
 * schedules：schedule相关字段。
 */

  schedules: {
  /**
 * hourly：hourly相关字段。
 */

    hourly: string;
    /**
 * daily：daily相关字段。
 */

    daily: string;
  };
}

/** 触发数据库备份后的响应。 */
export interface GmTriggerDatabaseBackupRes {
/**
 * job：job相关字段。
 */

  job: GmDatabaseJobSnapshot;
  /**
 * scope：scope相关字段。
 */

  scope?: GmDatabaseBackupScope;
  /**
 * documentsCount：数量或计量字段。
 */

  documentsCount?: number;
}

/** 上传数据库备份后的响应。 */
export interface GmUploadDatabaseBackupRes {
/**
 * backup：已登记的备份记录。
 */

  backup: GmDatabaseBackupRecord;
  /**
 * scope：scope相关字段。
 */

  scope?: GmDatabaseBackupScope;
}

/** 数据库单表占用统计。 */
export interface GmDatabaseTableStat {
  tableName: string;
  rowEstimate: number;
  totalBytes: number;
  totalSize: string;
  tableBytes: number;
  tableSize: string;
  indexBytes: number;
  indexSize: string;
  toastBytes: number;
  toastSize: string;
  cleanupAllowed?: boolean;
  cleanupOlderThanAllowed?: boolean;
  cleanupTimeColumn?: string | null;
  cleanupBlockedReason?: string | null;
}

/** 数据库表占用统计响应。 */
export interface GmDatabaseTableStatsRes {
  tables: GmDatabaseTableStat[];
  totalBytes: number;
  totalSize: string;
  fetchedAt: string;
}

/** 数据库表清理请求。 */
export interface GmDatabaseCleanupReq {
  target: string;
  mode?: 'older_than' | 'all';
  olderThanDays?: number;
}

/** 数据库表清理响应。 */
export interface GmDatabaseCleanupRes {
  target: string;
  mode: 'older_than' | 'all';
  deletedRows: number;
  message: string;
}

/** 触发数据库恢复的请求。 */
export interface GmRestoreDatabaseReq {
/**
 * backupId：backupID标识。
 */

  backupId: string;
}

/** GM 玩家详情响应。 */
export interface GmPlayerDetailRes {
/**
 * player：玩家引用。
 */

  player: GmManagedPlayerRecord;
}

/** GM 编辑器里的功法候选项。 */
export interface GmEditorTechniqueOption {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * desc：描述文本。
 */

  desc?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * category：category相关字段。
 */

  category?: TechniqueCategory;
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv?: number;
  /**
 * attrRatio：量化功法六维分配权重。
 */

  attrRatio?: Partial<Record<AttrKey, number>>;
  /**
 * attrFloat：量化功法总属性浮动。
 */

  attrFloat?: number;
  /**
 * maxLayer：量化功法总层数。
 */

  maxLayer?: number;
  /**
 * expDifficulty：量化功法经验难度。
 */

  expDifficulty?: number;
  /**
 * layerGains：量化功法逐层增量配置。
 */

  layerGains?: TechniqueLayerGains;
  /**
 * skills：技能相关字段。
 */

  skills?: SkillDef[];
  /**
 * layers：层相关字段。
 */

  layers?: TechniqueLayerDef[];
}

/** GM 编辑器里的物品候选项。 */
export interface GmEditorItemOption {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * type：type相关字段。
 */

  type: ItemType;
  /**
 * groundLabel：groundLabel名称或显示文本。
 */

  groundLabel?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * materialCategory：材料主分类。
 */

  materialCategory?: ItemStack['materialCategory'];
  /**
 * materialValues：材料属性值。
 */

  materialValues?: ItemStack['materialValues'];
  /**
 * equipSlot：equipSlot相关字段。
 */

  equipSlot?: EquipSlot;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * equipAttrs：equipAttr相关字段。
 */

  equipAttrs?: ItemStack['equipAttrs'];
  /**
 * equipStats：equipStat相关字段。
 */

  equipStats?: ItemStack['equipStats'];
  /**
 * equipValueStats：equip值Stat相关字段。
 */

  equipValueStats?: ItemStack['equipValueStats'];
  /**
 * equipSpecialStats：装备提供的悟性、幸运等特殊属性。
 */

  equipSpecialStats?: ItemStack['equipSpecialStats'];
  /**
 * tags：tag相关字段。
 */

  tags?: string[];
  /**
 * contextActions：装备后暴露到交互列表的动作。
 */

  contextActions?: ItemStack['contextActions'];
  /**
 * effects：effect相关字段。
 */

  effects?: EquipmentEffectDef[];
  /**
 * healAmount：数量或计量字段。
 */

  healAmount?: number;
  /**
 * healPercent：healPercent相关字段。
 */

  healPercent?: number;
  /**
 * baselineHealPercent：按物品 level 对应标准玩家最大生命的比例恢复。
 */

  baselineHealPercent?: number;
  /**
 * qiPercent：qiPercent相关字段。
 */

  qiPercent?: number;
  /**
 * cooldown：冷却相关字段。
 */

  cooldown?: number;
  /**
 * consumeBuffs：consumeBuff相关字段。
 */

  consumeBuffs?: ConsumableBuffDef[];
  /**
 * enhanceLevel：enhance等级数值。
 */

  enhanceLevel?: number;
  /**
 * alchemySuccessRate：炼丹SuccessRate数值。
 */

  alchemySuccessRate?: number;
  /**
 * alchemySpeedRate：炼丹SpeedRate数值。
 */

  alchemySpeedRate?: number;
  /**
 * enhancementSuccessRate：强化SuccessRate数值。
 */

  enhancementSuccessRate?: number;
  /**
 * enhancementSpeedRate：强化SpeedRate数值。
 */

  enhancementSpeedRate?: number;
  /**
 * miningDamageRate：挖矿对矿脉伤害增幅比率。
 */

  miningDamageRate?: number;
  /**
 * mapUnlockId：地图UnlockID标识。
 */

  mapUnlockId?: string;
  /**
 * mapUnlockIds：地图UnlockID相关字段。
 */

  mapUnlockIds?: string[];
  /**
 * respawnBindMapId：使用后绑定的复活地图 ID。
 */

  respawnBindMapId?: string;
  /**
 * tileAuraGainAmount：数量或计量字段。
 */

  tileAuraGainAmount?: number;
  /**
 * tileResourceGains：集合字段。
 */

  tileResourceGains?: TileResourceGainDef[];
  /**
 * useBehavior：特殊使用行为。
 */

  useBehavior?: ItemStack['useBehavior'];
  /**
   * spiritualRootSeedTier：灵根幼苗品阶。
   */

  spiritualRootSeedTier?: ItemStack['spiritualRootSeedTier'];
  /**
   * allowBatchUse：allowBatchUse相关字段。
   */

  allowBatchUse?: boolean;
}

/** GM 编辑器里的境界候选项。 */
export interface GmEditorRealmOption {
/**
 * realmLv：realmLv相关字段。
 */

  realmLv: number;
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * phaseName：phase名称名称或显示文本。
 */

  phaseName?: string;
  /**
 * review：review相关字段。
 */

  review?: string;
}

/** GM 编辑器里的 Buff 候选项。 */
export interface GmEditorBuffOption extends TemporaryBuffState {}

/** 客户端本地任务模板候选项。 */
export interface GmEditorQuestOption extends QuestState {}

/** GM 编辑器目录响应。 */
export interface GmEditorCatalogRes {
/**
 * techniques：功法相关字段。
 */

  techniques: GmEditorTechniqueOption[];
  /**
 * items：集合字段。
 */

  items: GmEditorItemOption[];
  /**
 * realmLevels：realm等级相关字段。
 */

  realmLevels: GmEditorRealmOption[];
  /**
 * buffs：buff相关字段。
 */

  buffs: GmEditorBuffOption[];
  /**
 * quests：任务静态模板。
 */

  quests?: GmEditorQuestOption[];
}

/** GM 更新玩家时允许单独提交的字段分组。 */
export type GmPlayerUpdateSection =
  | 'basic'
  | 'position'
  | 'realm'
  | 'buffs'
  | 'techniques'
  | 'craftSkills'
  | 'items'
  | 'quests';

/** GM 更新玩家快照。 */
export type GmUpdatePlayerSnapshot = Partial<PlayerState> & {
  /** 在线玩家位置迁移时可选的目标实例 ID。 */
  instanceId?: string;
};

/** GM 更新玩家请求。 */
export interface GmUpdatePlayerReq {
/**
 * snapshot：快照状态或数据块。
 */

  snapshot: GmUpdatePlayerSnapshot;
  /**
 * section：section相关字段。
 */

  section?: GmPlayerUpdateSection;
}

/** GM 设置玩家体修等级请求。 */
export interface GmSetPlayerBodyTrainingLevelReq {
/**
 * level：等级数值。
 */

  level: number;
}

/** GM 增加玩家道基请求。 */
export interface GmAddPlayerFoundationReq {
/**
 * amount：数量或计量字段。
 */

  amount: number;
}

/** GM 增加玩家战斗经验请求。 */
export interface GmAddPlayerCombatExpReq {
/**
 * amount：数量或计量字段。
 */

  amount: number;
}

/** GM 设置玩家功德月卡池请求。 */
export interface GmSetPlayerMonthCardPoolReq {
  totalPoolMerit: number;
  remainingPoolMerit: number;
}

/** GM 生成机器人请求。 */
export interface GmSpawnBotsReq {
/**
 * anchorPlayerId：anchor玩家ID标识。
 */

  anchorPlayerId: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** GM 移除机器人的请求。 */
export interface GmRemoveBotsReq {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * all：all相关字段。
 */

  all?: boolean;
}

/** GM 快捷操作可选玩家范围；为空时由服务端按全员操作处理。 */
export interface GmShortcutScopeReq {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * targetPlayerIds：目标玩家ID相关字段。
 */

  targetPlayerIds?: string[];
}

/** GM 快捷执行结果。 */
export interface GmShortcutRunRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
  /**
 * totalPlayers：集合字段。
 */

  totalPlayers: number;
  /**
 * queuedRuntimePlayers：集合字段。
 */

  queuedRuntimePlayers: number;
  /**
 * updatedOfflinePlayers：集合字段。
 */

  updatedOfflinePlayers: number;
  /**
 * totalInvalidInventoryStacksRemoved：totalInvalid背包StackRemoved相关字段。
 */

  totalInvalidInventoryStacksRemoved?: number;
  /**
 * totalInvalidMarketStorageStacksRemoved：totalInvalid坊市StorageStackRemoved相关字段。
 */

  totalInvalidMarketStorageStacksRemoved?: number;
  /**
 * totalInvalidEquipmentRemoved：totalInvalid装备Removed相关字段。
 */

  totalInvalidEquipmentRemoved?: number;
  /**
 * totalCombatExpGranted：total战斗ExpGranted相关字段。
 */

  totalCombatExpGranted?: number;
  /**
 * totalFoundationGranted：totalFoundationGranted相关字段。
 */

  totalFoundationGranted?: number;
  /**
 * scannedInstances：扫描实例数。
 */

  scannedInstances?: number;
  /**
 * affectedInstances：发生清理的实例数。
 */

  affectedInstances?: number;
  /**
 * removedTemporaryTiles：移除异常临时地块数。
 */

  removedTemporaryTiles?: number;
  /**
 * flushedInstances：已同步刷盘的实例数。
 */

  flushedInstances?: number;
  /**
 * repairedMarketStorageRows：修复坊市托管仓 storage_item_id 行数。
 */

  repairedMarketStorageRows?: number;
  /**
 * repairedMarketStoragePlayers：修复坊市托管仓涉及玩家数。
 */

  repairedMarketStoragePlayers?: number;
  /**
 * marketStorageMismatchedRowsBefore：修复前异常 storage_item_id 行数。
 */

  marketStorageMismatchedRowsBefore?: number;
  /**
 * marketStorageMismatchedRowsAfter：修复后异常 storage_item_id 行数。
 */

  marketStorageMismatchedRowsAfter?: number;
  /**
 * marketStorageInvalidSlotRowsBefore：修复前非法托管仓槽位行数。
 */

  marketStorageInvalidSlotRowsBefore?: number;
  /**
 * marketStorageInvalidSlotRowsAfter：修复后非法托管仓槽位行数。
 */

  marketStorageInvalidSlotRowsAfter?: number;
  /**
 * repairedAt：修复完成时间。
 */

  repairedAt?: string;
  /**
 * refreshedOnlinePlayers：刷新功法模板的在线玩家数。
 */

  refreshedOnlinePlayers?: number;
  /**
 * refreshedTechniques：刷新功法模板的已学功法数。
 */

  refreshedTechniques?: number;
  /**
 * missingTechniqueTemplates：刷新时找不到模板的已学功法数。
 */

  missingTechniqueTemplates?: number;
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId?: string;
  /**
 * targetX：目标X相关字段。
 */

  targetX?: number;
  /**
 * targetY：目标Y相关字段。
 */

  targetY?: number;
}

/** GM 数据兼容转换模式。 */
export type GmCompatConversionMode = 'dry-run' | 'apply';

/** GM 数据兼容转换样本差异摘要。 */
export interface GmCompatConversionSample {
  id: string;
  name: string;
  status: string;
  before: unknown;
  after: unknown;
}

/** GM 数据兼容转换执行结果。 */
export interface GmCompatConversionRunRes {
  ok: true;
  conversionId: string;
  mode: GmCompatConversionMode;
  matchedRows: number;
  convertedRows: number;
  skippedRows: number;
  failedRows: number;
  verifiedRows: number;
  samples: GmCompatConversionSample[];
  errors: string[];
  appliedAt?: string;
}

/** GM 地图传送点记录。 */
export interface GmMapPortalRecord {
/**
 * id：同地图内稳定传送点ID。
 */

  id: string;
  /**
 * targetPortalId：双向传送点的目标端ID。
 */

  targetPortalId?: string;
  /**
 * direction：传送方向。
 */

  direction?: 'two_way' | 'one_way';
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId: string;
  /**
 * targetX：目标X相关字段。
 */

  targetX: number;
  /**
 * targetY：目标Y相关字段。
 */

  targetY: number;
  /**
 * kind：kind相关字段。
 */

  kind?: 'portal' | 'stairs';
  /**
 * trigger：trigger相关字段。
 */

  trigger?: 'manual' | 'auto';
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: PortalRouteDomain;
  /**
 * allowPlayerOverlap：allow玩家Overlap相关字段。
 */

  allowPlayerOverlap?: boolean;
  /**
 * hidden：hidden相关字段。
 */

  hidden?: boolean;
  /**
 * observeTitle：observeTitle名称或显示文本。
 */

  observeTitle?: string;
  /**
 * observeDesc：observeDesc相关字段。
 */

  observeDesc?: string;
}

/** GM 地图灵气记录。 */
export interface GmMapAuraRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * value：值数值。
 */

  value: number;
}

/** GM 地图气机记录。 */
export interface GmMapResourceRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * resourceKey：resourceKey标识。
 */

  resourceKey: string;
  /**
 * value：值数值。
 */

  value: number;
}

/** GM 地图安全区记录。 */
export interface GmMapSafeZoneRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * radius：radiu相关字段。
 */

  radius: number;
}

/** GM 地图地块效果区域记录。 */
export interface GmMapTileEffectRecord {
  /**
 * id：ID标识。
 */

  id?: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * movementCost：覆盖地块移动消耗。
 */

  movementCost?: number;
  /**
 * qiDrainPerTick：每息灵力消耗。
 */

  qiDrainPerTick?: number;
}

/** GM 地图资源节点布点记录。 */
export interface GmMapResourceNodePlacementRecord {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
}

/** GM 地图资源节点分组记录。 */
export interface GmMapResourceNodeGroupRecord {
/**
 * resourceNodeId：资源节点 ID。
 */

  resourceNodeId: string;
  /**
 * idPrefix：生成地标 ID 的前缀。
 */

  idPrefix: string;
  /**
 * name：布点显示名称。
 */

  name: string;
  /**
 * placements：布点坐标列表。
 */

  placements: GmMapResourceNodePlacementRecord[];
}

/** GM 地图地标记录。 */
export interface GmMapLandmarkRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * resourceNodeId：resourceNodeID标识。
 */

  resourceNodeId?: string;
  /**
 * container：container相关字段。
 */

  container?: GmMapContainerRecord;
}

/** GM 地图掉落物记录。 */
export interface GmMapDropRecord {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * type：type相关字段。
 */

  type: ItemType;
  /**
 * count：数量或计量字段。
 */

  count: number;
  /**
 * chance：chance相关字段。
 */

  chance?: number;
}

/** GM 地图容器随机池记录。 */
export interface GmMapContainerLootPoolRecord {
/**
 * rolls：roll相关字段。
 */

  rolls?: number;
  /**
 * chance：chance相关字段。
 */

  chance?: number;
  /**
 * minLevel：min等级数值。
 */

  minLevel?: number;
  /**
 * maxLevel：max等级数值。
 */

  maxLevel?: number;
  /**
 * minGrade：minGrade相关字段。
 */

  minGrade?: TechniqueGrade;
  /**
 * maxGrade：maxGrade相关字段。
 */

  maxGrade?: TechniqueGrade;
  /**
 * tagGroups：tagGroup相关字段。
 */

  tagGroups?: string[][];
  /**
 * countMin：数量Min相关字段。
 */

  countMin?: number;
  /**
 * countMax：数量Max相关字段。
 */

  countMax?: number;
  /**
 * allowDuplicates：allowDuplicate相关字段。
 */

  allowDuplicates?: boolean;
}

/** GM 地图容器记录。 */
export interface GmMapContainerRecord {
/**
 * variant：来源附加变体标识。
 */

  variant?: 'herb';
/**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * refreshTicks：refreshtick相关字段。
 */

  refreshTicks?: number;
  /**
 * refreshTicksMin：刷新最小 tick。
 */

  refreshTicksMin?: number;
  /**
 * refreshTicksMax：刷新最大 tick。
 */

  refreshTicksMax?: number;
  /**
 * char：char相关字段。
 */

  char?: string;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * drops：drop相关字段。
 */

  drops?: GmMapDropRecord[];
  /**
 * lootPools：掉落Pool相关字段。
 */

  lootPools?: GmMapContainerLootPoolRecord[];
}

/** GM 地图任务记录。 */
export interface GmMapQuestRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * title：title名称或显示文本。
 */

  title: string;
  /**
 * desc：desc相关字段。
 */

  desc: string;
  /**
 * line：line相关字段。
 */

  line?: QuestLine;
  /**
 * chapter：chapter相关字段。
 */

  chapter?: string;
  /**
 * story：story相关字段。
 */

  story?: string;
  /**
 * objectiveType：objectiveType相关字段。
 */

  objectiveType?: QuestObjectiveType;
  /**
 * objectiveText：objectiveText名称或显示文本。
 */

  objectiveText?: string;
  /**
 * targetName：目标名称名称或显示文本。
 */

  targetName?: string;
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId?: string;
  /**
 * targetX：目标X相关字段。
 */

  targetX?: number;
  /**
 * targetY：目标Y相关字段。
 */

  targetY?: number;
  /**
 * targetNpcId：目标NPCID标识。
 */

  targetNpcId?: string;
  /**
 * targetNpcName：目标NPC名称名称或显示文本。
 */

  targetNpcName?: string;
  /**
 * targetMonsterId：目标怪物ID标识。
 */

  targetMonsterId?: string;
  /**
 * targetTechniqueId：目标功法ID标识。
 */

  targetTechniqueId?: string;
  /**
 * targetRealmStage：目标RealmStage相关字段。
 */

  targetRealmStage?: string | number;
  /**
 * required：required相关字段。
 */

  required?: number;
  /**
 * targetCount：数量或计量字段。
 */

  targetCount?: number;
  /**
 * rewardItemId：reward道具ID标识。
 */

  rewardItemId?: string;
  /**
 * rewardText：rewardText名称或显示文本。
 */

  rewardText?: string;
  /**
 * reward：reward相关字段。
 */

  reward?: GmMapDropRecord[];
  /**
 * nextQuestId：next任务ID标识。
 */

  nextQuestId?: string;
  /**
 * requiredItemId：required道具ID标识。
 */

  requiredItemId?: string;
  /**
 * requiredItemCount：数量或计量字段。
 */

  requiredItemCount?: number;
  /**
 * submitNpcId：submitNPCID标识。
 */

  submitNpcId?: string;
  /**
 * submitNpcName：submitNPC名称名称或显示文本。
 */

  submitNpcName?: string;
  /**
 * submitMapId：submit地图ID标识。
 */

  submitMapId?: string;
  /**
 * submitX：submitX相关字段。
 */

  submitX?: number;
  /**
 * submitY：submitY相关字段。
 */

  submitY?: number;
  /**
 * relayMessage：relayMessage相关字段。
 */

  relayMessage?: string;
  /**
 * unlockBreakthroughRequirementIds：unlockBreakthroughRequirementID相关字段。
 */

  unlockBreakthroughRequirementIds?: string[];
}

/** GM 地图 NPC 商店商品记录。 */
export interface GmMapNpcShopItemRecord {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * price：价格数值。
 */

  price?: number;
  /**
 * stockLimit：stockLimit相关字段。
 */

  stockLimit?: number;
  /**
 * refreshSeconds：refreshSecond相关字段。
 */

  refreshSeconds?: number;
  /**
 * priceFormula：价格Formula相关字段。
 */

  priceFormula?: 'technique_realm_square_grade';
}

/** GM 地图 NPC 记录。 */
export interface GmMapNpcRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * char：char相关字段。
 */

  char: string;
  /**
 * color：color相关字段。
 */

  color: string;
  /**
 * dialogue：dialogue相关字段。
 */

  dialogue: string;
  /**
 * role：role相关字段。
 */

  role?: string;
  /**
 * shopItems：集合字段。
 */

  shopItems?: GmMapNpcShopItemRecord[];
  /**
 * quests：集合字段。
 */

  quests?: GmMapQuestRecord[];
}

/** GM 地图怪物刷新点记录。 */
export interface GmMapMonsterSpawnRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * templateId：templateID标识。
 */

  templateId?: string;
  /**
 * name：名称名称或显示文本。
 */

  name?: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * char：char相关字段。
 */

  char?: string;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * hp：hp相关字段。
 */

  hp?: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;
  /**
 * attack：attack相关字段。
 */

  attack?: number;
  /**
 * count：数量或计量字段。
 */

  count?: number;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
  /**
 * maxAlive：maxAlive相关字段。
 */

  maxAlive?: number;
  /**
 * wanderRadius：wanderRadiu相关字段。
 */

  wanderRadius?: number;
  /**
 * aggroRange：aggro范围相关字段。
 */

  aggroRange?: number;
  /**
 * viewRange：视图范围相关字段。
 */

  viewRange?: number;
  /**
 * aggroMode：aggroMode相关字段。
 */

  aggroMode?: MonsterAggroMode;
  /**
 * respawnSec：重生Sec相关字段。
 */

  respawnSec?: number;
  /**
 * respawnTicks：重生tick相关字段。
 */

  respawnTicks?: number;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * statPercents：statPercent相关字段。
 */

  statPercents?: NumericStatPercentages;
  /**
 * skills：技能相关字段。
 */

  skills?: string[];
  /**
 * tier：tier相关字段。
 */

  tier?: MonsterTier;
  /**
 * expMultiplier：expMultiplier相关字段。
 */

  expMultiplier?: number;
  /**
 * drops：drop相关字段。
 */

  drops?: GmMapDropRecord[];
}

/** GM 编辑器里的 4 层地块真源单元。
 * - terrain：底层地形（floor/grass/...），缺省按 floor 处理。
 * - surface：地表铺装（road/trail/...），null 表示无铺装。
 * - structure：地上结构（wall/door/tree/...），null 表示无结构。
 * - interactables：交互对象（portal/stairs/...），缺省空数组。
 * 所有字段都是可选的，缺省时由运行时按多层默认补齐。
 */
export interface GmMapLayeredCellRecord {
  terrain?: TerrainType;
  surface?: SurfaceType | null;
  structure?: StructureType | null;
  interactables?: InteractableKind[];
}

/** GM 编辑器里的完整地图文档。 */
export interface GmMapDocument {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: MapRouteDomain;
  /**
 * mapLv：mapLv相关字段。
 */

  mapLv?: number;
  /**
 * parentMapId：parent地图ID标识。
 */

  parentMapId?: string;
  /**
 * parentOriginX：parentOriginX相关字段。
 */

  parentOriginX?: number;
  /**
 * parentOriginY：parentOriginY相关字段。
 */

  parentOriginY?: number;
  /**
 * floorLevel：floor等级数值。
 */

  floorLevel?: number;
  /**
 * floorName：floor名称名称或显示文本。
 */

  floorName?: string;
  /**
 * spaceVisionMode：spaceVisionMode相关字段。
 */

  spaceVisionMode?: 'isolated' | 'parent_overlay';
  /**
 * description：description相关字段。
 */

  description?: string;
  /**
 * tiles：tile相关字段。
 */

  tiles: string[];
  /**
 * terrainRows：可选底层地形真源（[y][x]）。缺省时由 tiles 字符推断。
 */
  terrainRows?: TerrainType[][];
  /**
 * surfaceRows：可选地表铺装真源（[y][x]）。null 表示该格没有铺装。
 */
  surfaceRows?: (SurfaceType | null)[][];
  /**
 * structureRows：可选地上结构真源（[y][x]）。null 表示该格没有结构。
 */
  structureRows?: (StructureType | null)[][];
  /**
 * interactableRows：可选交互层真源（[y][x][]）。空数组表示该格没有交互层标记。
 */
  interactableRows?: InteractableKind[][][];
  /**
 * layeredCells：可选的 4 层地块真源（[y][x]）。提供时优先于 tiles，由运行时直接读取；
 * 缺省时由服务端从 tiles 字符推断（保持与旧地图完全兼容）。
 */
  layeredCells?: (GmMapLayeredCellRecord | null)[][];
  /**
 * portals：portal相关字段。
 */

  portals: GmMapPortalRecord[];
  /**
 * spawnPoint：spawnPoint相关字段。
 */

  spawnPoint: {
  /**
 * x：x相关字段。
 */

    x: number;
    /**
 * y：y相关字段。
 */

    y: number;
  };
  /**
 * time：时间相关字段。
 */

  time?: MapTimeConfig;
  /**
 * auras：aura相关字段。
 */

  auras?: GmMapAuraRecord[];
  /**
 * resources：resource相关字段。
 */

  resources?: GmMapResourceRecord[];
  /**
 * safeZones：safeZone相关字段。
 */

  safeZones?: GmMapSafeZoneRecord[];
  /**
 * tileEffects：地块移动消耗与环境消耗区域。
 */

  tileEffects?: GmMapTileEffectRecord[];
  /**
 * resourceNodeGroups：资源节点分组布点。
 */

  resourceNodeGroups?: GmMapResourceNodeGroupRecord[];
  /**
 * landmarks：landmark相关字段。
 */

  landmarks?: GmMapLandmarkRecord[];
  /**
 * npcs：NPC相关字段。
 */

  npcs: GmMapNpcRecord[];
  /**
 * monsterSpawns：怪物Spawn相关字段。
 */

  monsterSpawns: GmMapMonsterSpawnRecord[];
}

/** GM 地图列表摘要。 */
export interface GmMapSummary {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * routeDomain：路线Domain相关字段。
 */

  routeDomain?: MapRouteDomain;
  /**
 * description：description相关字段。
 */

  description?: string;
  /**
 * mapLv：mapLv相关字段。
 */

  mapLv?: number;
  /**
 * portalCount：数量或计量字段。
 */

  portalCount: number;
  /**
 * npcCount：数量或计量字段。
 */

  npcCount: number;
  /**
 * monsterSpawnCount：数量或计量字段。
 */

  monsterSpawnCount: number;
}

/** GM 地图列表响应。 */
export interface GmMapListRes {
/**
 * maps：地图相关字段。
 */

  maps: GmMapSummary[];
}

/** GM 地图详情响应。 */
export interface GmMapDetailRes {
/**
 * map：缓存或索引容器。
 */

  map: GmMapDocument;
}

/** GM 更新地图请求。 */
export interface GmUpdateMapReq {
/**
 * map：缓存或索引容器。
 */

  map: GmMapDocument;
}

/** GM 世界实例分线预设。 */
export type GmWorldInstanceLinePreset = 'peaceful' | 'real';

export type GmWorldInstancePersistentPolicy = 'persistent' | 'long_lived' | 'session' | 'ephemeral';

/** GM 世界实例来源。 */
export type GmWorldInstanceOrigin = 'bootstrap' | 'gm_manual';

/** GM 世界实例列表摘要。 */
export interface GmWorldInstanceSummary {
/**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * displayName：实例展示名。
 */

  displayName: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  /**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * templateName：地图模板名称。
 */

  templateName: string;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * linePreset：分线预设。
 */

  linePreset: GmWorldInstanceLinePreset;
  /**
 * lineIndex：线路序号。
 */

  lineIndex: number;
  /**
 * instanceOrigin：实例来源。
 */

  instanceOrigin: GmWorldInstanceOrigin;
  /**
 * defaultEntry：是否为默认入口线路。
 */

  defaultEntry: boolean;
  /**
 * persistent：是否持久实例。
 */

  persistent: boolean;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: GmWorldInstancePersistentPolicy;
  /**
 * supportsPvp：是否支持 PVP。
 */

  supportsPvp: boolean;
  /**
 * canDamageTile：是否可攻击地块。
 */

  canDamageTile: boolean;
  /**
 * destroyAt：计划销毁时间。
 */

  destroyAt?: string | null;
  /**
 * playerCount：在线人数。
 */

  playerCount: number;
  /**
 * tick：实例 tick。
 */

  tick: number;
  /**
 * worldRevision：世界版本号。
 */

  worldRevision: number;
}

/** GM 世界实例列表响应。 */
export interface GmWorldInstanceListRes {
/**
 * instances：实例列表。
 */

  instances: GmWorldInstanceSummary[];
}

// ===== GM 世界管理 =====

/** GM 运行时地图实体 */
export interface GmRuntimeEntity {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * char：char相关字段。
 */

  char: string;
  /**
 * color：color相关字段。
 */

  color: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * kind：kind相关字段。
 */

  kind: 'player' | 'monster' | 'npc' | 'container';
  /**
 * hp：hp相关字段。
 */

  hp?: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;
  /**
 * dead：dead相关字段。
 */

  dead?: boolean;
  /**
 * alive：alive相关字段。
 */

  alive?: boolean;
  /**
 * targetPlayerId：目标玩家ID标识。
 */

  targetPlayerId?: string;
  /**
 * respawnLeft：重生Left相关字段。
 */

  respawnLeft?: number;
  /**
 * online：online相关字段。
 */

  online?: boolean;
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle?: boolean;
  /**
 * isBot：启用开关或状态标识。
 */

  isBot?: boolean;
}

/** GM 运行时地图快照响应 */
export interface GmMapRuntimeRes {
/**
 * mapId：地图ID标识。
 */

  mapId: string;
  /**
 * mapName：地图名称名称或显示文本。
 */

  mapName: string;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
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

/** GM 世界实例运行态快照响应。 */
export interface GmWorldInstanceRuntimeRes extends GmMapRuntimeRes {
/**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * instanceName：实例名称。
 */

  instanceName: string;
  /**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * templateName：地图模板名称。
 */

  templateName: string;
  /**
 * linePreset：分线预设。
 */

  linePreset: GmWorldInstanceLinePreset;
  /**
 * lineIndex：线路序号。
 */

  lineIndex: number;
  /**
 * instanceOrigin：实例来源。
 */

  instanceOrigin: GmWorldInstanceOrigin;
  /**
 * defaultEntry：是否为默认入口线路。
 */

  defaultEntry: boolean;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: GmWorldInstancePersistentPolicy;
  /**
 * supportsPvp：是否支持 PVP。
 */

  supportsPvp: boolean;
  /**
 * canDamageTile：是否可攻击地块。
 */

  canDamageTile: boolean;
  /**
 * destroyAt：计划销毁时间。
 */

  destroyAt?: string | null;
  /**
 * playerCount：在线人数。
 */

  playerCount: number;
  /**
 * worldRevision：世界版本号。
 */

  worldRevision: number;
}

/** GM 创建世界实例请求。 */
export interface GmCreateWorldInstanceReq {
/**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * linePreset：分线预设。
 */

  linePreset: GmWorldInstanceLinePreset;
  /**
 * displayName：实例展示名。
 */

  displayName?: string;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: GmWorldInstancePersistentPolicy;
  /**
 * expireAt：计划销毁时间戳，毫秒。
 */

  expireAt?: number | null;
}

/** GM 创建世界实例响应。 */
export interface GmCreateWorldInstanceRes {
/**
 * instance：实例摘要。
 */

  instance: GmWorldInstanceSummary;
}

/** GM 迁移玩家到实例请求。 */
export interface GmTransferPlayerToInstanceReq {
/**
 * playerId：玩家 ID 标识。
 */

  playerId: string;
  /**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * x：目标 X 坐标。
 */

  x?: number;
  /**
 * y：目标 Y 坐标。
 */

  y?: number;
}

/** GM 修改地图 tick 速率请求 */
export interface GmUpdateMapTickReq {
/**
 * speed：speed数值。
 */

  speed?: number;
  /**
 * paused：paused相关字段。
 */

  paused?: boolean;
}

/** GM 修改地图时间配置请求 */
export interface GmUpdateMapTimeReq {
/**
 * scale：scale相关字段。
 */

  scale?: number;
  /**
 * offsetTicks：offsettick相关字段。
 */

  offsetTicks?: number;
}

/** GM 运行时地图请求查询参数。 */
export interface GmMapRuntimeQuery {
/**
 * x：x相关字段。
 */

  x?: number;
  /**
 * y：y相关字段。
 */

  y?: number;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
}

/** GM 发信请求，支持模板或自定义正文。 */
export interface GmCreateMailReq {
/**
 * templateId：templateID标识。
 */

  templateId?: string;
  /**
 * args：arg相关字段。
 */

  args?: MailTemplateArg[];
  /**
 * fallbackTitle：fallbackTitle名称或显示文本。
 */

  fallbackTitle?: string;
  /**
 * fallbackBody：fallbackBody相关字段。
 */

  fallbackBody?: string;
  /**
 * attachments：attachment相关字段。
 */

  attachments?: MailAttachment[];
  /**
 * senderLabel：senderLabel名称或显示文本。
 */

  senderLabel?: string;
  /**
 * expireAt：expireAt相关字段。
 */

  expireAt?: number | null;
}

/** GM 重置性能统计的响应。 */
export interface GmResetPerfRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
}

/** GM 广播邮件请求；可选玩家范围为空时按全员邮件处理。 */
export interface GmBroadcastMailReq extends GmCreateMailReq {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * targetPlayerIds：目标玩家ID相关字段。
 */

  targetPlayerIds?: string[];
}

/** GM 给单个玩家发邮件请求。 */
export interface GmSendPlayerMailReq extends GmCreateMailReq {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
}

/** GM 给单个玩家发邮件响应。 */
export interface GmSendPlayerMailRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
  /**
 * mailId：邮件ID相关字段。
 */

  mailId: string;
}

/** GM 广播邮件响应。 */
export interface GmBroadcastMailRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
  /**
 * mailId：邮件ID相关字段。
 */

  mailId: string;
  /**
 * batchId：batchID标识。
 */

  batchId: string;
  /**
 * recipientCount：数量或计量字段。
 */

  recipientCount: number;
}

/** GM 发邮件响应。 */
export type GmSendMailRes = GmSendPlayerMailRes | GmBroadcastMailRes;

// ─── GM 密钥管理 ───

/** GM 密钥列表项（不含明文值）。
 *
 * N51 安全收口：原 maskedValue 字段需要 list 时把所有密钥都 decrypt 一遍（即使只是为了 mask），
 * 单次 list 调用就让全部密钥过一遍解密链路；攻击者拿到 GM token 后调用 list 即可获得 mask 中
 * 残留的明文片段。新字段只回 valueLength（密文长度的近似值，不暴露任何明文信息）。
 */
export interface GmSecretListItem {
  key: string;
  description: string;
  /** 密钥明文长度的近似值（基于密文段长度反推），不返回任何明文内容。 */
  valueLength: number;
  updatedAt: string;
}

/** GM 设置密钥请求。 */
export interface GmSetSecretReq {
  key: string;
  value: string;
  description: string;
}

/** GM 密钥详情响应。 */
export interface GmSecretDetailRes {
  found: boolean;
  key?: string;
  value?: string;
  description?: string;
  updatedAt?: string;
}

// ─── GM 环境变量管理 ───

/** GM 环境变量来源。 */
export type GmEnvironmentVarSource = 'process_env' | 'runtime_override' | 'runtime_file' | 'unset';

/** GM 环境变量列表项。 */
export interface GmEnvironmentVarItem {
  key: string;
  /** 展示名称；未配置注册表时回退为 key。 */
  label: string;
  /** 变量说明。 */
  description: string;
  /** 归属分类。 */
  category: string;
  /** 当前显示值；敏感值可由服务端返回脱敏文本。 */
  value: string;
  /** 当前值来源。 */
  source: GmEnvironmentVarSource;
  /** 是否可编辑。 */
  editable: boolean;
  /** 是否支持持久化写入本地 runtime env 文件。 */
  persistable: boolean;
  /** 是否建议重启后才稳定生效。 */
  restartRequired: boolean;
  /** 是否敏感。 */
  sensitive: boolean;
  /** 是否来自注册表。 */
  managed: boolean;
  /** 是否已写入 runtime env 文件。 */
  persistent: boolean;
}

/** GM 环境变量列表响应。 */
export interface GmEnvironmentVarListRes {
  items: GmEnvironmentVarItem[];
  checkedAt: number;
}

/** GM 设置环境变量请求。 */
export interface GmSetEnvironmentVarReq {
  value: string;
  persist?: boolean;
}

/** GM 环境变量重载响应。 */
export interface GmReloadEnvironmentVarsRes {
  ok: true;
  reloadedAt: number;
  count: number;
}

// ─── GM 游戏配置中心 ───

/** 游戏配置值类型。 */
export type GameConfigValueType = 'boolean' | 'number' | 'string';

/** 游戏配置列表项。 */
export interface GameConfigItem {
  key: string;
  label: string;
  description: string;
  category: string;
  valueType: GameConfigValueType;
  /** 当前生效值（来自 process.env）。 */
  currentValue: string;
  /** 数据库中保存的值（下次重启生效）；null 表示未设置。 */
  pendingValue: string | null;
  /** 注册表默认值。 */
  defaultValue: string;
  /** 是否有待重启生效的变更。 */
  pendingRestart: boolean;
  /** 最小值（仅 number 类型）。 */
  min?: number;
  /** 最大值（仅 number 类型）。 */
  max?: number;
}

/** 游戏配置列表响应。 */
export interface GameConfigListRes {
  items: GameConfigItem[];
  checkedAt: number;
}

/** 设置游戏配置请求。 */
export interface GameConfigSetReq {
  value: string;
}

/** 设置游戏配置响应。 */
export interface GameConfigSetRes {
  ok: true;
  key: string;
  value: string;
  pendingRestart: true;
}

/** 删除游戏配置响应（恢复默认）。 */
export interface GameConfigDeleteRes {
  ok: true;
  key: string;
  restoredDefault: string;
}

// ─── GM AI Provider 配置 ───

/** GM AI 配置用途。 */
export type GmAiProviderKind = 'text' | 'image';

/** GM 文本模型 provider。 */
export type GmAiTextProvider = 'openai' | 'openai-compatible' | 'anthropic';

/** GM 图像模型 provider。 */
export type GmAiImageProvider = 'openai' | 'dashscope';

/** GM AI provider 下挂模型来源。 */
export type GmAiProviderModelSource = 'manual' | 'fetched' | 'legacy';

/** GM AI provider 下挂模型项。 */
export interface GmAiProviderModelItem {
  name: string;
  enabled: boolean;
  source: GmAiProviderModelSource;
  addedAt: string;
}

/** GM AI provider 配置列表项；不包含 API Key 明文。 */
export interface GmAiProviderConfigItem {
  scope: string;
  kind: GmAiProviderKind;
  provider: GmAiTextProvider | GmAiImageProvider;
  baseURL: string;
  /** 默认模型名；兼容旧调用路径，通常等于 models 中第一个启用项。 */
  modelName: string;
  models: GmAiProviderModelItem[];
  timeoutMs: number;
  imageSize: string;
  imageQuality: string;
  secretKeyRef: string;
  secretConfigured: boolean;
  enabled: boolean;
  revision: number;
  updatedBy: string;
  updatedAt: string;
}

/** GM AI provider 配置列表响应。 */
export interface GmAiProviderConfigListRes {
  items: GmAiProviderConfigItem[];
  checkedAt: number;
  secretStoreAvailable: boolean;
}

/** GM AI provider 配置保存请求。apiKey 只写入 GM 密钥表，不进入普通配置表。 */
export interface GmAiProviderConfigSetReq {
  provider: GmAiTextProvider | GmAiImageProvider;
  baseURL: string;
  modelName?: string;
  models?: GmAiProviderModelItem[];
  timeoutMs?: number;
  imageSize?: string;
  imageQuality?: string;
  secretKeyRef: string;
  apiKey?: string;
  enabled?: boolean;
}

/** GM AI provider 配置保存响应。 */
export interface GmAiProviderConfigSetRes {
  ok: true;
  item: GmAiProviderConfigItem;
  secretWritten: boolean;
}

/** GM AI provider 配置删除响应。 */
export interface GmAiProviderConfigDeleteRes {
  ok: true;
  deleted: boolean;
}

/** GM AI provider 拉取模型列表响应。 */
export interface GmAiProviderFetchModelsRes {
  ok: true;
  models: GmAiProviderModelItem[];
  fetchedCount: number;
}

/** GM AI provider 单模型删除响应。 */
export interface GmAiProviderDeleteModelRes {
  ok: true;
  item: GmAiProviderConfigItem;
  deleted: boolean;
}

/** GM AI provider 单模型测试响应。 */
export interface GmAiProviderTestModelRes {
  ok: boolean;
  scope: string;
  kind: GmAiProviderKind;
  modelName: string;
  latencyMs: number;
  message: string;
}

/**
 * GM HTTP 模块契约常量。
 * 定义 GM 鉴权、邮件、玩家变更、Socket、数据库恢复等子系统的行为约定，
 * 供服务层和控制器层引用以保持一致性。
 */

/** GM HTTP 路由与控制器形态契约。 */
export const GM_HTTP_CONTRACT = Object.freeze({
  authBasePath: 'api/auth',
  gmBasePath: 'api/gm',
  controllerShape: 'thin_service_delegation',
  authSurface: 'native_http',
  adminSurface: 'native_http',
  restoreSurface: 'native_http',
});

/** GM 鉴权契约：密码存储、环境变量来源和不安全密码策略。 */
export const GM_AUTH_CONTRACT = Object.freeze({
  passwordRecordScope: 'server_gm_auth_v1',
  passwordRecordKey: 'gm_auth',
  identityPersistedSource: 'native',
  tokenValidatorOwner: 'runtime_gm_auth_service',
  defaultInsecurePassword: 'admin123',
  allowInsecureLocalPasswordEnvNames: [
    'SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD',
    'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD',
  ],
  explicitPasswordEnvNames: ['SERVER_GM_PASSWORD', 'GM_PASSWORD'],
  insecureLocalPasswordRuntimeEnvs: ['development', 'dev', 'local', 'test'],
});

/** GM 邮件广播收件人策略：优先运行时在线玩家，回退到持久化非机器人玩家。 */
export const NATIVE_GM_MAIL_RECIPIENT_CONTRACT = Object.freeze({
  runtimeRecipients: 'runtime_non_bot_players',
  persistedFallbackRecipients: 'persisted_non_runtime_non_bot_players',
});

/** GM 玩家变更契约：哪些 section 走运行时队列，哪些直接写快照。 */
export const NATIVE_GM_PLAYER_MUTATION_CONTRACT = Object.freeze({
  runtimeQueueSection: 'position',
  directSnapshotSections: ['basic', 'realm', 'buffs', 'techniques', 'items', 'quests', 'mail', 'persisted', null],
});

/** GM Socket 推送契约：变更后是否主动推送状态。 */
export const NATIVE_GM_SOCKET_CONTRACT = Object.freeze({
  mode: 'runtime_queue_only',
  pushStateAfterMutation: true,
});

/** 数据库恢复契约：恢复前后的刷盘、清理、重载策略。 */
export const NATIVE_GM_RESTORE_CONTRACT = Object.freeze({
  restoreMode: 'replace_server_persistence',
  scope: 'server_persistence',
  flushPlayersBeforeRestore: true,
  flushMapsBeforeRestore: true,
  purgeSessionsBeforeRestore: true,
  clearDetachedCachesBeforeRestore: true,
  reloadWorldRuntimeAfterRestore: true,
  reloadMarketAfterRestore: true,
  reloadSuggestionAfterRestore: true,
  reloadGmAuthAfterRestore: true,
  preImportBackupEnabled: true,
  requiresMaintenance: false,
});

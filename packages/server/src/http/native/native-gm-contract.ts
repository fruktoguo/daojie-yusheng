export const GM_HTTP_CONTRACT = Object.freeze({
  authBasePath: 'api/auth',
  gmBasePath: 'api/gm',
  controllerShape: 'thin_service_delegation',
  authSurface: 'native_http',
  adminSurface: 'native_http',
  restoreSurface: 'native_http',
});

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

export const NATIVE_GM_MAIL_RECIPIENT_CONTRACT = Object.freeze({
  runtimeRecipients: 'runtime_non_bot_players',
  persistedFallbackRecipients: 'persisted_non_runtime_non_bot_players',
});

export const NATIVE_GM_PLAYER_MUTATION_CONTRACT = Object.freeze({
  runtimeQueueSection: 'position',
  directSnapshotSections: ['basic', 'realm', 'buffs', 'techniques', 'items', 'quests', 'mail', 'persisted', null],
});

export const NATIVE_GM_SOCKET_CONTRACT = Object.freeze({
  mode: 'runtime_queue_only',
  pushStateAfterMutation: true,
});

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
  requiresMaintenance: true,
});

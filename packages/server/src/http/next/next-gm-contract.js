"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_GM_SOCKET_CONTRACT = exports.NEXT_GM_PLAYER_MUTATION_CONTRACT = exports.NEXT_GM_MAIL_RECIPIENT_CONTRACT = exports.NEXT_GM_AUTH_CONTRACT = exports.NEXT_GM_RESTORE_CONTRACT = exports.NEXT_GM_HTTP_CONTRACT = void 0;

const NEXT_GM_HTTP_CONTRACT = Object.freeze({
    authBasePath: 'api/auth',
    gmBasePath: 'api/gm',
    controllerShape: 'thin_service_delegation',
    authSurface: 'next_native_http',
    adminSurface: 'next_native_http',
    restoreSurface: 'next_native_http',
});
exports.NEXT_GM_HTTP_CONTRACT = NEXT_GM_HTTP_CONTRACT;

const NEXT_GM_AUTH_CONTRACT = Object.freeze({
    passwordRecordScope: 'server_next_gm_auth_v1',
    passwordRecordKey: 'gm_auth',
    identityPersistedSource: 'native',
    tokenValidatorOwner: 'runtime_gm_auth_service',
});
exports.NEXT_GM_AUTH_CONTRACT = NEXT_GM_AUTH_CONTRACT;

const NEXT_GM_MAIL_RECIPIENT_CONTRACT = Object.freeze({
    runtimeRecipients: 'runtime_non_bot_players',
    persistedFallbackRecipients: 'persisted_non_runtime_non_bot_players',
});
exports.NEXT_GM_MAIL_RECIPIENT_CONTRACT = NEXT_GM_MAIL_RECIPIENT_CONTRACT;

const NEXT_GM_PLAYER_MUTATION_CONTRACT = Object.freeze({
    runtimeQueueSection: 'position',
    directSnapshotSections: ['basic', 'realm', 'buffs', 'techniques', 'items', 'quests', 'mail', 'persisted', null],
});
exports.NEXT_GM_PLAYER_MUTATION_CONTRACT = NEXT_GM_PLAYER_MUTATION_CONTRACT;

const NEXT_GM_SOCKET_CONTRACT = Object.freeze({
    mode: 'runtime_queue_only',
    pushStateAfterMutation: true,
});
exports.NEXT_GM_SOCKET_CONTRACT = NEXT_GM_SOCKET_CONTRACT;

const NEXT_GM_RESTORE_CONTRACT = Object.freeze({
    restoreMode: 'replace_persistent_documents',
    scope: 'persistent_documents_only',
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
exports.NEXT_GM_RESTORE_CONTRACT = NEXT_GM_RESTORE_CONTRACT;

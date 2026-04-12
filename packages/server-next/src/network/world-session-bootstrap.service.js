"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionBootstrapService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
/** world_gm_auth_service_1：定义该变量以承载业务值。 */
const world_gm_auth_service_1 = require("./world-gm-auth.service");
/** world_player_auth_service_1：定义该变量以承载业务值。 */
const world_player_auth_service_1 = require("./world-player-auth.service");
/** world_player_snapshot_service_1：定义该变量以承载业务值。 */
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("./world-session.service");
/** world_sync_service_1：定义该变量以承载业务值。 */
const world_sync_service_1 = require("./world-sync.service");
/** world_client_event_service_1：定义该变量以承载业务值。 */
const world_client_event_service_1 = require("./world-client-event.service");
/** world_player_token_service_1：定义该变量以承载业务值。 */
const world_player_token_service_1 = require("./world-player-token.service");
/** STRICT_NATIVE_SNAPSHOT_ENV_KEYS：定义该变量以承载业务值。 */
const STRICT_NATIVE_SNAPSHOT_ENV_KEYS = [
    'SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
    'NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
];
/** NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS：定义该变量以承载业务值。 */
const NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS = [
    'SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
    'NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
];
/** NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES：定义该变量以承载业务值。 */
const NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES = new Set([
    'token_seed',
]);
/** MAX_REQUESTED_SESSION_ID_LENGTH：定义该变量以承载业务值。 */
const MAX_REQUESTED_SESSION_ID_LENGTH = 128;
/** REQUESTED_SESSION_ID_PATTERN：定义该变量以承载业务值。 */
const REQUESTED_SESSION_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;
/** IMPLICIT_DETACHED_RESUME_AUTH_SOURCES：定义该变量以承载业务值。 */
const IMPLICIT_DETACHED_RESUME_AUTH_SOURCES = new Set([
    'next',
    'token',
]);
/** AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS：定义该变量以承载业务值。 */
const AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS = new Set([
    'connect_token',
    'connect_gm_token',
]);
/** AUTHENTICATED_NEXT_REUSE_PERSISTED_SOURCES：定义该变量以承载业务值。 */
const AUTHENTICATED_NEXT_REUSE_PERSISTED_SOURCES = new Set([
    'native',
    'legacy_sync',
]);
/** AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES：定义该变量以承载业务值。 */
const AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES = new Set([
    'token_seed',
]);
/** NEXT_BOOTSTRAP_ALLOWED_IDENTITY_SOURCES：定义该变量以承载业务值。 */
const NEXT_BOOTSTRAP_ALLOWED_IDENTITY_SOURCES = new Set([
    'next',
    'token',
]);
/** NEXT_BOOTSTRAP_ALLOWED_NEXT_PERSISTED_SOURCES：定义该变量以承载业务值。 */
const NEXT_BOOTSTRAP_ALLOWED_NEXT_PERSISTED_SOURCES = new Set([
    'native',
    'legacy_sync',
]);
/** isStrictNativeSnapshotRequired：执行对应的业务逻辑。 */
function isStrictNativeSnapshotRequired() {
    for (const key of STRICT_NATIVE_SNAPSHOT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** isNativeSnapshotRecoveryEnabled：执行对应的业务逻辑。 */
function isNativeSnapshotRecoveryEnabled() {
    for (const key of NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** WorldSessionBootstrapService：定义该变量以承载业务值。 */
let WorldSessionBootstrapService = class WorldSessionBootstrapService {
    logger = new common_1.Logger(WorldSessionBootstrapService.name);
    worldPlayerAuthService;
    worldPlayerSnapshotService;
    worldGmAuthService;
    playerRuntimeService;
    mailRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    worldSessionService;
    worldSyncService;
    worldClientEventService;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldPlayerAuthService, worldPlayerSnapshotService, worldGmAuthService, playerRuntimeService, mailRuntimeService, suggestionRuntimeService, worldRuntimeService, worldSessionService, worldSyncService, worldClientEventService) {
        this.worldPlayerAuthService = worldPlayerAuthService;
        this.worldPlayerSnapshotService = worldPlayerSnapshotService;
        this.worldGmAuthService = worldGmAuthService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
        this.worldClientEventService = worldClientEventService;
    }
/** pickSocketToken：执行对应的业务逻辑。 */
    pickSocketToken(client) {
/** token：定义该变量以承载业务值。 */
        const token = client.handshake?.auth?.token;
        return typeof token === 'string' ? token.trim() : '';
    }
/** pickSocketGmToken：执行对应的业务逻辑。 */
    pickSocketGmToken(client) {
/** token：定义该变量以承载业务值。 */
        const token = client.handshake?.auth?.gmToken;
        return typeof token === 'string' ? token.trim() : '';
    }
/** inspectRequestedSessionId：执行对应的业务逻辑。 */
    inspectRequestedSessionId(rawSessionId, client, source = 'socket') {
        if (typeof rawSessionId !== 'string') {
            return {
                sessionId: '',
                error: null,
            };
        }
/** normalizedSessionId：定义该变量以承载业务值。 */
        const normalizedSessionId = rawSessionId.trim();
        if (!normalizedSessionId) {
            return {
                sessionId: '',
                error: null,
            };
        }
        if (normalizedSessionId.length > MAX_REQUESTED_SESSION_ID_LENGTH) {
            this.logger.warn(`${source} requested sessionId too long, rejected: socket=${client?.id ?? 'unknown'} length=${normalizedSessionId.length}`);
            return {
                sessionId: '',
                error: 'too_long',
            };
        }
        if (!REQUESTED_SESSION_ID_PATTERN.test(normalizedSessionId)) {
            this.logger.warn(`${source} requested sessionId contains invalid chars, rejected: socket=${client?.id ?? 'unknown'}`);
            return {
                sessionId: '',
                error: 'invalid_chars',
            };
        }
        return {
            sessionId: normalizedSessionId,
            error: null,
        };
    }
/** inspectSocketRequestedSessionId：执行对应的业务逻辑。 */
    inspectSocketRequestedSessionId(client) {
        return this.inspectRequestedSessionId(client.handshake?.auth?.sessionId, client, 'socket');
    }
/** pickSocketRequestedSessionId：执行对应的业务逻辑。 */
    pickSocketRequestedSessionId(client) {
        return this.inspectSocketRequestedSessionId(client).sessionId;
    }
/** authenticateSocketToken：执行对应的业务逻辑。 */
    authenticateSocketToken(token, options = undefined) {
        return this.worldPlayerAuthService.authenticatePlayerToken(token, options);
    }
/** authenticateSocketGmToken：执行对应的业务逻辑。 */
    authenticateSocketGmToken(token) {
        return this.worldGmAuthService.validateSocketGmToken(token);
    }
/** resolveBootstrapEntryPath：执行对应的业务逻辑。 */
    resolveBootstrapEntryPath(client) {
/** entryPath：定义该变量以承载业务值。 */
        const entryPath = client?.data?.bootstrapEntryPath;
        return typeof entryPath === 'string' && entryPath.trim() ? entryPath.trim() : null;
    }
/** resolveBootstrapIdentitySource：执行对应的业务逻辑。 */
    resolveBootstrapIdentitySource(client) {
/** identitySource：定义该变量以承载业务值。 */
        const identitySource = client?.data?.bootstrapIdentitySource;
        return typeof identitySource === 'string' && identitySource.trim() ? identitySource.trim() : null;
    }
/** resolveBootstrapIdentityPersistedSource：执行对应的业务逻辑。 */
    resolveBootstrapIdentityPersistedSource(client) {
/** identityPersistedSource：定义该变量以承载业务值。 */
        const identityPersistedSource = client?.data?.bootstrapIdentityPersistedSource;
        return typeof identityPersistedSource === 'string' && identityPersistedSource.trim() ? identityPersistedSource.trim() : null;
    }
/** resolveBootstrapSnapshotSource：执行对应的业务逻辑。 */
    resolveBootstrapSnapshotSource(client) {
/** snapshotSource：定义该变量以承载业务值。 */
        const snapshotSource = client?.data?.bootstrapSnapshotSource;
        return typeof snapshotSource === 'string' && snapshotSource.trim() ? snapshotSource.trim() : null;
    }
/** resolveBootstrapSnapshotPersistedSource：执行对应的业务逻辑。 */
    resolveBootstrapSnapshotPersistedSource(client) {
/** snapshotPersistedSource：定义该变量以承载业务值。 */
        const snapshotPersistedSource = client?.data?.bootstrapSnapshotPersistedSource;
        return typeof snapshotPersistedSource === 'string' && snapshotPersistedSource.trim() ? snapshotPersistedSource.trim() : null;
    }
/** resolveClientProtocol：执行对应的业务逻辑。 */
    resolveClientProtocol(client) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = client?.data?.protocol;
        return typeof protocol === 'string' && protocol.trim() ? protocol.trim().toLowerCase() : null;
    }
/** resolveAuthenticatedBootstrapIdentitySource：执行对应的业务逻辑。 */
    resolveAuthenticatedBootstrapIdentitySource(client, input = undefined) {
/** authSource：定义该变量以承载业务值。 */
        const authSource = typeof input?.authSource === 'string' ? input.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
        return this.resolveBootstrapIdentitySource(client);
    }
/** resolveAuthenticatedBootstrapIdentityPersistedSource：执行对应的业务逻辑。 */
    resolveAuthenticatedBootstrapIdentityPersistedSource(client, input = undefined) {
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = typeof input?.persistedSource === 'string' ? input.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
        return this.resolveBootstrapIdentityPersistedSource(client);
    }
/** rememberAuthenticatedBootstrapIdentity：执行对应的业务逻辑。 */
    rememberAuthenticatedBootstrapIdentity(client, input = undefined) {
        if (!client?.data
            || !input
            || (typeof input?.authSource !== 'string' && typeof input?.persistedSource !== 'string')) {
            return;
        }
        client.data.bootstrapIdentitySource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
        client.data.bootstrapIdentityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
    }
/** resolveAuthenticatedBootstrapContractViolation：执行对应的业务逻辑。 */
    resolveAuthenticatedBootstrapContractViolation(client, input = undefined) {
/** entryPath：定义该变量以承载业务值。 */
        const entryPath = this.resolveBootstrapEntryPath(client);
        if (!AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS.has(entryPath ?? '')) {
            return null;
        }
/** protocol：定义该变量以承载业务值。 */
        const protocol = this.resolveClientProtocol(client);
        if (protocol !== 'next') {
            return null;
        }
/** authSource：定义该变量以承载业务值。 */
        const authSource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
        if (!NEXT_BOOTSTRAP_ALLOWED_IDENTITY_SOURCES.has(authSource ?? '')) {
            return {
                stage: 'next_bootstrap_identity_source_blocked',
                message: `NEXT 协议 bootstrap 不接受 ${authSource || 'unknown'} 身份来源`,
            };
        }
        if (!persistedSource) {
            return {
                stage: 'next_bootstrap_persisted_source_missing',
                message: 'NEXT 协议 bootstrap 缺少持久化身份来源',
            };
        }
        if (authSource === 'token' && !AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES.has(persistedSource)) {
            return {
                stage: 'next_bootstrap_token_persisted_source_invalid',
                message: `NEXT 协议 token 身份不接受 ${persistedSource} 持久化来源`,
            };
        }
        if (authSource === 'next' && !NEXT_BOOTSTRAP_ALLOWED_NEXT_PERSISTED_SOURCES.has(persistedSource)) {
            return {
                stage: 'next_bootstrap_next_persisted_source_invalid',
                message: `NEXT 协议 next 身份不接受 ${persistedSource} 持久化来源`,
            };
        }
        return null;
    }
/** resolveBootstrapSessionReusePolicy：执行对应的业务逻辑。 */
    resolveBootstrapSessionReusePolicy(client) {
        if (client?.data?.isGm === true) {
            return {
                allowImplicitDetachedResume: false,
                allowRequestedDetachedResume: false,
                allowConnectedSessionReuse: false,
            };
        }
/** entryPath：定义该变量以承载业务值。 */
        const entryPath = this.resolveBootstrapEntryPath(client);
/** identitySource：定义该变量以承载业务值。 */
        const identitySource = this.resolveAuthenticatedBootstrapIdentitySource(client);
/** identityPersistedSource：定义该变量以承载业务值。 */
        const identityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client);
/** effectiveIdentitySource：定义该变量以承载业务值。 */
        const effectiveIdentitySource = identitySource === 'next' && identityPersistedSource === 'token_seed'
            ? 'token'
            : identitySource;
        if (AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS.has(entryPath ?? '')) {
/** allowAuthenticatedReuse：定义该变量以承载业务值。 */
            const allowAuthenticatedReuse = effectiveIdentitySource === 'next'
                ? AUTHENTICATED_NEXT_REUSE_PERSISTED_SOURCES.has(identityPersistedSource ?? '')
                : effectiveIdentitySource === 'token'
                    ? AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES.has(identityPersistedSource ?? '')
                    : false;
            return {
                allowImplicitDetachedResume: allowAuthenticatedReuse,
                allowRequestedDetachedResume: allowAuthenticatedReuse,
                allowConnectedSessionReuse: allowAuthenticatedReuse,
            };
        }
        if (!identitySource) {
            return {
                allowImplicitDetachedResume: true,
                allowRequestedDetachedResume: true,
                allowConnectedSessionReuse: true,
            };
        }
        return {
            allowImplicitDetachedResume: false,
            allowRequestedDetachedResume: false,
            allowConnectedSessionReuse: false,
        };
    }
/** rememberBootstrapSnapshotContext：执行对应的业务逻辑。 */
    rememberBootstrapSnapshotContext(client, snapshotSource, snapshotPersistedSource = null) {
        if (!client?.data) {
            return;
        }
        client.data.bootstrapSnapshotSource = typeof snapshotSource === 'string' && snapshotSource.trim()
            ? snapshotSource.trim()
            : null;
        client.data.bootstrapSnapshotPersistedSource = typeof snapshotPersistedSource === 'string' && snapshotPersistedSource.trim()
            ? snapshotPersistedSource.trim()
            : null;
    }
/** rememberBootstrapIdentityPersistedSource：执行对应的业务逻辑。 */
    rememberBootstrapIdentityPersistedSource(client, identityPersistedSource) {
        if (!client?.data) {
            return;
        }
        client.data.bootstrapIdentityPersistedSource = typeof identityPersistedSource === 'string' && identityPersistedSource.trim()
            ? identityPersistedSource.trim()
            : null;
    }
/** shouldAllowImplicitDetachedResume：执行对应的业务逻辑。 */
    shouldAllowImplicitDetachedResume(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowImplicitDetachedResume;
    }
/** shouldAllowConnectedSessionReuse：执行对应的业务逻辑。 */
    shouldAllowConnectedSessionReuse(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowConnectedSessionReuse;
    }
/** shouldAllowRequestedDetachedResume：执行对应的业务逻辑。 */
    shouldAllowRequestedDetachedResume(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowRequestedDetachedResume;
    }
/** clearAuthenticatedSnapshotRecovery：执行对应的业务逻辑。 */
    clearAuthenticatedSnapshotRecovery(client) {
        if (!client?.data) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = null;
    }
/** rememberAuthenticatedSnapshotRecovery：执行对应的业务逻辑。 */
    rememberAuthenticatedSnapshotRecovery(client, recovery) {
        if (!client?.data || !recovery) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = recovery;
    }
/** consumeAuthenticatedSnapshotRecovery：执行对应的业务逻辑。 */
    consumeAuthenticatedSnapshotRecovery(client) {
/** recovery：定义该变量以承载业务值。 */
        const recovery = client?.data?.authenticatedSnapshotRecovery ?? null;
        if (client?.data) {
            client.data.authenticatedSnapshotRecovery = null;
        }
        return recovery && typeof recovery === 'object' ? recovery : null;
    }
/** buildAuthenticatedSnapshotRecoveryMessage：执行对应的业务逻辑。 */
    buildAuthenticatedSnapshotRecoveryMessage(recovery) {
/** identityPersistedSource：定义该变量以承载业务值。 */
        const identityPersistedSource = typeof recovery?.identityPersistedSource === 'string' ? recovery.identityPersistedSource.trim() : '';
        if (identityPersistedSource === 'token_seed') {
            return '检测到你是首次以 next 真源入场，角色数据已自动补齐为初始快照。';
        }
        return '检测到角色快照缺失，已自动补齐为 next 初始快照。';
    }
/** emitAuthenticatedSnapshotRecoveryNotice：执行对应的业务逻辑。 */
    emitAuthenticatedSnapshotRecoveryNotice(client, playerId) {
/** recovery：定义该变量以承载业务值。 */
        const recovery = this.consumeAuthenticatedSnapshotRecovery(client);
        if (!recovery) {
            return null;
        }
/** message：定义该变量以承载业务值。 */
        const message = this.buildAuthenticatedSnapshotRecoveryMessage(recovery);
        this.playerRuntimeService.queuePendingLogbookMessage(playerId, {
/** id：定义该变量以承载业务值。 */
            id: `snapshot_recovery:${playerId}:${typeof recovery.identityPersistedSource === 'string' ? recovery.identityPersistedSource : 'unknown'}`,
            kind: 'system',
            text: message,
            from: 'system',
            at: Date.now(),
        });
        return recovery;
    }
/** deferInitialSyncEmission：执行对应的业务逻辑。 */
    async deferInitialSyncEmission() {
        await new Promise((resolve) => setImmediate(resolve));
    }
/** prepareBootstrapRuntime：执行对应的业务逻辑。 */
    prepareBootstrapRuntime(client, playerId) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
/** existingBinding：定义该变量以承载业务值。 */
        const existingBinding = this.worldSessionService.getBinding(normalizedPlayerId);
        if (!existingBinding) {
            return;
        }
/** shouldBreakConnectedSessionReuse：定义该变量以承载业务值。 */
        const shouldBreakConnectedSessionReuse = existingBinding.connected === true
            && !this.shouldAllowConnectedSessionReuse(client);
/** shouldBreakDetachedResume：定义该变量以承载业务值。 */
        const shouldBreakDetachedResume = existingBinding.connected !== true
            && !this.shouldAllowImplicitDetachedResume(client);
        if (!shouldBreakConnectedSessionReuse && !shouldBreakDetachedResume) {
            return;
        }
        this.worldRuntimeService.removePlayer(normalizedPlayerId, shouldBreakConnectedSessionReuse ? 'replaced' : 'removed');
    }
/** bootstrapPlayerSession：执行对应的业务逻辑。 */
    async bootstrapPlayerSession(client, input) {
        this.rememberAuthenticatedBootstrapIdentity(client, input);
/** authenticatedBootstrapContractViolation：定义该变量以承载业务值。 */
        const authenticatedBootstrapContractViolation = this.resolveAuthenticatedBootstrapContractViolation(client, input);
        if (authenticatedBootstrapContractViolation) {
            throw new Error(authenticatedBootstrapContractViolation.stage);
        }
        this.prepareBootstrapRuntime(client, input.playerId);
/** binding：定义该变量以承载业务值。 */
        const binding = this.worldSessionService.registerSocket(client, input.playerId, input.requestedSessionId, {
            allowImplicitDetachedResume: this.shouldAllowImplicitDetachedResume(client),
            allowRequestedDetachedResume: this.shouldAllowRequestedDetachedResume(client),
            allowConnectedSessionReuse: this.shouldAllowConnectedSessionReuse(client),
        });
        client.data.playerId = binding.playerId;
        client.data.sessionId = binding.sessionId;
/** player：定义该变量以承载业务值。 */
        const player = await this.playerRuntimeService.loadOrCreatePlayer(binding.playerId, binding.sessionId, input.loadSnapshot);
        this.playerRuntimeService.setIdentity(binding.playerId, {
            name: input.name,
            displayName: input.displayName,
        });
        await this.mailRuntimeService.ensurePlayerMailbox(binding.playerId);
        await this.mailRuntimeService.ensureWelcomeMail(binding.playerId);
        this.worldRuntimeService.connectPlayer({
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            mapId: input.mapId ?? (player.templateId || undefined),
            preferredX: input.preferredX ?? (player.templateId ? player.x : undefined),
            preferredY: input.preferredY ?? (player.templateId ? player.y : undefined),
        });
        await this.deferInitialSyncEmission();
        this.worldSyncService.emitInitialSync(binding.playerId, client);
/** bootstrapRecovery：定义该变量以承载业务值。 */
        const bootstrapRecovery = this.emitAuthenticatedSnapshotRecoveryNotice(client, binding.playerId);
        this.worldClientEventService.emitSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
        await this.worldClientEventService.emitMailSummaryForPlayer(client, binding.playerId);
        this.worldClientEventService.emitPendingLogbookMessages(client, binding.playerId);
/** bootstrapEntryPath：定义该变量以承载业务值。 */
        const bootstrapEntryPath = this.resolveBootstrapEntryPath(client);
/** bootstrapIdentitySource：定义该变量以承载业务值。 */
        const bootstrapIdentitySource = this.resolveBootstrapIdentitySource(client);
/** bootstrapIdentityPersistedSource：定义该变量以承载业务值。 */
        const bootstrapIdentityPersistedSource = this.resolveBootstrapIdentityPersistedSource(client);
/** bootstrapSnapshotSource：定义该变量以承载业务值。 */
        const bootstrapSnapshotSource = this.resolveBootstrapSnapshotSource(client);
/** bootstrapSnapshotPersistedSource：定义该变量以承载业务值。 */
        const bootstrapSnapshotPersistedSource = this.resolveBootstrapSnapshotPersistedSource(client);
        this.logger.debug(`Bootstrap session ready: playerId=${binding.playerId} sessionId=${binding.sessionId} mapId=${player.templateId || input.mapId || 'unknown'} requestedSessionId=${input.requestedSessionId ?? ''} protocol=${client.data.protocol ?? 'unknown'} gm=${client.data.isGm === true} entryPath=${bootstrapEntryPath ?? 'unknown'} identitySource=${bootstrapIdentitySource ?? 'unknown'}`);
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'bootstrap',
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            mapId: player.templateId || input.mapId || 'unknown',
            requestedSessionId: input.requestedSessionId ?? null,
/** gm：定义该变量以承载业务值。 */
            gm: client.data.isGm === true,
            protocol: client.data.protocol ?? 'unknown',
            entryPath: bootstrapEntryPath,
            identitySource: bootstrapIdentitySource,
            identityPersistedSource: bootstrapIdentityPersistedSource,
            snapshotSource: bootstrapSnapshotSource,
            snapshotPersistedSource: bootstrapSnapshotPersistedSource,
            linkedIdentitySource: bootstrapIdentitySource,
            linkedSnapshotSource: bootstrapSnapshotSource,
            linkedSnapshotPersistedSource: bootstrapSnapshotPersistedSource,
            recoveryOutcome: bootstrapRecovery ? 'success' : null,
/** recoveryReason：定义该变量以承载业务值。 */
            recoveryReason: typeof bootstrapRecovery?.recoveryReason === 'string' ? bootstrapRecovery.recoveryReason : null,
/** recoveryIdentityPersistedSource：定义该变量以承载业务值。 */
            recoveryIdentityPersistedSource: typeof bootstrapRecovery?.identityPersistedSource === 'string' ? bootstrapRecovery.identityPersistedSource : null,
/** recoverySnapshotPersistedSource：定义该变量以承载业务值。 */
            recoverySnapshotPersistedSource: typeof bootstrapRecovery?.snapshotPersistedSource === 'string' ? bootstrapRecovery.snapshotPersistedSource : null,
        });
    }
/** loadPlayerSnapshot：执行对应的业务逻辑。 */
    async loadPlayerSnapshot(playerId, allowLegacyFallback) {
        return this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback);
    }
/** loadPlayerSnapshotWithTrace：执行对应的业务逻辑。 */
    async loadPlayerSnapshotWithTrace(playerId, allowLegacyFallback, fallbackReason = null) {
        if (this.worldPlayerSnapshotService?.loadPlayerSnapshotResult) {
            return this.worldPlayerSnapshotService.loadPlayerSnapshotResult(playerId, allowLegacyFallback, fallbackReason);
        }
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = await this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback, fallbackReason);
        return {
            snapshot,
            source: snapshot ? 'unknown' : 'miss',
            persistedSource: null,
            fallbackReason,
            seedPersisted: false,
        };
    }
/** resolveAuthenticatedLegacySnapshotFallback：执行对应的业务逻辑。 */
    resolveAuthenticatedLegacySnapshotFallback(identity, client = undefined) {
/** persistenceEnabled：定义该变量以承载业务值。 */
        const persistenceEnabled = this.worldPlayerSnapshotService.isPersistenceEnabled();
        if (persistenceEnabled && isStrictNativeSnapshotRequired()) {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'strict_native_snapshot_required',
            };
        }
/** protocol：定义该变量以承载业务值。 */
        const protocol = this.resolveClientProtocol(client);
/** authSource：定义该变量以承载业务值。 */
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (persistenceEnabled) {
            return {
                allowLegacyFallback: false,
                fallbackReason: authSource ? `persistence_enabled_blocked:${authSource}` : 'persistence_enabled_blocked:unknown',
            };
        }
        if (authSource === 'legacy_runtime' && protocol === 'next') {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'next_protocol_blocked:legacy_runtime',
            };
        }
        if (authSource === 'legacy_runtime') {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'runtime_compat_snapshot_disabled:legacy_runtime',
            };
        }
        return {
            allowLegacyFallback: false,
            fallbackReason: authSource ? `identity_source:${authSource}` : 'identity_source:unknown',
        };
    }
/** shouldAllowAuthenticatedLegacySnapshotFallback：执行对应的业务逻辑。 */
    shouldAllowAuthenticatedLegacySnapshotFallback(identity) {
        return this.resolveAuthenticatedLegacySnapshotFallback(identity).allowLegacyFallback;
    }
/** resolveAuthenticatedMissingSnapshotRecovery：执行对应的业务逻辑。 */
    resolveAuthenticatedMissingSnapshotRecovery(identity) {
        if (!this.worldPlayerSnapshotService.isPersistenceEnabled()) {
            return {
                allowNativeRecovery: false,
                recoveryReason: 'persistence_disabled',
            };
        }
        if (!isNativeSnapshotRecoveryEnabled()) {
            return {
                allowNativeRecovery: false,
                recoveryReason: 'native_snapshot_recovery_disabled',
            };
        }
/** authSource：定义该变量以承载业务值。 */
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (authSource !== 'next' && authSource !== 'token') {
            return {
                allowNativeRecovery: false,
                recoveryReason: authSource ? `auth_source:${authSource}` : 'auth_source:unknown',
            };
        }
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (!NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES.has(persistedSource)) {
            return {
                allowNativeRecovery: false,
                recoveryReason: persistedSource ? `persisted_source:${persistedSource}` : 'persisted_source:unknown',
            };
        }
        return {
            allowNativeRecovery: true,
            recoveryReason: `persisted_source:${persistedSource}`,
        };
    }
/** promoteAuthenticatedTokenSeedIdentity：执行对应的业务逻辑。 */
    async promoteAuthenticatedTokenSeedIdentity(identity, client) {
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource !== 'token_seed'
            || typeof this.worldPlayerAuthService?.promoteTokenSeedIdentityToNative !== 'function') {
            return identity;
        }
/** promotedIdentity：定义该变量以承载业务值。 */
        const promotedIdentity = await this.worldPlayerAuthService.promoteTokenSeedIdentityToNative(identity);
/** promotedPersistedSource：定义该变量以承载业务值。 */
        const promotedPersistedSource = typeof promotedIdentity?.persistedSource === 'string'
            ? promotedIdentity.persistedSource.trim()
            : '';
        if (promotedPersistedSource !== 'native') {
            return identity;
        }
        identity.persistedSource = promotedPersistedSource;
        identity.authSource = 'next';
        if (client?.data) {
            client.data.bootstrapIdentitySource = 'next';
            client.data.bootstrapIdentityPersistedSource = promotedPersistedSource;
        }
        return identity;
    }
/** loadAuthenticatedPlayerSnapshot：执行对应的业务逻辑。 */
    async loadAuthenticatedPlayerSnapshot(identity, client = undefined) {
        this.rememberBootstrapIdentityPersistedSource(client, identity?.persistedSource ?? null);
/** fallbackPolicy：定义该变量以承载业务值。 */
        const fallbackPolicy = this.resolveAuthenticatedLegacySnapshotFallback(identity, client);
/** snapshotResult：定义该变量以承载业务值。 */
        const snapshotResult = await this.loadPlayerSnapshotWithTrace(identity.playerId, fallbackPolicy.allowLegacyFallback, fallbackPolicy.fallbackReason);
        this.rememberBootstrapSnapshotContext(client, snapshotResult.source, snapshotResult.persistedSource);
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = snapshotResult.snapshot;
/** authSource：定义该变量以承载业务值。 */
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
/** identityPersistedSource：定义该变量以承载业务值。 */
        const identityPersistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
/** snapshotPersistedSource：定义该变量以承载业务值。 */
        const snapshotPersistedSource = typeof snapshotResult.persistedSource === 'string' ? snapshotResult.persistedSource.trim() : '';
/** shouldRememberPreseededRecovery：定义该变量以承载业务值。 */
        const shouldRememberPreseededRecovery = Boolean(snapshot)
            && authSource === 'token'
            && identityPersistedSource === 'token_seed'
            && snapshotPersistedSource === 'native';
        if (snapshot
            || !this.worldPlayerSnapshotService.isPersistenceEnabled()) {
            if (shouldRememberPreseededRecovery) {
                await this.promoteAuthenticatedTokenSeedIdentity(identity, client);
                this.rememberAuthenticatedSnapshotRecovery(client, {
                    identityPersistedSource,
                    snapshotPersistedSource,
                    recoveryReason: `persisted_source:${identityPersistedSource}`,
                });
            }
            else {
                this.clearAuthenticatedSnapshotRecovery(client);
            }
            return snapshot;
        }
/** recoveryPolicy：定义该变量以承载业务值。 */
        const recoveryPolicy = this.resolveAuthenticatedMissingSnapshotRecovery(identity);
        if (recoveryPolicy.allowNativeRecovery) {
/** recoveredSnapshot：定义该变量以承载业务值。 */
            const recoveredSnapshot = await this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(identity.playerId);
            if (recoveredSnapshot.ok && recoveredSnapshot.snapshot) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'snapshot_recovery',
                    playerId: identity.playerId,
/** authSource：定义该变量以承载业务值。 */
                    authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
/** identityPersistedSource：定义该变量以承载业务值。 */
                    identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                    outcome: 'success',
                    reason: recoveryPolicy.recoveryReason,
/** persistedSource：定义该变量以承载业务值。 */
                    persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                    failureStage: null,
                });
                await this.promoteAuthenticatedTokenSeedIdentity(identity, client);
                this.rememberAuthenticatedSnapshotRecovery(client, {
                    identityPersistedSource,
                    snapshotPersistedSource: recoveredSnapshot.persistedSource ?? null,
                    recoveryReason: recoveryPolicy.recoveryReason,
                });
                this.rememberBootstrapSnapshotContext(client, 'recovery_native', recoveredSnapshot.persistedSource ?? null);
                return recoveredSnapshot.snapshot;
            }
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'snapshot_recovery',
                playerId: identity.playerId,
/** authSource：定义该变量以承载业务值。 */
                authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
/** identityPersistedSource：定义该变量以承载业务值。 */
                identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                outcome: 'failure',
                reason: recoveryPolicy.recoveryReason,
/** persistedSource：定义该变量以承载业务值。 */
                persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                failureStage: recoveredSnapshot.failureStage ?? 'unknown',
            });
            this.clearAuthenticatedSnapshotRecovery(client);
            throw new Error(`Authenticated next player snapshot recovery failed while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason} stage=${recoveredSnapshot.failureStage ?? 'unknown'}`);
        }
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'snapshot_recovery',
            playerId: identity.playerId,
/** authSource：定义该变量以承载业务值。 */
            authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
/** identityPersistedSource：定义该变量以承载业务值。 */
            identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
            outcome: 'blocked',
            reason: recoveryPolicy.recoveryReason,
            persistedSource: null,
            failureStage: null,
        });
        this.clearAuthenticatedSnapshotRecovery(client);
        throw new Error(`Authenticated next player snapshot missing while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason}`);
    }
};
exports.WorldSessionBootstrapService = WorldSessionBootstrapService;
exports.WorldSessionBootstrapService = WorldSessionBootstrapService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_player_auth_service_1.WorldPlayerAuthService,
        world_player_snapshot_service_1.WorldPlayerSnapshotService,
        world_gm_auth_service_1.WorldGmAuthService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService,
        world_client_event_service_1.WorldClientEventService])
], WorldSessionBootstrapService);
//# sourceMappingURL=world-session-bootstrap.service.js.map

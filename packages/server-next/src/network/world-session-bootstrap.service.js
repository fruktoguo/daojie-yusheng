"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionBootstrapService = void 0;
const common_1 = require("@nestjs/common");
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_gm_auth_service_1 = require("./world-gm-auth.service");
const world_player_auth_service_1 = require("./world-player-auth.service");
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
const world_session_service_1 = require("./world-session.service");
const world_sync_service_1 = require("./world-sync.service");
const world_client_event_service_1 = require("./world-client-event.service");
const world_player_token_service_1 = require("./world-player-token.service");
const STRICT_NATIVE_SNAPSHOT_ENV_KEYS = [
    'SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
    'NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT',
];
const NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS = [
    'SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
    'NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY',
];
const NATIVE_SNAPSHOT_RECOVERY_IDENTITY_SOURCES = new Set([
    'token_seed',
]);
const MAX_REQUESTED_SESSION_ID_LENGTH = 128;
const REQUESTED_SESSION_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;
const IMPLICIT_DETACHED_RESUME_AUTH_SOURCES = new Set([
    'next',
    'token',
]);
const AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS = new Set([
    'connect_token',
    'connect_gm_token',
]);
const AUTHENTICATED_NEXT_REUSE_PERSISTED_SOURCES = new Set([
    'native',
    'legacy_sync',
]);
const AUTHENTICATED_TOKEN_REUSE_PERSISTED_SOURCES = new Set([
    'token_seed',
]);
const NEXT_BOOTSTRAP_ALLOWED_IDENTITY_SOURCES = new Set([
    'next',
    'token',
]);
const NEXT_BOOTSTRAP_ALLOWED_NEXT_PERSISTED_SOURCES = new Set([
    'native',
    'legacy_sync',
]);
function isStrictNativeSnapshotRequired() {
    for (const key of STRICT_NATIVE_SNAPSHOT_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
function isNativeSnapshotRecoveryEnabled() {
    for (const key of NATIVE_SNAPSHOT_RECOVERY_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
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
    pickSocketToken(client) {
        const token = client.handshake?.auth?.token;
        return typeof token === 'string' ? token.trim() : '';
    }
    pickSocketGmToken(client) {
        const token = client.handshake?.auth?.gmToken;
        return typeof token === 'string' ? token.trim() : '';
    }
    inspectRequestedSessionId(rawSessionId, client, source = 'socket') {
        if (typeof rawSessionId !== 'string') {
            return {
                sessionId: '',
                error: null,
            };
        }
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
    inspectSocketRequestedSessionId(client) {
        return this.inspectRequestedSessionId(client.handshake?.auth?.sessionId, client, 'socket');
    }
    pickSocketRequestedSessionId(client) {
        return this.inspectSocketRequestedSessionId(client).sessionId;
    }
    authenticateSocketToken(token, options = undefined) {
        return this.worldPlayerAuthService.authenticatePlayerToken(token, options);
    }
    authenticateSocketGmToken(token) {
        return this.worldGmAuthService.validateSocketGmToken(token);
    }
    resolveBootstrapEntryPath(client) {
        const entryPath = client?.data?.bootstrapEntryPath;
        return typeof entryPath === 'string' && entryPath.trim() ? entryPath.trim() : null;
    }
    resolveBootstrapIdentitySource(client) {
        const identitySource = client?.data?.bootstrapIdentitySource;
        return typeof identitySource === 'string' && identitySource.trim() ? identitySource.trim() : null;
    }
    resolveBootstrapIdentityPersistedSource(client) {
        const identityPersistedSource = client?.data?.bootstrapIdentityPersistedSource;
        return typeof identityPersistedSource === 'string' && identityPersistedSource.trim() ? identityPersistedSource.trim() : null;
    }
    resolveBootstrapSnapshotSource(client) {
        const snapshotSource = client?.data?.bootstrapSnapshotSource;
        return typeof snapshotSource === 'string' && snapshotSource.trim() ? snapshotSource.trim() : null;
    }
    resolveBootstrapSnapshotPersistedSource(client) {
        const snapshotPersistedSource = client?.data?.bootstrapSnapshotPersistedSource;
        return typeof snapshotPersistedSource === 'string' && snapshotPersistedSource.trim() ? snapshotPersistedSource.trim() : null;
    }
    resolveClientProtocol(client) {
        const protocol = client?.data?.protocol;
        return typeof protocol === 'string' && protocol.trim() ? protocol.trim().toLowerCase() : null;
    }
    resolveAuthenticatedBootstrapIdentitySource(client, input = undefined) {
        const authSource = typeof input?.authSource === 'string' ? input.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
        return this.resolveBootstrapIdentitySource(client);
    }
    resolveAuthenticatedBootstrapIdentityPersistedSource(client, input = undefined) {
        const persistedSource = typeof input?.persistedSource === 'string' ? input.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
        return this.resolveBootstrapIdentityPersistedSource(client);
    }
    rememberAuthenticatedBootstrapIdentity(client, input = undefined) {
        if (!client?.data
            || !input
            || (typeof input?.authSource !== 'string' && typeof input?.persistedSource !== 'string')) {
            return;
        }
        client.data.bootstrapIdentitySource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
        client.data.bootstrapIdentityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client, input);
    }
    resolveAuthenticatedBootstrapContractViolation(client, input = undefined) {
        const entryPath = this.resolveBootstrapEntryPath(client);
        if (!AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS.has(entryPath ?? '')) {
            return null;
        }
        const protocol = this.resolveClientProtocol(client);
        if (protocol !== 'next') {
            return null;
        }
        const authSource = this.resolveAuthenticatedBootstrapIdentitySource(client, input);
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
    resolveBootstrapSessionReusePolicy(client) {
        if (client?.data?.isGm === true) {
            return {
                allowImplicitDetachedResume: false,
                allowRequestedDetachedResume: false,
                allowConnectedSessionReuse: false,
            };
        }
        const entryPath = this.resolveBootstrapEntryPath(client);
        const identitySource = this.resolveAuthenticatedBootstrapIdentitySource(client);
        const identityPersistedSource = this.resolveAuthenticatedBootstrapIdentityPersistedSource(client);
        const effectiveIdentitySource = identitySource === 'next' && identityPersistedSource === 'token_seed'
            ? 'token'
            : identitySource;
        if (AUTHENTICATED_BOOTSTRAP_ENTRY_PATHS.has(entryPath ?? '')) {
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
    rememberBootstrapIdentityPersistedSource(client, identityPersistedSource) {
        if (!client?.data) {
            return;
        }
        client.data.bootstrapIdentityPersistedSource = typeof identityPersistedSource === 'string' && identityPersistedSource.trim()
            ? identityPersistedSource.trim()
            : null;
    }
    shouldAllowImplicitDetachedResume(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowImplicitDetachedResume;
    }
    shouldAllowConnectedSessionReuse(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowConnectedSessionReuse;
    }
    shouldAllowRequestedDetachedResume(client) {
        return this.resolveBootstrapSessionReusePolicy(client).allowRequestedDetachedResume;
    }
    clearAuthenticatedSnapshotRecovery(client) {
        if (!client?.data) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = null;
    }
    rememberAuthenticatedSnapshotRecovery(client, recovery) {
        if (!client?.data || !recovery) {
            return;
        }
        client.data.authenticatedSnapshotRecovery = recovery;
    }
    consumeAuthenticatedSnapshotRecovery(client) {
        const recovery = client?.data?.authenticatedSnapshotRecovery ?? null;
        if (client?.data) {
            client.data.authenticatedSnapshotRecovery = null;
        }
        return recovery && typeof recovery === 'object' ? recovery : null;
    }
    buildAuthenticatedSnapshotRecoveryMessage(recovery) {
        const identityPersistedSource = typeof recovery?.identityPersistedSource === 'string' ? recovery.identityPersistedSource.trim() : '';
        if (identityPersistedSource === 'token_seed') {
            return '检测到你是首次以 next 真源入场，角色数据已自动补齐为初始快照。';
        }
        return '检测到角色快照缺失，已自动补齐为 next 初始快照。';
    }
    emitAuthenticatedSnapshotRecoveryNotice(client, playerId) {
        const recovery = this.consumeAuthenticatedSnapshotRecovery(client);
        if (!recovery) {
            return null;
        }
        const message = this.buildAuthenticatedSnapshotRecoveryMessage(recovery);
        this.playerRuntimeService.queuePendingLogbookMessage(playerId, {
            id: `snapshot_recovery:${playerId}:${typeof recovery.identityPersistedSource === 'string' ? recovery.identityPersistedSource : 'unknown'}`,
            kind: 'system',
            text: message,
            from: 'system',
            at: Date.now(),
        });
        return recovery;
    }
    async deferInitialSyncEmission() {
        await new Promise((resolve) => setImmediate(resolve));
    }
    prepareBootstrapRuntime(client, playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        const existingBinding = this.worldSessionService.getBinding(normalizedPlayerId);
        if (!existingBinding) {
            return;
        }
        const shouldBreakConnectedSessionReuse = existingBinding.connected === true
            && !this.shouldAllowConnectedSessionReuse(client);
        const shouldBreakDetachedResume = existingBinding.connected !== true
            && !this.shouldAllowImplicitDetachedResume(client);
        if (!shouldBreakConnectedSessionReuse && !shouldBreakDetachedResume) {
            return;
        }
        this.worldRuntimeService.removePlayer(normalizedPlayerId, shouldBreakConnectedSessionReuse ? 'replaced' : 'removed');
    }
    async bootstrapPlayerSession(client, input) {
        this.rememberAuthenticatedBootstrapIdentity(client, input);
        const authenticatedBootstrapContractViolation = this.resolveAuthenticatedBootstrapContractViolation(client, input);
        if (authenticatedBootstrapContractViolation) {
            throw new Error(authenticatedBootstrapContractViolation.stage);
        }
        this.prepareBootstrapRuntime(client, input.playerId);
        const binding = this.worldSessionService.registerSocket(client, input.playerId, input.requestedSessionId, {
            allowImplicitDetachedResume: this.shouldAllowImplicitDetachedResume(client),
            allowRequestedDetachedResume: this.shouldAllowRequestedDetachedResume(client),
            allowConnectedSessionReuse: this.shouldAllowConnectedSessionReuse(client),
        });
        client.data.playerId = binding.playerId;
        client.data.sessionId = binding.sessionId;
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
        const bootstrapRecovery = this.emitAuthenticatedSnapshotRecoveryNotice(client, binding.playerId);
        this.worldClientEventService.emitSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
        await this.worldClientEventService.emitMailSummaryForPlayer(client, binding.playerId);
        this.worldClientEventService.emitPendingLogbookMessages(client, binding.playerId);
        const bootstrapEntryPath = this.resolveBootstrapEntryPath(client);
        const bootstrapIdentitySource = this.resolveBootstrapIdentitySource(client);
        const bootstrapIdentityPersistedSource = this.resolveBootstrapIdentityPersistedSource(client);
        const bootstrapSnapshotSource = this.resolveBootstrapSnapshotSource(client);
        const bootstrapSnapshotPersistedSource = this.resolveBootstrapSnapshotPersistedSource(client);
        this.logger.debug(`Bootstrap session ready: playerId=${binding.playerId} sessionId=${binding.sessionId} mapId=${player.templateId || input.mapId || 'unknown'} requestedSessionId=${input.requestedSessionId ?? ''} protocol=${client.data.protocol ?? 'unknown'} gm=${client.data.isGm === true} entryPath=${bootstrapEntryPath ?? 'unknown'} identitySource=${bootstrapIdentitySource ?? 'unknown'}`);
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'bootstrap',
            playerId: binding.playerId,
            sessionId: binding.sessionId,
            mapId: player.templateId || input.mapId || 'unknown',
            requestedSessionId: input.requestedSessionId ?? null,
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
            recoveryReason: typeof bootstrapRecovery?.recoveryReason === 'string' ? bootstrapRecovery.recoveryReason : null,
            recoveryIdentityPersistedSource: typeof bootstrapRecovery?.identityPersistedSource === 'string' ? bootstrapRecovery.identityPersistedSource : null,
            recoverySnapshotPersistedSource: typeof bootstrapRecovery?.snapshotPersistedSource === 'string' ? bootstrapRecovery.snapshotPersistedSource : null,
        });
    }
    async loadPlayerSnapshot(playerId, allowLegacyFallback) {
        return this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback);
    }
    async loadPlayerSnapshotWithTrace(playerId, allowLegacyFallback, fallbackReason = null) {
        if (this.worldPlayerSnapshotService?.loadPlayerSnapshotResult) {
            return this.worldPlayerSnapshotService.loadPlayerSnapshotResult(playerId, allowLegacyFallback, fallbackReason);
        }
        const snapshot = await this.worldPlayerSnapshotService.loadPlayerSnapshot(playerId, allowLegacyFallback, fallbackReason);
        return {
            snapshot,
            source: snapshot ? 'unknown' : 'miss',
            persistedSource: null,
            fallbackReason,
            seedPersisted: false,
        };
    }
    resolveAuthenticatedLegacySnapshotFallback(identity, client = undefined) {
        const persistenceEnabled = this.worldPlayerSnapshotService.isPersistenceEnabled();
        if (persistenceEnabled && isStrictNativeSnapshotRequired()) {
            return {
                allowLegacyFallback: false,
                fallbackReason: 'strict_native_snapshot_required',
            };
        }
        const protocol = this.resolveClientProtocol(client);
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
    shouldAllowAuthenticatedLegacySnapshotFallback(identity) {
        return this.resolveAuthenticatedLegacySnapshotFallback(identity).allowLegacyFallback;
    }
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
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (authSource !== 'next' && authSource !== 'token') {
            return {
                allowNativeRecovery: false,
                recoveryReason: authSource ? `auth_source:${authSource}` : 'auth_source:unknown',
            };
        }
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
    async promoteAuthenticatedTokenSeedIdentity(identity, client) {
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource !== 'token_seed'
            || typeof this.worldPlayerAuthService?.promoteTokenSeedIdentityToNative !== 'function') {
            return identity;
        }
        const promotedIdentity = await this.worldPlayerAuthService.promoteTokenSeedIdentityToNative(identity);
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
    async loadAuthenticatedPlayerSnapshot(identity, client = undefined) {
        this.rememberBootstrapIdentityPersistedSource(client, identity?.persistedSource ?? null);
        const fallbackPolicy = this.resolveAuthenticatedLegacySnapshotFallback(identity, client);
        const snapshotResult = await this.loadPlayerSnapshotWithTrace(identity.playerId, fallbackPolicy.allowLegacyFallback, fallbackPolicy.fallbackReason);
        this.rememberBootstrapSnapshotContext(client, snapshotResult.source, snapshotResult.persistedSource);
        const snapshot = snapshotResult.snapshot;
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        const identityPersistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        const snapshotPersistedSource = typeof snapshotResult.persistedSource === 'string' ? snapshotResult.persistedSource.trim() : '';
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
        const recoveryPolicy = this.resolveAuthenticatedMissingSnapshotRecovery(identity);
        if (recoveryPolicy.allowNativeRecovery) {
            const recoveredSnapshot = await this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(identity.playerId);
            if (recoveredSnapshot.ok && recoveredSnapshot.snapshot) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'snapshot_recovery',
                    playerId: identity.playerId,
                    authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
                    identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                    outcome: 'success',
                    reason: recoveryPolicy.recoveryReason,
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
                authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
                identityPersistedSource: typeof identity?.persistedSource === 'string' ? identity.persistedSource : null,
                outcome: 'failure',
                reason: recoveryPolicy.recoveryReason,
                persistedSource: typeof recoveredSnapshot.persistedSource === 'string' ? recoveredSnapshot.persistedSource : null,
                failureStage: recoveredSnapshot.failureStage ?? 'unknown',
            });
            this.clearAuthenticatedSnapshotRecovery(client);
            throw new Error(`Authenticated next player snapshot recovery failed while persistence is enabled: playerId=${identity.playerId} recoveryReason=${recoveryPolicy.recoveryReason} stage=${recoveredSnapshot.failureStage ?? 'unknown'}`);
        }
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'snapshot_recovery',
            playerId: identity.playerId,
            authSource: typeof identity?.authSource === 'string' ? identity.authSource : null,
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

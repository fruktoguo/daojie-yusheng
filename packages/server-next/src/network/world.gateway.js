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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WorldGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const socket_io_1 = require("socket.io");
const movement_debug_1 = require("../debug/movement-debug");
const health_readiness_service_1 = require("../health/health-readiness.service");
const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
const market_runtime_service_1 = require("../runtime/market/market-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_client_event_service_1 = require("./world-client-event.service");
const world_gm_socket_service_1 = require("./world-gm-socket.service");
const world_protocol_projection_service_1 = require("./world-protocol-projection.service");
const world_session_bootstrap_service_1 = require("./world-session-bootstrap.service");
const world_session_service_1 = require("./world-session.service");
const AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES = new Set([
    'next',
    'token',
]);
let WorldGateway = WorldGateway_1 = class WorldGateway {
    worldGmSocketService;
    worldProtocolProjectionService;
    sessionBootstrapService;
    healthReadinessService;
    playerPersistenceFlushService;
    playerRuntimeService;
    mailRuntimeService;
    marketRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    worldClientEventService;
    worldSessionService;
    server;
    logger = new common_1.Logger(WorldGateway_1.name);
    marketSubscriberPlayerIds = new Set();
    constructor(worldGmSocketService, worldProtocolProjectionService, sessionBootstrapService, healthReadinessService, playerPersistenceFlushService, playerRuntimeService, mailRuntimeService, marketRuntimeService, suggestionRuntimeService, worldRuntimeService, worldClientEventService, worldSessionService) {
        this.worldGmSocketService = worldGmSocketService;
        this.worldProtocolProjectionService = worldProtocolProjectionService;
        this.sessionBootstrapService = sessionBootstrapService;
        this.healthReadinessService = healthReadinessService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldClientEventService = worldClientEventService;
        this.worldSessionService = worldSessionService;
    }
    setBootstrapTraceContext(client, entryPath, identity) {
        client.data.bootstrapEntryPath = entryPath;
        client.data.bootstrapIdentitySource = identity?.authSource ?? null;
        client.data.bootstrapIdentityPersistedSource = identity?.persistedSource ?? null;
        client.data.bootstrapSnapshotSource = null;
        client.data.bootstrapSnapshotPersistedSource = null;
    }
    resolveBootstrapPromise(client) {
        const promise = client?.data?.bootstrapPromise;
        return promise && typeof promise.then === 'function' ? promise : null;
    }
    rememberBootstrapPromise(client, promise) {
        client.data.bootstrapPromise = promise;
        promise.finally(() => {
            if (client.data.bootstrapPromise === promise) {
                client.data.bootstrapPromise = null;
            }
        }).catch(() => undefined);
        return promise;
    }
    async awaitPendingBootstrap(client) {
        const deadline = Date.now() + 1000;
        while (Date.now() <= deadline) {
            const promise = this.resolveBootstrapPromise(client);
            if (promise) {
                await promise;
                return true;
            }
            if (typeof client?.data?.playerId === 'string' && client.data.playerId.trim()) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const promise = this.resolveBootstrapPromise(client);
        if (promise) {
            await promise;
            return true;
        }
        return typeof client?.data?.playerId === 'string' && client.data.playerId.trim().length > 0;
    }
    hasSocketAuthHint(client) {
        return this.sessionBootstrapService.pickSocketToken(client).length > 0
            || this.sessionBootstrapService.pickSocketGmToken(client).length > 0;
    }
    resolveSocketProtocol(client) {
        const protocol = client?.data?.protocol;
        return typeof protocol === 'string' ? protocol.trim().toLowerCase() : '';
    }
    isLegacySocketProtocolEnabled() {
        return readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL')
            || readBooleanEnv('NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL');
    }
    markLegacyProtocolIfAllowed(client, source) {
        const protocol = this.resolveSocketProtocol(client);
        if (protocol === 'next') {
            this.worldClientEventService.emitError(client, 'LEGACY_EVENT_ON_NEXT_PROTOCOL', `next 协议连接禁止 legacy 事件: ${source}`);
            this.logger.warn(`Rejected legacy protocol downgrade on next socket: source=${source} socket=${client.id}`);
            return false;
        }
        if (protocol === 'legacy' && !this.isLegacySocketProtocolEnabled()) {
            this.worldClientEventService.emitError(client, 'LEGACY_PROTOCOL_DISABLED', `legacy socket 协议默认关闭: ${source}`);
            this.logger.warn(`Rejected disabled legacy protocol entry: source=${source} socket=${client.id}`);
            client.disconnect(true);
            return false;
        }
        if (protocol !== 'legacy') {
            this.worldClientEventService.emitError(client, 'LEGACY_PROTOCOL_REQUIRED', `legacy 事件必须通过 legacy 握手连接: ${source}`);
            this.logger.warn(`Rejected implicit legacy protocol entry: source=${source} socket=${client.id}`);
            client.disconnect(true);
            return false;
        }
        this.worldClientEventService.markProtocol(client, 'legacy');
        return true;
    }
    resolveAuthenticatedBootstrapEntryPath(client) {
        return client?.data?.isGm === true ? 'connect_gm_token' : 'connect_token';
    }
    resolveAuthenticatedIdentitySource(client, identity) {
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
        const bootstrapIdentitySource = typeof client?.data?.bootstrapIdentitySource === 'string'
            ? client.data.bootstrapIdentitySource.trim()
            : '';
        return bootstrapIdentitySource;
    }
    resolveAuthenticatedIdentityPersistedSource(client, identity) {
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
        const bootstrapIdentityPersistedSource = typeof client?.data?.bootstrapIdentityPersistedSource === 'string'
            ? client.data.bootstrapIdentityPersistedSource.trim()
            : '';
        return bootstrapIdentityPersistedSource;
    }
    resolveAuthenticatedRequestedSessionId(client, identity) {
        const requestedSessionId = this.sessionBootstrapService.pickSocketRequestedSessionId(client);
        if (!requestedSessionId) {
            return undefined;
        }
        if (client?.data?.isGm === true) {
            this.logger.warn(`Ignored requested sessionId on GM bootstrap: socket=${client.id} sessionId=${requestedSessionId}`);
            return undefined;
        }
        const authSource = this.resolveAuthenticatedIdentitySource(client, identity);
        if (!AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES.has(authSource)) {
            this.logger.warn(`Ignored requested sessionId on authenticated bootstrap: socket=${client.id} authSource=${authSource || 'unknown'} sessionId=${requestedSessionId}`);
            return undefined;
        }
        if (!this.sessionBootstrapService.shouldAllowRequestedDetachedResume(client)) {
            this.logger.warn(`Ignored requested sessionId on authenticated bootstrap due to reuse policy: socket=${client.id} authSource=${authSource || 'unknown'} sessionId=${requestedSessionId}`);
            return undefined;
        }
        return requestedSessionId;
    }
    buildAuthenticatedBootstrapInput(client, identity) {
        return {
            playerId: identity.playerId,
            requestedSessionId: this.resolveAuthenticatedRequestedSessionId(client, identity),
            authSource: this.resolveAuthenticatedIdentitySource(client, identity),
            persistedSource: this.resolveAuthenticatedIdentityPersistedSource(client, identity),
            name: identity.playerName,
            displayName: identity.displayName,
            mapId: undefined,
            preferredX: undefined,
            preferredY: undefined,
            loadSnapshot: () => this.sessionBootstrapService.loadAuthenticatedPlayerSnapshot(identity, client),
        };
    }
    startAuthenticatedBootstrap(client, entryPath, identity) {
        const existing = this.resolveBootstrapPromise(client);
        if (existing) {
            return existing;
        }
        this.setBootstrapTraceContext(client, entryPath, identity);
        client.data.authenticatedSnapshotRecovery = null;
        const promise = (async () => {
            await this.sessionBootstrapService.bootstrapPlayerSession(client, this.buildAuthenticatedBootstrapInput(client, identity));
            client.data.userId = identity.userId;
        })();
        return this.rememberBootstrapPromise(client, promise);
    }
    resolveGuestDetachedBinding(payloadSessionId) {
        return this.worldSessionService.getDetachedBindingBySessionId(payloadSessionId);
    }
    buildGuestHelloBootstrapInput(client, payload) {
        const detachedBinding = this.resolveGuestDetachedBinding(payload?.sessionId);
        const guestDetachedBinding = detachedBinding && this.worldSessionService.isGuestPlayerId(detachedBinding.playerId)
            ? detachedBinding
            : null;
        if (detachedBinding && !guestDetachedBinding) {
            this.logger.warn(`Rejected guest hello detached resume for non-guest binding: socket=${client.id} playerId=${detachedBinding.playerId} sessionId=${detachedBinding.sessionId}`);
        }
        const playerId = guestDetachedBinding?.playerId
            ?? this.worldSessionService.createGuestPlayerId();
        const mapId = guestDetachedBinding ? undefined : payload.mapId;
        const preferredX = guestDetachedBinding ? undefined : payload.preferredX;
        const preferredY = guestDetachedBinding ? undefined : payload.preferredY;
        return {
            playerId,
            requestedSessionId: guestDetachedBinding?.sessionId,
            mapId,
            preferredX,
            preferredY,
            loadSnapshot: () => this.sessionBootstrapService.loadPlayerSnapshot(playerId, false),
        };
    }
    async handleGuestHello(client, payload) {
        this.setBootstrapTraceContext(client, 'hello_guest', null);
        await this.sessionBootstrapService.bootstrapPlayerSession(client, this.buildGuestHelloBootstrapInput(client, payload));
    }
    async resolveBootstrapAuthContext(client, options = undefined) {
        const allowGuest = options?.allowGuest === true;
        const token = this.sessionBootstrapService.pickSocketToken(client);
        const gmToken = this.sessionBootstrapService.pickSocketGmToken(client);
        const requestedSessionInspection = this.sessionBootstrapService.inspectSocketRequestedSessionId(client);
        const protocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if ((token || gmToken)
            && protocol === 'next'
            && requestedSessionInspection.error) {
            this.worldClientEventService.emitError(client, 'AUTH_SESSION_ID_INVALID', 'next 认证握手 sessionId 非法');
            client.disconnect(true);
            return null;
        }
        if (protocol === 'legacy' && token) {
            this.worldClientEventService.emitError(client, 'AUTH_PROTOCOL_MISMATCH', 'legacy 握手连接不支持 token bootstrap');
            client.disconnect(true);
            return null;
        }
        if (gmToken) {
            if (protocol === 'legacy') {
                this.worldClientEventService.emitError(client, 'GM_PROTOCOL_MISMATCH', 'legacy 握手连接不支持 GM token bootstrap');
                client.disconnect(true);
                return null;
            }
            if (!this.sessionBootstrapService.authenticateSocketGmToken(gmToken)) {
                this.worldClientEventService.emitError(client, 'GM_AUTH_FAIL', 'GM 认证失败');
                client.disconnect(true);
                return null;
            }
            if (!token) {
                this.worldClientEventService.emitError(client, 'GM_PLAYER_AUTH_REQUIRED', 'GM socket 需要同时提供玩家登录令牌');
                client.disconnect(true);
                return null;
            }
            client.data.isGm = true;
            client.data.gmRole = 'gm';
        }
        if (!token) {
            return allowGuest
                ? {
                    identity: null,
                }
                : null;
        }
        const identity = await this.sessionBootstrapService.authenticateSocketToken(token, {
            protocol,
        });
        if (!identity) {
            this.worldClientEventService.emitError(client, 'AUTH_FAIL', '认证失败');
            client.disconnect(true);
            return null;
        }
        if (protocol === 'next'
            && identity.authSource !== 'next'
            && identity.authSource !== 'token') {
            this.worldClientEventService.emitError(client, 'AUTH_FAIL', 'NEXT 协议仅允许 next 真源身份');
            client.disconnect(true);
            return null;
        }
        const authenticatedBootstrapContractViolation = this.sessionBootstrapService.resolveAuthenticatedBootstrapContractViolation(client, {
            authSource: this.resolveAuthenticatedIdentitySource(client, identity),
            persistedSource: this.resolveAuthenticatedIdentityPersistedSource(client, identity),
        });
        if (authenticatedBootstrapContractViolation) {
            this.worldClientEventService.emitError(client, 'AUTH_FAIL', authenticatedBootstrapContractViolation.message);
            client.disconnect(true);
            return null;
        }
        return { identity };
    }
    async handleConnection(client) {
        this.logger.debug(`Socket connected: ${client.id}`);
        const handshakeProtocol = typeof client.handshake?.auth?.protocol === 'string'
            ? client.handshake.auth.protocol.trim().toLowerCase()
            : '';
        const hasAuthHint = this.hasSocketAuthHint(client);
        if (handshakeProtocol === 'next') {
            this.worldClientEventService.markProtocol(client, handshakeProtocol);
        }
        else if (handshakeProtocol === 'legacy') {
            this.worldClientEventService.markProtocol(client, handshakeProtocol);
            if (!this.isLegacySocketProtocolEnabled()) {
                this.worldClientEventService.emitError(client, 'LEGACY_PROTOCOL_DISABLED', 'legacy socket 协议默认关闭，仅兼容环境可显式开启');
                client.disconnect(true);
                return;
            }
        }
        else if (handshakeProtocol && hasAuthHint) {
            this.worldClientEventService.emitError(client, 'AUTH_PROTOCOL_UNSUPPORTED', `不支持的握手协议: ${handshakeProtocol}`);
            client.disconnect(true);
            return;
        }
        else if (!handshakeProtocol && hasAuthHint) {
            this.worldClientEventService.emitError(client, 'AUTH_PROTOCOL_REQUIRED', 'token/gmToken 连接必须声明握手协议');
            client.disconnect(true);
            return;
        }
        if (this.rejectWhenNotReady(client)) {
            return;
        }
        if (typeof client.data.playerId === 'string') {
            return;
        }
        try {
            const authContext = await this.resolveBootstrapAuthContext(client);
            if (!authContext?.identity) {
                return;
            }
            const { identity } = authContext;
            void this.startAuthenticatedBootstrap(client, this.resolveAuthenticatedBootstrapEntryPath(client), identity).catch((error) => {
                this.worldClientEventService.emitGatewayError(client, 'AUTH_FAIL', error);
                client.disconnect(true);
            });
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'AUTH_FAIL', error);
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        const binding = this.worldSessionService.unregisterSocket(client.id);
        if (!binding) {
            return;
        }
        if (binding.connected) {
            return;
        }
        this.marketSubscriberPlayerIds.delete(binding.playerId);
        this.playerRuntimeService.detachSession(binding.playerId);
        await this.playerPersistenceFlushService.flushPlayer(binding.playerId).catch((error) => {
            this.logger.error(`Flush detached player failed: ${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.logger.debug(`Socket detached: ${client.id} -> ${binding.playerId}, expiresAt=${binding.expireAt}`);
    }
    async handleHello(client, payload) {
        const currentProtocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if (currentProtocol === 'legacy') {
            this.worldClientEventService.emitError(client, 'HELLO_PROTOCOL_MISMATCH', 'legacy 握手连接不能进入 next hello 链路');
            client.disconnect(true);
            return;
        }
        if (currentProtocol && currentProtocol !== 'next') {
            this.worldClientEventService.emitError(client, 'HELLO_PROTOCOL_UNSUPPORTED', `不支持的 hello 协议上下文: ${currentProtocol}`);
            client.disconnect(true);
            return;
        }
        this.worldClientEventService.markProtocol(client, 'next');
        try {
            if (this.rejectWhenNotReady(client)) {
                return;
            }
            if (typeof client.data.playerId === 'string' && client.data.playerId.trim()) {
                return;
            }
            if (this.hasSocketAuthHint(client)) {
                const waited = await this.awaitPendingBootstrap(client);
                if (waited) {
                    return;
                }
                this.worldClientEventService.emitError(client, 'HELLO_AUTH_BOOTSTRAP_FORBIDDEN', 'token/gmToken 连接只允许 connect 阶段 bootstrap');
                this.logger.warn(`Rejected token hello bootstrap fallback: socket=${client.id} protocol=${this.resolveSocketProtocol(client) || 'unknown'}`);
                client.disconnect(true);
                return;
            }
            const requestedSessionInspection = this.sessionBootstrapService.inspectRequestedSessionId(payload?.sessionId, client, 'hello');
            if (requestedSessionInspection.error) {
                this.worldClientEventService.emitError(client, 'HELLO_SESSION_ID_INVALID', 'hello 请求 sessionId 非法');
                client.disconnect(true);
                return;
            }
            await this.handleGuestHello(client, payload);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'HELLO_FAILED', error);
        }
    }
    handleLegacyHeartbeat(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_heartbeat')) {
            return;
        }
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
    }
    handleNextHeartbeat(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
    }
    handleLegacyPing(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_ping')) {
            return;
        }
        this.worldClientEventService.emitPong(client, payload);
    }
    rejectWhenNotReady(client) {
        if (readBooleanEnv('SERVER_NEXT_ALLOW_UNREADY_TRAFFIC') || readBooleanEnv('SERVER_NEXT_SMOKE_ALLOW_UNREADY')) {
            return false;
        }
        const health = this.healthReadinessService.build();
        if (health.readiness.ok) {
            return false;
        }
        const isMaintenance = health.readiness.maintenance?.active === true;
        this.worldClientEventService.emitError(client, isMaintenance ? 'SERVER_BUSY' : 'SERVER_NOT_READY', isMaintenance ? '数据库维护中，请稍后重连' : '服务未就绪，请稍后重连');
        client.disconnect(true);
        return true;
    }
    handleLegacyGmGetState(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_get_state')) {
            return;
        }
        this.handleGmGetState(client, _payload);
    }
    handleNextGmGetState(client, _payload) {
        this.handleGmGetState(client, _payload);
    }
    handleGmGetState(client, _payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        this.worldGmSocketService.emitState(client);
    }
    handleLegacyGmSpawnBots(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_spawn_bots')) {
            return;
        }
        this.handleGmSpawnBots(client, payload);
    }
    handleNextGmSpawnBots(client, payload) {
        this.handleGmSpawnBots(client, payload);
    }
    handleGmSpawnBots(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldGmSocketService.enqueueSpawnBots(playerId, payload?.count);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_SPAWN_BOTS_FAILED', error);
        }
    }
    handleLegacyGmRemoveBots(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_remove_bots')) {
            return;
        }
        this.handleGmRemoveBots(client, payload);
    }
    handleNextGmRemoveBots(client, payload) {
        this.handleGmRemoveBots(client, payload);
    }
    handleGmRemoveBots(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldGmSocketService.enqueueRemoveBots(playerId, payload?.playerIds, payload?.all);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_REMOVE_BOTS_FAILED', error);
        }
    }
    handleLegacyGmUpdatePlayer(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_update_player')) {
            return;
        }
        this.handleGmUpdatePlayer(client, payload);
    }
    handleNextGmUpdatePlayer(client, payload) {
        this.handleGmUpdatePlayer(client, payload);
    }
    handleGmUpdatePlayer(client, payload) {
        const requesterPlayerId = this.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.worldGmSocketService.enqueueUpdatePlayer(requesterPlayerId, payload);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_UPDATE_PLAYER_FAILED', error);
        }
    }
    handleLegacyGmResetPlayer(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_reset_player')) {
            return;
        }
        this.handleGmResetPlayer(client, payload);
    }
    handleNextGmResetPlayer(client, payload) {
        this.handleGmResetPlayer(client, payload);
    }
    handleGmResetPlayer(client, payload) {
        const requesterPlayerId = this.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.worldGmSocketService.enqueueResetPlayer(requesterPlayerId, payload?.playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_RESET_PLAYER_FAILED', error);
        }
    }
    handleLegacyMove(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_move')) {
            return;
        }
        this.handleMove(client, payload);
    }
    handleLegacyMoveTo(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_move_to')) {
            return;
        }
        this.handleNextMoveTo(client, payload);
    }
    handleNextMoveTo(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'gateway.recv.moveTo', {
            playerId,
            socketId: client.id,
            protocol: this.resolveSocketProtocol(client) || 'next',
            payload: {
                x: payload?.x ?? null,
                y: payload?.y ?? null,
                allowNearestReachable: payload?.allowNearestReachable === true,
                ignoreVisibilityLimit: payload?.ignoreVisibilityLimit === true,
                packedPathSteps: payload?.packedPathSteps ?? null,
                packedPath: payload?.packedPath ?? null,
                pathStartX: payload?.pathStartX ?? null,
                pathStartY: payload?.pathStartY ?? null,
            },
        });
        try {
            this.worldRuntimeService.enqueueMoveTo(playerId, payload?.x, payload?.y, payload?.allowNearestReachable, payload?.packedPath, payload?.packedPathSteps, payload?.pathStartX, payload?.pathStartY);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MOVE_TO_FAILED', error);
        }
    }
    handleLegacyNavigateQuest(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_navigate_quest')) {
            return;
        }
        this.handleNextNavigateQuest(client, payload);
    }
    handleNextNavigateQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'gateway.recv.navigateQuest', {
            playerId,
            socketId: client.id,
            protocol: this.resolveSocketProtocol(client) || 'next',
            questId,
        });
        if (!questId) {
            this.worldClientEventService.emitQuestNavigateResult(client, '', false, 'questId is required');
            return;
        }
        try {
            this.worldRuntimeService.navigateQuest(playerId, questId);
            this.worldClientEventService.emitQuestNavigateResult(client, questId, true);
        }
        catch (error) {
            this.worldClientEventService.emitQuestNavigateResult(client, questId, false, error instanceof Error ? error.message : String(error));
        }
    }
    handleLegacyAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_action')) {
            return;
        }
        try {
            this.handleProtocolAction(client, playerId, payload);
        }
        catch (error) {
            this.worldClientEventService.emitProtocolFailure(client, 'LEGACY_COMMAND_FAILED', error instanceof Error ? error.message : String(error));
        }
    }
    handleMove(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'gateway.recv.move', {
            playerId,
            socketId: client.id,
            protocol: this.resolveSocketProtocol(client) || 'next',
            direction: payload?.d ?? null,
        });
        try {
            this.worldRuntimeService.enqueueMove(playerId, payload?.d);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MOVE_FAILED', error);
        }
    }
    handleLegacyDestroyItem(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_destroy_item')) {
            return;
        }
        this.handleNextDestroyItem(client, payload);
    }
    handleNextDestroyItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const destroyed = this.playerRuntimeService.destroyInventoryItem(playerId, payload?.slotIndex, payload?.count);
            this.playerRuntimeService.enqueueNotice(playerId, {
                text: `你摧毁了 ${destroyed.name ?? destroyed.itemId} x${destroyed.count}。`,
                kind: 'info',
            });
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'DESTROY_ITEM_FAILED', error);
        }
    }
    handleLegacyTakeLoot(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_take_loot')) {
            return;
        }
        this.handleTakeGround(client, payload);
    }
    handleLegacySortInventory(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_sort_inventory')) {
            return;
        }
        this.handleNextSortInventory(client, _payload);
    }
    handleNextSortInventory(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.sortInventory(playerId);
            this.playerRuntimeService.enqueueNotice(playerId, {
                text: '背包已整理',
                kind: 'info',
            });
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'SORT_INVENTORY_FAILED', error);
        }
    }
    handleLegacyInspectTileRuntime(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_inspect_tile_runtime')) {
            return;
        }
        try {
            this.worldProtocolProjectionService.emitTileDetail(client, this.worldRuntimeService.buildTileDetail(playerId, payload));
        }
        catch (error) {
            this.worldClientEventService.emitProtocolFailure(client, 'LEGACY_COMMAND_FAILED', error instanceof Error ? error.message : String(error));
        }
    }
    handleLegacyChat(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_chat')) {
            return;
        }
        this.handleNextChat(client, payload);
    }
    handleNextChat(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldClientEventService.broadcastChat(playerId, payload);
    }
    handleLegacyAckSystemMessages(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_ack_system_messages')) {
            return;
        }
        this.handleNextAckSystemMessages(client, payload);
    }
    handleNextAckSystemMessages(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldClientEventService.acknowledgeSystemMessages(playerId, payload);
    }
    handleLegacyDebugResetSpawn(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_debug_reset_spawn')) {
            return;
        }
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }
    handleNextDebugResetSpawn(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }
    handleLegacyUpdateAutoBattleSkills(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_update_auto_battle_skills')) {
            return;
        }
        this.handleNextUpdateAutoBattleSkills(client, payload);
    }
    handleNextUpdateAutoBattleSkills(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.updateAutoBattleSkills(playerId, payload?.skills ?? []);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_SKILLS_FAILED', error);
        }
    }
    handleNextUpdateTechniqueSkillAvailability(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.updateTechniqueSkillAvailability(playerId, payload?.techId ?? '', payload?.enabled !== false);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'UPDATE_TECHNIQUE_SKILL_AVAILABILITY_FAILED', error);
        }
    }
    handleLegacyHeavenGateAction(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_heaven_gate_action')) {
            return;
        }
        this.handleNextHeavenGateAction(client, payload);
    }
    handleNextHeavenGateAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueHeavenGateAction(playerId, payload?.action, payload?.element);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'HEAVEN_GATE_ACTION_FAILED', error);
        }
    }
    handleUseAction(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldClientEventService.markProtocol(client, 'next');
        try {
            this.handleProtocolAction(client, playerId, payload);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'USE_ACTION_FAILED', error);
        }
    }
    handleRequestQuests(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextQuests(client, this.worldRuntimeService.buildQuestListView(playerId));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_QUESTS_FAILED', error);
        }
    }
    async handleRequestMailSummary(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_mail_summary')) {
            return;
        }
        await this.executeRequestMailSummary(client, 'legacy');
    }
    async handleNextRequestMailSummary(client, payload) {
        await this.executeRequestMailSummary(client, 'next');
    }
    async executeRequestMailSummary(client, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            if (protocol === 'legacy') {
                await this.emitLegacyMailSummaryForPlayer(client, playerId);
            }
            else {
                await this.emitNextMailSummaryForPlayer(client, playerId);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_SUMMARY_FAILED', error);
        }
    }
    handleRequestSuggestions(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_suggestions')) {
            return;
        }
        this.executeRequestSuggestions(client, 'legacy');
    }
    handleNextRequestSuggestions(client, payload) {
        this.executeRequestSuggestions(client, 'next');
    }
    executeRequestSuggestions(client, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        if (protocol === 'legacy') {
            this.emitLegacySuggestionUpdate(client, this.suggestionRuntimeService.getAll());
            return;
        }
        this.emitNextSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
    }
    async handleRequestMailPage(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_mail_page')) {
            return;
        }
        await this.executeRequestMailPage(client, payload, 'legacy');
    }
    async handleNextRequestMailPage(client, payload) {
        await this.executeRequestMailPage(client, payload, 'next');
    }
    async executeRequestMailPage(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const page = await this.mailRuntimeService.getPage(playerId, payload?.page, payload?.pageSize, payload?.filter);
            if (protocol === 'legacy') {
                this.emitLegacyMailPage(client, page);
            }
            else {
                this.emitNextMailPage(client, page);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_PAGE_FAILED', error);
        }
    }
    async handleRequestMailDetail(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_mail_detail')) {
            return;
        }
        await this.executeRequestMailDetail(client, payload, 'legacy');
    }
    async handleNextRequestMailDetail(client, payload) {
        await this.executeRequestMailDetail(client, payload, 'next');
    }
    async executeRequestMailDetail(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const detail = await this.mailRuntimeService.getDetail(playerId, payload?.mailId ?? '');
            if (protocol === 'legacy') {
                this.emitLegacyMailDetail(client, detail);
            }
            else {
                this.emitNextMailDetail(client, detail);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_DETAIL_FAILED', error);
        }
    }
    handleRedeemCodes(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_redeem_codes')) {
            return;
        }
        this.executeRedeemCodes(client, payload);
    }
    handleNextRedeemCodes(client, payload) {
        this.executeRedeemCodes(client, payload);
    }
    executeRedeemCodes(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueRedeemCodes(playerId, payload?.codes ?? []);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REDEEM_CODES_FAILED', error);
        }
    }
    handleRequestMarket(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_market')) {
            return;
        }
        this.executeRequestMarket(client, 'legacy');
    }
    handleNextRequestMarket(client, payload) {
        this.executeRequestMarket(client, 'next');
    }
    executeRequestMarket(client, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.marketSubscriberPlayerIds.add(playerId);
            const response = this.marketRuntimeService.buildMarketUpdate(playerId);
            if (protocol === 'legacy') {
                this.emitLegacyMarketUpdate(client, response);
            }
            else {
                this.emitNextMarketUpdate(client, response);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_FAILED', error);
        }
    }
    async handleMarkMailRead(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_mark_mail_read')) {
            return;
        }
        await this.executeMarkMailRead(client, payload, 'legacy');
    }
    async handleNextMarkMailRead(client, payload) {
        await this.executeMarkMailRead(client, payload, 'next');
    }
    async executeMarkMailRead(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.mailRuntimeService.markRead(playerId, payload?.mailIds ?? []);
            if (protocol === 'legacy') {
                this.emitLegacyMailOperationResult(client, response);
                await this.emitMailSummary(client, playerId);
            }
            else {
                this.emitNextMailOperationResult(client, response);
                await this.emitNextMailSummaryForPlayer(client, playerId);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MARK_MAIL_READ_FAILED', error);
        }
    }
    async handleCreateSuggestion(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_create_suggestion')) {
            return;
        }
        await this.executeCreateSuggestion(client, payload);
    }
    async handleNextCreateSuggestion(client, payload) {
        await this.executeCreateSuggestion(client, payload);
    }
    async executeCreateSuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.create(playerId, playerId, payload?.title ?? '', payload?.description ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CREATE_SUGGESTION_FAILED', error);
        }
    }
    async handleVoteSuggestion(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_vote_suggestion')) {
            return;
        }
        await this.executeVoteSuggestion(client, payload);
    }
    async handleNextVoteSuggestion(client, payload) {
        await this.executeVoteSuggestion(client, payload);
    }
    async executeVoteSuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.vote(playerId, payload?.suggestionId ?? '', payload?.vote);
            this.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'VOTE_SUGGESTION_FAILED', error);
        }
    }
    async handleReplySuggestion(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_reply_suggestion')) {
            return;
        }
        await this.executeReplySuggestion(client, payload);
    }
    async handleNextReplySuggestion(client, payload) {
        await this.executeReplySuggestion(client, payload);
    }
    async executeReplySuggestion(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.addReply(payload?.suggestionId ?? '', 'author', playerId, playerId, payload?.content ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REPLY_SUGGESTION_FAILED', error);
        }
    }
    async handleMarkSuggestionRepliesRead(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_mark_suggestion_replies_read')) {
            return;
        }
        await this.executeMarkSuggestionRepliesRead(client, payload);
    }
    async handleNextMarkSuggestionRepliesRead(client, payload) {
        await this.executeMarkSuggestionRepliesRead(client, payload);
    }
    async executeMarkSuggestionRepliesRead(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markRepliesRead(payload?.suggestionId ?? '', playerId);
            this.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MARK_SUGGESTION_REPLIES_READ_FAILED', error);
        }
    }
    async handleGmMarkSuggestionCompleted(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_mark_suggestion_completed')) {
            return;
        }
        await this.executeGmMarkSuggestionCompleted(client, payload);
    }
    async handleNextGmMarkSuggestionCompleted(client, payload) {
        await this.executeGmMarkSuggestionCompleted(client, payload);
    }
    async executeGmMarkSuggestionCompleted(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markCompleted(payload?.suggestionId ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_MARK_SUGGESTION_COMPLETED_FAILED', error);
        }
    }
    async handleGmRemoveSuggestion(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_gm_remove_suggestion')) {
            return;
        }
        await this.executeGmRemoveSuggestion(client, payload);
    }
    async handleNextGmRemoveSuggestion(client, payload) {
        await this.executeGmRemoveSuggestion(client, payload);
    }
    async executeGmRemoveSuggestion(client, payload) {
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.remove(payload?.suggestionId ?? '');
            this.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_REMOVE_SUGGESTION_FAILED', error);
        }
    }
    async handleClaimMailAttachments(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_claim_mail_attachments')) {
            return;
        }
        await this.executeClaimMailAttachments(client, payload, 'legacy');
    }
    async handleNextClaimMailAttachments(client, payload) {
        await this.executeClaimMailAttachments(client, payload, 'next');
    }
    async executeClaimMailAttachments(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.mailRuntimeService.claimAttachments(playerId, payload?.mailIds ?? []);
            if (protocol === 'legacy') {
                this.emitLegacyMailOperationResult(client, response);
                await this.emitMailSummary(client, playerId);
            }
            else {
                this.emitNextMailOperationResult(client, response);
                await this.emitNextMailSummaryForPlayer(client, playerId);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CLAIM_MAIL_ATTACHMENTS_FAILED', error);
        }
    }
    async handleDeleteMail(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_delete_mail')) {
            return;
        }
        await this.executeDeleteMail(client, payload, 'legacy');
    }
    async handleNextDeleteMail(client, payload) {
        await this.executeDeleteMail(client, payload, 'next');
    }
    async executeDeleteMail(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.mailRuntimeService.deleteMails(playerId, payload?.mailIds ?? []);
            if (protocol === 'legacy') {
                this.emitLegacyMailOperationResult(client, response);
                await this.emitMailSummary(client, playerId);
            }
            else {
                this.emitNextMailOperationResult(client, response);
                await this.emitNextMailSummaryForPlayer(client, playerId);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'DELETE_MAIL_FAILED', error);
        }
    }
    handleRequestMarketItemBook(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_market_item_book')) {
            return;
        }
        this.executeRequestMarketItemBook(client, payload, 'legacy');
    }
    handleNextRequestMarketItemBook(client, payload) {
        this.executeRequestMarketItemBook(client, payload, 'next');
    }
    executeRequestMarketItemBook(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.marketRuntimeService.buildItemBook(payload?.itemKey ?? '');
            if (protocol === 'legacy') {
                this.emitLegacyMarketItemBook(client, response);
            }
            else {
                this.emitNextMarketItemBook(client, response);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_ITEM_BOOK_FAILED', error);
        }
    }
    handleRequestMarketTradeHistory(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_market_trade_history')) {
            return;
        }
        this.executeRequestMarketTradeHistory(client, payload, 'legacy');
    }
    handleNextRequestMarketTradeHistory(client, payload) {
        this.executeRequestMarketTradeHistory(client, payload, 'next');
    }
    executeRequestMarketTradeHistory(client, payload, protocol) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.marketRuntimeService.buildTradeHistoryPage(playerId, payload?.page);
            if (protocol === 'legacy') {
                this.emitLegacyMarketTradeHistory(client, response);
            }
            else {
                this.emitNextMarketTradeHistory(client, response);
            }
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_TRADE_HISTORY_FAILED', error);
        }
    }
    handleRequestDetail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.Detail, this.worldRuntimeService.buildDetail(playerId, {
                kind: payload?.kind,
                id: payload?.id ?? '',
            }));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_DETAIL_FAILED', error);
        }
    }
    handleRequestTileDetail(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.TileDetail, this.worldRuntimeService.buildTileDetail(playerId, {
                x: payload?.x,
                y: payload?.y,
            }));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_TILE_DETAIL_FAILED', error);
        }
    }
    handleUsePortal(client) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.usePortal(playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'PORTAL_FAILED', error);
        }
    }
    handleUseItem(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_use_item')) {
            return;
        }
        this.executeUseItem(client, payload);
    }
    executeUseItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueUseItem(playerId, payload?.slotIndex);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'USE_ITEM_FAILED', error);
        }
    }
    handleNextUseItem(client, payload) {
        this.executeUseItem(client, payload);
    }
    handleDropItem(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_drop_item')) {
            return;
        }
        this.executeDropItem(client, payload);
    }
    executeDropItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueDropItem(playerId, payload?.slotIndex, payload?.count);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'DROP_ITEM_FAILED', error);
        }
    }
    handleNextDropItem(client, payload) {
        this.executeDropItem(client, payload);
    }
    handleTakeGround(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            if (payload?.takeAll) {
                this.worldRuntimeService.enqueueTakeGroundAll(playerId, payload?.sourceId);
                return;
            }
            this.worldRuntimeService.enqueueTakeGround(playerId, payload?.sourceId, payload?.itemKey);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'TAKE_GROUND_FAILED', error);
        }
    }
    handleEquip(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_equip')) {
            return;
        }
        this.executeEquip(client, payload);
    }
    executeEquip(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueEquip(playerId, payload?.slotIndex);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'EQUIP_FAILED', error);
        }
    }
    handleNextEquip(client, payload) {
        this.executeEquip(client, payload);
    }
    handleUnequip(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_unequip')) {
            return;
        }
        this.executeUnequip(client, payload);
    }
    executeUnequip(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueUnequip(playerId, payload?.slot);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'UNEQUIP_FAILED', error);
        }
    }
    handleNextUnequip(client, payload) {
        this.executeUnequip(client, payload);
    }
    handleCultivate(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_cultivate')) {
            return;
        }
        this.executeCultivate(client, payload);
    }
    executeCultivate(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueCultivate(playerId, payload?.techId ?? null);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CULTIVATE_FAILED', error);
        }
    }
    handleNextCultivate(client, payload) {
        this.executeCultivate(client, payload);
    }
    handleCastSkill(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueCastSkill(playerId, payload?.skillId, payload?.targetPlayerId ?? null, payload?.targetMonsterId ?? null, payload?.targetRef ?? null);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CAST_SKILL_FAILED', error);
        }
    }
    handleRequestNpcShop(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_request_npc_shop')) {
            return;
        }
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId);
            this.emitLegacyNpcShop(client, response);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }
    handleNextRequestNpcShop(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.emitNextNpcShop(client, this.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }
    async handleCreateMarketSellOrder(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_create_market_sell_order')) {
            return;
        }
        await this.executeCreateMarketSellOrder(client, payload);
    }
    async executeCreateMarketSellOrder(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.createSellOrder(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CREATE_MARKET_SELL_ORDER_FAILED', error);
        }
    }
    async handleNextCreateMarketSellOrder(client, payload) {
        await this.executeCreateMarketSellOrder(client, payload);
    }
    async handleCreateMarketBuyOrder(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_create_market_buy_order')) {
            return;
        }
        await this.executeCreateMarketBuyOrder(client, payload);
    }
    async executeCreateMarketBuyOrder(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.createBuyOrder(playerId, {
                itemId: payload?.itemId ?? '',
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CREATE_MARKET_BUY_ORDER_FAILED', error);
        }
    }
    async handleNextCreateMarketBuyOrder(client, payload) {
        await this.executeCreateMarketBuyOrder(client, payload);
    }
    async handleBuyMarketItem(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_buy_market_item')) {
            return;
        }
        await this.executeBuyMarketItem(client, payload);
    }
    async executeBuyMarketItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.buyNow(playerId, {
                itemKey: payload?.itemKey ?? '',
                quantity: payload?.quantity,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'BUY_MARKET_ITEM_FAILED', error);
        }
    }
    async handleNextBuyMarketItem(client, payload) {
        await this.executeBuyMarketItem(client, payload);
    }
    async handleSellMarketItem(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_sell_market_item')) {
            return;
        }
        await this.executeSellMarketItem(client, payload);
    }
    async executeSellMarketItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.sellNow(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'SELL_MARKET_ITEM_FAILED', error);
        }
    }
    async handleNextSellMarketItem(client, payload) {
        await this.executeSellMarketItem(client, payload);
    }
    async handleCancelMarketOrder(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_cancel_market_order')) {
            return;
        }
        await this.executeCancelMarketOrder(client, payload);
    }
    async executeCancelMarketOrder(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.cancelOrder(playerId, {
                orderId: payload?.orderId ?? '',
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CANCEL_MARKET_ORDER_FAILED', error);
        }
    }
    async handleNextCancelMarketOrder(client, payload) {
        await this.executeCancelMarketOrder(client, payload);
    }
    async handleClaimMarketStorage(client, _payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_claim_market_storage')) {
            return;
        }
        await this.executeClaimMarketStorage(client);
    }
    async executeClaimMarketStorage(client) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.marketRuntimeService.claimStorage(playerId);
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CLAIM_MARKET_STORAGE_FAILED', error);
        }
    }
    async handleNextClaimMarketStorage(client, payload) {
        await this.executeClaimMarketStorage(client);
    }
    handleRequestNpcQuests(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.NpcQuests, this.worldRuntimeService.buildNpcQuestsView(playerId, payload?.npcId));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_REQUEST_FAILED', error);
        }
    }
    handleAcceptNpcQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueAcceptNpcQuest(playerId, payload?.npcId, payload?.questId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_ACCEPT_FAILED', error);
        }
    }
    handleSubmitNpcQuest(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueSubmitNpcQuest(playerId, payload?.npcId, payload?.questId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_SUBMIT_FAILED', error);
        }
    }
    handleBuyNpcShopItem(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'legacy_buy_npc_shop_item')) {
            return;
        }
        this.executeBuyNpcShopItem(client, payload);
    }
    executeBuyNpcShopItem(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldRuntimeService.enqueueBuyNpcShopItem(playerId, payload?.npcId, payload?.itemId, payload?.quantity);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_BUY_FAILED', error);
        }
    }
    handleNextBuyNpcShopItem(client, payload) {
        this.executeBuyNpcShopItem(client, payload);
    }
    handlePing(client, payload) {
        this.worldClientEventService.emitPong(client, payload);
    }
    emitNextQuests(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitQuests(client, payload);
    }
    emitNextSuggestionUpdate(client, suggestions) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }
    emitLegacySuggestionUpdate(client, suggestions) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_suggestion_update')) {
            return;
        }
        this.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }
    emitLegacyMailSummary(client, summary) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_mail_summary')) {
            return;
        }
        this.worldClientEventService.emitMailSummary(client, summary);
    }
    async emitLegacyMailSummaryForPlayer(client, playerId) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_mail_summary_for_player')) {
            return;
        }
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    emitLegacyMailPage(client, page) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_mail_page')) {
            return;
        }
        this.worldClientEventService.emitMailPage(client, page);
    }
    emitLegacyMailDetail(client, detail) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_mail_detail')) {
            return;
        }
        this.worldClientEventService.emitMailDetail(client, detail);
    }
    emitLegacyMailOperationResult(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_mail_operation_result')) {
            return;
        }
        this.worldClientEventService.emitMailOperationResult(client, payload);
    }
    emitLegacyMarketUpdate(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_market_update')) {
            return;
        }
        this.worldClientEventService.emitMarketUpdate(client, payload);
    }
    emitLegacyMarketItemBook(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_market_item_book')) {
            return;
        }
        this.worldClientEventService.emitMarketItemBook(client, payload);
    }
    emitLegacyMarketTradeHistory(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_market_trade_history')) {
            return;
        }
        this.worldClientEventService.emitMarketTradeHistory(client, payload);
    }
    emitLegacyNpcShop(client, payload) {
        if (!this.markLegacyProtocolIfAllowed(client, 'emit_legacy_npc_shop')) {
            return;
        }
        this.worldClientEventService.emitNpcShop(client, payload);
    }
    emitNextMailSummary(client, summary) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailSummary(client, summary);
    }
    async emitNextMailSummaryForPlayer(client, playerId) {
        this.worldClientEventService.markProtocol(client, 'next');
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    emitNextMailPage(client, page) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailPage(client, page);
    }
    emitNextMailDetail(client, detail) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailDetail(client, detail);
    }
    emitNextMailOperationResult(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailOperationResult(client, payload);
    }
    emitNextMarketUpdate(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketUpdate(client, payload);
    }
    emitNextMarketItemBook(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketItemBook(client, payload);
    }
    emitNextMarketTradeHistory(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketTradeHistory(client, payload);
    }
    emitNextNpcShop(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitNpcShop(client, payload);
    }
    handleProtocolAction(client, playerId, payload) {
        const actionId = this.resolveActionId(payload);
        if (actionId === 'debug:reset_spawn' || actionId === 'travel:return_spawn') {
            this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
            return;
        }
        if (actionId === 'loot:open') {
            const tile = typeof payload?.target === 'string' ? (0, shared_1.parseTileTargetRef)(payload.target) : null;
            if (!tile) {
                throw new Error('拿取需要指定目标格子');
            }
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > 1) {
                throw new Error('拿取范围只有 1 格。');
            }
            this.worldProtocolProjectionService.emitTileLootInteraction(client, playerId, this.worldRuntimeService.buildTileDetail(playerId, tile));
            return;
        }
        if (actionId === 'battle:engage' || actionId === 'battle:force_attack') {
            const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
            const tile = target ? (0, shared_1.parseTileTargetRef)(target) : null;
            const targetPlayerId = target.startsWith('player:') ? target.slice('player:'.length) : null;
            const targetMonsterId = target && !target.startsWith('player:') && !tile ? target : null;
            if (targetMonsterId) {
                this.worldRuntimeService.enqueueBattleTarget(playerId, actionId === 'battle:force_attack', null, targetMonsterId);
                return;
            }
            this.worldRuntimeService.enqueueBattleTarget(playerId, actionId === 'battle:force_attack', targetPlayerId, null, tile?.x, tile?.y);
            return;
        }
        if (actionId.startsWith('npc:')) {
            this.worldRuntimeService.enqueueLegacyNpcInteraction(playerId, actionId);
            return;
        }
        const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
        if (actionId === 'body_training:infuse') {
            this.emitProtocolActionResult(client, playerId, this.worldRuntimeService.executeAction(playerId, actionId, target));
            return;
        }
        if (target) {
            this.worldRuntimeService.enqueueCastSkillTargetRef(playerId, actionId, target);
            return;
        }
        this.emitProtocolActionResult(client, playerId, this.worldRuntimeService.executeAction(playerId, actionId));
    }
    resolveActionId(payload) {
        const actionId = typeof payload?.actionId === 'string' && payload.actionId.trim()
            ? payload.actionId.trim()
            : (typeof payload?.type === 'string' ? payload.type.trim() : '');
        if (!actionId) {
            throw new Error('actionId is required');
        }
        return actionId;
    }
    emitProtocolActionResult(client, playerId, result) {
        if (result.kind === 'npcShop' && result.npcShop) {
            this.worldClientEventService.emitNpcShop(client, result.npcShop);
            return;
        }
        if (result.kind !== 'npcQuests') {
            return;
        }
        if (this.worldClientEventService.getExplicitProtocol(client) === 'next' && result.npcQuests) {
            client.emit(shared_1.NEXT_S2C.NpcQuests, result.npcQuests);
        }
        this.worldClientEventService.emitQuests(client, this.worldRuntimeService.buildQuestListView(playerId));
    }
    requirePlayerId(client) {
        const playerId = typeof client.data.playerId === 'string' ? client.data.playerId : '';
        if (playerId) {
            return playerId;
        }
        this.worldClientEventService.emitNotReady(client);
        return null;
    }
    requireGm(client) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return null;
        }
        if (client.data?.isGm === true) {
            return playerId;
        }
        this.worldClientEventService.emitError(client, 'GM_FORBIDDEN', 'GM 权限不足');
        return null;
    }
    flushMarketResult(result) {
        this.worldClientEventService.flushMarketResult(this.marketSubscriberPlayerIds, result);
    }
    async emitMailSummary(client, playerId) {
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    broadcastSuggestions() {
        this.worldClientEventService.broadcastSuggestionUpdate();
    }
};
exports.WorldGateway = WorldGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], WorldGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Hello),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleHello", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Heartbeat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Heartbeat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Ping),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyPing", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmGetState),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmGetState),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmSpawnBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmSpawnBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmSpawnBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmSpawnBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmRemoveBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmRemoveBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmRemoveBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmUpdatePlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmUpdatePlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmUpdatePlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmUpdatePlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmResetPlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyGmResetPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmResetPlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmResetPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Move),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Action),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Move),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DestroyItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DestroyItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.TakeLoot),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyTakeLoot", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacySortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextSortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.InspectTileRuntime),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyInspectTileRuntime", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateTechniqueSkillAvailability),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateTechniqueSkillAvailability", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.HeavenGateAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleLegacyHeavenGateAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.HeavenGateAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeavenGateAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseAction),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUseAction", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestTileDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestTileDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UsePortal),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUsePortal", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.UseItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUseItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUseItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.DropItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleDropItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DropItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDropItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.TakeGround),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleTakeGround", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleUnequip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUnequip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.Cultivate),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCultivate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Cultivate),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCultivate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CastSkill),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleCastSkill", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.RequestNpcShop),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestNpcShop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcShop),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestNpcShop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleCancelMarketOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCancelMarketOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.ClaimMarketStorage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleClaimMarketStorage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMarketStorage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMarketStorage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcQuests),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleRequestNpcQuests", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AcceptNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleAcceptNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SubmitNpcQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleSubmitNpcQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.C2S.BuyNpcShopItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleBuyNpcShopItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyNpcShopItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextBuyNpcShopItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Ping),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handlePing", null);
exports.WorldGateway = WorldGateway = WorldGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: true,
        path: '/socket.io',
    }),
    __metadata("design:paramtypes", [world_gm_socket_service_1.WorldGmSocketService,
        world_protocol_projection_service_1.WorldProtocolProjectionService,
        world_session_bootstrap_service_1.WorldSessionBootstrapService,
        health_readiness_service_1.HealthReadinessService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_client_event_service_1.WorldClientEventService,
        world_session_service_1.WorldSessionService])
], WorldGateway);
function readBooleanEnv(key) {
    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
//# sourceMappingURL=world.gateway.js.map

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
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/** WorldGateway_1：定义该变量以承载业务值。 */
var WorldGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGateway = void 0;
/** websockets_1：定义该变量以承载业务值。 */
const websockets_1 = require("@nestjs/websockets");
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** socket_io_1：定义该变量以承载业务值。 */
const socket_io_1 = require("socket.io");
/** movement_debug_1：定义该变量以承载业务值。 */
const movement_debug_1 = require("../debug/movement-debug");
/** health_readiness_service_1：定义该变量以承载业务值。 */
const health_readiness_service_1 = require("../health/health-readiness.service");
/** player_persistence_flush_service_1：定义该变量以承载业务值。 */
const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("../runtime/mail/mail-runtime.service");
/** market_runtime_service_1：定义该变量以承载业务值。 */
const market_runtime_service_1 = require("../runtime/market/market-runtime.service");
/** craft_panel_runtime_service_1：定义该变量以承载业务值。 */
const craft_panel_runtime_service_1 = require("../runtime/craft/craft-panel-runtime.service");
/** leaderboard_runtime_service_1：定义该变量以承载业务值。 */
const leaderboard_runtime_service_1 = require("../runtime/player/leaderboard-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("../runtime/suggestion/suggestion-runtime.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
/** world_client_event_service_1：定义该变量以承载业务值。 */
const world_client_event_service_1 = require("./world-client-event.service");
/** world_gm_socket_service_1：定义该变量以承载业务值。 */
const world_gm_socket_service_1 = require("./world-gm-socket.service");
/** world_protocol_projection_service_1：定义该变量以承载业务值。 */
const world_protocol_projection_service_1 = require("./world-protocol-projection.service");
/** world_session_bootstrap_service_1：定义该变量以承载业务值。 */
const world_session_bootstrap_service_1 = require("./world-session-bootstrap.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("./world-session.service");
/** AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES：定义该变量以承载业务值。 */
const AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES = new Set([
    'next',
    'token',
]);
/** WorldGateway：定义该变量以承载业务值。 */
let WorldGateway = WorldGateway_1 = class WorldGateway {
    worldGmSocketService;
    worldProtocolProjectionService;
    sessionBootstrapService;
    healthReadinessService;
    playerPersistenceFlushService;
    playerRuntimeService;
    mailRuntimeService;
    marketRuntimeService;
    craftPanelRuntimeService;
    suggestionRuntimeService;
    leaderboardRuntimeService;
    worldRuntimeService;
    worldClientEventService;
    worldSessionService;
    server;
    logger = new common_1.Logger(WorldGateway_1.name);
    marketSubscriberPlayerIds = new Set();
    marketListingRequestsByPlayerId = new Map();
    marketTradeHistoryRequestsByPlayerId = new Map();
/** 构造函数：执行实例初始化流程。 */
    constructor(worldGmSocketService, worldProtocolProjectionService, sessionBootstrapService, healthReadinessService, playerPersistenceFlushService, playerRuntimeService, mailRuntimeService, marketRuntimeService, craftPanelRuntimeService, suggestionRuntimeService, leaderboardRuntimeService, worldRuntimeService, worldClientEventService, worldSessionService) {
        this.worldGmSocketService = worldGmSocketService;
        this.worldProtocolProjectionService = worldProtocolProjectionService;
        this.sessionBootstrapService = sessionBootstrapService;
        this.healthReadinessService = healthReadinessService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.leaderboardRuntimeService = leaderboardRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldClientEventService = worldClientEventService;
        this.worldSessionService = worldSessionService;
    }
/** setBootstrapTraceContext：执行对应的业务逻辑。 */
    setBootstrapTraceContext(client, entryPath, identity) {
        client.data.bootstrapEntryPath = entryPath;
        client.data.bootstrapIdentitySource = identity?.authSource ?? null;
        client.data.bootstrapIdentityPersistedSource = identity?.persistedSource ?? null;
        client.data.bootstrapSnapshotSource = null;
        client.data.bootstrapSnapshotPersistedSource = null;
    }
/** resolveBootstrapPromise：执行对应的业务逻辑。 */
    resolveBootstrapPromise(client) {
/** promise：定义该变量以承载业务值。 */
        const promise = client?.data?.bootstrapPromise;
        return promise && typeof promise.then === 'function' ? promise : null;
    }
/** rememberBootstrapPromise：执行对应的业务逻辑。 */
    rememberBootstrapPromise(client, promise) {
        client.data.bootstrapPromise = promise;
        promise.finally(() => {
            if (client.data.bootstrapPromise === promise) {
                client.data.bootstrapPromise = null;
            }
        }).catch(() => undefined);
        return promise;
    }
/** awaitPendingBootstrap：执行对应的业务逻辑。 */
    async awaitPendingBootstrap(client) {
/** deadline：定义该变量以承载业务值。 */
        const deadline = Date.now() + 1000;
        while (Date.now() <= deadline) {
/** promise：定义该变量以承载业务值。 */
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
/** promise：定义该变量以承载业务值。 */
        const promise = this.resolveBootstrapPromise(client);
        if (promise) {
            await promise;
            return true;
        }
        return typeof client?.data?.playerId === 'string' && client.data.playerId.trim().length > 0;
    }
/** hasSocketAuthHint：执行对应的业务逻辑。 */
    hasSocketAuthHint(client) {
        return this.sessionBootstrapService.pickSocketToken(client).length > 0
            || this.sessionBootstrapService.pickSocketGmToken(client).length > 0;
    }
/** resolveAuthenticatedBootstrapEntryPath：执行对应的业务逻辑。 */
    resolveAuthenticatedBootstrapEntryPath(client) {
        return client?.data?.isGm === true ? 'connect_gm_token' : 'connect_token';
    }
/** resolveAuthenticatedIdentitySource：执行对应的业务逻辑。 */
    resolveAuthenticatedIdentitySource(client, identity) {
/** authSource：定义该变量以承载业务值。 */
        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
/** bootstrapIdentitySource：定义该变量以承载业务值。 */
        const bootstrapIdentitySource = typeof client?.data?.bootstrapIdentitySource === 'string'
            ? client.data.bootstrapIdentitySource.trim()
            : '';
        return bootstrapIdentitySource;
    }
/** resolveAuthenticatedIdentityPersistedSource：执行对应的业务逻辑。 */
    resolveAuthenticatedIdentityPersistedSource(client, identity) {
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
/** bootstrapIdentityPersistedSource：定义该变量以承载业务值。 */
        const bootstrapIdentityPersistedSource = typeof client?.data?.bootstrapIdentityPersistedSource === 'string'
            ? client.data.bootstrapIdentityPersistedSource.trim()
            : '';
        return bootstrapIdentityPersistedSource;
    }
/** resolveAuthenticatedRequestedSessionId：执行对应的业务逻辑。 */
    resolveAuthenticatedRequestedSessionId(client, identity) {
/** requestedSessionId：定义该变量以承载业务值。 */
        const requestedSessionId = this.sessionBootstrapService.pickSocketRequestedSessionId(client);
        if (!requestedSessionId) {
            return undefined;
        }
        if (client?.data?.isGm === true) {
            this.logger.warn(`已忽略 GM 引导中的请求 sessionId：socket=${client.id} sessionId=${requestedSessionId}`);
            return undefined;
        }
/** authSource：定义该变量以承载业务值。 */
        const authSource = this.resolveAuthenticatedIdentitySource(client, identity);
        if (!AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES.has(authSource)) {
            this.logger.warn(`已忽略鉴权引导中的请求 sessionId：socket=${client.id} authSource=${authSource || '未知'} sessionId=${requestedSessionId}`);
            return undefined;
        }
        if (!this.sessionBootstrapService.shouldAllowRequestedDetachedResume(client)) {
            this.logger.warn(`由于复用策略已忽略鉴权引导中的请求 sessionId：socket=${client.id} authSource=${authSource || '未知'} sessionId=${requestedSessionId}`);
            return undefined;
        }
        return requestedSessionId;
    }
/** buildAuthenticatedBootstrapInput：执行对应的业务逻辑。 */
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
/** startAuthenticatedBootstrap：执行对应的业务逻辑。 */
    startAuthenticatedBootstrap(client, entryPath, identity) {
/** existing：定义该变量以承载业务值。 */
        const existing = this.resolveBootstrapPromise(client);
        if (existing) {
            return existing;
        }
        this.setBootstrapTraceContext(client, entryPath, identity);
        client.data.authenticatedSnapshotRecovery = null;
/** promise：定义该变量以承载业务值。 */
        const promise = (async () => {
            await this.sessionBootstrapService.bootstrapPlayerSession(client, this.buildAuthenticatedBootstrapInput(client, identity));
            client.data.userId = identity.userId;
        })();
        return this.rememberBootstrapPromise(client, promise);
    }
/** resolveGuestDetachedBinding：执行对应的业务逻辑。 */
    resolveGuestDetachedBinding(payloadSessionId) {
        return this.worldSessionService.getDetachedBindingBySessionId(payloadSessionId);
    }
/** buildGuestHelloBootstrapInput：执行对应的业务逻辑。 */
    buildGuestHelloBootstrapInput(client, payload) {
/** detachedBinding：定义该变量以承载业务值。 */
        const detachedBinding = this.resolveGuestDetachedBinding(payload?.sessionId);
/** guestDetachedBinding：定义该变量以承载业务值。 */
        const guestDetachedBinding = detachedBinding && this.worldSessionService.isGuestPlayerId(detachedBinding.playerId)
            ? detachedBinding
            : null;
        if (detachedBinding && !guestDetachedBinding) {
            this.logger.warn(`已拒绝非游客绑定上的游客 hello 脱机续连：socket=${client.id} playerId=${detachedBinding.playerId} sessionId=${detachedBinding.sessionId}`);
        }
/** playerId：定义该变量以承载业务值。 */
        const playerId = guestDetachedBinding?.playerId
            ?? this.worldSessionService.createGuestPlayerId();
/** mapId：定义该变量以承载业务值。 */
        const mapId = guestDetachedBinding ? undefined : payload.mapId;
/** preferredX：定义该变量以承载业务值。 */
        const preferredX = guestDetachedBinding ? undefined : payload.preferredX;
/** preferredY：定义该变量以承载业务值。 */
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
/** handleGuestHello：执行对应的业务逻辑。 */
    async handleGuestHello(client, payload) {
        this.setBootstrapTraceContext(client, 'hello_guest', null);
        await this.sessionBootstrapService.bootstrapPlayerSession(client, this.buildGuestHelloBootstrapInput(client, payload));
    }
/** resolveBootstrapAuthContext：执行对应的业务逻辑。 */
    async resolveBootstrapAuthContext(client, options = undefined) {
/** allowGuest：定义该变量以承载业务值。 */
        const allowGuest = options?.allowGuest === true;
/** token：定义该变量以承载业务值。 */
        const token = this.sessionBootstrapService.pickSocketToken(client);
/** gmToken：定义该变量以承载业务值。 */
        const gmToken = this.sessionBootstrapService.pickSocketGmToken(client);
/** requestedSessionInspection：定义该变量以承载业务值。 */
        const requestedSessionInspection = this.sessionBootstrapService.inspectSocketRequestedSessionId(client);
/** protocol：定义该变量以承载业务值。 */
        const protocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if ((token || gmToken)
            && protocol === 'next'
            && requestedSessionInspection.error) {
            this.worldClientEventService.emitError(client, 'AUTH_SESSION_ID_INVALID', 'next 认证握手 sessionId 非法');
            client.disconnect(true);
            return null;
        }
        if (gmToken) {
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
/** identity：定义该变量以承载业务值。 */
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
/** authenticatedBootstrapContractViolation：定义该变量以承载业务值。 */
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
/** handleConnection：执行对应的业务逻辑。 */
    async handleConnection(client) {
        this.logger.debug(`Socket 已连接：${client.id}`);
/** handshakeProtocol：定义该变量以承载业务值。 */
        const handshakeProtocol = typeof client.handshake?.auth?.protocol === 'string'
            ? client.handshake.auth.protocol.trim().toLowerCase()
            : '';
/** hasAuthHint：定义该变量以承载业务值。 */
        const hasAuthHint = this.hasSocketAuthHint(client);
        if (handshakeProtocol === 'next') {
            this.worldClientEventService.markProtocol(client, handshakeProtocol);
        }
        else if (handshakeProtocol === 'legacy') {
            this.worldClientEventService.emitError(client, 'LEGACY_PROTOCOL_DISABLED', 'legacy socket API 已移除，仅支持 next 协议握手');
            client.disconnect(true);
            return;
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
/** authContext：定义该变量以承载业务值。 */
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
/** handleDisconnect：执行对应的业务逻辑。 */
    async handleDisconnect(client) {
/** binding：定义该变量以承载业务值。 */
        const binding = this.worldSessionService.unregisterSocket(client.id);
        if (!binding) {
            return;
        }
        if (binding.connected) {
            return;
        }
        this.marketSubscriberPlayerIds.delete(binding.playerId);
        this.marketListingRequestsByPlayerId.delete(binding.playerId);
        this.marketTradeHistoryRequestsByPlayerId.delete(binding.playerId);
        this.playerRuntimeService.detachSession(binding.playerId);
        await this.playerPersistenceFlushService.flushPlayer(binding.playerId).catch((error) => {
            this.logger.error(`刷新脱机玩家失败：${binding.playerId}`, error instanceof Error ? error.stack : String(error));
        });
        this.logger.debug(`Socket 已脱离：${client.id} -> ${binding.playerId}, expiresAt=${binding.expireAt}`);
    }
/** handleHello：执行对应的业务逻辑。 */
    async handleHello(client, payload) {
/** currentProtocol：定义该变量以承载业务值。 */
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
/** waited：定义该变量以承载业务值。 */
                const waited = await this.awaitPendingBootstrap(client);
                if (waited) {
                    return;
                }
                this.worldClientEventService.emitError(client, 'HELLO_AUTH_BOOTSTRAP_FORBIDDEN', 'token/gmToken 连接只允许 connect 阶段 bootstrap');
                this.logger.warn(`已拒绝 token hello 引导回退：socket=${client.id} protocol=${'next'}`);
                client.disconnect(true);
                return;
            }
/** requestedSessionInspection：定义该变量以承载业务值。 */
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
/** handleNextHeartbeat：执行对应的业务逻辑。 */
    handleNextHeartbeat(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
    }
/** rejectWhenNotReady：执行对应的业务逻辑。 */
    rejectWhenNotReady(client) {
        if (readBooleanEnv('SERVER_NEXT_ALLOW_UNREADY_TRAFFIC') || readBooleanEnv('SERVER_NEXT_SMOKE_ALLOW_UNREADY')) {
            return false;
        }
/** health：定义该变量以承载业务值。 */
        const health = this.healthReadinessService.build();
        if (health.readiness.ok) {
            return false;
        }
/** isMaintenance：定义该变量以承载业务值。 */
        const isMaintenance = health.readiness.maintenance?.active === true;
        this.worldClientEventService.emitError(client, isMaintenance ? 'SERVER_BUSY' : 'SERVER_NOT_READY', isMaintenance ? '数据库维护中，请稍后重连' : '服务未就绪，请稍后重连');
        client.disconnect(true);
        return true;
    }
/** handleNextGmGetState：执行对应的业务逻辑。 */
    handleNextGmGetState(client, _payload) {
        this.handleGmGetState(client, _payload);
    }
/** handleGmGetState：执行对应的业务逻辑。 */
    handleGmGetState(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requireGm(client);
        if (!playerId) {
            return;
        }
        this.worldGmSocketService.emitState(client);
    }
/** handleNextGmSpawnBots：执行对应的业务逻辑。 */
    handleNextGmSpawnBots(client, payload) {
        this.handleGmSpawnBots(client, payload);
    }
/** handleGmSpawnBots：执行对应的业务逻辑。 */
    handleGmSpawnBots(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextGmRemoveBots：执行对应的业务逻辑。 */
    handleNextGmRemoveBots(client, payload) {
        this.handleGmRemoveBots(client, payload);
    }
/** handleGmRemoveBots：执行对应的业务逻辑。 */
    handleGmRemoveBots(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextGmUpdatePlayer：执行对应的业务逻辑。 */
    handleNextGmUpdatePlayer(client, payload) {
        this.handleGmUpdatePlayer(client, payload);
    }
/** handleGmUpdatePlayer：执行对应的业务逻辑。 */
    handleGmUpdatePlayer(client, payload) {
/** requesterPlayerId：定义该变量以承载业务值。 */
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
/** handleNextGmResetPlayer：执行对应的业务逻辑。 */
    handleNextGmResetPlayer(client, payload) {
        this.handleGmResetPlayer(client, payload);
    }
/** handleGmResetPlayer：执行对应的业务逻辑。 */
    handleGmResetPlayer(client, payload) {
/** requesterPlayerId：定义该变量以承载业务值。 */
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
/** handleNextMoveTo：执行对应的业务逻辑。 */
    handleNextMoveTo(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'gateway.recv.moveTo', {
            playerId,
            socketId: client.id,
            protocol: 'next',
            payload: {
                x: payload?.x ?? null,
                y: payload?.y ?? null,
/** allowNearestReachable：定义该变量以承载业务值。 */
                allowNearestReachable: payload?.allowNearestReachable === true,
/** ignoreVisibilityLimit：定义该变量以承载业务值。 */
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
/** handleNextNavigateQuest：执行对应的业务逻辑。 */
    handleNextNavigateQuest(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
/** questId：定义该变量以承载业务值。 */
        const questId = typeof payload?.questId === 'string' ? payload.questId.trim() : '';
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'gateway.recv.navigateQuest', {
            playerId,
            socketId: client.id,
            protocol: 'next',
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
/** handleMove：执行对应的业务逻辑。 */
    handleMove(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'gateway.recv.move', {
            playerId,
            socketId: client.id,
            protocol: 'next',
            direction: payload?.d ?? null,
        });
        try {
            this.worldRuntimeService.enqueueMove(playerId, payload?.d);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MOVE_FAILED', error);
        }
    }
/** handleNextDestroyItem：执行对应的业务逻辑。 */
    handleNextDestroyItem(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** destroyed：定义该变量以承载业务值。 */
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
/** handleNextSortInventory：执行对应的业务逻辑。 */
    handleNextSortInventory(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextChat：执行对应的业务逻辑。 */
    handleNextChat(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldClientEventService.broadcastChat(playerId, payload);
    }
/** handleNextAckSystemMessages：执行对应的业务逻辑。 */
    handleNextAckSystemMessages(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldClientEventService.acknowledgeSystemMessages(playerId, payload);
    }
/** handleNextDebugResetSpawn：执行对应的业务逻辑。 */
    handleNextDebugResetSpawn(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
    }
/** handleNextUpdateAutoBattleSkills：执行对应的业务逻辑。 */
    handleNextUpdateAutoBattleSkills(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextUpdateAutoUsePills：执行对应的业务逻辑。 */
    handleNextUpdateAutoUsePills(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.updateAutoUsePills(playerId, payload?.pills ?? []);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_USE_PILLS_FAILED', error);
        }
    }
/** handleNextUpdateCombatTargetingRules：执行对应的业务逻辑。 */
    handleNextUpdateCombatTargetingRules(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.updateCombatTargetingRules(playerId, payload?.combatTargetingRules);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'UPDATE_COMBAT_TARGETING_RULES_FAILED', error);
        }
    }
/** handleNextUpdateAutoBattleTargetingMode：执行对应的业务逻辑。 */
    handleNextUpdateAutoBattleTargetingMode(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.playerRuntimeService.updateAutoBattleTargetingMode(playerId, payload?.mode ?? payload);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'UPDATE_AUTO_BATTLE_TARGETING_MODE_FAILED', error);
        }
    }
/** handleNextUpdateTechniqueSkillAvailability：执行对应的业务逻辑。 */
    handleNextUpdateTechniqueSkillAvailability(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextHeavenGateAction：执行对应的业务逻辑。 */
    handleNextHeavenGateAction(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleUseAction：执行对应的业务逻辑。 */
    handleUseAction(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleRequestQuests：执行对应的业务逻辑。 */
    handleRequestQuests(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextRequestMailSummary：执行对应的业务逻辑。 */
    async handleNextRequestMailSummary(client, payload) {
        await this.executeRequestMailSummary(client);
    }
/** executeRequestMailSummary：执行对应的业务逻辑。 */
    async executeRequestMailSummary(client) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_SUMMARY_FAILED', error);
        }
    }
/** handleNextRequestSuggestions：执行对应的业务逻辑。 */
    handleNextRequestSuggestions(client, payload) {
        this.executeRequestSuggestions(client);
    }
/** executeRequestSuggestions：执行对应的业务逻辑。 */
    executeRequestSuggestions(client) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.emitNextSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
    }
/** handleNextRequestMailPage：执行对应的业务逻辑。 */
    async handleNextRequestMailPage(client, payload) {
        await this.executeRequestMailPage(client, payload);
    }
/** executeRequestMailPage：执行对应的业务逻辑。 */
    async executeRequestMailPage(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** page：定义该变量以承载业务值。 */
            const page = await this.mailRuntimeService.getPage(playerId, payload?.page, payload?.pageSize, payload?.filter);
            this.emitNextMailPage(client, page);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_PAGE_FAILED', error);
        }
    }
/** handleNextRequestMailDetail：执行对应的业务逻辑。 */
    async handleNextRequestMailDetail(client, payload) {
        await this.executeRequestMailDetail(client, payload);
    }
/** executeRequestMailDetail：执行对应的业务逻辑。 */
    async executeRequestMailDetail(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** detail：定义该变量以承载业务值。 */
            const detail = await this.mailRuntimeService.getDetail(playerId, payload?.mailId ?? '');
            this.emitNextMailDetail(client, detail);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_DETAIL_FAILED', error);
        }
    }
/** handleNextRedeemCodes：执行对应的业务逻辑。 */
    handleNextRedeemCodes(client, payload) {
        this.executeRedeemCodes(client, payload);
    }
/** executeRedeemCodes：执行对应的业务逻辑。 */
    executeRedeemCodes(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextRequestMarket：执行对应的业务逻辑。 */
    handleNextRequestMarket(client, payload) {
        this.executeRequestMarket(client);
    }
/** executeRequestMarket：执行对应的业务逻辑。 */
    executeRequestMarket(client) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.marketSubscriberPlayerIds.add(playerId);
            this.marketListingRequestsByPlayerId.set(playerId, { page: 1 });
/** response：定义该变量以承载业务值。 */
            const response = this.marketRuntimeService.buildMarketUpdate(playerId);
            this.emitNextMarketUpdate(client, response);
            this.emitNextMarketListings(client, this.marketRuntimeService.buildMarketListingsPage(this.marketListingRequestsByPlayerId.get(playerId)));
            this.emitNextMarketOrders(client, this.marketRuntimeService.buildMarketOrders(playerId));
            this.emitNextMarketStorage(client, this.marketRuntimeService.buildMarketStorage(playerId));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_FAILED', error);
        }
    }
/** handleNextRequestMarketListings：执行对应的业务逻辑。 */
    handleNextRequestMarketListings(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.marketSubscriberPlayerIds.add(playerId);
            this.marketListingRequestsByPlayerId.set(playerId, { ...(payload ?? {}) });
            this.worldClientEventService.markProtocol(client, 'next');
            this.worldClientEventService.emitMarketListings(client, this.marketRuntimeService.buildMarketListingsPage(payload));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_LISTINGS_FAILED', error);
        }
    }
/** handleNextMarkMailRead：执行对应的业务逻辑。 */
    async handleNextMarkMailRead(client, payload) {
        await this.executeMarkMailRead(client, payload);
    }
/** executeMarkMailRead：执行对应的业务逻辑。 */
    async executeMarkMailRead(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** response：定义该变量以承载业务值。 */
            const response = await this.mailRuntimeService.markRead(playerId, payload?.mailIds ?? []);
            this.emitNextMailOperationResult(client, response);
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MARK_MAIL_READ_FAILED', error);
        }
    }
/** handleNextCreateSuggestion：执行对应的业务逻辑。 */
    async handleNextCreateSuggestion(client, payload) {
        await this.executeCreateSuggestion(client, payload);
    }
/** executeCreateSuggestion：执行对应的业务逻辑。 */
    async executeCreateSuggestion(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextVoteSuggestion：执行对应的业务逻辑。 */
    async handleNextVoteSuggestion(client, payload) {
        await this.executeVoteSuggestion(client, payload);
    }
/** executeVoteSuggestion：执行对应的业务逻辑。 */
    async executeVoteSuggestion(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextReplySuggestion：执行对应的业务逻辑。 */
    async handleNextReplySuggestion(client, payload) {
        await this.executeReplySuggestion(client, payload);
    }
/** executeReplySuggestion：执行对应的业务逻辑。 */
    async executeReplySuggestion(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextMarkSuggestionRepliesRead：执行对应的业务逻辑。 */
    async handleNextMarkSuggestionRepliesRead(client, payload) {
        await this.executeMarkSuggestionRepliesRead(client, payload);
    }
/** executeMarkSuggestionRepliesRead：执行对应的业务逻辑。 */
    async executeMarkSuggestionRepliesRead(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextGmMarkSuggestionCompleted：执行对应的业务逻辑。 */
    async handleNextGmMarkSuggestionCompleted(client, payload) {
        await this.executeGmMarkSuggestionCompleted(client, payload);
    }
/** executeGmMarkSuggestionCompleted：执行对应的业务逻辑。 */
    async executeGmMarkSuggestionCompleted(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextGmRemoveSuggestion：执行对应的业务逻辑。 */
    async handleNextGmRemoveSuggestion(client, payload) {
        await this.executeGmRemoveSuggestion(client, payload);
    }
/** executeGmRemoveSuggestion：执行对应的业务逻辑。 */
    async executeGmRemoveSuggestion(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextClaimMailAttachments：执行对应的业务逻辑。 */
    async handleNextClaimMailAttachments(client, payload) {
        await this.executeClaimMailAttachments(client, payload);
    }
/** executeClaimMailAttachments：执行对应的业务逻辑。 */
    async executeClaimMailAttachments(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** response：定义该变量以承载业务值。 */
            const response = await this.mailRuntimeService.claimAttachments(playerId, payload?.mailIds ?? []);
            this.emitNextMailOperationResult(client, response);
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CLAIM_MAIL_ATTACHMENTS_FAILED', error);
        }
    }
/** handleNextDeleteMail：执行对应的业务逻辑。 */
    async handleNextDeleteMail(client, payload) {
        await this.executeDeleteMail(client, payload);
    }
/** executeDeleteMail：执行对应的业务逻辑。 */
    async executeDeleteMail(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** response：定义该变量以承载业务值。 */
            const response = await this.mailRuntimeService.deleteMails(playerId, payload?.mailIds ?? []);
            this.emitNextMailOperationResult(client, response);
            await this.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'DELETE_MAIL_FAILED', error);
        }
    }
/** handleNextRequestMarketItemBook：执行对应的业务逻辑。 */
    handleNextRequestMarketItemBook(client, payload) {
        this.executeRequestMarketItemBook(client, payload);
    }
/** executeRequestMarketItemBook：执行对应的业务逻辑。 */
    executeRequestMarketItemBook(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** response：定义该变量以承载业务值。 */
            const response = this.marketRuntimeService.buildItemBook(payload?.itemKey ?? '');
            this.emitNextMarketItemBook(client, response);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_ITEM_BOOK_FAILED', error);
        }
    }
/** handleNextRequestMarketTradeHistory：执行对应的业务逻辑。 */
    handleNextRequestMarketTradeHistory(client, payload) {
        this.executeRequestMarketTradeHistory(client, payload);
    }
/** executeRequestMarketTradeHistory：执行对应的业务逻辑。 */
    executeRequestMarketTradeHistory(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.marketTradeHistoryRequestsByPlayerId.set(playerId, Number.isFinite(payload?.page) ? Math.max(1, Math.trunc(payload.page)) : 1);
/** response：定义该变量以承载业务值。 */
            const response = this.marketRuntimeService.buildTradeHistoryPage(playerId, payload?.page);
            this.emitNextMarketTradeHistory(client, response);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_TRADE_HISTORY_FAILED', error);
        }
    }
/** handleNextRequestAttrDetail：执行对应的业务逻辑。 */
    handleNextRequestAttrDetail(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** player：定义该变量以承载业务值。 */
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.worldClientEventService.markProtocol(client, 'next');
            const bonuses = buildAttrDetailBonuses(player);
            const numericStatBreakdowns = buildAttrDetailNumericStatBreakdowns(player);
            client.emit(shared_1.NEXT_S2C.AttrDetail, {
                baseAttrs: { ...player.attrs.baseAttrs },
                bonuses,
                finalAttrs: { ...player.attrs.finalAttrs },
                numericStats: (0, shared_1.cloneNumericStats)(player.attrs.numericStats),
                ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(player.attrs.ratioDivisors),
                numericStatBreakdowns,
                alchemySkill: player.alchemySkill,
                gatherSkill: player.gatherSkill,
                enhancementSkill: player.enhancementSkill,
            });
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_ATTR_DETAIL_FAILED', error);
        }
    }
/** handleNextRequestAlchemyPanel：执行对应的业务逻辑。 */
    handleNextRequestAlchemyPanel(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** player：定义该变量以承载业务值。 */
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.AlchemyPanel, this.craftPanelRuntimeService.buildAlchemyPanelPayload(player, payload?.knownCatalogVersion));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_ALCHEMY_PANEL_FAILED', error);
        }
    }
/** handleNextRequestEnhancementPanel：执行对应的业务逻辑。 */
    handleNextRequestEnhancementPanel(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** player：定义该变量以承载业务值。 */
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.EnhancementPanel, this.craftPanelRuntimeService.buildEnhancementPanelPayload(player));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_ENHANCEMENT_PANEL_FAILED', error);
        }
    }
/** handleNextStartAlchemy：执行对应的业务逻辑。 */
    handleNextStartAlchemy(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'next');
            this.worldRuntimeService.enqueueStartAlchemy(playerId, payload);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'START_ALCHEMY_FAILED', error);
        }
    }
/** handleNextCancelAlchemy：执行对应的业务逻辑。 */
    handleNextCancelAlchemy(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'next');
            this.worldRuntimeService.enqueueCancelAlchemy(playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CANCEL_ALCHEMY_FAILED', error);
        }
    }
/** handleNextStartEnhancement：执行对应的业务逻辑。 */
    handleNextStartEnhancement(client, payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'next');
            this.worldRuntimeService.enqueueStartEnhancement(playerId, payload);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'START_ENHANCEMENT_FAILED', error);
        }
    }
/** handleNextCancelEnhancement：执行对应的业务逻辑。 */
    handleNextCancelEnhancement(client, _payload) {
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'next');
            this.worldRuntimeService.enqueueCancelEnhancement(playerId);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CANCEL_ENHANCEMENT_FAILED', error);
        }
    }
/** handleNextRequestLeaderboard：执行对应的业务逻辑。 */
    handleNextRequestLeaderboard(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.Leaderboard, this.leaderboardRuntimeService.buildLeaderboard(payload?.limit));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_LEADERBOARD_FAILED', error);
        }
    }
/** handleNextRequestWorldSummary：执行对应的业务逻辑。 */
    handleNextRequestWorldSummary(client, _payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.WorldSummary, this.leaderboardRuntimeService.buildWorldSummary());
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_WORLD_SUMMARY_FAILED', error);
        }
    }
/** handleRequestDetail：执行对应的业务逻辑。 */
    handleRequestDetail(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleRequestTileDetail：执行对应的业务逻辑。 */
    handleRequestTileDetail(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleUsePortal：执行对应的业务逻辑。 */
    handleUsePortal(client) {
/** playerId：定义该变量以承载业务值。 */
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
/** executeUseItem：执行对应的业务逻辑。 */
    executeUseItem(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextUseItem：执行对应的业务逻辑。 */
    handleNextUseItem(client, payload) {
        this.executeUseItem(client, payload);
    }
/** executeDropItem：执行对应的业务逻辑。 */
    executeDropItem(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextDropItem：执行对应的业务逻辑。 */
    handleNextDropItem(client, payload) {
        this.executeDropItem(client, payload);
    }
/** handleTakeGround：执行对应的业务逻辑。 */
    handleTakeGround(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** executeEquip：执行对应的业务逻辑。 */
    executeEquip(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextEquip：执行对应的业务逻辑。 */
    handleNextEquip(client, payload) {
        this.executeEquip(client, payload);
    }
/** executeUnequip：执行对应的业务逻辑。 */
    executeUnequip(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextUnequip：执行对应的业务逻辑。 */
    handleNextUnequip(client, payload) {
        this.executeUnequip(client, payload);
    }
/** executeCultivate：执行对应的业务逻辑。 */
    executeCultivate(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextCultivate：执行对应的业务逻辑。 */
    handleNextCultivate(client, payload) {
        this.executeCultivate(client, payload);
    }
/** handleCastSkill：执行对应的业务逻辑。 */
    handleCastSkill(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextRequestNpcShop：执行对应的业务逻辑。 */
    handleNextRequestNpcShop(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** executeCreateMarketSellOrder：执行对应的业务逻辑。 */
    async executeCreateMarketSellOrder(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** result：定义该变量以承载业务值。 */
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
/** handleNextCreateMarketSellOrder：执行对应的业务逻辑。 */
    async handleNextCreateMarketSellOrder(client, payload) {
        await this.executeCreateMarketSellOrder(client, payload);
    }
/** executeCreateMarketBuyOrder：执行对应的业务逻辑。 */
    async executeCreateMarketBuyOrder(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** result：定义该变量以承载业务值。 */
            const result = await this.marketRuntimeService.createBuyOrder(playerId, {
                itemKey: payload?.itemKey ?? '',
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
/** handleNextCreateMarketBuyOrder：执行对应的业务逻辑。 */
    async handleNextCreateMarketBuyOrder(client, payload) {
        await this.executeCreateMarketBuyOrder(client, payload);
    }
/** executeBuyMarketItem：执行对应的业务逻辑。 */
    async executeBuyMarketItem(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** result：定义该变量以承载业务值。 */
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
/** handleNextBuyMarketItem：执行对应的业务逻辑。 */
    async handleNextBuyMarketItem(client, payload) {
        await this.executeBuyMarketItem(client, payload);
    }
/** executeSellMarketItem：执行对应的业务逻辑。 */
    async executeSellMarketItem(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** result：定义该变量以承载业务值。 */
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
/** handleNextSellMarketItem：执行对应的业务逻辑。 */
    async handleNextSellMarketItem(client, payload) {
        await this.executeSellMarketItem(client, payload);
    }
/** executeCancelMarketOrder：执行对应的业务逻辑。 */
    async executeCancelMarketOrder(client, payload) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** result：定义该变量以承载业务值。 */
            const result = await this.marketRuntimeService.cancelOrder(playerId, {
                orderId: payload?.orderId ?? '',
            });
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CANCEL_MARKET_ORDER_FAILED', error);
        }
    }
/** handleNextCancelMarketOrder：执行对应的业务逻辑。 */
    async handleNextCancelMarketOrder(client, payload) {
        await this.executeCancelMarketOrder(client, payload);
    }
/** executeClaimMarketStorage：执行对应的业务逻辑。 */
    async executeClaimMarketStorage(client) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
/** result：定义该变量以承载业务值。 */
            const result = await this.marketRuntimeService.claimStorage(playerId);
            this.flushMarketResult(result);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CLAIM_MARKET_STORAGE_FAILED', error);
        }
    }
/** handleNextClaimMarketStorage：执行对应的业务逻辑。 */
    async handleNextClaimMarketStorage(client, payload) {
        await this.executeClaimMarketStorage(client);
    }
/** handleRequestNpcQuests：执行对应的业务逻辑。 */
    handleRequestNpcQuests(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleAcceptNpcQuest：执行对应的业务逻辑。 */
    handleAcceptNpcQuest(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleSubmitNpcQuest：执行对应的业务逻辑。 */
    handleSubmitNpcQuest(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** executeBuyNpcShopItem：执行对应的业务逻辑。 */
    executeBuyNpcShopItem(client, payload) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleNextBuyNpcShopItem：执行对应的业务逻辑。 */
    handleNextBuyNpcShopItem(client, payload) {
        this.executeBuyNpcShopItem(client, payload);
    }
/** handlePing：执行对应的业务逻辑。 */
    handlePing(client, payload) {
        this.worldClientEventService.emitPong(client, payload);
    }
/** emitNextQuests：执行对应的业务逻辑。 */
    emitNextQuests(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitQuests(client, payload);
    }
/** emitNextSuggestionUpdate：执行对应的业务逻辑。 */
    emitNextSuggestionUpdate(client, suggestions) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }
/** emitNextMailSummary：执行对应的业务逻辑。 */
    emitNextMailSummary(client, summary) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailSummary(client, summary);
    }
/** emitNextMailSummaryForPlayer：执行对应的业务逻辑。 */
    async emitNextMailSummaryForPlayer(client, playerId) {
        this.worldClientEventService.markProtocol(client, 'next');
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
/** emitNextMailPage：执行对应的业务逻辑。 */
    emitNextMailPage(client, page) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailPage(client, page);
    }
/** emitNextMailDetail：执行对应的业务逻辑。 */
    emitNextMailDetail(client, detail) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailDetail(client, detail);
    }
/** emitNextMailOperationResult：执行对应的业务逻辑。 */
    emitNextMailOperationResult(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMailOperationResult(client, payload);
    }
/** emitNextMarketUpdate：执行对应的业务逻辑。 */
    emitNextMarketUpdate(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketUpdate(client, payload);
    }
/** emitNextMarketListings：执行对应的业务逻辑。 */
    emitNextMarketListings(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketListings(client, payload);
    }
/** emitNextMarketOrders：执行对应的业务逻辑。 */
    emitNextMarketOrders(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketOrders(client, payload);
    }
/** emitNextMarketStorage：执行对应的业务逻辑。 */
    emitNextMarketStorage(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketStorage(client, payload);
    }
/** emitNextMarketItemBook：执行对应的业务逻辑。 */
    emitNextMarketItemBook(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketItemBook(client, payload);
    }
/** emitNextMarketTradeHistory：执行对应的业务逻辑。 */
    emitNextMarketTradeHistory(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitMarketTradeHistory(client, payload);
    }
/** emitNextNpcShop：执行对应的业务逻辑。 */
    emitNextNpcShop(client, payload) {
        this.worldClientEventService.markProtocol(client, 'next');
        this.worldClientEventService.emitNpcShop(client, payload);
    }
/** handleProtocolAction：执行对应的业务逻辑。 */
    handleProtocolAction(client, playerId, payload) {
/** actionId：定义该变量以承载业务值。 */
        const actionId = this.resolveActionId(payload);
        if (actionId === 'debug:reset_spawn' || actionId === 'travel:return_spawn') {
            this.worldRuntimeService.enqueueResetPlayerSpawn(playerId);
            return;
        }
        if (actionId === 'loot:open') {
/** tile：定义该变量以承载业务值。 */
            const tile = typeof payload?.target === 'string' ? (0, shared_1.parseTileTargetRef)(payload.target) : null;
            if (!tile) {
                throw new Error('拿取需要指定目标格子');
            }
/** player：定义该变量以承载业务值。 */
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > 1) {
                throw new Error('拿取范围只有 1 格。');
            }
            this.worldProtocolProjectionService.emitTileLootInteraction(client, playerId, this.worldRuntimeService.buildTileDetail(playerId, tile));
            return;
        }
        if (actionId === 'battle:engage' || actionId === 'battle:force_attack') {
/** target：定义该变量以承载业务值。 */
            const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
/** tile：定义该变量以承载业务值。 */
            const tile = target ? (0, shared_1.parseTileTargetRef)(target) : null;
/** targetPlayerId：定义该变量以承载业务值。 */
            const targetPlayerId = target.startsWith('player:') ? target.slice('player:'.length) : null;
/** targetMonsterId：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
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
/** resolveActionId：执行对应的业务逻辑。 */
    resolveActionId(payload) {
/** actionId：定义该变量以承载业务值。 */
        const actionId = typeof payload?.actionId === 'string' && payload.actionId.trim()
            ? payload.actionId.trim()
            : (typeof payload?.type === 'string' ? payload.type.trim() : '');
        if (!actionId) {
            throw new Error('actionId is required');
        }
        return actionId;
    }
/** emitProtocolActionResult：执行对应的业务逻辑。 */
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
/** requirePlayerId：执行对应的业务逻辑。 */
    requirePlayerId(client) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = typeof client.data.playerId === 'string' ? client.data.playerId : '';
        if (playerId) {
            return playerId;
        }
        this.worldClientEventService.emitNotReady(client);
        return null;
    }
/** requireGm：执行对应的业务逻辑。 */
    requireGm(client) {
/** playerId：定义该变量以承载业务值。 */
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
/** flushMarketResult：执行对应的业务逻辑。 */
    flushMarketResult(result) {
        this.worldClientEventService.flushMarketResult(this.marketSubscriberPlayerIds, result, {
            marketListingRequests: this.marketListingRequestsByPlayerId,
            marketTradeHistoryRequests: this.marketTradeHistoryRequestsByPlayerId,
        });
    }
/** emitMailSummary：执行对应的业务逻辑。 */
    async emitMailSummary(client, playerId) {
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
/** broadcastSuggestions：执行对应的业务逻辑。 */
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Heartbeat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextHeartbeat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmGetState),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmSpawnBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmSpawnBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveBots),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmRemoveBots", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmUpdatePlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmUpdatePlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmResetPlayer),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextGmResetPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MoveTo),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextMoveTo", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.NavigateQuest),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextNavigateQuest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Move),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DestroyItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDestroyItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SortInventory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextSortInventory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Chat),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextChat", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.AckSystemMessages),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextAckSystemMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DebugResetSpawn),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextDebugResetSpawn", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoBattleSkills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoBattleSkills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoUsePills),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoUsePills", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateCombatTargetingRules),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateCombatTargetingRules", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateAutoBattleTargetingMode),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateAutoBattleTargetingMode", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UpdateTechniqueSkillAvailability),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUpdateTechniqueSkillAvailability", null);
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailSummary", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestSuggestions),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestSuggestions", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailPage),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailPage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMailDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextRequestMailDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RedeemCodes),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRedeemCodes", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarket),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarket", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketListings),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketListings", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkMailRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkMailRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.VoteSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextVoteSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ReplySuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextReplySuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.MarkSuggestionRepliesRead),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextMarkSuggestionRepliesRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmMarkSuggestionCompleted),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmMarkSuggestionCompleted", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.GmRemoveSuggestion),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextGmRemoveSuggestion", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.ClaimMailAttachments),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextClaimMailAttachments", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.DeleteMail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextDeleteMail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketItemBook),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketItemBook", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestMarketTradeHistory),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestMarketTradeHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestAttrDetail),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestAttrDetail", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestAlchemyPanel),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestAlchemyPanel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestEnhancementPanel),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestEnhancementPanel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.StartAlchemy),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextStartAlchemy", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelAlchemy),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCancelAlchemy", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.StartEnhancement),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextStartEnhancement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelEnhancement),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextCancelEnhancement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestLeaderboard),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestLeaderboard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestWorldSummary),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestWorldSummary", null);
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.UseItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUseItem", null);
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Equip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextEquip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.Unequip),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextUnequip", null);
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
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.RequestNpcShop),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], WorldGateway.prototype, "handleNextRequestNpcShop", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketSellOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketSellOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CreateMarketBuyOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCreateMarketBuyOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.BuyMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextBuyMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.SellMarketItem),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextSellMarketItem", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(shared_1.NEXT_C2S.CancelMarketOrder),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], WorldGateway.prototype, "handleNextCancelMarketOrder", null);
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
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        leaderboard_runtime_service_1.LeaderboardRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_client_event_service_1.WorldClientEventService,
        world_session_service_1.WorldSessionService])
], WorldGateway);
/** readBooleanEnv：执行对应的业务逻辑。 */
function readBooleanEnv(key) {
/** value：定义该变量以承载业务值。 */
    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
/** buildAttrDetailBonuses：执行对应的业务逻辑。 */
function buildAttrDetailBonuses(player) {
/** bonuses：定义该变量以承载业务值。 */
    const bonuses = [];
/** realmStage：定义该变量以承载业务值。 */
    const realmStage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** realmConfig：定义该变量以承载业务值。 */
    const realmConfig = shared_1.PLAYER_REALM_CONFIG[realmStage];
    if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
        bonuses.push({
            source: `realm:${realmStage}`,
            label: player.realm?.displayName ?? player.realm?.name ?? '境界',
            attrs: clonePartialAttributes(realmConfig.attrBonus),
        });
    }
    for (const technique of player.techniques?.techniques ?? []) {
/** techniqueAttrs：定义该变量以承载业务值。 */
        const techniqueAttrs = (0, shared_1.calcTechniqueFinalAttrBonus)([toTechniqueState(technique)]);
        if (!hasNonZeroAttributes(techniqueAttrs)) {
            continue;
        }
        bonuses.push({
            source: `technique:${technique.techId}`,
            label: technique.techId,
            attrs: clonePartialAttributes(techniqueAttrs),
        });
    }
    for (const entry of player.equipment?.slots ?? []) {
/** item：定义该变量以承载业务值。 */
        const item = entry.item;
        if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(resolveItemNumericStats(item)))) {
            continue;
        }
        bonuses.push({
            source: `equipment:${entry.slot}`,
            label: item.itemId,
            attrs: clonePartialAttributes(item.equipAttrs),
            stats: clonePartialNumericStats(resolveItemNumericStats(item)),
        });
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
            continue;
        }
        bonuses.push({
            source: `buff:${buff.buffId}`,
            label: buff.name || buff.buffId,
            attrs: clonePartialAttributes(buff.attrs),
            stats: clonePartialNumericStats(buff.stats),
            qiProjection: cloneQiProjectionModifiers(buff.qiProjection),
        });
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (!hasNonZeroAttributes(bonus.attrs)
            && !hasNonZeroPartialNumericStats(bonus.stats)
            && !Array.isArray(bonus.qiProjection)
            && !isPlainObject(bonus.meta)) {
            continue;
        }
        bonuses.push({
            source: bonus.source,
            label: bonus.label ?? bonus.source,
            attrs: clonePartialAttributes(bonus.attrs),
            stats: clonePartialNumericStats(bonus.stats),
            qiProjection: cloneQiProjectionModifiers(bonus.qiProjection),
            meta: isPlainObject(bonus.meta) ? { ...bonus.meta } : undefined,
        });
    }
    return bonuses;
}
/** buildAttrDetailNumericStatBreakdowns：执行对应的业务逻辑。 */
function buildAttrDetailNumericStatBreakdowns(player) {
/** stage：定义该变量以承载业务值。 */
    const stage = player.realm?.stage ?? player.attrs?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** template：定义该变量以承载业务值。 */
    const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE];
/** realmBaseStats：定义该变量以承载业务值。 */
    const realmBaseStats = template?.stats ? (0, shared_1.cloneNumericStats)(template.stats) : (0, shared_1.createNumericStats)();
/** baseStats：定义该变量以承载业务值。 */
    const baseStats = (0, shared_1.cloneNumericStats)(realmBaseStats);
/** flatBuffStats：定义该变量以承载业务值。 */
    const flatBuffStats = (0, shared_1.createNumericStats)();
/** attrMultipliers：定义该变量以承载业务值。 */
    const attrMultipliers = (0, shared_1.createNumericStats)();
/** finalAttrs：定义该变量以承载业务值。 */
    const finalAttrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs;
    if (finalAttrs) {
        for (const key of shared_1.ATTR_KEYS) {
/** value：定义该变量以承载业务值。 */
            const value = Number(finalAttrs[key] ?? 0);
            if (value === 0) {
                continue;
            }
            (0, shared_1.addPartialNumericStats)(baseStats, scalePartialNumericStats(shared_1.ATTR_TO_NUMERIC_WEIGHTS[key], value));
            (0, shared_1.addPartialNumericStats)(attrMultipliers, scalePartialNumericStats(shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key], value));
        }
    }
    for (const entry of player.equipment?.slots ?? []) {
/** item：定义该变量以承载业务值。 */
        const item = entry.item;
        if (!item) {
            continue;
        }
        (0, shared_1.addPartialNumericStats)(baseStats, resolveItemNumericStats(item));
    }
    for (const bonus of collectProjectedRuntimeBonuses(player.runtimeBonuses)) {
        if (bonus?.stats) {
            (0, shared_1.addPartialNumericStats)(baseStats, bonus.stats);
        }
    }
/** vitalBaselineBonus：定义该变量以承载业务值。 */
    const vitalBaselineBonus = resolveVitalBaselineBonus(player.runtimeBonuses);
    if (vitalBaselineBonus?.stats) {
        (0, shared_1.addPartialNumericStats)(baseStats, vitalBaselineBonus.stats);
    }
    for (const buff of player.buffs?.buffs ?? []) {
        if (buff?.stats) {
            (0, shared_1.addPartialNumericStats)(flatBuffStats, buff.stats);
        }
    }
/** preMultiplierStats：定义该变量以承载业务值。 */
    const preMultiplierStats = (0, shared_1.cloneNumericStats)(baseStats);
    (0, shared_1.addPartialNumericStats)(preMultiplierStats, flatBuffStats);
/** finalStats：定义该变量以承载业务值。 */
    const finalStats = player.attrs?.numericStats ?? preMultiplierStats;
/** breakdowns：定义该变量以承载业务值。 */
    const breakdowns = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
/** realmBaseValue：定义该变量以承载业务值。 */
        const realmBaseValue = getNumericStatValue(realmBaseStats, key);
/** baseValue：定义该变量以承载业务值。 */
        const baseValue = getNumericStatValue(baseStats, key);
/** flatBuffValue：定义该变量以承载业务值。 */
        const flatBuffValue = getNumericStatValue(flatBuffStats, key);
        breakdowns[key] = {
            realmBaseValue,
            bonusBaseValue: baseValue - realmBaseValue,
            baseValue,
            flatBuffValue,
            preMultiplierValue: getNumericStatValue(preMultiplierStats, key),
            attrMultiplierPct: getNumericStatValue(attrMultipliers, key),
            realmMultiplier: 1,
            buffMultiplierPct: 0,
            pillMultiplierPct: 0,
            finalValue: getNumericStatValue(finalStats, key),
        };
    }
    return breakdowns;
}
/** getNumericStatValue：执行对应的业务逻辑。 */
function getNumericStatValue(stats, key) {
/** value：定义该变量以承载业务值。 */
    const value = stats?.[key];
    return typeof value === 'number' ? value : 0;
}
/** scalePartialNumericStats：执行对应的业务逻辑。 */
function scalePartialNumericStats(stats, factor) {
    if (!stats || factor === 0) {
        return undefined;
    }
/** result：定义该变量以承载业务值。 */
    const result = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
/** value：定义该变量以承载业务值。 */
        const value = stats[key];
        if (value !== undefined) {
            result[key] = value * factor;
        }
    }
    for (const groupKey of ['elementDamageBonus', 'elementDamageReduce']) {
/** group：定义该变量以承载业务值。 */
        const group = stats[groupKey];
        if (!isPlainObject(group)) {
            continue;
        }
/** scaledGroup：定义该变量以承载业务值。 */
        const scaledGroup = {};
        for (const key of shared_1.ELEMENT_KEYS) {
/** value：定义该变量以承载业务值。 */
            const value = group[key];
            if (value !== undefined) {
                scaledGroup[key] = value * factor;
            }
        }
        if (Object.keys(scaledGroup).length > 0) {
            result[groupKey] = scaledGroup;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
/** collectProjectedRuntimeBonuses：执行对应的业务逻辑。 */
function collectProjectedRuntimeBonuses(runtimeBonuses) {
    if (!Array.isArray(runtimeBonuses) || runtimeBonuses.length === 0) {
        return [];
    }
    return runtimeBonuses.filter((entry) => {
/** source：定义该变量以承载业务值。 */
        const source = typeof entry?.source === 'string' ? entry.source : '';
        return Boolean(source && !isDerivedRuntimeBonusSource(source) && (entry.attrs || entry.stats));
    });
}
/** resolveVitalBaselineBonus：执行对应的业务逻辑。 */
function resolveVitalBaselineBonus(runtimeBonuses) {
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
/** isDerivedRuntimeBonusSource：执行对应的业务逻辑。 */
function isDerivedRuntimeBonusSource(source) {
    if (typeof source !== 'string' || source.length === 0) {
        return true;
    }
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
/** resolveItemNumericStats：执行对应的业务逻辑。 */
function resolveItemNumericStats(item) {
    return item?.equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(item.equipValueStats) : item?.equipStats;
}
/** hasNonZeroAttributes：执行对应的业务逻辑。 */
function hasNonZeroAttributes(attrs) {
    if (!attrs) {
        return false;
    }
    return shared_1.ATTR_KEYS.some((key) => Number(attrs[key] ?? 0) !== 0);
}
/** hasNonZeroPartialNumericStats：执行对应的业务逻辑。 */
function hasNonZeroPartialNumericStats(stats) {
    if (!stats) {
        return false;
    }
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        if (Number(stats[key] ?? 0) !== 0) {
            return true;
        }
    }
    return ['elementDamageBonus', 'elementDamageReduce'].some((groupKey) => {
/** group：定义该变量以承载业务值。 */
        const group = stats[groupKey];
        return isPlainObject(group) && Object.values(group).some((value) => Number(value ?? 0) !== 0);
    });
}
/** clonePartialAttributes：执行对应的业务逻辑。 */
function clonePartialAttributes(attrs) {
/** result：定义该变量以承载业务值。 */
    const result = {};
    for (const key of shared_1.ATTR_KEYS) {
/** value：定义该变量以承载业务值。 */
        const value = Number(attrs?.[key] ?? 0);
        if (value !== 0) {
            result[key] = value;
        }
    }
    return result;
}
/** clonePartialNumericStats：执行对应的业务逻辑。 */
function clonePartialNumericStats(stats) {
    if (!stats) {
        return undefined;
    }
/** clone：定义该变量以承载业务值。 */
    const clone = {};
    for (const key of shared_1.NUMERIC_SCALAR_STAT_KEYS) {
        if (stats[key] !== undefined) {
            clone[key] = stats[key];
        }
    }
    if (isPlainObject(stats.elementDamageBonus)) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (isPlainObject(stats.elementDamageReduce)) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
/** cloneQiProjectionModifiers：执行对应的业务逻辑。 */
function cloneQiProjectionModifiers(source) {
    if (!Array.isArray(source) || source.length === 0) {
        return undefined;
    }
    return source.map((entry) => ({
        ...entry,
        selector: entry.selector
            ? {
                ...entry.selector,
                resourceKeys: entry.selector.resourceKeys ? entry.selector.resourceKeys.slice() : undefined,
                families: entry.selector.families ? entry.selector.families.slice() : undefined,
                forms: entry.selector.forms ? entry.selector.forms.slice() : undefined,
                elements: entry.selector.elements ? entry.selector.elements.slice() : undefined,
            }
            : undefined,
    }));
}
/** toTechniqueState：执行对应的业务逻辑。 */
function toTechniqueState(entry) {
/** skills：定义该变量以承载业务值。 */
    const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
    return {
        techId: entry.techId,
        name: '',
        level: entry.level ?? 1,
        exp: entry.exp ?? 0,
        expToNext: entry.expToNext ?? 0,
        realmLv: entry.realmLv ?? 1,
        realm: entry.realm ?? shared_1.TechniqueRealm.Entry,
        skillsEnabled: entry.skillsEnabled !== false,
        skills,
        grade: entry.grade ?? undefined,
        category: entry.category ?? undefined,
        layers: entry.layers?.map((layer) => ({
            level: layer.level,
            expToNext: layer.expToNext,
            attrs: layer.attrs ? { ...layer.attrs } : undefined,
        })),
        attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
    };
}
/** cloneTechniqueSkill：执行对应的业务逻辑。 */
function cloneTechniqueSkill(source) {
    return {
        ...source,
        name: '',
        desc: '',
    };
}
/** isPlainObject：执行对应的业务逻辑。 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
//# sourceMappingURL=world.gateway.js.map

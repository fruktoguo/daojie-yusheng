"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayBootstrapHelper = void 0;

const AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES = new Set([
    'next',
    'token',
]);
const GUEST_HELLO_IDENTITY_OVERRIDE_KEYS = Object.freeze([
    'playerId',
    'requestedPlayerId',
]);
const AUTHENTICATED_CONNECT_CONTRACT = Object.freeze({
    protocolRequiredCode: 'AUTH_PROTOCOL_REQUIRED',
    unsupportedProtocolCode: 'AUTH_PROTOCOL_UNSUPPORTED',
    invalidSessionIdCode: 'AUTH_SESSION_ID_INVALID',
    authFailCode: 'AUTH_FAIL',
    legacyProtocolDisabledCode: 'LEGACY_PROTOCOL_DISABLED',
});
const GM_CONNECT_CONTRACT = Object.freeze({
    authFailCode: 'GM_AUTH_FAIL',
    playerAuthRequiredCode: 'GM_PLAYER_AUTH_REQUIRED',
    sessionIdForbiddenCode: 'GM_SESSION_ID_FORBIDDEN',
});
const GUEST_HELLO_CONTRACT = Object.freeze({
    protocolMismatchCode: 'HELLO_PROTOCOL_MISMATCH',
    unsupportedProtocolCode: 'HELLO_PROTOCOL_UNSUPPORTED',
    authBootstrapForbiddenCode: 'HELLO_AUTH_BOOTSTRAP_FORBIDDEN',
    sessionIdInvalidCode: 'HELLO_SESSION_ID_INVALID',
    identityOverrideForbiddenCode: 'HELLO_IDENTITY_OVERRIDE_FORBIDDEN',
    helloFailedCode: 'HELLO_FAILED',
});
/** 世界 socket 引导 helper：收敛 connect/hello/bootstrap 的协议判断与输入构建。 */
class WorldGatewayBootstrapHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
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
        return this.gateway.sessionBootstrapService.pickSocketToken(client).length > 0
            || this.gateway.sessionBootstrapService.pickSocketGmToken(client).length > 0;
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
        const requestedSessionId = this.gateway.sessionBootstrapService.pickSocketRequestedSessionId(client);
        if (!requestedSessionId) {
            return undefined;
        }
        if (client?.data?.isGm === true) {
            this.gateway.logger.warn(`已忽略 GM 引导中的请求 sessionId：socket=${client.id} sessionId=${requestedSessionId}`);
            return undefined;
        }
        const authSource = this.resolveAuthenticatedIdentitySource(client, identity);
        if (!AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES.has(authSource)) {
            this.gateway.logger.warn(`已忽略鉴权引导中的请求 sessionId：socket=${client.id} authSource=${authSource || '未知'} sessionId=${requestedSessionId}`);
            return undefined;
        }
        if (!this.gateway.sessionBootstrapService.shouldAllowRequestedDetachedResume(client)) {
            this.gateway.logger.warn(`由于复用策略已忽略鉴权引导中的请求 sessionId：socket=${client.id} authSource=${authSource || '未知'} sessionId=${requestedSessionId}`);
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
            loadSnapshot: () => this.gateway.sessionBootstrapService.loadAuthenticatedPlayerSnapshot(identity, client),
        };
    }
    startAuthenticatedBootstrap(client, entryPath, identity) {
        const existing = this.resolveBootstrapPromise(client);
        if (existing) {
            return existing;
        }
        this.setBootstrapTraceContext(client, entryPath, identity);
        client.data.authenticatedSnapshotRecovery = null;
        client.data.authenticatedSnapshotRecoveryFallback = null;
        const promise = (async () => {
            await this.gateway.sessionBootstrapService.bootstrapPlayerSession(client, this.buildAuthenticatedBootstrapInput(client, identity));
            client.data.userId = identity.userId;
        })();
        return this.rememberBootstrapPromise(client, promise);
    }
    resolveGuestDetachedBinding(payloadSessionId) {
        return this.gateway.worldSessionService.getDetachedBindingBySessionId(payloadSessionId);
    }
    rejectAuthenticatedConnect(client, code, message) {
        this.gateway.worldClientEventService.emitError(client, code, message);
        client.disconnect(true);
        return null;
    }
    rejectGmConnect(client, code, message) {
        this.gateway.worldClientEventService.emitError(client, code, message);
        client.disconnect(true);
        return null;
    }
    rejectGuestHello(client, code, message) {
        this.gateway.worldClientEventService.emitError(client, code, message);
        client.disconnect(true);
        return false;
    }
    buildGuestHelloBootstrapInput(client, payload) {
        const detachedBinding = this.resolveGuestDetachedBinding(payload?.sessionId);
        const guestDetachedBinding = detachedBinding && this.gateway.worldSessionService.isGuestPlayerId(detachedBinding.playerId)
            ? detachedBinding
            : null;
        if (detachedBinding && !guestDetachedBinding) {
            this.gateway.logger.warn(`已拒绝非游客绑定上的游客 hello 脱机续连：socket=${client.id} playerId=${detachedBinding.playerId} sessionId=${detachedBinding.sessionId}`);
        }
        const playerId = guestDetachedBinding?.playerId ?? this.gateway.worldSessionService.createGuestPlayerId();
        const mapId = guestDetachedBinding ? undefined : payload.mapId;
        const preferredX = guestDetachedBinding ? undefined : payload.preferredX;
        const preferredY = guestDetachedBinding ? undefined : payload.preferredY;
        return {
            playerId,
            requestedSessionId: guestDetachedBinding?.sessionId,
            mapId,
            preferredX,
            preferredY,
            loadSnapshot: () => this.gateway.sessionBootstrapService.loadPlayerSnapshot(playerId),
        };
    }
    async handleGuestHello(client, payload) {
        this.setBootstrapTraceContext(client, 'hello_guest', null);
        await this.gateway.sessionBootstrapService.bootstrapPlayerSession(client, this.buildGuestHelloBootstrapInput(client, payload));
    }
    async resolveBootstrapAuthContext(client, options = undefined) {
        const allowGuest = options?.allowGuest === true;
        const token = this.gateway.sessionBootstrapService.pickSocketToken(client);
        const gmToken = this.gateway.sessionBootstrapService.pickSocketGmToken(client);
        const requestedSessionInspection = this.gateway.sessionBootstrapService.inspectSocketRequestedSessionId(client);
        const protocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if ((token || gmToken) && protocol === 'next' && requestedSessionInspection.error) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.invalidSessionIdCode, 'next 认证握手 sessionId 非法');
        }
        if (gmToken) {
            if (!this.gateway.sessionBootstrapService.authenticateSocketGmToken(gmToken)) {
                return this.rejectGmConnect(client, GM_CONNECT_CONTRACT.authFailCode, 'GM 认证失败');
            }
            if (!token) {
                return this.rejectGmConnect(client, GM_CONNECT_CONTRACT.playerAuthRequiredCode, 'GM socket 需要同时提供玩家登录令牌');
            }
            if (requestedSessionInspection.sessionId) {
                return this.rejectGmConnect(client, GM_CONNECT_CONTRACT.sessionIdForbiddenCode, 'GM socket 不允许携带 sessionId 续连');
            }
            client.data.isGm = true;
            client.data.gmRole = 'gm';
        }
        if (!token) {
            return allowGuest ? { identity: null } : null;
        }
        const identity = await this.gateway.sessionBootstrapService.authenticateSocketToken(token, {
            protocol,
        });
        if (!identity) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, '认证失败');
        }
        if (protocol === 'next' && identity.authSource !== 'next' && identity.authSource !== 'token') {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, 'NEXT 协议仅允许 next 真源身份');
        }
        const authenticatedBootstrapContractViolation = this.gateway.sessionBootstrapService.resolveAuthenticatedBootstrapContractViolation(client, {
            authSource: this.resolveAuthenticatedIdentitySource(client, identity),
            persistedSource: this.resolveAuthenticatedIdentityPersistedSource(client, identity),
        });
        if (authenticatedBootstrapContractViolation) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, authenticatedBootstrapContractViolation.message);
        }
        return { identity };
    }
    ensureConnectionProtocol(client) {
        const handshakeProtocol = typeof client.handshake?.auth?.protocol === 'string'
            ? client.handshake.auth.protocol.trim().toLowerCase()
            : '';
        const hasAuthHint = this.hasSocketAuthHint(client);
        if (handshakeProtocol === 'next') {
            this.gateway.worldClientEventService.markProtocol(client, handshakeProtocol);
            return true;
        }
        if (handshakeProtocol === 'legacy') {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.legacyProtocolDisabledCode, 'legacy socket API 已移除，仅支持 next 协议握手') !== null;
        }
        if (handshakeProtocol && hasAuthHint) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.unsupportedProtocolCode, `不支持的握手协议: ${handshakeProtocol}`) !== null;
        }
        if (!handshakeProtocol && hasAuthHint) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.protocolRequiredCode, 'token/gmToken 连接必须声明握手协议') !== null;
        }
        return true;
    }
    async startConnectionBootstrap(client) {
        const authContext = await this.resolveBootstrapAuthContext(client);
        if (!authContext?.identity) {
            return;
        }
        const { identity } = authContext;
        void this.startAuthenticatedBootstrap(client, this.resolveAuthenticatedBootstrapEntryPath(client), identity).catch((error) => {
            this.gateway.worldClientEventService.emitGatewayError(client, 'AUTH_FAIL', error);
            client.disconnect(true);
        });
    }
    ensureHelloProtocol(client) {
        const currentProtocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if (currentProtocol === 'legacy') {
            return this.rejectGuestHello(client, GUEST_HELLO_CONTRACT.protocolMismatchCode, 'legacy 握手连接不能进入 next hello 链路');
        }
        if (currentProtocol && currentProtocol !== 'next') {
            return this.rejectGuestHello(client, GUEST_HELLO_CONTRACT.unsupportedProtocolCode, `不支持的 hello 协议上下文: ${currentProtocol}`);
        }
        this.gateway.worldClientEventService.markProtocol(client, 'next');
        return true;
    }
    async shouldAllowGuestHelloBootstrap(client, payload) {
        if (this.hasSocketAuthHint(client)) {
            const waited = await this.awaitPendingBootstrap(client);
            if (waited) {
                return false;
            }
            this.gateway.logger.warn(`已拒绝 token hello 引导回退：socket=${client.id} protocol=${'next'}`);
            return this.rejectGuestHello(client, GUEST_HELLO_CONTRACT.authBootstrapForbiddenCode, 'token/gmToken 连接只允许 connect 阶段 bootstrap');
        }
        const requestedSessionInspection = this.gateway.sessionBootstrapService.inspectRequestedSessionId(payload?.sessionId, client, 'hello');
        if (requestedSessionInspection.error) {
            return this.rejectGuestHello(client, GUEST_HELLO_CONTRACT.sessionIdInvalidCode, 'hello 请求 sessionId 非法');
        }
        const identityOverrideKeys = GUEST_HELLO_IDENTITY_OVERRIDE_KEYS.filter((key) => typeof payload?.[key] === 'string' && payload[key].trim());
        if (identityOverrideKeys.length > 0) {
            return this.rejectGuestHello(client, GUEST_HELLO_CONTRACT.identityOverrideForbiddenCode, 'guest hello 不允许自带 playerId/requestedPlayerId');
        }
        return true;
    }
    async handleConnection(client) {
        this.gateway.logger.debug(`Socket 已连接：${client.id}`);
        if (!this.ensureConnectionProtocol(client)) {
            return;
        }
        if (this.gateway.gatewayGuardHelper.rejectWhenNotReady(client)) {
            return;
        }
        if (typeof client.data.playerId === 'string') {
            return;
        }
        try {
            await this.startConnectionBootstrap(client);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, error);
            client.disconnect(true);
        }
    }
    async handleHello(client, payload) {
        if (!this.ensureHelloProtocol(client)) {
            return;
        }
        try {
            if (this.gateway.gatewayGuardHelper.rejectWhenNotReady(client)) {
                return;
            }
            if (typeof client.data.playerId === 'string' && client.data.playerId.trim()) {
                return;
            }
            if (!(await this.shouldAllowGuestHelloBootstrap(client, payload))) {
                return;
            }
            await this.handleGuestHello(client, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, GUEST_HELLO_CONTRACT.helloFailedCode, error);
        }
    }
}
exports.WorldGatewayBootstrapHelper = WorldGatewayBootstrapHelper;

// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayBootstrapHelper = void 0;

const AUTHENTICATED_REQUESTED_SESSION_ID_AUTH_SOURCES = new Set([
    'mainline',
    'token',
]);
const AUTHENTICATED_CONNECT_CONTRACT = Object.freeze({
    protocolRequiredCode: 'AUTH_PROTOCOL_REQUIRED',
    unsupportedProtocolCode: 'AUTH_PROTOCOL_UNSUPPORTED',
    invalidSessionIdCode: 'AUTH_SESSION_ID_INVALID',
    authFailCode: 'AUTH_FAIL',
    legacyProtocolDisabledCode: 'LEGACY_PROTOCOL_DISABLED',
    unauthenticatedDisabledCode: 'AUTH_FAIL',
});
const GM_CONNECT_CONTRACT = Object.freeze({
    authFailCode: 'GM_AUTH_FAIL',
    playerAuthRequiredCode: 'GM_PLAYER_AUTH_REQUIRED',
    sessionIdForbiddenCode: 'GM_SESSION_ID_FORBIDDEN',
});

/** 世界 socket 引导 helper：收敛 connect/hello/bootstrap 的协议判断与输入构建。 */
class WorldGatewayBootstrapHelper {
/**
 * gateway：gateway相关字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * setBootstrapTraceContext：写入引导Trace上下文。
 * @param client 参数说明。
 * @param entryPath 参数说明。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新BootstrapTrace上下文相关状态。
 */

    setBootstrapTraceContext(client, entryPath, identity) {
        client.data.bootstrapEntryPath = entryPath;
        client.data.bootstrapIdentitySource = identity?.authSource ?? null;
        client.data.bootstrapIdentityPersistedSource = identity?.persistedSource ?? null;
        client.data.bootstrapSnapshotSource = null;
        client.data.bootstrapSnapshotPersistedSource = null;
    }    
    /**
 * resolveBootstrapPromise：判断引导Promise是否满足条件。
 * @param client 参数说明。
 * @returns 无返回值，直接更新BootstrapPromise相关状态。
 */

    resolveBootstrapPromise(client) {
        const promise = client?.data?.bootstrapPromise;
        return promise && typeof promise.then === 'function' ? promise : null;
    }    
    /**
 * rememberBootstrapPromise：判断remember引导Promise是否满足条件。
 * @param client 参数说明。
 * @param promise 参数说明。
 * @returns 无返回值，直接更新rememberBootstrapPromise相关状态。
 */

    rememberBootstrapPromise(client, promise) {
        client.data.bootstrapPromise = promise;
        promise.finally(() => {
            if (client.data.bootstrapPromise === promise) {
                client.data.bootstrapPromise = null;
            }
        }).catch(() => undefined);
        return promise;
    }    
    /**
 * awaitPendingBootstrap：执行await待处理引导相关逻辑。
 * @param client 参数说明。
 * @returns 无返回值，直接更新awaitPendingBootstrap相关状态。
 */

    async awaitPendingBootstrap(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * hasSocketAuthHint：判断Socket认证Hint是否满足条件。
 * @param client 参数说明。
 * @returns 无返回值，完成Socket认证Hint的条件判断。
 */

    hasSocketAuthHint(client) {
        return this.gateway.sessionBootstrapService.pickSocketToken(client).length > 0
            || this.gateway.sessionBootstrapService.pickSocketGmToken(client).length > 0;
    }    
    /**
 * resolveAuthenticatedBootstrapEntryPath：规范化或转换Authenticated引导条目路径。
 * @param client 参数说明。
 * @returns 无返回值，直接更新AuthenticatedBootstrap条目路径相关状态。
 */

    resolveAuthenticatedBootstrapEntryPath(client) {
        return client?.data?.isGm === true ? 'connect_gm_token' : 'connect_token';
    }    
    /**
 * resolveAuthenticatedIdentitySource：规范化或转换AuthenticatedIdentity来源。
 * @param client 参数说明。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新AuthenticatedIdentity来源相关状态。
 */

    resolveAuthenticatedIdentitySource(client, identity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const authSource = typeof identity?.authSource === 'string' ? identity.authSource.trim() : '';
        if (authSource) {
            return authSource;
        }
        const bootstrapIdentitySource = typeof client?.data?.bootstrapIdentitySource === 'string'
            ? client.data.bootstrapIdentitySource.trim()
            : '';
        return bootstrapIdentitySource;
    }    
    /**
 * resolveAuthenticatedIdentityPersistedSource：判断AuthenticatedIdentityPersisted来源是否满足条件。
 * @param client 参数说明。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新AuthenticatedIdentityPersisted来源相关状态。
 */

    resolveAuthenticatedIdentityPersistedSource(client, identity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
        if (persistedSource) {
            return persistedSource;
        }
        const bootstrapIdentityPersistedSource = typeof client?.data?.bootstrapIdentityPersistedSource === 'string'
            ? client.data.bootstrapIdentityPersistedSource.trim()
            : '';
        return bootstrapIdentityPersistedSource;
    }    
    /**
 * resolveAuthenticatedRequestedSessionId：规范化或转换AuthenticatedRequestedSessionID。
 * @param client 参数说明。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新AuthenticatedRequestedSessionID相关状态。
 */

    resolveAuthenticatedRequestedSessionId(client, identity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * buildAuthenticatedBootstrapInput：构建并返回目标对象。
 * @param client 参数说明。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新AuthenticatedBootstrap输入相关状态。
 */

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
    /**
 * startAuthenticatedBootstrap：执行开始Authenticated引导相关逻辑。
 * @param client 参数说明。
 * @param entryPath 参数说明。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新startAuthenticatedBootstrap相关状态。
 */

    startAuthenticatedBootstrap(client, entryPath, identity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * rejectAuthenticatedConnect：执行rejectAuthenticatedConnect相关逻辑。
 * @param client 参数说明。
 * @param code 参数说明。
 * @param message 参数说明。
 * @returns 无返回值，直接更新rejectAuthenticatedConnect相关状态。
 */

    rejectAuthenticatedConnect(client, code, message) {
        this.gateway.worldClientEventService.emitError(client, code, message);
        client.disconnect(true);
        return null;
    }    
    /**
 * rejectUnauthenticatedConnect：拒绝未登录 socket 连接。
 * @param client 参数说明。
 * @returns 无返回值，直接更新未登录连接拒绝相关状态。
 */

    rejectUnauthenticatedConnect(client) {
        this.gateway.logger.warn(`已拒绝未登录 socket 连接：socket=${client.id} protocol=${typeof client?.data?.protocol === 'string' ? client.data.protocol : 'unknown'}`);
        return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.unauthenticatedDisabledCode, '未登录连接已禁用，请先登录');
    }    
    /**
 * rejectGmConnect：执行rejectGMConnect相关逻辑。
 * @param client 参数说明。
 * @param code 参数说明。
 * @param message 参数说明。
 * @returns 无返回值，直接更新rejectGMConnect相关状态。
 */

    rejectGmConnect(client, code, message) {
        this.gateway.worldClientEventService.emitError(client, code, message);
        client.disconnect(true);
        return null;
    }    
    /**
 * resolveBootstrapAuthContext：规范化或转换引导认证上下文。
 * @param client 参数说明。
 * @returns 无返回值，直接更新Bootstrap认证上下文相关状态。
 */

    async resolveBootstrapAuthContext(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const token = this.gateway.sessionBootstrapService.pickSocketToken(client);
        const gmToken = this.gateway.sessionBootstrapService.pickSocketGmToken(client);
        const requestedSessionInspection = this.gateway.sessionBootstrapService.inspectSocketRequestedSessionId(client);
        const protocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if ((token || gmToken) && protocol === 'mainline' && requestedSessionInspection.error) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.invalidSessionIdCode, '主线认证握手 sessionId 非法');
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
            return null;
        }
        const identity = await this.gateway.sessionBootstrapService.authenticateSocketToken(token, {
            protocol,
        });
        if (!identity) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, '认证失败');
        }
        if (protocol === 'mainline' && identity.authSource !== 'mainline' && identity.authSource !== 'token') {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, 'mainline 协议仅允许 主线真源身份');
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
    /**
 * ensureConnectionProtocol：执行ensureConnectionProtocol相关逻辑。
 * @param client 参数说明。
 * @returns 无返回值，直接更新ensureConnectionProtocol相关状态。
 */

    ensureConnectionProtocol(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const handshakeProtocol = typeof client.handshake?.auth?.protocol === 'string'
            ? client.handshake.auth.protocol.trim().toLowerCase()
            : '';
        const hasAuthHint = this.hasSocketAuthHint(client);
        if (handshakeProtocol === 'mainline') {
            this.gateway.worldClientEventService.markProtocol(client, handshakeProtocol);
            return true;
        }
        if (handshakeProtocol === 'legacy') {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.legacyProtocolDisabledCode, 'legacy socket API 已移除，仅支持 mainline 协议握手') !== null;
        }
        if (handshakeProtocol && hasAuthHint) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.unsupportedProtocolCode, `不支持的握手协议: ${handshakeProtocol}`) !== null;
        }
        if (!handshakeProtocol && hasAuthHint) {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.protocolRequiredCode, 'token/gmToken 连接必须声明握手协议') !== null;
        }
        return true;
    }    
    /**
 * startConnectionBootstrap：执行开始Connection引导相关逻辑。
 * @param client 参数说明。
 * @returns 无返回值，直接更新startConnectionBootstrap相关状态。
 */

    async startConnectionBootstrap(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const authContext = await this.resolveBootstrapAuthContext(client);
        if (!authContext?.identity) {
            return;
        }
        const { identity } = authContext;
        await this.startAuthenticatedBootstrap(client, this.resolveAuthenticatedBootstrapEntryPath(client), identity);
    }    
    /**
 * ensureHelloProtocol：执行ensureHelloProtocol相关逻辑。
 * @param client 参数说明。
 * @returns 无返回值，直接更新ensureHelloProtocol相关状态。
 */

    ensureHelloProtocol(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const currentProtocol = typeof client?.data?.protocol === 'string' ? client.data.protocol.trim().toLowerCase() : '';
        if (currentProtocol === 'legacy') {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.legacyProtocolDisabledCode, 'legacy 握手连接不能进入 mainline hello 链路') !== null;
        }
        if (currentProtocol && currentProtocol !== 'mainline') {
            return this.rejectAuthenticatedConnect(client, AUTHENTICATED_CONNECT_CONTRACT.unsupportedProtocolCode, `不支持的 hello 协议上下文: ${currentProtocol}`) !== null;
        }
        this.gateway.worldClientEventService.markProtocol(client, 'mainline');
        return true;
    }    
    /**
 * handleConnection：处理Connection并更新相关状态。
 * @param client 参数说明。
 * @returns 无返回值，直接更新Connection相关状态。
 */

    async handleConnection(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.gateway.logger.debug(`Socket 已连接：${client.id}`);
        if (!this.ensureConnectionProtocol(client)) {
            return;
        }
        if (this.gateway.gatewayGuardHelper.rejectWhenNotReady(client)) {
            return;
        }
        if (!this.hasSocketAuthHint(client)) {
            this.rejectUnauthenticatedConnect(client);
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
    /**
 * handleHello：处理Hello并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Hello相关状态。
 */

    async handleHello(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.ensureHelloProtocol(client)) {
            return;
        }
        try {
            if (this.gateway.gatewayGuardHelper.rejectWhenNotReady(client)) {
                return;
            }
            if (!this.hasSocketAuthHint(client)) {
                this.rejectUnauthenticatedConnect(client);
                return;
            }
            if (typeof client.data.playerId === 'string' && client.data.playerId.trim()) {
                return;
            }
            if (await this.awaitPendingBootstrap(client)) {
                return;
            }
            await this.startConnectionBootstrap(client);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, AUTHENTICATED_CONNECT_CONTRACT.authFailCode, error);
            client.disconnect(true);
        }
    }
}
exports.WorldGatewayBootstrapHelper = WorldGatewayBootstrapHelper;

export { WorldGatewayBootstrapHelper };

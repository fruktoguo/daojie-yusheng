// @ts-nocheck

/**
 * 用途：执行 session 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const world_session_reaper_service_1 = require("../network/world-session-reaper.service");
const world_session_service_1 = require("../network/world-session.service");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录会话断开后的保留时长。
 */
const SESSION_DETACH_EXPIRE_MS = Number.isFinite(Number(process.env.SERVER_SESSION_DETACH_EXPIRE_MS))
    ? Math.max(0, Math.trunc(Number(process.env.SERVER_SESSION_DETACH_EXPIRE_MS)))
    : 15_000;
const LEGACY_C2S_PING_EVENT = 'c:ping';
const LEGACY_S2C_ERROR_EVENT = 's:error';
const LEGACY_S2C_PONG_EVENT = 's:pong';
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录服务证明链。
 */
    const serviceProof = verifyWorldSessionServiceMismatchProof();
/**
 * 记录reaper证明链。
 */
    const reaperProof = await verifyWorldSessionReaperProof();
/**
 * 记录invalidhello。
 */
    const invalidHello = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录invalidhelloerror。
 */
    let invalidHelloError = null;
/**
 * 记录invalidhellodisconnected。
 */
    let invalidHelloDisconnected = false;
/**
 * 记录invalidhelloinitcount。
 */
    let invalidHelloInitCount = 0;
    await onceConnected(invalidHello);
    invalidHello.on(shared_1.S2C.Error, (payload) => {
        invalidHelloError = payload;
    });
    invalidHello.on(shared_1.S2C.InitSession, () => {
        invalidHelloInitCount += 1;
    });
    invalidHello.on('disconnect', () => {
        invalidHelloDisconnected = true;
    });
    invalidHello.emit('n:c:hello', {
        sessionId: 'invalid hello session!*',
    });
    await waitFor(() => invalidHelloError !== null && invalidHelloDisconnected, 4000);
/**
 * 记录隐式legacy。
 */
    const implicitLegacy = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录隐式legacy错误。
 */
    let implicitLegacyError = null;
/**
 * 记录隐式legacy断开。
 */
    let implicitLegacyDisconnected = false;
/**
 * 记录隐式legacy下行pong数量。
 */
    let implicitLegacyLegacyPongCount = 0;
/**
 * 记录隐式legacy next pong数量。
 */
    let implicitLegacyNextPongCount = 0;
    await onceConnected(implicitLegacy);
    implicitLegacy.on(shared_1.S2C.Error, (payload) => {
        implicitLegacyError = payload;
    });
    implicitLegacy.on(LEGACY_S2C_PONG_EVENT, () => {
        implicitLegacyLegacyPongCount += 1;
    });
    implicitLegacy.on(shared_1.S2C.Pong, () => {
        implicitLegacyNextPongCount += 1;
    });
    implicitLegacy.on('disconnect', () => {
        implicitLegacyDisconnected = true;
    });
    implicitLegacy.emit(LEGACY_C2S_PING_EVENT, {
        clientAt: Date.now(),
    });
    await delay(600);
    implicitLegacy.close();
/**
 * 记录显式legacy。
 */
    const explicitLegacy = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            protocol: 'legacy',
        },
    });
/**
 * 记录显式legacy错误。
 */
    let explicitLegacyError = null;
/**
 * 记录显式legacy pong。
 */
    let explicitLegacyLegacyPong = null;
/**
 * 记录显式legacy next pong数量。
 */
    let explicitLegacyNextPongCount = 0;
/**
 * 记录显式legacy断开。
 */
    let explicitLegacyDisconnected = false;
    explicitLegacy.on(shared_1.S2C.Error, (payload) => {
        explicitLegacyError = payload;
    });
    explicitLegacy.on(LEGACY_S2C_ERROR_EVENT, (payload) => {
        explicitLegacyError = payload;
    });
    explicitLegacy.on(LEGACY_S2C_PONG_EVENT, (payload) => {
        explicitLegacyLegacyPong = payload;
    });
    explicitLegacy.on(shared_1.S2C.Pong, () => {
        explicitLegacyNextPongCount += 1;
    });
    explicitLegacy.on('disconnect', () => {
        explicitLegacyDisconnected = true;
    });
    await onceConnected(explicitLegacy);
    explicitLegacy.emit(LEGACY_C2S_PING_EVENT, {
        clientAt: Date.now(),
    });
    await waitFor(() => explicitLegacyError !== null && explicitLegacyDisconnected, 4000);
    explicitLegacy.close();
/**
 * 记录guestdisabled。
 */
    const guestDisabled = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录guestdisabled错误。
 */
    let guestDisabledError = null;
/**
 * 记录guestdisabled断开。
 */
    let guestDisabledDisconnected = false;
/**
 * 记录guestdisabledinit数量。
 */
    let guestDisabledInitCount = 0;
/**
 * 记录events。
 */
    const events = [];
    await onceConnected(guestDisabled);
    guestDisabled.on(shared_1.S2C.Error, (payload) => {
        guestDisabledError = payload;
    });
    guestDisabled.on(shared_1.S2C.InitSession, () => {
        guestDisabledInitCount += 1;
        events.push('guestDisabled:init');
    });
    guestDisabled.on('disconnect', () => {
        guestDisabledDisconnected = true;
    });
    guestDisabled.emit('n:c:hello', {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => guestDisabledError !== null && guestDisabledDisconnected, 4000);
    guestDisabled.close();
    if ((invalidHelloError?.code ?? null) !== 'AUTH_FAIL') {
        throw new Error(`expected unauthenticated socket to be rejected with AUTH_FAIL before hello bootstrap, got ${JSON.stringify(invalidHelloError)}`);
    }
    if (invalidHelloInitCount !== 0) {
        throw new Error(`expected unauthenticated socket to avoid bootstrap init, got ${invalidHelloInitCount}`);
    }
    if ((implicitLegacyError?.code ?? null) !== 'AUTH_FAIL') {
        throw new Error(`expected implicit unauthenticated legacy ping to be rejected with AUTH_FAIL, got ${JSON.stringify(implicitLegacyError)}`);
    }
    if (implicitLegacyLegacyPongCount !== 0 || implicitLegacyNextPongCount !== 0) {
        throw new Error(`expected implicit legacy ping to avoid pong emission, got legacy=${implicitLegacyLegacyPongCount} next=${implicitLegacyNextPongCount}`);
    }
    if ((explicitLegacyError?.code ?? null) !== 'LEGACY_PROTOCOL_DISABLED') {
        throw new Error(`expected explicit legacy ping to be rejected with LEGACY_PROTOCOL_DISABLED, got ${JSON.stringify(explicitLegacyError)}`);
    }
    if (explicitLegacyLegacyPong !== null) {
        throw new Error(`expected explicit legacy ping to avoid legacy pong emission while disabled, got ${JSON.stringify(explicitLegacyLegacyPong)}`);
    }
    if (explicitLegacyNextPongCount !== 0) {
        throw new Error(`expected explicit legacy ping to avoid next pong emission while disabled, got ${explicitLegacyNextPongCount}`);
    }
    if ((guestDisabledError?.code ?? null) !== 'AUTH_FAIL') {
        throw new Error(`expected unauthenticated hello to be rejected with AUTH_FAIL, got ${JSON.stringify(guestDisabledError)}`);
    }
    if (guestDisabledInitCount !== 0) {
        throw new Error(`expected unauthenticated hello to avoid bootstrap init, got ${guestDisabledInitCount}`);
    }
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_URL,
        guestConnectRejectedCode: guestDisabledError?.code ?? null,
        serviceProof,
        reaperProof,
        invalidHelloRejectedCode: invalidHelloError?.code ?? null,
        implicitLegacyRejectedCode: implicitLegacyError?.code ?? null,
        explicitLegacyRejectedCode: explicitLegacyError?.code ?? null,
        explicitLegacyPongServerAt: explicitLegacyLegacyPong?.serverAt ?? null,
        events,
    }, null, 2));
}
/**
 * 处理校验world会话服务mismatch证明链。
 */
function verifyWorldSessionServiceMismatchProof() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录服务。
 */
    const service = new world_session_service_1.WorldSessionService();
/**
 * 记录服务玩家ID。
 */
    const servicePlayerId = `service_${Date.now().toString(36)}`;
/**
 * 记录firstsocket。
 */
    const firstSocket = createMockSocket('first');
/**
 * 记录initialrequested会话ID。
 */
    const initialRequestedSessionId = `initial_requested_${servicePlayerId}`;
/**
 * 记录initialbinding。
 */
    const initialBinding = service.registerSocket(firstSocket, servicePlayerId, initialRequestedSessionId);
    if (initialBinding.sessionId === initialRequestedSessionId) {
        throw new Error(`expected fresh service binding to ignore requested sid, got ${initialBinding.sessionId}`);
    }
    service.unregisterSocket(firstSocket.id);
/**
 * 记录resumesocket。
 */
    const resumeSocket = createMockSocket('resume');
/**
 * 记录resumedbinding。
 */
    const resumedBinding = service.registerSocket(resumeSocket, servicePlayerId, initialBinding.sessionId);
    if (resumedBinding.sessionId !== initialBinding.sessionId || resumedBinding.resumed !== true) {
        throw new Error(`expected matched detached sid to resume, got ${JSON.stringify(resumedBinding)}`);
    }
    service.unregisterSocket(resumeSocket.id);
/**
 * 记录forgedsocket。
 */
    const forgedSocket = createMockSocket('forged');
/**
 * 记录forgedrequested会话ID。
 */
    const forgedRequestedSessionId = `forged_${servicePlayerId}`;
/**
 * 记录rejectedbinding。
 */
    const rejectedBinding = service.registerSocket(forgedSocket, servicePlayerId, forgedRequestedSessionId);
    if (rejectedBinding.resumed !== false) {
        throw new Error(`expected mismatched detached sid to avoid resume, got ${JSON.stringify(rejectedBinding)}`);
    }
    if (rejectedBinding.sessionId === forgedRequestedSessionId) {
        throw new Error(`expected mismatched detached sid to ignore forged sid, got ${JSON.stringify(rejectedBinding)}`);
    }
    if (rejectedBinding.sessionId === initialBinding.sessionId) {
        throw new Error(`expected mismatched detached sid to rotate server sid, got ${JSON.stringify(rejectedBinding)}`);
    }
/**
 * 记录policy证明链。
 */
    const policyProof = verifyWorldSessionServicePolicyProof();
    return {
        playerId: servicePlayerId,
        initialSid: initialBinding.sessionId,
        resumedSid: resumedBinding.sessionId,
        rejectedSid: rejectedBinding.sessionId,
        policyProof,
    };
}
/**
 * 处理校验world会话服务policy证明链。
 */
function verifyWorldSessionServicePolicyProof() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录服务。
 */
    const service = new world_session_service_1.WorldSessionService();
/**
 * 记录玩家ID。
 */
    const playerId = `policy_${Date.now().toString(36)}`;
/**
 * 记录firstsocket。
 */
    const firstSocket = createMockSocket('policy-first');
/**
 * 记录firstbinding。
 */
    const firstBinding = service.registerSocket(firstSocket, playerId);
/**
 * 记录secondsocket。
 */
    const secondSocket = createMockSocket('policy-second');
/**
 * 记录replacedbinding。
 */
    const replacedBinding = service.registerSocket(secondSocket, playerId, undefined, {
        allowConnectedSessionReuse: false,
    });
    if (replacedBinding.sessionId === firstBinding.sessionId) {
        throw new Error(`expected disabled connected session reuse to rotate sid, got ${JSON.stringify(replacedBinding)}`);
    }
    service.unregisterSocket(secondSocket.id);
/**
 * 记录detachedimplicitsocket。
 */
    const detachedImplicitSocket = createMockSocket('policy-implicit');
/**
 * 记录implicitrejectedbinding。
 */
    const implicitRejectedBinding = service.registerSocket(detachedImplicitSocket, playerId, undefined, {
        allowImplicitDetachedResume: false,
        allowRequestedDetachedResume: false,
    });
    if (implicitRejectedBinding.resumed === true || implicitRejectedBinding.sessionId === replacedBinding.sessionId) {
        throw new Error(`expected disabled implicit detached resume to rotate sid, got ${JSON.stringify(implicitRejectedBinding)}`);
    }
    service.unregisterSocket(detachedImplicitSocket.id);
/**
 * 记录detachedexplicitsocket。
 */
    const detachedExplicitSocket = createMockSocket('policy-explicit');
/**
 * 记录explicitrejectedbinding。
 */
    const explicitRejectedBinding = service.registerSocket(detachedExplicitSocket, playerId, implicitRejectedBinding.sessionId, {
        allowImplicitDetachedResume: false,
        allowRequestedDetachedResume: false,
    });
    if (explicitRejectedBinding.resumed === true || explicitRejectedBinding.sessionId === implicitRejectedBinding.sessionId) {
        throw new Error(`expected disabled explicit detached resume to rotate sid, got ${JSON.stringify(explicitRejectedBinding)}`);
    }
/**
 * 记录expirezeroservice。
 */
    const expireZeroService = new world_session_service_1.WorldSessionService();
    expireZeroService.sessionDetachExpireMs = 0;
/**
 * 记录expirezeroplayerid。
 */
    const expireZeroPlayerId = `policy_expire_zero_${Date.now().toString(36)}`;
/**
 * 记录expirezerosocket。
 */
    const expireZeroSocket = createMockSocket('policy-expire-zero');
/**
 * 记录expirezerobinding。
 */
    const expireZeroBinding = expireZeroService.registerSocket(expireZeroSocket, expireZeroPlayerId);
/**
 * 记录expirezerodetachedbinding。
 */
    const expireZeroDetachedBinding = expireZeroService.unregisterSocket(expireZeroSocket.id);
    if (!expireZeroDetachedBinding || expireZeroDetachedBinding.connected) {
        throw new Error(`expected immediate detached binding for zero-expire session proof, got ${JSON.stringify(expireZeroDetachedBinding)}`);
    }
    if (expireZeroService.getBinding(expireZeroPlayerId) !== null) {
        throw new Error(`expected zero-expire detach to purge active binding immediately, got ${JSON.stringify(expireZeroService.getBinding(expireZeroPlayerId))}`);
    }
    if (expireZeroService.getDetachedBindingBySessionId(expireZeroBinding.sessionId) !== null) {
        throw new Error(`expected zero-expire detach to block immediate detached resume, got ${JSON.stringify(expireZeroService.getDetachedBindingBySessionId(expireZeroBinding.sessionId))}`);
    }
    const expiredBindings = expireZeroService.consumeExpiredBindings();
    if (expiredBindings.length !== 1 || expiredBindings[0]?.playerId !== expireZeroPlayerId) {
        throw new Error(`expected zero-expire detach to enqueue expired binding immediately, got ${JSON.stringify(expiredBindings)}`);
    }
    if (world_session_service_1.WORLD_SESSION_CONTRACT.sourceOfTruth !== 'single_process_memory') {
        throw new Error(`unexpected session source of truth contract: ${JSON.stringify(world_session_service_1.WORLD_SESSION_CONTRACT)}`);
    }
    if (world_session_service_1.WORLD_SESSION_CONTRACT.zeroExpireBehavior !== 'expire_immediately_and_enqueue_for_reaper') {
        throw new Error(`unexpected zero-expire contract: ${JSON.stringify(world_session_service_1.WORLD_SESSION_CONTRACT)}`);
    }
    return {
        contract: world_session_service_1.WORLD_SESSION_CONTRACT,
        initialSid: firstBinding.sessionId,
        connectedReuseBlockedSid: replacedBinding.sessionId,
        implicitResumeBlockedSid: implicitRejectedBinding.sessionId,
        explicitResumeBlockedSid: explicitRejectedBinding.sessionId,
        immediateExpireSid: expireZeroBinding.sessionId,
    };
}
/**
 * 处理校验world会话reaper证明链。
 */
async function verifyWorldSessionReaperProof() {
/**
 * 记录success证明链。
 */
    const successProof = await runWorldSessionReaperSuccessProof();
/**
 * 记录retry证明链。
 */
    const retryProof = await runWorldSessionReaperRetryProof();
    return {
        contract: world_session_reaper_service_1.WORLD_SESSION_REAPER_CONTRACT,
        success: successProof,
        retry: retryProof,
    };
}
/**
 * 运行world会话reapersuccess证明链。
 */
async function runWorldSessionReaperSuccessProof() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录服务。
 */
    const service = new world_session_service_1.WorldSessionService();
    service.sessionDetachExpireMs = 0;
/**
 * 记录玩家ID。
 */
    const playerId = `reaper_ok_${Date.now().toString(36)}`;
/**
 * 记录socket。
 */
    const socket = createMockSocket('reaper-ok');
/**
 * 记录binding。
 */
    const binding = service.registerSocket(socket, playerId);
/**
 * 记录detachedbinding。
 */
    const detachedBinding = service.unregisterSocket(socket.id);
    if (!detachedBinding || detachedBinding.connected) {
        throw new Error(`expected detached binding for reaper success proof, got ${JSON.stringify(detachedBinding)}`);
    }
    await delay(20);
    if (service.getBinding(playerId) !== null) {
        throw new Error(`expected expired detached binding to leave active map before reap: playerId=${playerId}`);
    }
/**
 * 记录flushed。
 */
    const flushed = [];
/**
 * 记录cleared。
 */
    const cleared = [];
/**
 * 记录reaper。
 */
    const reaper = new world_session_reaper_service_1.WorldSessionReaperService(service, {    
    /**
 * clearDetachedPlayerCaches：执行clearDetached玩家缓存相关逻辑。
 * @param targetPlayerId targetPlayer ID。
 * @returns 无返回值，直接更新clearDetached玩家缓存相关状态。
 */

        clearDetachedPlayerCaches(targetPlayerId) {
            cleared.push(targetPlayerId);
        },
    }, {    
    /**
 * flushPlayer：执行刷新玩家相关逻辑。
 * @param targetPlayerId targetPlayer ID。
 * @returns 无返回值，直接更新flush玩家相关状态。
 */

        async flushPlayer(targetPlayerId) {
            flushed.push(targetPlayerId);
        },
    });
    await reaper.reapExpiredSessions();
    if (flushed.length !== 1 || flushed[0] !== playerId) {
        throw new Error(`expected reaper success proof to flush detached player once, got ${JSON.stringify(flushed)}`);
    }
    if (cleared.length !== 1 || cleared[0] !== playerId) {
        throw new Error(`expected reaper success proof to clear detached caches once, got ${JSON.stringify(cleared)}`);
    }
    return {
        playerId,
        initialSid: binding.sessionId,
        flushed,
        cleared,
    };
}
/**
 * 运行world会话reaperretry证明链。
 */
async function runWorldSessionReaperRetryProof() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录服务。
 */
    const service = new world_session_service_1.WorldSessionService();
    service.sessionDetachExpireMs = 0;
/**
 * 记录玩家ID。
 */
    const playerId = `reaper_retry_${Date.now().toString(36)}`;
/**
 * 记录socket。
 */
    const socket = createMockSocket('reaper-retry');
/**
 * 记录binding。
 */
    const binding = service.registerSocket(socket, playerId);
/**
 * 记录detachedbinding。
 */
    const detachedBinding = service.unregisterSocket(socket.id);
    if (!detachedBinding || detachedBinding.connected) {
        throw new Error(`expected detached binding for reaper retry proof, got ${JSON.stringify(detachedBinding)}`);
    }
    await delay(20);
/**
 * 记录flushattempts。
 */
    let flushAttempts = 0;
/**
 * 记录cleared。
 */
    const cleared = [];
/**
 * 记录reaper。
 */
    const reaper = new world_session_reaper_service_1.WorldSessionReaperService(service, {    
    /**
 * clearDetachedPlayerCaches：执行clearDetached玩家缓存相关逻辑。
 * @param targetPlayerId targetPlayer ID。
 * @returns 无返回值，直接更新clearDetached玩家缓存相关状态。
 */

        clearDetachedPlayerCaches(targetPlayerId) {
            cleared.push(targetPlayerId);
        },
    }, {    
    /**
 * flushPlayer：执行刷新玩家相关逻辑。
 * @param targetPlayerId targetPlayer ID。
 * @returns 无返回值，直接更新flush玩家相关状态。
 */

        async flushPlayer(targetPlayerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            flushAttempts += 1;
            if (targetPlayerId !== playerId) {
                throw new Error(`unexpected reaper retry flush target: ${targetPlayerId}`);
            }
            if (flushAttempts === 1) {
                throw new Error('simulated_flush_failure');
            }
        },
    });
    await reaper.reapExpiredSessions();
    if (flushAttempts !== 1) {
        throw new Error(`expected first reaper retry pass to attempt flush once, got ${flushAttempts}`);
    }
    if (cleared.length !== 0) {
        throw new Error(`expected failed reaper retry pass to avoid cache clear, got ${JSON.stringify(cleared)}`);
    }
    await reaper.reapExpiredSessions();
    if (flushAttempts !== 2) {
        throw new Error(`expected requeued binding to be retried once more, got ${flushAttempts}`);
    }
    if (cleared.length !== 1 || cleared[0] !== playerId) {
        throw new Error(`expected reaper retry proof to clear detached caches after retry, got ${JSON.stringify(cleared)}`);
    }
    if (world_session_reaper_service_1.WORLD_SESSION_REAPER_CONTRACT.retryOnFlushFailure !== true) {
        throw new Error(`unexpected reaper retry contract: ${JSON.stringify(world_session_reaper_service_1.WORLD_SESSION_REAPER_CONTRACT)}`);
    }
    return {
        playerId,
        initialSid: binding.sessionId,
        flushAttempts,
        cleared,
    };
}
/**
 * 创建mocksocket。
 */
function createMockSocket(id) {
    return {
        id,        
        /**
 * emit：处理emit并更新相关状态。
 * @returns 无返回值，直接更新结果相关状态。
 */

        emit() {
        },        
        /**
 * disconnect：判断disconnect是否满足条件。
 * @returns 无返回值，直接更新disconnect相关状态。
 */

        disconnect() {
        },
    };
}
/**
 * 处理onceconnected。
 */
async function onceConnected(socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4000);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
/**
 * 等待for。
 */
async function waitFor(predicate, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

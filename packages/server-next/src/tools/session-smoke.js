"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
const world_session_reaper_service_1 = require("../network/world-session-reaper.service");
const world_session_service_1 = require("../network/world-session.service");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
const SESSION_DETACH_EXPIRE_MS = Number.isFinite(Number(process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS))
    ? Math.max(0, Math.trunc(Number(process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS)))
    : 15_000;
async function main() {
    const serviceProof = verifyWorldSessionServiceMismatchProof();
    const reaperProof = await verifyWorldSessionReaperProof();
    const first = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const ignoredRequestedSessionId = `guest_requested_${Date.now().toString(36)}`;
    const forgedResumeSessionId = `forged_resume_${Date.now().toString(36)}`;
    let runtimePlayerId = '';
    let sessionId = '';
    let resumedInit = null;
    let rejectedResumeInit = null;
    let rejectedRuntimePlayerId = '';
    let forgedPlayerInit = null;
    let forgedPlayerRuntimePlayerId = '';
    const events = [];
    await onceConnected(first);
    first.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        runtimePlayerId = String(payload?.pid ?? '');
        sessionId = payload.sid;
        events.push(payload.resumed ? 'first:init:resumed' : 'first:init:new');
    });
    first.on(shared_1.NEXT_S2C.MapEnter, () => {
        events.push('first:mapEnter');
    });
    first.emit('n:c:hello', {
        sessionId: ignoredRequestedSessionId,
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => runtimePlayerId.length > 0 && sessionId.length > 0, 4000);
    first.close();
    await delay(1200);
    const second = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    await onceConnected(second);
    second.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        resumedInit = payload;
        events.push(payload.resumed ? 'second:init:resumed' : 'second:init:new');
    });
    second.emit('n:c:hello', {
        sessionId,
    });
    await waitFor(() => resumedInit !== null, 4000);
    second.close();
    await delay(1200);
    const third = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    await onceConnected(third);
    third.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        rejectedResumeInit = payload;
        rejectedRuntimePlayerId = String(payload?.pid ?? '');
        events.push(payload.resumed ? 'third:init:resumed' : 'third:init:new');
    });
    third.emit('n:c:hello', {
        sessionId: forgedResumeSessionId,
    });
    await waitFor(() => rejectedResumeInit !== null, 4000);
    third.close();
    await delay(1200);
    const fourth = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    await onceConnected(fourth);
    fourth.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        forgedPlayerInit = payload;
        forgedPlayerRuntimePlayerId = String(payload?.pid ?? '');
        events.push(payload.resumed ? 'fourth:init:resumed' : 'fourth:init:new');
    });
    fourth.emit('n:c:hello', {
        playerId: runtimePlayerId,
    });
    await waitFor(() => forgedPlayerInit !== null, 4000);
    fourth.close();
    await delay(SESSION_DETACH_EXPIRE_MS + 1200);
    const fifth = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    let expiredResumeInit = null;
    let expiredResumePlayerId = '';
    await onceConnected(fifth);
    fifth.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        expiredResumeInit = payload;
        expiredResumePlayerId = String(payload?.pid ?? '');
        events.push(payload.resumed ? 'fifth:init:resumed' : 'fifth:init:new');
    });
    fifth.emit('n:c:hello', {
        sessionId,
    });
    await waitFor(() => expiredResumeInit !== null, 4000);
    fifth.close();
    if (expiredResumePlayerId) {
        await deletePlayer(expiredResumePlayerId);
    }
    if (forgedPlayerRuntimePlayerId) {
        await deletePlayer(forgedPlayerRuntimePlayerId);
    }
    if (rejectedRuntimePlayerId && rejectedRuntimePlayerId !== forgedPlayerRuntimePlayerId) {
        await deletePlayer(rejectedRuntimePlayerId);
    }
    if (runtimePlayerId && runtimePlayerId !== rejectedRuntimePlayerId && runtimePlayerId !== forgedPlayerRuntimePlayerId) {
        await deletePlayer(runtimePlayerId);
    }
    const init = resumedInit;
    const rejectedInit = rejectedResumeInit;
    const forgedPlayerPayload = forgedPlayerInit;
    const expiredInit = expiredResumeInit;
    if (init.pid !== runtimePlayerId) {
        throw new Error(`expected resumed init pid ${runtimePlayerId}, got ${JSON.stringify(init)}`);
    }
    if (init.sid !== sessionId || init.resumed !== true) {
        throw new Error(`expected resumed session ${sessionId}, got ${JSON.stringify(init)}`);
    }
    if (sessionId === ignoredRequestedSessionId) {
        throw new Error(`expected guest requested sessionId to be ignored on first bootstrap, got ${sessionId}`);
    }
    if (rejectedInit.sid === forgedResumeSessionId) {
        throw new Error(`expected forged requested sessionId to be ignored after detach, got ${JSON.stringify(rejectedInit)}`);
    }
    if (rejectedRuntimePlayerId === runtimePlayerId) {
        throw new Error(`expected forged sid without playerId to rotate guest player identity, got ${JSON.stringify(rejectedInit)}`);
    }
    if (rejectedInit.sid === sessionId) {
        throw new Error(`expected forged sid without playerId to avoid canonical session reuse, got ${JSON.stringify(rejectedInit)}`);
    }
    if (!forgedPlayerPayload) {
        throw new Error('missing forged playerId proof payload');
    }
    if (forgedPlayerRuntimePlayerId === runtimePlayerId) {
        throw new Error(`expected guest requested playerId to be ignored, got ${JSON.stringify(forgedPlayerPayload)}`);
    }
    if (forgedPlayerPayload.sid === sessionId) {
        throw new Error(`expected guest requested playerId to avoid canonical session reuse, got ${JSON.stringify(forgedPlayerPayload)}`);
    }
    if (!expiredInit) {
        throw new Error('missing expired detached session proof payload');
    }
    if (expiredInit.resumed === true) {
        throw new Error(`expected expired detached sid to avoid resume, got ${JSON.stringify(expiredInit)}`);
    }
    if (expiredInit.sid === sessionId) {
        throw new Error(`expected expired detached sid to rotate server sid, got ${JSON.stringify(expiredInit)}`);
    }
    if (expiredResumePlayerId === runtimePlayerId) {
        throw new Error(`expected expired detached sid to rotate guest player identity, got ${JSON.stringify(expiredInit)}`);
    }
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        playerId: runtimePlayerId,
        rejectedPlayerId: rejectedRuntimePlayerId,
        forgedPlayerIdAttempt: runtimePlayerId,
        ignoredRequestedPlayerIdResult: forgedPlayerRuntimePlayerId,
        sessionId,
        ignoredRequestedSessionId,
        forgedResumeSessionId,
        detachExpireMs: SESSION_DETACH_EXPIRE_MS,
        rejectedResumeSid: rejectedInit.sid,
        ignoredRequestedPlayerSid: forgedPlayerPayload.sid,
        expiredResumeSid: expiredInit.sid,
        expiredResumePlayerId,
        serviceProof,
        reaperProof,
        events,
    }, null, 2));
}
function verifyWorldSessionServiceMismatchProof() {
    const service = new world_session_service_1.WorldSessionService();
    const servicePlayerId = `service_${Date.now().toString(36)}`;
    const firstSocket = createMockSocket('first');
    const initialRequestedSessionId = `initial_requested_${servicePlayerId}`;
    const initialBinding = service.registerSocket(firstSocket, servicePlayerId, initialRequestedSessionId);
    if (initialBinding.sessionId === initialRequestedSessionId) {
        throw new Error(`expected fresh service binding to ignore requested sid, got ${initialBinding.sessionId}`);
    }
    service.unregisterSocket(firstSocket.id);
    const resumeSocket = createMockSocket('resume');
    const resumedBinding = service.registerSocket(resumeSocket, servicePlayerId, initialBinding.sessionId);
    if (resumedBinding.sessionId !== initialBinding.sessionId || resumedBinding.resumed !== true) {
        throw new Error(`expected matched detached sid to resume, got ${JSON.stringify(resumedBinding)}`);
    }
    service.unregisterSocket(resumeSocket.id);
    const forgedSocket = createMockSocket('forged');
    const forgedRequestedSessionId = `forged_${servicePlayerId}`;
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
    const policyProof = verifyWorldSessionServicePolicyProof();
    return {
        playerId: servicePlayerId,
        initialSid: initialBinding.sessionId,
        resumedSid: resumedBinding.sessionId,
        rejectedSid: rejectedBinding.sessionId,
        policyProof,
    };
}
function verifyWorldSessionServicePolicyProof() {
    const service = new world_session_service_1.WorldSessionService();
    const playerId = `policy_${Date.now().toString(36)}`;
    const firstSocket = createMockSocket('policy-first');
    const firstBinding = service.registerSocket(firstSocket, playerId);
    const secondSocket = createMockSocket('policy-second');
    const replacedBinding = service.registerSocket(secondSocket, playerId, undefined, {
        allowConnectedSessionReuse: false,
    });
    if (replacedBinding.sessionId === firstBinding.sessionId) {
        throw new Error(`expected disabled connected session reuse to rotate sid, got ${JSON.stringify(replacedBinding)}`);
    }
    service.unregisterSocket(secondSocket.id);
    const detachedImplicitSocket = createMockSocket('policy-implicit');
    const implicitRejectedBinding = service.registerSocket(detachedImplicitSocket, playerId, undefined, {
        allowImplicitDetachedResume: false,
        allowRequestedDetachedResume: false,
    });
    if (implicitRejectedBinding.resumed === true || implicitRejectedBinding.sessionId === replacedBinding.sessionId) {
        throw new Error(`expected disabled implicit detached resume to rotate sid, got ${JSON.stringify(implicitRejectedBinding)}`);
    }
    service.unregisterSocket(detachedImplicitSocket.id);
    const detachedExplicitSocket = createMockSocket('policy-explicit');
    const explicitRejectedBinding = service.registerSocket(detachedExplicitSocket, playerId, implicitRejectedBinding.sessionId, {
        allowImplicitDetachedResume: false,
        allowRequestedDetachedResume: false,
    });
    if (explicitRejectedBinding.resumed === true || explicitRejectedBinding.sessionId === implicitRejectedBinding.sessionId) {
        throw new Error(`expected disabled explicit detached resume to rotate sid, got ${JSON.stringify(explicitRejectedBinding)}`);
    }
    return {
        initialSid: firstBinding.sessionId,
        connectedReuseBlockedSid: replacedBinding.sessionId,
        implicitResumeBlockedSid: implicitRejectedBinding.sessionId,
        explicitResumeBlockedSid: explicitRejectedBinding.sessionId,
    };
}
async function verifyWorldSessionReaperProof() {
    const successProof = await runWorldSessionReaperSuccessProof();
    const retryProof = await runWorldSessionReaperRetryProof();
    return {
        success: successProof,
        retry: retryProof,
    };
}
async function runWorldSessionReaperSuccessProof() {
    const service = new world_session_service_1.WorldSessionService();
    service.sessionDetachExpireMs = 0;
    const playerId = `reaper_ok_${Date.now().toString(36)}`;
    const socket = createMockSocket('reaper-ok');
    const binding = service.registerSocket(socket, playerId);
    const detachedBinding = service.unregisterSocket(socket.id);
    if (!detachedBinding || detachedBinding.connected) {
        throw new Error(`expected detached binding for reaper success proof, got ${JSON.stringify(detachedBinding)}`);
    }
    await delay(20);
    if (service.getBinding(playerId) !== null) {
        throw new Error(`expected expired detached binding to leave active map before reap: playerId=${playerId}`);
    }
    const flushed = [];
    const cleared = [];
    const reaper = new world_session_reaper_service_1.WorldSessionReaperService(service, {
        clearDetachedPlayerCaches(targetPlayerId) {
            cleared.push(targetPlayerId);
        },
    }, {
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
async function runWorldSessionReaperRetryProof() {
    const service = new world_session_service_1.WorldSessionService();
    service.sessionDetachExpireMs = 0;
    const playerId = `reaper_retry_${Date.now().toString(36)}`;
    const socket = createMockSocket('reaper-retry');
    const binding = service.registerSocket(socket, playerId);
    const detachedBinding = service.unregisterSocket(socket.id);
    if (!detachedBinding || detachedBinding.connected) {
        throw new Error(`expected detached binding for reaper retry proof, got ${JSON.stringify(detachedBinding)}`);
    }
    await delay(20);
    let flushAttempts = 0;
    const cleared = [];
    const reaper = new world_session_reaper_service_1.WorldSessionReaperService(service, {
        clearDetachedPlayerCaches(targetPlayerId) {
            cleared.push(targetPlayerId);
        },
    }, {
        async flushPlayer(targetPlayerId) {
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
    return {
        playerId,
        initialSid: binding.sessionId,
        flushAttempts,
        cleared,
    };
}
function createMockSocket(id) {
    return {
        id,
        emit() {
        },
        disconnect() {
        },
    };
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
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
async function waitFor(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function deletePlayer(playerIdToDelete) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
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
//# sourceMappingURL=session-smoke.js.map

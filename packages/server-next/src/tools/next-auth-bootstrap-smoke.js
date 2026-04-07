"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
const world_player_auth_service_1 = require("../network/world-player-auth.service");
const world_session_bootstrap_service_1 = require("../network/world-session-bootstrap.service");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
const SERVER_NEXT_DATABASE_URL = (0, env_alias_1.resolveServerNextDatabaseUrl)();
const DATABASE_ENABLED = Boolean((0, env_alias_1.resolveServerNextDatabaseUrl)().trim());
const AUTH_TRACE_ENABLED = process.env.NEXT_AUTH_TRACE_ENABLED === '1'
    || process.env.SERVER_NEXT_AUTH_TRACE_ENABLED === '1';
const SESSION_DETACH_EXPIRE_MS = Number.isFinite(Number(process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS))
    ? Math.max(0, Math.trunc(Number(process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS)))
    : 15_000;
const LEGACY_S2C_EVENTS = new Set([
    's:init',
    's:tick',
    's:mapStaticSync',
    's:realmUpdate',
    's:pong',
    's:gmState',
    's:enter',
    's:leave',
    's:kick',
    's:error',
    's:dead',
    's:respawn',
    's:attrUpdate',
    's:inventoryUpdate',
    's:equipmentUpdate',
    's:techniqueUpdate',
    's:actionsUpdate',
    's:lootWindowUpdate',
    's:tileRuntimeDetail',
    's:questUpdate',
    's:questNavigateResult',
    's:systemMsg',
    's:mailSummary',
    's:mailPage',
    's:mailDetail',
    's:redeemCodesResult',
    's:mailOpResult',
    's:suggestionUpdate',
    's:marketUpdate',
    's:marketListings',
    's:marketOrders',
    's:marketStorage',
    's:marketItemBook',
    's:marketTradeHistory',
    's:attrDetail',
    's:leaderboard',
    's:npcShop',
]);
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
async function main() {
    if (DATABASE_ENABLED && !AUTH_TRACE_ENABLED) {
        throw new Error('next auth bootstrap with database requires NEXT_AUTH_TRACE_ENABLED=1 or SERVER_NEXT_AUTH_TRACE_ENABLED=1');
    }
    if (DATABASE_ENABLED) {
        await ensureLegacyCompatSchema();
    }
    if (AUTH_TRACE_ENABLED) {
        await clearAuthTrace();
    }
    const auth = await registerAndLoginPlayer(`na_${suffix.slice(-6)}`, buildUniqueDisplayName(`next-auth-bootstrap:${suffix}`), `鉴角${suffix.slice(-4)}`);
    if (DATABASE_ENABLED) {
        await seedLegacyCompatPlayerSnapshot(auth.identity);
    }
    const legacyBackfillFallbackContract = await verifyLegacyBackfillSnapshotFallbackContract();
    const tokenSeedIdentityContract = await verifyTokenSeedIdentityContract();
    const tokenSeedPersistFailureContract = await verifyTokenSeedPersistFailureContract();
    await expectNextSocketAuthFailure('invalid.next.token');
    await expectNextSocketAuthFailure(auth.refreshToken);
    let runtimePlayerId = null;
    try {
        const firstBootstrap = await runNextBootstrap(auth.accessToken, auth.identity);
        runtimePlayerId = firstBootstrap.playerId;
        const authTrace = AUTH_TRACE_ENABLED
            ? await waitForAuthTrace(runtimePlayerId, firstBootstrap.sessionId ?? null)
            : null;
        if (DATABASE_ENABLED && authTrace?.identitySource !== 'next') {
            throw new Error(`expected with-db first identity source to be next, got ${authTrace?.identitySource ?? 'unknown'}`);
        }
        if (DATABASE_ENABLED && authTrace?.identityPersistedSource !== 'legacy_sync') {
            throw new Error(`expected with-db first identity persisted source to be legacy_sync, got ${authTrace?.identityPersistedSource ?? 'unknown'}`);
        }
        const authenticatedSessionProof = await verifyAuthenticatedSessionContract(auth.accessToken, auth.identity, runtimePlayerId, authTrace?.identitySource ?? null);
        const snapshotSequence = AUTH_TRACE_ENABLED
            ? await verifySnapshotSequence(auth.accessToken, runtimePlayerId, authTrace)
            : null;
        if (DATABASE_ENABLED && !snapshotSequence?.supported) {
            throw new Error(`expected with-db next auth bootstrap to prove legacy_seeded -> next sequence, got ${snapshotSequence?.reason ?? 'unsupported'}`);
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId: runtimePlayerId,
            verified: {
                nextTokenBootstrap: {
                    sessionId: firstBootstrap.sessionId,
                    resumed: firstBootstrap.resumed,
                    mapEnterCount: firstBootstrap.mapEnterCount,
                    bootstrapCount: firstBootstrap.bootstrapCount,
                    mapStaticCount: firstBootstrap.mapStaticCount,
                    realmCount: firstBootstrap.realmCount,
                    worldDeltaCount: firstBootstrap.worldDeltaCount,
                    selfDeltaCount: firstBootstrap.selfDeltaCount,
                    panelDeltaCount: firstBootstrap.panelDeltaCount,
                },
                helloAfterBootstrap: firstBootstrap.helloAfterBootstrap,
                legacyBackfillFallbackContract,
                tokenSeedIdentityContract,
                tokenSeedPersistFailureContract,
                authenticatedSessionProof,
                authTrace,
                snapshotSequence,
            },
            legacyEventsOnNextSocket: firstBootstrap.legacyEvents.length,
        }, null, 2));
    }
    finally {
        if (runtimePlayerId) {
            await deletePlayer(runtimePlayerId).catch(() => undefined);
        }
        if (DATABASE_ENABLED) {
            await cleanupLegacyCompatPlayerSnapshot(auth.identity).catch(() => undefined);
        }
        if (AUTH_TRACE_ENABLED) {
            await clearAuthTrace().catch(() => undefined);
        }
    }
}
async function expectNextSocketAuthFailure(token, expectedCode = 'AUTH_FAIL') {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'next',
        },
    });
    const legacyEvents = [];
    let nextErrorPayload = null;
    let disconnected = false;
    let initSessionCount = 0;
    let bootstrapCount = 0;
    let mapEnterCount = 0;
    try {
        socket.onAny((event) => {
            if (LEGACY_S2C_EVENTS.has(event)) {
                legacyEvents.push(event);
            }
        });
        socket.on(shared_1.NEXT_S2C.Error, (payload) => {
            nextErrorPayload = payload;
        });
        socket.on(shared_1.NEXT_S2C.InitSession, () => {
            initSessionCount += 1;
        });
        socket.on(shared_1.NEXT_S2C.Bootstrap, () => {
            bootstrapCount += 1;
        });
        socket.on(shared_1.NEXT_S2C.MapEnter, () => {
            mapEnterCount += 1;
        });
        socket.on('disconnect', () => {
            disconnected = true;
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('invalid next token socket connect timeout')), 5000);
            socket.once('connect', () => {
                clearTimeout(timer);
                resolve();
            });
            socket.once('connect_error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
        await waitFor(() => nextErrorPayload !== null && disconnected, 5000, 'nextAuthFailure');
        const code = typeof nextErrorPayload?.code === 'string' ? nextErrorPayload.code : '';
        if (code !== expectedCode) {
            throw new Error(`expected next socket to fail with ${expectedCode}, got ${JSON.stringify(nextErrorPayload)}`);
        }
        if (legacyEvents.length > 0) {
            throw new Error(`failed next auth socket received legacy events: ${legacyEvents.join(', ')}`);
        }
        if (initSessionCount > 0 || bootstrapCount > 0 || mapEnterCount > 0) {
            throw new Error(`expected failed next auth socket to avoid bootstrap events, got InitSession=${initSessionCount} Bootstrap=${bootstrapCount} MapEnter=${mapEnterCount}`);
        }
    }
    finally {
        socket.close();
    }
}
function createNextSocket(token, options = undefined) {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'next',
            sessionId: typeof options?.sessionId === 'string' ? options.sessionId : undefined,
        },
    });
    const byEvent = new Map();
    const legacyEvents = [];
    let fatalError = null;
    let mapEnterCount = 0;
    let bootstrapCount = 0;
    let mapStaticCount = 0;
    let realmCount = 0;
    let worldDeltaCount = 0;
    let selfDeltaCount = 0;
    let panelDeltaCount = 0;
    socket.onAny((event, payload) => {
        const existing = byEvent.get(event) ?? [];
        existing.push(payload);
        byEvent.set(event, existing);
        if (LEGACY_S2C_EVENTS.has(event)) {
            legacyEvents.push(event);
        }
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        const code = typeof payload?.code === 'string' ? payload.code : '';
        if (code === 'PLAYER_ID_MISMATCH') {
            return;
        }
        fatalError = new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.Error, (payload) => {
        fatalError = new Error(`legacy error on next socket: ${JSON.stringify(payload)}`);
    });
    socket.on('connect_error', (error) => {
        fatalError = error instanceof Error ? error : new Error(String(error));
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.Bootstrap, () => {
        bootstrapCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.MapStatic, () => {
        mapStaticCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.Realm, () => {
        realmCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, () => {
        worldDeltaCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, () => {
        selfDeltaCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, () => {
        panelDeltaCount += 1;
    });
    function throwIfFatal() {
        if (fatalError) {
            throw fatalError;
        }
    }
    return {
        socket,
        legacyEvents,
        get mapEnterCount() {
            return mapEnterCount;
        },
        get bootstrapCount() {
            return bootstrapCount;
        },
        get mapStaticCount() {
            return mapStaticCount;
        },
        get realmCount() {
            return realmCount;
        },
        get worldDeltaCount() {
            return worldDeltaCount;
        },
        get selfDeltaCount() {
            return selfDeltaCount;
        },
        get panelDeltaCount() {
            return panelDeltaCount;
        },
        async onceConnected() {
            if (socket.connected) {
                return;
            }
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('next socket connect timeout')), 5000);
                socket.once('connect', () => {
                    clearTimeout(timer);
                    resolve();
                });
                socket.once('connect_error', (error) => {
                    clearTimeout(timer);
                    reject(error);
                });
            });
        },
        emit(event, payload) {
            throwIfFatal();
            socket.emit(event, payload);
        },
        getEventCount(event) {
            return (byEvent.get(event) ?? []).length;
        },
        async waitForEvent(event, predicate = () => true, timeoutMs = 5000) {
            return waitForValue(async () => {
                throwIfFatal();
                const payloads = byEvent.get(event) ?? [];
                for (let index = payloads.length - 1; index >= 0; index -= 1) {
                    const payload = payloads[index];
                    if (await predicate(payload)) {
                        return payload;
                    }
                }
                return null;
            }, timeoutMs, `next:${event}`);
        },
        close() {
            socket.close();
        },
    };
}
function assertNoLegacyEvents(target, label) {
    if (target.legacyEvents.length > 0) {
        throw new Error(`${label} received legacy events: ${target.legacyEvents.join(', ')}`);
    }
}
async function runNextBootstrap(token, expectedIdentity = null) {
    const successSocket = createNextSocket(token);
    let runtimePlayerId = null;
    try {
        await successSocket.onceConnected();
        const initSession = await successSocket.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const bootstrap = await successSocket.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        await waitFor(() => successSocket.mapEnterCount > 0
            && successSocket.mapStaticCount > 0
            && successSocket.realmCount > 0
            && successSocket.worldDeltaCount > 0
            && successSocket.selfDeltaCount > 0
            && successSocket.panelDeltaCount > 0, 5000, 'nextAuthBootstrapEvents');
        runtimePlayerId = bootstrap.self.id;
        if (initSession.pid !== runtimePlayerId) {
            throw new Error(`init/bootstrap player mismatch: init=${initSession.pid} bootstrap=${runtimePlayerId}`);
        }
        const initSessionCountBeforeHello = successSocket.getEventCount(shared_1.NEXT_S2C.InitSession);
        const bootstrapCountBeforeHello = successSocket.bootstrapCount;
        const mapEnterCountBeforeHello = successSocket.mapEnterCount;
        successSocket.emit(shared_1.NEXT_C2S.Hello, {
            playerId: runtimePlayerId,
            mapId: 'yunlai_town',
            preferredX: 32,
            preferredY: 5,
        });
        await delay(600);
        if (successSocket.getEventCount(shared_1.NEXT_S2C.InitSession) !== initSessionCountBeforeHello) {
            throw new Error('next hello should not emit duplicate InitSession after token bootstrap');
        }
        if (successSocket.bootstrapCount !== bootstrapCountBeforeHello) {
            throw new Error('next hello should not emit duplicate Bootstrap after token bootstrap');
        }
        if (successSocket.mapEnterCount !== mapEnterCountBeforeHello) {
            throw new Error('next hello should not emit duplicate MapEnter after token bootstrap');
        }
        const state = await fetchPlayerState(runtimePlayerId);
        if (!state?.player || state.player.playerId !== runtimePlayerId) {
            throw new Error(`runtime state missing expected player ${runtimePlayerId}`);
        }
        assertBootstrapMatchesExpectedIdentity(expectedIdentity, {
            initPlayerId: initSession.pid,
            bootstrapPlayerId: runtimePlayerId,
            runtimePlayerId: state.player.playerId,
            runtimePlayerName: typeof state.player.name === 'string' ? state.player.name : null,
        });
        assertNoLegacyEvents(successSocket, 'next-auth-bootstrap');
        return {
            playerId: runtimePlayerId,
            sessionId: initSession.sid ?? null,
            resumed: initSession.resumed ?? null,
            mapEnterCount: successSocket.mapEnterCount,
            bootstrapCount: successSocket.bootstrapCount,
            mapStaticCount: successSocket.mapStaticCount,
            realmCount: successSocket.realmCount,
            worldDeltaCount: successSocket.worldDeltaCount,
            selfDeltaCount: successSocket.selfDeltaCount,
            panelDeltaCount: successSocket.panelDeltaCount,
            helloAfterBootstrap: {
                duplicateInitSession: successSocket.getEventCount(shared_1.NEXT_S2C.InitSession) - initSessionCountBeforeHello,
                duplicateBootstrap: successSocket.bootstrapCount - bootstrapCountBeforeHello,
                duplicateMapEnter: successSocket.mapEnterCount - mapEnterCountBeforeHello,
            },
            legacyEvents: successSocket.legacyEvents.slice(),
        };
    }
    finally {
        successSocket.close();
    }
}
function shouldExpectImplicitDetachedResume(identitySource) {
    return identitySource === 'next'
        || identitySource === 'token'
        || identitySource === 'legacy_backfill';
}
function shouldExpectConnectedSessionReuse(identitySource) {
    return shouldExpectImplicitDetachedResume(identitySource);
}
async function verifyAuthenticatedSessionContract(token, expectedIdentity, expectedPlayerId, identitySource = null) {
    const first = createNextSocket(token);
    let second = null;
    let third = null;
    let fourth = null;
    let fifth = null;
    try {
        await first.onceConnected();
        const firstInit = await first.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const firstBootstrap = await first.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (firstBootstrap.self.id !== expectedPlayerId || firstInit.pid !== expectedPlayerId) {
            throw new Error(`authenticated session proof first bootstrap player mismatch: expected=${expectedPlayerId} init=${firstInit.pid} bootstrap=${firstBootstrap.self.id}`);
        }
        assertBootstrapMatchesExpectedIdentity(expectedIdentity, {
            initPlayerId: firstInit.pid,
            bootstrapPlayerId: firstBootstrap.self.id,
            runtimePlayerId: expectedPlayerId,
            runtimePlayerName: typeof firstBootstrap.self?.name === 'string' ? firstBootstrap.self.name : null,
        });
        second = createNextSocket(token);
        await second.onceConnected();
        const replacedKick = await first.waitForEvent(shared_1.NEXT_S2C.Kick, (payload) => payload?.reason === 'replaced', 5000);
        const secondInit = await second.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const secondBootstrap = await second.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (replacedKick?.reason !== 'replaced') {
            throw new Error(`expected authenticated replacement kick, got ${JSON.stringify(replacedKick)}`);
        }
        if (secondInit.pid !== expectedPlayerId || secondBootstrap.self.id !== expectedPlayerId) {
            throw new Error(`authenticated session proof replaced bootstrap player mismatch: ${JSON.stringify(secondInit)}`);
        }
        if (shouldExpectConnectedSessionReuse(identitySource)) {
            if (secondInit.sid !== firstInit.sid) {
                throw new Error(`expected authenticated replacement to reuse sid, got first=${firstInit.sid} second=${secondInit.sid}`);
            }
        }
        else if (secondInit.sid === firstInit.sid) {
            throw new Error(`expected authenticated replacement to rotate sid for identitySource=${identitySource ?? 'unknown'}, got first=${firstInit.sid} second=${secondInit.sid}`);
        }
        if (secondInit.resumed === true) {
            throw new Error(`expected authenticated replacement to avoid resumed=true while previous socket is still connected, got ${JSON.stringify(secondInit)}`);
        }
        second.close();
        await delay(1200);
        third = createNextSocket(token);
        await third.onceConnected();
        const resumedInit = await third.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const resumedBootstrap = await third.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (resumedInit.pid !== expectedPlayerId || resumedBootstrap.self.id !== expectedPlayerId) {
            throw new Error(`authenticated session proof resumed bootstrap player mismatch: ${JSON.stringify(resumedInit)}`);
        }
        if (shouldExpectImplicitDetachedResume(identitySource)) {
            if (resumedInit.sid !== firstInit.sid || resumedInit.resumed !== true) {
                throw new Error(`expected authenticated detached reconnect to resume canonical sid=${firstInit.sid}, got ${JSON.stringify(resumedInit)}`);
            }
        }
        else {
            if (resumedInit.resumed === true) {
                throw new Error(`expected authenticated detached reconnect to avoid implicit resume for identitySource=${identitySource ?? 'unknown'}, got ${JSON.stringify(resumedInit)}`);
            }
            if (resumedInit.sid === firstInit.sid) {
                throw new Error(`expected authenticated detached reconnect to rotate sid for identitySource=${identitySource ?? 'unknown'}, got ${JSON.stringify(resumedInit)}`);
            }
        }
        third.close();
        await delay(1200);
        fourth = createNextSocket(token, { sessionId: resumedInit.sid });
        await fourth.onceConnected();
        const explicitRequestedInit = await fourth.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const explicitRequestedBootstrap = await fourth.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (explicitRequestedInit.pid !== expectedPlayerId || explicitRequestedBootstrap.self.id !== expectedPlayerId) {
            throw new Error(`authenticated session proof explicit-request bootstrap player mismatch: ${JSON.stringify(explicitRequestedInit)}`);
        }
        if (shouldExpectImplicitDetachedResume(identitySource)) {
            if (explicitRequestedInit.sid !== resumedInit.sid || explicitRequestedInit.resumed !== true) {
                throw new Error(`expected authenticated explicit requested reconnect to resume sid=${resumedInit.sid}, got ${JSON.stringify(explicitRequestedInit)}`);
            }
        }
        else {
            if (explicitRequestedInit.resumed === true) {
                throw new Error(`expected authenticated explicit requested reconnect to avoid resume for identitySource=${identitySource ?? 'unknown'}, got ${JSON.stringify(explicitRequestedInit)}`);
            }
            if (explicitRequestedInit.sid === resumedInit.sid) {
                throw new Error(`expected authenticated explicit requested reconnect to rotate sid for identitySource=${identitySource ?? 'unknown'}, got ${JSON.stringify(explicitRequestedInit)}`);
            }
        }
        fourth.close();
        await delay(SESSION_DETACH_EXPIRE_MS + 1200);
        fifth = createNextSocket(token);
        await fifth.onceConnected();
        const expiredInit = await fifth.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const expiredBootstrap = await fifth.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (expiredInit.pid !== expectedPlayerId || expiredBootstrap.self.id !== expectedPlayerId) {
            throw new Error(`authenticated session proof expired bootstrap player mismatch: ${JSON.stringify(expiredInit)}`);
        }
        if (expiredInit.resumed === true) {
            throw new Error(`expected authenticated expired reconnect to avoid resumed=true, got ${JSON.stringify(expiredInit)}`);
        }
        if (expiredInit.sid === explicitRequestedInit.sid) {
            throw new Error(`expected authenticated expired reconnect to rotate sid, got ${JSON.stringify(expiredInit)}`);
        }
        assertNoLegacyEvents(first, 'next-auth-session:first');
        assertNoLegacyEvents(second, 'next-auth-session:second');
        assertNoLegacyEvents(third, 'next-auth-session:third');
        assertNoLegacyEvents(fourth, 'next-auth-session:fourth');
        assertNoLegacyEvents(fifth, 'next-auth-session:fifth');
        return {
            playerId: expectedPlayerId,
            initialSid: firstInit.sid ?? null,
            replacedSid: secondInit.sid ?? null,
            resumedSid: resumedInit.sid ?? null,
            explicitRequestedSid: explicitRequestedInit.sid ?? null,
            expiredSid: expiredInit.sid ?? null,
            replacedKickReason: replacedKick?.reason ?? null,
            resumed: resumedInit.resumed ?? null,
            explicitRequestedResumed: explicitRequestedInit.resumed ?? null,
            expiredResumed: expiredInit.resumed ?? null,
            detachExpireMs: SESSION_DETACH_EXPIRE_MS,
            expectedConnectedSessionReuse: shouldExpectConnectedSessionReuse(identitySource),
            expectedImplicitDetachedResume: shouldExpectImplicitDetachedResume(identitySource),
            expectedExplicitRequestedResume: shouldExpectImplicitDetachedResume(identitySource),
        };
    }
    finally {
        first.close();
        second?.close();
        third?.close();
        fourth?.close();
        fifth?.close();
    }
}
async function verifyLegacyBackfillSnapshotFallbackContract() {
    const payload = {
        sub: 'proof_user_legacy_backfill',
        playerId: 'proof_player_legacy_backfill',
    };
    const compatIdentity = {
        userId: payload.sub,
        username: 'proof_legacy_backfill',
        displayName: 'proof legacy backfill',
        playerId: payload.playerId,
        playerName: 'proof legacy backfill',
    };
    const authService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => {
            throw new Error('forced_preseed_next_load_failure');
        },
        savePlayerSnapshot: async () => undefined,
    }, {
        resolveCompatPlayerIdentity: async () => compatIdentity,
        loadCompatPlayerSnapshot: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    });
    const blockedIdentity = await authService.authenticatePlayerToken('proof.token.legacy_backfill');
    if (blockedIdentity !== null) {
        throw new Error(`expected persistence-enabled compat backfill preseed failure to reject auth before bootstrap, got ${JSON.stringify(blockedIdentity)}`);
    }
    const noPersistenceAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => false,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        isEnabled: () => false,
        loadPlayerSnapshotRecord: async () => null,
        savePlayerSnapshot: async () => undefined,
    }, {
        resolveCompatPlayerIdentity: async () => compatIdentity,
        loadCompatPlayerSnapshot: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    });
    const legacyRuntimeIdentity = await noPersistenceAuthService.authenticatePlayerToken('proof.token.legacy_backfill');
    if (!legacyRuntimeIdentity || legacyRuntimeIdentity.authSource !== 'legacy_runtime') {
        throw new Error(`expected non-persistence compat backfill auth to remain legacy_runtime, got ${JSON.stringify(legacyRuntimeIdentity)}`);
    }
    const persistenceEnabledCalls = [];
    const persistenceEnabledBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
        isPersistenceEnabled: () => true,
        loadPlayerSnapshot: async (playerId, allowLegacyFallback, fallbackReason) => {
            persistenceEnabledCalls.push({
                playerId,
                allowLegacyFallback,
                fallbackReason,
            });
            return null;
        },
    }, null, null, null, null, null, null, null, null);
    let blockedError = null;
    try {
        await persistenceEnabledBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity);
    }
    catch (error) {
        blockedError = error;
    }
    if (!(blockedError instanceof Error)
        || persistenceEnabledCalls[0]?.allowLegacyFallback !== false
        || persistenceEnabledCalls[0]?.fallbackReason !== 'persistence_enabled_blocked:legacy_runtime') {
        throw new Error(`expected persistence-enabled legacy_runtime identity to block compat snapshot fallback, got error=${blockedError instanceof Error ? blockedError.message : String(blockedError)} call=${JSON.stringify(persistenceEnabledCalls[0] ?? null)}`);
    }
    const noPersistenceCalls = [];
    const noPersistenceBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
        isPersistenceEnabled: () => false,
        loadPlayerSnapshot: async (playerId, allowLegacyFallback, fallbackReason) => {
            noPersistenceCalls.push({
                playerId,
                allowLegacyFallback,
                fallbackReason,
            });
            if (!allowLegacyFallback) {
                return null;
            }
            return {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 2,
                    y: 2,
                    facing: 1,
                },
            };
        },
    }, null, null, null, null, null, null, null, null);
    const noPersistenceSnapshot = await noPersistenceBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity);
    if (!noPersistenceSnapshot
        || noPersistenceCalls[0]?.allowLegacyFallback !== true
        || noPersistenceCalls[0]?.fallbackReason !== 'identity_source:legacy_runtime') {
        throw new Error(`expected non-persistence legacy_runtime identity to keep compat snapshot fallback enabled, got snapshot=${JSON.stringify(noPersistenceSnapshot ?? null)} call=${JSON.stringify(noPersistenceCalls[0] ?? null)}`);
    }
    let strictError = null;
    const previousStrictNativeSnapshot = process.env.SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT;
    process.env.SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT = '1';
    try {
        await persistenceEnabledBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity);
    }
    catch (error) {
        strictError = error;
    }
    finally {
        if (typeof previousStrictNativeSnapshot === 'string') {
            process.env.SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT = previousStrictNativeSnapshot;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_REQUIRE_NATIVE_SNAPSHOT;
        }
    }
    if (!(strictError instanceof Error)
        || persistenceEnabledCalls[1]?.allowLegacyFallback !== false
        || persistenceEnabledCalls[1]?.fallbackReason !== 'strict_native_snapshot_required') {
        throw new Error(`expected strict native snapshot mode to disable downgraded legacy_runtime fallback, got error=${strictError instanceof Error ? strictError.message : String(strictError)} call=${JSON.stringify(persistenceEnabledCalls[1] ?? null)}`);
    }
    return {
        persistenceEnabledAuthAccepted: blockedIdentity !== null,
        noPersistenceIdentitySource: legacyRuntimeIdentity.authSource ?? null,
        preseedFailure: 'forced_preseed_next_load_failure',
        persistenceEnabledAllowLegacyFallback: persistenceEnabledCalls[0]?.allowLegacyFallback ?? null,
        persistenceEnabledFallbackReason: persistenceEnabledCalls[0]?.fallbackReason ?? null,
        noPersistenceAllowLegacyFallback: noPersistenceCalls[0]?.allowLegacyFallback ?? null,
        noPersistenceFallbackReason: noPersistenceCalls[0]?.fallbackReason ?? null,
        strictAllowLegacyFallback: persistenceEnabledCalls[1]?.allowLegacyFallback ?? null,
        strictFallbackReason: persistenceEnabledCalls[1]?.fallbackReason ?? null,
        noPersistencePlacement: noPersistenceSnapshot?.placement ?? null,
        blockedError: blockedError.message,
        strictError: strictError.message,
    };
}
async function verifyTokenSeedIdentityContract() {
    const payload = {
        sub: 'proof_user_token_seed',
        username: 'proof_token_seed',
        displayName: '证',
        playerId: 'proof_player_token_seed',
        playerName: 'proof token seed',
    };
    let compatIdentityCalls = 0;
    let compatSnapshotCalls = 0;
    const authService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => ({
            userId: payload.sub,
            username: payload.username,
            displayName: payload.displayName,
            playerId: payload.playerId,
            playerName: payload.playerName,
        }),
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => ({
            snapshot: {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 3,
                    y: 3,
                    facing: 1,
                },
            },
            persistedSource: 'native',
            seededAt: null,
        }),
        savePlayerSnapshot: async () => undefined,
    }, {
        resolveCompatPlayerIdentity: async () => {
            compatIdentityCalls += 1;
            return null;
        },
        loadCompatPlayerSnapshot: async () => {
            compatSnapshotCalls += 1;
            return null;
        },
    });
    const identity = await authService.authenticatePlayerToken('proof.token.token_seed');
    if (!identity || identity.authSource !== 'token') {
        throw new Error(`expected persistence-enabled token identity to seed next auth without compat identity lookup, got ${JSON.stringify(identity)}`);
    }
    if (compatIdentityCalls !== 0 || compatSnapshotCalls !== 0) {
        throw new Error(`expected token-seed identity path to avoid compat identity/snapshot lookup, got compatIdentityCalls=${compatIdentityCalls} compatSnapshotCalls=${compatSnapshotCalls}`);
    }
    return {
        identitySource: identity.authSource ?? null,
        playerId: identity.playerId ?? null,
        compatIdentityCalls,
        compatSnapshotCalls,
    };
}
async function verifyTokenSeedPersistFailureContract() {
    const payload = {
        sub: 'proof_user_token_persist_blocked',
        username: 'proof_token_persist_blocked',
        displayName: '断',
        playerId: 'proof_player_token_persist_blocked',
        playerName: 'proof token persist blocked',
    };
    let compatIdentityCalls = 0;
    const authService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => ({
            userId: payload.sub,
            username: payload.username,
            displayName: payload.displayName,
            playerId: payload.playerId,
            playerName: payload.playerName,
        }),
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async () => {
            throw new Error('forced_token_seed_save_failure');
        },
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => ({
            snapshot: {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 5,
                    y: 5,
                    facing: 1,
                },
            },
            persistedSource: 'native',
            seededAt: null,
        }),
        savePlayerSnapshot: async () => undefined,
    }, {
        resolveCompatPlayerIdentity: async () => {
            compatIdentityCalls += 1;
            return {
                userId: payload.sub,
                username: payload.username,
                displayName: payload.displayName,
                playerId: payload.playerId,
                playerName: payload.playerName,
            };
        },
        loadCompatPlayerSnapshot: async () => null,
    });
    const identity = await authService.authenticatePlayerToken('proof.token.token_persist_blocked');
    if (identity !== null) {
        throw new Error(`expected token-seed persist failure to reject auth before compat fallback, got ${JSON.stringify(identity)}`);
    }
    if (compatIdentityCalls !== 0) {
        throw new Error(`expected token-seed persist failure to avoid compat identity fallback, got compatIdentityCalls=${compatIdentityCalls}`);
    }
    return {
        accepted: identity !== null,
        compatIdentityCalls,
        persistFailureStage: 'token_seed_save_failed',
    };
}
async function verifySnapshotSequence(token, playerId, firstAuthTrace) {
    if (!firstAuthTrace) {
        return null;
    }
    const firstSnapshotSource = firstAuthTrace.snapshotSource ?? null;
    const firstSnapshotPersistedSource = firstAuthTrace.snapshotPersistedSource ?? null;
    const firstSnapshotWasCompatSeed = firstSnapshotSource === 'legacy_seeded';
    const firstSnapshotWasPreseededNext = firstSnapshotSource === 'next'
        && firstSnapshotPersistedSource === 'legacy_seeded';
    if (!firstSnapshotWasCompatSeed && !firstSnapshotWasPreseededNext) {
        return {
            supported: false,
            reason: `first_snapshot_source=${firstSnapshotSource ?? 'unknown'}`,
            firstSnapshotSource,
            firstSnapshotPersistedSource,
        };
    }
    if (firstSnapshotPersistedSource !== 'legacy_seeded') {
        return {
            supported: false,
            reason: `first_snapshot_persisted_source=${firstSnapshotPersistedSource ?? 'unknown'}`,
            firstSnapshotSource,
            firstSnapshotPersistedSource,
        };
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await clearAuthTrace();
    const secondBootstrap = await runNextBootstrap(token);
    if (secondBootstrap.playerId !== playerId) {
        throw new Error(`next bootstrap second pass player mismatch: second=${secondBootstrap.playerId} first=${playerId}`);
    }
    const secondAuthTrace = await waitForAuthTrace(playerId, secondBootstrap.sessionId ?? null, {
        requireReject: false,
    });
    if (DATABASE_ENABLED && secondAuthTrace.identitySource !== 'next') {
        throw new Error(`expected second identity source to be next, got ${secondAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (DATABASE_ENABLED && secondAuthTrace.identityPersistedSource !== 'legacy_sync') {
        throw new Error(`expected second identity persisted source to remain legacy_sync, got ${secondAuthTrace.identityPersistedSource ?? 'unknown'}`);
    }
    if (secondAuthTrace.snapshotSource !== 'next') {
        throw new Error(`expected second snapshot source to be next, got ${secondAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (DATABASE_ENABLED && secondAuthTrace.snapshotPersistedSource !== 'native') {
        throw new Error(`expected second snapshot persisted source to be native, got ${secondAuthTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    const compatBackfillSaveFailed = DATABASE_ENABLED
        ? await verifyCompatBackfillSaveFailure(token, playerId)
        : null;
    const compatBackfillSaveFailedMissingSnapshotRejected = DATABASE_ENABLED
        ? await verifyCompatBackfillSaveFailureMissingSnapshotRejection(token, playerId)
        : null;
    const compatIdentityBackfillSnapshotPreseed = DATABASE_ENABLED
        ? await verifyCompatIdentityBackfillSnapshotPreseed(token, playerId)
        : null;
    const compatIdentityBackfillSnapshotSeedFailureRejected = DATABASE_ENABLED
        ? await verifyCompatIdentityBackfillSnapshotSeedFailureRejection(token, playerId)
        : null;
    const invalidSnapshotMetaPersistedSourceNormalized = DATABASE_ENABLED
        ? await verifyInvalidPersistedSnapshotMetaPersistedSourceNormalization(token, playerId)
        : null;
    const invalidSnapshotUnlockedMapIdsNormalized = DATABASE_ENABLED
        ? await verifyInvalidPersistedSnapshotUnlockedMapIdsNormalization(token, playerId)
        : null;
    const invalidSnapshotRejected = DATABASE_ENABLED
        ? await verifyInvalidPersistedSnapshotRejection(token, playerId)
        : null;
    const nextIdentityCompatSnapshotIgnored = DATABASE_ENABLED
        ? await verifyNextIdentityCompatSnapshotIgnored(token, playerId)
        : null;
    const nextIdentityInvalidCompatMapIdIgnored = DATABASE_ENABLED
        ? await verifyNextIdentityInvalidCompatMapIdIgnored(token, playerId)
        : null;
    const nextIdentityInvalidUnlockedMapIdsIgnored = DATABASE_ENABLED
        ? await verifyNextIdentityInvalidUnlockedMapIdsIgnored(token, playerId)
        : null;
    const missingSnapshotRejected = DATABASE_ENABLED
        ? await verifyMissingSnapshotRejection(token, playerId)
        : null;
    const invalidIdentityRejected = DATABASE_ENABLED
        ? await verifyInvalidPersistedIdentityRejection(token)
        : null;
    return {
        supported: true,
        firstSnapshotSource,
        firstSnapshotPersistedSource: firstAuthTrace.snapshotPersistedSource ?? null,
        firstIdentitySource: firstAuthTrace.identitySource ?? null,
        firstIdentityPersistedSource: firstAuthTrace.identityPersistedSource ?? null,
        secondIdentitySource: secondAuthTrace.identitySource ?? null,
        secondIdentityPersistedSource: secondAuthTrace.identityPersistedSource ?? null,
        secondSnapshotSource: secondAuthTrace.snapshotSource ?? null,
        secondSnapshotPersistedSource: secondAuthTrace.snapshotPersistedSource ?? null,
        secondSessionId: secondAuthTrace.bootstrapSessionId ?? null,
        compatBackfillSaveFailed,
        compatBackfillSaveFailedMissingSnapshotRejected,
        compatIdentityBackfillSnapshotPreseed,
        compatIdentityBackfillSnapshotSeedFailureRejected,
        invalidSnapshotMetaPersistedSourceNormalized,
        invalidSnapshotUnlockedMapIdsNormalized,
        invalidSnapshotRejected,
        nextIdentityCompatSnapshotIgnored,
        nextIdentityInvalidCompatMapIdIgnored,
        nextIdentityInvalidUnlockedMapIdsIgnored,
        missingSnapshotRejected,
        invalidIdentityRejected,
    };
}
async function verifyCompatIdentityBackfillSnapshotPreseed(token, playerId) {
    const payload = parseJwtPayload(token);
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-identity-backfill snapshot-preseed proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await dropPersistedIdentityDocument(userId);
    await dropPersistedPlayerSnapshot(playerId);
    await expectPersistedIdentityDocument(userId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    await clearAuthTrace();
    const bootstrap = await runNextBootstrap(token);
    if (bootstrap.playerId !== playerId) {
        throw new Error(`compat-identity-backfill snapshot-preseed player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
    const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
        requireReject: false,
    });
    if (authTrace.identitySource !== 'legacy_backfill') {
        throw new Error(`expected compat-identity-backfill snapshot-preseed identity source to be legacy_backfill, got ${authTrace.identitySource ?? 'unknown'}`);
    }
    if (authTrace.snapshotSource !== 'next') {
        throw new Error(`expected compat-identity-backfill snapshot-preseed snapshot source to be next, got ${authTrace.snapshotSource ?? 'unknown'}`);
    }
    if (authTrace.snapshotPersistedSource !== 'legacy_seeded') {
        throw new Error(`expected compat-identity-backfill snapshot-preseed persisted source to be legacy_seeded, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    await expectPersistedIdentityDocument(userId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    return authTrace;
}
async function verifyCompatIdentityBackfillSnapshotSeedFailureRejection(token, playerId) {
    const payload = parseJwtPayload(token);
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-identity-backfill snapshot-seed-failure rejection proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await dropPersistedIdentityDocument(userId);
    await dropPersistedPlayerSnapshot(playerId);
    await expectPersistedIdentityDocument(userId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    const injection = await installSnapshotSeedSaveFailure(playerId);
    try {
        await clearAuthTrace();
        await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
        const failureAuthTrace = await waitForFailedIdentitySourceAuthTrace(userId, playerId, 'legacy_preseed_blocked');
        if (failureAuthTrace.identityPersistFailureStage !== 'compat_snapshot_preseed_failed') {
            throw new Error(`expected compat-identity-backfill snapshot-seed-failure rejection stage to be compat_snapshot_preseed_failed, got ${failureAuthTrace.identityPersistFailureStage ?? 'unknown'}`);
        }
        if (failureAuthTrace.snapshotPresent) {
            throw new Error(`expected compat-identity-backfill snapshot-seed-failure rejection to stop before snapshot load, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.bootstrapPresent) {
            throw new Error(`expected compat-identity-backfill snapshot-seed-failure rejection to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
        }
        await expectPersistedIdentityDocument(userId, true);
        await expectPersistedPlayerSnapshotDocument(playerId, false);
        return {
            ...failureAuthTrace,
            injection: {
                triggerName: injection.triggerName,
                functionName: injection.functionName,
            },
        };
    }
    finally {
        await uninstallSnapshotSeedSaveFailure(injection).catch(() => undefined);
    }
}
async function verifyMissingSnapshotRejection(token, playerId) {
    const payload = parseJwtPayload(token);
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for snapshot-miss rejection proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectPersistedIdentityDocument(userId, true);
    await dropPlayerSnapshotSourcesButKeepIdentity(playerId);
    await expectPersistedIdentityDocument(userId, true);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
    const failureAuthTrace = await waitForFailedSnapshotAuthTrace(playerId, 'miss');
    if (failureAuthTrace.identitySource !== 'next') {
        throw new Error(`expected missing-snapshot rejection identity source to stay next, got ${failureAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (failureAuthTrace.snapshotSource !== 'miss') {
        throw new Error(`expected missing-snapshot rejection snapshot source to be miss, got ${failureAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (failureAuthTrace.bootstrapPresent) {
        throw new Error(`expected missing-snapshot rejection to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
    }
    return failureAuthTrace;
}
async function verifyNextIdentityInvalidUnlockedMapIdsIgnored(token, playerId) {
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for next-identity-invalid-unlockedMapIds ignored proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await dropPersistedPlayerSnapshot(playerId);
    await writeInvalidLegacyCompatUnlockedMinimapIds(playerId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
    const failureAuthTrace = await waitForFailedSnapshotAuthTrace(playerId, 'miss');
    if (failureAuthTrace.identitySource !== 'next') {
        throw new Error(`expected next-identity-invalid-unlockedMapIds ignored identity source to stay next, got ${failureAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (failureAuthTrace.snapshotSource !== 'miss') {
        throw new Error(`expected next-identity-invalid-unlockedMapIds ignored snapshot source to be miss, got ${failureAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (failureAuthTrace.bootstrapPresent) {
        throw new Error(`expected next-identity-invalid-unlockedMapIds ignored proof to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
    }
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    return failureAuthTrace;
}
async function verifyNextIdentityInvalidCompatMapIdIgnored(token, playerId) {
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for next-identity-invalid-compat-mapId ignored proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await dropPersistedPlayerSnapshot(playerId);
    await writeInvalidLegacyCompatMapId(playerId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
    const failureAuthTrace = await waitForFailedSnapshotAuthTrace(playerId, 'miss');
    if (failureAuthTrace.identitySource !== 'next') {
        throw new Error(`expected next-identity-invalid-compat-mapId ignored identity source to stay next, got ${failureAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (failureAuthTrace.snapshotSource !== 'miss') {
        throw new Error(`expected next-identity-invalid-compat-mapId ignored snapshot source to be miss, got ${failureAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (failureAuthTrace.bootstrapPresent) {
        throw new Error(`expected next-identity-invalid-compat-mapId ignored proof to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
    }
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    return failureAuthTrace;
}
async function verifyCompatBackfillSaveFailure(token, playerId) {
    const payload = parseJwtPayload(token);
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-backfill-save-failed proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await dropPersistedIdentityDocument(userId);
    await expectPersistedIdentityDocument(userId, false);
    const injection = await installIdentityBackfillSaveFailure(userId);
    try {
        await clearAuthTrace();
        await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
        const failureAuthTrace = await waitForFailedIdentitySourceAuthTrace(userId, playerId, 'legacy_persist_blocked');
        if (failureAuthTrace.identityPersistAttempted !== true) {
            throw new Error(`expected compat-backfill-save-failed to attempt persistence, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.identityPersistSucceeded !== false) {
            throw new Error(`expected compat-backfill-save-failed persistence result to be false, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.identityPersistFailureStage !== 'compat_backfill_save_failed') {
            throw new Error(`expected compat-backfill-save-failed stage to be compat_backfill_save_failed, got ${failureAuthTrace.identityPersistFailureStage ?? 'unknown'}`);
        }
        if (failureAuthTrace.snapshotPresent) {
            throw new Error(`expected compat-backfill-save-failed to stop before snapshot load, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.bootstrapPresent) {
            throw new Error(`expected compat-backfill-save-failed to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
        }
        await expectPersistedIdentityDocument(userId, false);
        await expectPersistedPlayerSnapshotDocument(playerId, true);
        return {
            ...failureAuthTrace,
            injection: {
                triggerName: injection.triggerName,
                functionName: injection.functionName,
            },
        };
    }
    finally {
        await uninstallIdentityBackfillSaveFailure(injection).catch(() => undefined);
    }
}
async function verifyCompatBackfillSaveFailureMissingSnapshotRejection(token, playerId) {
    const payload = parseJwtPayload(token);
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-backfill-save-failed snapshot-miss proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await dropPersistedIdentityDocument(userId);
    await expectPersistedIdentityDocument(userId, false);
    await dropPlayerSnapshotSourcesButKeepIdentity(playerId);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    const injection = await installIdentityBackfillSaveFailure(userId);
    try {
        await clearAuthTrace();
        await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
        const failureAuthTrace = await waitForFailedIdentitySourceAuthTrace(userId, playerId, 'legacy_persist_blocked');
        if (failureAuthTrace.identityPersistAttempted !== true) {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss to attempt persistence, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.identityPersistSucceeded !== false) {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss persistence result to be false, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.identityPersistFailureStage !== 'compat_backfill_save_failed') {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss stage to be compat_backfill_save_failed, got ${failureAuthTrace.identityPersistFailureStage ?? 'unknown'}`);
        }
        if (failureAuthTrace.snapshotPresent) {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss to stop before snapshot load, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.bootstrapPresent) {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss proof to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
        }
        await expectPersistedIdentityDocument(userId, false);
        await expectPersistedPlayerSnapshotDocument(playerId, false);
        return {
            ...failureAuthTrace,
            injection: {
                triggerName: injection.triggerName,
                functionName: injection.functionName,
            },
        };
    }
    finally {
        await uninstallIdentityBackfillSaveFailure(injection).catch(() => undefined);
    }
}
async function verifyNextIdentityCompatSnapshotIgnored(token, playerId) {
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for next-identity-compat-snapshot-ignored proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await seedLegacyCompatPlayerSnapshot(persistedIdentity);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await dropPersistedPlayerSnapshot(playerId);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
    const failureAuthTrace = await waitForFailedSnapshotAuthTrace(playerId, 'miss');
    if (failureAuthTrace.identitySource !== 'next') {
        throw new Error(`expected next-identity-compat-snapshot-ignored identity source to stay next, got ${failureAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (failureAuthTrace.snapshotSource !== 'miss') {
        throw new Error(`expected next-identity-compat-snapshot-ignored snapshot source to be miss, got ${failureAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (failureAuthTrace.bootstrapPresent) {
        throw new Error(`expected next-identity-compat-snapshot-ignored rejection to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
    }
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    return failureAuthTrace;
}
async function verifyInvalidPersistedSnapshotRejection(token, playerId) {
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for invalid-snapshot rejection proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    await writeInvalidPersistedSnapshotDocument(playerId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
    const failureAuthTrace = await waitForFailedSnapshotAuthTrace(playerId, 'next_invalid');
    if (failureAuthTrace.identitySource !== 'next') {
        throw new Error(`expected invalid-snapshot rejection identity source to stay next, got ${failureAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (failureAuthTrace.snapshotSource !== 'next_invalid') {
        throw new Error(`expected invalid-snapshot rejection snapshot source to be next_invalid, got ${failureAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (failureAuthTrace.bootstrapPresent) {
        throw new Error(`expected invalid-snapshot rejection to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
    }
    return failureAuthTrace;
}
async function verifyInvalidPersistedSnapshotMetaPersistedSourceNormalization(token, playerId) {
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for invalid-snapshot-meta normalization proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    await writeInvalidPersistedSnapshotMetaPersistedSource(playerId);
    await clearAuthTrace();
    const bootstrap = await runNextBootstrap(token);
    if (bootstrap.playerId !== playerId) {
        throw new Error(`invalid-snapshot-meta normalization bootstrap player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
    const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
        requireReject: false,
    });
    if (authTrace.identitySource !== 'next') {
        throw new Error(`expected invalid-snapshot-meta normalization identity source to stay next, got ${authTrace.identitySource ?? 'unknown'}`);
    }
    if (authTrace.snapshotSource !== 'next') {
        throw new Error(`expected invalid-snapshot-meta normalization snapshot source to stay next, got ${authTrace.snapshotSource ?? 'unknown'}`);
    }
    if (authTrace.snapshotPersistedSource !== 'native') {
        throw new Error(`expected invalid-snapshot-meta normalization persisted source to normalize to native, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    return authTrace;
}
async function verifyInvalidPersistedSnapshotUnlockedMapIdsNormalization(token, playerId) {
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for invalid-snapshot-unlockedMapIds normalization proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    await writeInvalidPersistedSnapshotUnlockedMapIds(playerId);
    await clearAuthTrace();
    const bootstrap = await runNextBootstrap(token);
    if (bootstrap.playerId !== playerId) {
        throw new Error(`invalid-snapshot-unlockedMapIds normalization bootstrap player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
    const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
        requireReject: false,
    });
    if (authTrace.identitySource !== 'next') {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization identity source to stay next, got ${authTrace.identitySource ?? 'unknown'}`);
    }
    if (authTrace.snapshotSource !== 'next') {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization snapshot source to stay next, got ${authTrace.snapshotSource ?? 'unknown'}`);
    }
    if (authTrace.snapshotPersistedSource !== 'native') {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization persisted source to stay native, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    const state = await fetchPlayerState(playerId);
    const runtimeUnlockedMapIds = state?.player?.unlockedMapIds;
    if (!Array.isArray(runtimeUnlockedMapIds)) {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization to expose runtime array unlockedMapIds, got ${JSON.stringify(runtimeUnlockedMapIds)}`);
    }
    if (runtimeUnlockedMapIds.length !== 0) {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization to clear runtime unlockedMapIds, got ${JSON.stringify(runtimeUnlockedMapIds)}`);
    }
    return authTrace;
}
async function verifyInvalidPersistedIdentityRejection(token) {
    const payload = parseJwtPayload(token);
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
    if (!userId || !playerId) {
        throw new Error(`next auth token missing identity fields for invalid-identity rejection proof: ${JSON.stringify(payload)}`);
    }
    await writeInvalidPersistedIdentityDocument(userId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
    const failureAuthTrace = await waitForFailedIdentityAuthTrace(userId, playerId);
    if (failureAuthTrace.identitySource !== 'next_invalid') {
        throw new Error(`expected invalid-identity rejection source to be next_invalid, got ${failureAuthTrace.identitySource ?? 'unknown'}`);
    }
    if (failureAuthTrace.snapshotPresent) {
        throw new Error(`expected invalid-identity rejection to stop before snapshot load, got ${JSON.stringify(failureAuthTrace)}`);
    }
    if (failureAuthTrace.bootstrapPresent) {
        throw new Error(`expected invalid-identity rejection to avoid bootstrap, got ${JSON.stringify(failureAuthTrace)}`);
    }
    return failureAuthTrace;
}
async function registerAndLoginPlayer(accountSuffix, displayName, roleName) {
    const accountName = `acct_${accountSuffix}`;
    const password = `Pass_${accountSuffix}`;
    await requestJson('/auth/register', {
        method: 'POST',
        body: {
            accountName,
            password,
            displayName,
            roleName,
        },
    });
    const login = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
    const accessToken = typeof login?.accessToken === 'string' ? login.accessToken : '';
    const refreshToken = typeof login?.refreshToken === 'string' ? login.refreshToken : '';
    if (!accessToken || !refreshToken) {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
    const payload = parseJwtPayload(accessToken);
    if (typeof payload?.playerId !== 'string' || !payload.playerId.trim()) {
        throw new Error(`next auth token missing playerId: ${JSON.stringify(payload)}`);
    }
    if (typeof payload?.playerName !== 'string' || !payload.playerName.trim()) {
        throw new Error(`next auth token missing playerName: ${JSON.stringify(payload)}`);
    }
    return {
        accessToken,
        refreshToken,
        identity: parseTokenIdentity(accessToken),
    };
}
function parseTokenIdentity(token) {
    const payload = parseJwtPayload(token);
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
    const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
    return {
        userId: typeof payload?.sub === 'string' ? payload.sub.trim() : '',
        username: typeof payload?.username === 'string' ? payload.username.trim() : '',
        displayName: typeof payload?.displayName === 'string' ? payload.displayName.trim() : '',
        playerId,
        playerName,
    };
}
function assertBootstrapMatchesExpectedIdentity(expectedIdentity, actual) {
    if (!expectedIdentity) {
        return;
    }
    if (expectedIdentity.playerId !== actual.initPlayerId) {
        throw new Error(`token/init player mismatch: token=${expectedIdentity.playerId} init=${actual.initPlayerId}`);
    }
    if (expectedIdentity.playerId !== actual.bootstrapPlayerId) {
        throw new Error(`token/bootstrap player mismatch: token=${expectedIdentity.playerId} bootstrap=${actual.bootstrapPlayerId}`);
    }
    if (expectedIdentity.playerId !== actual.runtimePlayerId) {
        throw new Error(`token/runtime player mismatch: token=${expectedIdentity.playerId} runtime=${actual.runtimePlayerId}`);
    }
    if (expectedIdentity.playerName !== actual.runtimePlayerName) {
        throw new Error(`token/runtime player name mismatch: token=${expectedIdentity.playerName} runtime=${actual.runtimePlayerName ?? ''}`);
    }
}
async function fetchPlayerState(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function deletePlayer(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
async function flushPersistence() {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/persistence/flush`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`request failed: POST /runtime/persistence/flush: ${response.status} ${await response.text()}`);
    }
}
async function fetchAuthTrace() {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/auth-trace`);
    if (!response.ok) {
        throw new Error(`request failed: /runtime/auth-trace: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function clearAuthTrace() {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/auth-trace`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: DELETE /runtime/auth-trace: ${response.status} ${await response.text()}`);
    }
}
async function waitForFailedSnapshotAuthTrace(playerId, expectedSnapshotSource) {
    const trace = await waitForValue(async () => {
        const payload = await fetchAuthTrace();
        const trace = payload?.trace;
        if (!trace?.enabled || !Array.isArray(trace.records)) {
            throw new Error(`unexpected auth trace payload: ${JSON.stringify(payload)}`);
        }
        const acceptIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
        const identityIndex = trace.records.findIndex((entry) => entry?.type === 'identity' && entry?.playerId === playerId);
        const snapshotIndex = trace.records.findIndex((entry) => entry?.type === 'snapshot'
            && entry?.playerId === playerId
            && entry?.source === expectedSnapshotSource);
        const bootstrapIndex = trace.records.findIndex((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
        if (!(acceptIndex >= 0
            && identityIndex > acceptIndex
            && snapshotIndex > identityIndex
            && bootstrapIndex < 0)) {
            return null;
        }
        return trace;
    }, 5000, 'nextAuthTraceFailure');
    const identity = trace.records.find((entry) => entry?.type === 'identity' && entry?.playerId === playerId);
    const snapshot = trace.records.find((entry) => entry?.type === 'snapshot' && entry?.playerId === playerId);
    return {
        enabled: trace.enabled,
        recordCount: trace.records.length,
        identitySource: identity?.source ?? null,
        snapshotSource: snapshot?.source ?? null,
        snapshotPersistedSource: snapshot?.persistedSource ?? null,
        bootstrapPresent: trace.records.some((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId),
    };
}
async function waitForFailedIdentityAuthTrace(userId, playerId) {
    return waitForFailedIdentitySourceAuthTrace(userId, playerId, 'next_invalid');
}
async function waitForFailedIdentitySourceAuthTrace(userId, playerId, expectedSource) {
    const trace = await waitForValue(async () => {
        const payload = await fetchAuthTrace();
        const trace = payload?.trace;
        if (!trace?.enabled || !Array.isArray(trace.records)) {
            throw new Error(`unexpected auth trace payload: ${JSON.stringify(payload)}`);
        }
        const acceptIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
        const identityIndex = trace.records.findIndex((entry) => entry?.type === 'identity'
            && entry?.userId === userId
            && entry?.playerId === playerId
            && entry?.source === expectedSource);
        const snapshotIndex = trace.records.findIndex((entry) => entry?.type === 'snapshot' && entry?.playerId === playerId);
        const bootstrapIndex = trace.records.findIndex((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
        if (!(acceptIndex >= 0
            && identityIndex > acceptIndex
            && snapshotIndex < 0
            && bootstrapIndex < 0)) {
            return null;
        }
        return trace;
    }, 5000, 'nextAuthTraceIdentityFailure');
    const identity = trace.records.find((entry) => entry?.type === 'identity'
        && entry?.userId === userId
        && entry?.playerId === playerId
        && entry?.source === expectedSource);
    return {
        enabled: trace.enabled,
        recordCount: trace.records.length,
        identitySource: identity?.source ?? null,
        identityPersistAttempted: identity?.persistAttempted === true,
        identityPersistSucceeded: identity?.persistSucceeded === true ? true : identity?.persistSucceeded === false ? false : null,
        identityPersistFailureStage: typeof identity?.persistFailureStage === 'string' ? identity.persistFailureStage : null,
        snapshotPresent: trace.records.some((entry) => entry?.type === 'snapshot' && entry?.playerId === playerId),
        bootstrapPresent: trace.records.some((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId),
    };
}
function readSummaryCount(bucket, key) {
    const normalizedKey = typeof key === 'string' && key ? key : 'unknown';
    const value = bucket?.[normalizedKey];
    return Number.isFinite(value) ? Number(value) : 0;
}
async function waitForAuthTrace(playerId, sessionId, options = undefined) {
    const requireReject = options?.requireReject !== false;
    const trace = await waitForValue(async () => {
        const payload = await fetchAuthTrace();
        const trace = payload?.trace;
        if (!trace?.enabled || !Array.isArray(trace.records)) {
            throw new Error(`unexpected auth trace payload: ${JSON.stringify(payload)}`);
        }
        const rejectIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'reject');
        const acceptIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
        const identityIndex = trace.records.findIndex((entry) => entry?.type === 'identity'
            && entry?.playerId === playerId
            && (entry?.source === 'next'
                || entry?.source === 'token'
                || entry?.source === 'legacy_runtime'
                || entry?.source === 'legacy_backfill'));
        const snapshotIndex = trace.records.findIndex((entry) => entry?.type === 'snapshot'
            && entry?.playerId === playerId
            && (entry?.source === 'next'
                || entry?.source === 'legacy_runtime'
                || entry?.source === 'legacy_seeded'
                || entry?.source === 'miss'));
        const bootstrapIndex = trace.records.findIndex((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
        const tokenOrderingReady = requireReject
            ? rejectIndex >= 0 && acceptIndex > rejectIndex
            : acceptIndex >= 0;
        if (!(tokenOrderingReady
            && identityIndex > acceptIndex
            && snapshotIndex > identityIndex
            && bootstrapIndex > snapshotIndex)) {
            return null;
        }
        return trace;
    }, 5000, 'nextAuthTrace');
    const reject = trace.records.find((entry) => entry?.type === 'token' && entry?.outcome === 'reject');
    const accept = trace.records.find((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
    const identity = trace.records.find((entry) => entry?.type === 'identity' && entry?.playerId === playerId);
    const snapshot = trace.records.find((entry) => entry?.type === 'snapshot' && entry?.playerId === playerId);
    const bootstrap = trace.records.find((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
    const summary = trace.summary;
    if ((!reject && requireReject) || !accept || !identity || !snapshot || !bootstrap) {
        throw new Error(`unexpected auth trace payload: ${JSON.stringify(trace)}`);
    }
    if (!summary
        || typeof summary !== 'object'
        || typeof summary.recordCount !== 'number'
        || !summary.identity
        || typeof summary.identity !== 'object'
        || !summary.snapshot
        || typeof summary.snapshot !== 'object'
        || !summary.bootstrap
        || typeof summary.bootstrap !== 'object'
        || !summary.bootstrap.linkedSourceCounts
        || typeof summary.bootstrap.linkedSourceCounts !== 'object'
        || !summary.bootstrap.linkedPersistedSourceCounts
        || typeof summary.bootstrap.linkedPersistedSourceCounts !== 'object') {
        throw new Error(`unexpected auth trace summary payload: ${JSON.stringify(trace)}`);
    }
    if (typeof sessionId === 'string' && sessionId && bootstrap.sessionId !== sessionId) {
        throw new Error(`auth trace bootstrap session mismatch: trace=${bootstrap.sessionId ?? ''} expected=${sessionId}`);
    }
    if (identity.source === 'next' && identity.nextLoadHit !== true) {
        throw new Error(`identity trace inconsistent: source=next requires nextLoadHit=true, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'legacy_backfill'
        && !(identity.persistenceEnabled === true
            && identity.persistAttempted === true
            && identity.persistSucceeded === true)) {
        throw new Error(`identity trace inconsistent: source=legacy_backfill requires successful persistence, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'token'
        && !(identity.persistenceEnabled === true
            && identity.persistAttempted === true
            && identity.persistSucceeded === true
            && identity.compatTried === false)) {
        throw new Error(`identity trace inconsistent: source=token requires successful token seed persistence without compat lookup, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'legacy_runtime' && identity.persistSucceeded === true) {
        throw new Error(`identity trace inconsistent: source=legacy_runtime cannot report persistSucceeded=true, got ${JSON.stringify(identity)}`);
    }
    if ((identity.source === 'next' || identity.source === 'token') && typeof identity.persistedSource !== 'string') {
        throw new Error(`identity trace inconsistent: source=${identity.source} requires persistedSource, got ${JSON.stringify(identity)}`);
    }
    if (readSummaryCount(summary.bootstrap.entryPathCounts, bootstrap.entryPath) < 1) {
        throw new Error(`auth trace summary missing bootstrap entry path count: ${JSON.stringify(summary)}`);
    }
    if (readSummaryCount(summary.bootstrap.identitySourceCounts, bootstrap.identitySource) < 1) {
        throw new Error(`auth trace summary missing bootstrap identity source count: ${JSON.stringify(summary)}`);
    }
    const linkedSourceKey = `${identity.source ?? 'unknown'}|${snapshot.source ?? 'unknown'}`;
    if (readSummaryCount(summary.bootstrap.linkedSourceCounts, linkedSourceKey) < 1) {
        throw new Error(`auth trace summary missing linked source count for ${linkedSourceKey}: ${JSON.stringify(summary)}`);
    }
    return {
        enabled: trace.enabled,
        recordCount: trace.records.length,
        tokenRejectReason: reject?.reason ?? null,
        tokenAcceptSubject: accept.userId ?? accept.playerId ?? null,
        identitySource: identity.source ?? null,
        identityPersistedSource: typeof identity.persistedSource === 'string' ? identity.persistedSource : null,
        identityPersistenceEnabled: identity.persistenceEnabled === true,
        identityNextLoadHit: identity.nextLoadHit === true,
        identityCompatTried: identity.compatTried === true,
        identityPersistAttempted: identity.persistAttempted === true,
        identityPersistSucceeded: identity.persistSucceeded === true
            ? true
            : identity.persistSucceeded === false
                ? false
                : null,
        identityPersistFailureStage: typeof identity.persistFailureStage === 'string'
            ? identity.persistFailureStage
            : null,
        traceSummaryRecordCount: summary.recordCount,
        traceSummaryIdentityPersistedSourceCounts: summary.identity.persistedSourceCounts ?? {},
        traceSummaryIdentityPersistAttemptedCount: Number(summary.identity.persistAttemptedCount ?? 0),
        traceSummaryIdentityPersistSucceededCount: Number(summary.identity.persistSucceededCount ?? 0),
        snapshotSource: snapshot.source ?? null,
        snapshotPersistedSource: snapshot.persistedSource ?? null,
        snapshotFallbackReason: typeof snapshot.fallbackReason === 'string' ? snapshot.fallbackReason : null,
        snapshotSeedPersisted: snapshot.seedPersisted === true,
        traceSummarySnapshotFallbackReasonCounts: summary.snapshot.fallbackReasonCounts ?? {},
        bootstrapSessionId: bootstrap.sessionId ?? null,
        bootstrapProtocol: bootstrap.protocol ?? null,
        bootstrapEntryPath: bootstrap.entryPath ?? null,
        bootstrapIdentitySource: bootstrap.identitySource ?? null,
        traceSummaryBootstrapRequestedSessionCount: Number(summary.bootstrap.requestedSessionCount ?? 0),
        traceSummaryBootstrapEntryPathCount: readSummaryCount(summary.bootstrap.entryPathCounts, bootstrap.entryPath),
        traceSummaryBootstrapIdentitySourceCount: readSummaryCount(summary.bootstrap.identitySourceCounts, bootstrap.identitySource),
        traceSummaryBootstrapLinkedSourceCount: readSummaryCount(summary.bootstrap.linkedSourceCounts, linkedSourceKey),
        traceSummaryBootstrapLinkedSourceCounts: summary.bootstrap.linkedSourceCounts,
        traceSummaryBootstrapLinkedPersistedSourceCounts: summary.bootstrap.linkedPersistedSourceCounts,
    };
}
async function ensureLegacyCompatSchema() {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        username varchar(50) NOT NULL UNIQUE,
        "displayName" varchar(16) UNIQUE,
        "pendingRoleName" varchar(50),
        "passwordHash" varchar(255) NOT NULL,
        "totalOnlineSeconds" int NOT NULL DEFAULT 0,
        "currentOnlineStartedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id varchar(100) PRIMARY KEY,
        "userId" uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name varchar(50) NOT NULL,
        "mapId" varchar(50) NOT NULL DEFAULT 'yunlai_town',
        "respawnMapId" varchar(50) NOT NULL DEFAULT 'yunlai_town',
        x int NOT NULL DEFAULT 32,
        y int NOT NULL DEFAULT 5,
        facing int NOT NULL DEFAULT 1,
        "viewRange" int NOT NULL DEFAULT 8,
        hp int NOT NULL DEFAULT 100,
        "maxHp" int NOT NULL DEFAULT 100,
        qi int NOT NULL DEFAULT 0,
        dead boolean NOT NULL DEFAULT false,
        foundation int NOT NULL DEFAULT 0,
        "combatExp" int NOT NULL DEFAULT 0,
        "playerKillCount" int NOT NULL DEFAULT 0,
        "monsterKillCount" int NOT NULL DEFAULT 0,
        "eliteMonsterKillCount" int NOT NULL DEFAULT 0,
        "bossMonsterKillCount" int NOT NULL DEFAULT 0,
        "deathCount" int NOT NULL DEFAULT 0,
        "boneAgeBaseYears" int NOT NULL DEFAULT 16,
        "lifeElapsedTicks" double precision NOT NULL DEFAULT 0,
        "lifespanYears" int,
        "baseAttrs" jsonb NOT NULL DEFAULT '{}'::jsonb,
        bonuses jsonb NOT NULL DEFAULT '[]'::jsonb,
        "temporaryBuffs" jsonb NOT NULL DEFAULT '[]'::jsonb,
        inventory jsonb NOT NULL DEFAULT '{"items":[],"capacity":24}'::jsonb,
        "marketStorage" jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
        equipment jsonb NOT NULL DEFAULT '{"weapon":null,"head":null,"body":null,"legs":null,"accessory":null}'::jsonb,
        techniques jsonb NOT NULL DEFAULT '[]'::jsonb,
        "bodyTraining" jsonb NOT NULL DEFAULT '{"level":0,"exp":0,"expToNext":10000}'::jsonb,
        quests jsonb NOT NULL DEFAULT '[]'::jsonb,
        "questCrossMapNavCooldownUntilLifeTicks" double precision NOT NULL DEFAULT 0,
        "revealedBreakthroughRequirementIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "heavenGate" jsonb DEFAULT 'null'::jsonb,
        "spiritualRoots" jsonb DEFAULT 'null'::jsonb,
        "unlockedMinimapIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "autoBattle" boolean NOT NULL DEFAULT false,
        "autoBattleSkills" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "combatTargetId" varchar,
        "combatTargetLocked" boolean NOT NULL DEFAULT false,
        "autoRetaliate" boolean NOT NULL DEFAULT true,
        "autoBattleStationary" boolean NOT NULL DEFAULT false,
        "allowAoePlayerHit" boolean NOT NULL DEFAULT false,
        "autoIdleCultivation" boolean NOT NULL DEFAULT true,
        "autoSwitchCultivation" boolean NOT NULL DEFAULT false,
        "cultivatingTechId" varchar,
        online boolean NOT NULL DEFAULT false,
        "pendingLogbookMessages" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "inWorld" boolean NOT NULL DEFAULT false,
        "lastHeartbeatAt" timestamptz,
        "offlineSinceAt" timestamptz,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function seedLegacyCompatPlayerSnapshot(identity) {
    if (!identity?.userId || !identity.playerId || !identity.playerName) {
        throw new Error(`invalid identity for legacy compat seed: ${JSON.stringify(identity)}`);
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      INSERT INTO players(
        id,
        "userId",
        name,
        "mapId",
        "respawnMapId",
        x,
        y,
        facing,
        hp,
        "maxHp",
        qi,
        inventory,
        equipment,
        techniques,
        quests,
        bonuses,
        "temporaryBuffs",
        "unlockedMinimapIds",
        "autoBattleSkills",
        "pendingLogbookMessages"
      )
      VALUES (
        $1, $2, $3, 'yunlai_town', 'yunlai_town', 32, 5, 1, 87, 100, 12,
        '{"items":[],"capacity":24}'::jsonb,
        '{"weapon":null,"head":null,"body":null,"legs":null,"accessory":null}'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '["yunlai_town"]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb
      )
      ON CONFLICT (id)
      DO UPDATE SET
        "userId" = EXCLUDED."userId",
        name = EXCLUDED.name,
        "mapId" = EXCLUDED."mapId",
        "respawnMapId" = EXCLUDED."respawnMapId",
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        facing = EXCLUDED.facing,
        hp = EXCLUDED.hp,
        "maxHp" = EXCLUDED."maxHp",
        qi = EXCLUDED.qi,
        inventory = EXCLUDED.inventory,
        equipment = EXCLUDED.equipment,
        techniques = EXCLUDED.techniques,
        quests = EXCLUDED.quests,
        bonuses = EXCLUDED.bonuses,
        "temporaryBuffs" = EXCLUDED."temporaryBuffs",
        "unlockedMinimapIds" = EXCLUDED."unlockedMinimapIds",
        "autoBattleSkills" = EXCLUDED."autoBattleSkills",
        "pendingLogbookMessages" = EXCLUDED."pendingLogbookMessages",
        "updatedAt" = now()
    `, [identity.playerId, identity.userId, identity.playerName]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function dropPlayerSnapshotSourcesButKeepIdentity(playerId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_snapshots_v1', playerId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM players WHERE id = $1', [playerId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function dropPersistedPlayerSnapshot(playerId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_snapshots_v1', playerId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function dropPersistedIdentityDocument(userId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_identities_v1', userId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function expectLegacyCompatPlayerSnapshotDocument(playerId, shouldExist) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const result = await pool.query('SELECT 1 FROM players WHERE id = $1 LIMIT 1', [playerId]).catch(ignoreMissingCompatCleanupError);
        const exists = Array.isArray(result?.rows) && result.rows.length > 0;
        if (exists !== shouldExist) {
            throw new Error(`expected compat player snapshot shouldExist=${shouldExist} for playerId=${playerId}, got exists=${exists}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function expectPersistedPlayerSnapshotDocument(playerId, shouldExist) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const result = await pool.query('SELECT 1 FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', ['server_next_player_snapshots_v1', playerId]).catch(ignoreMissingCompatCleanupError);
        const exists = Array.isArray(result?.rows) && result.rows.length > 0;
        if (exists !== shouldExist) {
            throw new Error(`expected persisted snapshot document shouldExist=${shouldExist} for playerId=${playerId}, got exists=${exists}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function expectPersistedIdentityDocument(userId, shouldExist) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const result = await pool.query('SELECT 1 FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', ['server_next_player_identities_v1', userId]).catch(ignoreMissingCompatCleanupError);
        const exists = Array.isArray(result?.rows) && result.rows.length > 0;
        if (exists !== shouldExist) {
            throw new Error(`expected persisted identity document shouldExist=${shouldExist} for userId=${userId}, got exists=${exists}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function readPersistedPlayerSnapshotPayload(playerId, errorContext) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const result = await pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', ['server_next_player_snapshots_v1', playerId]).catch(ignoreMissingCompatCleanupError);
        const payload = result?.rows?.[0]?.payload;
        if (!payload || typeof payload !== 'object') {
            throw new Error(`missing persisted snapshot payload for ${errorContext}: playerId=${playerId}`);
        }
        return payload;
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writeInvalidPersistedIdentityDocument(userId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_identities_v1', userId, JSON.stringify({
            version: 1,
            userId,
            username: `broken_${userId.slice(0, 8)}`,
            updatedAt: Date.now(),
        })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writeInvalidPersistedSnapshotDocument(playerId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_snapshots_v1', playerId, JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            placement: null,
        })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writeInvalidPersistedSnapshotMetaPersistedSource(playerId) {
    const payload = await readPersistedPlayerSnapshotPayload(playerId, 'invalid meta normalization proof');
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const snapshotMeta = payload.__snapshotMeta && typeof payload.__snapshotMeta === 'object'
            ? payload.__snapshotMeta
            : {};
        const nextPayload = {
            ...payload,
            __snapshotMeta: {
                ...snapshotMeta,
                persistedSource: 'invalid_meta_source',
            },
        };
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_snapshots_v1', playerId, JSON.stringify(nextPayload)]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writeInvalidPersistedSnapshotUnlockedMapIds(playerId) {
    const payload = await readPersistedPlayerSnapshotPayload(playerId, 'invalid unlockedMapIds normalization proof');
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const nextPayload = {
            ...payload,
            unlockedMapIds: 'invalid_unlocked_map_ids',
        };
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_snapshots_v1', playerId, JSON.stringify(nextPayload)]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writePersistedIdentityDocument(identity) {
    const normalizedIdentity = normalizePersistedIdentity(identity);
    if (!normalizedIdentity) {
        throw new Error(`invalid persisted identity seed payload: ${JSON.stringify(identity)}`);
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_identities_v1', normalizedIdentity.userId, JSON.stringify(normalizedIdentity)]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function installIdentityBackfillSaveFailure(userId) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!normalizedUserId) {
        throw new Error('missing userId for identity backfill failure injection');
    }
    const suffix = normalizedUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'proof';
    const triggerName = `server_next_fail_identity_backfill_${suffix}`;
    const functionName = `server_next_fail_identity_backfill_fn_${suffix}`;
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON persistent_documents`);
        await pool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
        await pool.query(`
      CREATE FUNCTION "${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.scope = 'server_next_player_identities_v1' AND NEW.key = '${normalizedUserId}' THEN
          RAISE EXCEPTION 'forced identity backfill failure for %', NEW.key USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
        await pool.query(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT OR UPDATE ON persistent_documents
      FOR EACH ROW
      EXECUTE FUNCTION "${functionName}"()
    `);
        return {
            triggerName,
            functionName,
        };
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function installSnapshotSeedSaveFailure(playerId) {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
        throw new Error('missing playerId for snapshot seed failure injection');
    }
    const suffix = normalizedPlayerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'proof';
    const triggerName = `server_next_fail_snapshot_seed_${suffix}`;
    const functionName = `server_next_fail_snapshot_seed_fn_${suffix}`;
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON persistent_documents`);
        await pool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
        await pool.query(`
      CREATE FUNCTION "${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.scope = 'server_next_player_snapshots_v1' AND NEW.key = '${normalizedPlayerId}' THEN
          RAISE EXCEPTION 'forced snapshot seed failure for %', NEW.key USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
        await pool.query(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT OR UPDATE ON persistent_documents
      FOR EACH ROW
      EXECUTE FUNCTION "${functionName}"()
    `);
        return {
            triggerName,
            functionName,
        };
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function uninstallIdentityBackfillSaveFailure(injection) {
    if (!injection?.triggerName || !injection?.functionName) {
        return;
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${injection.triggerName}" ON persistent_documents`).catch(ignoreMissingCompatCleanupError);
        await pool.query(`DROP FUNCTION IF EXISTS "${injection.functionName}"()`).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function uninstallSnapshotSeedSaveFailure(injection) {
    if (!injection?.triggerName || !injection?.functionName) {
        return;
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${injection.triggerName}" ON persistent_documents`).catch(ignoreMissingCompatCleanupError);
        await pool.query(`DROP FUNCTION IF EXISTS "${injection.functionName}"()`).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writeInvalidLegacyCompatUnlockedMinimapIds(playerId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const result = await pool.query('UPDATE players SET "unlockedMinimapIds" = $2::jsonb, "updatedAt" = now() WHERE id = $1', [playerId, JSON.stringify({
                invalid: true,
                playerId,
            })]).catch(ignoreMissingCompatCleanupError);
        if (!result || result.rowCount === 0) {
            throw new Error(`missing compat player row for invalid unlockedMinimapIds proof: playerId=${playerId}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function writeInvalidLegacyCompatMapId(playerId) {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const result = await pool.query('UPDATE players SET "mapId" = $2, "updatedAt" = now() WHERE id = $1', [playerId, '']).catch(ignoreMissingCompatCleanupError);
        if (!result || result.rowCount === 0) {
            throw new Error(`missing compat player row for invalid mapId proof: playerId=${playerId}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function cleanupLegacyCompatPlayerSnapshot(identity) {
    if (!identity?.userId || !identity.playerId) {
        return;
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_snapshots_v1', identity.playerId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_identities_v1', identity.userId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM players WHERE id = $1', [identity.playerId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM users WHERE id = $1::uuid', [identity.userId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
function ignoreMissingCompatCleanupError(error) {
    if (error && typeof error === 'object' && error.code === '42P01') {
        return;
    }
    throw error;
}
function normalizePersistedIdentity(identity) {
    if (!identity || typeof identity !== 'object') {
        return null;
    }
    const userId = typeof identity.userId === 'string' ? identity.userId.trim() : '';
    const username = typeof identity.username === 'string' ? identity.username.trim() : '';
    const playerId = typeof identity.playerId === 'string' ? identity.playerId.trim() : '';
    if (!userId || !username || !playerId) {
        return null;
    }
    const displayName = typeof identity.displayName === 'string' && identity.displayName.trim()
        ? identity.displayName.trim()
        : username;
    const playerName = typeof identity.playerName === 'string' && identity.playerName.trim()
        ? identity.playerName.trim()
        : username;
    return {
        version: 1,
        userId,
        username,
        displayName,
        playerId,
        playerName,
        persistedSource: typeof identity.persistedSource === 'string' && identity.persistedSource.trim()
            ? identity.persistedSource.trim()
            : undefined,
        updatedAt: Date.now(),
    };
}
async function requestJson(path, init) {
    const body = init?.body === undefined ? undefined : JSON.stringify(init.body);
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
        method: init?.method ?? 'GET',
        headers: body === undefined ? undefined : {
            'content-type': 'application/json',
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`request failed: ${path}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
async function waitFor(predicate, timeoutMs, label = 'waitFor') {
    const startedAt = Date.now();
    while (true) {
        if (await predicate()) {
            return;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`${label} timeout after ${timeoutMs}ms`);
        }
        await delay(100);
    }
}
async function waitForValue(producer, timeoutMs, label = 'waitForValue') {
    let resolved = null;
    await waitFor(async () => {
        resolved = await producer();
        return resolved !== null && resolved !== undefined;
    }, timeoutMs, label);
    return resolved;
}
async function waitForPlayerState(playerId, shouldExist) {
    await waitFor(async () => {
        const state = await fetchPlayerState(playerId);
        return shouldExist ? Boolean(state?.player) : !state?.player;
    }, 5000, shouldExist ? 'waitForPlayerStatePresent' : 'waitForPlayerStateMissing');
}
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function buildUniqueDisplayName(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
function parseJwtPayload(token) {
    if (typeof token !== 'string') {
        return null;
    }
    const segments = token.split('.');
    if (segments.length < 2) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

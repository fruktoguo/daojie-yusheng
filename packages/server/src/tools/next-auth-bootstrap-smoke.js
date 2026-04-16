"use strict";
/**
 * 用途：执行 next-auth-bootstrap 链路的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
const world_gateway_1 = require("../network/world.gateway");
const world_legacy_player_repository_1 = require("../network/world-legacy-player-repository");
const world_player_auth_service_1 = require("../network/world-player-auth.service");
const world_client_event_service_1 = require("../network/world-client-event.service");
const world_player_snapshot_service_1 = require("../network/world-player-snapshot.service");
const world_player_source_service_1 = require("../network/world-player-source.service");
const world_player_token_service_1 = require("../network/world-player-token.service");
const world_session_bootstrap_service_1 = require("../network/world-session-bootstrap.service");
/**
 * 目标 server-next 服务地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/**
 * 当前 smoke 使用的数据库连接串。
 */
const SERVER_NEXT_DATABASE_URL = (0, env_alias_1.resolveServerNextDatabaseUrl)();
/**
 * 标记本次验证是否启用了数据库持久化链路。
 */
const DATABASE_ENABLED = Boolean((0, env_alias_1.resolveServerNextDatabaseUrl)().trim());
const LEGACY_HTTP_MEMORY_FALLBACK_ENABLED = isEnvEnabled('SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK')
    || isEnvEnabled('NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK');
/**
 * 控制是否允许持久化环境继续走 compat identity backfill（应急开关，默认关闭）。
 */
const ALLOW_COMPAT_IDENTITY_BACKFILL = isEnvEnabled('SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL')
    || isEnvEnabled('NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL');
/**
 * 持久化环境下默认要求 authenticated 链路只接受 next identity 真源。
 */
const STRICT_NATIVE_IDENTITY_REQUIRED = DATABASE_ENABLED && !ALLOW_COMPAT_IDENTITY_BACKFILL;
/**
 * 标记是否开启认证追踪，便于校验身份来源与落盘路径。
 */
const AUTH_TRACE_ENABLED = process.env.NEXT_AUTH_TRACE_ENABLED === '1'
    || process.env.SERVER_NEXT_AUTH_TRACE_ENABLED === '1';
/**
 * 断线会话保活窗口，用于验证续连与过期行为。
 */
const SESSION_DETACH_EXPIRE_MS = Number.isFinite(Number(process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS))
    ? Math.max(0, Math.trunc(Number(process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS)))
    : 15_000;
const NEXT_AUTH_BOOTSTRAP_PROFILE = readBootstrapProfile();
const RUN_MAINLINE_PROOFS = NEXT_AUTH_BOOTSTRAP_PROFILE !== 'migration';
const RUN_MIGRATION_PROOFS = NEXT_AUTH_BOOTSTRAP_PROFILE !== 'mainline';
const NEXT_AUTH_BOOTSTRAP_BOUNDARY = Object.freeze({
    answers: [
        'next token/bootstrap/session 主链在当前 profile 下是否仍按正式 next 合同工作',
        'mainline / migration proof 矩阵、next socket 协议守卫与 auth trace 主证明链是否通过',
    ],
    excludes: [
        '不证明 shadow / acceptance / full / destructive 维护窗口',
        '不证明 GM/admin/restore 运营面已经闭环',
        '不证明 legacy/compat 已经整体退役或 next 已完成完整替换',
    ],
    completionMapping: [
        '映射 local 与 proof:with-db 里的 auth/bootstrap 主证明链',
        '不是 replace-ready 完整完成定义，也不能单独替代 acceptance/full',
    ],
});
/**
 * 记录 legacy 下行事件集合，用于断言 next socket 没有串出旧协议消息。
 */
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
const LEGACY_ERROR_EVENT = 's:error';
/**
 * 为本次 smoke 生成唯一后缀，避免账号和玩家标识冲突。
 */
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function isEnvEnabled(key) {
    const raw = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
function buildStrictNativeSkippedProof(reason) {
    return {
        skipped: true,
        reason,
    };
}
function buildProfileSkippedProof(reason) {
    return {
        skipped: true,
        reason,
        profile: NEXT_AUTH_BOOTSTRAP_PROFILE,
    };
}
async function withEnvOverrides(overrides, run) {
    const previous = new Map();
    for (const [key, value] of Object.entries(overrides)) {
        previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
        if (value === null || value === undefined) {
            delete process.env[key];
        }
        else {
            process.env[key] = value;
        }
    }
    try {
        return await run();
    }
    finally {
        for (const [key, value] of previous.entries()) {
            if (value === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = value;
            }
        }
    }
}
function readBootstrapProfile() {
    const raw = typeof process.env.NEXT_AUTH_BOOTSTRAP_PROFILE === 'string'
        ? process.env.NEXT_AUTH_BOOTSTRAP_PROFILE.trim().toLowerCase()
        : '';
    if (raw === 'mainline' || raw === 'migration') {
        return raw;
    }
    return 'all';
}
/**
 * 编排 next 认证引导 smoke 的完整校验流程并输出证明结果。
 */
async function main() {
    if (!DATABASE_ENABLED && !LEGACY_HTTP_MEMORY_FALLBACK_ENABLED) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'no_db_legacy_http_memory_fallback_disabled',
            profile: NEXT_AUTH_BOOTSTRAP_PROFILE,
            answers: NEXT_AUTH_BOOTSTRAP_BOUNDARY.answers,
            excludes: NEXT_AUTH_BOOTSTRAP_BOUNDARY.excludes,
            completionMapping: NEXT_AUTH_BOOTSTRAP_BOUNDARY.completionMapping,
        }, null, 2));
        return;
    }
    if (DATABASE_ENABLED && !AUTH_TRACE_ENABLED) {
        throw new Error('next auth bootstrap with database requires NEXT_AUTH_TRACE_ENABLED=1 or SERVER_NEXT_AUTH_TRACE_ENABLED=1');
    }
    if (DATABASE_ENABLED) {
        await ensureLegacyCompatSchema();
    }
    if (AUTH_TRACE_ENABLED) {
        await clearAuthTrace();
    }
/**
 * 记录认证。
 */
    const auth = await registerAndLoginPlayer(`na_${suffix.slice(-6)}`, buildUniqueDisplayName(`next-auth-bootstrap:${suffix}`), `鉴角${suffix.slice(-4)}`);
    if (DATABASE_ENABLED) {
        await ensureLegacyCompatPlayerSnapshotDocument(auth.identity);
    }
/**
 * 记录legacybackfillfallbackcontract。
 */
    const legacyBackfillFallbackContract = RUN_MAINLINE_PROOFS
        ? await verifyLegacyBackfillSnapshotFallbackContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录authenticated缺失snapshot恢复contract。
 */
    const authenticatedMissingSnapshotRecoveryContract = RUN_MAINLINE_PROOFS
        ? await verifyAuthenticatedMissingSnapshotRecoveryContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    const compatRuntimeSnapshotGuardContract = RUN_MAINLINE_PROOFS
        ? await verifyCompatRuntimeSnapshotGuardContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录authenticated缺失snapshot恢复noticecontract。
 */
    const authenticatedSnapshotRecoveryNoticeContract = RUN_MAINLINE_PROOFS
        ? await verifyAuthenticatedSnapshotRecoveryNoticeContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录authenticated缺失snapshot恢复tracecontract。
 */
    const authenticatedSnapshotRecoveryTraceContract = RUN_MAINLINE_PROOFS
        ? await verifyAuthenticatedSnapshotRecoveryTraceContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录authenticated缺失snapshot恢复bootstrap链contract。
 */
    const authenticatedSnapshotRecoveryBootstrapLinkContract = RUN_MAINLINE_PROOFS
        ? await verifyAuthenticatedSnapshotRecoveryBootstrapLinkContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录令牌seedidentitycontract。
 */
    const tokenSeedIdentityContract = RUN_MAINLINE_PROOFS
        ? await verifyTokenSeedIdentityContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录令牌seed原生快照contract。
 */
    const tokenSeedNativeStarterSnapshotContract = RUN_MAINLINE_PROOFS
        ? await verifyTokenSeedNativeStarterSnapshotContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录令牌seed原生快照bootstrap证明。
 */
    const tokenSeedNativeStarterBootstrapProof = RUN_MAINLINE_PROOFS
        ? (DATABASE_ENABLED ? await verifyTokenSeedNativeStarterBootstrapProof() : null)
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录strictnativecompatsnapshotignoredcontract。
 */
    const strictNativeCompatSnapshotIgnoredContract = RUN_MAINLINE_PROOFS
        ? (DATABASE_ENABLED && STRICT_NATIVE_IDENTITY_REQUIRED
            ? await verifyStrictNativeCompatSnapshotIgnoredContract()
            : null)
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录令牌seedpersistfailurecontract。
 */
    const tokenSeedPersistFailureContract = RUN_MAINLINE_PROOFS
        ? await verifyTokenSeedPersistFailureContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录认证预种快照服务缺失contract。
 */
    const authPreseedSnapshotServiceUnavailableContract = RUN_MAINLINE_PROOFS
        ? await verifyAuthPreseedSnapshotServiceUnavailableContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    const helloAuthBootstrapForbiddenContract = RUN_MAINLINE_PROOFS
        ? await verifyHelloAuthBootstrapForbiddenContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    const implicitLegacyProtocolEntryContract = RUN_MAINLINE_PROOFS
        ? await verifyImplicitLegacyProtocolEntryContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    const gmBootstrapSessionPolicyContract = RUN_MAINLINE_PROOFS
        ? await verifyGmBootstrapSessionPolicyContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    const legacyHttpIdentityFallbackGateContract = RUN_MAINLINE_PROOFS
        ? await verifyLegacyHttpIdentityFallbackGateContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    const legacyHttpIdentityFallbackOptInContract = RUN_MAINLINE_PROOFS
        ? await verifyLegacyHttpIdentityFallbackOptInContract()
        : buildProfileSkippedProof('profile_migration_skips_mainline');
    await expectNextSocketAuthFailure('invalid.next.token');
    await expectNextSocketAuthFailure(auth.refreshToken);
    await expectNextSocketAuthFailure(auth.accessToken, 'AUTH_SESSION_ID_INVALID', {
        sessionId: 'bad session id',
    });
    await expectNextSocketAuthFailure(auth.accessToken, 'AUTH_SESSION_ID_INVALID', {
        sessionId: 'x'.repeat(129),
    });
    if (!DATABASE_ENABLED) {
        await expectNextSocketAuthFailure(auth.accessToken);
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            profile: NEXT_AUTH_BOOTSTRAP_PROFILE,
            answers: NEXT_AUTH_BOOTSTRAP_BOUNDARY.answers,
            excludes: NEXT_AUTH_BOOTSTRAP_BOUNDARY.excludes,
            completionMapping: NEXT_AUTH_BOOTSTRAP_BOUNDARY.completionMapping,
            playerId: null,
            verified: {
                nextProtocolNoDbRejectsTokenRuntime: true,
                legacyBackfillFallbackContract,
                authenticatedMissingSnapshotRecoveryContract,
                compatRuntimeSnapshotGuardContract,
                authenticatedSnapshotRecoveryNoticeContract,
                authenticatedSnapshotRecoveryTraceContract,
                authenticatedSnapshotRecoveryBootstrapLinkContract,
                tokenSeedIdentityContract,
                tokenSeedNativeStarterSnapshotContract,
                tokenSeedNativeStarterBootstrapProof,
                strictNativeCompatSnapshotIgnoredContract,
                tokenSeedPersistFailureContract,
                authPreseedSnapshotServiceUnavailableContract,
                helloAuthBootstrapForbiddenContract,
                implicitLegacyProtocolEntryContract,
                gmBootstrapSessionPolicyContract,
                legacyHttpIdentityFallbackGateContract,
                legacyHttpIdentityFallbackOptInContract,
                invalidRequestedSessionIdRejected: true,
                authenticatedSessionProof: buildProfileSkippedProof('no_db_next_protocol_rejects_token_runtime'),
                nextProtocolRejectsLegacyEventContract: buildProfileSkippedProof('no_db_next_protocol_rejects_token_runtime'),
                authTrace: null,
                snapshotSequence: null,
            },
            legacyEventsOnNextSocket: 0,
        }, null, 2));
        return;
    }
/**
 * 记录运行态玩家ID。
 */
    let runtimePlayerId = null;
    try {
/**
 * 记录firstbootstrap。
 */
        const firstBootstrap = await runNextBootstrap(auth.accessToken, auth.identity);
        runtimePlayerId = firstBootstrap.playerId;
        const nextProtocolRejectsLegacyEventContract = await verifyNextSocketRejectsLegacyEventContract(auth.accessToken, runtimePlayerId);
/**
 * 记录认证trace。
 */
        const authTrace = AUTH_TRACE_ENABLED
            ? await waitForAuthTrace(runtimePlayerId, firstBootstrap.sessionId ?? null)
            : null;
        if (DATABASE_ENABLED && authTrace?.identitySource !== 'next') {
            throw new Error(`expected with-db first identity source to be next, got ${authTrace?.identitySource ?? 'unknown'}`);
        }
        if (DATABASE_ENABLED && authTrace?.identityPersistedSource !== 'legacy_sync') {
            throw new Error(`expected with-db first identity persisted source to be legacy_sync, got ${authTrace?.identityPersistedSource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.identitySource !== 'token_runtime') {
            throw new Error(`expected no-db first identity source to be token_runtime, got ${authTrace?.identitySource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.identityCompatTried) {
            throw new Error(`expected no-db first identity path to avoid compat lookup, got ${JSON.stringify(authTrace)}`);
        }
        if (!DATABASE_ENABLED && authTrace?.snapshotFallbackReason !== 'identity_source:token_runtime') {
            throw new Error(`expected no-db first snapshot fallback reason to be identity_source:token_runtime, got ${authTrace?.snapshotFallbackReason ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.bootstrapIdentityPersistedSource !== null) {
            throw new Error(`expected no-db first bootstrap identity persisted source to be null, got ${authTrace?.bootstrapIdentityPersistedSource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.bootstrapSnapshotSource !== 'miss') {
            throw new Error(`expected no-db first bootstrap snapshot source to be miss, got ${authTrace?.bootstrapSnapshotSource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.bootstrapSnapshotPersistedSource !== null) {
            throw new Error(`expected no-db first bootstrap snapshot persisted source to be null, got ${authTrace?.bootstrapSnapshotPersistedSource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.bootstrapLinkedIdentitySource !== 'token_runtime') {
            throw new Error(`expected no-db first bootstrap linked identity source to be token_runtime, got ${authTrace?.bootstrapLinkedIdentitySource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.bootstrapLinkedSnapshotSource !== 'miss') {
            throw new Error(`expected no-db first bootstrap linked snapshot source to be miss, got ${authTrace?.bootstrapLinkedSnapshotSource ?? 'unknown'}`);
        }
        if (!DATABASE_ENABLED && authTrace?.bootstrapLinkedSnapshotPersistedSource !== null) {
            throw new Error(`expected no-db first bootstrap linked snapshot persisted source to be null, got ${authTrace?.bootstrapLinkedSnapshotPersistedSource ?? 'unknown'}`);
        }
/**
 * 记录authenticated会话证明链。
 */
        const authenticatedSessionProof = RUN_MAINLINE_PROOFS
            ? await verifyAuthenticatedSessionContract(auth.accessToken, auth.identity, runtimePlayerId, authTrace?.identitySource ?? null)
            : buildProfileSkippedProof('profile_migration_skips_mainline');
/**
 * 记录snapshotsequence。
 */
        const snapshotSequence = AUTH_TRACE_ENABLED
            ? await verifySnapshotSequence(auth.accessToken, runtimePlayerId, authTrace, {
                includeMigrationProofs: RUN_MIGRATION_PROOFS,
            })
            : null;
        if (DATABASE_ENABLED && !snapshotSequence?.supported) {
            throw new Error(`expected with-db next auth bootstrap to prove native-normalized next snapshot sequence, got ${snapshotSequence?.reason ?? 'unsupported'}`);
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            profile: NEXT_AUTH_BOOTSTRAP_PROFILE,
            answers: NEXT_AUTH_BOOTSTRAP_BOUNDARY.answers,
            excludes: NEXT_AUTH_BOOTSTRAP_BOUNDARY.excludes,
            completionMapping: NEXT_AUTH_BOOTSTRAP_BOUNDARY.completionMapping,
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
                authenticatedMissingSnapshotRecoveryContract,
                compatRuntimeSnapshotGuardContract,
                authenticatedSnapshotRecoveryNoticeContract,
                authenticatedSnapshotRecoveryTraceContract,
                authenticatedSnapshotRecoveryBootstrapLinkContract,
                tokenSeedIdentityContract,
                tokenSeedNativeStarterSnapshotContract,
                tokenSeedNativeStarterBootstrapProof,
                strictNativeCompatSnapshotIgnoredContract,
                tokenSeedPersistFailureContract,
                authPreseedSnapshotServiceUnavailableContract,
                helloAuthBootstrapForbiddenContract,
                implicitLegacyProtocolEntryContract,
                gmBootstrapSessionPolicyContract,
                legacyHttpIdentityFallbackGateContract,
                legacyHttpIdentityFallbackOptInContract,
                invalidRequestedSessionIdRejected: true,
                authenticatedSessionProof,
                nextProtocolRejectsLegacyEventContract,
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
/**
 * 验证无效或错误令牌在 next socket 上会按预期失败。
 */
async function expectNextSocketAuthFailure(token, expectedCode = 'AUTH_FAIL', options = undefined) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        autoConnect: false,
        auth: {
            token,
            protocol: 'next',
            sessionId: typeof options?.sessionId === 'string' ? options.sessionId : undefined,
        },
    });
/**
 * 记录legacyevents。
 */
    const legacyEvents = [];
/**
 * 记录nexterrorpayload。
 */
    let nextErrorPayload = null;
/**
 * 记录disconnected。
 */
    let disconnected = false;
/**
 * 记录init会话数量。
 */
    let initSessionCount = 0;
/**
 * 记录bootstrap数量。
 */
    let bootstrapCount = 0;
/**
 * 记录地图enter数量。
 */
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
        socket.connect();
        await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
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
/**
 * 记录code。
 */
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
/**
 * 创建带事件计数与等待能力的 next 协议测试 socket 包装器。
 */
function createNextSocket(token, options = undefined) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        autoConnect: false,
        auth: {
            token,
            protocol: 'next',
            sessionId: typeof options?.sessionId === 'string' ? options.sessionId : undefined,
        },
    });
/**
 * 记录byevent。
 */
    const byEvent = new Map();
/**
 * 记录legacyevents。
 */
    const legacyEvents = [];
/**
 * 记录fatalerror。
 */
    let fatalError = null;
/**
 * 记录是否由测试主动关闭。
 */
    let closedByTest = false;
/**
 * 记录地图enter数量。
 */
    let mapEnterCount = 0;
/**
 * 记录bootstrap数量。
 */
    let bootstrapCount = 0;
/**
 * 记录地图static数量。
 */
    let mapStaticCount = 0;
/**
 * 记录境界数量。
 */
    let realmCount = 0;
/**
 * 记录worlddelta数量。
 */
    let worldDeltaCount = 0;
/**
 * 记录selfdelta数量。
 */
    let selfDeltaCount = 0;
/**
 * 记录paneldelta数量。
 */
    let panelDeltaCount = 0;
    const allowedNextErrorCodes = new Set(Array.isArray(options?.allowedNextErrorCodes)
        ? options.allowedNextErrorCodes
            .filter((code) => typeof code === 'string')
            .map((code) => code.trim())
            .filter((code) => code.length > 0)
        : []);
    socket.onAny((event, payload) => {
/**
 * 记录existing。
 */
        const existing = byEvent.get(event) ?? [];
        existing.push(payload);
        byEvent.set(event, existing);
        if (LEGACY_S2C_EVENTS.has(event)) {
            legacyEvents.push(event);
        }
    });
    function clearBootstrapDisconnectFatalIfRecovered() {
        const initSessionEventCount = (byEvent.get(shared_1.NEXT_S2C.InitSession) ?? []).length;
        if (!(fatalError instanceof Error)
            || !fatalError.message.startsWith('next socket disconnected before bootstrap')
            || (initSessionEventCount <= 0 && bootstrapCount <= 0 && mapEnterCount <= 0)) {
            return;
        }
        fatalError = null;
    }
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
/**
 * 记录code。
 */
        const code = typeof payload?.code === 'string' ? payload.code : '';
        if (code === 'PLAYER_ID_MISMATCH' || allowedNextErrorCodes.has(code)) {
            return;
        }
        fatalError = new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(LEGACY_ERROR_EVENT, (payload) => {
        fatalError = new Error(`legacy error on next socket: ${JSON.stringify(payload)}`);
    });
    socket.on('connect_error', (error) => {
        fatalError = error instanceof Error ? error : new Error(String(error));
    });
    socket.on('disconnect', (reason) => {
        if (closedByTest) {
            return;
        }
        const initSessionEventCount = (byEvent.get(shared_1.NEXT_S2C.InitSession) ?? []).length;
        if (initSessionEventCount > 0 || bootstrapCount > 0 || mapEnterCount > 0) {
            return;
        }
        fatalError = new Error(`next socket disconnected before bootstrap: reason=${String(reason)} init=${(byEvent.get(shared_1.NEXT_S2C.InitSession) ?? []).length} bootstrap=${bootstrapCount} mapEnter=${mapEnterCount}`);
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
        clearBootstrapDisconnectFatalIfRecovered();
    });
    socket.on(shared_1.NEXT_S2C.Bootstrap, () => {
        bootstrapCount += 1;
        clearBootstrapDisconnectFatalIfRecovered();
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
/**
 * 在继续测试前抛出 socket 侧已捕获的致命错误。
 */
    function throwIfFatal() {
        clearBootstrapDisconnectFatalIfRecovered();
        if (fatalError) {
            throw fatalError;
        }
    }
    socket.connect();
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
/**
 * 记录timer。
 */
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
        listEventPayloads(event) {
            return (byEvent.get(event) ?? []).slice();
        },
        async waitForEvent(event, predicate = () => true, timeoutMs = 5000) {
            return waitForValue(async () => {
                throwIfFatal();
/**
 * 记录payloads。
 */
                const payloads = byEvent.get(event) ?? [];
                for (let index = payloads.length - 1; index >= 0; index -= 1) {
/**
 * 记录payload。
 */
                    const payload = payloads[index];
                    if (await predicate(payload)) {
                        return payload;
                    }
                }
                return null;
            }, timeoutMs, `next:${event}`);
        },
        close() {
            closedByTest = true;
            socket.close();
        },
    };
}
/**
 * 断言当前 next 验证链路没有收到任何 legacy 协议事件。
 */
function assertNoLegacyEvents(target, label) {
    if (target.legacyEvents.length > 0) {
        throw new Error(`${label} received legacy events: ${target.legacyEvents.join(', ')}`);
    }
}
function flattenNoticeItems(payloads) {
    const items = [];
    for (const payload of payloads) {
        if (!Array.isArray(payload?.items)) {
            continue;
        }
        for (const item of payload.items) {
            items.push(item);
        }
    }
    return items;
}
function hasPendingLogbookMessage(playerState, messageId) {
    const pendingLogbookMessages = Array.isArray(playerState?.player?.pendingLogbookMessages)
        ? playerState.player.pendingLogbookMessages
        : [];
    return pendingLogbookMessages.some((entry) => entry?.id === messageId);
}
function createAuthStarterSnapshotDeps() {
    return {
        playerRuntimeService: {
            buildStarterPersistenceSnapshot: (playerId) => ({
                version: 1,
                savedAt: Date.now(),
                placement: {
                    templateId: 'yunlai_town',
                    x: 32,
                    y: 5,
                    facing: 1,
                },
                vitals: {
                    hp: 100,
                    maxHp: 100,
                    qi: 0,
                    maxQi: 100,
                },
                progression: {
                    foundation: 0,
                    combatExp: 0,
                    bodyTraining: null,
                    boneAgeBaseYears: shared_1.DEFAULT_BONE_AGE_YEARS,
                    lifeElapsedTicks: 0,
                    lifespanYears: null,
                    realm: null,
                    heavenGate: null,
                    spiritualRoots: null,
                },
                unlockedMapIds: ['yunlai_town'],
                inventory: {
                    revision: 1,
                    capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
                    items: [{
                            itemId: `starter_token_seed_${playerId}`,
                            name: 'starter token seed item',
                            type: 'material',
                            count: 1,
                        }],
                },
                equipment: {
                    revision: 1,
                    slots: [],
                },
                techniques: {
                    revision: 1,
                    techniques: [],
                    cultivatingTechId: null,
                },
                buffs: {
                    revision: 1,
                    buffs: [],
                },
                quests: {
                    revision: 1,
                    entries: [],
                },
                combat: {
                    autoBattle: false,
                    autoRetaliate: true,
                    autoBattleStationary: false,
                    combatTargetId: null,
                    combatTargetLocked: false,
                    allowAoePlayerHit: false,
                    autoIdleCultivation: true,
                    autoSwitchCultivation: false,
                    senseQiActive: false,
                    autoBattleSkills: [],
                },
                pendingLogbookMessages: [],
                runtimeBonuses: [],
            }),
        },
    };
}
/**
 * 验证 access token 直连后能完整收到 next 首包与基础同步事件。
 */
async function runNextBootstrap(token, expectedIdentity = null, options = undefined) {
/**
 * 记录successsocket。
 */
    const successSocket = createNextSocket(token, {
        allowedNextErrorCodes: ['HELLO_AUTH_BOOTSTRAP_FORBIDDEN'],
    });
/**
 * 记录运行态玩家ID。
 */
    let runtimePlayerId = null;
    try {
        await successSocket.onceConnected();
/**
 * 记录init会话。
 */
        const initSession = await successSocket.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录bootstrap。
 */
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
/**
 * 记录状态。
 */
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
        let recoveryNoticeDelivered = false;
        let recoveryNoticePersisted = false;
        if (typeof options?.expectedNoticeMessageId === 'string' && options.expectedNoticeMessageId.trim()) {
            const expectedNoticeMessageId = options.expectedNoticeMessageId.trim();
            const refreshRecoveryNoticeState = async () => {
                const existingNoticeItems = flattenNoticeItems(successSocket.listEventPayloads(shared_1.NEXT_S2C.Notice));
                recoveryNoticeDelivered = existingNoticeItems.some((item) => item?.messageId === expectedNoticeMessageId);
                if (recoveryNoticeDelivered) {
                    return true;
                }
                const latestState = await fetchPlayerState(runtimePlayerId);
                recoveryNoticePersisted = hasPendingLogbookMessage(latestState, expectedNoticeMessageId);
                return recoveryNoticePersisted;
            };
            await refreshRecoveryNoticeState();
            if (!recoveryNoticeDelivered && !recoveryNoticePersisted) {
                try {
                    await waitFor(() => refreshRecoveryNoticeState(), 5000, `snapshotRecoveryNotice:${expectedNoticeMessageId}`);
                }
                catch (error) {
                    const latestNoticeItems = flattenNoticeItems(successSocket.listEventPayloads(shared_1.NEXT_S2C.Notice));
                    const latestState = await fetchPlayerState(runtimePlayerId).catch(() => null);
                    const latestPendingLogbookMessages = Array.isArray(latestState?.player?.pendingLogbookMessages)
                        ? latestState.player.pendingLogbookMessages
                        : [];
                    const latestAuthTrace = await waitForAuthTrace(runtimePlayerId, initSession.sid ?? null, {
                        requireReject: false,
                    }).catch(() => null);
                    throw new Error(`${error instanceof Error ? error.message : String(error)} notices=${JSON.stringify(latestNoticeItems)} pendingLogbookMessages=${JSON.stringify(latestPendingLogbookMessages)} authTrace=${JSON.stringify(latestAuthTrace)}`);
                }
            }
            if (!recoveryNoticeDelivered && !recoveryNoticePersisted) {
                throw new Error(`expected snapshot recovery notice to be delivered or persisted: ${expectedNoticeMessageId}`);
            }
        }
        const noticeItems = flattenNoticeItems(successSocket.listEventPayloads(shared_1.NEXT_S2C.Notice));
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
                duplicateInitSession: 0,
                duplicateBootstrap: 0,
                duplicateMapEnter: 0,
            },
            noticeItems,
            recoveryNoticeDelivered,
            recoveryNoticePersisted,
            legacyEvents: successSocket.legacyEvents.slice(),
        };
    }
    finally {
        successSocket.close();
    }
}
/**
 * 验证 next socket 发出 legacy 事件会被拒绝，且不会降级为 legacy 协议。
 */
async function verifyNextSocketRejectsLegacyEventContract(token, expectedPlayerId) {
    const socket = createNextSocket(token, {
        allowedNextErrorCodes: ['LEGACY_EVENT_ON_NEXT_PROTOCOL'],
    });
    try {
        await socket.onceConnected();
        const initSession = await socket.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const bootstrap = await socket.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (initSession.pid !== expectedPlayerId || bootstrap.self.id !== expectedPlayerId) {
            throw new Error(`next legacy reject contract player mismatch: expected=${expectedPlayerId} init=${initSession.pid} bootstrap=${bootstrap.self.id}`);
        }
        const legacyRejectProofs = [];
        const legacyEventsToReject = [
            { event: shared_1.C2S.Ping, payload: { clientAt: Date.now() }, label: 'c:ping' },
            { event: shared_1.C2S.RequestSuggestions, payload: {}, label: 'c:requestSuggestions' },
            { event: shared_1.C2S.RequestMailSummary, payload: {}, label: 'c:requestMailSummary' },
            { event: shared_1.C2S.RequestMailPage, payload: {}, label: 'c:requestMailPage' },
            { event: shared_1.C2S.RequestMailDetail, payload: {}, label: 'c:requestMailDetail' },
            { event: shared_1.C2S.RequestMarket, payload: {}, label: 'c:requestMarket' },
            { event: shared_1.C2S.RedeemCodes, payload: {}, label: 'c:redeemCodes' },
            { event: shared_1.C2S.MarkMailRead, payload: {}, label: 'c:markMailRead' },
            { event: shared_1.C2S.CreateSuggestion, payload: {}, label: 'c:createSuggestion' },
            { event: shared_1.C2S.VoteSuggestion, payload: {}, label: 'c:voteSuggestion' },
            { event: shared_1.C2S.ReplySuggestion, payload: {}, label: 'c:replySuggestion' },
            { event: shared_1.C2S.MarkSuggestionRepliesRead, payload: {}, label: 'c:markSuggestionRepliesRead' },
            { event: shared_1.C2S.GmMarkSuggestionCompleted, payload: {}, label: 'c:gmMarkSuggestionCompleted' },
            { event: shared_1.C2S.GmRemoveSuggestion, payload: {}, label: 'c:gmRemoveSuggestion' },
            { event: shared_1.C2S.ClaimMailAttachments, payload: {}, label: 'c:claimMailAttachments' },
            { event: shared_1.C2S.DeleteMail, payload: {}, label: 'c:deleteMail' },
            { event: shared_1.C2S.RequestMarketItemBook, payload: {}, label: 'c:requestMarketItemBook' },
            { event: shared_1.C2S.RequestMarketTradeHistory, payload: {}, label: 'c:requestMarketTradeHistory' },
            { event: shared_1.C2S.UseItem, payload: {}, label: 'c:useItem' },
            { event: shared_1.C2S.DropItem, payload: {}, label: 'c:dropItem' },
            { event: shared_1.C2S.Equip, payload: {}, label: 'c:equip' },
            { event: shared_1.C2S.Unequip, payload: {}, label: 'c:unequip' },
            { event: shared_1.C2S.Cultivate, payload: {}, label: 'c:cultivate' },
            { event: shared_1.C2S.RequestNpcShop, payload: {}, label: 'c:requestNpcShop' },
            { event: shared_1.C2S.CreateMarketSellOrder, payload: {}, label: 'c:createMarketSellOrder' },
            { event: shared_1.C2S.CreateMarketBuyOrder, payload: {}, label: 'c:createMarketBuyOrder' },
            { event: shared_1.C2S.BuyMarketItem, payload: {}, label: 'c:buyMarketItem' },
            { event: shared_1.C2S.SellMarketItem, payload: {}, label: 'c:sellMarketItem' },
            { event: shared_1.C2S.CancelMarketOrder, payload: {}, label: 'c:cancelMarketOrder' },
            { event: shared_1.C2S.ClaimMarketStorage, payload: {}, label: 'c:claimMarketStorage' },
            { event: shared_1.C2S.BuyNpcShopItem, payload: {}, label: 'c:buyNpcShopItem' },
        ];
        for (const entry of legacyEventsToReject) {
            const rejectErrorCountBeforeEmit = socket.getEventCount(shared_1.NEXT_S2C.Error);
            socket.emit(entry.event, entry.payload);
            await waitFor(() => socket.getEventCount(shared_1.NEXT_S2C.Error) > rejectErrorCountBeforeEmit, 5000, `nextLegacyReject:${entry.label}`);
            const rejectPayload = socket.listEventPayloads(shared_1.NEXT_S2C.Error)
                .slice()
                .reverse()
                .find((payload) => payload?.code === 'LEGACY_EVENT_ON_NEXT_PROTOCOL');
            if (!rejectPayload) {
                throw new Error(`expected LEGACY_EVENT_ON_NEXT_PROTOCOL when next socket emits ${entry.label}`);
            }
            legacyRejectProofs.push({
                event: entry.label,
                code: rejectPayload.code,
            });
        }
        if (socket.legacyEvents.length > 0) {
            throw new Error(`expected no legacy s2c events while rejecting legacy c2s on next socket, got ${socket.legacyEvents.join(', ')}`);
        }
        socket.emit(shared_1.NEXT_C2S.Ping, { clientAt: Date.now() });
        await socket.waitForEvent(shared_1.NEXT_S2C.Pong, () => true, 5000);
        return {
            rejectedCode: legacyRejectProofs[0]?.code ?? null,
            rejectedSecondCode: legacyRejectProofs[1]?.code ?? null,
            rejectedEvents: legacyRejectProofs,
            nextPongCount: socket.getEventCount(shared_1.NEXT_S2C.Pong),
            legacyEvents: socket.legacyEvents.slice(),
        };
    }
    finally {
        socket.close();
    }
}
async function verifyHelloAuthBootstrapForbiddenContract() {
    const emittedErrors = [];
    let disconnected = false;
    let bootstrapCallCount = 0;
    const gateway = new world_gateway_1.WorldGateway({}, {}, {
        pickSocketToken: () => 'proof_token',
        pickSocketGmToken: () => '',
        bootstrapPlayerSession: async () => {
            bootstrapCallCount += 1;
        },
    }, {
        build: () => ({
            readiness: {
                ok: true,
            },
        }),
    }, {}, {}, {}, {}, {}, {}, {}, {}, {
        markProtocol: (client, protocol) => {
            client.data.protocol = protocol;
        },
        emitError: (_client, code, message) => {
            emittedErrors.push({ code, message });
        },
        emitGatewayError: (_client, code, error) => {
            emittedErrors.push({
                code,
                message: error instanceof Error ? error.message : String(error),
            });
        },
    }, {});
    const client = {
        id: 'proof_socket_hello_auth_bootstrap_forbidden',
        handshake: {
            auth: {
                token: 'proof_token',
                protocol: 'next',
            },
        },
        data: {
            protocol: 'next',
        },
        disconnect(force) {
            disconnected = force === true;
        },
    };
    await gateway.handleHello(client, {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    if (bootstrapCallCount !== 0) {
        throw new Error(`expected hello auth bootstrap forbidden contract to avoid bootstrap service calls, got ${bootstrapCallCount}`);
    }
    if (!disconnected) {
        throw new Error('expected hello auth bootstrap forbidden contract to disconnect the socket');
    }
    if (emittedErrors.length !== 1 || emittedErrors[0]?.code !== 'HELLO_AUTH_BOOTSTRAP_FORBIDDEN') {
        throw new Error(`expected hello auth bootstrap forbidden contract to emit HELLO_AUTH_BOOTSTRAP_FORBIDDEN, got ${JSON.stringify(emittedErrors)}`);
    }
    if (typeof client.data.playerId === 'string' && client.data.playerId.trim()) {
        throw new Error(`expected hello auth bootstrap forbidden contract to avoid binding playerId, got ${client.data.playerId}`);
    }
    return {
        code: emittedErrors[0]?.code ?? null,
        disconnected,
        bootstrapCallCount,
    };
}
async function verifyImplicitLegacyProtocolEntryContract() {
    const emittedErrors = [];
    const emittedEvents = [];
    let disconnected = false;
    const gateway = new world_gateway_1.WorldGateway({}, {}, {
        pickSocketToken: (client) => typeof client?.handshake?.auth?.token === 'string' ? client.handshake.auth.token : '',
        pickSocketGmToken: (client) => typeof client?.handshake?.auth?.gmToken === 'string' ? client.handshake.auth.gmToken : '',
    }, {
        build: () => ({
            readiness: {
                ok: true,
            },
        }),
    }, {}, {}, {}, {}, {}, {}, {}, {}, {
        markProtocol: (client, protocol) => {
            client.data.protocol = protocol;
        },
        emitError: (_client, code, message) => {
            emittedErrors.push({ code, message });
        },
        emitPong: (_client, payload) => {
            emittedEvents.push({
                event: 'pong',
                payload,
            });
        },
    }, {});
    const implicitLegacyClient = {
        id: 'proof_socket_implicit_legacy_protocol',
        handshake: {
            auth: {},
        },
        data: {
            protocol: 'legacy',
        },
        disconnect(force) {
            disconnected = force === true;
        },
    };
    await gateway.handleHello(implicitLegacyClient, {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    if (!disconnected) {
        throw new Error('expected implicit legacy protocol entry to disconnect socket');
    }
    if (emittedErrors.length !== 1 || emittedErrors[0]?.code !== 'HELLO_PROTOCOL_MISMATCH') {
        throw new Error(`expected implicit legacy protocol entry to emit HELLO_PROTOCOL_MISMATCH, got ${JSON.stringify(emittedErrors)}`);
    }
    if (implicitLegacyClient.data.protocol !== 'legacy') {
        throw new Error(`expected implicit legacy protocol proof to preserve legacy context, got ${JSON.stringify(implicitLegacyClient.data)}`);
    }
    if (emittedEvents.length !== 0) {
        throw new Error(`expected implicit legacy protocol entry to avoid pong emission, got ${JSON.stringify(emittedEvents)}`);
    }
    const previousLegacySocketProtocolFlag = process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    const previousLegacySocketProtocolAlias = process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    delete process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    delete process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    emittedErrors.length = 0;
    emittedEvents.length = 0;
    disconnected = false;
    const explicitLegacyClient = {
        id: 'proof_socket_explicit_legacy_protocol_disabled',
        handshake: {
            auth: {
                protocol: 'legacy',
            },
        },
        data: {
            protocol: 'legacy',
        },
        disconnect(force) {
            disconnected = force === true;
        },
    };
    try {
        await gateway.handleConnection(explicitLegacyClient);
    }
    finally {
        if (typeof previousLegacySocketProtocolFlag === 'string') {
            process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL = previousLegacySocketProtocolFlag;
        }
        else {
            delete process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
        }
        if (typeof previousLegacySocketProtocolAlias === 'string') {
            process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL = previousLegacySocketProtocolAlias;
        }
        else {
            delete process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
        }
    }
    if (!disconnected) {
        throw new Error('expected explicit legacy protocol entry to disconnect socket while disabled');
    }
    if (emittedErrors.length !== 1 || emittedErrors[0]?.code !== 'LEGACY_PROTOCOL_DISABLED') {
        throw new Error(`expected explicit legacy protocol entry to emit LEGACY_PROTOCOL_DISABLED, got ${JSON.stringify(emittedErrors)}`);
    }
    if (typeof explicitLegacyClient.data.protocol !== 'string' || explicitLegacyClient.data.protocol !== 'legacy') {
        throw new Error(`expected explicit legacy protocol proof to preserve explicit protocol mark, got ${JSON.stringify(explicitLegacyClient.data)}`);
    }
    if (emittedEvents.length !== 0) {
        throw new Error(`expected explicit legacy protocol entry to avoid pong emission while disabled, got ${JSON.stringify(emittedEvents)}`);
    }
    const eventService = new world_client_event_service_1.WorldClientEventService({
        getSummary: async () => ({})
    }, {}, {
        getPendingLogbookMessages: () => [],
        getPlayer: () => null,
        enqueueNotice: () => undefined,
    }, {
        getAll: () => [],
    }, {
        listBindings: () => [],
        getSocketByPlayerId: () => null,
    }, {
        openLootWindow: () => ({ window: null }),
    });
    const eventClient = {
        data: {},
        emitted: [],
        emit(event, payload) {
            this.emitted.push({ event, payload });
        },
    };
    eventService.emitError(eventClient, 'PROOF_ERROR', 'proof message');
    eventService.emitSystemMessage(eventClient, 'proof notice');
    eventService.emitPong(eventClient, { clientAt: 2 });
    if (eventClient.emitted.some((entry) => LEGACY_S2C_EVENTS.has(entry.event))) {
        throw new Error(`expected unknown protocol event emission to avoid legacy events, got ${JSON.stringify(eventClient.emitted)}`);
    }
    const syncEmission = new (require("../network/world-sync-protocol.service").WorldSyncProtocolService)().resolveEmission({ data: {} });
    if (syncEmission.emitNext !== true || syncEmission.protocol !== 'next') {
        throw new Error(`expected unknown protocol sync emission to stay next-only, got ${JSON.stringify(syncEmission)}`);
    }
    const previousLegacySocketProtocolFlagForDeepGuard = process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    const previousLegacySocketProtocolAliasForDeepGuard = process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    delete process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    delete process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
    const projectionClient = {
        data: {
            protocol: 'legacy',
        },
        emitted: [],
        emit(event, payload) {
            this.emitted.push({ event, payload });
        },
    };
    const projectionService = new (require("../network/world-protocol-projection.service").WorldProtocolProjectionService)({
        buildLegacyTileRuntimeDetail: (mapId, payload) => ({
            mapId,
            x: payload?.x,
            y: payload?.y,
        }),
    }, eventService);
    const explicitLegacyDisabledEventClient = {
        data: {
            protocol: 'legacy',
        },
        emitted: [],
        emit(event, payload) {
            this.emitted.push({ event, payload });
        },
    };
    let explicitLegacyDisabledSyncEmission = null;
    let gmClient = null;
    try {
        eventService.emitError(explicitLegacyDisabledEventClient, 'PROOF_EXPLICIT_LEGACY_DISABLED', 'proof explicit legacy disabled');
        eventService.emitSystemMessage(explicitLegacyDisabledEventClient, 'proof explicit legacy disabled notice');
        explicitLegacyDisabledSyncEmission = new (require("../network/world-sync-protocol.service").WorldSyncProtocolService)().resolveEmission({ data: { protocol: 'legacy' } });
        projectionService.emitTileDetail(projectionClient, {
            mapId: 'yunlai_town',
            x: 1,
            y: 1,
            entities: [],
        });
        const RuntimeGmStateService = require("../runtime/api/gm/runtime-gm-state.service").RuntimeGmStateService;
        const runtimeGmStateService = new RuntimeGmStateService({
            listSummaries: () => [],
        }, {
            listPlayerSnapshots: () => [],
        }, {
            getRuntimeSummary: () => ({
                lastTickDurationMs: 0,
                tickPerf: {
                    totalMs: {
                        avg60: 0,
                    },
                },
            }),
            enqueueLegacyGmUpdatePlayer: () => undefined,
            enqueueLegacyGmResetPlayer: () => undefined,
            enqueueLegacyGmSpawnBots: () => undefined,
            enqueueLegacyGmRemoveBots: () => undefined,
        }, {
            getSocketByPlayerId: () => null,
        });
        gmClient = {
            data: {
                protocol: 'legacy',
            },
            emitted: [],
            emit(event, payload) {
                this.emitted.push({ event, payload });
            },
        };
        runtimeGmStateService.emitState(gmClient);
    }
    finally {
        if (typeof previousLegacySocketProtocolFlagForDeepGuard === 'string') {
            process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL = previousLegacySocketProtocolFlagForDeepGuard;
        }
        else {
            delete process.env.SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
        }
        if (typeof previousLegacySocketProtocolAliasForDeepGuard === 'string') {
            process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL = previousLegacySocketProtocolAliasForDeepGuard;
        }
        else {
            delete process.env.NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL;
        }
    }
    if (explicitLegacyDisabledEventClient.emitted.some((entry) => LEGACY_S2C_EVENTS.has(entry.event))) {
        throw new Error(`expected explicit legacy disabled event emission to stay next-only, got ${JSON.stringify(explicitLegacyDisabledEventClient.emitted)}`);
    }
    if (!explicitLegacyDisabledSyncEmission
        || explicitLegacyDisabledSyncEmission.emitLegacy !== false
        || explicitLegacyDisabledSyncEmission.emitNext !== true
        || explicitLegacyDisabledSyncEmission.protocol !== null) {
        throw new Error(`expected explicit legacy disabled sync emission to stay next-only, got ${JSON.stringify(explicitLegacyDisabledSyncEmission)}`);
    }
    if (projectionClient.emitted.some((entry) => LEGACY_S2C_EVENTS.has(entry.event))) {
        throw new Error(`expected explicit legacy disabled tile detail projection to stay next-only, got ${JSON.stringify(projectionClient.emitted)}`);
    }
    if (!gmClient || gmClient.emitted.length !== 1 || gmClient.emitted[0]?.event !== shared_1.NEXT_S2C.GmState) {
        throw new Error(`expected explicit legacy disabled gm state to emit next event only, got ${JSON.stringify(gmClient?.emitted ?? null)}`);
    }
    return {
        code: emittedErrors[0]?.code ?? null,
        disconnected,
        nextOnlyUnknownProtocolEvents: eventClient.emitted.map((entry) => entry.event),
        nextOnlyExplicitLegacyDisabledEvents: explicitLegacyDisabledEventClient.emitted.map((entry) => entry.event),
        nextOnlyProjectionEvents: projectionClient.emitted.map((entry) => entry.event),
        nextOnlyGmStateEvent: gmClient?.emitted?.[0]?.event ?? null,
    };
}
async function verifyGmBootstrapSessionPolicyContract() {
    const bootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, null, null, null, null, null, null, null, null, null);
    const gateway = new world_gateway_1.WorldGateway(null, null, bootstrapService, null, null, null, null, null, null, null, null, null, null, null);
    const gmClient = {
        id: 'proof_gm_bootstrap_client',
        handshake: {
            auth: {
                sessionId: 'gm_requested_session',
            },
        },
        data: {
            isGm: true,
            protocol: 'next',
            bootstrapEntryPath: 'connect_gm_token',
            bootstrapIdentitySource: 'next',
            bootstrapIdentityPersistedSource: 'native',
        },
    };
    const playerClient = {
        handshake: {
            auth: {
                sessionId: 'player_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'next',
            bootstrapIdentityPersistedSource: 'native',
        },
    };
    const tokenRuntimeClient = {
        handshake: {
            auth: {
                sessionId: 'token_runtime_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'token_runtime',
        },
    };
    const migrationClient = {
        handshake: {
            auth: {
                sessionId: 'migration_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'migration_backfill',
        },
    };
    const tokenClient = {
        handshake: {
            auth: {
                sessionId: 'token_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'token',
            bootstrapIdentityPersistedSource: 'token_seed',
        },
    };
    const nextTokenSeedClient = {
        handshake: {
            auth: {
                sessionId: 'next_token_seed_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'token',
            bootstrapIdentityPersistedSource: 'token_seed',
        },
    };
    const nextLegacyBackfillClient = {
        handshake: {
            auth: {
                sessionId: 'next_legacy_backfill_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'next',
            bootstrapIdentityPersistedSource: 'legacy_backfill',
        },
    };
    const nextMissingPersistedClient = {
        handshake: {
            auth: {
                sessionId: 'next_missing_persisted_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'next',
        },
    };
    const tokenInvalidPersistedClient = {
        handshake: {
            auth: {
                sessionId: 'token_invalid_persisted_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'token',
            bootstrapIdentityPersistedSource: 'legacy_backfill',
        },
    };
    const nextInvalidPersistedClient = {
        handshake: {
            auth: {
                sessionId: 'next_invalid_persisted_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'next',
            bootstrapIdentityPersistedSource: 'invalid_meta_source',
        },
    };
    const noEntryPathNextClient = {
        handshake: {
            auth: {
                sessionId: 'no_entry_path_next_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapIdentitySource: 'next',
            bootstrapIdentityPersistedSource: 'native',
        },
    };
    const implicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(gmClient);
    const requestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(gmClient);
    const connectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(gmClient);
    const playerImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(playerClient);
    const playerRequestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(playerClient);
    const playerConnectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(playerClient);
    const tokenImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(tokenClient);
    const tokenRequestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(tokenClient);
    const tokenConnectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(tokenClient);
    const nextTokenSeedImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(nextTokenSeedClient);
    const nextTokenSeedRequestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(nextTokenSeedClient);
    const nextTokenSeedConnectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(nextTokenSeedClient);
    const nextLegacyBackfillImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(nextLegacyBackfillClient);
    const nextLegacyBackfillRequestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(nextLegacyBackfillClient);
    const nextLegacyBackfillConnectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(nextLegacyBackfillClient);
    const nextMissingPersistedImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(nextMissingPersistedClient);
    const tokenInvalidPersistedImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(tokenInvalidPersistedClient);
    const nextInvalidPersistedImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(nextInvalidPersistedClient);
    const nextInvalidPersistedRequestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(nextInvalidPersistedClient);
    const nextInvalidPersistedConnectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(nextInvalidPersistedClient);
    const noEntryPathNextImplicitDetachedResumeAllowed = bootstrapService.shouldAllowImplicitDetachedResume(noEntryPathNextClient);
    const noEntryPathNextRequestedDetachedResumeAllowed = bootstrapService.shouldAllowRequestedDetachedResume(noEntryPathNextClient);
    const noEntryPathNextConnectedSessionReuseAllowed = bootstrapService.shouldAllowConnectedSessionReuse(noEntryPathNextClient);
    const gmEntryPath = gateway.resolveAuthenticatedBootstrapEntryPath(gmClient);
    const playerEntryPath = gateway.resolveAuthenticatedBootstrapEntryPath(playerClient);
    const gmBootstrapInput = gateway.buildAuthenticatedBootstrapInput(gmClient, {
        playerId: 'p_gm',
        playerName: '鉴角',
        displayName: '鉴',
    });
    const playerBootstrapInput = gateway.buildAuthenticatedBootstrapInput(playerClient, {
        playerId: 'p_player',
        playerName: '丙角',
        displayName: '丙',
    });
    const tokenBootstrapInput = gateway.buildAuthenticatedBootstrapInput(tokenClient, {
        playerId: 'p_token',
        playerName: '丁令',
        displayName: '丁令',
        authSource: 'token',
        persistedSource: 'token_seed',
    });
    const tokenRuntimeBootstrapInput = gateway.buildAuthenticatedBootstrapInput(tokenRuntimeClient, {
        playerId: 'p_token_runtime',
        playerName: '丁角',
        displayName: '丁',
        authSource: 'token_runtime',
    });
    const migrationBootstrapInput = gateway.buildAuthenticatedBootstrapInput(migrationClient, {
        playerId: 'p_migration',
        playerName: '戊角',
        displayName: '戊',
        authSource: 'migration_backfill',
    });
    const nextTokenSeedBootstrapInput = gateway.buildAuthenticatedBootstrapInput(nextTokenSeedClient, {
        playerId: 'p_next_token_seed',
        playerName: '庚角',
        displayName: '庚',
        authSource: 'token',
        persistedSource: 'token_seed',
    });
    const nextLegacyBackfillBootstrapInput = gateway.buildAuthenticatedBootstrapInput(nextLegacyBackfillClient, {
        playerId: 'p_next_legacy_backfill',
        playerName: '辛角',
        displayName: '辛',
        authSource: 'next',
        persistedSource: 'legacy_backfill',
    });
    const nextInvalidPersistedBootstrapInput = gateway.buildAuthenticatedBootstrapInput(nextInvalidPersistedClient, {
        playerId: 'p_next_invalid_persisted',
        playerName: '壬角',
        displayName: '壬',
        authSource: 'next',
        persistedSource: 'invalid_meta_source',
    });
    const noEntryPathNextBootstrapInput = gateway.buildAuthenticatedBootstrapInput(noEntryPathNextClient, {
        playerId: 'p_no_entry_path_next',
        playerName: '癸角',
        displayName: '癸',
        authSource: 'next',
        persistedSource: 'native',
    });
    const unknownBootstrapInput = gateway.buildAuthenticatedBootstrapInput({
        handshake: {
            auth: {
                sessionId: 'unknown_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapIdentitySource: 'unknown',
        },
    }, {
        playerId: 'p_unknown',
        playerName: '己角',
        displayName: '己',
        authSource: 'unknown',
    });
    const gmContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(gmClient, gmBootstrapInput);
    const playerContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(playerClient, playerBootstrapInput);
    const tokenContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(tokenClient, tokenBootstrapInput);
    const nextTokenSeedContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(nextTokenSeedClient, nextTokenSeedBootstrapInput);
    const tokenRuntimeContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(tokenRuntimeClient, tokenRuntimeBootstrapInput);
    const migrationContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(migrationClient, migrationBootstrapInput);
    const nextLegacyBackfillContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(nextLegacyBackfillClient, nextLegacyBackfillBootstrapInput);
    const nextMissingPersistedContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(nextMissingPersistedClient, {
        authSource: 'next',
    });
    const tokenInvalidPersistedContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(tokenInvalidPersistedClient, {
        authSource: 'token',
        persistedSource: 'legacy_backfill',
    });
    const nextInvalidPersistedContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(nextInvalidPersistedClient, nextInvalidPersistedBootstrapInput);
    const noEntryPathNextContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation(noEntryPathNextClient, noEntryPathNextBootstrapInput);
    const unknownContractViolation = bootstrapService.resolveAuthenticatedBootstrapContractViolation({
        handshake: {
            auth: {
                sessionId: 'unknown_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapIdentitySource: 'unknown',
            bootstrapEntryPath: 'connect_token',
        },
    }, {
        authSource: 'unknown',
    });
    if (implicitDetachedResumeAllowed
        || requestedDetachedResumeAllowed
        || connectedSessionReuseAllowed) {
        throw new Error(`expected GM bootstrap session policy to disable all session reuse, got implicit=${implicitDetachedResumeAllowed} requested=${requestedDetachedResumeAllowed} connected=${connectedSessionReuseAllowed}`);
    }
    if (gmEntryPath !== 'connect_gm_token') {
        throw new Error(`expected GM bootstrap entry path to be connect_gm_token, got ${gmEntryPath}`);
    }
    if (playerEntryPath !== 'connect_token') {
        throw new Error(`expected normal authenticated bootstrap entry path to stay connect_token, got ${playerEntryPath}`);
    }
    if (gmBootstrapInput.requestedSessionId !== undefined) {
        throw new Error(`expected GM bootstrap to ignore requested sessionId, got ${gmBootstrapInput.requestedSessionId}`);
    }
    if (playerBootstrapInput.requestedSessionId !== 'player_requested_session') {
        throw new Error(`expected normal authenticated bootstrap to keep requested sessionId, got ${playerBootstrapInput.requestedSessionId}`);
    }
    if (!playerImplicitDetachedResumeAllowed
        || !playerRequestedDetachedResumeAllowed
        || !playerConnectedSessionReuseAllowed) {
        throw new Error(`expected native next authenticated bootstrap to allow session reuse, got implicit=${playerImplicitDetachedResumeAllowed} requested=${playerRequestedDetachedResumeAllowed} connected=${playerConnectedSessionReuseAllowed}`);
    }
    if (!tokenImplicitDetachedResumeAllowed
        || !tokenRequestedDetachedResumeAllowed
        || !tokenConnectedSessionReuseAllowed) {
        throw new Error(`expected token_seed authenticated bootstrap to allow session reuse, got implicit=${tokenImplicitDetachedResumeAllowed} requested=${tokenRequestedDetachedResumeAllowed} connected=${tokenConnectedSessionReuseAllowed}`);
    }
    if (nextTokenSeedBootstrapInput.requestedSessionId !== 'next_token_seed_requested_session'
        || !nextTokenSeedImplicitDetachedResumeAllowed
        || !nextTokenSeedRequestedDetachedResumeAllowed
        || !nextTokenSeedConnectedSessionReuseAllowed) {
        throw new Error(`expected next/token_seed authenticated bootstrap to align with token/token_seed reuse policy and keep requested sessionId, got requested=${nextTokenSeedBootstrapInput.requestedSessionId} implicit=${nextTokenSeedImplicitDetachedResumeAllowed} requestedReuse=${nextTokenSeedRequestedDetachedResumeAllowed} connectedReuse=${nextTokenSeedConnectedSessionReuseAllowed}`);
    }
    if (nextLegacyBackfillBootstrapInput.requestedSessionId !== undefined
        || nextLegacyBackfillImplicitDetachedResumeAllowed
        || nextLegacyBackfillRequestedDetachedResumeAllowed
        || nextLegacyBackfillConnectedSessionReuseAllowed) {
        throw new Error(`expected next/legacy_backfill authenticated bootstrap to disable requested session reuse, got requested=${nextLegacyBackfillBootstrapInput.requestedSessionId} implicit=${nextLegacyBackfillImplicitDetachedResumeAllowed} requestedReuse=${nextLegacyBackfillRequestedDetachedResumeAllowed} connectedReuse=${nextLegacyBackfillConnectedSessionReuseAllowed}`);
    }
    if (tokenRuntimeBootstrapInput.requestedSessionId !== undefined) {
        throw new Error(`expected token_runtime authenticated bootstrap to ignore requested sessionId, got ${tokenRuntimeBootstrapInput.requestedSessionId}`);
    }
    if (migrationBootstrapInput.requestedSessionId !== undefined) {
        throw new Error(`expected migration_backfill authenticated bootstrap to ignore requested sessionId, got ${migrationBootstrapInput.requestedSessionId}`);
    }
    if (unknownBootstrapInput.requestedSessionId !== undefined) {
        throw new Error(`expected unknown authenticated bootstrap source to ignore requested sessionId, got ${unknownBootstrapInput.requestedSessionId}`);
    }
    if (nextMissingPersistedImplicitDetachedResumeAllowed) {
        throw new Error(`expected next authenticated bootstrap without persistedSource to disable session reuse, got ${nextMissingPersistedImplicitDetachedResumeAllowed}`);
    }
    if (tokenInvalidPersistedImplicitDetachedResumeAllowed) {
        throw new Error(`expected token authenticated bootstrap with invalid persistedSource to disable session reuse, got ${tokenInvalidPersistedImplicitDetachedResumeAllowed}`);
    }
    if (nextInvalidPersistedBootstrapInput.requestedSessionId !== undefined
        || nextInvalidPersistedImplicitDetachedResumeAllowed
        || nextInvalidPersistedRequestedDetachedResumeAllowed
        || nextInvalidPersistedConnectedSessionReuseAllowed) {
        throw new Error(`expected next authenticated bootstrap with invalid persistedSource to disable requested session reuse, got requested=${nextInvalidPersistedBootstrapInput.requestedSessionId} implicit=${nextInvalidPersistedImplicitDetachedResumeAllowed} requestedReuse=${nextInvalidPersistedRequestedDetachedResumeAllowed} connectedReuse=${nextInvalidPersistedConnectedSessionReuseAllowed}`);
    }
    if (noEntryPathNextBootstrapInput.requestedSessionId !== undefined
        || noEntryPathNextImplicitDetachedResumeAllowed
        || noEntryPathNextRequestedDetachedResumeAllowed
        || noEntryPathNextConnectedSessionReuseAllowed) {
        throw new Error(`expected authenticated bootstrap without entryPath to ignore requested sessionId, got requested=${noEntryPathNextBootstrapInput.requestedSessionId} implicit=${noEntryPathNextImplicitDetachedResumeAllowed} requestedReuse=${noEntryPathNextRequestedDetachedResumeAllowed} connectedReuse=${noEntryPathNextConnectedSessionReuseAllowed}`);
    }
    if (gmContractViolation !== null
        || playerContractViolation !== null
        || tokenContractViolation !== null
        || nextTokenSeedContractViolation !== null
        || noEntryPathNextContractViolation !== null) {
        throw new Error(`expected valid next bootstrap identities to pass contract guard, got gm=${JSON.stringify(gmContractViolation)} player=${JSON.stringify(playerContractViolation)} token=${JSON.stringify(tokenContractViolation)} nextTokenSeed=${JSON.stringify(nextTokenSeedContractViolation)} noEntry=${JSON.stringify(noEntryPathNextContractViolation)}`);
    }
    if (tokenRuntimeContractViolation?.stage !== 'next_bootstrap_identity_source_blocked') {
        throw new Error(`expected token_runtime next bootstrap contract to be blocked by identity source, got ${JSON.stringify(tokenRuntimeContractViolation)}`);
    }
    if (migrationContractViolation?.stage !== 'next_bootstrap_identity_source_blocked') {
        throw new Error(`expected migration_backfill next bootstrap contract to be blocked by identity source, got ${JSON.stringify(migrationContractViolation)}`);
    }
    if (nextLegacyBackfillContractViolation?.stage !== 'next_bootstrap_next_persisted_source_invalid') {
        throw new Error(`expected next legacy_backfill bootstrap contract to be blocked by persistedSource, got ${JSON.stringify(nextLegacyBackfillContractViolation)}`);
    }
    if (nextMissingPersistedContractViolation?.stage !== 'next_bootstrap_persisted_source_missing') {
        throw new Error(`expected next bootstrap contract without persistedSource to be blocked, got ${JSON.stringify(nextMissingPersistedContractViolation)}`);
    }
    if (tokenInvalidPersistedContractViolation?.stage !== 'next_bootstrap_token_persisted_source_invalid') {
        throw new Error(`expected token bootstrap contract with invalid persistedSource to be blocked, got ${JSON.stringify(tokenInvalidPersistedContractViolation)}`);
    }
    if (nextInvalidPersistedContractViolation?.stage !== 'next_bootstrap_next_persisted_source_invalid') {
        throw new Error(`expected next bootstrap contract with invalid persistedSource to be blocked, got ${JSON.stringify(nextInvalidPersistedContractViolation)}`);
    }
    if (unknownContractViolation?.stage !== 'next_bootstrap_identity_source_blocked') {
        throw new Error(`expected unknown next bootstrap contract to be blocked by identity source, got ${JSON.stringify(unknownContractViolation)}`);
    }
    return {
        implicitDetachedResumeAllowed,
        requestedDetachedResumeAllowed,
        connectedSessionReuseAllowed,
        playerImplicitDetachedResumeAllowed,
        playerRequestedDetachedResumeAllowed,
        playerConnectedSessionReuseAllowed,
        tokenImplicitDetachedResumeAllowed,
        tokenRequestedDetachedResumeAllowed,
        tokenConnectedSessionReuseAllowed,
        nextTokenSeedImplicitDetachedResumeAllowed,
        nextTokenSeedRequestedDetachedResumeAllowed,
        nextTokenSeedConnectedSessionReuseAllowed,
        nextLegacyBackfillImplicitDetachedResumeAllowed,
        nextLegacyBackfillRequestedDetachedResumeAllowed,
        nextLegacyBackfillConnectedSessionReuseAllowed,
        nextMissingPersistedImplicitDetachedResumeAllowed,
        tokenInvalidPersistedImplicitDetachedResumeAllowed,
        nextInvalidPersistedImplicitDetachedResumeAllowed,
        nextInvalidPersistedRequestedDetachedResumeAllowed,
        nextInvalidPersistedConnectedSessionReuseAllowed,
        noEntryPathNextImplicitDetachedResumeAllowed,
        noEntryPathNextRequestedDetachedResumeAllowed,
        noEntryPathNextConnectedSessionReuseAllowed,
        gmEntryPath,
        playerEntryPath,
        gmRequestedSessionId: gmBootstrapInput.requestedSessionId ?? null,
        playerRequestedSessionId: playerBootstrapInput.requestedSessionId ?? null,
        nextTokenSeedRequestedSessionId: nextTokenSeedBootstrapInput.requestedSessionId ?? null,
        nextLegacyBackfillRequestedSessionId: nextLegacyBackfillBootstrapInput.requestedSessionId ?? null,
        tokenRuntimeRequestedSessionId: tokenRuntimeBootstrapInput.requestedSessionId ?? null,
        migrationRequestedSessionId: migrationBootstrapInput.requestedSessionId ?? null,
        nextInvalidPersistedRequestedSessionId: nextInvalidPersistedBootstrapInput.requestedSessionId ?? null,
        noEntryPathNextRequestedSessionId: noEntryPathNextBootstrapInput.requestedSessionId ?? null,
        unknownRequestedSessionId: unknownBootstrapInput.requestedSessionId ?? null,
        tokenRuntimeContractViolationStage: tokenRuntimeContractViolation?.stage ?? null,
        migrationContractViolationStage: migrationContractViolation?.stage ?? null,
        nextLegacyBackfillContractViolationStage: nextLegacyBackfillContractViolation?.stage ?? null,
        nextMissingPersistedContractViolationStage: nextMissingPersistedContractViolation?.stage ?? null,
        tokenInvalidPersistedContractViolationStage: tokenInvalidPersistedContractViolation?.stage ?? null,
        nextInvalidPersistedContractViolationStage: nextInvalidPersistedContractViolation?.stage ?? null,
        unknownContractViolationStage: unknownContractViolation?.stage ?? null,
    };
}
async function verifyLegacyHttpIdentityFallbackGateContract() {
    return withEnvOverrides({
        SERVER_NEXT_AUTH_DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK: '1',
        NEXT_AUTH_DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK: null,
    }, async () => {
        const payload = {
            sub: 'proof-user-legacy-http-gate',
            username: 'proof_user_legacy_http_gate',
            displayName: '鉴',
        };
        let httpCallCount = 0;
        const service = new world_player_source_service_1.WorldPlayerSourceService({
            findUserById: async () => {
                httpCallCount += 1;
                return {
                    id: payload.sub,
                    username: payload.username,
                    displayName: payload.displayName,
                    pendingRoleName: '鉴',
                };
            },
        });
        const originalEnsurePool = service.ensurePool.bind(service);
        const originalQueryLegacyPlayerIdentityRow = world_legacy_player_repository_1.queryLegacyPlayerIdentityRow;
        try {
            service.ensurePool = async () => null;
            const poolUnavailableResult = await service.resolvePlayerIdentityFromCompatSource(payload);
            if (poolUnavailableResult !== null || httpCallCount !== 0) {
                throw new Error(`expected legacy http identity fallback gate to block pool-unavailable http fallback, got result=${JSON.stringify(poolUnavailableResult)} httpCallCount=${httpCallCount}`);
            }
            const poolUnavailableExplicitResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                allowCompatMigration: true,
                allowLegacyHttpIdentityFallback: true,
            });
            if (poolUnavailableExplicitResult !== null || httpCallCount !== 0) {
                throw new Error(`expected env-gated legacy http fallback to stay blocked even with explicit opt-in, got result=${JSON.stringify(poolUnavailableExplicitResult)} httpCallCount=${httpCallCount}`);
            }
            service.ensurePool = async () => ({});
            world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => null;
            const missingRowResult = await service.resolvePlayerIdentityFromCompatSource(payload);
            if (missingRowResult !== null || httpCallCount !== 0) {
                throw new Error(`expected legacy http identity fallback gate to block missing-row http fallback, got result=${JSON.stringify(missingRowResult)} httpCallCount=${httpCallCount}`);
            }
            world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => {
                const error = new Error('legacy schema missing');
                error.code = '42P01';
                throw error;
            };
            const missingSchemaResult = await service.resolvePlayerIdentityFromCompatSource(payload);
            if (missingSchemaResult !== null || httpCallCount !== 0) {
                throw new Error(`expected legacy http identity fallback gate to block missing-schema http fallback, got result=${JSON.stringify(missingSchemaResult)} httpCallCount=${httpCallCount}`);
            }
            return {
                poolUnavailableBlocked: true,
                explicitEnvBlocked: true,
                missingRowBlocked: true,
                missingSchemaBlocked: true,
                httpCallCount,
            };
        }
        finally {
            service.ensurePool = originalEnsurePool;
            world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = originalQueryLegacyPlayerIdentityRow;
            await service.onModuleDestroy().catch(() => undefined);
        }
    });
}
async function verifyLegacyHttpIdentityFallbackOptInContract() {
    return withEnvOverrides({
        SERVER_NEXT_AUTH_DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK: null,
        NEXT_AUTH_DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK: null,
        SERVER_NEXT_ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK: null,
        NEXT_ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK: null,
    }, async () => {
        const payload = {
            sub: 'proof-user-legacy-http-opt-in',
            username: 'proof_user_legacy_http_opt_in',
            displayName: '鉴',
        };
        let httpCallCount = 0;
        const service = new world_player_source_service_1.WorldPlayerSourceService({
            findUserById: async () => {
                httpCallCount += 1;
                return {
                    id: payload.sub,
                    username: payload.username,
                    displayName: payload.displayName,
                    pendingRoleName: '鉴',
                };
            },
        });
        const originalEnsurePool = service.ensurePool.bind(service);
        const originalQueryLegacyPlayerIdentityRow = world_legacy_player_repository_1.queryLegacyPlayerIdentityRow;
        try {
            service.ensurePool = async () => null;
            const defaultBlockedResult = await service.resolvePlayerIdentityFromCompatSource(payload);
            if (defaultBlockedResult !== null || httpCallCount !== 0) {
                throw new Error(`expected legacy http fallback to stay blocked without explicit opt-in, got result=${JSON.stringify(defaultBlockedResult)} httpCallCount=${httpCallCount}`);
            }
            const explicitPoolUnavailableResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                allowCompatMigration: true,
                allowLegacyHttpIdentityFallback: true,
            });
            if (explicitPoolUnavailableResult !== null || httpCallCount !== 0) {
                throw new Error(`expected explicit opt-in to stay blocked without allow env, got result=${JSON.stringify(explicitPoolUnavailableResult)} httpCallCount=${httpCallCount}`);
            }
            service.ensurePool = async () => ({});
            world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => null;
            const explicitMissingRowResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                allowCompatMigration: true,
                allowLegacyHttpIdentityFallback: true,
            });
            if (explicitMissingRowResult !== null || httpCallCount !== 0) {
                throw new Error(`expected missing-row explicit opt-in to stay blocked without allow env, got result=${JSON.stringify(explicitMissingRowResult)} httpCallCount=${httpCallCount}`);
            }
            world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => {
                const error = new Error('legacy schema missing');
                error.code = '42P01';
                throw error;
            };
            const explicitMissingSchemaResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                allowCompatMigration: true,
                allowLegacyHttpIdentityFallback: true,
            });
            if (explicitMissingSchemaResult !== null || httpCallCount !== 0) {
                throw new Error(`expected missing-schema explicit opt-in to stay blocked without allow env, got result=${JSON.stringify(explicitMissingSchemaResult)} httpCallCount=${httpCallCount}`);
            }
            return withEnvOverrides({
                SERVER_NEXT_ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK: '1',
                NEXT_ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK: null,
            }, async () => {
                service.ensurePool = async () => null;
                const allowEnvPoolUnavailableResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                    allowCompatMigration: true,
                    allowLegacyHttpIdentityFallback: true,
                });
                if (!allowEnvPoolUnavailableResult || allowEnvPoolUnavailableResult.userId !== payload.sub || httpCallCount !== 1) {
                    throw new Error(`expected explicit opt-in plus allow env to enable pool-unavailable http fallback, got result=${JSON.stringify(allowEnvPoolUnavailableResult)} httpCallCount=${httpCallCount}`);
                }
                service.ensurePool = async () => ({});
                world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => null;
                const allowEnvMissingRowResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                    allowCompatMigration: true,
                    allowLegacyHttpIdentityFallback: true,
                });
                if (!allowEnvMissingRowResult || allowEnvMissingRowResult.userId !== payload.sub || httpCallCount !== 2) {
                    throw new Error(`expected explicit opt-in plus allow env to enable missing-row http fallback, got result=${JSON.stringify(allowEnvMissingRowResult)} httpCallCount=${httpCallCount}`);
                }
                world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => {
                    const error = new Error('legacy schema missing');
                    error.code = '42P01';
                    throw error;
                };
                const allowEnvMissingSchemaResult = await service.resolvePlayerIdentityFromCompatSource(payload, {
                    allowCompatMigration: true,
                    allowLegacyHttpIdentityFallback: true,
                });
                if (!allowEnvMissingSchemaResult || allowEnvMissingSchemaResult.userId !== payload.sub || httpCallCount !== 3) {
                    throw new Error(`expected explicit opt-in plus allow env to enable missing-schema http fallback, got result=${JSON.stringify(allowEnvMissingSchemaResult)} httpCallCount=${httpCallCount}`);
                }
                return {
                    defaultBlockedWithoutExplicitOptIn: true,
                    explicitBlockedWithoutAllowEnv: true,
                    explicitPoolUnavailableEnabled: true,
                    explicitMissingRowEnabled: true,
                    explicitMissingSchemaEnabled: true,
                    httpCallCount,
                };
            });
        }
        finally {
            service.ensurePool = originalEnsurePool;
            world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = originalQueryLegacyPlayerIdentityRow;
            await service.onModuleDestroy().catch(() => undefined);
        }
    });
}
/**
 * 根据身份来源判断断线后是否应隐式续用既有会话。
 */
function shouldExpectImplicitDetachedResume(identitySource) {
    return identitySource === 'next'
        || identitySource === 'token';
}
/**
 * 根据身份来源判断顶号替换时是否应复用当前会话编号。
 */
function shouldExpectConnectedSessionReuse(identitySource) {
    return shouldExpectImplicitDetachedResume(identitySource);
}
/**
 * 显式请求错误 sid 不应悄悄复用在线会话，必须换发新 sid。
 */
function shouldExpectRequestedSessionMismatchRotation() {
    return true;
}
/**
 * 验证认证玩家在顶号、断线续连、显式续连和过期后的会话契约。
 */
async function verifyAuthenticatedSessionContract(token, expectedIdentity, expectedPlayerId, identitySource = null) {
/**
 * 记录first。
 */
    const first = createNextSocket(token);
/**
 * 记录second。
 */
    let second = null;
/**
 * 记录third。
 */
    let third = null;
/**
 * 记录fourth。
 */
    let fourth = null;
/**
 * 记录fifth。
 */
    let fifth = null;
/**
 * 记录sixth。
 */
    let sixth = null;
    try {
        await first.onceConnected();
/**
 * 记录firstinit。
 */
        const firstInit = await first.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录firstbootstrap。
 */
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
/**
 * 记录replacedkick。
 */
        const replacedKick = await first.waitForEvent(shared_1.NEXT_S2C.Kick, (payload) => payload?.reason === 'replaced', 5000);
/**
 * 记录secondinit。
 */
        const secondInit = await second.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录secondbootstrap。
 */
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
        third = createNextSocket(token, { sessionId: `${secondInit.sid}:stale` });
        await third.onceConnected();
/**
 * 记录staleRequestedKick。
 */
        const staleRequestedKick = await second.waitForEvent(shared_1.NEXT_S2C.Kick, (payload) => payload?.reason === 'replaced', 5000);
/**
 * 记录staleRequestedInit。
 */
        const staleRequestedInit = await third.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录staleRequestedBootstrap。
 */
        const staleRequestedBootstrap = await third.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (staleRequestedKick?.reason !== 'replaced') {
            throw new Error(`expected authenticated stale-request replacement kick, got ${JSON.stringify(staleRequestedKick)}`);
        }
        if (staleRequestedInit.pid !== expectedPlayerId || staleRequestedBootstrap.self.id !== expectedPlayerId) {
            throw new Error(`authenticated session proof stale-request bootstrap player mismatch: ${JSON.stringify(staleRequestedInit)}`);
        }
        if (shouldExpectRequestedSessionMismatchRotation() && staleRequestedInit.sid === secondInit.sid) {
            throw new Error(`expected authenticated stale requested sid to rotate away from connected sid=${secondInit.sid}, got ${JSON.stringify(staleRequestedInit)}`);
        }
        if (staleRequestedInit.resumed === true) {
            throw new Error(`expected authenticated stale requested sid reconnect to avoid resumed=true, got ${JSON.stringify(staleRequestedInit)}`);
        }
        third.close();
        await delay(1200);
        fourth = createNextSocket(token);
        await fourth.onceConnected();
/**
 * 记录resumedinit。
 */
        const resumedInit = await fourth.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录resumedbootstrap。
 */
        const resumedBootstrap = await fourth.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (resumedInit.pid !== expectedPlayerId || resumedBootstrap.self.id !== expectedPlayerId) {
            throw new Error(`authenticated session proof resumed bootstrap player mismatch: ${JSON.stringify(resumedInit)}`);
        }
        if (shouldExpectImplicitDetachedResume(identitySource)) {
            if (resumedInit.sid !== staleRequestedInit.sid || resumedInit.resumed !== true) {
                throw new Error(`expected authenticated detached reconnect to resume latest sid=${staleRequestedInit.sid}, got ${JSON.stringify(resumedInit)}`);
            }
        }
        else {
            if (resumedInit.resumed === true) {
                throw new Error(`expected authenticated detached reconnect to avoid implicit resume for identitySource=${identitySource ?? 'unknown'}, got ${JSON.stringify(resumedInit)}`);
            }
            if (resumedInit.sid === staleRequestedInit.sid) {
                throw new Error(`expected authenticated detached reconnect to rotate sid for identitySource=${identitySource ?? 'unknown'}, got ${JSON.stringify(resumedInit)}`);
            }
        }
        fourth.close();
        await delay(1200);
        fifth = createNextSocket(token, { sessionId: resumedInit.sid });
        await fifth.onceConnected();
/**
 * 记录explicitrequestedinit。
 */
        const explicitRequestedInit = await fifth.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录explicitrequestedbootstrap。
 */
        const explicitRequestedBootstrap = await fifth.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
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
        fifth.close();
        await delay(SESSION_DETACH_EXPIRE_MS + 1200);
        sixth = createNextSocket(token);
        await sixth.onceConnected();
/**
 * 记录expiredinit。
 */
        const expiredInit = await sixth.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
/**
 * 记录expiredbootstrap。
 */
        const expiredBootstrap = await sixth.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
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
        assertNoLegacyEvents(sixth, 'next-auth-session:sixth');
        return {
            playerId: expectedPlayerId,
            initialSid: firstInit.sid ?? null,
            replacedSid: secondInit.sid ?? null,
            requestedMismatchSid: staleRequestedInit.sid ?? null,
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
        sixth?.close();
    }
}
/**
 * 验证 legacy 回填快照在不同持久化开关下的回退契约。
 */
async function verifyLegacyBackfillSnapshotFallbackContract() {
/**
 * 记录payload。
 */
    const payload = {
        sub: 'proof_user_legacy_backfill',
        playerId: 'proof_player_legacy_backfill',
    };
/**
 * 记录compatidentity。
 */
    const compatIdentity = {
        userId: payload.sub,
        username: 'proof_legacy_backfill',
        displayName: 'proof legacy backfill',
        playerId: payload.playerId,
        playerName: 'proof legacy backfill',
    };
    const starterSnapshotDeps = createAuthStarterSnapshotDeps();
    const readLatestIdentityTrace = (playerId) => {
        const trace = (0, world_player_token_service_1.readAuthTrace)();
        return {
            entry: trace.records
                .filter((entry) => entry?.type === 'identity' && entry?.playerId === playerId)
                .slice(-1)[0] ?? null,
            summary: trace.summary ?? null,
        };
    };
/**
 * 记录认证服务。
 */
    const authService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    }, {
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'compat_snapshot_next_load_failed',
        }),
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    });
/**
 * 记录blockedidentity。
 */
    const blockedIdentity = await authService.authenticatePlayerToken('proof.token.legacy_backfill');
    if (blockedIdentity !== null) {
        throw new Error(`expected persistence-enabled compat backfill preseed failure to reject auth before bootstrap, got ${JSON.stringify(blockedIdentity)}`);
    }
/**
 * 记录no持久化认证服务。
 */
    let noPersistenceCompatIdentityCalls = 0;
    const noPersistenceAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => false,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => {
            noPersistenceCompatIdentityCalls += 1;
            return compatIdentity;
        },
        loadPlayerSnapshotForMigration: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    }, {
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    });
/**
 * 记录legacy运行态identity。
 */
    const noPersistenceIdentity = await noPersistenceAuthService.authenticatePlayerToken('proof.token.legacy_backfill');
    if (noPersistenceIdentity !== null) {
        throw new Error(`expected non-persistence auth path to reject runtime compat identity fallback, got ${JSON.stringify(noPersistenceIdentity)}`);
    }
    const nextProtocolIdentity = await noPersistenceAuthService.authenticatePlayerToken('proof.token.legacy_backfill', {
        protocol: 'next',
    });
    if (nextProtocolIdentity !== null) {
        throw new Error(`expected next protocol auth path to block compat migration identity before gateway, got ${JSON.stringify(nextProtocolIdentity)}`);
    }
    if (noPersistenceCompatIdentityCalls !== 0) {
        throw new Error(`expected runtime compat identity to stay disabled in no-persistence auth path, got compatIdentityCalls=${noPersistenceCompatIdentityCalls}`);
    }
/**
 * 记录compat迁移协议gate认证服务。
 */
    const compatMigrationProtocolGateAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    }, {
        ensureMigrationBackfillSnapshot: async () => ({
            ok: true,
            persistedSource: 'native',
            snapshot: {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 1,
                    y: 1,
                    facing: 1,
                },
            },
        }),
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    });
    const previousCompatBackfillFlag = process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
    const previousCompatBackfillAlias = process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
    const previousCompatBackfillDatabaseUrl = process.env.SERVER_NEXT_DATABASE_URL;
    const previousCompatBackfillDatabaseUrlAlias = process.env.DATABASE_URL;
    process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = '1';
    delete process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
    process.env.SERVER_NEXT_DATABASE_URL = 'postgres://proof-compat-gate';
    delete process.env.DATABASE_URL;
    let compatBackfillLegacyProtocolDefault = null;
    let compatBackfillLegacyProtocolExplicit = null;
    let compatBackfillMigrationProtocol = null;
    try {
        compatBackfillLegacyProtocolDefault = await compatMigrationProtocolGateAuthService.authenticatePlayerToken('proof.token.compat_protocol.default', {
            protocol: 'legacy',
        });
        compatBackfillLegacyProtocolExplicit = await compatMigrationProtocolGateAuthService.authenticatePlayerToken('proof.token.compat_protocol.explicit', {
            protocol: 'legacy',
        });
        compatBackfillMigrationProtocol = await compatMigrationProtocolGateAuthService.authenticatePlayerToken('proof.token.compat_protocol.migration', {
            protocol: 'migration',
        });
    }
    finally {
        if (typeof previousCompatBackfillFlag === 'string') {
            process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = previousCompatBackfillFlag;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
        }
        if (typeof previousCompatBackfillAlias === 'string') {
            process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = previousCompatBackfillAlias;
        }
        else {
            delete process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
        }
        if (typeof previousCompatBackfillDatabaseUrl === 'string') {
            process.env.SERVER_NEXT_DATABASE_URL = previousCompatBackfillDatabaseUrl;
        }
        else {
            delete process.env.SERVER_NEXT_DATABASE_URL;
        }
        if (typeof previousCompatBackfillDatabaseUrlAlias === 'string') {
            process.env.DATABASE_URL = previousCompatBackfillDatabaseUrlAlias;
        }
        else {
            delete process.env.DATABASE_URL;
        }
    }
    if (compatBackfillLegacyProtocolDefault !== null) {
        throw new Error(`expected compat backfill to reject legacy protocol runtime entry, got ${JSON.stringify(compatBackfillLegacyProtocolDefault)}`);
    }
    if (compatBackfillLegacyProtocolExplicit !== null) {
        throw new Error(`expected compat backfill to reject legacy protocol explicit runtime entry, got ${JSON.stringify(compatBackfillLegacyProtocolExplicit)}`);
    }
    if (compatBackfillMigrationProtocol?.authSource !== 'migration_backfill') {
        throw new Error(`expected compat backfill to allow explicit migration protocol runtime entry, got ${JSON.stringify(compatBackfillMigrationProtocol)}`);
    }
    const tokenPersistedSourceMismatchPayload = {
        sub: 'proof_user_token_persisted_source_mismatch',
        playerId: 'proof_player_token_persisted_source_mismatch',
        playerName: 'proof token persisted source mismatch',
    };
    const tokenPersistedSourceMismatchIdentity = {
        userId: tokenPersistedSourceMismatchPayload.sub,
        username: 'proof_token_persisted_source_mismatch',
        displayName: 'proof token persisted source mismatch',
        playerId: tokenPersistedSourceMismatchPayload.playerId,
        playerName: tokenPersistedSourceMismatchPayload.playerName,
    };
    const tokenPersistedSourceMismatchAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => tokenPersistedSourceMismatchPayload,
        resolvePlayerIdentityFromPayload: () => tokenPersistedSourceMismatchIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => ({
            ...input,
            persistedSource: 'legacy_backfill',
        }),
    }, {
        resolvePlayerIdentityForMigration: async () => null,
        loadPlayerSnapshotForMigration: async () => null,
    }, starterSnapshotDeps);
    (0, world_player_token_service_1.clearAuthTrace)();
    const tokenPersistedSourceMismatchResult = await tokenPersistedSourceMismatchAuthService.authenticatePlayerToken('proof.token.token_persisted_source_mismatch');
    const tokenPersistedSourceMismatchTrace = readLatestIdentityTrace(tokenPersistedSourceMismatchPayload.playerId);
    if (tokenPersistedSourceMismatchResult !== null
        || tokenPersistedSourceMismatchTrace.entry?.source !== 'token_persist_blocked'
        || tokenPersistedSourceMismatchTrace.entry?.persistFailureStage !== 'token_seed_persisted_source_mismatch'
        || tokenPersistedSourceMismatchTrace.entry?.persistedSource !== 'legacy_backfill') {
        throw new Error(`expected token persistedSource mismatch to block auth before bootstrap, got result=${JSON.stringify(tokenPersistedSourceMismatchResult)} trace=${JSON.stringify(tokenPersistedSourceMismatchTrace)}`);
    }
    const compatPersistedSourceMismatchAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => ({
            ...input,
            persistedSource: 'token_seed',
        }),
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    }, starterSnapshotDeps);
    const previousMismatchCompatBackfillFlag = process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
    const previousMismatchCompatBackfillAlias = process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
    const previousMismatchCompatBackfillDatabaseUrl = process.env.SERVER_NEXT_DATABASE_URL;
    const previousMismatchCompatBackfillDatabaseUrlAlias = process.env.DATABASE_URL;
    process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = '1';
    delete process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
    process.env.SERVER_NEXT_DATABASE_URL = 'postgres://proof-compat-mismatch';
    delete process.env.DATABASE_URL;
    let compatPersistedSourceMismatchResult = null;
    try {
        (0, world_player_token_service_1.clearAuthTrace)();
        compatPersistedSourceMismatchResult = await compatPersistedSourceMismatchAuthService.authenticatePlayerToken('proof.token.compat_persisted_source_mismatch', {
            protocol: 'migration',
        });
    }
    finally {
        if (typeof previousMismatchCompatBackfillFlag === 'string') {
            process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = previousMismatchCompatBackfillFlag;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
        }
        if (typeof previousMismatchCompatBackfillAlias === 'string') {
            process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = previousMismatchCompatBackfillAlias;
        }
        else {
            delete process.env.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL;
        }
        if (typeof previousMismatchCompatBackfillDatabaseUrl === 'string') {
            process.env.SERVER_NEXT_DATABASE_URL = previousMismatchCompatBackfillDatabaseUrl;
        }
        else {
            delete process.env.SERVER_NEXT_DATABASE_URL;
        }
        if (typeof previousMismatchCompatBackfillDatabaseUrlAlias === 'string') {
            process.env.DATABASE_URL = previousMismatchCompatBackfillDatabaseUrlAlias;
        }
        else {
            delete process.env.DATABASE_URL;
        }
    }
    const compatPersistedSourceMismatchTrace = readLatestIdentityTrace(payload.playerId);
    if (compatPersistedSourceMismatchResult !== null
        || compatPersistedSourceMismatchTrace.entry?.source !== 'migration_persist_blocked'
        || compatPersistedSourceMismatchTrace.entry?.persistFailureStage !== 'compat_backfill_persisted_source_mismatch'
        || compatPersistedSourceMismatchTrace.entry?.persistedSource !== 'token_seed') {
        throw new Error(`expected compat persistedSource mismatch to block migration backfill before bootstrap, got result=${JSON.stringify(compatPersistedSourceMismatchResult)} trace=${JSON.stringify(compatPersistedSourceMismatchTrace)}`);
    }
/**
 * 记录token运行态payload。
 */
    const tokenRuntimePayload = {
        sub: 'proof_user_token_runtime',
        playerId: 'proof_player_token_runtime',
        playerName: 'proof token runtime',
    };
/**
 * 记录token运行态identity。
 */
    const tokenRuntimeIdentity = {
        userId: tokenRuntimePayload.sub,
        username: 'proof_token_runtime',
        displayName: 'proof token runtime',
        playerId: tokenRuntimePayload.playerId,
        playerName: tokenRuntimePayload.playerName,
    };
/**
 * 记录token运行态认证服务。
 */
    const tokenRuntimeAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => tokenRuntimePayload,
        resolvePlayerIdentityFromPayload: () => tokenRuntimeIdentity,
    }, {
        isEnabled: () => false,
        loadPlayerIdentity: async () => null,
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => null,
        loadPlayerSnapshotForMigration: async () => null,
    }, starterSnapshotDeps);
/**
 * 记录previousservernextdatabaseurl。
 */
    const previousServerNextDatabaseUrl = process.env.SERVER_NEXT_DATABASE_URL;
/**
 * 记录previousdatabaseurl。
 */
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.SERVER_NEXT_DATABASE_URL;
    delete process.env.DATABASE_URL;
/**
 * 记录token运行态default。
 */
    let tokenRuntimeDefaultIdentity = null;
    /**
     * 记录token运行态next协议identity。
     */
    let tokenRuntimeNextProtocolIdentity = null;
    /**
     * 记录token运行态migration协议identity。
     */
    let tokenRuntimeMigrationProtocolIdentity = null;
    try {
        tokenRuntimeDefaultIdentity = await tokenRuntimeAuthService.authenticatePlayerToken('proof.token.token_runtime.default');
        tokenRuntimeNextProtocolIdentity = await tokenRuntimeAuthService.authenticatePlayerToken('proof.token.token_runtime.next', {
            protocol: 'next',
        });
        tokenRuntimeMigrationProtocolIdentity = await tokenRuntimeAuthService.authenticatePlayerToken('proof.token.token_runtime.migration', {
            protocol: 'migration',
        });
    }
    finally {
        if (typeof previousServerNextDatabaseUrl === 'string') {
            process.env.SERVER_NEXT_DATABASE_URL = previousServerNextDatabaseUrl;
        }
        else {
            delete process.env.SERVER_NEXT_DATABASE_URL;
        }
        if (typeof previousDatabaseUrl === 'string') {
            process.env.DATABASE_URL = previousDatabaseUrl;
        }
        else {
            delete process.env.DATABASE_URL;
        }
    }
    if (tokenRuntimeDefaultIdentity?.authSource !== 'token_runtime') {
        throw new Error(`expected non-next protocol token auth path to allow token_runtime fallback when persistence/db are disabled, got ${JSON.stringify(tokenRuntimeDefaultIdentity)}`);
    }
    if (tokenRuntimeNextProtocolIdentity !== null) {
        throw new Error(`expected next protocol token auth path to reject token_runtime fallback by default, got ${JSON.stringify(tokenRuntimeNextProtocolIdentity)}`);
    }
    if (tokenRuntimeMigrationProtocolIdentity !== null) {
        throw new Error(`expected migration protocol token auth path to reject token_runtime fallback by default, got ${JSON.stringify(tokenRuntimeMigrationProtocolIdentity)}`);
    }
/**
 * 记录迁移source开关调用次数。
 */
    let compatMigrationIdentityCalls = 0;
    let compatMigrationSnapshotCalls = 0;
/**
 * 记录迁移source服务。
 */
    const compatMigrationSourceService = new world_player_source_service_1.WorldPlayerSourceService(null, {
        isEnabled: () => false,
        loadPlayerIdentity: async () => null,
    }, {
        isEnabled: () => false,
        loadPlayerSnapshotRecord: async () => null,
    });
    const originalCompatMigrationEnsurePool = compatMigrationSourceService.ensurePool.bind(compatMigrationSourceService);
    const originalCompatMigrationQueryIdentityRow = world_legacy_player_repository_1.queryLegacyPlayerIdentityRow;
    const originalCompatMigrationQuerySnapshotRow = world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow;
    compatMigrationSourceService.ensurePool = async () => ({});
    world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => {
        compatMigrationIdentityCalls += 1;
        return {
            userId: compatIdentity.userId,
            username: compatIdentity.username,
            displayName: compatIdentity.displayName,
            pendingRoleName: compatIdentity.playerName,
            playerId: compatIdentity.playerId,
            playerName: compatIdentity.playerName,
        };
    };
    world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = async () => {
        compatMigrationSnapshotCalls += 1;
        return {
            id: payload.playerId,
            mapId: 'yunlai_town',
            x: 1,
            y: 1,
            facing: 1,
            hp: 120,
            maxHp: 120,
            qi: 100,
            pendingLogbookMessages: [],
            inventory: [],
            temporaryBuffs: [],
            equipment: {},
            techniques: [],
            quests: [],
            bonuses: {},
            foundation: null,
            combatExp: 0,
            boneAgeBaseYears: 16,
            lifeElapsedTicks: 0,
            lifespanYears: 120,
            heavenGate: null,
            spiritualRoots: null,
            unlockedMinimapIds: [],
            autoBattle: false,
            autoBattleSkills: [],
            combatTargetId: null,
            combatTargetLocked: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: false,
            autoSwitchCultivation: false,
            cultivatingTechId: null,
        };
    };
/**
 * 记录迁移source默认identity。
 */
    const compatMigrationDefaultIdentity = await compatMigrationSourceService.resolvePlayerIdentityForMigration(payload);
/**
 * 记录迁移source默认snapshot。
 */
    const compatMigrationDefaultSnapshot = await compatMigrationSourceService.loadPlayerSnapshotForMigration(payload.playerId);
/**
 * 记录迁移source显式identity。
 */
    const compatMigrationExplicitIdentity = await compatMigrationSourceService.resolvePlayerIdentityForMigration(payload, {
        allowCompatMigration: true,
        reason: 'smoke_explicit_identity',
    });
/**
 * 记录迁移source显式snapshot。
 */
    const compatMigrationExplicitSnapshot = await compatMigrationSourceService.loadPlayerSnapshotForMigration(payload.playerId, {
        allowCompatMigration: true,
        reason: 'smoke_explicit_snapshot',
    });
    const previousDisableCompatMigrationSource = process.env.SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE;
    const previousDisableCompatMigrationSourceAlias = process.env.NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE;
    process.env.SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE = '1';
    delete process.env.NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE;
/**
 * 记录迁移source严格identity。
 */
    let compatMigrationStrictIdentity = null;
/**
 * 记录迁移source严格snapshot。
 */
    let compatMigrationStrictSnapshot = null;
    try {
        compatMigrationStrictIdentity = await compatMigrationSourceService.resolvePlayerIdentityForMigration(payload, {
            allowCompatMigration: true,
            reason: 'smoke_strict_identity',
        });
        compatMigrationStrictSnapshot = await compatMigrationSourceService.loadPlayerSnapshotForMigration(payload.playerId, {
            allowCompatMigration: true,
            reason: 'smoke_strict_snapshot',
        });
    }
    finally {
        if (typeof previousDisableCompatMigrationSource === 'string') {
            process.env.SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE = previousDisableCompatMigrationSource;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE;
        }
        if (typeof previousDisableCompatMigrationSourceAlias === 'string') {
            process.env.NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE = previousDisableCompatMigrationSourceAlias;
        }
        else {
            delete process.env.NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE;
        }
    }
    try {
        if (compatMigrationDefaultIdentity !== null
            || compatMigrationDefaultSnapshot !== null
            || compatMigrationExplicitIdentity?.playerId !== payload.playerId
            || compatMigrationExplicitSnapshot?.placement?.templateId !== 'yunlai_town'
            || compatMigrationIdentityCalls !== 1
            || compatMigrationSnapshotCalls !== 1) {
            throw new Error(`expected migration source to stay closed by default and only open for explicit migration reads, got defaultIdentity=${JSON.stringify(compatMigrationDefaultIdentity)} defaultSnapshot=${JSON.stringify(compatMigrationDefaultSnapshot)} explicitIdentity=${JSON.stringify(compatMigrationExplicitIdentity)} explicitSnapshot=${JSON.stringify(compatMigrationExplicitSnapshot)} identityCalls=${compatMigrationIdentityCalls} snapshotCalls=${compatMigrationSnapshotCalls}`);
        }
        if (compatMigrationStrictIdentity !== null
            || compatMigrationStrictSnapshot !== null
            || compatMigrationIdentityCalls !== 1
            || compatMigrationSnapshotCalls !== 1) {
            throw new Error(`expected migration source strict path to bypass even explicit migration reads, got identity=${JSON.stringify(compatMigrationStrictIdentity)} snapshot=${JSON.stringify(compatMigrationStrictSnapshot)} identityCalls=${compatMigrationIdentityCalls} snapshotCalls=${compatMigrationSnapshotCalls}`);
        }
    }
    finally {
        compatMigrationSourceService.ensurePool = originalCompatMigrationEnsurePool;
        world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = originalCompatMigrationQueryIdentityRow;
        world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = originalCompatMigrationQuerySnapshotRow;
        await compatMigrationSourceService.onModuleDestroy().catch(() => undefined);
    }
    let compatSnapshotBackfillCalls = 0;
    const compatSnapshotBackfillService = new world_player_snapshot_service_1.WorldPlayerSnapshotService({
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => null,
        savePlayerSnapshot: async (_playerId, snapshot) => ({
            snapshot,
            persistedSource: 'native',
        }),
    }, {
        buildStarterPersistenceSnapshot: () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 8,
                y: 8,
                facing: 1,
            },
        }),
    }, new world_player_source_service_1.WorldPlayerSourceService(null, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => null,
    }));
    const compatSnapshotBackfillSourceService = compatSnapshotBackfillService.worldPlayerSourceService;
    const originalCompatSnapshotBackfillEnsurePool = compatSnapshotBackfillSourceService.ensurePool.bind(compatSnapshotBackfillSourceService);
    const originalCompatSnapshotBackfillQuerySnapshotRow = world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow;
    compatSnapshotBackfillSourceService.ensurePool = async () => ({});
    world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = async () => {
        compatSnapshotBackfillCalls += 1;
        return {
            id: payload.playerId,
            mapId: 'yunlai_town',
            x: 9,
            y: 9,
            facing: 1,
            hp: 120,
            maxHp: 120,
            qi: 100,
            pendingLogbookMessages: [],
            inventory: [],
            temporaryBuffs: [],
            equipment: {},
            techniques: [],
            quests: [],
            bonuses: {},
            foundation: null,
            combatExp: 0,
            boneAgeBaseYears: 16,
            lifeElapsedTicks: 0,
            lifespanYears: 120,
            heavenGate: null,
            spiritualRoots: null,
            unlockedMinimapIds: [],
            autoBattle: false,
            autoBattleSkills: [],
            combatTargetId: null,
            combatTargetLocked: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: false,
            autoSwitchCultivation: false,
            cultivatingTechId: null,
        };
    };
    let compatSnapshotBackfillResult = null;
    try {
        compatSnapshotBackfillResult = await compatSnapshotBackfillService.ensureMigrationBackfillSnapshot(payload.playerId);
    }
    finally {
        compatSnapshotBackfillSourceService.ensurePool = originalCompatSnapshotBackfillEnsurePool;
        world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = originalCompatSnapshotBackfillQuerySnapshotRow;
        await compatSnapshotBackfillSourceService.onModuleDestroy().catch(() => undefined);
    }
    if (!compatSnapshotBackfillResult?.ok
        || compatSnapshotBackfillResult.persistedSource !== 'native'
        || compatSnapshotBackfillResult.snapshot?.placement?.x !== 9
        || compatSnapshotBackfillCalls !== 1) {
        throw new Error(`expected compat snapshot backfill to use explicit migration snapshot access and seed native snapshot, got result=${JSON.stringify(compatSnapshotBackfillResult)} compatSnapshotBackfillCalls=${compatSnapshotBackfillCalls}`);
    }
    const compatSnapshotMissingBackfillService = new world_player_snapshot_service_1.WorldPlayerSnapshotService({
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => null,
        savePlayerSnapshot: async () => {
            throw new Error('unexpected_snapshot_persist');
        },
    }, {
        buildStarterPersistenceSnapshot: () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 7,
                y: 7,
                facing: 1,
            },
        }),
    }, new world_player_source_service_1.WorldPlayerSourceService(null, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => null,
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => null,
    }));
    const compatSnapshotMissingSourceService = compatSnapshotMissingBackfillService.worldPlayerSourceService;
    const originalCompatSnapshotMissingEnsurePool = compatSnapshotMissingSourceService.ensurePool.bind(compatSnapshotMissingSourceService);
    const originalCompatSnapshotMissingQuerySnapshotRow = world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow;
    compatSnapshotMissingSourceService.ensurePool = async () => ({});
    world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = async () => null;
    let compatSnapshotMissingBackfillResult = null;
    try {
        compatSnapshotMissingBackfillResult = await compatSnapshotMissingBackfillService.ensureMigrationBackfillSnapshot(payload.playerId);
    }
    finally {
        compatSnapshotMissingSourceService.ensurePool = originalCompatSnapshotMissingEnsurePool;
        world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = originalCompatSnapshotMissingQuerySnapshotRow;
        await compatSnapshotMissingSourceService.onModuleDestroy().catch(() => undefined);
    }
    if (compatSnapshotMissingBackfillResult?.ok !== false
        || compatSnapshotMissingBackfillResult?.failureStage !== 'compat_snapshot_missing') {
        throw new Error(`expected explicit compat snapshot backfill to fail when compat snapshot is missing instead of seeding native starter, got ${JSON.stringify(compatSnapshotMissingBackfillResult)}`);
    }
    let nextProtocolLoadedLegacyBackfillSnapshotLoads = 0;
    const nextProtocolLoadedLegacyBackfillBlockedAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => ({
            version: 1,
            userId: payload.sub,
            username: compatIdentity.username,
            displayName: compatIdentity.displayName,
            playerId: payload.playerId,
            playerName: compatIdentity.playerName,
            persistedSource: 'legacy_backfill',
            updatedAt: Date.now(),
        }),
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => null,
    }, {
        loadNextPlayerSnapshotRecord: async () => {
            nextProtocolLoadedLegacyBackfillSnapshotLoads += 1;
            return null;
        },
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    });
    (0, world_player_token_service_1.clearAuthTrace)();
    const nextProtocolLoadedLegacyBackfillBlockedIdentity = await nextProtocolLoadedLegacyBackfillBlockedAuthService.authenticatePlayerToken('proof.token.next_loaded_legacy_backfill.blocked', {
        protocol: 'next',
    });
    const nextProtocolLoadedLegacyBackfillBlockedTrace = readLatestIdentityTrace(payload.playerId);
    if (nextProtocolLoadedLegacyBackfillBlockedIdentity !== null
        || nextProtocolLoadedLegacyBackfillSnapshotLoads !== 1
        || nextProtocolLoadedLegacyBackfillBlockedTrace.entry?.source !== 'next_invalid'
        || nextProtocolLoadedLegacyBackfillBlockedTrace.entry?.persistFailureStage !== 'next_protocol_legacy_backfill_requires_native_snapshot'
        || nextProtocolLoadedLegacyBackfillBlockedTrace.entry?.persistedSource !== 'legacy_backfill') {
        throw new Error(`expected next protocol loaded legacy_backfill identity without native snapshot to be rejected, got identity=${JSON.stringify(nextProtocolLoadedLegacyBackfillBlockedIdentity)} loads=${nextProtocolLoadedLegacyBackfillSnapshotLoads} trace=${JSON.stringify(nextProtocolLoadedLegacyBackfillBlockedTrace)}`);
    }
    let nextProtocolLoadedLegacyBackfillPromotionSaveCalls = 0;
    let nextProtocolLoadedLegacyBackfillPromotionSnapshotLoads = 0;
    const nextProtocolLoadedLegacyBackfillPromotedAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => ({
            version: 1,
            userId: payload.sub,
            username: compatIdentity.username,
            displayName: compatIdentity.displayName,
            playerId: payload.playerId,
            playerName: compatIdentity.playerName,
            persistedSource: 'legacy_backfill',
            updatedAt: Date.now(),
        }),
        savePlayerIdentity: async (input) => {
            nextProtocolLoadedLegacyBackfillPromotionSaveCalls += 1;
            return input;
        },
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => null,
    }, {
        loadNextPlayerSnapshotRecord: async () => {
            nextProtocolLoadedLegacyBackfillPromotionSnapshotLoads += 1;
            return {
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
            };
        },
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    });
    (0, world_player_token_service_1.clearAuthTrace)();
    const nextProtocolLoadedLegacyBackfillPromotedIdentity = await nextProtocolLoadedLegacyBackfillPromotedAuthService.authenticatePlayerToken('proof.token.next_loaded_legacy_backfill.promoted', {
        protocol: 'next',
    });
    const nextProtocolLoadedLegacyBackfillPromotedTrace = readLatestIdentityTrace(payload.playerId);
    if (!nextProtocolLoadedLegacyBackfillPromotedIdentity
        || nextProtocolLoadedLegacyBackfillPromotedIdentity.authSource !== 'next'
        || nextProtocolLoadedLegacyBackfillPromotedIdentity.persistedSource !== 'native'
        || nextProtocolLoadedLegacyBackfillPromotionSnapshotLoads !== 1
        || nextProtocolLoadedLegacyBackfillPromotionSaveCalls !== 1
        || nextProtocolLoadedLegacyBackfillPromotedTrace.entry?.source !== 'next'
        || nextProtocolLoadedLegacyBackfillPromotedTrace.entry?.persistedSource !== 'native') {
        throw new Error(`expected next protocol loaded legacy_backfill identity with native snapshot to normalize into next/native, got identity=${JSON.stringify(nextProtocolLoadedLegacyBackfillPromotedIdentity)} snapshotLoads=${nextProtocolLoadedLegacyBackfillPromotionSnapshotLoads} saveCalls=${nextProtocolLoadedLegacyBackfillPromotionSaveCalls} trace=${JSON.stringify(nextProtocolLoadedLegacyBackfillPromotedTrace)}`);
    }
    let nextProtocolLoadedLegacySeededPromotionSaveCalls = 0;
    let nextProtocolLoadedLegacySeededSnapshotLoads = 0;
    const nextProtocolLoadedLegacySeededPromotedAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => ({
            version: 1,
            userId: payload.sub,
            username: compatIdentity.username,
            displayName: compatIdentity.displayName,
            playerId: payload.playerId,
            playerName: compatIdentity.playerName,
            persistedSource: 'legacy_backfill',
            updatedAt: Date.now(),
        }),
        savePlayerIdentity: async (input) => {
            nextProtocolLoadedLegacySeededPromotionSaveCalls += 1;
            return input;
        },
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => null,
    }, {
        loadNextPlayerSnapshotRecord: async () => {
            nextProtocolLoadedLegacySeededSnapshotLoads += 1;
            return {
                snapshot: {
                    version: 1,
                    placement: {
                        templateId: 'yunlai_town',
                        x: 4,
                        y: 4,
                        facing: 1,
                    },
                },
                persistedSource: 'legacy_seeded',
            };
        },
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    });
    (0, world_player_token_service_1.clearAuthTrace)();
    const nextProtocolLoadedLegacySeededPromotedIdentity = await nextProtocolLoadedLegacySeededPromotedAuthService.authenticatePlayerToken('proof.token.next_loaded_legacy_backfill.legacy_seeded', {
        protocol: 'next',
    });
    const nextProtocolLoadedLegacySeededPromotedTrace = readLatestIdentityTrace(payload.playerId);
    if (!nextProtocolLoadedLegacySeededPromotedIdentity
        || nextProtocolLoadedLegacySeededPromotedIdentity.authSource !== 'next'
        || nextProtocolLoadedLegacySeededPromotedIdentity.persistedSource !== 'native'
        || nextProtocolLoadedLegacySeededSnapshotLoads !== 1
        || nextProtocolLoadedLegacySeededPromotionSaveCalls !== 1
        || nextProtocolLoadedLegacySeededPromotedTrace.entry?.source !== 'next'
        || nextProtocolLoadedLegacySeededPromotedTrace.entry?.persistedSource !== 'native') {
        throw new Error(`expected next protocol loaded legacy_backfill identity with legacy_seeded snapshot to normalize into next/native, got identity=${JSON.stringify(nextProtocolLoadedLegacySeededPromotedIdentity)} snapshotLoads=${nextProtocolLoadedLegacySeededSnapshotLoads} saveCalls=${nextProtocolLoadedLegacySeededPromotionSaveCalls} trace=${JSON.stringify(nextProtocolLoadedLegacySeededPromotedTrace)}`);
    }
    const nextProtocolLoadedLegacyBackfillBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, null, null, null, null, null, null, null, null, null);
    const nextProtocolLoadedLegacyBackfillGateway = new world_gateway_1.WorldGateway(null, null, nextProtocolLoadedLegacyBackfillBootstrapService, null, null, null, null, null, null, null, null, null, null, null);
    const nextProtocolLoadedLegacyBackfillClient = {
        id: 'proof_socket_next_loaded_legacy_backfill_promoted',
        handshake: {
            auth: {
                sessionId: 'next_loaded_legacy_backfill_requested_session',
            },
        },
        data: {
            isGm: false,
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'next',
            bootstrapIdentityPersistedSource: 'native',
        },
    };
    const nextProtocolLoadedLegacyBackfillImplicitResumeAllowed = nextProtocolLoadedLegacyBackfillBootstrapService.shouldAllowImplicitDetachedResume(nextProtocolLoadedLegacyBackfillClient);
    const nextProtocolLoadedLegacyBackfillRequestedResumeAllowed = nextProtocolLoadedLegacyBackfillBootstrapService.shouldAllowRequestedDetachedResume(nextProtocolLoadedLegacyBackfillClient);
    const nextProtocolLoadedLegacyBackfillConnectedReuseAllowed = nextProtocolLoadedLegacyBackfillBootstrapService.shouldAllowConnectedSessionReuse(nextProtocolLoadedLegacyBackfillClient);
    const nextProtocolLoadedLegacyBackfillBootstrapInput = nextProtocolLoadedLegacyBackfillGateway.buildAuthenticatedBootstrapInput(nextProtocolLoadedLegacyBackfillClient, nextProtocolLoadedLegacyBackfillPromotedIdentity);
    if (nextProtocolLoadedLegacyBackfillBootstrapInput.requestedSessionId !== 'next_loaded_legacy_backfill_requested_session'
        || !nextProtocolLoadedLegacyBackfillImplicitResumeAllowed
        || !nextProtocolLoadedLegacyBackfillRequestedResumeAllowed
        || !nextProtocolLoadedLegacyBackfillConnectedReuseAllowed) {
        throw new Error(`expected normalized next/native identity loaded from legacy_backfill to preserve requestedSessionId and allow reuse, got requested=${nextProtocolLoadedLegacyBackfillBootstrapInput.requestedSessionId} implicit=${nextProtocolLoadedLegacyBackfillImplicitResumeAllowed} requestedReuse=${nextProtocolLoadedLegacyBackfillRequestedResumeAllowed} connectedReuse=${nextProtocolLoadedLegacyBackfillConnectedReuseAllowed}`);
    }
    const nextProtocolLoadedMigrationBackfillClient = {
        id: 'proof_socket_next_loaded_migration_backfill',
        handshake: {
            auth: {
                sessionId: 'next_loaded_migration_backfill_requested_session',
            },
        },
        data: {
            isGm: false,
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'migration_backfill',
            bootstrapIdentityPersistedSource: 'legacy_backfill',
        },
    };
    const nextProtocolLoadedMigrationBackfillImplicitResumeAllowed = nextProtocolLoadedLegacyBackfillBootstrapService.shouldAllowImplicitDetachedResume(nextProtocolLoadedMigrationBackfillClient);
    const nextProtocolLoadedMigrationBackfillRequestedResumeAllowed = nextProtocolLoadedLegacyBackfillBootstrapService.shouldAllowRequestedDetachedResume(nextProtocolLoadedMigrationBackfillClient);
    const nextProtocolLoadedMigrationBackfillConnectedReuseAllowed = nextProtocolLoadedLegacyBackfillBootstrapService.shouldAllowConnectedSessionReuse(nextProtocolLoadedMigrationBackfillClient);
    const nextProtocolLoadedMigrationBackfillBootstrapInput = nextProtocolLoadedLegacyBackfillGateway.buildAuthenticatedBootstrapInput(nextProtocolLoadedMigrationBackfillClient, {
        playerId: 'p_next_loaded_migration_backfill',
        playerName: '迁角',
        displayName: '迁',
        authSource: 'migration_backfill',
        persistedSource: 'legacy_backfill',
    });
    if (nextProtocolLoadedMigrationBackfillBootstrapInput.requestedSessionId !== undefined
        || nextProtocolLoadedMigrationBackfillImplicitResumeAllowed
        || nextProtocolLoadedMigrationBackfillRequestedResumeAllowed
        || nextProtocolLoadedMigrationBackfillConnectedReuseAllowed) {
        throw new Error(`expected next/migration_backfill authenticated bootstrap to strip requestedSessionId and disable all reuse, got requested=${nextProtocolLoadedMigrationBackfillBootstrapInput.requestedSessionId} implicit=${nextProtocolLoadedMigrationBackfillImplicitResumeAllowed} requestedReuse=${nextProtocolLoadedMigrationBackfillRequestedResumeAllowed} connectedReuse=${nextProtocolLoadedMigrationBackfillConnectedReuseAllowed}`);
    }
/**
 * 记录next读链调用次数。
 */
    let nextSourceIdentityCalls = 0;
    let nextSourceSnapshotRecordCalls = 0;
/**
 * 记录next读链服务。
 */
    const nextSourceService = new world_player_source_service_1.WorldPlayerSourceService(null, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => {
            nextSourceIdentityCalls += 1;
            return {
                version: 1,
                userId: payload.sub,
                username: payload.username,
                displayName: payload.displayName,
                playerId: payload.playerId,
                playerName: payload.playerName,
                persistedSource: 'native',
                updatedAt: Date.now(),
            };
        },
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => {
            nextSourceSnapshotRecordCalls += 1;
            return {
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
            };
        },
    });
/**
 * 记录next读链identity。
 */
    const nextSourceIdentity = await nextSourceService.loadNextPlayerIdentity(payload.sub);
/**
 * 记录next读链snapshot记录。
 */
    const nextSourceSnapshotRecord = await nextSourceService.loadNextPlayerSnapshotRecord(payload.playerId);
/**
 * 记录next读链snapshot。
 */
    const nextSourceSnapshot = await nextSourceService.loadNextPlayerSnapshot(payload.playerId);
    if (nextSourceIdentity?.persistedSource !== 'native'
        || nextSourceSnapshotRecord?.persistedSource !== 'native'
        || nextSourceSnapshot?.placement?.templateId !== 'yunlai_town'
        || nextSourceIdentityCalls !== 1
        || nextSourceSnapshotRecordCalls !== 2) {
        throw new Error(`expected next source service to read native identity/snapshot through unified source entry, got identity=${JSON.stringify(nextSourceIdentity)} snapshotRecord=${JSON.stringify(nextSourceSnapshotRecord)} snapshot=${JSON.stringify(nextSourceSnapshot)} identityCalls=${nextSourceIdentityCalls} snapshotRecordCalls=${nextSourceSnapshotRecordCalls}`);
    }
    let guardedCompatIdentityCalls = 0;
    let guardedCompatSnapshotCalls = 0;
    let guardedNextIdentityCalls = 0;
    let guardedNextSnapshotRecordCalls = 0;
    const guardedSourceService = new world_player_source_service_1.WorldPlayerSourceService(null, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => {
            guardedNextIdentityCalls += 1;
            return {
                version: 1,
                userId: payload.sub,
                username: payload.username,
                displayName: payload.displayName,
                playerId: payload.playerId,
                playerName: payload.playerName,
                persistedSource: 'native',
                updatedAt: Date.now(),
            };
        },
    }, {
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => {
            guardedNextSnapshotRecordCalls += 1;
            return {
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
            };
        },
    });
    const originalGuardedEnsurePool = guardedSourceService.ensurePool.bind(guardedSourceService);
    const originalGuardedQueryIdentityRow = world_legacy_player_repository_1.queryLegacyPlayerIdentityRow;
    const originalGuardedQuerySnapshotRow = world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow;
    guardedSourceService.ensurePool = async () => ({});
    world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = async () => {
        guardedCompatIdentityCalls += 1;
        return {
            userId: compatIdentity.userId,
            username: compatIdentity.username,
            displayName: compatIdentity.displayName,
            pendingRoleName: compatIdentity.playerName,
            playerId: compatIdentity.playerId,
            playerName: compatIdentity.playerName,
        };
    };
    world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = async () => {
        guardedCompatSnapshotCalls += 1;
        return {
            id: payload.playerId,
            mapId: 'yunlai_town',
            x: 1,
            y: 1,
            facing: 1,
            hp: 120,
            maxHp: 120,
            qi: 100,
            pendingLogbookMessages: [],
            inventory: [],
            temporaryBuffs: [],
            equipment: {},
            techniques: [],
            quests: [],
            bonuses: {},
            foundation: null,
            combatExp: 0,
            boneAgeBaseYears: 16,
            lifeElapsedTicks: 0,
            lifespanYears: 120,
            heavenGate: null,
            spiritualRoots: null,
            unlockedMinimapIds: [],
            autoBattle: false,
            autoBattleSkills: [],
            combatTargetId: null,
            combatTargetLocked: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: false,
            autoSwitchCultivation: false,
            cultivatingTechId: null,
        };
    };
    const guardedNextIdentity = await guardedSourceService.loadNextPlayerIdentity(payload.sub);
    const guardedNextSnapshotRecord = await guardedSourceService.loadNextPlayerSnapshotRecord(payload.playerId);
    const guardedNextSnapshot = await guardedSourceService.loadNextPlayerSnapshot(payload.playerId);
    const guardedMigrationIdentity = await guardedSourceService.resolvePlayerIdentityForMigration(payload);
    const guardedMigrationSnapshot = await guardedSourceService.loadPlayerSnapshotForMigration(payload.playerId);
    const guardedExplicitMigrationResult = await withEnvOverrides({
        SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE: null,
        NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE: null,
    }, async () => {
        const explicitMigrationIdentity = await guardedSourceService.resolvePlayerIdentityForMigration(payload, {
            allowCompatMigration: true,
            reason: 'guarded_explicit_identity',
        });
        const explicitMigrationSnapshot = await guardedSourceService.loadPlayerSnapshotForMigration(payload.playerId, {
            allowCompatMigration: true,
            reason: 'guarded_explicit_snapshot',
        });
        return {
            explicitMigrationIdentity,
            explicitMigrationSnapshot,
        };
    });
    try {
        if (guardedNextIdentity?.persistedSource !== 'native'
            || guardedNextSnapshotRecord?.persistedSource !== 'native'
            || guardedNextSnapshot?.placement?.templateId !== 'yunlai_town'
            || guardedCompatIdentityCalls !== 1
            || guardedCompatSnapshotCalls !== 1
            || guardedNextIdentityCalls !== 1
            || guardedNextSnapshotRecordCalls !== 2
            || guardedMigrationIdentity !== null
            || guardedMigrationSnapshot !== null
            || guardedExplicitMigrationResult.explicitMigrationIdentity?.playerId !== payload.playerId
            || guardedExplicitMigrationResult.explicitMigrationSnapshot?.placement?.templateId !== 'yunlai_town') {
            throw new Error(`expected next source service to bypass implicit compat migration reads while still exposing explicit migration entry, got nextIdentity=${JSON.stringify(guardedNextIdentity)} nextSnapshotRecord=${JSON.stringify(guardedNextSnapshotRecord)} nextSnapshot=${JSON.stringify(guardedNextSnapshot)} migrationIdentity=${JSON.stringify(guardedMigrationIdentity)} migrationSnapshot=${JSON.stringify(guardedMigrationSnapshot)} explicitMigrationIdentity=${JSON.stringify(guardedExplicitMigrationResult.explicitMigrationIdentity)} explicitMigrationSnapshot=${JSON.stringify(guardedExplicitMigrationResult.explicitMigrationSnapshot)} nextIdentityCalls=${guardedNextIdentityCalls} nextSnapshotRecordCalls=${guardedNextSnapshotRecordCalls} compatIdentityCalls=${guardedCompatIdentityCalls} compatSnapshotCalls=${guardedCompatSnapshotCalls}`);
        }
    }
    finally {
        guardedSourceService.ensurePool = originalGuardedEnsurePool;
        world_legacy_player_repository_1.queryLegacyPlayerIdentityRow = originalGuardedQueryIdentityRow;
        world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow = originalGuardedQuerySnapshotRow;
        await guardedSourceService.onModuleDestroy().catch(() => undefined);
    }
    const invalidNextIdentityAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => ({
            version: 1,
            userId: payload.sub,
            username: payload.username,
            displayName: payload.displayName,
            playerId: payload.playerId,
            playerName: payload.playerName,
            updatedAt: Date.now(),
        }),
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    }, starterSnapshotDeps);
    (0, world_player_token_service_1.clearAuthTrace)();
    const invalidNextIdentityResult = await invalidNextIdentityAuthService.authenticatePlayerToken('proof.token.invalid_next_identity_persisted_source');
    const invalidNextIdentityTrace = readLatestIdentityTrace(payload.playerId);
    if (invalidNextIdentityResult !== null
        || invalidNextIdentityTrace.entry?.source !== 'next_invalid'
        || invalidNextIdentityTrace.entry?.persistFailureStage !== 'next_identity_persisted_source_missing'
        || invalidNextIdentityTrace.entry?.nextLoadHit !== true) {
        throw new Error(`expected next identity without persistedSource to be rejected before bootstrap, got result=${JSON.stringify(invalidNextIdentityResult)} trace=${JSON.stringify(invalidNextIdentityTrace)}`);
    }
    const invalidNextPersistedSourceAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken: () => payload,
        resolvePlayerIdentityFromPayload: () => compatIdentity,
    }, {
        isEnabled: () => true,
        loadPlayerIdentity: async () => ({
            version: 1,
            userId: payload.sub,
            username: payload.username,
            displayName: payload.displayName,
            playerId: payload.playerId,
            playerName: payload.playerName,
            persistedSource: 'invalid_meta_source',
            updatedAt: Date.now(),
        }),
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => compatIdentity,
        loadPlayerSnapshotForMigration: async () => ({
            version: 1,
            placement: {
                templateId: 'yunlai_town',
                x: 1,
                y: 1,
                facing: 1,
            },
        }),
    }, starterSnapshotDeps);
    (0, world_player_token_service_1.clearAuthTrace)();
    const invalidNextPersistedSourceResult = await invalidNextPersistedSourceAuthService.authenticatePlayerToken('proof.token.invalid_next_identity_unknown_persisted_source');
    const invalidNextPersistedSourceTrace = readLatestIdentityTrace(payload.playerId);
    if (invalidNextPersistedSourceResult !== null
        || invalidNextPersistedSourceTrace.entry?.source !== 'next_invalid'
        || invalidNextPersistedSourceTrace.entry?.persistFailureStage !== 'next_identity_persisted_source_invalid'
        || invalidNextPersistedSourceTrace.entry?.persistedSource !== 'invalid_meta_source'
        || invalidNextPersistedSourceTrace.entry?.nextLoadHit !== true) {
        throw new Error(`expected next identity with invalid persistedSource to be rejected before bootstrap, got result=${JSON.stringify(invalidNextPersistedSourceResult)} trace=${JSON.stringify(invalidNextPersistedSourceTrace)}`);
    }
    const legacyRuntimeIdentity = {
        ...compatIdentity,
        authSource: 'legacy_runtime',
        nextLoadHit: false,
    };
/**
 * 记录持久化enabledcalls。
 */
    const persistenceEnabledCalls = [];
    const readLatestPersistenceEnabledCall = () => persistenceEnabledCalls[persistenceEnabledCalls.length - 1] ?? null;
/**
 * 记录持久化enabledbootstrap服务。
 */
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
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    }, null, null, null, null, null, null, null, null);
/**
 * 记录blockederror。
 */
    let blockedError = null;
    try {
        await persistenceEnabledBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity);
    }
    catch (error) {
        blockedError = error;
    }
    if (!(blockedError instanceof Error)
        || readLatestPersistenceEnabledCall()?.allowLegacyFallback !== false
        || readLatestPersistenceEnabledCall()?.fallbackReason !== 'persistence_enabled_blocked:legacy_runtime') {
        throw new Error(`expected persistence-enabled legacy_runtime identity to block compat snapshot fallback, got error=${blockedError instanceof Error ? blockedError.message : String(blockedError)} call=${JSON.stringify(readLatestPersistenceEnabledCall())}`);
    }
    let legacySyncError = null;
    const legacySyncIdentity = {
        ...legacyRuntimeIdentity,
        authSource: 'next',
        persistedSource: 'legacy_sync',
    };
    try {
        await persistenceEnabledBootstrapService.loadAuthenticatedPlayerSnapshot(legacySyncIdentity);
    }
    catch (error) {
        legacySyncError = error;
    }
    if (!(legacySyncError instanceof Error)
        || readLatestPersistenceEnabledCall()?.allowLegacyFallback !== false
        || readLatestPersistenceEnabledCall()?.fallbackReason !== 'persistence_enabled_blocked:next') {
        throw new Error(`expected persistence-enabled legacy_sync identity to block compat snapshot fallback, got error=${legacySyncError instanceof Error ? legacySyncError.message : String(legacySyncError)} call=${JSON.stringify(readLatestPersistenceEnabledCall())}`);
    }
/**
 * 记录no持久化calls。
 */
    const noPersistenceCalls = [];
/**
 * 记录no持久化bootstrap服务。
 */
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
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    }, null, null, null, null, null, null, null, null);
/**
 * 记录no持久化snapshot。
 */
    const noPersistenceSnapshot = await noPersistenceBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity);
    if (noPersistenceSnapshot !== null
        || noPersistenceCalls[0]?.allowLegacyFallback !== false
        || noPersistenceCalls[0]?.fallbackReason !== 'runtime_compat_snapshot_disabled:legacy_runtime') {
        throw new Error(`expected non-persistence legacy_runtime identity to block compat snapshot fallback by default, got snapshot=${JSON.stringify(noPersistenceSnapshot ?? null)} call=${JSON.stringify(noPersistenceCalls[0] ?? null)}`);
    }
/**
 * 记录migration开关calls。
 */
    const runtimeMigrationCalls = [];
/**
 * 记录migration开关bootstrap服务。
 */
    const runtimeMigrationBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
        isPersistenceEnabled: () => false,
        loadPlayerSnapshot: async (playerId, allowLegacyFallback, fallbackReason) => {
            runtimeMigrationCalls.push({
                playerId,
                allowLegacyFallback,
                fallbackReason,
            });
            return null;
        },
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    }, null, null, null, null, null, null, null, null);
/**
 * 记录migration快照。
 */
    const runtimeMigrationSnapshot = await runtimeMigrationBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity);
    if (runtimeMigrationSnapshot !== null
        || runtimeMigrationCalls[0]?.allowLegacyFallback !== false
        || runtimeMigrationCalls[0]?.fallbackReason !== 'runtime_compat_snapshot_disabled:legacy_runtime') {
        throw new Error(`expected runtime migration switch path to stay blocked after runtime fallback removal, got snapshot=${JSON.stringify(runtimeMigrationSnapshot ?? null)} call=${JSON.stringify(runtimeMigrationCalls[0] ?? null)}`);
    }
/**
 * 记录next协议calls。
 */
    const noPersistenceNextProtocolCalls = [];
/**
 * 记录next协议bootstrap服务。
 */
    const noPersistenceNextProtocolBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
        isPersistenceEnabled: () => false,
        loadPlayerSnapshot: async (playerId, allowLegacyFallback, fallbackReason) => {
            noPersistenceNextProtocolCalls.push({
                playerId,
                allowLegacyFallback,
                fallbackReason,
            });
            return null;
        },
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_recovery',
        }),
    }, null, null, null, null, null, null, null, null);
/**
 * 记录next协议snapshot。
 */
    const noPersistenceNextProtocolSnapshot = await noPersistenceNextProtocolBootstrapService.loadAuthenticatedPlayerSnapshot(legacyRuntimeIdentity, {
        data: {
            protocol: 'next',
        },
    });
    if (noPersistenceNextProtocolSnapshot !== null
        || noPersistenceNextProtocolCalls[0]?.allowLegacyFallback !== false
        || noPersistenceNextProtocolCalls[0]?.fallbackReason !== 'next_protocol_blocked:legacy_runtime') {
        throw new Error(`expected next-protocol legacy_runtime identity to block compat snapshot fallback, got snapshot=${JSON.stringify(noPersistenceNextProtocolSnapshot ?? null)} call=${JSON.stringify(noPersistenceNextProtocolCalls[0] ?? null)}`);
    }
/**
 * 记录stricterror。
 */
    let strictError = null;
/**
 * 记录previousstrictnativesnapshot。
 */
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
        || readLatestPersistenceEnabledCall()?.allowLegacyFallback !== false
        || readLatestPersistenceEnabledCall()?.fallbackReason !== 'strict_native_snapshot_required') {
        throw new Error(`expected strict native snapshot mode to disable downgraded legacy_runtime fallback, got error=${strictError instanceof Error ? strictError.message : String(strictError)} call=${JSON.stringify(readLatestPersistenceEnabledCall())}`);
    }
    return {
        persistenceEnabledAuthAccepted: blockedIdentity !== null,
        noPersistenceAuthAccepted: noPersistenceIdentity !== null,
        noPersistenceIdentitySource: noPersistenceIdentity?.authSource ?? null,
        nextProtocolIdentitySource: nextProtocolIdentity?.authSource ?? null,
        tokenRuntimeDefaultIdentitySource: tokenRuntimeDefaultIdentity?.authSource ?? null,
        tokenRuntimeNextProtocolIdentitySource: tokenRuntimeNextProtocolIdentity?.authSource ?? null,
        tokenRuntimeNextProtocolIdentityRejected: tokenRuntimeNextProtocolIdentity === null,
        compatMigrationSourceDefaultIdentityEnabled: compatMigrationDefaultIdentity !== null,
        compatMigrationSourceDefaultSnapshotEnabled: compatMigrationDefaultSnapshot !== null,
        compatMigrationSourceExplicitIdentityEnabled: compatMigrationExplicitIdentity !== null,
        compatMigrationSourceExplicitSnapshotEnabled: compatMigrationExplicitSnapshot !== null,
        compatMigrationSourceStrictIdentityEnabled: compatMigrationStrictIdentity !== null,
        compatMigrationSourceStrictSnapshotEnabled: compatMigrationStrictSnapshot !== null,
        compatMigrationSourceIdentityCalls: compatMigrationIdentityCalls,
        compatMigrationSourceSnapshotCalls: compatMigrationSnapshotCalls,
        compatSnapshotBackfillUsedExplicitMigrationSource: compatSnapshotBackfillResult?.ok === true,
        compatSnapshotMissingBackfillFailureStage: compatSnapshotMissingBackfillResult?.failureStage ?? null,
        nextProtocolLoadedLegacyBackfillBlocked: nextProtocolLoadedLegacyBackfillBlockedIdentity === null,
        nextProtocolLoadedLegacyBackfillBlockedFailureStage: nextProtocolLoadedLegacyBackfillBlockedTrace.entry?.persistFailureStage ?? null,
        nextProtocolLoadedLegacyBackfillNormalizedSource: nextProtocolLoadedLegacyBackfillPromotedIdentity?.authSource ?? null,
        nextProtocolLoadedLegacyBackfillNormalizedPersistedSource: nextProtocolLoadedLegacyBackfillPromotedIdentity?.persistedSource ?? null,
        nextProtocolLoadedLegacySeededNormalizedSource: nextProtocolLoadedLegacySeededPromotedIdentity?.authSource ?? null,
        nextProtocolLoadedLegacySeededNormalizedPersistedSource: nextProtocolLoadedLegacySeededPromotedIdentity?.persistedSource ?? null,
        nextProtocolLoadedLegacyBackfillNormalizedRequestedSessionId: nextProtocolLoadedLegacyBackfillBootstrapInput.requestedSessionId ?? null,
        nextProtocolLoadedLegacyBackfillNormalizedImplicitResume: nextProtocolLoadedLegacyBackfillImplicitResumeAllowed,
        nextProtocolLoadedLegacyBackfillNormalizedRequestedResume: nextProtocolLoadedLegacyBackfillRequestedResumeAllowed,
        nextProtocolLoadedLegacyBackfillNormalizedConnectedReuse: nextProtocolLoadedLegacyBackfillConnectedReuseAllowed,
        nextProtocolLoadedMigrationBackfillRequestedSessionId: nextProtocolLoadedMigrationBackfillBootstrapInput.requestedSessionId ?? null,
        nextProtocolLoadedMigrationBackfillImplicitResume: nextProtocolLoadedMigrationBackfillImplicitResumeAllowed,
        nextProtocolLoadedMigrationBackfillRequestedResume: nextProtocolLoadedMigrationBackfillRequestedResumeAllowed,
        nextProtocolLoadedMigrationBackfillConnectedReuse: nextProtocolLoadedMigrationBackfillConnectedReuseAllowed,
        nextSourceIdentityPersistedSource: nextSourceIdentity?.persistedSource ?? null,
        nextSourceSnapshotPersistedSource: nextSourceSnapshotRecord?.persistedSource ?? null,
        nextSourceSnapshotTemplateId: nextSourceSnapshot?.placement?.templateId ?? null,
        nextSourceIdentityCalls,
        nextSourceSnapshotRecordCalls,
        nextSourceCompatIdentityCalls: guardedCompatIdentityCalls,
        nextSourceCompatSnapshotCalls: guardedCompatSnapshotCalls,
        nextSourceGuardedMigrationIdentityUserId: guardedMigrationIdentity?.userId ?? null,
        nextSourceGuardedMigrationSnapshotTemplateId: guardedMigrationSnapshot?.placement?.templateId ?? null,
        invalidNextIdentityFailureStage: invalidNextIdentityTrace.entry?.persistFailureStage ?? null,
        invalidNextPersistedSourceFailureStage: invalidNextPersistedSourceTrace.entry?.persistFailureStage ?? null,
        compatBackfillLegacyProtocolSource: compatBackfillLegacyProtocolDefault?.authSource ?? null,
        compatBackfillMigrationProtocolSource: compatBackfillMigrationProtocol?.authSource ?? null,
        tokenPersistedSourceMismatchFailureStage: tokenPersistedSourceMismatchTrace.entry?.persistFailureStage ?? null,
        compatPersistedSourceMismatchFailureStage: compatPersistedSourceMismatchTrace.entry?.persistFailureStage ?? null,
        noPersistenceCompatIdentityCalls,
        preseedFailure: 'forced_preseed_next_load_failure',
        persistenceEnabledAllowLegacyFallback: persistenceEnabledCalls[0]?.allowLegacyFallback ?? null,
        persistenceEnabledFallbackReason: persistenceEnabledCalls[0]?.fallbackReason ?? null,
        persistenceEnabledLegacySyncAllowLegacyFallback: persistenceEnabledCalls[1]?.allowLegacyFallback ?? null,
        persistenceEnabledLegacySyncFallbackReason: persistenceEnabledCalls[1]?.fallbackReason ?? null,
        noPersistenceAllowLegacyFallback: noPersistenceCalls[0]?.allowLegacyFallback ?? null,
        noPersistenceFallbackReason: noPersistenceCalls[0]?.fallbackReason ?? null,
        noPersistenceRuntimeGuardAllowLegacyFallback: runtimeMigrationCalls[0]?.allowLegacyFallback ?? null,
        noPersistenceRuntimeGuardFallbackReason: runtimeMigrationCalls[0]?.fallbackReason ?? null,
        noPersistenceRuntimeGuardPlacement: runtimeMigrationSnapshot?.placement ?? null,
        noPersistenceMigrationAllowLegacyFallback: runtimeMigrationCalls[0]?.allowLegacyFallback ?? null,
        noPersistenceMigrationFallbackReason: runtimeMigrationCalls[0]?.fallbackReason ?? null,
        noPersistenceNextProtocolAllowLegacyFallback: noPersistenceNextProtocolCalls[0]?.allowLegacyFallback ?? null,
        noPersistenceNextProtocolFallbackReason: noPersistenceNextProtocolCalls[0]?.fallbackReason ?? null,
        strictAllowLegacyFallback: persistenceEnabledCalls[2]?.allowLegacyFallback ?? null,
        strictFallbackReason: persistenceEnabledCalls[2]?.fallbackReason ?? null,
        noPersistencePlacement: noPersistenceSnapshot?.placement ?? null,
        noPersistenceMigrationPlacement: runtimeMigrationSnapshot?.placement ?? null,
        blockedError: blockedError.message,
        legacySyncError: legacySyncError instanceof Error ? legacySyncError.message : String(legacySyncError),
        noPersistenceNextProtocolSnapshot: noPersistenceNextProtocolSnapshot,
        strictError: strictError.message,
    };
}
/**
 * 验证 snapshot compat runtime fallback 已彻底关闭。
 */
async function verifyCompatRuntimeSnapshotGuardContract() {
    let compatSnapshotCalls = 0;
    const snapshotService = new world_player_snapshot_service_1.WorldPlayerSnapshotService({
        isEnabled: () => false,
        loadPlayerSnapshotRecord: async () => null,
        savePlayerSnapshot: async () => {
            throw new Error('unexpected_snapshot_persist');
        },
    }, {
        buildStarterPersistenceSnapshot: () => null,
    }, {
        loadPlayerSnapshotForMigration: async () => {
            compatSnapshotCalls += 1;
            return {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 3,
                    y: 3,
                    facing: 1,
                },
            };
        },
    });
    const blockedResult = await snapshotService.loadPlayerSnapshotResult('proof_player_snapshot_guard', true, 'identity_source:next');
    if (blockedResult?.snapshot !== null || compatSnapshotCalls !== 0) {
        throw new Error(`expected non-legacy snapshot fallback reason to block compat runtime read, got result=${JSON.stringify(blockedResult ?? null)} compatSnapshotCalls=${compatSnapshotCalls}`);
    }
    const blockedLegacyReasonResult = await snapshotService.loadPlayerSnapshotResult('proof_player_snapshot_guard', true, 'identity_source:legacy_runtime');
    if (blockedLegacyReasonResult?.snapshot !== null || compatSnapshotCalls !== 0) {
        throw new Error(`expected legacy_runtime identity reason to stay blocked without migration marker, got result=${JSON.stringify(blockedLegacyReasonResult ?? null)} compatSnapshotCalls=${compatSnapshotCalls}`);
    }
    const blockedMigrationReasonResult = await snapshotService.loadPlayerSnapshotResult('proof_player_snapshot_guard', true, 'migration_runtime:legacy_snapshot');
    if (blockedMigrationReasonResult?.snapshot !== null || compatSnapshotCalls !== 0) {
        throw new Error(`expected migration_runtime marker to stay blocked after runtime fallback removal, got result=${JSON.stringify(blockedMigrationReasonResult ?? null)} compatSnapshotCalls=${compatSnapshotCalls}`);
    }
    let migrationNextSnapshotRecordCalls = 0;
    let migrationCompatSnapshotCalls = 0;
    const migrationSnapshotService = new world_player_snapshot_service_1.WorldPlayerSnapshotService({
        isEnabled: () => true,
        loadPlayerSnapshotRecord: async () => {
            migrationNextSnapshotRecordCalls += 1;
            return {
                snapshot: {
                    version: 1,
                    placement: {
                        templateId: 'yunlai_town',
                        x: 2,
                        y: 2,
                        facing: 1,
                    },
                },
                persistedSource: 'native',
            };
        },
        savePlayerSnapshot: async () => {
            throw new Error('unexpected_snapshot_persist');
        },
    }, {
        buildStarterPersistenceSnapshot: () => null,
    }, {
        loadPlayerSnapshotForMigration: async () => {
            migrationCompatSnapshotCalls += 1;
            return {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 5,
                    y: 5,
                    facing: 1,
                },
            };
        },
    });
    const migrationNextSnapshotRecord = await migrationSnapshotService.loadNextPlayerSnapshotRecord('proof_player_snapshot_guard');
    const migrationCompatSnapshot = await migrationSnapshotService.loadMigrationPlayerSnapshot('proof_player_snapshot_guard');
    if (migrationNextSnapshotRecord?.persistedSource !== 'native'
        || migrationNextSnapshotRecordCalls !== 1
        || migrationCompatSnapshotCalls !== 1
        || migrationCompatSnapshot?.placement?.templateId !== 'yunlai_town') {
        throw new Error(`expected migration snapshot source to keep next entry and explicit compat migration entry available, got nextRecord=${JSON.stringify(migrationNextSnapshotRecord)} compatSnapshot=${JSON.stringify(migrationCompatSnapshot)} nextRecordCalls=${migrationNextSnapshotRecordCalls} compatSnapshotCalls=${migrationCompatSnapshotCalls}`);
    }
    return {
        blockedReason: 'identity_source:next',
        blockedSnapshotSource: blockedResult?.source ?? null,
        blockedLegacyIdentityReason: 'identity_source:legacy_runtime',
        blockedLegacySnapshotSource: blockedLegacyReasonResult?.source ?? null,
        blockedMigrationReason: 'migration_runtime:legacy_snapshot',
        blockedMigrationSnapshotSource: blockedMigrationReasonResult?.source ?? null,
        compatSnapshotCalls,
        migrationNextSnapshotRecordCalls,
        migrationCompatSnapshotCalls,
    };
}
/**
 * 验证 authenticated next identity 缺失 snapshot 时的恢复策略默认关闭，且只对显式允许的 identity persistedSource 生效。
 */
async function verifyAuthenticatedMissingSnapshotRecoveryContract() {
/**
 * 记录默认calls。
 */
    const defaultCalls = [];
/**
 * 记录默认恢复calls。
 */
    let defaultRecoveryCalls = 0;
/**
 * 记录默认bootstrap服务。
 */
    const defaultBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
        isPersistenceEnabled: () => true,
        loadPlayerSnapshot: async (playerId, allowLegacyFallback, fallbackReason) => {
            defaultCalls.push({
                playerId,
                allowLegacyFallback,
                fallbackReason,
            });
            return null;
        },
        ensureNativeStarterSnapshot: async () => {
            defaultRecoveryCalls += 1;
            return {
                ok: true,
                snapshot: {
                    version: 1,
                    placement: {
                        templateId: 'yunlai_town',
                        x: 32,
                        y: 5,
                        facing: 1,
                    },
                },
                persistedSource: 'native',
            };
        },
    }, null, null, null, null, null, null, null, null);
/**
 * 记录默认error。
 */
    let defaultError = null;
    try {
        await defaultBootstrapService.loadAuthenticatedPlayerSnapshot({
            userId: 'proof_user_missing_snapshot_default',
            playerId: 'proof_player_missing_snapshot_default',
            authSource: 'next',
            persistedSource: 'token_seed',
        });
    }
    catch (error) {
        defaultError = error;
    }
    if (!(defaultError instanceof Error)
        || defaultRecoveryCalls !== 0
        || defaultCalls[0]?.allowLegacyFallback !== false
        || defaultCalls[0]?.fallbackReason !== 'persistence_enabled_blocked:next'
        || !defaultError.message.includes('recoveryReason=native_snapshot_recovery_disabled')) {
        throw new Error(`expected authenticated missing snapshot recovery to stay disabled by default, got error=${defaultError instanceof Error ? defaultError.message : String(defaultError)} recoveryCalls=${defaultRecoveryCalls} call=${JSON.stringify(defaultCalls[0] ?? null)}`);
    }
/**
 * 记录恢复calls。
 */
    const recoveryCalls = [];
/**
 * 记录恢复seedcalls。
 */
    let recoverySeedCalls = 0;
/**
 * 记录恢复bootstrap服务。
 */
    const recoveryBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
        isPersistenceEnabled: () => true,
        loadPlayerSnapshot: async (playerId, allowLegacyFallback, fallbackReason) => {
            recoveryCalls.push({
                playerId,
                allowLegacyFallback,
                fallbackReason,
            });
            return null;
        },
        ensureNativeStarterSnapshot: async (playerId) => {
            recoverySeedCalls += 1;
            return {
                ok: true,
                snapshot: {
                    version: 1,
                    placement: {
                        templateId: 'yunlai_town',
                        x: 32,
                        y: 5,
                        facing: 1,
                    },
                    inventory: {
                        items: [{
                                itemId: `starter_recovery_${playerId}`,
                                count: 1,
                            }],
                    },
                },
                persistedSource: 'native',
            };
        },
    }, null, null, null, null, null, null, null, null);
/**
 * 记录previousrecoveryenv。
 */
    const previousRecoveryEnv = process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
    process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = '1';
    let unknownSourceRejectedError = null;
    let nextMissingPersistedSourceError = null;
    let tokenLegacyBackfillRejectedError = null;
    try {
/** 
 * 记录tokenseedsnapshot。
 */
        const tokenSeedSnapshot = await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
            userId: 'proof_user_missing_snapshot_token_seed',
            playerId: 'proof_player_missing_snapshot_token_seed',
            authSource: 'next',
            persistedSource: 'token_seed',
        });
        if (!tokenSeedSnapshot || tokenSeedSnapshot.placement?.templateId !== 'yunlai_town') {
            throw new Error(`expected authenticated missing snapshot token_seed recovery to return starter snapshot, got ${JSON.stringify(tokenSeedSnapshot ?? null)}`);
        }
/**
 * 记录tokenseedtokensnapshot。
 */
        const tokenSeedTokenSnapshot = await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
            userId: 'proof_user_missing_snapshot_token_seed_token',
            playerId: 'proof_player_missing_snapshot_token_seed_token',
            authSource: 'token',
            persistedSource: 'token_seed',
        });
        if (!tokenSeedTokenSnapshot || tokenSeedTokenSnapshot.placement?.templateId !== 'yunlai_town') {
            throw new Error(`expected authenticated missing snapshot token-source token_seed recovery to return starter snapshot, got ${JSON.stringify(tokenSeedTokenSnapshot ?? null)}`);
        }
        try {
            await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_missing_snapshot_unknown_source',
                playerId: 'proof_player_missing_snapshot_unknown_source',
                authSource: 'unknown',
                persistedSource: 'token_seed',
            });
        }
        catch (error) {
            unknownSourceRejectedError = error;
        }
        if (!(unknownSourceRejectedError instanceof Error)
            || !unknownSourceRejectedError.message.includes('recoveryReason=auth_source:unknown')) {
            throw new Error(`expected authenticated missing snapshot unknown authSource to be rejected, got ${unknownSourceRejectedError instanceof Error ? unknownSourceRejectedError.message : String(unknownSourceRejectedError)}`);
        }
        try {
            await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_missing_snapshot_next_missing_persisted',
                playerId: 'proof_player_missing_snapshot_next_missing_persisted',
                authSource: 'next',
            });
        }
        catch (error) {
            nextMissingPersistedSourceError = error;
        }
        if (!(nextMissingPersistedSourceError instanceof Error)
            || !nextMissingPersistedSourceError.message.includes('recoveryReason=persisted_source:unknown')) {
            throw new Error(`expected authenticated missing snapshot next identity without persistedSource to be rejected, got ${nextMissingPersistedSourceError instanceof Error ? nextMissingPersistedSourceError.message : String(nextMissingPersistedSourceError)}`);
        }
        try {
            await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_missing_snapshot_token_legacy_backfill',
                playerId: 'proof_player_missing_snapshot_token_legacy_backfill',
                authSource: 'token',
                persistedSource: 'legacy_backfill',
            });
        }
        catch (error) {
            tokenLegacyBackfillRejectedError = error;
        }
        if (!(tokenLegacyBackfillRejectedError instanceof Error)
            || !tokenLegacyBackfillRejectedError.message.includes('recoveryReason=persisted_source:legacy_backfill')) {
            throw new Error(`expected authenticated missing snapshot token identity with non-token_seed persistedSource to be rejected, got ${tokenLegacyBackfillRejectedError instanceof Error ? tokenLegacyBackfillRejectedError.message : String(tokenLegacyBackfillRejectedError)}`);
        }
        let legacyBackfillRejectedError = null;
        try {
            await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_missing_snapshot_legacy_backfill',
                playerId: 'proof_player_missing_snapshot_legacy_backfill',
                authSource: 'next',
                persistedSource: 'legacy_backfill',
            });
        }
        catch (error) {
            legacyBackfillRejectedError = error;
        }
        if (!(legacyBackfillRejectedError instanceof Error)
            || !legacyBackfillRejectedError.message.includes('recoveryReason=persisted_source:legacy_backfill')) {
            throw new Error(`expected authenticated missing snapshot legacy_backfill recovery to be rejected, got ${legacyBackfillRejectedError instanceof Error ? legacyBackfillRejectedError.message : String(legacyBackfillRejectedError)}`);
        }
    }
    finally {
        if (typeof previousRecoveryEnv === 'string') {
            process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = previousRecoveryEnv;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
        }
    }
    const expectedRecoveryCalls = [
        ['proof_player_missing_snapshot_token_seed', 'persistence_enabled_blocked:next'],
        ['proof_player_missing_snapshot_token_seed_token', 'persistence_enabled_blocked:token'],
        ['proof_player_missing_snapshot_unknown_source', 'persistence_enabled_blocked:unknown'],
        ['proof_player_missing_snapshot_next_missing_persisted', 'persistence_enabled_blocked:next'],
        ['proof_player_missing_snapshot_token_legacy_backfill', 'persistence_enabled_blocked:token'],
        ['proof_player_missing_snapshot_legacy_backfill', 'persistence_enabled_blocked:next'],
    ];
    const missingRecoveryProof = expectedRecoveryCalls.find(([playerId, fallbackReason]) => !recoveryCalls.some((call) => call?.playerId === playerId && call?.fallbackReason === fallbackReason));
    if (recoverySeedCalls !== 2 || missingRecoveryProof) {
        throw new Error(`expected authenticated missing snapshot recovery to seed only token_seed and reject unsupported identities, got recoverySeedCalls=${recoverySeedCalls} missing=${JSON.stringify(missingRecoveryProof ?? null)} calls=${JSON.stringify(recoveryCalls)}`);
    }
/**
 * 记录nativerejectederror。
 */
    let nativeRejectedError = null;
    const previousRejectedEnv = process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
    process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = '1';
    try {
        await recoveryBootstrapService.loadAuthenticatedPlayerSnapshot({
            userId: 'proof_user_missing_snapshot_native',
            playerId: 'proof_player_missing_snapshot_native',
            authSource: 'next',
            persistedSource: 'native',
        });
    }
    catch (error) {
        nativeRejectedError = error;
    }
    finally {
        if (typeof previousRejectedEnv === 'string') {
            process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = previousRejectedEnv;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
        }
    }
    if (!(nativeRejectedError instanceof Error)
        || !nativeRejectedError.message.includes('recoveryReason=persisted_source:native')
        || recoverySeedCalls !== 2) {
        throw new Error(`expected authenticated missing snapshot recovery to reject unsupported next persistedSource, got error=${nativeRejectedError instanceof Error ? nativeRejectedError.message : String(nativeRejectedError)} recoverySeedCalls=${recoverySeedCalls}`);
    }
    return {
        defaultRecoveryDisabled: true,
        defaultFallbackReason: defaultCalls[0]?.fallbackReason ?? null,
        tokenSeedRecoveryEnabled: true,
        legacyBackfillRecoveryEnabled: false,
        recoverySeedCalls,
        unknownSourceRejectedRecoveryReason: typeof unknownSourceRejectedError?.message === 'string' ? unknownSourceRejectedError.message : null,
        nextMissingPersistedSourceRecoveryReason: typeof nextMissingPersistedSourceError?.message === 'string' ? nextMissingPersistedSourceError.message : null,
        tokenLegacyBackfillRecoveryReason: typeof tokenLegacyBackfillRejectedError?.message === 'string' ? tokenLegacyBackfillRejectedError.message : null,
        nativeRejectedRecoveryAttempted: false,
        rejectedPersistedSource: 'native',
    };
}
/**
 * 验证 authenticated snapshot recovery 在 bootstrap 期间会落入待确认日志并进入首包发送链。
 */
async function verifyAuthenticatedSnapshotRecoveryNoticeContract() {
/**
 * 记录已排队消息。
 */
    const queuedByPlayerId = new Map();
/**
 * 记录已发出 notice 事件。
 */
    const emittedEventsByPlayerId = new Map();
/**
 * 记录玩家运行时服务。
 */
    const playerRuntimeService = {
        loadOrCreatePlayer: async () => ({
            templateId: 'yunlai_town',
            x: 32,
            y: 5,
        }),
        setIdentity: () => undefined,
        queuePendingLogbookMessage: (playerId, message) => {
            const entries = queuedByPlayerId.get(playerId) ?? [];
            const existingIndex = entries.findIndex((entry) => entry.id === message.id);
            const normalizedMessage = {
                id: message.id,
                kind: message.kind,
                text: message.text,
                from: message.from,
                at: message.at,
            };
            if (existingIndex >= 0) {
                entries[existingIndex] = normalizedMessage;
            }
            else {
                entries.push(normalizedMessage);
            }
            queuedByPlayerId.set(playerId, entries);
        },
        getPendingLogbookMessages: (playerId) => (queuedByPlayerId.get(playerId) ?? []).map((entry) => ({ ...entry })),
    };
/**
 * 记录客户端事件服务。
 */
    const clientEventService = new world_client_event_service_1.WorldClientEventService(null, null, playerRuntimeService, null, null, null);
/**
 * 记录bootstrap服务。
 */
    const bootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, null, null, playerRuntimeService, {
        ensurePlayerMailbox: async () => undefined,
        ensureWelcomeMail: async () => undefined,
    }, {
        getAll: () => [],
    }, {
        removePlayer: () => undefined,
        connectPlayer: () => undefined,
    }, {
        getBinding: () => null,
        registerSocket: (client, playerId, requestedSessionId) => ({
            playerId,
            sessionId: requestedSessionId?.trim() || `${playerId}:notice`,
            socketId: client.id,
            resumed: false,
            connected: true,
            detachedAt: null,
            expireAt: null,
        }),
    }, {
        emitInitialSync: () => undefined,
    }, {
        emitSuggestionUpdate: () => undefined,
        emitMailSummaryForPlayer: async () => undefined,
        emitPendingLogbookNotice: (client, entry) => {
            const playerId = typeof entry?.id === 'string' ? entry.id.split(':')[1] ?? '' : '';
            const events = emittedEventsByPlayerId.get(playerId) ?? [];
            const proxyClient = {
                data: client?.data ?? {},
                emit: (event, payload) => {
                    events.push({ event, payload });
                    if (typeof client?.emit === 'function') {
                        client.emit(event, payload);
                    }
                },
            };
            clientEventService.emitPendingLogbookNotice(proxyClient, entry);
            emittedEventsByPlayerId.set(playerId, events);
        },
        emitPendingLogbookMessages: (client, playerId) => {
            const events = emittedEventsByPlayerId.get(playerId) ?? [];
            const proxyClient = {
                data: client?.data ?? {},
                emit: (event, payload) => {
                    events.push({ event, payload });
                    if (typeof client?.emit === 'function') {
                        client.emit(event, payload);
                    }
                },
            };
            clientEventService.emitPendingLogbookMessages(proxyClient, playerId);
            emittedEventsByPlayerId.set(playerId, events);
        },
    });
    async function runNoticeCase(persistedSource, expectedText) {
        const playerId = `proof_player_snapshot_recovery_notice_${persistedSource}`;
        const client = {
            id: `socket_snapshot_recovery_notice_${persistedSource}`,
            data: {
                protocol: 'next',
                authenticatedSnapshotRecovery: null,
            },
            emit: () => undefined,
        };
        bootstrapService.rememberAuthenticatedSnapshotRecovery(client, {
            identityPersistedSource: persistedSource,
            snapshotPersistedSource: 'native',
            recoveryReason: `persisted_source:${persistedSource}`,
        });
        await bootstrapService.bootstrapPlayerSession(client, {
            playerId,
            requestedSessionId: `${playerId}:session`,
            name: `proof_${persistedSource}`,
            displayName: `proof_${persistedSource}`,
            loadSnapshot: async () => ({
                templateId: 'yunlai_town',
                x: 32,
                y: 5,
            }),
        });
        const queued = queuedByPlayerId.get(playerId) ?? [];
        const emittedEvents = emittedEventsByPlayerId.get(playerId) ?? [];
        if (queued.length !== 1) {
            throw new Error(`expected authenticated snapshot recovery notice to queue exactly once for ${persistedSource}, got ${JSON.stringify(queued)}`);
        }
        if (queued[0]?.id !== `snapshot_recovery:${playerId}:${persistedSource}`) {
            throw new Error(`expected authenticated snapshot recovery notice id to include persisted source ${persistedSource}, got ${JSON.stringify(queued[0] ?? null)}`);
        }
        if (typeof queued[0]?.text !== 'string' || !queued[0].text.includes(expectedText)) {
            throw new Error(`expected authenticated snapshot recovery notice text to include ${expectedText}, got ${JSON.stringify(queued[0] ?? null)}`);
        }
        const emittedNotice = emittedEvents.find((entry) => entry.event === shared_1.NEXT_S2C.Notice
            && Array.isArray(entry.payload?.items)
            && entry.payload.items.some((noticeItem) => noticeItem?.messageId === queued[0]?.id
                && noticeItem.kind === 'system'
                && noticeItem.text === queued[0]?.text
                && noticeItem.from === 'system'
                && noticeItem.occurredAt === queued[0]?.at
                && noticeItem.persistUntilAck === true));
        if (!emittedNotice) {
            throw new Error(`expected authenticated snapshot recovery queued notice to flow into next notice emission for ${persistedSource}, got ${JSON.stringify(emittedEvents)}`);
        }
        if (client.data.authenticatedSnapshotRecovery !== null) {
            throw new Error(`expected authenticated snapshot recovery context to be consumed after bootstrap for ${persistedSource}`);
        }
        return {
            playerId,
            messageId: queued[0].id,
            messageKind: queued[0].kind ?? null,
            messageText: queued[0].text,
            noticeKind: 'system',
            emittedNoticeCount: emittedEvents.filter((entry) => entry.event === shared_1.NEXT_S2C.Notice).length,
            persistUntilAck: true,
        };
    }
/**
 * 记录tokenseednotice。
 */
    const tokenSeedNotice = await runNoticeCase('token_seed', '首次以 next 真源入场');
    return {
        tokenSeedNotice,
    };
}
async function withLocalAuthTraceEnabled(run) {
    const previousServerEnv = process.env.SERVER_NEXT_AUTH_TRACE_ENABLED;
    const previousNextEnv = process.env.NEXT_AUTH_TRACE_ENABLED;
    const previousTraceState = globalThis.__NEXT_AUTH_TRACE;
    process.env.SERVER_NEXT_AUTH_TRACE_ENABLED = '1';
    process.env.NEXT_AUTH_TRACE_ENABLED = '1';
    delete globalThis.__NEXT_AUTH_TRACE;
    (0, world_player_token_service_1.clearAuthTrace)();
    try {
        return await run();
    }
    finally {
        if (typeof previousServerEnv === 'string') {
            process.env.SERVER_NEXT_AUTH_TRACE_ENABLED = previousServerEnv;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_TRACE_ENABLED;
        }
        if (typeof previousNextEnv === 'string') {
            process.env.NEXT_AUTH_TRACE_ENABLED = previousNextEnv;
        }
        else {
            delete process.env.NEXT_AUTH_TRACE_ENABLED;
        }
        if (previousTraceState === undefined) {
            delete globalThis.__NEXT_AUTH_TRACE;
        }
        else {
            globalThis.__NEXT_AUTH_TRACE = previousTraceState;
        }
    }
}
function findLatestSnapshotRecoveryTrace(playerId) {
    const trace = (0, world_player_token_service_1.readAuthTrace)();
    const records = Array.isArray(trace?.records) ? trace.records : [];
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const entry = records[index];
        if (entry?.type === 'snapshot_recovery' && entry?.playerId === playerId) {
            return {
                entry,
                summary: trace.summary ?? null,
            };
        }
    }
    return {
        entry: null,
        summary: trace?.summary ?? null,
    };
}
/**
 * 验证 authenticated snapshot recovery 会写入独立 auth trace，区分 success/blocked/failure 三类结果。
 */
async function verifyAuthenticatedSnapshotRecoveryTraceContract() {
    return withLocalAuthTraceEnabled(async () => {
        const previousRecoveryEnv = process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
        process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = '1';
        try {
        const bootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
            isPersistenceEnabled: () => true,
            loadPlayerSnapshot: async () => null,
            ensureNativeStarterSnapshot: async (playerId) => ({
                ok: true,
                seeded: true,
                snapshot: {
                    version: 1,
                    placement: {
                        templateId: 'yunlai_town',
                        x: 32,
                        y: 5,
                        facing: 1,
                    },
                },
                persistedSource: 'native',
            }),
        }, null, null, null, null, null, null, null, null);
        const failureBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, {
            isPersistenceEnabled: () => true,
            loadPlayerSnapshot: async () => null,
            ensureNativeStarterSnapshot: async () => ({
                ok: false,
                failureStage: 'native_snapshot_recovery_seed_failed',
            }),
        }, null, null, null, null, null, null, null, null);
        const tokenSeedPlayerId = 'proof_player_snapshot_recovery_trace_token_seed';
        (0, world_player_token_service_1.clearAuthTrace)();
        await bootstrapService.loadAuthenticatedPlayerSnapshot({
            userId: 'proof_user_snapshot_recovery_trace_token_seed',
            playerId: tokenSeedPlayerId,
            authSource: 'next',
            persistedSource: 'token_seed',
        });
        const tokenSeedTrace = findLatestSnapshotRecoveryTrace(tokenSeedPlayerId);
        if (tokenSeedTrace.entry?.outcome !== 'success'
            || tokenSeedTrace.entry?.reason !== 'persisted_source:token_seed'
            || tokenSeedTrace.entry?.persistedSource !== 'native'
            || tokenSeedTrace.entry?.identityPersistedSource !== 'token_seed'
            || Number(tokenSeedTrace.summary?.snapshotRecovery?.successCount ?? 0) < 1) {
            throw new Error(`expected token_seed snapshot recovery trace success record, got ${JSON.stringify(tokenSeedTrace)}`);
        }
        const legacyBackfillPlayerId = 'proof_player_snapshot_recovery_trace_legacy_backfill';
        (0, world_player_token_service_1.clearAuthTrace)();
        let legacyBackfillBlockedError = null;
        try {
            await bootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_snapshot_recovery_trace_legacy_backfill',
                playerId: legacyBackfillPlayerId,
                authSource: 'next',
                persistedSource: 'legacy_backfill',
            });
        }
        catch (error) {
            legacyBackfillBlockedError = error;
        }
        const legacyBackfillTrace = findLatestSnapshotRecoveryTrace(legacyBackfillPlayerId);
        if (!(legacyBackfillBlockedError instanceof Error)
            || legacyBackfillTrace.entry?.outcome !== 'blocked'
            || legacyBackfillTrace.entry?.reason !== 'persisted_source:legacy_backfill'
            || legacyBackfillTrace.entry?.persistedSource !== null
            || Number(legacyBackfillTrace.summary?.snapshotRecovery?.blockedCount ?? 0) < 1) {
            throw new Error(`expected legacy_backfill snapshot recovery trace blocked record, got error=${legacyBackfillBlockedError instanceof Error ? legacyBackfillBlockedError.message : String(legacyBackfillBlockedError)} trace=${JSON.stringify(legacyBackfillTrace)}`);
        }
        const nativePlayerId = 'proof_player_snapshot_recovery_trace_native';
        (0, world_player_token_service_1.clearAuthTrace)();
        let nativeBlockedError = null;
        try {
            await bootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_snapshot_recovery_trace_native',
                playerId: nativePlayerId,
                authSource: 'next',
                persistedSource: 'native',
            });
        }
        catch (error) {
            nativeBlockedError = error;
        }
        const nativeBlockedTrace = findLatestSnapshotRecoveryTrace(nativePlayerId);
        if (!(nativeBlockedError instanceof Error)
            || nativeBlockedTrace.entry?.outcome !== 'blocked'
            || nativeBlockedTrace.entry?.reason !== 'persisted_source:native'
            || nativeBlockedTrace.entry?.persistedSource !== null
            || Number(nativeBlockedTrace.summary?.snapshotRecovery?.blockedCount ?? 0) < 1) {
            throw new Error(`expected native snapshot recovery trace blocked record, got error=${nativeBlockedError instanceof Error ? nativeBlockedError.message : String(nativeBlockedError)} trace=${JSON.stringify(nativeBlockedTrace)}`);
        }
        const failurePlayerId = 'proof_player_snapshot_recovery_trace_failure';
        (0, world_player_token_service_1.clearAuthTrace)();
        let failureError = null;
        try {
            await failureBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_snapshot_recovery_trace_failure',
                playerId: failurePlayerId,
                authSource: 'next',
                persistedSource: 'token_seed',
            });
        }
        catch (error) {
            failureError = error;
        }
        const failureTrace = findLatestSnapshotRecoveryTrace(failurePlayerId);
        if (!(failureError instanceof Error)
            || failureTrace.entry?.outcome !== 'failure'
            || failureTrace.entry?.reason !== 'persisted_source:token_seed'
            || failureTrace.entry?.failureStage !== 'native_snapshot_recovery_seed_failed'
            || Number(failureTrace.summary?.snapshotRecovery?.failedCount ?? 0) < 1) {
            throw new Error(`expected snapshot recovery trace failure record, got error=${failureError instanceof Error ? failureError.message : String(failureError)} trace=${JSON.stringify(failureTrace)}`);
        }
        return {
            tokenSeedSuccess: {
                outcome: tokenSeedTrace.entry?.outcome ?? null,
                reason: tokenSeedTrace.entry?.reason ?? null,
                persistedSource: tokenSeedTrace.entry?.persistedSource ?? null,
            },
            legacyBackfillBlocked: {
                outcome: legacyBackfillTrace.entry?.outcome ?? null,
                reason: legacyBackfillTrace.entry?.reason ?? null,
                persistedSource: legacyBackfillTrace.entry?.persistedSource ?? null,
            },
            nativeBlocked: {
                outcome: nativeBlockedTrace.entry?.outcome ?? null,
                reason: nativeBlockedTrace.entry?.reason ?? null,
            },
            seedFailure: {
                outcome: failureTrace.entry?.outcome ?? null,
                reason: failureTrace.entry?.reason ?? null,
                failureStage: failureTrace.entry?.failureStage ?? null,
            },
        };
        }
        finally {
            if (typeof previousRecoveryEnv === 'string') {
                process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = previousRecoveryEnv;
            }
            else {
                delete process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
            }
        }
    });
}
/**
 * 验证 authenticated snapshot recovery 成功后，bootstrap trace 会显式携带 recovery 链接字段并进入汇总。
 */
async function verifyAuthenticatedSnapshotRecoveryBootstrapLinkContract() {
    return withLocalAuthTraceEnabled(async () => {
        const previousRecoveryEnv = process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
        process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = '1';
        try {
/**
 * 记录玩家运行时服务。
 */
            const playerRuntimeService = {
                loadOrCreatePlayer: async () => ({
                    templateId: 'yunlai_town',
                    x: 32,
                    y: 5,
                }),
                setIdentity: () => undefined,
                queuePendingLogbookMessage: () => undefined,
                getPendingLogbookMessages: () => [],
            };
/**
 * 记录bootstrap服务。
 */
            const bootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
                promoteTokenSeedIdentityToNative: async (identity) => ({
                    ...identity,
                    authSource: 'next',
                    persistedSource: 'native',
                }),
            }, {
                isPersistenceEnabled: () => true,
                loadPlayerSnapshot: async () => null,
                ensureNativeStarterSnapshot: async () => ({
                    ok: true,
                    seeded: true,
                    snapshot: {
                        version: 1,
                        placement: {
                            templateId: 'yunlai_town',
                            x: 32,
                            y: 5,
                            facing: 1,
                        },
                    },
                    persistedSource: 'native',
                }),
            }, null, playerRuntimeService, {
                ensurePlayerMailbox: async () => undefined,
                ensureWelcomeMail: async () => undefined,
            }, {
                getAll: () => [],
            }, {
                removePlayer: () => undefined,
                connectPlayer: () => undefined,
            }, {
                getBinding: () => null,
                registerSocket: (client, playerId, requestedSessionId) => ({
                    playerId,
                    sessionId: requestedSessionId?.trim() || `${playerId}:bootstrap`,
                    socketId: client.id,
                    resumed: false,
                    connected: true,
                    detachedAt: null,
                    expireAt: null,
                }),
            }, {
                emitInitialSync: () => undefined,
            }, {
                emitSuggestionUpdate: () => undefined,
                emitMailSummaryForPlayer: async () => undefined,
                emitPendingLogbookNotice: () => undefined,
                emitPendingLogbookMessages: () => undefined,
            });
/**
 * 记录读取最新bootstrap trace。
 */
            const readLatestBootstrapTrace = (playerId) => {
                const trace = (0, world_player_token_service_1.readAuthTrace)();
                const records = Array.isArray(trace?.records) ? trace.records : [];
                for (let index = records.length - 1; index >= 0; index -= 1) {
                    const entry = records[index];
                    if (entry?.type === 'bootstrap' && entry?.playerId === playerId) {
                        return {
                            entry,
                            summary: trace?.summary ?? null,
                        };
                    }
                }
                return {
                    entry: null,
                    summary: trace?.summary ?? null,
                };
            };
/**
 * 运行单个bootstrap恢复链证明。
 */
            const runBootstrapRecoveryCase = async (persistedSource) => {
                const playerId = `proof_player_snapshot_recovery_bootstrap_${persistedSource}`;
                const authSource = persistedSource === 'token_seed' ? 'token' : 'next';
                const client = {
                    id: `socket_snapshot_recovery_bootstrap_${persistedSource}`,
                    data: {
                        protocol: 'next',
                        bootstrapEntryPath: 'connect_token',
                        bootstrapIdentitySource: authSource,
                        bootstrapIdentityPersistedSource: persistedSource,
                        authenticatedSnapshotRecovery: null,
                    },
                    emit: () => undefined,
                };
                (0, world_player_token_service_1.clearAuthTrace)();
                await bootstrapService.loadAuthenticatedPlayerSnapshot({
                    userId: `proof_user_snapshot_recovery_bootstrap_${persistedSource}`,
                    playerId,
                    authSource,
                    persistedSource,
                }, client);
                await bootstrapService.bootstrapPlayerSession(client, {
                    playerId,
                    requestedSessionId: `${playerId}:session`,
                    name: `proof_${persistedSource}`,
                    displayName: `proof_${persistedSource}`,
                    loadSnapshot: async () => ({
                        templateId: 'yunlai_town',
                        x: 32,
                        y: 5,
                    }),
                });
                const bootstrapTrace = readLatestBootstrapTrace(playerId);
                if (bootstrapTrace.entry?.identitySource !== 'next'
                    || bootstrapTrace.entry?.identityPersistedSource !== 'native'
                    || bootstrapTrace.entry?.snapshotSource !== 'recovery_native'
                    || bootstrapTrace.entry?.snapshotPersistedSource !== 'native'
                    || bootstrapTrace.entry?.linkedIdentitySource !== 'next'
                    || bootstrapTrace.entry?.linkedSnapshotSource !== 'recovery_native'
                    || bootstrapTrace.entry?.linkedSnapshotPersistedSource !== 'native'
                    || bootstrapTrace.entry?.recoveryOutcome !== 'success'
                    || bootstrapTrace.entry?.recoveryReason !== `persisted_source:${persistedSource}`
                    || bootstrapTrace.entry?.recoveryIdentityPersistedSource !== persistedSource
                    || bootstrapTrace.entry?.recoverySnapshotPersistedSource !== 'native'
                    || Number(bootstrapTrace.summary?.bootstrap?.identityPersistedSourceCounts?.native ?? 0) < 1
                    || Number(bootstrapTrace.summary?.bootstrap?.snapshotSourceCounts?.recovery_native ?? 0) < 1
                    || Number(bootstrapTrace.summary?.bootstrap?.snapshotPersistedSourceCounts?.native ?? 0) < 1
                    || Number(bootstrapTrace.summary?.bootstrap?.recoveryOutcomeCounts?.success ?? 0) < 1
                    || Number(bootstrapTrace.summary?.bootstrap?.recoveryReasonCounts?.[`persisted_source:${persistedSource}`] ?? 0) < 1
                    || Number(bootstrapTrace.summary?.bootstrap?.recoveryIdentityPersistedSourceCounts?.[persistedSource] ?? 0) < 1
                    || Number(bootstrapTrace.summary?.bootstrap?.recoverySnapshotPersistedSourceCounts?.native ?? 0) < 1) {
                    throw new Error(`expected snapshot recovery bootstrap trace to link recovery for ${persistedSource}, got ${JSON.stringify(bootstrapTrace)}`);
                }
                return {
                    identitySource: bootstrapTrace.entry?.identitySource ?? null,
                    identityPersistedSource: bootstrapTrace.entry?.identityPersistedSource ?? null,
                    snapshotSource: bootstrapTrace.entry?.snapshotSource ?? null,
                    snapshotPersistedSource: bootstrapTrace.entry?.snapshotPersistedSource ?? null,
                    linkedIdentitySource: bootstrapTrace.entry?.linkedIdentitySource ?? null,
                    linkedSnapshotSource: bootstrapTrace.entry?.linkedSnapshotSource ?? null,
                    linkedSnapshotPersistedSource: bootstrapTrace.entry?.linkedSnapshotPersistedSource ?? null,
                    recoveryOutcome: bootstrapTrace.entry?.recoveryOutcome ?? null,
                    recoveryReason: bootstrapTrace.entry?.recoveryReason ?? null,
                    recoveryIdentityPersistedSource: bootstrapTrace.entry?.recoveryIdentityPersistedSource ?? null,
                    recoverySnapshotPersistedSource: bootstrapTrace.entry?.recoverySnapshotPersistedSource ?? null,
                };
            };
            const tokenSeedBootstrap = await runBootstrapRecoveryCase('token_seed');
            return {
                tokenSeedBootstrap,
            };
        }
        finally {
            if (typeof previousRecoveryEnv === 'string') {
                process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = previousRecoveryEnv;
            }
            else {
                delete process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
            }
        }
    });
}
/**
 * 验证 token 直连时玩家身份的种子构造与来源标记。
 */
async function verifyTokenSeedIdentityContract() {
/**
 * 记录payload。
 */
    const payload = {
        sub: 'proof_user_token_seed',
        username: 'proof_token_seed',
        displayName: '证',
        playerId: 'proof_player_token_seed',
        playerName: 'proof token seed',
    };
/**
 * 记录compatidentitycalls。
 */
    let compatIdentityCalls = 0;
/**
 * 记录compatsnapshotcalls。
 */
    let compatSnapshotCalls = 0;
    const starterSnapshotDeps = createAuthStarterSnapshotDeps();
/**
 * 记录认证服务。
 */
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
        resolvePlayerIdentityForMigration: async () => {
            compatIdentityCalls += 1;
            return null;
        },
        loadPlayerSnapshotForMigration: async () => {
            compatSnapshotCalls += 1;
            return null;
        },
    }, {
        ensureNativeStarterSnapshot: async () => ({
            ok: true,
            seeded: false,
            persistedSource: 'native',
            snapshot: {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 3,
                    y: 3,
                    facing: 1,
                },
            },
        }),
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
    });
/**
 * 记录identity。
 */
    const identity = await authService.authenticatePlayerToken('proof.token.token_seed');
    if (!identity || identity.authSource !== 'token') {
        throw new Error(`expected persistence-enabled token identity to seed next auth without compat identity lookup, got ${JSON.stringify(identity)}`);
    }
    if (compatIdentityCalls !== 0 || compatSnapshotCalls !== 0) {
        throw new Error(`expected token-seed identity path to avoid compat identity/snapshot lookup, got compatIdentityCalls=${compatIdentityCalls} compatSnapshotCalls=${compatSnapshotCalls}`);
    }
    const nextStoreIdentity = {
        userId: payload.sub,
        username: payload.username,
        displayName: payload.displayName,
        playerId: payload.playerId,
        playerName: payload.playerName,
        persistedSource: 'token_seed',
        authSource: 'next',
    };
    const nextStoreAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
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
        loadPlayerIdentity: async () => nextStoreIdentity,
        savePlayerIdentity: async (input) => input,
    }, {
        resolvePlayerIdentityForMigration: async () => {
            compatIdentityCalls += 1;
            return null;
        },
        loadPlayerSnapshotForMigration: async () => {
            compatSnapshotCalls += 1;
            return null;
        },
    }, {
        ensureNativeStarterSnapshot: async () => ({
            ok: true,
            seeded: false,
            persistedSource: 'native',
            snapshot: {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 3,
                    y: 3,
                    facing: 1,
                },
            },
        }),
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
    });
    const nextProtocolIdentity = await nextStoreAuthService.authenticatePlayerToken('proof.token.token_seed', {
        protocol: 'next',
    });
    if (!nextProtocolIdentity || nextProtocolIdentity.authSource !== 'token') {
        throw new Error(`expected next protocol token_seed identity store hit to resolve authSource=token, got ${JSON.stringify(nextProtocolIdentity)}`);
    }
    if (nextProtocolIdentity.persistedSource !== 'token_seed') {
        throw new Error(`expected next protocol token_seed identity store hit to keep persistedSource=token_seed, got ${JSON.stringify(nextProtocolIdentity)}`);
    }
    const tokenSeedBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, null, null, null, null, null, null, null, null, null);
    const tokenSeedGateway = new world_gateway_1.WorldGateway(null, null, tokenSeedBootstrapService, null, null, null, null, null, null, null, null, null, null, null);
    const tokenSeedClient = {
        id: 'proof_socket_token_seed_reuse',
        handshake: {
            auth: {
                sessionId: 'token_seed_requested_session',
            },
        },
        data: {
            isGm: false,
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'token',
            bootstrapIdentityPersistedSource: 'token_seed',
        },
    };
    const tokenSeedRequestedSessionIdAllowed = tokenSeedBootstrapService.shouldAllowRequestedDetachedResume(tokenSeedClient);
    const tokenSeedConnectedSessionReuseAllowed = tokenSeedBootstrapService.shouldAllowConnectedSessionReuse(tokenSeedClient);
    const tokenSeedImplicitDetachedResumeAllowed = tokenSeedBootstrapService.shouldAllowImplicitDetachedResume(tokenSeedClient);
    const tokenSeedBootstrapInput = tokenSeedGateway.buildAuthenticatedBootstrapInput(tokenSeedClient, nextProtocolIdentity);
    if (tokenSeedBootstrapInput.requestedSessionId !== 'token_seed_requested_session') {
        throw new Error(`expected next protocol token_seed identity store hit to preserve requestedSessionId through gateway bootstrap input, got ${tokenSeedBootstrapInput.requestedSessionId}`);
    }
    if (!tokenSeedRequestedSessionIdAllowed || !tokenSeedConnectedSessionReuseAllowed || !tokenSeedImplicitDetachedResumeAllowed) {
        throw new Error(`expected token/token_seed bootstrap session reuse policy to allow reuse, got implicit=${tokenSeedImplicitDetachedResumeAllowed} requested=${tokenSeedRequestedSessionIdAllowed} connected=${tokenSeedConnectedSessionReuseAllowed}`);
    }
    const promotedIdentity = await nextStoreAuthService.promoteTokenSeedIdentityToNative(nextProtocolIdentity);
    if (!promotedIdentity || promotedIdentity.authSource !== 'next' || promotedIdentity.persistedSource !== 'native') {
        throw new Error(`expected token_seed identity promotion to normalize into next/native, got ${JSON.stringify(promotedIdentity)}`);
    }
    return {
        identitySource: identity.authSource ?? null,
        playerId: identity.playerId ?? null,
        compatIdentityCalls,
        compatSnapshotCalls,
        nextProtocolAuthSource: nextProtocolIdentity.authSource ?? null,
        nextProtocolPersistedSource: nextProtocolIdentity.persistedSource ?? null,
        promotedAuthSource: promotedIdentity.authSource ?? null,
        promotedPersistedSource: promotedIdentity.persistedSource ?? null,
        requestedSessionId: tokenSeedBootstrapInput.requestedSessionId ?? null,
        sessionReusePolicy: {
            implicit: tokenSeedImplicitDetachedResumeAllowed,
            requested: tokenSeedRequestedSessionIdAllowed,
            connected: tokenSeedConnectedSessionReuseAllowed,
        },
    };
}
/**
 * 验证带库 token 首登在缺失 compat snapshot 时，会直接写入 next-native starter snapshot。
 */
async function verifyTokenSeedNativeStarterSnapshotContract() {
/**
 * 记录payload。
 */
    const payload = {
        sub: 'proof_user_token_native_snapshot',
        username: 'proof_token_native_snapshot',
        displayName: '原',
        playerId: 'proof_player_token_native_snapshot',
        playerName: 'proof token native snapshot',
    };
/**
 * 记录compatidentitycalls。
 */
    let compatIdentityCalls = 0;
/**
 * 记录compatsnapshotcalls。
 */
    let compatSnapshotCalls = 0;
/**
 * 记录savedsnapshot。
 */
    let savedSnapshot = null;
/**
 * 记录savedsnapshotoptions。
 */
    let savedSnapshotOptions = null;
    const starterSnapshotDeps = createAuthStarterSnapshotDeps();
/**
 * 记录认证服务。
 */
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
        resolvePlayerIdentityForMigration: async () => {
            compatIdentityCalls += 1;
            return null;
        },
        loadPlayerSnapshotForMigration: async () => {
            compatSnapshotCalls += 1;
            return null;
        },
    }, {
        ensureNativeStarterSnapshot: async (playerId) => {
            const snapshot = starterSnapshotDeps.playerRuntimeService.buildStarterPersistenceSnapshot(playerId);
            savedSnapshot = snapshot;
            savedSnapshotOptions = {
                persistedSource: 'native',
                seededAt: Date.now(),
            };
            return {
                ok: true,
                seeded: true,
                persistedSource: 'native',
                snapshot,
            };
        },
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
    });
/**
 * 记录identity。
 */
    const identity = await authService.authenticatePlayerToken('proof.token.token_native_snapshot');
    if (!identity || identity.authSource !== 'token') {
        throw new Error(`expected missing-next-snapshot token identity to seed native starter snapshot and authenticate as token, got ${JSON.stringify(identity)}`);
    }
    if (compatIdentityCalls !== 0 || compatSnapshotCalls !== 0) {
        throw new Error(`expected token native starter snapshot path to avoid compat identity/snapshot lookup, got compatIdentityCalls=${compatIdentityCalls} compatSnapshotCalls=${compatSnapshotCalls}`);
    }
    if (!savedSnapshot || savedSnapshot.placement?.templateId !== 'yunlai_town') {
        throw new Error(`expected token native starter snapshot path to save yunlai_town starter snapshot, got ${JSON.stringify(savedSnapshot)}`);
    }
    if (savedSnapshot.placement?.x !== 32 || savedSnapshot.placement?.y !== 5 || savedSnapshot.placement?.facing !== 1) {
        throw new Error(`expected token native starter snapshot path to save default starter coordinates, got ${JSON.stringify(savedSnapshot?.placement ?? null)}`);
    }
    if (!Array.isArray(savedSnapshot.unlockedMapIds) || !savedSnapshot.unlockedMapIds.includes('yunlai_town')) {
        throw new Error(`expected token native starter snapshot path to unlock starter map, got ${JSON.stringify(savedSnapshot?.unlockedMapIds ?? null)}`);
    }
    if (!Array.isArray(savedSnapshot.inventory?.items) || savedSnapshot.inventory.items.length < 1) {
        throw new Error(`expected token native starter snapshot path to carry starter inventory, got ${JSON.stringify(savedSnapshot?.inventory ?? null)}`);
    }
    if (savedSnapshotOptions?.persistedSource !== 'native') {
        throw new Error(`expected token native starter snapshot path to persist as native, got ${JSON.stringify(savedSnapshotOptions)}`);
    }
    if (!Number.isFinite(savedSnapshotOptions?.seededAt)) {
        throw new Error(`expected token native starter snapshot path to stamp seededAt, got ${JSON.stringify(savedSnapshotOptions)}`);
    }
    return {
        identitySource: identity.authSource ?? null,
        playerId: identity.playerId ?? null,
        compatIdentityCalls,
        compatSnapshotCalls,
        placement: savedSnapshot.placement ?? null,
        unlockedMapIds: Array.isArray(savedSnapshot.unlockedMapIds) ? savedSnapshot.unlockedMapIds.slice() : [],
        starterInventoryCount: Array.isArray(savedSnapshot.inventory?.items) ? savedSnapshot.inventory.items.length : 0,
        persistedSource: savedSnapshotOptions?.persistedSource ?? null,
    };
}
/**
 * 验证 with-db token_seed 在缺失 next identity 与 compat snapshot 时，能直接 bootstrap 为 next-native starter snapshot。
 */
async function verifyTokenSeedNativeStarterBootstrapProof() {
    const expectedRecoveryIdentityPersistedSource = 'token_seed';
/**
 * 记录认证。
 */
    const auth = await registerAndLoginPlayer(`na_seed_${suffix.slice(-6)}`, buildUniqueDisplayName(`next-auth-token-seed:${suffix}`), `种角${suffix.slice(-4)}`);
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(auth.accessToken);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/**
 * 记录玩家ID。
 */
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
    if (!userId || !playerId) {
        throw new Error(`next auth token missing identity fields for token-seed native starter bootstrap proof: ${JSON.stringify(payload)}`);
    }
/**
 * 记录bootstrap。
 */
    let bootstrap = null;
    try {
        await delay(300);
        await flushPersistence();
        await deletePlayer(playerId);
        await waitForPlayerState(playerId, false);
        await dropPersistedIdentityDocument(userId);
        await dropPlayerSnapshotSourcesButKeepIdentity(playerId);
        await expectPersistedIdentityDocument(userId, false);
        await expectPersistedPlayerSnapshotDocument(playerId, false);
        await expectLegacyCompatPlayerSnapshotDocument(playerId, false);
        await clearAuthTrace();
        bootstrap = await runNextBootstrap(auth.accessToken, auth.identity, {
            expectedNoticeMessageId: `snapshot_recovery:${playerId}:${expectedRecoveryIdentityPersistedSource}`,
        });
        if (bootstrap.playerId !== playerId) {
            throw new Error(`token-seed native starter bootstrap player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
        }
/**
 * 记录认证trace。
 */
        const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
            requireReject: false,
        });
        if (authTrace.identitySource !== 'token') {
            throw new Error(`expected token-seed native starter bootstrap identity source to be token, got ${authTrace.identitySource ?? 'unknown'}`);
        }
        if (authTrace.identityPersistedSource !== expectedRecoveryIdentityPersistedSource) {
            throw new Error(`expected token-seed native starter bootstrap identity persisted source to be ${expectedRecoveryIdentityPersistedSource}, got ${authTrace.identityPersistedSource ?? 'unknown'}`);
        }
        if (authTrace.bootstrapIdentitySource !== 'next') {
            throw new Error(`expected token-seed native starter bootstrap trace to normalize identity source to next, got ${authTrace.bootstrapIdentitySource ?? 'unknown'}`);
        }
        if (authTrace.bootstrapIdentityPersistedSource !== 'native') {
            throw new Error(`expected token-seed native starter bootstrap trace to normalize identity persisted source to native, got ${authTrace.bootstrapIdentityPersistedSource ?? 'unknown'}`);
        }
        if (authTrace.bootstrapRecoveryIdentityPersistedSource !== expectedRecoveryIdentityPersistedSource) {
            throw new Error(`expected token-seed native starter bootstrap recovery identity persisted source to stay ${expectedRecoveryIdentityPersistedSource}, got ${authTrace.bootstrapRecoveryIdentityPersistedSource ?? 'unknown'}`);
        }
        if (authTrace.identityCompatTried) {
            throw new Error(`expected token-seed native starter bootstrap to avoid compat identity lookup, got ${JSON.stringify(authTrace)}`);
        }
        if (authTrace.snapshotSource !== 'next') {
            throw new Error(`expected token-seed native starter bootstrap snapshot source to be next, got ${authTrace.snapshotSource ?? 'unknown'}`);
        }
        if (authTrace.snapshotPersistedSource !== 'native') {
            throw new Error(`expected token-seed native starter bootstrap snapshot persisted source to be native, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
        }
        await expectPersistedIdentityDocument(userId, true);
        await expectPersistedPlayerSnapshotDocument(playerId, true);
        const persistedIdentityPayload = await readPersistedIdentityPayload(userId, 'token-seed native starter bootstrap proof');
        if (persistedIdentityPayload?.persistedSource !== 'native') {
            throw new Error(`expected token-seed native starter bootstrap to promote persisted identity to native, got ${JSON.stringify(persistedIdentityPayload)}`);
        }
/**
 * 记录persistedpayload。
 */
        const persistedPayload = await readPersistedPlayerSnapshotPayload(playerId, 'token-seed native starter bootstrap proof');
        if (!Array.isArray(persistedPayload?.inventory?.items) || persistedPayload.inventory.items.length < 1) {
            throw new Error(`expected token-seed native starter bootstrap persisted snapshot to keep starter inventory, got ${JSON.stringify(persistedPayload?.inventory ?? null)}`);
        }
        await waitForPlayerState(playerId, true);
/**
 * 记录state。
 */
        const state = await fetchPlayerState(playerId);
/**
 * 记录runtimeitems。
 */
        const runtimeItems = Array.isArray(state?.player?.inventory?.items)
            ? state.player.inventory.items
            : [];
        if (runtimeItems.length < 1) {
            throw new Error(`expected token-seed native starter bootstrap runtime inventory to keep starter items, got ${JSON.stringify(state?.player?.inventory ?? null)}`);
        }
        const recoveryNotice = Array.isArray(bootstrap.noticeItems)
            ? bootstrap.noticeItems.find((entry) => entry?.messageId === `snapshot_recovery:${playerId}:${expectedRecoveryIdentityPersistedSource}`)
            : null;
        if (!recoveryNotice
            || recoveryNotice.kind !== 'system'
            || recoveryNotice.persistUntilAck !== true
            || !String(recoveryNotice.text ?? '').includes('首次以 next 真源入场')) {
            throw new Error(`expected token-seed native starter bootstrap to emit persistent system recovery notice, got ${JSON.stringify(bootstrap.noticeItems ?? null)}`);
        }
        return {
            playerId,
            identitySource: authTrace.identitySource ?? null,
            identityPersistedSource: authTrace.identityPersistedSource ?? null,
            bootstrapIdentitySource: authTrace.bootstrapIdentitySource ?? null,
            bootstrapIdentityPersistedSource: authTrace.bootstrapIdentityPersistedSource ?? null,
            bootstrapRecoveryIdentityPersistedSource: authTrace.bootstrapRecoveryIdentityPersistedSource ?? null,
            snapshotSource: authTrace.snapshotSource ?? null,
            snapshotPersistedSource: authTrace.snapshotPersistedSource ?? null,
            persistedIdentitySource: persistedIdentityPayload?.persistedSource ?? null,
            starterInventoryCount: runtimeItems.length,
            bootstrapSessionId: bootstrap.sessionId ?? null,
            recoveryNoticeKind: recoveryNotice.kind ?? null,
            recoveryNoticePersistUntilAck: recoveryNotice.persistUntilAck === true,
        };
    }
    finally {
        await deletePlayer(bootstrap?.playerId ?? playerId).catch(() => undefined);
        await cleanupLegacyCompatPlayerSnapshot(auth.identity).catch(() => undefined);
        await clearAuthTrace().catch(() => undefined);
    }
}
/**
 * 验证 token 种子身份在持久化失败时的拒绝或回退行为。
 */
async function verifyTokenSeedPersistFailureContract() {
/**
 * 记录payload。
 */
    const payload = {
        sub: 'proof_user_token_persist_blocked',
        username: 'proof_token_persist_blocked',
        displayName: '断',
        playerId: 'proof_player_token_persist_blocked',
        playerName: 'proof token persist blocked',
    };
/**
 * 记录compatidentitycalls。
 */
    let compatIdentityCalls = 0;
    const starterSnapshotDeps = createAuthStarterSnapshotDeps();
/**
 * 记录认证服务。
 */
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
        resolvePlayerIdentityForMigration: async () => {
            compatIdentityCalls += 1;
            return {
                userId: payload.sub,
                username: payload.username,
                displayName: payload.displayName,
                playerId: payload.playerId,
                playerName: payload.playerName,
            };
        },
        loadPlayerSnapshotForMigration: async () => null,
    }, {
        ensureNativeStarterSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_native_snapshot_seed',
        }),
        ensureMigrationBackfillSnapshot: async () => ({
            ok: false,
            failureStage: 'unexpected_compat_snapshot_seed',
        }),
    });
/**
 * 记录identity。
 */
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
/**
 * 验证 strict native 模式下，即使已有 compat 快照，next 主链仍坚持 token_seed/native。
 */
async function verifyStrictNativeCompatSnapshotIgnoredContract() {
/**
 * 记录认证。
 */
    const auth = await registerAndLoginPlayer(`ns_${suffix.slice(-6)}`, buildUniqueDisplayName(`next-auth-strict-compat:${suffix}`), `严角${suffix.slice(-4)}`);
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(auth.accessToken);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/**
 * 记录玩家ID。
 */
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
    if (!userId || !playerId) {
        throw new Error(`next auth token missing identity fields for strict-native compat-snapshot ignored proof: ${JSON.stringify(payload)}`);
    }
/**
 * 记录bootstrap。
 */
    let bootstrap = null;
    try {
        await delay(300);
        await flushPersistence();
        await deletePlayer(playerId);
        await waitForPlayerState(playerId, false);
        await ensureLegacyCompatPlayerSnapshotDocument(auth.identity);
        await dropPersistedIdentityDocument(userId);
        await dropPersistedPlayerSnapshot(playerId);
        await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
        await expectPersistedIdentityDocument(userId, false);
        await expectPersistedPlayerSnapshotDocument(playerId, false);
        await clearAuthTrace();
        bootstrap = await runNextBootstrap(auth.accessToken, null, {
            expectedNoticeMessageId: `snapshot_recovery:${playerId}:token_seed`,
        });
        if (bootstrap.playerId !== playerId) {
            throw new Error(`strict-native compat-snapshot ignored bootstrap player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
        }
/**
 * 记录认证trace。
 */
        const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
            requireReject: false,
        });
        if (authTrace.identitySource !== 'token') {
            throw new Error(`expected strict-native compat-snapshot ignored identity source to be token, got ${authTrace.identitySource ?? 'unknown'}`);
        }
        if (authTrace.identityPersistedSource !== 'token_seed') {
            throw new Error(`expected strict-native compat-snapshot ignored identity persisted source to be token_seed, got ${authTrace.identityPersistedSource ?? 'unknown'}`);
        }
        if (authTrace.bootstrapIdentitySource !== 'next') {
            throw new Error(`expected strict-native compat-snapshot ignored bootstrap identity source to normalize to next, got ${authTrace.bootstrapIdentitySource ?? 'unknown'}`);
        }
        if (authTrace.bootstrapIdentityPersistedSource !== 'native') {
            throw new Error(`expected strict-native compat-snapshot ignored bootstrap identity persisted source to normalize to native, got ${authTrace.bootstrapIdentityPersistedSource ?? 'unknown'}`);
        }
        if (authTrace.bootstrapRecoveryIdentityPersistedSource !== 'token_seed') {
            throw new Error(`expected strict-native compat-snapshot ignored recovery identity persisted source to stay token_seed, got ${authTrace.bootstrapRecoveryIdentityPersistedSource ?? 'unknown'}`);
        }
        if (authTrace.identityCompatTried) {
            throw new Error(`expected strict-native compat-snapshot ignored proof to avoid compat identity lookup, got ${JSON.stringify(authTrace)}`);
        }
        if (authTrace.snapshotSource !== 'next') {
            throw new Error(`expected strict-native compat-snapshot ignored snapshot source to be next, got ${authTrace.snapshotSource ?? 'unknown'}`);
        }
        if (authTrace.snapshotPersistedSource !== 'native') {
            throw new Error(`expected strict-native compat-snapshot ignored snapshot persisted source to be native, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
        }
        await expectPersistedIdentityDocument(userId, true);
        await expectPersistedPlayerSnapshotDocument(playerId, true);
        await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
        const persistedIdentityPayload = await readPersistedIdentityPayload(userId, 'strict-native compat-snapshot ignored proof');
        if (persistedIdentityPayload?.persistedSource !== 'native') {
            throw new Error(`expected strict-native compat-snapshot ignored proof to promote persisted identity to native, got ${JSON.stringify(persistedIdentityPayload)}`);
        }
/**
 * 记录persistedpayload。
 */
        const persistedPayload = await readPersistedPlayerSnapshotPayload(playerId, 'strict-native compat-snapshot ignored proof');
        if (!Array.isArray(persistedPayload?.inventory?.items) || persistedPayload.inventory.items.length < 1) {
            throw new Error(`expected strict-native compat-snapshot ignored persisted snapshot to keep starter inventory, got ${JSON.stringify(persistedPayload?.inventory ?? null)}`);
        }
        await waitForPlayerState(playerId, true);
/**
 * 记录state。
 */
        const state = await fetchPlayerState(playerId);
/**
 * 记录runtimeitems。
 */
        const runtimeItems = Array.isArray(state?.player?.inventory?.items)
            ? state.player.inventory.items
            : [];
        if (runtimeItems.length < 1) {
            throw new Error(`expected strict-native compat-snapshot ignored runtime inventory to keep starter items, got ${JSON.stringify(state?.player?.inventory ?? null)}`);
        }
        const recoveryNotice = Array.isArray(bootstrap.noticeItems)
            ? bootstrap.noticeItems.find((entry) => entry?.messageId === `snapshot_recovery:${playerId}:token_seed`)
            : null;
        if (!recoveryNotice
            || recoveryNotice.kind !== 'system'
            || recoveryNotice.persistUntilAck !== true
            || !String(recoveryNotice.text ?? '').includes('首次以 next 真源入场')) {
            throw new Error(`expected strict-native compat-snapshot ignored bootstrap to emit persistent system recovery notice, got ${JSON.stringify(bootstrap.noticeItems ?? null)}`);
        }
        return {
            playerId,
            identitySource: authTrace.identitySource ?? null,
            identityPersistedSource: authTrace.identityPersistedSource ?? null,
            bootstrapIdentitySource: authTrace.bootstrapIdentitySource ?? null,
            bootstrapIdentityPersistedSource: authTrace.bootstrapIdentityPersistedSource ?? null,
            bootstrapRecoveryIdentityPersistedSource: authTrace.bootstrapRecoveryIdentityPersistedSource ?? null,
            snapshotSource: authTrace.snapshotSource ?? null,
            snapshotPersistedSource: authTrace.snapshotPersistedSource ?? null,
            compatSnapshotPreserved: true,
            persistedIdentitySource: persistedIdentityPayload?.persistedSource ?? null,
            starterInventoryCount: runtimeItems.length,
            bootstrapSessionId: bootstrap.sessionId ?? null,
            recoveryNoticeKind: recoveryNotice.kind ?? null,
            recoveryNoticePersistUntilAck: recoveryNotice.persistUntilAck === true,
        };
    }
    finally {
        await deletePlayer(bootstrap?.playerId ?? playerId).catch(() => undefined);
        await cleanupLegacyCompatPlayerSnapshot(auth.identity).catch(() => undefined);
        await clearAuthTrace().catch(() => undefined);
    }
}
/**
 * 验证认证阶段在快照服务缺失时会稳定 fail-fast，并保持预种阻断 stage 不漂移。
 */
async function verifyAuthPreseedSnapshotServiceUnavailableContract() {
    return withLocalAuthTraceEnabled(async () => {
/**
 * 记录读取最新身份trace。
 */
        const readLatestIdentityTrace = (playerId) => {
            const trace = (0, world_player_token_service_1.readAuthTrace)();
            const records = Array.isArray(trace?.records) ? trace.records : [];
            for (let index = records.length - 1; index >= 0; index -= 1) {
                const entry = records[index];
                if (entry?.type === 'identity' && entry?.playerId === playerId) {
                    return {
                        entry,
                        summary: trace?.summary ?? null,
                    };
                }
            }
            return {
                entry: null,
                summary: trace?.summary ?? null,
            };
        };
/**
 * 记录tokenpayload。
 */
        const tokenPayload = {
            sub: 'proof_user_token_preseed_service_unavailable',
            username: 'proof_token_preseed_service_unavailable',
            displayName: '断服',
            playerId: 'proof_player_token_preseed_service_unavailable',
            playerName: 'proof token preseed service unavailable',
        };
/**
 * 记录token兼容调用次数。
 */
        let tokenCompatIdentityCalls = 0;
/**
 * 记录token认证服务。
 */
        const tokenAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
            validatePlayerToken: () => tokenPayload,
            resolvePlayerIdentityFromPayload: () => ({
                userId: tokenPayload.sub,
                username: tokenPayload.username,
                displayName: tokenPayload.displayName,
                playerId: tokenPayload.playerId,
                playerName: tokenPayload.playerName,
            }),
        }, {
            isEnabled: () => true,
            loadPlayerIdentity: async () => null,
            savePlayerIdentity: async (input) => input,
        }, {
            resolvePlayerIdentityForMigration: async () => {
                tokenCompatIdentityCalls += 1;
                return null;
            },
            loadPlayerSnapshotForMigration: async () => null,
        });
        (0, world_player_token_service_1.clearAuthTrace)();
/**
 * 记录tokenidentity。
 */
        const tokenIdentity = await tokenAuthService.authenticatePlayerToken('proof.token.preseed.snapshot_service_unavailable.token');
        if (tokenIdentity !== null) {
            throw new Error(`expected missing snapshot service on token preseed path to reject auth, got ${JSON.stringify(tokenIdentity)}`);
        }
        const tokenTrace = readLatestIdentityTrace(tokenPayload.playerId);
        if (tokenCompatIdentityCalls !== 0
            || tokenTrace.entry?.source !== 'token_preseed_blocked'
            || tokenTrace.entry?.persistedSource !== 'token_seed'
            || tokenTrace.entry?.persistFailureStage !== 'native_snapshot_service_unavailable'
            || tokenTrace.entry?.persistAttempted !== true
            || tokenTrace.entry?.persistSucceeded !== true
            || Number(tokenTrace.summary?.identity?.persistFailureStageCounts?.native_snapshot_service_unavailable ?? 0) < 1) {
            throw new Error(`expected token preseed missing snapshot service to produce stable blocked stage, got compatIdentityCalls=${tokenCompatIdentityCalls} trace=${JSON.stringify(tokenTrace)}`);
        }
/**
 * 记录legacypayload。
 */
        const legacyPayload = {
            sub: 'proof_user_legacy_preseed_service_unavailable',
            username: 'proof_legacy_preseed_service_unavailable',
            displayName: '旧断',
        };
/**
 * 记录legacy兼容调用次数。
 */
        let legacyCompatIdentityCalls = 0;
/**
 * 记录legacy认证服务。
 */
        const legacyAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
            validatePlayerToken: () => legacyPayload,
            resolvePlayerIdentityFromPayload: () => null,
        }, {
            isEnabled: () => true,
            loadPlayerIdentity: async () => null,
            savePlayerIdentity: async (input) => input,
        }, {
            resolvePlayerIdentityForMigration: async () => {
                legacyCompatIdentityCalls += 1;
                return {
                    userId: legacyPayload.sub,
                    username: legacyPayload.username,
                    displayName: legacyPayload.displayName,
                    playerId: 'proof_player_legacy_preseed_service_unavailable',
                    playerName: 'proof legacy preseed service unavailable',
                };
            },
            loadPlayerSnapshotForMigration: async () => null,
        });
        (0, world_player_token_service_1.clearAuthTrace)();
/**
 * 记录legacyidentity。
 */
        const legacyIdentity = await legacyAuthService.authenticatePlayerToken('proof.token.preseed.snapshot_service_unavailable.legacy');
        if (legacyIdentity !== null) {
            throw new Error(`expected missing snapshot service on legacy preseed path to reject auth, got ${JSON.stringify(legacyIdentity)}`);
        }
        const legacyTrace = readLatestIdentityTrace('proof_player_legacy_preseed_service_unavailable');
        if (legacyCompatIdentityCalls !== 0
            || legacyTrace.entry !== null
            || Number(legacyTrace.summary?.identity?.sourceCounts?.miss ?? 0) < 1
            || Number(legacyTrace.summary?.identity?.compatTriedCount ?? 0) !== 0
            || Number(legacyTrace.summary?.identity?.persistAttemptedCount ?? 0) !== 0) {
            throw new Error(`expected legacy preseed missing snapshot service to stay in native miss-only path, got compatIdentityCalls=${legacyCompatIdentityCalls} trace=${JSON.stringify(legacyTrace)}`);
        }
        return {
            tokenPreseedBlocked: {
                source: tokenTrace.entry?.source ?? null,
                persistedSource: tokenTrace.entry?.persistedSource ?? null,
                failureStage: tokenTrace.entry?.persistFailureStage ?? null,
            },
            legacyPreseedBlocked: {
                source: legacyTrace.entry?.source ?? null,
                persistedSource: legacyTrace.entry?.persistedSource ?? null,
                failureStage: legacyTrace.entry?.persistFailureStage ?? null,
            },
        };
    });
}
/**
 * 处理校验snapshotsequence。
 */
async function verifySnapshotSequence(token, playerId, firstAuthTrace, options = {}) {
    const includeMigrationProofs = options?.includeMigrationProofs !== false;
    if (!firstAuthTrace) {
        return null;
    }
/**
 * 记录firstsnapshot来源。
 */
    const firstSnapshotSource = firstAuthTrace.snapshotSource ?? null;
/**
 * 记录firstsnapshotpersisted来源。
 */
    const firstSnapshotPersistedSource = firstAuthTrace.snapshotPersistedSource ?? null;
    const firstSnapshotWasNativeNormalizedNext = firstSnapshotSource === 'next'
        && firstSnapshotPersistedSource === 'native';
    if (!firstSnapshotWasNativeNormalizedNext) {
        return {
            supported: false,
            reason: firstSnapshotSource === 'next'
                ? `first_snapshot_persisted_source=${firstSnapshotPersistedSource ?? 'unknown'}`
                : `first_snapshot_source=${firstSnapshotSource ?? 'unknown'}`,
            firstSnapshotSource,
            firstSnapshotPersistedSource,
        };
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await clearAuthTrace();
/**
 * 记录secondbootstrap。
 */
    const secondBootstrap = await runNextBootstrap(token);
    if (secondBootstrap.playerId !== playerId) {
        throw new Error(`next bootstrap second pass player mismatch: second=${secondBootstrap.playerId} first=${playerId}`);
    }
/**
 * 记录second认证trace。
 */
    const secondAuthTrace = await waitForAuthTrace(playerId, secondBootstrap.sessionId ?? null, {
        requireReject: false,
    });
    const secondIdentityIsLoadedNext = secondAuthTrace.identitySource === 'next'
        && (secondAuthTrace.identityPersistedSource === 'legacy_sync'
            || secondAuthTrace.identityPersistedSource === 'native');
    const secondIdentityIsTokenSeedBootstrap = secondAuthTrace.identitySource === 'token'
        && secondAuthTrace.identityPersistedSource === 'token_seed';
    if (DATABASE_ENABLED && !(secondIdentityIsLoadedNext || secondIdentityIsTokenSeedBootstrap)) {
        throw new Error(`expected second identity to be either loaded next/native|legacy_sync or token/token_seed, got source=${secondAuthTrace.identitySource ?? 'unknown'} persistedSource=${secondAuthTrace.identityPersistedSource ?? 'unknown'}`);
    }
    if (secondAuthTrace.snapshotSource !== 'next') {
        throw new Error(`expected second snapshot source to be next, got ${secondAuthTrace.snapshotSource ?? 'unknown'}`);
    }
    if (DATABASE_ENABLED && secondAuthTrace.snapshotPersistedSource !== 'native') {
        throw new Error(`expected second snapshot persisted source to be native, got ${secondAuthTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    if (!includeMigrationProofs) {
        return {
            supported: true,
            skipped: true,
            reason: 'profile_mainline_skips_migration',
            firstSnapshotNormalizedNative: true,
            firstSnapshotSource,
            firstSnapshotPersistedSource: firstAuthTrace.snapshotPersistedSource ?? null,
            firstIdentitySource: firstAuthTrace.identitySource ?? null,
            firstIdentityPersistedSource: firstAuthTrace.identityPersistedSource ?? null,
            secondIdentitySource: secondAuthTrace.identitySource ?? null,
            secondIdentityPersistedSource: secondAuthTrace.identityPersistedSource ?? null,
            secondSnapshotSource: secondAuthTrace.snapshotSource ?? null,
            secondSnapshotPersistedSource: secondAuthTrace.snapshotPersistedSource ?? null,
            secondSessionId: secondAuthTrace.bootstrapSessionId ?? null,
        };
    }
/**
 * 记录compatbackfillsavefailed。
 */
    const compatBackfillSaveFailed = DATABASE_ENABLED && !STRICT_NATIVE_IDENTITY_REQUIRED
        ? await verifyCompatBackfillSaveFailure(token, playerId)
        : (DATABASE_ENABLED ? buildStrictNativeSkippedProof('strict_native_identity_required') : null);
/**
 * 记录compatbackfillsavefailedmissingsnapshotrejected。
 */
    const compatBackfillSaveFailedMissingSnapshotRejected = DATABASE_ENABLED && !STRICT_NATIVE_IDENTITY_REQUIRED
        ? await verifyCompatBackfillSaveFailureMissingSnapshotRejection(token, playerId)
        : (DATABASE_ENABLED ? buildStrictNativeSkippedProof('strict_native_identity_required') : null);
/**
 * 记录compatidentitybackfillsnapshotpreseed。
 */
    const compatIdentityBackfillSnapshotPreseed = DATABASE_ENABLED && !STRICT_NATIVE_IDENTITY_REQUIRED
        ? await verifyCompatIdentityBackfillSnapshotPreseed(token, playerId)
        : (DATABASE_ENABLED ? buildStrictNativeSkippedProof('strict_native_identity_required') : null);
/**
 * 记录compatidentitybackfill原生starter快照。
 */
    const compatIdentityBackfillNativeStarterSnapshot = DATABASE_ENABLED && !STRICT_NATIVE_IDENTITY_REQUIRED
        ? await verifyCompatIdentityBackfillNativeStarterSnapshot(token, playerId)
        : (DATABASE_ENABLED ? buildStrictNativeSkippedProof('strict_native_identity_required') : null);
/**
 * 记录compatidentitybackfillsnapshotseedfailurerejected。
 */
    const compatIdentityBackfillSnapshotSeedFailureRejected = DATABASE_ENABLED && !STRICT_NATIVE_IDENTITY_REQUIRED
        ? await verifyCompatIdentityBackfillSnapshotSeedFailureRejection(token, playerId)
        : (DATABASE_ENABLED ? buildStrictNativeSkippedProof('strict_native_identity_required') : null);
/**
 * 记录invalidsnapshotmetapersisted来源normalized。
 */
    const invalidSnapshotMetaPersistedSourceNormalized = DATABASE_ENABLED
        ? await verifyInvalidPersistedSnapshotMetaPersistedSourceNormalization(token, playerId)
        : null;
/**
 * 记录invalidsnapshotunlocked地图idsnormalized。
 */
    const invalidSnapshotUnlockedMapIdsNormalized = DATABASE_ENABLED
        ? await verifyInvalidPersistedSnapshotUnlockedMapIdsNormalization(token, playerId)
        : null;
/**
 * 记录invalidsnapshotrejected。
 */
    const invalidSnapshotRejected = DATABASE_ENABLED
        ? await verifyInvalidPersistedSnapshotRejection(token, playerId)
        : null;
/**
 * 记录nextidentitycompatsnapshotignored。
 */
    const nextIdentityCompatSnapshotIgnored = DATABASE_ENABLED
        ? await verifyNextIdentityCompatSnapshotIgnored(token, playerId)
        : null;/**
 * 按 ID 组织nextidentityinvalidcompatignored映射。
 */

    const nextIdentityInvalidCompatMapIdIgnored = DATABASE_ENABLED
        ? await verifyNextIdentityInvalidCompatMapIdIgnored(token, playerId)
        : null;
/**
 * 记录nextidentityinvalidunlocked地图idsignored。
 */
    const nextIdentityInvalidUnlockedMapIdsIgnored = DATABASE_ENABLED
        ? await verifyNextIdentityInvalidUnlockedMapIdsIgnored(token, playerId)
        : null;
/**
 * 记录missingsnapshotrejected。
 */
    const missingSnapshotRejected = DATABASE_ENABLED
        ? await verifyMissingSnapshotRejection(token, playerId)
        : null;
/**
 * 记录invalididentityrejected。
 */
    const invalidIdentityRejected = DATABASE_ENABLED
        ? await verifyInvalidPersistedIdentityRejection(token)
        : null;
    return {
        supported: true,
        firstSnapshotNormalizedNative: true,
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
        compatIdentityBackfillNativeStarterSnapshot,
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
/**
 * 处理校验compatidentitybackfillsnapshotpreseed。
 */
async function verifyCompatIdentityBackfillSnapshotPreseed(token, playerId) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录tokenidentity。
 */
    const tokenIdentity = parseTokenIdentity(token);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-identity-backfill snapshot-preseed proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await ensureLegacyCompatPlayerSnapshotDocument(tokenIdentity);
    await dropPersistedIdentityDocument(userId);
    await dropPersistedPlayerSnapshot(playerId);
    await expectPersistedIdentityDocument(userId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    await clearAuthTrace();
/**
 * 记录bootstrap。
 */
    const bootstrap = await runNextBootstrap(token);
    if (bootstrap.playerId !== playerId) {
        throw new Error(`compat-identity-backfill snapshot-preseed player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
/**
 * 记录认证trace。
 */
    const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
        requireReject: false,
    });
    if (authTrace.identitySource !== 'migration_backfill') {
        throw new Error(`expected compat-identity-backfill snapshot-preseed identity source to be migration_backfill, got ${authTrace.identitySource ?? 'unknown'}`);
    }
    if (authTrace.snapshotSource !== 'next') {
        throw new Error(`expected compat-identity-backfill snapshot-preseed snapshot source to be next, got ${authTrace.snapshotSource ?? 'unknown'}`);
    }
    if (authTrace.snapshotPersistedSource !== 'native') {
        throw new Error(`expected compat-identity-backfill snapshot-preseed persisted source to be native, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    if (Array.isArray(bootstrap.noticeItems)
        && bootstrap.noticeItems.some((entry) => entry?.messageId === `snapshot_recovery:${playerId}:legacy_backfill`)) {
        throw new Error(`expected compat-identity-backfill snapshot-preseed to avoid recovery notice when compat snapshot already exists, got ${JSON.stringify(bootstrap.noticeItems)}`);
    }
    await expectPersistedIdentityDocument(userId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    return authTrace;
}
/**
 * 处理校验compatidentitybackfill原生startersnapshot。
 */
async function verifyCompatIdentityBackfillNativeStarterSnapshot(token, playerId) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录tokenidentity。
 */
    const tokenIdentity = parseTokenIdentity(token);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-identity-backfill native-starter snapshot proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await ensureLegacyCompatPlayerSnapshotDocument(tokenIdentity);
    await dropPersistedIdentityDocument(userId);
    await dropPlayerSnapshotSourcesButKeepIdentity(playerId);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, false);
    await expectPersistedIdentityDocument(userId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    await clearAuthTrace();
/**
 * 记录bootstrap。
 */
    const bootstrap = await runNextBootstrap(token, null, {
        expectedNoticeMessageId: `snapshot_recovery:${playerId}:token_seed`,
    });
    if (bootstrap.playerId !== playerId) {
        throw new Error(`compat-identity-backfill native-starter snapshot player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
/**
 * 记录认证trace。
 */
    const authTrace = await waitForAuthTrace(playerId, bootstrap.sessionId ?? null, {
        requireReject: false,
    });
    if (authTrace.identitySource !== 'token') {
        throw new Error(`expected compat-identity-backfill native-starter snapshot to fall back to token seed when compat snapshot is missing, got ${authTrace.identitySource ?? 'unknown'}`);
    }
    if (authTrace.identityPersistedSource !== 'token_seed') {
        throw new Error(`expected compat-identity-backfill native-starter snapshot identity persisted source to be token_seed, got ${authTrace.identityPersistedSource ?? 'unknown'}`);
    }
    if (authTrace.bootstrapIdentitySource !== 'next') {
        throw new Error(`expected compat-identity-backfill native-starter bootstrap trace to normalize identity source to next, got ${authTrace.bootstrapIdentitySource ?? 'unknown'}`);
    }
    if (authTrace.bootstrapIdentityPersistedSource !== 'native') {
        throw new Error(`expected compat-identity-backfill native-starter bootstrap trace to normalize identity persisted source to native, got ${authTrace.bootstrapIdentityPersistedSource ?? 'unknown'}`);
    }
    if (authTrace.bootstrapRecoveryIdentityPersistedSource !== 'token_seed') {
        throw new Error(`expected compat-identity-backfill native-starter bootstrap recovery identity persisted source to stay token_seed, got ${authTrace.bootstrapRecoveryIdentityPersistedSource ?? 'unknown'}`);
    }
    if (authTrace.snapshotSource !== 'next') {
        throw new Error(`expected compat-identity-backfill native-starter snapshot source to be next, got ${authTrace.snapshotSource ?? 'unknown'}`);
    }
    if (authTrace.snapshotPersistedSource !== 'native') {
        throw new Error(`expected compat-identity-backfill native-starter persisted source to be native, got ${authTrace.snapshotPersistedSource ?? 'unknown'}`);
    }
    await expectPersistedIdentityDocument(userId, true);
    await expectPersistedPlayerSnapshotDocument(playerId, true);
    const persistedIdentityPayload = await readPersistedIdentityPayload(userId, 'compat-identity-backfill native-starter snapshot proof');
    if (persistedIdentityPayload?.persistedSource !== 'native') {
        throw new Error(`expected compat-identity-backfill native-starter snapshot to promote persisted identity to native, got ${JSON.stringify(persistedIdentityPayload)}`);
    }
/**
 * 记录persistedpayload。
 */
    const persistedPayload = await readPersistedPlayerSnapshotPayload(playerId, 'compat-identity-backfill native-starter snapshot proof');
    if (!Array.isArray(persistedPayload?.inventory?.items) || persistedPayload.inventory.items.length < 1) {
        throw new Error(`expected compat-identity-backfill native-starter persisted snapshot to keep starter inventory, got ${JSON.stringify(persistedPayload?.inventory ?? null)}`);
    }
    await waitForPlayerState(playerId, true);
/**
 * 记录state。
 */
    const state = await fetchPlayerState(playerId);
/**
 * 记录runtimeitems。
 */
    const runtimeItems = Array.isArray(state?.player?.inventory?.items)
        ? state.player.inventory.items
        : [];
    if (runtimeItems.length < 1) {
        throw new Error(`expected compat-identity-backfill native-starter runtime inventory to keep starter items, got ${JSON.stringify(state?.player?.inventory ?? null)}`);
    }
    const recoveryNotice = Array.isArray(bootstrap.noticeItems)
        ? bootstrap.noticeItems.find((entry) => entry?.messageId === `snapshot_recovery:${playerId}:token_seed`)
        : null;
    if (!recoveryNotice
        || recoveryNotice.kind !== 'system'
        || recoveryNotice.persistUntilAck !== true
        || !String(recoveryNotice.text ?? '').includes('首次以 next 真源入场')) {
        throw new Error(`expected compat-identity-backfill native-starter bootstrap to emit persistent system recovery notice, got ${JSON.stringify(bootstrap.noticeItems ?? null)}`);
    }
    return {
        playerId,
        identitySource: authTrace.identitySource ?? null,
        identityPersistedSource: authTrace.identityPersistedSource ?? null,
        bootstrapIdentitySource: authTrace.bootstrapIdentitySource ?? null,
        bootstrapIdentityPersistedSource: authTrace.bootstrapIdentityPersistedSource ?? null,
        bootstrapRecoveryIdentityPersistedSource: authTrace.bootstrapRecoveryIdentityPersistedSource ?? null,
        snapshotSource: authTrace.snapshotSource ?? null,
        snapshotPersistedSource: authTrace.snapshotPersistedSource ?? null,
        persistedIdentitySource: persistedIdentityPayload?.persistedSource ?? null,
        starterInventoryCount: runtimeItems.length,
        bootstrapSessionId: bootstrap.sessionId ?? null,
        recoveryNoticeKind: recoveryNotice.kind ?? null,
        recoveryNoticePersistUntilAck: recoveryNotice.persistUntilAck === true,
    };
}
/**
 * 处理校验compatidentitybackfillsnapshotseedfailurerejection。
 */
async function verifyCompatIdentityBackfillSnapshotSeedFailureRejection(token, playerId) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录tokenidentity。
 */
    const tokenIdentity = parseTokenIdentity(token);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-identity-backfill snapshot-seed-failure rejection proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await ensureLegacyCompatPlayerSnapshotDocument(tokenIdentity);
    await dropPersistedIdentityDocument(userId);
    await dropPersistedPlayerSnapshot(playerId);
    await expectPersistedIdentityDocument(userId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
/**
 * 记录injection。
 */
    const injection = await installSnapshotSeedSaveFailure(playerId);
    try {
        await clearAuthTrace();
        await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
        const failureAuthTrace = await waitForFailedIdentitySourceAuthTrace(userId, playerId, 'migration_preseed_blocked');
        if (failureAuthTrace.identityPersistFailureStage !== 'compat_snapshot_legacy_seed_failed') {
            throw new Error(`expected compat-identity-backfill snapshot-seed-failure rejection stage to be compat_snapshot_legacy_seed_failed, got ${failureAuthTrace.identityPersistFailureStage ?? 'unknown'}`);
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
/**
 * 处理校验missingsnapshotrejection。
 */
async function verifyMissingSnapshotRejection(token, playerId) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录userID。
 */
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
/**
 * 记录failure认证trace。
 */
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
/**
 * 处理校验nextidentityinvalidunlocked地图idsignored。
 */
async function verifyNextIdentityInvalidUnlockedMapIdsIgnored(token, playerId) {
/**
 * 记录persistedidentity。
 */
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for next-identity-invalid-unlockedMapIds ignored proof: ${JSON.stringify(parseJwtPayload(token))}`);
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
    await writeInvalidLegacyCompatUnlockedMinimapIds(playerId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
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
/**
 * 处理校验nextidentityinvalidcompat地图IDignored。
 */
async function verifyNextIdentityInvalidCompatMapIdIgnored(token, playerId) {
/**
 * 记录persistedidentity。
 */
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for next-identity-invalid-compat-mapId ignored proof: ${JSON.stringify(parseJwtPayload(token))}`);
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
    await writeInvalidLegacyCompatMapId(playerId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
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
/**
 * 处理校验compatbackfillsavefailure。
 */
async function verifyCompatBackfillSaveFailure(token, playerId) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录tokenidentity。
 */
    const tokenIdentity = parseTokenIdentity(token);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-backfill-save-failed proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await ensureLegacyCompatPlayerSnapshotDocument(tokenIdentity);
    await dropPersistedIdentityDocument(userId);
    await expectPersistedIdentityDocument(userId, false);
/**
 * 记录injection。
 */
    const injection = await installIdentityBackfillSaveFailure(userId);
    try {
        await clearAuthTrace();
        await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
        const failureAuthTrace = await waitForFailedIdentitySourceAuthTrace(userId, playerId, 'migration_persist_blocked');
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
/**
 * 处理校验compatbackfillsavefailuremissingsnapshotrejection。
 */
async function verifyCompatBackfillSaveFailureMissingSnapshotRejection(token, playerId) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录tokenidentity。
 */
    const tokenIdentity = parseTokenIdentity(token);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
        throw new Error(`next auth token missing sub for compat-backfill-save-failed snapshot-miss proof: ${JSON.stringify(payload)}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await seedLegacyCompatPlayerSnapshot(tokenIdentity);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, true);
    await dropPersistedIdentityDocument(userId);
    await expectPersistedIdentityDocument(userId, false);
    await dropPlayerSnapshotSourcesButKeepIdentity(playerId);
    await expectLegacyCompatPlayerSnapshotDocument(playerId, false);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
/**
 * 记录injection。
 */
    const injection = await installIdentityBackfillSaveFailure(userId);
    try {
        await clearAuthTrace();
        await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
        const failureAuthTrace = await waitForFailedIdentitySourceAuthTrace(userId, playerId, 'token_persist_blocked');
        if (failureAuthTrace.identityPersistAttempted !== true) {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss to attempt persistence, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.identityPersistSucceeded !== false) {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss persistence result to be false, got ${JSON.stringify(failureAuthTrace)}`);
        }
        if (failureAuthTrace.identityPersistFailureStage !== 'token_seed_save_failed') {
            throw new Error(`expected compat-backfill-save-failed snapshot-miss stage to be token_seed_save_failed, got ${failureAuthTrace.identityPersistFailureStage ?? 'unknown'}`);
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
/**
 * 处理校验nextidentitycompatsnapshotignored。
 */
async function verifyNextIdentityCompatSnapshotIgnored(token, playerId) {
/**
 * 记录persistedidentity。
 */
    const persistedIdentity = parseTokenIdentity(token);
    if (!persistedIdentity?.userId) {
        throw new Error(`next auth token missing persisted identity fields for next-identity-compat-snapshot-ignored proof: ${JSON.stringify(parseJwtPayload(token))}`);
    }
    await delay(300);
    await flushPersistence();
    await deletePlayer(playerId);
    await waitForPlayerState(playerId, false);
    await ensureLegacyCompatPlayerSnapshotDocument(persistedIdentity);
    await writePersistedIdentityDocument(persistedIdentity);
    await expectPersistedIdentityDocument(persistedIdentity.userId, true);
    await dropPersistedPlayerSnapshot(playerId);
    await expectPersistedPlayerSnapshotDocument(playerId, false);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
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
/**
 * 处理校验invalidpersistedsnapshotrejection。
 */
async function verifyInvalidPersistedSnapshotRejection(token, playerId) {
/**
 * 记录persistedidentity。
 */
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
    await ensurePersistedPlayerSnapshotDocument(playerId, 'native');
    await writeInvalidPersistedSnapshotDocument(playerId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
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
/**
 * 处理校验invalidpersistedsnapshotmetapersisted来源normalization。
 */
async function verifyInvalidPersistedSnapshotMetaPersistedSourceNormalization(token, playerId) {
/**
 * 记录persistedidentity。
 */
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
    await ensurePersistedPlayerSnapshotDocument(playerId, 'native');
    await writeInvalidPersistedSnapshotMetaPersistedSource(playerId);
    await clearAuthTrace();
/**
 * 记录bootstrap。
 */
    const bootstrap = await runNextBootstrap(token);
    if (bootstrap.playerId !== playerId) {
        throw new Error(`invalid-snapshot-meta normalization bootstrap player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
/**
 * 记录认证trace。
 */
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
/**
 * 处理校验invalidpersistedsnapshotunlocked地图idsnormalization。
 */
async function verifyInvalidPersistedSnapshotUnlockedMapIdsNormalization(token, playerId) {
/**
 * 记录persistedidentity。
 */
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
    await ensurePersistedPlayerSnapshotDocument(playerId, 'native');
    await writeInvalidPersistedSnapshotUnlockedMapIds(playerId);
    await clearAuthTrace();
/**
 * 记录bootstrap。
 */
    const bootstrap = await runNextBootstrap(token);
    if (bootstrap.playerId !== playerId) {
        throw new Error(`invalid-snapshot-unlockedMapIds normalization bootstrap player mismatch: expected=${playerId} actual=${bootstrap.playerId}`);
    }
/**
 * 记录认证trace。
 */
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
/**
 * 记录状态。
 */
    const state = await fetchPlayerState(playerId);
/**
 * 记录运行态unlocked地图ids。
 */
    const runtimeUnlockedMapIds = state?.player?.unlockedMapIds;
    if (!Array.isArray(runtimeUnlockedMapIds)) {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization to expose runtime array unlockedMapIds, got ${JSON.stringify(runtimeUnlockedMapIds)}`);
    }
    if (runtimeUnlockedMapIds.length !== 0) {
        throw new Error(`expected invalid-snapshot-unlockedMapIds normalization to clear runtime unlockedMapIds, got ${JSON.stringify(runtimeUnlockedMapIds)}`);
    }
    return authTrace;
}
/**
 * 处理校验invalidpersistedidentityrejection。
 */
async function verifyInvalidPersistedIdentityRejection(token) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录userID。
 */
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/**
 * 记录玩家ID。
 */
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
    if (!userId || !playerId) {
        throw new Error(`next auth token missing identity fields for invalid-identity rejection proof: ${JSON.stringify(payload)}`);
    }
    await writeInvalidPersistedIdentityDocument(userId);
    await clearAuthTrace();
    await expectNextSocketAuthFailure(token, 'AUTH_FAIL');
/**
 * 记录failure认证trace。
 */
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
/**
 * 处理registerandlogin玩家。
 */
async function registerAndLoginPlayer(accountSuffix, displayName, roleName) {
/**
 * 记录account名称。
 */
    let accountName = `acct_${accountSuffix}`;
/**
 * 记录password。
 */
    const password = `Pass_${accountSuffix}`;
    let currentDisplayName = displayName;
    let currentRoleName = roleName;
    let registered = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            await requestJson('/api/auth/register', {
                method: 'POST',
                body: {
                    accountName,
                    password,
                    displayName: currentDisplayName,
                    roleName: currentRoleName,
                },
            });
            registered = true;
            break;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const conflictMessage = /已存在|already exists|duplicate/i.test(message);
            if (!conflictMessage || attempt >= 3) {
                throw error;
            }
            const retrySuffix = `${suffix.slice(-4)}${attempt}`.slice(0, 5);
            accountName = `acct_${accountSuffix}_${attempt}`;
            currentDisplayName = buildRetryDisplayName(displayName, retrySuffix, attempt + 1);
            currentRoleName = buildRetryRoleName(roleName, retrySuffix);
        }
    }
    if (!registered) {
        throw new Error(`failed to register next-auth smoke player after retries: accountSuffix=${accountSuffix}`);
    }
/**
 * 记录login。
 */
    const login = await requestJson('/api/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
/**
 * 记录access令牌。
 */
    const accessToken = typeof login?.accessToken === 'string' ? login.accessToken : '';
/**
 * 记录refresh令牌。
 */
    const refreshToken = typeof login?.refreshToken === 'string' ? login.refreshToken : '';
    if (!accessToken || !refreshToken) {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
/**
 * 记录payload。
 */
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
/**
 * 解析令牌identity。
 */
function parseTokenIdentity(token) {
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录玩家ID。
 */
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
/**
 * 记录玩家名称。
 */
    const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
    return {
        userId: typeof payload?.sub === 'string' ? payload.sub.trim() : '',
        username: typeof payload?.username === 'string' ? payload.username.trim() : '',
        displayName: typeof payload?.displayName === 'string' ? payload.displayName.trim() : '',
        playerId,
        playerName,
    };
}
/**
 * 断言bootstrapmatchesexpectedidentity。
 */
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
/**
 * 处理fetch玩家状态。
 */
async function fetchPlayerState(playerId) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerId) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 刷新持久化。
 */
async function flushPersistence() {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/persistence/flush`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`request failed: POST /runtime/persistence/flush: ${response.status} ${await response.text()}`);
    }
}
/**
 * 处理fetch认证trace。
 */
async function fetchAuthTrace() {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/auth-trace`);
    if (!response.ok) {
        throw new Error(`request failed: /runtime/auth-trace: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理clear认证trace。
 */
async function clearAuthTrace() {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/auth-trace`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: DELETE /runtime/auth-trace: ${response.status} ${await response.text()}`);
    }
}
/**
 * 等待forfailedsnapshot认证trace。
 */
async function waitForFailedSnapshotAuthTrace(playerId, expectedSnapshotSource) {
/**
 * 记录trace。
 */
    const trace = await waitForValue(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchAuthTrace();
/**
 * 记录trace。
 */
        const trace = payload?.trace;
        if (!trace?.enabled || !Array.isArray(trace.records)) {
            throw new Error(`unexpected auth trace payload: ${JSON.stringify(payload)}`);
        }
/**
 * 记录accept索引。
 */
        const acceptIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
/**
 * 记录identity索引。
 */
        const identityIndex = trace.records.findIndex((entry) => entry?.type === 'identity' && entry?.playerId === playerId);
/**
 * 记录snapshot索引。
 */
        const snapshotIndex = trace.records.findIndex((entry) => entry?.type === 'snapshot'
            && entry?.playerId === playerId
            && entry?.source === expectedSnapshotSource);
/**
 * 记录bootstrap索引。
 */
        const bootstrapIndex = trace.records.findIndex((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
        if (!(acceptIndex >= 0
            && identityIndex > acceptIndex
            && snapshotIndex > identityIndex
            && bootstrapIndex < 0)) {
            return null;
        }
        return trace;
    }, 5000, 'nextAuthTraceFailure');
/**
 * 记录identity。
 */
    const identity = trace.records.find((entry) => entry?.type === 'identity' && entry?.playerId === playerId);
/**
 * 记录snapshot。
 */
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
/**
 * 等待forfailedidentity认证trace。
 */
async function waitForFailedIdentityAuthTrace(userId, playerId) {
    return waitForFailedIdentitySourceAuthTrace(userId, playerId, 'next_invalid');
}
/**
 * 等待forfailedidentity来源认证trace。
 */
async function waitForFailedIdentitySourceAuthTrace(userId, playerId, expectedSource) {
/**
 * 记录trace。
 */
    const trace = await waitForValue(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchAuthTrace();
/**
 * 记录trace。
 */
        const trace = payload?.trace;
        if (!trace?.enabled || !Array.isArray(trace.records)) {
            throw new Error(`unexpected auth trace payload: ${JSON.stringify(payload)}`);
        }
        let identityIndex = -1;
        for (let index = trace.records.length - 1; index >= 0; index -= 1) {
            const entry = trace.records[index];
            if (entry?.type === 'identity'
                && entry?.userId === userId
                && entry?.playerId === playerId
                && entry?.source === expectedSource) {
                identityIndex = index;
                break;
            }
        }
        if (identityIndex < 0) {
            return null;
        }
        const acceptIndex = trace.records.findIndex((entry, index) => index < identityIndex
            && entry?.type === 'token'
            && entry?.outcome === 'accept');
        const hasSnapshotAfterIdentity = trace.records.some((entry, index) => index > identityIndex
            && entry?.type === 'snapshot'
            && entry?.playerId === playerId);
        const hasBootstrapAfterIdentity = trace.records.some((entry, index) => index > identityIndex
            && entry?.type === 'bootstrap'
            && entry?.playerId === playerId);
        if (!(acceptIndex >= 0
            && !hasSnapshotAfterIdentity
            && !hasBootstrapAfterIdentity)) {
            return null;
        }
        return trace;
    }, 5000, 'nextAuthTraceIdentityFailure');
/**
 * 记录identity。
 */
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
/**
 * 读取汇总数量。
 */
function readSummaryCount(bucket, key) {
/**
 * 记录normalizedkey。
 */
    const normalizedKey = typeof key === 'string' && key ? key : 'unknown';
/**
 * 记录价值。
 */
    const value = bucket?.[normalizedKey];
    return Number.isFinite(value) ? Number(value) : 0;
}
/**
 * 轮询认证追踪接口，等待指定玩家的认证记录落出。
 */
async function waitForAuthTrace(playerId, sessionId, options = undefined) {
/**
 * 记录requirereject。
 */
    const requireReject = options?.requireReject !== false;
/**
 * 记录trace。
 */
    const trace = await waitForValue(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchAuthTrace();
/**
 * 记录trace。
 */
        const trace = payload?.trace;
        if (!trace?.enabled || !Array.isArray(trace.records)) {
            throw new Error(`unexpected auth trace payload: ${JSON.stringify(payload)}`);
        }
/**
 * 记录reject索引。
 */
        const rejectIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'reject');
/**
 * 记录accept索引。
 */
        const acceptIndex = trace.records.findIndex((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
/**
 * 记录identity索引。
 */
        const identityIndex = trace.records.findIndex((entry) => entry?.type === 'identity'
            && entry?.playerId === playerId
            && (entry?.source === 'next'
                || entry?.source === 'token'
                || entry?.source === 'token_runtime'
                || entry?.source === 'legacy_runtime'
                || entry?.source === 'migration_backfill'));
/**
 * 记录snapshot索引。
 */
        const snapshotIndex = trace.records.findIndex((entry) => entry?.type === 'snapshot'
            && entry?.playerId === playerId
            && (entry?.source === 'next'
                || entry?.source === 'legacy_runtime'
                || entry?.source === 'legacy_seeded'
                || entry?.source === 'miss'));
/**
 * 记录bootstrap索引。
 */
        const bootstrapIndex = trace.records.findIndex((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
/**
 * 记录令牌ordering就绪状态。
 */
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
/**
 * 记录reject。
 */
    const reject = trace.records.find((entry) => entry?.type === 'token' && entry?.outcome === 'reject');
/**
 * 记录accept。
 */
    const accept = trace.records.find((entry) => entry?.type === 'token' && entry?.outcome === 'accept');
/**
 * 记录identity。
 */
    const identity = trace.records.find((entry) => entry?.type === 'identity' && entry?.playerId === playerId);
/**
 * 记录snapshot。
 */
    const snapshot = trace.records.find((entry) => entry?.type === 'snapshot' && entry?.playerId === playerId);
/**
 * 记录bootstrap。
 */
    const bootstrap = trace.records.find((entry) => entry?.type === 'bootstrap' && entry?.playerId === playerId);
/**
 * 记录snapshotrecovery。
 */
    const snapshotRecovery = trace.records
        .filter((entry) => entry?.type === 'snapshot_recovery' && entry?.playerId === playerId)
        .slice(-1)[0] ?? null;
/**
 * 记录汇总。
 */
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
            || !summary.bootstrap.identityPersistedSourceCounts
            || typeof summary.bootstrap.identityPersistedSourceCounts !== 'object'
            || !summary.bootstrap.snapshotSourceCounts
            || typeof summary.bootstrap.snapshotSourceCounts !== 'object'
            || !summary.bootstrap.snapshotPersistedSourceCounts
            || typeof summary.bootstrap.snapshotPersistedSourceCounts !== 'object'
            || !summary.bootstrap.linkedSourceCounts
            || typeof summary.bootstrap.linkedSourceCounts !== 'object'
            || !summary.bootstrap.linkedPersistedSourceCounts
            || typeof summary.bootstrap.linkedPersistedSourceCounts !== 'object'
            || !summary.bootstrap.recoveryOutcomeCounts
        || typeof summary.bootstrap.recoveryOutcomeCounts !== 'object'
        || !summary.bootstrap.recoveryReasonCounts
        || typeof summary.bootstrap.recoveryReasonCounts !== 'object'
        || !summary.bootstrap.recoveryIdentityPersistedSourceCounts
        || typeof summary.bootstrap.recoveryIdentityPersistedSourceCounts !== 'object'
        || !summary.bootstrap.recoverySnapshotPersistedSourceCounts
        || typeof summary.bootstrap.recoverySnapshotPersistedSourceCounts !== 'object') {
        throw new Error(`unexpected auth trace summary payload: ${JSON.stringify(trace)}`);
    }
    if (typeof sessionId === 'string' && sessionId && bootstrap.sessionId !== sessionId) {
        throw new Error(`auth trace bootstrap session mismatch: trace=${bootstrap.sessionId ?? ''} expected=${sessionId}`);
    }
    if (identity.source === 'next' && identity.nextLoadHit !== true) {
        throw new Error(`identity trace inconsistent: source=next requires nextLoadHit=true, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'migration_backfill'
        && !(identity.persistenceEnabled === true
            && identity.persistAttempted === true
            && identity.persistSucceeded === true)) {
        throw new Error(`identity trace inconsistent: source=migration_backfill requires successful persistence, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'token') {
        const tokenFreshSeed = identity.persistenceEnabled === true
            && identity.persistAttempted === true
            && identity.persistSucceeded === true
            && identity.nextLoadHit !== true
            && identity.compatTried === false;
        const tokenLoadHit = identity.persistenceEnabled === true
            && identity.nextLoadHit === true
            && identity.persistAttempted === false
            && identity.persistSucceeded == null
            && identity.compatTried === false;
        if (!(tokenFreshSeed || tokenLoadHit)) {
            throw new Error(`identity trace inconsistent: source=token requires either fresh token seed persistence or token_seed load-hit without compat lookup, got ${JSON.stringify(identity)}`);
        }
    }
    if (identity.source === 'token_runtime'
        && !(identity.persistenceEnabled === false
            && identity.persistAttempted === false
            && identity.compatTried === false)) {
        throw new Error(`identity trace inconsistent: source=token_runtime requires no persistence and no compat lookup, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'legacy_runtime' && identity.persistSucceeded === true) {
        throw new Error(`identity trace inconsistent: source=legacy_runtime cannot report persistSucceeded=true, got ${JSON.stringify(identity)}`);
    }
    if ((identity.source === 'next' || identity.source === 'token') && typeof identity.persistedSource !== 'string') {
        throw new Error(`identity trace inconsistent: source=${identity.source} requires persistedSource, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'token' && identity.persistedSource !== 'token_seed') {
        throw new Error(`identity trace inconsistent: source=token requires persistedSource=token_seed, got ${JSON.stringify(identity)}`);
    }
    if (identity.source === 'migration_backfill' && identity.persistedSource !== 'legacy_backfill') {
        throw new Error(`identity trace inconsistent: source=migration_backfill requires persistedSource=legacy_backfill, got ${JSON.stringify(identity)}`);
    }
    if (readSummaryCount(summary.bootstrap.entryPathCounts, bootstrap.entryPath) < 1) {
        throw new Error(`auth trace summary missing bootstrap entry path count: ${JSON.stringify(summary)}`);
    }
    if (readSummaryCount(summary.bootstrap.identitySourceCounts, bootstrap.identitySource) < 1) {
        throw new Error(`auth trace summary missing bootstrap identity source count: ${JSON.stringify(summary)}`);
    }
/**
 * 记录linked来源key。
 */
    const linkedSourceKey = `${bootstrap.identitySource ?? identity.source ?? 'unknown'}|${snapshot.source ?? 'unknown'}`;
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
        snapshotRecoveryOutcome: typeof snapshotRecovery?.outcome === 'string' ? snapshotRecovery.outcome : null,
        snapshotRecoveryReason: typeof snapshotRecovery?.reason === 'string' ? snapshotRecovery.reason : null,
        snapshotRecoveryPersistedSource: typeof snapshotRecovery?.persistedSource === 'string' ? snapshotRecovery.persistedSource : null,
        snapshotRecoveryIdentityPersistedSource: typeof snapshotRecovery?.identityPersistedSource === 'string'
            ? snapshotRecovery.identityPersistedSource
            : null,
        snapshotRecoveryFailureStage: typeof snapshotRecovery?.failureStage === 'string' ? snapshotRecovery.failureStage : null,
        snapshotFallbackReason: typeof snapshot.fallbackReason === 'string' ? snapshot.fallbackReason : null,
        snapshotSeedPersisted: snapshot.seedPersisted === true,
        traceSummarySnapshotFallbackReasonCounts: summary.snapshot.fallbackReasonCounts ?? {},
        traceSummarySnapshotRecoveryCount: Number(summary.snapshotRecovery?.count ?? 0),
        traceSummarySnapshotRecoverySuccessCount: Number(summary.snapshotRecovery?.successCount ?? 0),
        traceSummarySnapshotRecoveryBlockedCount: Number(summary.snapshotRecovery?.blockedCount ?? 0),
        traceSummarySnapshotRecoveryFailedCount: Number(summary.snapshotRecovery?.failedCount ?? 0),
        bootstrapSessionId: bootstrap.sessionId ?? null,
        bootstrapProtocol: bootstrap.protocol ?? null,
        bootstrapEntryPath: bootstrap.entryPath ?? null,
        bootstrapIdentitySource: bootstrap.identitySource ?? null,
        bootstrapIdentityPersistedSource: typeof bootstrap.identityPersistedSource === 'string' ? bootstrap.identityPersistedSource : null,
        bootstrapSnapshotSource: typeof bootstrap.snapshotSource === 'string' ? bootstrap.snapshotSource : null,
        bootstrapSnapshotPersistedSource: typeof bootstrap.snapshotPersistedSource === 'string' ? bootstrap.snapshotPersistedSource : null,
        bootstrapLinkedIdentitySource: typeof bootstrap.linkedIdentitySource === 'string' ? bootstrap.linkedIdentitySource : null,
        bootstrapLinkedSnapshotSource: typeof bootstrap.linkedSnapshotSource === 'string' ? bootstrap.linkedSnapshotSource : null,
        bootstrapLinkedSnapshotPersistedSource: typeof bootstrap.linkedSnapshotPersistedSource === 'string' ? bootstrap.linkedSnapshotPersistedSource : null,
        bootstrapRecoveryOutcome: typeof bootstrap.recoveryOutcome === 'string' ? bootstrap.recoveryOutcome : null,
        bootstrapRecoveryReason: typeof bootstrap.recoveryReason === 'string' ? bootstrap.recoveryReason : null,
        bootstrapRecoveryIdentityPersistedSource: typeof bootstrap.recoveryIdentityPersistedSource === 'string' ? bootstrap.recoveryIdentityPersistedSource : null,
        bootstrapRecoverySnapshotPersistedSource: typeof bootstrap.recoverySnapshotPersistedSource === 'string' ? bootstrap.recoverySnapshotPersistedSource : null,
        traceSummaryBootstrapRequestedSessionCount: Number(summary.bootstrap.requestedSessionCount ?? 0),
        traceSummaryBootstrapEntryPathCount: readSummaryCount(summary.bootstrap.entryPathCounts, bootstrap.entryPath),
        traceSummaryBootstrapIdentitySourceCount: readSummaryCount(summary.bootstrap.identitySourceCounts, bootstrap.identitySource),
        traceSummaryBootstrapIdentityPersistedSourceCounts: summary.bootstrap.identityPersistedSourceCounts,
        traceSummaryBootstrapSnapshotSourceCounts: summary.bootstrap.snapshotSourceCounts,
        traceSummaryBootstrapSnapshotPersistedSourceCounts: summary.bootstrap.snapshotPersistedSourceCounts,
        traceSummaryBootstrapLinkedSourceCount: readSummaryCount(summary.bootstrap.linkedSourceCounts, linkedSourceKey),
        traceSummaryBootstrapLinkedSourceCounts: summary.bootstrap.linkedSourceCounts,
        traceSummaryBootstrapLinkedPersistedSourceCounts: summary.bootstrap.linkedPersistedSourceCounts,
        traceSummaryBootstrapRecoveryOutcomeCounts: summary.bootstrap.recoveryOutcomeCounts,
        traceSummaryBootstrapRecoveryReasonCounts: summary.bootstrap.recoveryReasonCounts,
        traceSummaryBootstrapRecoveryIdentityPersistedSourceCounts: summary.bootstrap.recoveryIdentityPersistedSourceCounts,
        traceSummaryBootstrapRecoverySnapshotPersistedSourceCounts: summary.bootstrap.recoverySnapshotPersistedSourceCounts,
    };
}
/**
 * 确保legacycompatschema。
 */
async function ensureLegacyCompatSchema() {
/**
 * 记录pool。
 */
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
        "totalOnlineSeconds" bigint NOT NULL DEFAULT 0,
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
        foundation bigint NOT NULL DEFAULT 0,
        "combatExp" bigint NOT NULL DEFAULT 0,
        "playerKillCount" bigint NOT NULL DEFAULT 0,
        "monsterKillCount" bigint NOT NULL DEFAULT 0,
        "eliteMonsterKillCount" bigint NOT NULL DEFAULT 0,
        "bossMonsterKillCount" bigint NOT NULL DEFAULT 0,
        "deathCount" bigint NOT NULL DEFAULT 0,
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
/**
 * 处理seedlegacycompat玩家snapshot。
 */
async function seedLegacyCompatPlayerSnapshot(identity) {
    if (!identity?.userId || !identity.playerId || !identity.playerName) {
        throw new Error(`invalid identity for legacy compat seed: ${JSON.stringify(identity)}`);
    }
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        const normalizedUsername = typeof identity.username === 'string' && identity.username.trim()
            ? identity.username.trim()
            : `legacy_${identity.userId}`;
        const normalizedDisplayName = typeof identity.displayName === 'string' && identity.displayName.trim()
            ? identity.displayName.trim()
            : identity.playerName;
        await pool.query(`
      INSERT INTO users(
        id,
        username,
        "displayName",
        "passwordHash"
      )
      VALUES ($1::uuid, $2, $3, 'legacy-compat-seed')
      ON CONFLICT (id)
      DO UPDATE SET
        username = EXCLUDED.username,
        "displayName" = EXCLUDED."displayName"
    `, [identity.userId, normalizedUsername, normalizedDisplayName]);
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
/**
 * 处理haslegacycompat玩家snapshot文档。
 */
async function hasLegacyCompatPlayerSnapshotDocument(playerId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('SELECT 1 FROM players WHERE id = $1 LIMIT 1', [playerId]).catch(ignoreMissingCompatCleanupError);
        return Array.isArray(result?.rows) && result.rows.length > 0;
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理ensurelegacycompat玩家snapshot文档。
 */
async function ensureLegacyCompatPlayerSnapshotDocument(identity) {
    await seedLegacyCompatPlayerSnapshot(identity);
    const seeded = await waitForValue(async () => {
        const exists = await hasLegacyCompatPlayerSnapshotDocument(identity.playerId);
        return exists ? true : null;
    }, 3000, `legacyCompatPlayerSnapshot:${identity.playerId}`);
    if (seeded !== true) {
        throw new Error(`expected seeded legacy compat player snapshot to become visible for playerId=${identity.playerId}`);
    }
}
/**
 * 处理drop玩家snapshotsourcesbutkeepidentity。
 */
async function dropPlayerSnapshotSourcesButKeepIdentity(playerId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM server_next_player_snapshot WHERE player_id = $1', [playerId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM players WHERE id = $1', [playerId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理droppersisted玩家snapshot。
 */
async function dropPersistedPlayerSnapshot(playerId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM server_next_player_snapshot WHERE player_id = $1', [playerId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理droppersistedidentity文档。
 */
async function dropPersistedIdentityDocument(userId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM server_next_player_identity WHERE user_id = $1', [userId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理expectlegacycompat玩家snapshot文档。
 */
async function expectLegacyCompatPlayerSnapshotDocument(playerId, shouldExist) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('SELECT 1 FROM players WHERE id = $1 LIMIT 1', [playerId]).catch(ignoreMissingCompatCleanupError);
/**
 * 记录exists。
 */
        const exists = Array.isArray(result?.rows) && result.rows.length > 0;
        if (exists !== shouldExist) {
            throw new Error(`expected compat player snapshot shouldExist=${shouldExist} for playerId=${playerId}, got exists=${exists}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理expectpersisted玩家snapshot文档。
 */
async function expectPersistedPlayerSnapshotDocument(playerId, shouldExist) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('SELECT 1 FROM server_next_player_snapshot WHERE player_id = $1 LIMIT 1', [playerId]).catch(ignoreMissingCompatCleanupError);
/**
 * 记录exists。
 */
        const exists = Array.isArray(result?.rows) && result.rows.length > 0;
        if (exists !== shouldExist) {
            throw new Error(`expected persisted snapshot document shouldExist=${shouldExist} for playerId=${playerId}, got exists=${exists}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理expectpersistedidentity文档。
 */
async function expectPersistedIdentityDocument(userId, shouldExist) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('SELECT 1 FROM server_next_player_identity WHERE user_id = $1 LIMIT 1', [userId]).catch(ignoreMissingCompatCleanupError);
/**
 * 记录exists。
 */
        const exists = Array.isArray(result?.rows) && result.rows.length > 0;
        if (exists !== shouldExist) {
            throw new Error(`expected persisted identity document shouldExist=${shouldExist} for userId=${userId}, got exists=${exists}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 读取persisted玩家snapshotpayload。
 */
async function readPersistedPlayerSnapshotPayload(playerId, errorContext) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('SELECT payload FROM server_next_player_snapshot WHERE player_id = $1 LIMIT 1', [playerId]).catch(ignoreMissingCompatCleanupError);
/**
 * 记录payload。
 */
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
async function readPersistedIdentityPayload(userId, errorContext) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('SELECT payload FROM server_next_player_identity WHERE user_id = $1 LIMIT 1', [userId]).catch(ignoreMissingCompatCleanupError);
/**
 * 记录payload。
 */
        const payload = result?.rows?.[0]?.payload;
        if (!payload || typeof payload !== 'object') {
            throw new Error(`missing persisted identity payload for ${errorContext}: userId=${userId}`);
        }
        return payload;
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入invalidpersistedidentity文档。
 */
async function writeInvalidPersistedIdentityDocument(userId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const invalidUsername = `broken_${normalizedUserId.slice(0, 8) || 'user'}`;
    const invalidPlayerId = `p_invalid_${normalizedUserId.slice(0, 16) || 'player'}`;
    try {
        await pool.query(`
      INSERT INTO server_next_player_identity(
        user_id,
        username,
        player_id,
        display_name,
        player_name,
        persisted_source,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        player_id = EXCLUDED.player_id,
        display_name = EXCLUDED.display_name,
        player_name = EXCLUDED.player_name,
        persisted_source = EXCLUDED.persisted_source,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [normalizedUserId, invalidUsername, invalidPlayerId, invalidUsername, invalidUsername, 'native', JSON.stringify({
            version: 1,
            userId: normalizedUserId,
            username: invalidUsername,
            playerId: invalidPlayerId,
            playerName: invalidUsername,
            persistedSource: 'native',
            updatedAt: Date.now(),
        })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入invalidpersistedsnapshot文档。
 */
async function writeInvalidPersistedSnapshotDocument(playerId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    const savedAt = Date.now();
    try {
        await pool.query(`
      INSERT INTO server_next_player_snapshot(
        player_id,
        template_id,
        persisted_source,
        seeded_at,
        saved_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, now(), $6::jsonb)
      ON CONFLICT (player_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        persisted_source = EXCLUDED.persisted_source,
        seeded_at = EXCLUDED.seeded_at,
        saved_at = EXCLUDED.saved_at,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [playerId, 'yunlai_town', 'native', null, savedAt, JSON.stringify({
            version: 1,
            savedAt,
            placement: null,
        })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入persistedplayersnapshot文档。
 */
async function writePersistedPlayerSnapshotDocument(playerId, persistedSource = 'native') {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    const savedAt = Date.now();
    const payload = {
        version: 1,
        savedAt,
        placement: {
            templateId: 'yunlai_town',
            x: 32,
            y: 5,
            facing: 1,
        },
        vitals: {
            hp: 100,
            maxHp: 100,
            qi: 0,
            maxQi: 100,
        },
        progression: {
            foundation: 0,
            combatExp: 0,
            bodyTraining: null,
            boneAgeBaseYears: shared_1.DEFAULT_BONE_AGE_YEARS,
            lifeElapsedTicks: 0,
            lifespanYears: null,
            realm: null,
            heavenGate: null,
            spiritualRoots: null,
        },
        unlockedMapIds: ['yunlai_town'],
        inventory: {
            revision: 1,
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: [],
        },
        equipment: {
            revision: 1,
            slots: [],
        },
        techniques: {
            revision: 1,
            techniques: [],
            cultivatingTechId: null,
        },
        buffs: {
            revision: 1,
            buffs: [],
        },
        quests: {
            revision: 1,
            entries: [],
        },
        combat: {
            autoBattle: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            combatTargetId: null,
            combatTargetLocked: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: true,
            autoSwitchCultivation: false,
            senseQiActive: false,
            autoBattleSkills: [],
        },
        pendingLogbookMessages: [],
        runtimeBonuses: [],
        __snapshotMeta: {
            persistedSource,
        },
    };
    try {
        await pool.query(`
      INSERT INTO server_next_player_snapshot(
        player_id,
        template_id,
        persisted_source,
        seeded_at,
        saved_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, now(), $6::jsonb)
      ON CONFLICT (player_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        persisted_source = EXCLUDED.persisted_source,
        seeded_at = EXCLUDED.seeded_at,
        saved_at = EXCLUDED.saved_at,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [playerId, 'yunlai_town', persistedSource, null, savedAt, JSON.stringify(payload)]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入并等待persistedplayersnapshot文档可见。
 */
async function ensurePersistedPlayerSnapshotDocument(playerId, persistedSource = 'native') {
    await writePersistedPlayerSnapshotDocument(playerId, persistedSource);
    const visible = await waitForValue(async () => {
        const pool = new pg_1.Pool({
            connectionString: SERVER_NEXT_DATABASE_URL,
        });
        try {
            const result = await pool.query('SELECT 1 FROM server_next_player_snapshot WHERE player_id = $1 LIMIT 1', [playerId]).catch(ignoreMissingCompatCleanupError);
            return Array.isArray(result?.rows) && result.rows.length > 0 ? true : null;
        }
        finally {
            await pool.end().catch(() => undefined);
        }
    }, 3000, `persistedPlayerSnapshot:${playerId}`);
    if (visible !== true) {
        throw new Error(`expected persisted player snapshot document to become visible for playerId=${playerId}`);
    }
}
/**
 * 写入invalidpersistedsnapshotmetapersisted来源。
 */
async function writeInvalidPersistedSnapshotMetaPersistedSource(playerId) {
/**
 * 记录payload。
 */
    const payload = await readPersistedPlayerSnapshotPayload(playerId, 'invalid meta normalization proof');
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 记录snapshotmeta。
 */
        const snapshotMeta = payload.__snapshotMeta && typeof payload.__snapshotMeta === 'object'
            ? payload.__snapshotMeta
            : {};
/**
 * 记录nextpayload。
 */
        const nextPayload = {
            ...payload,
            __snapshotMeta: {
                ...snapshotMeta,
                persistedSource: 'invalid_meta_source',
            },
        };
        await pool.query(`
      UPDATE server_next_player_snapshot
      SET persisted_source = $2,
          updated_at = now(),
          payload = $3::jsonb
      WHERE player_id = $1
    `, [playerId, 'invalid_meta_source', JSON.stringify(nextPayload)]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入invalidpersistedsnapshotunlocked地图ids。
 */
async function writeInvalidPersistedSnapshotUnlockedMapIds(playerId) {
/**
 * 记录payload。
 */
    const payload = await readPersistedPlayerSnapshotPayload(playerId, 'invalid unlockedMapIds normalization proof');
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 记录nextpayload。
 */
        const nextPayload = {
            ...payload,
            unlockedMapIds: 'invalid_unlocked_map_ids',
        };
        await pool.query(`
      UPDATE server_next_player_snapshot
      SET updated_at = now(),
          payload = $2::jsonb
      WHERE player_id = $1
    `, [playerId, JSON.stringify(nextPayload)]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入persistedidentity文档。
 */
async function writePersistedIdentityDocument(identity) {
/**
 * 记录normalizedidentity。
 */
    const normalizedIdentity = normalizePersistedIdentity(identity);
    if (!normalizedIdentity) {
        throw new Error(`invalid persisted identity seed payload: ${JSON.stringify(identity)}`);
    }
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      INSERT INTO server_next_player_identity(
        user_id,
        username,
        player_id,
        display_name,
        player_name,
        persisted_source,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        player_id = EXCLUDED.player_id,
        display_name = EXCLUDED.display_name,
        player_name = EXCLUDED.player_name,
        persisted_source = EXCLUDED.persisted_source,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [
            normalizedIdentity.userId,
            normalizedIdentity.username,
            normalizedIdentity.playerId,
            normalizedIdentity.displayName,
            normalizedIdentity.playerName,
            normalizedIdentity.persistedSource ?? 'native',
            JSON.stringify(normalizedIdentity),
        ]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理installidentitybackfillsavefailure。
 */
async function installIdentityBackfillSaveFailure(userId) {
/**
 * 记录normalizeduserID。
 */
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!normalizedUserId) {
        throw new Error('missing userId for identity backfill failure injection');
    }
/**
 * 为本次 smoke 生成唯一后缀，避免账号和玩家标识冲突。
 */
    const suffix = normalizedUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'proof';
/**
 * 记录trigger名称。
 */
    const triggerName = `server_next_fail_identity_backfill_${suffix}`;
/**
 * 记录function名称。
 */
    const functionName = `server_next_fail_identity_backfill_fn_${suffix}`;
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON server_next_player_identity`);
        await pool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
        await pool.query(`
      CREATE FUNCTION "${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.user_id = '${normalizedUserId}' THEN
          RAISE EXCEPTION 'forced identity backfill failure for %', NEW.user_id USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
        await pool.query(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT OR UPDATE ON server_next_player_identity
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
/**
 * 处理installsnapshotseedsavefailure。
 */
async function installSnapshotSeedSaveFailure(playerId) {
/**
 * 记录normalized玩家ID。
 */
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
        throw new Error('missing playerId for snapshot seed failure injection');
    }
/**
 * 为本次 smoke 生成唯一后缀，避免账号和玩家标识冲突。
 */
    const suffix = normalizedPlayerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'proof';
/**
 * 记录trigger名称。
 */
    const triggerName = `server_next_fail_snapshot_seed_${suffix}`;
/**
 * 记录function名称。
 */
    const functionName = `server_next_fail_snapshot_seed_fn_${suffix}`;
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON server_next_player_snapshot`);
        await pool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
        await pool.query(`
      CREATE FUNCTION "${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.player_id = '${normalizedPlayerId}' THEN
          RAISE EXCEPTION 'forced snapshot seed failure for %', NEW.player_id USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
        await pool.query(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT OR UPDATE ON server_next_player_snapshot
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
/**
 * 处理uninstallidentitybackfillsavefailure。
 */
async function uninstallIdentityBackfillSaveFailure(injection) {
    if (!injection?.triggerName || !injection?.functionName) {
        return;
    }
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${injection.triggerName}" ON server_next_player_identity`).catch(ignoreMissingCompatCleanupError);
        await pool.query(`DROP FUNCTION IF EXISTS "${injection.functionName}"()`).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理uninstallsnapshotseedsavefailure。
 */
async function uninstallSnapshotSeedSaveFailure(injection) {
    if (!injection?.triggerName || !injection?.functionName) {
        return;
    }
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`DROP TRIGGER IF EXISTS "${injection.triggerName}" ON server_next_player_snapshot`).catch(ignoreMissingCompatCleanupError);
        await pool.query(`DROP FUNCTION IF EXISTS "${injection.functionName}"()`).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 写入invalidlegacycompatunlockedminimapids。
 */
async function writeInvalidLegacyCompatUnlockedMinimapIds(playerId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
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
/**
 * 写入invalidlegacycompat地图ID。
 */
async function writeInvalidLegacyCompatMapId(playerId) {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
/**
 * 累计当前结果。
 */
        const result = await pool.query('UPDATE players SET "mapId" = $2, "updatedAt" = now() WHERE id = $1', [playerId, '']).catch(ignoreMissingCompatCleanupError);
        if (!result || result.rowCount === 0) {
            throw new Error(`missing compat player row for invalid mapId proof: playerId=${playerId}`);
        }
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 清理legacycompat玩家snapshot。
 */
async function cleanupLegacyCompatPlayerSnapshot(identity) {
    if (!identity?.userId || !identity.playerId) {
        return;
    }
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM server_next_player_snapshot WHERE player_id = $1', [identity.playerId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM server_next_player_identity WHERE user_id = $1', [identity.userId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM players WHERE id = $1', [identity.playerId]).catch(ignoreMissingCompatCleanupError);
        await pool.query('DELETE FROM users WHERE id = $1::uuid', [identity.userId]).catch(ignoreMissingCompatCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理ignoremissingcompatcleanuperror。
 */
function ignoreMissingCompatCleanupError(error) {
    if (error && typeof error === 'object' && error.code === '42P01') {
        return;
    }
    throw error;
}
/**
 * 规范化persistedidentity。
 */
function normalizePersistedIdentity(identity) {
    if (!identity || typeof identity !== 'object') {
        return null;
    }
/**
 * 记录userID。
 */
    const userId = typeof identity.userId === 'string' ? identity.userId.trim() : '';
/**
 * 记录username。
 */
    const username = typeof identity.username === 'string' ? identity.username.trim() : '';
/**
 * 记录玩家ID。
 */
    const playerId = typeof identity.playerId === 'string' ? identity.playerId.trim() : '';
    if (!userId || !username || !playerId) {
        return null;
    }
/**
 * 记录显示信息名称。
 */
    const displayName = typeof identity.displayName === 'string' && identity.displayName.trim()
        ? identity.displayName.trim()
        : username;
/**
 * 记录玩家名称。
 */
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
/**
 * 处理requestjson。
 */
async function requestJson(path, init) {
/**
 * 记录请求体。
 */
    const body = init?.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录response。
 */
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
/**
 * 等待for。
 */
async function waitFor(predicate, timeoutMs, label = 'waitFor') {
/**
 * 记录startedat。
 */
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
/**
 * 等待for价值。
 */
async function waitForValue(producer, timeoutMs, label = 'waitForValue') {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
        resolved = await producer();
        return resolved !== null && resolved !== undefined;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 等待for玩家状态。
 */
async function waitForPlayerState(playerId, shouldExist) {
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchPlayerState(playerId);
        return shouldExist ? Boolean(state?.player) : !state?.player;
    }, 5000, shouldExist ? 'waitForPlayerStatePresent' : 'waitForPlayerStateMissing');
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
 * 构建unique显示信息名称。
 */
function buildUniqueDisplayName(seed) {
    return buildRetryDisplayName('鉴', seed, 0);
}
function buildRetryDisplayName(base, suffixSeed, offset = 0) {
    const prefix = typeof base === 'string' && base.trim() ? base.trim().charAt(0) : '鉴';
    return buildSingleDisplayNameChar(`${prefix}:${suffixSeed}`, offset);
}
function buildRetryRoleName(base, suffixSeed) {
    const prefix = typeof base === 'string' && base.trim() ? base.trim().slice(0, 6) : '鉴角';
    return `${prefix}${buildCompactSeed(suffixSeed, 4)}`.slice(0, 12);
}
function buildSingleDisplayNameChar(seed, offset = 0) {
    const charStart = 0x4E00;
    const charSpan = 0x9FFF - charStart + 1;
    const codePoint = charStart + ((computeSeedHash(seed) + offset) % charSpan);
    return String.fromCodePoint(codePoint);
}
function buildCompactSeed(seed, width) {
    return computeSeedHash(seed).toString(36).padStart(width, '0').slice(-width);
}
function computeSeedHash(seed) {
/**
 * 记录hash。
 */
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return hash >>> 0;
}
/**
 * 解析jwtpayload。
 */
function parseJwtPayload(token) {
    if (typeof token !== 'string') {
        return null;
    }
/**
 * 记录segments。
 */
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

if (require.main === module) {
    void main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

const { buildHelperFunctionNames } = require('./next-auth-bootstrap-smoke/helpers');
const { buildFixtureFunctionNames } = require('./next-auth-bootstrap-smoke/fixtures');
const { buildVerifyFunctionNames } = require('./next-auth-bootstrap-smoke/contract-verifiers');
const coreSource = (() => {
    const fs = require('node:fs');
    return fs.readFileSync(__filename, 'utf8');
})();
const declaredFunctionNames = Array.from(coreSource.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm), (match) => match[1]);
const fixtureFunctionNames = buildFixtureFunctionNames(declaredFunctionNames);
const helperFunctionNames = buildHelperFunctionNames(declaredFunctionNames, fixtureFunctionNames);
function collectExports(names) {
    const result = {};
    for (const name of names) {
        let value;
        try {
            value = eval(name);
        }
        catch {
            value = undefined;
        }
        if (typeof value === 'function') {
            result[name] = value;
        }
    }
    return result;
}
const helperFunctions = collectExports(helperFunctionNames);
const fixtureFunctions = collectExports(fixtureFunctionNames);
const verifyFunctionNames = buildVerifyFunctionNames(declaredFunctionNames, helperFunctions, fixtureFunctions);
const verifyFunctions = collectExports(verifyFunctionNames);

module.exports = {
    main,
    __all: {
        ...helperFunctions,
        ...fixtureFunctions,
        ...verifyFunctions,
    },
    __helpers: helperFunctions,
    __fixtures: fixtureFunctions,
    __contractVerifiers: verifyFunctions,
    ...helperFunctions,
    ...fixtureFunctions,
    ...verifyFunctions,
};

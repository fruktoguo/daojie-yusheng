// @ts-nocheck

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
const REGISTER_ACCOUNT_NAME_PREFIX = 'acct_';
const REGISTER_ACCOUNT_NAME_MAX_LENGTH = 20;
/**
 * 为本次 smoke 生成唯一后缀，避免账号和玩家标识冲突。
 */
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/**
 * isEnvEnabled：判断Env启用是否满足条件。
 * @param key 参数说明。
 * @returns 无返回值，完成Env启用的条件判断。
 */

function isEnvEnabled(key) {
    const raw = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
/**
 * buildStrictNativeSkippedProof：构建并返回目标对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新StrictNativeSkippedProof相关状态。
 */

function buildStrictNativeSkippedProof(reason) {
    return {
        skipped: true,
        reason,
    };
}
/**
 * buildProfileSkippedProof：构建并返回目标对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新ProfileSkippedProof相关状态。
 */

function buildProfileSkippedProof(reason) {
    return {
        skipped: true,
        reason,
        profile: NEXT_AUTH_BOOTSTRAP_PROFILE,
    };
}
/**
 * buildRegisterAccountName：构建并返回目标对象。
 * @param accountSuffix 参数说明。
 * @param retryAttempt 参数说明。
 * @returns 无返回值，直接更新RegisterAccount名称相关状态。
 */

function buildRegisterAccountName(accountSuffix, retryAttempt = null) {
    const retrySuffix = retryAttempt === null ? '' : `_${retryAttempt}`;
    const maxSuffixLength = Math.max(0, REGISTER_ACCOUNT_NAME_MAX_LENGTH - REGISTER_ACCOUNT_NAME_PREFIX.length - retrySuffix.length);
    const normalizedSuffix = accountSuffix.slice(0, maxSuffixLength);
    return `${REGISTER_ACCOUNT_NAME_PREFIX}${normalizedSuffix}${retrySuffix}`;
}
/**
 * withEnvOverrides：执行withEnvOverride相关逻辑。
 * @param overrides 参数说明。
 * @param run 参数说明。
 * @returns 无返回值，直接更新withEnvOverride相关状态。
 */

async function withEnvOverrides(overrides, run) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * readBootstrapProfile：读取引导Profile并返回结果。
 * @returns 无返回值，完成BootstrapProfile的读取/组装。
 */

function readBootstrapProfile() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * 记录authenticated缺失snapshot恢复contract。
 */
    const authenticatedMissingSnapshotRecoveryContract = RUN_MAINLINE_PROOFS
        ? await verifyAuthenticatedMissingSnapshotRecoveryContract()
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
        ? (DATABASE_ENABLED
            ? {
                coveredBy: 'authenticatedSnapshotRecoveryBootstrapLinkContract',
                tokenSeedBootstrap: authenticatedSnapshotRecoveryBootstrapLinkContract?.tokenSeedBootstrap ?? null,
            }
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
        ? {
            coveredBy: 'tokenSeedNativeStarterSnapshotContract',
            authOwnsStarterSnapshotPersistence: tokenSeedNativeStarterSnapshotContract?.authOwnsStarterSnapshotPersistence ?? false,
        }
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
    const malformedNextRecordGuardContract = RUN_MAINLINE_PROOFS
        ? await verifyMalformedNextIdentityAndSnapshotRecordGuardContract()
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
                authenticatedMissingSnapshotRecoveryContract,
                authenticatedSnapshotRecoveryNoticeContract,
                authenticatedSnapshotRecoveryTraceContract,
                authenticatedSnapshotRecoveryBootstrapLinkContract,
                tokenSeedIdentityContract,
                tokenSeedNativeStarterSnapshotContract,
                tokenSeedNativeStarterBootstrapProof,
                tokenSeedPersistFailureContract,
                authPreseedSnapshotServiceUnavailableContract,
                helloAuthBootstrapForbiddenContract,
                implicitLegacyProtocolEntryContract,
                gmBootstrapSessionPolicyContract,
                malformedNextRecordGuardContract,
                invalidRequestedSessionIdRejected: true,
                authenticatedSessionProof: buildProfileSkippedProof('no_db_next_protocol_rejects_token_runtime'),
                nextProtocolRejectsLegacyEventContract: buildProfileSkippedProof('no_db_next_protocol_rejects_token_runtime'),
                authTrace: null,
                snapshotSequence: null,
            },
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
        if (DATABASE_ENABLED && authTrace?.identityPersistedSource !== 'native') {
            throw new Error(`expected with-db first identity persisted source to be native, got ${authTrace?.identityPersistedSource ?? 'unknown'}`);
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
                authenticatedMissingSnapshotRecoveryContract,
                authenticatedSnapshotRecoveryNoticeContract,
                authenticatedSnapshotRecoveryTraceContract,
                authenticatedSnapshotRecoveryBootstrapLinkContract,
                tokenSeedIdentityContract,
                tokenSeedNativeStarterSnapshotContract,
                tokenSeedNativeStarterBootstrapProof,
                tokenSeedPersistFailureContract,
                authPreseedSnapshotServiceUnavailableContract,
                helloAuthBootstrapForbiddenContract,
                implicitLegacyProtocolEntryContract,
                gmBootstrapSessionPolicyContract,
                malformedNextRecordGuardContract,
                invalidRequestedSessionIdRejected: true,
                authenticatedSessionProof,
                nextProtocolRejectsLegacyEventContract,
                authTrace,
                snapshotSequence,
            },
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * clearBootstrapDisconnectFatalIfRecovered：判断clear引导DisconnectFatalIfRecovered是否满足条件。
 * @returns 无返回值，直接更新clearBootstrapDisconnectFatalIfRecovered相关状态。
 */

    function clearBootstrapDisconnectFatalIfRecovered() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        clearBootstrapDisconnectFatalIfRecovered();
        if (fatalError) {
            throw fatalError;
        }
    }
    socket.connect();
    return {
        socket,
        legacyEvents,        
        /**
 * mapEnterCount：读取地图Enter数量。
 * @returns 返回地图Enter数量。
 */

        get mapEnterCount() {
            return mapEnterCount;
        },        
        /**
 * bootstrapCount：读取bootstrap数量。
 * @returns 返回bootstrap数量。
 */

        get bootstrapCount() {
            return bootstrapCount;
        },        
        /**
 * mapStaticCount：读取地图Static数量。
 * @returns 返回地图Static数量。
 */

        get mapStaticCount() {
            return mapStaticCount;
        },        
        /**
 * realmCount：读取realm数量。
 * @returns 返回realm数量。
 */

        get realmCount() {
            return realmCount;
        },        
        /**
 * worldDeltaCount：读取世界Delta数量。
 * @returns 返回世界Delta数量。
 */

        get worldDeltaCount() {
            return worldDeltaCount;
        },        
        /**
 * selfDeltaCount：读取selfDelta数量。
 * @returns 返回selfDelta数量。
 */

        get selfDeltaCount() {
            return selfDeltaCount;
        },        
        /**
 * panelDeltaCount：读取面板Delta数量。
 * @returns 返回面板Delta数量。
 */

        get panelDeltaCount() {
            return panelDeltaCount;
        },        
        /**
 * onceConnected：执行一次性Connected相关逻辑。
 * @returns 无返回值，直接更新onceConnected相关状态。
 */

        async onceConnected() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */

        emit(event, payload) {
            throwIfFatal();
            socket.emit(event, payload);
        },        
        /**
 * getEventCount：读取事件数量。
 * @param event 参数说明。
 * @returns 无返回值，完成事件数量的读取/组装。
 */

        getEventCount(event) {
            return (byEvent.get(event) ?? []).length;
        },        
        /**
 * listEventPayloads：读取事件载荷并返回结果。
 * @param event 参数说明。
 * @returns 无返回值，完成事件载荷的读取/组装。
 */

        listEventPayloads(event) {
            return (byEvent.get(event) ?? []).slice();
        },        
        /**
 * waitForEvent：执行waitFor事件相关逻辑。
 * @param event 参数说明。
 * @param predicate 参数说明。
 * @param timeoutMs 参数说明。
 * @returns 无返回值，直接更新waitFor事件相关状态。
 */

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
        /**
 * close：执行close相关逻辑。
 * @returns 无返回值，直接更新close相关状态。
 */

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
/**
 * flattenNoticeItems：执行flattenNotice道具相关逻辑。
 * @param payloads 参数说明。
 * @returns 无返回值，直接更新flattenNotice道具相关状态。
 */

function flattenNoticeItems(payloads) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * hasPendingLogbookMessage：判断待处理LogbookMessage是否满足条件。
 * @param playerState 参数说明。
 * @param messageId message ID。
 * @returns 无返回值，完成PendingLogbookMessage的条件判断。
 */

function hasPendingLogbookMessage(playerState, messageId) {
    const pendingLogbookMessages = Array.isArray(playerState?.player?.pendingLogbookMessages)
        ? playerState.player.pendingLogbookMessages
        : [];
    return pendingLogbookMessages.some((entry) => entry?.id === messageId);
}
/**
 * createAuthStarterSnapshotDeps：构建并返回目标对象。
 * @returns 无返回值，直接更新认证Starter快照Dep相关状态。
 */

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
                    gatherJob: {
                        resourceNodeId: 'landmark.herb.moondew_grass',
                        resourceNodeName: '月露草',
                        phase: 'gathering',
                        startedAt: Date.now(),
                        totalTicks: 12,
                        remainingTicks: 4,
                        pausedTicks: 0,
                        successRate: 1,
                        spiritStoneCost: 0,
                    },
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const socket = createNextSocket(token);
    try {
        await socket.onceConnected();
        const initSession = await socket.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => typeof payload?.pid === 'string' && payload.pid.trim().length > 0, 5000);
        const bootstrap = await socket.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => typeof payload?.self?.id === 'string' && payload.self.id.trim().length > 0, 5000);
        if (initSession.pid !== expectedPlayerId || bootstrap.self.id !== expectedPlayerId) {
            throw new Error(`next legacy reject contract player mismatch: expected=${expectedPlayerId} init=${initSession.pid} bootstrap=${bootstrap.self.id}`);
        }
        const legacyRejectProofs = [];
        const legacyEventsToReject = [
            { event: 'c:ping', payload: { clientAt: Date.now() }, label: 'c:ping' },
            { event: 'c:requestSuggestions', payload: {}, label: 'c:requestSuggestions' },
            { event: 'c:requestMailSummary', payload: {}, label: 'c:requestMailSummary' },
            { event: 'c:requestMailPage', payload: {}, label: 'c:requestMailPage' },
            { event: 'c:requestMailDetail', payload: {}, label: 'c:requestMailDetail' },
            { event: 'c:requestMarket', payload: {}, label: 'c:requestMarket' },
            { event: 'c:redeemCodes', payload: {}, label: 'c:redeemCodes' },
            { event: 'c:markMailRead', payload: {}, label: 'c:markMailRead' },
            { event: 'c:createSuggestion', payload: {}, label: 'c:createSuggestion' },
            { event: 'c:voteSuggestion', payload: {}, label: 'c:voteSuggestion' },
            { event: 'c:replySuggestion', payload: {}, label: 'c:replySuggestion' },
            { event: 'c:markSuggestionRepliesRead', payload: {}, label: 'c:markSuggestionRepliesRead' },
            { event: 'c:gmMarkSuggestionCompleted', payload: {}, label: 'c:gmMarkSuggestionCompleted' },
            { event: 'c:gmRemoveSuggestion', payload: {}, label: 'c:gmRemoveSuggestion' },
            { event: 'c:claimMailAttachments', payload: {}, label: 'c:claimMailAttachments' },
            { event: 'c:deleteMail', payload: {}, label: 'c:deleteMail' },
            { event: 'c:requestMarketItemBook', payload: {}, label: 'c:requestMarketItemBook' },
            { event: 'c:requestMarketTradeHistory', payload: {}, label: 'c:requestMarketTradeHistory' },
            { event: 'c:useItem', payload: {}, label: 'c:useItem' },
            { event: 'c:dropItem', payload: {}, label: 'c:dropItem' },
            { event: 'c:equip', payload: {}, label: 'c:equip' },
            { event: 'c:unequip', payload: {}, label: 'c:unequip' },
            { event: 'c:cultivate', payload: {}, label: 'c:cultivate' },
            { event: 'c:requestNpcShop', payload: {}, label: 'c:requestNpcShop' },
            { event: 'c:createMarketSellOrder', payload: {}, label: 'c:createMarketSellOrder' },
            { event: 'c:createMarketBuyOrder', payload: {}, label: 'c:createMarketBuyOrder' },
            { event: 'c:buyMarketItem', payload: {}, label: 'c:buyMarketItem' },
            { event: 'c:sellMarketItem', payload: {}, label: 'c:sellMarketItem' },
            { event: 'c:cancelMarketOrder', payload: {}, label: 'c:cancelMarketOrder' },
            { event: 'c:claimMarketStorage', payload: {}, label: 'c:claimMarketStorage' },
            { event: 'c:buyNpcShopItem', payload: {}, label: 'c:buyNpcShopItem' },
        ];
        for (const entry of legacyEventsToReject) {
            const rejectErrorCountBeforeEmit = socket.getEventCount(shared_1.NEXT_S2C.Error);
            const pongCountBeforeEmit = socket.getEventCount(shared_1.NEXT_S2C.Pong);
            const legacyEventCountBeforeEmit = socket.legacyEvents.length;
            socket.emit(entry.event, entry.payload);
            await delay(150);
            if (socket.getEventCount(shared_1.NEXT_S2C.Error) !== rejectErrorCountBeforeEmit) {
                throw new Error(`expected next socket to ignore legacy event ${entry.label} without NEXT_S2C.Error, got ${JSON.stringify(socket.listEventPayloads(shared_1.NEXT_S2C.Error).slice(-1)[0] ?? null)}`);
            }
            if (socket.getEventCount(shared_1.NEXT_S2C.Pong) !== pongCountBeforeEmit) {
                throw new Error(`expected legacy event ${entry.label} to avoid NEXT_S2C.Pong on next socket`);
            }
            if (socket.legacyEvents.length !== legacyEventCountBeforeEmit) {
                throw new Error(`expected next socket to avoid legacy s2c echo while ignoring ${entry.label}, got ${socket.legacyEvents.join(', ')}`);
            }
            legacyRejectProofs.push(entry.label);
        }
        if (socket.legacyEvents.length > 0) {
            throw new Error(`expected no legacy s2c events while ignoring legacy c2s on next socket, got ${socket.legacyEvents.join(', ')}`);
        }
        socket.emit(shared_1.NEXT_C2S.Ping, { clientAt: Date.now() });
        await socket.waitForEvent(shared_1.NEXT_S2C.Pong, () => true, 5000);
        return {
            ignoredLegacyEvent: legacyRejectProofs[0] ?? null,
            ignoredSecondLegacyEvent: legacyRejectProofs[1] ?? null,
            ignoredLegacyEvents: legacyRejectProofs,
            nextPongCount: socket.getEventCount(shared_1.NEXT_S2C.Pong),
            legacyEvents: socket.legacyEvents.slice(),
        };
    }
    finally {
        socket.close();
    }
}
/**
 * verifyHelloAuthBootstrapForbiddenContract：执行verifyHello认证引导ForbiddenContract相关逻辑。
 * @returns 无返回值，直接更新verifyHello认证BootstrapForbiddenContract相关状态。
 */

async function verifyHelloAuthBootstrapForbiddenContract() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {
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
        /**
 * disconnect：判断disconnect是否满足条件。
 * @param force 参数说明。
 * @returns 无返回值，直接更新disconnect相关状态。
 */

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
/**
 * verifyImplicitLegacyProtocolEntryContract：执行verifyImplicitLegacyProtocol条目Contract相关逻辑。
 * @returns 无返回值，直接更新verifyImplicitLegacyProtocol条目Contract相关状态。
 */

async function verifyImplicitLegacyProtocolEntryContract() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {
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
        /**
 * disconnect：判断disconnect是否满足条件。
 * @param force 参数说明。
 * @returns 无返回值，直接更新disconnect相关状态。
 */

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
        /**
 * disconnect：判断disconnect是否满足条件。
 * @param force 参数说明。
 * @returns 无返回值，直接更新disconnect相关状态。
 */

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
        /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */

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
        /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */

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
        /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */

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
        const RuntimeGmStateService = require("../runtime/gm/runtime-gm-state.service").RuntimeGmStateService;
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
            enqueueGmUpdatePlayer: () => undefined,
            enqueueGmResetPlayer: () => undefined,
            enqueueGmSpawnBots: () => undefined,
            enqueueGmRemoveBots: () => undefined,
        }, {
            getSocketByPlayerId: () => null,
        });
        gmClient = {
            data: {
                protocol: 'legacy',
            },
            emitted: [],            
            /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */

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
        || explicitLegacyDisabledSyncEmission.emitNext !== true
        || explicitLegacyDisabledSyncEmission.protocol !== 'next') {
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
/**
 * verifyGmBootstrapSessionPolicyContract：执行verifyGM引导SessionPolicyContract相关逻辑。
 * @returns 无返回值，直接更新verifyGMBootstrapSessionPolicyContract相关状态。
 */

async function verifyGmBootstrapSessionPolicyContract() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const bootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService(null, null, null, null, null, null, null, null, null, null);
    const gateway = new world_gateway_1.WorldGateway(null, null, bootstrapService, null, null, null, null, null, null, null, null, null, null, null, null);
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
    const gmEntryPath = gateway.gatewayBootstrapHelper.resolveAuthenticatedBootstrapEntryPath(gmClient);
    const playerEntryPath = gateway.gatewayBootstrapHelper.resolveAuthenticatedBootstrapEntryPath(playerClient);
    const gmBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(gmClient, {
        playerId: 'p_gm',
        playerName: '鉴角',
        displayName: '鉴',
    });
    const playerBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(playerClient, {
        playerId: 'p_player',
        playerName: '丙角',
        displayName: '丙',
    });
    const tokenBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(tokenClient, {
        playerId: 'p_token',
        playerName: '丁令',
        displayName: '丁令',
        authSource: 'token',
        persistedSource: 'token_seed',
    });
    const tokenRuntimeBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(tokenRuntimeClient, {
        playerId: 'p_token_runtime',
        playerName: '丁角',
        displayName: '丁',
        authSource: 'token_runtime',
    });
    const migrationBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(migrationClient, {
        playerId: 'p_migration',
        playerName: '戊角',
        displayName: '戊',
        authSource: 'migration_backfill',
    });
    const nextTokenSeedBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(nextTokenSeedClient, {
        playerId: 'p_next_token_seed',
        playerName: '庚角',
        displayName: '庚',
        authSource: 'token',
        persistedSource: 'token_seed',
    });
    const nextLegacyBackfillBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(nextLegacyBackfillClient, {
        playerId: 'p_next_legacy_backfill',
        playerName: '辛角',
        displayName: '辛',
        authSource: 'next',
        persistedSource: 'legacy_backfill',
    });
    const nextInvalidPersistedBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(nextInvalidPersistedClient, {
        playerId: 'p_next_invalid_persisted',
        playerName: '壬角',
        displayName: '壬',
        authSource: 'next',
        persistedSource: 'invalid_meta_source',
    });
    const noEntryPathNextBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(noEntryPathNextClient, {
        playerId: 'p_no_entry_path_next',
        playerName: '癸角',
        displayName: '癸',
        authSource: 'next',
        persistedSource: 'native',
    });
    const unknownBootstrapInput = gateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput({
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
    if (tokenBootstrapInput.requestedSessionId !== undefined
        || tokenImplicitDetachedResumeAllowed
        || tokenRequestedDetachedResumeAllowed
        || tokenConnectedSessionReuseAllowed) {
        throw new Error(`expected token/token_seed authenticated bootstrap to stay bootstrap-admissible but disable runtime session reuse, got requested=${tokenBootstrapInput.requestedSessionId} implicit=${tokenImplicitDetachedResumeAllowed} requestedReuse=${tokenRequestedDetachedResumeAllowed} connectedReuse=${tokenConnectedSessionReuseAllowed}`);
    }
    if (nextTokenSeedBootstrapInput.requestedSessionId !== undefined
        || nextTokenSeedImplicitDetachedResumeAllowed
        || nextTokenSeedRequestedDetachedResumeAllowed
        || nextTokenSeedConnectedSessionReuseAllowed) {
        throw new Error(`expected token_seed authenticated bootstrap to remain bootstrap-admissible but require bootstrap-owned promotion before any runtime session reuse, got requested=${nextTokenSeedBootstrapInput.requestedSessionId} implicit=${nextTokenSeedImplicitDetachedResumeAllowed} requestedReuse=${nextTokenSeedRequestedDetachedResumeAllowed} connectedReuse=${nextTokenSeedConnectedSessionReuseAllowed}`);
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
    const gmResolvedRequestedSessionId = bootstrapService.resolveBootstrapRequestedSessionId(gmClient, 'gm_requested_session');
    const playerResolvedRequestedSessionId = bootstrapService.resolveBootstrapRequestedSessionId(playerClient, '  player_requested_session  ');
    const tokenResolvedRequestedSessionId = bootstrapService.resolveBootstrapRequestedSessionId(tokenClient, 'token_requested_session');
    const nextInvalidPersistedResolvedRequestedSessionId = bootstrapService.resolveBootstrapRequestedSessionId(nextInvalidPersistedClient, 'next_invalid_requested_session');
    if (gmResolvedRequestedSessionId !== undefined) {
        throw new Error(`expected GM bootstrap requested session resolution to stay blocked, got ${gmResolvedRequestedSessionId}`);
    }
    if (playerResolvedRequestedSessionId !== 'player_requested_session') {
        throw new Error(`expected next/native bootstrap requested session resolution to trim and keep the requested sessionId, got ${playerResolvedRequestedSessionId}`);
    }
    if (tokenResolvedRequestedSessionId !== undefined) {
        throw new Error(`expected token/token_seed bootstrap requested session resolution to stay blocked before promotion, got ${tokenResolvedRequestedSessionId}`);
    }
    if (nextInvalidPersistedResolvedRequestedSessionId !== undefined) {
        throw new Error(`expected invalid persistedSource bootstrap requested session resolution to stay blocked, got ${nextInvalidPersistedResolvedRequestedSessionId}`);
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
        gmResolvedRequestedSessionId: gmResolvedRequestedSessionId ?? null,
        playerResolvedRequestedSessionId: playerResolvedRequestedSessionId ?? null,
        nextTokenSeedRequestedSessionId: nextTokenSeedBootstrapInput.requestedSessionId ?? null,
        nextLegacyBackfillRequestedSessionId: nextLegacyBackfillBootstrapInput.requestedSessionId ?? null,
        tokenResolvedRequestedSessionId: tokenResolvedRequestedSessionId ?? null,
        tokenRuntimeRequestedSessionId: tokenRuntimeBootstrapInput.requestedSessionId ?? null,
        migrationRequestedSessionId: migrationBootstrapInput.requestedSessionId ?? null,
        nextInvalidPersistedResolvedRequestedSessionId: nextInvalidPersistedResolvedRequestedSessionId ?? null,
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

async function verifyMalformedNextIdentityAndSnapshotRecordGuardContract() {
    const authService = new world_player_auth_service_1.WorldPlayerAuthService({
        validatePlayerToken() {
            return {
                sub: 'proof_user_invalid_next_identity_shape',
                username: 'proof_invalid_next_identity_shape',
                playerId: 'proof_player_invalid_next_identity_shape',
                playerName: '无效角色',
                displayName: '无效',
            };
        },
        resolvePlayerIdentityFromPayload(payload) {
            return {
                userId: payload.sub,
                username: payload.username,
                displayName: payload.displayName,
                playerId: payload.playerId,
                playerName: payload.playerName,
            };
        },
    }, {
        isEnabled() {
            return true;
        },
        async loadPlayerIdentity() {
            return {
                userId: 'proof_user_invalid_next_identity_shape',
                username: 'proof_invalid_next_identity_shape',
                displayName: '  ',
                playerId: 'proof_player_invalid_next_identity_shape',
                playerName: '无效角色',
                persistedSource: 'native',
            };
        },
        async savePlayerIdentity() {
            throw new Error('unexpected_save_player_identity');
        },
    });
    const malformedIdentity = await authService.authenticatePlayerToken('proof.token.invalid_next_identity_shape', {
        protocol: 'next',
    });
    if (malformedIdentity !== null) {
        throw new Error(`expected malformed next identity record to be rejected before bootstrap, got ${JSON.stringify(malformedIdentity)}`);
    }
    const snapshotService = new world_player_snapshot_service_1.WorldPlayerSnapshotService({
        isEnabled() {
            return true;
        },
        async loadPlayerSnapshotRecord() {
            return {
                snapshot: {
                    identity: {
                        id: 'proof_snapshot_player_invalid_persisted_source',
                    },
                },
                persistedSource: 'invalid_snapshot_source',
            };
        },
        async savePlayerSnapshot() {
            throw new Error('unexpected_save_player_snapshot');
        },
    }, {
        buildStarterPersistenceSnapshot() {
            throw new Error('unexpected_build_starter_snapshot');
        },
    });
    let snapshotError = null;
    try {
        await snapshotService.loadPlayerSnapshotResult('proof_snapshot_player_invalid_persisted_source');
    }
    catch (error) {
        snapshotError = error;
    }
    if (!(snapshotError instanceof Error) || !snapshotError.message.includes('persistedSource invalid')) {
        throw new Error(`expected invalid next snapshot record persistedSource to fail hard, got ${snapshotError instanceof Error ? snapshotError.message : String(snapshotError)}`);
    }
    return {
        malformedNextIdentityRejected: true,
        malformedNextIdentityFailureStage: 'next_identity_shape_invalid',
        invalidSnapshotPersistedSourceRejected: true,
        invalidSnapshotPersistedSourceMessage: snapshotError.message,
    };
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
 * verifyAuthenticatedMissingSnapshotRecoveryContract：判断verifyAuthenticatedMissing快照RecoveryContract是否满足条件。
 * @returns 无返回值，直接更新verifyAuthenticatedMissing快照RecoveryContract相关状态。
 */

async function verifyAuthenticatedMissingSnapshotRecoveryContract() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        loadPlayerSnapshot: async (playerId, fallbackReason) => {
            defaultCalls.push({
                playerId,
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
    const recoveryBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
        playerIdentityPersistenceService: {
            isEnabled: () => true,
            savePlayerIdentity: async (identity) => ({
                ...identity,
                authSource: 'next',
                persistedSource: 'native',
            }),
        },
    }, {
        isPersistenceEnabled: () => true,
        loadPlayerSnapshot: async (playerId, fallbackReason) => {
            recoveryCalls.push({
                playerId,
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
    let promotionFailureError = null;
    let promotionFailureSeedCalls = 0;
    const promotionFailureBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
        playerIdentityPersistenceService: {
            isEnabled: () => true,
            savePlayerIdentity: async () => {
                throw new Error('forced_token_seed_native_promotion_failure');
            },
        },
    }, {
        isPersistenceEnabled: () => true,
        loadPlayerSnapshot: async () => null,
        ensureNativeStarterSnapshot: async () => {
            promotionFailureSeedCalls += 1;
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
        try {
            await promotionFailureBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_missing_snapshot_token_seed_promotion_failure',
                playerId: 'proof_player_missing_snapshot_token_seed_promotion_failure',
                authSource: 'token',
                persistedSource: 'token_seed',
            }, {
                data: {
                    authenticatedSnapshotRecovery: null,
                },
            });
        }
        catch (error) {
            promotionFailureError = error;
        }
        if (!(promotionFailureError instanceof Error)
            || !promotionFailureError.message.includes('stage=token_seed_native_promotion_failed')
            || promotionFailureSeedCalls !== 1) {
            throw new Error(`expected authenticated missing snapshot recovery to fail hard when token_seed native normalization fails, got error=${promotionFailureError instanceof Error ? promotionFailureError.message : String(promotionFailureError)} promotionFailureSeedCalls=${promotionFailureSeedCalls}`);
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
        promotionFailureStage: typeof promotionFailureError?.message === 'string' ? promotionFailureError.message : null,
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
        worldRuntimePlayerSessionService: {
            removePlayer: () => undefined,
            connectPlayer: () => undefined,
        },
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
    /**
 * runNoticeCase：执行runNoticeCase相关逻辑。
 * @param persistedSource 参数说明。
 * @param expectedText 参数说明。
 * @returns 无返回值，直接更新runNoticeCase相关状态。
 */

    async function runNoticeCase(persistedSource, expectedText) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * withLocalAuthTraceEnabled：执行withLocal认证Trace启用相关逻辑。
 * @param run 参数说明。
 * @returns 无返回值，直接更新withLocal认证Trace启用相关状态。
 */

async function withLocalAuthTraceEnabled(run) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * findLatestSnapshotRecoveryTrace：读取最新快照RecoveryTrace并返回结果。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成Latest快照RecoveryTrace的读取/组装。
 */

function findLatestSnapshotRecoveryTrace(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        const bootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
            playerIdentityPersistenceService: {
                isEnabled: () => true,
                savePlayerIdentity: async (identity) => ({
                    ...identity,
                    authSource: 'next',
                    persistedSource: 'native',
                }),
            },
        }, {
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
        const promotionFailureBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
            playerIdentityPersistenceService: {
                isEnabled: () => true,
                savePlayerIdentity: async () => {
                    throw new Error('forced_token_seed_native_promotion_failure');
                },
            },
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
            || tokenSeedTrace.entry?.identityPersistedSource !== 'native'
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
        const promotionFailurePlayerId = 'proof_player_snapshot_recovery_trace_promotion_failure';
        (0, world_player_token_service_1.clearAuthTrace)();
        let promotionFailureError = null;
        try {
            await promotionFailureBootstrapService.loadAuthenticatedPlayerSnapshot({
                userId: 'proof_user_snapshot_recovery_trace_promotion_failure',
                playerId: promotionFailurePlayerId,
                authSource: 'token',
                persistedSource: 'token_seed',
            });
        }
        catch (error) {
            promotionFailureError = error;
        }
        const promotionFailureTrace = findLatestSnapshotRecoveryTrace(promotionFailurePlayerId);
        if (!(promotionFailureError instanceof Error)
            || promotionFailureTrace.entry?.outcome !== 'failure'
            || promotionFailureTrace.entry?.reason !== 'persisted_source:token_seed'
            || promotionFailureTrace.entry?.failureStage !== 'token_seed_native_promotion_failed'
            || promotionFailureTrace.entry?.persistedSource !== 'native'
            || Number(promotionFailureTrace.summary?.snapshotRecovery?.failedCount ?? 0) < 1) {
            throw new Error(`expected snapshot recovery trace to record token_seed native normalization failure, got error=${promotionFailureError instanceof Error ? promotionFailureError.message : String(promotionFailureError)} trace=${JSON.stringify(promotionFailureTrace)}`);
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
            promotionFailure: {
                outcome: promotionFailureTrace.entry?.outcome ?? null,
                reason: promotionFailureTrace.entry?.reason ?? null,
                failureStage: promotionFailureTrace.entry?.failureStage ?? null,
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
                playerIdentityPersistenceService: {
                    isEnabled: () => true,
                    savePlayerIdentity: async (identity) => ({
                        ...identity,
                        authSource: 'next',
                        persistedSource: 'native',
                    }),
                },
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
                worldRuntimePlayerSessionService: {
                    removePlayer: () => undefined,
                    connectPlayer: () => undefined,
                },
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            failureStage: 'unexpected_migration_snapshot_seed',
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
    const nextLegacyBackfillIdentity = {
        ...nextStoreIdentity,
        playerId: 'proof_player_legacy_backfill',
        playerName: 'proof legacy backfill',
        persistedSource: 'legacy_backfill',
    };
    const nextLegacySyncIdentity = {
        ...nextStoreIdentity,
        playerId: 'proof_player_legacy_sync',
        playerName: 'proof legacy sync',
        persistedSource: 'legacy_sync',
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
            failureStage: 'unexpected_migration_snapshot_seed',
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
    const legacyBackfillAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
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
        loadPlayerIdentity: async () => nextLegacyBackfillIdentity,
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
    });
    const legacySyncAuthService = new world_player_auth_service_1.WorldPlayerAuthService({
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
        loadPlayerIdentity: async () => nextLegacySyncIdentity,
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
    });
    const nextProtocolLegacyBackfillIdentity = await legacyBackfillAuthService.authenticatePlayerToken('proof.token.token_seed', {
        protocol: 'next',
    });
    if (nextProtocolLegacyBackfillIdentity !== null) {
        throw new Error(`expected next protocol auth to reject loaded legacy_backfill identity before bootstrap, got ${JSON.stringify(nextProtocolLegacyBackfillIdentity)}`);
    }
    const nextProtocolLegacySyncIdentity = await legacySyncAuthService.authenticatePlayerToken('proof.token.token_seed', {
        protocol: 'next',
    });
    if (nextProtocolLegacySyncIdentity !== null) {
        throw new Error(`expected next protocol auth to reject loaded legacy_sync identity before bootstrap, got ${JSON.stringify(nextProtocolLegacySyncIdentity)}`);
    }
    const tokenSeedBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
        playerIdentityPersistenceService: {
            isEnabled: () => true,
            savePlayerIdentity: async (identity) => ({
                ...identity,
                persistedSource: 'native',
            }),
        },
    }, null, null, null, null, null, null, null, null, null);
    const tokenSeedGateway = new world_gateway_1.WorldGateway(null, null, tokenSeedBootstrapService, null, null, null, null, null, null, null, null, null, null, null, null);
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
    const tokenSeedBootstrapInput = tokenSeedGateway.gatewayBootstrapHelper.buildAuthenticatedBootstrapInput(tokenSeedClient, nextProtocolIdentity);
    if (tokenSeedBootstrapInput.requestedSessionId !== undefined) {
        throw new Error(`expected next protocol token_seed identity store hit to ignore requestedSessionId until bootstrap-owned promotion completes, got ${tokenSeedBootstrapInput.requestedSessionId}`);
    }
    if (tokenSeedRequestedSessionIdAllowed || tokenSeedConnectedSessionReuseAllowed || tokenSeedImplicitDetachedResumeAllowed) {
        throw new Error(`expected token/token_seed bootstrap session reuse policy to stay disabled before bootstrap-owned promotion completes, got implicit=${tokenSeedImplicitDetachedResumeAllowed} requested=${tokenSeedRequestedSessionIdAllowed} connected=${tokenSeedConnectedSessionReuseAllowed}`);
    }
    if (typeof nextStoreAuthService.promoteTokenSeedIdentityToNative === 'function'
        || typeof nextStoreAuthService.promotePersistedIdentityToNative === 'function') {
        throw new Error('expected auth service to stop owning token_seed promotion helpers');
    }
    const promotedIdentity = await tokenSeedBootstrapService.promoteAuthenticatedTokenSeedIdentity({
        ...nextProtocolIdentity,
    }, tokenSeedClient);
    if (!promotedIdentity || promotedIdentity.authSource !== 'next' || promotedIdentity.persistedSource !== 'native') {
        throw new Error(`expected bootstrap-owned token_seed promotion to normalize into next/native, got ${JSON.stringify(promotedIdentity)}`);
    }
    const preseededPromotionFailureBootstrapService = new world_session_bootstrap_service_1.WorldSessionBootstrapService({
        playerIdentityPersistenceService: {
            isEnabled: () => true,
            savePlayerIdentity: async () => {
                throw new Error('forced_token_seed_native_promotion_failure');
            },
        },
    }, {
        isPersistenceEnabled: () => true,
        loadPlayerSnapshotResult: async () => ({
            snapshot: {
                version: 1,
                placement: {
                    templateId: 'yunlai_town',
                    x: 3,
                    y: 3,
                    facing: 1,
                },
            },
            source: 'next',
            persistedSource: 'native',
            fallbackReason: 'persistence_enabled_blocked:token',
            seedPersisted: false,
        }),
    }, null, null, null, null, null, null, null, null);
    const preseededPromotionFailureClient = {
        id: 'proof_socket_token_seed_preseeded_promotion_failure',
        data: {
            protocol: 'next',
            bootstrapEntryPath: 'connect_token',
            bootstrapIdentitySource: 'token',
            bootstrapIdentityPersistedSource: 'token_seed',
            authenticatedSnapshotRecovery: null,
        },
    };
    let preseededPromotionFailureError = null;
    try {
        await preseededPromotionFailureBootstrapService.loadAuthenticatedPlayerSnapshot({
            ...nextProtocolIdentity,
        }, preseededPromotionFailureClient);
    }
    catch (error) {
        preseededPromotionFailureError = error;
    }
    if (!(preseededPromotionFailureError instanceof Error)
        || !preseededPromotionFailureError.message.includes('stage=token_seed_native_promotion_failed')) {
        throw new Error(`expected preseeded token_seed native snapshot path to fail hard on native normalization failure, got ${preseededPromotionFailureError instanceof Error ? preseededPromotionFailureError.message : String(preseededPromotionFailureError)}`);
    }
    let nextAuthSourcePreseededPromotionFailureError = null;
    try {
        await preseededPromotionFailureBootstrapService.loadAuthenticatedPlayerSnapshot({
            ...nextProtocolIdentity,
            authSource: 'next',
        }, {
            id: 'proof_socket_token_seed_preseeded_promotion_failure_next',
            data: {
                protocol: 'next',
                bootstrapEntryPath: 'connect_token',
                bootstrapIdentitySource: 'next',
                bootstrapIdentityPersistedSource: 'token_seed',
                authenticatedSnapshotRecovery: null,
            },
        });
    }
    catch (error) {
        nextAuthSourcePreseededPromotionFailureError = error;
    }
    if (!(nextAuthSourcePreseededPromotionFailureError instanceof Error)
        || !nextAuthSourcePreseededPromotionFailureError.message.includes('stage=token_seed_native_promotion_failed')) {
        throw new Error(`expected preseeded next/token_seed native snapshot path to fail hard on native normalization failure, got ${nextAuthSourcePreseededPromotionFailureError instanceof Error ? nextAuthSourcePreseededPromotionFailureError.message : String(nextAuthSourcePreseededPromotionFailureError)}`);
    }
    return {
        identitySource: identity.authSource ?? null,
        playerId: identity.playerId ?? null,
        compatIdentityCalls,
        compatSnapshotCalls,
        nextProtocolAuthSource: nextProtocolIdentity.authSource ?? null,
        nextProtocolPersistedSource: nextProtocolIdentity.persistedSource ?? null,
        nextProtocolLegacyBackfillIdentityBlocked: nextProtocolLegacyBackfillIdentity === null,
        nextProtocolLegacySyncIdentityBlocked: nextProtocolLegacySyncIdentity === null,
        promotedAuthSource: promotedIdentity.authSource ?? null,
        promotedPersistedSource: promotedIdentity.persistedSource ?? null,
        preseededPromotionFailureStage: preseededPromotionFailureError?.message ?? null,
        nextAuthSourcePreseededPromotionFailureStage: nextAuthSourcePreseededPromotionFailureError?.message ?? null,
        requestedSessionId: tokenSeedBootstrapInput.requestedSessionId ?? null,
        sessionReusePolicy: {
            implicit: tokenSeedImplicitDetachedResumeAllowed,
            requested: tokenSeedRequestedSessionIdAllowed,
            connected: tokenSeedConnectedSessionReuseAllowed,
        },
    };
}
/**
 * verifySnapshotSequence：执行verify快照Sequence相关逻辑。
 * @param _token 参数说明。
 * @param _playerId _player ID。
 * @param authTrace 参数说明。
 * @param options 选项参数。
 * @returns 无返回值，直接更新verify快照Sequence相关状态。
 */


function verifySnapshotSequence(_token, _playerId, authTrace, options = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!authTrace) {
        return {
            supported: false,
            reason: 'missing_auth_trace',
        };
    }
    const bootstrapIdentitySource = typeof authTrace.bootstrapIdentitySource === 'string'
        ? authTrace.bootstrapIdentitySource
        : '';
    const bootstrapIdentityPersistedSource = typeof authTrace.bootstrapIdentityPersistedSource === 'string'
        ? authTrace.bootstrapIdentityPersistedSource
        : '';
    const bootstrapSnapshotSource = typeof authTrace.bootstrapSnapshotSource === 'string'
        ? authTrace.bootstrapSnapshotSource
        : '';
    const bootstrapSnapshotPersistedSource = typeof authTrace.bootstrapSnapshotPersistedSource === 'string'
        ? authTrace.bootstrapSnapshotPersistedSource
        : '';
    const supported = bootstrapIdentitySource === 'next'
        && bootstrapIdentityPersistedSource === 'native'
        && bootstrapSnapshotPersistedSource === 'native'
        && (bootstrapSnapshotSource === 'next' || bootstrapSnapshotSource === 'recovery_native');
    return {
        supported,
        reason: supported ? null : 'bootstrap_trace_not_native_normalized',
        includeMigrationProofs: options.includeMigrationProofs === true,
        bootstrapIdentitySource: bootstrapIdentitySource || null,
        bootstrapIdentityPersistedSource: bootstrapIdentityPersistedSource || null,
        bootstrapSnapshotSource: bootstrapSnapshotSource || null,
        bootstrapSnapshotPersistedSource: bootstrapSnapshotPersistedSource || null,
        bootstrapRecoveryIdentityPersistedSource: typeof authTrace.bootstrapRecoveryIdentityPersistedSource === 'string'
            ? authTrace.bootstrapRecoveryIdentityPersistedSource
            : null,
    };
}

/**
 * 验证带库 token 首登在缺失 compat snapshot 时，会直接写入 next-native starter snapshot。
 */
async function verifyTokenSeedNativeStarterSnapshotContract() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            failureStage: 'unexpected_migration_snapshot_seed',
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
    if (savedSnapshot !== null || savedSnapshotOptions !== null) {
        throw new Error(`expected token authentication path to leave starter snapshot persistence to bootstrap-owned flow, got snapshot=${JSON.stringify(savedSnapshot)} options=${JSON.stringify(savedSnapshotOptions)}`);
    }
    return {
        identitySource: identity.authSource ?? null,
        playerId: identity.playerId ?? null,
        compatIdentityCalls,
        compatSnapshotCalls,
        authOwnsStarterSnapshotPersistence: false,
    };
}
/**
 * 验证 with-db token_seed 在鉴权放行后，bootstrap/snapshot 阶段仍能从缺失 next identity 与 compat snapshot 中恢复为 next-native starter snapshot。
 */
async function verifyTokenSeedNativeStarterBootstrapProof() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const previousRecoveryEnv = process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
    process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = '1';
    try {
        await delay(300);
        await flushPersistence();
        await deletePlayer(playerId);
        await waitForPlayerState(playerId, false);
        await writePersistedIdentityDocument({
            ...auth.identity,
            persistedSource: expectedRecoveryIdentityPersistedSource,
        });
        await dropPlayerSnapshotSourcesButKeepIdentity(playerId);
        await expectPersistedIdentityDocument(userId, true);
        await expectPersistedPlayerSnapshotDocument(playerId, false);
        await expectLegacyCompatPlayerSnapshotDocument(playerId, false);
        await clearAuthTrace();
        bootstrap = await runNextBootstrap(auth.accessToken, {
            ...auth.identity,
            authSource: 'token',
            persistedSource: expectedRecoveryIdentityPersistedSource,
        }, {
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
        if (typeof previousRecoveryEnv === 'string') {
            process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY = previousRecoveryEnv;
        }
        else {
            delete process.env.SERVER_NEXT_AUTH_ALLOW_NATIVE_SNAPSHOT_RECOVERY;
        }
        await deletePlayer(bootstrap?.playerId ?? playerId).catch(() => undefined);
        await cleanupLegacyCompatPlayerSnapshot(auth.identity).catch(() => undefined);
        await clearAuthTrace().catch(() => undefined);
    }
}
/**
 * 验证 token 种子身份在持久化失败时的拒绝或回退行为。
 */
async function verifyTokenSeedPersistFailureContract() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            failureStage: 'unexpected_migration_snapshot_seed',
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
 * 处理校验compatbackfillsavefailuremissingsnapshotrejection。
 */
async function verifyCompatBackfillSaveFailureMissingSnapshotRejection(token, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    await writeInvalidPersistedIdentityDocument(userId, playerId);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录account名称。
 */
    let accountName = buildRegisterAccountName(accountSuffix);
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
            accountName = buildRegisterAccountName(accountSuffix, attempt);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        let matchedIdentity = null;
        for (let index = trace.records.length - 1; index >= 0; index -= 1) {
            const entry = trace.records[index];
            if (entry?.type === 'identity'
                && entry?.userId === userId
                && entry?.playerId === playerId
                && entry?.source === expectedSource) {
                identityIndex = index;
                matchedIdentity = entry;
                break;
            }
        }
        if (identityIndex < 0) {
            for (let index = trace.records.length - 1; index >= 0; index -= 1) {
                const entry = trace.records[index];
                if (entry?.type === 'identity'
                    && entry?.userId === userId
                    && entry?.source === expectedSource) {
                    identityIndex = index;
                    matchedIdentity = entry;
                    break;
                }
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
        return {
            trace,
            matchedIdentity,
        };
    }, 5000, 'nextAuthTraceIdentityFailure');
/**
 * 记录identity。
 */
    const identity = trace.matchedIdentity ?? trace.trace.records.find((entry) => entry?.type === 'identity'
        && entry?.userId === userId
        && entry?.source === expectedSource);
    return {
        enabled: trace.trace.enabled,
        recordCount: trace.trace.records.length,
        identitySource: identity?.source ?? null,
        identityPlayerId: typeof identity?.playerId === 'string' ? identity.playerId : null,
        identityPersistAttempted: identity?.persistAttempted === true,
        identityPersistSucceeded: identity?.persistSucceeded === true ? true : identity?.persistSucceeded === false ? false : null,
        identityPersistFailureStage: typeof identity?.persistFailureStage === 'string' ? identity.persistFailureStage : null,
        snapshotPresent: trace.trace.records.some((entry) => entry?.type === 'snapshot'
            && entry?.playerId === (identity?.playerId ?? playerId)),
        bootstrapPresent: trace.trace.records.some((entry) => entry?.type === 'bootstrap'
            && entry?.playerId === (identity?.playerId ?? playerId)),
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * readPersistedIdentityPayload：读取PersistedIdentity载荷并返回结果。
 * @param userId user ID。
 * @param errorContext 参数说明。
 * @returns 无返回值，完成PersistedIdentity载荷的读取/组装。
 */

async function readPersistedIdentityPayload(userId, errorContext) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
async function writeInvalidPersistedIdentityDocument(userId, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const invalidUsername = `broken_${normalizedUserId.slice(0, 8) || 'user'}`;
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedUserId || !normalizedPlayerId) {
        throw new Error(`invalid persisted identity proof requires stable userId/playerId, got userId=${JSON.stringify(userId)} playerId=${JSON.stringify(playerId)}`);
    }
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
    `, [normalizedUserId, invalidUsername, normalizedPlayerId, invalidUsername, invalidUsername, 'native', JSON.stringify({
            version: 1,
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            gatherJob: {
                resourceNodeId: 'landmark.herb.green_spirit_stem',
                resourceNodeName: '青灵茎',
                phase: 'paused',
                startedAt: savedAt,
                totalTicks: 10,
                remainingTicks: 6,
                pausedTicks: 2,
                successRate: 0.85,
                spiritStoneCost: 0,
            },
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (error && typeof error === 'object' && error.code === '42P01') {
        return;
    }
    throw error;
}
/**
 * 规范化persistedidentity。
 */
function normalizePersistedIdentity(identity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * buildRetryDisplayName：构建并返回目标对象。
 * @param base 参数说明。
 * @param suffixSeed 参数说明。
 * @param offset 参数说明。
 * @returns 无返回值，直接更新Retry显示名称相关状态。
 */

function buildRetryDisplayName(base, suffixSeed, offset = 0) {
    const prefix = typeof base === 'string' && base.trim() ? base.trim().charAt(0) : '鉴';
    return buildSingleDisplayNameChar(`${prefix}:${suffixSeed}`, offset);
}
/**
 * buildRetryRoleName：构建并返回目标对象。
 * @param base 参数说明。
 * @param suffixSeed 参数说明。
 * @returns 无返回值，直接更新RetryRole名称相关状态。
 */

function buildRetryRoleName(base, suffixSeed) {
    const prefix = typeof base === 'string' && base.trim() ? base.trim().slice(0, 6) : '鉴角';
    return `${prefix}${buildCompactSeed(suffixSeed, 4)}`.slice(0, 12);
}
/**
 * buildSingleDisplayNameChar：构建并返回目标对象。
 * @param seed 参数说明。
 * @param offset 参数说明。
 * @returns 无返回值，直接更新Single显示名称Char相关状态。
 */

function buildSingleDisplayNameChar(seed, offset = 0) {
    const charStart = 0x4E00;
    const charSpan = 0x9FFF - charStart + 1;
    const codePoint = charStart + ((computeSeedHash(seed) + offset) % charSpan);
    return String.fromCodePoint(codePoint);
}
/**
 * buildCompactSeed：构建并返回目标对象。
 * @param seed 参数说明。
 * @param width 参数说明。
 * @returns 无返回值，直接更新CompactSeed相关状态。
 */

function buildCompactSeed(seed, width) {
    return computeSeedHash(seed).toString(36).padStart(width, '0').slice(-width);
}
/**
 * computeSeedHash：判断SeedHash是否满足条件。
 * @param seed 参数说明。
 * @returns 无返回值，直接更新SeedHash相关状态。
 */

function computeSeedHash(seed) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * collectExports：执行Export相关逻辑。
 * @param names 参数说明。
 * @returns 无返回值，直接更新Export相关状态。
 */

function collectExports(names) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

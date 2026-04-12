"use strict";
/**
 * 用途：执行 legacy-auth 兼容链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** socket_io_client_1：定义该变量以承载业务值。 */
const socket_io_client_1 = require("socket.io-client");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../../config/env-alias");
/**
 * 指定 legacy 认证兼容烟测的目标服务地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/**
 * 读取数据库连接串，用于决定是否走带数据库证明链。
 */
const SERVER_NEXT_DATABASE_URL = (0, env_alias_1.resolveServerNextDatabaseUrl)();
/**
 * 生成旧 JWT 令牌时使用的签名密钥。
 */
const JWT_SECRET = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';
/**
 * 控制 legacy 认证不可用时是否允许跳过烟测。
 */
const required = process.env.SERVER_NEXT_LEGACY_AUTH_REQUIRED === '1';
/**
 * 标记当前是否具备数据库环境，可决定测试分支。
 */
const hasDatabaseUrl = Boolean(SERVER_NEXT_DATABASE_URL);
/** LEGACY_HTTP_MEMORY_FALLBACK_ENABLED：定义该变量以承载业务值。 */
const LEGACY_HTTP_MEMORY_FALLBACK_ENABLED = readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK')
    || readBooleanEnv('NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK');
/**
 * 本次兼容烟测要使用或伪造的用户 ID。
 */
const userId = process.env.SERVER_NEXT_SMOKE_LEGACY_USER_ID
    ?? (hasDatabaseUrl ? (0, node_crypto_1.randomUUID)() : `legacy_user_${Date.now().toString(36)}`);
/**
 * 本次 legacy 令牌或兼容账号使用的用户名。
 */
const username = process.env.SERVER_NEXT_SMOKE_LEGACY_USERNAME ?? `legacy_${Date.now().toString(36)}`;
/**
 * 本次兼容链路验证使用的显示名。
 */
const displayName = process.env.SERVER_NEXT_SMOKE_LEGACY_DISPLAY_NAME
    ?? `旧令牌烟测${String.fromCodePoint(0x4E00 + (Date.now() % (0x9FFF - 0x4E00 + 1)))}`;
/**
 * 指定本次兼容夹具对应的玩家ID。
 */
const expectedPlayerId = process.env.SERVER_NEXT_SMOKE_LEGACY_PLAYER_ID ?? `p_${userId}`;
/**
 * 执行 legacy 令牌引导、账号兼容和登录回退的整套验证流程。
 */
async function main() {
/**
 * 记录bootstrapfixture。
 */
    let bootstrapFixture = null;
/**
 * 记录令牌bootstrap。
 */
    let tokenBootstrap = null;
/**
 * 记录accountcompat。
 */
    let accountCompat = null;
    try {
        if (!hasDatabaseUrl && !LEGACY_HTTP_MEMORY_FALLBACK_ENABLED) {
            throw new Error('legacy HTTP 内存兼容已关闭');
        }
        if (hasDatabaseUrl) {
            await seedLegacyCompatFixture();
        }
        bootstrapFixture = hasDatabaseUrl
            ? createSeededLegacyTokenBootstrapFixture()
            : await createCompatHttpBootstrapFixture();
        tokenBootstrap = await verifyLegacyTokenBootstrap(bootstrapFixture.token);
/**
 * 记录expected玩家ID。
 */
        const expectedPlayerId = bootstrapFixture.playerId;
/**
 * 记录nextinitpayload。
 */
        const nextInitPayload = tokenBootstrap.nextInit;
        if (!nextInitPayload?.pid || nextInitPayload.pid !== expectedPlayerId) {
            throw new Error(`next init player mismatch: expected=${expectedPlayerId} actual=${nextInitPayload?.pid ?? 'null'}`);
        }
/**
 * 记录状态。
 */
        const state = await fetchPlayerState(expectedPlayerId);
        if (!state?.player || state.player.playerId !== expectedPlayerId) {
            throw new Error(`runtime state missing expected player ${expectedPlayerId}`);
        }
/**
 * 记录loginfallback结果。
 */
        const loginFallbackResult = await verifyRoleNameLoginFallback();
        accountCompat = await verifyLegacyAccountCompat();
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId: expectedPlayerId,
            userId: bootstrapFixture.userId,
            sessionId: tokenBootstrap.nextInit.sid,
            protocolGuardRejectedCode: tokenBootstrap.protocolGuardCode,
            legacyProtocolGuardRejectedCode: tokenBootstrap.legacyProtocolMismatchCode,
            mapId: state.player?.templateId ?? null,
            mapEnterCount: tokenBootstrap.mapEnterCount,
            loginFallbackChecked: loginFallbackResult.checked,
            loginFallbackSkipped: loginFallbackResult.skipped ?? false,
            accountCompatPlayerId: accountCompat.playerId,
            accountCompatDisplayName: accountCompat.displayName,
            accountCompatRoleName: accountCompat.roleName,
            accountCompatRefreshChecked: accountCompat.refreshChecked,
        }, null, 2));
    }
    catch (error) {
/**
 * 记录message。
 */
        const message = error instanceof Error ? error.message : String(error);
        if (!required && isLegacyAuthSkip(error)) {
            console.log(JSON.stringify({
                ok: true,
                skipped: true,
                reason: message,
            }, null, 2));
            return;
        }
        throw error;
    }
    finally {
/**
 * 记录bootstrap玩家ID。
 */
        const bootstrapPlayerId = bootstrapFixture?.playerId ?? '';
        await deletePlayer(bootstrapPlayerId).catch(() => undefined);
        if (accountCompat?.playerId && accountCompat.playerId !== bootstrapPlayerId) {
            await deletePlayer(accountCompat.playerId).catch(() => undefined);
        }
        if (hasDatabaseUrl) {
            await cleanupLegacyCompatFixture().catch(() => undefined);
        }
    }
}
/**
 * 验证旧令牌在当前合同下的协议守卫与显式 next 引导结果。
 */
async function verifyLegacyTokenBootstrap(token) {
    await ensureNativeDocsForAccessToken(token);
/**
 * 记录协议守卫code。
 */
    const protocolGuardCode = await verifySocketProtocolRequired(token);
/**
 * 记录legacy协议不匹配code。
 */
    const legacyProtocolMismatchCode = await verifySocketLegacyProtocolMismatch(token);
/**
 * 记录socket。
 */
    const socket = connectSocket({
        token,
        protocol: 'next',
    });
/**
 * 记录nextinit。
 */
    let nextInit = null;
/**
 * 记录地图enter数量。
 */
    let mapEnterCount = 0;
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        nextInit = payload;
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
    });
    try {
        await onceConnected(socket);
        await waitFor(() => nextInit !== null && mapEnterCount > 0, 4_000);
        return {
            protocolGuardCode,
            legacyProtocolMismatchCode,
            nextInit,
            mapEnterCount,
        };
    }
    finally {
        socket.close();
    }
}
/**
 * 基于已写库的兼容夹具构造旧令牌引导样本。
 */
function createSeededLegacyTokenBootstrapFixture() {
    return {
        token: createLegacyToken({
            sub: userId,
            username,
            displayName,
        }),
        playerId: expectedPlayerId,
        userId,
    };
}
/**
 * 通过兼容 HTTP 注册流程临时创建一个可引导的测试账号。
 */
async function createCompatHttpBootstrapFixture() {
/**
 * 记录suffix。
 */
    const suffix = Date.now().toString(36).slice(-6);
/**
 * 记录account名称。
 */
    const accountName = `boot_${suffix}`;
/**
 * 记录password。
 */
    const password = `Boot_${suffix}`;
/**
 * 记录role名称。
 */
    const roleName = `令牌角${suffix.slice(-4)}`;
/**
 * 记录register结果。
 */
    const registerResult = await registerUser({
        accountName,
        password,
        displayName: buildUniqueDisplayName(`legacy-auth-bootstrap:${suffix}`),
        roleName,
    });
/**
 * 记录access令牌。
 */
    const accessToken = typeof registerResult?.accessToken === 'string' ? registerResult.accessToken.trim() : '';
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(accessToken);
/**
 * 记录玩家ID。
 */
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
/**
 * 记录bootstrapuserID。
 */
    const bootstrapUserId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!accessToken || !playerId || !bootstrapUserId) {
        throw new Error(`compat bootstrap token payload mismatch: ${JSON.stringify(payload)}`);
    }
    return {
        token: accessToken,
        playerId,
        userId: bootstrapUserId,
    };
}
/**
 * 验证旧账号链路下的刷新令牌、改名、改密和再次登录能力。
 */
async function verifyLegacyAccountCompat() {
/**
 * 记录suffix。
 */
    const suffix = Date.now().toString(36).slice(-6);
/**
 * 记录account名称。
 */
    const accountName = `acct_${suffix}`;
/**
 * 记录password。
 */
    const password = `Pass_${suffix}`;
/**
 * 记录nextpassword。
 */
    const nextPassword = `Next_${suffix}`;
/**
 * 记录initial显示信息名称。
 */
    const initialDisplayName = buildUniqueDisplayName(`legacy-auth-initial:${suffix}`);
/**
 * 记录next显示信息名称。
 */
    let nextDisplayName = '';
/**
 * 记录initialrole名称。
 */
    const initialRoleName = `甲角${suffix.slice(-4)}`;
/**
 * 记录nextrole名称。
 */
    const nextRoleName = `丙角${suffix.slice(-4)}`;
/**
 * 记录register结果。
 */
    const registerResult = await registerUser({
        accountName,
        password,
        displayName: initialDisplayName,
        roleName: initialRoleName,
    });
/**
 * 记录refresh结果。
 */
    const refreshResult = await requestJson('/auth/refresh', {
        method: 'POST',
        body: {
            refreshToken: registerResult?.refreshToken,
        },
    });
    if (typeof refreshResult?.accessToken !== 'string' || !refreshResult.accessToken) {
        throw new Error(`refresh payload mismatch: ${JSON.stringify(refreshResult)}`);
    }
/**
 * 记录login结果。
 */
    const loginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
    await ensureNativeDocsForAccessToken(loginResult?.accessToken);
/**
 * 记录initial会话。
 */
    const initialSession = await bootstrapExplicitNextSession(loginResult?.accessToken, initialRoleName, initialDisplayName);
/**
 * 记录玩家ID。
 */
    const playerId = initialSession.playerId;
    await waitForPlayerIdentity(playerId, {
        roleName: initialRoleName,
        displayName: initialDisplayName,
    }, 4_000, 'initial runtime identity');
    nextDisplayName = await updateDisplayNameWithRetry(loginResult.accessToken, `legacy-auth-next:${suffix}`);
    await authedRequestJson('/account/role-name', loginResult.accessToken, {
        method: 'POST',
        body: {
            roleName: nextRoleName,
        },
    });
    await authedRequestJson('/account/password', loginResult.accessToken, {
        method: 'POST',
        body: {
            currentPassword: password,
            newPassword: nextPassword,
        },
    });
    await waitForPlayerIdentity(playerId, {
        roleName: nextRoleName,
        displayName: nextDisplayName,
    }, 4_000, 'updated runtime identity');
/**
 * 记录stale令牌会话。
 */
    const staleTokenSession = await bootstrapExplicitNextSession(loginResult.accessToken, nextRoleName, nextDisplayName);
    if (staleTokenSession.playerId !== playerId) {
        throw new Error(`stale token bootstrap player mismatch: expected=${playerId} actual=${staleTokenSession.playerId}`);
    }
    await expectRequestFailure('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    }, 401);
/**
 * 记录relogin结果。
 */
    const reloginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password: nextPassword,
        },
    });
    await ensureNativeDocsForAccessToken(reloginResult?.accessToken);
    await bootstrapExplicitNextSession(reloginResult?.accessToken, nextRoleName, nextDisplayName);
    return {
        playerId,
        displayName: nextDisplayName,
        roleName: nextRoleName,
        refreshChecked: true,
    };
}
/**
 * 按旧协议格式手工签发兼容 JWT。
 */
function createLegacyToken(payload) {
/**
 * 记录header。
 */
    const header = encodeJwtSegment({
        alg: 'HS256',
        typ: 'JWT',
    });
/**
 * 记录now。
 */
    const now = Math.floor(Date.now() / 1000);
/**
 * 记录请求体。
 */
    const body = encodeJwtSegment({
        sub: payload.sub,
        username: payload.username,
        displayName: payload.displayName,
        iat: now,
        exp: now + 60 * 10,
    });
/**
 * 记录signature。
 */
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', JWT_SECRET)
        .update(`${header}.${body}`)
        .digest());
    return `${header}.${body}.${signature}`;
}
/**
 * 处理onceconnected。
 */
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4_000);
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
 * 读取指定玩家的运行态快照。
 */
async function fetchPlayerState(playerId) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (response.status === 503 || response.status === 401) {
        throw new Error(`runtime access unavailable: ${response.status}`);
    }
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 轮询玩家身份信息，直到角色名和显示名同步完成。
 */
async function waitForPlayerIdentity(playerId, expected, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitForAsync(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchPlayerState(playerId);
/**
 * 记录玩家。
 */
        const player = payload?.player ?? null;
        if (!player) {
            return false;
        }
        if (expected.roleName && player.name !== expected.roleName) {
            return false;
        }
        if (expected.displayName && player.displayName !== expected.displayName) {
            return false;
        }
        resolved = player;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 验证旧登录流程对角色名登录的回退兼容是否生效。
 */
async function verifyRoleNameLoginFallback() {
    if (hasDatabaseUrl) {
        return { checked: false, skipped: true };
    }
/**
 * 记录suffix。
 */
    const suffix = Date.now().toString(36);
/**
 * 记录directaccount名称。
 */
    const directAccountName = `acct_${suffix}`;
/**
 * 记录roleowneraccount名称。
 */
    const roleOwnerAccountName = `role_${suffix}`;
/**
 * 记录directpassword。
 */
    const directPassword = `acctPass_${suffix}`;
/**
 * 记录rolepassword。
 */
    const rolePassword = `rolePass_${suffix}`;
    await registerUser({
        accountName: directAccountName,
        password: directPassword,
        displayName: buildUniqueDisplayName(`legacy-auth-role-direct:${suffix}`),
        roleName: `甲角${suffix}`,
    });
    await registerUser({
        accountName: roleOwnerAccountName,
        password: rolePassword,
        displayName: buildUniqueDisplayName(`legacy-auth-role-owner:${suffix}`),
        roleName: directAccountName,
    });
/**
 * 记录login结果。
 */
    const loginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: directAccountName,
            password: rolePassword,
        },
    });
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(loginResult?.accessToken);
    if (!payload || payload.username !== roleOwnerAccountName) {
        throw new Error(`role-name fallback login mismatch: expected=${roleOwnerAccountName} actual=${payload?.username ?? 'null'}`);
    }
    return { checked: true };
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 处理registeruser。
 */
async function registerUser(body) {
    return requestJson('/auth/register', {
        method: 'POST',
        body,
    });
}
/**
 * 补齐 legacy 兼容测试依赖的数据库表和字段结构。
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
 * 向数据库写入 legacy 兼容烟测所需的初始化数据。
 */
async function seedLegacyCompatFixture() {
    await ensureLegacyCompatSchema();
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query(`
      INSERT INTO users(id, username, "displayName", "pendingRoleName", "passwordHash")
      VALUES ($1::uuid, $2, $3, $4, $5)
      ON CONFLICT (id)
      DO UPDATE SET
        username = EXCLUDED.username,
        "displayName" = EXCLUDED."displayName",
        "pendingRoleName" = EXCLUDED."pendingRoleName",
        "passwordHash" = EXCLUDED."passwordHash"
    `, [userId, username, displayName, displayName, 'legacy-auth-smoke']);
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
        $1, $2::uuid, $3, 'yunlai_town', 'yunlai_town', 32, 5, 1, 87, 100, 12,
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
    `, [expectedPlayerId, userId, displayName]);
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_identities_v1', userId, JSON.stringify({
                version: 1,
                userId,
                username,
                displayName,
                playerId: expectedPlayerId,
                playerName: displayName,
                persistedSource: 'legacy_sync',
                updatedAt: Date.now(),
            })]);
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_snapshots_v1', expectedPlayerId, JSON.stringify({
                version: 1,
                savedAt: Date.now(),
                placement: {
                    templateId: 'yunlai_town',
                    x: 32,
                    y: 5,
                    facing: 1,
                },
                vitals: {
                    hp: 87,
                    maxHp: 100,
                    qi: 12,
                    maxQi: 100,
                },
                progression: {
                    foundation: 0,
                    combatExp: 0,
                    bodyTraining: null,
                    boneAgeBaseYears: 18,
                    lifeElapsedTicks: 0,
                    lifespanYears: null,
                    realm: null,
                    heavenGate: null,
                    spiritualRoots: null,
                },
                unlockedMapIds: ['yunlai_town'],
                inventory: {
                    revision: 1,
                    capacity: 24,
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
                    persistedSource: 'legacy_seeded',
                    seededAt: Date.now(),
                },
            })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 在带库 smoke 中，确保 access token 对应账号已有 next identity/snapshot 真源文档。
 */
async function ensureNativeDocsForAccessToken(token) {
    if (!hasDatabaseUrl || typeof token !== 'string' || !token.trim()) {
        return;
    }
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录用户ID。
 */
    const tokenUserId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/**
 * 记录玩家ID。
 */
    let tokenPlayerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
/**
 * 记录用户名。
 */
    let tokenUsername = typeof payload?.username === 'string' ? payload.username.trim() : '';
/**
 * 记录显示名。
 */
    let tokenDisplayName = typeof payload?.displayName === 'string' ? payload.displayName.trim() : '';
/**
 * 记录角色名。
 */
    let tokenPlayerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : tokenDisplayName;
    if (!tokenUserId) {
        return;
    }
/** pool：定义该变量以承载业务值。 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        if (!tokenPlayerId) {
/** playerResult：定义该变量以承载业务值。 */
            const playerResult = await pool.query('SELECT id, name FROM players WHERE "userId" = $1::uuid LIMIT 1', [tokenUserId]);
/** playerRow：定义该变量以承载业务值。 */
            const playerRow = Array.isArray(playerResult?.rows) ? playerResult.rows[0] : null;
            tokenPlayerId = typeof playerRow?.id === 'string' ? playerRow.id.trim() : tokenPlayerId;
            if (!tokenPlayerName) {
                tokenPlayerName = typeof playerRow?.name === 'string' ? playerRow.name.trim() : tokenPlayerName;
            }
        }
        if (!tokenUsername || !tokenDisplayName) {
/** userResult：定义该变量以承载业务值。 */
            const userResult = await pool.query('SELECT username, "displayName" FROM users WHERE id = $1::uuid LIMIT 1', [tokenUserId]);
/** userRow：定义该变量以承载业务值。 */
            const userRow = Array.isArray(userResult?.rows) ? userResult.rows[0] : null;
            if (!tokenUsername) {
                tokenUsername = typeof userRow?.username === 'string' ? userRow.username.trim() : tokenUsername;
            }
            if (!tokenDisplayName) {
                tokenDisplayName = typeof userRow?.displayName === 'string' ? userRow.displayName.trim() : tokenDisplayName;
            }
        }
        if (!tokenPlayerName) {
            tokenPlayerName = tokenDisplayName;
        }
        if (!tokenPlayerId || !tokenUsername || !tokenDisplayName || !tokenPlayerName) {
            return;
        }
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_identities_v1', tokenUserId, JSON.stringify({
                version: 1,
                userId: tokenUserId,
                username: tokenUsername,
                displayName: tokenDisplayName,
                playerId: tokenPlayerId,
                playerName: tokenPlayerName,
                persistedSource: 'token_seed',
                updatedAt: Date.now(),
            })]);
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_snapshots_v1', tokenPlayerId, JSON.stringify({
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
                    boneAgeBaseYears: 18,
                    lifeElapsedTicks: 0,
                    lifespanYears: null,
                    realm: null,
                    heavenGate: null,
                    spiritualRoots: null,
                },
                unlockedMapIds: ['yunlai_town'],
                inventory: {
                    revision: 1,
                    capacity: 24,
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
                    persistedSource: 'native',
                    seededAt: Date.now(),
                },
            })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 清理 legacy 兼容烟测写入的数据库夹具数据。
 */
async function cleanupLegacyCompatFixture() {
/**
 * 记录pool。
 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_snapshots_v1', expectedPlayerId]).catch(ignoreMissingLegacyFixtureCleanupError);
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_next_player_identities_v1', userId]).catch(ignoreMissingLegacyFixtureCleanupError);
        await pool.query('DELETE FROM players WHERE id = $1', [expectedPlayerId]).catch(ignoreMissingLegacyFixtureCleanupError);
        await pool.query('DELETE FROM users WHERE id = $1::uuid', [userId]).catch(ignoreMissingLegacyFixtureCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理authedrequestjson。
 */
async function authedRequestJson(path, token, init) {
    return requestJson(path, {
        ...init,
        headers: {
            authorization: `Bearer ${token}`,
            ...(init?.headers ?? {}),
        },
    });
}
/**
 * 处理expectrequestfailure。
 */
async function expectRequestFailure(path, init, expectedStatus) {
/**
 * 记录请求体。
 */
    const body = init?.body && typeof init.body !== 'string'
        ? JSON.stringify(init.body)
        : init?.body;
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
        ...init,
        body,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    if (response.status !== expectedStatus) {
        throw new Error(`unexpected status for ${path}: expected=${expectedStatus} actual=${response.status} body=${await response.text()}`);
    }
}
/**
 * 处理requestjson。
 */
async function requestJson(path, init) {
/**
 * 记录请求体。
 */
    const body = init?.body && typeof init.body !== 'string'
        ? JSON.stringify(init.body)
        : init?.body;
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
        ...init,
        body,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理connectsocket。
 */
function connectSocket(auth) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth,
    });
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
    return socket;
}
/**
 * 验证 token/gmToken 缺少握手协议时会被明确拒绝。
 */
async function verifySocketProtocolRequired(token) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token,
        },
    });
/**
 * 记录协议守卫错误。
 */
    let protocolGuardError = null;
    socket.on(shared_1.S2C.Error, (payload) => {
        protocolGuardError = payload ?? null;
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        protocolGuardError = payload ?? null;
    });
    try {
        await onceConnected(socket);
        await waitFor(() => protocolGuardError?.code === 'AUTH_PROTOCOL_REQUIRED', 4_000);
        return protocolGuardError.code;
    }
    finally {
        socket.close();
    }
}
/**
 * 验证 token 在 legacy 握手下会命中协议不匹配守卫。
 */
async function verifySocketLegacyProtocolMismatch(token) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token,
            protocol: 'legacy',
        },
    });
/**
 * 记录协议守卫错误。
 */
    let protocolGuardError = null;
    socket.on(shared_1.S2C.Error, (payload) => {
        protocolGuardError = payload ?? null;
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        protocolGuardError = payload ?? null;
    });
    try {
        await onceConnected(socket);
        await waitFor(() => protocolGuardError?.code === resolveExpectedLegacySocketProtocolGuardCode(), 4_000);
        return protocolGuardError.code;
    }
    finally {
        socket.close();
    }
}
/**
 * 使用显式 next 握手建立一次兼容访问令牌的引导会话并校验身份。
 */
async function bootstrapExplicitNextSession(token, expectedRoleName, expectedDisplayName) {
/**
 * 记录socket。
 */
    const socket = connectSocket({
        token,
        protocol: 'next',
    });
/**
 * 记录nextinit。
 */
    let nextInit = null;
    try {
        socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
            nextInit = payload;
        });
        await onceConnected(socket);
        await waitFor(() => nextInit !== null, 4_000);
/**
 * 记录玩家ID。
 */
        const playerId = nextInit?.pid ?? '';
        if (!playerId) {
            throw new Error('explicit-next bootstrap missing playerId');
        }
/**
 * 记录状态。
 */
        const state = await fetchPlayerState(playerId);
        if (expectedRoleName && state?.player?.name !== expectedRoleName) {
            throw new Error(`explicit-next bootstrap role mismatch: expected=${expectedRoleName} actual=${state?.player?.name ?? 'null'}`);
        }
        if (expectedDisplayName && state?.player?.displayName !== expectedDisplayName) {
            throw new Error(`explicit-next bootstrap display mismatch: expected=${expectedDisplayName} actual=${state?.player?.displayName ?? 'null'}`);
        }
        return {
            playerId,
            nextInit,
        };
    }
    finally {
        socket.close();
    }
}
/**
 * 判断当前错误是否属于允许跳过的 legacy 认证缺失场景。
 */
function isLegacyAuthSkip(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.message.includes('runtime access unavailable')
        || error.message.includes('legacy HTTP 内存兼容已关闭');
}
/**
 * 处理encodejwtsegment。
 */
function encodeJwtSegment(value) {
    return base64UrlEncode(Buffer.from(JSON.stringify(value)));
}
/**
 * 处理base64URLencode。
 */
function base64UrlEncode(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
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
        return JSON.parse(base64UrlDecode(segments[1]).toString('utf8'));
    }
    catch {
        return null;
    }
}
/**
 * 处理base64URLdecode。
 */
function base64UrlDecode(value) {
/**
 * 记录normalized。
 */
    const normalized = value
        .replace(/-/g, '+')
        .replace(/_/g, '/');
/**
 * 记录padding。
 */
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64');
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
 * 等待forasync。
 */
async function waitForAsync(predicate, timeoutMs, label = 'waitForAsync') {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`${label} timeout`);
        }
        await delay(100);
    }
}
/**
 * 构建unique显示信息名称。
 */
function buildUniqueDisplayName(seed) {
/**
 * 记录hash。
 */
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
/** updateDisplayNameWithRetry：执行对应的业务逻辑。 */
async function updateDisplayNameWithRetry(accessToken, seed, maxAttempts = 64) {
/** lastError：定义该变量以承载业务值。 */
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = buildUniqueDisplayName(`${seed}:${attempt}`);
        try {
            await authedRequestJson('/account/display-name', accessToken, {
                method: 'POST',
                body: {
                    displayName: candidate,
                },
            });
            return candidate;
        }
        catch (error) {
            lastError = error;
/** message：定义该变量以承载业务值。 */
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('显示名已被占用') && !message.includes('duplicate key value violates unique constraint')) {
                throw error;
            }
        }
    }
    throw lastError ?? new Error('display name update failed');
}
/** resolveExpectedLegacySocketProtocolGuardCode：执行对应的业务逻辑。 */
function resolveExpectedLegacySocketProtocolGuardCode() {
    return readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL')
        || readBooleanEnv('NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL')
        ? 'AUTH_PROTOCOL_MISMATCH'
        : 'LEGACY_PROTOCOL_DISABLED';
}
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
/**
 * 处理ignoremissinglegacyfixturecleanuperror。
 */
function ignoreMissingLegacyFixtureCleanupError(error) {
    if (error && typeof error === 'object' && error.code === '42P01') {
        return;
    }
    throw error;
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=legacy-auth-smoke.js.map

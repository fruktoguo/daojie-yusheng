"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../../config/env-alias");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
const SERVER_NEXT_DATABASE_URL = (0, env_alias_1.resolveServerNextDatabaseUrl)();
const JWT_SECRET = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';
const required = process.env.SERVER_NEXT_LEGACY_AUTH_REQUIRED === '1';
const hasDatabaseUrl = Boolean(SERVER_NEXT_DATABASE_URL);
const userId = process.env.SERVER_NEXT_SMOKE_LEGACY_USER_ID
    ?? (hasDatabaseUrl ? (0, node_crypto_1.randomUUID)() : `legacy_user_${Date.now().toString(36)}`);
const username = process.env.SERVER_NEXT_SMOKE_LEGACY_USERNAME ?? `legacy_${Date.now().toString(36)}`;
const displayName = process.env.SERVER_NEXT_SMOKE_LEGACY_DISPLAY_NAME ?? '旧令牌烟测';
async function main() {
    let bootstrapFixture = null;
    let tokenBootstrap = null;
    let accountCompat = null;
    try {
        if (hasDatabaseUrl) {
            await seedLegacyCompatFixture();
        }
        bootstrapFixture = hasDatabaseUrl
            ? createSeededLegacyTokenBootstrapFixture()
            : await createCompatHttpBootstrapFixture();
        tokenBootstrap = await verifyLegacyTokenBootstrap(bootstrapFixture.token);
        const expectedPlayerId = bootstrapFixture.playerId;
        const legacyInitPayload = tokenBootstrap.legacyInit;
        const nextInitPayload = tokenBootstrap.nextInit;
        if (!legacyInitPayload?.self || legacyInitPayload.self.id !== expectedPlayerId) {
            throw new Error(`legacy init player mismatch: expected=${expectedPlayerId} actual=${legacyInitPayload?.self?.id ?? 'null'}`);
        }
        if (!nextInitPayload?.pid || nextInitPayload.pid !== expectedPlayerId) {
            throw new Error(`next init player mismatch: expected=${expectedPlayerId} actual=${nextInitPayload?.pid ?? 'null'}`);
        }
        const state = await fetchPlayerState(expectedPlayerId);
        if (!state?.player || state.player.playerId !== expectedPlayerId) {
            throw new Error(`runtime state missing expected player ${expectedPlayerId}`);
        }
        const loginFallbackResult = await verifyRoleNameLoginFallback();
        accountCompat = await verifyLegacyAccountCompat();
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId: expectedPlayerId,
            userId: bootstrapFixture.userId,
            sessionId: tokenBootstrap.nextInit.sid,
            mapId: legacyInitPayload.mapMeta?.id ?? null,
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
async function verifyLegacyTokenBootstrap(token) {
    const socket = connectSocket({
        token,
    });
    let legacyInit = null;
    let nextInit = null;
    let mapEnterCount = 0;
    socket.on(shared_1.S2C.Init, (payload) => {
        legacyInit = payload;
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        nextInit = payload;
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
    });
    try {
        await onceConnected(socket);
        await waitFor(() => legacyInit !== null && nextInit !== null && mapEnterCount > 0, 4_000);
        return {
            legacyInit,
            nextInit,
            mapEnterCount,
        };
    }
    finally {
        socket.close();
    }
}
function createSeededLegacyTokenBootstrapFixture() {
    return {
        token: createLegacyToken({
            sub: userId,
            username,
            displayName,
        }),
        playerId: `p_${userId}`,
        userId,
    };
}
async function createCompatHttpBootstrapFixture() {
    const suffix = Date.now().toString(36).slice(-6);
    const accountName = `boot_${suffix}`;
    const password = `Boot_${suffix}`;
    const roleName = `令牌角${suffix.slice(-4)}`;
    const registerResult = await registerUser({
        accountName,
        password,
        displayName: buildUniqueDisplayName(`legacy-auth-bootstrap:${suffix}`),
        roleName,
    });
    const accessToken = typeof registerResult?.accessToken === 'string' ? registerResult.accessToken.trim() : '';
    const payload = parseJwtPayload(accessToken);
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
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
async function verifyLegacyAccountCompat() {
    const suffix = Date.now().toString(36).slice(-6);
    const accountName = `acct_${suffix}`;
    const password = `Pass_${suffix}`;
    const nextPassword = `Next_${suffix}`;
    const initialDisplayName = buildUniqueDisplayName(`legacy-auth-initial:${suffix}`);
    const nextDisplayName = buildUniqueDisplayName(`legacy-auth-next:${suffix}`);
    const initialRoleName = `甲角${suffix.slice(-4)}`;
    const nextRoleName = `丙角${suffix.slice(-4)}`;
    const registerResult = await registerUser({
        accountName,
        password,
        displayName: initialDisplayName,
        roleName: initialRoleName,
    });
    const refreshResult = await requestJson('/auth/refresh', {
        method: 'POST',
        body: {
            refreshToken: registerResult?.refreshToken,
        },
    });
    if (typeof refreshResult?.accessToken !== 'string' || !refreshResult.accessToken) {
        throw new Error(`refresh payload mismatch: ${JSON.stringify(refreshResult)}`);
    }
    const loginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
    const initialSession = await bootstrapLegacyOnlySession(loginResult?.accessToken, initialRoleName, initialDisplayName);
    const playerId = initialSession.playerId;
    await waitForPlayerIdentity(playerId, {
        roleName: initialRoleName,
        displayName: initialDisplayName,
    }, 4_000, 'initial runtime identity');
    await authedRequestJson('/account/display-name', loginResult.accessToken, {
        method: 'POST',
        body: {
            displayName: nextDisplayName,
        },
    });
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
    const staleTokenSession = await bootstrapLegacyOnlySession(loginResult.accessToken, nextRoleName, nextDisplayName);
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
    const reloginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password: nextPassword,
        },
    });
    await bootstrapLegacyOnlySession(reloginResult?.accessToken, nextRoleName, nextDisplayName);
    return {
        playerId,
        displayName: nextDisplayName,
        roleName: nextRoleName,
        refreshChecked: true,
    };
}
function createLegacyToken(payload) {
    const header = encodeJwtSegment({
        alg: 'HS256',
        typ: 'JWT',
    });
    const now = Math.floor(Date.now() / 1000);
    const body = encodeJwtSegment({
        sub: payload.sub,
        username: payload.username,
        displayName: payload.displayName,
        iat: now,
        exp: now + 60 * 10,
    });
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', JWT_SECRET)
        .update(`${header}.${body}`)
        .digest());
    return `${header}.${body}.${signature}`;
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
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
async function waitFor(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
async function fetchPlayerState(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (response.status === 503 || response.status === 401) {
        throw new Error(`runtime access unavailable: ${response.status}`);
    }
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function waitForPlayerIdentity(playerId, expected, timeoutMs, label) {
    let resolved = null;
    await waitForAsync(async () => {
        const payload = await fetchPlayerState(playerId);
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
async function verifyRoleNameLoginFallback() {
    if (hasDatabaseUrl) {
        return { checked: false, skipped: true };
    }
    const suffix = Date.now().toString(36);
    const directAccountName = `acct_${suffix}`;
    const roleOwnerAccountName = `role_${suffix}`;
    const directPassword = `acctPass_${suffix}`;
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
    const loginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: directAccountName,
            password: rolePassword,
        },
    });
    const payload = parseJwtPayload(loginResult?.accessToken);
    if (!payload || payload.username !== roleOwnerAccountName) {
        throw new Error(`role-name fallback login mismatch: expected=${roleOwnerAccountName} actual=${payload?.username ?? 'null'}`);
    }
    return { checked: true };
}
async function deletePlayer(playerIdToDelete) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
async function registerUser(body) {
    return requestJson('/auth/register', {
        method: 'POST',
        body,
    });
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
async function seedLegacyCompatFixture() {
    await ensureLegacyCompatSchema();
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
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function cleanupLegacyCompatFixture() {
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM players WHERE id = $1', [expectedPlayerId]).catch(ignoreMissingLegacyFixtureCleanupError);
        await pool.query('DELETE FROM users WHERE id = $1::uuid', [userId]).catch(ignoreMissingLegacyFixtureCleanupError);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
async function authedRequestJson(path, token, init) {
    return requestJson(path, {
        ...init,
        headers: {
            authorization: `Bearer ${token}`,
            ...(init?.headers ?? {}),
        },
    });
}
async function expectRequestFailure(path, init, expectedStatus) {
    const body = init?.body && typeof init.body !== 'string'
        ? JSON.stringify(init.body)
        : init?.body;
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
async function requestJson(path, init) {
    const body = init?.body && typeof init.body !== 'string'
        ? JSON.stringify(init.body)
        : init?.body;
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
function connectSocket(auth) {
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
async function bootstrapLegacyOnlySession(token, expectedRoleName, expectedDisplayName) {
    const socket = connectSocket({
        token,
        protocol: 'legacy',
    });
    let legacyInit = null;
    try {
        socket.on(shared_1.S2C.Init, (payload) => {
            legacyInit = payload;
        });
        await onceConnected(socket);
        await waitFor(() => legacyInit !== null, 4_000);
        const playerId = legacyInit?.self?.id ?? '';
        if (!playerId) {
            throw new Error('legacy-only bootstrap missing playerId');
        }
        if (expectedRoleName && legacyInit?.self?.name !== expectedRoleName) {
            throw new Error(`legacy-only bootstrap role mismatch: expected=${expectedRoleName} actual=${legacyInit?.self?.name ?? 'null'}`);
        }
        if (expectedDisplayName && legacyInit?.self?.displayName !== expectedDisplayName) {
            throw new Error(`legacy-only bootstrap display mismatch: expected=${expectedDisplayName} actual=${legacyInit?.self?.displayName ?? 'null'}`);
        }
        return {
            playerId,
            legacyInit,
        };
    }
    finally {
        socket.close();
    }
}
function isLegacyAuthSkip(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.message.includes('runtime access unavailable');
}
function encodeJwtSegment(value) {
    return base64UrlEncode(Buffer.from(JSON.stringify(value)));
}
function base64UrlEncode(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
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
        return JSON.parse(base64UrlDecode(segments[1]).toString('utf8'));
    }
    catch {
        return null;
    }
}
function base64UrlDecode(value) {
    const normalized = value
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64');
}
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function waitForAsync(predicate, timeoutMs, label = 'waitForAsync') {
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`${label} timeout`);
        }
        await delay(100);
    }
}
function buildUniqueDisplayName(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
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

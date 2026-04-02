"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const JWT_SECRET = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';
const required = process.env.SERVER_NEXT_LEGACY_AUTH_REQUIRED === '1';
const userId = process.env.SERVER_NEXT_SMOKE_LEGACY_USER_ID ?? `legacy_user_${Date.now().toString(36)}`;
const username = process.env.SERVER_NEXT_SMOKE_LEGACY_USERNAME ?? `legacy_${Date.now().toString(36)}`;
const displayName = process.env.SERVER_NEXT_SMOKE_LEGACY_DISPLAY_NAME ?? '旧令牌烟测';
const expectedPlayerId = `p_${userId}`;
const hasDatabaseUrl = Boolean(process.env.SERVER_NEXT_DATABASE_URL);
async function main() {
    const token = createLegacyToken({
        sub: userId,
        username,
        displayName,
    });
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token,
        },
    });
    let legacyInit = null;
    let nextInit = null;
    let mapEnterCount = 0;
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
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
        const legacyInitPayload = legacyInit;
        const nextInitPayload = nextInit;
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
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId: expectedPlayerId,
            userId,
            sessionId: nextInitPayload.sid,
            mapId: legacyInitPayload.mapMeta?.id ?? null,
            mapEnterCount,
            loginFallbackChecked: loginFallbackResult.checked,
            loginFallbackSkipped: loginFallbackResult.skipped ?? false,
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
        socket.close();
        await deletePlayer(expectedPlayerId).catch(() => undefined);
    }
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
        displayName: '甲',
        roleName: `甲角${suffix}`,
    });
    await registerUser({
        accountName: roleOwnerAccountName,
        password: rolePassword,
        displayName: '乙',
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
    const response = await fetch(`${SERVER_NEXT_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`register failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=legacy-auth-smoke.js.map

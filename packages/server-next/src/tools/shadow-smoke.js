"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const serverUrl = String(process.env.SERVER_NEXT_SHADOW_URL ?? process.env.SERVER_NEXT_URL ?? '').trim() || 'http://127.0.0.1:11923';
const gmPassword = String(process.env.SERVER_NEXT_GM_PASSWORD ?? '').trim() || 'admin123';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `shadow_${Date.now().toString(36)}`;
async function main() {
    const health = await fetchJson('/health');
    if (health?.ok !== true) {
        throw new Error(`unexpected /health payload: ${JSON.stringify(health)}`);
    }
    if (health?.readiness?.ok !== true) {
        throw new Error(`expected readiness.ok=true, got ${JSON.stringify(health?.readiness ?? null)}`);
    }
    if (health?.readiness?.maintenance?.active === true) {
        throw new Error(`expected maintenance inactive, got ${JSON.stringify(health.readiness.maintenance)}`);
    }
    const token = await loginGm();
    const gmState = await fetchJson('/gm/state', {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
    if (!gmState || !Array.isArray(gmState.players) || !Array.isArray(gmState.mapIds)) {
        throw new Error(`unexpected /gm/state payload: ${JSON.stringify(gmState)}`);
    }
    const socket = (0, socket_io_client_1.io)(serverUrl, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const events = [];
    let sessionInit = null;
    let mapEnterCount = 0;
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`shadow socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        sessionInit = payload;
        events.push(payload?.resumed ? 'init:resumed' : 'init:new');
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
        events.push('mapEnter');
    });
    await onceConnected(socket);
    socket.emit('n:c:hello', {
        playerId,
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => sessionInit !== null && mapEnterCount > 0, 5000);
    socket.close();
    console.log(JSON.stringify({
        ok: true,
        url: serverUrl,
        playerId,
        gmState: {
            playerCount: gmState.players.length,
            mapCount: gmState.mapIds.length,
            botCount: gmState.botCount ?? null,
        },
        health: {
            ready: health.readiness.ok,
            maintenance: health.readiness.maintenance?.active ?? false,
        },
        session: {
            sessionId: sessionInit?.sid ?? null,
            resumed: sessionInit?.resumed ?? null,
            mapEnterCount,
        },
        events,
    }, null, 2));
}
async function loginGm() {
    const response = await fetch(`${serverUrl}/auth/gm/login`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            password: gmPassword,
        }),
    });
    if (!response.ok) {
        throw new Error(`gm login failed: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    const token = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
    if (!token) {
        throw new Error(`gm login missing accessToken: ${JSON.stringify(payload)}`);
    }
    return token;
}
async function fetchJson(path, options) {
    const response = await fetch(`${serverUrl}${path}`, options);
    if (!response.ok) {
        throw new Error(`request failed: ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

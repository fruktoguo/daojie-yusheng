"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
const defaultPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3112);
let currentPort = defaultPort;
let baseUrl = `http://127.0.0.1:${currentPort}`;
let playerId = '';
let accessToken = '';
async function main() {
    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'SERVER_NEXT_DATABASE_URL/DATABASE_URL missing',
        }, null, 2));
        return;
    }
    let reconnectTarget = null;
    let server = await startServer();
    try {
        await waitForHealth();
        const auth = await registerAndLoginPlayer();
        accessToken = auth.accessToken;
        reconnectTarget = await connectAndMutate(accessToken);
    }
    finally {
        await stopServer(server);
    }
    server = await startServer();
    try {
        await waitForHealth();
        const restored = await reconnectAndRead(reconnectTarget);
        console.log(JSON.stringify({
            ok: true,
            playerId,
            restored,
        }, null, 2));
    }
    finally {
        if (playerId) {
            await deletePlayer(playerId).catch(() => undefined);
        }
        await stopServer(server);
    }
}
async function connectAndMutate(token) {
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'next',
        },
    });
    const initSession = waitForSocketEvent(socket, shared_1.NEXT_S2C.InitSession);
    const mapEnter = waitForSocketEvent(socket, shared_1.NEXT_S2C.MapEnter);
    await onceConnected(socket);
    const initPayload = await initSession;
    playerId = typeof initPayload?.pid === 'string' ? initPayload.pid.trim() : '';
    if (!playerId) {
        throw new Error(`invalid init session payload: ${JSON.stringify(initPayload)}`);
    }
    await mapEnter;
    socket.emit('n:c:usePortal', {});
    await waitForCondition(async () => {
        const state = await fetchJson(`${baseUrl}/runtime/players/${playerId}/view`);
        return state.view?.instance.templateId === 'wildlands';
    }, 5000);
    await postJson(`/runtime/players/${playerId}/vitals`, {
        hp: 61,
        qi: 23,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'rat_tail',
        count: 3,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'map.bamboo_forest',
        count: 1,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'spirit_stone',
        count: 1,
    });
    let state = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
    const mapSlot = state.player.inventory.items.findIndex((entry) => entry.itemId === 'map.bamboo_forest');
    if (mapSlot < 0) {
        throw new Error('map unlock item missing before persistence mutation');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: mapSlot });
    await waitForCondition(async () => {
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        if (!playerState.player?.unlockedMapIds?.includes('bamboo_forest')) {
            return false;
        }
        return playerState.player.inventory.items.every((entry) => entry.itemId !== 'map.bamboo_forest');
    }, 5000);
    state = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
    const spiritStoneSlot = state.player.inventory.items.findIndex((entry) => entry.itemId === 'spirit_stone');
    if (spiritStoneSlot < 0) {
        throw new Error('spirit stone missing before persistence mutation');
    }
    const auraBefore = await fetchJson(`${baseUrl}/runtime/instances/${state.player.instanceId}/tiles/${state.player.x}/${state.player.y}`);
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: spiritStoneSlot });
    await waitForCondition(async () => {
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        if (playerState.player.inventory.items.some((entry) => entry.itemId === 'spirit_stone')) {
            return false;
        }
        const tileState = await fetchJson(`${baseUrl}/runtime/instances/${playerState.player.instanceId}/tiles/${playerState.player.x}/${playerState.player.y}`);
        return (tileState.tile?.aura ?? 0) >= ((auraBefore.tile?.aura ?? 0) + 100);
    }, 5000);
    const dropState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
    const dropSlot = dropState.player.inventory.items.findIndex((entry) => entry.itemId === 'rat_tail');
    if (dropSlot < 0) {
        throw new Error('rat_tail missing before persistence drop');
    }
    socket.emit(shared_1.NEXT_C2S.DropItem, {
        slotIndex: dropSlot,
        count: 3,
    });
    await waitForCondition(async () => {
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        const stillHasRatTail = playerState.player?.inventory?.items?.some((entry) => entry.itemId === 'rat_tail') ?? false;
        const tileState = await fetchJson(`${baseUrl}/runtime/instances/${dropState.player.instanceId}/tiles/${dropState.player.x}/${dropState.player.y}`);
        const hasGroundRatTail = tileState.tile?.groundPile?.items?.some((entry) => entry.itemId === 'rat_tail' && entry.count >= 3) ?? false;
        return hasGroundRatTail && !stillHasRatTail;
    }, 5000);
    const persistedTile = {
        instanceId: dropState.player.instanceId,
        x: dropState.player.x,
        y: dropState.player.y,
    };
    await postJson('/runtime/persistence/flush', {});
    await delay(300);
    socket.close();
    await delay(300);
    return persistedTile;
}
async function reconnectAndRead(persistedTile) {
    if (!accessToken) {
        throw new Error('missing access token for persistence reconnect');
    }
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: accessToken,
            protocol: 'next',
        },
    });
    const captured = {
        mapEnter: null,
        selfDelta: null,
        panelDelta: null,
        worldDelta: null,
    };
    const legacyEvents = [];
    socket.onAny((event) => {
        if (typeof event === 'string' && event.startsWith('s:')) {
            legacyEvents.push(event);
        }
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, (payload) => {
        captured.mapEnter = payload;
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        captured.selfDelta = payload;
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        captured.panelDelta = payload;
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        captured.worldDelta = payload;
    });
    const initSession = waitForSocketEvent(socket, shared_1.NEXT_S2C.InitSession);
    await onceConnected(socket);
    const reconnectInit = await initSession;
    const reconnectPlayerId = typeof reconnectInit?.pid === 'string' ? reconnectInit.pid.trim() : '';
    if (!reconnectPlayerId) {
        throw new Error(`invalid reconnect init session payload: ${JSON.stringify(reconnectInit)}`);
    }
    if (reconnectPlayerId !== playerId) {
        throw new Error(`expected persisted reconnect pid ${playerId}, got ${reconnectPlayerId}`);
    }
    if (legacyEvents.length > 0) {
        throw new Error(`expected next reconnect to avoid legacy events, got ${legacyEvents.join(', ')}`);
    }
    await waitForCondition(() => captured.mapEnter !== null && captured.selfDelta !== null && captured.panelDelta !== null && captured.worldDelta !== null, 5000);
    socket.close();
    if (!captured.mapEnter || !captured.selfDelta || !captured.panelDelta || !captured.worldDelta) {
        throw new Error('missing restored payloads');
    }
    if (captured.mapEnter.mid !== 'wildlands') {
        throw new Error(`expected persisted map wildlands, got ${captured.mapEnter.mid}`);
    }
    const restoredHp = Number(captured.selfDelta.hp ?? 0);
    const restoredMaxHp = Number(captured.selfDelta.maxHp ?? 0);
    const restoredQi = Number(captured.selfDelta.qi ?? 0);
    const restoredMaxQi = Number(captured.selfDelta.maxQi ?? 0);
    if (restoredHp < 61 || restoredQi < 23 || restoredHp >= restoredMaxHp || restoredQi >= restoredMaxQi) {
        throw new Error(`expected restored vitals to preserve damaged state, got ${JSON.stringify(captured.selfDelta)}`);
    }
    if (captured.panelDelta.inv?.slots?.some((entry) => entry.item?.itemId === 'rat_tail')) {
        throw new Error(`expected dropped rat_tail to stay on ground, got ${JSON.stringify(captured.panelDelta)}`);
    }
    const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
    if (!playerState.player?.unlockedMapIds?.includes('bamboo_forest')) {
        throw new Error(`expected persisted bamboo_forest unlock, got ${JSON.stringify(playerState)}`);
    }
    const targetTile = persistedTile ?? {
        instanceId: playerState.player.instanceId,
        x: playerState.player.x,
        y: playerState.player.y,
    };
    const tileState = await fetchJson(`${baseUrl}/runtime/instances/${targetTile.instanceId}/tiles/${targetTile.x}/${targetTile.y}`);
    if ((tileState.tile?.aura ?? 0) < 100) {
        throw new Error(`expected persisted tile aura >= 100, got ${JSON.stringify(tileState)}`);
    }
    const restoredGroundCount = tileState.tile?.groundPile?.items
        ?.find((entry) => entry.itemId === 'rat_tail')
        ?.count ?? 0;
    if (restoredGroundCount < 3) {
        throw new Error(`expected persisted ground rat_tail >= 3, got ${JSON.stringify(tileState)}`);
    }
    return {
        mapEnter: captured.mapEnter,
        reconnectInit,
        selfDelta: captured.selfDelta,
        panelDelta: captured.panelDelta,
        worldDelta: captured.worldDelta,
        playerState: {
            unlockedMapIds: playerState.player.unlockedMapIds ?? [],
        },
        persistedTile: targetTile,
        tileAura: tileState.tile?.aura ?? 0,
        tileGroundPileItemCount: restoredGroundCount,
    };
}
async function registerAndLoginPlayer() {
    const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const accountName = `acct_persist_${suffix}`;
    const password = `Pass_${suffix}`;
    await requestJson('/auth/register', {
        method: 'POST',
        body: {
            accountName,
            password,
            displayName: buildUniqueDisplayName(`persistence:${suffix}`),
            roleName: `久存${suffix.slice(-4)}`,
        },
    });
    const login = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
    const nextAccessToken = typeof login?.accessToken === 'string' ? login.accessToken.trim() : '';
    if (!nextAccessToken) {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
    return {
        accessToken: nextAccessToken,
    };
}
async function startServer() {
    currentPort = await allocateFreePort();
    baseUrl = `http://127.0.0.1:${currentPort}`;
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: packageRoot,
        env: {
            ...process.env,
            SERVER_NEXT_PORT: String(currentPort),
            SERVER_NEXT_DATABASE_URL: databaseUrl,
            SERVER_NEXT_RUNTIME_HTTP: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => {
        process.stdout.write(String(chunk));
    });
    child.stderr?.on('data', (chunk) => {
        process.stderr.write(String(chunk));
    });
    await waitForCondition(async () => {
        try {
            const response = await fetch(`${baseUrl}/health`);
            return response.ok;
        }
        catch {
            return false;
        }
    }, 8000);
    return child;
}
async function stopServer(child) {
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await new Promise((resolve) => {
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
        }, 3000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}
async function waitForHealth() {
    await waitForCondition(async () => {
        try {
            const response = await fetch(`${baseUrl}/health`);
            return response.ok;
        }
        catch {
            return false;
        }
    }, 5000);
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
async function waitForSocketEvent(socket, eventName) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`socket event timeout: ${eventName}`)), 5000);
        socket.once(eventName, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}
async function requestJson(path, init = {}) {
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    const response = await fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: body === undefined ? undefined : {
            'content-type': 'application/json',
            ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`request failed: ${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
async function postJson(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function deletePlayer(playerIdToDelete) {
    const response = await fetch(`${baseUrl}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
async function waitForCondition(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!(await predicate())) {
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
function buildUniqueDisplayName(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
        const server = (0, node_net_1.createServer)();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('failed to allocate free port')));
                return;
            }
            const port = address.port;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=persistence-smoke.js.map

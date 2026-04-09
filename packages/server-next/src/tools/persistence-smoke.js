"use strict";
/**
 * 用途：执行 persistence 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
/**
 * 记录包根目录。
 */
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
/**
 * 记录数据库地址。
 */
const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
/**
 * 记录default端口。
 */
const defaultPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3112);
/**
 * 记录当前值端口。
 */
let currentPort = defaultPort;
/**
 * 记录base地址。
 */
let baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录access令牌。
 */
let accessToken = '';
/**
 * 串联执行脚本主流程。
 */
async function main() {
    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'SERVER_NEXT_DATABASE_URL/DATABASE_URL missing',
        }, null, 2));
        return;
    }
/**
 * 记录reconnect目标。
 */
    let reconnectTarget = null;
/**
 * 记录服务端。
 */
    let server = await startServer();
    try {
        await waitForHealth();
/**
 * 记录认证。
 */
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
/**
 * 记录restored。
 */
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
/**
 * 处理connectandmutate。
 */
async function connectAndMutate(token) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'next',
        },
    });
/**
 * 记录init会话。
 */
    const initSession = waitForSocketEvent(socket, shared_1.NEXT_S2C.InitSession);
/**
 * 记录地图enter。
 */
    const mapEnter = waitForSocketEvent(socket, shared_1.NEXT_S2C.MapEnter);
    await onceConnected(socket);
/**
 * 记录initpayload。
 */
    const initPayload = await initSession;
    playerId = typeof initPayload?.pid === 'string' ? initPayload.pid.trim() : '';
    if (!playerId) {
        throw new Error(`invalid init session payload: ${JSON.stringify(initPayload)}`);
    }
    await mapEnter;
    socket.emit('n:c:usePortal', {});
    await waitForCondition(async () => {
/**
 * 记录状态。
 */
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
/**
 * 记录状态。
 */
    let state = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录地图slot。
 */
    const mapSlot = state.player.inventory.items.findIndex((entry) => entry.itemId === 'map.bamboo_forest');
    if (mapSlot < 0) {
        throw new Error('map unlock item missing before persistence mutation');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: mapSlot });
    await waitForCondition(async () => {
/**
 * 记录玩家状态。
 */
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        if (!playerState.player?.unlockedMapIds?.includes('bamboo_forest')) {
            return false;
        }
        return playerState.player.inventory.items.every((entry) => entry.itemId !== 'map.bamboo_forest');
    }, 5000);
    state = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录spiritstoneslot。
 */
    const spiritStoneSlot = state.player.inventory.items.findIndex((entry) => entry.itemId === 'spirit_stone');
    if (spiritStoneSlot < 0) {
        throw new Error('spirit stone missing before persistence mutation');
    }
/**
 * 记录灵气before。
 */
    const auraBefore = await fetchJson(`${baseUrl}/runtime/instances/${state.player.instanceId}/tiles/${state.player.x}/${state.player.y}`);
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: spiritStoneSlot });
    await waitForCondition(async () => {
/**
 * 记录玩家状态。
 */
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        if (playerState.player.inventory.items.some((entry) => entry.itemId === 'spirit_stone')) {
            return false;
        }
/**
 * 记录tile状态。
 */
        const tileState = await fetchJson(`${baseUrl}/runtime/instances/${playerState.player.instanceId}/tiles/${playerState.player.x}/${playerState.player.y}`);
        return (tileState.tile?.aura ?? 0) >= ((auraBefore.tile?.aura ?? 0) + 100);
    }, 5000);
/**
 * 记录drop状态。
 */
    const dropState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录dropslot。
 */
    const dropSlot = dropState.player.inventory.items.findIndex((entry) => entry.itemId === 'rat_tail');
    if (dropSlot < 0) {
        throw new Error('rat_tail missing before persistence drop');
    }
    socket.emit(shared_1.NEXT_C2S.DropItem, {
        slotIndex: dropSlot,
        count: 3,
    });
    await waitForCondition(async () => {
/**
 * 记录玩家状态。
 */
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录stillhasrattail。
 */
        const stillHasRatTail = playerState.player?.inventory?.items?.some((entry) => entry.itemId === 'rat_tail') ?? false;
/**
 * 记录tile状态。
 */
        const tileState = await fetchJson(`${baseUrl}/runtime/instances/${dropState.player.instanceId}/tiles/${dropState.player.x}/${dropState.player.y}`);/**
 * 标记是否已groundrattail。
 */

        const hasGroundRatTail = tileState.tile?.groundPile?.items?.some((entry) => entry.itemId === 'rat_tail' && entry.count >= 3) ?? false;
        return hasGroundRatTail && !stillHasRatTail;
    }, 5000);
/**
 * 记录persistedtile。
 */
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
/**
 * 处理reconnectandread。
 */
async function reconnectAndRead(persistedTile) {
    if (!accessToken) {
        throw new Error('missing access token for persistence reconnect');
    }
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: accessToken,
            protocol: 'next',
        },
    });
/**
 * 记录captured。
 */
    const captured = {
        mapEnter: null,
        selfDelta: null,
        panelDelta: null,
        worldDelta: null,
    };
/**
 * 记录legacyevents。
 */
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
/**
 * 记录init会话。
 */
    const initSession = waitForSocketEvent(socket, shared_1.NEXT_S2C.InitSession);
    await onceConnected(socket);
/**
 * 记录reconnectinit。
 */
    const reconnectInit = await initSession;
/**
 * 记录reconnect玩家ID。
 */
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
/**
 * 记录restoredhp。
 */
    const restoredHp = Number(captured.selfDelta.hp ?? 0);
/**
 * 记录restoredmaxhp。
 */
    const restoredMaxHp = Number(captured.selfDelta.maxHp ?? 0);
/**
 * 记录restoredqi。
 */
    const restoredQi = Number(captured.selfDelta.qi ?? 0);
/**
 * 记录restoredmaxqi。
 */
    const restoredMaxQi = Number(captured.selfDelta.maxQi ?? 0);
    if (restoredHp < 61 || restoredQi < 23 || restoredHp >= restoredMaxHp || restoredQi >= restoredMaxQi) {
        throw new Error(`expected restored vitals to preserve damaged state, got ${JSON.stringify(captured.selfDelta)}`);
    }
    if (captured.panelDelta.inv?.slots?.some((entry) => entry.item?.itemId === 'rat_tail')) {
        throw new Error(`expected dropped rat_tail to stay on ground, got ${JSON.stringify(captured.panelDelta)}`);
    }
/**
 * 记录玩家状态。
 */
    const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
    if (!playerState.player?.unlockedMapIds?.includes('bamboo_forest')) {
        throw new Error(`expected persisted bamboo_forest unlock, got ${JSON.stringify(playerState)}`);
    }
/**
 * 记录目标tile。
 */
    const targetTile = persistedTile ?? {
        instanceId: playerState.player.instanceId,
        x: playerState.player.x,
        y: playerState.player.y,
    };
/**
 * 记录tile状态。
 */
    const tileState = await fetchJson(`${baseUrl}/runtime/instances/${targetTile.instanceId}/tiles/${targetTile.x}/${targetTile.y}`);
    if ((tileState.tile?.aura ?? 0) < 100) {
        throw new Error(`expected persisted tile aura >= 100, got ${JSON.stringify(tileState)}`);
    }
/**
 * 记录restoredground数量。
 */
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
/**
 * 处理registerandlogin玩家。
 */
async function registerAndLoginPlayer() {
/**
 * 记录suffix。
 */
    const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
/**
 * 记录account名称。
 */
    const accountName = `acct_persist_${suffix}`;
/**
 * 记录password。
 */
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
/**
 * 记录login。
 */
    const login = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
/**
 * 记录nextaccess令牌。
 */
    const nextAccessToken = typeof login?.accessToken === 'string' ? login.accessToken.trim() : '';
    if (!nextAccessToken) {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
    return {
        accessToken: nextAccessToken,
    };
}
/**
 * 启动服务端。
 */
async function startServer() {
    currentPort = await allocateFreePort();
    baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 记录子进程。
 */
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
/**
 * 记录response。
 */
            const response = await fetch(`${baseUrl}/health`);
            return response.ok;
        }
        catch {
            return false;
        }
    }, 8000);
    return child;
}
/**
 * 停止服务端。
 */
async function stopServer(child) {
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await new Promise((resolve) => {
/**
 * 记录timer。
 */
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
/**
 * 等待for健康状态。
 */
async function waitForHealth() {
    await waitForCondition(async () => {
        try {
/**
 * 记录response。
 */
            const response = await fetch(`${baseUrl}/health`);
            return response.ok;
        }
        catch {
            return false;
        }
    }, 5000);
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
/**
 * 等待forsocketevent。
 */
async function waitForSocketEvent(socket, eventName) {
    return new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => reject(new Error(`socket event timeout: ${eventName}`)), 5000);
        socket.once(eventName, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}
/**
 * 处理requestjson。
 */
async function requestJson(path, init = {}) {
/**
 * 记录请求体。
 */
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录response。
 */
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
/**
 * 处理postjson。
 */
async function postJson(path, body) {
/**
 * 记录response。
 */
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
/**
 * 处理fetchjson。
 */
async function fetchJson(url) {
/**
 * 记录response。
 */
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
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
/**
 * 分配free端口。
 */
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
/**
 * 记录服务端。
 */
        const server = (0, node_net_1.createServer)();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
/**
 * 记录address。
 */
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('failed to allocate free port')));
                return;
            }
/**
 * 记录端口。
 */
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

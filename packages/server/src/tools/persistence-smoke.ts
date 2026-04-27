// @ts-nocheck

/**
 * 用途：执行 persistence 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const smoke_player_auth_1 = require("./smoke-player-auth");
const smoke_player_cleanup_1 = require("./smoke-player-cleanup");
const stable_dist_1 = require("./stable-dist");
/**
 * 记录包根目录。
 */
const packageRoot = (0, stable_dist_1.resolveToolPackageRoot)(__dirname);
/**
 * 记录持有的稳定 dist 快照。
 */
const ownedDistSnapshot = (() => {
    const explicitDistRoot = typeof process.env.SERVER_TOOL_DIST_ROOT === 'string'
        ? process.env.SERVER_TOOL_DIST_ROOT.trim()
        : '';
    if (explicitDistRoot) {
        return null;
    }
    return (0, stable_dist_1.createStableDistSnapshot)({
        label: 'persistence-smoke',
        packageRoot,
    });
})();
/**
 * 记录dist根目录。
 */
const distRoot = ownedDistSnapshot?.distRoot ?? (0, stable_dist_1.resolveToolDistRoot)(__dirname, packageRoot);
/**
 * 记录仓库根目录。
 */
const repoRoot = (0, node_path_1.resolve)(packageRoot, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = (0, node_path_1.join)(distRoot, 'main.js');
/**
 * 记录数据库地址。
 */
const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
const MARKET_STORAGE_SCOPE = 'server_market_storage_v1';
const PERSISTENCE_SMOKE_CONTRACT = Object.freeze({
    answers: 'with-db 本地环境下的主线持久化闭环：重启后玩家状态、掉落、灵气、地图解锁与结构化坊市托管仓仍可从数据库真源恢复',
    excludes: 'shadow destructive、维护窗口 backup/restore、真实运营取证与跨环境灾备演练',
    completionMapping: 'replace-ready:proof:with-db.persistence',
});
const BASELINE_MARKET_STORAGE_ITEMS = Object.freeze([
    {
        itemId: 'wolf_fang',
        count: 4,
        name: '狼牙',
    },
    {
        itemId: 'iron_sword',
        count: 1,
        name: '铁剑',
        enhanceLevel: 2,
        equipSlot: 'weapon',
    },
]);
/**
 * 记录default端口。
 */
const defaultPort = Number(process.env.SERVER_SMOKE_PORT ?? 3112);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
            answers: PERSISTENCE_SMOKE_CONTRACT.answers,
            excludes: PERSISTENCE_SMOKE_CONTRACT.excludes,
            completionMapping: PERSISTENCE_SMOKE_CONTRACT.completionMapping,
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
        await seedNativePersistenceForToken(accessToken);
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
            answers: PERSISTENCE_SMOKE_CONTRACT.answers,
            excludes: PERSISTENCE_SMOKE_CONTRACT.excludes,
            completionMapping: PERSISTENCE_SMOKE_CONTRACT.completionMapping,
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'mainline',
        },
    });
/**
 * 记录init会话。
 */
    const initSession = waitForSocketEvent(socket, shared_1.S2C.InitSession);
/**
 * 记录地图enter。
 */
    const mapEnter = waitForSocketEvent(socket, shared_1.S2C.MapEnter);
    await onceConnected(socket);
/**
 * 记录initpayload。
 */
    const initPayload = await initSession;
    playerId = typeof initPayload?.pid === 'string' ? initPayload.pid.trim() : '';
    const sessionId = typeof initPayload?.sid === 'string' ? initPayload.sid.trim() : '';
    if (!playerId) {
        throw new Error(`invalid init session payload: ${JSON.stringify(initPayload)}`);
    }
    await mapEnter;
    await ensureTravelToWildlands(socket, playerId, sessionId);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'rat_tail',
        count: 3,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'spirit_stone',
        count: 1,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'map.bamboo_forest',
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
    socket.emit(shared_1.C2S.UseItem, { slotIndex: mapSlot });
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
        throw new Error('spirit_stone missing before persistence aura mutation');
    }
    let persistedAuraTile = null;
    socket.emit(shared_1.C2S.UseItem, { slotIndex: spiritStoneSlot });
    await waitForCondition(async () => {
/**
 * 记录玩家状态。
 */
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录tile状态。
 */
        const tileState = await fetchJson(`${baseUrl}/runtime/instances/${playerState.player.instanceId}/tiles/${playerState.player.x}/${playerState.player.y}`);
        const stillHasSpiritStone = playerState.player?.inventory?.items?.some((entry) => entry.itemId === 'spirit_stone') ?? false;
        if ((tileState.tile?.aura ?? 0) >= 100 && !stillHasSpiritStone) {
            persistedAuraTile = {
                instanceId: playerState.player.instanceId,
                x: playerState.player.x,
                y: playerState.player.y,
            };
            return true;
        }
        return false;
    }, 5000);
    if (!persistedAuraTile) {
        throw new Error('expected spirit_stone aura target before persistence mutation');
    }
    state = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录spiritstoneslot。
 */
    await postJson(`/runtime/players/${playerId}/vitals`, {
        hp: Math.max(1, Math.floor((state.player.maxHp ?? 100) * 0.5)),
        qi: state.player.qi ?? 0,
    });
    await waitForCondition(async () => {
/**
 * 记录玩家状态。
 */
        const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        return Number(playerState.player.hp ?? 0) < Number(state.player.hp ?? 0);
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
    socket.emit(shared_1.C2S.DropItem, {
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
        const tileState = await fetchJson(`${baseUrl}/runtime/instances/${dropState.player.instanceId}/tiles/${dropState.player.x}/${dropState.player.y}`);
        /**
 * 标记是否已groundrattail。
 */

        const hasGroundRatTail = tileState.tile?.groundPile?.items?.some((entry) => entry.itemId === 'rat_tail' && entry.count >= 3) ?? false;
        return hasGroundRatTail && !stillHasRatTail;
    }, 5000);
    await postJson(`/runtime/players/${playerId}/vitals`, {
        hp: 61,
        qi: 23,
    });
/**
 * 记录damagedstate。
 */
    const damagedState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
    if ((damagedState.player?.hp ?? 0) >= (damagedState.player?.maxHp ?? 0)
        || (damagedState.player?.qi ?? 0) >= (damagedState.player?.maxQi ?? 0)) {
        throw new Error(`expected player to remain damaged before flush, got ${JSON.stringify(damagedState.player)}`);
    }
/**
 * 记录persistedgroundtile。
 */
    const persistedGroundTile = {
        instanceId: dropState.player.instanceId,
        x: dropState.player.x,
        y: dropState.player.y,
    };
    await postJson('/runtime/persistence/flush', {});
    await waitForPersistedPlayerSnapshot(playerId);
    await waitForPersistedPlayerPlacement(playerId, 'wildlands');
    await replaceStructuredPlayerMarketStorageItems(playerId, BASELINE_MARKET_STORAGE_ITEMS);
    await replacePersistedPlayerSnapshotMarketStorageItems(playerId, BASELINE_MARKET_STORAGE_ITEMS);
    await deleteLegacyMarketStorageDocument(playerId);
    await assertStructuredPlayerMarketStorageItems(playerId, BASELINE_MARKET_STORAGE_ITEMS);
    await assertLegacyMarketStorageDocumentAbsent(playerId);
    await delay(300);
    socket.close();
    await delay(300);
    return {
        persistedAuraTile,
        persistedGroundTile,
        expectedMarketStorageItems: BASELINE_MARKET_STORAGE_ITEMS,
    };
}
/**
 * 确保持久化 smoke 的玩家稳定抵达 wildlands。
 */
async function ensureTravelToWildlands(socket, currentPlayerId, currentSessionId = '') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let lastTemplateId = '';
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    await postJson('/runtime/players/connect', {
        playerId: currentPlayerId,
        sessionId: currentSessionId || undefined,
        mapId: 'wildlands',
    });
    for (let attempt = 0; attempt < 24; attempt += 1) {
/**
 * 记录状态。
 */
        const state = await fetchJson(`${baseUrl}/runtime/players/${currentPlayerId}/view`);
        lastTemplateId = state?.view?.instance?.templateId ?? '';
        lastX = Number(state?.view?.self?.x);
        lastY = Number(state?.view?.self?.y);
        if (lastTemplateId === 'wildlands') {
            return;
        }
        await delay(250);
    }
    throw new Error(`failed to attach player to wildlands, current=${lastTemplateId} @ (${lastX}, ${lastY})`);
}
/**
 * 处理reconnectandread。
 */
async function reconnectAndRead(reconnectTarget) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            protocol: 'mainline',
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
    socket.on(shared_1.S2C.MapEnter, (payload) => {
        captured.mapEnter = payload;
    });
    socket.on(shared_1.S2C.SelfDelta, (payload) => {
        captured.selfDelta = payload;
    });
    socket.on(shared_1.S2C.PanelDelta, (payload) => {
        captured.panelDelta = payload;
    });
    socket.on(shared_1.S2C.WorldDelta, (payload) => {
        captured.worldDelta = payload;
    });
/**
 * 记录init会话。
 */
    const initSession = waitForSocketEvent(socket, shared_1.S2C.InitSession);
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
        throw new Error(`expected mainline reconnect to avoid legacy events, got ${legacyEvents.join(', ')}`);
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
 * 记录玩家状态。
 */
    const playerState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
/**
 * 记录restoredhp。
 */
    const restoredHp = Number(captured.selfDelta.hp ?? 0);
/**
 * 记录restoredmaxhp。
 */
    const restoredMaxHp = Number(captured.selfDelta.maxHp ?? playerState.player?.maxHp ?? 0);
/**
 * 记录restoredqi。
 */
    const restoredQi = Number(captured.selfDelta.qi ?? 0);
/**
 * 记录restoredmaxqi。
 */
    const restoredMaxQi = Number(captured.selfDelta.maxQi ?? playerState.player?.maxQi ?? 0);
    if (restoredHp < 61 || restoredQi < 23 || restoredHp >= restoredMaxHp || restoredQi >= restoredMaxQi) {
        throw new Error(`expected restored vitals to preserve damaged state, got ${JSON.stringify(captured.selfDelta)}`);
    }
    if (captured.panelDelta.inv?.slots?.some((entry) => entry.item?.itemId === 'rat_tail')) {
        throw new Error(`expected dropped rat_tail to stay on ground, got ${JSON.stringify(captured.panelDelta)}`);
    }
    if (!playerState.player?.unlockedMapIds?.includes('bamboo_forest')) {
        throw new Error(`expected persisted bamboo_forest unlock, got ${JSON.stringify(playerState)}`);
    }
/**
 * 记录目标tile。
 */
    const auraTargetTile = reconnectTarget?.persistedAuraTile ?? reconnectTarget?.persistedTile ?? {
        instanceId: playerState.player.instanceId,
        x: playerState.player.x,
        y: playerState.player.y,
    };
/**
 * 记录tile状态。
 */
    const auraTileState = await fetchJson(`${baseUrl}/runtime/instances/${auraTargetTile.instanceId}/tiles/${auraTargetTile.x}/${auraTargetTile.y}`);
    if ((auraTileState.tile?.aura ?? 0) < 100) {
        throw new Error(`expected persisted tile aura >= 100, got ${JSON.stringify(auraTileState)}`);
    }
    const groundTargetTile = reconnectTarget?.persistedGroundTile ?? reconnectTarget?.persistedTile ?? auraTargetTile;
    const groundTileState = groundTargetTile.instanceId === auraTargetTile.instanceId
        && groundTargetTile.x === auraTargetTile.x
        && groundTargetTile.y === auraTargetTile.y
        ? auraTileState
        : await fetchJson(`${baseUrl}/runtime/instances/${groundTargetTile.instanceId}/tiles/${groundTargetTile.x}/${groundTargetTile.y}`);
/**
 * 记录restoredground数量。
 */
    const restoredGroundCount = groundTileState.tile?.groundPile?.items
        ?.find((entry) => entry.itemId === 'rat_tail')
        ?.count ?? 0;
    if (restoredGroundCount < 3) {
        throw new Error(`expected persisted ground rat_tail >= 3, got ${JSON.stringify(groundTileState)}`);
    }
    const expectedMarketStorageItems = normalizeComparableMarketStorageItems(reconnectTarget?.expectedMarketStorageItems);
    const persistedStructuredMarketStorageItems = await readStructuredPlayerMarketStorageItems(playerId);
    if (JSON.stringify(persistedStructuredMarketStorageItems) !== JSON.stringify(expectedMarketStorageItems)) {
        throw new Error(`expected structured market storage rows to survive restart as ${JSON.stringify(expectedMarketStorageItems)}, got ${JSON.stringify(persistedStructuredMarketStorageItems)}`);
    }
    const marketBeforeClaim = await fetchJson(`${baseUrl}/runtime/players/${playerId}/market`);
    const actualMarketStorageItems = normalizeComparableMarketStorageItems(marketBeforeClaim?.storage?.items);
    if (JSON.stringify(actualMarketStorageItems) !== JSON.stringify(expectedMarketStorageItems)) {
        throw new Error(`expected persisted structured market storage ${JSON.stringify(expectedMarketStorageItems)}, got ${JSON.stringify(actualMarketStorageItems)}; runtimeMarketPayload=${JSON.stringify(marketBeforeClaim)}; persistedRows=${JSON.stringify(persistedStructuredMarketStorageItems)}`);
    }
    if (playerState.player.inventory.items.some((entry) => expectedMarketStorageItems.some((item) => item.itemId === entry.itemId))) {
        throw new Error(`expected structured market storage items to stay outside inventory before claim, got ${JSON.stringify(playerState.player.inventory.items)}`);
    }
    await postJson(`/runtime/players/${playerId}/market/claim-storage`, {});
    await waitForCondition(async () => {
        const claimedState = await fetchJson(`${baseUrl}/runtime/players/${playerId}/state`);
        return expectedMarketStorageItems.every((item) => claimedState.player?.inventory?.items?.some((entry) => entry.itemId === item.itemId && Number(entry.count ?? 0) >= item.count));
    }, 5000);
    await waitForCondition(async () => {
        const marketAfterClaim = await fetchJson(`${baseUrl}/runtime/players/${playerId}/market`);
        return Array.isArray(marketAfterClaim?.storage?.items) && marketAfterClaim.storage.items.length === 0;
    }, 5000);
    await assertStructuredPlayerMarketStorageItems(playerId, []);
    return {
        mapEnter: captured.mapEnter,
        reconnectInit,
        selfDelta: captured.selfDelta,
        panelDelta: captured.panelDelta,
        worldDelta: captured.worldDelta,
        playerState: {
            unlockedMapIds: playerState.player.unlockedMapIds ?? [],
        },
        marketStorage: {
            beforeClaim: actualMarketStorageItems,
            claimed: expectedMarketStorageItems,
        },
        persistedAuraTile: auraTargetTile,
        persistedGroundTile: groundTargetTile,
        tileAura: auraTileState.tile?.aura ?? 0,
        tileGroundPileItemCount: restoredGroundCount,
    };
}
/**
 * 处理registerandlogin玩家。
 */
async function registerAndLoginPlayer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录suffix。
 */
    const baseSuffix = `${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
    for (let attempt = 0; attempt < 12; attempt += 1) {
/**
 * 记录suffix。
 */
        const suffix = attempt === 0 ? baseSuffix : `${baseSuffix}${attempt.toString(36)}`;
/**
 * 记录account名称。
 */
        const accountName = `ps_${suffix}`;
/**
 * 记录password。
 */
        const password = `Pass_${suffix}`;
        try {
            await requestJson('/api/auth/register', {
                method: 'POST',
                body: {
                    accountName,
                    password,
                    displayName: buildUniqueDisplayName(`persistence:${suffix}`, attempt),
                    roleName: buildPersistenceRoleName(suffix, attempt),
                },
            });
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
 * 记录nextaccess令牌。
 */
            const nextAccessToken = typeof login?.accessToken === 'string' ? login.accessToken.trim() : '';
            if (!nextAccessToken) {
                throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
            }
            const payload = parseJwtPayload(nextAccessToken);
            const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
            (0, smoke_player_auth_1.registerSmokePlayerForCleanup)(playerId, {
                serverUrl: baseUrl,
                databaseUrl,
            });
            return {
                accessToken: nextAccessToken,
                playerId,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('账号已存在')
                || message.includes('称号已存在')
                || message.includes('角色名已存在')) {
                continue;
            }
            throw error;
        }
    }
    throw new Error('register failed: persistence smoke unique retries exhausted');
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
        cwd: repoRoot,
        env: {
            ...process.env,
            SERVER_PACKAGE_ROOT: packageRoot,
            SERVER_TOOL_DIST_ROOT: distRoot,
            SERVER_PORT: String(currentPort),
            SERVER_DATABASE_URL: databaseUrl,
            SERVER_RUNTIME_HTTP: '1',
            SERVER_ALLOW_LEGACY_HTTP_COMPAT: '1',
            SERVER_MAP_LEGACY_SNAPSHOT_WRITE: '1',
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
 * 按 access token 预种 mainline-native identity 与 snapshot，避免 persistence smoke 被 legacy/compat 迁移链噪音干扰。
 */
async function seedNativePersistenceForToken(token) {
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
 * 记录username。
 */
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
/**
 * 记录displayname。
 */
    const displayName = typeof payload?.displayName === 'string' ? payload.displayName.trim() : '';
/**
 * 记录玩家ID。
 */
    const seededPlayerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
/**
 * 记录玩家名称。
 */
    const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
    if (!userId || !seededPlayerId || !playerName) {
        throw new Error(`invalid persistence smoke token payload: ${JSON.stringify(payload)}`);
    }
    const pool = new pg_1.Pool({
        connectionString: databaseUrl,
    });
    try {
        await pool.query(`
      INSERT INTO server_player_identity(
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
    `, [userId, username, seededPlayerId, displayName, playerName, 'token_seed', JSON.stringify({
            version: 1,
            userId,
            username,
            displayName,
            playerId: seededPlayerId,
            playerName,
            persistedSource: 'token_seed',
            updatedAt: Date.now(),
        })]);
        await pool.query(`
      INSERT INTO server_player_snapshot(
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
    `, [seededPlayerId, 'yunlai_town', 'native', Date.now(), Date.now(), JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            placement: {
                templateId: 'yunlai_town',
                x: 31,
                y: 54,
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
                    totalTicks: 8,
                    remainingTicks: 3,
                    pausedTicks: 0,
                    successRate: 1,
                    spiritStoneCost: 0,
                },
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
 * parseJwtPayload：读取Jwt载荷并返回结果。
 * @param token 参数说明。
 * @returns 无返回值，直接更新Jwt载荷相关状态。
 */

function parseJwtPayload(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const segments = typeof token === 'string' ? token.split('.') : [];
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

async function replaceStructuredPlayerMarketStorageItems(playerIdToSeed, items) {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM player_market_storage_item WHERE player_id = $1', [playerIdToSeed]);
    for (let slotIndex = 0; slotIndex < (Array.isArray(items) ? items : []).length; slotIndex += 1) {
      const entry = items[slotIndex];
      await client.query(`
        INSERT INTO player_market_storage_item(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          enhance_level,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
      `, [
        `persistence-market-storage:${playerIdToSeed}:${slotIndex}`,
        playerIdToSeed,
        slotIndex,
        String(entry?.itemId ?? ''),
        Number(entry?.count ?? 1),
        normalizeOptionalInteger(entry?.enhanceLevel ?? entry?.enhancementLevel ?? entry?.level),
        JSON.stringify(entry ?? {}),
      ]);
    }
    await client.query('COMMIT');
  }
  catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
  finally {
    await client.end().catch(() => undefined);
  }
}

async function replacePersistedPlayerSnapshotMarketStorageItems(playerIdToSeed, items) {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query(`
      SELECT payload
      FROM server_player_snapshot
      WHERE player_id = $1
      LIMIT 1
    `, [playerIdToSeed]);
    if ((existing.rowCount ?? 0) === 0) {
      throw new Error(`missing server_player_snapshot for ${playerIdToSeed}`);
    }
    const payload = existing.rows[0]?.payload && typeof existing.rows[0].payload === 'object'
      ? { ...existing.rows[0].payload }
      : {};
    payload.marketStorage = {
      items: normalizeSnapshotMarketStorageItems(items),
    };
    payload.savedAt = Date.now();
    await client.query(`
      UPDATE server_player_snapshot
      SET saved_at = $2,
          updated_at = now(),
          payload = $3::jsonb
      WHERE player_id = $1
    `, [playerIdToSeed, Date.now(), JSON.stringify(payload)]);
  }
  finally {
    await client.end().catch(() => undefined);
  }
}

async function deleteLegacyMarketStorageDocument(playerIdToDelete) {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', [
      MARKET_STORAGE_SCOPE,
      playerIdToDelete,
    ]);
  }
  finally {
    await client.end().catch(() => undefined);
  }
}

async function assertLegacyMarketStorageDocumentAbsent(playerIdToCheck) {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [
      MARKET_STORAGE_SCOPE,
      playerIdToCheck,
    ]);
    if ((result.rowCount ?? 0) !== 0) {
      throw new Error(`expected legacy market storage document to be absent for ${playerIdToCheck}`);
    }
  }
  finally {
    await client.end().catch(() => undefined);
  }
}

async function assertStructuredPlayerMarketStorageItems(playerIdToCheck, expectedItems) {
  const actual = await readStructuredPlayerMarketStorageItems(playerIdToCheck);
  const expected = normalizeComparableMarketStorageItems(expectedItems);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected structured market storage ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function readStructuredPlayerMarketStorageItems(playerIdToCheck) {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT slot_index, item_id, count, enhance_level, raw_payload
      FROM player_market_storage_item
      WHERE player_id = $1
      ORDER BY slot_index ASC, storage_item_id ASC
    `, [playerIdToCheck]);
    return normalizeComparableMarketStorageItems(result.rows ?? []);
  }
  finally {
    await client.end().catch(() => undefined);
  }
}

function normalizeComparableMarketStorageItems(items) {
  return (Array.isArray(items) ? items : []).map((entry, index) => ({
    slotIndex: Number(entry?.slotIndex ?? entry?.slot_index ?? index),
    itemId: String(entry?.itemId ?? entry?.item_id ?? entry?.item?.itemId ?? ''),
    count: Number(entry?.count ?? entry?.item?.count ?? 1),
    enhanceLevel: normalizeOptionalInteger(
      entry?.enhanceLevel
      ?? entry?.enhancementLevel
      ?? entry?.enhance_level
      ?? entry?.item?.enhanceLevel
      ?? entry?.item?.enhancementLevel
      ?? entry?.item?.level
      ?? entry?.level,
    ),
  })).sort((left, right) => left.slotIndex - right.slotIndex
    || left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
}

function normalizeSnapshotMarketStorageItems(items) {
  return normalizeComparableMarketStorageItems(items).map((entry) => ({
    itemId: entry.itemId,
    count: entry.count,
    enhanceLevel: entry.enhanceLevel,
  }));
}

function normalizeOptionalInteger(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}
/**
 * 等待 persisted player snapshot 写入主线专表。
 */
async function waitForPersistedPlayerSnapshot(playerIdToCheck) {
    await waitForCondition(async () => {
        const pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            const result = await pool.query('SELECT 1 FROM server_player_snapshot WHERE player_id = $1 LIMIT 1', [playerIdToCheck]);
            return Array.isArray(result?.rows) && result.rows.length > 0;
        }
        finally {
            await pool.end().catch(() => undefined);
        }
    }, 5000);
}
/**
 * 等待玩家 anchor/checkpoint 真源都落到目标地图，避免把重启后才暴露的问题延后到 bootstrap 阶段。
 */
async function waitForPersistedPlayerPlacement(playerIdToCheck, expectedMapId) {
    await waitForCondition(async () => {
        const placement = await readPersistedPlayerPlacement(playerIdToCheck);
        return placement.anchorMapId === expectedMapId && placement.checkpointMapId === expectedMapId;
    }, 5000);
}
/**
 * 读取玩家当前持久化落点，用于把 smoke 断言直接钉到数据库真源。
 */
async function readPersistedPlayerPlacement(playerIdToCheck) {
    const pool = new pg_1.Pool({
        connectionString: databaseUrl,
    });
    try {
        const [anchorResult, checkpointResult] = await Promise.all([
            pool.query(`
        SELECT last_safe_template_id, respawn_template_id
        FROM player_world_anchor
        WHERE player_id = $1
        LIMIT 1
      `, [playerIdToCheck]),
            pool.query(`
        SELECT instance_id
        FROM player_position_checkpoint
        WHERE player_id = $1
        LIMIT 1
      `, [playerIdToCheck]),
        ]);
        const anchorRow = anchorResult.rows[0] ?? null;
        const checkpointRow = checkpointResult.rows[0] ?? null;
        const checkpointInstanceId = typeof checkpointRow?.instance_id === 'string'
            ? checkpointRow.instance_id.trim()
            : '';
        const checkpointMapId = checkpointInstanceId.startsWith('public:')
            ? checkpointInstanceId.slice('public:'.length)
            : checkpointInstanceId;
        return {
            anchorMapId: typeof anchorRow?.last_safe_template_id === 'string' && anchorRow.last_safe_template_id.trim()
                ? anchorRow.last_safe_template_id.trim()
                : (typeof anchorRow?.respawn_template_id === 'string' ? anchorRow.respawn_template_id.trim() : ''),
            checkpointMapId,
        };
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    await (0, smoke_player_cleanup_1.purgeSmokePlayerArtifactsByPlayerId)(playerIdToDelete, {
        serverUrl: baseUrl,
        databaseUrl,
    });
}
/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
function buildUniqueDisplayName(seed, attempt = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录hash。
 */
    let hash = 0;
/**
 * 记录material。
 */
    const material = attempt > 0 ? `${seed}:${attempt}` : seed;
    for (let index = 0; index < material.length; index += 1) {
        hash = (hash * 33 + material.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
/**
 * 构建 persistence smoke 角色名，避免样本 write 后角色名重复。
 */
function buildPersistenceRoleName(suffix, attempt = 0) {
/**
 * 记录prefix。
 */
    const prefix = attempt > 0 ? `久${attempt.toString(36)}` : '久存';
/**
 * 记录token。
 */
    const token = suffix.slice(-4);
    return `${prefix}${token}`;
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
}).finally(() => {
    return (0, smoke_player_auth_1.flushRegisteredSmokePlayers)()
        .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
        .finally(() => {
        ownedDistSnapshot?.cleanup();
    });
});

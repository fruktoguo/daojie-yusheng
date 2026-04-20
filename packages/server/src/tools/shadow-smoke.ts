// @ts-nocheck

/**
 * 用途：执行 shadow 链路的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
/**
 * 记录服务端地址。
 */
const serverUrl = (0, env_alias_1.resolveServerNextShadowUrl)() || 'http://127.0.0.1:11923';
/**
 * 记录GMpassword。
 */
const gmPassword = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
const SHADOW_SMOKE_BOUNDARY = {
    answers: '已部署 shadow 实例上的只读 acceptance 与最小 GM/runtime read path 是否通过。',
    excludes: '不证明 destructive backup/restore、维护窗口是否开放、完整运营人工回归是否完成。',
};
/**
 * 记录legacys2cevents。
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
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录健康状态。
 */
    const health = await fetchHealthJson('/health');
    if (!isShadowHealthAlive(health)) {
        throw new Error(`unexpected /health payload: ${JSON.stringify(health)}`);
    }
    if (health?.readiness?.maintenance?.active === true) {
        throw new Error(`expected maintenance inactive, got ${JSON.stringify(health.readiness.maintenance)}`);
    }
/**
 * 记录令牌。
 */
    const token = await loginGm();
/**
 * 记录GM状态。
 */
    const gmState = await fetchJson('/api/gm/state', {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
    if (!gmState || !Array.isArray(gmState.players) || !Array.isArray(gmState.mapIds)) {
        throw new Error(`unexpected /api/gm/state payload: ${JSON.stringify(gmState)}`);
    }
/**
 * 记录数据库状态。
 */
    const databaseState = assertGmDatabaseStateShape(await authedGetJson('/api/gm/database/state', token));
/**
 * 记录编辑器目录。
 */
    const editorCatalog = assertEditorCatalogShape(await authedGetJson('/api/gm/editor-catalog', token));
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(serverUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            protocol: 'next',
        },
    });
/**
 * 记录events。
 */
    const events = [];
/**
 * 记录legacyevents。
 */
    const legacyEvents = [];
/**
 * 记录会话init。
 */
    let sessionInit = null;
/**
 * 记录运行态玩家ID。
 */
    let runtimePlayerId = '';
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
/**
 * 记录socketerror。
 */
    let socketError = null;
    socket.onAny((event) => {
        if (LEGACY_S2C_EVENTS.has(event)) {
            legacyEvents.push(event);
        }
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        socketError = new Error(`shadow socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        sessionInit = payload;
        runtimePlayerId = String(payload?.pid ?? '');
        events.push(payload?.resumed ? 'init:resumed' : 'init:new');
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
        events.push('mapEnter');
    });
    socket.on(shared_1.NEXT_S2C.Bootstrap, () => {
        bootstrapCount += 1;
        events.push('bootstrap');
    });
    socket.on(shared_1.NEXT_S2C.MapStatic, () => {
        mapStaticCount += 1;
        events.push('mapStatic');
    });
    socket.on(shared_1.NEXT_S2C.Realm, () => {
        realmCount += 1;
        events.push('realm');
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, () => {
        worldDeltaCount += 1;
        events.push('worldDelta');
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, () => {
        selfDeltaCount += 1;
        events.push('selfDelta');
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, () => {
        panelDeltaCount += 1;
        events.push('panelDelta');
    });
    await onceConnected(socket);
    socket.emit(shared_1.NEXT_C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => {
        throwIfSocketError(socketError);
        return runtimePlayerId.length > 0
            && sessionInit !== null
            && mapEnterCount > 0
            && bootstrapCount > 0
            && mapStaticCount > 0
            && realmCount > 0
            && worldDeltaCount > 0
            && selfDeltaCount > 0
            && panelDeltaCount > 0;
    }, 5000);
    if (legacyEvents.length > 0) {
        throw new Error(`shadow socket received legacy events: ${legacyEvents.join(', ')}`);
    }
/**
 * 记录玩家状态payload。
 */
    const playerStatePayload = await fetchPlayerState(runtimePlayerId);
/**
 * 记录运行态玩家。
 */
    const runtimePlayer = playerStatePayload?.player ?? null;
    if (!runtimePlayer
        || typeof runtimePlayer.templateId !== 'string'
        || !runtimePlayer.templateId
        || !Number.isFinite(runtimePlayer.x)
        || !Number.isFinite(runtimePlayer.y)) {
        throw new Error(`unexpected shadow runtime player state: ${JSON.stringify(playerStatePayload)}`);
    }
    /**
 * 保存当前值映射。
 */

    const currentMap = assertGmMapsShape(await authedGetJson('/api/gm/maps', token), runtimePlayer.templateId);
    const runtimeInspection = assertMapRuntimeShape(await fetchGmMapRuntime(token, runtimePlayer.templateId, runtimePlayerId, runtimePlayer.x, runtimePlayer.y), runtimePlayer.templateId, runtimePlayerId);
    socket.close();
    console.log(JSON.stringify({
        ok: true,
        url: serverUrl,
        boundary: SHADOW_SMOKE_BOUNDARY,
        playerId: runtimePlayerId,
        gmState: {
            playerCount: gmState.players.length,
            mapCount: gmState.mapIds.length,
            botCount: gmState.botCount ?? null,
        },
        health: {
            ready: resolveShadowHealthReady(health),
            maintenance: health.readiness.maintenance?.active ?? false,
        },
        adminRead: {
            currentMap: {
                id: currentMap.id,
                width: currentMap.width,
                height: currentMap.height,
            },
            databaseState,
            editorCatalog,
            runtimeInspection,
        },
        session: {
            sessionId: sessionInit?.sid ?? null,
            resumed: sessionInit?.resumed ?? null,
            mapEnterCount,
            bootstrapCount,
            mapStaticCount,
            realmCount,
            worldDeltaCount,
            selfDeltaCount,
            panelDeltaCount,
        },
        legacyEvents,
        events,
    }, null, 2));
}
/**
 * 处理loginGM。
 */
async function loginGm() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (let attempt = 0; attempt < 3; attempt += 1) {
/**
 * 记录response。
 */
        const response = await fetch(`${serverUrl}/api/auth/gm/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                password: gmPassword,
            }),
        });
        if (response.status === 429 && attempt < 2) {
            await sleep(1500 * (attempt + 1));
            continue;
        }
        if (!response.ok) {
            throw new Error(`gm login failed: ${response.status} ${await response.text()}`);
        }
/**
 * 记录payload。
 */
        const payload = await response.json();
/**
 * 记录令牌。
 */
        const token = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
        if (!token) {
            throw new Error(`gm login missing accessToken: ${JSON.stringify(payload)}`);
        }
        return token;
    }
    throw new Error('gm login failed after retries');
}
/**
 * 处理fetchjson。
 */
async function fetchJson(path, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${serverUrl}${path}`, options);
    if (!response.ok) {
        throw new Error(`request failed: ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理fetchhealthjson。
 */
async function fetchHealthJson(path) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${serverUrl}${path}`);
/**
 * 记录payload。
 */
    const payload = await response.json();
    if (!response.ok && !isShadowHealthAlive(payload)) {
        throw new Error(`request failed: ${path} -> ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}
/**
 * 处理authedgetjson。
 */
async function authedGetJson(path, token) {
    return fetchJson(path, {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
}
/**
 * 处理sleep。
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 处理isshadowhealthalive。
 */
function isShadowHealthAlive(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!payload || typeof payload !== 'object') {
        return false;
    }
    return payload?.ok === true
        || payload?.alive?.ok === true
        || payload?.status === 'ok';
}
/**
 * 处理resolveshadowhealthready。
 */
function resolveShadowHealthReady(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (payload?.readiness != null) {
        return payload?.readiness?.ok === true;
    }
    return isShadowHealthAlive(payload);
}
/**
 * 处理fetch玩家状态。
 */
async function fetchPlayerState(playerIdValue) {
    return fetchJson(`/runtime/players/${playerIdValue}/state`);
}
/**
 * 处理fetchGM地图运行态。
 */
async function fetchGmMapRuntime(token, mapId, viewerId, x, y) {
/**
 * 记录startx。
 */
    const startX = Math.max(0, Math.trunc(x) - 2);
/**
 * 记录starty。
 */
    const startY = Math.max(0, Math.trunc(y) - 2);
    return authedGetJson(`/api/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(viewerId)}`, token);
}
/**
 * 断言GMmapsshape。
 */
function assertGmMapsShape(payload, expectedMapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(payload?.maps) || payload.maps.length === 0) {
        throw new Error(`unexpected gm maps payload: ${JSON.stringify(payload)}`);
    }
/**
 * 记录汇总。
 */
    const summary = payload.maps.find((entry) => entry?.id === expectedMapId);
    if (!summary || !Number.isFinite(summary.width) || !Number.isFinite(summary.height)) {
        throw new Error(`missing current map summary for ${expectedMapId}: ${JSON.stringify(payload)}`);
    }
    return summary;
}
/**
 * 断言编辑器目录shape。
 */
function assertEditorCatalogShape(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录items。
 */
    const items = Array.isArray(payload?.items) ? payload.items : null;
/**
 * 记录techniques。
 */
    const techniques = Array.isArray(payload?.techniques) ? payload.techniques : null;
/**
 * 记录境界levels。
 */
    const realmLevels = Array.isArray(payload?.realmLevels) ? payload.realmLevels : null;
/**
 * 记录buffs。
 */
    const buffs = Array.isArray(payload?.buffs) ? payload.buffs : null;
    if (!items || !techniques || !realmLevels || !buffs) {
        throw new Error(`unexpected gm editor catalog payload: ${JSON.stringify(payload)}`);
    }
    if (items.length === 0 || techniques.length === 0 || realmLevels.length === 0) {
        throw new Error(`gm editor catalog unexpectedly empty: ${JSON.stringify({
            items: items.length,
            techniques: techniques.length,
            realmLevels: realmLevels.length,
            buffs: buffs.length,
        })}`);
    }
    return {
        itemCount: items.length,
        techniqueCount: techniques.length,
        realmLevelCount: realmLevels.length,
        buffCount: buffs.length,
    };
}
/**
 * 断言GM数据库状态shape。
 */
function assertGmDatabaseStateShape(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`unexpected gm database state payload: ${JSON.stringify(payload)}`);
    }
    if (!Array.isArray(payload.backups)) {
        throw new Error(`expected gm database state backups array: ${JSON.stringify(payload)}`);
    }
/**
 * 记录runningjob。
 */
    const runningJob = normalizeDatabaseJobShape(payload.runningJob, 'runningJob');
/**
 * 记录lastjob。
 */
    const lastJob = normalizeDatabaseJobShape(payload.lastJob, 'lastJob');
    return {
        backupCount: payload.backups.length,
        runningJobType: runningJob?.type ?? null,
        runningJobStatus: runningJob?.status ?? null,
        runningJobPhase: runningJob?.phase ?? null,
        lastJobType: lastJob?.type ?? null,
        lastJobStatus: lastJob?.status ?? null,
        lastJobPhase: lastJob?.phase ?? null,
        lastJobSourceBackupId: lastJob?.sourceBackupId ?? null,
        lastJobCheckpointBackupId: lastJob?.checkpointBackupId ?? null,
    };
}
/**
 * 规范化数据库jobshape。
 */
function normalizeDatabaseJobShape(job, label) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (job == null) {
        return null;
    }
    if (typeof job !== 'object' || Array.isArray(job)) {
        throw new Error(`expected gm database state ${label} object or null: ${JSON.stringify(job)}`);
    }
/**
 * 记录type。
 */
    const type = normalizeOptionalString(job.type, `${label}.type`);
/**
 * 记录status。
 */
    const status = normalizeOptionalString(job.status, `${label}.status`);
/**
 * 记录phase。
 */
    const phase = normalizeOptionalString(job.phase, `${label}.phase`);
/**
 * 记录来源备份ID。
 */
    const sourceBackupId = normalizeOptionalString(job.sourceBackupId, `${label}.sourceBackupId`);
/**
 * 记录checkpoint备份ID。
 */
    const checkpointBackupId = normalizeOptionalString(job.checkpointBackupId, `${label}.checkpointBackupId`);
/**
 * 记录appliedat。
 */
    const appliedAt = normalizeOptionalString(job.appliedAt, `${label}.appliedAt`);
/**
 * 记录finishedat。
 */
    const finishedAt = normalizeOptionalString(job.finishedAt, `${label}.finishedAt`);
    return {
        type,
        status,
        phase,
        sourceBackupId,
        checkpointBackupId,
        appliedAt,
        finishedAt,
    };
}
/**
 * 规范化optionalstring。
 */
function normalizeOptionalString(value, label) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (value == null) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error(`expected ${label} to be string when present, got ${JSON.stringify(value)}`);
    }
/**
 * 记录trimmed。
 */
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
/**
 * 断言地图运行态shape。
 */
function assertMapRuntimeShape(payload, expectedMapId, expectedPlayerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (payload?.mapId !== expectedMapId || !Array.isArray(payload?.tiles) || !Array.isArray(payload?.entities)) {
        throw new Error(`unexpected gm map runtime payload: ${JSON.stringify(payload)}`);
    }
/**
 * 汇总tile行数据。
 */
    const tileRows = payload.tiles;
    if (tileRows.length === 0 || !Array.isArray(tileRows[0]) || tileRows[0].length === 0) {
        throw new Error(`gm map runtime tiles unexpectedly empty: ${JSON.stringify(payload)}`);
    }
/**
 * 记录玩家entity。
 */
    const playerEntity = payload.entities.find((entry) => entry?.id === expectedPlayerId);
    if (!playerEntity || playerEntity.kind !== 'player') {
        throw new Error(`gm map runtime missing player entity ${expectedPlayerId}: ${JSON.stringify(payload.entities)}`);
    }
    return {
        mapId: payload.mapId,
        tileRows: tileRows.length,
        tileColumns: Array.isArray(tileRows[0]) ? tileRows[0].length : 0,
        entityCount: payload.entities.length,
        playerEntityKind: playerEntity.kind,
    };
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
 * 等待for。
 */
async function waitFor(predicate, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
 * 处理throwifsocketerror。
 */
function throwIfSocketError(error) {
    if (error) {
        throw error;
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

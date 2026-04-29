// @ts-nocheck

/**
 * 用途：执行 monster-loot 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const smoke_player_auth_1 = require("./smoke-player-auth");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录怪物ID。
 */
const MONSTER_ID = process.env.SERVER_SMOKE_MONSTER_ID ?? 'm_town_rat_south';
/**
 * 记录rolls。
 */
const ROLLS = Number(process.env.SERVER_SMOKE_MONSTER_ROLLS ?? 500);
/**
 * 记录目标物品ID。
 */
const TARGET_ITEM_ID = 'rat_tail';
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录认证。
 */
    const auth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'mlt',
        rolePrefix: '落',
        seed: 'monster-loot',
    });
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token: auth.accessToken,
            protocol: 'mainline',
        },
    });
/**
 * 记录worldevents。
 */
    const worldEvents = [];
/**
 * 记录panelevents。
 */
    const panelEvents = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    socket.on(shared_1.S2C.PanelDelta, (payload) => {
        panelEvents.push(payload);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.C2S.Hello, {
            mapId: 'yunlai_town',
            preferredX: 20,
            preferredY: 20,
        });
/**
 * 记录玩家状态。
 */
        const playerState = await waitForState(async () => {
            if (!playerId) {
                return null;
            }
/**
 * 记录状态。
 */
            const state = await fetchState();
            return state.player ? state : null;
        }, 5000);
/**
 * 记录清洁地块。
 */
        const cleanTile = await findCleanLootTile(playerState.player.instanceId, playerState.player.x, playerState.player.y);
        if (cleanTile.x !== playerState.player.x || cleanTile.y !== playerState.player.y) {
            await movePlayerToTile(socket, cleanTile.x, cleanTile.y);
        }
/**
 * 记录spawn前状态。
 */
        const spawnState = await waitForState(async () => {
/**
 * 记录状态。
 */
            const state = await fetchState();
            return state.player?.x === cleanTile.x && state.player?.y === cleanTile.y
                ? state
                : null;
        }, 5000);
        const { instanceId, x, y } = spawnState.player;
/**
 * 记录inventorybefore。
 */
        const inventoryBefore = getInventoryCount(spawnState.player, TARGET_ITEM_ID);
        await postJson(`/runtime/instances/${instanceId}/spawn-monster-loot`, {
            monsterId: MONSTER_ID,
            x,
            y,
            rolls: ROLLS,
        });
/**
 * 记录tileafter出生点。
 */
        const tileAfterSpawn = await waitForState(async () => {
/**
 * 记录tile。
 */
            const tile = await fetchTile(instanceId, x, y);
            return tile.tile?.groundPile?.items?.some((entry) => entry.itemId === TARGET_ITEM_ID && entry.count > 0)
                ? tile
                : null;
        }, 5000);
/**
 * 记录来源ID。
 */
        const sourceId = tileAfterSpawn.tile?.groundPile?.sourceId ?? '';
/**
 * 记录rattail数量。
 */
        const ratTailCount = tileAfterSpawn.tile?.groundPile?.items?.find((entry) => entry.itemId === TARGET_ITEM_ID)?.count ?? 0;
        if (!sourceId || ratTailCount <= 0) {
            throw new Error(`expected spawned ${TARGET_ITEM_ID}, got ${JSON.stringify(tileAfterSpawn)}`);
        }
        if (!worldEvents.some((payload) => payload.g?.some((entry) => entry.sourceId === sourceId && entry.items?.some((item) => item.itemId === TARGET_ITEM_ID && item.count === ratTailCount)))) {
            throw new Error(`expected worldDelta.g spawn patch, got ${JSON.stringify(worldEvents)}`);
        }
        socket.emit(shared_1.C2S.TakeGround, {
            sourceId,
            itemKey: TARGET_ITEM_ID,
        });
        await waitFor(async () => {
/**
 * 记录状态。
 */
            const state = await fetchState();
/**
 * 记录tile。
 */
            const tile = await fetchTile(instanceId, x, y);
            return getInventoryCount(state.player, TARGET_ITEM_ID) === inventoryBefore + ratTailCount
                && !(tile.tile?.groundPile?.items?.some((entry) => entry.itemId === TARGET_ITEM_ID) ?? false);
        }, 5000).catch(async (error) => {
/**
 * 记录state。
 */
            const state = await fetchState().catch(() => null);
/**
 * 记录tile。
 */
            const tile = await fetchTile(instanceId, x, y).catch(() => null);
            throw new Error([
                error instanceof Error ? error.message : String(error),
                `state=${JSON.stringify(state)}`,
                `tile=${JSON.stringify(tile)}`,
                `lastPanel=${JSON.stringify(panelEvents[panelEvents.length - 1] ?? null)}`,
                `lastWorld=${JSON.stringify(worldEvents[worldEvents.length - 1] ?? null)}`,
            ].join('\n'));
        });
/**
 * 记录final状态。
 */
        const finalState = await fetchState();
/**
 * 记录finaltile。
 */
        const finalTile = await fetchTile(instanceId, x, y);
/**
 * 记录panel是否patched。
 */
        const inventoryPanelPatched = panelEvents.some((payload) => payload.inv?.slots?.some((entry) => entry.item?.itemId === TARGET_ITEM_ID && entry.item.count === inventoryBefore + ratTailCount));
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_URL,
            playerId,
            monsterId: MONSTER_ID,
            rolls: ROLLS,
            spawnedCount: ratTailCount,
            inventoryBefore,
            inventoryAfter: getInventoryCount(finalState.player, TARGET_ITEM_ID),
            inventoryPanelPatched,
            sourceId,
            finalTile,
            finalState,
        }, null, 2));
    }
    finally {
        socket.close();
        await deletePlayer(playerId);
    }
}
/**
 * 处理fetch状态。
 */
async function fetchState() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理fetchtile。
 */
async function fetchTile(instanceId, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
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
    const response = await fetch(`${SERVER_URL}${path}`, {
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
 * 获取inventory数量。
 */
function getInventoryCount(player, itemId) {
/**
 * 记录entry。
 */
    const entry = player.inventory?.items?.find((item) => item.itemId === itemId);
    return entry?.count ?? 0;
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
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4000);
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
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
/**
 * 等待for状态。
 */
async function waitForState(loader, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (true) {
/**
 * 记录价值。
 */
        const value = await loader();
        if (value) {
            return value;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitForState timeout');
        }
        await delay(100);
    }
}
/**
 * 处理move玩家到tile。
 */
async function movePlayerToTile(socket, targetX, targetY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    socket.emit(shared_1.C2S.MoveTo, {
        x: targetX,
        y: targetY,
        allowNearestReachable: false,
    });
    await waitForState(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.x === targetX && state.player?.y === targetY
            ? state
            : null;
    }, 5000);
}
/**
 * 查找干净 loot 地块。
 */
async function findCleanLootTile(instanceId, startX, startY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const visited = new Set();
    const candidates = [{ x: startX, y: startY }];
    for (let radius = 1; radius <= 6; radius += 1) {
        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
            for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                const x = startX + offsetX;
                const y = startY + offsetY;
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }
                visited.add(key);
                candidates.push({ x, y });
            }
        }
    }
    for (const candidate of candidates) {
/**
 * 记录tile。
 */
        const tile = await fetchTile(instanceId, candidate.x, candidate.y).catch(() => null);
        if (!tile?.tile?.groundPile) {
            return candidate;
        }
    }
    throw new Error(`failed to find clean loot tile near ${startX},${startY}`);
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdValue) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerIdValue}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

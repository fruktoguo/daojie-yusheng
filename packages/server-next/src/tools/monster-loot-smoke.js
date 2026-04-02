"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `monster_loot_${Date.now().toString(36)}`;
const MONSTER_ID = process.env.SERVER_NEXT_SMOKE_MONSTER_ID ?? 'm_town_rat_south';
const ROLLS = Number(process.env.SERVER_NEXT_SMOKE_MONSTER_ROLLS ?? 20);
const TARGET_ITEM_ID = 'rat_tail';
async function main() {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const worldEvents = [];
    const panelEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        panelEvents.push(payload);
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.NEXT_C2S.Hello, {
            playerId,
            mapId: 'yunlai_town',
            preferredX: 20,
            preferredY: 20,
        });
        const playerState = await waitForState(async () => {
            const state = await fetchState();
            return state.player ? state : null;
        }, 5000);
        const { instanceId, x, y } = playerState.player;
        const inventoryBefore = getInventoryCount(playerState.player, TARGET_ITEM_ID);
        await postJson(`/runtime/instances/${instanceId}/spawn-monster-loot`, {
            monsterId: MONSTER_ID,
            x,
            y,
            rolls: ROLLS,
        });
        const tileAfterSpawn = await waitForState(async () => {
            const tile = await fetchTile(instanceId, x, y);
            return tile.tile?.groundPile?.items?.some((entry) => entry.itemId === TARGET_ITEM_ID && entry.count > 0)
                ? tile
                : null;
        }, 5000);
        const sourceId = tileAfterSpawn.tile?.groundPile?.sourceId ?? '';
        const ratTailCount = tileAfterSpawn.tile?.groundPile?.items?.find((entry) => entry.itemId === TARGET_ITEM_ID)?.count ?? 0;
        if (!sourceId || ratTailCount <= 0) {
            throw new Error(`expected spawned ${TARGET_ITEM_ID}, got ${JSON.stringify(tileAfterSpawn)}`);
        }
        if (!worldEvents.some((payload) => payload.g?.some((entry) => entry.sourceId === sourceId && entry.items?.some((item) => item.itemId === TARGET_ITEM_ID && item.count === ratTailCount)))) {
            throw new Error(`expected worldDelta.g spawn patch, got ${JSON.stringify(worldEvents)}`);
        }
        socket.emit(shared_1.NEXT_C2S.TakeGround, {
            sourceId,
            itemKey: TARGET_ITEM_ID,
        });
        await waitFor(async () => {
            const state = await fetchState();
            const tile = await fetchTile(instanceId, x, y);
            return getInventoryCount(state.player, TARGET_ITEM_ID) === inventoryBefore + ratTailCount
                && !(tile.tile?.groundPile?.items?.some((entry) => entry.itemId === TARGET_ITEM_ID) ?? false)
                && panelEvents.some((payload) => payload.inv?.slots?.some((entry) => entry.item?.itemId === TARGET_ITEM_ID && entry.item.count === inventoryBefore + ratTailCount));
        }, 5000);
        const finalState = await fetchState();
        const finalTile = await fetchTile(instanceId, x, y);
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId,
            monsterId: MONSTER_ID,
            rolls: ROLLS,
            spawnedCount: ratTailCount,
            inventoryBefore,
            inventoryAfter: getInventoryCount(finalState.player, TARGET_ITEM_ID),
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
async function fetchState() {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function fetchTile(instanceId, x, y) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function postJson(path, body) {
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
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
function getInventoryCount(player, itemId) {
    const entry = player.inventory?.items?.find((item) => item.itemId === itemId);
    return entry?.count ?? 0;
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
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
async function waitFor(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
async function waitForState(loader, timeoutMs) {
    const startedAt = Date.now();
    while (true) {
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
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function deletePlayer(playerIdValue) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
main();
//# sourceMappingURL=monster-loot-smoke.js.map
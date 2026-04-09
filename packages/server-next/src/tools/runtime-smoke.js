"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
async function main() {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const eventLog = [];
    let playerId = '';
    let initialPanel = null;
    let vitalsDelta = null;
    let inventoryDelta = null;
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
        eventLog.push('initSession');
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        eventLog.push('mapEnter');
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, () => {
        eventLog.push('worldDelta');
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        eventLog.push('selfDelta');
        if ((payload.hp ?? 0) >= 72 && (payload.qi ?? 0) >= 18) {
            vitalsDelta = payload;
        }
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        eventLog.push('panelDelta');
        if (!initialPanel) {
            initialPanel = payload;
            return;
        }
        if (payload.inv?.slots?.some((entry) => entry.item?.itemId === 'rat_tail' && entry.item.count >= 2)) {
            inventoryDelta = payload;
        }
    });
    await onceConnected(socket);
    socket.emit('n:c:hello', {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => playerId.length > 0 && initialPanel !== null && eventLog.includes('initSession') && eventLog.includes('mapEnter'), 4000);
    socket.emit('n:c:move', { d: shared_1.Direction.North });
    await delay(1200);
    await postJson(`/runtime/players/${playerId}/vitals`, {
        hp: 72,
        qi: 18,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'rat_tail',
        count: 2,
    });
    await waitFor(() => vitalsDelta !== null && inventoryDelta !== null, 4000);
    socket.close();
    await deletePlayer(playerId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        playerId,
        events: eventLog,
        vitalsDelta,
        inventoryDelta,
    }, null, 2));
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
async function deletePlayer(playerIdToDelete) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
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
//# sourceMappingURL=runtime-smoke.js.map

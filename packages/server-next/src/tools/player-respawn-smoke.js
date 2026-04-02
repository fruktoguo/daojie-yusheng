"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `respawn_${Date.now().toString(36)}`;
async function main() {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const mapEnterEvents = [];
    const selfEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, (payload) => {
        mapEnterEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        selfEvents.push(payload);
    });
    await onceConnected(socket);
    socket.emit('n:c:hello', {
        playerId,
        mapId: 'wildlands',
        preferredX: 6,
        preferredY: 6,
    });
    await waitFor(() => mapEnterEvents.some((entry) => entry.mid === 'wildlands'), 4000);
    await postJson(`/runtime/players/${playerId}/damage`, {
        amount: 999999,
    });
    let respawnedState = null;
    await waitForCondition(async () => {
        const state = await fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
        if (!state.player) {
            return false;
        }
        if (state.player.templateId !== 'yunlai_town') {
            return false;
        }
        if (state.player.hp !== state.player.maxHp || state.player.qi !== state.player.maxQi) {
            return false;
        }
        respawnedState = state.player;
        return true;
    }, 6000);
    await waitFor(() => mapEnterEvents.some((entry) => entry.mid === 'yunlai_town'), 4000);
    await waitFor(() => selfEvents.some((entry) => entry.mid === 'yunlai_town' && entry.hp === entry.maxHp && entry.qi === entry.maxQi), 4000);
    socket.close();
    await deletePlayer(playerId);
    console.log(JSON.stringify({
        ok: true,
        playerId,
        maps: mapEnterEvents.map((entry) => entry.mid),
        respawned: respawnedState,
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
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
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
async function waitForCondition(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitForCondition timeout');
        }
        await delay(150);
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
//# sourceMappingURL=player-respawn-smoke.js.map
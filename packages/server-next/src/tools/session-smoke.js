"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `session_${Date.now().toString(36)}`;
async function main() {
    const first = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    let sessionId = '';
    let resumedInit = null;
    const events = [];
    await onceConnected(first);
    first.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        sessionId = payload.sid;
        events.push(payload.resumed ? 'first:init:resumed' : 'first:init:new');
    });
    first.on(shared_1.NEXT_S2C.MapEnter, () => {
        events.push('first:mapEnter');
    });
    first.emit('n:c:hello', {
        playerId,
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => sessionId.length > 0, 4000);
    first.close();
    await delay(1200);
    const second = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    await onceConnected(second);
    second.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        resumedInit = payload;
        events.push(payload.resumed ? 'second:init:resumed' : 'second:init:new');
    });
    second.emit('n:c:hello', {
        playerId,
        sessionId,
    });
    await waitFor(() => resumedInit !== null, 4000);
    second.close();
    await deletePlayer(playerId);
    const init = resumedInit;
    if (init.sid !== sessionId || init.resumed !== true) {
        throw new Error(`expected resumed session ${sessionId}, got ${JSON.stringify(init)}`);
    }
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        playerId,
        sessionId,
        events,
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
async function deletePlayer(playerIdToDelete) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=session-smoke.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `monster_runtime_${Date.now().toString(36)}`;
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
async function main() {
    const initialMonsters = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters`);
    const seedTarget = initialMonsters.monsters.find((entry) => entry.alive);
    if (!seedTarget) {
        throw new Error(`no alive monster found in ${instanceId}`);
    }
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const worldEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    await onceConnected(socket);
    socket.emit(shared_1.NEXT_C2S.Hello, {
        playerId,
        mapId: instanceId.replace('public:', ''),
        preferredX: seedTarget.x,
        preferredY: seedTarget.y,
    });
    const target = await waitForState(async () => {
        const view = await fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerId}/view`);
        if (!view.view?.localMonsters?.some((entry) => entry.runtimeId === seedTarget.runtimeId)) {
            return null;
        }
        const monster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${seedTarget.runtimeId}`);
        return monster.monster;
    }, 5000);
    if (!target || !target.alive) {
        throw new Error(`no visible alive monster found in ${instanceId}`);
    }
    await waitFor(() => hasMonsterSnapshot(worldEvents, target.runtimeId), 5000);
    await postJson(`/runtime/instances/${instanceId}/monsters/${target.runtimeId}/defeat`, {});
    await waitFor(async () => {
        const monster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
        return monster.monster?.alive === false
            && (monster.monster?.respawnLeft ?? 0) > 0;
    }, 5000);
    await waitFor(async () => {
        const monster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
        return monster.monster?.alive === true
            && monster.monster.hp === monster.monster.maxHp;
    }, (target.respawnTicks + 3) * 1000);
    const finalMonster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
    socket.close();
    await deletePlayer(playerId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        playerId,
        instanceId,
        runtimeId: target.runtimeId,
        monsterId: target.monsterId,
        respawnTicks: target.respawnTicks,
        worldEventCount: worldEvents.length,
        finalMonster,
    }, null, 2));
}
function hasMonsterSnapshot(events, runtimeId) {
    return events.some((payload) => payload.m?.some((entry) => entry.id === runtimeId && entry.mid && typeof entry.hp === 'number'));
}
async function fetchJson(url) {
    const response = await fetch(url);
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
async function deletePlayer(playerIdValue) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
main();
//# sourceMappingURL=monster-runtime-smoke.js.map
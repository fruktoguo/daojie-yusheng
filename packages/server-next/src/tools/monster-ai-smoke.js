"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `monster_ai_${Date.now().toString(36)}`;
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
const preferredMonsterId = process.env.SERVER_NEXT_SMOKE_MONSTER_ID ?? 'm_dust_vulture';
const boostedHp = 999;
async function main() {
    const initialMonsters = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters`);
    const target = initialMonsters.monsters.find((entry) => entry.alive && entry.monsterId === preferredMonsterId)
        ?? initialMonsters.monsters.find((entry) => entry.alive);
    if (!target) {
        throw new Error(`no alive monster found in ${instanceId}`);
    }
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const worldEvents = [];
    const selfEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        selfEvents.push(payload);
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.NEXT_C2S.Hello, {
            playerId,
            mapId: instanceId.replace('public:', ''),
            // Spawn on the monster anchor and let runtime pick the nearest open tile.
            // This avoids brittle assumptions about fixed offset positions still being visible to the player.
            preferredX: target.x,
            preferredY: target.y,
        });
        const initialPlayer = await waitForState(async () => {
            const state = await fetchPlayerState(playerId);
            return state.player ? state : null;
        }, 5000);
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedHp,
            maxHp: boostedHp,
        });
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            return state.player?.instanceId === instanceId
                && state.player?.maxHp === boostedHp
                && (state.player?.hp ?? 0) > 0;
        }, 5000);
        const initialState = await fetchPlayerState(playerId);
        if (initialState.player?.combat?.autoRetaliate) {
            socket.emit(shared_1.NEXT_C2S.UseAction, { actionId: 'toggle:auto_retaliate' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoRetaliate === false, 5000);
        }
        if ((await fetchPlayerState(playerId)).player?.combat?.autoBattle) {
            socket.emit(shared_1.NEXT_C2S.UseAction, { actionId: 'toggle:auto_battle' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoBattle === false, 5000);
        }
        const resolvedTarget = await waitForState(async () => {
            const view = await fetchPlayerView(playerId);
            const visibleMonsters = (view.view?.localMonsters ?? []);
            const preferredTarget = visibleMonsters.find((entry) => entry.monsterId === target.monsterId);
            const fallbackTarget = visibleMonsters[0];
            return preferredTarget ?? fallbackTarget ?? null;
        }, 5000);
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedHp,
            maxHp: boostedHp,
        });
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            return state.player?.instanceId === instanceId
                && state.player?.combat?.autoRetaliate === false
                && state.player?.combat?.autoBattle === false
                && state.player?.hp === boostedHp
                && state.player?.maxHp === boostedHp;
        }, 5000);
        const readyPlayer = await fetchPlayerState(playerId);
        const initialMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        await waitFor(async () => {
            const [playerState, monsterState] = await Promise.all([
                fetchPlayerState(playerId),
                fetchMonster(instanceId, resolvedTarget.runtimeId),
            ]);
            const playerDamaged = playerState.player?.hp < readyPlayer.player.hp;
            const monsterMoved = monsterState.monster
                && (monsterState.monster.x !== initialMonster.monster.x || monsterState.monster.y !== initialMonster.monster.y);
            const monsterPatched = worldEvents.some((payload) => payload.m?.some((entry) => entry.id === resolvedTarget.runtimeId && (entry.x !== undefined || entry.y !== undefined)));
            const selfDamaged = selfEvents.some((entry) => typeof entry.hp === 'number' && entry.hp < readyPlayer.player.hp);
            const monsterAggroed = monsterState.monster?.aggroTargetPlayerId === playerId;
            return Boolean(playerDamaged || selfDamaged || (monsterAggroed && (monsterMoved || monsterPatched)));
        }, 7000);
        const finalPlayer = await fetchPlayerState(playerId);
        const finalMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId,
            instanceId,
            runtimeId: resolvedTarget.runtimeId,
            monsterId: resolvedTarget.monsterId,
            playerHpLost: readyPlayer.player.hp - finalPlayer.player.hp,
            monsterMoved: finalMonster.monster.x !== initialMonster.monster.x || finalMonster.monster.y !== initialMonster.monster.y,
            worldEventCount: worldEvents.length,
            selfEventCount: selfEvents.length,
            finalMonster,
            finalPlayer,
        }, null, 2));
    }
    finally {
        socket.close();
        await deletePlayer(playerId);
    }
}
async function fetchPlayerState(playerIdValue) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}/state`);
}
async function fetchMonster(instanceIdValue, runtimeId) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceIdValue}/monsters/${runtimeId}`);
}
async function fetchPlayerView(playerIdValue) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}/view`);
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
        await new Promise((resolve) => setTimeout(resolve, 100));
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
        await new Promise((resolve) => setTimeout(resolve, 100));
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
main();
//# sourceMappingURL=monster-ai-smoke.js.map

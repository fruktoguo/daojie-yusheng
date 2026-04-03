"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `monster_combat_${Date.now().toString(36)}`;
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
const preferredMonsterId = process.env.SERVER_NEXT_SMOKE_MONSTER_ID ?? 'm_dust_vulture';
const skillBookItemId = 'book.redflame_art';
const skillId = 'skill.fire_talisman';
const skillRange = 3;
const boostedVitalCap = 999;
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
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.NEXT_C2S.Hello, {
            playerId,
            mapId: instanceId.replace('public:', ''),
            // Spawn on the monster anchor and let runtime pick the nearest open tile.
            // This avoids brittle assumptions about fixed offset positions still being visible/in-range.
            preferredX: target.x,
            preferredY: target.y,
        });
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            return Boolean(state.player);
        }, 5000);
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedVitalCap,
            maxHp: boostedVitalCap,
            qi: boostedVitalCap,
            maxQi: boostedVitalCap,
        });
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            return state.player?.hp === boostedVitalCap
                && state.player?.maxHp === boostedVitalCap
                && state.player?.qi === boostedVitalCap
                && state.player?.maxQi === boostedVitalCap;
        }, 5000);
        const initialState = await fetchPlayerState(playerId);
        await postJson(`/runtime/players/${playerId}/grant-item`, {
            itemId: skillBookItemId,
            count: 1,
        });
        const stateWithBook = await fetchPlayerState(playerId);
        const bookSlot = stateWithBook.player.inventory.items.findIndex((entry) => entry.itemId === skillBookItemId);
        if (bookSlot < 0) {
            throw new Error(`monster combat smoke missing technique book ${skillBookItemId}`);
        }
        socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: bookSlot });
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            return state.player?.actions?.actions?.some((entry) => entry.id === skillId);
        }, 5000);
        const learnedState = await fetchPlayerState(playerId);
        if (learnedState.player?.combat?.autoRetaliate) {
            socket.emit(shared_1.NEXT_C2S.UseAction, { actionId: 'toggle:auto_retaliate' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoRetaliate === false, 5000);
        }
        if ((await fetchPlayerState(playerId)).player?.combat?.autoBattle) {
            socket.emit(shared_1.NEXT_C2S.UseAction, { actionId: 'toggle:auto_battle' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoBattle === false, 5000);
        }
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedVitalCap,
            maxHp: boostedVitalCap,
            qi: boostedVitalCap,
            maxQi: boostedVitalCap,
        });
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            return state.player?.instanceId === instanceId
                && state.player?.combat?.autoRetaliate === false
                && state.player?.combat?.autoBattle === false
                && state.player?.hp === boostedVitalCap
                && state.player?.maxHp === boostedVitalCap
                && state.player?.qi === boostedVitalCap
                && state.player?.maxQi === boostedVitalCap;
        }, 5000);
        const resolvedTarget = await waitForState(async () => {
            const [view, playerState] = await Promise.all([
                fetchPlayerView(playerId),
                fetchPlayerState(playerId),
            ]);
            const visibleMonsters = (view.view?.localMonsters ?? []);
            const player = playerState.player;
            if (!player) {
                return null;
            }
            const inRangeMonsters = visibleMonsters.filter((entry) => Math.max(Math.abs(entry.x - player.x), Math.abs(entry.y - player.y)) <= skillRange);
            const preferredTarget = inRangeMonsters.find((entry) => entry.monsterId === target.monsterId);
            const fallbackTarget = inRangeMonsters[0];
            return preferredTarget ?? fallbackTarget ?? null;
        }, 5000);
        const resolvedMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        if (!resolvedMonster.monster?.alive) {
            throw new Error(`resolved monster ${resolvedTarget.runtimeId} is not alive`);
        }
        const beforePlayer = await fetchPlayerState(playerId);
        const beforeMonster = resolvedMonster;
        socket.emit(shared_1.NEXT_C2S.CastSkill, {
            skillId,
            targetMonsterId: resolvedTarget.runtimeId,
        });
        await waitFor(async () => {
            const [playerState, monsterState] = await Promise.all([
                fetchPlayerState(playerId),
                fetchMonster(instanceId, resolvedTarget.runtimeId),
            ]);
            return playerState.player?.qi < beforePlayer.player.qi
                && monsterState.monster?.alive === true
                && monsterState.monster.hp < beforeMonster.monster.hp
                && worldEvents.some((payload) => payload.m?.some((entry) => entry.id === resolvedTarget.runtimeId && typeof entry.hp === 'number' && entry.hp < beforeMonster.monster.hp));
        }, 5000);
        const finalPlayer = await fetchPlayerState(playerId);
        const finalMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId,
            instanceId,
            runtimeId: resolvedTarget.runtimeId,
            monsterId: resolvedTarget.monsterId,
            playerQiSpent: beforePlayer.player.qi - finalPlayer.player.qi,
            monsterHpLost: beforeMonster.monster.hp - finalMonster.monster.hp,
            worldEventCount: worldEvents.length,
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
async function deletePlayer(playerIdValue) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
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
main();
//# sourceMappingURL=monster-combat-smoke.js.map

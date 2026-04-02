"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `monster_skill_${Date.now().toString(36)}`;
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
const preferredMonsterId = process.env.SERVER_NEXT_SMOKE_MONSTER_ID ?? 'm_swamp_lizard';
const boostedHp = 999;
async function main() {
    const initialMonsters = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters`);
    const target = initialMonsters.monsters.find((entry) => entry.alive && entry.monsterId === preferredMonsterId);
    if (!target) {
        throw new Error(`no alive monster ${preferredMonsterId} found in ${instanceId}`);
    }
    const monsterBefore = await fetchMonster(instanceId, target.runtimeId);
    const skill = selectRangedSkill(monsterBefore.monster?.skills);
    if (!skill) {
        throw new Error(`monster ${target.runtimeId} has no ranged skill`);
    }
    const targetBuffId = skill.effects.find((entry) => entry.type === 'buff' && entry.target === 'target')?.buffId ?? null;
    const skillRange = resolveSkillRange(skill);
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
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
        const resolvedTarget = await waitForState(async () => {
            const view = await fetchPlayerView(playerId);
            const visibleMonsters = (view.view?.localMonsters ?? []);
            const preferredTarget = visibleMonsters.find((entry) => entry.monsterId === target.monsterId);
            const fallbackTarget = visibleMonsters[0];
            return preferredTarget ?? fallbackTarget ?? null;
        }, 5000);
        await waitFor(async () => {
            const [playerState, monsterState] = await Promise.all([
                fetchPlayerState(playerId),
                fetchMonster(instanceId, resolvedTarget.runtimeId),
            ]);
            const player = playerState.player;
            const monster = monsterState.monster;
            if (!player || !monster) {
                return false;
            }
            const distance = Math.max(Math.abs(player.x - monster.x), Math.abs(player.y - monster.y));
            const cooledDown = typeof monster.cooldownReadyTickBySkillId?.[skill.id] === 'number'
                && monster.cooldownReadyTickBySkillId[skill.id] > 0;
            const playerDamaged = player.hp < initialPlayer.player.hp;
            const buffApplied = targetBuffId
                ? player.buffs?.buffs?.some((entry) => entry.buffId === targetBuffId)
                : true;
            return Boolean(distance <= skillRange && cooledDown && playerDamaged && buffApplied);
        }, 8000);
        const finalPlayer = await fetchPlayerState(playerId);
        const finalMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId,
            instanceId,
            runtimeId: resolvedTarget.runtimeId,
            monsterId: resolvedTarget.monsterId,
            skillId: skill.id,
            playerHpLost: initialPlayer.player.hp - finalPlayer.player.hp,
            targetBuffId,
            targetBuffApplied: targetBuffId
                ? finalPlayer.player.buffs?.buffs?.some((entry) => entry.buffId === targetBuffId)
                : null,
            monsterSkillCooldownReadyTick: finalMonster.monster.cooldownReadyTickBySkillId?.[skill.id] ?? null,
            finalMonster,
            finalPlayer,
        }, null, 2));
    }
    finally {
        socket.close();
        await deletePlayer(playerId);
    }
}
function selectRangedSkill(skills) {
    if (!Array.isArray(skills)) {
        return null;
    }
    const ranged = skills.filter((entry) => resolveSkillRange(entry) > 1);
    if (ranged.length === 0) {
        return null;
    }
    ranged.sort((left, right) => {
        const rangeGap = resolveSkillRange(right) - resolveSkillRange(left);
        if (rangeGap !== 0) {
            return rangeGap;
        }
        return left.id.localeCompare(right.id, 'zh-Hans-CN');
    });
    return ranged[0] ?? null;
}
function resolveSkillRange(skill) {
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
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
//# sourceMappingURL=monster-skill-smoke.js.map
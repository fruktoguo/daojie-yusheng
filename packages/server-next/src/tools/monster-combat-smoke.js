"use strict";
/**
 * 用途：执行 monster-combat 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** socket_io_client_1：定义该变量以承载业务值。 */
const socket_io_client_1 = require("socket.io-client");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/**
 * 记录 server-next 访问地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录instanceID。
 */
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
/**
 * 记录优先值怪物ID。
 */
const preferredMonsterId = process.env.SERVER_NEXT_SMOKE_MONSTER_ID ?? 'm_dust_vulture';
/**
 * 记录技能book物品ID。
 */
const skillBookItemId = 'book.qingmu_sword';
/**
 * 记录功法ID。
 */
const techniqueId = 'qingmu_sword';
/**
 * 记录技能range。
 */
const skillRange = 3;
/**
 * 记录boostedvitalcap。
 */
const boostedVitalCap = 999;
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录initialmonsters。
 */
    const initialMonsters = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters`);
/**
 * 记录目标。
 */
    const target = initialMonsters.monsters.find((entry) => entry.alive && entry.monsterId === preferredMonsterId)
        ?? initialMonsters.monsters.find((entry) => entry.alive);
    if (!target) {
        throw new Error(`no alive monster found in ${instanceId}`);
    }
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录worldevents。
 */
    const worldEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.NEXT_C2S.Hello, {
            mapId: instanceId.replace('public:', ''),
            // Spawn on the monster anchor and let runtime pick the nearest open tile.
            // This avoids brittle assumptions about fixed offset positions still being visible/in-range.
            preferredX: target.x,
            preferredY: target.y,
        });
        await waitFor(async () => {
            if (!playerId) {
                return false;
            }
/**
 * 记录状态。
 */
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
/**
 * 记录状态。
 */
            const state = await fetchPlayerState(playerId);
            return state.player?.hp === boostedVitalCap
                && state.player?.maxHp === boostedVitalCap
                && state.player?.qi === boostedVitalCap
                && state.player?.maxQi === boostedVitalCap;
        }, 5000);
/**
 * 记录initial状态。
 */
        const initialState = await fetchPlayerState(playerId);
        if (initialState.player?.combat?.autoRetaliate) {
            socket.emit(shared_1.NEXT_C2S.UseAction, { actionId: 'toggle:auto_retaliate' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoRetaliate === false, 5000);
        }
        if ((await fetchPlayerState(playerId)).player?.combat?.autoBattle) {
            socket.emit(shared_1.NEXT_C2S.UseAction, { actionId: 'toggle:auto_battle' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoBattle === false, 5000);
        }
        await postJson(`/runtime/players/${playerId}/grant-item`, {
            itemId: skillBookItemId,
            count: 1,
        });
/**
 * 记录状态withbook。
 */
        const stateWithBook = await fetchPlayerState(playerId);
/**
 * 记录bookslot。
 */
        const bookSlot = stateWithBook.player.inventory.items.findIndex((entry) => entry.itemId === skillBookItemId);
        if (bookSlot < 0) {
            throw new Error(`monster combat smoke missing technique book ${skillBookItemId}`);
        }
        socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: bookSlot });
        await waitFor(async () => {
/**
 * 记录状态。
 */
            const state = await fetchPlayerState(playerId);
            if (!state.player?.techniques?.techniques?.some((entry) => entry.techId === techniqueId)) {
                return false;
            }
/** learnedSkillId：定义该变量以承载业务值。 */
            const learnedSkillId = resolveTechniqueSkillId(state.player, techniqueId);
            return state.player?.actions?.actions?.some((entry) => entry.id === learnedSkillId);
        }, 5000);
/**
 * 记录learned状态。
 */
        const learnedState = await fetchPlayerState(playerId);
/**
 * 记录真实技能。
 */
        const learnedSkill = resolveTechniqueSkill(learnedState.player, techniqueId);
/**
 * 记录真实技能ID。
 */
        const learnedSkillId = learnedSkill.id;
/**
 * 记录真实技能range。
 */
        const learnedSkillRange = Number.isFinite(learnedSkill.range) ? Math.max(1, Math.trunc(learnedSkill.range)) : skillRange;
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedVitalCap,
            maxHp: boostedVitalCap,
            qi: boostedVitalCap,
            maxQi: boostedVitalCap,
        });
        await waitFor(async () => {
/**
 * 记录状态。
 */
            const state = await fetchPlayerState(playerId);
            return state.player?.instanceId === instanceId
                && state.player?.combat?.autoRetaliate === false
                && state.player?.combat?.autoBattle === false
                && state.player?.hp === boostedVitalCap
                && state.player?.maxHp === boostedVitalCap
                && state.player?.qi === boostedVitalCap
                && state.player?.maxQi === boostedVitalCap;
        }, 5000);
/**
 * 记录resolved目标。
 */
        const resolvedTarget = await waitForState(async () => {
            const [view, playerState] = await Promise.all([
                fetchPlayerView(playerId),
                fetchPlayerState(playerId),
            ]);
/**
 * 记录visiblemonsters。
 */
            const visibleMonsters = (view.view?.localMonsters ?? []);
/**
 * 记录玩家。
 */
            const player = playerState.player;
            if (!player) {
                return null;
            }
/**
 * 记录inrangemonsters。
 */
            const inRangeMonsters = visibleMonsters.filter((entry) => Math.max(Math.abs(entry.x - player.x), Math.abs(entry.y - player.y)) <= learnedSkillRange);
/**
 * 记录优先值目标。
 */
            const preferredTarget = inRangeMonsters.find((entry) => entry.monsterId === target.monsterId);
/**
 * 记录fallback目标。
 */
            const fallbackTarget = inRangeMonsters[0];
            return preferredTarget ?? fallbackTarget ?? null;
        }, 5000);
/**
 * 记录resolved怪物。
 */
        const resolvedMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        if (!resolvedMonster.monster?.alive) {
            throw new Error(`resolved monster ${resolvedTarget.runtimeId} is not alive`);
        }
/**
 * 记录before玩家。
 */
        let beforePlayer = null;
/**
 * 记录before怪物。
 */
        let beforeMonster = null;
/**
 * 记录final玩家。
 */
        let finalPlayer = null;
/**
 * 记录final怪物。
 */
        let finalMonster = null;
/**
 * 记录之前事件数量。
 */
        beforePlayer = await fetchPlayerState(playerId);
        beforeMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
/** beforeEventCount：定义该变量以承载业务值。 */
        const beforeEventCount = worldEvents.length;
        socket.emit(shared_1.NEXT_C2S.CastSkill, buildCastSkillPayload(learnedSkill, resolvedTarget));
        await waitFor(async () => {
            const [playerState, monsterState] = await Promise.all([
                fetchPlayerState(playerId),
                fetchMonster(instanceId, resolvedTarget.runtimeId),
            ]);
            return playerState.player?.qi < beforePlayer.player.qi
                || readCooldownLeft(playerState.player, learnedSkillId) > 0
                || monsterState.monster?.hp < beforeMonster.monster.hp
                || worldEvents.slice(beforeEventCount).some((payload) => payload.m?.some((entry) => entry.id === resolvedTarget.runtimeId && typeof entry.hp === 'number' && entry.hp < beforeMonster.monster.hp));
        }, 5000);
        finalPlayer = await fetchPlayerState(playerId);
        finalMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
/**
 * 记录是否已观测到施法成功。
 */
        const castObserved = finalPlayer.player.qi < beforePlayer.player.qi
            || readCooldownLeft(finalPlayer.player, learnedSkillId) > 0
            || worldEvents.slice(beforeEventCount).some((payload) => payload.m?.some((entry) => entry.id === resolvedTarget.runtimeId && typeof entry.hp === 'number'));
/**
 * 记录是否已检测到伤害。
 */
        const damageDetected = Boolean(finalMonster.monster?.alive) && finalMonster.monster.hp < beforeMonster.monster.hp;
        if (!castObserved) {
            throw new Error(`expected monster skill cast to be observed, attackerQi=${beforePlayer.player.qi} finalQi=${finalPlayer.player.qi} cooldown=${readCooldownLeft(finalPlayer.player, learnedSkillId)}`);
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId,
            instanceId,
            runtimeId: resolvedTarget.runtimeId,
            monsterId: resolvedTarget.monsterId,
            castObserved,
            damageDetected,
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
/**
 * 处理fetch玩家状态。
 */
async function fetchPlayerState(playerIdValue) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}/state`);
}
/**
 * 处理fetch怪物。
 */
async function fetchMonster(instanceIdValue, runtimeId) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceIdValue}/monsters/${runtimeId}`);
}
/**
 * 处理fetch玩家view。
 */
async function fetchPlayerView(playerIdValue) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}/view`);
}
/**
 * 处理fetchjson。
 */
async function fetchJson(url) {
/**
 * 记录response。
 */
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理postjson。
 */
async function postJson(path, body) {
/**
 * 记录response。
 */
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
/**
 * 处理onceconnected。
 */
async function onceConnected(socket) {
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
 * 处理delete玩家。
 */
async function deletePlayer(playerIdValue) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 等待for。
 */
async function waitFor(predicate, timeoutMs) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
/**
 * 等待for状态。
 */
async function waitForState(loader, timeoutMs) {
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
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
/**
 * 读取技能剩余冷却。
 */
function readCooldownLeft(player, actionId) {
/**
 * 记录entry。
 */
    const entry = player?.actions?.actions?.find((item) => item.id === actionId);
    return typeof entry?.cooldownLeft === 'number' ? entry.cooldownLeft : 0;
}
/**
 * 从当前玩家状态里解析指定功法已解锁的真实技能。
 */
function resolveTechniqueSkill(player, techId) {
/**
 * 记录technique。
 */
    const technique = player?.techniques?.techniques?.find((entry) => entry.techId === techId) ?? null;
    if (!technique || !Array.isArray(technique.skills)) {
        throw new Error(`missing technique skills for tech: ${techId}`);
    }
/**
 * 记录level。
 */
    const level = Number.isFinite(technique.level) ? technique.level : 1;
/**
 * 记录skill。
 */
    const skill = technique.skills.find((entry) => {
        if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
            return false;
        }
/** unlockLevel：定义该变量以承载业务值。 */
        const unlockLevel = Number.isFinite(entry.unlockLevel) ? entry.unlockLevel : 1;
        return level >= unlockLevel;
    }) ?? null;
    if (!skill) {
        throw new Error(`missing unlocked technique skill for tech: ${techId}`);
    }
    return skill;
}
/**
 * 从当前玩家状态里解析指定功法已解锁的真实技能 ID。
 */
function resolveTechniqueSkillId(player, techId) {
    return resolveTechniqueSkill(player, techId).id;
}
/**
 * 按真实目标模式构造 CastSkill 发包。
 */
function buildCastSkillPayload(skill, target) {
    if (skill?.targetMode === 'tile') {
        return {
            skillId: skill.id,
            targetRef: `tile:${target.x}:${target.y}`,
        };
    }
    return {
        skillId: skill.id,
        targetMonsterId: target.runtimeId,
    };
}
main();
//# sourceMappingURL=monster-combat-smoke.js.map

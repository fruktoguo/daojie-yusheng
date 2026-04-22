// @ts-nocheck

/**
 * 用途：执行 monster-skill 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录instanceID。
 */
const instanceId = process.env.SERVER_SMOKE_INSTANCE_ID ?? 'public:wildlands';
/**
 * 记录优先值怪物ID。
 */
const preferredMonsterId = process.env.SERVER_SMOKE_MONSTER_ID ?? 'm_swamp_lizard';
/**
 * 记录boostedhp。
 */
const boostedHp = 999;
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录initialmonsters。
 */
    const initialMonsters = await fetchJson(`${SERVER_URL}/runtime/instances/${instanceId}/monsters`);
/**
 * 记录目标。
 */
    const target = initialMonsters.monsters.find((entry) => entry.alive && entry.monsterId === preferredMonsterId);
    if (!target) {
        throw new Error(`no alive monster ${preferredMonsterId} found in ${instanceId}`);
    }
/**
 * 记录怪物before。
 */
    const monsterBefore = await fetchMonster(instanceId, target.runtimeId);
/**
 * 记录技能。
 */
    const skill = selectRangedSkill(monsterBefore.monster?.skills);
    if (!skill) {
        throw new Error(`monster ${target.runtimeId} has no ranged skill`);
    }
/**
 * 记录目标BuffID。
 */
    const targetBuffId = skill.effects.find((entry) => entry.type === 'buff' && entry.target === 'target')?.buffId ?? null;
/**
 * 记录技能range。
 */
    const skillRange = resolveSkillRange(skill);
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            protocol: 'mainline',
        },
    });
    const worldEvents = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.C2S.Hello, {
            mapId: instanceId.replace('public:', ''),
            // Spawn on the monster anchor and let runtime pick the nearest open tile.
            // This avoids brittle assumptions about fixed offset positions still being visible/in-range.
            preferredX: target.x,
            preferredY: target.y,
        });
/**
 * 记录initial玩家。
 */
        const initialPlayer = await waitForState(async () => {
            if (!playerId) {
                return null;
            }
/**
 * 记录状态。
 */
            const state = await fetchPlayerState(playerId);
            return state.player ? state : null;
        }, 5000);
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedHp,
            maxHp: boostedHp,
        });
        await waitFor(async () => {
/**
 * 记录状态。
 */
            const state = await fetchPlayerState(playerId);
            return state.player?.instanceId === instanceId
                && state.player?.maxHp === boostedHp
                && (state.player?.hp ?? 0) > 0;
        }, 5000);
/**
 * 记录resolved目标。
 */
        const resolvedTarget = await waitForState(async () => {
/**
 * 记录view。
 */
            const view = await fetchPlayerView(playerId);
/**
 * 记录visiblemonsters。
 */
            const visibleMonsters = (view.view?.localMonsters ?? []);
/**
 * 记录优先值目标。
 */
            const preferredTarget = visibleMonsters.find((entry) => entry.monsterId === target.monsterId);
/**
 * 记录fallback目标。
 */
            const fallbackTarget = visibleMonsters[0];
            return preferredTarget ?? fallbackTarget ?? null;
        }, 5000);
        await waitFor(async () => {
            const [playerState, monsterState] = await Promise.all([
                fetchPlayerState(playerId),
                fetchMonster(instanceId, resolvedTarget.runtimeId),
            ]);
/**
 * 记录玩家。
 */
            const player = playerState.player;
/**
 * 记录怪物。
 */
            const monster = monsterState.monster;
            if (!player || !monster) {
                return false;
            }
/**
 * 记录distance。
 */
            const distance = Math.max(Math.abs(player.x - monster.x), Math.abs(player.y - monster.y));
/**
 * 记录cooleddown。
 */
            const cooledDown = typeof monster.cooldownReadyTickBySkillId?.[skill.id] === 'number'
                && monster.cooldownReadyTickBySkillId[skill.id] > 0;
/**
 * 记录玩家damaged。
 */
            const playerDamaged = player.hp < initialPlayer.player.hp;
/**
 * 记录Buffapplied。
 */
            const buffApplied = targetBuffId
                ? player.buffs?.buffs?.some((entry) => entry.buffId === targetBuffId)
                : true;
            return Boolean(distance <= skillRange && cooledDown && playerDamaged && buffApplied);
        }, 8000);
/**
 * 记录final玩家。
 */
        const finalPlayer = await fetchPlayerState(playerId);
/**
 * 记录final怪物。
 */
        const finalMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        if (!worldEvents.some(hasCombatFx)) {
            throw new Error('expected combat fx world delta after monster skill');
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_URL,
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
            worldEventCount: worldEvents.length,
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
/**
 * hasCombatFx：判断战斗Fx是否满足条件。
 * @param payload 载荷参数。
 * @returns 无返回值，完成战斗Fx的条件判断。
 */

function hasCombatFx(payload) {
    return Array.isArray(payload?.fx) && payload.fx.length > 0;
}
/**
 * 处理selectranged技能。
 */
function selectRangedSkill(skills) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(skills)) {
        return null;
    }
/**
 * 记录ranged。
 */
    const ranged = skills.filter((entry) => resolveSkillRange(entry) > 1);
    if (ranged.length === 0) {
        return null;
    }
    ranged.sort((left, right) => {
/**
 * 记录rangegap。
 */
        const rangeGap = resolveSkillRange(right) - resolveSkillRange(left);
        if (rangeGap !== 0) {
            return rangeGap;
        }
        return left.id.localeCompare(right.id, 'zh-Hans-CN');
    });
    return ranged[0] ?? null;
}
/**
 * 解析技能range。
 */
function resolveSkillRange(skill) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录targetingrange。
 */
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}
/**
 * 处理fetch玩家状态。
 */
async function fetchPlayerState(playerIdValue) {
    return fetchJson(`${SERVER_URL}/runtime/players/${playerIdValue}/state`);
}
/**
 * 处理fetch怪物。
 */
async function fetchMonster(instanceIdValue, runtimeId) {
    return fetchJson(`${SERVER_URL}/runtime/instances/${instanceIdValue}/monsters/${runtimeId}`);
}
/**
 * 处理fetch玩家view。
 */
async function fetchPlayerView(playerIdValue) {
    return fetchJson(`${SERVER_URL}/runtime/players/${playerIdValue}/view`);
}
/**
 * 处理fetchjson。
 */
async function fetchJson(url) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        await new Promise((resolve) => setTimeout(resolve, 100));
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
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
main();

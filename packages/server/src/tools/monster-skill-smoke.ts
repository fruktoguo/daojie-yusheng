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
const smoke_payload_1 = require("./smoke-payload");
const smoke_player_auth_1 = require("./smoke-player-auth");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录会话ID。
 */
let sessionId = '';
/**
 * 记录instanceID。
 */
let instanceId = process.env.SERVER_SMOKE_INSTANCE_ID ?? 'public:wildlands';
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
    const resolvedInitial = await resolveInitialMonsterContext(instanceId);
    instanceId = resolvedInitial.instanceId;
    const initialMonsters = resolvedInitial.monsters;
/**
 * 记录目标。
 */
    const target = initialMonsters.monsters.find((entry) => entry.alive && entry.monsterId === preferredMonsterId);
    if (!target) {
        throw new Error(`no alive monster ${preferredMonsterId} found in ${instanceId}`);
    }
/**
 * 记录认证。
 */
    const auth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'msk',
        rolePrefix: '技',
        seed: 'monster-skill',
    });
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token: auth.accessToken,
            protocol: 'mainline',
        },
    });
    const worldEvents = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.WorldDelta, (payload) => {
        worldEvents.push(smoke_payload_1.decodeSmokePayload(payload));
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        const decodedPayload = smoke_payload_1.decodeSmokePayload(payload);
        playerId = String(decodedPayload?.pid ?? '');
        sessionId = String(decodedPayload?.sid ?? '');
    });
    try {
        await onceConnected(socket);
        await waitFor(() => playerId.length > 0 && sessionId.length > 0, 30000);
        await postJson('/runtime/players/connect', {
            playerId,
            sessionId,
            instanceId,
            mapId: resolveMonsterMapId(instanceId),
            // Spawn on the monster anchor and let runtime pick the nearest open tile.
            // This avoids brittle assumptions about fixed offset positions still being visible/in-range.
            preferredX: target.x,
            preferredY: target.y,
        });
        await waitFor(async () => sameSmokeInstanceId((await fetchPlayerState(playerId)).player?.instanceId, instanceId), 30000);
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
        }, 30000);
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedHp,
            maxHp: boostedHp,
        });
        await waitFor(async () => {
/**
 * 记录状态。
 */
            const state = await fetchPlayerState(playerId);
            return sameSmokeInstanceId(state.player?.instanceId, instanceId)
                && state.player?.maxHp === boostedHp
                && (state.player?.hp ?? 0) > 0;
        }, 30000);
        const initialState = await fetchPlayerState(playerId);
        if (initialState.player?.combat?.autoRetaliate) {
            socket.emit(shared_1.C2S.UseAction, { actionId: 'toggle:auto_retaliate' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoRetaliate === false, 30000);
        }
        if ((await fetchPlayerState(playerId)).player?.combat?.autoBattle) {
            socket.emit(shared_1.C2S.UseAction, { actionId: 'toggle:auto_battle' });
            await waitFor(async () => (await fetchPlayerState(playerId)).player?.combat?.autoBattle === false, 30000);
        }
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedHp,
            maxHp: boostedHp,
        });
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
        }, 30000);
        const resolvedMonsterBefore = await fetchMonster(instanceId, resolvedTarget.runtimeId);
/**
 * 记录用于贴近目标的技能。
 */
        const positioningSkill = selectRangedSkill(resolvedMonsterBefore.monster?.skills)
            ?? (Array.isArray(resolvedMonsterBefore.monster?.skills) ? resolvedMonsterBefore.monster.skills[0] : null);
        if (!positioningSkill) {
            throw new Error(`monster ${resolvedTarget.runtimeId} has no skill`);
        }
/**
 * 记录技能range。
 */
        const skillRange = resolveSkillRange(positioningSkill);
        const combatAnchor = await resolveMonsterSkillAnchor(instanceId, resolvedTarget, skillRange);
        await postJson('/runtime/players/connect', {
            playerId,
            sessionId,
            instanceId,
            mapId: resolveMonsterMapId(instanceId),
            preferredX: combatAnchor.x,
            preferredY: combatAnchor.y,
        });
        let anchorProbe = null;
        await waitFor(async () => {
            const state = await fetchPlayerState(playerId);
            const player = state.player;
            if (!player || !sameSmokeInstanceId(player.instanceId, instanceId)) {
                anchorProbe = { phase: 'player_missing_or_wrong_instance', player };
                return false;
            }
            const monsterState = await fetchMonster(instanceId, resolvedTarget.runtimeId);
            const monster = monsterState.monster;
            if (!monster) {
                anchorProbe = { phase: 'monster_missing', player, monster };
                return false;
            }
            const distance = Math.max(Math.abs(player.x - monster.x), Math.abs(player.y - monster.y));
            anchorProbe = {
                phase: 'waiting_for_anchor',
                combatAnchor,
                player: { x: player.x, y: player.y, instanceId: player.instanceId },
                monster: { x: monster.x, y: monster.y, aggroTargetPlayerId: monster.aggroTargetPlayerId },
                distance,
                skillRange,
            };
            return distance <= skillRange;
        }, 30000).catch((error) => {
            throw new Error(`${error.message}: ${JSON.stringify(anchorProbe)}`);
        });
        await postJson(`/runtime/players/${playerId}/vitals`, {
            hp: boostedHp,
            maxHp: boostedHp,
        });
        const readyPlayer = await fetchPlayerState(playerId);
        let skillProbe = null;
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
                skillProbe = { phase: 'player_or_monster_missing', player, monster };
                return false;
            }
/**
 * 记录distance。
 */
            const distance = Math.max(Math.abs(player.x - monster.x), Math.abs(player.y - monster.y));
/**
 * 记录cooleddown。
 */
            const observedSkill = findObservedMonsterSkill(monster, player);
            const targetBuffId = observedSkill?.effects?.find((entry) => entry.type === 'buff' && entry.target === 'target')?.buffId ?? null;
/**
 * 记录玩家damaged。
 */
            const playerDamaged = player.hp < readyPlayer.player.hp;
/**
 * 记录Buffapplied。
 */
            const buffApplied = targetBuffId
                ? player.buffs?.buffs?.some((entry) => entry.buffId === targetBuffId)
                : true;
            skillProbe = {
                phase: 'waiting_for_monster_skill',
                player: {
                    x: player.x,
                    y: player.y,
                    hp: player.hp,
                    maxHp: player.maxHp,
                    instanceId: player.instanceId,
                    buffs: player.buffs,
                },
                monster: {
                    x: monster.x,
                    y: monster.y,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    qi: monster.qi,
                    aggroTargetPlayerId: monster.aggroTargetPlayerId,
                    pendingCast: monster.pendingCast,
                    cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId,
                    skills: Array.isArray(monster.skills)
                        ? monster.skills.map((entry) => ({
                            id: entry.id,
                            range: resolveSkillRange(entry),
                            cooldown: monster.cooldownReadyTickBySkillId?.[entry.id] ?? 0,
                            qiCost: entry.qiCost ?? entry.cost?.qi ?? entry.resourceCost?.qi ?? null,
                            windupTicks: entry.monsterCast?.windupTicks ?? null,
                            conditions: entry.monsterCast?.conditions ?? null,
                            effects: entry.effects,
                        }))
                        : [],
                },
                distance,
                skillRange,
                observedSkillId: observedSkill?.id ?? null,
                targetBuffId,
                playerDamaged,
                buffApplied,
                worldEventCount: worldEvents.length,
                combatFxObserved: worldEvents.some(hasCombatFx),
            };
            return Boolean(distance <= skillRange && observedSkill && playerDamaged && buffApplied);
        }, 15000).catch((error) => {
            throw new Error(`${error.message}: ${JSON.stringify(skillProbe)}`);
        });
/**
 * 记录final玩家。
 */
        const finalPlayer = await fetchPlayerState(playerId);
/**
 * 记录final怪物。
 */
        const finalMonster = await fetchMonster(instanceId, resolvedTarget.runtimeId);
        const finalCastSkill = findObservedMonsterSkill(finalMonster.monster, finalPlayer.player);
        const finalTargetBuffId = finalCastSkill?.effects?.find((entry) => entry.type === 'buff' && entry.target === 'target')?.buffId ?? null;
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
            skillId: finalCastSkill?.id ?? null,
            playerHpLost: readyPlayer.player.hp - finalPlayer.player.hp,
            targetBuffId: finalTargetBuffId,
            targetBuffApplied: finalTargetBuffId
                ? finalPlayer.player.buffs?.buffs?.some((entry) => entry.buffId === finalTargetBuffId)
                : null,
            worldEventCount: worldEvents.length,
            monsterSkillCooldownReadyTick: finalCastSkill ? finalMonster.monster.cooldownReadyTickBySkillId?.[finalCastSkill.id] ?? null : null,
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
 * 读取本轮已经进入冷却的妖兽技能。
 */
function findCastMonsterSkill(monster) {
    if (!monster || !Array.isArray(monster.skills)) {
        return null;
    }
    const cooldowns = monster.cooldownReadyTickBySkillId ?? {};
    return monster.skills.find((entry) => typeof cooldowns?.[entry.id] === 'number' && cooldowns[entry.id] > 0) ?? null;
}
/**
 * 读取已经对玩家产生效果的妖兽技能。
 */
function findObservedMonsterSkill(monster, player) {
    const castSkill = findCastMonsterSkill(monster);
    if (castSkill) {
        return castSkill;
    }
    if (!monster || !Array.isArray(monster.skills) || !player) {
        return null;
    }
/**
 * 记录玩家Buff。
 */
    const playerBuffs = Array.isArray(player.buffs?.buffs)
        ? player.buffs.buffs
        : (Array.isArray(player.buffs) ? player.buffs : []);
    for (const skill of monster.skills) {
        const targetBuffIds = Array.isArray(skill.effects)
            ? skill.effects
                .filter((entry) => entry?.type === 'buff' && entry?.target === 'target' && typeof entry?.buffId === 'string')
                .map((entry) => entry.buffId)
            : [];
        if (targetBuffIds.length === 0) {
            continue;
        }
        if (playerBuffs.some((buff) => targetBuffIds.includes(buff?.buffId) && (!buff?.sourceSkillId || buff.sourceSkillId === skill.id))) {
            return skill;
        }
    }
    return null;
}
/**
 * 解析可用的妖兽实例，兼容 public 实例被旧 lease fencing 短暂卸载。
 */
async function resolveInitialMonsterContext(preferredInstanceId) {
    return waitForState(async () => {
        for (const candidate of buildMonsterInstanceCandidates(preferredInstanceId)) {
            try {
                const monsters = await fetchJson(`${SERVER_URL}/runtime/instances/${candidate}/monsters`);
                if (Array.isArray(monsters?.monsters)) {
                    return { instanceId: candidate, monsters };
                }
            }
            catch (error) {
                if (!isRecoverableMonsterLookupError(error)) {
                    throw error;
                }
            }
        }
        return null;
    }, 30000);
}
function buildMonsterInstanceCandidates(preferredInstanceId) {
    const raw = typeof preferredInstanceId === 'string' && preferredInstanceId.trim()
        ? preferredInstanceId.trim()
        : 'public:wildlands';
    const candidates = [raw];
    const match = raw.match(/^(public|real):(.+)$/);
    if (match) {
        const [, scope, templateId] = match;
        candidates.push(`${scope === 'public' ? 'real' : 'public'}:${templateId}`);
    }
    else {
        candidates.push(`public:${raw}`, `real:${raw}`);
    }
    return [...new Set(candidates)];
}
function resolveMonsterMapId(instanceIdValue) {
    const value = typeof instanceIdValue === 'string' ? instanceIdValue.trim() : '';
    if (!value) {
        return '';
    }
    return value.replace(/^(public|real):/, '');
}
function sameSmokeInstanceId(left, right) {
    return resolveMonsterMapId(left) === resolveMonsterMapId(right);
}
function isRecoverableMonsterLookupError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('request failed: 404')
        && message.includes('地图实例不存在');
}
/**
 * 选一个当前视线可达且在技能范围内的位置，避免烟测依赖固定偏移或障碍布局。
 */
async function resolveMonsterSkillAnchor(instanceIdValue, monster, skillRange) {
    const radius = Math.max(1, Math.trunc(Number(skillRange) || 1));
    for (let distance = 1; distance <= radius; distance += 1) {
        for (let dy = -distance; dy <= distance; dy += 1) {
            for (let dx = -distance; dx <= distance; dx += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) {
                    continue;
                }
                const x = monster.x + dx;
                const y = monster.y + dy;
                try {
                    const state = await fetchJson(`${SERVER_URL}/runtime/instances/${instanceIdValue}/tiles/${x}/${y}`);
                    if (state?.tile?.walkable === false || state?.tile?.blocksSight === true) {
                        continue;
                    }
                    return { x, y };
                }
                catch {
                    // out-of-bounds or unavailable tile, continue search
                }
            }
        }
    }
    return { x: monster.x, y: monster.y };
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

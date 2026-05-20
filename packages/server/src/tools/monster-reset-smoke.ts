// @ts-nocheck

/**
 * 用途：执行 monster-reset 链路的冒烟验证。
 */

const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const env_alias_1 = require("../config/env-alias");
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
let instanceId = process.env.SERVER_SMOKE_INSTANCE_ID ?? 'public:wildlands';
/**
 * 记录优先值怪物ID。
 */
const preferredMonsterId = process.env.SERVER_SMOKE_MONSTER_ID ?? 'm_dust_vulture';
/**
 * 记录damageamount。
 */
const damageAmount = Number.isFinite(Number(process.env.SERVER_SMOKE_DAMAGE))
    ? Math.max(1, Math.trunc(Number(process.env.SERVER_SMOKE_DAMAGE)))
    : 12;
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录initialmonsters。
 */
    const resolvedInitial = await resolveInitialMonsters(instanceId);
    instanceId = resolvedInitial.instanceId;
    const initialMonsters = resolvedInitial.monsters;
/**
 * 记录目标。
 */
    const target = initialMonsters.monsters.find((entry) => entry.alive
        && entry.monsterId === preferredMonsterId
        && entry.aggroTargetPlayerId === null) ?? initialMonsters.monsters.find((entry) => entry.alive && entry.aggroTargetPlayerId === null);
    if (!target) {
        throw new Error(`no idle monster found in ${instanceId}`);
    }
    await postJson(`/runtime/instances/${instanceId}/monsters/${target.runtimeId}/damage`, {
        amount: Math.min(damageAmount, Math.max(1, target.hp - 1)),
    });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchMonster(instanceId, target.runtimeId);
        return state.monster?.hp < target.hp;
    }, 5000);
/**
 * 记录damaged怪物。
 */
    const damagedMonster = await fetchMonster(instanceId, target.runtimeId);
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchMonster(instanceId, target.runtimeId);
/**
 * 记录怪物。
 */
        const monster = state.monster;
        return monster?.alive === true
            && monster.hp > damagedMonster.monster.hp
            && monster.aggroTargetPlayerId === null
            && isMonsterWithinWanderRange(monster);
    }, 15000);
/**
 * 记录final怪物。
 */
    const finalMonster = await fetchMonster(instanceId, target.runtimeId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_URL,
        instanceId,
        runtimeId: target.runtimeId,
        monsterId: target.monsterId,
        damageApplied: target.hp - damagedMonster.monster.hp,
        hpRecovered: finalMonster.monster.hp - damagedMonster.monster.hp,
        fullyRecovered: finalMonster.monster.hp === finalMonster.monster.maxHp,
        withinWanderRange: isMonsterWithinWanderRange(finalMonster.monster),
        finalMonster,
    }, null, 2));
}
function isMonsterWithinWanderRange(monster) {
    if (!monster) {
        return false;
    }
    const radius = Number.isFinite(Number(monster.wanderRadius))
        ? Math.max(0, Math.trunc(Number(monster.wanderRadius)))
        : 0;
    return Math.max(
        Math.abs(Math.trunc(Number(monster.x)) - Math.trunc(Number(monster.spawnX))),
        Math.abs(Math.trunc(Number(monster.y)) - Math.trunc(Number(monster.spawnY))),
    ) <= radius;
}
/**
 * 解析可用的妖兽实例，兼容 public 实例被旧 lease fencing 短暂卸载。
 */
async function resolveInitialMonsters(preferredInstanceId) {
    return waitForState(async () => {
        for (const candidate of buildMonsterInstanceCandidates(preferredInstanceId)) {
            try {
                const monsters = await fetchJson(`${SERVER_URL}/runtime/instances/${candidate}/monsters`);
                if (Array.isArray(monsters?.monsters)) {
                    return { instanceId: candidate, monsters };
                }
            }
            catch (error) {
                if (!isRecoverableInstanceLookupError(error)) {
                    throw error;
                }
            }
        }
        return null;
    }, 15000);
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
function isRecoverableInstanceLookupError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('request failed: 404')
        && message.includes('地图实例不存在');
}
/**
 * 处理fetch怪物。
 */
async function fetchMonster(instanceIdValue, runtimeId) {
    return fetchJson(`${SERVER_URL}/runtime/instances/${instanceIdValue}/monsters/${runtimeId}`);
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
 * 等待状态。
 */
async function waitForState(factory, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (true) {
        const value = await factory();
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
main();

"use strict";
/**
 * 用途：执行 monster-reset 链路的冒烟验证。
 */

const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const env_alias_1 = require("../config/env-alias");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
/**
 * 记录优先值怪物ID。
 */
const preferredMonsterId = process.env.SERVER_NEXT_SMOKE_MONSTER_ID ?? 'm_dust_vulture';
/**
 * 记录damageamount。
 */
const damageAmount = Number.isFinite(Number(process.env.SERVER_NEXT_SMOKE_DAMAGE))
    ? Math.max(1, Math.trunc(Number(process.env.SERVER_NEXT_SMOKE_DAMAGE)))
    : 12;
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
            && monster.x === monster.spawnX
            && monster.y === monster.spawnY;
    }, 15000);
/**
 * 记录final怪物。
 */
    const finalMonster = await fetchMonster(instanceId, target.runtimeId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        instanceId,
        runtimeId: target.runtimeId,
        monsterId: target.monsterId,
        damageApplied: target.hp - damagedMonster.monster.hp,
        hpRecovered: finalMonster.monster.hp - damagedMonster.monster.hp,
        fullyRecovered: finalMonster.monster.hp === finalMonster.monster.maxHp,
        finalMonster,
    }, null, 2));
}
/**
 * 处理fetch怪物。
 */
async function fetchMonster(instanceIdValue, runtimeId) {
    return fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceIdValue}/monsters/${runtimeId}`);
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
main();
//# sourceMappingURL=monster-reset-smoke.js.map

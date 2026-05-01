// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const shared_1 = require("@mud/shared");
const combat_resolution_helpers_1 = require("../runtime/combat/combat-resolution.helpers");

function createStats(patch = {}) {
    return {
        ...(0, shared_1.cloneNumericStats)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].stats),
        maxHp: 100,
        maxQi: 0,
        physAtk: 0,
        spellAtk: 0,
        physDef: 0,
        spellDef: 0,
        hit: 0,
        dodge: 0,
        crit: 0,
        antiCrit: 0,
        critDamage: 0,
        breakPower: 0,
        resolvePower: 0,
        elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
        elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
        ...patch,
    };
}

function createRatios() {
    return (0, shared_1.cloneNumericRatioDivisors)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].ratioDivisors);
}

function withRandom(value, fn) {
    const previous = Math.random;
    Math.random = () => value;
    try {
        return fn();
    }
    finally {
        Math.random = previous;
    }
}

function resolve(params) {
    return (0, combat_resolution_helpers_1.resolveCombatHit)({
        attackerStats: createStats(params.attackerStats),
        attackerRatios: createRatios(),
        attackerRealmLv: params.attackerRealmLv ?? 1,
        attackerCombatExp: params.attackerCombatExp ?? 0,
        targetStats: createStats(params.targetStats),
        targetRatios: createRatios(),
        targetRealmLv: params.targetRealmLv ?? 1,
        targetCombatExp: params.targetCombatExp ?? 0,
        baseDamage: params.baseDamage ?? 100,
        damageKind: params.damageKind ?? 'physical',
        damageMultiplier: params.damageMultiplier ?? 1,
    });
}

withRandom(0, () => {
    const dodged = resolve({
        attackerStats: { hit: 10, physAtk: 100 },
        targetStats: { dodge: 10 },
    });
    assert.equal(dodged.hit, false, '同等命中/闪避时应按 main 对抗率仍可能闪避');
    assert.equal(dodged.damage, 0);
});

withRandom(0.99, () => {
    const defended = resolve({
        attackerStats: { physAtk: 1000 },
        targetStats: { physDef: 100 },
        baseDamage: 100,
    });
    assert.equal(defended.damage, 67, '护甲减伤应使用 攻击*0.1+100 的动态分母');

    const realmSuppressed = resolve({
        attackerStats: { physAtk: 100 },
        targetStats: {},
        attackerRealmLv: 3,
        targetRealmLv: 1,
        baseDamage: 100,
    });
    assert.equal(realmSuppressed.damage, 144, '高境界打低境界应按 1.2^gap 放大');

    const combatExpScaled = resolve({
        attackerStats: { physAtk: 100 },
        targetStats: {},
        baseDamage: 100,
        damageMultiplier: 2,
    });
    assert.equal(combatExpScaled.damage, 200, '普攻战斗经验伤害乘区应作为独立最终乘区');
});

console.log(JSON.stringify({ ok: true, case: 'combat-formula-main-parity' }, null, 2));

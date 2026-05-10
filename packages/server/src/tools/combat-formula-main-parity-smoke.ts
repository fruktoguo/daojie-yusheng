// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const shared_1 = require("@mud/shared");
const { PlayerCombatService } = require("../runtime/combat/player-combat.service");
const combat_resolution_helpers_1 = require("../runtime/combat/combat-resolution.helpers");
const combat_pipeline_compose_1 = require("../runtime/combat/combat-pipeline-compose");
const { resolveMonsterCombatExpEquivalentFallback } = require("../runtime/combat/monster-combat-exp-equivalent.helper");

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
    combat_resolution_helpers_1.setCombatRngForTesting(() => value);
    try {
        return fn();
    }
    finally {
        Math.random = previous;
        combat_resolution_helpers_1.resetCombatRngForTesting();
    }
}

function resolve(params) {
    return (0, combat_pipeline_compose_1.resolveCombatDamage)({
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
        extraMultiplier: params.damageMultiplier ?? 1,
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

withRandom(0.99, () => {
    const service = new PlayerCombatService({});
    const fallbackCombatExp = resolveMonsterCombatExpEquivalentFallback(12);
    assert.equal(fallbackCombatExp, 32500, '怪物战斗经验兜底应按境界表 expToNext * 品阶系数，不应退回 level * 100');
    assert.equal(resolveMonsterCombatExpEquivalentFallback(25), 4547000, '玄阶怪物战斗经验系数应按凡阶 0.25 后每阶翻倍，玄阶为 1.0');
    assert.equal(resolveMonsterCombatExpEquivalentFallback({ level: 12, tier: 'variant' }), 65000, '异种怪物战斗经验应在普通等价值基础上乘 2');
    assert.equal(resolveMonsterCombatExpEquivalentFallback({ level: 12, tier: 'demon_king' }), 130000, '妖王怪物战斗经验应在普通等价值基础上乘 4');

    const attacker = {
        runtimeId: 'monster:combat-exp-fallback',
        monsterId: 'monster:fallback',
        level: 12,
        tier: 'variant',
        attrs: {
            numericStats: createStats({ physAtk: 100, hit: 100 }),
            ratioDivisors: createRatios(),
        },
        techniques: { techniques: [] },
        combat: { cooldownReadyTickBySkillId: {} },
    };
    const target = {
        playerId: 'player:combat-exp-fallback-target',
        hp: 1000,
        maxHp: 1000,
        qi: 0,
        maxQi: 0,
        realm: { realmLv: 12 },
        combatExp: 10000,
        attrs: {
            numericStats: createStats({ physDef: 0, dodge: 200, antiCrit: 0, resolvePower: 0 }),
            ratioDivisors: createRatios(),
        },
        buffs: { buffs: [] },
        techniques: { techniques: [] },
        combat: { cooldownReadyTickBySkillId: {} },
    };
    const result = service.executeResolvedSkillCast(attacker, target, {
        skill: {
            id: 'monster:fallback:skill',
            name: '兜底测试',
            cost: { qi: 0 },
            cooldown: 1,
            range: 1,
            effects: [{ type: 'damage', formula: { var: 'caster.stat.physAtk' }, target: 'enemy', damageKind: 'physical' }],
        },
        level: 1,
        readyTick: 0,
    }, 1, 1, { setCooldownReadyTick: () => undefined }, { skipResourceAndCooldown: true });
    assert.equal(result.damageRolls?.[0]?.dodged, false, '底层战斗服务缺省 combatExp 时应使用 main 口径怪物等价值参与命中对抗');
});

console.log(JSON.stringify({ ok: true, case: 'combat-formula-main-parity' }, null, 2));

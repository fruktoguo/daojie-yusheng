import assert from 'node:assert/strict';
import {
    DEFAULT_PLAYER_REALM_STAGE,
    PLAYER_REALM_NUMERIC_TEMPLATES,
    applyCombatAttackIntensityQiCost,
    cloneNumericRatioDivisors,
    cloneNumericStats,
    type NumericRatioDivisors,
    type NumericStats,
} from '@mud/shared';
import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import { resetCombatRngForTesting, setCombatRngForTesting } from '../runtime/combat/combat-resolution.helpers';
import { resolveCombatDamage } from '../runtime/combat/combat-pipeline-compose';
import { resolveMonsterCombatExpEquivalentFallback } from '../runtime/combat/monster-combat-exp-equivalent.helper';

function createStats(patch: Partial<NumericStats> = {}): NumericStats {
    return {
        ...cloneNumericStats(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].stats),
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

function createRatios(): NumericRatioDivisors {
    return cloneNumericRatioDivisors(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].ratioDivisors);
}

function withRandom<T>(value: number, fn: () => T): T {
    const previous = Math.random;
    Math.random = () => value;
    setCombatRngForTesting(() => value);
    try {
        return fn();
    }
    finally {
        Math.random = previous;
        resetCombatRngForTesting();
    }
}

interface ResolveParams {
    attackerStats?: Partial<NumericStats>;
    targetStats?: Partial<NumericStats>;
    attackerRealmLv?: number;
    targetRealmLv?: number;
    attackerCombatExp?: number;
    targetCombatExp?: number;
    baseDamage?: number;
    damageKind?: 'physical' | 'spell';
    damageMultiplier?: number;
}

function resolve(params: ResolveParams) {
    return resolveCombatDamage({
        attackerStats: createStats(params.attackerStats) as unknown as Record<string, unknown>,
        attackerRatios: createRatios() as unknown as Record<string, unknown>,
        attackerRealmLv: params.attackerRealmLv ?? 1,
        attackerCombatExp: params.attackerCombatExp ?? 0,
        targetStats: createStats(params.targetStats) as unknown as Record<string, unknown>,
        targetRatios: createRatios() as unknown as Record<string, unknown>,
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
    assert.equal(defended.damage, 91, '护甲减伤应使用 防御*1.11^被攻击者等级 与 攻击+100 的动态分母');

    const defendedByRealm = resolve({
        attackerStats: { physAtk: 1000 },
        targetStats: { physDef: 100 },
        attackerRealmLv: 12,
        targetRealmLv: 12,
        baseDamage: 100,
    });
    assert.equal(defendedByRealm.damage, 76, '被攻击者等级应按 1.11^等级 放大护甲后参与减伤');

    const spellDefendedByRealm = resolve({
        attackerStats: { spellAtk: 900 },
        targetStats: { spellDef: 100 },
        attackerRealmLv: 10,
        targetRealmLv: 10,
        baseDamage: 100,
        damageKind: 'spell',
    });
    assert.equal(spellDefendedByRealm.damage, 78, '魔抗减伤应与护甲使用同一套等级放大公式');

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

withRandom(0, () => {
    const critical = resolve({
        attackerStats: { physAtk: 100, crit: 100000, critDamage: 0 },
        targetStats: { antiCrit: 0 },
        baseDamage: 100,
    });
    assert.equal(critical.crit, true, 'critDamage=0 should still allow critical resolution');
    assert.equal(critical.damage, 200, 'critDamage=0 should mean the base critical multiplier is exactly 200%');
});

withRandom(0.99, () => {
    const service = new PlayerCombatService({});
    const makeCombatant = (combatAttackIntensity: number) => ({
        playerId: `player:intensity:${combatAttackIntensity}`,
        hp: 1000,
        maxHp: 1000,
        qi: 1000,
        maxQi: 1000,
        combatAttackIntensity,
        realm: { realmLv: 1 },
        combatExp: 0,
        attrs: {
            numericStats: createStats({ maxQiOutputPerTick: 100 }),
            ratioDivisors: createRatios(),
        },
        buffs: { buffs: [] },
        techniques: { techniques: [] },
        combat: { cooldownReadyTickBySkillId: {}, combatAttackIntensity },
    });
    const skill = {
        id: 'skill:intensity:test',
        name: '力度测试',
        cost: 10,
        cooldown: 1,
        range: 1,
        effects: [{ type: 'damage', formula: 100, target: 'enemy', damageKind: 'physical' }],
    };
    let spentQi = 0;
    const low = service.executeResolvedSkillCast(makeCombatant(1), makeCombatant(10), { skill, level: 1, readyTick: 0 }, 1, 1, {
        spendQi: (amount: number) => { spentQi += amount; },
        setCooldownReadyTick: () => undefined,
    });
    assert.equal(low.totalDamage, 10, '1 成应造成 10% 技能伤害');
    assert.equal(low.qiCost, 5, '1 成应在标准实际消耗后降低 50%');
    assert.equal(spentQi, 5, '1 成实际扣费应使用修正后的灵力消耗');

    spentQi = 0;
    const over = service.executeResolvedSkillCast(makeCombatant(12), makeCombatant(10), { skill, level: 1, readyTick: 0 }, 1, 1, {
        spendQi: (amount: number) => { spentQi += amount; },
        setCooldownReadyTick: () => undefined,
    });
    assert.equal(over.totalDamage, 120, '12 成应造成 120% 技能伤害');
    assert.equal(over.qiCost, 20, '12 成应在标准实际消耗后翻倍');
    assert.equal(applyCombatAttackIntensityQiCost(10, 7), 10, '7 成灵力消耗应保持标准公式');
});

withRandom(0.99, () => {
    const service = new PlayerCombatService({});
    const fallbackCombatExp = resolveMonsterCombatExpEquivalentFallback(12);
    assert.equal(fallbackCombatExp, 32500, '怪物战斗经验兜底应按境界表 expToNext * 品阶系数，不应退回 level * 100');
    assert.equal(resolveMonsterCombatExpEquivalentFallback(25), 4500000, '玄阶怪物战斗经验系数应按凡阶 0.25 后每阶翻倍，玄阶为 1.0');
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

import { COMBAT_EXPERIENCE_ADVANTAGE_BASELINE, COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD, DEFAULT_RATIO_DIVISOR, getRealmGapDamageMultiplier, percentModifierToMultiplier, ratioValue } from '@mud/shared';
import { randomInt } from 'node:crypto';

type CombatNumericStats = Record<string, any>;
type CombatRatioDivisors = Record<string, any>;

interface ResolveCombatHitParams {
    attackerStats: CombatNumericStats;
    attackerRatios?: CombatRatioDivisors;
    attackerRealmLv?: number;
    attackerCombatExp?: number;
    targetStats: CombatNumericStats;
    targetRatios: CombatRatioDivisors;
    targetRealmLv?: number;
    targetCombatExp?: number;
    baseDamage: number;
    damageKind: 'physical' | 'spell';
    element?: string;
    damageMultiplier?: number;
}

type CombatActionInput = Record<string, any>;
type CombatRng = (() => number) | null;

const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
const DEFENSE_REDUCTION_BASELINE = 100;

// 战斗随机源：生产默认走 crypto，smoke 可临时注入确定性 rng 做回归。
// 注意：测试挂载后必须在 finally 里还原，否则污染后续战斗随机性。
let combatRngOverride: CombatRng = null;

function cryptoRandom() {
    if (typeof combatRngOverride === 'function') {
        const value = Number(combatRngOverride());
        if (Number.isFinite(value)) {
            return Math.min(1, Math.max(0, value));
        }
    }
    return randomInt(0, 2147483647) / 2147483647;
}

export const __combatPipelineRandom = cryptoRandom;

export function setCombatRngForTesting(rng: CombatRng) {
    combatRngOverride = typeof rng === 'function' ? rng : null;
}

export function resetCombatRngForTesting() {
    combatRngOverride = null;
}

export function resolveCombatHit(params: ResolveCombatHitParams) {
    const attackerStats = params.attackerStats;
    const targetStats = params.targetStats;
    const targetRatios = params.targetRatios;
    const baseDamage = Math.max(1, Math.round(params.baseDamage));
    const damageKind = params.damageKind;
    const element = params.element;

    const breakWins = attackerStats.breakPower > targetStats.resolvePower;
    const resolveWins = targetStats.resolvePower > attackerStats.breakPower;
    const breakChance = breakWins
        ? resolveOpposedCombatRate(attackerStats.breakPower, targetStats.resolvePower)
        : 0;
    const broken = breakChance > 0 && cryptoRandom() < breakChance;

    const combatAdvantage = resolveCombatExperienceAdvantage(params.attackerCombatExp, params.targetCombatExp);
    const hitStat = attackerStats.hit * (broken ? 2 : 1) * (1 + combatAdvantage.attackerBonus);
    const defenderDodge = targetStats.dodge * (1 + combatAdvantage.defenderBonus);
    const dodgeChance = resolveOpposedCombatRate(defenderDodge, hitStat);
    const dodged = dodgeChance > 0 && cryptoRandom() < dodgeChance;
    if (dodged) {
        return {
            hit: false,
            rawDamage: 0,
            damage: 0,
            crit: false,
            dodged: true,
            resolved: false,
            broken,
        };
    }

    const resolveChance = resolveWins
        ? resolveOpposedCombatRate(targetStats.resolvePower, attackerStats.breakPower)
        : 0;
    const resolved = resolveChance > 0 && cryptoRandom() < resolveChance;
    const critStat = attackerStats.crit * (broken ? 2 : 1);
    const critChance = resolveOpposedCombatRate(critStat, targetStats.antiCrit);
    const crit = critChance > 0 && cryptoRandom() < critChance;

    let damage = baseDamage;
    if (element) {
        damage = Math.max(1, Math.round(damage * percentModifierToMultiplier(attackerStats.elementDamageBonus[element])));
    }

    let defense = damageKind === 'physical' ? targetStats.physDef : targetStats.spellDef;
    if (resolved) {
        defense *= 2;
    }
    let rawDamage = damage;
    const defenseAttackBasis = damageKind === 'physical' ? attackerStats.physAtk : attackerStats.spellAtk;
    let reduction = resolveDefenseReductionRate(defense, defenseAttackBasis);
    if (element) {
        const elementReduce = Math.max(
            0,
            ratioValue(targetStats.elementDamageReduce[element], targetRatios.elementDamageReduce[element]),
        );
        reduction = 1 - (1 - reduction) * (1 - elementReduce);
    }
    damage = Math.max(1, Math.round(damage * Math.max(0, 1 - reduction)));

    if (crit) {
        const critMultiplier = (200 + Math.max(0, attackerStats.critDamage) / 10) / 100;
        rawDamage = Math.max(1, Math.round(rawDamage * critMultiplier));
        damage = Math.max(1, Math.round(damage * critMultiplier));
    }

    const realmGapMultiplier = getRealmGapDamageMultiplier(
        Math.max(1, Math.floor(Number(params.attackerRealmLv) || 1)),
        Math.max(1, Math.floor(Number(params.targetRealmLv) || 1)),
    );
    const damageMultiplier = Math.max(0, Number.isFinite(params.damageMultiplier) ? params.damageMultiplier : 1);
    rawDamage = Math.max(1, Math.round(rawDamage * realmGapMultiplier));
    damage = Math.max(1, Math.round(damage * realmGapMultiplier));
    rawDamage = Math.max(1, Math.round(rawDamage * damageMultiplier));
    damage = Math.max(1, Math.round(damage * damageMultiplier));

    return {
        hit: true,
        rawDamage,
        damage,
        crit,
        dodged: false,
        resolved,
        broken,
    };
}

export function resolveCombatHitForAction(input: CombatActionInput = {}) {
    const actor = input.actor ?? input.attacker ?? {};
    const target = input.target ?? input.defender ?? {};
    return resolveCombatHit({
        attackerStats: input.attackerStats ?? actor.numericStats ?? actor.attrs?.numericStats,
        attackerRatios: input.attackerRatios ?? actor.ratioDivisors ?? actor.attrs?.ratioDivisors,
        attackerRealmLv: input.attackerRealmLv ?? actor.realmLv ?? actor.realm?.realmLv ?? actor.level ?? 1,
        attackerCombatExp: input.attackerCombatExp ?? actor.combatExp ?? 0,
        targetStats: input.targetStats ?? target.numericStats ?? target.attrs?.numericStats,
        targetRatios: input.targetRatios ?? target.ratioDivisors ?? target.attrs?.ratioDivisors,
        targetRealmLv: input.targetRealmLv ?? target.realmLv ?? target.realm?.realmLv ?? target.level ?? 1,
        targetCombatExp: input.targetCombatExp ?? target.combatExp ?? 0,
        baseDamage: input.baseDamage,
        damageKind: input.damageKind,
        element: input.element,
        damageMultiplier: input.damageMultiplier,
    });
}

export function resolveCombatExperienceAdvantage(attackerExp: number, defenderExp: number) {
    return {
        attackerBonus: resolveCombatExperienceBonus(attackerExp, defenderExp),
        defenderBonus: resolveCombatExperienceBonus(defenderExp, attackerExp),
    };
}

export function resolveCombatExperienceBonus(currentExp: number, oppositeExp: number) {
    const baseline = COMBAT_EXPERIENCE_ADVANTAGE_BASELINE;
    const normalizedCurrent = Math.max(0, Math.floor(Number(currentExp) || 0)) + baseline;
    const normalizedOpposite = Math.max(0, Math.floor(Number(oppositeExp) || 0)) + baseline;
    if (normalizedCurrent <= normalizedOpposite) {
        return 0;
    }
    const ratio = normalizedCurrent / normalizedOpposite;
    const threshold = Math.max(2, COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD);
    return Math.min(1, Math.max(0, (ratio - 1) / (threshold - 1)));
}

export function resolveOpposedCombatRate(value: number, opposingValue: number) {
    const normalizedValue = Math.max(0, Number(value) || 0);
    if (normalizedValue <= 0) {
        return 0;
    }
    return Math.max(
        0,
        ratioValue(
            normalizedValue,
            Math.max(1, Math.max(0, Number(opposingValue) || 0) + DEFAULT_RATIO_DIVISOR),
        ),
    );
}

export function resolveDefenseReductionRate(defense: number, attackBasis: number) {
    const normalizedDefense = Math.max(0, Number(defense) || 0);
    if (normalizedDefense <= 0) {
        return 0;
    }
    const normalizedAttackBasis = Math.max(0, Number(attackBasis) || 0);
    const reductionBasis = Math.max(1, normalizedAttackBasis * DEFENSE_REDUCTION_ATTACK_RATIO + DEFENSE_REDUCTION_BASELINE);
    return Math.max(0, ratioValue(normalizedDefense, reductionBasis));
}

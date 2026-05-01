// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCombatHit = resolveCombatHit;
exports.resolveCombatExperienceAdvantage = resolveCombatExperienceAdvantage;
exports.resolveCombatExperienceBonus = resolveCombatExperienceBonus;
exports.resolveDefenseReductionRate = resolveDefenseReductionRate;
exports.resolveOpposedCombatRate = resolveOpposedCombatRate;

const shared_1 = require("@mud/shared");

const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
const DEFENSE_REDUCTION_BASELINE = 100;

function resolveCombatHit(params) {
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
    const broken = breakChance > 0 && Math.random() < breakChance;

    const combatAdvantage = resolveCombatExperienceAdvantage(params.attackerCombatExp, params.targetCombatExp);
    const hitStat = attackerStats.hit * (broken ? 2 : 1) * (1 + combatAdvantage.attackerBonus);
    const defenderDodge = targetStats.dodge * (1 + combatAdvantage.defenderBonus);
    const dodgeChance = resolveOpposedCombatRate(defenderDodge, hitStat);
    const dodged = dodgeChance > 0 && Math.random() < dodgeChance;
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
    const resolved = resolveChance > 0 && Math.random() < resolveChance;
    const critStat = attackerStats.crit * (broken ? 2 : 1);
    const critChance = resolveOpposedCombatRate(critStat, targetStats.antiCrit);
    const crit = critChance > 0 && Math.random() < critChance;

    let damage = baseDamage;
    if (element) {
        damage = Math.max(1, Math.round(damage * (0, shared_1.percentModifierToMultiplier)(attackerStats.elementDamageBonus[element])));
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
            (0, shared_1.ratioValue)(targetStats.elementDamageReduce[element], targetRatios.elementDamageReduce[element]),
        );
        reduction = 1 - (1 - reduction) * (1 - elementReduce);
    }
    damage = Math.max(1, Math.round(damage * (1 - Math.min(0.95, reduction))));

    if (crit) {
        const critMultiplier = (200 + Math.max(0, attackerStats.critDamage) / 10) / 100;
        rawDamage = Math.max(1, Math.round(rawDamage * critMultiplier));
        damage = Math.max(1, Math.round(damage * critMultiplier));
    }

    const realmGapMultiplier = (0, shared_1.getRealmGapDamageMultiplier)(
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

function resolveCombatExperienceAdvantage(attackerExp, defenderExp) {
    return {
        attackerBonus: resolveCombatExperienceBonus(attackerExp, defenderExp),
        defenderBonus: resolveCombatExperienceBonus(defenderExp, attackerExp),
    };
}

function resolveCombatExperienceBonus(currentExp, oppositeExp) {
    const baseline = shared_1.COMBAT_EXPERIENCE_ADVANTAGE_BASELINE;
    const normalizedCurrent = Math.max(0, Math.floor(Number(currentExp) || 0)) + baseline;
    const normalizedOpposite = Math.max(0, Math.floor(Number(oppositeExp) || 0)) + baseline;
    if (normalizedCurrent <= normalizedOpposite) {
        return 0;
    }
    const ratio = normalizedCurrent / normalizedOpposite;
    const threshold = Math.max(2, shared_1.COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD);
    return Math.min(1, Math.max(0, (ratio - 1) / (threshold - 1)));
}

function resolveOpposedCombatRate(value, opposingValue) {
    const normalizedValue = Math.max(0, Number(value) || 0);
    if (normalizedValue <= 0) {
        return 0;
    }
    return Math.max(
        0,
        (0, shared_1.ratioValue)(
            normalizedValue,
            Math.max(1, Math.max(0, Number(opposingValue) || 0) + shared_1.DEFAULT_RATIO_DIVISOR),
        ),
    );
}

function resolveDefenseReductionRate(defense, attackBasis) {
    const normalizedDefense = Math.max(0, Number(defense) || 0);
    if (normalizedDefense <= 0) {
        return 0;
    }
    const normalizedAttackBasis = Math.max(0, Number(attackBasis) || 0);
    const reductionBasis = Math.max(1, normalizedAttackBasis * DEFENSE_REDUCTION_ATTACK_RATIO + DEFENSE_REDUCTION_BASELINE);
    return Math.max(0, (0, shared_1.ratioValue)(normalizedDefense, reductionBasis));
}

export {
    resolveCombatHit,
    resolveCombatExperienceAdvantage,
    resolveCombatExperienceBonus,
    resolveDefenseReductionRate,
    resolveOpposedCombatRate,
};

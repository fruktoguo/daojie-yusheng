/**
 * 战斗结算核心数学工具：命中判定、伤害计算、随机源管理。
 *
 * 职责：
 * - 提供完整的单次攻击结算函数 resolveCombatHit（旧接口，兼容直接调用）
 * - 提供对抗率计算（命中 vs 闪避、破防 vs 化解、暴击 vs 抗暴）
 * - 提供防御减伤率计算
 * - 提供战斗经验优势加成计算
 * - 管理战斗随机源（生产用 crypto，smoke 可注入确定性 rng）
 *
 * 注意：
 * - 测试挂载 rng 后必须在 finally 里还原，否则污染后续战斗随机性
 * - combat-pipeline.ts 中的环节函数也依赖本文件的 cryptoRandom 和对抗率函数
 */

import { COMBAT_EXPERIENCE_ADVANTAGE_BASELINE, COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD, DEFAULT_RATIO_DIVISOR, getRealmGapDamageMultiplier, percentModifierToMultiplier, ratioValue } from '@mud/shared';
import { randomInt } from 'node:crypto';

type CombatNumericStats = Record<string, any>;
type CombatRatioDivisors = Record<string, any>;

/** resolveCombatHit 的输入参数。 */
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
    /** 跳过战斗机制（破招/命中/暴击/境界压制），用于地块等非生物目标。 */
    skipCombatMechanics?: boolean;
}

type CombatActionInput = Record<string, any>;
type CombatRng = (() => number) | null;

/** 防御减伤公式中攻击力占比系数。 */
const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
/** 防御减伤公式中基础值。 */
const DEFENSE_REDUCTION_BASELINE = 100;

// ─── 随机源管理 ───
// 生产默认走 crypto，smoke 可临时注入确定性 rng 做回归。
let combatRngOverride: CombatRng = null;

/**
 * 战斗随机数生成器。
 * 优先使用注入的 override（测试用），否则使用 crypto 安全随机。
 * 返回 [0, 1) 范围的浮点数。
 */
function cryptoRandom() {
    if (typeof combatRngOverride === 'function') {
        const value = Number(combatRngOverride());
        if (Number.isFinite(value)) {
            return Math.min(1, Math.max(0, value));
        }
    }
    return randomInt(0, 2147483647) / 2147483647;
}

/** 导出供 combat-pipeline 环节使用的随机源引用。 */
export const __combatPipelineRandom = cryptoRandom;

/** 注入确定性随机源（仅用于 smoke 测试）。 */
export function setCombatRngForTesting(rng: CombatRng) {
    combatRngOverride = typeof rng === 'function' ? rng : null;
}

/** 还原为默认 crypto 随机源。 */
export function resetCombatRngForTesting() {
    combatRngOverride = null;
}

/**
 * 完整单次攻击结算（旧接口）。
 * 包含破防、闪避、化解、暴击、五行加成、防御减伤、暴击乘区、境界差乘区。
 * 返回 hit/damage/rawDamage/crit/dodged/resolved/broken。
 *
 * 注意：新代码推荐使用 combat-pipeline 的环节组合方式，本函数保留兼容。
 */
export function resolveCombatHit(params: ResolveCombatHitParams) {
    const attackerStats = params.attackerStats;
    const targetStats = params.targetStats;
    const targetRatios = params.targetRatios;
    const baseDamage = Math.max(1, Math.round(params.baseDamage));
    const damageKind = params.damageKind;
    const element = params.element;

    // 破防判定
    const breakWins = attackerStats.breakPower > targetStats.resolvePower;
    const resolveWins = targetStats.resolvePower > attackerStats.breakPower;
    const breakChance = breakWins
        ? resolveOpposedCombatRate(attackerStats.breakPower, targetStats.resolvePower)
        : 0;
    const broken = breakChance > 0 && cryptoRandom() < breakChance;

    // 命中/闪避判定（含战斗经验优势）
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

    // 化解判定
    const resolveChance = resolveWins
        ? resolveOpposedCombatRate(targetStats.resolvePower, attackerStats.breakPower)
        : 0;
    const resolved = resolveChance > 0 && cryptoRandom() < resolveChance;

    // 暴击判定
    const critStat = attackerStats.crit * (broken ? 2 : 1);
    const critChance = resolveOpposedCombatRate(critStat, targetStats.antiCrit);
    const crit = critChance > 0 && cryptoRandom() < critChance;

    // 五行伤害加成
    let damage = baseDamage;
    if (element) {
        damage = Math.max(1, Math.round(damage * percentModifierToMultiplier(attackerStats.elementDamageBonus[element])));
    }

    // 防御减伤 + 元素减免
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

    // 暴击乘区
    if (crit) {
        const critMultiplier = (200 + Math.max(0, attackerStats.critDamage) / 10) / 100;
        rawDamage = Math.max(1, Math.round(rawDamage * critMultiplier));
        damage = Math.max(1, Math.round(damage * critMultiplier));
    }

    // 境界差乘区 + 外部乘区
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

/**
 * 从 combat action 输入中提取参数并调用 resolveCombatHit。
 * 兼容多种输入格式（actor/attacker、target/defender、嵌套 attrs 等）。
 */
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

/**
 * 计算双方战斗经验优势加成。
 * 经验高的一方获得 0~1 的加成系数，用于命中/闪避判定。
 */
export function resolveCombatExperienceAdvantage(attackerExp: number, defenderExp: number) {
    return {
        attackerBonus: resolveCombatExperienceBonus(attackerExp, defenderExp),
        defenderBonus: resolveCombatExperienceBonus(defenderExp, attackerExp),
    };
}

/**
 * 计算单方战斗经验加成。
 * 公式：(己方经验+基线) / (对方经验+基线) 的比值映射到 [0, 1]。
 * 低于对方时返回 0，超过阈值时返回 1。
 */
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

/**
 * 对抗率计算：value / (opposingValue + DEFAULT_RATIO_DIVISOR)。
 * 用于命中 vs 闪避、破防 vs 化解、暴击 vs 抗暴等对抗判定。
 * 返回 [0, 1) 范围的概率值。
 */
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

/**
 * 防御减伤率计算。
 * 公式：defense / (attackBasis * DEFENSE_REDUCTION_ATTACK_RATIO + DEFENSE_REDUCTION_BASELINE)。
 * 攻击力越高，防御的有效减伤率越低（穿透效果）。
 */
export function resolveDefenseReductionRate(defense: number, attackBasis: number) {
    const normalizedDefense = Math.max(0, Number(defense) || 0);
    if (normalizedDefense <= 0) {
        return 0;
    }
    const normalizedAttackBasis = Math.max(0, Number(attackBasis) || 0);
    const reductionBasis = Math.max(1, normalizedAttackBasis * DEFENSE_REDUCTION_ATTACK_RATIO + DEFENSE_REDUCTION_BASELINE);
    return Math.max(0, ratioValue(normalizedDefense, reductionBasis));
}

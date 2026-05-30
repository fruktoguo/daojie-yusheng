/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { COMBAT_EXPERIENCE_ADVANTAGE_BASELINE, COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD, DEFAULT_RATIO_DIVISOR, ratioValue } from '@mud/shared';
import { randomFillSync } from 'node:crypto';

type CombatRng = (() => number) | null;

/** 防御减伤公式中攻击力占比系数。 */
const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
/** 防御减伤公式中基础值。 */
const DEFENSE_REDUCTION_BASELINE = 100;
const COMBAT_RANDOM_POOL_SIZE = 4096;
const COMBAT_RANDOM_UINT32_SCALE = 0x100000000;

// ─── 随机源管理 ───

let combatRngOverride: CombatRng = null;
let combatRandomPool = new Uint32Array(0);
let combatRandomPoolIndex = 0;

function nextCryptoRandomUnit() {
    if (combatRandomPoolIndex >= combatRandomPool.length) {
        combatRandomPool = randomFillSync(new Uint32Array(COMBAT_RANDOM_POOL_SIZE));
        combatRandomPoolIndex = 0;
    }
    const value = combatRandomPool[combatRandomPoolIndex] ?? 0;
    combatRandomPoolIndex += 1;
    return value / COMBAT_RANDOM_UINT32_SCALE;
}

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
    return nextCryptoRandomUnit();
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

// ─── 对抗率与减伤计算 ───

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

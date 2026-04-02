/**
 * 通用气机系统常量。
 */

/**
 * 气机家族键集合。
 *
 * 说明：
 * - `aura`：灵气。
 * - `demonic`：魔气。
 * - `sha`：煞气。
 */
export const QI_FAMILY_KEYS = ['aura', 'demonic', 'sha'] as const;

/**
 * 气机形态键集合。
 *
 * 说明：
 * - `refined`：凝练气机，通常对应地脉、福地、阵法等长期稳定来源。
 * - `dispersed`：逸散气机，通常对应技能外泄、战斗残留等短时来源。
 */
export const QI_FORM_KEYS = ['refined', 'dispersed'] as const;

/**
 * 气机属性键集合。
 *
 * 说明：
 * - `neutral`：无属性气机。
 * - 其余五项对应五行属性气机。
 */
export const QI_ELEMENT_KEYS = ['neutral', 'metal', 'wood', 'water', 'fire', 'earth'] as const;

/**
 * 气机可见性层级集合。
 *
 * 说明：
 * - `hidden`：完全不可见，也不参与吸收。
 * - `observable`：可见但不可吸收。
 * - `absorbable`：可见且可吸收，会参与有效总值与等级计算。
 */
export const QI_VISIBILITY_LEVELS = ['hidden', 'observable', 'absorbable'] as const;

/**
 * 气机系数固定点基数。
 *
 * 说明：
 * - 采用整数基点表达效率、倍率与投影系数。
 * - `10000 = 1.0`，`8000 = 0.8`，`12000 = 1.2`。
 */
export const QI_PROJECTION_BP_SCALE = 10_000;

/**
 * 默认气机效率系数。
 *
 * 说明：
 * - 表示不加成也不减成的标准效率。
 */
export const DEFAULT_QI_EFFICIENCY_BP = QI_PROJECTION_BP_SCALE;

/**
 * 气机半衰期固定点速率的统一精度基数。
 *
 * 说明：
 * - 所有气机运行时衰减都使用同一套固定点精度，便于持久化与统一计算。
 * - 数值越大，半衰期离散近似越精细，但余数整数规模也越大。
 */
export const QI_HALF_LIFE_RATE_SCALE = 1_000_000_000;

/**
 * 将“半衰期息数”换算为每息收敛速率的固定点值。
 *
 * 说明：
 * - 公式为 `1 - 0.5^(1 / halfLifeTicks)`。
 * - 返回值至少为 `1`，避免极端配置下出现完全不流转的资源。
 */
export function buildQiHalfLifeRateScaled(halfLifeTicks: number): number {
  const normalizedTicks = Number.isFinite(halfLifeTicks) && halfLifeTicks > 0
    ? Math.max(1, Math.round(halfLifeTicks))
    : 1;
  return Math.max(
    1,
    Math.round((1 - Math.pow(0.5, 1 / normalizedTicks)) * QI_HALF_LIFE_RATE_SCALE),
  );
}

/**
 * 逸散灵气的半衰期时长，单位为息。
 *
 * 说明：
 * - 逸散灵气属于短时残留气机，应比凝练灵气明显衰减更快。
 */
export const DISPERSED_AURA_HALF_LIFE_TICKS = 100;

/**
 * 逸散灵气每息向零收敛的固定点速率。
 *
 * 说明：
 * - 由 `DISPERSED_AURA_HALF_LIFE_TICKS` 自动换算得到。
 */
export const DISPERSED_AURA_HALF_LIFE_RATE_SCALED = buildQiHalfLifeRateScaled(DISPERSED_AURA_HALF_LIFE_TICKS);

/**
 * 逸散灵气每息的最低衰减值。
 *
 * 说明：
 * - 即使半衰期折算结果不足 1，也至少每息减少 1 点。
 */
export const DISPERSED_AURA_MIN_DECAY_PER_TICK = 1;

/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** 将成功率输入压到 `[0, 1]` 区间。 */
export function clampUnitSuccessRate(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

/** 技艺等级低于目标等级时，每差 1 级施加的通用成功率修正。 */
export const CRAFT_SUCCESS_LOWER_LEVEL_MODIFIER_PER_LEVEL = Math.log(0.9);

/** 技艺等级高于目标等级时，每高 1 级施加的通用成功率修正。 */
export const CRAFT_SUCCESS_HIGHER_LEVEL_MODIFIER_PER_LEVEL = Math.log(1 / 0.98);

/** 幸运每点提供的炼丹、炼器、强化成功率修正量。 */
export const CRAFT_SUCCESS_RATE_BONUS_PER_LUCK = 0.01;

/** 根据幸运值计算成功率修正量。 */
export function computeLuckSuccessRateBonus(luck: number | undefined): number {
  const normalizedLuck = Math.max(0, Math.floor(Number(luck) || 0));
  return normalizedLuck * CRAFT_SUCCESS_RATE_BONUS_PER_LUCK;
}

/**
 * 在赔率空间应用成功率修正。
 *
 * 说明：
 * - 正修正不会把基础成功率推过 `maxRate`（默认 `maxRate = 1`）。
 * - 负修正不会把基础成功率压到 `0` 以下。
 * - 把 rate/maxRate 看作 [0, 1] 上的归一化概率，做赔率变换后再缩回 [0, maxRate]，
 *   等价于赔率 = rate / (maxRate − rate)，乘 e^modifier。
 */
export function applyAsymptoticSuccessModifier(
  rate: number | undefined,
  modifier: number | undefined,
  maxRate: number = 1,
): number {
  const cap = clampUnitSuccessRate(maxRate);
  if (cap <= 0) {
    return 0;
  }
  const normalizedRate = Math.min(clampUnitSuccessRate(rate), cap);
  if (normalizedRate <= 0) {
    return 0;
  }
  if (normalizedRate >= cap) {
    return cap;
  }

  const normalizedModifier = Number.isFinite(modifier) ? Number(modifier) : 0;
  if (normalizedModifier === 0) {
    return normalizedRate;
  }

  if (normalizedModifier > 0) {
    const inverseGrowth = Math.exp(-normalizedModifier);
    return (normalizedRate * cap) / (normalizedRate + ((cap - normalizedRate) * inverseGrowth));
  }

  const growth = Math.exp(normalizedModifier);
  return (normalizedRate * growth * cap) / ((cap - normalizedRate) + (normalizedRate * growth));
}

/**
 * 在赔率域用"严格分段乘除"做成功率修正。
 *
 * 语义：
 * - `factor` 是赔率乘子，`factor = 1` 不变，`> 1` 增益，`< 1` 削弱。
 * - 上限 `maxRate`：成功率永远不会越过 `maxRate`。
 * - 中点 `mid = maxRate / 2`：
 *   - 弱段（`rate ≤ mid`）：`rate × factor`，直接乘；如果乘出来仍 ≤ mid 就照实乘。
 *   - 越过中点：把 factor 拆成"乘到 mid 用掉的份额"和"剩余进入除段的份额"，
 *     等价于赔率域的连续乘子，但在弱段保持线性可读。
 *   - 强段（`rate > mid`）：失败率被 `factor` 除。
 * - `factor < 1`（削弱）：用对偶——把失败率当作 rate 走 1/factor 的增益分支再翻回，
 *   保证削弱与增益完全对称且不会让 rate 跌破 0。
 */
export function applyMultiplicativeSuccessModifier(
  rate: number | undefined,
  factor: number | undefined,
  maxRate: number = 1,
): number {
  const cap = clampUnitSuccessRate(maxRate);
  if (cap <= 0) {
    return 0;
  }
  const normalizedRate = Math.min(clampUnitSuccessRate(rate), cap);
  if (normalizedRate <= 0) {
    return 0;
  }
  if (normalizedRate >= cap) {
    return cap;
  }
  const normalizedFactor = Number.isFinite(factor) ? Math.max(0, Number(factor)) : 1;
  if (normalizedFactor === 1) {
    return normalizedRate;
  }
  if (normalizedFactor === 0) {
    return 0;
  }

  if (normalizedFactor < 1) {
    // 对偶：削弱 ⇄ 失败率被 1/factor 增益。
    const fail = cap - normalizedRate;
    const newFail = applyMultiplicativeSuccessModifier(fail, 1 / normalizedFactor, cap);
    return cap - newFail;
  }

  const mid = cap / 2;
  if (normalizedRate <= mid) {
    const candidate = normalizedRate * normalizedFactor;
    if (candidate <= mid) {
      return candidate;
    }
    // 越过中点：把剩余 factor 投入除段。乘到 mid 用了 mid/rate 倍，剩余 = factor*rate/mid。
    const remaining = (normalizedFactor * normalizedRate) / mid;
    return cap - (cap - mid) / remaining;
  }

  // 强段：直接对失败率做除。
  return cap - (cap - normalizedRate) / normalizedFactor;
}

/** 按目标等级与技艺等级差计算通用成功率修正值。 */
export function computeCraftLevelSuccessModifier(
  targetLevel: number | undefined,
  craftSkillLevel: number | undefined,
  lowerLevelModifierPerLevel = CRAFT_SUCCESS_LOWER_LEVEL_MODIFIER_PER_LEVEL,
  higherLevelModifierPerLevel = CRAFT_SUCCESS_HIGHER_LEVEL_MODIFIER_PER_LEVEL,
): number {
  const normalizedTargetLevel = Math.max(1, Math.floor(Number(targetLevel) || 1));
  const normalizedCraftSkillLevel = Math.max(1, Math.floor(Number(craftSkillLevel) || 1));
  const levelDelta = normalizedTargetLevel - normalizedCraftSkillLevel;
  if (levelDelta > 0) {
    return levelDelta * lowerLevelModifierPerLevel;
  }
  if (levelDelta < 0) {
    return Math.abs(levelDelta) * higherLevelModifierPerLevel;
  }
  return 0;
}

/** 统一技艺成功率修正：等级差、工具、幸运等修正量先加算，再进入原赔率空间公式。 */
export function computeCraftAdjustedSuccessRate(
  baseRate: number | undefined,
  targetLevel: number | undefined,
  craftSkillLevel: number | undefined,
  extraSuccessRate = 0,
): number {
  const levelModifier = computeCraftLevelSuccessModifier(targetLevel, craftSkillLevel);
  const normalizedExtraSuccessRate = Number.isFinite(extraSuccessRate)
    ? Math.max(0, Number(extraSuccessRate))
    : 0;
  const modifier = levelModifier + normalizedExtraSuccessRate;
  const normalizedBaseRate = clampUnitSuccessRate(baseRate);
  if (normalizedBaseRate >= 1 && modifier < 0) {
    return Math.max(0, Math.min(1, Math.exp(modifier)));
  }
  return applyAsymptoticSuccessModifier(normalizedBaseRate, modifier);
}

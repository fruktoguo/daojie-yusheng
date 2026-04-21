/** 将成功率输入压到 `[0, 1]` 区间。 */
export function clampUnitSuccessRate(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

/**
 * 在赔率空间应用成功率修正。
 *
 * 说明：
 * - 正修正不会把非边界基础成功率直接推到 `1`。
 * - 负修正不会把非边界基础成功率直接压到 `0`。
 */
export function applyAsymptoticSuccessModifier(rate: number | undefined, modifier: number | undefined): number {
  const normalizedRate = clampUnitSuccessRate(rate);
  if (normalizedRate <= 0 || normalizedRate >= 1) {
    return normalizedRate;
  }

  const normalizedModifier = Number.isFinite(modifier) ? Number(modifier) : 0;
  if (normalizedModifier === 0) {
    return normalizedRate;
  }

  if (normalizedModifier > 0) {
    const inverseGrowth = Math.exp(-normalizedModifier);
    return normalizedRate / (normalizedRate + ((1 - normalizedRate) * inverseGrowth));
  }

  const growth = Math.exp(normalizedModifier);
  return (normalizedRate * growth) / ((1 - normalizedRate) + (normalizedRate * growth));
}

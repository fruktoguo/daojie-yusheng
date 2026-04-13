/** clampUnitSuccessRate：规范成功率输入到单位区间。 */
export function clampUnitSuccessRate(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

/** applyAsymptoticSuccessModifier：在赔率空间应用成功率修正，有限修正不会把非边界基础成功率推到边界。 */
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

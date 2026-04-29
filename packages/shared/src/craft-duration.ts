/** 将技艺基础耗时归一化为正整数。 */
function normalizeCraftDurationBaseTicks(baseTicks: number): number {
  return Math.max(1, Math.floor(Number(baseTicks) || 1));
}

/** 将技艺速度修正归一化为有限数值。 */
export function normalizeCraftSpeedRate(speedRate: number | undefined): number {
  return Number.isFinite(speedRate) ? Number(speedRate) : 0;
}

/** 根据统一速度语义计算技艺耗时倍率。 */
export function computeCraftDurationFactor(speedRate: number | undefined): number {
  const normalizedSpeedRate = normalizeCraftSpeedRate(speedRate);
  if (normalizedSpeedRate >= 0) {
    return 1 / (1 + normalizedSpeedRate);
  }
  return 1 + Math.abs(normalizedSpeedRate);
}

/** 根据统一速度语义计算最终技艺耗时。 */
export function computeAdjustedCraftTicks(baseTicks: number, speedRate: number | undefined): number {
  const normalizedBaseTicks = normalizeCraftDurationBaseTicks(baseTicks);
  return Math.max(1, Math.ceil(normalizedBaseTicks * computeCraftDurationFactor(speedRate)));
}

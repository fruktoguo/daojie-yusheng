/** normalizeCraftDurationBaseTicks：定义技艺耗时基值归一化逻辑。 */
function normalizeCraftDurationBaseTicks(baseTicks: number): number {
  return Math.max(1, Math.floor(Number(baseTicks) || 1));
}

/** normalizeCraftSpeedRate：定义技艺速度率归一化逻辑。 */
export function normalizeCraftSpeedRate(speedRate: number | undefined): number {
  return Number.isFinite(speedRate) ? Number(speedRate) : 0;
}

/** computeCraftDurationFactor：根据统一速度语义计算耗时倍率。 */
export function computeCraftDurationFactor(speedRate: number | undefined): number {
  const normalizedSpeedRate = normalizeCraftSpeedRate(speedRate);
  if (normalizedSpeedRate >= 0) {
    return 1 / (1 + normalizedSpeedRate);
  }
  return 1 + Math.abs(normalizedSpeedRate);
}

/** computeAdjustedCraftTicks：根据统一速度语义计算最终耗时。 */
export function computeAdjustedCraftTicks(baseTicks: number, speedRate: number | undefined): number {
  const normalizedBaseTicks = normalizeCraftDurationBaseTicks(baseTicks);
  return Math.max(1, Math.ceil(normalizedBaseTicks * computeCraftDurationFactor(speedRate)));
}

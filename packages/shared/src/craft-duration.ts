/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** 将技艺基础耗时归一化为正整数。 */
export function normalizeCraftDurationBaseTicks(baseTicks: number): number {
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

/** 计算技艺未取整的理论单批耗时（浮点数）。 */
export function computeRawCraftTicks(baseTicks: number, speedRate: number | undefined): number {
  const normalizedBaseTicks = normalizeCraftDurationBaseTicks(baseTicks);
  return normalizedBaseTicks * computeCraftDurationFactor(speedRate);
}

/**
 * 将浮点耗时按小数部分百分比概率随机判定实际耗时。
 *
 * - 若 rawTicks <= 1，保底为 1 息；
 * - 若 rawTicks > 1 且有小数部分 fraction：
 *   - 有 fraction 的概率维持 floor + 1 息；
 *   - 有 (1 - fraction) 的概率随机减少一息为 floor 息；
 *   - 数学期望严格等于 rawTicks。
 */
export function resolveStochasticCraftTicks(rawTicks: number, randomRoll?: number): number {
  if (!Number.isFinite(rawTicks) || rawTicks <= 0) {
    return 1;
  }
  if (rawTicks <= 1) {
    return 1;
  }
  const floorTicks = Math.floor(rawTicks);
  const fraction = Math.round((rawTicks - floorTicks) * 1e6) / 1e6;
  if (fraction <= 0) {
    return Math.max(1, floorTicks);
  }
  const roll = typeof randomRoll === 'number' && Number.isFinite(randomRoll)
    ? Math.max(0, Math.min(1, randomRoll))
    : Math.random();
  return roll < fraction ? floorTicks + 1 : floorTicks;
}

/**
 * 当实际单批制作时间小于 1 息时，计算理论每息可完成的批数（速率）。
 */
export function computeBatchesPerTick(rawTicks: number): number {
  if (!Number.isFinite(rawTicks) || rawTicks <= 0) {
    return 1;
  }
  return Math.max(1, 1 / Math.max(0.0001, rawTicks));
}

/**
 * 当实际单批制作时间小于 1 息时，按批量生产规则计算本息实际完成的批数。
 *
 * - 基础保底完成 floor(1 / rawTicks) 批；
 * - 剩余小数概率有几率额外完成 1 批；
 * - 若 rawTicks >= 1，则返回 1 批。
 */
export function resolveStochasticBatchesPerTick(rawTicks: number, randomRoll?: number): number {
  if (!Number.isFinite(rawTicks) || rawTicks <= 0) {
    return 1;
  }
  if (rawTicks >= 1) {
    return 1;
  }
  const rawBatches = 1 / Math.max(0.0001, rawTicks);
  const floorBatches = Math.floor(rawBatches);
  const fraction = Math.round((rawBatches - floorBatches) * 1e6) / 1e6;
  if (fraction <= 0) {
    return Math.max(1, floorBatches);
  }
  const roll = typeof randomRoll === 'number' && Number.isFinite(randomRoll)
    ? Math.max(0, Math.min(1, randomRoll))
    : Math.random();
  return roll < fraction ? floorBatches + 1 : floorBatches;
}

/** 根据统一速度语义计算单批最终技艺耗时（支持可选随机判定）。 */
export function computeAdjustedCraftTicks(
  baseTicks: number,
  speedRate: number | undefined,
  randomRoll?: number,
): number {
  const rawTicks = computeRawCraftTicks(baseTicks, speedRate);
  return resolveStochasticCraftTicks(rawTicks, randomRoll);
}

/**
 * 根据单批理论耗时与总制作数量计算总预计耗时（息数）。
 *
 * - 若单批理论耗时 rawBatchTicks < 1（批量生产模式）：按每息批数换算总耗时，支持 1 息完成多批；
 * - 若单批理论耗时 rawBatchTicks >= 1：按单批耗时乘以批数换算。
 */
export function computeTotalCraftTicks(
  rawBatchTicks: number,
  quantity: number | undefined,
  preparationTicks = 0,
): number {
  const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const normalizedPrep = Math.max(0, Math.floor(Number(preparationTicks) || 0));
  if (rawBatchTicks < 1) {
    const rawTotalTicks = normalizedQuantity * Math.max(0.0001, rawBatchTicks);
    return normalizedPrep + Math.max(1, Math.ceil(rawTotalTicks));
  }
  const singleBatchTicks = resolveStochasticCraftTicks(rawBatchTicks);
  return normalizedPrep + (singleBatchTicks * normalizedQuantity);
}


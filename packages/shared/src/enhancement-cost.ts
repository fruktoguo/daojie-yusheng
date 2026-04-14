/** 强化成功率表：按目标强化等级索引。 */
const ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL = [
  0.5,
  0.45,
  0.45,
  0.4,
  0.4,
  0.4,
  0.35,
  0.35,
  0.35,
  0.35,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
] as const;

/** 强化期望策略：描述某个保护起点下的期望消耗。 */
export interface EnhancementExpectedCostStrategy {
  targetLevel: number;
  protectionStartLevel: number | null;
  spiritStonePerSuccess: number;
  expectedAttempts: number;
  expectedSpiritStones: number;
  expectedProtectionCount: number;
  expectedTargetCopies: number;
  expectedProtectionCost?: number;
  expectedTotalCostWithoutBase?: number;
  expectedTotalCostWithBase?: number;
}

/** 强化期望集合：包含所有策略与最优策略。 */
export interface EnhancementExpectedCostAnalysis {
  strategies: EnhancementExpectedCostStrategy[];
  bestStrategy: EnhancementExpectedCostStrategy | null;
}

/** clampUnitRate：归一化成功率到 0~1。 */
function clampUnitRate(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

/** applyEnhancementSuccessModifier：按 50% 枢轴应用强化成功率修正。 */
function applyEnhancementSuccessModifier(rate: number | undefined, modifier: number | undefined): number {
  const normalizedRate = clampUnitRate(rate);
  if (normalizedRate <= 0 || normalizedRate >= 1) {
    return normalizedRate;
  }
  const normalizedModifier = Number.isFinite(modifier) ? Number(modifier) : 0;
  if (normalizedModifier === 0) {
    return normalizedRate;
  }
  if (normalizedModifier < 0) {
    return normalizedRate / (1 + Math.abs(normalizedModifier));
  }
  const factor = 1 + normalizedModifier;
  if (normalizedRate <= 0.5) {
    const scaledSuccess = normalizedRate * factor;
    if (scaledSuccess <= 0.5) {
      return scaledSuccess;
    }
    return 1 - (0.25 / scaledSuccess);
  }
  return 1 - ((1 - normalizedRate) / factor);
}

/** getEnhancementTargetSuccessRate：读取目标强化等级的基础成功率。 */
function getEnhancementTargetSuccessRate(targetLevel: number): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(targetLevel) || 1));
  const index = Math.min(normalizedLevel, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
  return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}

/** getEnhancementSpiritStoneCost：读取每次成功时结算的灵石数量。 */
function getEnhancementSpiritStoneCost(itemLevel: number | undefined): number {
  const normalizedLevel = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
  return Math.max(1, Math.ceil(normalizedLevel / 10));
}

/** computeEnhancementExpectedCostStrategy：计算单一保护起点策略的期望消耗。 */
export function computeEnhancementExpectedCostStrategy(input: {
  targetLevel: number;
  itemLevel: number;
  extraSuccessRate?: number;
  protectionStartLevel: number | null;
  protectionUnitPrice?: number;
  targetItemUnitPrice?: number;
  selfProtection?: boolean;
}): EnhancementExpectedCostStrategy {
  const targetLevel = Math.max(0, Math.floor(Number(input.targetLevel) || 0));
  const spiritStonePerSuccess = getEnhancementSpiritStoneCost(input.itemLevel);

  if (targetLevel <= 0) {
    const zeroCost = input.targetItemUnitPrice;
    return {
      targetLevel: 0,
      protectionStartLevel: input.protectionStartLevel,
      spiritStonePerSuccess,
      expectedAttempts: 0,
      expectedSpiritStones: 0,
      expectedProtectionCount: 0,
      expectedTargetCopies: 1,
      expectedProtectionCost: 0,
      expectedTotalCostWithoutBase: 0,
      expectedTotalCostWithBase: zeroCost,
    };
  }

  const successRates = Array.from({ length: targetLevel + 1 }, (_, index) => (
    index <= 0
      ? 0
      : applyEnhancementSuccessModifier(getEnhancementTargetSuccessRate(index), input.extraSuccessRate ?? 0)
  ));
  const matrix = buildCoefficientMatrix(targetLevel, input.protectionStartLevel, successRates);
  const expectedAttempts = solveLinearSystem(matrix, buildRewardVector(targetLevel, input.protectionStartLevel, successRates, () => 1))[0] ?? 0;
  const expectedSpiritStones = solveLinearSystem(
    matrix,
    buildRewardVector(targetLevel, input.protectionStartLevel, successRates, ({ successRate }) => successRate * spiritStonePerSuccess),
  )[0] ?? 0;
  const expectedProtectionCount = solveLinearSystem(
    matrix,
    buildRewardVector(targetLevel, input.protectionStartLevel, successRates, ({ failureRate, protectionActive }) => protectionActive ? failureRate : 0),
  )[0] ?? 0;

  const expectedTargetCopies = input.selfProtection === false ? 1 : 1 + expectedProtectionCount;
  const expectedProtectionCost = input.protectionUnitPrice === undefined
    ? input.protectionStartLevel === null ? 0 : undefined
    : expectedProtectionCount * input.protectionUnitPrice;
  const expectedTotalCostWithoutBase = expectedProtectionCost === undefined
    ? undefined
    : expectedSpiritStones + expectedProtectionCost;
  const expectedTotalCostWithBase = expectedTotalCostWithoutBase === undefined || input.targetItemUnitPrice === undefined
    ? undefined
    : expectedTotalCostWithoutBase + input.targetItemUnitPrice;

  return {
    targetLevel,
    protectionStartLevel: input.protectionStartLevel,
    spiritStonePerSuccess,
    expectedAttempts,
    expectedSpiritStones,
    expectedProtectionCount,
    expectedTargetCopies,
    expectedProtectionCost,
    expectedTotalCostWithoutBase,
    expectedTotalCostWithBase,
  };
}

/** computeBestEnhancementExpectedCost：计算所有保护起点并给出最省钱策略。 */
export function computeBestEnhancementExpectedCost(input: {
  targetLevel: number;
  itemLevel: number;
  extraSuccessRate?: number;
  protectionUnitPrice?: number;
  targetItemUnitPrice?: number;
  selfProtection?: boolean;
}): EnhancementExpectedCostAnalysis {
  const targetLevel = Math.max(0, Math.floor(Number(input.targetLevel) || 0));
  const strategies: EnhancementExpectedCostStrategy[] = [
    computeEnhancementExpectedCostStrategy({
      ...input,
      targetLevel,
      protectionStartLevel: null,
    }),
  ];
  for (let level = 2; level <= targetLevel; level += 1) {
    strategies.push(computeEnhancementExpectedCostStrategy({
      ...input,
      targetLevel,
      protectionStartLevel: level,
    }));
  }

  let bestStrategy: EnhancementExpectedCostStrategy | null = null;
  if (input.protectionUnitPrice !== undefined) {
    for (const strategy of strategies) {
      if (strategy.expectedTotalCostWithBase === undefined) {
        continue;
      }
      if (!bestStrategy || strategy.expectedTotalCostWithBase < (bestStrategy.expectedTotalCostWithBase ?? Number.POSITIVE_INFINITY)) {
        bestStrategy = strategy;
      }
    }
  }

  return {
    strategies,
    bestStrategy,
  };
}

/** buildCoefficientMatrix：构造强化期望方程组。 */
function buildCoefficientMatrix(
  targetLevel: number,
  protectionStartLevel: number | null,
  successRates: number[],
): number[][] {
  const matrix = Array.from({ length: targetLevel }, () => Array(targetLevel).fill(0));
  for (let currentLevel = 0; currentLevel < targetLevel; currentLevel += 1) {
    const nextLevel = currentLevel + 1;
    const successRate = successRates[nextLevel] ?? 0;
    const failureRate = 1 - successRate;
    const protectionActive = protectionStartLevel !== null && nextLevel >= protectionStartLevel;
    const failureLevel = protectionActive ? Math.max(0, currentLevel - 1) : 0;

    matrix[currentLevel][currentLevel] += 1;
    if (nextLevel < targetLevel) {
      matrix[currentLevel][nextLevel] -= successRate;
    }
    if (failureLevel < targetLevel) {
      matrix[currentLevel][failureLevel] -= failureRate;
    }
  }
  return matrix;
}

/** buildRewardVector：构造方程右侧常数项。 */
function buildRewardVector(
  targetLevel: number,
  protectionStartLevel: number | null,
  successRates: number[],
  reward: (input: { successRate: number; failureRate: number; protectionActive: boolean }) => number,
): number[] {
  const vector = Array(targetLevel).fill(0);
  for (let currentLevel = 0; currentLevel < targetLevel; currentLevel += 1) {
    const nextLevel = currentLevel + 1;
    const successRate = successRates[nextLevel] ?? 0;
    const failureRate = 1 - successRate;
    const protectionActive = protectionStartLevel !== null && nextLevel >= protectionStartLevel;
    vector[currentLevel] = reward({
      successRate,
      failureRate,
      protectionActive,
    });
  }
  return vector;
}

/** solveLinearSystem：用高斯消元求解小规模线性方程组。 */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const a = matrix.map((row) => [...row]);
  const b = [...vector];

  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new Error('强化期望值方程求解失败：矩阵奇异。');
    }

    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    const divisor = a[col][col];
    for (let index = col; index < size; index += 1) {
      a[col][index] /= divisor;
    }
    b[col] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = a[row][col];
      if (Math.abs(factor) < 1e-12) {
        continue;
      }
      for (let index = col; index < size; index += 1) {
        a[row][index] -= factor * a[col][index];
      }
      b[row] -= factor * b[col];
    }
  }

  return b;
}

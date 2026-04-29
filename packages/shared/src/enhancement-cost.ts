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
/**
 * targetLevel：目标等级数值。
 */

  targetLevel: number;  
  /**
 * protectionStartLevel：protectionStart等级数值。
 */

  protectionStartLevel: number | null;  
  /**
 * spiritStonePerSuccess：spiritStonePerSuccess相关字段。
 */

  spiritStonePerSuccess: number;  
  /**
 * expectedAttempts：expectedAttempt相关字段。
 */

  expectedAttempts: number;  
  /**
 * expectedSpiritStones：expectedSpiritStone相关字段。
 */

  expectedSpiritStones: number;  
  /**
 * expectedProtectionCount：数量或计量字段。
 */

  expectedProtectionCount: number;  
  /**
 * expectedTargetCopies：expected目标Copy相关字段。
 */

  expectedTargetCopies: number;  
  /**
 * expectedProtectionCost：expectedProtection消耗数值。
 */

  expectedProtectionCost?: number;  
  /**
 * expectedTotalCostWithoutBase：expectedTotal消耗WithoutBase相关字段。
 */

  expectedTotalCostWithoutBase?: number;  
  /**
 * expectedTotalCostWithBase：expectedTotal消耗WithBase相关字段。
 */

  expectedTotalCostWithBase?: number;
}

/** 强化期望集合：包含所有策略与最优策略。 */
export interface EnhancementExpectedCostAnalysis {
/**
 * strategies：strategy相关字段。
 */

  strategies: EnhancementExpectedCostStrategy[];  
  /**
 * bestStrategy：bestStrategy相关字段。
 */

  bestStrategy: EnhancementExpectedCostStrategy | null;
}

/** clampUnitRate：处理clamp Unit速率。 */
function clampUnitRate(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

/** applyEnhancementSuccessModifier：应用强化Success Modifier。 */
function applyEnhancementSuccessModifier(rate: number | undefined, modifier: number | undefined): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** getEnhancementTargetSuccessRate：读取强化目标Success速率。 */
function getEnhancementTargetSuccessRate(targetLevel: number): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(targetLevel) || 1));
  const index = Math.min(normalizedLevel, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
  return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}

/** getEnhancementSpiritStoneCost：读取强化灵石石Cost。 */
function getEnhancementSpiritStoneCost(itemLevel: number | undefined): number {
  const normalizedLevel = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
  return Math.max(1, Math.ceil(normalizedLevel / 10));
}

/** computeEnhancementExpectedCostStrategy：计算强化Expected Cost Strategy。 */
export function computeEnhancementExpectedCostStrategy(input: {
/**
 * targetLevel：目标等级数值。
 */

  targetLevel: number;  
  /**
 * itemLevel：道具等级数值。
 */

  itemLevel: number;  
  /**
 * extraSuccessRate：extraSuccessRate数值。
 */

  extraSuccessRate?: number;  
  /**
 * protectionStartLevel：protectionStart等级数值。
 */

  protectionStartLevel: number | null;  
  /**
 * protectionUnitPrice：protectionUnit价格数值。
 */

  protectionUnitPrice?: number;  
  /**
 * targetItemUnitPrice：目标道具Unit价格数值。
 */

  targetItemUnitPrice?: number;  
  /**
 * selfProtection：selfProtection相关字段。
 */

  selfProtection?: boolean;
}): EnhancementExpectedCostStrategy {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** computeBestEnhancementExpectedCost：计算Best强化Expected Cost。 */
export function computeBestEnhancementExpectedCost(input: {
/**
 * targetLevel：目标等级数值。
 */

  targetLevel: number;  
  /**
 * itemLevel：道具等级数值。
 */

  itemLevel: number;  
  /**
 * extraSuccessRate：extraSuccessRate数值。
 */

  extraSuccessRate?: number;  
  /**
 * protectionUnitPrice：protectionUnit价格数值。
 */

  protectionUnitPrice?: number;  
  /**
 * targetItemUnitPrice：目标道具Unit价格数值。
 */

  targetItemUnitPrice?: number;  
  /**
 * selfProtection：selfProtection相关字段。
 */

  selfProtection?: boolean;
}): EnhancementExpectedCostAnalysis {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** buildCoefficientMatrix：构建Coefficient Matrix。 */
function buildCoefficientMatrix(
  targetLevel: number,
  protectionStartLevel: number | null,
  successRates: number[],
): number[][] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** buildRewardVector：构建Reward Vector。 */
function buildRewardVector(
  targetLevel: number,
  protectionStartLevel: number | null,
  successRates: number[],
  reward: (input: {  
  /**
 * successRate：successRate数值。
 */
 successRate: number;  
 /**
 * failureRate：failureRate数值。
 */
 failureRate: number;  
 /**
 * protectionActive：protection激活相关字段。
 */
 protectionActive: boolean }) => number,
): number[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** solveLinearSystem：处理solve Linear系统。 */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      throw new Error('强化推演失败');
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



/** 将成功率输入压到 `[0, 1]` 区间。 */
export function clampUnitSuccessRate(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));
}

/** 技艺等级低于目标等级时，每差 1 级施加的通用成功率修正。 */
export const CRAFT_SUCCESS_LOWER_LEVEL_MODIFIER_PER_LEVEL = Math.log(0.9);

/** 技艺等级高于目标等级时，每高 1 级施加的通用成功率修正。 */
export const CRAFT_SUCCESS_HIGHER_LEVEL_MODIFIER_PER_LEVEL = Math.log(1 / 0.98);

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

/** 统一技艺成功率修正：基础成功率由各技艺提供，修正统一进赔率空间。 */
export function computeCraftAdjustedSuccessRate(
  baseRate: number | undefined,
  targetLevel: number | undefined,
  craftSkillLevel: number | undefined,
  toolSuccessModifier = 0,
): number {
  const levelModifier = computeCraftLevelSuccessModifier(targetLevel, craftSkillLevel);
  const normalizedToolModifier = Number.isFinite(toolSuccessModifier) ? Number(toolSuccessModifier) : 0;
  return applyAsymptoticSuccessModifier(baseRate, levelModifier + normalizedToolModifier);
}

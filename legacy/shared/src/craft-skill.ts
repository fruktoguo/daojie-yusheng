export const CRAFT_SKILL_EXP_TICK_DIVISOR = 3600;
export const CRAFT_SKILL_LEVEL_DECAY_RATE = 0.95;
export const CRAFT_SKILL_FAILURE_EXP_RATE = 0.25;
export const CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL = 20;

/** CraftSkillExpComputationParams：定义统一技艺经验计算入参。 */
export interface CraftSkillExpComputationParams {
  skillLevel: number | undefined;
  targetLevel: number | undefined;
  baseActionTicks: number | undefined;
  getExpToNextByLevel: (level: number) => number | undefined;
  successCount?: number | undefined;
  failureCount?: number | undefined;
  successMultiplier?: number | undefined;
  failureMultiplier?: number | undefined;
}

/** CraftSkillExpComputationResult：定义统一技艺经验计算结果。 */
export interface CraftSkillExpComputationResult {
  referenceLevel: number;
  totalAttempts: number;
  successGainPerAttempt: number;
  failureGainPerAttempt: number;
  baseGain: number;
  finalGain: number;
}

/** getCraftSkillEarlyLevelExpMultiplier：1级 500%，20级恢复 100%。 */
export function getCraftSkillEarlyLevelExpMultiplier(level: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (normalizedLevel >= CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL) {
    return 1;
  }
  return 1 + ((CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL - normalizedLevel) * 4) / (CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL - 1);
}

export function computeTimedCraftSkillExp(
  referenceExpToNext: number | undefined,
  referenceLevel: number | undefined,
  baseActionTicks: number | undefined,
  multiplier = 1,
): number {
  const expToNext = Math.max(0, Math.floor(Number(referenceExpToNext) || 0));
  const level = Math.max(1, Math.floor(Number(referenceLevel) || 1));
  const ticks = Math.max(0, Math.floor(Number(baseActionTicks) || 0));
  const normalizedMultiplier = Math.max(0, Number.isFinite(multiplier) ? Number(multiplier) : 0);
  if (expToNext <= 0 || ticks <= 0 || normalizedMultiplier <= 0) {
    return 0;
  }
  const gain = expToNext
    * (ticks / CRAFT_SKILL_EXP_TICK_DIVISOR)
    * (CRAFT_SKILL_LEVEL_DECAY_RATE ** Math.max(0, level - 1))
    * normalizedMultiplier;
  return Math.max(0, Math.round(gain));
}

/** computeCraftSkillExpGain：统一计算技艺在一次或一批动作中的经验收益。 */
export function computeCraftSkillExpGain(params: CraftSkillExpComputationParams): CraftSkillExpComputationResult {
  const normalizedSkillLevel = Math.max(1, Math.floor(Number(params.skillLevel) || 1));
  const normalizedTargetLevel = Math.max(1, Math.floor(Number(params.targetLevel) || 1));
  const normalizedSuccessCount = Math.max(0, Math.floor(Number(params.successCount) || 0));
  const normalizedFailureCount = Math.max(0, Math.floor(Number(params.failureCount) || 0));
  const totalAttempts = normalizedSuccessCount + normalizedFailureCount;
  const referenceLevel = Math.min(normalizedSkillLevel, normalizedTargetLevel);
  const successGainPerAttempt = computeTimedCraftSkillExp(
    params.getExpToNextByLevel(referenceLevel),
    referenceLevel,
    params.baseActionTicks,
    params.successMultiplier,
  );
  const failureGainPerAttempt = computeTimedCraftSkillExp(
    params.getExpToNextByLevel(referenceLevel),
    referenceLevel,
    params.baseActionTicks,
    params.failureMultiplier ?? CRAFT_SKILL_FAILURE_EXP_RATE,
  );
  if (totalAttempts <= 0) {
    return {
      referenceLevel,
      totalAttempts,
      successGainPerAttempt,
      failureGainPerAttempt,
      baseGain: 0,
      finalGain: 0,
    };
  }
  const baseGain = Math.max(
    0,
    Math.round(((successGainPerAttempt * normalizedSuccessCount) + (failureGainPerAttempt * normalizedFailureCount)) / totalAttempts),
  );
  return {
    referenceLevel,
    totalAttempts,
    successGainPerAttempt,
    failureGainPerAttempt,
    baseGain,
    finalGain: Math.max(0, Math.round(baseGain * getCraftSkillEarlyLevelExpMultiplier(normalizedSkillLevel))),
  };
}

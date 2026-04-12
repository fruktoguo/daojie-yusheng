/** CRAFT_SKILL_EXP_TICK_DIVISOR：定义该变量以承载业务值。 */
export const CRAFT_SKILL_EXP_TICK_DIVISOR = 3600;
/** CRAFT_SKILL_LEVEL_DECAY_RATE：定义该变量以承载业务值。 */
export const CRAFT_SKILL_LEVEL_DECAY_RATE = 0.95;
/** CRAFT_SKILL_FAILURE_EXP_RATE：定义该变量以承载业务值。 */
export const CRAFT_SKILL_FAILURE_EXP_RATE = 0.25;
/** CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL：定义该变量以承载业务值。 */
export const CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL = 20;

/** CraftSkillExpComputationParams：定义统一技艺经验计算入参。 */
export interface CraftSkillExpComputationParams {
/** skillLevel：定义该变量以承载业务值。 */
  skillLevel: number | undefined;
/** targetLevel：定义该变量以承载业务值。 */
  targetLevel: number | undefined;
/** baseActionTicks：定义该变量以承载业务值。 */
  baseActionTicks: number | undefined;
  getExpToNextByLevel: (level: number) => number | undefined;
  successCount?: number | undefined;
  failureCount?: number | undefined;
  successMultiplier?: number | undefined;
  failureMultiplier?: number | undefined;
}

/** CraftSkillExpComputationResult：定义统一技艺经验计算结果。 */
export interface CraftSkillExpComputationResult {
/** referenceLevel：定义该变量以承载业务值。 */
  referenceLevel: number;
/** totalAttempts：定义该变量以承载业务值。 */
  totalAttempts: number;
/** successGainPerAttempt：定义该变量以承载业务值。 */
  successGainPerAttempt: number;
/** failureGainPerAttempt：定义该变量以承载业务值。 */
  failureGainPerAttempt: number;
/** baseGain：定义该变量以承载业务值。 */
  baseGain: number;
/** finalGain：定义该变量以承载业务值。 */
  finalGain: number;
}

/** getCraftSkillEarlyLevelExpMultiplier：1级 500%，20级恢复 100%。 */
export function getCraftSkillEarlyLevelExpMultiplier(level: number | undefined): number {
/** normalizedLevel：定义该变量以承载业务值。 */
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (normalizedLevel >= CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL) {
    return 1;
  }
  return 1 + ((CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL - normalizedLevel) * 4) / (CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL - 1);
}

/** computeTimedCraftSkillExp：执行对应的业务逻辑。 */
export function computeTimedCraftSkillExp(
  referenceExpToNext: number | undefined,
  referenceLevel: number | undefined,
  baseActionTicks: number | undefined,
  multiplier = 1,
): number {
/** expToNext：定义该变量以承载业务值。 */
  const expToNext = Math.max(0, Math.floor(Number(referenceExpToNext) || 0));
/** level：定义该变量以承载业务值。 */
  const level = Math.max(1, Math.floor(Number(referenceLevel) || 1));
/** ticks：定义该变量以承载业务值。 */
  const ticks = Math.max(0, Math.floor(Number(baseActionTicks) || 0));
/** normalizedMultiplier：定义该变量以承载业务值。 */
  const normalizedMultiplier = Math.max(0, Number.isFinite(multiplier) ? Number(multiplier) : 0);
  if (expToNext <= 0 || ticks <= 0 || normalizedMultiplier <= 0) {
    return 0;
  }
/** gain：定义该变量以承载业务值。 */
  const gain = expToNext
    * (ticks / CRAFT_SKILL_EXP_TICK_DIVISOR)
    * (CRAFT_SKILL_LEVEL_DECAY_RATE ** Math.max(0, level - 1))
    * normalizedMultiplier;
  return Math.max(0, Math.round(gain));
}

/** computeCraftSkillExpGain：统一计算技艺在一次或一批动作中的经验收益。 */
export function computeCraftSkillExpGain(params: CraftSkillExpComputationParams): CraftSkillExpComputationResult {
/** normalizedSkillLevel：定义该变量以承载业务值。 */
  const normalizedSkillLevel = Math.max(1, Math.floor(Number(params.skillLevel) || 1));
/** normalizedTargetLevel：定义该变量以承载业务值。 */
  const normalizedTargetLevel = Math.max(1, Math.floor(Number(params.targetLevel) || 1));
/** normalizedSuccessCount：定义该变量以承载业务值。 */
  const normalizedSuccessCount = Math.max(0, Math.floor(Number(params.successCount) || 0));
/** normalizedFailureCount：定义该变量以承载业务值。 */
  const normalizedFailureCount = Math.max(0, Math.floor(Number(params.failureCount) || 0));
/** totalAttempts：定义该变量以承载业务值。 */
  const totalAttempts = normalizedSuccessCount + normalizedFailureCount;
/** referenceLevel：定义该变量以承载业务值。 */
  const referenceLevel = Math.min(normalizedSkillLevel, normalizedTargetLevel);
/** successGainPerAttempt：定义该变量以承载业务值。 */
  const successGainPerAttempt = computeTimedCraftSkillExp(
    params.getExpToNextByLevel(referenceLevel),
    referenceLevel,
    params.baseActionTicks,
    params.successMultiplier,
  );
/** failureGainPerAttempt：定义该变量以承载业务值。 */
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
/** baseGain：定义该变量以承载业务值。 */
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

export const CRAFT_SKILL_EXP_TICK_DIVISOR = 3600;
export const CRAFT_SKILL_LEVEL_DECAY_RATE = 0.95;
export const CRAFT_SKILL_FAILURE_EXP_RATE = 0.25;
export const CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL = 20;

/** getCraftSkillEarlyLevelExpMultiplier：1级 500%，20级恢复 100%。 */
export function getCraftSkillEarlyLevelExpMultiplier(level: number | undefined): number {
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

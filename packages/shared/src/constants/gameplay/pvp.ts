/** 玩家被其他玩家击杀时施加的神魂受损 Buff ID。 */
export const PVP_SOUL_INJURY_BUFF_ID = 'pvp.soul_injury';

export const PVP_SOUL_INJURY_BASE_REDUCTION_PERCENT = 10;
export const PVP_SOUL_INJURY_ADDITIONAL_REDUCTION_PERCENT = 1;
export const PVP_SOUL_INJURY_MAX_REDUCTION_PERCENT = 30;
export const PVP_SOUL_INJURY_MAX_STACKS = 1
  + Math.floor(
    (PVP_SOUL_INJURY_MAX_REDUCTION_PERCENT - PVP_SOUL_INJURY_BASE_REDUCTION_PERCENT)
      / PVP_SOUL_INJURY_ADDITIONAL_REDUCTION_PERCENT,
  );

/** 首层降低 10%，之后每层额外降低 1%，最终封顶 30%。 */
export function resolvePvPSoulInjuryReductionPercent(stacksInput: unknown): number {
  const stacks = Math.max(0, Math.trunc(Number(stacksInput) || 0));
  if (stacks <= 0) {
    return 0;
  }
  return Math.min(
    PVP_SOUL_INJURY_MAX_REDUCTION_PERCENT,
    PVP_SOUL_INJURY_BASE_REDUCTION_PERCENT
      + (stacks - 1) * PVP_SOUL_INJURY_ADDITIONAL_REDUCTION_PERCENT,
  );
}

/** 神魂受损使用线性减幅，不复用常规负向百分比的反比衰减口径。 */
export function resolvePvPSoulInjuryMultiplier(stacksInput: unknown): number {
  return (100 - resolvePvPSoulInjuryReductionPercent(stacksInput)) / 100;
}

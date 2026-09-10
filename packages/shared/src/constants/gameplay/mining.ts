/** 击碎灵石矿后获得的灵脉诅咒 Buff ID。 */
export const MINING_VEIN_CURSE_BUFF_ID = 'mining.vein_curse';
/** 击碎灵石矿后获得的灵脉阻滞 Buff ID。 */
export const MINING_VEIN_STAGNATION_BUFF_ID = 'mining.vein_stagnation';
/** 灵脉诅咒持续 24 小时。 */
export const MINING_VEIN_CURSE_DURATION_TICKS = 24 * 60 * 60;
/** 灵脉阻滞持续 1 小时。 */
export const MINING_VEIN_STAGNATION_DURATION_TICKS = 60 * 60;
/** 两种矿脉减益均不设置常规玩法层数上限。 */
export const MINING_VEIN_DEBUFF_MAX_STACKS = 999_999;
/** 灵脉诅咒每层令最终挖矿爆率保留 90%。 */
export const MINING_VEIN_CURSE_DROP_MULTIPLIER_PER_STACK = 0.9;
/** 灵脉阻滞每层降低 10% 最终灵力输出效率。 */
export const MINING_VEIN_STAGNATION_QI_OUTPUT_REDUCTION_PER_STACK = 0.1;

/** 灵脉诅咒按层数指数衰减最终挖矿爆率。 */
export function resolveMiningVeinCurseDropMultiplier(stacksInput: unknown): number {
  const stacks = normalizeMiningVeinDebuffStacks(stacksInput);
  return MINING_VEIN_CURSE_DROP_MULTIPLIER_PER_STACK ** stacks;
}

/** 灵脉阻滞按层数线性降低最终灵力输出，最低为 0。 */
export function resolveMiningVeinStagnationQiOutputMultiplier(stacksInput: unknown): number {
  const stacks = normalizeMiningVeinDebuffStacks(stacksInput);
  return Math.max(0, 1 - MINING_VEIN_STAGNATION_QI_OUTPUT_REDUCTION_PER_STACK * stacks);
}

function normalizeMiningVeinDebuffStacks(stacksInput: unknown): number {
  return Math.min(MINING_VEIN_DEBUFF_MAX_STACKS, Math.max(0, Math.trunc(Number(stacksInput) || 0)));
}

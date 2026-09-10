/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import {
  CRAFT_SKILL_EXP_TICK_DIVISOR,
  CRAFT_SKILL_LEVEL_DECAY_RATE,
  CRAFT_SKILL_FAILURE_EXP_RATE,
  CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL,
  MINING_DAMAGE_BONUS_PER_LEVEL,
  MINING_DROP_BASE_DAMAGE_MAX_HP_RATIO,
  MINING_DROP_MAP_LEVEL_MULTIPLIER_PER_LEVEL,
  MINING_DROP_MAX_TRIGGER_CHANCE,
  MINING_DROP_OVERLEVEL_MULTIPLIER_PER_LEVEL,
  MINING_DROP_RATE_BONUS_PER_LEVEL,
  MINING_DROP_UNDERLEVEL_MULTIPLIER_PER_LEVEL,
} from './constants/gameplay/craft';

/** 统一技艺经验计算入参。 */
export interface CraftSkillExpComputationParams {
  /** 当前执行技艺动作的玩家境界等级。 */
  playerRealmLevel: number | undefined;
  skillLevel: number | undefined;
  targetLevel: number | undefined;
  baseActionTicks: number | undefined;
  getExpToNextByLevel: (level: number) => number | undefined;
  successCount?: number | undefined;
  failureCount?: number | undefined;
  successMultiplier?: number | undefined;
  failureMultiplier?: number | undefined;
}

/** 统一技艺经验计算结果。 */
export interface CraftSkillExpComputationResult {
  referenceLevel: number;
  totalAttempts: number;
  successGainPerAttempt: number;
  failureGainPerAttempt: number;
  baseGain: number;
  finalGain: number;
}

/** 前期技艺经验补偿：1 级约 500%，20 级回到 100%。 */
export function getCraftSkillEarlyLevelExpMultiplier(level: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (normalizedLevel >= CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL) {
    return 1;
  }
  return 1 + ((CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL - normalizedLevel) * 4) / (CRAFT_SKILL_EXP_COMPENSATION_END_LEVEL - 1);
}

/** 根据耗时、参考等级和倍率计算单次技艺经验。 */
export function computeTimedCraftSkillExp(
  referenceExpToNext: number | undefined,
  referenceLevel: number | undefined,
  baseActionTicks: number | undefined,
  multiplier = 1,
): number {
  const expToNext = Math.max(0, Math.floor(Number(referenceExpToNext) || 0));
  const level = Math.max(1, Math.floor(Number(referenceLevel) || 1));
  const ticks = Math.max(0, Number(baseActionTicks) || 0);
  const normalizedMultiplier = Math.max(0, Number.isFinite(multiplier) ? Number(multiplier) : 0);
  if (expToNext <= 0 || ticks <= 0 || normalizedMultiplier <= 0) {
    return 0;
  }

  const gain = expToNext
    * (ticks / CRAFT_SKILL_EXP_TICK_DIVISOR)
    * (CRAFT_SKILL_LEVEL_DECAY_RATE ** Math.max(0, level - 1))
    * normalizedMultiplier;
  return Math.max(0, gain);
}

/** 统一计算一次或一批技艺动作的经验收益。 */
export function computeCraftSkillExpGain(params: CraftSkillExpComputationParams): CraftSkillExpComputationResult {
  const normalizedPlayerRealmLevel = Math.max(1, Math.floor(Number(params.playerRealmLevel) || 1));
  const normalizedSkillLevel = Math.max(1, Math.floor(Number(params.skillLevel) || 1));
  const normalizedTargetLevel = Math.max(1, Math.floor(Number(params.targetLevel) || 1));
  const normalizedSuccessCount = Math.max(0, Math.floor(Number(params.successCount) || 0));
  const normalizedFailureCount = Math.max(0, Math.floor(Number(params.failureCount) || 0));
  const totalAttempts = normalizedSuccessCount + normalizedFailureCount;
  const referenceLevel = Math.min(normalizedPlayerRealmLevel, normalizedSkillLevel, normalizedTargetLevel);

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
    ((successGainPerAttempt * normalizedSuccessCount) + (failureGainPerAttempt * normalizedFailureCount)) / totalAttempts,
  );
  const finalGainRaw = baseGain * getCraftSkillEarlyLevelExpMultiplier(normalizedSkillLevel);
  return {
    referenceLevel,
    totalAttempts,
    successGainPerAttempt,
    failureGainPerAttempt,
    baseGain,
    finalGain: finalGainRaw > 0 ? Math.max(1, Math.round(finalGainRaw)) : 0,
  };
}

/** 根据挖矿技艺等级计算对矿脉地块的伤害倍率（指数增长）。 */
export function getMiningDamageMultiplier(miningLevel: number | undefined): number {
  const level = Math.max(0, Math.floor(Number(miningLevel) || 0));
  if (level <= 0) {
    return 1;
  }
  return Math.pow(1 + MINING_DAMAGE_BONUS_PER_LEVEL, level);
}

/** 根据挖矿技艺等级计算矿物额外概率，每级 +1%。 */
export function getMiningDropRateBonus(miningLevel: number | undefined): number {
  const level = Math.max(0, Math.floor(Number(miningLevel) || 0));
  return level * MINING_DROP_RATE_BONUS_PER_LEVEL;
}

export interface MiningDamageDropExpectedCountParams {
  baseChanceBps: number | undefined;
  baseCount?: number | undefined;
  appliedDamage: number | undefined;
  maxHp: number | undefined;
  mineralLevel: number | undefined;
  attackerRealmLevel: number | undefined;
  otherMultiplier?: number | undefined;
}

export interface MiningExpectedDropRollPlan {
  expectedCount: number;
  triggerChance: number;
  averageCountOnTrigger: number;
  maxCountOnTrigger: number;
}

/**
 * 以地块最大生命的 0.1% 为 1 倍伤害基准：
 * 低于基准时按实际伤害比例缩放；超过 0.1% 基准的伤害增幅开平方根平滑增长（例如 10% 伤害由原本 100 倍变为 10 倍）。
 */
export function getMiningDamageDropMultiplier(appliedDamage: number | undefined, maxHp: number | undefined): number {
  const normalizedMaxHp = Math.max(1, Number(maxHp) || 1);
  const damage = Math.min(normalizedMaxHp, Math.max(0, Number(appliedDamage) || 0));
  if (damage <= 0) {
    return 0;
  }
  const baselineDamage = normalizedMaxHp * MINING_DROP_BASE_DAMAGE_MAX_HP_RATIO;
  const ratio = damage / baselineDamage;
  return ratio <= 1 ? ratio : Math.sqrt(ratio);
}

/**
 * 计算矿物等级的线性倍率：
 * 1-10 级每级 +100%（10 级为 10 倍）；
 * 11-20 级在此基础上每级 +200%（11 级为 12 倍，20 级为 30 倍）；
 * 21-30 级在此基础上每级 +300%（21 级为 33 倍，30 级为 60 倍）；
 * 依此类推分段平滑累加，保证跨档无断层跳跃。
 */
export function getMiningMapLevelLinearMultiplier(mineralLevel: number | undefined): number {
  const level = Math.max(1, Math.floor(Number(mineralLevel) || 1));
  if (level <= 1) {
    return 1;
  }
  const tierIndex = Math.floor((level - 1) / 10);
  if (tierIndex === 0) {
    return 1 + (level - 1);
  }
  const baseMultiplier = 10 + 5 * (tierIndex - 1) * (tierIndex + 2);
  const remainingLevels = level - tierIndex * 10;
  const currentTierRate = tierIndex + 1;
  return baseMultiplier + remainingLevels * currentTierRate;
}

/**
 * 矿物地图等级掉落倍率：
 * 包含 10% 指数增幅与分段线性增幅（1-10 级每级 +100%，11-20 级每级 +200%...），
 * 两者按（指数倍率 + 线性倍率 - 1）相加叠加，保证 1 级为 1 倍基准且数值平滑递增。
 */
export function getMiningMapLevelDropMultiplier(mineralLevel: number | undefined): number {
  const level = Math.max(1, Math.floor(Number(mineralLevel) || 1));
  const expMultiplier = MINING_DROP_MAP_LEVEL_MULTIPLIER_PER_LEVEL ** (level - 1);
  const linearMultiplier = getMiningMapLevelLinearMultiplier(level);
  return expMultiplier + linearMultiplier - 1;
}

/** 境界高于矿物每级保留 80%，低于矿物每级保留 90%。 */
export function getMiningRealmGapDropMultiplier(
  attackerRealmLevel: number | undefined,
  mineralLevel: number | undefined,
): number {
  const attackerLevel = Math.max(1, Math.floor(Number(attackerRealmLevel) || 1));
  const targetLevel = Math.max(1, Math.floor(Number(mineralLevel) || 1));
  if (attackerLevel > targetLevel) {
    return MINING_DROP_OVERLEVEL_MULTIPLIER_PER_LEVEL ** (attackerLevel - targetLevel);
  }
  if (attackerLevel < targetLevel) {
    return MINING_DROP_UNDERLEVEL_MULTIPLIER_PER_LEVEL ** (targetLevel - attackerLevel);
  }
  return 1;
}

/** 汇总矿物基础爆率、伤害、地图等级、境界差和其他来源后的最终期望掉落数量。 */
export function computeMiningDamageDropExpectedCount(params: MiningDamageDropExpectedCountParams): number {
  const baseChance = Math.max(0, Number(params.baseChanceBps) || 0) / 10_000;
  const baseCount = Math.max(1, Math.floor(Number(params.baseCount) || 1));
  const otherMultiplier = Math.max(0, Number.isFinite(params.otherMultiplier) ? Number(params.otherMultiplier) : 1);
  if (baseChance <= 0 || otherMultiplier <= 0) {
    return 0;
  }
  const expectedCount = baseChance
    * baseCount
    * getMiningDamageDropMultiplier(params.appliedDamage, params.maxHp)
    * getMiningMapLevelDropMultiplier(params.mineralLevel)
    * getMiningRealmGapDropMultiplier(params.attackerRealmLevel, params.mineralLevel)
    * otherMultiplier;
  return Number.isFinite(expectedCount) && expectedCount > 0 ? expectedCount : 0;
}

/** 把最终期望数量转换为不超过 10% 的触发率和对称随机数量区间。 */
export function resolveMiningExpectedDropRollPlan(expectedCount: number | undefined): MiningExpectedDropRollPlan {
  const expected = Math.max(0, Number(expectedCount) || 0);
  if (expected <= 0) {
    return { expectedCount: 0, triggerChance: 0, averageCountOnTrigger: 1, maxCountOnTrigger: 1 };
  }
  const rawAverage = expected / MINING_DROP_MAX_TRIGGER_CHANCE;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(rawAverage)) * 4;
  const averageCountOnTrigger = Math.max(1, Math.ceil(rawAverage - epsilon));
  const maxCountOnTrigger = (averageCountOnTrigger * 2) - 1;
  return {
    expectedCount: expected,
    triggerChance: Math.min(MINING_DROP_MAX_TRIGGER_CHANCE, expected / averageCountOnTrigger),
    averageCountOnTrigger,
    maxCountOnTrigger,
  };
}

/** 按矿物掉落计划掷骰；数量在 [1, 2k-1] 内均匀分布，严格保持原始期望值。 */
export function rollMiningExpectedDropCount(
  expectedCount: number | undefined,
  random: () => number = Math.random,
): number {
  const plan = resolveMiningExpectedDropRollPlan(expectedCount);
  if (plan.triggerChance <= 0 || normalizeMiningDropRandom(random()) >= plan.triggerChance) {
    return 0;
  }
  if (plan.maxCountOnTrigger <= 1) {
    return 1;
  }
  return 1 + Math.floor(normalizeMiningDropRandom(random()) * plan.maxCountOnTrigger);
}

function normalizeMiningDropRandom(value: number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }
  return Math.min(1 - Number.EPSILON, normalized);
}

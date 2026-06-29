/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 自动战斗、自动丹药与目标筛选相关的共享配置类型。
 */

/** 自动战斗技能配置。 */
export interface AutoBattleSkillConfig {
/**
 * skillId：技能ID标识。
 */

  skillId: string;  
  /**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * skillEnabled：启用开关或状态标识。
 */

  skillEnabled?: boolean;
}

/** 自动丹药触发资源类型。 */
export type AutoUsePillResource = 'hp' | 'qi';

/** 自动丹药条件操作符。 */
export type AutoUsePillConditionOperator = 'lt' | 'gt';

/** 自动丹药资源阈值条件。 */
export interface AutoUsePillResourceCondition {
/**
 * type：type相关字段。
 */

  type: 'resource_ratio';  
  /**
 * resource：resource相关字段。
 */

  resource: AutoUsePillResource;  
  /**
 * op：op相关字段。
 */

  op: AutoUsePillConditionOperator;  
  /**
 * thresholdPct：阈值Pct相关字段。
 */

  thresholdPct: number;
}

/** 自动丹药缺 Buff 条件。 */
export interface AutoUsePillBuffMissingCondition {
/**
 * type：type相关字段。
 */

  type: 'buff_missing';
}

/** 自动丹药触发条件。 */
export type AutoUsePillCondition = AutoUsePillResourceCondition | AutoUsePillBuffMissingCondition;

/** 自动使用丹药配置。 */
export interface AutoUsePillConfig {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * conditions：condition相关字段。
 */

  conditions: AutoUsePillCondition[];
}

/** 战斗目标规则分组。 */
export type CombatTargetingRuleScope = 'hostile' | 'friendly';

/** 战斗目标规则键。 */
export type CombatTargetingRuleKey =
  | 'monster'
  | 'demonized_players'
  | 'retaliators'
  | 'party'
  | 'sect'
  | 'terrain'
  | 'non_hostile_players'
  | 'all_players';

/** 战斗目标筛选规则。 */
export interface CombatTargetingRules {
/**
 * hostile：敌对目标规则集合。
 */

  hostile?: CombatTargetingRuleKey[];
  /**
 * friendly：友方目标规则集合。
 */

  friendly?: CombatTargetingRuleKey[];
}

export const HOSTILE_COMBAT_TARGETING_RULE_KEYS = [
  'monster',
  'all_players',
  'demonized_players',
  'retaliators',
  'terrain',
  'party',
  'sect',
] as const satisfies readonly CombatTargetingRuleKey[];

export const FRIENDLY_COMBAT_TARGETING_RULE_KEYS = [
  'all_players',
  'retaliators',
  'non_hostile_players',
  'party',
  'sect',
] as const satisfies readonly CombatTargetingRuleKey[];

export const DEFAULT_HOSTILE_COMBAT_TARGETING_RULES = [
  'monster',
  'demonized_players',
  'retaliators',
  'terrain',
] as const satisfies readonly CombatTargetingRuleKey[];

export const DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES = [
  'non_hostile_players',
] as const satisfies readonly CombatTargetingRuleKey[];

function normalizeCombatTargetingRuleList(
  value: unknown,
  allowedKeys: readonly CombatTargetingRuleKey[],
  fallback: readonly CombatTargetingRuleKey[],
): CombatTargetingRuleKey[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized: CombatTargetingRuleKey[] = [];
  const seen = new Set<CombatTargetingRuleKey>();
  for (const entry of source) {
    if (typeof entry !== 'string') {
      continue;
    }
    const rule = entry as CombatTargetingRuleKey;
    if (!allowedKeys.includes(rule) || seen.has(rule)) {
      continue;
    }
    normalized.push(rule);
    seen.add(rule);
  }
  return normalized;
}

export function buildDefaultCombatTargetingRules(options?: {
  includeAllPlayersHostile?: boolean;
}): CombatTargetingRules {
  const hostile: CombatTargetingRuleKey[] = [...DEFAULT_HOSTILE_COMBAT_TARGETING_RULES];
  if (options?.includeAllPlayersHostile === true && !hostile.includes('all_players')) {
    hostile.push('all_players');
  }
  return {
    hostile,
    friendly: [...DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES],
  };
}

export function normalizeCombatTargetingRules(
  value: unknown,
  fallback: CombatTargetingRules = buildDefaultCombatTargetingRules(),
): CombatTargetingRules {
  const record = typeof value === 'object' && value !== null
    ? value as CombatTargetingRules
    : {};
  return {
    hostile: normalizeCombatTargetingRuleList(
      record.hostile,
      HOSTILE_COMBAT_TARGETING_RULE_KEYS,
      fallback.hostile ?? DEFAULT_HOSTILE_COMBAT_TARGETING_RULES,
    ),
    friendly: normalizeCombatTargetingRuleList(
      record.friendly,
      FRIENDLY_COMBAT_TARGETING_RULE_KEYS,
      fallback.friendly ?? DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES,
    ),
  };
}

/** 自动战斗目标选择模式。 */
export type AutoBattleTargetingMode = 'auto' | 'nearest' | 'low_hp' | 'full_hp' | 'boss' | 'player';

export const AUTO_BATTLE_TARGETING_MODES = [
  'auto',
  'nearest',
  'low_hp',
  'full_hp',
  'boss',
  'player',
] as const satisfies readonly AutoBattleTargetingMode[];

export function isAutoBattleTargetingMode(value: unknown): value is AutoBattleTargetingMode {
  return typeof value === 'string' && (AUTO_BATTLE_TARGETING_MODES as readonly string[]).includes(value);
}

export function normalizeAutoBattleTargetingMode(value: unknown): AutoBattleTargetingMode {
  return isAutoBattleTargetingMode(value) ? value : 'auto';
}

/** 出手力度档位：单位为“成”。 */
export type CombatAttackIntensity = 1 | 3 | 7 | 10 | 12;

/** 出手力度可选档位。 */
export const COMBAT_ATTACK_INTENSITY_OPTIONS = [1, 3, 7, 10, 12] as const satisfies readonly CombatAttackIntensity[];

/** 默认出手力度，保持原有 10 成行为。 */
export const DEFAULT_COMBAT_ATTACK_INTENSITY: CombatAttackIntensity = 10;

export function isCombatAttackIntensity(value: unknown): value is CombatAttackIntensity {
  return typeof value === 'number'
    && Number.isInteger(value)
    && (COMBAT_ATTACK_INTENSITY_OPTIONS as readonly number[]).includes(value);
}

export function normalizeCombatAttackIntensity(value: unknown): CombatAttackIntensity {
  const numeric = typeof value === 'string' && value.trim()
    ? Number(value)
    : Number(value);
  return isCombatAttackIntensity(numeric) ? numeric : DEFAULT_COMBAT_ATTACK_INTENSITY;
}

/** 出手力度对应的伤害倍率。 */
export function resolveCombatAttackIntensityDamageMultiplier(value: unknown): number {
  return normalizeCombatAttackIntensity(value) / 10;
}

/** 出手力度对应的实际灵力消耗倍率。 */
export function resolveCombatAttackIntensityQiCostMultiplier(value: unknown): number {
  const intensity = normalizeCombatAttackIntensity(value);
  if (intensity === 1) {
    return 0.5;
  }
  if (intensity === 12) {
    return 2;
  }
  return 1;
}

/** 按出手力度修正已经套过标准公式的实际灵力消耗。 */
export function applyCombatAttackIntensityQiCost(effectiveCost: number, value: unknown): number {
  if (!Number.isFinite(effectiveCost)) {
    return effectiveCost;
  }
  const normalizedCost = Math.max(0, Math.round(Number(effectiveCost) || 0));
  if (normalizedCost <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(normalizedCost * resolveCombatAttackIntensityQiCostMultiplier(value)));
}

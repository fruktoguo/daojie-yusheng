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
/**
 * includeNormalMonsters：集合字段。
 */

  includeNormalMonsters?: boolean;  
  /**
 * includeEliteMonsters：集合字段。
 */

  includeEliteMonsters?: boolean;  
  /**
 * includeBosses：includeBosse相关字段。
 */

  includeBosses?: boolean;  
  /**
 * includePlayers：集合字段。
 */

  includePlayers?: boolean;
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
  const legacyIncludePlayers = record.includePlayers === true || fallback.includePlayers === true;
  const legacyMonsterEnabled = record.includeNormalMonsters === true
    || record.includeEliteMonsters === true
    || record.includeBosses === true
    || fallback.includeNormalMonsters === true
    || fallback.includeEliteMonsters === true
    || fallback.includeBosses === true;
  const hostileFallback = [...(fallback.hostile ?? DEFAULT_HOSTILE_COMBAT_TARGETING_RULES)];
  if (legacyMonsterEnabled && !hostileFallback.includes('monster')) {
    hostileFallback.unshift('monster');
  }
  if (legacyIncludePlayers && !hostileFallback.includes('all_players')) {
    hostileFallback.push('all_players');
  }
  return {
    hostile: normalizeCombatTargetingRuleList(record.hostile, HOSTILE_COMBAT_TARGETING_RULE_KEYS, hostileFallback),
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

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

/** 战斗目标筛选规则。 */
export interface CombatTargetingRules {
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

/** 自动战斗目标选择模式。 */
export type AutoBattleTargetingMode = 'auto' | 'nearest' | 'low_hp' | 'full_hp' | 'boss' | 'player';

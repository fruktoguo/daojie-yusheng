/**
 * 自动战斗、自动丹药与目标筛选相关的共享配置类型。
 */

/** 自动战斗技能配置。 */
export interface AutoBattleSkillConfig {
  skillId: string;
  enabled: boolean;
  skillEnabled?: boolean;
}

/** 自动丹药触发资源类型。 */
export type AutoUsePillResource = 'hp' | 'qi';

/** 自动丹药条件操作符。 */
export type AutoUsePillConditionOperator = 'lt' | 'gt';

/** 自动丹药资源阈值条件。 */
export interface AutoUsePillResourceCondition {
  type: 'resource_ratio';
  resource: AutoUsePillResource;
  op: AutoUsePillConditionOperator;
  thresholdPct: number;
}

/** 自动丹药缺 Buff 条件。 */
export interface AutoUsePillBuffMissingCondition {
  type: 'buff_missing';
}

/** 自动丹药触发条件。 */
export type AutoUsePillCondition = AutoUsePillResourceCondition | AutoUsePillBuffMissingCondition;

/** 自动使用丹药配置。 */
export interface AutoUsePillConfig {
  itemId: string;
  conditions: AutoUsePillCondition[];
}

/** 战斗目标筛选规则。 */
export interface CombatTargetingRules {
  includeNormalMonsters?: boolean;
  includeEliteMonsters?: boolean;
  includeBosses?: boolean;
  includePlayers?: boolean;
}

/** 自动战斗目标选择模式。 */
export type AutoBattleTargetingMode = 'auto' | 'nearest' | 'low_hp' | 'full_hp' | 'boss' | 'player';

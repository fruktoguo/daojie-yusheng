import type { CombatTargetingRuleKey } from './automation-types';

/** 统一敌我关系结果。 */
export type CombatRelation = 'hostile' | 'friendly' | 'neutral' | 'blocked';

/** 统一战斗目标类型。 */
export type CombatRelationTargetKind = 'player' | 'monster' | 'terrain';

/** 统一关系阻断原因代码。 */
export type CombatRelationBlockedReason =
  | 'self_target'
  | 'target_missing'
  | 'target_dead'
  | 'different_instance'
  | 'relation_not_hostile'
  | 'rule_not_matched';

/** 统一关系解析结果。 */
export interface CombatRelationResolution {
  relation: CombatRelation;
  matchedRules: CombatTargetingRuleKey[];
  blockedReason?: CombatRelationBlockedReason;
}

/** 是否可作为敌对行动目标。 */
export function isHostileCombatRelation(relation: CombatRelation | null | undefined): boolean {
  return relation === 'hostile';
}

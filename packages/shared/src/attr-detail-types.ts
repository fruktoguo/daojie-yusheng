import type { NumericRatioDivisors, NumericStatBreakdownMap, NumericStats } from './numeric';
import type { AttrBonus, Attributes } from './attribute-types';
import type { PlayerState } from './player-runtime-types';

/**
 * 低频属性详情投影，供协议层和属性面板详情消费端共用。
 */
export interface AttrDetailView {
/**
 * baseAttrs：baseAttr相关字段。
 */

  baseAttrs: Attributes;  
  /**
 * bonuses：bonuse相关字段。
 */

  bonuses: AttrBonus[];  
  /**
 * finalAttrs：finalAttr相关字段。
 */

  finalAttrs: Attributes;  
  /**
 * numericStats：numericStat相关字段。
 */

  numericStats: NumericStats;  
  /**
 * ratioDivisors：ratioDivisor相关字段。
 */

  ratioDivisors: NumericRatioDivisors;  
  /**
 * numericStatBreakdowns：numericStatBreakdown相关字段。
 */

  numericStatBreakdowns: NumericStatBreakdownMap;  
  /**
 * alchemySkill：炼丹技能相关字段。
 */

  alchemySkill?: PlayerState['alchemySkill'];  
  /**
 * gatherSkill：gather技能相关字段。
 */

  gatherSkill?: PlayerState['gatherSkill'];  
  /**
 * enhancementSkill：强化技能相关字段。
 */

  enhancementSkill?: PlayerState['enhancementSkill'];
}

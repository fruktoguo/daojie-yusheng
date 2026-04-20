import type { NumericRatioDivisors, NumericStatBreakdownMap, NumericStats } from './numeric';
import type { AttrBonus, Attributes } from './attribute-types';
import type { PlayerState } from './player-runtime-types';

/**
 * 低频属性详情投影，供协议层和属性面板详情消费端共用。
 */
export interface AttrDetailView {
/**
 * baseAttrs：AttrDetailView 内部字段。
 */

  baseAttrs: Attributes;  
  /**
 * bonuses：AttrDetailView 内部字段。
 */

  bonuses: AttrBonus[];  
  /**
 * finalAttrs：AttrDetailView 内部字段。
 */

  finalAttrs: Attributes;  
  /**
 * numericStats：AttrDetailView 内部字段。
 */

  numericStats: NumericStats;  
  /**
 * ratioDivisors：AttrDetailView 内部字段。
 */

  ratioDivisors: NumericRatioDivisors;  
  /**
 * numericStatBreakdowns：AttrDetailView 内部字段。
 */

  numericStatBreakdowns: NumericStatBreakdownMap;  
  /**
 * alchemySkill：AttrDetailView 内部字段。
 */

  alchemySkill?: PlayerState['alchemySkill'];  
  /**
 * gatherSkill：AttrDetailView 内部字段。
 */

  gatherSkill?: PlayerState['gatherSkill'];  
  /**
 * enhancementSkill：AttrDetailView 内部字段。
 */

  enhancementSkill?: PlayerState['enhancementSkill'];
}

import type { NumericRatioDivisors, NumericStatBreakdownMap, NumericStats } from './numeric';
import type { AttrBonus, Attributes } from './attribute-types';
import type { PlayerState } from './player-runtime-types';

/**
 * 低频属性详情投影，供协议层和属性面板详情消费端共用。
 */
export interface AttrDetailView {
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs: Attributes;
  numericStats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
  numericStatBreakdowns: NumericStatBreakdownMap;
  alchemySkill?: PlayerState['alchemySkill'];
  gatherSkill?: PlayerState['gatherSkill'];
  enhancementSkill?: PlayerState['enhancementSkill'];
}

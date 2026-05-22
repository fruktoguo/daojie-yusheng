/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
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
 * forgingSkill：炼器技能相关字段。
 */

  forgingSkill?: PlayerState['forgingSkill'];  
  /**
 * gatherSkill：gather技能相关字段。
 */

  gatherSkill?: PlayerState['gatherSkill'];  
  /**
 * enhancementSkill：强化技能相关字段。
 */

  enhancementSkill?: PlayerState['enhancementSkill'];
  /**
 * buildingSkill：营造技能相关字段。
 */

  buildingSkill?: PlayerState['buildingSkill'];
  /**
 * miningSkill：挖矿技能相关字段。
 */

  miningSkill?: PlayerState['miningSkill'];
}

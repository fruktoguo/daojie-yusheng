import type { NumericScalarStatKey, PartialNumericStats } from './numeric';
import type { QiProjectionModifier } from './qi';

/** 六维属性键。 */
export type AttrKey = 'constitution' | 'spirit' | 'perception' | 'talent' | 'comprehension' | 'luck';

/** 属性值对象。 */
export type Attributes = Record<AttrKey, number>;

/** 数值百分比配置。 */
export type NumericStatPercentages = Partial<Record<NumericScalarStatKey, number>>;

/** 属性加成来源。 */
export interface AttrBonus {
/**
 * source：AttrBonus 内部字段。
 */

  source: string;  
  /**
 * attrs：AttrBonus 内部字段。
 */

  attrs: Partial<Attributes>;  
  /**
 * stats：AttrBonus 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：AttrBonus 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * label：AttrBonus 内部字段。
 */

  label?: string;  
  /**
 * meta：AttrBonus 内部字段。
 */

  meta?: Record<string, unknown>;
}

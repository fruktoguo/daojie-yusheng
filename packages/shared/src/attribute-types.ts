import type { NumericScalarStatKey, PartialNumericStats } from './numeric';
import type { QiProjectionModifier } from './qi';

/** 六维属性键。 */
export type AttrKey = 'constitution' | 'spirit' | 'perception' | 'talent' | 'strength' | 'meridians';

/** 属性值对象。 */
export type Attributes = Record<AttrKey, number>;

/** 数值百分比配置。 */
export type NumericStatPercentages = Partial<Record<NumericScalarStatKey, number>>;

/** 属性加成来源。 */
export interface AttrBonus {
/**
 * source：来源相关字段。
 */

  source: string;  
  /**
 * attrs：attr相关字段。
 */

  attrs: Partial<Attributes>;  
  /**
 * stats：stat相关字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：qiProjection相关字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * label：label名称或显示文本。
 */

  label?: string;  
  /**
 * meta：meta相关字段。
 */

  meta?: Record<string, unknown>;
}

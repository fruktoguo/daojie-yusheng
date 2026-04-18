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
  source: string;
  attrs: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  label?: string;
  meta?: Record<string, unknown>;
}

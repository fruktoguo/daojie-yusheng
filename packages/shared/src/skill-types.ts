import type { ElementKey, NumericScalarStatKey, PartialNumericStats } from './numeric';
import type { AttrKey, Attributes } from './attribute-types';
import type { PlayerRealmStage, TechniqueRealm } from './cultivation-types';
import type { BuffSustainCostDef, EquipmentConditionGroup } from './item-runtime-types';
import type { QiProjectionModifier } from './qi';
import type { BuffCategory, BuffModifierMode, BuffVisibility, VisibleBuffState } from './world-core-types';
import type { TargetingShape } from './targeting';

/** 技能定义。 */
export type SkillDamageKind = 'physical' | 'spell';

/** 技能公式变量类型。 */
export type SkillFormulaVar =
  | 'techLevel'
  | 'targetCount'
  | 'caster.hp'
  | 'caster.maxHp'
  | 'caster.qi'
  | 'caster.maxQi'
  | 'target.debuffCount'
  | 'target.distance'
  | 'target.hp'
  | 'target.maxHp'
  | 'target.qi'
  | 'target.maxQi'
  | `caster.buff.${string}.stacks`
  | `target.buff.${string}.stacks`
  | `caster.attr.${AttrKey}`
  | `target.attr.${AttrKey}`
  | `caster.stat.${NumericScalarStatKey}`
  | `target.stat.${NumericScalarStatKey}`;

/** 技能公式（递归结构：常数/变量引用/运算表达式）。 */
export type SkillFormula =
  | number
  | {
      var: SkillFormulaVar;
      scale?: number;
    }
  | {
      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max';
      args: SkillFormula[];
    }
  | {
      op: 'clamp';
      value: SkillFormula;
      min?: SkillFormula;
      max?: SkillFormula;
    };

/** 技能目标选取定义。 */
export interface SkillTargetingDef {
  shape?: TargetingShape;
  range?: number;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  checkerParity?: 'even' | 'odd';
  maxTargets?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
}

/** 技能伤害效果定义。 */
export interface SkillDamageEffectDef {
  type: 'damage';
  damageKind?: SkillDamageKind;
  element?: ElementKey;
  formula: SkillFormula;
}

/** 技能治疗效果定义。 */
export interface SkillHealEffectDef {
  type: 'heal';
  target: 'self' | 'target' | 'allies';
  formula: SkillFormula;
}

/** 技能 Buff 效果定义。 */
export interface SkillBuffEffectDef {
  type: 'buff';
  target: 'self' | 'target' | 'allies';
  buffId: string;
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
  duration: number;
  stacks?: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: BuffSustainCostDef;
  expireWithBuffId?: string;
}

/** 怪物出生自带 Buff 配置。 */
export interface MonsterInitialBuffDef {
  type?: 'buff';
  target?: 'self';
  buffRef?: string;
  buffId: string;
  name: string;
  desc?: string;
  shortMark?: string;
  category?: BuffCategory;
  visibility?: BuffVisibility;
  color?: string;
  duration: number;
  maxStacks?: number;
  stacks?: number;
  attrs?: Partial<Attributes>;
  attrMode?: BuffModifierMode;
  stats?: PartialNumericStats;
  statMode?: BuffModifierMode;
  qiProjection?: QiProjectionModifier[];
  valueStats?: PartialNumericStats;
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: BuffSustainCostDef;
  expireWithBuffId?: string;
}

/** 技能净化效果定义。 */
export interface SkillCleanseEffectDef {
  type: 'cleanse';
  target: 'self' | 'target';
  category?: BuffCategory;
  removeCount?: number;
}

/** 技能效果联合类型。 */
export type SkillEffectDef = SkillDamageEffectDef | SkillHealEffectDef | SkillBuffEffectDef | SkillCleanseEffectDef;

/** 怪物技能前摇定义。 */
export interface SkillMonsterCastDef {
  windupTicks?: number;
  warningColor?: string;
  conditions?: EquipmentConditionGroup;
}

/** 技能完整定义。 */
export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cooldown: number;
  cost: number;
  costMultiplier?: number;
  range: number;
  targeting?: SkillTargetingDef;
  effects: SkillEffectDef[];
  unlockLevel?: number;
  unlockRealm?: TechniqueRealm;
  unlockPlayerRealm?: PlayerRealmStage;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  monsterCast?: SkillMonsterCastDef;
}

/** 临时 Buff 状态（含属性和数值加成）。 */
export interface TemporaryBuffState extends VisibleBuffState {
  baseDesc?: string;
  attrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  presentationScale?: number;
  sustainCost?: BuffSustainCostDef;
  sustainTicksElapsed?: number;
  expireWithBuffId?: string;
}

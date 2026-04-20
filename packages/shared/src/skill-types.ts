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
  /**
 * var：对象字段。
 */

      var: SkillFormulaVar;      
      /**
 * scale：对象字段。
 */

      scale?: number;
    }
  | {  
  /**
 * op：对象字段。
 */

      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max';      
      /**
 * args：对象字段。
 */

      args: SkillFormula[];
    }
  | {  
  /**
 * op：对象字段。
 */

      op: 'clamp';      
      /**
 * value：对象字段。
 */

      value: SkillFormula;      
      /**
 * min：对象字段。
 */

      min?: SkillFormula;      
      /**
 * max：对象字段。
 */

      max?: SkillFormula;
    };

/** 技能目标选取定义。 */
export interface SkillTargetingDef {
/**
 * shape：SkillTargetingDef 内部字段。
 */

  shape?: TargetingShape;  
  /**
 * range：SkillTargetingDef 内部字段。
 */

  range?: number;  
  /**
 * radius：SkillTargetingDef 内部字段。
 */

  radius?: number;  
  /**
 * innerRadius：SkillTargetingDef 内部字段。
 */

  innerRadius?: number;  
  /**
 * width：SkillTargetingDef 内部字段。
 */

  width?: number;  
  /**
 * height：SkillTargetingDef 内部字段。
 */

  height?: number;  
  /**
 * checkerParity：SkillTargetingDef 内部字段。
 */

  checkerParity?: 'even' | 'odd';  
  /**
 * maxTargets：SkillTargetingDef 内部字段。
 */

  maxTargets?: number;  
  /**
 * requiresTarget：SkillTargetingDef 内部字段。
 */

  requiresTarget?: boolean;  
  /**
 * targetMode：SkillTargetingDef 内部字段。
 */

  targetMode?: 'any' | 'entity' | 'tile';
}

/** 技能伤害效果定义。 */
export interface SkillDamageEffectDef {
/**
 * type：SkillDamageEffectDef 内部字段。
 */

  type: 'damage';  
  /**
 * damageKind：SkillDamageEffectDef 内部字段。
 */

  damageKind?: SkillDamageKind;  
  /**
 * element：SkillDamageEffectDef 内部字段。
 */

  element?: ElementKey;  
  /**
 * formula：SkillDamageEffectDef 内部字段。
 */

  formula: SkillFormula;
}

/** 技能治疗效果定义。 */
export interface SkillHealEffectDef {
/**
 * type：SkillHealEffectDef 内部字段。
 */

  type: 'heal';  
  /**
 * target：SkillHealEffectDef 内部字段。
 */

  target: 'self' | 'target' | 'allies';  
  /**
 * formula：SkillHealEffectDef 内部字段。
 */

  formula: SkillFormula;
}

/** 技能 Buff 效果定义。 */
export interface SkillBuffEffectDef {
/**
 * type：SkillBuffEffectDef 内部字段。
 */

  type: 'buff';  
  /**
 * target：SkillBuffEffectDef 内部字段。
 */

  target: 'self' | 'target' | 'allies';  
  /**
 * buffId：SkillBuffEffectDef 内部字段。
 */

  buffId: string;  
  /**
 * name：SkillBuffEffectDef 内部字段。
 */

  name: string;  
  /**
 * desc：SkillBuffEffectDef 内部字段。
 */

  desc?: string;  
  /**
 * shortMark：SkillBuffEffectDef 内部字段。
 */

  shortMark?: string;  
  /**
 * category：SkillBuffEffectDef 内部字段。
 */

  category?: BuffCategory;  
  /**
 * visibility：SkillBuffEffectDef 内部字段。
 */

  visibility?: BuffVisibility;  
  /**
 * color：SkillBuffEffectDef 内部字段。
 */

  color?: string;  
  /**
 * duration：SkillBuffEffectDef 内部字段。
 */

  duration: number;  
  /**
 * stacks：SkillBuffEffectDef 内部字段。
 */

  stacks?: number;  
  /**
 * maxStacks：SkillBuffEffectDef 内部字段。
 */

  maxStacks?: number;  
  /**
 * attrs：SkillBuffEffectDef 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：SkillBuffEffectDef 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * qiProjection：SkillBuffEffectDef 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * valueStats：SkillBuffEffectDef 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：SkillBuffEffectDef 内部字段。
 */

  presentationScale?: number;  
  /**
 * infiniteDuration：SkillBuffEffectDef 内部字段。
 */

  infiniteDuration?: boolean;  
  /**
 * sustainCost：SkillBuffEffectDef 内部字段。
 */

  sustainCost?: BuffSustainCostDef;  
  /**
 * expireWithBuffId：SkillBuffEffectDef 内部字段。
 */

  expireWithBuffId?: string;
}

/** 怪物出生自带 Buff 配置。 */
export interface MonsterInitialBuffDef {
/**
 * type：MonsterInitialBuffDef 内部字段。
 */

  type?: 'buff';  
  /**
 * target：MonsterInitialBuffDef 内部字段。
 */

  target?: 'self';  
  /**
 * buffRef：MonsterInitialBuffDef 内部字段。
 */

  buffRef?: string;  
  /**
 * buffId：MonsterInitialBuffDef 内部字段。
 */

  buffId: string;  
  /**
 * name：MonsterInitialBuffDef 内部字段。
 */

  name: string;  
  /**
 * desc：MonsterInitialBuffDef 内部字段。
 */

  desc?: string;  
  /**
 * shortMark：MonsterInitialBuffDef 内部字段。
 */

  shortMark?: string;  
  /**
 * category：MonsterInitialBuffDef 内部字段。
 */

  category?: BuffCategory;  
  /**
 * visibility：MonsterInitialBuffDef 内部字段。
 */

  visibility?: BuffVisibility;  
  /**
 * color：MonsterInitialBuffDef 内部字段。
 */

  color?: string;  
  /**
 * duration：MonsterInitialBuffDef 内部字段。
 */

  duration: number;  
  /**
 * maxStacks：MonsterInitialBuffDef 内部字段。
 */

  maxStacks?: number;  
  /**
 * stacks：MonsterInitialBuffDef 内部字段。
 */

  stacks?: number;  
  /**
 * attrs：MonsterInitialBuffDef 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * attrMode：MonsterInitialBuffDef 内部字段。
 */

  attrMode?: BuffModifierMode;  
  /**
 * stats：MonsterInitialBuffDef 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * statMode：MonsterInitialBuffDef 内部字段。
 */

  statMode?: BuffModifierMode;  
  /**
 * qiProjection：MonsterInitialBuffDef 内部字段。
 */

  qiProjection?: QiProjectionModifier[];  
  /**
 * valueStats：MonsterInitialBuffDef 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * presentationScale：MonsterInitialBuffDef 内部字段。
 */

  presentationScale?: number;  
  /**
 * infiniteDuration：MonsterInitialBuffDef 内部字段。
 */

  infiniteDuration?: boolean;  
  /**
 * sustainCost：MonsterInitialBuffDef 内部字段。
 */

  sustainCost?: BuffSustainCostDef;  
  /**
 * expireWithBuffId：MonsterInitialBuffDef 内部字段。
 */

  expireWithBuffId?: string;
}

/** 技能净化效果定义。 */
export interface SkillCleanseEffectDef {
/**
 * type：SkillCleanseEffectDef 内部字段。
 */

  type: 'cleanse';  
  /**
 * target：SkillCleanseEffectDef 内部字段。
 */

  target: 'self' | 'target';  
  /**
 * category：SkillCleanseEffectDef 内部字段。
 */

  category?: BuffCategory;  
  /**
 * removeCount：SkillCleanseEffectDef 内部字段。
 */

  removeCount?: number;
}

/** 技能效果联合类型。 */
export type SkillEffectDef = SkillDamageEffectDef | SkillHealEffectDef | SkillBuffEffectDef | SkillCleanseEffectDef;

/** 怪物技能前摇定义。 */
export interface SkillMonsterCastDef {
/**
 * windupTicks：SkillMonsterCastDef 内部字段。
 */

  windupTicks?: number;  
  /**
 * warningColor：SkillMonsterCastDef 内部字段。
 */

  warningColor?: string;  
  /**
 * conditions：SkillMonsterCastDef 内部字段。
 */

  conditions?: EquipmentConditionGroup;
}

/** 技能完整定义。 */
export interface SkillDef {
/**
 * id：SkillDef 内部字段。
 */

  id: string;  
  /**
 * name：SkillDef 内部字段。
 */

  name: string;  
  /**
 * desc：SkillDef 内部字段。
 */

  desc: string;  
  /**
 * cooldown：SkillDef 内部字段。
 */

  cooldown: number;  
  /**
 * cost：SkillDef 内部字段。
 */

  cost: number;  
  /**
 * costMultiplier：SkillDef 内部字段。
 */

  costMultiplier?: number;  
  /**
 * range：SkillDef 内部字段。
 */

  range: number;  
  /**
 * targeting：SkillDef 内部字段。
 */

  targeting?: SkillTargetingDef;  
  /**
 * effects：SkillDef 内部字段。
 */

  effects: SkillEffectDef[];  
  /**
 * unlockLevel：SkillDef 内部字段。
 */

  unlockLevel?: number;  
  /**
 * unlockRealm：SkillDef 内部字段。
 */

  unlockRealm?: TechniqueRealm;  
  /**
 * unlockPlayerRealm：SkillDef 内部字段。
 */

  unlockPlayerRealm?: PlayerRealmStage;  
  /**
 * requiresTarget：SkillDef 内部字段。
 */

  requiresTarget?: boolean;  
  /**
 * targetMode：SkillDef 内部字段。
 */

  targetMode?: 'any' | 'entity' | 'tile';  
  /**
 * monsterCast：SkillDef 内部字段。
 */

  monsterCast?: SkillMonsterCastDef;
}

/** 临时 Buff 状态（含属性和数值加成）。 */
export interface TemporaryBuffState extends VisibleBuffState {
/**
 * baseDesc：TemporaryBuffState 内部字段。
 */

  baseDesc?: string;  
  /**
 * attrs：TemporaryBuffState 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * stats：TemporaryBuffState 内部字段。
 */

  stats?: PartialNumericStats;  
  /**
 * presentationScale：TemporaryBuffState 内部字段。
 */

  presentationScale?: number;  
  /**
 * sustainCost：TemporaryBuffState 内部字段。
 */

  sustainCost?: BuffSustainCostDef;  
  /**
 * sustainTicksElapsed：TemporaryBuffState 内部字段。
 */

  sustainTicksElapsed?: number;  
  /**
 * expireWithBuffId：TemporaryBuffState 内部字段。
 */

  expireWithBuffId?: string;
}

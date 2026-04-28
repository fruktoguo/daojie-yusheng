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
 * var：var相关字段。
 */

      var: SkillFormulaVar;
      /**
 * scale：scale相关字段。
 */

      scale?: number;
    }
  | {
  /**
 * op：op相关字段。
 */

      op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max';
      /**
 * args：arg相关字段。
 */

      args: SkillFormula[];
    }
  | {
  /**
 * op：op相关字段。
 */

      op: 'clamp';
      /**
 * value：值数值。
 */

      value: SkillFormula;
      /**
 * min：min相关字段。
 */

      min?: SkillFormula;
      /**
 * max：max相关字段。
 */

      max?: SkillFormula;
    };

/** 技能目标选取定义。 */
export interface SkillTargetingDef {
/**
 * shape：shape相关字段。
 */

  shape?: TargetingShape;
  /**
 * range：范围相关字段。
 */

  range?: number;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
  /**
 * innerRadius：innerRadiu相关字段。
 */

  innerRadius?: number;
  /**
 * width：width相关字段。
 */

  width?: number;
  /**
 * height：height相关字段。
 */

  height?: number;
  /**
 * checkerParity：checkerParity相关字段。
 */

  checkerParity?: 'even' | 'odd';
  /**
 * maxTargets：max目标相关字段。
 */

  maxTargets?: number;
  /**
 * requiresTarget：require目标相关字段。
 */

  requiresTarget?: boolean;
  /**
 * targetMode：目标Mode相关字段。
 */

  targetMode?: 'any' | 'entity' | 'tile';
}

/** 技能伤害效果定义。 */
export interface SkillDamageEffectDef {
/**
 * type：type相关字段。
 */

  type: 'damage';
  /**
 * damageKind：damageKind相关字段。
 */

  damageKind?: SkillDamageKind;
  /**
 * element：element相关字段。
 */

  element?: ElementKey;
  /**
 * formula：formula相关字段。
 */

  formula: SkillFormula;
}

/** 技能治疗效果定义。 */
export interface SkillHealEffectDef {
/**
 * type：type相关字段。
 */

  type: 'heal';
  /**
 * target：目标相关字段。
 */

  target: 'self' | 'target' | 'allies';
  /**
 * formula：formula相关字段。
 */

  formula: SkillFormula;
}

/** 技能 Buff 效果定义。 */
export interface SkillBuffEffectDef {
/**
 * type：type相关字段。
 */

  type: 'buff';
  /**
 * target：目标相关字段。
 */

  target: 'self' | 'target' | 'allies';
  /**
 * buffId：buffID标识。
 */

  buffId: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * shortMark：shortMark相关字段。
 */

  shortMark?: string;
  /**
 * category：category相关字段。
 */

  category?: BuffCategory;
  /**
 * visibility：可见性相关字段。
 */

  visibility?: BuffVisibility;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * duration：duration相关字段。
 */

  duration: number;
  /**
 * stacks：stack相关字段。
 */

  stacks?: number;
  /**
 * maxStacks：maxStack相关字段。
 */

  maxStacks?: number;
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * stats：stat相关字段。
 */

  stats?: PartialNumericStats;
  /**
 * qiProjection：qiProjection相关字段。
 */

  qiProjection?: QiProjectionModifier[];
  /**
 * valueStats：值Stat相关字段。
 */

  valueStats?: PartialNumericStats;
  /**
 * presentationScale：presentationScale相关字段。
 */

  presentationScale?: number;
  /**
 * infiniteDuration：infiniteDuration相关字段。
 */

  infiniteDuration?: boolean;
  /**
 * sustainCost：sustain消耗数值。
 */

  sustainCost?: BuffSustainCostDef;
  /**
 * expireWithBuffId：expireWithBuffID标识。
 */

  expireWithBuffId?: string;
}

/** 怪物出生自带 Buff 配置。 */
export interface MonsterInitialBuffDef {
/**
 * type：type相关字段。
 */

  type?: 'buff';
  /**
 * target：目标相关字段。
 */

  target?: 'self';
  /**
 * buffRef：buffRef相关字段。
 */

  buffRef?: string;
  /**
 * buffId：buffID标识。
 */

  buffId: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * desc：desc相关字段。
 */

  desc?: string;
  /**
 * shortMark：shortMark相关字段。
 */

  shortMark?: string;
  /**
 * category：category相关字段。
 */

  category?: BuffCategory;
  /**
 * visibility：可见性相关字段。
 */

  visibility?: BuffVisibility;
  /**
 * color：color相关字段。
 */

  color?: string;
  /**
 * duration：duration相关字段。
 */

  duration: number;
  /**
 * maxStacks：maxStack相关字段。
 */

  maxStacks?: number;
  /**
 * stacks：stack相关字段。
 */

  stacks?: number;
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * attrMode：attrMode相关字段。
 */

  attrMode?: BuffModifierMode;
  /**
 * stats：stat相关字段。
 */

  stats?: PartialNumericStats;
  /**
 * statMode：statMode相关字段。
 */

  statMode?: BuffModifierMode;
  /**
 * qiProjection：qiProjection相关字段。
 */

  qiProjection?: QiProjectionModifier[];
  /**
 * valueStats：值Stat相关字段。
 */

  valueStats?: PartialNumericStats;
  /**
 * presentationScale：presentationScale相关字段。
 */

  presentationScale?: number;
  /**
 * infiniteDuration：infiniteDuration相关字段。
 */

  infiniteDuration?: boolean;
  /**
 * sustainCost：sustain消耗数值。
 */

  sustainCost?: BuffSustainCostDef;
  /**
 * expireWithBuffId：expireWithBuffID标识。
 */

  expireWithBuffId?: string;
}

/** 技能净化效果定义。 */
export interface SkillCleanseEffectDef {
/**
 * type：type相关字段。
 */

  type: 'cleanse';
  /**
 * target：目标相关字段。
 */

  target: 'self' | 'target';
  /**
 * category：category相关字段。
 */

  category?: BuffCategory;
  /**
 * removeCount：数量或计量字段。
 */

  removeCount?: number;
}

/** 技能临时地块生成效果定义。 */
export interface SkillTemporaryTileEffectDef {
/**
 * type：type相关字段。
 */

  type: 'temporary_tile';
  /**
 * tileType：tileType相关字段。
 */

  tileType: string;
  /**
 * durationTicks：持续 tick 数。
 */

  durationTicks: number;
  /**
 * hpFormula：临时地块生命公式。
 */

  hpFormula: SkillFormula;
  /**
 * excludeAnchor：是否排除锚点格。
 */

  excludeAnchor?: boolean;
}

/** 技能效果联合类型。 */
export type SkillEffectDef = SkillDamageEffectDef | SkillHealEffectDef | SkillBuffEffectDef | SkillCleanseEffectDef | SkillTemporaryTileEffectDef;

/** 怪物技能前摇定义。 */
export interface SkillMonsterCastDef {
/**
 * windupTicks：winduptick相关字段。
 */

  windupTicks?: number;
  /**
 * warningColor：warningColor相关字段。
 */

  warningColor?: string;
  /**
 * conditions：condition相关字段。
 */

  conditions?: EquipmentConditionGroup;
}

/** 玩家技能吟唱定义。 */
export interface SkillPlayerCastDef {
/**
 * windupTicks：吟唱 tick 数。
 */

  windupTicks?: number;
  /**
 * warningColor：吟唱警示颜色。
 */

  warningColor?: string;
}

/** 技能完整定义。 */
export interface SkillDef {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * desc：desc相关字段。
 */

  desc: string;
  /**
 * cooldown：冷却相关字段。
 */

  cooldown: number;
  /**
 * cost：消耗数值。
 */

  cost: number;
  /**
 * costMultiplier：消耗Multiplier相关字段。
 */

  costMultiplier?: number;
  /**
 * range：范围相关字段。
 */

  range: number;
  /**
 * targeting：targeting相关字段。
 */

  targeting?: SkillTargetingDef;
  /**
 * effects：effect相关字段。
 */

  effects: SkillEffectDef[];
  /**
 * unlockLevel：unlock等级数值。
 */

  unlockLevel?: number;
  /**
 * unlockRealm：unlockRealm相关字段。
 */

  unlockRealm?: TechniqueRealm;
  /**
 * unlockPlayerRealm：unlock玩家Realm相关字段。
 */

  unlockPlayerRealm?: PlayerRealmStage;
  /**
 * requiresTarget：require目标相关字段。
 */

  requiresTarget?: boolean;
  /**
 * targetMode：目标Mode相关字段。
 */

  targetMode?: 'any' | 'entity' | 'tile';
  /**
 * playerCast：玩家吟唱表现相关字段。
 */

  playerCast?: SkillPlayerCastDef;
  /**
 * monsterCast：怪物Cast相关字段。
 */

  monsterCast?: SkillMonsterCastDef;
}

/** 临时 Buff 状态（含属性和数值加成）。 */
export interface TemporaryBuffState extends VisibleBuffState {
/**
 * baseDesc：baseDesc相关字段。
 */

  baseDesc?: string;
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * stats：stat相关字段。
 */

  stats?: PartialNumericStats;
  /**
 * presentationScale：presentationScale相关字段。
 */

  presentationScale?: number;
  /**
 * sustainCost：sustain消耗数值。
 */

  sustainCost?: BuffSustainCostDef;
  /**
 * sustainTicksElapsed：sustaintickElapsed相关字段。
 */

  sustainTicksElapsed?: number;
  /**
 * expireWithBuffId：expireWithBuffID标识。
 */

  expireWithBuffId?: string;
}

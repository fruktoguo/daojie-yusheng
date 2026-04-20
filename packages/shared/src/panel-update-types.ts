import type { BodyTrainingState, PlayerRealmStage, PlayerSpecialStats, TechniqueCategory, TechniqueGrade, TechniqueLayerDef, TechniqueRealm, TechniqueState } from './cultivation-types';
import type { ActionType } from './action-combat-types';
import type { AttrBonus, Attributes } from './attribute-types';
import type { SkillDef } from './skill-types';
import type { AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules } from './automation-types';
import type { PlayerState } from './player-runtime-types';
import type { VisibleBuffState } from './world-core-types';
import type { NumericRatioDivisors, NumericStatBreakdownMap, NumericStats } from './numeric';

/**
 * 面板局部更新条目与低频属性更新视图。
 */

/** 属性面板低频更新视图。 */
export interface AttrUpdateView {
/**
 * baseAttrs：baseAttr相关字段。
 */

  baseAttrs?: Attributes;  
  /**
 * bonuses：bonuse相关字段。
 */

  bonuses?: AttrBonus[];  
  /**
 * finalAttrs：finalAttr相关字段。
 */

  finalAttrs?: Attributes;  
  /**
 * numericStats：numericStat相关字段。
 */

  numericStats?: NumericStats;  
  /**
 * ratioDivisors：ratioDivisor相关字段。
 */

  ratioDivisors?: NumericRatioDivisors;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * specialStats：specialStat相关字段。
 */

  specialStats?: PlayerSpecialStats;  
  /**
 * boneAgeBaseYears：boneAgeBaseYear相关字段。
 */

  boneAgeBaseYears?: number;  
  /**
 * lifeElapsedTicks：lifeElapsedtick相关字段。
 */

  lifeElapsedTicks?: number;  
  /**
 * lifespanYears：lifespanYear相关字段。
 */

  lifespanYears?: number | null;  
  /**
 * realmProgress：realm进度状态或数据块。
 */

  realmProgress?: number;  
  /**
 * realmProgressToNext：realm进度ToNext相关字段。
 */

  realmProgressToNext?: number;  
  /**
 * realmBreakthroughReady：realmBreakthroughReady相关字段。
 */

  realmBreakthroughReady?: boolean;  
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

/** 功法面板局部更新项。 */
export interface TechniqueUpdateEntryView {
/**
 * techId：techID标识。
 */

  techId: string;  
  /**
 * level：等级数值。
 */

  level?: number;  
  /**
 * exp：exp相关字段。
 */

  exp?: number;  
  /**
 * expToNext：expToNext相关字段。
 */

  expToNext?: number;  
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv?: number;  
  /**
 * realm：realm相关字段。
 */

  realm?: TechniqueRealm;  
  /**
 * skillsEnabled：启用开关或状态标识。
 */

  skillsEnabled?: boolean | null;  
  /**
 * name：名称名称或显示文本。
 */

  name?: string | null;  
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade | null;  
  /**
 * category：category相关字段。
 */

  category?: TechniqueCategory | null;  
  /**
 * skills：技能相关字段。
 */

  skills?: SkillDef[] | null;  
  /**
 * layers：层相关字段。
 */

  layers?: TechniqueLayerDef[] | null;  
  /**
 * attrCurves：attrCurve相关字段。
 */

  attrCurves?: TechniqueState['attrCurves'] | null;
}

/** 行动面板局部更新项。 */
export interface ActionUpdateEntryView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * cooldownLeft：冷却Left相关字段。
 */

  cooldownLeft?: number;  
  /**
 * autoBattleEnabled：启用开关或状态标识。
 */

  autoBattleEnabled?: boolean | null;  
  /**
 * autoBattleOrder：autoBattle订单相关字段。
 */

  autoBattleOrder?: number | null;  
  /**
 * skillEnabled：启用开关或状态标识。
 */

  skillEnabled?: boolean | null;  
  /**
 * name：名称名称或显示文本。
 */

  name?: string | null;  
  /**
 * type：type相关字段。
 */

  type?: ActionType | null;  
  /**
 * desc：desc相关字段。
 */

  desc?: string | null;  
  /**
 * range：范围相关字段。
 */

  range?: number | null;  
  /**
 * requiresTarget：require目标相关字段。
 */

  requiresTarget?: boolean | null;  
  /**
 * targetMode：目标Mode相关字段。
 */

  targetMode?: 'any' | 'entity' | 'tile' | null;
}

/** 属性面板增量视图。 */
export interface PanelAttrDeltaView extends AttrUpdateView {
/**
 * r：r相关字段。
 */

  r: number;  
  /**
 * full：full相关字段。
 */

  full?: 1;  
  /**
 * stage：stage相关字段。
 */

  stage?: PlayerRealmStage;  
  /**
 * numericStatBreakdowns：numericStatBreakdown相关字段。
 */

  numericStatBreakdowns?: NumericStatBreakdownMap;
}

/** 功法面板更新视图。 */
export interface TechniqueUpdateView {
/**
 * techniques：功法相关字段。
 */

  techniques: TechniqueUpdateEntryView[];  
  /**
 * removeTechniqueIds：remove功法ID相关字段。
 */

  removeTechniqueIds?: string[];  
  /**
 * cultivatingTechId：cultivatingTechID标识。
 */

  cultivatingTechId?: string | null;  
  /**
 * bodyTraining：bodyTraining相关字段。
 */

  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板更新视图。 */
export interface ActionsUpdateView {
/**
 * actions：action相关字段。
 */

  actions: ActionUpdateEntryView[];  
  /**
 * removeActionIds：removeActionID相关字段。
 */

  removeActionIds?: string[];  
  /**
 * actionOrder：action订单相关字段。
 */

  actionOrder?: string[];  
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle?: boolean;  
  /**
 * combatTargetId：战斗目标ID标识。
 */

  combatTargetId?: string | null;  
  /**
 * combatTargetLocked：战斗目标Locked相关字段。
 */

  combatTargetLocked?: boolean;  
  /**
 * retaliatePlayerTargetId：当前反击锁定的玩家目标。
 */

  retaliatePlayerTargetId?: string | null;  
  /**
 * autoRetaliate：autoRetaliate相关字段。
 */

  autoRetaliate?: boolean;  
  /**
 * autoBattleStationary：autoBattleStationary相关字段。
 */

  autoBattleStationary?: boolean;  
  /**
 * allowAoePlayerHit：allowAoe玩家Hit相关字段。
 */

  allowAoePlayerHit?: boolean;  
  /**
 * autoIdleCultivation：autoIdleCultivation相关字段。
 */

  autoIdleCultivation?: boolean;  
  /**
 * autoSwitchCultivation：autoSwitchCultivation相关字段。
 */

  autoSwitchCultivation?: boolean;  
  /**
 * cultivationActive：cultivation激活状态相关字段。
 */

  cultivationActive?: boolean;  
  /**
 * senseQiActive：senseQi激活状态相关字段。
 */

  senseQiActive?: boolean;
}

/** 功法面板增量视图。 */
export interface PanelTechniqueDeltaView {
/**
 * r：r相关字段。
 */

  r: number;  
  /**
 * full：full相关字段。
 */

  full?: 1;  
  /**
 * techniques：功法相关字段。
 */

  techniques?: TechniqueUpdateEntryView[];  
  /**
 * removeTechniqueIds：remove功法ID相关字段。
 */

  removeTechniqueIds?: string[];  
  /**
 * cultivatingTechId：cultivatingTechID标识。
 */

  cultivatingTechId?: string | null;  
  /**
 * bodyTraining：bodyTraining相关字段。
 */

  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板增量视图。 */
export interface PanelActionDeltaView {
/**
 * r：r相关字段。
 */

  r: number;  
  /**
 * full：full相关字段。
 */

  full?: 1;  
  /**
 * actions：action相关字段。
 */

  actions?: ActionUpdateEntryView[];  
  /**
 * removeActionIds：removeActionID相关字段。
 */

  removeActionIds?: string[];  
  /**
 * actionOrder：action订单相关字段。
 */

  actionOrder?: string[];  
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle?: boolean;  
  /**
 * autoUsePills：autoUsePill相关字段。
 */

  autoUsePills?: AutoUsePillConfig[];  
  /**
 * combatTargetingRules：战斗TargetingRule相关字段。
 */

  combatTargetingRules?: CombatTargetingRules;  
  /**
 * autoBattleTargetingMode：autoBattleTargetingMode相关字段。
 */

  autoBattleTargetingMode?: AutoBattleTargetingMode;  
  /**
 * combatTargetId：战斗目标ID标识。
 */

  combatTargetId?: string | null;  
  /**
 * combatTargetLocked：战斗目标Locked相关字段。
 */

  combatTargetLocked?: boolean;  
  /**
 * retaliatePlayerTargetId：当前反击锁定的玩家目标。
 */

  retaliatePlayerTargetId?: string | null;  
  /**
 * autoRetaliate：autoRetaliate相关字段。
 */

  autoRetaliate?: boolean;  
  /**
 * autoBattleStationary：autoBattleStationary相关字段。
 */

  autoBattleStationary?: boolean;  
  /**
 * allowAoePlayerHit：allowAoe玩家Hit相关字段。
 */

  allowAoePlayerHit?: boolean;  
  /**
 * autoIdleCultivation：autoIdleCultivation相关字段。
 */

  autoIdleCultivation?: boolean;  
  /**
 * autoSwitchCultivation：autoSwitchCultivation相关字段。
 */

  autoSwitchCultivation?: boolean;  
  /**
 * cultivationActive：cultivation激活状态相关字段。
 */

  cultivationActive?: boolean;  
  /**
 * senseQiActive：senseQi激活状态相关字段。
 */

  senseQiActive?: boolean;
}

/** Buff 面板增量视图。 */
export interface PanelBuffDeltaView {
/**
 * r：r相关字段。
 */

  r: number;  
  /**
 * full：full相关字段。
 */

  full?: 1;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];  
  /**
 * removeBuffIds：removeBuffID相关字段。
 */

  removeBuffIds?: string[];
}

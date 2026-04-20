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
 * baseAttrs：AttrUpdateView 内部字段。
 */

  baseAttrs?: Attributes;  
  /**
 * bonuses：AttrUpdateView 内部字段。
 */

  bonuses?: AttrBonus[];  
  /**
 * finalAttrs：AttrUpdateView 内部字段。
 */

  finalAttrs?: Attributes;  
  /**
 * numericStats：AttrUpdateView 内部字段。
 */

  numericStats?: NumericStats;  
  /**
 * ratioDivisors：AttrUpdateView 内部字段。
 */

  ratioDivisors?: NumericRatioDivisors;  
  /**
 * maxHp：AttrUpdateView 内部字段。
 */

  maxHp?: number;  
  /**
 * qi：AttrUpdateView 内部字段。
 */

  qi?: number;  
  /**
 * specialStats：AttrUpdateView 内部字段。
 */

  specialStats?: PlayerSpecialStats;  
  /**
 * boneAgeBaseYears：AttrUpdateView 内部字段。
 */

  boneAgeBaseYears?: number;  
  /**
 * lifeElapsedTicks：AttrUpdateView 内部字段。
 */

  lifeElapsedTicks?: number;  
  /**
 * lifespanYears：AttrUpdateView 内部字段。
 */

  lifespanYears?: number | null;  
  /**
 * realmProgress：AttrUpdateView 内部字段。
 */

  realmProgress?: number;  
  /**
 * realmProgressToNext：AttrUpdateView 内部字段。
 */

  realmProgressToNext?: number;  
  /**
 * realmBreakthroughReady：AttrUpdateView 内部字段。
 */

  realmBreakthroughReady?: boolean;  
  /**
 * alchemySkill：AttrUpdateView 内部字段。
 */

  alchemySkill?: PlayerState['alchemySkill'];  
  /**
 * gatherSkill：AttrUpdateView 内部字段。
 */

  gatherSkill?: PlayerState['gatherSkill'];  
  /**
 * enhancementSkill：AttrUpdateView 内部字段。
 */

  enhancementSkill?: PlayerState['enhancementSkill'];
}

/** 功法面板局部更新项。 */
export interface TechniqueUpdateEntryView {
/**
 * techId：TechniqueUpdateEntryView 内部字段。
 */

  techId: string;  
  /**
 * level：TechniqueUpdateEntryView 内部字段。
 */

  level?: number;  
  /**
 * exp：TechniqueUpdateEntryView 内部字段。
 */

  exp?: number;  
  /**
 * expToNext：TechniqueUpdateEntryView 内部字段。
 */

  expToNext?: number;  
  /**
 * realmLv：TechniqueUpdateEntryView 内部字段。
 */

  realmLv?: number;  
  /**
 * realm：TechniqueUpdateEntryView 内部字段。
 */

  realm?: TechniqueRealm;  
  /**
 * skillsEnabled：TechniqueUpdateEntryView 内部字段。
 */

  skillsEnabled?: boolean | null;  
  /**
 * name：TechniqueUpdateEntryView 内部字段。
 */

  name?: string | null;  
  /**
 * grade：TechniqueUpdateEntryView 内部字段。
 */

  grade?: TechniqueGrade | null;  
  /**
 * category：TechniqueUpdateEntryView 内部字段。
 */

  category?: TechniqueCategory | null;  
  /**
 * skills：TechniqueUpdateEntryView 内部字段。
 */

  skills?: SkillDef[] | null;  
  /**
 * layers：TechniqueUpdateEntryView 内部字段。
 */

  layers?: TechniqueLayerDef[] | null;  
  /**
 * attrCurves：TechniqueUpdateEntryView 内部字段。
 */

  attrCurves?: TechniqueState['attrCurves'] | null;
}

/** 行动面板局部更新项。 */
export interface ActionUpdateEntryView {
/**
 * id：ActionUpdateEntryView 内部字段。
 */

  id: string;  
  /**
 * cooldownLeft：ActionUpdateEntryView 内部字段。
 */

  cooldownLeft?: number;  
  /**
 * autoBattleEnabled：ActionUpdateEntryView 内部字段。
 */

  autoBattleEnabled?: boolean | null;  
  /**
 * autoBattleOrder：ActionUpdateEntryView 内部字段。
 */

  autoBattleOrder?: number | null;  
  /**
 * skillEnabled：ActionUpdateEntryView 内部字段。
 */

  skillEnabled?: boolean | null;  
  /**
 * name：ActionUpdateEntryView 内部字段。
 */

  name?: string | null;  
  /**
 * type：ActionUpdateEntryView 内部字段。
 */

  type?: ActionType | null;  
  /**
 * desc：ActionUpdateEntryView 内部字段。
 */

  desc?: string | null;  
  /**
 * range：ActionUpdateEntryView 内部字段。
 */

  range?: number | null;  
  /**
 * requiresTarget：ActionUpdateEntryView 内部字段。
 */

  requiresTarget?: boolean | null;  
  /**
 * targetMode：ActionUpdateEntryView 内部字段。
 */

  targetMode?: 'any' | 'entity' | 'tile' | null;
}

/** 属性面板增量视图。 */
export interface PanelAttrDeltaView extends AttrUpdateView {
/**
 * r：PanelAttrDeltaView 内部字段。
 */

  r: number;  
  /**
 * full：PanelAttrDeltaView 内部字段。
 */

  full?: 1;  
  /**
 * stage：PanelAttrDeltaView 内部字段。
 */

  stage?: PlayerRealmStage;  
  /**
 * numericStatBreakdowns：PanelAttrDeltaView 内部字段。
 */

  numericStatBreakdowns?: NumericStatBreakdownMap;
}

/** 功法面板更新视图。 */
export interface TechniqueUpdateView {
/**
 * techniques：TechniqueUpdateView 内部字段。
 */

  techniques: TechniqueUpdateEntryView[];  
  /**
 * removeTechniqueIds：TechniqueUpdateView 内部字段。
 */

  removeTechniqueIds?: string[];  
  /**
 * cultivatingTechId：TechniqueUpdateView 内部字段。
 */

  cultivatingTechId?: string | null;  
  /**
 * bodyTraining：TechniqueUpdateView 内部字段。
 */

  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板更新视图。 */
export interface ActionsUpdateView {
/**
 * actions：ActionsUpdateView 内部字段。
 */

  actions: ActionUpdateEntryView[];  
  /**
 * removeActionIds：ActionsUpdateView 内部字段。
 */

  removeActionIds?: string[];  
  /**
 * actionOrder：ActionsUpdateView 内部字段。
 */

  actionOrder?: string[];  
  /**
 * autoBattle：ActionsUpdateView 内部字段。
 */

  autoBattle?: boolean;  
  /**
 * combatTargetId：ActionsUpdateView 内部字段。
 */

  combatTargetId?: string | null;  
  /**
 * combatTargetLocked：ActionsUpdateView 内部字段。
 */

  combatTargetLocked?: boolean;  
  /**
 * autoRetaliate：ActionsUpdateView 内部字段。
 */

  autoRetaliate?: boolean;  
  /**
 * autoBattleStationary：ActionsUpdateView 内部字段。
 */

  autoBattleStationary?: boolean;  
  /**
 * allowAoePlayerHit：ActionsUpdateView 内部字段。
 */

  allowAoePlayerHit?: boolean;  
  /**
 * autoIdleCultivation：ActionsUpdateView 内部字段。
 */

  autoIdleCultivation?: boolean;  
  /**
 * autoSwitchCultivation：ActionsUpdateView 内部字段。
 */

  autoSwitchCultivation?: boolean;  
  /**
 * cultivationActive：ActionsUpdateView 内部字段。
 */

  cultivationActive?: boolean;  
  /**
 * senseQiActive：ActionsUpdateView 内部字段。
 */

  senseQiActive?: boolean;
}

/** 功法面板增量视图。 */
export interface PanelTechniqueDeltaView {
/**
 * r：PanelTechniqueDeltaView 内部字段。
 */

  r: number;  
  /**
 * full：PanelTechniqueDeltaView 内部字段。
 */

  full?: 1;  
  /**
 * techniques：PanelTechniqueDeltaView 内部字段。
 */

  techniques?: TechniqueUpdateEntryView[];  
  /**
 * removeTechniqueIds：PanelTechniqueDeltaView 内部字段。
 */

  removeTechniqueIds?: string[];  
  /**
 * cultivatingTechId：PanelTechniqueDeltaView 内部字段。
 */

  cultivatingTechId?: string | null;  
  /**
 * bodyTraining：PanelTechniqueDeltaView 内部字段。
 */

  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板增量视图。 */
export interface PanelActionDeltaView {
/**
 * r：PanelActionDeltaView 内部字段。
 */

  r: number;  
  /**
 * full：PanelActionDeltaView 内部字段。
 */

  full?: 1;  
  /**
 * actions：PanelActionDeltaView 内部字段。
 */

  actions?: ActionUpdateEntryView[];  
  /**
 * removeActionIds：PanelActionDeltaView 内部字段。
 */

  removeActionIds?: string[];  
  /**
 * actionOrder：PanelActionDeltaView 内部字段。
 */

  actionOrder?: string[];  
  /**
 * autoBattle：PanelActionDeltaView 内部字段。
 */

  autoBattle?: boolean;  
  /**
 * autoUsePills：PanelActionDeltaView 内部字段。
 */

  autoUsePills?: AutoUsePillConfig[];  
  /**
 * combatTargetingRules：PanelActionDeltaView 内部字段。
 */

  combatTargetingRules?: CombatTargetingRules;  
  /**
 * autoBattleTargetingMode：PanelActionDeltaView 内部字段。
 */

  autoBattleTargetingMode?: AutoBattleTargetingMode;  
  /**
 * combatTargetId：PanelActionDeltaView 内部字段。
 */

  combatTargetId?: string | null;  
  /**
 * combatTargetLocked：PanelActionDeltaView 内部字段。
 */

  combatTargetLocked?: boolean;  
  /**
 * autoRetaliate：PanelActionDeltaView 内部字段。
 */

  autoRetaliate?: boolean;  
  /**
 * autoBattleStationary：PanelActionDeltaView 内部字段。
 */

  autoBattleStationary?: boolean;  
  /**
 * allowAoePlayerHit：PanelActionDeltaView 内部字段。
 */

  allowAoePlayerHit?: boolean;  
  /**
 * autoIdleCultivation：PanelActionDeltaView 内部字段。
 */

  autoIdleCultivation?: boolean;  
  /**
 * autoSwitchCultivation：PanelActionDeltaView 内部字段。
 */

  autoSwitchCultivation?: boolean;  
  /**
 * cultivationActive：PanelActionDeltaView 内部字段。
 */

  cultivationActive?: boolean;  
  /**
 * senseQiActive：PanelActionDeltaView 内部字段。
 */

  senseQiActive?: boolean;
}

/** Buff 面板增量视图。 */
export interface PanelBuffDeltaView {
/**
 * r：PanelBuffDeltaView 内部字段。
 */

  r: number;  
  /**
 * full：PanelBuffDeltaView 内部字段。
 */

  full?: 1;  
  /**
 * buffs：PanelBuffDeltaView 内部字段。
 */

  buffs?: VisibleBuffState[];  
  /**
 * removeBuffIds：PanelBuffDeltaView 内部字段。
 */

  removeBuffIds?: string[];
}

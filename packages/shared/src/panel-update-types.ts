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
  baseAttrs?: Attributes;
  bonuses?: AttrBonus[];
  finalAttrs?: Attributes;
  numericStats?: NumericStats;
  ratioDivisors?: NumericRatioDivisors;
  maxHp?: number;
  qi?: number;
  specialStats?: PlayerSpecialStats;
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
  lifespanYears?: number | null;
  realmProgress?: number;
  realmProgressToNext?: number;
  realmBreakthroughReady?: boolean;
  alchemySkill?: PlayerState['alchemySkill'];
  gatherSkill?: PlayerState['gatherSkill'];
  enhancementSkill?: PlayerState['enhancementSkill'];
}

/** 功法面板局部更新项。 */
export interface TechniqueUpdateEntryView {
  techId: string;
  level?: number;
  exp?: number;
  expToNext?: number;
  realmLv?: number;
  realm?: TechniqueRealm;
  skillsEnabled?: boolean | null;
  name?: string | null;
  grade?: TechniqueGrade | null;
  category?: TechniqueCategory | null;
  skills?: SkillDef[] | null;
  layers?: TechniqueLayerDef[] | null;
  attrCurves?: TechniqueState['attrCurves'] | null;
}

/** 行动面板局部更新项。 */
export interface ActionUpdateEntryView {
  id: string;
  cooldownLeft?: number;
  autoBattleEnabled?: boolean | null;
  autoBattleOrder?: number | null;
  skillEnabled?: boolean | null;
  name?: string | null;
  type?: ActionType | null;
  desc?: string | null;
  range?: number | null;
  requiresTarget?: boolean | null;
  targetMode?: 'any' | 'entity' | 'tile' | null;
}

/** 属性面板增量视图。 */
export interface PanelAttrDeltaView extends AttrUpdateView {
  r: number;
  full?: 1;
  stage?: PlayerRealmStage;
  numericStatBreakdowns?: NumericStatBreakdownMap;
}

/** 功法面板更新视图。 */
export interface TechniqueUpdateView {
  techniques: TechniqueUpdateEntryView[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板更新视图。 */
export interface ActionsUpdateView {
  actions: ActionUpdateEntryView[];
  removeActionIds?: string[];
  actionOrder?: string[];
  autoBattle?: boolean;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  cultivationActive?: boolean;
  senseQiActive?: boolean;
}

/** 功法面板增量视图。 */
export interface PanelTechniqueDeltaView {
  r: number;
  full?: 1;
  techniques?: TechniqueUpdateEntryView[];
  removeTechniqueIds?: string[];
  cultivatingTechId?: string | null;
  bodyTraining?: BodyTrainingState | null;
}

/** 行动面板增量视图。 */
export interface PanelActionDeltaView {
  r: number;
  full?: 1;
  actions?: ActionUpdateEntryView[];
  removeActionIds?: string[];
  actionOrder?: string[];
  autoBattle?: boolean;
  autoUsePills?: AutoUsePillConfig[];
  combatTargetingRules?: CombatTargetingRules;
  autoBattleTargetingMode?: AutoBattleTargetingMode;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  cultivationActive?: boolean;
  senseQiActive?: boolean;
}

/** Buff 面板增量视图。 */
export interface PanelBuffDeltaView {
  r: number;
  full?: 1;
  buffs?: VisibleBuffState[];
  removeBuffIds?: string[];
}

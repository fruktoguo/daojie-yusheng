import type { NumericRatioDivisors, NumericStats } from './numeric';
import type { ActionDef } from './action-combat-types';
import type { AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules } from './automation-types';
import type { BodyTrainingState, HeavenGateRootValues, HeavenGateState, PlayerRealmState, TechniqueState } from './cultivation-types';
import type { AlchemySkillState, PlayerAlchemyJob, PlayerAlchemyPreset, PlayerEnhancementJob, PlayerEnhancementRecord } from './crafting-types';
import type { EquipmentSlots, Inventory } from './item-runtime-types';
import type { MarketStorage } from './market-types';
import type { PendingLogbookMessage, QuestNavigationState, QuestState } from './quest-types';
import type { TemporaryBuffState } from './skill-types';
import type { AttrBonus, Attributes } from './attribute-types';
import type { Direction } from './world-core-types';

/** 玩家状态。 */
export interface PlayerState {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: string;  
  /**
 * isBot：启用开关或状态标识。
 */

  isBot?: boolean;  
  /**
 * online：online相关字段。
 */

  online?: boolean;  
  /**
 * inWorld：in世界相关字段。
 */

  inWorld?: boolean;  
  /**
 * lastHeartbeatAt：lastHeartbeatAt相关字段。
 */

  lastHeartbeatAt?: number;  
  /**
 * offlineSinceAt：offlineSinceAt相关字段。
 */

  offlineSinceAt?: number;  
  /**
 * senseQiActive：senseQi激活状态相关字段。
 */

  senseQiActive?: boolean;  
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
 * realmLv：realmLv相关字段。
 */

  realmLv?: number;  
  /**
 * realmName：realm名称名称或显示文本。
 */

  realmName?: string;  
  /**
 * realmStage：realmStage相关字段。
 */

  realmStage?: string;  
  /**
 * realmReview：realmReview相关字段。
 */

  realmReview?: string;  
  /**
 * breakthroughReady：breakthroughReady相关字段。
 */

  breakthroughReady?: boolean;  
  /**
 * heavenGate：heavenGate相关字段。
 */

  heavenGate?: HeavenGateState | null;  
  /**
 * spiritualRoots：spiritual根容器相关字段。
 */

  spiritualRoots?: HeavenGateRootValues | null;  
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
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * facing：facing相关字段。
 */

  facing: Direction;  
  /**
 * viewRange：视图范围相关字段。
 */

  viewRange: number;  
  /**
 * hp：hp相关字段。
 */

  hp: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp: number;  
  /**
 * qi：qi相关字段。
 */

  qi: number;  
  /**
 * dead：dead相关字段。
 */

  dead: boolean;  
  /**
 * foundation：foundation相关字段。
 */

  foundation?: number;  
  /**
 * combatExp：战斗Exp相关字段。
 */

  combatExp?: number;  
  /**
 * baseAttrs：baseAttr相关字段。
 */

  baseAttrs: Attributes;  
  /**
 * bonuses：bonuse相关字段。
 */

  bonuses: AttrBonus[];  
  /**
 * temporaryBuffs：temporaryBuff相关字段。
 */

  temporaryBuffs?: TemporaryBuffState[];  
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
 * inventory：背包相关字段。
 */

  inventory: Inventory;  
  /**
 * marketStorage：坊市Storage相关字段。
 */

  marketStorage?: MarketStorage;  
  /**
 * equipment：装备相关字段。
 */

  equipment: EquipmentSlots;  
  /**
 * techniques：功法相关字段。
 */

  techniques: TechniqueState[];  
  /**
 * bodyTraining：bodyTraining相关字段。
 */

  bodyTraining?: BodyTrainingState;  
  /**
 * actions：action相关字段。
 */

  actions: ActionDef[];  
  /**
 * quests：集合字段。
 */

  quests: QuestState[];  
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle: boolean;  
  /**
 * autoBattleSkills：autoBattle技能相关字段。
 */

  autoBattleSkills: AutoBattleSkillConfig[];  
  /**
 * autoUsePills：autoUsePill相关字段。
 */

  autoUsePills: AutoUsePillConfig[];  
  /**
 * combatTargetingRules：战斗TargetingRule相关字段。
 */

  combatTargetingRules?: CombatTargetingRules;  
  /**
 * autoBattleTargetingMode：autoBattleTargetingMode相关字段。
 */

  autoBattleTargetingMode: AutoBattleTargetingMode;  
  /**
 * combatTargetId：战斗目标ID标识。
 */

  combatTargetId?: string;  
  /**
 * combatTargetLocked：战斗目标Locked相关字段。
 */

  combatTargetLocked?: boolean;  
  /**
 * cultivatingTechId：cultivatingTechID标识。
 */

  cultivatingTechId?: string;  
  /**
 * pendingLogbookMessages：pendingLogbookMessage相关字段。
 */

  pendingLogbookMessages?: PendingLogbookMessage[];  
  /**
 * idleTicks：idletick相关字段。
 */

  idleTicks?: number;  
  /**
 * revealedBreakthroughRequirementIds：revealedBreakthroughRequirementID相关字段。
 */

  revealedBreakthroughRequirementIds?: string[];  
  /**
 * unlockedMinimapIds：unlockedMinimapID相关字段。
 */

  unlockedMinimapIds?: string[];  
  /**
 * realm：realm相关字段。
 */

  realm?: PlayerRealmState;  
  /**
 * questNavigation：任务导航相关字段。
 */

  questNavigation?: QuestNavigationState;  
  /**
 * questCrossMapNavCooldownUntilLifeTicks：任务Cross地图Nav冷却UntilLifetick相关字段。
 */

  questCrossMapNavCooldownUntilLifeTicks?: number;  
  /**
 * alchemySkill：炼丹技能相关字段。
 */

  alchemySkill?: AlchemySkillState;  
  /**
 * gatherSkill：gather技能相关字段。
 */

  gatherSkill?: AlchemySkillState;  
  /**
 * alchemyPresets：炼丹Preset相关字段。
 */

  alchemyPresets?: PlayerAlchemyPreset[];  
  /**
 * alchemyJob：炼丹Job相关字段。
 */

  alchemyJob?: PlayerAlchemyJob | null;  
  /**
 * enhancementSkill：强化技能相关字段。
 */

  enhancementSkill?: AlchemySkillState;  
  /**
 * enhancementSkillLevel：强化技能等级数值。
 */

  enhancementSkillLevel?: number;  
  /**
 * enhancementJob：强化Job相关字段。
 */

  enhancementJob?: PlayerEnhancementJob | null;  
  /**
 * enhancementRecords：强化Record相关字段。
 */

  enhancementRecords?: PlayerEnhancementRecord[];
}

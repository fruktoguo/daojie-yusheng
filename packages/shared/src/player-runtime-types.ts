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
 * id：PlayerState 内部字段。
 */

  id: string;  
  /**
 * name：PlayerState 内部字段。
 */

  name: string;  
  /**
 * displayName：PlayerState 内部字段。
 */

  displayName?: string;  
  /**
 * isBot：PlayerState 内部字段。
 */

  isBot?: boolean;  
  /**
 * online：PlayerState 内部字段。
 */

  online?: boolean;  
  /**
 * inWorld：PlayerState 内部字段。
 */

  inWorld?: boolean;  
  /**
 * lastHeartbeatAt：PlayerState 内部字段。
 */

  lastHeartbeatAt?: number;  
  /**
 * offlineSinceAt：PlayerState 内部字段。
 */

  offlineSinceAt?: number;  
  /**
 * senseQiActive：PlayerState 内部字段。
 */

  senseQiActive?: boolean;  
  /**
 * autoRetaliate：PlayerState 内部字段。
 */

  autoRetaliate?: boolean;  
  /**
 * autoBattleStationary：PlayerState 内部字段。
 */

  autoBattleStationary?: boolean;  
  /**
 * allowAoePlayerHit：PlayerState 内部字段。
 */

  allowAoePlayerHit?: boolean;  
  /**
 * autoIdleCultivation：PlayerState 内部字段。
 */

  autoIdleCultivation?: boolean;  
  /**
 * autoSwitchCultivation：PlayerState 内部字段。
 */

  autoSwitchCultivation?: boolean;  
  /**
 * cultivationActive：PlayerState 内部字段。
 */

  cultivationActive?: boolean;  
  /**
 * realmLv：PlayerState 内部字段。
 */

  realmLv?: number;  
  /**
 * realmName：PlayerState 内部字段。
 */

  realmName?: string;  
  /**
 * realmStage：PlayerState 内部字段。
 */

  realmStage?: string;  
  /**
 * realmReview：PlayerState 内部字段。
 */

  realmReview?: string;  
  /**
 * breakthroughReady：PlayerState 内部字段。
 */

  breakthroughReady?: boolean;  
  /**
 * heavenGate：PlayerState 内部字段。
 */

  heavenGate?: HeavenGateState | null;  
  /**
 * spiritualRoots：PlayerState 内部字段。
 */

  spiritualRoots?: HeavenGateRootValues | null;  
  /**
 * boneAgeBaseYears：PlayerState 内部字段。
 */

  boneAgeBaseYears?: number;  
  /**
 * lifeElapsedTicks：PlayerState 内部字段。
 */

  lifeElapsedTicks?: number;  
  /**
 * lifespanYears：PlayerState 内部字段。
 */

  lifespanYears?: number | null;  
  /**
 * mapId：PlayerState 内部字段。
 */

  mapId: string;  
  /**
 * x：PlayerState 内部字段。
 */

  x: number;  
  /**
 * y：PlayerState 内部字段。
 */

  y: number;  
  /**
 * facing：PlayerState 内部字段。
 */

  facing: Direction;  
  /**
 * viewRange：PlayerState 内部字段。
 */

  viewRange: number;  
  /**
 * hp：PlayerState 内部字段。
 */

  hp: number;  
  /**
 * maxHp：PlayerState 内部字段。
 */

  maxHp: number;  
  /**
 * qi：PlayerState 内部字段。
 */

  qi: number;  
  /**
 * dead：PlayerState 内部字段。
 */

  dead: boolean;  
  /**
 * foundation：PlayerState 内部字段。
 */

  foundation?: number;  
  /**
 * combatExp：PlayerState 内部字段。
 */

  combatExp?: number;  
  /**
 * baseAttrs：PlayerState 内部字段。
 */

  baseAttrs: Attributes;  
  /**
 * bonuses：PlayerState 内部字段。
 */

  bonuses: AttrBonus[];  
  /**
 * temporaryBuffs：PlayerState 内部字段。
 */

  temporaryBuffs?: TemporaryBuffState[];  
  /**
 * finalAttrs：PlayerState 内部字段。
 */

  finalAttrs?: Attributes;  
  /**
 * numericStats：PlayerState 内部字段。
 */

  numericStats?: NumericStats;  
  /**
 * ratioDivisors：PlayerState 内部字段。
 */

  ratioDivisors?: NumericRatioDivisors;  
  /**
 * inventory：PlayerState 内部字段。
 */

  inventory: Inventory;  
  /**
 * marketStorage：PlayerState 内部字段。
 */

  marketStorage?: MarketStorage;  
  /**
 * equipment：PlayerState 内部字段。
 */

  equipment: EquipmentSlots;  
  /**
 * techniques：PlayerState 内部字段。
 */

  techniques: TechniqueState[];  
  /**
 * bodyTraining：PlayerState 内部字段。
 */

  bodyTraining?: BodyTrainingState;  
  /**
 * actions：PlayerState 内部字段。
 */

  actions: ActionDef[];  
  /**
 * quests：PlayerState 内部字段。
 */

  quests: QuestState[];  
  /**
 * autoBattle：PlayerState 内部字段。
 */

  autoBattle: boolean;  
  /**
 * autoBattleSkills：PlayerState 内部字段。
 */

  autoBattleSkills: AutoBattleSkillConfig[];  
  /**
 * autoUsePills：PlayerState 内部字段。
 */

  autoUsePills: AutoUsePillConfig[];  
  /**
 * combatTargetingRules：PlayerState 内部字段。
 */

  combatTargetingRules?: CombatTargetingRules;  
  /**
 * autoBattleTargetingMode：PlayerState 内部字段。
 */

  autoBattleTargetingMode: AutoBattleTargetingMode;  
  /**
 * combatTargetId：PlayerState 内部字段。
 */

  combatTargetId?: string;  
  /**
 * combatTargetLocked：PlayerState 内部字段。
 */

  combatTargetLocked?: boolean;  
  /**
 * cultivatingTechId：PlayerState 内部字段。
 */

  cultivatingTechId?: string;  
  /**
 * pendingLogbookMessages：PlayerState 内部字段。
 */

  pendingLogbookMessages?: PendingLogbookMessage[];  
  /**
 * idleTicks：PlayerState 内部字段。
 */

  idleTicks?: number;  
  /**
 * revealedBreakthroughRequirementIds：PlayerState 内部字段。
 */

  revealedBreakthroughRequirementIds?: string[];  
  /**
 * unlockedMinimapIds：PlayerState 内部字段。
 */

  unlockedMinimapIds?: string[];  
  /**
 * realm：PlayerState 内部字段。
 */

  realm?: PlayerRealmState;  
  /**
 * questNavigation：PlayerState 内部字段。
 */

  questNavigation?: QuestNavigationState;  
  /**
 * questCrossMapNavCooldownUntilLifeTicks：PlayerState 内部字段。
 */

  questCrossMapNavCooldownUntilLifeTicks?: number;  
  /**
 * alchemySkill：PlayerState 内部字段。
 */

  alchemySkill?: AlchemySkillState;  
  /**
 * gatherSkill：PlayerState 内部字段。
 */

  gatherSkill?: AlchemySkillState;  
  /**
 * alchemyPresets：PlayerState 内部字段。
 */

  alchemyPresets?: PlayerAlchemyPreset[];  
  /**
 * alchemyJob：PlayerState 内部字段。
 */

  alchemyJob?: PlayerAlchemyJob | null;  
  /**
 * enhancementSkill：PlayerState 内部字段。
 */

  enhancementSkill?: AlchemySkillState;  
  /**
 * enhancementSkillLevel：PlayerState 内部字段。
 */

  enhancementSkillLevel?: number;  
  /**
 * enhancementJob：PlayerState 内部字段。
 */

  enhancementJob?: PlayerEnhancementJob | null;  
  /**
 * enhancementRecords：PlayerState 内部字段。
 */

  enhancementRecords?: PlayerEnhancementRecord[];
}

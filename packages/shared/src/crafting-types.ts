/**
 * 炼制与强化共享类型：承接面板、任务运行态与同步视图结构。
 */
import type { TechniqueGrade } from './cultivation-types';
import type { EquipSlot, ItemStack } from './item-runtime-types';

/** 炼制技能的经验与等级运行态。 */
export interface AlchemySkillState {
/**
 * level：AlchemySkillState 内部字段。
 */

  level: number;  
  /**
 * exp：AlchemySkillState 内部字段。
 */

  exp: number;  
  /**
 * expToNext：AlchemySkillState 内部字段。
 */

  expToNext: number;
}

/** 炼制材料在配方中的角色。 */
export type AlchemyIngredientRole = 'main' | 'aux';

/** 玩家在炼制时实际勾选的材料数量。 */
export interface AlchemyIngredientSelection {
/**
 * itemId：AlchemyIngredientSelection 内部字段。
 */

  itemId: string;  
  /**
 * count：AlchemyIngredientSelection 内部字段。
 */

  count: number;
}

/** 配方目录里的单个材料定义。 */
export interface AlchemyRecipeIngredientDef extends AlchemyIngredientSelection {
/**
 * name：AlchemyRecipeIngredientDef 内部字段。
 */

  name: string;  
  /**
 * role：AlchemyRecipeIngredientDef 内部字段。
 */

  role: AlchemyIngredientRole;  
  /**
 * level：AlchemyRecipeIngredientDef 内部字段。
 */

  level: number;  
  /**
 * grade：AlchemyRecipeIngredientDef 内部字段。
 */

  grade: TechniqueGrade;  
  /**
 * powerPerUnit：AlchemyRecipeIngredientDef 内部字段。
 */

  powerPerUnit: number;
}

/** 炼制配方类别。 */
export type AlchemyRecipeCategory = 'recovery' | 'buff';

/** 炼制配方目录条目。 */
export interface AlchemyRecipeCatalogEntry {
/**
 * recipeId：AlchemyRecipeCatalogEntry 内部字段。
 */

  recipeId: string;  
  /**
 * outputItemId：AlchemyRecipeCatalogEntry 内部字段。
 */

  outputItemId: string;  
  /**
 * outputName：AlchemyRecipeCatalogEntry 内部字段。
 */

  outputName: string;  
  /**
 * category：AlchemyRecipeCatalogEntry 内部字段。
 */

  category: AlchemyRecipeCategory;  
  /**
 * outputCount：AlchemyRecipeCatalogEntry 内部字段。
 */

  outputCount: number;  
  /**
 * outputLevel：AlchemyRecipeCatalogEntry 内部字段。
 */

  outputLevel: number;  
  /**
 * baseBrewTicks：AlchemyRecipeCatalogEntry 内部字段。
 */

  baseBrewTicks: number;  
  /**
 * fullPower：AlchemyRecipeCatalogEntry 内部字段。
 */

  fullPower: number;  
  /**
 * ingredients：AlchemyRecipeCatalogEntry 内部字段。
 */

  ingredients: AlchemyRecipeIngredientDef[];
}

/** 玩家保存的炼制预设。 */
export interface PlayerAlchemyPreset {
/**
 * presetId：PlayerAlchemyPreset 内部字段。
 */

  presetId: string;  
  /**
 * recipeId：PlayerAlchemyPreset 内部字段。
 */

  recipeId: string;  
  /**
 * name：PlayerAlchemyPreset 内部字段。
 */

  name: string;  
  /**
 * ingredients：PlayerAlchemyPreset 内部字段。
 */

  ingredients: AlchemyIngredientSelection[];  
  /**
 * updatedAt：PlayerAlchemyPreset 内部字段。
 */

  updatedAt: number;
}

/** 玩家当前炼制任务的运行态。 */
export interface PlayerAlchemyJob {
/**
 * recipeId：PlayerAlchemyJob 内部字段。
 */

  recipeId: string;  
  /**
 * outputItemId：PlayerAlchemyJob 内部字段。
 */

  outputItemId: string;  
  /**
 * outputCount：PlayerAlchemyJob 内部字段。
 */

  outputCount: number;  
  /**
 * quantity：PlayerAlchemyJob 内部字段。
 */

  quantity: number;  
  /**
 * completedCount：PlayerAlchemyJob 内部字段。
 */

  completedCount: number;  
  /**
 * successCount：PlayerAlchemyJob 内部字段。
 */

  successCount: number;  
  /**
 * failureCount：PlayerAlchemyJob 内部字段。
 */

  failureCount: number;  
  /**
 * ingredients：PlayerAlchemyJob 内部字段。
 */

  ingredients: AlchemyIngredientSelection[];  
  /**
 * phase：PlayerAlchemyJob 内部字段。
 */

  phase: 'preparing' | 'brewing' | 'paused';  
  /**
 * preparationTicks：PlayerAlchemyJob 内部字段。
 */

  preparationTicks: number;  
  /**
 * batchBrewTicks：PlayerAlchemyJob 内部字段。
 */

  batchBrewTicks: number;  
  /**
 * currentBatchRemainingTicks：PlayerAlchemyJob 内部字段。
 */

  currentBatchRemainingTicks: number;  
  /**
 * pausedTicks：PlayerAlchemyJob 内部字段。
 */

  pausedTicks: number;  
  /**
 * spiritStoneCost：PlayerAlchemyJob 内部字段。
 */

  spiritStoneCost: number;  
  /**
 * totalTicks：PlayerAlchemyJob 内部字段。
 */

  totalTicks: number;  
  /**
 * remainingTicks：PlayerAlchemyJob 内部字段。
 */

  remainingTicks: number;  
  /**
 * successRate：PlayerAlchemyJob 内部字段。
 */

  successRate: number;  
  /**
 * exactRecipe：PlayerAlchemyJob 内部字段。
 */

  exactRecipe: boolean;  
  /**
 * startedAt：PlayerAlchemyJob 内部字段。
 */

  startedAt: number;
}

/** 炼制面板的完整同步状态。 */
export interface SyncedAlchemyPanelState {
/**
 * furnaceItemId：SyncedAlchemyPanelState 内部字段。
 */

  furnaceItemId?: string;  
  /**
 * presets：SyncedAlchemyPanelState 内部字段。
 */

  presets: PlayerAlchemyPreset[];  
  /**
 * job：SyncedAlchemyPanelState 内部字段。
 */

  job: PlayerAlchemyJob | null;
}

/** 强化目标引用，指向背包槽位或装备槽位。 */
export interface EnhancementTargetRef {
/**
 * source：EnhancementTargetRef 内部字段。
 */

  source: 'inventory' | 'equipment';  
  /**
 * slotIndex：EnhancementTargetRef 内部字段。
 */

  slotIndex?: number;  
  /**
 * slot：EnhancementTargetRef 内部字段。
 */

  slot?: EquipSlot;
}

/** 强化所需材料的单项要求。 */
export interface EnhancementMaterialRequirement {
/**
 * itemId：EnhancementMaterialRequirement 内部字段。
 */

  itemId: string;  
  /**
 * count：EnhancementMaterialRequirement 内部字段。
 */

  count: number;
}

/** 玩家当前强化任务的运行态。 */
export interface PlayerEnhancementJob {
/**
 * target：PlayerEnhancementJob 内部字段。
 */

  target: EnhancementTargetRef;  
  /**
 * item：PlayerEnhancementJob 内部字段。
 */

  item: ItemStack;  
  /**
 * targetItemId：PlayerEnhancementJob 内部字段。
 */

  targetItemId: string;  
  /**
 * targetItemName：PlayerEnhancementJob 内部字段。
 */

  targetItemName: string;  
  /**
 * targetItemLevel：PlayerEnhancementJob 内部字段。
 */

  targetItemLevel: number;  
  /**
 * currentLevel：PlayerEnhancementJob 内部字段。
 */

  currentLevel: number;  
  /**
 * targetLevel：PlayerEnhancementJob 内部字段。
 */

  targetLevel: number;  
  /**
 * desiredTargetLevel：PlayerEnhancementJob 内部字段。
 */

  desiredTargetLevel: number;  
  /**
 * spiritStoneCost：PlayerEnhancementJob 内部字段。
 */

  spiritStoneCost: number;  
  /**
 * materials：PlayerEnhancementJob 内部字段。
 */

  materials: EnhancementMaterialRequirement[];  
  /**
 * protectionUsed：PlayerEnhancementJob 内部字段。
 */

  protectionUsed: boolean;  
  /**
 * protectionStartLevel：PlayerEnhancementJob 内部字段。
 */

  protectionStartLevel?: number;  
  /**
 * protectionItemId：PlayerEnhancementJob 内部字段。
 */

  protectionItemId?: string;  
  /**
 * protectionItemName：PlayerEnhancementJob 内部字段。
 */

  protectionItemName?: string;  
  /**
 * protectionItemSignature：PlayerEnhancementJob 内部字段。
 */

  protectionItemSignature?: string;  
  /**
 * phase：PlayerEnhancementJob 内部字段。
 */

  phase: 'enhancing' | 'paused';  
  /**
 * pausedTicks：PlayerEnhancementJob 内部字段。
 */

  pausedTicks: number;  
  /**
 * successRate：PlayerEnhancementJob 内部字段。
 */

  successRate: number;  
  /**
 * totalTicks：PlayerEnhancementJob 内部字段。
 */

  totalTicks: number;  
  /**
 * remainingTicks：PlayerEnhancementJob 内部字段。
 */

  remainingTicks: number;  
  /**
 * startedAt：PlayerEnhancementJob 内部字段。
 */

  startedAt: number;  
  /**
 * roleEnhancementLevel：PlayerEnhancementJob 内部字段。
 */

  roleEnhancementLevel: number;  
  /**
 * totalSpeedRate：PlayerEnhancementJob 内部字段。
 */

  totalSpeedRate: number;
}

/** 单个强化目标等级的历史记录。 */
export interface PlayerEnhancementLevelRecord {
/**
 * targetLevel：PlayerEnhancementLevelRecord 内部字段。
 */

  targetLevel: number;  
  /**
 * successCount：PlayerEnhancementLevelRecord 内部字段。
 */

  successCount: number;  
  /**
 * failureCount：PlayerEnhancementLevelRecord 内部字段。
 */

  failureCount: number;
}

/** 强化会话的最终状态。 */
export type PlayerEnhancementSessionStatus = 'in_progress' | 'completed' | 'cancelled' | 'stopped';

/** 单件物品的强化历史记录。 */
export interface PlayerEnhancementRecord {
/**
 * itemId：PlayerEnhancementRecord 内部字段。
 */

  itemId: string;  
  /**
 * highestLevel：PlayerEnhancementRecord 内部字段。
 */

  highestLevel: number;  
  /**
 * levels：PlayerEnhancementRecord 内部字段。
 */

  levels: PlayerEnhancementLevelRecord[];  
  /**
 * actionStartedAt：PlayerEnhancementRecord 内部字段。
 */

  actionStartedAt?: number;  
  /**
 * actionEndedAt：PlayerEnhancementRecord 内部字段。
 */

  actionEndedAt?: number;  
  /**
 * startLevel：PlayerEnhancementRecord 内部字段。
 */

  startLevel?: number;  
  /**
 * initialTargetLevel：PlayerEnhancementRecord 内部字段。
 */

  initialTargetLevel?: number;  
  /**
 * desiredTargetLevel：PlayerEnhancementRecord 内部字段。
 */

  desiredTargetLevel?: number;  
  /**
 * protectionStartLevel：PlayerEnhancementRecord 内部字段。
 */

  protectionStartLevel?: number;  
  /**
 * status：PlayerEnhancementRecord 内部字段。
 */

  status?: PlayerEnhancementSessionStatus;
}

/** 可作为强化保护材料的候选项。 */
export interface SyncedEnhancementProtectionCandidate {
/**
 * ref：SyncedEnhancementProtectionCandidate 内部字段。
 */

  ref: EnhancementTargetRef;  
  /**
 * item：SyncedEnhancementProtectionCandidate 内部字段。
 */

  item: ItemStack;
}

/** 强化材料需求的展示视图。 */
export interface SyncedEnhancementRequirementView {
/**
 * itemId：SyncedEnhancementRequirementView 内部字段。
 */

  itemId: string;  
  /**
 * name：SyncedEnhancementRequirementView 内部字段。
 */

  name: string;  
  /**
 * count：SyncedEnhancementRequirementView 内部字段。
 */

  count: number;  
  /**
 * ownedCount：SyncedEnhancementRequirementView 内部字段。
 */

  ownedCount: number;
}

/** 强化候选项的展示视图。 */
export interface SyncedEnhancementCandidateView {
/**
 * ref：SyncedEnhancementCandidateView 内部字段。
 */

  ref: EnhancementTargetRef;  
  /**
 * item：SyncedEnhancementCandidateView 内部字段。
 */

  item: ItemStack;  
  /**
 * currentLevel：SyncedEnhancementCandidateView 内部字段。
 */

  currentLevel: number;  
  /**
 * nextLevel：SyncedEnhancementCandidateView 内部字段。
 */

  nextLevel: number;  
  /**
 * spiritStoneCost：SyncedEnhancementCandidateView 内部字段。
 */

  spiritStoneCost: number;  
  /**
 * successRate：SyncedEnhancementCandidateView 内部字段。
 */

  successRate: number;  
  /**
 * durationTicks：SyncedEnhancementCandidateView 内部字段。
 */

  durationTicks: number;  
  /**
 * materials：SyncedEnhancementCandidateView 内部字段。
 */

  materials: SyncedEnhancementRequirementView[];  
  /**
 * protectionItemId：SyncedEnhancementCandidateView 内部字段。
 */

  protectionItemId?: string;  
  /**
 * protectionItemName：SyncedEnhancementCandidateView 内部字段。
 */

  protectionItemName?: string;  
  /**
 * allowSelfProtection：SyncedEnhancementCandidateView 内部字段。
 */

  allowSelfProtection: boolean;  
  /**
 * protectionCandidates：SyncedEnhancementCandidateView 内部字段。
 */

  protectionCandidates: SyncedEnhancementProtectionCandidate[];
}

/** 强化面板的完整同步状态。 */
export interface SyncedEnhancementPanelState {
/**
 * hammerItemId：SyncedEnhancementPanelState 内部字段。
 */

  hammerItemId?: string;  
  /**
 * enhancementSkillLevel：SyncedEnhancementPanelState 内部字段。
 */

  enhancementSkillLevel: number;  
  /**
 * candidates：SyncedEnhancementPanelState 内部字段。
 */

  candidates: SyncedEnhancementCandidateView[];  
  /**
 * records：SyncedEnhancementPanelState 内部字段。
 */

  records: PlayerEnhancementRecord[];  
  /**
 * job：SyncedEnhancementPanelState 内部字段。
 */

  job: PlayerEnhancementJob | null;
}

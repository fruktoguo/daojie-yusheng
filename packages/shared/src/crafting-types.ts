/**
 * 炼制与强化共享类型：承接面板、任务运行态与同步视图结构。
 */
import type { TechniqueGrade } from './cultivation-types';
import type { EquipSlot, ItemStack } from './item-runtime-types';

/** 炼制技能的经验与等级运行态。 */
export interface AlchemySkillState {
/**
 * level：等级数值。
 */

  level: number;  
  /**
 * exp：exp相关字段。
 */

  exp: number;  
  /**
 * expToNext：expToNext相关字段。
 */

  expToNext: number;
}

/** 炼制材料在配方中的角色。 */
export type AlchemyIngredientRole = 'main' | 'aux';

/** 玩家在炼制时实际勾选的材料数量。 */
export interface AlchemyIngredientSelection {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 配方目录里的单个材料定义。 */
export interface AlchemyRecipeIngredientDef extends AlchemyIngredientSelection {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * role：role相关字段。
 */

  role: AlchemyIngredientRole;  
  /**
 * level：等级数值。
 */

  level: number;  
  /**
 * grade：grade相关字段。
 */

  grade: TechniqueGrade;  
  /**
 * powerPerUnit：powerPerUnit相关字段。
 */

  powerPerUnit: number;
}

/** 炼制配方类别。 */
export type AlchemyRecipeCategory = 'recovery' | 'buff';

/** 炼制配方目录条目。 */
export interface AlchemyRecipeCatalogEntry {
/**
 * recipeId：recipeID标识。
 */

  recipeId: string;  
  /**
 * outputItemId：输出道具ID标识。
 */

  outputItemId: string;  
  /**
 * outputName：输出名称名称或显示文本。
 */

  outputName: string;  
  /**
 * category：category相关字段。
 */

  category: AlchemyRecipeCategory;  
  /**
 * outputCount：数量或计量字段。
 */

  outputCount: number;  
  /**
 * outputLevel：输出等级数值。
 */

  outputLevel: number;  
  /**
 * baseBrewTicks：baseBrewtick相关字段。
 */

  baseBrewTicks: number;  
  /**
 * fullPower：fullPower相关字段。
 */

  fullPower: number;  
  /**
 * ingredients：ingredient相关字段。
 */

  ingredients: AlchemyRecipeIngredientDef[];
}

/** 玩家保存的炼制预设。 */
export interface PlayerAlchemyPreset {
/**
 * presetId：presetID标识。
 */

  presetId: string;  
  /**
 * recipeId：recipeID标识。
 */

  recipeId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * ingredients：ingredient相关字段。
 */

  ingredients: AlchemyIngredientSelection[];  
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: number;
}

/** 玩家当前炼制任务的运行态。 */
export interface PlayerAlchemyJob {
/**
 * recipeId：recipeID标识。
 */

  recipeId: string;  
  /**
 * outputItemId：输出道具ID标识。
 */

  outputItemId: string;  
  /**
 * outputCount：数量或计量字段。
 */

  outputCount: number;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;  
  /**
 * completedCount：数量或计量字段。
 */

  completedCount: number;  
  /**
 * successCount：数量或计量字段。
 */

  successCount: number;  
  /**
 * failureCount：数量或计量字段。
 */

  failureCount: number;  
  /**
 * ingredients：ingredient相关字段。
 */

  ingredients: AlchemyIngredientSelection[];  
  /**
 * phase：phase相关字段。
 */

  phase: 'preparing' | 'brewing' | 'paused';  
  /**
 * preparationTicks：preparationtick相关字段。
 */

  preparationTicks: number;  
  /**
 * batchBrewTicks：batchBrewtick相关字段。
 */

  batchBrewTicks: number;  
  /**
 * currentBatchRemainingTicks：currentBatchRemainingtick相关字段。
 */

  currentBatchRemainingTicks: number;  
  /**
 * pausedTicks：pausedtick相关字段。
 */

  pausedTicks: number;  
  /**
 * spiritStoneCost：spiritStone消耗数值。
 */

  spiritStoneCost: number;  
  /**
 * totalTicks：totaltick相关字段。
 */

  totalTicks: number;  
  /**
 * remainingTicks：remainingtick相关字段。
 */

  remainingTicks: number;  
  /**
 * successRate：successRate数值。
 */

  successRate: number;  
  /**
 * exactRecipe：exactRecipe相关字段。
 */

  exactRecipe: boolean;  
  /**
 * startedAt：startedAt相关字段。
 */

  startedAt: number;
}

/** 炼制面板的完整同步状态。 */
export interface SyncedAlchemyPanelState {
/**
 * furnaceItemId：furnace道具ID标识。
 */

  furnaceItemId?: string;  
  /**
 * presets：preset相关字段。
 */

  presets: PlayerAlchemyPreset[];  
  /**
 * job：job相关字段。
 */

  job: PlayerAlchemyJob | null;
}

/** 强化目标引用，指向背包槽位或装备槽位。 */
export interface EnhancementTargetRef {
/**
 * source：来源相关字段。
 */

  source: 'inventory' | 'equipment';  
  /**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex?: number;  
  /**
 * slot：slot相关字段。
 */

  slot?: EquipSlot;
}

/** 强化所需材料的单项要求。 */
export interface EnhancementMaterialRequirement {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 玩家当前强化任务的运行态。 */
export interface PlayerEnhancementJob {
/**
 * target：目标相关字段。
 */

  target: EnhancementTargetRef;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * targetItemId：目标道具ID标识。
 */

  targetItemId: string;  
  /**
 * targetItemName：目标道具名称名称或显示文本。
 */

  targetItemName: string;  
  /**
 * targetItemLevel：目标道具等级数值。
 */

  targetItemLevel: number;  
  /**
 * currentLevel：current等级数值。
 */

  currentLevel: number;  
  /**
 * targetLevel：目标等级数值。
 */

  targetLevel: number;  
  /**
 * desiredTargetLevel：desired目标等级数值。
 */

  desiredTargetLevel: number;  
  /**
 * spiritStoneCost：spiritStone消耗数值。
 */

  spiritStoneCost: number;  
  /**
 * materials：material相关字段。
 */

  materials: EnhancementMaterialRequirement[];  
  /**
 * protectionUsed：protectionUsed相关字段。
 */

  protectionUsed: boolean;  
  /**
 * protectionStartLevel：protectionStart等级数值。
 */

  protectionStartLevel?: number;  
  /**
 * protectionItemId：protection道具ID标识。
 */

  protectionItemId?: string;  
  /**
 * protectionItemName：protection道具名称名称或显示文本。
 */

  protectionItemName?: string;  
  /**
 * protectionItemSignature：protection道具Signature标识。
 */

  protectionItemSignature?: string;  
  /**
 * phase：phase相关字段。
 */

  phase: 'enhancing' | 'paused';  
  /**
 * pausedTicks：pausedtick相关字段。
 */

  pausedTicks: number;  
  /**
 * successRate：successRate数值。
 */

  successRate: number;  
  /**
 * totalTicks：totaltick相关字段。
 */

  totalTicks: number;  
  /**
 * remainingTicks：remainingtick相关字段。
 */

  remainingTicks: number;  
  /**
 * startedAt：startedAt相关字段。
 */

  startedAt: number;  
  /**
 * roleEnhancementLevel：role强化等级数值。
 */

  roleEnhancementLevel: number;  
  /**
 * totalSpeedRate：totalSpeedRate数值。
 */

  totalSpeedRate: number;
}

/** 单个强化目标等级的历史记录。 */
export interface PlayerEnhancementLevelRecord {
/**
 * targetLevel：目标等级数值。
 */

  targetLevel: number;  
  /**
 * successCount：数量或计量字段。
 */

  successCount: number;  
  /**
 * failureCount：数量或计量字段。
 */

  failureCount: number;
}

/** 强化会话的最终状态。 */
export type PlayerEnhancementSessionStatus = 'in_progress' | 'completed' | 'cancelled' | 'stopped';

/** 单件物品的强化历史记录。 */
export interface PlayerEnhancementRecord {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * highestLevel：highest等级数值。
 */

  highestLevel: number;  
  /**
 * levels：等级相关字段。
 */

  levels: PlayerEnhancementLevelRecord[];  
  /**
 * actionStartedAt：actionStartedAt相关字段。
 */

  actionStartedAt?: number;  
  /**
 * actionEndedAt：actionEndedAt相关字段。
 */

  actionEndedAt?: number;  
  /**
 * startLevel：start等级数值。
 */

  startLevel?: number;  
  /**
 * initialTargetLevel：initial目标等级数值。
 */

  initialTargetLevel?: number;  
  /**
 * desiredTargetLevel：desired目标等级数值。
 */

  desiredTargetLevel?: number;  
  /**
 * protectionStartLevel：protectionStart等级数值。
 */

  protectionStartLevel?: number;  
  /**
 * status：statu状态或数据块。
 */

  status?: PlayerEnhancementSessionStatus;
}

/** 可作为强化保护材料的候选项。 */
export interface SyncedEnhancementProtectionCandidate {
/**
 * ref：ref相关字段。
 */

  ref: EnhancementTargetRef;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;
}

/** 强化材料需求的展示视图。 */
export interface SyncedEnhancementRequirementView {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;  
  /**
 * ownedCount：数量或计量字段。
 */

  ownedCount: number;
}

/** 强化候选项的展示视图。 */
export interface SyncedEnhancementCandidateView {
/**
 * ref：ref相关字段。
 */

  ref: EnhancementTargetRef;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * currentLevel：current等级数值。
 */

  currentLevel: number;  
  /**
 * nextLevel：next等级数值。
 */

  nextLevel: number;  
  /**
 * spiritStoneCost：spiritStone消耗数值。
 */

  spiritStoneCost: number;  
  /**
 * successRate：successRate数值。
 */

  successRate: number;  
  /**
 * durationTicks：durationtick相关字段。
 */

  durationTicks: number;  
  /**
 * materials：material相关字段。
 */

  materials: SyncedEnhancementRequirementView[];  
  /**
 * protectionItemId：protection道具ID标识。
 */

  protectionItemId?: string;  
  /**
 * protectionItemName：protection道具名称名称或显示文本。
 */

  protectionItemName?: string;  
  /**
 * allowSelfProtection：allowSelfProtection相关字段。
 */

  allowSelfProtection: boolean;  
  /**
 * protectionCandidates：protectionCandidate相关字段。
 */

  protectionCandidates: SyncedEnhancementProtectionCandidate[];
}

/** 强化面板的完整同步状态。 */
export interface SyncedEnhancementPanelState {
/**
 * hammerItemId：hammer道具ID标识。
 */

  hammerItemId?: string;  
  /**
 * enhancementSkillLevel：强化技能等级数值。
 */

  enhancementSkillLevel: number;  
  /**
 * candidates：candidate相关字段。
 */

  candidates: SyncedEnhancementCandidateView[];  
  /**
 * records：record相关字段。
 */

  records: PlayerEnhancementRecord[];  
  /**
 * job：job相关字段。
 */

  job: PlayerEnhancementJob | null;
}

/**
 * 炼制与强化共享类型：承接面板、任务运行态与同步视图结构。
 */
import type { TechniqueGrade } from './cultivation-types';
import type { EquipSlot, ItemStack } from './item-runtime-types';

/** 炼制技能的经验与等级运行态。 */
export interface AlchemySkillState {
  level: number;
  exp: number;
  expToNext: number;
}

/** 炼制材料在配方中的角色。 */
export type AlchemyIngredientRole = 'main' | 'aux';

/** 玩家在炼制时实际勾选的材料数量。 */
export interface AlchemyIngredientSelection {
  itemId: string;
  count: number;
}

/** 配方目录里的单个材料定义。 */
export interface AlchemyRecipeIngredientDef extends AlchemyIngredientSelection {
  name: string;
  role: AlchemyIngredientRole;
  level: number;
  grade: TechniqueGrade;
  powerPerUnit: number;
}

/** 炼制配方类别。 */
export type AlchemyRecipeCategory = 'recovery' | 'buff';

/** 炼制配方目录条目。 */
export interface AlchemyRecipeCatalogEntry {
  recipeId: string;
  outputItemId: string;
  outputName: string;
  category: AlchemyRecipeCategory;
  outputCount: number;
  outputLevel: number;
  baseBrewTicks: number;
  fullPower: number;
  ingredients: AlchemyRecipeIngredientDef[];
}

/** 玩家保存的炼制预设。 */
export interface PlayerAlchemyPreset {
  presetId: string;
  recipeId: string;
  name: string;
  ingredients: AlchemyIngredientSelection[];
  updatedAt: number;
}

/** 玩家当前炼制任务的运行态。 */
export interface PlayerAlchemyJob {
  recipeId: string;
  outputItemId: string;
  outputCount: number;
  quantity: number;
  completedCount: number;
  successCount: number;
  failureCount: number;
  ingredients: AlchemyIngredientSelection[];
  phase: 'preparing' | 'brewing' | 'paused';
  preparationTicks: number;
  batchBrewTicks: number;
  currentBatchRemainingTicks: number;
  pausedTicks: number;
  spiritStoneCost: number;
  totalTicks: number;
  remainingTicks: number;
  successRate: number;
  exactRecipe: boolean;
  startedAt: number;
}

/** 炼制面板的完整同步状态。 */
export interface SyncedAlchemyPanelState {
  furnaceItemId?: string;
  presets: PlayerAlchemyPreset[];
  job: PlayerAlchemyJob | null;
}

/** 强化目标引用，指向背包槽位或装备槽位。 */
export interface EnhancementTargetRef {
  source: 'inventory' | 'equipment';
  slotIndex?: number;
  slot?: EquipSlot;
}

/** 强化所需材料的单项要求。 */
export interface EnhancementMaterialRequirement {
  itemId: string;
  count: number;
}

/** 玩家当前强化任务的运行态。 */
export interface PlayerEnhancementJob {
  target: EnhancementTargetRef;
  item: ItemStack;
  targetItemId: string;
  targetItemName: string;
  targetItemLevel: number;
  currentLevel: number;
  targetLevel: number;
  desiredTargetLevel: number;
  spiritStoneCost: number;
  materials: EnhancementMaterialRequirement[];
  protectionUsed: boolean;
  protectionStartLevel?: number;
  protectionItemId?: string;
  protectionItemName?: string;
  protectionItemSignature?: string;
  phase: 'enhancing' | 'paused';
  pausedTicks: number;
  successRate: number;
  totalTicks: number;
  remainingTicks: number;
  startedAt: number;
  roleEnhancementLevel: number;
  totalSpeedRate: number;
}

/** 单个强化目标等级的历史记录。 */
export interface PlayerEnhancementLevelRecord {
  targetLevel: number;
  successCount: number;
  failureCount: number;
}

/** 强化会话的最终状态。 */
export type PlayerEnhancementSessionStatus = 'in_progress' | 'completed' | 'cancelled' | 'stopped';

/** 单件物品的强化历史记录。 */
export interface PlayerEnhancementRecord {
  itemId: string;
  highestLevel: number;
  levels: PlayerEnhancementLevelRecord[];
  actionStartedAt?: number;
  actionEndedAt?: number;
  startLevel?: number;
  initialTargetLevel?: number;
  desiredTargetLevel?: number;
  protectionStartLevel?: number;
  status?: PlayerEnhancementSessionStatus;
}

/** 可作为强化保护材料的候选项。 */
export interface SyncedEnhancementProtectionCandidate {
  ref: EnhancementTargetRef;
  item: ItemStack;
}

/** 强化材料需求的展示视图。 */
export interface SyncedEnhancementRequirementView {
  itemId: string;
  name: string;
  count: number;
  ownedCount: number;
}

/** 强化候选项的展示视图。 */
export interface SyncedEnhancementCandidateView {
  ref: EnhancementTargetRef;
  item: ItemStack;
  currentLevel: number;
  nextLevel: number;
  spiritStoneCost: number;
  successRate: number;
  durationTicks: number;
  materials: SyncedEnhancementRequirementView[];
  protectionItemId?: string;
  protectionItemName?: string;
  allowSelfProtection: boolean;
  protectionCandidates: SyncedEnhancementProtectionCandidate[];
}

/** 强化面板的完整同步状态。 */
export interface SyncedEnhancementPanelState {
  hammerItemId?: string;
  enhancementSkillLevel: number;
  candidates: SyncedEnhancementCandidateView[];
  records: PlayerEnhancementRecord[];
  job: PlayerEnhancementJob | null;
}

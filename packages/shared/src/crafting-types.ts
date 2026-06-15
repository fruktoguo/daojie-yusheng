/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 炼制与强化共享类型：承接面板、任务运行态与同步视图结构。
 */
import type { TechniqueActivityCancelRef, TechniqueActivityInterruptState, TechniqueActivityJobBase, TechniqueActivityTaskKind } from './technique-activity-types';
import type { TechniqueCategory, TechniqueGrade, TechniqueTransmissionBlockedReason, TechniqueTransmissionJobStatus } from './cultivation-types';
import type { CraftElementMatchSnapshot, CraftElementVector } from './craft-elements';
import type { EquipSlot, ItemStack, ItemType } from './item-runtime-types';
import type { TechniqueComprehensionProgressBreakdown } from './technique-comprehension';
import type { CraftEquipmentStats } from './constants/gameplay/equipment';

/** 制造型技艺任务的启动排队策略。 */
export type CraftQueueStartMode = 'replace' | 'preserve' | 'append';

/** 制造型技艺任务队列条目。 */
export interface CraftQueueItemView {
  queueId: string;
  kind: TechniqueActivityTaskKind;
  label: string;
  quantity?: number;
  createdAt: number;
  payload?: unknown;
  state?: 'pending' | 'sleeping';
  targetLabel?: string;
  sleepReason?: string;
  cancelRef?: TechniqueActivityCancelRef;
}

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

/** 标准丹方/器方中的主药/主材要求。 */
export interface AlchemyRecipeMainIngredientDef extends AlchemyIngredientSelection {
/**
 * name：名称名称或显示文本。
 */

  name: string;
}

/** 炼制/炼器配方类别。炼器装备按装备槽位分类，工具和阵盘归入 special，法宝独立归类。 */
export type AlchemyRecipeCategory = 'recovery' | 'buff' | 'special' | 'artifact' | EquipSlot;

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
 * level：配方等级。
 */

  level?: number;
  /**
 * grade：配方品阶。
 */

  grade?: TechniqueGrade;
  /**
 * mainIngredients：必须投入的主药/主材。
 */

  mainIngredients?: AlchemyRecipeMainIngredientDef[];
  /**
 * requiredAuxElements：辅药/辅材目标五行。
 */

  requiredAuxElements?: CraftElementVector;
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
 * jobRunId：活跃任务运行 ID。
 */

  jobRunId?: string;
  /**
 * jobType：任务类型。
 */

  jobType?: 'alchemy' | 'forging';
  /**
 * jobVersion：活跃任务版本。
 */

  jobVersion?: number;
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
 * elementMatchSnapshot：创建任务时固定下来的五行匹配快照。
 */

  elementMatchSnapshot?: CraftElementMatchSnapshot;
  /**
 * baseElementSuccessRate：创建任务时固定下来的五行基础成功率。
 */

  baseElementSuccessRate?: number;
  /**
 * phase：phase相关字段。
 */

  phase: 'brewing' | 'paused';
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
 * workTotalTicks：实际工作总量，不包含打断等待。
 */

  workTotalTicks?: number;
  /**
 * workRemainingTicks：实际剩余工作量，不包含打断等待。
 */

  workRemainingTicks?: number;
  /**
 * interruptWaitRemainingTicks：打断等待剩余息数，独立于实际工作进度。
 */

  interruptWaitRemainingTicks?: number;
  /**
 * interruptState：结构化打断等待状态。
 */

  interruptState?: TechniqueActivityInterruptState | null;
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
  /**
 * queuedJobs：等待中的后续制造任务。
 */

  queuedJobs?: CraftQueueItemView[];
}

/** 锻造任务运行态（结构与炼丹相同，独立槽位）。 */
export type PlayerForgingJob = PlayerAlchemyJob;

/** 炼制面板的完整同步状态。 */
export interface SyncedAlchemyPanelState {
/**
 * furnaceItemId：furnace道具ID标识。
 */

  furnaceItemId?: string;  
  /**
 * toolStats：服务端属性结算后的隐藏技艺工具属性投影。
 */

  toolStats?: Partial<CraftEquipmentStats>;
  /**
 * presets：preset相关字段。
 */

  presets: PlayerAlchemyPreset[];  
  /**
 * job：job相关字段。
 */

  job: PlayerAlchemyJob | null;
  /**
 * queue：制造任务队列快照。
 */

  queue?: CraftQueueItemView[];
}

/** 炼制/炼器面板运行态增量。 */
export interface SyncedAlchemyPanelPatch {
/**
 * job：活跃炼制/炼器任务；null 表示任务已清空。
 */

  job?: PlayerAlchemyJob | null;
  /**
 * queue：制造任务队列快照。
 */

  queue?: CraftQueueItemView[];
}

/** 强化目标引用，指向背包稳定实例或装备语义槽位。 */
export interface EnhancementTargetRef {
/**
 * source：来源相关字段。
 */

  source: 'inventory' | 'equipment';  
  /**
 * itemInstanceId：背包物品稳定实例 ID。source 为 inventory 时必须提供。
 */

  itemInstanceId?: string;
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
 * jobRunId：活跃任务运行 ID。
 */

  jobRunId?: string;
  /**
 * jobType：任务类型。
 */

  jobType?: 'enhancement';
  /**
 * jobVersion：活跃任务版本。
 */

  jobVersion?: number;
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
 * workTotalTicks：实际工作总量，不包含打断等待。
 */

  workTotalTicks?: number;
  /**
 * workRemainingTicks：实际剩余工作量，不包含打断等待。
 */

  workRemainingTicks?: number;
  /**
 * interruptWaitRemainingTicks：打断等待剩余息数，独立于实际工作进度。
 */

  interruptWaitRemainingTicks?: number;
  /**
 * interruptState：结构化打断等待状态。
 */

  interruptState?: TechniqueActivityInterruptState | null;
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
  /**
 * queuedJobs：等待中的后续制造任务。
 */

  queuedJobs?: CraftQueueItemView[];
}

/** 玩家当前采集任务的最小持久化运行态。 */
export interface PlayerGatherJob extends TechniqueActivityJobBase {
/**
 * resourceNodeId：资源节点 ID。
 */

  resourceNodeId: string;  
  /**
 * resourceNodeName：资源节点名称名称或显示文本。
 */

  resourceNodeName: string;  
  /**
 * phase：phase相关字段。
 */

  phase: 'gathering' | 'paused';
}

/** 玩家当前营造任务的最小持久化运行态。 */
export interface PlayerBuildingJob extends TechniqueActivityJobBase {
/**
 * buildingId：建筑 ID。
 */

  buildingId: string;
  /**
 * buildingName：建筑名称名称或显示文本。
 */

  buildingName: string;
  /**
 * instanceId：实例 ID。
 */

  instanceId: string;
  /**
 * phase：phase相关字段。
 */

  phase: 'building' | 'paused';
}

/** 玩家当前挖矿任务的最小持久化运行态。 */
export interface PlayerMiningJob extends TechniqueActivityJobBase {
/**
 * jobRunId：任务运行 ID。
 */

  jobRunId?: string;
  /**
 * jobType：任务类型。
 */

  jobType?: 'mining';
  /**
 * jobVersion：任务版本号。
 */

  jobVersion?: number;
/**
 * miningNodeId：矿脉目标 ID。
 */

  miningNodeId: string;
  /**
 * miningNodeName：矿脉目标名称。
 */

  miningNodeName: string;
  /**
 * instanceId：实例 ID。
 */

  instanceId: string;
  /**
 * targetX：目标地块 X 坐标。
 */

  targetX: number;
  /**
 * targetY：目标地块 Y 坐标。
 */

  targetY: number;
  /**
 * tileType：目标地块类型。
 */

  tileType: string;
  /**
 * baseDamagePerTick：每息基础采掘伤害，实际伤害还会吃挖矿等级和矿镐加成。
 */

  baseDamagePerTick: number;
  /**
 * phase：phase相关字段。
 */

  phase: 'mining' | 'paused';
}

/** 玩家当前传法任务的最小持久化运行态。 */
export interface PlayerTransmissionJob extends TechniqueActivityJobBase {
  /**
   * jobRunId：任务运行 ID。
   */

  jobRunId?: string;
  /**
   * jobType：任务类型。
   */

  jobType?: 'transmission' | 'scripture_recording' | 'scripture_contemplation';
  /**
   * jobVersion：任务版本号。
   */

  jobVersion?: number;
  /**
   * label：任务列表显示名。
   */

  label?: string;
  /**
   * techniqueId：被传授功法 ID。
   */

  techniqueId: string;
  /**
   * techniqueName：被传授功法显示名。
   */

  techniqueName: string;
  /**
   * teacherPlayerId：传授者玩家 ID。
   */

  teacherPlayerId: string;
  /**
   * teacherName：传授者显示名。
   */

  teacherName?: string;
  /**
   * range：传授有效距离。
   */

  range: number;
  /**
   * realmLv：功法境界等级。
   */

  realmLv: number;
  /**
   * grade：功法品阶。
   */

  grade?: TechniqueGrade;
  /**
   * category：功法类型。
   */

  category?: TechniqueCategory;
  /** 当前每息可推进的领悟进度，用于客户端估算速率。 */
  progressGainPerTick?: number;
  /** 按当前速率估算的剩余完成息数。 */
  estimatedRemainingTicks?: number;
  /** 当前速率的构成拆解，用于解释境界差和传法等级加成。 */
  progressBreakdown?: TechniqueComprehensionProgressBreakdown;
  /**
   * status：传法运行状态。
   */

  status?: TechniqueTransmissionJobStatus;
  /**
   * blockedReason：传法阻塞原因。
   */

  blockedReason?: TechniqueTransmissionBlockedReason;
  /**
   * phase：phase相关字段。
   */

  phase: 'transmitting' | 'paused';
  /**
   * buildingId：藏经录入目标建筑 ID。
   */

  buildingId?: string;
}

/** 玩家当前阵法维护任务的最小持久化运行态。 */
export interface PlayerFormationJob extends TechniqueActivityJobBase {
/**
 * formationInstanceId：阵法实例 ID。
 */

  formationInstanceId: string;
  /**
 * formationName：阵法名称名称或显示文本。
 */

  formationName: string;
  /**
 * instanceId：阵法所在实例 ID。
 */

  instanceId: string;
  /**
 * controlInstanceId：阵法控制点所在实例 ID。
 */

  controlInstanceId: string;
  /**
 * controlX：控制点 X 坐标。
 */

  controlX: number;
  /**
 * controlY：控制点 Y 坐标。
 */

  controlY: number;
  /**
 * phase：phase相关字段。
 */

  phase: 'maintaining' | 'paused';
  /**
 * maintenanceRate：每息维护注入灵力。
 */

  maintenanceRate: number;
  /**
 * jobRunId：任务运行 ID。
 */

  jobRunId?: string;
  /**
 * jobType：任务类型。
 */

  jobType?: 'formation';
  /**
 * jobVersion：任务版本号。
 */

  jobVersion?: number;
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
export interface SyncedEnhancementItemView {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * itemInstanceId：装备稳定实例 ID（同 ItemStack.itemInstanceId）。
 * 客户端发起 startEnhancement / 上架等请求时，需要把它作为
 * `expectedItemInstanceId` 透传回服务端做乐观一致性校验。
 */

  itemInstanceId?: string;
  /**
 * name：名称名称或显示文本。
 */

  name?: string;
  /**
 * type：type相关字段。
 */

  type?: ItemType;
  /**
 * count：数量或计量字段。
 */

  count?: number;
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * equipSlot：装备槽位。
 */

  equipSlot?: EquipSlot;
  /**
 * enhanceLevel：强化等级。
 */

  enhanceLevel?: number;
}

export interface SyncedEnhancementJobView extends Omit<PlayerEnhancementJob, 'item'> {
/**
 * item：强化面板只需要道具摘要，完整装备详情走背包/装备详情源。
 */

  item?: SyncedEnhancementItemView;
}

/** 强化面板运行态增量。 */
export interface SyncedEnhancementPanelPatch {
/**
 * enhancementSkillLevel：强化技能等级数值。
 */

  enhancementSkillLevel?: number;
  /**
 * job：活跃强化任务；null 表示任务已清空。
 */

  job?: SyncedEnhancementJobView | null;
  /**
 * queue：制造任务队列快照。
 */

  queue?: CraftQueueItemView[];
  /**
 * records：本次运行态相关的强化记录增量；高频包只携带当前任务关联记录。
 */

  records?: PlayerEnhancementRecord[];
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

  item: SyncedEnhancementItemView;
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

  item: SyncedEnhancementItemView;  
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
 * toolStats：服务端属性结算后的隐藏技艺工具属性投影。
 */

  toolStats?: Partial<CraftEquipmentStats>;
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

  job: SyncedEnhancementJobView | null;
  /**
 * queue：制造任务队列快照。
 */

  queue?: CraftQueueItemView[];
}

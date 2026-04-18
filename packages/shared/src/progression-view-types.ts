/**
 * 突破与成长展示类型：承接突破需求与预览视图结构。
 */
/** 突破材料需求 */
export interface BreakthroughItemRequirement {
  itemId: string;
  count: number;
}

/** 突破需求类型 */
export type BreakthroughRequirementType = 'item' | 'technique' | 'attribute' | 'root';

/** 突破需求视图条目 */
export interface BreakthroughRequirementView {
  id: string;
  type: BreakthroughRequirementType;
  label: string;
  completed: boolean;
  hidden: boolean;
  optional?: boolean;
  blocksBreakthrough?: boolean;
  increasePct?: number;
  detail?: string;
}

/** 突破预览状态 */
export interface BreakthroughPreviewState {
  targetRealmLv: number;
  targetDisplayName: string;
  totalRequirements: number;
  completedRequirements: number;
  allCompleted: boolean;
  canBreakthrough: boolean;
  blockingRequirements: number;
  completedBlockingRequirements: number;
  requirements: BreakthroughRequirementView[];
  blockedReason?: string;
}

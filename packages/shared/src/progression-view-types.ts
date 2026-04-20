/**
 * 突破与成长展示类型：承接突破需求与预览视图结构。
 */
/** 突破材料需求 */
export interface BreakthroughItemRequirement {
/**
 * itemId：BreakthroughItemRequirement 内部字段。
 */

  itemId: string;  
  /**
 * count：BreakthroughItemRequirement 内部字段。
 */

  count: number;
}

/** 突破需求类型 */
export type BreakthroughRequirementType = 'item' | 'technique' | 'attribute' | 'root';

/** 突破需求视图条目 */
export interface BreakthroughRequirementView {
/**
 * id：BreakthroughRequirementView 内部字段。
 */

  id: string;  
  /**
 * type：BreakthroughRequirementView 内部字段。
 */

  type: BreakthroughRequirementType;  
  /**
 * label：BreakthroughRequirementView 内部字段。
 */

  label: string;  
  /**
 * completed：BreakthroughRequirementView 内部字段。
 */

  completed: boolean;  
  /**
 * hidden：BreakthroughRequirementView 内部字段。
 */

  hidden: boolean;  
  /**
 * optional：BreakthroughRequirementView 内部字段。
 */

  optional?: boolean;  
  /**
 * blocksBreakthrough：BreakthroughRequirementView 内部字段。
 */

  blocksBreakthrough?: boolean;  
  /**
 * increasePct：BreakthroughRequirementView 内部字段。
 */

  increasePct?: number;  
  /**
 * detail：BreakthroughRequirementView 内部字段。
 */

  detail?: string;
}

/** 突破预览状态 */
export interface BreakthroughPreviewState {
/**
 * targetRealmLv：BreakthroughPreviewState 内部字段。
 */

  targetRealmLv: number;  
  /**
 * targetDisplayName：BreakthroughPreviewState 内部字段。
 */

  targetDisplayName: string;  
  /**
 * totalRequirements：BreakthroughPreviewState 内部字段。
 */

  totalRequirements: number;  
  /**
 * completedRequirements：BreakthroughPreviewState 内部字段。
 */

  completedRequirements: number;  
  /**
 * allCompleted：BreakthroughPreviewState 内部字段。
 */

  allCompleted: boolean;  
  /**
 * canBreakthrough：BreakthroughPreviewState 内部字段。
 */

  canBreakthrough: boolean;  
  /**
 * blockingRequirements：BreakthroughPreviewState 内部字段。
 */

  blockingRequirements: number;  
  /**
 * completedBlockingRequirements：BreakthroughPreviewState 内部字段。
 */

  completedBlockingRequirements: number;  
  /**
 * requirements：BreakthroughPreviewState 内部字段。
 */

  requirements: BreakthroughRequirementView[];  
  /**
 * blockedReason：BreakthroughPreviewState 内部字段。
 */

  blockedReason?: string;
}

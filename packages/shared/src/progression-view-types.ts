/**
 * 突破与成长展示类型：承接突破需求与预览视图结构。
 */
/** 突破材料需求 */
export interface BreakthroughItemRequirement {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 突破需求类型 */
export type BreakthroughRequirementType = 'item' | 'technique' | 'attribute_total' | 'root';

/** 突破需求视图条目 */
export interface BreakthroughRequirementView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * type：type相关字段。
 */

  type: BreakthroughRequirementType;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * completed：completed相关字段。
 */

  completed: boolean;  
  /**
 * hidden：hidden相关字段。
 */

  hidden: boolean;  
  /**
 * optional：optional相关字段。
 */

  optional?: boolean;  
  /**
 * blocksBreakthrough：blockBreakthrough相关字段。
 */

  blocksBreakthrough?: boolean;  
  /**
 * increasePct：increasePct相关字段。
 */

  increasePct?: number;  
  /**
 * detail：详情状态或数据块。
 */

  detail?: string;
}

/** 突破预览状态 */
export interface BreakthroughPreviewState {
/**
 * targetRealmLv：目标RealmLv相关字段。
 */

  targetRealmLv: number;  
  /**
 * targetDisplayName：目标显示名称名称或显示文本。
 */

  targetDisplayName: string;  
  /**
 * totalRequirements：totalRequirement相关字段。
 */

  totalRequirements: number;  
  /**
 * completedRequirements：completedRequirement相关字段。
 */

  completedRequirements: number;  
  /**
 * allCompleted：allCompleted相关字段。
 */

  allCompleted: boolean;  
  /**
 * canBreakthrough：canBreakthrough相关字段。
 */

  canBreakthrough: boolean;  
  /**
 * blockingRequirements：blockingRequirement相关字段。
 */

  blockingRequirements: number;  
  /**
 * completedBlockingRequirements：completedBlockingRequirement相关字段。
 */

  completedBlockingRequirements: number;  
  /**
 * requirements：requirement相关字段。
 */

  requirements: BreakthroughRequirementView[];  
  /**
 * rootFoundation：凝练根基视图，低频随突破预览下发。
 */

  rootFoundation?: RootFoundationPreviewState;
  /**
 * blockedReason：blockedReason相关字段。
 */

  blockedReason?: string;
}

/** 凝练根基预览状态 */
export interface RootFoundationPreviewState {
  /** 当前已拥有根基；往生等功能可能让它超过当前等级可凝练上限。 */
  current: number;
  /** 当前等级可凝练上限，只限制继续凝练，不裁剪已拥有根基。 */
  cap: number;
  remaining: number;
  costProgress: number;
  progress: number;
  items: BreakthroughItemRequirement[];
  canRefine: boolean;
  blockedReason?: string;
}

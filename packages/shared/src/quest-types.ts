import type { PlayerRealmStage } from './cultivation-types';
import type { ItemStack } from './item-runtime-types';

/**
 * 任务状态、导航与日志本相关的共享类型。
 */

/** 任务状态。 */
export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';

/** 任务线类型。 */
export type QuestLine = 'main' | 'side' | 'daily' | 'encounter';

/** 任务目标类型。 */
export type QuestObjectiveType = 'kill' | 'talk' | 'submit_item' | 'learn_technique' | 'realm_progress' | 'realm_stage';

/** 任务进度。 */
export interface QuestState {
/**
 * id：QuestState 内部字段。
 */

  id: string;  
  /**
 * title：QuestState 内部字段。
 */

  title: string;  
  /**
 * desc：QuestState 内部字段。
 */

  desc: string;  
  /**
 * line：QuestState 内部字段。
 */

  line: QuestLine;  
  /**
 * chapter：QuestState 内部字段。
 */

  chapter?: string;  
  /**
 * story：QuestState 内部字段。
 */

  story?: string;  
  /**
 * status：QuestState 内部字段。
 */

  status: QuestStatus;  
  /**
 * objectiveType：QuestState 内部字段。
 */

  objectiveType: QuestObjectiveType;  
  /**
 * objectiveText：QuestState 内部字段。
 */

  objectiveText?: string;  
  /**
 * progress：QuestState 内部字段。
 */

  progress: number;  
  /**
 * required：QuestState 内部字段。
 */

  required: number;  
  /**
 * targetName：QuestState 内部字段。
 */

  targetName: string;  
  /**
 * targetTechniqueId：QuestState 内部字段。
 */

  targetTechniqueId?: string;  
  /**
 * targetRealmStage：QuestState 内部字段。
 */

  targetRealmStage?: PlayerRealmStage;  
  /**
 * rewardText：QuestState 内部字段。
 */

  rewardText: string;  
  /**
 * targetMonsterId：QuestState 内部字段。
 */

  targetMonsterId: string;  
  /**
 * rewardItemId：QuestState 内部字段。
 */

  rewardItemId: string;  
  /**
 * rewardItemIds：QuestState 内部字段。
 */

  rewardItemIds: string[];  
  /**
 * rewards：QuestState 内部字段。
 */

  rewards: ItemStack[];  
  /**
 * nextQuestId：QuestState 内部字段。
 */

  nextQuestId?: string;  
  /**
 * requiredItemId：QuestState 内部字段。
 */

  requiredItemId?: string;  
  /**
 * requiredItemCount：QuestState 内部字段。
 */

  requiredItemCount?: number;  
  /**
 * giverId：QuestState 内部字段。
 */

  giverId: string;  
  /**
 * giverName：QuestState 内部字段。
 */

  giverName: string;  
  /**
 * giverMapId：QuestState 内部字段。
 */

  giverMapId?: string;  
  /**
 * giverMapName：QuestState 内部字段。
 */

  giverMapName?: string;  
  /**
 * giverX：QuestState 内部字段。
 */

  giverX?: number;  
  /**
 * giverY：QuestState 内部字段。
 */

  giverY?: number;  
  /**
 * targetMapId：QuestState 内部字段。
 */

  targetMapId?: string;  
  /**
 * targetMapName：QuestState 内部字段。
 */

  targetMapName?: string;  
  /**
 * targetX：QuestState 内部字段。
 */

  targetX?: number;  
  /**
 * targetY：QuestState 内部字段。
 */

  targetY?: number;  
  /**
 * targetNpcId：QuestState 内部字段。
 */

  targetNpcId?: string;  
  /**
 * targetNpcName：QuestState 内部字段。
 */

  targetNpcName?: string;  
  /**
 * submitNpcId：QuestState 内部字段。
 */

  submitNpcId?: string;  
  /**
 * submitNpcName：QuestState 内部字段。
 */

  submitNpcName?: string;  
  /**
 * submitMapId：QuestState 内部字段。
 */

  submitMapId?: string;  
  /**
 * submitMapName：QuestState 内部字段。
 */

  submitMapName?: string;  
  /**
 * submitX：QuestState 内部字段。
 */

  submitX?: number;  
  /**
 * submitY：QuestState 内部字段。
 */

  submitY?: number;  
  /**
 * relayMessage：QuestState 内部字段。
 */

  relayMessage?: string;
}

/** 任务自动导航的运行状态。 */
export interface QuestNavigationState {
/**
 * questId：QuestNavigationState 内部字段。
 */

  questId: string;  
  /**
 * pendingConfirmation：QuestNavigationState 内部字段。
 */

  pendingConfirmation?: boolean;  
  /**
 * pausedForCrossMapCooldown：QuestNavigationState 内部字段。
 */

  pausedForCrossMapCooldown?: boolean;  
  /**
 * lastBlockedRemainingTicks：QuestNavigationState 内部字段。
 */

  lastBlockedRemainingTicks?: number;
}

/** 待入日志本的消息条目。 */
export interface PendingLogbookMessage {
/**
 * id：PendingLogbookMessage 内部字段。
 */

  id: string;  
  /**
 * kind：PendingLogbookMessage 内部字段。
 */

  kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';  
  /**
 * text：PendingLogbookMessage 内部字段。
 */

  text: string;  
  /**
 * from：PendingLogbookMessage 内部字段。
 */

  from?: string;  
  /**
 * at：PendingLogbookMessage 内部字段。
 */

  at: number;
}

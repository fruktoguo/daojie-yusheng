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
  id: string;
  title: string;
  desc: string;
  line: QuestLine;
  chapter?: string;
  story?: string;
  status: QuestStatus;
  objectiveType: QuestObjectiveType;
  objectiveText?: string;
  progress: number;
  required: number;
  targetName: string;
  targetTechniqueId?: string;
  targetRealmStage?: PlayerRealmStage;
  rewardText: string;
  targetMonsterId: string;
  rewardItemId: string;
  rewardItemIds: string[];
  rewards: ItemStack[];
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
  giverId: string;
  giverName: string;
  giverMapId?: string;
  giverMapName?: string;
  giverX?: number;
  giverY?: number;
  targetMapId?: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  targetNpcId?: string;
  targetNpcName?: string;
  submitNpcId?: string;
  submitNpcName?: string;
  submitMapId?: string;
  submitMapName?: string;
  submitX?: number;
  submitY?: number;
  relayMessage?: string;
}

/** 任务自动导航的运行状态。 */
export interface QuestNavigationState {
  questId: string;
  pendingConfirmation?: boolean;
  pausedForCrossMapCooldown?: boolean;
  lastBlockedRemainingTicks?: number;
}

/** 待入日志本的消息条目。 */
export interface PendingLogbookMessage {
  id: string;
  kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';
  text: string;
  from?: string;
  at: number;
}

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
 * id：ID标识。
 */

  id: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * desc：desc相关字段。
 */

  desc: string;  
  /**
 * line：line相关字段。
 */

  line: QuestLine;  
  /**
 * chapter：chapter相关字段。
 */

  chapter?: string;  
  /**
 * story：story相关字段。
 */

  story?: string;  
  /**
 * status：statu状态或数据块。
 */

  status: QuestStatus;  
  /**
 * objectiveType：objectiveType相关字段。
 */

  objectiveType: QuestObjectiveType;  
  /**
 * objectiveText：objectiveText名称或显示文本。
 */

  objectiveText?: string;  
  /**
 * progress：进度状态或数据块。
 */

  progress: number;  
  /**
 * required：required相关字段。
 */

  required: number;  
  /**
 * targetName：目标名称名称或显示文本。
 */

  targetName: string;  
  /**
 * targetTechniqueId：目标功法ID标识。
 */

  targetTechniqueId?: string;  
  /**
 * targetRealmStage：目标RealmStage相关字段。
 */

  targetRealmStage?: PlayerRealmStage;  
  /**
 * rewardText：rewardText名称或显示文本。
 */

  rewardText: string;  
  /**
 * targetMonsterId：目标怪物ID标识。
 */

  targetMonsterId: string;  
  /**
 * rewardItemId：reward道具ID标识。
 */

  rewardItemId: string;  
  /**
 * rewardItemIds：reward道具ID相关字段。
 */

  rewardItemIds: string[];  
  /**
 * rewards：reward相关字段。
 */

  rewards: ItemStack[];  
  /**
 * nextQuestId：next任务ID标识。
 */

  nextQuestId?: string;  
  /**
 * requiredItemId：required道具ID标识。
 */

  requiredItemId?: string;  
  /**
 * requiredItemCount：数量或计量字段。
 */

  requiredItemCount?: number;  
  /**
 * giverId：giverID标识。
 */

  giverId: string;  
  /**
 * giverName：giver名称名称或显示文本。
 */

  giverName: string;  
  /**
 * giverMapId：giver地图ID标识。
 */

  giverMapId?: string;  
  /**
 * giverMapName：giver地图名称名称或显示文本。
 */

  giverMapName?: string;  
  /**
 * giverX：giverX相关字段。
 */

  giverX?: number;  
  /**
 * giverY：giverY相关字段。
 */

  giverY?: number;  
  /**
 * targetMapId：目标地图ID标识。
 */

  targetMapId?: string;  
  /**
 * targetMapName：目标地图名称名称或显示文本。
 */

  targetMapName?: string;  
  /**
 * targetX：目标X相关字段。
 */

  targetX?: number;  
  /**
 * targetY：目标Y相关字段。
 */

  targetY?: number;  
  /**
 * targetNpcId：目标NPCID标识。
 */

  targetNpcId?: string;  
  /**
 * targetNpcName：目标NPC名称名称或显示文本。
 */

  targetNpcName?: string;  
  /**
 * submitNpcId：submitNPCID标识。
 */

  submitNpcId?: string;  
  /**
 * submitNpcName：submitNPC名称名称或显示文本。
 */

  submitNpcName?: string;  
  /**
 * submitMapId：submit地图ID标识。
 */

  submitMapId?: string;  
  /**
 * submitMapName：submit地图名称名称或显示文本。
 */

  submitMapName?: string;  
  /**
 * submitX：submitX相关字段。
 */

  submitX?: number;  
  /**
 * submitY：submitY相关字段。
 */

  submitY?: number;  
  /**
 * relayMessage：relayMessage相关字段。
 */

  relayMessage?: string;
}

/** 任务同步运行态：静态文本、奖励、位置等由客户端本地任务模板按 id 补齐。 */
export interface QuestRuntimeStateView {
/**
 * id：任务ID标识。
 */

  id: string;
  /**
 * status：任务状态。
 */

  status: QuestStatus;
  /**
 * progress：服务端裁定的当前进度。
 */

  progress: number;
}

/** 任务自动导航的运行状态。 */
export interface QuestNavigationState {
/**
 * questId：任务ID标识。
 */

  questId: string;  
  /**
 * pendingConfirmation：pendingConfirmation相关字段。
 */

  pendingConfirmation?: boolean;  
  /**
 * pausedForCrossMapCooldown：pausedForCross地图冷却相关字段。
 */

  pausedForCrossMapCooldown?: boolean;  
  /**
 * lastBlockedRemainingTicks：lastBlockedRemainingtick相关字段。
 */

  lastBlockedRemainingTicks?: number;
}

/** 待入日志本的消息条目。 */
export interface PendingLogbookMessage {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * kind：kind相关字段。
 */

  kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * from：from相关字段。
 */

  from?: string;  
  /**
 * at：at相关字段。
 */

  at: number;
}

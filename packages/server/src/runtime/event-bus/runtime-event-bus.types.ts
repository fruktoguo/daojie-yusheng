/**
 * 运行时事件总线服务端内部类型。
 * 队列结构、flush 结果、配置常量。
 */

import type { CombatEffect, NoticeKind } from '@mud/shared';
import type {
  NoticeQueueEntry,
  PanelKind,
  PanelPatch,
  ActiveJobProgress,
  TechniquePanelKind,
  AoiPresentationEvent,
  PlayerStateDelta,
  PlayerFeedback,
} from '@mud/shared';

// ─── 队列上限常量 ───

/** 单玩家单 tick 通知上限。 */
export const MAX_NOTICES_PER_PLAYER = 32;

/** 单实例单 tick 战斗表现上限。 */
export const MAX_COMBAT_EFFECTS_PER_INSTANCE = 64;

/** 单实例单 tick AOI 表现上限。 */
export const MAX_AOI_EFFECTS_PER_INSTANCE = 128;

/** 单玩家单 tick 面板 patch 合并上限（按 panelKind）。 */
export const MAX_PANEL_PATCHES_PER_PLAYER = 10;

/** 单玩家单 tick 反馈上限。 */
export const MAX_FEEDBACK_PER_PLAYER = 8;

/**
 * 通知优先级表：值越大优先级越高，越不容易在过载时被丢弃。
 * 与 RuntimeEventBusService.queuePlayerNotice 内部驱逐策略保持一致，
 * 共享给 transfer buffer / 玩家本地 fallback 队列等其他出口使用。
 */
export const NOTICE_KIND_PRIORITY: Record<NoticeKind, number> = {
  combat: 1,
  chat: 1,
  grudge: 1,
  info: 2,
  travel: 2,
  quest: 3,
  loot: 3,
  system: 4,
  success: 5,
  warn: 6,
};

/** 获取通知优先级，默认 0。 */
export function resolveNoticePriority(notice: { kind?: NoticeKind | string } | null | undefined): number {
  if (!notice || typeof notice !== 'object') {
    return 0;
  }
  const kind = (notice.kind ?? 'info') as NoticeKind;
  return NOTICE_KIND_PRIORITY[kind] ?? 0;
}

/** 在已有 notice 队列中找到优先级最低的下标，平局取最早。 */
export function findLowestPriorityNoticeIndex(notices: Array<{ kind?: NoticeKind | string }>): number {
  let index = 0;
  let priority = Number.POSITIVE_INFINITY;
  for (let i = 0; i < notices.length; i += 1) {
    const current = NOTICE_KIND_PRIORITY[(notices[i]?.kind ?? 'info') as NoticeKind] ?? 0;
    if (current < priority) {
      priority = current;
      index = i;
    }
  }
  return index;
}

// ─── 玩家维度队列 ───

export interface PlayerEventQueue {
  notices: NoticeQueueEntry[];
  minNoticePriority: number;
  panelPatches: Map<PanelKind, PanelPatch>;
  activeJobs: Map<string, ActiveJobProgress>;
  techniquePanelDirty: Set<TechniquePanelKind>;
  stateDelta: PlayerStateDelta | null;
  feedback: PlayerFeedback[];
  gmStatePush: boolean;
}

// ─── 实例维度队列 ───

export interface InstanceEventQueue {
  combatEffects: CombatEffect[];
  aoiEffects: Map<string, AoiPresentationEvent>;
}

// ─── Flush 结果（指标用） ───

export interface FlushResult {
  playerCount: number;
  instanceCount: number;
  totalNotices: number;
  totalCombatEffects: number;
  totalAoiEffects: number;
  totalPanelPatches: number;
  totalActiveJobs: number;
  totalTechniqueDirty: number;
  totalStateDeltas: number;
  totalFeedback: number;
  totalGmStatePushes: number;
}

// ─── Drain 结果（供 SyncService 消费） ───

export interface PlayerDrainResult {
  notices: NoticeQueueEntry[];
  panelPatches: Map<PanelKind, PanelPatch> | null;
  activeJobs: ActiveJobProgress[] | null;
  techniqueDirty: TechniquePanelKind[] | null;
  stateDelta: PlayerStateDelta | null;
  feedback: PlayerFeedback[] | null;
  gmStatePush: boolean;
}

export interface InstanceDrainResult {
  combatEffects: CombatEffect[];
  aoiEffects: AoiPresentationEvent[];
}

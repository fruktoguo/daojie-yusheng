/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 运行时事件总线共享类型定义。
 * 跨端协议载荷结构，服务端 queue/flush，客户端消费。
 */

import type { CombatEffect } from './action-combat-types';
import type { NoticeKind, StructuredNoticePayload, CombatNoticePayload } from './notice-types';

/** 面板种类枚举。 */
export type PanelKind =
  | 'inventory'
  | 'equipment'
  | 'craft'
  | 'technique'
  | 'quest'
  | 'mail'
  | 'market'
  | 'building'
  | 'cultivation'
  | 'leaderboard'
  | 'alchemy'
  | 'forging'
  | 'enhancement'
  | 'gather'
  | 'mining';

/** 功法面板种类。 */
export type TechniquePanelKind = 'active' | 'passive' | 'formation';

/** 面板增量 patch。 */
export interface PanelPatch {
  revision?: number;
  added?: Record<string, unknown>;
  removed?: string[];
  updated?: Record<string, unknown>;
}

/** 活跃任务/制作进度。 */
export interface ActiveJobProgress {
  jobId: string;
  jobType: string;
  progress: number; // 0-1
  remainingMs?: number;
  label?: string;
}

/** 玩家状态增量。 */
export interface PlayerStateDelta {
  hp?: number;
  mp?: number;
  exp?: number;
  level?: number;
  buffs?: { added?: string[]; removed?: string[] };
  [key: string]: unknown;
}

/** 玩家即时反馈。 */
export interface PlayerFeedback {
  type: 'confirm' | 'reject' | 'cooldown' | 'insufficient';
  action: string;
  message?: string;
}

/** 战斗表现事件沿用当前 world delta fx 战斗特效结构。 */
export type CombatPresentationEvent = CombatEffect;

/** AOI 表现事件。 */
export interface AoiPresentationEvent {
  type: 'appear' | 'disappear' | 'action' | 'emote' | 'statusChange';
  entityId: string;
  entityType: 'player' | 'monster' | 'npc' | 'item';
  x: number;
  y: number;
  data?: Record<string, unknown>;
}

/** EventBus drain 后可附加到同步载荷的结构。 */
export interface TickEventBusPayload {
  notices?: NoticeQueueEntry[];
  panelPatches?: Record<PanelKind, PanelPatch>;
  jobProgress?: Record<string, ActiveJobProgress>;
  techniqueDirty?: TechniquePanelKind[];
  stateDelta?: PlayerStateDelta;
  feedbacks?: PlayerFeedback[];
  combatEffects?: CombatPresentationEvent[];
  aoiEffects?: AoiPresentationEvent[];
}

/** 通知入队载荷（EventBus 内部使用）。 */
export interface NoticeQueueEntry {
  id: number;
  kind: NoticeKind;
  text: string;
  castId?: string;
  combat?: CombatNoticePayload;
  combatGroup?: CombatNoticePayload[];
  structured?: StructuredNoticePayload;
  structuredGroup?: StructuredNoticePayload[];
}

/** GM 状态推送标记类型。 */
export type GmStatePushMark = string; // playerId

/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { CombatEffect } from '@mud/shared';
import type {
  TickEventBusPayload,
  NoticeQueueEntry,
  NoticeKind,
  NoticePillConfig,
  PanelKind,
  PanelPatch,
  ActiveJobProgress,
  TechniquePanelKind,
  AoiPresentationEvent,
  PlayerStateDelta,
  PlayerFeedback,
} from '@mud/shared';
import type {
  PlayerEventQueue,
  InstanceEventQueue,
  PlayerDrainResult,
  InstanceDrainResult,
  FlushResult,
} from './runtime-event-bus.types';
import {
  MAX_NOTICES_PER_PLAYER,
  MAX_AOI_EFFECTS_PER_INSTANCE,
  MAX_PANEL_PATCHES_PER_PLAYER,
  MAX_FEEDBACK_PER_PLAYER,
  NOTICE_AGGREGATE_LIST_LIMIT,
  NON_AGGREGATED_NOTICE_KINDS,
  NOTICE_KIND_PRIORITY,
  STRUCTURED_NOTICE_AGGREGATION_RULES,
  type StructuredNoticeAggregationRule,
  findLowestPriorityNoticeIndex,
  resolveCombatEffectsLimit,
} from './runtime-event-bus.types';
import { RuntimeEventBusMetricsService } from './runtime-event-bus-metrics.service';

/** 创建空的玩家事件队列。 */
function createPlayerQueue(): PlayerEventQueue {
  return {
    notices: [],
    minNoticePriority: Number.POSITIVE_INFINITY,
    panelPatches: new Map(),
    activeJobs: new Map(),
    techniquePanelDirty: new Set(),
    stateDelta: null,
    feedback: [],
    gmStatePush: false,
  };
}

/** 创建空的实例事件队列。 */
function createInstanceQueue(): InstanceEventQueue {
  return {
    combatEffects: [],
    aoiEffects: new Map(),
  };
}

@Injectable()
export class RuntimeEventBusService {
  private readonly logger = new Logger(RuntimeEventBusService.name);

  /** 可选指标服务（NestJS 注入或手动设置）。 */
  metrics: RuntimeEventBusMetricsService | null = null;

  constructor(@Optional() @Inject(RuntimeEventBusMetricsService) metrics?: RuntimeEventBusMetricsService) {
    if (metrics) this.metrics = metrics;
  }

  /** 玩家维度队列，懒创建。 */
  private readonly playerQueues = new Map<string, PlayerEventQueue>();

  /** 实例维度队列，懒创建。 */
  private readonly instanceQueues = new Map<string, InstanceEventQueue>();

  /** 通知自增 ID（全局递增，不需要持久化）。 */
  private noticeIdCounter = 0;

  // ─── 指标累计 ───
  private lastFlushResult: FlushResult | null = null;

  // ═══════════════════════════════════════════════════════════════
  // 玩家维度 queue 方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 追加玩家通知。超上限时保留更高优先级通知，低优先级新通知可被直接拒收。
   * 规则：追加模式，上限 MAX_NOTICES_PER_PLAYER。
   */
  queuePlayerNotice(playerId: string, notice: Omit<NoticeQueueEntry, 'id'> | NoticeQueueEntry): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    const normalizedNotice = {
      ...notice,
      id: typeof (notice as NoticeQueueEntry).id === 'number' ? (notice as NoticeQueueEntry).id : ++this.noticeIdCounter,
    };
    const noticePriority = NOTICE_KIND_PRIORITY[normalizedNotice.kind] ?? 0;
    const groupedResult = tryAggregateGroupedNotice(queue.notices, normalizedNotice);
    if (groupedResult.merged) {
      if (noticePriority < queue.minNoticePriority) {
        queue.minNoticePriority = noticePriority;
      }
      this.metrics?.recordMerged('playerNotice');
      return;
    }
    const aggregateResult = tryAggregateStructuredNotice(queue.notices, normalizedNotice);
    if (aggregateResult.merged) {
      if (noticePriority < queue.minNoticePriority) {
        queue.minNoticePriority = noticePriority;
      }
      this.metrics?.recordMerged('playerNotice');
      return;
    }
    const existingIndex = normalizedNotice.structured
      ? queue.notices.findIndex((entry) => isSameNotice(entry, normalizedNotice))
      : -1;
    if (existingIndex >= 0 && queue.notices[existingIndex]) {
      queue.notices[existingIndex] = {
        ...normalizedNotice,
        id: queue.notices[existingIndex].id,
      };
      if (noticePriority < queue.minNoticePriority) {
        queue.minNoticePriority = noticePriority;
      }
      this.metrics?.recordMerged('playerNotice');
      return;
    }
    if (queue.notices.length >= MAX_NOTICES_PER_PLAYER) {
      const dropIndex = findLowestPriorityNoticeIndex(queue.notices);
      const droppedPriority = NOTICE_KIND_PRIORITY[queue.notices[dropIndex]?.kind ?? 'info'] ?? 0;
      if (noticePriority < droppedPriority) {
        this.metrics?.recordDropped('playerNotice', 1, getNoticeDropDetail(normalizedNotice), 'lowPriorityReject');
        return;
      }
      const droppedNotice = queue.notices[dropIndex];
      queue.notices.splice(dropIndex, 1);
      this.metrics?.recordDropped('playerNotice', 1, getNoticeDropDetail(droppedNotice ?? normalizedNotice), 'queueLimitEvict');
      queue.minNoticePriority = findLowestNoticePriority(queue.notices);
    }
    queue.notices.push(normalizedNotice);
    if (noticePriority < queue.minNoticePriority) {
      queue.minNoticePriority = noticePriority;
    }
    this.metrics?.recordQueued('playerNotice');
  }

  /**
   * 面板增量 patch。同 panelKind 深合并。
   * 规则：合并模式，同 panelKind 的 patch 浅合并 added/updated/removed。
   */
  queuePlayerPanelPatch(playerId: string, panelKind: PanelKind, patch: PanelPatch): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    const existing = queue.panelPatches.get(panelKind);
    if (!existing) {
      if (queue.panelPatches.size >= MAX_PANEL_PATCHES_PER_PLAYER) {
        this.metrics?.recordDropped('panelPatch');
        return; // 超上限丢弃
      }
      queue.panelPatches.set(panelKind, { ...patch });
      this.metrics?.recordQueued('panelPatch');
      return;
    }
    // 合并
    if (patch.revision !== undefined) {
      existing.revision = patch.revision;
    }
    if (patch.added) {
      existing.added = existing.added
        ? { ...existing.added, ...patch.added }
        : { ...patch.added };
    }
    if (patch.updated) {
      existing.updated = existing.updated
        ? { ...existing.updated, ...patch.updated }
        : { ...patch.updated };
    }
    if (patch.removed) {
      existing.removed = existing.removed
        ? [...existing.removed, ...patch.removed]
        : [...patch.removed];
    }
    this.metrics?.recordMerged('panelPatch');
  }

  /**
   * 活跃任务/制作进度。同 jobId 覆盖。
   * 规则：覆盖模式，同 jobId 以最后一次为准。
   */
  queueActiveJobProgress(playerId: string, progress: ActiveJobProgress): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    const hadExisting = queue.activeJobs.has(progress.jobId);
    queue.activeJobs.set(progress.jobId, progress);
    if (hadExisting) {
      this.metrics?.recordMerged('jobProgress');
    } else {
      this.metrics?.recordQueued('jobProgress');
    }
  }

  /**
   * 标记功法/技能面板需要刷新。同 kind 去重。
   */
  queueTechniquePanelRefresh(playerId: string, kind: TechniquePanelKind): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    const hadExisting = queue.techniquePanelDirty.has(kind);
    queue.techniquePanelDirty.add(kind);
    if (hadExisting) {
      this.metrics?.recordMerged('techniquePanelRefresh');
    } else {
      this.metrics?.recordQueued('techniquePanelRefresh');
    }
  }

  /**
   * 玩家状态增量。同 tick 内合并。
   * 规则：合并模式，字段浅合并，buffs 追加。
   */
  queuePlayerStateDelta(playerId: string, delta: PlayerStateDelta): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    if (!queue.stateDelta) {
      queue.stateDelta = { ...delta };
      this.metrics?.recordQueued('stateDelta');
      return;
    }
    // 浅合并
    const existing = queue.stateDelta;
    for (const key of Object.keys(delta)) {
      if (key === 'buffs') {
        const existingBuffs = existing.buffs;
        const newBuffs = delta.buffs;
        if (newBuffs) {
          existing.buffs = {
            added: [...(existingBuffs?.added ?? []), ...(newBuffs.added ?? [])],
            removed: [...(existingBuffs?.removed ?? []), ...(newBuffs.removed ?? [])],
          };
        }
      } else {
        (existing as Record<string, unknown>)[key] = (delta as Record<string, unknown>)[key];
      }
    }
    this.metrics?.recordMerged('stateDelta');
  }

  /**
   * 玩家即时反馈。追加模式，超上限丢弃最早。
   */
  queuePlayerFeedback(playerId: string, feedback: PlayerFeedback): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    if (queue.feedback.length >= MAX_FEEDBACK_PER_PLAYER) {
      queue.feedback.shift();
      this.metrics?.recordDropped('feedback');
    }
    queue.feedback.push(feedback);
    this.metrics?.recordQueued('feedback');
  }

  /**
   * 标记玩家需要 GM 状态推送。
   * 规则：去重模式（boolean flag）。
   */
  queueGmStatePush(playerId: string): void {
    const queue = this.getOrCreatePlayerQueue(playerId);
    if (!queue.gmStatePush) {
      queue.gmStatePush = true;
      this.metrics?.recordQueued('gmStatePush');
    }
    // 已为 true 时属于去重，不额外计数
  }

  // ═══════════════════════════════════════════════════════════════
  // 实例维度 queue 方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 追加实例战斗表现事件。超上限丢弃最早。
   */
  queueCombatEffect(instanceId: string, effect: CombatEffect): void {
    const queue = this.getOrCreateInstanceQueue(instanceId);
    const limit = resolveCombatEffectsLimit(instanceId);
    if (queue.combatEffects.length >= limit) {
      queue.combatEffects.shift();
      this.metrics?.recordDropped('combatEffect');
    }
    queue.combatEffects.push(freezeEventBusProjection(effect));
    this.metrics?.recordQueued('combatEffect');
  }

  /**
   * 战斗表现事件语义 API。当前协议沿用 world delta fx CombatEffect。
   */
  queueCombatPresentation(instanceId: string, event: CombatEffect): void {
    this.queueCombatEffect(instanceId, event);
  }

  /**
   * 批量追加实例战斗表现事件。
   */
  queueCombatEffects(instanceId: string, effects: CombatEffect[]): void {
    for (const effect of effects) {
      this.queueCombatEffect(instanceId, effect);
    }
  }

  /**
   * 追加实例 AOI 表现事件。同实体同类型保留最终态。
   */
  queueAoiPresentation(instanceId: string, event: AoiPresentationEvent): void {
    const queue = this.getOrCreateInstanceQueue(instanceId);
    const key = `${event.entityId}:${event.type}`;
    const hadExisting = queue.aoiEffects.has(key);
    if (!hadExisting && queue.aoiEffects.size >= MAX_AOI_EFFECTS_PER_INSTANCE) {
      const oldestKey = queue.aoiEffects.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        queue.aoiEffects.delete(oldestKey);
      }
      this.metrics?.recordDropped('aoiPresentation');
    }
    queue.aoiEffects.set(key, freezeEventBusProjection(event));
    if (hadExisting) {
      this.metrics?.recordMerged('aoiPresentation');
    } else {
      this.metrics?.recordQueued('aoiPresentation');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Drain 方法（供 WorldSyncService 在 flush 时消费）
  // ═══════════════════════════════════════════════════════════════

  /**
   * Drain 指定玩家的所有待发事件。
   * 调用后该玩家队列清空。消费侧不得修改返回的对象。
   */
  drainPlayer(playerId: string): PlayerDrainResult | null {
    const queue = this.playerQueues.get(playerId);
    if (!queue) {
      return null;
    }

    const hasContent = hasPlayerQueueContent(queue);

    if (!hasContent) {
      this.playerQueues.delete(playerId);
      return null;
    }

    // 移交引用，不拷贝
    const result: PlayerDrainResult = {
      notices: queue.notices.length > 0 ? queue.notices : [],
      panelPatches: queue.panelPatches.size > 0 ? queue.panelPatches : null,
      activeJobs: queue.activeJobs.size > 0 ? Array.from(queue.activeJobs.values()) : null,
      techniqueDirty: queue.techniquePanelDirty.size > 0 ? Array.from(queue.techniquePanelDirty.values()) : null,
      stateDelta: queue.stateDelta,
      feedback: queue.feedback.length > 0 ? queue.feedback : null,
      gmStatePush: queue.gmStatePush,
    };

    this.playerQueues.delete(playerId);

    return result;
  }

  /**
   * Drain 指定玩家事件并转换为 delta envelope 的 eventBus 载荷。
   * GM 状态推送不是客户端 eventBus 表现数据，仍由调用方读取 gmStatePush 后走既有 GM 状态发送。
   */
  drainPlayerEventBusPayload(playerId: string): { payload: TickEventBusPayload | null; gmStatePush: boolean } {
    const drainResult = this.drainPlayer(playerId);
    if (!drainResult) {
      return { payload: null, gmStatePush: false };
    }

    const payload: TickEventBusPayload = {};
    if (drainResult.notices.length > 0) {
      payload.notices = drainResult.notices;
    }
    if (drainResult.panelPatches && drainResult.panelPatches.size > 0) {
      const panelPatches = {} as Record<PanelKind, PanelPatch>;
      for (const [kind, patch] of drainResult.panelPatches) {
        panelPatches[kind] = patch;
      }
      payload.panelPatches = panelPatches;
    }
    if (drainResult.activeJobs && drainResult.activeJobs.length > 0) {
      const jobProgress: Record<string, ActiveJobProgress> = {};
      for (const progress of drainResult.activeJobs) {
        jobProgress[progress.jobId] = progress;
      }
      payload.jobProgress = jobProgress;
    }
    if (drainResult.techniqueDirty && drainResult.techniqueDirty.length > 0) {
      payload.techniqueDirty = drainResult.techniqueDirty;
    }
    if (drainResult.stateDelta) {
      payload.stateDelta = drainResult.stateDelta;
    }
    if (drainResult.feedback && drainResult.feedback.length > 0) {
      payload.feedbacks = drainResult.feedback;
    }

    return {
      payload: hasTickEventBusPayload(payload) ? payload : null,
      gmStatePush: drainResult.gmStatePush,
    };
  }

  /**
   * Drain 指定实例的战斗表现事件。
   * 调用后该实例队列清空。
   */
  drainInstance(instanceId: string): InstanceDrainResult | null {
    const queue = this.instanceQueues.get(instanceId);
    if (!queue || (queue.combatEffects.length === 0 && queue.aoiEffects.size === 0)) {
      if (queue) {
        this.instanceQueues.delete(instanceId);
      }
      return null;
    }

    const result: InstanceDrainResult = {
      combatEffects: queue.combatEffects,
      aoiEffects: queue.aoiEffects.size > 0 ? Array.from(queue.aoiEffects.values()) : [],
    };

    this.instanceQueues.delete(instanceId);
    return result;
  }

  /**
   * 清空指定玩家队列并返回计数摘要。
   */
  flushPlayer(playerId: string): FlushResult {
    const result = this.drainPlayer(playerId);
    return {
      playerCount: result ? 1 : 0,
      instanceCount: 0,
      totalNotices: result?.notices.length ?? 0,
      totalCombatEffects: 0,
      totalAoiEffects: 0,
      totalPanelPatches: result?.panelPatches?.size ?? 0,
      totalActiveJobs: result?.activeJobs?.length ?? 0,
      totalTechniqueDirty: result?.techniqueDirty?.length ?? 0,
      totalStateDeltas: result?.stateDelta ? 1 : 0,
      totalFeedback: result?.feedback?.length ?? 0,
      totalGmStatePushes: result?.gmStatePush ? 1 : 0,
    };
  }

  /**
   * 清空指定实例队列并返回计数摘要。
   */
  flushInstance(instanceId: string): FlushResult {
    const result = this.drainInstance(instanceId);
    return {
      playerCount: 0,
      instanceCount: result ? 1 : 0,
      totalNotices: 0,
      totalCombatEffects: result?.combatEffects.length ?? 0,
      totalAoiEffects: result?.aoiEffects.length ?? 0,
      totalPanelPatches: 0,
      totalActiveJobs: 0,
      totalTechniqueDirty: 0,
      totalStateDeltas: 0,
      totalFeedback: 0,
      totalGmStatePushes: 0,
    };
  }

  /**
   * 获取指定实例的战斗表现事件（不清空，供 envelope 组包时读取）。
   */
  getCombatEffects(instanceId: string): CombatEffect[] {
    const queue = this.instanceQueues.get(instanceId);
    return queue ? queue.combatEffects : [];
  }

  getAoiPresentations(instanceId: string): AoiPresentationEvent[] {
    const queue = this.instanceQueues.get(instanceId);
    return queue ? Array.from(queue.aoiEffects.values()) : [];
  }

  // ═══════════════════════════════════════════════════════════════
  // Flush（tick 末尾由 WorldTickService 调用）
  // ═══════════════════════════════════════════════════════════════

  /**
   * tick 末尾统一 flush。
   * 清空所有实例队列的战斗表现（因为 envelope 已经在 sync 时读取过了）。
   * 返回本次 flush 的指标摘要。
   */
  flushTick(): FlushResult {
    const flushStart = performance.now();

    let totalNotices = 0;
    let totalCombatEffects = 0;
    let totalAoiEffects = 0;
    let totalPanelPatches = 0;
    let totalActiveJobs = 0;
    let totalTechniqueDirty = 0;
    let totalStateDeltas = 0;
    let totalFeedback = 0;
    let totalGmStatePushes = 0;
    let playerCount = 0;
    let instanceCount = 0;
    let maxPlayerQueueSize = 0;
    let maxInstanceQueueSize = 0;

    // 清空未被在线同步 drain 的玩家维度队列，EventBus 只保留当前 tick 的暂存事件。
    for (const [playerId, queue] of this.playerQueues) {
      const queueSize =
        queue.notices.length +
        queue.panelPatches.size +
        queue.activeJobs.size +
        queue.techniquePanelDirty.size +
        (queue.stateDelta ? 1 : 0) +
        queue.feedback.length +
        (queue.gmStatePush ? 1 : 0);
      if (queueSize > maxPlayerQueueSize) maxPlayerQueueSize = queueSize;
      if (queue.notices.length > 0 || queue.panelPatches.size > 0 ||
          queue.activeJobs.size > 0 || queue.techniquePanelDirty.size > 0 ||
          queue.stateDelta !== null || queue.feedback.length > 0 || queue.gmStatePush) {
        playerCount++;
        totalNotices += queue.notices.length;
        totalPanelPatches += queue.panelPatches.size;
        totalActiveJobs += queue.activeJobs.size;
        totalTechniqueDirty += queue.techniquePanelDirty.size;
        if (queue.stateDelta !== null) totalStateDeltas++;
        totalFeedback += queue.feedback.length;
        if (queue.gmStatePush) totalGmStatePushes++;
      }
      this.playerQueues.delete(playerId);
    }

    // 清空实例维度战斗表现（sync 已读取完毕）
    for (const [instanceId, queue] of this.instanceQueues) {
      if (queue.combatEffects.length > maxInstanceQueueSize) {
        maxInstanceQueueSize = queue.combatEffects.length;
      }
      if (queue.aoiEffects.size > maxInstanceQueueSize) {
        maxInstanceQueueSize = queue.aoiEffects.size;
      }
      if (queue.combatEffects.length > 0 || queue.aoiEffects.size > 0) {
        instanceCount++;
        totalCombatEffects += queue.combatEffects.length;
        totalAoiEffects += queue.aoiEffects.size;
      }
      this.instanceQueues.delete(instanceId);
    }

    const flushedTotal =
      totalNotices +
      totalCombatEffects +
      totalAoiEffects +
      totalPanelPatches +
      totalActiveJobs +
      totalTechniqueDirty +
      totalStateDeltas +
      totalFeedback +
      totalGmStatePushes;
    const flushDurationMs = performance.now() - flushStart;

    // 记录指标
    if (this.metrics) {
      this.metrics.recordWatermark(playerCount, instanceCount, maxPlayerQueueSize, maxInstanceQueueSize);
      this.metrics.recordFlush(flushDurationMs, flushedTotal);
      this.metrics.resetTick();
    }

    const result: FlushResult = {
      playerCount,
      instanceCount,
      totalNotices,
      totalCombatEffects,
      totalAoiEffects,
      totalPanelPatches,
      totalActiveJobs,
      totalTechniqueDirty,
      totalStateDeltas,
      totalFeedback,
      totalGmStatePushes,
    };

    this.lastFlushResult = result;
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // 生命周期管理
  // ═══════════════════════════════════════════════════════════════

  /** 玩家下线时清空其队列。 */
  discardPlayer(playerId: string): void {
    this.playerQueues.delete(playerId);
  }

  /** 实例销毁时清空其队列。 */
  discardInstance(instanceId: string): void {
    this.instanceQueues.delete(instanceId);
  }

  /** 获取最近一次 flush 指标。 */
  getLastFlushResult(): FlushResult | null {
    return this.lastFlushResult;
  }

  /** 获取当前活跃玩家队列数。 */
  getPlayerQueueCount(): number {
    return this.playerQueues.size;
  }

  /** 获取当前活跃实例队列数。 */
  getInstanceQueueCount(): number {
    return this.instanceQueues.size;
  }

  // ═══════════════════════════════════════════════════════════════
  // 内部工具
  // ═══════════════════════════════════════════════════════════════

  private getOrCreatePlayerQueue(playerId: string): PlayerEventQueue {
    let queue = this.playerQueues.get(playerId);
    if (!queue) {
      queue = createPlayerQueue();
      this.playerQueues.set(playerId, queue);
    }
    return queue;
  }

  private getOrCreateInstanceQueue(instanceId: string): InstanceEventQueue {
    let queue = this.instanceQueues.get(instanceId);
    if (!queue) {
      queue = createInstanceQueue();
      this.instanceQueues.set(instanceId, queue);
    }
    return queue;
  }
}

function hasPlayerQueueContent(queue: PlayerEventQueue): boolean {
  return (
    queue.notices.length > 0 ||
    queue.panelPatches.size > 0 ||
    queue.activeJobs.size > 0 ||
    queue.techniquePanelDirty.size > 0 ||
    queue.stateDelta !== null ||
    queue.feedback.length > 0 ||
    queue.gmStatePush
  );
}

const NOTICE_KIND_PRIORITY_TABLE = NOTICE_KIND_PRIORITY;

function findLowestNoticePriority(notices: NoticeQueueEntry[]): number {
  let priority = Number.POSITIVE_INFINITY;
  for (let i = 0; i < notices.length; i += 1) {
    const current = NOTICE_KIND_PRIORITY_TABLE[notices[i]?.kind ?? 'info'] ?? 0;
    if (current < priority) {
      priority = current;
    }
  }
  return priority;
}

function tryAggregateGroupedNotice(
  notices: NoticeQueueEntry[],
  incoming: NoticeQueueEntry,
): { merged: boolean } {
  if (incoming.kind === 'combat' && incoming.combat) {
    const existingIndex = notices.findIndex((entry) => canGroupCombatNotice(entry));
    if (existingIndex >= 0 && notices[existingIndex]) {
      notices[existingIndex] = buildCombatGroupNotice(notices[existingIndex], incoming);
      return { merged: true };
    }
  }
  if (incoming.structured?.key === 'notice.combat.kill-progress') {
    const existingIndex = notices.findIndex((entry) => canGroupStructuredNotice(entry, 'notice.combat.kill-progress'));
    if (existingIndex >= 0 && notices[existingIndex]) {
      notices[existingIndex] = buildStructuredGroupNotice(notices[existingIndex], incoming);
      return { merged: true };
    }
  }
  return { merged: false };
}

function canGroupCombatNotice(notice: NoticeQueueEntry): boolean {
  return notice.kind === 'combat' && (notice.combat !== undefined || (Array.isArray(notice.combatGroup) && notice.combatGroup.length > 0));
}

function buildCombatGroupNotice(existing: NoticeQueueEntry, incoming: NoticeQueueEntry): NoticeQueueEntry {
  const existingGroup = Array.isArray(existing.combatGroup) && existing.combatGroup.length > 0
    ? [...existing.combatGroup]
    : existing.combat
      ? [existing.combat]
      : [];
  if (incoming.combat) {
    existingGroup.push(incoming.combat);
  }
  return {
    ...incoming,
    id: existing.id,
    kind: existing.kind,
    text: appendNoticeText(existing.text, incoming.text),
    castId: existing.castId ?? incoming.castId,
    combat: existingGroup[0] ?? existing.combat ?? incoming.combat,
    combatGroup: existingGroup,
    structured: existing.structured ?? incoming.structured,
    structuredGroup: existing.structuredGroup ?? incoming.structuredGroup,
  };
}

function canGroupStructuredNotice(notice: NoticeQueueEntry, key: string): boolean {
  return notice.structured?.key === key && (notice.structured !== undefined || (Array.isArray(notice.structuredGroup) && notice.structuredGroup.length > 0));
}

function buildStructuredGroupNotice(existing: NoticeQueueEntry, incoming: NoticeQueueEntry): NoticeQueueEntry {
  const existingGroup = Array.isArray(existing.structuredGroup) && existing.structuredGroup.length > 0
    ? [...existing.structuredGroup]
    : existing.structured
      ? [existing.structured]
      : [];
  if (incoming.structured) {
    existingGroup.push(incoming.structured);
  }
  return {
    ...incoming,
    id: existing.id,
    kind: existing.kind,
    text: appendNoticeText(existing.text, incoming.text),
    castId: existing.castId ?? incoming.castId,
    combat: existing.combat ?? incoming.combat,
    combatGroup: existing.combatGroup ?? incoming.combatGroup,
    structured: existingGroup[0] ?? existing.structured ?? incoming.structured,
    structuredGroup: existingGroup,
  };
}

function appendNoticeText(left: string, right: string): string {
  const trimmedLeft = left.trim();
  const trimmedRight = right.trim();
  if (!trimmedLeft) return trimmedRight;
  if (!trimmedRight) return trimmedLeft;
  return `${trimmedLeft}\n${trimmedRight}`;
}

function tryAggregateStructuredNotice(
  notices: NoticeQueueEntry[],
  incoming: NoticeQueueEntry,
): { merged: boolean } {
  const rule = resolveAggregationRule(incoming);
  if (!rule) {
    return { merged: false };
  }
  const existingIndex = notices.findIndex((entry) => canAggregateWithRule(entry, rule));
  const existing = existingIndex >= 0 ? notices[existingIndex] : undefined;
  if (!existing) {
    return { merged: false };
  }
  notices[existingIndex] = buildAggregatedNotice(existing, incoming, rule);
  return { merged: true };
}

function resolveAggregationRule(notice: NoticeQueueEntry): StructuredNoticeAggregationRule | null {
  const key = notice.structured?.key;
  if (!key || NON_AGGREGATED_NOTICE_KINDS.has(notice.kind)) {
    return null;
  }
  return STRUCTURED_NOTICE_AGGREGATION_RULES.find((rule) => canAggregateKey(rule, key)) ?? null;
}

function canAggregateWithRule(notice: NoticeQueueEntry, rule: StructuredNoticeAggregationRule): boolean {
  const key = notice.structured?.key;
  if (!key || NON_AGGREGATED_NOTICE_KINDS.has(notice.kind)) {
    return false;
  }
  return canAggregateKey(rule, key);
}

function canAggregateKey(rule: StructuredNoticeAggregationRule, key: string): boolean {
  return key === rule.aggregateKey || rule.sourceKeys.includes(key);
}

function buildAggregatedNotice(
  existing: NoticeQueueEntry,
  incoming: NoticeQueueEntry,
  rule: StructuredNoticeAggregationRule,
): NoticeQueueEntry {
  const existingItems = extractAggregationItems(existing, rule);
  const incomingItems = extractAggregationItems(incoming, rule);
  const allItems = [...existingItems.items, ...incomingItems.items];
  const count = existingItems.count + incomingItems.count;
  const visibleItems = allItems.slice(0, NOTICE_AGGREGATE_LIST_LIMIT);
  const list = visibleItems.join('、');
  const extraCount = Math.max(0, count - visibleItems.length);
  const badges = mergeNoticeBadges(existing.structured?.badges, incoming.structured?.badges, rule.badge);
  const pills: NoticePillConfig[] = [{ key: rule.listVarKey, style: rule.pillStyle }];
  const vars = {
    [rule.listVarKey]: list,
    count,
    extraCount,
  };
  return {
    ...incoming,
    id: existing.id,
    kind: existing.kind,
    text: `${rule.fallbackPrefix} ${count} 项`,
    castId: existing.castId ?? incoming.castId,
    structured: {
      key: rule.aggregateKey,
      vars,
      pills,
      ...(badges.length > 0 ? { badges } : undefined),
    },
  };
}

function extractAggregationItems(
  notice: NoticeQueueEntry,
  rule: StructuredNoticeAggregationRule,
): { items: string[]; count: number } {
  const vars = notice.structured?.vars ?? {};
  if (notice.structured?.key === rule.aggregateKey) {
    const items = splitNoticeListValue(vars[rule.listVarKey]);
    const count = Math.max(items.length, normalizeNoticeCount(vars.count, items.length));
    return { items, count };
  }
  const items: string[] = [];
  for (const varKey of rule.itemVarKeys) {
    items.push(...splitNoticeListValue(vars[varKey]));
  }
  if (items.length > 0) {
    return { items, count: items.length };
  }
  const fallback = notice.text.trim();
  return { items: fallback ? [fallback] : [], count: fallback ? 1 : 0 };
}

function splitNoticeListValue(value: string | number | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return String(value)
    .split('、')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeNoticeCount(value: string | number | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

function mergeNoticeBadges(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
  required?: string,
): string[] {
  const merged = new Set<string>();
  for (const badge of left ?? []) {
    if (badge) merged.add(badge);
  }
  for (const badge of right ?? []) {
    if (badge) merged.add(badge);
  }
  if (required) {
    merged.add(required);
  }
  return Array.from(merged);
}

function isSameNotice(left: NoticeQueueEntry, right: Omit<NoticeQueueEntry, 'id'> | NoticeQueueEntry): boolean {
  if (left.structured || right.structured) {
    return left.structured?.key === right.structured?.key
      && shallowEqualNoticeVars(left.structured?.vars, right.structured?.vars);
  }
  return left.kind === right.kind && left.text === right.text && left.castId === right.castId;
}

function getNoticeDropDetail(notice: Omit<NoticeQueueEntry, 'id'> | NoticeQueueEntry): string {
  const kind = typeof notice.kind === 'string' && notice.kind.length > 0 ? notice.kind : 'unknown';
  if (Array.isArray(notice.structuredGroup) && notice.structuredGroup.length > 0) {
    const structuredKey = notice.structuredGroup[0]?.key;
    return typeof structuredKey === 'string' && structuredKey.length > 0 ? `${kind}:${structuredKey}:group` : `${kind}:structured-group`;
  }
  const structuredKey = notice.structured?.key;
  if (typeof structuredKey === 'string' && structuredKey.length > 0) {
    return `${kind}:${structuredKey}`;
  }
  if (Array.isArray(notice.combatGroup) && notice.combatGroup.length > 0) {
    return `${kind}:combat-group`;
  }
  if (notice.combat) {
    return `${kind}:combat`;
  }
  return `${kind}:unstructured`;
}

function shallowEqualNoticeVars(
  left: Record<string, string | number> | undefined,
  right: Record<string, string | number> | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function freezeEventBusProjection<T extends object>(entry: T): T {
  if (entry && process.env.NODE_ENV !== 'production') {
    Object.freeze(entry);
  }
  return entry;
}

function hasTickEventBusPayload(payload: TickEventBusPayload): boolean {
  return Boolean(
    payload.notices?.length
    || (payload.panelPatches && Object.keys(payload.panelPatches).length > 0)
    || (payload.jobProgress && Object.keys(payload.jobProgress).length > 0)
    || payload.techniqueDirty?.length
    || payload.stateDelta
    || payload.feedbacks?.length
    || payload.combatEffects?.length
    || payload.aoiEffects?.length,
  );
}

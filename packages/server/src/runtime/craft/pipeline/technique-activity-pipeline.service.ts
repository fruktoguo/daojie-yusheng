/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import {
  canMergeItemStack,
  computeCraftSkillExpGain,
  createItemStackSignature,
  type RuntimeTechniqueActivityKind,
  type TechniqueActivityNoticeMessage,
  type TechniqueActivityInterruptReason,
  type TechniqueActivityOutputItem,
  type TechniqueActivityResolveResult,
  type TechniqueActivityStartResult,
  type TechniqueActivityTickResult,
  type TechniqueActivityCancelResult,
} from '@mud/shared';
import { assignItemInstanceIdIfNeeded } from '../../world/item-instance-id.helpers';
import {
  advanceTechniqueActivityPause,
  applyTechniqueActivityInterrupt,
  bumpTechniqueActivityJobVersion,
} from '../technique-activity-runtime.helpers';
import type {
  PipelineContext,
  TechniqueActivityStrategy,
} from './technique-activity-strategy';
import {
  getStrategyActiveJob,
  setStrategyActiveJob,
} from './technique-activity-strategy';

export interface CraftTickResult {
  ok: boolean;
  panelChanged: boolean;
  inventoryChanged: boolean;
  equipmentChanged: boolean;
  attrChanged: boolean;
  messages: TechniqueActivityNoticeMessage[];
  groundDrops: Array<{ itemId: string; count: number; name?: string }>;
  craftRealmExpGain: number;
}

export interface CraftMutationResult {
  ok: boolean;
  error?: string;
  panelChanged: boolean;
  messages: TechniqueActivityNoticeMessage[];
  inventoryChanged?: boolean;
  equipmentChanged?: boolean;
  attrChanged?: boolean;
  groundDrops?: Array<{ itemId: string; count: number; name?: string }>;
  craftRealmExpGain?: number;
}

export interface TechniqueActivityResolveMaterializeOptions {
  inventoryChanged?: boolean;
  equipmentChanged?: boolean;
  attrChanged?: boolean;
  additionalGroundDrops?: Array<{ itemId: string; count: number; name?: string }>;
}

export interface TechniqueActivityResolveExperienceResult {
  finalGain: number;
  attrChanged: boolean;
}

export interface TechniqueActivityResolveInventoryResult {
  inventoryChanged: boolean;
  grantedItems: TechniqueActivityOutputItem[];
  groundDrops: TechniqueActivityOutputItem[];
}

type TechniqueActivityLegacyEffectFields = {
  inventoryChanged?: boolean;
  equipmentChanged?: boolean;
  attrChanged?: boolean;
  groundDrops?: Array<{ itemId: string; count: number; name?: string }>;
  craftRealmExpGain?: number;
};

type TechniqueActivityStartLifecycleResult = TechniqueActivityStartResult & TechniqueActivityLegacyEffectFields;
type TechniqueActivityTickLifecycleResult = TechniqueActivityTickResult & TechniqueActivityLegacyEffectFields;
type TechniqueActivityCancelLifecycleResult = TechniqueActivityCancelResult & TechniqueActivityLegacyEffectFields;

function emptyTickResult(): CraftTickResult {
  return { ok: true, panelChanged: false, inventoryChanged: false, equipmentChanged: false, attrChanged: false, messages: [], groundDrops: [], craftRealmExpGain: 0 };
}

export function materializeTechniqueActivityResolveResult(
  resolved: TechniqueActivityResolveResult,
  options: TechniqueActivityResolveMaterializeOptions = {},
): CraftTickResult {
  return {
    ok: true,
    panelChanged: resolved.panelDirty?.changed ?? true,
    inventoryChanged: Boolean(resolved.inventoryDelta?.changed) || Boolean(options.inventoryChanged),
    equipmentChanged: Boolean(resolved.equipmentDelta?.changed) || Boolean(options.equipmentChanged),
    attrChanged: Boolean(options.attrChanged),
    messages: resolved.messages ?? [],
    groundDrops: [
      ...(resolved.inventoryDelta?.dropped ?? []),
      ...(options.additionalGroundDrops ?? []),
    ],
    craftRealmExpGain: resolved.craftRealmExpGain ?? 0,
  };
}

export function applyTechniqueActivityResolveExperience(
  player: any,
  skillSlot: string,
  resolved: TechniqueActivityResolveResult,
  ctx: PipelineContext,
): TechniqueActivityResolveExperienceResult {
  if (!resolved.expParams) {
    return { finalGain: 0, attrChanged: false };
  }
  const skillState = player?.[skillSlot];
  if (!skillState) {
    return { finalGain: 0, attrChanged: false };
  }
  const { finalGain } = computeExpGainFromParams(resolved.expParams);
  if (finalGain <= 0) {
    return { finalGain: 0, attrChanged: false };
  }
  return {
    finalGain,
    attrChanged: applyCraftSkillExpInline(skillState, finalGain, ctx.resolveExpToNextByLevel),
  };
}

export function applyTechniqueActivityResolveInventory(
  player: any,
  resolved: TechniqueActivityResolveResult,
  ctx: PipelineContext,
): TechniqueActivityResolveInventoryResult {
  const requestedItems = normalizeResolveOutputItems(
    resolved.inventoryDelta?.granted ?? [],
    ctx,
  );
  const existingDropped = normalizeResolveOutputItems(resolved.inventoryDelta?.dropped ?? [], ctx);
  const grantedItems: TechniqueActivityOutputItem[] = [];
  const groundDrops: TechniqueActivityOutputItem[] = [];
  let inventoryChanged = false;

  for (const item of requestedItems) {
    if (canReceiveTechniqueActivityItem(player, item)) {
      const received = receiveTechniqueActivityInventoryItem(player, item, ctx);
      grantedItems.push(toTechniqueActivityOutputItem(received));
      inventoryChanged = true;
    } else {
      groundDrops.push(item);
    }
  }

  resolved.inventoryDelta = {
    ...(resolved.inventoryDelta ?? {}),
    granted: grantedItems,
    dropped: [...existingDropped, ...groundDrops],
    changed: Boolean(resolved.inventoryDelta?.changed) || inventoryChanged,
  };

  return {
    inventoryChanged,
    grantedItems,
    groundDrops,
  };
}

// ─── 管线骨架服务 ───

/**
 * TechniqueActivityPipelineService
 *
 * 统一技艺活动管线骨架。注册策略后，所有技艺的 start/tick/interrupt/cancel
 * 走同一套生命周期流程，策略只提供领域差异逻辑。
 */
export class TechniqueActivityPipelineService {
  private strategies = new Map<RuntimeTechniqueActivityKind, TechniqueActivityStrategy>();

  /** 注册策略。 */
  register(strategy: TechniqueActivityStrategy): void {
    this.strategies.set(strategy.kind, strategy);
  }

  /** 获取策略。 */
  getStrategy(kind: RuntimeTechniqueActivityKind): TechniqueActivityStrategy | undefined {
    return this.strategies.get(kind);
  }

  /** 判断指定 kind 是否已注册策略。 */
  hasStrategy(kind: RuntimeTechniqueActivityKind): boolean {
    return this.strategies.has(kind);
  }

  // ─── 公共 Start ───

  start(player: any, kind: RuntimeTechniqueActivityKind, payload: unknown, ctx: PipelineContext): CraftMutationResult {
    return startLifecycleResultToMutation(this.startLifecycle(player, kind, payload, ctx));
  }

  startLifecycle(player: any, kind: RuntimeTechniqueActivityKind, payload: unknown, ctx: PipelineContext): TechniqueActivityStartLifecycleResult {
    const strategy = this.strategies.get(kind);
    if (!strategy) return errorStartLifecycleResult(kind, `unsupported technique activity kind: ${kind}`);

    // 如果策略实现了 executeStart，直接委托
    if (strategy.executeStart) {
      return startLifecycleResultFromMutation(kind, strategy.executeStart(player, payload, ctx) as CraftMutationResult);
    }

    // 1. 校验
    const validation = strategy.validateStart(player, payload, ctx);
    if (!validation.ok) return errorStartLifecycleResult(kind, (validation as any).error);

    // 2. 活动互斥与排队。排队项不提前扣资源，等真正启动时再校验并消耗。
    if (strategy.queueStart) {
      const queued = strategy.queueStart(player, validation.validated, payload, ctx) as CraftMutationResult | null | undefined;
      if (queued) {
        return startLifecycleResultFromMutation(kind, queued, { queued: queued.ok === true });
      }
    }

    // 3. 消耗资源
    const consumeResult = strategy.consumeResources(player, validation.validated, ctx);
    if (consumeResult && typeof consumeResult === 'object' && 'ok' in consumeResult && !consumeResult.ok) {
      return errorStartLifecycleResult(kind, (consumeResult as { error?: string }).error ?? `${strategy.activityLabel}资源不足`);
    }

    // 4. 创建 job
    const job = strategy.createJob(player, validation.validated, ctx);
    setStrategyActiveJob(strategy, player, job);
    const startDirtyDomains = typeof strategy.startDirtyDomains === 'function'
      ? strategy.startDirtyDomains(player, validation.validated, job, ctx)
      : ['inventory'];
    const messages = strategy.buildStartMessages
      ? strategy.buildStartMessages(player, validation.validated, job, ctx)
      : [];

    return {
      lifecycle: 'start',
      ok: true,
      kind,
      started: true,
      panelChanged: true,
      messages,
      inventoryDelta: { changed: startDirtyDomains.includes('inventory') },
      inventoryChanged: startDirtyDomains.includes('inventory'),
    };
  }

  // ─── 公共 Tick ───

  tick(player: any, kind: RuntimeTechniqueActivityKind, ctx: PipelineContext): CraftTickResult {
    const lifecycleResult = this.tickLifecycle(player, kind, ctx);
    if (isPromiseLike(lifecycleResult)) {
      return lifecycleResult.then(tickLifecycleResultToCraftTick) as unknown as CraftTickResult;
    }
    return tickLifecycleResultToCraftTick(lifecycleResult);
  }

  tickLifecycle(
    player: any,
    kind: RuntimeTechniqueActivityKind,
    ctx: PipelineContext,
  ): TechniqueActivityTickLifecycleResult | Promise<TechniqueActivityTickLifecycleResult> {
    const strategy = this.strategies.get(kind);
    if (!strategy) return emptyTickLifecycleResult(kind);

    // 如果策略实现了 executeTick，直接委托（过渡期全权委托模式）
    if (strategy.executeTick) {
      const delegated = strategy.executeTick(player, ctx) as CraftTickResult | Promise<CraftTickResult>;
      if (isPromiseLike(delegated)) {
        return delegated.then((result) => tickLifecycleResultFromCraftTick(kind, result));
      }
      return tickLifecycleResultFromCraftTick(kind, delegated);
    }

    const job = getStrategyActiveJob(strategy, player) as any;

    // Stage 1: Guard
    if (!job || Number(job.remainingTicks) <= 0) return emptyTickLifecycleResult(kind);

    // Stage 2: ConditionCheck（条件型技艺）
    if (strategy.conditional && strategy.checkContinueCondition) {
      const condition = strategy.checkContinueCondition(player, job, ctx);
      if (!condition.satisfied) {
        // 条件不满足 → 清理 job，返回休眠信号
        strategy.onConditionFailed?.(player, job, ctx);
        setStrategyActiveJob(strategy, player, null);
        markPipelineDirty(player, ['active_job'], ctx);
        return {
          lifecycle: 'tick',
          ok: true,
          kind,
          panelChanged: true,
          inventoryDelta: { changed: false },
          equipmentDelta: { changed: false },
          messages: condition.reason
            ? [buildTechniqueActivityConditionFailedNotice(strategy.activityLabel, condition.reason)]
            : [],
          groundDrops: [],
          craftRealmExpGain: 0,
          // 管线调用方通过 condition 信息决定是否入队列休眠
          ...(condition.shouldCancel ? {} : { sleepPayload: buildSleepPayload(kind, strategy.activityLabel, job, condition.reason) }),
        } as any;
      }
    }

    // Stage 3: Pause
    if (job.phase === 'paused') {
      const resumePhase = strategy.resolveResumePhase(job);
      const resumed = advanceTechniqueActivityPause(job as any, resumePhase as any);
      markPipelineDirty(player, ['active_job'], ctx);
      return { ...emptyTickLifecycleResult(kind), panelChanged: resumed.resumed };
    }

    // Stage 4: Advance
    job.remainingTicks = Math.max(0, job.remainingTicks - 1);
    markPipelineDirty(player, ['active_job'], ctx);

    // Stage 5: Progress（未到结算点）
    if (!strategy.isResolvePoint(job)) {
      return emptyTickLifecycleResult(kind);
    }

    // Stage 6: Resolve（策略插槽）
    const resolved = strategy.resolve(player, job, ctx);

    // Stage 7: SkillExp（公共）
    const expResult = applyTechniqueActivityResolveExperience(player, strategy.skillSlot, resolved, ctx);
    if (expResult.attrChanged) {
      markPipelineDirty(player, ['profession'], ctx);
    }

    // Stage 8: Output（公共）
    const inventoryResult = applyTechniqueActivityResolveInventory(player, resolved, ctx);

    // Stage 9: Completion
    if (resolved.completed) {
      setStrategyActiveJob(strategy, player, null);
    }

    // Stage 10: 返回结果
    return tickLifecycleResultFromCraftTick(kind, materializeTechniqueActivityResolveResult(resolved, {
      inventoryChanged: inventoryResult.inventoryChanged,
      attrChanged: expResult.attrChanged,
    }));
  }

  // ─── 公共 Interrupt ───

  interrupt(player: any, kind: RuntimeTechniqueActivityKind, reason: TechniqueActivityInterruptReason, ctx: PipelineContext): CraftTickResult {
    const strategy = this.strategies.get(kind);
    if (!strategy) return emptyTickResult();

    const job = getStrategyActiveJob(strategy, player) as any;
    if (!job || Number(job.remainingTicks) <= 0) return emptyTickResult();

    // 条件型技艺：不暂停，直接清理（由队列服务决定是否休眠入队）
    if (strategy.conditional && strategy.pauseTicks === 0) {
      strategy.onConditionFailed?.(player, job, ctx);
      setStrategyActiveJob(strategy, player, null);
      markPipelineDirty(player, ['active_job'], ctx);
      return {
        ok: true,
        panelChanged: true,
        inventoryChanged: false,
        equipmentChanged: false,
        attrChanged: false,
        messages: [buildTechniqueActivityInterruptedNotice(strategy.activityLabel, reason, 0, false)],
        groundDrops: [],
        craftRealmExpGain: 0,
      };
    }

    // 非条件型：暂停
    const added = applyTechniqueActivityInterrupt(job as any, strategy.pauseTicks, reason);
    if (added <= 0) return emptyTickResult();
    markPipelineDirty(player, ['active_job'], ctx);

    return {
      ok: true,
      panelChanged: true,
      inventoryChanged: false,
      equipmentChanged: false,
      attrChanged: false,
      messages: [buildTechniqueActivityInterruptedNotice(strategy.activityLabel, reason, strategy.pauseTicks, true)],
      groundDrops: [],
      craftRealmExpGain: 0,
    };
  }

  // ─── 公共 Cancel ───

  cancel(player: any, kind: RuntimeTechniqueActivityKind, ctx: PipelineContext): CraftMutationResult {
    return cancelLifecycleResultToMutation(this.cancelLifecycle(player, kind, ctx));
  }

  cancelLifecycle(player: any, kind: RuntimeTechniqueActivityKind, ctx: PipelineContext): TechniqueActivityCancelLifecycleResult {
    const strategy = this.strategies.get(kind);
    if (!strategy) return errorCancelLifecycleResult(kind, `unsupported technique activity kind: ${kind}`);

    // 如果策略实现了 executeCancel，直接委托
    if (strategy.executeCancel) {
      return cancelLifecycleResultFromMutation(kind, strategy.executeCancel(player, ctx) as CraftMutationResult);
    }

    const job = getStrategyActiveJob(strategy, player) as any;
    if (!job || Number(job.remainingTicks) <= 0) return errorCancelLifecycleResult(kind, '当前没有进行中的任务。');

    // 计算退还
    const refund = strategy.computeRefund(player, job, ctx);

    // 清理 job；部分复杂策略会在 computeRefund 内调用权威 finish helper 并清空 active job。
    const activeJobAfterRefund = getStrategyActiveJob(strategy, player) as any;
    if (activeJobAfterRefund && strategy.conditional) {
      strategy.onConditionFailed?.(player, job, ctx);
    }
    if (activeJobAfterRefund) {
      setStrategyActiveJob(strategy, player, null);
      markPipelineDirty(player, ['active_job'], ctx);
    }

    return {
      lifecycle: 'cancel',
      ok: true,
      kind,
      cancelled: true,
      panelChanged: true,
      messages: refund.messages ?? [],
      inventoryDelta: {
        ...(refund.inventoryDelta ?? {}),
        dropped: refund.items.length > 0 ? refund.items : refund.inventoryDelta?.dropped,
        changed: Boolean(refund.inventoryDelta?.changed),
      },
      walletDelta: refund.walletDelta,
      equipmentDelta: refund.equipmentDelta,
      recordDelta: refund.recordDelta,
      groundDrops: refund.groundDrops ?? (refund.items.length > 0 ? refund.items : undefined),
      attrChanged: refund.attrChanged,
    };
  }
}

// ─── 内部工具函数 ───

function errorStartLifecycleResult(
  kind: RuntimeTechniqueActivityKind,
  error: string,
): TechniqueActivityStartLifecycleResult {
  return {
    lifecycle: 'start',
    ok: false,
    kind,
    error,
    panelChanged: false,
    messages: [],
  };
}

function errorCancelLifecycleResult(
  kind: RuntimeTechniqueActivityKind,
  error: string,
): TechniqueActivityCancelLifecycleResult {
  return {
    lifecycle: 'cancel',
    ok: false,
    kind,
    error,
    panelChanged: false,
    messages: [],
  };
}

function emptyTickLifecycleResult(kind: RuntimeTechniqueActivityKind): TechniqueActivityTickLifecycleResult {
  return {
    lifecycle: 'tick',
    ok: true,
    kind,
    panelChanged: false,
    inventoryDelta: { changed: false },
    equipmentDelta: { changed: false },
    messages: [],
    groundDrops: [],
    craftRealmExpGain: 0,
  };
}

function startLifecycleResultFromMutation(
  kind: RuntimeTechniqueActivityKind,
  result: CraftMutationResult,
  flags: { queued?: boolean; started?: boolean } = {},
): TechniqueActivityStartLifecycleResult {
  return {
    lifecycle: 'start',
    ok: result.ok,
    kind,
    error: result.error,
    started: flags.started ?? (result.ok === true && flags.queued !== true),
    queued: flags.queued,
    panelChanged: result.panelChanged,
    inventoryDelta: { changed: Boolean(result.inventoryChanged) },
    equipmentDelta: { changed: Boolean(result.equipmentChanged) },
    messages: result.messages ?? [],
    groundDrops: result.groundDrops,
    craftRealmExpGain: result.craftRealmExpGain,
    inventoryChanged: result.inventoryChanged,
    equipmentChanged: result.equipmentChanged,
    attrChanged: result.attrChanged,
  };
}

function cancelLifecycleResultFromMutation(
  kind: RuntimeTechniqueActivityKind,
  result: CraftMutationResult,
): TechniqueActivityCancelLifecycleResult {
  return {
    lifecycle: 'cancel',
    ok: result.ok,
    kind,
    error: result.error,
    cancelled: result.ok === true,
    panelChanged: result.panelChanged,
    inventoryDelta: { changed: Boolean(result.inventoryChanged), dropped: result.groundDrops },
    equipmentDelta: { changed: Boolean(result.equipmentChanged) },
    messages: result.messages ?? [],
    groundDrops: result.groundDrops,
    craftRealmExpGain: result.craftRealmExpGain,
    inventoryChanged: result.inventoryChanged,
    equipmentChanged: result.equipmentChanged,
    attrChanged: result.attrChanged,
  };
}

function tickLifecycleResultFromCraftTick(
  kind: RuntimeTechniqueActivityKind,
  result: CraftTickResult,
): TechniqueActivityTickLifecycleResult {
  return {
    lifecycle: 'tick',
    ok: result.ok,
    kind,
    panelChanged: result.panelChanged,
    inventoryDelta: { changed: Boolean(result.inventoryChanged), dropped: result.groundDrops },
    equipmentDelta: { changed: Boolean(result.equipmentChanged) },
    messages: result.messages ?? [],
    craftRealmExpGain: result.craftRealmExpGain,
    groundDrops: result.groundDrops,
    inventoryChanged: result.inventoryChanged,
    equipmentChanged: result.equipmentChanged,
    attrChanged: result.attrChanged,
  };
}

function startLifecycleResultToMutation(result: TechniqueActivityStartLifecycleResult): CraftMutationResult {
  return {
    ok: result.ok,
    error: result.error,
    panelChanged: result.panelChanged ?? result.panelDirty?.changed ?? false,
    messages: result.messages ?? [],
    inventoryChanged: result.inventoryChanged ?? Boolean(result.inventoryDelta?.changed),
    equipmentChanged: result.equipmentChanged ?? Boolean(result.equipmentDelta?.changed),
    attrChanged: result.attrChanged,
    groundDrops: result.groundDrops ?? result.inventoryDelta?.dropped,
    craftRealmExpGain: result.craftRealmExpGain,
  };
}

function cancelLifecycleResultToMutation(result: TechniqueActivityCancelLifecycleResult): CraftMutationResult {
  return {
    ok: result.ok,
    error: result.error,
    panelChanged: result.panelChanged ?? result.panelDirty?.changed ?? false,
    messages: result.messages ?? [],
    inventoryChanged: result.inventoryChanged ?? Boolean(result.inventoryDelta?.changed),
    equipmentChanged: result.equipmentChanged ?? Boolean(result.equipmentDelta?.changed),
    attrChanged: result.attrChanged,
    groundDrops: result.groundDrops ?? result.inventoryDelta?.dropped,
    craftRealmExpGain: result.craftRealmExpGain,
  };
}

function tickLifecycleResultToCraftTick(result: TechniqueActivityTickLifecycleResult): CraftTickResult {
  return {
    ok: result.ok,
    panelChanged: result.panelChanged ?? result.panelDirty?.changed ?? false,
    inventoryChanged: result.inventoryChanged ?? Boolean(result.inventoryDelta?.changed),
    equipmentChanged: result.equipmentChanged ?? Boolean(result.equipmentDelta?.changed),
    attrChanged: result.attrChanged ?? false,
    messages: result.messages ?? [],
    groundDrops: result.groundDrops ?? result.inventoryDelta?.dropped ?? [],
    craftRealmExpGain: result.craftRealmExpGain ?? 0,
  };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

function interruptReasonLabel(reason: TechniqueActivityInterruptReason): string {
  switch (reason) {
    case 'move': return '移动';
    case 'attack': return '出手';
    case 'cancel': return '手动取消';
    case 'cultivate': return '打坐';
    case 'defeat': return '身陨';
  }
}

function buildTechniqueActivityConditionFailedNotice(activityLabel: string, reason: string): TechniqueActivityNoticeMessage {
  return {
    kind: 'system',
    key: 'notice.craft.activity-condition-failed',
    vars: {
      activityLabel,
      reason,
    },
    pills: [
      { key: 'activityLabel', style: 'target' },
      { key: 'reason', style: 'target' },
    ],
  };
}

function buildTechniqueActivityInterruptedNotice(
  activityLabel: string,
  reason: TechniqueActivityInterruptReason,
  pauseTicks: number,
  withWait: boolean,
): TechniqueActivityNoticeMessage {
  const reasonLabel = interruptReasonLabel(reason);
  const normalizedPauseTicks = Math.max(0, Math.floor(Number(pauseTicks) || 0));
  return {
    kind: 'system',
    key: withWait ? 'notice.craft.activity-interrupted-wait-generic' : 'notice.craft.activity-interrupted',
    vars: withWait
      ? { activityLabel, reasonLabel, ticks: normalizedPauseTicks }
      : { activityLabel, reasonLabel },
    pills: [
      { key: 'activityLabel', style: 'target' },
      { key: 'reasonLabel', style: 'target' },
    ],
  };
}

function markPipelineDirty(player: any, domains: string[], ctx: PipelineContext): void {
  const normalizedDomains = domains
    .map((domain) => typeof domain === 'string' ? domain.trim() : '')
    .filter((domain) => domain.length > 0);
  if (normalizedDomains.includes('active_job')) {
    bumpTechniqueActivityJobVersion(player);
  }
  if (player?.dirtyDomains && typeof player.dirtyDomains.add === 'function') {
    for (const domain of normalizedDomains) {
      player.dirtyDomains.add(domain);
    }
  }
  const runtimeService = (ctx.deps as {
    playerRuntimeService?: {
      markPersistenceDirtyDomains?: (player: any, domains: string[]) => void;
      bumpPersistentRevision?: (player: any) => void;
    };
  } | null)?.playerRuntimeService;
  if (runtimeService && typeof runtimeService.markPersistenceDirtyDomains === 'function') {
    runtimeService.markPersistenceDirtyDomains(player, normalizedDomains);
  }
  if (runtimeService && typeof runtimeService.bumpPersistentRevision === 'function') {
    runtimeService.bumpPersistentRevision(player);
  }
}

function buildSleepPayload(kind: RuntimeTechniqueActivityKind, label: string, job: any, reason?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (kind === 'formation' && typeof job?.formationInstanceId === 'string') {
    payload.formationInstanceId = job.formationInstanceId;
  } else if (kind === 'gather') {
    if (typeof job?.sourceId === 'string') payload.sourceId = job.sourceId;
    if (typeof job?.resourceNodeId === 'string') payload.resourceNodeId = job.resourceNodeId;
    if (typeof job?.instanceId === 'string') payload.instanceId = job.instanceId;
  } else if (kind === 'building') {
    if (typeof job?.buildingId === 'string') payload.buildingId = job.buildingId;
    if (typeof job?.instanceId === 'string') payload.instanceId = job.instanceId;
  } else if (kind === 'mining') {
    if (typeof job?.miningNodeId === 'string') payload.miningNodeId = job.miningNodeId;
  }
  return {
    kind,
    payload,
    label: resolveSleepLabel(kind, label, job),
    reason: reason ?? '条件暂时不满足',
  };
}

function resolveSleepLabel(kind: RuntimeTechniqueActivityKind, fallback: string, job: any): string {
  if (kind === 'formation' && typeof job?.formationName === 'string' && job.formationName.trim()) return `维护 ${job.formationName.trim()}`;
  if (kind === 'gather' && typeof job?.resourceNodeName === 'string' && job.resourceNodeName.trim()) return job.resourceNodeName.trim();
  if (kind === 'building' && typeof job?.buildingName === 'string' && job.buildingName.trim()) return job.buildingName.trim();
  if (kind === 'mining' && typeof job?.miningNodeName === 'string' && job.miningNodeName.trim()) return job.miningNodeName.trim();
  return fallback;
}

function normalizeResolveOutputItems(
  items: TechniqueActivityOutputItem[],
  ctx: PipelineContext,
): TechniqueActivityOutputItem[] {
  const normalizedItems: TechniqueActivityOutputItem[] = [];
  for (const item of items) {
    const normalized = ctx.contentTemplateRepository.normalizeItem({
      itemId: item.itemId,
      count: Math.max(1, Math.floor(Number(item.count) || 1)),
    }) as Record<string, unknown>;
    normalizedItems.push(toTechniqueActivityOutputItem({
      ...normalized,
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
    }));
  }
  return normalizedItems;
}

function receiveTechniqueActivityInventoryItem(
  player: any,
  item: TechniqueActivityOutputItem,
  ctx: PipelineContext,
): TechniqueActivityOutputItem {
  const normalized = ctx.contentTemplateRepository.normalizeItem(item) as any;
  assignItemInstanceIdIfNeeded(normalized);
  if (canMergeItemStack(normalized)) {
    const signature = createItemStackSignature(normalized);
    const existing = Array.isArray(player?.inventory?.items)
      ? player.inventory.items.find((entry: unknown) => canMergeItemStack(entry as any) && createItemStackSignature(entry as any) === signature)
      : null;
    if (existing) {
      (existing as { count: number }).count += normalized.count;
      return toTechniqueActivityOutputItem(existing);
    }
  }
  player.inventory.items.push(normalized);
  return toTechniqueActivityOutputItem(normalized);
}

function canReceiveTechniqueActivityItem(player: any, item: TechniqueActivityOutputItem): boolean {
  if (!Array.isArray(player?.inventory?.items)) return false;
  const signature = createItemStackSignature(item as any);
  return player.inventory.items.some((entry: unknown) => createItemStackSignature(entry as any) === signature)
    || player.inventory.items.length < Math.max(0, Math.floor(Number(player.inventory.capacity) || 0));
}

function toTechniqueActivityOutputItem(item: unknown): TechniqueActivityOutputItem {
  const source = item as { itemId?: unknown; count?: unknown; name?: unknown };
  return {
    ...(item && typeof item === 'object' ? item as Record<string, unknown> : {}),
    itemId: String(source.itemId ?? ''),
    count: Math.max(1, Math.floor(Number(source.count) || 1)),
    ...(typeof source.name === 'string' ? { name: source.name } : {}),
  } as TechniqueActivityOutputItem;
}

/** 内联计算经验（避免引入外部依赖循环）。 */
function computeExpGainFromParams(params: any): { finalGain: number } {
  const result = computeCraftSkillExpGain(params);
  return { finalGain: result.finalGain };
}

/** 内联应用经验到技能状态。 */
function applyCraftSkillExpInline(
  skillState: { level: number; exp: number; expToNext: number },
  gain: number,
  resolveExpToNext: (level: number) => number,
): boolean {
  if (gain <= 0) return false;
  skillState.exp += gain;
  while (skillState.exp >= skillState.expToNext && skillState.expToNext > 0) {
    skillState.exp -= skillState.expToNext;
    skillState.level += 1;
    skillState.expToNext = resolveExpToNext(skillState.level);
  }
  return true;
}

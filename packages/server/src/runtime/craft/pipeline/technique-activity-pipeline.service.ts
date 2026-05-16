/**
 * 技艺活动管线骨架服务。
 * 注册各技艺策略后，统一提供 start/tick/interrupt/cancel 生命周期，
 * 策略只需实现领域差异逻辑，管线负责公共流程编排。
 */
import {
  computeCraftSkillExpGain,
  type RuntimeTechniqueActivityKind,
  type TechniqueActivityInterruptReason,
} from '@mud/shared';
import {
  applyTechniqueActivityInterrupt,
} from '../technique-activity-runtime.helpers';
import type {
  PipelineContext,
  TechniqueActivityStrategy,
} from './technique-activity-strategy';

export interface CraftTickResult {
  ok: boolean;
  panelChanged: boolean;
  inventoryChanged: boolean;
  equipmentChanged: boolean;
  attrChanged: boolean;
  messages: Array<{ kind: string; text: string }>;
  groundDrops: Array<{ itemId: string; count: number; name?: string }>;
  craftRealmExpGain: number;
}

export interface CraftMutationResult {
  ok: boolean;
  error?: string;
  panelChanged: boolean;
  messages: Array<{ kind: string; text: string }>;
  inventoryChanged?: boolean;
  equipmentChanged?: boolean;
  attrChanged?: boolean;
  groundDrops?: Array<{ itemId: string; count: number; name?: string }>;
  craftRealmExpGain?: number;
}

function emptyTickResult(): CraftTickResult {
  return { ok: true, panelChanged: false, inventoryChanged: false, equipmentChanged: false, attrChanged: false, messages: [], groundDrops: [], craftRealmExpGain: 0 };
}

function errorMutationResult(error: string): CraftMutationResult {
  return { ok: false, error, panelChanged: false, messages: [] };
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
    const strategy = this.strategies.get(kind);
    if (!strategy) return errorMutationResult(`unsupported technique activity kind: ${kind}`);

    // 如果策略实现了 executeStart，直接委托
    if (strategy.executeStart) {
      return strategy.executeStart(player, payload, ctx) as CraftMutationResult;
    }

    // 1. 校验
    const validation = strategy.validateStart(player, payload, ctx);
    if (!validation.ok) return errorMutationResult((validation as any).error);

    // 2. 消耗资源
    strategy.consumeResources(player, validation.validated, ctx);

    // 3. 创建 job
    const job = strategy.createJob(player, validation.validated, ctx);
    (player as any)[strategy.jobSlot] = job;

    return {
      ok: true,
      panelChanged: true,
      messages: [],
      inventoryChanged: true,
    };
  }

  // ─── 公共 Tick ───

  tick(player: any, kind: RuntimeTechniqueActivityKind, ctx: PipelineContext): CraftTickResult {
    const strategy = this.strategies.get(kind);
    if (!strategy) return emptyTickResult();

    // 如果策略实现了 executeTick，直接委托（过渡期全权委托模式）
    if (strategy.executeTick) {
      return strategy.executeTick(player, ctx) as CraftTickResult;
    }

    const job = (player as any)[strategy.jobSlot];

    // Stage 1: Guard
    if (!job || Number(job.remainingTicks) <= 0) return emptyTickResult();

    // Stage 2: ConditionCheck（条件型技艺）
    if (strategy.conditional && strategy.checkContinueCondition) {
      const condition = strategy.checkContinueCondition(player, job, ctx);
      if (!condition.satisfied) {
        // 条件不满足 → 清理 job，返回休眠信号
        strategy.onConditionFailed?.(player, job, ctx);
        (player as any)[strategy.jobSlot] = null;
        return {
          ok: true,
          panelChanged: true,
          inventoryChanged: false,
          equipmentChanged: false,
          attrChanged: false,
          messages: condition.reason
            ? [{ kind: 'system', text: `${strategy.activityLabel}中断：${condition.reason}` }]
            : [],
          groundDrops: [],
          craftRealmExpGain: 0,
          // 管线调用方通过 condition 信息决定是否入队列休眠
          ...(condition.shouldCancel ? {} : { sleepPayload: { kind, reason: condition.reason } }),
        } as any;
      }
    }

    // Stage 3: Pause
    if (job.phase === 'paused') {
      const resumePhase = strategy.resolveResumePhase(job);
      // Inline pause advancement to avoid type guard issues
      job.pausedTicks = Math.max(0, Math.floor(Number(job.pausedTicks) || 0) - 1);
      if (job.pausedTicks > 0) {
        return { ...emptyTickResult(), ok: true };
      }
      job.phase = resumePhase;
      return { ...emptyTickResult(), panelChanged: true };
    }

    // Stage 4: Advance
    job.remainingTicks = Math.max(0, job.remainingTicks - 1);

    // Stage 5: Progress（未到结算点）
    if (!strategy.isResolvePoint(job)) {
      return emptyTickResult();
    }

    // Stage 6: Resolve（策略插槽）
    const resolved = strategy.resolve(player, job, ctx);

    // Stage 7: SkillExp（公共）
    let attrChanged = false;
    if (resolved.expParams) {
      const skillState = (player as any)[strategy.skillSlot];
      if (skillState) {
        const { finalGain } = computeExpGainFromParams(resolved.expParams);
        if (finalGain > 0) {
          attrChanged = applyCraftSkillExpInline(skillState, finalGain, ctx.resolveExpToNextByLevel);
        }
      }
    }

    // Stage 8: Output（公共）
    const groundDrops: Array<{ itemId: string; count: number; name?: string }> = [];
    let inventoryChanged = false;
    for (const output of resolved.outputs) {
      // 尝试放入背包由调用方处理，这里只收集产出
      groundDrops.push(output);
      inventoryChanged = true;
    }

    // Stage 9: Completion
    if (resolved.completed) {
      (player as any)[strategy.jobSlot] = null;
    }

    // Stage 10: 返回结果
    return {
      ok: true,
      panelChanged: true,
      inventoryChanged,
      equipmentChanged: false,
      attrChanged,
      messages: resolved.messages ?? [],
      groundDrops,
      craftRealmExpGain: resolved.craftRealmExpGain ?? 0,
    };
  }

  // ─── 公共 Interrupt ───

  interrupt(player: any, kind: RuntimeTechniqueActivityKind, reason: TechniqueActivityInterruptReason, ctx: PipelineContext): CraftTickResult {
    const strategy = this.strategies.get(kind);
    if (!strategy) return emptyTickResult();

    // 如果策略实现了 executeInterrupt，直接委托
    if (strategy.executeInterrupt) {
      return strategy.executeInterrupt(player, reason, ctx) as CraftTickResult;
    }

    const job = (player as any)[strategy.jobSlot];
    if (!job || Number(job.remainingTicks) <= 0) return emptyTickResult();

    // 条件型技艺：不暂停，直接清理（由队列服务决定是否休眠入队）
    if (strategy.conditional && strategy.pauseTicks === 0) {
      strategy.onConditionFailed?.(player, job, ctx);
      (player as any)[strategy.jobSlot] = null;
      return {
        ok: true,
        panelChanged: true,
        inventoryChanged: false,
        equipmentChanged: false,
        attrChanged: false,
        messages: [{ kind: 'system', text: `${strategy.activityLabel}被${interruptReasonLabel(reason)}打断。` }],
        groundDrops: [],
        craftRealmExpGain: 0,
      };
    }

    // 非条件型：暂停
    const added = applyTechniqueActivityInterrupt(job as any, strategy.pauseTicks);
    if (added <= 0) return emptyTickResult();

    return {
      ok: true,
      panelChanged: true,
      inventoryChanged: false,
      equipmentChanged: false,
      attrChanged: false,
      messages: [{ kind: 'system', text: `${strategy.activityLabel}被${interruptReasonLabel(reason)}打断，暂歇 ${strategy.pauseTicks} 息。` }],
      groundDrops: [],
      craftRealmExpGain: 0,
    };
  }

  // ─── 公共 Cancel ───

  cancel(player: any, kind: RuntimeTechniqueActivityKind, ctx: PipelineContext): CraftMutationResult {
    const strategy = this.strategies.get(kind);
    if (!strategy) return errorMutationResult(`unsupported technique activity kind: ${kind}`);

    // 如果策略实现了 executeCancel，直接委托
    if (strategy.executeCancel) {
      return strategy.executeCancel(player, ctx) as CraftMutationResult;
    }

    const job = (player as any)[strategy.jobSlot];
    if (!job || Number(job.remainingTicks) <= 0) return errorMutationResult('当前没有进行中的任务。');

    // 计算退还
    const refund = strategy.computeRefund(player, job);

    // 清理 job
    if (strategy.conditional) {
      strategy.onConditionFailed?.(player, job, ctx);
    }
    (player as any)[strategy.jobSlot] = null;

    return {
      ok: true,
      panelChanged: true,
      messages: refund.messages ?? [],
      groundDrops: refund.items.length > 0 ? refund.items : undefined,
    };
  }
}

// ─── 内部工具函数 ───

function interruptReasonLabel(reason: TechniqueActivityInterruptReason): string {
  switch (reason) {
    case 'move': return '移动';
    case 'attack': return '出手';
    case 'cancel': return '手动取消';
    case 'cultivate': return '打坐';
  }
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

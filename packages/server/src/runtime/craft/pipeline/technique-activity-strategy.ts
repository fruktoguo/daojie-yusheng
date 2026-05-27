/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 技艺活动策略接口定义。
 * 定义管线骨架与各技艺策略之间的契约：校验、消耗、创建、结算、退还等生命周期方法，
 * 以及条件型技艺的条件检查和资源释放/恢复钩子。
 */
import type {
  RuntimeTechniqueActivityKind,
  TechniqueActivityInterruptReason,
  TechniqueActivityJobBase,
  TechniqueActivityConditionCheckResult,
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
  TechniqueActivityNoticeMessage,
} from '@mud/shared';

/** 管线 tick 上下文，由管线骨架注入给策略方法。 */
export interface PipelineContext {
  contentTemplateRepository: {
    getItemName(itemId: string): string | null;
    normalizeItem(item: { itemId: string; count: number }): unknown;
  };
  resolveExpToNextByLevel: (level: number) => number;
  getInstanceRuntime: (instanceId: string) => unknown | null;
  /** 额外的运行时依赖（各策略按需向下转型）。 */
  deps: unknown;
}

/** 持久化脏域标识。 */
export type PersistenceDomain =
  | 'active_job'
  | 'inventory'
  | 'equipment'
  | 'enhancement_record'
  | 'profession'
  | 'wallet';

/**
 * 技艺活动策略接口。
 *
 * 每种技艺实现此接口，管线骨架负责调用公共生命周期，
 * 策略只需提供校验、消耗、创建、结算、退还等领域逻辑。
 */
export interface TechniqueActivityStrategy<
  TJob extends TechniqueActivityJobBase = TechniqueActivityJobBase,
  TValidated = unknown,
> {
  /** 技艺种类标识。 */
  readonly kind: RuntimeTechniqueActivityKind;
  /** player 上的 job 字段名。 */
  readonly jobSlot: string;
  /** player 上的 skill 字段名。 */
  readonly skillSlot: string;
  /** 中文活动名（如"炼丹"、"采集"）。 */
  readonly activityLabel: string;
  /** 中断暂停息数（0 表示不暂停，直接休眠入队列）。 */
  readonly pauseTicks: number;
  /** 是否为条件型技艺。 */
  readonly conditional: boolean;

  /** 启动校验。 */
  validateStart(player: unknown, payload: unknown, ctx: PipelineContext): TechniqueActivityStartValidationResult<TValidated>;

  /**
   * 活动互斥时的入队处理。
   * 返回非空结果表示本次 start 已被转换为队列操作，管线不再继续消耗资源或创建 job。
   */
  queueStart?(player: unknown, validated: TValidated, payload: unknown, ctx: PipelineContext): unknown | null;

  /** 消耗资源（扣材料、扣灵石、锁装备槽等）。失败时返回 { ok:false, error }。 */
  consumeResources(player: unknown, validated: TValidated, ctx: PipelineContext): { ok: true } | { ok: false; error?: string } | void;

  /** 创建 job 对象。 */
  createJob(player: unknown, validated: TValidated, ctx: PipelineContext): TJob;

  /** 启动成功后的通知消息。 */
  buildStartMessages?(player: unknown, validated: TValidated, job: TJob, ctx: PipelineContext): TechniqueActivityNoticeMessage[];

  /** 启动成功后的变更信号；具体 dirty 写入仍由 strategy/finalize 钩子负责。 */
  startDirtyDomains?(player: unknown, validated: TValidated, job: TJob, ctx: PipelineContext): PersistenceDomain[];

  /** 确定暂停恢复后应回到的阶段。 */
  resolveResumePhase(job: TJob): string;

  /** 判断当前 tick 是否到达结算点（默认 remainingTicks <= 0）。 */
  isResolvePoint(job: TJob): boolean;

  /** 结算（批次完成或单次完成时调用）。 */
  resolve(player: unknown, job: TJob, ctx: PipelineContext): TechniqueActivityResolveResult;

  /**
   * 完整 tick 委托（可选）。
   * 如果实现此方法，管线的 tick 将直接委托给策略，跳过公共骨架。
   * 用于现有逻辑尚未拆分到 resolve 的过渡期。
   */
  executeTick?(player: unknown, ctx: PipelineContext): unknown;

  /**
   * 完整 start 委托（可选）。
   * 如果实现此方法，管线的 start 将直接委托给策略。
   */
  executeStart?(player: unknown, payload: unknown, ctx: PipelineContext): unknown;

  /**
   * 完整 cancel 委托（可选）。
   * 如果实现此方法，管线的 cancel 将直接委托给策略。
   */
  executeCancel?(player: unknown, ctx: PipelineContext): unknown;

  /**
   * 完整 interrupt 委托（可选）。
   * 如果实现此方法，管线的 interrupt 将直接委托给策略。
   */
  executeInterrupt?(player: unknown, reason: string, ctx: PipelineContext): unknown;

  /** 取消时的退还策略。 */
  computeRefund(player: unknown, job: TJob): TechniqueActivityRefundResult;

  /** 该技艺的脏域列表。 */
  dirtyDomains(): PersistenceDomain[];

  // ─── 条件型技艺可选方法 ───

  /** 检查继续执行的条件（仅 conditional=true 时调用）。 */
  checkContinueCondition?(player: unknown, job: TJob, ctx: PipelineContext): TechniqueActivityConditionCheckResult;

  /** 条件不满足时释放外部资源。 */
  onConditionFailed?(player: unknown, job: TJob, ctx: PipelineContext): void;

  /** 条件恢复时重新获取外部资源。 */
  onConditionRestored?(player: unknown, job: TJob, ctx: PipelineContext): void;

  /** 读取当前 active job；实现后 pipeline 不再直接依赖字符串槽位。 */
  getActiveJob?(player: unknown): TJob | null;

  /** 写入或清空当前 active job；实现后 pipeline 不再直接依赖字符串槽位。 */
  setActiveJob?(player: unknown, job: TJob | null): void;
}

/** 读取策略的 active job；优先使用策略 accessor，兼容期回退到 jobSlot。 */
export function getStrategyActiveJob<TJob extends TechniqueActivityJobBase>(
  strategy: TechniqueActivityStrategy<TJob>,
  player: unknown,
): TJob | null {
  if (typeof strategy.getActiveJob === 'function') {
    return strategy.getActiveJob(player);
  }
  const slot = strategy.jobSlot;
  const job = (player as Record<string, unknown> | null | undefined)?.[slot];
  return job && typeof job === 'object' ? job as TJob : null;
}

/** 写入策略的 active job；优先使用策略 accessor，兼容期回退到 jobSlot。 */
export function setStrategyActiveJob<TJob extends TechniqueActivityJobBase>(
  strategy: TechniqueActivityStrategy<TJob>,
  player: unknown,
  job: TJob | null,
): void {
  if (typeof strategy.setActiveJob === 'function') {
    strategy.setActiveJob(player, job);
    return;
  }
  (player as Record<string, unknown>)[strategy.jobSlot] = job;
}

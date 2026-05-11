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

  /** 消耗资源（扣材料、扣灵石、锁装备槽等）。 */
  consumeResources(player: unknown, validated: TValidated, ctx: PipelineContext): void;

  /** 创建 job 对象。 */
  createJob(player: unknown, validated: TValidated, ctx: PipelineContext): TJob;

  /** 确定暂停恢复后应回到的阶段。 */
  resolveResumePhase(job: TJob): string;

  /** 判断当前 tick 是否到达结算点（默认 remainingTicks <= 0）。 */
  isResolvePoint(job: TJob): boolean;

  /** 结算（批次完成或单次完成时调用）。 */
  resolve(player: unknown, job: TJob, ctx: PipelineContext): TechniqueActivityResolveResult;

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
}

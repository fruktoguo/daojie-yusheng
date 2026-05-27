/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/** 锻造策略。start/tick/interrupt/cancel 已拆入 pipeline strategy。 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { executeAlchemyLikeTick } from './alchemy-like-tick.helpers';
import { computeAlchemyLikeCancelRefund } from './alchemy-like-cancel.helpers';
import { executeAlchemyLikeInterrupt } from './alchemy-like-interrupt.helpers';
export class ForgingStrategy implements TechniqueActivityStrategy {
  readonly kind = 'forging' as const;
  readonly jobSlot = 'forgingJob';
  readonly skillSlot = 'forgingSkill';
  readonly activityLabel = '炼器';
  readonly pauseTicks = 10;
  readonly conditional = false;

  constructor(private craftService: any) {}

  getActiveJob(player: unknown): any {
    return (player as any).forgingJob ?? null;
  }

  setActiveJob(player: unknown, job: any | null): void {
    (player as any).forgingJob = job;
  }

  executeTick(player: unknown, ctx: PipelineContext): unknown {
    return executeAlchemyLikeTick(this.craftService, player, 'forging', ctx);
  }

  executeInterrupt(player: unknown, reason: string, ctx: PipelineContext): unknown {
    return executeAlchemyLikeInterrupt(this.craftService, player, 'forging', reason, ctx);
  }

  // ─── 接口占位 ───

  validateStart(player: unknown, payload: unknown): TechniqueActivityStartValidationResult {
    return this.craftService.validateAlchemyLikeStart(player, payload, 'forging');
  }
  queueStart(player: unknown, validated: unknown, payload: unknown): unknown | null {
    return this.craftService.queueAlchemyLikeStart(player, validated, payload);
  }
  consumeResources(player: unknown, validated: unknown): { ok: true } | { ok: false; error?: string } | void {
    return this.craftService.consumeAlchemyLikeStartResources(player, validated);
  }
  createJob(player: unknown, validated: unknown): any {
    const job = this.craftService.createAlchemyLikeStartJob(player, validated);
    this.craftService.finalizeAlchemyLikeStart(player);
    return job;
  }
  buildStartMessages(_player: unknown, validated: unknown): any[] {
    return this.craftService.buildAlchemyLikeStartMessages(validated);
  }
  resolveResumePhase(job: any): string {
    return 'brewing';
  }
  isResolvePoint(job: any): boolean { return job.currentBatchRemainingTicks <= 0 || job.remainingTicks <= 0; }
  resolve(): TechniqueActivityResolveResult {
    return { successCount: 0, failureCount: 0, outputs: [], expParams: { skillLevel: 1, targetLevel: 1, baseActionTicks: 1, getExpToNextByLevel: () => 100 }, completed: true };
  }
  computeRefund(player: unknown, _job: any, ctx: PipelineContext): TechniqueActivityRefundResult {
    return computeAlchemyLikeCancelRefund(this.craftService, player, 'forging', ctx);
  }
  dirtyDomains(): PersistenceDomain[] { return ['active_job', 'inventory']; }
}

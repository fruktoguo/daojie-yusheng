/**
 * 锻造策略。
 * 通过 executeTick/executeStart/executeCancel 全权委托给
 * CraftPanelRuntimeService 的现有炼器方法，管线只负责路由。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
export class ForgingStrategy implements TechniqueActivityStrategy {
  readonly kind = 'forging' as const;
  readonly jobSlot = 'forgingJob';
  readonly skillSlot = 'forgingSkill';
  readonly activityLabel = '炼器';
  readonly pauseTicks = 10;
  readonly conditional = false;

  constructor(private craftService: any) {}

  executeTick(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.tickAlchemy(player, 'forging');
  }

  executeStart(player: unknown, payload: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.startForging(player, payload);
  }

  executeCancel(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.cancelForging(player);
  }

  executeInterrupt(player: unknown, reason: string, _ctx: PipelineContext): unknown {
    return this.craftService.interruptAlchemy(player, reason, 'forging');
  }

  // ─── 接口占位 ───

  validateStart(): TechniqueActivityStartValidationResult { return { ok: true, validated: {} }; }
  consumeResources(): void {}
  createJob(player: unknown): any { return (player as any).forgingJob; }
  resolveResumePhase(job: any): string {
    return job.completedCount > 0 || job.currentBatchRemainingTicks < job.batchBrewTicks ? 'brewing' : 'preparing';
  }
  isResolvePoint(job: any): boolean { return job.currentBatchRemainingTicks <= 0 || job.remainingTicks <= 0; }
  resolve(): TechniqueActivityResolveResult {
    return { successCount: 0, failureCount: 0, outputs: [], expParams: { skillLevel: 1, targetLevel: 1, baseActionTicks: 1, getExpToNextByLevel: () => 100 }, completed: true };
  }
  computeRefund(): TechniqueActivityRefundResult { return { items: [], spiritStones: 0 }; }
  dirtyDomains(): PersistenceDomain[] { return ['active_job', 'inventory']; }
}

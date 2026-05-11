/**
 * 强化策略。
 * 通过 executeTick/executeStart/executeCancel 全权委托给
 * CraftPanelRuntimeService 的现有强化方法，管线只负责路由。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';

export class EnhancementStrategy implements TechniqueActivityStrategy {
  readonly kind = 'enhancement' as const;
  readonly jobSlot = 'enhancementJob';
  readonly skillSlot = 'enhancementSkill';
  readonly activityLabel = '强化';
  readonly pauseTicks = 10;
  readonly conditional = false;

  constructor(private craftService: any) {}

  // ─── 全权委托方法（管线直接调用这些） ───

  executeTick(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.tickEnhancement(player);
  }

  executeStart(player: unknown, payload: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.startEnhancement(player, payload);
  }

  executeCancel(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.cancelEnhancement(player);
  }

  executeInterrupt(player: unknown, reason: string, _ctx: PipelineContext): unknown {
    return this.craftService.interruptEnhancement(player, reason);
  }

  // ─── 接口占位（executeTick/Start/Cancel 优先时不会被调用） ───

  validateStart(_player: unknown, _payload: unknown, _ctx: PipelineContext): TechniqueActivityStartValidationResult {
    return { ok: true, validated: {} };
  }

  consumeResources(): void {}

  createJob(player: unknown): any {
    return (player as any).enhancementJob;
  }

  resolveResumePhase(): string { return 'enhancing'; }

  isResolvePoint(job: any): boolean { return job.remainingTicks <= 0; }

  resolve(): TechniqueActivityResolveResult {
    return { successCount: 0, failureCount: 0, outputs: [], expParams: { skillLevel: 1, targetLevel: 1, baseActionTicks: 1, getExpToNextByLevel: () => 100 }, completed: true };
  }

  computeRefund(): TechniqueActivityRefundResult {
    return { items: [], spiritStones: 0 };
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'equipment', 'enhancement_record', 'profession'];
  }
}

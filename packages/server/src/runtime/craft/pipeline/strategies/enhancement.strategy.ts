/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 强化策略。
 * start/tick/interrupt 仍在迁移期委托旧 service；cancel 已拆入 strategy helper。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { executeEnhancementCancel } from './enhancement-cancel.helpers';

export class EnhancementStrategy implements TechniqueActivityStrategy {
  readonly kind = 'enhancement' as const;
  readonly jobSlot = 'enhancementJob';
  readonly skillSlot = 'enhancementSkill';
  readonly activityLabel = '强化';
  readonly pauseTicks = 10;
  readonly conditional = false;

  constructor(private craftService: any) {}

  getActiveJob(player: unknown): any {
    return (player as any).enhancementJob ?? null;
  }

  setActiveJob(player: unknown, job: any | null): void {
    (player as any).enhancementJob = job;
  }

  executeTick(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.tickEnhancement(player);
  }

  executeStart(player: unknown, payload: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.startEnhancement(player, payload);
  }

  executeCancel(player: unknown, ctx: PipelineContext): unknown {
    return executeEnhancementCancel(this.craftService, player, ctx);
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

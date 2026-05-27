/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 强化策略。
 * start/cancel 已拆入 pipeline strategy；tick/interrupt 仍在迁移期委托旧 service。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { computeEnhancementCancelRefund } from './enhancement-cancel.helpers';
import { executeEnhancementInterrupt } from './enhancement-interrupt.helpers';
import { executeEnhancementTick } from './enhancement-tick.helpers';

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

  executeTick(player: unknown, ctx: PipelineContext): unknown {
    return executeEnhancementTick(this.craftService, player, ctx);
  }

  executeInterrupt(player: unknown, reason: string, ctx: PipelineContext): unknown {
    return executeEnhancementInterrupt(this.craftService, player, reason, ctx);
  }

  // ─── Start 生命周期插槽 ───

  validateStart(player: unknown, payload: unknown, _ctx: PipelineContext): TechniqueActivityStartValidationResult {
    return this.craftService.validateEnhancementStart(player, payload);
  }

  queueStart(player: unknown, validated: unknown, payload: unknown, _ctx: PipelineContext): unknown | null {
    return this.craftService.queueEnhancementStart(player, validated, payload);
  }

  consumeResources(player: unknown, validated: unknown, _ctx: PipelineContext): { ok: true } | { ok: false; error?: string } | void {
    return this.craftService.consumeEnhancementStartResources(player, validated);
  }

  createJob(player: unknown, validated: unknown, _ctx: PipelineContext): any {
    const job = this.craftService.createEnhancementStartJob(player, validated);
    this.craftService.finalizeEnhancementStart(player);
    return job;
  }

  buildStartMessages(_player: unknown, validated: unknown, job: any, _ctx: PipelineContext): any[] {
    return this.craftService.buildEnhancementStartMessages(validated, job);
  }

  // ─── Tick/resolve 接口占位（executeTick 优先时不会被调用） ───

  resolveResumePhase(): string { return 'enhancing'; }

  isResolvePoint(job: any): boolean { return job.remainingTicks <= 0; }

  resolve(): TechniqueActivityResolveResult {
    return { successCount: 0, failureCount: 0, outputs: [], expParams: { skillLevel: 1, targetLevel: 1, baseActionTicks: 1, getExpToNextByLevel: () => 100 }, completed: true };
  }

  computeRefund(player: unknown): TechniqueActivityRefundResult {
    return computeEnhancementCancelRefund(this.craftService, player);
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'equipment', 'enhancement_record', 'profession'];
  }
}

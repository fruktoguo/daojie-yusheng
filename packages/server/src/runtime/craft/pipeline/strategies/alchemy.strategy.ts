/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/** 炼丹策略。start 已拆入公共 pipeline；tick/cancel 仍在迁移期委托旧 service。 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { executeAlchemyLikeTick } from './alchemy-like-tick.helpers';
export class AlchemyStrategy implements TechniqueActivityStrategy {
  readonly kind = 'alchemy' as const;
  readonly jobSlot = 'alchemyJob';
  readonly skillSlot = 'alchemySkill';
  readonly activityLabel = '炼丹';
  readonly pauseTicks = 10;
  readonly conditional = false;

  constructor(private craftService: any) {}

  getActiveJob(player: unknown): any {
    return (player as any).alchemyJob ?? null;
  }

  setActiveJob(player: unknown, job: any | null): void {
    (player as any).alchemyJob = job;
  }

  executeTick(player: unknown, _ctx: PipelineContext): unknown {
    return executeAlchemyLikeTick(this.craftService, player, 'alchemy');
  }

  executeCancel(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.cancelAlchemy(player);
  }

  executeInterrupt(player: unknown, reason: string, _ctx: PipelineContext): unknown {
    return this.craftService.interruptAlchemy(player, reason);
  }

  // ─── 接口占位 ───

  validateStart(player: unknown, payload: unknown): TechniqueActivityStartValidationResult {
    return this.craftService.validateAlchemyLikeStart(player, payload, 'alchemy');
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
  computeRefund(): TechniqueActivityRefundResult { return { items: [], spiritStones: 0 }; }
  dirtyDomains(): PersistenceDomain[] { return ['active_job', 'inventory']; }
}

/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 炼丹策略。
 * 通过 executeTick/executeStart/executeCancel 全权委托给
 * CraftPanelRuntimeService 的现有炼丹方法，管线只负责路由。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
export class AlchemyStrategy implements TechniqueActivityStrategy {
  readonly kind = 'alchemy' as const;
  readonly jobSlot = 'alchemyJob';
  readonly skillSlot = 'alchemySkill';
  readonly activityLabel = '炼丹';
  readonly pauseTicks = 10;
  readonly conditional = false;

  constructor(private craftService: any) {}

  executeTick(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.tickAlchemy(player);
  }

  executeStart(player: unknown, payload: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.startAlchemy(player, payload);
  }

  executeCancel(player: unknown, _ctx: PipelineContext): unknown {
    return this.craftService.cancelAlchemy(player);
  }

  executeInterrupt(player: unknown, reason: string, _ctx: PipelineContext): unknown {
    return this.craftService.interruptAlchemy(player, reason);
  }

  // ─── 接口占位 ───

  validateStart(): TechniqueActivityStartValidationResult { return { ok: true, validated: {} }; }
  consumeResources(): void {}
  createJob(player: unknown): any { return (player as any).alchemyJob; }
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

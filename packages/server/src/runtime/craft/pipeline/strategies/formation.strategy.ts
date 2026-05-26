/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import type {
  PlayerFormationJob,
  TechniqueActivityConditionCheckResult,
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';

export class FormationStrategy implements TechniqueActivityStrategy<PlayerFormationJob> {
  readonly kind = 'formation' as const;
  readonly jobSlot = 'formationJob';
  readonly skillSlot = 'formationSkill';
  readonly activityLabel = '阵法维护';
  readonly pauseTicks = 10;
  readonly conditional = true;

  validateStart(_player: unknown, payload: unknown): TechniqueActivityStartValidationResult {
    const formationInstanceId = typeof (payload as { formationInstanceId?: unknown } | null)?.formationInstanceId === 'string'
      ? String((payload as { formationInstanceId: string }).formationInstanceId).trim()
      : '';
    if (!formationInstanceId) {
      return { ok: false, error: '阵法实例 ID 不能为空。' };
    }
    return { ok: true, validated: { formationInstanceId } };
  }

  consumeResources(_player: unknown, _validated: unknown, _ctx: PipelineContext): void {}

  createJob(player: unknown, validated: unknown, ctx: PipelineContext): PlayerFormationJob {
    const formationService = resolveFormationService(ctx);
    return formationService.createFormationMaintenanceJob(player, validated, ctx);
  }

  resolveResumePhase(_job: PlayerFormationJob): string {
    return 'maintaining';
  }

  isResolvePoint(job: PlayerFormationJob): boolean {
    return Number(job.remainingTicks) <= 0;
  }

  resolve(player: unknown, job: PlayerFormationJob, ctx: PipelineContext): TechniqueActivityResolveResult {
    const formationService = resolveFormationService(ctx);
    return formationService.resolveFormationMaintenanceTick(player, job, ctx);
  }

  executeStart(player: unknown, payload: unknown, ctx: PipelineContext): unknown {
    const formationService = resolveFormationService(ctx);
    return formationService.startFormationMaintenance(player, payload, ctx);
  }

  executeCancel(player: unknown, ctx: PipelineContext): unknown {
    const formationService = resolveFormationService(ctx);
    return formationService.cancelFormationMaintenance(player, ctx);
  }

  checkContinueCondition(player: unknown, job: PlayerFormationJob, ctx: PipelineContext): TechniqueActivityConditionCheckResult {
    const formationService = resolveFormationService(ctx);
    return formationService.checkFormationMaintenanceCondition(player, job, ctx);
  }

  computeRefund(_player: unknown, _job: PlayerFormationJob): TechniqueActivityRefundResult {
    return { items: [], spiritStones: 0 };
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'profession'];
  }
}

function resolveFormationService(ctx: PipelineContext): any {
  return (ctx.deps as { worldRuntimeFormationService?: unknown } | null)?.worldRuntimeFormationService;
}

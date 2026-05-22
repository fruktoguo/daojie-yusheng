/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 采集策略（条件型技艺）。
 * 需要玩家在目标容器 1 格内且容器仍有可采集物，
 * 条件不满足时自动休眠入队列尾部，条件恢复后自动继续。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
  TechniqueActivityConditionCheckResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';

export class GatherStrategy implements TechniqueActivityStrategy {
  readonly kind = 'gather' as const;
  readonly jobSlot = 'gatherJob';
  readonly skillSlot = 'gatherSkill';
  readonly activityLabel = '采集';
  readonly pauseTicks = 0;
  readonly conditional = true;

  validateStart(_player: unknown, _payload: unknown, _ctx: PipelineContext): TechniqueActivityStartValidationResult {
    return { ok: true, validated: { _player, _payload } };
  }

  consumeResources(_player: unknown, _validated: unknown, _ctx: PipelineContext): void {}

  createJob(player: unknown, _validated: unknown, _ctx: PipelineContext): any {
    return (player as any).gatherJob;
  }

  resolveResumePhase(_job: any): string {
    return 'gathering';
  }

  isResolvePoint(job: any): boolean {
    return job.remainingTicks <= 0;
  }

  resolve(_player: unknown, _job: any, _ctx: PipelineContext): TechniqueActivityResolveResult {
    return {
      successCount: 1,
      failureCount: 0,
      outputs: [],
      expParams: {
        skillLevel: 1,
        targetLevel: 1,
        baseActionTicks: 1,
        getExpToNextByLevel: () => 100,
      },
      completed: true,
      messages: [],
    };
  }

  computeRefund(_player: unknown, _job: any): TechniqueActivityRefundResult {
    return { items: [], spiritStones: 0 };
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'inventory'];
  }

  // ─── 条件型方法 ───

  checkContinueCondition(_player: unknown, _job: any, _ctx: PipelineContext): TechniqueActivityConditionCheckResult {
    // 实际条件检查将在 Phase 5 集成时从 WorldRuntimeLootContainerService.tickGather 提取：
    // - 玩家在容器 1 格内
    // - 容器存在且为 herb 类型
    // - 容器仍有可采集物
    // 当前存根默认满足
    return { satisfied: true };
  }

  onConditionFailed(_player: unknown, _job: any, _ctx: PipelineContext): void {
    // 释放容器的 activeSearch 状态
  }

  onConditionRestored(_player: unknown, _job: any, _ctx: PipelineContext): void {
    // 重新锁定容器的 activeSearch
  }
}

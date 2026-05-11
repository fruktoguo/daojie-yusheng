/**
 * 技艺活动 Durable 操作包装器。
 * 在管线 start/tick 前后捕获 rollback 快照，失败时自动恢复，
 * 成功时创建/更新/完成 durable 记录，保证技艺操作的崩溃恢复能力。
 */
import type { RuntimeTechniqueActivityKind } from '@mud/shared';
import type {
  CraftMutationResult,
  CraftTickResult,
  TechniqueActivityPipelineService,
} from './technique-activity-pipeline.service';
import type {
  PipelineContext,
  TechniqueActivityStrategy,
} from './technique-activity-strategy';

export class TechniqueActivityDurableService {
  constructor(private pipeline: TechniqueActivityPipelineService) {}

  /**
   * 带 durable 保护的启动。
   * 捕获 rollback → 执行 start → 成功则创建 durable 记录 → 失败则恢复。
   */
  async startDurably(
    player: any,
    kind: RuntimeTechniqueActivityKind,
    payload: unknown,
    ctx: PipelineContext & { durableOperationService?: any },
  ): Promise<CraftMutationResult> {
    const strategy = this.pipeline.getStrategy(kind);
    if (!strategy) return { ok: false, error: `unsupported kind: ${kind}`, panelChanged: false, messages: [] };

    const rollback = this.captureRollback(player, strategy);
    try {
      const result = this.pipeline.start(player, kind, payload, ctx);
      if (!result.ok) {
        this.restoreRollback(player, strategy, rollback);
        return result;
      }
      // Durable 记账（如果启用）
      if (ctx.durableOperationService?.isEnabled?.()) {
        const snapshot = this.buildSnapshot(player, strategy);
        const operationId = this.buildOperationId(player, kind);
        await ctx.durableOperationService.create?.(operationId, snapshot);
      }
      return result;
    } catch (e) {
      this.restoreRollback(player, strategy, rollback);
      throw e;
    }
  }

  /**
   * 带 durable 保护的 tick。
   * 捕获 rollback → 执行 tick → 成功则更新/完成 durable 记录 → 失败则恢复。
   */
  async tickDurably(
    player: any,
    kind: RuntimeTechniqueActivityKind,
    ctx: PipelineContext & { durableOperationService?: any },
  ): Promise<CraftTickResult> {
    const strategy = this.pipeline.getStrategy(kind);
    if (!strategy) return { ok: true, panelChanged: false, inventoryChanged: false, equipmentChanged: false, attrChanged: false, messages: [], groundDrops: [], craftRealmExpGain: 0 };

    const rollback = this.captureRollback(player, strategy);
    try {
      const result = this.pipeline.tick(player, kind, ctx);
      if (!result.ok) {
        this.restoreRollback(player, strategy, rollback);
        return result;
      }
      // Durable 记账
      if (ctx.durableOperationService?.isEnabled?.()) {
        const job = (player as any)[strategy.jobSlot];
        const operationId = this.buildOperationId(player, kind);
        if (job && Number(job.remainingTicks) > 0) {
          await ctx.durableOperationService.update?.(operationId, this.buildSnapshot(player, strategy));
        } else {
          await ctx.durableOperationService.complete?.(operationId);
        }
      }
      return result;
    } catch (e) {
      this.restoreRollback(player, strategy, rollback);
      throw e;
    }
  }

  // ─── 内部方法 ───

  private captureRollback(player: any, strategy: TechniqueActivityStrategy): any {
    return {
      job: player[strategy.jobSlot] ? JSON.parse(JSON.stringify(player[strategy.jobSlot])) : null,
    };
  }

  private restoreRollback(player: any, strategy: TechniqueActivityStrategy, rollback: any): void {
    player[strategy.jobSlot] = rollback.job;
  }

  private buildSnapshot(player: any, strategy: TechniqueActivityStrategy): any {
    const job = player[strategy.jobSlot];
    if (!job) return null;
    return {
      jobRunId: job.jobRunId ?? '',
      jobType: strategy.kind,
      phase: job.phase ?? 'running',
      remainingTicks: Number(job.remainingTicks) || 0,
      totalTicks: Number(job.totalTicks) || 0,
    };
  }

  private buildOperationId(player: any, kind: RuntimeTechniqueActivityKind): string {
    const playerId = player.playerId ?? 'player';
    const job = player[this.pipeline.getStrategy(kind)?.jobSlot ?? ''];
    const jobRunId = job?.jobRunId ?? 'job';
    return `op:${playerId}:${kind}:${jobRunId}`;
  }
}

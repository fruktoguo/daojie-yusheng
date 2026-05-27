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

  getActiveJob(player: unknown): any {
    return (player as any).gatherJob ?? null;
  }

  setActiveJob(player: unknown, job: any | null): void {
    (player as any).gatherJob = job;
  }

  validateStart(player: unknown, payload: unknown, ctx: PipelineContext): TechniqueActivityStartValidationResult {
    const playerId = resolvePlayerId(player);
    const service = resolveGatherRuntimeService(ctx);
    if (!playerId || !service || typeof service.dispatchStartGather !== 'function') {
      return { ok: false, error: '采集运行时不可用。' };
    }
    return { ok: true, validated: { playerId, payload: normalizeGatherStartPayload(playerId, payload, ctx) } };
  }

  consumeResources(player: unknown, validated: unknown, ctx: PipelineContext): { ok: true } | { ok: false; error?: string } {
    const playerId = typeof (validated as { playerId?: unknown } | null)?.playerId === 'string'
      ? String((validated as { playerId: string }).playerId).trim()
      : resolvePlayerId(player);
    const payload = (validated as { payload?: unknown } | null)?.payload;
    const service = resolveGatherRuntimeService(ctx);
    const result = service?.dispatchStartGather?.(playerId, payload, ctx.deps) as { ok?: boolean; error?: string } | undefined;
    if (!result || result.ok !== true) {
      return { ok: false, error: result?.error ?? '开始采集失败。' };
    }
    if (!this.getActiveJob(player)) {
      return { ok: false, error: '采集任务创建失败。' };
    }
    return { ok: true };
  }

  createJob(player: unknown, _validated: unknown, _ctx: PipelineContext): any {
    return (player as any).gatherJob;
  }

  startDirtyDomains(): PersistenceDomain[] {
    return ['active_job'];
  }

  executeInterrupt(player: unknown, reason: string, ctx: PipelineContext): unknown {
    const playerId = resolvePlayerId(player);
    const service = resolveGatherRuntimeService(ctx);
    if (!playerId || !service || typeof service.interruptGather !== 'function') {
      return { ok: true, panelChanged: false, messages: [], groundDrops: [], craftRealmExpGain: 0 };
    }
    return service.interruptGather(playerId, player, reason, ctx.deps);
  }

  async executeTick(player: unknown, ctx: PipelineContext): Promise<unknown> {
    const playerId = resolvePlayerId(player);
    const service = resolveGatherRuntimeService(ctx);
    if (!playerId || !service || typeof service.tickGather !== 'function') {
      return emptyGatherTickResult();
    }
    return service.tickGather(playerId, ctx.deps);
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

  checkContinueCondition(player: unknown, job: any, ctx: PipelineContext): TechniqueActivityConditionCheckResult {
    const playerId = resolvePlayerId(player);
    const service = resolveGatherRuntimeService(ctx);
    if (playerId && service && typeof service.checkGatherContinueCondition === 'function') {
      return service.checkGatherContinueCondition(playerId, player, job, ctx.deps);
    }
    return { satisfied: true };
  }

  onConditionFailed(player: unknown, job: any, ctx: PipelineContext): void {
    const playerId = resolvePlayerId(player);
    const service = resolveGatherRuntimeService(ctx);
    if (playerId && service && typeof service.releaseGatherActiveSearch === 'function') {
      service.releaseGatherActiveSearch(playerId, player, job, ctx.deps);
    }
  }

  onConditionRestored(_player: unknown, _job: any, _ctx: PipelineContext): void {
    // 启动时由 dispatchStartGather 重新锁定 activeSearch，避免恢复阶段重复占用。
  }
}

type GatherRuntimeServicePort = {
  dispatchStartGather?: (playerId: string, payload: unknown, deps: unknown) => unknown;
  interruptGather?: (playerId: string, player: unknown, reason: string, deps: unknown) => unknown;
  checkGatherContinueCondition?: (
    playerId: string,
    player: unknown,
    job: unknown,
    deps: unknown,
  ) => TechniqueActivityConditionCheckResult;
  releaseGatherActiveSearch?: (playerId: string, player: unknown, job: unknown, deps: unknown) => void;
  tickGather?: (playerId: string, deps: unknown) => Promise<unknown> | unknown;
};

function resolvePlayerId(player: unknown): string {
  const playerId = (player as { playerId?: unknown } | null | undefined)?.playerId;
  return typeof playerId === 'string' && playerId.trim() ? playerId.trim() : '';
}

function emptyGatherTickResult(): Record<string, unknown> {
  return {
    ok: true,
    panelChanged: false,
    inventoryChanged: false,
    equipmentChanged: false,
    attrChanged: false,
    messages: [],
    groundDrops: [],
    craftRealmExpGain: 0,
  };
}

function resolveGatherRuntimeService(ctx: PipelineContext): GatherRuntimeServicePort | null {
  const deps = ctx.deps as { worldRuntimeLootContainerService?: GatherRuntimeServicePort } | null | undefined;
  return deps?.worldRuntimeLootContainerService ?? null;
}

function normalizeGatherStartPayload(playerId: string, payload: unknown, ctx: PipelineContext): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const sourceId = typeof record.sourceId === 'string' && record.sourceId.trim()
    ? record.sourceId.trim()
    : typeof record.resourceNodeId === 'string' && record.resourceNodeId.trim()
      ? record.resourceNodeId.trim()
      : '';
  if (!sourceId || sourceId.startsWith('container:')) {
    return payload;
  }
  const deps = ctx.deps as {
    getPlayerLocation?: (playerId: string) => { instanceId?: string } | null;
    getPlayerLocationOrThrow?: (playerId: string) => { instanceId?: string };
  } | null | undefined;
  let instanceId = typeof record.instanceId === 'string' && record.instanceId.trim()
    ? record.instanceId.trim()
    : '';
  if (!instanceId) {
    let location: { instanceId?: string } | null | undefined = deps?.getPlayerLocation?.(playerId);
    if (!location && typeof deps?.getPlayerLocationOrThrow === 'function') {
      try {
        location = deps.getPlayerLocationOrThrow(playerId);
      } catch (_error) {
        location = null;
      }
    }
    instanceId = typeof location?.instanceId === 'string' && location.instanceId.trim()
      ? location.instanceId.trim()
      : '';
  }
  return instanceId
    ? { ...record, sourceId: `container:${instanceId}:${sourceId}` }
    : payload;
}

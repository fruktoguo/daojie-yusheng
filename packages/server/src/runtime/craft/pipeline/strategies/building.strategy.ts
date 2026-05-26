/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 建造策略（条件型技艺）。
 * 需要建筑存在且玩家为 activeBuilder 时才持续推进，
 * 条件不满足时自动休眠入队列尾部，条件恢复后自动继续。
 */
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
  TechniqueActivityConditionCheckResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';

export class BuildingStrategy implements TechniqueActivityStrategy {
  readonly kind = 'building' as const;
  readonly jobSlot = 'buildingJob';
  readonly skillSlot = 'buildingSkill';
  readonly activityLabel = '建造';
  readonly pauseTicks = 0;
  readonly conditional = true;

  getActiveJob(player: unknown): any {
    return (player as any).buildingJob ?? null;
  }

  setActiveJob(player: unknown, job: any | null): void {
    (player as any).buildingJob = job;
  }

  validateStart(_player: unknown, _payload: unknown, _ctx: PipelineContext): TechniqueActivityStartValidationResult {
    return { ok: true, validated: { _player, _payload } };
  }

  consumeResources(_player: unknown, _validated: unknown, _ctx: PipelineContext): void {}

  createJob(player: unknown, _validated: unknown, _ctx: PipelineContext): any {
    return (player as any).buildingJob;
  }

  executeStart(player: unknown, payload: unknown, ctx: PipelineContext): unknown {
    const playerId = resolvePlayerId(player);
    const buildingId = resolveBuildingId(payload);
    const deps = resolveBuildingDeps(ctx);
    if (!playerId || !buildingId || typeof deps?.dispatchStartBuildingConstruction !== 'function') {
      return { ok: false, error: '建造运行时不可用。', panelChanged: false, messages: [] };
    }
    try {
      deps.dispatchStartBuildingConstruction(playerId, buildingId);
      return { ok: true, panelChanged: true, messages: [] };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        panelChanged: false,
        messages: [],
      };
    }
  }

  executeCancel(player: unknown, ctx: PipelineContext): unknown {
    const playerId = resolvePlayerId(player);
    const deps = resolveBuildingDeps(ctx);
    if (!playerId || typeof deps?.interruptBuildingConstruction !== 'function') {
      return { ok: false, error: '建造运行时不可用。', panelChanged: false, messages: [] };
    }
    deps.interruptBuildingConstruction(playerId, 'cancel');
    return { ok: true, panelChanged: true, messages: [] };
  }

  executeInterrupt(player: unknown, reason: string, ctx: PipelineContext): unknown {
    const playerId = resolvePlayerId(player);
    const deps = resolveBuildingDeps(ctx);
    if (playerId && typeof deps?.interruptBuildingConstruction === 'function') {
      deps.interruptBuildingConstruction(playerId, reason);
    }
    return { ok: true, panelChanged: true, inventoryChanged: false, equipmentChanged: false, attrChanged: false, messages: [], groundDrops: [], craftRealmExpGain: 0 };
  }

  executeTick(player: unknown, ctx: PipelineContext): unknown {
    const playerId = resolvePlayerId(player);
    const deps = resolveBuildingDeps(ctx);
    if (!playerId || typeof deps?.tickBuildingConstruction !== 'function') {
      return emptyBuildingTickResult();
    }
    return deps.tickBuildingConstruction(playerId) ?? emptyBuildingTickResult();
  }

  resolveResumePhase(_job: any): string {
    return 'building';
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
    return ['active_job'];
  }

  // ─── 条件型方法 ───

  checkContinueCondition(player: unknown, job: any, ctx: PipelineContext): TechniqueActivityConditionCheckResult {
    const playerId = resolvePlayerId(player);
    const buildingId = resolveBuildingId(job);
    const deps = resolveBuildingDeps(ctx);
    if (!playerId || !buildingId) {
      return { satisfied: false, reason: '建造目标无效。', shouldCancel: true };
    }
    const instanceId = resolveInstanceId(player, job, deps);
    const instance = instanceId && typeof deps?.getInstanceRuntime === 'function'
      ? deps.getInstanceRuntime(instanceId)
      : null;
    const building = instance?.buildingById?.get?.(buildingId);
    if (!instance || !building) {
      return { satisfied: false, reason: '建造目标已经不存在。', shouldCancel: true };
    }
    if (building.state !== 'building') {
      return { satisfied: false, reason: '建筑当前不可继续施工。', shouldCancel: true };
    }
    if (building.activeBuilderPlayerId && building.activeBuilderPlayerId !== playerId) {
      return { satisfied: false, reason: '建筑正在由其他玩家施工。' };
    }
    return { satisfied: true };
  }

  onConditionFailed(player: unknown, job: any, ctx: PipelineContext): void {
    releaseBuildingActiveBuilder(player, job, ctx);
  }

  onConditionRestored(_player: unknown, _job: any, _ctx: PipelineContext): void {
    // 启动时由 dispatchStartBuildingConstruction 重新注册 activeBuilder。
  }
}

type BuildingDepsPort = {
  dispatchStartBuildingConstruction?: (playerId: string, buildingId: string) => unknown;
  interruptBuildingConstruction?: (playerId: string, reason?: string) => unknown;
  tickBuildingConstruction?: (playerId: string) => unknown;
  getInstanceRuntime?: (instanceId: string) => any;
  getPlayerLocation?: (playerId: string) => { instanceId?: string } | null;
  getPlayerLocationOrThrow?: (playerId: string) => { instanceId?: string };
};

function resolvePlayerId(player: unknown): string {
  const playerId = (player as { playerId?: unknown } | null | undefined)?.playerId;
  return typeof playerId === 'string' && playerId.trim() ? playerId.trim() : '';
}

function emptyBuildingTickResult(): Record<string, unknown> {
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

function resolveBuildingId(value: unknown): string {
  const record = value as { buildingId?: unknown } | null | undefined;
  const buildingId = record?.buildingId;
  return typeof buildingId === 'string' && buildingId.trim() ? buildingId.trim() : '';
}

function resolveBuildingDeps(ctx: PipelineContext): BuildingDepsPort | null {
  return ctx.deps as BuildingDepsPort | null;
}

function resolveInstanceId(player: unknown, job: unknown, deps: BuildingDepsPort | null): string {
  const jobInstanceId = (job as { instanceId?: unknown } | null | undefined)?.instanceId;
  if (typeof jobInstanceId === 'string' && jobInstanceId.trim()) {
    return jobInstanceId.trim();
  }
  const playerInstanceId = (player as { instanceId?: unknown } | null | undefined)?.instanceId;
  if (typeof playerInstanceId === 'string' && playerInstanceId.trim()) {
    return playerInstanceId.trim();
  }
  const playerId = resolvePlayerId(player);
  const location = playerId
    ? deps?.getPlayerLocation?.(playerId) ?? deps?.getPlayerLocationOrThrow?.(playerId)
    : null;
  return typeof location?.instanceId === 'string' && location.instanceId.trim()
    ? location.instanceId.trim()
    : '';
}

function releaseBuildingActiveBuilder(player: unknown, job: unknown, ctx: PipelineContext): void {
  const playerId = resolvePlayerId(player);
  const buildingId = resolveBuildingId(job);
  const deps = resolveBuildingDeps(ctx);
  const instanceId = resolveInstanceId(player, job, deps);
  const instance = instanceId && typeof deps?.getInstanceRuntime === 'function'
    ? deps.getInstanceRuntime(instanceId)
    : null;
  const building = instance?.buildingById?.get?.(buildingId);
  if (!playerId || !buildingId || !instance || !building || building.activeBuilderPlayerId !== playerId) {
    return;
  }
  if (building.state === 'building' && typeof instance.stopBuildingConstruction === 'function') {
    instance.stopBuildingConstruction(buildingId, playerId);
    return;
  }
  building.activeBuilderPlayerId = null;
  building.buildCompleteTick = undefined;
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
  instance.persistentRevision = Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)) + 1;
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);
}

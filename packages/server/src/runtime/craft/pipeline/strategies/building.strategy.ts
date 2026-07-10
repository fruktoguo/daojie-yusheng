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
import { TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH } from '@mud/shared';
import type {
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
  TechniqueActivityConditionCheckResult,
  TechniqueActivityNoticeMessage,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { executeBuildingTick } from './building-tick.helpers';

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

  validateStart(player: unknown, payload: unknown, ctx: PipelineContext): TechniqueActivityStartValidationResult {
    const playerId = resolvePlayerId(player);
    const buildingId = resolveBuildingId(payload);
    const deps = resolveBuildingDeps(ctx);
    if (!playerId || !buildingId || typeof deps?.dispatchStartBuildingConstruction !== 'function') {
      return { ok: false, error: '建造运行时不可用。' };
    }
    return { ok: true, validated: { playerId, buildingId, payload } };
  }

  queueStart(player: unknown, validated: unknown, payload: unknown, ctx: PipelineContext): unknown | null {
    if (!hasOtherActiveTechniqueActivity(player, 'building')) {
      return null;
    }
    const queue = ensureTechniqueActivityQueue(player);
    if (queue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
      return { ok: false, error: '技艺任务队列已满。', panelChanged: true, messages: [], groundDrops: [] };
    }
    const buildingId = resolveBuildingId(validated) || resolveBuildingId(payload);
    const nextPayload = {
      ...(payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}),
      buildingId,
    };
    const item = {
      queueId: createBuildingQueueId(buildingId),
      kind: 'building',
      payload: nextPayload,
      label: '营造任务',
      state: 'pending',
      createdAt: Date.now(),
      cancelRef: { kind: 'building', queueId: '' },
    };
    item.cancelRef.queueId = item.queueId;
    if (normalizeQueueMode((payload as { queueMode?: unknown } | null)?.queueMode) === 'replace') {
      queue.length = 0;
    }
    queue.push(item);
    markBuildingQueueDirty(player, ctx);
    return {
      ok: true,
      panelChanged: true,
      messages: [{
        kind: 'system',
        key: 'notice.craft.queue.appended',
        vars: { label: item.label },
        pills: [{ key: 'label', style: 'target' }],
      }],
      groundDrops: [],
    };
  }

  consumeResources(player: unknown, validated: unknown, ctx: PipelineContext): { ok: true } | { ok: false; error?: string } {
    const playerId = typeof (validated as { playerId?: unknown } | null)?.playerId === 'string'
      ? String((validated as { playerId: string }).playerId).trim()
      : resolvePlayerId(player);
    const buildingId = typeof (validated as { buildingId?: unknown } | null)?.buildingId === 'string'
      ? String((validated as { buildingId: string }).buildingId).trim()
      : '';
    const deps = resolveBuildingDeps(ctx);
    try {
      deps.dispatchStartBuildingConstruction(playerId, buildingId);
      if (!this.getActiveJob(player)) {
        return { ok: false, error: '建造任务创建失败。' };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  createJob(player: unknown, _validated: unknown, _ctx: PipelineContext): any {
    return (player as any).buildingJob;
  }

  startDirtyDomains(): PersistenceDomain[] {
    return ['active_job'];
  }

  buildStartMessages(_player: unknown, _validated: unknown, job: any): TechniqueActivityNoticeMessage[] {
    const buildingName = typeof job?.buildingName === 'string' && job.buildingName.trim()
      ? job.buildingName.trim()
      : '建筑';
    const totalTicks = Math.max(1, Math.trunc(Number(job?.totalTicks ?? job?.workTotalTicks ?? 1) || 1));
    return [{
      kind: 'building',
      key: 'notice.craft.building.start',
      vars: { buildingName, totalTicks },
      pills: [{ key: 'buildingName', style: 'target' }],
    }];
  }

  executeTick(player: unknown, ctx: PipelineContext): unknown {
    const playerId = resolvePlayerId(player);
    const deps = resolveBuildingDeps(ctx);
    if (!playerId || typeof deps?.getInstanceRuntime !== 'function') {
      return emptyBuildingTickResult();
    }
    return executeBuildingTick(playerId, ctx, deps as never);
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
  tickBuildingConstruction?: (playerId: string) => unknown;
  playerRuntimeService?: {
    getPlayer?(playerId: string): Record<string, any> | null;
    markPersistenceDirtyDomains?(player: Record<string, any>, domains: string[]): void;
    bumpPersistentRevision?(player: Record<string, any>): void;
  };
  getInstanceRuntime?: (instanceId: string) => any;
  getPlayerLocation?: (playerId: string) => { instanceId?: string } | null;
  getPlayerLocationOrThrow?: (playerId: string) => { instanceId?: string };
  refreshPlayerContextActions?: (playerId: string) => unknown;
  resolveBuildingDisplayName?: (instance: unknown, building: Record<string, any>) => string | null;
  resolveBuildingDisplayNameByRuntime?: (runtime: unknown, building: Record<string, any>) => string | null;
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

function ensureTechniqueActivityQueue(player: unknown): any[] {
  const target = player as { techniqueActivityQueue?: unknown } | null | undefined;
  if (!target || typeof target !== 'object') {
    return [];
  }
  if (!Array.isArray(target.techniqueActivityQueue)) {
    target.techniqueActivityQueue = [];
  }
  return target.techniqueActivityQueue as any[];
}

function hasOtherActiveTechniqueActivity(player: unknown, ownKind: string): boolean {
  const record = player as Record<string, any> | null | undefined;
  if (!record) {
    return false;
  }
  const slots = [
    ['alchemy', record.alchemyJob],
    ['forging', record.forgingJob],
    ['enhancement', record.enhancementJob],
    ['transmission', record.transmissionJob],
    ['gather', record.gatherJob],
    ['building', record.buildingJob],
    ['mining', record.miningJob],
    ['formation', record.formationJob],
  ];
  return slots.some(([kind, job]) => kind !== ownKind && Boolean(job) && Number((job as any).remainingTicks) > 0);
}

function normalizeQueueMode(value: unknown): 'append' | 'replace' {
  return value === 'replace' ? 'replace' : 'append';
}

function createBuildingQueueId(buildingId: string): string {
  const suffix = buildingId || 'unknown';
  return `building:${suffix}:${Date.now().toString(36)}`;
}

function markBuildingQueueDirty(player: unknown, ctx: PipelineContext): void {
  const deps = resolveBuildingDeps(ctx);
  const runtime = deps?.playerRuntimeService;
  const target = player as Record<string, any> | null | undefined;
  if (!target) {
    return;
  }
  if (target.dirtyDomains && typeof target.dirtyDomains.add === 'function') {
    target.dirtyDomains.add('active_job');
  }
  runtime?.markPersistenceDirtyDomains?.(target, ['active_job']);
  runtime?.bumpPersistentRevision?.(target);
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
  if (!playerId || !buildingId || !instance || !building) {
    return;
  }
  if (building.state === 'building' && typeof instance.stopBuildingConstruction === 'function') {
    instance.stopBuildingConstruction(buildingId, playerId);
    deps?.refreshPlayerContextActions?.(playerId);
    return;
  }
  if (building.activeBuilderPlayerId !== playerId) {
    return;
  }
  building.activeBuilderPlayerId = null;
  building.buildCompleteTick = undefined;
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.markAoiViewChangedAt?.(building.x, building.y);
  instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
  instance.persistentRevision = Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)) + 1;
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);
  deps?.refreshPlayerContextActions?.(playerId);
}

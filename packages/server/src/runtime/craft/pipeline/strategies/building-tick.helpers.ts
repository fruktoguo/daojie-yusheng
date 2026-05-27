import { computeCraftSkillExpGain } from '@mud/shared';
import type { PipelineContext } from '../technique-activity-strategy';
import {
  DEFAULT_CRAFT_EXP_TO_NEXT,
  resolveCraftSkillExpToNextByLevel,
} from '../../craft-skill-exp.helpers';

export function executeBuildingTick(
  playerId: string,
  ctx: PipelineContext,
  runtimeOverride?: BuildingTickRuntimePort,
): BuildingTickResult {
  const runtime = runtimeOverride ?? resolveBuildingRuntime(ctx);
  const playerRuntimeService = runtime?.playerRuntimeService;
  const player = playerRuntimeService?.getPlayer?.(playerId);
  const job = player?.buildingJob;
  if (!runtime || !playerRuntimeService || !player || !job || Number(job.remainingTicks) <= 0) {
    return buildBuildingTickResult();
  }

  const instanceId = typeof job.instanceId === 'string' && job.instanceId.trim() ? job.instanceId.trim() : '';
  const instance = instanceId ? runtime.getInstanceRuntime?.(instanceId) : null;
  const building = instance?.buildingById?.get?.(job.buildingId);
  if (!instance || !building) {
    player.buildingJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    runtime.refreshPlayerContextActions?.(playerId);
    return buildBuildingTickResult(true, [{ kind: 'warn', text: '建造目标已经不存在。' }]);
  }

  if (building.state !== 'building') {
    releaseStaleBuildingActiveBuilder(instance, building, playerId);
    player.buildingJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    runtime.refreshPlayerContextActions?.(playerId);
    return buildBuildingTickResult(true, [{ kind: 'warn', text: '建筑当前不可继续施工。' }]);
  }

  if (building.activeBuilderPlayerId !== playerId) {
    const sleepPayload = buildBuildingSleepPayload(job, building, '建筑正在由其他玩家施工。');
    player.buildingJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    runtime.refreshPlayerContextActions?.(playerId);
    return {
      ...buildBuildingTickResult(true, [{ kind: 'warn', text: '建筑施工条件暂时不满足，已转入等待队列。' }]),
      sleepPayload,
    };
  }

  const previousRemainingTicks = resolveBuildingRemainingTicksForView(building);
  const nextRemainingTicks = Math.max(0, previousRemainingTicks - 1);
  building.buildRemainingTicks = nextRemainingTicks;
  building.buildCompleteTick = nextRemainingTicks > 0 ? Number(instance.tick) + nextRemainingTicks : Number(instance.tick);
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
  instance.persistentRevision = Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)) + 1;
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);

  const gainedExp = applyBuildingConstructionProgress(playerRuntimeService, player, 1);
  const skillChanged = gainedExp > 0;

  if (nextRemainingTicks <= 0) {
    building.state = 'active';
    building.activeBuilderPlayerId = null;
    const completionDomains = instance.activatePlacedBuildingTopologyAndVisual?.(building) ?? [];
    if (completionDomains.length > 0) {
      instance.markPersistenceDirtyDomainsHighPriority?.(completionDomains);
    }
    player.buildingJob = null;
    playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job', ...(skillChanged ? ['profession'] : [])]);
    playerRuntimeService.bumpPersistentRevision?.(player);
    notifyBuildingConstructionCompletion(runtime, building);
    runtime.refreshPlayerContextActions?.(playerId);
    return buildBuildingTickResult(true, [], false, skillChanged, gainedExp / 2);
  }

  const nextTotalTicks = Math.max(
    nextRemainingTicks,
    Math.trunc(Number(job.totalTicks) || 0),
    Math.trunc(Number(building.buildStrength) || 0),
    1,
  );
  job.buildingName = runtime.resolveBuildingDisplayName?.(instance, building) ?? job.buildingName ?? building.defId ?? '建筑';
  job.instanceId = instance.meta?.instanceId ?? instanceId;
  job.totalTicks = nextTotalTicks;
  job.remainingTicks = nextRemainingTicks;
  job.workTotalTicks = nextTotalTicks;
  job.workRemainingTicks = nextRemainingTicks;
  job.interruptWaitRemainingTicks = 0;
  job.interruptState = null;
  job.pausedTicks = 0;
  job.phase = 'building';

  playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job', ...(skillChanged ? ['profession'] : [])]);
  playerRuntimeService.bumpPersistentRevision?.(player);
  return buildBuildingTickResult(true, [], false, skillChanged, gainedExp / 2);
}

function resolveBuildingRuntime(ctx: PipelineContext): BuildingTickRuntimePort | null {
  return ctx.deps as BuildingTickRuntimePort | null;
}

function markPlayerActiveJobDirty(playerRuntimeService: BuildingPlayerRuntimeServicePort, player: Record<string, any>): void {
  playerRuntimeService.bumpPersistentRevision?.(player);
  playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
}

function applyBuildingConstructionProgress(
  playerRuntimeService: BuildingPlayerRuntimeServicePort,
  player: Record<string, any>,
  progressTicks: number,
): number {
  const gainedExp = applyBuildingSkillExp(playerRuntimeService, player, progressTicks);
  if (gainedExp > 0) {
    if (!(player.dirtyDomains instanceof Set)) {
      player.dirtyDomains = new Set();
    }
    player.dirtyDomains.add('profession');
  }
  return gainedExp;
}

function applyBuildingSkillExp(source: unknown, player: Record<string, any>, buildStrength: number): number {
  if (!player) {
    return 0;
  }
  const skill = ensureBuildingSkillState(source, player);
  const gain = computeCraftSkillExpGain({
    skillLevel: skill.level,
    targetLevel: skill.level,
    baseActionTicks: normalizeBuildStrength(buildStrength),
    getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(source, level),
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
  if (gain <= 0) {
    return 0;
  }
  applyCraftSkillExp(source, skill, gain);
  return gain;
}

function ensureBuildingSkillState(source: unknown, player: Record<string, any>): { level: number; exp: number; expToNext: number } {
  const level = Math.max(1, Math.floor(Number(player?.buildingSkill?.level) || 1));
  const expToNext = resolveCraftSkillExpToNextByLevel(source, level, DEFAULT_CRAFT_EXP_TO_NEXT);
  const state = {
    level,
    exp: Math.max(0, Math.floor(Number(player?.buildingSkill?.exp) || 0)),
    expToNext,
  };
  player.buildingSkill = state;
  return state;
}

function applyCraftSkillExp(source: unknown, skill: { level: number; exp: number; expToNext: number } | null | undefined, amount: number): boolean {
  if (!skill) {
    return false;
  }
  let changed = false;
  const currentExpToNext = resolveCraftSkillExpToNextByLevel(source, skill.level);
  if (skill.expToNext !== currentExpToNext) {
    skill.expToNext = currentExpToNext;
    changed = true;
  }
  skill.exp += Math.max(0, Math.floor(Number(amount) || 0));
  while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = resolveCraftSkillExpToNextByLevel(source, skill.level);
    changed = true;
  }
  return changed || amount > 0;
}

function normalizeBuildStrength(value: unknown): number {
  const normalized = Math.trunc(Number(value) || 1);
  return Math.max(1, normalized);
}

function notifyBuildingConstructionCompletion(runtime: BuildingTickRuntimePort, building: Record<string, any>): void {
  const playerId = normalizeBuildingId(building?.ownerPlayerId);
  const buildingName = runtime.resolveBuildingDisplayNameByRuntime?.(runtime, building) ?? building?.defId ?? '建筑';
  if (playerId && canQueueBuildingNotice(runtime)) {
    runtime.queuePlayerNotice?.(playerId, `${buildingName}已完工`, 'success');
  }
}

function buildBuildingTickResult(
  panelChanged = false,
  messages: BuildingNoticeMessage[] = [],
  inventoryChanged = false,
  attrChanged = false,
  craftRealmExpGain = 0,
): BuildingTickResult {
  return {
    ok: true,
    panelChanged,
    inventoryChanged,
    equipmentChanged: false,
    attrChanged,
    messages,
    groundDrops: [],
    craftRealmExpGain,
  };
}

function buildBuildingSleepPayload(job: Record<string, any>, building: Record<string, any>, reason: string): Record<string, unknown> {
  return {
    kind: 'building',
    payload: {
      buildingId: job?.buildingId ?? building?.id,
      instanceId: job?.instanceId ?? building?.instanceId,
    },
    label: job?.buildingName ?? building?.defId ?? '建造',
    reason,
  };
}

function resolveBuildingRemainingTicksForView(building: Record<string, any>): number {
  if (Number.isFinite(Number(building?.buildRemainingTicks))) {
    return Math.max(0, Math.trunc(Number(building.buildRemainingTicks)));
  }
  if (Number.isFinite(Number(building?.buildStrength))) {
    return Math.max(1, Math.trunc(Number(building.buildStrength)));
  }
  return 0;
}

function releaseStaleBuildingActiveBuilder(instance: Record<string, any>, building: Record<string, any>, playerId: string): boolean {
  if (!instance || !building || building.activeBuilderPlayerId !== playerId) {
    return false;
  }
  building.activeBuilderPlayerId = null;
  building.buildCompleteTick = undefined;
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
  instance.persistentRevision = Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)) + 1;
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);
  return true;
}

function canQueueBuildingNotice(runtime: BuildingTickRuntimePort): boolean {
  return typeof runtime?.queuePlayerNotice === 'function'
    && typeof runtime?.worldRuntimeTickDispatchService?.queuePlayerNotice === 'function';
}

function normalizeBuildingId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

type BuildingNoticeMessage = {
  kind: string;
  text?: string;
};

type BuildingTickResult = {
  ok: boolean;
  panelChanged: boolean;
  inventoryChanged: boolean;
  equipmentChanged: boolean;
  attrChanged: boolean;
  messages: BuildingNoticeMessage[];
  groundDrops: unknown[];
  craftRealmExpGain: number;
  sleepPayload?: Record<string, unknown>;
};

type BuildingPlayerRuntimeServicePort = {
  getPlayer?(playerId: string): Record<string, any> | null;
  markPersistenceDirtyDomains?(player: Record<string, any>, domains: string[]): void;
  bumpPersistentRevision?(player: Record<string, any>): void;
};

type BuildingTickRuntimePort = {
  playerRuntimeService?: BuildingPlayerRuntimeServicePort;
  getInstanceRuntime?(instanceId: string): {
    tick: number;
    meta?: { instanceId?: string };
    worldRevision?: number;
    persistentRevision?: number;
    buildingById?: Map<string, Record<string, any>>;
    activatePlacedBuildingTopologyAndVisual?(building: Record<string, any>): string[];
    markPersistenceDirtyDomainsHighPriority?(domains: string[]): void;
  } | null;
  refreshPlayerContextActions?(playerId: string): unknown;
  resolveBuildingDisplayName?(instance: unknown, building: Record<string, any>): string | null;
  resolveBuildingDisplayNameByRuntime?(runtime: unknown, building: Record<string, any>): string | null;
  queuePlayerNotice?(playerId: string, message: string, kind: string): void;
  worldRuntimeTickDispatchService?: {
    queuePlayerNotice?: unknown;
  };
};


import { computeCraftSkillExpGain, type TechniqueActivityNoticeMessage } from '@mud/shared';
import type { PipelineContext } from '../technique-activity-strategy';
import {
  DEFAULT_CRAFT_EXP_TO_NEXT,
  resolveCraftSkillExpToNextByLevel,
} from '../../craft-skill-exp.helpers';
import { applyPlayerCraftExpRate, resolvePlayerCraftEffectStat } from '../../craft-effect-runtime.helpers';

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
    return buildBuildingTickResult(true, [buildBuildingNotice('warn', 'notice.craft.building.target-missing')]);
  }

  if (building.state !== 'building') {
    releaseStaleBuildingActiveBuilder(instance, building, playerId);
    player.buildingJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    runtime.refreshPlayerContextActions?.(playerId);
    if (building.state === 'active' && resolveBuildingRemainingTicksForView(building) <= 0) {
      return buildBuildingTickResult(true, [buildBuildingCompletionNotice(runtime, building)]);
    }
    return buildBuildingTickResult(true, [buildBuildingNotice('warn', 'notice.craft.building.unavailable')]);
  }

  if (!isPlayerNearBuilding(player, building, 1)) {
    const sleepPayload = buildBuildingSleepPayload(job, building, '需要靠近半成品后才能继续建造。');
    player.buildingJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    runtime.refreshPlayerContextActions?.(playerId);
    return {
      ...buildBuildingTickResult(true, [buildBuildingNotice('warn', 'notice.craft.building.sleeping')]),
      sleepPayload,
    };
  }

  const progressPerTick = resolveBuildingProgressPerTick(player);
  const previousRemainingProgress = resolveBuildingRemainingProgress(building);
  const appliedProgress = Math.min(previousRemainingProgress, progressPerTick);
  const nextRemainingProgress = Math.max(0, Number((previousRemainingProgress - progressPerTick).toFixed(6)));
  const nextRemainingTicks = resolveBuildingRemainingTicksForView({ ...building, buildRemainingTicks: nextRemainingProgress }, progressPerTick);
  building.buildRemainingTicks = nextRemainingProgress;
  building.buildCompleteTick = nextRemainingProgress > 0 ? Number(instance.tick) + nextRemainingTicks : Number(instance.tick);
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
  instance.persistentRevision = Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)) + 1;
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);

  const gainedExp = applyBuildingConstructionProgress(playerRuntimeService, player, appliedProgress);
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
    runtime.refreshPlayerContextActions?.(playerId);
    return buildBuildingTickResult(
      true,
      [buildBuildingCompletionNotice(runtime, building)],
      false,
      skillChanged,
      gainedExp / 2,
    );
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
  const baseGain = computeCraftSkillExpGain({
    skillLevel: skill.level,
    targetLevel: skill.level,
    baseActionTicks: normalizeBuildStrength(buildStrength),
    getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(source, level),
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
  const gain = applyPlayerCraftExpRate(player, 'building', baseGain);
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
  const normalized = Number(value) || 1;
  return Math.max(1, normalized);
}

function isPlayerNearBuilding(player: Record<string, any>, building: Record<string, any>, range: number): boolean {
  if (!player || !building) {
    return false;
  }
  const dx = Math.abs(Math.floor(Number(player.x) || 0) - Math.floor(Number(building.x) || 0));
  const dy = Math.abs(Math.floor(Number(player.y) || 0) - Math.floor(Number(building.y) || 0));
  return Math.max(dx, dy) <= Math.max(0, Math.floor(Number(range) || 0));
}

function buildBuildingCompletionNotice(runtime: BuildingTickRuntimePort, building: Record<string, any>): TechniqueActivityNoticeMessage {
  const buildingName = runtime.resolveBuildingDisplayNameByRuntime?.(runtime, building) ?? building?.defId ?? '建筑';
  return buildBuildingNotice(
    'success',
    'notice.craft.building.completed',
    { buildingName },
    [{ key: 'buildingName', style: 'target' }],
  );
}

function buildBuildingNotice(
  kind: BuildingNoticeKind,
  key: string,
  vars?: Record<string, string | number>,
  pills?: Array<{ key: string; style: 'target' }>,
): TechniqueActivityNoticeMessage {
  return {
    kind,
    key,
    ...(vars ? { vars } : {}),
    ...(pills ? { pills } : {}),
  };
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

function resolveBuildingRemainingTicksForView(building: Record<string, any>, progressPerTick = 1): number {
  const progress = Math.max(Number.MIN_VALUE, Number(progressPerTick) || 1);
  if (Number.isFinite(Number(building?.buildRemainingTicks))) {
    return Math.max(0, Math.ceil(Number(building.buildRemainingTicks) / progress));
  }
  if (Number.isFinite(Number(building?.buildStrength))) {
    return Math.max(1, Math.ceil(Number(building.buildStrength) / progress));
  }
  return 0;
}

function resolveBuildingRemainingProgress(building: Record<string, any>): number {
  if (Number.isFinite(Number(building?.buildRemainingTicks))) {
    return Math.max(0, Number(building.buildRemainingTicks));
  }
  if (Number.isFinite(Number(building?.buildStrength))) {
    return Math.max(1, Number(building.buildStrength));
  }
  return 1;
}

function resolveBuildingProgressPerTick(player: Record<string, any>): number {
  const speedRate = Math.max(0, resolvePlayerCraftEffectStat(player, 'building', 'speedRate'));
  return 1 + speedRate;
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

type BuildingNoticeKind = TechniqueActivityNoticeMessage['kind'];

type BuildingNoticeMessage = TechniqueActivityNoticeMessage;

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
};

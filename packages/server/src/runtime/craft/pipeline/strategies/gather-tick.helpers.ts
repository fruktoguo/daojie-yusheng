import {
  applyCraftOutputRate,
  computeAdjustedCraftTicks,
  computeCraftSkillExpGain,
  resolveAlchemyGradeValue,
  type ItemStack,
  type TechniqueActivityNoticeMessage,
} from '@mud/shared';
import type { PipelineContext } from '../technique-activity-strategy';
import { resolveCraftSkillExpToNextByLevel } from '../../craft-skill-exp.helpers';
import { applyPlayerCraftExpRate, resolvePlayerCraftEffectStat } from '../../craft-effect-runtime.helpers';
import { reassignItemInstanceId } from '../../../world/item-instance-id.helpers';
import {
  buildContainerSourceId,
  groupContainerLootRows,
} from '../../../world/world-runtime.normalization.helpers';

const HERB_GATHER_TIME_RATE = 0.5;
const GATHER_SPEED_PER_LEVEL = 0.02;

export async function executeGatherTick(
  playerId: string,
  ctx: PipelineContext,
  serviceOverride?: GatherTickServicePort,
): Promise<GatherTickResult> {
  const service = serviceOverride ?? resolveGatherRuntimeService(ctx);
  const deps = ctx.deps as GatherTickDeps;
  const playerRuntimeService = service?.playerRuntimeService;
  const player = playerRuntimeService?.getPlayer?.(playerId);
  const job = player?.gatherJob;
  if (!service || !playerRuntimeService || !player || !job || Number(job.remainingTicks) <= 0) {
    return buildGatherTickResult();
  }

  const location = deps.getPlayerLocationOrThrow(playerId);
  const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
  const container = instance.getContainerById(job.resourceNodeId);
  if (!container || container.variant !== 'herb') {
    service.releaseGatherActiveSearch?.(playerId, player, job, deps);
    player.gatherJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    return buildGatherTickResult(false, [buildGatherNotice('warn', 'notice.craft.gather.target-missing')]);
  }

  const lootWindowTarget = playerRuntimeService.getLootWindowTarget?.(playerId);
  if (
    !lootWindowTarget
    || lootWindowTarget.tileX !== container.x
    || lootWindowTarget.tileY !== container.y
    || Math.max(Math.abs(player.x - container.x), Math.abs(player.y - container.y)) > 1
  ) {
    const state = service.ensureContainerState(location.instanceId, container, instance.tick);
    if (state.activeSearch) {
      state.activeSearch = undefined;
      service.markContainerPersistenceDirty(location.instanceId);
    }
    const sleepPayload = buildGatherSleepPayload(job, location.instanceId, container, '你已离开草药采集范围。');
    player.gatherJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    return buildGatherTickSleepResult(sleepPayload, [buildGatherNotice('warn', 'notice.craft.gather.left-range')]);
  }

  const state = service.ensureContainerState(location.instanceId, container, instance.tick);
  const activeSearchPlayerId = resolveActiveSearchPlayerId(state.activeSearch);
  if (activeSearchPlayerId && activeSearchPlayerId !== playerId) {
    const sleepPayload = buildGatherSleepPayload(job, location.instanceId, container, '采集目标正在由其他玩家采集。');
    player.gatherJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    return buildGatherTickSleepResult(sleepPayload, [buildGatherNotice('warn', 'notice.craft.gather.busy-sleeping')]);
  }

  if (state.activeSearch && !activeSearchPlayerId) {
    state.activeSearch.playerId = playerId;
    service.markContainerPersistenceDirty(location.instanceId);
  }
  if (!state.activeSearch) {
    const nextRow = groupContainerLootRows(state.entries)[0] ?? null;
    if (!nextRow) {
      player.gatherJob = null;
      markPlayerActiveJobDirty(playerRuntimeService, player);
      return buildGatherTickResult(false, [buildGatherNodeNotice('info', 'notice.craft.gather.depleted', container.name)]);
    }
    const totalTicks = computeEffectiveHerbGatherTicks(player, container, nextRow);
    state.activeSearch = {
      playerId,
      itemKey: nextRow.itemKey,
      totalTicks,
      remainingTicks: totalTicks,
    };
    job.totalTicks = totalTicks;
    job.remainingTicks = totalTicks;
    job.workTotalTicks = totalTicks;
    job.workRemainingTicks = totalTicks;
    job.interruptWaitRemainingTicks = 0;
    job.interruptState = null;
  }

  state.activeSearch.remainingTicks -= 1;
  job.remainingTicks = Math.max(0, state.activeSearch.remainingTicks);
  job.workRemainingTicks = job.remainingTicks;
  job.workTotalTicks = Math.max(1, Math.trunc(Number(job.workTotalTicks ?? job.totalTicks) || 1));
  service.markContainerPersistenceDirty(location.instanceId);
  if (state.activeSearch.remainingTicks > 0) {
    markPlayerActiveJobDirty(playerRuntimeService, player);
    return buildGatherTickResult();
  }

  const harvestedRow = groupContainerLootRows(state.entries)
    .find((entry) => entry.itemKey === state.activeSearch?.itemKey) ?? null;
  if (!harvestedRow) {
    state.activeSearch = undefined;
    player.gatherJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    return buildGatherTickResult(false, [buildGatherNodeNotice('warn', 'notice.craft.gather.empty', container.name)]);
  }

  const harvestedItem = removeSingleContainerRowItem(state.entries, harvestedRow);
  if (!harvestedItem) {
    state.activeSearch = undefined;
    player.gatherJob = null;
    markPlayerActiveJobDirty(playerRuntimeService, player);
    return buildGatherTickResult(false, [buildGatherNodeNotice('warn', 'notice.craft.gather.empty', container.name)]);
  }

  state.activeSearch = undefined;
  harvestedItem.count = applyCraftOutputRate(
    Math.max(1, Math.floor(Number(harvestedItem.count) || 1)),
    resolvePlayerCraftEffectStat(player, 'gather', 'outputRate'),
  );
  prepareLootGrantItemsForReceiver([harvestedItem]);
  playerRuntimeService.receiveInventoryItem?.(playerId, harvestedItem);
  const skillExpResult = applyGatherSkillExp(
    playerRuntimeService,
    player,
    player.gatherSkill,
    harvestedItem.level,
    computeHerbNativeGatherTicks(container, harvestedRow),
  );
  const skillChanged = skillExpResult.changed;
  const craftRealmChanged = grantCraftRealmProgress(playerRuntimeService, player, skillExpResult.gain / 2);
  deps.refreshQuestStates?.(playerId);

  const remainingCount = countContainerEntryItems(state.entries);
  if (remainingCount <= 0) {
    state.activeSearch = undefined;
    if (typeof state.refreshAtTick !== 'number') {
      state.refreshAtTick = resolveContainerRefreshAtTick(container, instance.tick);
    }
  }

  const nextRow = groupContainerLootRows(state.entries)[0] ?? null;
  if (nextRow) {
    const totalTicks = computeEffectiveHerbGatherTicks(player, container, nextRow);
    state.activeSearch = {
      playerId,
      itemKey: nextRow.itemKey,
      totalTicks,
      remainingTicks: totalTicks,
    };
    player.gatherJob = {
      ...job,
      startedAt: Date.now(),
      totalTicks,
      remainingTicks: totalTicks,
      workTotalTicks: totalTicks,
      workRemainingTicks: totalTicks,
      interruptWaitRemainingTicks: 0,
      interruptState: null,
      pausedTicks: 0,
      phase: 'gathering',
    };
  } else {
    player.gatherJob = null;
  }

  const dirtyDomains = ['inventory', 'active_job'];
  if (skillChanged) {
    dirtyDomains.push('profession');
  }
  playerRuntimeService.markPersistenceDirtyDomains?.(player, dirtyDomains);
  playerRuntimeService.bumpPersistentRevision?.(player);
  return buildGatherTickResult(
    false,
    [buildGatherNotice(
      'loot',
      'notice.craft.gather.obtained',
      { itemLabel: service.formatLootItemStackLabel(harvestedItem) },
      [{ key: 'itemLabel', style: 'target' }],
    )],
    true,
    false,
    Boolean(skillChanged || craftRealmChanged),
  );
}

function resolveGatherRuntimeService(ctx: PipelineContext): GatherTickServicePort | null {
  return (ctx.deps as { worldRuntimeLootContainerService?: GatherTickServicePort } | null | undefined)
    ?.worldRuntimeLootContainerService ?? null;
}

function markPlayerActiveJobDirty(playerRuntimeService: GatherPlayerRuntimeServicePort, player: Record<string, any>): void {
  playerRuntimeService.bumpPersistentRevision?.(player);
  playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
}

function normalizeHerbLevel(level: unknown): number {
  return Math.max(1, Math.floor(Number(level) || 1));
}

function computeHerbNativeGatherTicks(container: Record<string, any>, row: Record<string, any>): number {
  const item = row?.item ?? row;
  const grade = item?.grade ?? container?.grade;
  const level = normalizeHerbLevel(item?.level);
  const baseTicks = level + resolveAlchemyGradeValue(grade) - 1;
  return Math.max(1, Math.ceil(baseTicks * HERB_GATHER_TIME_RATE));
}

function computeEffectiveHerbGatherTicks(player: Record<string, any>, container: Record<string, any>, row: Record<string, any>): number {
  const nativeGatherTicks = computeHerbNativeGatherTicks(container, row);
  const gatherLevel = Math.max(1, Math.floor(Number(player?.gatherSkill?.level) || 1));
  const skillSpeedRate = gatherLevel * GATHER_SPEED_PER_LEVEL;
  const effectSpeedRate = Math.max(0, resolvePlayerCraftEffectStat(player, 'gather', 'speedRate'));
  return computeAdjustedCraftTicks(nativeGatherTicks, skillSpeedRate + effectSpeedRate);
}

function prepareLootGrantItemsForReceiver(items: Array<Record<string, any>>): void {
  for (const item of items) {
    reassignItemInstanceId(item as ItemStack);
  }
}

function applyGatherSkillExp(
  source: unknown,
  player: Record<string, any>,
  skill: { level: number; exp: number; expToNext: number } | null | undefined,
  targetLevel: unknown,
  baseActionTicks: number,
): { changed: boolean; gain: number } {
  if (!skill) {
    return { changed: false, gain: 0 };
  }
  const baseGain = computeCraftSkillExpGain({
    skillLevel: skill.level,
    targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
    baseActionTicks,
    getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(source, level),
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
  const gain = applyPlayerCraftExpRate(player, 'gather', baseGain);
  return {
    changed: applyCraftSkillExp(source, skill, gain),
    gain,
  };
}

function applyCraftSkillExp(
  source: unknown,
  skill: { level: number; exp: number; expToNext: number } | null | undefined,
  amount: number,
): boolean {
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

function grantCraftRealmProgress(playerRuntimeService: GatherPlayerRuntimeServicePort, player: Record<string, any>, amount: number): boolean {
  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return false;
  }
  const result = playerRuntimeService.playerProgressionService?.grantCraftRealmExp?.(player, normalized);
  if (!result) {
    return false;
  }
  playerRuntimeService.applyProgressionResult?.(player, result);
  return result.changed === true;
}

function resolveActiveSearchPlayerId(activeSearch: unknown): string {
  const playerId = typeof (activeSearch as { playerId?: unknown } | null)?.playerId === 'string'
    ? String((activeSearch as { playerId: string }).playerId).trim()
    : '';
  return playerId || '';
}

function buildGatherTickResult(
  panelChanged = false,
  messages: GatherNoticeMessage[] = [],
  inventoryChanged = false,
  equipmentChanged = false,
  attrChanged = false,
  groundDrops: unknown[] = [],
): GatherTickResult {
  return {
    ok: true,
    panelChanged,
    inventoryChanged,
    equipmentChanged,
    attrChanged,
    messages,
    groundDrops,
  };
}

function buildGatherTickSleepResult(sleepPayload: Record<string, unknown>, messages: GatherNoticeMessage[] = []): GatherTickResult {
  return {
    ...buildGatherTickResult(true, messages),
    sleepPayload,
  };
}

function buildGatherNodeNotice(kind: GatherNoticeKind, key: string, resourceNodeName: unknown): GatherNoticeMessage {
  const normalizedName = typeof resourceNodeName === 'string' && resourceNodeName.trim()
    ? resourceNodeName.trim()
    : '采集目标';
  return buildGatherNotice(
    kind,
    key,
    { resourceNodeName: normalizedName },
    [{ key: 'resourceNodeName', style: 'target' }],
  );
}

function buildGatherNotice(
  kind: GatherNoticeKind,
  key: string,
  vars?: Record<string, string | number>,
  pills?: Array<{ key: string; style: 'target' }>,
): GatherNoticeMessage {
  return {
    kind,
    key,
    ...(vars ? { vars } : {}),
    ...(pills ? { pills } : {}),
  };
}

function buildGatherSleepPayload(job: Record<string, any>, instanceId: string, container: Record<string, any>, reason: string): Record<string, unknown> {
  return {
    kind: 'gather',
    payload: {
      sourceId: typeof job?.sourceId === 'string' && job.sourceId.trim()
        ? job.sourceId.trim()
        : buildContainerSourceId(instanceId, container.id),
      resourceNodeId: container.id,
      instanceId,
    },
    label: job?.resourceNodeName ?? container.name ?? '采集',
    reason,
  };
}

function removeSingleContainerRowItem(entries: Array<Record<string, any>>, row: Record<string, any>): Record<string, any> | null {
  const target = row.entries.find((entry: Record<string, any>) => Math.max(0, Math.trunc(Number(entry?.item?.count) || 0)) > 0) ?? null;
  if (!target) {
    return null;
  }
  const harvestedItem = {
    ...target.item,
    count: 1,
  };
  target.item.count = Math.max(0, Math.trunc(Number(target.item.count) || 0)) - 1;
  if (target.item.count <= 0) {
    const index = entries.indexOf(target);
    if (index >= 0) {
      entries.splice(index, 1);
    }
  }
  return harvestedItem;
}

function countContainerEntryItems(entries: Array<Record<string, any>>): number {
  return entries.reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry?.item?.count) || 0)), 0);
}

function resolveContainerRefreshAtTick(container: Record<string, any>, currentTick: number): number | undefined {
  const fixedRefreshTicks = Number.isInteger(container.refreshTicks) && Number(container.refreshTicks) > 0
    ? Number(container.refreshTicks)
    : undefined;
  if (fixedRefreshTicks) {
    return currentTick + fixedRefreshTicks;
  }
  const refreshTicksMin = Number.isInteger(container.refreshTicksMin) && Number(container.refreshTicksMin) > 0
    ? Number(container.refreshTicksMin)
    : undefined;
  const refreshTicksMax = Number.isInteger(container.refreshTicksMax) && Number(container.refreshTicksMax) > 0
    ? Number(container.refreshTicksMax)
    : undefined;
  if (!refreshTicksMin && !refreshTicksMax) {
    return undefined;
  }
  const min = refreshTicksMin ?? refreshTicksMax ?? 1;
  const max = Math.max(min, refreshTicksMax ?? min);
  return currentTick + randomIntInclusive(min, max);
}

function randomIntInclusive(min: number, max: number): number {
  const normalizedMin = Math.max(1, Math.floor(Number(min) || 1));
  const normalizedMax = Math.max(normalizedMin, Math.floor(Number(max) || normalizedMin));
  return normalizedMin + Math.floor(Math.random() * ((normalizedMax - normalizedMin) + 1));
}

type GatherNoticeKind = TechniqueActivityNoticeMessage['kind'];

type GatherNoticeMessage = TechniqueActivityNoticeMessage;

type GatherTickResult = {
  ok: boolean;
  panelChanged: boolean;
  inventoryChanged: boolean;
  equipmentChanged: boolean;
  attrChanged: boolean;
  messages: GatherNoticeMessage[];
  groundDrops: unknown[];
  sleepPayload?: Record<string, unknown>;
};

type GatherTickDeps = {
  getPlayerLocationOrThrow(playerId: string): { instanceId: string };
  getInstanceRuntimeOrThrow(instanceId: string): {
    tick: number;
    getContainerById(containerId: string): Record<string, any> | null;
  };
  refreshQuestStates?(playerId: string): void;
};

type GatherPlayerRuntimeServicePort = {
  getPlayer?(playerId: string): Record<string, any> | null;
  getLootWindowTarget?(playerId: string): { tileX: number; tileY: number } | null;
  receiveInventoryItem?(playerId: string, item: Record<string, any>): void;
  markPersistenceDirtyDomains?(player: Record<string, any>, domains: string[]): void;
  bumpPersistentRevision?(player: Record<string, any>): void;
  playerProgressionService?: {
    grantCraftRealmExp?(player: Record<string, any>, amount: number): { changed?: boolean } | null;
  };
  applyProgressionResult?(player: Record<string, any>, result: unknown): void;
};

type GatherTickServicePort = {
  playerRuntimeService?: GatherPlayerRuntimeServicePort;
  ensureContainerState(instanceId: string, container: Record<string, any>, currentTick: number): {
    entries: Array<Record<string, any>>;
    activeSearch?: Record<string, any>;
    refreshAtTick?: number;
  };
  markContainerPersistenceDirty(instanceId: string): void;
  releaseGatherActiveSearch?(playerId: string, player: Record<string, any>, job: Record<string, any>, deps: unknown): void;
  formatLootItemStackLabel(item: Record<string, any>): string;
};

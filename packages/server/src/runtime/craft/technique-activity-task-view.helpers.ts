/**
 * 本文件属于服务端权威运行时，负责把分散的技艺 job/队列只读投影为统一任务视图。
 *
 * 维护时不能在这里执行资源扣除、结算或取消；所有写操作仍必须回到 runtime/pipeline。
 */
import type {
  RuntimeTechniqueActivityKind,
  TechniqueActivityCancelRef,
  TechniqueActivityQueueItem,
  TechniqueActivityTaskListView,
  TechniqueActivityTaskState,
  TechniqueActivityTaskView,
} from '@mud/shared';
import type { CraftQueueItemView } from '@mud/shared';

type LegacyTechniqueJob = {
  jobRunId?: string;
  jobType?: string;
  phase?: string;
  label?: string;
  recipeName?: string;
  outputItemId?: string;
  targetItemName?: string;
  resourceNodeName?: string;
  buildingName?: string;
  formationName?: string;
  miningNodeName?: string;
  techniqueId?: string;
  techniqueName?: string;
  status?: string;
  blockedReason?: string;
  totalTicks?: number;
  remainingTicks?: number;
  workTotalTicks?: number;
  workRemainingTicks?: number;
  progressGainPerTick?: number;
  estimatedRemainingTicks?: number;
  pausedTicks?: number;
  interruptWaitRemainingTicks?: number;
  interruptState?: { waitRemainingTicks?: number; [key: string]: unknown } | null;
  queuedJobs?: CraftQueueItemView[];
};

type TechniqueActivityTaskPlayerView = {
  playerId?: string;
  alchemyJob?: LegacyTechniqueJob | null;
  forgingJob?: LegacyTechniqueJob | null;
  enhancementJob?: LegacyTechniqueJob | null;
  gatherJob?: LegacyTechniqueJob | null;
  buildingJob?: LegacyTechniqueJob | null;
  formationJob?: LegacyTechniqueJob | null;
  miningJob?: LegacyTechniqueJob | null;
  transmissionJob?: LegacyTechniqueJob | null;
  techniqueActivityQueue?: TechniqueActivityQueueItem[];
};

const LEGACY_ACTIVE_JOB_SLOTS = [
  ['alchemy', 'alchemyJob'],
  ['forging', 'forgingJob'],
  ['enhancement', 'enhancementJob'],
  ['transmission', 'transmissionJob'],
  ['gather', 'gatherJob'],
  ['building', 'buildingJob'],
  ['formation', 'formationJob'],
  ['mining', 'miningJob'],
] as const satisfies readonly (readonly [RuntimeTechniqueActivityKind, keyof TechniqueActivityTaskPlayerView])[];

/** 构建统一技艺任务列表完整同步。 */
export function buildTechniqueActivityTaskListView(
  player: TechniqueActivityTaskPlayerView | null | undefined,
  serverTick?: number,
): TechniqueActivityTaskListView {
  const tasks: TechniqueActivityTaskView[] = [];
  if (!player || typeof player !== 'object') {
    return serverTick == null ? { tasks } : { tasks, serverTick };
  }

  for (const [kind, slot] of LEGACY_ACTIVE_JOB_SLOTS) {
    const job = player[slot];
    if (!isJobVisible(job, kind)) {
      continue;
    }
    tasks.push(buildActiveJobTaskView(player, kind, job));
  }

  for (const item of listLegacyCraftQueueItems(player)) {
    tasks.push(buildLegacyQueueTaskView(item));
  }

  const queue = Array.isArray(player.techniqueActivityQueue) ? player.techniqueActivityQueue : [];
  for (const item of queue) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    tasks.push(buildTechniqueQueueTaskView(item));
  }

  return serverTick == null ? { tasks } : { tasks, serverTick };
}

/** 构建统一技艺任务列表增量；迁移期先用全量 upsert 表达，后续再做签名差分。 */
export function buildTechniqueActivityTaskPatchView(
  player: TechniqueActivityTaskPlayerView | null | undefined,
  serverTick?: number,
): { upsert: TechniqueActivityTaskView[]; serverTick?: number } {
  const view = buildTechniqueActivityTaskListView(player, serverTick);
  return view.serverTick == null
    ? { upsert: view.tasks }
    : { upsert: view.tasks, serverTick: view.serverTick };
}

function buildActiveJobTaskView(
  player: TechniqueActivityTaskPlayerView,
  kind: RuntimeTechniqueActivityKind,
  job: LegacyTechniqueJob,
): TechniqueActivityTaskView {
  const jobRunId = normalizeText(job.jobRunId) || `active:${kind}:${normalizeText(player.playerId) || 'unknown'}`;
  const interruptWaitRemainingTicks = resolveInterruptWaitRemainingTicks(job);
  const task: TechniqueActivityTaskView = {
    id: `job:${kind}:${jobRunId}`,
    kind,
    label: resolveJobLabel(kind, job),
    state: resolveActiveJobState(job, interruptWaitRemainingTicks),
    workTotalTicks: resolveNonNegativeInteger(job.workTotalTicks ?? job.totalTicks),
    workRemainingTicks: resolveNonNegativeInteger(job.workRemainingTicks ?? job.remainingTicks),
    progressGainPerTick: resolvePositiveNumber(job.progressGainPerTick),
    estimatedRemainingTicks: resolveNonNegativeNumber(job.estimatedRemainingTicks),
    canCancel: true,
    cancelRef: { kind, jobRunId },
  };
  const targetLabel = resolveJobTargetLabel(kind, job);
  if (targetLabel) {
    task.targetLabel = targetLabel;
  }
  if (interruptWaitRemainingTicks > 0) {
    task.interruptWaitRemainingTicks = interruptWaitRemainingTicks;
  }
  if (task.state === 'blocked') {
    task.sleepReason = resolveTransmissionBlockedReason(job.blockedReason);
  }
  return task;
}

function buildLegacyQueueTaskView(item: CraftQueueItemView): TechniqueActivityTaskView {
  const kind = normalizeKind(item.kind);
  const queueId = normalizeText(item.queueId) || `legacy:${kind}:${normalizeText(item.label) || 'queued'}`;
  return {
    id: `queue:${kind}:${queueId}`,
    kind,
    label: normalizeText(item.label) || resolveKindLabel(kind),
    state: 'queued',
    canCancel: true,
    cancelRef: { kind, queueId },
  };
}

function buildTechniqueQueueTaskView(item: TechniqueActivityQueueItem): TechniqueActivityTaskView {
  const kind = normalizeKind(item.kind);
  const queueId = normalizeText(item.queueId) || `queue:${kind}:${normalizeText(item.label) || 'queued'}`;
  const cancelRef = normalizeCancelRef(item.cancelRef, kind, queueId);
  const task: TechniqueActivityTaskView = {
    id: `queue:${kind}:${queueId}`,
    kind,
    label: normalizeText(item.label) || resolveKindLabel(kind),
    state: item.state === 'sleeping' ? 'sleeping' : 'queued',
    canCancel: true,
    cancelRef,
  };
  const targetLabel = normalizeText(item.targetLabel);
  if (targetLabel) {
    task.targetLabel = targetLabel;
  }
  const sleepReason = normalizeText(item.sleepReason);
  if (sleepReason) {
    task.sleepReason = sleepReason;
  }
  return task;
}

function listLegacyCraftQueueItems(player: TechniqueActivityTaskPlayerView): CraftQueueItemView[] {
  const holders = [player.alchemyJob, player.forgingJob, player.enhancementJob];
  const items: CraftQueueItemView[] = [];
  for (const holder of holders) {
    if (!Array.isArray(holder?.queuedJobs)) {
      continue;
    }
    for (const item of holder.queuedJobs) {
      if (item && typeof item === 'object') {
        items.push(item);
      }
    }
  }
  return items;
}

function isJobVisible(
  job: LegacyTechniqueJob | null | undefined,
  kind: RuntimeTechniqueActivityKind,
): job is LegacyTechniqueJob {
  if (!job || typeof job !== 'object') {
    return false;
  }
  if (kind === 'alchemy' && job.jobType === 'forging') {
    return false;
  }
  if (kind === 'forging' && job.jobType && job.jobType !== 'forging') {
    return false;
  }
  const remaining = resolveNonNegativeInteger(job.workRemainingTicks ?? job.remainingTicks);
  const total = resolveNonNegativeInteger(job.workTotalTicks ?? job.totalTicks);
  const interruptWait = resolveInterruptWaitRemainingTicks(job);
  return total > 0 || remaining > 0 || interruptWait > 0;
}

function resolveActiveJobState(
  job: LegacyTechniqueJob,
  interruptWaitRemainingTicks: number,
): TechniqueActivityTaskState {
  if (interruptWaitRemainingTicks > 0 || job.phase === 'paused') {
    return 'interrupt_wait';
  }
  if (job.status === 'blocked') {
    return 'blocked';
  }
  if (job.phase === 'completing') {
    return 'completing';
  }
  return 'running';
}

function resolveInterruptWaitRemainingTicks(job: LegacyTechniqueJob): number {
  return resolveNonNegativeInteger(
    job.interruptWaitRemainingTicks
      ?? job.interruptState?.waitRemainingTicks
      ?? job.pausedTicks,
  );
}

function resolveJobLabel(kind: RuntimeTechniqueActivityKind, job: LegacyTechniqueJob): string {
  if (kind === 'transmission') {
    return normalizeText(job.label) || resolveKindLabel(kind);
  }
  return normalizeText(job.label)
    || normalizeText(job.recipeName)
    || normalizeText(job.outputItemId)
    || resolveJobTargetLabel(kind, job)
    || resolveKindLabel(kind);
}

function resolveJobTargetLabel(kind: RuntimeTechniqueActivityKind, job: LegacyTechniqueJob): string | undefined {
  if (kind === 'enhancement') {
    return normalizeText(job.targetItemName);
  }
  if (kind === 'gather') {
    return normalizeText(job.resourceNodeName);
  }
  if (kind === 'building') {
    return normalizeText(job.buildingName);
  }
  if (kind === 'formation') {
    return normalizeText(job.formationName);
  }
  if (kind === 'mining') {
    return normalizeText(job.miningNodeName);
  }
  if (kind === 'transmission') {
    return normalizeText(job.techniqueName) || normalizeText(job.techniqueId);
  }
  return normalizeText(job.outputItemId);
}

function normalizeCancelRef(
  cancelRef: TechniqueActivityCancelRef | undefined,
  kind: RuntimeTechniqueActivityKind,
  queueId: string,
): TechniqueActivityCancelRef {
  return cancelRef && typeof cancelRef === 'object'
    ? {
        kind: normalizeKind(cancelRef.kind),
        ...(normalizeText(cancelRef.jobRunId) ? { jobRunId: normalizeText(cancelRef.jobRunId) } : {}),
        ...(normalizeText(cancelRef.queueId) ? { queueId: normalizeText(cancelRef.queueId) } : { queueId }),
        ...(normalizeText(cancelRef.techId) ? { techId: normalizeText(cancelRef.techId) } : {}),
      }
    : { kind, queueId };
}

function normalizeKind(kind: unknown): RuntimeTechniqueActivityKind {
  return kind === 'forging'
    || kind === 'enhancement'
    || kind === 'transmission'
    || kind === 'gather'
    || kind === 'building'
    || kind === 'mining'
    || kind === 'formation'
    ? kind
    : 'alchemy';
}

function resolveKindLabel(kind: RuntimeTechniqueActivityKind): string {
  switch (kind) {
    case 'alchemy':
      return '炼丹任务';
    case 'forging':
      return '炼器任务';
    case 'enhancement':
      return '强化任务';
    case 'transmission':
      return '传法';
    case 'gather':
      return '采集任务';
    case 'building':
      return '营造任务';
    case 'mining':
      return '挖矿任务';
    case 'formation':
      return '阵法任务';
  }
}

function resolveTransmissionBlockedReason(reason: unknown): string {
  if (reason === 'teacher_out_of_range') {
    return '传授者不在 2 格范围内';
  }
  if (reason === 'not_created_technique') {
    return '只能传授自创功法';
  }
  return '等待传授条件恢复';
}

function resolveNonNegativeInteger(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numeric));
}

function resolvePositiveNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function resolveNonNegativeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

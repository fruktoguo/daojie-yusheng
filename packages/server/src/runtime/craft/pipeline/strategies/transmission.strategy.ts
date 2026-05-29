/**
 * 本文件属于服务端权威运行时，负责传法技艺 job 的启动、推进、取消和完成。
 *
 * 传法是学习者身上的正式通用技艺 job；传授者只作为距离、功法掌握与传法技能加成的条件来源。
 */
import {
  calculateTechniqueComprehensionProgressBreakdown,
  calculateTechniqueComprehensionRequiredProgress,
  computeCraftSkillExpGain,
  getTechniqueMaxLevel,
  isCreatedTechniqueId,
  type PlayerTransmissionJob,
  type TechniqueActivityNoticeMessage,
  type TechniqueActivityResolveResult,
  type TechniqueActivityRefundResult,
  type TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { advanceTechniqueActivityPause } from '../../technique-activity-runtime.helpers';

type TransmissionValidatedPayload = {
  mode?: 'transmission' | 'scripture_recording';
  learnerPlayerId: string;
  teacherPlayerId: string;
  techniqueId: string;
  techniqueName: string;
  requiredProgress: number;
  realmLv: number;
  grade?: PlayerTransmissionJob['grade'];
  category?: PlayerTransmissionJob['category'];
  teacherName?: string;
  buildingId?: string;
};

type TransmissionDepsPort = {
  getInstanceRuntime?(instanceId: string): any | null;
  refreshPlayerContextActions?(playerId: string): unknown;
  playerRuntimeService?: {
    getPlayer?(playerId: string): any | null;
    getPlayerOrThrow?(playerId: string): any;
    markPersistenceDirtyDomains?(player: any, domains: string[]): void;
    bumpPersistentRevision?(player: any): void;
    playerAttributesService?: { recalculate?(player: any): boolean };
    playerProgressionService?: { refreshPreview?(player: any): void };
    rebuildActionState?(player: any, tick: number): void;
    queuePlayerStructuredNotice?(player: any, notice: TechniqueActivityNoticeMessage & { text?: string }): void;
  };
};

export class TransmissionStrategy implements TechniqueActivityStrategy<PlayerTransmissionJob, TransmissionValidatedPayload> {
  readonly kind = 'transmission' as const;
  readonly jobSlot = 'transmissionJob';
  readonly skillSlot = 'transmissionSkill';
  readonly activityLabel = '传法';
  readonly pauseTicks = 10;
  readonly conditional = false;

  getActiveJob(player: unknown): PlayerTransmissionJob | null {
    return (player as { transmissionJob?: PlayerTransmissionJob | null }).transmissionJob ?? null;
  }

  setActiveJob(player: unknown, job: PlayerTransmissionJob | null): void {
    (player as { transmissionJob?: PlayerTransmissionJob | null }).transmissionJob = job;
  }

  validateStart(player: unknown, payload: unknown, ctx: PipelineContext): TechniqueActivityStartValidationResult<TransmissionValidatedPayload> {
    const deps = resolveTransmissionDeps(ctx);
    const runtime = deps?.playerRuntimeService;
    const learner = resolveLearner(player, payload, runtime);
    const mode = normalizeText((payload as { mode?: unknown } | null)?.mode) === 'scripture_recording'
      || normalizeText((payload as { jobType?: unknown } | null)?.jobType) === 'scripture_recording'
      ? 'scripture_recording'
      : 'transmission';
    const teacherPlayerId = normalizeText((payload as { teacherPlayerId?: unknown } | null)?.teacherPlayerId);
    const techniqueId = normalizeText((payload as { techniqueId?: unknown; techId?: unknown } | null)?.techniqueId)
      || normalizeText((payload as { techId?: unknown } | null)?.techId);
    if (!learner?.playerId) {
      return { ok: false, error: '学习者不存在。' };
    }
    if (!techniqueId) {
      return { ok: false, error: '功法不能为空。' };
    }
    if (hasAnyActiveTechniqueJob(learner)) {
      return { ok: false, error: '学习者已有进行中的技艺任务。' };
    }
    if (mode === 'scripture_recording') {
      return validateScriptureRecordingStart(learner, techniqueId, payload, ctx);
    }
    if (!teacherPlayerId) {
      return { ok: false, error: '传授者不能为空。' };
    }
    const teacher = runtime?.getPlayer?.(teacherPlayerId) ?? null;
    if (!teacher) {
      return { ok: false, error: '传授者不存在。' };
    }
    const teacherTechnique = teacher.techniques?.techniques?.find((entry: any) => entry?.techId === techniqueId);
    if (!teacherTechnique) {
      return { ok: false, error: '传授者尚未掌握该功法。' };
    }
    if (!isCreatedTechniqueId(techniqueId)) {
      return { ok: false, error: '只能传授自创功法。' };
    }
    if (learner.techniques?.techniques?.some((entry: any) => entry?.techId === techniqueId)) {
      return { ok: false, error: '学习者已经掌握该功法。' };
    }
    if (!isPlayerInTransmissionRange(teacher, learner, 2)) {
      return { ok: false, error: '传授距离超过 2 格。' };
    }
    const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
      sourceKind: 'created',
      techniqueRealmLv: teacherTechnique.realmLv,
      grade: teacherTechnique.grade,
      learnerRealmLv: learner.realm?.realmLv ?? 1,
      learnerTransmissionLevel: learner.transmissionSkill?.level ?? 1,
      teacherTransmissionLevel: teacher.transmissionSkill?.level ?? 1,
    });
    return {
      ok: true,
      validated: {
        learnerPlayerId: learner.playerId,
        teacherPlayerId,
        techniqueId,
        techniqueName: teacherTechnique.name ?? techniqueId,
        requiredProgress,
        realmLv: Math.max(1, Math.floor(Number(teacherTechnique.realmLv) || 1)),
        grade: teacherTechnique.grade ?? undefined,
        category: teacherTechnique.category ?? undefined,
        teacherName: teacher.displayName ?? teacher.name ?? teacherPlayerId,
      },
    };
  }

  consumeResources(): void {}

  createJob(player: unknown, validated: TransmissionValidatedPayload, ctx: PipelineContext): PlayerTransmissionJob {
    if (validated.mode === 'scripture_recording') {
      return createScriptureRecordingJob(player as any, validated, ctx);
    }
    const learner = player as any;
    const pending = ensurePendingComprehension(learner, validated);
    const progress = Math.max(0, Number(pending.progress) || 0);
    const required = Math.max(1, Number(validated.requiredProgress) || 1);
    pending.requiredProgress = required;
    pending.updatedAtTick = resolvePlayerRuntimeTick(learner);
    pending.selfComprehensionAllowed = false;
    delete pending.activeTransferJob;
    markTransmissionDirty(learner, ctx, ['technique', 'active_job']);
    queueTeacherTransmissionStartNotice(validated, ctx);
    const remaining = Math.max(1, Math.ceil(required - Math.min(required, progress)));
    const deps = resolveTransmissionDeps(ctx);
    const teacher = deps?.playerRuntimeService?.getPlayer?.(validated.teacherPlayerId) ?? null;
    const progressBreakdown = resolveTransmissionProgressBreakdown(learner, teacher, validated.realmLv);
    return {
      jobRunId: `transmission:${validated.learnerPlayerId}:${validated.techniqueId}:${resolvePlayerRuntimeTick(learner)}`,
      jobType: 'transmission',
      jobVersion: 1,
      techniqueId: validated.techniqueId,
      techniqueName: validated.techniqueName,
      teacherPlayerId: validated.teacherPlayerId,
      teacherName: validated.teacherName,
      range: 2,
      realmLv: validated.realmLv,
      grade: validated.grade,
      category: validated.category,
      status: 'running',
      phase: 'transmitting',
      startedAt: Date.now(),
      totalTicks: required,
      remainingTicks: remaining,
      workTotalTicks: required,
      workRemainingTicks: remaining,
      ...(progressBreakdown.progressGain > 0
        ? {
          progressGainPerTick: progressBreakdown.progressGain,
          estimatedRemainingTicks: Math.max(1, Math.ceil(remaining / progressBreakdown.progressGain)),
          progressBreakdown,
        }
        : {}),
      pausedTicks: 0,
      interruptWaitRemainingTicks: 0,
      interruptState: null,
      successRate: 1,
      spiritStoneCost: 0,
    };
  }

  buildStartMessages(_player: unknown, _validated: TransmissionValidatedPayload, job: PlayerTransmissionJob): TechniqueActivityNoticeMessage[] {
    if (job.jobType === 'scripture_recording') {
      return [{
        kind: 'info',
        key: 'notice.craft.scripture-recording.start',
        vars: { techniqueName: job.techniqueName },
        pills: [{ key: 'techniqueName', style: 'skill' }],
      }];
    }
    return [{
      kind: 'info',
      key: 'notice.craft.transmission.start',
      vars: { techniqueName: job.techniqueName },
      pills: [{ key: 'techniqueName', style: 'skill' }],
    }];
  }

  startDirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'technique'];
  }

  executeTick(player: unknown, ctx: PipelineContext): unknown {
    const learner = player as any;
    const job = this.getActiveJob(learner);
    if (!job || Number(job.remainingTicks) <= 0) {
      return emptyTransmissionTickResult();
    }
    if (job.jobType === 'scripture_recording') {
      return executeScriptureRecordingTick(learner, job, ctx);
    }
    if (job.phase === 'paused') {
      const resumed = advanceTechniqueActivityPause(job, 'transmitting');
      markTransmissionDirty(learner, ctx, ['active_job']);
      return { ...emptyTransmissionTickResult(), panelChanged: resumed.resumed };
    }
    const pending = findPendingComprehension(learner, job.techniqueId);
    if (!pending) {
      this.setActiveJob(learner, null);
      markTransmissionDirty(learner, ctx, ['active_job']);
      return { ...emptyTransmissionTickResult(), panelChanged: true };
    }
    delete pending.activeTransferJob;
    if (!isCreatedTechniqueId(job.techniqueId)) {
      return blockTransmission(learner, job, pending, 'not_created_technique', ctx);
    }
    const deps = resolveTransmissionDeps(ctx);
    const teacher = deps?.playerRuntimeService?.getPlayer?.(job.teacherPlayerId) ?? null;
    const teacherTechnique = teacher?.techniques?.techniques?.find((entry: any) => entry?.techId === job.techniqueId) ?? null;
    if (!teacher || !teacherTechnique || !isPlayerInTransmissionRange(teacher, learner, job.range)) {
      return blockTransmission(learner, job, pending, 'teacher_out_of_range', ctx);
    }
    if (job.status !== 'running' || job.blockedReason !== undefined) {
      job.status = 'running';
      delete job.blockedReason;
    }
    refreshPendingRequirement(learner, pending, teacherTechnique, teacher, job);
    const previousProgress = Math.max(0, Number(pending.progress) || 0);
    const requiredProgress = Math.max(1, Number(pending.requiredProgress) || 1);
    const progressBreakdown = resolveTransmissionProgressBreakdown(learner, teacher, pending.realmLv ?? teacherTechnique.realmLv);
    const progressGain = progressBreakdown.progressGain;
    pending.progress = Math.min(requiredProgress, previousProgress + progressGain);
    pending.updatedAtTick = resolvePlayerRuntimeTick(learner);
    updateJobProgress(job, requiredProgress, pending.progress, progressBreakdown);
    const learnerProfessionChanged = applyTransmissionSkillExpFromTicks(
      learner,
      1,
      pending.realmLv,
      ctx.resolveExpToNextByLevel,
    );
    const teacherProfessionChanged = applyTransmissionSkillExpFromTicks(
      teacher,
      1,
      pending.realmLv,
      ctx.resolveExpToNextByLevel,
    );
    if (teacherProfessionChanged) {
      markTransmissionDirty(teacher, ctx, ['profession']);
    }
    if (pending.progress < requiredProgress) {
      learner.techniques.revision += 1;
      markTransmissionDirty(learner, ctx, ['active_job', 'technique', ...(learnerProfessionChanged ? ['profession'] : [])]);
      return { ...emptyTransmissionTickResult(), panelChanged: true, attrChanged: learnerProfessionChanged };
    }
    completeTransmission(learner, pending, job, ctx, learnerProfessionChanged);
    this.setActiveJob(learner, null);
    return {
      ...emptyTransmissionTickResult(),
      panelChanged: true,
      attrChanged: true,
      messages: [{
        kind: 'success',
        key: 'notice.progression.technique-comprehension-complete',
        vars: { techName: pending.name ?? pending.techId },
        pills: [{ key: 'techName', style: 'skill' }],
      }],
    };
  }

  resolveResumePhase(): string {
    return 'transmitting';
  }

  isResolvePoint(job: PlayerTransmissionJob): boolean {
    return Number(job.remainingTicks) <= 0;
  }

  resolve(): TechniqueActivityResolveResult {
    return {
      successCount: 0,
      failureCount: 0,
      outputs: [],
      expParams: { skillLevel: 1, targetLevel: 1, baseActionTicks: 0, getExpToNextByLevel: () => 0 },
      completed: false,
      messages: [],
    };
  }

  computeRefund(player: unknown, job: PlayerTransmissionJob, ctx: PipelineContext): TechniqueActivityRefundResult {
    if (job.jobType === 'scripture_recording') {
      const { instance, building } = resolveScriptureBuilding(ctx, player as any, job.buildingId);
      if (building && normalizeText(building.scriptureRecordingJobRunId) === normalizeText(job.jobRunId)) {
        building.scriptureRecordingJobRunId = null;
        markScriptureBuildingDirty(instance, building);
        resolveTransmissionDeps(ctx)?.refreshPlayerContextActions?.((player as any)?.playerId);
      }
      return {
        items: [],
        spiritStones: 0,
        messages: [{
          kind: 'system',
          key: 'notice.craft.scripture-recording.cancelled',
          vars: { techniqueName: job.techniqueName },
          pills: [{ key: 'techniqueName', style: 'skill' }],
        }],
      };
    }
    return {
      items: [],
      spiritStones: 0,
      messages: [{
        kind: 'system',
        key: 'notice.craft.transmission.cancelled',
        vars: { techniqueName: job.techniqueName },
        pills: [{ key: 'techniqueName', style: 'skill' }],
      }],
    };
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'technique', 'profession'];
  }
}

function resolveTransmissionDeps(ctx: PipelineContext): TransmissionDepsPort | null {
  return ctx.deps as TransmissionDepsPort | null;
}

function resolveLearner(player: unknown, payload: unknown, runtime: TransmissionDepsPort['playerRuntimeService']): any | null {
  const payloadLearnerId = normalizeText((payload as { learnerPlayerId?: unknown } | null)?.learnerPlayerId);
  if (payloadLearnerId && typeof runtime?.getPlayer === 'function') {
    return runtime.getPlayer(payloadLearnerId);
  }
  return player && typeof player === 'object' ? player : null;
}

function validateScriptureRecordingStart(
  recorder: any,
  techniqueId: string,
  payload: unknown,
  ctx: PipelineContext,
): TechniqueActivityStartValidationResult<TransmissionValidatedPayload> {
  const buildingId = normalizeText((payload as { buildingId?: unknown } | null)?.buildingId);
  if (!buildingId) {
    return { ok: false, error: '藏经台不能为空。' };
  }
  const { instance, building } = resolveScriptureBuilding(ctx, recorder, buildingId);
  if (!instance || !building || building.defId !== 'scripture_platform') {
    return { ok: false, error: '藏经台不存在。' };
  }
  if (building.state !== 'active') {
    return { ok: false, error: '藏经台尚未完工。' };
  }
  if (!canPlayerUseScriptureBuilding(recorder, building)) {
    return { ok: false, error: '没有该藏经台的录入权限。' };
  }
  if (!isPlayerNearBuilding(recorder, building, 1)) {
    return { ok: false, error: '不在藏经台 1 格范围内。' };
  }
  const existingTechniqueId = normalizeText(building.scriptureTechniqueId);
  if (existingTechniqueId && existingTechniqueId !== techniqueId) {
    return { ok: false, error: '藏经台已有藏书，不能修改。' };
  }
  if (existingTechniqueId && Number(building.scriptureRecordedAtTick) > 0) {
    return { ok: false, error: '藏经台已有藏书，不能修改。' };
  }
  const technique = findPlayerTechnique(recorder, techniqueId);
  if (!technique) {
    return { ok: false, error: '尚未掌握该功法。' };
  }
  if (!isCreatedTechniqueId(techniqueId)) {
    return { ok: false, error: '只能录入自创功法。' };
  }
  if (!isTechniqueEntryMaxed(technique)) {
    return { ok: false, error: '只有练满的功法可以录入藏经台。' };
  }
  const requiredProgress = Math.max(
    1,
    Number(existingTechniqueId === techniqueId ? building.scriptureRequiredProgress : 0) || calculateTechniqueComprehensionRequiredProgress({
      sourceKind: 'created',
      techniqueRealmLv: technique.realmLv,
      grade: technique.grade,
      learnerRealmLv: recorder.realm?.realmLv ?? 1,
      learnerTransmissionLevel: recorder.transmissionSkill?.level ?? 1,
    }),
  );
  return {
    ok: true,
    validated: {
      mode: 'scripture_recording',
      learnerPlayerId: recorder.playerId,
      teacherPlayerId: recorder.playerId,
      techniqueId,
      techniqueName: technique.name ?? techniqueId,
      requiredProgress,
      realmLv: Math.max(1, Math.floor(Number(technique.realmLv) || 1)),
      grade: technique.grade ?? undefined,
      category: technique.category ?? undefined,
      teacherName: recorder.displayName ?? recorder.name ?? recorder.playerId,
      buildingId,
    },
  };
}

function createScriptureRecordingJob(recorder: any, validated: TransmissionValidatedPayload, ctx: PipelineContext): PlayerTransmissionJob {
  const { instance, building } = resolveScriptureBuilding(ctx, recorder, validated.buildingId);
  const required = Math.max(1, Number(validated.requiredProgress) || 1);
  const currentTick = resolvePlayerRuntimeTick(recorder);
  const progress = Math.max(0, Math.min(required, Number(building?.scriptureProgress) || 0));
  const jobRunId = `scripture_recording:${validated.buildingId}:${validated.techniqueId}:${currentTick}`;
  if (building) {
    building.scriptureTechniqueId = validated.techniqueId;
    building.scriptureTechniqueName = validated.techniqueName;
    building.scriptureProgress = progress;
    building.scriptureRequiredProgress = required;
    building.scriptureRealmLv = validated.realmLv;
    building.scriptureGrade = validated.grade;
    building.scriptureCategory = validated.category;
    building.scriptureRecorderPlayerId = recorder.playerId;
    building.scriptureRecordingJobRunId = jobRunId;
    building.scriptureUpdatedAtTick = currentTick;
    markScriptureBuildingDirty(instance, building);
  }
  const remaining = Math.max(0, required - progress);
  const progressBreakdown = resolveScriptureRecordingProgressBreakdown(recorder, validated.realmLv);
  return {
    jobRunId,
    jobType: 'scripture_recording',
    jobVersion: 1,
    label: '藏经录入',
    techniqueId: validated.techniqueId,
    techniqueName: validated.techniqueName,
    teacherPlayerId: recorder.playerId,
    teacherName: validated.teacherName,
    range: 1,
    realmLv: validated.realmLv,
    grade: validated.grade,
    category: validated.category,
    buildingId: validated.buildingId,
    status: 'running',
    phase: 'transmitting',
    startedAt: Date.now(),
    totalTicks: required,
    remainingTicks: remaining > 0 ? Math.max(1, Math.ceil(remaining)) : 0,
    workTotalTicks: required,
    workRemainingTicks: remaining,
    ...(progressBreakdown.progressGain > 0
      ? {
        progressGainPerTick: progressBreakdown.progressGain,
        estimatedRemainingTicks: remaining > 0 ? Math.max(1, Math.ceil(remaining / progressBreakdown.progressGain)) : 0,
        progressBreakdown,
      }
      : {}),
    pausedTicks: 0,
    interruptWaitRemainingTicks: 0,
    interruptState: null,
    successRate: 1,
    spiritStoneCost: 0,
  };
}

function ensurePendingComprehension(learner: any, validated: TransmissionValidatedPayload): any {
  const pendingList = Array.isArray(learner.pendingTechniqueComprehensions)
    ? learner.pendingTechniqueComprehensions
    : [];
  let pending = pendingList.find((entry: any) => entry?.techId === validated.techniqueId);
  if (!pending) {
    pending = {
      techId: validated.techniqueId,
      name: validated.techniqueName,
      sourceKind: 'created',
      selfComprehensionAllowed: false,
      progress: 0,
      requiredProgress: validated.requiredProgress,
      realmLv: validated.realmLv,
      grade: validated.grade,
      category: validated.category,
      createdAtTick: resolvePlayerRuntimeTick(learner),
      updatedAtTick: resolvePlayerRuntimeTick(learner),
    };
    pendingList.push(pending);
  } else {
    pending.name = validated.techniqueName;
    pending.sourceKind = 'created';
    pending.selfComprehensionAllowed = false;
    pending.requiredProgress = validated.requiredProgress;
    pending.realmLv = validated.realmLv;
    pending.grade = validated.grade;
    pending.category = validated.category;
  }
  learner.pendingTechniqueComprehensions = pendingList;
  return pending;
}

function findPendingComprehension(learner: any, techniqueId: string): any | null {
  return (learner.pendingTechniqueComprehensions ?? []).find((entry: any) => entry?.techId === techniqueId) ?? null;
}

function refreshPendingRequirement(learner: any, pending: any, teacherTechnique: any, teacher: any, job: PlayerTransmissionJob): void {
  const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: teacherTechnique.realmLv,
    grade: teacherTechnique.grade,
    learnerRealmLv: learner.realm?.realmLv ?? 1,
    learnerTransmissionLevel: learner.transmissionSkill?.level ?? 1,
    teacherTransmissionLevel: teacher.transmissionSkill?.level ?? 1,
  });
  pending.requiredProgress = requiredProgress;
  pending.realmLv = Math.max(1, Math.floor(Number(teacherTechnique.realmLv) || 1));
  pending.grade = teacherTechnique.grade ?? pending.grade;
  pending.category = teacherTechnique.category ?? pending.category;
  pending.name = teacherTechnique.name ?? pending.name ?? pending.techId;
  job.techniqueName = pending.name;
  job.realmLv = pending.realmLv;
  job.grade = pending.grade;
  job.category = pending.category;
  job.teacherName = teacher.displayName ?? teacher.name ?? job.teacherPlayerId;
}

function queueTeacherTransmissionStartNotice(validated: TransmissionValidatedPayload, ctx: PipelineContext): void {
  const deps = resolveTransmissionDeps(ctx);
  const runtime = deps?.playerRuntimeService;
  const teacher = runtime?.getPlayer?.(validated.teacherPlayerId) ?? null;
  if (!teacher || typeof runtime?.queuePlayerStructuredNotice !== 'function') {
    return;
  }
  runtime.queuePlayerStructuredNotice(teacher, {
    kind: 'info',
    text: 'notice.craft.transmission.teacher-start',
    structured: {
      key: 'notice.craft.transmission.teacher-start',
      vars: {
        learnerName: resolvePlayerDisplayName(runtime.getPlayer?.(validated.learnerPlayerId) ?? null, validated.learnerPlayerId),
        techniqueName: validated.techniqueName,
      },
      pills: [
        { key: 'learnerName', style: 'target' },
        { key: 'techniqueName', style: 'skill' },
      ],
    },
  });
}

function resolvePlayerDisplayName(player: any, fallbackPlayerId: string): string {
  return normalizeText(player?.displayName) || normalizeText(player?.name) || fallbackPlayerId;
}

function blockTransmission(
  learner: any,
  job: PlayerTransmissionJob,
  pending: any,
  reason: PlayerTransmissionJob['blockedReason'],
  ctx: PipelineContext,
): unknown {
  let changed = false;
  if (job.status !== 'blocked' || job.blockedReason !== reason) {
    job.status = 'blocked';
    job.blockedReason = reason;
    changed = true;
  }
  pending.updatedAtTick = resolvePlayerRuntimeTick(learner);
  if (changed) {
    learner.techniques.revision += 1;
    markTransmissionDirty(learner, ctx, ['active_job', 'technique']);
  }
  return { ...emptyTransmissionTickResult(), panelChanged: changed };
}

function executeScriptureRecordingTick(recorder: any, job: PlayerTransmissionJob, ctx: PipelineContext): unknown {
  if (job.phase === 'paused') {
    const resumed = advanceTechniqueActivityPause(job, 'transmitting');
    markTransmissionDirty(recorder, ctx, ['active_job']);
    return { ...emptyTransmissionTickResult(), panelChanged: resumed.resumed };
  }
  const { instance, building } = resolveScriptureBuilding(ctx, recorder, job.buildingId);
  if (!instance || !building || building.defId !== 'scripture_platform' || building.state !== 'active') {
    return blockScriptureRecording(recorder, job, 'scripture_platform_unavailable', ctx);
  }
  if (!isPlayerNearBuilding(recorder, building, 1)) {
    return blockScriptureRecording(recorder, job, 'scripture_platform_out_of_range', ctx);
  }
  const currentTechniqueId = normalizeText(building.scriptureTechniqueId);
  if (currentTechniqueId && currentTechniqueId !== job.techniqueId) {
    return blockScriptureRecording(recorder, job, 'scripture_recording_locked', ctx);
  }
  if (Number(building.scriptureRecordedAtTick) > 0) {
    return blockScriptureRecording(recorder, job, 'scripture_recording_locked', ctx);
  }
  const technique = findPlayerTechnique(recorder, job.techniqueId);
  if (!technique || !isTechniqueEntryMaxed(technique)) {
    return blockScriptureRecording(recorder, job, 'scripture_platform_unavailable', ctx);
  }
  if (job.status !== 'running' || job.blockedReason !== undefined) {
    job.status = 'running';
    delete job.blockedReason;
  }
  const currentTick = resolvePlayerRuntimeTick(recorder);
  const requiredProgress = Math.max(1, Number(building.scriptureRequiredProgress ?? job.workTotalTicks ?? job.totalTicks) || 1);
  const previousProgress = Math.max(0, Math.min(requiredProgress, Number(building.scriptureProgress) || 0));
  const progressBreakdown = resolveScriptureRecordingProgressBreakdown(recorder, building.scriptureRealmLv ?? job.realmLv);
  const nextProgress = Math.min(requiredProgress, previousProgress + progressBreakdown.progressGain);
  building.scriptureTechniqueId = job.techniqueId;
  building.scriptureTechniqueName = job.techniqueName;
  building.scriptureProgress = nextProgress;
  building.scriptureRequiredProgress = requiredProgress;
  building.scriptureRealmLv = Math.max(1, Math.floor(Number(technique.realmLv ?? job.realmLv) || 1));
  building.scriptureGrade = technique.grade ?? job.grade;
  building.scriptureCategory = technique.category ?? job.category;
  building.scriptureRecorderPlayerId = recorder.playerId;
  building.scriptureRecordingJobRunId = job.jobRunId ?? null;
  building.scriptureUpdatedAtTick = currentTick;
  building.updatedAtTick = currentTick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1) + 1);
  updateJobProgress(job, requiredProgress, nextProgress, progressBreakdown);
  const professionChanged = applyTransmissionSkillExpFromTicks(
    recorder,
    1,
    building.scriptureRealmLv,
    ctx.resolveExpToNextByLevel,
  );
  markScriptureBuildingDirty(instance, building);
  if (nextProgress < requiredProgress) {
    markTransmissionDirty(recorder, ctx, ['active_job', ...(professionChanged ? ['profession'] : [])]);
    return { ...emptyTransmissionTickResult(), panelChanged: true, attrChanged: professionChanged };
  }
  building.scriptureProgress = requiredProgress;
  building.scriptureRecordingJobRunId = null;
  building.scriptureRecordedAtTick = currentTick;
  building.scriptureUpdatedAtTick = currentTick;
  markScriptureBuildingDirty(instance, building);
  recorder.transmissionJob = null;
  markTransmissionDirty(recorder, ctx, ['active_job', ...(professionChanged ? ['profession'] : [])]);
  resolveTransmissionDeps(ctx)?.refreshPlayerContextActions?.(recorder.playerId);
  return {
    ...emptyTransmissionTickResult(),
    panelChanged: true,
    attrChanged: professionChanged,
    messages: [{
      kind: 'success',
      key: 'notice.craft.scripture-recording.complete',
      vars: { techniqueName: job.techniqueName },
      pills: [{ key: 'techniqueName', style: 'skill' }],
    }],
  };
}

function blockScriptureRecording(
  recorder: any,
  job: PlayerTransmissionJob,
  reason: PlayerTransmissionJob['blockedReason'],
  ctx: PipelineContext,
): unknown {
  let changed = false;
  if (job.status !== 'blocked' || job.blockedReason !== reason) {
    job.status = 'blocked';
    job.blockedReason = reason;
    changed = true;
  }
  if (changed) {
    markTransmissionDirty(recorder, ctx, ['active_job']);
  }
  return { ...emptyTransmissionTickResult(), panelChanged: changed };
}

function completeTransmission(
  learner: any,
  pending: any,
  _job: PlayerTransmissionJob,
  ctx: PipelineContext,
  professionChanged: boolean,
): void {
  const technique = ctx.contentTemplateRepository && typeof (ctx.contentTemplateRepository as any).createTechniqueState === 'function'
    ? (ctx.contentTemplateRepository as any).createTechniqueState(pending.techId)
    : null;
  if (technique && !learner.techniques.techniques.some((entry: any) => entry?.techId === technique.techId)) {
    learner.techniques.techniques.push(toTechniqueUpdateEntry(technique));
    learner.techniques.techniques.sort((left: any, right: any) =>
      (left.realmLv ?? 0) - (right.realmLv ?? 0) || String(left.techId).localeCompare(String(right.techId), 'zh-Hans-CN'));
  }
  learner.pendingTechniqueComprehensions = (learner.pendingTechniqueComprehensions ?? []).filter((entry: any) => entry?.techId !== pending.techId);
  learner.techniques.revision += 1;
  const deps = resolveTransmissionDeps(ctx);
  deps?.playerRuntimeService?.playerAttributesService?.recalculate?.(learner);
  deps?.playerRuntimeService?.rebuildActionState?.(learner, resolvePlayerRuntimeTick(learner));
  deps?.playerRuntimeService?.playerProgressionService?.refreshPreview?.(learner);
  markTransmissionDirty(learner, ctx, ['active_job', 'technique', 'auto_battle_skill', 'attr', ...(professionChanged ? ['profession'] : [])]);
}

function updateJobProgress(
  job: PlayerTransmissionJob,
  requiredProgress: number,
  progress: number,
  progressBreakdown: ReturnType<typeof calculateTechniqueComprehensionProgressBreakdown>,
): void {
  const remaining = Math.max(0, requiredProgress - Math.min(requiredProgress, progress));
  const normalizedGain = Math.max(0, Number(progressBreakdown.progressGain) || 0);
  job.workTotalTicks = requiredProgress;
  job.workRemainingTicks = remaining;
  job.totalTicks = requiredProgress;
  job.remainingTicks = remaining > 0 ? Math.max(1, Math.ceil(remaining)) : 0;
  job.progressGainPerTick = normalizedGain;
  job.estimatedRemainingTicks = normalizedGain > 0 && remaining > 0
    ? Math.max(1, Math.ceil(remaining / normalizedGain))
    : 0;
  job.progressBreakdown = progressBreakdown;
}

function resolveTransmissionProgressBreakdown(learner: any, teacher: any, techniqueRealmLv: unknown): ReturnType<typeof calculateTechniqueComprehensionProgressBreakdown> {
  return calculateTechniqueComprehensionProgressBreakdown({
    baseProgress: 1,
    techniqueRealmLv: Math.max(1, Math.floor(Number(techniqueRealmLv) || 1)),
    learnerRealmLv: learner?.realm?.realmLv ?? 1,
    learnerTransmissionLevel: learner?.transmissionSkill?.level ?? 1,
    teacherTransmissionLevel: teacher?.transmissionSkill?.level ?? 1,
  });
}

function resolveScriptureRecordingProgressBreakdown(recorder: any, techniqueRealmLv: unknown): ReturnType<typeof calculateTechniqueComprehensionProgressBreakdown> {
  return calculateTechniqueComprehensionProgressBreakdown({
    baseProgress: 10,
    techniqueRealmLv: Math.max(1, Math.floor(Number(techniqueRealmLv) || 1)),
    learnerRealmLv: recorder?.realm?.realmLv ?? 1,
    learnerTransmissionLevel: recorder?.transmissionSkill?.level ?? 1,
  });
}

function applyTransmissionSkillExpFromTicks(player: any, elapsedTicks: number, targetLevel: unknown, getExpToNextByLevel: (level: number) => number): boolean {
  const skill = player?.transmissionSkill;
  if (!skill) {
    return false;
  }
  const gain = computeCraftSkillExpGain({
    skillLevel: skill.level,
    targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
    baseActionTicks: elapsedTicks,
    getExpToNextByLevel,
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
  return applyCraftSkillExpLocal(skill, gain, getExpToNextByLevel);
}

function applyCraftSkillExpLocal(skill: any, amount: number, getExpToNextByLevel: (level: number) => number): boolean {
  let changed = false;
  const resolvedExpToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
  if (skill.expToNext !== resolvedExpToNext) {
    skill.expToNext = resolvedExpToNext;
    changed = true;
  }
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (gain <= 0) {
    return changed;
  }
  skill.exp = Math.max(0, Number(skill.exp) || 0) + gain;
  while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
    changed = true;
  }
  return changed || gain > 0;
}

function markTransmissionDirty(player: any, ctx: PipelineContext, domains: string[]): void {
  if (player?.dirtyDomains && typeof player.dirtyDomains.add === 'function') {
    for (const domain of domains) {
      player.dirtyDomains.add(domain);
    }
  }
  const runtime = resolveTransmissionDeps(ctx)?.playerRuntimeService;
  runtime?.markPersistenceDirtyDomains?.(player, domains);
  runtime?.bumpPersistentRevision?.(player);
}

function resolveScriptureBuilding(ctx: PipelineContext, player: any, buildingIdInput: unknown): { instance: any | null; building: any | null } {
  const buildingId = normalizeText(buildingIdInput);
  const instanceId = normalizeText(player?.instanceId);
  const deps = resolveTransmissionDeps(ctx);
  const instance = instanceId
    ? (deps?.getInstanceRuntime?.(instanceId) ?? ctx.getInstanceRuntime?.(instanceId) ?? null)
    : null;
  const building = buildingId && instance?.buildingById?.get ? instance.buildingById.get(buildingId) ?? null : null;
  return { instance, building };
}

function markScriptureBuildingDirty(instance: any, building: any): void {
  if (!instance || !building) {
    return;
  }
  instance.localBuildingViewCacheById?.delete?.(building.id);
  instance.markPersistenceDirtyDomainsHighPriority?.(['building']);
  if (typeof instance.persistentRevision === 'number') {
    instance.persistentRevision += 1;
  }
}

function findPlayerTechnique(player: any, techniqueId: string): any | null {
  return (player?.techniques?.techniques ?? []).find((entry: any) => entry?.techId === techniqueId) ?? null;
}

function isTechniqueEntryMaxed(technique: any): boolean {
  const level = Math.max(1, Math.floor(Number(technique?.level) || 1));
  const maxLevel = getTechniqueMaxLevel(Array.isArray(technique?.layers) ? technique.layers : undefined, level);
  return level >= maxLevel || Number(technique?.expToNext ?? 0) <= 0;
}

function canPlayerUseScriptureBuilding(player: any, building: any): boolean {
  const ownerPlayerId = normalizeText(building?.ownerPlayerId);
  if (ownerPlayerId && ownerPlayerId !== normalizeText(player?.playerId)) {
    return false;
  }
  const ownerSectId = normalizeText(building?.ownerSectId);
  return !ownerSectId || ownerSectId === normalizeText(player?.sectId);
}

function isPlayerNearBuilding(player: any, building: any, range: number): boolean {
  if (!player || !building || normalizeText(player.instanceId) !== normalizeText(building.instanceId)) {
    return false;
  }
  const dx = Math.abs(Math.floor(Number(player.x) || 0) - Math.floor(Number(building.x) || 0));
  const dy = Math.abs(Math.floor(Number(player.y) || 0) - Math.floor(Number(building.y) || 0));
  return Math.max(dx, dy) <= Math.max(0, Math.floor(Number(range) || 0));
}

function hasAnyActiveTechniqueJob(player: any): boolean {
  return hasRemainingJob(player?.alchemyJob)
    || hasRemainingJob(player?.forgingJob)
    || hasRemainingJob(player?.enhancementJob)
    || hasRemainingJob(player?.transmissionJob)
    || hasRemainingJob(player?.gatherJob)
    || hasRemainingJob(player?.buildingJob)
    || hasRemainingJob(player?.miningJob)
    || hasRemainingJob(player?.formationJob);
}

function hasRemainingJob(job: any): boolean {
  return Boolean(job && (Number(job.remainingTicks) > 0 || Number(job.workRemainingTicks) > 0));
}

function isPlayerInTransmissionRange(teacher: any, learner: any, range: number): boolean {
  if (!teacher || !learner || teacher.instanceId !== learner.instanceId) {
    return false;
  }
  const dx = Math.abs(Math.floor(Number(teacher.x) || 0) - Math.floor(Number(learner.x) || 0));
  const dy = Math.abs(Math.floor(Number(teacher.y) || 0) - Math.floor(Number(learner.y) || 0));
  return Math.max(dx, dy) <= Math.max(0, Math.floor(Number(range) || 0));
}

function resolvePlayerRuntimeTick(player: any): number {
  return Math.max(0, Math.floor(Number(player?.lifeElapsedTicks) || 0));
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function toTechniqueUpdateEntry(technique: any): any {
  return {
    techId: technique.techId,
    level: technique.level,
    exp: technique.exp,
    expToNext: technique.expToNext,
    realmLv: technique.realmLv,
    realm: technique.realm,
    skillsEnabled: technique.skillsEnabled !== false,
    name: technique.name,
    grade: technique.grade,
    category: technique.category,
    skills: Array.isArray(technique.skills) ? technique.skills : [],
    layers: Array.isArray(technique.layers) ? technique.layers : [],
  };
}

function emptyTransmissionTickResult() {
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

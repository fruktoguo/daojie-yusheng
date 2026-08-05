/**
 * 本文件属于服务端权威运行时，负责传法技艺 job 的启动、推进、取消和完成。
 *
 * 传法是学习者身上的正式通用技艺 job；传授者只作为距离、功法掌握与传法技能加成的条件来源。
 */
import {
  calculateTechniqueComprehensionProgressBreakdown,
  calculateTechniqueComprehensionRequiredProgress,
  computeCraftSkillExpGain,
  deriveTechniqueRealm,
  getTechniqueMaxLevel,
  isCreatedTechniqueId,
  isTechniqueFullyMastered,
  normalizeTechniqueLearnMaxLevel,
  resolvePlayerFacingContentName,
  type PlayerTransmissionJob,
  type TechniqueActivityNoticeMessage,
  type TechniqueActivityResolveResult,
  type TechniqueActivityRefundResult,
  type TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { applyPlayerCraftExpRate, resolvePlayerCraftRealmLevel } from '../../craft-effect-runtime.helpers';
import { advanceTechniqueActivityPause } from '../../technique-activity-runtime.helpers';
import { resolvePlayerComprehensionSpeedRate } from '../../../player/player-comprehension-speed.helpers';
import { resolvePlayerDisplayName as resolveRuntimePlayerDisplayName } from '../../../player/player-display-name';

type TransmissionValidatedPayload = {
  mode?: 'transmission' | 'scripture_recording' | 'scripture_contemplation';
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
    playerAttributesService?: { recalculate?(player: any, reason?: any): boolean };
    playerProgressionService?: { refreshPreview?(player: any): void };
    rebuildActionState?(player: any, tick: number): void;
    queuePlayerStructuredNotice?(player: any, notice: TechniqueActivityNoticeMessage & { text?: string }): void;
    resolveTechniqueLearningConflict?(player: any, techniqueId: string): {
      conflictAggregateIds?: string[];
      conflictSourceTechniqueIds?: string[];
      vars?: Record<string, string | number>;
    } | null;
    discardPendingTechniqueComprehension?(playerId: string, techniqueId: string): unknown;
    resolveLatestTechniqueId?(techniqueId: string): string;
    applyTechniqueAggregationCompletion?(player: any, techniqueId: string): string[];
    authorizePendingTechniqueComprehensionRemovals?(player: any, techniqueIds: string[]): boolean;
    techniqueAggregationService?: {
      getMetadataById?(techniqueId: string): unknown;
      resolveComprehensionRequirement?(player: any, technique: any, fallback?: number): number;
    } | null;
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
    const mode = resolveTransmissionMode(payload);
    const teacherPlayerId = normalizeText((payload as { teacherPlayerId?: unknown } | null)?.teacherPlayerId);
    const requestedTechniqueId = normalizeText((payload as { techniqueId?: unknown; techId?: unknown } | null)?.techniqueId)
      || normalizeText((payload as { techId?: unknown } | null)?.techId);
    const techniqueId = runtime?.resolveLatestTechniqueId?.(requestedTechniqueId) || requestedTechniqueId;
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
    if (mode === 'scripture_contemplation') {
      return validateScriptureContemplationStart(learner, payload, ctx);
    }
    if (!teacherPlayerId) {
      return { ok: false, error: '传授者不能为空。' };
    }
    const teacher = runtime?.getPlayer?.(teacherPlayerId) ?? null;
    if (!teacher) {
      return { ok: false, error: '传授者不存在。' };
    }
    const teacherTechnique = findTeacherTechniqueForTransmission(teacher, techniqueId, runtime);
    if (!teacherTechnique) {
      return { ok: false, error: '传授者尚未掌握该功法。' };
    }
    if (!isCreatedTechniqueId(techniqueId)) {
      return { ok: false, error: '只能传授自创功法。' };
    }
    const teacherTechniqueTemplate = resolveTechniqueTemplateState(ctx, teacherTechnique.techId);
    if (!isTechniqueEntryFullyMastered(teacherTechnique, teacherTechniqueTemplate)) {
      return { ok: false, error: '只有修至原功法满层后才能传授。' };
    }
    if (learner.techniques?.techniques?.some((entry: any) => entry?.techId === techniqueId)) {
      return { ok: false, error: '学习者已经掌握该功法。' };
    }
    const aggregationConflict = runtime?.resolveTechniqueLearningConflict?.(learner, techniqueId);
    if (aggregationConflict) {
      return { ok: false, error: buildAggregationConflictError(aggregationConflict) };
    }
    if (!isPlayerInTransmissionRange(teacher, learner, 2)) {
      return { ok: false, error: '传授距离超过 2 格。' };
    }
    const learningTechnique = resolveTechniqueTemplateState(ctx, techniqueId) ?? teacherTechnique;
    const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
      sourceKind: 'created',
      techniqueRealmLv: learningTechnique.realmLv,
      grade: learningTechnique.grade,
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
        techniqueName: resolvePlayerFacingContentName(techniqueId, '未知功法', learningTechnique.name, teacherTechnique.name),
        requiredProgress,
        realmLv: Math.max(1, Math.floor(Number(learningTechnique.realmLv) || 1)),
        grade: learningTechnique.grade ?? undefined,
        category: learningTechnique.category ?? undefined,
        teacherName: resolveRuntimePlayerDisplayName(teacher, { playerId: teacherPlayerId, fallback: '未知玩家' }),
      },
    };
  }

  consumeResources(): void {}

  createJob(player: unknown, validated: TransmissionValidatedPayload, ctx: PipelineContext): PlayerTransmissionJob {
    if (validated.mode === 'scripture_recording') {
      return createScriptureRecordingJob(player as any, validated, ctx);
    }
    if (validated.mode === 'scripture_contemplation') {
      return createScriptureContemplationJob(player as any, validated, ctx);
    }
    const learner = player as any;
    const pending = ensurePendingComprehension(learner, validated, ctx);
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
    const progressBreakdown = resolveTransmissionProgressBreakdown(learner, teacher, validated.realmLv, ctx);
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
        kind: 'transmission',
        key: 'notice.craft.scripture-recording.start',
        vars: { techniqueName: job.techniqueName },
        pills: [{ key: 'techniqueName', style: 'skill' }],
      }];
    }
    if (job.jobType === 'scripture_contemplation') {
      return [{
        kind: 'transmission',
        key: 'notice.craft.scripture-contemplation.start',
        vars: { techniqueName: job.techniqueName },
        pills: [{ key: 'techniqueName', style: 'skill' }],
      }];
    }
    return [{
      kind: 'transmission',
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
    if (job.jobType === 'scripture_contemplation') {
      return executeScriptureContemplationTick(learner, job, ctx);
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
    const teacherTechnique = findTeacherTechniqueForTransmission(teacher, job.techniqueId, deps?.playerRuntimeService);
    if (!teacher || !teacherTechnique || !isPlayerInTransmissionRange(teacher, learner, job.range)) {
      return blockTransmission(learner, job, pending, 'teacher_out_of_range', ctx);
    }
    if (!isTechniqueEntryFullyMastered(teacherTechnique, resolveTechniqueTemplateState(ctx, teacherTechnique.techId))) {
      return blockTransmission(learner, job, pending, 'teacher_technique_not_perfected', ctx);
    }
    if (job.status !== 'running' || job.blockedReason !== undefined) {
      job.status = 'running';
      delete job.blockedReason;
    }
    refreshPendingRequirement(
      learner,
      pending,
      resolveTechniqueTemplateState(ctx, job.techniqueId) ?? teacherTechnique,
      teacher,
      job,
      ctx,
    );
    const previousProgress = Math.max(0, Number(pending.progress) || 0);
    const requiredProgress = Math.max(1, Number(pending.requiredProgress) || 1);
    const progressBreakdown = resolveTransmissionProgressBreakdown(learner, teacher, pending.realmLv ?? teacherTechnique.realmLv, ctx);
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
    const completionConflict = deps?.playerRuntimeService?.resolveTechniqueLearningConflict?.(learner, pending.techId);
    if (completionConflict) {
      pending.progress = requiredProgress;
      this.setActiveJob(learner, null);
      discardConflictingPendingComprehension(learner, pending, deps);
      markTransmissionDirty(learner, ctx, ['active_job', 'technique']);
      return {
        ...emptyTransmissionTickResult(),
        panelChanged: true,
        messages: [{
          kind: 'transmission',
          key: 'notice.technique-aggregation.overlap',
          vars: {
            sourceTechniqueNames: resolveAggregationConflictSourceNames(completionConflict),
          },
        }],
      };
    }
    completeTransmission(learner, pending, job, ctx, learnerProfessionChanged);
    this.setActiveJob(learner, null);
    return {
      ...emptyTransmissionTickResult(),
      panelChanged: true,
      attrChanged: true,
      messages: [{
        kind: 'transmission',
        key: 'notice.progression.technique-comprehension-complete',
        vars: { techName: resolvePlayerFacingContentName(pending.techId, '未知功法', pending.name) },
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
      expParams: { playerRealmLevel: 1, skillLevel: 1, targetLevel: 1, baseActionTicks: 0, getExpToNextByLevel: () => 0 },
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
    if (job.jobType === 'scripture_contemplation') {
      return {
        items: [],
        spiritStones: 0,
        messages: [{
          kind: 'system',
          key: 'notice.craft.scripture-contemplation.cancelled',
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

function resolveTransmissionMode(payload: unknown): 'transmission' | 'scripture_recording' | 'scripture_contemplation' {
  const mode = normalizeText((payload as { mode?: unknown } | null)?.mode)
    || normalizeText((payload as { jobType?: unknown } | null)?.jobType);
  if (mode === 'scripture_recording' || mode === 'scripture_contemplation') {
    return mode;
  }
  return 'transmission';
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
  const activeRecordingJobRunId = normalizeText(building.scriptureRecordingJobRunId);
  if (activeRecordingJobRunId) {
    return { ok: false, error: '藏经台已有录入任务进行中。' };
  }
  const runtime = resolveTransmissionDeps(ctx)?.playerRuntimeService;
  const technique = findTeacherTechniqueForTransmission(recorder, techniqueId, runtime);
  if (!technique) {
    return { ok: false, error: '尚未掌握该功法。' };
  }
  if (!isCreatedTechniqueId(techniqueId)) {
    return { ok: false, error: '只能录入自创功法。' };
  }
  if (!isTechniqueEntryFullyMastered(technique, resolveTechniqueTemplateState(ctx, technique.techId))) {
    return { ok: false, error: '只有练满的功法可以录入藏经台。' };
  }
  const learningTechnique = resolveTechniqueTemplateState(ctx, techniqueId) ?? technique;
  const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: learningTechnique.realmLv,
    grade: learningTechnique.grade,
    learnerRealmLv: recorder.realm?.realmLv ?? 1,
  });
  return {
    ok: true,
    validated: {
      mode: 'scripture_recording',
      learnerPlayerId: recorder.playerId,
      teacherPlayerId: recorder.playerId,
      techniqueId,
      techniqueName: resolvePlayerFacingContentName(techniqueId, '未知功法', learningTechnique.name, technique.name),
      requiredProgress,
      realmLv: Math.max(1, Math.floor(Number(learningTechnique.realmLv) || 1)),
      grade: learningTechnique.grade ?? undefined,
      category: learningTechnique.category ?? undefined,
      teacherName: resolveRuntimePlayerDisplayName(recorder, { playerId: recorder.playerId, fallback: '未知玩家' }),
      buildingId,
    },
  };
}

function validateScriptureContemplationStart(
  learner: any,
  payload: unknown,
  ctx: PipelineContext,
): TechniqueActivityStartValidationResult<TransmissionValidatedPayload> {
  const buildingId = normalizeText((payload as { buildingId?: unknown } | null)?.buildingId);
  if (!buildingId) {
    return { ok: false, error: '藏经台不能为空。' };
  }
  const { building } = resolveScriptureBuilding(ctx, learner, buildingId);
  if (!building || building.defId !== 'scripture_platform') {
    return { ok: false, error: '藏经台不存在。' };
  }
  if (building.state !== 'active') {
    return { ok: false, error: '藏经台尚未完工。' };
  }
  if (!isPlayerNearBuilding(learner, building, 1)) {
    return { ok: false, error: '不在藏经台 1 格范围内。' };
  }
  const requestedTechniqueId = normalizeText(building.scriptureTechniqueId);
  const runtime = resolveTransmissionDeps(ctx)?.playerRuntimeService;
  const techniqueId = runtime?.resolveLatestTechniqueId?.(requestedTechniqueId) || requestedTechniqueId;
  if (!techniqueId || Number(building.scriptureRecordedAtTick) <= 0) {
    return { ok: false, error: '藏经台尚未录入藏书。' };
  }
  if (learner.techniques?.techniques?.some((entry: any) => entry?.techId === techniqueId)) {
    return { ok: false, error: '已经掌握该功法。' };
  }
  const aggregationConflict = runtime?.resolveTechniqueLearningConflict?.(learner, techniqueId);
  if (aggregationConflict) {
    return {
      ok: false,
      error: buildAggregationConflictError(aggregationConflict),
    };
  }
  const learningTechnique = resolveTechniqueTemplateState(ctx, techniqueId);
  const baseRequiredProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: learningTechnique?.realmLv ?? building.scriptureRealmLv,
    grade: learningTechnique?.grade ?? building.scriptureGrade,
    learnerRealmLv: learner.realm?.realmLv ?? 1,
  });
  const requiredProgress = resolveAggregateComprehensionRequirement(
    learner,
    learningTechnique ?? {
      techId: techniqueId,
      realmLv: building.scriptureRealmLv,
      grade: building.scriptureGrade,
    },
    baseRequiredProgress,
    ctx,
  );
  return {
    ok: true,
    validated: {
      mode: 'scripture_contemplation',
      learnerPlayerId: learner.playerId,
      teacherPlayerId: learner.playerId,
      techniqueId,
      techniqueName: resolvePlayerFacingContentName(techniqueId, '未知功法', learningTechnique?.name, building.scriptureTechniqueName),
      requiredProgress,
      realmLv: Math.max(1, Math.floor(Number(learningTechnique?.realmLv ?? building.scriptureRealmLv) || 1)),
      grade: learningTechnique?.grade ?? building.scriptureGrade ?? undefined,
      category: learningTechnique?.category ?? building.scriptureCategory ?? undefined,
      teacherName: resolveRuntimePlayerDisplayName(learner, { playerId: learner.playerId, fallback: '未知玩家' }),
      buildingId,
    },
  };
}

function createScriptureRecordingJob(recorder: any, validated: TransmissionValidatedPayload, ctx: PipelineContext): PlayerTransmissionJob {
  const { instance, building } = resolveScriptureBuilding(ctx, recorder, validated.buildingId);
  const required = Math.max(1, Number(validated.requiredProgress) || 1);
  const currentTick = resolvePlayerRuntimeTick(recorder);
  const progress = Math.max(0, Math.min(required, Number(building?.scriptureProgress) || 0));
  const jobRunId = `scripture_recording:${validated.buildingId}:${validated.techniqueId}:${recorder.playerId}:${currentTick}`;
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
  const progressBreakdown = resolveScriptureRecordingProgressBreakdown(recorder, validated.realmLv, ctx);
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

function createScriptureContemplationJob(learner: any, validated: TransmissionValidatedPayload, ctx: PipelineContext): PlayerTransmissionJob {
  const pending = ensurePendingComprehension(learner, validated, ctx);
  pending.selfComprehensionAllowed = false;
  const progress = Math.max(0, Number(pending.progress) || 0);
  const required = Math.max(1, Number(validated.requiredProgress) || 1);
  const remaining = Math.max(0, required - Math.min(required, progress));
  const currentTick = resolvePlayerRuntimeTick(learner);
  const progressBreakdown = resolveScriptureContemplationProgressBreakdown(learner, validated.realmLv, ctx);
  markTransmissionDirty(learner, ctx, ['technique', 'active_job']);
  return {
    jobRunId: `scripture_contemplation:${validated.buildingId}:${validated.techniqueId}:${currentTick}`,
    jobType: 'scripture_contemplation',
    jobVersion: 1,
    label: '藏经参悟',
    techniqueId: validated.techniqueId,
    techniqueName: validated.techniqueName,
    teacherPlayerId: learner.playerId,
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

function ensurePendingComprehension(learner: any, validated: TransmissionValidatedPayload, ctx: PipelineContext): any {
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
  const runtime = resolveTransmissionDeps(ctx)?.playerRuntimeService;
  const aggregateMetadata = runtime?.techniqueAggregationService?.getMetadataById?.(validated.techniqueId);
  if (aggregateMetadata) {
    pending.creatorPlayerId = (aggregateMetadata as { creatorPlayerId?: string }).creatorPlayerId;
    pending.requiredProgress = resolveAggregateComprehensionRequirement(
      learner,
      resolveTechniqueTemplateState(ctx, validated.techniqueId) ?? validated,
      validated.requiredProgress,
      ctx,
    );
  }
  return pending;
}

function findPendingComprehension(learner: any, techniqueId: string): any | null {
  return (learner.pendingTechniqueComprehensions ?? []).find((entry: any) => entry?.techId === techniqueId) ?? null;
}

/** 旧统合版本仍可作为传授凭据，但学习目标始终是家族最新版。 */
function findTeacherTechniqueForTransmission(
  teacher: any,
  targetTechniqueId: string,
  runtime: TransmissionDepsPort['playerRuntimeService'] | null | undefined,
): any | null {
  const techniques = Array.isArray(teacher?.techniques?.techniques) ? teacher.techniques.techniques : [];
  const exact = techniques.find((entry: any) => entry?.techId === targetTechniqueId);
  if (exact) return exact;
  if (typeof runtime?.resolveLatestTechniqueId !== 'function') return null;
  return techniques.find((entry: any) => {
    const ownedTechniqueId = normalizeText(entry?.techId);
    return ownedTechniqueId
      && runtime.resolveLatestTechniqueId!(ownedTechniqueId) === targetTechniqueId;
  }) ?? null;
}

function refreshPendingRequirement(
  learner: any,
  pending: any,
  teacherTechnique: any,
  teacher: any,
  job: PlayerTransmissionJob,
  ctx: PipelineContext,
): void {
  const baseRequiredProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: teacherTechnique.realmLv,
    grade: teacherTechnique.grade,
    learnerRealmLv: learner.realm?.realmLv ?? 1,
    learnerTransmissionLevel: learner.transmissionSkill?.level ?? 1,
    teacherTransmissionLevel: teacher.transmissionSkill?.level ?? 1,
  });
  const requiredProgress = resolveAggregateComprehensionRequirement(
    learner,
    teacherTechnique,
    baseRequiredProgress,
    ctx,
  );
  pending.requiredProgress = requiredProgress;
  pending.realmLv = Math.max(1, Math.floor(Number(teacherTechnique.realmLv) || 1));
  pending.grade = teacherTechnique.grade ?? pending.grade;
  pending.category = teacherTechnique.category ?? pending.category;
  pending.name = resolvePlayerFacingContentName(pending.techId, '未知功法', teacherTechnique.name, pending.name);
  job.techniqueName = pending.name;
  job.realmLv = pending.realmLv;
  job.grade = pending.grade;
  job.category = pending.category;
  job.teacherName = resolveRuntimePlayerDisplayName(teacher, { playerId: job.teacherPlayerId, fallback: job.teacherName ?? '未知玩家' });
}

function queueTeacherTransmissionStartNotice(validated: TransmissionValidatedPayload, ctx: PipelineContext): void {
  const deps = resolveTransmissionDeps(ctx);
  const runtime = deps?.playerRuntimeService;
  const teacher = runtime?.getPlayer?.(validated.teacherPlayerId) ?? null;
  if (!teacher || typeof runtime?.queuePlayerStructuredNotice !== 'function') {
    return;
  }
  runtime.queuePlayerStructuredNotice(teacher, {
    kind: 'transmission',
    text: 'notice.craft.transmission.teacher-start',
    structured: {
      key: 'notice.craft.transmission.teacher-start',
      vars: {
        learnerName: resolveRuntimePlayerDisplayName(runtime.getPlayer?.(validated.learnerPlayerId) ?? null, {
          playerId: validated.learnerPlayerId,
          fallback: '未知玩家',
        }),
        techniqueName: validated.techniqueName,
      },
      pills: [
        { key: 'learnerName', style: 'target' },
        { key: 'techniqueName', style: 'skill' },
      ],
    },
  });
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
  const activeRecordingJobRunId = normalizeText(building.scriptureRecordingJobRunId);
  if (activeRecordingJobRunId && activeRecordingJobRunId !== normalizeText(job.jobRunId)) {
    return blockScriptureRecording(recorder, job, 'scripture_recording_locked', ctx);
  }
  if (Number(building.scriptureRecordedAtTick) > 0) {
    return blockScriptureRecording(recorder, job, 'scripture_recording_locked', ctx);
  }
  const technique = findPlayerTechnique(recorder, job.techniqueId);
  if (!technique || !isTechniqueEntryFullyMastered(technique, resolveTechniqueTemplateState(ctx, job.techniqueId))) {
    return blockScriptureRecording(recorder, job, 'scripture_platform_unavailable', ctx);
  }
  if (job.status !== 'running' || job.blockedReason !== undefined) {
    job.status = 'running';
    delete job.blockedReason;
  }
  const currentTick = resolvePlayerRuntimeTick(recorder);
  const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: technique.realmLv ?? job.realmLv,
    grade: technique.grade ?? job.grade,
    learnerRealmLv: recorder.realm?.realmLv ?? 1,
  });
  const previousProgress = Math.max(0, Math.min(requiredProgress, Number(building.scriptureProgress) || 0));
  const progressBreakdown = resolveScriptureRecordingProgressBreakdown(recorder, building.scriptureRealmLv ?? job.realmLv, ctx);
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
      kind: 'transmission',
      key: 'notice.craft.scripture-recording.complete',
      vars: { techniqueName: job.techniqueName },
      pills: [{ key: 'techniqueName', style: 'skill' }],
    }],
  };
}

function executeScriptureContemplationTick(learner: any, job: PlayerTransmissionJob, ctx: PipelineContext): unknown {
  if (job.phase === 'paused') {
    const resumed = advanceTechniqueActivityPause(job, 'transmitting');
    markTransmissionDirty(learner, ctx, ['active_job']);
    return { ...emptyTransmissionTickResult(), panelChanged: resumed.resumed };
  }
  const { building } = resolveScriptureBuilding(ctx, learner, job.buildingId);
  if (!building || building.defId !== 'scripture_platform' || building.state !== 'active') {
    return blockScriptureContemplation(learner, job, 'scripture_platform_unavailable', ctx);
  }
  if (!isPlayerNearBuilding(learner, building, 1)) {
    return blockScriptureContemplation(learner, job, 'scripture_platform_out_of_range', ctx);
  }
  const runtime = resolveTransmissionDeps(ctx)?.playerRuntimeService;
  const recordedTechniqueId = normalizeText(building.scriptureTechniqueId);
  const currentTechniqueId = runtime?.resolveLatestTechniqueId?.(recordedTechniqueId) || recordedTechniqueId;
  if (!currentTechniqueId || currentTechniqueId !== job.techniqueId || Number(building.scriptureRecordedAtTick) <= 0) {
    return blockScriptureContemplation(learner, job, 'scripture_platform_unavailable', ctx);
  }
  if (learner.techniques?.techniques?.some((entry: any) => entry?.techId === job.techniqueId)) {
    learner.transmissionJob = null;
    markTransmissionDirty(learner, ctx, ['active_job']);
    return { ...emptyTransmissionTickResult(), panelChanged: true };
  }
  const learningTechnique = resolveTechniqueTemplateState(ctx, job.techniqueId);
  const baseRequiredProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: learningTechnique?.realmLv ?? building.scriptureRealmLv ?? job.realmLv,
    grade: learningTechnique?.grade ?? building.scriptureGrade ?? job.grade,
    learnerRealmLv: learner.realm?.realmLv ?? 1,
  });
  const requiredProgress = resolveAggregateComprehensionRequirement(
    learner,
    learningTechnique ?? {
      techId: job.techniqueId,
      realmLv: building.scriptureRealmLv ?? job.realmLv,
      grade: building.scriptureGrade ?? job.grade,
    },
    baseRequiredProgress,
    ctx,
  );
  let pending = findPendingComprehension(learner, job.techniqueId);
  if (!pending) {
    pending = ensurePendingComprehension(learner, {
      mode: 'scripture_contemplation',
      learnerPlayerId: learner.playerId,
      teacherPlayerId: learner.playerId,
      techniqueId: job.techniqueId,
      techniqueName: job.techniqueName,
      requiredProgress,
      realmLv: Math.max(1, Math.floor(Number(learningTechnique?.realmLv ?? building.scriptureRealmLv ?? job.realmLv) || 1)),
      grade: learningTechnique?.grade ?? building.scriptureGrade ?? job.grade,
      category: learningTechnique?.category ?? building.scriptureCategory ?? job.category,
      teacherName: job.teacherName,
      buildingId: job.buildingId,
    }, ctx);
  }
  if (job.status !== 'running' || job.blockedReason !== undefined) {
    job.status = 'running';
    delete job.blockedReason;
  }
  pending.selfComprehensionAllowed = false;
  delete pending.activeTransferJob;
  const previousProgress = Math.max(0, Math.min(requiredProgress, Number(pending.progress) || 0));
  pending.name = resolvePlayerFacingContentName(
    job.techniqueId,
    '未知功法',
    learningTechnique?.name,
    building.scriptureTechniqueName,
    job.techniqueName,
    pending.name,
  );
  pending.sourceKind = 'created';
  pending.requiredProgress = requiredProgress;
  pending.realmLv = Math.max(1, Math.floor(Number(learningTechnique?.realmLv ?? building.scriptureRealmLv ?? job.realmLv ?? pending.realmLv) || 1));
  pending.grade = learningTechnique?.grade ?? building.scriptureGrade ?? job.grade ?? pending.grade;
  pending.category = learningTechnique?.category ?? building.scriptureCategory ?? job.category ?? pending.category;
  pending.updatedAtTick = resolvePlayerRuntimeTick(learner);
  const progressBreakdown = resolveScriptureContemplationProgressBreakdown(learner, pending.realmLv, ctx);
  pending.progress = Math.min(requiredProgress, previousProgress + progressBreakdown.progressGain);
  job.techniqueName = pending.name;
  job.realmLv = pending.realmLv;
  job.grade = pending.grade;
  job.category = pending.category;
  updateJobProgress(job, requiredProgress, pending.progress, progressBreakdown);
  const professionChanged = applyTransmissionSkillExpFromTicks(
    learner,
    1,
    pending.realmLv,
    ctx.resolveExpToNextByLevel,
  );
  if (pending.progress < requiredProgress) {
    learner.techniques.revision += 1;
    markTransmissionDirty(learner, ctx, ['active_job', 'technique', ...(professionChanged ? ['profession'] : [])]);
    return { ...emptyTransmissionTickResult(), panelChanged: true, attrChanged: professionChanged };
  }
  const completionConflict = resolveTransmissionDeps(ctx)?.playerRuntimeService
    ?.resolveTechniqueLearningConflict?.(learner, pending.techId);
  if (completionConflict) {
    learner.transmissionJob = null;
    discardConflictingPendingComprehension(learner, pending, resolveTransmissionDeps(ctx));
    markTransmissionDirty(learner, ctx, ['active_job', 'technique']);
    return buildAggregationConflictTickResult(completionConflict);
  }
  completeTransmission(learner, pending, job, ctx, professionChanged);
  learner.transmissionJob = null;
  return {
    ...emptyTransmissionTickResult(),
    panelChanged: true,
    attrChanged: true,
    messages: [{
      kind: 'transmission',
      key: 'notice.progression.technique-comprehension-complete',
      vars: { techName: resolvePlayerFacingContentName(pending.techId, '未知功法', pending.name) },
      pills: [{ key: 'techName', style: 'skill' }],
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

function blockScriptureContemplation(
  learner: any,
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
  const pending = findPendingComprehension(learner, job.techniqueId);
  if (pending) {
    pending.updatedAtTick = resolvePlayerRuntimeTick(learner);
  }
  if (changed) {
    markTransmissionDirty(learner, ctx, ['active_job', ...(pending ? ['technique'] : [])]);
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
  const deps = resolveTransmissionDeps(ctx);
  const technique = ctx.contentTemplateRepository && typeof (ctx.contentTemplateRepository as any).createTechniqueState === 'function'
    ? (ctx.contentTemplateRepository as any).createTechniqueState(pending.techId)
    : null;
  if (technique && !learner.techniques.techniques.some((entry: any) => entry?.techId === technique.techId)) {
    learner.techniques.techniques.push(toTechniqueUpdateEntry(technique, pending.maxLevel));
    learner.techniques.techniques.sort((left: any, right: any) =>
      (left.realmLv ?? 0) - (right.realmLv ?? 0) || String(left.techId).localeCompare(String(right.techId), 'zh-Hans-CN'));
  }
  const replacedTechniqueIds = deps?.playerRuntimeService?.applyTechniqueAggregationCompletion?.(learner, pending.techId) ?? [];
  learner.pendingTechniqueComprehensions = (learner.pendingTechniqueComprehensions ?? []).filter((entry: any) => entry?.techId !== pending.techId);
  learner.techniques.revision += 1;
  deps?.playerRuntimeService?.playerAttributesService?.recalculate?.(learner, 'technique_mutation');
  deps?.playerRuntimeService?.rebuildActionState?.(learner, resolvePlayerRuntimeTick(learner));
  deps?.playerRuntimeService?.playerProgressionService?.refreshPreview?.(learner);
  markTransmissionDirty(learner, ctx, ['active_job', 'technique', 'auto_battle_skill', 'attr', ...(professionChanged ? ['profession'] : [])]);
  deps?.playerRuntimeService?.authorizePendingTechniqueComprehensionRemovals?.(
    learner,
    [pending.techId, ...replacedTechniqueIds],
  );
}

function resolveAggregateComprehensionRequirement(
  learner: any,
  technique: any,
  fallback: number,
  ctx: PipelineContext,
): number {
  const aggregationService = resolveTransmissionDeps(ctx)?.playerRuntimeService?.techniqueAggregationService;
  return Math.max(
    1,
    Math.ceil(aggregationService?.resolveComprehensionRequirement?.(learner, technique, fallback) ?? fallback),
  );
}

function buildAggregationConflictTickResult(conflict: {
  conflictAggregateIds?: string[];
  conflictSourceTechniqueIds?: string[];
  vars?: Record<string, string | number>;
}): unknown {
  return {
    ...emptyTransmissionTickResult(),
    panelChanged: true,
    messages: [{
      kind: 'transmission',
      key: 'notice.technique-aggregation.overlap',
      vars: {
        sourceTechniqueNames: resolveAggregationConflictSourceNames(conflict),
      },
    }],
  };
}

function buildAggregationConflictError(conflict: {
  conflictSourceTechniqueIds?: string[];
  vars?: Record<string, string | number>;
}): string {
  return 'TECHNIQUE_AGGREGATE_OVERLAP:' + resolveAggregationConflictSourceNames(conflict);
}

function resolveAggregationConflictSourceNames(conflict: {
  conflictSourceTechniqueIds?: string[];
  vars?: Record<string, string | number>;
}): string {
  const names = conflict.vars?.sourceTechniqueNames;
  if (typeof names === 'string' && names.trim()) return names.trim();
  return (conflict.conflictSourceTechniqueIds ?? []).filter(Boolean).join('、') || '未知功法';
}

function discardConflictingPendingComprehension(
  learner: any,
  pending: any,
  deps: TransmissionDepsPort | null,
): void {
  const discard = deps?.playerRuntimeService?.discardPendingTechniqueComprehension;
  if (typeof discard === 'function') {
    try {
      discard(learner.playerId, pending.techId);
      return;
    } catch {
      // 运行态已在并发路径清理时，继续使用当前对象回退清理。
    }
  }
  learner.pendingTechniqueComprehensions = (learner.pendingTechniqueComprehensions ?? [])
    .filter((entry: any) => entry?.techId !== pending.techId);
  if (learner.techniques?.cultivatingTechId === pending.techId) {
    learner.techniques.cultivatingTechId = undefined;
    if (learner.combat) learner.combat.cultivationActive = false;
  }
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

function resolveTransmissionProgressBreakdown(learner: any, teacher: any, techniqueRealmLv: unknown, ctx: PipelineContext): ReturnType<typeof calculateTechniqueComprehensionProgressBreakdown> {
  const learnerTransmissionSpeedRate = resolvePlayerTransmissionSpeedRate(learner, ctx);
  const teacherTransmissionSpeedRate = resolvePlayerTransmissionSpeedRate(teacher, ctx);
  return calculateTechniqueComprehensionProgressBreakdown({
    baseProgress: 1,
    techniqueRealmLv: Math.max(1, Math.floor(Number(techniqueRealmLv) || 1)),
    learnerRealmLv: learner?.realm?.realmLv ?? 1,
    learnerTransmissionLevel: learner?.transmissionSkill?.level ?? 1,
    teacherTransmissionLevel: teacher?.transmissionSkill?.level ?? 1,
    learnerTransmissionSpeedRate,
    teacherTransmissionSpeedRate,
  });
}

function resolveScriptureRecordingProgressBreakdown(recorder: any, techniqueRealmLv: unknown, ctx: PipelineContext): ReturnType<typeof calculateTechniqueComprehensionProgressBreakdown> {
  return calculateTechniqueComprehensionProgressBreakdown({
    baseProgress: 10,
    techniqueRealmLv: Math.max(1, Math.floor(Number(techniqueRealmLv) || 1)),
    learnerRealmLv: recorder?.realm?.realmLv ?? 1,
    learnerTransmissionLevel: recorder?.transmissionSkill?.level ?? 1,
    learnerTransmissionSpeedRate: resolvePlayerTransmissionSpeedRate(recorder, ctx),
  });
}

function resolveScriptureContemplationProgressBreakdown(learner: any, techniqueRealmLv: unknown, ctx: PipelineContext): ReturnType<typeof calculateTechniqueComprehensionProgressBreakdown> {
  return calculateTechniqueComprehensionProgressBreakdown({
    baseProgress: 1,
    techniqueRealmLv: Math.max(1, Math.floor(Number(techniqueRealmLv) || 1)),
    learnerRealmLv: learner?.realm?.realmLv ?? 1,
    learnerTransmissionLevel: learner?.transmissionSkill?.level ?? 1,
    learnerTransmissionSpeedRate: resolvePlayerTransmissionSpeedRate(learner, ctx),
  });
}

function resolvePlayerTransmissionSpeedRate(player: any, ctx: PipelineContext): number {
  const deps = resolveTransmissionDeps(ctx);
  return resolvePlayerComprehensionSpeedRate(player, {
    getInstanceRuntime: (instanceId) => deps?.getInstanceRuntime?.(instanceId)
      ?? ctx.getInstanceRuntime?.(instanceId)
      ?? null,
  });
}

function applyTransmissionSkillExpFromTicks(player: any, elapsedTicks: number, targetLevel: unknown, getExpToNextByLevel: (level: number) => number): boolean {
  const skill = player?.transmissionSkill;
  if (!skill) {
    return false;
  }
  const baseGain = computeCraftSkillExpGain({
    playerRealmLevel: resolvePlayerCraftRealmLevel(player),
    skillLevel: skill.level,
    targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
    baseActionTicks: elapsedTicks,
    getExpToNextByLevel,
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
  const gain = applyPlayerCraftExpRate(player, 'transmission', baseGain);
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

function resolveTechniqueTemplateState(ctx: PipelineContext, techniqueId: string): any | null {
  const repository = ctx.contentTemplateRepository as { createTechniqueState?(id: string): unknown } | null;
  return typeof repository?.createTechniqueState === 'function'
    ? repository.createTechniqueState(techniqueId) ?? null
    : null;
}

function isTechniqueEntryFullyMastered(technique: any, template: any = null): boolean {
  const layers = Array.isArray(template?.layers) && template.layers.length > 0
    ? template.layers
    : null;
  if (!layers) {
    return false;
  }
  return isTechniqueFullyMastered({
    level: Math.max(1, Math.floor(Number(technique?.level) || 1)),
    layers,
  });
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

function toTechniqueUpdateEntry(technique: any, maxLevelInput: unknown = undefined): any {
  const layers = Array.isArray(technique.layers) ? technique.layers : [];
  const learnTechniqueMaxLevel = normalizeTechniqueLearnMaxLevel(maxLevelInput, layers, technique.level);
  const templateMaxLevel = getTechniqueMaxLevel(layers, technique.level);
  const level = Math.min(
    Math.max(1, Math.floor(Number(technique.level) || 1)),
    learnTechniqueMaxLevel ?? templateMaxLevel,
  );
  return {
    techId: technique.techId,
    level,
    exp: technique.exp,
    expToNext: learnTechniqueMaxLevel !== undefined && level >= learnTechniqueMaxLevel ? 0 : technique.expToNext,
    realmLv: technique.realmLv,
    realm: deriveTechniqueRealm(level, layers),
    skillsEnabled: technique.skillsEnabled !== false,
    name: technique.name,
    grade: technique.grade,
    category: technique.category,
    skills: Array.isArray(technique.skills) ? technique.skills : [],
    layers,
    ...(learnTechniqueMaxLevel === undefined ? {} : { learnTechniqueMaxLevel }),
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

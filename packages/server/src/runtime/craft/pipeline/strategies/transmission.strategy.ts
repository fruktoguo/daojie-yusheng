/**
 * 本文件属于服务端权威运行时，负责传法技艺 job 的启动、推进、取消和完成。
 *
 * 传法是学习者身上的正式通用技艺 job；传授者只作为距离、功法掌握与传法技能加成的条件来源。
 */
import {
  calculateTechniqueComprehensionProgressGain,
  calculateTechniqueComprehensionRequiredProgress,
  computeCraftSkillExpGain,
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
  learnerPlayerId: string;
  teacherPlayerId: string;
  techniqueId: string;
  techniqueName: string;
  requiredProgress: number;
  realmLv: number;
  grade?: PlayerTransmissionJob['grade'];
  category?: PlayerTransmissionJob['category'];
  teacherName?: string;
};

type TransmissionDepsPort = {
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
    const teacherPlayerId = normalizeText((payload as { teacherPlayerId?: unknown } | null)?.teacherPlayerId);
    const techniqueId = normalizeText((payload as { techniqueId?: unknown; techId?: unknown } | null)?.techniqueId)
      || normalizeText((payload as { techId?: unknown } | null)?.techId);
    if (!learner?.playerId) {
      return { ok: false, error: '学习者不存在。' };
    }
    if (!teacherPlayerId) {
      return { ok: false, error: '传授者不能为空。' };
    }
    if (!techniqueId) {
      return { ok: false, error: '功法不能为空。' };
    }
    if (hasAnyActiveTechniqueJob(learner)) {
      return { ok: false, error: '学习者已有进行中的技艺任务。' };
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
      pausedTicks: 0,
      interruptWaitRemainingTicks: 0,
      interruptState: null,
      successRate: 1,
      spiritStoneCost: 0,
    };
  }

  buildStartMessages(_player: unknown, _validated: TransmissionValidatedPayload, job: PlayerTransmissionJob): TechniqueActivityNoticeMessage[] {
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
    const progressGain = calculateTechniqueComprehensionProgressGain({
      baseProgress: 1,
      techniqueRealmLv: pending.realmLv ?? teacherTechnique.realmLv,
      learnerRealmLv: learner.realm?.realmLv ?? 1,
      learnerTransmissionLevel: learner.transmissionSkill?.level ?? 1,
      teacherTransmissionLevel: teacher.transmissionSkill?.level ?? 1,
    });
    pending.progress = Math.min(requiredProgress, previousProgress + progressGain);
    pending.updatedAtTick = resolvePlayerRuntimeTick(learner);
    updateJobProgress(job, requiredProgress, pending.progress);
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
    completeTransmission(learner, pending, job, ctx, professionChanged);
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

  computeRefund(_player: unknown, job: PlayerTransmissionJob): TechniqueActivityRefundResult {
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

function updateJobProgress(job: PlayerTransmissionJob, requiredProgress: number, progress: number): void {
  const remaining = Math.max(0, requiredProgress - Math.min(requiredProgress, progress));
  job.workTotalTicks = requiredProgress;
  job.workRemainingTicks = remaining;
  job.totalTicks = requiredProgress;
  job.remainingTicks = remaining > 0 ? Math.max(1, Math.ceil(remaining)) : 0;
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

/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import type {
  TechniqueActivityNoticeMessage,
  PlayerFormationJob,
  TechniqueActivityConditionCheckResult,
  TechniqueActivityResolveResult,
  TechniqueActivityRefundResult,
  TechniqueActivityStartValidationResult,
} from '@mud/shared';
import { TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH } from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { resolveFormationMaintenanceTick } from './formation-maintenance-tick.helpers';

export class FormationStrategy implements TechniqueActivityStrategy<PlayerFormationJob> {
  readonly kind = 'formation' as const;
  readonly jobSlot = 'formationJob';
  readonly skillSlot = 'formationSkill';
  readonly activityLabel = '阵法维护';
  readonly pauseTicks = 10;
  readonly conditional = true;

  getActiveJob(player: unknown): PlayerFormationJob | null {
    return (player as { formationJob?: PlayerFormationJob | null }).formationJob ?? null;
  }

  setActiveJob(player: unknown, job: PlayerFormationJob | null): void {
    (player as { formationJob?: PlayerFormationJob | null }).formationJob = job;
  }

  validateStart(player: unknown, payload: unknown, ctx: PipelineContext): TechniqueActivityStartValidationResult {
    const formationInstanceId = typeof (payload as { formationInstanceId?: unknown } | null)?.formationInstanceId === 'string'
      ? String((payload as { formationInstanceId: string }).formationInstanceId).trim()
      : '';
    if (!formationInstanceId) {
      return { ok: false, error: '阵法实例 ID 不能为空。' };
    }
    const formationService = resolveFormationService(ctx);
    const formation = formationService.findOwnedFormation(resolvePlayerId(player), formationInstanceId);
    const activeJob = this.getActiveJob(player);
    if (activeJob && Number(activeJob.remainingTicks) > 0 && activeJob.formationInstanceId === formationInstanceId) {
      return { ok: true, validated: { formationInstanceId, formationName: normalizeFormationName(formation?.name), alreadyMaintaining: true } };
    }
    if (!resolveAnyActiveTechniqueJob(player)) {
      const condition = formationService.checkFormationMaintenanceCondition(player, { formationInstanceId }, ctx);
      if (!condition.satisfied) {
        return { ok: false, error: condition.reason || '当前不能维护该阵法。' };
      }
    }
    return { ok: true, validated: { formationInstanceId, formationName: normalizeFormationName(formation?.name) } };
  }

  queueStart(player: unknown, validated: unknown, _payload: unknown, ctx: PipelineContext): unknown | null {
    const formationName = normalizeFormationName((validated as { formationName?: unknown }).formationName);
    if ((validated as { alreadyMaintaining?: unknown }).alreadyMaintaining === true) {
      return {
        ok: true,
        panelChanged: false,
        messages: [buildFormationNotice('info', 'notice.craft.formation.already-maintaining', formationName)],
      };
    }
    if (!resolveAnyActiveTechniqueJob(player)) {
      return null;
    }
    const formationInstanceId = String((validated as { formationInstanceId?: unknown }).formationInstanceId ?? '').trim();
    if (!enqueueFormationMaintenance(player, formationInstanceId, formationName)) {
      return { ok: false, error: '技艺行动队列已满。', panelChanged: false, messages: [] };
    }
    markFormationDirty(player, ctx);
    return {
      ok: true,
      panelChanged: true,
      messages: [buildFormationNotice('system', 'notice.craft.formation.queued', formationName)],
    };
  }

  consumeResources(_player: unknown, _validated: unknown, _ctx: PipelineContext): void {}

  createJob(player: unknown, validated: unknown, ctx: PipelineContext): PlayerFormationJob {
    const formationService = resolveFormationService(ctx);
    const job = formationService.createFormationMaintenanceJob(player, validated, ctx);
    markFormationDirty(player, ctx);
    return job;
  }

  buildStartMessages(_player: unknown, _validated: unknown, job: PlayerFormationJob): TechniqueActivityNoticeMessage[] {
    return [buildFormationNotice('quest', 'notice.craft.formation.start', job.formationName)];
  }

  startDirtyDomains(): PersistenceDomain[] {
    return ['active_job'];
  }

  resolveResumePhase(_job: PlayerFormationJob): string {
    return 'maintaining';
  }

  isResolvePoint(job: PlayerFormationJob): boolean {
    return Number(job.remainingTicks) <= 0;
  }

  resolve(player: unknown, job: PlayerFormationJob, ctx: PipelineContext): TechniqueActivityResolveResult {
    return resolveFormationMaintenanceTick(player, job, ctx);
  }

  checkContinueCondition(player: unknown, job: PlayerFormationJob, ctx: PipelineContext): TechniqueActivityConditionCheckResult {
    const formationService = resolveFormationService(ctx);
    return formationService.checkFormationMaintenanceCondition(player, job, ctx);
  }

  computeRefund(_player: unknown, job: PlayerFormationJob): TechniqueActivityRefundResult {
    return {
      items: [],
      spiritStones: 0,
      messages: [buildFormationNotice('system', 'notice.craft.formation.stopped', job.formationName)],
    };
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'profession'];
  }
}

function buildFormationNotice(
  kind: TechniqueActivityNoticeMessage['kind'],
  key: string,
  formationName: unknown,
): TechniqueActivityNoticeMessage {
  return {
    kind,
    key,
    vars: { formationName: normalizeFormationName(formationName) },
    pills: [{ key: 'formationName', style: 'target' }],
  };
}

function normalizeFormationName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '阵法';
}

function resolveFormationService(ctx: PipelineContext): any {
  return (ctx.deps as { worldRuntimeFormationService?: unknown } | null)?.worldRuntimeFormationService;
}

function resolvePlayerId(player: unknown): string {
  const raw = (player as { playerId?: unknown; id?: unknown } | null)?.playerId
    ?? (player as { id?: unknown } | null)?.id;
  return typeof raw === 'string' ? raw.trim() : '';
}

function resolveAnyActiveTechniqueJob(player: unknown): unknown | null {
  const record = player as Record<string, unknown> | null;
  const jobs = [
    record?.alchemyJob,
    record?.forgingJob,
    record?.enhancementJob,
    record?.gatherJob,
    record?.buildingJob,
    record?.formationJob,
    record?.miningJob,
  ];
  return jobs.find((job) => job && Number((job as { remainingTicks?: unknown }).remainingTicks) > 0) ?? null;
}

function enqueueFormationMaintenance(player: unknown, formationInstanceId: string, formationName: string): boolean {
  const record = player as { techniqueActivityQueue?: Array<Record<string, unknown>> } | null;
  if (!record) {
    return false;
  }
  if (!Array.isArray(record.techniqueActivityQueue)) {
    record.techniqueActivityQueue = [];
  }
  const normalizedId = formationInstanceId.trim();
  if (!normalizedId) {
    return false;
  }
  const exists = record.techniqueActivityQueue.some((entry) => entry?.kind === 'formation'
    && typeof entry.payload === 'object'
    && entry.payload !== null
    && (entry.payload as { formationInstanceId?: unknown }).formationInstanceId === normalizedId
    && entry.state === 'pending');
  if (exists) {
    return true;
  }
  if (record.techniqueActivityQueue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
    return false;
  }
  record.techniqueActivityQueue.push({
    queueId: `formation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'formation',
    payload: { formationInstanceId: normalizedId },
    label: formationName ? `维护 ${formationName}` : '阵法维护',
    state: 'pending',
    createdAt: Date.now(),
  });
  return true;
}

function markFormationDirty(player: unknown, ctx: PipelineContext): void {
  const record = player as { dirtyDomains?: { add?: (domain: string) => void } } | null;
  record?.dirtyDomains?.add?.('active_job');
  const runtimeService = (ctx.deps as { playerRuntimeService?: { bumpPersistentRevision?: (player: unknown) => void } } | null)?.playerRuntimeService;
  runtimeService?.bumpPersistentRevision?.(player);
}

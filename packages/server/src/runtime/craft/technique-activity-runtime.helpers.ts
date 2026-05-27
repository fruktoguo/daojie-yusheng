/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 技艺活动运行时工具函数。
 * 提供暂停/恢复/中断的统一处理逻辑和中断提示文本构建，
 * 供管线骨架和各策略复用。
 */
import {
  RUNTIME_TECHNIQUE_ACTIVITY_KINDS,
  type RuntimeTechniqueActivityKind,
  type TechniqueActivityInterruptReason,
} from '@mud/shared';

type TechniqueActivityRuntimePhase = 'brewing' | 'enhancing' | 'mining' | 'maintaining' | 'paused';

interface TechniqueActivityRuntimeJob {
  phase: TechniqueActivityRuntimePhase;
  pausedTicks: number;
  remainingTicks: number;
  totalTicks: number;
  interruptWaitRemainingTicks?: number;
  interruptState?: {
    reason?: TechniqueActivityInterruptReason;
    waitTotalTicks?: number;
    waitRemainingTicks?: number;
    startedAtTick?: number;
  } | null;
}

/**
 * hasTechniqueActivityJob：判断技艺活动 job 是否仍处于进行中。
 * @param job 活动 job。
 * @returns 返回是否仍在进行中。
 */
function hasTechniqueActivityJob(job: TechniqueActivityRuntimeJob | null | undefined): job is TechniqueActivityRuntimeJob {
  return Boolean(job && Number(job.remainingTicks) > 0);
}

/**
 * applyTechniqueActivityInterrupt：统一处理技艺活动的暂停中断。
 * @param job 活动 job。
 * @param pauseTicks 暂停息数。
 * @returns 返回本次实际追加的暂停息数。
 */
function applyTechniqueActivityInterrupt(
  job: TechniqueActivityRuntimeJob | null | undefined,
  pauseTicks: number,
  reason: TechniqueActivityInterruptReason = 'attack',
): number {
  if (!hasTechniqueActivityJob(job)) {
    return 0;
  }
  const normalizedPauseTicks = Math.max(0, Math.floor(Number(pauseTicks) || 0));
  if (normalizedPauseTicks <= 0) {
    return 0;
  }
  const currentPausedTicks = job.phase === 'paused' ? Math.max(0, Math.floor(Number(job.pausedTicks) || 0)) : 0;
  const addedPauseTicks = Math.max(0, normalizedPauseTicks - currentPausedTicks);
  if (addedPauseTicks <= 0) {
    return 0;
  }
  job.phase = 'paused';
  job.pausedTicks = normalizedPauseTicks;
  job.interruptWaitRemainingTicks = normalizedPauseTicks;
  job.interruptState = {
    ...(job.interruptState ?? {}),
    reason,
    waitTotalTicks: normalizedPauseTicks,
    waitRemainingTicks: normalizedPauseTicks,
    startedAtTick: Date.now(),
  };
  return addedPauseTicks;
}

/**
 * advanceTechniqueActivityPause：推进技艺活动暂停倒计时。
 * @param job 活动 job。
 * @param resumePhase 恢复后的阶段。
 * @returns 返回是否恢复到运行态。
 */
function advanceTechniqueActivityPause(
  job: TechniqueActivityRuntimeJob | null | undefined,
  resumePhase: Exclude<TechniqueActivityRuntimePhase, 'paused'>,
): { resumed: boolean } {
  if (!hasTechniqueActivityJob(job) || job.phase !== 'paused') {
    return { resumed: false };
  }
  job.pausedTicks = Math.max(0, Math.floor(Number(job.pausedTicks) || 0) - 1);
  job.interruptWaitRemainingTicks = job.pausedTicks;
  if (job.interruptState) {
    job.interruptState = {
      ...job.interruptState,
      waitRemainingTicks: job.pausedTicks,
    };
  }
  if (job.pausedTicks > 0) {
    return { resumed: false };
  }
  job.phase = resumePhase;
  job.interruptWaitRemainingTicks = 0;
  job.interruptState = null;
  return { resumed: true };
}

/**
 * buildTechniqueActivityInterruptMessage：构建统一技艺中断提示。
 * @param subjectLabel 活动目标名。
 * @param activityLabel 活动名称。
 * @param pauseTicks 暂停息数。
 * @param reason 中断原因。
 * @returns 返回统一提示文本。
 */
function buildTechniqueActivityInterruptMessage(
  subjectLabel: string | null | undefined,
  activityLabel: string | null | undefined,
  pauseTicks: number,
  reason: TechniqueActivityInterruptReason,
): string {
  const normalizedSubjectLabel = typeof subjectLabel === 'string' && subjectLabel.trim() ? subjectLabel.trim() : '当前技艺活动';
  const normalizedActivityLabel = typeof activityLabel === 'string' && activityLabel.trim() ? activityLabel.trim() : '技艺活动';
  const normalizedPauseTicks = Math.max(0, Math.floor(Number(pauseTicks) || 0));
  const reasonLabel = reason === 'move'
    ? '移动'
    : reason === 'cancel'
      ? '手动取消'
      : reason === 'cultivate'
        ? '打坐'
      : '出手';
  return `${normalizedSubjectLabel} 的${normalizedActivityLabel}被${reasonLabel}打断，暂歇 ${normalizedPauseTicks} 息。`;
}

/**
 * listRuntimeTechniqueActivityKinds：返回已接入 runtime 的技艺活动键顺序。
 * @returns 返回活动键列表。
 */
function listRuntimeTechniqueActivityKinds(): RuntimeTechniqueActivityKind[] {
  return [...RUNTIME_TECHNIQUE_ACTIVITY_KINDS];
}

export {
  advanceTechniqueActivityPause,
  applyTechniqueActivityInterrupt,
  buildTechniqueActivityInterruptMessage,
  hasTechniqueActivityJob,
  listRuntimeTechniqueActivityKinds,
};

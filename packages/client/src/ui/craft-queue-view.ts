/**
 * 本文件是客户端 DOM UI 的 craft queue view 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import type { CraftQueueItemView, TechniqueActivityTaskView } from '@mud/shared';
import { formatDisplayInteger } from '../utils/number';
import { t } from './i18n';
import { resolveClientDisplayToken } from './structured-notice-display';

type CraftQueueProgressView = {
  ratio: number;
  label: string;
  detail: string;
};

type CraftQueueDisplayItem = CraftQueueItemView & {
  isActive?: boolean;
  progress?: CraftQueueProgressView;
  interruptProgress?: CraftQueueProgressView | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTicks(ticks: number | undefined): string {
  if (!Number.isFinite(ticks) || Number(ticks) <= 0) {
    return t('craft.workbench.time.zero');
  }
  return t('craft.workbench.time.ticks', {
    ticks: formatDisplayInteger(Math.max(0, Math.round(Number(ticks)))),
  });
}

/** @internal Minimal interface for accessing parent state needed by CraftQueueView */
export interface CraftQueueParent {
  readonly activeMode: string | null;
  readonly alchemyPanel: { state?: { job?: { recipeId: string; jobRunId?: string; startedAt: number; outputItemId: string; quantity: number; completedCount: number; remainingTicks: number; totalTicks: number; workRemainingTicks?: number; workTotalTicks?: number; pausedTicks?: number; interruptWaitRemainingTicks?: number; interruptState?: { waitTotalTicks?: number; waitRemainingTicks?: number } | null; phase: string; jobType?: string; queuedJobs?: CraftQueueItemView[] } | null; queue?: CraftQueueItemView[] } | null } | null;
  readonly enhancementPanel: { state?: { job?: { jobRunId?: string; startedAt: number; targetItemName: string; desiredTargetLevel: number; remainingTicks: number; totalTicks: number; workRemainingTicks?: number; workTotalTicks?: number; pausedTicks?: number; interruptWaitRemainingTicks?: number; interruptState?: { waitTotalTicks?: number; waitRemainingTicks?: number } | null; phase?: string; queuedJobs?: CraftQueueItemView[] } | null; queue?: CraftQueueItemView[] } | null } | null;
  readonly alchemyCatalog: Array<{ recipeId: string; outputName: string }>;
  readonly techniqueActivityTasksSynced: boolean;
  readonly techniqueActivityTasks: TechniqueActivityTaskView[];
}

export class CraftQueueView {
  constructor(private readonly parent: CraftQueueParent) {}

  getCraftQueueKindLabel(kind: CraftQueueItemView['kind']): string {
    if (kind === 'alchemy') {
      return t('craft.workbench.mode.alchemy');
    }
    if (kind === 'forging') {
      return t('craft.workbench.mode.forging');
    }
    if (kind === 'enhancement') {
      return t('craft.workbench.mode.enhancement');
    }
    if (kind === 'gather') {
      return '采集';
    }
    if (kind === 'building') {
      return '建造';
    }
    if (kind === 'mining') {
      return '挖矿';
    }
    if (kind === 'formation') {
      return '阵法维护';
    }
    return t('craft.workbench.mode.technique');
  }

  renderCraftQueueItemMeta(entry: CraftQueueItemView): string {
    if (!entry.quantity) {
      return '';
    }
    if (entry.kind === 'enhancement') {
      return `<em>${escapeHtml(t('craft.workbench.queue.target-level', { level: formatDisplayInteger(entry.quantity) }))}</em>`;
    }
    return `<em>x${formatDisplayInteger(entry.quantity)}</em>`;
  }

  renderCraftQueueItemProgress(entry: CraftQueueDisplayItem): string {
    const progress = entry.progress ?? {
      ratio: 0,
      label: entry.isActive ? '--' : '等待中',
      detail: entry.isActive ? '进度未知' : '等待上一项完成',
    };
    return `
      <div class="craft-queue-progress" data-craft-queue-progress="true">
        <div class="craft-queue-progress-head">
          <span data-craft-queue-progress-detail="true">${escapeHtml(progress.detail)}</span>
          <strong data-craft-queue-progress-label="true">${escapeHtml(progress.label)}</strong>
        </div>
        <div class="craft-queue-progress-bar" aria-hidden="true">
          <div class="craft-queue-progress-fill" data-craft-queue-progress-fill="true" style="width:${(progress.ratio * 100).toFixed(2)}%"></div>
        </div>
      </div>
      <div class="craft-queue-progress craft-queue-progress--interrupt ${entry.interruptProgress ? '' : 'is-hidden'}" data-craft-queue-interrupt-progress="true">
        <div class="craft-queue-progress-head">
          <span data-craft-queue-interrupt-detail="true">${escapeHtml(entry.interruptProgress?.detail ?? '等待恢复')}</span>
          <strong data-craft-queue-interrupt-label="true">${escapeHtml(entry.interruptProgress?.label ?? '')}</strong>
        </div>
        <div class="craft-queue-progress-bar" aria-hidden="true">
          <div class="craft-queue-progress-fill" data-craft-queue-interrupt-fill="true" style="width:${((entry.interruptProgress?.ratio ?? 0) * 100).toFixed(2)}%"></div>
        </div>
      </div>
    `;
  }

  patchCraftQueueProgress(root: HTMLElement): void {
    const queue = this.getCraftQueueSnapshot();
    const items = root.querySelectorAll<HTMLElement>('.craft-queue-item');
    items.forEach((item, index) => {
      const entry = queue[index];
      if (!entry) {
        return;
      }
      const progress = entry.progress ?? {
        ratio: 0,
        label: entry.isActive ? '--' : '等待中',
        detail: entry.isActive ? '进度未知' : '等待上一项完成',
      };
      item.classList.toggle('active', Boolean(entry.isActive));
      const detail = item.querySelector<HTMLElement>('[data-craft-queue-progress-detail="true"]');
      const label = item.querySelector<HTMLElement>('[data-craft-queue-progress-label="true"]');
      const fill = item.querySelector<HTMLElement>('[data-craft-queue-progress-fill="true"]');
      const interrupt = item.querySelector<HTMLElement>('[data-craft-queue-interrupt-progress="true"]');
      const interruptDetail = item.querySelector<HTMLElement>('[data-craft-queue-interrupt-detail="true"]');
      const interruptLabel = item.querySelector<HTMLElement>('[data-craft-queue-interrupt-label="true"]');
      const interruptFill = item.querySelector<HTMLElement>('[data-craft-queue-interrupt-fill="true"]');
      if (detail) {
        detail.textContent = progress.detail;
      }
      if (label) {
        label.textContent = progress.label;
      }
      if (fill) {
        fill.style.width = `${(progress.ratio * 100).toFixed(2)}%`;
      }
      const interruptProgress = entry.interruptProgress ?? null;
      if (interrupt) {
        interrupt.classList.toggle('is-hidden', !interruptProgress);
      }
      if (interruptDetail && interruptProgress) {
        interruptDetail.textContent = interruptProgress.detail;
      }
      if (interruptLabel && interruptProgress) {
        interruptLabel.textContent = interruptProgress.label;
      }
      if (interruptFill && interruptProgress) {
        interruptFill.style.width = `${(interruptProgress.ratio * 100).toFixed(2)}%`;
      }
    });
  }

  getCraftQueueSnapshot(): CraftQueueDisplayItem[] {
    const unifiedTasks = Array.isArray(this.parent.techniqueActivityTasks)
      ? this.parent.techniqueActivityTasks
      : [];
    if (this.parent.techniqueActivityTasksSynced) {
      return unifiedTasks.map((task) => this.buildDisplayItemFromTechniqueTask(task));
    }

    const activeAlchemyJob = this.parent.alchemyPanel?.state?.job ?? null;
    const activeEnhancementJob = this.parent.enhancementPanel?.state?.job ?? null;
    const queue = activeAlchemyJob?.queuedJobs
      ?? activeEnhancementJob?.queuedJobs
      ?? this.parent.alchemyPanel?.state?.queue
      ?? this.parent.enhancementPanel?.state?.queue
      ?? [];
    const active: CraftQueueDisplayItem[] = [];
    if (activeAlchemyJob) {
      const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === activeAlchemyJob.recipeId);
      const jobKind = activeAlchemyJob.jobType === 'forging' ? 'forging' : 'alchemy';
      active.push({
        queueId: activeAlchemyJob.jobRunId ?? `active:${jobKind}:${activeAlchemyJob.startedAt}`,
        kind: jobKind as CraftQueueItemView['kind'],
        label: recipe?.outputName?.trim() || '未知物品',
        quantity: Math.max(1, activeAlchemyJob.quantity - activeAlchemyJob.completedCount),
        createdAt: activeAlchemyJob.startedAt,
        isActive: true,
        progress: this.buildCraftQueueTimeProgress(
          activeAlchemyJob.workRemainingTicks ?? activeAlchemyJob.remainingTicks,
          activeAlchemyJob.workTotalTicks ?? activeAlchemyJob.totalTicks,
          activeAlchemyJob.phase,
        ),
        interruptProgress: this.buildCraftQueueInterruptProgress(activeAlchemyJob),
      });
    } else if (activeEnhancementJob) {
      active.push({
        queueId: activeEnhancementJob.jobRunId ?? `active:enhancement:${activeEnhancementJob.startedAt}`,
        kind: 'enhancement',
        label: activeEnhancementJob.targetItemName,
        quantity: activeEnhancementJob.desiredTargetLevel,
        createdAt: activeEnhancementJob.startedAt,
        isActive: true,
        progress: this.buildCraftQueueTimeProgress(
          activeEnhancementJob.workRemainingTicks ?? activeEnhancementJob.remainingTicks,
          activeEnhancementJob.workTotalTicks ?? activeEnhancementJob.totalTicks,
          activeEnhancementJob.phase,
        ),
        interruptProgress: this.buildCraftQueueInterruptProgress(activeEnhancementJob),
      });
    }
    return [
      ...active,
      ...queue.map((entry) => ({
        ...entry,
        isActive: false,
        progress: {
          ratio: 0,
          label: entry.state === 'sleeping' ? '休眠中' : '等待中',
          detail: entry.sleepReason || (entry.state === 'sleeping' ? '等待条件恢复' : '等待上一项完成'),
        },
      })),
    ];
  }

  private buildDisplayItemFromTechniqueTask(task: TechniqueActivityTaskView): CraftQueueDisplayItem {
    const isActive = task.state === 'running' || task.state === 'interrupt_wait' || task.state === 'completing';
    const taskLabel = resolveClientDisplayToken(task.label);
    const targetLabel = task.targetLabel ? resolveClientDisplayToken(task.targetLabel) : '';
    return {
      queueId: task.cancelRef.jobRunId ?? task.cancelRef.queueId ?? task.id,
      kind: task.kind,
      label: targetLabel ? `${taskLabel} · ${targetLabel}` : taskLabel,
      createdAt: 0,
      isActive,
      state: task.state === 'sleeping' ? 'sleeping' : 'pending',
      sleepReason: task.sleepReason,
      cancelRef: task.cancelRef,
      progress: isActive
        ? this.buildTechniqueTaskProgress(task)
        : {
          ratio: 0,
          label: task.state === 'sleeping' ? '休眠中' : '等待中',
          detail: task.sleepReason || (task.state === 'sleeping' ? '等待条件恢复' : '等待上一项完成'),
        },
      interruptProgress: this.buildTechniqueTaskInterruptProgress(task),
    };
  }

  private buildTechniqueTaskProgress(task: TechniqueActivityTaskView): CraftQueueProgressView {
    const total = Math.max(0, Math.floor(Number(task.workTotalTicks) || 0));
    const remaining = Math.max(0, Math.floor(Number(task.workRemainingTicks) || 0));
    if (total <= 0) {
      return {
        ratio: 0,
        label: '--',
        detail: task.state === 'interrupt_wait' ? '等待恢复' : '进度未知',
      };
    }
    const ratio = Math.max(0, Math.min(1, 1 - (Math.min(remaining, total) / total)));
    const stateLabel = task.state === 'interrupt_wait'
      ? '工作暂停'
      : task.state === 'completing'
        ? '结算中'
        : '进行中';
    return {
      ratio,
      label: `${formatDisplayInteger(Math.round(ratio * 100))}%`,
      detail: `${stateLabel} · 剩余 ${formatTicks(remaining)} / 共 ${formatTicks(total)}`,
    };
  }

  private buildTechniqueTaskInterruptProgress(task: TechniqueActivityTaskView): CraftQueueProgressView | null {
    const remaining = Math.max(0, Math.floor(Number(task.interruptWaitRemainingTicks) || 0));
    if (remaining <= 0) {
      return null;
    }
    const total = Math.max(remaining, 10);
    return {
      ratio: Math.max(0, Math.min(1, 1 - (remaining / total))),
      label: formatTicks(remaining),
      detail: '打断等待',
    };
  }

  buildCraftQueueTimeProgress(remainingTicks: number | undefined, totalTicks: number | undefined, phase?: string): CraftQueueProgressView {
    const total = Math.max(0, Math.floor(Number(totalTicks) || 0));
    const remaining = Math.max(0, Math.floor(Number(remainingTicks) || 0));
    if (total <= 0) {
      return {
        ratio: 0,
        label: '--',
        detail: '进度未知',
      };
    }
    const ratio = Math.max(0, Math.min(1, 1 - (Math.min(remaining, total) / total)));
    const label = `${formatDisplayInteger(Math.round(ratio * 100))}%`;
    const phaseText = phase === 'paused'
      ? '等待恢复'
      : phase === 'brewing'
        ? '制作'
        : phase === 'enhancing'
          ? '强化'
          : '进行中';
    return {
      ratio,
      label,
      detail: `${phaseText} · 剩余 ${formatTicks(remaining)} / 共 ${formatTicks(total)}`,
    };
  }

  buildCraftQueueInterruptProgress(job: {
    pausedTicks?: number;
    interruptWaitRemainingTicks?: number;
    interruptState?: { waitTotalTicks?: number; waitRemainingTicks?: number } | null;
  }): CraftQueueProgressView | null {
    const remaining = Math.max(0, Math.floor(Number(
      job.interruptWaitRemainingTicks
        ?? job.interruptState?.waitRemainingTicks
        ?? job.pausedTicks
        ?? 0,
    ) || 0));
    if (remaining <= 0) {
      return null;
    }
    const total = Math.max(remaining, Math.floor(Number(job.interruptState?.waitTotalTicks ?? 10) || 10));
    const ratio = Math.max(0, Math.min(1, 1 - (remaining / Math.max(1, total))));
    return {
      ratio,
      label: formatTicks(remaining),
      detail: '打断等待',
    };
  }
}

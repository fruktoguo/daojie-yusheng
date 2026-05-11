import type { CraftQueueItemView } from '@mud/shared';
import { formatDisplayInteger } from '../utils/number';
import { t } from './i18n';

type CraftQueueProgressView = {
  ratio: number;
  label: string;
  detail: string;
};

type CraftQueueDisplayItem = CraftQueueItemView & {
  isActive?: boolean;
  progress?: CraftQueueProgressView;
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
  readonly alchemyPanel: { state?: { job?: { recipeId: string; jobRunId?: string; startedAt: number; outputItemId: string; quantity: number; completedCount: number; remainingTicks: number; totalTicks: number; phase: string; jobType?: string; queuedJobs?: CraftQueueItemView[] } | null; queue?: CraftQueueItemView[] } | null } | null;
  readonly enhancementPanel: { state?: { job?: { jobRunId?: string; startedAt: number; targetItemName: string; desiredTargetLevel: number; remainingTicks: number; totalTicks: number; phase?: string; queuedJobs?: CraftQueueItemView[] } | null; queue?: CraftQueueItemView[] } | null } | null;
  readonly alchemyCatalog: Array<{ recipeId: string; outputName: string }>;
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
      if (detail) {
        detail.textContent = progress.detail;
      }
      if (label) {
        label.textContent = progress.label;
      }
      if (fill) {
        fill.style.width = `${(progress.ratio * 100).toFixed(2)}%`;
      }
    });
  }

  getCraftQueueSnapshot(): CraftQueueDisplayItem[] {
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
        label: recipe?.outputName ?? activeAlchemyJob.outputItemId,
        quantity: Math.max(1, activeAlchemyJob.quantity - activeAlchemyJob.completedCount),
        createdAt: activeAlchemyJob.startedAt,
        isActive: true,
        progress: this.buildCraftQueueTimeProgress(activeAlchemyJob.remainingTicks, activeAlchemyJob.totalTicks, activeAlchemyJob.phase),
      });
    } else if (activeEnhancementJob) {
      active.push({
        queueId: activeEnhancementJob.jobRunId ?? `active:enhancement:${activeEnhancementJob.startedAt}`,
        kind: 'enhancement',
        label: activeEnhancementJob.targetItemName,
        quantity: activeEnhancementJob.desiredTargetLevel,
        createdAt: activeEnhancementJob.startedAt,
        isActive: true,
        progress: this.buildCraftQueueTimeProgress(activeEnhancementJob.remainingTicks, activeEnhancementJob.totalTicks, activeEnhancementJob.phase),
      });
    }
    return [
      ...active,
      ...queue.map((entry) => ({
        ...entry,
        isActive: false,
        progress: {
          ratio: 0,
          label: '等待中',
          detail: '等待上一项完成',
        },
      })),
    ];
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
      ? '暂停'
      : phase === 'preparing'
        ? '准备'
        : phase === 'brewing'
          ? '炼制'
          : phase === 'enhancing'
            ? '强化'
            : '进行中';
    return {
      ratio,
      label,
      detail: `${phaseText} · 剩余 ${formatTicks(remaining)} / 共 ${formatTicks(total)}`,
    };
  }
}

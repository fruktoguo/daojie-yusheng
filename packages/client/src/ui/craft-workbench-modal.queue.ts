/**
 * craft-workbench-modal.queue.ts — 从 craft-workbench-modal.ts 拆分的队列面板域方法。
 *
 * 包含制作队列面板渲染、浮动队列面板、队列结构键、职业标题/描述、
 * 队列快照、队列取消分发等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: CraftWorkbenchModal, ...) 形式导出，
 * 由 craft-workbench-modal.ts 主类中的同名方法一行委托调用。
 */
import { type CraftQueueItemView } from '@mud/shared';
import type {
  CraftWorkbenchModal,
  CraftQueueDisplayItem,
  CraftQueueProgressView,
  CraftMode,
} from './craft-workbench-modal';
import { escapeHtml, escapeHtmlAttr, FORGING_INITIAL_RECIPES, normalizeTechniqueActivityKind, replaceElementHtml } from './craft-workbench-modal';
import { FloatingListPanel } from './floating-list-panel';
import {
  isFloatingPanelEnabled,
  updateFloatingPanelPreference,
} from './floating-panel-preferences';
import { formatDisplayInteger } from '../utils/number';
import { t } from './i18n';
export function renderCraftQueuePanelImpl(self: CraftWorkbenchModal, queue = self.getCraftQueueSnapshot()): string {
    return `
      <div class="craft-queue-panel" data-craft-queue-key="${escapeHtml(self.buildCraftQueueStructureKey(queue))}">
        ${self.renderCraftQueuePanelContent(queue)}
      </div>
    `;
  }

export function renderCraftQueuePanelContentImpl(self: CraftWorkbenchModal, queue = self.getCraftQueueSnapshot()): string {
    return `
        <div class="craft-queue-head">
          <span>${escapeHtml(t('craft.workbench.queue.title'))}</span>
          <strong>${formatDisplayInteger(queue.length)}</strong>
        </div>
        <div class="craft-queue-list">
          ${queue.length > 0
            ? queue.map((entry, index) => `
              <div class="craft-queue-item ${entry.isActive ? 'active' : ''}" data-craft-queue-entry="${escapeHtmlAttr(entry.queueId)}">
                <span>${escapeHtml(self.getCraftQueueKindLabel(entry.kind))} · ${escapeHtml(self.getCraftQueueStatusLabel(entry, index))}</span>
                <strong>${escapeHtml(entry.label)}</strong>
                ${self.renderCraftQueueItemMeta(entry)}
                ${self.renderCraftQueueItemProgress(entry)}
                <button
                  class="small-btn ghost craft-queue-cancel"
                  type="button"
                  data-craft-action="cancel-queue-entry"
                  data-kind="${escapeHtmlAttr(entry.cancelRef?.kind ?? entry.kind)}"
                  ${entry.cancelRef?.jobRunId || entry.isActive ? `data-job-run-id="${escapeHtmlAttr(entry.cancelRef?.jobRunId ?? entry.queueId)}"` : ''}
                  ${entry.cancelRef?.queueId || !entry.isActive ? `data-queue-id="${escapeHtmlAttr(entry.cancelRef?.queueId ?? entry.queueId)}"` : ''}
                  ${entry.cancelRef?.techId ? `data-tech-id="${escapeHtmlAttr(entry.cancelRef.techId)}"` : ''}
                >取消</button>
              </div>
            `).join('')
            : `<div class="craft-queue-empty">${escapeHtml(t('craft.workbench.queue.empty'))}</div>`}
        </div>
    `;
  }

export function getCraftQueueKindLabelImpl(self: CraftWorkbenchModal, kind: CraftQueueItemView['kind']): string {
    return self.queueView.getCraftQueueKindLabel(kind);
  }

export function getCraftQueueStatusLabelImpl(self: CraftWorkbenchModal, entry: CraftQueueDisplayItem, index: number): string {
    if (entry.isActive) {
      return t('craft.workbench.queue.active');
    }
    if (entry.state === 'sleeping') {
      return '休眠中';
    }
    return t('craft.workbench.queue.pending', { index: formatDisplayInteger(Math.max(1, index)) });
  }

export function renderCraftQueueItemMetaImpl(self: CraftWorkbenchModal, entry: CraftQueueItemView): string {
    return self.queueView.renderCraftQueueItemMeta(entry);
  }

export function renderCraftQueueItemProgressImpl(self: CraftWorkbenchModal, entry: CraftQueueDisplayItem): string {
    return self.queueView.renderCraftQueueItemProgress(entry);
  }

export function patchCraftQueueProgressImpl(self: CraftWorkbenchModal, root: HTMLElement): void {
    self.queueView.patchCraftQueueProgress(root);
  }

export function patchCraftQueuePanelImpl(self: CraftWorkbenchModal, root: HTMLElement): boolean {
    const queuePanel = root.querySelector<HTMLElement>('.craft-queue-panel');
    if (!queuePanel) {
      return false;
    }
    const queue = self.getCraftQueueSnapshot();
    const queueKey = self.buildCraftQueueStructureKey(queue);
    if (queuePanel.dataset.craftQueueKey !== queueKey) {
      replaceElementHtml(queuePanel, self.renderCraftQueuePanelContent(queue));
      queuePanel.dataset.craftQueueKey = queueKey;
    }
    self.patchCraftQueueProgress(queuePanel);
    self.refreshQueueFloatingPanel();
    return true;
  }

export function refreshQueueFloatingPanelImpl(self: CraftWorkbenchModal): void {
    if (!isFloatingPanelEnabled('actionQueue')) {
      self.queueFloatingPanel?.setTransientHidden(true);
      return;
    }
    const queue = self.getCraftQueueSnapshot();
    if (queue.length === 0) {
      self.queueFloatingPanel?.setTransientHidden(true);
      self.queueFloatingEvents?.abort();
      self.queueFloatingEvents = null;
      return;
    }
    const panel = self.ensureQueueFloatingPanel();
    panel.setClosed(false);
    const queueKey = self.buildFloatingQueueStructureKey(queue);
    if (panel.getBodyKey() !== queueKey) {
      panel.updateContent(self.renderFloatingQueueList(queue));
      panel.setBodyKey(queueKey);
    }
    self.patchFloatingQueueProgress(panel.body, queue);
    self.bindQueueFloatingEvents(panel);
    panel.setTransientHidden(false);
  }

export function ensureQueueFloatingPanelImpl(self: CraftWorkbenchModal): FloatingListPanel {
    if (!self.queueFloatingPanel) {
      self.queueFloatingPanel = new FloatingListPanel({
        id: 'floating-action-queue',
        title: '行动队列',
        storageKey: 'mud:floating-action-queue:v2',
        className: 'floating-list-panel--queue',
        defaultLeft: Math.max(12, window.innerWidth - 300),
        defaultTop: 420,
        minWidth: 220,
        maxWidth: 300,
        onClose: () => updateFloatingPanelPreference('actionQueue', false),
      });
    }
    return self.queueFloatingPanel;
  }

export function buildFloatingQueueStructureKeyImpl(self: CraftWorkbenchModal, queue = self.getCraftQueueSnapshot()): string {
    return queue
      .map((entry) => [
        entry.queueId,
        entry.kind,
        entry.label,
        entry.quantity ?? '',
        entry.isActive ? 'active' : 'idle',
        entry.state ?? '',
        entry.cancelRef?.kind ?? '',
        entry.cancelRef?.jobRunId ?? '',
        entry.cancelRef?.queueId ?? '',
        entry.cancelRef?.techId ?? '',
      ].join(':'))
      .join('|');
  }

export function renderFloatingQueueListImpl(self: CraftWorkbenchModal, queue = self.getCraftQueueSnapshot()): string {
    const reorderableQueueIds = queue
      .filter((entry) => !entry.isActive)
      .map((entry) => entry.cancelRef?.queueId ?? entry.queueId)
      .filter((queueId) => Boolean(queueId));
    const queuePositionById = new Map(reorderableQueueIds.map((queueId, index) => [queueId, index] as const));
    return `
      <div class="floating-job-list">
        ${queue.map((entry) => {
          const queueId = entry.cancelRef?.queueId ?? (entry.isActive ? '' : entry.queueId);
          return self.renderFloatingQueueItem(
            entry,
            queueId ? (queuePositionById.get(queueId) ?? null) : null,
            reorderableQueueIds.length,
          );
        }).join('')}
      </div>
    `;
  }

export function renderFloatingQueueItemImpl(self: CraftWorkbenchModal, 
    entry: CraftQueueDisplayItem,
    queuePosition: number | null,
    reorderableCount: number,
  ): string {
    const progress = self.resolveFloatingQueueProgress(entry);
    const jobRunId = entry.cancelRef?.jobRunId ?? (entry.isActive ? entry.queueId : '');
    const queueId = entry.cancelRef?.queueId ?? (entry.isActive ? '' : entry.queueId);
    const techId = entry.cancelRef?.techId ?? '';
    const kind = entry.cancelRef?.kind ?? entry.kind;
    const canReorder = queuePosition !== null && Boolean(queueId);
    const canMoveToTop = canReorder && queuePosition > 0;
    const canMoveDown = canReorder && queuePosition < reorderableCount - 1;
    const canRemove = Boolean(jobRunId || queueId || techId);
    const actionData = `
      data-kind="${escapeHtmlAttr(kind)}"
      ${jobRunId ? `data-job-run-id="${escapeHtmlAttr(jobRunId)}"` : ''}
      ${queueId ? `data-queue-id="${escapeHtmlAttr(queueId)}"` : ''}
      ${techId ? `data-tech-id="${escapeHtmlAttr(techId)}"` : ''}
    `;
    return `
      <div
        class="floating-job-item${entry.isActive ? ' active' : ''}"
        data-floating-job-id="${escapeHtmlAttr(entry.queueId)}"
      >
        <div class="floating-job-main">
          <span class="floating-job-name">${escapeHtml(entry.label)}</span>
          ${entry.quantity ? `<span class="floating-job-count">x${formatDisplayInteger(entry.quantity)}</span>` : ''}
          <strong class="floating-job-progress" data-floating-job-progress="true">${escapeHtml(progress.label)}</strong>
        </div>
        <div class="floating-job-bar" aria-hidden="true">
          <div class="floating-job-fill" data-floating-job-fill="true" style="width:${(progress.ratio * 100).toFixed(2)}%"></div>
        </div>
        <div class="floating-job-actions" role="group" aria-label="${escapeHtmlAttr(`${entry.label} 快捷操作`)}">
          <button
            class="floating-job-action"
            type="button"
            data-floating-queue-action="move_to_top"
            ${actionData}
            aria-label="${escapeHtmlAttr(`将 ${entry.label} 移至等待队首`)}"
            title="移动到顶部"
            ${canMoveToTop ? '' : 'disabled'}
          >置顶</button>
          <button
            class="floating-job-action"
            type="button"
            data-floating-queue-action="move_down"
            ${actionData}
            aria-label="${escapeHtmlAttr(`将 ${entry.label} 向下移动一位`)}"
            title="向下一个"
            ${canMoveDown ? '' : 'disabled'}
          >下移</button>
          <button
            class="floating-job-action danger"
            type="button"
            data-floating-queue-action="remove"
            ${actionData}
            aria-label="${escapeHtmlAttr(`移除 ${entry.label}`)}"
            title="移除任务"
            ${canRemove ? '' : 'disabled'}
          >移除</button>
        </div>
      </div>
    `;
  }

export function resolveFloatingQueueProgressImpl(self: CraftWorkbenchModal, entry: CraftQueueDisplayItem): CraftQueueProgressView {
    const progress = entry.progress ?? {
      ratio: 0,
      label: entry.isActive ? '--' : '等待中',
      detail: '',
    };
    return {
      ...progress,
      ratio: Math.max(0, Math.min(1, progress.ratio)),
    };
  }

export function patchFloatingQueueProgressImpl(self: CraftWorkbenchModal, root: HTMLElement, queue = self.getCraftQueueSnapshot()): void {
    const entriesById = new Map(queue.map((entry) => [entry.queueId, entry] as const));
    root.querySelectorAll<HTMLElement>('[data-floating-job-id]').forEach((item) => {
      const entry = entriesById.get(item.dataset.floatingJobId ?? '');
      if (!entry) {
        return;
      }
      const active = Boolean(entry.isActive);
      if (item.classList.contains('active') !== active) {
        item.classList.toggle('active', active);
      }
      const progress = self.resolveFloatingQueueProgress(entry);
      const progressLabel = item.querySelector<HTMLElement>('[data-floating-job-progress="true"]');
      if (progressLabel && progressLabel.textContent !== progress.label) {
        progressLabel.textContent = progress.label;
      }
      const fill = item.querySelector<HTMLElement>('[data-floating-job-fill="true"]');
      const fillWidth = `${(progress.ratio * 100).toFixed(2)}%`;
      if (fill && fill.style.width !== fillWidth) {
        fill.style.width = fillWidth;
      }
    });
  }

export function bindQueueFloatingEventsImpl(self: CraftWorkbenchModal, panel: FloatingListPanel): void {
    if (self.queueFloatingEvents) {
      return;
    }
    const controller = new AbortController();
    self.queueFloatingEvents = controller;
    panel.body.addEventListener('click', (event) => {
      const source = event.target instanceof Element ? event.target : null;
      const target = source?.closest<HTMLButtonElement>('[data-floating-queue-action]') ?? null;
      if (!target || target.disabled) {
        return;
      }
      const action = target.dataset.floatingQueueAction;
      if (action === 'remove') {
        self.dispatchQueueCancellation(target);
        return;
      }
      const queueId = (target.dataset.queueId ?? '').trim();
      if (!queueId || (action !== 'move_to_top' && action !== 'move_down')) {
        return;
      }
      self.callbacks?.onReorderTechniqueActivityQueue(queueId, action);
    }, { signal: controller.signal });
  }

export function buildCraftHeaderKeyImpl(self: CraftWorkbenchModal): string {
    return [
      self.activeMode ?? 'none',
      self.alchemySkillLevel,
      self.forgingSkillLevel,
      self.enhancementSkillLevel,
      self.buildCraftQueueStructureKey(),
    ].join('::');
  }

export function buildCraftQueueStructureKeyImpl(self: CraftWorkbenchModal, queue = self.getCraftQueueSnapshot()): string {
    return queue
      .map((entry) => [
        entry.queueId,
        entry.kind,
        entry.label,
        entry.quantity ?? '',
        entry.state ?? '',
        entry.isActive ? 'active' : 'idle',
        entry.cancelRef?.jobRunId ?? '',
        entry.cancelRef?.queueId ?? '',
        entry.cancelRef?.techId ?? '',
      ].join(':'))
      .join('|');
  }

export function buildCraftTabsKeyImpl(self: CraftWorkbenchModal): string {
    return [
      self.activeMode ?? 'none',
      self.alchemySkillLevel,
      self.forgingSkillLevel,
      self.enhancementSkillLevel,
      self.inventory.revision ?? 0,
    ].join(':');
  }

export function renderCraftModeTabsImpl(self: CraftWorkbenchModal): string {
    const tabs: Array<{ mode: Exclude<CraftMode, null>; label: string; note: string }> = [
      { mode: 'alchemy', label: t('craft.workbench.mode.alchemy'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(self.alchemySkillLevel) }) },
      { mode: 'forging', label: t('craft.workbench.mode.forging'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(self.forgingSkillLevel) }) },
      { mode: 'enhancement', label: t('craft.workbench.mode.enhancement'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(self.enhancementSkillLevel) }) },
      { mode: 'transmission', label: '传法', note: '功法' },
    ];
    return tabs.map((tab) => `
      <button class="craft-mode-tab ${self.activeMode === tab.mode ? 'active' : ''}" type="button" data-craft-action="switch-craft-mode" data-mode="${tab.mode}" data-guided-tour-craft-mode="${tab.mode}">
        <span>${escapeHtml(tab.label)}</span>
        <em>${escapeHtml(tab.note)}</em>
      </button>
    `).join('');
  }

export function renderForgingPlaceholderImpl(self: CraftWorkbenchModal): string {
    return `
      <div class="craft-placeholder-panel">
        <div class="craft-placeholder-title">${escapeHtml(t('craft.workbench.forging.beginner-recipes'))}</div>
        <div class="craft-placeholder-text">${escapeHtml(t('craft.workbench.forging.placeholder.text'))}</div>
        <div class="craft-queue-list">
          ${FORGING_INITIAL_RECIPES.map((recipe) => `
            <div class="craft-queue-item">
              <span>${escapeHtml(recipe.note)}</span>
              <strong>${escapeHtml(recipe.outputName)}</strong>
              <em>未知物品</em>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

export function getCraftProfessionTitleImpl(self: CraftWorkbenchModal): string {
    if (self.activeMode === 'alchemy') {
      return t('craft.workbench.mode.alchemy');
    }
    if (self.activeMode === 'forging') {
      return t('craft.workbench.mode.forging');
    }
    if (self.activeMode === 'enhancement') {
      return t('craft.workbench.mode.enhancement');
    }
    if (self.activeMode === 'transmission') {
      return '传法';
    }
    if (self.activeMode === 'technique_refining') {
      return self.transmissionView.isTechniqueAggregationOpen() ? '统法台' : '炼法台';
    }
    return t('craft.workbench.mode.craft');
  }

export function getCraftProfessionDescriptionImpl(self: CraftWorkbenchModal): string {
    if (self.activeMode === 'alchemy') {
      return t('craft.workbench.profession.description.alchemy');
    }
    if (self.activeMode === 'forging') {
      return t('craft.workbench.profession.description.forging');
    }
    if (self.activeMode === 'enhancement') {
      return t('craft.workbench.profession.description.enhancement');
    }
    if (self.activeMode === 'transmission') {
      return '用于功法领悟与传授。';
    }
    if (self.activeMode === 'technique_refining') {
      return self.transmissionView.isTechniqueAggregationOpen()
        ? '承载一脉功法，并依权限向有缘之人开放参阅与修订。'
        : '分解功法书为残页，也可以用残页抄录指定层数的功法书。';
    }
    return t('craft.workbench.profession.description.default');
  }

export function getCraftQueueSnapshotImpl(self: CraftWorkbenchModal): CraftQueueDisplayItem[] {
    return self.queueView.getCraftQueueSnapshot();
  }

export function dispatchQueueCancellationImpl(self: CraftWorkbenchModal, target: HTMLElement): void {
    const kind = normalizeTechniqueActivityKind(target.dataset.kind);
    const jobRunId = (target.dataset.jobRunId ?? '').trim();
    const queueId = (target.dataset.queueId ?? '').trim();
    const techId = (target.dataset.techId ?? '').trim();
    if (!jobRunId && !queueId && !techId) {
      return;
    }
    self.callbacks?.onCancelTechniqueActivity({
      kind: target.dataset.kind === 'transmission' ? 'transmission' : kind,
      ...(jobRunId ? { jobRunId } : {}),
      ...(queueId ? { queueId } : {}),
      ...(techId ? { techId } : {}),
    });
  }


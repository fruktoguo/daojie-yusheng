import type {
  C2S_StartEnhancement,
  EnhancementTargetRef,
  ItemStack,
  PlayerEnhancementRecord,
  S2C_EnhancementPanel,
  SyncedEnhancementCandidateView,
  SyncedEnhancementPanelState,
} from '@mud/shared';
import {
  MAX_ENHANCE_LEVEL,
  applyEquipmentAttributeEffectivenessToItemStack,
  computeEnhancementAdjustedSuccessRate,
  normalizeEnhanceLevel,
} from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
import { getEquipSlotLabel, getItemTypeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplayPercent } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { describeEquipmentBonuses } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { t } from './i18n';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';
import { getItemAffixTypeLabel, getItemDecorClassName, getItemDisplayMeta } from './item-display';
import { readEnhancementHistoryFromStorage } from './enhancement-history-storage';

type EnhancementJobView = NonNullable<NonNullable<S2C_EnhancementPanel['state']>['job']>;
type EnhancementItemView = SyncedEnhancementCandidateView['item'];

type EnhancementViewState = {
  targetLevelValue: string | null;
  protectionStartValue: string | null;
  protectionValue: string | null;
  pickerTop: number;
  historyTop: number;
  selectedTargetKey: string | null;
};

type StoredEnhancementHistoryStateV1 = {
  version: 1;
  totals: PlayerEnhancementRecord[];
  sessionRecord: PlayerEnhancementRecord | null;
};

type StoredEnhancementHistoryState = {
  version: 2;
  totals: PlayerEnhancementRecord[];
  sessions: PlayerEnhancementRecord[];
  sessionRecord: PlayerEnhancementRecord | null;
};

const ENHANCEMENT_HISTORY_STORAGE_KEY = 'mud:enhancement-history:v2';
const UNKNOWN_ITEM_NAME = t('craft.enhancement.unknown-item');

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function formatTicks(ticks: number | undefined): string {
  if (!Number.isFinite(ticks) || Number(ticks) <= 0) {
    return t('craft.workbench.time.zero');
  }
  return t('craft.workbench.time.ticks', {
    ticks: formatDisplayInteger(Math.max(0, Math.round(Number(ticks)))),
  });
}

function formatEnhancementPercent(rate: number | undefined): string {
  const normalized = typeof rate === 'number' && Number.isFinite(rate) ? rate : 0;
  return formatDisplayPercent(normalized * 100, {
    maximumFractionDigits: 1,
    compactThreshold: Number.POSITIVE_INFINITY,
  });
}

function buildEnhancementTargetKey(ref: EnhancementTargetRef): string {
  return ref.source === 'equipment'
    ? `equipment:${ref.slot ?? ''}`
    : `inventory:${ref.slotIndex ?? -1}`;
}


function buildBaseEnhancementPreviewItem(item: EnhancementItemView): ItemStack {
  const template = getLocalItemTemplate(item.itemId);
  const source = item as Partial<ItemStack>;
  return {
    ...item,
    name: template?.name ?? item.name ?? UNKNOWN_ITEM_NAME,
    type: template?.type ?? item.type ?? 'equipment',
    count: Math.max(1, Math.floor(Number(item.count) || 1)),
    desc: template?.desc ?? source.desc ?? '',
    groundLabel: template?.groundLabel ?? source.groundLabel,
    level: template?.level ?? item.level,
    grade: template?.grade ?? item.grade,
    equipSlot: template?.equipSlot ?? item.equipSlot,
    equipAttrs: template?.equipAttrs ?? source.equipAttrs,
    equipStats: template?.equipStats ?? source.equipStats,
    equipValueStats: template?.equipValueStats ?? source.equipValueStats,
    effects: template?.effects ?? source.effects,
    alchemySuccessRate: template?.alchemySuccessRate ?? source.alchemySuccessRate,
    alchemySpeedRate: template?.alchemySpeedRate ?? source.alchemySpeedRate,
    enhancementSuccessRate: template?.enhancementSuccessRate ?? source.enhancementSuccessRate,
    enhancementSpeedRate: template?.enhancementSpeedRate ?? source.enhancementSpeedRate,
    miningDamageRate: template?.miningDamageRate ?? source.miningDamageRate,
    enhanceLevel: 0,
  };
}

function getEffectiveEnhancementToolSuccessRate(weapon: ItemStack | null | undefined, playerRealmLv: number | null): number {
  if (!weapon) {
    return 0;
  }
  const effectiveWeapon = applyEquipmentAttributeEffectivenessToItemStack(weapon, playerRealmLv);
  return Number.isFinite(effectiveWeapon.enhancementSuccessRate)
    ? Number(effectiveWeapon.enhancementSuccessRate)
    : 0;
}

function getItemNameClass(name: string): string {
  const length = [...(name || '')].length;
  if (length >= 7) {
    return 'inventory-cell-name--tiny';
  }
  if (length >= 5) {
    return 'inventory-cell-name--compact';
  }
  return '';
}

function cloneEnhancementRecord(record: PlayerEnhancementRecord): PlayerEnhancementRecord {
  return {
    itemId: record.itemId,
    highestLevel: normalizeEnhanceLevel(record.highestLevel),
    levels: [...(record.levels ?? [])]
      .map((entry) => ({
        targetLevel: Math.max(1, Math.floor(Number(entry.targetLevel) || 1)),
        successCount: Math.max(0, Math.floor(Number(entry.successCount) || 0)),
        failureCount: Math.max(0, Math.floor(Number(entry.failureCount) || 0)),
      }))
      .sort((left, right) => left.targetLevel - right.targetLevel),
    actionStartedAt: Number.isFinite(record.actionStartedAt) && Number(record.actionStartedAt) > 0
      ? Math.floor(Number(record.actionStartedAt))
      : undefined,
    actionEndedAt: Number.isFinite(record.actionEndedAt) && Number(record.actionEndedAt) > 0
      ? Math.floor(Number(record.actionEndedAt))
      : undefined,
    startLevel: Number.isFinite(record.startLevel) ? normalizeEnhanceLevel(record.startLevel) : undefined,
    initialTargetLevel: Number.isFinite(record.initialTargetLevel)
      ? Math.max(1, Math.floor(Number(record.initialTargetLevel)))
      : undefined,
    desiredTargetLevel: Number.isFinite(record.desiredTargetLevel)
      ? Math.max(1, Math.floor(Number(record.desiredTargetLevel)))
      : undefined,
    protectionStartLevel: Number.isFinite(record.protectionStartLevel)
      ? Math.max(2, Math.floor(Number(record.protectionStartLevel)))
      : undefined,
    status: record.status === 'completed' || record.status === 'cancelled' || record.status === 'stopped' || record.status === 'in_progress'
      ? record.status
      : undefined,
  };
}

function normalizeEnhancementRecordList(records: PlayerEnhancementRecord[] | null | undefined): PlayerEnhancementRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }
  return records
    .filter((entry): entry is PlayerEnhancementRecord => Boolean(entry?.itemId))
    .map((entry) => cloneEnhancementRecord(entry));
}

function getEnhancementHistorySessionKey(record: Pick<PlayerEnhancementRecord, 'itemId' | 'actionStartedAt'>): string {
  return `${record.itemId}:${Math.max(0, Math.floor(Number(record.actionStartedAt) || 0))}`;
}

function isEnhancementHistorySessionRecord(record: PlayerEnhancementRecord | null | undefined): boolean {
  return Boolean(record && Number.isFinite(record.actionStartedAt) && Number(record.actionStartedAt) > 0);
}

function formatHistoryDateTime(timestamp: number | undefined): string {
  if (!Number.isFinite(timestamp) || Number(timestamp) <= 0) {
    return t('craft.workbench.history.time.unknown');
  }
  return new Date(Number(timestamp)).toLocaleString('zh-CN');
}

function getEnhancementFormulaTooltipLines(): string[] {
  return [
    t('craft.workbench.enhancement.formula.line.settle'),
    t('craft.workbench.enhancement.formula.line.base-rate'),
    t('craft.workbench.enhancement.formula.line.low-skill'),
    t('craft.workbench.enhancement.formula.line.high-skill'),
    t('craft.workbench.enhancement.formula.line.final-negative'),
    t('craft.workbench.enhancement.formula.line.final-low'),
    t('craft.workbench.enhancement.formula.line.final-high'),
    t('craft.workbench.enhancement.formula.line.duration'),
    t('craft.workbench.enhancement.formula.line.spirit-stone'),
  ];
}

function formatEnhancementRecordStatus(status: PlayerEnhancementRecord['status']): string {
  if (status === 'completed') return t('craft.workbench.enhancement.record.status.completed');
  if (status === 'cancelled') return t('craft.workbench.enhancement.record.status.cancelled');
  if (status === 'stopped') return t('craft.workbench.enhancement.record.status.stopped');
  if (status === 'in_progress') return t('craft.workbench.enhancement.record.status.in-progress');
  return t('craft.workbench.enhancement.record.status.archived');
}

/** @internal Interface for accessing parent state needed by CraftEnhancementView */
export interface CraftEnhancementParent {
  readonly activeMode: string | null;
  readonly loading: boolean;
  readonly enhancementPanel: S2C_EnhancementPanel | null;
  readonly enhancementSkillLevel: number;
  readonly playerRealmLv: number | null;
  readonly inventory: { items: Array<{ itemId: string; count: number }> };
  readonly equipment: { weapon?: ItemStack | null };
  selectedEnhancementTargetKey: string | null;
  selectedEnhancementTargetLevel: number | null;
  selectedEnhancementProtectionKey: string | null;
  selectedEnhancementProtectionStartLevel: number | null;
  enhancementResponseError: string | null;
  enhancementHistoryExpanded: boolean;
  enhancementProtectionExpanded: boolean;
  activeEnhancementHistoryItemId: string | null;
  activeEnhancementHistorySessionKey: string | null;
  localEnhancementHistoryLoaded: boolean;
  localEnhancementHistoryRecords: Map<string, PlayerEnhancementRecord>;
  localEnhancementHistorySessions: PlayerEnhancementRecord[];
  lastServerEnhancementSessionRecord: PlayerEnhancementRecord | null;
  readonly MODAL_OWNER: string;
  render(): void;
  callbacks: {
    onRequestEnhancement?: () => void;
    onStartEnhancement?: (payload: C2S_StartEnhancement) => void;
    onCancelEnhancement?: () => void;
  } | null;
}


export class CraftEnhancementView {
  readonly enhancementFormulaTooltip = new FloatingTooltip();

  constructor(private readonly parent: CraftEnhancementParent) {}

  // --- State accessors ---

  private getEnhancementPanelState(): SyncedEnhancementPanelState | null {
    return this.parent.enhancementPanel?.state ?? null;
  }

  private getActiveEnhancementJob(): EnhancementJobView | null {
    return this.getEnhancementPanelState()?.job ?? null;
  }

  private getSelectedEnhancementCandidate(): SyncedEnhancementCandidateView | null {
    const candidates = this.parent.enhancementPanel?.state?.candidates ?? [];
    return candidates.find((entry) => buildEnhancementTargetKey(entry.ref) === this.parent.selectedEnhancementTargetKey) ?? null;
  }

  private isCompactEnhancementLayout(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  }

  private getSelectedEnhancementProtection(selected: SyncedEnhancementCandidateView | null): { ref: EnhancementTargetRef; item: EnhancementItemView } | null {
    if (!selected || !this.parent.selectedEnhancementProtectionKey) {
      return null;
    }
    if (
      this.parent.selectedEnhancementProtectionKey === 'self'
      && selected.allowSelfProtection
      && selected.ref.source === 'inventory'
      && Math.max(0, Math.floor(selected.item.count ?? 0)) > 1
    ) {
      return { ref: selected.ref, item: selected.item };
    }
    return selected.protectionCandidates.find((entry) => buildEnhancementTargetKey(entry.ref) === this.parent.selectedEnhancementProtectionKey) ?? null;
  }

  private getSelectedEnhancementTargetLevel(selected: SyncedEnhancementCandidateView | null): number | null {
    if (!selected) {
      return null;
    }
    const minLevel = selected.currentLevel + 1;
    return Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, Math.floor(Number(this.parent.selectedEnhancementTargetLevel) || minLevel)));
  }

  private getSelectedEnhancementProtectionStartLevel(selected: SyncedEnhancementCandidateView | null): number | null {
    if (!selected || !this.parent.selectedEnhancementProtectionKey) {
      return null;
    }
    const minLevel = 2;
    const maxLevel = this.getSelectedEnhancementTargetLevel(selected) ?? Math.max(minLevel, selected.currentLevel + 1);
    return Math.max(minLevel, Math.min(maxLevel, Math.floor(Number(this.parent.selectedEnhancementProtectionStartLevel) || minLevel)));
  }

  private getAlchemyInventoryCount(itemId: string): number {
    return this.parent.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private getEnhancementToolbarNoteText(): string {
    const state = this.parent.enhancementPanel?.state ?? null;
    return state?.job
      ? `强化队列进行中，剩余 ${formatTicks(state.job.remainingTicks)} / ${formatTicks(state.job.totalTicks)}`
      : `角色强化等级 Lv.${formatDisplayInteger(state?.enhancementSkillLevel ?? this.parent.enhancementSkillLevel)} · 当前可强化装备 ${formatDisplayInteger(state?.candidates.length ?? 0)} 件`;
  }

  private getEnhancementJobPatchKey(job: EnhancementJobView | null): string {
    if (!job) {
      return 'empty';
    }
    return `${job.jobRunId ?? job.startedAt}:${job.targetItemId}:${job.currentLevel}:${job.targetLevel}:${job.desiredTargetLevel}:${job.totalTicks}`;
  }

  private buildEnhancementIdleWorkbenchKey(): string {
    const selected = this.getSelectedEnhancementCandidate();
    const selectedTargetLevel = this.getSelectedEnhancementTargetLevel(selected);
    const protectionCandidatesKey = (selected?.protectionCandidates ?? [])
      .map((entry) => [
        buildEnhancementTargetKey(entry.ref),
        entry.item.itemId,
        entry.item.count ?? 1,
        normalizeEnhanceLevel(entry.item.enhanceLevel),
      ].join('/'))
      .join('|');
    return [
      'idle',
      this.isCompactEnhancementLayout() ? 'compact' : 'wide',
      this.parent.selectedEnhancementTargetKey ?? '',
      selected?.item.itemId ?? '',
      selected?.item.count ?? '',
      selected?.currentLevel ?? '',
      selected?.successRate ?? '',
      selected?.spiritStoneCost ?? '',
      selected?.durationTicks ?? '',
      selected?.materials.map((entry) => `${entry.itemId}:${entry.count}`).join('|') ?? '',
      this.parent.selectedEnhancementTargetLevel ?? '',
      selectedTargetLevel ?? '',
      this.parent.selectedEnhancementProtectionKey ?? '',
      this.parent.selectedEnhancementProtectionStartLevel ?? '',
      this.parent.enhancementHistoryExpanded ? 'history-open' : 'history-closed',
      this.parent.enhancementProtectionExpanded ? 'protection-open' : 'protection-closed',
      protectionCandidatesKey,
    ].join('::');
  }


  // --- Stable key and patching ---

  buildEnhancementStableRenderKey(): string {
    const state = this.getEnhancementPanelState();
    const job = state?.job ?? null;
    const candidateKey = (state?.candidates ?? [])
      .map((entry) => [
        buildEnhancementTargetKey(entry.ref),
        entry.item.itemId,
        entry.item.count ?? 1,
        entry.currentLevel,
        entry.nextLevel,
        entry.spiritStoneCost,
        entry.durationTicks,
        entry.materials.map((m) => `${m.itemId}:${m.count}:${m.ownedCount}`).join(','),
        entry.protectionCandidates.length,
      ].join('/'))
      .join('|');
    const recordKey = (state?.records ?? [])
      .map((record) => `${record.itemId}:${record.highestLevel}:${record.levels.map((l) => `${l.targetLevel}:${l.successCount}:${l.failureCount}`).join(',')}`)
      .join('|');
    return [
      this.parent.enhancementResponseError ?? '',
      state?.enhancementSkillLevel ?? this.parent.enhancementSkillLevel,
      job ? this.getEnhancementJobPatchKey(job) : 'idle',
      this.parent.selectedEnhancementTargetKey ?? '',
      this.parent.selectedEnhancementTargetLevel ?? '',
      this.parent.selectedEnhancementProtectionKey ?? '',
      this.parent.selectedEnhancementProtectionStartLevel ?? '',
      this.parent.enhancementHistoryExpanded ? 'history-open' : 'history-closed',
      this.parent.enhancementProtectionExpanded ? 'protection-open' : 'protection-closed',
      candidateKey,
      recordKey,
    ].join('::');
  }

  tryPatchEnhancementBody(body: HTMLElement): boolean {
    const shell = body.querySelector<HTMLElement>('.enhancement-modal-shell');
    const toolbar = body.querySelector<HTMLElement>('.enhancement-toolbar');
    const workbench = body.querySelector<HTMLElement>('.enhancement-workbench');
    if (!shell || !toolbar || !workbench) {
      return false;
    }
    this.patchEnhancementToolbar(toolbar);
    const activeJob = this.getActiveEnhancementJob();
    const currentJobGrid = workbench.querySelector<HTMLElement>('[data-enhancement-job-key]');
    const nextJobKey = this.getEnhancementJobPatchKey(activeJob);
    if (activeJob && currentJobGrid?.dataset.enhancementJobKey === nextJobKey) {
      this.patchEnhancementActiveJob(workbench, activeJob);
      return true;
    }
    if (activeJob) {
      return false;
    }
    if (!activeJob && !currentJobGrid) {
      const currentIdleGrid = workbench.querySelector<HTMLElement>('[data-enhancement-idle-key]');
      const nextIdleKey = this.buildEnhancementIdleWorkbenchKey();
      if (!currentIdleGrid || currentIdleGrid.dataset.enhancementIdleKey !== nextIdleKey) {
        return false;
      }
      this.patchEnhancementIdleWorkbench(workbench);
      shell.dataset.enhancementStableRenderKey = this.buildEnhancementStableRenderKey();
      return true;
    }
    return false;
  }

  private patchEnhancementToolbar(toolbar: HTMLElement): void {
    const note = toolbar.querySelector<HTMLElement>('[data-enhancement-toolbar-note="true"]');
    const nextText = this.getEnhancementToolbarNoteText();
    if (note) {
      note.textContent = nextText;
      return;
    }
    replaceElementHtml(toolbar, this.renderEnhancementToolbar());
  }

  private patchEnhancementActiveJob(workbench: HTMLElement, job: EnhancementJobView): void {
    const runningCard = workbench.querySelector<HTMLElement>('.enhancement-summary-card--running');
    const subtitle = runningCard?.querySelector<HTMLElement>('.enhancement-summary-subtitle');
    const rate = runningCard?.querySelector<HTMLElement>('.enhancement-summary-rate');
    const metrics = runningCard?.querySelectorAll<HTMLElement>('.enhancement-summary-metric strong');
    const sideMetrics = workbench.querySelectorAll<HTMLElement>('.enhancement-workbench-side .enhancement-summary-metric strong');
    const materialOwned = workbench.querySelector<HTMLElement>('.enhancement-material-owned');
    const finalTargetLevel = Math.max(job.targetLevel, job.desiredTargetLevel ?? job.targetLevel);
    if (subtitle) {
      subtitle.textContent = t('craft.enhancement.enhance-progress', { current: formatDisplayInteger(job.currentLevel), target: formatDisplayInteger(job.targetLevel) }) + (finalTargetLevel > job.targetLevel ? t('craft.enhancement.enhance-final-target', { level: formatDisplayInteger(finalTargetLevel) }) : '');
    }
    if (rate) {
      rate.textContent = formatEnhancementPercent(job.successRate);
    }
    if (metrics && metrics.length >= 3) {
      metrics[0].textContent = formatDisplayInteger(job.remainingTicks);
      metrics[1].textContent = t('craft.enhancement.enhance-ticks', { ticks: formatDisplayInteger(job.totalTicks) });
      metrics[2].textContent = formatEnhancementPercent(job.successRate);
    }
    if (sideMetrics.length >= 3) {
      sideMetrics[0].textContent = `+${formatDisplayInteger(job.targetLevel)}`;
      sideMetrics[1].textContent = `+${formatDisplayInteger(finalTargetLevel)}`;
      sideMetrics[2].textContent = job.protectionUsed ? `+${formatDisplayInteger(job.protectionStartLevel ?? job.targetLevel)} 起` : '未启用';
    }
    if (materialOwned) {
      materialOwned.textContent = t('craft.enhancement.enhance-role-level', { level: formatDisplayInteger(job.roleEnhancementLevel), percent: formatEnhancementPercent(job.totalSpeedRate) });
    }
  }

  private patchEnhancementIdleWorkbench(workbench: HTMLElement): void {
    const selected = this.getSelectedEnhancementCandidate();
    if (!selected) {
      return;
    }
    const summaryRate = workbench.querySelector<HTMLElement>('.enhancement-summary-rate');
    const materialRows = workbench.querySelectorAll<HTMLElement>('.enhancement-workbench-main .enhancement-material-row');
    if (summaryRate) {
      summaryRate.textContent = t('craft.enhancement.first-stage-rate', { rate: formatEnhancementPercent(selected.successRate) });
    }
    if (materialRows.length > 0) {
      const spiritOwned = materialRows[0]?.querySelector<HTMLElement>('.enhancement-material-owned');
      if (spiritOwned) {
        spiritOwned.textContent = t('craft.enhancement.owned-count', { count: formatDisplayInteger(this.getAlchemyInventoryCount('spirit_stone')) });
      }
      selected.materials.forEach((entry, index) => {
        const owned = materialRows[index + 1]?.querySelector<HTMLElement>('.enhancement-material-owned');
        if (owned) {
          owned.textContent = t('craft.enhancement.owned-count', { count: formatDisplayInteger(entry.ownedCount) });
        }
      });
    }
  }


  // --- Render methods ---

  private renderEnhancementToolbar(): string {
    return `
      <div class="enhancement-toolbar-note" data-enhancement-toolbar-note="true">${escapeHtml(this.getEnhancementToolbarNoteText())}</div>
      <button class="small-btn ghost" type="button" data-craft-action="enhancement-refresh">刷新</button>
    `;
  }

  renderEnhancementBody(): string {
    this.ensureLocalEnhancementHistoryLoaded();
    const selected = this.getSelectedEnhancementCandidate();
    const activeJob = this.getActiveEnhancementJob();
    const selectedProtection = this.getSelectedEnhancementProtection(selected);
    if (this.parent.loading) {
      return `<div class="enhancement-empty-state">${escapeHtml(t('craft.workbench.enhancement.empty.loading'))}</div>`;
    }
    if (this.parent.enhancementResponseError || !this.getEnhancementPanelState()) {
      return `<div class="enhancement-empty-state">${escapeHtml(this.parent.enhancementResponseError ?? t('craft.workbench.enhancement.empty.error'))}</div>`;
    }
    if (!activeJob && (this.getEnhancementPanelState()?.candidates.length ?? 0) === 0) {
      return `<div class="enhancement-empty-state">${escapeHtml(t('craft.workbench.enhancement.empty.no-target'))}</div>`;
    }
    const selectedRecord = activeJob
      ? this.getEnhancementPanelState()?.records.find((entry) => entry.itemId === activeJob.targetItemId) ?? null
      : selected
        ? this.getEnhancementPanelState()?.records.find((entry) => entry.itemId === selected.item.itemId) ?? null
        : null;
    return `
      <div class="enhancement-modal-shell" data-enhancement-stable-render-key="${escapeHtml(this.buildEnhancementStableRenderKey())}">
        <div class="enhancement-toolbar">
          ${this.renderEnhancementToolbar()}
        </div>
        <div class="enhancement-layout enhancement-layout--single-slot">
          <section class="enhancement-workbench">
            ${activeJob
              ? this.renderEnhancementActiveJob(activeJob, selected)
              : selected
                ? this.renderEnhancementWorkbench(selected, selectedProtection)
                : `
                  <div class="enhancement-workbench-grid">
                    <div class="enhancement-workbench-side">${this.renderEnhancementTargetSlot(null, null)}</div>
                    <div class="enhancement-workbench-main"><div class="enhancement-empty-state">${escapeHtml(t('craft.workbench.enhancement.empty.select-item'))}</div></div>
                  </div>
                `}
          </section>
          <aside class="enhancement-history-panel">
            ${this.renderEnhancementHistory(activeJob, selected, selectedRecord)}
          </aside>
        </div>
      </div>
    `;
  }

  private renderEnhancementWorkbenchSection(): string {
    const state = this.getEnhancementPanelState();
    const selected = this.getSelectedEnhancementCandidate();
    const selectedProtection = this.getSelectedEnhancementProtection(selected);
    if (state?.job) {
      return this.renderEnhancementActiveJob(state.job, selected);
    }
    if (selected) {
      return this.renderEnhancementWorkbench(selected, selectedProtection);
    }
    return `<div class="enhancement-workbench-grid" data-enhancement-idle-key="${escapeHtml(this.buildEnhancementIdleWorkbenchKey())}"><div class="enhancement-workbench-side">${this.renderEnhancementTargetSlot(null, null)}</div><div class="enhancement-workbench-main"><div class="enhancement-empty-state">请选择一件装备。</div></div></div>`;
  }

  private renderEnhancementFormulaPill(): string {
    return `<button class="enhancement-formula-pill" type="button" data-enhancement-formula-tooltip="1">${escapeHtml(t('craft.workbench.enhancement.formula-pill'))}</button>`;
  }


  renderEnhancementTargetSlot(
    activeJob: EnhancementJobView | null,
    selected: SyncedEnhancementCandidateView | null,
    extraContent = '',
  ): string {
    const selectedItem = activeJob?.item ?? selected?.item ?? null;
    const sourceLabel = activeJob
      ? (activeJob.target.source === 'equipment'
        ? `队列锁定 · ${getEquipSlotLabel(activeJob.target.slot ?? 'weapon')}`
        : '队列锁定 · 背包物品')
      : selected
        ? (selected.ref.source === 'equipment'
          ? `已装备 · ${getEquipSlotLabel(selected.ref.slot ?? 'weapon')}`
          : `背包槽位 ${formatDisplayInteger((selected.ref.slotIndex ?? 0) + 1)}`)
        : '尚未选择';
    const selectedLevel = selectedItem ? normalizeEnhanceLevel(selectedItem.enhanceLevel) : null;
    const targetHeadMeta = selectedItem
      ? `等级 ${formatDisplayInteger(Number(selectedItem.level) || 1)} · 当前 +${formatDisplayInteger(selectedLevel ?? 0)} · ${sourceLabel}`
      : '点击选择要强化的装备';
    if (!this.isCompactEnhancementLayout()) {
      return `
        <div class="enhancement-target-slot-card">
          <div class="enhancement-target-slot-head">
            <div>
              <div class="enhancement-section-title">强化目标</div>
              <div class="enhancement-protection-note">${escapeHtml(sourceLabel)}</div>
            </div>
            <button class="small-btn ghost" type="button" data-enhancement-open-picker="1" ${activeJob ? 'disabled' : ''}>
              ${selectedItem ? '更换装备' : '选择装备'}
            </button>
          </div>
          <button class="enhancement-target-slot" type="button" data-enhancement-open-picker="1" ${activeJob ? 'disabled' : ''}>
            ${selectedItem
              ? `
                <span class="enhancement-target-slot-name">${escapeHtml(selectedItem.name ?? UNKNOWN_ITEM_NAME)}</span>
                <span class="enhancement-target-slot-meta">等级 ${formatDisplayInteger(Number(selectedItem.level) || 1)} · 当前 +${formatDisplayInteger(normalizeEnhanceLevel(selectedItem.enhanceLevel))}</span>
              `
              : `
                <span class="enhancement-target-slot-name">点击选择要强化的装备</span>
                <span class="enhancement-target-slot-meta">主面板只保留一个目标槽，候选装备会在独立弹窗中选择</span>
              `}
          </button>
        </div>
      `;
    }
    return `
      <div class="enhancement-target-slot-card">
        <div class="enhancement-target-slot-layout${extraContent ? ' enhancement-target-slot-layout--merged' : ''}">
          <div class="enhancement-target-slot-main">
            <div class="enhancement-target-slot-head">
              <div class="enhancement-card-head">
                <div class="enhancement-card-head-main">
                  <div class="enhancement-section-title">强化目标</div>
                  <div class="enhancement-card-head-value">${escapeHtml(selectedItem?.name ?? '未选择装备')}</div>
                </div>
                <div class="enhancement-protection-note">${escapeHtml(targetHeadMeta)}</div>
              </div>
              <button class="small-btn ghost" type="button" data-enhancement-open-picker="1" ${activeJob ? 'disabled' : ''}>
                ${selectedItem ? '更换装备' : '选择装备'}
              </button>
            </div>
            <button class="enhancement-target-slot" type="button" data-enhancement-open-picker="1" ${activeJob ? 'disabled' : ''}>
              ${selectedItem
                ? `
                  <span class="enhancement-target-slot-action">点击更换这件装备</span>
                  <span class="enhancement-target-slot-meta">候选装备会在独立弹窗中选择；强化开始后本次目标会锁定。</span>
                `
                : `
                  <span class="enhancement-target-slot-action">点击选择要强化的装备</span>
                  <span class="enhancement-target-slot-meta">主面板只保留一个目标槽，候选装备会在独立弹窗中选择</span>
                `}
            </button>
          </div>
          ${extraContent ? `<div class="enhancement-target-slot-extra">${extraContent}</div>` : ''}
        </div>
      </div>
    `;
  }


  private renderEnhancementTargetLevelSection(selected: SyncedEnhancementCandidateView, selectedTargetLevel: number): string {
    return `
      <div class="enhancement-merged-section enhancement-merged-section--target-level">
        <div class="enhancement-merged-section-head">
          <div class="enhancement-card-head-main">
            <div class="enhancement-section-title">目标强化等级</div>
            <div class="enhancement-card-head-value">当前 +${formatDisplayInteger(selected.currentLevel)} → 目标 +${formatDisplayInteger(selectedTargetLevel)}</div>
          </div>
        </div>
        <div class="enhancement-target-level-row">
          <button class="small-btn ghost" type="button" data-enhancement-target-adjust="-1" ${selectedTargetLevel <= (selected.currentLevel + 1) ? 'disabled' : ''}>-1</button>
          <input
            class="enhancement-target-level-input"
            type="number"
            inputmode="numeric"
            min="${selected.currentLevel + 1}"
            max="${MAX_ENHANCE_LEVEL}"
            step="1"
            value="${selectedTargetLevel}"
            data-enhancement-target-level-input="1"
          >
          <button class="small-btn ghost" type="button" data-enhancement-target-adjust="1" ${selectedTargetLevel >= MAX_ENHANCE_LEVEL ? 'disabled' : ''}>+1</button>
        </div>
        <div class="enhancement-target-level-note">强化队列会从当前等级逐阶结算，直到达到目标等级，或后续灵石、材料、保护物不足，或到达上限 +${MAX_ENHANCE_LEVEL}。</div>
      </div>
    `;
  }

  renderEnhancementWorkbench(
    selected: SyncedEnhancementCandidateView,
    selectedProtection: { ref: EnhancementTargetRef; item: EnhancementItemView } | null,
  ): string {
    const selectedTargetLevel = this.getSelectedEnhancementTargetLevel(selected) ?? selected.nextLevel;
    const currentPreview: ItemStack = {
      ...buildBaseEnhancementPreviewItem(selected.item),
      enhanceLevel: selected.currentLevel,
    };
    const nextPreview: ItemStack = {
      ...buildBaseEnhancementPreviewItem(selected.item),
      enhanceLevel: selectedTargetLevel,
    };
    const currentLines = describeEquipmentBonuses(currentPreview, this.parent.playerRealmLv);
    const nextLines = describeEquipmentBonuses(nextPreview, this.parent.playerRealmLv);
    const protectionNote = selected.protectionItemId
      ? `保护物固定为 ${selected.protectionItemName?.trim() || UNKNOWN_ITEM_NAME}`
      : '未配置独立保护物，当前仅可消耗同名装备作为保护';
    const minProtectionStartLevel = 2;
    const protectionStartLevel = this.getSelectedEnhancementProtectionStartLevel(selected);
    const compactMobileLayout = this.isCompactEnhancementLayout();
    const inlineProtectionExpanded = !compactMobileLayout || this.parent.enhancementProtectionExpanded;
    const protectionButtonLabel = selectedProtection ? '保护设置 · 已启用' : '保护设置 · 未启用';
    const sideContent = `
      ${compactMobileLayout ? '' : `
        <div class="enhancement-target-level-card">
          <div class="enhancement-section-title">目标强化等级</div>
          <div class="enhancement-target-level-row">
            <button class="small-btn ghost" type="button" data-enhancement-target-adjust="-1" ${selectedTargetLevel <= (selected.currentLevel + 1) ? 'disabled' : ''}>-1</button>
            <input
              class="enhancement-target-level-input"
              type="number"
              inputmode="numeric"
              min="${selected.currentLevel + 1}"
              max="${MAX_ENHANCE_LEVEL}"
              step="1"
              value="${selectedTargetLevel}"
              data-enhancement-target-level-input="1"
            >
            <button class="small-btn ghost" type="button" data-enhancement-target-adjust="1" ${selectedTargetLevel >= MAX_ENHANCE_LEVEL ? 'disabled' : ''}>+1</button>
          </div>
          <div class="enhancement-target-level-note">强化队列会从当前等级逐阶结算，直到达到目标等级，或后续灵石、材料、保护物不足，或到达上限 +${MAX_ENHANCE_LEVEL}。</div>
        </div>
      `}
      <div class="enhancement-requirement-card">
        ${compactMobileLayout
          ? `<button class="small-btn ghost enhancement-inline-toggle" type="button" data-enhancement-toggle-protection-inline="1">${inlineProtectionExpanded ? '收起保护设置' : escapeHtml(protectionButtonLabel)}</button>`
          : '<div class="enhancement-section-title">保护</div>'}
        ${inlineProtectionExpanded ? `
          <div class="enhancement-protection-note">${escapeHtml(protectionNote)}</div>
          <label class="enhancement-protection-option">
            <input type="radio" name="enhancement-protection" value="" ${this.parent.selectedEnhancementProtectionKey ? '' : 'checked'}>
            <span>不使用保护</span>
          </label>
          ${selected.protectionCandidates.length > 0
            ? selected.protectionCandidates.map((entry) => {
              const key = buildEnhancementTargetKey(entry.ref);
              const sourceLabel = `背包槽位 ${(entry.ref.slotIndex ?? 0) + 1} · 数量 ${entry.item.count}`;
              return `
                <label class="enhancement-protection-option">
                  <input type="radio" name="enhancement-protection" value="${escapeHtml(key)}" ${this.parent.selectedEnhancementProtectionKey === key ? 'checked' : ''}>
                  <span>${escapeHtml(entry.item.name ?? UNKNOWN_ITEM_NAME)}</span>
                  <em>${escapeHtml(sourceLabel)}</em>
                </label>
              `;
            }).join('')
            : '<div class="enhancement-material-empty">当前背包没有可用保护物。</div>'}
          ${this.parent.selectedEnhancementProtectionKey && selectedTargetLevel >= minProtectionStartLevel ? `
            <div class="enhancement-protection-start">
              <div class="enhancement-protection-note">开始保护等级</div>
              <div class="enhancement-target-level-row">
                <button class="small-btn ghost" type="button" data-enhancement-protection-adjust="-1" ${!protectionStartLevel || protectionStartLevel <= minProtectionStartLevel ? 'disabled' : ''}>-1</button>
                <input
                  class="enhancement-target-level-input"
                  type="number"
                  inputmode="numeric"
                  min="${minProtectionStartLevel}"
                  max="${selectedTargetLevel}"
                  step="1"
                  value="${protectionStartLevel ?? minProtectionStartLevel}"
                  data-enhancement-protection-start-input="1"
                >
                <button class="small-btn ghost" type="button" data-enhancement-protection-adjust="1" ${!protectionStartLevel || protectionStartLevel >= selectedTargetLevel ? 'disabled' : ''}>+1</button>
              </div>
              <div class="enhancement-target-level-note">保护最低从 +2 开始生效。达到这个目标等级后，失败才会消耗保护并只降低一级。</div>
            </div>
          ` : this.parent.selectedEnhancementProtectionKey ? `
            <div class="enhancement-protection-start">
              <div class="enhancement-target-level-note">保护最低从 +2 开始生效。当前目标还没到 +2，这次强化不会消耗保护物。</div>
            </div>
          ` : ''}
        ` : ''}
      </div>
      <div class="enhancement-action-row enhancement-action-row--stacked">
        <button class="small-btn" type="button" data-enhancement-start="1">开始强化</button>
        ${this.renderEnhancementFormulaPill()}
      </div>
    `;
    return `
      <div class="enhancement-workbench-grid" data-enhancement-idle-key="${escapeHtml(this.buildEnhancementIdleWorkbenchKey())}">
        <div class="enhancement-workbench-side">
          ${this.renderEnhancementTargetSlot(
            null,
            selected,
            compactMobileLayout ? this.renderEnhancementTargetLevelSection(selected, selectedTargetLevel) : '',
          )}
          ${sideContent}
        </div>
        <div class="enhancement-workbench-main">
          <div class="enhancement-summary-card">
            <div class="enhancement-summary-head">
              <div>
                <div class="enhancement-summary-title">${escapeHtml(selected.item.name ?? UNKNOWN_ITEM_NAME)}</div>
                <div class="enhancement-summary-subtitle">当前 +${formatDisplayInteger(selected.currentLevel)} · 最终目标 +${formatDisplayInteger(selectedTargetLevel)}</div>
              </div>
              <div class="enhancement-summary-rate">首阶 ${formatEnhancementPercent(selected.successRate)}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric"><span>首阶灵石</span><strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong></div>
              <div class="enhancement-summary-metric"><span>首阶耗时</span><strong>${formatDisplayInteger(selected.durationTicks)} 息</strong></div>
              <div class="enhancement-summary-metric"><span>保护模式</span><strong>${selectedProtection ? '已启用' : '未启用'}</strong></div>
            </div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">强化材料</div>
            <div class="enhancement-material-row">
              <span>灵石</span>
              <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
              <span class="enhancement-material-owned">持有 ${formatDisplayInteger(this.getAlchemyInventoryCount('spirit_stone'))}</span>
            </div>
            ${selected.materials.length > 0
              ? selected.materials.map((entry) => `
                <div class="enhancement-material-row">
                  <span>${escapeHtml(entry.name)}</span>
                  <strong>${formatDisplayInteger(entry.count)}</strong>
                  <span class="enhancement-material-owned">持有 ${formatDisplayInteger(entry.ownedCount)}</span>
                </div>
              `).join('')
              : '<div class="enhancement-material-empty">没有额外材料需求，默认只消耗灵石。</div>'}
          </div>
          <div class="enhancement-preview-grid">
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">当前属性</div>
              ${currentLines.length > 0
                ? `<div class="enhancement-preview-lines">${currentLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">当前装备没有可显示的强化属性。</div>'}
            </div>
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">目标等级预览</div>
              ${nextLines.length > 0
                ? `<div class="enhancement-preview-lines">${nextLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">下一阶暂无可显示属性。</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }


  private renderEnhancementActiveActionSection(job: EnhancementJobView, finalTargetLevel: number): string {
    return `
      <div class="enhancement-merged-section enhancement-merged-section--action">
        <div class="enhancement-merged-section-head">
          <div class="enhancement-card-head-main">
            <div class="enhancement-section-title">当前行动</div>
            <div class="enhancement-card-head-value">+${formatDisplayInteger(job.currentLevel)} → +${formatDisplayInteger(job.targetLevel)}</div>
          </div>
        </div>
        <div class="enhancement-target-level-note">强化队列已启动，目标装备和强化锤在任务结束前会保持锁定。</div>
        <div class="enhancement-summary-metrics enhancement-summary-metrics--compact">
          <div class="enhancement-summary-metric"><span>当前冲击</span><strong>+${formatDisplayInteger(job.targetLevel)}</strong></div>
          <div class="enhancement-summary-metric"><span>最终目标</span><strong>+${formatDisplayInteger(finalTargetLevel)}</strong></div>
          <div class="enhancement-summary-metric"><span>保护</span><strong>${job.protectionUsed ? `+${formatDisplayInteger(job.protectionStartLevel ?? job.targetLevel)} 起` : '未启用'}</strong></div>
        </div>
        <div class="enhancement-action-row enhancement-action-row--stacked">
          <button class="small-btn ghost" type="button" data-enhancement-cancel="1">取消强化</button>
          <span class="enhancement-action-note">取消后会返还当前装备，已投入的材料不会退回；保护物仅在失败且保护生效时扣除，灵石仅在本阶成功时扣除。</span>
        </div>
      </div>
    `;
  }

  private renderEnhancementActiveJob(job: EnhancementJobView, selected: SyncedEnhancementCandidateView | null): string {
    const currentPreview: ItemStack = {
      ...buildBaseEnhancementPreviewItem(job.item ?? { itemId: job.targetItemId, name: job.targetItemName, level: 1, enhanceLevel: job.currentLevel }),
      enhanceLevel: job.currentLevel,
    };
    const resultPreview: ItemStack = {
      ...buildBaseEnhancementPreviewItem(job.item ?? { itemId: job.targetItemId, name: job.targetItemName, level: 1, enhanceLevel: job.currentLevel }),
      enhanceLevel: job.targetLevel,
    };
    const currentLines = describeEquipmentBonuses(currentPreview, this.parent.playerRealmLv);
    const resultLines = describeEquipmentBonuses(resultPreview, this.parent.playerRealmLv);
    const finalTargetLevel = Math.max(job.targetLevel, job.desiredTargetLevel ?? job.targetLevel);
    const compactMobileLayout = this.isCompactEnhancementLayout();
    return `
      <div class="enhancement-workbench-grid" data-enhancement-job-key="${escapeHtml(this.getEnhancementJobPatchKey(job))}">
        <div class="enhancement-workbench-side">
          ${this.renderEnhancementTargetSlot(job, selected, compactMobileLayout ? this.renderEnhancementActiveActionSection(job, finalTargetLevel) : '')}
          ${compactMobileLayout ? '' : `<div class="enhancement-target-level-card">${this.renderEnhancementActiveActionSection(job, finalTargetLevel)}</div>`}
        </div>
        <div class="enhancement-workbench-main">
          <div class="enhancement-summary-card enhancement-summary-card--running">
            <div class="enhancement-summary-head">
              <div>
                <div class="enhancement-summary-title">${escapeHtml(job.targetItemName)}</div>
                <div class="enhancement-summary-subtitle">进行中：+${formatDisplayInteger(job.currentLevel)} → +${formatDisplayInteger(job.targetLevel)}${finalTargetLevel > job.targetLevel ? ` · 最终目标 +${formatDisplayInteger(finalTargetLevel)}` : ''}</div>
              </div>
              <div class="enhancement-summary-rate">${formatEnhancementPercent(job.successRate)}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric"><span>剩余</span><strong>${formatDisplayInteger(job.remainingTicks)}</strong></div>
              <div class="enhancement-summary-metric"><span>总时长</span><strong>${formatDisplayInteger(job.totalTicks)} 息</strong></div>
              <div class="enhancement-summary-metric"><span>本阶成功率</span><strong>${formatEnhancementPercent(job.successRate)}</strong></div>
            </div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">本次已投入</div>
            <div class="enhancement-material-row">
              <span>灵石</span>
              <strong>${formatDisplayInteger(job.spiritStoneCost)}</strong>
              <span class="enhancement-material-owned">角色强化等级 Lv.${formatDisplayInteger(job.roleEnhancementLevel)} · 总加速 ${formatEnhancementPercent(job.totalSpeedRate)}</span>
            </div>
            ${job.materials.length > 0
              ? job.materials.map((entry) => `
                <div class="enhancement-material-row">
                  <span>${escapeHtml(getLocalItemTemplate(entry.itemId)?.name ?? UNKNOWN_ITEM_NAME)}</span>
                  <strong>${formatDisplayInteger(entry.count)}</strong>
                  <span class="enhancement-material-owned">已投入</span>
                </div>
              `).join('')
              : '<div class="enhancement-material-empty">本次没有额外材料，仅消耗灵石。</div>'}
          </div>
          <div class="enhancement-preview-grid">
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">当前属性</div>
              ${currentLines.length > 0
                ? `<div class="enhancement-preview-lines">${currentLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">当前装备没有可显示的强化属性。</div>'}
            </div>
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">成功后预览</div>
              ${resultLines.length > 0
                ? `<div class="enhancement-preview-lines">${resultLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
                : '<div class="enhancement-preview-empty">强化后暂无可显示属性。</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }


  private renderEnhancementHistory(
    activeJob: EnhancementJobView | null,
    selected: SyncedEnhancementCandidateView | null,
    record: PlayerEnhancementRecord | null,
  ): string {
    const referenceItem = activeJob?.item ?? selected?.item ?? null;
    const compactMobileLayout = this.isCompactEnhancementLayout();
    const inlineHistoryExpanded = !compactMobileLayout || this.parent.enhancementHistoryExpanded;
    const currentSessionRecord = this.getCurrentEnhancementSessionHistoryRecord(activeJob, referenceItem, record);
    if (!referenceItem) {
      const records = this.getSortedLocalEnhancementHistoryRecords();
      const totalAttempts = records.reduce((total, entry) => total + this.getEnhancementHistoryAttemptCount(entry), 0);
      const highestLevel = records.reduce((maxLevel, entry) => Math.max(maxLevel, normalizeEnhanceLevel(entry.highestLevel)), 0);
      return `
        <div class="enhancement-requirement-card enhancement-requirement-card--history">
          <div class="enhancement-history-head">
            ${compactMobileLayout
              ? `<button class="small-btn ghost" type="button" data-enhancement-toggle-history-inline="1">${inlineHistoryExpanded ? '收起强化记录' : '展开强化记录'}</button>`
              : `<div>
                  <div class="enhancement-section-title">强化记录</div>
                  <div class="enhancement-protection-note">本地累计 ${formatDisplayInteger(records.length)} 件 · 历史最高 +${formatDisplayInteger(highestLevel)}</div>
                </div>`}
            <button class="small-btn ghost" type="button" data-enhancement-open-history="1">历史记录</button>
          </div>
          ${inlineHistoryExpanded ? `
            <div class="enhancement-empty-state enhancement-empty-state--history">
              ${records.length > 0
                ? `当前未选中强化目标。你仍然可以查看本地历史记录，累计强化 ${formatDisplayInteger(totalAttempts)} 次。`
                : '当前还没有本地强化记录。'}
            </div>
          ` : ''}
        </div>
      `;
    }
    const displayRecord = currentSessionRecord ?? this.getEnhancementDisplayRecord(referenceItem.itemId, record);
    const roleEnhancementLevel = activeJob?.roleEnhancementLevel ?? Math.max(1, this.getEnhancementPanelState()?.enhancementSkillLevel ?? 1);
    const hammerSuccessRate = getEffectiveEnhancementToolSuccessRate(this.parent.equipment.weapon, this.parent.playerRealmLv);
    const levelRecords = new Map((displayRecord?.levels ?? []).map((entry) => [entry.targetLevel, entry] as const));
    const currentSessionRange = currentSessionRecord
      ? this.getEnhancementSessionHistoryDisplayRange(currentSessionRecord, activeJob?.targetLevel)
      : null;
    const minLevel = currentSessionRange?.minLevel ?? 1;
    const highestSeenLevel = currentSessionRange
      ? currentSessionRange.maxLevel
      : Math.max(normalizeEnhanceLevel(displayRecord?.highestLevel), normalizeEnhanceLevel(referenceItem.enhanceLevel) + 2, 8);
    const rows: string[] = [];
    for (let level = minLevel; level <= highestSeenLevel; level += 1) {
      const current = levelRecords.get(level);
      rows.push(`
        <div class="enhancement-history-row">
          <span>+${formatDisplayInteger(level)}</span>
          <span>${formatEnhancementPercent(computeEnhancementAdjustedSuccessRate(level, roleEnhancementLevel, Number(referenceItem.level) || 1, hammerSuccessRate))}</span>
          <span>成 ${formatDisplayInteger(current?.successCount ?? 0)}</span>
          <span>败 ${formatDisplayInteger(current?.failureCount ?? 0)}</span>
        </div>
      `);
    }
    return `
      <div class="enhancement-requirement-card enhancement-requirement-card--history">
        <div class="enhancement-history-head">
          ${compactMobileLayout
            ? `<button class="small-btn ghost" type="button" data-enhancement-toggle-history-inline="1">${inlineHistoryExpanded ? '收起强化记录' : '展开强化记录'}</button>`
            : `<div>
                <div class="enhancement-section-title">强化记录</div>
                <div class="enhancement-protection-note">${currentSessionRecord
                  ? `本次行动最高：+${formatDisplayInteger(displayRecord?.highestLevel ?? 0)}`
                  : `历史最高：+${formatDisplayInteger(displayRecord?.highestLevel ?? 0)}`}</div>
              </div>`}
          <button class="small-btn ghost" type="button" ${currentSessionRecord
            ? 'data-enhancement-open-current-history="1">本次记录'
            : 'data-enhancement-open-history="1">历史记录'}</button>
        </div>
        ${inlineHistoryExpanded ? `
          <div class="enhancement-history-table">
            <div class="enhancement-history-row enhancement-history-row--head">
              <span>目标</span><span>成功率</span><span>成功</span><span>失败</span>
            </div>
            ${rows.join('')}
          </div>
        ` : ''}
      </div>
    `;
  }


  // --- Event binding ---

  bindEnhancementEvents(body: HTMLElement, signal: AbortSignal): void {
    if (body.dataset.enhancementDelegatedEventsBound !== '1') {
      body.dataset.enhancementDelegatedEventsBound = '1';
      signal.addEventListener('abort', () => {
        delete body.dataset.enhancementDelegatedEventsBound;
      }, { once: true });
      body.addEventListener('click', (event) => {
        this.handleEnhancementDelegatedClick(event);
      }, { signal });
      body.addEventListener('change', (event) => {
        this.handleEnhancementDelegatedChange(event);
      }, { signal });
    }
    this.bindEnhancementFormulaTooltip(body, signal);
  }

  private handleEnhancementDelegatedClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    if (target.closest('[data-enhancement-formula-tooltip="1"]')) {
      return;
    }
    const openHistory = target.closest<HTMLElement>('[data-enhancement-open-history="1"]');
    if (openHistory) {
      this.openEnhancementHistoryListModal();
      return;
    }
    const openCurrentHistory = target.closest<HTMLElement>('[data-enhancement-open-current-history="1"]');
    if (openCurrentHistory) {
      const activeJob = this.getActiveEnhancementJob();
      const selected = this.getSelectedEnhancementCandidate();
      const referenceItem = activeJob?.item ?? selected?.item ?? null;
      const currentSessionRecord = this.getCurrentEnhancementSessionHistoryRecord(
        activeJob,
        referenceItem,
        activeJob
          ? this.getEnhancementPanelState()?.records.find((entry) => entry.itemId === activeJob.targetItemId) ?? null
          : selected
            ? this.getEnhancementPanelState()?.records.find((entry) => entry.itemId === selected.item.itemId) ?? null
            : null,
      );
      if (!currentSessionRecord) {
        this.openEnhancementHistoryListModal();
        return;
      }
      this.openEnhancementHistoryDetailModal(currentSessionRecord.itemId, getEnhancementHistorySessionKey(currentSessionRecord));
      return;
    }
    const toggleHistory = target.closest<HTMLElement>('[data-enhancement-toggle-history-inline="1"]');
    if (toggleHistory) {
      this.parent.enhancementHistoryExpanded = !this.parent.enhancementHistoryExpanded;
      this.parent.render();
      return;
    }
    const toggleProtection = target.closest<HTMLElement>('[data-enhancement-toggle-protection-inline="1"]');
    if (toggleProtection) {
      this.parent.enhancementProtectionExpanded = !this.parent.enhancementProtectionExpanded;
      this.parent.render();
      return;
    }
    const openPicker = target.closest<HTMLElement>('[data-enhancement-open-picker="1"]');
    if (openPicker) {
      if (this.getActiveEnhancementJob()) return;
      this.openEnhancementPickerModal();
      return;
    }
    const targetAdjust = target.closest<HTMLElement>('[data-enhancement-target-adjust]');
    if (targetAdjust) {
      const selected = this.getSelectedEnhancementCandidate();
      if (!selected) return;
      const delta = Math.floor(Number(targetAdjust.dataset.enhancementTargetAdjust) || 0);
      const minLevel = selected.currentLevel + 1;
      const nextLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, (this.getSelectedEnhancementTargetLevel(selected) ?? minLevel) + delta));
      this.parent.selectedEnhancementTargetLevel = nextLevel;
      if (this.parent.selectedEnhancementProtectionKey) {
        this.parent.selectedEnhancementProtectionStartLevel = Math.min(nextLevel, this.getSelectedEnhancementProtectionStartLevel(selected) ?? 2);
      }
      this.parent.render();
      return;
    }
    const protectionAdjust = target.closest<HTMLElement>('[data-enhancement-protection-adjust]');
    if (protectionAdjust) {
      const selected = this.getSelectedEnhancementCandidate();
      if (!selected || !this.parent.selectedEnhancementProtectionKey) return;
      const minLevel = 2;
      const maxLevel = this.getSelectedEnhancementTargetLevel(selected) ?? minLevel;
      const delta = Math.floor(Number(protectionAdjust.dataset.enhancementProtectionAdjust) || 0);
      this.parent.selectedEnhancementProtectionStartLevel = Math.max(minLevel, Math.min(maxLevel, (this.getSelectedEnhancementProtectionStartLevel(selected) ?? minLevel) + delta));
      this.parent.render();
      return;
    }
    const start = target.closest<HTMLElement>('[data-enhancement-start="1"]');
    if (start) {
      const selected = this.getSelectedEnhancementCandidate();
      if (!selected || this.getActiveEnhancementJob()) return;
      const protection = this.getSelectedEnhancementProtection(selected);
      const targetExpectedInstanceId = typeof selected.item?.itemInstanceId === 'string' && selected.item.itemInstanceId.length > 0
        ? selected.item.itemInstanceId
        : undefined;
      const protectionExpectedInstanceId = protection
        ? (typeof protection.item?.itemInstanceId === 'string' && protection.item.itemInstanceId.length > 0
          ? protection.item.itemInstanceId
          : undefined)
        : undefined;
      this.parent.callbacks?.onStartEnhancement?.({
        target: targetExpectedInstanceId
          ? { ...selected.ref, expectedItemInstanceId: targetExpectedInstanceId }
          : selected.ref,
        protection: protection
          ? (protectionExpectedInstanceId
            ? { ...protection.ref, expectedItemInstanceId: protectionExpectedInstanceId }
            : protection.ref)
          : null,
        targetLevel: this.getSelectedEnhancementTargetLevel(selected) ?? selected.nextLevel,
        protectionStartLevel: protection ? this.getSelectedEnhancementProtectionStartLevel(selected) : null,
      });
      return;
    }
    const cancel = target.closest<HTMLElement>('[data-enhancement-cancel="1"]');
    if (cancel) {
      if (!this.getActiveEnhancementJob()) return;
      this.parent.callbacks?.onCancelEnhancement?.();
    }
  }

  private handleEnhancementDelegatedChange(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) {
      return;
    }
    if (input.name === 'enhancement-protection') {
      this.parent.selectedEnhancementProtectionKey = input.value || null;
      this.parent.selectedEnhancementProtectionStartLevel = this.parent.selectedEnhancementProtectionKey ? 2 : null;
      this.parent.render();
      return;
    }
    if (input.matches('[data-enhancement-target-level-input="1"]')) {
      const selected = this.getSelectedEnhancementCandidate();
      if (!selected) return;
      const minLevel = selected.currentLevel + 1;
      this.parent.selectedEnhancementTargetLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, Math.floor(Number(input.value) || minLevel)));
      if (this.parent.selectedEnhancementProtectionKey) {
        this.parent.selectedEnhancementProtectionStartLevel = Math.min(this.parent.selectedEnhancementTargetLevel, this.getSelectedEnhancementProtectionStartLevel(selected) ?? 2);
      }
      this.parent.render();
      return;
    }
    if (input.matches('[data-enhancement-protection-start-input="1"]')) {
      const selected = this.getSelectedEnhancementCandidate();
      if (!selected || !this.parent.selectedEnhancementProtectionKey) return;
      const minLevel = 2;
      const maxLevel = this.getSelectedEnhancementTargetLevel(selected) ?? minLevel;
      this.parent.selectedEnhancementProtectionStartLevel = Math.max(minLevel, Math.min(maxLevel, Math.floor(Number(input.value) || minLevel)));
      this.parent.render();
    }
  }

  bindEnhancementFormulaTooltip(body: HTMLElement, signal?: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    body.querySelectorAll<HTMLElement>('[data-enhancement-formula-tooltip="1"]').forEach((node) => {
      if (node.dataset.enhancementFormulaTooltipBound === '1') return;
      node.dataset.enhancementFormulaTooltipBound = '1';
      const showTooltip = (clientX: number, clientY: number, pin = false): void => {
        const lines = getEnhancementFormulaTooltipLines();
        if (pin) { this.enhancementFormulaTooltip.showPinned(node, '强化规则', lines, clientX, clientY); return; }
        this.enhancementFormulaTooltip.show('强化规则', lines, clientX, clientY);
      };
      node.addEventListener('click', (event) => {
        if (!tapMode) return;
        if (this.enhancementFormulaTooltip.isPinnedTo(node)) { this.enhancementFormulaTooltip.hide(true); return; }
        showTooltip(event.clientX, event.clientY, true);
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, signal });
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.enhancementFormulaTooltip.isPinned()) return;
        showTooltip(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.enhancementFormulaTooltip.isPinned()) return;
        this.enhancementFormulaTooltip.move(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointerleave', () => { this.enhancementFormulaTooltip.hide(); }, { signal });
    });
  }


  // --- History management ---

  ensureLocalEnhancementHistoryLoaded(): void {
    if (this.parent.localEnhancementHistoryLoaded) return;
    this.parent.localEnhancementHistoryLoaded = true;
    const result = readEnhancementHistoryFromStorage();
    if (!result) return;
    this.parent.localEnhancementHistoryRecords = result.totals;
    this.parent.localEnhancementHistorySessions = result.sessions;
    this.parent.lastServerEnhancementSessionRecord = result.sessionRecord;
    if (result.migratedFromV1) {
      this.persistLocalEnhancementHistory();
    }
  }

  private persistLocalEnhancementHistory(): void {
    if (typeof window === 'undefined') return;
    const payload: StoredEnhancementHistoryState = {
      version: 2,
      totals: [...this.parent.localEnhancementHistoryRecords.values()]
        .map((entry) => cloneEnhancementRecord(entry))
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')),
      sessions: this.parent.localEnhancementHistorySessions
        .map((entry) => cloneEnhancementRecord(entry))
        .sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0) || right.itemId.localeCompare(left.itemId, 'zh-Hans-CN')),
      sessionRecord: this.parent.lastServerEnhancementSessionRecord ? cloneEnhancementRecord(this.parent.lastServerEnhancementSessionRecord) : null,
    };
    try { window.localStorage.setItem(ENHANCEMENT_HISTORY_STORAGE_KEY, JSON.stringify(payload)); } catch (e) { console.warn('[EnhancementView] localStorage write failed:', e); }
  }

  mergeServerEnhancementSessionRecord(records: PlayerEnhancementRecord[]): void {
    const serverRecord = normalizeEnhancementRecordList(records)[0] ?? null;
    if (!serverRecord) {
      this.parent.lastServerEnhancementSessionRecord = null;
      this.persistLocalEnhancementHistory();
      return;
    }
    const previousSession = this.parent.lastServerEnhancementSessionRecord;
    const continuousSession = Boolean(
      previousSession
      && getEnhancementHistorySessionKey(previousSession) === getEnhancementHistorySessionKey(serverRecord)
      && this.isNonDecreasingEnhancementSessionSnapshot(previousSession, serverRecord),
    );
    const deltaRecord = continuousSession && previousSession
      ? this.computeEnhancementSessionDelta(previousSession, serverRecord)
      : serverRecord;
    this.upsertLocalEnhancementHistorySession(serverRecord);
    if (deltaRecord.highestLevel > 0 || deltaRecord.levels.length > 0) {
      const persisted = this.parent.localEnhancementHistoryRecords.get(serverRecord.itemId) ?? { itemId: serverRecord.itemId, highestLevel: 0, levels: [] };
      this.applyEnhancementDeltaRecord(persisted, deltaRecord, serverRecord.highestLevel);
      this.parent.localEnhancementHistoryRecords.set(serverRecord.itemId, cloneEnhancementRecord(persisted));
    }
    this.parent.lastServerEnhancementSessionRecord = cloneEnhancementRecord(serverRecord);
    this.persistLocalEnhancementHistory();
  }

  private isNonDecreasingEnhancementSessionSnapshot(previous: PlayerEnhancementRecord, current: PlayerEnhancementRecord): boolean {
    if (normalizeEnhanceLevel(current.highestLevel) < normalizeEnhanceLevel(previous.highestLevel)) return false;
    const currentLevels = new Map<number, PlayerEnhancementRecord['levels'][number]>(current.levels.map((entry) => [entry.targetLevel, entry]));
    return previous.levels.every((entry) => {
      const next = currentLevels.get(entry.targetLevel);
      return Boolean(next && next.successCount >= entry.successCount && next.failureCount >= entry.failureCount);
    });
  }

  private computeEnhancementSessionDelta(previous: PlayerEnhancementRecord, current: PlayerEnhancementRecord): PlayerEnhancementRecord {
    const previousLevels = new Map<number, PlayerEnhancementRecord['levels'][number]>(previous.levels.map((entry) => [entry.targetLevel, entry]));
    return {
      itemId: current.itemId,
      highestLevel: Math.max(0, normalizeEnhanceLevel(current.highestLevel) - normalizeEnhanceLevel(previous.highestLevel)),
      levels: current.levels
        .map((entry) => {
          const last = previousLevels.get(entry.targetLevel);
          return { targetLevel: entry.targetLevel, successCount: Math.max(0, entry.successCount - (last?.successCount ?? 0)), failureCount: Math.max(0, entry.failureCount - (last?.failureCount ?? 0)) };
        })
        .filter((entry) => entry.successCount > 0 || entry.failureCount > 0),
      actionStartedAt: current.actionStartedAt, actionEndedAt: current.actionEndedAt,
      startLevel: current.startLevel, initialTargetLevel: current.initialTargetLevel,
      desiredTargetLevel: current.desiredTargetLevel, protectionStartLevel: current.protectionStartLevel, status: current.status,
    };
  }

  private applyEnhancementDeltaRecord(target: PlayerEnhancementRecord, delta: PlayerEnhancementRecord, latestHighestLevel: number): void {
    target.highestLevel = Math.max(normalizeEnhanceLevel(target.highestLevel), normalizeEnhanceLevel(latestHighestLevel));
    const levelMap = new Map<number, PlayerEnhancementRecord['levels'][number]>(target.levels.map((entry) => [entry.targetLevel, { ...entry }]));
    for (const entry of delta.levels) {
      const current = levelMap.get(entry.targetLevel) ?? { targetLevel: entry.targetLevel, successCount: 0, failureCount: 0 };
      current.successCount += Math.max(0, entry.successCount);
      current.failureCount += Math.max(0, entry.failureCount);
      levelMap.set(entry.targetLevel, current);
    }
    target.levels = [...levelMap.values()].sort((left, right) => left.targetLevel - right.targetLevel);
  }

  private upsertLocalEnhancementHistorySession(record: PlayerEnhancementRecord): void {
    if (!isEnhancementHistorySessionRecord(record)) return;
    const next = cloneEnhancementRecord(record);
    const sessionKey = getEnhancementHistorySessionKey(next);
    const currentIndex = this.parent.localEnhancementHistorySessions.findIndex((entry) => getEnhancementHistorySessionKey(entry) === sessionKey);
    if (currentIndex >= 0) { this.parent.localEnhancementHistorySessions[currentIndex] = next; }
    else { this.parent.localEnhancementHistorySessions.push(next); }
    this.parent.localEnhancementHistorySessions.sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0));
  }


  private getEnhancementDisplayRecord(itemId: string, serverRecord: PlayerEnhancementRecord | null): PlayerEnhancementRecord | null {
    const localRecord = this.parent.localEnhancementHistoryRecords.get(itemId);
    if (!localRecord && !serverRecord) return null;
    if (!localRecord) return serverRecord ? cloneEnhancementRecord(serverRecord) : null;
    if (!serverRecord) return cloneEnhancementRecord(localRecord);
    const merged = cloneEnhancementRecord(localRecord);
    merged.highestLevel = Math.max(merged.highestLevel, normalizeEnhanceLevel(serverRecord.highestLevel));
    const levelMap = new Map<number, PlayerEnhancementRecord['levels'][number]>(merged.levels.map((entry) => [entry.targetLevel, { ...entry }]));
    for (const entry of serverRecord.levels) {
      const current = levelMap.get(entry.targetLevel) ?? { targetLevel: entry.targetLevel, successCount: 0, failureCount: 0 };
      current.successCount = Math.max(current.successCount, entry.successCount);
      current.failureCount = Math.max(current.failureCount, entry.failureCount);
      levelMap.set(entry.targetLevel, current);
    }
    merged.levels = [...levelMap.values()].sort((left, right) => left.targetLevel - right.targetLevel);
    return merged;
  }

  private getCurrentEnhancementSessionHistoryRecord(
    activeJob: EnhancementJobView | null,
    referenceItem: EnhancementItemView | null,
    record: PlayerEnhancementRecord | null,
  ): PlayerEnhancementRecord | null {
    if (!referenceItem || !record || !isEnhancementHistorySessionRecord(record)) return null;
    if (record.itemId !== referenceItem.itemId) return null;
    if (activeJob && record.itemId === activeJob.targetItemId) return cloneEnhancementRecord(record);
    if (record.status === 'in_progress') return cloneEnhancementRecord(record);
    return null;
  }

  private getEnhancementSessionHistoryDisplayRange(record: PlayerEnhancementRecord, currentTargetLevel?: number): { minLevel: number; maxLevel: number } {
    const startLevel = normalizeEnhanceLevel(record.startLevel);
    const initialTargetLevel = Math.max(startLevel + 1, Math.floor(Number(record.initialTargetLevel) || (startLevel + 1)));
    const attemptedLevels = (record.levels ?? []).map((entry) => Math.max(1, Math.floor(Number(entry.targetLevel) || 1))).filter((entry) => Number.isFinite(entry) && entry > 0);
    if (attemptedLevels.length === 0) {
      const currentLevel = Math.max(0, Math.floor(Number(currentTargetLevel) || 0));
      const displayLevel = currentLevel > 0 ? currentLevel : initialTargetLevel;
      return { minLevel: displayLevel, maxLevel: displayLevel };
    }
    const minLevel = Math.min(...attemptedLevels);
    const maxLevel = Math.max(...attemptedLevels);
    return { minLevel, maxLevel };
  }

  private getSortedLocalEnhancementHistoryRecords(): PlayerEnhancementRecord[] {
    const recordsByItem = new Map<string, PlayerEnhancementRecord>(
      [...this.parent.localEnhancementHistoryRecords.values()].map((entry) => [entry.itemId, cloneEnhancementRecord(entry)] as const),
    );
    for (const session of this.parent.localEnhancementHistorySessions) {
      const current = recordsByItem.get(session.itemId) ?? { itemId: session.itemId, highestLevel: 0, levels: [] };
      current.highestLevel = Math.max(normalizeEnhanceLevel(current.highestLevel), normalizeEnhanceLevel(session.highestLevel), normalizeEnhanceLevel(session.startLevel));
      if (!this.parent.localEnhancementHistoryRecords.has(session.itemId) && session.levels.length > 0) {
        this.applyEnhancementDeltaRecord(current, session, session.highestLevel);
      }
      recordsByItem.set(session.itemId, current);
    }
    return [...recordsByItem.values()].sort((left, right) => {
      const highestDelta = normalizeEnhanceLevel(right.highestLevel) - normalizeEnhanceLevel(left.highestLevel);
      if (highestDelta !== 0) return highestDelta;
      const attemptsDelta = this.getEnhancementHistoryAttemptCount(right) - this.getEnhancementHistoryAttemptCount(left);
      if (attemptsDelta !== 0) return attemptsDelta;
      return this.getEnhancementHistoryItemName(left.itemId).localeCompare(this.getEnhancementHistoryItemName(right.itemId), 'zh-Hans-CN');
    });
  }

  private getEnhancementHistoryItemName(itemId: string): string { return getLocalItemTemplate(itemId)?.name ?? UNKNOWN_ITEM_NAME; }
  private getEnhancementHistoryItemLevel(itemId: string): number { return Math.max(1, Math.floor(Number(getLocalItemTemplate(itemId)?.level) || 1)); }
  private getEnhancementHistoryAttemptCount(record: PlayerEnhancementRecord): number {
    return (record.levels ?? []).reduce((total, entry) => total + Math.max(0, entry.successCount) + Math.max(0, entry.failureCount), 0);
  }
  private getEnhancementHistorySessionsByItem(itemId: string): PlayerEnhancementRecord[] {
    return this.parent.localEnhancementHistorySessions
      .filter((entry) => entry.itemId === itemId)
      .map((entry) => cloneEnhancementRecord(entry))
      .sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0) || (right.actionEndedAt ?? 0) - (left.actionEndedAt ?? 0));
  }
  private getEnhancementHistorySessionStatusLabel(record: PlayerEnhancementRecord): string { return formatEnhancementRecordStatus(record.status); }
  private getEnhancementHistorySessionTargetSummary(record: PlayerEnhancementRecord): string {
    const startLevel = normalizeEnhanceLevel(record.startLevel);
    const initialTargetLevel = Math.max(startLevel + 1, Math.floor(Number(record.initialTargetLevel) || (startLevel + 1)));
    const desiredTargetLevel = Math.max(initialTargetLevel, Math.floor(Number(record.desiredTargetLevel) || initialTargetLevel));
    return t('craft.workbench.enhancement.history.session.target-summary', {
      startLevel: formatDisplayInteger(startLevel),
      initialTargetLevel: formatDisplayInteger(initialTargetLevel),
      desiredTargetLevel: formatDisplayInteger(desiredTargetLevel),
    });
  }

  refreshOpenEnhancementHistoryModal(): void {
    if (confirmModalHost.isOpenFor(`${this.parent.MODAL_OWNER}:enhancement-history-detail`)) {
      if (this.parent.activeEnhancementHistoryItemId && this.parent.activeEnhancementHistorySessionKey) {
        this.openEnhancementHistoryDetailModal(this.parent.activeEnhancementHistoryItemId, this.parent.activeEnhancementHistorySessionKey);
      }
      return;
    }
    if (confirmModalHost.isOpenFor(`${this.parent.MODAL_OWNER}:enhancement-history-session`)) {
      if (this.parent.activeEnhancementHistoryItemId) {
        this.openEnhancementHistorySessionModal(this.parent.activeEnhancementHistoryItemId);
      }
      return;
    }
    if (confirmModalHost.isOpenFor(`${this.parent.MODAL_OWNER}:enhancement-history-list`)) {
      this.openEnhancementHistoryListModal();
    }
  }


  openEnhancementPickerModal(): void {
    const candidates = this.getEnhancementPanelState()?.candidates ?? [];
    confirmModalHost.open({
      ownerId: `${this.parent.MODAL_OWNER}:enhancement-picker`,
      title: t('craft.workbench.enhancement.picker.title'),
      subtitle: t('craft.workbench.enhancement.picker.subtitle'),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      bodyHtml: candidates.length > 0
        ? `
          <div class="enhancement-picker-grid inventory-grid">
            ${candidates.map((entry) => {
              const key = buildEnhancementTargetKey(entry.ref);
              const itemMeta = getItemDisplayMeta(buildBaseEnhancementPreviewItem(entry.item));
              const sourceLabel = entry.ref.source === 'equipment'
                ? t('craft.workbench.enhancement.picker.source.equipped', { slot: getEquipSlotLabel(entry.ref.slot ?? 'weapon') })
                : t('craft.workbench.enhancement.picker.source.inventory', { slot: formatDisplayInteger((entry.ref.slotIndex ?? 0) + 1) });
              const nameClass = getItemNameClass(entry.item.name ?? UNKNOWN_ITEM_NAME);
              const itemTypeLabel = entry.item.type ? getItemTypeLabel(entry.item.type) : t('craft.workbench.enhancement.picker.type.equipment');
              return `
                <button
                  class="${getItemDecorClassName(`inventory-cell enhancement-picker-cell${this.parent.selectedEnhancementTargetKey === key ? ' active' : ''}`, buildBaseEnhancementPreviewItem(entry.item))}"
                  type="button"
                  data-enhancement-picker-target="${escapeHtml(key)}"
                >
                  <div class="inventory-cell-head">
                    <span class="inventory-cell-type">${escapeHtml(getItemAffixTypeLabel(itemMeta.displayItem, itemTypeLabel))}</span>
                    <span class="inventory-cell-count">x${formatDisplayInteger(entry.item.count ?? 1)}</span>
                  </div>
                  <div class="inventory-cell-name ${nameClass}">${escapeHtml(entry.item.name ?? UNKNOWN_ITEM_NAME)}</div>
                  <div class="enhancement-picker-cell-meta">
                    <span>${escapeHtml(sourceLabel)}</span>
                    <span>+${formatDisplayInteger(entry.currentLevel)} → +${formatDisplayInteger(entry.nextLevel)} · ${formatDisplayInteger(entry.durationTicks)} 息</span>
                  </div>
                  ${itemMeta.affinityBadge ? `<span class="item-card-chip item-card-chip--affinity item-card-chip--${escapeHtml(itemMeta.affinityBadge.tone ?? 'neutral')} item-card-chip--element-${escapeHtml(itemMeta.affinityBadge.element ?? 'neutral')}" aria-label="${escapeHtml(itemMeta.affinityBadge.title ?? '')}">${escapeHtml(itemMeta.affinityBadge.label ?? '')}</span>` : ''}
                  ${itemMeta.levelLabel ? `<span class="item-card-chip item-card-chip--level">${escapeHtml(String(itemMeta.levelLabel))}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        `
        : `<div class="enhancement-empty-state enhancement-empty-state--picker">${escapeHtml(t('craft.workbench.enhancement.picker.empty'))}</div>`,
    });
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    modalBody?.querySelectorAll<HTMLElement>('[data-enhancement-picker-target]').forEach((button) => {
      button.addEventListener('click', () => {
        this.parent.selectedEnhancementTargetKey = button.dataset.enhancementPickerTarget ?? null;
        const selected = this.getSelectedEnhancementCandidate();
        this.parent.selectedEnhancementTargetLevel = selected ? selected.currentLevel + 1 : null;
        this.parent.selectedEnhancementProtectionKey = null;
        this.parent.selectedEnhancementProtectionStartLevel = null;
        this.ensureEnhancementSelection();
        confirmModalHost.close(`${this.parent.MODAL_OWNER}:enhancement-picker`);
        this.parent.render();
      });
    });
  }

  ensureEnhancementSelection(): void {
    const candidates = this.parent.enhancementPanel?.state?.candidates ?? [];
    if (this.parent.enhancementPanel?.state?.job) {
      this.parent.selectedEnhancementTargetKey = buildEnhancementTargetKey(this.parent.enhancementPanel.state.job.target);
      this.parent.selectedEnhancementTargetLevel = null;
      return;
    }
    if (candidates.length === 0) {
      this.parent.selectedEnhancementTargetKey = null;
      this.parent.selectedEnhancementTargetLevel = null;
      this.parent.selectedEnhancementProtectionKey = null;
      this.parent.selectedEnhancementProtectionStartLevel = null;
      return;
    }
    if (this.parent.selectedEnhancementTargetKey && !candidates.some((entry) => buildEnhancementTargetKey(entry.ref) === this.parent.selectedEnhancementTargetKey)) {
      this.parent.selectedEnhancementTargetKey = null;
      this.parent.selectedEnhancementTargetLevel = null;
    }
    if (!this.parent.selectedEnhancementTargetKey) {
      this.parent.selectedEnhancementTargetKey = buildEnhancementTargetKey(candidates[0]!.ref);
    }
    const selected = this.getSelectedEnhancementCandidate();
    if (selected) {
      const minLevel = selected.currentLevel + 1;
      if (!this.parent.selectedEnhancementTargetLevel || this.parent.selectedEnhancementTargetLevel < minLevel) {
        this.parent.selectedEnhancementTargetLevel = minLevel;
      }
      if (this.parent.selectedEnhancementProtectionKey) {
        const maxLevel = this.getSelectedEnhancementTargetLevel(selected) ?? minLevel;
        this.parent.selectedEnhancementProtectionStartLevel = Math.max(2, Math.min(maxLevel, Math.floor(Number(this.parent.selectedEnhancementProtectionStartLevel) || 2)));
      } else {
        this.parent.selectedEnhancementProtectionStartLevel = null;
      }
    }
    if (this.parent.selectedEnhancementProtectionKey && !selected?.protectionCandidates.some((entry) => buildEnhancementTargetKey(entry.ref) === this.parent.selectedEnhancementProtectionKey)) {
      this.parent.selectedEnhancementProtectionKey = null;
      this.parent.selectedEnhancementProtectionStartLevel = null;
    }
  }

  openEnhancementHistoryListModal(): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.parent.activeEnhancementHistoryItemId = null;
    this.parent.activeEnhancementHistorySessionKey = null;
    const records = this.getSortedLocalEnhancementHistoryRecords();
    confirmModalHost.open({
      ownerId: `${this.parent.MODAL_OWNER}:enhancement-history-list`,
      title: t('craft.workbench.enhancement.history.list.title'),
      subtitle: t('craft.workbench.enhancement.history.list.subtitle'),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      bodyHtml: records.length > 0
        ? `<div class="enhancement-history-list-modal">${records.map((record) => {
            const itemName = this.getEnhancementHistoryItemName(record.itemId);
            const itemLevel = this.getEnhancementHistoryItemLevel(record.itemId);
            const attemptCount = this.getEnhancementHistoryAttemptCount(record);
            return `<button class="enhancement-history-entry" type="button" data-enhancement-history-item="${escapeHtml(record.itemId)}"><span class="enhancement-history-entry-title">${escapeHtml(itemName)}</span><span class="enhancement-history-entry-meta">${escapeHtml(t('craft.workbench.enhancement.history.list.entry-meta', { level: formatDisplayInteger(itemLevel), highestLevel: formatDisplayInteger(record.highestLevel), attemptCount: formatDisplayInteger(attemptCount) }))}</span></button>`;
          }).join('')}</div>`
        : `<div class="enhancement-empty-state enhancement-empty-state--picker">${escapeHtml(t('craft.workbench.enhancement.history.list.empty'))}</div>`,
    });
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    modalBody?.querySelectorAll<HTMLElement>('[data-enhancement-history-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.enhancementHistoryItem ?? '';
        if (itemId) this.openEnhancementHistorySessionModal(itemId);
      });
    });
  }


  openEnhancementHistorySessionModal(itemId: string): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.parent.activeEnhancementHistoryItemId = itemId;
    this.parent.activeEnhancementHistorySessionKey = null;
    const itemName = this.getEnhancementHistoryItemName(itemId);
    const sessions = this.getEnhancementHistorySessionsByItem(itemId);
    confirmModalHost.open({
      ownerId: `${this.parent.MODAL_OWNER}:enhancement-history-session`,
      title: t('craft.workbench.enhancement.history.session.title'),
      subtitle: t('craft.workbench.enhancement.history.session.subtitle', { itemName }),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      onClose: () => { this.openEnhancementHistoryListModal(); },
      bodyHtml: sessions.length > 0
        ? `<div class="enhancement-history-list-modal enhancement-history-list-modal--sessions">${sessions.map((record) => {
            const startedAtLabel = t('craft.workbench.enhancement.history.session.started-at', { startedAt: formatHistoryDateTime(record.actionStartedAt) });
            const endedAtLabel = record.actionEndedAt ? t('craft.workbench.enhancement.history.session.ended-at', { endedAt: formatHistoryDateTime(record.actionEndedAt) }) : t('craft.workbench.enhancement.history.session.ended-at-empty');
            const attemptCount = this.getEnhancementHistoryAttemptCount(record);
            const sessionKey = getEnhancementHistorySessionKey(record);
            return `<button class="enhancement-history-entry" type="button" data-enhancement-history-session="${escapeHtml(sessionKey)}"><span class="enhancement-history-entry-title">${escapeHtml(startedAtLabel)}</span><span class="enhancement-history-entry-meta">${escapeHtml(this.getEnhancementHistorySessionTargetSummary(record))}</span><span class="enhancement-history-entry-meta enhancement-history-entry-meta--secondary">${escapeHtml(t('craft.workbench.enhancement.history.session.status-meta', { highestLevel: formatDisplayInteger(record.highestLevel), attemptCount: formatDisplayInteger(attemptCount), status: this.getEnhancementHistorySessionStatusLabel(record), endedAt: endedAtLabel }))}</span></button>`;
          }).join('')}</div>`
        : `<div class="enhancement-empty-state enhancement-empty-state--picker">${escapeHtml(t('craft.workbench.enhancement.history.session.empty'))}</div>`,
    });
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    modalBody?.querySelectorAll<HTMLElement>('[data-enhancement-history-session]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionKey = button.dataset.enhancementHistorySession ?? '';
        if (sessionKey) this.openEnhancementHistoryDetailModal(itemId, sessionKey);
      });
    });
  }

  openEnhancementHistoryDetailModal(itemId: string, sessionKey: string): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.parent.activeEnhancementHistoryItemId = itemId;
    this.parent.activeEnhancementHistorySessionKey = sessionKey;
    const record = this.getEnhancementHistorySessionsByItem(itemId).find((entry) => getEnhancementHistorySessionKey(entry) === sessionKey);
    if (!record) return;
    const detailRecord = cloneEnhancementRecord(record);
    const itemName = this.getEnhancementHistoryItemName(itemId);
    const itemLevel = this.getEnhancementHistoryItemLevel(itemId);
    const levelMap = new Map(detailRecord.levels.map((entry) => [entry.targetLevel, entry] as const));
    const sessionRange = this.getEnhancementSessionHistoryDisplayRange(detailRecord);
    const roleEnhancementLevel = Math.max(1, this.getEnhancementPanelState()?.enhancementSkillLevel ?? 1);
    const hammerSuccessRate = getEffectiveEnhancementToolSuccessRate(this.parent.equipment.weapon, this.parent.playerRealmLv);
    const rows: string[] = [];
    for (let level = sessionRange.minLevel; level <= sessionRange.maxLevel; level += 1) {
      const current = levelMap.get(level);
      rows.push(`<div class="enhancement-history-row"><span>+${formatDisplayInteger(level)}</span><span>${formatEnhancementPercent(computeEnhancementAdjustedSuccessRate(level, roleEnhancementLevel, itemLevel, hammerSuccessRate))}</span><span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.success-value', { count: formatDisplayInteger(current?.successCount ?? 0) }))}</span><span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.failure-value', { count: formatDisplayInteger(current?.failureCount ?? 0) }))}</span></div>`);
    }
    const endedAtText = detailRecord.actionEndedAt ? t('craft.workbench.enhancement.history.session.ended-at', { endedAt: formatHistoryDateTime(detailRecord.actionEndedAt) }) : t('craft.workbench.enhancement.history.session.ended-at-empty');
    const protectionText = typeof detailRecord.protectionStartLevel === 'number'
      ? t('craft.workbench.enhancement.history.detail.protection-enabled', { level: formatDisplayInteger(detailRecord.protectionStartLevel) })
      : t('craft.workbench.enhancement.history.detail.protection-disabled');
    confirmModalHost.open({
      ownerId: `${this.parent.MODAL_OWNER}:enhancement-history-detail`,
      title: t('craft.workbench.enhancement.history.detail.title'),
      subtitle: t('craft.workbench.enhancement.history.detail.subtitle', { itemName, startedAt: formatHistoryDateTime(detailRecord.actionStartedAt) }),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      onClose: () => { this.openEnhancementHistorySessionModal(itemId); },
      bodyHtml: `
        <div class="enhancement-history-detail">
          <div class="enhancement-history-detail-note">${escapeHtml(t('craft.workbench.enhancement.history.detail.summary', { sessionSummary: this.getEnhancementHistorySessionTargetSummary(detailRecord), highestLevel: formatDisplayInteger(detailRecord.highestLevel), status: this.getEnhancementHistorySessionStatusLabel(detailRecord), endedAt: endedAtText, protection: protectionText }))}</div>
          <div class="enhancement-history-detail-note">${escapeHtml(t('craft.workbench.enhancement.history.detail.note', { level: formatDisplayInteger(roleEnhancementLevel) }))}</div>
          <div class="enhancement-history-table enhancement-history-table--modal">
            <div class="enhancement-history-row enhancement-history-row--head"><span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.target'))}</span><span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.success-rate'))}</span><span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.success'))}</span><span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.failure'))}</span></div>
            ${rows.join('')}
          </div>
        </div>
      `,
    });
  }

  buildEnhancementPayload(
    body: HTMLElement,
    candidate: SyncedEnhancementCandidateView,
    useProtection: boolean,
  ): C2S_StartEnhancement | null {
    const payload: C2S_StartEnhancement = { target: candidate.ref };
    const targetLevelInput = body.querySelector<HTMLInputElement>('[data-enhancement-target-level-input]');
    const targetLevel = Number(targetLevelInput?.value ?? String(candidate.nextLevel));
    if (Number.isFinite(targetLevel)) {
      payload.targetLevel = Math.max(candidate.nextLevel, Math.min(MAX_ENHANCE_LEVEL, Math.floor(targetLevel)));
    }
    if (!useProtection) return payload;
    const selectedProtection = body.querySelector<HTMLInputElement>('input[name="enhancement-protection"]:checked');
    const protectionValue = (selectedProtection?.value ?? '').trim();
    if (!protectionValue) return payload;
    if (protectionValue === 'self') {
      payload.protection = candidate.ref;
    } else if (protectionValue.startsWith('inventory:')) {
      payload.protection = { source: 'inventory', slotIndex: Number(protectionValue.slice('inventory:'.length)) };
    } else if (protectionValue.startsWith('equipment:')) {
      payload.protection = { source: 'equipment', slot: protectionValue.slice('equipment:'.length) as EnhancementTargetRef['slot'] };
    } else {
      return null;
    }
    const protectionStartInput = body.querySelector<HTMLInputElement>('[data-enhancement-protection-start-input]');
    const protectionStartLevel = Number(protectionStartInput?.value ?? '2');
    if (Number.isFinite(protectionStartLevel)) {
      payload.protectionStartLevel = Math.max(2, Math.min(MAX_ENHANCE_LEVEL, Math.floor(protectionStartLevel)));
    }
    return payload;
  }
}

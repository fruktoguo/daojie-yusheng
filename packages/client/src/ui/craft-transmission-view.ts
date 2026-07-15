/**
 * 本文件负责工坊中的传功、功法书分解与抄录视图。
 *
 * 服务端仍是领悟进度、传功任务和资产结算的唯一权威；本视图只维护筛选、选择、
 * 局部 DOM 更新和确认弹层等客户端表现状态。
 */
import type {
  C2S_RequestTechniqueTransmissionStatuses,
  ItemStack,
  PlayerState,
  S2C_TechniqueTransmissionStatuses,
  TechniqueCategory,
  TechniqueComprehensionProgressBreakdown,
  TechniqueGrade,
} from '@mud/shared';
import {
  TECHNIQUE_GRADE_ORDER,
  calculateTechniqueBookCraftFragmentCost,
  calculateTechniqueBookDecomposeFragments,
  calculateTechniqueComprehensionProgressBreakdown,
  getItemDisplayName,
  isCreatedTechniqueId,
  isTechniqueFullyMastered,
} from '@mud/shared';
import { getLocalRealmLevelEntry, getLocalTechniqueTemplate, resolveClientTechniqueName } from '../content/local-templates';
import { getItemTypeLabel, getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplayNumber, formatDisplaySignedNumber } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { t } from './i18n';
import { getItemDecorClassName, getItemDisplayMeta } from './item-display';

type TechniqueBookCraftGradeFilter = 'all' | TechniqueGrade;
type TechniqueBookCraftCategoryFilter = 'all' | TechniqueCategory;
type TransmissionTechniqueStatus = 'idle' | 'loading' | 'learned' | 'unlearned' | 'unavailable';

export type CraftTransmissionCallbacks = {
  onStartTransmission?: (
    learnerPlayerId: string,
    techId: string,
    options?: {
      mode?: 'transmission' | 'craft_book' | 'scripture_recording' | 'scripture_contemplation';
      maxLevel?: number;
      buildingId?: string;
    },
  ) => void;
  onCancelTransmission?: (techId: string) => void;
  onRequestTransmissionStatuses?: (payload: C2S_RequestTechniqueTransmissionStatuses) => void;
  getTransmissionTargets?: () => Array<{ playerId: string; name: string }>;
};

/** @internal 传功子视图只通过这些显式端口读取工坊共享状态。 */
export interface CraftTransmissionParent {
  readonly activeMode: string | null;
  readonly transmissionSkillLevel: number;
  readonly transmissionTechniques: PlayerState['techniques'];
  readonly pendingTechniqueComprehensions: PlayerState['pendingTechniqueComprehensions'];
  readonly playerRealmLv: number | null;
  readonly inventory: PlayerState['inventory'];
  readonly callbacks: (CraftTransmissionCallbacks & {
    onDecomposeTechniqueBook?: (itemInstanceId: string, count: number) => void;
  }) | null;
  patchOpenCraftShell(): void;
}

const TECHNIQUE_REFINING_CONFIRM_OWNER = 'craft-workbench-modal:technique-refining-confirm';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
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

function formatComprehensionRate(rate: number | undefined): string {
  const normalized = Number(rate);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '0/息';
  }
  return `${formatDisplayNumber(normalized, {
    maximumFractionDigits: 2,
    compactThreshold: Number.POSITIVE_INFINITY,
  })}/息`;
}

function formatComprehensionBonusPercent(value: number): string {
  return `${formatDisplaySignedNumber(value, {
    maximumFractionDigits: 1,
    compactThreshold: Number.POSITIVE_INFINITY,
  })}%`;
}

function formatComprehensionFactorBonus(factor: number | undefined): string {
  const normalized = Number(factor);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '+0%';
  }
  return formatComprehensionBonusPercent(((1 / normalized) - 1) * 100);
}

function formatComprehensionProgressBreakdown(
  breakdown: TechniqueComprehensionProgressBreakdown | null | undefined,
): string {
  if (!breakdown || !Number.isFinite(Number(breakdown.progressGain)) || Number(breakdown.progressGain) <= 0) {
    return '';
  }
  const parts = [
    `基准 ${formatComprehensionRate(breakdown.baseProgress)}`,
    `境界差 ${formatComprehensionFactorBonus(breakdown.realmFactor)}`,
    `自身传法 ${formatComprehensionFactorBonus(breakdown.learnerTransmissionFactor)}`,
  ];
  if (breakdown.teacherTransmissionFactor !== undefined) {
    parts.push(`传授者传法 ${formatComprehensionFactorBonus(breakdown.teacherTransmissionFactor)}`);
  }
  const ownSpeedRate = Number(breakdown.learnerTransmissionSpeedRate);
  if (Number.isFinite(ownSpeedRate) && ownSpeedRate > 0) {
    parts.push(`自身速度 ${formatComprehensionBonusPercent(ownSpeedRate * 100)}`);
  }
  const otherSpeedRate = Number(breakdown.teacherTransmissionSpeedRate);
  if (Number.isFinite(otherSpeedRate) && otherSpeedRate > 0) {
    parts.push(`对方速度 ${formatComprehensionBonusPercent(otherSpeedRate * 100)}`);
  } else {
    const totalSpeedRate = Number(breakdown.transmissionSpeedRate);
    if (Number.isFinite(totalSpeedRate) && totalSpeedRate > 0 && !(ownSpeedRate > 0)) {
      parts.push(`传法速度 ${formatComprehensionBonusPercent(totalSpeedRate * 100)}`);
    }
  }
  const totalBonus = breakdown.baseProgress > 0
    ? ((breakdown.progressGain / breakdown.baseProgress) - 1) * 100
    : 0;
  parts.push(`合计 ${formatComprehensionBonusPercent(totalBonus)}`);
  return `速率构成：${parts.join(' · ')}`;
}

export class CraftTransmissionView {
  private transmissionCallbacks: CraftTransmissionCallbacks | null = null;
  private lastTransmissionRenderKey: string | null = null;
  private readonly selectedTechniqueBookIds = new Set<string>();
  private selectedTechniqueBookCount = 1;
  private techniqueBookCraftGradeFilter: TechniqueBookCraftGradeFilter = 'all';
  private techniqueBookCraftCategoryFilter: TechniqueBookCraftCategoryFilter = 'all';
  private selectedTransmissionTechniqueId = '';
  private selectedTransmissionTargetPlayerId = '';
  private transmissionStatusRequestSequence = 0;
  private activeTransmissionStatusRequest: { requestId: string; targetPlayerId: string; signature: string } | null = null;
  private resolvedTransmissionStatusSignature = '';
  private transmissionStatusTargetPlayerId = '';
  private readonly transmissionLearnedByTechniqueId = new Map<string, boolean>();

  constructor(private readonly parent: CraftTransmissionParent) {}

  setCallbacks(callbacks: CraftTransmissionCallbacks): void {
    this.transmissionCallbacks = callbacks;
  }

  handleTransmissionStatuses(data: S2C_TechniqueTransmissionStatuses): void {
    const activeRequest = this.activeTransmissionStatusRequest;
    if (!activeRequest || data.requestId !== activeRequest.requestId || data.targetPlayerId !== activeRequest.targetPlayerId) {
      return;
    }
    this.activeTransmissionStatusRequest = null;
    this.resolvedTransmissionStatusSignature = activeRequest.signature;
    this.transmissionStatusTargetPlayerId = data.targetPlayerId;
    this.transmissionLearnedByTechniqueId.clear();
    for (const technique of data.techniques ?? []) {
      const techId = typeof technique?.techId === 'string' ? technique.techId.trim() : '';
      if (techId) {
        this.transmissionLearnedByTechniqueId.set(techId, technique.learned === true);
      }
    }
    if (this.parent.activeMode !== 'transmission') {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    if (body instanceof HTMLElement) {
      this.patchTransmissionTechniqueOptions(body);
    }
  }

  resetTechniqueRefiningSelection(): void {
    this.selectedTechniqueBookIds.clear();
    this.selectedTechniqueBookCount = 1;
  }

  closeTransientUi(): void {
    confirmModalHost.close(TECHNIQUE_REFINING_CONFIRM_OWNER);
    this.lastTransmissionRenderKey = null;
    this.selectedTransmissionTechniqueId = '';
    this.selectedTransmissionTargetPlayerId = '';
    this.activeTransmissionStatusRequest = null;
    this.resolvedTransmissionStatusSignature = '';
    this.transmissionStatusTargetPlayerId = '';
    this.transmissionLearnedByTechniqueId.clear();
  }

  buildTransmissionRenderKey(): string {
    return [
      this.parent.transmissionTechniques
        .map((tech) => [
          tech.techId,
          tech.name ?? '',
          tech.grade ?? '',
          tech.category ?? '',
          tech.realmLv ?? '',
        ].join(':'))
        .join(','),
      (this.parent.pendingTechniqueComprehensions ?? [])
        .map((entry) => [
          entry.techId,
          entry.name ?? '',
          entry.requiredProgress ?? '',
          entry.selfComprehensionAllowed === false ? 'blocked' : 'self',
          entry.activeTransferJob?.status ?? 'none',
        ].join(':'))
        .join(','),
      this.getTransmissionTargets().map((target) => `${target.playerId}:${target.name}`).join(','),
    ].join('|');
  }

  tryPatchTransmissionBody(body: HTMLElement): boolean {
    if (this.parent.activeMode !== 'transmission') {
      return false;
    }
    const content = body.querySelector<HTMLElement>('[data-craft-workbench-content="true"]');
    if (!content) {
      return false;
    }
    const nextKey = this.buildTransmissionRenderKey();
    const hasTransmissionPanel = content.querySelector('[data-transmission-panel="true"]') !== null;
    if (!hasTransmissionPanel || this.lastTransmissionRenderKey !== nextKey) {
      if (this.shouldDeferTransmissionContentPatch(content)) {
        this.patchTransmissionProgress(content);
        return true;
      }
      this.lastTransmissionRenderKey = nextKey;
      replaceElementHtml(content, this.renderTransmissionBody());
      this.patchTransmissionProgress(content);
      this.requestTransmissionStatuses(content);
      return true;
    }
    this.patchTransmissionProgress(content);
    return true;
  }

  private patchTransmissionProgress(content: HTMLElement): void {
    for (const entry of this.parent.pendingTechniqueComprehensions ?? []) {
      const escapedTechId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(entry.techId)
        : entry.techId.replaceAll('"', '\\"');
      const card = content.querySelector<HTMLElement>(`[data-transmission-pending="${escapedTechId}"]`);
      if (!card) {
        continue;
      }
      const required = Math.max(1, Math.floor(Number(entry.requiredProgress) || 1));
      const progress = Math.max(0, Math.floor(Number(entry.progress) || 0));
      const ratio = Math.max(0, Math.min(1, progress / required));
      const job = entry.activeTransferJob ?? null;
      const status = job
        ? (job.status === 'blocked' ? '等待传授' : '传授中')
        : entry.selfComprehensionAllowed === false ? '等待传法' : '自行领悟';
      const rate = this.resolveTransmissionPendingRate(entry);
      const estimate = this.resolveTransmissionPendingEstimate(entry, rate);
      const rateText = rate > 0 ? ` · 速率 ${formatComprehensionRate(rate)}` : '';
      const estimateText = estimate > 0 ? ` · 预计 ${formatTicks(estimate)}` : '';
      const factorText = formatComprehensionProgressBreakdown(this.resolveTransmissionPendingBreakdown(entry));
      const pendingTextNode = card.querySelector<HTMLElement>('[data-transmission-pending-progress-text="true"]');
      if (pendingTextNode) {
        pendingTextNode.textContent = `${status} · ${formatDisplayInteger(progress)} / ${formatDisplayInteger(required)}${rateText}${estimateText}`;
      }
      const pendingFactorNode = card.querySelector<HTMLElement>('[data-transmission-pending-factor-text="true"]');
      if (pendingFactorNode) {
        pendingFactorNode.textContent = factorText;
        pendingFactorNode.hidden = factorText.length === 0;
      }
      const pendingFillNode = card.querySelector<HTMLElement>('[data-transmission-pending-progress-fill="true"]');
      if (pendingFillNode) {
        pendingFillNode.style.width = `${(ratio * 100).toFixed(2)}%`;
      }
    }
  }

  private shouldDeferTransmissionContentPatch(content: HTMLElement): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement
      && content.contains(active)
      && (active.matches('input, select, textarea') || active.closest('[data-transmission-tech-search], [data-transmission-tech-select], [data-transmission-target-select]') !== null);
  }

  tryPatchTechniqueRefiningBody(body: HTMLElement): boolean {
    if (this.parent.activeMode !== 'technique_refining') {
      return false;
    }
    const panel = body.querySelector<HTMLElement>('[data-technique-refining-panel="true"]');
    if (!panel) {
      return false;
    }
    const books = this.getTechniqueBookInventoryItems();
    if (panel.dataset.techniqueRefiningBooksKey !== this.buildTechniqueRefiningBooksKey(books)) {
      return false;
    }
    if (panel.dataset.techniqueRefiningCraftKey !== this.buildTechniqueBookCraftPickerKey()) {
      return false;
    }
    const selectedItems = this.getSelectedTechniqueBookItems();
    const availableIds = new Set(books.map((item) => this.getItemInstanceId(item)).filter(Boolean));
    let selectionChanged = false;
    for (const itemInstanceId of [...this.selectedTechniqueBookIds]) {
      if (!availableIds.has(itemInstanceId)) {
        this.selectedTechniqueBookIds.delete(itemInstanceId);
        selectionChanged = true;
      }
    }
    const nextSelectedItems = selectionChanged ? this.getSelectedTechniqueBookItems() : selectedItems;
    const singleSelected = nextSelectedItems.length === 1 ? nextSelectedItems[0] : null;
    const maxCount = singleSelected ? Math.max(1, Math.floor(Number(singleSelected.count) || 1)) : 1;
    if (singleSelected && this.selectedTechniqueBookCount > maxCount) {
      this.selectedTechniqueBookCount = maxCount;
    }
    const booksMode = panel.querySelector<HTMLElement>('[data-technique-refining-book-count="true"]');
    if (booksMode) {
      booksMode.textContent = `${formatDisplayInteger(books.length)} 种功法书`;
    }
    const fragmentMode = panel.querySelector<HTMLElement>('[data-technique-refining-fragment-total="true"]');
    if (fragmentMode) {
      fragmentMode.textContent = `${formatDisplayInteger(this.calculateSelectedTechniqueBookFragments(nextSelectedItems))} 张功法残页`;
    }
    for (const item of books) {
      const itemInstanceId = this.getItemInstanceId(item);
      if (!itemInstanceId) {
        continue;
      }
      const selector = `[data-item-instance-id="${this.escapeCssAttrSelector(itemInstanceId)}"]`;
      const cell = panel.querySelector<HTMLElement>(selector);
      if (!cell) {
        continue;
      }
      const selected = this.selectedTechniqueBookIds.has(itemInstanceId);
      cell.classList.toggle('active', selected);
      cell.querySelector<HTMLElement>('.inventory-cell-learned-ribbon')?.toggleAttribute('hidden', !selected);
      const countNode = cell.querySelector<HTMLElement>('.inventory-cell-count');
      if (countNode) {
        countNode.textContent = formatDisplayInteger(Math.max(1, Math.floor(Number(item.count) || 1)));
      }
    }
    const summary = panel.querySelector<HTMLElement>('[data-technique-refining-selection-summary="true"]');
    if (!summary) {
      return false;
    }
    const summaryKey = this.buildTechniqueRefiningSelectionSummaryKey(nextSelectedItems, maxCount);
    if (summary.dataset.techniqueRefiningSummaryKey !== summaryKey) {
      replaceElementHtml(summary, this.renderTechniqueRefiningSelectionSummaryContent(nextSelectedItems, maxCount));
      summary.dataset.techniqueRefiningSummaryKey = summaryKey;
    } else {
      this.patchTechniqueRefiningTotals(panel);
    }
    return true;
  }

  private patchTechniqueRefiningTotals(root: HTMLElement): void {
    const selectedItems = this.getSelectedTechniqueBookItems();
    const singleSelected = selectedItems.length === 1 ? selectedItems[0] : null;
    const maxCount = singleSelected ? Math.max(1, Math.floor(Number(singleSelected.count) || 1)) : 1;
    if (singleSelected) {
      this.selectedTechniqueBookCount = Math.max(1, Math.min(maxCount, this.selectedTechniqueBookCount));
    }
    const totalFragments = this.calculateSelectedTechniqueBookFragments(selectedItems);
    const summary = root.querySelector<HTMLElement>('[data-technique-refining-selection-summary="true"]');
    if (summary) {
      summary.dataset.techniqueRefiningSummaryKey = this.buildTechniqueRefiningSelectionSummaryKey(selectedItems, maxCount);
    }
    const fragmentMode = root.querySelector<HTMLElement>('[data-technique-refining-fragment-total="true"]');
    if (fragmentMode) {
      fragmentMode.textContent = `${formatDisplayInteger(totalFragments)} 张功法残页`;
    }
    const countLabel = root.querySelector<HTMLElement>('[data-technique-refining-count-label="true"]');
    if (countLabel) {
      countLabel.textContent = `${formatDisplayInteger(Math.max(1, Math.min(maxCount, this.selectedTechniqueBookCount)))}/${formatDisplayInteger(maxCount)}`;
    }
    const totalHint = root.querySelector<HTMLElement>('[data-technique-refining-total-hint="true"]');
    if (totalHint) {
      totalHint.textContent = `${formatDisplayInteger(totalFragments)} 张`;
    }
  }

  renderTransmissionBody(): string {
    this.lastTransmissionRenderKey = this.buildTransmissionRenderKey();
    const pending = this.parent.pendingTechniqueComprehensions ?? [];
    const learned = this.getTransmittableTechniques();
    const targets = this.getTransmissionTargets();
    return `
      <div class="alchemy-tab-stack" data-transmission-panel="true">
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">未领悟功法</div>
            <span class="alchemy-summary-mode">${formatDisplayInteger(pending.length)} 门</span>
          </div>
          <div class="enhancement-candidate-list">
            ${pending.length > 0 ? pending.map((entry) => this.renderTransmissionPendingRow(entry)).join('') : '<div class="empty-hint">暂无未领悟功法</div>'}
          </div>
        </section>
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">传授功法</div>
            <span class="alchemy-summary-mode">${formatDisplayInteger(learned.length)} 门可传 · ${formatDisplayInteger(targets.length)} 人附近</span>
          </div>
          ${this.renderTransmissionTeachPicker(learned, targets)}
        </section>
      </div>
    `;
  }

  private getTransmissionTargets(): Array<{ playerId: string; name: string }> {
    return this.transmissionCallbacks?.getTransmissionTargets?.()
      ?? this.parent.callbacks?.getTransmissionTargets?.()
      ?? [];
  }

  private requestTransmissionStatuses(root: ParentNode): void {
    const targetSelect = root.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]');
    const targetPlayerId = (targetSelect?.value ?? '').trim();
    const techniqueIds = this.getTransmittableTechniques().map((technique) => technique.techId);
    this.selectedTransmissionTargetPlayerId = targetPlayerId;
    if (!targetPlayerId || techniqueIds.length === 0) {
      this.activeTransmissionStatusRequest = null;
      this.resolvedTransmissionStatusSignature = '';
      this.transmissionStatusTargetPlayerId = targetPlayerId;
      this.transmissionLearnedByTechniqueId.clear();
      this.patchTransmissionTechniqueOptions(root);
      return;
    }
    const signature = `${targetPlayerId}|${techniqueIds.join(',')}`;
    if (this.activeTransmissionStatusRequest?.signature === signature
      || this.resolvedTransmissionStatusSignature === signature) {
      this.patchTransmissionTechniqueOptions(root);
      return;
    }
    const requestId = `transmission-status:${++this.transmissionStatusRequestSequence}`;
    this.activeTransmissionStatusRequest = { requestId, targetPlayerId, signature };
    this.resolvedTransmissionStatusSignature = '';
    this.transmissionStatusTargetPlayerId = targetPlayerId;
    this.transmissionLearnedByTechniqueId.clear();
    this.patchTransmissionTechniqueOptions(root);
    const request = this.transmissionCallbacks?.onRequestTransmissionStatuses
      ?? this.parent.callbacks?.onRequestTransmissionStatuses;
    if (!request) {
      this.activeTransmissionStatusRequest = null;
      this.resolvedTransmissionStatusSignature = signature;
      this.patchTransmissionTechniqueOptions(root);
      return;
    }
    request({ requestId, targetPlayerId });
  }

  private patchTransmissionTechniqueOptions(root: ParentNode): void {
    const targetSelect = root.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]');
    const techniqueSelect = root.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]');
    if (!techniqueSelect) {
      return;
    }
    const targetPlayerId = (targetSelect?.value ?? '').trim();
    const loading = Boolean(targetPlayerId) && (
      this.transmissionStatusTargetPlayerId !== targetPlayerId
      || this.activeTransmissionStatusRequest?.targetPlayerId === targetPlayerId
    );
    for (const option of Array.from(techniqueSelect.options)) {
      const techId = option.value.trim();
      if (!techId) {
        option.textContent = !targetPlayerId
          ? '请先选择目标玩家'
          : loading ? '正在查询功法状态' : '请选择要传授的功法';
        continue;
      }
      const label = option.dataset.transmissionTechniqueLabel ?? option.textContent ?? techId;
      const status = this.resolveTransmissionTechniqueStatus(targetPlayerId, techId);
      option.dataset.transmissionTechniqueLabel = label;
      option.dataset.transmissionTechniqueStatus = status;
      option.textContent = `${label} · ${this.getTransmissionTechniqueStatusLabel(status)}`;
      option.disabled = status === 'learned' || status === 'unavailable';
    }
    const hasVisibleTechnique = Array.from(techniqueSelect.options)
      .some((option) => Boolean(option.value.trim()) && !option.hidden);
    techniqueSelect.disabled = !targetPlayerId || loading || !hasVisibleTechnique;
    const searchInput = root.querySelector<HTMLInputElement>('[data-transmission-tech-search="true"]');
    if (searchInput) {
      searchInput.disabled = !targetPlayerId || loading;
    }
    this.syncTransmissionStartButton(root);
  }

  private resolveTransmissionTechniqueStatus(targetPlayerId: string, techId: string): TransmissionTechniqueStatus {
    if (!targetPlayerId) {
      return 'idle';
    }
    if (this.transmissionStatusTargetPlayerId !== targetPlayerId
      || this.activeTransmissionStatusRequest?.targetPlayerId === targetPlayerId) {
      return 'loading';
    }
    if (!this.transmissionLearnedByTechniqueId.has(techId)) {
      return 'unavailable';
    }
    return this.transmissionLearnedByTechniqueId.get(techId) === true ? 'learned' : 'unlearned';
  }

  private getTransmissionTechniqueStatusLabel(status: TransmissionTechniqueStatus): string {
    if (status === 'learned') {
      return '已学';
    }
    if (status === 'unlearned') {
      return '未学';
    }
    if (status === 'unavailable') {
      return '不可用';
    }
    if (status === 'idle') {
      return '待选择玩家';
    }
    return '查询中';
  }

  private getTransmittableTechniques(): PlayerState['techniques'] {
    return (this.parent.transmissionTechniques ?? []).filter((tech) => {
      if (!isCreatedTechniqueId(tech.techId)) {
        return false;
      }
      const template = getLocalTechniqueTemplate(tech.techId);
      return isTechniqueFullyMastered({
        level: tech.level,
        layers: Array.isArray(template?.layers) && template.layers.length > 0
          ? template.layers
          : tech.layers,
      });
    });
  }

  private getTransmissionTechniqueMetaText(tech: PlayerState['techniques'][number]): string {
    const gradeLabel = getTechniqueGradeLabel(tech.grade);
    const categoryLabel = getTechniqueCategoryLabel(tech.category);
    const realmLv = Math.max(1, Math.floor(Number(tech.realmLv) || 1));
    const realmLabel = getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
    return [gradeLabel, categoryLabel, realmLabel].join(' · ');
  }

  private getTechniqueBookCraftCandidates(): PlayerState['techniques'] {
    return (this.parent.transmissionTechniques ?? [])
      .map((tech) => this.resolveTechniqueBookCraftCandidate(tech))
      .filter((tech): tech is PlayerState['techniques'][number] => Boolean(tech));
  }

  private getFilteredTechniqueBookCraftCandidates(): PlayerState['techniques'] {
    return this.getTechniqueBookCraftCandidates().filter((tech) => {
      if (this.techniqueBookCraftGradeFilter !== 'all' && tech.grade !== this.techniqueBookCraftGradeFilter) {
        return false;
      }
      if (this.techniqueBookCraftCategoryFilter !== 'all' && tech.category !== this.techniqueBookCraftCategoryFilter) {
        return false;
      }
      return true;
    });
  }

  private resolveTechniqueBookCraftCandidate(
    tech: PlayerState['techniques'][number] | undefined,
  ): PlayerState['techniques'][number] | null {
    const techId = typeof tech?.techId === 'string' && tech.techId.trim() ? tech.techId.trim() : '';
    if (!techId || !isCreatedTechniqueId(techId)) {
      return null;
    }
    const template = getLocalTechniqueTemplate(techId);
    const category = (tech?.category ?? template?.category) as TechniqueCategory | undefined;
    if (category === 'divine') {
      return null;
    }
    const candidate = {
      ...tech,
      techId,
      name: resolveClientTechniqueName(techId, tech?.name, template?.name),
      grade: tech?.grade ?? template?.grade,
      category: category ?? (template?.skills?.length ? 'arts' : 'internal'),
      realmLv: tech?.realmLv ?? template?.realmLv,
      layers: Array.isArray(template?.layers) && template.layers.length > 0
        ? template.layers
        : (tech?.layers ?? []),
    } as PlayerState['techniques'][number];
    return isTechniqueFullyMastered(candidate) ? candidate : null;
  }

  private renderTransmissionPendingRow(
    entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number],
  ): string {
    const required = Math.max(1, Math.floor(Number(entry.requiredProgress) || 1));
    const progress = Math.max(0, Math.floor(Number(entry.progress) || 0));
    const ratio = Math.max(0, Math.min(1, progress / required));
    const job = entry.activeTransferJob ?? null;
    const status = job
      ? (job.status === 'blocked' ? '等待传授' : '传授中')
      : entry.selfComprehensionAllowed === false ? '等待传法' : '自行领悟';
    const rate = this.resolveTransmissionPendingRate(entry);
    const estimate = this.resolveTransmissionPendingEstimate(entry, rate);
    const rateText = rate > 0 ? ` · 速率 ${formatComprehensionRate(rate)}` : '';
    const estimateText = estimate > 0 ? ` · 预计 ${formatTicks(estimate)}` : '';
    const factorText = formatComprehensionProgressBreakdown(this.resolveTransmissionPendingBreakdown(entry));
    return `
      <div class="enhancement-candidate-card" data-transmission-pending="${escapeHtmlAttr(entry.techId)}">
        <div class="enhancement-candidate-main">
          <strong>${escapeHtml(resolveClientTechniqueName(entry.techId, entry.name))}</strong>
          <span data-transmission-pending-progress-text="true">${escapeHtml(status)} · ${formatDisplayInteger(progress)} / ${formatDisplayInteger(required)}${escapeHtml(rateText)}${escapeHtml(estimateText)}</span>
          <span class="transmission-factor-breakdown" data-transmission-pending-factor-text="true"${factorText.length === 0 ? ' hidden' : ''}>${escapeHtml(factorText)}</span>
        </div>
        <div class="attr-craft-exp">
          <div class="attr-craft-exp-track" aria-hidden="true">
            <span class="attr-craft-exp-fill" data-transmission-pending-progress-fill="true" style="width:${(ratio * 100).toFixed(2)}%"></span>
          </div>
        </div>
        ${job ? `<button class="small-btn danger" type="button" data-craft-action="transmission-cancel" data-tech-id="${escapeHtmlAttr(entry.techId)}">取消传法</button>` : ''}
      </div>
    `;
  }

  private resolveTransmissionPendingRate(
    entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number],
  ): number {
    const jobRate = Number(entry.activeTransferJob?.progressGainPerTick);
    if (Number.isFinite(jobRate) && jobRate > 0) {
      return jobRate;
    }
    if (entry.selfComprehensionAllowed === false) {
      return 0;
    }
    return calculateTechniqueComprehensionProgressBreakdown({
      baseProgress: 1,
      techniqueRealmLv: Math.max(1, Math.floor(Number(entry.realmLv) || 1)),
      learnerRealmLv: Math.max(1, Math.floor(Number(this.parent.playerRealmLv) || 1)),
      learnerTransmissionLevel: this.parent.transmissionSkillLevel,
    }).progressGain;
  }

  private resolveTransmissionPendingBreakdown(
    entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number],
  ): TechniqueComprehensionProgressBreakdown | null {
    if (entry.activeTransferJob?.progressBreakdown) {
      return entry.activeTransferJob.progressBreakdown;
    }
    if (entry.selfComprehensionAllowed === false) {
      return null;
    }
    return calculateTechniqueComprehensionProgressBreakdown({
      baseProgress: 1,
      techniqueRealmLv: Math.max(1, Math.floor(Number(entry.realmLv) || 1)),
      learnerRealmLv: Math.max(1, Math.floor(Number(this.parent.playerRealmLv) || 1)),
      learnerTransmissionLevel: this.parent.transmissionSkillLevel,
    });
  }

  private resolveTransmissionPendingEstimate(
    entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number],
    rate: number,
  ): number {
    const jobEstimate = Number(entry.activeTransferJob?.estimatedRemainingTicks);
    if (Number.isFinite(jobEstimate) && jobEstimate >= 0) {
      return jobEstimate;
    }
    const required = Math.max(1, Number(entry.requiredProgress) || 1);
    const progress = Math.max(0, Number(entry.progress) || 0);
    const remaining = Math.max(0, required - Math.min(required, progress));
    return Number.isFinite(rate) && rate > 0 && remaining > 0
      ? Math.max(1, Math.ceil(remaining / rate))
      : 0;
  }

  private renderTransmissionTeachPicker(
    techniques: PlayerState['techniques'],
    targets: Array<{ playerId: string; name: string }>,
  ): string {
    if (techniques.length === 0) {
      return '<div class="empty-hint">暂无可传授自创功法</div>';
    }
    const selectedTargetPlayerId = targets.some((target) => target.playerId === this.selectedTransmissionTargetPlayerId)
      ? this.selectedTransmissionTargetPlayerId
      : '';
    if (selectedTargetPlayerId !== this.selectedTransmissionTargetPlayerId) {
      this.selectedTransmissionTechniqueId = '';
    }
    this.selectedTransmissionTargetPlayerId = selectedTargetPlayerId;
    const selectedTechniqueId = selectedTargetPlayerId
      && techniques.some((tech) => tech.techId === this.selectedTransmissionTechniqueId)
      ? this.selectedTransmissionTechniqueId
      : '';
    this.selectedTransmissionTechniqueId = selectedTechniqueId;
    const targetOptions = targets.length > 0
      ? `<option value=""${selectedTargetPlayerId ? '' : ' selected'}>请选择目标玩家</option>${targets.map((target) => this.renderTransmissionTargetOption(target, selectedTargetPlayerId)).join('')}`
      : '<option value="">附近无可传授玩家</option>';
    const loading = Boolean(selectedTargetPlayerId) && (
      this.transmissionStatusTargetPlayerId !== selectedTargetPlayerId
      || this.activeTransmissionStatusRequest?.targetPlayerId === selectedTargetPlayerId
    );
    const techniquePlaceholder = !selectedTargetPlayerId
      ? '请先选择目标玩家'
      : loading ? '正在查询功法状态' : '请选择要传授的功法';
    const techniqueOptions = `<option value=""${selectedTechniqueId ? '' : ' selected'}>${techniquePlaceholder}</option>${techniques
      .map((tech) => this.renderTransmissionTechniqueOption(tech, selectedTargetPlayerId, selectedTechniqueId))
      .join('')}`;
    const targetSelectDisabled = targets.length === 0 ? 'disabled' : '';
    const techniqueControlsDisabled = !selectedTargetPlayerId || loading ? 'disabled' : '';
    const selectedTechniqueStatus = selectedTechniqueId
      ? this.resolveTransmissionTechniqueStatus(selectedTargetPlayerId, selectedTechniqueId)
      : 'idle';
    const startDisabled = selectedTechniqueStatus === 'unlearned' ? '' : 'disabled';
    return `
      <div class="transmission-teach-picker">
        <select class="ui-input" data-transmission-target-select="true" aria-label="目标玩家" ${targetSelectDisabled}>
          ${targetOptions}
        </select>
        <input class="ui-search-input" type="search" data-transmission-tech-search="true" placeholder="搜索自创功法" aria-label="搜索可传功法" ${techniqueControlsDisabled}>
        <select class="ui-input" data-transmission-tech-select="true" aria-label="传授功法" ${techniqueControlsDisabled}>
          ${techniqueOptions}
        </select>
        <button class="small-btn" type="button" data-craft-action="transmission-start" ${startDisabled}>传授</button>
      </div>
    `;
  }

  private renderTransmissionTargetOption(
    target: { playerId: string; name: string },
    selectedTargetPlayerId: string,
  ): string {
    const selected = target.playerId === selectedTargetPlayerId ? ' selected' : '';
    return `<option value="${escapeHtmlAttr(target.playerId)}"${selected}>${escapeHtml(target.name)}</option>`;
  }

  private renderTransmissionTechniqueOption(
    technique: PlayerState['techniques'][number],
    targetPlayerId: string,
    selectedTechniqueId: string,
  ): string {
    const metaText = this.getTransmissionTechniqueMetaText(technique);
    const label = `${resolveClientTechniqueName(technique.techId, technique.name)} · ${metaText}`;
    const search = `${technique.name ?? ''} ${technique.techId} ${metaText}`.toLowerCase();
    const status = this.resolveTransmissionTechniqueStatus(targetPlayerId, technique.techId);
    const disabled = status === 'learned' || status === 'unavailable' ? ' disabled' : '';
    const selected = technique.techId === selectedTechniqueId ? ' selected' : '';
    return `<option value="${escapeHtmlAttr(technique.techId)}" data-search="${escapeHtmlAttr(search)}" data-transmission-technique-label="${escapeHtmlAttr(label)}" data-transmission-technique-status="${status}"${selected}${disabled}>${escapeHtml(label)} · ${this.getTransmissionTechniqueStatusLabel(status)}</option>`;
  }

  private renderTransmissionBookCraftPicker(techniques: PlayerState['techniques']): string {
    const filteredTechniques = this.getFilteredTechniqueBookCraftCandidates();
    const gradeOptions = [
      `<option value="all"${this.techniqueBookCraftGradeFilter === 'all' ? ' selected' : ''}>全部品阶</option>`,
      ...TECHNIQUE_GRADE_ORDER.map((grade) => `<option value="${escapeHtmlAttr(grade)}"${this.techniqueBookCraftGradeFilter === grade ? ' selected' : ''}>${escapeHtml(getTechniqueGradeLabel(grade))}</option>`),
    ].join('');
    const categoryOptions = ([
      ['all', '全部类型'],
      ['arts', getTechniqueCategoryLabel('arts')],
      ['internal', getTechniqueCategoryLabel('internal')],
      ['divine', getTechniqueCategoryLabel('divine')],
      ['secret', getTechniqueCategoryLabel('secret')],
    ] as Array<[TechniqueBookCraftCategoryFilter, string]>)
      .map(([category, label]) => `<option value="${escapeHtmlAttr(category)}"${this.techniqueBookCraftCategoryFilter === category ? ' selected' : ''}>${escapeHtml(label)}</option>`)
      .join('');
    const filterControls = `
      <div class="transmission-book-craft-filters">
        <select class="ui-input" data-transmission-book-grade-filter="true" aria-label="抄录功法品阶筛选">
          ${gradeOptions}
        </select>
        <select class="ui-input" data-transmission-book-category-filter="true" aria-label="抄录功法类型筛选">
          ${categoryOptions}
        </select>
      </div>
    `;
    if (techniques.length === 0) {
      return `${filterControls}<div class="empty-hint">暂无可抄录的自创功法</div>`;
    }
    if (filteredTechniques.length === 0) {
      return `${filterControls}<div class="empty-hint">当前筛选下暂无可抄录功法</div>`;
    }
    const techniqueOptions = filteredTechniques.map((tech) => {
      const metaText = this.getTransmissionTechniqueMetaText(tech);
      const maxLevel = this.resolveTechniqueMaxLevel(tech);
      const search = `${tech.name ?? ''} ${tech.techId} ${metaText}`.toLowerCase();
      return `<option value="${escapeHtmlAttr(tech.techId)}" data-search="${escapeHtmlAttr(search)}" data-max-level="${maxLevel}">${escapeHtml(resolveClientTechniqueName(tech.techId, tech.name))} · ${escapeHtml(metaText)} · 满层 ${formatDisplayInteger(maxLevel)} 层</option>`;
    }).join('');
    const firstMaxLevel = this.resolveTechniqueMaxLevel(filteredTechniques[0]);
    const firstCost = this.calculateTechniqueBookCraftCost(filteredTechniques[0], firstMaxLevel);
    return `
      ${filterControls}
      <div class="transmission-teach-picker transmission-book-craft-picker">
        <input class="ui-search-input" type="search" data-transmission-book-search="true" placeholder="搜索要抄录的功法">
        <select class="ui-input" data-transmission-book-tech-select="true">
          ${techniqueOptions}
        </select>
        <input class="ui-input" type="number" min="1" max="${firstMaxLevel}" value="${firstMaxLevel}" data-transmission-book-level-input="true" aria-label="功法书层数">
        <span class="alchemy-summary-mode" data-transmission-book-cost-text="true">消耗 ${formatDisplayInteger(firstCost)} 张残页 · 抄录至 ${formatDisplayInteger(firstMaxLevel)} 层</span>
        <button class="small-btn" type="button" data-craft-action="transmission-craft-book">抄录</button>
      </div>
    `;
  }

  private resolveTechniqueMaxLevel(tech: PlayerState['techniques'][number] | undefined): number {
    const layerLevels = (tech?.layers ?? []).map((layer) => Math.max(1, Math.floor(Number(layer.level) || 1)));
    return Math.max(1, ...layerLevels, Math.floor(Number(tech?.level) || 1));
  }

  renderTechniqueRefiningBody(): string {
    const books = this.getTechniqueBookInventoryItems();
    const selectedItems = this.getSelectedTechniqueBookItems();
    const singleSelected = selectedItems.length === 1 ? selectedItems[0] : null;
    const maxCount = singleSelected ? Math.max(1, Math.floor(Number(singleSelected.count) || 1)) : 1;
    if (singleSelected && this.selectedTechniqueBookCount > maxCount) {
      this.selectedTechniqueBookCount = maxCount;
    }
    return `
      <div class="alchemy-tab-stack" data-technique-refining-panel="true" data-technique-refining-books-key="${escapeHtmlAttr(this.buildTechniqueRefiningBooksKey(books))}" data-technique-refining-craft-key="${escapeHtmlAttr(this.buildTechniqueBookCraftPickerKey())}">
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">功法书分解</div>
            <span class="alchemy-summary-mode" data-technique-refining-book-count="true">${formatDisplayInteger(books.length)} 种功法书</span>
          </div>
          ${books.length > 0 ? `
            <div class="inventory-grid treasure-vault-inventory-grid technique-refining-book-grid">
              ${books.map((item) => this.renderTechniqueBookCell(item)).join('')}
            </div>
          ` : '<div class="empty-hint">背包里暂无可分解功法书</div>'}
        </section>
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">预计获得</div>
            <span class="alchemy-summary-mode" data-technique-refining-fragment-total="true">${formatDisplayInteger(this.calculateSelectedTechniqueBookFragments(selectedItems))} 张功法残页</span>
          </div>
          <div data-technique-refining-selection-summary="true" data-technique-refining-summary-key="${escapeHtmlAttr(this.buildTechniqueRefiningSelectionSummaryKey(selectedItems, maxCount))}">
            ${this.renderTechniqueRefiningSelectionSummaryContent(selectedItems, maxCount)}
          </div>
        </section>
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">抄录功法</div>
            <span class="alchemy-summary-mode">消耗功法残页</span>
          </div>
          ${this.renderTransmissionBookCraftPicker(this.getTechniqueBookCraftCandidates())}
        </section>
      </div>
    `;
  }

  private renderTechniqueBookCell(item: ItemStack): string {
    const itemInstanceId = this.getItemInstanceId(item);
    const itemMeta = getItemDisplayMeta(item);
    const displayName = itemMeta.displayItem.name;
    const selected = itemInstanceId ? this.selectedTechniqueBookIds.has(itemInstanceId) : false;
    const gradeLine = itemMeta.gradeLabel ?? getItemTypeLabel(item.type);
    return `
      <button class="${getItemDecorClassName(`inventory-cell${selected ? ' active' : ''}`, item)}" type="button" data-craft-action="technique-refining-toggle-book" data-item-instance-id="${escapeHtmlAttr(itemInstanceId)}" aria-label="选择${escapeHtml(displayName)}">
        <div class="inventory-cell-head">
          <span class="inventory-cell-type">功法书</span>
          <span class="inventory-cell-count">${escapeHtml(formatDisplayInteger(Math.max(1, Math.floor(Number(item.count) || 1))))}</span>
        </div>
        <span class="inventory-cell-learned-ribbon" ${selected ? '' : 'hidden'}>已选</span>
        <div class="inventory-cell-grade-line">${escapeHtml(gradeLine)}</div>
        <div class="inventory-cell-name" aria-label="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
        ${itemMeta.levelLabel ? `<span class="item-card-chip item-card-chip--level">${escapeHtml(itemMeta.levelLabel)}</span>` : ''}
      </button>
    `;
  }

  private renderTechniqueRefiningSelectionSummaryContent(items: ItemStack[], maxCount: number): string {
    if (items.length === 0) {
      return '<div class="empty-hint">请选择一个或多个功法书。单选可指定数量，多选会按各自全数分解。</div>';
    }
    const isSingle = items.length === 1;
    const countControls = isSingle ? `
      <div class="technique-refining-count-controls">
        <span>分解数量</span>
        <input class="ui-input" type="number" min="1" max="${maxCount}" value="${Math.max(1, Math.min(maxCount, this.selectedTechniqueBookCount))}" data-technique-refining-count-input="true" aria-label="分解数量">
        <button class="small-btn ghost" type="button" data-craft-action="technique-refining-count" data-count="1">1</button>
        <button class="small-btn ghost" type="button" data-craft-action="technique-refining-count" data-count="${Math.max(1, Math.ceil(maxCount / 2))}">半数</button>
        <button class="small-btn ghost" type="button" data-craft-action="technique-refining-count" data-count="${maxCount}">全部</button>
        <strong data-technique-refining-count-label="true">${formatDisplayInteger(Math.max(1, Math.min(maxCount, this.selectedTechniqueBookCount)))}/${formatDisplayInteger(maxCount)}</strong>
      </div>
    ` : '';
    const totalFragments = this.calculateSelectedTechniqueBookFragments(items);
    return `
      <div class="technique-refining-summary-row ${isSingle ? '' : 'is-multi'}">
        <div class="alchemy-summary-metric">
          <span class="alchemy-summary-metric-label">预计获得</span>
          <strong class="alchemy-summary-metric-value" data-technique-refining-total-hint="true">${formatDisplayInteger(totalFragments)} 张</strong>
        </div>
        ${isSingle ? `<div class="alchemy-summary-metric">${countControls}</div>` : ''}
      </div>
      ${isSingle ? '' : '<div class="empty-hint">多选模式会分解所选每种功法书的全部数量。</div>'}
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right">
          <button class="small-btn danger" type="button" data-craft-action="technique-refining-decompose">确认分解</button>
        </div>
      </div>
    `;
  }

  private calculateTechniqueBookFragments(item: ItemStack): number {
    const technique = typeof item.learnTechniqueId === 'string' && item.learnTechniqueId.trim()
      ? getLocalTechniqueTemplate(item.learnTechniqueId.trim())
      : null;
    const templateMaxLevel = Math.max(
      1,
      ...((technique?.layers ?? []).map((layer) => Math.max(1, Math.floor(Number(layer.level) || 1)))),
      Math.floor(Number(item.level) || 1),
    );
    const effectiveMaxLevel = Number.isFinite(Number(item.learnTechniqueMaxLevel))
      ? item.learnTechniqueMaxLevel
      : templateMaxLevel;
    return calculateTechniqueBookDecomposeFragments({
      realmLv: technique?.realmLv ?? item.level,
      grade: technique?.grade ?? item.grade,
      maxLevel: effectiveMaxLevel,
      totalMaxLevel: templateMaxLevel,
    });
  }

  private calculateSelectedTechniqueBookFragments(items = this.getSelectedTechniqueBookItems()): number {
    const isSingle = items.length === 1;
    return items.reduce(
      (sum, item) => sum + this.calculateTechniqueBookFragments(item) * this.getSelectedTechniqueBookDecomposeCount(item, isSingle),
      0,
    );
  }

  private calculateTechniqueBookCraftCost(
    tech: PlayerState['techniques'][number] | undefined,
    maxLevelInput: number,
  ): number {
    const templateMaxLevel = this.resolveTechniqueMaxLevel(tech);
    return calculateTechniqueBookCraftFragmentCost({
      realmLv: tech?.realmLv,
      grade: tech?.grade,
      maxLevel: maxLevelInput,
      totalMaxLevel: templateMaxLevel,
    });
  }

  private buildTechniqueRefiningBooksKey(items = this.getTechniqueBookInventoryItems()): string {
    return items
      .map((item) => [
        this.getItemInstanceId(item),
        item.itemId,
        Math.max(1, Math.floor(Number(item.count) || 1)),
        item.grade ?? '',
        Math.max(1, Math.floor(Number(item.level) || 1)),
        item.learnTechniqueId ?? '',
        item.learnTechniqueMaxLevel ?? '',
        getItemDisplayName(item),
      ].join(':'))
      .join('|');
  }

  private buildTechniqueBookCraftPickerKey(): string {
    return [
      this.techniqueBookCraftGradeFilter,
      this.techniqueBookCraftCategoryFilter,
      this.getTechniqueBookCraftCandidates()
        .map((tech) => [
          tech.techId,
          tech.name ?? '',
          tech.grade ?? '',
          tech.category ?? '',
          tech.realmLv ?? '',
          this.resolveTechniqueMaxLevel(tech),
        ].join(':'))
        .join('|'),
    ].join('::');
  }

  private buildTechniqueRefiningSelectionSummaryKey(items: ItemStack[], maxCount: number): string {
    return [
      items.map((item) => `${this.getItemInstanceId(item)}:${Math.max(1, Math.floor(Number(item.count) || 1))}`).join('|'),
      maxCount,
      this.selectedTechniqueBookCount,
    ].join('::');
  }

  private openTechniqueRefiningConfirmModal(): void {
    const selectedItems = this.getSelectedTechniqueBookItems();
    if (selectedItems.length === 0) {
      return;
    }
    const isSingle = selectedItems.length === 1;
    const entries = selectedItems
      .map((item) => {
        const itemInstanceId = this.getItemInstanceId(item);
        if (!itemInstanceId) {
          return null;
        }
        const count = this.getSelectedTechniqueBookDecomposeCount(item, isSingle);
        const fragments = this.calculateTechniqueBookFragments(item) * count;
        return { itemInstanceId, count, fragments };
      })
      .filter((entry): entry is { itemInstanceId: string; count: number; fragments: number } => Boolean(entry));
    if (entries.length === 0) {
      return;
    }
    const totalFragments = entries.reduce((sum, entry) => sum + entry.fragments, 0);
    confirmModalHost.open({
      ownerId: TECHNIQUE_REFINING_CONFIRM_OWNER,
      title: '确认分解功法书',
      subtitle: `预计获得 ${formatDisplayInteger(totalFragments)} 张功法残页`,
      bodyHtml: `
        <div class="alchemy-summary-metric">
          <span class="alchemy-summary-metric-label">预计获得</span>
          <strong class="alchemy-summary-metric-value">${formatDisplayInteger(totalFragments)} 张功法残页</strong>
        </div>
        <div class="empty-hint">分解后功法书会被消耗，获得的功法残页会进入背包。</div>
      `,
      confirmLabel: '确认分解',
      cancelLabel: '取消',
      confirmButtonClass: 'danger',
      onConfirm: () => {
        for (const entry of entries) {
          this.parent.callbacks?.onDecomposeTechniqueBook?.(entry.itemInstanceId, entry.count);
        }
        this.resetTechniqueRefiningSelection();
        this.parent.patchOpenCraftShell();
      },
    });
  }

  private getSelectedTechniqueBookDecomposeCount(item: ItemStack, isSingle: boolean): number {
    const itemCount = Math.max(1, Math.floor(Number(item.count) || 1));
    return isSingle
      ? Math.max(1, Math.min(itemCount, this.selectedTechniqueBookCount))
      : itemCount;
  }

  private getTechniqueBookInventoryItems(): ItemStack[] {
    return (this.parent.inventory.items ?? []).filter((item) => item?.type === 'skill_book' && this.getItemInstanceId(item));
  }

  private getSelectedTechniqueBookItems(): ItemStack[] {
    return this.getTechniqueBookInventoryItems().filter((item) => this.selectedTechniqueBookIds.has(this.getItemInstanceId(item)));
  }

  private getItemInstanceId(item: ItemStack | undefined): string {
    return typeof item?.itemInstanceId === 'string' && item.itemInstanceId.trim() ? item.itemInstanceId.trim() : '';
  }

  private escapeCssAttrSelector(value: string): string {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(value)
      : value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }

  handleAction(action: string, target: HTMLElement, body: HTMLElement): boolean {
    if (action === 'technique-refining-toggle-book') {
      const itemInstanceId = (target.dataset.itemInstanceId ?? '').trim();
      if (itemInstanceId) {
        if (this.selectedTechniqueBookIds.has(itemInstanceId)) {
          this.selectedTechniqueBookIds.delete(itemInstanceId);
        } else {
          this.selectedTechniqueBookIds.add(itemInstanceId);
        }
        if (this.selectedTechniqueBookIds.size !== 1) {
          this.selectedTechniqueBookCount = 1;
        }
        this.parent.patchOpenCraftShell();
      }
      return true;
    }
    if (action === 'technique-refining-count') {
      this.selectedTechniqueBookCount = Math.max(1, Math.floor(Number(target.dataset.count ?? '1') || 1));
      this.parent.patchOpenCraftShell();
      return true;
    }
    if (action === 'technique-refining-decompose') {
      this.openTechniqueRefiningConfirmModal();
      return true;
    }
    if (action === 'transmission-start') {
      const techniqueSelect = body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]');
      const techId = (target.dataset.techId ?? techniqueSelect?.value ?? '').trim();
      const learnerPlayerId = (body.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]')?.value ?? '').trim();
      const status = techniqueSelect?.selectedOptions[0]?.dataset.transmissionTechniqueStatus ?? 'idle';
      if (techId && learnerPlayerId && status === 'unlearned') {
        (this.transmissionCallbacks?.onStartTransmission ?? this.parent.callbacks?.onStartTransmission)?.(learnerPlayerId, techId);
      }
      return true;
    }
    if (action === 'transmission-craft-book') {
      const select = body.querySelector<HTMLSelectElement>('[data-transmission-book-tech-select="true"]');
      const techId = (select?.value ?? '').trim();
      const maxLevelInput = body.querySelector<HTMLInputElement>('[data-transmission-book-level-input="true"]');
      const maxLevel = Math.max(1, Math.floor(Number(maxLevelInput?.value ?? select?.selectedOptions[0]?.dataset.maxLevel ?? 1) || 1));
      if (techId) {
        (this.transmissionCallbacks?.onStartTransmission ?? this.parent.callbacks?.onStartTransmission)?.('', techId, { mode: 'craft_book', maxLevel });
      }
      return true;
    }
    if (action === 'transmission-cancel') {
      const techId = (target.dataset.techId ?? '').trim();
      if (techId) {
        (this.transmissionCallbacks?.onCancelTransmission ?? this.parent.callbacks?.onCancelTransmission)?.(techId);
      }
      return true;
    }
    return false;
  }

  bindEvents(body: HTMLElement, signal: AbortSignal): void {
    body.addEventListener('input', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-technique-refining-count-input="true"]')) {
        this.selectedTechniqueBookCount = Math.max(1, Math.floor(Number(event.target.value || '1') || 1));
        this.patchTechniqueRefiningTotals(body);
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-transmission-book-level-input="true"]')) {
        this.syncTransmissionBookLevelInput(body);
        return;
      }
      const input = event.target instanceof HTMLInputElement
        && (event.target.matches('[data-transmission-tech-search="true"]') || event.target.matches('[data-transmission-book-search="true"]'))
        ? event.target
        : null;
      if (!input) {
        return;
      }
      if (input.matches('[data-transmission-book-search="true"]')) {
        this.filterTransmissionTechniqueOptions(body, input.value, '[data-transmission-book-tech-select="true"]');
        this.syncTransmissionBookLevelInput(body);
      } else {
        this.filterTransmissionTechniqueOptions(body, input.value, '[data-transmission-tech-select="true"]');
      }
    }, { signal });
    body.addEventListener('change', (event) => {
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-transmission-book-grade-filter="true"]')) {
        this.techniqueBookCraftGradeFilter = this.normalizeTechniqueBookCraftGradeFilter(event.target.value);
        this.parent.patchOpenCraftShell();
        return;
      }
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-transmission-book-category-filter="true"]')) {
        this.techniqueBookCraftCategoryFilter = this.normalizeTechniqueBookCraftCategoryFilter(event.target.value);
        this.parent.patchOpenCraftShell();
        return;
      }
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-transmission-tech-select="true"]')) {
        this.selectedTransmissionTechniqueId = event.target.value.trim();
      }
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-transmission-target-select="true"]')) {
        this.selectedTransmissionTargetPlayerId = event.target.value.trim();
        this.selectedTransmissionTechniqueId = '';
        const techniqueSelect = body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]');
        if (techniqueSelect) {
          techniqueSelect.value = '';
        }
        this.requestTransmissionStatuses(body);
      }
      const changed = event.target instanceof HTMLSelectElement
        && (event.target.matches('[data-transmission-tech-select="true"]') || event.target.matches('[data-transmission-target-select="true"]') || event.target.matches('[data-transmission-book-tech-select="true"]'));
      if (changed) {
        this.syncTransmissionStartButton(body);
        this.syncTransmissionBookLevelInput(body);
      }
    }, { signal });
    body.addEventListener('focusout', (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest('[data-transmission-panel="true"]')) {
        return;
      }
      queueMicrotask(() => {
        if (!signal.aborted && this.parent.activeMode === 'transmission') {
          this.parent.patchOpenCraftShell();
        }
      });
    }, { signal });
    this.requestTransmissionStatuses(body);
  }

  private normalizeTechniqueBookCraftGradeFilter(value: string): TechniqueBookCraftGradeFilter {
    return TECHNIQUE_GRADE_ORDER.includes(value as TechniqueGrade) ? value as TechniqueGrade : 'all';
  }

  private normalizeTechniqueBookCraftCategoryFilter(value: string): TechniqueBookCraftCategoryFilter {
    return value === 'arts' || value === 'internal' || value === 'divine' || value === 'secret' ? value : 'all';
  }

  private filterTransmissionTechniqueOptions(
    body: HTMLElement,
    query: string,
    selector = '[data-transmission-tech-select="true"]',
  ): void {
    const select = body.querySelector<HTMLSelectElement>(selector);
    if (!select) {
      return;
    }
    const normalizedQuery = query.trim().toLowerCase();
    let firstVisibleValue = '';
    for (const option of Array.from(select.options)) {
      const matches = !normalizedQuery || (option.dataset.search ?? option.textContent ?? '').toLowerCase().includes(normalizedQuery);
      option.hidden = !matches;
      if (matches && !firstVisibleValue) {
        firstVisibleValue = option.value;
      }
    }
    const selectedOption = select.selectedOptions[0] ?? null;
    if (!selectedOption || selectedOption.hidden) {
      select.value = firstVisibleValue;
    }
    if (selector === '[data-transmission-tech-select="true"]') {
      this.selectedTransmissionTechniqueId = select.value.trim();
      this.patchTransmissionTechniqueOptions(body);
      return;
    }
    select.disabled = !firstVisibleValue;
    this.syncTransmissionStartButton(body);
  }

  private syncTransmissionStartButton(body: ParentNode): void {
    const techId = (body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]')?.value ?? '').trim();
    const targetSelect = body.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]');
    const learnerPlayerId = (targetSelect?.value ?? '').trim();
    const techniqueStatus = body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]')
      ?.selectedOptions[0]?.dataset.transmissionTechniqueStatus ?? 'idle';
    const button = body.querySelector<HTMLButtonElement>('[data-craft-action="transmission-start"]');
    if (button) {
      button.disabled = !techId || !learnerPlayerId || techniqueStatus !== 'unlearned';
    }
  }

  private syncTransmissionBookLevelInput(body: HTMLElement): void {
    const select = body.querySelector<HTMLSelectElement>('[data-transmission-book-tech-select="true"]');
    const input = body.querySelector<HTMLInputElement>('[data-transmission-book-level-input="true"]');
    if (!select || !input) {
      return;
    }
    const maxLevel = Math.max(1, Math.floor(Number(select.selectedOptions[0]?.dataset.maxLevel ?? 1) || 1));
    const selectedTechId = (select.value ?? '').trim();
    const selectedTech = this.getFilteredTechniqueBookCraftCandidates().find((tech) => tech.techId === selectedTechId);
    const nextLevel = Math.max(1, Math.min(maxLevel, Math.floor(Number(input.value || maxLevel) || maxLevel)));
    input.max = String(maxLevel);
    input.value = String(nextLevel);
    const costText = body.querySelector<HTMLElement>('[data-transmission-book-cost-text="true"]');
    if (costText) {
      costText.textContent = `消耗 ${formatDisplayInteger(this.calculateTechniqueBookCraftCost(selectedTech, nextLevel))} 张残页 · 抄录至 ${formatDisplayInteger(nextLevel)} 层`;
    }
  }
}

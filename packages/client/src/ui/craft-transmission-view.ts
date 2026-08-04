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
  TechniqueAggregationPanelView,
  TechniqueAggregationPreviewRequest,
  TechniqueAggregationPublishRequest,
  TechniqueAggregationResultView,
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
type TransmissionTechniqueStatus = 'idle' | 'loading' | 'learned' | 'unlearned' | 'unavailable' | 'error';

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
  onDiscardTechniqueComprehension?: (techId: string) => void;
  onRequestTransmissionStatuses?: (payload: C2S_RequestTechniqueTransmissionStatuses) => boolean;
  getTransmissionTargets?: () => Array<{ playerId: string; name: string }>;
  onRequestTechniqueAggregation?: (payload: TechniqueAggregationPreviewRequest) => boolean | void;
  onPublishTechniqueAggregation?: (payload: TechniqueAggregationPublishRequest) => boolean | void;
};

/** @internal 传功子视图只通过这些显式端口读取工坊共享状态。 */
export interface CraftTransmissionParent {
  readonly activeMode: string | null;
  readonly transmissionSkillLevel: number;
  readonly playerComprehensionSpeedRate: number;
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
const TECHNIQUE_COMPREHENSION_DISCARD_CONFIRM_OWNER = 'craft-workbench-modal:technique-comprehension-discard-confirm';
const TRANSMISSION_STATUS_REQUEST_TIMEOUT_MS = 5_000;

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

function resolveTechniqueAggregationError(
  result: Pick<TechniqueAggregationResultView, 'code' | 'messageKey' | 'vars'>,
): string {
  const labels: Record<string, string> = {
    TECHNIQUE_AGGREGATE_BUILDING_REQUIRED: '请在炼法台旁进行功法统合。',
    TECHNIQUE_AGGREGATE_BUILDING_OUT_OF_RANGE: '距离炼法台太远，无法进行功法统合。',
    TECHNIQUE_AGGREGATE_BUILDING_INVALID: '当前炼法台不可用。',
    TECHNIQUE_AGGREGATE_PERMISSION_DENIED: '只有自创功法的创建者可以进行统合。',
    TECHNIQUE_AGGREGATE_SOURCE_EMPTY: '至少选择两本源功法。',
    TECHNIQUE_AGGREGATE_SOURCE_DUPLICATE: '源功法不能重复选择。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_FOUND: '有源功法已经不存在，请刷新面板。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_CREATED: '系统功法不能参与统合。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_OWNER: '只有源功法创建者本人可以进行统合。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_MASTERED: '只有已经圆满的源功法可以参与统合。',
    TECHNIQUE_AGGREGATE_SOURCE_CATEGORY_INVALID: '当前只允许统合内功。',
    TECHNIQUE_AGGREGATE_SOURCE_GRADE_MISMATCH: '只能统合同品阶内功。',
    TECHNIQUE_AGGREGATE_REVISION_INVALID: '统合版本已变化，请刷新后重试。',
    TECHNIQUE_AGGREGATE_REVISION_NOT_ADDITIVE: '更新版本必须加入至少一本新的源功法。',
    TECHNIQUE_AGGREGATE_OVERLAP: '所选功法与已有统合家族重叠，不能重复覆盖。',
    TECHNIQUE_AGGREGATE_ALREADY_EXISTS: '相同统合版本已经存在。',
    TECHNIQUE_AGGREGATE_OPERATION_REPLAYED: '该统合操作已经处理。',
    TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE: '统合数据暂时无法保存，请稍后重试。',
    TECHNIQUE_AGGREGATE_NOT_READY: '功法统合服务尚未准备完成，请稍后重试。',
  };
  const code = result.code ?? '';
  const label = labels[code];
  if (label) {
    if (code === 'TECHNIQUE_AGGREGATE_REVISION_INVALID' && result.vars?.expectedRevision !== undefined) {
      return `${label}当前最新版为 v${formatDisplayInteger(Number(result.vars.expectedRevision) || 1)}。`;
    }
    return label;
  }
  return result.messageKey ? `统合失败（${result.messageKey}）。` : '功法统合失败，请稍后重试。';
}

function renderTechniqueAggregationConflicts(
  result: Pick<TechniqueAggregationResultView, 'vars' | 'conflictAggregateIds' | 'conflictSourceTechniqueIds' | 'invalidTechniqueIds'>,
): string {
  const aggregateIds = result.conflictAggregateIds?.filter(Boolean) ?? [];
  const sourceIds = result.conflictSourceTechniqueIds?.filter(Boolean) ?? [];
  const sourceNames = typeof result.vars?.sourceTechniqueNames === 'string'
    ? result.vars.sourceTechniqueNames.trim()
    : '';
  const invalidIds = result.invalidTechniqueIds?.filter(Boolean) ?? [];
  const rows: string[] = [];
  if (aggregateIds.length > 0) {
    rows.push(`<li>重叠统合功法：${aggregateIds.map((id) => escapeHtml(id)).join('、')}</li>`);
  }
  if (sourceIds.length > 0) {
    rows.push(`<li>重叠源功法：${escapeHtml(sourceNames || sourceIds.join('、'))}</li>`);
  }
  if (invalidIds.length > 0) {
    rows.push(`<li>不可用源功法：${invalidIds.map((id) => escapeHtml(id)).join('、')}</li>`);
  }
  return rows.length > 0 ? `<ul class="technique-aggregation-conflicts">${rows.join('')}</ul>` : '';
}

function createTechniqueAggregationOperationId(sequence: number): string {
  const nonce = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.max(1, sequence).toString(36)}`;
  return `technique-aggregation-op:${nonce}`;
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
  private readonly selectedTechniqueBookIds = new Set<string>();
  private selectedTechniqueBookCount = 1;
  private techniqueBookCraftGradeFilter: TechniqueBookCraftGradeFilter = 'all';
  private techniqueBookCraftCategoryFilter: TechniqueBookCraftCategoryFilter = 'all';
  private selectedTransmissionTechniqueId = '';
  private selectedTransmissionTargetPlayerId = '';
  private transmissionStatusRequestSequence = 0;
  private activeTransmissionStatusRequest: { requestId: string; targetPlayerId: string; signature: string } | null = null;
  private transmissionStatusRequestTimeout: number | null = null;
  private resolvedTransmissionStatusSignature = '';
  private transmissionStatusTargetPlayerId = '';
  private failedTransmissionStatusTargetPlayerId = '';
  private readonly transmissionLearnedByTechniqueId = new Map<string, boolean>();
  private techniqueAggregationPanel: TechniqueAggregationPanelView | null = null;
  private techniqueAggregationBuildingId = '';
  private techniqueAggregationFamilyId = '';
  private techniqueAggregationExpectedRevision: number | undefined;
  private readonly selectedTechniqueAggregationSourceIds = new Set<string>();
  private techniqueAggregationRequestSequence = 0;
  private techniqueAggregationRequestId = '';
  private techniqueAggregationOperationId = '';
  private techniqueAggregationResult: TechniqueAggregationResultView | null = null;
  private techniqueAggregationPublishing = false;

  constructor(private readonly parent: CraftTransmissionParent) {}

  setCallbacks(callbacks: CraftTransmissionCallbacks): void {
    this.transmissionCallbacks = callbacks;
  }

  handleTransmissionStatuses(data: S2C_TechniqueTransmissionStatuses): void {
    const activeRequest = this.activeTransmissionStatusRequest;
    if (!activeRequest || data.requestId !== activeRequest.requestId || data.targetPlayerId !== activeRequest.targetPlayerId) {
      return;
    }
    this.clearTransmissionStatusRequestTimeout();
    this.activeTransmissionStatusRequest = null;
    this.resolvedTransmissionStatusSignature = activeRequest.signature;
    this.transmissionStatusTargetPlayerId = data.targetPlayerId;
    this.failedTransmissionStatusTargetPlayerId = '';
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

  /** 新会话不能沿用旧 Socket 上尚未完成或已缓存的查询结果。 */
  handleSessionBootstrap(): void {
    this.clearTransmissionStatusRequestTimeout();
    this.activeTransmissionStatusRequest = null;
    this.resolvedTransmissionStatusSignature = '';
    this.transmissionStatusTargetPlayerId = '';
    this.failedTransmissionStatusTargetPlayerId = '';
    this.transmissionLearnedByTechniqueId.clear();
    if (this.parent.activeMode !== 'transmission') {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    if (body instanceof HTMLElement) {
      this.requestTransmissionStatuses(body);
    }
  }

  resetTechniqueRefiningSelection(): void {
    this.selectedTechniqueBookIds.clear();
    this.selectedTechniqueBookCount = 1;
    this.closeTechniqueAggregation();
  }

  openTechniqueAggregation(buildingId: string): void {
    this.techniqueAggregationBuildingId = buildingId.trim();
    this.techniqueAggregationPanel = null;
    this.techniqueAggregationFamilyId = '';
    this.techniqueAggregationExpectedRevision = undefined;
    this.selectedTechniqueAggregationSourceIds.clear();
    this.techniqueAggregationResult = null;
    this.techniqueAggregationOperationId = '';
    this.techniqueAggregationPublishing = false;
    this.requestTechniqueAggregationPanel();
  }

  closeTechniqueAggregation(): void {
    this.techniqueAggregationBuildingId = '';
    this.techniqueAggregationPanel = null;
    this.techniqueAggregationFamilyId = '';
    this.techniqueAggregationExpectedRevision = undefined;
    this.selectedTechniqueAggregationSourceIds.clear();
    this.techniqueAggregationRequestId = '';
    this.techniqueAggregationOperationId = '';
    this.techniqueAggregationResult = null;
    this.techniqueAggregationPublishing = false;
  }

  handleTechniqueAggregationPanel(data: TechniqueAggregationPanelView): void {
    if (this.techniqueAggregationRequestId && data.requestId && data.requestId !== this.techniqueAggregationRequestId) {
      return;
    }
    this.techniqueAggregationPanel = data;
    this.techniqueAggregationResult = data.error
      ? {
        requestId: data.requestId,
        operationId: this.techniqueAggregationOperationId || undefined,
        ok: false,
        code: data.error.code,
        messageKey: data.error.messageKey,
        vars: data.error.vars,
        conflictAggregateIds: data.error.conflictAggregateIds,
        conflictSourceTechniqueIds: data.error.conflictSourceTechniqueIds,
        invalidTechniqueIds: data.error.invalidTechniqueIds,
      }
      : this.techniqueAggregationResult;
    if (this.parent.activeMode === 'technique_refining' && this.techniqueAggregationBuildingId) {
      this.parent.patchOpenCraftShell();
    }
  }

  handleTechniqueAggregationResult(data: TechniqueAggregationResultView): void {
    if (data.requestId && this.techniqueAggregationRequestId && data.requestId !== this.techniqueAggregationRequestId) {
      return;
    }
    this.techniqueAggregationPublishing = false;
    this.techniqueAggregationResult = data;
    if (data.ok) {
      this.selectedTechniqueAggregationSourceIds.clear();
      this.techniqueAggregationFamilyId = '';
      this.techniqueAggregationExpectedRevision = undefined;
      this.techniqueAggregationOperationId = '';
      this.requestTechniqueAggregationPanel();
    }
    if (this.parent.activeMode === 'technique_refining' && this.techniqueAggregationBuildingId) {
      this.parent.patchOpenCraftShell();
    }
  }

  closeTransientUi(): void {
    confirmModalHost.close(TECHNIQUE_REFINING_CONFIRM_OWNER);
    confirmModalHost.close(TECHNIQUE_COMPREHENSION_DISCARD_CONFIRM_OWNER);
    this.selectedTransmissionTechniqueId = '';
    this.selectedTransmissionTargetPlayerId = '';
    this.clearTransmissionStatusRequestTimeout();
    this.activeTransmissionStatusRequest = null;
    this.resolvedTransmissionStatusSignature = '';
    this.transmissionStatusTargetPlayerId = '';
    this.failedTransmissionStatusTargetPlayerId = '';
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
    const panel = content.querySelector<HTMLElement>('[data-transmission-panel="true"]');
    if (!panel || panel.dataset.transmissionRenderKey !== nextKey) {
      if (this.shouldDeferTransmissionContentPatch(content)) {
        this.patchTransmissionProgress(content);
        return true;
      }
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
      const progressText = `${status} · ${formatDisplayInteger(progress)} / ${formatDisplayInteger(required)}${rateText}${estimateText}`;
      if (pendingTextNode && pendingTextNode.textContent !== progressText) {
        pendingTextNode.textContent = progressText;
      }
      const pendingFactorNode = card.querySelector<HTMLElement>('[data-transmission-pending-factor-text="true"]');
      if (pendingFactorNode) {
        if (pendingFactorNode.textContent !== factorText) {
          pendingFactorNode.textContent = factorText;
        }
        const factorHidden = factorText.length === 0;
        if (pendingFactorNode.hidden !== factorHidden) {
          pendingFactorNode.hidden = factorHidden;
        }
      }
      const pendingFillNode = card.querySelector<HTMLElement>('[data-transmission-pending-progress-fill="true"]');
      const progressWidth = `${Number((ratio * 100).toFixed(2))}%`;
      if (pendingFillNode && pendingFillNode.style.width !== progressWidth) {
        pendingFillNode.style.width = progressWidth;
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
    if (this.techniqueAggregationBuildingId) {
      return this.tryPatchTechniqueAggregationBody(body);
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

  private tryPatchTechniqueAggregationBody(body: HTMLElement): boolean {
    const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
    if (!panel) return false;
    const content = panel.parentElement;
    if (!content) return false;
    const nextKey = this.buildTechniqueAggregationRenderKey();
    if (panel.dataset.techniqueAggregationRenderKey === nextKey) return true;
    replaceElementHtml(content, this.renderTechniqueAggregationBody());
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
    const renderKey = this.buildTransmissionRenderKey();
    const pending = this.parent.pendingTechniqueComprehensions ?? [];
    const learned = this.getTransmittableTechniques();
    const targets = this.getTransmissionTargets();
    return `
      <div class="alchemy-tab-stack" data-transmission-panel="true" data-transmission-render-key="${escapeHtmlAttr(renderKey)}">
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
    const targets = this.transmissionCallbacks?.getTransmissionTargets?.()
      ?? this.parent.callbacks?.getTransmissionTargets?.()
      ?? [];
    return [...targets].sort((left, right) => (
      left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0
    ));
  }

  private requestTransmissionStatuses(root: ParentNode): void {
    const targetSelect = root.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]');
    const targetPlayerId = (targetSelect?.value ?? '').trim();
    const techniqueIds = this.getTransmittableTechniques().map((technique) => technique.techId);
    this.selectedTransmissionTargetPlayerId = targetPlayerId;
    if (!targetPlayerId || techniqueIds.length === 0) {
      this.clearTransmissionStatusRequestTimeout();
      this.activeTransmissionStatusRequest = null;
      this.resolvedTransmissionStatusSignature = '';
      this.transmissionStatusTargetPlayerId = targetPlayerId;
      this.failedTransmissionStatusTargetPlayerId = '';
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
    this.clearTransmissionStatusRequestTimeout();
    this.activeTransmissionStatusRequest = { requestId, targetPlayerId, signature };
    this.resolvedTransmissionStatusSignature = '';
    this.transmissionStatusTargetPlayerId = targetPlayerId;
    this.failedTransmissionStatusTargetPlayerId = '';
    this.transmissionLearnedByTechniqueId.clear();
    this.patchTransmissionTechniqueOptions(root);
    const request = this.transmissionCallbacks?.onRequestTransmissionStatuses
      ?? this.parent.callbacks?.onRequestTransmissionStatuses;
    if (!request) {
      this.failTransmissionStatusRequest(requestId, root);
      return;
    }
    let accepted = false;
    try {
      accepted = request({ requestId, targetPlayerId });
    } catch {
      this.failTransmissionStatusRequest(requestId, root);
      return;
    }
    if (!accepted) {
      this.failTransmissionStatusRequest(requestId, root);
      return;
    }
    if (this.activeTransmissionStatusRequest?.requestId === requestId) {
      this.transmissionStatusRequestTimeout = window.setTimeout(() => {
        this.transmissionStatusRequestTimeout = null;
        this.failTransmissionStatusRequest(requestId);
      }, TRANSMISSION_STATUS_REQUEST_TIMEOUT_MS);
    }
  }

  private clearTransmissionStatusRequestTimeout(): void {
    if (this.transmissionStatusRequestTimeout === null) {
      return;
    }
    window.clearTimeout(this.transmissionStatusRequestTimeout);
    this.transmissionStatusRequestTimeout = null;
  }

  private failTransmissionStatusRequest(requestId: string, root?: ParentNode): void {
    const activeRequest = this.activeTransmissionStatusRequest;
    if (!activeRequest || activeRequest.requestId !== requestId) {
      return;
    }
    this.clearTransmissionStatusRequestTimeout();
    this.activeTransmissionStatusRequest = null;
    this.resolvedTransmissionStatusSignature = '';
    this.transmissionStatusTargetPlayerId = activeRequest.targetPlayerId;
    this.failedTransmissionStatusTargetPlayerId = activeRequest.targetPlayerId;
    this.transmissionLearnedByTechniqueId.clear();
    if (root) {
      this.patchTransmissionTechniqueOptions(root);
      return;
    }
    if (this.parent.activeMode !== 'transmission') {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    if (body instanceof HTMLElement) {
      this.patchTransmissionTechniqueOptions(body);
    }
  }

  private patchTransmissionTechniqueOptions(root: ParentNode): void {
    const targetSelect = root.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]');
    const techniqueSelect = root.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]');
    if (!techniqueSelect) {
      return;
    }
    const targetPlayerId = (targetSelect?.value ?? '').trim();
    const failed = Boolean(targetPlayerId)
      && this.failedTransmissionStatusTargetPlayerId === targetPlayerId;
    const loading = Boolean(targetPlayerId) && (
      this.transmissionStatusTargetPlayerId !== targetPlayerId
      || this.activeTransmissionStatusRequest?.targetPlayerId === targetPlayerId
    );
    for (const option of Array.from(techniqueSelect.options)) {
      const techId = option.value.trim();
      if (!techId) {
        option.textContent = !targetPlayerId
          ? '请先选择目标玩家'
          : loading ? '正在查询功法状态' : failed ? '功法状态查询失败' : '请选择要传授的功法';
        continue;
      }
      const label = option.dataset.transmissionTechniqueLabel ?? option.textContent ?? techId;
      const status = this.resolveTransmissionTechniqueStatus(targetPlayerId, techId);
      option.dataset.transmissionTechniqueLabel = label;
      option.dataset.transmissionTechniqueStatus = status;
      option.textContent = `${label} · ${this.getTransmissionTechniqueStatusLabel(status)}`;
      option.disabled = status === 'learned' || status === 'unavailable' || status === 'error';
    }
    const hasVisibleTechnique = Array.from(techniqueSelect.options)
      .some((option) => Boolean(option.value.trim()) && !option.hidden);
    techniqueSelect.disabled = !targetPlayerId || loading || failed || !hasVisibleTechnique;
    const searchInput = root.querySelector<HTMLInputElement>('[data-transmission-tech-search="true"]');
    if (searchInput) {
      searchInput.disabled = !targetPlayerId || loading || failed;
    }
    const retryButton = root.querySelector<HTMLButtonElement>('[data-craft-action="transmission-status-retry"]');
    if (retryButton) {
      retryButton.hidden = !failed;
      retryButton.disabled = loading;
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
    if (this.failedTransmissionStatusTargetPlayerId === targetPlayerId) {
      return 'error';
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
    if (status === 'error') {
      return '查询失败';
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
        ${job
          ? `<button class="small-btn danger" type="button" data-craft-action="transmission-cancel" data-tech-id="${escapeHtmlAttr(entry.techId)}">取消传法</button>`
          : `<button class="small-btn danger" type="button" data-craft-action="transmission-discard-pending" data-tech-id="${escapeHtmlAttr(entry.techId)}">${escapeHtml(t('technique.comprehension.discard.action'))}</button>`}
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
      learnerTransmissionSpeedRate: this.parent.playerComprehensionSpeedRate,
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
      learnerTransmissionSpeedRate: this.parent.playerComprehensionSpeedRate,
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
    const failed = Boolean(selectedTargetPlayerId)
      && this.failedTransmissionStatusTargetPlayerId === selectedTargetPlayerId;
    const techniquePlaceholder = !selectedTargetPlayerId
      ? '请先选择目标玩家'
      : loading ? '正在查询功法状态' : failed ? '功法状态查询失败' : '请选择要传授的功法';
    const techniqueOptions = `<option value=""${selectedTechniqueId ? '' : ' selected'}>${techniquePlaceholder}</option>${techniques
      .map((tech) => this.renderTransmissionTechniqueOption(tech, selectedTargetPlayerId, selectedTechniqueId))
      .join('')}`;
    const targetSelectDisabled = targets.length === 0 ? 'disabled' : '';
    const techniqueControlsDisabled = !selectedTargetPlayerId || loading || failed ? 'disabled' : '';
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
        <button class="small-btn" type="button" data-craft-action="transmission-status-retry"${failed ? '' : ' hidden'}>重新查询</button>
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
    const disabled = status === 'learned' || status === 'unavailable' || status === 'error' ? ' disabled' : '';
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
    if (this.techniqueAggregationBuildingId) {
      return this.renderTechniqueAggregationBody();
    }
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

  private buildTechniqueAggregationRenderKey(): string {
    const panel = this.techniqueAggregationPanel;
    return [
      this.techniqueAggregationBuildingId,
      panel?.requestId ?? '',
      panel?.revision ?? 0,
      panel?.eligibleSources?.map((source) => [source.techId, source.level, source.maxLevel, source.fullyMastered].join(':')).join('|') ?? '',
      panel?.families?.map((family) => [family.familyId, family.latestRevision, family.name, family.playerRevision ?? 0, family.playerCoveredCount].join(':')).join('|') ?? '',
      [...this.selectedTechniqueAggregationSourceIds].sort().join(','),
      this.techniqueAggregationFamilyId,
      this.techniqueAggregationExpectedRevision ?? '',
      this.techniqueAggregationPublishing ? 'publishing' : 'idle',
      this.techniqueAggregationResult?.ok ?? '',
      this.techniqueAggregationResult?.code ?? '',
      this.techniqueAggregationResult?.aggregate?.techniqueId ?? '',
      this.techniqueAggregationResult?.conflictAggregateIds?.join(',') ?? '',
      this.techniqueAggregationResult?.conflictSourceTechniqueIds?.join(',') ?? '',
      this.techniqueAggregationResult?.invalidTechniqueIds?.join(',') ?? '',
      JSON.stringify(this.techniqueAggregationResult?.vars ?? {}),
    ].join('::');
  }

  private renderTechniqueAggregationBody(): string {
    const panel = this.techniqueAggregationPanel;
    if (!panel) {
      return `<div class="alchemy-tab-stack" data-technique-aggregation-panel="true" data-technique-aggregation-render-key="${escapeHtmlAttr(this.buildTechniqueAggregationRenderKey())}">
        <section class="alchemy-summary-card"><div class="empty-hint">正在读取功法统合信息...</div></section>
      </div>`;
    }
    const sources = panel?.eligibleSources ?? [];
    const selected = this.selectedTechniqueAggregationSourceIds;
    const selectedSources = sources.filter((source) => selected.has(source.techId));
    const selectedFamily = panel.families.find((family) => family.familyId === this.techniqueAggregationFamilyId);
    const selectedGrade = selectedSources[0]?.grade;
    const requiredGrade = selectedFamily?.grade ?? selectedGrade;
    const sameGrade = selectedSources.every((source) => !requiredGrade || source.grade === requiredGrade);
    const minimumSelectionCount = this.techniqueAggregationFamilyId ? 1 : 2;
    const publishEnabled = selectedSources.length >= minimumSelectionCount
      && sameGrade
      && selectedSources.every((source) => source.fullyMastered)
      && !this.techniqueAggregationPublishing;
    const result = this.techniqueAggregationResult;
    const resultHtml = result && !result.ok
      ? `<div class="technique-aggregation-error" role="alert">${escapeHtml(resolveTechniqueAggregationError(result))}${renderTechniqueAggregationConflicts(result)}</div>`
      : result?.ok && result.aggregate
        ? `<div class="technique-aggregation-success">已发布 ${escapeHtml(result.aggregate.name)}，已将源功法替换为聚合版本。</div>`
        : '';
    const sourceHtml = sources.length > 0
      ? sources.map((source) => {
        const isSelected = selected.has(source.techId);
        const gradeMismatch = Boolean(requiredGrade) && source.grade !== requiredGrade;
        const disabled = this.techniqueAggregationPublishing || !source.fullyMastered || gradeMismatch;
        const state = source.fullyMastered ? `圆满 ${formatDisplayInteger(source.maxLevel)} 层` : `修炼 ${formatDisplayInteger(source.level)}/${formatDisplayInteger(source.maxLevel)} 层`;
        return `<button type="button" class="technique-aggregation-source${isSelected ? ' is-selected' : ''}" data-craft-action="technique-aggregation-toggle-source" data-technique-id="${escapeHtmlAttr(source.techId)}" ${disabled ? 'disabled' : ''}>
          <span class="technique-aggregation-source-main"><strong>${escapeHtml(resolveClientTechniqueName(source.techId, source.name))}</strong><small>${escapeHtml(getTechniqueGradeLabel(source.grade))} · ${escapeHtml(state)}</small></span>
          <span class="technique-aggregation-source-mark">${isSelected ? '已选' : source.fullyMastered ? '选择' : '未圆满'}</span>
        </button>`;
      }).join('')
      : '<div class="empty-hint">当前没有可统合的自创内功。只有创建者本人且原功法圆满后才会出现在这里。</div>';
    const familyHtml = (panel?.families ?? []).length > 0
      ? (panel?.families ?? []).map((family) => `<button type="button" class="technique-aggregation-family${family.familyId === this.techniqueAggregationFamilyId ? ' is-selected' : ''}" data-craft-action="technique-aggregation-select-family" data-family-id="${escapeHtmlAttr(family.familyId)}" data-expected-revision="${family.latestRevision}" ${this.techniqueAggregationPublishing ? 'disabled' : ''}>
          <span><strong>${escapeHtml(resolveClientTechniqueName(family.latestTechniqueId, family.name))}</strong><small>${escapeHtml(getTechniqueGradeLabel(family.grade))} · 最新 v${formatDisplayInteger(family.latestRevision)} · ${formatDisplayInteger(family.sourceCount)} 本源功法 · 已覆盖 ${formatDisplayInteger(family.playerCoveredCount)}/${formatDisplayInteger(family.sourceCount)}</small></span><span>${family.playerRevision ? `当前 v${formatDisplayInteger(family.playerRevision)}` : '未学习'}</span>
        </button>`).join('')
      : '<div class="empty-hint">尚未发布统合家族；首次发布后可在这里选择新增功法更新版本。</div>';
    const selectionHint = selectedSources.length > 0
      ? `已选 ${formatDisplayInteger(selectedSources.length)} 本${requiredGrade ? ` · ${getTechniqueGradeLabel(requiredGrade)}` : ''} · 聚合效果 +10% · 修炼难度按源功法总和的 50% 计算`
      : this.techniqueAggregationFamilyId
        ? '请选择至少一本同品阶的新源功法，用于发布家族下一版本。'
        : '请选择至少两本同品阶、已圆满的自创内功。术法和系统功法不会出现在候选中。';
    return `<div class="alchemy-tab-stack" data-technique-aggregation-panel="true" data-technique-aggregation-render-key="${escapeHtmlAttr(this.buildTechniqueAggregationRenderKey())}">
      <section class="alchemy-summary-card">
        <div class="alchemy-summary-head"><div class="alchemy-summary-title">功法统合</div><span class="alchemy-summary-mode">已覆盖叶子 ${formatDisplayInteger(panel?.totalCoveredLeafCount ?? 0)} · 聚合 ${formatDisplayInteger(panel?.learnedAggregateCount ?? 0)} 本</span></div>
        <p class="empty-hint">源功法不会封存，仍可继续修炼和传授；学习聚合功法时，重叠源功法和旧版本会被替换移除。</p>
        <div class="technique-aggregation-source-list">${sourceHtml}</div>
        <div class="technique-aggregation-selection-summary">${escapeHtml(selectionHint)}</div>
        <button type="button" class="small-btn" data-craft-action="technique-aggregation-publish" ${publishEnabled ? '' : 'disabled'}>${this.techniqueAggregationPublishing ? '发布中...' : '发布统合功法'}</button>
        ${resultHtml}
      </section>
      <section class="alchemy-summary-card"><div class="alchemy-summary-head"><div class="alchemy-summary-title">已发布家族</div><span class="alchemy-summary-mode">更新必须加入至少一本新源功法</span></div><div class="technique-aggregation-family-list">${familyHtml}</div></section>
    </div>`;
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

  private requestTechniqueAggregationPanel(): void {
    if (!this.techniqueAggregationBuildingId) return;
    const requestId = `technique-aggregation:${++this.techniqueAggregationRequestSequence}`;
    this.techniqueAggregationRequestId = requestId;
    const request = this.transmissionCallbacks?.onRequestTechniqueAggregation
      ?? this.parent.callbacks?.onRequestTechniqueAggregation;
    if (!request) return;
    let accepted: boolean | void;
    try {
      accepted = request({ requestId, buildingId: this.techniqueAggregationBuildingId });
    } catch {
      accepted = false;
    }
    if (accepted === false) {
      this.techniqueAggregationPanel = {
        requestId,
        buildingId: this.techniqueAggregationBuildingId,
        revision: 1,
        eligibleSources: [],
        families: [],
        totalCoveredLeafCount: 0,
        learnedAggregateCount: 0,
        error: {
          code: 'TECHNIQUE_AGGREGATE_NOT_READY',
          messageKey: 'technique.aggregation.technique_aggregate_not_ready',
        },
      };
      this.parent.patchOpenCraftShell();
    }
  }

  private publishTechniqueAggregation(): void {
    if (this.techniqueAggregationPublishing) return;
    const panel = this.techniqueAggregationPanel;
    const sourceTechniqueIds = [...this.selectedTechniqueAggregationSourceIds].sort();
    const minimumSelectionCount = this.techniqueAggregationFamilyId ? 1 : 2;
    if (!panel || sourceTechniqueIds.length < minimumSelectionCount) return;
    if (!this.techniqueAggregationOperationId) {
      this.techniqueAggregationOperationId = createTechniqueAggregationOperationId(++this.techniqueAggregationRequestSequence);
    }
    const request = this.transmissionCallbacks?.onPublishTechniqueAggregation
      ?? this.parent.callbacks?.onPublishTechniqueAggregation;
    if (!request) return;
    this.techniqueAggregationPublishing = true;
    this.parent.patchOpenCraftShell();
    let accepted: boolean | void;
    try {
      accepted = request({
        requestId: this.techniqueAggregationRequestId,
        operationId: this.techniqueAggregationOperationId,
        buildingId: this.techniqueAggregationBuildingId,
        ...(this.techniqueAggregationFamilyId ? {
          familyId: this.techniqueAggregationFamilyId,
          expectedRevision: this.techniqueAggregationExpectedRevision,
        } : {}),
        sourceTechniqueIds,
      });
    } catch {
      accepted = false;
    }
    if (accepted === false) {
      this.techniqueAggregationPublishing = false;
      this.techniqueAggregationResult = {
        requestId: this.techniqueAggregationRequestId,
        operationId: this.techniqueAggregationOperationId,
        ok: false,
        code: 'TECHNIQUE_AGGREGATE_NOT_READY',
      };
      this.parent.patchOpenCraftShell();
    }
  }

  private openPendingComprehensionDiscardConfirmModal(techId: string): void {
    const pending = (this.parent.pendingTechniqueComprehensions ?? []).find((entry) => entry.techId === techId);
    if (!pending || pending.activeTransferJob) {
      return;
    }
    const techniqueName = resolveClientTechniqueName(pending.techId, pending.name);
    confirmModalHost.open({
      ownerId: TECHNIQUE_COMPREHENSION_DISCARD_CONFIRM_OWNER,
      title: t('technique.comprehension.discard.confirm.title', { name: techniqueName }),
      subtitle: t('technique.comprehension.discard.confirm.subtitle'),
      bodyHtml: `<p>${escapeHtml(t('technique.comprehension.discard.confirm.body', { name: techniqueName }))}</p>`,
      confirmLabel: t('technique.comprehension.discard.confirm.ok'),
      cancelLabel: t('technique.comprehension.discard.confirm.cancel'),
      confirmButtonClass: 'danger',
      onConfirm: () => {
        (this.transmissionCallbacks?.onDiscardTechniqueComprehension
          ?? this.parent.callbacks?.onDiscardTechniqueComprehension)?.(pending.techId);
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
    if (action === 'technique-aggregation-toggle-source') {
      if (this.techniqueAggregationPublishing) return true;
      const techId = (target.dataset.techniqueId ?? '').trim();
      const source = this.techniqueAggregationPanel?.eligibleSources.find((entry) => entry.techId === techId);
      if (!source || !source.fullyMastered) return true;
      if (this.selectedTechniqueAggregationSourceIds.has(techId)) {
        this.selectedTechniqueAggregationSourceIds.delete(techId);
      } else {
        const selectedFamily = this.techniqueAggregationPanel?.families.find((entry) => entry.familyId === this.techniqueAggregationFamilyId);
        if (selectedFamily?.grade && selectedFamily.grade !== source.grade) return true;
        const currentGrade = this.techniqueAggregationPanel?.eligibleSources.find((entry) => this.selectedTechniqueAggregationSourceIds.has(entry.techId))?.grade;
        if (currentGrade && currentGrade !== source.grade) return true;
        this.selectedTechniqueAggregationSourceIds.add(techId);
      }
      this.techniqueAggregationResult = null;
      this.techniqueAggregationOperationId = '';
      this.parent.patchOpenCraftShell();
      return true;
    }
    if (action === 'technique-aggregation-select-family') {
      if (this.techniqueAggregationPublishing) return true;
      const nextFamilyId = (target.dataset.familyId ?? '').trim();
      if (nextFamilyId === this.techniqueAggregationFamilyId) {
        this.techniqueAggregationFamilyId = '';
        this.techniqueAggregationExpectedRevision = undefined;
        this.selectedTechniqueAggregationSourceIds.clear();
        this.techniqueAggregationResult = null;
        this.techniqueAggregationOperationId = '';
        this.parent.patchOpenCraftShell();
        return true;
      }
      this.techniqueAggregationFamilyId = nextFamilyId;
      this.techniqueAggregationExpectedRevision = Math.max(1, Math.trunc(Number(target.dataset.expectedRevision) || 1));
      const family = this.techniqueAggregationPanel?.families.find((entry) => entry.familyId === this.techniqueAggregationFamilyId);
      const familySources = new Set(family?.sourceTechniqueIds ?? []);
      this.selectedTechniqueAggregationSourceIds.clear();
      for (const source of this.techniqueAggregationPanel?.eligibleSources ?? []) {
        if (source.fullyMastered && !familySources.has(source.techId) && (!family?.grade || source.grade === family.grade)) {
          this.selectedTechniqueAggregationSourceIds.add(source.techId);
        }
      }
      this.techniqueAggregationResult = null;
      this.techniqueAggregationOperationId = '';
      this.parent.patchOpenCraftShell();
      return true;
    }
    if (action === 'technique-aggregation-publish') {
      this.publishTechniqueAggregation();
      return true;
    }
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
    if (action === 'transmission-status-retry') {
      this.failedTransmissionStatusTargetPlayerId = '';
      this.resolvedTransmissionStatusSignature = '';
      this.requestTransmissionStatuses(body);
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
    if (action === 'transmission-discard-pending') {
      const techId = (target.dataset.techId ?? '').trim();
      if (techId) {
        this.openPendingComprehensionDiscardConfirmModal(techId);
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

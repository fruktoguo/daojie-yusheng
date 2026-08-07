/**
 * 本文件负责工坊中的传功、功法书分解与抄录视图。
 *
 * 服务端仍是领悟进度、传功任务和资产结算的唯一权威；本视图只维护筛选、选择、
 * 局部 DOM 更新和确认弹层等客户端表现状态。
 */
import type {
  Attributes,
  C2S_RequestTechniqueTransmissionStatuses,
  ItemStack,
  PlayerState,
  S2C_TechniqueTransmissionStatuses,
  SectMemberRole,
  TechniqueAggregationLearnRequest,
  TechniqueAggregationPanelView,
  TechniqueAggregationPermissionRequest,
  TechniqueAggregationPreviewRequest,
  TechniqueAggregationPublishRequest,
  TechniqueAggregationResultView,
  TechniqueCategory,
  TechniqueComprehensionProgressBreakdown,
  TechniqueGrade,
  TechniqueUnificationAccessPolicy,
  TechniqueUnificationPermissionScope,
} from '@mud/shared';
import {
  CUSTOM_TECHNIQUE_NAME_MAX_LENGTH,
  CUSTOM_TECHNIQUE_NAME_MIN_LENGTH,
  DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
  ATTR_KEY_LABELS,
  SECT_MEMBER_ROLE_HIERARCHY,
  SECT_MEMBER_ROLE_LABELS,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_GRADE_ORDER,
  calculateTechniqueBookCraftFragmentCost,
  calculateTechniqueBookDecomposeFragments,
  calculateTechniqueComprehensionProgressBreakdown,
  cloneTechniqueUnificationAccessPolicy,
  cloneTechniqueUnificationPermissions,
  getGraphemeCount,
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
type TechniqueAggregationPrimaryTab = 'overview' | 'record' | 'permissions';

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
  onUpdateTechniqueAggregationPermissions?: (payload: TechniqueAggregationPermissionRequest) => boolean | void;
  onLearnTechniqueAggregation?: (payload: TechniqueAggregationLearnRequest) => boolean | void;
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
const TECHNIQUE_AGGREGATION_PUBLISH_CONFIRM_OWNER = 'craft-workbench-modal:technique-aggregation-publish-confirm';
const TECHNIQUE_COMPREHENSION_DISCARD_CONFIRM_OWNER = 'craft-workbench-modal:technique-comprehension-discard-confirm';
const TRANSMISSION_STATUS_REQUEST_TIMEOUT_MS = 5_000;
const TECHNIQUE_AGGREGATION_PAGE_SIZE = 12;

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
    TECHNIQUE_AGGREGATE_BUILDING_REQUIRED: '须在统法台近前方可凝篇。',
    TECHNIQUE_AGGREGATE_BUILDING_OUT_OF_RANGE: '离统法台过远，法意难以相合。',
    TECHNIQUE_AGGREGATE_BUILDING_INVALID: '此座统法台暂不可用。',
    TECHNIQUE_AGGREGATE_PERMISSION_DENIED: '唯有自创内功之主方可将其归入法脉。',
    TECHNIQUE_AGGREGATE_PLATFORM_OWNER_REQUIRED: '唯有台主方可开宗立卷或设置权限。',
    TECHNIQUE_AGGREGATE_PLATFORM_ALREADY_BOUND: '此台已有所承法脉，不可改易。',
    TECHNIQUE_AGGREGATE_PLATFORM_UNBOUND: '此台尚未立下法脉。',
    TECHNIQUE_AGGREGATE_PLATFORM_MISMATCH: '所呈法脉与此台所承不符。',
    TECHNIQUE_AGGREGATE_ACCESS_DENIED: '你无权参阅此台法脉。',
    TECHNIQUE_AGGREGATE_REVISION_PERMISSION_DENIED: '你无权向此台法脉续录功法。',
    TECHNIQUE_AGGREGATE_NAME_INVALID: `法脉名讳须为 ${CUSTOM_TECHNIQUE_NAME_MIN_LENGTH}-${CUSTOM_TECHNIQUE_NAME_MAX_LENGTH} 个字。`,
    TECHNIQUE_AGGREGATE_LEARN_REJECTED: '暂无法参悟此法。',
    TECHNIQUE_AGGREGATE_SOURCE_EMPTY: '至少择取两部源法。',
    TECHNIQUE_AGGREGATE_SOURCE_DUPLICATE: '同一源法不可重复入卷。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_FOUND: '部分源法已不在法录之中，请重新查阅。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_CREATED: '唯有自创之法方可归入此卷。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_OWNER: '唯有源法开创者本人方可将其归宗。',
    TECHNIQUE_AGGREGATE_SOURCE_NOT_MASTERED: '源法须修至圆满，方可入卷。',
    TECHNIQUE_AGGREGATE_SOURCE_CATEGORY_INVALID: '统法台当前只收录内功。',
    TECHNIQUE_AGGREGATE_SOURCE_GRADE_MISMATCH: '一卷法脉只能统合同一品阶的内功。',
    TECHNIQUE_AGGREGATE_REVISION_INVALID: '法脉已由他人续录，请重新查阅当前法卷。',
    TECHNIQUE_AGGREGATE_REVISION_NOT_ADDITIVE: '续录新卷须添入至少一部新源法。',
    TECHNIQUE_AGGREGATE_OVERLAP: '所参法脉与已有功法重叠，不可重复承习。',
    TECHNIQUE_AGGREGATE_ALREADY_EXISTS: '此卷法脉已然凝成。',
    TECHNIQUE_AGGREGATE_OPERATION_REPLAYED: '此次凝篇已受理。',
    TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE: '法卷暂未能写成，请稍后再试。',
    TECHNIQUE_AGGREGATE_NOT_READY: '统法台法阵尚未就绪，请稍后再试。',
  };
  const code = result.code ?? '';
  const label = labels[code];
  if (label) {
    if (code === 'TECHNIQUE_AGGREGATE_REVISION_INVALID' && result.vars?.expectedRevision !== undefined) {
      return `${label}当前为第 ${formatDisplayInteger(Number(result.vars.expectedRevision) || 1)} 卷。`;
    }
    return label;
  }
  return '法脉凝篇未成，请稍后再试。';
}

function renderTechniqueAggregationConflicts(
  result: Pick<TechniqueAggregationResultView, 'vars' | 'conflictAggregateIds' | 'conflictSourceTechniqueIds' | 'invalidTechniqueIds'>,
): string {
  const aggregateIds = result.conflictAggregateIds?.filter(Boolean) ?? [];
  const sourceIds = result.conflictSourceTechniqueIds?.filter(Boolean) ?? [];
  const aggregateNames = typeof result.vars?.aggregateTechniqueNames === 'string'
    ? result.vars.aggregateTechniqueNames.trim()
    : '';
  const sourceNames = typeof result.vars?.sourceTechniqueNames === 'string'
    ? result.vars.sourceTechniqueNames.trim()
    : '';
  const invalidIds = result.invalidTechniqueIds?.filter(Boolean) ?? [];
  const rows: string[] = [];
  if (aggregateIds.length > 0) {
    const label = aggregateNames || `${formatDisplayInteger(aggregateIds.length)} 部已有法脉`;
    rows.push(`<li>相冲法脉：${escapeHtml(label)}</li>`);
  }
  if (sourceIds.length > 0) {
    const label = sourceNames || `${formatDisplayInteger(sourceIds.length)} 部已有功法`;
    rows.push(`<li>重叠功法：${escapeHtml(label)}</li>`);
  }
  if (invalidIds.length > 0) {
    rows.push(`<li>所选功法中有 ${formatDisplayInteger(invalidIds.length)} 部不可入卷，请重新选择。</li>`);
  }
  return rows.length > 0 ? `<ul class="technique-aggregation-conflicts">${rows.join('')}</ul>` : '';
}

function createTechniqueAggregationOperationId(sequence: number): string {
  const nonce = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.max(1, sequence).toString(36)}`;
  return `technique-aggregation-op:${nonce}`;
}

function areTechniqueAggregationPoliciesEqual(
  left: TechniqueUnificationAccessPolicy,
  right: TechniqueUnificationAccessPolicy,
): boolean {
  return left.unrestricted === right.unrestricted
    && left.friendLevels.length === right.friendLevels.length
    && left.friendLevels.every((entry, index) => entry === right.friendLevels[index])
    && left.sectRoles.length === right.sectRoles.length
    && left.sectRoles.every((entry, index) => entry === right.sectRoles[index]);
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
  private techniqueAggregationGradeFilter: TechniqueGrade | '' = '';
  private techniqueAggregationRealmFilter: number | null = null;
  private techniqueAggregationSourcePage = 1;
  private techniqueAggregationNameDraft = '';
  private techniqueAggregationPrimaryTab: TechniqueAggregationPrimaryTab = 'overview';
  private techniqueAggregationPermissionTab: TechniqueUnificationPermissionScope = 'read';
  private techniqueAggregationPermissionsDraft = cloneTechniqueUnificationPermissions(
    DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
  );
  private readonly techniqueAggregationPermissionDirtyScopes = new Set<TechniqueUnificationPermissionScope>();
  private readonly selectedTechniqueAggregationSourceIds = new Set<string>();
  private techniqueAggregationRequestSequence = 0;
  private techniqueAggregationRequestId = '';
  private techniqueAggregationOperationId = '';
  private techniqueAggregationResult: TechniqueAggregationResultView | null = null;
  private techniqueAggregationPublishing = false;
  private techniqueAggregationPermissionSaving: TechniqueUnificationPermissionScope | null = null;
  private techniqueAggregationLearning = false;

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
    this.techniqueAggregationGradeFilter = '';
    this.techniqueAggregationRealmFilter = null;
    this.techniqueAggregationSourcePage = 1;
    this.techniqueAggregationNameDraft = '';
    this.techniqueAggregationPrimaryTab = 'overview';
    this.techniqueAggregationPermissionTab = 'read';
    this.techniqueAggregationPermissionsDraft = cloneTechniqueUnificationPermissions(
      DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
    );
    this.techniqueAggregationPermissionDirtyScopes.clear();
    this.selectedTechniqueAggregationSourceIds.clear();
    this.techniqueAggregationResult = null;
    this.techniqueAggregationOperationId = '';
    this.techniqueAggregationPublishing = false;
    this.techniqueAggregationPermissionSaving = null;
    this.techniqueAggregationLearning = false;
    this.requestTechniqueAggregationPanel();
  }

  isTechniqueAggregationOpen(): boolean {
    return this.techniqueAggregationBuildingId.length > 0;
  }

  closeTechniqueAggregation(): void {
    confirmModalHost.close(TECHNIQUE_AGGREGATION_PUBLISH_CONFIRM_OWNER);
    this.techniqueAggregationBuildingId = '';
    this.techniqueAggregationPanel = null;
    this.techniqueAggregationFamilyId = '';
    this.techniqueAggregationExpectedRevision = undefined;
    this.techniqueAggregationGradeFilter = '';
    this.techniqueAggregationRealmFilter = null;
    this.techniqueAggregationSourcePage = 1;
    this.techniqueAggregationNameDraft = '';
    this.techniqueAggregationPrimaryTab = 'overview';
    this.techniqueAggregationPermissionTab = 'read';
    this.techniqueAggregationPermissionsDraft = cloneTechniqueUnificationPermissions(
      DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
    );
    this.techniqueAggregationPermissionDirtyScopes.clear();
    this.selectedTechniqueAggregationSourceIds.clear();
    this.techniqueAggregationRequestId = '';
    this.techniqueAggregationOperationId = '';
    this.techniqueAggregationResult = null;
    this.techniqueAggregationPublishing = false;
    this.techniqueAggregationPermissionSaving = null;
    this.techniqueAggregationLearning = false;
  }

  handleTechniqueAggregationPanel(data: TechniqueAggregationPanelView): void {
    if (this.techniqueAggregationRequestId && data.requestId && data.requestId !== this.techniqueAggregationRequestId) {
      return;
    }
    this.techniqueAggregationPanel = data;
    if ((this.techniqueAggregationPrimaryTab === 'record' && !data.platform.canRevise)
      || (this.techniqueAggregationPrimaryTab === 'permissions' && !data.platform.isOwner)) {
      this.techniqueAggregationPrimaryTab = 'overview';
    }
    const boundFamily = data.platform.familyId
      ? data.families.find((family) => family.familyId === data.platform.familyId)
      : undefined;
    this.techniqueAggregationFamilyId = data.platform.familyId ?? '';
    this.techniqueAggregationExpectedRevision = boundFamily?.latestRevision;
    const availableGrades = this.resolveTechniqueAggregationGrades(data);
    if (boundFamily?.grade) {
      this.techniqueAggregationGradeFilter = boundFamily.grade;
    } else if (!this.techniqueAggregationGradeFilter || !availableGrades.includes(this.techniqueAggregationGradeFilter)) {
      this.techniqueAggregationGradeFilter = availableGrades[0] ?? '';
    }
    const availableRealmLevels = this.resolveTechniqueAggregationRealmLevels(data);
    if (this.techniqueAggregationRealmFilter !== null && !availableRealmLevels.includes(this.techniqueAggregationRealmFilter)) {
      this.techniqueAggregationRealmFilter = null;
    }
    for (const scope of ['read', 'revision'] as const) {
      if (!this.techniqueAggregationPermissionDirtyScopes.has(scope)) {
        this.techniqueAggregationPermissionsDraft[scope] = cloneTechniqueUnificationAccessPolicy(
          data.platform.permissions[scope],
        );
      }
    }
    if (boundFamily && !this.techniqueAggregationNameDraft) {
      this.techniqueAggregationNameDraft = boundFamily.name;
    }
    const eligibleIds = new Set(data.eligibleSources.map((entry) => entry.techId));
    for (const techId of [...this.selectedTechniqueAggregationSourceIds]) {
      if (!eligibleIds.has(techId)) this.selectedTechniqueAggregationSourceIds.delete(techId);
    }
    this.clampTechniqueAggregationSourcePage();
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
    this.techniqueAggregationPermissionSaving = null;
    this.techniqueAggregationLearning = false;
    this.techniqueAggregationResult = data;
    if (data.ok) {
      if (data.operation === 'publish' || data.aggregate) {
        this.selectedTechniqueAggregationSourceIds.clear();
        this.techniqueAggregationOperationId = '';
        this.techniqueAggregationPermissionDirtyScopes.clear();
      }
      if (data.operation === 'permissions' && data.permissionScope) {
        this.techniqueAggregationPermissionDirtyScopes.delete(data.permissionScope);
      }
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
    const nextKey = this.buildTechniqueAggregationDataKey();
    if (panel.dataset.techniqueAggregationDataKey === nextKey) {
      this.patchTechniqueAggregationControls(panel);
      return true;
    }
    const previousScrollTop = panel.querySelector<HTMLElement>('[data-technique-aggregation-source-list="true"]')?.scrollTop ?? 0;
    replaceElementHtml(content, this.renderTechniqueAggregationBody());
    const nextList = content.querySelector<HTMLElement>('[data-technique-aggregation-source-list="true"]');
    if (nextList) nextList.scrollTop = previousScrollTop;
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

  private buildTechniqueAggregationDataKey(): string {
    const panel = this.techniqueAggregationPanel;
    const platform = panel?.platform;
    return [
      this.techniqueAggregationBuildingId,
      this.techniqueAggregationPrimaryTab,
      panel?.requestId ?? '',
      panel?.revision ?? 0,
      panel?.eligibleSources?.map((source) => [
        source.techId,
        source.name,
        source.grade,
        source.realmLv,
        source.strengthPercent,
        source.level,
        source.maxLevel,
        source.fullyMastered ? 1 : 0,
      ].join(':')).join('|') ?? '',
      panel?.families?.map((family) => [
        family.familyId,
        family.latestRevision,
        family.name,
        family.grade,
        family.realmLv,
        family.sourceCount,
        family.playerRevision ?? 0,
        family.playerCoveredCount,
        family.sourceTechniqueIds.join(','),
        family.sourceTechniques?.map((source) => `${source.techniqueId}:${source.name}`).join(',') ?? '',
        TECHNIQUE_ATTR_KEYS.map((key) => `${key}:${Number(family.fullLevelAttrs?.[key] ?? 0)}`).join(','),
      ].join(':')).join('|') ?? '',
      platform?.ownerPlayerId ?? '',
      platform?.isOwner ? 1 : 0,
      platform?.familyId ?? '',
      platform?.canLearn ? 1 : 0,
      platform?.canRevise ? 1 : 0,
      platform?.learnerState ?? '',
      platform?.latestTechniqueId ?? '',
      platform?.latestRevision ?? 0,
      platform?.pendingProgress ?? 0,
      platform?.pendingRequiredProgress ?? 0,
      platform?.permissions.read.unrestricted ? 1 : 0,
      platform?.permissions.read.friendLevels.join(',') ?? '',
      platform?.permissions.read.sectRoles.join(',') ?? '',
      platform?.permissions.revision.unrestricted ? 1 : 0,
      platform?.permissions.revision.friendLevels.join(',') ?? '',
      platform?.permissions.revision.sectRoles.join(',') ?? '',
      panel?.error?.code ?? '',
    ].join('::');
  }

  private resolveTechniqueAggregationGrades(panel = this.techniqueAggregationPanel): TechniqueGrade[] {
    if (!panel) return [];
    const values = new Set<TechniqueGrade>();
    for (const source of panel.eligibleSources) values.add(source.grade);
    for (const family of panel.families) values.add(family.grade);
    return TECHNIQUE_GRADE_ORDER.filter((grade) => values.has(grade));
  }

  private resolveTechniqueAggregationRealmLevels(panel = this.techniqueAggregationPanel): number[] {
    if (!panel) return [];
    const family = this.getBoundTechniqueAggregationFamily();
    const grade = family?.grade ?? this.techniqueAggregationGradeFilter;
    return [...new Set(panel.eligibleSources
      .filter((source) => !grade || source.grade === grade)
      .map((source) => Math.max(1, Math.trunc(Number(source.realmLv) || 1))))]
      .sort((left, right) => right - left);
  }

  private getBoundTechniqueAggregationFamily() {
    const panel = this.techniqueAggregationPanel;
    return panel?.platform.familyId
      ? panel.families.find((family) => family.familyId === panel.platform.familyId)
      : undefined;
  }

  private renderTechniqueAggregationAttrs(attrs: Partial<Attributes>): string {
    return TECHNIQUE_ATTR_KEYS.map((key) => `<span>
      <small>${escapeHtml(ATTR_KEY_LABELS[key])}</small>
      <strong>${formatDisplaySignedNumber(Number(attrs[key] ?? 0))}</strong>
    </span>`).join('');
  }

  private getSelectedTechniqueAggregationSources() {
    const sources = this.techniqueAggregationPanel?.eligibleSources ?? [];
    return sources.filter((source) => this.selectedTechniqueAggregationSourceIds.has(source.techId));
  }

  private getFilteredTechniqueAggregationSources() {
    const family = this.getBoundTechniqueAggregationFamily();
    const grade = family?.grade ?? this.techniqueAggregationGradeFilter;
    return (this.techniqueAggregationPanel?.eligibleSources ?? []).filter((source) => (
      (!grade || source.grade === grade)
      && (this.techniqueAggregationRealmFilter === null || source.realmLv === this.techniqueAggregationRealmFilter)
    ));
  }

  private getSelectableTechniqueAggregationSources() {
    const familySourceIds = new Set(this.getBoundTechniqueAggregationFamily()?.sourceTechniqueIds ?? []);
    return this.getFilteredTechniqueAggregationSources().filter((source) => (
      source.fullyMastered && !familySourceIds.has(source.techId)
    ));
  }

  private clampTechniqueAggregationSourcePage(): void {
    const totalPages = Math.max(1, Math.ceil(
      this.getFilteredTechniqueAggregationSources().length / TECHNIQUE_AGGREGATION_PAGE_SIZE,
    ));
    this.techniqueAggregationSourcePage = Math.min(
      totalPages,
      Math.max(1, Math.trunc(Number(this.techniqueAggregationSourcePage) || 1)),
    );
  }

  private canPublishTechniqueAggregation(): boolean {
    const panel = this.techniqueAggregationPanel;
    if (!panel?.platform.canRevise || this.techniqueAggregationPublishing || this.techniqueAggregationPermissionSaving) return false;
    const family = this.getBoundTechniqueAggregationFamily();
    const familySources = new Set(family?.sourceTechniqueIds ?? []);
    const selected = this.getSelectedTechniqueAggregationSources();
    const requiredCount = family ? 1 : 2;
    if (selected.length < requiredCount || !this.techniqueAggregationGradeFilter) return false;
    if (selected.some((source) => (
      !source.fullyMastered
      || source.grade !== this.techniqueAggregationGradeFilter
      || familySources.has(source.techId)
    ))) return false;
    if (family) return family.grade === this.techniqueAggregationGradeFilter;
    const nameLength = getGraphemeCount(this.techniqueAggregationNameDraft.trim());
    return nameLength >= CUSTOM_TECHNIQUE_NAME_MIN_LENGTH && nameLength <= CUSTOM_TECHNIQUE_NAME_MAX_LENGTH;
  }

  private getTechniqueAggregationSelectionHint(): string {
    const family = this.getBoundTechniqueAggregationFamily();
    const selected = this.getSelectedTechniqueAggregationSources();
    if (selected.length > 0) {
      return `已选 ${formatDisplayInteger(selected.length)} 部${getTechniqueGradeLabel(this.techniqueAggregationGradeFilter || selected[0].grade)}内功。成卷后六维总效提升一成，修习难度为诸法总和之半。`;
    }
    return family
      ? '续录新卷，尚须择取至少一部同阶圆满源法。'
      : '凝成首卷，尚须择取至少两部同阶圆满源法。';
  }

  private buildTechniqueAggregationResultKey(): string {
    const result = this.techniqueAggregationResult;
    return [
      result?.ok ?? '',
      result?.operation ?? '',
      result?.permissionScope ?? '',
      result?.code ?? '',
      result?.messageKey ?? '',
      result?.aggregate?.techniqueId ?? '',
      result?.aggregate?.revision ?? '',
      result?.conflictAggregateIds?.join(',') ?? '',
      result?.conflictSourceTechniqueIds?.join(',') ?? '',
      result?.invalidTechniqueIds?.join(',') ?? '',
      Object.entries(result?.vars ?? {}).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${String(value)}`).join(','),
    ].join(':');
  }

  private renderTechniqueAggregationResult(): string {
    const result = this.techniqueAggregationResult;
    if (!result) return '';
    if (!result.ok) {
      return `<div class="technique-aggregation-error" role="alert">${escapeHtml(resolveTechniqueAggregationError(result))}${renderTechniqueAggregationConflicts(result)}</div>`;
    }
    if (result.operation === 'permissions') {
      const label = result.permissionScope === 'revision' ? '修订权限' : '参阅权限';
      return `<div class="technique-aggregation-success" role="status">${label}已保存。</div>`;
    }
    if (result.operation === 'learn') {
      return '<div class="technique-aggregation-success" role="status">此法已列入参悟。</div>';
    }
    if (result.aggregate) {
      return `<div class="technique-aggregation-success" role="status">「${escapeHtml(result.aggregate.name)}」第 ${formatDisplayInteger(result.aggregate.revision)} 卷已成。</div>`;
    }
    return '';
  }

  private renderTechniqueAggregationPolicySummary(
    scope: TechniqueUnificationPermissionScope,
    policy: TechniqueUnificationAccessPolicy,
  ): string {
    const label = scope === 'revision' ? '修订权限' : '参阅权限';
    if (policy.unrestricted) return `${label}：所有修士`;
    const clauses: string[] = [];
    if (policy.friendLevels.includes('dao_friend')) clauses.push('道友以上');
    else if (policy.friendLevels.includes('close_friend')) clauses.push('至交');
    const sectLabels = policy.sectRoles.map((role) => SECT_MEMBER_ROLE_LABELS[role]);
    if (sectLabels.length > 0) clauses.push(`同门：${sectLabels.join('、')}`);
    return clauses.length > 0 ? `${label}：${clauses.join('；')}` : `${label}：仅台主`;
  }

  private renderTechniqueAggregationPermissionEditor(bound: boolean): string {
    const scope = this.techniqueAggregationPermissionTab;
    const policy = this.techniqueAggregationPermissionsDraft[scope];
    const scopeLabel = scope === 'revision' ? '修订' : '参阅';
    const disabled = this.techniqueAggregationPublishing || this.techniqueAggregationPermissionSaving !== null;
    const friendOptions = [
      { value: 'dao_friend', label: '道友' },
      { value: 'close_friend', label: '至交' },
    ].map((entry) => `<label class="technique-aggregation-policy-option">
      <input type="checkbox" data-technique-aggregation-permission-friend="${entry.value}" ${policy.friendLevels.includes(entry.value as 'dao_friend' | 'close_friend') ? 'checked' : ''} ${policy.unrestricted || disabled ? 'disabled' : ''}>
      <span>${entry.label}</span>
    </label>`).join('');
    const sectOptions = SECT_MEMBER_ROLE_HIERARCHY.map((role) => `<label class="technique-aggregation-policy-option">
      <input type="checkbox" data-technique-aggregation-permission-sect-role="${role}" ${policy.sectRoles.includes(role) ? 'checked' : ''} ${policy.unrestricted || disabled ? 'disabled' : ''}>
      <span>${SECT_MEMBER_ROLE_LABELS[role]}</span>
    </label>`).join('');
    const authoritativePolicy = this.techniqueAggregationPanel?.platform.permissions[scope];
    const saveDisabled = disabled
      || !bound
      || !this.techniqueAggregationPermissionDirtyScopes.has(scope)
      || (authoritativePolicy ? areTechniqueAggregationPoliciesEqual(policy, authoritativePolicy) : false);
    return `<div class="technique-aggregation-policy" data-technique-aggregation-permission-editor="true">
      <label class="technique-aggregation-policy-unrestricted">
        <input type="checkbox" data-technique-aggregation-permission-unrestricted="true" ${policy.unrestricted ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>不作限制，所有修士均可${scopeLabel}</span>
      </label>
      <div class="technique-aggregation-policy-group">
        <span class="technique-aggregation-policy-label">道缘</span>
        <div class="technique-aggregation-policy-options">${friendOptions}</div>
      </div>
      <div class="technique-aggregation-policy-group">
        <span class="technique-aggregation-policy-label">同门位次</span>
        <div class="technique-aggregation-policy-options">${sectOptions}</div>
      </div>
      ${bound ? `<button type="button" class="small-btn" data-craft-action="technique-aggregation-save-permission" ${saveDisabled ? 'disabled' : ''}>${this.techniqueAggregationPermissionSaving === scope ? '保存中...' : `保存${scopeLabel}权限`}</button>` : '<span class="alchemy-summary-mode">首卷凝成时，两项权限一并生效</span>'}
    </div>`;
  }

  private renderTechniqueAggregationPermissions(bound: boolean): string {
    return `<div class="technique-aggregation-permissions" data-technique-aggregation-permissions="true">
      <div class="technique-aggregation-permission-tabs" role="tablist" aria-label="统法台权限">
        ${(['read', 'revision'] as const).map((scope) => {
          const active = scope === this.techniqueAggregationPermissionTab;
          const label = scope === 'read' ? '参阅权限' : '修订权限';
          return `<button type="button" class="technique-aggregation-permission-tab${active ? ' is-active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" data-craft-action="technique-aggregation-permission-tab" data-permission-scope="${scope}">${label}</button>`;
        }).join('')}
      </div>
      ${this.renderTechniqueAggregationPermissionEditor(bound)}
    </div>`;
  }

  private renderTechniqueAggregationSourceCard(
    source: TechniqueAggregationPanelView['eligibleSources'][number],
    familySourceIds: ReadonlySet<string>,
  ): string {
    const selected = this.selectedTechniqueAggregationSourceIds.has(source.techId);
    const alreadyRecorded = familySourceIds.has(source.techId);
    const disabled = this.techniqueAggregationPublishing || !source.fullyMastered || alreadyRecorded;
    const state = alreadyRecorded ? '已入法脉' : source.fullyMastered ? '' : '未圆满';
    const realmLabel = getLocalRealmLevelEntry(source.realmLv)?.displayName
      ?? `境界 ${formatDisplayInteger(source.realmLv)}`;
    const levelText = source.fullyMastered
      ? `圆满 ${formatDisplayInteger(source.maxLevel)} 层`
      : `${formatDisplayInteger(source.level)}/${formatDisplayInteger(source.maxLevel)} 层`;
    return `<button type="button" class="inventory-cell inventory-cell--grade inventory-cell--grade-${source.grade} technique-aggregation-source${selected ? ' is-selected' : ''}" data-craft-action="technique-aggregation-toggle-source" data-technique-id="${escapeHtmlAttr(source.techId)}" aria-pressed="${selected ? 'true' : 'false'}" ${disabled ? 'disabled' : ''}>
      <div class="inventory-cell-head"><span class="inventory-cell-type">内功</span></div>
      ${state ? `<span class="technique-aggregation-source-mark">${state}</span>` : '<span class="technique-aggregation-source-mark" aria-hidden="true"></span>'}
      <div class="inventory-cell-grade-line">${escapeHtml(getTechniqueGradeLabel(source.grade))} · ${escapeHtml(realmLabel)}</div>
      <div class="inventory-cell-name" aria-label="${escapeHtmlAttr(source.name)}">${escapeHtml(resolveClientTechniqueName(source.techId, source.name))}</div>
      <span class="item-card-chip technique-aggregation-source-strength">强度 ${formatDisplayInteger(source.strengthPercent)}%</span>
      <span class="item-card-chip item-card-chip--level">${escapeHtml(levelText)}</span>
    </button>`;
  }

  private renderTechniqueAggregationDirectoryContent(): string {
    const panel = this.techniqueAggregationPanel;
    if (!panel) return '';
    this.clampTechniqueAggregationSourcePage();
    const family = this.getBoundTechniqueAggregationFamily();
    const familySourceIds = new Set(family?.sourceTechniqueIds ?? []);
    const grades = this.resolveTechniqueAggregationGrades(panel);
    const gradeOptions = grades.map((grade) => (
      `<option value="${grade}" ${grade === this.techniqueAggregationGradeFilter ? 'selected' : ''}>${escapeHtml(getTechniqueGradeLabel(grade))}</option>`
    )).join('');
    const realmLevels = this.resolveTechniqueAggregationRealmLevels(panel);
    const realmOptions = realmLevels.map((realmLv) => {
      const label = getLocalRealmLevelEntry(realmLv)?.displayName ?? `境界 ${formatDisplayInteger(realmLv)}`;
      return `<option value="${realmLv}" ${realmLv === this.techniqueAggregationRealmFilter ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    const filtered = this.getFilteredTechniqueAggregationSources();
    const totalPages = Math.max(1, Math.ceil(filtered.length / TECHNIQUE_AGGREGATION_PAGE_SIZE));
    const offset = (this.techniqueAggregationSourcePage - 1) * TECHNIQUE_AGGREGATION_PAGE_SIZE;
    const pageSources = filtered.slice(offset, offset + TECHNIQUE_AGGREGATION_PAGE_SIZE);
    const selectable = this.getSelectableTechniqueAggregationSources();
    const allSelected = selectable.length > 0
      && selectable.every((source) => this.selectedTechniqueAggregationSourceIds.has(source.techId));
    const from = filtered.length > 0 ? offset + 1 : 0;
    const to = Math.min(filtered.length, offset + pageSources.length);
    return `<div class="technique-aggregation-directory-toolbar">
      <div class="technique-aggregation-directory-filters">
        <label><span>品阶</span><select class="ui-select" data-technique-aggregation-grade-filter="true" ${family ? 'disabled' : ''}>${gradeOptions || '<option value="">暂无候选</option>'}</select></label>
        <label><span>境界</span><select class="ui-select" data-technique-aggregation-realm-filter="true"><option value="">全部境界</option>${realmOptions}</select></label>
      </div>
      <div class="technique-aggregation-directory-actions">
        <button type="button" class="small-btn ghost" data-craft-action="technique-aggregation-select-all" ${selectable.length === 0 || allSelected || this.techniqueAggregationPublishing ? 'disabled' : ''}>全选</button>
        <button type="button" class="small-btn ghost" data-craft-action="technique-aggregation-clear-selection" ${this.selectedTechniqueAggregationSourceIds.size === 0 || this.techniqueAggregationPublishing ? 'disabled' : ''}>全部取消</button>
      </div>
    </div>
    <div class="technique-aggregation-source-list" data-technique-aggregation-source-list="true">
      ${pageSources.map((source) => this.renderTechniqueAggregationSourceCard(source, familySourceIds)).join('')}
    </div>
    ${pageSources.length === 0 ? '<div class="empty-hint">当前筛选下暂无可归宗的自创内功。</div>' : ''}
    <div class="technique-aggregation-pagination">
      <button type="button" class="small-btn ghost" data-craft-action="technique-aggregation-page-prev" ${this.techniqueAggregationSourcePage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${formatDisplayInteger(this.techniqueAggregationSourcePage)} 页，共 ${formatDisplayInteger(totalPages)} 页 · 当前 ${formatDisplayInteger(from)}-${formatDisplayInteger(to)} 部，共 ${formatDisplayInteger(filtered.length)} 部</span>
      <button type="button" class="small-btn ghost" data-craft-action="technique-aggregation-page-next" ${this.techniqueAggregationSourcePage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>`;
  }

  private renderTechniqueAggregationPrimaryTabs(panel: TechniqueAggregationPanelView): string {
    const tabs: Array<{ key: TechniqueAggregationPrimaryTab; label: string }> = [
      { key: 'overview', label: '总览' },
      ...(panel.platform.canRevise ? [{ key: 'record' as const, label: '录法' }] : []),
      ...(panel.platform.isOwner ? [{ key: 'permissions' as const, label: '权限' }] : []),
    ];
    return `<div class="technique-aggregation-primary-tabs" role="tablist" aria-label="统法台">
      ${tabs.map((tab) => {
        const active = tab.key === this.techniqueAggregationPrimaryTab;
        return `<button type="button" class="technique-aggregation-primary-tab${active ? ' is-active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" data-craft-action="technique-aggregation-primary-tab" data-primary-tab="${tab.key}">${tab.label}</button>`;
      }).join('')}
    </div>`;
  }

  private renderTechniqueAggregationFamilySummary(
    panel: TechniqueAggregationPanelView,
    family: TechniqueAggregationPanelView['families'][number] | undefined,
  ): string {
    if (!family) {
      return '<div class="technique-aggregation-lineage-summary is-unbound"><div><strong>此台尚未立脉</strong><small>凝成首卷后，此台所承法脉不可改易</small></div></div>';
    }
    const recordedSources = family.sourceTechniques?.length
      ? family.sourceTechniques
      : family.sourceTechniqueIds.map((techniqueId) => ({
        techniqueId,
        name: resolveClientTechniqueName(techniqueId),
      }));
    return `<div class="technique-aggregation-lineage-summary">
      <div><strong>${escapeHtml(resolveClientTechniqueName(family.latestTechniqueId, family.name))}</strong><small>${escapeHtml(getTechniqueGradeLabel(family.grade))} · 第 ${formatDisplayInteger(family.latestRevision)} 卷</small></div>
      <span>${family.playerRevision ? `已习得第 ${formatDisplayInteger(family.playerRevision)} 卷` : `已习得 ${formatDisplayInteger(family.playerCoveredCount)}/${formatDisplayInteger(family.sourceCount)} 部源法`}</span>
    </div>
    <div class="technique-aggregation-overview-metrics">
      <span><small>源法</small><strong>${formatDisplayInteger(family.sourceCount)} 部</strong></span>
      <span><small>法效</small><strong>诸法总和一成增益</strong></span>
    </div>
    <div class="technique-aggregation-overview-section">
      <div class="technique-aggregation-overview-head"><strong>法脉所录</strong><small>源法 ${formatDisplayInteger(recordedSources.length)} 部</small></div>
      <div class="technique-aggregation-recorded-sources">
        ${recordedSources.map((source, index) => `<span><small>${formatDisplayInteger(index + 1)}</small><strong>${escapeHtml(source.name)}</strong></span>`).join('')}
      </div>
    </div>
    <div class="technique-aggregation-overview-section">
      <div class="technique-aggregation-overview-head"><strong>圆满六维总加成</strong><small>下列数值已含一成法效增益</small></div>
      <div class="technique-aggregation-attribute-grid">${this.renderTechniqueAggregationAttrs(family.fullLevelAttrs ?? {})}</div>
    </div>
    <div class="technique-aggregation-permission-summaries">
      <span>${escapeHtml(this.renderTechniqueAggregationPolicySummary('read', panel.platform.permissions.read))}</span>
      <span>${escapeHtml(this.renderTechniqueAggregationPolicySummary('revision', panel.platform.permissions.revision))}</span>
    </div>`;
  }

  private renderTechniqueAggregationResultHost(): string {
    return `<div data-technique-aggregation-result="true" data-technique-aggregation-result-key="${escapeHtmlAttr(this.buildTechniqueAggregationResultKey())}">${this.renderTechniqueAggregationResult()}</div>`;
  }

  private renderTechniqueAggregationOverview(
    panel: TechniqueAggregationPanelView,
    family: TechniqueAggregationPanelView['families'][number] | undefined,
  ): string {
    const platform = panel.platform;
    const learnLabel = platform.learnerState === 'pending'
      ? `参悟中 · ${formatDisplayInteger(platform.pendingProgress ?? 0)}/${formatDisplayInteger(platform.pendingRequiredProgress ?? 1)}`
      : platform.learnerState === 'learned'
        ? '已习得此法'
        : platform.canLearn ? '参悟此法' : '无权参阅';
    const learnDisabled = !family
      || !platform.canLearn
      || platform.learnerState !== 'available'
      || this.techniqueAggregationLearning;
    return `<section class="alchemy-summary-card">
      <div class="alchemy-summary-head"><div class="alchemy-summary-title">${platform.isOwner ? '本台法脉' : '台上法脉'}</div><span class="alchemy-summary-mode">${escapeHtml(platform.displayName)}</span></div>
      ${this.renderTechniqueAggregationFamilySummary(panel, family)}
      ${family ? `<button type="button" class="small-btn" data-craft-action="technique-aggregation-learn" ${learnDisabled ? 'disabled' : ''}>${this.techniqueAggregationLearning ? '正在纳入...' : learnLabel}</button>` : ''}
      ${this.renderTechniqueAggregationResultHost()}
    </section>`;
  }

  private renderTechniqueAggregationSourceRecording(
    family: TechniqueAggregationPanelView['families'][number] | undefined,
  ): string {
    const publishLabel = family ? '续录新卷' : '凝成首卷';
    return `<div class="technique-aggregation-compose-controls">
      ${family
        ? `<div class="technique-aggregation-fixed-field"><span>法脉名讳</span><strong>${escapeHtml(family.name)}</strong></div><div class="technique-aggregation-fixed-field"><span>法脉品阶</span><strong>${escapeHtml(getTechniqueGradeLabel(family.grade))}</strong></div>`
        : `<label class="technique-aggregation-name-field"><span>法脉名讳</span><input class="ui-input" type="text" data-technique-aggregation-name="true" minlength="${CUSTOM_TECHNIQUE_NAME_MIN_LENGTH}" maxlength="${CUSTOM_TECHNIQUE_NAME_MAX_LENGTH}" value="${escapeHtmlAttr(this.techniqueAggregationNameDraft)}" autocomplete="off"></label>`}
    </div>
    <div class="technique-aggregation-directory" data-technique-aggregation-directory="true">${this.renderTechniqueAggregationDirectoryContent()}</div>
    <div class="technique-aggregation-selection-summary" data-technique-aggregation-selection-summary="true">${escapeHtml(this.getTechniqueAggregationSelectionHint())}</div>
    <button type="button" class="small-btn" data-craft-action="technique-aggregation-publish" ${this.canPublishTechniqueAggregation() ? '' : 'disabled'}>${this.techniqueAggregationPublishing ? '凝篇中...' : publishLabel}</button>`;
  }

  private renderTechniqueAggregationRecord(
    family: TechniqueAggregationPanelView['families'][number] | undefined,
  ): string {
    return `<section class="alchemy-summary-card technique-aggregation-compose">
      <div class="alchemy-summary-head"><div class="alchemy-summary-title">录法</div><span class="alchemy-summary-mode">${family ? `第 ${formatDisplayInteger(family.latestRevision)} 卷` : '开宗立卷'}</span></div>
      <div data-technique-aggregation-record-content="true">
        ${this.renderTechniqueAggregationSourceRecording(family)}
      </div>
      ${this.renderTechniqueAggregationResultHost()}
    </section>`;
  }

  private renderTechniqueAggregationPermissionsTab(
    family: TechniqueAggregationPanelView['families'][number] | undefined,
  ): string {
    return `<section class="alchemy-summary-card">
      <div class="alchemy-summary-head"><div class="alchemy-summary-title">权限</div><span class="alchemy-summary-mode">参阅与修订分别设置</span></div>
      ${this.renderTechniqueAggregationPermissions(Boolean(family))}
      ${this.renderTechniqueAggregationResultHost()}
    </section>`;
  }

  private renderTechniqueAggregationBody(): string {
    const panel = this.techniqueAggregationPanel;
    if (!panel) {
      return `<div class="alchemy-tab-stack" data-technique-aggregation-panel="true" data-technique-aggregation-data-key="${escapeHtmlAttr(this.buildTechniqueAggregationDataKey())}">
        <section class="alchemy-summary-card"><div class="empty-hint">正在查阅统法台法录...</div></section>
      </div>`;
    }
    const platform = panel.platform;
    const family = this.getBoundTechniqueAggregationFamily();

    if (platform.familyId && !family) {
      return `<div class="alchemy-tab-stack" data-technique-aggregation-panel="true" data-technique-aggregation-data-key="${escapeHtmlAttr(this.buildTechniqueAggregationDataKey())}">
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head"><div class="alchemy-summary-title">台上法脉</div><span class="alchemy-summary-mode">${escapeHtml(platform.displayName)}</span></div>
          <div class="technique-aggregation-error" role="alert">此台法脉卷册暂不可读取，请稍后再试。</div>
          ${this.renderTechniqueAggregationResultHost()}
        </section>
      </div>`;
    }
    return `<div class="alchemy-tab-stack" data-technique-aggregation-panel="true" data-technique-aggregation-data-key="${escapeHtmlAttr(this.buildTechniqueAggregationDataKey())}">
      ${this.renderTechniqueAggregationPrimaryTabs(panel)}
      <div class="technique-aggregation-tab-content" data-technique-aggregation-tab-content="true">
        ${this.techniqueAggregationPrimaryTab === 'record' && platform.canRevise
          ? this.renderTechniqueAggregationRecord(family)
          : this.techniqueAggregationPrimaryTab === 'permissions' && platform.isOwner
            ? this.renderTechniqueAggregationPermissionsTab(family)
            : this.renderTechniqueAggregationOverview(panel, family)}
      </div>
    </div>`;
  }

  private patchTechniqueAggregationControls(root: HTMLElement): void {
    const panel = this.techniqueAggregationPanel;
    if (!panel) return;
    const family = this.getBoundTechniqueAggregationFamily();
    const familySourceIds = new Set(family?.sourceTechniqueIds ?? []);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-craft-action="technique-aggregation-toggle-source"]')) {
      const techId = (button.dataset.techniqueId ?? '').trim();
      const source = panel.eligibleSources.find((entry) => entry.techId === techId);
      if (!source) continue;
      const selected = this.selectedTechniqueAggregationSourceIds.has(techId);
      const alreadyRecorded = familySourceIds.has(techId);
      button.disabled = this.techniqueAggregationPublishing || !source.fullyMastered || alreadyRecorded;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const mark = button.querySelector<HTMLElement>('.technique-aggregation-source-mark');
      if (mark) mark.textContent = alreadyRecorded ? '已入法脉' : source.fullyMastered ? '' : '未圆满';
    }
    const gradeSelect = root.querySelector<HTMLSelectElement>('[data-technique-aggregation-grade-filter="true"]');
    if (gradeSelect && gradeSelect.value !== this.techniqueAggregationGradeFilter) {
      gradeSelect.value = this.techniqueAggregationGradeFilter;
    }
    const realmSelect = root.querySelector<HTMLSelectElement>('[data-technique-aggregation-realm-filter="true"]');
    if (realmSelect && realmSelect.value !== (this.techniqueAggregationRealmFilter?.toString() ?? '')) {
      realmSelect.value = this.techniqueAggregationRealmFilter?.toString() ?? '';
    }
    const nameInput = root.querySelector<HTMLInputElement>('[data-technique-aggregation-name="true"]');
    if (nameInput && document.activeElement !== nameInput && nameInput.value !== this.techniqueAggregationNameDraft) {
      nameInput.value = this.techniqueAggregationNameDraft;
    }
    const summary = root.querySelector<HTMLElement>('[data-technique-aggregation-selection-summary="true"]');
    if (summary) summary.textContent = this.getTechniqueAggregationSelectionHint();
    const selectableSources = this.getSelectableTechniqueAggregationSources();
    const allSelected = selectableSources.length > 0
      && selectableSources.every((source) => this.selectedTechniqueAggregationSourceIds.has(source.techId));
    const selectAll = root.querySelector<HTMLButtonElement>('[data-craft-action="technique-aggregation-select-all"]');
    if (selectAll) selectAll.disabled = selectableSources.length === 0 || allSelected || this.techniqueAggregationPublishing;
    const clearSelection = root.querySelector<HTMLButtonElement>('[data-craft-action="technique-aggregation-clear-selection"]');
    if (clearSelection) clearSelection.disabled = this.selectedTechniqueAggregationSourceIds.size === 0 || this.techniqueAggregationPublishing;
    const publish = root.querySelector<HTMLButtonElement>('[data-craft-action="technique-aggregation-publish"]');
    if (publish) {
      publish.disabled = !this.canPublishTechniqueAggregation();
      publish.textContent = this.techniqueAggregationPublishing ? '凝篇中...' : family ? '续录新卷' : '凝成首卷';
    }
    const activePolicy = this.techniqueAggregationPermissionsDraft[this.techniqueAggregationPermissionTab];
    const unrestricted = root.querySelector<HTMLInputElement>('[data-technique-aggregation-permission-unrestricted="true"]');
    if (unrestricted) {
      unrestricted.checked = activePolicy.unrestricted;
      unrestricted.disabled = this.techniqueAggregationPublishing || this.techniqueAggregationPermissionSaving !== null;
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-technique-aggregation-permission-friend]')) {
      const value = input.dataset.techniqueAggregationPermissionFriend as 'dao_friend' | 'close_friend' | undefined;
      input.checked = Boolean(value && activePolicy.friendLevels.includes(value));
      input.disabled = activePolicy.unrestricted || this.techniqueAggregationPublishing || this.techniqueAggregationPermissionSaving !== null;
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-technique-aggregation-permission-sect-role]')) {
      const value = input.dataset.techniqueAggregationPermissionSectRole as SectMemberRole | undefined;
      input.checked = Boolean(value && activePolicy.sectRoles.includes(value));
      input.disabled = activePolicy.unrestricted || this.techniqueAggregationPublishing || this.techniqueAggregationPermissionSaving !== null;
    }
    const savePermission = root.querySelector<HTMLButtonElement>('[data-craft-action="technique-aggregation-save-permission"]');
    if (savePermission) {
      const scope = this.techniqueAggregationPermissionTab;
      savePermission.disabled = this.techniqueAggregationPermissionSaving !== null
        || this.techniqueAggregationPublishing
        || !this.techniqueAggregationPermissionDirtyScopes.has(scope)
        || areTechniqueAggregationPoliciesEqual(activePolicy, panel.platform.permissions[scope]);
      savePermission.textContent = this.techniqueAggregationPermissionSaving === scope
        ? '保存中...'
        : `保存${scope === 'revision' ? '修订' : '参阅'}权限`;
    }
    const learn = root.querySelector<HTMLButtonElement>('[data-craft-action="technique-aggregation-learn"]');
    if (learn) {
      learn.disabled = !family
        || !panel.platform.canLearn
        || panel.platform.learnerState !== 'available'
        || this.techniqueAggregationLearning;
      learn.textContent = this.techniqueAggregationLearning
        ? '正在纳入...'
        : panel.platform.learnerState === 'pending'
          ? `参悟中 · ${formatDisplayInteger(panel.platform.pendingProgress ?? 0)}/${formatDisplayInteger(panel.platform.pendingRequiredProgress ?? 1)}`
          : panel.platform.learnerState === 'learned'
            ? '已习得此法'
            : panel.platform.canLearn ? '参悟此法' : '无权参阅';
    }
    const resultHost = root.querySelector<HTMLElement>('[data-technique-aggregation-result="true"]');
    const resultKey = this.buildTechniqueAggregationResultKey();
    if (resultHost && resultHost.dataset.techniqueAggregationResultKey !== resultKey) {
      replaceElementHtml(resultHost, this.renderTechniqueAggregationResult());
      resultHost.dataset.techniqueAggregationResultKey = resultKey;
    }
  }

  private patchTechniqueAggregationDirectory(root: HTMLElement): void {
    const directory = root.querySelector<HTMLElement>('[data-technique-aggregation-directory="true"]');
    if (!directory) return;
    replaceElementHtml(directory, this.renderTechniqueAggregationDirectoryContent());
  }

  private patchTechniqueAggregationPermissions(root: HTMLElement): void {
    const permissions = root.querySelector<HTMLElement>('[data-technique-aggregation-permissions="true"]');
    if (!permissions) return;
    const template = document.createElement('template');
    template.innerHTML = this.renderTechniqueAggregationPermissions(Boolean(this.getBoundTechniqueAggregationFamily())).trim();
    const next = template.content.firstElementChild;
    if (next instanceof HTMLElement) permissions.replaceChildren(...next.childNodes);
  }

  private patchOpenTechniqueAggregationControls(): void {
    const body = document.getElementById('detail-modal-body');
    const root = body?.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
    if (root) this.patchTechniqueAggregationControls(root);
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
        platform: {
          buildingId: this.techniqueAggregationBuildingId,
          displayName: '统法台',
          isOwner: false,
          permissions: cloneTechniqueUnificationPermissions(DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS),
          canLearn: false,
          canRevise: false,
          learnerState: 'unbound',
        },
        error: {
          code: 'TECHNIQUE_AGGREGATE_NOT_READY',
          messageKey: 'technique.aggregation.technique_aggregate_not_ready',
        },
      };
      this.parent.patchOpenCraftShell();
    }
  }

  private publishTechniqueAggregation(): void {
    if (this.techniqueAggregationPublishing || this.techniqueAggregationPermissionSaving) return;
    const panel = this.techniqueAggregationPanel;
    const sourceTechniqueIds = [...this.selectedTechniqueAggregationSourceIds].sort();
    if (!panel) return;
    const minimumSelectionCount = this.techniqueAggregationFamilyId ? 1 : 2;
    if (sourceTechniqueIds.length < minimumSelectionCount) return;
    if (!this.techniqueAggregationOperationId) {
      this.techniqueAggregationOperationId = createTechniqueAggregationOperationId(++this.techniqueAggregationRequestSequence);
    }
    const request = this.transmissionCallbacks?.onPublishTechniqueAggregation
      ?? this.parent.callbacks?.onPublishTechniqueAggregation;
    if (!request) return;
    this.techniqueAggregationPublishing = true;
    this.patchOpenTechniqueAggregationControls();
    let accepted: boolean | void;
    try {
      accepted = request({
        requestId: this.techniqueAggregationRequestId,
        operationId: this.techniqueAggregationOperationId,
        buildingId: this.techniqueAggregationBuildingId,
        ...(this.techniqueAggregationFamilyId ? {
          familyId: this.techniqueAggregationFamilyId,
          expectedRevision: this.techniqueAggregationExpectedRevision,
        } : {
          customName: this.techniqueAggregationNameDraft,
          permissions: cloneTechniqueUnificationPermissions(this.techniqueAggregationPermissionsDraft),
        }),
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
      this.patchOpenTechniqueAggregationControls();
    }
  }

  private openTechniqueAggregationPublishConfirmModal(): void {
    if (!this.canPublishTechniqueAggregation()) return;
    const family = this.getBoundTechniqueAggregationFamily();
    const techniqueName = family?.name ?? this.techniqueAggregationNameDraft.trim();
    const selectedCount = this.getSelectedTechniqueAggregationSources().length;
    confirmModalHost.open({
      ownerId: TECHNIQUE_AGGREGATION_PUBLISH_CONFIRM_OWNER,
      title: family ? '确认续录新卷' : '确认凝成首卷',
      subtitle: `法脉「${techniqueName}」`,
      bodyHtml: family
        ? `<div class="alchemy-summary-metric"><span class="alchemy-summary-metric-label">本次续录</span><strong class="alchemy-summary-metric-value">${formatDisplayInteger(selectedCount)} 部圆满内功</strong></div><div class="empty-hint">续录完成后，新卷将承接既有法脉名讳与全部源法。</div>`
        : `<div class="alchemy-summary-metric"><span class="alchemy-summary-metric-label">法脉名讳</span><strong class="alchemy-summary-metric-value">${escapeHtml(techniqueName)}</strong></div><div class="alchemy-summary-metric"><span class="alchemy-summary-metric-label">首卷收录</span><strong class="alchemy-summary-metric-value">${formatDisplayInteger(selectedCount)} 部圆满内功</strong></div><div class="market-action-hint market-action-hint--error"><strong>法脉名讳一经凝篇，往后不可更改。</strong><br>请确认名讳无误后再行统法。</div>`,
      confirmLabel: family ? '确认续录' : '确认凝篇',
      cancelLabel: '返回查验',
      ...(!family ? { confirmButtonClass: 'danger' } : {}),
      onConfirm: () => this.publishTechniqueAggregation(),
    });
  }

  private updateTechniqueAggregationPermission(): void {
    const panel = this.techniqueAggregationPanel;
    if (!panel?.platform.isOwner
      || !panel.platform.familyId
      || this.techniqueAggregationPermissionSaving
      || this.techniqueAggregationPublishing) return;
    const request = this.transmissionCallbacks?.onUpdateTechniqueAggregationPermissions
      ?? this.parent.callbacks?.onUpdateTechniqueAggregationPermissions;
    if (!request) return;
    const scope = this.techniqueAggregationPermissionTab;
    this.techniqueAggregationPermissionSaving = scope;
    this.techniqueAggregationResult = null;
    this.patchOpenTechniqueAggregationControls();
    let accepted: boolean | void;
    try {
      accepted = request({
        requestId: this.techniqueAggregationRequestId,
        buildingId: this.techniqueAggregationBuildingId,
        scope,
        policy: cloneTechniqueUnificationAccessPolicy(this.techniqueAggregationPermissionsDraft[scope]),
      });
    } catch {
      accepted = false;
    }
    if (accepted === false) {
      this.techniqueAggregationPermissionSaving = null;
      this.techniqueAggregationResult = {
        requestId: this.techniqueAggregationRequestId,
        ok: false,
        operation: 'permissions',
        permissionScope: scope,
        code: 'TECHNIQUE_AGGREGATE_NOT_READY',
      };
      this.patchOpenTechniqueAggregationControls();
    }
  }

  private learnTechniqueAggregation(): void {
    const panel = this.techniqueAggregationPanel;
    if (!panel?.platform.canLearn || panel.platform.learnerState !== 'available' || this.techniqueAggregationLearning) return;
    const request = this.transmissionCallbacks?.onLearnTechniqueAggregation
      ?? this.parent.callbacks?.onLearnTechniqueAggregation;
    if (!request) return;
    this.techniqueAggregationLearning = true;
    this.techniqueAggregationResult = null;
    this.parent.patchOpenCraftShell();
    let accepted: boolean | void;
    try {
      accepted = request({
        requestId: this.techniqueAggregationRequestId,
        buildingId: this.techniqueAggregationBuildingId,
      });
    } catch {
      accepted = false;
    }
    if (accepted === false) {
      this.techniqueAggregationLearning = false;
      this.techniqueAggregationResult = {
        requestId: this.techniqueAggregationRequestId,
        ok: false,
        operation: 'learn',
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
    if (action === 'technique-aggregation-primary-tab') {
      const tab = target.dataset.primaryTab as TechniqueAggregationPrimaryTab | undefined;
      const platform = this.techniqueAggregationPanel?.platform;
      if (tab === 'overview'
        || (tab === 'record' && platform?.canRevise)
        || (tab === 'permissions' && platform?.isOwner)) {
        this.techniqueAggregationPrimaryTab = tab;
        this.parent.patchOpenCraftShell();
      }
      return true;
    }
    if (action === 'technique-aggregation-toggle-source') {
      if (this.techniqueAggregationPublishing) return true;
      const techId = (target.dataset.techniqueId ?? '').trim();
      const source = this.techniqueAggregationPanel?.eligibleSources.find((entry) => entry.techId === techId);
      if (!source || !source.fullyMastered) return true;
      const family = this.getBoundTechniqueAggregationFamily();
      if (family?.sourceTechniqueIds.includes(techId)) return true;
      if (this.selectedTechniqueAggregationSourceIds.has(techId)) {
        this.selectedTechniqueAggregationSourceIds.delete(techId);
      } else {
        const currentGrade = this.techniqueAggregationPanel?.eligibleSources.find((entry) => this.selectedTechniqueAggregationSourceIds.has(entry.techId))?.grade;
        if (currentGrade && currentGrade !== source.grade) return true;
        if (family?.grade && family.grade !== source.grade) return true;
        this.techniqueAggregationGradeFilter = source.grade;
        this.selectedTechniqueAggregationSourceIds.add(techId);
      }
      this.techniqueAggregationResult = null;
      this.techniqueAggregationOperationId = '';
      const root = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
      if (root) this.patchTechniqueAggregationControls(root);
      return true;
    }
    if (action === 'technique-aggregation-select-all') {
      for (const source of this.getSelectableTechniqueAggregationSources()) {
        this.selectedTechniqueAggregationSourceIds.add(source.techId);
      }
      this.techniqueAggregationResult = null;
      this.techniqueAggregationOperationId = '';
      const root = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
      if (root) this.patchTechniqueAggregationControls(root);
      return true;
    }
    if (action === 'technique-aggregation-clear-selection') {
      this.selectedTechniqueAggregationSourceIds.clear();
      this.techniqueAggregationResult = null;
      this.techniqueAggregationOperationId = '';
      const root = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
      if (root) this.patchTechniqueAggregationControls(root);
      return true;
    }
    if (action === 'technique-aggregation-page-prev' || action === 'technique-aggregation-page-next') {
      this.techniqueAggregationSourcePage += action.endsWith('next') ? 1 : -1;
      this.clampTechniqueAggregationSourcePage();
      const root = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
      if (root) this.patchTechniqueAggregationDirectory(root);
      return true;
    }
    if (action === 'technique-aggregation-permission-tab') {
      const scope = target.dataset.permissionScope;
      if (scope === 'read' || scope === 'revision') {
        this.techniqueAggregationPermissionTab = scope;
        const root = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
        if (root) this.patchTechniqueAggregationPermissions(root);
      }
      return true;
    }
    if (action === 'technique-aggregation-publish') {
      this.openTechniqueAggregationPublishConfirmModal();
      return true;
    }
    if (action === 'technique-aggregation-save-permission') {
      this.updateTechniqueAggregationPermission();
      return true;
    }
    if (action === 'technique-aggregation-learn') {
      this.learnTechniqueAggregation();
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
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-technique-aggregation-name="true"]')) {
        this.techniqueAggregationNameDraft = event.target.value;
        this.techniqueAggregationResult = null;
        this.techniqueAggregationOperationId = '';
        const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
        if (panel) this.patchTechniqueAggregationControls(panel);
        return;
      }
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
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-technique-aggregation-grade-filter="true"]')) {
        const grade = TECHNIQUE_GRADE_ORDER.includes(event.target.value as TechniqueGrade)
          ? event.target.value as TechniqueGrade
          : '';
        this.techniqueAggregationGradeFilter = grade;
        this.techniqueAggregationRealmFilter = null;
        this.techniqueAggregationSourcePage = 1;
        this.selectedTechniqueAggregationSourceIds.clear();
        this.techniqueAggregationResult = null;
        this.techniqueAggregationOperationId = '';
        const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
        if (panel) {
          this.patchTechniqueAggregationDirectory(panel);
          this.patchTechniqueAggregationControls(panel);
        }
        return;
      }
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-technique-aggregation-realm-filter="true"]')) {
        const realmLv = Math.trunc(Number(event.target.value));
        this.techniqueAggregationRealmFilter = event.target.value && Number.isFinite(realmLv) && realmLv > 0
          ? realmLv
          : null;
        this.techniqueAggregationSourcePage = 1;
        const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
        if (panel) this.patchTechniqueAggregationDirectory(panel);
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-technique-aggregation-permission-unrestricted="true"]')) {
        const scope = this.techniqueAggregationPermissionTab;
        this.techniqueAggregationPermissionsDraft[scope].unrestricted = event.target.checked;
        this.techniqueAggregationPermissionDirtyScopes.add(scope);
        this.techniqueAggregationResult = null;
        const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
        if (panel) this.patchTechniqueAggregationControls(panel);
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-technique-aggregation-permission-friend]')) {
        const value = event.target.dataset.techniqueAggregationPermissionFriend;
        if (value === 'dao_friend' || value === 'close_friend') {
          const scope = this.techniqueAggregationPermissionTab;
          const policy = this.techniqueAggregationPermissionsDraft[scope];
          const values = new Set(policy.friendLevels);
          if (event.target.checked) values.add(value); else values.delete(value);
          policy.friendLevels = (['dao_friend', 'close_friend'] as const)
            .filter((entry) => values.has(entry));
          this.techniqueAggregationPermissionDirtyScopes.add(scope);
          this.techniqueAggregationResult = null;
          const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
          if (panel) this.patchTechniqueAggregationControls(panel);
        }
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.matches('[data-technique-aggregation-permission-sect-role]')) {
        const value = event.target.dataset.techniqueAggregationPermissionSectRole as SectMemberRole | undefined;
        if (value && SECT_MEMBER_ROLE_HIERARCHY.includes(value)) {
          const scope = this.techniqueAggregationPermissionTab;
          const policy = this.techniqueAggregationPermissionsDraft[scope];
          const values = new Set(policy.sectRoles);
          if (event.target.checked) values.add(value); else values.delete(value);
          policy.sectRoles = SECT_MEMBER_ROLE_HIERARCHY
            .filter((entry) => values.has(entry));
          this.techniqueAggregationPermissionDirtyScopes.add(scope);
          this.techniqueAggregationResult = null;
          const panel = body.querySelector<HTMLElement>('[data-technique-aggregation-panel="true"]');
          if (panel) this.patchTechniqueAggregationControls(panel);
        }
        return;
      }
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

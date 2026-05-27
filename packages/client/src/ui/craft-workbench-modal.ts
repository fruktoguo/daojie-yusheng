/**
 * 本文件是客户端 DOM UI 的 craft workbench modal 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import type {
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemyRecipeCategory,
  C2S_SaveAlchemyPreset,
  C2S_StartEnhancement,
  CraftQueueItemView,
  CraftQueueStartMode,
  EnhancementTargetRef,
  EquipmentSlots,
  ItemStack,
  PlayerEnhancementRecord,
  PlayerAlchemyPreset,
  PlayerState,
  S2C_AlchemyPanel,
  S2C_AttrUpdate,
  S2C_EnhancementPanel,
  S2C_TechniqueActivityTasks,
  SyncedEnhancementPanelState,
  SyncedEnhancementCandidateView,
  TechniqueActivityCancelRef,
  TechniqueActivityTaskView,
  RuntimeTechniqueActivityKind,
} from '@mud/shared';
import {
  ALCHEMY_FURNACE_OUTPUT_COUNT,
  EQUIP_SLOTS,
  MAX_ENHANCE_LEVEL,
  applyEquipmentAttributeEffectivenessToItemStack,
  buildAlchemyIngredientCountMap,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyAdjustedSuccessRate,
  computeAlchemyBatchOutputCountWithSize,
  computeEnhancementAdjustedSuccessRate,
  computeAlchemyPowerRatio,
  computeAlchemySuccessRate,
  computeAlchemyTotalJobTicks,
  getAlchemySpiritStoneCost,
  getItemDisplayName,
  isCreatedTechniqueId,
  isExactAlchemyRecipe,
  normalizeEnhanceLevel,
  normalizeAlchemyQuantity,
} from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplayPercent } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { describeEquipmentBonuses } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { t } from './i18n';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';
import { getItemAffixTypeLabel, getItemDecorClassName, getItemDisplayMeta } from './item-display';
import { CraftAlchemyView } from './craft-alchemy-view';
import type { CraftAlchemyParent } from './craft-alchemy-view';
import { resolveClientDisplayToken } from './structured-notice-display';
import { CraftEnhancementView } from './craft-enhancement-view';
import type { CraftEnhancementParent } from './craft-enhancement-view';
import { CraftQueueView } from './craft-queue-view';
import type { CraftQueueParent } from './craft-queue-view';
import { readEnhancementHistoryFromStorage } from './enhancement-history-storage';
import {
  getReactCraftWorkbenchState,
  mountReactCraftWorkbenchPanel,
  setReactCraftWorkbenchAfterContentRender,
  shouldUseReactCraftWorkbenchPanel,
  syncReactCraftWorkbenchState,
  unmountReactCraftWorkbenchPanel,
} from '../react-ui/panels/craft/mount-craft-workbench-panel';

type CraftWorkbenchCallbacks = {
  onRequestAlchemy: (knownCatalogVersion?: number) => void;
  onRequestForging: (knownCatalogVersion?: number) => void;
  onRequestEnhancement: () => void;
  onSaveAlchemyPreset: (payload: C2S_SaveAlchemyPreset) => void;
  onDeleteAlchemyPreset: (presetId: string) => void;
  onStartAlchemy: (recipeId: string, ingredients: Array<{ itemId: string; count: number }>, quantity: number, queueMode: CraftQueueStartMode) => void;
  onStartForging: (recipeId: string, ingredients: Array<{ itemId: string; count: number }>, quantity: number, queueMode: CraftQueueStartMode) => void;
  onCancelAlchemy: () => void;
  onCancelForging: () => void;
  onCancelTechniqueActivity: (cancelRef: TechniqueActivityCancelRef) => void;
  onStartEnhancement: (payload: C2S_StartEnhancement) => void;
  onCancelEnhancement: () => void;
  onStartTransmission?: (learnerPlayerId: string, techId: string) => void;
  onCancelTransmission?: (techId: string) => void;
  getTransmissionTargets?: () => Array<{ playerId: string; name: string }>;
};

type CraftMode = 'alchemy' | 'forging' | 'enhancement' | 'transmission' | null;
type AlchemyTab = 'full' | 'simple';
type AlchemyRealmTab = 'mortal' | 'qi' | 'foundation';
type EnhancementJobView = NonNullable<NonNullable<S2C_EnhancementPanel['state']>['job']>;
type EnhancementItemView = SyncedEnhancementCandidateView['item'];
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

type AlchemyViewState = {
  recipeListTop: number;
  detailTop: number;
  detailKey: string | null;
};

type ConfirmStartRequest = {
  recipeId: string;
  ingredients: AlchemyIngredientSelection[];
  mode: AlchemyTab;
};

type EnhancementViewState = {
  targetLevelValue: string | null;
  protectionStartValue: string | null;
  protectionValue: string | null;
  pickerTop: number;
  historyTop: number;
  selectedTargetKey: string | null;
};

const FORGING_INITIAL_RECIPES = [
  { outputItemId: 'equip.copper_enhancement_hammer', outputName: t('craft.workbench.initial-copper-hammer'), note: t('craft.workbench.initial-copper-hammer-note') },
  { outputItemId: 'equip.copper_pill_furnace', outputName: t('craft.workbench.initial-copper-furnace'), note: t('craft.workbench.initial-copper-furnace-note') },
  { outputItemId: 'equip.copper_forging_tool', outputName: t('craft.workbench.initial-copper-forging-tool'), note: t('craft.workbench.initial-copper-forging-tool-note') },
  { outputItemId: 'equip.copper_building_hammer', outputName: t('craft.workbench.initial-copper-building-hammer'), note: t('craft.workbench.initial-copper-building-hammer-note') },
  { outputItemId: 'formation_disk.mortal', outputName: t('craft.workbench.initial-copper-array-plate'), note: t('craft.workbench.initial-copper-array-plate-note') },
];

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

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

function formatTicks(ticks: number | undefined): string {
  if (!Number.isFinite(ticks) || Number(ticks) <= 0) {
    return t('craft.workbench.time.zero');
  }
  return t('craft.workbench.time.ticks', {
    ticks: formatDisplayInteger(Math.max(0, Math.round(Number(ticks)))),
  });
}

function formatRate(rate: number | undefined): string {
  if (!Number.isFinite(rate)) {
    return '0%';
  }
  return formatDisplayPercent(Math.max(0, Math.min(100, Number(rate) * 100)), {
    maximumFractionDigits: 1,
    compactThreshold: Number.POSITIVE_INFINITY,
  });
}

function resolveEnhancementWorkRemainingTicks(job: EnhancementJobView): number {
  return Math.max(0, Math.floor(Number(job.workRemainingTicks ?? job.remainingTicks) || 0));
}

function resolveEnhancementWorkTotalTicks(job: EnhancementJobView): number {
  return Math.max(1, Math.floor(Number(job.workTotalTicks ?? job.totalTicks) || 1));
}

function resolveEnhancementInterruptRemainingTicks(job: EnhancementJobView): number {
  return Math.max(0, Math.floor(Number(
    job.interruptWaitRemainingTicks
      ?? job.interruptState?.waitRemainingTicks
      ?? job.pausedTicks,
  ) || 0));
}

function resolveEnhancementInterruptTotalTicks(job: EnhancementJobView, remaining: number): number {
  return Math.max(remaining, Math.floor(Number(job.interruptState?.waitTotalTicks ?? 10) || 10));
}

function resolveAlchemyWorkTotalTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>): number {
  return Math.max(0, Math.floor(Number(job.workTotalTicks ?? job.totalTicks) || 0));
}

function resolveAlchemyWorkRemainingTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>): number {
  return Math.max(0, Math.floor(Number(job.workRemainingTicks ?? job.remainingTicks) || 0));
}

function resolveAlchemyInterruptRemainingTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>): number {
  return Math.max(0, Math.floor(Number(
    job.interruptWaitRemainingTicks
      ?? job.interruptState?.waitRemainingTicks
      ?? job.pausedTicks
      ?? 0,
  ) || 0));
}

function resolveAlchemyInterruptTotalTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>, remaining: number): number {
  return Math.max(remaining, Math.floor(Number(job.interruptState?.waitTotalTicks ?? 10) || 10));
}

function formatEnhancementPercent(rate: number | undefined): string {
  const normalized = typeof rate === 'number' && Number.isFinite(rate) ? rate : 0;
  return formatDisplayPercent(normalized * 100, {
    maximumFractionDigits: 1,
    compactThreshold: Number.POSITIVE_INFINITY,
  });
}

function getAlchemyPhaseLabel(phase: 'brewing' | 'paused'): string {
  if (phase === 'paused') {
    return t('craft.workbench.alchemy.phase.paused');
  }
  return t('craft.workbench.alchemy.phase.brewing');
}

function buildEnhancementTargetKey(ref: EnhancementTargetRef): string {
  return ref.source === 'equipment'
    ? `equipment:${ref.slot ?? ''}`
    : `inventory:${normalizeInventoryItemInstanceId(ref.itemInstanceId)}`;
}

function normalizeInventoryItemInstanceId(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
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

function getEnhancementDisplayName(item: EnhancementItemView): string {
  return getItemDisplayName({
    ...buildBaseEnhancementPreviewItem(item),
    enhanceLevel: item.enhanceLevel,
  });
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
const UNKNOWN_ITEM_NAME = '未知物品';

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
  if (status === 'completed') {
    return t('craft.workbench.enhancement.record.status.completed');
  }
  if (status === 'cancelled') {
    return t('craft.workbench.enhancement.record.status.cancelled');
  }
  if (status === 'stopped') {
    return t('craft.workbench.enhancement.record.status.stopped');
  }
  if (status === 'in_progress') {
    return t('craft.workbench.enhancement.record.status.in-progress');
  }
  return t('craft.workbench.enhancement.record.status.archived');
}

function cloneAlchemyIngredients(
  ingredients: readonly AlchemyIngredientSelection[],
): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

function getAlchemyRealmTab(level: number): AlchemyRealmTab {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (normalizedLevel >= 31) {
    return 'foundation';
  }
  if (normalizedLevel >= 19) {
    return 'qi';
  }
  return 'mortal';
}

function normalizeAlchemyRealm(value: string | undefined): AlchemyRealmTab {
  if (value === 'qi' || value === 'foundation') {
    return value;
  }
  return 'mortal';
}

function normalizeAlchemyCategory(value: string | undefined): AlchemyRecipeCategory {
  if (value === 'buff' || value === 'special') {
    return value;
  }
  return 'recovery';
}

function normalizeTechniqueActivityKind(value: string | undefined): RuntimeTechniqueActivityKind {
  if (
    value === 'forging'
    || value === 'enhancement'
    || value === 'gather'
    || value === 'building'
    || value === 'mining'
    || value === 'formation'
  ) {
    return value;
  }
  return 'alchemy';
}

export class CraftWorkbenchModal {
  private static readonly MODAL_OWNER = 'craft-workbench-modal';
  private static readonly ALCHEMY_CONFIRM_OWNER = 'craft-workbench-modal:alchemy-confirm';

  private callbacks: CraftWorkbenchCallbacks | null = null;
  private transmissionCallbacks: Pick<CraftWorkbenchCallbacks, 'onStartTransmission' | 'onCancelTransmission' | 'getTransmissionTargets'> | null = null;
  private activeMode: CraftMode = null;
  private loading = false;

  private alchemyPanel: S2C_AlchemyPanel | null = null;
  private enhancementPanel: S2C_EnhancementPanel | null = null;
  private techniqueActivityTasksSynced = false;
  private techniqueActivityTasks: TechniqueActivityTaskView[] = [];
  private alchemyCatalogVersion = 0;
  private alchemyCatalog: AlchemyRecipeCatalogEntry[] = [];
  private alchemySkillLevel = 1;
  private forgingSkillLevel = 1;
  private gatherSkillLevel = 1;
  private enhancementSkillLevel = 1;
  private transmissionSkillLevel = 1;
  private transmissionSkillExp = 0;
  private transmissionSkillExpToNext = 60;
  private transmissionTechniques: PlayerState['techniques'] = [];
  private pendingTechniqueComprehensions: PlayerState['pendingTechniqueComprehensions'] = [];
  private playerRealmLv: number | null = null;
  private inventory: PlayerState['inventory'] = { items: [], capacity: 0 };
  private equipment: EquipmentSlots = { weapon: null, head: null, body: null, legs: null, accessory: null };
  private activeAlchemyCategory: AlchemyRecipeCategory = 'recovery';
  private activeAlchemyRealm: AlchemyRealmTab = 'mortal';
  private activeAlchemyTab: AlchemyTab = 'full';
  private selectedAlchemyRecipeId: string | null = null;
  private selectedAlchemyPresetId: string | null = null;
  private draftByRecipeId = new Map<string, Map<string, number>>();
  private quantityByRecipeId = new Map<string, number>();
  private confirmStartRequest: ConfirmStartRequest | null = null;
  private confirmQuantityDraft = '1';
  private confirmEventsBound = false;
  private selectedEnhancementTargetKey: string | null = null;
  private selectedEnhancementTargetLevel: number | null = null;
  private selectedEnhancementProtectionKey: string | null = null;
  private selectedEnhancementProtectionStartLevel: number | null = null;
  private enhancementResponseError: string | null = null;
  private localEnhancementHistoryLoaded = false;
  private localEnhancementHistoryRecords = new Map<string, PlayerEnhancementRecord>();
  private localEnhancementHistorySessions: PlayerEnhancementRecord[] = [];
  private lastServerEnhancementSessionRecord: PlayerEnhancementRecord | null = null;
  private activeEnhancementHistoryItemId: string | null = null;
  private activeEnhancementHistorySessionKey: string | null = null;
  private enhancementHistoryExpanded = false;
  private enhancementProtectionExpanded = false;
  private lastEnhancementRenderKey: string | null = null;
  private lastEnhancementCandidateSourceKey: string | null = null;
  private readonly enhancementFormulaTooltip = new FloatingTooltip();

  /** @internal Sub-view delegates */
  readonly alchemyView = new CraftAlchemyView(this as unknown as CraftAlchemyParent);
  readonly enhancementView = new CraftEnhancementView(this as unknown as CraftEnhancementParent);
  readonly queueView = new CraftQueueView(this as unknown as CraftQueueParent);

  setCallbacks(callbacks: CraftWorkbenchCallbacks): void {
    this.callbacks = callbacks;
  }

  setTransmissionCallbacks(callbacks: Pick<CraftWorkbenchCallbacks, 'onStartTransmission' | 'onCancelTransmission' | 'getTransmissionTargets'>): void {
    this.transmissionCallbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
    this.alchemySkillLevel = Math.max(1, Math.floor(player.alchemySkill?.level ?? 1));
    this.forgingSkillLevel = Math.max(1, Math.floor(player.forgingSkill?.level ?? 1));
    this.gatherSkillLevel = Math.max(1, Math.floor(player.gatherSkill?.level ?? 1));
    this.enhancementSkillLevel = Math.max(1, Math.floor(player.enhancementSkill?.level ?? player.enhancementSkillLevel ?? 1));
    this.transmissionSkillLevel = Math.max(1, Math.floor(player.transmissionSkill?.level ?? 1));
    this.transmissionSkillExp = Math.max(0, Math.floor(player.transmissionSkill?.exp ?? 0));
    this.transmissionSkillExpToNext = Math.max(0, Math.floor(player.transmissionSkill?.expToNext ?? 60));
    this.transmissionTechniques = Array.isArray(player.techniques) ? player.techniques : [];
    this.pendingTechniqueComprehensions = Array.isArray(player.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    this.playerRealmLv = Number.isFinite(Number(player.realm?.realmLv ?? player.realmLv))
      ? Math.max(1, Math.floor(Number(player.realm?.realmLv ?? player.realmLv)))
      : null;
  }

  syncAttrUpdate(update: S2C_AttrUpdate): void {
    if (update.alchemySkill) {
      this.alchemySkillLevel = Math.max(1, Math.floor(update.alchemySkill.level ?? this.alchemySkillLevel));
    }
    if (update.forgingSkill) {
      this.forgingSkillLevel = Math.max(1, Math.floor(update.forgingSkill.level ?? this.forgingSkillLevel));
    }
    if (update.gatherSkill) {
      this.gatherSkillLevel = Math.max(1, Math.floor(update.gatherSkill.level ?? this.gatherSkillLevel));
    }
    if (update.enhancementSkill) {
      this.enhancementSkillLevel = Math.max(1, Math.floor(update.enhancementSkill.level ?? this.enhancementSkillLevel));
    }
    if (update.transmissionSkill) {
      this.transmissionSkillLevel = Math.max(1, Math.floor(update.transmissionSkill.level ?? this.transmissionSkillLevel));
      this.transmissionSkillExp = Math.max(0, Math.floor(update.transmissionSkill.exp ?? this.transmissionSkillExp));
      this.transmissionSkillExpToNext = Math.max(0, Math.floor(update.transmissionSkill.expToNext ?? this.transmissionSkillExpToNext));
    }
    if (detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.patchOpenCraftShell();
    }
  }

  syncPlayerContext(player?: PlayerState): void {
    const nextRealmLv = Number.isFinite(Number(player?.realm?.realmLv ?? player?.realmLv))
      ? Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? player?.realmLv)))
      : null;
    this.transmissionTechniques = Array.isArray(player?.techniques) ? player.techniques : [];
    this.pendingTechniqueComprehensions = Array.isArray(player?.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    if (player?.transmissionSkill) {
      this.transmissionSkillLevel = Math.max(1, Math.floor(player.transmissionSkill.level ?? this.transmissionSkillLevel));
      this.transmissionSkillExp = Math.max(0, Math.floor(player.transmissionSkill.exp ?? this.transmissionSkillExp));
      this.transmissionSkillExpToNext = Math.max(0, Math.floor(player.transmissionSkill.expToNext ?? this.transmissionSkillExpToNext));
    }
    const realmChanged = this.playerRealmLv !== nextRealmLv;
    this.playerRealmLv = nextRealmLv;
    if ((realmChanged || this.activeMode === 'transmission') && detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.patchOpenCraftShell();
    }
  }

  syncInventory(inventory?: PlayerState['inventory']): void {
    const previousCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
    if (inventory) {
      this.inventory = inventory;
    }
    this.requestCurrentPanelForExternalStateSync(previousCandidateSourceKey);
    this.syncAlchemyConfirmModal();
  }

  syncEquipment(equipment?: EquipmentSlots): void {
    const previousCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
    if (equipment) {
      this.equipment = equipment;
    }
    this.requestCurrentPanelForExternalStateSync(previousCandidateSourceKey);
    this.syncAlchemyConfirmModal();
  }

  openAlchemy(): void {
    this.activeMode = 'alchemy';
    this.loading = true;
    this.alchemyCatalogVersion = 0;
    this.selectedAlchemyPresetId = null;
    this.confirmStartRequest = null;
    this.render();
    this.callbacks?.onRequestAlchemy(this.alchemyCatalogVersion || undefined);
  }

  openForging(): void {
    this.activeMode = 'forging';
    this.loading = true;
    this.alchemyCatalogVersion = 0;
    this.activeAlchemyCategory = 'special';
    this.activeAlchemyTab = 'full';
    this.selectedAlchemyPresetId = null;
    this.confirmStartRequest = null;
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
    this.render();
    this.callbacks?.onRequestForging(this.alchemyCatalogVersion || undefined);
  }

  openEnhancement(): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.activeMode = 'enhancement';
    this.loading = true;
    this.enhancementResponseError = null;
    this.enhancementHistoryExpanded = false;
    this.enhancementProtectionExpanded = false;
    this.lastEnhancementRenderKey = null;
    this.lastEnhancementCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
    this.render();
    this.callbacks?.onRequestEnhancement();
  }

  openTransmission(): void {
    this.activeMode = 'transmission';
    this.loading = false;
    this.render();
  }

  updateAlchemy(data: S2C_AlchemyPanel): void {
    if (data.kind === 'forging') {
      this.updateForging(data);
      return;
    }
    if (this.activeMode === 'forging') {
      return;
    }
    const isPatch = Boolean(data.statePatch);
    this.alchemyPanel = this.mergeAlchemyPanel(data, 'alchemy');
    this.alchemyCatalogVersion = Math.max(0, Math.floor(data.catalogVersion ?? this.alchemyCatalogVersion));
    if (Array.isArray(data.catalog)) {
      this.alchemyCatalog = data.catalog.map((entry) => ({
        ...entry,
        ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
      }));
    }
    this.ensureAlchemySelection();
    this.ensureAlchemyDraft();
    if (this.activeMode === 'alchemy') {
      this.loading = false;
      if (isPatch) {
        this.patchOpenCraftShell();
      } else {
        this.render();
      }
    }
    this.syncAlchemyConfirmModal();
  }

  updateForging(data: S2C_AlchemyPanel): void {
    if (this.activeMode !== 'forging') {
      return;
    }
    const isPatch = Boolean(data.statePatch);
    this.alchemyPanel = this.mergeAlchemyPanel(data, 'forging');
    this.alchemyCatalogVersion = Math.max(0, Math.floor(data.catalogVersion ?? this.alchemyCatalogVersion));
    if (Array.isArray(data.catalog)) {
      this.alchemyCatalog = data.catalog.map((entry) => ({
        ...entry,
        category: 'special',
        ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
      }));
    }
    this.activeAlchemyCategory = 'special';
    this.ensureAlchemySelection();
    this.ensureAlchemyDraft();
    if (this.activeMode === 'forging') {
      this.loading = false;
      if (isPatch) {
        this.patchOpenCraftShell();
      } else {
        this.render();
      }
    }
    this.syncAlchemyConfirmModal();
  }

  private mergeAlchemyPanel(data: S2C_AlchemyPanel, fallbackKind: 'alchemy' | 'forging'): S2C_AlchemyPanel {
    const patch = data.statePatch;
    if (!patch) {
      return data;
    }
    const baseState = data.state ?? this.alchemyPanel?.state ?? {
      presets: [],
      job: null,
      queue: [],
    };
    return {
      ...this.alchemyPanel,
      ...data,
      kind: data.kind ?? fallbackKind,
      state: {
        ...baseState,
        job: Object.prototype.hasOwnProperty.call(patch, 'job') ? (patch.job ?? null) : baseState.job,
        queue: patch.queue ?? baseState.queue,
      },
      catalogVersion: Math.max(0, Math.floor(data.catalogVersion ?? this.alchemyCatalogVersion)),
      statePatch: undefined,
    };
  }

  updateEnhancement(data: S2C_EnhancementPanel): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.enhancementResponseError = data.error ?? null;
    const hasRecordSnapshot = Array.isArray(data.state?.records) || Array.isArray(data.statePatch?.records);
    if (hasRecordSnapshot) {
      this.mergeServerEnhancementSessionRecord(data.state?.records ?? data.statePatch?.records ?? []);
    }
    this.enhancementPanel = this.mergeEnhancementPanel(data);
    this.lastEnhancementCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
    if (typeof this.enhancementPanel.state?.enhancementSkillLevel === 'number') {
      this.enhancementSkillLevel = Math.max(1, Math.floor(this.enhancementPanel.state.enhancementSkillLevel));
    }
    this.ensureEnhancementSelection();
    this.refreshOpenEnhancementHistoryModal();
    if (this.activeMode === 'enhancement') {
      this.loading = false;
      if (data.statePatch || this.shouldPatchEnhancementPanelRefresh()) {
        this.patchOpenCraftShell();
      } else {
        this.render();
      }
    }
  }

  updateTechniqueActivityTasks(data: S2C_TechniqueActivityTasks): void {
    this.techniqueActivityTasksSynced = true;
    this.techniqueActivityTasks = Array.isArray(data.tasks)
      ? data.tasks.map((task) => ({
        ...task,
        cancelRef: { ...task.cancelRef },
      }))
      : [];
    if (detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.patchOpenCraftQueueOnly();
    }
  }

  private mergeEnhancementPanel(data: S2C_EnhancementPanel): S2C_EnhancementPanel {
    const patch = data.statePatch;
    if (!patch) {
      return data;
    }
    const baseState = data.state ?? this.enhancementPanel?.state ?? {
      enhancementSkillLevel: this.enhancementSkillLevel,
      candidates: [],
      records: [],
      job: null,
      queue: [],
    };
    return {
      ...this.enhancementPanel,
      ...data,
      state: {
        ...baseState,
        enhancementSkillLevel: typeof patch.enhancementSkillLevel === 'number'
          ? Math.max(1, Math.floor(patch.enhancementSkillLevel))
          : baseState.enhancementSkillLevel,
        job: Object.prototype.hasOwnProperty.call(patch, 'job') ? (patch.job ?? null) : baseState.job,
        queue: patch.queue ?? baseState.queue,
        records: Array.isArray(patch.records)
          ? this.mergeEnhancementRecordPatch(baseState.records, patch.records)
          : baseState.records,
      },
      statePatch: undefined,
    };
  }

  private mergeEnhancementRecordPatch(
    baseRecords: PlayerEnhancementRecord[],
    patchRecords: PlayerEnhancementRecord[],
  ): PlayerEnhancementRecord[] {
    const recordsByItemId = new Map<string, PlayerEnhancementRecord>(
      normalizeEnhancementRecordList(baseRecords).map((record) => [record.itemId, record] as const),
    );
    for (const record of normalizeEnhancementRecordList(patchRecords)) {
      recordsByItemId.set(record.itemId, record);
    }
    return [...recordsByItemId.values()];
  }

  clear(): void {
    this.activeMode = null;
    this.loading = false;
    this.alchemyPanel = null;
    this.enhancementPanel = null;
    this.techniqueActivityTasksSynced = false;
    this.techniqueActivityTasks = [];
    this.alchemyCatalog = [];
    this.alchemyCatalogVersion = 0;
    this.selectedAlchemyRecipeId = null;
    this.selectedAlchemyPresetId = null;
    this.draftByRecipeId.clear();
    this.quantityByRecipeId.clear();
    this.confirmStartRequest = null;
    this.confirmQuantityDraft = '1';
    this.selectedEnhancementTargetKey = null;
    this.selectedEnhancementTargetLevel = null;
    this.selectedEnhancementProtectionKey = null;
    this.selectedEnhancementProtectionStartLevel = null;
    this.enhancementResponseError = null;
    this.activeEnhancementHistoryItemId = null;
    this.activeEnhancementHistorySessionKey = null;
    this.enhancementHistoryExpanded = false;
    this.enhancementProtectionExpanded = false;
    this.lastEnhancementRenderKey = null;
    this.lastEnhancementCandidateSourceKey = null;
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
    confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-picker`);
    confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-list`);
    confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-session`);
    confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-detail`);
    this.enhancementFormulaTooltip.hide(true);
    unmountReactCraftWorkbenchPanel();
    detailModalHost.close(CraftWorkbenchModal.MODAL_OWNER);
  }

  private requestCurrentPanel(): void {
    if (!detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      return;
    }
    if (this.activeMode === 'alchemy') {
      this.callbacks?.onRequestAlchemy(this.alchemyCatalogVersion || undefined);
    } else if (this.activeMode === 'forging') {
      this.callbacks?.onRequestForging(this.alchemyCatalogVersion || undefined);
    } else if (this.activeMode === 'enhancement') {
      this.callbacks?.onRequestEnhancement();
    }
  }

  private requestCurrentPanelForExternalStateSync(previousEnhancementCandidateSourceKey: string | null): void {
    if (this.activeMode === 'enhancement' && this.enhancementPanel?.state) {
      const nextCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
      if (
        previousEnhancementCandidateSourceKey !== null
        && previousEnhancementCandidateSourceKey !== nextCandidateSourceKey
        && this.lastEnhancementCandidateSourceKey !== nextCandidateSourceKey
      ) {
        this.lastEnhancementCandidateSourceKey = nextCandidateSourceKey;
        this.callbacks?.onRequestEnhancement();
        return;
      }
      if (detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
        this.patchOpenCraftShell();
      }
      return;
    }
    this.requestCurrentPanel();
  }

  private buildEnhancementCandidateSourceKey(): string {
    const inventoryKey = this.inventory.items
      .map((item) => this.buildEnhancementCandidateItemSourceKey(`inventory:${normalizeInventoryItemInstanceId(item.itemInstanceId)}`, item))
      .filter(Boolean)
      .join('|');
    const equipmentKey = EQUIP_SLOTS
      .map((slot) => this.buildEnhancementCandidateItemSourceKey(`equipment:${slot}`, this.equipment[slot]))
      .filter(Boolean)
      .join('|');
    return `${inventoryKey}::${equipmentKey}`;
  }

  private buildEnhancementCandidateItemSourceKey(sourceKey: string, item: ItemStack | null | undefined): string {
    if (!item || item.type !== 'equipment') {
      return '';
    }
    return [
      sourceKey,
      item.itemId,
      Math.max(1, Math.floor(Number(item.count) || 1)),
      normalizeEnhanceLevel(item.enhanceLevel),
      Number(item.level) || 1,
      item.equipSlot ?? '',
    ].join('/');
  }

  private ensureAlchemySelection(): void {
    if (this.alchemyPanel?.state?.job) {
      this.selectedAlchemyRecipeId = this.alchemyPanel.state.job.recipeId;
      const jobRecipe = this.alchemyCatalog.find((entry) => entry.recipeId === this.alchemyPanel?.state?.job?.recipeId);
      if (jobRecipe) {
        this.activeAlchemyCategory = jobRecipe.category;
        this.activeAlchemyRealm = getAlchemyRealmTab(jobRecipe.outputLevel);
      }
      return;
    }
    const visibleRecipes = this.getVisibleAlchemyRecipes();
    const visibleRecipeIds = new Set(visibleRecipes.map((entry) => entry.recipeId));
    if (this.selectedAlchemyRecipeId && visibleRecipeIds.has(this.selectedAlchemyRecipeId)) {
      return;
    }
    const nextRecipe = visibleRecipes[0] ?? this.alchemyCatalog[0] ?? null;
    this.selectedAlchemyRecipeId = nextRecipe?.recipeId ?? null;
    this.selectedAlchemyPresetId = null;
    this.activeAlchemyCategory = nextRecipe?.category ?? 'recovery';
    this.activeAlchemyRealm = nextRecipe ? getAlchemyRealmTab(nextRecipe.outputLevel) : 'mortal';
  }

  private ensureAlchemyDraft(): void {
    const recipeId = this.selectedAlchemyRecipeId;
    if (!recipeId || this.draftByRecipeId.has(recipeId)) {
      return;
    }
    const presets = this.getAlchemyRecipePresets(recipeId);
    const activePreset = this.selectedAlchemyPresetId
      ? presets.find((preset) => preset.presetId === this.selectedAlchemyPresetId) ?? null
      : null;
    this.setAlchemyDraft(recipeId, activePreset?.ingredients ?? this.getFullAlchemyIngredients(recipeId));
  }

  private ensureEnhancementSelection(): void {
    const candidates = this.enhancementPanel?.state?.candidates ?? [];
    if (this.enhancementPanel?.state?.job) {
      this.selectedEnhancementTargetKey = buildEnhancementTargetKey(this.enhancementPanel.state.job.target);
      this.selectedEnhancementTargetLevel = null;
      return;
    }
    if (candidates.length === 0) {
      this.selectedEnhancementTargetKey = null;
      this.selectedEnhancementTargetLevel = null;
      this.selectedEnhancementProtectionKey = null;
      this.selectedEnhancementProtectionStartLevel = null;
      return;
    }
    if (this.selectedEnhancementTargetKey && !candidates.some((entry) => buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementTargetKey)) {
      this.selectedEnhancementTargetKey = null;
      this.selectedEnhancementTargetLevel = null;
    }
    if (!this.selectedEnhancementTargetKey) {
      this.selectedEnhancementTargetKey = buildEnhancementTargetKey(candidates[0]!.ref);
    }
    const selected = this.getSelectedEnhancementCandidate();
    if (selected) {
      const minLevel = selected.currentLevel + 1;
      if (!this.selectedEnhancementTargetLevel || this.selectedEnhancementTargetLevel < minLevel) {
        this.selectedEnhancementTargetLevel = minLevel;
      }
      if (this.selectedEnhancementProtectionKey) {
        const maxLevel = this.getSelectedEnhancementTargetLevel(selected) ?? minLevel;
        this.selectedEnhancementProtectionStartLevel = Math.max(
          2,
          Math.min(maxLevel, Math.floor(Number(this.selectedEnhancementProtectionStartLevel) || 2)),
        );
      } else {
        this.selectedEnhancementProtectionStartLevel = null;
      }
    }
    if (
      this.selectedEnhancementProtectionKey
      && !selected?.protectionCandidates.some((entry) => buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementProtectionKey)
    ) {
      this.selectedEnhancementProtectionKey = null;
      this.selectedEnhancementProtectionStartLevel = null;
    }
  }

  private render(): void {
    const definition = this.getCurrentModalDefinition();
    if (!definition) {
      return;
    }
    if (this.activeMode === 'enhancement') {
      this.lastEnhancementRenderKey = this.buildEnhancementPanelRenderKey();
    }
    if (this.useReactPanel()) {
      this.renderReact(definition);
      return;
    }
    const body = detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (body instanceof HTMLElement && this.tryPatchModal(body, definition)) {
      return;
    }
    detailModalHost.open({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      variantClass: definition.variantClass,
      title: definition.title,
      subtitle: definition.subtitle,
      hint: t('craft.workbench.modal.close-hint'),
      renderBody: (body) => {
        replaceElementHtml(body, definition.body);
      },
      onAfterRender: (body, signal) => {
        bindInlineItemTooltips(body, signal);
        this.bindActions(body, signal);
        if (this.activeMode === 'alchemy') {
          this.syncAlchemyConfirmModal();
        }
      },
      onClose: () => {
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-picker`);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-list`);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-session`);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-detail`);
        this.enhancementFormulaTooltip.hide(true);
        this.activeMode = null;
        this.loading = false;
      },
    });
  }

  private useReactPanel(): boolean {
    return shouldUseReactCraftWorkbenchPanel();
  }

  private renderReact(definition: { title: string; subtitle: string; variantClass: string; body: string }): void {
    const body = detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (body instanceof HTMLElement && this.tryPatchReactModal(body, definition, true)) {
      return;
    }
    detailModalHost.open({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      variantClass: definition.variantClass,
      title: definition.title,
      subtitle: definition.subtitle,
      hint: t('craft.workbench.modal.close-hint'),
      renderBody: (body) => {
        this.syncReactShell(definition, true);
        mountReactCraftWorkbenchPanel(body);
      },
      onAfterRender: (body, signal) => {
        this.bindReactCraftBody(body, signal);
      },
      onClose: () => {
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-picker`);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-list`);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-session`);
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-detail`);
        this.enhancementFormulaTooltip.hide(true);
        unmountReactCraftWorkbenchPanel();
        this.activeMode = null;
        this.loading = false;
      },
    });
  }

  private tryPatchReactModal(
    body: HTMLElement,
    definition: { title: string; subtitle: string; variantClass: string; body: string },
    includeContent: boolean,
  ): boolean {
    const reactHost = body.querySelector<HTMLElement>('[data-react-panel="craft"]');
    if (includeContent && !reactHost) {
      return detailModalHost.patch({
        ownerId: CraftWorkbenchModal.MODAL_OWNER,
        variantClass: definition.variantClass,
        title: definition.title,
        subtitle: definition.subtitle,
        hint: t('craft.workbench.modal.close-hint'),
        renderBody: (nextBody) => {
          this.syncReactShell(definition, true);
          mountReactCraftWorkbenchPanel(nextBody);
        },
        onAfterRender: (nextBody, signal) => {
          this.bindReactCraftBody(nextBody, signal);
        },
      });
    }
    if (!detailModalHost.patch({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      variantClass: definition.variantClass,
      title: definition.title,
      subtitle: definition.subtitle,
      hint: t('craft.workbench.modal.close-hint'),
    })) {
      return false;
    }
    if (includeContent) {
      this.syncReactShell(definition, true);
    }
    return true;
  }

  private syncReactShell(
    _definition: { title: string; subtitle: string; variantClass: string; body: string },
    includeContent: boolean,
  ): void {
    const current = getReactCraftWorkbenchState();
    const nextTabsKey = this.buildCraftTabsKey();
    const nextHeaderKey = this.buildCraftHeaderKey();
    syncReactCraftWorkbenchState({
      activeMode: this.activeMode,
      tabsKey: nextTabsKey,
      ...(current.tabsKey !== nextTabsKey ? { tabsHtml: this.renderCraftModeTabs() } : {}),
      headerKey: nextHeaderKey,
      ...(current.headerKey !== nextHeaderKey ? { headerHtml: this.renderCraftHeader() } : {}),
      ...(includeContent
        ? {
          contentKey: this.buildCraftContentKey(),
          contentHtml: this.renderCraftActiveBody(),
        }
        : {}),
    });
  }

  private buildCraftContentKey(): string {
    return [
      this.activeMode ?? 'none',
      this.loading ? 'loading' : 'ready',
      this.activeAlchemyCategory,
      this.activeAlchemyRealm,
      this.activeAlchemyTab,
      this.selectedAlchemyRecipeId ?? '',
      this.selectedAlchemyPresetId ?? '',
      this.selectedEnhancementTargetKey ?? '',
      this.selectedEnhancementTargetLevel ?? '',
      this.selectedEnhancementProtectionKey ?? '',
      this.selectedEnhancementProtectionStartLevel ?? '',
      this.enhancementHistoryExpanded ? 'history' : '',
      this.enhancementProtectionExpanded ? 'protect' : '',
      this.activeMode === 'transmission' ? this.buildTransmissionRenderKey() : '',
    ].join(':');
  }

  private shouldPatchEnhancementPanelRefresh(): boolean {
    if (this.activeMode !== 'enhancement') {
      return false;
    }
    const nextKey = this.buildEnhancementPanelRenderKey();
    const previousKey = this.lastEnhancementRenderKey;
    this.lastEnhancementRenderKey = nextKey;
    return previousKey !== null && previousKey === nextKey;
  }

  private buildEnhancementPanelRenderKey(): string {
    const state = this.enhancementPanel?.state ?? null;
    const job = state?.job ?? null;
    const candidateKeys = new Set(
      (state?.candidates ?? []).map((entry) => buildEnhancementTargetKey(entry.ref)),
    );
    return [
      this.loading ? 'loading' : 'ready',
      this.enhancementResponseError ?? '',
      job ? this.getEnhancementJobPatchKey(job) : 'idle',
      [...candidateKeys].sort().join('|'),
      this.selectedEnhancementTargetKey ?? '',
      this.selectedEnhancementTargetLevel ?? '',
      this.selectedEnhancementProtectionKey ?? '',
      this.selectedEnhancementProtectionStartLevel ?? '',
      this.enhancementHistoryExpanded ? 'history-open' : 'history-closed',
      this.enhancementProtectionExpanded ? 'protection-open' : 'protection-closed',
    ].join('::');
  }

  private bindReactCraftBody(body: HTMLElement, signal: AbortSignal): void {
    setReactCraftWorkbenchAfterContentRender(() => {
      if (this.activeMode === 'enhancement') {
        this.bindEnhancementEvents(body, signal);
      }
      if (this.activeMode === 'alchemy') {
        this.syncAlchemyConfirmModal();
      }
    });
    if (body.dataset.reactCraftRootBound !== '1') {
      body.dataset.reactCraftRootBound = '1';
      signal.addEventListener('abort', () => {
        delete body.dataset.reactCraftRootBound;
      }, { once: true });
      bindInlineItemTooltips(body, signal);
      this.bindActions(body, signal);
    } else if (this.activeMode === 'enhancement') {
      this.bindEnhancementEvents(body, signal);
    }
    if (this.activeMode === 'alchemy') {
      this.syncAlchemyConfirmModal();
    }
  }

  private tryPatchModal(
    body: HTMLElement,
    definition: { title: string; subtitle: string; variantClass: string; body: string },
  ): boolean {
    if (this.useReactPanel()) {
      return this.tryPatchReactModal(body, definition, true);
    }
    if (!detailModalHost.patch({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      variantClass: definition.variantClass,
      title: definition.title,
      subtitle: definition.subtitle,
      hint: t('craft.workbench.modal.close-hint'),
    })) {
      return false;
    }
    this.patchCraftShellHeaderAndTabs(body);
    if ((this.activeMode === 'alchemy' || this.activeMode === 'forging') && this.tryPatchAlchemyBody(body)) {
      return true;
    }
    if (this.activeMode === 'enhancement' && this.tryPatchEnhancementBody(body)) {
      return true;
    }
    detailModalHost.patch({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      renderBody: (nextBody) => {
        replaceElementHtml(nextBody, definition.body);
      },
      onAfterRender: (nextBody, signal) => {
        bindInlineItemTooltips(nextBody, signal);
        this.bindActions(nextBody, signal);
        if (this.activeMode === 'alchemy') {
          this.syncAlchemyConfirmModal();
        }
      },
    });
    return true;
  }

  private patchOpenCraftShell(): void {
    if (!detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      return;
    }
    const definition = this.getCurrentModalDefinition();
    const body = document.getElementById('detail-modal-body');
    if (!definition || !(body instanceof HTMLElement)) {
      return;
    }
    if (this.useReactPanel()) {
      if (!detailModalHost.patch({
        ownerId: CraftWorkbenchModal.MODAL_OWNER,
        variantClass: definition.variantClass,
        title: definition.title,
        subtitle: definition.subtitle,
        hint: t('craft.workbench.modal.close-hint'),
      })) {
        return;
      }
      this.syncReactShell(definition, this.activeMode === 'transmission');
      mountReactCraftWorkbenchPanel(body);
      this.patchCraftShellHeaderAndTabs(body);
      if ((this.activeMode === 'alchemy' || this.activeMode === 'forging') && this.tryPatchAlchemyBody(body)) {
        return;
      }
      if (this.activeMode === 'enhancement') {
        this.tryPatchEnhancementBody(body);
      }
      return;
    }
    if (!detailModalHost.patch({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      variantClass: definition.variantClass,
      title: definition.title,
      subtitle: definition.subtitle,
      hint: t('craft.workbench.modal.close-hint'),
    })) {
      return;
    }
    this.patchCraftShellHeaderAndTabs(body);
    if ((this.activeMode === 'alchemy' || this.activeMode === 'forging') && this.tryPatchAlchemyBody(body)) {
      return;
    }
    if (this.activeMode === 'enhancement') {
      this.tryPatchEnhancementBody(body);
      return;
    }
    if (this.activeMode === 'transmission') {
      const content = body.querySelector<HTMLElement>('[data-craft-workbench-content="true"]');
      if (content) {
        replaceElementHtml(content, this.renderTransmissionBody());
      }
    }
  }

  private patchOpenCraftQueueOnly(): void {
    if (!detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return;
    }
    if (this.useReactPanel()) {
      const current = getReactCraftWorkbenchState();
      const nextHeaderKey = this.buildCraftHeaderKey();
      if (current.headerKey !== nextHeaderKey) {
        syncReactCraftWorkbenchState({
          headerKey: nextHeaderKey,
          headerHtml: this.renderCraftHeader(),
        });
      }
      mountReactCraftWorkbenchPanel(body);
    }
    if (!this.patchCraftQueuePanel(body)) {
      this.patchOpenCraftShell();
    }
  }

  private patchCraftShellHeaderAndTabs(body: HTMLElement): void {
    const craftHeader = body.querySelector<HTMLElement>('[data-craft-workbench-header="true"]');
    const craftTabs = body.querySelector<HTMLElement>('[data-craft-workbench-tabs="true"]');
    if (craftHeader) {
      const headerKey = this.buildCraftHeaderKey();
      if (craftHeader.dataset.craftHeaderKey !== headerKey) {
        replaceElementHtml(craftHeader, this.renderCraftHeader());
        craftHeader.dataset.craftHeaderKey = headerKey;
      }
      this.patchCraftQueuePanel(craftHeader);
    }
    if (craftTabs) {
      const tabsKey = this.buildCraftTabsKey();
      if (craftTabs.dataset.craftTabsKey !== tabsKey) {
        replaceElementHtml(craftTabs, this.renderCraftModeTabs());
        craftTabs.dataset.craftTabsKey = tabsKey;
      }
    }
  }

  private getCurrentModalDefinition(): { title: string; subtitle: string; variantClass: string; body: string } | null {
    if (this.activeMode === 'alchemy') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-alchemy',
        body: this.renderCraftBody(),
      };
    }
    if (this.activeMode === 'forging') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-forging',
        body: this.renderCraftBody(),
      };
    }
    if (this.activeMode === 'enhancement') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-enhancement',
        body: this.renderCraftBody(),
      };
    }
    if (this.activeMode === 'transmission') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-transmission',
        body: this.renderCraftBody(),
      };
    }
    return null;
  }

  private getCraftSubtitle(): string {
    if (this.activeMode === 'alchemy') {
      return t('craft.workbench.modal.subtitle.alchemy', { level: formatDisplayInteger(this.alchemySkillLevel) });
    }
    if (this.activeMode === 'forging') {
      return t('craft.workbench.modal.subtitle.forging', { level: formatDisplayInteger(this.forgingSkillLevel) });
    }
    if (this.activeMode === 'enhancement') {
      return t('craft.workbench.modal.subtitle.enhancement', { level: formatDisplayInteger(this.enhancementSkillLevel) });
    }
    if (this.activeMode === 'transmission') {
      return `传法 LV ${formatDisplayInteger(this.transmissionSkillLevel)}`;
    }
    return t('craft.workbench.modal.subtitle.default');
  }

  private renderCraftBody(): string {
    return `
      <div class="craft-workbench-shell" data-craft-workbench-shell="true">
        <aside class="craft-workbench-sidebar">
          <nav class="craft-workbench-tabs" data-craft-workbench-tabs="true" data-craft-tabs-key="${escapeHtml(this.buildCraftTabsKey())}">
            ${this.renderCraftModeTabs()}
          </nav>
        </aside>
        <section class="craft-workbench-main" data-craft-workbench-main="true">
          <div class="craft-workbench-header" data-craft-workbench-header="true" data-craft-header-key="${escapeHtml(this.buildCraftHeaderKey())}">
            ${this.renderCraftHeader()}
          </div>
          <div class="craft-workbench-content" data-craft-workbench-content="true">
            ${this.renderCraftActiveBody()}
          </div>
        </section>
      </div>
    `;
  }

  private renderCraftActiveBody(): string {
    if (this.activeMode === 'alchemy' || this.activeMode === 'forging') {
      return this.renderAlchemyBody();
    }
    if (this.activeMode === 'enhancement') {
      return this.renderEnhancementBody();
    }
    if (this.activeMode === 'transmission') {
      return this.renderTransmissionBody();
    }
    return this.renderForgingPlaceholder();
  }

  private renderCraftHeader(): string {
    const queue = this.getCraftQueueSnapshot();
    return `
      <div class="craft-profession-summary">
        <div class="craft-workbench-title">${escapeHtml(this.getCraftProfessionTitle())}</div>
        <div class="craft-workbench-desc">${escapeHtml(this.getCraftProfessionDescription())}</div>
        </div>
        ${this.renderCraftQueuePanel(queue)}
    `;
  }

  private renderCraftQueuePanel(queue = this.getCraftQueueSnapshot()): string {
    return `
      <div class="craft-queue-panel" data-craft-queue-key="${escapeHtml(this.buildCraftQueueStructureKey(queue))}">
        ${this.renderCraftQueuePanelContent(queue)}
      </div>
    `;
  }

  private renderCraftQueuePanelContent(queue = this.getCraftQueueSnapshot()): string {
    return `
        <div class="craft-queue-head">
          <span>${escapeHtml(t('craft.workbench.queue.title'))}</span>
          <strong>${formatDisplayInteger(queue.length)}</strong>
        </div>
        <div class="craft-queue-list">
          ${queue.length > 0
            ? queue.map((entry, index) => `
              <div class="craft-queue-item ${entry.isActive ? 'active' : ''}" data-craft-queue-entry="${escapeHtmlAttr(entry.queueId)}">
                <span>${escapeHtml(this.getCraftQueueKindLabel(entry.kind))} · ${escapeHtml(this.getCraftQueueStatusLabel(entry, index))}</span>
                <strong>${escapeHtml(entry.label)}</strong>
                ${this.renderCraftQueueItemMeta(entry)}
                ${this.renderCraftQueueItemProgress(entry)}
                <button
                  class="small-btn ghost craft-queue-cancel"
                  type="button"
                  data-craft-action="cancel-queue-entry"
                  data-kind="${escapeHtmlAttr(entry.cancelRef?.kind ?? entry.kind)}"
                  ${entry.cancelRef?.jobRunId || entry.isActive ? `data-job-run-id="${escapeHtmlAttr(entry.cancelRef?.jobRunId ?? entry.queueId)}"` : ''}
                  ${entry.cancelRef?.queueId || !entry.isActive ? `data-queue-id="${escapeHtmlAttr(entry.cancelRef?.queueId ?? entry.queueId)}"` : ''}
                >取消</button>
              </div>
            `).join('')
            : `<div class="craft-queue-empty">${escapeHtml(t('craft.workbench.queue.empty'))}</div>`}
        </div>
    `;
  }

  private getCraftQueueKindLabel(kind: CraftQueueItemView['kind']): string {
    return this.queueView.getCraftQueueKindLabel(kind);
  }

  private getCraftQueueStatusLabel(entry: CraftQueueDisplayItem, index: number): string {
    if (entry.isActive) {
      return t('craft.workbench.queue.active');
    }
    if (entry.state === 'sleeping') {
      return '休眠中';
    }
    return t('craft.workbench.queue.pending', { index: formatDisplayInteger(Math.max(1, index)) });
  }

  private renderCraftQueueItemMeta(entry: CraftQueueItemView): string {
    return this.queueView.renderCraftQueueItemMeta(entry);
  }

  private renderCraftQueueItemProgress(entry: CraftQueueDisplayItem): string {
    return this.queueView.renderCraftQueueItemProgress(entry);
  }

  private patchCraftQueueProgress(root: HTMLElement): void {
    this.queueView.patchCraftQueueProgress(root);
  }

  private patchCraftQueuePanel(root: HTMLElement): boolean {
    const queuePanel = root.querySelector<HTMLElement>('.craft-queue-panel');
    if (!queuePanel) {
      return false;
    }
    const queue = this.getCraftQueueSnapshot();
    const queueKey = this.buildCraftQueueStructureKey(queue);
    if (queuePanel.dataset.craftQueueKey !== queueKey) {
      replaceElementHtml(queuePanel, this.renderCraftQueuePanelContent(queue));
      queuePanel.dataset.craftQueueKey = queueKey;
    }
    this.patchCraftQueueProgress(queuePanel);
    return true;
  }

  private buildCraftHeaderKey(): string {
    return [
      this.activeMode ?? 'none',
      this.alchemySkillLevel,
      this.forgingSkillLevel,
      this.enhancementSkillLevel,
      this.transmissionSkillLevel,
      this.buildCraftQueueStructureKey(),
    ].join('::');
  }

  private buildCraftQueueStructureKey(queue = this.getCraftQueueSnapshot()): string {
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
      ].join(':'))
      .join('|');
  }

  private buildCraftTabsKey(): string {
    return [
      this.activeMode ?? 'none',
      this.alchemySkillLevel,
      this.forgingSkillLevel,
      this.enhancementSkillLevel,
      this.transmissionSkillLevel,
    ].join(':');
  }

  private renderCraftModeTabs(): string {
    const tabs: Array<{ mode: Exclude<CraftMode, null>; label: string; note: string }> = [
      { mode: 'alchemy', label: t('craft.workbench.mode.alchemy'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.alchemySkillLevel) }) },
      { mode: 'forging', label: t('craft.workbench.mode.forging'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.forgingSkillLevel) }) },
      { mode: 'enhancement', label: t('craft.workbench.mode.enhancement'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.enhancementSkillLevel) }) },
      { mode: 'transmission', label: '传法', note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.transmissionSkillLevel) }) },
    ];
    return tabs.map((tab) => `
      <button class="craft-mode-tab ${this.activeMode === tab.mode ? 'active' : ''}" type="button" data-craft-action="switch-craft-mode" data-mode="${tab.mode}">
        <span>${escapeHtml(tab.label)}</span>
        <em>${escapeHtml(tab.note)}</em>
      </button>
    `).join('');
  }

  private buildTransmissionRenderKey(): string {
    return [
      this.transmissionSkillLevel,
      this.transmissionSkillExp,
      this.transmissionSkillExpToNext,
      this.transmissionTechniques.map((tech) => tech.techId).join(','),
      (this.pendingTechniqueComprehensions ?? [])
        .map((entry) => `${entry.techId}:${Math.floor(entry.progress ?? 0)}/${Math.floor(entry.requiredProgress ?? 1)}:${entry.activeTransferJob?.status ?? 'self'}`)
        .join(','),
      this.getTransmissionTargets().map((target) => target.playerId).join(','),
    ].join('|');
  }

  private getTransmissionTargets(): Array<{ playerId: string; name: string }> {
    return this.transmissionCallbacks?.getTransmissionTargets?.()
      ?? this.callbacks?.getTransmissionTargets?.()
      ?? [];
  }

  private renderTransmissionBody(): string {
    const expToNext = Math.max(0, Math.floor(this.transmissionSkillExpToNext || 0));
    const exp = Math.max(0, Math.floor(this.transmissionSkillExp || 0));
    const progressRatio = expToNext > 0 ? Math.max(0, Math.min(1, exp / expToNext)) : 1;
    const pending = this.pendingTechniqueComprehensions ?? [];
    const learned = this.getTransmittableTechniques();
    const targets = this.getTransmissionTargets();
    return `
      <div class="alchemy-tab-stack" data-transmission-panel="true">
        <div class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">传法等级</div>
            <span class="alchemy-summary-mode">LV ${formatDisplayInteger(this.transmissionSkillLevel)}</span>
          </div>
          <div class="alchemy-summary-metrics">
            <div class="alchemy-summary-metric">
              <span class="alchemy-summary-metric-label">经验</span>
              <strong class="alchemy-summary-metric-value">${formatDisplayInteger(exp)} / ${formatDisplayInteger(expToNext)}</strong>
            </div>
            <div class="alchemy-summary-metric">
              <span class="alchemy-summary-metric-label">进度</span>
              <strong class="alchemy-summary-metric-value">${formatDisplayPercent(progressRatio * 100, { maximumFractionDigits: 1 })}</strong>
            </div>
            <div class="alchemy-summary-metric">
              <span class="alchemy-summary-metric-label">附近玩家</span>
              <strong class="alchemy-summary-metric-value">${formatDisplayInteger(targets.length)}</strong>
            </div>
          </div>
          <div class="attr-craft-exp">
            <div class="attr-craft-exp-track" aria-hidden="true">
              <span class="attr-craft-exp-fill" style="width:${(progressRatio * 100).toFixed(2)}%"></span>
            </div>
          </div>
        </div>
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
            <span class="alchemy-summary-mode">${formatDisplayInteger(learned.length)} 门可传</span>
          </div>
          ${this.renderTransmissionTeachPicker(learned, targets)}
        </section>
      </div>
    `;
  }

  private getTransmittableTechniques(): PlayerState['techniques'] {
    return (this.transmissionTechniques ?? []).filter((tech) => isCreatedTechniqueId(tech.techId));
  }

  private renderTransmissionPendingRow(entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number]): string {
    const required = Math.max(1, Math.floor(Number(entry.requiredProgress) || 1));
    const progress = Math.max(0, Math.floor(Number(entry.progress) || 0));
    const ratio = Math.max(0, Math.min(1, progress / required));
    const job = entry.activeTransferJob ?? null;
    const status = job
      ? (job.status === 'blocked' ? '等待传授' : '传授中')
      : '自行领悟';
    return `
      <div class="enhancement-candidate-card" data-transmission-pending="${escapeHtmlAttr(entry.techId)}">
        <div class="enhancement-candidate-main">
          <strong>${escapeHtml(entry.name ?? entry.techId)}</strong>
          <span>${escapeHtml(status)} · ${formatDisplayInteger(progress)} / ${formatDisplayInteger(required)}</span>
        </div>
        <div class="attr-craft-exp">
          <div class="attr-craft-exp-track" aria-hidden="true">
            <span class="attr-craft-exp-fill" style="width:${(ratio * 100).toFixed(2)}%"></span>
          </div>
        </div>
        ${job ? `<button class="small-btn danger" type="button" data-craft-action="transmission-cancel" data-tech-id="${escapeHtmlAttr(entry.techId)}">取消传法</button>` : ''}
      </div>
    `;
  }

  private renderTransmissionTeachPicker(
    techniques: PlayerState['techniques'],
    targets: Array<{ playerId: string; name: string }>,
  ): string {
    if (techniques.length === 0) {
      return '<div class="empty-hint">暂无可传授自创功法</div>';
    }
    const techniqueOptions = techniques.map((tech) => {
      const search = `${tech.name ?? ''} ${tech.techId}`.toLowerCase();
      return `<option value="${escapeHtmlAttr(tech.techId)}" data-search="${escapeHtmlAttr(search)}">${escapeHtml(tech.name ?? tech.techId)} · ${escapeHtml(getTechniqueGradeLabel(tech.grade))} · 第 ${formatDisplayInteger(tech.level ?? 1)} 层</option>`;
    }).join('');
    const targetOptions = targets.length > 0
      ? targets.map((target) => `<option value="${escapeHtmlAttr(target.playerId)}">${escapeHtml(target.name)}</option>`).join('')
      : '<option value="">附近无可传授玩家</option>';
    const disabled = targets.length === 0 ? 'disabled' : '';
    return `
      <div class="transmission-teach-picker">
        <input class="ui-search-input" type="search" data-transmission-tech-search="true" placeholder="搜索自创功法">
        <select class="ui-input" data-transmission-tech-select="true" ${disabled}>
          ${techniqueOptions}
        </select>
        <select class="ui-input" data-transmission-target-select="true" ${disabled}>
          ${targetOptions}
        </select>
        <button class="small-btn" type="button" data-craft-action="transmission-start" ${disabled}>传授</button>
      </div>
    `;
  }

  private renderForgingPlaceholder(): string {
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

  private getCraftProfessionTitle(): string {
    if (this.activeMode === 'alchemy') {
      return t('craft.workbench.mode.alchemy');
    }
    if (this.activeMode === 'forging') {
      return t('craft.workbench.mode.forging');
    }
    if (this.activeMode === 'enhancement') {
      return t('craft.workbench.mode.enhancement');
    }
    if (this.activeMode === 'transmission') {
      return '传法';
    }
    return t('craft.workbench.mode.craft');
  }

  private getCraftProfessionDescription(): string {
    if (this.activeMode === 'alchemy') {
      return t('craft.workbench.profession.description.alchemy');
    }
    if (this.activeMode === 'forging') {
      return t('craft.workbench.profession.description.forging');
    }
    if (this.activeMode === 'enhancement') {
      return t('craft.workbench.profession.description.enhancement');
    }
    if (this.activeMode === 'transmission') {
      return `传法 LV ${formatDisplayInteger(this.transmissionSkillLevel)}，用于降低功法领悟与传授所需时间。`;
    }
    return t('craft.workbench.profession.description.default');
  }

  private getCraftQueueSnapshot(): CraftQueueDisplayItem[] {
    return this.queueView.getCraftQueueSnapshot();
  }

  private buildCraftQueueTimeProgress(remainingTicks: number | undefined, totalTicks: number | undefined, phase?: string): CraftQueueProgressView {
    return this.queueView.buildCraftQueueTimeProgress(remainingTicks, totalTicks, phase);
  }

  private bindActions(body: HTMLElement, signal: AbortSignal): void {
    if (this.activeMode === 'enhancement') {
      this.bindEnhancementEvents(body, signal);
    }
    if (this.activeMode === 'transmission') {
      this.bindTransmissionEvents(body, signal);
    }
    body.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-craft-action]') : null;
      if (!target) {
        return;
      }
      const action = target.dataset.craftAction ?? '';
      if (action === 'switch-craft-mode') {
        const mode = target.dataset.mode;
        if (mode === 'alchemy') {
          this.openAlchemy();
        } else if (mode === 'forging') {
          this.openForging();
        } else if (mode === 'enhancement') {
          this.openEnhancement();
        } else if (mode === 'transmission') {
          this.openTransmission();
        }
        return;
      }
      if (action === 'cancel-queue-entry') {
        const kind = normalizeTechniqueActivityKind(target.dataset.kind);
        const jobRunId = (target.dataset.jobRunId ?? '').trim();
        const queueId = (target.dataset.queueId ?? '').trim();
        if (!jobRunId && !queueId) {
          return;
        }
        this.callbacks?.onCancelTechniqueActivity({
          kind,
          ...(jobRunId ? { jobRunId } : {}),
          ...(queueId ? { queueId } : {}),
        });
        return;
      }
      if (action === 'transmission-start') {
        const techId = (target.dataset.techId ?? body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]')?.value ?? '').trim();
        const learnerPlayerId = (body.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]')?.value ?? '').trim();
        if (techId && learnerPlayerId) {
          (this.transmissionCallbacks?.onStartTransmission ?? this.callbacks?.onStartTransmission)?.(learnerPlayerId, techId);
        }
        return;
      }
      if (action === 'transmission-cancel') {
        const techId = (target.dataset.techId ?? '').trim();
        if (techId) {
          (this.transmissionCallbacks?.onCancelTransmission ?? this.callbacks?.onCancelTransmission)?.(techId);
        }
        return;
      }
      if (action === 'alchemy-switch-category') {
        const category = normalizeAlchemyCategory(target.dataset.category);
        this.activeAlchemyCategory = category;
        const firstRecipe = this.getVisibleAlchemyRecipes()[0] ?? null;
        if (firstRecipe) {
          this.selectedAlchemyRecipeId = firstRecipe.recipeId;
        } else {
          this.selectedAlchemyRecipeId = null;
        }
        this.selectedAlchemyPresetId = null;
        this.ensureAlchemyDraft();
        this.render();
        return;
      }
      if (action === 'alchemy-switch-realm') {
        const realm = normalizeAlchemyRealm(target.dataset.realm);
        this.activeAlchemyRealm = realm;
        const firstRecipe = this.getVisibleAlchemyRecipes()[0] ?? null;
        if (firstRecipe) {
          this.selectedAlchemyRecipeId = firstRecipe.recipeId;
        } else {
          this.selectedAlchemyRecipeId = null;
        }
        this.selectedAlchemyPresetId = null;
        this.ensureAlchemyDraft();
        this.render();
        return;
      }
      if (action === 'alchemy-switch-tab') {
        this.activeAlchemyTab = target.dataset.tab === 'simple' ? 'simple' : 'full';
        this.render();
        return;
      }
      if (action === 'alchemy-select-recipe') {
        const recipeId = (target.dataset.recipeId ?? '').trim();
        if (recipeId) {
          this.selectedAlchemyRecipeId = recipeId;
          this.selectedAlchemyPresetId = null;
          this.ensureAlchemyDraft();
          this.render();
        }
        return;
      }
      if (action === 'alchemy-select-preset') {
        const presetId = (target.dataset.presetId ?? '').trim();
        const recipeId = this.selectedAlchemyRecipeId;
        if (!recipeId || !presetId) {
          return;
        }
        const preset = this.getAlchemyRecipePresets(recipeId).find((entry) => entry.presetId === presetId);
        if (!preset) {
          return;
        }
        this.selectedAlchemyPresetId = presetId;
        this.setAlchemyDraft(recipeId, preset.ingredients);
        this.render();
        return;
      }
      if (action === 'alchemy-increase-aux' || action === 'alchemy-decrease-aux') {
        const recipeId = this.selectedAlchemyRecipeId;
        const itemId = (target.dataset.itemId ?? '').trim();
        if (!recipeId || !itemId) {
          return;
        }
        this.selectedAlchemyPresetId = null;
        this.adjustAlchemyAuxCount(recipeId, itemId, action === 'alchemy-increase-aux' ? 1 : -1);
        this.render();
        return;
      }
      if (action === 'alchemy-reset-draft') {
        const recipeId = this.selectedAlchemyRecipeId;
        if (!recipeId) {
          return;
        }
        this.selectedAlchemyPresetId = null;
        this.setAlchemyDraft(recipeId, this.getFullAlchemyIngredients(recipeId));
        this.render();
        return;
      }
      if (action === 'alchemy-save-preset') {
        if (this.activeMode === 'forging') {
          return;
        }
        const recipe = this.getSelectedAlchemyRecipe();
        if (!recipe) {
          return;
        }
        const matchingPresets = this.getAlchemyRecipePresets(recipe.recipeId);
        const selectedPreset = this.selectedAlchemyPresetId
          ? matchingPresets.find((preset) => preset.presetId === this.selectedAlchemyPresetId) ?? null
          : null;
        this.callbacks?.onSaveAlchemyPreset({
          presetId: selectedPreset?.presetId,
          recipeId: recipe.recipeId,
          name: selectedPreset?.name ?? `${recipe.outputName}简方${matchingPresets.length + 1}`,
          ingredients: this.getAlchemyDraftIngredients(recipe.recipeId),
        });
        return;
      }
      if (action === 'alchemy-delete-preset') {
        if (this.activeMode === 'forging') {
          return;
        }
        const presetId = (target.dataset.presetId ?? '').trim();
        if (presetId) {
          this.callbacks?.onDeleteAlchemyPreset(presetId);
        }
        return;
      }
      if (action === 'alchemy-start-full') {
        const recipeId = this.selectedAlchemyRecipeId;
        if (!recipeId) {
          return;
        }
        this.openAlchemyConfirm(recipeId, this.getFullAlchemyIngredients(recipeId), 'full');
        return;
      }
      if (action === 'alchemy-start-draft') {
        const recipeId = this.selectedAlchemyRecipeId;
        if (!recipeId) {
          return;
        }
        this.openAlchemyConfirm(recipeId, this.getAlchemyDraftIngredients(recipeId), 'simple');
        return;
      }
      if (action === 'cancel-alchemy') {
        if (this.activeMode === 'forging') {
          this.callbacks?.onCancelForging();
        } else {
          this.callbacks?.onCancelAlchemy();
        }
        return;
      }
      if (action === 'enhancement-refresh') {
        this.callbacks?.onRequestEnhancement();
        return;
      }
      if (action === 'select-enhancement-target') {
        const targetKey = (target.dataset.targetKey ?? '').trim();
        if (targetKey) {
          this.selectedEnhancementTargetKey = targetKey;
          const selected = this.getSelectedEnhancementCandidate();
          this.selectedEnhancementTargetLevel = selected ? selected.currentLevel + 1 : null;
          this.selectedEnhancementProtectionKey = null;
          this.selectedEnhancementProtectionStartLevel = null;
          this.render();
        }
        return;
      }
      if (action === 'toggle-enhancement-picker') {
        this.openEnhancementPickerModal();
        return;
      }
      if (action === 'target-adjust') {
        this.adjustNumericInput(body, '[data-enhancement-target-level-input]', Number(target.dataset.delta ?? '0'));
        return;
      }
      if (action === 'protection-adjust') {
        this.adjustNumericInput(body, '[data-enhancement-protection-start-input]', Number(target.dataset.delta ?? '0'));
        return;
      }
      if (action === 'start-enhancement') {
        const selected = this.getSelectedEnhancementCandidate();
        if (!selected) {
          return;
        }
        const selectedProtection = body.querySelector<HTMLInputElement>('input[name="enhancement-protection"]:checked');
        const useProtection = target.dataset.protection === 'true' || Boolean((selectedProtection?.value ?? '').trim());
        const payload = this.buildEnhancementPayload(body, selected, useProtection);
        if (!payload) {
          return;
        }
        payload.queueMode = this.normalizeQueueStartMode(target.dataset.queueMode);
        this.callbacks?.onStartEnhancement(payload);
        return;
      }
      if (action === 'cancel-enhancement') {
        this.callbacks?.onCancelEnhancement();
      }
    }, { signal });
  }

  private bindTransmissionEvents(body: HTMLElement, signal: AbortSignal): void {
    body.addEventListener('input', (event) => {
      const input = event.target instanceof HTMLInputElement && event.target.matches('[data-transmission-tech-search="true"]')
        ? event.target
        : null;
      if (!input) return;
      this.filterTransmissionTechniqueOptions(body, input.value);
    }, { signal });
    body.addEventListener('change', (event) => {
      const changed = event.target instanceof HTMLSelectElement
        && (event.target.matches('[data-transmission-tech-select="true"]') || event.target.matches('[data-transmission-target-select="true"]'));
      if (changed) {
        this.syncTransmissionStartButton(body);
      }
    }, { signal });
  }

  private filterTransmissionTechniqueOptions(body: HTMLElement, query: string): void {
    const select = body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]');
    if (!select) return;
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
    select.disabled = !firstVisibleValue;
    this.syncTransmissionStartButton(body);
  }

  private syncTransmissionStartButton(body: HTMLElement): void {
    const techId = (body.querySelector<HTMLSelectElement>('[data-transmission-tech-select="true"]')?.value ?? '').trim();
    const learnerPlayerId = (body.querySelector<HTMLSelectElement>('[data-transmission-target-select="true"]')?.value ?? '').trim();
    const button = body.querySelector<HTMLButtonElement>('[data-craft-action="transmission-start"]');
    if (button) {
      button.disabled = !techId || !learnerPlayerId;
    }
  }

  private adjustNumericInput(body: HTMLElement, selector: string, delta: number): void {
    const input = body.querySelector<HTMLInputElement>(selector);
    if (!input || !Number.isFinite(delta) || delta === 0) {
      return;
    }
    const min = Number(input.min || '0');
    const max = input.max ? Number(input.max) : Number.POSITIVE_INFINITY;
    const current = Number(input.value || '0');
    const next = Math.max(min, Math.min(max, Math.floor((Number.isFinite(current) ? current : min) + delta)));
    input.value = String(next);
  }

  private buildEnhancementPayload(
    body: HTMLElement,
    candidate: SyncedEnhancementCandidateView,
    useProtection: boolean,
  ): C2S_StartEnhancement | null {
    const targetExpectedInstanceId = typeof candidate.item?.itemInstanceId === 'string' && candidate.item.itemInstanceId.length > 0
      ? candidate.item.itemInstanceId
      : undefined;
    const payload: C2S_StartEnhancement = {
      target: targetExpectedInstanceId
        ? { ...candidate.ref, itemInstanceId: targetExpectedInstanceId }
        : candidate.ref,
    };
    const targetLevelInput = body.querySelector<HTMLInputElement>('[data-enhancement-target-level-input]');
    const targetLevel = Number(targetLevelInput?.value ?? String(candidate.nextLevel));
    if (Number.isFinite(targetLevel)) {
      payload.targetLevel = Math.max(candidate.nextLevel, Math.min(MAX_ENHANCE_LEVEL, Math.floor(targetLevel)));
    }
    if (!useProtection) {
      return payload;
    }
    const selectedProtection = body.querySelector<HTMLInputElement>('input[name="enhancement-protection"]:checked');
    const protectionValue = (selectedProtection?.value ?? '').trim();
    if (!protectionValue) {
      return payload;
    }
    if (protectionValue === 'self') {
      payload.protection = targetExpectedInstanceId
        ? { ...candidate.ref, itemInstanceId: targetExpectedInstanceId }
        : candidate.ref;
    } else if (protectionValue.startsWith('inventory:')) {
      payload.protection = {
        source: 'inventory',
        itemInstanceId: protectionValue.slice('inventory:'.length),
      };
    } else if (protectionValue.startsWith('equipment:')) {
      payload.protection = {
        source: 'equipment',
        slot: protectionValue.slice('equipment:'.length) as EnhancementTargetRef['slot'],
      };
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

  private getVisibleAlchemyRecipes(): AlchemyRecipeCatalogEntry[] {
    if (this.activeMode === 'forging') {
      return this.alchemyCatalog.filter((entry) => getAlchemyRealmTab(entry.outputLevel) === this.activeAlchemyRealm);
    }
    return this.alchemyCatalog.filter((entry) => (
      entry.category === this.activeAlchemyCategory
      && getAlchemyRealmTab(entry.outputLevel) === this.activeAlchemyRealm
    ));
  }

  private getSelectedAlchemyRecipe(): AlchemyRecipeCatalogEntry | null {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === this.selectedAlchemyRecipeId) ?? null;
    if (!recipe) {
      return null;
    }
    if (this.activeMode === 'forging') {
      return getAlchemyRealmTab(recipe.outputLevel) === this.activeAlchemyRealm ? recipe : null;
    }
    return recipe.category === this.activeAlchemyCategory && getAlchemyRealmTab(recipe.outputLevel) === this.activeAlchemyRealm
      ? recipe
      : null;
  }

  private getSelectedEnhancementCandidate(): SyncedEnhancementCandidateView | null {
    const candidates = this.enhancementPanel?.state?.candidates ?? [];
    return candidates.find((entry) => buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementTargetKey) ?? null;
  }

  private getEnhancementPanelState(): SyncedEnhancementPanelState | null {
    return this.enhancementPanel?.state ?? null;
  }

  private getActiveEnhancementJob(): EnhancementJobView | null {
    return this.getEnhancementPanelState()?.job ?? null;
  }

  private isCompactEnhancementLayout(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  }

  private getSelectedEnhancementProtection(selected: SyncedEnhancementCandidateView | null): { ref: EnhancementTargetRef; item: EnhancementItemView } | null {
    if (!selected || !this.selectedEnhancementProtectionKey) {
      return null;
    }
    if (
      this.selectedEnhancementProtectionKey === 'self'
      && selected.allowSelfProtection
      && selected.ref.source === 'inventory'
      && Math.max(0, Math.floor(selected.item.count ?? 0)) > 1
    ) {
      return { ref: selected.ref, item: selected.item };
    }
    return selected.protectionCandidates.find((entry) => buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementProtectionKey) ?? null;
  }

  private getSelectedEnhancementTargetLevel(selected: SyncedEnhancementCandidateView | null): number | null {
    if (!selected) {
      return null;
    }
    const minLevel = selected.currentLevel + 1;
    return Math.min(MAX_ENHANCE_LEVEL, Math.max(minLevel, Math.floor(Number(this.selectedEnhancementTargetLevel) || minLevel)));
  }

  private getSelectedEnhancementProtectionStartLevel(selected: SyncedEnhancementCandidateView | null): number | null {
    if (!selected || !this.selectedEnhancementProtectionKey) {
      return null;
    }
    const minLevel = 2;
    const maxLevel = this.getSelectedEnhancementTargetLevel(selected) ?? Math.max(minLevel, selected.currentLevel + 1);
    return Math.max(minLevel, Math.min(maxLevel, Math.floor(Number(this.selectedEnhancementProtectionStartLevel) || minLevel)));
  }

  private getAlchemySubtitle(): string {
    const job = this.alchemyPanel?.state?.job;
    if (job) {
      const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === job.recipeId) ?? null;
      return t('craft.workbench.alchemy.subtitle.job', {
        itemName: recipe?.outputName?.trim() || UNKNOWN_ITEM_NAME,
        completed: formatDisplayInteger(job.completedCount),
        quantity: formatDisplayInteger(job.quantity),
      });
    }
    return this.activeMode === 'forging'
      ? t('craft.workbench.alchemy.subtitle.forging', { level: formatDisplayInteger(this.forgingSkillLevel) })
      : t('craft.workbench.alchemy.subtitle.alchemy', {
        alchemyLevel: formatDisplayInteger(this.alchemySkillLevel),
        gatherLevel: formatDisplayInteger(this.gatherSkillLevel),
      });
  }

  private captureAlchemyViewState(body: HTMLElement): AlchemyViewState {
    return {
      recipeListTop: body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]')?.scrollTop ?? 0,
      detailTop: body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]')?.scrollTop ?? 0,
      detailKey: body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]')?.dataset.detailKey ?? null,
    };
  }

  private restoreAlchemyViewState(body: HTMLElement, state: AlchemyViewState, preserveDetail: boolean): void {
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    if (recipeList) {
      recipeList.scrollTop = state.recipeListTop;
    }
    if (!preserveDetail) {
      return;
    }
    const detailPanel = body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]');
    if (detailPanel) {
      detailPanel.scrollTop = state.detailTop;
    }
  }

  private tryPatchAlchemyBody(body: HTMLElement): boolean {
    return this.alchemyView.tryPatchAlchemyBody(body);
  }

  private buildAlchemyStableRenderKey(): string {
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    const presets = this.alchemyPanel?.state?.presets ?? [];
    const presetVersion = presets
      .map((preset) => `${preset.presetId}:${preset.updatedAt}`)
      .join('|');
    const inventoryRevision = Number((this.inventory as { revision?: number })?.revision ?? this.inventory.items.length);
    const equipmentRevision = Number((this.equipment as { revision?: number })?.revision ?? 0);
    return [
      this.alchemyCatalogVersion,
      this.activeAlchemyRealm,
      this.activeAlchemyCategory,
      this.activeAlchemyTab,
      selectedRecipe?.recipeId ?? 'empty',
      this.alchemySkillLevel,
      this.forgingSkillLevel,
      this.gatherSkillLevel,
      inventoryRevision,
      equipmentRevision,
      Boolean(this.alchemyPanel?.state?.job),
      this.alchemyPanel?.error ?? '',
      presetVersion,
    ].join('::');
  }

  private patchAlchemyJobHost(jobHost: HTMLElement): void {
    const job = this.alchemyPanel?.state?.job ?? null;
    const nextJobKey = this.getAlchemyJobPatchKey(job);
    const card = jobHost.querySelector<HTMLElement>('[data-alchemy-job-card="true"]');
    if (!card || card.dataset.alchemyJobKey !== nextJobKey) {
      replaceElementHtml(jobHost, this.renderAlchemyJobCard(job));
      return;
    }
    if (!job) {
      return;
    }
    const workRemainingTicks = resolveAlchemyWorkRemainingTicks(job);
    const workTotalTicks = resolveAlchemyWorkTotalTicks(job);
    const progressPercent = Math.max(0, Math.min(100, (1 - (workRemainingTicks / Math.max(1, workTotalTicks))) * 100));
    const interruptRemainingTicks = resolveAlchemyInterruptRemainingTicks(job);
    const interruptTotalTicks = resolveAlchemyInterruptTotalTicks(job, interruptRemainingTicks);
    const interruptPercent = Math.max(0, Math.min(100, (1 - (interruptRemainingTicks / Math.max(1, interruptTotalTicks))) * 100));
    const progressLabel = card.querySelector<HTMLElement>('.alchemy-job-progress-head strong');
    const progressFill = card.querySelector<HTMLElement>('[data-alchemy-work-fill="true"]');
    const interruptProgress = card.querySelector<HTMLElement>('[data-alchemy-interrupt-progress="true"]');
    const interruptLabel = card.querySelector<HTMLElement>('[data-alchemy-interrupt-label="true"]');
    const interruptFill = card.querySelector<HTMLElement>('[data-alchemy-interrupt-fill="true"]');
    const phaseChip = card.querySelector<HTMLElement>('.alchemy-job-phase-chip');
    const metaSpans = card.querySelectorAll<HTMLElement>(':scope .alchemy-job-meta > span');
    if (progressLabel) {
      progressLabel.textContent = t('craft.workbench.alchemy.job.progress-value', {
        completed: formatDisplayInteger(job.completedCount),
        quantity: formatDisplayInteger(job.quantity),
      });
    }
    if (progressFill) {
      progressFill.style.width = `${progressPercent.toFixed(2)}%`;
    }
    if (interruptProgress) {
      interruptProgress.classList.toggle('is-hidden', interruptRemainingTicks <= 0);
    }
    if (interruptLabel) {
      interruptLabel.textContent = formatTicks(interruptRemainingTicks);
    }
    if (interruptFill) {
      interruptFill.style.width = `${interruptPercent.toFixed(2)}%`;
    }
    if (phaseChip) {
      phaseChip.textContent = getAlchemyPhaseLabel(job.phase);
      phaseChip.classList.toggle('is-paused', job.phase === 'paused');
      phaseChip.classList.toggle('is-brewing', job.phase === 'brewing');
    }
    const metaText = [
      t('craft.workbench.alchemy.job.remaining', { ticks: formatTicks(workRemainingTicks) }),
      t('craft.workbench.alchemy.job.success-count', { count: formatDisplayInteger(job.successCount) }),
      t('craft.workbench.alchemy.job.failure-count', { count: formatDisplayInteger(job.failureCount) }),
      getAlchemyPhaseLabel(job.phase),
    ];
    metaSpans.forEach((span, index) => {
      if (metaText[index]) {
        span.textContent = metaText[index];
      }
    });
  }

  private getAlchemyJobPatchKey(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']> | null): string {
    if (!job) {
      return 'empty';
    }
    return `${job.jobRunId ?? job.startedAt}:${job.recipeId}:${job.quantity}:${job.totalTicks}:${job.outputItemId}`;
  }

  private renderAlchemyTopbar(): string {
    const isForging = this.activeMode === 'forging';
    const itemKind = isForging ? t('craft.workbench.alchemy.item-kind.forging') : t('craft.workbench.alchemy.item-kind.alchemy');
    const displayLevel = isForging ? this.forgingSkillLevel : this.alchemySkillLevel;
    return `
      <div class="alchemy-topbar-main">
        <span class="alchemy-topbar-label">${escapeHtml(isForging ? t('craft.workbench.alchemy.topbar.level.forging') : t('craft.workbench.alchemy.topbar.level.alchemy'))}</span>
        <strong class="alchemy-topbar-value">LV ${formatDisplayInteger(displayLevel)}</strong>
      </div>
      <div class="alchemy-topbar-note">${escapeHtml(t('craft.workbench.alchemy.topbar.note', { itemKind }))}</div>
    `;
  }

  private renderAlchemyTabButtons(): string {
    if (this.activeMode === 'forging') {
      return `
        <button class="alchemy-tab-btn ${this.activeAlchemyTab === 'full' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="full">${escapeHtml(t('craft.workbench.alchemy.tab.full-forging'))}</button>
        <button class="alchemy-tab-btn ${this.activeAlchemyTab === 'simple' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">${escapeHtml(t('craft.workbench.alchemy.tab.simple-forging'))}</button>
      `;
    }
    return `
      <button class="alchemy-tab-btn ${this.activeAlchemyTab === 'full' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="full">${escapeHtml(t('craft.workbench.alchemy.tab.full-alchemy'))}</button>
      <button class="alchemy-tab-btn ${this.activeAlchemyTab === 'simple' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">${escapeHtml(t('craft.workbench.alchemy.tab.simple-alchemy'))}</button>
    `;
  }

  private renderAlchemyRecipeList(): string {
    const visibleRecipes = this.getVisibleAlchemyRecipes();
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    if (visibleRecipes.length === 0) {
      const noun = this.activeMode === 'forging' ? t('craft.workbench.alchemy.noun.forging-recipe') : t('craft.workbench.alchemy.noun.alchemy-recipe');
      return `<div class="alchemy-recipe-list-empty">${escapeHtml(this.loading ? t('craft.workbench.alchemy.recipe-list.loading', { noun }) : (this.alchemyPanel?.error ?? t('craft.workbench.alchemy.recipe-list.empty-category', { noun })))}</div>`;
    }
    return visibleRecipes
      .map((recipe) => this.renderAlchemyRecipeItem(recipe, recipe.recipeId === selectedRecipe?.recipeId))
      .join('');
  }

  private renderAlchemyDetailPanel(): string {
    const state = this.alchemyPanel?.state ?? null;
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    const presets = selectedRecipe
      ? state?.presets.filter((preset) => preset.recipeId === selectedRecipe.recipeId) ?? []
      : [];
    if (!selectedRecipe) {
      const noun = this.activeMode === 'forging' ? t('craft.workbench.alchemy.noun.forging-recipe') : t('craft.workbench.alchemy.noun.alchemy-recipe');
      return `<div class="alchemy-recipe-list-empty">${escapeHtml(this.loading ? t('craft.workbench.alchemy.recipe-list.loading', { noun }) : (this.alchemyPanel?.error ?? t('craft.workbench.alchemy.recipe-list.empty-current', { noun })))}</div>`;
    }
    return this.activeAlchemyTab === 'full'
      ? this.renderAlchemyFullTab(selectedRecipe)
      : this.renderAlchemySimpleTab(selectedRecipe, presets);
  }

  private captureEnhancementViewState(body: HTMLElement): EnhancementViewState {
    return {
      targetLevelValue: body.querySelector<HTMLInputElement>('[data-enhancement-target-level-input]')?.value ?? null,
      protectionStartValue: body.querySelector<HTMLInputElement>('[data-enhancement-protection-start-input]')?.value ?? null,
      protectionValue: body.querySelector<HTMLInputElement>('input[name="enhancement-protection"]:checked')?.value ?? null,
      pickerTop: body.querySelector<HTMLElement>('.enhancement-picker-grid')?.scrollTop ?? 0,
      historyTop: body.querySelector<HTMLElement>('.enhancement-history-list-modal')?.scrollTop ?? 0,
      selectedTargetKey: this.selectedEnhancementTargetKey,
    };
  }

  private restoreEnhancementViewState(body: HTMLElement, state: EnhancementViewState): void {
    if (state.selectedTargetKey !== this.selectedEnhancementTargetKey) {
      return;
    }
    const targetLevelInput = body.querySelector<HTMLInputElement>('[data-enhancement-target-level-input]');
    if (targetLevelInput && state.targetLevelValue !== null) {
      targetLevelInput.value = state.targetLevelValue;
    }
    const protectionStartInput = body.querySelector<HTMLInputElement>('[data-enhancement-protection-start-input]');
    if (protectionStartInput && state.protectionStartValue !== null) {
      protectionStartInput.value = state.protectionStartValue;
    }
    if (state.protectionValue !== null) {
      const protectionInput = body.querySelector<HTMLInputElement>(`input[name="enhancement-protection"][value="${escapeHtml(state.protectionValue)}"]`);
      if (protectionInput) {
        protectionInput.checked = true;
      }
    }
    const picker = body.querySelector<HTMLElement>('.enhancement-picker-grid');
    if (picker) {
      picker.scrollTop = state.pickerTop;
    }
    const history = body.querySelector<HTMLElement>('.enhancement-history-list-modal');
    if (history) {
      history.scrollTop = state.historyTop;
    }
  }

  private tryPatchEnhancementBody(body: HTMLElement): boolean {
    return this.enhancementView.tryPatchEnhancementBody(body);
  }

  private buildEnhancementStableRenderKey(): string {
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
        entry.materials.map((material) => `${material.itemId}:${material.count}:${material.ownedCount}`).join(','),
        entry.protectionCandidates.length,
      ].join('/'))
      .join('|');
    const recordKey = (state?.records ?? [])
      .map((record) => `${record.itemId}:${record.highestLevel}:${record.levels.map((level) => `${level.targetLevel}:${level.successCount}:${level.failureCount}`).join(',')}`)
      .join('|');
    return [
      this.enhancementResponseError ?? '',
      state?.enhancementSkillLevel ?? this.enhancementSkillLevel,
      job ? this.getEnhancementJobPatchKey(job) : 'idle',
      this.selectedEnhancementTargetKey ?? '',
      this.selectedEnhancementTargetLevel ?? '',
      this.selectedEnhancementProtectionKey ?? '',
      this.selectedEnhancementProtectionStartLevel ?? '',
      this.enhancementHistoryExpanded ? 'history-open' : 'history-closed',
      this.enhancementProtectionExpanded ? 'protection-open' : 'protection-closed',
      candidateKey,
      recordKey,
    ].join('::');
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

  private getEnhancementToolbarNoteText(): string {
    const state = this.enhancementPanel?.state ?? null;
    const job = state?.job ?? null;
    return job
      ? `强化队列进行中，剩余 ${formatTicks(resolveEnhancementWorkRemainingTicks(job))} / ${formatTicks(resolveEnhancementWorkTotalTicks(job))}`
      : `角色强化等级 Lv.${formatDisplayInteger(state?.enhancementSkillLevel ?? this.enhancementSkillLevel)} · 当前可强化装备 ${formatDisplayInteger(state?.candidates.length ?? 0)} 件`;
  }

  private patchEnhancementActiveJob(workbench: HTMLElement, job: EnhancementJobView): void {
    const runningCard = workbench.querySelector<HTMLElement>('.enhancement-summary-card--running');
    const subtitle = runningCard?.querySelector<HTMLElement>('.enhancement-summary-subtitle');
    const rate = runningCard?.querySelector<HTMLElement>('.enhancement-summary-rate');
    const metrics = runningCard?.querySelectorAll<HTMLElement>('.enhancement-summary-metric strong');
    const workRemainingTicks = resolveEnhancementWorkRemainingTicks(job);
    const workTotalTicks = resolveEnhancementWorkTotalTicks(job);
    const workPercent = Math.max(0, Math.min(100, (1 - (workRemainingTicks / Math.max(1, workTotalTicks))) * 100));
    const interruptRemainingTicks = resolveEnhancementInterruptRemainingTicks(job);
    const interruptTotalTicks = resolveEnhancementInterruptTotalTicks(job, interruptRemainingTicks);
    const interruptPercent = Math.max(0, Math.min(100, (1 - (interruptRemainingTicks / Math.max(1, interruptTotalTicks))) * 100));
    const workFill = runningCard?.querySelector<HTMLElement>('[data-enhancement-work-fill="true"]');
    const interruptProgress = runningCard?.querySelector<HTMLElement>('[data-enhancement-interrupt-progress="true"]');
    const interruptLabel = runningCard?.querySelector<HTMLElement>('[data-enhancement-interrupt-label="true"]');
    const interruptFill = runningCard?.querySelector<HTMLElement>('[data-enhancement-interrupt-fill="true"]');
    const sideMetrics = workbench.querySelectorAll<HTMLElement>('.enhancement-workbench-side .enhancement-summary-metric strong');
    const materialOwned = workbench.querySelector<HTMLElement>('.enhancement-material-owned');
    const finalTargetLevel = Math.max(job.targetLevel, job.desiredTargetLevel ?? job.targetLevel);
    if (subtitle) {
      subtitle.textContent = t('craft.workbench.enhance-progress', { current: formatDisplayInteger(job.currentLevel), target: formatDisplayInteger(job.targetLevel) }) + (finalTargetLevel > job.targetLevel ? t('craft.workbench.enhance-final-target', { level: formatDisplayInteger(finalTargetLevel) }) : '');
    }
    if (rate) {
      rate.textContent = formatEnhancementPercent(job.successRate);
    }
    if (metrics && metrics.length >= 3) {
      metrics[0].textContent = formatDisplayInteger(workRemainingTicks);
      metrics[1].textContent = t('craft.workbench.enhance-ticks', { ticks: formatDisplayInteger(workTotalTicks) });
      metrics[2].textContent = formatEnhancementPercent(job.successRate);
    }
    if (workFill) {
      workFill.style.width = `${workPercent.toFixed(2)}%`;
    }
    if (interruptProgress) {
      interruptProgress.classList.toggle('is-hidden', interruptRemainingTicks <= 0);
    }
    if (interruptLabel) {
      interruptLabel.textContent = formatTicks(interruptRemainingTicks);
    }
    if (interruptFill) {
      interruptFill.style.width = `${interruptPercent.toFixed(2)}%`;
    }
    if (sideMetrics.length >= 3) {
      sideMetrics[0].textContent = `+${formatDisplayInteger(job.targetLevel)}`;
      sideMetrics[1].textContent = `+${formatDisplayInteger(finalTargetLevel)}`;
      sideMetrics[2].textContent = job.protectionUsed ? `+${formatDisplayInteger(job.protectionStartLevel ?? job.targetLevel)} 起` : '未启用';
    }
    if (materialOwned) {
      materialOwned.textContent = t('craft.workbench.enhance-role-level', { level: formatDisplayInteger(job.roleEnhancementLevel), percent: formatEnhancementPercent(job.totalSpeedRate) });
    }
  }

  private getEnhancementJobPatchKey(job: NonNullable<NonNullable<S2C_EnhancementPanel['state']>['job']> | null): string {
    if (!job) {
      return 'empty';
    }
    return `${job.jobRunId ?? job.startedAt}:${job.targetItemId}:${job.currentLevel}:${job.targetLevel}:${job.desiredTargetLevel}:${job.totalTicks}`;
  }

  private renderEnhancementToolbar(): string {
    return `
      <div class="enhancement-toolbar-note" data-enhancement-toolbar-note="true">${escapeHtml(this.getEnhancementToolbarNoteText())}</div>
      <button class="small-btn ghost" type="button" data-craft-action="enhancement-refresh">刷新</button>
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
    return `<div class="enhancement-workbench-grid"><div class="enhancement-workbench-side">${this.renderEnhancementTargetSlot(null, null)}</div><div class="enhancement-workbench-main"><div class="enhancement-empty-state">请选择一件装备。</div></div></div>`;
  }

  private renderAlchemyBody(): string {
    return this.alchemyView.renderAlchemyBody();
  }

  private renderAlchemyCategoryTabs(): string {
    if (this.activeMode === 'forging') {
      const count = this.alchemyCatalog.filter((entry) => getAlchemyRealmTab(entry.outputLevel) === this.activeAlchemyRealm).length;
      return `
        <button class="alchemy-category-btn active" type="button" data-craft-action="alchemy-switch-category" data-category="special">
          ${escapeHtml(t('craft.workbench.alchemy.category.technique'))}
          <span class="alchemy-category-count">${formatDisplayInteger(count)}</span>
        </button>
      `;
    }
    const categories: Array<{ category: AlchemyRecipeCategory; label: string }> = [
      { category: 'recovery', label: t('craft.workbench.alchemy.category.recovery') },
      { category: 'buff', label: t('craft.workbench.alchemy.category.buff') },
      { category: 'special', label: t('craft.workbench.alchemy.category.special') },
    ];
    return categories.map((tab) => {
      const count = this.alchemyCatalog.filter((entry) => (
        entry.category === tab.category
        && getAlchemyRealmTab(entry.outputLevel) === this.activeAlchemyRealm
      )).length;
      return `
        <button class="alchemy-category-btn ${this.activeAlchemyCategory === tab.category ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-category" data-category="${tab.category}">
          ${escapeHtml(tab.label)}
          <span class="alchemy-category-count">${formatDisplayInteger(count)}</span>
        </button>
      `;
    }).join('');
  }

  private renderAlchemyRealmTabs(): string {
    const realms: Array<{ realm: AlchemyRealmTab; label: string }> = [
      { realm: 'mortal', label: t('craft.workbench.alchemy.realm.mortal') },
      { realm: 'qi', label: t('craft.workbench.alchemy.realm.qi') },
      { realm: 'foundation', label: t('craft.workbench.alchemy.realm.foundation') },
    ];
    return realms.map((tab) => {
      const count = this.alchemyCatalog.filter((entry) => getAlchemyRealmTab(entry.outputLevel) === tab.realm).length;
      return `
        <button class="alchemy-category-btn ${this.activeAlchemyRealm === tab.realm ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-realm" data-realm="${tab.realm}">
          ${escapeHtml(tab.label)}
          <span class="alchemy-category-count">${formatDisplayInteger(count)}</span>
        </button>
      `;
    }).join('');
  }

  private renderAlchemyRecipeItem(recipe: AlchemyRecipeCatalogEntry, active: boolean): string {
    return `
      <button class="alchemy-recipe-item ${active ? 'active' : ''}" type="button" data-craft-action="alchemy-select-recipe" data-recipe-id="${escapeHtml(recipe.recipeId)}">
        <span class="alchemy-recipe-head">
          <span class="alchemy-recipe-name">${this.renderAlchemyItemReference(recipe.outputItemId, recipe.outputName, 'reward')}</span>
          <span class="alchemy-level-badge">LV ${formatDisplayInteger(recipe.outputLevel)}</span>
        </span>
        <span class="alchemy-recipe-meta">${escapeHtml(this.buildAlchemyRecipeMetaText(recipe))}</span>
      </button>
    `;
  }

  private renderAlchemyJobCard(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']> | null): string {
    const isForging = this.activeMode === 'forging' || job?.jobType === 'forging';
    const activityName = isForging ? t('craft.workbench.mode.forging') : t('craft.workbench.mode.alchemy');
    const unit = isForging ? t('craft.workbench.unit.item') : t('craft.workbench.unit.pill');
    const successLabel = isForging ? t('craft.workbench.alchemy.metric.success.forging') : t('craft.workbench.alchemy.metric.success.alchemy');
    if (!job) {
      return `<section class="alchemy-job-card empty" data-alchemy-job-card="true" data-alchemy-job-key="empty"><div class="alchemy-job-title">${escapeHtml(t('craft.workbench.alchemy.job.title'))}</div><div class="alchemy-job-text">${escapeHtml(t('craft.workbench.alchemy.job.empty', { activityName }))}</div></section>`;
    }
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === job.recipeId) ?? null;
    const workRemainingTicks = resolveAlchemyWorkRemainingTicks(job);
    const workTotalTicks = resolveAlchemyWorkTotalTicks(job);
    const progressPercent = Math.max(0, Math.min(100, (1 - (workRemainingTicks / Math.max(1, workTotalTicks))) * 100));
    const interruptRemainingTicks = resolveAlchemyInterruptRemainingTicks(job);
    const interruptTotalTicks = resolveAlchemyInterruptTotalTicks(job, interruptRemainingTicks);
    const interruptPercent = Math.max(0, Math.min(100, (1 - (interruptRemainingTicks / Math.max(1, interruptTotalTicks))) * 100));
    const phaseClass = job.phase === 'paused' ? 'is-paused' : 'is-brewing';
    return `
      <section class="alchemy-job-card" data-alchemy-job-card="true" data-alchemy-job-key="${escapeHtml(this.getAlchemyJobPatchKey(job))}">
        <div class="alchemy-job-head">
          <div>
            <div class="alchemy-job-title">${escapeHtml(t('craft.workbench.alchemy.job.title'))}</div>
            <div class="alchemy-job-name">${this.renderAlchemyItemReference(job.outputItemId, recipe?.outputName?.trim() || UNKNOWN_ITEM_NAME, 'reward')}</div>
          </div>
          <div class="alchemy-job-metrics">
            <span class="alchemy-metric-chip alchemy-job-phase-chip ${phaseClass}">${escapeHtml(getAlchemyPhaseLabel(job.phase))}</span>
            <span class="alchemy-metric-chip">${escapeHtml(t('craft.workbench.alchemy.job.quantity', { quantity: formatDisplayInteger(job.quantity) }))}</span>
            <span class="alchemy-metric-chip">${escapeHtml(t('craft.workbench.alchemy.job.batch-output', { count: formatDisplayInteger(job.outputCount), unit }))}</span>
            <span class="alchemy-metric-chip">${escapeHtml(t('craft.workbench.alchemy.job.spirit-stone', { count: formatDisplayInteger(job.spiritStoneCost) }))}</span>
            <span class="alchemy-metric-chip">${successLabel} ${escapeHtml(formatRate(job.successRate))}</span>
          </div>
        </div>
        <div class="alchemy-job-progress">
          <div class="alchemy-job-progress-head">
            <span>${escapeHtml(t('craft.workbench.alchemy.job.progress'))}</span>
            <strong>${escapeHtml(t('craft.workbench.alchemy.job.progress-value', { completed: formatDisplayInteger(job.completedCount), quantity: formatDisplayInteger(job.quantity) }))}</strong>
          </div>
          <div class="alchemy-job-progress-bar">
            <div class="alchemy-job-progress-fill" data-alchemy-work-fill="true" style="width:${progressPercent.toFixed(2)}%"></div>
          </div>
        </div>
        <div class="alchemy-job-progress alchemy-job-progress--interrupt ${interruptRemainingTicks > 0 ? '' : 'is-hidden'}" data-alchemy-interrupt-progress="true">
          <div class="alchemy-job-progress-head">
            <span>打断等待</span>
            <strong data-alchemy-interrupt-label="true">${escapeHtml(formatTicks(interruptRemainingTicks))}</strong>
          </div>
          <div class="alchemy-job-progress-bar">
            <div class="alchemy-job-progress-fill" data-alchemy-interrupt-fill="true" style="width:${interruptPercent.toFixed(2)}%"></div>
          </div>
        </div>
        <div class="alchemy-job-meta">
          <span>${escapeHtml(t('craft.workbench.alchemy.job.remaining', { ticks: formatTicks(workRemainingTicks) }))}</span>
          <span>${escapeHtml(t('craft.workbench.alchemy.job.success-count', { count: formatDisplayInteger(job.successCount) }))}</span>
          <span>${escapeHtml(t('craft.workbench.alchemy.job.failure-count', { count: formatDisplayInteger(job.failureCount) }))}</span>
          <span>${escapeHtml(getAlchemyPhaseLabel(job.phase))}</span>
          <div class="alchemy-job-ingredient-flow">
            ${job.ingredients.map((ingredient) => {
              const ingredientMeta = recipe?.ingredients.find((entry) => entry.itemId === ingredient.itemId);
              return this.renderAlchemyItemReference(
                ingredient.itemId,
                ingredientMeta?.name?.trim() || UNKNOWN_ITEM_NAME,
                'material',
                ingredient.count,
              );
            }).join('')}
          </div>
        </div>
        <div class="alchemy-actions alchemy-actions--job">
          <button class="small-btn ghost" type="button" data-craft-action="cancel-alchemy">${escapeHtml(t('craft.workbench.alchemy.action.cancel-activity', { activityName }))}</button>
        </div>
      </section>
    `;
  }

  private renderAlchemyFullTab(recipe: AlchemyRecipeCatalogEntry): string {
    const metrics = this.buildAlchemyMetricSnapshot(recipe, 'full');
    const ingredients = this.getFullAlchemyIngredients(recipe.recipeId);
    const mainRoleLabel = this.activeMode === 'forging' ? '主材' : '主药';
    const auxRoleLabel = this.activeMode === 'forging' ? '辅材' : '辅药';
    const powerLabel = this.activeMode === 'forging' ? '单份契合' : '单份药力';
    return `
      <div class="alchemy-tab-stack">
        ${this.renderAlchemySummaryCard(recipe, 'full', metrics)}
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => `
            <div class="alchemy-ingredient-row" data-alchemy-ingredient-item-id="${escapeHtml(ingredient.itemId)}">
              <div class="alchemy-ingredient-main">
                <span class="alchemy-ingredient-role ${ingredient.role === 'main' ? 'main' : 'aux'}">${ingredient.role === 'main' ? mainRoleLabel : auxRoleLabel}</span>
                <span class="alchemy-ingredient-name">${this.renderAlchemyItemReference(ingredient.itemId, ingredient.name, 'material')}</span>
                <span class="alchemy-ingredient-owned" data-alchemy-owned="true">持有 ${formatDisplayInteger(this.getAlchemyInventoryCount(ingredient.itemId))}</span>
              </div>
              <div class="alchemy-ingredient-meta">
                <span>数量 ${formatDisplayInteger(ingredient.count)}</span>
                <span>${powerLabel} ${formatDisplayInteger(ingredient.powerPerUnit)}</span>
              </div>
            </div>
          `).join('')}
        </div>
        ${this.renderAlchemyActionSection(recipe, 'full', ingredients)}
      </div>
    `;
  }

  private renderAlchemySimpleTab(recipe: AlchemyRecipeCatalogEntry, presets: PlayerAlchemyPreset[]): string {
    const draftIngredients = this.getAlchemyDraftIngredients(recipe.recipeId);
    const exactRecipe = isExactAlchemyRecipe(recipe, draftIngredients);
    const metrics = this.buildAlchemyMetricSnapshot(recipe, 'simple');
    const selectedPreset = this.selectedAlchemyPresetId
      ? presets.find((preset) => preset.presetId === this.selectedAlchemyPresetId) ?? null
      : null;
    const mainRoleLabel = this.activeMode === 'forging' ? '主材' : '主药';
    const auxRoleLabel = this.activeMode === 'forging' ? '辅材' : '辅药';
    const emptyPresetText = this.activeMode === 'forging'
      ? '当前器物还没有保存的简易器方。'
      : '当前丹药还没有保存的简易丹方。';
    return `
      <div class="alchemy-tab-stack">
        ${this.renderAlchemySummaryCard(recipe, 'simple', metrics)}
        <div class="alchemy-preset-strip" data-alchemy-preset-strip="true">
          ${presets.length > 0
            ? presets.map((preset) => `
              <button
                class="alchemy-preset-chip ${this.selectedAlchemyPresetId === preset.presetId ? 'active' : ''}"
                type="button"
                data-craft-action="alchemy-select-preset"
                data-preset-id="${escapeHtml(preset.presetId)}">
                ${escapeHtml(preset.name)}
              </button>
            `).join('')
            : `<span class="alchemy-preset-empty">${emptyPresetText}</span>`}
        </div>
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => `
            <div class="alchemy-ingredient-row" data-alchemy-ingredient-item-id="${escapeHtml(ingredient.itemId)}">
              <div class="alchemy-ingredient-main">
                <span class="alchemy-ingredient-role ${ingredient.role === 'main' ? 'main' : 'aux'}">${ingredient.role === 'main' ? mainRoleLabel : auxRoleLabel}</span>
                <span class="alchemy-ingredient-name">${this.renderAlchemyItemReference(ingredient.itemId, ingredient.name, 'material')}</span>
                <span class="alchemy-ingredient-owned" data-alchemy-owned="true">持有 ${formatDisplayInteger(this.getAlchemyInventoryCount(ingredient.itemId))}</span>
              </div>
              <div class="alchemy-ingredient-editor">
                ${ingredient.role === 'main'
                  ? `<span class="alchemy-ingredient-lock">固定 ${escapeHtml(String(ingredient.count))}</span>`
                  : `
                    <button class="small-btn ghost" type="button" data-craft-action="alchemy-decrease-aux" data-item-id="${escapeHtml(ingredient.itemId)}">-</button>
                    <span class="alchemy-ingredient-count" data-alchemy-current-count="true">${formatDisplayInteger(draftIngredients.find((entry) => entry.itemId === ingredient.itemId)?.count ?? 0)} / ${formatDisplayInteger(ingredient.count)}</span>
                    <button class="small-btn ghost" type="button" data-craft-action="alchemy-increase-aux" data-item-id="${escapeHtml(ingredient.itemId)}">+</button>
                  `}
              </div>
            </div>
          `).join('')}
        </div>
        ${this.renderAlchemyActionSection(recipe, 'simple', draftIngredients, {
          exactRecipe,
          selectedPresetId: selectedPreset?.presetId,
          hasSelectedPreset: Boolean(selectedPreset),
        })}
      </div>
    `;
  }

  private renderAlchemySummaryCard(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    metrics: { powerText: string; successText: string; brewTimeText: string },
  ): string {
    const isForging = this.activeMode === 'forging';
    const recipeLabel = isForging
      ? (mode === 'simple' ? '简易器方' : '完整器方')
      : (mode === 'simple' ? '简易丹方' : '完整丹方');
    return `
      <div class="alchemy-summary-card" data-alchemy-summary-card="true">
        <div class="alchemy-summary-head">
          <div class="alchemy-summary-title">${this.renderAlchemyItemReference(recipe.outputItemId, recipe.outputName, 'reward')}</div>
          <span class="alchemy-summary-mode">${recipeLabel}</span>
        </div>
        <div class="alchemy-summary-metrics">
          <div class="alchemy-summary-metric alchemy-summary-metric--power">
            <span class="alchemy-summary-metric-label">${isForging ? '技艺契合度' : '药力百分比'}</span>
            <strong class="alchemy-summary-metric-value" data-alchemy-metric="power">${escapeHtml(metrics.powerText)}</strong>
          </div>
          <div class="alchemy-summary-metric alchemy-summary-metric--success">
            <span class="alchemy-summary-metric-label">${isForging ? '单件成器率' : '单枚成丹率'}</span>
            <strong class="alchemy-summary-metric-value" data-alchemy-metric="success">${escapeHtml(metrics.successText)}</strong>
          </div>
          <div class="alchemy-summary-metric alchemy-summary-metric--time">
            <span class="alchemy-summary-metric-label">单炉时间</span>
            <strong class="alchemy-summary-metric-value" data-alchemy-metric="time">${escapeHtml(metrics.brewTimeText)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  private renderAlchemyActionSection(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    ingredients: readonly AlchemyIngredientSelection[],
    options?: {
      exactRecipe?: boolean;
      selectedPresetId?: string;
      hasSelectedPreset?: boolean;
    },
  ): string {
    const isForging = this.activeMode === 'forging';
    const state = this.alchemyPanel?.state ?? null;
    const maxQuantity = this.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const spiritStoneCost = this.getAlchemySpiritStoneCost(recipe, 1);
    const batchBrewTicks = this.getAlchemyAdjustedBrewTicks(recipe, ingredients);
    const startDisabled = state?.job || maxQuantity <= 0;
    const fullStartLabel = isForging
      ? t('craft.workbench.alchemy.action.full-start.forging')
      : t('craft.workbench.alchemy.action.full-start.alchemy');
    const simpleTabLabel = isForging
      ? t('craft.workbench.alchemy.action.simple-tab.forging')
      : t('craft.workbench.alchemy.action.simple-tab.alchemy');
    const simpleStartLabel = isForging
      ? t('craft.workbench.alchemy.confirm.start', { modeLabel: t('craft.workbench.alchemy.confirm.mode.forging') })
      : t('craft.workbench.alchemy.confirm.start', { modeLabel: t('craft.workbench.alchemy.confirm.mode.alchemy') });
    const unit = isForging
      ? t('craft.workbench.alchemy.confirm.unit.forging')
      : t('craft.workbench.alchemy.confirm.unit.alchemy');
    return `
      <div class="alchemy-actions" data-alchemy-actions="true" data-tab-mode="${mode}">
        <div class="alchemy-action-buttons">
          ${mode === 'full'
            ? `<button class="small-btn" type="button" data-craft-action="alchemy-start-full"${startDisabled ? ' disabled' : ''}>${fullStartLabel}</button>
               <button class="small-btn ghost" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">${simpleTabLabel}</button>`
            : `<button class="small-btn" type="button" data-craft-action="alchemy-start-draft"${startDisabled ? ' disabled' : ''}>${simpleStartLabel}</button>
               ${isForging ? '' : `<button class="small-btn ghost" type="button" data-craft-action="alchemy-save-preset"> ${options?.hasSelectedPreset ? t('craft.workbench.alchemy.action.save-preset.overwrite') : t('craft.workbench.alchemy.action.save-preset.create')} </button>`}
               <button class="small-btn ghost" type="button" data-craft-action="alchemy-reset-draft">${escapeHtml(t('craft.workbench.alchemy.action.reset-draft'))}</button>
               ${!isForging && options?.selectedPresetId ? `<button class="small-btn danger" type="button" data-craft-action="alchemy-delete-preset" data-preset-id="${escapeHtml(options.selectedPresetId)}">${escapeHtml(t('craft.workbench.alchemy.action.delete-preset'))}</button>` : ''}`}
          ${mode === 'full'
            ? ''
            : ''}
          ${state?.job
            ? `<button class="small-btn ghost" type="button" data-craft-action="cancel-alchemy">${escapeHtml(t('craft.workbench.alchemy.action.cancel', {
              modeLabel: isForging
                ? t('craft.workbench.alchemy.confirm.mode.forging')
                : t('craft.workbench.alchemy.confirm.mode.alchemy'),
            }))}</button>`
            : ''}
        </div>
        <div class="alchemy-action-note">${escapeHtml(
          state?.job
            ? t('craft.workbench.alchemy.action.note.job-ready', {
              recipeKind: isForging
                ? t('craft.workbench.alchemy.confirm.recipe-kind.forging')
                : t('craft.workbench.alchemy.confirm.recipe-kind.alchemy'),
            })
            : maxQuantity > 0
              ? t('craft.workbench.alchemy.action.note.batch', {
                maxQuantity: formatDisplayInteger(maxQuantity),
                batchCount: formatDisplayInteger(this.getAlchemyBatchOutputCount(recipe)),
                unit,
              })
              : t('craft.workbench.alchemy.confirm.error.no-materials'),
        )}</div>
        ${options?.exactRecipe ? `<span class="alchemy-inline-note">${escapeHtml(t('craft.workbench.alchemy.action.note.exact', {
          recipeKind: isForging
            ? t('craft.workbench.alchemy.confirm.recipe-kind.forging')
            : t('craft.workbench.alchemy.confirm.recipe-kind.alchemy'),
        }))}</span>` : ''}
        <span class="alchemy-inline-note">${escapeHtml(t('craft.workbench.alchemy.action.note.single', {
          batchCount: formatDisplayInteger(this.getAlchemyBatchOutputCount(recipe)),
          unit,
          spiritStoneCost: formatDisplayInteger(spiritStoneCost),
          batchTime: formatTicks(batchBrewTicks),
        }))}</span>
      </div>
    `;
  }

  private renderAlchemyItemReference(
    itemId: string,
    label: string,
    tone: 'reward' | 'material',
    count?: number,
  ): string {
    const displayLabel = label.trim() && label !== itemId ? label : UNKNOWN_ITEM_NAME;
    return renderInlineItemChip(itemId, {
      label: displayLabel,
      tone,
      count,
    });
  }

  private renderEnhancementBody(): string {
    return this.enhancementView.renderEnhancementBody();
  }

  private renderEnhancementFormulaPill(): string {
    return `<button class="enhancement-formula-pill" type="button" data-enhancement-formula-tooltip="1">${escapeHtml(t('craft.workbench.enhancement.formula-pill'))}</button>`;
  }

  private renderEnhancementTargetSlot(
    activeJob: EnhancementJobView | null,
    selected: SyncedEnhancementCandidateView | null,
    extraContent = '',
  ): string {
    const selectedItem = activeJob
      ? buildBaseEnhancementPreviewItem(activeJob.item ?? {
        itemId: activeJob.targetItemId,
        name: activeJob.targetItemName,
        level: 1,
        enhanceLevel: activeJob.currentLevel,
      })
      : selected?.item ?? null;
    const sourceLabel = activeJob
      ? (activeJob.target.source === 'equipment'
        ? `队列锁定 · ${getEquipSlotLabel(activeJob.target.slot ?? 'weapon')}`
        : '队列锁定 · 背包物品')
      : selected
        ? (selected.ref.source === 'equipment'
          ? `已装备 · ${getEquipSlotLabel(selected.ref.slot ?? 'weapon')}`
          : '背包物品')
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

  private renderEnhancementWorkbench(
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
    const currentLines = describeEquipmentBonuses(currentPreview, this.playerRealmLv);
    const nextLines = describeEquipmentBonuses(nextPreview, this.playerRealmLv);
    const protectionNote = selected.protectionItemId
      ? `保护物固定为 ${selected.protectionItemName?.trim() || UNKNOWN_ITEM_NAME}`
      : '未配置独立保护物，当前仅可消耗同名装备作为保护';
    const minProtectionStartLevel = 2;
    const protectionStartLevel = this.getSelectedEnhancementProtectionStartLevel(selected);
    const compactMobileLayout = this.isCompactEnhancementLayout();
    const inlineProtectionExpanded = !compactMobileLayout || this.enhancementProtectionExpanded;
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
            <input type="radio" name="enhancement-protection" value="" ${this.selectedEnhancementProtectionKey ? '' : 'checked'}>
            <span>不使用保护</span>
          </label>
          ${selected.protectionCandidates.length > 0
            ? selected.protectionCandidates.map((entry) => {
              const key = buildEnhancementTargetKey(entry.ref);
              const sourceLabel = `背包物品 · 数量 ${entry.item.count}`;
              const displayName = getEnhancementDisplayName(entry.item);
              return `
                <label class="enhancement-protection-option">
                  <input type="radio" name="enhancement-protection" value="${escapeHtml(key)}" ${this.selectedEnhancementProtectionKey === key ? 'checked' : ''}>
                  <span>${escapeHtml(displayName)}</span>
                  <em>${escapeHtml(sourceLabel)}</em>
                </label>
              `;
            }).join('')
            : '<div class="enhancement-material-empty">当前背包没有可用保护物。</div>'}
          ${this.selectedEnhancementProtectionKey && selectedTargetLevel >= minProtectionStartLevel ? `
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
          ` : this.selectedEnhancementProtectionKey ? `
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
      <div class="enhancement-workbench-grid">
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
                <div class="enhancement-summary-title">${escapeHtml(getEnhancementDisplayName(selected.item))}</div>
                <div class="enhancement-summary-subtitle">当前 +${formatDisplayInteger(selected.currentLevel)} · 最终目标 +${formatDisplayInteger(selectedTargetLevel)}</div>
              </div>
              <div class="enhancement-summary-rate">首阶 ${formatEnhancementPercent(selected.successRate)}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric">
                <span>首阶灵石</span>
                <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>首阶耗时</span>
                <strong>${formatDisplayInteger(selected.durationTicks)} 息</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>保护模式</span>
                <strong>${selectedProtection ? '已启用' : '未启用'}</strong>
              </div>
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
      ...buildBaseEnhancementPreviewItem(job.item ?? {
        itemId: job.targetItemId,
        name: job.targetItemName,
        level: 1,
        enhanceLevel: job.currentLevel,
      }),
      enhanceLevel: job.currentLevel,
    };
    const resultPreview: ItemStack = {
      ...buildBaseEnhancementPreviewItem(job.item ?? {
        itemId: job.targetItemId,
        name: job.targetItemName,
        level: 1,
        enhanceLevel: job.currentLevel,
      }),
      enhanceLevel: job.targetLevel,
    };
    const currentLines = describeEquipmentBonuses(currentPreview, this.playerRealmLv);
    const resultLines = describeEquipmentBonuses(resultPreview, this.playerRealmLv);
    const displayTargetName = getItemDisplayName(currentPreview) || resolveClientDisplayToken(job.targetItemName);
    const finalTargetLevel = Math.max(job.targetLevel, job.desiredTargetLevel ?? job.targetLevel);
    const workRemainingTicks = resolveEnhancementWorkRemainingTicks(job);
    const workTotalTicks = resolveEnhancementWorkTotalTicks(job);
    const workPercent = Math.max(0, Math.min(100, (1 - (workRemainingTicks / Math.max(1, workTotalTicks))) * 100));
    const interruptRemainingTicks = resolveEnhancementInterruptRemainingTicks(job);
    const interruptTotalTicks = resolveEnhancementInterruptTotalTicks(job, interruptRemainingTicks);
    const interruptPercent = Math.max(0, Math.min(100, (1 - (interruptRemainingTicks / Math.max(1, interruptTotalTicks))) * 100));
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
                <div class="enhancement-summary-title">${escapeHtml(displayTargetName)}</div>
                <div class="enhancement-summary-subtitle">进行中：+${formatDisplayInteger(job.currentLevel)} → +${formatDisplayInteger(job.targetLevel)}${finalTargetLevel > job.targetLevel ? ` · 最终目标 +${formatDisplayInteger(finalTargetLevel)}` : ''}</div>
              </div>
              <div class="enhancement-summary-rate">${formatEnhancementPercent(job.successRate)}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric">
                <span>剩余</span>
                <strong>${formatDisplayInteger(workRemainingTicks)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>总时长</span>
                <strong>${formatDisplayInteger(workTotalTicks)} 息</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>本阶成功率</span>
                <strong>${formatEnhancementPercent(job.successRate)}</strong>
              </div>
            </div>
            <div class="alchemy-job-progress">
              <div class="alchemy-job-progress-head">
                <span>实际进度</span>
                <strong>${escapeHtml(formatTicks(workRemainingTicks))}</strong>
              </div>
              <div class="alchemy-job-progress-bar">
                <div class="alchemy-job-progress-fill" data-enhancement-work-fill="true" style="width:${workPercent.toFixed(2)}%"></div>
              </div>
            </div>
            <div class="alchemy-job-progress alchemy-job-progress--interrupt ${interruptRemainingTicks > 0 ? '' : 'is-hidden'}" data-enhancement-interrupt-progress="true">
              <div class="alchemy-job-progress-head">
                <span>打断等待</span>
                <strong data-enhancement-interrupt-label="true">${escapeHtml(formatTicks(interruptRemainingTicks))}</strong>
              </div>
              <div class="alchemy-job-progress-bar">
                <div class="alchemy-job-progress-fill" data-enhancement-interrupt-fill="true" style="width:${interruptPercent.toFixed(2)}%"></div>
              </div>
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
    const inlineHistoryExpanded = !compactMobileLayout || this.enhancementHistoryExpanded;
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
    const hammerSuccessRate = getEffectiveEnhancementToolSuccessRate(this.equipment.weapon, this.playerRealmLv);
    const levelRecords = new Map((displayRecord?.levels ?? []).map((entry) => [entry.targetLevel, entry] as const));
    const currentSessionRange = currentSessionRecord
      ? this.getEnhancementSessionHistoryDisplayRange(currentSessionRecord, activeJob?.targetLevel)
      : null;
    const minLevel = currentSessionRange?.minLevel ?? 1;
    const highestSeenLevel = currentSessionRange
      ? currentSessionRange.maxLevel
      : Math.max(
        normalizeEnhanceLevel(displayRecord?.highestLevel),
        normalizeEnhanceLevel(referenceItem.enhanceLevel) + 2,
        8,
      );
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
          <button class="small-btn ghost" type="button" data-enhancement-open-history="1">历史记录</button>
        </div>
        ${inlineHistoryExpanded ? `
          <div class="enhancement-history-table">
            <div class="enhancement-history-row enhancement-history-row--head">
              <span>目标</span>
              <span>成功率</span>
              <span>成功</span>
              <span>失败</span>
            </div>
            ${rows.join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private bindEnhancementEvents(body: HTMLElement, signal: AbortSignal): void {
    this.enhancementView.bindEnhancementEvents(body, signal);
  }


  private bindEnhancementFormulaTooltip(body: HTMLElement, signal?: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    body.querySelectorAll<HTMLElement>('[data-enhancement-formula-tooltip="1"]').forEach((node) => {
      if (node.dataset.enhancementFormulaTooltipBound === '1') {
        return;
      }
      node.dataset.enhancementFormulaTooltipBound = '1';
      const showTooltip = (clientX: number, clientY: number, pin = false): void => {
        const lines = getEnhancementFormulaTooltipLines();
        if (pin) {
          this.enhancementFormulaTooltip.showPinned(node, '强化规则', lines, clientX, clientY);
          return;
        }
        this.enhancementFormulaTooltip.show('强化规则', lines, clientX, clientY);
      };
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.enhancementFormulaTooltip.isPinnedTo(node)) {
          this.enhancementFormulaTooltip.hide(true);
          return;
        }
        showTooltip(event.clientX, event.clientY, true);
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, signal });
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.enhancementFormulaTooltip.isPinned()) {
          return;
        }
        showTooltip(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.enhancementFormulaTooltip.isPinned()) {
          return;
        }
        this.enhancementFormulaTooltip.move(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointerleave', () => {
        this.enhancementFormulaTooltip.hide();
      }, { signal });
    });
  }

  private ensureLocalEnhancementHistoryLoaded(): void {
    if (this.localEnhancementHistoryLoaded) {
      return;
    }
    this.localEnhancementHistoryLoaded = true;
    const result = readEnhancementHistoryFromStorage();
    if (!result) {
      return;
    }
    this.localEnhancementHistoryRecords = result.totals;
    this.localEnhancementHistorySessions = result.sessions;
    this.lastServerEnhancementSessionRecord = result.sessionRecord;
    if (result.migratedFromV1) {
      this.persistLocalEnhancementHistory();
    }
  }

  private persistLocalEnhancementHistory(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const payload: StoredEnhancementHistoryState = {
      version: 2,
      totals: [...this.localEnhancementHistoryRecords.values()]
        .map((entry) => cloneEnhancementRecord(entry))
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')),
      sessions: this.localEnhancementHistorySessions
        .map((entry) => cloneEnhancementRecord(entry))
        .sort((left, right) => (
          (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0)
          || right.itemId.localeCompare(left.itemId, 'zh-Hans-CN')
        )),
      sessionRecord: this.lastServerEnhancementSessionRecord ? cloneEnhancementRecord(this.lastServerEnhancementSessionRecord) : null,
    };
    try {
      window.localStorage.setItem(ENHANCEMENT_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) { console.warn('[CraftWorkbench] localStorage write failed:', e); }
  }

  private mergeServerEnhancementSessionRecord(records: PlayerEnhancementRecord[]): void {
    const serverRecord = normalizeEnhancementRecordList(records)[0] ?? null;
    if (!serverRecord) {
      this.lastServerEnhancementSessionRecord = null;
      this.persistLocalEnhancementHistory();
      return;
    }
    const previousSession = this.lastServerEnhancementSessionRecord;
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
      const persisted = this.localEnhancementHistoryRecords.get(serverRecord.itemId) ?? {
        itemId: serverRecord.itemId,
        highestLevel: 0,
        levels: [],
      };
      this.applyEnhancementDeltaRecord(persisted, deltaRecord, serverRecord.highestLevel);
      this.localEnhancementHistoryRecords.set(serverRecord.itemId, cloneEnhancementRecord(persisted));
    }
    this.lastServerEnhancementSessionRecord = cloneEnhancementRecord(serverRecord);
    this.persistLocalEnhancementHistory();
  }

  private isNonDecreasingEnhancementSessionSnapshot(previous: PlayerEnhancementRecord, current: PlayerEnhancementRecord): boolean {
    if (normalizeEnhanceLevel(current.highestLevel) < normalizeEnhanceLevel(previous.highestLevel)) {
      return false;
    }
    const currentLevels = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      current.levels.map((entry) => [entry.targetLevel, entry]),
    );
    return previous.levels.every((entry) => {
      const next = currentLevels.get(entry.targetLevel);
      return Boolean(next && next.successCount >= entry.successCount && next.failureCount >= entry.failureCount);
    });
  }

  private computeEnhancementSessionDelta(previous: PlayerEnhancementRecord, current: PlayerEnhancementRecord): PlayerEnhancementRecord {
    const previousLevels = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      previous.levels.map((entry) => [entry.targetLevel, entry]),
    );
    return {
      itemId: current.itemId,
      highestLevel: Math.max(0, normalizeEnhanceLevel(current.highestLevel) - normalizeEnhanceLevel(previous.highestLevel)),
      levels: current.levels
        .map((entry) => {
          const last = previousLevels.get(entry.targetLevel);
          return {
            targetLevel: entry.targetLevel,
            successCount: Math.max(0, entry.successCount - (last?.successCount ?? 0)),
            failureCount: Math.max(0, entry.failureCount - (last?.failureCount ?? 0)),
          };
        })
        .filter((entry) => entry.successCount > 0 || entry.failureCount > 0),
      actionStartedAt: current.actionStartedAt,
      actionEndedAt: current.actionEndedAt,
      startLevel: current.startLevel,
      initialTargetLevel: current.initialTargetLevel,
      desiredTargetLevel: current.desiredTargetLevel,
      protectionStartLevel: current.protectionStartLevel,
      status: current.status,
    };
  }

  private applyEnhancementDeltaRecord(target: PlayerEnhancementRecord, delta: PlayerEnhancementRecord, latestHighestLevel: number): void {
    target.highestLevel = Math.max(normalizeEnhanceLevel(target.highestLevel), normalizeEnhanceLevel(latestHighestLevel));
    const levelMap = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      target.levels.map((entry) => [entry.targetLevel, { ...entry }]),
    );
    for (const entry of delta.levels) {
      const current = levelMap.get(entry.targetLevel) ?? { targetLevel: entry.targetLevel, successCount: 0, failureCount: 0 };
      current.successCount += Math.max(0, entry.successCount);
      current.failureCount += Math.max(0, entry.failureCount);
      levelMap.set(entry.targetLevel, current);
    }
    target.levels = [...levelMap.values()].sort((left, right) => left.targetLevel - right.targetLevel);
  }

  private upsertLocalEnhancementHistorySession(record: PlayerEnhancementRecord): void {
    if (!isEnhancementHistorySessionRecord(record)) {
      return;
    }
    const next = cloneEnhancementRecord(record);
    const sessionKey = getEnhancementHistorySessionKey(next);
    const currentIndex = this.localEnhancementHistorySessions.findIndex((entry) => getEnhancementHistorySessionKey(entry) === sessionKey);
    if (currentIndex >= 0) {
      this.localEnhancementHistorySessions[currentIndex] = next;
    } else {
      this.localEnhancementHistorySessions.push(next);
    }
    this.localEnhancementHistorySessions.sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0));
  }

  private getEnhancementDisplayRecord(itemId: string, serverRecord: PlayerEnhancementRecord | null): PlayerEnhancementRecord | null {
    const localRecord = this.localEnhancementHistoryRecords.get(itemId);
    if (!localRecord && !serverRecord) {
      return null;
    }
    if (!localRecord) {
      return serverRecord ? cloneEnhancementRecord(serverRecord) : null;
    }
    if (!serverRecord) {
      return cloneEnhancementRecord(localRecord);
    }
    const merged = cloneEnhancementRecord(localRecord);
    merged.highestLevel = Math.max(merged.highestLevel, normalizeEnhanceLevel(serverRecord.highestLevel));
    const levelMap = new Map<number, PlayerEnhancementRecord['levels'][number]>(
      merged.levels.map((entry) => [entry.targetLevel, { ...entry }]),
    );
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
    if (!referenceItem || !record || !isEnhancementHistorySessionRecord(record)) {
      return null;
    }
    if (record.itemId !== referenceItem.itemId) {
      return null;
    }
    if (activeJob && record.itemId === activeJob.targetItemId) {
      return cloneEnhancementRecord(record);
    }
    if (record.status === 'in_progress') {
      return cloneEnhancementRecord(record);
    }
    return null;
  }

  private getEnhancementSessionHistoryDisplayRange(record: PlayerEnhancementRecord, currentTargetLevel?: number): { minLevel: number; maxLevel: number } {
    const startLevel = normalizeEnhanceLevel(record.startLevel);
    const initialTargetLevel = Math.max(startLevel + 1, Math.floor(Number(record.initialTargetLevel) || (startLevel + 1)));
    const attemptedLevels = (record.levels ?? [])
      .map((entry) => Math.max(1, Math.floor(Number(entry.targetLevel) || 1)))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
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
      [...this.localEnhancementHistoryRecords.values()].map((entry) => [entry.itemId, cloneEnhancementRecord(entry)] as const),
    );
    for (const session of this.localEnhancementHistorySessions) {
      const current = recordsByItem.get(session.itemId) ?? { itemId: session.itemId, highestLevel: 0, levels: [] };
      current.highestLevel = Math.max(
        normalizeEnhanceLevel(current.highestLevel),
        normalizeEnhanceLevel(session.highestLevel),
        normalizeEnhanceLevel(session.startLevel),
      );
      if (!this.localEnhancementHistoryRecords.has(session.itemId) && session.levels.length > 0) {
        this.applyEnhancementDeltaRecord(current, session, session.highestLevel);
      }
      recordsByItem.set(session.itemId, current);
    }
    return [...recordsByItem.values()].sort((left, right) => {
      const highestDelta = normalizeEnhanceLevel(right.highestLevel) - normalizeEnhanceLevel(left.highestLevel);
      if (highestDelta !== 0) {
        return highestDelta;
      }
      const attemptsDelta = this.getEnhancementHistoryAttemptCount(right) - this.getEnhancementHistoryAttemptCount(left);
      if (attemptsDelta !== 0) {
        return attemptsDelta;
      }
      return this.getEnhancementHistoryItemName(left.itemId).localeCompare(this.getEnhancementHistoryItemName(right.itemId), 'zh-Hans-CN');
    });
  }

  private getEnhancementHistoryItemName(itemId: string): string {
    return getLocalItemTemplate(itemId)?.name ?? UNKNOWN_ITEM_NAME;
  }

  private getEnhancementHistoryItemLevel(itemId: string): number {
    return Math.max(1, Math.floor(Number(getLocalItemTemplate(itemId)?.level) || 1));
  }

  private getEnhancementHistoryAttemptCount(record: PlayerEnhancementRecord): number {
    return (record.levels ?? []).reduce(
      (total, entry) => total + Math.max(0, entry.successCount) + Math.max(0, entry.failureCount),
      0,
    );
  }

  private getEnhancementHistorySessionsByItem(itemId: string): PlayerEnhancementRecord[] {
    return this.localEnhancementHistorySessions
      .filter((entry) => entry.itemId === itemId)
      .map((entry) => cloneEnhancementRecord(entry))
      .sort((left, right) => (
        (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0)
        || (right.actionEndedAt ?? 0) - (left.actionEndedAt ?? 0)
      ));
  }

  private getEnhancementHistorySessionStatusLabel(record: PlayerEnhancementRecord): string {
    return formatEnhancementRecordStatus(record.status);
  }

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

  private refreshOpenEnhancementHistoryModal(): void {
    if (confirmModalHost.isOpenFor(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-detail`)) {
      if (this.activeEnhancementHistoryItemId && this.activeEnhancementHistorySessionKey) {
        this.openEnhancementHistoryDetailModal(this.activeEnhancementHistoryItemId, this.activeEnhancementHistorySessionKey);
      }
      return;
    }
    if (confirmModalHost.isOpenFor(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-session`)) {
      if (this.activeEnhancementHistoryItemId) {
        this.openEnhancementHistorySessionModal(this.activeEnhancementHistoryItemId);
      }
      return;
    }
    if (confirmModalHost.isOpenFor(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-list`)) {
      this.openEnhancementHistoryListModal();
    }
  }

  private openEnhancementHistoryListModal(): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.activeEnhancementHistoryItemId = null;
    this.activeEnhancementHistorySessionKey = null;
    const records = this.getSortedLocalEnhancementHistoryRecords();
    confirmModalHost.open({
      ownerId: `${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-list`,
      title: t('craft.workbench.enhancement.history.list.title'),
      subtitle: t('craft.workbench.enhancement.history.list.subtitle'),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      bodyHtml: records.length > 0
        ? `
          <div class="enhancement-history-list-modal">
            ${records.map((record) => {
              const itemName = this.getEnhancementHistoryItemName(record.itemId);
              const itemLevel = this.getEnhancementHistoryItemLevel(record.itemId);
              const attemptCount = this.getEnhancementHistoryAttemptCount(record);
              return `
                <button class="enhancement-history-entry" type="button" data-enhancement-history-item="${escapeHtml(record.itemId)}">
                  <span class="enhancement-history-entry-title">${escapeHtml(itemName)}</span>
                  <span class="enhancement-history-entry-meta">${escapeHtml(t('craft.workbench.enhancement.history.list.entry-meta', {
                    level: formatDisplayInteger(itemLevel),
                    highestLevel: formatDisplayInteger(record.highestLevel),
                    attemptCount: formatDisplayInteger(attemptCount),
                  }))}</span>
                </button>
              `;
            }).join('')}
          </div>
        `
        : `<div class="enhancement-empty-state enhancement-empty-state--picker">${escapeHtml(t('craft.workbench.enhancement.history.list.empty'))}</div>`,
    });
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    modalBody?.querySelectorAll<HTMLElement>('[data-enhancement-history-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.enhancementHistoryItem ?? '';
        if (itemId) {
          this.openEnhancementHistorySessionModal(itemId);
        }
      });
    });
  }

  private openEnhancementHistorySessionModal(itemId: string): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.activeEnhancementHistoryItemId = itemId;
    this.activeEnhancementHistorySessionKey = null;
    const itemName = this.getEnhancementHistoryItemName(itemId);
    const sessions = this.getEnhancementHistorySessionsByItem(itemId);
    confirmModalHost.open({
      ownerId: `${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-session`,
      title: t('craft.workbench.enhancement.history.session.title'),
      subtitle: t('craft.workbench.enhancement.history.session.subtitle', { itemName }),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      onClose: () => {
        this.openEnhancementHistoryListModal();
      },
      bodyHtml: sessions.length > 0
        ? `
          <div class="enhancement-history-list-modal enhancement-history-list-modal--sessions">
            ${sessions.map((record) => {
              const startedAtLabel = t('craft.workbench.enhancement.history.session.started-at', {
                startedAt: formatHistoryDateTime(record.actionStartedAt),
              });
              const endedAtLabel = record.actionEndedAt
                ? t('craft.workbench.enhancement.history.session.ended-at', {
                  endedAt: formatHistoryDateTime(record.actionEndedAt),
                })
                : t('craft.workbench.enhancement.history.session.ended-at-empty');
              const attemptCount = this.getEnhancementHistoryAttemptCount(record);
              const sessionKey = getEnhancementHistorySessionKey(record);
              return `
                <button class="enhancement-history-entry" type="button" data-enhancement-history-session="${escapeHtml(sessionKey)}">
                  <span class="enhancement-history-entry-title">${escapeHtml(startedAtLabel)}</span>
                  <span class="enhancement-history-entry-meta">${escapeHtml(this.getEnhancementHistorySessionTargetSummary(record))}</span>
                  <span class="enhancement-history-entry-meta enhancement-history-entry-meta--secondary">${escapeHtml(t('craft.workbench.enhancement.history.session.status-meta', {
                    highestLevel: formatDisplayInteger(record.highestLevel),
                    attemptCount: formatDisplayInteger(attemptCount),
                    status: this.getEnhancementHistorySessionStatusLabel(record),
                    endedAt: endedAtLabel,
                  }))}</span>
                </button>
              `;
            }).join('')}
          </div>
        `
        : `<div class="enhancement-empty-state enhancement-empty-state--picker">${escapeHtml(t('craft.workbench.enhancement.history.session.empty'))}</div>`,
    });
    const modalBody = document.querySelector<HTMLElement>('.confirm-modal-body');
    modalBody?.querySelectorAll<HTMLElement>('[data-enhancement-history-session]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionKey = button.dataset.enhancementHistorySession ?? '';
        if (sessionKey) {
          this.openEnhancementHistoryDetailModal(itemId, sessionKey);
        }
      });
    });
  }

  private openEnhancementHistoryDetailModal(itemId: string, sessionKey: string): void {
    this.ensureLocalEnhancementHistoryLoaded();
    this.activeEnhancementHistoryItemId = itemId;
    this.activeEnhancementHistorySessionKey = sessionKey;
    const record = this.getEnhancementHistorySessionsByItem(itemId).find((entry) => getEnhancementHistorySessionKey(entry) === sessionKey);
    if (!record) {
      return;
    }
    const detailRecord = cloneEnhancementRecord(record);
    const itemName = this.getEnhancementHistoryItemName(itemId);
    const itemLevel = this.getEnhancementHistoryItemLevel(itemId);
    const levelMap = new Map(detailRecord.levels.map((entry) => [entry.targetLevel, entry] as const));
    const sessionRange = this.getEnhancementSessionHistoryDisplayRange(detailRecord);
    const roleEnhancementLevel = Math.max(1, this.getEnhancementPanelState()?.enhancementSkillLevel ?? 1);
    const hammerSuccessRate = getEffectiveEnhancementToolSuccessRate(this.equipment.weapon, this.playerRealmLv);
    const rows: string[] = [];
    for (let level = sessionRange.minLevel; level <= sessionRange.maxLevel; level += 1) {
      const current = levelMap.get(level);
      rows.push(`
        <div class="enhancement-history-row">
          <span>+${formatDisplayInteger(level)}</span>
          <span>${formatEnhancementPercent(computeEnhancementAdjustedSuccessRate(level, roleEnhancementLevel, itemLevel, hammerSuccessRate))}</span>
          <span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.success-value', {
            count: formatDisplayInteger(current?.successCount ?? 0),
          }))}</span>
          <span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.failure-value', {
            count: formatDisplayInteger(current?.failureCount ?? 0),
          }))}</span>
        </div>
      `);
    }
    const endedAtText = detailRecord.actionEndedAt
      ? t('craft.workbench.enhancement.history.session.ended-at', {
        endedAt: formatHistoryDateTime(detailRecord.actionEndedAt),
      })
      : t('craft.workbench.enhancement.history.session.ended-at-empty');
    const protectionText = typeof detailRecord.protectionStartLevel === 'number'
      ? t('craft.workbench.enhancement.history.detail.protection-enabled', {
        level: formatDisplayInteger(detailRecord.protectionStartLevel),
      })
      : t('craft.workbench.enhancement.history.detail.protection-disabled');
    confirmModalHost.open({
      ownerId: `${CraftWorkbenchModal.MODAL_OWNER}:enhancement-history-detail`,
      title: t('craft.workbench.enhancement.history.detail.title'),
      subtitle: t('craft.workbench.enhancement.history.detail.subtitle', {
        itemName,
        startedAt: formatHistoryDateTime(detailRecord.actionStartedAt),
      }),
      confirmLabel: t('craft.workbench.modal.close'),
      cancelLabel: t('craft.workbench.modal.back'),
      onClose: () => {
        this.openEnhancementHistorySessionModal(itemId);
      },
      bodyHtml: `
        <div class="enhancement-history-detail">
          <div class="enhancement-history-detail-note">${escapeHtml(t('craft.workbench.enhancement.history.detail.summary', {
            sessionSummary: this.getEnhancementHistorySessionTargetSummary(detailRecord),
            highestLevel: formatDisplayInteger(detailRecord.highestLevel),
            status: this.getEnhancementHistorySessionStatusLabel(detailRecord),
            endedAt: endedAtText,
            protection: protectionText,
          }))}</div>
          <div class="enhancement-history-detail-note">${escapeHtml(t('craft.workbench.enhancement.history.detail.note', {
            level: formatDisplayInteger(roleEnhancementLevel),
          }))}</div>
          <div class="enhancement-history-table enhancement-history-table--modal">
            <div class="enhancement-history-row enhancement-history-row--head">
              <span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.target'))}</span>
              <span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.success-rate'))}</span>
              <span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.success'))}</span>
              <span>${escapeHtml(t('craft.workbench.enhancement.history.detail.row.failure'))}</span>
            </div>
            ${rows.join('')}
          </div>
        </div>
      `,
    });
  }

  private openEnhancementPickerModal(): void {
    const candidates = this.getEnhancementPanelState()?.candidates ?? [];
    confirmModalHost.open({
      ownerId: `${CraftWorkbenchModal.MODAL_OWNER}:enhancement-picker`,
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
                ? t('craft.workbench.enhancement.picker.source.equipped', {
                  slot: getEquipSlotLabel(entry.ref.slot ?? 'weapon'),
                })
                : '背包物品';
              const displayName = getEnhancementDisplayName(entry.item);
              const nameClass = getItemNameClass(displayName);
              const itemTypeLabel = entry.item.type ? getItemTypeLabel(entry.item.type) : t('craft.workbench.enhancement.picker.type.equipment');
              return `
                <button
                  class="${getItemDecorClassName(`inventory-cell enhancement-picker-cell${this.selectedEnhancementTargetKey === key ? ' active' : ''}`, buildBaseEnhancementPreviewItem(entry.item))}"
                  type="button"
                  data-enhancement-picker-target="${escapeHtml(key)}"
                >
                  <div class="inventory-cell-head">
                    <span class="inventory-cell-type">${escapeHtml(getItemAffixTypeLabel(itemMeta.displayItem, itemTypeLabel))}</span>
                    <span class="inventory-cell-count">x${formatDisplayInteger(entry.item.count ?? 1)}</span>
                  </div>
                  <div class="inventory-cell-name ${nameClass}">${escapeHtml(displayName)}</div>
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
        this.selectedEnhancementTargetKey = button.dataset.enhancementPickerTarget ?? null;
        const selected = this.getSelectedEnhancementCandidate();
        this.selectedEnhancementTargetLevel = selected ? selected.currentLevel + 1 : null;
        this.selectedEnhancementProtectionKey = null;
        this.selectedEnhancementProtectionStartLevel = null;
        this.ensureEnhancementSelection();
        confirmModalHost.close(`${CraftWorkbenchModal.MODAL_OWNER}:enhancement-picker`);
        this.render();
      });
    });
  }

  private getAlchemyRecipePresets(recipeId: string): PlayerAlchemyPreset[] {
    return (this.alchemyPanel?.state?.presets ?? []).filter((preset) => preset.recipeId === recipeId);
  }

  private getFullAlchemyIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    return recipe.ingredients.map((ingredient) => ({
      itemId: ingredient.itemId,
      count: ingredient.count,
    }));
  }

  private getAlchemyDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    const draft = this.draftByRecipeId.get(recipeId);
    if (!draft) {
      return this.getFullAlchemyIngredients(recipeId);
    }
    const result: AlchemyIngredientSelection[] = [];
    for (const ingredient of recipe.ingredients) {
      const count = draft.get(ingredient.itemId) ?? 0;
      if (count > 0) {
        result.push({ itemId: ingredient.itemId, count });
      }
    }
    return result;
  }

  private setAlchemyDraft(recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    const next = new Map<string, number>();
    const source = buildAlchemyIngredientCountMap(ingredients);
    for (const ingredient of recipe.ingredients) {
      next.set(
        ingredient.itemId,
        ingredient.role === 'main'
          ? ingredient.count
          : Math.max(0, Math.min(ingredient.count, source.get(ingredient.itemId) ?? 0)),
      );
    }
    this.draftByRecipeId.set(recipeId, next);
  }

  private adjustAlchemyAuxCount(recipeId: string, itemId: string, delta: number): void {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    const ingredient = recipe.ingredients.find((entry) => entry.itemId === itemId && entry.role === 'aux');
    if (!ingredient) {
      return;
    }
    const draft = this.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
    const current = draft.get(itemId) ?? 0;
    draft.set(itemId, Math.max(0, Math.min(ingredient.count, current + delta)));
    this.draftByRecipeId.set(recipeId, draft);
  }

  private getAlchemyInventoryCount(itemId: string): number {
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private getAlchemySpiritStoneOwnedCount(): number {
    return this.getAlchemyInventoryCount('spirit_stone');
  }

  private getAlchemyFurnaceBonuses(): { successRate: number; speedRate: number } {
    const expectedTag = this.activeMode === 'forging' ? 'forging_tool' : 'alchemy_furnace';
    const tags = this.equipment.weapon?.tags ?? [];
    if (!tags.includes(expectedTag)) {
      return { successRate: 0, speedRate: 0 };
    }
    return {
      successRate: Number.isFinite(this.equipment.weapon?.alchemySuccessRate) ? Number(this.equipment.weapon?.alchemySuccessRate) : 0,
      speedRate: Number.isFinite(this.equipment.weapon?.alchemySpeedRate) ? Number(this.equipment.weapon?.alchemySpeedRate) : 0,
    };
  }

  private getAlchemyBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    if (this.activeMode === 'forging') {
      return 1;
    }
    return recipe.category === 'buff' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
  }

  private getAlchemyBatchOutputCount(recipe: AlchemyRecipeCatalogEntry): number {
    return computeAlchemyBatchOutputCountWithSize(recipe.outputCount, this.getAlchemyBatchOutputSize(recipe));
  }

  private getAlchemySpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, recipe.category === 'buff') * normalizeAlchemyQuantity(quantity);
  }

  private getCraftSkillLevelForActiveMode(): number {
    if (this.activeMode === 'forging') {
      return this.forgingSkillLevel;
    }
    return this.alchemySkillLevel;
  }

  private getAlchemyAdjustedBrewTicks(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const furnaceBonuses = this.getAlchemyFurnaceBonuses();
    return computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      this.getCraftSkillLevelForActiveMode(),
      furnaceBonuses.speedRate,
      this.getAlchemyBatchOutputSize(recipe),
    );
  }

  private buildAlchemyRecipeMetaText(recipe: AlchemyRecipeCatalogEntry): string {
    const simpleCount = this.getAlchemyRecipePresets(recipe.recipeId).length;
    const unit = this.activeMode === 'forging' ? '件' : '枚';
    const presetLabel = this.activeMode === 'forging' ? '器方' : '简方';
    const presetText = this.activeMode === 'forging' ? presetLabel : `${presetLabel} ${simpleCount}`;
    return t('craft.workbench.alchemy-recipe-meta', { count: String(this.getAlchemyBatchOutputCount(recipe)), unit, ticks: String(recipe.baseBrewTicks), presetText });
  }

  private buildAlchemyMetricSnapshot(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
  ): { powerText: string; successText: string; brewTimeText: string } {
    const ingredients = mode === 'full' ? this.getFullAlchemyIngredients(recipe.recipeId) : this.getAlchemyDraftIngredients(recipe.recipeId);
    const powerRatio = mode === 'full' ? 1 : computeAlchemyPowerRatio(recipe, ingredients);
    const baseSuccessRate = mode === 'full' ? 1 : computeAlchemySuccessRate(recipe, ingredients);
    const furnaceBonuses = this.getAlchemyFurnaceBonuses();
    const successRate = computeAlchemyAdjustedSuccessRate(
      baseSuccessRate,
      recipe.outputLevel,
      this.getCraftSkillLevelForActiveMode(),
      furnaceBonuses.successRate,
    );
    const brewTicks = this.getAlchemyAdjustedBrewTicks(recipe, ingredients);
    return {
      powerText: formatRate(powerRatio),
      successText: formatRate(successRate),
      brewTimeText: `${brewTicks} 息`,
    };
  }

  private getAlchemyMaxCraftQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const ingredientCaps = ingredients
      .map((ingredient) => {
        if (ingredient.count <= 0) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.floor(this.getAlchemyInventoryCount(ingredient.itemId) / ingredient.count);
      })
      .filter((cap) => Number.isFinite(cap));
    const spiritStonePerBatch = this.getAlchemySpiritStoneCost(recipe, 1);
    const spiritStoneCap = spiritStonePerBatch > 0
      ? Math.floor(this.getAlchemySpiritStoneOwnedCount() / spiritStonePerBatch)
      : Number.POSITIVE_INFINITY;
    const maxQuantity = Math.min(
      spiritStoneCap,
      ...(ingredientCaps.length > 0 ? ingredientCaps : [0]),
    );
    return Math.max(0, Number.isFinite(maxQuantity) ? maxQuantity : 0);
  }

  private getAlchemySelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const maxQuantity = this.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const current = normalizeAlchemyQuantity(this.quantityByRecipeId.get(recipe.recipeId));
    const next = maxQuantity > 0 ? Math.min(current, maxQuantity) : 1;
    this.quantityByRecipeId.set(recipe.recipeId, next);
    return next;
  }

  private setAlchemySelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
    next: number,
  ): void {
    const maxQuantity = this.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const normalized = maxQuantity > 0
      ? Math.max(1, Math.min(maxQuantity, normalizeAlchemyQuantity(next)))
      : 1;
    this.quantityByRecipeId.set(recipe.recipeId, normalized);
  }

  private openAlchemyConfirm(
    recipeId: string,
    ingredients: readonly AlchemyIngredientSelection[],
    mode: AlchemyTab,
  ): void {
    this.confirmStartRequest = {
      recipeId,
      ingredients: cloneAlchemyIngredients(ingredients),
      mode,
    };
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (recipe) {
      this.confirmQuantityDraft = String(this.getAlchemySelectedQuantity(recipe, ingredients));
    }
    this.syncAlchemyConfirmModal();
  }

  private parseAlchemyConfirmQuantity(): number | null {
    if (!this.confirmQuantityDraft || !/^\d+$/.test(this.confirmQuantityDraft)) {
      return null;
    }
    const quantity = Number(this.confirmQuantityDraft);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

  private buildAlchemyConfirmState(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): {
    quantity: number | null;
    maxQuantity: number;
    batchBrewTicks: number;
    totalTicks: number | null;
    spiritStoneCost: number | null;
    errorText: string | null;
    startDisabled: boolean;
  } {
    const quantity = this.parseAlchemyConfirmQuantity();
    const maxQuantity = this.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const batchBrewTicks = this.getAlchemyAdjustedBrewTicks(recipe, ingredients);
    const totalTicks = quantity === null
      ? null
      : computeAlchemyTotalJobTicks(batchBrewTicks, quantity, 0);
    const spiritStoneCost = quantity === null
      ? null
      : this.getAlchemySpiritStoneCost(recipe, quantity);
    const errorText = maxQuantity <= 0
      ? t('craft.workbench.alchemy.confirm.error.no-materials')
      : quantity === null
        ? t('craft.workbench.alchemy.confirm.error.invalid-quantity')
        : quantity > maxQuantity
          ? t('craft.workbench.alchemy.confirm.error.exceed-max', {
            maxQuantity: formatDisplayInteger(maxQuantity),
          })
          : null;
    return {
      quantity,
      maxQuantity,
      batchBrewTicks,
      totalTicks,
      spiritStoneCost,
      errorText,
      startDisabled: Boolean(errorText),
    };
  }

  private renderAlchemyConfirmBody(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    state: ReturnType<CraftWorkbenchModal['buildAlchemyConfirmState']>,
  ): string {
    const isForging = this.activeMode === 'forging';
    const itemLabel = isForging
      ? t('craft.workbench.alchemy.confirm.item-kind.forging')
      : t('craft.workbench.alchemy.confirm.item-kind.alchemy');
    const recipeLabel = isForging
      ? (mode === 'full'
        ? t('craft.workbench.alchemy.confirm.recipe-label.full.forging')
        : t('craft.workbench.alchemy.confirm.recipe-label.simple.forging'))
      : (mode === 'full'
        ? t('craft.workbench.alchemy.confirm.recipe-label.full.alchemy')
        : t('craft.workbench.alchemy.confirm.recipe-label.simple.alchemy'));
    const unit = isForging
      ? t('craft.workbench.alchemy.confirm.unit.forging')
      : t('craft.workbench.alchemy.confirm.unit.alchemy');
    return `
      <div class="alchemy-confirm-shell">
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>${itemLabel}</span>
            <div class="market-price-display">
              <strong>${escapeHtml(recipe.outputName)}</strong>
              <span>${escapeHtml(t('craft.workbench.alchemy.confirm.recipe-summary', {
                recipeLabel,
                batchCount: formatDisplayInteger(this.getAlchemyBatchOutputCount(recipe)),
                unit,
              }))}</span>
            </div>
          </div>
        </div>
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>${escapeHtml(t('craft.workbench.alchemy.confirm.quantity-label'))}</span>
            <div class="market-quantity-row">
              <button class="small-btn ghost" data-alchemy-confirm-quick-qty="1" type="button">${escapeHtml(t('craft.workbench.alchemy.confirm.quick.one'))}</button>
              <input
                class="gm-inline-input"
                data-alchemy-confirm-quantity="true"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                value="${escapeHtml(this.confirmQuantityDraft || '1')}"
              />
              <button
                class="small-btn ghost"
                data-alchemy-confirm-quick-qty-max="true"
                data-alchemy-confirm-quick-qty="${Math.max(1, state.maxQuantity)}"
                type="button"
                ${state.maxQuantity <= 0 ? 'disabled' : ''}>${escapeHtml(t('craft.workbench.alchemy.confirm.quick.max'))}</button>
            </div>
          </div>
          <div class="market-trade-dialog-total ${state.errorText ? 'error' : ''}">
            <span>${escapeHtml(t('craft.workbench.alchemy.confirm.total-spirit-stone'))}</span>
            <strong data-alchemy-confirm-total-cost="true">${escapeHtml(t('craft.workbench.alchemy.confirm.total-spirit-stone-value', {
              cost: state.spiritStoneCost === null ? '--' : formatDisplayInteger(state.spiritStoneCost),
            }))}</strong>
          </div>
        </div>
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>${escapeHtml(t('craft.workbench.alchemy.confirm.batch-time'))}</span>
            <div class="market-price-display">
              <strong>${escapeHtml(String(state.batchBrewTicks))}</strong>
              <span>${escapeHtml(t('craft.workbench.alchemy.confirm.no-startup'))}</span>
            </div>
          </div>
          <div class="market-trade-dialog-total ${state.errorText ? 'error' : ''}">
            <span>${escapeHtml(t('craft.workbench.alchemy.confirm.total-time'))}</span>
            <strong data-alchemy-confirm-total-ticks="true">${escapeHtml(t('craft.workbench.alchemy.confirm.total-time-value', {
              ticks: state.totalTicks === null ? '--' : formatDisplayInteger(state.totalTicks),
            }))}</strong>
          </div>
        </div>
        <div class="market-action-hint" data-alchemy-confirm-hint="true">${escapeHtml(t('craft.workbench.alchemy.confirm.hint', {
          maxQuantity: formatDisplayInteger(state.maxQuantity),
          outputCount: formatDisplayInteger(this.getAlchemyBatchOutputCount(recipe)),
          unit,
        }))}</div>
        <div class="craft-start-mode-row">
          <button class="small-btn" data-alchemy-confirm-start-mode="replace" type="button" ${state.startDisabled ? 'disabled' : ''}>${escapeHtml(t('craft.workbench.alchemy.confirm.start'))}</button>
          <button class="small-btn ghost" data-alchemy-confirm-start-mode="preserve" type="button" ${state.startDisabled ? 'disabled' : ''}>${escapeHtml(t('craft.workbench.alchemy.confirm.start-preserve'))}</button>
          <button class="small-btn ghost" data-alchemy-confirm-start-mode="append" type="button" ${state.startDisabled ? 'disabled' : ''}>${escapeHtml(t('craft.workbench.alchemy.confirm.start-append'))}</button>
        </div>
        <div class="market-action-hint market-action-hint--error" data-alchemy-confirm-error="true" ${state.errorText ? '' : 'hidden'}>${escapeHtml(state.errorText ?? '')}</div>
      </div>
    `;
  }

  private bindAlchemyConfirmEvents(): void {
    if (this.confirmEventsBound) {
      return;
    }
    this.confirmEventsBound = true;
    document.addEventListener('click', (event) => {
      if (!confirmModalHost.isOpenFor(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const quickQtyButton = target.closest<HTMLElement>('[data-alchemy-confirm-quick-qty]');
      const startModeButton = target.closest<HTMLButtonElement>('[data-alchemy-confirm-start-mode]');
      if (startModeButton) {
        const mode = this.normalizeQueueStartMode(startModeButton.dataset.alchemyConfirmStartMode);
        this.submitAlchemyConfirm(mode);
        return;
      }
      if (!quickQtyButton) {
        return;
      }
      const value = quickQtyButton.dataset.alchemyConfirmQuickQty;
      if (!value) {
        return;
      }
      this.confirmQuantityDraft = value;
      const input = document.querySelector<HTMLInputElement>('[data-alchemy-confirm-quantity="true"]');
      if (input) {
        input.value = value;
      }
      this.syncAlchemyConfirmState();
    }, true);
    document.addEventListener('input', (event) => {
      if (!confirmModalHost.isOpenFor(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.alchemyConfirmQuantity !== 'true') {
        return;
      }
      const normalized = target.value.replaceAll(/[^\d]/g, '');
      this.confirmQuantityDraft = normalized;
      if (target.value !== normalized) {
        target.value = normalized;
      }
      this.syncAlchemyConfirmState();
    });
  }

  private syncAlchemyConfirmState(): void {
    const request = this.confirmStartRequest;
    const recipe = request ? this.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || !confirmModalHost.isOpenFor(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER)) {
      return;
    }
    const state = this.buildAlchemyConfirmState(recipe, request.ingredients);
    const totalCostNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-total-cost="true"]');
    const totalTicksNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-total-ticks="true"]');
    const hintNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-hint="true"]');
    const errorNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-error="true"]');
    const maxButton = document.querySelector<HTMLButtonElement>('[data-alchemy-confirm-quick-qty-max="true"]');
    const confirmButton = document.querySelector<HTMLButtonElement>('[data-confirm-modal-confirm="true"]');
    const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-alchemy-confirm-start-mode]');
    if (totalCostNode) {
      totalCostNode.textContent = t('craft.workbench.alchemy.confirm.total-spirit-stone-value', {
        cost: state.spiritStoneCost === null ? '--' : formatDisplayInteger(state.spiritStoneCost),
      });
      totalCostNode.parentElement?.classList.toggle('error', Boolean(state.errorText));
    }
    if (totalTicksNode) {
      totalTicksNode.textContent = t('craft.workbench.alchemy.confirm.total-time-value', {
        ticks: state.totalTicks === null ? '--' : formatDisplayInteger(state.totalTicks),
      });
      totalTicksNode.parentElement?.classList.toggle('error', Boolean(state.errorText));
    }
    if (hintNode) {
      const unit = this.activeMode === 'forging'
        ? t('craft.workbench.alchemy.confirm.unit.forging')
        : t('craft.workbench.alchemy.confirm.unit.alchemy');
      hintNode.textContent = t('craft.workbench.alchemy.confirm.hint', {
        maxQuantity: formatDisplayInteger(state.maxQuantity),
        outputCount: formatDisplayInteger(this.getAlchemyBatchOutputCount(recipe)),
        unit,
      });
    }
    if (maxButton) {
      maxButton.dataset.alchemyConfirmQuickQty = String(Math.max(1, state.maxQuantity));
      maxButton.disabled = state.maxQuantity <= 0;
    }
    if (errorNode) {
      errorNode.hidden = !state.errorText;
      errorNode.textContent = state.errorText ?? '';
    }
    if (confirmButton) {
      confirmButton.disabled = state.startDisabled;
    }
    modeButtons.forEach((button) => {
      button.disabled = state.startDisabled;
    });
  }

  private normalizeQueueStartMode(value: string | undefined): CraftQueueStartMode {
    if (value === 'preserve' || value === 'append') {
      return value;
    }
    return 'replace';
  }

  private submitAlchemyConfirm(queueMode: CraftQueueStartMode): void {
    const latestRequest = this.confirmStartRequest;
    const latestRecipe = latestRequest ? this.alchemyCatalog.find((entry) => entry.recipeId === latestRequest.recipeId) ?? null : null;
    if (!latestRequest || !latestRecipe) {
      this.confirmStartRequest = null;
      return;
    }
    const latestState = this.buildAlchemyConfirmState(latestRecipe, latestRequest.ingredients);
    if (latestState.startDisabled || latestState.quantity === null) {
      this.syncAlchemyConfirmModal();
      return;
    }
    this.setAlchemySelectedQuantity(latestRecipe, latestRequest.ingredients, latestState.quantity);
    this.confirmStartRequest = null;
    const start = this.activeMode === 'forging'
      ? this.callbacks?.onStartForging
      : this.callbacks?.onStartAlchemy;
    start?.(
      latestRequest.recipeId,
      latestRequest.ingredients.map((entry) => ({ itemId: entry.itemId, count: entry.count })),
      latestState.quantity,
      queueMode,
    );
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
  }

  private syncAlchemyConfirmModal(): void {
    const request = this.confirmStartRequest;
    const recipe = request ? this.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || !detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER) || (this.activeMode !== 'alchemy' && this.activeMode !== 'forging')) {
      this.confirmStartRequest = null;
      confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
      return;
    }
    const isForging = this.activeMode === 'forging';
    const state = this.buildAlchemyConfirmState(recipe, request.ingredients);
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER,
      title: t('craft.workbench.alchemy.confirm.title', {
        modeLabel: isForging
          ? t('craft.workbench.alchemy.confirm.mode.forging')
          : t('craft.workbench.alchemy.confirm.mode.alchemy'),
      }),
      subtitle: t('craft.workbench.alchemy.confirm.subtitle', {
        recipeName: recipe.outputName,
        recipeLabel: isForging
          ? (request.mode === 'full'
            ? t('craft.workbench.alchemy.confirm.recipe-label.full.forging')
            : t('craft.workbench.alchemy.confirm.recipe-label.simple.forging'))
          : (request.mode === 'full'
            ? t('craft.workbench.alchemy.confirm.recipe-label.full.alchemy')
            : t('craft.workbench.alchemy.confirm.recipe-label.simple.alchemy')),
      }),
      bodyHtml: this.renderAlchemyConfirmBody(recipe, request.mode, state),
      hideActions: true,
      onClose: () => {
        this.confirmStartRequest = null;
      },
    });
    this.bindAlchemyConfirmEvents();
    this.syncAlchemyConfirmState();
  }
}

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
  CraftEffectSkillKind,
  CraftEffectStatsPatch,
  CraftElementVector,
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
  TechniqueActivityCancelRef,
  TechniqueActivityTaskView,
  RuntimeTechniqueActivityKind,
} from '@mud/shared';
import {
  ALCHEMY_FURNACE_OUTPUT_COUNT,
  ELEMENT_KEYS,
  EQUIP_SLOTS,
  TECHNIQUE_GRADE_ORDER,
  addCraftElementVector,
  compactCraftElementVector,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyBatchOutputCountWithSize,
  computeAlchemyTotalJobTicks,
  createEmptyCraftElementVector,
  calculateTechniqueComprehensionProgressBreakdown,
  calculateTechniqueBookCraftFragmentCost,
  calculateTechniqueBookDecomposeFragments,
  getAlchemySpiritStoneCost,
  getItemDisplayName,
  isCreatedTechniqueId,
  normalizeEnhanceLevel,
  normalizeAlchemyQuantity,
  type TechniqueGrade,
  type TechniqueCategory,
  type TechniqueComprehensionProgressBreakdown,
} from '@mud/shared';
import { getLocalItemTemplate, getLocalRealmLevelEntry, getLocalTechniqueTemplate } from '../content/local-templates';
import { getItemTypeLabel, getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplayNumber, formatDisplaySignedNumber } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { FloatingListPanel } from './floating-list-panel';
import {
  FLOATING_PANEL_PREFERENCES_CHANGED_EVENT,
  isFloatingPanelEnabled,
  updateFloatingPanelPreference,
} from './floating-panel-preferences';
import { t } from './i18n';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';
import { getItemDecorClassName, getItemDisplayMeta } from './item-display';
import { CraftAlchemyView } from './craft-alchemy-view';
import type { CraftAlchemyParent } from './craft-alchemy-view';
import { CraftCatalogCache, type CraftCatalogKind } from './craft-catalog-cache';
import { CraftEnhancementView } from './craft-enhancement-view';
import type { CraftEnhancementParent } from './craft-enhancement-view';
import { CraftQueueView } from './craft-queue-view';
import type { CraftQueueParent } from './craft-queue-view';
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
  onStartTransmission?: (learnerPlayerId: string, techId: string, options?: { mode?: 'transmission' | 'craft_book' | 'scripture_recording' | 'scripture_contemplation'; maxLevel?: number; buildingId?: string }) => void;
  onCancelTransmission?: (techId: string) => void;
  onDecomposeTechniqueBook?: (itemInstanceId: string, count: number) => void;
  getTransmissionTargets?: () => Array<{ playerId: string; name: string }>;
};

type CraftMode = 'alchemy' | 'forging' | 'enhancement' | 'transmission' | 'technique_refining' | null;
type AlchemyTab = 'full' | 'simple';
type AlchemyRealmTab = 'mortal' | 'qi' | 'foundation';
type AlchemyMaterialPickerSortKey = 'name' | 'level' | 'grade' | 'metal' | 'wood' | 'water' | 'fire' | 'earth' | 'count';
type CraftQueueProgressView = {
  ratio: number;
  label: string;
  detail: string;
};
type TechniqueBookCraftGradeFilter = 'all' | TechniqueGrade;
type TechniqueBookCraftCategoryFilter = 'all' | TechniqueCategory;
type CraftQueueDisplayItem = CraftQueueItemView & {
  isActive?: boolean;
  progress?: CraftQueueProgressView;
  interruptProgress?: CraftQueueProgressView | null;
};

type ConfirmStartRequest = {
  recipeId: string;
  ingredients: AlchemyIngredientSelection[];
  mode: AlchemyTab;
};

const FORGING_INITIAL_RECIPES = [
  { outputItemId: 'equip.copper_enhancement_hammer', outputName: t('craft.workbench.initial-copper-hammer'), note: t('craft.workbench.initial-copper-hammer-note') },
  { outputItemId: 'equip.copper_pill_furnace', outputName: t('craft.workbench.initial-copper-furnace'), note: t('craft.workbench.initial-copper-furnace-note') },
  { outputItemId: 'equip.copper_forging_tool', outputName: t('craft.workbench.initial-copper-forging-tool'), note: t('craft.workbench.initial-copper-forging-tool-note') },
  { outputItemId: 'equip.copper_building_hammer', outputName: t('craft.workbench.initial-copper-building-hammer'), note: t('craft.workbench.initial-copper-building-hammer-note') },
  { outputItemId: 'equip.copper_luopan', outputName: t('craft.workbench.initial-copper-luopan'), note: t('craft.workbench.initial-copper-luopan-note') },
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

function formatComprehensionProgressBreakdown(breakdown: TechniqueComprehensionProgressBreakdown | null | undefined): string {
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

function buildEnhancementTargetKey(ref: EnhancementTargetRef): string {
  return ref.source === 'equipment'
    ? `equipment:${ref.slot ?? ''}`
    : `inventory:${normalizeInventoryItemInstanceId(ref.itemInstanceId)}`;
}

function normalizeInventoryItemInstanceId(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function readCraftToolStat(
  stats: CraftEffectStatsPatch | null | undefined,
  skillKind: CraftEffectSkillKind,
  effectKind: 'successRate' | 'speedRate' | 'outputRate' | 'expRate',
): number {
  const value = Number(stats?.[skillKind]?.[effectKind]);
  return Number.isFinite(value)
    ? value
    : 0;
}

function createEmptyEquipmentSlots(): EquipmentSlots {
  return Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null])) as EquipmentSlots;
}

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

function cloneAlchemyIngredients(
  ingredients: readonly AlchemyIngredientSelection[],
): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

function normalizeLocalAlchemyIngredients(value: unknown): AlchemyIngredientSelection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const entry of value) {
    const itemId = typeof entry?.itemId === 'string' ? entry.itemId.trim() : '';
    const count = Math.max(1, Math.floor(Number(entry?.count) || 1));
    if (!itemId) {
      continue;
    }
    counts.set(itemId, (counts.get(itemId) ?? 0) + count);
  }
  return Array.from(counts.entries()).map(([itemId, count]) => ({ itemId, count }));
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
  if (
    value === 'artifact'
    || value === 'buff'
    || value === 'special'
    || value === 'weapon'
    || value === 'head'
    || value === 'body'
    || value === 'legs'
    || value === 'accessory'
  ) {
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
  private static readonly ALCHEMY_MATERIAL_PICKER_OWNER = 'craft-workbench-modal:alchemy-material-picker';
  private static readonly ALCHEMY_PRESET_PICKER_OWNER = 'craft-workbench-modal:alchemy-preset-picker';
  private static readonly TECHNIQUE_REFINING_CONFIRM_OWNER = 'craft-workbench-modal:technique-refining-confirm';

  private callbacks: CraftWorkbenchCallbacks | null = null;
  private transmissionCallbacks: Pick<CraftWorkbenchCallbacks, 'onStartTransmission' | 'onCancelTransmission' | 'getTransmissionTargets'> | null = null;
  private activeMode: CraftMode = null;
  private loading = false;

  private alchemyPanel: S2C_AlchemyPanel | null = null;
  private enhancementPanel: S2C_EnhancementPanel | null = null;
  private techniqueActivityTasksSynced = false;
  private techniqueActivityTasks: TechniqueActivityTaskView[] = [];
  private readonly craftCatalogCache = new CraftCatalogCache();
  private alchemyCatalogVersion = 0;
  private alchemyCatalog: AlchemyRecipeCatalogEntry[] = [];
  private alchemySkillLevel = 1;
  private forgingSkillLevel = 1;
  private gatherSkillLevel = 1;
  private enhancementSkillLevel = 1;
  private transmissionSkillLevel = 1;
  private playerLuck = 0;
  private transmissionTechniques: PlayerState['techniques'] = [];
  private pendingTechniqueComprehensions: PlayerState['pendingTechniqueComprehensions'] = [];
  private lastTransmissionRenderKey: string | null = null;
  private selectedTechniqueBookIds = new Set<string>();
  private selectedTechniqueBookCount = 1;
  private techniqueBookCraftGradeFilter: TechniqueBookCraftGradeFilter = 'all';
  private techniqueBookCraftCategoryFilter: TechniqueBookCraftCategoryFilter = 'all';
  private playerRealmLv: number | null = null;
  private inventory: PlayerState['inventory'] = { items: [], capacity: 0 };
  private equipment: EquipmentSlots = createEmptyEquipmentSlots();
  private activeAlchemyCategory: AlchemyRecipeCategory = 'recovery';
  private activeAlchemyRealm: AlchemyRealmTab = 'mortal';
  private activeAlchemyTab: AlchemyTab = 'full';
  private selectedAlchemyRecipeId: string | null = null;
  private selectedAlchemyPresetId: string | null = null;
  private draftByRecipeId = new Map<string, Map<string, number>>();
  private localCraftFormulaPresets = new Map<string, PlayerAlchemyPreset[]>();
  private localCraftFormulaPresetsLoaded = false;
  private alchemyMaterialPickerQuery = '';
  private alchemyMaterialPickerSortKey: AlchemyMaterialPickerSortKey = 'name';
  private alchemyMaterialPickerSortDirection: 'asc' | 'desc' = 'asc';
  private alchemyPresetPickerSelectedId: string | null = null;
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
  /** 行动队列浮窗宿主，只展示技艺通用 job 的精简状态。 */
  private queueFloatingPanel: FloatingListPanel | null = null;
  /** 行动队列浮窗当前绑定的事件。 */
  private queueFloatingEvents: AbortController | null = null;

  /** @internal Sub-view delegates */
  readonly alchemyView = new CraftAlchemyView(this as unknown as CraftAlchemyParent);
  readonly enhancementView = new CraftEnhancementView(this as unknown as CraftEnhancementParent);
  readonly queueView = new CraftQueueView(this as unknown as CraftQueueParent);

  constructor() {
    window.addEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, () => this.refreshQueueFloatingPanel());
  }

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
    this.playerLuck = Math.max(0, Math.floor(Number(player.luck ?? 0) || 0));
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
    }
    if (typeof update.specialStats?.luck === 'number') {
      this.playerLuck = Math.max(0, Math.floor(Number(update.specialStats.luck) || 0));
    }
    if (detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.patchOpenCraftShell();
    }
  }

  syncPlayerContext(player?: PlayerState): void {
    const nextRealmLv = Number.isFinite(Number(player?.realm?.realmLv ?? player?.realmLv))
      ? Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? player?.realmLv)))
      : null;
    const nextLuck = Math.max(0, Math.floor(Number(player?.luck ?? this.playerLuck) || 0));
    this.transmissionTechniques = Array.isArray(player?.techniques) ? player.techniques : [];
    this.pendingTechniqueComprehensions = Array.isArray(player?.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    this.transmissionSkillLevel = Math.max(1, Math.floor(player?.transmissionSkill?.level ?? this.transmissionSkillLevel));
    const realmChanged = this.playerRealmLv !== nextRealmLv;
    const luckChanged = this.playerLuck !== nextLuck;
    this.playerRealmLv = nextRealmLv;
    this.playerLuck = nextLuck;
    if ((realmChanged || luckChanged || this.activeMode === 'transmission' || this.activeMode === 'technique_refining') && detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.patchOpenCraftShell();
    }
  }

  syncInventory(inventory?: PlayerState['inventory']): void {
    const previousCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
    if (inventory) {
      this.inventory = inventory;
    }
    if (this.activeMode === 'technique_refining' && detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.patchOpenCraftShell();
      return;
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
    this.ensureLocalCraftFormulaPresetsLoaded();
    this.activeMode = 'alchemy';
    this.loading = true;
    this.activateCraftCatalog('alchemy');
    this.selectedAlchemyPresetId = null;
    this.confirmStartRequest = null;
    this.render();
    this.callbacks?.onRequestAlchemy(this.craftCatalogCache.getKnownVersion('alchemy'));
  }

  openForging(): void {
    this.ensureLocalCraftFormulaPresetsLoaded();
    this.activeMode = 'forging';
    this.loading = true;
    this.activateCraftCatalog('forging');
    this.activeAlchemyCategory = 'weapon';
    this.activeAlchemyTab = 'full';
    this.selectedAlchemyPresetId = null;
    this.confirmStartRequest = null;
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
    this.render();
    this.callbacks?.onRequestForging(this.craftCatalogCache.getKnownVersion('forging'));
  }

  openEnhancement(): void {
    this.enhancementView.ensureLocalEnhancementHistoryLoaded();
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

  openTechniqueRefining(): void {
    this.activeMode = 'technique_refining';
    this.loading = false;
    this.selectedTechniqueBookIds.clear();
    this.selectedTechniqueBookCount = 1;
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
    this.applyCraftCatalog('alchemy', data);
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
    this.applyCraftCatalog('forging', data);
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

  private activateCraftCatalog(kind: CraftCatalogKind): void {
    const snapshot = this.craftCatalogCache.read(kind);
    this.alchemyCatalogVersion = snapshot.catalogVersion;
    this.alchemyCatalog = snapshot.catalog;
  }

  private applyCraftCatalog(kind: CraftCatalogKind, data: S2C_AlchemyPanel): void {
    const snapshot = this.craftCatalogCache.apply(kind, data.catalogVersion, data.catalog);
    this.alchemyCatalogVersion = snapshot.catalogVersion;
    this.alchemyCatalog = snapshot.catalog;
  }

  updateEnhancement(data: S2C_EnhancementPanel): void {
    this.enhancementView.ensureLocalEnhancementHistoryLoaded();
    this.enhancementResponseError = data.error ?? null;
    const hasRecordSnapshot = Array.isArray(data.state?.records) || Array.isArray(data.statePatch?.records);
    if (hasRecordSnapshot) {
      this.enhancementView.mergeServerEnhancementSessionRecord(data.state?.records ?? data.statePatch?.records ?? []);
    }
    this.enhancementPanel = this.mergeEnhancementPanel(data);
    this.lastEnhancementCandidateSourceKey = this.buildEnhancementCandidateSourceKey();
    if (typeof this.enhancementPanel.state?.enhancementSkillLevel === 'number') {
      this.enhancementSkillLevel = Math.max(1, Math.floor(this.enhancementPanel.state.enhancementSkillLevel));
    }
    this.enhancementView.ensureEnhancementSelection();
    this.enhancementView.refreshOpenEnhancementHistoryModal();
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
    this.refreshQueueFloatingPanel();
    if (this.activeMode === 'technique_refining') {
      return;
    }
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
    this.queueFloatingPanel?.setTransientHidden(true);
    this.queueFloatingEvents?.abort();
    this.queueFloatingEvents = null;
    this.craftCatalogCache.clear();
    this.alchemyCatalog = [];
    this.alchemyCatalogVersion = 0;
    this.selectedAlchemyRecipeId = null;
    this.selectedAlchemyPresetId = null;
    this.draftByRecipeId.clear();
    this.quantityByRecipeId.clear();
    this.confirmStartRequest = null;
    this.confirmQuantityDraft = '1';
    this.alchemyMaterialPickerQuery = '';
    this.alchemyPresetPickerSelectedId = null;
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
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_MATERIAL_PICKER_OWNER);
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
    confirmModalHost.close(CraftWorkbenchModal.TECHNIQUE_REFINING_CONFIRM_OWNER);
    this.enhancementView.closeTransientUi();
    unmountReactCraftWorkbenchPanel();
    detailModalHost.close(CraftWorkbenchModal.MODAL_OWNER);
  }

  private requestCurrentPanel(): void {
    if (!detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      return;
    }
    if (this.activeMode === 'alchemy') {
      this.callbacks?.onRequestAlchemy(this.craftCatalogCache.getKnownVersion('alchemy'));
    } else if (this.activeMode === 'forging') {
      this.callbacks?.onRequestForging(this.craftCatalogCache.getKnownVersion('forging'));
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
      const visibleRecipes = this.getVisibleAlchemyRecipes();
      const visibleRecipeIds = new Set(visibleRecipes.map((entry) => entry.recipeId));
      if (this.selectedAlchemyRecipeId && visibleRecipeIds.has(this.selectedAlchemyRecipeId)) {
        return;
      }
      this.selectedAlchemyRecipeId = visibleRecipes[0]?.recipeId ?? null;
      this.selectedAlchemyPresetId = null;
      return;
    }
    const visibleRecipes = this.getVisibleAlchemyRecipes();
    const visibleRecipeIds = new Set(visibleRecipes.map((entry) => entry.recipeId));
    if (this.selectedAlchemyRecipeId && visibleRecipeIds.has(this.selectedAlchemyRecipeId)) {
      return;
    }
    const nextRecipe = visibleRecipes[0] ?? null;
    this.selectedAlchemyRecipeId = nextRecipe?.recipeId ?? null;
    this.selectedAlchemyPresetId = null;
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

  private render(): void {
    const definition = this.getCurrentModalDefinition();
    if (!definition) {
      return;
    }
    if (this.activeMode === 'enhancement') {
      this.lastEnhancementRenderKey = this.buildEnhancementPanelRenderKey();
    }
    if (this.activeMode !== 'technique_refining' && this.useReactPanel()) {
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
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_MATERIAL_PICKER_OWNER);
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
        confirmModalHost.close(CraftWorkbenchModal.TECHNIQUE_REFINING_CONFIRM_OWNER);
        this.enhancementView.closeTransientUi();
        this.activeMode = null;
        this.loading = false;
        this.lastTransmissionRenderKey = null;
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
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_MATERIAL_PICKER_OWNER);
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
        confirmModalHost.close(CraftWorkbenchModal.TECHNIQUE_REFINING_CONFIRM_OWNER);
        this.enhancementView.closeTransientUi();
        unmountReactCraftWorkbenchPanel();
        this.activeMode = null;
        this.loading = false;
        this.lastTransmissionRenderKey = null;
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
    const nextContentKey = this.buildCraftContentKey();
    const shouldReplaceContent = includeContent && current.contentKey !== nextContentKey;
    syncReactCraftWorkbenchState({
      activeMode: this.activeMode,
      tabsKey: nextTabsKey,
      ...(current.tabsKey !== nextTabsKey ? { tabsHtml: this.renderCraftModeTabs() } : {}),
      headerKey: nextHeaderKey,
      ...(current.headerKey !== nextHeaderKey ? { headerHtml: this.renderCraftHeader() } : {}),
      ...(shouldReplaceContent
        ? {
          contentKey: nextContentKey,
          contentHtml: this.renderCraftActiveBody(),
        }
        : {}),
    });
  }

  private buildCraftContentKey(): string {
    const alchemyContentKey = (this.activeMode === 'alchemy' || this.activeMode === 'forging')
      ? this.alchemyView.buildAlchemyStableRenderKey()
      : '';
    return [
      this.activeMode ?? 'none',
      this.loading ? 'loading' : 'ready',
      this.activeAlchemyCategory,
      this.activeAlchemyRealm,
      this.activeAlchemyTab,
      this.selectedAlchemyRecipeId ?? '',
      this.selectedAlchemyPresetId ?? '',
      alchemyContentKey,
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
      this.playerLuck,
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
    if (this.activeMode === 'alchemy' || this.activeMode === 'forging') {
      this.alchemyView.bindAlchemyMaterialControls(body, signal);
    }
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
    if (this.activeMode === 'technique_refining') {
      if (!detailModalHost.patch({
        ownerId: CraftWorkbenchModal.MODAL_OWNER,
        variantClass: definition.variantClass,
        title: definition.title,
        subtitle: definition.subtitle,
        hint: t('craft.workbench.modal.close-hint'),
      })) {
        return false;
      }
      if (this.tryPatchTechniqueRefiningBody(body)) {
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
        },
      });
      return true;
    }
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
    if (this.activeMode === 'transmission' && this.tryPatchTransmissionBody(body)) {
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
    if (this.activeMode === 'technique_refining') {
      if (!detailModalHost.patch({
        ownerId: CraftWorkbenchModal.MODAL_OWNER,
        variantClass: definition.variantClass,
        title: definition.title,
        subtitle: definition.subtitle,
        hint: t('craft.workbench.modal.close-hint'),
      })) {
        return;
      }
      if (!this.tryPatchTechniqueRefiningBody(body)) {
        detailModalHost.patch({
          ownerId: CraftWorkbenchModal.MODAL_OWNER,
          renderBody: (nextBody) => {
            replaceElementHtml(nextBody, definition.body);
          },
          onAfterRender: (nextBody, signal) => {
            bindInlineItemTooltips(nextBody, signal);
            this.bindActions(nextBody, signal);
          },
        });
      }
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
      if (this.activeMode === 'transmission') {
        this.tryPatchTransmissionBody(body);
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
      this.tryPatchTransmissionBody(body);
    }
  }

  private tryPatchTransmissionBody(body: HTMLElement): boolean {
    if (this.activeMode !== 'transmission') {
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
      return true;
    }
    this.patchTransmissionProgress(content);
    return true;
  }

  private patchTransmissionProgress(content: HTMLElement): void {
    for (const entry of this.pendingTechniqueComprehensions ?? []) {
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

  private patchOpenCraftQueueOnly(): void {
    this.refreshQueueFloatingPanel();
    if (this.activeMode === 'technique_refining') {
      return;
    }
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

  private tryPatchTechniqueRefiningBody(body: HTMLElement): boolean {
    if (this.activeMode !== 'technique_refining') {
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
    if (this.activeMode === 'technique_refining') {
      return {
        title: '炼法台',
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-technique-refining',
        body: this.renderTechniqueRefiningBody(),
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
      return '功法领悟与传授';
    }
    if (this.activeMode === 'technique_refining') {
      return '功法书分解与抄录';
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
      this.lastTransmissionRenderKey = this.buildTransmissionRenderKey();
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
                  ${entry.cancelRef?.techId ? `data-tech-id="${escapeHtmlAttr(entry.cancelRef.techId)}"` : ''}
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
    this.refreshQueueFloatingPanel();
    return true;
  }

  private refreshQueueFloatingPanel(): void {
    if (!isFloatingPanelEnabled('actionQueue')) {
      this.queueFloatingPanel?.setTransientHidden(true);
      return;
    }
    const queue = this.getCraftQueueSnapshot();
    if (queue.length === 0) {
      this.queueFloatingPanel?.setTransientHidden(true);
      this.queueFloatingEvents?.abort();
      this.queueFloatingEvents = null;
      return;
    }
    const panel = this.ensureQueueFloatingPanel();
    panel.setClosed(false);
    const queueKey = this.buildFloatingQueueKey(queue);
    if (panel.getBodyKey() !== queueKey) {
      panel.updateContent(this.renderFloatingQueueList(queue));
      panel.setBodyKey(queueKey);
      this.queueFloatingEvents?.abort();
      this.queueFloatingEvents = null;
    }
    panel.setTransientHidden(false);
  }

  private ensureQueueFloatingPanel(): FloatingListPanel {
    if (!this.queueFloatingPanel) {
      this.queueFloatingPanel = new FloatingListPanel({
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
    return this.queueFloatingPanel;
  }

  private buildFloatingQueueKey(queue = this.getCraftQueueSnapshot()): string {
    return queue
      .map((entry) => [
        entry.queueId,
        entry.label,
        entry.quantity ?? '',
        entry.isActive ? 'active' : 'idle',
        entry.state ?? '',
        entry.progress?.label ?? '',
        entry.progress?.ratio ?? 0,
      ].join(':'))
      .join('|');
  }

  private renderFloatingQueueList(queue = this.getCraftQueueSnapshot()): string {
    return `
      <div class="floating-job-list">
        ${queue.map((entry) => this.renderFloatingQueueItem(entry)).join('')}
      </div>
    `;
  }

  private renderFloatingQueueItem(entry: CraftQueueDisplayItem): string {
    const progress = entry.progress ?? {
      ratio: entry.isActive ? 0 : 0,
      label: entry.isActive ? '--' : '等待中',
      detail: '',
    };
    return `
      <div class="floating-job-item${entry.isActive ? ' active' : ''}">
        <div class="floating-job-main">
          <span class="floating-job-name">${escapeHtml(entry.label)}</span>
          ${entry.quantity ? `<span class="floating-job-count">x${formatDisplayInteger(entry.quantity)}</span>` : ''}
          <strong class="floating-job-progress">${escapeHtml(progress.label)}</strong>
        </div>
        <div class="floating-job-bar" aria-hidden="true">
          <div class="floating-job-fill" style="width:${(Math.max(0, Math.min(1, progress.ratio)) * 100).toFixed(2)}%"></div>
        </div>
      </div>
    `;
  }

  private buildCraftHeaderKey(): string {
    return [
      this.activeMode ?? 'none',
      this.alchemySkillLevel,
      this.forgingSkillLevel,
      this.enhancementSkillLevel,
      this.buildCraftQueueStructureKey(),
      this.selectedTechniqueBookIds.size,
      this.selectedTechniqueBookCount,
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
        entry.cancelRef?.techId ?? '',
      ].join(':'))
      .join('|');
  }

  private buildCraftTabsKey(): string {
    return [
      this.activeMode ?? 'none',
      this.alchemySkillLevel,
      this.forgingSkillLevel,
      this.enhancementSkillLevel,
      this.inventory.revision ?? 0,
    ].join(':');
  }

  private renderCraftModeTabs(): string {
    const tabs: Array<{ mode: Exclude<CraftMode, null>; label: string; note: string }> = [
      { mode: 'alchemy', label: t('craft.workbench.mode.alchemy'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.alchemySkillLevel) }) },
      { mode: 'forging', label: t('craft.workbench.mode.forging'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.forgingSkillLevel) }) },
      { mode: 'enhancement', label: t('craft.workbench.mode.enhancement'), note: t('craft.workbench.level.short', { level: formatDisplayInteger(this.enhancementSkillLevel) }) },
      { mode: 'transmission', label: '传法', note: '功法' },
    ];
    return tabs.map((tab) => `
      <button class="craft-mode-tab ${this.activeMode === tab.mode ? 'active' : ''}" type="button" data-craft-action="switch-craft-mode" data-mode="${tab.mode}" data-guided-tour-craft-mode="${tab.mode}">
        <span>${escapeHtml(tab.label)}</span>
        <em>${escapeHtml(tab.note)}</em>
      </button>
    `).join('');
  }

  private buildTransmissionRenderKey(): string {
    return [
      this.transmissionTechniques.map((tech) => tech.techId).join(','),
      (this.pendingTechniqueComprehensions ?? [])
        .map((entry) => `${entry.techId}:${entry.activeTransferJob?.status ?? 'self'}:${entry.activeTransferJob?.blockedReason ?? ''}`)
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
    const pending = this.pendingTechniqueComprehensions ?? [];
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

  private getTransmittableTechniques(): PlayerState['techniques'] {
    return (this.transmissionTechniques ?? []).filter((tech) => isCreatedTechniqueId(tech.techId));
  }

  private getTransmissionTechniqueMetaText(tech: PlayerState['techniques'][number]): string {
    const gradeLabel = getTechniqueGradeLabel(tech.grade);
    const categoryLabel = getTechniqueCategoryLabel(tech.category);
    const realmLv = Math.max(1, Math.floor(Number(tech.realmLv) || 1));
    const realmLabel = getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
    return [gradeLabel, categoryLabel, realmLabel].join(' · ');
  }

  private getTechniqueBookCraftCandidates(): PlayerState['techniques'] {
    return (this.transmissionTechniques ?? [])
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

  private resolveTechniqueBookCraftCandidate(tech: PlayerState['techniques'][number] | undefined): PlayerState['techniques'][number] | null {
    const techId = typeof tech?.techId === 'string' && tech.techId.trim() ? tech.techId.trim() : '';
    if (!techId) {
      return null;
    }
    if (!isCreatedTechniqueId(techId)) {
      return null;
    }
    const template = getLocalTechniqueTemplate(techId);
    const category = (tech?.category ?? template?.category) as TechniqueCategory | undefined;
    if (category === 'divine') {
      return null;
    }
    return {
      ...tech,
      techId,
      name: tech?.name || template?.name || techId,
      grade: tech?.grade ?? template?.grade,
      category: category ?? (template?.skills?.length ? 'arts' : 'internal'),
      realmLv: tech?.realmLv ?? template?.realmLv,
      layers: Array.isArray(tech?.layers) && tech.layers.length > 0
        ? tech.layers
        : (template?.layers ?? []),
    } as PlayerState['techniques'][number];
  }

  private renderTransmissionPendingRow(entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number]): string {
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
          <strong>${escapeHtml(entry.name ?? entry.techId)}</strong>
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

  private resolveTransmissionPendingRate(entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number]): number {
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
      learnerRealmLv: Math.max(1, Math.floor(Number(this.playerRealmLv) || 1)),
      learnerTransmissionLevel: this.transmissionSkillLevel,
    }).progressGain;
  }

  private resolveTransmissionPendingBreakdown(entry: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number]): TechniqueComprehensionProgressBreakdown | null {
    if (entry.activeTransferJob?.progressBreakdown) {
      return entry.activeTransferJob.progressBreakdown;
    }
    if (entry.selfComprehensionAllowed === false) {
      return null;
    }
    return calculateTechniqueComprehensionProgressBreakdown({
      baseProgress: 1,
      techniqueRealmLv: Math.max(1, Math.floor(Number(entry.realmLv) || 1)),
      learnerRealmLv: Math.max(1, Math.floor(Number(this.playerRealmLv) || 1)),
      learnerTransmissionLevel: this.transmissionSkillLevel,
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
    const techniqueOptions = techniques.map((tech) => {
      const metaText = this.getTransmissionTechniqueMetaText(tech);
      const search = `${tech.name ?? ''} ${tech.techId} ${metaText}`.toLowerCase();
      return `<option value="${escapeHtmlAttr(tech.techId)}" data-search="${escapeHtmlAttr(search)}">${escapeHtml(tech.name ?? tech.techId)} · ${escapeHtml(metaText)}</option>`;
    }).join('');
    const targetOptions = targets.length > 0
      ? targets.map((target) => `<option value="${escapeHtmlAttr(target.playerId)}">${escapeHtml(target.name)}</option>`).join('')
      : '<option value="">附近无可传授玩家</option>';
    const targetDisabled = targets.length === 0 ? 'disabled' : '';
    return `
      <div class="transmission-teach-picker">
        <input class="ui-search-input" type="search" data-transmission-tech-search="true" placeholder="搜索自创功法">
        <select class="ui-input" data-transmission-tech-select="true">
          ${techniqueOptions}
        </select>
        <select class="ui-input" data-transmission-target-select="true" ${targetDisabled}>
          ${targetOptions}
        </select>
        <button class="small-btn" type="button" data-craft-action="transmission-start" ${targetDisabled}>传授</button>
      </div>
    `;
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
      return `<option value="${escapeHtmlAttr(tech.techId)}" data-search="${escapeHtmlAttr(search)}" data-max-level="${maxLevel}">${escapeHtml(tech.name ?? tech.techId)} · ${escapeHtml(metaText)} · 满层 ${formatDisplayInteger(maxLevel)} 层</option>`;
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

  private renderTechniqueRefiningBody(): string {
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

  private calculateTechniqueBookCraftCost(tech: PlayerState['techniques'][number] | undefined, maxLevelInput: number): number {
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
          tech.grade ?? '',
          tech.category ?? '',
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
        return {
          itemInstanceId,
          count,
          fragments,
          name: getItemDisplayName(item),
        };
      })
      .filter((entry): entry is { itemInstanceId: string; count: number; fragments: number; name: string } => Boolean(entry));
    if (entries.length === 0) {
      return;
    }
    const totalFragments = entries.reduce((sum, entry) => sum + entry.fragments, 0);
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.TECHNIQUE_REFINING_CONFIRM_OWNER,
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
          this.callbacks?.onDecomposeTechniqueBook?.(entry.itemInstanceId, entry.count);
        }
        this.selectedTechniqueBookIds.clear();
        this.selectedTechniqueBookCount = 1;
        this.patchOpenCraftShell();
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
    return (this.inventory.items ?? []).filter((item) => item?.type === 'skill_book' && this.getItemInstanceId(item));
  }

  private getSelectedTechniqueBookItems(): ItemStack[] {
    const selected = this.selectedTechniqueBookIds;
    return this.getTechniqueBookInventoryItems().filter((item) => selected.has(this.getItemInstanceId(item)));
  }

  private getItemInstanceId(item: ItemStack | undefined): string {
    return typeof item?.itemInstanceId === 'string' && item.itemInstanceId.trim() ? item.itemInstanceId.trim() : '';
  }

  private escapeCssAttrSelector(value: string): string {
    return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(value)
      : value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
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
    if (this.activeMode === 'technique_refining') {
      return '炼法台';
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
      return '用于功法领悟与传授。';
    }
    if (this.activeMode === 'technique_refining') {
      return '分解功法书为残页，也可以用残页抄录指定层数的功法书。';
    }
    return t('craft.workbench.profession.description.default');
  }

  private getCraftQueueSnapshot(): CraftQueueDisplayItem[] {
    return this.queueView.getCraftQueueSnapshot();
  }

  private bindActions(body: HTMLElement, signal: AbortSignal): void {
    if (this.activeMode === 'enhancement') {
      this.bindEnhancementEvents(body, signal);
    }
    if (this.activeMode === 'transmission' || this.activeMode === 'technique_refining') {
      this.bindTransmissionEvents(body, signal);
    }
    if (this.activeMode === 'alchemy' || this.activeMode === 'forging') {
      this.alchemyView.bindAlchemyMaterialControls(body, signal);
    }
    body.addEventListener('click', (event) => {
      const eventTarget = event.target;
      const source = eventTarget instanceof Element
        ? eventTarget
        : eventTarget instanceof Node
          ? eventTarget.parentElement
          : null;
      const target = source?.closest<HTMLElement>('[data-craft-action]') ?? null;
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
        } else if (mode === 'technique_refining') {
          this.openTechniqueRefining();
        }
        return;
      }
      if (action === 'technique-refining-toggle-book') {
        const itemInstanceId = (target.dataset.itemInstanceId ?? '').trim();
        if (!itemInstanceId) {
          return;
        }
        if (this.selectedTechniqueBookIds.has(itemInstanceId)) {
          this.selectedTechniqueBookIds.delete(itemInstanceId);
        } else {
          this.selectedTechniqueBookIds.add(itemInstanceId);
        }
        if (this.selectedTechniqueBookIds.size !== 1) {
          this.selectedTechniqueBookCount = 1;
        }
        this.patchOpenCraftShell();
        return;
      }
      if (action === 'technique-refining-count') {
        const count = Math.max(1, Math.floor(Number(target.dataset.count ?? '1') || 1));
        this.selectedTechniqueBookCount = count;
        this.patchOpenCraftShell();
        return;
      }
      if (action === 'technique-refining-decompose') {
        this.openTechniqueRefiningConfirmModal();
        return;
      }
      if (action === 'cancel-queue-entry') {
        const kind = normalizeTechniqueActivityKind(target.dataset.kind);
        const jobRunId = (target.dataset.jobRunId ?? '').trim();
        const queueId = (target.dataset.queueId ?? '').trim();
        const techId = (target.dataset.techId ?? '').trim();
        if (!jobRunId && !queueId && !techId) {
          return;
        }
        this.callbacks?.onCancelTechniqueActivity({
          kind: target.dataset.kind === 'transmission' ? 'transmission' : kind,
          ...(jobRunId ? { jobRunId } : {}),
          ...(queueId ? { queueId } : {}),
          ...(techId ? { techId } : {}),
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
      if (action === 'transmission-craft-book') {
        const select = body.querySelector<HTMLSelectElement>('[data-transmission-book-tech-select="true"]');
        const techId = (select?.value ?? '').trim();
        const maxLevelInput = body.querySelector<HTMLInputElement>('[data-transmission-book-level-input="true"]');
        const maxLevel = Math.max(1, Math.floor(Number(maxLevelInput?.value ?? select?.selectedOptions[0]?.dataset.maxLevel ?? 1) || 1));
        if (techId) {
          (this.transmissionCallbacks?.onStartTransmission ?? this.callbacks?.onStartTransmission)?.('', techId, { mode: 'craft_book', maxLevel });
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
        if (this.activeAlchemyTab === 'simple') {
          this.ensureAlchemyDraft();
        }
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
      if (action === 'alchemy-remove-aux') {
        const recipeId = this.selectedAlchemyRecipeId;
        const itemId = (target.dataset.itemId ?? '').trim();
        if (!recipeId || !itemId) {
          return;
        }
        this.selectedAlchemyPresetId = null;
        this.removeAlchemyAuxItem(recipeId, itemId);
        this.render();
        return;
      }
      if (action === 'alchemy-open-material-picker') {
        this.openAlchemyMaterialPickerModal();
        return;
      }
      if (action === 'alchemy-open-preset-picker') {
        this.openAlchemyPresetPickerModal();
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
        const recipe = this.getSelectedAlchemyRecipe();
        if (!recipe) {
          return;
        }
        this.saveLocalCraftFormulaPreset(recipe);
        this.render();
        return;
      }
      if (action === 'alchemy-delete-preset') {
        const presetId = (target.dataset.presetId ?? '').trim();
        const recipeId = this.selectedAlchemyRecipeId;
        if (presetId && recipeId) {
          if (!this.deleteLocalCraftFormulaPreset(recipeId, presetId)) {
            this.callbacks?.onDeleteAlchemyPreset(presetId);
          }
          this.render();
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
        this.openAlchemyConfirm(recipeId, this.getAlchemySubmittedDraftIngredients(recipeId), 'simple');
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
    }, { signal });
  }

  private bindTransmissionEvents(body: HTMLElement, signal: AbortSignal): void {
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
      if (!input) return;
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
        this.patchOpenCraftShell();
        return;
      }
      if (event.target instanceof HTMLSelectElement && event.target.matches('[data-transmission-book-category-filter="true"]')) {
        this.techniqueBookCraftCategoryFilter = this.normalizeTechniqueBookCraftCategoryFilter(event.target.value);
        this.patchOpenCraftShell();
        return;
      }
      const changed = event.target instanceof HTMLSelectElement
        && (event.target.matches('[data-transmission-tech-select="true"]') || event.target.matches('[data-transmission-target-select="true"]') || event.target.matches('[data-transmission-book-tech-select="true"]'));
      if (changed) {
        this.syncTransmissionStartButton(body);
        this.syncTransmissionBookLevelInput(body);
      }
    }, { signal });
  }

  private normalizeTechniqueBookCraftGradeFilter(value: string): TechniqueBookCraftGradeFilter {
    return TECHNIQUE_GRADE_ORDER.includes(value as TechniqueGrade) ? value as TechniqueGrade : 'all';
  }

  private normalizeTechniqueBookCraftCategoryFilter(value: string): TechniqueBookCraftCategoryFilter {
    return value === 'arts' || value === 'internal' || value === 'divine' || value === 'secret' ? value : 'all';
  }

  private filterTransmissionTechniqueOptions(body: HTMLElement, query: string, selector = '[data-transmission-tech-select="true"]'): void {
    const select = body.querySelector<HTMLSelectElement>(selector);
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

  private syncTransmissionBookLevelInput(body: HTMLElement): void {
    const select = body.querySelector<HTMLSelectElement>('[data-transmission-book-tech-select="true"]');
    const input = body.querySelector<HTMLInputElement>('[data-transmission-book-level-input="true"]');
    if (!select || !input) return;
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

  private getVisibleAlchemyRecipes(): AlchemyRecipeCatalogEntry[] {
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
    return recipe.category === this.activeAlchemyCategory && getAlchemyRealmTab(recipe.outputLevel) === this.activeAlchemyRealm
      ? recipe
      : null;
  }

  private tryPatchAlchemyBody(body: HTMLElement): boolean {
    return this.alchemyView.tryPatchAlchemyBody(body);
  }

  private tryPatchEnhancementBody(body: HTMLElement): boolean {
    return this.enhancementView.tryPatchEnhancementBody(body);
  }

  private getEnhancementJobPatchKey(job: NonNullable<NonNullable<S2C_EnhancementPanel['state']>['job']> | null): string {
    if (!job) {
      return 'empty';
    }
    return `${job.jobRunId ?? job.startedAt}:${job.targetItemId}:${job.currentLevel}:${job.targetLevel}:${job.desiredTargetLevel}:${job.totalTicks}`;
  }

  private renderAlchemyBody(): string {
    return this.alchemyView.renderAlchemyBody();
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

  private resolveAlchemyMaterialName(recipe: AlchemyRecipeCatalogEntry, itemId: string): string {
    const recipeIngredient = recipe.ingredients.find((ingredient) => ingredient.itemId === itemId);
    return recipeIngredient?.name?.trim()
      || getLocalItemTemplate(itemId)?.name?.trim()
      || itemId;
  }

  private renderEnhancementBody(): string {
    return this.enhancementView.renderEnhancementBody();
  }

  private bindEnhancementEvents(body: HTMLElement, signal: AbortSignal): void {
    this.enhancementView.bindEnhancementEvents(body, signal);
  }


  getAlchemyRecipePresets(recipeId: string): PlayerAlchemyPreset[] {
    this.ensureLocalCraftFormulaPresetsLoaded();
    const kind = this.activeMode === 'forging' ? 'forging' : 'alchemy';
    const localPresets = this.localCraftFormulaPresets.get(this.buildLocalCraftFormulaPresetKey(kind, recipeId)) ?? [];
    return [
      ...localPresets,
      ...(this.alchemyPanel?.state?.presets ?? []).filter((preset) => preset.recipeId === recipeId),
    ];
  }

  private buildLocalCraftFormulaPresetKey(kind: 'alchemy' | 'forging', recipeId: string): string {
    return `${kind}:${recipeId}`;
  }

  private ensureLocalCraftFormulaPresetsLoaded(): void {
    if (this.localCraftFormulaPresetsLoaded) {
      return;
    }
    this.localCraftFormulaPresetsLoaded = true;
    this.localCraftFormulaPresets.clear();
    try {
      const raw = window.localStorage.getItem('mud.craft.localFormulas.v1');
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return;
      }
      for (const entry of parsed) {
        const kind = entry?.kind === 'forging' ? 'forging' : 'alchemy';
        const recipeId = typeof entry?.recipeId === 'string' ? entry.recipeId.trim() : '';
        const presetId = typeof entry?.presetId === 'string' ? entry.presetId.trim() : '';
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        if (!recipeId || !presetId || !name) {
          continue;
        }
        const key = this.buildLocalCraftFormulaPresetKey(kind, recipeId);
        const list = this.localCraftFormulaPresets.get(key) ?? [];
        list.push({
          presetId,
          recipeId,
          name,
          ingredients: normalizeLocalAlchemyIngredients(entry.ingredients),
          updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0)),
        });
        this.localCraftFormulaPresets.set(key, list);
      }
    } catch {
      this.localCraftFormulaPresets.clear();
    }
  }

  private persistLocalCraftFormulaPresets(): void {
    const payload: Array<PlayerAlchemyPreset & { kind: 'alchemy' | 'forging' }> = [];
    for (const [key, presets] of this.localCraftFormulaPresets.entries()) {
      const [kind] = key.split(':');
      for (const preset of presets) {
        payload.push({
          kind: kind === 'forging' ? 'forging' : 'alchemy',
          ...preset,
          ingredients: cloneAlchemyIngredients(preset.ingredients),
        });
      }
    }
    try {
      window.localStorage.setItem('mud.craft.localFormulas.v1', JSON.stringify(payload));
    } catch {
      // localStorage 失败不影响服务端权威制造。
    }
  }

  private saveLocalCraftFormulaPreset(recipe: AlchemyRecipeCatalogEntry): void {
    const kind = this.activeMode === 'forging' ? 'forging' : 'alchemy';
    const key = this.buildLocalCraftFormulaPresetKey(kind, recipe.recipeId);
    const list = this.localCraftFormulaPresets.get(key) ?? [];
    const existingIndex = this.selectedAlchemyPresetId
      ? list.findIndex((preset) => preset.presetId === this.selectedAlchemyPresetId)
      : -1;
    const now = Date.now();
    const preset: PlayerAlchemyPreset = {
      presetId: existingIndex >= 0 ? list[existingIndex].presetId : `local:${kind}:${recipe.recipeId}:${now.toString(36)}`,
      recipeId: recipe.recipeId,
      name: existingIndex >= 0 ? list[existingIndex].name : `${recipe.outputName}${kind === 'forging' ? '自定义器方' : '自定义丹方'}${list.length + 1}`,
      ingredients: this.getAlchemySubmittedDraftIngredients(recipe.recipeId),
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1, preset);
    } else {
      list.unshift(preset);
    }
    this.localCraftFormulaPresets.set(key, list.slice(0, 24));
    this.selectedAlchemyPresetId = preset.presetId;
    this.persistLocalCraftFormulaPresets();
  }

  private deleteLocalCraftFormulaPreset(recipeId: string, presetId: string): boolean {
    const kind = this.activeMode === 'forging' ? 'forging' : 'alchemy';
    const key = this.buildLocalCraftFormulaPresetKey(kind, recipeId);
    const list = this.localCraftFormulaPresets.get(key) ?? [];
    const next = list.filter((preset) => preset.presetId !== presetId);
    if (next.length === list.length) {
      return false;
    }
    this.localCraftFormulaPresets.set(key, next);
    this.selectedAlchemyPresetId = null;
    this.persistLocalCraftFormulaPresets();
    return true;
  }

  private getFullAlchemyIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    return this.getAlchemyMainIngredients(recipe).concat(
      recipe.ingredients
        .filter((ingredient) => ingredient.role !== 'main')
        .map((ingredient) => ({ itemId: ingredient.itemId, count: ingredient.count })),
    );
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
    const result: AlchemyIngredientSelection[] = this.getAlchemyMainIngredients(recipe);
    const mainIds = new Set(result.map((entry) => entry.itemId));
    for (const [itemId, count] of draft.entries()) {
      const normalizedItemId = itemId.trim();
      const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
      if (!normalizedItemId || mainIds.has(normalizedItemId)) {
        continue;
      }
      result.push({ itemId: normalizedItemId, count: normalizedCount });
    }
    return result;
  }

  private getAlchemySubmittedDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    const mainIds = new Set(this.getAlchemyMainIngredients(recipe).map((entry) => entry.itemId));
    return this.getAlchemyDraftIngredients(recipeId).filter((entry) => mainIds.has(entry.itemId) || entry.count > 0);
  }

  private setAlchemyDraft(recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    const next = new Map<string, number>();
    const mainIngredients = this.getAlchemyMainIngredients(recipe);
    for (const ingredient of mainIngredients) {
      next.set(ingredient.itemId, ingredient.count);
    }
    const mainIds = new Set(mainIngredients.map((ingredient) => ingredient.itemId));
    for (const ingredient of ingredients) {
      const itemId = typeof ingredient.itemId === 'string' ? ingredient.itemId.trim() : '';
      if (!itemId || mainIds.has(itemId)) {
        continue;
      }
      const count = Math.max(0, Math.floor(Number(ingredient.count) || 0));
      next.set(itemId, (next.get(itemId) ?? 0) + count);
    }
    this.draftByRecipeId.set(recipeId, next);
  }

  private getAlchemyMainIngredients(recipe: AlchemyRecipeCatalogEntry): AlchemyIngredientSelection[] {
    const source = (recipe.mainIngredients && recipe.mainIngredients.length > 0)
      ? recipe.mainIngredients
      : recipe.ingredients.filter((ingredient) => ingredient.role === 'main');
    return source.map((ingredient) => ({
      itemId: ingredient.itemId,
      count: ingredient.count,
    }));
  }

  private adjustAlchemyAuxCount(recipeId: string, itemId: string, delta: number): void {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    if (this.getAlchemyMainIngredients(recipe).some((entry) => entry.itemId === itemId)) {
      return;
    }
    if (!this.getAlchemyMaterialElements(itemId)) {
      return;
    }
    if (!this.draftByRecipeId.has(recipeId)) {
      this.setAlchemyDraft(recipeId, this.getFullAlchemyIngredients(recipeId));
    }
    const draft = this.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
    const current = draft.get(itemId) ?? 0;
    const next = Math.max(0, current + delta);
    draft.set(itemId, next);
    this.draftByRecipeId.set(recipeId, draft);
  }

  private removeAlchemyAuxItem(recipeId: string, itemId: string): void {
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe || this.getAlchemyMainIngredients(recipe).some((entry) => entry.itemId === itemId)) {
      return;
    }
    if (!this.draftByRecipeId.has(recipeId)) {
      this.setAlchemyDraft(recipeId, this.getFullAlchemyIngredients(recipeId));
    }
    const draft = this.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
    draft.delete(itemId);
    this.draftByRecipeId.set(recipeId, draft);
  }

  private getAlchemyInventoryCount(itemId: string): number {
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private getAlchemyMaterialElements(itemId: string): CraftElementVector | undefined {
    const inventoryItem = this.inventory.items.find((item) => item.itemId === itemId && item.materialValues?.elements);
    if (inventoryItem?.materialValues?.elements) {
      return inventoryItem.materialValues.elements;
    }
    return getLocalItemTemplate(itemId)?.materialValues?.elements;
  }

  private buildAlchemyMainElements(recipe: AlchemyRecipeCatalogEntry): CraftElementVector {
    const result = createEmptyCraftElementVector();
    for (const ingredient of this.getAlchemyMainIngredients(recipe)) {
      const elements = this.getAlchemyMaterialElements(ingredient.itemId);
      if (elements) {
        addCraftElementVector(result, elements, ingredient.count);
      }
    }
    return compactCraftElementVector(result);
  }

  private buildAlchemyRequiredElements(recipe: AlchemyRecipeCatalogEntry): CraftElementVector {
    const result = createEmptyCraftElementVector();
    addCraftElementVector(result, recipe.requiredAuxElements, 1);
    addCraftElementVector(result, this.buildAlchemyMainElements(recipe), 1);
    return compactCraftElementVector(result);
  }

  private buildAlchemyInputElements(
    ingredients: readonly AlchemyIngredientSelection[],
  ): CraftElementVector {
    const result = createEmptyCraftElementVector();
    for (const ingredient of ingredients) {
      const elements = this.getAlchemyMaterialElements(ingredient.itemId);
      if (elements) {
        addCraftElementVector(result, elements, ingredient.count);
      }
    }
    return compactCraftElementVector(result);
  }

  private openAlchemyMaterialPickerModal(): void {
    const recipe = this.getSelectedAlchemyRecipe();
    if (!recipe) {
      return;
    }
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.ALCHEMY_MATERIAL_PICKER_OWNER,
      title: this.activeMode === 'forging' ? '选择辅材' : '选择辅药',
      subtitle: recipe.outputName,
      bodyHtml: this.renderAlchemyMaterialPickerBody(recipe),
      hideActions: true,
    });
    this.bindAlchemyMaterialPickerEvents();
  }

  private renderAlchemyMaterialPickerBody(recipe: AlchemyRecipeCatalogEntry): string {
    const candidates = this.getAlchemyMaterialPickerCandidates(recipe);
    const sortButton = (key: AlchemyMaterialPickerSortKey, label: string) => `
      <button class="alchemy-material-picker-sort ${this.alchemyMaterialPickerSortKey === key ? 'active' : ''}" type="button" data-alchemy-material-sort="${key}">
        ${label}${this.alchemyMaterialPickerSortKey === key ? (this.alchemyMaterialPickerSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    `;
    return `
      <div class="alchemy-material-picker">
        <input class="alchemy-material-picker-search" type="search" value="${escapeHtml(this.alchemyMaterialPickerQuery)}" placeholder="搜索材料" data-alchemy-material-search="true">
        <div class="alchemy-material-picker-table">
          <div class="alchemy-material-picker-head">
            ${sortButton('name', '名称')}
            ${sortButton('level', '等级')}
            ${sortButton('grade', '品阶')}
            ${sortButton('metal', '金')}
            ${sortButton('wood', '木')}
            ${sortButton('water', '水')}
            ${sortButton('fire', '火')}
            ${sortButton('earth', '土')}
            ${sortButton('count', '数量')}
            <span></span>
          </div>
          <div class="alchemy-material-picker-list">
            ${candidates.length > 0 ? candidates.map((candidate) => `
              <button class="alchemy-material-picker-row" type="button" data-alchemy-material-add="${escapeHtml(candidate.itemId)}">
                <span>${this.renderAlchemyItemReference(candidate.itemId, candidate.name, 'material')}</span>
                <span>${formatDisplayInteger(candidate.level)}</span>
                <span>${escapeHtml(candidate.gradeLabel)}</span>
                ${ELEMENT_KEYS.map((element) => `<span>${this.formatAlchemyPickerElementValue(candidate.elements[element])}</span>`).join('')}
                <span>${formatDisplayInteger(candidate.count)}</span>
                <span class="alchemy-material-picker-add">添加</span>
              </button>
            `).join('') : '<div class="alchemy-material-picker-empty">没有可用材料</div>'}
          </div>
        </div>
      </div>
    `;
  }

  private getAlchemyMaterialPickerCandidates(recipe: AlchemyRecipeCatalogEntry): Array<{
    itemId: string;
    name: string;
    level: number;
    grade: string;
    gradeLabel: string;
    count: number;
    elements: Record<AlchemyMaterialPickerSortKey, number>;
  }> {
    const mainIds = new Set(this.getAlchemyMainIngredients(recipe).map((ingredient) => ingredient.itemId));
    const byItemId = new Map<string, {
      itemId: string;
      name: string;
      level: number;
      grade: string;
      gradeLabel: string;
      count: number;
      elements: Record<AlchemyMaterialPickerSortKey, number>;
    }>();
    for (const item of this.inventory.items) {
      if (mainIds.has(item.itemId)) {
        continue;
      }
      const template = getLocalItemTemplate(item.itemId);
      if (item.type !== 'material' && template?.type !== 'material') {
        continue;
      }
      const materialElements = this.getAlchemyMaterialElements(item.itemId);
      if (!materialElements) {
        continue;
      }
      const existing = byItemId.get(item.itemId);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      const grade = String(item.grade ?? template?.grade ?? 'mortal');
      byItemId.set(item.itemId, {
        itemId: item.itemId,
        name: item.name ?? template?.name ?? item.itemId,
        level: Math.max(1, Math.floor(Number(item.level ?? template?.level) || 1)),
        grade,
        gradeLabel: getTechniqueGradeLabel(grade as never),
        count: Math.max(0, Math.floor(Number(item.count) || 0)),
        elements: {
          name: 0,
          level: 0,
          grade: 0,
          count: 0,
          metal: Number(materialElements.metal) || 0,
          wood: Number(materialElements.wood) || 0,
          water: Number(materialElements.water) || 0,
          fire: Number(materialElements.fire) || 0,
          earth: Number(materialElements.earth) || 0,
        },
      });
    }
    const query = this.alchemyMaterialPickerQuery.trim().toLocaleLowerCase();
    const candidates = Array.from(byItemId.values())
      .filter((candidate) => !query || candidate.name.toLocaleLowerCase().includes(query) || candidate.itemId.toLocaleLowerCase().includes(query));
    const direction = this.alchemyMaterialPickerSortDirection === 'desc' ? -1 : 1;
    const gradeOrder = (grade: string) => {
      const index = TECHNIQUE_GRADE_ORDER.indexOf(grade as never);
      return index >= 0 ? index : -1;
    };
    candidates.sort((left, right) => {
      const key = this.alchemyMaterialPickerSortKey;
      if (key === 'name') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN') * direction;
      }
      if (key === 'grade') {
        return (gradeOrder(left.grade) - gradeOrder(right.grade)) * direction || left.name.localeCompare(right.name, 'zh-Hans-CN');
      }
      if (key === 'level' || key === 'count') {
        return ((left[key] as number) - (right[key] as number)) * direction || left.name.localeCompare(right.name, 'zh-Hans-CN');
      }
      return ((left.elements[key] ?? 0) - (right.elements[key] ?? 0)) * direction || left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
    return candidates;
  }

  private formatAlchemyPickerElementValue(value: number | undefined): string {
    const numeric = Number(value) || 0;
    return numeric === 0 ? '-' : escapeHtml(formatDisplaySignedNumber(numeric));
  }

  private openAlchemyPresetPickerModal(presetId?: string): void {
    const recipe = this.getSelectedAlchemyRecipe();
    if (!recipe) {
      return;
    }
    const presets = this.getAlchemyRecipePresets(recipe.recipeId);
    const selectedId = presetId?.trim()
      || this.alchemyPresetPickerSelectedId
      || this.selectedAlchemyPresetId
      || presets[0]?.presetId
      || null;
    this.alchemyPresetPickerSelectedId = presets.some((preset) => preset.presetId === selectedId)
      ? selectedId
      : presets[0]?.presetId ?? null;
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER,
      title: this.activeMode === 'forging' ? '加载自定义器方' : '加载自定义丹方',
      subtitle: recipe.outputName,
      bodyHtml: this.renderAlchemyPresetPickerBody(recipe),
      hideActions: true,
      onClose: () => {
        this.alchemyPresetPickerSelectedId = null;
      },
    });
    this.bindAlchemyPresetPickerEvents();
  }

  private renderAlchemyPresetPickerBody(recipe: AlchemyRecipeCatalogEntry): string {
    const presets = this.getAlchemyRecipePresets(recipe.recipeId);
    const selectedPreset = this.alchemyPresetPickerSelectedId
      ? presets.find((preset) => preset.presetId === this.alchemyPresetPickerSelectedId) ?? null
      : null;
    const emptyText = this.activeMode === 'forging'
      ? '当前器物还没有保存的自定义器方。'
      : '当前丹药还没有保存的自定义丹方。';
    return `
      <div class="alchemy-preset-picker">
        <div class="alchemy-preset-picker-list" data-alchemy-preset-picker-list="true">
          ${presets.length > 0
            ? presets.map((preset) => `
              <button
                class="alchemy-preset-picker-item ${selectedPreset?.presetId === preset.presetId ? 'active' : ''}"
                type="button"
                data-alchemy-preset-preview="${escapeHtmlAttr(preset.presetId)}">
                <span class="alchemy-preset-picker-item-name">${escapeHtml(preset.name)}</span>
                <span class="alchemy-preset-picker-item-meta">${escapeHtml(this.formatAlchemyPresetUpdatedAt(preset.updatedAt))}</span>
              </button>
            `).join('')
            : `<div class="alchemy-preset-picker-empty">${escapeHtml(emptyText)}</div>`}
        </div>
        <div class="alchemy-preset-picker-detail" data-alchemy-preset-picker-detail="true">
          ${selectedPreset ? this.renderAlchemyPresetPickerDetail(recipe, selectedPreset) : `
            <div class="alchemy-preset-picker-empty alchemy-preset-picker-empty--detail">${escapeHtml(emptyText)}</div>
          `}
        </div>
      </div>
    `;
  }

  private renderAlchemyPresetPickerDetail(recipe: AlchemyRecipeCatalogEntry, preset: PlayerAlchemyPreset): string {
    const ingredients = this.buildAlchemyPresetPreviewIngredients(recipe, preset);
    const inputElements = this.buildAlchemyInputElements(ingredients);
    const requiredElements = this.buildAlchemyRequiredElements(recipe);
    return `
      <div class="alchemy-preset-picker-detail-head">
        <div>
          <div class="alchemy-preset-picker-title">${escapeHtml(preset.name)}</div>
          <div class="alchemy-preset-picker-subtitle">${escapeHtml(this.activeMode === 'forging' ? '自定义器方' : '自定义丹方')}</div>
        </div>
        <button class="small-btn" type="button" data-alchemy-preset-load="${escapeHtmlAttr(preset.presetId)}">${escapeHtml(this.activeMode === 'forging' ? '加载选中器方' : '加载选中丹方')}</button>
      </div>
      <section class="alchemy-fivephase-panel alchemy-preset-picker-fivephase">
        <div class="alchemy-fivephase-block">
          <div class="alchemy-fivephase-title">五行 当前 / 需要</div>
          ${this.renderAlchemyElementRatioGrid(inputElements, requiredElements)}
        </div>
      </section>
      <div class="alchemy-preset-picker-materials">
        ${ingredients.map((ingredient) => {
          const isMain = this.getAlchemyMainIngredients(recipe).some((entry) => entry.itemId === ingredient.itemId);
          return `
            <div class="alchemy-preset-picker-material-row">
              <span>${this.renderAlchemyItemReference(ingredient.itemId, this.resolveAlchemyMaterialName(recipe, ingredient.itemId), 'material')}</span>
              <span class="alchemy-ingredient-role ${isMain ? 'main' : 'aux'}">${escapeHtml(this.activeMode === 'forging' ? (isMain ? '主材' : '辅材') : (isMain ? '主药' : '辅药'))}</span>
              <span>${formatDisplayInteger(ingredient.count)}</span>
              <span>${escapeHtml(this.formatAlchemyElementVector(this.getAlchemyMaterialElements(ingredient.itemId)))}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private buildAlchemyPresetPreviewIngredients(
    recipe: AlchemyRecipeCatalogEntry,
    preset: PlayerAlchemyPreset,
  ): AlchemyIngredientSelection[] {
    const mainIngredients = this.getAlchemyMainIngredients(recipe);
    const mainIds = new Set(mainIngredients.map((ingredient) => ingredient.itemId));
    const merged = new Map<string, number>();
    for (const ingredient of mainIngredients) {
      merged.set(ingredient.itemId, ingredient.count);
    }
    for (const ingredient of preset.ingredients) {
      const itemId = typeof ingredient.itemId === 'string' ? ingredient.itemId.trim() : '';
      const count = Math.max(0, Math.floor(Number(ingredient.count) || 0));
      if (!itemId || mainIds.has(itemId) || count <= 0) {
        continue;
      }
      merged.set(itemId, (merged.get(itemId) ?? 0) + count);
    }
    return Array.from(merged.entries()).map(([itemId, count]) => ({ itemId, count }));
  }

  private renderAlchemyElementRatioGrid(
    currentElements: CraftElementVector | undefined,
    requiredElements: CraftElementVector | undefined,
  ): string {
    const labels: Record<string, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
    return `
      <div class="alchemy-element-grid">
        ${ELEMENT_KEYS.map((element) => {
          const current = Number(currentElements?.[element]) || 0;
          const required = Number(requiredElements?.[element]) || 0;
          const currentText = current < 0 ? `-${formatDisplayInteger(Math.abs(current))}` : formatDisplayInteger(current);
          const requiredText = required === 0 ? '-' : formatDisplayInteger(required);
          const valueText = required === 0 && current === 0 ? '-' : `${currentText}/${requiredText}`;
          return `
            <div class="alchemy-element-cell">
              <span class="alchemy-element-label">${labels[element]}</span>
              <strong class="alchemy-element-value">${escapeHtml(valueText)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private formatAlchemyPresetUpdatedAt(value: number | undefined): string {
    const timestamp = Math.floor(Number(value) || 0);
    if (timestamp <= 0) {
      return '未记录时间';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '未记录时间';
    }
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private bindAlchemyPresetPickerEvents(): void {
    const root = document.querySelector<HTMLElement>('.alchemy-preset-picker');
    if (!root) {
      return;
    }
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-preset-preview]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetId = button.dataset.alchemyPresetPreview?.trim() ?? '';
        if (!presetId) {
          return;
        }
        this.openAlchemyPresetPickerModal(presetId);
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-preset-load]').forEach((button) => {
      button.addEventListener('click', () => {
        const recipeId = this.selectedAlchemyRecipeId;
        const presetId = button.dataset.alchemyPresetLoad?.trim() ?? '';
        if (!recipeId || !presetId) {
          return;
        }
        const preset = this.getAlchemyRecipePresets(recipeId).find((entry) => entry.presetId === presetId);
        if (!preset) {
          return;
        }
        this.selectedAlchemyPresetId = presetId;
        this.setAlchemyDraft(recipeId, preset.ingredients);
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
        this.render();
      });
    });
    bindInlineItemTooltips(root);
  }

  private bindAlchemyMaterialPickerEvents(): void {
    const root = document.querySelector<HTMLElement>('.alchemy-material-picker');
    if (!root) {
      return;
    }
    const search = root.querySelector<HTMLInputElement>('[data-alchemy-material-search="true"]');
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
    search?.addEventListener('input', () => {
      this.alchemyMaterialPickerQuery = search.value;
      this.openAlchemyMaterialPickerModal();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-material-sort]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.alchemyMaterialSort as AlchemyMaterialPickerSortKey | undefined;
        if (!key) {
          return;
        }
        if (this.alchemyMaterialPickerSortKey === key) {
          this.alchemyMaterialPickerSortDirection = this.alchemyMaterialPickerSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.alchemyMaterialPickerSortKey = key;
          this.alchemyMaterialPickerSortDirection = key === 'name' ? 'asc' : 'desc';
        }
        this.openAlchemyMaterialPickerModal();
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-material-add]').forEach((button) => {
      button.addEventListener('click', () => {
        const recipeId = this.selectedAlchemyRecipeId;
        const itemId = button.dataset.alchemyMaterialAdd?.trim() ?? '';
        if (!recipeId || !itemId) {
          return;
        }
        this.selectedAlchemyPresetId = null;
        this.adjustAlchemyAuxCount(recipeId, itemId, 1);
        this.render();
        this.openAlchemyMaterialPickerModal();
      });
    });
  }

  private getAlchemySpiritStoneOwnedCount(): number {
    return this.getAlchemyInventoryCount('spirit_stone');
  }

  private getAlchemyFurnaceBonuses(): { successRate: number; speedRate: number } {
    const toolStats = this.alchemyPanel?.state?.toolStats;
    const skillKind = this.activeMode === 'forging' ? 'forging' : 'alchemy';
    return {
      successRate: readCraftToolStat(toolStats, skillKind, 'successRate'),
      speedRate: readCraftToolStat(toolStats, skillKind, 'speedRate'),
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

  private formatAlchemyElementVector(elements: CraftElementVector | undefined): string {
    const labels: Record<string, string> = {
      metal: '金',
      wood: '木',
      water: '水',
      fire: '火',
      earth: '土',
    };
    const parts = ELEMENT_KEYS
      .map((element) => {
        const value = Number(elements?.[element]) || 0;
        return value !== 0 ? `${labels[element]}${formatDisplaySignedNumber(value)}` : '';
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : '无';
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
    const submittedIngredients = latestRequest.ingredients.filter((entry) => entry.count > 0);
    start?.(
      latestRequest.recipeId,
      submittedIngredients.map((entry) => ({ itemId: entry.itemId, count: entry.count })),
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

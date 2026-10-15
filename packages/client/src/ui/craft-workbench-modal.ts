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
  S2C_TechniqueTransmissionStatuses,
  TechniqueAggregationCatalogChangedView,
  TechniqueAggregationLearnRequest,
  TechniqueAggregationPanelView,
  TechniqueAggregationPreviewRequest,
  TechniqueAggregationPublishRequest,
  TechniqueAggregationResultView,
  TechniqueActivityCancelRef,
  TechniqueActivityQueueReorderAction,
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
  computeAlchemyRawBrewTicks,
  computeAlchemyTotalJobTicks,
  createEmptyCraftElementVector,
  getAlchemySpiritStoneCost,
  normalizeEnhanceLevel,
  normalizeAlchemyQuantity,
} from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
import { resolveClientItemBaseName } from '../content/item-display-name';
import { getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplaySignedNumber } from '../utils/number';
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
import { CraftAlchemyView } from './craft-alchemy-view';
import type { CraftAlchemyParent } from './craft-alchemy-view';
import { CraftCatalogCache, type CraftCatalogKind } from './craft-catalog-cache';
import { CraftEnhancementView } from './craft-enhancement-view';
import type { CraftEnhancementParent } from './craft-enhancement-view';
import { CraftQueueView } from './craft-queue-view';
import type { CraftQueueParent } from './craft-queue-view';
import { CraftTransmissionView } from './craft-transmission-view';
import type { CraftTransmissionCallbacks, CraftTransmissionParent } from './craft-transmission-view';
import type { AccessPolicySocketClient } from './access-policy-socket-client';
import {
  getReactCraftWorkbenchState,
  mountReactCraftWorkbenchPanel,
  setReactCraftWorkbenchAfterContentRender,
  shouldUseReactCraftWorkbenchPanel,
  syncReactCraftWorkbenchState,
  unmountReactCraftWorkbenchPanel,
} from '../react-ui/panels/craft/mount-craft-workbench-panel';
import {
  renderCraftQueuePanelImpl,
  renderCraftQueuePanelContentImpl,
  getCraftQueueKindLabelImpl,
  getCraftQueueStatusLabelImpl,
  renderCraftQueueItemMetaImpl,
  renderCraftQueueItemProgressImpl,
  patchCraftQueueProgressImpl,
  patchCraftQueuePanelImpl,
  refreshQueueFloatingPanelImpl,
  ensureQueueFloatingPanelImpl,
  buildFloatingQueueStructureKeyImpl,
  renderFloatingQueueListImpl,
  renderFloatingQueueItemImpl,
  resolveFloatingQueueProgressImpl,
  patchFloatingQueueProgressImpl,
  bindQueueFloatingEventsImpl,
  buildCraftHeaderKeyImpl,
  buildCraftQueueStructureKeyImpl,
  buildCraftTabsKeyImpl,
  renderCraftModeTabsImpl,
  renderForgingPlaceholderImpl,
  getCraftProfessionTitleImpl,
  getCraftProfessionDescriptionImpl,
  getCraftQueueSnapshotImpl,
  dispatchQueueCancellationImpl,
} from './craft-workbench-modal.queue';
import {
  ensureAlchemySelectionImpl,
  ensureAlchemyDraftImpl,
  getVisibleAlchemyRecipesImpl,
  getSelectedAlchemyRecipeImpl,
  tryPatchAlchemyBodyImpl,
  renderAlchemyBodyImpl,
  renderAlchemyItemReferenceImpl,
  resolveAlchemyMaterialNameImpl,
  buildLocalCraftFormulaPresetKeyImpl,
  ensureLocalCraftFormulaPresetsLoadedImpl,
  persistLocalCraftFormulaPresetsImpl,
  saveLocalCraftFormulaPresetImpl,
  deleteLocalCraftFormulaPresetImpl,
  getFullAlchemyIngredientsImpl,
  getAlchemyDraftIngredientsImpl,
  getAlchemySubmittedDraftIngredientsImpl,
  setAlchemyDraftImpl,
  getAlchemyMainIngredientsImpl,
  adjustAlchemyAuxCountImpl,
  removeAlchemyAuxItemImpl,
  getAlchemyInventoryCountImpl,
  getAlchemyMaterialElementsImpl,
  buildAlchemyMainElementsImpl,
  buildAlchemyRequiredElementsImpl,
  buildAlchemyInputElementsImpl,
  openAlchemyMaterialPickerModalImpl,
  renderAlchemyMaterialPickerBodyImpl,
  getAlchemyMaterialPickerCandidatesImpl,
  formatAlchemyPickerElementValueImpl,
  openAlchemyPresetPickerModalImpl,
  renderAlchemyPresetPickerBodyImpl,
  renderAlchemyPresetPickerDetailImpl,
  buildAlchemyPresetPreviewIngredientsImpl,
  renderAlchemyElementRatioGridImpl,
  formatAlchemyPresetUpdatedAtImpl,
  bindAlchemyPresetPickerEventsImpl,
  bindAlchemyMaterialPickerEventsImpl,
  patchAlchemyMaterialPickerListImpl,
  renderAlchemyMaterialPickerListHtmlImpl,
  bindAlchemyMaterialPickerAddButtonsImpl,
  getAlchemySpiritStoneOwnedCountImpl,
  getAlchemyFurnaceBonusesImpl,
  getAlchemyBatchOutputSizeImpl,
  getAlchemyBatchOutputCountImpl,
  getAlchemySpiritStoneCostImpl,
  getCraftSkillLevelForActiveModeImpl,
  getAlchemyRawBrewTicksImpl,
  getAlchemyAdjustedBrewTicksImpl,
  formatAlchemyElementVectorImpl,
  getAlchemyMaxCraftQuantityImpl,
  getAlchemySelectedQuantityImpl,
  setAlchemySelectedQuantityImpl,
  openAlchemyConfirmImpl,
  parseAlchemyConfirmQuantityImpl,
  buildAlchemyConfirmStateImpl,
  renderAlchemyConfirmBodyImpl,
  bindAlchemyConfirmEventsImpl,
  syncAlchemyConfirmStateImpl,
  normalizeQueueStartModeImpl,
  submitAlchemyConfirmImpl,
  syncAlchemyConfirmModalImpl,
} from './craft-workbench-modal.alchemy';

export type CraftWorkbenchCallbacks = {
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
  onReorderTechniqueActivityQueue: (queueId: string, action: TechniqueActivityQueueReorderAction) => void;
  onStartEnhancement: (payload: C2S_StartEnhancement) => void;
  onCancelEnhancement: () => void;
  onStartTransmission?: (learnerPlayerId: string, techId: string, options?: { mode?: 'transmission' | 'craft_book' | 'scripture_recording' | 'scripture_contemplation'; maxLevel?: number; buildingId?: string }) => void;
  onCancelTransmission?: (techId: string) => void;
  onDiscardTechniqueComprehension?: (techId: string) => void;
  onDecomposeTechniqueBook?: (itemInstanceId: string, count: number) => void;
  onRequestTechniqueAggregation?: (payload: TechniqueAggregationPreviewRequest) => boolean | void;
  onCloseTechniqueAggregation?: () => boolean | void;
  onPublishTechniqueAggregation?: (payload: TechniqueAggregationPublishRequest) => boolean | void;
  onLearnTechniqueAggregation?: (payload: TechniqueAggregationLearnRequest) => boolean | void;
  getTransmissionTargets?: () => Array<{ playerId: string; name: string }>;
};

export type CraftMode = 'alchemy' | 'forging' | 'enhancement' | 'transmission' | 'technique_refining' | null;
export type AlchemyTab = 'full' | 'simple';
export type AlchemyRealmTab = 'mortal' | 'qi' | 'foundation';
export type AlchemyMaterialPickerSortKey = 'name' | 'level' | 'grade' | 'metal' | 'wood' | 'water' | 'fire' | 'earth' | 'count';
export type CraftQueueProgressView = {
  ratio: number;
  label: string;
  detail: string;
};
export type CraftQueueDisplayItem = CraftQueueItemView & {
  isActive?: boolean;
  progress?: CraftQueueProgressView;
  interruptProgress?: CraftQueueProgressView | null;
};

export type ConfirmStartRequest = {
  recipeId: string;
  ingredients: AlchemyIngredientSelection[];
  mode: AlchemyTab;
};

export const FORGING_INITIAL_RECIPES = [
  { outputItemId: 'equip.copper_enhancement_hammer', outputName: t('craft.workbench.initial-copper-hammer'), note: t('craft.workbench.initial-copper-hammer-note') },
  { outputItemId: 'equip.copper_pill_furnace', outputName: t('craft.workbench.initial-copper-furnace'), note: t('craft.workbench.initial-copper-furnace-note') },
  { outputItemId: 'equip.copper_forging_tool', outputName: t('craft.workbench.initial-copper-forging-tool'), note: t('craft.workbench.initial-copper-forging-tool-note') },
  { outputItemId: 'equip.copper_building_hammer', outputName: t('craft.workbench.initial-copper-building-hammer'), note: t('craft.workbench.initial-copper-building-hammer-note') },
  { outputItemId: 'equip.copper_luopan', outputName: t('craft.workbench.initial-copper-luopan'), note: t('craft.workbench.initial-copper-luopan-note') },
  { outputItemId: 'formation_disk.mortal', outputName: t('craft.workbench.initial-copper-array-plate'), note: t('craft.workbench.initial-copper-array-plate-note') },
];

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

export function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

export function buildEnhancementTargetKey(ref: EnhancementTargetRef): string {
  return ref.source === 'equipment'
    ? `equipment:${ref.slot ?? ''}`
    : `inventory:${normalizeInventoryItemInstanceId(ref.itemInstanceId)}`;
}

export function normalizeInventoryItemInstanceId(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

export function normalizeComprehensionSpeedRate(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function readCraftToolStat(
  stats: CraftEffectStatsPatch | null | undefined,
  skillKind: CraftEffectSkillKind,
  effectKind: 'successRate' | 'speedRate' | 'outputRate' | 'expRate',
): number {
  const value = Number(stats?.[skillKind]?.[effectKind]);
  return Number.isFinite(value)
    ? value
    : 0;
}

export function createEmptyEquipmentSlots(): EquipmentSlots {
  return Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null])) as EquipmentSlots;
}

export const UNKNOWN_ITEM_NAME = '未知物品';

export function cloneEnhancementRecord(record: PlayerEnhancementRecord): PlayerEnhancementRecord {
  const itemName = typeof record.itemName === 'string' ? record.itemName.trim() : '';
  return {
    itemId: record.itemId,
    ...(itemName ? { itemName } : {}),
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

export function normalizeEnhancementRecordList(records: PlayerEnhancementRecord[] | null | undefined): PlayerEnhancementRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }
  return records
    .filter((entry): entry is PlayerEnhancementRecord => Boolean(entry?.itemId))
    .map((entry) => cloneEnhancementRecord(entry));
}

export function cloneAlchemyIngredients(
  ingredients: readonly AlchemyIngredientSelection[],
): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

export function normalizeLocalAlchemyIngredients(value: unknown): AlchemyIngredientSelection[] {
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

export function getAlchemyRealmTab(level: number): AlchemyRealmTab {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (normalizedLevel >= 31) {
    return 'foundation';
  }
  if (normalizedLevel >= 19) {
    return 'qi';
  }
  return 'mortal';
}

export function normalizeAlchemyRealm(value: string | undefined): AlchemyRealmTab {
  if (value === 'qi' || value === 'foundation') {
    return value;
  }
  return 'mortal';
}

export function normalizeAlchemyCategory(value: string | undefined): AlchemyRecipeCategory {
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

export function normalizeTechniqueActivityKind(value: string | undefined): RuntimeTechniqueActivityKind {
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
  static readonly MODAL_OWNER = 'craft-workbench-modal';
  static readonly ALCHEMY_CONFIRM_OWNER = 'craft-workbench-modal:alchemy-confirm';
  static readonly ALCHEMY_MATERIAL_PICKER_OWNER = 'craft-workbench-modal:alchemy-material-picker';
  static readonly ALCHEMY_PRESET_PICKER_OWNER = 'craft-workbench-modal:alchemy-preset-picker';

  callbacks: CraftWorkbenchCallbacks | null = null;
  activeMode: CraftMode = null;
  loading = false;

  alchemyPanel: S2C_AlchemyPanel | null = null;
  enhancementPanel: S2C_EnhancementPanel | null = null;
  techniqueActivityTasksSynced = false;
  techniqueActivityTasks: TechniqueActivityTaskView[] = [];
  readonly craftCatalogCache = new CraftCatalogCache();
  alchemyCatalogVersion = 0;
  alchemyCatalog: AlchemyRecipeCatalogEntry[] = [];
  alchemySkillLevel = 1;
  forgingSkillLevel = 1;
  gatherSkillLevel = 1;
  enhancementSkillLevel = 1;
  transmissionSkillLevel = 1;
  playerComprehensionSpeedRate = 0;
  playerLuck = 0;
  transmissionTechniques: PlayerState['techniques'] = [];
  pendingTechniqueComprehensions: PlayerState['pendingTechniqueComprehensions'] = [];
  playerRealmLv: number | null = null;
  inventory: PlayerState['inventory'] = { items: [], capacity: 0 };
  equipment: EquipmentSlots = createEmptyEquipmentSlots();
  activeAlchemyCategory: AlchemyRecipeCategory = 'recovery';
  activeAlchemyRealm: AlchemyRealmTab = 'mortal';
  activeAlchemyTab: AlchemyTab = 'full';
  selectedAlchemyRecipeId: string | null = null;
  selectedAlchemyPresetId: string | null = null;
  draftByRecipeId = new Map<string, Map<string, number>>();
  localCraftFormulaPresets = new Map<string, PlayerAlchemyPreset[]>();
  localCraftFormulaPresetsLoaded = false;
  alchemyMaterialPickerQuery = '';
  alchemyMaterialPickerSortKey: AlchemyMaterialPickerSortKey = 'name';
  alchemyMaterialPickerSortDirection: 'asc' | 'desc' = 'asc';
  alchemyPresetPickerSelectedId: string | null = null;
  quantityByRecipeId = new Map<string, number>();
  confirmStartRequest: ConfirmStartRequest | null = null;
  confirmQuantityDraft = '1';
  confirmEventsBound = false;
  selectedEnhancementTargetKey: string | null = null;
  selectedEnhancementTargetLevel: number | null = null;
  selectedEnhancementProtectionKey: string | null = null;
  selectedEnhancementProtectionStartLevel: number | null = null;
  enhancementResponseError: string | null = null;
  localEnhancementHistoryLoaded = false;
  localEnhancementHistoryRecords = new Map<string, PlayerEnhancementRecord>();
  localEnhancementHistorySessions: PlayerEnhancementRecord[] = [];
  lastServerEnhancementSessionRecord: PlayerEnhancementRecord | null = null;
  activeEnhancementHistoryItemId: string | null = null;
  activeEnhancementHistorySessionKey: string | null = null;
  enhancementHistoryExpanded = false;
  enhancementProtectionExpanded = false;
  lastEnhancementRenderKey: string | null = null;
  lastEnhancementCandidateSourceKey: string | null = null;
  /** 行动队列浮窗宿主，只展示技艺通用 job 的精简状态。 */
  queueFloatingPanel: FloatingListPanel | null = null;
  /** 行动队列浮窗当前绑定的事件。 */
  queueFloatingEvents: AbortController | null = null;

  /** @internal Sub-view delegates */
  readonly alchemyView = new CraftAlchemyView(this as unknown as CraftAlchemyParent);
  readonly enhancementView = new CraftEnhancementView(this as unknown as CraftEnhancementParent);
  readonly queueView = new CraftQueueView(this as unknown as CraftQueueParent);
  readonly transmissionView = new CraftTransmissionView(this as unknown as CraftTransmissionParent);

  constructor() {
    window.addEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, () => this.refreshQueueFloatingPanel());
  }

  setCallbacks(callbacks: CraftWorkbenchCallbacks): void {
    this.callbacks = callbacks;
  }

  setTransmissionCallbacks(callbacks: CraftTransmissionCallbacks): void {
    this.transmissionView.setCallbacks(callbacks);
  }

  setAccessPolicyClient(client: AccessPolicySocketClient, onSaved?: (message: string, kind?: 'success' | 'warn') => void): void {
    this.transmissionView.setAccessPolicyClient(client, (message) => onSaved?.(message, 'success'));
  }

  handleTransmissionStatuses(data: S2C_TechniqueTransmissionStatuses): void {
    this.transmissionView.handleTransmissionStatuses(data);
  }

  handleTechniqueAggregationPanel(data: TechniqueAggregationPanelView): void {
    this.transmissionView.handleTechniqueAggregationPanel(data);
  }

  handleTechniqueAggregationResult(data: TechniqueAggregationResultView): void {
    this.transmissionView.handleTechniqueAggregationResult(data);
  }

  handleTechniqueAggregationCatalogChanged(data: TechniqueAggregationCatalogChangedView): void {
    this.transmissionView.handleTechniqueAggregationCatalogChanged(data);
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
    this.alchemySkillLevel = Math.max(1, Math.floor(player.alchemySkill?.level ?? 1));
    this.forgingSkillLevel = Math.max(1, Math.floor(player.forgingSkill?.level ?? 1));
    this.gatherSkillLevel = Math.max(1, Math.floor(player.gatherSkill?.level ?? 1));
    this.enhancementSkillLevel = Math.max(1, Math.floor(player.enhancementSkill?.level ?? player.enhancementSkillLevel ?? 1));
    this.transmissionSkillLevel = Math.max(1, Math.floor(player.transmissionSkill?.level ?? 1));
    this.playerComprehensionSpeedRate = normalizeComprehensionSpeedRate(player.comprehensionSpeedRate);
    this.playerLuck = Math.max(0, Math.floor(Number(player.luck ?? 0) || 0));
    this.transmissionTechniques = Array.isArray(player.techniques) ? player.techniques : [];
    this.pendingTechniqueComprehensions = Array.isArray(player.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    this.playerRealmLv = Number.isFinite(Number(player.realm?.realmLv ?? player.realmLv))
      ? Math.max(1, Math.floor(Number(player.realm?.realmLv ?? player.realmLv)))
      : null;
    this.transmissionView.handleSessionBootstrap();
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
    if (update.comprehensionSpeedRate !== undefined) {
      this.playerComprehensionSpeedRate = normalizeComprehensionSpeedRate(update.comprehensionSpeedRate);
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
    if (player?.comprehensionSpeedRate !== undefined) {
      this.playerComprehensionSpeedRate = normalizeComprehensionSpeedRate(player.comprehensionSpeedRate);
    }
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
    this.transmissionView.resetTechniqueRefiningSelection();
    this.render();
  }

  openTechniqueAggregation(buildingId: string): void {
    this.activeMode = 'technique_refining';
    this.loading = false;
    this.transmissionView.resetTechniqueRefiningSelection();
    this.transmissionView.openTechniqueAggregation(buildingId);
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
    this.transmissionView.closeTransientUi();
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

  ensureAlchemySelection(): void {
    ensureAlchemySelectionImpl(this);
  }

  ensureAlchemyDraft(): void {
    ensureAlchemyDraftImpl(this);
  }

  render(): void {
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
        this.transmissionView.closeTransientUi();
        this.enhancementView.closeTransientUi();
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
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_MATERIAL_PICKER_OWNER);
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
        this.transmissionView.closeTransientUi();
        this.enhancementView.closeTransientUi();
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
      this.activeMode === 'transmission' ? this.transmissionView.buildTransmissionRenderKey() : '',
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
      if (this.transmissionView.tryPatchTechniqueRefiningBody(body)) {
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
    if (this.activeMode === 'transmission' && this.transmissionView.tryPatchTransmissionBody(body)) {
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
    const definition = this.getCurrentModalDefinition(this.activeMode === 'technique_refining');
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
      if (!this.transmissionView.tryPatchTechniqueRefiningBody(body)) {
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
      this.syncReactShell(definition, false);
      mountReactCraftWorkbenchPanel(body);
      this.patchCraftShellHeaderAndTabs(body);
      if ((this.activeMode === 'alchemy' || this.activeMode === 'forging') && this.tryPatchAlchemyBody(body)) {
        return;
      }
      if (this.activeMode === 'enhancement') {
        this.tryPatchEnhancementBody(body);
      }
      if (this.activeMode === 'transmission') {
        this.transmissionView.tryPatchTransmissionBody(body);
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
      this.transmissionView.tryPatchTransmissionBody(body);
    }
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

  private getCurrentModalDefinition(includeBody = true): { title: string; subtitle: string; variantClass: string; body: string } | null {
    if (this.activeMode === 'alchemy') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-alchemy',
        body: includeBody ? this.renderCraftBody() : '',
      };
    }
    if (this.activeMode === 'forging') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-forging',
        body: includeBody ? this.renderCraftBody() : '',
      };
    }
    if (this.activeMode === 'enhancement') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-enhancement',
        body: includeBody ? this.renderCraftBody() : '',
      };
    }
    if (this.activeMode === 'transmission') {
      return {
        title: t('craft.workbench.modal.title'),
        subtitle: this.getCraftSubtitle(),
        variantClass: 'detail-modal--craft detail-modal--craft-transmission',
        body: includeBody ? this.renderCraftBody() : '',
      };
    }
    if (this.activeMode === 'technique_refining') {
      const isUnification = this.transmissionView.isTechniqueAggregationOpen();
      return {
        title: isUnification ? '统法台' : '炼法台',
        subtitle: this.getCraftSubtitle(),
        variantClass: `detail-modal--craft detail-modal--craft-technique-refining${isUnification ? ' detail-modal--technique-unification' : ''}`,
        body: includeBody ? this.transmissionView.renderTechniqueRefiningBody() : '',
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
      return this.transmissionView.isTechniqueAggregationOpen() ? '统合诸法，立脉传承' : '功法书分解与抄录';
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
      return this.transmissionView.renderTransmissionBody();
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

  renderCraftQueuePanel(queue = this.getCraftQueueSnapshot()): string {
    return renderCraftQueuePanelImpl(this, queue);
  }

  renderCraftQueuePanelContent(queue = this.getCraftQueueSnapshot()): string {
    return renderCraftQueuePanelContentImpl(this, queue);
  }

  getCraftQueueKindLabel(kind: CraftQueueItemView['kind']): string {
    return getCraftQueueKindLabelImpl(this, kind);
  }

  getCraftQueueStatusLabel(entry: CraftQueueDisplayItem, index: number): string {
    return getCraftQueueStatusLabelImpl(this, entry, index);
  }

  renderCraftQueueItemMeta(entry: CraftQueueItemView): string {
    return renderCraftQueueItemMetaImpl(this, entry);
  }

  renderCraftQueueItemProgress(entry: CraftQueueDisplayItem): string {
    return renderCraftQueueItemProgressImpl(this, entry);
  }

  patchCraftQueueProgress(root: HTMLElement): void {
    patchCraftQueueProgressImpl(this, root);
  }

  patchCraftQueuePanel(root: HTMLElement): boolean {
    return patchCraftQueuePanelImpl(this, root);
  }

  refreshQueueFloatingPanel(): void {
    refreshQueueFloatingPanelImpl(this);
  }

  ensureQueueFloatingPanel(): FloatingListPanel {
    return ensureQueueFloatingPanelImpl(this);
  }

  buildFloatingQueueStructureKey(queue = this.getCraftQueueSnapshot()): string {
    return buildFloatingQueueStructureKeyImpl(this, queue);
  }

  renderFloatingQueueList(queue = this.getCraftQueueSnapshot()): string {
    return renderFloatingQueueListImpl(this, queue);
  }

  renderFloatingQueueItem(
    entry: CraftQueueDisplayItem,
    queuePosition: number | null,
    reorderableCount: number,
  ): string {
    return renderFloatingQueueItemImpl(this, entry, queuePosition, reorderableCount);
  }

  resolveFloatingQueueProgress(entry: CraftQueueDisplayItem): CraftQueueProgressView {
    return resolveFloatingQueueProgressImpl(this, entry);
  }

  patchFloatingQueueProgress(root: HTMLElement, queue = this.getCraftQueueSnapshot()): void {
    patchFloatingQueueProgressImpl(this, root, queue);
  }

  bindQueueFloatingEvents(panel: FloatingListPanel): void {
    bindQueueFloatingEventsImpl(this, panel);
  }

  buildCraftHeaderKey(): string {
    return buildCraftHeaderKeyImpl(this);
  }

  buildCraftQueueStructureKey(queue = this.getCraftQueueSnapshot()): string {
    return buildCraftQueueStructureKeyImpl(this, queue);
  }

  buildCraftTabsKey(): string {
    return buildCraftTabsKeyImpl(this);
  }

  renderCraftModeTabs(): string {
    return renderCraftModeTabsImpl(this);
  }

  renderForgingPlaceholder(): string {
    return renderForgingPlaceholderImpl(this);
  }

  getCraftProfessionTitle(): string {
    return getCraftProfessionTitleImpl(this);
  }

  getCraftProfessionDescription(): string {
    return getCraftProfessionDescriptionImpl(this);
  }

  getCraftQueueSnapshot(): CraftQueueDisplayItem[] {
    return getCraftQueueSnapshotImpl(this);
  }

  dispatchQueueCancellation(target: HTMLElement): void {
    dispatchQueueCancellationImpl(this, target);
  }

  private bindActions(body: HTMLElement, signal: AbortSignal): void {
    if (this.activeMode === 'enhancement') {
      this.bindEnhancementEvents(body, signal);
    }
    if (this.activeMode === 'transmission' || this.activeMode === 'technique_refining') {
      this.transmissionView.bindEvents(body, signal);
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
      if (this.transmissionView.handleAction(action, target, body)) {
        return;
      }
      if (action === 'cancel-queue-entry') {
        this.dispatchQueueCancellation(target);
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

  getVisibleAlchemyRecipes(): AlchemyRecipeCatalogEntry[] {
    return getVisibleAlchemyRecipesImpl(this);
  }

  getSelectedAlchemyRecipe(): AlchemyRecipeCatalogEntry | null {
    return getSelectedAlchemyRecipeImpl(this);
  }

  tryPatchAlchemyBody(body: HTMLElement): boolean {
    return tryPatchAlchemyBodyImpl(this, body);
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

  renderAlchemyBody(): string {
    return renderAlchemyBodyImpl(this);
  }

  renderAlchemyItemReference(
    itemId: string,
    label: string,
    tone: 'reward' | 'material',
    count?: number,
  ): string {
    return renderAlchemyItemReferenceImpl(this, itemId, label, tone, count);
  }

  resolveAlchemyMaterialName(recipe: AlchemyRecipeCatalogEntry, itemId: string): string {
    return resolveAlchemyMaterialNameImpl(this, recipe, itemId);
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

  buildLocalCraftFormulaPresetKey(kind: 'alchemy' | 'forging', recipeId: string): string {
    return buildLocalCraftFormulaPresetKeyImpl(this, kind, recipeId);
  }

  ensureLocalCraftFormulaPresetsLoaded(): void {
    ensureLocalCraftFormulaPresetsLoadedImpl(this);
  }

  persistLocalCraftFormulaPresets(): void {
    persistLocalCraftFormulaPresetsImpl(this);
  }

  saveLocalCraftFormulaPreset(recipe: AlchemyRecipeCatalogEntry): void {
    saveLocalCraftFormulaPresetImpl(this, recipe);
  }

  deleteLocalCraftFormulaPreset(recipeId: string, presetId: string): boolean {
    return deleteLocalCraftFormulaPresetImpl(this, recipeId, presetId);
  }

  getFullAlchemyIngredients(recipeId: string): AlchemyIngredientSelection[] {
    return getFullAlchemyIngredientsImpl(this, recipeId);
  }

  getAlchemyDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
    return getAlchemyDraftIngredientsImpl(this, recipeId);
  }

  getAlchemySubmittedDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
    return getAlchemySubmittedDraftIngredientsImpl(this, recipeId);
  }

  setAlchemyDraft(recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
    setAlchemyDraftImpl(this, recipeId, ingredients);
  }

  getAlchemyMainIngredients(recipe: AlchemyRecipeCatalogEntry): AlchemyIngredientSelection[] {
    return getAlchemyMainIngredientsImpl(this, recipe);
  }

  adjustAlchemyAuxCount(recipeId: string, itemId: string, delta: number): void {
    adjustAlchemyAuxCountImpl(this, recipeId, itemId, delta);
  }

  removeAlchemyAuxItem(recipeId: string, itemId: string): void {
    removeAlchemyAuxItemImpl(this, recipeId, itemId);
  }

  getAlchemyInventoryCount(itemId: string): number {
    return getAlchemyInventoryCountImpl(this, itemId);
  }

  getAlchemyMaterialElements(itemId: string): CraftElementVector | undefined {
    return getAlchemyMaterialElementsImpl(this, itemId);
  }

  buildAlchemyMainElements(recipe: AlchemyRecipeCatalogEntry): CraftElementVector {
    return buildAlchemyMainElementsImpl(this, recipe);
  }

  buildAlchemyRequiredElements(recipe: AlchemyRecipeCatalogEntry): CraftElementVector {
    return buildAlchemyRequiredElementsImpl(this, recipe);
  }

  buildAlchemyInputElements(
    ingredients: readonly AlchemyIngredientSelection[],
  ): CraftElementVector {
    return buildAlchemyInputElementsImpl(this, ingredients);
  }

  openAlchemyMaterialPickerModal(): void {
    openAlchemyMaterialPickerModalImpl(this);
  }

  renderAlchemyMaterialPickerBody(recipe: AlchemyRecipeCatalogEntry): string {
    return renderAlchemyMaterialPickerBodyImpl(this, recipe);
  }

  getAlchemyMaterialPickerCandidates(recipe: AlchemyRecipeCatalogEntry): Array<{
    itemId: string;
    name: string;
    level: number;
    grade: string;
    gradeLabel: string;
    count: number;
    elements: Record<AlchemyMaterialPickerSortKey, number>;
  }> {
    return getAlchemyMaterialPickerCandidatesImpl(this, recipe);
  }

  formatAlchemyPickerElementValue(value: number | undefined): string {
    return formatAlchemyPickerElementValueImpl(this, value);
  }

  openAlchemyPresetPickerModal(presetId?: string): void {
    openAlchemyPresetPickerModalImpl(this, presetId);
  }

  renderAlchemyPresetPickerBody(recipe: AlchemyRecipeCatalogEntry): string {
    return renderAlchemyPresetPickerBodyImpl(this, recipe);
  }

  renderAlchemyPresetPickerDetail(recipe: AlchemyRecipeCatalogEntry, preset: PlayerAlchemyPreset): string {
    return renderAlchemyPresetPickerDetailImpl(this, recipe, preset);
  }

  buildAlchemyPresetPreviewIngredients(
    recipe: AlchemyRecipeCatalogEntry,
    preset: PlayerAlchemyPreset,
  ): AlchemyIngredientSelection[] {
    return buildAlchemyPresetPreviewIngredientsImpl(this, recipe, preset);
  }

  renderAlchemyElementRatioGrid(
    currentElements: CraftElementVector | undefined,
    requiredElements: CraftElementVector | undefined,
  ): string {
    return renderAlchemyElementRatioGridImpl(this, currentElements, requiredElements);
  }

  formatAlchemyPresetUpdatedAt(value: number | undefined): string {
    return formatAlchemyPresetUpdatedAtImpl(this, value);
  }

  bindAlchemyPresetPickerEvents(): void {
    bindAlchemyPresetPickerEventsImpl(this);
  }

  bindAlchemyMaterialPickerEvents(): void {
    bindAlchemyMaterialPickerEventsImpl(this);
  }

  patchAlchemyMaterialPickerList(): void {
    patchAlchemyMaterialPickerListImpl(this);
  }

  renderAlchemyMaterialPickerListHtml(recipe: AlchemyRecipeCatalogEntry): string {
    return renderAlchemyMaterialPickerListHtmlImpl(this, recipe);
  }

  bindAlchemyMaterialPickerAddButtons(root: HTMLElement): void {
    bindAlchemyMaterialPickerAddButtonsImpl(this, root);
  }

  getAlchemySpiritStoneOwnedCount(): number {
    return getAlchemySpiritStoneOwnedCountImpl(this);
  }

  getAlchemyFurnaceBonuses(): { successRate: number; speedRate: number } {
    return getAlchemyFurnaceBonusesImpl(this);
  }

  getAlchemyBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    return getAlchemyBatchOutputSizeImpl(this, recipe);
  }

  getAlchemyBatchOutputCount(recipe: AlchemyRecipeCatalogEntry): number {
    return getAlchemyBatchOutputCountImpl(this, recipe);
  }

  getAlchemySpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCostImpl(this, recipe, quantity);
  }

  getCraftSkillLevelForActiveMode(): number {
    return getCraftSkillLevelForActiveModeImpl(this);
  }

  getAlchemyRawBrewTicks(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    return getAlchemyRawBrewTicksImpl(this, recipe, ingredients);
  }

  getAlchemyAdjustedBrewTicks(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    return getAlchemyAdjustedBrewTicksImpl(this, recipe, ingredients);
  }

  formatAlchemyElementVector(elements: CraftElementVector | undefined): string {
    return formatAlchemyElementVectorImpl(this, elements);
  }

  getAlchemyMaxCraftQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    return getAlchemyMaxCraftQuantityImpl(this, recipe, ingredients);
  }

  getAlchemySelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    return getAlchemySelectedQuantityImpl(this, recipe, ingredients);
  }

  setAlchemySelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
    next: number,
  ): void {
    setAlchemySelectedQuantityImpl(this, recipe, ingredients, next);
  }

  openAlchemyConfirm(
    recipeId: string,
    ingredients: readonly AlchemyIngredientSelection[],
    mode: AlchemyTab,
  ): void {
    openAlchemyConfirmImpl(this, recipeId, ingredients, mode);
  }

  parseAlchemyConfirmQuantity(): number | null {
    return parseAlchemyConfirmQuantityImpl(this);
  }

  buildAlchemyConfirmState(
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
    return buildAlchemyConfirmStateImpl(this, recipe, ingredients);
  }

  renderAlchemyConfirmBody(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    state: ReturnType<CraftWorkbenchModal['buildAlchemyConfirmState']>,
  ): string {
    return renderAlchemyConfirmBodyImpl(this, recipe, mode, state);
  }

  bindAlchemyConfirmEvents(): void {
    bindAlchemyConfirmEventsImpl(this);
  }

  syncAlchemyConfirmState(): void {
    syncAlchemyConfirmStateImpl(this);
  }

  normalizeQueueStartMode(value: string | undefined): CraftQueueStartMode {
    return normalizeQueueStartModeImpl(this, value);
  }

  submitAlchemyConfirm(queueMode: CraftQueueStartMode): void {
    submitAlchemyConfirmImpl(this, queueMode);
  }

  syncAlchemyConfirmModal(): void {
    syncAlchemyConfirmModalImpl(this);
  }
}

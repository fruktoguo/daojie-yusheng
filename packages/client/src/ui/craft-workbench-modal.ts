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
  getAlchemySpiritStoneCost,
  normalizeEnhanceLevel,
  normalizeAlchemyQuantity,
} from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
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

  private callbacks: CraftWorkbenchCallbacks | null = null;
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
    this.transmissionView.resetTechniqueRefiningSelection();
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
        body: this.transmissionView.renderTechniqueRefiningBody(),
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

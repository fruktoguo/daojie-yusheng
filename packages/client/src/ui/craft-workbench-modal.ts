import type {
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemyRecipeCategory,
  C2S_SaveAlchemyPreset,
  C2S_StartEnhancement,
  EnhancementTargetRef,
  EquipmentSlots,
  PlayerEnhancementRecord,
  PlayerAlchemyPreset,
  PlayerState,
  S2C_AlchemyPanel,
  S2C_AttrUpdate,
  S2C_EnhancementPanel,
  SyncedEnhancementCandidateView,
} from '@mud/shared';
import {
  ALCHEMY_FURNACE_OUTPUT_COUNT,
  ALCHEMY_PREPARATION_TICKS,
  buildAlchemyIngredientCountMap,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyAdjustedSuccessRate,
  computeAlchemyBatchOutputCountWithSize,
  computeAlchemyPowerRatio,
  computeAlchemySuccessRate,
  computeAlchemyTotalJobTicks,
  getAlchemySpiritStoneCost,
  isExactAlchemyRecipe,
  normalizeAlchemyQuantity,
} from '@mud/shared';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplayPercent } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';

type CraftWorkbenchCallbacks = {
  onRequestAlchemy: (knownCatalogVersion?: number) => void;
  onRequestEnhancement: () => void;
  onSaveAlchemyPreset: (payload: C2S_SaveAlchemyPreset) => void;
  onDeleteAlchemyPreset: (presetId: string) => void;
  onStartAlchemy: (recipeId: string, ingredients: Array<{ itemId: string; count: number }>, quantity: number) => void;
  onCancelAlchemy: () => void;
  onStartEnhancement: (payload: C2S_StartEnhancement) => void;
  onCancelEnhancement: () => void;
};

type CraftMode = 'alchemy' | 'enhancement' | null;
type AlchemyTab = 'full' | 'simple';

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
    return '0 息';
  }
  return `${formatDisplayInteger(Math.max(0, Math.round(Number(ticks))))} 息`;
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

function getAlchemyPhaseLabel(phase: 'preparing' | 'brewing' | 'paused'): string {
  if (phase === 'preparing') {
    return '温炉准备';
  }
  if (phase === 'paused') {
    return '炉火停滞';
  }
  return '炉火炼制';
}

function buildEnhancementTargetKey(ref: EnhancementTargetRef): string {
  return ref.source === 'equipment'
    ? `equipment:${ref.slot ?? ''}`
    : `inventory:${ref.slotIndex ?? -1}`;
}

function formatEnhancementRecordStatus(status: PlayerEnhancementRecord['status']): string {
  if (status === 'completed') {
    return '已完成';
  }
  if (status === 'cancelled') {
    return '已取消';
  }
  if (status === 'stopped') {
    return '已停止';
  }
  if (status === 'in_progress') {
    return '进行中';
  }
  return '已归档';
}

function cloneAlchemyIngredients(
  ingredients: readonly AlchemyIngredientSelection[],
): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

export class CraftWorkbenchModal {
  private static readonly MODAL_OWNER = 'craft-workbench-modal';
  private static readonly ALCHEMY_CONFIRM_OWNER = 'craft-workbench-modal:alchemy-confirm';

  private callbacks: CraftWorkbenchCallbacks | null = null;
  private activeMode: CraftMode = null;
  private loading = false;

  private alchemyPanel: S2C_AlchemyPanel | null = null;
  private enhancementPanel: S2C_EnhancementPanel | null = null;
  private alchemyCatalogVersion = 0;
  private alchemyCatalog: AlchemyRecipeCatalogEntry[] = [];
  private alchemySkillLevel = 1;
  private gatherSkillLevel = 1;
  private enhancementSkillLevel = 1;
  private inventory: PlayerState['inventory'] = { items: [], capacity: 0 };
  private equipment: EquipmentSlots = { weapon: null, head: null, body: null, legs: null, accessory: null };
  private activeAlchemyCategory: AlchemyRecipeCategory = 'recovery';
  private activeAlchemyTab: AlchemyTab = 'full';
  private selectedAlchemyRecipeId: string | null = null;
  private selectedAlchemyPresetId: string | null = null;
  private draftByRecipeId = new Map<string, Map<string, number>>();
  private quantityByRecipeId = new Map<string, number>();
  private confirmStartRequest: ConfirmStartRequest | null = null;
  private confirmQuantityDraft = '1';
  private confirmEventsBound = false;
  private selectedEnhancementTargetKey: string | null = null;
  private enhancementPickerExpanded = false;

  setCallbacks(callbacks: CraftWorkbenchCallbacks): void {
    this.callbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
    this.alchemySkillLevel = Math.max(1, Math.floor(player.alchemySkill?.level ?? 1));
    this.gatherSkillLevel = Math.max(1, Math.floor(player.gatherSkill?.level ?? 1));
    this.enhancementSkillLevel = Math.max(1, Math.floor(player.enhancementSkill?.level ?? player.enhancementSkillLevel ?? 1));
  }

  syncAttrUpdate(update: S2C_AttrUpdate): void {
    if (update.alchemySkill) {
      this.alchemySkillLevel = Math.max(1, Math.floor(update.alchemySkill.level ?? this.alchemySkillLevel));
    }
    if (update.gatherSkill) {
      this.gatherSkillLevel = Math.max(1, Math.floor(update.gatherSkill.level ?? this.gatherSkillLevel));
    }
    if (update.enhancementSkill) {
      this.enhancementSkillLevel = Math.max(1, Math.floor(update.enhancementSkill.level ?? this.enhancementSkillLevel));
    }
    if (detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.render();
    }
  }

  syncInventory(inventory?: PlayerState['inventory']): void {
    if (inventory) {
      this.inventory = inventory;
    }
    this.requestCurrentPanel();
    this.syncAlchemyConfirmModal();
  }

  syncEquipment(equipment?: EquipmentSlots): void {
    if (equipment) {
      this.equipment = equipment;
    }
    this.requestCurrentPanel();
    this.syncAlchemyConfirmModal();
  }

  openAlchemy(): void {
    this.activeMode = 'alchemy';
    this.loading = true;
    this.selectedAlchemyPresetId = null;
    this.confirmStartRequest = null;
    this.render();
    this.callbacks?.onRequestAlchemy(this.alchemyCatalogVersion || undefined);
  }

  openEnhancement(): void {
    this.activeMode = 'enhancement';
    this.loading = true;
    this.enhancementPickerExpanded = false;
    this.render();
    this.callbacks?.onRequestEnhancement();
  }

  updateAlchemy(data: S2C_AlchemyPanel): void {
    this.alchemyPanel = data;
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
      this.render();
    }
    this.syncAlchemyConfirmModal();
  }

  updateEnhancement(data: S2C_EnhancementPanel): void {
    this.enhancementPanel = data;
    if (typeof data.state?.enhancementSkillLevel === 'number') {
      this.enhancementSkillLevel = Math.max(1, Math.floor(data.state.enhancementSkillLevel));
    }
    this.ensureEnhancementSelection();
    if (this.activeMode === 'enhancement') {
      this.loading = false;
      this.render();
    }
  }

  clear(): void {
    this.activeMode = null;
    this.loading = false;
    this.alchemyPanel = null;
    this.enhancementPanel = null;
    this.alchemyCatalog = [];
    this.alchemyCatalogVersion = 0;
    this.selectedAlchemyRecipeId = null;
    this.selectedAlchemyPresetId = null;
    this.draftByRecipeId.clear();
    this.quantityByRecipeId.clear();
    this.confirmStartRequest = null;
    this.confirmQuantityDraft = '1';
    this.selectedEnhancementTargetKey = null;
    this.enhancementPickerExpanded = false;
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
    detailModalHost.close(CraftWorkbenchModal.MODAL_OWNER);
  }

  private requestCurrentPanel(): void {
    if (!detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      return;
    }
    if (this.activeMode === 'alchemy') {
      this.callbacks?.onRequestAlchemy(this.alchemyCatalogVersion || undefined);
    } else if (this.activeMode === 'enhancement') {
      this.callbacks?.onRequestEnhancement();
    }
  }

  private ensureAlchemySelection(): void {
    const visibleRecipeIds = new Set(this.alchemyCatalog.map((entry) => entry.recipeId));
    if (this.alchemyPanel?.state?.job) {
      this.selectedAlchemyRecipeId = this.alchemyPanel.state.job.recipeId;
      const jobRecipe = this.alchemyCatalog.find((entry) => entry.recipeId === this.alchemyPanel?.state?.job?.recipeId);
      if (jobRecipe) {
        this.activeAlchemyCategory = jobRecipe.category;
      }
      return;
    }
    if (this.selectedAlchemyRecipeId && visibleRecipeIds.has(this.selectedAlchemyRecipeId)) {
      return;
    }
    const nextRecipe = this.alchemyCatalog[0] ?? null;
    this.selectedAlchemyRecipeId = nextRecipe?.recipeId ?? null;
    this.selectedAlchemyPresetId = null;
    this.activeAlchemyCategory = nextRecipe?.category ?? 'recovery';
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
      return;
    }
    if (this.selectedEnhancementTargetKey && candidates.some((entry) => buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementTargetKey)) {
      return;
    }
    this.selectedEnhancementTargetKey = candidates[0] ? buildEnhancementTargetKey(candidates[0].ref) : null;
  }

  private render(): void {
    const definition = this.getCurrentModalDefinition();
    if (!definition) {
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
      hint: '点击空白处关闭',
      renderBody: (body) => {
        body.innerHTML = definition.body;
      },
      onAfterRender: (body) => {
        bindInlineItemTooltips(body);
        this.bindActions(body);
        if (this.activeMode === 'alchemy') {
          this.syncAlchemyConfirmModal();
        }
      },
      onClose: () => {
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
        this.activeMode = null;
        this.loading = false;
      },
    });
  }

  private tryPatchModal(
    body: HTMLElement,
    definition: { title: string; subtitle: string; variantClass: string; body: string },
  ): boolean {
    if (!detailModalHost.patch({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      variantClass: definition.variantClass,
      title: definition.title,
      subtitle: definition.subtitle,
      hint: '点击空白处关闭',
    })) {
      return false;
    }
    if (this.activeMode === 'alchemy' && this.tryPatchAlchemyBody(body)) {
      return true;
    }
    if (this.activeMode === 'enhancement' && this.tryPatchEnhancementBody(body)) {
      return true;
    }
    detailModalHost.patch({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      renderBody: (nextBody) => {
        nextBody.innerHTML = definition.body;
      },
      onAfterRender: (nextBody) => {
        bindInlineItemTooltips(nextBody);
        this.bindActions(nextBody);
        if (this.activeMode === 'alchemy') {
          this.syncAlchemyConfirmModal();
        }
      },
    });
    return true;
  }

  private getCurrentModalDefinition(): { title: string; subtitle: string; variantClass: string; body: string } | null {
    if (this.activeMode === 'alchemy') {
      return {
        title: '炉中炼丹',
        subtitle: this.getAlchemySubtitle(),
        variantClass: 'detail-modal--alchemy',
        body: this.renderAlchemyBody(),
      };
    }
    if (this.activeMode === 'enhancement') {
      return {
        title: '装备强化',
        subtitle: `强化 Lv.${formatDisplayInteger(this.enhancementSkillLevel)}`,
        variantClass: 'detail-modal--enhancement',
        body: this.renderEnhancementBody(),
      };
    }
    return null;
  }

  private bindActions(body: HTMLElement): void {
    if (body.dataset.craftWorkbenchBound === 'true') {
      return;
    }
    body.dataset.craftWorkbenchBound = 'true';
    body.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-craft-action]') : null;
      if (!target) {
        return;
      }
      const action = target.dataset.craftAction ?? '';
      if (action === 'alchemy-switch-category') {
        const category = target.dataset.category === 'buff' ? 'buff' : 'recovery';
        this.activeAlchemyCategory = category;
        const firstRecipe = this.getVisibleAlchemyRecipes()[0] ?? null;
        if (firstRecipe) {
          this.selectedAlchemyRecipeId = firstRecipe.recipeId;
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
        this.callbacks?.onCancelAlchemy();
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
          this.enhancementPickerExpanded = false;
          this.render();
        }
        return;
      }
      if (action === 'toggle-enhancement-picker') {
        this.enhancementPickerExpanded = !this.enhancementPickerExpanded;
        this.render();
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
        const payload = this.buildEnhancementPayload(body, selected, target.dataset.protection === 'true');
        if (!payload) {
          return;
        }
        this.callbacks?.onStartEnhancement(payload);
        return;
      }
      if (action === 'cancel-enhancement') {
        this.callbacks?.onCancelEnhancement();
      }
    });
  }

  private adjustNumericInput(body: HTMLElement, selector: string, delta: number): void {
    const input = body.querySelector<HTMLInputElement>(selector);
    if (!input || !Number.isFinite(delta) || delta === 0) {
      return;
    }
    const min = Number(input.min || '0');
    const max = Number(input.max || '999');
    const current = Number(input.value || '0');
    const next = Math.max(min, Math.min(max, Math.floor((Number.isFinite(current) ? current : min) + delta)));
    input.value = String(next);
  }

  private buildEnhancementPayload(
    body: HTMLElement,
    candidate: SyncedEnhancementCandidateView,
    useProtection: boolean,
  ): C2S_StartEnhancement | null {
    const payload: C2S_StartEnhancement = { target: candidate.ref };
    const targetLevelInput = body.querySelector<HTMLInputElement>('[data-enhancement-target-level-input]');
    const targetLevel = Number(targetLevelInput?.value ?? String(candidate.nextLevel));
    if (Number.isFinite(targetLevel)) {
      payload.targetLevel = Math.max(candidate.nextLevel, Math.min(20, Math.floor(targetLevel)));
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
      payload.protection = candidate.ref;
    } else if (protectionValue.startsWith('inventory:')) {
      payload.protection = {
        source: 'inventory',
        slotIndex: Number(protectionValue.slice('inventory:'.length)),
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
      payload.protectionStartLevel = Math.max(2, Math.min(20, Math.floor(protectionStartLevel)));
    }
    return payload;
  }

  private getVisibleAlchemyRecipes(): AlchemyRecipeCatalogEntry[] {
    return this.alchemyCatalog.filter((entry) => entry.category === this.activeAlchemyCategory);
  }

  private getSelectedAlchemyRecipe(): AlchemyRecipeCatalogEntry | null {
    return this.alchemyCatalog.find((entry) => entry.recipeId === this.selectedAlchemyRecipeId) ?? null;
  }

  private getSelectedEnhancementCandidate(): SyncedEnhancementCandidateView | null {
    const candidates = this.enhancementPanel?.state?.candidates ?? [];
    return candidates.find((entry) => buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementTargetKey) ?? null;
  }

  private getAlchemySubtitle(): string {
    const job = this.alchemyPanel?.state?.job;
    if (job) {
      const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === job.recipeId) ?? null;
      return `当前任务：${recipe?.outputName ?? job.outputItemId} · ${formatDisplayInteger(job.completedCount)} / ${formatDisplayInteger(job.quantity)} 炉`;
    }
    return `炼丹 Lv.${formatDisplayInteger(this.alchemySkillLevel)} · 采集 Lv.${formatDisplayInteger(this.gatherSkillLevel)}`;
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
    const shell = body.querySelector<HTMLElement>('[data-alchemy-shell="true"]');
    const jobHost = body.querySelector<HTMLElement>('[data-alchemy-job-card-host="true"]');
    const topbar = body.querySelector<HTMLElement>('[data-alchemy-topbar="true"]');
    const categoryTabs = body.querySelector<HTMLElement>('[data-alchemy-category-tabs="true"]');
    const tabHost = body.querySelector<HTMLElement>('[data-alchemy-tab-host="true"]');
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    const detailPanel = body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]');
    if (!shell || !jobHost || !topbar || !categoryTabs || !tabHost || !recipeList || !detailPanel) {
      return false;
    }
    const viewState = this.captureAlchemyViewState(body);
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    const nextDetailKey = selectedRecipe ? `${selectedRecipe.recipeId}:${this.activeAlchemyTab}` : 'empty';
    const preserveDetail = viewState.detailKey === nextDetailKey;

    jobHost.innerHTML = this.renderAlchemyJobCard(this.alchemyPanel?.state?.job ?? null);
    topbar.innerHTML = this.renderAlchemyTopbar();
    categoryTabs.innerHTML = this.renderAlchemyCategoryTabs();
    tabHost.innerHTML = this.renderAlchemyTabButtons();
    recipeList.innerHTML = this.renderAlchemyRecipeList();
    detailPanel.dataset.detailKey = nextDetailKey;
    detailPanel.innerHTML = this.renderAlchemyDetailPanel();
    bindInlineItemTooltips(body);
    this.restoreAlchemyViewState(body, viewState, preserveDetail);
    return true;
  }

  private renderAlchemyTopbar(): string {
    return `
      <div class="alchemy-topbar-main">
        <span class="alchemy-topbar-label">炼丹等级</span>
        <strong class="alchemy-topbar-value">LV ${formatDisplayInteger(this.alchemySkillLevel)}</strong>
      </div>
      <div class="alchemy-topbar-note">悬浮或点按药名可查看效果与来源</div>
    `;
  }

  private renderAlchemyTabButtons(): string {
    return `
      <button class="alchemy-tab-btn ${this.activeAlchemyTab === 'full' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="full">完整丹方</button>
      <button class="alchemy-tab-btn ${this.activeAlchemyTab === 'simple' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">简易丹方</button>
    `;
  }

  private renderAlchemyRecipeList(): string {
    const visibleRecipes = this.getVisibleAlchemyRecipes();
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    if (visibleRecipes.length === 0) {
      return `<div class="alchemy-recipe-list-empty">${escapeHtml(this.loading ? '丹方与炉中状态同步中……' : (this.alchemyPanel?.error ?? '当前分类下还没有可炼制的丹方。'))}</div>`;
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
      return `<div class="alchemy-recipe-list-empty">${escapeHtml(this.loading ? '丹方与炉中状态同步中……' : (this.alchemyPanel?.error ?? '当前没有可用丹方。'))}</div>`;
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
    const shell = body.querySelector<HTMLElement>('.enhancement-modal-shell');
    const toolbar = body.querySelector<HTMLElement>('.enhancement-toolbar');
    const workbench = body.querySelector<HTMLElement>('.enhancement-workbench');
    const historyPanel = body.querySelector<HTMLElement>('.enhancement-history-panel');
    if (!shell || !toolbar || !workbench || !historyPanel) {
      return false;
    }
    const viewState = this.captureEnhancementViewState(body);
    toolbar.innerHTML = this.renderEnhancementToolbar();
    workbench.innerHTML = this.renderEnhancementWorkbenchSection();
    historyPanel.innerHTML = this.renderEnhancementHistory(this.enhancementPanel?.state?.records ?? []);
    this.restoreEnhancementViewState(body, viewState);
    return true;
  }

  private renderEnhancementToolbar(): string {
    const state = this.enhancementPanel?.state ?? null;
    return `
      <div class="enhancement-toolbar-note">${state?.job
        ? `强化队列进行中，剩余 ${formatTicks(state.job.remainingTicks)} / ${formatTicks(state.job.totalTicks)}`
        : `角色强化等级 Lv.${formatDisplayInteger(state?.enhancementSkillLevel ?? this.enhancementSkillLevel)} · 当前可强化装备 ${formatDisplayInteger(state?.candidates.length ?? 0)} 件`}</div>
      <button class="small-btn ghost" type="button" data-craft-action="enhancement-refresh">刷新</button>
    `;
  }

  private renderEnhancementWorkbenchSection(): string {
    const state = this.enhancementPanel?.state ?? null;
    const selected = this.getSelectedEnhancementCandidate();
    if (state?.job) {
      return this.renderEnhancementActiveJob(state.job);
    }
    if (selected) {
      return this.renderEnhancementWorkbench(selected);
    }
    return `<div class="enhancement-workbench-grid"><div class="enhancement-workbench-side">${this.renderEnhancementTargetSlot(null)}</div><div class="enhancement-workbench-main"><div class="enhancement-empty-state">请选择一件装备。</div></div></div>`;
  }

  private renderAlchemyBody(): string {
    return `
      <div class="alchemy-modal-shell" data-alchemy-shell="true">
        <div data-alchemy-job-card-host="true">${this.renderAlchemyJobCard(this.alchemyPanel?.state?.job ?? null)}</div>
        <div class="alchemy-topbar" data-alchemy-topbar="true">
          ${this.renderAlchemyTopbar()}
        </div>
        <div class="alchemy-control-row" data-alchemy-control-row="true">
          <div class="alchemy-control-group">
            <span class="alchemy-control-label">丹药类型</span>
            <div class="alchemy-category-tabs" data-alchemy-category-tabs="true">
              ${this.renderAlchemyCategoryTabs()}
            </div>
          </div>
          <div class="alchemy-control-group alchemy-control-group--tabs">
            <span class="alchemy-control-label">丹方类型</span>
            <div class="alchemy-modal-tabs" data-alchemy-tab-host="true">
              ${this.renderAlchemyTabButtons()}
            </div>
          </div>
        </div>
        <div class="alchemy-layout">
          <aside class="alchemy-recipe-sidebar">
            <div class="alchemy-recipe-list" data-alchemy-recipe-list="true">
              ${this.renderAlchemyRecipeList()}
            </div>
          </aside>
          <section class="alchemy-detail-panel" data-alchemy-detail-panel="true" data-detail-key="${escapeHtml(this.getSelectedAlchemyRecipe() ? `${this.getSelectedAlchemyRecipe()!.recipeId}:${this.activeAlchemyTab}` : 'empty')}">
            ${this.renderAlchemyDetailPanel()}
          </section>
        </div>
      </div>
    `;
  }

  private renderAlchemyCategoryTabs(): string {
    const categories: Array<{ category: AlchemyRecipeCategory; label: string }> = [
      { category: 'recovery', label: '回复' },
      { category: 'buff', label: '增益' },
    ];
    return categories.map((tab) => {
      const count = this.alchemyCatalog.filter((entry) => entry.category === tab.category).length;
      return `
        <button class="alchemy-category-btn ${this.activeAlchemyCategory === tab.category ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-category" data-category="${tab.category}">
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
    if (!job) {
      return '<section class="alchemy-job-card empty" data-alchemy-job-card="true"><div class="alchemy-job-title">当前炉火</div><div class="alchemy-job-text">当前没有进行中的炼丹任务。</div></section>';
    }
    const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === job.recipeId) ?? null;
    const progressPercent = Math.max(0, Math.min(100, (1 - (job.remainingTicks / Math.max(1, job.totalTicks))) * 100));
    const phaseClass = job.phase === 'preparing' ? 'is-preparing' : (job.phase === 'paused' ? 'is-paused' : 'is-brewing');
    return `
      <section class="alchemy-job-card" data-alchemy-job-card="true">
        <div class="alchemy-job-head">
          <div>
            <div class="alchemy-job-title">当前炉火</div>
            <div class="alchemy-job-name">${this.renderAlchemyItemReference(job.outputItemId, recipe?.outputName ?? job.outputItemId, 'reward')}</div>
          </div>
          <div class="alchemy-job-metrics">
            <span class="alchemy-metric-chip alchemy-job-phase-chip ${phaseClass}">${escapeHtml(getAlchemyPhaseLabel(job.phase))}</span>
            <span class="alchemy-metric-chip">数量 ${formatDisplayInteger(job.quantity)} 炉</span>
            <span class="alchemy-metric-chip">一炉 ${formatDisplayInteger(job.outputCount)} 枚</span>
            <span class="alchemy-metric-chip">灵石 ${formatDisplayInteger(job.spiritStoneCost)}</span>
            <span class="alchemy-metric-chip">单枚成丹率 ${escapeHtml(formatRate(job.successRate))}</span>
          </div>
        </div>
        <div class="alchemy-job-progress">
          <div class="alchemy-job-progress-head">
            <span>炼制进度</span>
            <strong>${formatDisplayInteger(job.completedCount)} / ${formatDisplayInteger(job.quantity)} 炉</strong>
          </div>
          <div class="alchemy-job-progress-bar">
            <div class="alchemy-job-progress-fill" style="width:${progressPercent.toFixed(2)}%"></div>
          </div>
        </div>
        <div class="alchemy-job-meta">
          <span>剩余 ${formatTicks(job.remainingTicks)}</span>
          <span>成功 ${formatDisplayInteger(job.successCount)}</span>
          <span>失败 ${formatDisplayInteger(job.failureCount)}</span>
          <span>${escapeHtml(getAlchemyPhaseLabel(job.phase))}</span>
          <div class="alchemy-job-ingredient-flow">
            ${job.ingredients.map((ingredient) => {
              const ingredientMeta = recipe?.ingredients.find((entry) => entry.itemId === ingredient.itemId);
              return this.renderAlchemyItemReference(
                ingredient.itemId,
                ingredientMeta?.name ?? ingredient.itemId,
                'material',
                ingredient.count,
              );
            }).join('')}
          </div>
        </div>
        <div class="alchemy-actions alchemy-actions--job">
          <button class="small-btn ghost" type="button" data-craft-action="cancel-alchemy">取消炼制</button>
        </div>
      </section>
    `;
  }

  private renderAlchemyFullTab(recipe: AlchemyRecipeCatalogEntry): string {
    const metrics = this.buildAlchemyMetricSnapshot(recipe, 'full');
    const ingredients = this.getFullAlchemyIngredients(recipe.recipeId);
    return `
      <div class="alchemy-tab-stack">
        ${this.renderAlchemySummaryCard(recipe, 'full', metrics)}
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => `
            <div class="alchemy-ingredient-row" data-alchemy-ingredient-item-id="${escapeHtml(ingredient.itemId)}">
              <div class="alchemy-ingredient-main">
                <span class="alchemy-ingredient-role ${ingredient.role === 'main' ? 'main' : 'aux'}">${ingredient.role === 'main' ? '主药' : '辅药'}</span>
                <span class="alchemy-ingredient-name">${this.renderAlchemyItemReference(ingredient.itemId, ingredient.name, 'material')}</span>
                <span class="alchemy-ingredient-owned" data-alchemy-owned="true">持有 ${formatDisplayInteger(this.getAlchemyInventoryCount(ingredient.itemId))}</span>
              </div>
              <div class="alchemy-ingredient-meta">
                <span>数量 ${formatDisplayInteger(ingredient.count)}</span>
                <span>单份药力 ${formatDisplayInteger(ingredient.powerPerUnit)}</span>
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
            : '<span class="alchemy-preset-empty">当前丹药还没有保存的简易丹方。</span>'}
        </div>
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => `
            <div class="alchemy-ingredient-row" data-alchemy-ingredient-item-id="${escapeHtml(ingredient.itemId)}">
              <div class="alchemy-ingredient-main">
                <span class="alchemy-ingredient-role ${ingredient.role === 'main' ? 'main' : 'aux'}">${ingredient.role === 'main' ? '主药' : '辅药'}</span>
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
    return `
      <div class="alchemy-summary-card" data-alchemy-summary-card="true">
        <div class="alchemy-summary-head">
          <div class="alchemy-summary-title">${this.renderAlchemyItemReference(recipe.outputItemId, recipe.outputName, 'reward')}</div>
          <span class="alchemy-summary-mode">${mode === 'simple' ? '简易丹方' : '完整丹方'}</span>
        </div>
        <div class="alchemy-summary-metrics">
          <div class="alchemy-summary-metric alchemy-summary-metric--power">
            <span class="alchemy-summary-metric-label">药力百分比</span>
            <strong class="alchemy-summary-metric-value" data-alchemy-metric="power">${escapeHtml(metrics.powerText)}</strong>
          </div>
          <div class="alchemy-summary-metric alchemy-summary-metric--success">
            <span class="alchemy-summary-metric-label">单枚成丹率</span>
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
    const state = this.alchemyPanel?.state ?? null;
    const maxQuantity = this.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const spiritStoneCost = this.getAlchemySpiritStoneCost(recipe, 1);
    const batchBrewTicks = this.getAlchemyAdjustedBrewTicks(recipe, ingredients);
    const startDisabled = state?.job || maxQuantity <= 0;
    return `
      <div class="alchemy-actions" data-alchemy-actions="true" data-tab-mode="${mode}">
        <div class="alchemy-action-buttons">
          ${mode === 'full'
            ? `<button class="small-btn" type="button" data-craft-action="alchemy-start-full"${startDisabled ? ' disabled' : ''}>按完整丹方炼制</button>
               <button class="small-btn ghost" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">去简易丹方调整</button>`
            : `<button class="small-btn" type="button" data-craft-action="alchemy-start-draft"${startDisabled ? ' disabled' : ''}>开始炼制</button>
               <button class="small-btn ghost" type="button" data-craft-action="alchemy-save-preset"> ${options?.hasSelectedPreset ? '覆盖当前简方' : '保存简方'} </button>
               <button class="small-btn ghost" type="button" data-craft-action="alchemy-reset-draft">重置投料</button>
               ${options?.selectedPresetId ? `<button class="small-btn danger" type="button" data-craft-action="alchemy-delete-preset" data-preset-id="${escapeHtml(options.selectedPresetId)}">删除已选</button>` : ''}`}
          ${mode === 'full'
            ? ''
            : ''}
          ${state?.job
            ? '<button class="small-btn ghost" type="button" data-craft-action="cancel-alchemy">取消炼制</button>'
            : ''}
        </div>
        <div class="alchemy-action-note">${escapeHtml(
          state?.job
            ? '当前已有炼丹任务在进行中。'
            : maxQuantity > 0
              ? `点击炼制后选择数量，当前最多可炼 ${maxQuantity} 炉；每炉固定 ${this.getAlchemyBatchOutputCount(recipe)} 枚，起炉 ${ALCHEMY_PREPARATION_TICKS} 息后自动开炼。`
              : '材料或灵石不足，当前无法开炉。',
        )}</div>
        ${options?.exactRecipe ? '<span class="alchemy-inline-note">当前投料已等同完整丹方。</span>' : ''}
        <span class="alchemy-inline-note">单炉固定 ${formatDisplayInteger(this.getAlchemyBatchOutputCount(recipe))} 枚，每枚独立判定；单炉需灵石 ${formatDisplayInteger(spiritStoneCost)} 枚，单炉耗时 ${formatTicks(batchBrewTicks)}。</span>
      </div>
    `;
  }

  private renderAlchemyItemReference(
    itemId: string,
    label: string,
    tone: 'reward' | 'material',
    count?: number,
  ): string {
    return renderInlineItemChip(itemId, {
      label,
      tone,
      count,
    });
  }

  private renderEnhancementBody(): string {
    return `
      <div class="enhancement-modal-shell">
        <div class="enhancement-toolbar">
          ${this.renderEnhancementToolbar()}
        </div>
        <div class="enhancement-layout enhancement-layout--single-slot">
          <section class="enhancement-workbench">
            ${this.renderEnhancementWorkbenchSection()}
          </section>
          <aside class="enhancement-history-panel">
            ${this.renderEnhancementHistory(this.enhancementPanel?.state?.records ?? [])}
          </aside>
        </div>
      </div>
    `;
  }

  private renderEnhancementTargetSlot(selected: SyncedEnhancementCandidateView | null): string {
    const candidates = this.enhancementPanel?.state?.candidates ?? [];
    const pickerVisible = !selected || this.enhancementPickerExpanded;
    const sourceLabel = selected
      ? (selected.ref.source === 'equipment'
        ? `已装备 · ${getEquipSlotLabel(selected.ref.slot ?? 'weapon')}`
        : `背包槽位 ${formatDisplayInteger((selected.ref.slotIndex ?? 0) + 1)}`)
      : '尚未选择';
    return `
      <div class="enhancement-target-slot-card">
        <div class="enhancement-target-slot-head">
          <div>
            <div class="enhancement-section-title">强化目标</div>
            <div class="enhancement-protection-note">${escapeHtml(sourceLabel)}</div>
          </div>
          <button class="small-btn ghost" type="button" data-craft-action="toggle-enhancement-picker">
            ${selected ? (pickerVisible ? '收起候选' : '更换装备') : (pickerVisible ? '收起候选' : '选择装备')}
          </button>
        </div>
        <button class="enhancement-target-slot" type="button" data-craft-action="toggle-enhancement-picker">
          ${selected
            ? `
              <span class="enhancement-target-slot-name">${escapeHtml(selected.item.name ?? selected.item.itemId)}</span>
              <span class="enhancement-target-slot-meta">等级 ${formatDisplayInteger(Number(selected.item.level) || 1)} · 当前 +${formatDisplayInteger(selected.currentLevel)}</span>
            `
            : `
              <span class="enhancement-target-slot-name">点击选择要强化的装备</span>
              <span class="enhancement-target-slot-meta">主面板只保留一个目标槽，候选装备在下方切换</span>
            `}
        </button>
        ${pickerVisible ? `
          <div class="enhancement-picker-grid inventory-grid">
            ${candidates.map((entry) => `
              <button class="enhancement-picker-cell ${buildEnhancementTargetKey(entry.ref) === this.selectedEnhancementTargetKey ? 'active' : ''}" type="button" data-craft-action="select-enhancement-target" data-target-key="${escapeHtml(buildEnhancementTargetKey(entry.ref))}">
                <span class="enhancement-candidate-name">${escapeHtml(entry.item.name ?? entry.item.itemId)}</span>
                <span class="enhancement-picker-cell-meta">当前 +${formatDisplayInteger(entry.currentLevel)} · 下一阶 +${formatDisplayInteger(entry.nextLevel)}</span>
                <span class="enhancement-picker-cell-meta">${escapeHtml(entry.ref.source === 'equipment'
                  ? `装备栏 · ${getEquipSlotLabel(entry.ref.slot ?? 'weapon')}`
                  : `背包槽位 ${formatDisplayInteger((entry.ref.slotIndex ?? 0) + 1)}`)}</span>
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderEnhancementWorkbench(selected: SyncedEnhancementCandidateView): string {
    const protectionOptions = selected.protectionCandidates.map((entry) => ({
      value: buildEnhancementTargetKey(entry.ref),
      label: entry.item.name ?? entry.item.itemId,
      meta: entry.ref.source === 'equipment'
        ? getEquipSlotLabel(entry.ref.slot ?? 'weapon')
        : `背包槽位 ${(entry.ref.slotIndex ?? 0) + 1} · 数量 ${entry.item.count}`,
    }));
    const canSelfProtection = selected.allowSelfProtection && selected.ref.source === 'inventory' && Math.max(0, Math.floor(selected.item.count ?? 0)) > 1;
    if (canSelfProtection) {
      protectionOptions.unshift({
        value: 'self',
        label: '同槽同类自保',
        meta: '消耗当前槽位同名装备',
      });
    }
    return `
      <div class="enhancement-workbench-grid">
        <div class="enhancement-workbench-side">
          ${this.renderEnhancementTargetSlot(selected)}
          <div class="enhancement-target-level-card">
            <div class="enhancement-section-title">目标强化等级</div>
            <div class="enhancement-target-level-row">
              <button class="small-btn ghost" type="button" data-craft-action="target-adjust" data-delta="-1">-1</button>
              <input
                class="enhancement-target-level-input"
                type="number"
                inputmode="numeric"
                min="${selected.currentLevel + 1}"
                max="20"
                step="1"
                value="${Math.max(selected.currentLevel + 1, selected.nextLevel)}"
                data-enhancement-target-level-input="1"
              >
              <button class="small-btn ghost" type="button" data-craft-action="target-adjust" data-delta="1">+1</button>
            </div>
            <div class="enhancement-target-level-note">强化队列会从当前等级逐阶结算，直到达到目标等级、资源不足或主动停止。</div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">保护</div>
            <div class="enhancement-protection-note">${selected.protectionItemName ?? selected.protectionItemId ?? '未配置独立保护物，当前仅展示可选保护候选。'}</div>
            <label class="enhancement-protection-option">
              <input type="radio" name="enhancement-protection" value="" checked>
              <span>不使用保护</span>
            </label>
            ${protectionOptions.length > 0
              ? protectionOptions.map((option) => `
                <label class="enhancement-protection-option">
                  <input type="radio" name="enhancement-protection" value="${escapeHtml(option.value)}">
                  <span>${escapeHtml(option.label)}</span>
                  <em>${escapeHtml(option.meta)}</em>
                </label>
              `).join('')
              : '<div class="enhancement-material-empty">当前没有可用保护物。</div>'}
            <div class="enhancement-protection-start">
              <div class="enhancement-protection-note">开始保护等级</div>
              <div class="enhancement-target-level-row">
                <button class="small-btn ghost" type="button" data-craft-action="protection-adjust" data-delta="-1">-1</button>
                <input
                  class="enhancement-target-level-input"
                  type="number"
                  inputmode="numeric"
                  min="2"
                  max="20"
                  step="1"
                  value="${Math.max(2, selected.nextLevel)}"
                  data-enhancement-protection-start-input="1"
                >
                <button class="small-btn ghost" type="button" data-craft-action="protection-adjust" data-delta="1">+1</button>
              </div>
              <div class="enhancement-target-level-note">保护最低从 +2 开始生效。达到这个目标等级后，失败才会消耗保护并只降低一级。</div>
            </div>
            <div class="enhancement-action-row enhancement-action-row--stacked">
              <button class="small-btn" type="button" data-craft-action="start-enhancement">开始强化</button>
              ${protectionOptions.length > 0 ? '<button class="small-btn ghost" type="button" data-craft-action="start-enhancement" data-protection="true">保护强化</button>' : ''}
            </div>
          </div>
        </div>
        <div class="enhancement-workbench-main">
          <div class="enhancement-summary-card">
            <div class="enhancement-summary-head">
              <div>
                <div class="enhancement-summary-title">${escapeHtml(selected.item.name ?? selected.item.itemId)}</div>
                <div class="enhancement-summary-subtitle">当前 +${formatDisplayInteger(selected.currentLevel)} · 最终目标由左侧输入控制</div>
              </div>
              <div class="enhancement-summary-rate">首阶 ${escapeHtml(formatRate(selected.successRate))}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric">
                <span>首阶灵石</span>
                <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>首阶耗时</span>
                <strong>${formatTicks(selected.durationTicks)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>保护模式</span>
                <strong>${protectionOptions.length > 0 ? '可启用' : '未启用'}</strong>
              </div>
            </div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">强化材料</div>
            <div class="enhancement-material-row">
              <span>灵石</span>
              <strong>${formatDisplayInteger(selected.spiritStoneCost)}</strong>
              <span class="enhancement-material-owned">首阶消耗</span>
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
              <div class="enhancement-preview-lines">
                <div>${escapeHtml(getItemTypeLabel(selected.item.type) || '装备')}</div>
                <div>等级 Lv ${formatDisplayInteger(Number(selected.item.level) || 1)}</div>
                <div>当前强化 +${formatDisplayInteger(selected.currentLevel)}</div>
              </div>
            </div>
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">首阶预览</div>
              <div class="enhancement-preview-lines">
                <div>冲击 +${formatDisplayInteger(selected.nextLevel)}</div>
                <div>成功率 ${escapeHtml(formatRate(selected.successRate))}</div>
                <div>耗时 ${formatTicks(selected.durationTicks)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderEnhancementActiveJob(job: NonNullable<NonNullable<S2C_EnhancementPanel['state']>['job']>): string {
    return `
      <div class="enhancement-workbench-grid">
        <div class="enhancement-workbench-side">
          <div class="enhancement-target-slot-card">
            <div class="enhancement-target-slot-head">
              <div>
                <div class="enhancement-section-title">强化目标</div>
                <div class="enhancement-protection-note">${escapeHtml(job.target.source === 'equipment' ? `队列锁定 · ${getEquipSlotLabel(job.target.slot ?? 'weapon')}` : '队列锁定 · 背包物品')}</div>
              </div>
            </div>
            <button class="enhancement-target-slot" type="button" disabled>
              <span class="enhancement-target-slot-name">${escapeHtml(job.targetItemName)}</span>
              <span class="enhancement-target-slot-meta">当前 +${formatDisplayInteger(job.currentLevel)} → +${formatDisplayInteger(job.targetLevel)} · 最终目标 +${formatDisplayInteger(job.desiredTargetLevel)}</span>
            </button>
          </div>
          <div class="enhancement-target-level-card">
            <div class="enhancement-section-title">当前行动</div>
            <div class="enhancement-target-level-note">强化队列已启动，目标装备和强化锤在任务结束前会保持锁定。</div>
            <div class="enhancement-summary-metrics enhancement-summary-metrics--compact">
              <div class="enhancement-summary-metric">
                <span>当前冲击</span>
                <strong>+${formatDisplayInteger(job.targetLevel)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>最终目标</span>
                <strong>+${formatDisplayInteger(job.desiredTargetLevel)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>保护</span>
                <strong>${job.protectionUsed ? `+${formatDisplayInteger(job.protectionStartLevel ?? job.targetLevel)} 起` : '未启用'}</strong>
              </div>
            </div>
            <div class="enhancement-action-row enhancement-action-row--stacked">
              <button class="small-btn ghost" type="button" data-craft-action="cancel-enhancement">取消强化</button>
              <span class="enhancement-action-note">取消后会返还当前装备，已投入的材料不会退回；保护物仅在失败且保护生效时扣除。</span>
            </div>
          </div>
        </div>
        <div class="enhancement-workbench-main">
          <div class="enhancement-summary-card enhancement-summary-card--running">
            <div class="enhancement-summary-head">
              <div>
                <div class="enhancement-summary-title">${escapeHtml(job.targetItemName)}</div>
                <div class="enhancement-summary-subtitle">进行中：+${formatDisplayInteger(job.currentLevel)} → +${formatDisplayInteger(job.targetLevel)}${job.desiredTargetLevel > job.targetLevel ? ` · 最终目标 +${formatDisplayInteger(job.desiredTargetLevel)}` : ''}</div>
              </div>
              <div class="enhancement-summary-rate">${escapeHtml(formatRate(job.successRate))}</div>
            </div>
            <div class="enhancement-summary-metrics">
              <div class="enhancement-summary-metric">
                <span>剩余</span>
                <strong>${formatDisplayInteger(job.remainingTicks)}</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>总时长</span>
                <strong>${formatDisplayInteger(job.totalTicks)} 息</strong>
              </div>
              <div class="enhancement-summary-metric">
                <span>本阶成功率</span>
                <strong>${escapeHtml(formatRate(job.successRate))}</strong>
              </div>
            </div>
          </div>
          <div class="enhancement-requirement-card">
            <div class="enhancement-section-title">本次已投入</div>
            <div class="enhancement-material-row">
              <span>灵石</span>
              <strong>${formatDisplayInteger(job.spiritStoneCost)}</strong>
              <span class="enhancement-material-owned">角色强化等级 Lv.${formatDisplayInteger(job.roleEnhancementLevel)} · 总加速 ${escapeHtml(formatRate(job.totalSpeedRate))}</span>
            </div>
            ${job.materials.length > 0
              ? job.materials.map((entry) => `
                <div class="enhancement-material-row">
                  <span>${escapeHtml(entry.itemId)}</span>
                  <strong>${formatDisplayInteger(entry.count)}</strong>
                  <span class="enhancement-material-owned">已投入</span>
                </div>
              `).join('')
              : '<div class="enhancement-material-empty">本次没有额外材料，仅消耗灵石。</div>'}
          </div>
          <div class="enhancement-preview-grid">
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">当前阶段</div>
              <div class="enhancement-preview-lines">
                <div>${job.phase === 'paused' ? '暂停中' : '强化中'}</div>
                <div>当前 +${formatDisplayInteger(job.currentLevel)}</div>
                <div>冲击 +${formatDisplayInteger(job.targetLevel)}</div>
              </div>
            </div>
            <div class="enhancement-preview-card">
              <div class="enhancement-preview-title">保护与目标</div>
              <div class="enhancement-preview-lines">
                <div>${job.protectionUsed ? `保护从 +${formatDisplayInteger(job.protectionStartLevel ?? 2)} 生效` : '未启用保护'}</div>
                <div>最终目标 +${formatDisplayInteger(job.desiredTargetLevel)}</div>
                <div>剩余 ${formatDisplayInteger(job.remainingTicks)} 息</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderEnhancementHistory(records: PlayerEnhancementRecord[]): string {
    return `
      <div class="enhancement-history-head">
        <div class="enhancement-section-title">强化记录</div>
      </div>
      ${records.length > 0
        ? `
          <div class="enhancement-history-list-modal">
            ${records.map((record) => `
              <div class="enhancement-history-entry">
                <div class="enhancement-history-entry-title">${escapeHtml(record.itemId)}</div>
                <div class="enhancement-history-entry-meta">最高 +${formatDisplayInteger(record.highestLevel)} · ${escapeHtml(formatEnhancementRecordStatus(record.status))}</div>
                <div class="enhancement-history-detail-note">${record.levels.length > 0
                  ? record.levels.map((entry) => `+${formatDisplayInteger(entry.targetLevel)} 成 ${formatDisplayInteger(entry.successCount)} · 败 ${formatDisplayInteger(entry.failureCount)}`).join(' · ')
                  : '暂无分阶记录'}</div>
              </div>
            `).join('')}
          </div>
        `
        : '<div class="enhancement-empty-state">当前没有强化履历。</div>'}
    `;
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
    return {
      successRate: Number.isFinite(this.equipment.weapon?.alchemySuccessRate) ? Number(this.equipment.weapon?.alchemySuccessRate) : 0,
      speedRate: Number.isFinite(this.equipment.weapon?.alchemySpeedRate) ? Number(this.equipment.weapon?.alchemySpeedRate) : 0,
    };
  }

  private getAlchemyBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    return recipe.category === 'buff' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
  }

  private getAlchemyBatchOutputCount(recipe: AlchemyRecipeCatalogEntry): number {
    return computeAlchemyBatchOutputCountWithSize(recipe.outputCount, this.getAlchemyBatchOutputSize(recipe));
  }

  private getAlchemySpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, recipe.category === 'buff') * normalizeAlchemyQuantity(quantity);
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
      this.alchemySkillLevel,
      furnaceBonuses.speedRate,
      this.getAlchemyBatchOutputSize(recipe),
    );
  }

  private buildAlchemyRecipeMetaText(recipe: AlchemyRecipeCatalogEntry): string {
    const simpleCount = this.getAlchemyRecipePresets(recipe.recipeId).length;
    return `一炉 ${this.getAlchemyBatchOutputCount(recipe)} 枚 · 基时 ${recipe.baseBrewTicks * this.getAlchemyBatchOutputSize(recipe)} 息 · 简方 ${simpleCount}`;
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
      this.alchemySkillLevel,
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
      : computeAlchemyTotalJobTicks(batchBrewTicks, quantity, ALCHEMY_PREPARATION_TICKS);
    const spiritStoneCost = quantity === null
      ? null
      : this.getAlchemySpiritStoneCost(recipe, quantity);
    const errorText = maxQuantity <= 0
      ? '材料或灵石不足，当前无法开炉。'
      : quantity === null
        ? '请输入正确的炼制数量。'
        : quantity > maxQuantity
          ? `当前最多可炼 ${maxQuantity} 炉。`
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
    return `
      <div class="alchemy-confirm-shell">
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>丹药</span>
            <div class="market-price-display">
              <strong>${escapeHtml(recipe.outputName)}</strong>
              <span>${mode === 'full' ? '完整丹方' : '简易丹方'} · 一炉 ${this.getAlchemyBatchOutputCount(recipe)} 枚</span>
            </div>
          </div>
        </div>
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>炼制数量</span>
            <div class="market-quantity-row">
              <button class="small-btn ghost" data-alchemy-confirm-quick-qty="1" type="button">1</button>
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
                ${state.maxQuantity <= 0 ? 'disabled' : ''}>最大</button>
            </div>
          </div>
          <div class="market-trade-dialog-total ${state.errorText ? 'error' : ''}">
            <span>总灵石</span>
            <strong data-alchemy-confirm-total-cost="true">${state.spiritStoneCost === null ? '--' : state.spiritStoneCost} 灵石</strong>
          </div>
        </div>
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>单炉耗时</span>
            <div class="market-price-display">
              <strong>${escapeHtml(String(state.batchBrewTicks))}</strong>
              <span>不含起炉</span>
            </div>
          </div>
          <div class="market-trade-dialog-total ${state.errorText ? 'error' : ''}">
            <span>本次总耗时</span>
            <strong data-alchemy-confirm-total-ticks="true">${state.totalTicks === null ? '--' : state.totalTicks} 息</strong>
          </div>
        </div>
        <div class="market-action-hint" data-alchemy-confirm-hint="true">当前最多可炼 ${escapeHtml(String(state.maxQuantity))} 炉；每炉固定 ${escapeHtml(String(this.getAlchemyBatchOutputCount(recipe)))} 枚并按单枚独立判定，确认后会先准备 ${ALCHEMY_PREPARATION_TICKS} 息；移动或出手都会打断炼丹。</div>
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
    if (totalCostNode) {
      totalCostNode.textContent = `${state.spiritStoneCost === null ? '--' : state.spiritStoneCost} 灵石`;
      totalCostNode.parentElement?.classList.toggle('error', Boolean(state.errorText));
    }
    if (totalTicksNode) {
      totalTicksNode.textContent = `${state.totalTicks === null ? '--' : state.totalTicks} 息`;
      totalTicksNode.parentElement?.classList.toggle('error', Boolean(state.errorText));
    }
    if (hintNode) {
      hintNode.textContent = `当前最多可炼 ${state.maxQuantity} 炉；每炉固定 ${this.getAlchemyBatchOutputCount(recipe)} 枚并按单枚独立判定，确认后会先准备 ${ALCHEMY_PREPARATION_TICKS} 息；移动或出手都会打断炼丹。`;
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
  }

  private syncAlchemyConfirmModal(): void {
    const request = this.confirmStartRequest;
    const recipe = request ? this.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || !detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER) || this.activeMode !== 'alchemy') {
      this.confirmStartRequest = null;
      confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
      return;
    }
    const state = this.buildAlchemyConfirmState(recipe, request.ingredients);
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER,
      title: '选择炼制数量',
      subtitle: `${recipe.outputName} · ${request.mode === 'full' ? '完整丹方' : '简易丹方'}`,
      bodyHtml: this.renderAlchemyConfirmBody(recipe, request.mode, state),
      confirmLabel: '开始炼制',
      confirmDisabled: state.startDisabled,
      onConfirm: () => {
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
        this.callbacks?.onStartAlchemy(
          latestRequest.recipeId,
          latestRequest.ingredients.map((entry) => ({ itemId: entry.itemId, count: entry.count })),
          latestState.quantity,
        );
      },
      onClose: () => {
        this.confirmStartRequest = null;
      },
    });
    this.bindAlchemyConfirmEvents();
    this.syncAlchemyConfirmState();
  }
}

/**
 * 本文件是客户端 DOM UI 的 craft alchemy view 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有焦点/滚动状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import type {
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemyRecipeCategory,
  CraftQueueStartMode,
  PlayerAlchemyPreset,
  S2C_AlchemyPanel,
} from '@mud/shared';
import {
  ALCHEMY_FURNACE_OUTPUT_COUNT,
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
import { formatDisplayInteger } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { t } from './i18n';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';

type AlchemyTab = 'full' | 'simple';
type AlchemyRealmTab = 'mortal' | 'qi' | 'foundation';

const UNKNOWN_ITEM_NAME = '未知物品';

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

function formatRate(rate: number | undefined): string {
  if (!Number.isFinite(rate)) {
    return '0%';
  }
  return `${Math.max(0, Math.min(100, Number(rate) * 100)).toFixed(1)}%`;
}

function getAlchemyPhaseLabel(phase: 'brewing' | 'paused'): string {
  if (phase === 'paused') {
    return t('craft.workbench.alchemy.phase.paused');
  }
  return t('craft.workbench.alchemy.phase.brewing');
}

function resolveWorkTotalTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>): number {
  return Math.max(0, Math.floor(Number(job.workTotalTicks ?? job.totalTicks) || 0));
}

function resolveWorkRemainingTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>): number {
  return Math.max(0, Math.floor(Number(job.workRemainingTicks ?? job.remainingTicks) || 0));
}

function resolveInterruptRemainingTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>): number {
  return Math.max(0, Math.floor(Number(
    job.interruptWaitRemainingTicks
      ?? job.interruptState?.waitRemainingTicks
      ?? job.pausedTicks
      ?? 0,
  ) || 0));
}

function resolveInterruptTotalTicks(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']>, remaining: number): number {
  return Math.max(remaining, Math.floor(Number(job.interruptState?.waitTotalTicks ?? 10) || 10));
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

function cloneAlchemyIngredients(
  ingredients: readonly AlchemyIngredientSelection[],
): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

/** @internal Interface for accessing parent state needed by CraftAlchemyView */
export interface CraftAlchemyParent {
  readonly activeMode: string | null;
  readonly loading: boolean;
  readonly alchemyPanel: S2C_AlchemyPanel | null;
  readonly alchemyCatalog: AlchemyRecipeCatalogEntry[];
  readonly alchemyCatalogVersion: number;
  readonly alchemySkillLevel: number;
  readonly forgingSkillLevel: number;
  readonly gatherSkillLevel: number;
  readonly inventory: { items: Array<{ itemId: string; count: number }>; capacity: number; revision?: number };
  readonly equipment: { weapon?: { alchemySuccessRate?: number; alchemySpeedRate?: number; tags?: string[] } | null; revision?: number };
  activeAlchemyCategory: AlchemyRecipeCategory;
  activeAlchemyRealm: AlchemyRealmTab;
  activeAlchemyTab: AlchemyTab;
  selectedAlchemyRecipeId: string | null;
  selectedAlchemyPresetId: string | null;
  draftByRecipeId: Map<string, Map<string, number>>;
  quantityByRecipeId: Map<string, number>;
  confirmStartRequest: ConfirmStartRequest | null;
  confirmQuantityDraft: string;
  confirmEventsBound: boolean;
  readonly ALCHEMY_CONFIRM_OWNER: string;
  render(): void;
  callbacks: {
    onStartAlchemy?: (recipeId: string, ingredients: Array<{ itemId: string; count: number }>, quantity: number, queueMode: CraftQueueStartMode) => void;
    onStartForging?: (recipeId: string, ingredients: Array<{ itemId: string; count: number }>, quantity: number, queueMode: CraftQueueStartMode) => void;
    onCancelAlchemy?: () => void;
    onCancelForging?: () => void;
    onSaveAlchemyPreset?: (payload: { presetId?: string; recipeId: string; name: string; ingredients: AlchemyIngredientSelection[] }) => void;
    onDeleteAlchemyPreset?: (presetId: string) => void;
  } | null;
}


export class CraftAlchemyView {
  constructor(private readonly parent: CraftAlchemyParent) {}

  // --- Helper accessors ---

  private getVisibleAlchemyRecipes(): AlchemyRecipeCatalogEntry[] {
    if (this.parent.activeMode === 'forging') {
      return this.parent.alchemyCatalog.filter((entry) => getAlchemyRealmTab(entry.outputLevel) === this.parent.activeAlchemyRealm);
    }
    return this.parent.alchemyCatalog.filter((entry) => (
      entry.category === this.parent.activeAlchemyCategory
      && getAlchemyRealmTab(entry.outputLevel) === this.parent.activeAlchemyRealm
    ));
  }

  private getSelectedAlchemyRecipe(): AlchemyRecipeCatalogEntry | null {
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === this.parent.selectedAlchemyRecipeId) ?? null;
    if (!recipe) {
      return null;
    }
    if (this.parent.activeMode === 'forging') {
      return getAlchemyRealmTab(recipe.outputLevel) === this.parent.activeAlchemyRealm ? recipe : null;
    }
    return recipe.category === this.parent.activeAlchemyCategory && getAlchemyRealmTab(recipe.outputLevel) === this.parent.activeAlchemyRealm
      ? recipe
      : null;
  }

  private getAlchemyRecipePresets(recipeId: string): PlayerAlchemyPreset[] {
    return (this.parent.alchemyPanel?.state?.presets ?? []).filter((preset) => preset.recipeId === recipeId);
  }

  getFullAlchemyIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    return recipe.ingredients.map((ingredient) => ({
      itemId: ingredient.itemId,
      count: ingredient.count,
    }));
  }

  getAlchemyDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    const draft = this.parent.draftByRecipeId.get(recipeId);
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

  setAlchemyDraft(recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
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
    this.parent.draftByRecipeId.set(recipeId, next);
  }

  adjustAlchemyAuxCount(recipeId: string, itemId: string, delta: number): void {
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    const ingredient = recipe.ingredients.find((entry) => entry.itemId === itemId && entry.role === 'aux');
    if (!ingredient) {
      return;
    }
    const draft = this.parent.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
    const current = draft.get(itemId) ?? 0;
    draft.set(itemId, Math.max(0, Math.min(ingredient.count, current + delta)));
    this.parent.draftByRecipeId.set(recipeId, draft);
  }

  private getAlchemyInventoryCount(itemId: string): number {
    return this.parent.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private getAlchemySpiritStoneOwnedCount(): number {
    return this.getAlchemyInventoryCount('spirit_stone');
  }

  private getAlchemyFurnaceBonuses(): { successRate: number; speedRate: number } {
    const expectedTag = this.parent.activeMode === 'forging' ? 'forging_tool' : 'alchemy_furnace';
    const tags = this.parent.equipment.weapon?.tags ?? [];
    if (!tags.includes(expectedTag)) {
      return { successRate: 0, speedRate: 0 };
    }
    return {
      successRate: Number.isFinite(this.parent.equipment.weapon?.alchemySuccessRate) ? Number(this.parent.equipment.weapon?.alchemySuccessRate) : 0,
      speedRate: Number.isFinite(this.parent.equipment.weapon?.alchemySpeedRate) ? Number(this.parent.equipment.weapon?.alchemySpeedRate) : 0,
    };
  }

  private getAlchemyBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    if (this.parent.activeMode === 'forging') {
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
    if (this.parent.activeMode === 'forging') {
      return this.parent.forgingSkillLevel;
    }
    return this.parent.alchemySkillLevel;
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
    const current = normalizeAlchemyQuantity(this.parent.quantityByRecipeId.get(recipe.recipeId));
    const next = maxQuantity > 0 ? Math.min(current, maxQuantity) : 1;
    this.parent.quantityByRecipeId.set(recipe.recipeId, next);
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
    this.parent.quantityByRecipeId.set(recipe.recipeId, normalized);
  }

  private buildAlchemyRecipeMetaText(recipe: AlchemyRecipeCatalogEntry): string {
    const simpleCount = this.getAlchemyRecipePresets(recipe.recipeId).length;
    const unit = this.parent.activeMode === 'forging' ? '件' : '枚';
    const presetLabel = this.parent.activeMode === 'forging' ? '器方' : '简方';
    const presetText = this.parent.activeMode === 'forging' ? presetLabel : `${presetLabel} ${simpleCount}`;
    return `一炉 ${this.getAlchemyBatchOutputCount(recipe)} ${unit} · 基时 ${recipe.baseBrewTicks} 息 · ${presetText}`;
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


  // --- Stable key and view state ---

  buildAlchemyStableRenderKey(): string {
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    const presets = this.parent.alchemyPanel?.state?.presets ?? [];
    const presetVersion = presets
      .map((preset) => `${preset.presetId}:${preset.updatedAt}`)
      .join('|');
    const inventoryRevision = Number((this.parent.inventory as { revision?: number })?.revision ?? this.parent.inventory.items.length);
    const equipmentRevision = Number((this.parent.equipment as { revision?: number })?.revision ?? 0);
    return [
      this.parent.alchemyCatalogVersion,
      this.parent.activeAlchemyRealm,
      this.parent.activeAlchemyCategory,
      this.parent.activeAlchemyTab,
      selectedRecipe?.recipeId ?? 'empty',
      this.parent.alchemySkillLevel,
      this.parent.forgingSkillLevel,
      this.parent.gatherSkillLevel,
      inventoryRevision,
      equipmentRevision,
      Boolean(this.parent.alchemyPanel?.state?.job),
      this.parent.alchemyPanel?.error ?? '',
      presetVersion,
    ].join('::');
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

  // --- Patch ---

  tryPatchAlchemyBody(body: HTMLElement): boolean {
    const shell = body.querySelector<HTMLElement>('[data-alchemy-shell="true"]');
    const jobHost = body.querySelector<HTMLElement>('[data-alchemy-job-card-host="true"]');
    const topbar = body.querySelector<HTMLElement>('[data-alchemy-topbar="true"]');
    const categoryTabs = body.querySelector<HTMLElement>('[data-alchemy-category-tabs="true"]');
    const realmTabs = body.querySelector<HTMLElement>('[data-alchemy-realm-tabs="true"]');
    const tabHost = body.querySelector<HTMLElement>('[data-alchemy-tab-host="true"]');
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    const detailPanel = body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]');
    if (!shell || !jobHost || !topbar || !categoryTabs || !realmTabs || !tabHost || !recipeList || !detailPanel) {
      return false;
    }
    const viewState = this.captureAlchemyViewState(body);
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    const nextDetailKey = selectedRecipe ? `${selectedRecipe.recipeId}:${this.parent.activeAlchemyTab}` : 'empty';
    const preserveDetail = viewState.detailKey === nextDetailKey;
    const stableKey = this.buildAlchemyStableRenderKey();

    this.patchAlchemyJobHost(jobHost);
    replaceElementHtml(topbar, this.renderAlchemyTopbar());
    if (shell.dataset.alchemyStableRenderKey === stableKey && preserveDetail) {
      this.restoreAlchemyViewState(body, viewState, true);
      return true;
    }
    replaceElementHtml(categoryTabs, this.renderAlchemyCategoryTabs());
    replaceElementHtml(realmTabs, this.renderAlchemyRealmTabs());
    replaceElementHtml(tabHost, this.renderAlchemyTabButtons());
    replaceElementHtml(recipeList, this.renderAlchemyRecipeList());
    detailPanel.dataset.detailKey = nextDetailKey;
    replaceElementHtml(detailPanel, this.renderAlchemyDetailPanel());
    shell.dataset.alchemyStableRenderKey = stableKey;
    bindInlineItemTooltips(body);
    this.restoreAlchemyViewState(body, viewState, preserveDetail);
    return true;
  }

  // --- Job patching ---

  private patchAlchemyJobHost(jobHost: HTMLElement): void {
    const job = this.parent.alchemyPanel?.state?.job ?? null;
    const nextJobKey = this.getAlchemyJobPatchKey(job);
    const card = jobHost.querySelector<HTMLElement>('[data-alchemy-job-card="true"]');
    if (!card || card.dataset.alchemyJobKey !== nextJobKey) {
      replaceElementHtml(jobHost, this.renderAlchemyJobCard(job));
      return;
    }
    if (!job) {
      return;
    }
    const workRemainingTicks = resolveWorkRemainingTicks(job);
    const workTotalTicks = resolveWorkTotalTicks(job);
    const progressPercent = Math.max(0, Math.min(100, (1 - (workRemainingTicks / Math.max(1, workTotalTicks))) * 100));
    const interruptRemainingTicks = resolveInterruptRemainingTicks(job);
    const interruptTotalTicks = resolveInterruptTotalTicks(job, interruptRemainingTicks);
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

  // --- Render: topbar, tabs, recipe list, detail panel ---

  renderAlchemyTopbar(): string {
    const isForging = this.parent.activeMode === 'forging';
    const displayLevel = isForging ? this.parent.forgingSkillLevel : this.parent.alchemySkillLevel;
    return `
      <div class="alchemy-topbar-main">
        <span class="alchemy-topbar-label">${escapeHtml(isForging ? t('craft.workbench.alchemy.topbar.level.forging') : t('craft.workbench.alchemy.topbar.level.alchemy'))}</span>
        <strong class="alchemy-topbar-value">LV ${formatDisplayInteger(displayLevel)}</strong>
      </div>
      <div class="alchemy-topbar-note">${escapeHtml(t('craft.workbench.alchemy.topbar.note', { itemKind: isForging ? t('craft.workbench.alchemy.item-kind.forging') : t('craft.workbench.alchemy.item-kind.alchemy') }))}</div>
    `;
  }

  renderAlchemyTabButtons(): string {
    if (this.parent.activeMode === 'forging') {
      return `
        <button class="alchemy-tab-btn ${this.parent.activeAlchemyTab === 'full' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="full">${escapeHtml(t('craft.workbench.alchemy.tab.full-forging'))}</button>
        <button class="alchemy-tab-btn ${this.parent.activeAlchemyTab === 'simple' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">${escapeHtml(t('craft.workbench.alchemy.tab.simple-forging'))}</button>
      `;
    }
    return `
      <button class="alchemy-tab-btn ${this.parent.activeAlchemyTab === 'full' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="full">${escapeHtml(t('craft.workbench.alchemy.tab.full-alchemy'))}</button>
      <button class="alchemy-tab-btn ${this.parent.activeAlchemyTab === 'simple' ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-tab" data-tab="simple">${escapeHtml(t('craft.workbench.alchemy.tab.simple-alchemy'))}</button>
    `;
  }

  renderAlchemyCategoryTabs(): string {
    if (this.parent.activeMode === 'forging') {
      const count = this.parent.alchemyCatalog.filter((entry) => getAlchemyRealmTab(entry.outputLevel) === this.parent.activeAlchemyRealm).length;
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
      const count = this.parent.alchemyCatalog.filter((entry) => (
        entry.category === tab.category
        && getAlchemyRealmTab(entry.outputLevel) === this.parent.activeAlchemyRealm
      )).length;
      return `
        <button class="alchemy-category-btn ${this.parent.activeAlchemyCategory === tab.category ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-category" data-category="${tab.category}">
          ${escapeHtml(tab.label)}
          <span class="alchemy-category-count">${formatDisplayInteger(count)}</span>
        </button>
      `;
    }).join('');
  }

  renderAlchemyRealmTabs(): string {
    const realms: Array<{ realm: AlchemyRealmTab; label: string }> = [
      { realm: 'mortal', label: t('craft.workbench.alchemy.realm.mortal') },
      { realm: 'qi', label: t('craft.workbench.alchemy.realm.qi') },
      { realm: 'foundation', label: t('craft.workbench.alchemy.realm.foundation') },
    ];
    return realms.map((tab) => {
      const count = this.parent.alchemyCatalog.filter((entry) => getAlchemyRealmTab(entry.outputLevel) === tab.realm).length;
      return `
        <button class="alchemy-category-btn ${this.parent.activeAlchemyRealm === tab.realm ? 'active' : ''}" type="button" data-craft-action="alchemy-switch-realm" data-realm="${tab.realm}">
          ${escapeHtml(tab.label)}
          <span class="alchemy-category-count">${formatDisplayInteger(count)}</span>
        </button>
      `;
    }).join('');
  }

  renderAlchemyRecipeList(): string {
    const visibleRecipes = this.getVisibleAlchemyRecipes();
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    if (visibleRecipes.length === 0) {
      const noun = this.parent.activeMode === 'forging' ? t('craft.workbench.alchemy.noun.forging-recipe') : t('craft.workbench.alchemy.noun.alchemy-recipe');
      return `<div class="alchemy-recipe-list-empty">${escapeHtml(this.parent.loading ? t('craft.workbench.alchemy.recipe-list.loading', { noun }) : (this.parent.alchemyPanel?.error ?? t('craft.workbench.alchemy.recipe-list.empty-category', { noun })))}</div>`;
    }
    return visibleRecipes
      .map((recipe) => this.renderAlchemyRecipeItem(recipe, recipe.recipeId === selectedRecipe?.recipeId))
      .join('');
  }

  renderAlchemyRecipeItem(recipe: AlchemyRecipeCatalogEntry, active: boolean): string {
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

  renderAlchemyDetailPanel(): string {
    const state = this.parent.alchemyPanel?.state ?? null;
    const selectedRecipe = this.getSelectedAlchemyRecipe();
    const presets = selectedRecipe
      ? state?.presets.filter((preset) => preset.recipeId === selectedRecipe.recipeId) ?? []
      : [];
    if (!selectedRecipe) {
      const noun = this.parent.activeMode === 'forging' ? t('craft.workbench.alchemy.noun.forging-recipe') : t('craft.workbench.alchemy.noun.alchemy-recipe');
      return `<div class="alchemy-recipe-list-empty">${escapeHtml(this.parent.loading ? t('craft.workbench.alchemy.recipe-list.loading', { noun }) : (this.parent.alchemyPanel?.error ?? t('craft.workbench.alchemy.recipe-list.empty-current', { noun })))}</div>`;
    }
    return this.parent.activeAlchemyTab === 'full'
      ? this.renderAlchemyFullTab(selectedRecipe)
      : this.renderAlchemySimpleTab(selectedRecipe, presets);
  }

  private renderAlchemyItemReference(
    itemId: string,
    label: string,
    tone: 'reward' | 'material',
    count?: number,
  ): string {
    const displayLabel = label.trim() && label !== itemId ? label : UNKNOWN_ITEM_NAME;
    return renderInlineItemChip(itemId, { label: displayLabel, tone, count });
  }


  // --- Main body render ---

  renderAlchemyBody(): string {
    const recipeTypeLabel = this.parent.activeMode === 'forging'
      ? t('craft.workbench.alchemy.control.recipe-type.forging')
      : t('craft.workbench.alchemy.control.recipe-type.alchemy');
    return `
      <div class="alchemy-modal-shell" data-alchemy-shell="true" data-alchemy-stable-render-key="${escapeHtml(this.buildAlchemyStableRenderKey())}">
        <div data-alchemy-job-card-host="true">${this.renderAlchemyJobCard(this.parent.alchemyPanel?.state?.job ?? null)}</div>
        <div class="alchemy-topbar" data-alchemy-topbar="true">
          ${this.renderAlchemyTopbar()}
        </div>
        <div class="alchemy-control-row" data-alchemy-control-row="true">
          <div class="alchemy-control-group alchemy-control-group--realms">
            <span class="alchemy-control-label">${escapeHtml(t('craft.workbench.alchemy.control.realm'))}</span>
            <div class="alchemy-realm-tabs" data-alchemy-realm-tabs="true">
              ${this.renderAlchemyRealmTabs()}
            </div>
          </div>
          <div class="alchemy-control-group alchemy-control-group--tabs">
            <span class="alchemy-control-label">${escapeHtml(recipeTypeLabel)}</span>
            <div class="alchemy-modal-tabs" data-alchemy-tab-host="true">
              ${this.renderAlchemyTabButtons()}
            </div>
          </div>
        </div>
        <div class="alchemy-layout">
          <aside class="alchemy-recipe-sidebar">
            <div class="alchemy-category-tabs" data-alchemy-category-tabs="true">
              ${this.renderAlchemyCategoryTabs()}
            </div>
            <div class="alchemy-recipe-list" data-alchemy-recipe-list="true">
              ${this.renderAlchemyRecipeList()}
            </div>
          </aside>
          <section class="alchemy-detail-panel" data-alchemy-detail-panel="true" data-detail-key="${escapeHtml(this.getSelectedAlchemyRecipe() ? `${this.getSelectedAlchemyRecipe()!.recipeId}:${this.parent.activeAlchemyTab}` : 'empty')}">
            ${this.renderAlchemyDetailPanel()}
          </section>
        </div>
      </div>
    `;
  }

  renderAlchemyJobCard(job: NonNullable<NonNullable<S2C_AlchemyPanel['state']>['job']> | null): string {
    const isForging = this.parent.activeMode === 'forging' || job?.jobType === 'forging';
    const activityName = isForging ? t('craft.workbench.mode.forging') : t('craft.workbench.mode.alchemy');
    const unit = isForging ? t('craft.workbench.unit.item') : t('craft.workbench.unit.pill');
    const successLabel = isForging ? t('craft.workbench.alchemy.metric.success.forging') : t('craft.workbench.alchemy.metric.success.alchemy');
    if (!job) {
      return `<section class="alchemy-job-card empty" data-alchemy-job-card="true" data-alchemy-job-key="empty"><div class="alchemy-job-title">${escapeHtml(t('craft.workbench.alchemy.job.title'))}</div><div class="alchemy-job-text">${escapeHtml(t('craft.workbench.alchemy.job.empty', { activityName }))}</div></section>`;
    }
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === job.recipeId) ?? null;
    const workRemainingTicks = resolveWorkRemainingTicks(job);
    const workTotalTicks = resolveWorkTotalTicks(job);
    const progressPercent = Math.max(0, Math.min(100, (1 - (workRemainingTicks / Math.max(1, workTotalTicks))) * 100));
    const interruptRemainingTicks = resolveInterruptRemainingTicks(job);
    const interruptTotalTicks = resolveInterruptTotalTicks(job, interruptRemainingTicks);
    const interruptPercent = Math.max(0, Math.min(100, (1 - (interruptRemainingTicks / Math.max(1, interruptTotalTicks))) * 100));
    const phaseClass = job.phase === 'paused' ? 'is-paused' : 'is-brewing';
    return `
      <section class="alchemy-job-card" data-alchemy-job-card="true" data-alchemy-job-key="${escapeHtml(this.getAlchemyJobPatchKey(job))}">
        <div class="alchemy-job-head">
          <div>
            <div class="alchemy-job-title">${escapeHtml(t('craft.workbench.alchemy.job.title'))}</div>
            <div class="alchemy-job-name">${this.renderAlchemyItemReference(job.outputItemId, recipe?.outputName ?? job.outputItemId, 'reward')}</div>
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
    const mainRoleLabel = this.parent.activeMode === 'forging' ? '主材' : '主药';
    const auxRoleLabel = this.parent.activeMode === 'forging' ? '辅材' : '辅药';
    const powerLabel = this.parent.activeMode === 'forging' ? '单份契合' : '单份药力';
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
    const selectedPreset = this.parent.selectedAlchemyPresetId
      ? presets.find((preset) => preset.presetId === this.parent.selectedAlchemyPresetId) ?? null
      : null;
    const mainRoleLabel = this.parent.activeMode === 'forging' ? '主材' : '主药';
    const auxRoleLabel = this.parent.activeMode === 'forging' ? '辅材' : '辅药';
    const emptyPresetText = this.parent.activeMode === 'forging'
      ? '当前器物还没有保存的简易器方。'
      : '当前丹药还没有保存的简易丹方。';
    return `
      <div class="alchemy-tab-stack">
        ${this.renderAlchemySummaryCard(recipe, 'simple', metrics)}
        <div class="alchemy-preset-strip" data-alchemy-preset-strip="true">
          ${presets.length > 0
            ? presets.map((preset) => `
              <button
                class="alchemy-preset-chip ${this.parent.selectedAlchemyPresetId === preset.presetId ? 'active' : ''}"
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
    const isForging = this.parent.activeMode === 'forging';
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
    const isForging = this.parent.activeMode === 'forging';
    const state = this.parent.alchemyPanel?.state ?? null;
    const maxQuantity = this.getAlchemyMaxCraftQuantity(recipe, ingredients);
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
          spiritStoneCost: formatDisplayInteger(this.getAlchemySpiritStoneCost(recipe, 1)),
          batchTime: formatTicks(batchBrewTicks),
        }))}</span>
      </div>
    `;
  }


  // --- Confirm modal ---

  openAlchemyConfirm(
    recipeId: string,
    ingredients: readonly AlchemyIngredientSelection[],
    mode: AlchemyTab,
  ): void {
    this.parent.confirmStartRequest = {
      recipeId,
      ingredients: cloneAlchemyIngredients(ingredients),
      mode,
    };
    const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (recipe) {
      this.parent.confirmQuantityDraft = String(this.getAlchemySelectedQuantity(recipe, ingredients));
    }
    this.syncAlchemyConfirmModal();
  }

  private parseAlchemyConfirmQuantity(): number | null {
    if (!this.parent.confirmQuantityDraft || !/^\d+$/.test(this.parent.confirmQuantityDraft)) {
      return null;
    }
    const quantity = Number(this.parent.confirmQuantityDraft);
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
    state: ReturnType<CraftAlchemyView['buildAlchemyConfirmState']>,
  ): string {
    const isForging = this.parent.activeMode === 'forging';
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
                value="${escapeHtml(this.parent.confirmQuantityDraft || '1')}"
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


  bindAlchemyConfirmEvents(): void {
    if (this.parent.confirmEventsBound) {
      return;
    }
    this.parent.confirmEventsBound = true;
    document.addEventListener('click', (event) => {
      if (!confirmModalHost.isOpenFor(this.parent.ALCHEMY_CONFIRM_OWNER)) {
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
      this.parent.confirmQuantityDraft = value;
      const input = document.querySelector<HTMLInputElement>('[data-alchemy-confirm-quantity="true"]');
      if (input) {
        input.value = value;
      }
      this.syncAlchemyConfirmState();
    }, true);
    document.addEventListener('input', (event) => {
      if (!confirmModalHost.isOpenFor(this.parent.ALCHEMY_CONFIRM_OWNER)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.alchemyConfirmQuantity !== 'true') {
        return;
      }
      const normalized = target.value.replaceAll(/[^\d]/g, '');
      this.parent.confirmQuantityDraft = normalized;
      if (target.value !== normalized) {
        target.value = normalized;
      }
      this.syncAlchemyConfirmState();
    });
  }

  private normalizeQueueStartMode(value: string | undefined): 'replace' | 'preserve' | 'append' {
    if (value === 'preserve' || value === 'append') {
      return value;
    }
    return 'replace';
  }

  private submitAlchemyConfirm(queueMode: 'replace' | 'preserve' | 'append'): void {
    const latestRequest = this.parent.confirmStartRequest;
    const latestRecipe = latestRequest ? this.parent.alchemyCatalog.find((entry) => entry.recipeId === latestRequest.recipeId) ?? null : null;
    if (!latestRequest || !latestRecipe) {
      this.parent.confirmStartRequest = null;
      return;
    }
    const latestState = this.buildAlchemyConfirmState(latestRecipe, latestRequest.ingredients);
    if (latestState.startDisabled || latestState.quantity === null) {
      this.syncAlchemyConfirmModal();
      return;
    }
    this.setAlchemySelectedQuantity(latestRecipe, latestRequest.ingredients, latestState.quantity);
    this.parent.confirmStartRequest = null;
    const start = this.parent.activeMode === 'forging'
      ? this.parent.callbacks?.onStartForging
      : this.parent.callbacks?.onStartAlchemy;
    start?.(
      latestRequest.recipeId,
      latestRequest.ingredients.map((entry) => ({ itemId: entry.itemId, count: entry.count })),
      latestState.quantity,
      queueMode,
    );
    confirmModalHost.close(this.parent.ALCHEMY_CONFIRM_OWNER);
  }


  syncAlchemyConfirmState(): void {
    const request = this.parent.confirmStartRequest;
    const recipe = request ? this.parent.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || !confirmModalHost.isOpenFor(this.parent.ALCHEMY_CONFIRM_OWNER)) {
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
      const unit = this.parent.activeMode === 'forging'
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

  syncAlchemyConfirmModal(): void {
    const request = this.parent.confirmStartRequest;
    const recipe = request ? this.parent.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || (this.parent.activeMode !== 'alchemy' && this.parent.activeMode !== 'forging')) {
      this.parent.confirmStartRequest = null;
      confirmModalHost.close(this.parent.ALCHEMY_CONFIRM_OWNER);
      return;
    }
    const isForging = this.parent.activeMode === 'forging';
    const state = this.buildAlchemyConfirmState(recipe, request.ingredients);
    confirmModalHost.open({
      ownerId: this.parent.ALCHEMY_CONFIRM_OWNER,
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
        this.parent.confirmStartRequest = null;
      },
    });
    this.bindAlchemyConfirmEvents();
    this.syncAlchemyConfirmState();
  }

  // --- Action binding helpers (called from parent's bindActions) ---

  handleAlchemySwitchCategory(category: string): void {
    this.parent.activeAlchemyCategory = normalizeAlchemyCategory(category);
    const firstRecipe = this.getVisibleAlchemyRecipes()[0] ?? null;
    this.parent.selectedAlchemyRecipeId = firstRecipe?.recipeId ?? null;
    this.parent.selectedAlchemyPresetId = null;
    this.ensureAlchemyDraft();
    this.parent.render();
  }

  handleAlchemySwitchRealm(realm: string): void {
    this.parent.activeAlchemyRealm = normalizeAlchemyRealm(realm);
    const firstRecipe = this.getVisibleAlchemyRecipes()[0] ?? null;
    this.parent.selectedAlchemyRecipeId = firstRecipe?.recipeId ?? null;
    this.parent.selectedAlchemyPresetId = null;
    this.ensureAlchemyDraft();
    this.parent.render();
  }

  handleAlchemySwitchTab(tab: string): void {
    this.parent.activeAlchemyTab = tab === 'simple' ? 'simple' : 'full';
    this.parent.render();
  }

  handleAlchemySelectRecipe(recipeId: string): void {
    this.parent.selectedAlchemyRecipeId = recipeId;
    this.parent.selectedAlchemyPresetId = null;
    this.ensureAlchemyDraft();
    this.parent.render();
  }

  handleAlchemySelectPreset(presetId: string): void {
    const recipeId = this.parent.selectedAlchemyRecipeId;
    if (!recipeId) {
      return;
    }
    const preset = this.getAlchemyRecipePresets(recipeId).find((entry) => entry.presetId === presetId);
    if (!preset) {
      return;
    }
    this.parent.selectedAlchemyPresetId = presetId;
    this.setAlchemyDraft(recipeId, preset.ingredients);
    this.parent.render();
  }

  handleAlchemyAdjustAux(itemId: string, delta: number): void {
    const recipeId = this.parent.selectedAlchemyRecipeId;
    if (!recipeId) {
      return;
    }
    this.parent.selectedAlchemyPresetId = null;
    this.adjustAlchemyAuxCount(recipeId, itemId, delta);
    this.parent.render();
  }

  handleAlchemyResetDraft(): void {
    const recipeId = this.parent.selectedAlchemyRecipeId;
    if (!recipeId) {
      return;
    }
    this.parent.selectedAlchemyPresetId = null;
    this.setAlchemyDraft(recipeId, this.getFullAlchemyIngredients(recipeId));
    this.parent.render();
  }

  handleAlchemySavePreset(): void {
    if (this.parent.activeMode === 'forging') {
      return;
    }
    const recipe = this.getSelectedAlchemyRecipe();
    if (!recipe) {
      return;
    }
    const matchingPresets = this.getAlchemyRecipePresets(recipe.recipeId);
    const selectedPreset = this.parent.selectedAlchemyPresetId
      ? matchingPresets.find((preset) => preset.presetId === this.parent.selectedAlchemyPresetId) ?? null
      : null;
    this.parent.callbacks?.onSaveAlchemyPreset?.({
      presetId: selectedPreset?.presetId,
      recipeId: recipe.recipeId,
      name: selectedPreset?.name ?? `${recipe.outputName}简方${matchingPresets.length + 1}`,
      ingredients: this.getAlchemyDraftIngredients(recipe.recipeId),
    });
  }

  handleAlchemyStartFull(): void {
    const recipeId = this.parent.selectedAlchemyRecipeId;
    if (!recipeId) {
      return;
    }
    this.openAlchemyConfirm(recipeId, this.getFullAlchemyIngredients(recipeId), 'full');
  }

  handleAlchemyStartDraft(): void {
    const recipeId = this.parent.selectedAlchemyRecipeId;
    if (!recipeId) {
      return;
    }
    this.openAlchemyConfirm(recipeId, this.getAlchemyDraftIngredients(recipeId), 'simple');
  }

  ensureAlchemyDraft(): void {
    const recipeId = this.parent.selectedAlchemyRecipeId;
    if (!recipeId || this.parent.draftByRecipeId.has(recipeId)) {
      return;
    }
    const presets = this.getAlchemyRecipePresets(recipeId);
    const activePreset = this.parent.selectedAlchemyPresetId
      ? presets.find((preset) => preset.presetId === this.parent.selectedAlchemyPresetId) ?? null
      : null;
    this.setAlchemyDraft(recipeId, activePreset?.ingredients ?? this.getFullAlchemyIngredients(recipeId));
  }

  getAlchemySubtitle(): string {
    const job = this.parent.alchemyPanel?.state?.job;
    if (job) {
      const recipe = this.parent.alchemyCatalog.find((entry) => entry.recipeId === job.recipeId) ?? null;
      return t('craft.workbench.alchemy.subtitle.job', {
        itemName: recipe?.outputName?.trim() || '未知物品',
        completed: formatDisplayInteger(job.completedCount),
        quantity: formatDisplayInteger(job.quantity),
      });
    }
    return this.parent.activeMode === 'forging'
      ? t('craft.workbench.alchemy.subtitle.forging', { level: formatDisplayInteger(this.parent.forgingSkillLevel) })
      : t('craft.workbench.alchemy.subtitle.alchemy', {
        alchemyLevel: formatDisplayInteger(this.parent.alchemySkillLevel),
        gatherLevel: formatDisplayInteger(this.parent.gatherSkillLevel),
      });
  }
}

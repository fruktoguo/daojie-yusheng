import {
  ALCHEMY_FURNACE_OUTPUT_COUNT,
  ALCHEMY_PREPARATION_TICKS,
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemyRecipeCategory,
  C2S_SaveAlchemyPreset,
  C2S_StartAlchemy,
  EquipmentSlots,
  Inventory,
  PlayerAlchemyPreset,
  PlayerState,
  S2C_AlchemyPanel,
  SyncedAlchemyPanelState,
  buildAlchemyIngredientCountMap,
  computeAlchemyBatchOutputCountWithSize,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyAdjustedSuccessRate,
  computeAlchemyPowerRatio,
  computeAlchemySuccessRate,
  computeAlchemyTotalJobTicks,
  getAlchemySpiritStoneCost,
  isExactAlchemyRecipe,
  normalizeAlchemyQuantity,
} from '@mud/shared';
import { hasLoadedItemSourceCatalog, preloadItemSourceCatalog } from '../content/item-sources';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';

/** AlchemyTab：定义该类型的结构与数据语义。 */
type AlchemyTab = 'simple' | 'full';

/** AlchemyModalCallbacks：定义该接口的能力与字段约束。 */
interface AlchemyModalCallbacks {
  onRequestPanel: (knownCatalogVersion?: number) => void;
  onSavePreset: (payload: C2S_SaveAlchemyPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onStartAlchemy: (payload: C2S_StartAlchemy) => void;
  onCancelAlchemy: () => void;
}

/** AlchemyScrollState：定义该接口的能力与字段约束。 */
interface AlchemyScrollState {
/** bodyTop：定义该变量以承载业务值。 */
  bodyTop: number;
/** bodyLeft：定义该变量以承载业务值。 */
  bodyLeft: number;
/** recipeListTop：定义该变量以承载业务值。 */
  recipeListTop: number;
/** recipeListLeft：定义该变量以承载业务值。 */
  recipeListLeft: number;
/** detailTop：定义该变量以承载业务值。 */
  detailTop: number;
/** detailLeft：定义该变量以承载业务值。 */
  detailLeft: number;
/** presetLeft：定义该变量以承载业务值。 */
  presetLeft: number;
}

/** AlchemyRenderOptions：定义该接口的能力与字段约束。 */
interface AlchemyRenderOptions {
  preserveScroll?: boolean;
  resetDetailScroll?: boolean;
  resetRecipeListScroll?: boolean;
}

/** AlchemyMetricSnapshot：定义该接口的能力与字段约束。 */
interface AlchemyMetricSnapshot {
/** powerText：定义该变量以承载业务值。 */
  powerText: string;
/** successText：定义该变量以承载业务值。 */
  successText: string;
/** brewTimeText：定义该变量以承载业务值。 */
  brewTimeText: string;
}

/** SPIRIT_STONE_ITEM_ID：定义该变量以承载业务值。 */
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatPercent：执行对应的业务逻辑。 */
function formatPercent(rate: number): string {
/** normalized：定义该变量以承载业务值。 */
  const normalized = Math.max(0, Math.min(1, rate));
/** percent：定义该变量以承载业务值。 */
  const percent = normalized * 100;
  return `${percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

/** cloneIngredients：执行对应的业务逻辑。 */
function cloneIngredients(ingredients: readonly AlchemyIngredientSelection[]): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

/** AlchemyModal：封装相关状态与行为。 */
export class AlchemyModal {
  private static readonly MODAL_OWNER = 'alchemy-modal';
  private static readonly CONFIRM_MODAL_OWNER = 'alchemy-modal:confirm-start';
/** callbacks：定义该变量以承载业务值。 */
  private callbacks: AlchemyModalCallbacks | null = null;
/** inventory：定义该变量以承载业务值。 */
  private inventory: Inventory = { items: [], capacity: 0 };
/** equipment：定义该变量以承载业务值。 */
  private equipment: EquipmentSlots = { weapon: null, head: null, body: null, legs: null, accessory: null };
/** alchemySkill：定义该变量以承载业务值。 */
  private alchemySkill: PlayerState['alchemySkill'] | undefined;
  private loading = false;
/** responseError：定义该变量以承载业务值。 */
  private responseError: string | null = null;
/** panelState：定义该变量以承载业务值。 */
  private panelState: SyncedAlchemyPanelState | null = null;
  private catalogVersion = 0;
/** catalog：定义该变量以承载业务值。 */
  private catalog: AlchemyRecipeCatalogEntry[] = [];
  private catalogByRecipeId = new Map<string, AlchemyRecipeCatalogEntry>();
/** activeTab：定义该变量以承载业务值。 */
  private activeTab: AlchemyTab = 'full';
/** activeCategory：定义该变量以承载业务值。 */
  private activeCategory: AlchemyRecipeCategory = 'recovery';
/** selectedRecipeId：定义该变量以承载业务值。 */
  private selectedRecipeId: string | null = null;
/** selectedPresetId：定义该变量以承载业务值。 */
  private selectedPresetId: string | null = null;
  private draftByRecipeId = new Map<string, Map<string, number>>();
  private quantityByRecipeId = new Map<string, number>();
  private delegatedEventsBound = false;
  private confirmEventsBound = false;
/** countdownTimer：定义该变量以承载业务值。 */
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
/** localJobRemainingTicks：定义该变量以承载业务值。 */
  private localJobRemainingTicks: number | null = null;
/** localBatchRemainingTicks：定义该变量以承载业务值。 */
  private localBatchRemainingTicks: number | null = null;
/** localPausedTicks：定义该变量以承载业务值。 */
  private localPausedTicks: number | null = null;
/** localJobPhase：定义该变量以承载业务值。 */
  private localJobPhase: 'preparing' | 'brewing' | 'paused' | null = null;
/** lastJobSnapshotKey：定义该变量以承载业务值。 */
  private lastJobSnapshotKey: string | null = null;
/** confirmStartRequest：定义该变量以承载业务值。 */
  private confirmStartRequest: { recipeId: string; ingredients: AlchemyIngredientSelection[]; mode: AlchemyTab } | null = null;
  private confirmQuantityDraft = '1';

/** setCallbacks：执行对应的业务逻辑。 */
  setCallbacks(callbacks: AlchemyModalCallbacks): void {
    this.callbacks = callbacks;
  }

/** initFromPlayer：执行对应的业务逻辑。 */
  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
    this.alchemySkill = player.alchemySkill;
  }

/** syncInventory：执行对应的业务逻辑。 */
  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

/** syncEquipment：执行对应的业务逻辑。 */
  syncEquipment(equipment: EquipmentSlots): void {
    this.equipment = equipment;
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

/** syncAlchemySkill：执行对应的业务逻辑。 */
  syncAlchemySkill(skill?: PlayerState['alchemySkill']): void {
    this.alchemySkill = skill;
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

/** open：执行对应的业务逻辑。 */
  open(): void {
    this.loading = true;
    this.responseError = null;
    this.activeTab = 'full';
    this.activeCategory = this.resolvePreferredOpenCategory();
    this.confirmStartRequest = null;
    this.ensureItemSourceCatalog();
    this.render();
    this.callbacks?.onRequestPanel(this.catalogVersion || undefined);
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.loading = false;
    this.responseError = null;
    this.panelState = null;
    this.selectedPresetId = null;
    this.selectedRecipeId = null;
    this.draftByRecipeId.clear();
    this.quantityByRecipeId.clear();
    this.confirmStartRequest = null;
    this.localJobRemainingTicks = null;
    this.localBatchRemainingTicks = null;
    this.localPausedTicks = null;
    this.localJobPhase = null;
    this.lastJobSnapshotKey = null;
    this.stopCountdown();
    confirmModalHost.close(AlchemyModal.CONFIRM_MODAL_OWNER);
    detailModalHost.close(AlchemyModal.MODAL_OWNER);
  }

/** updatePanel：执行对应的业务逻辑。 */
  updatePanel(data: S2C_AlchemyPanel): void {
    this.loading = false;
    this.responseError = data.error ?? null;
    if (data.catalog && data.catalogVersion >= this.catalogVersion) {
      this.catalogVersion = data.catalogVersion;
      this.catalog = data.catalog.map((recipe) => ({
        ...recipe,
        ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      }));
      this.catalogByRecipeId = new Map(this.catalog.map((recipe) => [recipe.recipeId, recipe] as const));
    }
    this.panelState = data.state ? {
      furnaceItemId: data.state.furnaceItemId,
      presets: data.state.presets.map((preset) => ({
        ...preset,
        ingredients: cloneIngredients(preset.ingredients),
      })),
      job: data.state.job ? {
        ...data.state.job,
        ingredients: cloneIngredients(data.state.job.ingredients),
      } : null,
    } : null;
    this.ensureSelection();
    this.syncJobCountdown();
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

/** ensureSelection：执行对应的业务逻辑。 */
  private ensureSelection(): void {
/** preferredRecipeId：定义该变量以承载业务值。 */
    const preferredRecipeId = this.panelState?.job?.recipeId
      ?? this.panelState?.presets[0]?.recipeId
      ?? null;
/** preferredRecipe：定义该变量以承载业务值。 */
    const preferredRecipe = preferredRecipeId ? (this.catalogByRecipeId.get(preferredRecipeId) ?? null) : null;
    if (
      preferredRecipe
      && this.getVisibleCatalog().length === 0
      && this.resolveRecipeCategory(preferredRecipe) !== this.activeCategory
    ) {
      this.activeCategory = this.resolveRecipeCategory(preferredRecipe);
    }
/** visibleCatalog：定义该变量以承载业务值。 */
    let visibleCatalog = this.getVisibleCatalog();
    if (visibleCatalog.length === 0) {
/** fallbackCategory：定义该变量以承载业务值。 */
      const fallbackCategory = this.activeCategory === 'recovery' ? 'buff' : 'recovery';
/** fallbackCatalog：定义该变量以承载业务值。 */
      const fallbackCatalog = this.getCatalogByCategory(fallbackCategory);
      if (fallbackCatalog.length > 0) {
        this.activeCategory = fallbackCategory;
        visibleCatalog = fallbackCatalog;
      }
    }
/** nextPreferredRecipeId：定义该变量以承载业务值。 */
    const nextPreferredRecipeId = preferredRecipeId
      ?? visibleCatalog[0]?.recipeId
      ?? null;
    if (!this.selectedRecipeId || !visibleCatalog.some((recipe) => recipe.recipeId === this.selectedRecipeId)) {
      this.selectedRecipeId = nextPreferredRecipeId && visibleCatalog.some((recipe) => recipe.recipeId === nextPreferredRecipeId)
        ? nextPreferredRecipeId
        : (visibleCatalog[0]?.recipeId ?? null);
    }
    if (!this.selectedRecipeId) {
      return;
    }
/** recipePresets：定义该变量以承载业务值。 */
    const recipePresets = this.getRecipePresets(this.selectedRecipeId);
    if (this.selectedPresetId && !recipePresets.some((preset) => preset.presetId === this.selectedPresetId)) {
      this.selectedPresetId = null;
    }
    if (!this.draftByRecipeId.has(this.selectedRecipeId)) {
/** activePreset：定义该变量以承载业务值。 */
      const activePreset = this.selectedPresetId
        ? recipePresets.find((preset) => preset.presetId === this.selectedPresetId) ?? null
        : null;
      this.setDraft(this.selectedRecipeId, activePreset?.ingredients ?? this.getFullRecipeIngredients(this.selectedRecipeId));
    }
  }

/** render：执行对应的业务逻辑。 */
  private render(options: AlchemyRenderOptions = {}): void {
    this.ensureSelection();
/** scrollState：定义该变量以承载业务值。 */
    const scrollState = options.preserveScroll ? this.captureScrollState() : null;
    if (this.tryPatchModal(options, scrollState)) {
      return;
    }
    detailModalHost.open({
      ownerId: AlchemyModal.MODAL_OWNER,
      variantClass: 'detail-modal--alchemy',
      title: '炉中炼丹',
      subtitle: this.getAlchemyHeaderSubtitle(),
      bodyHtml: this.renderBody(),
      onClose: () => {
        this.stopCountdown();
      },
      onAfterRender: (body) => {
        this.patchModalChrome();
        bindInlineItemTooltips(body);
        this.bindEvents(body);
        if (scrollState) {
          this.restoreScrollState(scrollState, options);
        }
        this.refreshJobCountdown();
      },
    });
  }

/** tryPatchModal：执行对应的业务逻辑。 */
  private tryPatchModal(options: AlchemyRenderOptions, scrollState: AlchemyScrollState | null): boolean {
    if (!detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      return false;
    }
/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return false;
    }
    this.patchModalChrome();
/** selectedRecipe：定义该变量以承载业务值。 */
    const selectedRecipe = this.getSelectedRecipe();
/** shell：定义该变量以承载业务值。 */
    const shell = body.querySelector<HTMLElement>('[data-alchemy-shell="true"]');
    if (!selectedRecipe || !shell) {
      body.innerHTML = this.renderBody();
      bindInlineItemTooltips(body);
      this.bindEvents(body);
      if (scrollState) {
        this.restoreScrollState(scrollState, options);
      }
      this.refreshJobCountdown();
      return true;
    }
/** jobHost：定义该变量以承载业务值。 */
    const jobHost = body.querySelector<HTMLElement>('[data-alchemy-job-card-host="true"]');
/** topbar：定义该变量以承载业务值。 */
    const topbar = body.querySelector<HTMLElement>('[data-alchemy-topbar="true"]');
/** tabHost：定义该变量以承载业务值。 */
    const tabHost = body.querySelector<HTMLElement>('[data-alchemy-tab-host="true"]');
/** categoryTabs：定义该变量以承载业务值。 */
    const categoryTabs = body.querySelector<HTMLElement>('[data-alchemy-category-tabs="true"]');
/** recipeList：定义该变量以承载业务值。 */
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
/** detailPanel：定义该变量以承载业务值。 */
    const detailPanel = body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]');
/** legacySidebarTabs：定义该变量以承载业务值。 */
    const legacySidebarTabs = body.querySelector('.alchemy-recipe-sidebar .alchemy-category-tabs');
    if (!jobHost || !topbar || !tabHost || !categoryTabs || !recipeList || !detailPanel || legacySidebarTabs) {
      body.innerHTML = this.renderBody();
      bindInlineItemTooltips(body);
      this.bindEvents(body);
      if (scrollState) {
        this.restoreScrollState(scrollState, options);
      }
      this.refreshJobCountdown();
      return true;
    }
    this.patchJobCard(jobHost);
    this.patchTopbar(topbar);
    this.patchTabButtons(tabHost);
    this.patchCategoryButtons(categoryTabs);
    this.patchRecipeList(recipeList);
    this.patchDetailPanel(detailPanel, selectedRecipe);
    bindInlineItemTooltips(body);
    if (scrollState) {
      this.restoreScrollState(scrollState, options);
    }
    this.refreshJobCountdown();
    return true;
  }

/** patchModalChrome：执行对应的业务逻辑。 */
  private patchModalChrome(): void {
/** titleNode：定义该变量以承载业务值。 */
    const titleNode = document.getElementById('detail-modal-title');
/** subtitleNode：定义该变量以承载业务值。 */
    const subtitleNode = document.getElementById('detail-modal-subtitle');
/** hintNode：定义该变量以承载业务值。 */
    const hintNode = document.getElementById('detail-modal-hint');
    if (titleNode) {
      titleNode.textContent = '炉中炼丹';
      titleNode.setAttribute('data-alchemy-level', `LV ${this.getAlchemySkillLevel()}`);
    }
/** subtitle：定义该变量以承载业务值。 */
    const subtitle = this.getAlchemyHeaderSubtitle();
    if (subtitleNode) {
      subtitleNode.textContent = subtitle;
      subtitleNode.classList.toggle('hidden', !subtitle);
    }
    if (hintNode) {
      hintNode.textContent = '';
    }
  }

/** getAlchemyHeaderSubtitle：执行对应的业务逻辑。 */
  private getAlchemyHeaderSubtitle(): string {
/** job：定义该变量以承载业务值。 */
    const job = this.panelState?.job;
    if (job) {
/** recipe：定义该变量以承载业务值。 */
      const recipe = this.catalogByRecipeId.get(job.recipeId);
/** recipeName：定义该变量以承载业务值。 */
      const recipeName = recipe?.outputName ?? job.outputItemId;
      return `当前任务：${recipeName} · ${this.getAlchemyJobProgressLabel(job)} ${this.getAlchemyJobProgressText(job)}`;
    }
    if (this.panelState?.furnaceItemId) {
      return `当前任务：空闲 · 丹炉 ${this.equipment.weapon?.name ?? this.panelState.furnaceItemId}`;
    }
    return '当前任务：空闲';
  }

/** patchTopbar：执行对应的业务逻辑。 */
  private patchTopbar(topbar: HTMLElement): void {
/** levelNode：定义该变量以承载业务值。 */
    const levelNode = topbar.querySelector<HTMLElement>('[data-alchemy-skill-level="true"]');
    if (levelNode) {
      levelNode.textContent = `LV ${this.getAlchemySkillLevel()}`;
    } else {
      topbar.innerHTML = this.renderTopbarContent();
    }
  }

/** patchJobCard：执行对应的业务逻辑。 */
  private patchJobCard(jobHost: HTMLElement): void {
/** renderKey：定义该变量以承载业务值。 */
    const renderKey = this.getJobRenderKey();
    if (jobHost.dataset.jobKey !== renderKey) {
      jobHost.dataset.jobKey = renderKey;
      jobHost.innerHTML = this.renderJobCard();
      return;
    }
/** job：定义该变量以承载业务值。 */
    const job = this.panelState?.job;
/** remainingNode：定义该变量以承载业务值。 */
    const remainingNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-remaining="true"]');
    if (remainingNode && job) {
      remainingNode.textContent = String(this.localJobRemainingTicks ?? job.remainingTicks);
    }
/** phaseNode：定义该变量以承载业务值。 */
    const phaseNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-phase-chip="true"]');
    if (phaseNode && job) {
/** currentPhase：定义该变量以承载业务值。 */
      const currentPhase = this.getDisplayedJobPhase(job);
      phaseNode.textContent = this.getAlchemyJobPhaseLabel(job);
      phaseNode.classList.toggle('is-preparing', currentPhase === 'preparing');
      phaseNode.classList.toggle('is-brewing', currentPhase === 'brewing');
      phaseNode.classList.toggle('is-paused', currentPhase === 'paused');
    }
/** stageNode：定义该变量以承载业务值。 */
    const stageNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-stage-note="true"]');
    if (stageNode && job) {
      stageNode.textContent = this.getAlchemyJobStageNote(job);
    }
/** progressLabelNode：定义该变量以承载业务值。 */
    const progressLabelNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-progress-label="true"]');
    if (progressLabelNode && job) {
      progressLabelNode.textContent = this.getAlchemyJobProgressLabel(job);
    }
/** progressValueNode：定义该变量以承载业务值。 */
    const progressValueNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-progress-value="true"]');
    if (progressValueNode && job) {
      progressValueNode.textContent = this.getAlchemyJobProgressText(job);
    }
/** progressFillNode：定义该变量以承载业务值。 */
    const progressFillNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-progress-fill="true"]');
    if (progressFillNode && job) {
      progressFillNode.style.width = `${this.getAlchemyJobProgressPercent(job).toFixed(2)}%`;
    }
/** successNode：定义该变量以承载业务值。 */
    const successNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-success="true"]');
    if (successNode && job) {
      successNode.textContent = `成丹 ${job.successCount}`;
    }
/** failureNode：定义该变量以承载业务值。 */
    const failureNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-failure="true"]');
    if (failureNode && job) {
      failureNode.textContent = `散尽 ${job.failureCount}`;
    }
/** spiritStoneNode：定义该变量以承载业务值。 */
    const spiritStoneNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-spirit-stone="true"]');
    if (spiritStoneNode && job) {
      spiritStoneNode.textContent = `灵石 ${job.spiritStoneCost}`;
    }
  }

/** patchRecipeList：执行对应的业务逻辑。 */
  private patchRecipeList(recipeList: HTMLElement): void {
/** visibleCatalog：定义该变量以承载业务值。 */
    const visibleCatalog = this.getVisibleCatalog();
/** rows：定义该变量以承载业务值。 */
    const rows = Array.from(recipeList.querySelectorAll<HTMLElement>('.alchemy-recipe-item[data-recipe-id]'));
/** shouldRebuild：定义该变量以承载业务值。 */
    const shouldRebuild = rows.length !== visibleCatalog.length
      || rows.some((row, index) => row.dataset.recipeId !== visibleCatalog[index]?.recipeId);
    if (shouldRebuild) {
      recipeList.innerHTML = this.renderRecipeList();
      return;
    }
    visibleCatalog.forEach((recipe, index) => {
/** row：定义该变量以承载业务值。 */
      const row = rows[index];
      if (!row) {
        return;
      }
      row.classList.toggle('active', recipe.recipeId === this.selectedRecipeId);
/** metaNode：定义该变量以承载业务值。 */
      const metaNode = row.querySelector<HTMLElement>('[data-alchemy-recipe-meta="true"]');
      if (metaNode) {
        metaNode.textContent = this.buildRecipeMetaText(recipe);
      }
    });
  }

/** patchTabButtons：执行对应的业务逻辑。 */
  private patchTabButtons(host: HTMLElement): void {
    host.querySelectorAll<HTMLElement>('.alchemy-tab-btn[data-action="switch-tab"][data-tab]').forEach((node) => {
/** tab：定义该变量以承载业务值。 */
      const tab = node.dataset.tab === 'full' ? 'full' : 'simple';
      node.classList.toggle('active', tab === this.activeTab);
    });
  }

/** patchCategoryButtons：执行对应的业务逻辑。 */
  private patchCategoryButtons(host: HTMLElement): void {
    host.querySelectorAll<HTMLElement>('.alchemy-category-btn[data-action="switch-category"][data-category]').forEach((node) => {
/** category：定义该变量以承载业务值。 */
      const category = node.dataset.category === 'buff' ? 'buff' : 'recovery';
      node.classList.toggle('active', category === this.activeCategory);
/** countNode：定义该变量以承载业务值。 */
      const countNode = node.querySelector<HTMLElement>('.alchemy-category-count');
      if (countNode) {
        countNode.textContent = String(this.getCatalogByCategory(category).length);
      }
    });
  }

/** getSelectedRecipe：执行对应的业务逻辑。 */
  private getSelectedRecipe(): AlchemyRecipeCatalogEntry | null {
    return this.selectedRecipeId ? (this.catalogByRecipeId.get(this.selectedRecipeId) ?? null) : null;
  }

/** resolveRecipeCategory：执行对应的业务逻辑。 */
  private resolveRecipeCategory(recipe: AlchemyRecipeCatalogEntry): AlchemyRecipeCategory {
    return recipe.category;
  }

/** getCatalogByCategory：执行对应的业务逻辑。 */
  private getCatalogByCategory(category: AlchemyRecipeCategory): AlchemyRecipeCatalogEntry[] {
    return this.catalog.filter((recipe) => this.resolveRecipeCategory(recipe) === category);
  }

/** getVisibleCatalog：执行对应的业务逻辑。 */
  private getVisibleCatalog(): AlchemyRecipeCatalogEntry[] {
    return this.getCatalogByCategory(this.activeCategory);
  }

/** resolvePreferredOpenCategory：执行对应的业务逻辑。 */
  private resolvePreferredOpenCategory(): AlchemyRecipeCategory {
/** preferredRecipeId：定义该变量以承载业务值。 */
    const preferredRecipeId = this.panelState?.job?.recipeId
      ?? this.selectedRecipeId
      ?? this.panelState?.presets[0]?.recipeId
      ?? null;
    if (preferredRecipeId) {
/** recipe：定义该变量以承载业务值。 */
      const recipe = this.catalogByRecipeId.get(preferredRecipeId);
      if (recipe) {
        return this.resolveRecipeCategory(recipe);
      }
    }
    return 'recovery';
  }

/** renderBody：执行对应的业务逻辑。 */
  private renderBody(): string {
    if (this.loading && !this.panelState && this.catalog.length === 0) {
      return '<div class="empty-hint">丹方与炉中状态同步中……</div>';
    }
    if (!this.panelState && this.responseError) {
      return `<div class="empty-hint">${escapeHtml(this.responseError)}</div>`;
    }
    if (this.catalog.length === 0) {
      return '<div class="empty-hint">当前还没有可用的炼丹目录。</div>';
    }
/** selectedRecipe：定义该变量以承载业务值。 */
    const selectedRecipe = this.getSelectedRecipe();
    if (!selectedRecipe) {
      return '<div class="empty-hint">当前分类下还没有可用的丹方。</div>';
    }
    return `
      <div class="alchemy-modal-shell" data-alchemy-shell="true">
        <div data-alchemy-job-card-host="true">${this.renderJobCard()}</div>
        <div class="alchemy-topbar" data-alchemy-topbar="true">
          ${this.renderTopbarContent()}
        </div>
        <div class="alchemy-control-row" data-alchemy-control-row="true">
          <div class="alchemy-control-group">
            <span class="alchemy-control-label">丹药类型</span>
            <div class="alchemy-category-tabs" data-alchemy-category-tabs="true">
              ${this.renderCategoryTabs()}
            </div>
          </div>
          <div class="alchemy-control-group alchemy-control-group--tabs">
            <span class="alchemy-control-label">丹方类型</span>
            <div class="alchemy-modal-tabs" data-alchemy-tab-host="true">
              <button class="alchemy-tab-btn ${this.activeTab === 'full' ? 'active' : ''}" type="button" data-action="switch-tab" data-tab="full">完整丹方</button>
              <button class="alchemy-tab-btn ${this.activeTab === 'simple' ? 'active' : ''}" type="button" data-action="switch-tab" data-tab="simple">简易丹方</button>
            </div>
          </div>
        </div>
        <div class="alchemy-layout">
          <aside class="alchemy-recipe-sidebar">
            <div class="alchemy-recipe-list" data-alchemy-recipe-list="true">
              ${this.renderRecipeList()}
            </div>
          </aside>
          <section
            class="alchemy-detail-panel"
            data-alchemy-detail-panel="true"
            data-recipe-id="${escapeHtml(selectedRecipe.recipeId)}"
            data-tab="${this.activeTab}">
            ${this.activeTab === 'full' ? this.renderFullTab(selectedRecipe) : this.renderSimpleTab(selectedRecipe)}
          </section>
        </div>
      </div>
    `;
  }

/** renderTopbarContent：执行对应的业务逻辑。 */
  private renderTopbarContent(): string {
    return `
      <div class="alchemy-topbar-main">
        <span class="alchemy-topbar-label">炼丹等级</span>
        <strong class="alchemy-topbar-value" data-alchemy-skill-level="true">LV ${escapeHtml(String(this.getAlchemySkillLevel()))}</strong>
      </div>
      <div class="alchemy-topbar-note">悬浮或点按药名可查看效果与来源</div>
    `;
  }

/** renderJobCard：执行对应的业务逻辑。 */
  private renderJobCard(): string {
/** job：定义该变量以承载业务值。 */
    const job = this.panelState?.job;
    if (!job) {
      return '<section class="alchemy-job-card empty" data-alchemy-job-card="true"><div class="alchemy-job-title">当前炉火</div><div class="alchemy-job-text">当前没有进行中的炼丹任务。</div></section>';
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(job.recipeId);
/** ingredientsHtml：定义该变量以承载业务值。 */
    const ingredientsHtml = job.ingredients
      .map((ingredient) => {
/** ingredientMeta：定义该变量以承载业务值。 */
        const ingredientMeta = recipe?.ingredients.find((entry) => entry.itemId === ingredient.itemId);
        return this.renderItemReference(
          ingredient.itemId,
          ingredientMeta?.name ?? ingredient.itemId,
          'material',
          ingredient.count,
        );
      })
      .join('');
/** remainingTicks：定义该变量以承载业务值。 */
    const remainingTicks = this.localJobRemainingTicks ?? job.remainingTicks;
/** currentPhase：定义该变量以承载业务值。 */
    const currentPhase = this.getDisplayedJobPhase(job);
/** phaseChipClass：定义该变量以承载业务值。 */
    const phaseChipClass = currentPhase === 'preparing'
      ? 'is-preparing'
      : currentPhase === 'paused'
        ? 'is-paused'
        : 'is-brewing';
/** progressText：定义该变量以承载业务值。 */
    const progressText = this.getAlchemyJobProgressText(job);
/** progressPercent：定义该变量以承载业务值。 */
    const progressPercent = this.getAlchemyJobProgressPercent(job);
    return `
      <section class="alchemy-job-card" data-alchemy-job-card="true">
        <div class="alchemy-job-head">
          <div>
            <div class="alchemy-job-title">当前炉火</div>
            <div class="alchemy-job-name">${this.renderItemReference(job.outputItemId, recipe?.outputName ?? job.outputItemId, 'reward')}</div>
          </div>
          <div class="alchemy-job-metrics">
            <span class="alchemy-metric-chip alchemy-job-phase-chip ${phaseChipClass}" data-alchemy-job-phase-chip="true">${escapeHtml(this.getAlchemyJobPhaseLabel(job))}</span>
            <span class="alchemy-metric-chip">数量 ${escapeHtml(String(job.quantity))} 炉</span>
            <span class="alchemy-metric-chip">一炉 ${escapeHtml(String(job.outputCount))} 枚</span>
            <span class="alchemy-metric-chip" data-alchemy-job-spirit-stone="true">灵石 ${escapeHtml(String(job.spiritStoneCost))}</span>
            <span class="alchemy-metric-chip" data-alchemy-job-success="true">成丹 ${escapeHtml(String(job.successCount))}</span>
            <span class="alchemy-metric-chip" data-alchemy-job-failure="true">散尽 ${escapeHtml(String(job.failureCount))}</span>
            <span class="alchemy-metric-chip">单枚成丹率 ${escapeHtml(formatPercent(job.successRate))}</span>
            <span class="alchemy-metric-chip">${job.exactRecipe ? '完整丹方' : '简易丹方'}</span>
          </div>
        </div>
        <div class="alchemy-job-progress">
          <div class="alchemy-job-progress-head">
            <span data-alchemy-job-progress-label="true">${escapeHtml(this.getAlchemyJobProgressLabel(job))}</span>
            <strong data-alchemy-job-progress-value="true">${escapeHtml(progressText)}</strong>
          </div>
          <div class="alchemy-job-progress-bar">
            <div class="alchemy-job-progress-fill" data-alchemy-job-progress-fill="true" style="width: ${progressPercent.toFixed(2)}%"></div>
          </div>
        </div>
        <div class="alchemy-job-meta">
          <span>剩余 <strong data-alchemy-job-remaining="true">${escapeHtml(String(remainingTicks))}</strong> / ${escapeHtml(String(job.totalTicks))} 息</span>
          <span class="alchemy-job-stage-note" data-alchemy-job-stage-note="true">${escapeHtml(this.getAlchemyJobStageNote(job))}</span>
          ${ingredientsHtml
            ? `<div class="alchemy-job-ingredient-flow">${ingredientsHtml}</div>`
            : '<span>本次未记录投料</span>'}
        </div>
        <div class="alchemy-actions alchemy-actions--job">
          <button class="small-btn ghost" type="button" data-action="cancel-job">取消炼制</button>
        </div>
      </section>
    `;
  }

/** renderRecipeListItem：执行对应的业务逻辑。 */
  private renderRecipeListItem(recipe: AlchemyRecipeCatalogEntry, active: boolean): string {
    return `
      <button
        class="alchemy-recipe-item ${active ? 'active' : ''}"
        type="button"
        data-action="select-recipe"
        data-recipe-id="${escapeHtml(recipe.recipeId)}">
        <span class="alchemy-recipe-head">
          <span class="alchemy-recipe-name">${this.renderItemReference(recipe.outputItemId, recipe.outputName, 'reward')}</span>
          <span class="alchemy-level-badge">LV ${escapeHtml(String(recipe.outputLevel))}</span>
        </span>
        <span class="alchemy-recipe-meta" data-alchemy-recipe-meta="true">${escapeHtml(this.buildRecipeMetaText(recipe))}</span>
      </button>
    `;
  }

/** renderCategoryTabs：执行对应的业务逻辑。 */
  private renderCategoryTabs(): string {
/** tabs：定义该变量以承载业务值。 */
    const tabs: Array<{ category: AlchemyRecipeCategory; label: string }> = [
      { category: 'recovery', label: '回复' },
      { category: 'buff', label: '增益' },
    ];
    return tabs.map((tab) => `
      <button
        class="alchemy-category-btn ${tab.category === this.activeCategory ? 'active' : ''}"
        type="button"
        data-action="switch-category"
        data-category="${tab.category}">
        ${escapeHtml(tab.label)}
        <span class="alchemy-category-count">${escapeHtml(String(this.getCatalogByCategory(tab.category).length))}</span>
      </button>
    `).join('');
  }

/** renderRecipeList：执行对应的业务逻辑。 */
  private renderRecipeList(): string {
/** visibleCatalog：定义该变量以承载业务值。 */
    const visibleCatalog = this.getVisibleCatalog();
    if (visibleCatalog.length === 0) {
      return '<div class="alchemy-recipe-list-empty">当前分类下还没有可炼制的丹方。</div>';
    }
    return visibleCatalog
      .map((recipe) => this.renderRecipeListItem(recipe, recipe.recipeId === this.selectedRecipeId))
      .join('');
  }

/** renderFullTab：执行对应的业务逻辑。 */
  private renderFullTab(recipe: AlchemyRecipeCatalogEntry): string {
/** metrics：定义该变量以承载业务值。 */
    const metrics = this.buildMetricSnapshot(recipe, 'full');
/** fullIngredients：定义该变量以承载业务值。 */
    const fullIngredients = this.getFullRecipeIngredients(recipe.recipeId);
    return `
      <div class="alchemy-tab-stack">
        ${this.renderSummaryCard(recipe, 'full', metrics)}
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => {
/** ownedCount：定义该变量以承载业务值。 */
            const ownedCount = this.getInventoryCount(ingredient.itemId);
            return `
              <div class="alchemy-ingredient-row" data-alchemy-ingredient-item-id="${escapeHtml(ingredient.itemId)}">
                <div class="alchemy-ingredient-main">
                  <span class="alchemy-ingredient-role ${ingredient.role === 'main' ? 'main' : 'aux'}">${ingredient.role === 'main' ? '主药' : '辅药'}</span>
                  <span class="alchemy-ingredient-name">${this.renderItemReference(ingredient.itemId, ingredient.name, 'material')}</span>
                  <span class="alchemy-ingredient-owned" data-alchemy-owned="true">持有 ${escapeHtml(String(ownedCount))}</span>
                </div>
                <div class="alchemy-ingredient-meta">
                  <span>数量 ${escapeHtml(String(ingredient.count))}</span>
                  <span>单份药力 ${escapeHtml(String(ingredient.powerPerUnit))}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${this.renderActionSection(recipe, 'full', fullIngredients)}
      </div>
    `;
  }

/** renderSimpleTab：执行对应的业务逻辑。 */
  private renderSimpleTab(recipe: AlchemyRecipeCatalogEntry): string {
/** draftIngredients：定义该变量以承载业务值。 */
    const draftIngredients = this.getDraftIngredients(recipe.recipeId);
/** exactRecipe：定义该变量以承载业务值。 */
    const exactRecipe = isExactAlchemyRecipe(recipe, draftIngredients);
/** metrics：定义该变量以承载业务值。 */
    const metrics = this.buildMetricSnapshot(recipe, 'simple');
/** recipePresets：定义该变量以承载业务值。 */
    const recipePresets = this.getRecipePresets(recipe.recipeId);
/** selectedPreset：定义该变量以承载业务值。 */
    const selectedPreset = this.selectedPresetId
      ? recipePresets.find((preset) => preset.presetId === this.selectedPresetId) ?? null
      : null;

    return `
      <div class="alchemy-tab-stack">
        ${this.renderSummaryCard(recipe, 'simple', metrics)}
        <div class="alchemy-preset-strip" data-alchemy-preset-strip="true">
          ${recipePresets.length > 0
            ? recipePresets.map((preset) => `
              <button
                class="alchemy-preset-chip ${this.selectedPresetId === preset.presetId ? 'active' : ''}"
                type="button"
                data-action="select-preset"
                data-preset-id="${escapeHtml(preset.presetId)}">
                ${escapeHtml(preset.name)}
              </button>
            `).join('')
            : '<span class="alchemy-preset-empty">当前丹药还没有本地简易丹方。</span>'}
        </div>
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => {
/** currentCount：定义该变量以承载业务值。 */
            const currentCount = draftIngredients.find((entry) => entry.itemId === ingredient.itemId)?.count ?? 0;
/** ownedCount：定义该变量以承载业务值。 */
            const ownedCount = this.getInventoryCount(ingredient.itemId);
            return `
              <div class="alchemy-ingredient-row" data-alchemy-ingredient-item-id="${escapeHtml(ingredient.itemId)}">
                <div class="alchemy-ingredient-main">
                  <span class="alchemy-ingredient-role ${ingredient.role === 'main' ? 'main' : 'aux'}">${ingredient.role === 'main' ? '主药' : '辅药'}</span>
                  <span class="alchemy-ingredient-name">${this.renderItemReference(ingredient.itemId, ingredient.name, 'material')}</span>
                  <span class="alchemy-ingredient-owned" data-alchemy-owned="true">持有 ${escapeHtml(String(ownedCount))}</span>
                </div>
                <div class="alchemy-ingredient-editor">
                  ${ingredient.role === 'main'
                    ? `<span class="alchemy-ingredient-lock">固定 ${escapeHtml(String(ingredient.count))}</span>`
                    : `
                      <button class="small-btn ghost" type="button" data-action="decrease-aux" data-item-id="${escapeHtml(ingredient.itemId)}">-</button>
                      <span class="alchemy-ingredient-count" data-alchemy-current-count="true">${escapeHtml(String(currentCount))} / ${escapeHtml(String(ingredient.count))}</span>
                      <button class="small-btn ghost" type="button" data-action="increase-aux" data-item-id="${escapeHtml(ingredient.itemId)}">+</button>
                    `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${this.renderActionSection(recipe, 'simple', draftIngredients, {
          selectedPresetId: selectedPreset?.presetId,
          exactRecipe,
          hasSelectedPreset: Boolean(selectedPreset),
        })}
      </div>
    `;
  }

  private renderActionSection(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    ingredients: readonly AlchemyIngredientSelection[],
    options?: {
      selectedPresetId?: string;
      exactRecipe?: boolean;
      hasSelectedPreset?: boolean;
    },
  ): string {
/** maxQuantity：定义该变量以承载业务值。 */
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
/** spiritStoneCost：定义该变量以承载业务值。 */
    const spiritStoneCost = this.getAlchemySpiritStoneCost(recipe, 1);
/** batchBrewTicks：定义该变量以承载业务值。 */
    const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      this.getAlchemySkillLevel(),
      this.getFurnaceBonuses().speedRate,
      this.getBatchOutputSize(recipe),
    );
/** startDisabled：定义该变量以承载业务值。 */
    const startDisabled = maxQuantity <= 0 ? 'disabled' : '';
/** buttonsHtml：定义该变量以承载业务值。 */
    const buttonsHtml = mode === 'full'
      ? `
        <button class="small-btn" type="button" data-action="start-full" ${startDisabled}>按完整丹方炼制</button>
        <button class="small-btn ghost" type="button" data-action="switch-tab" data-tab="simple">去简易丹方调整</button>
      `
      : `
        <button class="small-btn" type="button" data-action="start-draft" ${startDisabled}>开始炼制</button>
        <button class="small-btn ghost" type="button" data-action="save-preset">${options?.hasSelectedPreset ? '覆盖当前简方' : '保存简方'}</button>
        <button class="small-btn ghost" type="button" data-action="reset-draft">重置投料</button>
        ${options?.selectedPresetId ? `<button class="small-btn danger" type="button" data-action="delete-preset" data-preset-id="${escapeHtml(options.selectedPresetId)}">删除已选</button>` : ''}
      `;
/** availabilityNote：定义该变量以承载业务值。 */
    const availabilityNote = maxQuantity > 0
      ? `点击炼制后选择数量，当前最多可炼 ${maxQuantity} 炉；每炉固定 ${this.getBatchOutputCount(recipe)} 枚，起炉 ${ALCHEMY_PREPARATION_TICKS} 息后自动开炼。`
      : '材料或灵石不足，当前无法开炉。';
    return `
      <div class="alchemy-actions" data-alchemy-actions="true" data-tab-mode="${mode}">
        <div class="alchemy-action-buttons">
          ${buttonsHtml}
        </div>
        <div class="alchemy-action-note" data-alchemy-action-note="true">${escapeHtml(availabilityNote)}</div>
        ${options?.exactRecipe ? '<span class="alchemy-inline-note">当前投料已等同完整丹方。</span>' : ''}
        <span class="alchemy-inline-note">单炉固定 ${escapeHtml(String(this.getBatchOutputCount(recipe)))} 枚，每枚独立判定；单炉需灵石 ${escapeHtml(String(spiritStoneCost))} 枚，单炉耗时 ${escapeHtml(String(batchBrewTicks))} 息。</span>
      </div>
    `;
  }

  private renderSummaryCard(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    metrics: AlchemyMetricSnapshot,
  ): string {
    return `
      <div class="alchemy-summary-card" data-alchemy-summary-card="true">
        <div class="alchemy-summary-head">
          <div class="alchemy-summary-title">${this.renderItemReference(recipe.outputItemId, recipe.outputName, 'reward')}</div>
          <span class="alchemy-summary-mode">${mode === 'full' ? '完整丹方' : '简易丹方'}</span>
        </div>
        <div class="alchemy-summary-metrics">
          ${this.renderMetricCard('power', '药力百分比', metrics.powerText)}
          ${this.renderMetricCard('success', '单枚成丹率', metrics.successText)}
          ${this.renderMetricCard('time', '单炉时间', metrics.brewTimeText)}
        </div>
      </div>
    `;
  }

/** renderMetricCard：执行对应的业务逻辑。 */
  private renderMetricCard(kind: 'power' | 'success' | 'time', label: string, value: string): string {
    return `
      <div class="alchemy-summary-metric alchemy-summary-metric--${kind}">
        <span class="alchemy-summary-metric-label">${escapeHtml(label)}</span>
        <strong class="alchemy-summary-metric-value" data-alchemy-metric="${kind}">${escapeHtml(value)}</strong>
      </div>
    `;
  }

/** buildMetricSnapshot：执行对应的业务逻辑。 */
  private buildMetricSnapshot(recipe: AlchemyRecipeCatalogEntry, mode: AlchemyTab): AlchemyMetricSnapshot {
/** ingredients：定义该变量以承载业务值。 */
    const ingredients = mode === 'full' ? this.getFullRecipeIngredients(recipe.recipeId) : this.getDraftIngredients(recipe.recipeId);
/** powerRatio：定义该变量以承载业务值。 */
    const powerRatio = mode === 'full' ? 1 : computeAlchemyPowerRatio(recipe, ingredients);
/** baseSuccessRate：定义该变量以承载业务值。 */
    const baseSuccessRate = mode === 'full' ? 1 : computeAlchemySuccessRate(recipe, ingredients);
/** alchemyLevel：定义该变量以承载业务值。 */
    const alchemyLevel = this.getAlchemySkillLevel();
/** furnaceBonuses：定义该变量以承载业务值。 */
    const furnaceBonuses = this.getFurnaceBonuses();
/** successRate：定义该变量以承载业务值。 */
    const successRate = computeAlchemyAdjustedSuccessRate(
      baseSuccessRate,
      recipe.outputLevel,
      alchemyLevel,
      furnaceBonuses.successRate,
    );
/** brewTicks：定义该变量以承载业务值。 */
    const brewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      alchemyLevel,
      furnaceBonuses.speedRate,
      this.getBatchOutputSize(recipe),
    );
    return {
      powerText: formatPercent(powerRatio),
      successText: formatPercent(successRate),
      brewTimeText: `${brewTicks} 息`,
    };
  }

/** patchDetailPanel：执行对应的业务逻辑。 */
  private patchDetailPanel(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
/** shouldRebuild：定义该变量以承载业务值。 */
    const shouldRebuild = detailPanel.dataset.recipeId !== recipe.recipeId
      || detailPanel.dataset.tab !== this.activeTab
      || !detailPanel.querySelector('[data-alchemy-summary-card="true"]');
    if (shouldRebuild) {
      detailPanel.dataset.recipeId = recipe.recipeId;
      detailPanel.dataset.tab = this.activeTab;
      detailPanel.innerHTML = this.activeTab === 'full' ? this.renderFullTab(recipe) : this.renderSimpleTab(recipe);
      return;
    }

    this.patchSummaryCard(detailPanel, recipe, this.activeTab);
    if (this.activeTab === 'full') {
      this.patchFullIngredients(detailPanel, recipe);
      this.patchActionSection(detailPanel, recipe, 'full');
      return;
    }
    this.patchSimpleIngredients(detailPanel, recipe);
    this.patchPresetStrip(detailPanel, recipe);
    this.patchActionSection(detailPanel, recipe, 'simple');
  }

/** patchSummaryCard：执行对应的业务逻辑。 */
  private patchSummaryCard(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry, mode: AlchemyTab): void {
/** metrics：定义该变量以承载业务值。 */
    const metrics = this.buildMetricSnapshot(recipe, mode);
/** metricKinds：定义该变量以承载业务值。 */
    const metricKinds: Array<keyof AlchemyMetricSnapshot> = ['powerText', 'successText', 'brewTimeText'];
/** metricSelectors：定义该变量以承载业务值。 */
    const metricSelectors = ['power', 'success', 'time'] as const;
    metricSelectors.forEach((metric, index) => {
/** node：定义该变量以承载业务值。 */
      const node = detailPanel.querySelector<HTMLElement>(`[data-alchemy-metric="${metric}"]`);
      if (node) {
        node.textContent = metrics[metricKinds[index]];
      }
    });
  }

/** patchFullIngredients：执行对应的业务逻辑。 */
  private patchFullIngredients(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
    recipe.ingredients.forEach((ingredient) => {
/** row：定义该变量以承载业务值。 */
      const row = detailPanel.querySelector<HTMLElement>(`[data-alchemy-ingredient-item-id="${CSS.escape(ingredient.itemId)}"]`);
/** ownedNode：定义该变量以承载业务值。 */
      const ownedNode = row?.querySelector<HTMLElement>('[data-alchemy-owned="true"]');
      if (ownedNode) {
        ownedNode.textContent = `持有 ${this.getInventoryCount(ingredient.itemId)}`;
      }
    });
  }

/** patchSimpleIngredients：执行对应的业务逻辑。 */
  private patchSimpleIngredients(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
/** draftIngredients：定义该变量以承载业务值。 */
    const draftIngredients = this.getDraftIngredients(recipe.recipeId);
    recipe.ingredients.forEach((ingredient) => {
/** row：定义该变量以承载业务值。 */
      const row = detailPanel.querySelector<HTMLElement>(`[data-alchemy-ingredient-item-id="${CSS.escape(ingredient.itemId)}"]`);
      if (!row) {
        return;
      }
/** ownedNode：定义该变量以承载业务值。 */
      const ownedNode = row.querySelector<HTMLElement>('[data-alchemy-owned="true"]');
      if (ownedNode) {
        ownedNode.textContent = `持有 ${this.getInventoryCount(ingredient.itemId)}`;
      }
/** currentCountNode：定义该变量以承载业务值。 */
      const currentCountNode = row.querySelector<HTMLElement>('[data-alchemy-current-count="true"]');
      if (currentCountNode) {
/** currentCount：定义该变量以承载业务值。 */
        const currentCount = draftIngredients.find((entry) => entry.itemId === ingredient.itemId)?.count ?? 0;
        currentCountNode.textContent = `${currentCount} / ${ingredient.count}`;
      }
    });
  }

/** patchPresetStrip：执行对应的业务逻辑。 */
  private patchPresetStrip(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
/** presetStrip：定义该变量以承载业务值。 */
    const presetStrip = detailPanel.querySelector<HTMLElement>('[data-alchemy-preset-strip="true"]');
    if (!presetStrip) {
      return;
    }
/** recipePresets：定义该变量以承载业务值。 */
    const recipePresets = this.getRecipePresets(recipe.recipeId);
    presetStrip.innerHTML = recipePresets.length > 0
      ? recipePresets.map((preset) => `
          <button
            class="alchemy-preset-chip ${this.selectedPresetId === preset.presetId ? 'active' : ''}"
            type="button"
            data-action="select-preset"
            data-preset-id="${escapeHtml(preset.presetId)}">
            ${escapeHtml(preset.name)}
          </button>
        `).join('')
      : '<span class="alchemy-preset-empty">当前丹药还没有本地简易丹方。</span>';
  }

/** patchActionSection：执行对应的业务逻辑。 */
  private patchActionSection(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry, mode: AlchemyTab): void {
/** actions：定义该变量以承载业务值。 */
    const actions = detailPanel.querySelector<HTMLElement>('[data-alchemy-actions="true"]');
    if (!actions) {
      return;
    }
/** nextHtml：定义该变量以承载业务值。 */
    const nextHtml = mode === 'full'
      ? this.renderActionSection(recipe, 'full', this.getFullRecipeIngredients(recipe.recipeId))
      : (() => {
/** recipePresets：定义该变量以承载业务值。 */
          const recipePresets = this.getRecipePresets(recipe.recipeId);
/** selectedPreset：定义该变量以承载业务值。 */
          const selectedPreset = this.selectedPresetId
            ? recipePresets.find((preset) => preset.presetId === this.selectedPresetId) ?? null
            : null;
          return this.renderActionSection(recipe, 'simple', this.getDraftIngredients(recipe.recipeId), {
            selectedPresetId: selectedPreset?.presetId,
            exactRecipe: isExactAlchemyRecipe(recipe, this.getDraftIngredients(recipe.recipeId)),
            hasSelectedPreset: Boolean(selectedPreset),
          });
        })();
    actions.outerHTML = nextHtml;
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(body: HTMLElement): void {
    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    body.addEventListener('click', (event) => {
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
/** actionNode：定义该变量以承载业务值。 */
      const actionNode = target.closest<HTMLElement>('[data-action]');
      if (!actionNode) {
        return;
      }
/** action：定义该变量以承载业务值。 */
      const action = actionNode.dataset.action;
      if (!action) {
        return;
      }
      if (action === 'switch-tab') {
/** tab：定义该变量以承载业务值。 */
        const tab = actionNode.dataset.tab === 'full' ? 'full' : 'simple';
        this.activeTab = tab;
        this.render({ preserveScroll: true });
        return;
      }
      if (action === 'switch-category') {
/** category：定义该变量以承载业务值。 */
        const category = actionNode.dataset.category === 'buff' ? 'buff' : 'recovery';
        if (category !== this.activeCategory) {
          this.activeCategory = category;
          this.selectedPresetId = null;
          this.ensureSelection();
          this.render({ preserveScroll: true, resetDetailScroll: true, resetRecipeListScroll: true });
        }
        return;
      }
      if (action === 'select-recipe') {
/** recipeId：定义该变量以承载业务值。 */
        const recipeId = actionNode.dataset.recipeId ?? '';
        if (recipeId && recipeId !== this.selectedRecipeId) {
          this.selectedRecipeId = recipeId;
          this.selectedPresetId = null;
          this.ensureSelection();
          this.render({ preserveScroll: true, resetDetailScroll: true });
        }
        return;
      }
      if (action === 'select-preset') {
/** presetId：定义该变量以承载业务值。 */
        const presetId = actionNode.dataset.presetId ?? '';
        if (!presetId || !this.selectedRecipeId) {
          return;
        }
/** preset：定义该变量以承载业务值。 */
        const preset = this.getRecipePresets(this.selectedRecipeId).find((entry) => entry.presetId === presetId);
        if (!preset) {
          return;
        }
        this.selectedPresetId = presetId;
        this.setDraft(this.selectedRecipeId, preset.ingredients);
        this.render({ preserveScroll: true });
        return;
      }
      if (action === 'increase-aux' || action === 'decrease-aux') {
/** itemId：定义该变量以承载业务值。 */
        const itemId = actionNode.dataset.itemId ?? '';
        if (!itemId || !this.selectedRecipeId) {
          return;
        }
        this.adjustAuxCount(this.selectedRecipeId, itemId, action === 'increase-aux' ? 1 : -1);
        this.selectedPresetId = null;
        this.render({ preserveScroll: true });
        return;
      }
      if (action === 'reset-draft') {
        if (!this.selectedRecipeId) {
          return;
        }
        this.selectedPresetId = null;
        this.setDraft(this.selectedRecipeId, this.getFullRecipeIngredients(this.selectedRecipeId));
        this.render({ preserveScroll: true });
        return;
      }
      if (action === 'save-preset') {
        this.handleSavePreset();
        return;
      }
      if (action === 'delete-preset') {
/** presetId：定义该变量以承载业务值。 */
        const presetId = actionNode.dataset.presetId ?? '';
        if (presetId) {
          this.callbacks?.onDeletePreset(presetId);
        }
        return;
      }
      if (action === 'start-full') {
        this.handleStartRequest(this.getFullRecipeIngredients(this.selectedRecipeId ?? ''), 'full');
        return;
      }
      if (action === 'start-draft') {
        this.handleStartRequest(this.getDraftIngredients(this.selectedRecipeId ?? ''), 'simple');
        return;
      }
      if (action === 'cancel-job') {
        this.callbacks?.onCancelAlchemy();
      }
    });
  }

/** handleStartRequest：执行对应的业务逻辑。 */
  private handleStartRequest(ingredients: AlchemyIngredientSelection[], mode: AlchemyTab): void {
    if (!this.selectedRecipeId) {
      return;
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(this.selectedRecipeId);
    if (!recipe) {
      return;
    }
    this.confirmStartRequest = {
      recipeId: this.selectedRecipeId,
      ingredients: cloneIngredients(ingredients),
      mode,
    };
    this.confirmQuantityDraft = String(this.getSelectedQuantity(recipe, ingredients));
    this.syncStartConfirmModal();
  }

/** handleSavePreset：执行对应的业务逻辑。 */
  private handleSavePreset(): void {
    if (!this.selectedRecipeId) {
      return;
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(this.selectedRecipeId);
    if (!recipe) {
      return;
    }
/** matchingPresets：定义该变量以承载业务值。 */
    const matchingPresets = this.getRecipePresets(recipe.recipeId);
/** selectedPreset：定义该变量以承载业务值。 */
    const selectedPreset = this.selectedPresetId
      ? matchingPresets.find((preset) => preset.presetId === this.selectedPresetId) ?? null
      : null;
/** nextName：定义该变量以承载业务值。 */
    const nextName = selectedPreset?.name
      ?? `${recipe.outputName}简方${matchingPresets.length + 1}`;
    this.callbacks?.onSavePreset({
      presetId: selectedPreset?.presetId,
      recipeId: recipe.recipeId,
      name: nextName,
      ingredients: this.getDraftIngredients(recipe.recipeId),
    });
  }

/** getRecipePresets：执行对应的业务逻辑。 */
  private getRecipePresets(recipeId: string): PlayerAlchemyPreset[] {
    return (this.panelState?.presets ?? []).filter((preset) => preset.recipeId === recipeId);
  }

/** getDraftIngredients：执行对应的业务逻辑。 */
  private getDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(recipeId);
    if (!recipe) {
      return [];
    }
/** draft：定义该变量以承载业务值。 */
    const draft = this.draftByRecipeId.get(recipeId);
    if (!draft) {
      return this.getFullRecipeIngredients(recipeId);
    }
/** result：定义该变量以承载业务值。 */
    const result: AlchemyIngredientSelection[] = [];
    for (const ingredient of recipe.ingredients) {
      const count = draft.get(ingredient.itemId) ?? 0;
      if (count > 0) {
        result.push({ itemId: ingredient.itemId, count });
      }
    }
    return result;
  }

/** getFullRecipeIngredients：执行对应的业务逻辑。 */
  private getFullRecipeIngredients(recipeId: string): AlchemyIngredientSelection[] {
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(recipeId);
    if (!recipe) {
      return [];
    }
    return recipe.ingredients.map((ingredient) => ({
      itemId: ingredient.itemId,
      count: ingredient.count,
    }));
  }

/** setDraft：执行对应的业务逻辑。 */
  private setDraft(recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(recipeId);
    if (!recipe) {
      return;
    }
/** next：定义该变量以承载业务值。 */
    const next = new Map<string, number>();
/** source：定义该变量以承载业务值。 */
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

/** adjustAuxCount：执行对应的业务逻辑。 */
  private adjustAuxCount(recipeId: string, itemId: string, delta: number): void {
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.catalogByRecipeId.get(recipeId);
    if (!recipe) {
      return;
    }
/** ingredient：定义该变量以承载业务值。 */
    const ingredient = recipe.ingredients.find((entry) => entry.itemId === itemId && entry.role === 'aux');
    if (!ingredient) {
      return;
    }
/** draft：定义该变量以承载业务值。 */
    const draft = this.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
/** current：定义该变量以承载业务值。 */
    const current = draft.get(itemId) ?? 0;
    draft.set(itemId, Math.max(0, Math.min(ingredient.count, current + delta)));
    this.draftByRecipeId.set(recipeId, draft);
  }

/** getInventoryCount：执行对应的业务逻辑。 */
  private getInventoryCount(itemId: string): number {
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

/** buildRecipeMetaText：执行对应的业务逻辑。 */
  private buildRecipeMetaText(recipe: AlchemyRecipeCatalogEntry): string {
/** simpleCount：定义该变量以承载业务值。 */
    const simpleCount = this.getRecipePresets(recipe.recipeId).length;
    return `一炉 ${this.getBatchOutputCount(recipe)} 枚 · 基时 ${recipe.baseBrewTicks * this.getBatchOutputSize(recipe)} 息 · 简方 ${simpleCount}`;
  }

/** getSpiritStoneOwnedCount：执行对应的业务逻辑。 */
  private getSpiritStoneOwnedCount(): number {
    return this.getInventoryCount(SPIRIT_STONE_ITEM_ID);
  }

/** getAlchemySpiritStoneCost：执行对应的业务逻辑。 */
  private getAlchemySpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, this.resolveRecipeCategory(recipe) === 'buff') * normalizeAlchemyQuantity(quantity);
  }

/** getBatchOutputCount：执行对应的业务逻辑。 */
  private getBatchOutputCount(recipe: AlchemyRecipeCatalogEntry): number {
    return computeAlchemyBatchOutputCountWithSize(recipe.outputCount, this.getBatchOutputSize(recipe));
  }

/** getBatchOutputSize：执行对应的业务逻辑。 */
  private getBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    return this.resolveRecipeCategory(recipe) === 'buff' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
  }

  private getMaxCraftQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
/** ingredientCaps：定义该变量以承载业务值。 */
    const ingredientCaps = ingredients
      .map((ingredient) => {
        if (ingredient.count <= 0) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.floor(this.getInventoryCount(ingredient.itemId) / ingredient.count);
      })
      .filter((cap) => Number.isFinite(cap));
/** spiritStonePerBatch：定义该变量以承载业务值。 */
    const spiritStonePerBatch = this.getAlchemySpiritStoneCost(recipe, 1);
/** spiritStoneCap：定义该变量以承载业务值。 */
    const spiritStoneCap = spiritStonePerBatch > 0
      ? Math.floor(this.getSpiritStoneOwnedCount() / spiritStonePerBatch)
      : Number.POSITIVE_INFINITY;
/** maxQuantity：定义该变量以承载业务值。 */
    const maxQuantity = Math.min(
      spiritStoneCap,
      ...(ingredientCaps.length > 0 ? ingredientCaps : [0]),
    );
    return Math.max(0, Number.isFinite(maxQuantity) ? maxQuantity : 0);
  }

  private getSelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
/** maxQuantity：定义该变量以承载业务值。 */
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
/** current：定义该变量以承载业务值。 */
    const current = normalizeAlchemyQuantity(this.quantityByRecipeId.get(recipe.recipeId));
/** next：定义该变量以承载业务值。 */
    const next = maxQuantity > 0 ? Math.min(current, maxQuantity) : 1;
    this.quantityByRecipeId.set(recipe.recipeId, next);
    return next;
  }

  private setSelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
    next: number,
  ): void {
/** maxQuantity：定义该变量以承载业务值。 */
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
/** normalized：定义该变量以承载业务值。 */
    const normalized = maxQuantity > 0
      ? Math.max(1, Math.min(maxQuantity, normalizeAlchemyQuantity(next)))
      : 1;
    this.quantityByRecipeId.set(recipe.recipeId, normalized);
  }

/** parseConfirmQuantity：执行对应的业务逻辑。 */
  private parseConfirmQuantity(): number | null {
    if (!this.confirmQuantityDraft || !/^\d+$/.test(this.confirmQuantityDraft)) {
      return null;
    }
/** quantity：定义该变量以承载业务值。 */
    const quantity = Number(this.confirmQuantityDraft);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

  private buildConfirmStartState(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): {
/** quantity：定义该变量以承载业务值。 */
    quantity: number | null;
/** maxQuantity：定义该变量以承载业务值。 */
    maxQuantity: number;
/** batchBrewTicks：定义该变量以承载业务值。 */
    batchBrewTicks: number;
/** totalTicks：定义该变量以承载业务值。 */
    totalTicks: number | null;
/** spiritStoneCost：定义该变量以承载业务值。 */
    spiritStoneCost: number | null;
/** errorText：定义该变量以承载业务值。 */
    errorText: string | null;
/** startDisabled：定义该变量以承载业务值。 */
    startDisabled: boolean;
  } {
/** quantity：定义该变量以承载业务值。 */
    const quantity = this.parseConfirmQuantity();
/** maxQuantity：定义该变量以承载业务值。 */
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
/** batchBrewTicks：定义该变量以承载业务值。 */
    const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      this.getAlchemySkillLevel(),
      this.getFurnaceBonuses().speedRate,
      this.getBatchOutputSize(recipe),
    );
/** totalTicks：定义该变量以承载业务值。 */
    const totalTicks = quantity === null
      ? null
      : computeAlchemyTotalJobTicks(batchBrewTicks, quantity, ALCHEMY_PREPARATION_TICKS);
/** spiritStoneCost：定义该变量以承载业务值。 */
    const spiritStoneCost = quantity === null
      ? null
      : this.getAlchemySpiritStoneCost(recipe, quantity);
/** errorText：定义该变量以承载业务值。 */
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

  private renderStartConfirmBody(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    state: {
/** quantity：定义该变量以承载业务值。 */
      quantity: number | null;
/** maxQuantity：定义该变量以承载业务值。 */
      maxQuantity: number;
/** batchBrewTicks：定义该变量以承载业务值。 */
      batchBrewTicks: number;
/** totalTicks：定义该变量以承载业务值。 */
      totalTicks: number | null;
/** spiritStoneCost：定义该变量以承载业务值。 */
      spiritStoneCost: number | null;
/** errorText：定义该变量以承载业务值。 */
      errorText: string | null;
/** startDisabled：定义该变量以承载业务值。 */
      startDisabled: boolean;
    },
  ): string {
/** requestKey：定义该变量以承载业务值。 */
    const requestKey = this.buildConfirmRequestKey(recipe.recipeId, mode, this.confirmStartRequest?.ingredients ?? []);
    return `
      <div class="alchemy-confirm-shell" data-alchemy-confirm-key="${escapeHtml(requestKey)}">
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>丹药</span>
            <div class="market-price-display">
              <strong>${escapeHtml(recipe.outputName)}</strong>
              <span>${mode === 'full' ? '完整丹方' : '简易丹方'} · 一炉 ${this.getBatchOutputCount(recipe)} 枚</span>
            </div>
          </div>
        </div>
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>炼制数量</span>
            <div class="market-quantity-row">
              <button
                class="small-btn ghost"
                data-alchemy-confirm-quick-qty="1"
                type="button">
                1
              </button>
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
                ${state.maxQuantity <= 0 ? 'disabled' : ''}>
                最大
              </button>
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
        <div class="market-action-hint" data-alchemy-confirm-hint="true">当前最多可炼 ${escapeHtml(String(state.maxQuantity))} 炉；每炉固定 ${escapeHtml(String(this.getBatchOutputCount(recipe)))} 枚并按单枚独立判定，确认后会先准备 ${ALCHEMY_PREPARATION_TICKS} 息；移动或出手都会打断炼丹。</div>
        <div class="market-action-hint market-action-hint--error" data-alchemy-confirm-error="true" ${state.errorText ? '' : 'hidden'}>${escapeHtml(state.errorText ?? '')}</div>
      </div>
    `;
  }

/** bindConfirmEvents：执行对应的业务逻辑。 */
  private bindConfirmEvents(): void {
    if (this.confirmEventsBound) {
      return;
    }
    this.confirmEventsBound = true;
    document.addEventListener('click', (event) => {
      if (!confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
        return;
      }
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
/** quickQtyButton：定义该变量以承载业务值。 */
      const quickQtyButton = target.closest<HTMLElement>('[data-alchemy-confirm-quick-qty]');
      if (!quickQtyButton) {
        return;
      }
/** value：定义该变量以承载业务值。 */
      const value = quickQtyButton.dataset.alchemyConfirmQuickQty;
      if (!value) {
        return;
      }
      this.confirmQuantityDraft = value;
/** input：定义该变量以承载业务值。 */
      const input = document.querySelector<HTMLInputElement>('[data-alchemy-confirm-quantity="true"]');
      if (input) {
        input.value = value;
      }
      this.syncStartConfirmState();
    }, true);
    document.addEventListener('input', (event) => {
      if (!confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
        return;
      }
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.alchemyConfirmQuantity !== 'true') {
        return;
      }
/** normalized：定义该变量以承载业务值。 */
      const normalized = target.value.replaceAll(/[^\d]/g, '');
      this.confirmQuantityDraft = normalized;
      if (target.value !== normalized) {
        target.value = normalized;
      }
      this.syncStartConfirmState();
    });
  }

/** syncStartConfirmState：执行对应的业务逻辑。 */
  private syncStartConfirmState(): void {
/** request：定义该变量以承载业务值。 */
    const request = this.confirmStartRequest;
/** recipe：定义该变量以承载业务值。 */
    const recipe = request ? this.catalogByRecipeId.get(request.recipeId) ?? null : null;
    if (!request || !recipe || !confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
      return;
    }
/** state：定义该变量以承载业务值。 */
    const state = this.buildConfirmStartState(recipe, request.ingredients);
/** totalCostNode：定义该变量以承载业务值。 */
    const totalCostNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-total-cost="true"]');
/** totalTicksNode：定义该变量以承载业务值。 */
    const totalTicksNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-total-ticks="true"]');
/** hintNode：定义该变量以承载业务值。 */
    const hintNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-hint="true"]');
/** errorNode：定义该变量以承载业务值。 */
    const errorNode = document.querySelector<HTMLElement>('[data-alchemy-confirm-error="true"]');
/** maxButton：定义该变量以承载业务值。 */
    const maxButton = document.querySelector<HTMLButtonElement>('[data-alchemy-confirm-quick-qty-max="true"]');
/** confirmButton：定义该变量以承载业务值。 */
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
      hintNode.textContent = `当前最多可炼 ${state.maxQuantity} 炉；每炉固定 ${this.getBatchOutputCount(recipe)} 枚并按单枚独立判定，确认后会先准备 ${ALCHEMY_PREPARATION_TICKS} 息；移动或出手都会打断炼丹。`;
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

/** syncStartConfirmModal：执行对应的业务逻辑。 */
  private syncStartConfirmModal(): void {
/** request：定义该变量以承载业务值。 */
    const request = this.confirmStartRequest;
/** recipe：定义该变量以承载业务值。 */
    const recipe = request ? this.catalogByRecipeId.get(request.recipeId) ?? null : null;
    if (!request || !recipe || !detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.confirmStartRequest = null;
      confirmModalHost.close(AlchemyModal.CONFIRM_MODAL_OWNER);
      return;
    }
/** state：定义该变量以承载业务值。 */
    const state = this.buildConfirmStartState(recipe, request.ingredients);
    if (this.patchStartConfirmModal(recipe, request.mode, request.ingredients)) {
      this.syncStartConfirmState();
      return;
    }
    confirmModalHost.open({
      ownerId: AlchemyModal.CONFIRM_MODAL_OWNER,
      title: '选择炼制数量',
/** subtitle：定义该变量以承载业务值。 */
      subtitle: `${recipe.outputName} · ${request.mode === 'full' ? '完整丹方' : '简易丹方'}`,
      bodyHtml: this.renderStartConfirmBody(recipe, request.mode, state),
      confirmLabel: '开始炼制',
      confirmDisabled: state.startDisabled,
      onConfirm: () => {
/** latestRequest：定义该变量以承载业务值。 */
        const latestRequest = this.confirmStartRequest;
/** latestRecipe：定义该变量以承载业务值。 */
        const latestRecipe = latestRequest ? this.catalogByRecipeId.get(latestRequest.recipeId) ?? null : null;
        if (!latestRequest || !latestRecipe) {
          this.confirmStartRequest = null;
          return;
        }
/** latestState：定义该变量以承载业务值。 */
        const latestState = this.buildConfirmStartState(latestRecipe, latestRequest.ingredients);
        if (latestState.startDisabled || latestState.quantity === null) {
          this.syncStartConfirmModal();
          return;
        }
        this.setSelectedQuantity(latestRecipe, latestRequest.ingredients, latestState.quantity);
        this.confirmStartRequest = null;
        this.callbacks?.onStartAlchemy({
          recipeId: latestRequest.recipeId,
          ingredients: latestRequest.ingredients,
          quantity: latestState.quantity,
        });
      },
      onClose: () => {
        this.confirmStartRequest = null;
      },
    });
    this.bindConfirmEvents();
  }

  private patchStartConfirmModal(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    ingredients: readonly AlchemyIngredientSelection[],
  ): boolean {
    if (!confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
      return false;
    }
/** titleNode：定义该变量以承载业务值。 */
    const titleNode = document.querySelector<HTMLElement>('.confirm-modal-title');
/** subtitleNode：定义该变量以承载业务值。 */
    const subtitleNode = document.querySelector<HTMLElement>('.confirm-modal-subtitle');
/** bodyNode：定义该变量以承载业务值。 */
    const bodyNode = document.querySelector<HTMLElement>('.confirm-modal-body');
    if (!titleNode || !subtitleNode || !bodyNode) {
      return false;
    }
/** shell：定义该变量以承载业务值。 */
    const shell = bodyNode.querySelector<HTMLElement>('[data-alchemy-confirm-key]');
/** requestKey：定义该变量以承载业务值。 */
    const requestKey = this.buildConfirmRequestKey(recipe.recipeId, mode, ingredients);
    if (!shell || shell.dataset.alchemyConfirmKey !== requestKey) {
      return false;
    }
    titleNode.textContent = '选择炼制数量';
    subtitleNode.textContent = `${recipe.outputName} · ${mode === 'full' ? '完整丹方' : '简易丹方'}`;
    subtitleNode.classList.toggle('hidden', false);
    return true;
  }

  private buildConfirmRequestKey(
    recipeId: string,
    mode: AlchemyTab,
    ingredients: readonly AlchemyIngredientSelection[],
  ): string {
/** ingredientKey：定义该变量以承载业务值。 */
    const ingredientKey = ingredients
      .map((ingredient) => `${ingredient.itemId}:${ingredient.count}`)
      .join('|');
    return `${recipeId}:${mode}:${ingredientKey}`;
  }

/** getJobRenderKey：执行对应的业务逻辑。 */
  private getJobRenderKey(): string {
/** job：定义该变量以承载业务值。 */
    const job = this.panelState?.job;
    if (!job) {
      return 'empty';
    }
/** ingredientKey：定义该变量以承载业务值。 */
    const ingredientKey = job.ingredients
      .map((ingredient) => `${ingredient.itemId}:${ingredient.count}`)
      .join('|');
    return [
      job.recipeId,
      job.phase,
      job.outputCount,
      job.quantity,
      job.completedCount,
      job.successCount,
      job.failureCount,
      job.currentBatchRemainingTicks,
      job.pausedTicks,
      job.totalTicks,
      job.remainingTicks,
      job.successRate,
      job.exactRecipe ? 1 : 0,
      ingredientKey,
    ].join(':');
  }

/** getAlchemyJobPhaseLabel：执行对应的业务逻辑。 */
  private getAlchemyJobPhaseLabel(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
/** phase：定义该变量以承载业务值。 */
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      return '暂停中';
    }
    return phase === 'preparing' ? '起炉中' : '炼制中';
  }

/** getAlchemyJobStageNote：执行对应的业务逻辑。 */
  private getAlchemyJobStageNote(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
/** remainingTicks：定义该变量以承载业务值。 */
    const remainingTicks = this.localJobRemainingTicks ?? job.remainingTicks;
/** phase：定义该变量以承载业务值。 */
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
/** pausedTicks：定义该变量以承载业务值。 */
      const pausedTicks = this.getDisplayedPausedTicks(job);
      if (this.getAlchemyResumePhase(job, remainingTicks, pausedTicks) === 'preparing') {
        return `${pausedTicks} 息后继续起炉，移动或出手会重新暂停炼丹。`;
      }
      return `${pausedTicks} 息后继续第 ${this.getAlchemyCurrentBatch(job)}/${job.quantity} 炉，移动或出手会重新暂停炼丹。`;
    }
    if (phase === 'preparing') {
/** preparationRemaining：定义该变量以承载业务值。 */
      const preparationRemaining = Math.max(0, remainingTicks - (job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount)));
      return `${preparationRemaining} 息后自动开炼，移动或出手会暂停炼丹 10 息。`;
    }
    return `当前第 ${this.getAlchemyCurrentBatch(job)}/${job.quantity} 炉，移动或出手会暂停炼丹 10 息。`;
  }

/** getDisplayedJobPhase：执行对应的业务逻辑。 */
  private getDisplayedJobPhase(job: NonNullable<SyncedAlchemyPanelState['job']>): 'preparing' | 'brewing' | 'paused' {
    return this.localJobPhase ?? job.phase;
  }

/** getDisplayedBatchRemainingTicks：执行对应的业务逻辑。 */
  private getDisplayedBatchRemainingTicks(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    return this.localBatchRemainingTicks ?? job.currentBatchRemainingTicks;
  }

/** getDisplayedPausedTicks：执行对应的业务逻辑。 */
  private getDisplayedPausedTicks(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    return this.localPausedTicks ?? job.pausedTicks;
  }

/** getAlchemyCurrentBatch：执行对应的业务逻辑。 */
  private getAlchemyCurrentBatch(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    return Math.min(job.quantity, Math.max(1, job.completedCount + 1));
  }

/** getAlchemyJobProgressLabel：执行对应的业务逻辑。 */
  private getAlchemyJobProgressLabel(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
/** phase：定义该变量以承载业务值。 */
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      return '炉火暂歇';
    }
    if (phase === 'preparing') {
      return '起炉准备';
    }
    return `第 ${this.getAlchemyCurrentBatch(job)} / ${job.quantity} 炉`;
  }

/** getAlchemyJobProgressText：执行对应的业务逻辑。 */
  private getAlchemyJobProgressText(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
/** phase：定义该变量以承载业务值。 */
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
/** pausedTotal：定义该变量以承载业务值。 */
      const pausedTotal = Math.max(1, job.pausedTicks || 10);
      return `${this.getDisplayedPausedTicks(job)} / ${pausedTotal} 息`;
    }
    if (phase === 'preparing') {
/** remaining：定义该变量以承载业务值。 */
      const remaining = Math.max(0, (this.localJobRemainingTicks ?? job.remainingTicks) - (job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount)));
      return `${remaining} / ${job.preparationTicks} 息`;
    }
    return `${this.getDisplayedBatchRemainingTicks(job)} / ${job.batchBrewTicks} 息`;
  }

/** getAlchemyJobProgressPercent：执行对应的业务逻辑。 */
  private getAlchemyJobProgressPercent(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
/** phase：定义该变量以承载业务值。 */
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
/** pausedTotal：定义该变量以承载业务值。 */
      const pausedTotal = Math.max(1, job.pausedTicks || 10);
      return Math.max(0, Math.min(100, ((pausedTotal - this.getDisplayedPausedTicks(job)) / pausedTotal) * 100));
    }
    if (phase === 'preparing') {
      if (job.preparationTicks <= 0) {
        return 100;
      }
/** remaining：定义该变量以承载业务值。 */
      const remaining = Math.max(0, (this.localJobRemainingTicks ?? job.remainingTicks) - (job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount)));
      return Math.max(0, Math.min(100, ((job.preparationTicks - remaining) / job.preparationTicks) * 100));
    }
    if (job.batchBrewTicks <= 0) {
      return 100;
    }
    return Math.max(0, Math.min(100, ((job.batchBrewTicks - this.getDisplayedBatchRemainingTicks(job)) / job.batchBrewTicks) * 100));
  }

  private renderItemReference(
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

/** getAlchemySkillLevel：执行对应的业务逻辑。 */
  private getAlchemySkillLevel(): number {
    return Math.max(1, Math.floor(this.alchemySkill?.level ?? 1));
  }

  private getFurnaceBonuses(): { successRate: number; speedRate: number } {
/** furnace：定义该变量以承载业务值。 */
    const furnace = this.equipment.weapon;
    return {
/** successRate：定义该变量以承载业务值。 */
      successRate: typeof furnace?.alchemySuccessRate === 'number' ? furnace.alchemySuccessRate : 0,
/** speedRate：定义该变量以承载业务值。 */
      speedRate: typeof furnace?.alchemySpeedRate === 'number' ? furnace.alchemySpeedRate : 0,
    };
  }

/** ensureItemSourceCatalog：执行对应的业务逻辑。 */
  private ensureItemSourceCatalog(): void {
    if (hasLoadedItemSourceCatalog()) {
      return;
    }
    void preloadItemSourceCatalog().then(() => {
      if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
        this.render({ preserveScroll: true });
      }
    });
  }

/** captureScrollState：执行对应的业务逻辑。 */
  private captureScrollState(): AlchemyScrollState | null {
/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return null;
    }
/** recipeList：定义该变量以承载业务值。 */
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
/** detailPanel：定义该变量以承载业务值。 */
    const detailPanel = body.querySelector<HTMLElement>('.alchemy-detail-panel');
/** presetStrip：定义该变量以承载业务值。 */
    const presetStrip = body.querySelector<HTMLElement>('.alchemy-preset-strip');
    return {
      bodyTop: body.scrollTop,
      bodyLeft: body.scrollLeft,
      recipeListTop: recipeList?.scrollTop ?? 0,
      recipeListLeft: recipeList?.scrollLeft ?? 0,
      detailTop: detailPanel?.scrollTop ?? 0,
      detailLeft: detailPanel?.scrollLeft ?? 0,
      presetLeft: presetStrip?.scrollLeft ?? 0,
    };
  }

/** restoreScrollState：执行对应的业务逻辑。 */
  private restoreScrollState(state: AlchemyScrollState, options: AlchemyRenderOptions): void {
/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return;
    }
    body.scrollTop = state.bodyTop;
    body.scrollLeft = state.bodyLeft;
/** recipeList：定义该变量以承载业务值。 */
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    if (recipeList) {
      recipeList.scrollTop = options.resetRecipeListScroll ? 0 : state.recipeListTop;
      recipeList.scrollLeft = options.resetRecipeListScroll ? 0 : state.recipeListLeft;
    }
/** detailPanel：定义该变量以承载业务值。 */
    const detailPanel = body.querySelector<HTMLElement>('.alchemy-detail-panel');
    if (detailPanel) {
      detailPanel.scrollTop = options.resetDetailScroll ? 0 : state.detailTop;
      detailPanel.scrollLeft = options.resetDetailScroll ? 0 : state.detailLeft;
    }
/** presetStrip：定义该变量以承载业务值。 */
    const presetStrip = body.querySelector<HTMLElement>('.alchemy-preset-strip');
    if (presetStrip) {
      presetStrip.scrollLeft = state.presetLeft;
    }
  }

/** syncJobCountdown：执行对应的业务逻辑。 */
  private syncJobCountdown(): void {
/** job：定义该变量以承载业务值。 */
    const job = this.panelState?.job;
    if (!job) {
      this.localJobRemainingTicks = null;
      this.localBatchRemainingTicks = null;
      this.localPausedTicks = null;
      this.localJobPhase = null;
      this.lastJobSnapshotKey = null;
      this.stopCountdown();
      return;
    }
/** nextKey：定义该变量以承载业务值。 */
    const nextKey = `${job.recipeId}:${job.startedAt}:${job.phase}:${job.pausedTicks}:${job.remainingTicks}:${job.totalTicks}:${job.quantity}:${job.completedCount}:${job.currentBatchRemainingTicks}`;
    if (nextKey !== this.lastJobSnapshotKey) {
      this.localJobRemainingTicks = job.remainingTicks;
      this.localBatchRemainingTicks = job.currentBatchRemainingTicks;
      this.localPausedTicks = job.pausedTicks;
      this.localJobPhase = job.phase;
      this.lastJobSnapshotKey = nextKey;
    }
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.startCountdown();
    }
  }

/** startCountdown：执行对应的业务逻辑。 */
  private startCountdown(): void {
    if (this.countdownTimer || !this.panelState?.job) {
      return;
    }
    this.countdownTimer = window.setInterval(() => {
      if (!detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER) || !this.panelState?.job) {
        this.stopCountdown();
        return;
      }
      this.localJobRemainingTicks = Math.max(0, (this.localJobRemainingTicks ?? this.panelState.job.remainingTicks) - 1);
/** displayedPhase：定义该变量以承载业务值。 */
      const displayedPhase = this.localJobPhase ?? this.panelState.job.phase;
      if (displayedPhase === 'paused') {
        this.localPausedTicks = Math.max(0, (this.localPausedTicks ?? this.panelState.job.pausedTicks) - 1);
        if ((this.localPausedTicks ?? 0) <= 0) {
          this.localJobPhase = this.getAlchemyResumePhase(
            this.panelState.job,
            this.localJobRemainingTicks ?? this.panelState.job.remainingTicks,
            0,
          );
        }
      } else if (displayedPhase === 'preparing') {
/** preparationRemaining：定义该变量以承载业务值。 */
        const preparationRemaining = Math.max(
          0,
          (this.localJobRemainingTicks ?? this.panelState.job.remainingTicks)
            - (this.panelState.job.batchBrewTicks * Math.max(0, this.panelState.job.quantity - this.panelState.job.completedCount)),
        );
        if (preparationRemaining <= 0) {
          this.localJobPhase = 'brewing';
          this.localBatchRemainingTicks = this.panelState.job.batchBrewTicks;
        }
      } else {
        this.localBatchRemainingTicks = Math.max(
          0,
          (this.localBatchRemainingTicks ?? this.panelState.job.currentBatchRemainingTicks) - 1,
        );
      }
      this.refreshJobCountdown();
      if ((this.localJobRemainingTicks ?? 0) <= 0) {
        this.stopCountdown();
      }
    }, 1000);
  }

/** stopCountdown：执行对应的业务逻辑。 */
  private stopCountdown(): void {
    if (!this.countdownTimer) {
      return;
    }
    clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

/** refreshJobCountdown：执行对应的业务逻辑。 */
  private refreshJobCountdown(): void {
    if (!detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      return;
    }
/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
/** jobHost：定义该变量以承载业务值。 */
    const jobHost = body?.querySelector<HTMLElement>('[data-alchemy-job-card-host="true"]');
    if (jobHost && this.panelState?.job) {
      this.patchJobCard(jobHost);
    }
    if (this.panelState?.job) {
      this.startCountdown();
    }
  }

  private getAlchemyResumePhase(
    job: NonNullable<SyncedAlchemyPanelState['job']>,
    remainingTicks: number,
    pausedTicks: number,
  ): 'preparing' | 'brewing' {
/** brewTotalTicks：定义该变量以承载业务值。 */
    const brewTotalTicks = job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount);
    return Math.max(0, remainingTicks - pausedTicks) > brewTotalTicks ? 'preparing' : 'brewing';
  }
}


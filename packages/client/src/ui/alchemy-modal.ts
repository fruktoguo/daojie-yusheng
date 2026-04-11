import {
  ALCHEMY_FURNACE_OUTPUT_COUNT,
  ALCHEMY_PREPARATION_TICKS,
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
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
import { getLocalItemTemplate } from '../content/local-templates';
import { hasLoadedItemSourceCatalog, preloadItemSourceCatalog } from '../content/item-sources';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';

type AlchemyTab = 'simple' | 'full';
type AlchemyRecipeCategory = 'combat' | 'cultivation';

interface AlchemyModalCallbacks {
  onRequestPanel: (knownCatalogVersion?: number) => void;
  onSavePreset: (payload: C2S_SaveAlchemyPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onStartAlchemy: (payload: C2S_StartAlchemy) => void;
  onCancelAlchemy: () => void;
}

interface AlchemyScrollState {
  bodyTop: number;
  bodyLeft: number;
  recipeListTop: number;
  recipeListLeft: number;
  detailTop: number;
  detailLeft: number;
  presetLeft: number;
}

interface AlchemyRenderOptions {
  preserveScroll?: boolean;
  resetDetailScroll?: boolean;
  resetRecipeListScroll?: boolean;
}

interface AlchemyMetricSnapshot {
  powerText: string;
  successText: string;
  brewTimeText: string;
}

const SPIRIT_STONE_ITEM_ID = 'spirit_stone';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(rate: number): string {
  const normalized = Math.max(0, Math.min(1, rate));
  const percent = normalized * 100;
  return `${percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

function cloneIngredients(ingredients: readonly AlchemyIngredientSelection[]): AlchemyIngredientSelection[] {
  return ingredients.map((ingredient) => ({ ...ingredient }));
}

export class AlchemyModal {
  private static readonly MODAL_OWNER = 'alchemy-modal';
  private static readonly CONFIRM_MODAL_OWNER = 'alchemy-modal:confirm-start';
  private callbacks: AlchemyModalCallbacks | null = null;
  private inventory: Inventory = { items: [], capacity: 0 };
  private equipment: EquipmentSlots = { weapon: null, head: null, body: null, legs: null, accessory: null };
  private alchemySkill: PlayerState['alchemySkill'] | undefined;
  private loading = false;
  private responseError: string | null = null;
  private panelState: SyncedAlchemyPanelState | null = null;
  private catalogVersion = 0;
  private catalog: AlchemyRecipeCatalogEntry[] = [];
  private catalogByRecipeId = new Map<string, AlchemyRecipeCatalogEntry>();
  private activeTab: AlchemyTab = 'full';
  private activeCategory: AlchemyRecipeCategory = 'combat';
  private selectedRecipeId: string | null = null;
  private selectedPresetId: string | null = null;
  private draftByRecipeId = new Map<string, Map<string, number>>();
  private quantityByRecipeId = new Map<string, number>();
  private delegatedEventsBound = false;
  private confirmEventsBound = false;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private localJobRemainingTicks: number | null = null;
  private localBatchRemainingTicks: number | null = null;
  private localPausedTicks: number | null = null;
  private localJobPhase: 'preparing' | 'brewing' | 'paused' | null = null;
  private lastJobSnapshotKey: string | null = null;
  private confirmStartRequest: { recipeId: string; ingredients: AlchemyIngredientSelection[]; mode: AlchemyTab } | null = null;
  private confirmQuantityDraft = '1';

  setCallbacks(callbacks: AlchemyModalCallbacks): void {
    this.callbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.equipment = player.equipment;
    this.alchemySkill = player.alchemySkill;
  }

  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

  syncEquipment(equipment: EquipmentSlots): void {
    this.equipment = equipment;
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

  syncAlchemySkill(skill?: PlayerState['alchemySkill']): void {
    this.alchemySkill = skill;
    if (detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.render({ preserveScroll: true });
    }
    this.syncStartConfirmModal();
  }

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

  private ensureSelection(): void {
    const preferredRecipeId = this.panelState?.job?.recipeId
      ?? this.panelState?.presets[0]?.recipeId
      ?? null;
    const preferredRecipe = preferredRecipeId ? (this.catalogByRecipeId.get(preferredRecipeId) ?? null) : null;
    if (
      preferredRecipe
      && this.getVisibleCatalog().length === 0
      && this.resolveRecipeCategory(preferredRecipe) !== this.activeCategory
    ) {
      this.activeCategory = this.resolveRecipeCategory(preferredRecipe);
    }
    let visibleCatalog = this.getVisibleCatalog();
    if (visibleCatalog.length === 0) {
      const fallbackCategory = this.activeCategory === 'combat' ? 'cultivation' : 'combat';
      const fallbackCatalog = this.getCatalogByCategory(fallbackCategory);
      if (fallbackCatalog.length > 0) {
        this.activeCategory = fallbackCategory;
        visibleCatalog = fallbackCatalog;
      }
    }
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
    const recipePresets = this.getRecipePresets(this.selectedRecipeId);
    if (this.selectedPresetId && !recipePresets.some((preset) => preset.presetId === this.selectedPresetId)) {
      this.selectedPresetId = null;
    }
    if (!this.draftByRecipeId.has(this.selectedRecipeId)) {
      const activePreset = this.selectedPresetId
        ? recipePresets.find((preset) => preset.presetId === this.selectedPresetId) ?? null
        : null;
      this.setDraft(this.selectedRecipeId, activePreset?.ingredients ?? this.getFullRecipeIngredients(this.selectedRecipeId));
    }
  }

  private render(options: AlchemyRenderOptions = {}): void {
    this.ensureSelection();
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

  private tryPatchModal(options: AlchemyRenderOptions, scrollState: AlchemyScrollState | null): boolean {
    if (!detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      return false;
    }
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return false;
    }
    this.patchModalChrome();
    const selectedRecipe = this.getSelectedRecipe();
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
    const jobHost = body.querySelector<HTMLElement>('[data-alchemy-job-card-host="true"]');
    const topbar = body.querySelector<HTMLElement>('[data-alchemy-topbar="true"]');
    const tabHost = body.querySelector<HTMLElement>('[data-alchemy-tab-host="true"]');
    const categoryTabs = body.querySelector<HTMLElement>('[data-alchemy-category-tabs="true"]');
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    const detailPanel = body.querySelector<HTMLElement>('[data-alchemy-detail-panel="true"]');
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

  private patchModalChrome(): void {
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    const hintNode = document.getElementById('detail-modal-hint');
    if (titleNode) {
      titleNode.textContent = '炉中炼丹';
      titleNode.setAttribute('data-alchemy-level', `LV ${this.getAlchemySkillLevel()}`);
    }
    const subtitle = this.getAlchemyHeaderSubtitle();
    if (subtitleNode) {
      subtitleNode.textContent = subtitle;
      subtitleNode.classList.toggle('hidden', !subtitle);
    }
    if (hintNode) {
      hintNode.textContent = '';
    }
  }

  private getAlchemyHeaderSubtitle(): string {
    const job = this.panelState?.job;
    if (job) {
      const recipe = this.catalogByRecipeId.get(job.recipeId);
      const recipeName = recipe?.outputName ?? job.outputItemId;
      return `当前任务：${recipeName} · ${this.getAlchemyJobProgressLabel(job)} ${this.getAlchemyJobProgressText(job)}`;
    }
    if (this.panelState?.furnaceItemId) {
      return `当前任务：空闲 · 丹炉 ${this.equipment.weapon?.name ?? this.panelState.furnaceItemId}`;
    }
    return '当前任务：空闲';
  }

  private patchTopbar(topbar: HTMLElement): void {
    const levelNode = topbar.querySelector<HTMLElement>('[data-alchemy-skill-level="true"]');
    if (levelNode) {
      levelNode.textContent = `LV ${this.getAlchemySkillLevel()}`;
    } else {
      topbar.innerHTML = this.renderTopbarContent();
    }
  }

  private patchJobCard(jobHost: HTMLElement): void {
    const renderKey = this.getJobRenderKey();
    if (jobHost.dataset.jobKey !== renderKey) {
      jobHost.dataset.jobKey = renderKey;
      jobHost.innerHTML = this.renderJobCard();
      return;
    }
    const job = this.panelState?.job;
    const remainingNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-remaining="true"]');
    if (remainingNode && job) {
      remainingNode.textContent = String(this.localJobRemainingTicks ?? job.remainingTicks);
    }
    const phaseNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-phase-chip="true"]');
    if (phaseNode && job) {
      const currentPhase = this.getDisplayedJobPhase(job);
      phaseNode.textContent = this.getAlchemyJobPhaseLabel(job);
      phaseNode.classList.toggle('is-preparing', currentPhase === 'preparing');
      phaseNode.classList.toggle('is-brewing', currentPhase === 'brewing');
      phaseNode.classList.toggle('is-paused', currentPhase === 'paused');
    }
    const stageNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-stage-note="true"]');
    if (stageNode && job) {
      stageNode.textContent = this.getAlchemyJobStageNote(job);
    }
    const progressLabelNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-progress-label="true"]');
    if (progressLabelNode && job) {
      progressLabelNode.textContent = this.getAlchemyJobProgressLabel(job);
    }
    const progressValueNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-progress-value="true"]');
    if (progressValueNode && job) {
      progressValueNode.textContent = this.getAlchemyJobProgressText(job);
    }
    const progressFillNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-progress-fill="true"]');
    if (progressFillNode && job) {
      progressFillNode.style.width = `${this.getAlchemyJobProgressPercent(job).toFixed(2)}%`;
    }
    const successNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-success="true"]');
    if (successNode && job) {
      successNode.textContent = `成丹 ${job.successCount}`;
    }
    const failureNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-failure="true"]');
    if (failureNode && job) {
      failureNode.textContent = `散尽 ${job.failureCount}`;
    }
    const spiritStoneNode = jobHost.querySelector<HTMLElement>('[data-alchemy-job-spirit-stone="true"]');
    if (spiritStoneNode && job) {
      spiritStoneNode.textContent = `灵石 ${job.spiritStoneCost}`;
    }
  }

  private patchRecipeList(recipeList: HTMLElement): void {
    const visibleCatalog = this.getVisibleCatalog();
    const rows = Array.from(recipeList.querySelectorAll<HTMLElement>('.alchemy-recipe-item[data-recipe-id]'));
    const shouldRebuild = rows.length !== visibleCatalog.length
      || rows.some((row, index) => row.dataset.recipeId !== visibleCatalog[index]?.recipeId);
    if (shouldRebuild) {
      recipeList.innerHTML = this.renderRecipeList();
      return;
    }
    visibleCatalog.forEach((recipe, index) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      row.classList.toggle('active', recipe.recipeId === this.selectedRecipeId);
      const metaNode = row.querySelector<HTMLElement>('[data-alchemy-recipe-meta="true"]');
      if (metaNode) {
        metaNode.textContent = this.buildRecipeMetaText(recipe);
      }
    });
  }

  private patchTabButtons(host: HTMLElement): void {
    host.querySelectorAll<HTMLElement>('.alchemy-tab-btn[data-action="switch-tab"][data-tab]').forEach((node) => {
      const tab = node.dataset.tab === 'full' ? 'full' : 'simple';
      node.classList.toggle('active', tab === this.activeTab);
    });
  }

  private patchCategoryButtons(host: HTMLElement): void {
    host.querySelectorAll<HTMLElement>('.alchemy-category-btn[data-action="switch-category"][data-category]').forEach((node) => {
      const category = node.dataset.category === 'cultivation' ? 'cultivation' : 'combat';
      node.classList.toggle('active', category === this.activeCategory);
      const countNode = node.querySelector<HTMLElement>('.alchemy-category-count');
      if (countNode) {
        countNode.textContent = String(this.getCatalogByCategory(category).length);
      }
    });
  }

  private getSelectedRecipe(): AlchemyRecipeCatalogEntry | null {
    return this.selectedRecipeId ? (this.catalogByRecipeId.get(this.selectedRecipeId) ?? null) : null;
  }

  private resolveRecipeCategory(recipe: AlchemyRecipeCatalogEntry): AlchemyRecipeCategory {
    const tags = getLocalItemTemplate(recipe.outputItemId)?.tags ?? [];
    return tags.includes('修为丹药') ? 'cultivation' : 'combat';
  }

  private getCatalogByCategory(category: AlchemyRecipeCategory): AlchemyRecipeCatalogEntry[] {
    return this.catalog.filter((recipe) => this.resolveRecipeCategory(recipe) === category);
  }

  private getVisibleCatalog(): AlchemyRecipeCatalogEntry[] {
    return this.getCatalogByCategory(this.activeCategory);
  }

  private resolvePreferredOpenCategory(): AlchemyRecipeCategory {
    const preferredRecipeId = this.panelState?.job?.recipeId
      ?? this.selectedRecipeId
      ?? this.panelState?.presets[0]?.recipeId
      ?? null;
    if (preferredRecipeId) {
      const recipe = this.catalogByRecipeId.get(preferredRecipeId);
      if (recipe) {
        return this.resolveRecipeCategory(recipe);
      }
    }
    return 'combat';
  }

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

  private renderTopbarContent(): string {
    return `
      <div class="alchemy-topbar-main">
        <span class="alchemy-topbar-label">炼丹等级</span>
        <strong class="alchemy-topbar-value" data-alchemy-skill-level="true">LV ${escapeHtml(String(this.getAlchemySkillLevel()))}</strong>
      </div>
      <div class="alchemy-topbar-note">悬浮或点按药名可查看效果与来源</div>
    `;
  }

  private renderJobCard(): string {
    const job = this.panelState?.job;
    if (!job) {
      return '<section class="alchemy-job-card empty" data-alchemy-job-card="true"><div class="alchemy-job-title">当前炉火</div><div class="alchemy-job-text">当前没有进行中的炼丹任务。</div></section>';
    }
    const recipe = this.catalogByRecipeId.get(job.recipeId);
    const ingredientsHtml = job.ingredients
      .map((ingredient) => {
        const ingredientMeta = recipe?.ingredients.find((entry) => entry.itemId === ingredient.itemId);
        return this.renderItemReference(
          ingredient.itemId,
          ingredientMeta?.name ?? ingredient.itemId,
          'material',
          ingredient.count,
        );
      })
      .join('');
    const remainingTicks = this.localJobRemainingTicks ?? job.remainingTicks;
    const currentPhase = this.getDisplayedJobPhase(job);
    const phaseChipClass = currentPhase === 'preparing'
      ? 'is-preparing'
      : currentPhase === 'paused'
        ? 'is-paused'
        : 'is-brewing';
    const progressText = this.getAlchemyJobProgressText(job);
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

  private renderCategoryTabs(): string {
    const tabs: Array<{ category: AlchemyRecipeCategory; label: string }> = [
      { category: 'combat', label: '战斗丹药' },
      { category: 'cultivation', label: '修为丹药' },
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

  private renderRecipeList(): string {
    const visibleCatalog = this.getVisibleCatalog();
    if (visibleCatalog.length === 0) {
      return '<div class="alchemy-recipe-list-empty">当前分类下还没有可炼制的丹方。</div>';
    }
    return visibleCatalog
      .map((recipe) => this.renderRecipeListItem(recipe, recipe.recipeId === this.selectedRecipeId))
      .join('');
  }

  private renderFullTab(recipe: AlchemyRecipeCatalogEntry): string {
    const metrics = this.buildMetricSnapshot(recipe, 'full');
    const fullIngredients = this.getFullRecipeIngredients(recipe.recipeId);
    return `
      <div class="alchemy-tab-stack">
        ${this.renderSummaryCard(recipe, 'full', metrics)}
        <div class="alchemy-ingredient-section" data-alchemy-ingredients="true">
          ${recipe.ingredients.map((ingredient) => {
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

  private renderSimpleTab(recipe: AlchemyRecipeCatalogEntry): string {
    const draftIngredients = this.getDraftIngredients(recipe.recipeId);
    const exactRecipe = isExactAlchemyRecipe(recipe, draftIngredients);
    const metrics = this.buildMetricSnapshot(recipe, 'simple');
    const recipePresets = this.getRecipePresets(recipe.recipeId);
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
            const currentCount = draftIngredients.find((entry) => entry.itemId === ingredient.itemId)?.count ?? 0;
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
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
    const spiritStoneCost = this.getAlchemySpiritStoneCost(recipe, 1);
    const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      this.getAlchemySkillLevel(),
      this.getFurnaceBonuses().speedRate,
      this.getBatchOutputSize(recipe),
    );
    const startDisabled = maxQuantity <= 0 ? 'disabled' : '';
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

  private renderMetricCard(kind: 'power' | 'success' | 'time', label: string, value: string): string {
    return `
      <div class="alchemy-summary-metric alchemy-summary-metric--${kind}">
        <span class="alchemy-summary-metric-label">${escapeHtml(label)}</span>
        <strong class="alchemy-summary-metric-value" data-alchemy-metric="${kind}">${escapeHtml(value)}</strong>
      </div>
    `;
  }

  private buildMetricSnapshot(recipe: AlchemyRecipeCatalogEntry, mode: AlchemyTab): AlchemyMetricSnapshot {
    const ingredients = mode === 'full' ? this.getFullRecipeIngredients(recipe.recipeId) : this.getDraftIngredients(recipe.recipeId);
    const powerRatio = mode === 'full' ? 1 : computeAlchemyPowerRatio(recipe, ingredients);
    const baseSuccessRate = mode === 'full' ? 1 : computeAlchemySuccessRate(recipe, ingredients);
    const alchemyLevel = this.getAlchemySkillLevel();
    const furnaceBonuses = this.getFurnaceBonuses();
    const successRate = computeAlchemyAdjustedSuccessRate(
      baseSuccessRate,
      recipe.outputLevel,
      alchemyLevel,
      furnaceBonuses.successRate,
    );
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

  private patchDetailPanel(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
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

  private patchSummaryCard(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry, mode: AlchemyTab): void {
    const metrics = this.buildMetricSnapshot(recipe, mode);
    const metricKinds: Array<keyof AlchemyMetricSnapshot> = ['powerText', 'successText', 'brewTimeText'];
    const metricSelectors = ['power', 'success', 'time'] as const;
    metricSelectors.forEach((metric, index) => {
      const node = detailPanel.querySelector<HTMLElement>(`[data-alchemy-metric="${metric}"]`);
      if (node) {
        node.textContent = metrics[metricKinds[index]];
      }
    });
  }

  private patchFullIngredients(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
    recipe.ingredients.forEach((ingredient) => {
      const row = detailPanel.querySelector<HTMLElement>(`[data-alchemy-ingredient-item-id="${CSS.escape(ingredient.itemId)}"]`);
      const ownedNode = row?.querySelector<HTMLElement>('[data-alchemy-owned="true"]');
      if (ownedNode) {
        ownedNode.textContent = `持有 ${this.getInventoryCount(ingredient.itemId)}`;
      }
    });
  }

  private patchSimpleIngredients(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
    const draftIngredients = this.getDraftIngredients(recipe.recipeId);
    recipe.ingredients.forEach((ingredient) => {
      const row = detailPanel.querySelector<HTMLElement>(`[data-alchemy-ingredient-item-id="${CSS.escape(ingredient.itemId)}"]`);
      if (!row) {
        return;
      }
      const ownedNode = row.querySelector<HTMLElement>('[data-alchemy-owned="true"]');
      if (ownedNode) {
        ownedNode.textContent = `持有 ${this.getInventoryCount(ingredient.itemId)}`;
      }
      const currentCountNode = row.querySelector<HTMLElement>('[data-alchemy-current-count="true"]');
      if (currentCountNode) {
        const currentCount = draftIngredients.find((entry) => entry.itemId === ingredient.itemId)?.count ?? 0;
        currentCountNode.textContent = `${currentCount} / ${ingredient.count}`;
      }
    });
  }

  private patchPresetStrip(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry): void {
    const presetStrip = detailPanel.querySelector<HTMLElement>('[data-alchemy-preset-strip="true"]');
    if (!presetStrip) {
      return;
    }
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

  private patchActionSection(detailPanel: HTMLElement, recipe: AlchemyRecipeCatalogEntry, mode: AlchemyTab): void {
    const actions = detailPanel.querySelector<HTMLElement>('[data-alchemy-actions="true"]');
    if (!actions) {
      return;
    }
    const nextHtml = mode === 'full'
      ? this.renderActionSection(recipe, 'full', this.getFullRecipeIngredients(recipe.recipeId))
      : (() => {
          const recipePresets = this.getRecipePresets(recipe.recipeId);
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

  private bindEvents(body: HTMLElement): void {
    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const actionNode = target.closest<HTMLElement>('[data-action]');
      if (!actionNode) {
        return;
      }
      const action = actionNode.dataset.action;
      if (!action) {
        return;
      }
      if (action === 'switch-tab') {
        const tab = actionNode.dataset.tab === 'full' ? 'full' : 'simple';
        this.activeTab = tab;
        this.render({ preserveScroll: true });
        return;
      }
      if (action === 'switch-category') {
        const category = actionNode.dataset.category === 'cultivation' ? 'cultivation' : 'combat';
        if (category !== this.activeCategory) {
          this.activeCategory = category;
          this.selectedPresetId = null;
          this.ensureSelection();
          this.render({ preserveScroll: true, resetDetailScroll: true, resetRecipeListScroll: true });
        }
        return;
      }
      if (action === 'select-recipe') {
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
        const presetId = actionNode.dataset.presetId ?? '';
        if (!presetId || !this.selectedRecipeId) {
          return;
        }
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

  private handleStartRequest(ingredients: AlchemyIngredientSelection[], mode: AlchemyTab): void {
    if (!this.selectedRecipeId) {
      return;
    }
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

  private handleSavePreset(): void {
    if (!this.selectedRecipeId) {
      return;
    }
    const recipe = this.catalogByRecipeId.get(this.selectedRecipeId);
    if (!recipe) {
      return;
    }
    const matchingPresets = this.getRecipePresets(recipe.recipeId);
    const selectedPreset = this.selectedPresetId
      ? matchingPresets.find((preset) => preset.presetId === this.selectedPresetId) ?? null
      : null;
    const nextName = selectedPreset?.name
      ?? `${recipe.outputName}简方${matchingPresets.length + 1}`;
    this.callbacks?.onSavePreset({
      presetId: selectedPreset?.presetId,
      recipeId: recipe.recipeId,
      name: nextName,
      ingredients: this.getDraftIngredients(recipe.recipeId),
    });
  }

  private getRecipePresets(recipeId: string): PlayerAlchemyPreset[] {
    return (this.panelState?.presets ?? []).filter((preset) => preset.recipeId === recipeId);
  }

  private getDraftIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.catalogByRecipeId.get(recipeId);
    if (!recipe) {
      return [];
    }
    const draft = this.draftByRecipeId.get(recipeId);
    if (!draft) {
      return this.getFullRecipeIngredients(recipeId);
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

  private getFullRecipeIngredients(recipeId: string): AlchemyIngredientSelection[] {
    const recipe = this.catalogByRecipeId.get(recipeId);
    if (!recipe) {
      return [];
    }
    return recipe.ingredients.map((ingredient) => ({
      itemId: ingredient.itemId,
      count: ingredient.count,
    }));
  }

  private setDraft(recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
    const recipe = this.catalogByRecipeId.get(recipeId);
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

  private adjustAuxCount(recipeId: string, itemId: string, delta: number): void {
    const recipe = this.catalogByRecipeId.get(recipeId);
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

  private getInventoryCount(itemId: string): number {
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private buildRecipeMetaText(recipe: AlchemyRecipeCatalogEntry): string {
    const simpleCount = this.getRecipePresets(recipe.recipeId).length;
    return `一炉 ${this.getBatchOutputCount(recipe)} 枚 · 基时 ${recipe.baseBrewTicks * this.getBatchOutputSize(recipe)} 息 · 简方 ${simpleCount}`;
  }

  private getSpiritStoneOwnedCount(): number {
    return this.getInventoryCount(SPIRIT_STONE_ITEM_ID);
  }

  private getAlchemySpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, this.resolveRecipeCategory(recipe) === 'cultivation') * normalizeAlchemyQuantity(quantity);
  }

  private getBatchOutputCount(recipe: AlchemyRecipeCatalogEntry): number {
    return computeAlchemyBatchOutputCountWithSize(recipe.outputCount, this.getBatchOutputSize(recipe));
  }

  private getBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    return this.resolveRecipeCategory(recipe) === 'cultivation' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
  }

  private getMaxCraftQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const ingredientCaps = ingredients
      .map((ingredient) => {
        if (ingredient.count <= 0) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.floor(this.getInventoryCount(ingredient.itemId) / ingredient.count);
      })
      .filter((cap) => Number.isFinite(cap));
    const spiritStonePerBatch = this.getAlchemySpiritStoneCost(recipe, 1);
    const spiritStoneCap = spiritStonePerBatch > 0
      ? Math.floor(this.getSpiritStoneOwnedCount() / spiritStonePerBatch)
      : Number.POSITIVE_INFINITY;
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
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
    const current = normalizeAlchemyQuantity(this.quantityByRecipeId.get(recipe.recipeId));
    const next = maxQuantity > 0 ? Math.min(current, maxQuantity) : 1;
    this.quantityByRecipeId.set(recipe.recipeId, next);
    return next;
  }

  private setSelectedQuantity(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
    next: number,
  ): void {
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
    const normalized = maxQuantity > 0
      ? Math.max(1, Math.min(maxQuantity, normalizeAlchemyQuantity(next)))
      : 1;
    this.quantityByRecipeId.set(recipe.recipeId, normalized);
  }

  private parseConfirmQuantity(): number | null {
    if (!this.confirmQuantityDraft || !/^\d+$/.test(this.confirmQuantityDraft)) {
      return null;
    }
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
    quantity: number | null;
    maxQuantity: number;
    batchBrewTicks: number;
    totalTicks: number | null;
    spiritStoneCost: number | null;
    errorText: string | null;
    startDisabled: boolean;
  } {
    const quantity = this.parseConfirmQuantity();
    const maxQuantity = this.getMaxCraftQuantity(recipe, ingredients);
    const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      this.getAlchemySkillLevel(),
      this.getFurnaceBonuses().speedRate,
      this.getBatchOutputSize(recipe),
    );
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

  private renderStartConfirmBody(
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    state: {
      quantity: number | null;
      maxQuantity: number;
      batchBrewTicks: number;
      totalTicks: number | null;
      spiritStoneCost: number | null;
      errorText: string | null;
      startDisabled: boolean;
    },
  ): string {
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

  private bindConfirmEvents(): void {
    if (this.confirmEventsBound) {
      return;
    }
    this.confirmEventsBound = true;
    document.addEventListener('click', (event) => {
      if (!confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
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
      this.syncStartConfirmState();
    }, true);
    document.addEventListener('input', (event) => {
      if (!confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
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
      this.syncStartConfirmState();
    });
  }

  private syncStartConfirmState(): void {
    const request = this.confirmStartRequest;
    const recipe = request ? this.catalogByRecipeId.get(request.recipeId) ?? null : null;
    if (!request || !recipe || !confirmModalHost.isOpenFor(AlchemyModal.CONFIRM_MODAL_OWNER)) {
      return;
    }
    const state = this.buildConfirmStartState(recipe, request.ingredients);
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

  private syncStartConfirmModal(): void {
    const request = this.confirmStartRequest;
    const recipe = request ? this.catalogByRecipeId.get(request.recipeId) ?? null : null;
    if (!request || !recipe || !detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      this.confirmStartRequest = null;
      confirmModalHost.close(AlchemyModal.CONFIRM_MODAL_OWNER);
      return;
    }
    const state = this.buildConfirmStartState(recipe, request.ingredients);
    if (this.patchStartConfirmModal(recipe, request.mode, request.ingredients)) {
      this.syncStartConfirmState();
      return;
    }
    confirmModalHost.open({
      ownerId: AlchemyModal.CONFIRM_MODAL_OWNER,
      title: '选择炼制数量',
      subtitle: `${recipe.outputName} · ${request.mode === 'full' ? '完整丹方' : '简易丹方'}`,
      bodyHtml: this.renderStartConfirmBody(recipe, request.mode, state),
      confirmLabel: '开始炼制',
      confirmDisabled: state.startDisabled,
      onConfirm: () => {
        const latestRequest = this.confirmStartRequest;
        const latestRecipe = latestRequest ? this.catalogByRecipeId.get(latestRequest.recipeId) ?? null : null;
        if (!latestRequest || !latestRecipe) {
          this.confirmStartRequest = null;
          return;
        }
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
    const titleNode = document.querySelector<HTMLElement>('.confirm-modal-title');
    const subtitleNode = document.querySelector<HTMLElement>('.confirm-modal-subtitle');
    const bodyNode = document.querySelector<HTMLElement>('.confirm-modal-body');
    if (!titleNode || !subtitleNode || !bodyNode) {
      return false;
    }
    const shell = bodyNode.querySelector<HTMLElement>('[data-alchemy-confirm-key]');
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
    const ingredientKey = ingredients
      .map((ingredient) => `${ingredient.itemId}:${ingredient.count}`)
      .join('|');
    return `${recipeId}:${mode}:${ingredientKey}`;
  }

  private getJobRenderKey(): string {
    const job = this.panelState?.job;
    if (!job) {
      return 'empty';
    }
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

  private getAlchemyJobPhaseLabel(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      return '暂停中';
    }
    return phase === 'preparing' ? '起炉中' : '炼制中';
  }

  private getAlchemyJobStageNote(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
    const remainingTicks = this.localJobRemainingTicks ?? job.remainingTicks;
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      const pausedTicks = this.getDisplayedPausedTicks(job);
      if (this.getAlchemyResumePhase(job, remainingTicks, pausedTicks) === 'preparing') {
        return `${pausedTicks} 息后继续起炉，移动或出手会重新暂停炼丹。`;
      }
      return `${pausedTicks} 息后继续第 ${this.getAlchemyCurrentBatch(job)}/${job.quantity} 炉，移动或出手会重新暂停炼丹。`;
    }
    if (phase === 'preparing') {
      const preparationRemaining = Math.max(0, remainingTicks - (job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount)));
      return `${preparationRemaining} 息后自动开炼，移动或出手会暂停炼丹 10 息。`;
    }
    return `当前第 ${this.getAlchemyCurrentBatch(job)}/${job.quantity} 炉，移动或出手会暂停炼丹 10 息。`;
  }

  private getDisplayedJobPhase(job: NonNullable<SyncedAlchemyPanelState['job']>): 'preparing' | 'brewing' | 'paused' {
    return this.localJobPhase ?? job.phase;
  }

  private getDisplayedBatchRemainingTicks(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    return this.localBatchRemainingTicks ?? job.currentBatchRemainingTicks;
  }

  private getDisplayedPausedTicks(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    return this.localPausedTicks ?? job.pausedTicks;
  }

  private getAlchemyCurrentBatch(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    return Math.min(job.quantity, Math.max(1, job.completedCount + 1));
  }

  private getAlchemyJobProgressLabel(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      return '炉火暂歇';
    }
    if (phase === 'preparing') {
      return '起炉准备';
    }
    return `第 ${this.getAlchemyCurrentBatch(job)} / ${job.quantity} 炉`;
  }

  private getAlchemyJobProgressText(job: NonNullable<SyncedAlchemyPanelState['job']>): string {
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      const pausedTotal = Math.max(1, job.pausedTicks || 10);
      return `${this.getDisplayedPausedTicks(job)} / ${pausedTotal} 息`;
    }
    if (phase === 'preparing') {
      const remaining = Math.max(0, (this.localJobRemainingTicks ?? job.remainingTicks) - (job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount)));
      return `${remaining} / ${job.preparationTicks} 息`;
    }
    return `${this.getDisplayedBatchRemainingTicks(job)} / ${job.batchBrewTicks} 息`;
  }

  private getAlchemyJobProgressPercent(job: NonNullable<SyncedAlchemyPanelState['job']>): number {
    const phase = this.getDisplayedJobPhase(job);
    if (phase === 'paused') {
      const pausedTotal = Math.max(1, job.pausedTicks || 10);
      return Math.max(0, Math.min(100, ((pausedTotal - this.getDisplayedPausedTicks(job)) / pausedTotal) * 100));
    }
    if (phase === 'preparing') {
      if (job.preparationTicks <= 0) {
        return 100;
      }
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

  private getAlchemySkillLevel(): number {
    return Math.max(1, Math.floor(this.alchemySkill?.level ?? 1));
  }

  private getFurnaceBonuses(): { successRate: number; speedRate: number } {
    const furnace = this.equipment.weapon;
    return {
      successRate: typeof furnace?.alchemySuccessRate === 'number' ? furnace.alchemySuccessRate : 0,
      speedRate: typeof furnace?.alchemySpeedRate === 'number' ? furnace.alchemySpeedRate : 0,
    };
  }

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

  private captureScrollState(): AlchemyScrollState | null {
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return null;
    }
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    const detailPanel = body.querySelector<HTMLElement>('.alchemy-detail-panel');
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

  private restoreScrollState(state: AlchemyScrollState, options: AlchemyRenderOptions): void {
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return;
    }
    body.scrollTop = state.bodyTop;
    body.scrollLeft = state.bodyLeft;
    const recipeList = body.querySelector<HTMLElement>('[data-alchemy-recipe-list="true"]');
    if (recipeList) {
      recipeList.scrollTop = options.resetRecipeListScroll ? 0 : state.recipeListTop;
      recipeList.scrollLeft = options.resetRecipeListScroll ? 0 : state.recipeListLeft;
    }
    const detailPanel = body.querySelector<HTMLElement>('.alchemy-detail-panel');
    if (detailPanel) {
      detailPanel.scrollTop = options.resetDetailScroll ? 0 : state.detailTop;
      detailPanel.scrollLeft = options.resetDetailScroll ? 0 : state.detailLeft;
    }
    const presetStrip = body.querySelector<HTMLElement>('.alchemy-preset-strip');
    if (presetStrip) {
      presetStrip.scrollLeft = state.presetLeft;
    }
  }

  private syncJobCountdown(): void {
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

  private stopCountdown(): void {
    if (!this.countdownTimer) {
      return;
    }
    clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  private refreshJobCountdown(): void {
    if (!detailModalHost.isOpenFor(AlchemyModal.MODAL_OWNER)) {
      return;
    }
    const body = document.getElementById('detail-modal-body');
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
    const brewTotalTicks = job.batchBrewTicks * Math.max(0, job.quantity - job.completedCount);
    return Math.max(0, remainingTicks - pausedTicks) > brewTotalTicks ? 'preparing' : 'brewing';
  }
}

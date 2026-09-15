/**
 * craft-workbench-modal.alchemy.ts — 从 craft-workbench-modal.ts 拆分的炼丹域方法。
 *
 * 包含炼丹配方选择、材料选择器、预设管理、元素向量计算、
 * 确认弹层、批量计算、提交等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: CraftWorkbenchModal, ...) 形式导出，
 * 由 craft-workbench-modal.ts 主类中的同名方法一行委托调用。
 */
import {
  type AlchemyIngredientSelection,
  type AlchemyRecipeCatalogEntry,
  type CraftElementVector,
  type CraftQueueStartMode,
  type PlayerAlchemyPreset,
  ALCHEMY_FURNACE_OUTPUT_COUNT,
  ELEMENT_KEYS,
  TECHNIQUE_GRADE_ORDER,
  addCraftElementVector,
  compactCraftElementVector,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyBatchOutputCountWithSize,
  computeAlchemyRawBrewTicks,
  computeAlchemyTotalJobTicks,
  createEmptyCraftElementVector,
  getAlchemySpiritStoneCost,
  normalizeAlchemyQuantity,
} from '@mud/shared';
import type {
  AlchemyTab,
  AlchemyMaterialPickerSortKey,
} from './craft-workbench-modal';
import { CraftWorkbenchModal } from './craft-workbench-modal';
import {
  UNKNOWN_ITEM_NAME,
  cloneAlchemyIngredients,
  escapeHtml,
  escapeHtmlAttr,
  getAlchemyRealmTab,
  normalizeLocalAlchemyIngredients,
  readCraftToolStat,
} from './craft-workbench-modal';
import { getLocalItemTemplate } from '../content/local-templates';
import { resolveClientItemBaseName } from '../content/item-display-name';
import { getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplaySignedNumber } from '../utils/number';
import { confirmModalHost } from './confirm-modal-host';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';
import { t } from './i18n';
export function ensureAlchemySelectionImpl(self: CraftWorkbenchModal): void {
    if (self.alchemyPanel?.state?.job) {
      const visibleRecipes = self.getVisibleAlchemyRecipes();
      const visibleRecipeIds = new Set(visibleRecipes.map((entry) => entry.recipeId));
      if (self.selectedAlchemyRecipeId && visibleRecipeIds.has(self.selectedAlchemyRecipeId)) {
        return;
      }
      self.selectedAlchemyRecipeId = visibleRecipes[0]?.recipeId ?? null;
      self.selectedAlchemyPresetId = null;
      return;
    }
    const visibleRecipes = self.getVisibleAlchemyRecipes();
    const visibleRecipeIds = new Set(visibleRecipes.map((entry) => entry.recipeId));
    if (self.selectedAlchemyRecipeId && visibleRecipeIds.has(self.selectedAlchemyRecipeId)) {
      return;
    }
    const nextRecipe = visibleRecipes[0] ?? null;
    self.selectedAlchemyRecipeId = nextRecipe?.recipeId ?? null;
    self.selectedAlchemyPresetId = null;
  }

export function ensureAlchemyDraftImpl(self: CraftWorkbenchModal): void {
    const recipeId = self.selectedAlchemyRecipeId;
    if (!recipeId || self.draftByRecipeId.has(recipeId)) {
      return;
    }
    const presets = self.getAlchemyRecipePresets(recipeId);
    const activePreset = self.selectedAlchemyPresetId
      ? presets.find((preset) => preset.presetId === self.selectedAlchemyPresetId) ?? null
      : null;
    self.setAlchemyDraft(recipeId, activePreset?.ingredients ?? self.getFullAlchemyIngredients(recipeId));
  }


export function getVisibleAlchemyRecipesImpl(self: CraftWorkbenchModal): AlchemyRecipeCatalogEntry[] {
    return self.alchemyCatalog.filter((entry) => (
      entry.category === self.activeAlchemyCategory
      && getAlchemyRealmTab(entry.outputLevel) === self.activeAlchemyRealm
    ));
  }

export function getSelectedAlchemyRecipeImpl(self: CraftWorkbenchModal): AlchemyRecipeCatalogEntry | null {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === self.selectedAlchemyRecipeId) ?? null;
    if (!recipe) {
      return null;
    }
    return recipe.category === self.activeAlchemyCategory && getAlchemyRealmTab(recipe.outputLevel) === self.activeAlchemyRealm
      ? recipe
      : null;
  }

export function tryPatchAlchemyBodyImpl(self: CraftWorkbenchModal, body: HTMLElement): boolean {
    return self.alchemyView.tryPatchAlchemyBody(body);
  }


export function renderAlchemyBodyImpl(self: CraftWorkbenchModal): string {
    return self.alchemyView.renderAlchemyBody();
  }

export function renderAlchemyItemReferenceImpl(self: CraftWorkbenchModal, 
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

export function resolveAlchemyMaterialNameImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry, itemId: string): string {
    const recipeIngredient = recipe.ingredients.find((ingredient) => ingredient.itemId === itemId);
    return resolveClientItemBaseName(itemId, recipeIngredient?.name, getLocalItemTemplate(itemId)?.name);
  }


export function buildLocalCraftFormulaPresetKeyImpl(self: CraftWorkbenchModal, kind: 'alchemy' | 'forging', recipeId: string): string {
    return `${kind}:${recipeId}`;
  }

export function ensureLocalCraftFormulaPresetsLoadedImpl(self: CraftWorkbenchModal): void {
    if (self.localCraftFormulaPresetsLoaded) {
      return;
    }
    self.localCraftFormulaPresetsLoaded = true;
    self.localCraftFormulaPresets.clear();
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
        const key = self.buildLocalCraftFormulaPresetKey(kind, recipeId);
        const list = self.localCraftFormulaPresets.get(key) ?? [];
        list.push({
          presetId,
          recipeId,
          name,
          ingredients: normalizeLocalAlchemyIngredients(entry.ingredients),
          updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0)),
        });
        self.localCraftFormulaPresets.set(key, list);
      }
    } catch {
      self.localCraftFormulaPresets.clear();
    }
  }

export function persistLocalCraftFormulaPresetsImpl(self: CraftWorkbenchModal): void {
    const payload: Array<PlayerAlchemyPreset & { kind: 'alchemy' | 'forging' }> = [];
    for (const [key, presets] of self.localCraftFormulaPresets.entries()) {
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

export function saveLocalCraftFormulaPresetImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): void {
    const kind = self.activeMode === 'forging' ? 'forging' : 'alchemy';
    const key = self.buildLocalCraftFormulaPresetKey(kind, recipe.recipeId);
    const list = self.localCraftFormulaPresets.get(key) ?? [];
    const existingIndex = self.selectedAlchemyPresetId
      ? list.findIndex((preset) => preset.presetId === self.selectedAlchemyPresetId)
      : -1;
    const now = Date.now();
    const preset: PlayerAlchemyPreset = {
      presetId: existingIndex >= 0 ? list[existingIndex].presetId : `local:${kind}:${recipe.recipeId}:${now.toString(36)}`,
      recipeId: recipe.recipeId,
      name: existingIndex >= 0 ? list[existingIndex].name : `${recipe.outputName}${kind === 'forging' ? '自定义器方' : '自定义丹方'}${list.length + 1}`,
      ingredients: self.getAlchemySubmittedDraftIngredients(recipe.recipeId),
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1, preset);
    } else {
      list.unshift(preset);
    }
    self.localCraftFormulaPresets.set(key, list.slice(0, 24));
    self.selectedAlchemyPresetId = preset.presetId;
    self.persistLocalCraftFormulaPresets();
  }

export function deleteLocalCraftFormulaPresetImpl(self: CraftWorkbenchModal, recipeId: string, presetId: string): boolean {
    const kind = self.activeMode === 'forging' ? 'forging' : 'alchemy';
    const key = self.buildLocalCraftFormulaPresetKey(kind, recipeId);
    const list = self.localCraftFormulaPresets.get(key) ?? [];
    const next = list.filter((preset) => preset.presetId !== presetId);
    if (next.length === list.length) {
      return false;
    }
    self.localCraftFormulaPresets.set(key, next);
    self.selectedAlchemyPresetId = null;
    self.persistLocalCraftFormulaPresets();
    return true;
  }

export function getFullAlchemyIngredientsImpl(self: CraftWorkbenchModal, recipeId: string): AlchemyIngredientSelection[] {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    return self.getAlchemyMainIngredients(recipe).concat(
      recipe.ingredients
        .filter((ingredient) => ingredient.role !== 'main')
        .map((ingredient) => ({ itemId: ingredient.itemId, count: ingredient.count })),
    );
  }

export function getAlchemyDraftIngredientsImpl(self: CraftWorkbenchModal, recipeId: string): AlchemyIngredientSelection[] {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    const draft = self.draftByRecipeId.get(recipeId);
    if (!draft) {
      return self.getFullAlchemyIngredients(recipeId);
    }
    const result: AlchemyIngredientSelection[] = self.getAlchemyMainIngredients(recipe);
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

export function getAlchemySubmittedDraftIngredientsImpl(self: CraftWorkbenchModal, recipeId: string): AlchemyIngredientSelection[] {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return [];
    }
    const mainIds = new Set(self.getAlchemyMainIngredients(recipe).map((entry) => entry.itemId));
    return self.getAlchemyDraftIngredients(recipeId).filter((entry) => mainIds.has(entry.itemId) || entry.count > 0);
  }

export function setAlchemyDraftImpl(self: CraftWorkbenchModal, recipeId: string, ingredients: readonly AlchemyIngredientSelection[]): void {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    const next = new Map<string, number>();
    const mainIngredients = self.getAlchemyMainIngredients(recipe);
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
    self.draftByRecipeId.set(recipeId, next);
  }

export function getAlchemyMainIngredientsImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): AlchemyIngredientSelection[] {
    const source = (recipe.mainIngredients && recipe.mainIngredients.length > 0)
      ? recipe.mainIngredients
      : recipe.ingredients.filter((ingredient) => ingredient.role === 'main');
    return source.map((ingredient) => ({
      itemId: ingredient.itemId,
      count: ingredient.count,
    }));
  }

export function adjustAlchemyAuxCountImpl(self: CraftWorkbenchModal, recipeId: string, itemId: string, delta: number): void {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe) {
      return;
    }
    if (self.getAlchemyMainIngredients(recipe).some((entry) => entry.itemId === itemId)) {
      return;
    }
    if (!self.getAlchemyMaterialElements(itemId)) {
      return;
    }
    if (!self.draftByRecipeId.has(recipeId)) {
      self.setAlchemyDraft(recipeId, self.getFullAlchemyIngredients(recipeId));
    }
    const draft = self.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
    const current = draft.get(itemId) ?? 0;
    const next = Math.max(0, current + delta);
    draft.set(itemId, next);
    self.draftByRecipeId.set(recipeId, draft);
  }

export function removeAlchemyAuxItemImpl(self: CraftWorkbenchModal, recipeId: string, itemId: string): void {
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (!recipe || self.getAlchemyMainIngredients(recipe).some((entry) => entry.itemId === itemId)) {
      return;
    }
    if (!self.draftByRecipeId.has(recipeId)) {
      self.setAlchemyDraft(recipeId, self.getFullAlchemyIngredients(recipeId));
    }
    const draft = self.draftByRecipeId.get(recipeId) ?? new Map<string, number>();
    draft.delete(itemId);
    self.draftByRecipeId.set(recipeId, draft);
  }

export function getAlchemyInventoryCountImpl(self: CraftWorkbenchModal, itemId: string): number {
    return self.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

export function getAlchemyMaterialElementsImpl(self: CraftWorkbenchModal, itemId: string): CraftElementVector | undefined {
    const inventoryItem = self.inventory.items.find((item) => item.itemId === itemId && item.materialValues?.elements);
    if (inventoryItem?.materialValues?.elements) {
      return inventoryItem.materialValues.elements;
    }
    return getLocalItemTemplate(itemId)?.materialValues?.elements;
  }

export function buildAlchemyMainElementsImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): CraftElementVector {
    const result = createEmptyCraftElementVector();
    for (const ingredient of self.getAlchemyMainIngredients(recipe)) {
      const elements = self.getAlchemyMaterialElements(ingredient.itemId);
      if (elements) {
        addCraftElementVector(result, elements, ingredient.count);
      }
    }
    return compactCraftElementVector(result);
  }

export function buildAlchemyRequiredElementsImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): CraftElementVector {
    const result = createEmptyCraftElementVector();
    addCraftElementVector(result, recipe.requiredAuxElements, 1);
    addCraftElementVector(result, self.buildAlchemyMainElements(recipe), 1);
    return compactCraftElementVector(result);
  }

export function buildAlchemyInputElementsImpl(self: CraftWorkbenchModal, 
    ingredients: readonly AlchemyIngredientSelection[],
  ): CraftElementVector {
    const result = createEmptyCraftElementVector();
    for (const ingredient of ingredients) {
      const elements = self.getAlchemyMaterialElements(ingredient.itemId);
      if (elements) {
        addCraftElementVector(result, elements, ingredient.count);
      }
    }
    return compactCraftElementVector(result);
  }

export function openAlchemyMaterialPickerModalImpl(self: CraftWorkbenchModal): void {
    const recipe = self.getSelectedAlchemyRecipe();
    if (!recipe) {
      return;
    }
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.ALCHEMY_MATERIAL_PICKER_OWNER,
      title: self.activeMode === 'forging' ? '选择辅材' : '选择辅药',
      subtitle: recipe.outputName,
      bodyHtml: self.renderAlchemyMaterialPickerBody(recipe),
      hideActions: true,
    });
    self.bindAlchemyMaterialPickerEvents();
  }

export function renderAlchemyMaterialPickerBodyImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): string {
    const candidates = self.getAlchemyMaterialPickerCandidates(recipe);
    const sortButton = (key: AlchemyMaterialPickerSortKey, label: string) => `
      <button class="alchemy-material-picker-sort ${self.alchemyMaterialPickerSortKey === key ? 'active' : ''}" type="button" data-alchemy-material-sort="${key}">
        ${label}${self.alchemyMaterialPickerSortKey === key ? (self.alchemyMaterialPickerSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    `;
    return `
      <div class="alchemy-material-picker">
        <input class="alchemy-material-picker-search" type="search" value="${escapeHtml(self.alchemyMaterialPickerQuery)}" placeholder="搜索材料" data-alchemy-material-search="true">
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
                <span>${self.renderAlchemyItemReference(candidate.itemId, candidate.name, 'material')}</span>
                <span>${formatDisplayInteger(candidate.level)}</span>
                <span>${escapeHtml(candidate.gradeLabel)}</span>
                ${ELEMENT_KEYS.map((element) => `<span>${self.formatAlchemyPickerElementValue(candidate.elements[element])}</span>`).join('')}
                <span>${formatDisplayInteger(candidate.count)}</span>
                <span class="alchemy-material-picker-add">添加</span>
              </button>
            `).join('') : '<div class="alchemy-material-picker-empty">没有可用材料</div>'}
          </div>
        </div>
      </div>
    `;
  }

export function getAlchemyMaterialPickerCandidatesImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): Array<{
    itemId: string;
    name: string;
    level: number;
    grade: string;
    gradeLabel: string;
    count: number;
    elements: Record<AlchemyMaterialPickerSortKey, number>;
  }> {
    const mainIds = new Set(self.getAlchemyMainIngredients(recipe).map((ingredient) => ingredient.itemId));
    const byItemId = new Map<string, {
      itemId: string;
      name: string;
      level: number;
      grade: string;
      gradeLabel: string;
      count: number;
      elements: Record<AlchemyMaterialPickerSortKey, number>;
    }>();
    for (const item of self.inventory.items) {
      if (mainIds.has(item.itemId)) {
        continue;
      }
      const template = getLocalItemTemplate(item.itemId);
      if (item.type !== 'material' && template?.type !== 'material') {
        continue;
      }
      const materialElements = self.getAlchemyMaterialElements(item.itemId);
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
        name: resolveClientItemBaseName(item.itemId, item.name, template?.name),
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
    const query = self.alchemyMaterialPickerQuery.trim().toLocaleLowerCase();
    const candidates = Array.from(byItemId.values())
      .filter((candidate) => !query || candidate.name.toLocaleLowerCase().includes(query) || candidate.itemId.toLocaleLowerCase().includes(query));
    const direction = self.alchemyMaterialPickerSortDirection === 'desc' ? -1 : 1;
    const gradeOrder = (grade: string) => {
      const index = TECHNIQUE_GRADE_ORDER.indexOf(grade as never);
      return index >= 0 ? index : -1;
    };
    candidates.sort((left, right) => {
      const key = self.alchemyMaterialPickerSortKey;
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

export function formatAlchemyPickerElementValueImpl(self: CraftWorkbenchModal, value: number | undefined): string {
    const numeric = Number(value) || 0;
    return numeric === 0 ? '-' : escapeHtml(formatDisplaySignedNumber(numeric));
  }

export function openAlchemyPresetPickerModalImpl(self: CraftWorkbenchModal, presetId?: string): void {
    const recipe = self.getSelectedAlchemyRecipe();
    if (!recipe) {
      return;
    }
    const presets = self.getAlchemyRecipePresets(recipe.recipeId);
    const selectedId = presetId?.trim()
      || self.alchemyPresetPickerSelectedId
      || self.selectedAlchemyPresetId
      || presets[0]?.presetId
      || null;
    self.alchemyPresetPickerSelectedId = presets.some((preset) => preset.presetId === selectedId)
      ? selectedId
      : presets[0]?.presetId ?? null;
    confirmModalHost.open({
      ownerId: CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER,
      title: self.activeMode === 'forging' ? '加载自定义器方' : '加载自定义丹方',
      subtitle: recipe.outputName,
      bodyHtml: self.renderAlchemyPresetPickerBody(recipe),
      hideActions: true,
      onClose: () => {
        self.alchemyPresetPickerSelectedId = null;
      },
    });
    self.bindAlchemyPresetPickerEvents();
  }

export function renderAlchemyPresetPickerBodyImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): string {
    const presets = self.getAlchemyRecipePresets(recipe.recipeId);
    const selectedPreset = self.alchemyPresetPickerSelectedId
      ? presets.find((preset) => preset.presetId === self.alchemyPresetPickerSelectedId) ?? null
      : null;
    const emptyText = self.activeMode === 'forging'
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
                <span class="alchemy-preset-picker-item-meta">${escapeHtml(self.formatAlchemyPresetUpdatedAt(preset.updatedAt))}</span>
              </button>
            `).join('')
            : `<div class="alchemy-preset-picker-empty">${escapeHtml(emptyText)}</div>`}
        </div>
        <div class="alchemy-preset-picker-detail" data-alchemy-preset-picker-detail="true">
          ${selectedPreset ? self.renderAlchemyPresetPickerDetail(recipe, selectedPreset) : `
            <div class="alchemy-preset-picker-empty alchemy-preset-picker-empty--detail">${escapeHtml(emptyText)}</div>
          `}
        </div>
      </div>
    `;
  }

export function renderAlchemyPresetPickerDetailImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry, preset: PlayerAlchemyPreset): string {
    const ingredients = self.buildAlchemyPresetPreviewIngredients(recipe, preset);
    const inputElements = self.buildAlchemyInputElements(ingredients);
    const requiredElements = self.buildAlchemyRequiredElements(recipe);
    return `
      <div class="alchemy-preset-picker-detail-head">
        <div>
          <div class="alchemy-preset-picker-title">${escapeHtml(preset.name)}</div>
          <div class="alchemy-preset-picker-subtitle">${escapeHtml(self.activeMode === 'forging' ? '自定义器方' : '自定义丹方')}</div>
        </div>
        <button class="small-btn" type="button" data-alchemy-preset-load="${escapeHtmlAttr(preset.presetId)}">${escapeHtml(self.activeMode === 'forging' ? '加载选中器方' : '加载选中丹方')}</button>
      </div>
      <section class="alchemy-fivephase-panel alchemy-preset-picker-fivephase">
        <div class="alchemy-fivephase-block">
          <div class="alchemy-fivephase-title">五行 当前 / 需要</div>
          ${self.renderAlchemyElementRatioGrid(inputElements, requiredElements)}
        </div>
      </section>
      <div class="alchemy-preset-picker-materials">
        ${ingredients.map((ingredient) => {
          const isMain = self.getAlchemyMainIngredients(recipe).some((entry) => entry.itemId === ingredient.itemId);
          return `
            <div class="alchemy-preset-picker-material-row">
              <span>${self.renderAlchemyItemReference(ingredient.itemId, self.resolveAlchemyMaterialName(recipe, ingredient.itemId), 'material')}</span>
              <span class="alchemy-ingredient-role ${isMain ? 'main' : 'aux'}">${escapeHtml(self.activeMode === 'forging' ? (isMain ? '主材' : '辅材') : (isMain ? '主药' : '辅药'))}</span>
              <span>${formatDisplayInteger(ingredient.count)}</span>
              <span>${escapeHtml(self.formatAlchemyElementVector(self.getAlchemyMaterialElements(ingredient.itemId)))}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

export function buildAlchemyPresetPreviewIngredientsImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    preset: PlayerAlchemyPreset,
  ): AlchemyIngredientSelection[] {
    const mainIngredients = self.getAlchemyMainIngredients(recipe);
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

export function renderAlchemyElementRatioGridImpl(self: CraftWorkbenchModal, 
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

export function formatAlchemyPresetUpdatedAtImpl(self: CraftWorkbenchModal, value: number | undefined): string {
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

export function bindAlchemyPresetPickerEventsImpl(self: CraftWorkbenchModal): void {
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
        self.openAlchemyPresetPickerModal(presetId);
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-preset-load]').forEach((button) => {
      button.addEventListener('click', () => {
        const recipeId = self.selectedAlchemyRecipeId;
        const presetId = button.dataset.alchemyPresetLoad?.trim() ?? '';
        if (!recipeId || !presetId) {
          return;
        }
        const preset = self.getAlchemyRecipePresets(recipeId).find((entry) => entry.presetId === presetId);
        if (!preset) {
          return;
        }
        self.selectedAlchemyPresetId = presetId;
        self.setAlchemyDraft(recipeId, preset.ingredients);
        confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_PRESET_PICKER_OWNER);
        self.render();
      });
    });
    bindInlineItemTooltips(root);
  }

export function bindAlchemyMaterialPickerEventsImpl(self: CraftWorkbenchModal): void {
    const root = document.querySelector<HTMLElement>('.alchemy-material-picker');
    if (!root) {
      return;
    }
    const search = root.querySelector<HTMLInputElement>('[data-alchemy-material-search="true"]');
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
    search?.addEventListener('input', () => {
      self.alchemyMaterialPickerQuery = search.value;
      self.openAlchemyMaterialPickerModal();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-material-sort]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.alchemyMaterialSort as AlchemyMaterialPickerSortKey | undefined;
        if (!key) {
          return;
        }
        if (self.alchemyMaterialPickerSortKey === key) {
          self.alchemyMaterialPickerSortDirection = self.alchemyMaterialPickerSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          self.alchemyMaterialPickerSortKey = key;
          self.alchemyMaterialPickerSortDirection = key === 'name' ? 'asc' : 'desc';
        }
        self.openAlchemyMaterialPickerModal();
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-alchemy-material-add]').forEach((button) => {
      button.addEventListener('click', () => {
        const recipeId = self.selectedAlchemyRecipeId;
        const itemId = button.dataset.alchemyMaterialAdd?.trim() ?? '';
        if (!recipeId || !itemId) {
          return;
        }
        self.selectedAlchemyPresetId = null;
        self.adjustAlchemyAuxCount(recipeId, itemId, 1);
        self.render();
        self.openAlchemyMaterialPickerModal();
      });
    });
  }

export function getAlchemySpiritStoneOwnedCountImpl(self: CraftWorkbenchModal): number {
    return self.getAlchemyInventoryCount('spirit_stone');
  }

export function getAlchemyFurnaceBonusesImpl(self: CraftWorkbenchModal): { successRate: number; speedRate: number } {
    const toolStats = self.alchemyPanel?.state?.toolStats;
    const skillKind = self.activeMode === 'forging' ? 'forging' : 'alchemy';
    return {
      successRate: readCraftToolStat(toolStats, skillKind, 'successRate'),
      speedRate: readCraftToolStat(toolStats, skillKind, 'speedRate'),
    };
  }

export function getAlchemyBatchOutputSizeImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): number {
    if (self.activeMode === 'forging') {
      return 1;
    }
    return recipe.category === 'buff' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
  }

export function getAlchemyBatchOutputCountImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry): number {
    return computeAlchemyBatchOutputCountWithSize(recipe.outputCount, self.getAlchemyBatchOutputSize(recipe));
  }

export function getAlchemySpiritStoneCostImpl(self: CraftWorkbenchModal, recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, recipe.category === 'buff') * normalizeAlchemyQuantity(quantity);
  }

export function getCraftSkillLevelForActiveModeImpl(self: CraftWorkbenchModal): number {
    if (self.activeMode === 'forging') {
      return self.forgingSkillLevel;
    }
    return self.alchemySkillLevel;
  }

export function getAlchemyRawBrewTicksImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const furnaceBonuses = self.getAlchemyFurnaceBonuses();
    return computeAlchemyRawBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      self.getCraftSkillLevelForActiveMode(),
      furnaceBonuses.speedRate,
      self.getAlchemyBatchOutputSize(recipe),
    );
  }

export function getAlchemyAdjustedBrewTicksImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const furnaceBonuses = self.getAlchemyFurnaceBonuses();
    return computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      ingredients,
      recipe.outputLevel,
      self.getCraftSkillLevelForActiveMode(),
      furnaceBonuses.speedRate,
      self.getAlchemyBatchOutputSize(recipe),
    );
  }

export function formatAlchemyElementVectorImpl(self: CraftWorkbenchModal, elements: CraftElementVector | undefined): string {
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

export function getAlchemyMaxCraftQuantityImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const ingredientCaps = ingredients
      .map((ingredient) => {
        if (ingredient.count <= 0) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.floor(self.getAlchemyInventoryCount(ingredient.itemId) / ingredient.count);
      })
      .filter((cap) => Number.isFinite(cap));
    const spiritStonePerBatch = self.getAlchemySpiritStoneCost(recipe, 1);
    const spiritStoneCap = spiritStonePerBatch > 0
      ? Math.floor(self.getAlchemySpiritStoneOwnedCount() / spiritStonePerBatch)
      : Number.POSITIVE_INFINITY;
    const maxQuantity = Math.min(
      spiritStoneCap,
      ...(ingredientCaps.length > 0 ? ingredientCaps : [0]),
    );
    return Math.max(0, Number.isFinite(maxQuantity) ? maxQuantity : 0);
  }

export function getAlchemySelectedQuantityImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
  ): number {
    const maxQuantity = self.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const current = normalizeAlchemyQuantity(self.quantityByRecipeId.get(recipe.recipeId));
    const next = maxQuantity > 0 ? Math.min(current, maxQuantity) : 1;
    self.quantityByRecipeId.set(recipe.recipeId, next);
    return next;
  }

export function setAlchemySelectedQuantityImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[],
    next: number,
  ): void {
    const maxQuantity = self.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const normalized = maxQuantity > 0
      ? Math.max(1, Math.min(maxQuantity, normalizeAlchemyQuantity(next)))
      : 1;
    self.quantityByRecipeId.set(recipe.recipeId, normalized);
  }

export function openAlchemyConfirmImpl(self: CraftWorkbenchModal, 
    recipeId: string,
    ingredients: readonly AlchemyIngredientSelection[],
    mode: AlchemyTab,
  ): void {
    self.confirmStartRequest = {
      recipeId,
      ingredients: cloneAlchemyIngredients(ingredients),
      mode,
    };
    const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
    if (recipe) {
      self.confirmQuantityDraft = String(self.getAlchemySelectedQuantity(recipe, ingredients));
    }
    self.syncAlchemyConfirmModal();
  }

export function parseAlchemyConfirmQuantityImpl(self: CraftWorkbenchModal): number | null {
    if (!self.confirmQuantityDraft || !/^\d+$/.test(self.confirmQuantityDraft)) {
      return null;
    }
    const quantity = Number(self.confirmQuantityDraft);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

export function buildAlchemyConfirmStateImpl(self: CraftWorkbenchModal, 
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
    const quantity = self.parseAlchemyConfirmQuantity();
    const maxQuantity = self.getAlchemyMaxCraftQuantity(recipe, ingredients);
    const rawBrewTicks = self.getAlchemyRawBrewTicks(recipe, ingredients);
    const batchBrewTicks = self.getAlchemyAdjustedBrewTicks(recipe, ingredients);
    const totalTicks = quantity === null
      ? null
      : computeAlchemyTotalJobTicks(rawBrewTicks, quantity, 0);
    const spiritStoneCost = quantity === null
      ? null
      : self.getAlchemySpiritStoneCost(recipe, quantity);
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

export function renderAlchemyConfirmBodyImpl(self: CraftWorkbenchModal, 
    recipe: AlchemyRecipeCatalogEntry,
    mode: AlchemyTab,
    state: ReturnType<CraftWorkbenchModal['buildAlchemyConfirmState']>,
  ): string {
    const isForging = self.activeMode === 'forging';
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
                batchCount: formatDisplayInteger(self.getAlchemyBatchOutputCount(recipe)),
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
                value="${escapeHtml(self.confirmQuantityDraft || '1')}"
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
          outputCount: formatDisplayInteger(self.getAlchemyBatchOutputCount(recipe)),
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

export function bindAlchemyConfirmEventsImpl(self: CraftWorkbenchModal): void {
    if (self.confirmEventsBound) {
      return;
    }
    self.confirmEventsBound = true;
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
        const mode = self.normalizeQueueStartMode(startModeButton.dataset.alchemyConfirmStartMode);
        self.submitAlchemyConfirm(mode);
        return;
      }
      if (!quickQtyButton) {
        return;
      }
      const value = quickQtyButton.dataset.alchemyConfirmQuickQty;
      if (!value) {
        return;
      }
      self.confirmQuantityDraft = value;
      const input = document.querySelector<HTMLInputElement>('[data-alchemy-confirm-quantity="true"]');
      if (input) {
        input.value = value;
      }
      self.syncAlchemyConfirmState();
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
      self.confirmQuantityDraft = normalized;
      if (target.value !== normalized) {
        target.value = normalized;
      }
      self.syncAlchemyConfirmState();
    });
  }

export function syncAlchemyConfirmStateImpl(self: CraftWorkbenchModal): void {
    const request = self.confirmStartRequest;
    const recipe = request ? self.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || !confirmModalHost.isOpenFor(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER)) {
      return;
    }
    const state = self.buildAlchemyConfirmState(recipe, request.ingredients);
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
      const unit = self.activeMode === 'forging'
        ? t('craft.workbench.alchemy.confirm.unit.forging')
        : t('craft.workbench.alchemy.confirm.unit.alchemy');
      hintNode.textContent = t('craft.workbench.alchemy.confirm.hint', {
        maxQuantity: formatDisplayInteger(state.maxQuantity),
        outputCount: formatDisplayInteger(self.getAlchemyBatchOutputCount(recipe)),
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

export function normalizeQueueStartModeImpl(self: CraftWorkbenchModal, value: string | undefined): CraftQueueStartMode {
    if (value === 'preserve' || value === 'append') {
      return value;
    }
    return 'replace';
  }

export function submitAlchemyConfirmImpl(self: CraftWorkbenchModal, queueMode: CraftQueueStartMode): void {
    const latestRequest = self.confirmStartRequest;
    const latestRecipe = latestRequest ? self.alchemyCatalog.find((entry) => entry.recipeId === latestRequest.recipeId) ?? null : null;
    if (!latestRequest || !latestRecipe) {
      self.confirmStartRequest = null;
      return;
    }
    const latestState = self.buildAlchemyConfirmState(latestRecipe, latestRequest.ingredients);
    if (latestState.startDisabled || latestState.quantity === null) {
      self.syncAlchemyConfirmModal();
      return;
    }
    self.setAlchemySelectedQuantity(latestRecipe, latestRequest.ingredients, latestState.quantity);
    self.confirmStartRequest = null;
    const start = self.activeMode === 'forging'
      ? self.callbacks?.onStartForging
      : self.callbacks?.onStartAlchemy;
    const submittedIngredients = latestRequest.ingredients.filter((entry) => entry.count > 0);
    start?.(
      latestRequest.recipeId,
      submittedIngredients.map((entry) => ({ itemId: entry.itemId, count: entry.count })),
      latestState.quantity,
      queueMode,
    );
    confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
  }

export function syncAlchemyConfirmModalImpl(self: CraftWorkbenchModal): void {
    const request = self.confirmStartRequest;
    const recipe = request ? self.alchemyCatalog.find((entry) => entry.recipeId === request.recipeId) ?? null : null;
    if (!request || !recipe || !detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER) || (self.activeMode !== 'alchemy' && self.activeMode !== 'forging')) {
      self.confirmStartRequest = null;
      confirmModalHost.close(CraftWorkbenchModal.ALCHEMY_CONFIRM_OWNER);
      return;
    }
    const isForging = self.activeMode === 'forging';
    const state = self.buildAlchemyConfirmState(recipe, request.ingredients);
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
      bodyHtml: self.renderAlchemyConfirmBody(recipe, request.mode, state),
      hideActions: true,
      onClose: () => {
        self.confirmStartRequest = null;
      },
    });
    self.bindAlchemyConfirmEvents();
    self.syncAlchemyConfirmState();
  }

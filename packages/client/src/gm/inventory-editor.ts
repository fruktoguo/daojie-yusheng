/**
 * gm/inventory-editor.ts —— GM 背包编辑器搜索下拉与可搜索物品字段。
 *
 * 从 gm.ts 抽取：getSearchableItemDisplayValue/getSearchableItemOptions/
 * searchableItemField/getSearchableItemValueField/getSearchableItemInput/
 * getSearchableItemList/getSearchableItemHint/getSearchableItemPopover/
 * normalizeSearchableItemText/renderSearchableItemOptions/
 * syncSearchableItemField/syncSearchableItemFields/closeSearchableItemField/
 * openSearchableItemField/moveSearchableItemActiveIndex/
 * commitSearchableItemSelection。
 * 对 gm.ts 的依赖通过 InventoryEditorContext 显式注入。
 */

import {
  type EquipSlot,
  type GmEditorItemOption,
} from '@mud/shared';

/** SearchableItemScope：物品搜索下拉的作用域。 */
export type SearchableItemScope = 'all' | 'inventory-add' | 'equipment-slot' | 'artifact-slot';

/** InventoryEditorContext：inventory-editor 对 gm.ts 的依赖。 */
export interface InventoryEditorContext {
  escapeHtml(input: string): string;
  buildHtmlAttributes(attributes: Record<string, string | undefined>): string;
  findItemCatalogEntry(itemId: string | undefined): GmEditorItemOption | null;
  getInventoryAddItemOptions(): Array<{ value: string; label: string }>;
  getItemCatalogOptions(filter?: (option: GmEditorItemOption) => boolean): Array<{ value: string; label: string }>;
  getActiveSearchableItemField(): HTMLElement | null;
  setActiveSearchableItemField(el: HTMLElement | null): void;
  getEditorContentEl(): HTMLElement;
  getCurrentInventoryAddType(): string;
  flushBlockedEditorRender(): void;
}

/** SEARCHABLE_ITEM_RESULT_LIMIT：搜索物品结果上限。 */
const SEARCHABLE_ITEM_RESULT_LIMIT = 80;
export function getSearchableItemDisplayValue(itemId: string, ctx: InventoryEditorContext): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!itemId) {
    return '';
  }
  const entry = ctx.findItemCatalogEntry(itemId);
  return entry ? entry.name : '未知物品';
}

/** getSearchableItemOptions：读取Searchable物品选项。 */
export function getSearchableItemOptions(scope: SearchableItemScope, slot: EquipSlot | undefined, ctx: InventoryEditorContext): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (scope === 'inventory-add') {
    return ctx.getInventoryAddItemOptions();
  }
  if (scope === 'equipment-slot') {
    if (!slot) {
      return [];
    }
    return ctx.getItemCatalogOptions((option) => option.type === 'equipment' && option.equipSlot === slot);
  }
  if (scope === 'artifact-slot') {
    return ctx.getItemCatalogOptions((option) => option.type === 'artifact');
  }
  return ctx.getItemCatalogOptions();
}

/** searchableItemField：处理searchable物品字段。 */
export function searchableItemField(
  label: string,
  value: string,
  scope: SearchableItemScope,
  hiddenFieldAttrs: Record<string, string | undefined>,
  extraClass: string,
  slot: EquipSlot | undefined,
  placeholder: string,
  wrapperAttrs: Record<string, string | undefined>,
  ctx: InventoryEditorContext,
): string {
  return `
    <label class="editor-field ${extraClass}"${ctx.buildHtmlAttributes(wrapperAttrs)}>
      <span>${ctx.escapeHtml(label)}</span>
      <div class="gm-item-combobox" data-item-combobox data-item-scope="${ctx.escapeHtml(scope)}"${slot ? ` data-slot="${ctx.escapeHtml(slot)}"` : ''} data-placeholder="${ctx.escapeHtml(placeholder)}">
        <div class="gm-item-combobox-shell">
          <input
            class="gm-item-combobox-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            data-item-combobox-input
            value="${ctx.escapeHtml(getSearchableItemDisplayValue(value, ctx))}"
            placeholder="${ctx.escapeHtml(placeholder)}"
          />
          <button class="gm-item-combobox-toggle" type="button" data-item-combobox-toggle aria-label="展开物品搜索">搜索</button>
        </div>
        <div class="gm-item-combobox-popover hidden" data-item-combobox-popover>
          <div class="gm-item-combobox-hint" data-item-combobox-hint></div>
          <div class="gm-item-combobox-list" data-item-combobox-list></div>
        </div>
        <input type="hidden" data-item-combobox-value${ctx.buildHtmlAttributes({ ...hiddenFieldAttrs, value })} />
      </div>
    </label>
  `;
}

/** getSearchableItemValueField：读取Searchable物品值字段。 */
export function getSearchableItemValueField(root: ParentNode, ctx: InventoryEditorContext): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-value]');
}

/** getSearchableItemInput：读取Searchable物品输入。 */
export function getSearchableItemInput(root: ParentNode, ctx: InventoryEditorContext): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-input]');
}

/** getSearchableItemList：读取Searchable物品列表。 */
export function getSearchableItemList(root: ParentNode, ctx: InventoryEditorContext): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-list]');
}

/** getSearchableItemHint：读取Searchable物品Hint。 */
export function getSearchableItemHint(root: ParentNode, ctx: InventoryEditorContext): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-hint]');
}

/** getSearchableItemPopover：读取Searchable物品Popover。 */
export function getSearchableItemPopover(root: ParentNode, ctx: InventoryEditorContext): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-popover]');
}

/** normalizeSearchableItemText：规范化Searchable物品文本。 */
export function normalizeSearchableItemText(value: string, ctx: InventoryEditorContext): string {
  return value.trim().toLowerCase();
}

/** renderSearchableItemOptions：渲染Searchable物品选项。 */
export function renderSearchableItemOptions(root: HTMLElement, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const input = getSearchableItemInput(root, ctx);
  const valueField = getSearchableItemValueField(root, ctx);
  const listEl = getSearchableItemList(root, ctx);
  const hintEl = getSearchableItemHint(root, ctx);
  if (!input || !valueField || !listEl || !hintEl) {
    return;
  }

  const scope = (root.dataset.itemScope as SearchableItemScope | undefined) ?? 'all';
  const slot = root.dataset.slot as EquipSlot | undefined;
  const allOptions = getSearchableItemOptions(scope, slot, ctx);
  const selectedValue = valueField.value;
  const normalizedQuery = normalizeSearchableItemText(input.value, ctx);
  const filteredOptions = normalizedQuery.length > 0
    ? allOptions.filter((option) => normalizeSearchableItemText(`${option.label} ${option.value}`, ctx).includes(normalizedQuery))
    : allOptions;
  let visibleOptions = filteredOptions.slice(0, SEARCHABLE_ITEM_RESULT_LIMIT);

  if (selectedValue && !visibleOptions.some((option) => option.value === selectedValue)) {
    const selectedOption = allOptions.find((option) => option.value === selectedValue);
    if (selectedOption && (normalizedQuery.length === 0 || normalizeSearchableItemText(`${selectedOption.label} ${selectedOption.value}`, ctx).includes(normalizedQuery))) {
      visibleOptions = [selectedOption, ...visibleOptions.slice(0, Math.max(0, SEARCHABLE_ITEM_RESULT_LIMIT - 1))];
    }
  }

  const renderedOptions = normalizedQuery.length === 0
    ? [{ value: '', label: '清空选择' }, ...visibleOptions]
    : visibleOptions;
  const defaultActiveIndex = renderedOptions.findIndex((option) => option.value === selectedValue);
  const fallbackActiveIndex = renderedOptions.findIndex((option) => option.value !== '');
  const initialActiveIndex = defaultActiveIndex >= 0
    ? defaultActiveIndex
    : Math.max(0, fallbackActiveIndex >= 0 ? fallbackActiveIndex : 0);
  const storedActiveIndex = Number(root.dataset.activeIndex ?? '-1');
  const activeIndex = Number.isInteger(storedActiveIndex) && storedActiveIndex >= 0 && storedActiveIndex < renderedOptions.length
    ? storedActiveIndex
    : initialActiveIndex;
  root.dataset.activeIndex = String(activeIndex);

  hintEl.textContent = normalizedQuery.length > 0
    ? `匹配 ${filteredOptions.length} 项${filteredOptions.length > visibleOptions.length ? `，当前显示前 ${visibleOptions.length} 项` : ''}`
    : `共 ${allOptions.length} 项，输入名称或 ID 可继续筛选${allOptions.length > visibleOptions.length ? `，当前显示前 ${visibleOptions.length} 项` : ''}`;

  if (renderedOptions.length === 0) {
    listEl.innerHTML = '<div class="gm-item-combobox-empty">没有匹配的物品模板</div>';
    return;
  }

  listEl.innerHTML = renderedOptions.map((option, index) => `
    <button
      class="gm-item-combobox-option${option.value === selectedValue ? ' selected' : ''}${index === activeIndex ? ' active' : ''}"
      type="button"
      data-item-option-value="${ctx.escapeHtml(option.value)}"
    >
      <span class="gm-item-combobox-option-title">${ctx.escapeHtml(option.label)}</span>
      <span class="gm-item-combobox-option-meta">${ctx.escapeHtml(option.value || '恢复为空')}</span>
    </button>
  `).join('');
  listEl.querySelector<HTMLElement>('.gm-item-combobox-option.active')?.scrollIntoView({ block: 'nearest' });
}

/** syncSearchableItemField：同步Searchable物品字段。 */
export function syncSearchableItemField(root: HTMLElement, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const input = getSearchableItemInput(root, ctx);
  const valueField = getSearchableItemValueField(root, ctx);
  if (!input || !valueField) {
    return;
  }
  if (root.dataset.open === 'true') {
    renderSearchableItemOptions(root, ctx);
    return;
  }
  input.value = getSearchableItemDisplayValue(valueField.value, ctx);
  input.placeholder = root.dataset.placeholder ?? '点击后输入名称或 ID 搜索物品模板';
}

/** syncSearchableItemFields：同步Searchable物品字段。 */
export function syncSearchableItemFields(scope: ParentNode, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const activeField = ctx.getActiveSearchableItemField();
  if (activeField && !activeField.isConnected) {
    /** ctx.getActiveSearchableItemField()：活跃Searchable物品字段。 */
    ctx.setActiveSearchableItemField(null);
  }
  scope.querySelectorAll<HTMLElement>('[data-item-combobox]').forEach((field) => {
    syncSearchableItemField(field, ctx);
  });
}

/** closeSearchableItemField：关闭Searchable物品字段。 */
export function closeSearchableItemField(root: HTMLElement, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (ctx.getActiveSearchableItemField() === root) {
    /** ctx.getActiveSearchableItemField()：活跃Searchable物品字段。 */
    ctx.setActiveSearchableItemField(null);
  }
  root.dataset.open = 'false';
  root.dataset.activeIndex = '-1';
  getSearchableItemPopover(root, ctx)?.classList.add('hidden');
  syncSearchableItemField(root, ctx);
  queueMicrotask(() => {
    ctx.flushBlockedEditorRender();
  });
}

/** openSearchableItemField：打开Searchable物品字段。 */
export function openSearchableItemField(root: HTMLElement, resetQuery: boolean, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const activeField = ctx.getActiveSearchableItemField();
  if (activeField && activeField !== root) {
    closeSearchableItemField(activeField, ctx);
  }
  const input = getSearchableItemInput(root, ctx);
  const valueField = getSearchableItemValueField(root, ctx);
  if (!input || !valueField) {
    return;
  }
  /** ctx.getActiveSearchableItemField()：活跃Searchable物品字段。 */
  ctx.setActiveSearchableItemField(root);
  root.dataset.open = 'true';
  root.dataset.activeIndex = '-1';
  getSearchableItemPopover(root, ctx)?.classList.remove('hidden');
  if (resetQuery) {
    input.value = '';
  }
  input.placeholder = getSearchableItemDisplayValue(valueField.value, ctx) || (root.dataset.placeholder ?? '点击后输入名称或 ID 搜索物品模板');
  renderSearchableItemOptions(root, ctx);
}

/** moveSearchableItemActiveIndex：处理移动Searchable物品活跃索引。 */
export function moveSearchableItemActiveIndex(root: HTMLElement, offset: number, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const listEl = getSearchableItemList(root, ctx);
  if (!listEl) {
    return;
  }
  const optionButtons = Array.from(listEl.querySelectorAll<HTMLButtonElement>('[data-item-option-value]'));
  if (optionButtons.length === 0) {
    return;
  }
  const currentIndex = Number(root.dataset.activeIndex ?? '-1');
  const nextIndex = currentIndex >= 0
    ? Math.min(optionButtons.length - 1, Math.max(0, currentIndex + offset))
    : Math.max(0, Math.min(optionButtons.length - 1, offset > 0 ? 0 : optionButtons.length - 1));
  root.dataset.activeIndex = String(nextIndex);
  renderSearchableItemOptions(root, ctx);
}

/** commitSearchableItemSelection：处理commit Searchable物品选中项。 */
export function commitSearchableItemSelection(root: HTMLElement, value: string, ctx: InventoryEditorContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const input = getSearchableItemInput(root, ctx);
  const valueField = getSearchableItemValueField(root, ctx);
  if (!input || !valueField) {
    return;
  }
  const changed = valueField.value !== value;
  valueField.value = value;
  input.value = getSearchableItemDisplayValue(value, ctx);
  closeSearchableItemField(root, ctx);
  if (!changed) {
    return;
  }
  valueField.dispatchEvent(new Event('input', { bubbles: true }));
  valueField.dispatchEvent(new Event('change', { bubbles: true }));
}


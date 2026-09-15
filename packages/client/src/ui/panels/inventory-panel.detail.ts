/**
 * inventory-panel.detail.ts
 *
 * 从 inventory-panel.ts 拆出的物品详情域实现：详情主体渲染、操作按钮 HTML、
 * 操作事件绑定、宗门创立对话框渲染和宗门名称/印记规范化。所有函数以
 * InventoryPanel 实例为第一参数（self），由主类方法以一行委托壳调用，
 * 不改变任何 DOM id/class、事件绑定或面板行为。
 */
import type { ItemStack } from '@mud/shared';
import { getFirstGrapheme, getGraphemeCount } from '@mud/shared';
import { renderTechniqueBookDetailHtml } from '../technique-book-detail';
import { getEquipSlotLabel, getItemTypeLabel } from '../../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { t } from '../i18n';
import { resolvePreviewItem } from '../../content/local-templates';
import type { InventoryPanel } from './inventory-panel';

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

export function renderItemDetailBodyImpl(
  self: InventoryPanel,
  body: HTMLElement,
  item: ItemStack,
  sourceListHtml: string,
  sourceEntryCount: number,
  canToggleSourceList: boolean,
  bonusLines: string[],
  materialValueLines: string[],
  effectLines: string[],
  statusLabel: string | null,
): void {
  const previewItem = resolvePreviewItem(item);
  const actionHtml = renderItemDetailActionsHtmlImpl(self, item);
  const techniqueBookDetailHtml = item.type === 'skill_book'
    ? renderTechniqueBookDetailHtml(previewItem)
    : '';
  replaceElementHtml(body, `
    <div class="quest-detail-grid inventory-detail-grid">
      <div class="quest-detail-section">
        <strong>${t('inventory.detail.item-type', undefined)}</strong>
        <span data-inventory-modal-type="true">${self.escapeHtml(getItemTypeLabel(item.type))}</span>
      </div>
      <div class="quest-detail-section">
        <strong>${t('inventory.detail.current-count', undefined)}</strong>
        <span data-inventory-modal-count="true">${formatDisplayCountBadge(item.count)}</span>
      </div>
      ${item.equipSlot ? `<div class="quest-detail-section">
        <strong>${t('inventory.detail.equip-slot', undefined)}</strong>
        <span data-inventory-modal-slot="true">${self.escapeHtml(getEquipSlotLabel(item.equipSlot))}</span>
      </div>` : ''}
    </div>
    ${item.type === 'skill_book' ? '' : `<div class="quest-detail-section">
      <strong>${t('inventory.detail.desc', undefined)}</strong>
      <span data-inventory-modal-desc="true">${self.escapeHtml(previewItem.desc)}</span>
    </div>`}
    ${statusLabel ? `<div class="quest-detail-section">
      <strong>${t('inventory.detail.status', undefined)}</strong>
      <span data-inventory-modal-status="true">${self.escapeHtml(statusLabel)}</span>
    </div>` : ''}
    ${item.type === 'skill_book'
      ? `<div class="quest-detail-section inventory-technique-book-detail" data-inventory-technique-book-detail="true">${techniqueBookDetailHtml}</div>`
      : ''}
    ${bonusLines.length > 0 ? `<div class="quest-detail-section">
      <strong>${t('inventory.detail.equipment-bonuses', undefined)}</strong>
      <span data-inventory-modal-bonuses="true">${self.escapeHtml(bonusLines.join(' / '))}</span>
    </div>` : ''}
    ${materialValueLines.length > 0 ? `<div class="quest-detail-section">
      <strong>${t('inventory.detail.material-bonuses', undefined)}</strong>
      <span data-inventory-modal-material-values="true">${self.escapeHtml(materialValueLines.join(' / '))}</span>
    </div>` : ''}
    ${effectLines.length > 0 ? `<div class="quest-detail-section">
      <strong>${t('inventory.detail.effects', undefined)}</strong>
      <span data-inventory-modal-effects="true">${self.escapeHtml(effectLines.join(' / '))}</span>
    </div>` : ''}
    <div class="quest-detail-section inventory-source-section">
      <strong>${t('inventory.detail.sources', undefined)}</strong>
      ${sourceListHtml}
      ${canToggleSourceList
        ? `<button class="small-btn ghost inventory-source-toggle" data-inventory-source-toggle="true" type="button">${self.sourceExpanded ? t('inventory.source.collapse', undefined) : t('inventory.source.expand-all', { count: formatDisplayInteger(sourceEntryCount) })}</button>`
        : ''}
    </div>
    ${actionHtml}
  `);
}

export function renderItemDetailActionsHtmlImpl(self: InventoryPanel, item: ItemStack): string {
  const primaryAction = self.getPrimaryAction(item);
  const canUseBatch = self.canBatchUseFromDetail(item, primaryAction);
  const primaryButton = self.isPrimaryActionable(primaryAction)
    ? `<button class="small-btn" type="button" data-inventory-detail-action="primary">${self.escapeHtml(primaryAction.label)}</button>`
    : '';
  const batchUseButton = canUseBatch
    ? `<button class="small-btn ghost" type="button" data-inventory-detail-action="batch-use">${t('inventory.action.batch-use', undefined)}</button>`
    : '';
  const dropButton = self.onDropItem
    ? `<button class="small-btn ghost" type="button" data-inventory-detail-action="drop">${item.count > 1 ? t('inventory.action.batch-drop', undefined) : t('inventory.action.drop-one', undefined)}</button>`
    : '';
  const destroyButton = self.onDestroyItem
    ? `<button class="small-btn ghost danger" type="button" data-inventory-detail-action="destroy">${item.count > 1 ? t('inventory.action.batch-destroy', undefined) : t('inventory.action.destroy', undefined)}</button>`
    : '';
  if (!primaryButton && !batchUseButton && !dropButton && !destroyButton) {
    return '';
  }
  return `
    <div class="inventory-detail-actions">
      <div class="inventory-detail-actions-group">
        ${primaryButton}
        ${batchUseButton}
      </div>
      <div class="inventory-detail-actions-group inventory-detail-actions-group--right">
        ${dropButton}
        ${destroyButton}
      </div>
    </div>
  `;
}

export function bindItemDetailActionsImpl(
  self: InventoryPanel,
  body: HTMLElement,
  signal: AbortSignal,
  item: ItemStack,
  slotIndex: number,
): void {
  body.querySelectorAll<HTMLElement>('[data-inventory-detail-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = button.dataset.inventoryDetailAction;
      if (action === 'primary') {
        self.handlePrimaryAction(slotIndex, self.getInventoryItemInstanceId(item), { closeModal: true });
        return;
      }
      if (action === 'batch-use') {
        self.openActionDialog('use', slotIndex, item.count);
        return;
      }
      if (action === 'drop') {
        self.openActionDialog('drop', slotIndex, item.count);
        return;
      }
      if (action === 'destroy') {
        self.openActionDialog('destroy', slotIndex, item.count);
      }
    }, { signal });
  });
}

export function renderSectFoundingDialogBodyImpl(self: InventoryPanel, body: HTMLElement): void {
  replaceElementHtml(body, `
    <div class="sect-founding-modal">
      <div class="sect-founding-form">
        <label class="sect-founding-field">
          <span>${t('inventory.sect-founding.name-label', undefined)}</span>
          <input class="sect-founding-input" data-sect-name-input type="text" maxlength="24" autocomplete="off" placeholder="${t('inventory.sect-founding.name-placeholder', undefined)}">
        </label>
        <label class="sect-founding-field sect-founding-field--mark">
          <span>${t('inventory.sect-founding.mark-label', undefined)}</span>
          <input class="sect-founding-input" data-sect-mark-input type="text" maxlength="4" autocomplete="off" placeholder="${t('inventory.sect-founding.mark-placeholder', undefined)}">
        </label>
      </div>
      <div class="sect-founding-status" data-sect-founding-status role="status" aria-live="polite"></div>
      <div class="inventory-detail-actions sect-founding-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-sect-founding-cancel>${t('inventory.action.back-detail', undefined)}</button>
          <button class="small-btn" type="button" data-sect-founding-confirm>${t('inventory.sect-founding.confirm', undefined)}</button>
        </div>
      </div>
    </div>
  `);
}

export function normalizeSectNameImpl(self: InventoryPanel, input: string): string {
  const normalized = input.replace(/\s+/g, '').trim();
  const count = getGraphemeCount(normalized);
  if (count < 2 || count > 12 || /[<>`"'\\]/.test(normalized)) {
    return '';
  }
  return normalized;
}

export function normalizeSectMarkImpl(self: InventoryPanel, input: string): string {
  const normalized = input.replace(/\s+/g, '').trim();
  const first = getFirstGrapheme(normalized);
  if (!first || getGraphemeCount(normalized) !== 1 || /[\s<>`"'\\]/.test(first)) {
    return '';
  }
  return first;
}

export function normalizeSectMarkInputImpl(self: InventoryPanel, input: string): string {
  const normalized = input.replace(/\s+/g, '').trim();
  const first = getFirstGrapheme(normalized);
  if (!first || /[\s<>`"'\\]/.test(first)) {
    return '';
  }
  return first;
}

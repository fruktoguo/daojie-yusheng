/**
 * 背包批量丢弃对话框。
 *
 * 只维护筛选、选择和二次确认状态；物品是否仍可丢弃及最终资产变更由服务端权威校验。
 */
import {
  matchesInventoryTypeFilter,
  type Inventory,
  type ItemStack,
} from '@mud/shared';
import { INVENTORY_FILTER_TABS, type InventoryFilter } from '../../constants/ui/inventory';
import { formatDisplayInteger } from '../../utils/number';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { getItemDisplayMeta } from '../item-display';

type BulkDiscardEntry = {
  item: ItemStack;
  itemInstanceId: string;
  name: string;
};

export interface InventoryBulkDiscardDialogOptions {
  ownerId: string;
  getInventory(): Inventory | null;
  getItemInstanceId(item: ItemStack): string;
  dropItems(itemInstanceIds: string[]): void;
  closeModal(): void;
  resetParentModalState(): void;
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeFilter(value: unknown): InventoryFilter {
  return INVENTORY_FILTER_TABS.some((entry) => entry.id === value)
    ? value as InventoryFilter
    : 'all';
}

export class InventoryBulkDiscardDialogController {
  private openState = false;
  private selectedIds = new Set<string>();
  private filter: InventoryFilter = 'all';
  private confirmOpen = false;
  private lastRenderKey: string | null = null;

  constructor(private readonly options: InventoryBulkDiscardDialogOptions) {}

  isOpen(): boolean {
    return this.openState;
  }

  open(initialFilter: InventoryFilter): boolean {
    if (!this.options.getInventory()) {
      return false;
    }
    this.reset();
    this.filter = normalizeFilter(initialFilter);
    this.openState = true;
    this.render();
    return true;
  }

  reset(): void {
    this.openState = false;
    this.selectedIds.clear();
    this.filter = 'all';
    this.confirmOpen = false;
    this.lastRenderKey = null;
  }

  render(): void {
    const inventory = this.options.getInventory();
    if (!inventory) {
      this.reset();
      detailModalHost.close(this.options.ownerId);
      return;
    }
    this.openState = true;
    const allEntries = this.getEntries(inventory);
    this.pruneMissingSelections(allEntries);
    if (this.confirmOpen) {
      this.renderConfirmation(inventory);
      return;
    }
    const visibleEntries = allEntries.filter((entry) => this.matchesFilter(entry.item));
    detailModalHost.open({
      ownerId: this.options.ownerId,
      variantClass: 'detail-modal--inventory-bulk-discard',
      title: '一键丢弃',
      subtitle: `已选 ${formatDisplayInteger(this.selectedIds.size)} 组物品`,
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => this.renderSelectionBody(body, visibleEntries),
      onClose: () => this.handleHostClose(),
      onAfterRender: (body, signal) => this.bindSelectionActions(body, signal),
    });
    this.lastRenderKey = this.buildRenderKey(inventory);
  }

  /**
   * 在背包增量到达时只在状态实际变化后重绘；返回 true 表示当前由本控制器接管弹窗。
   */
  patch(): boolean {
    if (!this.openState) {
      return false;
    }
    const inventory = this.options.getInventory();
    if (!inventory) {
      this.reset();
      detailModalHost.close(this.options.ownerId);
      return true;
    }
    if (!detailModalHost.isOpenFor(this.options.ownerId)) {
      this.reset();
      return true;
    }
    const nextRenderKey = this.buildRenderKey(inventory);
    if (this.lastRenderKey !== nextRenderKey) {
      this.render();
    }
    return true;
  }

  private renderSelectionBody(body: HTMLElement, visibleEntries: BulkDiscardEntry[]): void {
    const selectedCount = this.selectedIds.size;
    replaceElementHtml(body, `
      <div class="inventory-bulk-discard">
        <div class="inventory-bulk-discard-tabs">
          ${INVENTORY_FILTER_TABS.map((tab) => `
            <button class="inventory-filter-tab${this.filter === tab.id ? ' active' : ''}" type="button" data-bulk-discard-filter="${escapeHtml(tab.id)}">
              ${escapeHtml(tab.label)}
            </button>
          `).join('')}
        </div>
        <div class="inventory-bulk-discard-toolbar">
          <span>当前 ${formatDisplayInteger(visibleEntries.length)} 组 · 已选 ${formatDisplayInteger(selectedCount)} 组</span>
          <div class="inventory-bulk-discard-tools">
            <button class="small-btn ghost" type="button" data-bulk-discard-select-visible>全选当前</button>
            <button class="small-btn ghost" type="button" data-bulk-discard-clear>清空</button>
          </div>
        </div>
        <div class="inventory-bulk-discard-list">
          ${visibleEntries.length > 0 ? visibleEntries.map((entry) => {
            const checked = this.selectedIds.has(entry.itemInstanceId);
            return `
              <button class="inventory-bulk-discard-row${checked ? ' selected' : ''}" type="button" data-bulk-discard-toggle="${escapeHtml(entry.itemInstanceId)}" aria-pressed="${checked ? 'true' : 'false'}">
                <span class="inventory-bulk-discard-check">${checked ? '✓' : ''}</span>
                ${this.renderRowContent(entry)}
              </button>
            `;
          }).join('') : '<div class="empty-hint">当前筛选下没有可丢弃物品</div>'}
        </div>
        <div class="detail-modal-actions inventory-bulk-discard-actions">
          <button class="small-btn ghost" type="button" data-bulk-discard-cancel>取消</button>
          <button class="small-btn danger" type="button" data-bulk-discard-next ${selectedCount > 0 ? '' : 'disabled'}>确认丢弃</button>
        </div>
      </div>
    `);
  }

  private bindSelectionActions(body: HTMLElement, signal: AbortSignal): void {
    body.querySelectorAll<HTMLElement>('[data-bulk-discard-filter]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const nextFilter = normalizeFilter(button.dataset.bulkDiscardFilter);
        if (nextFilter !== this.filter) {
          this.filter = nextFilter;
          this.render();
        }
      }, { signal });
    });
    body.querySelectorAll<HTMLElement>('[data-bulk-discard-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const itemInstanceId = button.dataset.bulkDiscardToggle ?? '';
        if (!itemInstanceId) {
          return;
        }
        if (this.selectedIds.has(itemInstanceId)) {
          this.selectedIds.delete(itemInstanceId);
        } else {
          this.selectedIds.add(itemInstanceId);
        }
        this.render();
      }, { signal });
    });
    body.querySelector<HTMLElement>('[data-bulk-discard-select-visible]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const inventory = this.options.getInventory();
      if (!inventory) {
        return;
      }
      for (const entry of this.getEntries(inventory)) {
        if (this.matchesFilter(entry.item)) {
          this.selectedIds.add(entry.itemInstanceId);
        }
      }
      this.render();
    }, { signal });
    body.querySelector<HTMLElement>('[data-bulk-discard-clear]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.selectedIds.clear();
      this.render();
    }, { signal });
    body.querySelector<HTMLElement>('[data-bulk-discard-cancel]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.options.closeModal();
    }, { signal });
    body.querySelector<HTMLElement>('[data-bulk-discard-next]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.selectedIds.size === 0) {
        return;
      }
      this.confirmOpen = true;
      this.render();
    }, { signal });
  }

  private renderConfirmation(inventory: Inventory): void {
    const selectedEntries = this.getSelectedEntries(inventory);
    if (selectedEntries.length === 0) {
      this.confirmOpen = false;
      this.render();
      return;
    }
    detailModalHost.open({
      ownerId: this.options.ownerId,
      variantClass: 'detail-modal--inventory-bulk-discard',
      title: '确认丢弃',
      subtitle: `将丢弃 ${formatDisplayInteger(selectedEntries.length)} 组物品`,
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => {
        replaceElementHtml(body, `
          <div class="inventory-bulk-discard-confirm">
            <div class="inventory-bulk-discard-warning">确认后会把选中的所有堆叠全部丢弃，不能选择数量。</div>
            <div class="inventory-bulk-discard-list inventory-bulk-discard-list--confirm">
              ${selectedEntries.map((entry) => `
                <div class="inventory-bulk-discard-row selected">
                  <span class="inventory-bulk-discard-check">✓</span>
                  ${this.renderRowContent(entry)}
                </div>
              `).join('')}
            </div>
            <div class="detail-modal-actions inventory-bulk-discard-actions">
              <button class="small-btn ghost" type="button" data-bulk-discard-back>返回选择</button>
              <button class="small-btn danger" type="button" data-bulk-discard-confirm>确认丢弃</button>
            </div>
          </div>
        `);
      },
      onClose: () => this.handleHostClose(),
      onAfterRender: (body, signal) => {
        body.querySelector<HTMLElement>('[data-bulk-discard-back]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.confirmOpen = false;
          this.render();
        }, { signal });
        body.querySelector<HTMLElement>('[data-bulk-discard-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const itemInstanceIds = this.getSelectedEntries(this.options.getInventory()).map((entry) => entry.itemInstanceId);
          if (itemInstanceIds.length === 0) {
            this.confirmOpen = false;
            this.render();
            return;
          }
          this.options.dropItems(itemInstanceIds);
          this.options.closeModal();
        }, { signal });
      },
    });
    this.lastRenderKey = this.buildRenderKey(inventory);
  }

  private getEntries(inventory: Inventory | null): BulkDiscardEntry[] {
    return (inventory?.items ?? [])
      .map((item) => {
        const itemInstanceId = this.options.getItemInstanceId(item);
        if (!itemInstanceId) {
          return null;
        }
        return {
          item,
          itemInstanceId,
          name: getItemDisplayMeta(item).displayItem.name,
        };
      })
      .filter((entry): entry is BulkDiscardEntry => entry !== null);
  }

  private getSelectedEntries(inventory: Inventory | null): BulkDiscardEntry[] {
    return this.getEntries(inventory).filter((entry) => this.selectedIds.has(entry.itemInstanceId));
  }

  private pruneMissingSelections(entries: BulkDiscardEntry[]): void {
    const existingIds = new Set(entries.map((entry) => entry.itemInstanceId));
    for (const itemInstanceId of this.selectedIds) {
      if (!existingIds.has(itemInstanceId)) {
        this.selectedIds.delete(itemInstanceId);
      }
    }
  }

  private matchesFilter(item: ItemStack): boolean {
    return matchesInventoryTypeFilter(item.type, this.filter);
  }

  private renderRowContent(entry: BulkDiscardEntry): string {
    return `
      <span class="inventory-bulk-discard-info">
        <span class="inventory-bulk-discard-name">${escapeHtml(entry.name)}</span>
        <span class="inventory-bulk-discard-meta">
          <span>数量 ${formatDisplayInteger(Math.max(0, Math.floor(Number(entry.item.count) || 0)))}</span>
        </span>
      </span>
    `;
  }

  private buildRenderKey(inventory: Inventory): string {
    return [
      'bulk-discard',
      this.filter,
      this.confirmOpen ? 'confirm' : 'select',
      [...this.selectedIds].sort().join(','),
      String((inventory as { revision?: number }).revision ?? 0),
    ].join('|');
  }

  private handleHostClose(): void {
    this.reset();
    this.options.resetParentModalState();
  }
}

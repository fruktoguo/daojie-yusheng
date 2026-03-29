/**
 * 背包面板
 * 展示物品网格列表，支持分类筛选、使用/装备/丢弃操作与物品详情弹层
 */

import {
  EquipSlot,
  Inventory,
  ItemStack,
  PlayerState,
  createItemStackSignature,
} from '@mud/shared';
import {
  getEquipSlotLabel,
  getItemTypeLabel,
} from '../../domain-labels';
import {
  hasLoadedItemSourceCatalog,
  getItemSourceEntryCount,
  isSpecialSourceSummaryItem,
  preloadItemSourceCatalog,
  renderItemSourceListHtml,
} from '../../content/item-sources';
import { resolvePreviewItem, resolveTechniqueIdFromBookItemId } from '../../content/local-templates';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildItemTooltipPayload, describeItemEffectDetails } from '../equipment-tooltip';
import { preserveSelection } from '../selection-preserver';
import { describePreviewBonuses } from '../stat-preview';
import { INVENTORY_FILTER_TABS, InventoryFilter } from '../../constants/ui/inventory';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import {
  INVENTORY_PANEL_TOOLTIP_STYLE_ID,
  INVENTORY_PANEL_USABLE_ITEM_TYPES,
} from '../../constants/ui/inventory-panel';

type InventoryActionKind = 'use' | 'drop' | 'destroy';

interface InventoryActionDialogState {
  kind: InventoryActionKind;
  slotIndex: number;
  defaultCount: number;
  confirmDestroy: boolean;
}

interface InventoryStructureState {
  filter: InventoryFilter;
  items: Array<{ slotIndex: number; identity: string }>;
}

interface InventoryPrimaryAction {
  label: string;
  kind: 'use' | 'equip' | 'status';
  disabled?: boolean;
}

const INVENTORY_SOURCE_COLLAPSED_COUNT = 3;

function formatItemEffects(item: ItemStack): string[] {
  return describeItemEffectDetails(item);
}

/** 背包面板：显示物品列表，支持使用和丢弃 */
export class InventoryPanel {
  private static readonly MODAL_OWNER = 'inventory-panel';
  private pane = document.getElementById('pane-inventory')!;
  private onUseItem: ((slotIndex: number, count?: number) => void) | null = null;
  private onDropItem: ((slotIndex: number, count: number) => void) | null = null;
  private onDestroyItem: ((slotIndex: number, count: number) => void) | null = null;
  private onEquipItem: ((slotIndex: number) => void) | null = null;
  private onSortInventory: (() => void) | null = null;
  private tooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  private activeFilter: InventoryFilter = 'all';
  private lastInventory: Inventory | null = null;
  private lastStructureState: InventoryStructureState | null = null;
  private selectedSlotIndex: number | null = null;
  private selectedItemKey: string | null = null;
  private actionDialog: InventoryActionDialogState | null = null;
  private lastModalRenderKey: string | null = null;
  private tooltipCell: HTMLElement | null = null;
  private sourceExpanded = false;
  private sourceExpandedItemKey: string | null = null;
  private learnedTechniqueIds = new Set<string>();
  private unlockedMinimapIds = new Set<string>();
  private equippedItemsBySlot: Partial<Record<EquipSlot, ItemStack>> = {};

  constructor() {
    this.ensureTooltipStyle();
    this.bindPaneEvents();
    this.bindTooltipEvents();
  }

  clear(): void {
    this.activeFilter = 'all';
    this.lastInventory = null;
    this.lastStructureState = null;
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.actionDialog = null;
    this.lastModalRenderKey = null;
    this.tooltipCell = null;
    this.sourceExpanded = false;
    this.sourceExpandedItemKey = null;
    this.learnedTechniqueIds.clear();
    this.unlockedMinimapIds.clear();
    this.equippedItemsBySlot = {};
    this.tooltip.hide(true);
    this.pane.innerHTML = '<div class="empty-hint">背包空空如也</div>';
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }

  setCallbacks(
    onUse: (slotIndex: number, count?: number) => void,
    onDrop: (slotIndex: number, count: number) => void,
    onDestroy: (slotIndex: number, count: number) => void,
    onEquip: (slotIndex: number) => void,
    onSort: () => void,
  ): void {
    this.onUseItem = onUse;
    this.onDropItem = onDrop;
    this.onDestroyItem = onDestroy;
    this.onEquipItem = onEquip;
    this.onSortInventory = onSort;
  }

  /** 更新背包数据并刷新列表与弹层 */
  update(inventory: Inventory): void {
    this.lastInventory = inventory;
    const structureState = this.buildStructureState(inventory);
    if (!this.isSameStructureState(this.lastStructureState, structureState) || !this.patchList(inventory)) {
      this.render(inventory);
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  initFromPlayer(player: PlayerState): void {
    this.syncPlayerContext(player);
    this.update(player.inventory);
  }

  syncPlayerContext(player?: Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds'>): void {
    if (!player) {
      this.learnedTechniqueIds.clear();
      this.unlockedMinimapIds.clear();
      this.equippedItemsBySlot = {};
    } else {
      this.learnedTechniqueIds = new Set(
        (player.techniques ?? [])
          .map((technique) => technique.techId)
          .filter((techId): techId is string => typeof techId === 'string' && techId.length > 0),
      );
      this.unlockedMinimapIds = new Set(
        (player.unlockedMinimapIds ?? [])
          .filter((mapId): mapId is string => typeof mapId === 'string' && mapId.length > 0),
      );
      this.equippedItemsBySlot = {};
      for (const slot of ['weapon', 'head', 'body', 'legs', 'accessory'] as const) {
        const equippedItem = player.equipment?.[slot];
        if (equippedItem) {
          this.equippedItemsBySlot[slot] = equippedItem;
        }
      }
    }
    if (this.lastInventory) {
      this.update(this.lastInventory);
    }
  }

  private render(inventory: Inventory): void {
    this.lastInventory = inventory;
    const visibleItems = this.getVisibleItems(inventory);
    this.lastStructureState = this.buildStructureStateFromVisibleItems(visibleItems);

    let html = `<div class="panel-section">
      <div class="inventory-panel-head">
        <div class="panel-section-title" data-inventory-title="true">背包 (${formatDisplayInteger(inventory.items.length)}/${formatDisplayInteger(inventory.capacity)})</div>
        <button class="small-btn" data-sort-inventory type="button">一键整理</button>
      </div>
      <div class="inventory-filter-tabs">`;

    for (const tab of INVENTORY_FILTER_TABS) {
      html += `<button class="inventory-filter-tab ${this.activeFilter === tab.id ? 'active' : ''}" data-filter-button="${tab.id}" data-filter="${tab.id}" type="button">${tab.label}</button>`;
    }

    html += '</div>';

    if (visibleItems.length === 0) {
      html += `<div class="empty-hint" data-inventory-empty="true">${inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品'}</div>`;
      html += '</div>';
      preserveSelection(this.pane, () => {
        this.pane.innerHTML = html;
      });
      return;
    }

    html += '<div class="inventory-grid" data-inventory-grid="true">';

    visibleItems.forEach(({ item, slotIndex }) => {
      const nameClass = this.getNameClass(item.name);
      const primaryAction = this.getPrimaryAction(item);
      html += `<div class="inventory-cell" data-open-item="${slotIndex}" data-item-slot="${slotIndex}" data-item-key="${this.escapeHtml(this.getItemIdentity(item))}">
        <div class="inventory-cell-head">
          <span class="inventory-cell-type" data-item-type="true">${getItemTypeLabel(item.type)}</span>
          <span class="inventory-cell-count" data-item-count="true">${formatDisplayCountBadge(item.count)}</span>
        </div>
        <div class="inventory-cell-name ${nameClass}" data-item-name="true" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</div>
        <div class="inventory-cell-actions">
          ${primaryAction ? `<button class="small-btn" data-inline-primary="${slotIndex}" data-item-primary="true" type="button" ${primaryAction.disabled ? 'disabled' : ''}>${primaryAction.label}</button>` : ''}
          <button class="small-btn danger" data-inline-drop="${slotIndex}" type="button">丢下</button>
        </div>
      </div>`;
    });

    html += '</div></div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
    });
  }

  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const filterButton = target.closest<HTMLElement>('[data-filter-button]');
      if (filterButton) {
        const filter = filterButton.dataset.filter as InventoryFilter | undefined;
        if (!filter || filter === this.activeFilter) {
          return;
        }
        this.activeFilter = filter;
        if (this.lastInventory) {
          this.render(this.lastInventory);
        }
        return;
      }

      if (target.closest('[data-sort-inventory]')) {
        this.onSortInventory?.();
        return;
      }

      const primaryButton = target.closest<HTMLElement>('[data-inline-primary]');
      if (primaryButton) {
        event.stopPropagation();
        const rawIndex = primaryButton.dataset.inlinePrimary;
        if (!rawIndex) {
          return;
        }
        const slotIndex = parseInt(rawIndex, 10);
        const item = this.lastInventory?.items[slotIndex];
        const action = item ? this.getPrimaryAction(item) : null;
        if (!action || action.kind === 'status') {
          return;
        }
        if (action.kind === 'equip') {
          this.onEquipItem?.(slotIndex);
          return;
        }
        this.onUseItem?.(slotIndex);
        return;
      }

      const dropButton = target.closest<HTMLElement>('[data-inline-drop]');
      if (dropButton) {
        event.stopPropagation();
        const rawIndex = dropButton.dataset.inlineDrop;
        if (!rawIndex) {
          return;
        }
        this.onDropItem?.(parseInt(rawIndex, 10), 1);
        return;
      }

      const cell = target.closest<HTMLElement>('[data-open-item]');
      if (!cell) {
        return;
      }
      const rawIndex = cell.dataset.openItem;
      if (!rawIndex) {
        return;
      }
      this.selectedSlotIndex = parseInt(rawIndex, 10);
      const item = this.lastInventory?.items[this.selectedSlotIndex];
      this.selectedItemKey = item ? this.getItemIdentity(item) : null;
      this.tooltip.hide();
      this.tooltipCell = null;
      this.renderModal();
    });
  }

  private bindTooltipEvents(): void {
    const tapMode = prefersPinnedTooltipInteraction();
    const show = (cell: HTMLElement, event: PointerEvent) => {
      const rawIndex = cell.dataset.itemSlot;
      if (!rawIndex || !this.lastInventory) {
        return;
      }
      const slotIndex = parseInt(rawIndex, 10);
      const item = this.lastInventory.items[slotIndex];
      if (!item) {
        return;
      }
      const tooltip = this.buildTooltipPayload(item);
      this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
        allowHtml: tooltip.allowHtml,
        asideCards: tooltip.asideCards,
      });
    };

    this.pane.addEventListener('click', (event) => {
      if (!tapMode) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const cell = target.closest<HTMLElement>('.inventory-cell');
      if (!cell) {
        return;
      }
      if (this.tooltip.isPinnedTo(cell)) {
        this.tooltipCell = null;
        this.tooltip.hide(true);
        return;
      }
      const rawIndex = cell.dataset.itemSlot;
      if (!rawIndex || !this.lastInventory) {
        return;
      }
      const slotIndex = parseInt(rawIndex, 10);
      const item = this.lastInventory.items[slotIndex];
      if (!item) {
        return;
      }
      const tooltip = this.buildTooltipPayload(item);
      this.tooltipCell = cell;
      this.tooltip.showPinned(cell, tooltip.title, tooltip.lines, event.clientX, event.clientY, {
        allowHtml: tooltip.allowHtml,
        asideCards: tooltip.asideCards,
      });
      event.preventDefault();
      event.stopPropagation();
    }, true);

    this.pane.addEventListener('pointermove', (event) => {
      if (tapMode && this.tooltip.isPinned()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        if (this.tooltipCell) {
          this.tooltipCell = null;
          this.tooltip.hide();
        }
        return;
      }

      const cell = target.closest<HTMLElement>('.inventory-cell');
      if (!cell) {
        if (this.tooltipCell) {
          this.tooltipCell = null;
          this.tooltip.hide();
        }
        return;
      }

      if (this.tooltipCell !== cell) {
        this.tooltipCell = cell;
        show(cell, event);
        return;
      }

      this.tooltip.move(event.clientX, event.clientY);
    });
    this.pane.addEventListener('pointerleave', () => {
      this.tooltipCell = null;
      this.tooltip.hide();
    });
    this.pane.addEventListener('pointerdown', () => {
      if (this.tooltipCell) {
        this.tooltipCell = null;
        this.tooltip.hide();
      }
    });
  }

  private ensureTooltipStyle(): void {
    if (document.getElementById(INVENTORY_PANEL_TOOLTIP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = INVENTORY_PANEL_TOOLTIP_STYLE_ID;
    style.textContent = `
      .inventory-tooltip {
        position: fixed;
        pointer-events: none;
        font-size: var(--font-size-13);
        color: var(--ink-black);
        z-index: 2000;
        opacity: 0;
        transition: opacity 120ms ease;
        min-width: 0;
      }
      .inventory-tooltip.visible {
        opacity: 1;
      }
      .inventory-tooltip .floating-tooltip-body {
        min-width: 160px;
      }
      .inventory-tooltip .floating-tooltip-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.4;
      }
      .inventory-tooltip .floating-tooltip-body strong {
        display: block;
      }
      .inventory-tooltip .floating-tooltip-detail {
        display: flex;
        flex-direction: column;
        gap: 2px;
        color: var(--ink-grey);
      }
      .inventory-tooltip .floating-tooltip-line {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  private renderModal(): void {
    if (!this.lastInventory || !this.selectedItemKey) {
      detailModalHost.close(InventoryPanel.MODAL_OWNER);
      return;
    }

    const resolved = this.resolveSelectedItem(this.lastInventory);
    if (!resolved) {
      this.closeModal();
      return;
    }

    const { item, slotIndex } = resolved;
    if (this.actionDialog && this.actionDialog.slotIndex !== slotIndex) {
      this.actionDialog = null;
    }
    if (this.actionDialog) {
      this.renderActionDialog(item, slotIndex, this.actionDialog);
      return;
    }

    const previewItem = resolvePreviewItem(item);
    if (!hasLoadedItemSourceCatalog()) {
      const pendingItemKey = this.selectedItemKey;
      void preloadItemSourceCatalog().then(() => {
        if (!this.lastInventory || !pendingItemKey || this.selectedItemKey !== pendingItemKey || this.actionDialog) {
          return;
        }
        this.renderModal();
      });
    }
    if (this.sourceExpandedItemKey !== this.selectedItemKey) {
      this.sourceExpanded = false;
      this.sourceExpandedItemKey = this.selectedItemKey;
    }
    const bonusLines = describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
    const effectLines = formatItemEffects(item);
    const primaryAction = this.getPrimaryAction(item);
    const statusLabel = this.getItemStatusLabel(item);
    const canBatchUse = primaryAction?.kind === 'use' && this.canBatchUseItem(item);
    const canBatchDropOrDestroy = this.canBatchDropOrDestroy(item);
    const sourceEntryCount = getItemSourceEntryCount(previewItem.itemId);
    const useSpecialSourceSummary = isSpecialSourceSummaryItem(previewItem.itemId);
    const canToggleSourceList = !useSpecialSourceSummary && sourceEntryCount > INVENTORY_SOURCE_COLLAPSED_COUNT;
    const sourceListHtml = renderItemSourceListHtml(previewItem.itemId, {
      maxEntries: this.sourceExpanded || !canToggleSourceList ? undefined : INVENTORY_SOURCE_COLLAPSED_COUNT,
    });

    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      title: item.name,
      subtitle: `${getItemTypeLabel(item.type)} · 数量 ${formatDisplayCountBadge(item.count)}`,
      bodyHtml: `
        <div class="quest-detail-grid inventory-detail-grid">
          <div class="quest-detail-section">
            <strong>物品类型</strong>
            <span data-inventory-modal-type="true">${this.escapeHtml(getItemTypeLabel(item.type))}</span>
          </div>
          <div class="quest-detail-section">
            <strong>当前数量</strong>
            <span data-inventory-modal-count="true">${formatDisplayCountBadge(item.count)}</span>
          </div>
          ${item.equipSlot ? `<div class="quest-detail-section">
            <strong>装备部位</strong>
            <span data-inventory-modal-slot="true">${this.escapeHtml(getEquipSlotLabel(item.equipSlot))}</span>
          </div>` : ''}
        </div>
        <div class="quest-detail-section">
          <strong>物品说明</strong>
          <span data-inventory-modal-desc="true">${this.escapeHtml(previewItem.desc)}</span>
        </div>
        ${statusLabel ? `<div class="quest-detail-section">
          <strong>当前状态</strong>
          <span data-inventory-modal-status="true">${this.escapeHtml(statusLabel)}</span>
        </div>` : ''}
        ${bonusLines.length > 0 ? `<div class="quest-detail-section">
          <strong>附加词条</strong>
          <span data-inventory-modal-bonuses="true">${this.escapeHtml(bonusLines.join(' / '))}</span>
        </div>` : ''}
        ${effectLines.length > 0 ? `<div class="quest-detail-section">
          <strong>特殊效果</strong>
          <span data-inventory-modal-effects="true">${this.escapeHtml(effectLines.join(' / '))}</span>
        </div>` : ''}
        <div class="quest-detail-section inventory-source-section">
          <strong>来源</strong>
          ${sourceListHtml}
          ${canToggleSourceList
            ? `<button class="small-btn ghost inventory-source-toggle" data-inventory-source-toggle="true" type="button">${this.sourceExpanded ? '收起来源' : `展开全部来源（${sourceEntryCount}）`}</button>`
            : ''}
        </div>
        <div class="inventory-detail-actions">
          <div class="inventory-detail-actions-group inventory-detail-actions-group--left">
            ${primaryAction ? `<button class="small-btn" data-inventory-primary="true" type="button" ${primaryAction.disabled ? 'disabled' : ''}>${primaryAction.label}</button>` : ''}
            ${canBatchUse ? `<button class="small-btn ghost" data-inventory-open-action="use" data-default-count="1" type="button">批量使用</button>` : ''}
          </div>
          <div class="inventory-detail-actions-group inventory-detail-actions-group--right">
            <button class="small-btn ghost" data-inventory-open-action="drop" data-default-count="1" type="button">丢下</button>
            ${canBatchDropOrDestroy ? `<button class="small-btn ghost" data-inventory-open-action="drop" data-default-count="${item.count}" type="button">批量丢下</button>` : ''}
            <button class="small-btn danger" data-inventory-open-action="destroy" data-default-count="1" type="button">摧毁</button>
            ${canBatchDropOrDestroy ? `<button class="small-btn danger" data-inventory-open-action="destroy" data-default-count="${item.count}" type="button">批量摧毁</button>` : ''}
          </div>
        </div>
      `,
      onClose: () => {
        this.resetModalState();
      },
      onAfterRender: (body) => {
        body.querySelector<HTMLElement>('[data-inventory-primary]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!primaryAction || primaryAction.kind === 'status') {
            return;
          }
          if (primaryAction?.kind === 'equip') {
            this.onEquipItem?.(slotIndex);
            this.closeModal();
            return;
          }
          this.onUseItem?.(slotIndex, 1);
          this.closeModal();
        });
        body.querySelectorAll<HTMLElement>('[data-inventory-open-action]').forEach((button) => button.addEventListener('click', (event) => {
          event.stopPropagation();
          const kind = button.dataset.inventoryOpenAction as InventoryActionKind | undefined;
          const defaultCount = Number.parseInt(button.dataset.defaultCount ?? '1', 10);
          if (!kind) {
            return;
          }
          this.openActionDialog(kind, slotIndex, Number.isFinite(defaultCount) ? defaultCount : 1);
        }));
        body.querySelector<HTMLElement>('[data-inventory-source-toggle="true"]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.sourceExpanded = !this.sourceExpanded;
          this.renderModal();
        });
      },
    });
    this.lastModalRenderKey = this.buildModalRenderKey(item);
  }

  private renderActionDialog(item: ItemStack, slotIndex: number, dialog: InventoryActionDialogState): void {
    const labels = this.resolveActionLabels(dialog.kind);
    const maxCount = item.count;
    const halfCount = Math.max(1, Math.ceil(maxCount / 2));
    const selectedCount = Math.max(1, Math.min(maxCount, dialog.defaultCount));

    if (dialog.confirmDestroy) {
      detailModalHost.open({
        ownerId: InventoryPanel.MODAL_OWNER,
        title: '确认摧毁',
        subtitle: `${item.name} · 数量 ${formatDisplayCountBadge(selectedCount)}`,
        hint: '点击空白处取消',
        bodyHtml: `
          <div class="panel-section">
            <div class="empty-hint">摧毁后物品会永久消失，无法找回。</div>
          </div>
          <div class="inventory-detail-actions">
            <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
              <button class="small-btn ghost" type="button" data-inventory-destroy-back>返回修改数量</button>
              <button class="small-btn danger" type="button" data-inventory-destroy-confirm>确认摧毁</button>
            </div>
          </div>
        `,
        onClose: () => {
          this.resetModalState();
        },
        onAfterRender: (body) => {
          body.querySelector<HTMLElement>('[data-inventory-destroy-back]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.actionDialog = {
              ...dialog,
              confirmDestroy: false,
            };
            this.renderModal();
          });
          body.querySelector<HTMLElement>('[data-inventory-destroy-confirm]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.onDestroyItem?.(slotIndex, selectedCount);
            this.closeModal();
          });
        },
      });
      this.lastModalRenderKey = this.buildModalRenderKey(item);
      return;
    }

    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      title: labels.title,
      subtitle: `${item.name} · 当前最多 ${formatDisplayInteger(maxCount)} 个`,
      hint: '点击空白处取消',
      bodyHtml: `
        <div class="quest-detail-section">
          <strong>选择数量</strong>
          <div class="inventory-batch-use-row inventory-batch-use-row--dialog">
            <button class="small-btn ghost" type="button" data-inventory-quick-count="1">1 个</button>
            <button class="small-btn ghost" type="button" data-inventory-quick-count="${halfCount}">一半</button>
            <button class="small-btn ghost" type="button" data-inventory-quick-count="${maxCount}">全部</button>
            <input
              class="gm-inline-input"
              data-inventory-action-count="true"
              type="number"
              min="1"
              max="${maxCount}"
              step="1"
              value="${selectedCount}"
              inputmode="numeric"
            />
          </div>
        </div>
        <div class="inventory-detail-actions">
          <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
            <button class="small-btn ghost" type="button" data-inventory-action-cancel>返回详情</button>
            <button class="small-btn ${labels.danger ? 'danger' : ''}" type="button" data-inventory-action-confirm>${labels.confirm}</button>
          </div>
        </div>
      `,
      onClose: () => {
        this.resetModalState();
      },
      onAfterRender: (body) => {
        const countInput = body.querySelector<HTMLInputElement>('[data-inventory-action-count="true"]');
        this.syncActionCountInputWidth(countInput, maxCount);
        countInput?.addEventListener('input', () => {
          const nextValue = String(this.getUseCountFromInput(countInput, maxCount));
          if (countInput.value !== nextValue) {
            countInput.value = nextValue;
          }
          this.syncActionCountInputWidth(countInput, maxCount);
        });
        body.querySelectorAll<HTMLElement>('[data-inventory-quick-count]').forEach((button) => button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!countInput) {
            return;
          }
          countInput.value = button.dataset.inventoryQuickCount ?? '1';
          this.syncActionCountInputWidth(countInput, maxCount);
        }));
        body.querySelector<HTMLElement>('[data-inventory-action-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.actionDialog = null;
          this.renderModal();
        });
        body.querySelector<HTMLElement>('[data-inventory-action-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const selected = this.getUseCountFromInput(countInput, maxCount);
          if (dialog.kind === 'use') {
            this.onUseItem?.(slotIndex, selected);
            this.closeModal();
            return;
          }
          if (dialog.kind === 'drop') {
            this.onDropItem?.(slotIndex, selected);
            this.closeModal();
            return;
          }
          this.actionDialog = {
            ...dialog,
            defaultCount: selected,
            confirmDestroy: true,
          };
          this.renderModal();
        });
      },
    });
    this.lastModalRenderKey = this.buildModalRenderKey(item);
  }

  private patchList(inventory: Inventory): boolean {
    const titleNode = this.pane.querySelector<HTMLElement>('[data-inventory-title="true"]');
    if (!titleNode) {
      return false;
    }
    titleNode.textContent = `背包 (${formatDisplayInteger(inventory.items.length)}/${formatDisplayInteger(inventory.capacity)})`;

    for (const tab of INVENTORY_FILTER_TABS) {
      const button = this.pane.querySelector<HTMLElement>(`[data-filter-button="${CSS.escape(tab.id)}"]`);
      if (!button) {
        return false;
      }
      button.classList.toggle('active', this.activeFilter === tab.id);
    }

    const visibleItems = this.getVisibleItems(inventory);
    if (visibleItems.length === 0) {
      const emptyNode = this.pane.querySelector<HTMLElement>('[data-inventory-empty="true"]');
      if (!emptyNode) {
        return false;
      }
      emptyNode.textContent = inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品';
      this.lastStructureState = this.buildStructureStateFromVisibleItems(visibleItems);
      return true;
    }

    const grid = this.pane.querySelector<HTMLElement>('[data-inventory-grid="true"]');
    if (!grid) {
      return false;
    }

    for (const { item, slotIndex } of visibleItems) {
      const cell = grid.querySelector<HTMLElement>(`[data-item-slot="${CSS.escape(String(slotIndex))}"]`);
      if (!cell) {
        return false;
      }

      const typeNode = cell.querySelector<HTMLElement>('[data-item-type="true"]');
      const countNode = cell.querySelector<HTMLElement>('[data-item-count="true"]');
      const nameNode = cell.querySelector<HTMLElement>('[data-item-name="true"]');
      if (!typeNode || !countNode || !nameNode) {
        return false;
      }

      const primaryAction = this.getPrimaryAction(item);
      const primaryButton = cell.querySelector<HTMLButtonElement>('[data-item-primary="true"]');

      cell.dataset.itemKey = this.getItemIdentity(item);
      typeNode.textContent = getItemTypeLabel(item.type);
      countNode.textContent = formatDisplayCountBadge(item.count);
      nameNode.textContent = item.name;
      nameNode.title = item.name;
      nameNode.className = `inventory-cell-name ${this.getNameClass(item.name)}`.trim();

      if (primaryAction) {
        if (!primaryButton) {
          return false;
        }
        primaryButton.textContent = primaryAction.label;
        primaryButton.dataset.inlinePrimary = String(slotIndex);
        primaryButton.disabled = primaryAction.disabled === true;
      } else if (primaryButton) {
        return false;
      }
    }

    this.lastStructureState = this.buildStructureStateFromVisibleItems(visibleItems);
    return true;
  }

  private patchModal(): boolean {
    if (!this.lastInventory || !this.selectedItemKey) {
      this.lastModalRenderKey = null;
      detailModalHost.close(InventoryPanel.MODAL_OWNER);
      return true;
    }
    if (!detailModalHost.isOpenFor(InventoryPanel.MODAL_OWNER)) {
      this.lastModalRenderKey = null;
      return false;
    }

    const resolved = this.resolveSelectedItem(this.lastInventory);
    if (!resolved) {
      this.closeModal();
      return true;
    }
    return this.lastModalRenderKey === this.buildModalRenderKey(resolved.item);
  }

  private resolveSelectedItem(inventory: Inventory): { item: ItemStack; slotIndex: number } | null {
    if (!this.selectedItemKey) {
      return null;
    }

    if (this.selectedSlotIndex !== null) {
      const current = inventory.items[this.selectedSlotIndex];
      if (current && this.getItemIdentity(current) === this.selectedItemKey) {
        return { item: current, slotIndex: this.selectedSlotIndex };
      }
    }

    const slotIndex = inventory.items.findIndex((item) => this.getItemIdentity(item) === this.selectedItemKey);
    if (slotIndex < 0) {
      return null;
    }
    this.selectedSlotIndex = slotIndex;
    return { item: inventory.items[slotIndex], slotIndex };
  }

  private canUseItem(item: ItemStack): boolean {
    return INVENTORY_PANEL_USABLE_ITEM_TYPES.has(item.type);
  }

  private canBatchUseItem(item: ItemStack): boolean {
    return item.allowBatchUse === true && this.canUseItem(item) && item.count > 1;
  }

  private getUseCountFromInput(input: HTMLInputElement | null, maxCount: number): number {
    const rawValue = input?.value ?? '1';
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(maxCount, parsed));
  }

  private syncActionCountInputWidth(input: HTMLInputElement | null, maxCount: number): void {
    if (!input) {
      return;
    }
    const valueLength = Math.max(1, input.value.trim().length);
    const maxLength = Math.max(1, String(maxCount).length);
    const chars = Math.max(4, valueLength, maxLength) + 1;
    input.style.width = `calc(${chars}ch + 18px)`;
  }

  private canBatchDropOrDestroy(item: ItemStack): boolean {
    return item.count > 1;
  }

  private openActionDialog(kind: InventoryActionKind, slotIndex: number, defaultCount: number): void {
    this.actionDialog = {
      kind,
      slotIndex,
      defaultCount: Math.max(1, defaultCount),
      confirmDestroy: false,
    };
    this.renderModal();
  }

  private resolveActionLabels(kind: InventoryActionKind): {
    title: string;
    confirm: string;
    danger: boolean;
  } {
    switch (kind) {
      case 'use':
        return { title: '批量使用', confirm: '确认使用', danger: false };
      case 'drop':
        return { title: '丢下物品', confirm: '确认丢下', danger: true };
      case 'destroy':
        return { title: '摧毁物品', confirm: '继续摧毁', danger: true };
      default:
        return { title: '操作物品', confirm: '确认', danger: false };
    }
  }

  private getPrimaryAction(item: ItemStack): InventoryPrimaryAction | null {
    const statusLabel = this.getItemStatusLabel(item);
    if (statusLabel) {
      return { label: statusLabel, kind: 'status', disabled: true };
    }
    if (item.type === 'equipment') {
      return { label: '装备', kind: 'equip' };
    }
    if (item.type === 'skill_book') {
      return { label: '学习', kind: 'use' };
    }
    if (this.canUseItem(item)) {
      return { label: '使用', kind: 'use' };
    }
    return null;
  }

  private getItemStatusLabel(item: ItemStack): string | null {
    if (item.type === 'skill_book') {
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
      if (techniqueId && this.learnedTechniqueIds.has(techniqueId)) {
        return '已学';
      }
    }
    if (item.mapUnlockId && this.unlockedMinimapIds.has(item.mapUnlockId)) {
      return '已阅';
    }
    return null;
  }

  private getEquippedItemForCompare(item: ItemStack): ItemStack | null {
    if (item.type !== 'equipment' || !item.equipSlot) {
      return null;
    }
    return this.equippedItemsBySlot[item.equipSlot] ?? null;
  }

  private getNameClass(name: string): string {
    const length = [...name].length;
    if (length >= 7) {
      return 'inventory-cell-name--tiny';
    }
    if (length >= 5) {
      return 'inventory-cell-name--compact';
    }
    return '';
  }

  private getItemIdentity(item: ItemStack): string {
    return createItemStackSignature(item);
  }

  private getVisibleItems(inventory: Inventory): Array<{ item: ItemStack; slotIndex: number }> {
    return inventory.items
      .map((item, slotIndex) => ({ item, slotIndex }))
      .filter(({ item }) => this.activeFilter === 'all' || item.type === this.activeFilter);
  }

  private buildStructureState(inventory: Inventory): InventoryStructureState {
    return this.buildStructureStateFromVisibleItems(this.getVisibleItems(inventory));
  }

  private buildStructureStateFromVisibleItems(
    visibleItems: Array<{ item: ItemStack; slotIndex: number }>,
  ): InventoryStructureState {
    return {
      filter: this.activeFilter,
      items: visibleItems.map(({ item, slotIndex }) => ({
        slotIndex,
        identity: this.getItemIdentity(item),
      })),
    };
  }

  private isSameStructureState(
    previous: InventoryStructureState | null,
    next: InventoryStructureState,
  ): boolean {
    if (!previous || previous.filter !== next.filter || previous.items.length !== next.items.length) {
      return false;
    }
    for (let index = 0; index < previous.items.length; index += 1) {
      const previousItem = previous.items[index]!;
      const nextItem = next.items[index]!;
      if (previousItem.slotIndex !== nextItem.slotIndex || previousItem.identity !== nextItem.identity) {
        return false;
      }
    }
    return true;
  }

  private buildTooltipPayload(item: ItemStack) {
    return buildItemTooltipPayload({
      ...item,
      type: item.type === 'skill_book' ? 'skill_book' : item.type,
    }, {
      learnedTechniqueIds: this.learnedTechniqueIds,
      unlockedMinimapIds: this.unlockedMinimapIds,
      equippedItem: this.getEquippedItemForCompare(item),
    });
  }

  private closeModal(): void {
    this.resetModalState();
    this.tooltipCell = null;
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }

  private resetModalState(): void {
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.actionDialog = null;
    this.lastModalRenderKey = null;
    this.sourceExpanded = false;
    this.sourceExpandedItemKey = null;
  }

  private buildModalRenderKey(item: ItemStack): string {
    if (this.actionDialog) {
      return [
        'action',
        this.getItemIdentity(item),
        String(item.count),
        this.actionDialog.kind,
        this.actionDialog.confirmDestroy ? '1' : '0',
        String(this.actionDialog.defaultCount),
      ].join('|');
    }

    const equippedComparisonItem = this.getEquippedItemForCompare(item);
    const statusLabel = this.getItemStatusLabel(item) ?? '';
    return [
      'detail',
      this.getItemIdentity(item),
      String(item.count),
      statusLabel,
      this.sourceExpanded ? '1' : '0',
      hasLoadedItemSourceCatalog() ? '1' : '0',
      equippedComparisonItem ? this.getItemIdentity(equippedComparisonItem) : '',
    ].join('|');
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

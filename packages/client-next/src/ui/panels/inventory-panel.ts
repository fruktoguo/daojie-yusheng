/**
 * 背包面板
 * 展示物品网格列表，支持分类筛选、使用/装备/丢弃操作与物品详情弹层
 */

import {
  EquipSlot,
  HeavenGateState,
  HEAVEN_GATE_REROLL_COST_RATIO,
  Inventory,
  InventoryItemCooldownState,
  ItemStack,
  PlayerState,
  PlayerRealmState,
  SHATTER_SPIRIT_PILL_COST_RATIO,
  TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA,
  createItemStackSignature,
  shouldWarnTechniqueLearningDifficulty,
} from '@mud/shared-next';
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
import { getLocalTechniqueTemplate, resolvePreviewItem, resolveTechniqueIdFromBookItemId } from '../../content/local-templates';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { buildItemTooltipPayload, describeItemEffectDetails, ItemTooltipCooldownState } from '../equipment-tooltip';
import { getItemAffixTypeLabel, getItemDecorClassName, getItemDisplayMeta } from '../item-display';
import { preserveSelection } from '../selection-preserver';
import { describePreviewBonuses } from '../stat-preview';
import { INVENTORY_FILTER_TABS, InventoryFilter } from '../../constants/ui/inventory';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { resolveInventoryCooldownLeft } from '../../runtime/server-tick';
import {
  INVENTORY_PANEL_TOOLTIP_STYLE_ID,
  INVENTORY_PANEL_USABLE_ITEM_TYPES,
} from '../../constants/ui/inventory-panel';

/** InventoryActionKind：定义该类型的结构与数据语义。 */
type InventoryActionKind = 'use' | 'drop' | 'destroy';

/** InventoryActionDialogState：定义该接口的能力与字段约束。 */
interface InventoryActionDialogState {
/** kind：定义该变量以承载业务值。 */
  kind: InventoryActionKind;
/** slotIndex：定义该变量以承载业务值。 */
  slotIndex: number;
/** defaultCount：定义该变量以承载业务值。 */
  defaultCount: number;
/** confirmDestroy：定义该变量以承载业务值。 */
  confirmDestroy: boolean;
}

/** InventoryStructureState：定义该接口的能力与字段约束。 */
interface InventoryStructureState {
/** filter：定义该变量以承载业务值。 */
  filter: InventoryFilter;
/** items：定义该变量以承载业务值。 */
  items: Array<{ slotIndex: number; identity: string }>;
}

/** InventoryPrimaryAction：定义该接口的能力与字段约束。 */
interface InventoryPrimaryAction {
/** label：定义该变量以承载业务值。 */
  label: string;
/** kind：定义该变量以承载业务值。 */
  kind: 'use' | 'equip' | 'status';
  disabled?: boolean;
}

/** INVENTORY_SOURCE_COLLAPSED_COUNT：定义该变量以承载业务值。 */
const INVENTORY_SOURCE_COLLAPSED_COUNT = 3;
/** HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID：定义该变量以承载业务值。 */
const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
/** DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID：定义该变量以承载业务值。 */
const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
/** SHATTER_SPIRIT_PILL_ITEM_ID：定义该变量以承载业务值。 */
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
/** HEAVEN_GATE_REROLL_AVERAGE_BONUS：定义该变量以承载业务值。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
/** INVENTORY_INITIAL_RENDER_COUNT：定义该变量以承载业务值。 */
const INVENTORY_INITIAL_RENDER_COUNT = 72;
/** INVENTORY_RENDER_BATCH_SIZE：定义该变量以承载业务值。 */
const INVENTORY_RENDER_BATCH_SIZE = 48;
/** INVENTORY_LOAD_MORE_THRESHOLD_PX：定义该变量以承载业务值。 */
const INVENTORY_LOAD_MORE_THRESHOLD_PX = 240;

/** formatItemEffects：执行对应的业务逻辑。 */
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
/** activeFilter：定义该变量以承载业务值。 */
  private activeFilter: InventoryFilter = 'all';
/** lastInventory：定义该变量以承载业务值。 */
  private lastInventory: Inventory | null = null;
/** lastStructureState：定义该变量以承载业务值。 */
  private lastStructureState: InventoryStructureState | null = null;
/** selectedSlotIndex：定义该变量以承载业务值。 */
  private selectedSlotIndex: number | null = null;
/** selectedItemKey：定义该变量以承载业务值。 */
  private selectedItemKey: string | null = null;
/** actionDialog：定义该变量以承载业务值。 */
  private actionDialog: InventoryActionDialogState | null = null;
/** lastModalRenderKey：定义该变量以承载业务值。 */
  private lastModalRenderKey: string | null = null;
/** tooltipCell：定义该变量以承载业务值。 */
  private tooltipCell: HTMLElement | null = null;
  private sourceExpanded = false;
/** sourceExpandedItemKey：定义该变量以承载业务值。 */
  private sourceExpandedItemKey: string | null = null;
  private learnedTechniqueIds = new Set<string>();
  private unlockedMinimapIds = new Set<string>();
/** equippedItemsBySlot：定义该变量以承载业务值。 */
  private equippedItemsBySlot: Partial<Record<EquipSlot, ItemStack>> = {};
/** playerRealm：定义该变量以承载业务值。 */
  private playerRealm: PlayerRealmState | null = null;
/** playerHeavenGate：定义该变量以承载业务值。 */
  private playerHeavenGate: HeavenGateState | null = null;
  private playerFoundation = 0;
  private renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
/** pendingLoadMoreFrame：定义该变量以承载业务值。 */
  private pendingLoadMoreFrame: number | null = null;
/** cooldownRefreshTimer：定义该变量以承载业务值。 */
  private cooldownRefreshTimer: number | null = null;
/** handleScrollCapture：将函数作为字段暴露，承接调用行为。 */
  private handleScrollCapture = (event: Event) => {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target !== this.pane && !target.contains(this.pane)) {
      return;
    }
    this.maybeLoadMoreVisibleItems(target);
  };

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
    this.ensureTooltipStyle();
    this.bindPaneEvents();
    this.bindTooltipEvents();
    document.addEventListener('scroll', this.handleScrollCapture, { capture: true, passive: true });
  }

/** clear：执行对应的业务逻辑。 */
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
    this.playerRealm = null;
    this.playerHeavenGate = null;
    this.playerFoundation = 0;
    this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
    if (this.pendingLoadMoreFrame !== null) {
      cancelAnimationFrame(this.pendingLoadMoreFrame);
      this.pendingLoadMoreFrame = null;
    }
    if (this.cooldownRefreshTimer !== null) {
      window.clearTimeout(this.cooldownRefreshTimer);
      this.cooldownRefreshTimer = null;
    }
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
    this.syncRenderedVisibleCount(this.getVisibleItems(inventory).length);
/** structureState：定义该变量以承载业务值。 */
    const structureState = this.buildStructureState(inventory);
    if (!this.isSameStructureState(this.lastStructureState, structureState) || !this.patchList(inventory)) {
      this.render(inventory);
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
    this.scheduleLoadMoreCheck();
    this.syncCooldownRefresh();
  }

/** initFromPlayer：执行对应的业务逻辑。 */
  initFromPlayer(player: PlayerState): void {
    this.syncPlayerContext(player);
    this.update(player.inventory);
  }

  syncPlayerContext(
    player?: Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds' | 'realm' | 'heavenGate' | 'foundation'>,
  ): void {
    if (!player) {
      this.learnedTechniqueIds.clear();
      this.unlockedMinimapIds.clear();
      this.equippedItemsBySlot = {};
      this.playerRealm = null;
      this.playerHeavenGate = null;
      this.playerFoundation = 0;
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
      this.playerRealm = player.realm ?? null;
      this.playerHeavenGate = player.realm?.heavenGate ?? player.heavenGate ?? null;
      this.playerFoundation = Math.max(0, Math.floor(player.foundation ?? 0));
    }
    if (this.lastInventory) {
      this.update(this.lastInventory);
    }
  }

/** render：执行对应的业务逻辑。 */
  private render(inventory: Inventory): void {
    this.lastInventory = inventory;
/** visibleItems：定义该变量以承载业务值。 */
    const visibleItems = this.getVisibleItems(inventory);
/** cooldownStateMap：定义该变量以承载业务值。 */
    const cooldownStateMap = this.getCooldownStateMap(inventory);
    this.syncRenderedVisibleCount(visibleItems.length);
/** renderedItems：定义该变量以承载业务值。 */
    const renderedItems = visibleItems.slice(0, this.renderedVisibleCount);
    this.lastStructureState = this.buildStructureStateFromVisibleItems(renderedItems);

/** html：定义该变量以承载业务值。 */
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

    renderedItems.forEach(({ item, slotIndex }) => {
/** nameClass：定义该变量以承载业务值。 */
      const nameClass = this.getNameClass(item.name);
/** primaryAction：定义该变量以承载业务值。 */
      const primaryAction = this.getPrimaryAction(item);
/** itemMeta：定义该变量以承载业务值。 */
      const itemMeta = getItemDisplayMeta(item);
/** cooldownState：定义该变量以承载业务值。 */
      const cooldownState = cooldownStateMap.get(item.itemId) ?? null;
      html += `<div class="${getItemDecorClassName('inventory-cell', item)}${cooldownState ? ' inventory-cell--cooldown' : ''}" data-open-item="${slotIndex}" data-item-slot="${slotIndex}" data-item-key="${this.escapeHtml(this.getItemIdentity(item))}"${itemMeta.grade ? ` data-item-grade="${itemMeta.grade}"` : ''}>
        <div class="inventory-cell-cooldown" data-item-cooldown="true"${cooldownState ? ` title="${this.escapeHtml(this.getItemCooldownTitle(cooldownState))}"` : ' hidden'}>
          <span class="inventory-cell-cooldown-pie" data-item-cooldown-pie="true" style="--inventory-cooldown-progress:${this.getItemCooldownRatio(cooldownState).toFixed(4)};"></span>
          <span class="inventory-cell-cooldown-label" data-item-cooldown-label="true">${cooldownState ? formatDisplayInteger(this.getItemCooldownRemainingTicks(cooldownState)) : ''}</span>
        </div>
        <div class="inventory-cell-head">
          <span class="inventory-cell-type" data-item-type="true">${this.escapeHtml(getItemAffixTypeLabel(item, getItemTypeLabel(item.type)))}</span>
          <span class="inventory-cell-count" data-item-count="true">${formatDisplayCountBadge(item.count)}</span>
        </div>
        <div class="inventory-cell-name ${nameClass}" data-item-name="true" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</div>
        <div class="inventory-cell-actions">
          ${primaryAction ? `<button class="small-btn" data-inline-primary="${slotIndex}" data-item-primary="true" type="button" ${primaryAction.disabled ? 'disabled' : ''}>${primaryAction.label}</button>` : ''}
          <button class="small-btn danger" data-inline-drop="${slotIndex}" type="button">丢下</button>
        </div>
        ${itemMeta.affinityBadge ? `<span class="item-card-chip item-card-chip--affinity item-card-chip--${itemMeta.affinityBadge.tone} item-card-chip--element-${itemMeta.affinityBadge.element}" data-item-affinity="true" title="${this.escapeHtml(itemMeta.affinityBadge.title)}">${this.escapeHtml(itemMeta.affinityBadge.label)}</span>` : ''}
        ${itemMeta.levelLabel ? `<span class="item-card-chip item-card-chip--level" data-item-level="true">${this.escapeHtml(itemMeta.levelLabel)}</span>` : ''}
      </div>`;
    });

    html += '</div>';
    if (renderedItems.length < visibleItems.length) {
      html += `<div class="inventory-load-hint" data-inventory-load-hint="true">向下滚动继续加载（已显示 ${formatDisplayInteger(renderedItems.length)} / ${formatDisplayInteger(visibleItems.length)}）</div>`;
    }
    html += '</div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
    });
  }

/** bindPaneEvents：执行对应的业务逻辑。 */
  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

/** filterButton：定义该变量以承载业务值。 */
      const filterButton = target.closest<HTMLElement>('[data-filter-button]');
      if (filterButton) {
/** filter：定义该变量以承载业务值。 */
        const filter = filterButton.dataset.filter as InventoryFilter | undefined;
        if (!filter || filter === this.activeFilter) {
          return;
        }
        this.activeFilter = filter;
        this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
        if (this.lastInventory) {
          this.render(this.lastInventory);
          this.scrollToTop();
          this.scheduleLoadMoreCheck();
        }
        return;
      }

      if (target.closest('[data-sort-inventory]')) {
        this.onSortInventory?.();
        return;
      }

/** primaryButton：定义该变量以承载业务值。 */
      const primaryButton = target.closest<HTMLElement>('[data-inline-primary]');
      if (primaryButton) {
        event.stopPropagation();
/** rawIndex：定义该变量以承载业务值。 */
        const rawIndex = primaryButton.dataset.inlinePrimary;
        if (!rawIndex) {
          return;
        }
/** slotIndex：定义该变量以承载业务值。 */
        const slotIndex = parseInt(rawIndex, 10);
/** item：定义该变量以承载业务值。 */
        const item = this.lastInventory?.items[slotIndex];
/** action：定义该变量以承载业务值。 */
        const action = item ? this.getPrimaryAction(item) : null;
        if (!action || action.kind === 'status') {
          return;
        }
        if (action.kind === 'equip') {
          this.onEquipItem?.(slotIndex);
          return;
        }
        if (item && this.requiresUseConfirmation(item)) {
          this.selectedSlotIndex = slotIndex;
          this.selectedItemKey = this.getItemIdentity(item);
          this.openActionDialog('use', slotIndex, 1);
          return;
        }
        this.onUseItem?.(slotIndex);
        return;
      }

/** dropButton：定义该变量以承载业务值。 */
      const dropButton = target.closest<HTMLElement>('[data-inline-drop]');
      if (dropButton) {
        event.stopPropagation();
/** rawIndex：定义该变量以承载业务值。 */
        const rawIndex = dropButton.dataset.inlineDrop;
        if (!rawIndex) {
          return;
        }
        this.onDropItem?.(parseInt(rawIndex, 10), 1);
        return;
      }

/** cell：定义该变量以承载业务值。 */
      const cell = target.closest<HTMLElement>('[data-open-item]');
      if (!cell) {
        return;
      }
/** rawIndex：定义该变量以承载业务值。 */
      const rawIndex = cell.dataset.openItem;
      if (!rawIndex) {
        return;
      }
      this.selectedSlotIndex = parseInt(rawIndex, 10);
/** item：定义该变量以承载业务值。 */
      const item = this.lastInventory?.items[this.selectedSlotIndex];
      this.selectedItemKey = item ? this.getItemIdentity(item) : null;
      this.tooltip.hide();
      this.tooltipCell = null;
      this.renderModal();
    });
  }

/** bindTooltipEvents：执行对应的业务逻辑。 */
  private bindTooltipEvents(): void {
/** tapMode：定义该变量以承载业务值。 */
    const tapMode = prefersPinnedTooltipInteraction();
/** show：通过常量导出可复用函数行为。 */
    const show = (cell: HTMLElement, event: PointerEvent) => {
/** rawIndex：定义该变量以承载业务值。 */
      const rawIndex = cell.dataset.itemSlot;
      if (!rawIndex || !this.lastInventory) {
        return;
      }
/** slotIndex：定义该变量以承载业务值。 */
      const slotIndex = parseInt(rawIndex, 10);
/** item：定义该变量以承载业务值。 */
      const item = this.lastInventory.items[slotIndex];
      if (!item) {
        return;
      }
/** tooltip：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
/** cell：定义该变量以承载业务值。 */
      const cell = target.closest<HTMLElement>('.inventory-cell');
      if (!cell) {
        return;
      }
      if (this.tooltip.isPinnedTo(cell)) {
        this.tooltipCell = null;
        this.tooltip.hide(true);
        return;
      }
/** rawIndex：定义该变量以承载业务值。 */
      const rawIndex = cell.dataset.itemSlot;
      if (!rawIndex || !this.lastInventory) {
        return;
      }
/** slotIndex：定义该变量以承载业务值。 */
      const slotIndex = parseInt(rawIndex, 10);
/** item：定义该变量以承载业务值。 */
      const item = this.lastInventory.items[slotIndex];
      if (!item) {
        return;
      }
/** tooltip：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        if (this.tooltipCell) {
          this.tooltipCell = null;
          this.tooltip.hide();
        }
        return;
      }

/** cell：定义该变量以承载业务值。 */
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

/** ensureTooltipStyle：执行对应的业务逻辑。 */
  private ensureTooltipStyle(): void {
    if (document.getElementById(INVENTORY_PANEL_TOOLTIP_STYLE_ID)) return;
/** style：定义该变量以承载业务值。 */
    const style = document.createElement('style');
    style.id = INVENTORY_PANEL_TOOLTIP_STYLE_ID;
    style.textContent = `
      .inventory-tooltip {
/** position：定义该变量以承载业务值。 */
        position: fixed;
        pointer-events: none;
        font-size: var(--font-size-13);
/** color：定义该变量以承载业务值。 */
        color: var(--ink-black);
        z-index: 2000;
/** opacity：定义该变量以承载业务值。 */
        opacity: 0;
/** transition：定义该变量以承载业务值。 */
        transition: opacity 120ms ease;
        min-width: 0;
      }
      .inventory-tooltip.visible {
/** opacity：定义该变量以承载业务值。 */
        opacity: 1;
      }
      .inventory-tooltip .floating-tooltip-body {
        min-width: 160px;
      }
      .inventory-tooltip .floating-tooltip-body {
/** display：定义该变量以承载业务值。 */
        display: flex;
        flex-direction: column;
/** gap：定义该变量以承载业务值。 */
        gap: 4px;
        line-height: 1.4;
      }
      .inventory-tooltip .floating-tooltip-body strong {
/** display：定义该变量以承载业务值。 */
        display: block;
      }
      .inventory-tooltip .floating-tooltip-detail {
/** display：定义该变量以承载业务值。 */
        display: flex;
        flex-direction: column;
/** gap：定义该变量以承载业务值。 */
        gap: 2px;
/** color：定义该变量以承载业务值。 */
        color: var(--ink-grey);
      }
      .inventory-tooltip .floating-tooltip-line {
/** display：定义该变量以承载业务值。 */
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

/** renderModal：执行对应的业务逻辑。 */
  private renderModal(): void {
    if (!this.lastInventory || !this.selectedItemKey) {
      detailModalHost.close(InventoryPanel.MODAL_OWNER);
      return;
    }

/** resolved：定义该变量以承载业务值。 */
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

/** previewItem：定义该变量以承载业务值。 */
    const previewItem = resolvePreviewItem(item);
    if (!hasLoadedItemSourceCatalog()) {
/** pendingItemKey：定义该变量以承载业务值。 */
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
/** bonusLines：定义该变量以承载业务值。 */
    const bonusLines = describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
/** effectLines：定义该变量以承载业务值。 */
    const effectLines = formatItemEffects(item);
/** primaryAction：定义该变量以承载业务值。 */
    const primaryAction = this.getPrimaryAction(item);
/** statusLabel：定义该变量以承载业务值。 */
    const statusLabel = this.getItemStatusLabel(item);
/** canBatchUse：定义该变量以承载业务值。 */
    const canBatchUse = primaryAction?.kind === 'use' && this.canBatchUseItem(item);
/** canBatchDropOrDestroy：定义该变量以承载业务值。 */
    const canBatchDropOrDestroy = this.canBatchDropOrDestroy(item);
/** sourceEntryCount：定义该变量以承载业务值。 */
    const sourceEntryCount = getItemSourceEntryCount(previewItem.itemId);
/** useSpecialSourceSummary：定义该变量以承载业务值。 */
    const useSpecialSourceSummary = isSpecialSourceSummaryItem(previewItem.itemId);
/** canToggleSourceList：定义该变量以承载业务值。 */
    const canToggleSourceList = !useSpecialSourceSummary && sourceEntryCount > INVENTORY_SOURCE_COLLAPSED_COUNT;
/** sourceListHtml：定义该变量以承载业务值。 */
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
          if (primaryAction.kind === 'equip') {
            this.onEquipItem?.(slotIndex);
            this.closeModal();
            return;
          }
          if (this.requiresUseConfirmation(item)) {
            this.openActionDialog('use', slotIndex, 1);
            return;
          }
          this.onUseItem?.(slotIndex, 1);
          this.closeModal();
        });
        body.querySelectorAll<HTMLElement>('[data-inventory-open-action]').forEach((button) => button.addEventListener('click', (event) => {
          event.stopPropagation();
/** kind：定义该变量以承载业务值。 */
          const kind = button.dataset.inventoryOpenAction as InventoryActionKind | undefined;
/** defaultCount：定义该变量以承载业务值。 */
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

/** renderActionDialog：执行对应的业务逻辑。 */
  private renderActionDialog(item: ItemStack, slotIndex: number, dialog: InventoryActionDialogState): void {
/** labels：定义该变量以承载业务值。 */
    const labels = this.resolveActionLabels(dialog.kind);
/** maxCount：定义该变量以承载业务值。 */
    const maxCount = item.count;
/** halfCount：定义该变量以承载业务值。 */
    const halfCount = Math.max(1, Math.ceil(maxCount / 2));
/** selectedCount：定义该变量以承载业务值。 */
    const selectedCount = Math.max(1, Math.min(maxCount, dialog.defaultCount));
/** specialUseSummary：定义该变量以承载业务值。 */
    const specialUseSummary = dialog.kind === 'use' ? this.getSpecialUseConfirmSummary(item) : null;

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

    if (specialUseSummary) {
      detailModalHost.open({
        ownerId: InventoryPanel.MODAL_OWNER,
        title: specialUseSummary.title,
        subtitle: `${item.name} · 数量 ${formatDisplayCountBadge(1)}`,
        hint: '点击空白处取消',
        bodyHtml: `
          <div class="quest-detail-section">
            <strong>使用说明</strong>
            ${specialUseSummary.lines.map((line) => `<div>${this.escapeHtml(line)}</div>`).join('')}
          </div>
          <div class="inventory-detail-actions">
            <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
              <button class="small-btn ghost" type="button" data-inventory-action-cancel>${this.escapeHtml(specialUseSummary.cancelLabel ?? '返回详情')}</button>
              <button class="small-btn" type="button" data-inventory-action-confirm>${this.escapeHtml(specialUseSummary.confirmLabel ?? '确认使用')}</button>
            </div>
          </div>
        `,
        onClose: () => {
          this.resetModalState();
        },
        onAfterRender: (body) => {
          body.querySelector<HTMLElement>('[data-inventory-action-cancel]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.actionDialog = null;
            this.renderModal();
          });
          body.querySelector<HTMLElement>('[data-inventory-action-confirm]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.onUseItem?.(slotIndex, 1);
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
/** countInput：定义该变量以承载业务值。 */
        const countInput = body.querySelector<HTMLInputElement>('[data-inventory-action-count="true"]');
        this.syncActionCountInputWidth(countInput, maxCount);
        countInput?.addEventListener('input', () => {
/** nextValue：定义该变量以承载业务值。 */
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
/** selected：定义该变量以承载业务值。 */
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

/** patchList：执行对应的业务逻辑。 */
  private patchList(inventory: Inventory): boolean {
/** titleNode：定义该变量以承载业务值。 */
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

/** visibleItems：定义该变量以承载业务值。 */
    const visibleItems = this.getVisibleItems(inventory);
    this.syncRenderedVisibleCount(visibleItems.length);
/** renderedItems：定义该变量以承载业务值。 */
    const renderedItems = visibleItems.slice(0, this.renderedVisibleCount);
    if (visibleItems.length === 0) {
/** emptyNode：定义该变量以承载业务值。 */
      const emptyNode = this.pane.querySelector<HTMLElement>('[data-inventory-empty="true"]');
      if (!emptyNode) {
        return false;
      }
      emptyNode.textContent = inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品';
      this.lastStructureState = this.buildStructureStateFromVisibleItems(renderedItems);
      return true;
    }

/** grid：定义该变量以承载业务值。 */
    const grid = this.pane.querySelector<HTMLElement>('[data-inventory-grid="true"]');
    if (!grid) {
      return false;
    }
/** cooldownStateMap：定义该变量以承载业务值。 */
    const cooldownStateMap = this.getCooldownStateMap(inventory);
/** loadHint：定义该变量以承载业务值。 */
    const loadHint = this.pane.querySelector<HTMLElement>('[data-inventory-load-hint="true"]');
    if (renderedItems.length < visibleItems.length) {
      if (!loadHint) {
        return false;
      }
      loadHint.textContent = `向下滚动继续加载（已显示 ${formatDisplayInteger(renderedItems.length)} / ${formatDisplayInteger(visibleItems.length)}）`;
    } else if (loadHint) {
      return false;
    }

    for (const { item, slotIndex } of renderedItems) {
      const cell = grid.querySelector<HTMLElement>(`[data-item-slot="${CSS.escape(String(slotIndex))}"]`);
      if (!cell) {
        return false;
      }

/** typeNode：定义该变量以承载业务值。 */
      const typeNode = cell.querySelector<HTMLElement>('[data-item-type="true"]');
/** countNode：定义该变量以承载业务值。 */
      const countNode = cell.querySelector<HTMLElement>('[data-item-count="true"]');
/** nameNode：定义该变量以承载业务值。 */
      const nameNode = cell.querySelector<HTMLElement>('[data-item-name="true"]');
/** levelNode：定义该变量以承载业务值。 */
      const levelNode = cell.querySelector<HTMLElement>('[data-item-level="true"]');
/** affinityNode：定义该变量以承载业务值。 */
      const affinityNode = cell.querySelector<HTMLElement>('[data-item-affinity="true"]');
/** cooldownNode：定义该变量以承载业务值。 */
      const cooldownNode = cell.querySelector<HTMLElement>('[data-item-cooldown="true"]');
/** cooldownPieNode：定义该变量以承载业务值。 */
      const cooldownPieNode = cell.querySelector<HTMLElement>('[data-item-cooldown-pie="true"]');
/** cooldownLabelNode：定义该变量以承载业务值。 */
      const cooldownLabelNode = cell.querySelector<HTMLElement>('[data-item-cooldown-label="true"]');
      if (!typeNode || !countNode || !nameNode || !cooldownNode || !cooldownPieNode || !cooldownLabelNode) {
        return false;
      }
/** itemMeta：定义该变量以承载业务值。 */
      const itemMeta = getItemDisplayMeta(item);
      if (itemMeta.levelLabel && !levelNode) {
        return false;
      }
      if (!itemMeta.levelLabel && levelNode) {
        return false;
      }
      if (itemMeta.affinityBadge && !affinityNode) {
        return false;
      }
      if (!itemMeta.affinityBadge && affinityNode) {
        return false;
      }

/** primaryAction：定义该变量以承载业务值。 */
      const primaryAction = this.getPrimaryAction(item);
/** primaryButton：定义该变量以承载业务值。 */
      const primaryButton = cell.querySelector<HTMLButtonElement>('[data-item-primary="true"]');

      cell.dataset.itemKey = this.getItemIdentity(item);
      if (itemMeta.grade) {
        cell.dataset.itemGrade = itemMeta.grade;
      } else {
        delete cell.dataset.itemGrade;
      }
      cell.className = getItemDecorClassName('inventory-cell', item);
/** cooldownState：定义该变量以承载业务值。 */
      const cooldownState = cooldownStateMap.get(item.itemId) ?? null;
      cell.classList.toggle('inventory-cell--cooldown', cooldownState !== null);
      typeNode.textContent = getItemAffixTypeLabel(item, getItemTypeLabel(item.type));
      countNode.textContent = formatDisplayCountBadge(item.count);
      nameNode.textContent = item.name;
      nameNode.title = item.name;
      nameNode.className = `inventory-cell-name ${this.getNameClass(item.name)}`.trim();
      cooldownNode.hidden = cooldownState === null;
      if (cooldownState) {
        cooldownNode.title = this.getItemCooldownTitle(cooldownState);
        cooldownPieNode.style.setProperty('--inventory-cooldown-progress', this.getItemCooldownRatio(cooldownState).toFixed(4));
        cooldownLabelNode.textContent = formatDisplayInteger(this.getItemCooldownRemainingTicks(cooldownState));
      } else {
        cooldownNode.removeAttribute('title');
        cooldownPieNode.style.setProperty('--inventory-cooldown-progress', '0');
        cooldownLabelNode.textContent = '';
      }
      if (levelNode) {
        levelNode.textContent = itemMeta.levelLabel ?? '';
      }
      if (affinityNode && itemMeta.affinityBadge) {
        affinityNode.textContent = itemMeta.affinityBadge.label;
        affinityNode.title = itemMeta.affinityBadge.title;
        affinityNode.className = `item-card-chip item-card-chip--affinity item-card-chip--${itemMeta.affinityBadge.tone} item-card-chip--element-${itemMeta.affinityBadge.element}`;
      }

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

    this.lastStructureState = this.buildStructureStateFromVisibleItems(renderedItems);
    return true;
  }

/** patchModal：执行对应的业务逻辑。 */
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

/** resolved：定义该变量以承载业务值。 */
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
/** current：定义该变量以承载业务值。 */
      const current = inventory.items[this.selectedSlotIndex];
      if (current && this.getItemIdentity(current) === this.selectedItemKey) {
        return { item: current, slotIndex: this.selectedSlotIndex };
      }
    }

/** slotIndex：定义该变量以承载业务值。 */
    const slotIndex = inventory.items.findIndex((item) => this.getItemIdentity(item) === this.selectedItemKey);
    if (slotIndex < 0) {
      return null;
    }
    this.selectedSlotIndex = slotIndex;
    return { item: inventory.items[slotIndex], slotIndex };
  }

/** canUseItem：执行对应的业务逻辑。 */
  private canUseItem(item: ItemStack): boolean {
    return INVENTORY_PANEL_USABLE_ITEM_TYPES.has(item.type);
  }

/** canBatchUseItem：执行对应的业务逻辑。 */
  private canBatchUseItem(item: ItemStack): boolean {
    return item.allowBatchUse === true && this.canUseItem(item) && item.count > 1;
  }

/** getUseCountFromInput：执行对应的业务逻辑。 */
  private getUseCountFromInput(input: HTMLInputElement | null, maxCount: number): number {
/** rawValue：定义该变量以承载业务值。 */
    const rawValue = input?.value ?? '1';
/** parsed：定义该变量以承载业务值。 */
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(maxCount, parsed));
  }

/** syncActionCountInputWidth：执行对应的业务逻辑。 */
  private syncActionCountInputWidth(input: HTMLInputElement | null, maxCount: number): void {
    if (!input) {
      return;
    }
/** valueLength：定义该变量以承载业务值。 */
    const valueLength = Math.max(1, input.value.trim().length);
/** maxLength：定义该变量以承载业务值。 */
    const maxLength = Math.max(1, String(maxCount).length);
/** chars：定义该变量以承载业务值。 */
    const chars = Math.max(4, valueLength, maxLength) + 1;
    input.style.width = `calc(${chars}ch + 18px)`;
  }

/** canBatchDropOrDestroy：执行对应的业务逻辑。 */
  private canBatchDropOrDestroy(item: ItemStack): boolean {
    return item.count > 1;
  }

/** getSpiritualRootSeedTier：执行对应的业务逻辑。 */
  private getSpiritualRootSeedTier(item: ItemStack): 'heaven' | 'divine' | null {
    if (item.itemId === HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID) {
      return 'heaven';
    }
    if (item.itemId === DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID) {
      return 'divine';
    }
    return null;
  }

/** requiresUseConfirmation：执行对应的业务逻辑。 */
  private requiresUseConfirmation(item: ItemStack): boolean {
    return this.getSpiritualRootSeedTier(item) !== null
      || item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
      || this.getTechniqueLearningWarningSummary(item) !== null;
  }

/** getHeavenGateRerollCount：执行对应的业务逻辑。 */
  private getHeavenGateRerollCount(averageBonus: number): number {
    return Math.max(0, Math.floor(Math.max(0, averageBonus) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
  }

/** getHeavenGateRerollCost：执行对应的业务逻辑。 */
  private getHeavenGateRerollCost(realm: PlayerRealmState | null): number {
    return Math.max(1, Math.round(Math.max(1, Math.floor(realm?.progressToNext ?? 1)) * HEAVEN_GATE_REROLL_COST_RATIO));
  }

/** getSpiritualRootSeedEquivalentRerollCount：执行对应的业务逻辑。 */
  private getSpiritualRootSeedEquivalentRerollCount(tier: 'heaven' | 'divine'): number {
    return tier === 'divine' ? 100 : 10;
  }

/** getSpecialUseConfirmSummary：执行对应的业务逻辑。 */
  private getSpecialUseConfirmSummary(item: ItemStack): {
/** title：定义该变量以承载业务值。 */
    title: string;
/** lines：定义该变量以承载业务值。 */
    lines: string[];
    confirmLabel?: string;
    cancelLabel?: string;
  } | null {
/** techniqueWarningSummary：定义该变量以承载业务值。 */
    const techniqueWarningSummary = this.getTechniqueLearningWarningSummary(item);
    if (techniqueWarningSummary) {
      return techniqueWarningSummary;
    }
/** tier：定义该变量以承载业务值。 */
    const tier = this.getSpiritualRootSeedTier(item);
    if (tier) {
/** currentRerollCount：定义该变量以承载业务值。 */
      const currentRerollCount = this.getHeavenGateRerollCount(this.playerHeavenGate?.averageBonus ?? 0);
/** gainedRerollCount：定义该变量以承载业务值。 */
      const gainedRerollCount = this.getSpiritualRootSeedEquivalentRerollCount(tier);
/** reducedCount：定义该变量以承载业务值。 */
      const reducedCount = Math.max(0, gainedRerollCount - currentRerollCount);
/** foundationCost：定义该变量以承载业务值。 */
      const foundationCost = this.getHeavenGateRerollCost(this.playerRealm) * reducedCount;
/** remainingFoundation：定义该变量以承载业务值。 */
      const remainingFoundation = Math.max(0, this.playerFoundation - foundationCost);
/** nextRerollCount：定义该变量以承载业务值。 */
      const nextRerollCount = currentRerollCount + gainedRerollCount;
/** lines：定义该变量以承载业务值。 */
      const lines = tier === 'divine'
        ? [
            '使用后，五行灵根会直接全部固定为 100。',
            `当前底蕴 ${formatDisplayInteger(this.playerFoundation)}，本次会消耗 ${formatDisplayInteger(foundationCost)}，使用后剩余 ${formatDisplayInteger(remainingFoundation)}。`,
            `当前逆天改命累计 ${formatDisplayInteger(currentRerollCount)} 次，使用后会额外增加 ${formatDisplayInteger(gainedRerollCount)} 次，变为 ${formatDisplayInteger(nextRerollCount)} 次。`,
          ]
        : [
            '使用后，五行灵根会先全部定为 99，再逐项以 50% 概率升到 100，且至少保底一项为 100。',
            `当前底蕴 ${formatDisplayInteger(this.playerFoundation)}，本次会消耗 ${formatDisplayInteger(foundationCost)}，使用后剩余 ${formatDisplayInteger(remainingFoundation)}。`,
            `当前逆天改命累计 ${formatDisplayInteger(currentRerollCount)} 次，使用后会额外增加 ${formatDisplayInteger(gainedRerollCount)} 次，变为 ${formatDisplayInteger(nextRerollCount)} 次。`,
          ];
      return {
/** title：定义该变量以承载业务值。 */
        title: tier === 'divine' ? '确认使用神品灵根幼苗' : '确认使用天品灵根幼苗',
        lines,
      };
    }
/** currentRerollCount：定义该变量以承载业务值。 */
    const currentRerollCount = this.getHeavenGateRerollCount(this.playerHeavenGate?.averageBonus ?? 0);
    if (item.itemId !== SHATTER_SPIRIT_PILL_ITEM_ID) {
      return null;
    }
/** currentExp：定义该变量以承载业务值。 */
    const currentExp = Math.max(0, Math.floor(this.playerRealm?.progress ?? 0));
/** expCost：定义该变量以承载业务值。 */
    const expCost = Math.max(0, Math.round(currentExp * SHATTER_SPIRIT_PILL_COST_RATIO));
/** remainingExp：定义该变量以承载业务值。 */
    const remainingExp = Math.max(0, currentExp - expCost);
/** nextRerollCount：定义该变量以承载业务值。 */
    const nextRerollCount = currentRerollCount + 1;
    return {
      title: '确认使用碎灵丹',
      lines: [
        '使用后会立刻重置天门，清掉当前已开出的灵根结果，并回到可重新开天门的状态。',
        `当前境界修为 ${formatDisplayInteger(currentExp)}，本次会消耗 ${formatDisplayInteger(expCost)}，使用后剩余 ${formatDisplayInteger(remainingExp)}。`,
        `当前逆天改命累计 ${formatDisplayInteger(currentRerollCount)} 次，使用后会额外增加 1 次，变为 ${formatDisplayInteger(nextRerollCount)} 次。`,
      ],
    };
  }

/** getTechniqueLearningWarningSummary：执行对应的业务逻辑。 */
  private getTechniqueLearningWarningSummary(item: ItemStack): {
/** title：定义该变量以承载业务值。 */
    title: string;
/** lines：定义该变量以承载业务值。 */
    lines: string[];
    confirmLabel?: string;
    cancelLabel?: string;
  } | null {
    if (item.type !== 'skill_book') {
      return null;
    }
/** playerRealmLv：定义该变量以承载业务值。 */
    const playerRealmLv = Number.isFinite(this.playerRealm?.realmLv)
      ? Math.max(1, Math.floor(Number(this.playerRealm?.realmLv)))
      : null;
    if (playerRealmLv === null) {
      return null;
    }
/** techniqueId：定义该变量以承载业务值。 */
    const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
    if (!techniqueId) {
      return null;
    }
/** technique：定义该变量以承载业务值。 */
    const technique = getLocalTechniqueTemplate(techniqueId);
    if (!technique || !Number.isFinite(technique.realmLv)) {
      return null;
    }
/** techniqueRealmLv：定义该变量以承载业务值。 */
    const techniqueRealmLv = Math.max(1, Math.floor(Number(technique.realmLv)));
    if (!shouldWarnTechniqueLearningDifficulty(playerRealmLv, techniqueRealmLv)) {
      return null;
    }
/** gap：定义该变量以承载业务值。 */
    const gap = techniqueRealmLv - playerRealmLv;
    return {
      title: `确认学习 ${technique.name || item.name}`,
      lines: [
        '目标功法当前过于晦涩难懂，获得的经验值会大幅衰减。',
        `你当前比这门功法低 ${formatDisplayInteger(gap)} 个境界，已超过 ${formatDisplayInteger(TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA)} 个境界的提醒阈值。`,
        '确认后仍会照常学习；若暂时不学，点取消即可返回。',
      ],
      confirmLabel: '确认学习',
      cancelLabel: '取消学习',
    };
  }

/** openActionDialog：执行对应的业务逻辑。 */
  private openActionDialog(kind: InventoryActionKind, slotIndex: number, defaultCount: number): void {
    this.actionDialog = {
      kind,
      slotIndex,
      defaultCount: Math.max(1, defaultCount),
      confirmDestroy: false,
    };
    this.renderModal();
  }

/** resolveActionLabels：执行对应的业务逻辑。 */
  private resolveActionLabels(kind: InventoryActionKind): {
/** title：定义该变量以承载业务值。 */
    title: string;
/** confirm：定义该变量以承载业务值。 */
    confirm: string;
/** danger：定义该变量以承载业务值。 */
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

/** getPrimaryAction：执行对应的业务逻辑。 */
  private getPrimaryAction(item: ItemStack): InventoryPrimaryAction | null {
/** statusLabel：定义该变量以承载业务值。 */
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

/** getItemStatusLabel：执行对应的业务逻辑。 */
  private getItemStatusLabel(item: ItemStack): string | null {
/** cooldownState：定义该变量以承载业务值。 */
    const cooldownState = this.getItemCooldownState(item);
/** cooldownLeft：定义该变量以承载业务值。 */
    const cooldownLeft = this.getItemCooldownRemainingTicks(cooldownState);
    if (cooldownLeft > 0) {
      return `冷却 ${formatDisplayInteger(cooldownLeft)} 息`;
    }
    if (item.type === 'skill_book') {
/** techniqueId：定义该变量以承载业务值。 */
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

/** getEquippedItemForCompare：执行对应的业务逻辑。 */
  private getEquippedItemForCompare(item: ItemStack): ItemStack | null {
    if (item.type !== 'equipment' || !item.equipSlot) {
      return null;
    }
    return this.equippedItemsBySlot[item.equipSlot] ?? null;
  }

/** getCooldownStateMap：执行对应的业务逻辑。 */
  private getCooldownStateMap(inventory: Inventory): Map<string, InventoryItemCooldownState> {
    return new Map(
      (inventory.cooldowns ?? [])
        .filter((entry) => this.getItemCooldownRemainingTicks(entry) > 0)
        .map((entry) => [entry.itemId, entry] as const),
    );
  }

/** getItemCooldownState：执行对应的业务逻辑。 */
  private getItemCooldownState(item: ItemStack, inventory: Inventory | null = this.lastInventory): InventoryItemCooldownState | null {
/** cooldownState：定义该变量以承载业务值。 */
    const cooldownState = inventory?.cooldowns?.find((entry) => entry.itemId === item.itemId) ?? null;
    return this.getItemCooldownRemainingTicks(cooldownState) > 0 ? cooldownState : null;
  }

/** getItemCooldownRemainingTicks：执行对应的业务逻辑。 */
  private getItemCooldownRemainingTicks(cooldownState: InventoryItemCooldownState | null): number {
    if (!cooldownState) {
      return 0;
    }
    return resolveInventoryCooldownLeft(cooldownState.cooldown, cooldownState.startedAtTick);
  }

/** getItemTooltipCooldownState：执行对应的业务逻辑。 */
  private getItemTooltipCooldownState(item: ItemStack): ItemTooltipCooldownState | null {
/** cooldownState：定义该变量以承载业务值。 */
    const cooldownState = this.getItemCooldownState(item);
    if (!cooldownState) {
      return null;
    }
/** cooldownLeft：定义该变量以承载业务值。 */
    const cooldownLeft = this.getItemCooldownRemainingTicks(cooldownState);
    return cooldownLeft > 0
      ? { cooldown: cooldownState.cooldown, cooldownLeft }
      : null;
  }

/** getItemCooldownRatio：执行对应的业务逻辑。 */
  private getItemCooldownRatio(cooldownState: InventoryItemCooldownState | null): number {
    if (!cooldownState) {
      return 0;
    }
/** cooldown：定义该变量以承载业务值。 */
    const cooldown = Math.max(1, cooldownState.cooldown);
    return Math.max(0, Math.min(1, this.getItemCooldownRemainingTicks(cooldownState) / cooldown));
  }

/** getItemCooldownTitle：执行对应的业务逻辑。 */
  private getItemCooldownTitle(cooldownState: InventoryItemCooldownState): string {
    return `使用冷却 ${formatDisplayInteger(this.getItemCooldownRemainingTicks(cooldownState))} / ${formatDisplayInteger(cooldownState.cooldown)} 息`;
  }

/** getNameClass：执行对应的业务逻辑。 */
  private getNameClass(name: string): string {
/** length：定义该变量以承载业务值。 */
    const length = [...name].length;
    if (length >= 7) {
      return 'inventory-cell-name--tiny';
    }
    if (length >= 5) {
      return 'inventory-cell-name--compact';
    }
    return '';
  }

/** getItemIdentity：执行对应的业务逻辑。 */
  private getItemIdentity(item: ItemStack): string {
    return createItemStackSignature(item);
  }

  private getVisibleItems(inventory: Inventory): Array<{ item: ItemStack; slotIndex: number }> {
    return inventory.items
      .map((item, slotIndex) => ({ item, slotIndex }))
      .filter(({ item }) => this.activeFilter === 'all' || item.type === this.activeFilter);
  }

/** syncRenderedVisibleCount：执行对应的业务逻辑。 */
  private syncRenderedVisibleCount(totalVisibleItems: number): void {
    if (totalVisibleItems <= 0) {
      this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
      return;
    }
/** minimumVisibleCount：定义该变量以承载业务值。 */
    const minimumVisibleCount = Math.min(INVENTORY_INITIAL_RENDER_COUNT, totalVisibleItems);
    this.renderedVisibleCount = Math.min(
      totalVisibleItems,
      Math.max(minimumVisibleCount, this.renderedVisibleCount),
    );
  }

/** maybeLoadMoreVisibleItems：执行对应的业务逻辑。 */
  private maybeLoadMoreVisibleItems(scrollTarget?: HTMLElement): void {
    if (!this.lastInventory || !this.isPaneVisible()) {
      return;
    }
/** visibleItemCount：定义该变量以承载业务值。 */
    const visibleItemCount = this.getVisibleItems(this.lastInventory).length;
    if (visibleItemCount === 0 || this.renderedVisibleCount >= visibleItemCount) {
      return;
    }
/** scrollContainer：定义该变量以承载业务值。 */
    const scrollContainer = this.resolveScrollContainer(scrollTarget);
    if (!scrollContainer) {
      return;
    }
/** remainingDistance：定义该变量以承载业务值。 */
    const remainingDistance = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    if (remainingDistance > INVENTORY_LOAD_MORE_THRESHOLD_PX) {
      return;
    }
/** nextRenderedCount：定义该变量以承载业务值。 */
    const nextRenderedCount = Math.min(visibleItemCount, this.renderedVisibleCount + INVENTORY_RENDER_BATCH_SIZE);
    if (nextRenderedCount === this.renderedVisibleCount) {
      return;
    }
    this.renderedVisibleCount = nextRenderedCount;
/** previousScrollTop：定义该变量以承载业务值。 */
    const previousScrollTop = scrollContainer.scrollTop;
    this.render(this.lastInventory);
    scrollContainer.scrollTop = previousScrollTop;
    this.scheduleLoadMoreCheck(scrollContainer);
  }

/** scheduleLoadMoreCheck：执行对应的业务逻辑。 */
  private scheduleLoadMoreCheck(scrollTarget?: HTMLElement): void {
    if (this.pendingLoadMoreFrame !== null) {
      cancelAnimationFrame(this.pendingLoadMoreFrame);
    }
    this.pendingLoadMoreFrame = requestAnimationFrame(() => {
      this.pendingLoadMoreFrame = null;
      this.maybeLoadMoreVisibleItems(scrollTarget);
    });
  }

/** resolveScrollContainer：执行对应的业务逻辑。 */
  private resolveScrollContainer(preferredTarget?: HTMLElement): HTMLElement | null {
    if (preferredTarget && preferredTarget.contains(this.pane) && this.isScrollableContainer(preferredTarget)) {
      return preferredTarget;
    }
/** current：定义该变量以承载业务值。 */
    let current: HTMLElement | null = this.pane.parentElement;
    while (current) {
      if (this.isScrollableContainer(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

/** isScrollableContainer：执行对应的业务逻辑。 */
  private isScrollableContainer(element: HTMLElement): boolean {
    const { overflowY } = window.getComputedStyle(element);
    return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && element.clientHeight > 0;
  }

/** isPaneVisible：执行对应的业务逻辑。 */
  private isPaneVisible(): boolean {
    return !this.pane.classList.contains('hidden') && this.pane.getClientRects().length > 0;
  }

/** scrollToTop：执行对应的业务逻辑。 */
  private scrollToTop(): void {
/** scrollContainer：定义该变量以承载业务值。 */
    const scrollContainer = this.resolveScrollContainer();
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  }

/** buildStructureState：执行对应的业务逻辑。 */
  private buildStructureState(inventory: Inventory): InventoryStructureState {
    return this.buildStructureStateFromVisibleItems(this.getVisibleItems(inventory).slice(0, this.renderedVisibleCount));
  }

  private buildStructureStateFromVisibleItems(
/** visibleItems：定义该变量以承载业务值。 */
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

/** buildTooltipPayload：处理当前场景中的对应操作。 */
  private buildTooltipPayload(item: ItemStack) {
    return buildItemTooltipPayload({
      ...item,
/** type：定义该变量以承载业务值。 */
      type: item.type === 'skill_book' ? 'skill_book' : item.type,
    }, {
      learnedTechniqueIds: this.learnedTechniqueIds,
      unlockedMinimapIds: this.unlockedMinimapIds,
      equippedItem: this.getEquippedItemForCompare(item),
      itemCooldown: this.getItemTooltipCooldownState(item),
    });
  }

/** hasActiveCooldowns：执行对应的业务逻辑。 */
  private hasActiveCooldowns(inventory: Inventory | null = this.lastInventory): boolean {
    return (inventory?.cooldowns ?? []).some((entry) => this.getItemCooldownRemainingTicks(entry) > 0);
  }

/** refreshTooltipContent：执行对应的业务逻辑。 */
  private refreshTooltipContent(): void {
    if (!this.tooltipCell || !this.lastInventory) {
      return;
    }
/** rawIndex：定义该变量以承载业务值。 */
    const rawIndex = this.tooltipCell.dataset.itemSlot;
    if (!rawIndex) {
      return;
    }
/** item：定义该变量以承载业务值。 */
    const item = this.lastInventory.items[parseInt(rawIndex, 10)];
    if (!item) {
      return;
    }
/** tooltip：定义该变量以承载业务值。 */
    const tooltip = this.buildTooltipPayload(item);
    this.tooltip.updateContent(tooltip.title, tooltip.lines, {
      allowHtml: tooltip.allowHtml,
      asideCards: tooltip.asideCards,
    });
  }

/** syncCooldownRefresh：执行对应的业务逻辑。 */
  private syncCooldownRefresh(): void {
    if (this.cooldownRefreshTimer !== null) {
      window.clearTimeout(this.cooldownRefreshTimer);
      this.cooldownRefreshTimer = null;
    }
    if (!this.hasActiveCooldowns()) {
      return;
    }
    this.cooldownRefreshTimer = window.setTimeout(() => {
      this.cooldownRefreshTimer = null;
      if (!this.lastInventory) {
        return;
      }
      if (!this.patchList(this.lastInventory)) {
        this.render(this.lastInventory);
      }
      if (!this.patchModal()) {
        this.renderModal();
      }
      this.refreshTooltipContent();
      this.syncCooldownRefresh();
    }, 100);
  }

/** closeModal：执行对应的业务逻辑。 */
  private closeModal(): void {
    this.resetModalState();
    this.tooltipCell = null;
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }

/** resetModalState：执行对应的业务逻辑。 */
  private resetModalState(): void {
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.actionDialog = null;
    this.lastModalRenderKey = null;
    this.sourceExpanded = false;
    this.sourceExpandedItemKey = null;
  }

/** buildModalRenderKey：执行对应的业务逻辑。 */
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

/** equippedComparisonItem：定义该变量以承载业务值。 */
    const equippedComparisonItem = this.getEquippedItemForCompare(item);
/** statusLabel：定义该变量以承载业务值。 */
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

/** escapeHtml：执行对应的业务逻辑。 */
  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}


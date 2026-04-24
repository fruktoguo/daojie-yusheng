/**
 * 背包面板
 * 展示物品网格列表，支持分类筛选、使用/装备/丢弃操作与物品详情弹层
 */
import {
  calcTechniqueAttrValues,
  EquipSlot,
  HeavenGateState,
  HEAVEN_GATE_REROLL_COST_RATIO,
  Inventory,
  InventoryItemCooldownState,
  ItemStack,
  PlayerState,
  PlayerRealmState,
  SHATTER_SPIRIT_PILL_COST_RATIO,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA,
  createItemStackSignature,
  shouldWarnTechniqueLearningDifficulty,
} from '@mud/shared';
import {
  getAttrKeyLabel,
  getEquipSlotLabel,
  getItemTypeLabel,
  getTechniqueGradeLabel,
} from '../../domain-labels';
import {
  hasLoadedItemSourceCatalog,
  getItemSourceEntryCount,
  isSpecialSourceSummaryItem,
  preloadItemSourceCatalog,
  renderItemSourceListHtml,
} from '../../content/item-sources';
import {
  getLocalRealmLevelEntry,
  getLocalTechniqueTemplate,
  resolvePreviewItem,
  resolveTechniqueIdFromBookItemId,
} from '../../content/local-templates';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import {
  buildItemTooltipPayload,
  describeEquipmentBonuses,
  describeItemEffectDetails,
  ItemTooltipCooldownState,
} from '../equipment-tooltip';
import { getItemAffixTypeLabel, getItemDecorClassName, getItemDisplayMeta } from '../item-display';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint, createPanelSectionWithTitle, createSmallBtn } from '../ui-primitives';
import { describePreviewBonuses } from '../stat-preview';
import { INVENTORY_FILTER_TABS, InventoryFilter } from '../../constants/ui/inventory';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { resolveInventoryCooldownLeft } from '../../runtime/server-tick';
import {
  INVENTORY_PANEL_TOOLTIP_STYLE_ID,
  INVENTORY_PANEL_USABLE_ITEM_TYPES,
} from '../../constants/ui/inventory-panel';

/** InventoryActionKind：分类枚举。 */
type InventoryActionKind = 'use' | 'drop' | 'destroy';

/** InventoryActionDialogState：背包物品操作对话框状态。 */
interface InventoryActionDialogState {
/**
 * kind：kind相关字段。
 */

  kind: InventoryActionKind;  
  /**
 * slotIndex：slotIndex相关字段。
 */

  slotIndex: number;  
  /**
 * defaultCount：数量或计量字段。
 */

  defaultCount: number;  
  /**
 * confirmDestroy：confirmDestroy相关字段。
 */

  confirmDestroy: boolean;
}

/** InventoryStructureState：背包筛选结果与条目骨架状态。 */
interface InventoryStructureState {
/**
 * filter：filter相关字段。
 */

  filter: InventoryFilter;  
  /**
 * items：集合字段。
 */

  items: Array<{  
  /**
 * slotIndex：slotIndex相关字段。
 */
 slotIndex: number;  
 /**
 * identity：identity相关字段。
 */
 identity: string }>;
}

/** InventoryPrimaryAction：背包条目的主操作定义。 */
interface InventoryPrimaryAction {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * kind：kind相关字段。
 */

  kind: 'use' | 'equip' | 'status';  
  /**
 * disabled：disabled相关字段。
 */

  disabled?: boolean;
}

/** InventoryShellRefs：背包面板壳层节点引用集合。 */
interface InventoryShellRefs {
/**
 * section：section相关字段。
 */

  section: HTMLDivElement;  
  /**
 * title：title名称或显示文本。
 */

  title: HTMLDivElement;  
  /**
 * filters：filter相关字段。
 */

  filters: HTMLDivElement;  
  /**
 * grid：grid标识。
 */

  grid: HTMLDivElement;  
  /**
 * empty：empty相关字段。
 */

  empty: HTMLDivElement;  
  /**
 * loadHint：loadHint相关字段。
 */

  loadHint: HTMLDivElement;
}

/** INVENTORY_SOURCE_COLLAPSED_COUNT：背包来源COLLAPSED数量。 */
const INVENTORY_SOURCE_COLLAPSED_COUNT = 3;
/** HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID：HEAVEN SPIRITUAL ROOT种子物品ID。 */
const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
/** DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID：DIVINE SPIRITUAL ROOT种子物品ID。 */
const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
/** SHATTER_SPIRIT_PILL_ITEM_ID：SHATTER灵石PILL物品ID。 */
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
/** HEAVEN_GATE_REROLL_AVERAGE_BONUS：HEAVEN关卡REROLL AVERAGE BONUS。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
/** INVENTORY_INITIAL_RENDER_COUNT：背包初始渲染数量。 */
const INVENTORY_INITIAL_RENDER_COUNT = 72;
/** INVENTORY_RENDER_BATCH_SIZE：背包渲染BATCH SIZE。 */
const INVENTORY_RENDER_BATCH_SIZE = 48;
/** INVENTORY_LOAD_MORE_THRESHOLD_PX：背包LOAD MORE THRESHOLD PX。 */
const INVENTORY_LOAD_MORE_THRESHOLD_PX = 240;

/** formatItemEffects：格式化物品效果。 */
function formatItemEffects(item: ItemStack): string[] {
  return describeItemEffectDetails(item);
}

/** createFragmentFromHtml：从 HTML 文本创建文档片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/** 背包面板：显示物品列表，支持使用和丢弃 */
export class InventoryPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'inventory-panel';
  /** pane：pane。 */
  private pane = document.getElementById('pane-inventory')!;
  /** onUseItem：on使用物品。 */
  private onUseItem: ((slotIndex: number, count?: number) => void) | null = null;
  /** onDropItem：on掉落物品。 */
  private onDropItem: ((slotIndex: number, count: number) => void) | null = null;
  /** onDestroyItem：on Destroy物品。 */
  private onDestroyItem: ((slotIndex: number, count: number) => void) | null = null;
  /** onEquipItem：on Equip物品。 */
  private onEquipItem: ((slotIndex: number) => void) | null = null;
  /** onSortInventory：on排序背包。 */
  private onSortInventory: (() => void) | null = null;
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  /** activeFilter：活跃筛选。 */
  private activeFilter: InventoryFilter = 'all';
  /** lastInventory：last背包。 */
  private lastInventory: Inventory | null = null;
  /** lastStructureState：last Structure状态。 */
  private lastStructureState: InventoryStructureState | null = null;
  /** selectedSlotIndex：selected槽位索引。 */
  private selectedSlotIndex: number | null = null;
  /** selectedItemKey：selected物品Key。 */
  private selectedItemKey: string | null = null;
  /** actionDialog：动作对话。 */
  private actionDialog: InventoryActionDialogState | null = null;
  /** lastModalRenderKey：last弹窗渲染Key。 */
  private lastModalRenderKey: string | null = null;
  /** tooltipCell：提示格子。 */
  private tooltipCell: HTMLElement | null = null;
  /** sourceExpanded：来源Expanded。 */
  private sourceExpanded = false;
  /** sourceExpandedItemKey：来源Expanded物品Key。 */
  private sourceExpandedItemKey: string | null = null;
  /** learnedTechniqueIds：learned Technique ID 列表。 */
  private learnedTechniqueIds = new Set<string>();
  /** unlockedMinimapIds：unlocked小地图ID 列表。 */
  private unlockedMinimapIds = new Set<string>();
  /** equippedItemsBySlot：equipped物品By槽位。 */
  private equippedItemsBySlot: Partial<Record<EquipSlot, ItemStack>> = {};
  /** playerRealm：玩家境界。 */
  private playerRealm: PlayerRealmState | null = null;
  /** playerHeavenGate：玩家Heaven关卡。 */
  private playerHeavenGate: HeavenGateState | null = null;
  /** playerFoundation：玩家Foundation。 */
  private playerFoundation = 0;
  /** renderedVisibleCount：rendered可见数量。 */
  private renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
  /** pendingLoadMoreFrame：待处理Load More帧。 */
  private pendingLoadMoreFrame: number | null = null;
  /** cooldownRefreshTimer：冷却Refresh Timer。 */
  private cooldownRefreshTimer: number | null = null;
  /** shellRefs：shell Refs。 */
  private shellRefs: InventoryShellRefs | null = null;
  /** handleScrollCapture：处理Scroll Capture。 */
  private handleScrollCapture = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target !== this.pane && !target.contains(this.pane)) {
      return;
    }
    this.maybeLoadMoreVisibleItems(target);
  };  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.ensureTooltipStyle();
    this.bindPaneEvents();
    this.bindTooltipEvents();
    document.addEventListener('scroll', this.handleScrollCapture, { capture: true, passive: true });
  }

  /** clear：清理clear。 */
  clear(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    this.shellRefs = null;
    this.pane.replaceChildren(this.createInventoryEmptyState());
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onUse (slotIndex: number, count?: number) => void 参数说明。
 * @param onDrop (slotIndex: number, count: number) => void 参数说明。
 * @param onDestroy (slotIndex: number, count: number) => void 参数说明。
 * @param onEquip (slotIndex: number) => void 参数说明。
 * @param onSort () => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.lastInventory = inventory;
    this.syncRenderedVisibleCount(this.getVisibleItems(inventory).length);
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

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.syncPlayerContext(player);
    this.update(player.inventory);
  }  
  /**
 * syncPlayerContext：处理玩家上下文并更新相关状态。
 * @param player Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds' | 'realm' | 'heavenGate' | 'foundation'> 玩家对象。
 * @returns 无返回值，直接更新玩家上下文相关状态。
 */


  syncPlayerContext(
    player?: Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds' | 'realm' | 'heavenGate' | 'foundation'>,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** render：渲染渲染。 */
  private render(inventory: Inventory): void {
    this.lastInventory = inventory;
    this.ensureShell();
    this.patchList(inventory);
  }

  /** bindPaneEvents：绑定Pane事件。 */
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
        if (item && this.requiresUseConfirmation(item)) {
          this.selectedSlotIndex = slotIndex;
          this.selectedItemKey = this.getItemIdentity(item);
          this.openActionDialog('use', slotIndex, 1);
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

  /** bindTooltipEvents：绑定提示事件。 */
  private bindTooltipEvents(): void {
    const tapMode = prefersPinnedTooltipInteraction();
    /** show：处理显示。 */
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

  /** ensureTooltipStyle：确保提示样式。 */
  private ensureTooltipStyle(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** createInventoryEmptyState：创建背包Empty状态。 */
  private createInventoryEmptyState(): HTMLDivElement {
    const empty = createEmptyHint('背包空空如也');
    empty.dataset.inventoryEmpty = 'true';
    return empty;
  }

  /** ensureShell：确保Shell。 */
  private ensureShell(): InventoryShellRefs {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.shellRefs?.section.isConnected) {
      return this.shellRefs;
    }

    const { sectionEl, titleEl } = createPanelSectionWithTitle('背包');
    titleEl.dataset.inventoryTitle = 'true';

    const head = document.createElement('div');
    head.className = 'inventory-panel-head';
    head.append(titleEl);
    head.append(createSmallBtn('一键整理', { dataset: { sortInventory: 'true' } }));

    const filters = document.createElement('div');
    filters.className = 'inventory-filter-tabs';
    for (const tab of INVENTORY_FILTER_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inventory-filter-tab';
      button.dataset.filterButton = tab.id;
      button.dataset.filter = tab.id;
      button.textContent = tab.label;
      filters.append(button);
    }

    const empty = this.createInventoryEmptyState();
    const grid = document.createElement('div');
    grid.className = 'inventory-grid';
    grid.dataset.inventoryGrid = 'true';
    grid.hidden = true;

    const loadHint = document.createElement('div');
    loadHint.className = 'inventory-load-hint';
    loadHint.dataset.inventoryLoadHint = 'true';
    loadHint.hidden = true;

    sectionEl.replaceChildren(head, filters, empty, grid, loadHint);
    preserveSelection(this.pane, () => {
      this.pane.replaceChildren(sectionEl);
    });

    this.shellRefs = {
      section: sectionEl,
      title: titleEl,
      filters,
      grid,
      empty,
      loadHint,
    };
    return this.shellRefs;
  }

  /** createInventoryCell：创建背包格子。 */
  private createInventoryCell(slotIndex: number): HTMLDivElement {
    const cell = document.createElement('div');
    cell.dataset.openItem = String(slotIndex);
    cell.dataset.itemSlot = String(slotIndex);

    const cooldown = document.createElement('div');
    cooldown.className = 'inventory-cell-cooldown';
    cooldown.dataset.itemCooldown = 'true';
    cooldown.hidden = true;

    const cooldownPie = document.createElement('span');
    cooldownPie.className = 'inventory-cell-cooldown-pie';
    cooldownPie.dataset.itemCooldownPie = 'true';
    cooldown.append(cooldownPie);

    const cooldownLabel = document.createElement('span');
    cooldownLabel.className = 'inventory-cell-cooldown-label';
    cooldownLabel.dataset.itemCooldownLabel = 'true';
    cooldown.append(cooldownLabel);

    const head = document.createElement('div');
    head.className = 'inventory-cell-head';
    const type = document.createElement('span');
    type.className = 'inventory-cell-type';
    type.dataset.itemType = 'true';
    head.append(type);
    const count = document.createElement('span');
    count.className = 'inventory-cell-count';
    count.dataset.itemCount = 'true';
    head.append(count);

    const name = document.createElement('div');
    name.className = 'inventory-cell-name';
    name.dataset.itemName = 'true';

    const actions = document.createElement('div');
    actions.className = 'inventory-cell-actions';
    actions.dataset.itemActions = 'true';
    const dropButton = createSmallBtn('丢下', {
      variants: ['danger'],
      dataset: { inlineDrop: String(slotIndex) },
    });
    actions.append(dropButton);

    cell.append(cooldown, head, name, actions);
    return cell;
  }

  /** syncGridChildren：同步Grid Children。 */
  private syncGridChildren(grid: HTMLElement, orderedCells: HTMLElement[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const allowed = new Set(orderedCells);
    for (const child of Array.from(grid.children)) {
      if (!(child instanceof HTMLElement) || !allowed.has(child)) {
        child.remove();
      }
    }
    let reference: ChildNode | null = grid.firstChild;
    for (const cell of orderedCells) {
      if (reference !== cell) {
        grid.insertBefore(cell, reference);
      }
      reference = cell.nextSibling;
    }
  }  
  /**
 * patchInventoryCell：执行patch背包Cell相关逻辑。
 * @param cell HTMLElement 参数说明。
 * @param item ItemStack 道具。
 * @param slotIndex number 参数说明。
 * @param cooldownState InventoryItemCooldownState | null 参数说明。
 * @returns 返回是否满足patch背包Cell条件。
 */


  private patchInventoryCell(
    cell: HTMLElement,
    item: ItemStack,
    slotIndex: number,
    cooldownState: InventoryItemCooldownState | null,
  ): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const typeNode = cell.querySelector<HTMLElement>('[data-item-type="true"]');
    const countNode = cell.querySelector<HTMLElement>('[data-item-count="true"]');
    const nameNode = cell.querySelector<HTMLElement>('[data-item-name="true"]');
    const cooldownNode = cell.querySelector<HTMLElement>('[data-item-cooldown="true"]');
    const cooldownPieNode = cell.querySelector<HTMLElement>('[data-item-cooldown-pie="true"]');
    const cooldownLabelNode = cell.querySelector<HTMLElement>('[data-item-cooldown-label="true"]');
    const actionsNode = cell.querySelector<HTMLElement>('[data-item-actions="true"]');
    if (!typeNode || !countNode || !nameNode || !cooldownNode || !cooldownPieNode || !cooldownLabelNode || !actionsNode) {
      return false;
    }

    const itemMeta = getItemDisplayMeta(item);
    const displayName = itemMeta.displayItem.name;
    const primaryAction = this.getPrimaryAction(item);
    let primaryButton = actionsNode.querySelector<HTMLButtonElement>('[data-item-primary="true"]');
    const dropButton = actionsNode.querySelector<HTMLButtonElement>('[data-inline-drop]');
    if (!dropButton) {
      return false;
    }

    if (primaryAction) {
      if (!primaryButton) {
        primaryButton = createSmallBtn(primaryAction.label, { dataset: { itemPrimary: 'true' } });
        actionsNode.insertBefore(primaryButton, dropButton);
      }
      primaryButton.textContent = primaryAction.label;
      primaryButton.dataset.inlinePrimary = String(slotIndex);
      primaryButton.disabled = primaryAction.disabled === true;
    } else if (primaryButton) {
      primaryButton.remove();
    }

    let affinityNode = cell.querySelector<HTMLElement>('[data-item-affinity="true"]');
    if (itemMeta.affinityBadge) {
      if (!affinityNode) {
        affinityNode = document.createElement('span');
        affinityNode.dataset.itemAffinity = 'true';
        cell.append(affinityNode);
      }
      affinityNode.textContent = itemMeta.affinityBadge.label;
      affinityNode.title = itemMeta.affinityBadge.title;
      affinityNode.className = `item-card-chip item-card-chip--affinity item-card-chip--${itemMeta.affinityBadge.tone} item-card-chip--element-${itemMeta.affinityBadge.element}`;
    } else {
      affinityNode?.remove();
    }

    let levelNode = cell.querySelector<HTMLElement>('[data-item-level="true"]');
    if (itemMeta.levelLabel) {
      if (!levelNode) {
        levelNode = document.createElement('span');
        levelNode.className = 'item-card-chip item-card-chip--level';
        levelNode.dataset.itemLevel = 'true';
        cell.append(levelNode);
      }
      levelNode.textContent = itemMeta.levelLabel;
    } else {
      levelNode?.remove();
    }

    cell.dataset.itemKey = this.getItemIdentity(item);
    cell.dataset.openItem = String(slotIndex);
    cell.dataset.itemSlot = String(slotIndex);
    if (itemMeta.grade) {
      cell.dataset.itemGrade = itemMeta.grade;
    } else {
      delete cell.dataset.itemGrade;
    }
    cell.className = getItemDecorClassName('inventory-cell', item);
    cell.classList.toggle('inventory-cell--cooldown', cooldownState !== null);

    typeNode.textContent = getItemAffixTypeLabel(item, getItemTypeLabel(item.type));
    countNode.textContent = formatDisplayCountBadge(item.count);
    nameNode.textContent = displayName;
    nameNode.title = displayName;
    nameNode.className = `inventory-cell-name ${this.getNameClass(displayName)}`.trim();
    dropButton.dataset.inlineDrop = String(slotIndex);

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
    return true;
  }

  /** renderModal：渲染弹窗。 */
  private renderModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const displayItem = getItemDisplayMeta(item).displayItem;
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
    const bonusLines = item.type === 'equipment'
      ? describeEquipmentBonuses(previewItem)
      : describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
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
      title: displayItem.name,
      subtitle: `${getItemTypeLabel(item.type)} · 数量 ${formatDisplayCountBadge(item.count)}`,
      renderBody: (body) => {
        this.renderItemDetailBody(body, item, sourceListHtml, sourceEntryCount, canToggleSourceList, primaryAction, canBatchUse, canBatchDropOrDestroy, bonusLines, effectLines, statusLabel);
      },
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

  /** renderActionDialog：渲染动作对话。 */
  private renderActionDialog(item: ItemStack, slotIndex: number, dialog: InventoryActionDialogState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const labels = this.resolveActionLabels(dialog.kind);
    const maxCount = item.count;
    const halfCount = Math.max(1, Math.ceil(maxCount / 2));
    const selectedCount = Math.max(1, Math.min(maxCount, dialog.defaultCount));
    const specialUseSummary = dialog.kind === 'use' ? this.getSpecialUseConfirmSummary(item) : null;
    const displayName = getItemDisplayMeta(item).displayItem.name;

    if (dialog.confirmDestroy) {
      detailModalHost.open({
        ownerId: InventoryPanel.MODAL_OWNER,
        title: '确认摧毁',
        subtitle: `${displayName} · 数量 ${formatDisplayCountBadge(selectedCount)}`,
        hint: '点击空白处取消',
        renderBody: (body) => {
          this.renderDestroyConfirmBody(body);
        },
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
        subtitle: `${displayName} · 数量 ${formatDisplayCountBadge(1)}`,
        hint: '点击空白处取消',
        renderBody: (body) => {
          this.renderSpecialUseConfirmBody(body, specialUseSummary);
        },
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
      subtitle: `${displayName} · 当前最多 ${formatDisplayInteger(maxCount)} 个`,
      hint: '点击空白处取消',
      renderBody: (body) => {
        this.renderActionDialogBody(body, labels, selectedCount, halfCount, maxCount);
      },
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

  /** renderItemDetailBody：渲染物品详情主体。 */
  private renderItemDetailBody(
    body: HTMLElement,
    item: ItemStack,
    sourceListHtml: string,
    sourceEntryCount: number,
    canToggleSourceList: boolean,
    primaryAction: InventoryPrimaryAction | null,
    canBatchUse: boolean,
    canBatchDropOrDestroy: boolean,
    bonusLines: string[],
    effectLines: string[],
    statusLabel: string | null,
  ): void {
    const previewItem = resolvePreviewItem(item);
    body.replaceChildren(createFragmentFromHtml(`
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
        <strong>装备属性</strong>
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
    `));
  }

  /** renderDestroyConfirmBody：渲染摧毁确认主体。 */
  private renderDestroyConfirmBody(body: HTMLElement): void {
    body.replaceChildren(createFragmentFromHtml(`
      <div class="panel-section">
        <div class="empty-hint">摧毁后物品会永久消失，无法找回。</div>
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-destroy-back>返回修改数量</button>
          <button class="small-btn danger" type="button" data-inventory-destroy-confirm>确认摧毁</button>
        </div>
      </div>
    `));
  }

  /** renderSpecialUseConfirmBody：渲染特殊使用确认主体。 */
  private renderSpecialUseConfirmBody(
    body: HTMLElement,
    summary: {    
    /**
 * title：title名称或显示文本。
 */
 title: string;    
 /**
 * lines：line相关字段。
 */
 lines: string[];    
 /**
 * confirmLabel：confirmLabel名称或显示文本。
 */
 confirmLabel?: string;    
 /**
 * cancelLabel：cancelLabel名称或显示文本。
 */
 cancelLabel?: string },
  ): void {
    body.replaceChildren(createFragmentFromHtml(`
      <div class="ui-detail-field ui-detail-field--section">
        <strong>使用说明</strong>
        ${summary.lines.map((line) => `<div>${this.escapeHtml(line)}</div>`).join('')}
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-action-cancel>${this.escapeHtml(summary.cancelLabel ?? '返回详情')}</button>
          <button class="small-btn" type="button" data-inventory-action-confirm>${this.escapeHtml(summary.confirmLabel ?? '确认使用')}</button>
        </div>
      </div>
    `));
  }

  /** renderActionDialogBody：渲染动作对话主体。 */
  private renderActionDialogBody(
    body: HTMLElement,
    labels: {    
    /**
 * title：title名称或显示文本。
 */
 title: string;    
 /**
 * confirm：confirm相关字段。
 */
 confirm: string;    
 /**
 * danger：danger相关字段。
 */
 danger: boolean },
    selectedCount: number,
    halfCount: number,
    maxCount: number,
  ): void {
    body.replaceChildren(createFragmentFromHtml(`
      <div class="ui-detail-field ui-detail-field--section">
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
    `));
  }

  /** patchList：处理patch列表。 */
  private patchList(inventory: Inventory): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const refs = this.ensureShell();
    refs.title.textContent = `背包 (${formatDisplayInteger(inventory.items.length)}/${formatDisplayInteger(inventory.capacity)})`;

    for (const tab of INVENTORY_FILTER_TABS) {
      const button = refs.filters.querySelector<HTMLElement>(`[data-filter-button="${CSS.escape(tab.id)}"]`);
      if (!button) {
        return false;
      }
      button.classList.toggle('active', this.activeFilter === tab.id);
    }

    const visibleItems = this.getVisibleItems(inventory);
    this.syncRenderedVisibleCount(visibleItems.length);
    const renderedItems = visibleItems.slice(0, this.renderedVisibleCount);
    if (visibleItems.length === 0) {
      refs.empty.hidden = false;
      refs.empty.textContent = inventory.items.length === 0 ? '背包空空如也' : '当前分类暂无物品';
      refs.grid.hidden = true;
      refs.grid.replaceChildren();
      refs.loadHint.hidden = true;
      refs.loadHint.textContent = '';
      this.lastStructureState = this.buildStructureStateFromVisibleItems(renderedItems);
      return true;
    }

    refs.empty.hidden = true;
    refs.grid.hidden = false;
    const cooldownStateMap = this.getCooldownStateMap(inventory);
    if (renderedItems.length < visibleItems.length) {
      refs.loadHint.hidden = false;
      refs.loadHint.textContent = `向下滚动继续加载（已显示 ${formatDisplayInteger(renderedItems.length)} / ${formatDisplayInteger(visibleItems.length)}）`;
    } else {
      refs.loadHint.hidden = true;
      refs.loadHint.textContent = '';
    }

    const existingCells = new Map<string, HTMLElement>();
    refs.grid.querySelectorAll<HTMLElement>('[data-item-slot]').forEach((cell) => {
      const slot = cell.dataset.itemSlot;
      if (slot) {
        existingCells.set(slot, cell);
      }
    });

    const orderedCells = renderedItems.map(({ item, slotIndex }) => {
      const key = String(slotIndex);
      const cell = existingCells.get(key) ?? this.createInventoryCell(slotIndex);
      existingCells.delete(key);
      const cooldownState = cooldownStateMap.get(item.itemId) ?? null;
      if (!this.patchInventoryCell(cell, item, slotIndex, cooldownState)) {
        return null;
      }
      return cell;
    });
    if (orderedCells.some((cell) => cell === null)) {
      return false;
    }
    this.syncGridChildren(refs.grid, orderedCells.filter((cell): cell is HTMLElement => cell !== null));
    for (const cell of existingCells.values()) {
      cell.remove();
    }

    this.lastStructureState = this.buildStructureStateFromVisibleItems(renderedItems);
    return true;
  }

  /** patchModal：处理patch弹窗。 */
  private patchModal(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** resolveSelectedItem：解析Selected物品。 */
  private resolveSelectedItem(inventory: Inventory): {  
  /**
 * item：道具相关字段。
 */
 item: ItemStack;  
 /**
 * slotIndex：slotIndex相关字段。
 */
 slotIndex: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** canUseItem：判断是否使用物品。 */
  private canUseItem(item: ItemStack): boolean {
    return INVENTORY_PANEL_USABLE_ITEM_TYPES.has(item.type);
  }

  /** canBatchUseItem：判断是否Batch使用物品。 */
  private canBatchUseItem(item: ItemStack): boolean {
    return item.allowBatchUse === true && this.canUseItem(item) && item.count > 1;
  }

  /** getUseCountFromInput：读取使用数量From输入。 */
  private getUseCountFromInput(input: HTMLInputElement | null, maxCount: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const rawValue = input?.value ?? '1';
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(maxCount, parsed));
  }

  /** syncActionCountInputWidth：同步动作数量输入Width。 */
  private syncActionCountInputWidth(input: HTMLInputElement | null, maxCount: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!input) {
      return;
    }
    const valueLength = Math.max(1, input.value.trim().length);
    const maxLength = Math.max(1, String(maxCount).length);
    const chars = Math.max(4, valueLength, maxLength) + 1;
    input.style.width = `calc(${chars}ch + 18px)`;
  }

  /** canBatchDropOrDestroy：判断是否Batch掉落Or Destroy。 */
  private canBatchDropOrDestroy(item: ItemStack): boolean {
    return item.count > 1;
  }

  /** getSpiritualRootSeedTier：读取Spiritual Root种子Tier。 */
  private getSpiritualRootSeedTier(item: ItemStack): 'heaven' | 'divine' | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.itemId === HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID) {
      return 'heaven';
    }
    if (item.itemId === DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID) {
      return 'divine';
    }
    return null;
  }

  /** requiresUseConfirmation：处理requires使用Confirmation。 */
  private requiresUseConfirmation(item: ItemStack): boolean {
    return this.getSpiritualRootSeedTier(item) !== null
      || item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
      || this.getTechniqueLearningWarningSummary(item) !== null;
  }

  /** getHeavenGateRerollCount：读取Heaven关卡Reroll数量。 */
  private getHeavenGateRerollCount(averageBonus: number): number {
    return Math.max(0, Math.floor(Math.max(0, averageBonus) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
  }

  /** getHeavenGateRerollCost：读取Heaven关卡Reroll Cost。 */
  private getHeavenGateRerollCost(realm: PlayerRealmState | null): number {
    return Math.max(1, Math.round(Math.max(1, Math.floor(realm?.progressToNext ?? 1)) * HEAVEN_GATE_REROLL_COST_RATIO));
  }

  /** getSpiritualRootSeedEquivalentRerollCount：读取Spiritual Root种子Equivalent Reroll数量。 */
  private getSpiritualRootSeedEquivalentRerollCount(tier: 'heaven' | 'divine'): number {
    return tier === 'divine' ? 100 : 10;
  }

  /** getSpecialUseConfirmSummary：读取Special使用Confirm摘要。 */
  private getSpecialUseConfirmSummary(item: ItemStack): {  
  /**
 * title：title名称或显示文本。
 */

    title: string;    
    /**
 * lines：line相关字段。
 */

    lines: string[];    
    /**
 * confirmLabel：confirmLabel名称或显示文本。
 */

    confirmLabel?: string;    
    /**
 * cancelLabel：cancelLabel名称或显示文本。
 */

    cancelLabel?: string;
  } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const techniqueWarningSummary = this.getTechniqueLearningWarningSummary(item);
    if (techniqueWarningSummary) {
      return techniqueWarningSummary;
    }
    const tier = this.getSpiritualRootSeedTier(item);
    if (tier) {
      const currentRerollCount = this.getHeavenGateRerollCount(this.playerHeavenGate?.averageBonus ?? 0);
      const gainedRerollCount = this.getSpiritualRootSeedEquivalentRerollCount(tier);
      const reducedCount = Math.max(0, gainedRerollCount - currentRerollCount);
      const foundationCost = this.getHeavenGateRerollCost(this.playerRealm) * reducedCount;
      const remainingFoundation = Math.max(0, this.playerFoundation - foundationCost);
      const nextRerollCount = currentRerollCount + gainedRerollCount;
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
        title: tier === 'divine' ? '确认使用神品灵根幼苗' : '确认使用天品灵根幼苗',
        lines,
      };
    }
    const currentRerollCount = this.getHeavenGateRerollCount(this.playerHeavenGate?.averageBonus ?? 0);
    if (item.itemId !== SHATTER_SPIRIT_PILL_ITEM_ID) {
      return null;
    }
    const currentExp = Math.max(0, Math.floor(this.playerRealm?.progress ?? 0));
    const expCost = Math.max(0, Math.round(currentExp * SHATTER_SPIRIT_PILL_COST_RATIO));
    const remainingExp = Math.max(0, currentExp - expCost);
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

  /** getTechniqueLearningWarningSummary：读取Technique Learning Warning摘要。 */
  private getTechniqueLearningWarningSummary(item: ItemStack): {
  /**
 * title：title名称或显示文本。
 */

    title: string;    
    /**
 * lines：line相关字段。
 */

    lines: string[];    
    /**
 * confirmLabel：confirmLabel名称或显示文本。
 */

    confirmLabel?: string;    
    /**
 * cancelLabel：cancelLabel名称或显示文本。
 */

    cancelLabel?: string;
  } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.type !== 'skill_book') {
      return null;
    }
    const playerRealmLv = Number.isFinite(this.playerRealm?.realmLv)
      ? Math.max(1, Math.floor(Number(this.playerRealm?.realmLv)))
      : null;
    if (playerRealmLv === null) {
      return null;
    }
    const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
    if (!techniqueId) {
      return null;
    }
    const technique = getLocalTechniqueTemplate(techniqueId);
    if (!technique || !Number.isFinite(technique.realmLv)) {
      return null;
    }
    const techniqueRealmLv = Math.max(1, Math.floor(Number(technique.realmLv)));
    if (!shouldWarnTechniqueLearningDifficulty(playerRealmLv, techniqueRealmLv)) {
      return null;
    }
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

  /** formatTechniqueAttrSummary：格式化功法属性摘要。 */
  private formatTechniqueAttrSummary(item: NonNullable<ReturnType<typeof getLocalTechniqueTemplate>>): string {
    const maxLevel = Math.max(
      1,
      ...((item.layers ?? []).map((layer) => Math.max(1, Math.floor(layer.level)))),
    );
    const totalAttrs = calcTechniqueAttrValues(maxLevel, item.layers);
    const parts = TECHNIQUE_ATTR_KEYS
      .map((key) => {
        const value = totalAttrs[key] ?? 0;
        if (value <= 0) {
          return null;
        }
        return `${getAttrKeyLabel(key)}+${formatDisplayNumber(value)}`;
      })
      .filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? parts.join(' / ') : '无属性提升';
  }

  /** buildTechniqueBookSummaryFields：构建功法书概要。 */
  private buildTechniqueBookSummaryFields(item: ItemStack): Array<{ label: string; value: string }> {
    const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
    if (!techniqueId) {
      return [];
    }
    const technique = getLocalTechniqueTemplate(techniqueId);
    if (!technique) {
      return [];
    }
    const realmLabel = technique.realmLv
      ? (getLocalRealmLevelEntry(technique.realmLv)?.displayName ?? `Lv.${formatDisplayInteger(technique.realmLv)}`)
      : '未知';
    const skillNames = (technique.skills ?? [])
      .map((skill) => skill.name.trim())
      .filter((name) => name.length > 0);
    return [
      { label: '功法', value: technique.name },
      { label: '境界', value: realmLabel },
      { label: '品阶', value: getTechniqueGradeLabel(technique.grade) },
      { label: '满层属性', value: this.formatTechniqueAttrSummary(technique) },
      {
        label: `附带技能${skillNames.length > 0 ? `（${formatDisplayInteger(skillNames.length)}）` : ''}`,
        value: skillNames.length > 0 ? skillNames.join('、') : '无',
      },
    ];
  }

  /** openActionDialog：打开动作对话。 */
  private openActionDialog(kind: InventoryActionKind, slotIndex: number, defaultCount: number): void {
    this.actionDialog = {
      kind,
      slotIndex,
      defaultCount: Math.max(1, defaultCount),
      confirmDestroy: false,
    };
    this.renderModal();
  }

  /** resolveActionLabels：解析动作标签。 */
  private resolveActionLabels(kind: InventoryActionKind): {  
  /**
 * title：title名称或显示文本。
 */

    title: string;    
    /**
 * confirm：confirm相关字段。
 */

    confirm: string;    
    /**
 * danger：danger相关字段。
 */

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

  /** getPrimaryAction：读取Primary动作。 */
  private getPrimaryAction(item: ItemStack): InventoryPrimaryAction | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** getItemStatusLabel：读取物品状态标签。 */
  private getItemStatusLabel(item: ItemStack): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const cooldownState = this.getItemCooldownState(item);
    const cooldownLeft = this.getItemCooldownRemainingTicks(cooldownState);
    if (cooldownLeft > 0) {
      return `冷却 ${formatDisplayInteger(cooldownLeft)} 息`;
    }
    if (item.type === 'skill_book') {
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
      if (techniqueId && this.learnedTechniqueIds.has(techniqueId)) {
        return '已学';
      }
    }
    const mapIds = item.mapUnlockIds && item.mapUnlockIds.length > 0
      ? item.mapUnlockIds
      : item.mapUnlockId
        ? [item.mapUnlockId]
        : [];
    if (mapIds.length > 0 && mapIds.every((mapId) => this.unlockedMinimapIds.has(mapId))) {
      return '已阅';
    }
    return null;
  }

  /** getEquippedItemForCompare：读取Equipped物品For Compare。 */
  private getEquippedItemForCompare(item: ItemStack): ItemStack | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.type !== 'equipment' || !item.equipSlot) {
      return null;
    }
    return this.equippedItemsBySlot[item.equipSlot] ?? null;
  }

  /** getCooldownStateMap：读取冷却状态地图。 */
  private getCooldownStateMap(inventory: Inventory): Map<string, InventoryItemCooldownState> {
    return new Map(
      (inventory.cooldowns ?? [])
        .filter((entry) => this.getItemCooldownRemainingTicks(entry) > 0)
        .map((entry) => [entry.itemId, entry] as const),
    );
  }

  /** getItemCooldownState：读取物品冷却状态。 */
  private getItemCooldownState(item: ItemStack, inventory: Inventory | null = this.lastInventory): InventoryItemCooldownState | null {
    const cooldownState = inventory?.cooldowns?.find((entry) => entry.itemId === item.itemId) ?? null;
    return this.getItemCooldownRemainingTicks(cooldownState) > 0 ? cooldownState : null;
  }

  /** getItemCooldownRemainingTicks：读取物品冷却Remaining Ticks。 */
  private getItemCooldownRemainingTicks(cooldownState: InventoryItemCooldownState | null): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!cooldownState) {
      return 0;
    }
    return resolveInventoryCooldownLeft(cooldownState.cooldown, cooldownState.startedAtTick);
  }

  /** getItemTooltipCooldownState：读取物品提示冷却状态。 */
  private getItemTooltipCooldownState(item: ItemStack): ItemTooltipCooldownState | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const cooldownState = this.getItemCooldownState(item);
    if (!cooldownState) {
      return null;
    }
    const cooldownLeft = this.getItemCooldownRemainingTicks(cooldownState);
    return cooldownLeft > 0
      ? { cooldown: cooldownState.cooldown, cooldownLeft }
      : null;
  }

  /** getItemCooldownRatio：读取物品冷却Ratio。 */
  private getItemCooldownRatio(cooldownState: InventoryItemCooldownState | null): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!cooldownState) {
      return 0;
    }
    const cooldown = Math.max(1, cooldownState.cooldown);
    return Math.max(0, Math.min(1, this.getItemCooldownRemainingTicks(cooldownState) / cooldown));
  }

  /** getItemCooldownTitle：读取物品冷却标题。 */
  private getItemCooldownTitle(cooldownState: InventoryItemCooldownState): string {
    return `使用冷却 ${formatDisplayInteger(this.getItemCooldownRemainingTicks(cooldownState))} / ${formatDisplayInteger(cooldownState.cooldown)} 息`;
  }

  /** getNameClass：读取名称Class。 */
  private getNameClass(name: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const length = [...name].length;
    if (length >= 7) {
      return 'inventory-cell-name--tiny';
    }
    if (length >= 5) {
      return 'inventory-cell-name--compact';
    }
    return '';
  }

  /** getItemIdentity：读取物品身份。 */
  private getItemIdentity(item: ItemStack): string {
    return createItemStackSignature(item);
  }

  /** getVisibleItems：读取可见物品。 */
  private getVisibleItems(inventory: Inventory): Array<{  
  /**
 * item：道具相关字段。
 */
 item: ItemStack;  
 /**
 * slotIndex：slotIndex相关字段。
 */
 slotIndex: number }> {
    return inventory.items
      .map((item, slotIndex) => ({ item, slotIndex }))
      .filter(({ item }) => this.activeFilter === 'all' || item.type === this.activeFilter);
  }

  /** syncRenderedVisibleCount：同步Rendered可见数量。 */
  private syncRenderedVisibleCount(totalVisibleItems: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (totalVisibleItems <= 0) {
      this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
      return;
    }
    const minimumVisibleCount = Math.min(INVENTORY_INITIAL_RENDER_COUNT, totalVisibleItems);
    this.renderedVisibleCount = Math.min(
      totalVisibleItems,
      Math.max(minimumVisibleCount, this.renderedVisibleCount),
    );
  }

  /** maybeLoadMoreVisibleItems：处理maybe Load More可见物品。 */
  private maybeLoadMoreVisibleItems(scrollTarget?: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.lastInventory || !this.isPaneVisible()) {
      return;
    }
    const visibleItemCount = this.getVisibleItems(this.lastInventory).length;
    if (visibleItemCount === 0 || this.renderedVisibleCount >= visibleItemCount) {
      return;
    }
    const scrollContainer = this.resolveScrollContainer(scrollTarget);
    if (!scrollContainer) {
      return;
    }
    const remainingDistance = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    if (remainingDistance > INVENTORY_LOAD_MORE_THRESHOLD_PX) {
      return;
    }
    const nextRenderedCount = Math.min(visibleItemCount, this.renderedVisibleCount + INVENTORY_RENDER_BATCH_SIZE);
    if (nextRenderedCount === this.renderedVisibleCount) {
      return;
    }
    this.renderedVisibleCount = nextRenderedCount;
    const previousScrollTop = scrollContainer.scrollTop;
    this.render(this.lastInventory);
    scrollContainer.scrollTop = previousScrollTop;
    this.scheduleLoadMoreCheck(scrollContainer);
  }

  /** scheduleLoadMoreCheck：调度Load More检查。 */
  private scheduleLoadMoreCheck(scrollTarget?: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.pendingLoadMoreFrame !== null) {
      cancelAnimationFrame(this.pendingLoadMoreFrame);
    }
    this.pendingLoadMoreFrame = requestAnimationFrame(() => {
      this.pendingLoadMoreFrame = null;
      this.maybeLoadMoreVisibleItems(scrollTarget);
    });
  }

  /** resolveScrollContainer：解析Scroll容器。 */
  private resolveScrollContainer(preferredTarget?: HTMLElement): HTMLElement | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (preferredTarget && preferredTarget.contains(this.pane) && this.isScrollableContainer(preferredTarget)) {
      return preferredTarget;
    }
    let current: HTMLElement | null = this.pane.parentElement;
    while (current) {
      if (this.isScrollableContainer(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /** isScrollableContainer：判断是否Scrollable容器。 */
  private isScrollableContainer(element: HTMLElement): boolean {
    const { overflowY } = window.getComputedStyle(element);
    return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && element.clientHeight > 0;
  }

  /** isPaneVisible：判断是否Pane可见。 */
  private isPaneVisible(): boolean {
    return !this.pane.classList.contains('hidden') && this.pane.getClientRects().length > 0;
  }

  /** scrollToTop：处理scroll To Top。 */
  private scrollToTop(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const scrollContainer = this.resolveScrollContainer();
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  }

  /** buildStructureState：构建Structure状态。 */
  private buildStructureState(inventory: Inventory): InventoryStructureState {
    return this.buildStructureStateFromVisibleItems(this.getVisibleItems(inventory).slice(0, this.renderedVisibleCount));
  }  
  /**
 * buildStructureStateFromVisibleItems：构建并返回目标对象。
 * @param visibleItems Array<{ item: ItemStack; slotIndex: number }> 参数说明。
 * @returns 返回Structure状态From可见道具。
 */


  private buildStructureStateFromVisibleItems(
    visibleItems: Array<{    
    /**
 * item：道具相关字段。
 */
 item: ItemStack;    
 /**
 * slotIndex：slotIndex相关字段。
 */
 slotIndex: number }>,
  ): InventoryStructureState {
    return {
      filter: this.activeFilter,
      items: visibleItems.map(({ item, slotIndex }) => ({
        slotIndex,
        identity: this.getItemIdentity(item),
      })),
    };
  }  
  /**
 * isSameStructureState：判断SameStructure状态是否满足条件。
 * @param previous InventoryStructureState | null 参数说明。
 * @param next InventoryStructureState 参数说明。
 * @returns 返回是否满足SameStructure状态条件。
 */


  private isSameStructureState(
    previous: InventoryStructureState | null,
    next: InventoryStructureState,
  ): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** buildTooltipPayload：构建提示载荷。 */
  private buildTooltipPayload(item: ItemStack) {
    return buildItemTooltipPayload({
      ...item,
      type: item.type === 'skill_book' ? 'skill_book' : item.type,
    }, {
      learnedTechniqueIds: this.learnedTechniqueIds,
      unlockedMinimapIds: this.unlockedMinimapIds,
      equippedItem: this.getEquippedItemForCompare(item),
      itemCooldown: this.getItemTooltipCooldownState(item),
    });
  }

  /** hasActiveCooldowns：判断是否活跃Cooldowns。 */
  private hasActiveCooldowns(inventory: Inventory | null = this.lastInventory): boolean {
    return (inventory?.cooldowns ?? []).some((entry) => this.getItemCooldownRemainingTicks(entry) > 0);
  }

  /** refreshTooltipContent：处理refresh提示Content。 */
  private refreshTooltipContent(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.tooltipCell || !this.lastInventory) {
      return;
    }
    const rawIndex = this.tooltipCell.dataset.itemSlot;
    if (!rawIndex) {
      return;
    }
    const item = this.lastInventory.items[parseInt(rawIndex, 10)];
    if (!item) {
      return;
    }
    const tooltip = this.buildTooltipPayload(item);
    this.tooltip.updateContent(tooltip.title, tooltip.lines, {
      allowHtml: tooltip.allowHtml,
      asideCards: tooltip.asideCards,
    });
  }

  /** syncCooldownRefresh：同步冷却Refresh。 */
  private syncCooldownRefresh(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** closeModal：关闭弹窗。 */
  private closeModal(): void {
    this.resetModalState();
    this.tooltipCell = null;
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }

  /** resetModalState：重置弹窗状态。 */
  private resetModalState(): void {
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.actionDialog = null;
    this.lastModalRenderKey = null;
    this.sourceExpanded = false;
    this.sourceExpandedItemKey = null;
  }

  /** buildModalRenderKey：构建弹窗渲染Key。 */
  private buildModalRenderKey(item: ItemStack): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** escapeHtml：转义 HTML 文本中的危险字符。 */
  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

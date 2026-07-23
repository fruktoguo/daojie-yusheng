/**
 * 本文件是客户端 DOM UI 的 inventory panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 背包面板
 * 展示物品网格列表，支持分类筛选、使用/装备/丢弃操作与物品详情弹层
 */
import {
  EquipSlot,
  EQUIP_SLOTS,
  HeavenGateState,
  Inventory,
  InventoryItemCooldownState,
  ItemStack,
  MERIT_ITEM_ID,
  PlayerState,
  PlayerRealmState,
  FORMATION_DISK_TIER_LABELS,
  FormationCreatePayload,
  createItemStackSignature,
  getFirstGrapheme,
  getGraphemeCount,
  getTechniqueMaxLevel,
  matchesInventoryTypeFilter,
  type C2S_RequestInventoryPage,
  type S2C_InventoryPage,
  type SyncedItemStack,
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
import {
  fetchTechniqueTemplateForBookItem,
  getLocalTechniqueTemplate,
  resolvePreviewItem,
  resolveTechniqueIdFromBookItem,
} from '../../content/local-templates';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import {
  buildItemTooltipPayload,
  describeEquipmentBonuses,
  describeItemEffectDetails,
  describeMaterialValueDetails,
  ItemTooltipCooldownState,
} from '../equipment-tooltip';
import { renderTechniqueBookDetailHtml } from '../technique-book-detail';
import { getItemDecorClassName, getItemDisplayMeta, type ItemDisplayMeta } from '../item-display';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint, createPanelSectionWithTitle, createSmallBtn } from '../ui-primitives';
import { describePreviewBonuses } from '../stat-preview';
import { INVENTORY_FILTER_TABS, InventoryFilter } from '../../constants/ui/inventory';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import {
  INVENTORY_PANEL_TOOLTIP_STYLE_ID,
  INVENTORY_PANEL_USABLE_ITEM_TYPES,
} from '../../constants/ui/inventory-panel';
import { t } from '../i18n';
import {
  mountReactInventoryPanel,
  setReactInventoryPanelCallbacks,
  shouldUseReactInventoryPanel,
  syncReactInventoryPanelState,
  unmountReactInventoryPanel,
} from '../../react-ui/panels/inventory/mount-inventory-panel';
import type { ReactInventoryItemView } from '../../react-ui/panels/inventory/InventoryPanel';
import {
  InventoryPageRequestState,
  normalizeInventoryPageLimit,
  normalizeInventoryPageOffset,
  normalizeInventoryPageSearch,
  normalizeInventoryRevision,
} from './inventory-page-request-state';
import {
  InventoryBulkDiscardDialogController,
} from './inventory-bulk-discard-dialog';
import {
  InventoryItemActionDialogController,
  type InventoryActionKind,
} from './inventory-item-action-dialog';
import {
  InventoryFormationDialogController,
  type FormationRangePreviewPayload,
} from './inventory-formation-dialog';

type UseItemOptions = {
  sectName?: string;
  sectMark?: string;
};

type InventoryCellRibbon = {
  label: string;
  title?: string;
};

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
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
 * filterButtons：筛选按钮缓存。
 */

  filterButtons: Map<InventoryFilter, HTMLButtonElement>;
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
  pager: HTMLDivElement;
  pagerPrev: HTMLButtonElement;
  pagerStatus: HTMLSpanElement;
  pagerNext: HTMLButtonElement;
  searchInput: HTMLInputElement;
}

/** InventoryCellRefs：背包格子内部稳定节点引用。 */
interface InventoryCellRefs {
  type: HTMLElement;
  learnedRibbon: HTMLElement;
  count: HTMLElement;
  gradeLine: HTMLElement;
  name: HTMLElement;
  cooldown: HTMLElement;
  cooldownPie: HTMLElement;
  cooldownLabel: HTMLElement;
}

/** InventoryVisibleSnapshot：单次背包筛选收集结果。 */
interface InventoryVisibleSnapshot {
  totalVisibleItems: number;
  renderedItems: Array<{ item: ItemStack; slotIndex: number }>;
}

/** InventoryPagedSnapshot：服务端分页缓存。 */
interface InventoryPagedSnapshot {
  filter: InventoryFilter;
  search: string;
  revision: number;
  totalItems: number;
  totalVisibleItems: number;
  capacity: number;
  offset: number;
  limit: number;
  items: Array<{ item: ItemStack; slotIndex: number }>;
}

/** INVENTORY_SOURCE_COLLAPSED_COUNT：背包来源COLLAPSED数量。 */
const INVENTORY_SOURCE_COLLAPSED_COUNT = 3;
const FORMATION_DISK_MULTIPLIER_BY_ITEM_ID: Record<string, number> = {
  'formation_disk.mortal': 1,
  'formation_disk.yellow': 2,
  'formation_disk.mystic': 4,
  'formation_disk.earth': 8,
};
const FORMATION_DISK_TIER_BY_ITEM_ID: Record<string, keyof typeof FORMATION_DISK_TIER_LABELS> = {
  'formation_disk.mortal': 'mortal',
  'formation_disk.yellow': 'yellow',
  'formation_disk.mystic': 'mystic',
  'formation_disk.earth': 'earth',
};
/** INVENTORY_INITIAL_RENDER_COUNT：背包初始渲染数量。 */
const INVENTORY_INITIAL_RENDER_COUNT = 72;
const INVENTORY_PAGE_SIZE = 30;
/** INVENTORY_RENDER_BATCH_SIZE：背包渲染BATCH SIZE。 */
const INVENTORY_RENDER_BATCH_SIZE = 48;
/** INVENTORY_LOAD_MORE_THRESHOLD_PX：背包LOAD MORE THRESHOLD PX。 */
const INVENTORY_LOAD_MORE_THRESHOLD_PX = 240;
const INVENTORY_SEARCH_DEBOUNCE_MS = 250;
const INVENTORY_PAGE_REQUEST_TIMEOUT_MS = 10_000;
/** INVENTORY_COOLDOWN_REFRESH_MS：背包冷却显示按服务端 1Hz tick 刷新。 */
const INVENTORY_COOLDOWN_REFRESH_MS = 1000;

/** formatItemEffects：格式化物品效果。 */
function formatItemEffects(item: ItemStack): string[] {
  return describeItemEffectDetails(item);
}

/** 背包面板：显示物品列表，支持使用和丢弃 */
export class InventoryPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'inventory-panel';
  /** pane：pane。 */
  private pane = document.getElementById('pane-inventory')!;
  /** onUseItem：on使用物品。 */
  private onUseItem: ((itemInstanceId: string, count?: number, options?: UseItemOptions) => void) | null = null;
  private onOpenHeavenlyDaoShop: (() => void) | null = null;
  private onRepairInventoryItemInstanceIds: (() => void) | null = null;
  private onRequestInventoryPage: ((payload: C2S_RequestInventoryPage) => boolean) | null = null;
  /** onDropItem：on掉落物品。 */
  private onDropItem: ((itemInstanceId: string, count: number) => void) | null = null;
  private onBulkDropItems: ((itemInstanceIds: string[]) => void) | null = null;
  /** onDestroyItem：on Destroy物品。 */
  private onDestroyItem: ((itemInstanceId: string, count: number) => void) | null = null;
  /** onEquipItem：on Equip物品。 */
  private onEquipItem: ((itemInstanceId: string) => void) | null = null;
  /** onSortInventory：on排序背包。 */
  private onSortInventory: (() => void) | null = null;
  /** onCreateFormation：on布阵。 */
  private onCreateFormation: ((payload: FormationCreatePayload) => void) | null = null;
  /** onPreviewFormationRange：on预览阵法范围。 */
  private onPreviewFormationRange: ((payload: FormationRangePreviewPayload) => void) | null = null;
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  /** activeFilter：活跃筛选。 */
  private activeFilter: InventoryFilter = 'all';
  /** lastInventory：last背包。 */
  private lastInventory: Inventory | null = null;
  /** cachedScrollContainer：缓存的滚动容器引用，避免 scroll 路径中重复 getComputedStyle。 */
  private cachedScrollContainer: HTMLElement | null | undefined = undefined;
  /** selectedSlotIndex：selected槽位索引。 */
  private selectedSlotIndex: number | null = null;
  /** selectedItemKey：selected物品Key。 */
  private selectedItemKey: string | null = null;
  /** formationDialogSlotIndex：布阵对话槽位。 */
  private formationDialogSlotIndex: number | null = null;
  /** sectFoundingDialogSlotIndex：建宗令建宗面板槽位。 */
  private sectFoundingDialogSlotIndex: number | null = null;
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
  /** playerQi：玩家当前灵气/灵力。 */
  private playerQi = 0;
  /** playerFormationSkillLevel：阵法技艺等级。 */
  private playerFormationSkillLevel = 0;
  private readonly formationDialogController = new InventoryFormationDialogController({
    getInventory: () => this.lastInventory,
    getPlayerQi: () => this.playerQi,
    getFormationSkillLevel: () => this.playerFormationSkillLevel,
    resolveDiskMultiplier: (item) => this.resolveFormationDiskMultiplier(item),
    getItemInstanceId: (item) => this.getInventoryItemInstanceId(item),
    repairMissingItemInstanceIds: () => this.repairMissingInventoryItemInstanceIds(),
    previewRange: (payload) => {
      this.onPreviewFormationRange?.(payload);
    },
  });
  private readonly bulkDiscardDialogController = new InventoryBulkDiscardDialogController({
    ownerId: InventoryPanel.MODAL_OWNER,
    getInventory: () => this.lastInventory,
    getItemInstanceId: (item) => this.getInventoryItemInstanceId(item),
    dropItems: (itemInstanceIds) => this.onBulkDropItems?.(itemInstanceIds),
    closeModal: () => this.closeModal(),
    resetParentModalState: () => this.resetModalState(),
  });
  private readonly itemActionDialogController = new InventoryItemActionDialogController({
    ownerId: InventoryPanel.MODAL_OWNER,
    getPlayerRealm: () => this.playerRealm,
    getPlayerHeavenGate: () => this.playerHeavenGate,
    getPlayerFoundation: () => this.playerFoundation,
    getPlayerContextRevision: () => this.playerContextRevision,
    isFormationDisk: (item) => this.isFormationDiskItem(item),
    getItemInstanceId: (item) => this.getInventoryItemInstanceId(item),
    repairMissingItemInstanceIds: () => this.repairMissingInventoryItemInstanceIds(),
    useItem: (itemInstanceId, count) => this.onUseItem?.(itemInstanceId, count),
    dropItem: (itemInstanceId, count) => this.onDropItem?.(itemInstanceId, count),
    destroyItem: (itemInstanceId, count) => this.onDestroyItem?.(itemInstanceId, count),
    renderParentModal: () => this.renderModal(),
    closeModal: () => this.closeModal(),
    resetParentModalState: () => this.resetModalState(),
  });
  /** lastPlayerContextKey：上次玩家上下文签名。 */
  private lastPlayerContextKey: string | null = null;
  /** playerContextRevision：玩家上下文版本，用于格子渲染缓存失效。 */
  private playerContextRevision = 0;
  /** renderedVisibleCount：rendered可见数量。 */
  private renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
  private pagedSnapshot: InventoryPagedSnapshot | null = null;
  private inventoryPageOffset = 0;
  private inventorySearchQuery = '';
  private inventorySearchRequestTimer: number | null = null;
  private inventoryPageRequestTimeout: number | null = null;
  private readonly inventoryPageRequestState = new InventoryPageRequestState();
  /** pendingLoadMoreFrame：待处理Load More帧。 */
  private pendingLoadMoreFrame: number | null = null;
  /** cooldownRefreshTimer：冷却Refresh Timer。 */
  private cooldownRefreshTimer: number | null = null;
  private inventoryCooldownBaseTick: number | null = null;
  private inventoryCooldownBaseSourceTick: number | null = null;
  private inventoryCooldownBaseSyncedAtMs = performance.now();
  private inventoryCooldownStateCache = new Map<string, InventoryItemCooldownState>();
  /** shellRefs：shell Refs。 */
  private shellRefs: InventoryShellRefs | null = null;
  /** cellBySlotIndex：背包格子索引，避免每次更新扫描 grid。 */
  private cellBySlotIndex = new Map<number, HTMLElement>();
  /** itemIdentityCache：物品签名缓存，避免背包 patch 中重复 JSON 序列化。 */
  private itemIdentityCache = new WeakMap<ItemStack, string>();
  /** cellRefs：格子节点缓存，避免每次 patch 反复 querySelector。 */
  private cellRefs = new WeakMap<HTMLElement, InventoryCellRefs>();
  /** pendingVisibleRefresh：面板不可见期间延迟列表刷新。 */
  private pendingVisibleRefresh = false;
  /** 当前正在按需读取的自创功法模板，按功法 ID 去重。 */
  private readonly pendingTechniqueTemplateIds = new Set<string>();
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
    setReactInventoryPanelCallbacks({
      onFilterChange: (filter) => this.handleReactFilterChange(filter),
      onSortInventory: () => this.onSortInventory?.(),
      onOpenBulkDiscard: () => this.openBulkDiscardModal(),
      onRequestLoadMore: (scrollTarget) => this.maybeLoadMoreVisibleItems(scrollTarget),
      onPageChange: (direction) => this.requestAdjacentInventoryPage(direction),
      onSearchChange: (value) => this.handleInventorySearchInput(value),
      onPrimaryAction: (slotIndex, itemInstanceId) => this.handlePrimaryAction(slotIndex, itemInstanceId, { closeModal: false }),
    });
    this.bindPaneEvents();
    this.bindTooltipEvents();
    const paneVisibilityObserver = new MutationObserver(() => this.flushPendingVisibleRefresh());
    paneVisibilityObserver.observe(this.pane, { attributes: true, attributeFilter: ['class'] });
    for (const mobilePane of document.querySelectorAll<HTMLElement>('#mobile-ui-shell .mobile-ui-pane')) {
      paneVisibilityObserver.observe(mobilePane, { attributes: true, attributeFilter: ['class'] });
    }
    document.addEventListener('scroll', this.handleScrollCapture, { capture: true, passive: true });
  }

  /** clear：清理clear。 */
  clear(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.activeFilter = 'all';
    this.lastInventory = null;
    this.cachedScrollContainer = undefined;
    this.selectedSlotIndex = null;
    this.selectedItemKey = null;
    this.itemActionDialogController.reset();
    this.bulkDiscardDialogController.reset();
    this.formationDialogSlotIndex = null;
    this.sectFoundingDialogSlotIndex = null;
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
    this.playerQi = 0;
    this.lastPlayerContextKey = null;
    this.playerContextRevision = 0;
    this.inventoryCooldownBaseTick = null;
    this.inventoryCooldownBaseSourceTick = null;
    this.inventoryCooldownBaseSyncedAtMs = performance.now();
    this.inventoryCooldownStateCache.clear();
    this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
    this.pagedSnapshot = null;
    this.inventoryPageOffset = 0;
    this.inventorySearchQuery = '';
    this.inventoryPageRequestState.reset();
    if (this.inventorySearchRequestTimer !== null) {
      window.clearTimeout(this.inventorySearchRequestTimer);
      this.inventorySearchRequestTimer = null;
    }
    this.clearInventoryPageRequestTimeout();
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
    this.cellBySlotIndex.clear();
    this.pendingVisibleRefresh = false;
    this.pendingTechniqueTemplateIds.clear();
    if (this.useReactPanel()) {
      this.syncReactState(null);
    } else {
      unmountReactInventoryPanel();
      this.pane.replaceChildren(this.createInventoryEmptyState());
    }
    detailModalHost.close(InventoryPanel.MODAL_OWNER);
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onUse (itemInstanceId: string, count?: number) => void 参数说明。
 * @param onDrop (itemInstanceId: string, count: number) => void 参数说明。
 * @param onDestroy (itemInstanceId: string, count: number) => void 参数说明。
 * @param onEquip (itemInstanceId: string) => void 参数说明。
 * @param onSort () => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onUse: (itemInstanceId: string, count?: number, options?: UseItemOptions) => void,
    onOpenHeavenlyDaoShop: () => void,
    onDrop: (itemInstanceId: string, count: number) => void,
    onBulkDrop: (itemInstanceIds: string[]) => void,
    onDestroy: (itemInstanceId: string, count: number) => void,
    onEquip: (itemInstanceId: string) => void,
    onSort: () => void,
    onRepairInventoryItemInstanceIds: () => void,
    onCreateFormation?: (payload: FormationCreatePayload) => void,
    onPreviewFormationRange?: (payload: FormationRangePreviewPayload) => void,
    onRequestInventoryPage?: (payload: C2S_RequestInventoryPage) => boolean,
  ): void {
    this.onUseItem = onUse;
    this.onOpenHeavenlyDaoShop = onOpenHeavenlyDaoShop;
    this.onDropItem = onDrop;
    this.onBulkDropItems = onBulkDrop;
    this.onDestroyItem = onDestroy;
    this.onEquipItem = onEquip;
    this.onSortInventory = onSort;
    this.onRepairInventoryItemInstanceIds = onRepairInventoryItemInstanceIds;
    this.onCreateFormation = onCreateFormation ?? null;
    this.onPreviewFormationRange = onPreviewFormationRange ?? null;
    this.onRequestInventoryPage = onRequestInventoryPage ?? null;
  }

  /** 更新背包数据并刷新列表与弹层 */
  update(inventory: Inventory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.syncInventoryCooldownTickBase(inventory);
    this.syncInventoryCooldownStateCache(inventory.cooldowns ?? []);
    this.lastInventory = inventory;
    this.invalidatePagedSnapshotForInventory(inventory);
    this.ensureInventoryPageRequested();
    if (this.useReactPanel()) {
      this.pendingVisibleRefresh = !this.isPaneVisible();
      this.syncReactState(inventory);
      if (!this.patchModal()) {
        this.renderModal();
      }
      this.syncCooldownRefresh();
      return;
    }
    if (this.isPaneVisible()) {
      this.pendingVisibleRefresh = false;
      if (!this.patchList(inventory)) {
        this.render(inventory);
      }
      this.scheduleLoadMoreCheck();
    } else {
      this.pendingVisibleRefresh = true;
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
    this.syncCooldownRefresh();
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.syncPlayerContext(player);
    this.update(player.inventory);
  }  
  handleInventoryPage(
    page: S2C_InventoryPage,
    hydrateSyncedItemStack: (item: SyncedItemStack, previous?: ItemStack) => ItemStack,
  ): void {
    const decision = this.inventoryPageRequestState.resolve(page, this.getInventoryRevision(this.lastInventory));
    if (decision === 'ignored') {
      return;
    }
    this.clearInventoryPageRequestTimeout();
    if (decision === 'invalid-current') {
      this.patchInventoryPageRequestState();
      return;
    }
    const filter = this.normalizeInventoryPageFilter(page.filter);
    const search = this.normalizeInventorySearchQuery(page.search);

    const offset = normalizeInventoryPageOffset(page.offset);
    const limit = normalizeInventoryPageLimit(page.limit, INVENTORY_PAGE_SIZE);
    const totalVisibleItems = Math.max(0, Math.trunc(Number(page.total) || 0));
    const totalItems = Math.max(0, Math.trunc(Number(page.totalItems) || 0));
    const capacity = Math.max(0, Math.trunc(Number(page.capacity) || 0));
    const revision = Math.max(1, Math.trunc(Number(page.revision) || 1));
    if (totalVisibleItems > 0 && offset >= totalVisibleItems) {
      const lastOffset = Math.floor((totalVisibleItems - 1) / limit) * limit;
      if (lastOffset !== offset) {
        this.inventoryPageOffset = lastOffset;
        this.requestInventoryPage(lastOffset, limit);
        return;
      }
    }
    const previousInventory = this.lastInventory;
    const nextItems = previousInventory?.items ? previousInventory.items.slice() : [];
    nextItems.length = totalItems;

    const pageItems = (page.items ?? [])
      .map((entry) => {
        const slotIndex = Math.max(0, Math.trunc(Number(entry?.slotIndex) || 0));
        if (!entry?.item) {
          return null;
        }
        const item = hydrateSyncedItemStack(entry.item, nextItems[slotIndex]);
        nextItems[slotIndex] = item;
        return { slotIndex, item };
      })
      .filter((entry): entry is { item: ItemStack; slotIndex: number } => entry !== null);

    const nextInventory: Inventory = {
      capacity,
      items: nextItems,
      cooldowns: page.cooldowns ? page.cooldowns.map((entry) => ({ ...entry })) : previousInventory?.cooldowns,
      serverTick: page.serverTick ?? previousInventory?.serverTick,
    };
    this.setInventoryRevision(nextInventory, revision);
    this.syncInventoryCooldownTickBase(nextInventory);
    this.syncInventoryCooldownStateCache(nextInventory.cooldowns ?? []);
    this.lastInventory = nextInventory;
    this.inventoryPageOffset = offset;
    this.pagedSnapshot = {
      filter,
      search,
      revision,
      totalItems,
      totalVisibleItems,
      capacity,
      offset,
      limit,
      items: pageItems,
    };
    this.renderedVisibleCount = pageItems.length;

    if (this.useReactPanel()) {
      this.pendingVisibleRefresh = !this.isPaneVisible();
      this.syncReactState(nextInventory);
    } else if (this.isPaneVisible()) {
      this.pendingVisibleRefresh = false;
      if (!this.patchList(nextInventory)) {
        this.render(nextInventory);
      }
    } else {
      this.pendingVisibleRefresh = true;
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
    this.syncCooldownRefresh();
  }
  /**
 * syncPlayerContext：处理玩家上下文并更新相关状态。
 * @param player Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds' | 'realm' | 'heavenGate' | 'foundation' | 'qi'> 玩家对象。
 * @returns 无返回值，直接更新玩家上下文相关状态。
 */


  syncPlayerContext(
    player?: Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds' | 'realm' | 'heavenGate' | 'foundation' | 'qi' | 'formationSkill'>,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nextContextKey = this.buildPlayerContextKey(player);
    if (this.lastPlayerContextKey === nextContextKey) {
      return;
    }
    this.lastPlayerContextKey = nextContextKey;
    this.playerContextRevision += 1;

    if (!player) {
      this.learnedTechniqueIds.clear();
      this.unlockedMinimapIds.clear();
      this.equippedItemsBySlot = {};
      this.playerRealm = null;
      this.playerHeavenGate = null;
      this.playerFoundation = 0;
      this.playerQi = 0;
      this.playerFormationSkillLevel = 0;
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
      for (const slot of EQUIP_SLOTS) {
        const equippedItem = player.equipment?.[slot];
        if (equippedItem) {
          this.equippedItemsBySlot[slot] = equippedItem;
        }
      }
      this.playerRealm = player.realm ?? null;
      this.playerHeavenGate = player.realm?.heavenGate ?? player.heavenGate ?? null;
      this.playerFoundation = Math.max(0, Math.floor(player.foundation ?? 0));
      this.playerQi = Math.max(0, Math.floor(player.qi ?? 0));
      this.playerFormationSkillLevel = Math.max(0, Math.floor(Number(player.formationSkill?.level) || 0));
    }
    if (this.lastInventory) {
      this.update(this.lastInventory);
    }
  }

  /** buildPlayerContextKey：构建背包展示依赖的玩家上下文签名。 */
  private buildPlayerContextKey(
    player?: Pick<PlayerState, 'techniques' | 'equipment' | 'unlockedMinimapIds' | 'realm' | 'heavenGate' | 'foundation' | 'qi' | 'formationSkill'>,
  ): string {
    if (!player) {
      return 'none';
    }
    const learnedTechniqueKey = (player.techniques ?? [])
      .map((technique) => technique.techId)
      .filter((techId): techId is string => typeof techId === 'string' && techId.length > 0)
      .join(',');
    const minimapKey = (player.unlockedMinimapIds ?? [])
      .filter((mapId): mapId is string => typeof mapId === 'string' && mapId.length > 0)
      .join(',');
    const equipmentKey = EQUIP_SLOTS
      .map((slot) => {
        const equippedItem = player.equipment?.[slot];
        return `${slot}:${equippedItem ? this.getItemIdentity(equippedItem) : ''}`;
      })
      .join(',');
    const heavenGate = player.realm?.heavenGate ?? player.heavenGate ?? null;
    return [
      `tech=${learnedTechniqueKey}`,
      `map=${minimapKey}`,
      `eq=${equipmentKey}`,
      `realm=${player.realm?.realmLv ?? ''}:${player.realm?.progress ?? ''}:${player.realm?.progressToNext ?? ''}`,
      `gate=${heavenGate?.averageBonus ?? ''}`,
      `foundation=${Math.max(0, Math.floor(player.foundation ?? 0))}`,
      `qi=${Math.max(0, Math.floor(player.qi ?? 0))}`,
      `formation=${Math.max(0, Math.floor(Number(player.formationSkill?.level) || 0))}`,
    ].join('|');
  }

  /** render：渲染渲染。 */
  private render(inventory: Inventory): void {
    this.lastInventory = inventory;
    if (this.useReactPanel()) {
      this.syncReactState(inventory);
      return;
    }
    this.ensureShell();
    this.patchList(inventory);
  }

  private useReactPanel(): boolean {
    return shouldUseReactInventoryPanel();
  }

  private handleReactFilterChange(filter: InventoryFilter): void {
    if (!filter || filter === this.activeFilter) {
      return;
    }
    this.activeFilter = filter;
    this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
    this.pagedSnapshot = null;
    this.inventoryPageOffset = 0;
    this.resetInventoryPageRequest();
    this.ensureInventoryPageRequested(true);
    if (!this.lastInventory) {
      this.syncReactState(null);
      return;
    }
    this.syncReactState(this.lastInventory);
    this.scrollToTop();
    this.scheduleLoadMoreCheck();
  }

  private handlePrimaryAction(
    slotIndex: number,
    expectedItemInstanceId?: string | null,
    options: { closeModal?: boolean } = {},
  ): void {
    const item = Number.isFinite(slotIndex) ? this.lastInventory?.items[slotIndex] : null;
    const action = item ? this.getPrimaryAction(item) : null;
    if (!item || !action || action.kind === 'status') {
      return;
    }
    const itemInstanceId = this.getInventoryItemInstanceId(item);
    if (itemInstanceId && expectedItemInstanceId && itemInstanceId !== expectedItemInstanceId) {
      return;
    }
    if (action.kind === 'equip') {
      if (!itemInstanceId) {
        this.repairMissingInventoryItemInstanceIds();
        return;
      }
      this.onEquipItem?.(itemInstanceId);
      if (options.closeModal) {
        this.closeModal();
      }
      return;
    }
    if (this.isFormationDiskItem(item)) {
      this.openFormationDialog(slotIndex);
      return;
    }
    if (this.isSectFoundingTokenItem(item)) {
      this.openSectFoundingDialog(slotIndex);
      return;
    }
    if (item.itemId === MERIT_ITEM_ID) {
      this.onOpenHeavenlyDaoShop?.();
      if (options.closeModal) {
        this.closeModal();
      }
      return;
    }
    if (this.itemActionDialogController.requiresUseConfirmation(item)) {
      this.selectedSlotIndex = slotIndex;
      this.selectedItemKey = this.getItemIdentity(item);
      this.openActionDialog('use', slotIndex, 1);
      return;
    }
    if (!itemInstanceId) {
      this.repairMissingInventoryItemInstanceIds();
      return;
    }
    this.onUseItem?.(itemInstanceId, 1);
    if (options.closeModal) {
      this.closeModal();
    }
  }

  private repairMissingInventoryItemInstanceIds(): void {
    this.onRepairInventoryItemInstanceIds?.();
  }

  private syncReactState(inventory: Inventory | null = this.lastInventory): void {
    if (!inventory) {
      syncReactInventoryPanelState({
        inventory: null,
        title: t('inventory.title', undefined),
        items: [],
        activeFilter: this.activeFilter,
        totalItems: 0,
        totalVisibleItems: 0,
        renderedVisibleCount: 0,
        capacity: 0,
        emptyText: t('inventory.empty.all', undefined),
        loadHint: null,
        pagination: null,
        searchQuery: this.inventorySearchQuery,
      });
      mountReactInventoryPanel();
      return;
    }

    const paged = this.getActivePagedSnapshot();
    let visibleSnapshot = this.collectVisibleItems(inventory);
    if (!paged) {
      const previousRenderedVisibleCount = this.renderedVisibleCount;
      this.syncRenderedVisibleCount(visibleSnapshot.totalVisibleItems);
      if (previousRenderedVisibleCount !== this.renderedVisibleCount) {
        visibleSnapshot = this.collectVisibleItems(inventory);
      }
    } else {
      this.renderedVisibleCount = visibleSnapshot.renderedItems.length;
    }
    const cooldownStateMap = this.getCooldownStateMap(inventory);
    const items = visibleSnapshot.renderedItems.map(({ item, slotIndex }) => (
      this.buildReactInventoryItemView(item, slotIndex, cooldownStateMap.get(item.itemId) ?? null)
    ));
    const totalItems = paged?.totalItems ?? inventory.items.length;
    const capacity = paged?.capacity ?? inventory.capacity;
    const pagination = this.buildInventoryPaginationState(paged);
    syncReactInventoryPanelState({
      inventory,
      title: t('inventory.title.with-count', {
        count: formatDisplayInteger(totalItems),
        capacity: formatDisplayInteger(capacity),
      }),
      items,
      activeFilter: this.activeFilter,
      totalItems,
      totalVisibleItems: visibleSnapshot.totalVisibleItems,
      renderedVisibleCount: this.renderedVisibleCount,
      capacity,
      emptyText: visibleSnapshot.totalVisibleItems === 0
        ? totalItems === 0 ? t('inventory.empty.all', undefined) : t('inventory.empty.filter', undefined)
        : null,
      loadHint: !paged && items.length < visibleSnapshot.totalVisibleItems
        ? t('inventory.load-more', {
          rendered: formatDisplayInteger(items.length),
          total: formatDisplayInteger(visibleSnapshot.totalVisibleItems),
        })
        : null,
      pagination,
      searchQuery: this.inventorySearchQuery,
    });
    mountReactInventoryPanel();
  }

  private buildReactInventoryItemView(
    item: ItemStack,
    slotIndex: number,
    cooldownState: InventoryItemCooldownState | null,
  ): ReactInventoryItemView {
    const cooldownRemaining = this.getItemCooldownRemainingTicks(cooldownState);
    const itemIdentity = this.getItemIdentity(item);
    const itemMeta = getItemDisplayMeta(item);
    const displayName = itemMeta.displayItem.name;
    const primaryAction = this.getPrimaryAction(item, cooldownState);
    const gradeLineLabel = this.getInventoryGradeLineLabel(item);
    const ribbon = this.getInventoryCellRibbon(item, itemMeta);
    const learnedRibbon = this.getInventoryLearnedRibbon(item);
    const primaryActionHint = this.getPrimaryActionHint(primaryAction);
    return {
      slotIndex,
      itemInstanceId: this.getInventoryItemInstanceId(item) || null,
      itemId: item.itemId,
      itemKey: itemIdentity,
      name: displayName,
      nameClassName: 'inventory-cell-name',
      countLabel: formatDisplayCountBadge(item.count),
      itemType: item.type,
      ribbonLabel: ribbon?.label,
      ribbonTitle: ribbon?.title,
      learnedRibbonLabel: learnedRibbon?.label,
      learnedRibbonTitle: learnedRibbon?.title,
      gradeLineLabel: gradeLineLabel ?? undefined,
      cellClassName: `${getItemDecorClassName('inventory-cell', item)}${cooldownState ? ' inventory-cell--cooldown' : ''}${primaryActionHint ? ' inventory-cell--actionable' : ''}`,
      grade: itemMeta.grade ?? undefined,
      levelLabel: itemMeta.levelLabel ?? undefined,
      enhanceLabel: itemMeta.enhanceLabel ?? undefined,
      primaryActionHint: primaryActionHint ?? undefined,
      cooldown: cooldownState
        ? {
          title: this.getItemCooldownTitle(cooldownState, cooldownRemaining),
          progress: this.getItemCooldownRatio(cooldownState, cooldownRemaining).toFixed(4),
          label: formatDisplayInteger(cooldownRemaining),
        }
        : undefined,
      cooldownRemaining,
      primaryAction,
    };
  }

  /** bindPaneEvents：绑定Pane事件。 */
  private bindPaneEvents(): void {
    this.pane.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches('[data-inventory-search]')) {
        return;
      }
      this.handleInventorySearchInput(target.value);
    });

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
        this.pagedSnapshot = null;
        this.inventoryPageOffset = 0;
        this.resetInventoryPageRequest();
        this.ensureInventoryPageRequested(true);
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

      if (target.closest('[data-bulk-discard-inventory]')) {
        this.openBulkDiscardModal();
        return;
      }

      const pageButton = target.closest<HTMLElement>('[data-inventory-page-action]');
      if (pageButton) {
        const action = pageButton.dataset.inventoryPageAction;
        if (action === 'prev' || action === 'next') {
          this.requestAdjacentInventoryPage(action);
        }
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

    this.pane.addEventListener('contextmenu', (event) => {
      // React 格子已负责右键主操作，原生委托不得再次处理同一事件。
      if (this.useReactPanel()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const cell = target.closest<HTMLElement>('[data-open-item]');
      if (!cell) {
        return;
      }
      event.preventDefault();
      const rawIndex = cell.dataset.openItem;
      if (!rawIndex) {
        return;
      }
      this.handlePrimaryAction(parseInt(rawIndex, 10), null, { closeModal: false });
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
      this.ensureTechniqueBookTemplate(item);
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
      this.ensureTechniqueBookTemplate(item);
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
    const empty = createEmptyHint(t('inventory.empty.all', undefined));
    empty.dataset.inventoryEmpty = 'true';
    return empty;
  }

  /** ensureShell：确保Shell。 */
  private ensureShell(): InventoryShellRefs {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.shellRefs?.section.isConnected) {
      return this.shellRefs;
    }

    const { sectionEl, titleEl } = createPanelSectionWithTitle(t('inventory.title', undefined));
    titleEl.dataset.inventoryTitle = 'true';

    const head = document.createElement('div');
    head.className = 'inventory-panel-head';
    head.append(titleEl);
    const controls = document.createElement('div');
    controls.className = 'inventory-panel-controls';

    const filters = document.createElement('div');
    filters.className = 'ui-filter-tabs';
    const filterButtons = new Map<InventoryFilter, HTMLButtonElement>();
    for (const tab of INVENTORY_FILTER_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-filter-tab';
      button.dataset.filterButton = tab.id;
      button.dataset.filter = tab.id;
      button.textContent = tab.label;
      filters.append(button);
      filterButtons.set(tab.id, button);
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

    const pager = document.createElement('div');
    pager.className = 'inventory-pagination';
    pager.dataset.inventoryPagination = 'true';
    pager.hidden = true;
    const pagerPrev = createSmallBtn(t('inventory.pagination.prev', undefined, '上一页'), {
      className: 'ghost',
      dataset: { inventoryPageAction: 'prev' },
    });
    const pagerStatus = document.createElement('span');
    pagerStatus.className = 'inventory-pagination-status';
    const pagerNext = createSmallBtn(t('inventory.pagination.next', undefined, '下一页'), {
      className: 'ghost',
      dataset: { inventoryPageAction: 'next' },
    });
    pager.append(pagerPrev, pagerStatus, pagerNext);
    const searchInput = document.createElement('input');
    searchInput.className = 'inventory-search-input';
    searchInput.type = 'search';
    searchInput.autocomplete = 'off';
    searchInput.placeholder = t('inventory.search.placeholder', undefined, '搜索物品');
    searchInput.value = this.inventorySearchQuery;
    searchInput.dataset.inventorySearch = 'true';
    controls.append(
      searchInput,
      createSmallBtn(t('inventory.action.sort', undefined), { dataset: { sortInventory: 'true' } }),
      createSmallBtn('一键丢弃', { className: 'danger', dataset: { bulkDiscardInventory: 'true' } }),
    );
    head.append(controls);

    sectionEl.replaceChildren(head, filters, empty, grid, loadHint, pager);
    preserveSelection(this.pane, () => {
      this.pane.replaceChildren(sectionEl);
    });

    this.shellRefs = {
      section: sectionEl,
      title: titleEl,
      filterButtons,
      grid,
      empty,
      loadHint,
      pager,
      pagerPrev,
      pagerStatus,
      pagerNext,
      searchInput,
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
    type.hidden = true;
    head.append(type);
    const count = document.createElement('span');
    count.className = 'inventory-cell-count';
    count.dataset.itemCount = 'true';
    head.append(count);

    const learnedRibbon = document.createElement('span');
    learnedRibbon.className = 'inventory-cell-learned-ribbon';
    learnedRibbon.dataset.itemLearnedRibbon = 'true';
    learnedRibbon.hidden = true;

    const gradeLine = document.createElement('div');
    gradeLine.className = 'inventory-cell-grade-line';
    gradeLine.dataset.itemGradeLine = 'true';
    gradeLine.hidden = true;

    const name = document.createElement('div');
    name.className = 'inventory-cell-name';
    name.dataset.itemName = 'true';

    const actionHint = document.createElement('span');
    actionHint.className = 'inventory-cell-action-hint';
    actionHint.dataset.itemActionHintNode = 'true';
    actionHint.hidden = true;

    cell.append(cooldown, head, learnedRibbon, gradeLine, name, actionHint);
    this.cellRefs.set(cell, {
      type,
      learnedRibbon,
      count,
      gradeLine,
      name,
      cooldown,
      cooldownPie,
      cooldownLabel,
    });
    return cell;
  }

  /** getInventoryCellRefs：读取背包格子缓存节点。 */
  private getInventoryCellRefs(cell: HTMLElement): InventoryCellRefs | null {
    const cached = this.cellRefs.get(cell);
    if (cached) {
      return cached;
    }
    const type = cell.querySelector<HTMLElement>('[data-item-type="true"]');
    const learnedRibbon = cell.querySelector<HTMLElement>('[data-item-learned-ribbon="true"]');
    const count = cell.querySelector<HTMLElement>('[data-item-count="true"]');
    const gradeLine = cell.querySelector<HTMLElement>('[data-item-grade-line="true"]');
    const name = cell.querySelector<HTMLElement>('[data-item-name="true"]');
    const cooldown = cell.querySelector<HTMLElement>('[data-item-cooldown="true"]');
    const cooldownPie = cell.querySelector<HTMLElement>('[data-item-cooldown-pie="true"]');
    const cooldownLabel = cell.querySelector<HTMLElement>('[data-item-cooldown-label="true"]');
    if (!type || !learnedRibbon || !count || !gradeLine || !name || !cooldown || !cooldownPie || !cooldownLabel) {
      return null;
    }
    const refs = { type, learnedRibbon, count, gradeLine, name, cooldown, cooldownPie, cooldownLabel };
    this.cellRefs.set(cell, refs);
    return refs;
  }

  /** buildCellRenderKey：构建格子局部渲染签名。 */
  private buildCellRenderKey(
    itemIdentity: string,
    item: ItemStack,
    slotIndex: number,
    cooldownState: InventoryItemCooldownState | null,
    cooldownRemaining: number,
  ): string {
    return [
      'ribbon-v7',
      String(slotIndex),
      itemIdentity,
      String(item.count),
      String(item.grade ?? ''),
      String(item.level ?? ''),
      String(item.learnTechniqueId ?? ''),
      String(item.learnTechniqueMaxLevel ?? ''),
      String(this.playerContextRevision),
      cooldownState
        ? `${cooldownState.startedAtTick}:${cooldownState.cooldown}:${cooldownRemaining}`
        : '',
    ].join('|');
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

    const cooldownRemaining = this.getItemCooldownRemainingTicks(cooldownState);
    const itemIdentity = this.getItemIdentity(item);
    const renderKey = this.buildCellRenderKey(itemIdentity, item, slotIndex, cooldownState, cooldownRemaining);
    if (cell.dataset.itemRenderKey === renderKey) {
      return true;
    }

    const refs = this.getInventoryCellRefs(cell);
    if (!refs) {
      return false;
    }

    const itemMeta = getItemDisplayMeta(item);
    const displayName = itemMeta.displayItem.name;
    const primaryAction = this.getPrimaryAction(item, cooldownState);
    const primaryActionHint = this.getPrimaryActionHint(primaryAction);
    cell.querySelector<HTMLElement>('[data-item-affinity="true"]')?.remove();

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

    let enhanceNode = cell.querySelector<HTMLElement>('[data-item-enhance="true"]');
    if (itemMeta.enhanceLabel) {
      if (!enhanceNode) {
        enhanceNode = document.createElement('span');
        enhanceNode.className = 'item-card-chip item-card-chip--enhance';
        enhanceNode.dataset.itemEnhance = 'true';
        cell.append(enhanceNode);
      }
      enhanceNode.textContent = itemMeta.enhanceLabel;
    } else {
      enhanceNode?.remove();
    }

    cell.dataset.itemKey = itemIdentity;
    cell.dataset.itemRenderKey = renderKey;
    cell.dataset.openItem = String(slotIndex);
    cell.dataset.itemSlot = String(slotIndex);
    cell.dataset.itemType = item.type;
    if (itemMeta.grade) {
      cell.dataset.itemGrade = itemMeta.grade;
    } else {
      delete cell.dataset.itemGrade;
    }
    const gradeLineLabel = this.getInventoryGradeLineLabel(item);
    if (gradeLineLabel) {
      cell.dataset.itemGradeLineVisible = 'true';
    } else {
      delete cell.dataset.itemGradeLineVisible;
    }
    cell.className = getItemDecorClassName('inventory-cell', item);
    cell.classList.toggle('inventory-cell--cooldown', cooldownState !== null);
    cell.classList.toggle('inventory-cell--actionable', primaryActionHint !== null);
    if (primaryActionHint) {
      cell.dataset.itemActionHint = primaryActionHint;
    } else {
      delete cell.dataset.itemActionHint;
    }

    const ribbon = this.getInventoryCellRibbon(item, itemMeta);
    const learnedRibbon = this.getInventoryLearnedRibbon(item);
    refs.type.hidden = !ribbon;
    refs.type.textContent = ribbon?.label ?? '';
    if (ribbon?.title) {
      refs.type.setAttribute('aria-label', ribbon.title);
    } else {
      refs.type.removeAttribute('aria-label');
    }
    refs.learnedRibbon.hidden = !learnedRibbon;
    refs.learnedRibbon.textContent = learnedRibbon?.label ?? '';
    if (learnedRibbon?.title) {
      refs.learnedRibbon.setAttribute('aria-label', learnedRibbon.title);
    } else {
      refs.learnedRibbon.removeAttribute('aria-label');
    }
    refs.gradeLine.hidden = !gradeLineLabel;
    refs.gradeLine.textContent = gradeLineLabel ?? '';
    refs.count.textContent = formatDisplayCountBadge(item.count);
    refs.name.textContent = displayName;
    refs.name.setAttribute('aria-label', displayName);
    refs.name.className = 'inventory-cell-name';
    let actionHintNode = cell.querySelector<HTMLElement>('[data-item-action-hint-node="true"]');
    if (!actionHintNode) {
      actionHintNode = document.createElement('span');
      actionHintNode.className = 'inventory-cell-action-hint';
      actionHintNode.dataset.itemActionHintNode = 'true';
      cell.append(actionHintNode);
    }
    actionHintNode.hidden = !primaryActionHint;
    actionHintNode.textContent = primaryActionHint ?? '';

    refs.cooldown.hidden = cooldownState === null;
    if (cooldownState) {
      refs.cooldown.setAttribute('aria-label', this.getItemCooldownTitle(cooldownState, cooldownRemaining));
      refs.cooldownPie.style.setProperty('--inventory-cooldown-progress', this.getItemCooldownRatio(cooldownState, cooldownRemaining).toFixed(4));
      refs.cooldownLabel.textContent = formatDisplayInteger(cooldownRemaining);
    } else {
      refs.cooldown.removeAttribute('aria-label');
      refs.cooldownPie.style.setProperty('--inventory-cooldown-progress', '0');
      refs.cooldownLabel.textContent = '';
    }
    return true;
  }

  private getInventoryCellRibbon(item: ItemStack, itemMeta: ItemDisplayMeta): InventoryCellRibbon | null {
    if (item.type === 'skill_book') {
      const isFragment = this.isTechniqueBookFragment(item);
      return {
        label: isFragment ? '残卷' : '功法',
        title: isFragment ? '功法残卷' : '完整功法书',
      };
    }
    if (itemMeta.affinityBadge) {
      return {
        label: itemMeta.affinityBadge.label,
        title: itemMeta.affinityBadge.title,
      };
    }
    if (item.type === 'material') {
      return {
        label: this.getInventoryMaterialRibbonLabel(item),
        title: getItemTypeLabel(item.type),
      };
    }
    if (item.type === 'consumable' || item.type === 'equipment' || item.type === 'artifact') {
      return { label: getItemTypeLabel(item.type) };
    }
    return null;
  }

  private getInventoryLearnedRibbon(item: ItemStack): InventoryCellRibbon | null {
    if (item.type !== 'skill_book') {
      return null;
    }
    const techniqueId = this.getTechniqueIdFromBookItem(item);
    if (!techniqueId || !this.learnedTechniqueIds.has(techniqueId)) {
      return null;
    }
    const label = t('inventory.status.learned', undefined);
    return { label, title: label };
  }

  private getInventoryMaterialRibbonLabel(item: ItemStack): string {
    switch (item.materialCategory) {
      case 'herb':
        return '药材';
      case 'exotic':
        return '异材';
      case 'ore':
        return '矿石';
      default:
        return getItemTypeLabel(item.type);
    }
  }

  private getInventoryGradeLineLabel(_item: ItemStack): string | null {
    return null;
  }

  private isTechniqueBookFragment(item: ItemStack): boolean {
    if (item.type !== 'skill_book') {
      return false;
    }
    const techniqueId = this.getTechniqueIdFromBookItem(item);
    const rawLearnMaxLevel = Number(item.learnTechniqueMaxLevel);
    if (!Number.isFinite(rawLearnMaxLevel)) {
      return false;
    }
    if (!techniqueId) {
      return true;
    }
    const technique = getLocalTechniqueTemplate(techniqueId);
    if (!technique) {
      return true;
    }
    const templateMaxLevel = getTechniqueMaxLevel(
      Array.isArray(technique.layers) ? technique.layers : undefined,
      1,
    );
    const learnMaxLevel = Math.max(1, Math.min(templateMaxLevel, Math.floor(rawLearnMaxLevel)));
    return learnMaxLevel < templateMaxLevel;
  }

  private openBulkDiscardModal(): void {
    if (!this.lastInventory) {
      return;
    }
    this.resetModalState();
    this.bulkDiscardDialogController.open(this.activeFilter);
  }

  /** renderModal：渲染弹窗。 */
  private renderModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.bulkDiscardDialogController.isOpen()) {
      this.bulkDiscardDialogController.render();
      return;
    }
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
    this.ensureTechniqueBookTemplate(item);
    if (this.itemActionDialogController.isOpen() && !this.itemActionDialogController.matchesItem(this.selectedItemKey)) {
      this.itemActionDialogController.reset();
    }
    if (this.formationDialogSlotIndex !== null && this.formationDialogSlotIndex !== slotIndex) {
      this.formationDialogSlotIndex = null;
    }
    if (this.sectFoundingDialogSlotIndex !== null && this.sectFoundingDialogSlotIndex !== slotIndex) {
      this.sectFoundingDialogSlotIndex = null;
    }
    if (this.formationDialogSlotIndex === slotIndex && this.isFormationDiskItem(item)) {
      this.renderFormationDialog(item, slotIndex);
      return;
    }
    if (this.sectFoundingDialogSlotIndex === slotIndex && this.isSectFoundingTokenItem(item)) {
      this.renderSectFoundingDialog(item, slotIndex);
      return;
    }
    if (this.itemActionDialogController.isOpen()) {
      this.itemActionDialogController.render(item);
      this.lastModalRenderKey = this.buildModalRenderKey(item);
      return;
    }

    const previewItem = resolvePreviewItem(item);
    const displayItem = getItemDisplayMeta(item).displayItem;
    if (!hasLoadedItemSourceCatalog()) {
      const pendingItemKey = this.selectedItemKey;
      void preloadItemSourceCatalog().then(() => {
        if (!this.lastInventory || !pendingItemKey || this.selectedItemKey !== pendingItemKey || this.itemActionDialogController.isOpen()) {
          return;
        }
        this.renderModal();
      });
    }
    if (this.sourceExpandedItemKey !== this.selectedItemKey) {
      this.sourceExpanded = false;
      this.sourceExpandedItemKey = this.selectedItemKey;
    }
    const bonusLines = item.type === 'equipment' || item.type === 'artifact'
      ? describeEquipmentBonuses(previewItem, this.playerRealm?.realmLv)
      : describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
    const materialValueLines = item.type === 'material' ? describeMaterialValueDetails(previewItem) : [];
    const effectLines = formatItemEffects(item);
    const statusLabel = this.getItemStatusLabel(item);
    const sourceEntryCount = getItemSourceEntryCount(previewItem.itemId);
    const useSpecialSourceSummary = isSpecialSourceSummaryItem(previewItem.itemId);
    const canToggleSourceList = !useSpecialSourceSummary && sourceEntryCount > INVENTORY_SOURCE_COLLAPSED_COUNT;
    const sourceListHtml = renderItemSourceListHtml(previewItem.itemId, {
      maxEntries: this.sourceExpanded || !canToggleSourceList ? undefined : INVENTORY_SOURCE_COLLAPSED_COUNT,
    });

    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      title: displayItem.name,
      subtitle: t('inventory.modal.item-subtitle', { type: getItemTypeLabel(item.type), count: formatDisplayCountBadge(item.count) }),
      renderBody: (body) => {
        this.renderItemDetailBody(body, item, sourceListHtml, sourceEntryCount, canToggleSourceList, bonusLines, materialValueLines, effectLines, statusLabel);
      },
      onClose: () => {
        this.formationDialogController.clearWorldPreview();
        this.resetModalState();
      },
      onAfterRender: (body, signal) => {
        body.querySelector<HTMLElement>('[data-inventory-source-toggle="true"]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.sourceExpanded = !this.sourceExpanded;
          this.renderModal();
        }, { signal });
        this.bindItemDetailActions(body, signal, item, slotIndex);
      },
    });
    this.lastModalRenderKey = this.buildModalRenderKey(item);
  }

  /** renderFormationDialog：渲染布阵对话。 */
  private renderFormationDialog(item: ItemStack, slotIndex: number): void {
    const displayName = getItemDisplayMeta(item).displayItem.name;
    const diskMultiplier = this.resolveFormationDiskMultiplier(item);
    const diskTier = this.resolveFormationDiskTier(item);
    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      title: t('inventory.formation.title', undefined),
      subtitle: t('inventory.formation.subtitle', { itemName: displayName, tier: FORMATION_DISK_TIER_LABELS[diskTier] ?? t('inventory.formation.disk', undefined), multiplier: diskMultiplier }),
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => {
        this.formationDialogController.renderBody(body, item);
      },
      onClose: () => {
        this.formationDialogController.clearWorldPreview();
        this.resetModalState();
      },
      onAfterRender: (body, signal) => {
        this.formationDialogController.bind(body, item, signal);
        body.querySelector<HTMLElement>('[data-formation-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.formationDialogController.clearWorldPreview();
          this.formationDialogSlotIndex = null;
          this.renderModal();
        }, { signal });
        body.querySelector<HTMLElement>('[data-formation-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const payload = this.formationDialogController.readPayload(body, item);
          if (!payload) {
            return;
          }
          this.formationDialogController.clearWorldPreview();
          this.onCreateFormation?.(payload);
          this.closeModal();
        }, { signal });
      },
    });
    this.lastModalRenderKey = this.buildModalRenderKey(item);
  }


  private openFormationDialog(slotIndex: number): void {
    this.selectedSlotIndex = slotIndex;
    const item = this.lastInventory?.items[slotIndex];
    this.selectedItemKey = item ? this.getItemIdentity(item) : null;
    this.itemActionDialogController.reset();
    this.sectFoundingDialogSlotIndex = null;
    this.formationDialogSlotIndex = slotIndex;
    this.renderModal();
  }

  private openSectFoundingDialog(slotIndex: number): void {
    this.selectedSlotIndex = slotIndex;
    const item = this.lastInventory?.items[slotIndex];
    this.selectedItemKey = item ? this.getItemIdentity(item) : null;
    this.itemActionDialogController.reset();
    this.bulkDiscardDialogController.reset();
    this.formationDialogSlotIndex = null;
    this.sectFoundingDialogSlotIndex = slotIndex;
    this.renderModal();
  }

  private renderSectFoundingDialog(item: ItemStack, slotIndex: number): void {
    const displayName = getItemDisplayMeta(item).displayItem.name;
    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      variantClass: 'detail-modal--sect-founding',
      title: t('inventory.sect-founding.dialog.title', undefined),
      subtitle: t('inventory.sect-founding.dialog.subtitle', { itemName: displayName }),
      hint: t('inventory.sect-founding.dialog.hint', undefined),
      renderBody: (body) => {
        this.renderSectFoundingDialogBody(body);
      },
      onClose: () => {
        this.resetModalState();
      },
      onAfterRender: (body, signal) => {
        const nameInput = body.querySelector<HTMLInputElement>('[data-sect-name-input]');
        const markInput = body.querySelector<HTMLInputElement>('[data-sect-mark-input]');
        const statusNode = body.querySelector<HTMLElement>('[data-sect-founding-status]');
        nameInput?.addEventListener('input', () => {
          if (statusNode) statusNode.textContent = '';
          if (markInput && !markInput.dataset.touched) {
            markInput.value = getFirstGrapheme(nameInput.value.trim());
          }
        }, { signal });
        markInput?.addEventListener('input', () => {
          markInput.dataset.touched = 'true';
          const normalizedMark = this.normalizeSectMarkInput(markInput.value);
          if (markInput.value !== normalizedMark) {
            markInput.value = normalizedMark;
          }
          if (statusNode) statusNode.textContent = '';
        }, { signal });
        body.querySelector<HTMLElement>('[data-sect-founding-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.sectFoundingDialogSlotIndex = null;
          this.renderModal();
        }, { signal });
        body.querySelector<HTMLElement>('[data-sect-founding-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const sectName = this.normalizeSectName(nameInput?.value ?? '');
          const sectMark = this.normalizeSectMark(markInput?.value ?? '');
          if (!sectName) {
            if (statusNode) statusNode.textContent = t('inventory.sect-founding.name-invalid', undefined);
            return;
          }
          if (!sectMark) {
            if (statusNode) statusNode.textContent = t('inventory.sect-founding.mark-invalid', undefined);
            return;
          }
          const itemInstanceId = this.getInventoryItemInstanceId(item);
          if (!itemInstanceId) {
            this.repairMissingInventoryItemInstanceIds();
            return;
          }
          this.onUseItem?.(itemInstanceId, 1, { sectName, sectMark });
          this.closeModal();
        }, { signal });
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
    bonusLines: string[],
    materialValueLines: string[],
    effectLines: string[],
    statusLabel: string | null,
  ): void {
    const previewItem = resolvePreviewItem(item);
    const actionHtml = this.renderItemDetailActionsHtml(item);
    const techniqueBookDetailHtml = item.type === 'skill_book'
      ? renderTechniqueBookDetailHtml(previewItem)
      : '';
    replaceElementHtml(body, `
      <div class="quest-detail-grid inventory-detail-grid">
        <div class="quest-detail-section">
          <strong>${t('inventory.detail.item-type', undefined)}</strong>
          <span data-inventory-modal-type="true">${this.escapeHtml(getItemTypeLabel(item.type))}</span>
        </div>
        <div class="quest-detail-section">
          <strong>${t('inventory.detail.current-count', undefined)}</strong>
          <span data-inventory-modal-count="true">${formatDisplayCountBadge(item.count)}</span>
        </div>
        ${item.equipSlot ? `<div class="quest-detail-section">
          <strong>${t('inventory.detail.equip-slot', undefined)}</strong>
          <span data-inventory-modal-slot="true">${this.escapeHtml(getEquipSlotLabel(item.equipSlot))}</span>
        </div>` : ''}
      </div>
      ${item.type === 'skill_book' ? '' : `<div class="quest-detail-section">
        <strong>${t('inventory.detail.desc', undefined)}</strong>
        <span data-inventory-modal-desc="true">${this.escapeHtml(previewItem.desc)}</span>
      </div>`}
      ${statusLabel ? `<div class="quest-detail-section">
        <strong>${t('inventory.detail.status', undefined)}</strong>
        <span data-inventory-modal-status="true">${this.escapeHtml(statusLabel)}</span>
      </div>` : ''}
      ${item.type === 'skill_book'
        ? `<div class="quest-detail-section inventory-technique-book-detail" data-inventory-technique-book-detail="true">${techniqueBookDetailHtml}</div>`
        : ''}
      ${bonusLines.length > 0 ? `<div class="quest-detail-section">
        <strong>${t('inventory.detail.equipment-bonuses', undefined)}</strong>
        <span data-inventory-modal-bonuses="true">${this.escapeHtml(bonusLines.join(' / '))}</span>
      </div>` : ''}
      ${materialValueLines.length > 0 ? `<div class="quest-detail-section">
        <strong>${t('inventory.detail.material-bonuses', undefined)}</strong>
        <span data-inventory-modal-material-values="true">${this.escapeHtml(materialValueLines.join(' / '))}</span>
      </div>` : ''}
      ${effectLines.length > 0 ? `<div class="quest-detail-section">
        <strong>${t('inventory.detail.effects', undefined)}</strong>
        <span data-inventory-modal-effects="true">${this.escapeHtml(effectLines.join(' / '))}</span>
      </div>` : ''}
      <div class="quest-detail-section inventory-source-section">
        <strong>${t('inventory.detail.sources', undefined)}</strong>
        ${sourceListHtml}
        ${canToggleSourceList
          ? `<button class="small-btn ghost inventory-source-toggle" data-inventory-source-toggle="true" type="button">${this.sourceExpanded ? t('inventory.source.collapse', undefined) : t('inventory.source.expand-all', { count: formatDisplayInteger(sourceEntryCount) })}</button>`
          : ''}
      </div>
      ${actionHtml}
    `);
  }

  private renderItemDetailActionsHtml(item: ItemStack): string {
    const primaryAction = this.getPrimaryAction(item);
    const canUseBatch = this.canBatchUseFromDetail(item, primaryAction);
    const primaryButton = this.isPrimaryActionable(primaryAction)
      ? `<button class="small-btn" type="button" data-inventory-detail-action="primary">${this.escapeHtml(primaryAction.label)}</button>`
      : '';
    const batchUseButton = canUseBatch
      ? `<button class="small-btn ghost" type="button" data-inventory-detail-action="batch-use">${t('inventory.action.batch-use', undefined)}</button>`
      : '';
    const dropButton = this.onDropItem
      ? `<button class="small-btn ghost" type="button" data-inventory-detail-action="drop">${item.count > 1 ? t('inventory.action.batch-drop', undefined) : t('inventory.action.drop-one', undefined)}</button>`
      : '';
    const destroyButton = this.onDestroyItem
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

  private bindItemDetailActions(body: HTMLElement, signal: AbortSignal, item: ItemStack, slotIndex: number): void {
    body.querySelectorAll<HTMLElement>('[data-inventory-detail-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = button.dataset.inventoryDetailAction;
        if (action === 'primary') {
          this.handlePrimaryAction(slotIndex, this.getInventoryItemInstanceId(item), { closeModal: true });
          return;
        }
        if (action === 'batch-use') {
          this.openActionDialog('use', slotIndex, item.count);
          return;
        }
        if (action === 'drop') {
          this.openActionDialog('drop', slotIndex, item.count);
          return;
        }
        if (action === 'destroy') {
          this.openActionDialog('destroy', slotIndex, item.count);
        }
      }, { signal });
    });
  }


  private renderSectFoundingDialogBody(body: HTMLElement): void {
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

  private normalizeSectName(input: string): string {
    const normalized = input.replace(/\s+/g, '').trim();
    const count = getGraphemeCount(normalized);
    if (count < 2 || count > 12 || /[<>`"'\\]/.test(normalized)) {
      return '';
    }
    return normalized;
  }

  private normalizeSectMark(input: string): string {
    const normalized = input.replace(/\s+/g, '').trim();
    const first = getFirstGrapheme(normalized);
    if (!first || getGraphemeCount(normalized) !== 1 || /[\s<>`"'\\]/.test(first)) {
      return '';
    }
    return first;
  }

  private normalizeSectMarkInput(input: string): string {
    const normalized = input.replace(/\s+/g, '').trim();
    const first = getFirstGrapheme(normalized);
    if (!first || /[\s<>`"'\\]/.test(first)) {
      return '';
    }
    return first;
  }


  /** patchList：处理patch列表。 */
  private patchList(inventory: Inventory): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const refs = this.ensureShell();
    const paged = this.getActivePagedSnapshot();
    const totalItemsForTitle = paged?.totalItems ?? inventory.items.length;
    const capacityForTitle = paged?.capacity ?? inventory.capacity;
      refs.title.textContent = t('inventory.title.with-count', { count: formatDisplayInteger(totalItemsForTitle), capacity: formatDisplayInteger(capacityForTitle) });

    for (const tab of INVENTORY_FILTER_TABS) {
      const button = refs.filterButtons.get(tab.id);
      if (!button) {
        return false;
      }
      button.classList.toggle('active', this.activeFilter === tab.id);
    }

    let visibleSnapshot = this.collectVisibleItems(inventory);
    if (!paged) {
      const previousRenderedVisibleCount = this.renderedVisibleCount;
      this.syncRenderedVisibleCount(visibleSnapshot.totalVisibleItems);
      if (previousRenderedVisibleCount !== this.renderedVisibleCount) {
        visibleSnapshot = this.collectVisibleItems(inventory);
      }
    } else {
      this.renderedVisibleCount = visibleSnapshot.renderedItems.length;
    }
    const { renderedItems, totalVisibleItems } = visibleSnapshot;
    this.patchInventoryPagination(refs, paged);
    this.patchInventorySearchInput(refs);
    if (totalVisibleItems === 0) {
      refs.empty.hidden = false;
      refs.empty.textContent = totalItemsForTitle === 0 ? t('inventory.empty.all', undefined) : t('inventory.empty.filter', undefined);
      refs.grid.hidden = true;
      refs.grid.replaceChildren();
      this.cellBySlotIndex.clear();
      refs.loadHint.hidden = true;
      refs.loadHint.textContent = '';
      return true;
    }

    refs.empty.hidden = true;
    refs.grid.hidden = false;
    const cooldownStateMap = this.getCooldownStateMap(inventory);
    if (!paged && renderedItems.length < totalVisibleItems) {
      refs.loadHint.hidden = false;
      refs.loadHint.textContent = t('inventory.load-more', { rendered: formatDisplayInteger(renderedItems.length), total: formatDisplayInteger(totalVisibleItems) });
    } else {
      refs.loadHint.hidden = true;
      refs.loadHint.textContent = '';
    }

    const usedSlotIndexes = new Set<number>();
    const orderedCells = renderedItems.map(({ item, slotIndex }) => {
      usedSlotIndexes.add(slotIndex);
      let cell = this.cellBySlotIndex.get(slotIndex);
      if (!cell) {
        cell = this.createInventoryCell(slotIndex);
        this.cellBySlotIndex.set(slotIndex, cell);
      }
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
    for (const [slotIndex, cell] of this.cellBySlotIndex) {
      if (!usedSlotIndexes.has(slotIndex)) {
        cell.remove();
        this.cellBySlotIndex.delete(slotIndex);
      }
    }

    return true;
  }

  /** patchModal：处理patch弹窗。 */
  private patchModal(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.bulkDiscardDialogController.isOpen()) {
      return this.bulkDiscardDialogController.patch();
    }
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


  /** openActionDialog：打开动作对话。 */
  private openActionDialog(kind: InventoryActionKind, slotIndex: number, defaultCount: number): void {
    const item = this.lastInventory?.items[slotIndex] ?? null;
    if (!item) {
      return;
    }
    if (this.itemActionDialogController.open(kind, this.getItemIdentity(item), defaultCount)) {
      this.renderModal();
    }
  }

  private getTechniqueIdFromBookItem(item: ItemStack): string | null {
    return resolveTechniqueIdFromBookItem(item);
  }

  /** 自创功法书只在玩家查看详情时低频补齐模板，不扩大背包同步包。 */
  private ensureTechniqueBookTemplate(item: ItemStack): void {
    if (item.type !== 'skill_book') {
      return;
    }
    const techniqueId = this.getTechniqueIdFromBookItem(item);
    if (!techniqueId || getLocalTechniqueTemplate(techniqueId) || this.pendingTechniqueTemplateIds.has(techniqueId)) {
      return;
    }
    this.pendingTechniqueTemplateIds.add(techniqueId);
    void fetchTechniqueTemplateForBookItem(item).then((template) => {
      this.pendingTechniqueTemplateIds.delete(techniqueId);
      if (!template) {
        return;
      }
      this.refreshTechniqueBookDisplays(techniqueId);
    });
  }

  /** 模板回包后只刷新当前悬浮提示和详情弹层中的功法区域。 */
  private refreshTechniqueBookDisplays(techniqueId: string): void {
    if (this.tooltipCell && this.lastInventory) {
      const rawIndex = this.tooltipCell.dataset.itemSlot;
      const item = rawIndex ? this.lastInventory.items[parseInt(rawIndex, 10)] : undefined;
      if (item && this.getTechniqueIdFromBookItem(item) === techniqueId) {
        this.refreshTooltipContent();
      }
    }
    this.patchSelectedTechniqueBookDetail(techniqueId);
  }

  /** 局部替换已打开背包详情中的功法内容，保持弹层滚动和操作节点连续。 */
  private patchSelectedTechniqueBookDetail(techniqueId: string): void {
    if (!detailModalHost.isOpenFor(InventoryPanel.MODAL_OWNER) || !this.lastInventory) {
      return;
    }
    const resolved = this.resolveSelectedItem(this.lastInventory);
    if (!resolved || this.getTechniqueIdFromBookItem(resolved.item) !== techniqueId) {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    const detail = body?.querySelector<HTMLElement>('[data-inventory-technique-book-detail="true"]');
    if (!detail) {
      return;
    }
    replaceElementHtml(detail, renderTechniqueBookDetailHtml(resolved.item));
  }

  /** getPrimaryAction：读取Primary动作。 */
  private getPrimaryAction(
    item: ItemStack,
    cooldownState?: InventoryItemCooldownState | null,
  ): InventoryPrimaryAction | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const statusLabel = this.getItemStatusLabel(item, cooldownState);
    if (statusLabel) {
      return { label: statusLabel, kind: 'status', disabled: true };
    }
    if (item.type === 'equipment' || item.type === 'artifact') {
      return { label: t('inventory.action.label.equip', undefined), kind: 'equip' };
    }
    if (this.isFormationDiskItem(item)) {
      return { label: t('inventory.action.label.formation', undefined), kind: 'use' };
    }
    if (this.isSectFoundingTokenItem(item)) {
      return { label: t('inventory.action.label.use', undefined), kind: 'use' };
    }
    if (item.itemId === MERIT_ITEM_ID) {
      return { label: t('inventory.action.label.use', undefined), kind: 'use' };
    }
    if (item.type === 'skill_book') {
      return { label: t('inventory.action.label.learn', undefined), kind: 'use' };
    }
    if (this.canUseItem(item)) {
      return { label: t('inventory.action.label.use', undefined), kind: 'use' };
    }
    return null;
  }

  private isPrimaryActionable(action: InventoryPrimaryAction | null): action is InventoryPrimaryAction {
    return action !== null && action.kind !== 'status' && action.disabled !== true;
  }

  private getPrimaryActionHint(action: InventoryPrimaryAction | null): string | null {
    if (!this.isPrimaryActionable(action)) {
      return null;
    }
    return `右键${action.label}`;
  }

  private canBatchUseFromDetail(item: ItemStack, primaryAction: InventoryPrimaryAction | null): boolean {
    return this.isPrimaryActionable(primaryAction)
      && primaryAction.kind === 'use'
      && item.type === 'consumable'
      && item.count > 1
      && !this.isFormationDiskItem(item)
      && !this.isSectFoundingTokenItem(item)
      && item.itemId !== MERIT_ITEM_ID;
  }

  private isFormationDiskItem(item: ItemStack): boolean {
    return (typeof item.formationDiskTier === 'string' && item.formationDiskTier.length > 0)
      || item.itemId.startsWith('formation_disk.');
  }

  private isSectFoundingTokenItem(item: ItemStack): boolean {
    return item.useBehavior === 'create_sect' || item.itemId === 'sect_founding_token';
  }

  private resolveFormationDiskMultiplier(item: ItemStack): number {
    if (Number.isFinite(item.formationDiskMultiplier)) {
      return Math.max(1, Number(item.formationDiskMultiplier));
    }
    return FORMATION_DISK_MULTIPLIER_BY_ITEM_ID[item.itemId] ?? 1;
  }

  private resolveFormationDiskTier(item: ItemStack): keyof typeof FORMATION_DISK_TIER_LABELS {
    if (typeof item.formationDiskTier === 'string' && item.formationDiskTier in FORMATION_DISK_TIER_LABELS) {
      return item.formationDiskTier as keyof typeof FORMATION_DISK_TIER_LABELS;
    }
    return FORMATION_DISK_TIER_BY_ITEM_ID[item.itemId] ?? 'mortal';
  }

  /** getItemStatusLabel：读取物品状态标签。 */
  private getItemStatusLabel(
    item: ItemStack,
    cooldownState?: InventoryItemCooldownState | null,
  ): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const activeCooldownState = cooldownState === undefined
      ? this.getItemCooldownState(item)
      : cooldownState;
    const cooldownLeft = this.getItemCooldownRemainingTicks(activeCooldownState);
    if (cooldownLeft > 0) {
      return `冷却 ${formatDisplayInteger(cooldownLeft)} 息`;
    }
    if (item.type === 'skill_book') {
      const techniqueId = this.getTechniqueIdFromBookItem(item);
      if (techniqueId && this.learnedTechniqueIds.has(techniqueId)) {
        return t('inventory.status.learned', undefined);
      }
    }
    const mapIds = item.mapUnlockIds && item.mapUnlockIds.length > 0
      ? item.mapUnlockIds
      : item.mapUnlockId
        ? [item.mapUnlockId]
        : [];
    if (mapIds.length > 0 && mapIds.every((mapId) => this.unlockedMinimapIds.has(mapId))) {
      return t('inventory.status.read', undefined);
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
    this.pruneInventoryCooldownStateCache();
    const activeCooldowns = new Map(this.inventoryCooldownStateCache);
    for (const entry of inventory.cooldowns ?? []) {
      if (this.getItemCooldownRemainingTicks(entry) > 0) {
        activeCooldowns.set(entry.itemId, entry);
      }
    }
    const cooldownsByItemId = new Map(activeCooldowns);
    for (const item of inventory.items ?? []) {
      if (!item?.itemId || cooldownsByItemId.has(item.itemId)) {
        continue;
      }
      const groupedCooldown = this.resolveGroupedRecoveryCooldownState(item, activeCooldowns);
      if (groupedCooldown) {
        cooldownsByItemId.set(item.itemId, groupedCooldown);
      }
    }
    return cooldownsByItemId;
  }

  /** getItemCooldownState：读取物品冷却状态。 */
  private getItemCooldownState(item: ItemStack, inventory: Inventory | null = this.lastInventory): InventoryItemCooldownState | null {
    if (!inventory) {
      return null;
    }
    const cooldownState = this.getCooldownStateMap(inventory).get(item.itemId) ?? null;
    return this.getItemCooldownRemainingTicks(cooldownState) > 0 ? cooldownState : null;
  }

  private resolveGroupedRecoveryCooldownState(
    item: ItemStack,
    activeCooldowns: Map<string, InventoryItemCooldownState>,
  ): InventoryItemCooldownState | null {
    let selected: InventoryItemCooldownState | null = null;
    let maxRemainingTicks = 0;
    for (const group of this.resolveRecoveryCooldownGroups(item)) {
      const cooldownState = activeCooldowns.get(group) ?? null;
      const remainingTicks = this.getItemCooldownRemainingTicks(cooldownState);
      if (remainingTicks > maxRemainingTicks) {
        selected = cooldownState;
        maxRemainingTicks = remainingTicks;
      }
    }
    return selected;
  }

  private resolveRecoveryCooldownGroups(item: ItemStack): Array<'hp' | 'qi'> {
    const previewItem = resolvePreviewItem(item);
    const groups: Array<'hp' | 'qi'> = [];
    if (this.hasPositiveRecoveryValue(previewItem.healAmount)
      || this.hasPositiveRecoveryValue(previewItem.healPercent)
      || this.hasPositiveRecoveryValue(previewItem.baselineHealPercent)) {
      groups.push('hp');
    }
    if (this.hasPositiveRecoveryValue(previewItem.baselineQiPercent)
      || this.hasPositiveRecoveryValue(previewItem.qiPercent)) {
      groups.push('qi');
    }
    return groups;
  }

  private hasPositiveRecoveryValue(value: unknown): boolean {
    return Number.isFinite(Number(value)) && Number(value) > 0;
  }

  /** getItemCooldownRemainingTicks：读取物品冷却Remaining Ticks。 */
  private getItemCooldownRemainingTicks(cooldownState: InventoryItemCooldownState | null): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!cooldownState) {
      return 0;
    }
    const cooldown = Math.max(0, Math.floor(Number(cooldownState.cooldown) || 0));
    if (cooldown <= 0) {
      return 0;
    }
    const currentTick = this.getEstimatedInventoryCooldownTick();
    if (currentTick === null) {
      return cooldown;
    }
    const startedAtTick = Math.max(0, Math.floor(Number(cooldownState.startedAtTick) || 0));
    const elapsedTicks = Math.max(0, currentTick - startedAtTick);
    return Math.max(0, cooldown - elapsedTicks);
  }

  private syncInventoryCooldownTickBase(inventory: Inventory): void {
    const serverTick = Number(inventory.serverTick);
    if (!Number.isFinite(serverTick)) {
      return;
    }
    const normalizedTick = Math.max(0, Math.floor(serverTick));
    if (this.inventoryCooldownBaseSourceTick === normalizedTick) {
      return;
    }
    this.inventoryCooldownBaseTick = normalizedTick;
    this.inventoryCooldownBaseSourceTick = normalizedTick;
    this.inventoryCooldownBaseSyncedAtMs = performance.now();
  }

  private syncInventoryCooldownStateCache(cooldowns: InventoryItemCooldownState[]): void {
    for (const entry of cooldowns) {
      if (!entry?.itemId) {
        continue;
      }
      if (this.getItemCooldownRemainingTicks(entry) > 0) {
        this.inventoryCooldownStateCache.set(entry.itemId, { ...entry });
      } else {
        this.inventoryCooldownStateCache.delete(entry.itemId);
      }
    }
    this.pruneInventoryCooldownStateCache();
  }

  private pruneInventoryCooldownStateCache(): void {
    for (const [itemId, entry] of this.inventoryCooldownStateCache) {
      if (this.getItemCooldownRemainingTicks(entry) <= 0) {
        this.inventoryCooldownStateCache.delete(itemId);
      }
    }
  }

  private getEstimatedInventoryCooldownTick(now = performance.now()): number | null {
    if (this.inventoryCooldownBaseTick === null) {
      return null;
    }
    const elapsedTicks = Math.floor(Math.max(0, now - this.inventoryCooldownBaseSyncedAtMs) / 1000);
    return this.inventoryCooldownBaseTick + elapsedTicks;
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
  private getItemCooldownRatio(cooldownState: InventoryItemCooldownState | null, remainingTicks?: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!cooldownState) {
      return 0;
    }
    const cooldown = Math.max(1, cooldownState.cooldown);
    const remaining = remainingTicks ?? this.getItemCooldownRemainingTicks(cooldownState);
    return Math.max(0, Math.min(1, remaining / cooldown));
  }

  /** getItemCooldownTitle：读取物品冷却标题。 */
  private getItemCooldownTitle(cooldownState: InventoryItemCooldownState, remainingTicks?: number): string {
    const remaining = remainingTicks ?? this.getItemCooldownRemainingTicks(cooldownState);
    return `使用冷却 ${formatDisplayInteger(remaining)} / ${formatDisplayInteger(cooldownState.cooldown)} 息`;
  }

  /** getItemIdentity：读取物品身份。 */
  private getItemIdentity(item: ItemStack): string {
    const cached = this.itemIdentityCache.get(item);
    if (cached) {
      return cached;
    }
    const itemInstanceId = this.getInventoryItemInstanceId(item);
    const identity = itemInstanceId ? `instance:${itemInstanceId}` : createItemStackSignature(item);
    this.itemIdentityCache.set(item, identity);
    return identity;
  }

  private getInventoryItemInstanceId(item: ItemStack | null | undefined): string {
    const direct = typeof item?.itemInstanceId === 'string' ? item.itemInstanceId.trim() : '';
    return direct;
  }

  private normalizeInventoryPageFilter(value: unknown): InventoryFilter {
    const filter = typeof value === 'string' ? value.trim() : 'all';
    return INVENTORY_FILTER_TABS.some((tab) => tab.id === filter) ? filter as InventoryFilter : 'all';
  }

  private normalizeInventorySearchQuery(value: unknown): string {
    return normalizeInventoryPageSearch(value);
  }

  private getInventoryRevision(inventory: Inventory | null | undefined): number | null {
    return normalizeInventoryRevision((inventory as { revision?: number } | null | undefined)?.revision);
  }

  private setInventoryRevision(inventory: Inventory, revision: number): void {
    (inventory as Inventory & { revision?: number }).revision = Math.max(1, Math.trunc(Number(revision) || 1));
  }

  private buildInventoryPaginationState(paged: InventoryPagedSnapshot | null): {
    label: string;
    canPrev: boolean;
    canNext: boolean;
    loading: boolean;
  } | null {
    if (!paged) {
      return null;
    }
    const limit = Math.max(1, Math.trunc(Number(paged.limit) || INVENTORY_PAGE_SIZE));
    const total = Math.max(0, Math.trunc(Number(paged.totalVisibleItems) || 0));
    const offset = Math.max(0, Math.trunc(Number(paged.offset) || 0));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(totalPages, Math.floor(offset / limit) + 1);
    const from = total > 0 ? Math.min(total, offset + 1) : 0;
    const to = Math.min(total, offset + paged.items.length);
    return {
      label: t('inventory.pagination.meta', {
        page: formatDisplayInteger(page),
        totalPages: formatDisplayInteger(totalPages),
        from: formatDisplayInteger(from),
        to: formatDisplayInteger(to),
        total: formatDisplayInteger(total),
      }, `第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页 · ${formatDisplayInteger(from)}-${formatDisplayInteger(to)} / ${formatDisplayInteger(total)}`),
      canPrev: offset > 0,
      canNext: offset + limit < total,
      loading: this.inventoryPageRequestState.isPending(),
    };
  }

  private patchInventoryPagination(refs: InventoryShellRefs, paged: InventoryPagedSnapshot | null): void {
    const state = this.buildInventoryPaginationState(paged);
    if (!state) {
      refs.pager.hidden = true;
      refs.pagerStatus.textContent = '';
      refs.pagerPrev.disabled = true;
      refs.pagerNext.disabled = true;
      return;
    }
    refs.pager.hidden = false;
    refs.pagerStatus.textContent = state.label;
    refs.pagerPrev.disabled = !state.canPrev || state.loading;
    refs.pagerNext.disabled = !state.canNext || state.loading;
  }

  private patchInventorySearchInput(refs: InventoryShellRefs): void {
    if (document.activeElement === refs.searchInput) {
      return;
    }
    if (refs.searchInput.value !== this.inventorySearchQuery) {
      refs.searchInput.value = this.inventorySearchQuery;
    }
  }

  private requestAdjacentInventoryPage(direction: 'prev' | 'next'): void {
    if (this.inventoryPageRequestState.isPending()) {
      return;
    }
    const paged = this.pagedSnapshot?.filter === this.activeFilter && this.pagedSnapshot.search === this.inventorySearchQuery
      ? this.pagedSnapshot
      : null;
    const limit = Math.max(1, Math.trunc(Number(paged?.limit) || INVENTORY_PAGE_SIZE));
    const total = Math.max(0, Math.trunc(Number(paged?.totalVisibleItems) || 0));
    const currentOffset = Math.max(0, Math.trunc(Number(paged?.offset ?? this.inventoryPageOffset) || 0));
    const maxOffset = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;
    const nextOffset = direction === 'prev'
      ? Math.max(0, currentOffset - limit)
      : Math.min(maxOffset, currentOffset + limit);
    if (nextOffset === currentOffset) {
      return;
    }
    this.requestInventoryPage(nextOffset, limit);
    this.scrollToTop();
  }

  private handleInventorySearchInput(value: string): void {
    const search = this.normalizeInventorySearchQuery(value);
    if (search === this.inventorySearchQuery) {
      return;
    }
    this.inventorySearchQuery = search;
    this.inventoryPageOffset = 0;
    this.renderedVisibleCount = INVENTORY_INITIAL_RENDER_COUNT;
    this.pagedSnapshot = null;
    this.resetInventoryPageRequest();
    if (this.inventorySearchRequestTimer !== null) {
      window.clearTimeout(this.inventorySearchRequestTimer);
    }
    this.inventorySearchRequestTimer = window.setTimeout(() => {
      this.inventorySearchRequestTimer = null;
      this.ensureInventoryPageRequested(true);
    }, INVENTORY_SEARCH_DEBOUNCE_MS);
  }

  private matchesInventorySearch(item: ItemStack | null | undefined): boolean {
    if (!this.inventorySearchQuery) {
      return true;
    }
    if (!item) {
      return false;
    }
    const searchable = [
      item.itemId,
      item.name,
      item.groundLabel,
      item.type,
      item.grade,
    ]
      .map((value) => typeof value === 'string' ? value.toLowerCase() : '')
      .filter(Boolean)
      .join(' ');
    return this.inventorySearchQuery.split(' ').every((term) => term.length === 0 || searchable.includes(term));
  }

  private getActivePagedSnapshot(): InventoryPagedSnapshot | null {
    if (!this.pagedSnapshot || this.pagedSnapshot.filter !== this.activeFilter || this.pagedSnapshot.search !== this.inventorySearchQuery) {
      return null;
    }
    return this.pagedSnapshot;
  }

  private invalidatePagedSnapshotForInventory(inventory: Inventory): void {
    const revision = this.getInventoryRevision(inventory);
    if (revision === null) {
      return;
    }
    const pending = this.inventoryPageRequestState.getPending();
    if (pending && pending.knownRevision !== null && pending.knownRevision !== revision) {
      this.resetInventoryPageRequest();
    }
    if (this.pagedSnapshot && this.pagedSnapshot.revision !== revision) {
      this.pagedSnapshot = null;
      this.resetInventoryPageRequest();
    }
  }

  private ensureInventoryPageRequested(force = false): void {
    if (!this.onRequestInventoryPage) {
      return;
    }
    const activePage = this.pagedSnapshot?.filter === this.activeFilter && this.pagedSnapshot.search === this.inventorySearchQuery
      ? this.pagedSnapshot
      : null;
    if (!force && (this.inventoryPageRequestState.isPending() || (activePage && activePage.items.length > 0))) {
      return;
    }
    this.requestInventoryPage(this.inventoryPageOffset, INVENTORY_PAGE_SIZE);
  }

  private requestInventoryPage(offset: number, limit: number): void {
    if (!this.onRequestInventoryPage) {
      return;
    }
    const normalizedOffset = normalizeInventoryPageOffset(offset);
    const normalizedLimit = normalizeInventoryPageLimit(limit, INVENTORY_PAGE_SIZE);
    const payload = this.inventoryPageRequestState.begin({
      filter: this.activeFilter,
      search: this.inventorySearchQuery,
      offset: normalizedOffset,
      limit: normalizedLimit,
      knownRevision: this.getInventoryRevision(this.lastInventory),
    });
    this.inventoryPageOffset = normalizedOffset;
    this.armInventoryPageRequestTimeout(payload.requestId);
    if (!this.onRequestInventoryPage(payload)) {
      this.inventoryPageRequestState.cancel(payload.requestId);
      this.clearInventoryPageRequestTimeout();
    }
    this.patchInventoryPageRequestState();
  }

  private resetInventoryPageRequest(): void {
    this.inventoryPageRequestState.reset();
    this.clearInventoryPageRequestTimeout();
  }

  private armInventoryPageRequestTimeout(requestId: string): void {
    this.clearInventoryPageRequestTimeout();
    this.inventoryPageRequestTimeout = window.setTimeout(() => {
      this.inventoryPageRequestTimeout = null;
      if (this.inventoryPageRequestState.cancel(requestId)) {
        this.patchInventoryPageRequestState();
      }
    }, INVENTORY_PAGE_REQUEST_TIMEOUT_MS);
  }

  private clearInventoryPageRequestTimeout(): void {
    if (this.inventoryPageRequestTimeout !== null) {
      window.clearTimeout(this.inventoryPageRequestTimeout);
      this.inventoryPageRequestTimeout = null;
    }
  }

  /** 只更新分页按钮或 React 状态，不重建背包壳层和格子。 */
  private patchInventoryPageRequestState(): void {
    if (this.useReactPanel()) {
      this.syncReactState(this.lastInventory);
      return;
    }
    if (this.shellRefs) {
      this.patchInventoryPagination(this.shellRefs, this.getActivePagedSnapshot());
    }
  }

  /** collectVisibleItems：一次遍历收集可见总数和当前已渲染批次。 */
  private collectVisibleItems(inventory: Inventory): InventoryVisibleSnapshot {
    const paged = this.getActivePagedSnapshot();
    if (paged) {
      return {
        totalVisibleItems: paged.totalVisibleItems,
        renderedItems: paged.items,
      };
    }
    const renderedItems: InventoryVisibleSnapshot['renderedItems'] = [];
    let totalVisibleItems = 0;
    const renderLimit = Math.max(0, this.renderedVisibleCount);
    for (let slotIndex = 0; slotIndex < inventory.items.length; slotIndex += 1) {
      const item = inventory.items[slotIndex];
      if (!item || !matchesInventoryTypeFilter(item.type, this.activeFilter) || !this.matchesInventorySearch(item)) {
        continue;
      }
      totalVisibleItems += 1;
      if (renderedItems.length < renderLimit) {
        renderedItems.push({ item, slotIndex });
      }
    }
    return { totalVisibleItems, renderedItems };
  }

  /** countVisibleItems：只计数筛选后条目，滚动懒加载热路径避免创建数组。 */
  private countVisibleItems(inventory: Inventory): number {
    const paged = this.getActivePagedSnapshot();
    if (paged) {
      return paged.totalVisibleItems;
    }
    if (this.activeFilter === 'all' && !this.inventorySearchQuery) {
      return inventory.items.length;
    }
    let count = 0;
    for (const item of inventory.items) {
      if (matchesInventoryTypeFilter(item?.type, this.activeFilter) && this.matchesInventorySearch(item)) {
        count += 1;
      }
    }
    return count;
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
    if (this.pagedSnapshot?.filter === this.activeFilter) {
      return;
    }
    const visibleItemCount = this.countVisibleItems(this.lastInventory);
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

    // 使用缓存避免 scroll 路径中重复 getComputedStyle
    if (this.cachedScrollContainer !== undefined && !preferredTarget) {
      return this.cachedScrollContainer;
    }
    if (preferredTarget && preferredTarget.contains(this.pane) && this.isScrollableContainer(preferredTarget)) {
      this.cachedScrollContainer = preferredTarget;
      return preferredTarget;
    }
    let current: HTMLElement | null = this.pane.parentElement;
    while (current) {
      if (this.isScrollableContainer(current)) {
        this.cachedScrollContainer = current;
        return current;
      }
      current = current.parentElement;
    }
    this.cachedScrollContainer = null;
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

  /** isInventoryUiActive：判断背包列表或详情是否需要实时刷新。 */
  private isInventoryUiActive(): boolean {
    return this.isPaneVisible() || detailModalHost.isOpenFor(InventoryPanel.MODAL_OWNER);
  }

  /** flushPendingVisibleRefresh：tab 重新可见后补刷最新背包列表。 */
  private flushPendingVisibleRefresh(): void {
    if (!this.pendingVisibleRefresh || !this.lastInventory || !this.isPaneVisible()) {
      return;
    }
    this.pendingVisibleRefresh = false;
    if (this.useReactPanel()) {
      this.syncReactState(this.lastInventory);
      this.scheduleLoadMoreCheck();
      this.syncCooldownRefresh();
      return;
    }
    if (!this.patchList(this.lastInventory)) {
      this.render(this.lastInventory);
    }
    this.scheduleLoadMoreCheck();
    this.syncCooldownRefresh();
  }

  /** scrollToTop：处理scroll To Top。 */
  private scrollToTop(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const scrollContainer = this.resolveScrollContainer();
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
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
      playerRealmLv: this.playerRealm?.realmLv,
    });
  }

  /** hasActiveCooldowns：判断是否活跃Cooldowns。 */
  private hasActiveCooldowns(inventory: Inventory | null = this.lastInventory): boolean {
    if (!inventory) {
      return false;
    }
    return this.getCooldownStateMap(inventory).size > 0;
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
    if (!this.isInventoryUiActive() || !this.hasActiveCooldowns()) {
      return;
    }
    this.cooldownRefreshTimer = window.setTimeout(() => {
      this.cooldownRefreshTimer = null;
      if (!this.lastInventory) {
        return;
      }
      if (!this.isInventoryUiActive()) {
        return;
      }
      if (this.isPaneVisible()) {
        if (this.useReactPanel()) {
          this.syncReactState(this.lastInventory);
        } else if (!this.patchList(this.lastInventory)) {
          this.render(this.lastInventory);
        }
      }
      if (!this.patchModal()) {
        this.renderModal();
      }
      this.refreshTooltipContent();
      this.syncCooldownRefresh();
    }, INVENTORY_COOLDOWN_REFRESH_MS);
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
    this.itemActionDialogController.reset();
    this.bulkDiscardDialogController.reset();
    this.formationDialogSlotIndex = null;
    this.sectFoundingDialogSlotIndex = null;
    this.lastModalRenderKey = null;
    this.sourceExpanded = false;
    this.sourceExpandedItemKey = null;
  }

  /** buildModalRenderKey：构建弹窗渲染Key。 */
  private buildModalRenderKey(item: ItemStack): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const actionDialogRenderKey = this.itemActionDialogController.buildRenderKey(item, this.getItemIdentity(item));
    if (actionDialogRenderKey) {
      return actionDialogRenderKey;
    }

    if (this.formationDialogSlotIndex !== null && this.isFormationDiskItem(item)) {
      return [
        'formation',
        this.getItemIdentity(item),
        String(this.playerQi),
      ].join('|');
    }

    if (this.sectFoundingDialogSlotIndex !== null && this.isSectFoundingTokenItem(item)) {
      return [
        'sect-founding',
        this.getItemIdentity(item),
        String(item.count),
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

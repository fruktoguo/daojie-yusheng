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
  HEAVEN_GATE_REROLL_COST_RATIO,
  Inventory,
  InventoryItemCooldownState,
  ItemStack,
  MERIT_ITEM_ID,
  PlayerState,
  PlayerRealmState,
  BUILTIN_FORMATION_TEMPLATES,
  FORMATION_DISK_TIER_LABELS,
  FormationCreatePayload,
  FORMATION_SPIRIT_STONE_ITEM_ID,
  FORMATION_TICKS_PER_DAY,
  normalizeFormationSetup,
  resolveFormationCostConfig,
  resolveFormationDamagePerAura,
  resolveFormationDamageReduction,
  resolveFormationSetupPlan,
  resolveFormationVisual,
  percentModifierToMultiplier,
  type FormationEffectKind,
  type FormationResolvedStats,
  type FormationSetup,
  type FormationTemplate,
  type FormationRangeShape,
  SHATTER_SPIRIT_PILL_COST_RATIO,
  TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA,
  createItemStackSignature,
  getFirstGrapheme,
  getGraphemeCount,
  shouldWarnTechniqueLearningDifficulty,
  type C2S_RequestInventoryPage,
  type S2C_InventoryPage,
  type SyncedItemStack,
} from '@mud/shared';
import {
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
  describeMaterialValueDetails,
  ItemTooltipCooldownState,
} from '../equipment-tooltip';
import { getItemAffixTypeLabel, getItemDecorClassName, getItemDisplayMeta } from '../item-display';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint, createPanelSectionWithTitle, createSmallBtn } from '../ui-primitives';
import { describePreviewBonuses } from '../stat-preview';
import { formatTechniqueCumulativeBonusSummary } from '../technique-bonus-summary';
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

/** InventoryActionKind：分类枚举。 */
type InventoryActionKind = 'use' | 'drop' | 'destroy';

type FormationRangePreviewPayload = {
  shape: FormationRangeShape;
  radius: number;
  rangeHighlightColor?: string;
} | null;

const FORMATION_SETUP_MIN_RADIUS = 1;
const FORMATION_SETUP_MAX_RADIUS = 10;
const FORMATION_SETUP_MIN_DURATION_MINUTES = 1;
const FORMATION_SETUP_MAX_DURATION_MINUTES = 24 * 60;
type UseItemOptions = {
  sectName?: string;
  sectMark?: string;
};

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

/** InventoryActionDialogState：背包物品操作对话框状态。 */
interface InventoryActionDialogState {
/**
 * kind：kind相关字段。
 */

  kind: InventoryActionKind;
  /**
 * itemKey：弹窗打开时选中的物品身份。
 */

  itemKey: string;
  /**
 * defaultCount：数量或计量字段。
 */

  defaultCount: number;
  /**
 * confirmDestroy：confirmDestroy相关字段。
 */

  confirmDestroy: boolean;
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
  count: HTMLElement;
  gradeLine: HTMLElement;
  name: HTMLElement;
  cooldown: HTMLElement;
  cooldownPie: HTMLElement;
  cooldownLabel: HTMLElement;
  actions: HTMLElement;
  dropButton: HTMLButtonElement;
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
  loading: boolean;
  requestId: string | null;
}

/** INVENTORY_SOURCE_COLLAPSED_COUNT：背包来源COLLAPSED数量。 */
const INVENTORY_SOURCE_COLLAPSED_COUNT = 3;
/** HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID：HEAVEN SPIRITUAL ROOT种子物品ID。 */
const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
/** DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID：DIVINE SPIRITUAL ROOT种子物品ID。 */
const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
/** SHATTER_SPIRIT_PILL_ITEM_ID：SHATTER灵石PILL物品ID。 */
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
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
/** HEAVEN_GATE_REROLL_AVERAGE_BONUS：HEAVEN关卡REROLL AVERAGE BONUS。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
/** INVENTORY_INITIAL_RENDER_COUNT：背包初始渲染数量。 */
const INVENTORY_INITIAL_RENDER_COUNT = 72;
const INVENTORY_PAGE_SIZE = 30;
/** INVENTORY_RENDER_BATCH_SIZE：背包渲染BATCH SIZE。 */
const INVENTORY_RENDER_BATCH_SIZE = 48;
/** INVENTORY_LOAD_MORE_THRESHOLD_PX：背包LOAD MORE THRESHOLD PX。 */
const INVENTORY_LOAD_MORE_THRESHOLD_PX = 240;
const INVENTORY_SEARCH_DEBOUNCE_MS = 250;
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
  private onRequestInventoryPage: ((payload: C2S_RequestInventoryPage) => void) | null = null;
  /** onDropItem：on掉落物品。 */
  private onDropItem: ((itemInstanceId: string, count: number) => void) | null = null;
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
  /** actionDialog：动作对话。 */
  private actionDialog: InventoryActionDialogState | null = null;
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
  private inventoryPageRequestSeq = 0;
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
      onRequestLoadMore: (scrollTarget) => this.maybeLoadMoreVisibleItems(scrollTarget),
      onPageChange: (direction) => this.requestAdjacentInventoryPage(direction),
      onPrimaryAction: (slotIndex, itemInstanceId) => this.handlePrimaryAction(slotIndex, itemInstanceId, { closeModal: false }),
      onDropOne: (slotIndex, itemInstanceId) => this.handleDropOne(slotIndex, itemInstanceId),
    });
    this.bindPaneEvents();
    this.bindTooltipEvents();
    const paneVisibilityObserver = new MutationObserver(() => this.flushPendingVisibleRefresh());
    paneVisibilityObserver.observe(this.pane, { attributes: true, attributeFilter: ['class'] });
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
    this.actionDialog = null;
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
    this.inventoryPageRequestSeq = 0;
    if (this.inventorySearchRequestTimer !== null) {
      window.clearTimeout(this.inventorySearchRequestTimer);
      this.inventorySearchRequestTimer = null;
    }
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
    onDestroy: (itemInstanceId: string, count: number) => void,
    onEquip: (itemInstanceId: string) => void,
    onSort: () => void,
    onRepairInventoryItemInstanceIds: () => void,
    onCreateFormation?: (payload: FormationCreatePayload) => void,
    onPreviewFormationRange?: (payload: FormationRangePreviewPayload) => void,
    onRequestInventoryPage?: (payload: C2S_RequestInventoryPage) => void,
  ): void {
    this.onUseItem = onUse;
    this.onOpenHeavenlyDaoShop = onOpenHeavenlyDaoShop;
    this.onDropItem = onDrop;
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
      this.pendingVisibleRefresh = false;
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
    const filter = this.normalizeInventoryPageFilter(page.filter);
    if (filter !== this.activeFilter) {
      return;
    }
    const search = this.normalizeInventorySearchQuery(page.search);
    if (search !== this.inventorySearchQuery) {
      return;
    }
    const requestId = typeof page.requestId === 'string' ? page.requestId.trim() : '';
    if (
      requestId
      && this.pagedSnapshot?.requestId
      && requestId !== this.pagedSnapshot.requestId
    ) {
      return;
    }

    const offset = Math.max(0, Math.trunc(Number(page.offset) || 0));
    const limit = Math.max(1, Math.trunc(Number(page.limit) || INVENTORY_PAGE_SIZE));
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
      loading: false,
      requestId: null,
    };
    this.renderedVisibleCount = pageItems.length;

    if (this.useReactPanel()) {
      this.pendingVisibleRefresh = false;
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
    if (this.requiresUseConfirmation(item)) {
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

  private handleDropOne(slotIndex: number, expectedItemInstanceId?: string): void {
    const item = Number.isFinite(slotIndex) ? this.lastInventory?.items[slotIndex] : null;
    const itemInstanceId = this.getInventoryItemInstanceId(item);
    if (!itemInstanceId || (expectedItemInstanceId && itemInstanceId !== expectedItemInstanceId)) {
      if (!itemInstanceId) {
        this.repairMissingInventoryItemInstanceIds();
      }
      return;
    }
    this.onDropItem?.(itemInstanceId, 1);
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
    const consumableGradeLineLabel = this.getConsumableGradeLineLabel(item);
    return {
      slotIndex,
      itemInstanceId: this.getInventoryItemInstanceId(item) || null,
      itemId: item.itemId,
      itemKey: itemIdentity,
      name: displayName,
      nameClassName: `inventory-cell-name ${this.getNameClass(displayName)}`.trim(),
      countLabel: formatDisplayCountBadge(item.count),
      itemType: item.type,
      typeLabel: this.getInventoryCellTypeLabel(item),
      gradeLineLabel: consumableGradeLineLabel ?? undefined,
      cellClassName: `${getItemDecorClassName('inventory-cell', item)}${cooldownState ? ' inventory-cell--cooldown' : ''}`,
      grade: itemMeta.grade ?? undefined,
      affinityBadge: itemMeta.affinityBadge
        ? {
          label: itemMeta.affinityBadge.label,
          title: itemMeta.affinityBadge.title,
          className: `item-card-chip item-card-chip--affinity item-card-chip--${itemMeta.affinityBadge.tone} item-card-chip--element-${itemMeta.affinityBadge.element}`,
        }
        : undefined,
      levelLabel: itemMeta.levelLabel ?? undefined,
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

      const pageButton = target.closest<HTMLElement>('[data-inventory-page-action]');
      if (pageButton) {
        const action = pageButton.dataset.inventoryPageAction;
        if (action === 'prev' || action === 'next') {
          this.requestAdjacentInventoryPage(action);
        }
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
        this.handlePrimaryAction(slotIndex);
        return;
      }

      const dropButton = target.closest<HTMLElement>('[data-inline-drop]');
      if (dropButton) {
        event.stopPropagation();
        const rawIndex = dropButton.dataset.inlineDrop;
        if (!rawIndex) {
          return;
        }
        const slotIndex = parseInt(rawIndex, 10);
        this.handleDropOne(slotIndex);
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
      if (item && this.isFormationDiskItem(item)) {
        this.openFormationDialog(this.selectedSlotIndex);
        return;
      }
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
    filters.className = 'inventory-filter-tabs';
    const filterButtons = new Map<InventoryFilter, HTMLButtonElement>();
    for (const tab of INVENTORY_FILTER_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inventory-filter-tab';
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
    head.append(type);
    const count = document.createElement('span');
    count.className = 'inventory-cell-count';
    count.dataset.itemCount = 'true';
    head.append(count);

    const gradeLine = document.createElement('div');
    gradeLine.className = 'inventory-cell-grade-line';
    gradeLine.dataset.itemGradeLine = 'true';
    gradeLine.hidden = true;

    const name = document.createElement('div');
    name.className = 'inventory-cell-name';
    name.dataset.itemName = 'true';

    const actions = document.createElement('div');
    actions.className = 'inventory-cell-actions';
    actions.dataset.itemActions = 'true';
    const dropButton = createSmallBtn(t('inventory.action.drop-one', undefined), {
      variants: ['danger'],
      dataset: { inlineDrop: String(slotIndex) },
    });
    actions.append(dropButton);

    cell.append(cooldown, head, gradeLine, name, actions);
    this.cellRefs.set(cell, {
      type,
      count,
      gradeLine,
      name,
      cooldown,
      cooldownPie,
      cooldownLabel,
      actions,
      dropButton,
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
    const count = cell.querySelector<HTMLElement>('[data-item-count="true"]');
    const gradeLine = cell.querySelector<HTMLElement>('[data-item-grade-line="true"]');
    const name = cell.querySelector<HTMLElement>('[data-item-name="true"]');
    const cooldown = cell.querySelector<HTMLElement>('[data-item-cooldown="true"]');
    const cooldownPie = cell.querySelector<HTMLElement>('[data-item-cooldown-pie="true"]');
    const cooldownLabel = cell.querySelector<HTMLElement>('[data-item-cooldown-label="true"]');
    const actions = cell.querySelector<HTMLElement>('[data-item-actions="true"]');
    const dropButton = cell.querySelector<HTMLButtonElement>('[data-inline-drop]');
    if (!type || !count || !gradeLine || !name || !cooldown || !cooldownPie || !cooldownLabel || !actions || !dropButton) {
      return null;
    }
    const refs = { type, count, gradeLine, name, cooldown, cooldownPie, cooldownLabel, actions, dropButton };
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
      String(slotIndex),
      itemIdentity,
      String(item.count),
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
    let primaryButton = refs.actions.querySelector<HTMLButtonElement>('[data-item-primary="true"]');

    if (primaryAction) {
      if (!primaryButton) {
        primaryButton = createSmallBtn(primaryAction.label, { dataset: { itemPrimary: 'true' } });
        refs.actions.insertBefore(primaryButton, refs.dropButton);
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
      affinityNode.setAttribute('aria-label', itemMeta.affinityBadge.title);
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
    cell.className = getItemDecorClassName('inventory-cell', item);
    cell.classList.toggle('inventory-cell--cooldown', cooldownState !== null);

    const gradeLineLabel = this.getConsumableGradeLineLabel(item);
    refs.type.textContent = this.getInventoryCellTypeLabel(item);
    refs.gradeLine.hidden = item.type !== 'consumable';
    refs.gradeLine.textContent = gradeLineLabel ?? '';
    refs.count.textContent = formatDisplayCountBadge(item.count);
    refs.name.textContent = displayName;
    refs.name.setAttribute('aria-label', displayName);
    refs.name.className = `inventory-cell-name ${this.getNameClass(displayName)}`.trim();
    refs.dropButton.dataset.inlineDrop = String(slotIndex);

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

  private getInventoryCellTypeLabel(item: ItemStack): string {
    const typeLabel = getItemTypeLabel(item.type);
    return item.type === 'consumable' ? typeLabel : getItemAffixTypeLabel(item, typeLabel);
  }

  private getConsumableGradeLineLabel(item: ItemStack): string | null {
    if (item.type !== 'consumable') {
      return null;
    }
    const itemMeta = getItemDisplayMeta(item);
    return itemMeta.gradeLabel ? `· ${itemMeta.gradeLabel}` : '';
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
    if (this.actionDialog && this.actionDialog.itemKey !== this.selectedItemKey) {
      this.actionDialog = null;
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
    const bonusLines = item.type === 'equipment' || item.type === 'artifact'
      ? describeEquipmentBonuses(previewItem, this.playerRealm?.realmLv)
      : describePreviewBonuses(previewItem.equipAttrs, previewItem.equipStats, previewItem.equipValueStats);
    const materialValueLines = item.type === 'material' ? describeMaterialValueDetails(previewItem) : [];
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
      subtitle: t('inventory.modal.item-subtitle', { type: getItemTypeLabel(item.type), count: formatDisplayCountBadge(item.count) }),
      renderBody: (body) => {
        this.renderItemDetailBody(body, item, sourceListHtml, sourceEntryCount, canToggleSourceList, primaryAction, canBatchUse, canBatchDropOrDestroy, bonusLines, materialValueLines, effectLines, statusLabel);
      },
      onClose: () => {
        this.clearFormationWorldPreview();
        this.resetModalState();
      },
      onAfterRender: (body, signal) => {
        body.querySelector<HTMLElement>('[data-inventory-primary]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!primaryAction || primaryAction.kind === 'status') {
            return;
          }
          const itemInstanceId = this.getInventoryItemInstanceId(item);
          if (!itemInstanceId) {
            return;
          }
          if (primaryAction.kind === 'equip') {
            this.onEquipItem?.(itemInstanceId);
            this.closeModal();
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
          if (this.requiresUseConfirmation(item)) {
            this.openActionDialog('use', slotIndex, 1);
            return;
          }
          this.handlePrimaryAction(slotIndex, itemInstanceId, { closeModal: true });
        }, { signal });
        body.querySelectorAll<HTMLElement>('[data-inventory-open-action]').forEach((button) => button.addEventListener('click', (event) => {
          event.stopPropagation();
          const kind = button.dataset.inventoryOpenAction as InventoryActionKind | undefined;
          const defaultCount = Number.parseInt(button.dataset.defaultCount ?? '1', 10);
          if (!kind) {
            return;
          }
          this.openActionDialog(kind, slotIndex, Number.isFinite(defaultCount) ? defaultCount : 1);
        }, { signal }));
        body.querySelector<HTMLElement>('[data-inventory-source-toggle="true"]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.sourceExpanded = !this.sourceExpanded;
          this.renderModal();
        }, { signal });
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
        this.renderFormationDialogBody(body, item);
      },
      onClose: () => {
        this.clearFormationWorldPreview();
        this.resetModalState();
      },
      onAfterRender: (body, signal) => {
        body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-formation-input]').forEach((input) => {
          const onInput = () => this.handleFormationInputChange(body, item, input);
          input.addEventListener('input', onInput, { signal });
          input.addEventListener('change', onInput, { signal });
        });
        this.syncFormationPreview(body, item);
        this.bindFormationRangePreviewButton(body, signal);
        body.querySelector<HTMLElement>('[data-formation-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.clearFormationWorldPreview();
          this.formationDialogSlotIndex = null;
          this.renderModal();
        }, { signal });
        body.querySelector<HTMLElement>('[data-formation-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const payload = this.readFormationPayload(body, item);
          if (!payload) {
            return;
          }
          this.clearFormationWorldPreview();
          this.onCreateFormation?.(payload);
          this.closeModal();
        }, { signal });
      },
    });
    this.lastModalRenderKey = this.buildModalRenderKey(item);
  }

  private renderFormationDialogBody(body: HTMLElement, item: ItemStack): void {
    const diskMultiplier = this.resolveFormationDiskMultiplier(item);
    replaceElementHtml(body, `
      <div class="formation-dialog-layout">
      <div class="formation-config-grid">
        <label class="formation-config-field formation-config-field--select ui-detail-field">
          <strong>${t('inventory.formation.field.template', undefined)}</strong>
          <select class="ui-input formation-config-input" data-formation-input data-formation-id>
            ${BUILTIN_FORMATION_TEMPLATES.filter((template) => template.placeableByDisk !== false).map((template) => `<option value="${this.escapeHtml(template.id)}">${this.escapeHtml(template.name)}</option>`).join('')}
          </select>
        </label>
        <label class="formation-config-field formation-config-field--slider ui-detail-field">
          <strong>${t('inventory.formation.field.range', undefined)} <span>${t('inventory.formation.default-radius', undefined)} <output data-formation-default-radius>1</output> ${t('common.unit.grid', undefined)}</span></strong>
          <div class="formation-config-slider-row">
            <input class="formation-config-slider" data-formation-input data-formation-radius-slider type="range" min="${FORMATION_SETUP_MIN_RADIUS}" max="${FORMATION_SETUP_MAX_RADIUS}" step="1" value="1">
            <input class="ui-input formation-config-input formation-config-number-input" data-formation-input data-formation-radius-input type="number" min="${FORMATION_SETUP_MIN_RADIUS}" max="${FORMATION_SETUP_MAX_RADIUS}" step="1" value="1">
          </div>
        </label>
        <label class="formation-config-field formation-config-field--slider ui-detail-field">
          <strong>${t('inventory.formation.field.duration', undefined)} <span>${t('inventory.formation.default-duration', undefined)} <output data-formation-default-duration>1440 ${t('common.unit.minute', undefined)}</output></span></strong>
          <div class="formation-config-slider-row">
            <input class="formation-config-slider" data-formation-input data-formation-duration-slider type="range" min="${FORMATION_SETUP_MIN_DURATION_MINUTES}" max="${FORMATION_SETUP_MAX_DURATION_MINUTES}" step="1" value="1440">
            <input class="ui-input formation-config-input formation-config-number-input" data-formation-input data-formation-duration-input type="number" min="${FORMATION_SETUP_MIN_DURATION_MINUTES}" max="${FORMATION_SETUP_MAX_DURATION_MINUTES}" step="1" value="1440">
          </div>
        </label>
        <label class="formation-config-field ui-detail-field">
          <strong>${t('inventory.formation.field.effect', undefined)} <span>${t('inventory.formation.min-effect', undefined)} <output data-formation-min-effect>1</output></span></strong>
          <input class="ui-input formation-config-input" data-formation-input data-formation-effect-value type="number" min="1" step="1" value="1">
        </label>
        <div class="formation-cost-card ui-detail-field" data-formation-stone-state>
          <strong>${t('inventory.formation.cost.spirit-stone', undefined)}</strong>
          <output data-formation-stone-cost>-</output>
          <span>${t('inventory.formation.cost.reverse-note', undefined)}</span>
        </div>
        <div class="formation-cost-card ui-detail-field" data-formation-cost-state>
          <strong>${t('inventory.formation.cost.qi', undefined)}</strong>
          <output data-formation-qi-cost>-</output>
          <span>${t('inventory.formation.current', undefined)} <output data-formation-current-qi>${formatDisplayInteger(this.playerQi)}</output></span>
        </div>
      </div>
      <div class="formation-preview">
        <div class="formation-section-heading">
          <strong>${t('inventory.formation.preview.common', undefined)}</strong>
          <span data-formation-preview-summary>${t('inventory.formation.disk-multiplier', { multiplier: formatDisplayNumber(diskMultiplier) })}</span>
        </div>
        <div class="formation-preview-metrics">
          <span><em>${t('inventory.formation.stat.total-aura', undefined)}</em><output data-formation-stat="totalAura">-</output></span>
          <span><em>${t('inventory.formation.stat.total-stones', undefined)}</em><output data-formation-stat="totalStones">-</output></span>
          <span><em>${t('inventory.formation.stat.effect', undefined)}</em><output data-formation-stat="effectValue">-</output></span>
          <span><em>${t('inventory.formation.stat.radius', undefined)}</em><output data-formation-stat="radius">-</output></span>
          <span><em>${t('inventory.formation.stat.duration', undefined)}</em><output data-formation-stat="durationHours">-</output></span>
          <span class="formation-preview-metric--wide"><em>${t('inventory.formation.stat.active-cost', undefined)}</em><output data-formation-stat="activeCost">-</output></span>
          <span class="formation-preview-metric--wide"><em>${t('inventory.formation.stat.inactive-cost', undefined)}</em><output data-formation-stat="inactiveCost">-</output></span>
        </div>
      </div>
      <div class="formation-effect-card ui-detail-field">
        <div class="formation-section-heading">
          <strong>${t('inventory.formation.preview.unique', undefined)}</strong>
          <span data-formation-effect-kind>-</span>
        </div>
        <div class="formation-effect-specific-metrics" data-formation-effect-specific-metrics></div>
        <div class="formation-effect-desc" data-formation-effect-desc>-</div>
        <div class="formation-effect-list">
          <span><em>${t('inventory.formation.effect.target', undefined)}</em><output data-formation-effect-target>-</output></span>
          <span><em>${t('inventory.formation.effect.scaling', undefined)}</em><output data-formation-effect-scaling>-</output></span>
          <span><em>${t('inventory.formation.effect.range', undefined)}</em><output data-formation-effect-range>-</output></span>
          <span><em>${t('inventory.formation.effect.visibility', undefined)}</em><output data-formation-effect-visibility>-</output></span>
        </div>
      </div>
      <button class="small-btn ghost formation-range-preview-btn" type="button" data-formation-range-preview>${t('inventory.formation.action.preview-range', undefined)}</button>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-formation-cancel>${t('inventory.action.back-detail', undefined)}</button>
          <button class="small-btn" type="button" data-formation-confirm>${t('inventory.formation.action.confirm', undefined)}</button>
        </div>
      </div>
      </div>
    `);
  }

  private syncFormationPreview(body: HTMLElement, item: ItemStack): void {
    const previewSummary = body.querySelector<HTMLElement>('[data-formation-preview-summary]');
    const template = this.getSelectedFormationTemplate(body);
    const diskMultiplier = this.resolveFormationDiskMultiplier(item);
    const setup = this.syncFormationSetupInputs(body, template);
    const plan = resolveFormationSetupPlan(template, diskMultiplier, setup, this.playerFormationSkillLevel);
    const stats = plan.stats;
    const spiritStoneCount = plan.spiritStoneCount;
    const qiCost = plan.qiCost;
    const hasEnoughQi = this.playerQi >= qiCost;
    const hasEnoughStones = this.getCurrentSpiritStoneCount() >= spiritStoneCount;
    const costState = body.querySelector<HTMLElement>('[data-formation-cost-state]');
    const stoneState = body.querySelector<HTMLElement>('[data-formation-stone-state]');
    const stoneCostOutput = body.querySelector<HTMLOutputElement>('[data-formation-stone-cost]');
    if (stoneCostOutput) {
      stoneCostOutput.value = formatDisplayInteger(spiritStoneCount);
      stoneCostOutput.textContent = formatDisplayInteger(spiritStoneCount);
      stoneCostOutput.setAttribute('aria-label', `当前 ${formatDisplayInteger(this.getCurrentSpiritStoneCount())}，需要 ${formatDisplayInteger(spiritStoneCount)}`);
    }
    const qiCostOutput = body.querySelector<HTMLOutputElement>('[data-formation-qi-cost]');
    if (qiCostOutput) {
      qiCostOutput.value = formatDisplayInteger(qiCost);
      qiCostOutput.textContent = formatDisplayInteger(qiCost);
      qiCostOutput.setAttribute('aria-label', `当前 ${formatDisplayInteger(this.playerQi)}，需要 ${formatDisplayInteger(qiCost)}`);
    }
    const currentQiOutput = body.querySelector<HTMLOutputElement>('[data-formation-current-qi]');
    if (currentQiOutput) {
      currentQiOutput.value = formatDisplayInteger(this.playerQi);
      currentQiOutput.textContent = formatDisplayInteger(this.playerQi);
    }
    if (costState) {
      costState.dataset.formationCostState = hasEnoughQi ? 'ready' : 'insufficient';
    }
    if (stoneState) {
      stoneState.dataset.formationCostState = hasEnoughStones ? 'ready' : 'insufficient';
    }
    if (previewSummary) {
      previewSummary.textContent = !hasEnoughStones
        ? `灵石不足 ${formatDisplayInteger(spiritStoneCount - this.getCurrentSpiritStoneCount())}`
        : hasEnoughQi
          ? `阵盘增幅 ${formatDisplayNumber(diskMultiplier)} 倍 · 阵法 ${formatDisplayNumber(this.playerFormationSkillLevel)} 级`
          : `灵力不足 ${formatDisplayInteger(qiCost - this.playerQi)}`;
    }
    this.setFormationStatText(body, 'totalAura', stats.totalQiBudget ?? stats.totalAuraBudget);
    this.setFormationStatText(body, 'totalStones', stats.totalSpiritStoneBudget ?? spiritStoneCount);
    this.setFormationStatText(body, 'effectValue', stats.effectValue);
    this.setFormationStatText(body, 'radius', stats.radius);
    this.setFormationStatText(body, 'durationHours', stats.durationHours ?? setup.durationHours, '', 'duration');
    this.setFormationStatText(body, 'activeCost', this.formatFormationResourceCost(stats.dailyActiveQiCost ?? stats.dailyActiveCost, stats.dailyActiveSpiritStoneCost ?? 0));
    this.setFormationStatText(body, 'inactiveCost', this.formatFormationResourceCost(stats.dailyInactiveQiCost ?? stats.dailyInactiveCost, stats.dailyInactiveSpiritStoneCost ?? 0));
    this.syncFormationEffectIntro(body, template, stats);
    const confirmButton = body.querySelector<HTMLButtonElement>('[data-formation-confirm]');
    if (confirmButton) {
      confirmButton.disabled = !hasEnoughQi || !hasEnoughStones;
      if (hasEnoughStones && hasEnoughQi) {
        confirmButton.removeAttribute('aria-label');
      } else {
        confirmButton.setAttribute('aria-label', !hasEnoughStones
          ? `灵石不足：当前 ${formatDisplayInteger(this.getCurrentSpiritStoneCount())}，需要 ${formatDisplayInteger(spiritStoneCount)}`
          : `灵力不足：当前 ${formatDisplayInteger(this.playerQi)}，需要 ${formatDisplayInteger(qiCost)}`);
      }
      confirmButton.textContent = hasEnoughStones && hasEnoughQi
        ? '确认布阵'
        : !hasEnoughStones ? '灵石不足' : '灵力不足';
    }
    const previewButton = body.querySelector<HTMLButtonElement>('[data-formation-range-preview]');
    if (previewButton) {
      const shapeLabel = template.range.shape === 'circle'
        ? '圆形'
        : template.range.shape === 'square'
          ? '方形'
          : '棋盘';
      previewButton.textContent = `预览范围：${shapeLabel}半径 ${formatDisplayInteger(stats.radius)}`;
    }
    this.onPreviewFormationRange?.({
      shape: template.range.shape,
      radius: stats.radius,
      rangeHighlightColor: resolveFormationVisual(template).rangeHighlightColor,
    });
  }

  private syncFormationEffectIntro(body: HTMLElement, template: FormationTemplate, stats: FormationResolvedStats): void {
    const meta = this.describeFormationEffect(template.effect.kind, stats);
    this.setFormationTextContent(body, '[data-formation-effect-kind]', meta.kindLabel);
    this.renderFormationSpecificPreview(body, template, stats);
    this.setFormationTextContent(body, '[data-formation-effect-desc]', template.desc?.trim() || meta.fallbackDesc);
    this.setFormationTextContent(body, '[data-formation-effect-target]', meta.target);
    this.setFormationTextContent(body, '[data-formation-effect-scaling]', meta.scaling);
    this.setFormationTextContent(body, '[data-formation-effect-range]', this.describeFormationRange(template, stats));
    this.setFormationTextContent(body, '[data-formation-effect-visibility]', meta.visibility);
  }

  private renderFormationSpecificPreview(body: HTMLElement, template: FormationTemplate, stats: FormationResolvedStats): void {
    const container = body.querySelector<HTMLElement>('[data-formation-effect-specific-metrics]');
    if (!container) {
      return;
    }
    const metrics = this.describeFormationSpecificMetrics(template, stats);
    container.replaceChildren(...metrics.map((metric) => {
      const item = document.createElement('span');
      const label = document.createElement('em');
      label.textContent = metric.label;
      const output = document.createElement('output');
      output.value = metric.value;
      output.textContent = metric.value;
      item.append(label, output);
      return item;
    }));
  }

  private describeFormationSpecificMetrics(template: FormationTemplate, stats: FormationResolvedStats): Array<{ label: string; value: string }> {
    if (template.effect.kind === 'tile_aura_source') {
      const halfLifeTicks = Math.max(1, Math.trunc(template.effect.convergenceHalfLifeTicks ?? FORMATION_TICKS_PER_DAY));
      const perTickGain = stats.effectValue > 0 ? stats.effectValue / halfLifeTicks : 0;
      return [
        { label: '每息增加灵力', value: formatDisplayNumber(perTickGain, { maximumFractionDigits: 2, compactMaximumFractionDigits: 2 }) },
        { label: '预计最大灵力', value: formatDisplayInteger(stats.effectValue) },
      ];
    }
    if (template.effect.kind === 'terrain_stabilizer') {
      const reduction = resolveFormationDamageReduction(template, stats.effectValue);
      return [
        { label: '地块受击减伤', value: this.formatFormationPercent(reduction) },
        { label: '实际承伤比例', value: this.formatFormationPercent(1 - reduction) },
      ];
    }
    if (template.effect.kind === 'monster_suppression') {
      const layers = Math.max(0, Math.floor(stats.effectValue));
      const remainingMultiplier = percentModifierToMultiplier(-layers);
      return [
        { label: '压制层数', value: formatDisplayInteger(layers) },
        { label: '经验剩余比例', value: this.formatFormationPercent(remainingMultiplier) },
      ];
    }
    if (template.effect.kind === 'vision_suppression') {
      const percentPerStrength = Number.isFinite(Number(template.effect.visionReductionPercentPerStrength))
        ? Math.max(0, Number(template.effect.visionReductionPercentPerStrength))
        : 10;
      const reductionPercent = Math.max(0, Math.floor(stats.effectValue) * percentPerStrength);
      const remainingMultiplier = percentModifierToMultiplier(-reductionPercent);
      return [
        { label: '视野削减', value: `${formatDisplayNumber(reductionPercent)}%` },
        { label: '视野剩余比例', value: this.formatFormationPercent(remainingMultiplier) },
      ];
    }
    const selfDamageReduction = resolveFormationDamageReduction(template, stats.effectValue);
    const damagePerAura = resolveFormationDamagePerAura(template);
    const rawDurability = Math.max(1, Math.ceil((stats.totalQiBudget ?? stats.totalAuraBudget) * damagePerAura));
    const effectiveDurability = Math.max(1, Math.ceil(rawDurability / Math.max(0.000001, 1 - selfDamageReduction)));
    return [
      { label: '预计承受伤害', value: formatDisplayInteger(effectiveDurability) },
      { label: '阵法减伤', value: this.formatFormationPercent(selfDamageReduction) },
    ];
  }

  private formatFormationPercent(value: number): string {
    const normalizedValue = Math.max(0, Math.min(1, Number(value) || 0));
    if (normalizedValue <= 0) {
      return '0%';
    }
    if (normalizedValue >= 0.999999) {
      return '99.99%';
    }
    return `${(normalizedValue * 100).toFixed(2)}%`;
  }

  private describeFormationEffect(kind: FormationEffectKind, stats: FormationResolvedStats): {
    kindLabel: string;
    fallbackDesc: string;
    target: string;
    scaling: string;
    visibility: string;
  } {
    const effectValue = formatDisplayInteger(stats.effectValue);
    if (kind === 'tile_aura_source') {
      return {
        kindLabel: '灵气增幅',
        fallbackDesc: '持续抬升范围内地块灵气，使地块资源逐步接近目标灵气。',
        target: '范围内地块',
        scaling: `基础强度按阵盘与技艺增幅后，每 1 强度对应 100 灵气，当前目标 ${effectValue}`,
        visibility: '感气后可查看范围与阵眼',
      };
    }
    if (kind === 'terrain_stabilizer') {
      return {
        kindLabel: '地脉稳固',
        fallbackDesc: '稳固范围内地脉，抑制地块复生、消散与被拆损耗。',
        target: '可攻击地块与临时地块',
        scaling: `实际强度 ${effectValue}，每 10 强度约降低 1% 地块受击伤害`,
        visibility: '范围内自动生效',
      };
    }
    if (kind === 'monster_suppression') {
      return {
        kindLabel: '封魔压制',
        fallbackDesc: '压制范围内妖兽的主要战斗属性，并按实际压制幅度降低击杀经验。',
        target: '范围内妖兽',
        scaling: `实际强度 ${effectValue}，每 1 强度提供 1 层压制`,
        visibility: '范围内自动生效，多阵重叠取最高压制层数',
      };
    }
    if (kind === 'vision_suppression') {
      return {
        kindLabel: '视野压制',
        fallbackDesc: '遮蔽范围内修士感知，降低服务端视野半径。',
        target: '范围内玩家',
        scaling: `实际强度 ${effectValue}，每 1 强度提供 10% 视野削减`,
        visibility: '范围内自动生效，多阵重叠取最高视野削减',
      };
    }
    return {
      kindLabel: '边界封锁',
      fallbackDesc: '在阵法边界形成阻挡，封锁通行与视线。',
      target: '阵法边界与阵眼',
      scaling: `实际强度 ${effectValue}，每 10 强度约降低 1% 边界受击损耗`,
      visibility: '边界可见并阻挡，归属方按规则通行',
    };
  }

  private describeFormationRange(template: FormationTemplate, stats: FormationResolvedStats): string {
    const radius = formatDisplayInteger(stats.radius);
    if (template.range.shape === 'circle') {
      return `圆形半径 ${radius}，覆盖圆内地块`;
    }
    if (template.range.shape === 'checkerboard') {
      return `棋盘半径 ${radius}，只覆盖交错格`;
    }
    return `方形半径 ${radius}，覆盖外框内地块`;
  }

  private setFormationTextContent(body: HTMLElement, selector: string, text: string): void {
    const node = body.querySelector<HTMLElement>(selector);
    if (!node) {
      return;
    }
    node.textContent = text;
  }

  private setFormationStatText(body: HTMLElement, key: string, value: number | string, suffix = '', format: 'integer' | 'duration' = 'integer'): void {
    const node = body.querySelector<HTMLOutputElement>(`[data-formation-stat="${key}"]`);
    if (!node) {
      return;
    }
    const text = typeof value === 'string'
      ? value
      : format === 'duration' ? this.formatFormationDuration(value) : `${formatDisplayInteger(value)}${suffix}`;
    node.value = text;
    node.textContent = text;
  }

  private formatFormationResourceCost(qiCost: number, spiritStoneCost: number): string {
    return `每日 ${formatDisplayInteger(qiCost)}灵力 / ${formatDisplayInteger(spiritStoneCost)}灵石`;
  }

  private getSelectedFormationTemplate(body: HTMLElement): FormationTemplate {
    const formationId = body.querySelector<HTMLSelectElement>('[data-formation-id]')?.value ?? BUILTIN_FORMATION_TEMPLATES[0]?.id ?? '';
    return BUILTIN_FORMATION_TEMPLATES.find((entry) => entry.id === formationId && entry.placeableByDisk !== false)
      ?? BUILTIN_FORMATION_TEMPLATES.find((entry) => entry.placeableByDisk !== false)
      ?? BUILTIN_FORMATION_TEMPLATES[0]!;
  }

  private syncFormationSetupInputs(body: HTMLElement, template: FormationTemplate): FormationSetup {
    const cost = resolveFormationCostConfig(template);
    const radiusSlider = body.querySelector<HTMLInputElement>('[data-formation-radius-slider]');
    const radiusInput = body.querySelector<HTMLInputElement>('[data-formation-radius-input]');
    const durationSlider = body.querySelector<HTMLInputElement>('[data-formation-duration-slider]');
    const durationInput = body.querySelector<HTMLInputElement>('[data-formation-duration-input]');
    const effectInput = body.querySelector<HTMLInputElement>('[data-formation-effect-value]');
    const defaultDurationMinutes = Math.max(1, Math.round(cost.defaultDurationHours * 60));
    const activeRadiusInput = document.activeElement === radiusSlider ? radiusSlider : radiusInput ?? radiusSlider;
    const activeDurationInput = document.activeElement === durationSlider ? durationSlider : durationInput ?? durationSlider;
    const radiusValue = this.clampFormationControlNumber(
      activeRadiusInput?.value,
      cost.defaultRadius,
      FORMATION_SETUP_MIN_RADIUS,
      FORMATION_SETUP_MAX_RADIUS,
    );
    const durationMinutes = this.clampFormationControlNumber(
      activeDurationInput?.value,
      defaultDurationMinutes,
      FORMATION_SETUP_MIN_DURATION_MINUTES,
      FORMATION_SETUP_MAX_DURATION_MINUTES,
    );
    const setup = normalizeFormationSetup(template, {
      radius: radiusValue,
      durationHours: durationMinutes / 60,
      effectValue: effectInput ? Number.parseInt(effectInput.value, 10) : cost.minEffectValue,
    });
    const syncedRadius = this.clampFormationControlNumber(
      setup.radius,
      cost.defaultRadius,
      FORMATION_SETUP_MIN_RADIUS,
      FORMATION_SETUP_MAX_RADIUS,
    );
    const syncedDurationMinutes = this.clampFormationControlNumber(
      Math.round(setup.durationHours * 60),
      defaultDurationMinutes,
      FORMATION_SETUP_MIN_DURATION_MINUTES,
      FORMATION_SETUP_MAX_DURATION_MINUTES,
    );
    for (const input of [radiusSlider, radiusInput]) {
      if (!input) {
        continue;
      }
      input.min = String(FORMATION_SETUP_MIN_RADIUS);
      input.max = String(FORMATION_SETUP_MAX_RADIUS);
      input.step = '1';
      input.value = String(syncedRadius);
    }
    for (const input of [durationSlider, durationInput]) {
      if (!input) {
        continue;
      }
      input.min = String(FORMATION_SETUP_MIN_DURATION_MINUTES);
      input.max = String(FORMATION_SETUP_MAX_DURATION_MINUTES);
      input.step = '1';
      input.value = String(syncedDurationMinutes);
    }
    if (radiusInput) {
      radiusInput.setAttribute('aria-label', `阵法范围，${FORMATION_SETUP_MIN_RADIUS} 到 ${FORMATION_SETUP_MAX_RADIUS} 格`);
    }
    if (effectInput) {
      effectInput.min = String(cost.minEffectValue);
      effectInput.step = '1';
      effectInput.value = String(setup.effectValue);
    }
    this.setFormationOutputText(body, '[data-formation-default-radius]', cost.defaultRadius, ' 格');
    this.setFormationOutputText(body, '[data-formation-default-duration]', defaultDurationMinutes, ' 分钟');
    this.setFormationOutputText(body, '[data-formation-min-effect]', cost.minEffectValue);
    return { ...setup, radius: syncedRadius, durationHours: syncedDurationMinutes / 60 };
  }

  private clampFormationControlNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Math.round(Number(value));
    const normalized = Number.isFinite(parsed) ? parsed : Math.round(Number(fallback) || min);
    return Math.max(min, Math.min(max, normalized));
  }

  private setFormationOutputText(body: HTMLElement, selector: string, value: number, suffix = ''): void {
    const output = body.querySelector<HTMLOutputElement>(selector);
    if (!output) {
      return;
    }
    const text = `${formatDisplayInteger(value)}${suffix}`;
    output.value = text;
    output.textContent = text;
  }

  private formatFormationDuration(durationHours: number): string {
    const minutes = Math.max(1, Math.round(durationHours * 60));
    if (minutes < 60) {
      return `${formatDisplayInteger(minutes)}分钟`;
    }
    if (minutes % 60 === 0) {
      return `${formatDisplayInteger(minutes / 60)}小时`;
    }
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes - hours * 60;
    return `${formatDisplayInteger(hours)}小时${formatDisplayInteger(restMinutes)}分钟`;
  }

  private getCurrentSpiritStoneCount(): number {
    return (this.lastInventory?.items ?? []).reduce((total, item) => (
      item.itemId === FORMATION_SPIRIT_STONE_ITEM_ID
        ? total + Math.max(0, Math.trunc(Number(item.count) || 0))
        : total
    ), 0);
  }

  private setFormationPreviewFocusMode(visible: boolean): void {
    const modal = document.getElementById('detail-modal');
    const modalCard = document.getElementById('detail-modal-card');
    modal?.classList.toggle('formation-range-preview-active', visible);
    modalCard?.classList.toggle('formation-range-preview-active', visible);
  }

  private bindFormationRangePreviewButton(body: HTMLElement, signal: AbortSignal): void {
    const button = body.querySelector<HTMLButtonElement>('[data-formation-range-preview]');
    if (!button) {
      return;
    }
    const show = () => this.setFormationPreviewFocusMode(true);
    const hide = () => this.setFormationPreviewFocusMode(false);
    button.addEventListener('mouseenter', show, { signal });
    button.addEventListener('mouseleave', hide, { signal });
    button.addEventListener('focus', show, { signal });
    button.addEventListener('blur', hide, { signal });
    button.addEventListener('pointerdown', show, { signal });
    button.addEventListener('pointerup', hide, { signal });
    button.addEventListener('pointercancel', hide, { signal });
  }

  private clearFormationWorldPreview(): void {
    document.getElementById('detail-modal')?.classList.remove('formation-range-preview-active');
    document.getElementById('detail-modal-card')?.classList.remove('formation-range-preview-active');
    this.onPreviewFormationRange?.(null);
  }

  private handleFormationInputChange(
    body: HTMLElement,
    item: ItemStack,
    input: HTMLInputElement | HTMLSelectElement,
  ): void {
    this.syncFormationPairedInput(body, input);
    this.syncFormationPreview(body, item);
  }

  private syncFormationPairedInput(body: HTMLElement, input: HTMLInputElement | HTMLSelectElement): void {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const pairs: Array<[string, string]> = [
      ['[data-formation-radius-slider]', '[data-formation-radius-input]'],
      ['[data-formation-duration-slider]', '[data-formation-duration-input]'],
    ];
    for (const [sliderSelector, inputSelector] of pairs) {
      const slider = body.querySelector<HTMLInputElement>(sliderSelector);
      const numberInput = body.querySelector<HTMLInputElement>(inputSelector);
      if (!slider || !numberInput) {
        continue;
      }
      if (input === slider) {
        numberInput.value = slider.value;
        return;
      }
      if (input === numberInput) {
        slider.value = numberInput.value;
        return;
      }
    }
  }

  private readFormationPayload(body: HTMLElement, item: ItemStack | null, enforceQi = true): FormationCreatePayload | null {
    const template = this.getSelectedFormationTemplate(body);
    const formationId = template.id;
    const itemInstanceId = this.getInventoryItemInstanceId(item);
    if (!itemInstanceId) {
      this.repairMissingInventoryItemInstanceIds();
      return null;
    }
    const diskMultiplier = item ? this.resolveFormationDiskMultiplier(item) : 1;
    const setup = this.syncFormationSetupInputs(body, template);
    const plan = resolveFormationSetupPlan(template, diskMultiplier, setup, this.playerFormationSkillLevel);
    const spiritStoneCount = plan.spiritStoneCount;
    const qiCost = plan.qiCost;
    if (enforceQi && this.playerQi < qiCost) {
      return null;
    }
    if (this.getCurrentSpiritStoneCount() < spiritStoneCount) {
      return null;
    }
    return { itemRef: { itemInstanceId }, formationId, setup: plan.setup, spiritStoneCount, qiCost };
  }

  private readPositiveFormNumber(body: HTMLElement, selector: string, fallback: number, allowZero = false): number {
    const raw = body.querySelector<HTMLInputElement>(selector)?.value ?? String(fallback);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return allowZero ? Math.max(0, parsed) : Math.max(1, parsed);
  }

  private openFormationDialog(slotIndex: number): void {
    this.selectedSlotIndex = slotIndex;
    const item = this.lastInventory?.items[slotIndex];
    this.selectedItemKey = item ? this.getItemIdentity(item) : null;
    this.actionDialog = null;
    this.sectFoundingDialogSlotIndex = null;
    this.formationDialogSlotIndex = slotIndex;
    this.renderModal();
  }

  private openSectFoundingDialog(slotIndex: number): void {
    this.selectedSlotIndex = slotIndex;
    const item = this.lastInventory?.items[slotIndex];
    this.selectedItemKey = item ? this.getItemIdentity(item) : null;
    this.actionDialog = null;
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
      title: t('inventory.destroy.title', undefined),
      subtitle: t('inventory.modal.item-subtitle.count-only', { itemName: displayName, count: formatDisplayCountBadge(selectedCount) }),
      hint: t('common.modal.click-blank-cancel', undefined),
        renderBody: (body) => {
          this.renderDestroyConfirmBody(body);
        },
        onClose: () => {
          this.resetModalState();
        },
        onAfterRender: (body, signal) => {
          body.querySelector<HTMLElement>('[data-inventory-destroy-back]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.actionDialog = {
              ...dialog,
              confirmDestroy: false,
            };
            this.renderModal();
          }, { signal });
          body.querySelector<HTMLElement>('[data-inventory-destroy-confirm]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            const itemInstanceId = this.getInventoryItemInstanceId(item);
            if (!itemInstanceId) {
              this.repairMissingInventoryItemInstanceIds();
              return;
            }
            this.onDestroyItem?.(itemInstanceId, selectedCount);
            this.closeModal();
          }, { signal });
        },
      });
      this.lastModalRenderKey = this.buildModalRenderKey(item);
      return;
    }

    if (specialUseSummary) {
      detailModalHost.open({
        ownerId: InventoryPanel.MODAL_OWNER,
        title: specialUseSummary.title,
        subtitle: t('inventory.modal.item-subtitle.count-only', { itemName: displayName, count: formatDisplayCountBadge(1) }),
        hint: t('common.modal.click-blank-cancel', undefined),
        renderBody: (body) => {
          this.renderSpecialUseConfirmBody(body, specialUseSummary);
        },
        onClose: () => {
          this.resetModalState();
        },
        onAfterRender: (body, signal) => {
          body.querySelector<HTMLElement>('[data-inventory-action-cancel]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.actionDialog = null;
            this.renderModal();
          }, { signal });
          body.querySelector<HTMLElement>('[data-inventory-action-confirm]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            const itemInstanceId = this.getInventoryItemInstanceId(item);
            if (!itemInstanceId) {
              this.repairMissingInventoryItemInstanceIds();
              return;
            }
            this.onUseItem?.(itemInstanceId, 1);
            this.closeModal();
          }, { signal });
        },
      });
      this.lastModalRenderKey = this.buildModalRenderKey(item);
      return;
    }

    detailModalHost.open({
      ownerId: InventoryPanel.MODAL_OWNER,
      title: labels.title,
      subtitle: t('inventory.action-dialog.subtitle.max-count', { itemName: displayName, count: formatDisplayInteger(maxCount) }),
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => {
        this.renderActionDialogBody(body, labels, selectedCount, halfCount, maxCount);
      },
      onClose: () => {
        this.resetModalState();
      },
      onAfterRender: (body, signal) => {
        const countInput = body.querySelector<HTMLInputElement>('[data-inventory-action-count="true"]');
        this.syncActionCountInputWidth(countInput, maxCount);
        countInput?.addEventListener('input', () => {
          const nextValue = String(this.getUseCountFromInput(countInput, maxCount));
          if (countInput.value !== nextValue) {
            countInput.value = nextValue;
          }
          this.syncActionCountInputWidth(countInput, maxCount);
        }, { signal });
        body.querySelectorAll<HTMLElement>('[data-inventory-quick-count]').forEach((button) => button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!countInput) {
            return;
          }
          countInput.value = button.dataset.inventoryQuickCount ?? '1';
          this.syncActionCountInputWidth(countInput, maxCount);
        }, { signal }));
        body.querySelector<HTMLElement>('[data-inventory-action-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.actionDialog = null;
          this.renderModal();
        }, { signal });
        body.querySelector<HTMLElement>('[data-inventory-action-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const selected = this.getUseCountFromInput(countInput, maxCount);
          const itemInstanceId = this.getInventoryItemInstanceId(item);
          if (dialog.kind === 'use') {
            if (!itemInstanceId) {
              this.repairMissingInventoryItemInstanceIds();
              return;
            }
            this.onUseItem?.(itemInstanceId, selected);
            this.closeModal();
            return;
          }
          if (!itemInstanceId) {
            this.repairMissingInventoryItemInstanceIds();
            return;
          }
          if (dialog.kind === 'drop') {
            this.onDropItem?.(itemInstanceId, selected);
            this.closeModal();
            return;
          }
          this.actionDialog = {
            ...dialog,
            defaultCount: selected,
            confirmDestroy: true,
          };
          this.renderModal();
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
    primaryAction: InventoryPrimaryAction | null,
    canBatchUse: boolean,
    canBatchDropOrDestroy: boolean,
    bonusLines: string[],
    materialValueLines: string[],
    effectLines: string[],
    statusLabel: string | null,
  ): void {
    const previewItem = resolvePreviewItem(item);
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
      <div class="quest-detail-section">
        <strong>${t('inventory.detail.desc', undefined)}</strong>
        <span data-inventory-modal-desc="true">${this.escapeHtml(previewItem.desc)}</span>
      </div>
      ${statusLabel ? `<div class="quest-detail-section">
        <strong>${t('inventory.detail.status', undefined)}</strong>
        <span data-inventory-modal-status="true">${this.escapeHtml(statusLabel)}</span>
      </div>` : ''}
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
          ? `<button class="small-btn ghost inventory-source-toggle" data-inventory-source-toggle="true" type="button">${this.sourceExpanded ? t('inventory.source.collapse', undefined) : t('inventory.source.expand-all', { count: sourceEntryCount })}</button>`
          : ''}
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--left">
          ${primaryAction ? `<button class="small-btn" data-inventory-primary="true" type="button" ${primaryAction.disabled ? 'disabled' : ''}>${primaryAction.label}</button>` : ''}
          ${canBatchUse ? `<button class="small-btn ghost" data-inventory-open-action="use" data-default-count="1" type="button">${t('inventory.action.batch-use', undefined)}</button>` : ''}
        </div>
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right">
          <button class="small-btn ghost" data-inventory-open-action="drop" data-default-count="1" type="button">${t('inventory.action.drop-one', undefined)}</button>
          ${canBatchDropOrDestroy ? `<button class="small-btn ghost" data-inventory-open-action="drop" data-default-count="${item.count}" type="button">${t('inventory.action.batch-drop', undefined)}</button>` : ''}
          <button class="small-btn danger" data-inventory-open-action="destroy" data-default-count="1" type="button">${t('inventory.action.destroy', undefined)}</button>
          ${canBatchDropOrDestroy ? `<button class="small-btn danger" data-inventory-open-action="destroy" data-default-count="${item.count}" type="button">${t('inventory.action.batch-destroy', undefined)}</button>` : ''}
        </div>
      </div>
    `);
  }

  /** renderDestroyConfirmBody：渲染摧毁确认主体。 */
  private renderDestroyConfirmBody(body: HTMLElement): void {
    replaceElementHtml(body, `
      <div class="panel-section">
        <div class="empty-hint">${t('inventory.destroy.warning', undefined)}</div>
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-destroy-back>${t('inventory.destroy.back-count', undefined)}</button>
          <button class="small-btn danger" type="button" data-inventory-destroy-confirm>${t('inventory.destroy.confirm', undefined)}</button>
        </div>
      </div>
    `);
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
    replaceElementHtml(body, `
      <div class="ui-detail-field ui-detail-field--section">
        <strong>${t('inventory.use-confirm.instructions', undefined)}</strong>
        ${summary.lines.map((line) => `<div>${this.escapeHtml(line)}</div>`).join('')}
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-action-cancel>${this.escapeHtml(summary.cancelLabel ?? t('inventory.action.back-detail', undefined))}</button>
          <button class="small-btn" type="button" data-inventory-action-confirm>${this.escapeHtml(summary.confirmLabel ?? t('inventory.action.confirm-use', undefined))}</button>
        </div>
      </div>
    `);
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
    replaceElementHtml(body, `
      <div class="ui-detail-field ui-detail-field--section">
        <strong>${t('inventory.action-dialog.choose-count', undefined)}</strong>
        <div class="inventory-batch-use-row inventory-batch-use-row--dialog">
          <button class="small-btn ghost" type="button" data-inventory-quick-count="1">${t('inventory.action-dialog.one', undefined)}</button>
          <button class="small-btn ghost" type="button" data-inventory-quick-count="${halfCount}">${t('inventory.action-dialog.half', undefined)}</button>
          <button class="small-btn ghost" type="button" data-inventory-quick-count="${maxCount}">${t('inventory.action-dialog.all', undefined)}</button>
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
          <button class="small-btn ghost" type="button" data-inventory-action-cancel>${t('inventory.action.back-detail', undefined)}</button>
          <button class="small-btn ${labels.danger ? 'danger' : ''}" type="button" data-inventory-action-confirm>${labels.confirm}</button>
        </div>
      </div>
    `);
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
    return item.allowBatchUse === true && this.canUseItem(item) && !this.isFormationDiskItem(item) && !this.isSectFoundingTokenItem(item) && item.count > 1;
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
    return !this.isFormationDiskItem(item)
      && (this.getSpiritualRootSeedTier(item) !== null
      || item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
      || this.getTechniqueLearningWarningSummary(item) !== null);
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
            t('inventory.special-use.root-seed.divine.line-1', undefined),
            t('inventory.special-use.root-seed.line-2', {
              foundationCost: formatDisplayInteger(foundationCost),
              foundation: formatDisplayInteger(this.playerFoundation),
              remainingFoundation: formatDisplayInteger(remainingFoundation),
            }),
            t('inventory.special-use.root-seed.line-3', {
              currentRerollCount: formatDisplayInteger(currentRerollCount),
              gainedRerollCount: formatDisplayInteger(gainedRerollCount),
              nextRerollCount: formatDisplayInteger(nextRerollCount),
            }),
          ]
        : [
            t('inventory.special-use.root-seed.heaven.line-1', undefined),
            t('inventory.special-use.root-seed.line-2', {
              foundationCost: formatDisplayInteger(foundationCost),
              foundation: formatDisplayInteger(this.playerFoundation),
              remainingFoundation: formatDisplayInteger(remainingFoundation),
            }),
            t('inventory.special-use.root-seed.line-3', {
              currentRerollCount: formatDisplayInteger(currentRerollCount),
              gainedRerollCount: formatDisplayInteger(gainedRerollCount),
              nextRerollCount: formatDisplayInteger(nextRerollCount),
            }),
          ];
      return {
        title: tier === 'divine'
          ? t('inventory.special-use.root-seed.divine.title', undefined)
          : t('inventory.special-use.root-seed.heaven.title', undefined),
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
      title: t('inventory.special-use.shatter-spirit-pill.title', undefined),
      lines: [
        t('inventory.special-use.shatter-spirit-pill.line-1', undefined),
        t('inventory.special-use.shatter-spirit-pill.line-2', {
          currentExp: formatDisplayInteger(currentExp),
          expCost: formatDisplayInteger(expCost),
          remainingExp: formatDisplayInteger(remainingExp),
        }),
        t('inventory.special-use.shatter-spirit-pill.line-3', {
          currentRerollCount: formatDisplayInteger(currentRerollCount),
          nextRerollCount: formatDisplayInteger(nextRerollCount),
        }),
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
      title: t('inventory.technique-learning-warning.title', { name: technique.name || item.name }),
      lines: [
        t('inventory.technique-learning-warning.line-1', undefined),
        t('inventory.technique-learning-warning.line-2', {
          gap: formatDisplayInteger(gap),
          threshold: formatDisplayInteger(TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA),
        }),
        t('inventory.technique-learning-warning.line-3', undefined),
      ],
      confirmLabel: t('inventory.technique-learning-warning.confirm', undefined),
      cancelLabel: t('inventory.technique-learning-warning.cancel', undefined),
    };
  }

  /** formatTechniqueAttrSummary：格式化功法属性摘要。 */
  private formatTechniqueAttrSummary(item: NonNullable<ReturnType<typeof getLocalTechniqueTemplate>>): string {
    const maxLevel = Math.max(
      1,
      ...((item.layers ?? []).map((layer) => Math.max(1, Math.floor(layer.level)))),
    );
    return formatTechniqueCumulativeBonusSummary(maxLevel, item.layers);
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
    const item = this.lastInventory?.items[slotIndex] ?? null;
    this.actionDialog = {
      kind,
      itemKey: item ? this.getItemIdentity(item) : '',
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
        return { title: t('inventory.action-dialog.title.use', undefined), confirm: t('inventory.action-dialog.confirm.use', undefined), danger: false };
      case 'drop':
        return { title: t('inventory.action-dialog.title.drop', undefined), confirm: t('inventory.action-dialog.confirm.drop', undefined), danger: true };
      case 'destroy':
        return { title: t('inventory.action-dialog.title.destroy', undefined), confirm: t('inventory.action-dialog.confirm.destroy', undefined), danger: true };
      default:
        return { title: t('inventory.action-dialog.title.default', undefined), confirm: t('inventory.action-dialog.confirm.default', undefined), danger: false };
    }
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
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
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
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/\s+/g, ' ').trim().slice(0, 64).toLowerCase();
  }

  private getInventoryRevision(inventory: Inventory | null | undefined): number | null {
    const revision = Number((inventory as { revision?: number } | null | undefined)?.revision);
    return Number.isFinite(revision) && revision > 0 ? Math.trunc(revision) : null;
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
      loading: paged.loading,
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
    if (this.pagedSnapshot.items.length <= 0 && this.pagedSnapshot.loading) {
      return null;
    }
    return this.pagedSnapshot;
  }

  private invalidatePagedSnapshotForInventory(inventory: Inventory): void {
    const revision = this.getInventoryRevision(inventory);
    if (!this.pagedSnapshot || revision === null) {
      return;
    }
    if (this.pagedSnapshot.revision !== revision) {
      this.pagedSnapshot = null;
    }
  }

  private ensureInventoryPageRequested(force = false): void {
    if (!this.onRequestInventoryPage) {
      return;
    }
    const activePage = this.pagedSnapshot?.filter === this.activeFilter && this.pagedSnapshot.search === this.inventorySearchQuery
      ? this.pagedSnapshot
      : null;
    if (!force && activePage && (activePage.loading || activePage.items.length > 0)) {
      return;
    }
    this.requestInventoryPage(this.inventoryPageOffset, INVENTORY_PAGE_SIZE);
  }

  private requestInventoryPage(offset: number, limit: number): void {
    if (!this.onRequestInventoryPage) {
      return;
    }
    const normalizedOffset = Math.max(0, Math.trunc(Number(offset) || 0));
    const normalizedLimit = Math.max(1, Math.trunc(Number(limit) || INVENTORY_PAGE_SIZE));
    const requestId = `inventory:${Date.now()}:${this.inventoryPageRequestSeq += 1}`;
    const existing = this.pagedSnapshot?.filter === this.activeFilter && this.pagedSnapshot.search === this.inventorySearchQuery
      ? this.pagedSnapshot
      : null;
    this.inventoryPageOffset = normalizedOffset;
    this.pagedSnapshot = {
      filter: this.activeFilter,
      search: this.inventorySearchQuery,
      revision: existing?.revision ?? this.getInventoryRevision(this.lastInventory) ?? 0,
      totalItems: existing?.totalItems ?? this.lastInventory?.items.length ?? 0,
      totalVisibleItems: existing?.totalVisibleItems ?? 0,
      capacity: existing?.capacity ?? this.lastInventory?.capacity ?? 0,
      offset: normalizedOffset,
      limit: normalizedLimit,
      items: existing?.offset === normalizedOffset ? existing.items : [],
      loading: true,
      requestId,
    };
    this.onRequestInventoryPage({
      filter: this.activeFilter,
      search: this.inventorySearchQuery,
      offset: normalizedOffset,
      limit: normalizedLimit,
      requestId,
      knownRevision: this.getInventoryRevision(this.lastInventory) ?? undefined,
    });
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
      if (!item || (this.activeFilter !== 'all' && item.type !== this.activeFilter) || !this.matchesInventorySearch(item)) {
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
      if ((this.activeFilter === 'all' || item?.type === this.activeFilter) && this.matchesInventorySearch(item)) {
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
    this.actionDialog = null;
    this.formationDialogSlotIndex = null;
    this.sectFoundingDialogSlotIndex = null;
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

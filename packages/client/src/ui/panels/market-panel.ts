// TODO(next:UI01): 把 market-panel 主体、书册区和交易弹层继续改成 patch-first，并压缩重复业务样式 recipe。
import {
  NEXT_C2S_RequestMarketListings,
  computeBestEnhancementExpectedCost,
  calculateMarketTradeTotalCost,
  createItemStackSignature,
  EnhancementExpectedCostStrategy,
  EQUIP_SLOTS,
  EquipSlot,
  getMarketMinimumTradeQuantity,
  Inventory,
  ITEM_TYPES,
  ItemStack,
  ItemType,
  MARKET_MAX_UNIT_PRICE,
  MARKET_PRICE_PRESET_VALUES,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  PlayerState,
  NEXT_S2C_MarketListings,
  NEXT_S2C_MarketItemBook,
  NEXT_S2C_MarketOrders,
  NEXT_S2C_MarketStorage,
  NEXT_S2C_MarketTradeHistory,
  NEXT_S2C_MarketUpdate,
  TechniqueCategory,
  getMarketPriceStep,
  normalizeMarketPriceDown,
  normalizeMarketPriceUp,
} from '@mud/shared-next';
import { getLocalTechniqueCategoryForBookItem } from '../../content/local-templates';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { getViewportRoot } from '../responsive-viewport';
import { detailModalHost } from '../detail-modal-host';
import { preserveSelection } from '../selection-preserver';
import { MARKET_MODAL_TABS, MARKET_PANE_HINT, MarketModalTab } from '../../constants/ui/market';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';

/** 把普通文本转成可安全插入 HTML 的内容。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 复用同一套转义逻辑，避免属性值注入。 */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

/** 拼出一行普通提示文本，供 tooltip 复用。 */
function renderPlainTooltipLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${escapeHtml(value)}`;
}

/** 市场面板对外的请求/提交回调。 */
interface MarketPanelCallbacks {
  onRequestMarket: () => void;
  onRequestListings: (payload: NEXT_C2S_RequestMarketListings) => void;
  onRequestItemBook: (itemKey: string) => void;
  onRequestTradeHistory: (page: number) => void;
  onCreateSellOrder: (slotIndex: number, quantity: number, unitPrice: number) => void;
  onCreateBuyOrder: (itemKey: string, quantity: number, unitPrice: number) => void;
  onCancelOrder: (orderId: string) => void;
  onClaimStorage: () => void;
}

/** 市场主分类筛选项。 */
type MarketCategoryFilter = 'all' | ItemType;
/** 装备子分类筛选项。 */
type MarketEquipmentFilter = 'all' | EquipSlot;
/** 功法书子分类筛选项。 */
type MarketTechniqueFilter = 'all' | TechniqueCategory;
/** 交易弹窗的方向。 */
type MarketTradeDialogKind = 'buy' | 'sell';
/** 交易弹窗里调价按钮的动作类型。 */
type MarketPriceAction = 'decrease' | 'increase' | 'double' | 'half' | 'preset';

/** 交易弹窗当前的可编辑状态。 */
interface MarketTradeDialogState {
  kind: MarketTradeDialogKind;
  quantity: number;
  unitPrice: number;
}

/** 强化预估结果在界面里的展示结构。 */
interface MarketEnhancementEstimateView {
  strategy: EnhancementExpectedCostStrategy;
  costLine: string;
  attemptsLine: string;
  timeLine: string;
  baseUnitPrice?: number;
  usesMarketBasePrice: boolean;
  basePricePending: boolean;
}

/** 桌面端市场列表的默认分页大小。 */
const MARKET_DESKTOP_PAGE_SIZE = 32;
/** 移动端市场列表的默认分页大小。 */
const MARKET_MOBILE_PAGE_SIZE = 12;
/** 桌面端紧凑布局下的分页大小。 */
const MARKET_DESKTOP_COMPACT_PAGE_SIZE = 28;
/** 移动端紧凑布局下的分页大小。 */
const MARKET_MOBILE_COMPACT_PAGE_SIZE = 10;
/** 交易弹窗允许输入的最低单价。 */
const MARKET_DIALOG_MIN_PRICE = MARKET_PRICE_PRESET_VALUES[0];
/** 交易弹窗允许输入的最高单价。 */
const MARKET_DIALOG_MAX_PRICE = MARKET_MAX_UNIT_PRICE;
/** 交易弹窗允许输入的最大数量。 */
const MARKET_DIALOG_MAX_QUANTITY = 999_900_000_000;
/** 功法书筛选按钮的静态配置。 */
const MARKET_TECHNIQUE_FILTERS: Array<{ id: MarketTechniqueFilter; label: string }> = [
  { id: 'all', label: '全部功法' },
  { id: 'arts', label: getTechniqueCategoryLabel('arts') },
  { id: 'internal', label: getTechniqueCategoryLabel('internal') },
  { id: 'divine', label: getTechniqueCategoryLabel('divine') },
  { id: 'secret', label: getTechniqueCategoryLabel('secret') },
];
/** 强化任务的基础耗时。 */
const ENHANCEMENT_BASE_JOB_TICKS = 5;
/** 物品等级每升一级额外增加的强化耗时。 */
const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;

/** 市场面板实现，负责列表浏览、物品书籍、交易弹窗和强化预估。 */
export class MarketPanel {
  /** 市场详情弹窗的归属标识。 */
  private static readonly MODAL_OWNER = 'market-panel';
  /** 交易弹窗根节点的 id。 */
  private static readonly TRADE_MODAL_ID = 'market-trade-modal-root';
  /** 面板根节点，只负责首屏摘要和打开入口。 */
  private readonly pane = document.getElementById('pane-market')!;
  /** 市场面板对外回调，实际请求都交给外部处理。 */
  private callbacks: MarketPanelCallbacks | null = null;
  /** 当前市场主快照，列表、挂单和托管仓都从这里读。 */
  private marketUpdate: NEXT_S2C_MarketUpdate | null = null;
  /** 当前选中物品对应的书籍详情。 */
  private itemBook: MarketOrderBookView | null = null;
  /** 最近一次列表分页数据，供筛选和翻页回填。 */
  private marketListings: NEXT_S2C_MarketListings | null = null;
  /** 物品书籍本地缓存，避免重复请求同一份详情。 */
  private readonly itemBookCache = new Map<string, MarketOrderBookView>();
  /** 正在等待服务端回包的物品书籍 key。 */
  private readonly pendingItemBookKeys = new Set<string>();
  /** 当前在市场列表里选中的物品 key。 */
  private selectedItemKey: string | null = null;
  /** 弹窗当前标签页。 */
  private modalTab: MarketModalTab = 'market';
  /** 当前市场主分类筛选。 */
  private activeCategory: MarketCategoryFilter = 'all';
  /** 当前装备子分类筛选。 */
  private activeEquipmentCategory: MarketEquipmentFilter = 'all';
  /** 当前功法子分类筛选。 */
  private activeTechniqueCategory: MarketTechniqueFilter = 'all';
  /** 当前列表页码。 */
  private currentPage = 1;
  /** 交易历史页码。 */
  private tradeHistoryPage = 1;
  /** 物品书籍是否正在加载。 */
  private itemBookLoading = false;
  /** 交易历史是否正在加载。 */
  private tradeHistoryLoading = false;
  /** 当前交易弹窗状态。 */
  private tradeDialog: MarketTradeDialogState | null = null;
  /** 当前交易历史快照。 */
  private tradeHistory: NEXT_S2C_MarketTradeHistory | null = null;
  /** 当前玩家背包快照，用于判断能否挂售和买入。 */
  private inventory: Inventory = { items: [], capacity: 0 };
  /** 市场物品提示浮层，列表和详情共用。 */
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  /** 当前正在显示提示的节点。 */
  private tooltipNode: HTMLElement | null = null;

  constructor() {
    this.bindPaneEvents();
    this.renderPane();
  }

  /** 注册市场面板回调。 */
  setCallbacks(callbacks: MarketPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 从玩家快照初始化背包和首屏。 */
  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.renderPane();
  }

  /** 同步背包快照，并刷新依赖弹窗。 */
  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.syncVisibleMarketInventoryState();
      this.syncTradeDialogOverlay();
    }
  }

  /** 更新市场主视图。 */
  updateMarket(data: NEXT_S2C_MarketUpdate): void {
    this.marketUpdate = data;
    if (!this.selectedItemKey && data.listedItems.length > 0) {
      this.selectedItemKey = data.listedItems[0].itemKey;
    }
    if (this.selectedItemKey && !data.listedItems.some((item) => item.itemKey === this.selectedItemKey)) {
      this.selectedItemKey = data.listedItems[0]?.itemKey ?? null;
      this.itemBook = null;
      this.tradeDialog = null;
    }
    this.currentPage = this.clampPage(this.currentPage, this.getVisibleListedItems(data).length);
    this.syncPageSelection();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      if (this.modalTab === 'market' && this.selectedItemKey) {
        this.requestItemBook(this.selectedItemKey);
      }
      this.renderModal();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  /** 更新列表分页数据。 */
  updateListings(data: NEXT_S2C_MarketListings): void {
    this.marketListings = data;
    this.currentPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    this.activeCategory = data.category;
    this.activeEquipmentCategory = data.category === 'equipment' ? data.equipmentSlot : 'all';
    this.activeTechniqueCategory = data.category === 'skill_book' ? data.techniqueCategory : 'all';
    this.marketUpdate = this.mergeListingsIntoMarketUpdate(this.marketUpdate, data);
    this.syncPageSelection();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  /** 更新我的订单数据。 */
  updateOrders(data: NEXT_S2C_MarketOrders): void {
    if (!this.marketUpdate) {
      return;
    }
    this.marketUpdate = {
      ...this.marketUpdate,
      currencyItemId: data.currencyItemId,
      currencyItemName: data.currencyItemName,
      myOrders: data.orders.map((order) => ({
        id: order.id,
        side: order.side,
        status: order.status,
        itemKey: order.itemKey,
        item: { ...order.item },
        remainingQuantity: order.remainingQuantity,
        unitPrice: order.unitPrice,
        createdAt: order.createdAt,
      })),
    };
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  /** 同步坊市托管仓快照。 */
  updateStorage(data: NEXT_S2C_MarketStorage): void {
    if (!this.marketUpdate) {
      return;
    }
    this.marketUpdate = {
      ...this.marketUpdate,
      storage: {
        items: data.items.map((entry) => ({ ...entry.item })),
      },
    };
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  /** 同步物品书籍缓存，并尽量只刷新当前选中的详情。 */
  updateItemBook(data: NEXT_S2C_MarketItemBook): void {
    if (data.book) {
      this.itemBookCache.set(data.itemKey, data.book);
    } else {
      this.itemBookCache.delete(data.itemKey);
    }
    this.pendingItemBookKeys.delete(data.itemKey);
    if (data.itemKey !== this.selectedItemKey) {
      return;
    }
    this.itemBookLoading = false;
    this.itemBook = data.book;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      if (this.modalTab === 'market') {
        this.patchSelectedBookPanel();
      }
    } else {
      this.syncTradeDialogOverlay();
    }
    this.syncTradeDialogOverlay();
  }

  /** 同步交易历史分页。 */
  updateTradeHistory(data: NEXT_S2C_MarketTradeHistory): void {
    this.tradeHistoryLoading = false;
    this.tradeHistory = data;
    this.tradeHistoryPage = data.page;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  /** 清空市场面板状态、缓存和临时弹窗。 */
  clear(): void {
    this.marketUpdate = null;
    this.itemBook = null;
    this.marketListings = null;
    this.selectedItemKey = null;
    this.modalTab = 'market';
    this.activeCategory = 'all';
    this.activeEquipmentCategory = 'all';
    this.activeTechniqueCategory = 'all';
    this.currentPage = 1;
    this.tradeHistoryPage = 1;
    this.itemBookLoading = false;
    this.tradeHistoryLoading = false;
    this.tradeDialog = null;
    this.tradeHistory = null;
    this.inventory = { items: [], capacity: 0 };
    this.tooltipNode = null;
    this.tooltip.hide(true);
    this.syncTradeDialogOverlay();
    this.renderPane();
    detailModalHost.close(MarketPanel.MODAL_OWNER);
  }

  /** 渲染面板首屏摘要，只保留打开坊市的入口。 */
  private renderPane(): void {
    const listedCount = this.marketUpdate?.listedItems.length ?? 0;
    const orderCount = this.marketUpdate?.myOrders.length ?? 0;
    const storageCount = this.marketUpdate?.storage.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = `
        <div class="panel-section market-pane ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">坊市</div>
          <div class="market-pane-copy ui-form-copy">${escapeHtml(MARKET_PANE_HINT)}</div>
          <div class="market-pane-stats">
            <div class="market-pane-stat"><strong>${formatDisplayInteger(listedCount)}</strong><span>可见盘面</span></div>
            <div class="market-pane-stat"><strong>${formatDisplayInteger(orderCount)}</strong><span>我的挂单</span></div>
            <div class="market-pane-stat"><strong>${formatDisplayInteger(storageCount)}</strong><span>托管物品</span></div>
          </div>
          <button class="small-btn" data-market-open type="button">打开坊市</button>
        </div>
      `;
    });
  }

  /** 只给首屏入口绑事件，避免重复监听整个面板。 */
  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-market-open]')) {
        this.callbacks?.onRequestMarket();
        this.openModal();
      }
    });
  }

  /** 打开市场详情弹层，并按当前标签请求需要的数据。 */
  private openModal(): void {
    if (!this.selectedItemKey && this.marketUpdate?.listedItems.length) {
      this.selectedItemKey = this.marketUpdate.listedItems[0].itemKey;
    }
    this.syncPageSelection();
    this.requestListings(this.currentPage);
    if (this.modalTab === 'market' && this.selectedItemKey) {
      this.requestItemBook(this.selectedItemKey);
    }
    if (this.modalTab === 'trade-history') {
      this.requestTradeHistory(this.tradeHistoryPage);
    }
    this.renderModal();
  }

  /** 渲染市场详情弹层。 */
  private renderModal(): void {
    const marketUpdate = this.marketUpdate;
    detailModalHost.open({
      ownerId: MarketPanel.MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market',
      title: '坊市',
      subtitle: '匿名挂售、求购与自动撮合',
      bodyHtml: marketUpdate
        ? this.renderModalBody(marketUpdate)
        : '<div class="empty-hint">坊市盘面同步中……</div>',
      onClose: () => {
        this.itemBookLoading = false;
        this.tooltipNode = null;
        this.tooltip.hide(true);
      },
      onAfterRender: (body) => {
        body.querySelectorAll<HTMLElement>('[data-market-modal-tab]').forEach((button) => button.addEventListener('click', () => {
          const tab = button.dataset.marketModalTab as MarketModalTab | undefined;
          if (!tab || tab === this.modalTab) {
            return;
          }
          this.modalTab = tab;
          this.tradeDialog = null;
          if (tab === 'trade-history') {
            this.requestTradeHistory(this.tradeHistoryPage);
          } else if (tab === 'market' && this.selectedItemKey) {
            this.requestItemBook(this.selectedItemKey);
          }
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-category]').forEach((button) => button.addEventListener('click', () => {
          const category = button.dataset.marketCategory as MarketCategoryFilter | undefined;
          if (!category || category === this.activeCategory) {
            return;
          }
          this.activeCategory = category;
          if (category !== 'equipment') {
            this.activeEquipmentCategory = 'all';
          }
          if (category !== 'skill_book') {
            this.activeTechniqueCategory = 'all';
          }
          this.currentPage = 1;
          this.tradeDialog = null;
          this.syncPageSelection();
          this.requestListings(this.currentPage);
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-equipment-category]').forEach((button) => button.addEventListener('click', () => {
          const category = button.dataset.marketEquipmentCategory as MarketEquipmentFilter | undefined;
          if (!category || category === this.activeEquipmentCategory) {
            return;
          }
          this.activeEquipmentCategory = category;
          this.currentPage = 1;
          this.tradeDialog = null;
          this.syncPageSelection();
          this.requestListings(this.currentPage);
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-technique-category]').forEach((button) => button.addEventListener('click', () => {
          const category = button.dataset.marketTechniqueCategory as MarketTechniqueFilter | undefined;
          if (!category || category === this.activeTechniqueCategory) {
            return;
          }
          this.activeTechniqueCategory = category;
          this.currentPage = 1;
          this.tradeDialog = null;
          this.syncPageSelection();
          this.requestListings(this.currentPage);
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-page]').forEach((button) => button.addEventListener('click', () => {
          const nextPage = Number.parseInt(button.dataset.marketPage ?? '1', 10);
          if (!Number.isFinite(nextPage) || nextPage === this.currentPage) {
            return;
          }
          this.currentPage = this.clampPage(nextPage, this.getVisibleListedItems(this.marketUpdate).length);
          this.tradeDialog = null;
          this.syncPageSelection();
          this.requestListings(this.currentPage);
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-history-page]').forEach((button) => button.addEventListener('click', () => {
          const nextPage = Number.parseInt(button.dataset.marketHistoryPage ?? '1', 10);
          if (!Number.isFinite(nextPage) || nextPage === this.tradeHistoryPage) {
            return;
          }
          this.requestTradeHistory(nextPage);
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-select-item]').forEach((button) => button.addEventListener('click', () => {
          const itemKey = button.dataset.marketSelectItem;
          if (!itemKey) {
            return;
          }
          this.selectedItemKey = itemKey;
          this.itemBook = null;
          this.tradeDialog = null;
          this.requestItemBook(itemKey);
          this.renderModal();
        }));

        this.bindBookPanelActionEvents(body);

        body.querySelectorAll<HTMLElement>('[data-market-cancel-order]').forEach((button) => button.addEventListener('click', () => {
          const orderId = button.dataset.marketCancelOrder;
          if (!orderId) {
            return;
          }
          this.callbacks?.onCancelOrder(orderId);
        }));

        body.querySelector<HTMLElement>('[data-market-claim-storage]')?.addEventListener('click', () => {
          this.callbacks?.onClaimStorage();
        });

        this.bindItemTooltipEvents(body);
        this.syncTradeDialogOverlay();
      },
    });
  }

  /** 渲染市场弹层主体和右侧分栏。 */
  private renderModalBody(update: NEXT_S2C_MarketUpdate): string {
    const tabs = MARKET_MODAL_TABS
      .map((tab) => `<button class="market-side-tab ui-workspace-rail-tab ${this.modalTab === tab.id ? 'active' : ''}" data-market-modal-tab="${tab.id}" type="button">${tab.label}</button>`)
      .join('');
    return `
      <div class="market-modal-shell market-modal-shell--wide ui-workspace-shell">
        <aside class="market-side-tabs ui-workspace-rail">
          <div class="market-side-tabs-title ui-workspace-rail-title">坊市分栏</div>
          <div class="ui-workspace-rail-tabs">${tabs}</div>
        </aside>
        <div class="market-modal-content market-modal-content--wide">
          ${this.modalTab === 'market'
            ? this.renderMarketTab(update)
            : this.modalTab === 'my-orders'
              ? this.renderMyOrdersTab(update)
              : this.renderTradeHistoryTab(update.currencyItemName)}
        </div>
      </div>
    `;
  }

  /** 渲染市场列表页和右侧书籍面板。 */
  private renderMarketTab(update: NEXT_S2C_MarketUpdate): string {
    const listedItems = this.getVisibleListedItems(update);
    if (listedItems.length === 0) {
      return '<div class="empty-hint">当前分类下暂时没有物品。</div>';
    }
    const pagination = this.getPaginationState(listedItems);
    const selectedItem = pagination.items.find((item) => item.itemKey === this.selectedItemKey) ?? pagination.items[0];
    const cards = pagination.items.map((entry) => this.renderListedItem(entry, selectedItem.itemKey)).join('');
    const orderBook = this.itemBook && this.itemBook.itemKey === selectedItem.itemKey ? this.itemBook : null;
    const categoryTabs = this.renderCategoryTabs(update);
    const subcategoryTabs = this.activeCategory === 'equipment'
      ? this.renderEquipmentTabs(update)
      : this.activeCategory === 'skill_book'
        ? this.renderTechniqueTabs(update)
        : '';
    const compactList = this.hasCompactCategoryLayout();
    return `
      <div class="market-market-tab">
        <div class="market-category-tabs">${categoryTabs}</div>
        ${subcategoryTabs ? `<div class="market-category-tabs market-category-tabs--sub">${subcategoryTabs}</div>` : ''}
        <div class="market-board">
          <div class="market-board-list-wrap ui-surface-pane ui-surface-pane--stack">
            ${this.renderListToolbar(pagination.page, pagination.totalPages, listedItems.length)}
            <div class="market-board-list ${compactList ? 'market-board-list--compact' : ''}">${cards}</div>
          </div>
          <div class="market-book-panel ui-surface-pane ui-surface-pane--stack">
            ${this.renderBookPanel(selectedItem, orderBook, update.currencyItemName)}
          </div>
        </div>
      </div>
    `;
  }

  /** 渲染一张市场列表卡片。 */
  private renderListedItem(entry: MarketListedItemView, activeItemKey: string): string {
    const ownedCount = this.findMatchingInventoryCount(entry.item);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    return `
      <button class="market-item-cell ui-surface-card ui-surface-card--compact ${entry.itemKey === activeItemKey ? 'active' : ''}" data-market-select-item="${escapeHtmlAttr(entry.itemKey)}" data-market-item-tooltip="${escapeHtmlAttr(entry.itemKey)}" type="button">
        <div class="market-item-cell-name" title="${escapeHtmlAttr(entry.item.name)}">
          <span class="market-item-cell-name-text">${escapeHtml(entry.item.name)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${entry.lowestSellPrice !== undefined ? this.formatMarketUnitPrice(entry.lowestSellPrice) : '--'}</span>
          <span>买 ${entry.highestBuyPrice !== undefined ? this.formatMarketUnitPrice(entry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  /** 渲染选中物品的卖盘、买盘和快捷操作。 */
  private renderBookPanel(entry: MarketListedItemView, book: MarketOrderBookView | null, currencyName: string): string {
    const matchedInventoryCount = this.findMatchingInventoryCount(entry.item);
    const sellConflict = this.findConflictingOwnOrder(entry.itemKey, 'sell');
    const buyConflict = this.findConflictingOwnOrder(entry.itemKey, 'buy');
    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title market-item-title--interactive" data-market-item-tooltip="selected">${escapeHtml(entry.item.name)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(entry.item.type))} · ${escapeHtml(entry.item.desc)}</div>
        </div>
      </div>
      <div class="market-book-columns">
        <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted ui-scroll-panel">
          <div class="market-book-column-head">
            <div class="market-book-column-title">挂售</div>
            <button class="small-btn ghost" data-market-open-dialog="sell" type="button" ${(matchedInventoryCount > 0 && !sellConflict) ? '' : 'disabled'}>挂售</button>
          </div>
          ${sellConflict ? '<div class="market-action-hint">你已在求购这件物品，不能再挂售。</div>' : ''}
          ${book
            ? this.renderPriceLevels(book.sells, currencyName, '当前还没有卖盘。', {
              kind: 'buy',
              label: '购买',
              disabled: Boolean(buyConflict),
            })
            : this.renderBookLoading(this.itemBookLoading ? '卖盘同步中……' : '当前盘面已更新，请重新选择物品。')}
        </div>
        <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted ui-scroll-panel">
          <div class="market-book-column-head">
            <div class="market-book-column-title">求购</div>
            <button class="small-btn ghost" data-market-open-dialog="buy" type="button" ${buyConflict ? 'disabled' : ''}>求购</button>
          </div>
          ${buyConflict ? '<div class="market-action-hint">你已在挂售这件物品，不能再求购。</div>' : ''}
          ${book ? this.renderPriceLevels(book.buys, currencyName, '当前还没有求购。', {
            kind: 'sell',
            label: '出售',
            disabled: matchedInventoryCount <= 0 || Boolean(sellConflict),
          }) : this.renderBookLoading(this.itemBookLoading ? '买盘同步中……' : '当前还没有求购。')}
        </div>
      </div>
    `;
  }

  /** 渲染一档买卖盘价格和快捷下单按钮。 */
  private renderPriceLevels(
    levels: MarketOrderBookView['sells'],
    currencyName: string,
    emptyText: string,
    quickAction?: {
      kind: MarketTradeDialogKind;
      label: string;
      disabled?: boolean;
    },
  ): string {
    if (levels.length === 0) {
      return `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return levels.map((level, index) => `
      <div class="market-book-level ui-surface-card ui-surface-card--compact">
        <div class="market-book-level-main">
          <span class="market-book-level-price">${this.formatMarketUnitPrice(level.unitPrice)} ${escapeHtml(currencyName)}</span>
          <span class="market-book-level-qty">总量 ${formatDisplayCountBadge(level.quantity)}</span>
        </div>
        ${quickAction && index === 0
          ? `<button
              class="small-btn ghost market-book-level-action"
              data-market-open-dialog="${quickAction.kind}"
              data-market-open-dialog-price="${level.unitPrice}"
              type="button"
              ${quickAction.disabled ? 'disabled' : ''}
            >${quickAction.label}</button>`
          : ''}
      </div>
    `).join('');
  }

  /** 物品书籍还没回来时的占位文案。 */
  private renderBookLoading(text: string): string {
    return `<div class="empty-hint">${escapeHtml(text)}</div>`;
  }

  /** 渲染我的挂单、求购单和托管仓。 */
  private renderMyOrdersTab(update: NEXT_S2C_MarketUpdate): string {
    const buyOrders = update.myOrders.filter((order) => order.side === 'buy');
    const sellOrders = update.myOrders.filter((order) => order.side === 'sell');
    const storage = update.storage;
    return `
      <div class="market-my-orders">
        <div class="market-my-orders-grid">
          <div class="market-my-orders-column ui-surface-pane ui-surface-pane--stack">
            <div class="panel-section-title">我的求购</div>
            ${buyOrders.length > 0 ? buyOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : '<div class="empty-hint">当前没有求购挂单。</div>'}
          </div>
          <div class="market-my-orders-column ui-surface-pane ui-surface-pane--stack">
            <div class="panel-section-title">我的挂售</div>
            ${sellOrders.length > 0 ? sellOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : '<div class="empty-hint">当前没有挂售单。</div>'}
          </div>
        </div>
        <div class="market-storage-card ui-surface-pane ui-surface-pane--stack">
          <div class="market-storage-head">
            <div class="panel-section-title">坊市托管仓</div>
            <button class="small-btn" data-market-claim-storage type="button" ${storage.items.length > 0 ? '' : 'disabled'}>全部领取</button>
          </div>
          ${this.renderStorage(storage)}
        </div>
      </div>
    `;
  }

  /** 渲染交易历史分页。 */
  private renderTradeHistoryTab(currencyName: string): string {
    const history = this.tradeHistory;
    if (this.tradeHistoryLoading && !history) {
      return '<div class="empty-hint">交易记录同步中……</div>';
    }
    const records = history?.records ?? [];
    const page = history?.page ?? this.tradeHistoryPage;
    const pageSize = history?.pageSize ?? 10;
    const totalVisible = history?.totalVisible ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalVisible / Math.max(1, pageSize)));
    return `
      <div class="market-trade-history">
        <div class="market-list-toolbar ui-action-row">
          <div class="market-list-toolbar-meta">仅显示最近 ${formatDisplayInteger(Math.min(100, totalVisible))} 条中的第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页</div>
          <div class="market-list-toolbar-actions">
            <button class="small-btn ghost" data-market-history-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <button class="small-btn ghost" data-market-history-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
          </div>
        </div>
        <div class="market-trade-history-hint">只显示你自己的成交记录，不显示交易双方。</div>
        <div class="market-trade-history-list ui-surface-pane ui-surface-pane--stack ui-scroll-panel">
          ${records.length > 0
            ? records.map((record) => `
              <div class="market-trade-history-item ui-surface-card ui-surface-card--compact">
                <div class="market-trade-history-head">
                  <span class="market-order-name">${escapeHtml(record.itemName)}</span>
                  <span class="market-order-side ${record.side === 'buy' ? 'buy' : 'sell'}">${record.side === 'buy' ? '购入' : '售出'}</span>
                </div>
                <div class="market-order-meta">数量 ${formatDisplayCountBadge(record.quantity)} · 单价 ${this.formatMarketUnitPrice(record.unitPrice)} ${escapeHtml(currencyName)}</div>
              </div>
            `).join('')
            : `<div class="empty-hint">${this.tradeHistoryLoading ? '交易记录同步中……' : '最近还没有你的成交记录。'}</div>`}
        </div>
      </div>
    `;
  }

  /** 渲染一条我的挂单卡片。 */
  private renderOwnOrder(order: MarketOwnOrderView, currencyName: string): string {
    return `
      <div class="market-order-card ui-surface-card ui-surface-card--compact">
        <div class="market-order-card-head">
          <span class="market-order-name">${escapeHtml(order.item.name)}</span>
          <span class="market-order-side ${order.side === 'buy' ? 'buy' : 'sell'}">${order.side === 'buy' ? '求购' : '挂售'}</span>
        </div>
        <div class="market-order-meta">剩余 ${formatDisplayCountBadge(order.remainingQuantity)} · 单价 ${this.formatMarketUnitPrice(order.unitPrice)} ${escapeHtml(currencyName)}</div>
        <button class="small-btn ghost" data-market-cancel-order="${order.id}" type="button">取消订单</button>
      </div>
    `;
  }

  /** 渲染坊市托管仓列表。 */
  private renderStorage(storage: MarketStorage): string {
    if (storage.items.length === 0) {
      return '<div class="empty-hint">托管仓空空如也。</div>';
    }
    return `
      <div class="market-storage-list">
        ${storage.items.map((item) => `
          <div class="market-storage-item ui-surface-card ui-surface-card--compact">
            <span>${escapeHtml(item.name)}</span>
            <span>${formatDisplayCountBadge(item.count)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  /** 渲染列表翻页工具条。 */
  private renderListToolbar(page: number, totalPages: number, totalItems: number): string {
    return `
      <div class="market-list-toolbar ui-action-row">
        <div class="market-list-toolbar-meta">共 ${formatDisplayInteger(totalItems)} 件，第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页</div>
        <div class="market-list-toolbar-actions">
        <button class="small-btn ghost" data-market-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
        <button class="small-btn ghost" data-market-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      </div>
    `;
  }

  /** 渲染交易弹窗，只保存临时输入状态。 */
  private renderTradeDialog(entry: MarketListedItemView, currencyItemId: string, currencyName: string): string {
    if (!this.tradeDialog) {
      return '';
    }
    const dialog = this.tradeDialog;
    const matchedInventoryCount = this.findMatchingInventoryCount(entry.item);
    const matchedSlotIndex = this.findMatchingInventorySlot(entry.item);
    const isBuy = dialog.kind === 'buy';
    const conflictOrder = this.findConflictingOwnOrder(entry.itemKey, dialog.kind);
    const ownedCurrency = this.findInventoryItemCountByItemId(currencyItemId);
    const quantityStep = this.getTradeDialogQuantityStep(dialog.unitPrice);
    const quantityMax = this.getTradeDialogQuantityMax(entry, dialog.kind, dialog.unitPrice);
    const totalCost = this.getMarketTradeTotalCost(dialog.quantity, dialog.unitPrice);
    const insufficientCurrency = isBuy && totalCost !== null && totalCost > ownedCurrency;
    const insufficientStepQuantity = quantityMax <= 0;
    const title = isBuy ? '发起求购' : '发起挂售';
    const actionLabel = isBuy ? '确认求购' : '确认挂售';
    const disabled = Boolean(conflictOrder)
      || ((!isBuy && (matchedSlotIndex === null || matchedInventoryCount <= 0)) || insufficientCurrency || insufficientStepQuantity || totalCost === null);
    return `
      <div class="market-trade-modal-shell">
        <div class="market-trade-modal-backdrop" data-market-close-dialog></div>
        <div class="market-trade-dialog market-trade-dialog--${dialog.kind} ui-surface-pane ui-surface-pane--stack" role="dialog" aria-modal="true">
        <div class="market-trade-dialog-head">
          <div class="market-trade-dialog-title ui-title-block">
            <div class="panel-section-title">${title}</div>
            <div class="market-trade-dialog-item market-trade-dialog-item--interactive ui-title-block-subtitle" data-market-item-tooltip="selected">${escapeHtml(entry.item.name)}</div>
          </div>
          <button class="small-btn ghost" data-market-close-dialog type="button">关闭</button>
        </div>
        <div class="market-trade-dialog-body">
          <div class="market-trade-dialog-section">
            <div class="market-trade-dialog-section-label">快捷定价</div>
            <div class="market-price-preset-row">
              ${MARKET_PRICE_PRESET_VALUES.map((preset) => `
                <button
                  class="small-btn ghost ${preset === dialog.unitPrice ? 'active' : ''}"
                  data-market-price-action="preset"
                  data-market-price-preset="${preset}"
                  type="button"
                >${escapeHtml(this.formatPricePresetLabel(preset))}</button>
              `).join('')}
            </div>
          </div>
          <div class="market-trade-dialog-section">
            <div class="market-trade-dialog-field">
              <span>单价</span>
              <div class="market-price-control-row">
                <div class="market-price-control-side">
                  <button class="small-btn ghost" data-market-price-action="half" type="button">÷2</button>
                  <button class="small-btn ghost" data-market-price-action="decrease" type="button">-</button>
                </div>
                <div class="market-price-display">
                  <strong>${this.formatMarketUnitPrice(dialog.unitPrice)}</strong>
                  <span>${escapeHtml(currencyName)}</span>
                </div>
                <div class="market-price-control-side">
                  <button class="small-btn ghost" data-market-price-action="increase" type="button">+</button>
                  <button class="small-btn ghost" data-market-price-action="double" type="button">x2</button>
                </div>
              </div>
            </div>
          </div>
          <div class="market-trade-dialog-section">
            <div class="market-trade-dialog-field">
              <span>数量</span>
              <div class="market-quantity-row">
                <button class="small-btn ghost" data-market-quantity-action="one" type="button">1</button>
                <input
                  class="gm-inline-input"
                  data-market-dialog-quantity
                  type="number"
                  inputmode="numeric"
                  min="${quantityStep}"
                  step="${quantityStep}"
                  max="${Math.max(quantityStep, quantityMax > 0 ? quantityMax : quantityStep)}"
                  value="${dialog.quantity}"
                />
                <button
                  class="small-btn ghost"
                  data-market-quantity-action="max"
                  type="button"
                  ${this.getTradeDialogMaxButtonQuantity(entry, currencyItemId, dialog) <= 0 ? 'disabled' : ''}
                >最大</button>
              </div>
            </div>
            <div class="market-trade-dialog-total ${insufficientCurrency ? 'error' : ''}">
              <span>${isBuy ? '总价' : '总额'}</span>
              <strong>${totalCost === null ? '--' : `${formatDisplayInteger(totalCost)} ${escapeHtml(currencyName)}`}</strong>
            </div>
          </div>
          ${quantityStep > 1
            ? `<div class="market-action-hint">当前单价下必须按 ${formatDisplayInteger(quantityStep)} 件的倍数交易，${escapeHtml(currencyName)} x1 可买 ${formatDisplayInteger(quantityStep)} 件。</div>`
            : ''}
          ${conflictOrder
            ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(dialog.kind === 'buy' ? '你已在挂售这件物品，不能再求购。' : '你已在求购这件物品，不能再挂售。')}</div>`
            : ''}
          ${insufficientStepQuantity
            ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(isBuy ? `当前 ${currencyName} 或数量上限不足以按该单价成交至少 ${quantityStep} 件。` : `当前持有数量不足 ${quantityStep} 件，不能按该单价挂售。`)}</div>`
            : ''}
          ${insufficientCurrency && totalCost !== null ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(currencyName)}不足，当前需要 ${formatDisplayInteger(totalCost)}。</div>` : ''}
        </div>
        <div class="market-trade-dialog-actions">
          <button class="small-btn ghost" data-market-close-dialog type="button">取消</button>
          <button class="small-btn" data-market-submit-dialog="${dialog.kind}" type="button" ${disabled ? 'disabled' : ''}>${actionLabel}</button>
        </div>
      </div>
      </div>
    `;
  }

  /** 给书籍面板里的快捷按钮装事件。 */
  private bindBookPanelActionEvents(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-market-open-dialog]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.marketOpenDialog as MarketTradeDialogKind | undefined;
      const selected = this.getSelectedListedItem(this.marketUpdate);
      if (!kind || !selected) {
        return;
      }
      const presetPrice = this.readDatasetNumber(button.dataset.marketOpenDialogPrice);
      this.openTradeDialog(selected, kind, presetPrice);
    }));
  }

  /** 给会显示物品提示的节点绑定悬浮逻辑。 */
  private bindItemTooltipEvents(body: HTMLElement): void {
    const nodes = body.querySelectorAll<HTMLElement>('[data-market-item-tooltip]');
    if (nodes.length === 0) {
      return;
    }
    const tapMode = prefersPinnedTooltipInteraction();
    const showTooltip = (node: HTMLElement, event: PointerEvent): void => {
      const tooltip = this.resolveMarketTooltipPayload(node);
      if (!tooltip) {
        return;
      }
      this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
        allowHtml: tooltip.allowHtml,
        asideCards: tooltip.asideCards,
      });
      this.tooltipNode = node;
    };

    nodes.forEach((node) => {
      node.addEventListener('click', (event) => {
        if (!tapMode || !(event instanceof PointerEvent)) {
          return;
        }
        const tooltip = this.resolveMarketTooltipPayload(node);
        if (!tooltip) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltipNode = null;
          this.tooltip.hide(true);
          return;
        }
        this.tooltipNode = node;
        this.tooltip.showPinned(node, tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        event.preventDefault();
        event.stopPropagation();
      });

      node.addEventListener('pointermove', (event) => {
        if (!(event instanceof PointerEvent) || (tapMode && this.tooltip.isPinned())) {
          return;
        }
        if (this.tooltipNode !== node) {
          showTooltip(node, event);
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      });

      node.addEventListener('pointerleave', () => {
        if (this.tooltip.isPinnedTo(node)) {
          return;
        }
        if (this.tooltipNode === node) {
          this.tooltipNode = null;
          this.tooltip.hide();
        }
      });
    });
  }

  /** 读取当前已打开的市场弹层 body。 */
  private getOpenModalBody(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  /** 只同步当前可见区域里的背包相关状态。 */
  private syncVisibleMarketInventoryState(): void {
    if (this.modalTab !== 'market') {
      return;
    }
    const body = this.getOpenModalBody();
    if (!body) {
      return;
    }
    body.querySelectorAll<HTMLElement>('[data-market-select-item]').forEach((button) => {
      const itemKey = button.dataset.marketSelectItem;
      const entry = itemKey
        ? this.marketUpdate?.listedItems.find((item) => item.itemKey === itemKey) ?? null
        : null;
      if (!entry) {
        return;
      }
      this.syncOwnedBadge(button, this.findMatchingInventoryCount(entry.item));
    });
    this.syncSelectedBookActionButtons(body);
  }

  /** 同步列表卡片右侧的已持有数量徽记。 */
  private syncOwnedBadge(button: HTMLElement, ownedCount: number): void {
    const nameContainer = button.querySelector<HTMLElement>('.market-item-cell-name');
    if (!nameContainer) {
      return;
    }
    let badge = nameContainer.querySelector<HTMLElement>('.market-item-cell-owned');
    if (ownedCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'market-item-cell-owned';
        nameContainer.appendChild(badge);
      }
      badge.textContent = formatDisplayCountBadge(ownedCount);
      return;
    }
    badge?.remove();
  }

  /** 同步选中物品的挂售/求购按钮可用性。 */
  private syncSelectedBookActionButtons(body: HTMLElement): void {
    const selected = this.getSelectedListedItem(this.marketUpdate);
    if (!selected) {
      return;
    }
    const matchedInventoryCount = this.findMatchingInventoryCount(selected.item);
    const sellConflict = this.findConflictingOwnOrder(selected.itemKey, 'sell');
    const buyConflict = this.findConflictingOwnOrder(selected.itemKey, 'buy');
    body.querySelectorAll<HTMLElement>('[data-market-open-dialog]').forEach((button) => {
      const kind = button.dataset.marketOpenDialog as MarketTradeDialogKind | undefined;
      if (!kind) {
        return;
      }
      const disabled = kind === 'sell'
        ? matchedInventoryCount <= 0 || Boolean(sellConflict)
        : Boolean(buyConflict);
      button.toggleAttribute('disabled', disabled);
    });
  }

  /** 只重绘右侧书籍面板，不动列表主体。 */
  private patchSelectedBookPanel(): void {
    if (this.modalTab !== 'market') {
      return;
    }
    const body = this.getOpenModalBody();
    if (!body) {
      return;
    }
    const bookPanel = body.querySelector<HTMLElement>('.market-book-panel');
    const selected = this.getSelectedListedItem(this.marketUpdate);
    const update = this.marketUpdate;
    if (!bookPanel || !selected || !update) {
      return;
    }
    const orderBook = this.itemBook && this.itemBook.itemKey === selected.itemKey ? this.itemBook : null;
    bookPanel.innerHTML = this.renderBookPanel(selected, orderBook, update.currencyItemName);
    this.bindBookPanelActionEvents(bookPanel);
    this.bindItemTooltipEvents(bookPanel);
  }

  /** 读取当前选中的列表物品。 */
  private getSelectedListedItem(update: NEXT_S2C_MarketUpdate | null): MarketListedItemView | null {
    const visibleItems = this.getVisibleListedItems(update);
    if (visibleItems.length === 0) {
      return null;
    }
    const pagination = this.getPaginationState(visibleItems);
    return pagination.items.find((item) => item.itemKey === this.selectedItemKey) ?? pagination.items[0] ?? null;
  }

  /** 渲染主分类标签。 */
  private renderCategoryTabs(update: NEXT_S2C_MarketUpdate): string {
    const categories: Array<{ id: MarketCategoryFilter; label: string; count: number }> = [
      { id: 'all', label: '全部', count: update.listedItems.length },
      ...ITEM_TYPES.map((type) => ({
        id: type,
        label: getItemTypeLabel(type),
        count: update.listedItems.filter((item) => item.item.type === type).length,
      })),
    ];
    return categories
      .map((category) => `
        <button
          class="market-category-tab ${this.activeCategory === category.id ? 'active' : ''}"
          data-market-category="${category.id}"
          type="button"
        >${escapeHtml(category.label)}<span>${formatDisplayInteger(category.count)}</span></button>
      `)
      .join('');
  }

  /** 渲染装备子分类标签。 */
  private renderEquipmentTabs(update: NEXT_S2C_MarketUpdate): string {
    const categories: Array<{ id: MarketEquipmentFilter; label: string; count: number }> = [
      {
        id: 'all',
        label: '全部装备',
        count: update.listedItems.filter((item) => item.item.type === 'equipment').length,
      },
      ...EQUIP_SLOTS.map((slot) => ({
        id: slot,
        label: getEquipSlotLabel(slot),
        count: update.listedItems.filter((item) => item.item.type === 'equipment' && item.item.equipSlot === slot).length,
      })),
    ];
    return categories
      .map((category) => `
        <button
          class="market-category-tab ${this.activeEquipmentCategory === category.id ? 'active' : ''}"
          data-market-equipment-category="${category.id}"
          type="button"
        >${escapeHtml(category.label)}<span>${formatDisplayInteger(category.count)}</span></button>
      `)
      .join('');
  }

  /** 渲染功法书子分类标签。 */
  private renderTechniqueTabs(update: NEXT_S2C_MarketUpdate): string {
    const categories = MARKET_TECHNIQUE_FILTERS.map((category) => ({
      ...category,
      count: update.listedItems.filter((item) => (
        item.item.type === 'skill_book'
        && (category.id === 'all' || this.resolveTechniqueCategoryForItem(item.item) === category.id)
      )).length,
    }));
    return categories
      .map((category) => `
        <button
          class="market-category-tab ${this.activeTechniqueCategory === category.id ? 'active' : ''}"
          data-market-technique-category="${category.id}"
          type="button"
        >${escapeHtml(category.label)}<span>${formatDisplayInteger(category.count)}</span></button>
      `)
      .join('');
  }

  /** 按当前分类筛选出可见列表物品。 */
  private getVisibleListedItems(update: NEXT_S2C_MarketUpdate | null): MarketListedItemView[] {
    if (!update) {
      return [];
    }
    let items = update.listedItems;
    if (this.activeCategory !== 'all') {
      items = items.filter((item) => item.item.type === this.activeCategory);
    }
    if (this.activeCategory === 'equipment' && this.activeEquipmentCategory !== 'all') {
      items = items.filter((item) => item.item.equipSlot === this.activeEquipmentCategory);
    }
    if (this.activeCategory === 'skill_book' && this.activeTechniqueCategory !== 'all') {
      items = items.filter((item) => this.resolveTechniqueCategoryForItem(item.item) === this.activeTechniqueCategory);
    }
    return items;
  }

  /** 计算当前列表分页状态。 */
  private getPaginationState(items: MarketListedItemView[]): {
    page: number;
    totalPages: number;
    items: MarketListedItemView[];
  } {
    const pageSize = this.getMarketPageSize();
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = this.clampPage(this.currentPage, items.length);
    this.currentPage = page;
    const start = (page - 1) * pageSize;
    return {
      page,
      totalPages,
      items: items.slice(start, start + pageSize),
    };
  }

  /** 把页码夹到合法范围内。 */
  private clampPage(page: number, totalItems: number): number {
    const totalPages = Math.max(1, Math.ceil(totalItems / this.getMarketPageSize()));
    if (!Number.isFinite(page)) {
      return 1;
    }
    return Math.max(1, Math.min(totalPages, Math.floor(page)));
  }

  /** 根据视口和布局模式选择分页大小。 */
  private getMarketPageSize(): number {
    if (typeof window === 'undefined') {
      return this.hasCompactCategoryLayout() ? MARKET_DESKTOP_COMPACT_PAGE_SIZE : MARKET_DESKTOP_PAGE_SIZE;
    }
    const mobileLayout = window.matchMedia('(max-width: 920px)').matches
      || (window.matchMedia('(max-width: 1180px)').matches
        && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches));
    if (this.hasCompactCategoryLayout()) {
      return mobileLayout ? MARKET_MOBILE_COMPACT_PAGE_SIZE : MARKET_DESKTOP_COMPACT_PAGE_SIZE;
    }
    return mobileLayout ? MARKET_MOBILE_PAGE_SIZE : MARKET_DESKTOP_PAGE_SIZE;
  }

  /** 判断当前是否该用紧凑型分类布局。 */
  private hasCompactCategoryLayout(): boolean {
    return this.activeCategory === 'equipment' || this.activeCategory === 'skill_book';
  }

  /** 把技能书物品映射到具体功法分类。 */
  private resolveTechniqueCategoryForItem(item: ItemStack): TechniqueCategory | null {
    if (item.type !== 'skill_book') {
      return null;
    }
    return getLocalTechniqueCategoryForBookItem(item.itemId);
  }

  /** 保证当前页里总有一个可见物品处于选中状态。 */
  private syncPageSelection(): void {
    const visibleItems = this.getVisibleListedItems(this.marketUpdate);
    const pagination = this.getPaginationState(visibleItems);
    const currentItems = pagination.items;
    const hasSelected = currentItems.some((item) => item.itemKey === this.selectedItemKey);
    const nextSelected = hasSelected ? this.selectedItemKey : currentItems[0]?.itemKey ?? null;
    if (nextSelected !== this.selectedItemKey) {
      this.selectedItemKey = nextSelected;
      this.itemBook = null;
      if (this.selectedItemKey && detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
        this.requestItemBook(this.selectedItemKey);
      }
    }
  }

  /** 向外部请求某个物品的书籍详情。 */
  private requestItemBook(itemKey: string): void {
    this.itemBookLoading = true;
    this.callbacks?.onRequestItemBook(itemKey);
  }

  /** 向外部请求交易历史分页。 */
  private requestTradeHistory(page: number): void {
    this.tradeHistoryLoading = true;
    this.tradeHistoryPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    this.callbacks?.onRequestTradeHistory(this.tradeHistoryPage);
  }

  /** 向外部请求当前筛选条件下的列表分页。 */
  private requestListings(page: number): void {
    this.callbacks?.onRequestListings({
      page: Math.max(1, Math.floor(Number.isFinite(page) ? page : 1)),
      pageSize: this.getMarketPageSize(),
      category: this.activeCategory,
      equipmentSlot: this.activeCategory === 'equipment' ? this.activeEquipmentCategory : 'all',
      techniqueCategory: this.activeCategory === 'skill_book' ? this.activeTechniqueCategory : 'all',
    });
  }

  /** 把列表分页回填进市场主快照。 */
  private mergeListingsIntoMarketUpdate(update: NEXT_S2C_MarketUpdate | null, data: NEXT_S2C_MarketListings): NEXT_S2C_MarketUpdate | null {
    const entries = data.items.flatMap((entry) => entry.variants.map((variant) => ({
      itemKey: variant.itemKey,
      item: { ...variant.item },
      sellOrderCount: variant.sellOrderCount,
      sellQuantity: variant.sellQuantity,
      lowestSellPrice: variant.lowestSellPrice,
      buyOrderCount: variant.buyOrderCount,
      buyQuantity: variant.buyQuantity,
      highestBuyPrice: variant.highestBuyPrice,
    })));
    if (!update) {
      return {
        currencyItemId: data.currencyItemId,
        currencyItemName: data.currencyItemName,
        listedItems: entries,
        myOrders: [],
        storage: { items: [] },
      };
    }
    const listedItemsByKey = new Map(update.listedItems.map((entry) => [entry.itemKey, entry] as const));
    for (const entry of entries) {
      listedItemsByKey.set(entry.itemKey, entry);
    }
    return {
      ...update,
      currencyItemId: data.currencyItemId,
      currencyItemName: data.currencyItemName,
      listedItems: [...listedItemsByKey.values()],
    };
  }

  /** 打开交易弹窗，并用当前盘面价格作为初始值。 */
  private openTradeDialog(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null): void {
    const unitPrice = this.getDefaultTradeDialogPrice(entry, kind, preferredPrice);
    this.tradeDialog = {
      kind,
      quantity: this.normalizeTradeDialogQuantity(1, entry, kind, unitPrice),
      unitPrice,
    };
    this.syncTradeDialogOverlay();
  }

  /** 根据当前临时态同步交易弹窗浮层。 */
  private syncTradeDialogOverlay(): void {
    const root = this.getTradeDialogOverlayRoot();
    const update = this.marketUpdate;
    const selected = this.getSelectedListedItem(update);
    if (!this.tradeDialog || this.modalTab !== 'market' || !detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER) || !update || !selected) {
      root.innerHTML = '';
      root.classList.add('hidden');
      this.tooltipNode = null;
      this.tooltip.hide(true);
      return;
    }

    root.classList.remove('hidden');
    root.innerHTML = this.renderTradeDialog(selected, update.currencyItemId, update.currencyItemName);
    this.bindTradeDialogOverlayEvents(root, selected, update);
    this.bindItemTooltipEvents(root);
  }

  /** 给交易弹窗里会变化的控件装事件，所有修改都只落在临时态上。 */
  private bindTradeDialogOverlayEvents(
    root: HTMLElement,
    selected: MarketListedItemView,
    update: NEXT_S2C_MarketUpdate,
  ): void {
    root.querySelectorAll<HTMLElement>('[data-market-close-dialog]').forEach((button) => button.addEventListener('click', () => {
      this.tradeDialog = null;
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLInputElement>('[data-market-dialog-quantity]').forEach((input) => {
      input.addEventListener('input', () => {
        if (!this.tradeDialog) {
          return;
        }
        this.tradeDialog = {
          ...this.tradeDialog,
          quantity: this.normalizeTradeDialogQuantity(input.value, selected, this.tradeDialog.kind, this.tradeDialog.unitPrice),
        };
      });

      input.addEventListener('change', () => {
        if (!this.tradeDialog) {
          return;
        }
        this.tradeDialog = {
          ...this.tradeDialog,
          quantity: this.normalizeTradeDialogQuantity(input.value, selected, this.tradeDialog.kind, this.tradeDialog.unitPrice),
        };
        this.syncTradeDialogOverlay();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-market-price-action]').forEach((button) => button.addEventListener('click', () => {
      if (!this.tradeDialog) {
        return;
      }
      const action = button.dataset.marketPriceAction as MarketPriceAction | undefined;
      if (!action) {
        return;
      }
      const preset = this.readDatasetNumber(button.dataset.marketPricePreset);
      const nextUnitPrice = this.getNextTradeDialogPrice(this.tradeDialog.unitPrice, action, preset);
      this.tradeDialog = {
        ...this.tradeDialog,
        unitPrice: nextUnitPrice,
        quantity: this.normalizeTradeDialogQuantity(this.tradeDialog.quantity, selected, this.tradeDialog.kind, nextUnitPrice),
      };
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLElement>('[data-market-quantity-action]').forEach((button) => button.addEventListener('click', () => {
      if (!this.tradeDialog) {
        return;
      }
      const action = button.dataset.marketQuantityAction;
      const quantity = action === 'max'
        ? this.getTradeDialogMaxButtonQuantity(selected, update.currencyItemId, this.tradeDialog)
        : this.getTradeDialogQuantityStep(this.tradeDialog.unitPrice);
      this.tradeDialog = {
        ...this.tradeDialog,
        quantity: this.normalizeTradeDialogQuantity(quantity, selected, this.tradeDialog.kind, this.tradeDialog.unitPrice),
      };
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLElement>('[data-market-submit-dialog]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.marketSubmitDialog as MarketTradeDialogKind | undefined;
      if (!kind || !this.tradeDialog || this.tradeDialog.kind !== kind) {
        return;
      }
      const quantity = this.normalizeTradeDialogQuantity(this.tradeDialog.quantity, selected, kind, this.tradeDialog.unitPrice);
      const unitPrice = this.normalizeTradeDialogPrice(this.tradeDialog.unitPrice, kind === 'buy' ? 'up' : 'down');
      if (kind === 'buy') {
        this.callbacks?.onCreateBuyOrder(selected.itemKey, quantity, unitPrice);
        this.tradeDialog = null;
        this.syncTradeDialogOverlay();
        return;
      }
      const slotIndex = this.findMatchingInventorySlot(selected.item);
      if (slotIndex === null) {
        return;
      }
      this.callbacks?.onCreateSellOrder(slotIndex, quantity, unitPrice);
      this.tradeDialog = null;
      this.syncTradeDialogOverlay();
    }));
  }

  /** 读取交易弹窗的挂载根节点，没有就现建一个。 */
  private getTradeDialogOverlayRoot(): HTMLElement {
    let root = document.getElementById(MarketPanel.TRADE_MODAL_ID);
    if (root) {
      return root;
    }
    root = document.createElement('div');
    root.id = MarketPanel.TRADE_MODAL_ID;
    root.className = 'market-trade-modal-layer hidden';
    (getViewportRoot(document) ?? document.body).appendChild(root);
    return root;
  }

  /** 查找与当前交易方向冲突的自有挂单。 */
  private findConflictingOwnOrder(itemKey: string, nextSide: MarketTradeDialogKind): MarketOwnOrderView | null {
    const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
    return this.marketUpdate?.myOrders.find((order) =>
      order.itemKey === itemKey
      && order.side === oppositeSide
      && order.remainingQuantity > 0
      && order.status === 'open') ?? null;
  }

  /** 读取交易弹窗的默认单价，优先沿用当前盘面价格。 */
  private getDefaultTradeDialogPrice(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null): number {
    const fallback = kind === 'buy'
      ? (entry.lowestSellPrice ?? entry.highestBuyPrice ?? MARKET_DIALOG_MIN_PRICE)
      : (entry.highestBuyPrice ?? entry.lowestSellPrice ?? MARKET_DIALOG_MIN_PRICE);
    const source = preferredPrice && preferredPrice > 0 ? preferredPrice : fallback;
    return this.normalizeTradeDialogPrice(source, kind === 'buy' ? 'up' : 'down');
  }

  /** 规范化交易弹窗里的数量输入，强制对齐最小交易步长。 */
  private normalizeTradeDialogQuantity(
    value: string | number,
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    unitPrice = this.tradeDialog?.unitPrice ?? MARKET_DIALOG_MIN_PRICE,
  ): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    const quantityStep = this.getTradeDialogQuantityStep(unitPrice);
    const max = this.getTradeDialogQuantityMax(entry, kind, unitPrice);
    if (max <= 0) {
      return quantityStep;
    }
    if (!Number.isFinite(parsed)) {
      return quantityStep;
    }
    const bounded = Math.max(quantityStep, Math.min(max, Math.floor(parsed)));
    return Math.max(quantityStep, Math.floor(bounded / quantityStep) * quantityStep);
  }

  /** 根据单价计算这笔交易的最小数量步长。 */
  private getTradeDialogQuantityStep(unitPrice: number): number {
    return Math.max(1, getMarketMinimumTradeQuantity(unitPrice));
  }

  /** 计算当前单价下允许输入的最大数量。 */
  private getTradeDialogQuantityMax(
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    unitPrice: number,
  ): number {
    const quantityStep = this.getTradeDialogQuantityStep(unitPrice);
    const cap = kind === 'sell'
      ? this.findMatchingInventoryCount(entry.item)
      : this.getAffordableBuyQuantity(unitPrice, this.marketUpdate?.currencyItemId ?? '');
    if (cap <= 0) {
      return 0;
    }
    return Math.floor(Math.min(cap, MARKET_DIALOG_MAX_QUANTITY) / quantityStep) * quantityStep;
  }

  /** 给“最大”按钮计算对应的可交易数量。 */
  private getTradeDialogMaxButtonQuantity(
    entry: MarketListedItemView,
    currencyItemId: string,
    dialog: MarketTradeDialogState,
  ): number {
    if (dialog.kind === 'sell') {
      return this.getTradeDialogQuantityMax(entry, dialog.kind, dialog.unitPrice);
    }
    return this.getAffordableBuyQuantity(dialog.unitPrice, currencyItemId);
  }

  /** 计算当前持币量在该单价下最多能买多少。 */
  private getAffordableBuyQuantity(unitPrice: number, currencyItemId: string): number {
    if (unitPrice <= 0) {
      return 0;
    }
    const ownedCurrency = this.findInventoryItemCountByItemId(currencyItemId);
    const quantityStep = this.getTradeDialogQuantityStep(unitPrice);
    const stepCost = this.getMarketTradeTotalCost(quantityStep, unitPrice);
    if (!stepCost || stepCost <= 0) {
      return 0;
    }
    const affordableSteps = Math.floor(ownedCurrency / stepCost);
    return Math.min(MARKET_DIALOG_MAX_QUANTITY, affordableSteps * quantityStep);
  }

  /** 按按钮动作算出下一个单价，并保持在合法范围内。 */
  private getNextTradeDialogPrice(currentPrice: number, action: MarketPriceAction, preset?: number | null): number {
    if (action === 'preset') {
      return this.normalizeTradeDialogPrice(preset ?? MARKET_DIALOG_MIN_PRICE, 'up');
    }
    if (action === 'double') {
      return this.normalizeTradeDialogPrice(currentPrice * 2, 'up');
    }
    if (action === 'half') {
      return this.normalizeTradeDialogPrice(currentPrice / 2, 'down');
    }
    if (action === 'increase') {
      const step = currentPrice < 1
        ? getMarketPriceStep(currentPrice)
        : getMarketPriceStep(Math.min(MARKET_DIALOG_MAX_PRICE, currentPrice + 1));
      return this.normalizeTradeDialogPrice(currentPrice + step, 'up');
    }
    const probe = Math.max(MARKET_DIALOG_MIN_PRICE, currentPrice - 1);
    return this.normalizeTradeDialogPrice(currentPrice - getMarketPriceStep(probe), 'down');
  }

  /** 按买卖方向把单价夹回合法区间并对齐价格档位。 */
  private normalizeTradeDialogPrice(value: number, direction: 'up' | 'down'): number {
    const bounded = Math.max(MARKET_DIALOG_MIN_PRICE, Math.min(MARKET_DIALOG_MAX_PRICE, value));
    if (direction === 'up') {
      return Math.min(MARKET_DIALOG_MAX_PRICE, normalizeMarketPriceUp(bounded));
    }
    return Math.max(MARKET_DIALOG_MIN_PRICE, normalizeMarketPriceDown(bounded));
  }

  /** 把价格预设值格式化成按钮上更容易读的文案。 */
  private formatPricePresetLabel(value: number): string {
    if (value < 1) {
      return this.formatMarketUnitPrice(value);
    }
    if (value >= 1_000_000) {
      return '一百万';
    }
    if (value >= 10_000) {
      return '一万';
    }
    return formatDisplayInteger(value);
  }

  /** 从 data-* 属性里读一个数字。 */
  private readDatasetNumber(value: string | undefined): number | null {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** 格式化市场里的单价显示。 */
  private formatMarketUnitPrice(value: number): string {
    return formatDisplayNumber(value, {
      maximumFractionDigits: value < 1 ? 2 : 0,
      compactMaximumFractionDigits: value < 1 ? 2 : 0,
    });
  }

  /** 格式化强化预估里的灵石消耗。 */
  private formatEnhancementEstimateCost(value: number): string {
    return formatDisplayNumber(value, {
      maximumFractionDigits: 2,
      compactMaximumFractionDigits: 2,
    });
  }

  /** 格式化强化预估里的尝试次数。 */
  private formatEnhancementAttemptCount(value: number): string {
    return formatDisplayNumber(value, {
      maximumFractionDigits: 0,
      compactMaximumFractionDigits: 1,
    });
  }

  /** 计算单次强化任务的基础耗时。 */
  private computeEnhancementJobBaseTicks(itemLevel: number | undefined): number {
    const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
    return ENHANCEMENT_BASE_JOB_TICKS + Math.max(0, normalizedLevel - 1) * ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL;
  }

  /** 把耗时 ticks 转成更像人工可读的时间。 */
  private formatEnhancementDurationFromTicks(value: number): string {
    const totalSeconds = Math.max(0, Math.round(value));
    if (totalSeconds < 60) {
      return `${formatDisplayInteger(totalSeconds)}息`;
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${formatDisplayInteger(hours)}时${formatDisplayInteger(minutes)}分${formatDisplayInteger(seconds)}秒`;
    }
    return `${formatDisplayInteger(minutes)}分${formatDisplayInteger(seconds)}秒`;
  }

  /** 计算这笔交易的总金额。 */
  private getMarketTradeTotalCost(quantity: number, unitPrice: number): number | null {
    return calculateMarketTradeTotalCost(quantity, unitPrice);
  }

  /** 读取装备在市场里的强化等级。 */
  private getMarketEnhanceLevel(item: ItemStack): number {
    return item.type === 'equipment'
      ? Math.max(0, Math.floor(Number(item.enhanceLevel) || 0))
      : 0;
  }

  /** 读取本地盘面里 +0 同款装备的最低卖价。 */
  private getLocalZeroEnhancementLowestSellPrice(itemId: string): number | undefined {
    return this.marketUpdate?.listedItems.find((entry) =>
      entry.item.itemId === itemId
      && this.getMarketEnhanceLevel(entry.item) === 0
    )?.lowestSellPrice;
  }

  /** 把基础物品提示补上强化预估内容。 */
  private buildMarketItemTooltipPayload(item: ItemStack) {
    const tooltip = buildItemTooltipPayload(item);
    const estimate = this.buildEnhancementEstimate(item);
    if (!estimate) {
      return tooltip;
    }
    return {
      ...tooltip,
      lines: [
        ...tooltip.lines,
        renderPlainTooltipLine('强化估算', estimate.costLine),
        renderPlainTooltipLine('期望次数', estimate.attemptsLine),
        renderPlainTooltipLine('期望时间', estimate.timeLine),
      ],
    };
  }

  /** 根据节点上的 data-* 标记找到对应的提示内容。 */
  private resolveMarketTooltipPayload(node: HTMLElement) {
    const key = node.dataset.marketItemTooltip;
    if (!key) {
      return null;
    }
    if (key === 'selected') {
      const selected = this.getSelectedListedItem(this.marketUpdate);
      return selected ? this.buildMarketItemTooltipPayload(selected.item) : null;
    }
    const listed = this.marketUpdate?.listedItems.find((entry) => entry.itemKey === key) ?? null;
    return listed ? this.buildMarketItemTooltipPayload(listed.item) : null;
  }

  /** 根据市场盘面和当前物品推一版强化预估。 */
  private buildEnhancementEstimate(item: ItemStack): MarketEnhancementEstimateView | null {
    if (item.type !== 'equipment') {
      return null;
    }
    const targetLevel = this.getMarketEnhanceLevel(item);
    if (targetLevel <= 0) {
      return null;
    }
    const itemLevel = Math.max(1, Math.floor(Number(item.level) || 1));
    const zeroItemKey = this.getZeroEnhancementItemKey(item);
    const cachedBaseUnitPrice = zeroItemKey
      ? this.itemBookCache.get(zeroItemKey)?.sells[0]?.unitPrice
      : undefined;
    const localBaseUnitPrice = this.getLocalZeroEnhancementLowestSellPrice(item.itemId);
    const baseUnitPrice = localBaseUnitPrice ?? cachedBaseUnitPrice;
    const basePricePending = localBaseUnitPrice === undefined && cachedBaseUnitPrice === undefined;
    if (basePricePending && zeroItemKey) {
      this.ensureItemBookCached(zeroItemKey);
    }
    const analysis = computeBestEnhancementExpectedCost({
      targetLevel,
      itemLevel,
      protectionUnitPrice: baseUnitPrice,
      targetItemUnitPrice: baseUnitPrice,
      selfProtection: true,
    });
    const strategy = analysis.bestStrategy ?? analysis.strategies[0] ?? null;
    if (!strategy) {
      return null;
    }
    const usesMarketBasePrice = baseUnitPrice !== undefined;
    const expectedProtectionCost = strategy.expectedProtectionCost ?? 0;
    const expectedTotalCost = strategy.expectedSpiritStones + expectedProtectionCost;
    const protectionStartText = strategy.protectionStartLevel === null ? '无保护' : `+${strategy.protectionStartLevel}`;
    const zeroPriceText = baseUnitPrice !== undefined
      ? this.formatMarketUnitPrice(baseUnitPrice)
      : basePricePending
        ? '补拉中'
        : '暂无';
    const baseTicksPerAttempt = this.computeEnhancementJobBaseTicks(itemLevel);
    const expectedBaseDurationTicks = strategy.expectedAttempts * baseTicksPerAttempt;
    const costLine = `总灵石 ${this.formatEnhancementEstimateCost(expectedTotalCost)} · 强化消耗 ${this.formatEnhancementEstimateCost(strategy.expectedSpiritStones)} · 保护消耗 ${this.formatEnhancementEstimateCost(expectedProtectionCost)} · +0价格 ${zeroPriceText}`;
    const attemptsLine = `${this.formatEnhancementAttemptCount(strategy.expectedAttempts)} 次 · 从${protectionStartText}开始保护 · 期望保护 ${this.formatEnhancementEstimateCost(strategy.expectedProtectionCount)} 个`;
    const timeLine = `${this.formatEnhancementDurationFromTicks(expectedBaseDurationTicks)}（基准每次 ${this.formatEnhancementDurationFromTicks(baseTicksPerAttempt)}）`;
    return {
      strategy,
      costLine,
      attemptsLine,
      timeLine,
      baseUnitPrice,
      usesMarketBasePrice,
      basePricePending,
    };
  }

  /** 把装备归一成 +0 版本的物品 key。 */
  private getZeroEnhancementItemKey(item: ItemStack): string {
    return createItemStackSignature({
      ...item,
      count: 1,
      enhanceLevel: 0,
      name: item.name.replace(/^\+\d+\s+/, ''),
    });
  }

  /** 确保某个物品书籍已进入缓存请求流程。 */
  private ensureItemBookCached(itemKey: string): void {
    if (this.itemBookCache.has(itemKey) || this.pendingItemBookKeys.has(itemKey)) {
      return;
    }
    this.pendingItemBookKeys.add(itemKey);
    this.callbacks?.onRequestItemBook(itemKey);
  }

  /** 在背包里找一格能对应当前物品的槽位。 */
  private findMatchingInventorySlot(item: ItemStack): number | null {
    const targetKey = createItemStackSignature({ ...item, count: 1 });
    const exactSlotIndex = this.inventory.items.findIndex((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey);
    if (exactSlotIndex >= 0) {
      return exactSlotIndex;
    }
    const fallbackSlotIndex = this.inventory.items.findIndex((entry) => entry.itemId === item.itemId);
    return fallbackSlotIndex >= 0 ? fallbackSlotIndex : null;
  }

  /** 统计背包里与当前物品匹配的总数量。 */
  private findMatchingInventoryCount(item: ItemStack): number {
    const targetKey = createItemStackSignature({ ...item, count: 1 });
    const exactMatches = this.inventory.items.filter((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey);
    if (exactMatches.length > 0) {
      return exactMatches.reduce((sum, entry) => sum + entry.count, 0);
    }
    return this.inventory.items
      .filter((entry) => entry.itemId === item.itemId)
      .reduce((sum, entry) => sum + entry.count, 0);
  }

  /** 按物品 id 统计背包里的总数量。 */
  private findInventoryItemCountByItemId(itemId: string): number {
    return this.inventory.items
      .filter((entry) => entry.itemId === itemId)
      .reduce((sum, entry) => sum + entry.count, 0);
  }
}

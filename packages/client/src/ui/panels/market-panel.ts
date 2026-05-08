import {
  AuctionLotPageEntry,
  AuctionLotStatus,
  AuctionHouseTab,
  C2S_RequestAuctionListings,
  C2S_RequestMarketListings,
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
  MAX_ENHANCE_LEVEL,
  MARKET_MAX_UNIT_PRICE,
  MARKET_PRICE_PRESET_VALUES,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  PlayerState,
  S2C_AuctionListings,
  S2C_MarketListings,
  S2C_MarketItemBook,
  S2C_MarketOrders,
  S2C_MarketStorage,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
  TechniqueCategory,
  getMarketPriceStep,
  normalizeMarketPriceDown,
  normalizeMarketPriceUp,
} from '@mud/shared';
import { getLocalItemTemplate, getLocalTechniqueCategoryForBookItem, resolvePreviewItem, resolveTechniqueIdFromBookItemId } from '../../content/local-templates';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { confirmModalHost } from '../confirm-modal-host';
import { preserveSelection } from '../selection-preserver';
import { patchElementHtml } from '../dom-patch';
import { MARKET_MODAL_TABS, MARKET_PANE_HINT, MarketModalTab } from '../../constants/ui/market';
import { getPlayerOwnedItemCount } from '../../utils/player-wallet';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';
import { t } from '../i18n';

/** 把普通文本转成可安全插入 HTML 的内容。 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 复用同一套转义逻辑，避免属性值注入。 */
function escapeHtmlAttr(value: unknown): string {
  return escapeHtml(value);
}

/** 拼出一行普通提示文本，供 tooltip 复用。 */
function renderPlainTooltipLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${escapeHtml(value)}`;
}

/** 市场面板对外的请求/提交回调。 */
interface MarketPanelCallbacks {
/**
 * onRequestMarket：onRequest坊市相关字段。
 */

  onRequestMarket: () => void;
  /**
 * onRequestListings：onRequestListing相关字段。
 */

  onRequestListings: (payload: C2S_RequestMarketListings) => void;
  /**
 * onRequestAuctionListings：onRequest拍卖行Listing相关字段。
 */

  onRequestAuctionListings: (payload: C2S_RequestAuctionListings) => void;
  /**
 * onRequestItemBook：onRequest道具Book相关字段。
 */

  onRequestItemBook: (itemKey: string) => void;
  /**
 * onRequestTradeHistory：onRequestTradeHistory相关字段。
 */

  onRequestTradeHistory: (page: number) => void;
  /**
 * onCreateSellOrder：onCreateSell订单相关字段。
 */

  onCreateSellOrder: (slotIndex: number, quantity: number, unitPrice: number) => void;
  /**
 * onCreateBuyOrder：onCreateBuy订单相关字段。
 */

  onCreateBuyOrder: (itemKey: string, quantity: number, unitPrice: number) => void;
  /**
 * onPlaceAuctionBid：提交拍卖行加价。
 */

  onPlaceAuctionBid: (lotId: string, itemKey: string, unitPrice: number) => void;
  /**
 * onBuyoutAuctionLot：提交拍卖行一口价。
 */

  onBuyoutAuctionLot: (lotId: string, itemKey: string) => void;
  /**
 * onCancelOrder：onCancel订单相关字段。
 */

  onCancelOrder: (orderId: string) => void;
  /**
 * onClaimStorage：onClaimStorage相关字段。
 */

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
/** 交易弹窗的来源场景。 */
type MarketTradeDialogSource = 'market' | 'auction-bid';
/** 交易弹窗里调价按钮的动作类型。 */
type MarketPriceAction = 'decrease' | 'increase' | 'double' | 'half' | 'preset';
/** 交易弹窗当前的可编辑状态。 */
interface MarketTradeDialogState {
/**
 * kind：kind相关字段。
 */

  kind: MarketTradeDialogKind;
  /**
 * quantity：quantity相关字段。
 */

  quantity: number;
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;
  /** 来源场景，用来区分普通坊市交易和拍卖加价。 */
  source?: MarketTradeDialogSource;
  /** 拍卖加价允许的最低单价。 */
  minUnitPrice?: number;
  /** 是否来自卖盘快捷购买，需要二次确认购买。 */
  confirmPurchase?: boolean;
}

/** 交易弹窗一次渲染需要的派生状态，供整渲染和局部 patch 共用。 */
interface MarketTradeDialogViewState {
  dialog: MarketTradeDialogState;
  source: MarketTradeDialogSource;
  title: string;
  actionLabel: string;
  totalLabel: string;
  quantityStep: number;
  inputMax: number;
  totalText: string;
  insufficientCurrency: boolean;
  disabled: boolean;
  maxButtonDisabled: boolean;
  showPricePresets: boolean;
  showQuantityControls: boolean;
  priceActionDisabled: Partial<Record<MarketPriceAction, boolean>>;
  hintsHtml: string;
}

/** 强化预估结果在界面里的展示结构。 */
interface MarketEnhancementEstimateView {
/**
 * strategy：strategy相关字段。
 */

  strategy: EnhancementExpectedCostStrategy;
  /**
 * costLine：消耗Line相关字段。
 */

  costLine: string;
  /**
 * attemptsLine：attemptLine相关字段。
 */

  attemptsLine: string;
  /**
 * timeLine：时间Line相关字段。
 */

  timeLine: string;
  /**
 * baseUnitPrice：baseUnit价格数值。
 */

  baseUnitPrice?: number;
  /**
 * usesMarketBasePrice：use坊市Base价格数值。
 */

  usesMarketBasePrice: boolean;
  /**
 * basePricePending：base价格Pending相关字段。
 */

  basePricePending: boolean;
}

/** 当前页里按物品 id 聚合后的列表分组。 */
interface MarketListingGroupView {
  itemId: string;
  item: ItemStack;
  canEnhance: boolean;
  variants: MarketListedItemView[];
}

/** 拍卖行 UI 使用的轻量拍品视图。 */
interface AuctionLotView {
  id: string;
  itemKey: string;
  item: ItemStack;
  itemName: string;
  typeLabel: string;
  qualityLabel: string;
  currentPrice: number;
  buyoutPrice: number | null;
  bidCount: number;
  bids: AuctionLotPageEntry['bids'];
  startAtMs: number;
  durationSeconds: number;
  status: AuctionLotStatus;
  statusLabel: string;
  sellerLabel: string;
  lotNo: string;
  heat: number;
  orderId?: string;
  orderSide?: MarketOwnOrderView['side'];
  remainingQuantity?: number;
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
const MARKET_TECHNIQUE_FILTERS: Array<{
/**
 * id：ID标识。
 */
 id: MarketTechniqueFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { id: 'all', label: t('market.filter.technique-all', undefined) },
  { id: 'arts', label: getTechniqueCategoryLabel('arts') },
  { id: 'internal', label: getTechniqueCategoryLabel('internal') },
  { id: 'divine', label: getTechniqueCategoryLabel('divine') },
  { id: 'secret', label: getTechniqueCategoryLabel('secret') },
];
/** 强化任务的基础耗时。 */
const ENHANCEMENT_BASE_JOB_TICKS = 5;
/** 物品等级每升一级额外增加的强化耗时。 */
const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;
/** 拍卖行每页最多显示的拍品数量。 */
const AUCTION_PAGE_SIZE = 10;

/** 市场面板实现，负责列表浏览、物品书籍、交易弹窗和强化预估。 */
export class MarketPanel {
  /** 市场详情弹窗的归属标识。 */
  private static readonly MODAL_OWNER = 'market-panel';
  /** 拍卖行详情弹窗的归属标识。 */
  private static readonly AUCTION_MODAL_OWNER = 'auction-house-panel';
  /** 交易弹窗根节点的 id。 */
  private static readonly TRADE_MODAL_ID = 'market-trade-modal-root';
  /** 买入确认弹层的归属标识。 */
  private static readonly CONFIRM_MODAL_OWNER = 'market-buy-confirm';
  /** 面板根节点，只负责首屏摘要和打开入口。 */
  private readonly pane = document.getElementById('pane-market')!;
  /** 市场面板对外回调，实际请求都交给外部处理。 */
  private callbacks: MarketPanelCallbacks | null = null;
  /** 当前市场主快照，列表、挂单和托管仓都从这里读。 */
  private marketUpdate: S2C_MarketUpdate | null = null;
  /** 当前选中物品对应的书籍详情。 */
  private itemBook: MarketOrderBookView | null = null;
  /** 最近一次列表分页数据，供筛选和翻页回填。 */
  private marketListings: S2C_MarketListings | null = null;
  /** 最近一次拍卖行分页数据，服务端已经按筛选和页码裁剪。 */
  private auctionListings: S2C_AuctionListings | null = null;
  /** 物品书籍本地缓存，避免重复请求同一份详情。 */
  private readonly itemBookCache = new Map<string, MarketOrderBookView>();
  /** 正在等待服务端回包的物品书籍 key。 */
  private readonly pendingItemBookKeys = new Set<string>();
  /** 当前在市场列表里选中的物品 key。 */
  private selectedItemKey: string | null = null;
  /** 当前高亮的物品组。 */
  private selectedGroupItemId: string | null = null;
  /** 当前正在查看的强化等级列表归属物品。 */
  private enhancementBrowseItemId: string | null = null;
  /** 弹窗当前标签页。 */
  private modalTab: MarketModalTab = 'market';
  /** 当前市场主分类筛选。 */
  private activeCategory: MarketCategoryFilter = 'all';
  /** 当前装备子分类筛选。 */
  private activeEquipmentCategory: MarketEquipmentFilter = 'all';
  /** 当前功法子分类筛选。 */
  private activeTechniqueCategory: MarketTechniqueFilter = 'all';
  /** 拍卖行当前标签页。 */
  private auctionTab: AuctionHouseTab = 'participate';
  /** 拍卖行物品分类筛选。 */
  private auctionCategory: MarketCategoryFilter = 'all';
  /** 拍卖行搜索关键字。 */
  private auctionSearchQuery = '';
  /** 拍卖行当前选中的拍品 id。 */
  private selectedAuctionItemKey: string | null = null;
  /** 拍卖行当前页码。 */
  private auctionPage = 1;
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
  /** 待确认的买入请求。 */
  private buyConfirmState: { itemKey: string; quantity: number; unitPrice: number } | null = null;
  /** 当前交易历史快照。 */
  private tradeHistory: S2C_MarketTradeHistory | null = null;
  /** 当前玩家背包快照，用于判断能否挂售和买入。 */
  private inventory: Inventory = { items: [], capacity: 0 };
  private player: PlayerState | null = null;
  /** 当前登录会话是否已经预取过坊市摘要。 */
  private hasRequestedMarketBootstrap = false;
  /** 市场物品提示浮层，列表和详情共用。 */
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  /** 当前正在显示提示的节点。 */
  private tooltipNode: HTMLElement | null = null;
  /** 拍卖行倒计时本地 ticker，只局部更新倒计时文本。 */
  private auctionCountdownTimer: ReturnType<typeof window.setInterval> | null = null;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


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
    this.player = player;
    this.inventory = player.inventory;
    this.renderPane();
    this.requestMarketBootstrap();
  }

  /** 同步玩家上下文，供钱包类货币展示直接读取。 */
  syncPlayerContext(player?: PlayerState): void {
    this.player = player ?? null;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.syncVisibleMarketInventoryState();
      this.syncTradeDialogOverlay();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionDetailPanel();
      this.syncTradeDialogOverlay();
    }
  }

  /** 同步背包快照，并刷新依赖弹窗。 */
  syncInventory(inventory: Inventory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.inventory = inventory;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.syncVisibleMarketInventoryState();
      this.syncTradeDialogOverlay();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionDetailPanel();
      this.syncTradeDialogOverlay();
    }
  }

  /** 更新市场主视图。 */
  updateMarket(data: S2C_MarketUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const knownListedItems = data.listedItems.length > 0 ? data.listedItems : this.getKnownListedItems(this.marketUpdate);
    this.marketUpdate = {
      ...data,
      listedItems: knownListedItems,
    };
    if (this.selectedItemKey && !knownListedItems.some((item) => item.itemKey === this.selectedItemKey)) {
      this.selectedItemKey = null;
      this.itemBook = null;
      this.tradeDialog = null;
    }
    this.currentPage = this.clampPage(this.currentPage, this.getVisibleMarketTotalItems(this.marketUpdate));
    this.syncPageSelection();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      if (this.modalTab === 'market' && this.selectedItemKey) {
        this.requestItemBook(this.selectedItemKey);
      }
      this.renderModal();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
    this.syncAuctionSelection();
    const selectedAuctionLot = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, this.marketUpdate, this.auctionTab);
    if (selectedAuctionLot) {
      this.requestItemBook(selectedAuctionLot.itemKey);
    }
      this.renderAuctionModal();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  /** 更新列表分页数据。 */
  updateListings(data: S2C_MarketListings): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 更新拍卖行分页数据。 */
  updateAuctionListings(data: S2C_AuctionListings): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.auctionListings = data;
    this.auctionTab = data.tab;
    this.auctionCategory = data.category;
    this.auctionSearchQuery = data.query ?? '';
    this.auctionPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    this.syncAuctionSelection();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.renderAuctionModal();
    }
  }

  /** 更新我的订单数据。 */
  updateOrders(data: S2C_MarketOrders): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.syncAuctionSelection();
      this.renderAuctionModal();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  /** 同步坊市托管仓快照。 */
  updateStorage(data: S2C_MarketStorage): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.renderAuctionModal();
    }
  }

  /** 同步物品书籍缓存，并尽量只刷新当前选中的详情。 */
  updateItemBook(data: S2C_MarketItemBook): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionDetailPanel();
    } else {
      this.syncTradeDialogOverlay();
    }
    this.syncTradeDialogOverlay();
  }

  /** 同步交易历史分页。 */
  updateTradeHistory(data: S2C_MarketTradeHistory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.tradeHistoryLoading = false;
    this.tradeHistory = data;
    this.tradeHistoryPage = data.page;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  /** 清空市场面板状态、缓存和临时弹窗。 */
  clear(): void {
    this.player = null;
    this.marketUpdate = null;
    this.itemBook = null;
    this.marketListings = null;
    this.auctionListings = null;
    this.selectedItemKey = null;
    this.selectedGroupItemId = null;
    this.enhancementBrowseItemId = null;
    this.modalTab = 'market';
    this.activeCategory = 'all';
    this.activeEquipmentCategory = 'all';
    this.activeTechniqueCategory = 'all';
    this.auctionTab = 'participate';
    this.auctionCategory = 'all';
    this.auctionSearchQuery = '';
    this.selectedAuctionItemKey = null;
    this.auctionPage = 1;
    this.currentPage = 1;
    this.tradeHistoryPage = 1;
    this.itemBookLoading = false;
    this.tradeHistoryLoading = false;
    this.tradeDialog = null;
    this.buyConfirmState = null;
    this.tradeHistory = null;
    this.inventory = { items: [], capacity: 0 };
    this.hasRequestedMarketBootstrap = false;
    this.tooltipNode = null;
    this.tooltip.hide(true);
    this.stopAuctionCountdownTicker();
    this.syncTradeDialogOverlay();
    this.renderPane();
    confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
    detailModalHost.close(MarketPanel.MODAL_OWNER);
    detailModalHost.close(MarketPanel.AUCTION_MODAL_OWNER);
  }

  /** 渲染面板首屏摘要，只保留打开坊市的入口。 */
  private renderPane(): void {
    const listedCount = this.marketListings?.total ?? this.marketUpdate?.listedItems.length ?? 0;
    const orderCount = this.marketUpdate?.myOrders.length ?? 0;
    const storageCount = this.marketUpdate?.storage.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
    const auctionStats = this.getAuctionPaneStats(this.marketUpdate);
    preserveSelection(this.pane, () => {
      patchElementHtml(this.pane, `
        <div class="panel-section market-pane ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">${escapeHtml(t('market.pane.title', undefined))}</div>
          <div class="market-pane-copy ui-form-copy">${escapeHtml(MARKET_PANE_HINT)}</div>
          <div class="market-pane-stats">
            <div class="market-pane-stat"><strong>${formatDisplayInteger(listedCount)}</strong><span>${escapeHtml(t('market.pane.stat.listed', undefined))}</span></div>
            <div class="market-pane-stat"><strong>${formatDisplayInteger(orderCount)}</strong><span>${escapeHtml(t('market.pane.stat.orders', undefined))}</span></div>
            <div class="market-pane-stat"><strong>${formatDisplayInteger(storageCount)}</strong><span>${escapeHtml(t('market.pane.stat.storage', undefined))}</span></div>
          </div>
          <button class="small-btn" data-market-open type="button">${escapeHtml(t('market.pane.open', undefined))}</button>
        </div>
        <div class="panel-section market-pane auction-pane ui-surface-pane ui-surface-pane--stack">
          <div class="market-pane-headline">
            <div class="panel-section-title">${escapeHtml(t('market.auction.summary.title', undefined))}</div>
            <button class="small-btn ghost" data-auction-open="participate" type="button">${escapeHtml(t('market.auction.open', undefined))}</button>
          </div>
          <div class="market-pane-copy ui-form-copy">${escapeHtml(t('market.auction.summary.copy', undefined))}</div>
          <div class="auction-pane-cards">
            <button class="auction-pane-card ui-surface-card ui-surface-card--compact" data-auction-open="participate" type="button">
              <span>${escapeHtml(t('market.auction.card.participate', undefined))}</span>
              <strong>${formatDisplayInteger(auctionStats.activeLots)}</strong>
              <small>${escapeHtml(t('market.auction.card.my-bids', { count: formatDisplayInteger(auctionStats.myBids) }))}</small>
            </button>
            <button class="auction-pane-card ui-surface-card ui-surface-card--compact" data-auction-open="mine" type="button">
              <span>${escapeHtml(t('market.auction.card.mine', undefined))}</span>
              <strong>${formatDisplayInteger(auctionStats.myConsignments)}</strong>
              <small>${escapeHtml(t('market.auction.card.storage-count', { count: formatDisplayInteger(auctionStats.storageCount) }))}</small>
            </button>
          </div>
          <div class="auction-pane-feed">
            ${auctionStats.feed.length > 0
              ? auctionStats.feed.map((entry) => `<div class="auction-pane-feed-row"><span>${escapeHtml(entry.status)}</span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.meta)}</small></div>`).join('')
              : `<div class="empty-hint">${escapeHtml(t('market.auction.feed.empty', undefined))}</div>`}
          </div>
        </div>
      `);
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
        if (!this.requestMarketBootstrap()) {
          this.callbacks?.onRequestMarket();
        }
        this.openModal();
        return;
      }
      const auctionOpen = target.closest<HTMLElement>('[data-auction-open]');
      if (auctionOpen) {
        const tab = auctionOpen.dataset.auctionOpen === 'mine' ? 'mine' : 'participate';
        if (!this.requestMarketBootstrap()) {
          this.callbacks?.onRequestMarket();
        }
        this.openAuctionModal(tab);
      }
    });
  }

  /** 预取坊市摘要，避免侧边面板首次进入始终显示本地空态。 */
  private requestMarketBootstrap(): boolean {
    if (this.hasRequestedMarketBootstrap) {
      return false;
    }
    this.hasRequestedMarketBootstrap = true;
    this.callbacks?.onRequestMarket();
    return true;
  }

  /** 打开市场详情弹层，并按当前标签请求需要的数据。 */
  private openModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      title: t('market.title', undefined),
      subtitle: t('market.subtitle', undefined),
      renderBody: (body: HTMLElement) => {
        patchElementHtml(
          body,
          marketUpdate
            ? this.renderModalBody(marketUpdate)
            : `<div class="empty-hint">${escapeHtml(t('market.loading', undefined))}</div>`,
        );
      },
      onClose: () => {
        this.itemBookLoading = false;
        this.tooltipNode = null;
        this.tooltip.hide(true);
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
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
        }, { signal }));

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
          this.selectedGroupItemId = null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.tradeDialog = null;
          this.itemBook = null;
          this.requestListings(1);
        }, { signal }));

        body.querySelectorAll<HTMLElement>('[data-market-equipment-category]').forEach((button) => button.addEventListener('click', () => {
          const category = button.dataset.marketEquipmentCategory as MarketEquipmentFilter | undefined;
          if (!category || category === this.activeEquipmentCategory) {
            return;
          }
          this.activeEquipmentCategory = category;
          this.currentPage = 1;
          this.selectedGroupItemId = null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.tradeDialog = null;
          this.itemBook = null;
          this.requestListings(1);
        }, { signal }));

        body.querySelectorAll<HTMLElement>('[data-market-technique-category]').forEach((button) => button.addEventListener('click', () => {
          const category = button.dataset.marketTechniqueCategory as MarketTechniqueFilter | undefined;
          if (!category || category === this.activeTechniqueCategory) {
            return;
          }
          this.activeTechniqueCategory = category;
          this.currentPage = 1;
          this.selectedGroupItemId = null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.tradeDialog = null;
          this.itemBook = null;
          this.requestListings(1);
        }, { signal }));

        body.querySelectorAll<HTMLElement>('[data-market-page]').forEach((button) => button.addEventListener('click', () => {
          const nextPage = Number.parseInt(button.dataset.marketPage ?? '1', 10);
          if (!Number.isFinite(nextPage) || nextPage === this.currentPage) {
            return;
          }
          const requestedPage = Math.max(1, Math.floor(nextPage));
          this.currentPage = requestedPage;
          this.selectedGroupItemId = null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.tradeDialog = null;
          this.itemBook = null;
          this.requestListings(requestedPage);
        }, { signal }));

        body.querySelectorAll<HTMLElement>('[data-market-history-page]').forEach((button) => button.addEventListener('click', () => {
          const nextPage = Number.parseInt(button.dataset.marketHistoryPage ?? '1', 10);
          if (!Number.isFinite(nextPage) || nextPage === this.tradeHistoryPage) {
            return;
          }
          this.requestTradeHistory(nextPage);
          this.renderModal();
        }, { signal }));

        body.querySelectorAll<HTMLElement>('[data-market-select-item]').forEach((button) => button.addEventListener('click', () => {
          const itemKey = button.dataset.marketSelectItem;
          const groupItemId = button.dataset.marketSelectItemGroup;
          if (!itemKey) {
            return;
          }
          if (itemKey === this.selectedItemKey && (!groupItemId || groupItemId === this.selectedGroupItemId)) {
            return;
          }
          if (groupItemId) {
            this.selectedGroupItemId = groupItemId;
            this.enhancementBrowseItemId = groupItemId;
          }
          this.selectedItemKey = itemKey;
          this.itemBook = null;
          this.tradeDialog = null;
          this.requestItemBook(itemKey);
          this.patchMarketActiveSelection();
          this.patchSelectedBookPanel();
          this.syncTradeDialogOverlay();
        }, { signal }));

        body.querySelectorAll<HTMLElement>('[data-market-select-group]').forEach((button) => button.addEventListener('click', () => {
          const groupItemId = button.dataset.marketSelectGroup;
          const group = groupItemId
            ? this.getVisibleListingGroups(this.marketUpdate).find((entry) => entry.itemId === groupItemId) ?? null
            : null;
          if (!group || !groupItemId) {
            return;
          }
          if (groupItemId === this.selectedGroupItemId && !group.canEnhance) {
            return;
          }
          this.selectedGroupItemId = groupItemId;
          this.itemBook = null;
          this.tradeDialog = null;
          if (group.canEnhance) {
            this.enhancementBrowseItemId = groupItemId;
            this.selectedItemKey = null;
            this.renderModal();
            return;
          }
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = group.variants[0]?.itemKey ?? null;
          if (this.selectedItemKey) {
            this.requestItemBook(this.selectedItemKey);
          }
          this.patchMarketActiveSelection();
          this.patchSelectedBookPanel();
          this.syncTradeDialogOverlay();
        }, { signal }));

        body.querySelector<HTMLElement>('[data-market-back-to-groups]')?.addEventListener('click', () => {
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.itemBook = null;
          this.tradeDialog = null;
          this.renderModal();
        }, { signal });

        body.querySelectorAll<HTMLElement>('[data-market-cancel-order]').forEach((button) => button.addEventListener('click', () => {
          const orderId = button.dataset.marketCancelOrder;
          if (!orderId) {
            return;
          }
          this.callbacks?.onCancelOrder(orderId);
        }, { signal }));

        body.querySelector<HTMLElement>('[data-market-claim-storage]')?.addEventListener('click', () => {
          this.callbacks?.onClaimStorage();
        }, { signal });

        this.bindMarketModalDelegatedEvents(body, signal);
        this.syncTradeDialogOverlay();
      },
    });
  }

  /** 打开拍卖行独立弹层。 */
  private openAuctionModal(tab: AuctionHouseTab = this.auctionTab): void {
    this.auctionTab = tab;
    this.auctionPage = this.auctionListings?.tab === tab ? this.auctionPage : 1;
    this.requestAuctionListings(this.auctionPage);
    this.syncAuctionSelection();
    const selectedAuctionLot = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, this.marketUpdate, this.auctionTab);
    if (selectedAuctionLot) {
      this.selectedItemKey = selectedAuctionLot.itemKey;
      this.requestItemBook(selectedAuctionLot.itemKey);
    }
    this.renderAuctionModal();
  }

  /** 渲染拍卖行独立界面。 */
  private renderAuctionModal(): void {
    const marketUpdate = this.marketUpdate;
    this.syncAuctionSelection();
    const options = {
      ownerId: MarketPanel.AUCTION_MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market detail-modal--auction-house',
      title: t('auction.title', undefined),
      subtitle: t('auction.subtitle', undefined),
      renderBody: (body: HTMLElement) => {
        patchElementHtml(
          body,
          marketUpdate
            ? this.renderAuctionModalBody(marketUpdate)
            : `<div class="empty-hint">${escapeHtml(t('auction.loading', undefined))}</div>`,
        );
      },
      onClose: () => {
        this.tradeDialog = null;
        this.tooltipNode = null;
        this.tooltip.hide(true);
        this.stopAuctionCountdownTicker();
        this.syncTradeDialogOverlay();
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        this.bindAuctionModalEvents(body, signal);
        this.bindMarketModalDelegatedEvents(body, signal);
        this.startAuctionCountdownTicker();
        this.patchAuctionCountdowns();
        this.syncTradeDialogOverlay();
      },
    } as const;
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      detailModalHost.patch(options);
      return;
    }
    detailModalHost.open(options);
  }

  /** 渲染拍卖行主体。 */
  private renderAuctionModalBody(update: S2C_MarketUpdate): string {
    const lots = this.getCurrentAuctionLots();
    return `
      <div class="auction-house-shell">
        <div class="auction-house-tabs" role="tablist" aria-label="拍卖行分栏">
          <button class="auction-house-tab ${this.auctionTab === 'participate' ? 'active' : ''}" data-auction-tab="participate" type="button">${escapeHtml(t('auction.tab.participate', undefined))}</button>
          <button class="auction-house-tab ${this.auctionTab === 'mine' ? 'active' : ''}" data-auction-tab="mine" type="button">${escapeHtml(t('auction.tab.mine', undefined))}</button>
        </div>
        ${this.renderAuctionSummaryCards(update)}
        ${this.auctionTab === 'participate'
          ? this.renderAuctionParticipateTab(update, lots)
          : this.renderAuctionMineTab(update, lots)}
      </div>
    `;
  }

  /** 渲染拍卖行顶部摘要卡。 */
  private renderAuctionSummaryCards(update: S2C_MarketUpdate): string {
    const summary = this.getAuctionSummary(update);
    return `
      <div class="auction-house-summary">
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('auction.summary.active', undefined))}</span>
          <strong>${formatDisplayInteger(summary.activeLots)}</strong>
          <small>${escapeHtml(t('auction.summary.buyout', { count: formatDisplayInteger(summary.buyoutLots) }))}</small>
        </div>
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>成交总额</span>
          <strong>${this.formatMarketUnitPrice(summary.totalCurrentPrice)}</strong>
          <small>${escapeHtml(update.currencyItemName)}</small>
        </div>
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>我的竞拍</span>
          <strong>${formatDisplayInteger(summary.myBidCount)}</strong>
          <small>当前求购竞价</small>
        </div>
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>我的寄拍</span>
          <strong>${formatDisplayInteger(summary.myConsignments)}</strong>
          <small>寄拍中 ${formatDisplayInteger(summary.consigningLots)}</small>
        </div>
      </div>
    `;
  }

  /** 渲染参与拍卖页。 */
  private renderAuctionParticipateTab(update: S2C_MarketUpdate, lots: AuctionLotView[]): string {
    const pagination = this.getAuctionPageState(lots);
    const selected = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, update, 'participate') ?? lots[0] ?? null;
    return `
      <div class="auction-house-board">
        ${this.renderAuctionFilterRail()}
        <div class="auction-list-panel ui-surface-pane ui-surface-pane--stack">
          <div class="auction-list-toolbar ui-action-row">
            <div class="market-list-toolbar-meta">共 ${formatDisplayInteger(pagination.totalItems)} 件拍品，第 ${formatDisplayInteger(pagination.page)} / ${formatDisplayInteger(pagination.totalPages)} 页</div>
            <div class="market-list-toolbar-actions">
              <button class="small-btn ghost" data-auction-page="${pagination.page - 1}" type="button" ${pagination.page <= 1 ? 'disabled' : ''}>上一页</button>
              <button class="small-btn ghost" data-auction-page="${pagination.page + 1}" type="button" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>下一页</button>
              <button class="small-btn ghost" data-auction-refresh type="button">${escapeHtml(t('market.auction.refresh', undefined))}</button>
            </div>
          </div>
          <div class="auction-list-head">
            <span>${escapeHtml(t('market.auction.head.item', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.quality', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.current-price', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.buyout-price', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.remaining-time', undefined))}</span>
          </div>
          <div class="auction-list ui-scroll-panel">
            ${lots.length > 0
              ? lots.map((lot) => this.renderAuctionLotRow(lot, selected?.id ?? '')).join('')
              : `<div class="empty-hint">${escapeHtml(t('market.auction.empty.participate', undefined))}</div>`}
          </div>
        </div>
        <div class="auction-detail-panel ui-surface-pane ui-surface-pane--stack" data-auction-detail-panel>
          ${this.renderAuctionDetailPanel(selected, update, 'participate')}
        </div>
      </div>
    `;
  }

  /** 渲染我的寄拍页。 */
  private renderAuctionMineTab(update: S2C_MarketUpdate, lots: AuctionLotView[]): string {
    const pagination = this.getAuctionPageState(lots);
    const selected = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, update, 'mine') ?? lots[0] ?? null;
    const consigningCount = this.auctionListings?.summary.consigningLots ?? lots.filter((lot) => lot.status === 'consigning').length;
    const soldCount = this.auctionListings?.summary.soldLots ?? lots.filter((lot) => lot.status === 'sold').length;
    const failedCount = this.auctionListings?.summary.failedLots ?? lots.filter((lot) => lot.status === 'failed').length;
    return `
      <div class="auction-house-board auction-house-board--mine">
        <div class="auction-consign-overview ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">${escapeHtml(t('market.auction.mine.title', undefined))}</div>
          <div class="auction-status-strip">
            <span class="auction-status-pill active">${escapeHtml(t('market.auction.mine.status.consigning', { count: formatDisplayInteger(consigningCount) }))}</span>
            <span class="auction-status-pill sold">${escapeHtml(t('market.auction.mine.status.sold', { count: formatDisplayInteger(soldCount) }))}</span>
            <span class="auction-status-pill failed">${escapeHtml(t('market.auction.mine.status.failed', { count: formatDisplayInteger(failedCount) }))}</span>
          </div>
          <div class="market-pane-copy">${escapeHtml(t('market.auction.mine.copy', undefined))}</div>
        </div>
        <div class="auction-list-panel ui-surface-pane ui-surface-pane--stack">
          <div class="auction-list-toolbar ui-action-row">
            <div class="market-list-toolbar-meta">我的寄拍 ${formatDisplayInteger(pagination.totalItems)} 件，第 ${formatDisplayInteger(pagination.page)} / ${formatDisplayInteger(pagination.totalPages)} 页</div>
            <div class="market-list-toolbar-actions">
              <button class="small-btn ghost" data-auction-page="${pagination.page - 1}" type="button" ${pagination.page <= 1 ? 'disabled' : ''}>上一页</button>
              <button class="small-btn ghost" data-auction-page="${pagination.page + 1}" type="button" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>下一页</button>
              <button class="small-btn ghost" data-auction-refresh type="button">${escapeHtml(t('market.auction.refresh', undefined))}</button>
            </div>
          </div>
          <div class="auction-list-head auction-list-head--mine">
            <span>${escapeHtml(t('market.auction.head.item', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.status', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.list-price', undefined))}</span>
            <span>${escapeHtml(t('market.auction.head.remaining', undefined))}</span>
          </div>
          <div class="auction-list ui-scroll-panel">
            ${lots.length > 0
              ? lots.map((lot) => this.renderAuctionLotRow(lot, selected?.id ?? '', true)).join('')
              : `<div class="empty-hint">${escapeHtml(t('market.auction.empty.mine', undefined))}</div>`}
          </div>
        </div>
        <div class="auction-detail-panel ui-surface-pane ui-surface-pane--stack" data-auction-detail-panel>
          ${this.renderAuctionDetailPanel(selected, update, 'mine')}
        </div>
      </div>
    `;
  }

  /** 渲染拍卖行筛选栏。 */
  private renderAuctionFilterRail(): string {
    const categories: Array<{ id: MarketCategoryFilter; label: string; count: number }> = [
      { id: 'all', label: t('auction.filter.all', undefined), count: this.getAuctionCategoryCount('all', 0) },
      ...ITEM_TYPES.map((type) => ({
        id: type,
        label: getItemTypeLabel(type),
        count: this.getAuctionCategoryCount(type, 0),
      })),
    ];
    return `
      <aside class="auction-filter-rail ui-surface-pane ui-surface-pane--stack">
        <label class="auction-search-field">
          <span>${escapeHtml(t('auction.filter.search', undefined))}</span>
          <input class="ui-search-input" data-auction-search id="auction-search-input" type="search" value="${escapeHtmlAttr(this.auctionSearchQuery)}" placeholder="${escapeHtmlAttr(t('auction.filter.placeholder', undefined))}" />
        </label>
        <div class="auction-filter-group">
          <div class="market-list-toolbar-meta">分类</div>
          <div class="auction-filter-buttons">
            ${categories.map((category) => `
              <button class="auction-filter-button ${this.auctionCategory === category.id ? 'active' : ''}" data-auction-category="${category.id}" type="button">
                <span>${escapeHtml(category.label)}</span>
                <strong>${formatDisplayInteger(category.count)}</strong>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="auction-filter-note">${escapeHtml(t('auction.filter.note', undefined))}</div>
      </aside>
    `;
  }

  /** 渲染单个拍品行。 */
  private renderAuctionLotRow(lot: AuctionLotView, activeLotId: string, mine = false): string {
    const buyoutText = lot.buyoutPrice === null ? '--' : this.formatMarketUnitPrice(lot.buyoutPrice);
    const remainingSeconds = this.getAuctionRemainingSeconds(lot);
    const mineRibbon = mine
      ? `<span class="auction-lot-ribbon" aria-hidden="true"><span>${escapeHtml(t('auction.ribbon.mine', undefined))}</span></span>`
      : '';
    return `
      <button
        class="auction-lot-row ${mine ? 'auction-lot-row--mine' : ''} ${lot.id === activeLotId ? 'active' : ''}"
        data-auction-select-item="${escapeHtmlAttr(lot.id)}"
        data-ui-key="auction:${escapeHtmlAttr(lot.id)}"
        type="button"
      >
        ${mineRibbon}
        <span class="auction-lot-item">
          <strong>${escapeHtml(lot.itemName)}</strong>
          <small>${escapeHtml(lot.typeLabel)} · ${escapeHtml(lot.lotNo)}</small>
        </span>
        <span class="auction-quality-tag">${escapeHtml(mine ? lot.statusLabel : lot.qualityLabel)}</span>
        <span>${this.formatMarketUnitPrice(lot.currentPrice)}</span>
        <span>${mine ? formatDisplayCountBadge(lot.remainingQuantity ?? 0) : buyoutText}</span>
        ${mine ? '' : `<span class="auction-time ${this.getAuctionTimeClass(remainingSeconds)}" data-auction-countdown="${escapeHtmlAttr(lot.id)}">${escapeHtml(this.formatAuctionRemaining(remainingSeconds))}</span>`}
      </button>
    `;
  }

  /** 渲染拍品详情。 */
  private renderAuctionDetailPanel(lot: AuctionLotView | null, update: S2C_MarketUpdate, tab: AuctionHouseTab): string {
    if (!lot) {
      return `<div class="empty-hint">${escapeHtml(t('auction.empty.select-lot', undefined))}</div>`;
    }
    const listedEntry = this.findListingVariantByKey(lot.itemKey, update) ?? this.buildMarketListingFromAuctionLot(lot);
    const buyConflict = this.findConflictingOwnOrder(lot.itemKey, 'buy');
    const canBid = tab === 'participate' && Boolean(listedEntry) && !buyConflict;
    const canBuyout = canBid && lot.buyoutPrice !== null;
    const ownedCurrency = this.findInventoryItemCountByItemId(update.currencyItemId);
    return `
      <div class="auction-detail-head">
        <div class="auction-item-icon" aria-hidden="true">${escapeHtml(this.getAuctionItemInitial(lot.itemName))}</div>
        <div class="auction-detail-title">
          <div class="market-item-title ${listedEntry ? 'market-item-title--interactive' : ''}" ${listedEntry ? `data-market-item-tooltip="${escapeHtmlAttr(lot.itemKey)}"` : ''}>${escapeHtml(lot.itemName)}</div>
          <div class="market-book-subtitle">${escapeHtml(lot.qualityLabel)} · ${escapeHtml(lot.typeLabel)} · ${escapeHtml(lot.statusLabel)}</div>
        </div>
        <div class="auction-countdown">
          <span>${escapeHtml(t('auction.countdown', undefined))}</span>
          <strong data-auction-countdown="${escapeHtmlAttr(lot.id)}">${escapeHtml(this.formatAuctionRemaining(this.getAuctionRemainingSeconds(lot)))}</strong>
        </div>
      </div>
      <div class="auction-price-grid">
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>当前价</span>
          <strong>${this.formatMarketUnitPrice(lot.currentPrice)}</strong>
          <small>${formatDisplayInteger(lot.bidCount)} 次出价</small>
        </div>
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.trade.buyout-confirm.price', undefined))}</span>
          <strong>${lot.buyoutPrice === null ? '--' : this.formatMarketUnitPrice(lot.buyoutPrice)}</strong>
          <small>${escapeHtml(update.currencyItemName)}</small>
        </div>
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>我的灵石</span>
          <strong>${formatDisplayInteger(ownedCurrency)}</strong>
          <small>${escapeHtml(update.currencyItemName)}</small>
        </div>
      </div>
      ${tab === 'participate'
        ? `
          <div class="auction-bid-actions">
            <button class="small-btn" data-auction-action="bid" data-auction-action-item="${escapeHtmlAttr(lot.itemKey)}" type="button" ${canBid ? '' : 'disabled'}>${escapeHtml(t('market.auction.action.bid', undefined))}</button>
            <button class="small-btn ghost" data-auction-action="buyout" data-auction-action-item="${escapeHtmlAttr(lot.itemKey)}" type="button" ${canBuyout ? '' : 'disabled'}>${escapeHtml(t('market.auction.action.buyout', undefined))}</button>
          </div>
          ${buyConflict ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(t('market.auction.hint.repeat-bid', undefined))}</div>` : ''}
          <div class="market-action-hint">${escapeHtml(t('market.auction.hint.bid-and-buyout', undefined))}</div>
          ${this.renderAuctionBidHistory(lot, update.currencyItemName)}
        `
        : `
          <div class="auction-bid-actions">
            <button class="small-btn ghost" data-auction-cancel="${escapeHtmlAttr(lot.orderId ?? '')}" type="button" ${lot.orderId ? '' : 'disabled'}>${escapeHtml(t('market.auction.action.cancel-consign', undefined))}</button>
          </div>
          <div class="market-action-hint">${escapeHtml(t('market.auction.hint.remaining', { count: formatDisplayCountBadge(lot.remainingQuantity ?? 0) }))}</div>
        `}
    `;
  }

  /** 渲染出价记录。 */
  private renderAuctionBidHistory(lot: AuctionLotView, currencyName: string): string {
    const rows = Array.isArray(lot.bids) ? lot.bids.slice(0, 6) : [];
    return `
      <div class="auction-bid-history ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
        <div class="market-book-column-title">${escapeHtml(t('auction.bid-history.title', undefined))}</div>
        ${rows.length > 0
            ? rows.map((level, index) => `
              <div class="auction-bid-row">
                <span>${escapeHtml(level.bidderLabel || t('auction.bidder.anonymous', { index: formatDisplayInteger(index + 1) }))}</span>
                <strong>${this.formatMarketUnitPrice(level.unitPrice)} ${escapeHtml(currencyName)}</strong>
                <small>${escapeHtml(this.formatAuctionBidTime(level.createdAtMs))}</small>
              </div>
            `).join('')
            : `<div class="empty-hint">${escapeHtml(t('auction.bid-history.empty', undefined))}</div>`}
      </div>
    `;
  }

  /** 绑定拍卖行弹层事件。 */
  private bindAuctionModalEvents(body: HTMLElement, signal: AbortSignal): void {
    body.querySelectorAll<HTMLElement>('[data-auction-tab]').forEach((button) => button.addEventListener('click', () => {
      const tab = button.dataset.auctionTab as AuctionHouseTab | undefined;
      if (!tab || tab === this.auctionTab) {
        return;
      }
      this.auctionTab = tab;
      this.selectedAuctionItemKey = null;
      this.auctionPage = 1;
      this.tradeDialog = null;
      this.requestAuctionListings(1);
      this.renderAuctionModal();
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-category]').forEach((button) => button.addEventListener('click', () => {
      const category = button.dataset.auctionCategory as MarketCategoryFilter | undefined;
      if (!category || category === this.auctionCategory) {
        return;
      }
      this.auctionCategory = category;
      this.selectedAuctionItemKey = null;
      this.auctionPage = 1;
      this.tradeDialog = null;
      this.requestAuctionListings(1);
      this.renderAuctionModal();
    }, { signal }));

    body.querySelector<HTMLInputElement>('[data-auction-search]')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      this.auctionSearchQuery = target.value;
      this.selectedAuctionItemKey = null;
      this.auctionPage = 1;
      this.requestAuctionListings(1);
    }, { signal });

    body.querySelectorAll<HTMLElement>('[data-auction-page]').forEach((button) => button.addEventListener('click', () => {
      const nextPage = Number.parseInt(button.dataset.auctionPage ?? '1', 10);
      if (!Number.isFinite(nextPage) || nextPage === this.auctionPage) {
        return;
      }
      this.auctionPage = Math.max(1, Math.floor(nextPage));
      this.selectedAuctionItemKey = null;
      this.tradeDialog = null;
      this.requestAuctionListings(this.auctionPage);
      this.renderAuctionModal();
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-select-item]').forEach((button) => button.addEventListener('click', () => {
      const lotId = button.dataset.auctionSelectItem;
      if (!lotId || lotId === this.selectedAuctionItemKey) {
        return;
      }
      const lot = this.resolveAuctionLotByKey(lotId, this.marketUpdate, this.auctionTab);
      if (!lot) {
        return;
      }
      this.selectedAuctionItemKey = lot.id;
      this.selectedItemKey = lot.itemKey;
      this.itemBook = null;
      this.tradeDialog = null;
      this.requestItemBook(lot.itemKey);
      this.patchAuctionActiveSelection();
      this.patchAuctionDetailPanel();
      this.syncTradeDialogOverlay();
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.auctionAction;
      const itemKey = button.dataset.auctionActionItem;
      const lot = this.resolveAuctionLotByKey(itemKey, this.marketUpdate, 'participate');
      const entry = lot ? (this.findListingVariantByKey(lot.itemKey, this.marketUpdate) ?? this.buildMarketListingFromAuctionLot(lot)) : null;
      if (!action || !lot || !entry) {
        return;
      }
      this.selectedAuctionItemKey = entry.itemKey;
      this.selectedItemKey = entry.itemKey;
      if (action === 'buyout') {
        this.openAuctionBuyoutConfirm(entry, lot);
        return;
      }
      this.openAuctionBidDialog(entry, lot);
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-cancel]').forEach((button) => button.addEventListener('click', () => {
      const orderId = button.dataset.auctionCancel;
      if (!orderId) {
        return;
      }
      this.callbacks?.onCancelOrder(orderId);
    }, { signal }));

    body.querySelector<HTMLElement>('[data-auction-refresh]')?.addEventListener('click', () => {
      this.requestAuctionListings(this.auctionPage);
    }, { signal });
  }

  /** 局部更新拍卖行列表选中态。 */
  private patchAuctionActiveSelection(): void {
    const body = this.getOpenAuctionModalBody();
    if (!body) {
      return;
    }
    body.querySelectorAll<HTMLElement>('[data-auction-select-item]').forEach((button) => {
      button.classList.toggle('active', button.dataset.auctionSelectItem === this.selectedAuctionItemKey);
    });
  }

  /** 局部更新拍卖行右侧详情。 */
  private patchAuctionDetailPanel(): void {
    const body = this.getOpenAuctionModalBody();
    const update = this.marketUpdate;
    if (!body || !update) {
      return;
    }
    const detail = body.querySelector<HTMLElement>('[data-auction-detail-panel]');
    if (!detail) {
      return;
    }
    const lot = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, update, this.auctionTab);
    patchElementHtml(detail, this.renderAuctionDetailPanel(lot, update, this.auctionTab));
  }

  /** 渲染市场弹层主体和右侧分栏。 */
  private renderModalBody(update: S2C_MarketUpdate): string {
    const tabs = MARKET_MODAL_TABS
      .map((tab) => `<button class="market-side-tab ui-workspace-rail-tab ${this.modalTab === tab.id ? 'active' : ''}" data-market-modal-tab="${tab.id}" type="button">${tab.label}</button>`)
      .join('');
    return `
      <div class="market-modal-shell market-modal-shell--wide ui-workspace-shell">
        <aside class="market-side-tabs ui-workspace-rail">
          <div class="market-side-tabs-title ui-workspace-rail-title">${escapeHtml(t('market.side-tabs.title', undefined))}</div>
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
  private renderMarketTab(update: S2C_MarketUpdate): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const listedItems = this.getVisibleListedItems(update);
    if (listedItems.length === 0) {
      return `<div class="empty-hint">${escapeHtml(t('market.empty.category', undefined))}</div>`;
    }
    const groups = this.getVisibleListingGroups(update);
    const pagination = this.getPaginationState(groups);
    const selectedGroup = pagination.items.find((item) => item.itemId === this.selectedGroupItemId) ?? pagination.items[0] ?? null;
    const browsingEnhancementVariants = Boolean(selectedGroup?.canEnhance && this.enhancementBrowseItemId === selectedGroup.itemId);
    const selectedItem = browsingEnhancementVariants
      ? selectedGroup?.variants.find((item) => item.itemKey === this.selectedItemKey) ?? null
      : selectedGroup?.canEnhance
        ? null
        : selectedGroup?.variants[0] ?? null;
    const cards = browsingEnhancementVariants
      ? (selectedGroup?.variants ?? []).map((entry) => this.renderListedItem(entry, selectedItem?.itemKey ?? '', selectedGroup?.itemId ?? '')).join('')
      : pagination.items.map((entry) => this.renderGroupItem(entry, selectedGroup?.itemId ?? '')).join('');
    const orderBook = selectedItem && this.itemBook && this.itemBook.itemKey === selectedItem.itemKey ? this.itemBook : null;
    const categoryTabs = this.renderCategoryTabs(update);
    const subcategoryTabs = this.activeCategory === 'equipment'
      ? this.renderEquipmentTabs(update)
      : this.activeCategory === 'skill_book'
        ? this.renderTechniqueTabs(update)
        : '';
    const compactList = this.hasCompactCategoryLayout();
    const listToolbar = browsingEnhancementVariants && selectedGroup
      ? this.renderVariantToolbar(selectedGroup, selectedGroup.variants.length)
      : this.renderListToolbar(pagination.page, pagination.totalPages, pagination.totalItems);
    return `
      <div class="market-market-tab">
        <div class="market-category-tabs">${categoryTabs}</div>
        ${subcategoryTabs ? `<div class="market-category-tabs market-category-tabs--sub">${subcategoryTabs}</div>` : ''}
        <div class="market-board">
          <div class="market-board-list-wrap ui-surface-pane ui-surface-pane--stack">
            ${listToolbar}
            <div class="market-board-list ${compactList ? 'market-board-list--compact' : ''}">${cards}</div>
          </div>
          <div class="market-book-panel ui-surface-pane ui-surface-pane--stack">
            ${selectedItem
              ? this.renderBookPanel(selectedItem, orderBook, update.currencyItemName)
              : this.renderMarketBrowsePlaceholder(selectedGroup, browsingEnhancementVariants)}
          </div>
        </div>
      </div>
    `;
  }

  /** 渲染一张市场列表卡片。 */
  private renderListedItem(entry: MarketListedItemView, activeItemKey: string, groupItemId?: string): string {
    const ownedCount = this.findMatchingInventoryCount(entry.item);
    const status = this.getItemStatusState(entry.item);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    const itemName = this.getMarketDisplayName(entry.item);
    const statusClass = status ? ` market-item-cell--status market-item-cell--status-${status.kind}` : '';
    const statusRibbon = status
      ? `<span class="market-item-cell-ribbon" aria-hidden="true"><span>${escapeHtml(status.label)}</span></span>`
      : '';
    return `
      <button class="market-item-cell ui-surface-card ui-surface-card--compact ${entry.itemKey === activeItemKey ? 'active' : ''}${statusClass}" data-market-select-item="${escapeHtmlAttr(entry.itemKey)}" ${groupItemId ? `data-market-select-item-group="${escapeHtmlAttr(groupItemId)}"` : ''} data-market-item-tooltip="${escapeHtmlAttr(entry.itemKey)}" type="button">
        ${statusRibbon}
        <div class="market-item-cell-name" title="${escapeHtmlAttr(itemName)}">
          <span class="market-item-cell-name-text">${escapeHtml(itemName)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${entry.lowestSellPrice !== undefined ? this.formatMarketUnitPrice(entry.lowestSellPrice) : '--'}</span>
          <span>买 ${entry.highestBuyPrice !== undefined ? this.formatMarketUnitPrice(entry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  /** 渲染物品组入口，可强化装备会先进入强化等级列表。 */
  private renderGroupItem(entry: MarketListingGroupView, activeItemId: string): string {
    const ownedCount = entry.canEnhance
      ? this.findEquipmentInventoryCountByLevel(entry.itemId, 0)
      : this.findInventoryItemCountByItemId(entry.itemId);
    const status = this.getItemStatusState(entry.item);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    const referenceEntry = this.getGroupReferenceEntry(entry);
    const itemName = this.getMarketDisplayName(referenceEntry?.item ?? entry.item);
    const statusClass = status ? ` market-item-cell--status market-item-cell--status-${status.kind}` : '';
    const statusRibbon = status
      ? `<span class="market-item-cell-ribbon" aria-hidden="true"><span>${escapeHtml(status.label)}</span></span>`
      : '';
    return `
      <button class="market-item-cell ui-surface-card ui-surface-card--compact ${entry.itemId === activeItemId ? 'active' : ''}${statusClass}" data-market-select-group="${escapeHtmlAttr(entry.itemId)}" ${referenceEntry ? `data-market-item-tooltip="${escapeHtmlAttr(referenceEntry.itemKey)}"` : ''} type="button">
        ${statusRibbon}
        <div class="market-item-cell-name" title="${escapeHtmlAttr(itemName)}">
          <span class="market-item-cell-name-text">${escapeHtml(itemName)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${referenceEntry?.lowestSellPrice !== undefined ? this.formatMarketUnitPrice(referenceEntry.lowestSellPrice) : '--'}</span>
          <span>买 ${referenceEntry?.highestBuyPrice !== undefined ? this.formatMarketUnitPrice(referenceEntry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  /** 渲染选中物品的卖盘、买盘和快捷操作。 */
  private renderBookPanel(entry: MarketListedItemView, book: MarketOrderBookView | null, currencyName: string): string {
    const matchedInventoryCount = this.findMatchingInventoryCount(entry.item);
    const sellConflict = this.findConflictingOwnOrder(entry.itemKey, 'sell');
    const buyConflict = this.findConflictingOwnOrder(entry.itemKey, 'buy');
    const itemName = this.getMarketDisplayName(entry.item);
    const itemDesc = typeof entry.item.desc === 'string' ? entry.item.desc : '';
    const showOrderBook = book !== null || !this.itemBookLoading;
    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title market-item-title--interactive" data-market-item-tooltip="selected">${escapeHtml(itemName)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(entry.item.type))}${itemDesc ? ` · ${escapeHtml(itemDesc)}` : ''}</div>
        </div>
      </div>
      <div class="market-book-columns">
        <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted ui-scroll-panel">
          <div class="market-book-column-head">
            <div class="market-book-column-title">${escapeHtml(t('market.book.column.sell', undefined))}</div>
            <button class="small-btn ghost" data-market-open-dialog="sell" type="button" ${(matchedInventoryCount > 0 && !sellConflict) ? '' : 'disabled'}>${escapeHtml(t('market.book.action.sell', undefined))}</button>
          </div>
          ${sellConflict ? `<div class="market-action-hint">${escapeHtml(t('market.trade.hint.conflict-sell', undefined))}</div>` : ''}
          ${showOrderBook
            ? this.renderPriceLevels(book?.sells ?? [], currencyName, t('market.book.empty.sell', undefined), {
              kind: 'buy',
              label: t('market.book.action.buy', undefined),
              confirmPurchase: true,
              disabled: Boolean(buyConflict),
            })
            : this.renderBookLoading(t('market.book.loading.sell', undefined))}
        </div>
        <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted ui-scroll-panel">
          <div class="market-book-column-head">
            <div class="market-book-column-title">${escapeHtml(t('market.book.column.buy', undefined))}</div>
            <button class="small-btn ghost" data-market-open-dialog="buy" type="button" ${buyConflict ? 'disabled' : ''}>${escapeHtml(t('market.book.action.buy-request', undefined))}</button>
          </div>
          ${buyConflict ? `<div class="market-action-hint">${escapeHtml(t('market.trade.hint.conflict-buy', undefined))}</div>` : ''}
          ${showOrderBook ? this.renderPriceLevels(book?.buys ?? [], currencyName, t('market.book.empty.buy', undefined), {
            kind: 'sell',
            label: t('market.book.action.sell-request', undefined),
            disabled: matchedInventoryCount <= 0 || Boolean(sellConflict),
          }) : this.renderBookLoading(t('market.book.loading.buy', undefined))}
        </div>
      </div>
    `;
  }

  /** 读取市场物品的已学/已阅状态。 */
  private getItemStatusState(item: ItemStack): { label: string; kind: 'learned' | 'unlocked' } | null {
    if (item.type === 'skill_book') {
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
      if (techniqueId && this.player?.techniques.some((technique) => technique.techId === techniqueId)) {
        return { label: t('market.status.learned', undefined), kind: 'learned' };
      }
    }
    const mapIds = item.mapUnlockIds && item.mapUnlockIds.length > 0
      ? item.mapUnlockIds
      : item.mapUnlockId
        ? [item.mapUnlockId]
        : [];
    const unlockedMinimapIds = new Set(this.player?.unlockedMinimapIds ?? []);
    if (mapIds.length > 0 && mapIds.every((mapId) => unlockedMinimapIds.has(mapId))) {
      return { label: t('market.status.unlocked', undefined), kind: 'unlocked' };
    }
    return null;
  }

  /** 右侧未选中具体盘口时的占位说明。 */
  private renderMarketBrowsePlaceholder(group: MarketListingGroupView | null, browsingEnhancementVariants: boolean): string {
    if (!group) {
      return `<div class="empty-hint">${escapeHtml(t('market.empty.select-item', undefined))}</div>`;
    }
    const referenceEntry = this.getGroupReferenceEntry(group);
    const titleClass = `market-item-title${referenceEntry ? ' market-item-title--interactive' : ''}`;
    const titleTooltipAttr = referenceEntry ? ` data-market-item-tooltip="${escapeHtmlAttr(referenceEntry.itemKey)}"` : '';
    const itemName = this.getMarketDisplayName(referenceEntry?.item ?? group.item);
    if (browsingEnhancementVariants) {
      return `
        <div class="market-book-header">
          <div>
            <div class="${titleClass}"${titleTooltipAttr}>${escapeHtml(itemName)}</div>
            <div class="market-book-subtitle">${escapeHtml(t('market.book.subtitle.enhance-select', undefined))}</div>
          </div>
        </div>
        <div class="empty-hint">${escapeHtml(t('market.book.empty.enhance-level', undefined))}</div>
      `;
    }
    return `
      <div class="market-book-header">
        <div>
          <div class="${titleClass}"${titleTooltipAttr}>${escapeHtml(itemName)}</div>
          <div class="market-book-subtitle">${escapeHtml(t('market.book.subtitle.group', {
            typeLabel: getItemTypeLabel(group.item.type),
          }))}</div>
        </div>
      </div>
      <div class="empty-hint">${group.canEnhance
        ? escapeHtml(t('market.book.group.hint.enhance', undefined))
        : escapeHtml(t('market.book.group.hint.normal', undefined))}</div>
    `;
  }

  /** 渲染一档买卖盘价格和快捷下单按钮。 */
  private renderPriceLevels(
    levels: MarketOrderBookView['sells'],
    currencyName: string,
    emptyText: string,
    quickAction?: {
    /**
 * kind：kind相关字段。
 */

      kind: MarketTradeDialogKind;
      /**
 * label：label名称或显示文本。
 */

      label: string;
      /**
 * disabled：disabled相关字段。
 */

      disabled?: boolean;
      /** 是否使用购买确认页。 */
      confirmPurchase?: boolean;
    },
  ): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
              data-market-open-dialog-confirm-purchase="${quickAction.confirmPurchase ? 'true' : 'false'}"
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
  private renderMyOrdersTab(update: S2C_MarketUpdate): string {
    const buyOrders = update.myOrders.filter((order) => order.side === 'buy');
    const sellOrders = update.myOrders.filter((order) => order.side === 'sell');
    const storage = update.storage;
    return `
      <div class="market-my-orders">
        <div class="market-my-orders-grid">
          <div class="market-my-orders-column ui-surface-pane ui-surface-pane--stack">
            <div class="panel-section-title">${escapeHtml(t('market.my-orders.buy', undefined))}</div>
            ${buyOrders.length > 0 ? buyOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : `<div class="empty-hint">${escapeHtml(t('market.my-orders.empty.buy', undefined))}</div>`}
          </div>
          <div class="market-my-orders-column ui-surface-pane ui-surface-pane--stack">
            <div class="panel-section-title">${escapeHtml(t('market.my-orders.sell', undefined))}</div>
            ${sellOrders.length > 0 ? sellOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : `<div class="empty-hint">${escapeHtml(t('market.my-orders.empty.sell', undefined))}</div>`}
          </div>
        </div>
        <div class="market-storage-card ui-surface-pane ui-surface-pane--stack">
          <div class="market-storage-head">
            <div class="panel-section-title">${escapeHtml(t('market.storage.title', undefined))}</div>
            <button class="small-btn" data-market-claim-storage type="button" ${storage.items.length > 0 ? '' : 'disabled'}>${escapeHtml(t('market.storage.claim-all', undefined))}</button>
          </div>
          ${this.renderStorage(storage)}
        </div>
      </div>
    `;
  }

  /** 渲染交易历史分页。 */
  private renderTradeHistoryTab(currencyName: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const history = this.tradeHistory;
    if (this.tradeHistoryLoading && !history) {
      return `<div class="empty-hint">${escapeHtml(t('market.history.loading', undefined))}</div>`;
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
                  <span class="market-order-side ${record.side === 'buy' ? 'buy' : 'sell'}">${escapeHtml(record.side === 'buy' ? t('market.history.side.buy', undefined) : t('market.history.side.sell', undefined))}</span>
                </div>
                <div class="market-order-meta">数量 ${formatDisplayCountBadge(record.quantity)} · 单价 ${this.formatMarketUnitPrice(record.unitPrice)} ${escapeHtml(currencyName)}</div>
              </div>
            `).join('')
            : `<div class="empty-hint">${escapeHtml(this.tradeHistoryLoading ? t('market.history.loading', undefined) : t('market.history.empty', undefined))}</div>`}
        </div>
      </div>
    `;
  }

  /** 渲染一条我的挂单卡片。 */
  private renderOwnOrder(order: MarketOwnOrderView, currencyName: string): string {
    return `
      <div class="market-order-card ui-surface-card ui-surface-card--compact">
        <div class="market-order-card-head">
          <span class="market-order-name">${escapeHtml(this.getMarketDisplayName(order.item))}</span>
          <span class="market-order-side ${order.side === 'buy' ? 'buy' : 'sell'}">${escapeHtml(order.side === 'buy' ? t('market.order.side.buy', undefined) : t('market.order.side.sell', undefined))}</span>
        </div>
        <div class="market-order-meta">剩余 ${formatDisplayCountBadge(order.remainingQuantity)} · 单价 ${this.formatMarketUnitPrice(order.unitPrice)} ${escapeHtml(currencyName)}</div>
        <button class="small-btn ghost" data-market-cancel-order="${order.id}" type="button">${escapeHtml(t('market.order.cancel', undefined))}</button>
      </div>
    `;
  }

  /** 渲染坊市托管仓列表。 */
  private renderStorage(storage: MarketStorage): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (storage.items.length === 0) {
      return `<div class="empty-hint">${escapeHtml(t('market.storage.empty', undefined))}</div>`;
    }
    return `
      <div class="market-storage-list">
        ${storage.items.map((item) => `
          <div class="market-storage-item ui-surface-card ui-surface-card--compact">
            <span>${escapeHtml(this.getMarketDisplayName(item))}</span>
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

  /** 渲染强化等级二级列表顶部的返回工具条。 */
  private renderVariantToolbar(group: MarketListingGroupView, totalVariants: number): string {
    const itemName = this.getMarketDisplayName(group.item);
    return `
      <div class="market-list-toolbar ui-action-row">
        <div class="market-list-toolbar-meta">${escapeHtml(itemName)} · 共 ${formatDisplayInteger(totalVariants)} 个强化等级</div>
        <div class="market-list-toolbar-actions">
          <button class="small-btn ghost" data-market-back-to-groups type="button">返回物品列表</button>
        </div>
      </div>
    `;
  }

  /** 计算交易弹窗派生状态，避免局部刷新和整渲染口径不一致。 */
  private getTradeDialogViewState(
    entry: MarketListedItemView,
    currencyItemId: string,
    currencyName: string,
  ): MarketTradeDialogViewState | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.tradeDialog) {
      return null;
    }
    const rawDialog = this.tradeDialog;
    const source: MarketTradeDialogSource = rawDialog.source ?? 'market';
    const isAuctionBid = source === 'auction-bid';
    const minUnitPrice = this.getTradeDialogMinUnitPrice(rawDialog);
    const unitPrice = isAuctionBid
      ? this.normalizeTradeDialogPrice(Math.max(rawDialog.unitPrice, minUnitPrice), 'up')
      : rawDialog.unitPrice;
    const dialog: MarketTradeDialogState = {
      ...rawDialog,
      unitPrice,
    };
    const matchedInventoryCount = this.findMatchingInventoryCount(entry.item);
    const matchedSlotIndex = this.findMatchingInventorySlot(entry.item);
    const isBuy = dialog.kind === 'buy';
    const conflictOrder = this.findConflictingOwnOrder(entry.itemKey, dialog.kind);
    const ownedCurrency = this.findInventoryItemCountByItemId(currencyItemId);
    const quantityStep = this.getTradeDialogQuantityStep(dialog.unitPrice);
    const dialogQuantity = isAuctionBid ? quantityStep : dialog.quantity;
    const quantityMax = this.getTradeDialogQuantityMax(entry, dialog.kind, dialog.unitPrice);
    const inputMax = Math.max(quantityStep, quantityMax > 0 ? quantityMax : quantityStep);
    dialog.quantity = this.normalizeTradeDialogQuantity(dialogQuantity, entry, dialog.kind, dialog.unitPrice);
    const totalCost = this.getMarketTradeTotalCost(dialog.quantity, dialog.unitPrice);
    const insufficientCurrency = isBuy && totalCost !== null && totalCost > ownedCurrency;
    const insufficientStepQuantity = quantityMax <= 0;
    const disabled = Boolean(conflictOrder)
      || ((!isBuy && (matchedSlotIndex === null || matchedInventoryCount <= 0)) || insufficientCurrency || insufficientStepQuantity || totalCost === null);
    const hints: string[] = [];
    if (isAuctionBid) {
      hints.push(`<div class="market-action-hint">${escapeHtml(t('market.trade.hint.min-bid', {
        unitPrice: this.formatMarketUnitPrice(minUnitPrice),
        currencyName,
      }))}</div>`);
    }
    if (!isAuctionBid && quantityStep > 1) {
      hints.push(`<div class="market-action-hint">${escapeHtml(t('market.trade.hint.quantity-step', {
        quantityStep: formatDisplayInteger(quantityStep),
        currencyName,
      }))}</div>`);
    }
    if (conflictOrder) {
      hints.push(`<div class="market-action-hint market-action-hint--error">${escapeHtml(dialog.kind === 'buy'
        ? t('market.trade.hint.conflict-buy', undefined)
        : t('market.trade.hint.conflict-sell', undefined))}</div>`);
    }
    if (insufficientStepQuantity) {
      hints.push(`<div class="market-action-hint market-action-hint--error">${escapeHtml(isBuy
        ? t('market.trade.hint.insufficient-step.buy', { currencyName, quantityStep: formatDisplayInteger(quantityStep) })
        : t('market.trade.hint.insufficient-step.sell', { quantityStep: formatDisplayInteger(quantityStep) }))}</div>`);
    }
    if (insufficientCurrency && totalCost !== null) {
      hints.push(`<div class="market-action-hint market-action-hint--error">${escapeHtml(t('market.trade.hint.insufficient-currency', {
        currencyName,
        totalCost: formatDisplayInteger(totalCost),
      }))}</div>`);
    }
    const nextDecreasePrice = this.getNextTradeDialogPrice(dialog.unitPrice, 'decrease', null, minUnitPrice);
    const nextHalfPrice = this.getNextTradeDialogPrice(dialog.unitPrice, 'half', null, minUnitPrice);
    return {
      dialog,
      source,
      title: isAuctionBid ? t('market.trade.title.bid', undefined) : (isBuy ? t('market.trade.title.buy', undefined) : t('market.trade.title.sell', undefined)),
      actionLabel: isAuctionBid ? t('market.trade.action.bid', undefined) : (isBuy ? t('market.trade.action.buy', undefined) : t('market.trade.action.sell', undefined)),
      totalLabel: isAuctionBid ? t('market.trade.total.bid', undefined) : (dialog.kind === 'buy' ? t('market.trade.total.buy', undefined) : t('market.trade.total.sell', undefined)),
      quantityStep,
      inputMax,
      totalText: totalCost === null ? '--' : `${formatDisplayInteger(totalCost)} ${currencyName}`,
      insufficientCurrency,
      disabled,
      maxButtonDisabled: this.getTradeDialogMaxButtonQuantity(entry, currencyItemId, dialog) <= 0,
      showPricePresets: !isAuctionBid,
      showQuantityControls: !isAuctionBid,
      priceActionDisabled: {
        decrease: isAuctionBid && nextDecreasePrice >= dialog.unitPrice,
        half: isAuctionBid && nextHalfPrice >= dialog.unitPrice,
        increase: dialog.unitPrice >= MARKET_DIALOG_MAX_PRICE,
        double: dialog.unitPrice >= MARKET_DIALOG_MAX_PRICE,
      },
      hintsHtml: hints.join(''),
    };
  }

  /** 渲染交易弹窗，只保存临时输入状态。 */
  private renderTradeDialog(entry: MarketListedItemView, currencyItemId: string, currencyName: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.getTradeDialogViewState(entry, currencyItemId, currencyName);
    if (!state) {
      return '';
    }
    const dialog = state.dialog;
    return `
      <div class="market-trade-modal-shell">
        <div class="market-trade-modal-backdrop" data-market-close-dialog></div>
        <div class="market-trade-dialog market-trade-dialog--${dialog.kind} ${state.source === 'auction-bid' ? 'market-trade-dialog--auction-bid' : ''} ui-surface-pane ui-surface-pane--stack" role="dialog" aria-modal="true">
        <div class="market-trade-dialog-head">
          <div class="market-trade-dialog-title ui-title-block">
            <div class="panel-section-title">${state.title}</div>
            <div class="market-trade-dialog-item market-trade-dialog-item--interactive ui-title-block-subtitle" data-market-item-tooltip="selected">${escapeHtml(this.getMarketDisplayName(entry.item))}</div>
          </div>
          <button class="small-btn ghost" data-market-close-dialog type="button">关闭</button>
        </div>
        <div class="market-trade-dialog-body">
          ${state.showPricePresets
            ? `
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
            `
            : ''}
          <div class="market-trade-dialog-section">
            <div class="market-trade-dialog-field">
              <span>${escapeHtml(t('market.trade.field.unit-price', undefined))}</span>
              <div class="market-price-control-row">
                <div class="market-price-control-side">
                  <button class="small-btn ghost" data-market-price-action="half" type="button" ${state.priceActionDisabled.half ? 'disabled' : ''}>÷2</button>
                  <button class="small-btn ghost" data-market-price-action="decrease" type="button" ${state.priceActionDisabled.decrease ? 'disabled' : ''}>-</button>
                </div>
                <div class="market-price-display" data-market-dialog-price-display>
                  <strong>${this.formatMarketUnitPrice(dialog.unitPrice)}</strong>
                  <span>${escapeHtml(currencyName)}</span>
                </div>
                <div class="market-price-control-side">
                  <button class="small-btn ghost" data-market-price-action="increase" type="button" ${state.priceActionDisabled.increase ? 'disabled' : ''}>+</button>
                  <button class="small-btn ghost" data-market-price-action="double" type="button" ${state.priceActionDisabled.double ? 'disabled' : ''}>x2</button>
                </div>
              </div>
            </div>
          </div>
          <div class="market-trade-dialog-section">
            ${state.showQuantityControls
              ? `
                <div class="market-trade-dialog-field">
                  <span>${escapeHtml(t('market.trade.field.quantity', undefined))}</span>
                  <div class="market-quantity-row">
                    <button class="small-btn ghost" data-market-quantity-action="one" type="button">1</button>
                    <input
                      class="gm-inline-input"
                      data-market-dialog-quantity
                      type="number"
                      inputmode="numeric"
                      min="${state.quantityStep}"
                      step="${state.quantityStep}"
                      max="${state.inputMax}"
                      value="${dialog.quantity}"
                    />
                    <button
                      class="small-btn ghost"
                      data-market-quantity-action="max"
                      type="button"
                      ${state.maxButtonDisabled ? 'disabled' : ''}
                    >${escapeHtml(t('market.trade.action.max', undefined))}</button>
                  </div>
                </div>
              `
              : ''}
            <div class="market-trade-dialog-total ${state.insufficientCurrency ? 'error' : ''}" data-market-dialog-total>
              <span>${escapeHtml(state.totalLabel)}</span>
              <strong>${escapeHtml(state.totalText)}</strong>
            </div>
          </div>
          <div class="market-trade-dialog-hints" data-market-dialog-hints>${state.hintsHtml}</div>
        </div>
        <div class="market-trade-dialog-actions">
          <button class="small-btn ghost" data-market-close-dialog type="button">取消</button>
          <button class="small-btn" data-market-submit-dialog="${dialog.kind}" type="button" ${state.disabled ? 'disabled' : ''}>${state.actionLabel}</button>
        </div>
      </div>
      </div>
    `;
  }

  /** 弹层主体使用委托事件，避免局部 patch 后重复绑定列表和书籍节点。 */
  private bindMarketModalDelegatedEvents(body: HTMLElement, signal: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const actionButton = target.closest<HTMLElement>('[data-market-open-dialog]');
      if (actionButton && body.contains(actionButton)) {
        const kind = actionButton.dataset.marketOpenDialog as MarketTradeDialogKind | undefined;
        const selected = this.getSelectedListedItem(this.marketUpdate);
        if (kind && selected) {
          const presetPrice = this.readDatasetNumber(actionButton.dataset.marketOpenDialogPrice);
          const confirmPurchase = actionButton.dataset.marketOpenDialogConfirmPurchase === 'true';
          this.openTradeDialog(selected, kind, presetPrice, confirmPurchase);
        }
        return;
      }
      if (!tapMode || !(event instanceof PointerEvent)) {
        return;
      }
      const tooltipNode = target.closest<HTMLElement>('[data-market-item-tooltip]');
      if (!tooltipNode || !body.contains(tooltipNode)) {
        return;
      }
      const tooltip = this.resolveMarketTooltipPayload(tooltipNode);
      if (!tooltip) {
        return;
      }
      if (this.tooltip.isPinnedTo(tooltipNode)) {
        this.tooltipNode = null;
        this.tooltip.hide(true);
        return;
      }
      this.tooltipNode = tooltipNode;
      this.tooltip.showPinned(tooltipNode, tooltip.title, tooltip.lines, event.clientX, event.clientY, {
        allowHtml: tooltip.allowHtml,
        asideCards: tooltip.asideCards,
      });
      event.preventDefault();
      event.stopPropagation();
    }, { signal });

    body.addEventListener('pointermove', (event) => {
      if (!(event instanceof PointerEvent) || (tapMode && this.tooltip.isPinned())) {
        return;
      }
      const target = event.target;
      const tooltipNode = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-market-item-tooltip]')
        : null;
      if (!tooltipNode || !body.contains(tooltipNode)) {
        return;
      }
      if (this.tooltipNode !== tooltipNode) {
        const tooltip = this.resolveMarketTooltipPayload(tooltipNode);
        if (!tooltip) {
          return;
        }
        this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        this.tooltipNode = tooltipNode;
        return;
      }
      this.tooltip.move(event.clientX, event.clientY);
    }, { signal });

    body.addEventListener('pointerout', (event) => {
      const target = event.target;
      const tooltipNode = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-market-item-tooltip]')
        : null;
      if (!tooltipNode || !body.contains(tooltipNode) || this.tooltip.isPinnedTo(tooltipNode)) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && tooltipNode.contains(relatedTarget)) {
        return;
      }
      if (this.tooltipNode === tooltipNode) {
        this.tooltipNode = null;
        this.tooltip.hide();
      }
    }, { signal });
  }

  /** 给会显示物品提示的节点绑定悬浮逻辑。 */
  private bindItemTooltipEvents(body: HTMLElement, signal?: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nodes = body.querySelectorAll<HTMLElement>('[data-market-item-tooltip]');
    if (nodes.length === 0) {
      return;
    }
    const tapMode = prefersPinnedTooltipInteraction();
    const listenerOptions = signal ? { signal } : undefined;
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
      }, listenerOptions);

      node.addEventListener('pointermove', (event) => {
        if (!(event instanceof PointerEvent) || (tapMode && this.tooltip.isPinned())) {
          return;
        }
        if (this.tooltipNode !== node) {
          showTooltip(node, event);
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      }, listenerOptions);

      node.addEventListener('pointerleave', () => {
        if (this.tooltip.isPinnedTo(node)) {
          return;
        }
        if (this.tooltipNode === node) {
          this.tooltipNode = null;
          this.tooltip.hide();
        }
      }, listenerOptions);
    });
  }

  /** 读取当前已打开的市场弹层 body。 */
  private getOpenModalBody(): HTMLElement | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  /** 读取当前已打开的拍卖行弹层 body。 */
  private getOpenAuctionModalBody(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  /** 读取坊市页内拍卖简报数据。 */
  private getAuctionPaneStats(update: S2C_MarketUpdate | null): {
    activeLots: number;
    myBids: number;
    myConsignments: number;
    storageCount: number;
    feed: Array<{ status: string; name: string; meta: string }>;
  } {
    if (!update) {
      return {
        activeLots: 0,
        myBids: 0,
        myConsignments: 0,
        storageCount: 0,
        feed: [],
      };
    }
    const lots = this.auctionListings?.tab === 'participate' ? this.getCurrentAuctionLots() : [];
    const summary = this.getAuctionSummary(update);
    return {
      activeLots: summary.activeLots,
      myBids: summary.myBidCount,
      myConsignments: summary.myConsignments,
      storageCount: summary.storageCount,
      feed: lots.slice(0, 3).map((lot) => ({
        status: lot.buyoutPrice === null
          ? t('market.auction.feed.status.bid', undefined)
          : t('market.auction.feed.status.buyout', undefined),
        name: lot.itemName,
        meta: `${this.formatMarketUnitPrice(lot.currentPrice)} ${update.currencyItemName}`,
      })),
    };
  }

  /** 同步拍卖行当前选中项。 */
  private syncAuctionSelection(): void {
    if (!this.marketUpdate) {
      this.selectedAuctionItemKey = null;
      return;
    }
    const lots = this.getCurrentAuctionLots();
    if (lots.length === 0) {
      this.selectedAuctionItemKey = null;
      this.selectedItemKey = null;
      return;
    }
    const selected = lots.some((lot) => lot.id === this.selectedAuctionItemKey)
      ? this.selectedAuctionItemKey
      : lots[0].id;
    if (selected !== this.selectedAuctionItemKey) {
      this.selectedAuctionItemKey = selected;
      this.itemBook = null;
    }
    const selectedLot = lots.find((lot) => lot.id === this.selectedAuctionItemKey) ?? null;
    this.selectedItemKey = selectedLot?.itemKey ?? null;
  }

  /** 读取服务端拍卖行当前分页状态。 */
  private getAuctionPageState(items: ArrayLike<unknown>): {
    page: number;
    totalPages: number;
    totalItems: number;
  } {
    const pageSize = this.auctionListings?.pageSize ?? AUCTION_PAGE_SIZE;
    const totalItems = this.auctionListings?.total ?? items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
    const page = this.auctionListings?.page ?? Math.max(1, Math.min(totalPages, Math.floor(Number.isFinite(this.auctionPage) ? this.auctionPage : 1)));
    this.auctionPage = page;
    return {
      page,
      totalPages,
      totalItems,
    };
  }

  /** 读取当前服务端返回的拍卖行当前页拍品。 */
  private getCurrentAuctionLots(): AuctionLotView[] {
    if (!this.auctionListings || this.auctionListings.tab !== this.auctionTab) {
      return [];
    }
    return this.auctionListings.items.map((entry) => this.inflateAuctionLotEntry(entry));
  }

  /** 按 key 查找拍品。 */
  private resolveAuctionLotByKey(
    lotId: string | null | undefined,
    _update: S2C_MarketUpdate | null,
    tab: AuctionHouseTab = this.auctionTab,
  ): AuctionLotView | null {
    if (!lotId || !this.auctionListings || this.auctionListings.tab !== tab) {
      return null;
    }
    const lots = this.auctionListings.items.map((entry) => this.inflateAuctionLotEntry(entry));
    return lots.find((lot) => lot.id === lotId || lot.itemKey === lotId) ?? null;
  }

  /** 把拍卖行分页摘要恢复成 UI 拍品视图。 */
  private inflateAuctionLotEntry(entry: AuctionLotPageEntry): AuctionLotView {
    const item = entry.item ?? resolvePreviewItem({
      itemId: entry.itemId,
      count: 1,
      name: '',
      desc: '',
      type: entry.itemType,
      equipSlot: entry.itemType === 'equipment' ? entry.itemSubType as EquipSlot | undefined : undefined,
      enhanceLevel: entry.enhanceLevel,
    });
    return {
      id: entry.id,
      itemKey: entry.itemKey,
      item,
      itemName: this.getMarketDisplayName(item),
      typeLabel: getItemTypeLabel(item.type),
      qualityLabel: this.getAuctionQualityLabel(item),
      currentPrice: Math.max(1, Math.floor(Number(entry.currentPrice) || 1)),
      buyoutPrice: entry.buyoutPrice === null || entry.buyoutPrice === undefined ? null : Math.max(1, Math.floor(Number(entry.buyoutPrice) || 1)),
      bidCount: Math.max(0, Math.floor(Number(entry.bidCount) || 0)),
      bids: Array.isArray(entry.bids) ? entry.bids : [],
      startAtMs: Math.max(0, Math.floor(Number(entry.startAtMs) || Date.now())),
      durationSeconds: Math.max(1, Math.floor(Number(entry.durationSeconds) || 1)),
      status: entry.status,
      statusLabel: entry.statusLabel,
      sellerLabel: entry.sellerLabel,
      lotNo: entry.lotNo,
      heat: Math.max(0, Math.floor(Number(entry.heat) || 0)),
      orderId: entry.orderId,
      orderSide: entry.orderSide,
      remainingQuantity: entry.remainingQuantity,
    };
  }

  /** 把当前拍品转换成市场交易弹窗可复用的列表条目。 */
  private buildMarketListingFromAuctionLot(lot: AuctionLotView): MarketListedItemView {
    return {
      itemKey: lot.itemKey,
      item: lot.item,
      sellOrderCount: lot.buyoutPrice === null ? 0 : 1,
      sellQuantity: lot.remainingQuantity ?? 0,
      lowestSellPrice: lot.buyoutPrice ?? undefined,
      buyOrderCount: lot.bidCount,
      buyQuantity: lot.bidCount,
      highestBuyPrice: lot.currentPrice,
    };
  }

  /** 根据开始时间和持续时间在前端计算剩余秒数，不依赖网络同步。 */
  private getAuctionRemainingSeconds(lot: AuctionLotView, now = Date.now()): number {
    const endAtMs = lot.startAtMs + lot.durationSeconds * 1000;
    return Math.max(0, Math.ceil((endAtMs - now) / 1000));
  }

  /** 读取倒计时状态样式。 */
  private getAuctionTimeClass(remainingSeconds: number): string {
    if (remainingSeconds <= 0) {
      return 'ended';
    }
    if (remainingSeconds <= 1800) {
      return 'urgent';
    }
    return '';
  }

  /** 启动拍卖行本地倒计时，只 patch 倒计时文本。 */
  private startAuctionCountdownTicker(): void {
    if (this.auctionCountdownTimer !== null || typeof window === 'undefined') {
      return;
    }
    this.auctionCountdownTimer = window.setInterval(() => {
      this.patchAuctionCountdowns();
    }, 1000);
  }

  /** 停止拍卖行本地倒计时。 */
  private stopAuctionCountdownTicker(): void {
    if (this.auctionCountdownTimer === null || typeof window === 'undefined') {
      return;
    }
    window.clearInterval(this.auctionCountdownTimer);
    this.auctionCountdownTimer = null;
  }

  /** 局部 patch 当前可见拍品的倒计时，不重绘列表或详情。 */
  private patchAuctionCountdowns(): void {
    const body = this.getOpenAuctionModalBody();
    const update = this.marketUpdate;
    if (!body || !update) {
      this.stopAuctionCountdownTicker();
      return;
    }
    const now = Date.now();
    body.querySelectorAll<HTMLElement>('[data-auction-countdown]').forEach((node) => {
      const lot = this.resolveAuctionLotByKey(node.dataset.auctionCountdown, update, this.auctionTab);
      if (!lot) {
        return;
      }
      const remainingSeconds = this.getAuctionRemainingSeconds(lot, now);
      node.textContent = this.formatAuctionRemaining(remainingSeconds);
      node.classList.toggle('urgent', remainingSeconds > 0 && remainingSeconds <= 1800);
      node.classList.toggle('ended', remainingSeconds <= 0);
    });
  }

  /** 读取拍品品质显示。 */
  private getAuctionQualityLabel(item: ItemStack): string {
    const grade = typeof item.grade === 'string' && item.grade.trim() ? item.grade.trim() : '';
    if (grade) {
      return grade;
    }
    const level = Number(item.level);
    if (Number.isFinite(level) && level > 0) {
      return `${formatDisplayInteger(Math.floor(level))}阶`;
    }
    return '凡品';
  }

  /** 读取拍品头像占位字。 */
  private getAuctionItemInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.slice(0, 1) : '拍';
  }

  /** 格式化拍卖剩余时间。 */
  private formatAuctionRemaining(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
    }
    return `${pad(minutes)}:${pad(rest)}`;
  }

  /** 格式化拍卖出价时间，只用于当前页轻量记录。 */
  private formatAuctionBidTime(createdAtMs: number): string {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Math.max(0, Number(createdAtMs) || 0)) / 1000));
    if (elapsedSeconds < 60) {
      return '刚刚';
    }
    if (elapsedSeconds < 3600) {
      return `${formatDisplayInteger(Math.floor(elapsedSeconds / 60))}分钟前`;
    }
    return `${formatDisplayInteger(Math.floor(elapsedSeconds / 3600))}小时前`;
  }

  /** 读取服务端拍卖行摘要，未返回前只用本地已知的订单/托管仓兜底。 */
  private getAuctionSummary(update: S2C_MarketUpdate): S2C_AuctionListings['summary'] {
    return this.auctionListings?.summary ?? {
      activeLots: 0,
      buyoutLots: 0,
      totalCurrentPrice: 0,
      myBidCount: 0,
      myConsignments: 0,
      consigningLots: 0,
      soldLots: 0,
      failedLots: 0,
      storageCount: update.storage.items.reduce((sum, item) => sum + item.count, 0),
    };
  }

  /** 读取服务端拍卖行分类计数。 */
  private getAuctionCategoryCount(category: MarketCategoryFilter, fallback: number): number {
    return this.normalizeMarketCount(this.auctionListings?.counts?.categoryCounts?.[category], fallback);
  }

  /** 只同步当前可见区域里的背包相关状态。 */
  private syncVisibleMarketInventoryState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.modalTab !== 'market') {
      return;
    }
    const body = this.getOpenModalBody();
    if (!body) {
      return;
    }
    const groupByItemId = new Map(this.getVisibleListingGroups(this.marketUpdate).map((entry) => [entry.itemId, entry] as const));
    body.querySelectorAll<HTMLElement>('[data-market-select-group]').forEach((button) => {
      const itemId = button.dataset.marketSelectGroup;
      if (!itemId) {
        return;
      }
      const group = groupByItemId.get(itemId) ?? null;
      const ownedCount = group?.canEnhance
        ? this.findEquipmentInventoryCountByLevel(itemId, 0)
        : this.findInventoryItemCountByItemId(itemId);
      this.syncOwnedBadge(button, ownedCount);
    });
    body.querySelectorAll<HTMLElement>('[data-market-select-item]').forEach((button) => {
      const itemKey = button.dataset.marketSelectItem;
      const entry = itemKey
        ? this.getKnownListedItems(this.marketUpdate).find((item) => item.itemKey === itemKey) ?? null
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    patchElementHtml(bookPanel, this.renderBookPanel(selected, orderBook, update.currencyItemName));
  }

  /** 局部更新列表选中态，不重建当前 hover 的列表节点。 */
  private patchMarketActiveSelection(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.modalTab !== 'market') {
      return;
    }
    const body = this.getOpenModalBody();
    if (!body) {
      return;
    }
    body.querySelectorAll<HTMLElement>('[data-market-select-item]').forEach((button) => {
      button.classList.toggle('active', button.dataset.marketSelectItem === this.selectedItemKey);
    });
    body.querySelectorAll<HTMLElement>('[data-market-select-group]').forEach((button) => {
      button.classList.toggle('active', button.dataset.marketSelectGroup === this.selectedGroupItemId);
    });
  }

  /** 读取当前选中的列表物品。 */
  private getSelectedListedItem(update: S2C_MarketUpdate | null): MarketListedItemView | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedItemKey) {
      return null;
    }
    const selected = this.findListingVariantByKey(this.selectedItemKey, update);
    if (selected) {
      return selected;
    }
    const auctionLot = this.getCurrentAuctionLots().find((lot) => lot.itemKey === this.selectedItemKey || lot.id === this.selectedAuctionItemKey) ?? null;
    return auctionLot ? this.buildMarketListingFromAuctionLot(auctionLot) : null;
  }

  /** 渲染主分类标签。 */
  private renderCategoryTabs(update: S2C_MarketUpdate): string {
    const listedItems = this.getKnownListedItems(update);
    const categories: Array<{
    /**
 * id：ID标识。
 */
 id: MarketCategoryFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * count：数量或计量字段。
 */
 count: number }> = [
      { id: 'all', label: t('market.filter.all', undefined), count: this.getMarketCategoryCount('all', listedItems.length) },
      ...ITEM_TYPES.map((type) => ({
        id: type,
        label: getItemTypeLabel(type),
        count: this.getMarketCategoryCount(type, listedItems.filter((item) => item.item.type === type).length),
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
  private renderEquipmentTabs(update: S2C_MarketUpdate): string {
    const listedItems = this.getKnownListedItems(update);
    const categories: Array<{
    /**
 * id：ID标识。
 */
 id: MarketEquipmentFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * count：数量或计量字段。
 */
 count: number }> = [
      {
        id: 'all',
        label: t('market.filter.equipment-all', undefined),
        count: this.getMarketEquipmentSlotCount('all', listedItems.filter((item) => item.item.type === 'equipment').length),
      },
      ...EQUIP_SLOTS.map((slot) => ({
        id: slot,
        label: getEquipSlotLabel(slot),
        count: this.getMarketEquipmentSlotCount(slot, listedItems.filter((item) => item.item.type === 'equipment' && item.item.equipSlot === slot).length),
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
  private renderTechniqueTabs(update: S2C_MarketUpdate): string {
    const listedItems = this.getKnownListedItems(update);
    const categories = MARKET_TECHNIQUE_FILTERS.map((category) => ({
      ...category,
      count: this.getMarketTechniqueCategoryCount(category.id, listedItems.filter((item) => (
        item.item.type === 'skill_book'
        && (category.id === 'all' || this.resolveTechniqueCategoryForItem(item.item) === category.id)
      )).length),
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

  /** 读取服务端主分类计数，兼容旧包回退到本地已知条目。 */
  private getMarketCategoryCount(category: MarketCategoryFilter, fallback: number): number {
    return this.normalizeMarketCount(this.marketListings?.counts?.categoryCounts?.[category], fallback);
  }

  /** 读取服务端装备子分类计数，兼容旧包回退到本地已知条目。 */
  private getMarketEquipmentSlotCount(slot: MarketEquipmentFilter, fallback: number): number {
    return this.normalizeMarketCount(this.marketListings?.counts?.equipmentSlotCounts?.[slot], fallback);
  }

  /** 读取服务端功法书子分类计数，兼容旧包回退到本地已知条目。 */
  private getMarketTechniqueCategoryCount(category: MarketTechniqueFilter, fallback: number): number {
    return this.normalizeMarketCount(this.marketListings?.counts?.techniqueCategoryCounts?.[category], fallback);
  }

  /** 规范化坊市分类计数，避免异常 payload 污染 UI。 */
  private normalizeMarketCount(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(0, Math.floor(numeric));
  }

  /** 按当前分类筛选出可见列表物品。 */
  private getVisibleListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!update) {
      return [];
    }
    let items = this.getCurrentListingsPageItems();
    if (items.length <= 0) {
      items = this.getKnownListedItems(update);
    }
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
  private getPaginationState<T>(items: T[]): {
  /**
 * page：page相关字段。
 */

    page: number;
    /**
 * totalPages：totalPage相关字段。
 */

    totalPages: number;
    /**
 * totalItems：数量或计量字段。
 */

    totalItems: number;
    /**
 * items：集合字段。
 */

    items: T[];
  } {
    const totalItems = this.getVisibleMarketTotalItems(this.marketUpdate, items);
    const pageSize = this.marketListings?.pageSize ?? this.getMarketPageSize();
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = this.marketListings?.page ?? this.clampPage(this.currentPage, totalItems);
    this.currentPage = page;
    return {
      page,
      totalPages,
      totalItems,
      items,
    };
  }

  /** 把当前页平铺条目按物品 id 聚合成分组视图。 */
  private getVisibleListingGroups(update: S2C_MarketUpdate | null): MarketListingGroupView[] {
    const items = this.getVisibleListedItems(update);
    const groups = new Map<string, MarketListingGroupView>();
    const orderedItemIds: string[] = [];
    for (const entry of items) {
      const existing = groups.get(entry.item.itemId);
      if (existing) {
        existing.variants.push(entry);
        continue;
      }
      orderedItemIds.push(entry.item.itemId);
      groups.set(entry.item.itemId, {
        itemId: entry.item.itemId,
        item: { ...entry.item },
        canEnhance: entry.item.type === 'equipment',
        variants: [entry],
      });
    }
    return orderedItemIds.map((itemId) => {
      const group = groups.get(itemId)!;
      if (group.canEnhance) {
        const variantsByLevel = new Map<number, MarketListedItemView>();
        for (const entry of group.variants) {
          const level = this.getMarketEnhanceLevel(entry.item);
          if (level < 0 || level > MAX_ENHANCE_LEVEL) {
            continue;
          }
          variantsByLevel.set(level, entry);
        }
        const filledVariants: MarketListedItemView[] = [];
        for (let level = 0; level <= MAX_ENHANCE_LEVEL; level += 1) {
          const existing = variantsByLevel.get(level);
          if (existing) {
            filledVariants.push(existing);
            continue;
          }
          const item = this.buildLocalMarketItem(group.itemId, 1, level);
          filledVariants.push({
            itemKey: createItemStackSignature({ ...item, count: 1 }),
            item,
            sellOrderCount: 0,
            sellQuantity: 0,
            lowestSellPrice: undefined,
            buyOrderCount: 0,
            buyQuantity: 0,
            highestBuyPrice: undefined,
          });
        }
        group.variants = filledVariants;
      } else {
        group.variants.sort((left, right) => {
          const leftLevel = this.getMarketEnhanceLevel(left.item);
          const rightLevel = this.getMarketEnhanceLevel(right.item);
          if (leftLevel !== rightLevel) {
            return leftLevel - rightLevel;
          }
          return left.itemKey.localeCompare(right.itemKey);
        });
      }
      const referenceEntry = this.getGroupReferenceEntry(group);
      if (referenceEntry) {
        group.item = { ...referenceEntry.item };
      }
      return group;
    });
  }

  /** 分组展示优先用 +0 条目，没有再退到当前第一条。 */
  private getGroupReferenceEntry(group: MarketListingGroupView): MarketListedItemView | null {
    return group.variants.find((entry) => this.getMarketEnhanceLevel(entry.item) === 0) ?? group.variants[0] ?? null;
  }

  /** 按 key 读取市场条目，包含本地补出的强化档位。 */
  private findListingVariantByKey(itemKey: string | null | undefined, update: S2C_MarketUpdate | null = this.marketUpdate): MarketListedItemView | null {
    if (!itemKey) {
      return null;
    }
    const listed = this.getKnownListedItems(update).find((entry) => entry.itemKey === itemKey) ?? null;
    if (listed) {
      return listed;
    }
    for (const group of this.getVisibleListingGroups(update)) {
      const variant = group.variants.find((entry) => entry.itemKey === itemKey) ?? null;
      if (variant) {
        return variant;
      }
    }
    return null;
  }

  /** 把页码夹到合法范围内。 */
  private clampPage(page: number, totalItems: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const totalPages = Math.max(1, Math.ceil(totalItems / this.getMarketPageSize()));
    if (!Number.isFinite(page)) {
      return 1;
    }
    return Math.max(1, Math.min(totalPages, Math.floor(page)));
  }

  /** 读取服务端当前页已经分页好的坊市条目。 */
  private getCurrentListingsPageItems(): MarketListedItemView[] {
    return (this.marketListings?.items ?? []).map((entry) => this.inflateMarketListingEntry(entry));
  }

  /** 用本地静态模板补一个市场预览物品，供缺失盘口的强化档位占位。 */
  private buildLocalMarketItem(itemId: string, count = 1, enhanceLevel?: number): ItemStack {
    const template = getLocalItemTemplate(itemId);
    if (!template) {
      return {
        itemId,
        count,
        name: itemId,
        type: 'material',
        desc: '',
        enhanceLevel,
      };
    }
    return {
      itemId,
      count,
      name: template.name,
      type: template.type,
      desc: template.desc ?? '',
      groundLabel: template.groundLabel,
      grade: template.grade,
      level: template.level,
      equipSlot: template.equipSlot,
      equipAttrs: template.equipAttrs,
      equipStats: template.equipStats,
      equipValueStats: template.equipValueStats,
      effects: template.effects,
      healAmount: template.healAmount,
      healPercent: template.healPercent,
      qiPercent: template.qiPercent,
      cooldown: template.cooldown,
      consumeBuffs: template.consumeBuffs,
      tags: template.tags,
      enhanceLevel: enhanceLevel ?? template.enhanceLevel,
      mapUnlockId: template.mapUnlockId,
      mapUnlockIds: template.mapUnlockIds,
      respawnBindMapId: template.respawnBindMapId,
      tileAuraGainAmount: template.tileAuraGainAmount,
      tileResourceGains: template.tileResourceGains,
      allowBatchUse: template.allowBatchUse,
    };
  }

  /** 把列表摘要恢复成客户端可直接渲染的预览物品。 */
  private inflateMarketListingEntry(entry: S2C_MarketListings['items'][number]): MarketListedItemView {
    const previewItem = entry.item ?? resolvePreviewItem({
      itemId: entry.itemId,
      count: 1,
      name: '',
      desc: '',
      type: entry.itemType,
      equipSlot: entry.itemType === 'equipment' ? entry.itemSubType as EquipSlot | undefined : undefined,
      enhanceLevel: entry.enhanceLevel,
    });
    return {
      itemKey: entry.itemKey,
      item: previewItem,
      sellOrderCount: 0,
      sellQuantity: 0,
      lowestSellPrice: entry.lowestSellPrice,
      buyOrderCount: 0,
      buyQuantity: 0,
      highestBuyPrice: entry.highestBuyPrice,
    };
  }

  /** 读取当前分类下的总条目数，优先使用服务端分页总量。 */
  private getVisibleMarketTotalItems(
    update: S2C_MarketUpdate | null,
    currentPageItems?: ArrayLike<unknown>,
  ): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.marketListings) {
      return Math.max(0, Math.floor(Number.isFinite(this.marketListings.total) ? this.marketListings.total : 0));
    }
    return (currentPageItems ?? this.getVisibleListedItems(update)).length;
  }

  /** 根据视口和布局模式选择分页大小。 */
  private getMarketPageSize(): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.type !== 'skill_book') {
      return null;
    }
    return getLocalTechniqueCategoryForBookItem(item.itemId);
  }

  /** 保证当前页里总有一个可见物品处于选中状态。 */
  private syncPageSelection(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const visibleGroups = this.getVisibleListingGroups(this.marketUpdate);
    const pagination = this.getPaginationState(visibleGroups);
    const currentGroups = pagination.items;
    const hasSelectedGroup = currentGroups.some((item) => item.itemId === this.selectedGroupItemId);
    this.selectedGroupItemId = hasSelectedGroup ? this.selectedGroupItemId : currentGroups[0]?.itemId ?? null;
    const selectedGroup = currentGroups.find((item) => item.itemId === this.selectedGroupItemId) ?? currentGroups[0] ?? null;
    if (!selectedGroup) {
      this.enhancementBrowseItemId = null;
      this.selectedItemKey = null;
      this.itemBook = null;
      return;
    }
    const browsingEnhancementVariants = selectedGroup.canEnhance && this.enhancementBrowseItemId === selectedGroup.itemId;
    if (!selectedGroup.canEnhance) {
      this.enhancementBrowseItemId = null;
    }
    const nextSelected = browsingEnhancementVariants
      ? (selectedGroup.variants.some((item) => item.itemKey === this.selectedItemKey) ? this.selectedItemKey : null)
      : (selectedGroup.canEnhance ? null : selectedGroup.variants[0]?.itemKey ?? null);
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
    const cached = this.itemBookCache.get(itemKey);
    if (cached) {
      this.itemBook = cached;
      this.itemBookLoading = false;
      return;
    }
    if (this.pendingItemBookKeys.has(itemKey)) {
      this.itemBookLoading = true;
      return;
    }
    this.itemBookLoading = true;
    this.pendingItemBookKeys.add(itemKey);
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

  /** 向外部请求当前筛选条件下的拍卖行分页，每页固定最多 10 条。 */
  private requestAuctionListings(page: number): void {
    const nextPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    this.auctionPage = nextPage;
    this.callbacks?.onRequestAuctionListings({
      tab: this.auctionTab,
      page: nextPage,
      pageSize: AUCTION_PAGE_SIZE,
      category: this.auctionCategory,
      query: this.auctionSearchQuery.trim(),
    });
  }

  /** 把列表分页回填进市场主快照。 */
  private mergeListingsIntoMarketUpdate(update: S2C_MarketUpdate | null, data: S2C_MarketListings): S2C_MarketUpdate | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const entries = data.items.map((entry) => this.inflateMarketListingEntry(entry));
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
  private openTradeDialog(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null, confirmPurchase = false): void {
    const unitPrice = this.getDefaultTradeDialogPrice(entry, kind, preferredPrice);
    this.tradeDialog = {
      kind,
      source: 'market',
      quantity: this.normalizeTradeDialogQuantity(1, entry, kind, unitPrice),
      unitPrice,
      confirmPurchase: kind === 'buy' && confirmPurchase,
    };
    this.syncTradeDialogOverlay();
  }

  /** 打开拍卖加价弹窗，最低价固定为当前价按坊市档位加一档。 */
  private openAuctionBidDialog(entry: MarketListedItemView, lot: AuctionLotView): void {
    const minUnitPrice = this.getAuctionMinimumBidPrice(lot);
    this.tradeDialog = {
      kind: 'buy',
      source: 'auction-bid',
      quantity: this.getTradeDialogQuantityStep(minUnitPrice),
      unitPrice: minUnitPrice,
      minUnitPrice,
    };
    this.syncTradeDialogOverlay();
  }

  /** 打开拍卖一口价确认弹窗，不经过价格输入。 */
  private openAuctionBuyoutConfirm(entry: MarketListedItemView, lot: AuctionLotView): void {
    if (lot.buyoutPrice === null) {
      return;
    }
    const unitPrice = this.normalizeTradeDialogPrice(lot.buyoutPrice, 'up');
    const quantity = this.normalizeTradeDialogQuantity(1, entry, 'buy', unitPrice);
    const totalCost = this.getMarketTradeTotalCost(quantity, unitPrice);
    const currencyItemName = this.marketUpdate?.currencyItemName ?? '';
    const ownedCurrency = this.findInventoryItemCountByItemId(this.marketUpdate?.currencyItemId ?? '');
    const insufficientCurrency = totalCost !== null && totalCost > ownedCurrency;
    this.buyConfirmState = { itemKey: entry.itemKey, quantity, unitPrice };
    confirmModalHost.open({
      ownerId: MarketPanel.CONFIRM_MODAL_OWNER,
      title: t('auction.action.buyout', undefined),
      subtitle: this.getMarketDisplayName(entry.item),
      bodyHtml: this.renderAuctionBuyoutConfirmBody(lot, currencyItemName, quantity, unitPrice, totalCost, insufficientCurrency),
      confirmLabel: t('auction.action.buyout', undefined),
      confirmDisabled: insufficientCurrency || totalCost === null,
      onConfirm: () => {
        this.buyConfirmState = null;
        this.callbacks?.onBuyoutAuctionLot(lot.id, lot.itemKey);
        this.tradeDialog = null;
        this.syncTradeDialogOverlay();
      },
      onClose: () => {
        this.buyConfirmState = null;
      },
    });
  }

  /** 渲染购买确认页，说明直接成交和剩余求购挂单的预估。 */
  private renderBuyConfirmBody(entry: MarketListedItemView, currencyName: string, quantity: number, unitPrice: number): string {
    const estimate = this.estimateImmediateBuy(entry, quantity, unitPrice);
    const maxReservedCost = this.getMarketTradeTotalCost(quantity, unitPrice);
    const summary = estimate.immediateQuantity > 0
      ? estimate.pendingQuantity > 0
        ? t('market.trade.buy-confirm.summary.split', {
          immediateQuantity: formatDisplayInteger(estimate.immediateQuantity),
          pendingQuantity: formatDisplayInteger(estimate.pendingQuantity),
        })
        : t('market.trade.buy-confirm.summary.direct', {
          immediateQuantity: formatDisplayInteger(estimate.immediateQuantity),
        })
      : t('market.trade.buy-confirm.summary.pending', undefined);
    return `
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>${escapeHtml(t('market.trade.buy-confirm.quantity', undefined))}</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(quantity)}</strong>
            <span>${escapeHtml(t('market.trade.buy-confirm.unit-price', {
              unitPrice: this.formatMarketUnitPrice(unitPrice),
              currencyName,
            }))}</span>
          </div>
        </div>
        <div class="market-trade-dialog-total">
          <span>${escapeHtml(t('market.trade.buy-confirm.max-reserved', undefined))}</span>
          <strong>${maxReservedCost === null ? '--' : `${formatDisplayInteger(maxReservedCost)} ${escapeHtml(currencyName)}`}</strong>
        </div>
      </div>
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>${escapeHtml(t('market.trade.buy-confirm.estimate', undefined))}</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(estimate.immediateQuantity)}</strong>
            <span>${escapeHtml(t('market.trade.buy-confirm.immediate', undefined))}</span>
          </div>
        </div>
        <div class="market-trade-dialog-total ${estimate.pendingQuantity > 0 ? '' : 'hidden'}">
          <span>${escapeHtml(t('market.trade.buy-confirm.pending', undefined))}</span>
          <strong>${escapeHtml(t('market.trade.buy-confirm.pending-count', { count: formatDisplayInteger(estimate.pendingQuantity) }))}</strong>
        </div>
      </div>
      <div class="market-action-hint">${escapeHtml(summary)}</div>
      <div class="market-action-hint ${estimate.immediateQuantity > 0 ? '' : 'hidden'}">${escapeHtml(t('market.trade.buy-confirm.refund-hint', undefined))}</div>
    `;
  }

  /** 渲染拍卖一口价确认内容，不提供价格或数量输入。 */
  private renderAuctionBuyoutConfirmBody(
    lot: AuctionLotView,
    currencyName: string,
    quantity: number,
    unitPrice: number,
    totalCost: number | null,
    insufficientCurrency: boolean,
  ): string {
    return `
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>一口价</span>
          <div class="market-price-display">
            <strong>${this.formatMarketUnitPrice(unitPrice)}</strong>
            <span>${escapeHtml(currencyName)}</span>
          </div>
        </div>
        <div class="market-trade-dialog-total">
          <span>${escapeHtml(t('market.trade.buyout-confirm.lot-no', undefined))}</span>
          <strong>${escapeHtml(lot.lotNo)}</strong>
        </div>
      </div>
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-total">
          <span>${escapeHtml(t('market.trade.buyout-confirm.quantity', undefined))}</span>
          <strong>${escapeHtml(t('market.trade.buyout-confirm.quantity-value', { count: formatDisplayInteger(quantity) }))}</strong>
        </div>
        <div class="market-trade-dialog-total ${insufficientCurrency ? 'error' : ''}">
          <span>${escapeHtml(t('market.trade.buyout-confirm.total', undefined))}</span>
          <strong>${totalCost === null ? '--' : `${formatDisplayInteger(totalCost)} ${escapeHtml(currencyName)}`}</strong>
        </div>
      </div>
      <div class="market-action-hint ${insufficientCurrency ? 'market-action-hint--error' : ''}">
        ${escapeHtml(insufficientCurrency
          ? t('market.trade.buyout-confirm.insufficient', { currencyName })
          : t('market.trade.buyout-confirm.ready', undefined))}
      </div>
    `;
  }

  /** 按当前卖盘估算本次购买会立即成交多少。 */
  private estimateImmediateBuy(entry: MarketListedItemView, quantity: number, unitPrice: number): {
    immediateQuantity: number;
    pendingQuantity: number;
  } {
    const book = this.itemBook;
    if (!book || book.itemKey !== entry.itemKey) {
      return {
        immediateQuantity: 0,
        pendingQuantity: quantity,
      };
    }
    let remaining = quantity;
    let immediateQuantity = 0;
    for (const level of book.sells) {
      if (remaining <= 0 || level.unitPrice > unitPrice) {
        break;
      }
      const matched = Math.min(remaining, level.quantity);
      if (matched <= 0) {
        continue;
      }
      immediateQuantity += matched;
      remaining -= matched;
    }
    return {
      immediateQuantity,
      pendingQuantity: Math.max(0, remaining),
    };
  }

  /** 根据当前临时态同步交易弹窗浮层。 */
  private syncTradeDialogOverlay(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const root = this.getTradeDialogOverlayRoot();
    const update = this.marketUpdate;
    const selected = this.getSelectedListedItem(update);
    const marketModalOpen = this.modalTab === 'market' && detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER);
    const auctionModalOpen = detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER);
    if (!this.tradeDialog || (!marketModalOpen && !auctionModalOpen) || !update || !selected) {
      patchElementHtml(root, '');
      root.classList.add('hidden');
      delete root.dataset.marketDialogItemKey;
      delete root.dataset.marketDialogKind;
      delete root.dataset.marketDialogSource;
      this.tooltipNode = null;
      this.tooltip.hide(true);
      return;
    }

    root.classList.remove('hidden');
    if (this.patchTradeDialogOverlay(root, selected, update)) {
      return;
    }
    patchElementHtml(root, this.renderTradeDialog(selected, update.currencyItemId, update.currencyItemName));
    root.dataset.marketDialogItemKey = selected.itemKey;
    root.dataset.marketDialogKind = this.tradeDialog.kind;
    root.dataset.marketDialogSource = this.tradeDialog.source ?? 'market';
    this.bindTradeDialogOverlayEvents(root, selected, update);
    this.bindItemTooltipEvents(root);
  }

  /** 同一物品和方向下只 patch 交易浮层动态值，避免输入框被重建。 */
  private patchTradeDialogOverlay(
    root: HTMLElement,
    selected: MarketListedItemView,
    update: S2C_MarketUpdate,
  ): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.getTradeDialogViewState(selected, update.currencyItemId, update.currencyItemName);
    if (
      !state
      || root.dataset.marketDialogItemKey !== selected.itemKey
      || root.dataset.marketDialogKind !== state.dialog.kind
      || root.dataset.marketDialogSource !== state.source
    ) {
      return false;
    }
    const dialogNode = root.querySelector<HTMLElement>('.market-trade-dialog');
    const priceDisplay = root.querySelector<HTMLElement>('[data-market-dialog-price-display]');
    const quantityInput = root.querySelector<HTMLInputElement>('[data-market-dialog-quantity]');
    const maxButton = root.querySelector<HTMLButtonElement>('[data-market-quantity-action="max"]');
    const totalNode = root.querySelector<HTMLElement>('[data-market-dialog-total]');
    const totalValue = totalNode?.querySelector<HTMLElement>('strong') ?? null;
    const totalLabel = totalNode?.querySelector<HTMLElement>('span') ?? null;
    const hintsNode = root.querySelector<HTMLElement>('[data-market-dialog-hints]');
    const submitButton = root.querySelector<HTMLButtonElement>('[data-market-submit-dialog]');
    if (
      !dialogNode
      || !priceDisplay
      || !totalNode
      || !totalValue
      || !totalLabel
      || !hintsNode
      || !submitButton
      || (state.showQuantityControls && (!quantityInput || !maxButton))
    ) {
      return false;
    }

    dialogNode.classList.toggle('market-trade-dialog--buy', state.dialog.kind === 'buy');
    dialogNode.classList.toggle('market-trade-dialog--sell', state.dialog.kind === 'sell');
    dialogNode.classList.toggle('market-trade-dialog--auction-bid', state.source === 'auction-bid');
    patchElementHtml(priceDisplay, `
      <strong>${escapeHtml(this.formatMarketUnitPrice(state.dialog.unitPrice))}</strong>
      <span>${escapeHtml(update.currencyItemName)}</span>
    `);
    root.querySelectorAll<HTMLButtonElement>('[data-market-price-preset]').forEach((button) => {
      const preset = this.readDatasetNumber(button.dataset.marketPricePreset);
      button.classList.toggle('active', preset === state.dialog.unitPrice);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-market-price-action]').forEach((button) => {
      const action = button.dataset.marketPriceAction as MarketPriceAction | undefined;
      if (!action) {
        return;
      }
      button.disabled = state.priceActionDisabled[action] === true;
    });
    if (state.showQuantityControls && quantityInput && maxButton) {
      quantityInput.min = String(state.quantityStep);
      quantityInput.step = String(state.quantityStep);
      quantityInput.max = String(state.inputMax);
      if (document.activeElement !== quantityInput) {
        quantityInput.value = String(state.dialog.quantity);
      }
      maxButton.disabled = state.maxButtonDisabled;
    }
    totalNode.classList.toggle('error', state.insufficientCurrency);
    totalLabel.textContent = state.totalLabel;
    totalValue.textContent = state.totalText;
    patchElementHtml(hintsNode, state.hintsHtml);
    submitButton.disabled = state.disabled;
    submitButton.textContent = state.actionLabel;
    return true;
  }

  /** 给交易弹窗里会变化的控件装事件，所有修改都只落在临时态上。 */
  private bindTradeDialogOverlayEvents(
    root: HTMLElement,
    selected: MarketListedItemView,
    update: S2C_MarketUpdate,
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
      const nextUnitPrice = this.getNextTradeDialogPrice(
        this.tradeDialog.unitPrice,
        action,
        preset,
        this.getTradeDialogMinUnitPrice(this.tradeDialog),
      );
      const quantitySeed = this.tradeDialog.source === 'auction-bid'
        ? this.getTradeDialogQuantityStep(nextUnitPrice)
        : this.tradeDialog.quantity;
      this.tradeDialog = {
        ...this.tradeDialog,
        unitPrice: nextUnitPrice,
        quantity: this.normalizeTradeDialogQuantity(quantitySeed, selected, this.tradeDialog.kind, nextUnitPrice),
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
      const minUnitPrice = this.getTradeDialogMinUnitPrice(this.tradeDialog);
      const unitPrice = this.normalizeTradeDialogPrice(
        Math.max(this.tradeDialog.unitPrice, minUnitPrice),
        kind === 'buy' ? 'up' : 'down',
      );
      const quantitySeed = this.tradeDialog.source === 'auction-bid'
        ? this.getTradeDialogQuantityStep(unitPrice)
        : this.tradeDialog.quantity;
      const quantity = this.normalizeTradeDialogQuantity(quantitySeed, selected, kind, unitPrice);
      if (kind === 'buy') {
        if (this.tradeDialog.source === 'auction-bid') {
          const lot = this.resolveAuctionLotByKey(this.selectedAuctionItemKey ?? selected.itemKey, update, 'participate');
          if (!lot) {
            return;
          }
          this.callbacks?.onPlaceAuctionBid(lot.id, lot.itemKey, unitPrice);
          this.tradeDialog = null;
          this.syncTradeDialogOverlay();
          return;
        }
        if (this.tradeDialog.confirmPurchase) {
          this.openBuyConfirm(selected, quantity, unitPrice);
          return;
        }
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

  /** 打开市场买入二次确认弹层。 */
  private openBuyConfirm(entry: MarketListedItemView, quantity: number, unitPrice: number): void {
    const itemName = this.getMarketDisplayName(entry.item);
    this.buyConfirmState = { itemKey: entry.itemKey, quantity, unitPrice };
    confirmModalHost.open({
      ownerId: MarketPanel.CONFIRM_MODAL_OWNER,
      title: t('auction.action.buy', undefined),
      subtitle: itemName,
      bodyHtml: this.renderBuyConfirmBody(entry, this.marketUpdate?.currencyItemName ?? '', quantity, unitPrice),
      confirmLabel: t('auction.action.buy', undefined),
      onConfirm: () => {
        const latest = this.buyConfirmState;
        const latestEntry = latest ? this.resolveMarketTooltipEntry(latest.itemKey) : null;
        this.buyConfirmState = null;
        if (!latest || !latestEntry) {
          return;
        }
        this.callbacks?.onCreateBuyOrder(latestEntry.itemKey, latest.quantity, latest.unitPrice);
        this.tradeDialog = null;
        this.syncTradeDialogOverlay();
      },
      onClose: () => {
        this.buyConfirmState = null;
      },
    });
  }

  /** 读取交易弹窗的挂载根节点，没有就现建一个。 */
  private getTradeDialogOverlayRoot(): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let root = document.getElementById(MarketPanel.TRADE_MODAL_ID);
    if (root) {
      if (root.parentElement !== document.body) {
        document.body.appendChild(root);
      }
      return root;
    }
    root = document.createElement('div');
    root.id = MarketPanel.TRADE_MODAL_ID;
    root.className = 'market-trade-modal-layer hidden';
    document.body.appendChild(root);
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

  /** 拍卖最低加价为当前价沿坊市价格档位向上一档。 */
  private getAuctionMinimumBidPrice(lot: AuctionLotView): number {
    if (lot.currentPrice >= MARKET_DIALOG_MAX_PRICE) {
      return MARKET_DIALOG_MAX_PRICE;
    }
    return this.normalizeTradeDialogPrice(lot.currentPrice + getMarketPriceStep(lot.currentPrice), 'up');
  }

  /** 读取当前交易弹窗的最低价格约束。 */
  private getTradeDialogMinUnitPrice(dialog: MarketTradeDialogState): number {
    if (dialog.source !== 'auction-bid') {
      return MARKET_DIALOG_MIN_PRICE;
    }
    return this.normalizeTradeDialogPrice(dialog.minUnitPrice ?? MARKET_DIALOG_MIN_PRICE, 'up');
  }

  /** 规范化交易弹窗里的数量输入，强制对齐最小交易步长。 */
  private normalizeTradeDialogQuantity(
    value: string | number,
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    unitPrice = this.tradeDialog?.unitPrice ?? MARKET_DIALOG_MIN_PRICE,
  ): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (dialog.kind === 'sell') {
      return this.getTradeDialogQuantityMax(entry, dialog.kind, dialog.unitPrice);
    }
    return this.getAffordableBuyQuantity(dialog.unitPrice, currencyItemId);
  }

  /** 计算当前持币量在该单价下最多能买多少。 */
  private getAffordableBuyQuantity(unitPrice: number, currencyItemId: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  private getNextTradeDialogPrice(currentPrice: number, action: MarketPriceAction, preset?: number | null, minPrice: number = MARKET_DIALOG_MIN_PRICE): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const clamp = (price: number, direction: 'up' | 'down'): number =>
      this.normalizeTradeDialogPrice(Math.max(minPrice, price), direction);
    if (action === 'preset') {
      return clamp(preset ?? MARKET_DIALOG_MIN_PRICE, 'up');
    }
    if (action === 'double') {
      return clamp(currentPrice * 2, 'up');
    }
    if (action === 'half') {
      return clamp(currentPrice / 2, 'down');
    }
    if (action === 'increase') {
      const step = currentPrice < 1
        ? getMarketPriceStep(currentPrice)
        : getMarketPriceStep(Math.min(MARKET_DIALOG_MAX_PRICE, currentPrice + 1));
      return clamp(currentPrice + step, 'up');
    }
    const probe = Math.max(minPrice, currentPrice - 1);
    return clamp(currentPrice - getMarketPriceStep(probe), 'down');
  }

  /** 按买卖方向把单价夹回合法区间并对齐价格档位。 */
  private normalizeTradeDialogPrice(value: number, direction: 'up' | 'down'): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const bounded = Math.max(MARKET_DIALOG_MIN_PRICE, Math.min(MARKET_DIALOG_MAX_PRICE, value));
    if (direction === 'up') {
      return Math.min(MARKET_DIALOG_MAX_PRICE, normalizeMarketPriceUp(bounded));
    }
    return Math.max(MARKET_DIALOG_MIN_PRICE, normalizeMarketPriceDown(bounded));
  }

  /** 把价格预设值格式化成按钮上更容易读的文案。 */
  private formatPricePresetLabel(value: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      compactMaximumFractionDigits: 2,
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 把装备条目显示成带强化等级前缀的名字。 */
  private getMarketDisplayName(item: ItemStack): string {
    const baseName = typeof item.name === 'string' && item.name.trim()
      ? item.name
      : item.itemId;
    const enhanceLevel = this.getMarketEnhanceLevel(item);
    const cleanName = baseName.replace(/^\+\d+\s+/, '');
    return enhanceLevel > 0 ? `+${formatDisplayInteger(enhanceLevel)} ${cleanName}` : cleanName;
  }

  /** 读取本地盘面里 +0 同款装备的最低卖价。 */
  private getLocalZeroEnhancementLowestSellPrice(itemId: string): number | undefined {
    return this.getKnownListedItems(this.marketUpdate).find((entry) =>
      entry.item.itemId === itemId
      && this.getMarketEnhanceLevel(entry.item) === 0
    )?.lowestSellPrice;
  }

  /** 把基础物品提示补上强化预估内容。 */
  private buildMarketItemTooltipPayload(item: ItemStack) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tooltip = buildItemTooltipPayload(item);
    const title = this.getMarketDisplayName(item);
    const estimate = this.buildEnhancementEstimate(item);
    if (!estimate) {
      return {
        ...tooltip,
        title,
      };
    }
    return {
      ...tooltip,
      title,
      lines: [
        ...tooltip.lines,
        renderPlainTooltipLine(t('market.enhance.title', undefined), estimate.costLine),
        renderPlainTooltipLine(t('market.enhance.attempts', undefined), estimate.attemptsLine),
        renderPlainTooltipLine(t('market.enhance.time', undefined), estimate.timeLine),
      ],
    };
  }

  /** 根据节点上的 data-* 标记找到对应的提示内容。 */
  private resolveMarketTooltipPayload(node: HTMLElement) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const key = node.dataset.marketItemTooltip;
    if (!key) {
      return null;
    }
    if (key === 'selected') {
      const selected = this.getSelectedListedItem(this.marketUpdate)
        ?? (this.selectedItemKey ? this.resolveMarketTooltipEntry(this.selectedItemKey) : null);
      return selected ? this.buildMarketItemTooltipPayload(selected.item) : null;
    }
    const listed = this.resolveMarketTooltipEntry(key);
    return listed ? this.buildMarketItemTooltipPayload(listed.item) : null;
  }

  /** 按 key 读取 tooltip 用的市场条目，包含本地补出的强化档位。 */
  private resolveMarketTooltipEntry(itemKey: string): MarketListedItemView | null {
    const listed = this.getKnownListedItems(this.marketUpdate).find((entry) => entry.itemKey === itemKey) ?? null;
    if (listed) {
      return listed;
    }
    for (const group of this.getVisibleListingGroups(this.marketUpdate)) {
      const variant = group.variants.find((entry) => entry.itemKey === itemKey) ?? null;
      if (variant) {
        return variant;
      }
    }
    const auctionLot = this.getCurrentAuctionLots().find((lot) => lot.itemKey === itemKey || lot.id === itemKey) ?? null;
    if (auctionLot) {
      return this.buildMarketListingFromAuctionLot(auctionLot);
    }
    return null;
  }

  /** 读取当前已经缓存到面板内的列表项。 */
  private getKnownListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[] {
    return update?.listedItems ?? [];
  }

  /** 根据市场盘面和当前物品推一版强化预估。 */
  private buildEnhancementEstimate(item: ItemStack): MarketEnhancementEstimateView | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.type !== 'equipment') {
      return null;
    }
    const targetLevel = this.getMarketEnhanceLevel(item);
    if (targetLevel <= 0) {
      return null;
    }
    const itemLevel = Math.max(1, Math.floor(Number(item.level) || 1));
    const localBaseUnitPrice = this.getLocalZeroEnhancementLowestSellPrice(item.itemId);
    const baseUnitPrice = localBaseUnitPrice;
    const basePricePending = false;
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
    const protectionStartText = strategy.protectionStartLevel === null ? t('market.enhance.no-protection', undefined) : `+${strategy.protectionStartLevel}`;
    const zeroPriceText = baseUnitPrice !== undefined
      ? this.formatMarketUnitPrice(baseUnitPrice)
      : basePricePending
        ? t('market.enhance.pending', undefined)
        : t('market.enhance.none', undefined);
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

  /** 在背包里找一格能对应当前物品的槽位。 */
  private findMatchingInventorySlot(item: ItemStack): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.type === 'equipment') {
      const targetLevel = this.getMarketEnhanceLevel(item);
      const slotIndex = this.inventory.items.findIndex((entry) =>
        entry.itemId === item.itemId
        && entry.type === 'equipment'
        && this.getMarketEnhanceLevel(entry) === targetLevel
      );
      return slotIndex >= 0 ? slotIndex : null;
    }
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (item.type === 'equipment') {
      return this.findEquipmentInventoryCountByLevel(item.itemId, this.getMarketEnhanceLevel(item));
    }
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
    return getPlayerOwnedItemCount(this.player, this.inventory, itemId);
  }

  /** 按装备强化等级统计持有数量，避免强化占位档位退回到同物品总数。 */
  private findEquipmentInventoryCountByLevel(itemId: string, enhanceLevel: number): number {
    const targetLevel = Math.max(0, Math.floor(Number(enhanceLevel) || 0));
    return this.inventory.items
      .filter((entry) =>
        entry.itemId === itemId
        && entry.type === 'equipment'
        && this.getMarketEnhanceLevel(entry) === targetLevel
      )
      .reduce((sum, entry) => sum + entry.count, 0);
  }
}

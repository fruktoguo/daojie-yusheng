/**
 * 本文件是客户端市场面板控制器，负责共享状态、玩家意图和仍在使用的 DOM 弹层。
 *
 * 坊市首屏只由 React 渲染；维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产合法性。
 */
import {
  AuctionLotPageEntry,
  AuctionHouseTab,
  C2S_RequestAuctionListings,
  C2S_RequestTransmissionListings,
  C2S_RequestMarketListings,
  COMBAT_EQUIP_SLOTS,
  clonePlainValue,
  AUCTION_DEFAULT_DURATION_HOURS,
  EquipSlot,
  HEAVENLY_DAO_SHOP_ITEMS,
  Inventory,
  ITEM_TYPES,
  ItemStack,
  ItemType,
  MARKET_PRICE_PRESET_VALUES,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  MarketTradeHistoryScope,
  PlayerState,
  S2C_AuctionListings,
  S2C_TransmissionListings,
  S2C_MarketListings,
  S2C_MarketItemBook,
  S2C_MarketOrders,
  S2C_MarketStorage,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
  TECHNIQUE_EQUIP_SLOTS,
  TechniqueCategory,
  TransmissionListingSort,
  isPlainEqual,
  normalizeMarketRequestPage,
  normalizeMarketListingsPageSize,
  normalizeMarketAuctionPageSize,
  normalizeMarketAuctionQuery,
  normalizeTransmissionCategory,
  normalizeTransmissionListingSort,
  resolveClampedMarketResponsePage,
  resolveMarketConsumableCategory,
} from '@mud/shared';
import { getLocalItemTemplate, getLocalTechniqueCategoryForBookItem, resolvePreviewItem, resolveTechniqueIdFromBookItemId } from '../../content/local-templates';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { confirmModalHost } from '../confirm-modal-host';
import { MARKET_MODAL_TABS, MarketModalTab } from '../../constants/ui/market';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';
import { t } from '../i18n';
import { MarketAuctionView } from './market-auction-view';
import { MarketTransmissionView } from './market-transmission-view';
import { MarketTradeDialog } from './market-trade-dialog';
import { renderTradeQuantityControl } from '../trade-control-renderers';
import { MarketBrowseView } from './market-browse-view';
import type {
  MarketPanelInternals,
  TransmissionCategoryFilter,
  TransmissionConsignPanelState,
  TransmissionPanelTab,
  MarketCategoryFilter,
  MarketConsumableFilter,
  MarketEquipmentFilter,
  MarketTechniqueFilter,
  MarketTradeDialogKind,
  MarketTradeDialogSource,
  MarketPriceAction,
  MarketTradeDialogState,
  AuctionConsignPanelState,
  MarketEnhancementEstimateView,
  MarketListingGroupView,
  AuctionLotView,
} from './market-panel-types';
import {
  mountReactMarketPanel,
  setReactMarketPanelCallbacks,
} from '../../react-ui/panels/market/mount-market-panel';
import {
  getHeavenlyDaoShopCurrencyNameImpl,
  getHeavenlyDaoShopCurrencyOwnedImpl,
  getHeavenlyDaoShopDiscountPercentImpl,
  getHeavenlyDaoShopUnitPriceImpl,
  getHeavenlyDaoShopDiscountLabelImpl,
  captureHeavenlyDaoShopAssetSignatureImpl,
  buildHeavenlyDaoShopAssetSignatureImpl,
  getHeavenlyDaoShopEntryImpl,
  ensureHeavenlyDaoShopSelectionImpl,
  buildHeavenlyDaoShopItemStackImpl,
  parseHeavenlyDaoShopQuantityImpl,
  renderHeavenlyDaoShopRowsImpl,
  renderHeavenlyDaoShopDetailPanelImpl,
  openHeavenlyDaoShopModalImpl,
  getOpenHeavenlyDaoShopBodyImpl,
  patchHeavenlyDaoShopModalImpl,
  patchHeavenlyDaoShopListImpl,
  patchHeavenlyDaoShopDetailPanelImpl,
  bindHeavenlyDaoShopEventsImpl,
  handleHeavenlyDaoShopClickImpl,
  handleHeavenlyDaoShopInputImpl,
  syncHeavenlyDaoShopPurchaseStateImpl,
} from './market-panel.heavenly-dao';
import {
  findConflictingOwnOrderImpl,
  getDefaultTradeDialogPriceImpl,
  getAuctionMinimumBidPriceImpl,
  getTradeDialogMinUnitPriceImpl,
  normalizeTradeDialogQuantityImpl,
  getTradeDialogQuantityStepImpl,
  getTradeDialogMinimumQuantityImpl,
  getTradeDialogQuantityMaxImpl,
  getTradeDialogMaxButtonQuantityImpl,
  getAffordableBuyQuantityImpl,
  getNextTradeDialogPriceImpl,
  normalizeTradeDialogPriceImpl,
  formatPricePresetLabelImpl,
  readDatasetNumberImpl,
} from './market-panel.trade-dialog';
import {
  formatMarketUnitPriceImpl,
  formatEnhancementEstimateCostImpl,
  formatEnhancementAttemptCountImpl,
  computeEnhancementJobBaseTicksImpl,
  formatEnhancementDurationFromTicksImpl,
  getMarketTradeTotalCostImpl,
  getMarketEnhanceLevelImpl,
  getMarketDisplayNameImpl,
  getLocalZeroEnhancementLowestSellPriceImpl,
  buildMarketItemTooltipPayloadImpl,
  resolveMarketTooltipPayloadImpl,
  resolveMarketTooltipEntryImpl,
  getKnownListedItemsImpl,
  buildEnhancementEstimateImpl,
  findMatchingInventoryItemInstanceIdImpl,
  findMatchingInventoryCountImpl,
  findInventoryItemCountByItemIdImpl,
  findEquipmentInventoryCountByLevelImpl,
} from './market-panel.render';

function normalizeInventoryItemInstanceId(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

/** 把普通文本转成可安全插入 HTML 的内容。 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function isTechniqueEquipmentSlot(slot: unknown): boolean {
  return typeof slot === 'string' && (TECHNIQUE_EQUIP_SLOTS as readonly string[]).includes(slot);
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
  /** onRequestTransmissionListings：请求传法台分页列表。 */
  onRequestTransmissionListings: (payload: C2S_RequestTransmissionListings) => void;
  /** onBuyTransmissionLot：传法台一口价求取功法残卷。 */
  onBuyTransmissionLot: (lotId: string, itemKey: string) => void;
  /** onCreateTransmissionSellOrder：把残卷寄售到传法台。 */
  onCreateTransmissionSellOrder: (itemInstanceId: string, unitPrice: number) => void;
  /**
 * onRequestItemBook：onRequest道具Book相关字段。
 */

  onRequestItemBook: (itemKey: string) => void;
  /**
 * onRequestTradeHistory：onRequestTradeHistory相关字段。
 */

  onRequestTradeHistory: (page: number, source?: 'market' | 'auction', scope?: MarketTradeHistoryScope) => void;
  /**
 * onCreateSellOrder：onCreateSell订单相关字段。
 */

  onCreateSellOrder: (itemInstanceId: string, quantity: number, unitPrice: number) => void;
  /**
 * onCreateAuctionSellOrder：onCreateAuctionSell订单相关字段。
 */

  onCreateAuctionSellOrder: (itemInstanceId: string, quantity: number, unitPrice: number, buyoutPrice?: number, auctionDurationHours?: number) => void;
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
  /** 购买天道商店商品。 */
  onBuyHeavenlyDaoShopItem: (itemId: string, quantity: number) => void;
  /** 打开自创功法悟道页面。 */
  onOpenTechniqueGeneration?: () => void;
  /**
 * onCancelOrder：onCancel订单相关字段。
 */

  onCancelOrder: (orderId: string) => void;
  /**
 * onClaimStorage：onClaimStorage相关字段。
 */

  onClaimStorage: () => void;
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
/** 功法书筛选按钮的静态配置。 */
const MARKET_TECHNIQUE_FILTERS: Array<{
/**
 * id：ID标识。
 */
 id: MarketTechniqueFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string
}> = [
  { id: 'all', label: t('market.filter.technique-all', undefined) },
  { id: 'arts', label: getTechniqueCategoryLabel('arts') },
  { id: 'internal', label: getTechniqueCategoryLabel('internal') },
  { id: 'divine', label: getTechniqueCategoryLabel('divine') },
  { id: 'secret', label: getTechniqueCategoryLabel('secret') },
];
/** 拍卖行每页最多显示的拍品数量。 */
const AUCTION_PAGE_SIZE = 10;
/** 盘口缓存只用于减少重复点击请求，超过此时间必须主动回源。 */
const ITEM_BOOK_CACHE_MAX_AGE_MS = 10_000;

/** 市场面板实现，负责列表浏览、物品书籍、交易弹窗和强化预估。 */
export class MarketPanel {
  /** 市场详情弹窗的归属标识。 */
  private static readonly MODAL_OWNER = 'market-panel';
  /** 拍卖行详情弹窗的归属标识。 */
  private static readonly AUCTION_MODAL_OWNER = 'auction-house-panel';
  /** 发起拍卖独立弹窗的归属标识。 */
  private static readonly AUCTION_CONSIGN_MODAL_OWNER = 'auction-consign-panel';
  /** 天道商店独立弹窗的归属标识。 */
  private static readonly HEAVENLY_DAO_SHOP_MODAL_OWNER = 'heavenly-dao-shop-panel';
  /** 交易弹窗根节点的 id。 */
  private static readonly TRADE_MODAL_ID = 'market-trade-modal-root';
  /** 买入确认弹层的归属标识。 */
  private static readonly CONFIRM_MODAL_OWNER = 'market-buy-confirm';
  /** 面板根节点，只负责首屏摘要和打开入口。 */
  /** 市场面板对外回调，实际请求都交给外部处理。 */
  callbacks: MarketPanelCallbacks | null = null;
  /** 当前市场主快照，列表、挂单和托管仓都从这里读。 */
  marketUpdate: S2C_MarketUpdate | null = null;
  /** 当前选中物品对应的书籍详情。 */
  private itemBook: MarketOrderBookView | null = null;
  /** 最近一次列表分页数据，供筛选和翻页回填。 */
  private marketListings: S2C_MarketListings | null = null;
  /** 普通坊市独立语义快照，过滤其他交易分区带来的重复分页包。 */
  private marketListingsSnapshot: S2C_MarketListings | null = null;
  /** 最近一次拍卖行分页数据，服务端已经按筛选和页码裁剪。 */
  private auctionListings: S2C_AuctionListings | null = null;
  /** 拍卖行独立语义快照，重复行情包不触碰搜索、列表和详情 DOM。 */
  private auctionListingsSnapshot: S2C_AuctionListings | null = null;
  /** 最近一次传法台分页数据。 */
  transmissionListings: S2C_TransmissionListings | null = null;
  /** 独立保存的传法台语义快照，避免上游复用并原地修改对象时漏掉真实变化。 */
  private transmissionListingsSnapshot: S2C_TransmissionListings | null = null;
  /** 传法台当前标签页。 */
  private transmissionTab: TransmissionPanelTab = 'participate';
  /** 传法台当前页码。 */
  private transmissionPage = 1;
  /** 传法台搜索关键字。 */
  private transmissionSearchQuery = '';
  /** 传法台当前功法分类。 */
  private transmissionCategory: TransmissionCategoryFilter = 'all';
  /** 传法台当前服务端分页排序。 */
  private transmissionSort: TransmissionListingSort = 'price_asc';
  /** 传法台独立上架界面状态。 */
  private transmissionConsignPanel: TransmissionConsignPanelState = {
    open: false,
    itemInstanceId: null,
    query: '',
    category: 'all',
    sort: 'realm_desc',
    unitPrice: 1,
  };
  /** 传法台当前选中的拍品 key。 */
  private selectedTransmissionItemKey: string | null = null;
  /** 最近一次传法台请求的服务端规范化标识，用于丢弃过期响应。 */
  private pendingTransmissionRequest: {
    tab: TransmissionPanelTab;
    query: string;
    category: TransmissionCategoryFilter;
    sort: TransmissionListingSort;
    page: number;
    pageSize: number;
  } | null = null;
  /** 物品书籍本地缓存，随市场列表修订显式失效。 */
  private readonly itemBookCache = new Map<string, { book: MarketOrderBookView; epoch: number; cachedAt: number }>();
  /** 正在等待服务端回包的物品书籍及其发起时修订。 */
  private readonly pendingItemBookEpochs = new Map<string, number>();
  /** 市场列表变化时递增，避免旧异步回包重新写入已失效缓存。 */
  private itemBookCacheEpoch = 0;
  /** 最近一次会影响盘口的自有订单签名，稳定的 1Hz 摘要不会重复失效缓存。 */
  private itemBookRevisionSignature = '';
  /** 当前在市场列表里选中的物品 key。 */
  selectedItemKey: string | null = null;
  /** 当前高亮的物品组。 */
  private selectedGroupItemId: string | null = null;
  /** 当前正在查看的强化等级列表归属物品。 */
  private enhancementBrowseItemId: string | null = null;
  /** 天道商店当前选中的固定商品。 */
  heavenlyDaoShopSelectedItemId: string | null = HEAVENLY_DAO_SHOP_ITEMS[0]?.itemId ?? null;
  /** 天道商店每个商品的数量草稿。 */
  readonly heavenlyDaoShopQuantityDrafts = new Map<string, string>();
  /** 天道商店依赖的资产投影签名，用于跳过无变化的每息刷新。 */
  heavenlyDaoShopAssetSignature = '';
  /** 弹窗当前标签页。 */
  private modalTab: MarketModalTab = 'market';
  /** 当前市场主分类筛选。 */
  private activeCategory: MarketCategoryFilter = 'all';
  /** 当前装备子分类筛选。 */
  private activeEquipmentCategory: MarketEquipmentFilter = 'all';
  /** 当前功法子分类筛选。 */
  private activeTechniqueCategory: MarketTechniqueFilter = 'all';
  /** 当前消耗品子分类筛选。 */
  private activeConsumableCategory: MarketConsumableFilter = 'all';
  /** 拍卖行当前标签页。 */
  private auctionTab: AuctionHouseTab = 'participate';
  /** 拍卖行成交记录范围。 */
  private auctionHistoryScope: MarketTradeHistoryScope = 'all';
  /** 拍卖行物品分类筛选。 */
  private auctionCategory: MarketCategoryFilter = 'all';
  /** 拍卖行搜索关键字。 */
  private auctionSearchQuery = '';
  /** 拍卖行当前选中的拍品 id。 */
  private selectedAuctionItemKey: string | null = null;
  /** 拍卖行当前页码。 */
  private auctionPage = 1;
  /** 拍卖发起面板状态，独立于当前拍品列表选中。 */
  private auctionConsignPanel: AuctionConsignPanelState = {
    open: false,
    itemInstanceId: null,
    quantity: 1,
    totalPrice: 1,
    buyoutPrice: 0,
    durationHours: AUCTION_DEFAULT_DURATION_HOURS,
    query: '',
  };
  /** 当前列表页码。 */
  private currentPage = 1;
  /** 交易历史页码。 */
  private tradeHistoryPage = 1;
  /** 最近一次坊市请求的服务端规范化标识，用于丢弃过期响应。 */
  private pendingListingsRequest: { category: MarketCategoryFilter; equipmentSlot: MarketEquipmentFilter; techniqueCategory: MarketTechniqueFilter; consumableCategory: MarketConsumableFilter; page: number; pageSize: number } | null = null;
  /** 最近一次拍卖行请求的服务端规范化标识，用于丢弃过期响应。 */
  private pendingAuctionRequest: { tab: AuctionHouseTab; category: MarketCategoryFilter; query: string; page: number; pageSize: number } | null = null;
  /** 最近一次交易历史请求的期望 key（source|page），用于丢弃过期响应。 */
  private pendingTradeHistoryKey: string | null = null;
  /** 物品书籍是否正在加载。 */
  private itemBookLoading = false;
  /** 交易历史是否正在加载。 */
  private tradeHistoryLoading = false;
  /** 当前交易弹窗状态。 */
  tradeDialog: MarketTradeDialogState | null = null;
  /** 待确认的买入请求。 */
  private buyConfirmState: { itemKey: string; quantity: number; unitPrice: number } | null = null;
  /** 当前交易历史快照。 */
  private tradeHistory: S2C_MarketTradeHistory | null = null;
  /** 当前玩家背包快照，用于判断能否挂售和买入。 */
  inventory: Inventory = { items: [], capacity: 0 };
  player: PlayerState | null = null;
  /** 当前登录会话是否已经预取过坊市摘要。 */
  private hasRequestedMarketBootstrap = false;
  /** 市场物品提示浮层，列表和详情共用。 */
  tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  /** 当前正在显示提示的节点。 */
  tooltipNode: HTMLElement | null = null;
  /** 拍卖行倒计时本地 ticker，只局部更新倒计时文本。 */
  private auctionCountdownTimer: ReturnType<typeof window.setInterval> | null = null;
  /** @internal 拍卖行子视图。 */
  readonly auctionView = new MarketAuctionView(this as unknown as MarketPanelInternals);
  readonly transmissionView = new MarketTransmissionView(this as unknown as MarketPanelInternals);
  /** @internal 交易弹窗子视图。 */
  readonly tradeDialogView = new MarketTradeDialog(this as unknown as MarketPanelInternals);
  /** @internal 浏览列表子视图。 */
  readonly browseView = new MarketBrowseView(this as unknown as MarketPanelInternals);

  constructor() {
    setReactMarketPanelCallbacks({
      onOpenMarket: () => this.openMarketFromPane(),
      onOpenAuction: (tab) => this.openAuctionFromPane(tab),
      onOpenTransmission: () => this.openTransmissionFromPane(),
      onOpenHeavenlyDaoShop: () => this.openHeavenlyDaoShopFromPane(),
      onOpenTechniqueGeneration: () => this.callbacks?.onOpenTechniqueGeneration?.(),
    });
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
    const nextPlayer = player ?? null;
    const shouldPatchHeavenlyDaoShop = detailModalHost.isOpenFor(MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER)
      && this.captureHeavenlyDaoShopAssetSignature(nextPlayer, this.inventory);
    this.player = nextPlayer;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.syncVisibleMarketInventoryState();
      this.syncTradeDialogOverlay();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      if (!this.patchAuctionDetailLiveState()) {
        this.patchAuctionDetailPanel();
      }
      this.patchAuctionConsignModalState();
      this.syncTradeDialogOverlay();
    } else if (detailModalHost.isOpenFor(MarketTransmissionView.modalOwner)) {
      this.transmissionView.patchTransmissionInventoryState();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER)) {
      this.patchAuctionConsignModalState();
    } else if (shouldPatchHeavenlyDaoShop) {
      this.patchHeavenlyDaoShopModal();
    }
  }

  /** 同步背包快照，并刷新依赖弹窗。 */
  syncInventory(inventory: Inventory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const shouldPatchHeavenlyDaoShop = detailModalHost.isOpenFor(MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER)
      && this.captureHeavenlyDaoShopAssetSignature(this.player, inventory);
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.syncVisibleMarketInventoryState();
      this.syncTradeDialogOverlay();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      if (!this.patchAuctionDetailLiveState()) {
        this.patchAuctionDetailPanel();
      }
      this.patchAuctionConsignModalState();
      this.syncTradeDialogOverlay();
    } else if (detailModalHost.isOpenFor(MarketTransmissionView.modalOwner)) {
      this.transmissionView.patchTransmissionInventoryState();
      this.transmissionView.patchTransmissionConsignInventoryState();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER)) {
      this.patchAuctionConsignModalState();
    } else if (shouldPatchHeavenlyDaoShop) {
      this.patchHeavenlyDaoShopModal();
    }
  }

  /** 更新市场主视图。 */
  updateMarket(data: S2C_MarketUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const itemBookRevisionSignature = this.buildItemBookRevisionSignature(data);
    if (itemBookRevisionSignature !== this.itemBookRevisionSignature) {
      this.itemBookRevisionSignature = itemBookRevisionSignature;
      this.invalidateItemBookCache();
    }
    const marketModalOpen = detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER);
    const auctionModalOpen = detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER);
    const auctionConsignModalOpen = detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER);
    const transmissionModalOpen = detailModalHost.isOpenFor(MarketTransmissionView.modalOwner);
    const heavenlyDaoShopOpen = detailModalHost.isOpenFor(MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER);
    const previousMarketUpdate = this.marketUpdate;
    const knownListedItems = data.listedItems.length > 0 ? data.listedItems : this.getKnownListedItems(this.marketUpdate);
    const nextMarketUpdate = {
      ...data,
      listedItems: knownListedItems,
    };
    const canPatchMarketModal = marketModalOpen
      && this.canPatchMarketModalUpdateInPlace(previousMarketUpdate, nextMarketUpdate);
    this.marketUpdate = {
      ...data,
      listedItems: knownListedItems,
    };
    if (!auctionModalOpen && this.selectedItemKey && !knownListedItems.some((item) => item.itemKey === this.selectedItemKey)) {
      this.selectedItemKey = null;
      this.itemBook = null;
      this.tradeDialog = null;
    }
    if (!auctionModalOpen) {
      this.currentPage = this.clampPage(this.currentPage, this.getVisibleMarketTotalItems(this.marketUpdate));
      this.syncPageSelection();
    }
    if (this.selectedItemKey && (marketModalOpen || auctionModalOpen || this.tradeDialog !== null)) {
      this.requestItemBook(this.selectedItemKey);
    }
    this.renderPane();
    if (marketModalOpen) {
      if (this.modalTab === 'market') {
        if (this.patchMarketModalLiveState({ patchBook: true, requireStableList: canPatchMarketModal })) {
          return;
        }
      } else if (this.modalTab === 'my-orders') {
        if (this.patchMyOrdersTab()) {
          return;
        }
      } else if (this.patchTradeHistoryTab()) {
        return;
      }
      this.renderModal();
    } else if (auctionModalOpen) {
      this.patchAuctionModalLiveState();
    } else if (transmissionModalOpen) {
      // 普通坊市与拍卖变化不再牵动传法台；真实传法台订单变化由服务端定向推送分页。
      this.transmissionView.patchTransmissionInventoryState();
    } else if (auctionConsignModalOpen) {
      this.patchAuctionConsignModalState();
    } else if (heavenlyDaoShopOpen) {
      this.captureHeavenlyDaoShopAssetSignature(this.player, this.inventory);
      this.patchHeavenlyDaoShopModal();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  /** 更新列表分页数据。 */
  updateListings(data: S2C_MarketListings): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    // 竞态守卫：快速切换品类/翻页时旧响应可能晚于新请求到达，
    // requestListings 发包前已记录最新筛选+页码 key，此处校验回包是否仍是当前期望，过期包直接丢弃。
    if (this.pendingListingsRequest !== null) {
      const equipmentSlot = data.category === 'equipment' ? data.equipmentSlot : 'all';
      const techniqueCategory = data.category === 'skill_book' ? data.techniqueCategory : 'all';
      const consumableCategory = data.category === 'consumable' ? data.consumableCategory ?? 'all' : 'all';
      const request = this.pendingListingsRequest;
      if (
        data.category !== request.category
        || equipmentSlot !== request.equipmentSlot
        || techniqueCategory !== request.techniqueCategory
        || consumableCategory !== request.consumableCategory
        || normalizeMarketRequestPage(data.page) !== request.page
        || normalizeMarketListingsPageSize(data.pageSize) !== request.pageSize
      ) {
        return;
      }
    }
    const listingsChanged = !isPlainEqual(this.marketListingsSnapshot, data);
    if (listingsChanged) this.marketListingsSnapshot = clonePlainValue(data);
    this.marketListings = data;
    if (!listingsChanged) return;
    this.invalidateItemBookCache();
    const marketModalOpen = detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER);
    this.currentPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    this.activeCategory = data.category;
    this.activeEquipmentCategory = data.category === 'equipment' ? data.equipmentSlot : 'all';
    this.activeTechniqueCategory = data.category === 'skill_book' ? data.techniqueCategory : 'all';
    this.activeConsumableCategory = data.category === 'consumable' ? data.consumableCategory ?? 'all' : 'all';
    this.marketUpdate = this.mergeListingsIntoMarketUpdate(this.marketUpdate, data);
    this.syncPageSelection();
    if (marketModalOpen && this.modalTab === 'market' && this.selectedItemKey) {
      this.requestItemBook(this.selectedItemKey);
    }
    const canPatchMarketModal = marketModalOpen && this.canPatchCurrentMarketListInPlace();
    this.renderPane();
    if (marketModalOpen) {
      if (this.modalTab === 'market') {
        if (this.patchMarketModalLiveState({ patchBook: true, requireStableList: canPatchMarketModal })) {
          return;
        }
      } else if (this.modalTab === 'my-orders') {
        if (this.patchMyOrdersTab()) {
          return;
        }
      } else if (this.patchTradeHistoryTab()) {
        return;
      }
      this.renderModal();
    }
  }

  /** 更新传法台分页数据。 */
  updateTransmissionListings(data: S2C_TransmissionListings): void {
    // 竞态守卫：快速切 tab / 翻页时旧响应可能晚于新请求到达，过期包直接丢弃。
    if (this.pendingTransmissionRequest !== null) {
      const request = this.pendingTransmissionRequest;
      if (
        data.tab !== request.tab
        || normalizeMarketAuctionQuery(data.query) !== request.query
        || normalizeTransmissionCategory(data.category) !== request.category
        || normalizeTransmissionListingSort(data.sort) !== request.sort
        || normalizeMarketAuctionPageSize(data.pageSize) !== request.pageSize
        || normalizeMarketRequestPage(data.page) !== resolveClampedMarketResponsePage(request.page, data.total, data.pageSize)
      ) {
        return;
      }
    }
    // 当前输入草稿可能已经变化，但防抖请求尚未发出；此时任何旧条件回包都不能覆盖输入。
    if (
      data.tab !== this.transmissionTab
      || normalizeMarketAuctionQuery(data.query) !== normalizeMarketAuctionQuery(this.transmissionSearchQuery)
      || normalizeTransmissionCategory(data.category) !== normalizeTransmissionCategory(this.transmissionCategory)
      || normalizeTransmissionListingSort(data.sort) !== normalizeTransmissionListingSort(this.transmissionSort)
      || normalizeMarketRequestPage(data.page) !== resolveClampedMarketResponsePage(this.transmissionPage, data.total, data.pageSize)
    ) {
      return;
    }
    const listingsChanged = !isPlainEqual(this.transmissionListingsSnapshot, data);
    if (listingsChanged) this.transmissionListingsSnapshot = clonePlainValue(data);
    this.transmissionListings = data;
    if (!listingsChanged) return;
    this.invalidateItemBookCache();
    this.transmissionTab = data.tab;
    this.transmissionSearchQuery = data.query ?? '';
    this.transmissionCategory = normalizeTransmissionCategory(data.category);
    this.transmissionSort = normalizeTransmissionListingSort(data.sort);
    this.transmissionPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    // 选中项若已成交下架，回退到当前页第一条。
    if (this.selectedTransmissionItemKey && !data.items.some((entry) => entry.itemKey === this.selectedTransmissionItemKey)) {
      this.selectedTransmissionItemKey = null;
    }
    if (detailModalHost.isOpenFor(MarketTransmissionView.modalOwner)) {
      this.transmissionView.patchTransmissionInventoryState();
      this.transmissionView.patchTransmissionListingsState();
    }
  }

  updateAuctionListings(data: S2C_AuctionListings): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    // 竞态守卫：快速切换拍卖行 tab/品类/搜索/翻页时旧响应可能晚于新请求到达，
    // requestAuctionListings 发包前已记录最新筛选+页码 key，此处校验回包是否仍是当前期望，过期包直接丢弃。
    if (this.pendingAuctionRequest !== null) {
      const request = this.pendingAuctionRequest;
      if (
        data.tab !== request.tab
        || data.category !== request.category
        || normalizeMarketAuctionQuery(data.query) !== request.query
        || normalizeMarketAuctionPageSize(data.pageSize) !== request.pageSize
        || normalizeMarketRequestPage(data.page) !== resolveClampedMarketResponsePage(request.page, data.total, data.pageSize)
      ) {
        return;
      }
    }
    const previousListings = this.auctionListings;
    const listingsChanged = !isPlainEqual(this.auctionListingsSnapshot, data);
    if (listingsChanged) this.auctionListingsSnapshot = clonePlainValue(data);
    this.auctionListings = data;
    if (!listingsChanged) return;
    this.invalidateItemBookCache();
    const previousSelectedAuctionItemKey = this.selectedAuctionItemKey;
    const searchEditing = this.isAuctionSearchEditing();
    const canPatchOpenModal = detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)
      && this.canPatchAuctionListingsInPlace(previousListings, data);
    if (this.auctionTab !== 'history') {
      this.auctionTab = data.tab;
    }
    this.auctionCategory = data.category;
    // 搜索框正在编辑（含中文 IME 组字）时保留本地草稿，避免回包覆盖导致拼音跳掉。
    if (!searchEditing) {
      this.auctionSearchQuery = data.query ?? '';
    }
    this.auctionPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    this.syncAuctionSelection();
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      const selectedLot = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, this.marketUpdate, this.auctionTab);
      if (selectedLot) {
        this.selectedItemKey = selectedLot.itemKey;
        this.requestItemBook(selectedLot.itemKey);
      }
    }
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      if (canPatchOpenModal || searchEditing) {
        if (searchEditing && !canPatchOpenModal) {
          this.auctionView.patchAuctionListingsPreservingSearch();
        } else {
          this.patchAuctionActiveSelection();
          this.patchAuctionCountdowns();
          if (previousSelectedAuctionItemKey !== this.selectedAuctionItemKey) {
            this.patchAuctionDetailPanel();
          } else if (!this.patchAuctionDetailLiveState()) {
            this.patchAuctionDetailPanel();
          }
        }
        this.syncTradeDialogOverlay();
        return;
      }
      this.renderAuctionModal();
    }
  }

  /** 拍卖搜索框是否正在输入（含 IME 组字中）。 */
  private isAuctionSearchEditing(): boolean {
    if (!detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      return false;
    }
    const input = this.getOpenAuctionModalBody()?.querySelector<HTMLInputElement>('[data-auction-search]');
    return Boolean(input && document.activeElement === input);
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
      if (this.patchMyOrdersTab()) {
        return;
      }
      if (this.modalTab === 'market' && this.patchMarketModalLiveState()) {
        return;
      }
      if (this.patchTradeHistoryTab()) {
        return;
      }
      this.renderModal();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionModalLiveState();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER)) {
      this.patchAuctionConsignModalState();
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
      if (this.patchMyOrdersTab()) {
        return;
      }
      if (this.modalTab === 'market' && this.patchMarketModalLiveState()) {
        return;
      }
      if (this.patchTradeHistoryTab()) {
        return;
      }
      this.renderModal();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionModalLiveState();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER)) {
      this.patchAuctionConsignModalState();
    }
  }

  /** 同步物品书籍缓存，并尽量只刷新当前选中的详情。 */
  updateItemBook(data: S2C_MarketItemBook): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const requestedEpoch = this.pendingItemBookEpochs.get(data.itemKey);
    this.pendingItemBookEpochs.delete(data.itemKey);
    if (requestedEpoch === undefined || requestedEpoch !== this.itemBookCacheEpoch) {
      if (data.itemKey === this.selectedItemKey) {
        this.itemBookLoading = false;
        this.requestItemBook(data.itemKey);
      }
      return;
    }
    if (data.book) {
      this.itemBookCache.set(data.itemKey, { book: data.book, epoch: requestedEpoch, cachedAt: Date.now() });
    } else {
      this.itemBookCache.delete(data.itemKey);
    }
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
      if (!this.patchAuctionDetailLiveState()) {
        this.patchAuctionDetailPanel();
      }
    } else {
      this.syncTradeDialogOverlay();
    }
    this.syncTradeDialogOverlay();
  }

  /** 同步交易历史分页。 */
  updateTradeHistory(data: S2C_MarketTradeHistory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    // 竞态守卫：快速切换交易历史来源、范围或页码时旧响应可能晚于新请求到达，
    // requestTradeHistory 发包前已记录完整查询 key，此处校验回包是否仍是当前期望，过期包直接丢弃。
    if (this.pendingTradeHistoryKey !== null) {
      const expectedKey = [
        data.source,
        data.scope,
        Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1)),
      ].join('|');
      if (expectedKey !== this.pendingTradeHistoryKey) {
        return;
      }
    }
    this.tradeHistoryLoading = false;
    this.tradeHistory = data;
    this.tradeHistoryPage = data.page;
    if (data.source === 'auction') {
      this.auctionHistoryScope = data.scope;
    }
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      if (this.patchTradeHistoryTab()) {
        return;
      }
      if (this.modalTab === 'market' && this.patchMarketModalLiveState()) {
        return;
      }
      if (this.patchMyOrdersTab()) {
        return;
      }
      this.renderModal();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionModalLiveState();
    }
  }

  /** 清空市场面板状态、缓存和临时弹窗。 */
  clear(): void {
    this.transmissionView.clear();
    this.player = null;
    this.marketUpdate = null;
    this.itemBook = null;
    this.marketListings = null;
    this.marketListingsSnapshot = null;
    this.auctionListings = null;
    this.auctionListingsSnapshot = null;
    this.transmissionListings = null;
    this.transmissionListingsSnapshot = null;
    this.transmissionTab = 'participate';
    this.transmissionPage = 1;
    this.transmissionSearchQuery = '';
    this.transmissionCategory = 'all';
    this.transmissionSort = 'price_asc';
    this.transmissionConsignPanel = {
      open: false,
      itemInstanceId: null,
      query: '',
      category: 'all',
      sort: 'realm_desc',
      unitPrice: 1,
    };
    this.selectedTransmissionItemKey = null;
    this.pendingTransmissionRequest = null;
    this.selectedItemKey = null;
    this.selectedGroupItemId = null;
    this.enhancementBrowseItemId = null;
    this.heavenlyDaoShopSelectedItemId = HEAVENLY_DAO_SHOP_ITEMS[0]?.itemId ?? null;
    this.heavenlyDaoShopQuantityDrafts.clear();
    this.heavenlyDaoShopAssetSignature = '';
    this.modalTab = 'market';
    this.activeCategory = 'all';
    this.activeEquipmentCategory = 'all';
    this.activeTechniqueCategory = 'all';
    this.pendingListingsRequest = null;
    this.pendingAuctionRequest = null;
    this.pendingTradeHistoryKey = null;
    this.auctionTab = 'participate';
    this.auctionHistoryScope = 'all';
    this.auctionCategory = 'all';
    this.auctionSearchQuery = '';
    this.selectedAuctionItemKey = null;
    this.auctionPage = 1;
    this.auctionConsignPanel = { open: false, itemInstanceId: null, quantity: 1, totalPrice: 1, buyoutPrice: 0, durationHours: AUCTION_DEFAULT_DURATION_HOURS, query: '' };
    this.currentPage = 1;
    this.tradeHistoryPage = 1;
    this.itemBookLoading = false;
    this.itemBookCache.clear();
    this.pendingItemBookEpochs.clear();
    this.itemBookCacheEpoch += 1;
    this.itemBookRevisionSignature = '';
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
    detailModalHost.close(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER);
    detailModalHost.close(MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER);
  }

  /** 确保坊市唯一的 React 首屏已挂载；重复调用不会重建根节点。 */
  private renderPane(): void {
    mountReactMarketPanel();
  }

  private openMarketFromPane(): void {
    if (!this.requestMarketBootstrap()) {
      this.callbacks?.onRequestMarket();
    }
    this.openModal();
  }

  private openAuctionFromPane(tab: AuctionHouseTab): void {
    if (!this.requestMarketBootstrap()) {
      this.callbacks?.onRequestMarket();
    }
    this.openAuctionModal(tab);
  }

  private openTransmissionFromPane(): void {
    if (!this.requestMarketBootstrap()) {
      this.callbacks?.onRequestMarket();
    }
    this.transmissionView.openTransmissionModal(this.transmissionTab);
  }

  openHeavenlyDaoShopFromInventory(): void {
    if (!this.requestMarketBootstrap()) {
      this.callbacks?.onRequestMarket();
    }
    this.openHeavenlyDaoShopModal();
  }

  private openHeavenlyDaoShopFromPane(): void {
    if (!this.requestMarketBootstrap()) {
      this.callbacks?.onRequestMarket();
    }
    this.openHeavenlyDaoShopModal();
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

  private getHeavenlyDaoShopCurrencyName(): string {
    return getHeavenlyDaoShopCurrencyNameImpl(this);
  }

  private getHeavenlyDaoShopCurrencyOwned(): number {
    return getHeavenlyDaoShopCurrencyOwnedImpl(this);
  }

  private getHeavenlyDaoShopDiscountPercent(): number {
    return getHeavenlyDaoShopDiscountPercentImpl(this);
  }

  private getHeavenlyDaoShopUnitPrice(basePrice: number): number {
    return getHeavenlyDaoShopUnitPriceImpl(this, basePrice);
  }

  private getHeavenlyDaoShopDiscountLabel(): string {
    return getHeavenlyDaoShopDiscountLabelImpl(this);
  }

  private captureHeavenlyDaoShopAssetSignature(player: PlayerState | null, inventory: Inventory): boolean {
    return captureHeavenlyDaoShopAssetSignatureImpl(this, player, inventory);
  }

  private buildHeavenlyDaoShopAssetSignature(player: PlayerState | null, inventory: Inventory): string {
    return buildHeavenlyDaoShopAssetSignatureImpl(this, player, inventory);
  }

  getHeavenlyDaoShopEntry(itemId: string | null) {
    return getHeavenlyDaoShopEntryImpl(this, itemId);
  }

  private ensureHeavenlyDaoShopSelection() {
    return ensureHeavenlyDaoShopSelectionImpl(this);
  }

  buildHeavenlyDaoShopItemStack(itemId: string, count: number): ItemStack | null {
    return buildHeavenlyDaoShopItemStackImpl(this, itemId, count);
  }

  private parseHeavenlyDaoShopQuantity(itemId: string): number | null {
    return parseHeavenlyDaoShopQuantityImpl(this, itemId);
  }

  private renderHeavenlyDaoShopRows(): string {
    return renderHeavenlyDaoShopRowsImpl(this);
  }

  private renderHeavenlyDaoShopDetailPanel(): string {
    return renderHeavenlyDaoShopDetailPanelImpl(this);
  }

  private openHeavenlyDaoShopModal(): void {
    openHeavenlyDaoShopModalImpl(this);
  }

  private getOpenHeavenlyDaoShopBody(): HTMLElement | null {
    return getOpenHeavenlyDaoShopBodyImpl(this);
  }

  private patchHeavenlyDaoShopModal(): boolean {
    return patchHeavenlyDaoShopModalImpl(this);
  }

  private patchHeavenlyDaoShopList(): void {
    patchHeavenlyDaoShopListImpl(this);
  }

  private patchHeavenlyDaoShopDetailPanel(): void {
    patchHeavenlyDaoShopDetailPanelImpl(this);
  }

  private bindHeavenlyDaoShopEvents(body: HTMLElement, signal: AbortSignal): void {
    bindHeavenlyDaoShopEventsImpl(this, body, signal);
  }

  private handleHeavenlyDaoShopClick(event: Event): void {
    handleHeavenlyDaoShopClickImpl(this, event);
  }

  private handleHeavenlyDaoShopInput(event: Event): void {
    handleHeavenlyDaoShopInputImpl(this, event);
  }

  private syncHeavenlyDaoShopPurchaseState(root: ParentNode, itemId: string): void {
    syncHeavenlyDaoShopPurchaseStateImpl(this, root, itemId);
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
    const modalOptions = {
      ownerId: MarketPanel.MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market',
      title: t('market.title', undefined),
      subtitle: t('market.subtitle', undefined),
      renderBody: (body: HTMLElement) => {
        replaceElementHtml(
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
          if (category !== 'consumable') {
            this.activeConsumableCategory = 'all';
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

        body.querySelectorAll<HTMLElement>('[data-market-consumable-category]').forEach((button) => button.addEventListener('click', () => {
          const category = button.dataset.marketConsumableCategory as MarketConsumableFilter | undefined;
          if (!category || category === this.activeConsumableCategory) {
            return;
          }
          this.activeConsumableCategory = category;
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

        this.bindMarketModalDelegatedEvents(body, signal);
        this.syncTradeDialogOverlay();
      },
    } satisfies Parameters<typeof detailModalHost.open>[0];
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      detailModalHost.patch(modalOptions);
      return;
    }
    detailModalHost.open(modalOptions);
  }

  /** 打开拍卖行独立弹层。 */
  private openAuctionModal(tab: AuctionHouseTab = this.auctionTab): void {
    this.auctionView.openAuctionModal(tab);
  }

  /** 渲染拍卖行独立界面。 */
  private renderAuctionModal(): void {
    this.auctionView.renderAuctionModal();
  }

  /** 打开发起拍卖独立弹层。 */
  openAuctionConsignModal(): void {
    const first = this.auctionView.getAuctionConsignItems(this.marketUpdate).at(0);
    this.auctionConsignPanel = {
      open: true,
      itemInstanceId: this.auctionConsignPanel.itemInstanceId ?? first?.itemInstanceId ?? null,
      quantity: this.auctionConsignPanel.quantity,
      totalPrice: this.auctionConsignPanel.totalPrice,
      buyoutPrice: this.auctionConsignPanel.buyoutPrice,
      durationHours: this.auctionConsignPanel.durationHours,
      query: this.auctionConsignPanel.query,
    };
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.auctionView.renderInlineAuctionConsignModal();
      return;
    }
    this.renderAuctionConsignModal();
  }

  /** 打开传法台独立上架界面。 */
  openTransmissionConsignModal(): void {
    const preferredItemInstanceId = this.transmissionView.getPreferredTransmissionConsignItemInstanceId(
      this.transmissionConsignPanel.itemInstanceId,
    );
    this.transmissionConsignPanel = {
      ...this.transmissionConsignPanel,
      open: true,
      itemInstanceId: preferredItemInstanceId,
      unitPrice: this.normalizeTradeDialogPrice(this.transmissionConsignPanel.unitPrice, 'up'),
    };
    this.transmissionView.renderInlineTransmissionConsignModal();
  }

  /** 渲染发起拍卖独立弹层。 */
  private renderAuctionConsignModal(): void {
    this.auctionView.renderAuctionConsignModal();
  }

  /** 局部刷新发起拍卖弹层，避免服务端回包打断输入焦点。 */
  private patchAuctionConsignModalState(): void {
    this.auctionView.patchAuctionConsignModalState();
  }

  private renderAuctionModalBody(update: S2C_MarketUpdate): string {
    return this.auctionView.renderAuctionModalBody(update);
  }

  private renderAuctionSummaryCards(update: S2C_MarketUpdate): string {
    return this.auctionView.renderAuctionSummaryCards(update);
  }

  private renderAuctionParticipateTab(update: S2C_MarketUpdate, lots: any[]): string {
    return this.auctionView.renderAuctionParticipateTab(update, lots);
  }

  private renderAuctionMineTab(update: S2C_MarketUpdate, lots: any[]): string {
    return this.auctionView.renderAuctionMineTab(update, lots);
  }

  private renderAuctionFilterRail(): string {
    return this.auctionView.renderAuctionFilterRail();
  }

  private renderAuctionLotRow(lot: any, activeLotId: string, mine = false): string {
    return this.auctionView.renderAuctionLotRow(lot, activeLotId, mine);
  }

  private renderAuctionDetailPanel(lot: any, update: S2C_MarketUpdate, tab: AuctionHouseTab): string {
    return this.auctionView.renderAuctionDetailPanel(lot, update, tab);
  }

  private renderAuctionBidHistory(lot: any, currencyName: string): string {
    return this.auctionView.renderAuctionBidHistory(lot, currencyName);
  }

  private bindAuctionModalEvents(body: HTMLElement, signal: AbortSignal): void {
    this.auctionView.bindAuctionModalEvents(body, signal);
  }

  private patchAuctionActiveSelection(): void {
    this.auctionView.patchAuctionActiveSelection();
  }

  private patchAuctionDetailPanel(): void {
    this.auctionView.patchAuctionDetailPanel();
  }

  private patchAuctionDetailLiveState(): boolean {
    return this.auctionView.patchAuctionDetailLiveState();
  }

  private patchAuctionHistoryPanel(): boolean {
    return this.auctionView.patchAuctionHistoryPanel();
  }

  /** 拍卖行打开时只同步动态子区域，避免 1Hz 市场摘要回包重建整个弹层。 */
  private patchAuctionModalLiveState(options: { patchDetail?: boolean } = {}): void {
    if (this.auctionTab === 'history') {
      if (!this.patchAuctionHistoryPanel()) {
        this.renderAuctionModal();
      }
      return;
    }
    this.syncAuctionSelection();
    this.patchAuctionActiveSelection();
    const selectedAuctionLot = this.resolveAuctionLotByKey(this.selectedAuctionItemKey, this.marketUpdate, this.auctionTab);
    if (selectedAuctionLot) {
      this.requestItemBook(selectedAuctionLot.itemKey);
    }
    if (options.patchDetail !== false) {
      if (!this.patchAuctionDetailLiveState()) {
        this.patchAuctionDetailPanel();
      }
    }
    this.syncTradeDialogOverlay();
  }

  /** 同一拍卖分页的行情回包只更新状态，不重建弹层 DOM。 */
  private canPatchAuctionListingsInPlace(previous: S2C_AuctionListings | null, next: S2C_AuctionListings): boolean {
    if (!previous) {
      return false;
    }
    if (
      previous.tab !== next.tab
      || previous.page !== next.page
      || previous.pageSize !== next.pageSize
      || previous.total !== next.total
      || previous.category !== next.category
      || (previous.query ?? '') !== (next.query ?? '')
      || previous.items.length !== next.items.length
    ) {
      return false;
    }
    for (let index = 0; index < previous.items.length; index += 1) {
      const previousItem = previous.items[index]!;
      const nextItem = next.items[index]!;
      if (previousItem.id !== nextItem.id || previousItem.itemKey !== nextItem.itemKey) {
        return false;
      }
    }
    return true;
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
    return this.browseView.renderMarketTab(update);
  }

  private renderListedItem(entry: MarketListedItemView, activeItemKey: string, groupItemId?: string): string {
    return this.browseView.renderListedItem(entry, activeItemKey, groupItemId);
  }

  private renderGroupItem(entry: MarketListingGroupView, activeItemId: string): string {
    return this.browseView.renderGroupItem(entry, activeItemId);
  }

  private renderBookPanel(entry: MarketListedItemView, book: MarketOrderBookView | null, currencyName: string): string {
    return this.browseView.renderBookPanel(entry, book, currencyName);
  }

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

  private renderMarketBrowsePlaceholder(group: MarketListingGroupView | null, browsingEnhancementVariants: boolean): string {
    return this.browseView.renderMarketBrowsePlaceholder(group, browsingEnhancementVariants);
  }

  private renderPriceLevels(
    levels: MarketOrderBookView['sells'],
    currencyName: string,
    emptyText: string,
    quickAction?: { kind: MarketTradeDialogKind; label: string; disabled?: boolean; confirmPurchase?: boolean },
  ): string {
    return this.browseView.renderPriceLevels(levels, currencyName, emptyText, quickAction);
  }

  private renderBookLoading(text: string): string {
    return '<div class="empty-hint">' + escapeHtml(text) + '</div>';
  }

  private renderMyOrdersTab(update: S2C_MarketUpdate): string {
    return this.browseView.renderMyOrdersTab(update);
  }

  private renderTradeHistoryTab(currencyName: string): string {
    return this.browseView.renderTradeHistoryTab(currencyName);
  }

  private renderOwnOrder(order: MarketOwnOrderView, currencyName: string): string {
    return this.browseView.renderOwnOrder(order, currencyName);
  }

  private renderStorage(storage: MarketStorage): string {
    return this.browseView.renderStorage(storage);
  }

  private renderListToolbar(page: number, totalPages: number, totalItems: number): string {
    return this.browseView.renderListToolbar(page, totalPages, totalItems);
  }

  private renderVariantToolbar(group: MarketListingGroupView, totalVariants: number): string {
    return this.browseView.renderVariantToolbar(group, totalVariants);
  }

  private getTradeDialogViewState(
    entry: MarketListedItemView,
    currencyItemId: string,
    currencyName: string,
  ): MarketTradeDialogViewState | null {
    return this.tradeDialogView.getTradeDialogViewState(entry, currencyItemId, currencyName);
  }

  private renderTradeDialog(entry: MarketListedItemView, currencyItemId: string, currencyName: string): string {
    return this.tradeDialogView.renderTradeDialog(entry, currencyItemId, currencyName);
  }

  bindMarketModalDelegatedEvents(body: HTMLElement, signal: AbortSignal): void {
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
      const historyButton = target.closest<HTMLElement>('[data-market-history-page]');
      if (historyButton && body.contains(historyButton)) {
        const nextPage = Number.parseInt(historyButton.dataset.marketHistoryPage ?? '1', 10);
        if (Number.isFinite(nextPage) && nextPage !== this.tradeHistoryPage) {
          this.requestTradeHistory(nextPage);
          if (!this.patchTradeHistoryTab()) {
            this.renderModal();
          }
        }
        return;
      }
      const cancelOrderButton = target.closest<HTMLElement>('[data-market-cancel-order]');
      if (cancelOrderButton && body.contains(cancelOrderButton)) {
        const orderId = cancelOrderButton.dataset.marketCancelOrder;
        if (orderId) {
          this.callbacks?.onCancelOrder(orderId);
        }
        return;
      }
      const claimStorageButton = target.closest<HTMLElement>('[data-market-claim-storage]');
      if (claimStorageButton && body.contains(claimStorageButton)) {
        this.callbacks?.onClaimStorage();
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
  private getOpenTransmissionModalBody(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MarketTransmissionView.modalOwner)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  private getOpenAuctionModalBody(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  /** 读取当前已打开的发起拍卖弹层 body。 */
  private getOpenAuctionConsignModalBody(): HTMLElement | null {
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      return document.querySelector<HTMLElement>('[data-auction-consign-inline-body]');
    }
    if (!detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  /** 同步拍卖行当前选中项。 */
  private syncAuctionSelection(): void {
    this.auctionView.syncAuctionSelection();
  }

  private getAuctionPageState(items: ArrayLike<unknown>): { page: number; totalPages: number; totalItems: number } {
    return this.auctionView.getAuctionPageState(items);
  }

  getCurrentAuctionLots(): AuctionLotView[] {
    return this.auctionView.getCurrentAuctionLots();
  }

  private resolveAuctionLotByKey(
    lotId: string | null | undefined,
    update: S2C_MarketUpdate | null,
    tab: AuctionHouseTab = this.auctionTab,
  ): AuctionLotView | null {
    return this.auctionView.resolveAuctionLotByKey(lotId, update, tab);
  }

  private inflateAuctionLotEntry(entry: AuctionLotPageEntry): AuctionLotView {
    return this.auctionView.inflateAuctionLotEntry(entry);
  }

  buildMarketListingFromAuctionLot(lot: AuctionLotView): MarketListedItemView {
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

  private getAuctionRemainingSeconds(lot: AuctionLotView, now = Date.now()): number {
    return this.auctionView.getAuctionRemainingSeconds(lot, now);
  }

  private getAuctionTimeClass(remainingSeconds: number): string {
    return this.auctionView.getAuctionTimeClass(remainingSeconds);
  }

  private startAuctionCountdownTicker(): void {
    this.auctionView.startAuctionCountdownTicker();
  }

  private stopAuctionCountdownTicker(): void {
    this.auctionView.stopAuctionCountdownTicker();
  }

  private patchAuctionCountdowns(): void {
    this.auctionView.patchAuctionCountdowns();
  }

  private getAuctionQualityLabel(item: ItemStack): string {
    return this.auctionView.getAuctionQualityLabel(item);
  }

  private getAuctionItemInitial(name: string): string {
    return this.auctionView.getAuctionItemInitial(name);
  }

  private formatAuctionRemaining(seconds: number): string {
    return this.auctionView.formatAuctionRemaining(seconds);
  }

  private formatAuctionBidTime(createdAtMs: number): string {
    return this.auctionView.formatAuctionBidTime(createdAtMs);
  }

  private getAuctionSummary(update: S2C_MarketUpdate): S2C_AuctionListings['summary'] {
    return this.auctionView.getAuctionSummary(update);
  }

  private getAuctionCategoryCount(category: MarketCategoryFilter, fallback: number): number {
    return this.auctionView.getAuctionCategoryCount(category, fallback);
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
    replaceElementHtml(bookPanel, this.renderBookPanel(selected, orderBook, update.currencyItemName));
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

  /** 判断当前市场列表结构是否能在原 DOM 上热更新。 */
  private canPatchMarketModalUpdateInPlace(previous: S2C_MarketUpdate | null, next: S2C_MarketUpdate): boolean {
    if (this.modalTab !== 'market' || !previous) {
      return false;
    }
    const body = this.getOpenModalBody();
    if (!body?.querySelector('.market-market-tab')) {
      return false;
    }
    const renderedSignature = this.getRenderedMarketListSignature(body);
    if (!renderedSignature) {
      return false;
    }
    if (previous.listedItems === next.listedItems) {
      return true;
    }
    return renderedSignature === this.getExpectedMarketListSignature(next);
  }

  /** 判断当前列表回包是否仍对应现有 DOM 结构。 */
  private canPatchCurrentMarketListInPlace(): boolean {
    if (this.modalTab !== 'market') {
      return false;
    }
    const body = this.getOpenModalBody();
    if (!body?.querySelector('.market-market-tab')) {
      return false;
    }
    const renderedSignature = this.getRenderedMarketListSignature(body);
    return Boolean(this.marketUpdate && renderedSignature && renderedSignature === this.getExpectedMarketListSignature(this.marketUpdate));
  }

  /** 同步普通坊市弹层的可变数据，避免每秒重建 hover 中的物品节点。 */
  private patchMarketModalLiveState(options: { patchBook?: boolean; requireStableList?: boolean } = {}): boolean {
    if (this.modalTab !== 'market') {
      return false;
    }
    const body = this.getOpenModalBody();
    if (!body?.querySelector('.market-market-tab')) {
      return false;
    }
    if (options.requireStableList === false) {
      return false;
    }
    if (options.patchBook) {
      const selected = this.getSelectedListedItem(this.marketUpdate);
      if (!selected || !this.marketUpdate) {
        return false;
      }
      this.patchSelectedBookPanel();
    }
    this.patchMarketActiveSelection();
    this.patchVisibleMarketListPrices(body);
    this.syncVisibleMarketInventoryState();
    this.refreshMarketTooltipContent(body);
    this.syncTradeDialogOverlay();
    return true;
  }

  /** 局部刷新我的订单 tab，避免订单/仓库回包重建整个弹层。 */
  private patchMyOrdersTab(): boolean {
    if (this.modalTab !== 'my-orders' || !this.marketUpdate) {
      return false;
    }
    const content = this.getOpenModalBody()?.querySelector<HTMLElement>('.market-modal-content');
    if (!content?.querySelector('.market-my-orders')) {
      return false;
    }
    const scrollTop = content.scrollTop;
    replaceElementHtml(content, this.renderMyOrdersTab(this.marketUpdate));
    content.scrollTop = scrollTop;
    this.syncTradeDialogOverlay();
    return true;
  }

  /** 局部刷新交易历史 tab，避免历史分页回包重建整个弹层。 */
  private patchTradeHistoryTab(): boolean {
    if (this.modalTab !== 'trade-history' || !this.marketUpdate) {
      return false;
    }
    const content = this.getOpenModalBody()?.querySelector<HTMLElement>('.market-modal-content');
    if (!content?.querySelector('.market-trade-history')) {
      return false;
    }
    const scrollTop = content.scrollTop;
    replaceElementHtml(content, this.renderTradeHistoryTab(this.marketUpdate.currencyItemName));
    content.scrollTop = scrollTop;
    this.syncTradeDialogOverlay();
    return true;
  }

  /** 读取当前 DOM 中市场列表的结构签名。 */
  private getRenderedMarketListSignature(body: HTMLElement): string | null {
    const itemButtons = [...body.querySelectorAll<HTMLElement>('[data-market-select-item]')];
    if (itemButtons.length > 0) {
      return `items:${itemButtons.map((button) => button.dataset.marketSelectItem ?? '').join('|')}`;
    }
    const groupButtons = [...body.querySelectorAll<HTMLElement>('[data-market-select-group]')];
    if (groupButtons.length > 0) {
      return `groups:${groupButtons.map((button) => button.dataset.marketSelectGroup ?? '').join('|')}`;
    }
    return null;
  }

  /** 按当前筛选和浏览模式生成列表期望结构签名。 */
  private getExpectedMarketListSignature(update: S2C_MarketUpdate): string {
    const groups = this.getVisibleListingGroups(update);
    const selectedGroup = groups.find((item) => item.itemId === this.selectedGroupItemId) ?? groups[0] ?? null;
    const browsingEnhancementVariants = Boolean(selectedGroup?.canEnhance && this.enhancementBrowseItemId === selectedGroup.itemId);
    if (browsingEnhancementVariants) {
      return `items:${(selectedGroup?.variants ?? []).map((entry) => entry.itemKey).join('|')}`;
    }
    return `groups:${groups.map((entry) => entry.itemId).join('|')}`;
  }

  /** 局部同步当前可见列表卡片的买卖价文本。 */
  private patchVisibleMarketListPrices(body: HTMLElement): void {
    const syncPriceText = (button: HTMLElement, entry: MarketListedItemView | null): void => {
      const priceNodes = button.querySelectorAll<HTMLElement>('.market-item-cell-prices span');
      if (priceNodes.length < 2) {
        return;
      }
      priceNodes[0]!.textContent = `卖 ${entry?.lowestSellPrice !== undefined ? this.formatMarketUnitPrice(entry.lowestSellPrice) : '--'}`;
      priceNodes[1]!.textContent = `买 ${entry?.highestBuyPrice !== undefined ? this.formatMarketUnitPrice(entry.highestBuyPrice) : '--'}`;
    };
    body.querySelectorAll<HTMLElement>('[data-market-select-item]').forEach((button) => {
      syncPriceText(button, this.resolveMarketTooltipEntry(button.dataset.marketSelectItem ?? ''));
    });
    const groups = new Map(this.getVisibleListingGroups(this.marketUpdate).map((entry) => [entry.itemId, entry] as const));
    body.querySelectorAll<HTMLElement>('[data-market-select-group]').forEach((button) => {
      const group = groups.get(button.dataset.marketSelectGroup ?? '') ?? null;
      syncPriceText(button, group ? this.getGroupReferenceEntry(group) : null);
    });
  }

  /** 如果 tooltip 的锚点还在原 DOM 中，只刷新内容，不关闭浮层。 */
  private refreshMarketTooltipContent(body: HTMLElement): void {
    if (!this.tooltipNode) {
      return;
    }
    if (!this.tooltipNode.isConnected || !body.contains(this.tooltipNode)) {
      this.tooltipNode = null;
      this.tooltip.hide();
      return;
    }
    const tooltip = this.resolveMarketTooltipPayload(this.tooltipNode);
    if (!tooltip) {
      this.tooltipNode = null;
      this.tooltip.hide();
      return;
    }
    this.tooltip.updateContent(tooltip.title, tooltip.lines, {
      allowHtml: tooltip.allowHtml,
      asideCards: tooltip.asideCards,
    });
  }

  /** 读取当前选中的列表物品。 */
  getSelectedListedItem(update: S2C_MarketUpdate | null): MarketListedItemView | null {
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
   count: number
  }> = [
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
   count: number
  }> = [
      {
        id: 'all',
        label: t('market.filter.equipment-all', undefined),
        count: this.getMarketEquipmentSlotCount('all', listedItems.filter((item) => item.item.type === 'equipment').length),
      },
      ...COMBAT_EQUIP_SLOTS.map((slot) => ({
        id: slot,
        label: getEquipSlotLabel(slot),
        count: this.getMarketEquipmentSlotCount(slot, listedItems.filter((item) => item.item.type === 'equipment' && item.item.equipSlot === slot).length),
      })),
      {
        id: 'technique',
        label: '技艺',
        count: this.getMarketEquipmentSlotCount('technique', listedItems.filter((item) => item.item.type === 'equipment' && isTechniqueEquipmentSlot(item.item.equipSlot)).length),
      },
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
      items = this.activeEquipmentCategory === 'technique'
        ? items.filter((item) => isTechniqueEquipmentSlot(item.item.equipSlot))
        : items.filter((item) => item.item.equipSlot === this.activeEquipmentCategory);
    }
    if (this.activeCategory === 'skill_book' && this.activeTechniqueCategory !== 'all') {
      items = items.filter((item) => this.resolveTechniqueCategoryForItem(item.item) === this.activeTechniqueCategory);
    }
    if (this.activeCategory === 'consumable' && this.activeConsumableCategory !== 'all') {
      items = items.filter((item) => resolveMarketConsumableCategory(item.item) === this.activeConsumableCategory);
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
  getVisibleListingGroups(update: S2C_MarketUpdate | null): MarketListingGroupView[] {
    return this.browseView.getVisibleListingGroups(update);
  }

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
        name: '未知物品',
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
      baselineHealPercent: template.baselineHealPercent,
      baselineQiPercent: template.baselineQiPercent,
      qiPercent: template.qiPercent,
      cooldown: template.cooldown,
      consumeBuffs: template.consumeBuffs,
      tags: template.tags,
      enhanceLevel: enhanceLevel ?? template.enhanceLevel,
      mapUnlockId: template.mapUnlockId,
      mapUnlockIds: template.mapUnlockIds,
      respawnBindMapId: template.respawnBindMapId,
      useBehavior: template.useBehavior,
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
    return this.activeCategory === 'equipment' || this.activeCategory === 'skill_book' || this.activeCategory === 'consumable';
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

  /** 市场列表发生修订时显式失效书籍缓存，旧异步响应通过 epoch 被拒绝。 */
  private invalidateItemBookCache(): void {
    this.itemBookCacheEpoch += 1;
    this.itemBookCache.clear();
    this.itemBook = null;
    this.itemBookLoading = false;
  }

  /** 仅跟踪会改变盘口的字段，避免每息相同摘要导致持续请求。 */
  private buildItemBookRevisionSignature(data: S2C_MarketUpdate): string {
    return data.myOrders
      .map((order) => `${order.id}:${order.status}:${order.remainingQuantity}:${order.unitPrice}`)
      .sort()
      .join('|');
  }

  /** 向外部请求某个物品的书籍详情。 */
  private requestItemBook(itemKey: string): void {
    const cached = this.itemBookCache.get(itemKey);
    if (
      cached
      && cached.epoch === this.itemBookCacheEpoch
      && Date.now() - cached.cachedAt <= ITEM_BOOK_CACHE_MAX_AGE_MS
    ) {
      this.itemBook = cached.book;
      this.itemBookLoading = false;
      return;
    }
    if (cached) {
      this.invalidateItemBookCache();
    }
    if (this.pendingItemBookEpochs.has(itemKey)) {
      this.itemBookLoading = true;
      return;
    }
    this.itemBookLoading = true;
    this.pendingItemBookEpochs.set(itemKey, this.itemBookCacheEpoch);
    this.callbacks?.onRequestItemBook(itemKey);
  }

  /** 向外部请求交易历史分页。 */
  private requestTradeHistory(page: number, source?: 'market' | 'auction', scope?: MarketTradeHistoryScope): void {
    this.tradeHistoryLoading = true;
    this.tradeHistoryPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    const requestSource = source ?? (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER) ? 'auction' : 'market');
    const requestScope = requestSource === 'auction' ? (scope ?? this.auctionHistoryScope) : 'mine';
    this.pendingTradeHistoryKey = [requestSource, requestScope, this.tradeHistoryPage].join('|');
    this.callbacks?.onRequestTradeHistory(this.tradeHistoryPage, requestSource, requestScope);
  }

  /** 向外部请求当前筛选条件下的列表分页。 */
  private requestListings(page: number): void {
    const nextPage = normalizeMarketRequestPage(page);
    const pageSize = normalizeMarketListingsPageSize(this.getMarketPageSize());
    const equipmentSlot = this.activeCategory === 'equipment' ? this.activeEquipmentCategory : 'all';
    const techniqueCategory = this.activeCategory === 'skill_book' ? this.activeTechniqueCategory : 'all';
    const consumableCategory = this.activeCategory === 'consumable' ? this.activeConsumableCategory : 'all';
    this.pendingListingsRequest = {
      category: this.activeCategory,
      equipmentSlot,
      techniqueCategory,
      consumableCategory,
      page: nextPage,
      pageSize,
    };
    this.callbacks?.onRequestListings({
      page: nextPage,
      pageSize,
      category: this.activeCategory,
      equipmentSlot,
      techniqueCategory,
      consumableCategory,
    });
  }

  /** 向外部请求当前筛选条件下的拍卖行分页，每页固定最多 10 条。 */
  private requestAuctionListings(page: number): void {
    const nextPage = normalizeMarketRequestPage(page);
    const pageSize = normalizeMarketAuctionPageSize(AUCTION_PAGE_SIZE);
    this.auctionPage = nextPage;
    const query = normalizeMarketAuctionQuery(this.auctionSearchQuery);
    this.auctionSearchQuery = query;
    this.pendingAuctionRequest = {
      tab: this.auctionTab,
      category: this.auctionCategory,
      query,
      page: nextPage,
      pageSize,
    };
    this.callbacks?.onRequestAuctionListings({
      tab: this.auctionTab,
      page: nextPage,
      pageSize,
      category: this.auctionCategory,
      query,
    });
  }

  /** 向外部请求传法台分页，每页固定最多 10 条。 */
  private requestTransmissionListings(page: number): void {
    const nextPage = normalizeMarketRequestPage(page);
    const pageSize = normalizeMarketAuctionPageSize(AUCTION_PAGE_SIZE);
    this.transmissionPage = nextPage;
    const query = normalizeMarketAuctionQuery(this.transmissionSearchQuery);
    this.transmissionSearchQuery = query;
    const category = normalizeTransmissionCategory(this.transmissionCategory);
    const sort = normalizeTransmissionListingSort(this.transmissionSort);
    this.transmissionCategory = category;
    this.transmissionSort = sort;
    this.pendingTransmissionRequest = {
      tab: this.transmissionTab,
      query,
      category,
      sort,
      page: nextPage,
      pageSize,
    };
    this.callbacks?.onRequestTransmissionListings({
      tab: this.transmissionTab,
      page: nextPage,
      pageSize,
      query,
      category,
      sort,
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
    this.tradeDialogView.openTradeDialog(entry, kind, preferredPrice, confirmPurchase);
  }

  private openAuctionBidDialog(entry: MarketListedItemView, lot: AuctionLotView): void {
    this.tradeDialogView.openAuctionBidDialog(entry, lot);
  }

  private openAuctionBuyoutConfirm(entry: MarketListedItemView, lot: AuctionLotView): void {
    this.tradeDialogView.openAuctionBuyoutConfirm(entry, lot);
  }

  private renderBuyConfirmBody(entry: MarketListedItemView, currencyName: string, quantity: number, unitPrice: number): string {
    return this.tradeDialogView.renderBuyConfirmBody(entry, currencyName, quantity, unitPrice);
  }

  private renderAuctionBuyoutConfirmBody(
    lot: AuctionLotView,
    currencyName: string,
    quantity: number,
    unitPrice: number,
    totalCost: number | null,
    insufficientCurrency: boolean,
  ): string {
    return this.tradeDialogView.renderAuctionBuyoutConfirmBody(lot, currencyName, quantity, unitPrice, totalCost, insufficientCurrency);
  }

  private estimateImmediateBuy(entry: MarketListedItemView, quantity: number, unitPrice: number): {
    immediateQuantity: number;
    pendingQuantity: number;
  } {
    return this.tradeDialogView.estimateImmediateBuy(entry, quantity, unitPrice);
  }

  private syncTradeDialogOverlay(): void {
    this.tradeDialogView.syncTradeDialogOverlay();
  }

  private patchTradeDialogOverlay(
    root: HTMLElement,
    selected: MarketListedItemView,
    update: S2C_MarketUpdate,
  ): boolean {
    return this.tradeDialogView.patchTradeDialogOverlay(root, selected, update);
  }

  private bindTradeDialogOverlayEvents(
    root: HTMLElement,
    selected: MarketListedItemView,
    update: S2C_MarketUpdate,
  ): void {
    this.tradeDialogView.bindTradeDialogOverlayEvents(root, selected, update);
  }

  private openBuyConfirm(entry: MarketListedItemView, quantity: number, unitPrice: number): void {
    this.tradeDialogView.openBuyConfirm(entry, quantity, unitPrice);
  }

  private getTradeDialogOverlayRoot(): HTMLElement {
    return this.tradeDialogView.getTradeDialogOverlayRoot();
  }

  findConflictingOwnOrder(itemKey: string, nextSide: MarketTradeDialogKind): MarketOwnOrderView | null {
    return findConflictingOwnOrderImpl(this, itemKey, nextSide);
  }

  /** 读取交易弹窗的默认单价，优先沿用当前盘面价格。 */
  getDefaultTradeDialogPrice(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null): number {
    return getDefaultTradeDialogPriceImpl(this, entry, kind, preferredPrice);
  }

  /** 拍卖最低加价为当前价沿坊市价格档位向上一档。 */
  getAuctionMinimumBidPrice(lot: AuctionLotView): number {
    return getAuctionMinimumBidPriceImpl(this, lot);
  }

  /** 读取当前交易弹窗的最低价格约束。 */
  getTradeDialogMinUnitPrice(dialog: MarketTradeDialogState): number {
    return getTradeDialogMinUnitPriceImpl(this, dialog);
  }

  /** 规范化交易弹窗里的数量输入，强制对齐最小交易步长。 */
  normalizeTradeDialogQuantity(
    value: string | number,
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    unitPrice = this.tradeDialog?.unitPrice ?? MARKET_DIALOG_MIN_PRICE,
  ): number {
    return normalizeTradeDialogQuantityImpl(this, value, entry, kind, unitPrice);
  }

  /** 根据单价计算这笔交易的最小数量步长。 */
  getTradeDialogQuantityStep(unitPrice: number): number {
    return getTradeDialogQuantityStepImpl(this, unitPrice);
  }

  /** 历史异常小数价按 ceil(1 / 单价) 计算最低成交件数，再对齐当前挂单步长。 */
  getTradeDialogMinimumQuantity(
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    unitPrice: number,
  ): number {
    return getTradeDialogMinimumQuantityImpl(this, entry, kind, unitPrice);
  }

  /** 计算当前单价下允许输入的最大数量。 */
  getTradeDialogQuantityMax(
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    unitPrice: number,
  ): number {
    return getTradeDialogQuantityMaxImpl(this, entry, kind, unitPrice);
  }

  /** 给"最大"按钮计算对应的可交易数量。 */
  getTradeDialogMaxButtonQuantity(
    entry: MarketListedItemView,
    _currencyItemId: string,
    dialog: MarketTradeDialogState,
  ): number {
    return getTradeDialogMaxButtonQuantityImpl(this, entry, _currencyItemId, dialog);
  }

  /** 计算当前持币量在该单价下最多能买多少。 */
  getAffordableBuyQuantity(unitPrice: number, currencyItemId: string): number {
    return getAffordableBuyQuantityImpl(this, unitPrice, currencyItemId);
  }

  /** 按按钮动作算出下一个单价，并保持在合法范围内。 */
  getNextTradeDialogPrice(currentPrice: number, action: MarketPriceAction, preset?: number | null, minPrice: number = MARKET_DIALOG_MIN_PRICE): number {
    return getNextTradeDialogPriceImpl(this, currentPrice, action, preset, minPrice);
  }

  /** 按买卖方向把单价夹回合法区间并对齐价格档位。 */
  normalizeTradeDialogPrice(value: number, direction: 'up' | 'down'): number {
    return normalizeTradeDialogPriceImpl(this, value, direction);
  }

  /** 把价格预设值格式化成按钮上更容易读的文案。 */
  formatPricePresetLabel(value: number): string {
    return formatPricePresetLabelImpl(this, value);
  }

  /** 从 data-* 属性里读一个数字。 */
  readDatasetNumber(value: string | undefined): number | null {
    return readDatasetNumberImpl(value);
  }

  /** 格式化市场里的单价显示。 */
  formatMarketUnitPrice(value: number): string {
    return formatMarketUnitPriceImpl(value);
  }

  /** 格式化强化预估里的灵石消耗。 */
  formatEnhancementEstimateCost(value: number): string {
    return formatEnhancementEstimateCostImpl(value);
  }

  /** 格式化强化预估里的尝试次数。 */
  formatEnhancementAttemptCount(value: number): string {
    return formatEnhancementAttemptCountImpl(value);
  }

  /** 计算单次强化任务的基础耗时。 */
  computeEnhancementJobBaseTicks(itemLevel: number | undefined): number {
    return computeEnhancementJobBaseTicksImpl(itemLevel);
  }

  /** 把耗时 ticks 转成更像人工可读的时间。 */
  formatEnhancementDurationFromTicks(value: number): string {
    return formatEnhancementDurationFromTicksImpl(value);
  }

  /** 计算这笔交易的总金额。 */
  getMarketTradeTotalCost(quantity: number, unitPrice: number): number | null {
    return getMarketTradeTotalCostImpl(quantity, unitPrice);
  }

  /** 读取装备在市场里的强化等级。 */
  getMarketEnhanceLevel(item: ItemStack): number {
    return getMarketEnhanceLevelImpl(item);
  }

  /** 把装备条目显示成带强化等级前缀的名字。 */
  getMarketDisplayName(item: ItemStack): string {
    return getMarketDisplayNameImpl(item);
  }

  /** 读取本地盘面里 +0 同款装备的最低卖价。 */
  getLocalZeroEnhancementLowestSellPrice(itemId: string): number | undefined {
    return getLocalZeroEnhancementLowestSellPriceImpl(this, itemId);
  }

  /** 把基础物品提示补上强化预估内容。 */
  buildMarketItemTooltipPayload(item: ItemStack) {
    return buildMarketItemTooltipPayloadImpl(this, item);
  }

  /** 根据节点上的 data-* 标记找到对应的提示内容。 */
  resolveMarketTooltipPayload(node: HTMLElement) {
    return resolveMarketTooltipPayloadImpl(this, node);
  }

  /** 按 key 读取 tooltip 用的市场条目，包含本地补出的强化档位。 */
  resolveMarketTooltipEntry(itemKey: string): MarketListedItemView | null {
    return resolveMarketTooltipEntryImpl(this, itemKey);
  }

  /** 读取当前已经缓存到面板内的列表项。 */
  getKnownListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[] {
    return getKnownListedItemsImpl(update);
  }

  /** 根据市场盘面和当前物品推一版强化预估。 */
  buildEnhancementEstimate(item: ItemStack): MarketEnhancementEstimateView | null {
    return buildEnhancementEstimateImpl(this, item);
  }

  /** 在背包里找一个能对应当前物品的稳定实例 ID。 */
  findMatchingInventoryItemInstanceId(item: ItemStack): string | null {
    return findMatchingInventoryItemInstanceIdImpl(this, item);
  }

  /** 统计背包里与当前物品匹配的总数量。 */
  findMatchingInventoryCount(item: ItemStack): number {
    return findMatchingInventoryCountImpl(this, item);
  }

  /** 按物品 id 统计背包里的总数量。 */
  findInventoryItemCountByItemId(itemId: string): number {
    return findInventoryItemCountByItemIdImpl(this, itemId);
  }

  /** 按装备强化等级统计持有数量，避免强化占位档位退回到同物品总数。 */
  findEquipmentInventoryCountByLevel(itemId: string, enhanceLevel: number): number {
    return findEquipmentInventoryCountByLevelImpl(this, itemId, enhanceLevel);
  }
}

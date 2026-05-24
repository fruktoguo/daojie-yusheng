/**
 * 本文件是客户端 DOM UI 的 market panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
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
  AUCTION_DEFAULT_DURATION_HOURS,
  EQUIP_SLOTS,
  EquipSlot,
  HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID,
  HEAVENLY_DAO_SHOP_ITEMS,
  getMarketMinimumTradeQuantity,
  Inventory,
  ITEM_TYPES,
  ItemStack,
  ItemType,
  MARKET_MAX_ENHANCE_LEVEL,
  MARKET_MAX_UNIT_PRICE,
  MARKET_PRICE_PRESET_VALUES,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  MarketTradeHistoryScope,
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
import { buildItemTooltipPayload, describeItemEffectDetails } from '../equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { confirmModalHost } from '../confirm-modal-host';
import { preserveSelection } from '../selection-preserver';
import { MARKET_MODAL_TABS, MarketModalTab } from '../../constants/ui/market';
import { getPlayerOwnedItemCount } from '../../utils/player-wallet';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';
import { t } from '../i18n';
import { MarketAuctionView } from './market-auction-view';
import { MarketTradeDialog } from './market-trade-dialog';
import { renderTradeQuantityControl } from '../trade-control-renderers';
import { MarketBrowseView } from './market-browse-view';
import type { MarketPanelInternals } from './market-panel-types';
import {
  mountReactMarketPanel,
  setReactMarketPanelCallbacks,
  shouldUseReactMarketPanel,
  syncReactMarketPanelState,
  unmountReactMarketPanel,
} from '../../react-ui/panels/market/mount-market-panel';

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

/** 拍卖寄拍独立面板里的可编辑状态。 */
interface AuctionConsignPanelState {
  open: boolean;
  itemInstanceId: string | null;
  quantity: number;
  totalPrice: number;
  buyoutPrice: number;
  durationHours: number;
  query: string;
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
  enhanceLevelLabel: string | null;
  realmLevelLabel: string | null;
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
/** 天道商店客户端输入上限；服务端仍按固定表和权威上限最终校验。 */
const HEAVENLY_DAO_SHOP_MAX_QUANTITY = 9_999;
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
  /** 发起拍卖独立弹窗的归属标识。 */
  private static readonly AUCTION_CONSIGN_MODAL_OWNER = 'auction-consign-panel';
  /** 天道商店独立弹窗的归属标识。 */
  private static readonly HEAVENLY_DAO_SHOP_MODAL_OWNER = 'heavenly-dao-shop-panel';
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
  /** 天道商店当前选中的固定商品。 */
  private heavenlyDaoShopSelectedItemId: string | null = HEAVENLY_DAO_SHOP_ITEMS[0]?.itemId ?? null;
  /** 天道商店每个商品的数量草稿。 */
  private readonly heavenlyDaoShopQuantityDrafts = new Map<string, string>();
  /** 天道商店依赖的资产投影签名，用于跳过无变化的每息刷新。 */
  private heavenlyDaoShopAssetSignature = '';
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
  /** @internal 拍卖行子视图。 */
  readonly auctionView = new MarketAuctionView(this as unknown as MarketPanelInternals);
  /** @internal 交易弹窗子视图。 */
  readonly tradeDialogView = new MarketTradeDialog(this as unknown as MarketPanelInternals);
  /** @internal 浏览列表子视图。 */
  readonly browseView = new MarketBrowseView(this as unknown as MarketPanelInternals);

  constructor() {
    setReactMarketPanelCallbacks({
      onRequestMarket: () => {
        if (!this.requestMarketBootstrap()) {
          this.callbacks?.onRequestMarket();
        }
      },
      onOpenModal: () => this.openMarketFromPane(),
      onOpenAuction: (tab) => this.openAuctionFromPane(tab),
      onOpenAuctionConsign: () => this.openAuctionConsignFromPane(),
      onOpenHeavenlyDaoShop: () => this.openHeavenlyDaoShopFromPane(),
      onBuyHeavenlyDaoShopItem: (itemId, quantity) => this.callbacks?.onBuyHeavenlyDaoShopItem(itemId, quantity),
    });
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
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER)) {
      this.patchAuctionConsignModalState();
    } else if (shouldPatchHeavenlyDaoShop) {
      this.patchHeavenlyDaoShopModal();
    }
  }

  /** 更新市场主视图。 */
  updateMarket(data: S2C_MarketUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const marketModalOpen = detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER);
    const auctionModalOpen = detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER);
    const auctionConsignModalOpen = detailModalHost.isOpenFor(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER);
    const previousMarketUpdate = this.marketUpdate;
    const previousSelectedItemKey = this.selectedItemKey;
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
    this.renderPane();
    if (marketModalOpen) {
      if (this.modalTab === 'market' && this.selectedItemKey) {
        this.requestItemBook(this.selectedItemKey);
      }
      if (this.patchMarketModalLiveState({ patchBook: previousSelectedItemKey !== this.selectedItemKey, requireStableList: canPatchMarketModal })) {
        return;
      }
      this.renderModal();
    } else if (auctionModalOpen) {
      this.patchAuctionModalLiveState({ patchDetail: false });
    } else if (auctionConsignModalOpen) {
      this.patchAuctionConsignModalState();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  /** 更新列表分页数据。 */
  updateListings(data: S2C_MarketListings): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const marketModalOpen = detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER);
    const previousSelectedItemKey = this.selectedItemKey;
    this.marketListings = data;
    this.currentPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    this.activeCategory = data.category;
    this.activeEquipmentCategory = data.category === 'equipment' ? data.equipmentSlot : 'all';
    this.activeTechniqueCategory = data.category === 'skill_book' ? data.techniqueCategory : 'all';
    this.marketUpdate = this.mergeListingsIntoMarketUpdate(this.marketUpdate, data);
    this.syncPageSelection();
    const canPatchMarketModal = marketModalOpen && this.canPatchCurrentMarketListInPlace();
    this.renderPane();
    if (marketModalOpen) {
      if (this.patchMarketModalLiveState({ patchBook: previousSelectedItemKey !== this.selectedItemKey, requireStableList: canPatchMarketModal })) {
        return;
      }
      this.renderModal();
    }
  }

  /** 更新拍卖行分页数据。 */
  updateAuctionListings(data: S2C_AuctionListings): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const previousListings = this.auctionListings;
    const previousSelectedAuctionItemKey = this.selectedAuctionItemKey;
    const canPatchOpenModal = detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)
      && this.canPatchAuctionListingsInPlace(previousListings, data);
    this.auctionListings = data;
    if (this.auctionTab !== 'history') {
      this.auctionTab = data.tab;
    }
    this.auctionCategory = data.category;
    this.auctionSearchQuery = data.query ?? '';
    this.auctionPage = Math.max(1, Math.floor(Number.isFinite(data.page) ? data.page : 1));
    this.syncAuctionSelection();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      if (canPatchOpenModal) {
        this.patchAuctionActiveSelection();
        this.patchAuctionCountdowns();
        if (previousSelectedAuctionItemKey !== this.selectedAuctionItemKey) {
          this.patchAuctionDetailPanel();
        } else if (!this.patchAuctionDetailLiveState()) {
          this.patchAuctionDetailPanel();
        }
        this.syncTradeDialogOverlay();
        return;
      }
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
      if (this.patchMarketModalLiveState()) {
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
      if (this.patchMarketModalLiveState()) {
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

    this.tradeHistoryLoading = false;
    this.tradeHistory = data;
    this.tradeHistoryPage = data.page;
    if (data.source === 'auction') {
      this.auctionHistoryScope = data.scope;
    }
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    } else if (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER)) {
      this.patchAuctionModalLiveState();
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
    this.heavenlyDaoShopSelectedItemId = HEAVENLY_DAO_SHOP_ITEMS[0]?.itemId ?? null;
    this.heavenlyDaoShopQuantityDrafts.clear();
    this.heavenlyDaoShopAssetSignature = '';
    this.modalTab = 'market';
    this.activeCategory = 'all';
    this.activeEquipmentCategory = 'all';
    this.activeTechniqueCategory = 'all';
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
    if (this.useReactPanel()) {
      this.syncReactState();
      mountReactMarketPanel();
    }
    this.renderPane();
    confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
    detailModalHost.close(MarketPanel.MODAL_OWNER);
    detailModalHost.close(MarketPanel.AUCTION_MODAL_OWNER);
    detailModalHost.close(MarketPanel.AUCTION_CONSIGN_MODAL_OWNER);
    detailModalHost.close(MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER);
  }

  /** 渲染坊市 tab 首屏入口，只保留独立界面按钮。 */
  private renderPane(): void {
    if (this.useReactPanel()) {
      this.syncReactState();
      mountReactMarketPanel();
      return;
    }
    preserveSelection(this.pane, () => {
      replaceElementHtml(this.pane, `
        <div class="panel-section market-pane ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">${escapeHtml(t('market.pane.title', undefined))}</div>
          <div class="market-pane-entry-actions">
            <button class="small-btn" data-market-open type="button">坊市</button>
            <button class="small-btn" data-auction-open="participate" type="button">拍卖行</button>
            <button class="small-btn" data-heavenly-dao-shop-open type="button">天道商店</button>
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
        this.openMarketFromPane();
        return;
      }
      const auctionOpen = target.closest<HTMLElement>('[data-auction-open]');
      if (auctionOpen) {
        const tab = auctionOpen.dataset.auctionOpen === 'mine' ? 'mine' : auctionOpen.dataset.auctionOpen === 'history' ? 'history' : 'participate';
        this.openAuctionFromPane(tab);
        return;
      }
      if (target.closest('[data-auction-consign-open]')) {
        this.openAuctionConsignFromPane();
        return;
      }
      if (target.closest('[data-heavenly-dao-shop-open]')) {
        this.openHeavenlyDaoShopFromPane();
        return;
      }
    });
  }

  private useReactPanel(): boolean {
    return shouldUseReactMarketPanel();
  }

  private syncReactState(): void {
    syncReactMarketPanelState({
      marketUpdate: this.marketUpdate,
      inventory: this.inventory,
      player: this.player,
      auctionStats: this.getAuctionPaneStats(this.marketUpdate),
      totalListings: this.marketListings?.total ?? this.marketUpdate?.listedItems.length ?? 0,
      currentPage: this.currentPage,
      totalPages: this.getMarketTotalPagesForSummary(),
    });
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

  private openAuctionConsignFromPane(): void {
    if (!this.requestMarketBootstrap()) {
      this.callbacks?.onRequestMarket();
    }
    this.openAuctionConsignModal();
  }

  private openHeavenlyDaoShopFromPane(): void {
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
    return getLocalItemTemplate(HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID)?.name ?? '功德';
  }

  private getHeavenlyDaoShopCurrencyOwned(): number {
    return getPlayerOwnedItemCount(this.player, this.inventory, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID);
  }

  private captureHeavenlyDaoShopAssetSignature(player: PlayerState | null, inventory: Inventory): boolean {
    const nextSignature = this.buildHeavenlyDaoShopAssetSignature(player, inventory);
    if (nextSignature === this.heavenlyDaoShopAssetSignature) {
      return false;
    }
    this.heavenlyDaoShopAssetSignature = nextSignature;
    return true;
  }

  private buildHeavenlyDaoShopAssetSignature(player: PlayerState | null, inventory: Inventory): string {
    const trackedItemIds = new Set<string>([HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID]);
    for (const entry of HEAVENLY_DAO_SHOP_ITEMS) {
      trackedItemIds.add(entry.itemId);
    }
    const parts: string[] = [];
    for (const itemId of trackedItemIds) {
      parts.push(`${itemId}:${getPlayerOwnedItemCount(player, inventory, itemId)}`);
    }
    return parts.join('|');
  }

  private getHeavenlyDaoShopEntry(itemId: string | null) {
    if (!itemId) {
      return null;
    }
    return HEAVENLY_DAO_SHOP_ITEMS.find((entry) => entry.itemId === itemId) ?? null;
  }

  private ensureHeavenlyDaoShopSelection() {
    const selected = this.getHeavenlyDaoShopEntry(this.heavenlyDaoShopSelectedItemId);
    if (selected) {
      return selected;
    }
    const first = HEAVENLY_DAO_SHOP_ITEMS[0] ?? null;
    this.heavenlyDaoShopSelectedItemId = first?.itemId ?? null;
    return first;
  }

  private buildHeavenlyDaoShopItemStack(itemId: string, count: number): ItemStack | null {
    const template = getLocalItemTemplate(itemId);
    if (!template) {
      return null;
    }
    return {
      ...template,
      count,
      desc: template.desc ?? '',
    };
  }

  private parseHeavenlyDaoShopQuantity(itemId: string): number | null {
    const raw = this.heavenlyDaoShopQuantityDrafts.get(itemId) ?? '1';
    if (!raw || !/^\d+$/.test(raw)) {
      return null;
    }
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > HEAVENLY_DAO_SHOP_MAX_QUANTITY) {
      return null;
    }
    return quantity;
  }

  private renderHeavenlyDaoShopRows(): string {
    const owned = this.getHeavenlyDaoShopCurrencyOwned();
    const currencyName = this.getHeavenlyDaoShopCurrencyName();
    const selectedItemId = this.ensureHeavenlyDaoShopSelection()?.itemId ?? null;
    return HEAVENLY_DAO_SHOP_ITEMS.map((entry) => {
      const template = getLocalItemTemplate(entry.itemId);
      const itemName = template?.name ?? entry.itemId;
      const countText = entry.count > 1 ? ` x${formatDisplayInteger(entry.count)}` : '';
      const ownedCount = getPlayerOwnedItemCount(this.player, this.inventory, entry.itemId);
      const insufficient = owned < entry.price;
      const active = entry.itemId === selectedItemId ? ' active' : '';
      return `
        <button class="market-item-cell ui-surface-card ui-surface-card--compact${active}" data-heavenly-dao-shop-select="${escapeHtmlAttr(entry.itemId)}" type="button">
          <div class="market-item-cell-name">
            <span class="market-item-cell-name-text market-item-title--interactive" data-market-item-tooltip="heavenly-dao-shop:${escapeHtmlAttr(entry.itemId)}">${escapeHtml(itemName)}${escapeHtml(countText)}</span>
            <span class="market-item-cell-owned ${ownedCount > 0 ? '' : 'hidden'}">${ownedCount > 0 ? formatDisplayCountBadge(ownedCount) : ''}</span>
          </div>
          <div class="market-item-cell-prices">
            <span>${formatDisplayInteger(entry.price)} ${escapeHtml(currencyName)}</span>
            <span>${insufficient ? `${escapeHtml(currencyName)}不足` : '可兑换'}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  private renderHeavenlyDaoShopDetailPanel(): string {
    const entry = this.ensureHeavenlyDaoShopSelection();
    if (!entry) {
      return '<div class="empty-hint">暂无可兑换物资。</div>';
    }
    const item = this.buildHeavenlyDaoShopItemStack(entry.itemId, entry.count);
    if (!item) {
      return '<div class="empty-hint">商品配置不存在。</div>';
    }

    const currencyName = this.getHeavenlyDaoShopCurrencyName();
    const ownedCurrency = this.getHeavenlyDaoShopCurrencyOwned();
    const quantityText = this.heavenlyDaoShopQuantityDrafts.get(entry.itemId) ?? '1';
    const quantity = this.parseHeavenlyDaoShopQuantity(entry.itemId);
    const totalCost = quantity === null ? null : quantity * entry.price;
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
    const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
    const affordableCount = entry.price > 0 ? Math.floor(ownedCurrency / entry.price) : 0;
    const maxPurchasable = Math.min(HEAVENLY_DAO_SHOP_MAX_QUANTITY, affordableCount);
    const ownedCount = getPlayerOwnedItemCount(this.player, this.inventory, entry.itemId);
    const countText = entry.count > 1 ? ` x${formatDisplayInteger(entry.count)}` : '';
    const effectLines = describeItemEffectDetails(item);
    const errorText = invalidTotal
      ? `请输入 1 至 ${formatDisplayInteger(HEAVENLY_DAO_SHOP_MAX_QUANTITY)} 之间的购买数量。`
      : `${currencyName}不足，需要 ${displayTotal} ${currencyName}。`;
    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title market-item-title--interactive" data-market-item-tooltip="heavenly-dao-shop:${escapeHtmlAttr(entry.itemId)}">${escapeHtml(item.name)}${escapeHtml(countText)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(item.type))} · ${escapeHtml(item.desc)}</div>
        </div>
      </div>
      ${effectLines.length > 0 ? `
        <div class="market-book-effects ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
          <div class="market-book-effects-title">物品效果</div>
          <div class="market-book-effects-list">
            ${effectLines.map((line) => `<div class="market-book-effect-line">${escapeHtml(line)}</div>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-scroll-panel" data-heavenly-dao-shop-detail-scroll="true">
        <div class="market-book-column-head">
          <div class="market-book-column-title">兑换数量</div>
          <button class="small-btn" data-heavenly-dao-shop-buy="${escapeHtmlAttr(entry.itemId)}" type="button" ${invalidTotal || insufficientCurrency ? 'disabled' : ''}>购买</button>
        </div>
        <div class="market-action-row">
          <span class="market-order-meta">已持有：${escapeHtml(formatDisplayCountBadge(ownedCount))}</span>
          <span class="market-order-meta">最多可买：${formatDisplayInteger(maxPurchasable)}</span>
        </div>
        <div class="market-trade-dialog-section ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
          <div class="market-trade-dialog-field">
            <span>单价</span>
            <div class="market-price-display">
              <strong>${formatDisplayInteger(entry.price)}</strong>
              <span>${escapeHtml(currencyName)}</span>
            </div>
          </div>
        </div>
        <div class="market-trade-dialog-section ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
          <div class="market-trade-dialog-field">
            <span>数量</span>
            ${renderTradeQuantityControl({
              value: quantityText || '1',
              max: HEAVENLY_DAO_SHOP_MAX_QUANTITY,
              inputClassName: 'gm-inline-input ui-input',
              inputAttrs: { 'data-heavenly-dao-shop-quantity': entry.itemId },
              leftButtons: [{ label: '1', attrs: { 'data-heavenly-dao-shop-quick-qty': entry.itemId, 'data-heavenly-dao-shop-quick-qty-value': '1' } }],
              rightButtons: [{
                label: '最大',
                attrs: { 'data-heavenly-dao-shop-quick-qty': entry.itemId, 'data-heavenly-dao-shop-quick-qty-value': Math.max(1, maxPurchasable) },
                disabled: maxPurchasable <= 0,
              }],
            })}
          </div>
          <div class="market-trade-dialog-total ${invalidTotal || insufficientCurrency ? 'error' : ''}">
            <span>总价</span>
            <strong data-heavenly-dao-shop-total="${escapeHtmlAttr(entry.itemId)}">${displayTotal} ${escapeHtml(currencyName)}</strong>
          </div>
        </div>
        <div class="market-action-hint market-action-hint--error" data-heavenly-dao-shop-error="${escapeHtmlAttr(entry.itemId)}" ${invalidTotal || insufficientCurrency ? '' : 'hidden'}>
          ${escapeHtml(errorText)}
        </div>
        <div class="market-action-hint">商品与价格由服务端固定表权威结算，只消耗 ${escapeHtml(currencyName)}。</div>
      </div>
    `;
  }

  private openHeavenlyDaoShopModal(): void {
    this.ensureHeavenlyDaoShopSelection();
    this.heavenlyDaoShopAssetSignature = this.buildHeavenlyDaoShopAssetSignature(this.player, this.inventory);
    detailModalHost.open({
      ownerId: MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market',
      title: '天道商店',
      subtitle: `持有 ${this.getHeavenlyDaoShopCurrencyName()}：${formatDisplayInteger(this.getHeavenlyDaoShopCurrencyOwned())}`,
      renderBody: (body: HTMLElement) => {
        replaceElementHtml(body, `
          <div class="market-modal-content market-modal-content--wide heavenly-dao-shop-shell">
            <div class="market-market-tab">
              <div class="market-board heavenly-dao-shop-board">
                <div class="market-board-list-wrap ui-surface-pane ui-surface-pane--stack">
                  <div class="market-list-toolbar ui-action-row">
                    <div class="market-list-toolbar-meta" data-heavenly-dao-shop-currency="true">持有 ${escapeHtml(this.getHeavenlyDaoShopCurrencyName())}：${formatDisplayInteger(this.getHeavenlyDaoShopCurrencyOwned())}</div>
                  </div>
                  <div class="market-board-list npc-shop-board-list ui-scroll-panel" data-heavenly-dao-shop-list="true">
                    ${this.renderHeavenlyDaoShopRows()}
                  </div>
                </div>
                <div class="market-book-panel ui-surface-pane ui-surface-pane--stack" data-heavenly-dao-shop-detail="true">
                  ${this.renderHeavenlyDaoShopDetailPanel()}
                </div>
              </div>
            </div>
          </div>
        `);
      },
      onClose: () => {
        this.tooltipNode = null;
        this.tooltip.hide(true);
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        this.bindHeavenlyDaoShopEvents(body, signal);
        this.bindMarketModalDelegatedEvents(body, signal);
      },
    });
  }
  private getOpenHeavenlyDaoShopBody(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER)) {
      return null;
    }
    return document.getElementById('detail-modal-body');
  }

  private patchHeavenlyDaoShopModal(): boolean {
    const body = this.getOpenHeavenlyDaoShopBody();
    if (!body?.querySelector('.heavenly-dao-shop-shell')) {
      return false;
    }
    detailModalHost.patch({
      ownerId: MarketPanel.HEAVENLY_DAO_SHOP_MODAL_OWNER,
      title: '天道商店',
      subtitle: `持有 ${this.getHeavenlyDaoShopCurrencyName()}：${formatDisplayInteger(this.getHeavenlyDaoShopCurrencyOwned())}`,
    });
    const currencyNode = body.querySelector<HTMLElement>('[data-heavenly-dao-shop-currency="true"]');
    if (currencyNode) {
      currencyNode.textContent = `持有 ${this.getHeavenlyDaoShopCurrencyName()}：${formatDisplayInteger(this.getHeavenlyDaoShopCurrencyOwned())}`;
    }
    this.patchHeavenlyDaoShopList();
    this.patchHeavenlyDaoShopDetailPanel();
    return true;
  }

  private patchHeavenlyDaoShopList(): void {
    const body = this.getOpenHeavenlyDaoShopBody();
    const listRoot = body?.querySelector<HTMLElement>('[data-heavenly-dao-shop-list="true"]');
    if (!listRoot) {
      return;
    }
    replaceElementHtml(listRoot, this.renderHeavenlyDaoShopRows());
  }

  private patchHeavenlyDaoShopDetailPanel(): void {
    const body = this.getOpenHeavenlyDaoShopBody();
    const detailRoot = body?.querySelector<HTMLElement>('[data-heavenly-dao-shop-detail="true"]');
    if (!detailRoot) {
      return;
    }
    const scrollTop = detailRoot.querySelector<HTMLElement>('[data-heavenly-dao-shop-detail-scroll="true"]')?.scrollTop ?? 0;
    const activeElement = document.activeElement;
    const focusedItemId = activeElement instanceof HTMLInputElement && detailRoot.contains(activeElement)
      ? activeElement.dataset.heavenlyDaoShopQuantity ?? null
      : null;
    const selectionStart = activeElement instanceof HTMLInputElement ? activeElement.selectionStart : null;
    const selectionEnd = activeElement instanceof HTMLInputElement ? activeElement.selectionEnd : null;
    replaceElementHtml(detailRoot, this.renderHeavenlyDaoShopDetailPanel());
    const nextScrollRoot = detailRoot.querySelector<HTMLElement>('[data-heavenly-dao-shop-detail-scroll="true"]');
    if (nextScrollRoot) {
      nextScrollRoot.scrollTop = scrollTop;
    }
    if (!focusedItemId) {
      return;
    }
    const input = detailRoot.querySelector<HTMLInputElement>(`[data-heavenly-dao-shop-quantity="${focusedItemId}"]`);
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  private bindHeavenlyDaoShopEvents(body: HTMLElement, signal: AbortSignal): void {
    body.addEventListener('click', (event) => this.handleHeavenlyDaoShopClick(event), { signal });
    body.addEventListener('input', (event) => this.handleHeavenlyDaoShopInput(event), { signal });
  }

  private handleHeavenlyDaoShopClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const selectButton = target.closest<HTMLElement>('[data-heavenly-dao-shop-select]');
    if (selectButton) {
      const itemId = selectButton.dataset.heavenlyDaoShopSelect;
      if (!itemId || itemId === this.heavenlyDaoShopSelectedItemId) {
        return;
      }
      this.heavenlyDaoShopSelectedItemId = itemId;
      this.patchHeavenlyDaoShopList();
      this.patchHeavenlyDaoShopDetailPanel();
      return;
    }

    const quickQtyButton = target.closest<HTMLElement>('[data-heavenly-dao-shop-quick-qty]');
    if (quickQtyButton) {
      const itemId = quickQtyButton.dataset.heavenlyDaoShopQuickQty;
      const nextQuantity = quickQtyButton.dataset.heavenlyDaoShopQuickQtyValue;
      if (!itemId || !nextQuantity) {
        return;
      }
      this.heavenlyDaoShopQuantityDrafts.set(itemId, nextQuantity);
      const body = this.getOpenHeavenlyDaoShopBody();
      const input = body?.querySelector<HTMLInputElement>(`[data-heavenly-dao-shop-quantity="${itemId}"]`);
      if (input) {
        input.value = nextQuantity;
      }
      if (body) {
        this.syncHeavenlyDaoShopPurchaseState(body, itemId);
      }
      return;
    }

    const buyButton = target.closest<HTMLElement>('[data-heavenly-dao-shop-buy]');
    if (!buyButton) {
      return;
    }
    const itemId = buyButton.dataset.heavenlyDaoShopBuy;
    const quantity = itemId ? this.parseHeavenlyDaoShopQuantity(itemId) : null;
    if (!itemId || quantity === null) {
      return;
    }
    this.callbacks?.onBuyHeavenlyDaoShopItem(itemId, quantity);
  }

  private handleHeavenlyDaoShopInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const itemId = target.dataset.heavenlyDaoShopQuantity;
    if (!itemId) {
      return;
    }
    const normalized = target.value.replaceAll(/[^\d]/g, '');
    this.heavenlyDaoShopQuantityDrafts.set(itemId, normalized);
    if (target.value !== normalized) {
      target.value = normalized;
    }
    const body = this.getOpenHeavenlyDaoShopBody();
    if (body) {
      this.syncHeavenlyDaoShopPurchaseState(body, itemId);
    }
  }

  private syncHeavenlyDaoShopPurchaseState(root: ParentNode, itemId: string): void {
    const entry = this.getHeavenlyDaoShopEntry(itemId);
    const totalNode = root.querySelector<HTMLElement>(`[data-heavenly-dao-shop-total="${itemId}"]`);
    const buttonNode = root.querySelector<HTMLButtonElement>(`[data-heavenly-dao-shop-buy="${itemId}"]`);
    const errorNode = root.querySelector<HTMLElement>(`[data-heavenly-dao-shop-error="${itemId}"]`);
    if (!entry || !totalNode || !buttonNode || !errorNode) {
      return;
    }

    const currencyName = this.getHeavenlyDaoShopCurrencyName();
    const quantity = this.parseHeavenlyDaoShopQuantity(itemId);
    const totalCost = quantity === null ? null : quantity * entry.price;
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
    const insufficientCurrency = !invalidTotal && totalCost > this.getHeavenlyDaoShopCurrencyOwned();
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
    totalNode.textContent = `${displayTotal} ${currencyName}`;
    totalNode.parentElement?.classList.toggle('error', invalidTotal || insufficientCurrency);
    errorNode.hidden = !(invalidTotal || insufficientCurrency);
    errorNode.textContent = invalidTotal
      ? `请输入 1 至 ${formatDisplayInteger(HEAVENLY_DAO_SHOP_MAX_QUANTITY)} 之间的购买数量。`
      : `${currencyName}不足，需要 ${displayTotal} ${currencyName}。`;
    buttonNode.disabled = invalidTotal || insufficientCurrency;
  }

  private getMarketTotalPagesForSummary(): number {
    const totalItems = this.marketListings?.total ?? this.marketUpdate?.listedItems.length ?? 0;
    const pageSize = this.marketListings?.pageSize ?? this.getMarketPageSize();
    return Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
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
    this.auctionView.syncAuctionSelection();
  }

  private getAuctionPageState(items: ArrayLike<unknown>): { page: number; totalPages: number; totalItems: number } {
    return this.auctionView.getAuctionPageState(items);
  }

  private getCurrentAuctionLots(): AuctionLotView[] {
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
  private requestTradeHistory(page: number, source?: 'market' | 'auction', scope?: MarketTradeHistoryScope): void {
    this.tradeHistoryLoading = true;
    this.tradeHistoryPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    const requestSource = source ?? (detailModalHost.isOpenFor(MarketPanel.AUCTION_MODAL_OWNER) ? 'auction' : 'market');
    const requestScope = requestSource === 'auction' ? (scope ?? this.auctionHistoryScope) : 'mine';
    this.callbacks?.onRequestTradeHistory(this.tradeHistoryPage, requestSource, requestScope);
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
      ? item.name.trim()
      : '未知物品';
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

    const tooltip = buildItemTooltipPayload(item, { playerRealmLv: this.player?.realm?.realmLv ?? this.player?.realmLv });
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
    if (key.startsWith('heavenly-dao-shop:')) {
      const entry = this.getHeavenlyDaoShopEntry(key.slice('heavenly-dao-shop:'.length));
      const item = entry ? this.buildHeavenlyDaoShopItemStack(entry.itemId, entry.count) : null;
      return item ? this.buildMarketItemTooltipPayload(item) : null;
    }
    if (key.startsWith('auction-consign-item:')) {
      const itemInstanceId = normalizeInventoryItemInstanceId(key.slice('auction-consign-item:'.length));
      const item = itemInstanceId
        ? this.inventory.items.find((entry) => normalizeInventoryItemInstanceId(entry.itemInstanceId) === itemInstanceId) ?? null
        : null;
      return item ? this.buildMarketItemTooltipPayload(item) : null;
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
    if (targetLevel > MARKET_MAX_ENHANCE_LEVEL) {
      return null;
    }
    const itemLevel = Math.max(1, Math.floor(Number(item.level) || 1));
    const localBaseUnitPrice = this.getLocalZeroEnhancementLowestSellPrice(item.itemId);
    const baseUnitPrice = localBaseUnitPrice;
    const basePricePending = false;
    let analysis: ReturnType<typeof computeBestEnhancementExpectedCost>;
    try {
      analysis = computeBestEnhancementExpectedCost({
        targetLevel,
        itemLevel,
        protectionUnitPrice: baseUnitPrice,
        targetItemUnitPrice: baseUnitPrice,
        selfProtection: true,
      });
    } catch {
      return null;
    }
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

  /** 在背包里找一个能对应当前物品的稳定实例 ID。 */
  private findMatchingInventoryItemInstanceId(item: ItemStack): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let matchedItem: ItemStack | null = null;
    if (item.type === 'equipment') {
      const targetLevel = this.getMarketEnhanceLevel(item);
      matchedItem = this.inventory.items.find((entry) =>
        entry.itemId === item.itemId
        && entry.type === 'equipment'
        && this.getMarketEnhanceLevel(entry) === targetLevel
      ) ?? null;
    } else {
      const targetKey = createItemStackSignature({ ...item, count: 1 });
      matchedItem = this.inventory.items.find((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey) ?? null;
      if (!matchedItem) {
        matchedItem = this.inventory.items.find((entry) => entry.itemId === item.itemId) ?? null;
      }
    }
    return typeof matchedItem?.itemInstanceId === 'string' && matchedItem.itemInstanceId.trim().length > 0
      ? matchedItem.itemInstanceId.trim()
      : null;
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

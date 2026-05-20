/**
 * 市场面板子视图共享的内部类型定义。
 * 这些类型从 market-panel.ts 提取，供 sub-view 文件引用。
 */
import type {
  AuctionHouseTab,
  AuctionLotPageEntry,
  AuctionLotStatus,
  EnhancementExpectedCostStrategy,
  EquipSlot,
  Inventory,
  ItemStack,
  ItemType,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  MarketTradeHistoryScope,
  PlayerState,
  S2C_AuctionListings,
  S2C_MarketListings,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
  TechniqueCategory,
} from '@mud/shared';
import type { MarketModalTab } from '../../constants/ui/market';

/** 市场主分类筛选项。 */
export type MarketCategoryFilter = 'all' | ItemType;
/** 装备子分类筛选项。 */
export type MarketEquipmentFilter = 'all' | EquipSlot;
/** 功法书子分类筛选项。 */
export type MarketTechniqueFilter = 'all' | TechniqueCategory;
/** 交易弹窗的方向。 */
export type MarketTradeDialogKind = 'buy' | 'sell';
/** 交易弹窗的来源场景。 */
export type MarketTradeDialogSource = 'market' | 'auction-bid';
/** 交易弹窗里调价按钮的动作类型。 */
export type MarketPriceAction = 'decrease' | 'increase' | 'double' | 'half' | 'preset';

/** 交易弹窗当前的可编辑状态。 */
export interface MarketTradeDialogState {
  kind: MarketTradeDialogKind;
  quantity: number;
  unitPrice: number;
  source?: MarketTradeDialogSource;
  minUnitPrice?: number;
  confirmPurchase?: boolean;
}

/** 拍卖寄拍独立面板里的可编辑状态。 */
export interface AuctionConsignPanelState {
  open: boolean;
  slotIndex: number | null;
  quantity: number;
  totalPrice: number;
  buyoutPrice: number;
  query: string;
}

/** 交易弹窗一次渲染需要的派生状态。 */
export interface MarketTradeDialogViewState {
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
export interface MarketEnhancementEstimateView {
  strategy: EnhancementExpectedCostStrategy;
  costLine: string;
  attemptsLine: string;
  timeLine: string;
  baseUnitPrice?: number;
  usesMarketBasePrice: boolean;
  basePricePending: boolean;
}

/** 当前页里按物品 id 聚合后的列表分组。 */
export interface MarketListingGroupView {
  itemId: string;
  item: ItemStack;
  canEnhance: boolean;
  variants: MarketListedItemView[];
}

/** 拍卖行 UI 使用的轻量拍品视图。 */
export interface AuctionLotView {
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

/** 市场面板对外的请求/提交回调。 */
export interface MarketPanelCallbacks {
  onRequestMarket: () => void;
  onRequestListings: (payload: import('@mud/shared').C2S_RequestMarketListings) => void;
  onRequestAuctionListings: (payload: import('@mud/shared').C2S_RequestAuctionListings) => void;
  onRequestItemBook: (itemKey: string) => void;
  onRequestTradeHistory: (page: number, source?: 'market' | 'auction', scope?: MarketTradeHistoryScope) => void;
  onCreateSellOrder: (slotIndex: number, quantity: number, unitPrice: number, expectedItemInstanceId?: string) => void;
  onCreateAuctionSellOrder: (slotIndex: number, quantity: number, unitPrice: number, buyoutPrice?: number, expectedItemInstanceId?: string) => void;
  onCreateBuyOrder: (itemKey: string, quantity: number, unitPrice: number) => void;
  onPlaceAuctionBid: (lotId: string, itemKey: string, unitPrice: number) => void;
  onBuyoutAuctionLot: (lotId: string, itemKey: string) => void;
  onCancelOrder: (orderId: string) => void;
  onClaimStorage: () => void;
}

/**
 * 子视图访问 MarketPanel 内部状态的接口。
 * 只暴露子视图实际需要的属性和方法。
 */
export interface MarketPanelInternals {
  // --- 状态 ---
  callbacks: MarketPanelCallbacks | null;
  marketUpdate: S2C_MarketUpdate | null;
  itemBook: MarketOrderBookView | null;
  marketListings: S2C_MarketListings | null;
  auctionListings: S2C_AuctionListings | null;
  itemBookCache: Map<string, MarketOrderBookView>;
  pendingItemBookKeys: Set<string>;
  selectedItemKey: string | null;
  selectedGroupItemId: string | null;
  enhancementBrowseItemId: string | null;
  modalTab: MarketModalTab;
  activeCategory: MarketCategoryFilter;
  activeEquipmentCategory: MarketEquipmentFilter;
  activeTechniqueCategory: MarketTechniqueFilter;
  auctionTab: AuctionHouseTab;
  auctionHistoryScope: MarketTradeHistoryScope;
  auctionCategory: MarketCategoryFilter;
  auctionSearchQuery: string;
  selectedAuctionItemKey: string | null;
  auctionPage: number;
  auctionConsignPanel: AuctionConsignPanelState;
  currentPage: number;
  tradeHistoryPage: number;
  itemBookLoading: boolean;
  tradeHistoryLoading: boolean;
  tradeDialog: MarketTradeDialogState | null;
  buyConfirmState: { itemKey: string; quantity: number; unitPrice: number } | null;
  tradeHistory: S2C_MarketTradeHistory | null;
  inventory: Inventory;
  player: PlayerState | null;
  tooltip: import('../floating-tooltip').FloatingTooltip;
  tooltipNode: HTMLElement | null;
  auctionCountdownTimer: ReturnType<typeof window.setInterval> | null;

  // --- 方法 ---
  getOpenModalBody(): HTMLElement | null;
  getOpenAuctionModalBody(): HTMLElement | null;
  getOpenAuctionConsignModalBody(): HTMLElement | null;
  getSelectedListedItem(update: S2C_MarketUpdate | null): MarketListedItemView | null;
  getVisibleListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[];
  getVisibleListingGroups(update: S2C_MarketUpdate | null): MarketListingGroupView[];
  getKnownListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[];
  findListingVariantByKey(itemKey: string | null | undefined, update?: S2C_MarketUpdate | null): MarketListedItemView | null;
  findConflictingOwnOrder(itemKey: string, nextSide: MarketTradeDialogKind): MarketOwnOrderView | null;
  findMatchingInventorySlot(item: ItemStack): number | null;
  findMatchingInventoryCount(item: ItemStack): number;
  findInventoryItemCountByItemId(itemId: string): number;
  findEquipmentInventoryCountByLevel(itemId: string, enhanceLevel: number): number;
  getMarketDisplayName(item: ItemStack): string;
  getMarketEnhanceLevel(item: ItemStack): number;
  getMarketTradeTotalCost(quantity: number, unitPrice: number): number | null;
  formatMarketUnitPrice(value: number): string;
  formatPricePresetLabel(value: number): string;
  readDatasetNumber(value: string | undefined): number | null;
  normalizeTradeDialogPrice(value: number, direction: 'up' | 'down'): number;
  normalizeTradeDialogQuantity(value: string | number, entry: MarketListedItemView, kind: MarketTradeDialogKind, unitPrice?: number): number;
  getTradeDialogQuantityStep(unitPrice: number): number;
  getTradeDialogQuantityMax(entry: MarketListedItemView, kind: MarketTradeDialogKind, unitPrice: number): number;
  getTradeDialogMaxButtonQuantity(entry: MarketListedItemView, currencyItemId: string, dialog: MarketTradeDialogState): number;
  getTradeDialogMinUnitPrice(dialog: MarketTradeDialogState): number;
  getAffordableBuyQuantity(unitPrice: number, currencyItemId: string): number;
  getNextTradeDialogPrice(currentPrice: number, action: MarketPriceAction, preset?: number | null, minPrice?: number): number;
  getDefaultTradeDialogPrice(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null): number;
  getAuctionMinimumBidPrice(lot: AuctionLotView): number;
  buildLocalMarketItem(itemId: string, count?: number, enhanceLevel?: number): ItemStack;
  buildMarketListingFromAuctionLot(lot: AuctionLotView): MarketListedItemView;
  buildMarketItemTooltipPayload(item: ItemStack): unknown;
  resolveMarketTooltipPayload(node: HTMLElement): { title: string; lines: string[]; allowHtml?: boolean; asideCards?: unknown[] } | null;
  resolveMarketTooltipEntry(itemKey: string): MarketListedItemView | null;
  requestItemBook(itemKey: string): void;
  requestListings(page: number): void;
  requestAuctionListings(page: number): void;
  requestTradeHistory(page: number, source?: 'market' | 'auction', scope?: MarketTradeHistoryScope): void;
  syncTradeDialogOverlay(): void;
  syncPageSelection(): void;
  clampPage(page: number, totalItems: number): number;
  getMarketPageSize(): number;
  getVisibleMarketTotalItems(update: S2C_MarketUpdate | null, items?: unknown[]): number;
  hasCompactCategoryLayout(): boolean;
  resolveTechniqueCategoryForItem(item: ItemStack): TechniqueCategory | null;
  getItemStatusState(item: ItemStack): { label: string; kind: 'learned' | 'unlocked' } | null;
  getGroupReferenceEntry(group: MarketListingGroupView): MarketListedItemView | null;
  bindMarketModalDelegatedEvents(body: HTMLElement, signal: AbortSignal): void;
  bindItemTooltipEvents(body: HTMLElement, signal?: AbortSignal): void;
  renderModal(): void;
  patchMarketActiveSelection(): void;
  patchSelectedBookPanel(): void;
  syncVisibleMarketInventoryState(): void;
  syncSelectedBookActionButtons(body: HTMLElement): void;
  syncOwnedBadge(button: HTMLElement, ownedCount: number): void;
  openAuctionBidDialog(entry: MarketListedItemView, lot: AuctionLotView): void;
  openAuctionBuyoutConfirm(entry: MarketListedItemView, lot: AuctionLotView): void;
  resolveAuctionLotByKey(lotId: string | null | undefined, update: S2C_MarketUpdate | null, tab?: AuctionHouseTab): AuctionLotView | null;
}

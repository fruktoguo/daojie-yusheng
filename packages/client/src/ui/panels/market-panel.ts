import {
  calculateMarketTradeTotalCost,
  createItemStackSignature,
  EQUIP_SLOTS,
  EquipSlot,
  getMarketMinimumTradeQuantity,
  Inventory,
  ITEM_TYPES,
  ItemStack,
  ItemType,
  MARKET_MAX_UNIT_PRICE,
  MARKET_PRICE_PRESET_VALUES,
  MAX_ENHANCE_LEVEL,
  MarketListedItemView,
  MarketOwnOrderView,
  MarketStorage,
  PlayerState,
  S2C_MarketListings,
  S2C_MarketOrders,
  S2C_MarketItemBook,
  S2C_MarketStorage,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
  TechniqueCategory,
  getMarketPriceStep,
  normalizeMarketPriceDown,
  normalizeMarketPriceUp,
} from '@mud/shared';
import {
  getLocalItemTemplate,
  getLocalTechniqueCategoryForBookItem,
  resolveTechniqueIdFromBookItemId,
} from '../../content/local-templates';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { getViewportRoot } from '../responsive-viewport';
import { detailModalHost } from '../detail-modal-host';
import { confirmModalHost } from '../confirm-modal-host';
import { preserveSelection } from '../selection-preserver';
import { MARKET_MODAL_TABS, MARKET_PANE_HINT, MarketModalTab } from '../../constants/ui/market';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** escapeHtmlAttr：执行对应的业务逻辑。 */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

/** MarketPanelCallbacks：定义该接口的能力与字段约束。 */
interface MarketPanelCallbacks {
  onRequestMarket: () => void;
  onRequestMarketListings: (payload: {
    page: number;
    pageSize?: number;
    category?: MarketCategoryFilter;
    equipmentSlot?: MarketEquipmentFilter;
    techniqueCategory?: MarketTechniqueFilter;
  }) => void;
  onRequestItemBook: (itemKey: string) => void;
  onRequestTradeHistory: (page: number) => void;
  onCreateSellOrder: (slotIndex: number, quantity: number, unitPrice: number) => void;
  onCreateBuyOrder: (itemKey: string, quantity: number, unitPrice: number) => void;
  onCancelOrder: (orderId: string) => void;
  onClaimStorage: () => void;
}

/** MarketCategoryFilter：定义该类型的结构与数据语义。 */
type MarketCategoryFilter = 'all' | ItemType;
/** MarketEquipmentFilter：定义该类型的结构与数据语义。 */
type MarketEquipmentFilter = 'all' | EquipSlot;
/** MarketTechniqueFilter：定义该类型的结构与数据语义。 */
type MarketTechniqueFilter = 'all' | TechniqueCategory;
/** MarketTradeDialogKind：定义该类型的结构与数据语义。 */
type MarketTradeDialogKind = 'buy' | 'sell';
/** MarketPriceAction：定义该类型的结构与数据语义。 */
type MarketPriceAction = 'decrease' | 'increase' | 'double' | 'half' | 'preset';

/** MarketTradeDialogState：定义该接口的能力与字段约束。 */
interface MarketTradeDialogState {
  kind: MarketTradeDialogKind;
  quantity: number;
  unitPrice: number;
  confirmPurchase: boolean;
}

type MarketListingGroupEntry = S2C_MarketListings['items'][number];
type MarketListingVariantEntry = MarketListingGroupEntry['variants'][number];

const MARKET_DESKTOP_PAGE_SIZE = 32;
const MARKET_MOBILE_PAGE_SIZE = 12;
const MARKET_DESKTOP_COMPACT_PAGE_SIZE = 28;
const MARKET_MOBILE_COMPACT_PAGE_SIZE = 10;
const MARKET_DIALOG_MIN_PRICE = MARKET_PRICE_PRESET_VALUES[0];
const MARKET_DIALOG_MAX_PRICE = MARKET_MAX_UNIT_PRICE;
const MARKET_DIALOG_MAX_QUANTITY = 999_900_000_000;
const MARKET_TECHNIQUE_FILTERS: Array<{ id: MarketTechniqueFilter; label: string }> = [
  { id: 'all', label: '全部功法' },
  { id: 'arts', label: getTechniqueCategoryLabel('arts') },
  { id: 'internal', label: getTechniqueCategoryLabel('internal') },
  { id: 'divine', label: getTechniqueCategoryLabel('divine') },
  { id: 'secret', label: getTechniqueCategoryLabel('secret') },
];

/** MarketPanel：封装相关状态与行为。 */
export class MarketPanel {
  private static readonly MODAL_OWNER = 'market-panel';
  private static readonly CONFIRM_MODAL_OWNER = 'market-panel:confirm-purchase';
  private static readonly TRADE_MODAL_ID = 'market-trade-modal-root';
  private readonly pane = document.getElementById('pane-market')!;
  private callbacks: MarketPanelCallbacks | null = null;
  private marketUpdate: S2C_MarketUpdate | null = null;
  private marketListings: S2C_MarketListings | null = null;
  private marketOrders: S2C_MarketOrders | null = null;
  private marketStorage: S2C_MarketStorage | null = null;
  private itemBook: S2C_MarketItemBook['book'] | null = null;
  private selectedGroupItemId: string | null = null;
  private selectedItemKey: string | null = null;
  private enhancementBrowseItemId: string | null = null;
  private modalTab: MarketModalTab = 'market';
  private activeCategory: MarketCategoryFilter = 'all';
  private activeEquipmentCategory: MarketEquipmentFilter = 'all';
  private activeTechniqueCategory: MarketTechniqueFilter = 'all';
  private currentPage = 1;
  private tradeHistoryPage = 1;
  private itemBookLoading = false;
  private tradeHistoryLoading = false;
  private tradeDialog: MarketTradeDialogState | null = null;
  private buyConfirmState: { itemKey: string; quantity: number; unitPrice: number } | null = null;
  private tradeHistory: S2C_MarketTradeHistory | null = null;
  private inventory: Inventory = { items: [], capacity: 0 };
  private learnedTechniqueIds = new Set<string>();
  private unlockedMinimapIds = new Set<string>();
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  private tooltipNode: HTMLElement | null = null;

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
    this.bindPaneEvents();
    this.renderPane();
  }

  setCallbacks(callbacks: MarketPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.syncPlayerContext(player);
    this.renderPane();
  }

  syncPlayerContext(player?: Pick<PlayerState, 'techniques' | 'unlockedMinimapIds'>): void {
    const nextLearnedTechniqueIds = player
      ? new Set(
        (player.techniques ?? [])
          .map((technique) => technique.techId)
          .filter((techniqueId): techniqueId is string => typeof techniqueId === 'string' && techniqueId.length > 0),
      )
      : new Set<string>();
    const nextUnlockedMinimapIds = player
      ? new Set(
        (player.unlockedMinimapIds ?? [])
          .filter((mapId): mapId is string => typeof mapId === 'string' && mapId.length > 0),
      )
      : new Set<string>();
    const contextChanged = !this.areStringSetsEqual(this.learnedTechniqueIds, nextLearnedTechniqueIds)
      || !this.areStringSetsEqual(this.unlockedMinimapIds, nextUnlockedMinimapIds);
    if (!contextChanged) {
      return;
    }
    this.learnedTechniqueIds = nextLearnedTechniqueIds;
    this.unlockedMinimapIds = nextUnlockedMinimapIds;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  syncInventory(inventory: Inventory): void {
    if (this.areInventoriesEquivalent(this.inventory, inventory)) {
      this.syncBuyConfirmModal();
      return;
    }
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
    this.syncBuyConfirmModal();
  }

  updateListings(data: S2C_MarketListings): void {
    if (this.areMarketListingsEqual(this.marketListings, data)) {
      return;
    }
    this.marketListings = data;
    this.currentPage = data.page;
    this.marketUpdate = this.buildSyntheticMarketUpdate();
    const groups = data.items;
    if (!this.selectedGroupItemId || !groups.some((entry) => entry.itemId === this.selectedGroupItemId)) {
      this.selectedGroupItemId = groups[0]?.itemId ?? null;
    }
    if (this.enhancementBrowseItemId && !groups.some((entry) => entry.itemId === this.enhancementBrowseItemId && entry.canEnhance)) {
      this.enhancementBrowseItemId = null;
    }
    const variants = this.getCurrentVariantEntries();
    if (this.selectedItemKey && !variants.some((entry) => entry.itemKey === this.selectedItemKey)) {
      this.selectedItemKey = null;
      this.itemBook = null;
      this.tradeDialog = null;
    }
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      if (this.modalTab === 'market' && this.selectedItemKey) {
        this.requestItemBook(this.selectedItemKey);
      }
      this.renderModal();
    } else {
      this.syncTradeDialogOverlay();
    }
    this.syncBuyConfirmModal();
  }

  updateOrders(data: S2C_MarketOrders): void {
    if (this.areMarketOrdersEqual(this.marketOrders, data)) {
      return;
    }
    this.marketOrders = data;
    this.marketUpdate = this.buildSyntheticMarketUpdate();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    } else {
      this.syncTradeDialogOverlay();
    }
    this.syncBuyConfirmModal();
  }

  updateStorage(data: S2C_MarketStorage): void {
    if (this.areMarketStorageEqual(this.marketStorage, data)) {
      return;
    }
    this.marketStorage = data;
    this.marketUpdate = this.buildSyntheticMarketUpdate();
    this.renderPane();
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
    this.syncBuyConfirmModal();
  }

  updateItemBook(data: S2C_MarketItemBook): void {
    if (data.itemKey !== this.selectedItemKey) {
      return;
    }
    this.itemBookLoading = false;
    if (this.areMarketItemBooksEqual(this.itemBook, data.book)) {
      this.syncBuyConfirmModal();
      return;
    }
    this.itemBook = data.book;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    } else {
      this.syncTradeDialogOverlay();
    }
    this.syncBuyConfirmModal();
  }

  updateTradeHistory(data: S2C_MarketTradeHistory): void {
    this.tradeHistoryLoading = false;
    if (this.areMarketTradeHistoryEqual(this.tradeHistory, data)) {
      return;
    }
    this.tradeHistory = data;
    this.tradeHistoryPage = data.page;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  clear(): void {
    this.marketUpdate = null;
    this.marketListings = null;
    this.marketOrders = null;
    this.marketStorage = null;
    this.itemBook = null;
    this.selectedGroupItemId = null;
    this.selectedItemKey = null;
    this.enhancementBrowseItemId = null;
    this.modalTab = 'market';
    this.activeCategory = 'all';
    this.activeEquipmentCategory = 'all';
    this.activeTechniqueCategory = 'all';
    this.currentPage = 1;
    this.tradeHistoryPage = 1;
    this.itemBookLoading = false;
    this.tradeHistoryLoading = false;
    this.tradeDialog = null;
    this.buyConfirmState = null;
    this.tradeHistory = null;
    this.inventory = { items: [], capacity: 0 };
    this.learnedTechniqueIds.clear();
    this.unlockedMinimapIds.clear();
    this.tooltipNode = null;
    this.tooltip.hide(true);
    this.syncTradeDialogOverlay();
    confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
    this.renderPane();
    detailModalHost.close(MarketPanel.MODAL_OWNER);
  }

  private buildSyntheticMarketUpdate(): S2C_MarketUpdate | null {
    const currencyItemId = this.marketListings?.currencyItemId
      ?? this.marketOrders?.currencyItemId
      ?? this.marketUpdate?.currencyItemId;
    const currencyItemName = this.marketListings?.currencyItemName
      ?? this.marketOrders?.currencyItemName
      ?? this.marketUpdate?.currencyItemName;
    if (!currencyItemId || !currencyItemName) {
      return this.marketUpdate;
    }
    return {
      currencyItemId,
      currencyItemName,
      listedItems: (this.marketListings?.items ?? []).flatMap((entry) =>
        entry.variants.map((variant) => ({
          itemKey: variant.itemKey,
          item: { ...variant.item },
          sellOrderCount: variant.sellOrderCount,
          sellQuantity: variant.sellQuantity,
          lowestSellPrice: variant.lowestSellPrice,
          buyOrderCount: variant.buyOrderCount,
          buyQuantity: variant.buyQuantity,
          highestBuyPrice: variant.highestBuyPrice,
        }))),
      myOrders: (this.marketOrders?.orders ?? []).map((order) => ({
        id: order.id,
        side: order.side,
        status: order.status,
        itemKey: order.itemKey,
        item: { ...order.item },
        remainingQuantity: order.remainingQuantity,
        unitPrice: order.unitPrice,
        createdAt: order.createdAt,
      })),
      storage: {
        items: (this.marketStorage?.items ?? []).map((entry) => ({
          ...entry.item,
          count: entry.count,
        })),
      },
    };
  }

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
      consumeBuffs: template.consumeBuffs,
      tags: template.tags,
      enhanceLevel: enhanceLevel ?? template.enhanceLevel,
      mapUnlockId: template.mapUnlockId,
      tileAuraGainAmount: template.tileAuraGainAmount,
      allowBatchUse: template.allowBatchUse,
    };
  }

  private renderPane(): void {
    const listedCount = this.marketListings?.total ?? 0;
    const orderCount = this.marketOrders?.orders.length ?? 0;
    const storageCount = this.marketStorage?.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = `
        <div class="panel-section market-pane">
          <div class="panel-section-title">坊市</div>
          <div class="market-pane-copy">${escapeHtml(MARKET_PANE_HINT)}</div>
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

  private openModal(): void {
    if (!this.selectedGroupItemId && this.marketListings?.items.length) {
      this.selectedGroupItemId = this.marketListings.items[0].itemId;
    }
    const activeGroup = this.getActiveListingGroup();
    if (!this.selectedItemKey && activeGroup && !activeGroup.canEnhance) {
      this.selectedItemKey = this.getVariantEntriesForGroup(activeGroup)[0]?.itemKey ?? null;
    }
    if (!this.marketListings) {
      this.requestListings(1);
    }
    if (this.modalTab === 'market' && this.selectedItemKey) {
      this.requestItemBook(this.selectedItemKey);
    }
    if (this.modalTab === 'trade-history') {
      this.requestTradeHistory(this.tradeHistoryPage);
    }
    this.renderModal();
  }

  private renderModal(): void {
    const marketUpdate = this.marketUpdate;
    detailModalHost.open({
      ownerId: MarketPanel.MODAL_OWNER,
      variantClass: 'detail-modal--market',
      title: '坊市',
      subtitle: '匿名挂售、求购与自动撮合',
      bodyHtml: marketUpdate
        ? this.renderModalBody(marketUpdate)
        : '<div class="empty-hint">坊市盘面同步中……</div>',
      onClose: () => {
        this.itemBookLoading = false;
        this.buyConfirmState = null;
        confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
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
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
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
          this.selectedGroupItemId = null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.tradeDialog = null;
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          this.itemBook = null;
          this.requestListings(1);
        }));

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
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          this.itemBook = null;
          this.requestListings(1);
        }));

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
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          this.itemBook = null;
          this.requestListings(1);
        }));

        body.querySelectorAll<HTMLElement>('[data-market-page]').forEach((button) => button.addEventListener('click', () => {
          const nextPage = Number.parseInt(button.dataset.marketPage ?? '1', 10);
          if (!Number.isFinite(nextPage) || nextPage === this.currentPage) {
            return;
          }
          this.currentPage = Math.max(1, Math.floor(nextPage));
          this.selectedGroupItemId = null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.tradeDialog = null;
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          this.requestListings(this.currentPage);
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
          const groupItemId = button.dataset.marketSelectItemGroup;
          if (!itemKey || !groupItemId) {
            return;
          }
          this.selectedGroupItemId = groupItemId;
          this.enhancementBrowseItemId = groupItemId;
          this.selectedItemKey = itemKey;
          this.itemBook = null;
          this.tradeDialog = null;
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          this.requestItemBook(itemKey);
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-select-group]').forEach((button) => button.addEventListener('click', () => {
          const groupItemId = button.dataset.marketSelectGroup;
          const group = groupItemId
            ? this.marketListings?.items.find((entry) => entry.itemId === groupItemId) ?? null
            : null;
          if (!group || !groupItemId) {
            return;
          }
          this.selectedGroupItemId = groupItemId;
          this.itemBook = null;
          this.tradeDialog = null;
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          if (group.canEnhance) {
            this.enhancementBrowseItemId = groupItemId;
            this.selectedItemKey = null;
            this.renderModal();
            return;
          }
          const directEntry = this.getVariantEntriesForGroup(group)[0] ?? null;
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = directEntry?.itemKey ?? null;
          if (this.selectedItemKey) {
            this.requestItemBook(this.selectedItemKey);
          }
          this.renderModal();
        }));

        body.querySelector<HTMLElement>('[data-market-back-to-groups]')?.addEventListener('click', () => {
          this.enhancementBrowseItemId = null;
          this.selectedItemKey = null;
          this.itemBook = null;
          this.tradeDialog = null;
          this.buyConfirmState = null;
          confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
          this.renderModal();
        });

        body.querySelectorAll<HTMLElement>('[data-market-open-dialog]').forEach((button) => button.addEventListener('click', () => {
          const kind = button.dataset.marketOpenDialog as MarketTradeDialogKind | undefined;
          const selected = this.getSelectedListedItem(this.marketUpdate);
          if (!kind || !selected) {
            return;
          }
          const presetPrice = this.readDatasetNumber(button.dataset.marketOpenDialogPrice);
          const confirmPurchase = button.dataset.marketOpenDialogConfirmPurchase === 'true';
          this.openTradeDialog(selected, kind, presetPrice, confirmPurchase);
        }));

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
        this.syncBuyConfirmModal();
      },
    });
  }

  private renderModalBody(update: S2C_MarketUpdate): string {
    const tabs = MARKET_MODAL_TABS
      .map((tab) => `<button class="market-side-tab ${this.modalTab === tab.id ? 'active' : ''}" data-market-modal-tab="${tab.id}" type="button">${tab.label}</button>`)
      .join('');
    return `
      <div class="market-modal-shell market-modal-shell--wide">
        <aside class="market-side-tabs">
          <div class="market-side-tabs-title">坊市分栏</div>
          ${tabs}
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

  private renderMarketTab(update: S2C_MarketUpdate): string {
    const listedGroups = this.marketListings?.items ?? [];
    if (listedGroups.length === 0) {
      return '<div class="empty-hint">当前分类下暂时没有物品。</div>';
    }
    const pagination = this.getPaginationState(listedGroups);
    const selectedGroup = pagination.items.find((item) => item.itemId === this.selectedGroupItemId) ?? pagination.items[0] ?? null;
    const browsingEnhancementVariants = Boolean(selectedGroup?.canEnhance && this.enhancementBrowseItemId === selectedGroup.itemId);
    const variants = selectedGroup ? this.getVariantEntriesForGroup(selectedGroup) : [];
    const selectedVariant = variants.find((entry) => entry.itemKey === this.selectedItemKey) ?? null;
    const cards = browsingEnhancementVariants
      ? variants.map((entry) => this.renderVariantItem(entry, selectedGroup?.itemId ?? '', selectedVariant?.itemKey ?? '')).join('')
      : pagination.items.map((entry) => this.renderGroupItem(entry, selectedGroup?.itemId ?? '')).join('');
    const selectedItem = selectedVariant ? this.toListedItemView(selectedVariant) : null;
    const orderBook = selectedItem && this.itemBook && this.itemBook.itemKey === selectedItem.itemKey ? this.itemBook : null;
    const categoryTabs = this.renderCategoryTabs(update);
    const subcategoryTabs = this.activeCategory === 'equipment'
      ? this.renderEquipmentTabs(update)
      : this.activeCategory === 'skill_book'
        ? this.renderTechniqueTabs(update)
        : '';
    const compactList = this.hasCompactCategoryLayout();
    const listToolbar = browsingEnhancementVariants && selectedGroup
      ? this.renderVariantToolbar(selectedGroup, variants.length)
      : this.renderListToolbar(pagination.page, pagination.totalPages, pagination.totalItems);
    return `
      <div class="market-market-tab">
        <div class="market-category-tabs">${categoryTabs}</div>
        ${subcategoryTabs ? `<div class="market-category-tabs market-category-tabs--sub">${subcategoryTabs}</div>` : ''}
        <div class="market-board">
          <div class="market-board-list-wrap">
            ${listToolbar}
            <div class="market-board-list ${compactList ? 'market-board-list--compact' : ''}">${cards}</div>
          </div>
          <div class="market-book-panel">
            ${selectedItem
              ? this.renderBookPanel(selectedItem, orderBook, update.currencyItemName)
              : this.renderMarketBrowsePlaceholder(selectedGroup, browsingEnhancementVariants)}
          </div>
        </div>
      </div>
    `;
  }

  private renderGroupItem(entry: MarketListingGroupEntry, activeItemId: string): string {
    const ownedCount = this.findInventoryItemCountByItemId(entry.item.itemId);
    const status = this.getItemStatusState(entry.item);
    const zeroVariant = this.getGroupZeroVariant(entry);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    const statusClass = status ? ` market-item-cell--status market-item-cell--status-${status.kind}` : '';
    const statusRibbon = status
      ? `<span class="market-item-cell-ribbon" aria-hidden="true"><span>${escapeHtml(status.label)}</span></span>`
      : '';
    return `
      <button class="market-item-cell ${entry.itemId === activeItemId ? 'active' : ''}${statusClass}" data-market-select-group="${escapeHtmlAttr(entry.itemId)}" type="button">
        ${statusRibbon}
        <div class="market-item-cell-name" title="${escapeHtmlAttr(entry.item.name)}">
          <span class="market-item-cell-name-text">${escapeHtml(entry.item.name)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${zeroVariant?.lowestSellPrice !== undefined ? this.formatMarketUnitPrice(zeroVariant.lowestSellPrice) : '--'} · ${formatDisplayCountBadge(zeroVariant?.sellQuantity ?? 0)}</span>
          <span>买 ${zeroVariant?.highestBuyPrice !== undefined ? this.formatMarketUnitPrice(zeroVariant.highestBuyPrice) : '--'} · ${formatDisplayCountBadge(zeroVariant?.buyQuantity ?? 0)}</span>
        </div>
      </button>
    `;
  }

  private renderVariantItem(entry: MarketListingVariantEntry, groupItemId: string, activeItemKey: string): string {
    const ownedCount = this.findMatchingInventoryCount(entry.item);
    return `
      <button
        class="market-item-cell ${entry.itemKey === activeItemKey ? 'active' : ''}"
        data-market-select-item="${escapeHtmlAttr(entry.itemKey)}"
        data-market-select-item-group="${escapeHtmlAttr(groupItemId)}"
        type="button"
      >
        <div class="market-item-cell-name" title="${escapeHtmlAttr(entry.item.name)}">
          <span class="market-item-cell-name-text">${escapeHtml(this.getMarketDisplayName(entry.item))}</span>
          ${ownedCount > 0 ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>` : ''}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${entry.lowestSellPrice !== undefined ? this.formatMarketUnitPrice(entry.lowestSellPrice) : '--'}</span>
          <span>买 ${entry.highestBuyPrice !== undefined ? this.formatMarketUnitPrice(entry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  private getItemStatusState(item: ItemStack): { label: string; kind: 'learned' | 'unlocked' } | null {
    if (item.type === 'skill_book') {
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
      if (techniqueId && this.learnedTechniqueIds.has(techniqueId)) {
        return { label: '已学', kind: 'learned' };
      }
    }
    if (item.mapUnlockId && this.unlockedMinimapIds.has(item.mapUnlockId)) {
      return { label: '已阅', kind: 'unlocked' };
    }
    return null;
  }

  private renderBookPanel(entry: MarketListedItemView, book: S2C_MarketItemBook['book'] | null, currencyName: string): string {
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
        <div class="market-book-column">
          <div class="market-book-column-head">
            <div class="market-book-column-title">挂售</div>
            <button class="small-btn ghost" data-market-open-dialog="sell" data-market-open-dialog-confirm-purchase="false" type="button" ${(matchedInventoryCount > 0 && !sellConflict) ? '' : 'disabled'}>挂售</button>
          </div>
          ${sellConflict ? '<div class="market-action-hint">你已在求购这件物品，不能再挂售。</div>' : ''}
          ${book
            ? this.renderPriceLevels(book.sells, currencyName, '当前还没有卖盘。', {
              kind: 'buy',
              label: '购买',
              confirmPurchase: true,
              disabled: Boolean(buyConflict),
            })
            : this.renderBookLoading(this.itemBookLoading ? '卖盘同步中……' : '当前盘面已更新，请重新选择物品。')}
        </div>
        <div class="market-book-column">
          <div class="market-book-column-head">
            <div class="market-book-column-title">求购</div>
            <button class="small-btn ghost" data-market-open-dialog="buy" data-market-open-dialog-confirm-purchase="false" type="button" ${buyConflict ? 'disabled' : ''}>求购</button>
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

  private renderMarketBrowsePlaceholder(
    group: MarketListingGroupEntry | null,
    browsingEnhancementVariants: boolean,
  ): string {
    if (!group) {
      return '<div class="empty-hint">请选择左侧物品。</div>';
    }
    if (browsingEnhancementVariants) {
      return `
        <div class="market-book-header">
          <div>
            <div class="market-item-title">${escapeHtml(group.item.name)}</div>
            <div class="market-book-subtitle">该物品支持强化，请先从左侧选择要交易的强化等级。</div>
          </div>
        </div>
        <div class="empty-hint">选定具体强化等级后，这里会显示该等级的挂售/求购盘口，并可直接购买、出售、挂售或求购。</div>
      `;
    }
    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title">${escapeHtml(group.item.name)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(group.item.type))} · 点击左侧物品查看具体盘面</div>
        </div>
      </div>
      <div class="empty-hint">点击左侧物品后，这里会显示当前挂售、求购和快捷交易入口。</div>
    `;
  }

  private renderPriceLevels(
    levels: NonNullable<S2C_MarketItemBook['book']>['sells'],
    currencyName: string,
    emptyText: string,
    quickAction?: {
      kind: MarketTradeDialogKind;
      label: string;
      confirmPurchase?: boolean;
      disabled?: boolean;
    },
  ): string {
    if (levels.length === 0) {
      return `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return levels.map((level, index) => `
      <div class="market-book-level">
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

  private renderBookLoading(text: string): string {
    return `<div class="empty-hint">${escapeHtml(text)}</div>`;
  }

  private renderMyOrdersTab(update: S2C_MarketUpdate): string {
    const buyOrders = update.myOrders.filter((order) => order.side === 'buy');
    const sellOrders = update.myOrders.filter((order) => order.side === 'sell');
    const storage = update.storage;
    return `
      <div class="market-my-orders">
        <div class="market-my-orders-grid">
          <div class="market-my-orders-column">
            <div class="panel-section-title">我的求购</div>
            ${buyOrders.length > 0 ? buyOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : '<div class="empty-hint">当前没有求购挂单。</div>'}
          </div>
          <div class="market-my-orders-column">
            <div class="panel-section-title">我的挂售</div>
            ${sellOrders.length > 0 ? sellOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : '<div class="empty-hint">当前没有挂售单。</div>'}
          </div>
        </div>
        <div class="market-storage-card">
          <div class="market-storage-head">
            <div class="panel-section-title">坊市托管仓</div>
            <button class="small-btn" data-market-claim-storage type="button" ${storage.items.length > 0 ? '' : 'disabled'}>全部领取</button>
          </div>
          ${this.renderStorage(storage)}
        </div>
      </div>
    `;
  }

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
        <div class="market-list-toolbar">
          <div class="market-list-toolbar-meta">仅显示最近 ${formatDisplayInteger(Math.min(100, totalVisible))} 条中的第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页</div>
          <div class="market-list-toolbar-actions">
            <button class="small-btn ghost" data-market-history-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <button class="small-btn ghost" data-market-history-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
          </div>
        </div>
        <div class="market-trade-history-hint">只显示你自己的成交记录，不显示交易双方。</div>
        <div class="market-trade-history-list">
          ${records.length > 0
            ? records.map((record) => `
              <div class="market-trade-history-item">
                <div class="market-trade-history-head">
                  <span class="market-order-name">${escapeHtml(this.buildLocalMarketItem(record.itemId).name)}</span>
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

  private renderOwnOrder(order: MarketOwnOrderView, currencyName: string): string {
    return `
      <div class="market-order-card">
        <div class="market-order-card-head">
          <span class="market-order-name">${escapeHtml(order.item.name)}</span>
          <span class="market-order-side ${order.side === 'buy' ? 'buy' : 'sell'}">${order.side === 'buy' ? '求购' : '挂售'}</span>
        </div>
        <div class="market-order-meta">剩余 ${formatDisplayCountBadge(order.remainingQuantity)} · 单价 ${this.formatMarketUnitPrice(order.unitPrice)} ${escapeHtml(currencyName)}</div>
        <button class="small-btn ghost" data-market-cancel-order="${order.id}" type="button">取消订单</button>
      </div>
    `;
  }

  private renderStorage(storage: MarketStorage): string {
    if (storage.items.length === 0) {
      return '<div class="empty-hint">托管仓空空如也。</div>';
    }
    return `
      <div class="market-storage-list">
        ${storage.items.map((item) => `
          <div class="market-storage-item">
            <span>${escapeHtml(item.name)}</span>
            <span>${formatDisplayCountBadge(item.count)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderListToolbar(page: number, totalPages: number, totalItems: number): string {
    return `
      <div class="market-list-toolbar">
        <div class="market-list-toolbar-meta">共 ${formatDisplayInteger(totalItems)} 件，第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页</div>
        <div class="market-list-toolbar-actions">
        <button class="small-btn ghost" data-market-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
        <button class="small-btn ghost" data-market-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      </div>
    `;
  }

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
        <div class="market-trade-dialog market-trade-dialog--${dialog.kind}" role="dialog" aria-modal="true">
        <div class="market-trade-dialog-head">
          <div class="market-trade-dialog-title">
            <div class="panel-section-title">${title}</div>
            <div class="market-trade-dialog-item market-trade-dialog-item--interactive" data-market-item-tooltip="selected">${escapeHtml(entry.item.name)}</div>
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

  private bindItemTooltipEvents(body: HTMLElement): void {
    const nodes = body.querySelectorAll<HTMLElement>('[data-market-item-tooltip]');
    const selected = this.getSelectedListedItem(this.marketUpdate);
    if (nodes.length === 0 || !selected) {
      return;
    }
    const tapMode = prefersPinnedTooltipInteraction();
    const tooltip = buildItemTooltipPayload(selected.item);
    const showTooltip = (node: HTMLElement, event: PointerEvent): void => {
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

  private getSelectedListedItem(update: S2C_MarketUpdate | null): MarketListedItemView | null {
    void update;
    return this.findListingVariantByKey(this.selectedItemKey);
  }

  private renderCategoryTabs(update: S2C_MarketUpdate): string {
    const categories: Array<{ id: MarketCategoryFilter; label: string }> = [
      { id: 'all', label: '全部' },
      ...ITEM_TYPES.map((type) => ({
        id: type,
        label: getItemTypeLabel(type),
      })),
    ];
    return categories
      .map((category) => `
        <button
          class="market-category-tab ${this.activeCategory === category.id ? 'active' : ''}"
          data-market-category="${category.id}"
          type="button"
        >${escapeHtml(category.label)}</button>
      `)
      .join('');
  }

  private renderEquipmentTabs(update: S2C_MarketUpdate): string {
    const categories: Array<{ id: MarketEquipmentFilter; label: string }> = [
      {
        id: 'all',
        label: '全部装备',
      },
      ...EQUIP_SLOTS.map((slot) => ({
        id: slot,
        label: getEquipSlotLabel(slot),
      })),
    ];
    return categories
      .map((category) => `
        <button
          class="market-category-tab ${this.activeEquipmentCategory === category.id ? 'active' : ''}"
          data-market-equipment-category="${category.id}"
          type="button"
        >${escapeHtml(category.label)}</button>
      `)
      .join('');
  }

  private renderTechniqueTabs(update: S2C_MarketUpdate): string {
    return MARKET_TECHNIQUE_FILTERS
      .map((category) => `
        <button
          class="market-category-tab ${this.activeTechniqueCategory === category.id ? 'active' : ''}"
          data-market-technique-category="${category.id}"
          type="button"
        >${escapeHtml(category.label)}</button>
      `)
      .join('');
  }

  private getActiveListingGroup(): MarketListingGroupEntry | null {
    const groups = this.marketListings?.items ?? [];
    return groups.find((entry) => entry.itemId === this.selectedGroupItemId) ?? groups[0] ?? null;
  }

  private getCurrentVariantEntries(): MarketListingVariantEntry[] {
    const activeGroup = this.getActiveListingGroup();
    if (!activeGroup) {
      return [];
    }
    return this.getVariantEntriesForGroup(activeGroup);
  }

  private getVariantEntriesForGroup(group: MarketListingGroupEntry): MarketListingVariantEntry[] {
    const variants = new Map<string | number, MarketListingVariantEntry>();
    group.variants.forEach((entry) => {
      const level = Math.max(0, Math.floor(Number(entry.item.enhanceLevel) || 0));
      const key = group.canEnhance ? level : entry.itemKey;
      if (group.canEnhance && level > MAX_ENHANCE_LEVEL) {
        return;
      }
      const current = variants.get(key);
      if (!current) {
        variants.set(key, {
          ...entry,
          item: { ...entry.item },
        });
        return;
      }
      current.lowestSellPrice = current.lowestSellPrice === undefined
        ? entry.lowestSellPrice
        : entry.lowestSellPrice === undefined
          ? current.lowestSellPrice
          : Math.min(current.lowestSellPrice, entry.lowestSellPrice);
      current.highestBuyPrice = current.highestBuyPrice === undefined
        ? entry.highestBuyPrice
        : entry.highestBuyPrice === undefined
          ? current.highestBuyPrice
          : Math.max(current.highestBuyPrice, entry.highestBuyPrice);
      current.sellOrderCount += entry.sellOrderCount;
      current.sellQuantity += entry.sellQuantity;
      current.buyOrderCount += entry.buyOrderCount;
      current.buyQuantity += entry.buyQuantity;
    });
    if (!group.canEnhance) {
      this.inventory.items
        .filter((entry) => entry.itemId === group.itemId)
        .forEach((entry) => {
          const itemKey = this.normalizeItemKey(entry);
          if (variants.has(itemKey)) {
            return;
          }
          variants.set(itemKey, {
            itemKey,
            item: {
              ...entry,
              count: 1,
            },
            lowestSellPrice: undefined,
            highestBuyPrice: undefined,
            sellOrderCount: 0,
            sellQuantity: 0,
            buyOrderCount: 0,
            buyQuantity: 0,
          });
        });
    }
    return [...variants.values()].sort((left, right) => {
      const leftLevel = Math.max(0, Math.floor(Number(left.item.enhanceLevel) || 0));
      const rightLevel = Math.max(0, Math.floor(Number(right.item.enhanceLevel) || 0));
      if (leftLevel !== rightLevel) {
        return leftLevel - rightLevel;
      }
      return left.itemKey.localeCompare(right.itemKey);
    });
  }

  private toListedItemView(entry: MarketListingVariantEntry): MarketListedItemView {
    return {
      itemKey: entry.itemKey,
      item: { ...entry.item },
      sellOrderCount: entry.sellOrderCount,
      sellQuantity: entry.sellQuantity,
      lowestSellPrice: entry.lowestSellPrice,
      buyOrderCount: entry.buyOrderCount,
      buyQuantity: entry.buyQuantity,
      highestBuyPrice: entry.highestBuyPrice,
    };
  }

  private getGroupZeroVariant(group: MarketListingGroupEntry): MarketListingVariantEntry | null {
    return this.getVariantEntriesForGroup(group)
      .find((entry) => Math.max(0, Math.floor(Number(entry.item.enhanceLevel) || 0)) === 0) ?? null;
  }

  private findListingVariantByKey(itemKey: string | null | undefined): MarketListedItemView | null {
    if (!itemKey) {
      return null;
    }
    for (const group of this.marketListings?.items ?? []) {
      const variant = this.getVariantEntriesForGroup(group).find((entry) => entry.itemKey === itemKey);
      if (variant) {
        return this.toListedItemView(variant);
      }
    }
    return null;
  }

  private getVisibleListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[] {
    return update?.listedItems ?? [];
  }

  private getPaginationState<T>(items: T[]): {
    page: number;
    totalPages: number;
    totalItems: number;
    items: T[];
  } {
    const totalItems = this.marketListings?.total ?? items.length;
    const pageSize = this.marketListings?.pageSize ?? this.getMarketPageSize();
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = this.marketListings?.page ?? this.currentPage;
    this.currentPage = page;
    return {
      page,
      totalPages,
      totalItems,
      items,
    };
  }

  private clampPage(page: number, totalItems: number): number {
    const totalPages = Math.max(1, Math.ceil(totalItems / this.getMarketPageSize()));
    if (!Number.isFinite(page)) {
      return 1;
    }
    return Math.max(1, Math.min(totalPages, Math.floor(page)));
  }

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

  private hasCompactCategoryLayout(): boolean {
    return this.activeCategory === 'equipment' || this.activeCategory === 'skill_book';
  }

  private resolveTechniqueCategoryForItem(item: ItemStack): TechniqueCategory | null {
    if (item.type !== 'skill_book') {
      return null;
    }
    return getLocalTechniqueCategoryForBookItem(item.itemId);
  }

  private syncPageSelection(): void {
    const groups = this.marketListings?.items ?? [];
    const pagination = this.getPaginationState(groups);
    const currentItems = pagination.items;
    const hasSelectedGroup = currentItems.some((item) => item.itemId === this.selectedGroupItemId);
    this.selectedGroupItemId = hasSelectedGroup ? this.selectedGroupItemId : currentItems[0]?.itemId ?? null;
  }

  private renderVariantToolbar(group: MarketListingGroupEntry, totalVariants: number): string {
    return `
      <div class="market-list-toolbar">
        <div class="market-list-toolbar-meta">${escapeHtml(group.item.name)} · 共 ${formatDisplayInteger(totalVariants)} 个强化等级</div>
        <div class="market-list-toolbar-actions">
          <button class="small-btn ghost" data-market-back-to-groups type="button">返回物品列表</button>
        </div>
      </div>
    `;
  }

  private requestListings(page: number): void {
    this.callbacks?.onRequestMarketListings({
      page,
      pageSize: this.getMarketPageSize(),
      category: this.activeCategory,
      equipmentSlot: this.activeEquipmentCategory,
      techniqueCategory: this.activeTechniqueCategory,
    });
  }

  private requestItemBook(itemKey: string): void {
    this.itemBookLoading = true;
    this.callbacks?.onRequestItemBook(itemKey);
  }

  private requestTradeHistory(page: number): void {
    this.tradeHistoryLoading = true;
    this.tradeHistoryPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    this.callbacks?.onRequestTradeHistory(this.tradeHistoryPage);
  }

  private openTradeDialog(
    entry: MarketListedItemView,
    kind: MarketTradeDialogKind,
    preferredPrice?: number | null,
    confirmPurchase = false,
  ): void {
    const unitPrice = this.getDefaultTradeDialogPrice(entry, kind, preferredPrice);
    this.tradeDialog = {
      kind,
      quantity: this.normalizeTradeDialogQuantity(1, entry, kind, unitPrice),
      unitPrice,
      confirmPurchase: kind === 'buy' && confirmPurchase,
    };
    this.syncTradeDialogOverlay();
  }

  private renderBuyConfirmBody(entry: MarketListedItemView, currencyName: string, quantity: number, unitPrice: number): string {
    const estimate = this.estimateImmediateBuy(entry, quantity, unitPrice);
    const maxReservedCost = this.getMarketTradeTotalCost(quantity, unitPrice);
    const summary = estimate.immediateQuantity > 0
      ? estimate.pendingQuantity > 0
        ? `预计先按当前卖盘成交 ${formatDisplayInteger(estimate.immediateQuantity)} 件，剩余 ${formatDisplayInteger(estimate.pendingQuantity)} 件会继续挂为求购单。`
        : `预计会按当前卖盘直接成交 ${formatDisplayInteger(estimate.immediateQuantity)} 件。`
      : '当前无法保证立刻成交，确认后会按当前单价挂出求购单。';
    return `
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>购买数量</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(quantity)}</strong>
            <span>单价 ${this.formatMarketUnitPrice(unitPrice)} ${escapeHtml(currencyName)}</span>
          </div>
        </div>
        <div class="market-trade-dialog-total">
          <span>最高占用</span>
          <strong>${maxReservedCost === null ? '--' : `${formatDisplayInteger(maxReservedCost)} ${escapeHtml(currencyName)}`}</strong>
        </div>
      </div>
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>撮合预估</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(estimate.immediateQuantity)}</strong>
            <span>预计立即成交</span>
          </div>
        </div>
        <div class="market-trade-dialog-total ${estimate.pendingQuantity > 0 ? '' : 'hidden'}">
          <span>剩余挂单</span>
          <strong>${formatDisplayInteger(estimate.pendingQuantity)} 件</strong>
        </div>
      </div>
      <div class="market-action-hint">${escapeHtml(summary)}</div>
      <div class="market-action-hint ${estimate.immediateQuantity > 0 ? '' : 'hidden'}">若卖盘成交价低于你的出价，差额会按现有撮合规则退回。</div>
    `;
  }

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

  private syncBuyConfirmModal(): void {
    const confirmState = this.buyConfirmState;
    const update = this.marketUpdate;
    const entry = this.findListingVariantByKey(confirmState?.itemKey);
    if (!confirmState || !update || !entry || !detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER) || this.modalTab !== 'market') {
      this.buyConfirmState = null;
      confirmModalHost.close(MarketPanel.CONFIRM_MODAL_OWNER);
      return;
    }
    confirmModalHost.open({
      ownerId: MarketPanel.CONFIRM_MODAL_OWNER,
      title: '确认购买',
      subtitle: entry.item.name,
      bodyHtml: this.renderBuyConfirmBody(entry, update.currencyItemName, confirmState.quantity, confirmState.unitPrice),
      confirmLabel: '确认购买',
      onConfirm: () => {
        const latest = this.buyConfirmState;
        const latestEntry = this.findListingVariantByKey(latest?.itemKey);
        if (!latest || !latestEntry) {
          this.buyConfirmState = null;
          return;
        }
        this.tradeDialog = null;
        this.syncTradeDialogOverlay();
        this.callbacks?.onCreateBuyOrder(latestEntry.itemKey, latest.quantity, latest.unitPrice);
        this.buyConfirmState = null;
      },
      onClose: () => {
        this.buyConfirmState = null;
      },
    });
  }

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
        if (this.tradeDialog.confirmPurchase) {
          this.buyConfirmState = {
            itemKey: selected.itemKey,
            quantity,
            unitPrice,
          };
          this.syncBuyConfirmModal();
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

  private findConflictingOwnOrder(itemKey: string, nextSide: MarketTradeDialogKind): MarketOwnOrderView | null {
    const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
    return this.marketUpdate?.myOrders.find((order) =>
      order.itemKey === itemKey
      && order.side === oppositeSide
      && order.remainingQuantity > 0
      && order.status === 'open') ?? null;
  }

  private getDefaultTradeDialogPrice(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null): number {
    const fallback = kind === 'buy'
      ? (entry.lowestSellPrice ?? entry.highestBuyPrice ?? MARKET_DIALOG_MIN_PRICE)
      : (entry.highestBuyPrice ?? entry.lowestSellPrice ?? MARKET_DIALOG_MIN_PRICE);
    const source = preferredPrice && preferredPrice > 0 ? preferredPrice : fallback;
    return this.normalizeTradeDialogPrice(source, kind === 'buy' ? 'up' : 'down');
  }

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

  private getTradeDialogQuantityStep(unitPrice: number): number {
    return Math.max(1, getMarketMinimumTradeQuantity(unitPrice));
  }

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

  private normalizeTradeDialogPrice(value: number, direction: 'up' | 'down'): number {
    const bounded = Math.max(MARKET_DIALOG_MIN_PRICE, Math.min(MARKET_DIALOG_MAX_PRICE, value));
    if (direction === 'up') {
      return Math.min(MARKET_DIALOG_MAX_PRICE, normalizeMarketPriceUp(bounded));
    }
    return Math.max(MARKET_DIALOG_MIN_PRICE, normalizeMarketPriceDown(bounded));
  }

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

  private readDatasetNumber(value: string | undefined): number | null {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatMarketUnitPrice(value: number): string {
    return formatDisplayNumber(value, {
      maximumFractionDigits: value < 1 ? 2 : 0,
      compactMaximumFractionDigits: value < 1 ? 2 : 0,
    });
  }

  private getMarketTradeTotalCost(quantity: number, unitPrice: number): number | null {
    return calculateMarketTradeTotalCost(quantity, unitPrice);
  }

  private getMarketEnhanceLevel(item: ItemStack): number {
    return item.type === 'equipment'
      ? Math.max(0, Math.floor(Number(item.enhanceLevel) || 0))
      : 0;
  }

  private getMarketMatchKey(item: ItemStack): string {
    return item.type === 'equipment'
      ? `${item.itemId}::${this.getMarketEnhanceLevel(item)}`
      : item.itemId;
  }

  private getMarketDisplayName(item: ItemStack): string {
    const baseName = item.name.replace(/^\+\d+\s+/, '');
    const enhanceLevel = this.getMarketEnhanceLevel(item);
    return enhanceLevel > 0 ? `+${formatDisplayInteger(enhanceLevel)} ${baseName}` : baseName;
  }

  private normalizeItemKey(item: ItemStack): string {
    return createItemStackSignature({
      ...item,
      count: 1,
    });
  }

  private findMatchingInventorySlot(item: ItemStack): number | null {
    const itemKey = this.getMarketMatchKey(item);
    const slotIndex = this.inventory.items.findIndex((entry) => this.getMarketMatchKey(entry) === itemKey);
    return slotIndex >= 0 ? slotIndex : null;
  }

  private findMatchingInventoryCount(item: ItemStack): number {
    const itemKey = this.getMarketMatchKey(item);
    return this.inventory.items
      .filter((entry) => this.getMarketMatchKey(entry) === itemKey)
      .reduce((sum, entry) => sum + entry.count, 0);
  }

  private findInventoryItemCountByItemId(itemId: string): number {
    return this.inventory.items
      .filter((entry) => entry.itemId === itemId)
      .reduce((sum, entry) => sum + entry.count, 0);
  }

  private areStringSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left.size !== right.size) {
      return false;
    }
    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }
    return true;
  }

  private areInventoriesEquivalent(left: Inventory | null | undefined, right: Inventory | null | undefined): boolean {
    const leftItems = left?.items ?? [];
    const rightItems = right?.items ?? [];
    if ((left?.capacity ?? 0) !== (right?.capacity ?? 0) || leftItems.length !== rightItems.length) {
      return false;
    }
    for (let index = 0; index < leftItems.length; index += 1) {
      const leftItem = leftItems[index];
      const rightItem = rightItems[index];
      if (!leftItem || !rightItem) {
        return false;
      }
      if (!this.areMarketItemsEquivalent(leftItem, rightItem)) {
        return false;
      }
    }
    return true;
  }

  private areMarketItemsEquivalent(left: ItemStack, right: ItemStack): boolean {
    return left.count === right.count && this.normalizeItemKey(left) === this.normalizeItemKey(right);
  }

  private areMarketListingsEqual(left: S2C_MarketListings | null, right: S2C_MarketListings): boolean {
    if (!left) {
      return false;
    }
    if (
      left.currencyItemId !== right.currencyItemId
      || left.currencyItemName !== right.currencyItemName
      || left.page !== right.page
      || left.pageSize !== right.pageSize
      || left.total !== right.total
      || left.category !== right.category
      || left.equipmentSlot !== right.equipmentSlot
      || left.techniqueCategory !== right.techniqueCategory
      || left.items.length !== right.items.length
    ) {
      return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
      const leftItem = left.items[index];
      const rightItem = right.items[index];
      if (
        leftItem.itemId !== rightItem.itemId
        || !this.areMarketItemsEquivalent(leftItem.item, rightItem.item)
        || leftItem.lowestSellPrice !== rightItem.lowestSellPrice
        || leftItem.highestBuyPrice !== rightItem.highestBuyPrice
        || leftItem.canEnhance !== rightItem.canEnhance
        || leftItem.variants.length !== rightItem.variants.length
      ) {
        return false;
      }
      for (let variantIndex = 0; variantIndex < leftItem.variants.length; variantIndex += 1) {
        const leftVariant = leftItem.variants[variantIndex];
        const rightVariant = rightItem.variants[variantIndex];
        if (
          leftVariant.itemKey !== rightVariant.itemKey
          || !this.areMarketItemsEquivalent(leftVariant.item, rightVariant.item)
          || leftVariant.lowestSellPrice !== rightVariant.lowestSellPrice
          || leftVariant.highestBuyPrice !== rightVariant.highestBuyPrice
          || leftVariant.sellOrderCount !== rightVariant.sellOrderCount
          || leftVariant.sellQuantity !== rightVariant.sellQuantity
          || leftVariant.buyOrderCount !== rightVariant.buyOrderCount
          || leftVariant.buyQuantity !== rightVariant.buyQuantity
        ) {
          return false;
        }
      }
    }
    return true;
  }

  private areMarketOrdersEqual(left: S2C_MarketOrders | null, right: S2C_MarketOrders): boolean {
    if (!left) {
      return false;
    }
    if (
      left.currencyItemId !== right.currencyItemId
      || left.currencyItemName !== right.currencyItemName
      || left.orders.length !== right.orders.length
    ) {
      return false;
    }
    for (let index = 0; index < left.orders.length; index += 1) {
      const leftOrder = left.orders[index];
      const rightOrder = right.orders[index];
      if (
        leftOrder.id !== rightOrder.id
        || leftOrder.side !== rightOrder.side
        || leftOrder.status !== rightOrder.status
        || leftOrder.itemKey !== rightOrder.itemKey
        || !this.areMarketItemsEquivalent(leftOrder.item, rightOrder.item)
        || leftOrder.remainingQuantity !== rightOrder.remainingQuantity
        || leftOrder.unitPrice !== rightOrder.unitPrice
        || leftOrder.createdAt !== rightOrder.createdAt
      ) {
        return false;
      }
    }
    return true;
  }

  private areMarketStorageEqual(left: S2C_MarketStorage | null, right: S2C_MarketStorage): boolean {
    if (!left || left.items.length !== right.items.length) {
      return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
      const leftItem = left.items[index];
      const rightItem = right.items[index];
      if (
        leftItem.itemKey !== rightItem.itemKey
        || !this.areMarketItemsEquivalent(leftItem.item, rightItem.item)
        || leftItem.count !== rightItem.count
      ) {
        return false;
      }
    }
    return true;
  }

  private areMarketItemBooksEqual(
    left: S2C_MarketItemBook['book'] | null,
    right: S2C_MarketItemBook['book'] | null,
  ): boolean {
    if (left === right) {
      return true;
    }
    if (!left || !right || left.itemKey !== right.itemKey || !this.areMarketItemsEquivalent(left.item, right.item)) {
      return false;
    }
    return this.arePriceLevelsEqual(left.sells, right.sells) && this.arePriceLevelsEqual(left.buys, right.buys);
  }

  private arePriceLevelsEqual(
    left: NonNullable<S2C_MarketItemBook['book']>['sells'],
    right: NonNullable<S2C_MarketItemBook['book']>['sells'],
  ): boolean {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      const leftLevel = left[index];
      const rightLevel = right[index];
      if (leftLevel.unitPrice !== rightLevel.unitPrice || leftLevel.quantity !== rightLevel.quantity) {
        return false;
      }
    }
    return true;
  }

  private areMarketTradeHistoryEqual(left: S2C_MarketTradeHistory | null, right: S2C_MarketTradeHistory): boolean {
    if (!left) {
      return false;
    }
    if (
      left.page !== right.page
      || left.pageSize !== right.pageSize
      || left.totalVisible !== right.totalVisible
      || left.records.length !== right.records.length
    ) {
      return false;
    }
    for (let index = 0; index < left.records.length; index += 1) {
      const leftRecord = left.records[index];
      const rightRecord = right.records[index];
      if (
        leftRecord.itemId !== rightRecord.itemId
        || leftRecord.quantity !== rightRecord.quantity
        || leftRecord.unitPrice !== rightRecord.unitPrice
        || leftRecord.side !== rightRecord.side
        || leftRecord.createdAt !== rightRecord.createdAt
      ) {
        return false;
      }
    }
    return true;
  }
}

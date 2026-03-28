import {
  createItemStackSignature,
  EQUIP_SLOTS,
  EquipSlot,
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
  S2C_MarketItemBook,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
  TechniqueCategory,
  getMarketPriceStep,
  normalizeMarketPriceDown,
  normalizeMarketPriceUp,
} from '@mud/shared';
import { getLocalTechniqueCategoryForBookItem } from '../../content/local-templates';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { getViewportRoot } from '../responsive-viewport';
import { detailModalHost } from '../detail-modal-host';
import { preserveSelection } from '../selection-preserver';
import { MARKET_MODAL_TABS, MARKET_PANE_HINT, MarketModalTab } from '../../constants/ui/market';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

interface MarketPanelCallbacks {
  onRequestMarket: () => void;
  onRequestItemBook: (itemKey: string) => void;
  onRequestTradeHistory: (page: number) => void;
  onCreateSellOrder: (slotIndex: number, quantity: number, unitPrice: number) => void;
  onCreateBuyOrder: (itemId: string, quantity: number, unitPrice: number) => void;
  onCancelOrder: (orderId: string) => void;
  onClaimStorage: () => void;
}

type MarketCategoryFilter = 'all' | ItemType;
type MarketEquipmentFilter = 'all' | EquipSlot;
type MarketTechniqueFilter = 'all' | TechniqueCategory;
type MarketTradeDialogKind = 'buy' | 'sell';
type MarketPriceAction = 'decrease' | 'increase' | 'double' | 'half' | 'preset';

interface MarketTradeDialogState {
  kind: MarketTradeDialogKind;
  quantity: number;
  unitPrice: number;
}

const MARKET_DESKTOP_PAGE_SIZE = 32;
const MARKET_MOBILE_PAGE_SIZE = 12;
const MARKET_DESKTOP_COMPACT_PAGE_SIZE = 28;
const MARKET_MOBILE_COMPACT_PAGE_SIZE = 10;
const MARKET_DIALOG_MIN_PRICE = MARKET_PRICE_PRESET_VALUES[0];
const MARKET_DIALOG_MAX_PRICE = MARKET_MAX_UNIT_PRICE;
const MARKET_DIALOG_MAX_QUANTITY = 9999;
const MARKET_TECHNIQUE_FILTERS: Array<{ id: MarketTechniqueFilter; label: string }> = [
  { id: 'all', label: '全部功法' },
  { id: 'arts', label: getTechniqueCategoryLabel('arts') },
  { id: 'internal', label: getTechniqueCategoryLabel('internal') },
  { id: 'divine', label: getTechniqueCategoryLabel('divine') },
  { id: 'secret', label: getTechniqueCategoryLabel('secret') },
];

export class MarketPanel {
  private static readonly MODAL_OWNER = 'market-panel';
  private static readonly TRADE_MODAL_ID = 'market-trade-modal-root';
  private readonly pane = document.getElementById('pane-market')!;
  private callbacks: MarketPanelCallbacks | null = null;
  private marketUpdate: S2C_MarketUpdate | null = null;
  private itemBook: MarketOrderBookView | null = null;
  private selectedItemKey: string | null = null;
  private modalTab: MarketModalTab = 'market';
  private activeCategory: MarketCategoryFilter = 'all';
  private activeEquipmentCategory: MarketEquipmentFilter = 'all';
  private activeTechniqueCategory: MarketTechniqueFilter = 'all';
  private currentPage = 1;
  private tradeHistoryPage = 1;
  private itemBookLoading = false;
  private tradeHistoryLoading = false;
  private tradeDialog: MarketTradeDialogState | null = null;
  private tradeHistory: S2C_MarketTradeHistory | null = null;
  private inventory: Inventory = { items: [], capacity: 0 };
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  private tooltipNode: HTMLElement | null = null;

  constructor() {
    this.bindPaneEvents();
    this.renderPane();
  }

  setCallbacks(callbacks: MarketPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.renderPane();
  }

  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  updateMarket(data: S2C_MarketUpdate): void {
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

  updateItemBook(data: S2C_MarketItemBook): void {
    if (data.itemKey !== this.selectedItemKey) {
      return;
    }
    this.itemBookLoading = false;
    this.itemBook = data.book;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    } else {
      this.syncTradeDialogOverlay();
    }
  }

  updateTradeHistory(data: S2C_MarketTradeHistory): void {
    this.tradeHistoryLoading = false;
    this.tradeHistory = data;
    this.tradeHistoryPage = data.page;
    if (detailModalHost.isOpenFor(MarketPanel.MODAL_OWNER)) {
      this.renderModal();
    }
  }

  clear(): void {
    this.marketUpdate = null;
    this.itemBook = null;
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

  private renderPane(): void {
    const listedCount = this.marketUpdate?.listedItems.length ?? 0;
    const orderCount = this.marketUpdate?.myOrders.length ?? 0;
    const storageCount = this.marketUpdate?.storage.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
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
    if (!this.selectedItemKey && this.marketUpdate?.listedItems.length) {
      this.selectedItemKey = this.marketUpdate.listedItems[0].itemKey;
    }
    this.syncPageSelection();
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

        body.querySelectorAll<HTMLElement>('[data-market-open-dialog]').forEach((button) => button.addEventListener('click', () => {
          const kind = button.dataset.marketOpenDialog as MarketTradeDialogKind | undefined;
          const selected = this.getSelectedListedItem(this.marketUpdate);
          if (!kind || !selected) {
            return;
          }
          const presetPrice = this.readDatasetInt(button.dataset.marketOpenDialogPrice);
          this.openTradeDialog(selected, kind, presetPrice);
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
          <div class="market-board-list-wrap">
            ${this.renderListToolbar(pagination.page, pagination.totalPages, listedItems.length)}
            <div class="market-board-list ${compactList ? 'market-board-list--compact' : ''}">${cards}</div>
          </div>
          <div class="market-book-panel">
            ${this.renderBookPanel(selectedItem, orderBook, update.currencyItemName)}
          </div>
        </div>
      </div>
    `;
  }

  private renderListedItem(entry: MarketListedItemView, activeItemKey: string): string {
    const ownedCount = this.findMatchingInventoryCount(entry.item);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    return `
      <button class="market-item-cell ${entry.itemKey === activeItemKey ? 'active' : ''}" data-market-select-item="${escapeHtmlAttr(entry.itemKey)}" type="button">
        <div class="market-item-cell-name" title="${escapeHtmlAttr(entry.item.name)}">
          <span class="market-item-cell-name-text">${escapeHtml(entry.item.name)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${entry.lowestSellPrice !== undefined ? formatDisplayInteger(entry.lowestSellPrice) : '--'}</span>
          <span>买 ${entry.highestBuyPrice !== undefined ? formatDisplayInteger(entry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

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
        <div class="market-book-column">
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
        <div class="market-book-column">
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
      <div class="market-book-level">
        <div class="market-book-level-main">
          <span class="market-book-level-price">${formatDisplayInteger(level.unitPrice)} ${escapeHtml(currencyName)}</span>
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
                  <span class="market-order-name">${escapeHtml(record.itemName)}</span>
                  <span class="market-order-side ${record.side === 'buy' ? 'buy' : 'sell'}">${record.side === 'buy' ? '购入' : '售出'}</span>
                </div>
                <div class="market-order-meta">数量 ${formatDisplayCountBadge(record.quantity)} · 单价 ${formatDisplayInteger(record.unitPrice)} ${escapeHtml(currencyName)}</div>
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
        <div class="market-order-meta">剩余 ${formatDisplayCountBadge(order.remainingQuantity)} · 单价 ${formatDisplayInteger(order.unitPrice)} ${escapeHtml(currencyName)}</div>
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
    const insufficientCurrency = isBuy && dialog.quantity * dialog.unitPrice > ownedCurrency;
    const title = isBuy ? '发起求购' : '发起挂售';
    const actionLabel = isBuy ? '确认求购' : '确认挂售';
    const disabled = Boolean(conflictOrder)
      || ((!isBuy && (matchedSlotIndex === null || matchedInventoryCount <= 0)) || insufficientCurrency);
    const quantityMax = this.getTradeDialogQuantityMax(entry, dialog.kind);
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
                  <strong>${formatDisplayInteger(dialog.unitPrice)}</strong>
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
                  min="1"
                  max="${quantityMax}"
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
              <strong>${formatDisplayInteger(dialog.quantity * dialog.unitPrice)} ${escapeHtml(currencyName)}</strong>
            </div>
          </div>
          ${conflictOrder
            ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(dialog.kind === 'buy' ? '你已在挂售这件物品，不能再求购。' : '你已在求购这件物品，不能再挂售。')}</div>`
            : ''}
          ${insufficientCurrency ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(currencyName)}不足，当前需要 ${formatDisplayInteger(dialog.quantity * dialog.unitPrice)}。</div>` : ''}
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
    const visibleItems = this.getVisibleListedItems(update);
    if (visibleItems.length === 0) {
      return null;
    }
    const pagination = this.getPaginationState(visibleItems);
    return pagination.items.find((item) => item.itemKey === this.selectedItemKey) ?? pagination.items[0] ?? null;
  }

  private renderCategoryTabs(update: S2C_MarketUpdate): string {
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

  private renderEquipmentTabs(update: S2C_MarketUpdate): string {
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

  private renderTechniqueTabs(update: S2C_MarketUpdate): string {
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

  private getVisibleListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[] {
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

  private requestItemBook(itemKey: string): void {
    this.itemBookLoading = true;
    this.callbacks?.onRequestItemBook(itemKey);
  }

  private requestTradeHistory(page: number): void {
    this.tradeHistoryLoading = true;
    this.tradeHistoryPage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
    this.callbacks?.onRequestTradeHistory(this.tradeHistoryPage);
  }

  private openTradeDialog(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null): void {
    this.tradeDialog = {
      kind,
      quantity: 1,
      unitPrice: this.getDefaultTradeDialogPrice(entry, kind, preferredPrice),
    };
    this.syncTradeDialogOverlay();
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
          quantity: this.normalizeTradeDialogQuantity(input.value, selected, this.tradeDialog.kind),
        };
      });

      input.addEventListener('change', () => {
        if (!this.tradeDialog) {
          return;
        }
        this.tradeDialog = {
          ...this.tradeDialog,
          quantity: this.normalizeTradeDialogQuantity(input.value, selected, this.tradeDialog.kind),
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
      const preset = this.readDatasetInt(button.dataset.marketPricePreset);
      this.tradeDialog = {
        ...this.tradeDialog,
        unitPrice: this.getNextTradeDialogPrice(this.tradeDialog.unitPrice, action, preset),
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
        : 1;
      this.tradeDialog = {
        ...this.tradeDialog,
        quantity: Math.max(1, quantity),
      };
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLElement>('[data-market-submit-dialog]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.marketSubmitDialog as MarketTradeDialogKind | undefined;
      if (!kind || !this.tradeDialog || this.tradeDialog.kind !== kind) {
        return;
      }
      const quantity = this.normalizeTradeDialogQuantity(this.tradeDialog.quantity, selected, kind);
      const unitPrice = this.normalizeTradeDialogPrice(this.tradeDialog.unitPrice, kind === 'buy' ? 'up' : 'down');
      if (kind === 'buy') {
        this.callbacks?.onCreateBuyOrder(selected.item.itemId, quantity, unitPrice);
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
  ): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    const max = this.getTradeDialogQuantityMax(entry, kind);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(max, Math.floor(parsed)));
  }

  private getTradeDialogQuantityMax(entry: MarketListedItemView, kind: MarketTradeDialogKind): number {
    if (kind === 'sell') {
      return Math.max(1, this.findMatchingInventoryCount(entry.item));
    }
    return MARKET_DIALOG_MAX_QUANTITY;
  }

  private getTradeDialogMaxButtonQuantity(
    entry: MarketListedItemView,
    currencyItemId: string,
    dialog: MarketTradeDialogState,
  ): number {
    if (dialog.kind === 'sell') {
      return this.findMatchingInventoryCount(entry.item);
    }
    return this.getAffordableBuyQuantity(dialog.unitPrice, currencyItemId);
  }

  private getAffordableBuyQuantity(unitPrice: number, currencyItemId: string): number {
    if (unitPrice <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(MARKET_DIALOG_MAX_QUANTITY, Math.floor(this.findInventoryItemCountByItemId(currencyItemId) / unitPrice)));
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
      const probe = Math.min(MARKET_DIALOG_MAX_PRICE, currentPrice + 1);
      return this.normalizeTradeDialogPrice(currentPrice + getMarketPriceStep(probe), 'up');
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
    if (value >= 1_000_000) {
      return '一百万';
    }
    if (value >= 10_000) {
      return '一万';
    }
    return formatDisplayInteger(value);
  }

  private readDatasetInt(value: string | undefined): number | null {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private findMatchingInventorySlot(item: ItemStack): number | null {
    const targetKey = createItemStackSignature({ ...item, count: 1 });
    const exactSlotIndex = this.inventory.items.findIndex((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey);
    if (exactSlotIndex >= 0) {
      return exactSlotIndex;
    }
    const fallbackSlotIndex = this.inventory.items.findIndex((entry) => entry.itemId === item.itemId);
    return fallbackSlotIndex >= 0 ? fallbackSlotIndex : null;
  }

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

  private findInventoryItemCountByItemId(itemId: string): number {
    return this.inventory.items
      .filter((entry) => entry.itemId === itemId)
      .reduce((sum, entry) => sum + entry.count, 0);
  }
}

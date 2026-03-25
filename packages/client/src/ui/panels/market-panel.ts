import {
  createItemStackSignature,
  Inventory,
  ITEM_TYPES,
  ItemStack,
  ItemType,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOwnOrderView,
  MarketStorage,
  PlayerState,
  S2C_MarketItemBook,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { preserveSelection } from '../selection-preserver';
import { MARKET_MODAL_TABS, MARKET_PANE_HINT, MarketModalTab } from '../../constants/ui/market';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getItemTypeLabel } from '../../domain-labels';

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
type MarketTradeDialogKind = 'buy' | 'sell';

const MARKET_PAGE_SIZE = 32;

export class MarketPanel {
  private static readonly MODAL_OWNER = 'market-panel';
  private readonly pane = document.getElementById('pane-market')!;
  private callbacks: MarketPanelCallbacks | null = null;
  private marketUpdate: S2C_MarketUpdate | null = null;
  private itemBook: MarketOrderBookView | null = null;
  private selectedItemKey: string | null = null;
  private modalTab: MarketModalTab = 'market';
  private activeCategory: MarketCategoryFilter = 'all';
  private currentPage = 1;
  private tradeHistoryPage = 1;
  private itemBookLoading = false;
  private tradeHistoryLoading = false;
  private tradeDialog: { kind: MarketTradeDialogKind } | null = null;
  private tradeHistory: S2C_MarketTradeHistory | null = null;
  private inventory: Inventory = { items: [], capacity: 0 };

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
    this.currentPage = 1;
    this.tradeHistoryPage = 1;
    this.itemBookLoading = false;
    this.tradeHistoryLoading = false;
    this.tradeDialog = null;
    this.tradeHistory = null;
    this.inventory = { items: [], capacity: 0 };
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
          if (!kind) {
            return;
          }
          this.tradeDialog = { kind };
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-close-dialog]').forEach((button) => button.addEventListener('click', () => {
          this.tradeDialog = null;
          this.renderModal();
        }));

        body.querySelectorAll<HTMLElement>('[data-market-submit-dialog]').forEach((button) => button.addEventListener('click', () => {
          const kind = button.dataset.marketSubmitDialog as MarketTradeDialogKind | undefined;
          const selected = this.getSelectedListedItem(this.marketUpdate);
          if (!kind || !selected) {
            return;
          }
          const quantity = this.readPositiveInt(body.querySelector<HTMLInputElement>('[data-market-dialog-input="quantity"]'));
          const unitPrice = this.readPositiveInt(body.querySelector<HTMLInputElement>('[data-market-dialog-input="price"]'));
          if (kind === 'buy') {
            this.callbacks?.onCreateBuyOrder(selected.item.itemId, quantity, unitPrice);
            this.tradeDialog = null;
            this.renderModal();
            return;
          }
          const slotIndex = this.findMatchingInventorySlot(selected.item);
          if (slotIndex === null) {
            return;
          }
          this.callbacks?.onCreateSellOrder(slotIndex, quantity, unitPrice);
          this.tradeDialog = null;
          this.renderModal();
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
    return `
      <div class="market-market-tab">
        <div class="market-category-tabs">${categoryTabs}</div>
        <div class="market-board">
          <div class="market-board-list-wrap">
            ${this.renderListToolbar(pagination.page, pagination.totalPages, listedItems.length)}
            <div class="market-board-list">${cards}</div>
          </div>
          <div class="market-book-panel">
            ${this.renderBookPanel(selectedItem, orderBook, update.currencyItemName)}
          </div>
        </div>
        ${this.renderTradeDialog(selectedItem, update.currencyItemName)}
      </div>
    `;
  }

  private renderListedItem(entry: MarketListedItemView, activeItemKey: string): string {
    const ownedCount = this.findMatchingInventoryCount(entry.item);
    const ownedText = ownedCount > 0 ? ` (${formatDisplayCountBadge(ownedCount)})` : '';
    return `
      <button class="market-item-cell ${entry.itemKey === activeItemKey ? 'active' : ''}" data-market-select-item="${escapeHtmlAttr(entry.itemKey)}" type="button">
        <div class="market-item-cell-name" title="${escapeHtmlAttr(entry.item.name)}${ownedText}">${escapeHtml(entry.item.name)}${ownedText}</div>
        <div class="market-item-cell-prices">
          <span>卖 ${entry.lowestSellPrice !== undefined ? formatDisplayInteger(entry.lowestSellPrice) : '--'}</span>
          <span>买 ${entry.highestBuyPrice !== undefined ? formatDisplayInteger(entry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  private renderBookPanel(entry: MarketListedItemView, book: MarketOrderBookView | null, currencyName: string): string {
    const matchedInventoryCount = this.findMatchingInventoryCount(entry.item);
    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title">${escapeHtml(entry.item.name)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(entry.item.type))} · ${escapeHtml(entry.item.desc)}</div>
        </div>
      </div>
      <div class="market-book-columns">
        <div class="market-book-column">
          <div class="market-book-column-head">
            <div class="market-book-column-title">出售</div>
            <button class="small-btn ghost" data-market-open-dialog="sell" type="button" ${matchedInventoryCount > 0 ? '' : 'disabled'}>挂售</button>
          </div>
          ${book
            ? this.renderPriceLevels(book.sells, currencyName, '当前还没有卖盘。')
            : this.renderBookLoading(this.itemBookLoading ? '卖盘同步中……' : '当前盘面已更新，请重新选择物品。')}
        </div>
        <div class="market-book-column">
          <div class="market-book-column-head">
            <div class="market-book-column-title">求购</div>
            <button class="small-btn ghost" data-market-open-dialog="buy" type="button">求购</button>
          </div>
          ${book ? this.renderPriceLevels(book.buys, currencyName, '当前还没有求购。') : this.renderBookLoading(this.itemBookLoading ? '买盘同步中……' : '当前还没有求购。')}
        </div>
      </div>
    `;
  }

  private renderPriceLevels(levels: MarketOrderBookView['sells'], currencyName: string, emptyText: string): string {
    if (levels.length === 0) {
      return `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return levels.map((level) => `
      <div class="market-book-level">
        <span class="market-book-level-price">${formatDisplayInteger(level.unitPrice)} ${escapeHtml(currencyName)}</span>
        <span class="market-book-level-qty">${formatDisplayCountBadge(level.quantity)}</span>
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

  private renderTradeDialog(entry: MarketListedItemView, currencyName: string): string {
    if (!this.tradeDialog) {
      return '';
    }
    const matchedInventoryCount = this.findMatchingInventoryCount(entry.item);
    const matchedSlotIndex = this.findMatchingInventorySlot(entry.item);
    const isBuy = this.tradeDialog.kind === 'buy';
    const title = isBuy ? '发起求购' : '发起挂售';
    const actionLabel = isBuy ? '确认求购' : '确认挂售';
    const suggestedPrice = isBuy
      ? (entry.lowestSellPrice ?? entry.highestBuyPrice ?? 1)
      : (entry.highestBuyPrice ?? entry.lowestSellPrice ?? 1);
    const hint = isBuy
      ? `会先按你输入的最高单价吃掉现有低于等于该价格的卖盘，剩余数量自动转成求购。`
      : `会先按你输入的最低单价撮合现有高于等于该价格的求购，剩余数量自动转成挂售。`;
    const disabled = !isBuy && (matchedSlotIndex === null || matchedInventoryCount <= 0);
    return `
      <div class="market-trade-dialog-backdrop" data-market-close-dialog></div>
      <div class="market-trade-dialog" role="dialog" aria-modal="true">
        <div class="market-trade-dialog-head">
          <div>
            <div class="panel-section-title">${title}</div>
            <div class="market-book-subtitle">${escapeHtml(entry.item.name)} · ${escapeHtml(currencyName)}</div>
          </div>
          <button class="small-btn ghost" data-market-close-dialog type="button">关闭</button>
        </div>
        <div class="market-trade-dialog-body">
          <div class="market-trade-dialog-hint">${hint}</div>
          ${!isBuy ? `<div class="market-action-hint">${matchedInventoryCount > 0 ? `你当前持有 ${formatDisplayCountBadge(matchedInventoryCount)}。` : '你当前没有这件物品，无法挂售。'}</div>` : ''}
          <div class="market-action-row">
            <label>数量<input class="gm-inline-input" data-market-dialog-input="quantity" type="number" min="1" max="${Math.max(1, matchedInventoryCount)}" value="1" /></label>
            <label>价格<input class="gm-inline-input" data-market-dialog-input="price" type="number" min="1" value="${suggestedPrice}" /></label>
          </div>
        </div>
        <div class="market-trade-dialog-actions">
          <button class="small-btn ghost" data-market-close-dialog type="button">取消</button>
          <button class="small-btn" data-market-submit-dialog="${this.tradeDialog.kind}" type="button" ${disabled ? 'disabled' : ''}>${actionLabel}</button>
        </div>
      </div>
    `;
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

  private getVisibleListedItems(update: S2C_MarketUpdate | null): MarketListedItemView[] {
    if (!update) {
      return [];
    }
    if (this.activeCategory === 'all') {
      return update.listedItems;
    }
    return update.listedItems.filter((item) => item.item.type === this.activeCategory);
  }

  private getPaginationState(items: MarketListedItemView[]): {
    page: number;
    totalPages: number;
    items: MarketListedItemView[];
  } {
    const totalPages = Math.max(1, Math.ceil(items.length / MARKET_PAGE_SIZE));
    const page = this.clampPage(this.currentPage, items.length);
    this.currentPage = page;
    const start = (page - 1) * MARKET_PAGE_SIZE;
    return {
      page,
      totalPages,
      items: items.slice(start, start + MARKET_PAGE_SIZE),
    };
  }

  private clampPage(page: number, totalItems: number): number {
    const totalPages = Math.max(1, Math.ceil(totalItems / MARKET_PAGE_SIZE));
    if (!Number.isFinite(page)) {
      return 1;
    }
    return Math.max(1, Math.min(totalPages, Math.floor(page)));
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

  private findMatchingInventorySlot(item: ItemStack): number | null {
    const targetKey = createItemStackSignature({ ...item, count: 1 });
    const slotIndex = this.inventory.items.findIndex((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey);
    return slotIndex >= 0 ? slotIndex : null;
  }

  private findMatchingInventoryCount(item: ItemStack): number {
    const targetKey = createItemStackSignature({ ...item, count: 1 });
    return this.inventory.items
      .filter((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey)
      .reduce((sum, entry) => sum + entry.count, 0);
  }

  private readPositiveInt(input: HTMLInputElement | null): number {
    const value = Number.parseInt(input?.value ?? '1', 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
}

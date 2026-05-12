import type { AuctionHouseTab, ItemStack, MarketListedItemView, S2C_AuctionListings, S2C_MarketUpdate } from '@mud/shared';
import { AUCTION_LISTING_FEE_BASE, AUCTION_LISTING_FEE_RATE, ITEM_TYPES, MARKET_PRICE_PRESET_VALUES } from '@mud/shared';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getItemTypeLabel } from '../../domain-labels';
import { resolvePreviewItem } from '../../content/local-templates';
import { patchElementHtml } from '../dom-patch';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { renderTradePriceStepControl, renderTradeQuantityControl } from '../trade-control-renderers';
import type { MarketPanelInternals, AuctionLotView, MarketCategoryFilter, MarketPriceAction } from './market-panel-types';

/** 把普通文本转成可安全插入 HTML 的内容。 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeHtmlAttr(value: unknown): string {
  return escapeHtml(value);
}

/** 拍卖行每页最多显示的拍品数量。 */
const AUCTION_PAGE_SIZE = 10;
const AUCTION_PRICE_PRESET_VALUES = MARKET_PRICE_PRESET_VALUES.filter((value) => value >= 1);
type AuctionConsignPriceField = 'start' | 'buyout';

/**
 * 拍卖行子视图：拍卖列表、竞拍和拍品行渲染。
 */
export class MarketAuctionView {
  constructor(private readonly panel: MarketPanelInternals) {}

  openAuctionModal(tab: AuctionHouseTab = this.panel.auctionTab): void {
    this.panel.auctionTab = tab;
    this.panel.auctionPage = this.panel.auctionListings?.tab === tab ? this.panel.auctionPage : 1;
    this.panel.requestAuctionListings(this.panel.auctionPage);
    this.syncAuctionSelection();
    const selectedAuctionLot = this.resolveAuctionLotByKey(this.panel.selectedAuctionItemKey, this.panel.marketUpdate, this.panel.auctionTab);
    if (selectedAuctionLot) {
      this.panel.selectedItemKey = selectedAuctionLot.itemKey;
      this.panel.requestItemBook(selectedAuctionLot.itemKey);
    }
    this.renderAuctionModal();
  }

  renderAuctionModal(): void {
    const p = this.panel;
    const marketUpdate = p.marketUpdate;
    this.syncAuctionSelection();
    const options = {
      ownerId: 'auction-house-panel',
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
        p.tradeDialog = null;
        p.tooltipNode = null;
        p.tooltip.hide(true);
        this.stopAuctionCountdownTicker();
        p.syncTradeDialogOverlay();
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        this.bindAuctionModalEvents(body, signal);
        p.bindMarketModalDelegatedEvents(body, signal);
        this.startAuctionCountdownTicker();
        this.patchAuctionCountdowns();
        p.syncTradeDialogOverlay();
      },
    } as const;
    if (detailModalHost.isOpenFor('auction-house-panel')) {
      detailModalHost.patch(options);
      return;
    }
    detailModalHost.open(options);
  }

  renderAuctionModalBody(update: S2C_MarketUpdate): string {
    const lots = this.getCurrentAuctionLots();
    return `
      <div class="auction-house-shell">
        <div class="auction-house-tabs" role="tablist" aria-label="拍卖行分栏">
          <button class="auction-house-tab ${this.panel.auctionTab === 'participate' ? 'active' : ''}" data-auction-tab="participate" type="button">${escapeHtml(t('auction.tab.participate', undefined))}</button>
          <button class="auction-house-tab ${this.panel.auctionTab === 'mine' ? 'active' : ''}" data-auction-tab="mine" type="button">${escapeHtml(t('auction.tab.mine', undefined))}</button>
        </div>
        ${this.renderAuctionSummaryCards(update)}
        ${this.panel.auctionTab === 'participate'
          ? this.renderAuctionParticipateTab(update, lots)
          : this.renderAuctionMineTab(update, lots)}
      </div>
    `;
  }

  renderAuctionSummaryCards(update: S2C_MarketUpdate): string {
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
          <strong>${this.panel.formatMarketUnitPrice(summary.totalCurrentPrice)}</strong>
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

  renderAuctionParticipateTab(update: S2C_MarketUpdate, lots: AuctionLotView[]): string {
    const pagination = this.getAuctionPageState(lots);
    const selected = this.resolveAuctionLotByKey(this.panel.selectedAuctionItemKey, update, 'participate') ?? lots[0] ?? null;
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

  renderAuctionMineTab(update: S2C_MarketUpdate, lots: AuctionLotView[]): string {
    const pagination = this.getAuctionPageState(lots);
    const selected = this.resolveAuctionLotByKey(this.panel.selectedAuctionItemKey, update, 'mine') ?? lots[0] ?? null;
    const consigningCount = this.panel.auctionListings?.summary.consigningLots ?? lots.filter((lot) => lot.status === 'consigning').length;
    const soldCount = this.panel.auctionListings?.summary.soldLots ?? lots.filter((lot) => lot.status === 'sold').length;
    const failedCount = this.panel.auctionListings?.summary.failedLots ?? lots.filter((lot) => lot.status === 'failed').length;
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

  renderAuctionFilterRail(): string {
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
          <input class="ui-search-input" data-auction-search id="auction-search-input" type="search" value="${escapeHtmlAttr(this.panel.auctionSearchQuery)}" placeholder="${escapeHtmlAttr(t('auction.filter.placeholder', undefined))}" />
        </label>
        <div class="auction-filter-group">
          <div class="market-list-toolbar-meta">分类</div>
          <div class="auction-filter-buttons">
            ${categories.map((category) => `
              <button class="auction-filter-button ${this.panel.auctionCategory === category.id ? 'active' : ''}" data-auction-category="${category.id}" type="button">
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

  renderAuctionLotRow(lot: AuctionLotView, activeLotId: string, mine = false): string {
    const buyoutText = lot.buyoutPrice === null ? '--' : this.panel.formatMarketUnitPrice(lot.buyoutPrice);
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
        <span>${this.panel.formatMarketUnitPrice(lot.currentPrice)}</span>
        <span>${mine ? formatDisplayCountBadge(lot.remainingQuantity ?? 0) : buyoutText}</span>
        ${mine ? '' : `<span class="auction-time ${this.getAuctionTimeClass(remainingSeconds)}" data-auction-countdown="${escapeHtmlAttr(lot.id)}">${escapeHtml(this.formatAuctionRemaining(remainingSeconds))}</span>`}
      </button>
    `;
  }

  renderAuctionDetailPanel(lot: AuctionLotView | null, update: S2C_MarketUpdate, tab: AuctionHouseTab): string {
    if (!lot) {
      return `<div class="empty-hint">${escapeHtml(t('auction.empty.select-lot', undefined))}</div>`;
    }
    const listedEntry = this.panel.findListingVariantByKey(lot.itemKey, update) ?? this.panel.buildMarketListingFromAuctionLot(lot);
    const buyConflict = this.panel.findConflictingOwnOrder(lot.itemKey, 'buy');
    const canBid = tab === 'participate' && Boolean(listedEntry) && !buyConflict;
    const canBuyout = canBid && lot.buyoutPrice !== null;
    const ownedCurrency = this.panel.findInventoryItemCountByItemId(update.currencyItemId);
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
          <strong>${this.panel.formatMarketUnitPrice(lot.currentPrice)}</strong>
          <small>${formatDisplayInteger(lot.bidCount)} 次出价</small>
        </div>
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.trade.buyout-confirm.price', undefined))}</span>
          <strong>${lot.buyoutPrice === null ? '--' : this.panel.formatMarketUnitPrice(lot.buyoutPrice)}</strong>
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

  renderAuctionBidHistory(lot: AuctionLotView, currencyName: string): string {
    const rows = Array.isArray(lot.bids) ? lot.bids.slice(0, 6) : [];
    return `
      <div class="auction-bid-history ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
        <div class="market-book-column-title">${escapeHtml(t('auction.bid-history.title', undefined))}</div>
        ${rows.length > 0
            ? rows.map((level, index) => `
              <div class="auction-bid-row">
                <span>${escapeHtml(level.bidderLabel || t('auction.bidder.anonymous', { index: formatDisplayInteger(index + 1) }))}</span>
                <strong>${this.panel.formatMarketUnitPrice(level.unitPrice)} ${escapeHtml(currencyName)}</strong>
                <small>${escapeHtml(this.formatAuctionBidTime(level.createdAtMs))}</small>
              </div>
            `).join('')
            : `<div class="empty-hint">${escapeHtml(t('auction.bid-history.empty', undefined))}</div>`}
      </div>
    `;
  }

  renderAuctionConsignModal(): void {
    const update = this.panel.marketUpdate;
    const options = {
      ownerId: 'auction-consign-panel',
      size: 'wide',
      variantClass: 'detail-modal--market detail-modal--auction-consign',
      title: t('market.auction.consign.title', undefined),
      subtitle: t('market.auction.consign.subtitle', undefined),
      renderBody: (body: HTMLElement) => {
        patchElementHtml(
          body,
          update
            ? `<div class="auction-consign-modal-shell">${this.renderAuctionConsignPanel(update)}</div>`
            : `<div class="empty-hint">${escapeHtml(t('auction.loading', undefined))}</div>`,
        );
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        this.bindAuctionConsignModalEvents(body, signal);
        this.panel.bindItemTooltipEvents(body, signal);
      },
    } as const;
    if (detailModalHost.isOpenFor('auction-consign-panel')) {
      detailModalHost.patch(options);
      return;
    }
    detailModalHost.open(options);
  }

  renderAuctionConsignPanel(update: S2C_MarketUpdate): string {
    const state = this.panel.auctionConsignPanel;
    const items = this.getFilteredAuctionConsignItems(update);
    const allItems = this.getAuctionConsignItems(update);
    const hasFilteredOutSelection = state.slotIndex !== null && !items.some((entry) => entry.slotIndex === state.slotIndex);
    const selectedItem = state.slotIndex === null ? null : this.panel.inventory.items[state.slotIndex] ?? null;
    const quantityMax = Math.max(1, selectedItem?.count ?? 1);
    const quantity = Math.max(1, Math.min(quantityMax, Math.floor(Number(state.quantity) || 1)));
    const totalPrice = this.normalizeAuctionConsignTotalPrice(state.totalPrice, 'up');
    const buyoutPrice = this.normalizeAuctionConsignBuyoutPrice(state.buyoutPrice);
    const price = selectedItem ? this.resolveAuctionConsignUnitPrice(totalPrice) : { unitPrice: null, actualTotal: null };
    const listingFee = price.actualTotal === null ? null : this.getAuctionListingFee(price.actualTotal);
    const ownedCurrency = this.panel.findInventoryItemCountByItemId(update.currencyItemId);
    const insufficientFee = listingFee !== null && listingFee > ownedCurrency;
    const disabled = !selectedItem || price.unitPrice === null || insufficientFee;
    return `
      <div class="auction-consign-panel" data-auction-consign-panel>
        <div class="auction-consign-title-row">
          <strong>${escapeHtml(t('market.auction.consign.title', undefined))}</strong>
          <span data-auction-consign-count>${escapeHtml(this.renderAuctionConsignCount(update))}</span>
        </div>
        <label class="auction-consign-search">
          <span>${escapeHtml(t('market.auction.consign.search', undefined))}</span>
          <input class="ui-search-input" data-auction-consign-search type="search" value="${escapeHtmlAttr(state.query)}" placeholder="${escapeHtmlAttr(t('market.auction.consign.search-placeholder', undefined))}" autocomplete="off" />
        </label>
        <div class="auction-consign-items ui-scroll-panel" data-auction-consign-items>
          ${this.renderAuctionConsignItems(update)}
        </div>
        <div class="auction-consign-fields">
          <div class="auction-consign-fields-main">
            <div class="market-trade-dialog-field" data-auction-consign-quantity-field>
              <span>${escapeHtml(t('market.auction.consign.package-count', undefined))}</span>
              <div data-auction-consign-quantity-control>
                ${this.renderAuctionConsignQuantityControl(selectedItem, quantity, quantityMax)}
              </div>
            </div>
            ${this.renderAuctionConsignPriceField('start', t('market.auction.consign.start-price', undefined), totalPrice, update.currencyItemName, !selectedItem)}
          </div>
          <div class="auction-consign-fields-buyout">
            ${this.renderAuctionConsignPriceField('buyout', t('market.auction.consign.buyout-price', undefined), buyoutPrice, update.currencyItemName, !selectedItem)}
          </div>
        </div>
        <div class="auction-consign-preview" data-auction-consign-preview>
          ${this.renderAuctionConsignPreview(selectedItem, totalPrice, buyoutPrice, price, update.currencyItemName, ownedCurrency)}
        </div>
        ${hasFilteredOutSelection && selectedItem ? `<div class="market-action-hint">${escapeHtml(t('market.auction.consign.filtered-selected', undefined))}</div>` : ''}
        <button class="small-btn" data-auction-consign-submit type="button" ${disabled ? 'disabled' : ''}>${escapeHtml(t('market.auction.consign.submit', undefined))}</button>
      </div>
    `;
  }

  renderAuctionConsignQuantityControl(item: ItemStack | null, quantity: number, quantityMax: number): string {
    if (!item) {
      return `
        <div class="auction-consign-package-count">
          <span>${escapeHtml(t('market.auction.consign.no-selection', undefined))}</span>
          <strong>--</strong>
        </div>
      `;
    }
    return renderTradeQuantityControl({
      value: quantity,
      min: 1,
      step: 1,
      max: quantityMax,
      inputAttrs: { 'data-auction-consign-quantity': true },
      leftButtons: [
        { label: '-', attrs: { 'data-auction-consign-quantity-action': 'decrease' }, disabled: quantity <= 1 },
      ],
      rightButtons: [
        { label: '+', attrs: { 'data-auction-consign-quantity-action': 'increase' }, disabled: quantity >= quantityMax },
        { label: t('market.trade.action.max', undefined), attrs: { 'data-auction-consign-quantity-action': 'max' }, disabled: quantity >= quantityMax },
      ],
    });
  }

  renderAuctionConsignPriceField(field: AuctionConsignPriceField, label: string, price: number, currencyName: string, disabled: boolean): string {
    const decreasePrice = this.getNextAuctionConsignPrice(field, price, 'decrease');
    const halfPrice = this.getNextAuctionConsignPrice(field, price, 'half');
    const increasePrice = this.getNextAuctionConsignPrice(field, price, 'increase');
    const doublePrice = this.getNextAuctionConsignPrice(field, price, 'double');
    return `
      <label class="market-trade-dialog-field auction-consign-price-field">
        <span>${escapeHtml(label)}</span>
        <div class="market-price-preset-row auction-consign-price-presets">
          ${(field === 'buyout' ? [0, ...AUCTION_PRICE_PRESET_VALUES] : AUCTION_PRICE_PRESET_VALUES).map((preset) => `
            <button
              class="small-btn ghost ${preset === price ? 'active' : ''}"
              data-auction-consign-price-field="${field}"
              data-auction-consign-price-action="preset"
              data-auction-consign-price-preset="${preset}"
              type="button"
              ${disabled ? 'disabled' : ''}
            >${escapeHtml(preset <= 0 ? '0' : this.panel.formatPricePresetLabel(preset))}</button>
          `).join('')}
        </div>
        ${renderTradePriceStepControl({
          value: price <= 0 ? '0' : this.panel.formatMarketUnitPrice(price),
          currencyName,
          displayAttrs: { [`data-auction-consign-${field}-price-display`]: true },
          leftButtons: [
            { label: '÷2', attrs: { 'data-auction-consign-price-field': field, 'data-auction-consign-price-action': 'half' }, disabled: disabled || halfPrice >= price },
            { label: '-', attrs: { 'data-auction-consign-price-field': field, 'data-auction-consign-price-action': 'decrease' }, disabled: disabled || decreasePrice >= price },
          ],
          rightButtons: [
            { label: '+', attrs: { 'data-auction-consign-price-field': field, 'data-auction-consign-price-action': 'increase' }, disabled: disabled || increasePrice <= price },
            { label: 'x2', attrs: { 'data-auction-consign-price-field': field, 'data-auction-consign-price-action': 'double' }, disabled: disabled || doublePrice <= price },
          ],
        })}
      </label>
    `;
  }

  renderAuctionConsignItem(slotIndex: number, item: ItemStack, active: boolean): string {
    const enhanceLevel = this.panel.getMarketEnhanceLevel(item);
    const suffix = item.type === 'equipment' && enhanceLevel > 0 ? ` +${enhanceLevel}` : '';
    const itemName = `${this.panel.getMarketDisplayName(item)}${suffix}`;
    return `
      <button class="auction-consign-item ${active ? 'active' : ''}" data-auction-consign-slot="${slotIndex}" data-market-item-tooltip="auction-consign-slot:${slotIndex}" type="button">
        <span title="${escapeHtmlAttr(itemName)}">${escapeHtml(itemName)}</span>
        <strong>${formatDisplayCountBadge(item.count)}</strong>
      </button>
    `;
  }

  renderAuctionConsignItems(update: S2C_MarketUpdate): string {
    const items = this.getFilteredAuctionConsignItems(update);
    if (items.length === 0) {
      const key = this.panel.auctionConsignPanel.query.trim() ? 'market.auction.consign.search-empty' : 'market.auction.consign.empty';
      return `<div class="empty-hint">${escapeHtml(t(key, undefined))}</div>`;
    }
    return items.map((entry) => this.renderAuctionConsignItem(entry.slotIndex, entry.item, this.panel.auctionConsignPanel.slotIndex === entry.slotIndex)).join('');
  }

  renderAuctionConsignCount(update: S2C_MarketUpdate): string {
    return t('market.auction.consign.visible-count', {
      visible: formatDisplayInteger(this.getFilteredAuctionConsignItems(update).length),
      total: formatDisplayInteger(this.getAuctionConsignItems(update).length),
    });
  }

  renderAuctionConsignPreview(
    item: ItemStack | null,
    totalPrice: number,
    buyoutPrice: number,
    price: { unitPrice: number | null; actualTotal: number | null },
    currencyName: string,
    ownedCurrency: number,
  ): string {
    if (!item) {
      return `<div class="market-action-hint">${escapeHtml(t('market.auction.consign.select-hint', undefined))}</div>`;
    }
    if (price.unitPrice === null || price.actualTotal === null) {
      return `<div class="market-action-hint market-action-hint--error">${escapeHtml(t('market.auction.consign.invalid-total', undefined))}</div>`;
    }
    const quantity = Math.max(1, Math.min(item.count, Math.floor(Number(this.panel.auctionConsignPanel.quantity) || 1)));
    const resolvedBuyoutPrice = buyoutPrice >= price.actualTotal ? buyoutPrice : null;
    const listingFee = this.getAuctionListingFee(price.actualTotal);
    const insufficientFee = listingFee > ownedCurrency;
    return `
      <div class="market-trade-dialog-total">
        <span>${escapeHtml(t('market.auction.consign.package', { count: formatDisplayInteger(quantity) }))}</span>
        <strong>${formatDisplayInteger(price.actualTotal)} ${escapeHtml(currencyName)}</strong>
      </div>
      <div class="market-trade-dialog-total">
        <span>${escapeHtml(t('market.auction.consign.buyout-price', undefined))}</span>
        <strong>${resolvedBuyoutPrice === null ? escapeHtml(t('market.auction.consign.no-buyout', undefined)) : `${formatDisplayInteger(resolvedBuyoutPrice)} ${escapeHtml(currencyName)}`}</strong>
      </div>
      <div class="market-trade-dialog-total ${insufficientFee ? 'error' : ''}">
        <span>${escapeHtml(t('market.auction.consign.listing-fee', undefined))}</span>
        <strong>${formatDisplayInteger(listingFee)} ${escapeHtml(currencyName)}</strong>
      </div>
      <div class="market-action-hint">${escapeHtml(t('market.auction.consign.total-hint', {
        totalPrice: formatDisplayInteger(price.actualTotal),
        buyoutPrice: resolvedBuyoutPrice === null ? t('market.auction.consign.no-buyout', undefined) : formatDisplayInteger(resolvedBuyoutPrice),
        listingFee: formatDisplayInteger(listingFee),
        currencyName,
      }))}</div>
      ${insufficientFee ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(t('market.auction.consign.insufficient-fee', {
        currencyName,
        listingFee: formatDisplayInteger(listingFee),
      }))}</div>` : ''}
    `;
  }

  bindAuctionModalEvents(body: HTMLElement, signal: AbortSignal): void {
    const p = this.panel;
    body.querySelectorAll<HTMLElement>('[data-auction-tab]').forEach((button) => button.addEventListener('click', () => {
      const tab = button.dataset.auctionTab as AuctionHouseTab | undefined;
      if (!tab || tab === p.auctionTab) return;
      p.auctionTab = tab;
      p.selectedAuctionItemKey = null;
      p.auctionPage = 1;
      p.tradeDialog = null;
      p.requestAuctionListings(1);
      this.renderAuctionModal();
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-category]').forEach((button) => button.addEventListener('click', () => {
      const category = button.dataset.auctionCategory as MarketCategoryFilter | undefined;
      if (!category || category === p.auctionCategory) return;
      p.auctionCategory = category;
      p.selectedAuctionItemKey = null;
      p.auctionPage = 1;
      p.tradeDialog = null;
      p.requestAuctionListings(1);
      this.renderAuctionModal();
    }, { signal }));

    body.querySelector<HTMLInputElement>('[data-auction-search]')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      p.auctionSearchQuery = target.value;
      p.selectedAuctionItemKey = null;
      p.auctionPage = 1;
      p.requestAuctionListings(1);
    }, { signal });

    body.querySelectorAll<HTMLElement>('[data-auction-page]').forEach((button) => button.addEventListener('click', () => {
      const nextPage = Number.parseInt(button.dataset.auctionPage ?? '1', 10);
      if (!Number.isFinite(nextPage) || nextPage === p.auctionPage) return;
      p.auctionPage = Math.max(1, Math.floor(nextPage));
      p.selectedAuctionItemKey = null;
      p.tradeDialog = null;
      p.requestAuctionListings(p.auctionPage);
      this.renderAuctionModal();
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-select-item]').forEach((button) => button.addEventListener('click', () => {
      const lotId = button.dataset.auctionSelectItem;
      if (!lotId || lotId === p.selectedAuctionItemKey) return;
      const lot = this.resolveAuctionLotByKey(lotId, p.marketUpdate, p.auctionTab);
      if (!lot) return;
      p.selectedAuctionItemKey = lot.id;
      p.selectedItemKey = lot.itemKey;
      p.itemBook = null;
      p.tradeDialog = null;
      p.requestItemBook(lot.itemKey);
      this.patchAuctionActiveSelection();
      this.patchAuctionDetailPanel();
      p.syncTradeDialogOverlay();
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.auctionAction;
      const itemKey = button.dataset.auctionActionItem;
      const lot = this.resolveAuctionLotByKey(itemKey, p.marketUpdate, 'participate');
      const entry = lot ? (p.findListingVariantByKey(lot.itemKey, p.marketUpdate) ?? p.buildMarketListingFromAuctionLot(lot)) : null;
      if (!action || !lot || !entry) return;
      p.selectedAuctionItemKey = entry.itemKey;
      p.selectedItemKey = entry.itemKey;
      if (action === 'buyout') {
        // Delegate buyout confirm to trade dialog sub-view via panel
        (p as any).tradeDialogView.openAuctionBuyoutConfirm(entry, lot);
        return;
      }
      (p as any).tradeDialogView.openAuctionBidDialog(entry, lot);
    }, { signal }));

    body.querySelectorAll<HTMLElement>('[data-auction-cancel]').forEach((button) => button.addEventListener('click', () => {
      const orderId = button.dataset.auctionCancel;
      if (!orderId) return;
      p.callbacks?.onCancelOrder(orderId);
    }, { signal }));

    body.querySelector<HTMLElement>('[data-auction-refresh]')?.addEventListener('click', () => {
      p.requestAuctionListings(p.auctionPage);
    }, { signal });
  }

  bindAuctionConsignModalEvents(body: HTMLElement, signal: AbortSignal): void {
    const p = this.panel;
    body.querySelector<HTMLInputElement>('[data-auction-consign-search]')?.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      p.auctionConsignPanel = {
        ...p.auctionConsignPanel,
        query: input.value,
      };
      this.patchAuctionConsignItems();
    }, { signal });

    body.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches('[data-auction-consign-quantity]')) return;
      const state = p.auctionConsignPanel;
      const item = state.slotIndex === null ? null : p.inventory.items[state.slotIndex] ?? null;
      if (!item) return;
      const max = Math.max(1, item.count);
      p.auctionConsignPanel = {
        ...state,
        quantity: Math.max(1, Math.min(max, Math.floor(Number(input.value) || 1))),
      };
      this.patchAuctionConsignPreview();
    }, { signal });

    body.addEventListener('click', (event) => {
      const target = event.target;
      const quantityActionButton = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-auction-consign-quantity-action]') : null;
      if (quantityActionButton && body.contains(quantityActionButton)) {
        const state = p.auctionConsignPanel;
        const item = state.slotIndex === null ? null : p.inventory.items[state.slotIndex] ?? null;
        if (!item) return;
        const action = quantityActionButton.dataset.auctionConsignQuantityAction;
        const max = Math.max(1, item.count);
        const current = Math.max(1, Math.min(max, Math.floor(Number(state.quantity) || 1)));
        const nextQuantity = action === 'max'
          ? max
          : action === 'increase'
            ? Math.min(max, current + 1)
            : Math.max(1, current - 1);
        p.auctionConsignPanel = {
          ...state,
          quantity: nextQuantity,
        };
        this.patchAuctionConsignQuantityControl();
        this.patchAuctionConsignPreview();
        return;
      }
      const priceActionButton = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-auction-consign-price-action]') : null;
      if (priceActionButton && body.contains(priceActionButton)) {
        const action = priceActionButton.dataset.auctionConsignPriceAction as MarketPriceAction | undefined;
        const field = priceActionButton.dataset.auctionConsignPriceField as AuctionConsignPriceField | undefined;
        if (!action) return;
        const preset = this.panel.readDatasetNumber(priceActionButton.dataset.auctionConsignPricePreset);
        const nextPrice = this.getNextAuctionConsignPrice(field === 'buyout' ? 'buyout' : 'start', field === 'buyout' ? p.auctionConsignPanel.buyoutPrice : p.auctionConsignPanel.totalPrice, action, preset);
        p.auctionConsignPanel = {
          ...p.auctionConsignPanel,
          ...(field === 'buyout' ? { buyoutPrice: nextPrice } : { totalPrice: nextPrice }),
        };
        this.patchAuctionConsignPreview();
        return;
      }
      const button = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-auction-consign-slot]') : null;
      if (!button || !body.contains(button)) return;
      const slotIndex = Number.parseInt(button.dataset.auctionConsignSlot ?? '', 10);
      const item = Number.isFinite(slotIndex) ? p.inventory.items[slotIndex] : null;
      if (!item) return;
      p.auctionConsignPanel = {
        open: true,
        slotIndex,
        quantity: Math.max(1, Math.min(item.count, Math.floor(Number(p.auctionConsignPanel.quantity) || item.count))),
        totalPrice: this.normalizeAuctionConsignTotalPrice(p.auctionConsignPanel.totalPrice, 'up'),
        buyoutPrice: this.normalizeAuctionConsignBuyoutPrice(p.auctionConsignPanel.buyoutPrice),
        query: p.auctionConsignPanel.query,
      };
      this.patchAuctionConsignSelectedItem();
      this.patchAuctionConsignPreview();
    }, { signal });
    body.querySelector<HTMLElement>('[data-auction-consign-submit]')?.addEventListener('click', () => {
      const state = p.auctionConsignPanel;
      if (state.slotIndex === null) return;
      const item = p.inventory.items[state.slotIndex] ?? null;
      if (!item) return;
      const quantity = Math.max(1, Math.min(item.count, Math.floor(Number(state.quantity) || 1)));
      const totalPrice = this.normalizeAuctionConsignTotalPrice(state.totalPrice, 'up');
      const price = this.resolveAuctionConsignUnitPrice(totalPrice);
      if (price.unitPrice === null) {
        this.patchAuctionConsignPreview();
        return;
      }
      const buyoutPrice = this.normalizeAuctionConsignBuyoutPrice(state.buyoutPrice);
      const resolvedBuyoutPrice = buyoutPrice >= price.unitPrice ? buyoutPrice : 0;
      p.callbacks?.onCreateAuctionSellOrder(state.slotIndex, quantity, price.unitPrice, resolvedBuyoutPrice);
      p.auctionConsignPanel = { open: false, slotIndex: null, quantity: 1, totalPrice: 1, buyoutPrice: 0, query: '' };
      p.requestAuctionListings(1);
      detailModalHost.close('auction-consign-panel');
    }, { signal });

  }

  patchAuctionConsignPreview(): void {
    const body = this.panel.getOpenAuctionConsignModalBody();
    const update = this.panel.marketUpdate;
    if (!body || !update) return;
    const preview = body.querySelector<HTMLElement>('[data-auction-consign-preview]');
    const submit = body.querySelector<HTMLButtonElement>('[data-auction-consign-submit]');
    const state = this.panel.auctionConsignPanel;
    const item = state.slotIndex === null ? null : this.panel.inventory.items[state.slotIndex] ?? null;
    const quantityMax = Math.max(1, item?.count ?? 1);
    const quantity = Math.max(1, Math.min(quantityMax, Math.floor(Number(state.quantity) || 1)));
    const totalPrice = this.normalizeAuctionConsignTotalPrice(state.totalPrice, 'up');
    const buyoutPrice = this.normalizeAuctionConsignBuyoutPrice(state.buyoutPrice);
    const price = item ? this.resolveAuctionConsignUnitPrice(totalPrice) : { unitPrice: null, actualTotal: null };
    this.panel.auctionConsignPanel = {
      ...state,
      quantity,
      totalPrice,
      buyoutPrice,
    };
    if (preview) {
      patchElementHtml(preview, this.renderAuctionConsignPreview(item, totalPrice, buyoutPrice, price, update.currencyItemName, this.panel.findInventoryItemCountByItemId(update.currencyItemId)));
    }
    if (submit) {
      const listingFee = price.actualTotal === null ? null : this.getAuctionListingFee(price.actualTotal);
      const ownedCurrency = this.panel.findInventoryItemCountByItemId(update.currencyItemId);
      submit.disabled = !item || price.unitPrice === null || (listingFee !== null && listingFee > ownedCurrency);
    }
    this.patchAuctionConsignPriceControl();
  }

  patchAuctionConsignModalState(): void {
    this.patchAuctionConsignItems();
    this.patchAuctionConsignSelectedItem();
    this.patchAuctionConsignPreview();
  }

  patchAuctionConsignItems(): void {
    const body = this.panel.getOpenAuctionConsignModalBody();
    const update = this.panel.marketUpdate;
    if (!body || !update) return;
    const list = body.querySelector<HTMLElement>('[data-auction-consign-items]');
    if (!list) return;
    patchElementHtml(list, this.renderAuctionConsignItems(update));
    const count = body.querySelector<HTMLElement>('[data-auction-consign-count]');
    if (count) {
      count.textContent = this.renderAuctionConsignCount(update);
    }
    this.panel.bindItemTooltipEvents(list);
    this.patchAuctionConsignSelectedItem();
  }

  patchAuctionConsignSelectedItem(): void {
    const body = this.panel.getOpenAuctionConsignModalBody();
    if (!body) return;
    const state = this.panel.auctionConsignPanel;
    const item = state.slotIndex === null ? null : this.panel.inventory.items[state.slotIndex] ?? null;
    body.querySelectorAll<HTMLElement>('[data-auction-consign-slot]').forEach((button) => {
      button.classList.toggle('active', button.dataset.auctionConsignSlot === String(state.slotIndex));
    });
    const quantityMax = Math.max(1, item?.count ?? 1);
    const quantity = Math.max(1, Math.min(quantityMax, Math.floor(Number(state.quantity) || 1)));
    this.panel.auctionConsignPanel = {
      ...state,
      quantity,
    };
    this.patchAuctionConsignQuantityControl();
    this.patchAuctionConsignPriceControl();
  }

  patchAuctionConsignQuantityControl(): void {
    const body = this.panel.getOpenAuctionConsignModalBody();
    if (!body) return;
    const state = this.panel.auctionConsignPanel;
    const item = state.slotIndex === null ? null : this.panel.inventory.items[state.slotIndex] ?? null;
    const quantityMax = Math.max(1, item?.count ?? 1);
    const quantity = Math.max(1, Math.min(quantityMax, Math.floor(Number(state.quantity) || 1)));
    const control = body.querySelector<HTMLElement>('[data-auction-consign-quantity-control]');
    const input = body.querySelector<HTMLInputElement>('[data-auction-consign-quantity]');
    if (control) {
      patchElementHtml(control, this.renderAuctionConsignQuantityControl(item, quantity, quantityMax));
      return;
    }
    if (input && document.activeElement !== input) {
      input.value = String(quantity);
    }
  }

  patchAuctionConsignPriceControl(): void {
    const body = this.panel.getOpenAuctionConsignModalBody();
    const update = this.panel.marketUpdate;
    if (!body || !update) return;
    const state = this.panel.auctionConsignPanel;
    const item = state.slotIndex === null ? null : this.panel.inventory.items[state.slotIndex] ?? null;
    const totalPrice = this.normalizeAuctionConsignTotalPrice(state.totalPrice, 'up');
    const buyoutPrice = this.normalizeAuctionConsignBuyoutPrice(state.buyoutPrice);
    this.panel.auctionConsignPanel = {
      ...state,
      totalPrice,
      buyoutPrice,
    };
    this.patchAuctionConsignPriceDisplay(body, update.currencyItemName, 'start', totalPrice);
    this.patchAuctionConsignPriceDisplay(body, update.currencyItemName, 'buyout', buyoutPrice);
    body.querySelectorAll<HTMLButtonElement>('[data-auction-consign-price-action]').forEach((button) => {
      const action = button.dataset.auctionConsignPriceAction as MarketPriceAction | undefined;
      const field = button.dataset.auctionConsignPriceField as AuctionConsignPriceField | undefined;
      const currentPrice = field === 'buyout' ? buyoutPrice : totalPrice;
      const nextPrice = action ? this.getNextAuctionConsignPrice(field === 'buyout' ? 'buyout' : 'start', currentPrice, action, this.panel.readDatasetNumber(button.dataset.auctionConsignPricePreset)) : currentPrice;
      button.disabled = !item
        || (action === 'decrease' && nextPrice >= currentPrice)
        || (action === 'half' && nextPrice >= currentPrice)
        || ((action === 'increase' || action === 'double') && nextPrice <= currentPrice);
      if (action === 'preset') {
        button.classList.toggle('active', this.panel.readDatasetNumber(button.dataset.auctionConsignPricePreset) === currentPrice);
      }
    });
  }

  patchAuctionConsignPriceDisplay(body: HTMLElement, currencyName: string, field: AuctionConsignPriceField, price: number): void {
    const display = body.querySelector<HTMLElement>(`[data-auction-consign-${field}-price-display]`);
    if (!display) return;
    patchElementHtml(display, `
      <strong>${escapeHtml(price <= 0 ? '0' : this.panel.formatMarketUnitPrice(price))}</strong>
      <span>${escapeHtml(currencyName)}</span>
    `);
  }

  getAuctionConsignItems(update: S2C_MarketUpdate | null): Array<{ slotIndex: number; item: ItemStack }> {
    const currencyItemId = update?.currencyItemId ?? '';
    return this.panel.inventory.items
      .map((item, slotIndex) => ({ slotIndex, item }))
      .filter((entry) => entry.item.count > 0 && entry.item.itemId !== currencyItemId);
  }

  getFilteredAuctionConsignItems(update: S2C_MarketUpdate | null): Array<{ slotIndex: number; item: ItemStack }> {
    const query = this.panel.auctionConsignPanel.query.trim().toLocaleLowerCase();
    const items = this.getAuctionConsignItems(update);
    if (!query) {
      return items;
    }
    return items.filter((entry) => {
      const displayName = this.panel.getMarketDisplayName(entry.item).toLocaleLowerCase();
      const itemId = entry.item.itemId.toLocaleLowerCase();
      return displayName.includes(query) || itemId.includes(query);
    });
  }

  resolveAuctionConsignUnitPrice(totalPrice: number): { unitPrice: number | null; actualTotal: number | null } {
    const normalizedTotal = this.normalizeAuctionConsignTotalPrice(totalPrice, 'up');
    if (!Number.isSafeInteger(normalizedTotal) || normalizedTotal <= 0) {
      return { unitPrice: null, actualTotal: null };
    }
    return { unitPrice: normalizedTotal, actualTotal: normalizedTotal };
  }

  normalizeAuctionConsignTotalPrice(value: number, direction: 'up' | 'down'): number {
    return this.panel.normalizeTradeDialogPrice(Math.max(1, Math.floor(Number(value) || 1)), direction);
  }

  normalizeAuctionConsignBuyoutPrice(value: number): number {
    const numeric = Math.floor(Number(value) || 0);
    if (numeric <= 0) return 0;
    return this.panel.normalizeTradeDialogPrice(numeric, 'up');
  }

  getAuctionListingFee(totalPrice: number): number {
    const normalizedTotal = Math.max(1, Math.floor(Number(totalPrice) || 1));
    return AUCTION_LISTING_FEE_BASE + Math.ceil(normalizedTotal * AUCTION_LISTING_FEE_RATE);
  }

  getNextAuctionConsignTotalPrice(currentPrice: number, action: MarketPriceAction): number {
    return this.getNextAuctionConsignPrice('start', currentPrice, action);
  }

  getNextAuctionConsignPrice(field: AuctionConsignPriceField, currentPrice: number, action: MarketPriceAction, preset: number | null = null): number {
    if (field === 'buyout') {
      const current = this.normalizeAuctionConsignBuyoutPrice(currentPrice);
      if (action === 'preset') {
        return this.normalizeAuctionConsignBuyoutPrice(preset ?? 0);
      }
      if (action === 'decrease' && current <= 1) return 0;
      const seed = current <= 0 && (action === 'increase' || action === 'double') ? 1 : current;
      const next = this.panel.getNextTradeDialogPrice(seed, action, null, 1);
      return this.normalizeAuctionConsignBuyoutPrice(next);
    }
    return this.panel.getNextTradeDialogPrice(
      this.normalizeAuctionConsignTotalPrice(currentPrice, action === 'decrease' || action === 'half' ? 'down' : 'up'),
      action,
      preset,
      1,
    );
  }

  patchAuctionActiveSelection(): void {
    const body = this.panel.getOpenAuctionModalBody();
    if (!body) return;
    body.querySelectorAll<HTMLElement>('[data-auction-select-item]').forEach((button) => {
      button.classList.toggle('active', button.dataset.auctionSelectItem === this.panel.selectedAuctionItemKey);
    });
  }

  patchAuctionDetailPanel(): void {
    const body = this.panel.getOpenAuctionModalBody();
    const update = this.panel.marketUpdate;
    if (!body || !update) return;
    const detail = body.querySelector<HTMLElement>('[data-auction-detail-panel]');
    if (!detail) return;
    const lot = this.resolveAuctionLotByKey(this.panel.selectedAuctionItemKey, update, this.panel.auctionTab);
    patchElementHtml(detail, this.renderAuctionDetailPanel(lot, update, this.panel.auctionTab));
  }

  syncAuctionSelection(): void {
    const p = this.panel;
    if (!p.marketUpdate) {
      p.selectedAuctionItemKey = null;
      return;
    }
    const lots = this.getCurrentAuctionLots();
    if (lots.length === 0) {
      p.selectedAuctionItemKey = null;
      p.selectedItemKey = null;
      return;
    }
    const selected = lots.some((lot) => lot.id === p.selectedAuctionItemKey)
      ? p.selectedAuctionItemKey
      : lots[0].id;
    if (selected !== p.selectedAuctionItemKey) {
      p.selectedAuctionItemKey = selected;
      p.itemBook = null;
    }
    const selectedLot = lots.find((lot) => lot.id === p.selectedAuctionItemKey) ?? null;
    p.selectedItemKey = selectedLot?.itemKey ?? null;
  }

  getAuctionPageState(items: ArrayLike<unknown>): { page: number; totalPages: number; totalItems: number } {
    const p = this.panel;
    const pageSize = p.auctionListings?.pageSize ?? AUCTION_PAGE_SIZE;
    const totalItems = p.auctionListings?.total ?? items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
    const page = p.auctionListings?.page ?? Math.max(1, Math.min(totalPages, Math.floor(Number.isFinite(p.auctionPage) ? p.auctionPage : 1)));
    p.auctionPage = page;
    return { page, totalPages, totalItems };
  }

  getCurrentAuctionLots(): AuctionLotView[] {
    const p = this.panel;
    if (!p.auctionListings || p.auctionListings.tab !== p.auctionTab) return [];
    return p.auctionListings.items.map((entry) => this.inflateAuctionLotEntry(entry));
  }

  resolveAuctionLotByKey(
    lotId: string | null | undefined,
    _update: S2C_MarketUpdate | null,
    tab: AuctionHouseTab = this.panel.auctionTab,
  ): AuctionLotView | null {
    const p = this.panel;
    if (!lotId || !p.auctionListings || p.auctionListings.tab !== tab) return null;
    const lots = p.auctionListings.items.map((entry) => this.inflateAuctionLotEntry(entry));
    return lots.find((lot) => lot.id === lotId || lot.itemKey === lotId) ?? null;
  }

  inflateAuctionLotEntry(entry: import('@mud/shared').AuctionLotPageEntry): AuctionLotView {
    const item = entry.item ?? resolvePreviewItem({
      itemId: entry.itemId,
      count: 1,
      name: '',
      desc: '',
      type: entry.itemType,
      equipSlot: entry.itemType === 'equipment' ? entry.itemSubType as import('@mud/shared').EquipSlot | undefined : undefined,
      enhanceLevel: entry.enhanceLevel,
    });
    return {
      id: entry.id,
      itemKey: entry.itemKey,
      item,
      itemName: this.panel.getMarketDisplayName(item),
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

  getAuctionRemainingSeconds(lot: AuctionLotView, now = Date.now()): number {
    const endAtMs = lot.startAtMs + lot.durationSeconds * 1000;
    return Math.max(0, Math.ceil((endAtMs - now) / 1000));
  }

  getAuctionTimeClass(remainingSeconds: number): string {
    if (remainingSeconds <= 0) return 'ended';
    if (remainingSeconds <= 1800) return 'urgent';
    return '';
  }

  startAuctionCountdownTicker(): void {
    if (this.panel.auctionCountdownTimer !== null || typeof window === 'undefined') return;
    this.panel.auctionCountdownTimer = window.setInterval(() => {
      this.patchAuctionCountdowns();
    }, 1000);
  }

  stopAuctionCountdownTicker(): void {
    if (this.panel.auctionCountdownTimer === null || typeof window === 'undefined') return;
    window.clearInterval(this.panel.auctionCountdownTimer);
    this.panel.auctionCountdownTimer = null;
  }

  patchAuctionCountdowns(): void {
    const body = this.panel.getOpenAuctionModalBody();
    const update = this.panel.marketUpdate;
    if (!body || !update) {
      this.stopAuctionCountdownTicker();
      return;
    }
    const now = Date.now();
    body.querySelectorAll<HTMLElement>('[data-auction-countdown]').forEach((node) => {
      const lot = this.resolveAuctionLotByKey(node.dataset.auctionCountdown, update, this.panel.auctionTab);
      if (!lot) return;
      const remainingSeconds = this.getAuctionRemainingSeconds(lot, now);
      node.textContent = this.formatAuctionRemaining(remainingSeconds);
      node.classList.toggle('urgent', remainingSeconds > 0 && remainingSeconds <= 1800);
      node.classList.toggle('ended', remainingSeconds <= 0);
    });
  }

  getAuctionQualityLabel(item: import('@mud/shared').ItemStack): string {
    const grade = typeof item.grade === 'string' && item.grade.trim() ? item.grade.trim() : '';
    if (grade) return grade;
    const level = Number(item.level);
    if (Number.isFinite(level) && level > 0) return `${formatDisplayInteger(Math.floor(level))}阶`;
    return '凡品';
  }

  getAuctionItemInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.slice(0, 1) : '拍';
  }

  formatAuctionRemaining(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
    return `${pad(minutes)}:${pad(rest)}`;
  }

  formatAuctionBidTime(createdAtMs: number): string {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Math.max(0, Number(createdAtMs) || 0)) / 1000));
    if (elapsedSeconds < 60) return '刚刚';
    if (elapsedSeconds < 3600) return `${formatDisplayInteger(Math.floor(elapsedSeconds / 60))}分钟前`;
    return `${formatDisplayInteger(Math.floor(elapsedSeconds / 3600))}小时前`;
  }

  getAuctionSummary(update: S2C_MarketUpdate): S2C_AuctionListings['summary'] {
    return this.panel.auctionListings?.summary ?? {
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

  getAuctionCategoryCount(category: MarketCategoryFilter, fallback: number): number {
    const value = this.panel.auctionListings?.counts?.categoryCounts?.[category];
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.floor(numeric));
  }
}

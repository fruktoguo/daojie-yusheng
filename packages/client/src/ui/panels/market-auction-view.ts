import type { AuctionHouseTab, MarketListedItemView, S2C_AuctionListings, S2C_MarketUpdate } from '@mud/shared';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getItemTypeLabel } from '../../domain-labels';
import { resolvePreviewItem } from '../../content/local-templates';
import { patchElementHtml } from '../dom-patch';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import type { MarketPanelInternals, AuctionLotView, MarketCategoryFilter } from './market-panel-types';
import { ITEM_TYPES } from '@mud/shared';

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

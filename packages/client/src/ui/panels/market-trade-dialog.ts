import type { MarketListedItemView, MarketOrderBookView, S2C_MarketUpdate } from '@mud/shared';
import {
  MARKET_MAX_UNIT_PRICE,
  MARKET_PRICE_PRESET_VALUES,
  getMarketPriceStep,
} from '@mud/shared';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { patchElementHtml } from '../dom-patch';
import { detailModalHost } from '../detail-modal-host';
import { confirmModalHost } from '../confirm-modal-host';
import { t } from '../i18n';
import { renderTradePriceStepControl, renderTradeQuantityControl } from '../trade-control-renderers';
import type {
  MarketPanelInternals,
  MarketTradeDialogKind,
  MarketTradeDialogSource,
  MarketTradeDialogState,
  MarketTradeDialogViewState,
  MarketPriceAction,
  AuctionLotView,
} from './market-panel-types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const MARKET_DIALOG_MIN_PRICE = MARKET_PRICE_PRESET_VALUES[0];
const MARKET_DIALOG_MAX_PRICE = MARKET_MAX_UNIT_PRICE;

/**
 * 市场交易弹窗子视图：买入/卖出对话框。
 */
export class MarketTradeDialog {
  constructor(private readonly panel: MarketPanelInternals) {}

  openTradeDialog(entry: MarketListedItemView, kind: MarketTradeDialogKind, preferredPrice?: number | null, confirmPurchase = false): void {
    const unitPrice = this.panel.getDefaultTradeDialogPrice(entry, kind, preferredPrice);
    this.panel.tradeDialog = {
      kind,
      source: 'market',
      quantity: this.panel.normalizeTradeDialogQuantity(1, entry, kind, unitPrice),
      unitPrice,
      confirmPurchase: kind === 'buy' && confirmPurchase,
    };
    this.panel.syncTradeDialogOverlay();
  }

  openAuctionBidDialog(entry: MarketListedItemView, lot: AuctionLotView): void {
    const minUnitPrice = this.panel.getAuctionMinimumBidPrice(lot);
    this.panel.tradeDialog = {
      kind: 'buy',
      source: 'auction-bid',
      quantity: 1,
      unitPrice: minUnitPrice,
      minUnitPrice,
    };
    this.panel.syncTradeDialogOverlay();
  }

  openAuctionBuyoutConfirm(entry: MarketListedItemView, lot: AuctionLotView): void {
    if (lot.buyoutPrice === null) return;
    const p = this.panel;
    const unitPrice = p.normalizeTradeDialogPrice(lot.buyoutPrice, 'up');
    const quantity = 1;
    const totalCost = p.getMarketTradeTotalCost(quantity, unitPrice);
    const currencyItemName = p.marketUpdate?.currencyItemName ?? '';
    const ownedCurrency = p.findInventoryItemCountByItemId(p.marketUpdate?.currencyItemId ?? '');
    const insufficientCurrency = totalCost !== null && totalCost > ownedCurrency;
    p.buyConfirmState = { itemKey: entry.itemKey, quantity, unitPrice };
    confirmModalHost.open({
      ownerId: 'market-buy-confirm',
      title: t('auction.action.buyout', undefined),
      subtitle: p.getMarketDisplayName(entry.item),
      bodyHtml: this.renderAuctionBuyoutConfirmBody(lot, currencyItemName, quantity, unitPrice, totalCost, insufficientCurrency),
      confirmLabel: t('auction.action.buyout', undefined),
      confirmDisabled: insufficientCurrency || totalCost === null,
      onConfirm: () => {
        p.buyConfirmState = null;
        p.callbacks?.onBuyoutAuctionLot(lot.id, lot.itemKey);
        p.tradeDialog = null;
        p.syncTradeDialogOverlay();
      },
      onClose: () => {
        p.buyConfirmState = null;
      },
    });
  }

  getTradeDialogViewState(
    entry: MarketListedItemView,
    currencyItemId: string,
    currencyName: string,
  ): MarketTradeDialogViewState | null {
    const p = this.panel;
    if (!p.tradeDialog) return null;
    const rawDialog = p.tradeDialog;
    const source: MarketTradeDialogSource = rawDialog.source ?? 'market';
    const isAuctionBid = source === 'auction-bid';
    const minUnitPrice = p.getTradeDialogMinUnitPrice(rawDialog);
    const unitPrice = isAuctionBid
      ? p.normalizeTradeDialogPrice(Math.max(rawDialog.unitPrice, minUnitPrice), 'up')
      : rawDialog.unitPrice;
    const dialog: MarketTradeDialogState = { ...rawDialog, unitPrice };
    const matchedInventoryCount = isAuctionBid ? 0 : p.findMatchingInventoryCount(entry.item);
    const matchedSlotIndex = isAuctionBid ? null : p.findMatchingInventorySlot(entry.item);
    const isBuy = dialog.kind === 'buy';
    const conflictOrder = isAuctionBid ? null : p.findConflictingOwnOrder(entry.itemKey, dialog.kind);
    const ownedCurrency = p.findInventoryItemCountByItemId(currencyItemId);
    const quantityStep = isAuctionBid ? 1 : p.getTradeDialogQuantityStep(dialog.unitPrice);
    const dialogQuantity = isAuctionBid ? 1 : dialog.quantity;
    const quantityMax = isAuctionBid ? 1 : p.getTradeDialogQuantityMax(entry, dialog.kind, dialog.unitPrice);
    const inputMax = Math.max(quantityStep, quantityMax > 0 ? quantityMax : quantityStep);
    dialog.quantity = isAuctionBid ? 1 : p.normalizeTradeDialogQuantity(dialogQuantity, entry, dialog.kind, dialog.unitPrice);
    const totalCost = p.getMarketTradeTotalCost(dialog.quantity, dialog.unitPrice);
    const insufficientCurrency = isBuy && totalCost !== null && totalCost > ownedCurrency;
    const insufficientStepQuantity = !isAuctionBid && quantityMax <= 0;
    const disabled = Boolean(conflictOrder)
      || ((!isBuy && (matchedSlotIndex === null || matchedInventoryCount <= 0)) || insufficientCurrency || insufficientStepQuantity || totalCost === null);
    const hints: string[] = [];
    if (isAuctionBid) {
      hints.push(`<div class="market-action-hint">${escapeHtml(t('market.trade.hint.min-bid', { unitPrice: p.formatMarketUnitPrice(minUnitPrice), currencyName }))}</div>`);
    }
    if (!isAuctionBid && quantityStep > 1) {
      hints.push(`<div class="market-action-hint">${escapeHtml(t('market.trade.hint.quantity-step', { quantityStep: formatDisplayInteger(quantityStep), currencyName }))}</div>`);
    }
    if (conflictOrder) {
      hints.push(`<div class="market-action-hint market-action-hint--error">${escapeHtml(dialog.kind === 'buy' ? t('market.trade.hint.conflict-buy', undefined) : t('market.trade.hint.conflict-sell', undefined))}</div>`);
    }
    if (insufficientStepQuantity) {
      hints.push(`<div class="market-action-hint market-action-hint--error">${escapeHtml(isBuy ? t('market.trade.hint.insufficient-step.buy', { currencyName, quantityStep: formatDisplayInteger(quantityStep) }) : t('market.trade.hint.insufficient-step.sell', { quantityStep: formatDisplayInteger(quantityStep) }))}</div>`);
    }
    if (insufficientCurrency && totalCost !== null) {
      hints.push(`<div class="market-action-hint market-action-hint--error">${escapeHtml(t('market.trade.hint.insufficient-currency', { currencyName, totalCost: formatDisplayInteger(totalCost) }))}</div>`);
    }
    const nextDecreasePrice = p.getNextTradeDialogPrice(dialog.unitPrice, 'decrease', null, minUnitPrice);
    const nextHalfPrice = p.getNextTradeDialogPrice(dialog.unitPrice, 'half', null, minUnitPrice);
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
      maxButtonDisabled: p.getTradeDialogMaxButtonQuantity(entry, currencyItemId, dialog) <= 0,
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

  renderTradeDialog(entry: MarketListedItemView, currencyItemId: string, currencyName: string): string {
    const p = this.panel;
    const state = this.getTradeDialogViewState(entry, currencyItemId, currencyName);
    if (!state) return '';
    const dialog = state.dialog;
    return `
      <div class="market-trade-modal-shell">
        <div class="market-trade-modal-backdrop" data-market-close-dialog></div>
        <div class="market-trade-dialog market-trade-dialog--${dialog.kind} ${state.source === 'auction-bid' ? 'market-trade-dialog--auction-bid' : ''} ui-surface-pane ui-surface-pane--stack" role="dialog" aria-modal="true">
        <div class="market-trade-dialog-head">
          <div class="market-trade-dialog-title ui-title-block">
            <div class="panel-section-title">${state.title}</div>
            <div class="market-trade-dialog-item market-trade-dialog-item--interactive ui-title-block-subtitle" data-market-item-tooltip="selected">${escapeHtml(p.getMarketDisplayName(entry.item))}</div>
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
                    >${escapeHtml(p.formatPricePresetLabel(preset))}</button>
                  `).join('')}
                </div>
              </div>
            `
            : ''}
          <div class="market-trade-dialog-section">
            <div class="market-trade-dialog-field">
              <span>${escapeHtml(t('market.trade.field.unit-price', undefined))}</span>
              ${renderTradePriceStepControl({
                value: p.formatMarketUnitPrice(dialog.unitPrice),
                currencyName,
                displayAttrs: { 'data-market-dialog-price-display': true },
                leftButtons: [
                  { label: '÷2', attrs: { 'data-market-price-action': 'half' }, disabled: state.priceActionDisabled.half },
                  { label: '-', attrs: { 'data-market-price-action': 'decrease' }, disabled: state.priceActionDisabled.decrease },
                ],
                rightButtons: [
                  { label: '+', attrs: { 'data-market-price-action': 'increase' }, disabled: state.priceActionDisabled.increase },
                  { label: 'x2', attrs: { 'data-market-price-action': 'double' }, disabled: state.priceActionDisabled.double },
                ],
              })}
            </div>
          </div>
          <div class="market-trade-dialog-section">
            ${state.showQuantityControls
              ? `
                <div class="market-trade-dialog-field">
                  <span>${escapeHtml(t('market.trade.field.quantity', undefined))}</span>
                  ${renderTradeQuantityControl({
                    value: dialog.quantity,
                    min: state.quantityStep,
                    step: state.quantityStep,
                    max: state.inputMax,
                    inputAttrs: { 'data-market-dialog-quantity': true },
                    leftButtons: [{ label: '1', attrs: { 'data-market-quantity-action': 'one' } }],
                    rightButtons: [{ label: t('market.trade.action.max', undefined), attrs: { 'data-market-quantity-action': 'max' }, disabled: state.maxButtonDisabled }],
                  })}
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

  syncTradeDialogOverlay(): void {
    const p = this.panel;
    const root = this.getTradeDialogOverlayRoot();
    const update = p.marketUpdate;
    const selected = p.getSelectedListedItem(update);
    const marketModalOpen = p.modalTab === 'market' && detailModalHost.isOpenFor('market-panel');
    const auctionModalOpen = detailModalHost.isOpenFor('auction-house-panel');
    if (!p.tradeDialog || (!marketModalOpen && !auctionModalOpen) || !update || !selected) {
      patchElementHtml(root, '');
      root.classList.add('hidden');
      delete root.dataset.marketDialogItemKey;
      delete root.dataset.marketDialogKind;
      delete root.dataset.marketDialogSource;
      p.tooltipNode = null;
      p.tooltip.hide(true);
      return;
    }
    root.classList.remove('hidden');
    if (this.patchTradeDialogOverlay(root, selected, update)) return;
    patchElementHtml(root, this.renderTradeDialog(selected, update.currencyItemId, update.currencyItemName));
    root.dataset.marketDialogItemKey = selected.itemKey;
    root.dataset.marketDialogKind = p.tradeDialog.kind;
    root.dataset.marketDialogSource = p.tradeDialog.source ?? 'market';
    this.bindTradeDialogOverlayEvents(root, selected, update);
    p.bindItemTooltipEvents(root);
  }

  patchTradeDialogOverlay(root: HTMLElement, selected: MarketListedItemView, update: S2C_MarketUpdate): boolean {
    const p = this.panel;
    const state = this.getTradeDialogViewState(selected, update.currencyItemId, update.currencyItemName);
    if (
      !state
      || root.dataset.marketDialogItemKey !== selected.itemKey
      || root.dataset.marketDialogKind !== state.dialog.kind
      || root.dataset.marketDialogSource !== state.source
    ) return false;
    const dialogNode = root.querySelector<HTMLElement>('.market-trade-dialog');
    const priceDisplay = root.querySelector<HTMLElement>('[data-market-dialog-price-display]');
    const quantityInput = root.querySelector<HTMLInputElement>('[data-market-dialog-quantity]');
    const maxButton = root.querySelector<HTMLButtonElement>('[data-market-quantity-action="max"]');
    const totalNode = root.querySelector<HTMLElement>('[data-market-dialog-total]');
    const totalValue = totalNode?.querySelector<HTMLElement>('strong') ?? null;
    const totalLabel = totalNode?.querySelector<HTMLElement>('span') ?? null;
    const hintsNode = root.querySelector<HTMLElement>('[data-market-dialog-hints]');
    const submitButton = root.querySelector<HTMLButtonElement>('[data-market-submit-dialog]');
    if (!dialogNode || !priceDisplay || !totalNode || !totalValue || !totalLabel || !hintsNode || !submitButton
      || (state.showQuantityControls && (!quantityInput || !maxButton))) return false;

    dialogNode.classList.toggle('market-trade-dialog--buy', state.dialog.kind === 'buy');
    dialogNode.classList.toggle('market-trade-dialog--sell', state.dialog.kind === 'sell');
    dialogNode.classList.toggle('market-trade-dialog--auction-bid', state.source === 'auction-bid');
    patchElementHtml(priceDisplay, `
      <strong>${escapeHtml(p.formatMarketUnitPrice(state.dialog.unitPrice))}</strong>
      <span>${escapeHtml(update.currencyItemName)}</span>
    `);
    root.querySelectorAll<HTMLButtonElement>('[data-market-price-preset]').forEach((button) => {
      const preset = p.readDatasetNumber(button.dataset.marketPricePreset);
      button.classList.toggle('active', preset === state.dialog.unitPrice);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-market-price-action]').forEach((button) => {
      const action = button.dataset.marketPriceAction as MarketPriceAction | undefined;
      if (!action) return;
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

  bindTradeDialogOverlayEvents(root: HTMLElement, selected: MarketListedItemView, update: S2C_MarketUpdate): void {
    const p = this.panel;
    root.querySelectorAll<HTMLElement>('[data-market-close-dialog]').forEach((button) => button.addEventListener('click', () => {
      p.tradeDialog = null;
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLInputElement>('[data-market-dialog-quantity]').forEach((input) => {
      input.addEventListener('input', () => {
        if (!p.tradeDialog) return;
        p.tradeDialog = { ...p.tradeDialog, quantity: p.normalizeTradeDialogQuantity(input.value, selected, p.tradeDialog.kind, p.tradeDialog.unitPrice) };
      });
      input.addEventListener('change', () => {
        if (!p.tradeDialog) return;
        p.tradeDialog = { ...p.tradeDialog, quantity: p.normalizeTradeDialogQuantity(input.value, selected, p.tradeDialog.kind, p.tradeDialog.unitPrice) };
        this.syncTradeDialogOverlay();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-market-price-action]').forEach((button) => button.addEventListener('click', () => {
      if (!p.tradeDialog) return;
      const action = button.dataset.marketPriceAction as MarketPriceAction | undefined;
      if (!action) return;
      const preset = p.readDatasetNumber(button.dataset.marketPricePreset);
      const nextUnitPrice = p.getNextTradeDialogPrice(p.tradeDialog.unitPrice, action, preset, p.getTradeDialogMinUnitPrice(p.tradeDialog));
      const quantitySeed = p.tradeDialog.source === 'auction-bid' ? 1 : p.tradeDialog.quantity;
      p.tradeDialog = { ...p.tradeDialog, unitPrice: nextUnitPrice, quantity: p.normalizeTradeDialogQuantity(quantitySeed, selected, p.tradeDialog.kind, nextUnitPrice) };
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLElement>('[data-market-quantity-action]').forEach((button) => button.addEventListener('click', () => {
      if (!p.tradeDialog) return;
      const action = button.dataset.marketQuantityAction;
      const quantity = action === 'max'
        ? p.getTradeDialogMaxButtonQuantity(selected, update.currencyItemId, p.tradeDialog)
        : p.getTradeDialogQuantityStep(p.tradeDialog.unitPrice);
      p.tradeDialog = { ...p.tradeDialog, quantity: p.normalizeTradeDialogQuantity(quantity, selected, p.tradeDialog.kind, p.tradeDialog.unitPrice) };
      this.syncTradeDialogOverlay();
    }));

    root.querySelectorAll<HTMLElement>('[data-market-submit-dialog]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.marketSubmitDialog as MarketTradeDialogKind | undefined;
      if (!kind || !p.tradeDialog || p.tradeDialog.kind !== kind) return;
      const minUnitPrice = p.getTradeDialogMinUnitPrice(p.tradeDialog);
      const unitPrice = p.normalizeTradeDialogPrice(Math.max(p.tradeDialog.unitPrice, minUnitPrice), kind === 'buy' ? 'up' : 'down');
      const quantitySeed = p.tradeDialog.source === 'auction-bid' ? 1 : p.tradeDialog.quantity;
      const quantity = p.normalizeTradeDialogQuantity(quantitySeed, selected, kind, unitPrice);
      if (kind === 'buy') {
        if (p.tradeDialog.source === 'auction-bid') {
          const auctionView = (p as any).auctionView;
          const lot = auctionView.resolveAuctionLotByKey(p.selectedAuctionItemKey ?? selected.itemKey, update, 'participate');
          if (!lot) return;
          p.callbacks?.onPlaceAuctionBid(lot.id, lot.itemKey, unitPrice);
          p.tradeDialog = null;
          this.syncTradeDialogOverlay();
          return;
        }
        if (p.tradeDialog.confirmPurchase) {
          this.openBuyConfirm(selected, quantity, unitPrice);
          return;
        }
        p.callbacks?.onCreateBuyOrder(selected.itemKey, quantity, unitPrice);
        p.tradeDialog = null;
        this.syncTradeDialogOverlay();
        return;
      }
      const slotIndex = p.findMatchingInventorySlot(selected.item);
      if (slotIndex === null) return;
      p.callbacks?.onCreateSellOrder(slotIndex, quantity, unitPrice);
      p.tradeDialog = null;
      this.syncTradeDialogOverlay();
    }));
  }

  openBuyConfirm(entry: MarketListedItemView, quantity: number, unitPrice: number): void {
    const p = this.panel;
    const itemName = p.getMarketDisplayName(entry.item);
    p.buyConfirmState = { itemKey: entry.itemKey, quantity, unitPrice };
    confirmModalHost.open({
      ownerId: 'market-buy-confirm',
      title: t('auction.action.buy', undefined),
      subtitle: itemName,
      bodyHtml: this.renderBuyConfirmBody(entry, p.marketUpdate?.currencyItemName ?? '', quantity, unitPrice),
      confirmLabel: t('auction.action.buy', undefined),
      onConfirm: () => {
        const latest = p.buyConfirmState;
        const latestEntry = latest ? p.resolveMarketTooltipEntry(latest.itemKey) : null;
        p.buyConfirmState = null;
        if (!latest || !latestEntry) return;
        p.callbacks?.onCreateBuyOrder(latestEntry.itemKey, latest.quantity, latest.unitPrice);
        p.tradeDialog = null;
        this.syncTradeDialogOverlay();
      },
      onClose: () => { p.buyConfirmState = null; },
    });
  }

  renderBuyConfirmBody(entry: MarketListedItemView, currencyName: string, quantity: number, unitPrice: number): string {
    const p = this.panel;
    const estimate = this.estimateImmediateBuy(entry, quantity, unitPrice);
    const maxReservedCost = p.getMarketTradeTotalCost(quantity, unitPrice);
    const summary = estimate.immediateQuantity > 0
      ? estimate.pendingQuantity > 0
        ? t('market.trade.buy-confirm.summary.split', { immediateQuantity: formatDisplayInteger(estimate.immediateQuantity), pendingQuantity: formatDisplayInteger(estimate.pendingQuantity) })
        : t('market.trade.buy-confirm.summary.direct', { immediateQuantity: formatDisplayInteger(estimate.immediateQuantity) })
      : t('market.trade.buy-confirm.summary.pending', undefined);
    return `
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>${escapeHtml(t('market.trade.buy-confirm.quantity', undefined))}</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(quantity)}</strong>
            <span>${escapeHtml(t('market.trade.buy-confirm.unit-price', { unitPrice: p.formatMarketUnitPrice(unitPrice), currencyName }))}</span>
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

  renderAuctionBuyoutConfirmBody(
    lot: AuctionLotView,
    currencyName: string,
    quantity: number,
    unitPrice: number,
    totalCost: number | null,
    insufficientCurrency: boolean,
  ): string {
    const p = this.panel;
    return `
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>一口价</span>
          <div class="market-price-display">
            <strong>${p.formatMarketUnitPrice(unitPrice)}</strong>
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

  estimateImmediateBuy(entry: MarketListedItemView, quantity: number, unitPrice: number): { immediateQuantity: number; pendingQuantity: number } {
    const book = this.panel.itemBook;
    if (!book || book.itemKey !== entry.itemKey) return { immediateQuantity: 0, pendingQuantity: quantity };
    let remaining = quantity;
    let immediateQuantity = 0;
    for (const level of book.sells) {
      if (remaining <= 0 || level.unitPrice > unitPrice) break;
      const matched = Math.min(remaining, level.quantity);
      if (matched <= 0) continue;
      immediateQuantity += matched;
      remaining -= matched;
    }
    return { immediateQuantity, pendingQuantity: Math.max(0, remaining) };
  }

  getTradeDialogOverlayRoot(): HTMLElement {
    const TRADE_MODAL_ID = 'market-trade-modal-root';
    let root = document.getElementById(TRADE_MODAL_ID);
    if (root) {
      if (root.parentElement !== document.body) document.body.appendChild(root);
      return root;
    }
    root = document.createElement('div');
    root.id = TRADE_MODAL_ID;
    root.className = 'market-trade-modal-layer hidden';
    document.body.appendChild(root);
    return root;
  }
}

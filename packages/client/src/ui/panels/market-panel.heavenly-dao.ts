/**
 * market-panel.heavenly-dao.ts
 *
 * 从 market-panel.ts 拆出的天道商店域实现：商品列表渲染、详情面板、购买交互和
 * 资产签名局部刷新。所有函数以 MarketPanel 实例为第一参数（self），由主类方法
 * 以一行委托壳调用，不改变任何 DOM id/class、事件绑定或面板行为。
 */
import type { Inventory, ItemStack, PlayerState } from '@mud/shared';
import {
  HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID,
  HEAVENLY_DAO_SHOP_ETERNAL_DISCOUNT_PERCENT,
  HEAVENLY_DAO_SHOP_ITEMS,
  calculateHeavenlyDaoShopDiscountedPrice,
} from '@mud/shared';
import { getLocalItemTemplate } from '../../content/local-templates';
import { resolveClientItemBaseName } from '../../content/item-display-name';
import { describeItemEffectDetails } from '../equipment-tooltip';
import { detailModalHost } from '../detail-modal-host';
import { getPlayerOwnedItemCount } from '../../utils/player-wallet';
import { formatDisplayCountBadge, formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { getItemTypeLabel } from '../../domain-labels';
import { renderTradeQuantityControl } from '../trade-control-renderers';
import type { MarketPanel } from './market-panel';

/** 天道商店独立弹窗的归属标识。 */
const HEAVENLY_DAO_SHOP_MODAL_OWNER = 'heavenly-dao-shop-panel';
/** 天道商店客户端输入上限；服务端仍按固定表和权威上限最终校验。 */
const HEAVENLY_DAO_SHOP_MAX_QUANTITY = 9_999;

/** 把普通文本转成可安全插入 HTML 的内容。 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value: unknown): string {
  return escapeHtml(value);
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

export function getHeavenlyDaoShopCurrencyNameImpl(self: MarketPanel): string {
  return getLocalItemTemplate(HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID)?.name ?? '功德';
}

export function getHeavenlyDaoShopCurrencyOwnedImpl(self: MarketPanel): number {
  return getPlayerOwnedItemCount(self.player, self.inventory, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID);
}

export function getHeavenlyDaoShopDiscountPercentImpl(self: MarketPanel): number {
  const discountPercent = self.marketUpdate?.heavenlyDaoShopDiscountPercent ?? 0;
  if (!Number.isFinite(Number(discountPercent))) {
    return 0;
  }
  return Math.max(0, Math.min(HEAVENLY_DAO_SHOP_ETERNAL_DISCOUNT_PERCENT, Math.trunc(Number(discountPercent))));
}

export function getHeavenlyDaoShopUnitPriceImpl(self: MarketPanel, basePrice: number): number {
  return calculateHeavenlyDaoShopDiscountedPrice(basePrice, getHeavenlyDaoShopDiscountPercentImpl(self));
}

export function getHeavenlyDaoShopDiscountLabelImpl(self: MarketPanel): string {
  const discountPercent = getHeavenlyDaoShopDiscountPercentImpl(self);
  if (discountPercent <= 0) {
    return '';
  }
  const rate = (100 - discountPercent) / 10;
  return Number.isInteger(rate) ? `${rate}折` : `${formatDisplayNumber(rate)}折`;
}

export function captureHeavenlyDaoShopAssetSignatureImpl(
  self: MarketPanel,
  player: PlayerState | null,
  inventory: Inventory,
): boolean {
  const nextSignature = buildHeavenlyDaoShopAssetSignatureImpl(self, player, inventory);
  if (nextSignature === self.heavenlyDaoShopAssetSignature) {
    return false;
  }
  self.heavenlyDaoShopAssetSignature = nextSignature;
  return true;
}

export function buildHeavenlyDaoShopAssetSignatureImpl(
  self: MarketPanel,
  player: PlayerState | null,
  inventory: Inventory,
): string {
  const trackedItemIds = new Set<string>([HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID]);
  for (const entry of HEAVENLY_DAO_SHOP_ITEMS) {
    trackedItemIds.add(entry.itemId);
  }
  const parts: string[] = [];
  for (const itemId of trackedItemIds) {
    parts.push(`${itemId}:${getPlayerOwnedItemCount(player, inventory, itemId)}`);
  }
  parts.push(`discount:${getHeavenlyDaoShopDiscountPercentImpl(self)}`);
  return parts.join('|');
}

export function getHeavenlyDaoShopEntryImpl(self: MarketPanel, itemId: string | null) {
  if (!itemId) {
    return null;
  }
  return HEAVENLY_DAO_SHOP_ITEMS.find((entry) => entry.itemId === itemId) ?? null;
}

export function ensureHeavenlyDaoShopSelectionImpl(self: MarketPanel) {
  const selected = getHeavenlyDaoShopEntryImpl(self, self.heavenlyDaoShopSelectedItemId);
  if (selected) {
    return selected;
  }
  const first = HEAVENLY_DAO_SHOP_ITEMS[0] ?? null;
  self.heavenlyDaoShopSelectedItemId = first?.itemId ?? null;
  return first;
}

export function buildHeavenlyDaoShopItemStackImpl(self: MarketPanel, itemId: string, count: number): ItemStack | null {
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

export function parseHeavenlyDaoShopQuantityImpl(self: MarketPanel, itemId: string): number | null {
  const raw = self.heavenlyDaoShopQuantityDrafts.get(itemId) ?? '1';
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const quantity = Number(raw);
  const entry = getHeavenlyDaoShopEntryImpl(self, itemId);
  const dailyLimit = entry && 'dailyLimit' in entry
    ? Math.max(1, Math.trunc(Number(entry.dailyLimit) || 0))
    : HEAVENLY_DAO_SHOP_MAX_QUANTITY;
  const maximum = Math.min(HEAVENLY_DAO_SHOP_MAX_QUANTITY, dailyLimit);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > maximum) {
    return null;
  }
  return quantity;
}

export function renderHeavenlyDaoShopRowsImpl(self: MarketPanel): string {
  const owned = getHeavenlyDaoShopCurrencyOwnedImpl(self);
  const currencyName = getHeavenlyDaoShopCurrencyNameImpl(self);
  const selectedItemId = ensureHeavenlyDaoShopSelectionImpl(self)?.itemId ?? null;
  return HEAVENLY_DAO_SHOP_ITEMS.map((entry) => {
    const template = getLocalItemTemplate(entry.itemId);
    const itemName = resolveClientItemBaseName(entry.itemId, template?.name);
    const countText = entry.count > 1 ? ` x${formatDisplayInteger(entry.count)}` : '';
    const ownedCount = getPlayerOwnedItemCount(self.player, self.inventory, entry.itemId);
    const unitPrice = getHeavenlyDaoShopUnitPriceImpl(self, entry.price);
    const discountLabel = getHeavenlyDaoShopDiscountLabelImpl(self);
    const insufficient = owned < unitPrice;
    const active = entry.itemId === selectedItemId ? ' active' : '';
    return `
      <button class="market-item-cell ui-surface-card ui-surface-card--compact${active}" data-heavenly-dao-shop-select="${escapeHtmlAttr(entry.itemId)}" type="button">
        <div class="market-item-cell-name">
          <span class="market-item-cell-name-text market-item-title--interactive" data-market-item-tooltip="heavenly-dao-shop:${escapeHtmlAttr(entry.itemId)}">${escapeHtml(itemName)}${escapeHtml(countText)}</span>
          <span class="market-item-cell-owned ${ownedCount > 0 ? '' : 'hidden'}">${ownedCount > 0 ? formatDisplayCountBadge(ownedCount) : ''}</span>
        </div>
        <div class="market-item-cell-prices">
          <span>${formatDisplayInteger(unitPrice)} ${escapeHtml(currencyName)}${discountLabel ? `（${escapeHtml(discountLabel)}）` : ''}</span>
          <span>${insufficient ? `${escapeHtml(currencyName)}不足` : '可兑换'}</span>
        </div>
      </button>
    `;
  }).join('');
}

export function renderHeavenlyDaoShopDetailPanelImpl(self: MarketPanel): string {
  const entry = ensureHeavenlyDaoShopSelectionImpl(self);
  if (!entry) {
    return '<div class="empty-hint">暂无可兑换物资。</div>';
  }
  const item = buildHeavenlyDaoShopItemStackImpl(self, entry.itemId, entry.count);
  if (!item) {
    return '<div class="empty-hint">商品配置不存在。</div>';
  }

  const currencyName = getHeavenlyDaoShopCurrencyNameImpl(self);
  const ownedCurrency = getHeavenlyDaoShopCurrencyOwnedImpl(self);
  const quantityText = self.heavenlyDaoShopQuantityDrafts.get(entry.itemId) ?? '1';
  const quantity = parseHeavenlyDaoShopQuantityImpl(self, entry.itemId);
  const unitPrice = getHeavenlyDaoShopUnitPriceImpl(self, entry.price);
  const discountLabel = getHeavenlyDaoShopDiscountLabelImpl(self);
  const totalCost = quantity === null ? null : quantity * unitPrice;
  const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
  const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
  const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
  const affordableCount = unitPrice > 0 ? Math.floor(ownedCurrency / unitPrice) : 0;
  const dailyLimit = 'dailyLimit' in entry ? Math.max(1, Math.trunc(Number(entry.dailyLimit) || 0)) : null;
  const maxPurchasable = Math.min(HEAVENLY_DAO_SHOP_MAX_QUANTITY, affordableCount, dailyLimit ?? HEAVENLY_DAO_SHOP_MAX_QUANTITY);
  const ownedCount = getPlayerOwnedItemCount(self.player, self.inventory, entry.itemId);
  const countText = entry.count > 1 ? ` x${formatDisplayInteger(entry.count)}` : '';
  const maximumInput = Math.min(HEAVENLY_DAO_SHOP_MAX_QUANTITY, dailyLimit ?? HEAVENLY_DAO_SHOP_MAX_QUANTITY);
  const effectLines = describeItemEffectDetails(item);
  const errorText = invalidTotal
    ? `请输入 1 至 ${formatDisplayInteger(maximumInput)} 之间的购买数量。`
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
        <span class="market-order-meta">最多可买：${formatDisplayInteger(maxPurchasable)}${dailyLimit ? ` · 每日限购 ${formatDisplayInteger(dailyLimit)}` : ''}</span>
      </div>
      <div class="market-trade-dialog-section ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
        <div class="market-trade-dialog-field">
          <span>单价</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(unitPrice)}</strong>
            <span>${escapeHtml(currencyName)}</span>
            ${discountLabel ? `<span>${escapeHtml(discountLabel)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="market-trade-dialog-section ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
        <div class="market-trade-dialog-field">
          <span>数量</span>
          ${renderTradeQuantityControl({
            value: quantityText || '1',
            max: maximumInput,
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

export function openHeavenlyDaoShopModalImpl(self: MarketPanel): void {
  ensureHeavenlyDaoShopSelectionImpl(self);
  self.heavenlyDaoShopAssetSignature = buildHeavenlyDaoShopAssetSignatureImpl(self, self.player, self.inventory);
  detailModalHost.open({
    ownerId: HEAVENLY_DAO_SHOP_MODAL_OWNER,
    size: 'full',
    variantClass: 'detail-modal--market',
    title: '天道商店',
    subtitle: `持有 ${getHeavenlyDaoShopCurrencyNameImpl(self)}：${formatDisplayInteger(getHeavenlyDaoShopCurrencyOwnedImpl(self))}`,
    renderBody: (body: HTMLElement) => {
      replaceElementHtml(body, `
        <div class="market-modal-content market-modal-content--wide heavenly-dao-shop-shell">
          <div class="market-market-tab">
            <div class="market-board heavenly-dao-shop-board">
              <div class="market-board-list-wrap ui-surface-pane ui-surface-pane--stack">
                <div class="market-list-toolbar ui-action-row">
                  <div class="market-list-toolbar-meta" data-heavenly-dao-shop-currency="true">持有 ${escapeHtml(getHeavenlyDaoShopCurrencyNameImpl(self))}：${formatDisplayInteger(getHeavenlyDaoShopCurrencyOwnedImpl(self))}</div>
                </div>
                <div class="market-board-list npc-shop-board-list ui-scroll-panel" data-heavenly-dao-shop-list="true">
                  ${renderHeavenlyDaoShopRowsImpl(self)}
                </div>
              </div>
              <div class="market-book-panel ui-surface-pane ui-surface-pane--stack" data-heavenly-dao-shop-detail="true">
                ${renderHeavenlyDaoShopDetailPanelImpl(self)}
              </div>
            </div>
          </div>
        </div>
      `);
    },
    onClose: () => {
      self.tooltipNode = null;
      self.tooltip.hide(true);
    },
    onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
      bindHeavenlyDaoShopEventsImpl(self, body, signal);
      self.bindMarketModalDelegatedEvents(body, signal);
    },
  });
}

export function getOpenHeavenlyDaoShopBodyImpl(self: MarketPanel): HTMLElement | null {
  if (!detailModalHost.isOpenFor(HEAVENLY_DAO_SHOP_MODAL_OWNER)) {
    return null;
  }
  return document.getElementById('detail-modal-body');
}

export function patchHeavenlyDaoShopModalImpl(self: MarketPanel): boolean {
  const body = getOpenHeavenlyDaoShopBodyImpl(self);
  if (!body?.querySelector('.heavenly-dao-shop-shell')) {
    return false;
  }
  detailModalHost.patch({
    ownerId: HEAVENLY_DAO_SHOP_MODAL_OWNER,
    title: '天道商店',
    subtitle: `持有 ${getHeavenlyDaoShopCurrencyNameImpl(self)}：${formatDisplayInteger(getHeavenlyDaoShopCurrencyOwnedImpl(self))}`,
  });
  const currencyNode = body.querySelector<HTMLElement>('[data-heavenly-dao-shop-currency="true"]');
  if (currencyNode) {
    currencyNode.textContent = `持有 ${getHeavenlyDaoShopCurrencyNameImpl(self)}：${formatDisplayInteger(getHeavenlyDaoShopCurrencyOwnedImpl(self))}`;
  }
  patchHeavenlyDaoShopListImpl(self);
  patchHeavenlyDaoShopDetailPanelImpl(self);
  return true;
}

export function patchHeavenlyDaoShopListImpl(self: MarketPanel): void {
  const body = getOpenHeavenlyDaoShopBodyImpl(self);
  const listRoot = body?.querySelector<HTMLElement>('[data-heavenly-dao-shop-list="true"]');
  if (!listRoot) {
    return;
  }
  replaceElementHtml(listRoot, renderHeavenlyDaoShopRowsImpl(self));
}

export function patchHeavenlyDaoShopDetailPanelImpl(self: MarketPanel): void {
  const body = getOpenHeavenlyDaoShopBodyImpl(self);
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
  replaceElementHtml(detailRoot, renderHeavenlyDaoShopDetailPanelImpl(self));
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

export function bindHeavenlyDaoShopEventsImpl(self: MarketPanel, body: HTMLElement, signal: AbortSignal): void {
  body.addEventListener('click', (event) => handleHeavenlyDaoShopClickImpl(self, event), { signal });
  body.addEventListener('input', (event) => handleHeavenlyDaoShopInputImpl(self, event), { signal });
}

export function handleHeavenlyDaoShopClickImpl(self: MarketPanel, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const selectButton = target.closest<HTMLElement>('[data-heavenly-dao-shop-select]');
  if (selectButton) {
    const itemId = selectButton.dataset.heavenlyDaoShopSelect;
    if (!itemId || itemId === self.heavenlyDaoShopSelectedItemId) {
      return;
    }
    self.heavenlyDaoShopSelectedItemId = itemId;
    patchHeavenlyDaoShopListImpl(self);
    patchHeavenlyDaoShopDetailPanelImpl(self);
    return;
  }

  const quickQtyButton = target.closest<HTMLElement>('[data-heavenly-dao-shop-quick-qty]');
  if (quickQtyButton) {
    const itemId = quickQtyButton.dataset.heavenlyDaoShopQuickQty;
    const nextQuantity = quickQtyButton.dataset.heavenlyDaoShopQuickQtyValue;
    if (!itemId || !nextQuantity) {
      return;
    }
    self.heavenlyDaoShopQuantityDrafts.set(itemId, nextQuantity);
    const body = getOpenHeavenlyDaoShopBodyImpl(self);
    const input = body?.querySelector<HTMLInputElement>(`[data-heavenly-dao-shop-quantity="${itemId}"]`);
    if (input) {
      input.value = nextQuantity;
    }
    if (body) {
      syncHeavenlyDaoShopPurchaseStateImpl(self, body, itemId);
    }
    return;
  }

  const buyButton = target.closest<HTMLElement>('[data-heavenly-dao-shop-buy]');
  if (!buyButton) {
    return;
  }
  const itemId = buyButton.dataset.heavenlyDaoShopBuy;
  const quantity = itemId ? parseHeavenlyDaoShopQuantityImpl(self, itemId) : null;
  if (!itemId || quantity === null) {
    return;
  }
  self.callbacks?.onBuyHeavenlyDaoShopItem(itemId, quantity);
}

export function handleHeavenlyDaoShopInputImpl(self: MarketPanel, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const itemId = target.dataset.heavenlyDaoShopQuantity;
  if (!itemId) {
    return;
  }
  const normalized = target.value.replaceAll(/[^\d]/g, '');
  self.heavenlyDaoShopQuantityDrafts.set(itemId, normalized);
  if (target.value !== normalized) {
    target.value = normalized;
  }
  const body = getOpenHeavenlyDaoShopBodyImpl(self);
  if (body) {
    syncHeavenlyDaoShopPurchaseStateImpl(self, body, itemId);
  }
}

export function syncHeavenlyDaoShopPurchaseStateImpl(self: MarketPanel, root: ParentNode, itemId: string): void {
  const entry = getHeavenlyDaoShopEntryImpl(self, itemId);
  const totalNode = root.querySelector<HTMLElement>(`[data-heavenly-dao-shop-total="${itemId}"]`);
  const buttonNode = root.querySelector<HTMLButtonElement>(`[data-heavenly-dao-shop-buy="${itemId}"]`);
  const errorNode = root.querySelector<HTMLElement>(`[data-heavenly-dao-shop-error="${itemId}"]`);
  if (!entry || !totalNode || !buttonNode || !errorNode) {
    return;
  }

  const currencyName = getHeavenlyDaoShopCurrencyNameImpl(self);
  const quantity = parseHeavenlyDaoShopQuantityImpl(self, itemId);
  const unitPrice = getHeavenlyDaoShopUnitPriceImpl(self, entry.price);
  const totalCost = quantity === null ? null : quantity * unitPrice;
  const dailyLimit = 'dailyLimit' in entry ? Math.max(1, Math.trunc(Number(entry.dailyLimit) || 0)) : null;
  const maximumInput = Math.min(HEAVENLY_DAO_SHOP_MAX_QUANTITY, dailyLimit ?? HEAVENLY_DAO_SHOP_MAX_QUANTITY);
  const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
  const insufficientCurrency = !invalidTotal && totalCost > getHeavenlyDaoShopCurrencyOwnedImpl(self);
  const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
  totalNode.textContent = `${displayTotal} ${currencyName}`;
  totalNode.parentElement?.classList.toggle('error', invalidTotal || insufficientCurrency);
  errorNode.hidden = !(invalidTotal || insufficientCurrency);
  errorNode.textContent = invalidTotal
    ? `请输入 1 至 ${formatDisplayInteger(maximumInput)} 之间的购买数量。`
    : `${currencyName}不足，需要 ${displayTotal} ${currencyName}。`;
  buttonNode.disabled = invalidTotal || insufficientCurrency;
}

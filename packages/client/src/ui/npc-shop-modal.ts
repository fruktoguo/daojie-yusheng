import { Inventory, ItemStack, PlayerState } from '@mud/shared';
import { buildItemTooltipPayload, describeItemEffectDetails } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { getItemTypeLabel } from '../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';
import { confirmModalHost } from './confirm-modal-host';

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

interface NpcShopModalCallbacks {
  onRequestShop: (npcId: string) => void;
  onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
}

interface NpcShopItemState {
  itemId: string;
  item: ItemStack;
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

interface NpcShopState {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: NpcShopItemState[];
}

interface NpcShopResponseState {
  npcId: string;
  shop: NpcShopState | null;
  error?: string;
}

interface NpcShopPurchaseState {
  quantity: number | null;
  affordableCount: number;
  maxPurchasable: number;
  totalCost: number | null;
  displayTotal: string;
  invalidTotal: boolean;
  insufficientCurrency: boolean;
  soldOut: boolean;
  stockExceeded: boolean;
  purchaseDisabled: boolean;
  errorText: string | null;
}

export class NpcShopModal {
  private static readonly MODAL_OWNER = 'npc-shop-modal';
  private static readonly CONFIRM_MODAL_OWNER = 'npc-shop-modal:confirm-purchase';
  private callbacks: NpcShopModalCallbacks | null = null;
  private inventory: Inventory = { items: [], capacity: 0 };
  private activeNpcId: string | null = null;
  private loading = false;
  private shopState: NpcShopResponseState | null = null;
  private selectedItemId: string | null = null;
  private confirmPurchaseItemId: string | null = null;
  private quantityDrafts = new Map<string, string>();
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  private tooltipNode: HTMLElement | null = null;

  setCallbacks(callbacks: NpcShopModalCallbacks): void {
    this.callbacks = callbacks;
  }

  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
  }

  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (this.activeNpcId && detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.callbacks?.onRequestShop(this.activeNpcId);
    }
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
    }
    this.syncPurchaseConfirmModal();
  }

  open(npcId: string): void {
    this.activeNpcId = npcId;
    this.loading = true;
    if (this.shopState?.npcId !== npcId) {
      this.shopState = null;
      this.selectedItemId = null;
      this.confirmPurchaseItemId = null;
      this.quantityDrafts.clear();
    }
    confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
    this.render();
    this.callbacks?.onRequestShop(npcId);
  }

  updateShop(data: NpcShopResponseState): void {
    if (this.activeNpcId !== data.npcId) {
      return;
    }
    this.shopState = data;
    this.loading = false;
    const validItemIds = new Set(data.shop?.items.map((item) => item.itemId) ?? []);
    if (!this.selectedItemId || !validItemIds.has(this.selectedItemId)) {
      this.selectedItemId = data.shop?.items[0]?.itemId ?? null;
    }
    if (this.confirmPurchaseItemId && !validItemIds.has(this.confirmPurchaseItemId)) {
      this.confirmPurchaseItemId = null;
    }
    for (const itemId of [...this.quantityDrafts.keys()]) {
      if (!validItemIds.has(itemId)) {
        this.quantityDrafts.delete(itemId);
      }
    }
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
    }
    this.syncPurchaseConfirmModal();
  }

  clear(): void {
    this.inventory = { items: [], capacity: 0 };
    this.activeNpcId = null;
    this.loading = false;
    this.shopState = null;
    this.selectedItemId = null;
    this.confirmPurchaseItemId = null;
    this.quantityDrafts.clear();
    this.tooltipNode = null;
    this.tooltip.hide(true);
    confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
    detailModalHost.close(NpcShopModal.MODAL_OWNER);
  }

  private render(): void {
    const response = this.shopState;
    const shop = response?.shop ?? null;
    detailModalHost.open({
      ownerId: NpcShopModal.MODAL_OWNER,
      variantClass: 'detail-modal--market',
      title: shop ? `${shop.npcName}的商店` : '商店',
      subtitle: shop?.dialogue ?? '货架同步中',
      bodyHtml: this.renderBody(),
      onClose: () => {
        this.activeNpcId = null;
        this.loading = false;
        this.confirmPurchaseItemId = null;
        this.tooltipNode = null;
        this.tooltip.hide(true);
        confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
      },
      onAfterRender: (body) => {
        body.querySelectorAll<HTMLElement>('[data-npc-shop-select-item]').forEach((button) => {
          button.addEventListener('click', () => {
            const itemId = button.dataset.npcShopSelectItem;
            if (!itemId || itemId === this.selectedItemId) {
              return;
            }
            this.selectedItemId = itemId;
            this.render();
          });
        });

        body.querySelectorAll<HTMLInputElement>('[data-npc-shop-quantity]').forEach((input) => {
          input.addEventListener('input', () => {
            const itemId = input.dataset.npcShopQuantity;
            if (!itemId) {
              return;
            }
            const normalized = input.value.replaceAll(/[^\d]/g, '');
            this.quantityDrafts.set(itemId, normalized);
            if (input.value !== normalized) {
              input.value = normalized;
            }
            this.syncPurchaseState(body, itemId);
          });
        });

        body.querySelectorAll<HTMLElement>('[data-npc-shop-quick-qty]').forEach((button) => {
          button.addEventListener('click', () => {
            const itemId = button.dataset.npcShopQuickQty;
            const nextQuantity = button.dataset.npcShopQuickQtyValue;
            if (!itemId || !nextQuantity) {
              return;
            }
            this.quantityDrafts.set(itemId, nextQuantity);
            const input = body.querySelector<HTMLInputElement>(`[data-npc-shop-quantity="${itemId}"]`);
            if (input) {
              input.value = nextQuantity;
            }
            this.syncPurchaseState(body, itemId);
          });
        });

        body.querySelectorAll<HTMLElement>('[data-npc-shop-buy]').forEach((button) => {
          button.addEventListener('click', () => {
            const itemId = button.dataset.npcShopBuy;
            const shop = this.shopState?.shop;
            const entry = itemId ? shop?.items.find((item) => item.itemId === itemId) : null;
            if (!itemId || !shop || !entry) {
              return;
            }
            const purchaseState = this.getPurchaseState(shop, entry);
            if (purchaseState.purchaseDisabled) {
              return;
            }
            this.confirmPurchaseItemId = itemId;
            this.syncPurchaseConfirmModal();
          });
        });

        this.bindItemTooltipEvents(body);
      },
    });
  }

  private renderBody(): string {
    if (this.loading && !this.shopState) {
      return '<div class="empty-hint">商店货架同步中……</div>';
    }

    const response = this.shopState;
    const shop = response?.shop ?? null;
    if (!shop) {
      return `<div class="empty-hint">${escapeHtml(response?.error ?? '暂时无法打开商店。')}</div>`;
    }
    if (shop.items.length === 0) {
      return '<div class="empty-hint">这家店今天还没有上货。</div>';
    }

    const selectedItem = shop.items.find((item) => item.itemId === this.selectedItemId) ?? shop.items[0]!;
    const listItems = shop.items
      .map((item) => this.renderListItem(item, item.itemId === selectedItem.itemId))
      .join('');
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);

    return `
      <div class="npc-shop-modal-shell">
        <div class="market-modal-content market-modal-content--wide">
          <div class="market-market-tab">
            <div class="market-board">
              <div class="market-board-list-wrap">
                <div class="market-list-toolbar">
                  <div class="market-list-toolbar-meta">共 ${formatDisplayInteger(shop.items.length)} 件，持有 ${escapeHtml(shop.currencyItemName)} ${formatDisplayInteger(ownedCurrency)}</div>
                  <div class="market-list-toolbar-actions"></div>
                </div>
                <div class="market-board-list">${listItems}</div>
              </div>
              <div class="market-book-panel">
                ${this.renderDetailPanel(shop, selectedItem)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderListItem(item: NpcShopItemState, active: boolean): string {
    const ownedCount = this.findInventoryItemCount(item.itemId);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    const stockLabel = item.remainingQuantity === undefined
      ? escapeHtml(getItemTypeLabel(item.item.type))
      : item.remainingQuantity > 0
        ? `${escapeHtml(getItemTypeLabel(item.item.type))} · 余 ${formatDisplayInteger(item.remainingQuantity)}${item.stockLimit ? `/${formatDisplayInteger(item.stockLimit)}` : ''}`
        : `${escapeHtml(getItemTypeLabel(item.item.type))} · 已售罄`;
    return `
      <button class="market-item-cell ${active ? 'active' : ''}" data-npc-shop-select-item="${escapeHtmlAttr(item.itemId)}" type="button">
        <div class="market-item-cell-name" title="${escapeHtmlAttr(item.item.name)}">
          <span class="market-item-cell-name-text market-item-title--interactive" data-npc-shop-item-tooltip="${escapeHtmlAttr(item.itemId)}">${escapeHtml(item.item.name)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>售价 ${formatDisplayInteger(item.unitPrice)}</span>
          <span>${stockLabel}</span>
        </div>
      </button>
    `;
  }

  private renderDetailPanel(
    shop: NpcShopState,
    selectedItem: NpcShopItemState,
  ): string {
    const purchaseState = this.getPurchaseState(shop, selectedItem);
    const quantityText = this.quantityDrafts.get(selectedItem.itemId) ?? '1';
    const ownedCount = this.findInventoryItemCount(selectedItem.itemId);
    const effectLines = describeItemEffectDetails(selectedItem.item);
    const refreshHint = this.formatRefreshHint(selectedItem.refreshAt);
    const stockSummary = selectedItem.remainingQuantity === undefined
      ? null
      : selectedItem.stockLimit
        ? `库存 ${formatDisplayInteger(selectedItem.remainingQuantity)}/${formatDisplayInteger(selectedItem.stockLimit)}`
        : `库存 ${formatDisplayInteger(selectedItem.remainingQuantity)}`;

    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title market-item-title--interactive" data-npc-shop-item-tooltip="${escapeHtmlAttr(selectedItem.itemId)}">${escapeHtml(selectedItem.item.name)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(selectedItem.item.type))} · ${escapeHtml(selectedItem.item.desc)}</div>
        </div>
      </div>
      ${effectLines.length > 0 ? `
        <div class="market-book-effects">
          <div class="market-book-effects-title">完整效果</div>
          <div class="market-book-effects-list">
            ${effectLines.map((line) => `<div class="market-book-effect-line">${escapeHtml(line)}</div>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="market-book-column">
        <div class="market-book-column-head">
          <div class="market-book-column-title">直接购买</div>
          <button class="small-btn" data-npc-shop-buy="${escapeHtmlAttr(selectedItem.itemId)}" type="button" ${purchaseState.purchaseDisabled ? 'disabled' : ''}>购买</button>
        </div>
        <div class="market-action-row">
          <span class="market-order-meta">已有 ${formatDisplayCountBadge(ownedCount)}</span>
          <span class="market-order-meta">最多买得起 ${formatDisplayInteger(purchaseState.maxPurchasable)}</span>
        </div>
        ${stockSummary || refreshHint ? `
        <div class="market-action-row">
          ${stockSummary ? `<span class="market-order-meta">${stockSummary}</span>` : '<span class="market-order-meta"></span>'}
          ${refreshHint ? `<span class="market-order-meta">${escapeHtml(refreshHint)}</span>` : '<span class="market-order-meta"></span>'}
        </div>
        ` : ''}
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>单价</span>
            <div class="market-price-display">
              <strong>${formatDisplayInteger(selectedItem.unitPrice)}</strong>
              <span>${escapeHtml(shop.currencyItemName)}</span>
            </div>
          </div>
        </div>
        <div class="market-trade-dialog-section">
          <div class="market-trade-dialog-field">
            <span>数量</span>
            <div class="market-quantity-row">
              <button class="small-btn ghost" data-npc-shop-quick-qty="${escapeHtmlAttr(selectedItem.itemId)}" data-npc-shop-quick-qty-value="1" type="button">1</button>
              <input
                class="gm-inline-input"
                data-npc-shop-quantity="${escapeHtmlAttr(selectedItem.itemId)}"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                value="${escapeHtmlAttr(quantityText || '1')}"
              />
              <button
                class="small-btn ghost"
                data-npc-shop-quick-qty="${escapeHtmlAttr(selectedItem.itemId)}"
                data-npc-shop-quick-qty-value="${Math.max(1, purchaseState.maxPurchasable)}"
                type="button"
                ${purchaseState.maxPurchasable <= 0 ? 'disabled' : ''}
              >最大</button>
            </div>
          </div>
          <div class="market-trade-dialog-total ${purchaseState.errorText ? 'error' : ''}">
            <span>总价</span>
            <strong data-npc-shop-total="${escapeHtmlAttr(selectedItem.itemId)}">${purchaseState.displayTotal} ${escapeHtml(shop.currencyItemName)}</strong>
          </div>
        </div>
        <div class="market-action-hint market-action-hint--error" data-npc-shop-error="${escapeHtmlAttr(selectedItem.itemId)}" ${purchaseState.errorText ? '' : 'hidden'}>
          ${escapeHtml(purchaseState.errorText ?? '')}
        </div>
      </div>
    `;
  }

  private renderConfirmBody(shop: NpcShopState, selectedItem: NpcShopItemState): string {
    const purchaseState = this.getPurchaseState(shop, selectedItem);
    const remainingCurrency = purchaseState.totalCost === null
      ? this.findInventoryItemCount(shop.currencyItemId)
      : Math.max(0, this.findInventoryItemCount(shop.currencyItemId) - purchaseState.totalCost);
    return `
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>商品</span>
          <div class="market-price-display">
            <strong>${escapeHtml(selectedItem.item.name)}</strong>
            <span>${escapeHtml(getItemTypeLabel(selectedItem.item.type))}</span>
          </div>
        </div>
      </div>
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>购买数量</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(purchaseState.quantity ?? 0)}</strong>
            <span>最多可买 ${formatDisplayInteger(purchaseState.maxPurchasable)}</span>
          </div>
        </div>
        <div class="market-trade-dialog-total ${purchaseState.errorText ? 'error' : ''}">
          <span>总价</span>
          <strong>${purchaseState.displayTotal} ${escapeHtml(shop.currencyItemName)}</strong>
        </div>
      </div>
      <div class="market-trade-dialog-section">
        <div class="market-trade-dialog-field">
          <span>购买后剩余</span>
          <div class="market-price-display">
            <strong>${formatDisplayInteger(remainingCurrency)}</strong>
            <span>${escapeHtml(shop.currencyItemName)}</span>
          </div>
        </div>
      </div>
      ${purchaseState.errorText
        ? `<div class="market-action-hint market-action-hint--error">${escapeHtml(purchaseState.errorText)}</div>`
        : `<div class="market-action-hint">确认后会直接向 ${escapeHtml(shop.npcName)} 购买，若货架刚刚变化会以服务端结算结果为准。</div>`}
    `;
  }

  private parseQuantity(itemId: string): number | null {
    const raw = this.quantityDrafts.get(itemId) ?? '1';
    if (!raw || !/^\d+$/.test(raw)) {
      return null;
    }
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

  private syncPurchaseState(root: ParentNode, itemId: string): void {
    const shop = this.shopState?.shop;
    const entry = shop?.items.find((item) => item.itemId === itemId);
    const totalNode = root.querySelector<HTMLElement>(`[data-npc-shop-total="${itemId}"]`);
    const buttonNode = root.querySelector<HTMLButtonElement>(`[data-npc-shop-buy="${itemId}"]`);
    const errorNode = root.querySelector<HTMLElement>(`[data-npc-shop-error="${itemId}"]`);
    if (!shop || !entry || !totalNode || !buttonNode || !errorNode) {
      return;
    }

    const purchaseState = this.getPurchaseState(shop, entry);
    totalNode.textContent = `${purchaseState.displayTotal} ${shop.currencyItemName}`;
    totalNode.parentElement?.classList.toggle('error', Boolean(purchaseState.errorText));
    errorNode.hidden = !purchaseState.errorText;
    errorNode.textContent = purchaseState.errorText ?? '';
    buttonNode.disabled = purchaseState.purchaseDisabled;
  }

  private getPurchaseState(shop: NpcShopState, entry: NpcShopItemState): NpcShopPurchaseState {
    const quantity = this.parseQuantity(entry.itemId);
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
    const affordableCount = entry.unitPrice > 0 ? Math.floor(ownedCurrency / entry.unitPrice) : 0;
    const maxPurchasable = entry.remainingQuantity === undefined
      ? affordableCount
      : Math.min(affordableCount, entry.remainingQuantity);
    const totalCost = quantity === null ? null : quantity * entry.unitPrice;
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
    const soldOut = entry.remainingQuantity !== undefined && entry.remainingQuantity <= 0;
    const stockExceeded = !soldOut && entry.remainingQuantity !== undefined && quantity !== null && quantity > entry.remainingQuantity;
    const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
    const refreshHint = this.formatRefreshHint(entry.refreshAt);
    const errorText = soldOut
      ? `此物已售罄${refreshHint ? `，${refreshHint}` : ''}。`
      : stockExceeded
        ? `库存不足，当前仅剩 ${formatDisplayInteger(entry.remainingQuantity ?? 0)}。`
        : insufficientCurrency
          ? `${shop.currencyItemName}不足，当前需要 ${displayTotal}。`
          : null;
    return {
      quantity,
      affordableCount,
      maxPurchasable,
      totalCost,
      displayTotal,
      invalidTotal,
      insufficientCurrency,
      soldOut,
      stockExceeded,
      purchaseDisabled: invalidTotal || soldOut || stockExceeded || insufficientCurrency,
      errorText,
    };
  }

  private syncPurchaseConfirmModal(): void {
    const shop = this.shopState?.shop;
    const itemId = this.confirmPurchaseItemId;
    const entry = itemId ? shop?.items.find((item) => item.itemId === itemId) : null;
    if (!itemId || !shop || !entry || !detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.confirmPurchaseItemId = null;
      confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
      return;
    }
    const purchaseState = this.getPurchaseState(shop, entry);
    confirmModalHost.open({
      ownerId: NpcShopModal.CONFIRM_MODAL_OWNER,
      title: '确认购买',
      subtitle: `${shop.npcName} · ${entry.item.name}`,
      bodyHtml: this.renderConfirmBody(shop, entry),
      confirmLabel: '确认购买',
      confirmDisabled: purchaseState.purchaseDisabled,
      onConfirm: () => {
        const npcId = this.activeNpcId;
        const latestShop = this.shopState?.shop;
        const latestEntry = itemId ? latestShop?.items.find((item) => item.itemId === itemId) : null;
        if (!npcId || !latestShop || !latestEntry) {
          this.confirmPurchaseItemId = null;
          return;
        }
        const latestPurchaseState = this.getPurchaseState(latestShop, latestEntry);
        if (latestPurchaseState.purchaseDisabled || latestPurchaseState.quantity === null) {
          this.confirmPurchaseItemId = itemId;
          this.syncPurchaseConfirmModal();
          return;
        }
        this.confirmPurchaseItemId = null;
        this.callbacks?.onBuyItem(npcId, itemId, latestPurchaseState.quantity);
      },
      onClose: () => {
        this.confirmPurchaseItemId = null;
      },
    });
  }

  private formatRefreshHint(refreshAt: number | undefined): string | null {
    if (!Number.isFinite(refreshAt)) {
      return null;
    }
    const remainingMs = Math.max(0, Number(refreshAt) - Date.now());
    if (remainingMs <= 60_000) {
      return '约 1 分钟内补货';
    }
    const remainingMinutes = Math.ceil(remainingMs / 60_000);
    if (remainingMinutes < 60) {
      return `约 ${formatDisplayInteger(remainingMinutes)} 分后补货`;
    }
    const remainingHours = Math.ceil(remainingMinutes / 60);
    return `约 ${formatDisplayInteger(remainingHours)} 小时后补货`;
  }

  private bindItemTooltipEvents(body: HTMLElement): void {
    const shop = this.shopState?.shop;
    if (!shop) {
      return;
    }
    const tapMode = prefersPinnedTooltipInteraction();
    body.querySelectorAll<HTMLElement>('[data-npc-shop-item-tooltip]').forEach((node) => {
      const itemId = node.dataset.npcShopItemTooltip;
      const entry = itemId ? shop.items.find((item) => item.itemId === itemId) : null;
      if (!entry) {
        return;
      }
      const tooltip = buildItemTooltipPayload(entry.item);
      const showTooltip = (event: PointerEvent): void => {
        this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        this.tooltipNode = node;
      };

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
          showTooltip(event);
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

  private findInventoryItemCount(itemId: string): number {
    if (!itemId) {
      return 0;
    }
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((total, item) => total + item.count, 0);
  }
}

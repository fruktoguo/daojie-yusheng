import { Inventory, ItemStack, ItemType, PlayerState } from '@mud/shared';
import { buildItemTooltipPayload, describeItemEffectDetails } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { getItemTypeLabel } from '../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

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

export class NpcShopModal {
  private static readonly MODAL_OWNER = 'npc-shop-modal';
  private callbacks: NpcShopModalCallbacks | null = null;
  private inventory: Inventory = { items: [], capacity: 0 };
  private activeNpcId: string | null = null;
  private loading = false;
  private shopState: NpcShopResponseState | null = null;
  private selectedItemId: string | null = null;
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
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
    }
  }

  open(npcId: string): void {
    this.activeNpcId = npcId;
    this.loading = true;
    if (this.shopState?.npcId !== npcId) {
      this.shopState = null;
      this.selectedItemId = null;
      this.quantityDrafts.clear();
    }
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
    for (const itemId of [...this.quantityDrafts.keys()]) {
      if (!validItemIds.has(itemId)) {
        this.quantityDrafts.delete(itemId);
      }
    }
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
    }
  }

  clear(): void {
    this.inventory = { items: [], capacity: 0 };
    this.activeNpcId = null;
    this.loading = false;
    this.shopState = null;
    this.selectedItemId = null;
    this.quantityDrafts.clear();
    this.tooltipNode = null;
    this.tooltip.hide(true);
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
        this.tooltipNode = null;
        this.tooltip.hide(true);
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
            const npcId = this.activeNpcId;
            const itemId = button.dataset.npcShopBuy;
            const quantity = itemId ? this.parseQuantity(itemId) : null;
            if (!npcId || !itemId || quantity === null) {
              return;
            }
            this.callbacks?.onBuyItem(npcId, itemId, quantity);
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
    const listItems = shop.items.map((item) => this.renderListItem(item.itemId, item.item.name, item.item.type, item.unitPrice, item.itemId === selectedItem.itemId)).join('');
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

  private renderListItem(
    itemId: string,
    itemName: string,
    itemType: ItemType,
    unitPrice: number,
    active: boolean,
  ): string {
    const ownedCount = this.findInventoryItemCount(itemId);
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
    return `
      <button class="market-item-cell ${active ? 'active' : ''}" data-npc-shop-select-item="${escapeHtmlAttr(itemId)}" type="button">
        <div class="market-item-cell-name" title="${escapeHtmlAttr(itemName)}">
          <span class="market-item-cell-name-text market-item-title--interactive" data-npc-shop-item-tooltip="${escapeHtmlAttr(itemId)}">${escapeHtml(itemName)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>售价 ${formatDisplayInteger(unitPrice)}</span>
          <span>${escapeHtml(getItemTypeLabel(itemType))}</span>
        </div>
      </button>
    `;
  }

  private renderDetailPanel(
    shop: NpcShopState,
    selectedItem: NpcShopItemState,
  ): string {
    const quantity = this.parseQuantity(selectedItem.itemId);
    const quantityText = this.quantityDrafts.get(selectedItem.itemId) ?? '1';
    const ownedCount = this.findInventoryItemCount(selectedItem.itemId);
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
    const effectLines = describeItemEffectDetails(selectedItem.item);
    const affordableCount = selectedItem.unitPrice > 0 ? Math.floor(ownedCurrency / selectedItem.unitPrice) : 0;
    const totalCost = quantity === null ? null : quantity * selectedItem.unitPrice;
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
    const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);

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
          <button class="small-btn" data-npc-shop-buy="${escapeHtmlAttr(selectedItem.itemId)}" type="button" ${invalidTotal ? 'disabled' : ''}>购买</button>
        </div>
        <div class="market-action-row">
          <span class="market-order-meta">已有 ${formatDisplayCountBadge(ownedCount)}</span>
          <span class="market-order-meta">最多买得起 ${formatDisplayInteger(affordableCount)}</span>
        </div>
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
                data-npc-shop-quick-qty-value="${Math.max(1, affordableCount)}"
                type="button"
                ${affordableCount <= 0 ? 'disabled' : ''}
              >最大</button>
            </div>
          </div>
          <div class="market-trade-dialog-total ${insufficientCurrency ? 'error' : ''}">
            <span>总价</span>
            <strong data-npc-shop-total="${escapeHtmlAttr(selectedItem.itemId)}">${displayTotal} ${escapeHtml(shop.currencyItemName)}</strong>
          </div>
        </div>
        <div class="market-action-hint market-action-hint--error" data-npc-shop-error="${escapeHtmlAttr(selectedItem.itemId)}" ${insufficientCurrency ? '' : 'hidden'}>
          ${escapeHtml(shop.currencyItemName)}不足，当前需要 ${displayTotal}。
        </div>
      </div>
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

    const quantity = this.parseQuantity(itemId);
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
    const totalCost = quantity === null ? null : quantity * entry.unitPrice;
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
    const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
    totalNode.textContent = `${displayTotal} ${shop.currencyItemName}`;
    totalNode.parentElement?.classList.toggle('error', insufficientCurrency);
    errorNode.hidden = !insufficientCurrency;
    errorNode.textContent = `${shop.currencyItemName}不足，当前需要 ${displayTotal}。`;
    buttonNode.disabled = invalidTotal;
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

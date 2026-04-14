import { Inventory, ItemStack, PlayerState } from '@mud/shared';
import { resolveTechniqueIdFromBookItemId } from '../content/local-templates';
import { buildItemTooltipPayload, describeItemEffectDetails } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { getItemTypeLabel } from '../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';
import { confirmModalHost } from './confirm-modal-host';

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

/** NpcShopModalCallbacks：定义该接口的能力与字段约束。 */
interface NpcShopModalCallbacks {
  onRequestShop: (npcId: string) => void;
  onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
}

/** NpcShopItemState：定义该接口的能力与字段约束。 */
interface NpcShopItemState {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** NpcShopState：定义该接口的能力与字段约束。 */
interface NpcShopState {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** npcName：定义该变量以承载业务值。 */
  npcName: string;
/** dialogue：定义该变量以承载业务值。 */
  dialogue: string;
/** currencyItemId：定义该变量以承载业务值。 */
  currencyItemId: string;
/** currencyItemName：定义该变量以承载业务值。 */
  currencyItemName: string;
/** items：定义该变量以承载业务值。 */
  items: NpcShopItemState[];
}

/** NpcShopResponseState：定义该接口的能力与字段约束。 */
interface NpcShopResponseState {
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** shop：定义该变量以承载业务值。 */
  shop: NpcShopState | null;
  error?: string;
}

/** NpcShopPurchaseState：定义该接口的能力与字段约束。 */
interface NpcShopPurchaseState {
/** quantity：定义该变量以承载业务值。 */
  quantity: number | null;
/** affordableCount：定义该变量以承载业务值。 */
  affordableCount: number;
/** maxPurchasable：定义该变量以承载业务值。 */
  maxPurchasable: number;
/** totalCost：定义该变量以承载业务值。 */
  totalCost: number | null;
/** displayTotal：定义该变量以承载业务值。 */
  displayTotal: string;
/** invalidTotal：定义该变量以承载业务值。 */
  invalidTotal: boolean;
/** insufficientCurrency：定义该变量以承载业务值。 */
  insufficientCurrency: boolean;
/** soldOut：定义该变量以承载业务值。 */
  soldOut: boolean;
/** stockExceeded：定义该变量以承载业务值。 */
  stockExceeded: boolean;
/** purchaseDisabled：定义该变量以承载业务值。 */
  purchaseDisabled: boolean;
/** errorText：定义该变量以承载业务值。 */
  errorText: string | null;
}

/** NpcShopModalMeta：定义该接口的能力与字段约束。 */
interface NpcShopModalMeta {
/** title：定义该变量以承载业务值。 */
  title: string;
/** subtitle：定义该变量以承载业务值。 */
  subtitle: string;
}

/** NpcShopModal：封装相关状态与行为。 */
export class NpcShopModal {
  private static readonly MODAL_OWNER = 'npc-shop-modal';
  private static readonly CONFIRM_MODAL_OWNER = 'npc-shop-modal:confirm-purchase';
/** callbacks：定义该变量以承载业务值。 */
  private callbacks: NpcShopModalCallbacks | null = null;
/** inventory：定义该变量以承载业务值。 */
  private inventory: Inventory = { items: [], capacity: 0 };
/** activeNpcId：定义该变量以承载业务值。 */
  private activeNpcId: string | null = null;
  private loading = false;
/** shopState：定义该变量以承载业务值。 */
  private shopState: NpcShopResponseState | null = null;
/** selectedItemId：定义该变量以承载业务值。 */
  private selectedItemId: string | null = null;
/** confirmPurchaseItemId：定义该变量以承载业务值。 */
  private confirmPurchaseItemId: string | null = null;
  private quantityDrafts = new Map<string, string>();
  private learnedTechniqueIds = new Set<string>();
  private unlockedMinimapIds = new Set<string>();
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
/** tooltipNode：定义该变量以承载业务值。 */
  private tooltipNode: HTMLElement | null = null;
  private delegatedEventsBound = false;

/** setCallbacks：执行对应的业务逻辑。 */
  setCallbacks(callbacks: NpcShopModalCallbacks): void {
    this.callbacks = callbacks;
  }

/** initFromPlayer：执行对应的业务逻辑。 */
  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
    this.syncPlayerContext(player);
  }

/** syncPlayerContext：执行对应的业务逻辑。 */
  syncPlayerContext(player?: Pick<PlayerState, 'techniques' | 'unlockedMinimapIds'>): void {
    if (!player) {
      this.learnedTechniqueIds.clear();
      this.unlockedMinimapIds.clear();
    } else {
      this.learnedTechniqueIds = new Set(
        (player.techniques ?? [])
          .map((technique) => technique.techId)
          .filter((techniqueId): techniqueId is string => typeof techniqueId === 'string' && techniqueId.length > 0),
      );
      this.unlockedMinimapIds = new Set(
        (player.unlockedMinimapIds ?? [])
          .filter((mapId): mapId is string => typeof mapId === 'string' && mapId.length > 0),
      );
    }
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
      this.syncPurchaseConfirmModal();
    }
  }

/** syncInventory：执行对应的业务逻辑。 */
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

/** open：执行对应的业务逻辑。 */
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

/** updateShop：执行对应的业务逻辑。 */
  updateShop(data: NpcShopResponseState): void {
    if (this.activeNpcId !== data.npcId) {
      return;
    }
    this.shopState = data;
    this.loading = false;
/** validItemIds：定义该变量以承载业务值。 */
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

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.inventory = { items: [], capacity: 0 };
    this.activeNpcId = null;
    this.loading = false;
    this.shopState = null;
    this.selectedItemId = null;
    this.confirmPurchaseItemId = null;
    this.quantityDrafts.clear();
    this.learnedTechniqueIds.clear();
    this.unlockedMinimapIds.clear();
    this.tooltipNode = null;
    this.tooltip.hide(true);
    confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
    detailModalHost.close(NpcShopModal.MODAL_OWNER);
  }

/** render：执行对应的业务逻辑。 */
  private render(): void {
/** response：定义该变量以承载业务值。 */
    const response = this.shopState;
/** shop：定义该变量以承载业务值。 */
    const shop = response?.shop ?? null;
/** meta：定义该变量以承载业务值。 */
    const meta = this.buildModalMeta();
/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER) && body && this.patchBody(body, meta)) {
      return;
    }
    detailModalHost.open({
      ownerId: NpcShopModal.MODAL_OWNER,
      variantClass: 'detail-modal--market',
      title: meta.title,
      subtitle: meta.subtitle,
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
        this.bindEvents(body);
        this.bindItemTooltipEvents(body);
      },
    });
  }

/** renderBody：执行对应的业务逻辑。 */
  private renderBody(): string {
    if (this.loading && !this.shopState) {
      return '<div class="empty-hint">商店货架同步中……</div>';
    }

/** response：定义该变量以承载业务值。 */
    const response = this.shopState;
/** shop：定义该变量以承载业务值。 */
    const shop = response?.shop ?? null;
    if (!shop) {
      return `<div class="empty-hint">${escapeHtml(response?.error ?? '暂时无法打开商店。')}</div>`;
    }
    if (shop.items.length === 0) {
      return '<div class="empty-hint">这家店今天还没有上货。</div>';
    }

/** selectedItem：定义该变量以承载业务值。 */
    const selectedItem = shop.items.find((item) => item.itemId === this.selectedItemId) ?? shop.items[0]!;
/** listItems：定义该变量以承载业务值。 */
    const listItems = shop.items
      .map((item) => this.renderListItem(item, item.itemId === selectedItem.itemId))
      .join('');
/** ownedCurrency：定义该变量以承载业务值。 */
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);

    return `
      <div class="npc-shop-modal-shell">
        <div class="market-modal-content market-modal-content--wide">
          <div class="market-market-tab">
            <div class="market-board">
              <div class="market-board-list-wrap">
                <div class="market-list-toolbar">
                  <div class="market-list-toolbar-meta" data-npc-shop-toolbar-meta="true">共 ${formatDisplayInteger(shop.items.length)} 件，持有 ${escapeHtml(shop.currencyItemName)} ${formatDisplayInteger(ownedCurrency)}</div>
                  <div class="market-list-toolbar-actions"></div>
                </div>
                <div class="market-board-list" data-npc-shop-list="true">${listItems}</div>
              </div>
              <div class="market-book-panel" data-npc-shop-detail="true">
                ${this.renderDetailPanel(shop, selectedItem)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

/** renderListItem：执行对应的业务逻辑。 */
  private renderListItem(item: NpcShopItemState, active: boolean): string {
/** ownedCount：定义该变量以承载业务值。 */
    const ownedCount = this.findInventoryItemCount(item.itemId);
/** status：定义该变量以承载业务值。 */
    const status = this.getItemStatusState(item.item);
/** ownedLabel：定义该变量以承载业务值。 */
    const ownedLabel = ownedCount > 0
      ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>`
      : '';
/** stockLabel：定义该变量以承载业务值。 */
    const stockLabel = item.remainingQuantity === undefined
      ? escapeHtml(getItemTypeLabel(item.item.type))
      : item.remainingQuantity > 0
        ? `${escapeHtml(getItemTypeLabel(item.item.type))} · 余 ${formatDisplayInteger(item.remainingQuantity)}${item.stockLimit ? `/${formatDisplayInteger(item.stockLimit)}` : ''}`
        : `${escapeHtml(getItemTypeLabel(item.item.type))} · 已售罄`;
/** statusClass：定义该变量以承载业务值。 */
    const statusClass = status ? ` market-item-cell--status market-item-cell--status-${status.kind}` : '';
/** statusRibbon：定义该变量以承载业务值。 */
    const statusRibbon = status
      ? `<span class="market-item-cell-ribbon" aria-hidden="true"><span>${escapeHtml(status.label)}</span></span>`
      : '';
    return `
      <button class="market-item-cell ${active ? 'active' : ''}${statusClass}" data-npc-shop-select-item="${escapeHtmlAttr(item.itemId)}" type="button">
        ${statusRibbon}
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

  private getItemStatusState(item: ItemStack): { label: string; kind: 'learned' | 'unlocked' } | null {
    if (item.type === 'skill_book') {
/** techniqueId：定义该变量以承载业务值。 */
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
      if (techniqueId && this.learnedTechniqueIds.has(techniqueId)) {
        return { label: '已学', kind: 'learned' };
      }
    }
    const mapIds = item.mapUnlockIds && item.mapUnlockIds.length > 0
      ? item.mapUnlockIds
      : item.mapUnlockId
        ? [item.mapUnlockId]
        : [];
    if (mapIds.length > 0 && mapIds.every((mapId) => this.unlockedMinimapIds.has(mapId))) {
      return { label: '已阅', kind: 'unlocked' };
    }
    return null;
  }

  private renderDetailPanel(
    shop: NpcShopState,
    selectedItem: NpcShopItemState,
  ): string {
/** purchaseState：定义该变量以承载业务值。 */
    const purchaseState = this.getPurchaseState(shop, selectedItem);
/** quantityText：定义该变量以承载业务值。 */
    const quantityText = this.quantityDrafts.get(selectedItem.itemId) ?? '1';
/** ownedCount：定义该变量以承载业务值。 */
    const ownedCount = this.findInventoryItemCount(selectedItem.itemId);
/** effectLines：定义该变量以承载业务值。 */
    const effectLines = describeItemEffectDetails(selectedItem.item);
/** refreshHint：定义该变量以承载业务值。 */
    const refreshHint = this.formatRefreshHint(selectedItem.refreshAt);
/** stockSummary：定义该变量以承载业务值。 */
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

/** renderConfirmBody：执行对应的业务逻辑。 */
  private renderConfirmBody(shop: NpcShopState, selectedItem: NpcShopItemState): string {
/** purchaseState：定义该变量以承载业务值。 */
    const purchaseState = this.getPurchaseState(shop, selectedItem);
/** remainingCurrency：定义该变量以承载业务值。 */
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

/** parseQuantity：执行对应的业务逻辑。 */
  private parseQuantity(itemId: string): number | null {
/** raw：定义该变量以承载业务值。 */
    const raw = this.quantityDrafts.get(itemId) ?? '1';
    if (!raw || !/^\d+$/.test(raw)) {
      return null;
    }
/** quantity：定义该变量以承载业务值。 */
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return null;
    }
    return quantity;
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(body: HTMLElement): void {
    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    body.addEventListener('click', (event) => this.handleBodyClick(event));
    body.addEventListener('input', (event) => this.handleBodyInput(event));
  }

/** handleBodyClick：执行对应的业务逻辑。 */
  private handleBodyClick(event: Event): void {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

/** selectButton：定义该变量以承载业务值。 */
    const selectButton = target.closest<HTMLElement>('[data-npc-shop-select-item]');
    if (selectButton) {
/** itemId：定义该变量以承载业务值。 */
      const itemId = selectButton.dataset.npcShopSelectItem;
      if (!itemId || itemId === this.selectedItemId) {
        return;
      }
      this.selectedItemId = itemId;
      this.render();
      return;
    }

/** quickQtyButton：定义该变量以承载业务值。 */
    const quickQtyButton = target.closest<HTMLElement>('[data-npc-shop-quick-qty]');
    if (quickQtyButton) {
/** itemId：定义该变量以承载业务值。 */
      const itemId = quickQtyButton.dataset.npcShopQuickQty;
/** nextQuantity：定义该变量以承载业务值。 */
      const nextQuantity = quickQtyButton.dataset.npcShopQuickQtyValue;
      if (!itemId || !nextQuantity) {
        return;
      }
      this.quantityDrafts.set(itemId, nextQuantity);
/** body：定义该变量以承载业务值。 */
      const body = document.getElementById('detail-modal-body');
/** input：定义该变量以承载业务值。 */
      const input = body?.querySelector<HTMLInputElement>(`[data-npc-shop-quantity="${itemId}"]`);
      if (input) {
        input.value = nextQuantity;
      }
      if (body) {
        this.syncPurchaseState(body, itemId);
      }
      return;
    }

/** buyButton：定义该变量以承载业务值。 */
    const buyButton = target.closest<HTMLElement>('[data-npc-shop-buy]');
    if (!buyButton) {
      return;
    }
/** itemId：定义该变量以承载业务值。 */
    const itemId = buyButton.dataset.npcShopBuy;
/** shop：定义该变量以承载业务值。 */
    const shop = this.shopState?.shop;
/** entry：定义该变量以承载业务值。 */
    const entry = itemId ? shop?.items.find((item) => item.itemId === itemId) : null;
    if (!itemId || !shop || !entry) {
      return;
    }
/** purchaseState：定义该变量以承载业务值。 */
    const purchaseState = this.getPurchaseState(shop, entry);
    if (purchaseState.purchaseDisabled) {
      return;
    }
    this.confirmPurchaseItemId = itemId;
    this.syncPurchaseConfirmModal();
  }

/** handleBodyInput：执行对应的业务逻辑。 */
  private handleBodyInput(event: Event): void {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
/** itemId：定义该变量以承载业务值。 */
    const itemId = target.dataset.npcShopQuantity;
    if (!itemId) {
      return;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = target.value.replaceAll(/[^\d]/g, '');
    this.quantityDrafts.set(itemId, normalized);
    if (target.value !== normalized) {
      target.value = normalized;
    }
/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
    if (body) {
      this.syncPurchaseState(body, itemId);
    }
  }

/** buildModalMeta：执行对应的业务逻辑。 */
  private buildModalMeta(): NpcShopModalMeta {
/** shop：定义该变量以承载业务值。 */
    const shop = this.shopState?.shop ?? null;
    return {
      title: shop ? `${shop.npcName}的商店` : '商店',
      subtitle: shop?.dialogue ?? '货架同步中',
    };
  }

/** patchBody：执行对应的业务逻辑。 */
  private patchBody(body: HTMLElement, meta: NpcShopModalMeta): boolean {
    if (!body.querySelector('.npc-shop-modal-shell')) {
      return false;
    }
/** shop：定义该变量以承载业务值。 */
    const shop = this.shopState?.shop ?? null;
    if (!shop || shop.items.length === 0 || this.loading) {
      return false;
    }
/** toolbarMeta：定义该变量以承载业务值。 */
    const toolbarMeta = body.querySelector<HTMLElement>('[data-npc-shop-toolbar-meta="true"]');
/** listRoot：定义该变量以承载业务值。 */
    const listRoot = body.querySelector<HTMLElement>('[data-npc-shop-list="true"]');
/** detailRoot：定义该变量以承载业务值。 */
    const detailRoot = body.querySelector<HTMLElement>('[data-npc-shop-detail="true"]');
    if (!toolbarMeta || !listRoot || !detailRoot) {
      return false;
    }

/** selectedItem：定义该变量以承载业务值。 */
    const selectedItem = shop.items.find((item) => item.itemId === this.selectedItemId) ?? shop.items[0]!;
/** ownedCurrency：定义该变量以承载业务值。 */
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
    toolbarMeta.textContent = `共 ${formatDisplayInteger(shop.items.length)} 件，持有 ${shop.currencyItemName} ${formatDisplayInteger(ownedCurrency)}`;
    listRoot.innerHTML = shop.items
      .map((item) => this.renderListItem(item, item.itemId === selectedItem.itemId))
      .join('');
    detailRoot.innerHTML = this.renderDetailPanel(shop, selectedItem);
    this.patchModalMeta(meta);
    this.bindItemTooltipEvents(body);
    return true;
  }

/** patchModalMeta：执行对应的业务逻辑。 */
  private patchModalMeta(meta: NpcShopModalMeta): void {
/** titleNode：定义该变量以承载业务值。 */
    const titleNode = document.getElementById('detail-modal-title');
/** subtitleNode：定义该变量以承载业务值。 */
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (titleNode) {
      titleNode.textContent = meta.title;
    }
    if (subtitleNode) {
      subtitleNode.textContent = meta.subtitle;
      subtitleNode.classList.toggle('hidden', meta.subtitle.length === 0);
    }
  }

/** syncPurchaseState：执行对应的业务逻辑。 */
  private syncPurchaseState(root: ParentNode, itemId: string): void {
/** shop：定义该变量以承载业务值。 */
    const shop = this.shopState?.shop;
/** entry：定义该变量以承载业务值。 */
    const entry = shop?.items.find((item) => item.itemId === itemId);
/** totalNode：定义该变量以承载业务值。 */
    const totalNode = root.querySelector<HTMLElement>(`[data-npc-shop-total="${itemId}"]`);
/** buttonNode：定义该变量以承载业务值。 */
    const buttonNode = root.querySelector<HTMLButtonElement>(`[data-npc-shop-buy="${itemId}"]`);
/** errorNode：定义该变量以承载业务值。 */
    const errorNode = root.querySelector<HTMLElement>(`[data-npc-shop-error="${itemId}"]`);
    if (!shop || !entry || !totalNode || !buttonNode || !errorNode) {
      return;
    }

/** purchaseState：定义该变量以承载业务值。 */
    const purchaseState = this.getPurchaseState(shop, entry);
    totalNode.textContent = `${purchaseState.displayTotal} ${shop.currencyItemName}`;
    totalNode.parentElement?.classList.toggle('error', Boolean(purchaseState.errorText));
    errorNode.hidden = !purchaseState.errorText;
    errorNode.textContent = purchaseState.errorText ?? '';
    buttonNode.disabled = purchaseState.purchaseDisabled;
  }

/** getPurchaseState：执行对应的业务逻辑。 */
  private getPurchaseState(shop: NpcShopState, entry: NpcShopItemState): NpcShopPurchaseState {
/** quantity：定义该变量以承载业务值。 */
    const quantity = this.parseQuantity(entry.itemId);
/** ownedCurrency：定义该变量以承载业务值。 */
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
/** affordableCount：定义该变量以承载业务值。 */
    const affordableCount = entry.unitPrice > 0 ? Math.floor(ownedCurrency / entry.unitPrice) : 0;
/** maxPurchasable：定义该变量以承载业务值。 */
    const maxPurchasable = entry.remainingQuantity === undefined
      ? affordableCount
      : Math.min(affordableCount, entry.remainingQuantity);
/** totalCost：定义该变量以承载业务值。 */
    const totalCost = quantity === null ? null : quantity * entry.unitPrice;
/** invalidTotal：定义该变量以承载业务值。 */
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
/** soldOut：定义该变量以承载业务值。 */
    const soldOut = entry.remainingQuantity !== undefined && entry.remainingQuantity <= 0;
/** stockExceeded：定义该变量以承载业务值。 */
    const stockExceeded = !soldOut && entry.remainingQuantity !== undefined && quantity !== null && quantity > entry.remainingQuantity;
/** insufficientCurrency：定义该变量以承载业务值。 */
    const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
/** displayTotal：定义该变量以承载业务值。 */
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
/** refreshHint：定义该变量以承载业务值。 */
    const refreshHint = this.formatRefreshHint(entry.refreshAt);
/** errorText：定义该变量以承载业务值。 */
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

/** syncPurchaseConfirmModal：执行对应的业务逻辑。 */
  private syncPurchaseConfirmModal(): void {
/** shop：定义该变量以承载业务值。 */
    const shop = this.shopState?.shop;
/** itemId：定义该变量以承载业务值。 */
    const itemId = this.confirmPurchaseItemId;
/** entry：定义该变量以承载业务值。 */
    const entry = itemId ? shop?.items.find((item) => item.itemId === itemId) : null;
    if (!itemId || !shop || !entry || !detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.confirmPurchaseItemId = null;
      confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
      return;
    }
/** purchaseState：定义该变量以承载业务值。 */
    const purchaseState = this.getPurchaseState(shop, entry);
    confirmModalHost.open({
      ownerId: NpcShopModal.CONFIRM_MODAL_OWNER,
      title: '确认购买',
      subtitle: `${shop.npcName} · ${entry.item.name}`,
      bodyHtml: this.renderConfirmBody(shop, entry),
      confirmLabel: '确认购买',
      confirmDisabled: purchaseState.purchaseDisabled,
      onConfirm: () => {
/** npcId：定义该变量以承载业务值。 */
        const npcId = this.activeNpcId;
/** latestShop：定义该变量以承载业务值。 */
        const latestShop = this.shopState?.shop;
/** latestEntry：定义该变量以承载业务值。 */
        const latestEntry = itemId ? latestShop?.items.find((item) => item.itemId === itemId) : null;
        if (!npcId || !latestShop || !latestEntry) {
          this.confirmPurchaseItemId = null;
          return;
        }
/** latestPurchaseState：定义该变量以承载业务值。 */
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

/** formatRefreshHint：执行对应的业务逻辑。 */
  private formatRefreshHint(refreshAt: number | undefined): string | null {
    if (!Number.isFinite(refreshAt)) {
      return null;
    }
/** remainingMs：定义该变量以承载业务值。 */
    const remainingMs = Math.max(0, Number(refreshAt) - Date.now());
    if (remainingMs <= 60_000) {
      return '约 1 分钟内补货';
    }
/** remainingMinutes：定义该变量以承载业务值。 */
    const remainingMinutes = Math.ceil(remainingMs / 60_000);
    if (remainingMinutes < 60) {
      return `约 ${formatDisplayInteger(remainingMinutes)} 分后补货`;
    }
/** remainingHours：定义该变量以承载业务值。 */
    const remainingHours = Math.ceil(remainingMinutes / 60);
    return `约 ${formatDisplayInteger(remainingHours)} 小时后补货`;
  }

/** bindItemTooltipEvents：执行对应的业务逻辑。 */
  private bindItemTooltipEvents(body: HTMLElement): void {
/** shop：定义该变量以承载业务值。 */
    const shop = this.shopState?.shop;
    if (!shop) {
      return;
    }
/** tapMode：定义该变量以承载业务值。 */
    const tapMode = prefersPinnedTooltipInteraction();
    body.querySelectorAll<HTMLElement>('[data-npc-shop-item-tooltip]').forEach((node) => {
/** itemId：定义该变量以承载业务值。 */
      const itemId = node.dataset.npcShopItemTooltip;
/** entry：定义该变量以承载业务值。 */
      const entry = itemId ? shop.items.find((item) => item.itemId === itemId) : null;
      if (!entry) {
        return;
      }
/** tooltip：定义该变量以承载业务值。 */
      const tooltip = buildItemTooltipPayload(entry.item);
/** showTooltip：定义该变量以承载业务值。 */
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

/** findInventoryItemCount：执行对应的业务逻辑。 */
  private findInventoryItemCount(itemId: string): number {
    if (!itemId) {
      return 0;
    }
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((total, item) => total + item.count, 0);
  }
}

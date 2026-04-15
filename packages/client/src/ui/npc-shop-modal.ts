import { Inventory, ItemStack, PlayerState } from '@mud/shared-next';
import { buildItemTooltipPayload, describeItemEffectDetails } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { getItemTypeLabel } from '../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** escapeHtmlAttr：处理escape Html属性。 */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

/** NpcShopModalCallbacks：商店弹窗回调集。 */
interface NpcShopModalCallbacks {
  onRequestShop: (npcId: string) => void;
  onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
}

/** NpcShopItemState：商店商品渲染状态。 */
interface NpcShopItemState {
  itemId: string;
  item: ItemStack;
  unitPrice: number;
  remainingQuantity?: number;
  stockLimit?: number;
  refreshAt?: number;
}

/** NpcShopState：NPC 商店渲染状态。 */
interface NpcShopState {
  npcId: string;
  npcName: string;
  dialogue: string;
  currencyItemId: string;
  currencyItemName: string;
  items: NpcShopItemState[];
}

/** NpcShopResponseState：商店接口响应状态。 */
interface NpcShopResponseState {
  npcId: string;
  shop: NpcShopState | null;
  error?: string;
}

/** NpcShopModalMeta：商店弹窗标题元数据。 */
interface NpcShopModalMeta {
  title: string;
  subtitle: string;
}

/** NpcShopModal：NPC商店弹窗实现。 */
export class NpcShopModal {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'npc-shop-modal';
  /** callbacks：callbacks。 */
  private callbacks: NpcShopModalCallbacks | null = null;
  /** inventory：背包。 */
  private inventory: Inventory = { items: [], capacity: 0 };
  /** activeNpcId：活跃NPC ID。 */
  private activeNpcId: string | null = null;
  /** loading：loading。 */
  private loading = false;
  /** shopState：商店状态。 */
  private shopState: NpcShopResponseState | null = null;
  /** selectedItemId：selected物品ID。 */
  private selectedItemId: string | null = null;
  /** quantityDrafts：quantity Drafts。 */
  private quantityDrafts = new Map<string, string>();
  /** tooltip：提示。 */
  private tooltip = new FloatingTooltip('floating-tooltip market-item-tooltip');
  /** tooltipNode：提示节点。 */
  private tooltipNode: HTMLElement | null = null;
  /** delegatedEventsBound：delegated事件Bound。 */
  private delegatedEventsBound = false;

  /** setCallbacks：处理set Callbacks。 */
  setCallbacks(callbacks: NpcShopModalCallbacks): void {
    this.callbacks = callbacks;
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.inventory = player.inventory;
  }

  /** syncInventory：同步背包。 */
  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (this.activeNpcId && detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.callbacks?.onRequestShop(this.activeNpcId);
    }
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
    }
  }

  /** open：打开open。 */
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

  /** updateShop：更新商店。 */
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

  /** clear：清理clear。 */
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

  /** render：渲染渲染。 */
  private render(): void {
    const response = this.shopState;
    const shop = response?.shop ?? null;
    const meta = this.buildModalMeta();
    const body = document.getElementById('detail-modal-body');
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER) && body && this.patchBody(body, meta)) {
      return;
    }
    detailModalHost.open({
      ownerId: NpcShopModal.MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market',
      title: meta.title,
      subtitle: meta.subtitle,
      bodyHtml: this.renderBody(),
      onClose: () => {
        this.activeNpcId = null;
        this.loading = false;
        this.tooltipNode = null;
        this.tooltip.hide(true);
      },
      onAfterRender: (body) => {
        this.bindEvents(body);
        this.bindItemTooltipEvents(body);
      },
    });
  }

  /** renderBody：渲染身体。 */
  private renderBody(): string {
    if (this.loading && !this.shopState) {
      return '<div class="empty-hint ui-empty-hint">商店货架同步中……</div>';
    }

    const response = this.shopState;
    const shop = response?.shop ?? null;
    if (!shop) {
      return `<div class="empty-hint ui-empty-hint">${escapeHtml(response?.error ?? '暂时无法打开商店。')}</div>`;
    }
    if (shop.items.length === 0) {
      return '<div class="empty-hint ui-empty-hint">这家店今天还没有上货。</div>';
    }

    const selectedItem = shop.items.find((item) => item.itemId === this.selectedItemId) ?? shop.items[0]!;
    const listItems = shop.items
      .map((item) => this.renderListItem(item, item.itemId === selectedItem.itemId))
      .join('');
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);

    return `
      <div class="npc-shop-modal-shell ui-card-list">
        <div class="market-modal-content market-modal-content--wide">
          <div class="market-market-tab">
            <div class="market-board">
              <div class="market-board-list-wrap ui-surface-pane ui-surface-pane--stack">
                <div class="market-list-toolbar ui-action-row">
                  <div class="market-list-toolbar-meta" data-npc-shop-toolbar-meta="true">共 ${formatDisplayInteger(shop.items.length)} 件，持有 ${escapeHtml(shop.currencyItemName)} ${formatDisplayInteger(ownedCurrency)}</div>
                  <div class="market-list-toolbar-actions"></div>
                </div>
                <div class="market-board-list ui-scroll-panel" data-npc-shop-list="true">${listItems}</div>
              </div>
              <div class="market-book-panel ui-surface-pane ui-surface-pane--stack" data-npc-shop-detail="true">
                ${this.renderDetailPanel(shop, selectedItem)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** renderListItem：渲染列表物品。 */
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
    const quantity = this.parseQuantity(selectedItem.itemId);
    const quantityText = this.quantityDrafts.get(selectedItem.itemId) ?? '1';
    const ownedCount = this.findInventoryItemCount(selectedItem.itemId);
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
    const effectLines = describeItemEffectDetails(selectedItem.item);
    const affordableCount = selectedItem.unitPrice > 0 ? Math.floor(ownedCurrency / selectedItem.unitPrice) : 0;
    const maxPurchasable = selectedItem.remainingQuantity === undefined
      ? affordableCount
      : Math.min(affordableCount, selectedItem.remainingQuantity);
    const totalCost = quantity === null ? null : quantity * selectedItem.unitPrice;
    const invalidTotal = totalCost === null || !Number.isSafeInteger(totalCost) || totalCost <= 0;
    const soldOut = selectedItem.remainingQuantity !== undefined && selectedItem.remainingQuantity <= 0;
    const stockExceeded = !soldOut && selectedItem.remainingQuantity !== undefined && quantity !== null && quantity > selectedItem.remainingQuantity;
    const insufficientCurrency = !invalidTotal && totalCost > ownedCurrency;
    const purchaseBlocked = invalidTotal || soldOut || stockExceeded;
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
    const refreshHint = this.formatRefreshHint(selectedItem.refreshAt);
    const stockSummary = selectedItem.remainingQuantity === undefined
      ? null
      : selectedItem.stockLimit
        ? `库存 ${formatDisplayInteger(selectedItem.remainingQuantity)}/${formatDisplayInteger(selectedItem.stockLimit)}`
        : `库存 ${formatDisplayInteger(selectedItem.remainingQuantity)}`;
    const errorText = soldOut
      ? `此物已售罄${refreshHint ? `，${refreshHint}` : ''}。`
      : stockExceeded
        ? `库存不足，当前仅剩 ${formatDisplayInteger(selectedItem.remainingQuantity ?? 0)}。`
        : `${shop.currencyItemName}不足，当前需要 ${displayTotal}。`;

    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title market-item-title--interactive" data-npc-shop-item-tooltip="${escapeHtmlAttr(selectedItem.itemId)}">${escapeHtml(selectedItem.item.name)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(selectedItem.item.type))} · ${escapeHtml(selectedItem.item.desc)}</div>
        </div>
      </div>
      ${effectLines.length > 0 ? `
        <div class="market-book-effects ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
          <div class="market-book-effects-title">完整效果</div>
          <div class="market-book-effects-list">
            ${effectLines.map((line) => `<div class="market-book-effect-line">${escapeHtml(line)}</div>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-scroll-panel">
        <div class="market-book-column-head">
          <div class="market-book-column-title">直接购买</div>
          <button class="small-btn" data-npc-shop-buy="${escapeHtmlAttr(selectedItem.itemId)}" type="button" ${purchaseBlocked ? 'disabled' : ''}>购买</button>
        </div>
        <div class="market-action-row">
          <span class="market-order-meta">已有 ${formatDisplayCountBadge(ownedCount)}</span>
          <span class="market-order-meta">最多买得起 ${formatDisplayInteger(maxPurchasable)}</span>
        </div>
        ${stockSummary || refreshHint ? `
        <div class="market-action-row">
          ${stockSummary ? `<span class="market-order-meta">${stockSummary}</span>` : '<span class="market-order-meta"></span>'}
          ${refreshHint ? `<span class="market-order-meta">${escapeHtml(refreshHint)}</span>` : '<span class="market-order-meta"></span>'}
        </div>
        ` : ''}
        <div class="market-trade-dialog-section ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
          <div class="market-trade-dialog-field">
            <span>单价</span>
            <div class="market-price-display">
              <strong>${formatDisplayInteger(selectedItem.unitPrice)}</strong>
              <span>${escapeHtml(shop.currencyItemName)}</span>
            </div>
          </div>
        </div>
        <div class="market-trade-dialog-section ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted">
          <div class="market-trade-dialog-field">
            <span>数量</span>
            <div class="market-quantity-row">
              <button class="small-btn ghost" data-npc-shop-quick-qty="${escapeHtmlAttr(selectedItem.itemId)}" data-npc-shop-quick-qty-value="1" type="button">1</button>
              <input
                class="gm-inline-input ui-input"
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
                data-npc-shop-quick-qty-value="${Math.max(1, maxPurchasable)}"
                type="button"
                ${maxPurchasable <= 0 ? 'disabled' : ''}
              >最大</button>
            </div>
          </div>
          <div class="market-trade-dialog-total ${insufficientCurrency || soldOut || stockExceeded ? 'error' : ''}">
            <span>总价</span>
            <strong data-npc-shop-total="${escapeHtmlAttr(selectedItem.itemId)}">${displayTotal} ${escapeHtml(shop.currencyItemName)}</strong>
          </div>
        </div>
        <div class="market-action-hint market-action-hint--error" data-npc-shop-error="${escapeHtmlAttr(selectedItem.itemId)}" ${insufficientCurrency || soldOut || stockExceeded ? '' : 'hidden'}>
          ${escapeHtml(errorText)}
        </div>
      </div>
    `;
  }

  /** parseQuantity：解析Quantity。 */
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

  /** bindEvents：绑定事件。 */
  private bindEvents(body: HTMLElement): void {
    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    body.addEventListener('click', (event) => this.handleBodyClick(event));
    body.addEventListener('input', (event) => this.handleBodyInput(event));
  }

  /** handleBodyClick：处理身体Click。 */
  private handleBodyClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const selectButton = target.closest<HTMLElement>('[data-npc-shop-select-item]');
    if (selectButton) {
      const itemId = selectButton.dataset.npcShopSelectItem;
      if (!itemId || itemId === this.selectedItemId) {
        return;
      }
      this.selectedItemId = itemId;
      this.render();
      return;
    }

    const quickQtyButton = target.closest<HTMLElement>('[data-npc-shop-quick-qty]');
    if (quickQtyButton) {
      const itemId = quickQtyButton.dataset.npcShopQuickQty;
      const nextQuantity = quickQtyButton.dataset.npcShopQuickQtyValue;
      if (!itemId || !nextQuantity) {
        return;
      }
      this.quantityDrafts.set(itemId, nextQuantity);
      const body = document.getElementById('detail-modal-body');
      const input = body?.querySelector<HTMLInputElement>(`[data-npc-shop-quantity="${itemId}"]`);
      if (input) {
        input.value = nextQuantity;
      }
      if (body) {
        this.syncPurchaseState(body, itemId);
      }
      return;
    }

    const buyButton = target.closest<HTMLElement>('[data-npc-shop-buy]');
    if (!buyButton) {
      return;
    }
    const npcId = this.activeNpcId;
    const itemId = buyButton.dataset.npcShopBuy;
    const quantity = itemId ? this.parseQuantity(itemId) : null;
    if (!npcId || !itemId || quantity === null) {
      return;
    }
    this.callbacks?.onBuyItem(npcId, itemId, quantity);
  }

  /** handleBodyInput：处理身体输入。 */
  private handleBodyInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const itemId = target.dataset.npcShopQuantity;
    if (!itemId) {
      return;
    }
    const normalized = target.value.replaceAll(/[^\d]/g, '');
    this.quantityDrafts.set(itemId, normalized);
    if (target.value !== normalized) {
      target.value = normalized;
    }
    const body = document.getElementById('detail-modal-body');
    if (body) {
      this.syncPurchaseState(body, itemId);
    }
  }

  /** buildModalMeta：构建弹窗元数据。 */
  private buildModalMeta(): NpcShopModalMeta {
    const shop = this.shopState?.shop ?? null;
    return {
      title: shop ? `${shop.npcName}的商店` : '商店',
      subtitle: shop?.dialogue ?? '货架同步中',
    };
  }

  /** patchBody：处理patch身体。 */
  private patchBody(body: HTMLElement, meta: NpcShopModalMeta): boolean {
    if (!body.querySelector('.npc-shop-modal-shell')) {
      return false;
    }
    const shop = this.shopState?.shop ?? null;
    if (!shop || shop.items.length === 0 || this.loading) {
      return false;
    }
    const toolbarMeta = body.querySelector<HTMLElement>('[data-npc-shop-toolbar-meta="true"]');
    const listRoot = body.querySelector<HTMLElement>('[data-npc-shop-list="true"]');
    const detailRoot = body.querySelector<HTMLElement>('[data-npc-shop-detail="true"]');
    if (!toolbarMeta || !listRoot || !detailRoot) {
      return false;
    }

    const selectedItem = shop.items.find((item) => item.itemId === this.selectedItemId) ?? shop.items[0]!;
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

  /** patchModalMeta：处理patch弹窗元数据。 */
  private patchModalMeta(meta: NpcShopModalMeta): void {
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (titleNode) {
      titleNode.textContent = meta.title;
    }
    if (subtitleNode) {
      subtitleNode.textContent = meta.subtitle;
      subtitleNode.classList.toggle('hidden', meta.subtitle.length === 0);
    }
  }

  /** syncPurchaseState：同步Purchase状态。 */
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
    const soldOut = entry.remainingQuantity !== undefined && entry.remainingQuantity <= 0;
    const stockExceeded = !soldOut && entry.remainingQuantity !== undefined && quantity !== null && quantity > entry.remainingQuantity;
    const displayTotal = invalidTotal ? '--' : formatDisplayInteger(totalCost ?? 0);
    totalNode.textContent = `${displayTotal} ${shop.currencyItemName}`;
    totalNode.parentElement?.classList.toggle('error', insufficientCurrency || soldOut || stockExceeded);
    errorNode.hidden = !(insufficientCurrency || soldOut || stockExceeded);
    errorNode.textContent = soldOut
      ? `此物已售罄${this.formatRefreshHint(entry.refreshAt) ? `，${this.formatRefreshHint(entry.refreshAt)}` : ''}。`
      : stockExceeded
        ? `库存不足，当前仅剩 ${formatDisplayInteger(entry.remainingQuantity ?? 0)}。`
        : `${shop.currencyItemName}不足，当前需要 ${displayTotal}。`;
    buttonNode.disabled = invalidTotal || soldOut || stockExceeded;
  }

  /** formatRefreshHint：格式化Refresh Hint。 */
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

  /** bindItemTooltipEvents：绑定物品提示事件。 */
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

  /** findInventoryItemCount：查找背包物品数量。 */
  private findInventoryItemCount(itemId: string): number {
    if (!itemId) {
      return 0;
    }
    return this.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((total, item) => total + item.count, 0);
  }
}



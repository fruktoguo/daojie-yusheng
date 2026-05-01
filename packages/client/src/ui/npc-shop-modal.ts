import { Inventory, ItemStack, PlayerState } from '@mud/shared';
import { buildItemTooltipPayload, describeItemEffectDetails } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { getItemTypeLabel } from '../domain-labels';
import { getPlayerOwnedItemCount } from '../utils/player-wallet';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';
import { patchElementChildren, patchElementHtml } from './dom-patch';
import { confirmModalHost } from './confirm-modal-host';
import { resolveTechniqueIdFromBookItemId } from '../content/local-templates';

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
/**
 * onRequestShop：onRequestShop相关字段。
 */

  onRequestShop: (npcId: string) => void;  
  /**
 * onBuyItem：onBuy道具相关字段。
 */

  onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
}

/** NpcShopItemState：商店商品渲染状态。 */
interface NpcShopItemState {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * item：道具相关字段。
 */

  item: ItemStack;  
  /**
 * unitPrice：unit价格数值。
 */

  unitPrice: number;  
  /**
 * remainingQuantity：remainingQuantity相关字段。
 */

  remainingQuantity?: number;  
  /**
 * stockLimit：stockLimit相关字段。
 */

  stockLimit?: number;  
  /**
 * refreshAt：refreshAt相关字段。
 */

  refreshAt?: number;
}

/** NpcShopState：NPC 商店渲染状态。 */
interface NpcShopState {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * npcName：NPC名称名称或显示文本。
 */

  npcName: string;  
  /**
 * dialogue：dialogue相关字段。
 */

  dialogue: string;  
  /**
 * currencyItemId：currency道具ID标识。
 */

  currencyItemId: string;  
  /**
 * currencyItemName：currency道具名称名称或显示文本。
 */

  currencyItemName: string;  
  /**
 * items：集合字段。
 */

  items: NpcShopItemState[];
}

/** NpcShopResponseState：商店接口响应状态。 */
interface NpcShopResponseState {
/**
 * npcId：NPCID标识。
 */

  npcId: string;  
  /**
 * shop：shop相关字段。
 */

  shop: NpcShopState | null;  
  /**
 * error：error相关字段。
 */

  error?: string;
}

/** NpcShopModalMeta：商店弹窗标题元数据。 */
interface NpcShopModalMeta {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle: string;
}

/** NpcShopRenderState：商店弹窗滚动与输入焦点状态。 */
interface NpcShopRenderState {
/**
 * listScrollTop：列表ScrollTop相关字段。
 */

  listScrollTop: number;  
  /**
 * detailScrollTop：详情ScrollTop相关字段。
 */

  detailScrollTop: number;  
  /**
 * focusedQuantityItemId：focusedQuantity道具ID标识。
 */

  focusedQuantityItemId: string | null;  
  /**
 * selectionStart：selectionStart相关字段。
 */

  selectionStart: number | null;  
  /**
 * selectionEnd：selectionEnd相关字段。
 */

  selectionEnd: number | null;
}

/** NpcShopModal：NPC商店弹窗实现。 */
export class NpcShopModal {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'npc-shop-modal';
  /** CONFIRM_MODAL_OWNER：购买确认弹层OWNER。 */
  private static readonly CONFIRM_MODAL_OWNER = 'npc-shop-buy-confirm';
  /** callbacks：callbacks。 */
  private callbacks: NpcShopModalCallbacks | null = null;
  /** inventory：背包。 */
  private inventory: Inventory = { items: [], capacity: 0 };
  /** player：玩家上下文。 */
  private player: PlayerState | null = null;
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
  /** buyConfirmState：待确认购买请求。 */
  private buyConfirmState: { npcId: string; itemId: string; quantity: number } | null = null;

  /** setCallbacks：处理set Callbacks。 */
  setCallbacks(callbacks: NpcShopModalCallbacks): void {
    this.callbacks = callbacks;
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.player = player;
    this.inventory = player.inventory;
  }

  /** syncPlayerContext：同步玩家上下文。 */
  syncPlayerContext(player?: PlayerState): void {
    this.player = player ?? null;
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)) {
      this.render();
    }
  }

  /** syncInventory：同步背包。 */
  syncInventory(inventory: Inventory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    this.player = null;
    this.inventory = { items: [], capacity: 0 };
    this.activeNpcId = null;
    this.loading = false;
    this.shopState = null;
    this.selectedItemId = null;
    this.quantityDrafts.clear();
    this.tooltipNode = null;
    this.buyConfirmState = null;
    this.tooltip.hide(true);
    confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
    detailModalHost.close(NpcShopModal.MODAL_OWNER);
  }

  /** render：渲染渲染。 */
  private render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const meta = this.buildModalMeta();
    const body = detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    const renderState = body ? this.captureRenderState(body) : null;
    if (detailModalHost.isOpenFor(NpcShopModal.MODAL_OWNER) && body && this.patchBody(body, meta)) {
      if (renderState) {
        this.restoreRenderState(body, renderState);
      }
      return;
    }
    detailModalHost.open({
      ownerId: NpcShopModal.MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market',
      title: meta.title,
      subtitle: meta.subtitle,
      renderBody: (modalBody) => {
        this.renderBody(modalBody);
      },
      onClose: () => {
        this.activeNpcId = null;
        this.loading = false;
        this.tooltipNode = null;
        this.buyConfirmState = null;
        this.tooltip.hide(true);
        confirmModalHost.close(NpcShopModal.CONFIRM_MODAL_OWNER);
      },
      onAfterRender: (body, signal) => {
        this.bindEvents(body, signal);
        this.bindItemTooltipEvents(body, signal);
        if (renderState) {
          this.restoreRenderState(body, renderState);
        }
      },
    });
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.loading && !this.shopState) {
      patchElementChildren(body, this.createEmptyState('货品查探中...'));
      return;
    }

    const response = this.shopState;
    const shop = response?.shop ?? null;
    if (!shop) {
      patchElementChildren(body, this.createEmptyState(response?.error ?? '暂无法观阅货品。'));
      return;
    }
    if (shop.items.length === 0) {
      patchElementChildren(body, this.createEmptyState('此间今日无货。'));
      return;
    }

    const selectedItem = shop.items.find((item) => item.itemId === this.selectedItemId) ?? shop.items[0]!;
    const shell = this.createModalShell();
    const toolbarMeta = shell.querySelector<HTMLElement>('[data-npc-shop-toolbar-meta="true"]');
    const listRoot = shell.querySelector<HTMLElement>('[data-npc-shop-list="true"]');
    const detailRoot = shell.querySelector<HTMLElement>('[data-npc-shop-detail="true"]');
    if (!toolbarMeta || !listRoot || !detailRoot) {
      patchElementChildren(body, this.createEmptyState('暂无法观阅货品。'));
      return;
    }
    this.syncToolbarMeta(toolbarMeta, shop);
    this.syncShopList(listRoot, shop, selectedItem);
    this.syncDetailPanel(detailRoot, shop, selectedItem);
    patchElementChildren(body, shell);
  }

  /** createEmptyState：创建空态节点。 */
  private createEmptyState(text: string): HTMLDivElement {
    const empty = document.createElement('div');
    empty.className = 'empty-hint ui-empty-hint';
    empty.textContent = text;
    return empty;
  }

  /** createModalShell：创建商店弹层的稳定壳体。 */
  private createModalShell(): HTMLDivElement {
    const shell = document.createElement('div');
    shell.className = 'npc-shop-modal-shell ui-card-list';

    const content = document.createElement('div');
    content.className = 'market-modal-content market-modal-content--wide';
    const tab = document.createElement('div');
    tab.className = 'market-market-tab';
    const board = document.createElement('div');
    board.className = 'market-board';

    const listWrap = document.createElement('div');
    listWrap.className = 'market-board-list-wrap ui-surface-pane ui-surface-pane--stack';
    const toolbar = document.createElement('div');
    toolbar.className = 'market-list-toolbar ui-action-row';
    const toolbarMeta = document.createElement('div');
    toolbarMeta.className = 'market-list-toolbar-meta';
    toolbarMeta.dataset.npcShopToolbarMeta = 'true';
    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'market-list-toolbar-actions';
    toolbar.append(toolbarMeta, toolbarActions);

    const list = document.createElement('div');
    list.className = 'market-board-list ui-scroll-panel';
    list.dataset.npcShopList = 'true';
    listWrap.append(toolbar, list);

    const detail = document.createElement('div');
    detail.className = 'market-book-panel ui-surface-pane ui-surface-pane--stack';
    detail.dataset.npcShopDetail = 'true';

    board.append(listWrap, detail);
    tab.appendChild(board);
    content.appendChild(tab);
    shell.appendChild(content);
    return shell;
  }

  /** createListItem：创建商店列表项。 */
  private createListItem(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'market-item-cell';
    button.type = 'button';

    const name = document.createElement('div');
    name.className = 'market-item-cell-name';
    name.dataset.npcShopItemNameWrap = 'true';

    const nameText = document.createElement('span');
    nameText.className = 'market-item-cell-name-text market-item-title--interactive';
    nameText.dataset.npcShopItemTooltip = '';

    const owned = document.createElement('span');
    owned.className = 'market-item-cell-owned';
    owned.dataset.npcShopOwned = 'true';

    name.append(nameText, owned);

    const ribbon = document.createElement('span');
    ribbon.className = 'market-item-cell-ribbon';
    ribbon.setAttribute('aria-hidden', 'true');
    ribbon.dataset.npcShopStatusRibbon = 'true';

    const prices = document.createElement('div');
    prices.className = 'market-item-cell-prices';

    const price = document.createElement('span');
    price.dataset.npcShopPrice = 'true';

    const stock = document.createElement('span');
    stock.dataset.npcShopStock = 'true';

    prices.append(price, stock);
    button.append(ribbon, name, prices);
    return button;
  }

  /** patchListItem：按当前商店状态更新列表项。 */
  private patchListItem(button: HTMLButtonElement, item: NpcShopItemState, active: boolean): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nameWrap = button.querySelector<HTMLElement>('[data-npc-shop-item-name-wrap="true"]');
    const nameText = button.querySelector<HTMLElement>('[data-npc-shop-item-tooltip]');
    const ownedNode = button.querySelector<HTMLElement>('[data-npc-shop-owned="true"]');
    const ribbonNode = button.querySelector<HTMLElement>('[data-npc-shop-status-ribbon="true"]');
    const priceNode = button.querySelector<HTMLElement>('[data-npc-shop-price="true"]');
    const stockNode = button.querySelector<HTMLElement>('[data-npc-shop-stock="true"]');
    if (!nameWrap || !nameText || !ownedNode || !ribbonNode || !priceNode || !stockNode) {
      return false;
    }

    const ownedCount = this.findInventoryItemCount(item.itemId);
    const status = this.getItemStatusState(item.item);
    const stockLabel = item.remainingQuantity === undefined
      ? getItemTypeLabel(item.item.type)
      : item.remainingQuantity > 0
        ? `${getItemTypeLabel(item.item.type)} · 余 ${formatDisplayInteger(item.remainingQuantity)}${item.stockLimit ? `/${formatDisplayInteger(item.stockLimit)}` : ''}`
        : `${getItemTypeLabel(item.item.type)} · 已售罄`;

    button.dataset.npcShopSelectItem = item.itemId;
    button.classList.toggle('active', active);
    button.classList.toggle('market-item-cell--status', status !== null);
    button.classList.toggle('market-item-cell--status-learned', status?.kind === 'learned');
    button.classList.toggle('market-item-cell--status-unlocked', status?.kind === 'unlocked');
    nameWrap.title = item.item.name;
    nameText.textContent = item.item.name;
    nameText.dataset.npcShopItemTooltip = item.itemId;
    ownedNode.textContent = ownedCount > 0 ? formatDisplayCountBadge(ownedCount) : '';
    ownedNode.classList.toggle('hidden', ownedCount <= 0);
    patchElementHtml(ribbonNode, status ? `<span>${escapeHtml(status.label)}</span>` : '');
    ribbonNode.classList.toggle('hidden', status === null);
    priceNode.textContent = `售价 ${formatDisplayInteger(item.unitPrice)}`;
    stockNode.textContent = stockLabel;
    return true;
  }

  /** getItemStatusState：读取已学/已阅状态。 */
  private getItemStatusState(item: ItemStack): { label: string; kind: 'learned' | 'unlocked' } | null {
    if (item.type === 'skill_book') {
      const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
      if (techniqueId && this.player?.techniques.some((technique) => technique.techId === techniqueId)) {
        return { label: '已学', kind: 'learned' };
      }
    }
    const mapIds = item.mapUnlockIds && item.mapUnlockIds.length > 0
      ? item.mapUnlockIds
      : item.mapUnlockId
        ? [item.mapUnlockId]
        : [];
    const unlockedMinimapIds = new Set(this.player?.unlockedMinimapIds ?? []);
    if (mapIds.length > 0 && mapIds.every((mapId) => unlockedMinimapIds.has(mapId))) {
      return { label: '已阅', kind: 'unlocked' };
    }
    return null;
  }

  /** syncToolbarMeta：同步列表顶部摘要。 */
  private syncToolbarMeta(toolbarMeta: HTMLElement, shop: NpcShopState): void {
    const ownedCurrency = this.findInventoryItemCount(shop.currencyItemId);
    toolbarMeta.textContent = `共 ${formatDisplayInteger(shop.items.length)} 件，持有 ${shop.currencyItemName} ${formatDisplayInteger(ownedCurrency)}`;
  }

  /** syncShopList：同步商品列表，优先复用已有节点。 */
  private syncShopList(listRoot: HTMLElement, shop: NpcShopState, selectedItem: NpcShopItemState): boolean {
    const existingCards = new Map<string, HTMLButtonElement>();
    listRoot.querySelectorAll<HTMLButtonElement>('[data-npc-shop-select-item]').forEach((card) => {
      const itemId = card.dataset.npcShopSelectItem;
      if (itemId) {
        existingCards.set(itemId, card);
      }
    });

    const orderedCards = shop.items.map((item) => {
      const card = existingCards.get(item.itemId) ?? this.createListItem();
      this.patchListItem(card, item, item.itemId === selectedItem.itemId);
      existingCards.delete(item.itemId);
      return card;
    });
    existingCards.forEach((card) => card.remove());
    this.syncContainerChildren(listRoot, orderedCards);
    return true;
  }

  /** syncDetailPanel：刷新右侧详情区。 */
  private syncDetailPanel(detailRoot: HTMLElement, shop: NpcShopState, selectedItem: NpcShopItemState): void {
    patchElementHtml(detailRoot, this.renderDetailPanel(shop, selectedItem));
  }

  /** syncContainerChildren：按目标顺序复用并重排子节点。 */
  private syncContainerChildren(container: HTMLElement, orderedNodes: HTMLElement[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const allowed = new Set(orderedNodes);
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || !allowed.has(child)) {
        child.remove();
      }
    }

    let reference: ChildNode | null = container.firstChild;
    for (const node of orderedNodes) {
      if (reference !== node) {
        container.insertBefore(node, reference);
      }
      reference = node.nextSibling;
    }
  }  
  /**
 * renderDetailPanel：执行详情面板相关逻辑。
 * @param shop NpcShopState 参数说明。
 * @param selectedItem NpcShopItemState 参数说明。
 * @returns 返回详情面板。
 */


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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  private bindEvents(body: HTMLElement, signal: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    body.addEventListener('click', (event) => this.handleBodyClick(event), { signal });
    body.addEventListener('input', (event) => this.handleBodyInput(event), { signal });
  }

  /** handleBodyClick：处理身体Click。 */
  private handleBodyClick(event: Event): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    this.openBuyConfirm(npcId, itemId, quantity);
  }

  /** openBuyConfirm：打开购买二次确认。 */
  private openBuyConfirm(npcId: string, itemId: string, quantity: number): void {
    const shop = this.shopState?.shop ?? null;
    const entry = shop?.items.find((item) => item.itemId === itemId) ?? null;
    if (!shop || !entry) {
      return;
    }
    const totalCost = quantity * entry.unitPrice;
    this.buyConfirmState = { npcId, itemId, quantity };
    confirmModalHost.open({
      ownerId: NpcShopModal.CONFIRM_MODAL_OWNER,
      title: '确认购买',
      subtitle: shop.npcName,
      bodyHtml: `
        <div class="confirm-modal-line"><span>物品</span><strong>${escapeHtml(entry.item.name)}</strong></div>
        <div class="confirm-modal-line"><span>数量</span><strong>${formatDisplayInteger(quantity)}</strong></div>
        <div class="confirm-modal-line"><span>单价</span><strong>${formatDisplayInteger(entry.unitPrice)} ${escapeHtml(shop.currencyItemName)}</strong></div>
        <div class="confirm-modal-line"><span>总额</span><strong>${formatDisplayInteger(totalCost)} ${escapeHtml(shop.currencyItemName)}</strong></div>
      `,
      confirmLabel: '确认购买',
      confirmButtonClass: 'danger',
      onConfirm: () => {
        const latest = this.buyConfirmState;
        this.buyConfirmState = null;
        if (!latest) {
          return;
        }
        this.callbacks?.onBuyItem(latest.npcId, latest.itemId, latest.quantity);
      },
      onClose: () => {
        this.buyConfirmState = null;
      },
    });
  }

  /** handleBodyInput：处理身体输入。 */
  private handleBodyInput(event: Event): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      subtitle: shop?.dialogue ?? '货品查探中...',
    };
  }

  /** patchBody：处理patch身体。 */
  private patchBody(body: HTMLElement, meta: NpcShopModalMeta): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    detailModalHost.patch({
      ownerId: NpcShopModal.MODAL_OWNER,
      title: meta.title,
      subtitle: meta.subtitle,
    });
    this.syncToolbarMeta(toolbarMeta, shop);
    this.syncShopList(listRoot, shop, selectedItem);
    this.syncDetailPanel(detailRoot, shop, selectedItem);
    return true;
  }

  /** captureRenderState：记录当前滚动和数量输入焦点。 */
  private captureRenderState(body: HTMLElement): NpcShopRenderState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement && body.contains(activeElement)) {
      return {
        listScrollTop: body.querySelector<HTMLElement>('[data-npc-shop-list="true"]')?.scrollTop ?? 0,
        detailScrollTop: body.querySelector<HTMLElement>('[data-npc-shop-detail="true"]')?.scrollTop ?? 0,
        focusedQuantityItemId: activeElement.dataset.npcShopQuantity ?? null,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      };
    }
    return {
      listScrollTop: body.querySelector<HTMLElement>('[data-npc-shop-list="true"]')?.scrollTop ?? 0,
      detailScrollTop: body.querySelector<HTMLElement>('[data-npc-shop-detail="true"]')?.scrollTop ?? 0,
      focusedQuantityItemId: null,
      selectionStart: null,
      selectionEnd: null,
    };
  }

  /** restoreRenderState：恢复滚动和数量输入焦点。 */
  private restoreRenderState(body: HTMLElement, state: NpcShopRenderState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const listRoot = body.querySelector<HTMLElement>('[data-npc-shop-list="true"]');
    const detailRoot = body.querySelector<HTMLElement>('[data-npc-shop-detail="true"]');
    if (listRoot) {
      listRoot.scrollTop = state.listScrollTop;
    }
    if (detailRoot) {
      detailRoot.scrollTop = state.detailScrollTop;
    }
    if (!state.focusedQuantityItemId) {
      return;
    }
    const input = body.querySelector<HTMLInputElement>(`[data-npc-shop-quantity="${state.focusedQuantityItemId}"]`);
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    if (state.selectionStart !== null && state.selectionEnd !== null) {
      input.setSelectionRange(state.selectionStart, state.selectionEnd);
    }
  }

  /** syncPurchaseState：同步Purchase状态。 */
  private syncPurchaseState(root: ParentNode, itemId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  private bindItemTooltipEvents(body: HTMLElement, signal: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tapMode = prefersPinnedTooltipInteraction();
    const resolveTooltip = (node: HTMLElement) => {
      const shop = this.shopState?.shop;
      const itemId = node.dataset.npcShopItemTooltip;
      const entry = itemId ? shop?.items.find((item) => item.itemId === itemId) ?? null : null;
      return entry ? buildItemTooltipPayload(entry.item) : null;
    };

    body.addEventListener('click', (event) => {
      if (!tapMode || !(event instanceof PointerEvent)) {
        return;
      }
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-npc-shop-item-tooltip]')
        : null;
      if (!node || !body.contains(node)) {
        return;
      }
      const tooltip = resolveTooltip(node);
      if (!tooltip) {
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
    }, { capture: true, signal });

    body.addEventListener('pointermove', (event) => {
      if (!(event instanceof PointerEvent) || (tapMode && this.tooltip.isPinned())) {
        return;
      }
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-npc-shop-item-tooltip]')
        : null;
      if (!node || !body.contains(node)) {
        return;
      }
      const tooltip = resolveTooltip(node);
      if (!tooltip) {
        return;
      }
      if (this.tooltipNode !== node) {
        this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        this.tooltipNode = node;
        return;
      }
      this.tooltip.move(event.clientX, event.clientY);
    }, { signal });

    body.addEventListener('pointerout', (event) => {
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-npc-shop-item-tooltip]')
        : null;
      if (!node || !body.contains(node) || this.tooltip.isPinnedTo(node)) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && node.contains(relatedTarget)) {
        return;
      }
      if (this.tooltipNode === node) {
        this.tooltipNode = null;
        this.tooltip.hide();
      }
    }, { signal });
  }

  /** findInventoryItemCount：查找背包物品数量。 */
  private findInventoryItemCount(itemId: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return getPlayerOwnedItemCount(this.player, this.inventory, itemId);
  }
}

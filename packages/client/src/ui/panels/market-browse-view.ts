/**
 * 本文件是客户端 DOM UI 的 market browse view 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import type { MarketListedItemView, MarketOrderBookView, MarketOwnOrderView, MarketStorage, S2C_MarketUpdate } from '@mud/shared';
import { COMBAT_EQUIP_SLOTS, ITEM_TYPES, MARKET_MAX_ENHANCE_LEVEL, TECHNIQUE_EQUIP_SLOTS, createItemStackSignature } from '@mud/shared';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueCategoryLabel } from '../../domain-labels';
import { t } from '../i18n';
import type {
  MarketPanelInternals,
  MarketCategoryFilter,
  MarketEquipmentFilter,
  MarketTechniqueFilter,
  MarketListingGroupView,
  MarketTradeDialogKind,
} from './market-panel-types';
import type { TechniqueCategory } from '@mud/shared';

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

function isTechniqueEquipmentSlot(slot: unknown): boolean {
  return typeof slot === 'string' && (TECHNIQUE_EQUIP_SLOTS as readonly string[]).includes(slot);
}

const MARKET_TECHNIQUE_FILTERS: Array<{ id: MarketTechniqueFilter; label: string }> = [
  { id: 'all', label: t('market.filter.technique-all', undefined) },
  { id: 'arts', label: getTechniqueCategoryLabel('arts') },
  { id: 'internal', label: getTechniqueCategoryLabel('internal') },
  { id: 'divine', label: getTechniqueCategoryLabel('divine') },
  { id: 'secret', label: getTechniqueCategoryLabel('secret') },
];

/**
 * 市场浏览子视图：物品列表、分组、筛选和分页。
 */
export class MarketBrowseView {
  constructor(private readonly panel: MarketPanelInternals) {}

  renderMarketTab(update: S2C_MarketUpdate): string {
    const p = this.panel;
    const listedItems = p.getVisibleListedItems(update);
    if (listedItems.length === 0) {
      return `<div class="empty-hint">${escapeHtml(t('market.empty.category', undefined))}</div>`;
    }
    const groups = this.getVisibleListingGroups(update);
    const pagination = this.getPaginationState(groups);
    const selectedGroup = pagination.items.find((item) => item.itemId === p.selectedGroupItemId) ?? pagination.items[0] ?? null;
    const browsingEnhancementVariants = Boolean(selectedGroup?.canEnhance && p.enhancementBrowseItemId === selectedGroup.itemId);
    const selectedItem = browsingEnhancementVariants
      ? selectedGroup?.variants.find((item) => item.itemKey === p.selectedItemKey) ?? null
      : selectedGroup?.canEnhance
        ? null
        : selectedGroup?.variants[0] ?? null;
    const cards = browsingEnhancementVariants
      ? (selectedGroup?.variants ?? []).map((entry) => this.renderListedItem(entry, selectedItem?.itemKey ?? '', selectedGroup?.itemId ?? '')).join('')
      : pagination.items.map((entry) => this.renderGroupItem(entry, selectedGroup?.itemId ?? '')).join('');
    const orderBook = selectedItem && p.itemBook && p.itemBook.itemKey === selectedItem.itemKey ? p.itemBook : null;
    const categoryTabs = this.renderCategoryTabs(update);
    const subcategoryTabs = p.activeCategory === 'equipment'
      ? this.renderEquipmentTabs(update)
      : p.activeCategory === 'skill_book'
        ? this.renderTechniqueTabs(update)
        : '';
    const compactList = p.hasCompactCategoryLayout();
    const listToolbar = browsingEnhancementVariants && selectedGroup
      ? this.renderVariantToolbar(selectedGroup, selectedGroup.variants.length)
      : this.renderListToolbar(pagination.page, pagination.totalPages, pagination.totalItems);
    return `
      <div class="market-market-tab">
        <div class="market-category-tabs">${categoryTabs}</div>
        ${subcategoryTabs ? `<div class="market-category-tabs market-category-tabs--sub">${subcategoryTabs}</div>` : ''}
        <div class="market-board">
          <div class="market-board-list-wrap ui-surface-pane ui-surface-pane--stack">
            ${listToolbar}
            <div class="market-board-list ${compactList ? 'market-board-list--compact' : ''}">${cards}</div>
          </div>
          <div class="market-book-panel ui-surface-pane ui-surface-pane--stack">
            ${selectedItem
              ? this.renderBookPanel(selectedItem, orderBook, update.currencyItemName)
              : this.renderMarketBrowsePlaceholder(selectedGroup, browsingEnhancementVariants)}
          </div>
        </div>
      </div>
    `;
  }

  renderListedItem(entry: MarketListedItemView, activeItemKey: string, groupItemId?: string): string {
    const p = this.panel;
    const ownedCount = p.findMatchingInventoryCount(entry.item);
    const status = p.getItemStatusState(entry.item);
    const ownedLabel = ownedCount > 0 ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>` : '';
    const itemName = p.getMarketDisplayName(entry.item);
    const statusClass = status ? ` market-item-cell--status market-item-cell--status-${status.kind}` : '';
    const statusRibbon = status ? `<span class="market-item-cell-ribbon" aria-hidden="true"><span>${escapeHtml(status.label)}</span></span>` : '';
    return `
      <button class="market-item-cell ui-surface-card ui-surface-card--compact ${entry.itemKey === activeItemKey ? 'active' : ''}${statusClass}" data-market-select-item="${escapeHtmlAttr(entry.itemKey)}" ${groupItemId ? `data-market-select-item-group="${escapeHtmlAttr(groupItemId)}"` : ''} data-market-item-tooltip="${escapeHtmlAttr(entry.itemKey)}" type="button">
        ${statusRibbon}
        <div class="market-item-cell-name">
          <span class="market-item-cell-name-text">${escapeHtml(itemName)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${entry.lowestSellPrice !== undefined ? p.formatMarketUnitPrice(entry.lowestSellPrice) : '--'}</span>
          <span>买 ${entry.highestBuyPrice !== undefined ? p.formatMarketUnitPrice(entry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  renderGroupItem(entry: MarketListingGroupView, activeItemId: string): string {
    const p = this.panel;
    const ownedCount = entry.canEnhance
      ? p.findEquipmentInventoryCountByLevel(entry.itemId, 0)
      : p.findInventoryItemCountByItemId(entry.itemId);
    const status = p.getItemStatusState(entry.item);
    const ownedLabel = ownedCount > 0 ? `<span class="market-item-cell-owned">${formatDisplayCountBadge(ownedCount)}</span>` : '';
    const referenceEntry = p.getGroupReferenceEntry(entry);
    const itemName = p.getMarketDisplayName(referenceEntry?.item ?? entry.item);
    const statusClass = status ? ` market-item-cell--status market-item-cell--status-${status.kind}` : '';
    const statusRibbon = status ? `<span class="market-item-cell-ribbon" aria-hidden="true"><span>${escapeHtml(status.label)}</span></span>` : '';
    return `
      <button class="market-item-cell ui-surface-card ui-surface-card--compact ${entry.itemId === activeItemId ? 'active' : ''}${statusClass}" data-market-select-group="${escapeHtmlAttr(entry.itemId)}" ${referenceEntry ? `data-market-item-tooltip="${escapeHtmlAttr(referenceEntry.itemKey)}"` : ''} type="button">
        ${statusRibbon}
        <div class="market-item-cell-name">
          <span class="market-item-cell-name-text">${escapeHtml(itemName)}</span>
          ${ownedLabel}
        </div>
        <div class="market-item-cell-prices">
          <span>卖 ${referenceEntry?.lowestSellPrice !== undefined ? p.formatMarketUnitPrice(referenceEntry.lowestSellPrice) : '--'}</span>
          <span>买 ${referenceEntry?.highestBuyPrice !== undefined ? p.formatMarketUnitPrice(referenceEntry.highestBuyPrice) : '--'}</span>
        </div>
      </button>
    `;
  }

  renderBookPanel(entry: MarketListedItemView, book: MarketOrderBookView | null, currencyName: string): string {
    const p = this.panel;
    const matchedInventoryCount = p.findMatchingInventoryCount(entry.item);
    const sellConflict = p.findConflictingOwnOrder(entry.itemKey, 'sell');
    const buyConflict = p.findConflictingOwnOrder(entry.itemKey, 'buy');
    const itemName = p.getMarketDisplayName(entry.item);
    const itemDesc = typeof entry.item.desc === 'string' ? entry.item.desc : '';
    const showOrderBook = book !== null || !p.itemBookLoading;
    return `
      <div class="market-book-header">
        <div>
          <div class="market-item-title market-item-title--interactive" data-market-item-tooltip="selected">${escapeHtml(itemName)}</div>
          <div class="market-book-subtitle">${escapeHtml(getItemTypeLabel(entry.item.type))}${itemDesc ? ` · ${escapeHtml(itemDesc)}` : ''}</div>
        </div>
      </div>
      <div class="market-book-columns">
        <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted ui-scroll-panel">
          <div class="market-book-column-head">
            <div class="market-book-column-title">${escapeHtml(t('market.book.column.sell', undefined))}</div>
            <button class="small-btn ghost" data-market-open-dialog="sell" type="button" ${(matchedInventoryCount > 0 && !sellConflict) ? '' : 'disabled'}>${escapeHtml(t('market.book.action.sell', undefined))}</button>
          </div>
          ${sellConflict ? `<div class="market-action-hint">${escapeHtml(t('market.trade.hint.conflict-sell', undefined))}</div>` : ''}
          ${showOrderBook
            ? this.renderPriceLevels(book?.sells ?? [], currencyName, t('market.book.empty.sell', undefined), { kind: 'buy', label: t('market.book.action.buy', undefined), confirmPurchase: true, disabled: Boolean(buyConflict) })
            : `<div class="empty-hint">${escapeHtml(t('market.book.loading.sell', undefined))}</div>`}
        </div>
        <div class="market-book-column ui-surface-pane ui-surface-pane--stack ui-surface-pane--muted ui-scroll-panel">
          <div class="market-book-column-head">
            <div class="market-book-column-title">${escapeHtml(t('market.book.column.buy', undefined))}</div>
            <button class="small-btn ghost" data-market-open-dialog="buy" type="button" ${buyConflict ? 'disabled' : ''}>${escapeHtml(t('market.book.action.buy-request', undefined))}</button>
          </div>
          ${buyConflict ? `<div class="market-action-hint">${escapeHtml(t('market.trade.hint.conflict-buy', undefined))}</div>` : ''}
          ${showOrderBook
            ? this.renderPriceLevels(book?.buys ?? [], currencyName, t('market.book.empty.buy', undefined), { kind: 'sell', label: t('market.book.action.sell-request', undefined), disabled: matchedInventoryCount <= 0 || Boolean(sellConflict) })
            : `<div class="empty-hint">${escapeHtml(t('market.book.loading.buy', undefined))}</div>`}
        </div>
      </div>
    `;
  }

  renderMarketBrowsePlaceholder(group: MarketListingGroupView | null, browsingEnhancementVariants: boolean): string {
    const p = this.panel;
    if (!group) return `<div class="empty-hint">${escapeHtml(t('market.empty.select-item', undefined))}</div>`;
    const referenceEntry = p.getGroupReferenceEntry(group);
    const titleClass = `market-item-title${referenceEntry ? ' market-item-title--interactive' : ''}`;
    const titleTooltipAttr = referenceEntry ? ` data-market-item-tooltip="${escapeHtmlAttr(referenceEntry.itemKey)}"` : '';
    const itemName = p.getMarketDisplayName(referenceEntry?.item ?? group.item);
    if (browsingEnhancementVariants) {
      return `
        <div class="market-book-header"><div><div class="${titleClass}"${titleTooltipAttr}>${escapeHtml(itemName)}</div><div class="market-book-subtitle">${escapeHtml(t('market.book.subtitle.enhance-select', undefined))}</div></div></div>
        <div class="empty-hint">${escapeHtml(t('market.book.empty.enhance-level', undefined))}</div>
      `;
    }
    return `
      <div class="market-book-header"><div><div class="${titleClass}"${titleTooltipAttr}>${escapeHtml(itemName)}</div><div class="market-book-subtitle">${escapeHtml(t('market.book.subtitle.group', { typeLabel: getItemTypeLabel(group.item.type) }))}</div></div></div>
      <div class="empty-hint">${group.canEnhance ? escapeHtml(t('market.book.group.hint.enhance', undefined)) : escapeHtml(t('market.book.group.hint.normal', undefined))}</div>
    `;
  }

  renderPriceLevels(
    levels: MarketOrderBookView['sells'],
    currencyName: string,
    emptyText: string,
    quickAction?: { kind: MarketTradeDialogKind; label: string; disabled?: boolean; confirmPurchase?: boolean },
  ): string {
    const p = this.panel;
    if (levels.length === 0) return `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    return levels.map((level, index) => `
      <div class="market-book-level ui-surface-card ui-surface-card--compact">
        <div class="market-book-level-main">
          <span class="market-book-level-price">${p.formatMarketUnitPrice(level.unitPrice)} ${escapeHtml(currencyName)}</span>
          <span class="market-book-level-qty">总量 ${formatDisplayCountBadge(level.quantity)}</span>
        </div>
        ${quickAction && index === 0
          ? `<button class="small-btn ghost market-book-level-action" data-market-open-dialog="${quickAction.kind}" data-market-open-dialog-price="${level.unitPrice}" data-market-open-dialog-confirm-purchase="${quickAction.confirmPurchase ? 'true' : 'false'}" type="button" ${quickAction.disabled ? 'disabled' : ''}>${quickAction.label}</button>`
          : ''}
      </div>
    `).join('');
  }

  renderMyOrdersTab(update: S2C_MarketUpdate): string {
    const buyOrders = update.myOrders.filter((order) => order.side === 'buy');
    const sellOrders = update.myOrders.filter((order) => order.side === 'sell');
    const storage = update.storage;
    return `
      <div class="market-my-orders">
        <div class="market-my-orders-grid">
          <div class="market-my-orders-column ui-surface-pane ui-surface-pane--stack">
            <div class="panel-section-title">${escapeHtml(t('market.my-orders.buy', undefined))}</div>
            ${buyOrders.length > 0 ? buyOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : `<div class="empty-hint">${escapeHtml(t('market.my-orders.empty.buy', undefined))}</div>`}
          </div>
          <div class="market-my-orders-column ui-surface-pane ui-surface-pane--stack">
            <div class="panel-section-title">${escapeHtml(t('market.my-orders.sell', undefined))}</div>
            ${sellOrders.length > 0 ? sellOrders.map((order) => this.renderOwnOrder(order, update.currencyItemName)).join('') : `<div class="empty-hint">${escapeHtml(t('market.my-orders.empty.sell', undefined))}</div>`}
          </div>
        </div>
        <div class="market-storage-card ui-surface-pane ui-surface-pane--stack">
          <div class="market-storage-head">
            <div class="panel-section-title">${escapeHtml(t('market.storage.title', undefined))}</div>
            <button class="small-btn" data-market-claim-storage type="button" ${storage.items.length > 0 ? '' : 'disabled'}>${escapeHtml(t('market.storage.claim-all', undefined))}</button>
          </div>
          ${this.renderStorage(storage)}
        </div>
      </div>
    `;
  }

  renderTradeHistoryTab(currencyName: string): string {
    const p = this.panel;
    const history = p.tradeHistory;
    if (p.tradeHistoryLoading && !history) return `<div class="empty-hint">${escapeHtml(t('market.history.loading', undefined))}</div>`;
    const records = history?.records ?? [];
    const page = history?.page ?? p.tradeHistoryPage;
    const pageSize = history?.pageSize ?? 10;
    const totalVisible = history?.totalVisible ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalVisible / Math.max(1, pageSize)));
    return `
      <div class="market-trade-history">
        <div class="market-list-toolbar ui-action-row">
          <div class="market-list-toolbar-meta">仅显示最近 ${formatDisplayInteger(Math.min(100, totalVisible))} 条中的第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页</div>
          <div class="market-list-toolbar-actions">
            <button class="small-btn ghost" data-market-history-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <button class="small-btn ghost" data-market-history-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
          </div>
        </div>
        <div class="market-trade-history-hint">只显示你自己的成交记录，不显示交易双方。</div>
        <div class="market-trade-history-list ui-surface-pane ui-surface-pane--stack ui-scroll-panel">
          ${records.length > 0
            ? records.map((record) => `
              <div class="market-trade-history-item ui-surface-card ui-surface-card--compact">
                <div class="market-trade-history-head">
                  <span class="market-order-name">${escapeHtml(record.itemName)}</span>
                  <span class="market-order-side ${record.side === 'buy' ? 'buy' : 'sell'}">${escapeHtml(record.side === 'buy' ? t('market.history.side.buy', undefined) : t('market.history.side.sell', undefined))}</span>
                </div>
                <div class="market-order-meta">数量 ${formatDisplayCountBadge(record.quantity)} · 单价 ${p.formatMarketUnitPrice(record.unitPrice)} ${escapeHtml(currencyName)}</div>
              </div>
            `).join('')
            : `<div class="empty-hint">${escapeHtml(p.tradeHistoryLoading ? t('market.history.loading', undefined) : t('market.history.empty', undefined))}</div>`}
        </div>
      </div>
    `;
  }

  renderOwnOrder(order: MarketOwnOrderView, currencyName: string): string {
    const p = this.panel;
    return `
      <div class="market-order-card ui-surface-card ui-surface-card--compact">
        <div class="market-order-card-head">
          <span class="market-order-name">${escapeHtml(p.getMarketDisplayName(order.item))}</span>
          <span class="market-order-side ${order.side === 'buy' ? 'buy' : 'sell'}">${escapeHtml(order.side === 'buy' ? t('market.order.side.buy', undefined) : t('market.order.side.sell', undefined))}</span>
        </div>
        <div class="market-order-meta">剩余 ${formatDisplayCountBadge(order.remainingQuantity)} · 单价 ${p.formatMarketUnitPrice(order.unitPrice)} ${escapeHtml(currencyName)}</div>
        <button class="small-btn ghost" data-market-cancel-order="${order.id}" type="button">${escapeHtml(t('market.order.cancel', undefined))}</button>
      </div>
    `;
  }

  renderStorage(storage: MarketStorage): string {
    const p = this.panel;
    if (storage.items.length === 0) return `<div class="empty-hint">${escapeHtml(t('market.storage.empty', undefined))}</div>`;
    return `
      <div class="market-storage-list">
        ${storage.items.map((item) => `
          <div class="market-storage-item ui-surface-card ui-surface-card--compact">
            <span>${escapeHtml(p.getMarketDisplayName(item))}</span>
            <span>${formatDisplayCountBadge(item.count)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderListToolbar(page: number, totalPages: number, totalItems: number): string {
    return `
      <div class="market-list-toolbar ui-action-row">
        <div class="market-list-toolbar-meta">共 ${formatDisplayInteger(totalItems)} 件，第 ${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)} 页</div>
        <div class="market-list-toolbar-actions">
          <button class="small-btn ghost" data-market-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
          <button class="small-btn ghost" data-market-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      </div>
    `;
  }

  renderVariantToolbar(group: MarketListingGroupView, totalVariants: number): string {
    const itemName = this.panel.getMarketDisplayName(group.item);
    return `
      <div class="market-list-toolbar ui-action-row">
        <div class="market-list-toolbar-meta">${escapeHtml(itemName)} · 共 ${formatDisplayInteger(totalVariants)} 个强化等级</div>
        <div class="market-list-toolbar-actions">
          <button class="small-btn ghost" data-market-back-to-groups type="button">返回物品列表</button>
        </div>
      </div>
    `;
  }

  getVisibleListingGroups(update: S2C_MarketUpdate | null): MarketListingGroupView[] {
    const p = this.panel;
    const items = p.getVisibleListedItems(update);
    const groups = new Map<string, MarketListingGroupView>();
    const orderedItemIds: string[] = [];
    for (const entry of items) {
      const existing = groups.get(entry.item.itemId);
      if (existing) { existing.variants.push(entry); continue; }
      orderedItemIds.push(entry.item.itemId);
      groups.set(entry.item.itemId, { itemId: entry.item.itemId, item: { ...entry.item }, canEnhance: entry.item.type === 'equipment', variants: [entry] });
    }
    return orderedItemIds.map((itemId) => {
      const group = groups.get(itemId)!;
      if (group.canEnhance) {
        const variantsByLevel = new Map<number, MarketListedItemView>();
        for (const entry of group.variants) {
          const level = p.getMarketEnhanceLevel(entry.item);
          if (level < 0 || level > MARKET_MAX_ENHANCE_LEVEL) continue;
          variantsByLevel.set(level, entry);
        }
        const filledVariants: MarketListedItemView[] = [];
        for (let level = 0; level <= MARKET_MAX_ENHANCE_LEVEL; level += 1) {
          const existing = variantsByLevel.get(level);
          if (existing) { filledVariants.push(existing); continue; }
          const item = p.buildLocalMarketItem(group.itemId, 1, level);
          filledVariants.push({ itemKey: createItemStackSignature({ ...item, count: 1 }), item, sellOrderCount: 0, sellQuantity: 0, lowestSellPrice: undefined, buyOrderCount: 0, buyQuantity: 0, highestBuyPrice: undefined });
        }
        group.variants = filledVariants;
      } else {
        group.variants.sort((left, right) => {
          const leftLevel = p.getMarketEnhanceLevel(left.item);
          const rightLevel = p.getMarketEnhanceLevel(right.item);
          if (leftLevel !== rightLevel) return leftLevel - rightLevel;
          return left.itemKey.localeCompare(right.itemKey);
        });
      }
      const referenceEntry = p.getGroupReferenceEntry(group);
      if (referenceEntry) group.item = { ...referenceEntry.item };
      return group;
    });
  }

  renderCategoryTabs(update: S2C_MarketUpdate): string {
    const p = this.panel;
    const listedItems = p.getKnownListedItems(update);
    const categories: Array<{ id: MarketCategoryFilter; label: string; count: number }> = [
      { id: 'all', label: t('market.filter.all', undefined), count: this.getMarketCategoryCount('all', listedItems.length) },
      ...ITEM_TYPES.map((type) => ({ id: type, label: getItemTypeLabel(type), count: this.getMarketCategoryCount(type, listedItems.filter((item) => item.item.type === type).length) })),
    ];
    return categories.map((category) => `
      <button class="market-category-tab ${p.activeCategory === category.id ? 'active' : ''}" data-market-category="${category.id}" type="button">${escapeHtml(category.label)}<span>${formatDisplayInteger(category.count)}</span></button>
    `).join('');
  }

  renderEquipmentTabs(update: S2C_MarketUpdate): string {
    const p = this.panel;
    const listedItems = p.getKnownListedItems(update);
    const categories: Array<{ id: MarketEquipmentFilter; label: string; count: number }> = [
      { id: 'all', label: t('market.filter.equipment-all', undefined), count: this.getMarketEquipmentSlotCount('all', listedItems.filter((item) => item.item.type === 'equipment').length) },
      ...COMBAT_EQUIP_SLOTS.map((slot) => ({ id: slot, label: getEquipSlotLabel(slot), count: this.getMarketEquipmentSlotCount(slot, listedItems.filter((item) => item.item.type === 'equipment' && item.item.equipSlot === slot).length) })),
      {
        id: 'technique',
        label: '技艺',
        count: this.getMarketEquipmentSlotCount('technique', listedItems.filter((item) => item.item.type === 'equipment' && isTechniqueEquipmentSlot(item.item.equipSlot)).length),
      },
    ];
    return categories.map((category) => `
      <button class="market-category-tab ${p.activeEquipmentCategory === category.id ? 'active' : ''}" data-market-equipment-category="${category.id}" type="button">${escapeHtml(category.label)}<span>${formatDisplayInteger(category.count)}</span></button>
    `).join('');
  }

  renderTechniqueTabs(update: S2C_MarketUpdate): string {
    const p = this.panel;
    const listedItems = p.getKnownListedItems(update);
    const categories = MARKET_TECHNIQUE_FILTERS.map((category) => ({
      ...category,
      count: this.getMarketTechniqueCategoryCount(category.id, listedItems.filter((item) => (
        item.item.type === 'skill_book' && (category.id === 'all' || p.resolveTechniqueCategoryForItem(item.item) === category.id)
      )).length),
    }));
    return categories.map((category) => `
      <button class="market-category-tab ${p.activeTechniqueCategory === category.id ? 'active' : ''}" data-market-technique-category="${category.id}" type="button">${escapeHtml(category.label)}<span>${formatDisplayInteger(category.count)}</span></button>
    `).join('');
  }

  private getMarketCategoryCount(category: MarketCategoryFilter, fallback: number): number {
    const value = this.panel.marketListings?.counts?.categoryCounts?.[category];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
  }

  private getMarketEquipmentSlotCount(slot: MarketEquipmentFilter, fallback: number): number {
    const value = this.panel.marketListings?.counts?.equipmentSlotCounts?.[slot];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
  }

  private getMarketTechniqueCategoryCount(category: MarketTechniqueFilter, fallback: number): number {
    const value = this.panel.marketListings?.counts?.techniqueCategoryCounts?.[category];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
  }

  private getPaginationState<T>(items: T[]): { page: number; totalPages: number; totalItems: number; items: T[] } {
    const p = this.panel;
    const totalItems = p.getVisibleMarketTotalItems(p.marketUpdate, items);
    const pageSize = p.marketListings?.pageSize ?? p.getMarketPageSize();
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = p.marketListings?.page ?? p.clampPage(p.currentPage, totalItems);
    return { page, totalPages, totalItems, items };
  }
}

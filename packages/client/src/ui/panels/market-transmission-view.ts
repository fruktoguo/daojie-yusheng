/**
 * 本文件是客户端 DOM UI 的传法台子视图，负责残卷浏览、详情与独立上架界面。
 *
 * 交易合法性和资产变更仍由服务端裁定；客户端只维护筛选、选中和价格草稿。
 */
import type {
  ItemStack,
  S2C_TransmissionListings,
  TechniqueCategory,
  TechniqueGrade,
  TransmissionListingSort,
  TransmissionLotPageEntry,
} from '@mud/shared';
import {
  CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
  MARKET_PRICE_PRESET_VALUES,
  TECHNIQUE_GRADE_ORDER,
} from '@mud/shared';
import { contentResolver } from '../../content/content-resolver';
import { getLocalRealmLevelEntry, getLocalTechniqueTemplate } from '../../content/local-templates';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../../domain-labels';
import { formatDisplayInteger } from '../../utils/number';
import { detailModalHost } from '../detail-modal-host';
import { getItemDecorClassName, getItemDisplayMeta } from '../item-display';
import { t } from '../i18n';
import { renderTradePriceStepControl } from '../trade-control-renderers';
import type {
  MarketPanelInternals,
  MarketPriceAction,
  TransmissionCategoryFilter,
  TransmissionConsignSort,
  TransmissionLotView,
  TransmissionPanelTab,
} from './market-panel-types';

const TRANSMISSION_MODAL_OWNER = 'transmission-platform-panel';
const TRANSMISSION_PAGE_SIZE = 10;
const TRANSMISSION_SEARCH_DEBOUNCE_MS = 220;
const TRANSMISSION_PRICE_PRESETS = MARKET_PRICE_PRESET_VALUES.filter((value) => value >= 1);
const TRANSMISSION_CATEGORIES: TechniqueCategory[] = ['arts', 'internal', 'divine', 'secret'];

const TRANSMISSION_SORTS: Array<{ id: TransmissionListingSort; labelKey: string }> = [
  { id: 'price_asc', labelKey: 'market.transmission.sort.price-asc' },
  { id: 'price_desc', labelKey: 'market.transmission.sort.price-desc' },
  { id: 'realm_desc', labelKey: 'market.transmission.sort.realm-desc' },
  { id: 'grade_desc', labelKey: 'market.transmission.sort.grade-desc' },
  { id: 'newest', labelKey: 'market.transmission.sort.newest' },
];

const TRANSMISSION_CONSIGN_SORTS: Array<{ id: TransmissionConsignSort; labelKey: string }> = [
  { id: 'realm_desc', labelKey: 'market.transmission.sort.realm-desc' },
  { id: 'grade_desc', labelKey: 'market.transmission.sort.grade-desc' },
  { id: 'name_asc', labelKey: 'market.transmission.sort.name-asc' },
];

type TransmissionConsignItemView = {
  itemInstanceId: string;
  item: ItemStack;
  techniqueId: string;
  name: string;
  category: TechniqueCategory | null;
  categoryLabel: string;
  grade: TechniqueGrade | null;
  gradeLabel: string;
  realmLevel: number;
  realmLabel: string;
};

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

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function createButtonFromHtml(html: string): HTMLButtonElement | null {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild;
  return element instanceof HTMLButtonElement ? element : null;
}

function normalizeInventoryItemInstanceId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function formatTechniqueName(value: unknown): string {
  const name = String(value ?? '').trim();
  if (!name) return t('market.transmission.unknown-technique', undefined);
  return name.startsWith('《') && name.endsWith('》') ? name : `《${name}》`;
}

function getTechniqueInitial(value: string): string {
  return value.replace(/[《》]/g, '').trim().slice(0, 1) || '法';
}

/** 传法台子视图。 */
export class MarketTransmissionView {
  private inlineConsignEvents: AbortController | null = null;
  private searchTimer: ReturnType<typeof window.setTimeout> | null = null;
  /** 上架选择器当前已投影的残卷语义；玩家每息同步但背包未变时保持零 DOM 写入。 */
  private transmissionConsignProjectionSignature: string | null = null;

  constructor(private readonly panel: MarketPanelInternals) {}

  static get modalOwner(): string {
    return TRANSMISSION_MODAL_OWNER;
  }

  openTransmissionModal(tab: TransmissionPanelTab = this.panel.transmissionTab): void {
    const p = this.panel;
    p.transmissionTab = tab;
    p.transmissionPage = p.transmissionListings?.tab === tab ? p.transmissionPage : 1;
    p.requestTransmissionListings(p.transmissionPage);
    this.renderTransmissionModal();
  }

  renderTransmissionModal(): void {
    detailModalHost.open(this.buildTransmissionModalOptions());
  }

  /**
   * 服务端分页回包只更新稳定壳体内的列表、计数和详情。
   * 只有加载态首次切到完整壳体时才允许宿主重建 body。
   */
  patchTransmissionListingsState(): void {
    const body = this.panel.getOpenTransmissionModalBody();
    const listings = this.panel.transmissionListings;
    if (!body || !listings) return;
    const shell = body.querySelector<HTMLElement>('[data-transmission-shell]');
    if (!shell) {
      detailModalHost.patch(this.buildTransmissionModalOptions());
      return;
    }
    const lots = this.getLots();
    const currentKey = this.panel.selectedTransmissionItemKey;
    const activeKey = currentKey && lots.some((lot) => lot.itemKey === currentKey)
      ? currentKey
      : lots[0]?.itemKey ?? '';
    this.panel.selectedTransmissionItemKey = activeKey || null;
    this.patchTransmissionTabs(body, listings);
    this.patchTransmissionSummary(body, listings);
    this.patchTransmissionFilters(body, listings);
    this.patchTransmissionList(body, listings, lots, activeKey);
    this.patchTransmissionDetail(body, listings, lots, activeKey);
    this.patchTransmissionInventoryState();
    this.preloadTechniqueTemplates();
  }

  /** 玩家上下文或钱包变化只更新主界面的资产节点，不触碰上架选择器。 */
  patchTransmissionInventoryState(): void {
    const body = this.panel.getOpenTransmissionModalBody();
    if (!body) return;
    const listings = this.panel.transmissionListings;
    const ownedCurrency = listings
      ? this.panel.findInventoryItemCountByItemId(listings.currencyItemId)
      : 0;
    body.querySelectorAll<HTMLElement>('[data-transmission-owned-currency]').forEach((node) => {
      node.textContent = formatDisplayInteger(ownedCurrency);
    });
    const lots = this.getLots();
    const selected = lots.find((lot) => lot.itemKey === this.panel.selectedTransmissionItemKey)
      ?? lots[0]
      ?? null;
    const buyButton = body.querySelector<HTMLButtonElement>('[data-transmission-action="buy"]');
    if (buyButton) {
      buyButton.disabled = !selected || selected.isMine || ownedCurrency < selected.price;
    }
  }

  /** 背包真实变化时才局部同步上架选择器；重复快照保持零 DOM 写入。 */
  patchTransmissionConsignInventoryState(): void {
    if (!this.panel.transmissionConsignPanel.open) return;
    const allItems = this.getTransmissionConsignItems();
    const nextSignature = this.buildTransmissionConsignProjectionSignature(allItems);
    if (nextSignature === this.transmissionConsignProjectionSignature) return;
    this.transmissionConsignProjectionSignature = nextSignature;
    this.patchTransmissionConsignItems(allItems);
  }

  private buildTransmissionModalOptions() {
    return {
      ownerId: TRANSMISSION_MODAL_OWNER,
      size: 'full' as const,
      variantClass: 'detail-modal--market detail-modal--auction-house detail-modal--transmission',
      title: t('market.tab.transmission', undefined),
      hint: '',
      renderBody: (body: HTMLElement) => {
        replaceElementHtml(body, this.renderTransmissionBody());
      },
      onClose: () => {
        if (this.searchTimer !== null) {
          window.clearTimeout(this.searchTimer);
          this.searchTimer = null;
        }
        this.inlineConsignEvents?.abort();
        this.inlineConsignEvents = null;
        this.transmissionConsignProjectionSignature = null;
        this.panel.transmissionConsignPanel = {
          ...this.panel.transmissionConsignPanel,
          open: false,
        };
        this.panel.tooltipNode = null;
        this.panel.tooltip.hide(true);
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        this.bindTransmissionEvents(body, signal);
        this.panel.bindMarketModalDelegatedEvents(body, signal);
        this.preloadTechniqueTemplates();
        if (this.panel.transmissionConsignPanel.open) {
          const layer = body.querySelector<HTMLElement>('[data-transmission-consign-inline-layer]');
          if (layer) {
            this.bindInlineTransmissionConsignLayer(layer);
            this.captureTransmissionConsignProjectionSignature();
          }
        }
      },
    };
  }

  /**
   * 自创功法模板按当前可见拍品和可上架残卷去重补齐；模板回来后只更新受影响区域。
   */
  private preloadTechniqueTemplates(): void {
    const missing = new Set<string>();
    for (const lot of this.getLots()) {
      if (lot.techniqueId && !getLocalTechniqueTemplate(lot.techniqueId)) {
        missing.add(lot.techniqueId);
      }
    }
    for (const entry of this.getTransmissionConsignItems()) {
      if (entry.techniqueId && !getLocalTechniqueTemplate(entry.techniqueId)) {
        missing.add(entry.techniqueId);
      }
    }
    if (missing.size === 0) return;
    const requestKey = this.getTransmissionRequestKey();
    void Promise.all([...missing].map((techniqueId) => contentResolver.fetchTechnique(techniqueId))).then(() => {
      if (!detailModalHost.isOpenFor(TRANSMISSION_MODAL_OWNER)) return;
      if (this.getTransmissionRequestKey() !== requestKey) return;
      this.patchTransmissionListingsState();
      this.patchTransmissionConsignInventoryState();
    });
  }

  private getTransmissionRequestKey(): string {
    const p = this.panel;
    return [p.transmissionTab, p.transmissionPage, p.transmissionSearchQuery, p.transmissionCategory, p.transmissionSort].join('|');
  }

  private getLots(): TransmissionLotView[] {
    const listings = this.panel.transmissionListings;
    if (!listings || !Array.isArray(listings.items)) return [];
    return listings.items.map((entry) => this.toLotView(entry));
  }

  private toLotView(entry: TransmissionLotPageEntry): TransmissionLotView {
    const item = (entry.item ?? { itemId: '', count: 1 }) as ItemStack;
    const techniqueId = typeof item.learnTechniqueId === 'string' ? item.learnTechniqueId.trim() : '';
    const technique = techniqueId ? getLocalTechniqueTemplate(techniqueId) : null;
    const meta = getItemDisplayMeta(item);
    const category = entry.techniqueCategory ?? technique?.category ?? null;
    const grade = entry.techniqueGrade ?? technique?.grade ?? meta.grade;
    const realmLevel = Math.max(0, Math.trunc(Number(entry.techniqueRealmLv ?? technique?.realmLv) || 0));
    const realmEntry = realmLevel > 0 ? getLocalRealmLevelEntry(realmLevel) : null;
    return {
      id: entry.id,
      itemKey: entry.itemKey,
      item,
      techniqueId,
      itemName: formatTechniqueName(entry.techniqueName || technique?.name || item.name || techniqueId),
      category,
      categoryLabel: category ? getTechniqueCategoryLabel(category) : t('market.transmission.category.unknown', undefined),
      grade,
      qualityLabel: grade ? getTechniqueGradeLabel(grade) : (meta.gradeLabel ?? t('market.transmission.grade.unknown', undefined)),
      realmLevelLabel: realmLevel > 0
        ? (realmEntry?.displayName ?? `Lv.${formatDisplayInteger(realmLevel)}`)
        : null,
      realmLevel,
      price: Math.max(1, Math.trunc(Number(entry.price) || 1)),
      sellerLabel: entry.sellerLabel,
      isMine: Boolean(entry.isMine),
      remainingQuantity: Math.max(1, Math.trunc(Number(entry.remainingQuantity) || 1)),
      createdAt: Math.max(0, Math.trunc(Number(entry.createdAt) || 0)),
      orderId: typeof entry.orderId === 'string' ? entry.orderId : '',
    };
  }

  private renderTransmissionBody(): string {
    const listings = this.panel.transmissionListings;
    if (!listings) {
      return `
        <div class="transmission-loading" role="status" aria-label="${escapeHtmlAttr(t('market.transmission.loading', undefined))}">
          <span class="transmission-loading-indicator" aria-hidden="true"></span>
        </div>
      `;
    }
    const lots = this.getLots();
    const activeKey = this.panel.selectedTransmissionItemKey ?? lots[0]?.itemKey ?? '';
    const selected = lots.find((lot) => lot.itemKey === activeKey) ?? null;
    return `
      <div class="auction-house-shell transmission-house-shell" data-transmission-shell>
        ${this.renderTabs(listings)}
        ${this.renderSummary(listings)}
        <div class="auction-house-board auction-house-board--transmission">
          ${this.renderFilterRail(listings)}
          ${this.renderListPanel(listings, lots, activeKey)}
          <div
            class="auction-detail-panel transmission-detail-panel ui-surface-pane ui-surface-pane--stack"
            data-transmission-detail-panel
            data-transmission-detail-item-key="${escapeHtmlAttr(selected?.itemKey ?? '')}"
            data-transmission-detail-revision="${escapeHtmlAttr(this.buildTransmissionDetailRevision(selected, listings))}"
          >
            ${this.renderDetail(selected, listings)}
          </div>
        </div>
      </div>
      ${this.panel.transmissionConsignPanel.open ? this.renderTransmissionConsignLayer() : ''}
    `;
  }

  private renderTabs(listings: S2C_TransmissionListings): string {
    const tabs: Array<{ id: TransmissionPanelTab; label: string; count: number }> = [
      { id: 'participate', label: t('market.transmission.tab.participate', undefined), count: listings.counts?.participate ?? 0 },
      { id: 'mine', label: t('market.transmission.tab.mine', undefined), count: listings.counts?.mine ?? 0 },
    ];
    return `
      <div class="auction-house-tabs" role="tablist" aria-label="${escapeHtmlAttr(t('market.tab.transmission', undefined))}">
        ${tabs.map((tab) => `
          <button class="auction-house-tab ${this.panel.transmissionTab === tab.id ? 'active' : ''}" data-transmission-tab="${tab.id}" type="button" aria-selected="${this.panel.transmissionTab === tab.id ? 'true' : 'false'}">
            ${escapeHtml(tab.label)} <small data-transmission-tab-count>${formatDisplayInteger(tab.count)}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  private renderSummary(listings: S2C_TransmissionListings): string {
    const ownedCurrency = this.panel.findInventoryItemCountByItemId(listings.currencyItemId);
    return `
      <div class="auction-house-summary transmission-house-summary">
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.summary.active', undefined))}</span>
          <strong data-transmission-summary="participate">${formatDisplayInteger(listings.counts?.participate ?? 0)}</strong>
          <small>${escapeHtml(t('market.transmission.summary.scroll-unit', undefined))}</small>
        </div>
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.summary.mine', undefined))}</span>
          <strong data-transmission-summary="mine">${formatDisplayInteger(listings.counts?.mine ?? 0)}</strong>
          <small>${escapeHtml(t('market.transmission.summary.listing', undefined))}</small>
        </div>
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.summary.filtered', undefined))}</span>
          <strong data-transmission-summary="filtered">${formatDisplayInteger(listings.total ?? 0)}</strong>
          <small>${escapeHtml(t('market.transmission.summary.result', undefined))}</small>
        </div>
        <div class="auction-summary-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.summary.wallet', undefined))}</span>
          <strong data-transmission-owned-currency>${formatDisplayInteger(ownedCurrency)}</strong>
          <small>${escapeHtml(listings.currencyItemName)}</small>
        </div>
        <button class="auction-summary-card auction-summary-action ui-surface-card ui-surface-card--compact" data-transmission-consign-open type="button">
          <strong>${escapeHtml(t('market.transmission.consign.open', undefined))}</strong>
          <small>${escapeHtml(t('market.transmission.consign.open-short', undefined))}</small>
        </button>
      </div>
    `;
  }

  private renderFilterRail(listings: S2C_TransmissionListings): string {
    const categories: Array<{ id: TransmissionCategoryFilter; label: string; count: number }> = [
      { id: 'all', label: t('market.transmission.category.all', undefined), count: listings.counts?.categoryCounts?.all ?? 0 },
      ...TRANSMISSION_CATEGORIES.map((category) => ({
        id: category,
        label: getTechniqueCategoryLabel(category),
        count: listings.counts?.categoryCounts?.[category] ?? 0,
      })),
    ];
    return `
      <aside class="auction-filter-rail transmission-filter-rail ui-surface-pane ui-surface-pane--stack">
        <label class="auction-search-field">
          <span>${escapeHtml(t('market.transmission.search', undefined))}</span>
          <input class="ui-search-input" data-transmission-search type="search" value="${escapeHtmlAttr(this.panel.transmissionSearchQuery)}" placeholder="${escapeHtmlAttr(t('market.transmission.search-placeholder', undefined))}" autocomplete="off" />
        </label>
        <label class="transmission-sort-field">
          <span>${escapeHtml(t('market.transmission.sort.label', undefined))}</span>
          <select class="ui-search-input" data-transmission-sort>
            ${TRANSMISSION_SORTS.map((entry) => `<option value="${entry.id}" ${this.panel.transmissionSort === entry.id ? 'selected' : ''}>${escapeHtml(t(entry.labelKey, undefined))}</option>`).join('')}
          </select>
        </label>
        <div class="auction-filter-group">
          <div class="market-list-toolbar-meta">${escapeHtml(t('market.transmission.category.label', undefined))}</div>
          <div class="auction-filter-buttons">
            ${categories.map((category) => `
              <button class="auction-filter-button ${this.panel.transmissionCategory === category.id ? 'active' : ''}" data-transmission-category="${category.id}" type="button" aria-pressed="${this.panel.transmissionCategory === category.id ? 'true' : 'false'}">
                <span>${escapeHtml(category.label)}</span>
                <strong data-transmission-category-count>${formatDisplayInteger(category.count)}</strong>
              </button>
            `).join('')}
          </div>
        </div>
      </aside>
    `;
  }

  private renderListPanel(listings: S2C_TransmissionListings, lots: TransmissionLotView[], activeKey: string): string {
    const pageSize = Math.max(1, listings.pageSize || TRANSMISSION_PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil((listings.total ?? 0) / pageSize));
    const page = Math.max(1, listings.page ?? 1);
    const emptyKey = this.panel.transmissionTab === 'mine'
      ? 'market.transmission.empty.mine'
      : 'market.transmission.empty.participate';
    return `
      <div class="auction-list-panel ui-surface-pane ui-surface-pane--stack" data-transmission-list-panel>
        <div class="auction-list-toolbar ui-action-row">
          <div class="market-list-toolbar-meta" data-transmission-page-status>${escapeHtml(t('market.transmission.page-status', {
            total: formatDisplayInteger(listings.total ?? 0),
            page: formatDisplayInteger(page),
            totalPages: formatDisplayInteger(totalPages),
          }))}</div>
          <div class="market-list-toolbar-actions">
            <button class="small-btn ghost" data-transmission-page="${page - 1}" data-transmission-page-direction="prev" type="button" ${page <= 1 ? 'disabled' : ''}>${escapeHtml(t('market.transmission.page.prev', undefined))}</button>
            <button class="small-btn ghost" data-transmission-page="${page + 1}" data-transmission-page-direction="next" type="button" ${page >= totalPages ? 'disabled' : ''}>${escapeHtml(t('market.transmission.page.next', undefined))}</button>
            <button class="small-btn ghost" data-transmission-refresh type="button">${escapeHtml(t('market.auction.refresh', undefined))}</button>
          </div>
        </div>
        <div class="auction-list-head transmission-list-head">
          <span>${escapeHtml(t('market.transmission.head.item', undefined))}</span>
          <span>${escapeHtml(t('market.transmission.head.category', undefined))}</span>
          <span>${escapeHtml(t('market.transmission.head.quality', undefined))}</span>
          <span>${escapeHtml(t('market.transmission.head.price', undefined))}</span>
        </div>
        <div class="auction-list ui-scroll-panel" data-transmission-list>
          ${lots.length > 0
            ? lots.map((lot) => this.renderLotRow(lot, activeKey)).join('')
            : `<div class="empty-hint" data-transmission-list-empty>${escapeHtml(t(emptyKey, undefined))}</div>`}
        </div>
      </div>
    `;
  }

  private renderLotRow(lot: TransmissionLotView, activeKey: string): string {
    return `
      <button
        class="auction-lot-row transmission-lot-row ${lot.isMine ? 'auction-lot-row--mine' : ''} ${lot.itemKey === activeKey ? 'active' : ''}"
        data-transmission-select-item="${escapeHtmlAttr(lot.itemKey)}"
        data-ui-key="transmission:${escapeHtmlAttr(lot.itemKey)}"
        aria-pressed="${lot.itemKey === activeKey ? 'true' : 'false'}"
        type="button"
      >
        <span class="auction-lot-ribbon ${lot.isMine ? '' : 'hidden'}" data-transmission-lot-ribbon aria-hidden="true"><span>${escapeHtml(t('market.transmission.ribbon.mine', undefined))}</span></span>
        <span class="auction-lot-item">
          <strong data-transmission-lot-name>${escapeHtml(lot.itemName)}</strong>
          <small data-transmission-lot-realm>${escapeHtml(lot.realmLevelLabel ?? lot.sellerLabel)}</small>
        </span>
        <span data-transmission-lot-category>${escapeHtml(lot.categoryLabel)}</span>
        <span class="auction-quality-tag" data-transmission-lot-quality>${escapeHtml(lot.qualityLabel)}</span>
        <span class="transmission-lot-price" data-transmission-lot-price>${this.panel.formatMarketUnitPrice(lot.price)}</span>
      </button>
    `;
  }

  private renderDetail(lot: TransmissionLotView | null, listings: S2C_TransmissionListings): string {
    if (!lot) {
      return `<div class="empty-hint">${escapeHtml(t('market.transmission.empty.select', undefined))}</div>`;
    }
    const ownedCurrency = this.panel.findInventoryItemCountByItemId(listings.currencyItemId);
    const canBuy = !lot.isMine && ownedCurrency >= lot.price;
    return `
      <div class="auction-detail-head transmission-detail-head">
        <div class="auction-item-icon" aria-hidden="true">${escapeHtml(getTechniqueInitial(lot.itemName))}</div>
        <div class="auction-detail-title">
          <div class="market-item-title market-item-title--interactive" data-market-item-tooltip="transmission:${escapeHtmlAttr(lot.itemKey)}">${escapeHtml(lot.itemName)}</div>
          <div class="market-book-subtitle">${escapeHtml([lot.realmLevelLabel, lot.qualityLabel, lot.categoryLabel].filter(Boolean).join(' · '))}</div>
        </div>
      </div>
      <div class="auction-price-grid">
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.head.price', undefined))}</span>
          <strong>${this.panel.formatMarketUnitPrice(lot.price)}</strong>
          <small>${escapeHtml(listings.currencyItemName)}</small>
        </div>
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.head.seller', undefined))}</span>
          <strong>${escapeHtml(lot.sellerLabel)}</strong>
          <small>${escapeHtml(lot.categoryLabel)}</small>
        </div>
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.summary.wallet', undefined))}</span>
          <strong data-transmission-owned-currency>${formatDisplayInteger(ownedCurrency)}</strong>
          <small>${escapeHtml(listings.currencyItemName)}</small>
        </div>
      </div>
      <div class="auction-bid-actions">
        ${lot.isMine
          ? `<button class="small-btn ghost" data-transmission-cancel="${escapeHtmlAttr(lot.orderId)}" type="button" ${lot.orderId ? '' : 'disabled'}>${escapeHtml(t('market.transmission.action.cancel', undefined))}</button>`
          : `<button class="small-btn" data-transmission-action="buy" data-transmission-action-item="${escapeHtmlAttr(lot.itemKey)}" type="button" ${canBuy ? '' : 'disabled'}>${escapeHtml(t('market.transmission.action.buy', undefined))}</button>`}
      </div>
    `;
  }

  /** 标签、计数只改现有节点，绝不重建标签栏。 */
  private patchTransmissionTabs(body: HTMLElement, listings: S2C_TransmissionListings): void {
    const counts: Record<TransmissionPanelTab, number> = {
      participate: listings.counts?.participate ?? 0,
      mine: listings.counts?.mine ?? 0,
    };
    body.querySelectorAll<HTMLButtonElement>('[data-transmission-tab]').forEach((button) => {
      const tab: TransmissionPanelTab = button.dataset.transmissionTab === 'mine' ? 'mine' : 'participate';
      const active = tab === this.panel.transmissionTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      const count = button.querySelector<HTMLElement>('[data-transmission-tab-count]');
      if (count) count.textContent = formatDisplayInteger(counts[tab]);
    });
  }

  /** 汇总卡片只更新数值；上架按钮和钱包节点保持原引用。 */
  private patchTransmissionSummary(body: HTMLElement, listings: S2C_TransmissionListings): void {
    const values = new Map<string, number>([
      ['participate', listings.counts?.participate ?? 0],
      ['mine', listings.counts?.mine ?? 0],
      ['filtered', listings.total ?? 0],
    ]);
    body.querySelectorAll<HTMLElement>('[data-transmission-summary]').forEach((node) => {
      const value = values.get(node.dataset.transmissionSummary ?? '');
      if (value !== undefined) node.textContent = formatDisplayInteger(value);
    });
  }

  /** 筛选回包不得覆盖仍在输入中的搜索框，也不得重建筛选栏。 */
  private patchTransmissionFilters(body: HTMLElement, listings: S2C_TransmissionListings): void {
    const search = body.querySelector<HTMLInputElement>('[data-transmission-search]');
    if (search && document.activeElement !== search && search.value !== this.panel.transmissionSearchQuery) {
      search.value = this.panel.transmissionSearchQuery;
    }
    const sort = body.querySelector<HTMLSelectElement>('[data-transmission-sort]');
    if (sort && sort.value !== this.panel.transmissionSort) {
      sort.value = this.panel.transmissionSort;
    }
    const categoryCounts = listings.counts?.categoryCounts;
    body.querySelectorAll<HTMLButtonElement>('[data-transmission-category]').forEach((button) => {
      const raw = button.dataset.transmissionCategory;
      const category: TransmissionCategoryFilter = TRANSMISSION_CATEGORIES.includes(raw as TechniqueCategory)
        ? raw as TechniqueCategory
        : 'all';
      const active = category === this.panel.transmissionCategory;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const count = button.querySelector<HTMLElement>('[data-transmission-category-count]');
      if (count) count.textContent = formatDisplayInteger(categoryCounts?.[category] ?? 0);
    });
  }

  /** 当前页列表按 itemKey 复用行节点；新增、下架和换序只影响对应行。 */
  private patchTransmissionList(
    body: HTMLElement,
    listings: S2C_TransmissionListings,
    lots: TransmissionLotView[],
    activeKey: string,
  ): void {
    const pageSize = Math.max(1, listings.pageSize || TRANSMISSION_PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil((listings.total ?? 0) / pageSize));
    const page = Math.max(1, listings.page ?? 1);
    const status = body.querySelector<HTMLElement>('[data-transmission-page-status]');
    if (status) {
      status.textContent = t('market.transmission.page-status', {
        total: formatDisplayInteger(listings.total ?? 0),
        page: formatDisplayInteger(page),
        totalPages: formatDisplayInteger(totalPages),
      });
    }
    const previous = body.querySelector<HTMLButtonElement>('[data-transmission-page-direction="prev"]');
    if (previous) {
      previous.dataset.transmissionPage = String(page - 1);
      previous.disabled = page <= 1;
    }
    const next = body.querySelector<HTMLButtonElement>('[data-transmission-page-direction="next"]');
    if (next) {
      next.dataset.transmissionPage = String(page + 1);
      next.disabled = page >= totalPages;
    }
    const list = body.querySelector<HTMLElement>('[data-transmission-list]');
    if (!list) return;
    const scrollTop = list.scrollTop;
    if (lots.length === 0) {
      const emptyKey = this.panel.transmissionTab === 'mine'
        ? 'market.transmission.empty.mine'
        : 'market.transmission.empty.participate';
      const currentEmpty = list.querySelector<HTMLElement>('[data-transmission-list-empty]');
      if (!currentEmpty || list.children.length !== 1) {
        replaceElementHtml(list, `<div class="empty-hint" data-transmission-list-empty>${escapeHtml(t(emptyKey, undefined))}</div>`);
      } else {
        currentEmpty.textContent = t(emptyKey, undefined);
      }
      list.scrollTop = scrollTop;
      return;
    }
    const existing = new Map<string, HTMLButtonElement>();
    list.querySelectorAll<HTMLButtonElement>('[data-transmission-select-item]').forEach((row) => {
      const itemKey = row.dataset.transmissionSelectItem;
      if (itemKey) existing.set(itemKey, row);
    });
    const ordered: HTMLButtonElement[] = [];
    for (const lot of lots) {
      let row = existing.get(lot.itemKey) ?? null;
      if (!row || !this.patchTransmissionLotRow(row, lot, activeKey)) {
        row = createButtonFromHtml(this.renderLotRow(lot, activeKey));
      }
      if (!row) continue;
      existing.delete(lot.itemKey);
      ordered.push(row);
    }
    existing.forEach((row) => row.remove());
    this.syncTransmissionListChildren(list, ordered);
    list.scrollTop = scrollTop;
  }

  private patchTransmissionLotRow(row: HTMLButtonElement, lot: TransmissionLotView, activeKey: string): boolean {
    const ribbon = row.querySelector<HTMLElement>('[data-transmission-lot-ribbon]');
    const name = row.querySelector<HTMLElement>('[data-transmission-lot-name]');
    const realm = row.querySelector<HTMLElement>('[data-transmission-lot-realm]');
    const category = row.querySelector<HTMLElement>('[data-transmission-lot-category]');
    const quality = row.querySelector<HTMLElement>('[data-transmission-lot-quality]');
    const price = row.querySelector<HTMLElement>('[data-transmission-lot-price]');
    if (!ribbon || !name || !realm || !category || !quality || !price) return false;
    const active = lot.itemKey === activeKey;
    row.dataset.transmissionSelectItem = lot.itemKey;
    row.dataset.uiKey = `transmission:${lot.itemKey}`;
    row.classList.toggle('auction-lot-row--mine', lot.isMine);
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', active ? 'true' : 'false');
    ribbon.classList.toggle('hidden', !lot.isMine);
    name.textContent = lot.itemName;
    realm.textContent = lot.realmLevelLabel ?? lot.sellerLabel;
    category.textContent = lot.categoryLabel;
    quality.textContent = lot.qualityLabel;
    price.textContent = this.panel.formatMarketUnitPrice(lot.price);
    return true;
  }

  private syncTransmissionListChildren(container: HTMLElement, ordered: HTMLButtonElement[]): void {
    const allowed = new Set<HTMLElement>(ordered);
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || !allowed.has(child)) child.remove();
    }
    let reference: ChildNode | null = container.firstChild;
    for (const row of ordered) {
      if (reference !== row) container.insertBefore(row, reference);
      reference = row.nextSibling;
    }
  }

  /** 只有选中拍品的可见语义变化时才替换右侧详情，不受无关计数推送影响。 */
  private patchTransmissionDetail(
    body: HTMLElement,
    listings: S2C_TransmissionListings,
    lots: TransmissionLotView[],
    activeKey: string,
  ): void {
    const detail = body.querySelector<HTMLElement>('[data-transmission-detail-panel]');
    if (!detail) return;
    const selected = lots.find((lot) => lot.itemKey === activeKey) ?? null;
    const revision = this.buildTransmissionDetailRevision(selected, listings);
    if (
      detail.dataset.transmissionDetailItemKey !== (selected?.itemKey ?? '')
      || detail.dataset.transmissionDetailRevision !== revision
    ) {
      replaceElementHtml(detail, this.renderDetail(selected, listings));
      detail.dataset.transmissionDetailItemKey = selected?.itemKey ?? '';
      detail.dataset.transmissionDetailRevision = revision;
      this.panel.bindItemTooltipEvents(detail);
    }
  }

  private buildTransmissionDetailRevision(lot: TransmissionLotView | null, listings: S2C_TransmissionListings): string {
    if (!lot) return `empty␟${listings.currencyItemName}`;
    return [
      lot.itemKey,
      lot.itemName,
      lot.realmLevelLabel ?? '',
      lot.qualityLabel,
      lot.categoryLabel,
      lot.price,
      lot.sellerLabel,
      lot.isMine ? 1 : 0,
      lot.orderId,
      listings.currencyItemName,
    ].join('␟');
  }

  private bindTransmissionEvents(body: HTMLElement, signal: AbortSignal): void {
    body.querySelector<HTMLInputElement>('[data-transmission-search]')?.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      this.panel.transmissionSearchQuery = input.value;
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = null;
        this.panel.transmissionPage = 1;
        this.panel.selectedTransmissionItemKey = null;
        this.panel.requestTransmissionListings(1);
      }, TRANSMISSION_SEARCH_DEBOUNCE_MS);
    }, { signal });

    body.querySelector<HTMLSelectElement>('[data-transmission-sort]')?.addEventListener('change', (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      const sort = TRANSMISSION_SORTS.find((entry) => entry.id === select.value)?.id ?? 'price_asc';
      if (sort === this.panel.transmissionSort) return;
      this.panel.transmissionSort = sort;
      this.panel.transmissionPage = 1;
      this.panel.selectedTransmissionItemKey = null;
      this.panel.requestTransmissionListings(1);
    }, { signal });

    body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const tabNode = target.closest<HTMLElement>('[data-transmission-tab]');
      if (tabNode) {
        const tab: TransmissionPanelTab = tabNode.dataset.transmissionTab === 'mine' ? 'mine' : 'participate';
        if (tab !== this.panel.transmissionTab) {
          this.panel.transmissionTab = tab;
          this.panel.transmissionPage = 1;
          this.panel.selectedTransmissionItemKey = null;
          this.panel.requestTransmissionListings(1);
        }
        return;
      }
      const categoryNode = target.closest<HTMLElement>('[data-transmission-category]');
      if (categoryNode) {
        const rawCategory = categoryNode.dataset.transmissionCategory;
        const category: TransmissionCategoryFilter = TRANSMISSION_CATEGORIES.includes(rawCategory as TechniqueCategory)
          ? rawCategory as TechniqueCategory
          : 'all';
        if (category !== this.panel.transmissionCategory) {
          this.panel.transmissionCategory = category;
          this.panel.transmissionPage = 1;
          this.panel.selectedTransmissionItemKey = null;
          this.panel.requestTransmissionListings(1);
        }
        return;
      }
      const selectNode = target.closest<HTMLElement>('[data-transmission-select-item]');
      if (selectNode) {
        const itemKey = selectNode.dataset.transmissionSelectItem ?? '';
        if (itemKey) this.patchTransmissionSelection(body, itemKey);
        return;
      }
      const pageNode = target.closest<HTMLElement>('[data-transmission-page]');
      if (pageNode) {
        const nextPage = Math.max(1, Math.trunc(Number(pageNode.dataset.transmissionPage) || 1));
        if (nextPage !== this.panel.transmissionPage) {
          this.panel.transmissionPage = nextPage;
          this.panel.selectedTransmissionItemKey = null;
          this.panel.requestTransmissionListings(nextPage);
        }
        return;
      }
      if (target.closest('[data-transmission-refresh]')) {
        this.panel.requestTransmissionListings(this.panel.transmissionPage);
        return;
      }
      if (target.closest('[data-transmission-consign-open]')) {
        this.panel.openTransmissionConsignModal();
        return;
      }
      const cancelNode = target.closest<HTMLElement>('[data-transmission-cancel]');
      if (cancelNode) {
        const orderId = cancelNode.dataset.transmissionCancel ?? '';
        if (orderId) this.panel.callbacks?.onCancelOrder(orderId);
        return;
      }
      const actionNode = target.closest<HTMLElement>('[data-transmission-action="buy"]');
      if (actionNode) {
        const itemKey = actionNode.dataset.transmissionActionItem ?? '';
        if (itemKey) this.panel.callbacks?.onBuyTransmissionLot(itemKey, itemKey);
      }
    }, { signal });
  }

  private patchTransmissionSelection(body: HTMLElement, itemKey: string): void {
    const lot = this.getLots().find((entry) => entry.itemKey === itemKey) ?? null;
    if (!lot) return;
    this.panel.selectedTransmissionItemKey = itemKey;
    body.querySelectorAll<HTMLElement>('[data-transmission-select-item]').forEach((node) => {
      const active = node.dataset.transmissionSelectItem === itemKey;
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const detail = body.querySelector<HTMLElement>('[data-transmission-detail-panel]');
    const listings = this.panel.transmissionListings;
    if (!detail || !listings) return;
    replaceElementHtml(detail, this.renderDetail(lot, listings));
    detail.dataset.transmissionDetailItemKey = lot.itemKey;
    detail.dataset.transmissionDetailRevision = this.buildTransmissionDetailRevision(lot, listings);
    this.panel.bindItemTooltipEvents(detail);
  }

  /** 背包里可上架的残卷；空书和没有实例 ID 的条目不会进入选择器。 */
  getTransmissionConsignItems(): TransmissionConsignItemView[] {
    return this.panel.inventory.items
      .filter((item) => item.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID
        && item.count > 0
        && typeof item.learnTechniqueId === 'string'
        && item.learnTechniqueId.trim().length > 0
        && normalizeInventoryItemInstanceId(item.itemInstanceId).length > 0)
      .map((item) => {
        const itemInstanceId = normalizeInventoryItemInstanceId(item.itemInstanceId);
        const techniqueId = String(item.learnTechniqueId).trim();
        const technique = getLocalTechniqueTemplate(techniqueId);
        const meta = getItemDisplayMeta(item);
        const category = technique?.category ?? null;
        const grade = technique?.grade ?? meta.grade;
        const realmLevel = Math.max(0, Math.trunc(Number(technique?.realmLv) || 0));
        const realmEntry = realmLevel > 0 ? getLocalRealmLevelEntry(realmLevel) : null;
        return {
          itemInstanceId,
          item,
          techniqueId,
          name: formatTechniqueName(technique?.name || item.name || techniqueId),
          category,
          categoryLabel: category ? getTechniqueCategoryLabel(category) : t('market.transmission.category.unknown', undefined),
          grade,
          gradeLabel: grade ? getTechniqueGradeLabel(grade) : (meta.gradeLabel ?? t('market.transmission.grade.unknown', undefined)),
          realmLevel,
          realmLabel: realmLevel > 0
            ? (realmEntry?.displayName ?? `Lv.${formatDisplayInteger(realmLevel)}`)
            : t('market.transmission.realm.unknown', undefined),
        };
      });
  }

  private getFilteredTransmissionConsignItems(
    allItems = this.getTransmissionConsignItems(),
  ): TransmissionConsignItemView[] {
    const state = this.panel.transmissionConsignPanel;
    const query = state.query.trim().toLocaleLowerCase();
    const entries = allItems.filter((entry) => {
      if (state.category !== 'all' && entry.category !== state.category) return false;
      if (!query) return true;
      return entry.name.toLocaleLowerCase().includes(query)
        || entry.techniqueId.toLocaleLowerCase().includes(query)
        || String(entry.item.name ?? '').toLocaleLowerCase().includes(query);
    });
    const gradeIndex = (entry: TransmissionConsignItemView) => Math.max(-1, TECHNIQUE_GRADE_ORDER.indexOf(entry.grade ?? 'mortal'));
    return entries.sort((left, right) => {
      if (state.sort === 'name_asc') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN');
      }
      if (state.sort === 'grade_desc') {
        return gradeIndex(right) - gradeIndex(left)
          || right.realmLevel - left.realmLevel
          || left.name.localeCompare(right.name, 'zh-Hans-CN');
      }
      return right.realmLevel - left.realmLevel
        || gradeIndex(right) - gradeIndex(left)
        || left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
  }

  /** 打开上架界面时优先沿用当前筛选下仍可见的选择，否则选择排序后的第一卷。 */
  getPreferredTransmissionConsignItemInstanceId(current: string | null): string | null {
    const visibleItems = this.getFilteredTransmissionConsignItems();
    if (current && visibleItems.some((entry) => entry.itemInstanceId === current)) return current;
    return visibleItems[0]?.itemInstanceId ?? this.getTransmissionConsignItems()[0]?.itemInstanceId ?? null;
  }

  renderInlineTransmissionConsignModal(): void {
    const body = this.panel.getOpenTransmissionModalBody();
    if (!body) return;
    this.inlineConsignEvents?.abort();
    this.inlineConsignEvents = null;
    body.querySelector<HTMLElement>('[data-transmission-consign-inline-layer]')?.remove();
    const layer = document.createElement('div');
    layer.className = 'auction-consign-inline-layer';
    layer.dataset.transmissionConsignInlineLayer = 'true';
    replaceElementHtml(layer, this.renderTransmissionConsignCard());
    body.appendChild(layer);
    this.bindInlineTransmissionConsignLayer(layer);
    this.captureTransmissionConsignProjectionSignature();
  }

  private renderTransmissionConsignLayer(): string {
    return `
      <div class="auction-consign-inline-layer" data-transmission-consign-inline-layer>
        ${this.renderTransmissionConsignCard()}
      </div>
    `;
  }

  private renderTransmissionConsignCard(): string {
    return `
      <div class="auction-consign-inline-card transmission-consign-inline-card ui-surface-pane ui-surface-pane--stack" role="dialog" aria-modal="false">
        <div class="auction-consign-inline-head">
          <div class="panel-section-title">${escapeHtml(t('market.transmission.consign.title', undefined))}</div>
          <button class="small-btn ghost" data-transmission-consign-close type="button">${escapeHtml(t('market.transmission.consign.close', undefined))}</button>
        </div>
        <div data-transmission-consign-inline-body>
          ${this.renderTransmissionConsignPanel()}
        </div>
      </div>
    `;
  }

  private bindInlineTransmissionConsignLayer(layer: HTMLElement): void {
    this.inlineConsignEvents?.abort();
    const controller = new AbortController();
    this.inlineConsignEvents = controller;
    this.bindTransmissionConsignEvents(layer, controller.signal);
    this.panel.bindItemTooltipEvents(layer, controller.signal);
  }

  private renderTransmissionConsignPanel(): string {
    const state = this.panel.transmissionConsignPanel;
    const allItems = this.getTransmissionConsignItems();
    const items = this.getFilteredTransmissionConsignItems(allItems);
    const selected = allItems.find((entry) => entry.itemInstanceId === state.itemInstanceId) ?? null;
    return `
      <div class="transmission-consign-panel" data-transmission-consign-panel>
        <div class="auction-consign-title-row">
          <strong>${escapeHtml(t('market.transmission.consign.choose', undefined))}</strong>
          <span data-transmission-consign-count>${escapeHtml(t('market.transmission.consign.visible-count', {
            visible: formatDisplayInteger(items.length),
            total: formatDisplayInteger(allItems.length),
          }))}</span>
        </div>
        <div class="transmission-consign-toolbar">
          <label class="auction-consign-search">
            <span>${escapeHtml(t('market.transmission.search', undefined))}</span>
            <input class="ui-search-input" data-transmission-consign-search type="search" value="${escapeHtmlAttr(state.query)}" placeholder="${escapeHtmlAttr(t('market.transmission.search-placeholder', undefined))}" autocomplete="off" />
          </label>
          <label class="transmission-sort-field">
            <span>${escapeHtml(t('market.transmission.category.label', undefined))}</span>
            <select class="ui-search-input" data-transmission-consign-category>
              <option value="all" ${state.category === 'all' ? 'selected' : ''}>${escapeHtml(t('market.transmission.category.all', undefined))}</option>
              ${TRANSMISSION_CATEGORIES.map((category) => `<option value="${category}" ${state.category === category ? 'selected' : ''}>${escapeHtml(getTechniqueCategoryLabel(category))}</option>`).join('')}
            </select>
          </label>
          <label class="transmission-sort-field">
            <span>${escapeHtml(t('market.transmission.sort.label', undefined))}</span>
            <select class="ui-search-input" data-transmission-consign-sort>
              ${TRANSMISSION_CONSIGN_SORTS.map((entry) => `<option value="${entry.id}" ${state.sort === entry.id ? 'selected' : ''}>${escapeHtml(t(entry.labelKey, undefined))}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="transmission-consign-items ui-scroll-panel" data-transmission-consign-items>
          ${this.renderTransmissionConsignItems(items, allItems.length)}
        </div>
        <div data-transmission-consign-fields>
          ${this.renderTransmissionConsignFields(selected)}
        </div>
      </div>
    `;
  }

  private renderTransmissionConsignItems(
    items = this.getFilteredTransmissionConsignItems(),
    totalCount = this.getTransmissionConsignItems().length,
  ): string {
    if (items.length === 0) {
      const key = totalCount === 0
        ? 'market.transmission.consign.empty'
        : 'market.transmission.consign.search-empty';
      return `<div class="empty-hint" data-transmission-consign-empty>${escapeHtml(t(key, undefined))}</div>`;
    }
    return items.map((entry) => this.renderTransmissionConsignItem(entry)).join('');
  }

  private renderTransmissionConsignItem(entry: TransmissionConsignItemView): string {
    const active = this.panel.transmissionConsignPanel.itemInstanceId === entry.itemInstanceId;
    const gradeLineVisible = Boolean(entry.gradeLabel);
    const className = getItemDecorClassName(
      `inventory-cell inventory-cell--actionable transmission-consign-item ${active ? 'active' : ''}`,
      entry.item,
    );
    return `
      <button
        class="${className}"
        data-transmission-consign-item="${escapeHtmlAttr(entry.itemInstanceId)}"
        data-ui-key="transmission-consign:${escapeHtmlAttr(entry.itemInstanceId)}"
        data-market-item-tooltip="transmission-consign-item:${escapeHtmlAttr(entry.itemInstanceId)}"
        data-item-grade-line-visible="${gradeLineVisible ? 'true' : 'false'}"
        aria-pressed="${active ? 'true' : 'false'}"
        type="button"
      >
        <div class="inventory-cell-head">
          <span class="inventory-cell-type" data-transmission-consign-item-category>${escapeHtml(entry.categoryLabel)}</span>
          <span class="inventory-cell-count" data-transmission-consign-item-count>${formatDisplayInteger(entry.item.count)}</span>
        </div>
        <div class="inventory-cell-grade-line" data-transmission-consign-item-grade ${gradeLineVisible ? '' : 'hidden'}>${escapeHtml(entry.gradeLabel)}</div>
        <div class="inventory-cell-name" data-transmission-consign-item-name aria-label="${escapeHtmlAttr(entry.name)}">${escapeHtml(entry.name)}</div>
        <span class="item-card-chip item-card-chip--level" data-transmission-consign-item-realm>${escapeHtml(entry.realmLabel)}</span>
      </button>
    `;
  }

  private renderTransmissionConsignFields(selected: TransmissionConsignItemView | null): string {
    const price = this.normalizeTransmissionConsignPrice(this.panel.transmissionConsignPanel.unitPrice);
    const currencyName = this.panel.transmissionListings?.currencyItemName ?? '灵石';
    return `
      <div class="transmission-consign-fields">
        <div class="transmission-consign-selection ui-surface-card ui-surface-card--compact">
          <span>${escapeHtml(t('market.transmission.consign.selected', undefined))}</span>
          <strong data-transmission-consign-selected-name>${escapeHtml(selected?.name ?? t('market.transmission.consign.no-selection', undefined))}</strong>
          <small data-transmission-consign-selected-meta>${selected ? escapeHtml([selected.realmLabel, selected.gradeLabel, selected.categoryLabel].filter(Boolean).join(' · ')) : ''}</small>
        </div>
        <label class="market-trade-dialog-field transmission-consign-price-field">
          <span>${escapeHtml(t('market.transmission.head.price', undefined))}</span>
          <div class="market-price-preset-row auction-consign-price-presets">
            ${TRANSMISSION_PRICE_PRESETS.map((preset) => `
              <button class="small-btn ghost ${preset === price ? 'active' : ''}" data-transmission-consign-price-action="preset" data-transmission-consign-price-preset="${preset}" type="button" ${selected ? '' : 'disabled'}>${escapeHtml(this.panel.formatPricePresetLabel(preset))}</button>
            `).join('')}
          </div>
          ${renderTradePriceStepControl({
            value: this.panel.formatMarketUnitPrice(price),
            currencyName,
            displayAttrs: { 'data-transmission-consign-price-display': true },
            leftButtons: [
              { label: '÷2', attrs: { 'data-transmission-consign-price-action': 'half' }, disabled: !selected || this.getNextTransmissionConsignPrice('half') >= price },
              { label: '-', attrs: { 'data-transmission-consign-price-action': 'decrease' }, disabled: !selected || this.getNextTransmissionConsignPrice('decrease') >= price },
            ],
            rightButtons: [
              { label: '+', attrs: { 'data-transmission-consign-price-action': 'increase' }, disabled: !selected || this.getNextTransmissionConsignPrice('increase') <= price },
              { label: 'x2', attrs: { 'data-transmission-consign-price-action': 'double' }, disabled: !selected || this.getNextTransmissionConsignPrice('double') <= price },
            ],
          })}
        </label>
        <button class="small-btn transmission-consign-submit" data-transmission-consign-submit type="button" ${selected ? '' : 'disabled'}>${escapeHtml(t('market.transmission.consign.submit', undefined))}</button>
      </div>
    `;
  }

  private bindTransmissionConsignEvents(layer: HTMLElement, signal: AbortSignal): void {
    layer.querySelector<HTMLElement>('[data-transmission-consign-close]')?.addEventListener('click', () => {
      this.closeInlineTransmissionConsignModal();
    }, { signal });
    layer.querySelector<HTMLInputElement>('[data-transmission-consign-search]')?.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      this.panel.transmissionConsignPanel = {
        ...this.panel.transmissionConsignPanel,
        query: input.value,
      };
      this.patchTransmissionConsignItems();
    }, { signal });
    layer.querySelector<HTMLSelectElement>('[data-transmission-consign-category]')?.addEventListener('change', (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      const category: TransmissionCategoryFilter = TRANSMISSION_CATEGORIES.includes(select.value as TechniqueCategory)
        ? select.value as TechniqueCategory
        : 'all';
      this.panel.transmissionConsignPanel = { ...this.panel.transmissionConsignPanel, category };
      this.patchTransmissionConsignItems();
    }, { signal });
    layer.querySelector<HTMLSelectElement>('[data-transmission-consign-sort]')?.addEventListener('change', (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      const sort = TRANSMISSION_CONSIGN_SORTS.find((entry) => entry.id === select.value)?.id ?? 'realm_desc';
      this.panel.transmissionConsignPanel = { ...this.panel.transmissionConsignPanel, sort };
      this.patchTransmissionConsignItems();
    }, { signal });
    layer.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-transmission-consign-submit]')) {
        this.submitTransmissionConsign();
        return;
      }
      const priceNode = target.closest<HTMLElement>('[data-transmission-consign-price-action]');
      if (priceNode) {
        const action = priceNode.dataset.transmissionConsignPriceAction as MarketPriceAction | undefined;
        if (!action) return;
        const preset = this.panel.readDatasetNumber(priceNode.dataset.transmissionConsignPricePreset);
        this.panel.transmissionConsignPanel = {
          ...this.panel.transmissionConsignPanel,
          unitPrice: this.getNextTransmissionConsignPrice(action, preset),
        };
        this.patchTransmissionConsignFields();
        return;
      }
      const itemNode = target.closest<HTMLElement>('[data-transmission-consign-item]');
      if (!itemNode) return;
      const itemInstanceId = normalizeInventoryItemInstanceId(itemNode.dataset.transmissionConsignItem);
      if (!this.getTransmissionConsignItems().some((entry) => entry.itemInstanceId === itemInstanceId)) return;
      this.panel.transmissionConsignPanel = {
        ...this.panel.transmissionConsignPanel,
        itemInstanceId,
      };
      this.patchTransmissionConsignSelection();
    }, { signal });
  }

  private submitTransmissionConsign(): void {
    const state = this.panel.transmissionConsignPanel;
    const itemInstanceId = normalizeInventoryItemInstanceId(state.itemInstanceId);
    if (!itemInstanceId || !this.getTransmissionConsignItems().some((entry) => entry.itemInstanceId === itemInstanceId)) return;
    const unitPrice = this.normalizeTransmissionConsignPrice(state.unitPrice);
    this.panel.callbacks?.onCreateTransmissionSellOrder(itemInstanceId, unitPrice);
    this.panel.transmissionConsignPanel = {
      ...state,
      open: false,
      itemInstanceId: null,
      unitPrice,
    };
    this.closeInlineTransmissionConsignModal();
  }

  private patchTransmissionConsignItems(
    allItems = this.getTransmissionConsignItems(),
  ): void {
    const body = this.getOpenTransmissionConsignBody();
    if (!body) return;
    const filtered = this.getFilteredTransmissionConsignItems(allItems);
    const selectedVisible = filtered.some((entry) => entry.itemInstanceId === this.panel.transmissionConsignPanel.itemInstanceId);
    const selectedExists = allItems.some((entry) => entry.itemInstanceId === this.panel.transmissionConsignPanel.itemInstanceId);
    if ((!selectedVisible && filtered.length > 0) || !selectedExists) {
      this.panel.transmissionConsignPanel = {
        ...this.panel.transmissionConsignPanel,
        itemInstanceId: filtered[0]?.itemInstanceId ?? allItems[0]?.itemInstanceId ?? null,
      };
    }
    const list = body.querySelector<HTMLElement>('[data-transmission-consign-items]');
    if (list) {
      this.patchTransmissionConsignItemList(list, filtered, allItems.length);
    }
    const count = body.querySelector<HTMLElement>('[data-transmission-consign-count]');
    if (count) {
      count.textContent = t('market.transmission.consign.visible-count', {
        visible: formatDisplayInteger(filtered.length),
        total: formatDisplayInteger(allItems.length),
      });
    }
    this.patchTransmissionConsignSelection(allItems);
  }

  /** 上架残卷列表按 itemInstanceId 复用节点，背包变化不销毁卡片或滚动容器。 */
  private patchTransmissionConsignItemList(
    list: HTMLElement,
    items: TransmissionConsignItemView[],
    totalCount: number,
  ): void {
    const scrollTop = list.scrollTop;
    if (items.length === 0) {
      const key = totalCount === 0
        ? 'market.transmission.consign.empty'
        : 'market.transmission.consign.search-empty';
      const currentEmpty = list.querySelector<HTMLElement>('[data-transmission-consign-empty]');
      if (!currentEmpty || list.children.length !== 1) {
        replaceElementHtml(list, `<div class="empty-hint" data-transmission-consign-empty>${escapeHtml(t(key, undefined))}</div>`);
      } else {
        currentEmpty.textContent = t(key, undefined);
      }
      list.scrollTop = scrollTop;
      return;
    }

    const existing = new Map<string, HTMLButtonElement>();
    list.querySelectorAll<HTMLButtonElement>('[data-transmission-consign-item]').forEach((row) => {
      const itemInstanceId = normalizeInventoryItemInstanceId(row.dataset.transmissionConsignItem);
      if (itemInstanceId) existing.set(itemInstanceId, row);
    });
    const ordered: HTMLButtonElement[] = [];
    for (const entry of items) {
      let row = existing.get(entry.itemInstanceId) ?? null;
      if (!row || !this.patchTransmissionConsignItem(row, entry)) {
        row = createButtonFromHtml(this.renderTransmissionConsignItem(entry));
        if (row) this.panel.bindItemTooltipEvents(row, this.inlineConsignEvents?.signal);
      }
      if (!row) continue;
      existing.delete(entry.itemInstanceId);
      ordered.push(row);
    }
    existing.forEach((row) => row.remove());
    this.syncTransmissionListChildren(list, ordered);
    list.scrollTop = scrollTop;
  }

  private patchTransmissionConsignItem(
    row: HTMLButtonElement,
    entry: TransmissionConsignItemView,
  ): boolean {
    const category = row.querySelector<HTMLElement>('[data-transmission-consign-item-category]');
    const count = row.querySelector<HTMLElement>('[data-transmission-consign-item-count]');
    const grade = row.querySelector<HTMLElement>('[data-transmission-consign-item-grade]');
    const name = row.querySelector<HTMLElement>('[data-transmission-consign-item-name]');
    const realm = row.querySelector<HTMLElement>('[data-transmission-consign-item-realm]');
    if (!category || !count || !grade || !name || !realm) return false;
    const active = this.panel.transmissionConsignPanel.itemInstanceId === entry.itemInstanceId;
    const gradeLineVisible = Boolean(entry.gradeLabel);
    row.className = getItemDecorClassName(
      `inventory-cell inventory-cell--actionable transmission-consign-item ${active ? 'active' : ''}`,
      entry.item,
    );
    row.dataset.transmissionConsignItem = entry.itemInstanceId;
    row.dataset.uiKey = `transmission-consign:${entry.itemInstanceId}`;
    row.dataset.marketItemTooltip = `transmission-consign-item:${entry.itemInstanceId}`;
    row.dataset.itemGradeLineVisible = gradeLineVisible ? 'true' : 'false';
    row.setAttribute('aria-pressed', active ? 'true' : 'false');
    category.textContent = entry.categoryLabel;
    count.textContent = formatDisplayInteger(entry.item.count);
    grade.textContent = entry.gradeLabel;
    grade.hidden = !gradeLineVisible;
    name.textContent = entry.name;
    name.setAttribute('aria-label', entry.name);
    realm.textContent = entry.realmLabel;
    return true;
  }

  private patchTransmissionConsignSelection(
    allItems = this.getTransmissionConsignItems(),
  ): void {
    const body = this.getOpenTransmissionConsignBody();
    if (!body) return;
    const selectedId = this.panel.transmissionConsignPanel.itemInstanceId;
    body.querySelectorAll<HTMLElement>('[data-transmission-consign-item]').forEach((node) => {
      const active = node.dataset.transmissionConsignItem === selectedId;
      node.classList.toggle('active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    this.patchTransmissionConsignFields(allItems);
  }

  /** 选中项和价格变化只修改文字、class 与按钮状态，价格控件节点保持不变。 */
  private patchTransmissionConsignFields(
    allItems = this.getTransmissionConsignItems(),
  ): void {
    const body = this.getOpenTransmissionConsignBody();
    if (!body) return;
    const selected = allItems.find((entry) => entry.itemInstanceId === this.panel.transmissionConsignPanel.itemInstanceId) ?? null;
    const price = this.normalizeTransmissionConsignPrice(this.panel.transmissionConsignPanel.unitPrice);
    const currencyName = this.panel.transmissionListings?.currencyItemName ?? '灵石';
    const selectedName = body.querySelector<HTMLElement>('[data-transmission-consign-selected-name]');
    const selectedMeta = body.querySelector<HTMLElement>('[data-transmission-consign-selected-meta]');
    if (selectedName) selectedName.textContent = selected?.name ?? t('market.transmission.consign.no-selection', undefined);
    if (selectedMeta) {
      selectedMeta.textContent = selected
        ? [selected.realmLabel, selected.gradeLabel, selected.categoryLabel].filter(Boolean).join(' · ')
        : '';
    }
    body.querySelectorAll<HTMLButtonElement>('[data-transmission-consign-price-action]').forEach((button) => {
      const action = button.dataset.transmissionConsignPriceAction as MarketPriceAction | undefined;
      if (!action) return;
      const preset = this.panel.readDatasetNumber(button.dataset.transmissionConsignPricePreset);
      button.classList.toggle('active', action === 'preset' && preset === price);
      if (!selected) {
        button.disabled = true;
      } else if (action === 'half' || action === 'decrease') {
        button.disabled = this.getNextTransmissionConsignPrice(action, preset) >= price;
      } else if (action === 'increase' || action === 'double') {
        button.disabled = this.getNextTransmissionConsignPrice(action, preset) <= price;
      } else {
        button.disabled = false;
      }
    });
    const priceDisplay = body.querySelector<HTMLElement>('[data-transmission-consign-price-display]');
    const priceValue = priceDisplay?.querySelector<HTMLElement>('strong');
    const currency = priceDisplay?.querySelector<HTMLElement>('span');
    if (priceValue) priceValue.textContent = this.panel.formatMarketUnitPrice(price);
    if (currency) currency.textContent = currencyName;
    const submit = body.querySelector<HTMLButtonElement>('[data-transmission-consign-submit]');
    if (submit) submit.disabled = !selected;
  }

  private captureTransmissionConsignProjectionSignature(): void {
    this.transmissionConsignProjectionSignature = this.buildTransmissionConsignProjectionSignature(
      this.getTransmissionConsignItems(),
    );
  }

  private buildTransmissionConsignProjectionSignature(items: TransmissionConsignItemView[]): string {
    const encode = (value: unknown): string => {
      const text = String(value ?? '');
      return `${text.length}:${text}`;
    };
    return items.map((entry, index) => [
      index,
      entry.itemInstanceId,
      entry.techniqueId,
      entry.name,
      entry.category,
      entry.categoryLabel,
      entry.grade,
      entry.gradeLabel,
      entry.realmLevel,
      entry.realmLabel,
      entry.item.count,
      entry.item.learnTechniqueMaxLevel,
    ].map(encode).join('')).join('|');
  }

  private getOpenTransmissionConsignBody(): HTMLElement | null {
    return this.panel.getOpenTransmissionModalBody()?.querySelector<HTMLElement>('[data-transmission-consign-inline-body]') ?? null;
  }

  private closeInlineTransmissionConsignModal(): void {
    const layer = this.panel.getOpenTransmissionModalBody()?.querySelector<HTMLElement>('[data-transmission-consign-inline-layer]');
    this.inlineConsignEvents?.abort();
    this.inlineConsignEvents = null;
    this.transmissionConsignProjectionSignature = null;
    this.panel.transmissionConsignPanel = {
      ...this.panel.transmissionConsignPanel,
      open: false,
    };
    layer?.remove();
  }

  private normalizeTransmissionConsignPrice(value: number): number {
    return this.panel.normalizeTradeDialogPrice(Math.max(1, Math.trunc(Number(value) || 1)), 'up');
  }

  private getNextTransmissionConsignPrice(action: MarketPriceAction, preset: number | null = null): number {
    const current = this.normalizeTransmissionConsignPrice(this.panel.transmissionConsignPanel.unitPrice);
    return this.panel.getNextTradeDialogPrice(current, action, preset, 1);
  }
}

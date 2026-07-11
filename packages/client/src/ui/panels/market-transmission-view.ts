/**
 * 本文件是客户端 DOM UI 的传法台子视图，负责残卷寄售列表、详情与一口价求取。
 *
 * 传法台只流通玩家亲手抄录的自创功法残卷：一卷一单、一口价成交、无竞价与倒计时。
 * 功法详情不做专属组件，直接复用物品悬浮详情（残卷实例带 learnTechniqueId）。
 */
import type { S2C_TransmissionListings, TransmissionLotPageEntry } from '@mud/shared';
import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';
import { contentResolver } from '../../content/content-resolver';
import { getLocalRealmLevelEntry, getLocalTechniqueTemplate } from '../../content/local-templates';
import { getItemDisplayMeta } from '../item-display';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { formatDisplayInteger } from '../../utils/number';
import type { MarketPanelInternals, TransmissionLotView, TransmissionPanelTab } from './market-panel-types';

const TRANSMISSION_MODAL_OWNER = 'transmission-platform-panel';
const TRANSMISSION_PAGE_SIZE = 10;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

/** 传法台子视图。 */
export class MarketTransmissionView {
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
    detailModalHost.open({
      ownerId: TRANSMISSION_MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market detail-modal--auction-house',
      title: t('market.tab.transmission', undefined),
      hint: '',
      renderBody: (body: HTMLElement) => {
        replaceElementHtml(body, this.renderTransmissionBody());
      },
      onClose: () => {
        this.panel.tooltipNode = null;
        this.panel.tooltip.hide(true);
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        this.bindTransmissionEvents(body, signal);
        this.panel.bindMarketModalDelegatedEvents(body, signal);
        this.preloadTechniqueTemplates();
      },
    });
  }

  /** 服务端下发新分页后局部重绘弹层，不触碰其它面板。 */
  patchTransmissionModal(): void {
    const body = this.panel.getOpenTransmissionModalBody();
    if (!body) {
      return;
    }
    replaceElementHtml(body, this.renderTransmissionBody());
    this.preloadTechniqueTemplates();
  }

  /**
   * 自创功法（gen_ 前缀）不在客户端静态 catalog 里，悬浮详情需要功法模板才能展示
   * 境界/品阶/层数/属性。这里按可见行去重异步补齐，回来后只在弹层仍打开时重绘。
   */
  private preloadTechniqueTemplates(): void {
    const missing = new Set<string>();
    for (const lot of this.getLots()) {
      const techId = typeof lot.item?.learnTechniqueId === 'string' ? lot.item.learnTechniqueId.trim() : '';
      if (techId && !getLocalTechniqueTemplate(techId)) {
        missing.add(techId);
      }
    }
    if (missing.size === 0) {
      return;
    }
    const requestedTab = this.panel.transmissionTab;
    const requestedPage = this.panel.transmissionPage;
    void Promise.all([...missing].map((techId) => contentResolver.fetchTechnique(techId))).then(() => {
      if (!detailModalHost.isOpenFor(TRANSMISSION_MODAL_OWNER)) {
        return;
      }
      if (this.panel.transmissionTab !== requestedTab || this.panel.transmissionPage !== requestedPage) {
        return;
      }
      this.patchTransmissionModal();
    });
  }

  private getLots(): TransmissionLotView[] {
    const listings = this.panel.transmissionListings;
    if (!listings || !Array.isArray(listings.items)) {
      return [];
    }
    return listings.items.map((entry) => this.toLotView(entry));
  }

  private toLotView(entry: TransmissionLotPageEntry): TransmissionLotView {
    const item = (entry.item ?? { itemId: '', count: 1 }) as TransmissionLotView['item'];
    const meta = getItemDisplayMeta(item);
    const techId = typeof item.learnTechniqueId === 'string' ? item.learnTechniqueId.trim() : '';
    const technique = techId ? getLocalTechniqueTemplate(techId) : null;
    const realmLv = technique?.realmLv ?? null;
    return {
      id: entry.id,
      itemKey: entry.itemKey,
      item,
      itemName: technique?.name ? `《${technique.name}》` : (item.name ?? item.itemId),
      qualityLabel: meta.gradeLabel ?? '',
      realmLevelLabel: realmLv ? (getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`) : null,
      price: Math.max(1, Math.trunc(Number(entry.price) || 1)),
      sellerLabel: entry.sellerLabel,
      isMine: Boolean(entry.isMine),
      remainingQuantity: Math.max(1, Math.trunc(Number(entry.remainingQuantity) || 1)),
    };
  }

  private renderTransmissionBody(): string {
    const listings = this.panel.transmissionListings;
    if (!listings) {
      return `
        <div
          class="transmission-loading"
          role="status"
          aria-label="${escapeHtml(t('market.transmission.loading', undefined))}"
        >
          <span class="transmission-loading-indicator" aria-hidden="true"></span>
        </div>
      `;
    }
    const lots = this.getLots();
    const activeKey = this.panel.selectedTransmissionItemKey ?? lots[0]?.itemKey ?? '';
    const selected = lots.find((lot) => lot.itemKey === activeKey) ?? null;
    return `
      <div class="auction-house-board auction-house-board--transmission">
        <div class="auction-list-panel ui-surface-pane">
          ${this.renderTabRail(listings)}
          ${lots.length === 0
            ? `<div class="empty-hint">${escapeHtml(t(this.panel.transmissionTab === 'mine' ? 'market.transmission.empty.mine' : 'market.transmission.empty.participate', undefined))}</div>`
            : `<div class="auction-lot-list">${lots.map((lot) => this.renderLotRow(lot, activeKey)).join('')}</div>`}
          ${this.panel.transmissionTab === 'mine' ? this.renderConsignSection() : ''}
          ${this.renderPager(listings)}
        </div>
        <div class="auction-detail-panel ui-surface-pane">
          ${this.renderDetail(selected, listings)}
        </div>
      </div>
    `;
  }

  private renderTabRail(listings: S2C_TransmissionListings): string {
    const tabs: Array<{ id: TransmissionPanelTab; label: string; count: number }> = [
      { id: 'participate', label: t('market.tab.transmission', undefined), count: listings.counts?.participate ?? 0 },
      { id: 'mine', label: t('auction.tab.mine', undefined), count: listings.counts?.mine ?? 0 },
    ];
    return `
      <div class="ui-workspace-rail auction-tab-rail">
        ${tabs.map((tab) => `
          <button
            class="market-side-tab ui-workspace-rail-tab ${this.panel.transmissionTab === tab.id ? 'active' : ''}"
            data-transmission-tab="${escapeHtml(tab.id)}"
            type="button"
          >${escapeHtml(tab.label)}<small>${formatDisplayInteger(tab.count)}</small></button>
        `).join('')}
      </div>
    `;
  }

  private renderLotRow(lot: TransmissionLotView, activeKey: string): string {
    return `
      <button
        class="auction-lot-row ${lot.isMine ? 'auction-lot-row--mine' : ''} ${lot.itemKey === activeKey ? 'active' : ''}"
        data-transmission-select-item="${escapeHtml(lot.itemKey)}"
        data-ui-key="transmission:${escapeHtml(lot.itemKey)}"
        type="button"
      >
        ${lot.isMine ? `<span class="auction-lot-ribbon" aria-hidden="true"><span>${escapeHtml(t('auction.ribbon.mine', undefined))}</span></span>` : ''}
        <span class="auction-lot-item">
          <strong>${escapeHtml(lot.itemName)}</strong>
          <small>${escapeHtml(lot.realmLevelLabel ?? lot.sellerLabel)}</small>
        </span>
        <span class="auction-quality-tag">${escapeHtml(lot.qualityLabel)}</span>
        <span>${this.panel.formatMarketUnitPrice(lot.price)}</span>
      </button>
    `;
  }

  private renderDetail(lot: TransmissionLotView | null, listings: S2C_TransmissionListings): string {
    if (!lot) {
      return `<div class="empty-hint">${escapeHtml(t('auction.empty.select-lot', undefined))}</div>`;
    }
    const ownedCurrency = this.panel.findInventoryItemCountByItemId(listings.currencyItemId);
    const affordable = ownedCurrency >= lot.price;
    const canBuy = !lot.isMine && affordable;
    return `
      <div class="auction-detail-head">
        <div class="auction-item-icon" aria-hidden="true">${escapeHtml(lot.itemName.slice(1, 2) || '法')}</div>
        <div class="auction-detail-title">
          <div class="market-item-title market-item-title--interactive" data-market-item-tooltip="transmission:${escapeHtml(lot.itemKey)}">${escapeHtml(lot.itemName)}</div>
          <div class="market-book-subtitle">${escapeHtml(lot.realmLevelLabel ?? '')} ${escapeHtml(lot.qualityLabel)}</div>
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
        </div>
        <div class="auction-price-card ui-surface-card ui-surface-card--compact">
          <span>我的灵石</span>
          <strong>${formatDisplayInteger(ownedCurrency)}</strong>
          <small>${escapeHtml(listings.currencyItemName)}</small>
        </div>
      </div>
      <div class="auction-bid-actions">
        <button class="small-btn" data-transmission-action="buy" data-transmission-action-item="${escapeHtml(lot.itemKey)}" type="button" ${canBuy ? '' : 'disabled'}>${escapeHtml(t('market.transmission.action.buy', undefined))}</button>
      </div>
    `;
  }

  /** 背包里可寄售的残卷：必须带 learnTechniqueId，空书不可再流通。 */
  private getConsignableScrolls(): Array<{ itemInstanceId: string; label: string }> {
    return this.panel.inventory.items
      .filter((item) => item.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID
        && typeof item.learnTechniqueId === 'string'
        && item.learnTechniqueId.trim().length > 0
        && typeof item.itemInstanceId === 'string'
        && item.itemInstanceId.trim().length > 0)
      .map((item) => {
        const techId = String(item.learnTechniqueId).trim();
        const technique = getLocalTechniqueTemplate(techId);
        return {
          itemInstanceId: String(item.itemInstanceId).trim(),
          label: technique?.name ? `《${technique.name}》` : (item.name ?? techId),
        };
      });
  }

  private renderConsignSection(): string {
    const scrolls = this.getConsignableScrolls();
    if (scrolls.length === 0) {
      return '';
    }
    return `
      <div class="transmission-consign ui-surface-card ui-surface-card--compact">
        <label class="transmission-consign-field">
          <span>寄售残卷</span>
          <select data-transmission-consign-item>
            ${scrolls.map((entry) => `<option value="${escapeHtml(entry.itemInstanceId)}">${escapeHtml(entry.label)}</option>`).join('')}
          </select>
        </label>
        <label class="transmission-consign-field">
          <span>${escapeHtml(t('market.transmission.head.price', undefined))}</span>
          <input type="number" min="1" step="1" value="1" data-transmission-consign-price inputmode="numeric" />
        </label>
        <button class="small-btn" data-transmission-consign-submit type="button">寄售</button>
      </div>
    `;
  }

  private renderPager(listings: S2C_TransmissionListings): string {
    const pageSize = listings.pageSize || TRANSMISSION_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil((listings.total ?? 0) / pageSize));
    if (totalPages <= 1) {
      return '';
    }
    const page = listings.page ?? 1;
    return `
      <div class="market-pager">
        <button class="small-btn ghost" data-transmission-page="${page - 1}" type="button" ${page <= 1 ? 'disabled' : ''}>上一页</button>
        <span>${formatDisplayInteger(page)} / ${formatDisplayInteger(totalPages)}</span>
        <button class="small-btn ghost" data-transmission-page="${page + 1}" type="button" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
      </div>
    `;
  }

  private bindTransmissionEvents(body: HTMLElement, signal: AbortSignal): void {
    body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
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
      const selectNode = target.closest<HTMLElement>('[data-transmission-select-item]');
      if (selectNode) {
        this.panel.selectedTransmissionItemKey = selectNode.dataset.transmissionSelectItem ?? null;
        this.patchTransmissionModal();
        return;
      }
      const pageNode = target.closest<HTMLElement>('[data-transmission-page]');
      if (pageNode) {
        const nextPage = Math.max(1, Math.trunc(Number(pageNode.dataset.transmissionPage) || 1));
        this.panel.transmissionPage = nextPage;
        this.panel.requestTransmissionListings(nextPage);
        return;
      }
      if (target.closest('[data-transmission-consign-submit]')) {
        this.submitConsign(body);
        return;
      }
      const actionNode = target.closest<HTMLElement>('[data-transmission-action]');
      if (actionNode && actionNode.dataset.transmissionAction === 'buy') {
        const itemKey = actionNode.dataset.transmissionActionItem ?? '';
        if (itemKey) {
          this.panel.callbacks?.onBuyTransmissionLot(itemKey, itemKey);
        }
      }
    }, { signal });
  }

  private submitConsign(body: HTMLElement): void {
    const itemInstanceId = body.querySelector<HTMLSelectElement>('[data-transmission-consign-item]')?.value.trim() ?? '';
    const rawPrice = body.querySelector<HTMLInputElement>('[data-transmission-consign-price]')?.value ?? '';
    const unitPrice = Math.max(1, Math.trunc(Number(rawPrice) || 0));
    if (!itemInstanceId || unitPrice < 1) {
      return;
    }
    this.panel.callbacks?.onCreateTransmissionSellOrder(itemInstanceId, unitPrice);
  }
}

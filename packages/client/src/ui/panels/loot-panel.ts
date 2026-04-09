/**
 * 拾取面板
 * 以弹层形式展示地面物品和容器搜索结果，支持逐件或批量拿取
 */

import { LootWindowState } from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class LootPanel {
  private static readonly MODAL_OWNER = 'loot-panel';
  private static readonly MODAL_VARIANT_CLASSES = ['detail-modal--loot', 'detail-modal--herb-gather'] as const;
  private windowState: LootWindowState | null = null;
  private onTake: ((sourceId: string, itemKey: string) => void) | null = null;
  private onTakeAll: ((sourceId: string) => void) | null = null;

  setCallbacks(
    onTake: (sourceId: string, itemKey: string) => void,
    onTakeAll: (sourceId: string) => void,
  ): void {
    this.onTake = onTake;
    this.onTakeAll = onTakeAll;
  }

  clear(): void {
    this.windowState = null;
    detailModalHost.close(LootPanel.MODAL_OWNER);
  }

  /** 更新拾取窗口状态，null 时关闭弹层 */
  update(windowState: LootWindowState | null): void {
    this.windowState = windowState;
    if (!windowState) {
      detailModalHost.close(LootPanel.MODAL_OWNER);
      return;
    }
    this.render();
  }

  private render(): void {
    if (!this.windowState) {
      return;
    }

    if (this.tryPatchModal()) {
      return;
    }

    const { title, tileX, tileY } = this.windowState;
    const useHerbVariant = this.windowState.sources.some((source) => source.variant === 'herb');
    detailModalHost.open({
      ownerId: LootPanel.MODAL_OWNER,
      variantClass: useHerbVariant ? 'detail-modal--herb-gather' : 'detail-modal--loot',
      title,
      subtitle: `坐标 (${tileX}, ${tileY})`,
      bodyHtml: this.renderBody(),
      onAfterRender: (body) => {
        this.bindEvents(body);
      },
    });
  }

  private tryPatchModal(): boolean {
    if (!this.windowState || !detailModalHost.isOpenFor(LootPanel.MODAL_OWNER)) {
      return false;
    }
    const body = document.getElementById('detail-modal-body');
    if (!(body instanceof HTMLElement)) {
      return false;
    }

    this.patchModalChrome();
    const root = body.querySelector<HTMLElement>('[data-loot-window-root="true"]');
    if (!root) {
      body.innerHTML = this.renderBody();
      this.bindEvents(body);
      return true;
    }

    const previousSectionKeys = [...root.querySelectorAll<HTMLElement>('[data-loot-source-id]')]
      .map((node) => node.dataset.lootSourceId ?? '');
    const nextSectionKeys = this.windowState.sources.map((source) => source.sourceId);
    if (
      previousSectionKeys.length !== nextSectionKeys.length
      || previousSectionKeys.some((key, index) => key !== nextSectionKeys[index])
    ) {
      body.innerHTML = this.renderBody();
      this.bindEvents(body);
      return true;
    }

    const { scrollTop, scrollLeft } = body;
    const useHerbVariant = this.windowState.sources.some((source) => source.variant === 'herb');
    root.dataset.lootVariant = useHerbVariant ? 'herb' : 'default';
    root.innerHTML = this.windowState.sources.map((source) => this.renderSourceSection(source)).join('');
    body.scrollTop = scrollTop;
    body.scrollLeft = scrollLeft;
    return true;
  }

  private patchModalChrome(): void {
    if (!this.windowState) {
      return;
    }
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    const hintNode = document.getElementById('detail-modal-hint');
    if (titleNode) {
      titleNode.textContent = this.windowState.title;
    }
    const subtitle = `坐标 (${this.windowState.tileX}, ${this.windowState.tileY})`;
    if (subtitleNode) {
      subtitleNode.textContent = subtitle;
      subtitleNode.classList.toggle('hidden', !subtitle);
    }
    if (hintNode) {
      hintNode.textContent = '点击空白处关闭';
    }

    const nextVariantClass = this.windowState.sources.some((source) => source.variant === 'herb')
      ? 'detail-modal--herb-gather'
      : 'detail-modal--loot';
    const modal = document.getElementById('detail-modal');
    const card = document.getElementById('detail-modal-card');
    for (const node of [modal, card]) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      for (const className of LootPanel.MODAL_VARIANT_CLASSES) {
        node.classList.remove(className);
      }
      node.classList.add(nextVariantClass);
    }
  }

  private bindEvents(body: HTMLElement): void {
    if (body.dataset.lootPanelBound === 'true') {
      return;
    }
    body.dataset.lootPanelBound = 'true';
    body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const takeButton = target.closest<HTMLElement>('[data-loot-take="true"]');
      if (takeButton) {
        event.stopPropagation();
        const sourceId = takeButton.dataset.sourceId;
        const itemKey = takeButton.dataset.itemKey;
        if (!sourceId || !itemKey) {
          return;
        }
        this.onTake?.(sourceId, itemKey);
        return;
      }
      const takeAllButton = target.closest<HTMLElement>('[data-loot-take-all="true"]');
      if (takeAllButton) {
        event.stopPropagation();
        const sourceId = takeAllButton.dataset.sourceId;
        if (!sourceId) {
          return;
        }
        this.onTakeAll?.(sourceId);
      }
    });
  }

  private renderBody(): string {
    if (!this.windowState) {
      return '';
    }
    const useHerbVariant = this.windowState.sources.some((source) => source.variant === 'herb');
    return `
      <div data-loot-window-root="true" data-loot-variant="${useHerbVariant ? 'herb' : 'default'}">
        ${this.windowState.sources.map((source) => this.renderSourceSection(source)).join('')}
      </div>
    `;
  }

  private renderSourceSection(source: LootWindowState['sources'][number]): string {
    const isHerb = source.variant === 'herb';
    return `
      <section class="loot-source-section ${isHerb ? 'loot-source-section--herb' : ''}" data-loot-source-id="${escapeHtml(source.sourceId)}">
        <div class="loot-source-head">
          <div>
            <div class="loot-source-title">${escapeHtml(source.title)}</div>
            <div class="loot-source-subtitle">${escapeHtml(source.kind === 'ground' ? '直接拾取' : (isHerb ? `草药采集${source.herb?.grade ? ` · ${source.herb.grade}` : ''}` : `容器搜索${source.grade ? ` · ${source.grade}` : ''}`))}</div>
          </div>
          <div class="loot-source-actions">
            ${!isHerb && source.items.length > 0 ? `<button class="small-btn" data-loot-take-all="true" data-source-id="${escapeHtml(source.sourceId)}" type="button">全部拿取</button>` : ''}
            ${source.desc ? `<div class="loot-source-desc">${escapeHtml(source.desc)}</div>` : ''}
          </div>
        </div>
        ${this.renderHerbSummary(source)}
        ${this.renderSearchState(source)}
        ${this.renderItems(source)}
      </section>
    `;
  }

  private renderHerbSummary(source: LootWindowState['sources'][number]): string {
    if (source.variant !== 'herb' || !source.herb) {
      return '';
    }
    return `
      <div class="herb-gather-summary">
        <div class="herb-gather-summary-name">${escapeHtml(source.herb.name)}</div>
        <div class="herb-gather-summary-meta">
          <span>${escapeHtml(source.herb.grade ?? 'mortal')}</span>
          <span>LV ${formatDisplayInteger(source.herb.level ?? 1)}</span>
          <span>采集 ${formatDisplayInteger(source.herb.gatherTicks)} 息</span>
          <span>${source.destroyed ? '已摧毁' : '可采集'}</span>
        </div>
      </div>
    `;
  }

  private renderSearchState(source: LootWindowState['sources'][number]): string {
    const isHerb = source.variant === 'herb';
    if (!source.search || source.search.remainingTicks <= 0) {
      return '';
    }
    return `
      <div class="loot-search-state">
        <div class="loot-search-copy">
          <strong>${isHerb ? '采集中' : '搜索中'}</strong>
          <span>${formatDisplayInteger(source.search.elapsedTicks)} / ${formatDisplayInteger(source.search.totalTicks)} 息</span>
        </div>
        <div class="loot-search-bar"><span class="loot-search-fill" style="width:${Math.max(0, Math.min(100, (source.search.elapsedTicks / Math.max(1, source.search.totalTicks)) * 100))}%"></span></div>
      </div>
    `;
  }

  private renderItems(source: LootWindowState['sources'][number]): string {
    const isHerb = source.variant === 'herb';
    if (source.items.length === 0) {
      return `<div class="loot-source-empty">${escapeHtml(source.emptyText ?? '这里什么都没有。')}</div>`;
    }
    return `
      <div class="inventory-grid ${isHerb ? 'herb-gather-grid' : 'loot-item-grid'}">
        ${source.items.map((entry) => `
          <div class="${isHerb ? 'herb-gather-card' : 'inventory-cell'}">
            <div class="inventory-cell-head">
              <span class="inventory-cell-type">${source.kind === 'ground' ? '地面' : (isHerb ? '草药' : '容器')}</span>
              <span class="inventory-cell-count">${formatDisplayCountBadge(entry.item.count)}</span>
            </div>
            <div class="inventory-cell-name" title="${escapeHtml(entry.item.name)}">${escapeHtml(entry.item.name)}</div>
            ${isHerb && source.herb
              ? `<div class="herb-gather-meta">
                  <span>${escapeHtml(source.herb.grade ?? 'mortal')}</span>
                  <span>LV ${formatDisplayInteger(source.herb.level ?? 1)}</span>
                  <span>${formatDisplayInteger(source.herb.gatherTicks)} 息</span>
                </div>`
              : ''}
            <div class="inventory-cell-actions">
              <button class="small-btn" data-loot-take="true" data-source-id="${escapeHtml(source.sourceId)}" data-item-key="${escapeHtml(entry.itemKey)}" type="button">${isHerb ? '采摘' : '拿取'}</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

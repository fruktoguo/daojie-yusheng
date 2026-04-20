/**
 * 拾取面板
 * 以弹层形式展示地面物品和容器搜索结果，支持逐件或批量拿取
 */
import { LootWindowState } from '@mud/shared-next';
import { detailModalHost } from '../detail-modal-host';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** LootPanel：战利品面板实现。 */
export class LootPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'loot-panel';
  /** windowState：窗口状态。 */
  private windowState: LootWindowState | null = null;
  /** onTake：on Take。 */
  private onTake: ((sourceId: string, itemKey: string) => void) | null = null;
  /** onTakeAll：on Take All。 */
  private onTakeAll: ((sourceId: string) => void) | null = null;  
  /**
 * setCallbacks：写入Callback。
 * @param onTake (sourceId: string, itemKey: string) => void 参数说明。
 * @param onTakeAll (sourceId: string) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onTake: (sourceId: string, itemKey: string) => void,
    onTakeAll: (sourceId: string) => void,
  ): void {
    this.onTake = onTake;
    this.onTakeAll = onTakeAll;
  }

  /** clear：清理clear。 */
  clear(): void {
    this.windowState = null;
    detailModalHost.close(LootPanel.MODAL_OWNER);
  }

  /** 更新拾取窗口状态，null 时关闭弹层 */
  update(windowState: LootWindowState | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.windowState = windowState;
    if (!windowState) {
      detailModalHost.close(LootPanel.MODAL_OWNER);
      return;
    }
    this.render();
  }

  /** render：渲染渲染。 */
  private render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.windowState) {
      return;
    }

    const { tileX, tileY, title, sources } = this.windowState;
    const existingBody = detailModalHost.isOpenFor(LootPanel.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (existingBody && this.patchBody(existingBody, sources)) {
      return;
    }
    detailModalHost.open({
      ownerId: LootPanel.MODAL_OWNER,
      size: 'lg',
      variantClass: 'detail-modal--loot',
      title,
      subtitle: `坐标 (${tileX}, ${tileY})`,
      renderBody: (body) => {
        this.renderBody(body, sources);
      },
      onAfterRender: (body) => {
        this.bindEvents(body);
      },
    });
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement, sources: LootWindowState['sources']): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const shell = createElement('div', 'loot-shell');
    for (const source of sources) {
      shell.append(this.createSourceSection(source));
    }
    body.replaceChildren(shell);
  }

  /** patchBody：按 source section 粒度刷新拾取弹层。 */
  private patchBody(body: HTMLElement, sources: LootWindowState['sources']): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let shell = body.querySelector<HTMLElement>('.loot-shell');
    if (!shell) {
      shell = createElement('div', 'loot-shell');
      body.replaceChildren(shell);
    }
    const staleSections = new Map<string, HTMLElement>();
    shell.querySelectorAll<HTMLElement>('[data-loot-source-section]').forEach((section) => {
      const sourceId = section.dataset.lootSourceSection ?? '';
      if (sourceId) {
        staleSections.set(sourceId, section);
      }
    });
    for (const source of sources) {
      const nextSection = this.createSourceSection(source);
      const existing = staleSections.get(source.sourceId);
      if (existing) {
        existing.replaceWith(nextSection);
        staleSections.delete(source.sourceId);
      } else {
        shell.append(nextSection);
      }
    }
    staleSections.forEach((section) => section.remove());
    return true;
  }

  /** bindEvents：绑定事件。 */
  private bindEvents(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (body.dataset.lootBound === 'true') {
      return;
    }
    body.dataset.lootBound = 'true';
    body.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-loot-take],[data-loot-take-all]') : null;
      if (!target || !(target instanceof HTMLButtonElement)) {
        return;
      }
      event.stopPropagation();
      const sourceId = target.dataset.sourceId;
      if (!sourceId) {
        return;
      }
      if (target.dataset.lootTake === 'true') {
        const itemKey = target.dataset.itemKey;
        if (!itemKey) {
          return;
        }
        this.onTake?.(sourceId, itemKey);
        return;
      }
      if (target.dataset.lootTakeAll === 'true') {
        this.onTakeAll?.(sourceId);
      }
    });
  }

  /** createSourceSection：创建 source section。 */
  private createSourceSection(source: LootWindowState['sources'][number]): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const section = createElement('section', 'loot-source-section');
    section.dataset.lootSourceSection = source.sourceId;
    const head = createElement('div', 'loot-source-head');
    const titleWrap = createElement('div', '');
    titleWrap.append(
      createElement('div', 'loot-source-title', source.title),
      createElement('div', 'loot-source-subtitle', source.kind === 'ground' ? '直接拾取' : `容器搜索${source.grade ? ` · ${source.grade}` : ''}`),
    );
    const actions = createElement('div', 'loot-source-actions');
    if (source.items.length > 0) {
      const takeAllButton = createElement('button', 'small-btn', '全部拿取');
      takeAllButton.type = 'button';
      takeAllButton.dataset.lootTakeAll = 'true';
      takeAllButton.dataset.sourceId = source.sourceId;
      actions.append(takeAllButton);
    }
    if (source.desc) {
      actions.append(createElement('div', 'loot-source-desc', source.desc));
    }
    head.append(titleWrap, actions);
    section.append(head);
    const searchState = this.createSearchState(source);
    if (searchState) {
      section.append(searchState);
    }
    section.append(this.createItemsContent(source));
    return section;
  }

  /** createSearchState：创建搜索状态。 */
  private createSearchState(source: LootWindowState['sources'][number]): HTMLElement | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source.search || source.search.remainingTicks <= 0) {
      return null;
    }
    const searchState = createElement('div', 'loot-search-state');
    const copy = createElement('div', 'loot-search-copy');
    copy.append(
      createElement('strong', '', '搜索中'),
      createElement('span', '', `${formatDisplayInteger(source.search.elapsedTicks)} / ${formatDisplayInteger(source.search.totalTicks)} 息`),
    );
    const bar = createElement('div', 'loot-search-bar');
    const fill = createElement('span', 'loot-search-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (source.search.elapsedTicks / Math.max(1, source.search.totalTicks)) * 100))}%`;
    bar.append(fill);
    searchState.append(copy, bar);
    return searchState;
  }

  /** createItemsContent：创建物品区域。 */
  private createItemsContent(source: LootWindowState['sources'][number]): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (source.items.length <= 0) {
      return createElement('div', 'loot-source-empty', source.emptyText ?? '这里什么都没有。');
    }
    const grid = createElement('div', 'inventory-grid loot-item-grid');
    for (const entry of source.items) {
      const cell = createElement('div', 'inventory-cell');
      const head = createElement('div', 'inventory-cell-head');
      head.append(
        createElement('span', 'inventory-cell-type', source.kind === 'ground' ? '地面' : '容器'),
        createElement('span', 'inventory-cell-count', formatDisplayCountBadge(entry.item.count)),
      );
      const name = createElement('div', 'inventory-cell-name', entry.item.name);
      name.title = entry.item.name;
      const actions = createElement('div', 'inventory-cell-actions');
      const button = createElement('button', 'small-btn', '拿取');
      button.type = 'button';
      button.dataset.lootTake = 'true';
      button.dataset.sourceId = source.sourceId;
      button.dataset.itemKey = entry.itemKey;
      actions.append(button);
      cell.append(head, name, actions);
      grid.append(cell);
    }
    return grid;
  }
}

/** createElement：创建基础元素。 */
function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (typeof text === 'string') {
    element.textContent = text;
  }
  return element;
}


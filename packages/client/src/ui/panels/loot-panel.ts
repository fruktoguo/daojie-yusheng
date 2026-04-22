/**
 * 拾取面板
 * 以弹层形式展示地面物品和容器搜索结果，支持逐件或批量拿取
 */
import { LootWindowState } from '@mud/shared';
import { getTechniqueGradeLabel } from '../../domain-labels';
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

type LootHerbExtras = {
  variant?: string;
  herb?: {
    grade?: string;
    level?: number;
    gatherTicks?: number;
  };
  destroyed?: boolean;
};

function readLootHerbExtras(source: LootWindowState['sources'][number]): LootHerbExtras {
  return source as LootWindowState['sources'][number] & LootHerbExtras;
}

/** LootPanel：战利品面板实现。 */
export class LootPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'loot-panel';
  /** onManualClose：手动关闭回调。 */
  private onManualClose: (() => void) | null = null;
  /** suppressAutoOpen：手动关闭后抑制自动重开。 */
  private suppressAutoOpen = false;
  /** windowState：窗口状态。 */
  private windowState: LootWindowState | null = null;
  /** onTake：on Take。 */
  private onTake: ((sourceId: string, itemKey: string) => void) | null = null;
  /** onTakeAll：on Take All。 */
  private onTakeAll: ((sourceId: string) => void) | null = null;  
  /** onStartGather：开始草药采集。 */
  private onStartGather: ((sourceId: string, itemKey: string) => void) | null = null;
  /** onCancelGather：取消草药采集。 */
  private onCancelGather: (() => void) | null = null;
  /** onStopHarvest：停止连续采摘。 */
  private onStopHarvest: (() => void) | null = null;
  /**
 * setCallbacks：写入Callback。
 * @param onTake (sourceId: string, itemKey: string) => void 参数说明。
 * @param onTakeAll (sourceId: string) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onTake: (sourceId: string, itemKey: string) => void,
    onTakeAll: (sourceId: string) => void,
    onStartGather?: (sourceId: string, itemKey: string) => void,
    onCancelGather?: () => void,
    onStopHarvest?: () => void,
    onManualClose?: () => void,
  ): void {
    this.onTake = onTake;
    this.onTakeAll = onTakeAll;
    this.onStartGather = onStartGather ?? null;
    this.onCancelGather = onCancelGather ?? null;
    this.onStopHarvest = onStopHarvest ?? null;
    this.onManualClose = onManualClose ?? null;
  }

  /** clear：清理clear。 */
  clear(): void {
    this.windowState = null;
    this.suppressAutoOpen = false;
    detailModalHost.close(LootPanel.MODAL_OWNER);
  }

  /** 更新拾取窗口状态，null 时关闭弹层 */
  update(windowState: LootWindowState | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.windowState = windowState;
    if (!windowState) {
      this.suppressAutoOpen = false;
      detailModalHost.close(LootPanel.MODAL_OWNER);
      return;
    }
    if (this.suppressAutoOpen) {
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
    const useHerbVariant = sources.some((source) => readLootHerbExtras(source).variant === 'herb');
    const existingBody = detailModalHost.isOpenFor(LootPanel.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (existingBody && this.patchBody(existingBody, sources)) {
      this.patchModalChrome(title, tileX, tileY, useHerbVariant);
      return;
    }
    detailModalHost.open({
      ownerId: LootPanel.MODAL_OWNER,
      variantClass: useHerbVariant ? 'detail-modal--herb-gather' : 'detail-modal--loot',
      title,
      subtitle: `坐标 (${tileX}, ${tileY})`,
      hint: '点击空白处关闭',
      renderBody: (body) => {
        this.renderBody(body, sources);
      },
      onClose: () => {
        this.suppressAutoOpen = true;
        this.onManualClose?.();
      },
      onAfterRender: (body) => {
        this.bindEvents(body);
      },
    });
  }

  /** patchModalChrome：同步标题栏和 variant 外观。 */
  private patchModalChrome(title: string, tileX: number, tileY: number, useHerbVariant: boolean): void {
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    const hintNode = document.getElementById('detail-modal-hint');
    if (titleNode) {
      titleNode.textContent = title;
    }
    if (subtitleNode) {
      subtitleNode.textContent = `坐标 (${tileX}, ${tileY})`;
      subtitleNode.classList.remove('hidden');
    }
    if (hintNode) {
      hintNode.textContent = '点击空白处关闭';
    }
    for (const node of [document.getElementById('detail-modal'), document.getElementById('detail-modal-card')]) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      node.classList.remove('detail-modal--loot', 'detail-modal--herb-gather');
      node.classList.add(useHerbVariant ? 'detail-modal--herb-gather' : 'detail-modal--loot');
    }
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
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-loot-take],[data-loot-take-all],[data-loot-start-gather],[data-loot-cancel-gather],[data-loot-stop-harvest]')
        : null;
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
      if (target.dataset.lootStartGather === 'true') {
        const itemKey = target.dataset.itemKey;
        if (!itemKey) {
          return;
        }
        this.onStartGather?.(sourceId, itemKey);
        return;
      }
      if (target.dataset.lootTakeAll === 'true') {
        this.onTakeAll?.(sourceId);
        return;
      }
      if (target.dataset.lootCancelGather === 'true') {
        this.onCancelGather?.();
        return;
      }
      if (target.dataset.lootStopHarvest === 'true') {
        this.onStopHarvest?.();
      }
    });
  }

  /** isHarvestSource：判断是否连续采摘来源。 */
  private isHarvestSource(source: LootWindowState['sources'][number]): boolean {
    return source.kind === 'ground' && source.searchable;
  }

  /** getSourceSubtitle：读取来源副标题。 */
  private getSourceSubtitle(source: LootWindowState['sources'][number]): string {
    const extras = readLootHerbExtras(source);
    const isHerb = extras.variant === 'herb';
    const herbGrade = extras.herb?.grade;
    const gradeLabel = getTechniqueGradeLabel((isHerb ? herbGrade : source.grade) ?? '', (isHerb ? herbGrade : source.grade) ?? '');
    if (isHerb) {
      return `草药采集${gradeLabel ? ` · ${gradeLabel}` : ''}`;
    }
    if (source.kind === 'ground') {
      return '直接拾取';
    }
    return `容器搜索${gradeLabel ? ` · ${gradeLabel}` : ''}`;
  }

  /** getSearchHeading：读取搜索态标题。 */
  private getSearchHeading(source: LootWindowState['sources'][number]): string {
    return this.isHarvestSource(source) ? '连续采摘中' : '搜索中';
  }

  /** createSourceSection：创建 source section。 */
  private createSourceSection(source: LootWindowState['sources'][number]): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const extras = readLootHerbExtras(source);
    const isHerb = extras.variant === 'herb';
    const harvestSource = this.isHarvestSource(source);
    const section = createElement('section', `loot-source-section${isHerb ? ' loot-source-section--herb' : ''}`);
    section.dataset.lootSourceSection = source.sourceId;
    const head = createElement('div', 'loot-source-head');
    const titleWrap = createElement('div', '');
    titleWrap.append(
      createElement('div', 'loot-source-title', source.title),
      createElement('div', 'loot-source-subtitle', this.getSourceSubtitle(source)),
    );
    const actions = createElement('div', 'loot-source-actions');
    if (source.items.length > 0 && !harvestSource) {
      const takeAllButton = createElement('button', 'small-btn', '全部拿取');
      takeAllButton.type = 'button';
      takeAllButton.dataset.lootTakeAll = 'true';
      takeAllButton.dataset.sourceId = source.sourceId;
      actions.append(takeAllButton);
    }
    if (!isHerb && source.search && source.search.remainingTicks > 0) {
      const stopButton = createElement('button', `small-btn ${harvestSource ? 'danger' : 'ghost'}`, harvestSource ? '停止采集' : '停止搜索');
      stopButton.type = 'button';
      stopButton.dataset.lootStopHarvest = 'true';
      stopButton.dataset.sourceId = source.sourceId;
      actions.append(stopButton);
    }
    if (source.desc) {
      actions.append(createElement('div', 'loot-source-desc', source.desc));
    }
    head.append(titleWrap, actions);
    section.append(head);
    const herbSummary = this.createHerbSummary(source);
    if (herbSummary) {
      section.append(herbSummary);
    }
    const searchState = this.createSearchState(source);
    if (searchState) {
      section.append(searchState);
    }
    section.append(this.createItemsContent(source));
    return section;
  }

  /** createHerbSummary：创建草药采集摘要。 */
  private createHerbSummary(source: LootWindowState['sources'][number]): HTMLElement | null {
    const extras = readLootHerbExtras(source);
    if (extras.variant !== 'herb' || !extras.herb) {
      return null;
    }
    const totalCount = source.items.reduce((sum, entry) => sum + Math.max(0, Math.floor(entry.item.count || 0)), 0);
    const gradeLabel = extras.herb.grade ? getTechniqueGradeLabel(extras.herb.grade, extras.herb.grade) : '';
    const harvesting = Boolean(source.search && source.search.remainingTicks > 0);
    const summary = createElement('div', 'herb-gather-summary');
    const meta = createElement('div', 'herb-gather-summary-meta');
    if (gradeLabel) {
      meta.append(createElement('span', '', gradeLabel));
    }
    meta.append(
      createElement('span', '', `LV ${formatDisplayInteger(extras.herb.level ?? 1)}`),
      createElement('span', '', `采集 ${formatDisplayInteger(extras.herb.gatherTicks ?? 0)} 息`),
      createElement('span', '', `存量 ${formatDisplayInteger(totalCount)} 朵`),
      createElement('span', '', extras.destroyed ? '已摧毁' : '可采集'),
    );
    summary.append(meta);
    if (harvesting) {
      const actions = createElement('div', 'herb-gather-summary-actions');
      const stopButton = createElement('button', 'small-btn danger', '停止采集');
      stopButton.type = 'button';
      stopButton.dataset.lootCancelGather = 'true';
      stopButton.dataset.sourceId = source.sourceId;
      actions.append(stopButton);
      summary.append(actions);
    }
    return summary;
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
      createElement('strong', '', this.getSearchHeading(source)),
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

    const harvestSource = this.isHarvestSource(source);
    const isHerb = readLootHerbExtras(source).variant === 'herb';
    const harvesting = Boolean(source.search && source.search.remainingTicks > 0);
    if (source.items.length <= 0) {
      return createElement('div', 'loot-source-empty', source.emptyText ?? '这里什么都没有。');
    }
    const grid = createElement('div', `inventory-grid ${isHerb ? 'herb-gather-grid' : 'loot-item-grid'}`);
    for (const entry of source.items) {
      const cell = createElement('div', isHerb ? 'herb-gather-card' : 'inventory-cell');
      const head = createElement('div', 'inventory-cell-head');
      head.append(
        createElement('span', 'inventory-cell-type', isHerb ? '当前库存' : source.kind === 'ground' ? '地面' : '容器'),
        createElement('span', 'inventory-cell-count', formatDisplayCountBadge(entry.item.count)),
      );
      const name = createElement('div', 'inventory-cell-name', isHerb ? '点击开始连续采摘' : entry.item.name);
      name.title = isHerb ? '点击开始连续采摘当前草药' : entry.item.name;
      const actions = createElement('div', 'inventory-cell-actions');
      const button = createElement('button', 'small-btn', isHerb ? (harvesting ? '连续采摘中' : '开始采摘') : '拿取');
      button.type = 'button';
      if (isHerb) {
        button.dataset.lootStartGather = 'true';
      } else {
        button.dataset.lootTake = 'true';
      }
      button.dataset.sourceId = source.sourceId;
      button.dataset.itemKey = entry.itemKey;
      button.disabled = isHerb && harvesting;
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

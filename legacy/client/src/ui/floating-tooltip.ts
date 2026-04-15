/**
 * 通用浮动提示框
 * 跟随鼠标显示标题、多行文本及可选的侧栏卡片
 */

import { clientToViewportPoint, getResponsiveViewportMetrics, getViewportRoot } from './responsive-viewport';

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** FloatingTooltipShowOptions：定义该接口的能力与字段约束。 */
interface FloatingTooltipShowOptions {
  allowHtml?: boolean;
  asideCards?: Array<{
    mark?: string;
/** title：定义该变量以承载业务值。 */
    title: string;
/** lines：定义该变量以承载业务值。 */
    lines: string[];
    tone?: 'buff' | 'debuff';
  }>;
}

/** prefersPinnedTooltipInteraction：执行对应的业务逻辑。 */
export function prefersPinnedTooltipInteraction(win: Window = window): boolean {
  if (typeof win.matchMedia !== 'function') {
    return false;
  }
  return win.matchMedia('(pointer: coarse)').matches || win.matchMedia('(hover: none)').matches;
}

/** FloatingTooltip：封装相关状态与行为。 */
export class FloatingTooltip {
/** el：定义该变量以承载业务值。 */
  private readonly el: HTMLDivElement;
  private lastPoint = { x: 0, y: 0 };
  private pinned = false;
/** pinnedAnchor：定义该变量以承载业务值。 */
  private pinnedAnchor: Element | null = null;

/** constructor：处理当前场景中的对应操作。 */
  constructor(className = 'floating-tooltip') {
    this.el = document.createElement('div');
    this.el.className = className;
    (getViewportRoot(document) ?? document.body).appendChild(this.el);
    document.addEventListener('pointerdown', (event) => {
      if (!this.pinned) {
        return;
      }
/** target：定义该变量以承载业务值。 */
      const target = event.target;
      if (target instanceof Node && this.pinnedAnchor?.contains(target)) {
        return;
      }
      this.hide(true);
    }, true);
  }

  /** 显示提示框并定位到鼠标附近 */
  show(title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
    if (this.pinned) {
      return;
    }
    this.render(title, lines, clientX, clientY, options);
  }

/** showPinned：执行对应的业务逻辑。 */
  showPinned(anchor: Element, title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
    this.pinned = true;
    this.pinnedAnchor = anchor;
    this.render(title, lines, clientX, clientY, options);
  }

/** updateContent：执行对应的业务逻辑。 */
  updateContent(title: string, lines: string[], options?: FloatingTooltipShowOptions): void {
    if (!this.el.classList.contains('visible')) {
      return;
    }
    this.render(title, lines, this.lastPoint.x, this.lastPoint.y, options);
  }

/** isPinned：执行对应的业务逻辑。 */
  isPinned(): boolean {
    return this.pinned;
  }

/** isPinnedTo：执行对应的业务逻辑。 */
  isPinnedTo(anchor: Element | null): boolean {
    return !!anchor && this.pinned && this.pinnedAnchor === anchor;
  }

/** render：执行对应的业务逻辑。 */
  private render(title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
/** content：定义该变量以承载业务值。 */
    const content = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
/** renderedContent：定义该变量以承载业务值。 */
    const renderedContent = content
      .map((line) => `<span class="floating-tooltip-line">${options?.allowHtml ? line : escapeHtml(line)}</span>`)
      .join('');
/** asideCards：定义该变量以承载业务值。 */
    const asideCards = options?.asideCards ?? [];
/** renderedAside：定义该变量以承载业务值。 */
    const renderedAside = asideCards.length > 0
      ? `<div class="floating-tooltip-aside">${asideCards.map((card) => {
/** detail：定义该变量以承载业务值。 */
        const detail = card.lines
          .map((line) => `<span class="floating-tooltip-aside-line">${escapeHtml(line)}</span>`)
          .join('');
        return `<div class="floating-tooltip-aside-card ${card.tone === 'debuff' ? 'debuff' : 'buff'}">
          <div class="floating-tooltip-aside-head">
            ${card.mark ? `<span class="floating-tooltip-aside-mark">${escapeHtml(card.mark)}</span>` : ''}
            <strong>${escapeHtml(card.title)}</strong>
          </div>
          ${detail ? `<div class="floating-tooltip-aside-detail">${detail}</div>` : ''}
        </div>`;
      }).join('')}</div>`
      : '';
    this.el.innerHTML = `<div class="floating-tooltip-shell"><div class="floating-tooltip-body"><strong>${escapeHtml(title)}</strong>${content.length > 0 ? `<div class="floating-tooltip-detail">${renderedContent}</div>` : ''}</div>${renderedAside}</div>`;
    this.el.classList.add('visible');
    this.move(clientX, clientY);
  }

  /** 跟随鼠标移动重新定位，自动避免溢出视口 */
  move(clientX: number, clientY: number): void {
    this.lastPoint = { x: clientX, y: clientY };
/** padding：定义该变量以承载业务值。 */
    const padding = 12;
/** offsetX：定义该变量以承载业务值。 */
    const offsetX = 16;
/** offsetY：定义该变量以承载业务值。 */
    const offsetY = 12;
/** metrics：定义该变量以承载业务值。 */
    const metrics = getResponsiveViewportMetrics(window);
/** point：定义该变量以承载业务值。 */
    const point = clientToViewportPoint(window, clientX, clientY);
/** viewportWidth：定义该变量以承载业务值。 */
    const viewportWidth = metrics.viewportWidth;
/** viewportHeight：定义该变量以承载业务值。 */
    const viewportHeight = metrics.viewportHeight;
    this.el.style.left = '0px';
    this.el.style.top = '0px';
/** rect：定义该变量以承载业务值。 */
    const rect = this.el.getBoundingClientRect();
/** renderedWidth：定义该变量以承载业务值。 */
    const renderedWidth = metrics.locked ? rect.width / metrics.scale : rect.width;
/** renderedHeight：定义该变量以承载业务值。 */
    const renderedHeight = metrics.locked ? rect.height / metrics.scale : rect.height;
/** left：定义该变量以承载业务值。 */
    const left = Math.max(padding, Math.min(point.x + offsetX, viewportWidth - renderedWidth - padding));
/** top：定义该变量以承载业务值。 */
    const top = Math.max(padding, Math.min(point.y + offsetY, viewportHeight - renderedHeight - padding));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

/** hide：执行对应的业务逻辑。 */
  hide(force = false): void {
    if (this.pinned && !force) {
      return;
    }
    this.pinned = false;
    this.pinnedAnchor = null;
    this.el.classList.remove('visible');
  }

  /** 使用上次记录的坐标重新定位（窗口 resize 后调用） */
  refresh(): void {
    if (!this.el.classList.contains('visible')) return;
    this.move(this.lastPoint.x, this.lastPoint.y);
  }
}


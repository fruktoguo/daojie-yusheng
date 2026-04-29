/**
 * 通用浮动提示框
 * 跟随鼠标显示标题、多行文本及可选的侧栏卡片
 */

import {
  clientToViewportPoint,
  getResponsiveViewportMetrics,
  getViewportRoot,
  RESPONSIVE_VIEWPORT_CHANGE_EVENT,
} from './responsive-viewport';

const FLOATING_TOOLTIP_ROOT_ID = 'floating-tooltip-root';
const FLOATING_TOOLTIP_ROOT_Z_INDEX = '4000';

let floatingTooltipRoot: HTMLDivElement | null = null;
let floatingTooltipRootBound = false;

/** syncFloatingTooltipRoot：同步 tooltip 顶层容器，确保其位于详情弹层之上。 */
function syncFloatingTooltipRoot(win: Window = window): HTMLDivElement | null {
  const doc = win.document;
  if (!doc.body) {
    return null;
  }
  if (!floatingTooltipRoot || !floatingTooltipRoot.isConnected) {
    const existing = doc.getElementById(FLOATING_TOOLTIP_ROOT_ID);
    floatingTooltipRoot = existing instanceof HTMLDivElement ? existing : doc.createElement('div');
    floatingTooltipRoot.id = FLOATING_TOOLTIP_ROOT_ID;
    if (!floatingTooltipRoot.isConnected) {
      doc.body.appendChild(floatingTooltipRoot);
    }
  }
  const root = floatingTooltipRoot;
  const metrics = getResponsiveViewportMetrics(win);
  root.style.position = 'fixed';
  root.style.pointerEvents = 'none';
  root.style.overflow = 'visible';
  root.style.background = 'transparent';
  root.style.transformOrigin = 'center center';
  root.style.zIndex = FLOATING_TOOLTIP_ROOT_Z_INDEX;
  root.style.margin = '0';
  root.style.padding = '0';

  if (!metrics.locked) {
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100vw';
    root.style.height = '100dvh';
    root.style.transform = 'none';
    return root;
  }

  root.style.right = 'auto';
  root.style.bottom = 'auto';
  root.style.left = '50%';
  root.style.top = '50%';
  root.style.width = `${metrics.viewportWidth}px`;
  root.style.height = `${metrics.viewportHeight}px`;
  root.style.transform = `translate(-50%, -50%) scale(${metrics.scale.toFixed(6)})`;
  return root;
}

/** getFloatingTooltipRoot：读取或创建专用 tooltip 顶层容器。 */
function getFloatingTooltipRoot(doc: Document = document): HTMLElement | null {
  const root = syncFloatingTooltipRoot(doc.defaultView ?? window);
  if (!floatingTooltipRootBound) {
    floatingTooltipRootBound = true;
    window.addEventListener(RESPONSIVE_VIEWPORT_CHANGE_EVENT, () => {
      syncFloatingTooltipRoot(window);
    });
  }
  return root;
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 浮动提示的展示参数，控制 HTML 渲染和右侧辅助卡片。 */
interface FloatingTooltipShowOptions {
/**
 * allowHtml：allowHtml相关字段。
 */

  allowHtml?: boolean;  
  /**
 * asideCards：asideCard相关字段。
 */

  asideCards?: Array<{  
  /**
 * mark：mark相关字段。
 */

    mark?: string;    
    /**
 * title：title名称或显示文本。
 */

    title: string;    
    /**
 * lines：line相关字段。
 */

    lines: string[];    
    /**
 * tone：tone相关字段。
 */

    tone?: 'buff' | 'debuff';
  }>;
}

/** prefersPinnedTooltipInteraction：处理prefers Pinned提示交互。 */
export function prefersPinnedTooltipInteraction(win: Window = window): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof win.matchMedia !== 'function') {
    return false;
  }
  return win.matchMedia('(pointer: coarse)').matches || win.matchMedia('(hover: none)').matches;
}

/** FloatingTooltip：Floating提示实现。 */
export class FloatingTooltip {
  /** el：el。 */
  private readonly el: HTMLDivElement;
  /** lastPoint：last坐标。 */
  private lastPoint = { x: 0, y: 0 };
  /** pinned：pinned。 */
  private pinned = false;
  /** pinnedAnchor：pinned Anchor。 */
  private pinnedAnchor: Element | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param className 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(className = 'floating-tooltip') {
    this.el = document.createElement('div');
    this.el.className = className;
    (getFloatingTooltipRoot(document) ?? getViewportRoot(document) ?? document.body).appendChild(this.el);
    document.addEventListener('pointerdown', (event) => {
      if (!this.pinned) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && this.pinnedAnchor?.contains(target)) {
        return;
      }
      this.hide(true);
    }, true);
  }

  /** 显示提示框并定位到鼠标附近 */
  show(title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.pinned) {
      return;
    }
    this.render(title, lines, clientX, clientY, options);
  }

  /** showPinned：处理显示Pinned。 */
  showPinned(anchor: Element, title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
    this.pinned = true;
    this.pinnedAnchor = anchor;
    this.render(title, lines, clientX, clientY, options);
  }

  /** updateContent：更新Content。 */
  updateContent(title: string, lines: string[], options?: FloatingTooltipShowOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.el.classList.contains('visible')) {
      return;
    }
    this.render(title, lines, this.lastPoint.x, this.lastPoint.y, options);
  }

  /** isPinned：判断是否Pinned。 */
  isPinned(): boolean {
    return this.pinned;
  }

  /** isPinnedTo：判断是否Pinned To。 */
  isPinnedTo(anchor: Element | null): boolean {
    return !!anchor && this.pinned && this.pinnedAnchor === anchor;
  }

  /** render：渲染渲染。 */
  private render(title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
    const content = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const renderedContent = content
      .map((line) => `<span class="floating-tooltip-line">${options?.allowHtml ? line : escapeHtml(line)}</span>`)
      .join('');
    const asideCards = options?.asideCards ?? [];
    const renderedAside = asideCards.length > 0
      ? `<div class="floating-tooltip-aside">${asideCards.map((card) => {
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
    const padding = 12;
    const offsetX = 16;
    const offsetY = 12;
    const metrics = getResponsiveViewportMetrics(window);
    const point = clientToViewportPoint(window, clientX, clientY);
    const viewportWidth = metrics.viewportWidth;
    const viewportHeight = metrics.viewportHeight;
    this.el.style.left = '0px';
    this.el.style.top = '0px';
    const rect = this.el.getBoundingClientRect();
    const renderedWidth = metrics.locked ? rect.width / metrics.scale : rect.width;
    const renderedHeight = metrics.locked ? rect.height / metrics.scale : rect.height;
    const left = Math.max(padding, Math.min(point.x + offsetX, viewportWidth - renderedWidth - padding));
    const top = Math.max(padding, Math.min(point.y + offsetY, viewportHeight - renderedHeight - padding));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  /** hide：处理hide。 */
  hide(force = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.pinned && !force) {
      return;
    }
    this.pinned = false;
    this.pinnedAnchor = null;
    this.el.classList.remove('visible');
  }

  /** 使用上次记录的坐标重新定位（窗口 resize 后调用） */
  refresh(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.el.classList.contains('visible')) return;
    this.move(this.lastPoint.x, this.lastPoint.y);
  }
}


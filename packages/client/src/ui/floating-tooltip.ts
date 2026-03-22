/**
 * 通用浮动提示框
 * 跟随鼠标显示标题、多行文本及可选的侧栏卡片
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface FloatingTooltipShowOptions {
  allowHtml?: boolean;
  asideCards?: Array<{
    mark?: string;
    title: string;
    lines: string[];
    tone?: 'buff' | 'debuff';
  }>;
}

export class FloatingTooltip {
  private readonly el: HTMLDivElement;
  private lastPoint = { x: 0, y: 0 };

  constructor(className = 'floating-tooltip') {
    this.el = document.createElement('div');
    this.el.className = className;
    document.body.appendChild(this.el);
  }

  /** 显示提示框并定位到鼠标附近 */
  show(title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
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
    const { innerWidth, innerHeight } = window;
    this.el.style.left = '0px';
    this.el.style.top = '0px';
    const rect = this.el.getBoundingClientRect();
    const left = Math.max(padding, Math.min(clientX + offsetX, innerWidth - rect.width - padding));
    const top = Math.max(padding, Math.min(clientY + offsetY, innerHeight - rect.height - padding));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void {
    this.el.classList.remove('visible');
  }

  /** 使用上次记录的坐标重新定位（窗口 resize 后调用） */
  refresh(): void {
    if (!this.el.classList.contains('visible')) return;
    this.move(this.lastPoint.x, this.lastPoint.y);
  }
}

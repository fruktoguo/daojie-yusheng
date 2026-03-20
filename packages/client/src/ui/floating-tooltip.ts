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
}

export class FloatingTooltip {
  private readonly el: HTMLDivElement;
  private lastPoint = { x: 0, y: 0 };

  constructor(className = 'floating-tooltip') {
    this.el = document.createElement('div');
    this.el.className = className;
    document.body.appendChild(this.el);
  }

  show(title: string, lines: string[], clientX: number, clientY: number, options?: FloatingTooltipShowOptions): void {
    const content = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const renderedContent = content
      .map((line) => `<span class="floating-tooltip-line">${options?.allowHtml ? line : escapeHtml(line)}</span>`)
      .join('');
    this.el.innerHTML = `<div class="floating-tooltip-body"><strong>${escapeHtml(title)}</strong>${content.length > 0 ? `<div class="floating-tooltip-detail">${renderedContent}</div>` : ''}</div>`;
    this.el.classList.add('visible');
    this.move(clientX, clientY);
  }

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

  refresh(): void {
    if (!this.el.classList.contains('visible')) return;
    this.move(this.lastPoint.x, this.lastPoint.y);
  }
}

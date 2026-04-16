import { FloatingTooltip } from './ui/floating-tooltip';

export type ObserveAsideCard = {
  mark?: string;
  title: string;
  lines: string[];
  tone?: 'buff' | 'debuff';
};

/** createFragmentFromHtml：从 HTML 创建片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

/** createObserveModalController：创建观察弹层控制器。 */
export function createObserveModalController(options: {
  observeModalEl: HTMLElement | null;
  observeModalBodyEl: HTMLElement | null;
  observeModalSubtitleEl: HTMLElement | null;
  observeModalAsideEl: HTMLElement | null;
  observeBuffTooltip: FloatingTooltip;
  escapeHtml: (value: string) => string;
}) {
  const {
    observeModalEl,
    observeModalBodyEl,
    observeModalSubtitleEl,
    observeModalAsideEl,
    observeBuffTooltip,
    escapeHtml,
  } = options;

  return {
    hide(): void {
      observeBuffTooltip.hide(true);
      observeModalEl?.classList.add('hidden');
      observeModalEl?.setAttribute('aria-hidden', 'true');
      observeModalAsideEl?.classList.add('hidden');
      observeModalAsideEl?.setAttribute('aria-hidden', 'true');
      if (observeModalAsideEl) {
        observeModalAsideEl.replaceChildren();
      }
    },
    setSubtitle(targetX: number, targetY: number): void {
      if (observeModalSubtitleEl) {
        observeModalSubtitleEl.textContent = `坐标 (${targetX}, ${targetY})`;
      }
    },
    renderBody(html: string): void {
      if (!observeModalBodyEl) {
        return;
      }
      observeModalBodyEl.replaceChildren(createFragmentFromHtml(html));
    },
    renderAsideCards(cards: ObserveAsideCard[]): void {
      if (!observeModalAsideEl) {
        return;
      }
      if (cards.length === 0) {
        observeModalAsideEl.replaceChildren();
        observeModalAsideEl.classList.add('hidden');
        observeModalAsideEl.setAttribute('aria-hidden', 'true');
        return;
      }
      observeModalAsideEl.replaceChildren(createFragmentFromHtml(cards.map((card) => {
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
      }).join('')));
      observeModalAsideEl.classList.remove('hidden');
      observeModalAsideEl.setAttribute('aria-hidden', 'false');
    },
    show(): void {
      observeModalEl?.classList.remove('hidden');
      observeModalEl?.setAttribute('aria-hidden', 'false');
    },
  };
}

/** formatZoom：格式化缩放值。 */
export function formatZoom(zoom: number): string {
  return zoom.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** refreshZoomChrome：刷新缩放 UI。 */
export function refreshZoomChrome(
  zoom: number,
  zoomSlider: HTMLInputElement | null,
  zoomLevelEl: HTMLElement | null,
): void {
  if (zoomSlider) {
    zoomSlider.value = zoom.toFixed(2);
  }
  if (zoomLevelEl) {
    zoomLevelEl.replaceChildren(createFragmentFromHtml(`<span>x</span><span>${formatZoom(zoom)}</span>`));
  }
}

/** bindZoomControls：绑定缩放控件。 */
export function bindZoomControls(options: {
  zoomSlider: HTMLInputElement | null;
  zoomResetBtn: HTMLButtonElement | null;
  minZoom: number;
  maxZoom: number;
  applyZoomChange: (nextZoom: number) => number;
  showToast: (message: string) => void;
}): void {
  const {
    zoomSlider,
    zoomResetBtn,
    minZoom,
    maxZoom,
    applyZoomChange,
    showToast,
  } = options;
  zoomSlider?.setAttribute('min', String(minZoom));
  zoomSlider?.setAttribute('max', String(maxZoom));
  zoomSlider?.addEventListener('input', () => {
    applyZoomChange(Number(zoomSlider.value));
  });
  zoomSlider?.addEventListener('change', () => {
    const zoom = applyZoomChange(Number(zoomSlider.value));
    showToast(`缩放已调整为 ${formatZoom(zoom)}x`);
  });
  zoomResetBtn?.addEventListener('click', () => {
    const zoom = applyZoomChange(2);
    showToast(`缩放已重置为 ${formatZoom(zoom)}x`);
  });
}

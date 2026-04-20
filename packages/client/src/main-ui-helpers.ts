import { FloatingTooltip } from './ui/floating-tooltip';
/**
 * ObserveAsideCard：统一结构类型，保证协议与运行时一致性。
 */


export type ObserveAsideCard = {
/**
 * mark：对象字段。
 */

  mark?: string;  
  /**
 * title：对象字段。
 */

  title: string;  
  /**
 * lines：对象字段。
 */

  lines: string[];  
  /**
 * tone：对象字段。
 */

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
/**
 * observeModalEl：对象字段。
 */

  observeModalEl: HTMLElement | null;  
  /**
 * observeModalBodyEl：对象字段。
 */

  observeModalBodyEl: HTMLElement | null;  
  /**
 * observeModalSubtitleEl：对象字段。
 */

  observeModalSubtitleEl: HTMLElement | null;  
  /**
 * observeModalAsideEl：对象字段。
 */

  observeModalAsideEl: HTMLElement | null;  
  /**
 * observeBuffTooltip：对象字段。
 */

  observeBuffTooltip: FloatingTooltip;  
  /**
 * escapeHtml：对象字段。
 */

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
  /**
 * hide：执行核心业务逻辑。
 * @returns void。
 */

    hide(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      observeBuffTooltip.hide(true);
      observeModalEl?.classList.add('hidden');
      observeModalEl?.setAttribute('aria-hidden', 'true');
      observeModalAsideEl?.classList.add('hidden');
      observeModalAsideEl?.setAttribute('aria-hidden', 'true');
      if (observeModalAsideEl) {
        observeModalAsideEl.replaceChildren();
      }
    },    
    /**
 * setSubtitle：更新/写入相关状态。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns void。
 */

    setSubtitle(targetX: number, targetY: number): void {
      if (observeModalSubtitleEl) {
        observeModalSubtitleEl.textContent = `坐标 (${targetX}, ${targetY})`;
      }
    },    
    /**
 * renderBody：执行核心业务逻辑。
 * @param html string 参数说明。
 * @returns void。
 */

    renderBody(html: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!observeModalBodyEl) {
        return;
      }
      observeModalBodyEl.replaceChildren(createFragmentFromHtml(html));
    },    
    /**
 * renderAsideCards：执行核心业务逻辑。
 * @param cards ObserveAsideCard[] 参数说明。
 * @returns void。
 */

    renderAsideCards(cards: ObserveAsideCard[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * show：执行核心业务逻辑。
 * @returns void。
 */

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (zoomSlider) {
    zoomSlider.value = zoom.toFixed(2);
  }
  if (zoomLevelEl) {
    zoomLevelEl.replaceChildren(createFragmentFromHtml(`<span>x</span><span>${formatZoom(zoom)}</span>`));
  }
}

/** bindZoomControls：绑定缩放控件。 */
export function bindZoomControls(options: {
/**
 * zoomSlider：对象字段。
 */

  zoomSlider: HTMLInputElement | null;  
  /**
 * zoomResetBtn：对象字段。
 */

  zoomResetBtn: HTMLButtonElement | null;  
  /**
 * minZoom：对象字段。
 */

  minZoom: number;  
  /**
 * maxZoom：对象字段。
 */

  maxZoom: number;  
  /**
 * applyZoomChange：对象字段。
 */

  applyZoomChange: (nextZoom: number) => number;  
  /**
 * showToast：对象字段。
 */

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

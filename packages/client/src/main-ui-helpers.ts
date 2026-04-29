import { FloatingTooltip } from './ui/floating-tooltip';
/**
 * ObserveAsideCard：统一结构类型，保证协议与运行时一致性。
 */


export type ObserveAsideCard = {
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
 * observeModalEl：observe弹层El相关字段。
 */

  observeModalEl: HTMLElement | null;  
  /**
 * observeModalBodyEl：observe弹层BodyEl相关字段。
 */

  observeModalBodyEl: HTMLElement | null;  
  /**
 * observeModalSubtitleEl：observe弹层SubtitleEl相关字段。
 */

  observeModalSubtitleEl: HTMLElement | null;  
  /**
 * observeModalAsideEl：observe弹层AsideEl相关字段。
 */

  observeModalAsideEl: HTMLElement | null;  
  /**
 * observeBuffTooltip：observeBuff提示相关字段。
 */

  observeBuffTooltip: FloatingTooltip;  
  /**
 * escapeHtml：escapeHtml相关字段。
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
 * hide：执行hide相关逻辑。
 * @returns 无返回值，直接更新hide相关状态。
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
 * setSubtitle：写入Subtitle。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 无返回值，直接更新Subtitle相关状态。
 */

    setSubtitle(targetX: number, targetY: number): void {
      if (observeModalSubtitleEl) {
        observeModalSubtitleEl.textContent = `坐标 (${targetX}, ${targetY})`;
      }
    },    
    /**
 * renderBody：执行Body相关逻辑。
 * @param html string 参数说明。
 * @returns 无返回值，直接更新Body相关状态。
 */

    renderBody(html: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!observeModalBodyEl) {
        return;
      }
      observeModalBodyEl.replaceChildren(createFragmentFromHtml(html));
    },    
    /**
 * renderAsideCards：执行AsideCard相关逻辑。
 * @param cards ObserveAsideCard[] 参数说明。
 * @returns 无返回值，直接更新AsideCard相关状态。
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
 * show：执行show相关逻辑。
 * @returns 无返回值，直接更新show相关状态。
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
 * zoomSlider：zoomSlider相关字段。
 */

  zoomSlider: HTMLInputElement | null;  
  /**
 * zoomResetBtn：zoomResetBtn相关字段。
 */

  zoomResetBtn: HTMLButtonElement | null;  
  /**
 * minZoom：minZoom相关字段。
 */

  minZoom: number;  
  /**
 * maxZoom：maxZoom相关字段。
 */

  maxZoom: number;  
  /**
 * applyZoomChange：ZoomChange相关字段。
 */

  applyZoomChange: (nextZoom: number) => number;  
  /**
 * showToast：showToast相关字段。
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

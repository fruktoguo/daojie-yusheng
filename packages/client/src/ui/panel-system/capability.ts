import { PanelCapabilities } from './types';
import { UI_RESPONSIVE_BREAKPOINTS } from '../../constants/ui/responsive';
import { getEffectiveViewportHeight, getEffectiveViewportWidth } from '../responsive-viewport';

/** matchMediaSafe：处理匹配Media安全。 */
function matchMediaSafe(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' ? win.matchMedia(query).matches : false;
}

/** readSafeAreaInsets：处理read安全区域Insets。 */
function readSafeAreaInsets(win: Window): PanelCapabilities['safeAreaInsets'] {
  const probe = win.document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'fixed';
  probe.style.inset = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
  probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
  probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
  win.document.body.appendChild(probe);
  const computed = win.getComputedStyle(probe);
  const toPixels = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const insets = {
    top: toPixels(computed.paddingTop),
    right: toPixels(computed.paddingRight),
    bottom: toPixels(computed.paddingBottom),
    left: toPixels(computed.paddingLeft),
  };
  probe.remove();
  return insets;
}

/** detectPanelCapabilities：处理detect面板Capabilities。 */
export function detectPanelCapabilities(win: Window): PanelCapabilities {
  const viewportWidth = getEffectiveViewportWidth(win);
  const viewportHeight = getEffectiveViewportHeight(win);
  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
  const hoverAvailable = matchMediaSafe(win, '(hover: hover)');
  const reducedMotion = matchMediaSafe(win, '(prefers-reduced-motion: reduce)');
  const breakpoint = viewportWidth < UI_RESPONSIVE_BREAKPOINTS.panelMobile
    ? 'mobile'
    : viewportWidth < UI_RESPONSIVE_BREAKPOINTS.layoutCompactDesktop
      ? 'tablet'
      : 'desktop';

  return {
    viewportWidth,
    viewportHeight,
    pointerCoarse,
    hoverAvailable,
    reducedMotion,
    breakpoint,
    viewport: pointerCoarse || viewportWidth < UI_RESPONSIVE_BREAKPOINTS.panelViewportMobile ? 'mobile' : 'desktop',
    safeAreaInsets: readSafeAreaInsets(win),
  };
}

/** PanelCapabilityMonitor：面板Capability Monitor实现。 */
export class PanelCapabilityMonitor {
  /** win：win。 */
  private readonly win: Window;
  /** listener：listener。 */
  private readonly listener: (capabilities: PanelCapabilities) => void;
  /** boundRefresh：bound Refresh。 */
  private readonly boundRefresh: () => void;
  /** started：started。 */
  private started = false;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param win Window 参数说明。
 * @param listener (capabilities: PanelCapabilities) => void 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(win: Window, listener: (capabilities: PanelCapabilities) => void) {
    this.win = win;
    this.listener = listener;
    this.boundRefresh = () => {
      this.listener(detectPanelCapabilities(this.win));
    };
  }

  /** start：启动start。 */
  start(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.started) {
      return;
    }
    this.started = true;
    this.win.addEventListener('resize', this.boundRefresh);
    this.win.addEventListener('orientationchange', this.boundRefresh);
    this.win.visualViewport?.addEventListener('resize', this.boundRefresh);
    this.boundRefresh();
  }

  /** stop：停止stop。 */
  stop(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.started) {
      return;
    }
    this.started = false;
    this.win.removeEventListener('resize', this.boundRefresh);
    this.win.removeEventListener('orientationchange', this.boundRefresh);
    this.win.visualViewport?.removeEventListener('resize', this.boundRefresh);
  }
}





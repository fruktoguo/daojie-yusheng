import { PanelCapabilities } from './types';
import { UI_RESPONSIVE_BREAKPOINTS } from '../../constants/ui/responsive';
import { getEffectiveViewportHeight, getEffectiveViewportWidth } from '../responsive-viewport';

/** matchMediaSafe：执行对应的业务逻辑。 */
function matchMediaSafe(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' ? win.matchMedia(query).matches : false;
}

/** readSafeAreaInsets：执行对应的业务逻辑。 */
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

/** detectPanelCapabilities：执行对应的业务逻辑。 */
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

/** PanelCapabilityMonitor：封装相关状态与行为。 */
export class PanelCapabilityMonitor {
  private readonly win: Window;
  private readonly listener: (capabilities: PanelCapabilities) => void;
  private readonly boundRefresh: () => void;
  private started = false;

  constructor(win: Window, listener: (capabilities: PanelCapabilities) => void) {
    this.win = win;
    this.listener = listener;
    this.boundRefresh = () => {
      this.listener(detectPanelCapabilities(this.win));
    };
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.win.addEventListener('resize', this.boundRefresh);
    this.win.addEventListener('orientationchange', this.boundRefresh);
    this.win.visualViewport?.addEventListener('resize', this.boundRefresh);
    this.boundRefresh();
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.win.removeEventListener('resize', this.boundRefresh);
    this.win.removeEventListener('orientationchange', this.boundRefresh);
    this.win.visualViewport?.removeEventListener('resize', this.boundRefresh);
  }
}


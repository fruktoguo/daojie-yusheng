import { PanelCapabilities } from './types';
import { UI_RESPONSIVE_BREAKPOINTS } from '../../constants/ui/responsive';
import { getEffectiveViewportHeight, getEffectiveViewportWidth } from '../responsive-viewport';

function matchMediaSafe(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' ? win.matchMedia(query).matches : false;
}

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
    safeAreaInsets: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  };
}

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

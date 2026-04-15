import { PanelCapabilities } from './types';
import { UI_RESPONSIVE_BREAKPOINTS } from '../../constants/ui/responsive';
import { getEffectiveViewportHeight, getEffectiveViewportWidth } from '../responsive-viewport';

/** matchMediaSafe：执行对应的业务逻辑。 */
function matchMediaSafe(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' ? win.matchMedia(query).matches : false;
}

/** detectPanelCapabilities：执行对应的业务逻辑。 */
export function detectPanelCapabilities(win: Window): PanelCapabilities {
/** viewportWidth：定义该变量以承载业务值。 */
  const viewportWidth = getEffectiveViewportWidth(win);
/** viewportHeight：定义该变量以承载业务值。 */
  const viewportHeight = getEffectiveViewportHeight(win);
/** pointerCoarse：定义该变量以承载业务值。 */
  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
/** hoverAvailable：定义该变量以承载业务值。 */
  const hoverAvailable = matchMediaSafe(win, '(hover: hover)');
/** reducedMotion：定义该变量以承载业务值。 */
  const reducedMotion = matchMediaSafe(win, '(prefers-reduced-motion: reduce)');
/** breakpoint：定义该变量以承载业务值。 */
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

/** PanelCapabilityMonitor：封装相关状态与行为。 */
export class PanelCapabilityMonitor {
/** win：定义该变量以承载业务值。 */
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

/** start：执行对应的业务逻辑。 */
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

/** stop：执行对应的业务逻辑。 */
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


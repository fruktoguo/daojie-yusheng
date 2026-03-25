import { UI_RESPONSIVE_BREAKPOINTS } from '../constants/ui/responsive';

export type EffectiveLayoutBreakpoint = 'mobile' | 'compact' | 'wide';

function matchMediaSafe(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' ? win.matchMedia(query).matches : false;
}

function isWindowsDesktop(win: Window): boolean {
  const platform = win.navigator.platform || '';
  const userAgent = win.navigator.userAgent || '';
  return /Win/i.test(platform) || /Windows/i.test(userAgent);
}

function shouldCompensateDesktopScaling(win: Window): boolean {
  if (!isWindowsDesktop(win)) {
    return false;
  }

  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
  const hoverNone = matchMediaSafe(win, '(hover: none)');
  return !pointerCoarse && !hoverNone;
}

export function getDesktopScaleFactor(win: Window): number {
  if (!shouldCompensateDesktopScaling(win)) {
    return 1;
  }
  const dpr = Number.isFinite(win.devicePixelRatio) ? win.devicePixelRatio : 1;
  return Math.max(1, dpr);
}

export function scaleDesktopCssPixels(win: Window, pixels: number): number {
  return pixels / getDesktopScaleFactor(win);
}

export function getEffectiveViewportWidth(win: Window): number {
  const viewportWidth = Math.max(0, win.innerWidth || 0);
  return Math.round(viewportWidth * getDesktopScaleFactor(win));
}

export function getEffectiveViewportHeight(win: Window): number {
  const viewportHeight = Math.max(0, win.innerHeight || 0);
  return Math.round(viewportHeight * getDesktopScaleFactor(win));
}

export function getEffectiveLayoutBreakpoint(win: Window): EffectiveLayoutBreakpoint {
  const viewportWidth = getEffectiveViewportWidth(win);
  if (viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutForceMobile) {
    return 'mobile';
  }
  if (viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutCompactDesktop) {
    return 'compact';
  }
  return 'wide';
}

export function shouldUseMobileUi(win: Window): boolean {
  const viewportWidth = getEffectiveViewportWidth(win);
  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
  const hoverNone = matchMediaSafe(win, '(hover: none)');

  return viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutForceMobile
    || ((pointerCoarse || hoverNone) && viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutTouchMobile);
}

export function syncResponsiveViewportCss(win: Window): void {
  const root = win.document.documentElement;
  const scale = getDesktopScaleFactor(win);
  const inverseScale = scale > 0 ? 1 / scale : 1;

  root.dataset.effectiveLayoutBreakpoint = getEffectiveLayoutBreakpoint(win);
  root.dataset.desktopScaleLock = scale > 1 ? 'true' : 'false';
  root.style.setProperty('--desktop-scale-factor', scale.toFixed(4));
  root.style.setProperty('--desktop-scale-inverse', inverseScale.toFixed(6));
  root.style.setProperty('--effective-viewport-width', `${getEffectiveViewportWidth(win)}px`);
  root.style.setProperty('--effective-viewport-height', `${getEffectiveViewportHeight(win)}px`);
}

export function bindResponsiveViewportCss(win: Window = window): () => void {
  const refresh = () => {
    syncResponsiveViewportCss(win);
  };

  win.addEventListener('resize', refresh);
  win.addEventListener('orientationchange', refresh);
  win.visualViewport?.addEventListener('resize', refresh);
  refresh();

  return () => {
    win.removeEventListener('resize', refresh);
    win.removeEventListener('orientationchange', refresh);
    win.visualViewport?.removeEventListener('resize', refresh);
  };
}

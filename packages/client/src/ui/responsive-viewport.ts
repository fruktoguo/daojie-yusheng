import { UI_RESPONSIVE_BREAKPOINTS } from '../constants/ui/responsive';
import { DESIGN_VIEWPORT } from '../constants/ui/viewport';

/** 响应式布局断点层级。 */
export type EffectiveLayoutBreakpoint = 'mobile' | 'compact' | 'wide';

/** 响应式视口换算指标。 */
export interface ResponsiveViewportMetrics {
/**
 * locked：locked相关字段。
 */

  locked: boolean;  
  /**
 * rawWidth：rawWidth相关字段。
 */

  rawWidth: number;  
  /**
 * rawHeight：rawHeight相关字段。
 */

  rawHeight: number;  
  /**
 * viewportWidth：viewportWidth相关字段。
 */

  viewportWidth: number;  
  /**
 * viewportHeight：viewportHeight相关字段。
 */

  viewportHeight: number;  
  /**
 * scale：scale相关字段。
 */

  scale: number;  
  /**
 * offsetX：offsetX相关字段。
 */

  offsetX: number;  
  /**
 * offsetY：offsetY相关字段。
 */

  offsetY: number;  
  /**
 * dpr：dpr相关字段。
 */

  dpr: number;
}

/** RESPONSIVE_VIEWPORT_CHANGE_EVENT：RESPONSIVE视口变更事件。 */
export const RESPONSIVE_VIEWPORT_CHANGE_EVENT = 'mud:responsive-viewport-change';
/** MIN_VIEWPORT_SCALE：视口缩放下限。 */
const MIN_VIEWPORT_SCALE = 0.01;

/** matchMediaSafe：处理匹配Media安全。 */
function matchMediaSafe(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' ? win.matchMedia(query).matches : false;
}

/** isWindowsDesktop：判断是否Windows Desktop。 */
function isWindowsDesktop(win: Window): boolean {
  const platform = win.navigator.platform || '';
  const userAgent = win.navigator.userAgent || '';
  return /Win/i.test(platform) || /Windows/i.test(userAgent);
}

/** shouldCompensateDesktopScaling：判断是否Compensate Desktop Scaling。 */
function shouldCompensateDesktopScaling(win: Window): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!isWindowsDesktop(win)) {
    return false;
  }

  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
  const hoverNone = matchMediaSafe(win, '(hover: none)');
  return !pointerCoarse && !hoverNone;
}

/** getRawViewportWidth：读取Raw视口Width。 */
function getRawViewportWidth(win: Window): number {
  return Math.max(0, win.innerWidth || 0);
}

/** getRawViewportHeight：读取Raw视口Height。 */
function getRawViewportHeight(win: Window): number {
  return Math.max(0, win.innerHeight || 0);
}

/** getDesktopAdjustedViewportWidth：读取Desktop Adjusted视口Width。 */
function getDesktopAdjustedViewportWidth(win: Window): number {
  return Math.round(getRawViewportWidth(win) * getDesktopScaleFactor(win));
}

/** getDesktopAdjustedViewportHeight：读取Desktop Adjusted视口Height。 */
function getDesktopAdjustedViewportHeight(win: Window): number {
  return Math.round(getRawViewportHeight(win) * getDesktopScaleFactor(win));
}

/** shouldLockDesktopViewport：判断是否Lock Desktop视口。 */
function shouldLockDesktopViewport(win: Window): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const adjustedWidth = getDesktopAdjustedViewportWidth(win);
  if (adjustedWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutForceMobile) {
    return false;
  }
  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
  const hoverNone = matchMediaSafe(win, '(hover: none)');
  return !pointerCoarse && !hoverNone;
}

/** getResponsiveViewportMetrics：读取Responsive视口指标。 */
export function getResponsiveViewportMetrics(win: Window = window): ResponsiveViewportMetrics {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const rawWidth = getRawViewportWidth(win);
  const rawHeight = getRawViewportHeight(win);
  const dpr = Number.isFinite(win.devicePixelRatio) ? win.devicePixelRatio : 1;
  const locked = shouldLockDesktopViewport(win);

  if (!locked) {
    return {
      locked: false,
      rawWidth,
      rawHeight,
      viewportWidth: rawWidth,
      viewportHeight: rawHeight,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      dpr: Math.max(1, dpr),
    };
  }

  // 桌面端采用类似 Unity Canvas 的高度基准：设计高度固定，宽度随窗口比例变化。
  const scale = Math.max(MIN_VIEWPORT_SCALE, rawHeight / DESIGN_VIEWPORT.height);
  const viewportWidth = Math.max(1, rawWidth / scale);
  const viewportHeight = DESIGN_VIEWPORT.height;
  const scaledWidth = viewportWidth * scale;
  const scaledHeight = viewportHeight * scale;

  return {
    locked: true,
    rawWidth,
    rawHeight,
    viewportWidth,
    viewportHeight,
    scale,
    offsetX: (rawWidth - scaledWidth) / 2,
    offsetY: (rawHeight - scaledHeight) / 2,
    dpr: Math.max(1, dpr),
  };
}

/** getViewportScale：读取视口缩放。 */
export function getViewportScale(win: Window = window): number {
  return getResponsiveViewportMetrics(win).scale;
}

/** getViewportRoot：读取视口Root。 */
export function getViewportRoot(doc: Document = document): HTMLElement | null {
  return doc.getElementById('app-viewport-root');
}

/** clientToViewportPoint：处理客户端To视口坐标。 */
export function clientToViewportPoint(
  win: Window,
  clientX: number,
  clientY: number,
): {
/**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const metrics = getResponsiveViewportMetrics(win);
  if (!metrics.locked || metrics.scale === 1) {
    return {
      x: clientX,
      y: clientY,
    };
  }
  return {
    x: (clientX - metrics.offsetX) / metrics.scale,
    y: (clientY - metrics.offsetY) / metrics.scale,
  };
}

/** getDesktopScaleFactor：读取Desktop缩放Factor。 */
export function getDesktopScaleFactor(win: Window): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!shouldCompensateDesktopScaling(win)) {
    return 1;
  }
  const dpr = Number.isFinite(win.devicePixelRatio) ? win.devicePixelRatio : 1;
  return Math.max(1, dpr);
}

/** scaleDesktopCssPixels：处理缩放Desktop Css Pixels。 */
export function scaleDesktopCssPixels(_win: Window, pixels: number): number {
  return pixels;
}

/** getEffectiveViewportWidth：读取Effective视口Width。 */
export function getEffectiveViewportWidth(win: Window): number {
  const metrics = getResponsiveViewportMetrics(win);
  return metrics.locked ? Math.round(metrics.viewportWidth) : getDesktopAdjustedViewportWidth(win);
}

/** getEffectiveViewportHeight：读取Effective视口Height。 */
export function getEffectiveViewportHeight(win: Window): number {
  const metrics = getResponsiveViewportMetrics(win);
  return metrics.locked ? Math.round(metrics.viewportHeight) : getDesktopAdjustedViewportHeight(win);
}

/** getEffectiveLayoutBreakpoint：读取Effective布局Breakpoint。 */
export function getEffectiveLayoutBreakpoint(win: Window): EffectiveLayoutBreakpoint {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const viewportWidth = getEffectiveViewportWidth(win);
  if (viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutForceMobile) {
    return 'mobile';
  }
  if (viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutCompactDesktop) {
    return 'compact';
  }
  return 'wide';
}

/** shouldUseMobileUi：判断是否使用Mobile界面。 */
export function shouldUseMobileUi(win: Window): boolean {
  const viewportWidth = getDesktopAdjustedViewportWidth(win);
  const pointerCoarse = matchMediaSafe(win, '(pointer: coarse)');
  const hoverNone = matchMediaSafe(win, '(hover: none)');

  return viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutForceMobile
    || ((pointerCoarse || hoverNone) && viewportWidth <= UI_RESPONSIVE_BREAKPOINTS.layoutTouchMobile);
}

/** syncViewportRootStyles：同步视口Root Styles。 */
function syncViewportRootStyles(win: Window, metrics: ResponsiveViewportMetrics): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const root = getViewportRoot(win.document);
  if (!root) {
    return;
  }

  root.dataset.designLocked = metrics.locked ? 'true' : 'false';

  if (!metrics.locked) {
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100vw';
    root.style.height = '100dvh';
    root.style.transform = 'none';
    return;
  }

  root.style.right = 'auto';
  root.style.bottom = 'auto';
  root.style.left = '50%';
  root.style.top = '50%';
  root.style.width = `${metrics.viewportWidth}px`;
  root.style.height = `${metrics.viewportHeight}px`;
  root.style.transform = `translate(-50%, -50%) scale(${metrics.scale.toFixed(6)})`;
}

/** syncResponsiveViewportCss：同步Responsive视口Css。 */
export function syncResponsiveViewportCss(win: Window): void {
  const root = win.document.documentElement;
  const metrics = getResponsiveViewportMetrics(win);

  root.dataset.effectiveLayoutBreakpoint = getEffectiveLayoutBreakpoint(win);
  root.dataset.desktopScaleLock = metrics.locked ? 'true' : 'false';
  root.style.setProperty('--desktop-scale-factor', '1');
  root.style.setProperty('--desktop-scale-inverse', '1');
  root.style.setProperty('--effective-viewport-width', `${getEffectiveViewportWidth(win)}px`);
  root.style.setProperty('--effective-viewport-height', `${getEffectiveViewportHeight(win)}px`);
  root.style.setProperty('--app-viewport-scale', metrics.scale.toFixed(6));
  root.style.setProperty('--app-viewport-offset-x', `${metrics.offsetX.toFixed(2)}px`);
  root.style.setProperty('--app-viewport-offset-y', `${metrics.offsetY.toFixed(2)}px`);
  syncViewportRootStyles(win, metrics);
}

/** bindResponsiveViewportCss：绑定Responsive视口Css。 */
export function bindResponsiveViewportCss(win: Window = window): () => void {
  let previousSignature = '';

  /** refresh：处理refresh。 */
  const refresh = () => {
    syncResponsiveViewportCss(win);
    const metrics = getResponsiveViewportMetrics(win);
    const signature = [
      metrics.locked ? '1' : '0',
      metrics.rawWidth,
      metrics.rawHeight,
      metrics.viewportWidth,
      metrics.viewportHeight,
      metrics.scale.toFixed(6),
      metrics.dpr.toFixed(4),
    ].join(':');
    if (signature === previousSignature) {
      return;
    }
    /** previousSignature：previous签名。 */
    previousSignature = signature;
    win.dispatchEvent(new CustomEvent<ResponsiveViewportMetrics>(RESPONSIVE_VIEWPORT_CHANGE_EVENT, {
      detail: metrics,
    }));
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

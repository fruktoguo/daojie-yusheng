/**
 * 客户端响应式断点与桌面布局尺寸常量。
 */

/** 通用响应式断点。 */
export const UI_RESPONSIVE_BREAKPOINTS = {
  panelMobile: 768,
  panelViewportMobile: 960,
  layoutForceMobile: 920,
  layoutTouchMobile: 1180,
  layoutCompactDesktop: 1200,
} as const;

/** 桌面布局拖拽与默认宽高限制。 */
export const DESKTOP_LAYOUT_DRAG_LIMITS = {
  leftMin: 220,
  leftMax: 520,
  leftMaxViewportRatio: 0.4,
  rightMin: 240,
  rightMax: 680,
  rightMaxViewportRatio: 0.5,
  bottomMin: 140,
  bottomMax: 480,
  bottomMaxViewportRatio: 0.55,
} as const;

/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
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

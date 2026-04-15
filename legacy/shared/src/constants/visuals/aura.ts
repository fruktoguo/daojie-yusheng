/**
 * 灵气感知视觉常量。
 */

/**
 * 感气视角遮罩的统一视觉配置。
 *
 * 说明：
 * - 感气效果本质上是叠加在原有格子渲染结果之上的一层暗蓝色遮罩。
 * - `maxAuraLevel` 用于将灵气等级压缩到颜色映射区间，避免高等级直接拉爆颜色。
 * - `base*` 与 `*Range` 共同决定无灵气到高灵气时的颜色渐变。
 * - `baseAlpha` 与 `alphaRange` 决定遮罩总体深浅以及高灵气区域的透明度变化。
 * - `hoverStroke` 用于鼠标悬停格子时的描边高亮颜色。
 */
export const SENSE_QI_OVERLAY_STYLE = {
  maxAuraLevel: 6,
  baseRed: 8,
  redRange: 28,
  baseGreen: 12,
  greenRange: 96,
  baseBlue: 16,
  blueRange: 224,
  baseAlpha: 0.72,
  alphaRange: 0.18,
  hoverStroke: 'rgba(189, 231, 255, 0.95)',
} as const;

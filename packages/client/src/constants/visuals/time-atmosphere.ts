/**
 * 时间阶段对应的环境光与渐变叠加参数
 */

import type { TimePhaseId } from '@mud/shared';

/** 隐藏状态格子渐入时长（毫秒） */
export const TILE_HIDDEN_FADE_MS = 220;
/** 时间过滤器 lerp 速率（用于平滑过渡） */
export const TIME_FILTER_LERP = 0.12;

/** TimeAtmosphereProfile：定义该接口的能力与字段约束。 */
export interface TimeAtmosphereProfile {
  overlayBoost: number;
  skyTint: string;
  skyAlpha: number;
  horizonTint: string;
  horizonAlpha: number;
  vignetteAlpha: number;
}

/** 各个时间阶段对应的氛围色与蒙版权重 */
export const TIME_ATMOSPHERE_PROFILES: Record<TimePhaseId, TimeAtmosphereProfile> = {
  deep_night: { overlayBoost: 1.08, skyTint: '#081221', skyAlpha: 0.34, horizonTint: '#1a3555', horizonAlpha: 0.16, vignetteAlpha: 0.28 },
  late_night: { overlayBoost: 1.04, skyTint: '#0e1b2e', skyAlpha: 0.28, horizonTint: '#274666', horizonAlpha: 0.14, vignetteAlpha: 0.24 },
  before_dawn: { overlayBoost: 1.02, skyTint: '#1a2740', skyAlpha: 0.2, horizonTint: '#516b8b', horizonAlpha: 0.14, vignetteAlpha: 0.16 },
  dawn: { overlayBoost: 0.94, skyTint: '#8ea6c9', skyAlpha: 0.11, horizonTint: '#f0ba80', horizonAlpha: 0.22, vignetteAlpha: 0.06 },
  day: { overlayBoost: 0.7, skyTint: '#fff0c8', skyAlpha: 0.03, horizonTint: '#fff9ea', horizonAlpha: 0.06, vignetteAlpha: 0.02 },
  dusk: { overlayBoost: 1.02, skyTint: '#7d5c58', skyAlpha: 0.14, horizonTint: '#dd8c54', horizonAlpha: 0.24, vignetteAlpha: 0.1 },
  first_night: { overlayBoost: 1.02, skyTint: '#33425f', skyAlpha: 0.16, horizonTint: '#8a6a81', horizonAlpha: 0.13, vignetteAlpha: 0.14 },
  night: { overlayBoost: 1.04, skyTint: '#1c2944', skyAlpha: 0.23, horizonTint: '#44587b', horizonAlpha: 0.12, vignetteAlpha: 0.2 },
  midnight: { overlayBoost: 1.06, skyTint: '#121b30', skyAlpha: 0.3, horizonTint: '#2e4968', horizonAlpha: 0.14, vignetteAlpha: 0.25 },
};


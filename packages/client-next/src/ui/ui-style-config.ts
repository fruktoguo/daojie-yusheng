/**
 * UI 样式配置
 * 统一管理颜色模式与字体等级，并持久化到本地存储
 */

import { UI_STYLE_STORAGE_KEY } from '@mud/shared-next';
import {
  DEFAULT_UI_STYLE_CONFIG,
  UI_GLOBAL_FONT_OFFSET_RANGE,
  UI_COLOR_MODE_OPTIONS,
  UI_FONT_LEVEL_DEFINITIONS,
  UI_SCALE_RANGE,
  type UiColorMode,
  type UiFontLevelDefinition,
  type UiFontLevelKey,
  type UiStyleConfig,
} from '../constants/ui/style';
import { applyUiTextCssVariables } from '../constants/ui/text';
import { shouldUseMobileUi } from './responsive-viewport';

export type { UiColorMode, UiFontLevelDefinition, UiFontLevelKey, UiStyleConfig };
export { UI_COLOR_MODE_OPTIONS, UI_FONT_LEVEL_DEFINITIONS, UI_GLOBAL_FONT_OFFSET_RANGE, UI_SCALE_RANGE };

let currentConfig = cloneConfig(DEFAULT_UI_STYLE_CONFIG);
let initialized = false;
let responsiveSyncBound = false;

export function initializeUiStyleConfig(): UiStyleConfig {
  if (initialized) {
    applyUiStyleConfig(currentConfig);
    return cloneConfig(currentConfig);
  }

  currentConfig = normalizeConfig(readStoredConfig());
  applyUiStyleConfig(currentConfig);
  bindResponsiveSync();
  initialized = true;
  return cloneConfig(currentConfig);
}

export function getUiStyleConfig(): UiStyleConfig {
  if (!initialized) {
    return initializeUiStyleConfig();
  }
  return cloneConfig(currentConfig);
}

export function updateUiColorMode(colorMode: UiColorMode): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    colorMode,
  });
  commitConfig();
  return cloneConfig(currentConfig);
}

export function updateUiGlobalFontOffset(offset: number): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    globalFontOffset: offset,
  });
  commitConfig();
  return cloneConfig(currentConfig);
}

export function updateUiScale(scale: number): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    uiScale: scale,
  });
  commitConfig();
  return cloneConfig(currentConfig);
}

export function resetUiStyleConfig(): UiStyleConfig {
  currentConfig = cloneConfig(DEFAULT_UI_STYLE_CONFIG);
  commitConfig();
  return cloneConfig(currentConfig);
}

export function getEffectiveUiFontSize(
  key: UiFontLevelKey,
  config: UiStyleConfig = currentConfig,
): number {
  const definition = UI_FONT_LEVEL_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition) {
    return 0;
  }
  return resolveAppliedFontSize(config, definition, shouldUseMobileUiPreset(window));
}

function commitConfig(): void {
  applyUiStyleConfig(currentConfig);
  persistConfig(currentConfig);
}

function applyUiStyleConfig(config: UiStyleConfig): void {
  const root = document.documentElement;
  root.dataset.colorMode = config.colorMode;
  root.style.colorScheme = config.colorMode;
  applyUiTextCssVariables(root.style);
  const mobilePresetActive = shouldUseMobileUiPreset(window);
  root.style.setProperty('--ui-scale', config.uiScale.toFixed(3));

  for (const definition of UI_FONT_LEVEL_DEFINITIONS) {
    root.style.setProperty(`--ui-font-size-${definition.key}`, `${resolveAppliedFontSize(config, definition, mobilePresetActive)}px`);
  }
}

function normalizeConfig(
  raw: Partial<UiStyleConfig> | null | undefined,
  fallbackConfig: UiStyleConfig = DEFAULT_UI_STYLE_CONFIG,
): UiStyleConfig {
  const legacyFontSizes = (() => {
    const bodyDefinition = UI_FONT_LEVEL_DEFINITIONS.find((entry) => entry.key === 'body');
    if (!bodyDefinition) {
      return undefined;
    }
    const bodyCandidate = (raw as { fontSizes?: Partial<Record<UiFontLevelKey, number>> } | null | undefined)?.fontSizes?.body;
    if (typeof bodyCandidate !== 'number' || !Number.isFinite(bodyCandidate)) {
      return undefined;
    }
    return bodyCandidate - bodyDefinition.defaultSize;
  })();

  return {
    colorMode: raw?.colorMode === 'dark' ? 'dark' : fallbackConfig.colorMode,
    globalFontOffset: clampGlobalFontOffset(raw?.globalFontOffset, legacyFontSizes ?? fallbackConfig.globalFontOffset),
    uiScale: clampUiScale(raw?.uiScale, fallbackConfig.uiScale),
  };
}

function clampGlobalFontOffset(value: unknown, fallbackValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackValue;
  }
  const rounded = Math.round(value);
  return Math.max(UI_GLOBAL_FONT_OFFSET_RANGE.min, Math.min(UI_GLOBAL_FONT_OFFSET_RANGE.max, rounded));
}

function clampUiScale(value: unknown, fallbackValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackValue;
  }
  return Math.max(UI_SCALE_RANGE.min, Math.min(UI_SCALE_RANGE.max, Number(value.toFixed(2))));
}

function persistConfig(config: UiStyleConfig): void {
  try {
    window.localStorage.setItem(UI_STYLE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 本地存储不可用时静默跳过，保留当前会话内样式
  }
}

function readStoredConfig(): Partial<UiStyleConfig> | null {
  try {
    const raw = window.localStorage.getItem(UI_STYLE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Partial<UiStyleConfig>;
  } catch {
    return null;
  }
}

function cloneConfig(config: UiStyleConfig): UiStyleConfig {
  return {
    colorMode: config.colorMode,
    globalFontOffset: config.globalFontOffset,
    uiScale: config.uiScale,
  };
}

function shouldUseMobileUiPreset(win: Window): boolean {
  return shouldUseMobileUi(win);
}

function resolveAppliedFontSize(
  config: UiStyleConfig,
  definition: UiFontLevelDefinition,
  mobilePresetActive: boolean,
): number {
  const baselineOffset = mobilePresetActive ? definition.min - definition.defaultSize : 0;
  const resolved = (definition.defaultSize + baselineOffset + config.globalFontOffset) * config.uiScale;
  return Math.max(1, Math.round(resolved));
}

function bindResponsiveSync(): void {
  if (responsiveSyncBound) {
    return;
  }
  responsiveSyncBound = true;
  const refresh = () => {
    if (!initialized) {
      return;
    }
    applyUiStyleConfig(currentConfig);
  };
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
}

/**
 * UI 样式配置
 * 统一管理颜色模式与字体等级，并持久化到本地存储
 */

import { UI_STYLE_STORAGE_KEY } from '@mud/shared';
import {
  DEFAULT_UI_STYLE_CONFIG,
  UI_GLOBAL_FONT_OFFSET_RANGE,
  UI_COLOR_MODE_OPTIONS,
  UI_FONT_LEVEL_DEFINITIONS,
  type UiColorMode,
  type UiFontLevelDefinition,
  type UiFontLevelKey,
  type UiStyleConfig,
} from '../constants/ui/style';

export type { UiColorMode, UiFontLevelDefinition, UiFontLevelKey, UiStyleConfig };
export { UI_COLOR_MODE_OPTIONS, UI_FONT_LEVEL_DEFINITIONS, UI_GLOBAL_FONT_OFFSET_RANGE };

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

export function updateUiFontSize(key: UiFontLevelKey, size: number): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    fontSizes: {
      ...currentConfig.fontSizes,
      [key]: size,
    },
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
  const mobilePresetActive = shouldUseMobileUiPreset(window);

  for (const definition of UI_FONT_LEVEL_DEFINITIONS) {
    root.style.setProperty(`--ui-font-size-${definition.key}`, `${resolveAppliedFontSize(config, definition, mobilePresetActive)}px`);
  }
}

function normalizeConfig(
  raw: Partial<UiStyleConfig> | null | undefined,
  fallbackConfig: UiStyleConfig = DEFAULT_UI_STYLE_CONFIG,
): UiStyleConfig {
  const fontSizes = UI_FONT_LEVEL_DEFINITIONS.reduce<Record<UiFontLevelKey, number>>((result, definition) => {
    const candidate = raw?.fontSizes?.[definition.key];
    result[definition.key] = clampFontSize(candidate, definition, fallbackConfig.fontSizes[definition.key]);
    return result;
  }, {} as Record<UiFontLevelKey, number>);

  return {
    colorMode: raw?.colorMode === 'dark' ? 'dark' : fallbackConfig.colorMode,
    globalFontOffset: clampGlobalFontOffset(raw?.globalFontOffset, fallbackConfig.globalFontOffset),
    fontSizes,
  };
}

function clampFontSize(value: unknown, definition: UiFontLevelDefinition, fallbackSize: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackSize;
  }
  return Math.max(definition.min, Math.min(definition.max, Math.round(value)));
}

function clampGlobalFontOffset(value: unknown, fallbackValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackValue;
  }
  const rounded = Math.round(value);
  return Math.max(UI_GLOBAL_FONT_OFFSET_RANGE.min, Math.min(UI_GLOBAL_FONT_OFFSET_RANGE.max, rounded));
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
    fontSizes: { ...config.fontSizes },
  };
}

function shouldUseMobileUiPreset(win: Window): boolean {
  const viewportWidth = Math.max(0, win.innerWidth || 0);
  const pointerCoarse = typeof win.matchMedia === 'function'
    ? win.matchMedia('(pointer: coarse)').matches
    : false;
  const hoverNone = typeof win.matchMedia === 'function'
    ? win.matchMedia('(hover: none)').matches
    : false;
  return viewportWidth <= 920 || ((pointerCoarse || hoverNone) && viewportWidth <= 1180);
}

function resolveAppliedFontSize(
  config: UiStyleConfig,
  definition: UiFontLevelDefinition,
  mobilePresetActive: boolean,
): number {
  const baselineOffset = mobilePresetActive ? definition.min - definition.defaultSize : 0;
  const resolved = config.fontSizes[definition.key] + baselineOffset + config.globalFontOffset;
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

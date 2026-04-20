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

/** currentConfig：当前配置。 */
let currentConfig = cloneConfig(DEFAULT_UI_STYLE_CONFIG);
/** initialized：initialized。 */
let initialized = false;
/** responsiveSyncBound：responsive同步Bound。 */
let responsiveSyncBound = false;

/** initializeUiStyleConfig：初始化界面样式配置。 */
export function initializeUiStyleConfig(): UiStyleConfig {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (initialized) {
    applyUiStyleConfig(currentConfig);
    return cloneConfig(currentConfig);
  }

  /** currentConfig：当前配置。 */
  currentConfig = normalizeConfig(readStoredConfig());
  applyUiStyleConfig(currentConfig);
  bindResponsiveSync();
  /** initialized：initialized。 */
  initialized = true;
  return cloneConfig(currentConfig);
}

/** getUiStyleConfig：读取界面样式配置。 */
export function getUiStyleConfig(): UiStyleConfig {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!initialized) {
    return initializeUiStyleConfig();
  }
  return cloneConfig(currentConfig);
}

/** updateUiColorMode：更新界面颜色模式。 */
export function updateUiColorMode(colorMode: UiColorMode): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    colorMode,
  });
  commitConfig();
  return cloneConfig(currentConfig);
}

/** updateUiGlobalFontOffset：更新界面Global Font偏移。 */
export function updateUiGlobalFontOffset(offset: number): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    globalFontOffset: offset,
  });
  commitConfig();
  return cloneConfig(currentConfig);
}

/** updateUiScale：更新界面缩放。 */
export function updateUiScale(scale: number): UiStyleConfig {
  currentConfig = normalizeConfig({
    ...currentConfig,
    uiScale: scale,
  });
  commitConfig();
  return cloneConfig(currentConfig);
}

/** resetUiStyleConfig：重置界面样式配置。 */
export function resetUiStyleConfig(): UiStyleConfig {
  /** currentConfig：当前配置。 */
  currentConfig = cloneConfig(DEFAULT_UI_STYLE_CONFIG);
  commitConfig();
  return cloneConfig(currentConfig);
}

/** getEffectiveUiFontSize：读取Effective界面Font Size。 */
export function getEffectiveUiFontSize(
  key: UiFontLevelKey,
  config: UiStyleConfig = currentConfig,
): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const definition = UI_FONT_LEVEL_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition) {
    return 0;
  }
  return resolveAppliedFontSize(config, definition, shouldUseMobileUiPreset(window));
}

/** commitConfig：处理commit配置。 */
function commitConfig(): void {
  applyUiStyleConfig(currentConfig);
  persistConfig(currentConfig);
}

/** applyUiStyleConfig：应用界面样式配置。 */
function applyUiStyleConfig(config: UiStyleConfig): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** normalizeConfig：规范化配置。 */
function normalizeConfig(
  raw: Partial<UiStyleConfig> | null | undefined,
  fallbackConfig: UiStyleConfig = DEFAULT_UI_STYLE_CONFIG,
): UiStyleConfig {
  /** previousFontSizeOffset：处理previous Font Size偏移。 */
  const previousFontSizeOffset = (() => {
    const bodyDefinition = UI_FONT_LEVEL_DEFINITIONS.find((entry) => entry.key === 'body');
    if (!bodyDefinition) {
      return undefined;
    }
    const bodyCandidate = (raw as {    
    /**
 * fontSizes：font规模相关字段。
 */
 fontSizes?: Partial<Record<UiFontLevelKey, number>> } | null | undefined)?.fontSizes?.body;
    if (typeof bodyCandidate !== 'number' || !Number.isFinite(bodyCandidate)) {
      return undefined;
    }
    return bodyCandidate - bodyDefinition.defaultSize;
  })();

  return {
    colorMode: raw?.colorMode === 'dark' ? 'dark' : fallbackConfig.colorMode,
    globalFontOffset: clampGlobalFontOffset(raw?.globalFontOffset, previousFontSizeOffset ?? fallbackConfig.globalFontOffset),
    uiScale: clampUiScale(raw?.uiScale, fallbackConfig.uiScale),
  };
}

/** clampGlobalFontOffset：处理clamp Global Font偏移。 */
function clampGlobalFontOffset(value: unknown, fallbackValue: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackValue;
  }
  const rounded = Math.round(value);
  return Math.max(UI_GLOBAL_FONT_OFFSET_RANGE.min, Math.min(UI_GLOBAL_FONT_OFFSET_RANGE.max, rounded));
}

/** clampUiScale：处理clamp界面缩放。 */
function clampUiScale(value: unknown, fallbackValue: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallbackValue;
  }
  return Math.max(UI_SCALE_RANGE.min, Math.min(UI_SCALE_RANGE.max, Number(value.toFixed(2))));
}

/** persistConfig：持久化配置。 */
function persistConfig(config: UiStyleConfig): void {
  try {
    window.localStorage.setItem(UI_STYLE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 本地存储不可用时静默跳过，保留当前会话内样式
  }
}

/** readStoredConfig：处理read Stored配置。 */
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

/** cloneConfig：克隆配置。 */
function cloneConfig(config: UiStyleConfig): UiStyleConfig {
  return {
    colorMode: config.colorMode,
    globalFontOffset: config.globalFontOffset,
    uiScale: config.uiScale,
  };
}

/** shouldUseMobileUiPreset：判断是否使用Mobile界面预设。 */
function shouldUseMobileUiPreset(win: Window): boolean {
  return shouldUseMobileUi(win);
}

/** resolveAppliedFontSize：解析Applied Font Size。 */
function resolveAppliedFontSize(
  config: UiStyleConfig,
  definition: UiFontLevelDefinition,
  mobilePresetActive: boolean,
): number {
  const baselineOffset = mobilePresetActive ? definition.min - definition.defaultSize : 0;
  const resolved = (definition.defaultSize + baselineOffset + config.globalFontOffset) * config.uiScale;
  return Math.max(1, Math.round(resolved));
}

/** bindResponsiveSync：绑定Responsive同步。 */
function bindResponsiveSync(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (responsiveSyncBound) {
    return;
  }
  /** responsiveSyncBound：responsive同步Bound。 */
  responsiveSyncBound = true;
  /** refresh：处理refresh。 */
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





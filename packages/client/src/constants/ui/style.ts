/**
 * UI 样式配置常量。
 */

import { UI_TEXT_SETTINGS } from './text';

/** UiColorMode：定义该类型的结构与数据语义。 */
export type UiColorMode = 'light' | 'dark';
/** UiFontLevelKey：定义该类型的结构与数据语义。 */
export type UiFontLevelKey = (typeof UI_TEXT_SETTINGS.fontLevels)[number]['key'];

/** UiFontLevelDefinition：定义该类型的结构与数据语义。 */
export type UiFontLevelDefinition = {
/** key：定义该变量以承载业务值。 */
  key: UiFontLevelKey;
/** label：定义该变量以承载业务值。 */
  label: string;
/** description：定义该变量以承载业务值。 */
  description: string;
/** min：定义该变量以承载业务值。 */
  min: number;
/** max：定义该变量以承载业务值。 */
  max: number;
/** defaultSize：定义该变量以承载业务值。 */
  defaultSize: number;
/** previewText：定义该变量以承载业务值。 */
  previewText: string;
/** previewClassName：定义该变量以承载业务值。 */
  previewClassName: string;
};

/** UiStyleConfig：定义该类型的结构与数据语义。 */
export type UiStyleConfig = {
/** colorMode：定义该变量以承载业务值。 */
  colorMode: UiColorMode;
/** globalFontOffset：定义该变量以承载业务值。 */
  globalFontOffset: number;
/** uiScale：定义该变量以承载业务值。 */
  uiScale: number;
};

/** 颜色模式切换选项。 */
export const UI_COLOR_MODE_OPTIONS: Array<{ value: UiColorMode; label: string; description: string }> = [
  { value: 'light', label: '浅色', description: '保持当前纸卷风格的亮面配色。' },
  { value: 'dark', label: '深色', description: '切换为更适合夜间游玩的暗面配色。' },
];

/** 全局字号偏移配置。 */
export const UI_GLOBAL_FONT_OFFSET_RANGE = {
  min: -12,
  max: 12,
  defaultValue: 0,
  step: 1,
} as const;

/** 整体 UI 缩放配置。 */
export const UI_SCALE_RANGE = {
  min: 0.85,
  max: 2.5,
  defaultValue: 1,
  step: 0.01,
} as const;

/** UI 字号层级定义。 */
export const UI_FONT_LEVEL_DEFINITIONS: UiFontLevelDefinition[] = UI_TEXT_SETTINGS.fontLevels.map((entry) => ({ ...entry }));

/** 默认 UI 样式配置。 */
export const DEFAULT_UI_STYLE_CONFIG: UiStyleConfig = {
  colorMode: 'light',
  globalFontOffset: UI_GLOBAL_FONT_OFFSET_RANGE.defaultValue,
  uiScale: UI_SCALE_RANGE.defaultValue,
};


/**
 * UI 样式配置常量。
 */

export type UiColorMode = 'light' | 'dark';
export type UiFontLevelKey = 'hero' | 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'micro';

export type UiFontLevelDefinition = {
  key: UiFontLevelKey;
  label: string;
  description: string;
  min: number;
  max: number;
  defaultSize: number;
  previewText: string;
  previewClassName: string;
};

export type UiStyleConfig = {
  colorMode: UiColorMode;
  globalFontOffset: number;
  fontSizes: Record<UiFontLevelKey, number>;
};

function buildUiFontSizes(resolveSize: (definition: UiFontLevelDefinition) => number): Record<UiFontLevelKey, number> {
  return UI_FONT_LEVEL_DEFINITIONS.reduce<Record<UiFontLevelKey, number>>((result, definition) => {
    result[definition.key] = resolveSize(definition);
    return result;
  }, {} as Record<UiFontLevelKey, number>);
}

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

/** UI 字号层级定义。 */
export const UI_FONT_LEVEL_DEFINITIONS: UiFontLevelDefinition[] = [
  {
    key: 'hero',
    label: '主标题',
    description: '登录大标题、超大数字和强调性标题。',
    min: 36,
    max: 64,
    defaultSize: 52,
    previewText: '道劫余生',
    previewClassName: 'hero',
  },
  {
    key: 'display',
    label: '大标题',
    description: '角色单字显示名、统计大号数字和大区块抬头。',
    min: 28,
    max: 48,
    defaultSize: 38,
    previewText: '玄',
    previewClassName: 'display',
  },
  {
    key: 'title',
    label: '标题',
    description: '弹层标题、面板标题、主要分区抬头。',
    min: 18,
    max: 30,
    defaultSize: 22,
    previewText: '设置标题',
    previewClassName: 'title',
  },
  {
    key: 'subtitle',
    label: '副标题',
    description: '页签、次级抬头、按钮和强调文案。',
    min: 14,
    max: 24,
    defaultSize: 16,
    previewText: '副标题示例',
    previewClassName: 'subtitle',
  },
  {
    key: 'body',
    label: '正文',
    description: '大部分正文、表单输入和常规信息文字。',
    min: 12,
    max: 20,
    defaultSize: 14,
    previewText: '正文内容示例',
    previewClassName: 'body',
  },
  {
    key: 'caption',
    label: '说明',
    description: '说明文、辅助信息、标签描述。',
    min: 10,
    max: 18,
    defaultSize: 12,
    previewText: '说明文字',
    previewClassName: 'caption',
  },
  {
    key: 'micro',
    label: '小字',
    description: '提示、状态角标、极短辅助信息。',
    min: 9,
    max: 16,
    defaultSize: 11,
    previewText: '小字提示',
    previewClassName: 'micro',
  },
];

/** 默认 UI 样式配置。 */
export const DEFAULT_UI_STYLE_CONFIG: UiStyleConfig = {
  colorMode: 'light',
  globalFontOffset: UI_GLOBAL_FONT_OFFSET_RANGE.defaultValue,
  fontSizes: buildUiFontSizes((definition) => definition.defaultSize),
};

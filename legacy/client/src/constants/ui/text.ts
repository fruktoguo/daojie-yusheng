/**
 * UI 文本参数统一常量。
 * 作为客户端字体族、字重、字号层级与 Canvas 文本预设的单一源头。
 */

const UI_TEXT_FAMILIES = {
  brushWild: "'Zhi Mang Xing', cursive",
  brushRegular: "'Ma Shan Zheng', cursive",
  body: "'YouYuan', '幼圆', 'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif",
  serif: "'Noto Serif SC', 'Songti SC', 'STSong', serif",
  monospace: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

const UI_TEXT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  strong: 700,
  heavy: 800,
  subtitle: 600,
  label: 600,
  tab: 600,
} as const;

const UI_TEXT_FONT_LEVELS = [
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
] as const;

const UI_TEXT_CANVAS_PRESETS = {
  tileGlyph: { family: 'brushRegular', weight: UI_TEXT_WEIGHTS.regular },
  entityGlyph: { family: 'brushRegular', weight: UI_TEXT_WEIGHTS.strong },
  label: { family: 'serif', weight: UI_TEXT_WEIGHTS.regular },
  labelStrong: { family: 'serif', weight: UI_TEXT_WEIGHTS.strong },
  badge: { family: 'serif', weight: UI_TEXT_WEIGHTS.strong },
  floatingAction: { family: 'brushRegular', weight: UI_TEXT_WEIGHTS.regular },
  floatingDamage: { family: 'serif', weight: UI_TEXT_WEIGHTS.strong },
} as const;

export const UI_TEXT_SETTINGS = {
  families: UI_TEXT_FAMILIES,
  weights: UI_TEXT_WEIGHTS,
  fontLevels: UI_TEXT_FONT_LEVELS,
  canvasPresets: UI_TEXT_CANVAS_PRESETS,
} as const;

export type UiCanvasTextPresetKey = keyof typeof UI_TEXT_CANVAS_PRESETS;

const UI_TEXT_CSS_VARIABLES: ReadonlyArray<readonly [name: string, value: string]> = [
  ['--font-family-brush-wild', UI_TEXT_FAMILIES.brushWild],
  ['--font-family-brush-regular', UI_TEXT_FAMILIES.brushRegular],
  ['--font-family-ui', UI_TEXT_FAMILIES.body],
  ['--font-family-serif', UI_TEXT_FAMILIES.serif],
  ['--font-family-monospace', UI_TEXT_FAMILIES.monospace],
  ['--font-role-player-name', UI_TEXT_FAMILIES.brushWild],
  ['--font-role-realm-level', UI_TEXT_FAMILIES.brushWild],
  ['--font-role-title', UI_TEXT_FAMILIES.brushRegular],
  ['--font-role-body', UI_TEXT_FAMILIES.body],
  ['--font-heading-main', UI_TEXT_FAMILIES.brushWild],
  ['--font-heading-sub', UI_TEXT_FAMILIES.brushRegular],
  ['--font-body', UI_TEXT_FAMILIES.body],
  ['--font-weight-regular', String(UI_TEXT_WEIGHTS.regular)],
  ['--font-weight-medium', String(UI_TEXT_WEIGHTS.medium)],
  ['--font-weight-semibold', String(UI_TEXT_WEIGHTS.semibold)],
  ['--font-weight-strong', String(UI_TEXT_WEIGHTS.strong)],
  ['--font-weight-heavy', String(UI_TEXT_WEIGHTS.heavy)],
  ['--font-weight-role-subtitle', String(UI_TEXT_WEIGHTS.subtitle)],
  ['--font-weight-role-label', String(UI_TEXT_WEIGHTS.label)],
  ['--font-weight-role-tab', String(UI_TEXT_WEIGHTS.tab)],
] as const;


export function applyUiTextCssVariables(style: CSSStyleDeclaration): void {
  for (const [name, value] of UI_TEXT_CSS_VARIABLES) {
    style.setProperty(name, value);
  }
}

export function buildCanvasFont(presetKey: UiCanvasTextPresetKey, fontSize: number): string {
  const preset = UI_TEXT_CANVAS_PRESETS[presetKey];
  const family = UI_TEXT_FAMILIES[preset.family];
  const normalizedSize = Math.max(1, Number(fontSize.toFixed(2)));
  return `${preset.weight} ${normalizedSize}px ${family}`;
}


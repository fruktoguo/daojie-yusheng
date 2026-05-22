/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * UI 文本参数统一常量。
 * 作为客户端字体族、字重、字号层级与 Canvas 文本预设的单一源头。
 */
import { t } from '../../ui/i18n';

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
    label: t('settings.font-level.hero.label', undefined),
    description: t('settings.font-level.hero.desc', undefined),
    min: 36,
    max: 64,
    defaultSize: 52,
    previewText: t('settings.font-level.hero.preview', undefined),
    previewClassName: 'hero',
  },
  {
    key: 'display',
    label: t('settings.font-level.display.label', undefined),
    description: t('settings.font-level.display.desc', undefined),
    min: 28,
    max: 48,
    defaultSize: 38,
    previewText: t('settings.font-level.display.preview', undefined),
    previewClassName: 'display',
  },
  {
    key: 'title',
    label: t('settings.font-level.title.label', undefined),
    description: t('settings.font-level.title.desc', undefined),
    min: 18,
    max: 30,
    defaultSize: 22,
    previewText: t('settings.font-level.title.preview', undefined),
    previewClassName: 'title',
  },
  {
    key: 'subtitle',
    label: t('settings.font-level.subtitle.label', undefined),
    description: t('settings.font-level.subtitle.desc', undefined),
    min: 14,
    max: 24,
    defaultSize: 16,
    previewText: t('settings.font-level.subtitle.preview', undefined),
    previewClassName: 'subtitle',
  },
  {
    key: 'body',
    label: t('settings.font-level.body.label', undefined),
    description: t('settings.font-level.body.desc', undefined),
    min: 12,
    max: 20,
    defaultSize: 14,
    previewText: t('settings.font-level.body.preview', undefined),
    previewClassName: 'body',
  },
  {
    key: 'caption',
    label: t('settings.font-level.caption.label', undefined),
    description: t('settings.font-level.caption.desc', undefined),
    min: 10,
    max: 18,
    defaultSize: 12,
    previewText: t('settings.font-level.caption.preview', undefined),
    previewClassName: 'caption',
  },
  {
    key: 'micro',
    label: t('settings.font-level.micro.label', undefined),
    description: t('settings.font-level.micro.desc', undefined),
    min: 9,
    max: 16,
    defaultSize: 11,
    previewText: t('settings.font-level.micro.preview', undefined),
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

/** Canvas 文本预设的键名。 */
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

/** 把文本字号与字体族写入到 CSS 变量。 */
export function applyUiTextCssVariables(style: CSSStyleDeclaration): void {
  for (const [name, value] of UI_TEXT_CSS_VARIABLES) {
    style.setProperty(name, value);
  }
}

/** 按预设和字号构造 Canvas 字体字符串。 */
export function buildCanvasFont(presetKey: UiCanvasTextPresetKey, fontSize: number): string {
  const preset = UI_TEXT_CANVAS_PRESETS[presetKey];
  const family = UI_TEXT_FAMILIES[preset.family];
  const normalizedSize = Math.max(1, Number(fontSize.toFixed(2)));
  return `${preset.weight} ${normalizedSize}px ${family}`;
}

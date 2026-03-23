/**
 * UI 样式配置
 * 统一管理颜色模式与字体等级，并持久化到本地存储
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
  fontSizes: Record<UiFontLevelKey, number>;
};

const UI_STYLE_STORAGE_KEY = 'mud-ui-style-config:v1';

export const UI_COLOR_MODE_OPTIONS: Array<{ value: UiColorMode; label: string; description: string }> = [
  { value: 'light', label: '浅色', description: '保持当前纸卷风格的亮面配色。' },
  { value: 'dark', label: '深色', description: '切换为更适合夜间游玩的暗面配色。' },
];

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

const DEFAULT_UI_STYLE_CONFIG: UiStyleConfig = {
  colorMode: 'light',
  fontSizes: UI_FONT_LEVEL_DEFINITIONS.reduce<Record<UiFontLevelKey, number>>((result, definition) => {
    result[definition.key] = definition.defaultSize;
    return result;
  }, {} as Record<UiFontLevelKey, number>),
};

let currentConfig = cloneConfig(DEFAULT_UI_STYLE_CONFIG);
let initialized = false;

export function initializeUiStyleConfig(): UiStyleConfig {
  if (initialized) {
    applyUiStyleConfig(currentConfig);
    return cloneConfig(currentConfig);
  }

  currentConfig = normalizeConfig(readStoredConfig());
  applyUiStyleConfig(currentConfig);
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

export function resetUiStyleConfig(): UiStyleConfig {
  currentConfig = cloneConfig(DEFAULT_UI_STYLE_CONFIG);
  commitConfig();
  return cloneConfig(currentConfig);
}

function commitConfig(): void {
  applyUiStyleConfig(currentConfig);
  persistConfig(currentConfig);
}

function applyUiStyleConfig(config: UiStyleConfig): void {
  const root = document.documentElement;
  root.dataset.colorMode = config.colorMode;
  root.style.colorScheme = config.colorMode;

  for (const definition of UI_FONT_LEVEL_DEFINITIONS) {
    root.style.setProperty(`--ui-font-size-${definition.key}`, `${config.fontSizes[definition.key]}px`);
  }
}

function normalizeConfig(raw: Partial<UiStyleConfig> | null | undefined): UiStyleConfig {
  const fontSizes = UI_FONT_LEVEL_DEFINITIONS.reduce<Record<UiFontLevelKey, number>>((result, definition) => {
    const candidate = raw?.fontSizes?.[definition.key];
    result[definition.key] = clampFontSize(candidate, definition);
    return result;
  }, {} as Record<UiFontLevelKey, number>);

  return {
    colorMode: raw?.colorMode === 'dark' ? 'dark' : 'light',
    fontSizes,
  };
}

function clampFontSize(value: unknown, definition: UiFontLevelDefinition): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return definition.defaultSize;
  }
  return Math.max(definition.min, Math.min(definition.max, Math.round(value)));
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
    fontSizes: { ...config.fontSizes },
  };
}

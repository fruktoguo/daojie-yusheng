/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'default' | 'underground' | 'rose-garden' | 'lake-view' | 'sunset-glow' | 'forest-whisper' | 'ocean-breeze' | 'lavender-dream';
export type ThemeRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type ThemeScale = 'sm' | 'default' | 'lg';
export type SidebarVariant = 'inset' | 'floating' | 'sidebar';
export type ContentLayout = 'default' | 'centered';

export interface ThemeState {
  mode: ThemeMode;
  preset: ThemePreset;
  radius: ThemeRadius;
  scale: ThemeScale;
  sidebarVariant: SidebarVariant;
  contentLayout: ContentLayout;
}

export interface ThemeContextValue extends ThemeState {
  setMode: (mode: ThemeMode) => void;
  setPreset: (preset: ThemePreset) => void;
  setRadius: (radius: ThemeRadius) => void;
  setScale: (scale: ThemeScale) => void;
  setSidebarVariant: (variant: SidebarVariant) => void;
  setContentLayout: (layout: ContentLayout) => void;
  reset: () => void;
  resolvedMode: 'light' | 'dark';
}

const STORAGE_KEY = 'config-editor.theme.v1';

const defaults: ThemeState = {
  mode: 'system',
  preset: 'default',
  radius: 'md',
  scale: 'default',
  sidebarVariant: 'sidebar',
  contentLayout: 'default',
};

function load(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaults };
}

function save(state: ThemeState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(load);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedMode = state.mode === 'system' ? (systemDark ? 'dark' : 'light') : state.mode;

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', resolvedMode === 'dark');
    if (state.preset !== 'default') {
      el.dataset.themePreset = state.preset;
    } else {
      delete el.dataset.themePreset;
    }
    if (state.radius !== 'md') {
      el.dataset.themeRadius = state.radius;
    } else {
      delete el.dataset.themeRadius;
    }
    if (state.scale !== 'default') {
      el.dataset.themeScale = state.scale;
    } else {
      delete el.dataset.themeScale;
    }
    if (state.contentLayout !== 'default') {
      el.dataset.themeContentLayout = state.contentLayout;
    } else {
      delete el.dataset.themeContentLayout;
    }
    el.dataset.themeSidebar = state.sidebarVariant;
  }, [resolvedMode, state]);

  const update = useCallback((patch: Partial<ThemeState>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    ...state,
    resolvedMode,
    setMode: (mode) => update({ mode }),
    setPreset: (preset) => update({ preset }),
    setRadius: (radius) => update({ radius }),
    setScale: (scale) => update({ scale }),
    setSidebarVariant: (sidebarVariant) => update({ sidebarVariant }),
    setContentLayout: (contentLayout) => update({ contentLayout }),
    reset: () => { save(defaults); setState({ ...defaults }); },
  }), [state, resolvedMode, update]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

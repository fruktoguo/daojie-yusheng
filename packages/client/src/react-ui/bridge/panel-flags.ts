/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
/**
 * Per-panel feature flag 系统
 * 控制每个面板使用 React 实现还是原生 DOM 实现
 */

const STORAGE_KEY = 'mud:react-panel-flags';

/** 所有可迁移的面板 ID */
export type ReactPanelId =
  | 'changelog'
  | 'world'
  | 'loot'
  | 'equipment'
  | 'tutorial'
  | 'body-training'
  | 'quest'
  | 'gm'
  | 'suggestion'
  | 'settings'
  | 'mail'
  | 'chat'
  | 'technique'
  | 'attr'
  | 'market'
  | 'inventory'
  | 'craft'
  | 'action';

/** 默认启用 React 版本的面板（迁移完成后加入） */
const DEFAULT_ENABLED: Set<ReactPanelId> = new Set([
  'action',
  'changelog',
  'attr',
  'body-training',
  'chat',
  'craft',
  'equipment',
  'gm',
  'inventory',
  'loot',
  'mail',
  'market',
  'quest',
  'settings',
  'suggestion',
  'technique',
  'tutorial',
  'world',
]);

/** 运行时缓存 */
let flagCache: Map<ReactPanelId, boolean> | null = null;

function loadFlags(): Map<ReactPanelId, boolean> {
  if (flagCache) return flagCache;
  flagCache = new Map<ReactPanelId, boolean>();

  // 从 localStorage 读取用户覆盖
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      for (const [key, value] of Object.entries(parsed)) {
        flagCache.set(key as ReactPanelId, value);
      }
    }
  } catch {
    // ignore
  }

  // URL 参数覆盖：?react-panel=equipment,inventory 或 ?react-panel=all
  try {
    const params = new URLSearchParams(window.location.search);
    const paramValue = params.get('react-panel');
    if (paramValue === 'all') {
      const allPanels: ReactPanelId[] = [
        'changelog', 'world', 'loot', 'equipment', 'tutorial',
        'body-training', 'quest', 'gm', 'suggestion', 'settings',
        'mail', 'chat', 'technique', 'attr', 'market', 'inventory',
        'craft', 'action',
      ];
      for (const id of allPanels) {
        flagCache.set(id, true);
      }
    } else if (paramValue) {
      for (const id of paramValue.split(',')) {
        flagCache.set(id.trim() as ReactPanelId, true);
      }
    }

    // ?no-react-panel=equipment 强制关闭
    const noParam = params.get('no-react-panel');
    if (noParam) {
      for (const id of noParam.split(',')) {
        flagCache.set(id.trim() as ReactPanelId, false);
      }
    }
  } catch {
    // ignore
  }

  return flagCache;
}

/** 查询某面板是否使用 React 版本 */
export function isReactPanelEnabled(panelId: ReactPanelId): boolean {
  const flags = loadFlags();
  const override = flags.get(panelId);
  if (override !== undefined) return override;
  return DEFAULT_ENABLED.has(panelId);
}

/** 运行时切换面板实现（开发调试用） */
export function setReactPanelFlag(panelId: ReactPanelId, enabled: boolean): void {
  const flags = loadFlags();
  flags.set(panelId, enabled);

  // 持久化
  const obj: Record<string, boolean> = {};
  for (const [k, v] of flags) {
    obj[k] = v;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

/** 注册全局调试 API */
export function registerPanelFlagApi(win: Window): void {
  (win as unknown as Record<string, unknown>).__reactPanel = {
    enable: (id: ReactPanelId) => { setReactPanelFlag(id, true); console.log(`[react-panel] ${id} enabled, reload to apply`); },
    disable: (id: ReactPanelId) => { setReactPanelFlag(id, false); console.log(`[react-panel] ${id} disabled, reload to apply`); },
    status: () => {
      const flags = loadFlags();
      const allPanels: ReactPanelId[] = [
        'changelog', 'world', 'loot', 'equipment', 'tutorial',
        'body-training', 'quest', 'gm', 'suggestion', 'settings',
        'mail', 'chat', 'technique', 'attr', 'market', 'inventory',
        'craft', 'action',
      ];
      const result: Record<string, string> = {};
      for (const id of allPanels) {
        const override = flags.get(id);
        const effective = override !== undefined ? override : DEFAULT_ENABLED.has(id);
        result[id] = effective ? '✅ React' : '⬜ Native';
      }
      console.table(result);
    },
  };
}

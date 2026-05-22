/**
 * 本文件提供配置编辑器的哈希路由封装，用于在静态部署下切换页面。
 *
 * 维护时要保持路由 key 与侧栏导航一致，避免刷新后落到不存在的编辑页面。
 */
import { useCallback, useEffect, useState } from 'react';

export type RouteId = 'maps' | 'monsters' | 'techniques' | 'files' | 'service';

const ROUTES: RouteId[] = ['maps', 'monsters', 'techniques', 'files', 'service'];

function parseHash(): RouteId {
  const hash = window.location.hash.replace('#/', '');
  if (ROUTES.includes(hash as RouteId)) return hash as RouteId;
  return 'maps';
}

const listeners = new Set<() => void>();

export function navigate(path: string) {
  window.location.hash = `#/${path}`;
}

export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(parseHash);

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    listeners.add(handler);
    window.addEventListener('hashchange', handler);
    return () => {
      listeners.delete(handler);
      window.removeEventListener('hashchange', handler);
    };
  }, []);

  return route;
}

export function HashRouter({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!window.location.hash) navigate('maps');
  }, []);
  return <>{children}</>;
}

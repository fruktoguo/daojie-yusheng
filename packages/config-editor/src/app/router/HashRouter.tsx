/**
 * 本文件提供配置编辑器的哈希路由封装，用于在静态部署下切换页面。
 *
 * 维护时要保持路由 key 与侧栏导航一致，并让未保存草稿在站内切页、浏览器历史导航和离页时使用同一保护边界。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type RouteId = 'maps' | 'monsters' | 'techniques' | 'files' | 'service';

type NavigationBlocker = Readonly<{
  shouldBlock: () => boolean;
  message: () => string;
}>;

type RouterContextValue = Readonly<{
  route: RouteId;
  navigate: (route: RouteId) => boolean;
  registerBlocker: (blocker: NavigationBlocker) => () => void;
}>;

const ROUTES: RouteId[] = ['maps', 'monsters', 'techniques', 'files', 'service'];
const RouterContext = createContext<RouterContextValue | null>(null);

function parseHash(): RouteId {
  const hash = window.location.hash.replace('#/', '');
  if (ROUTES.includes(hash as RouteId)) return hash as RouteId;
  return 'maps';
}

function formatHash(route: RouteId): string {
  return `#/${route}`;
}

function useRouterContext(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('路由 hook 必须在 HashRouter 内使用');
  }
  return context;
}

export function useRoute(): RouteId {
  return useRouterContext().route;
}

export function useNavigate(): (route: RouteId) => boolean {
  return useRouterContext().navigate;
}

/** 注册实时草稿检查；回调保存在 ref 中，编辑过程不会反复拆装全局监听器。 */
export function useNavigationBlocker(shouldBlock: () => boolean, message: string): void {
  const { registerBlocker } = useRouterContext();
  const shouldBlockRef = useRef(shouldBlock);
  const messageRef = useRef(message);
  shouldBlockRef.current = shouldBlock;
  messageRef.current = message;

  useEffect(() => registerBlocker({
    shouldBlock: () => shouldBlockRef.current(),
    message: () => messageRef.current,
  }), [registerBlocker]);
}

export function HashRouter({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<RouteId>(parseHash);
  const routeRef = useRef(route);
  const blockersRef = useRef(new Set<NavigationBlocker>());
  const acceptedHashRef = useRef<RouteId | null>(null);

  const acceptRoute = useCallback((nextRoute: RouteId) => {
    routeRef.current = nextRoute;
    setRoute(nextRoute);
  }, []);

  const registerBlocker = useCallback((blocker: NavigationBlocker) => {
    blockersRef.current.add(blocker);
    return () => blockersRef.current.delete(blocker);
  }, []);

  const findActiveBlocker = useCallback(() => {
    for (const blocker of blockersRef.current) {
      if (blocker.shouldBlock()) return blocker;
    }
    return null;
  }, []);

  const confirmNavigation = useCallback(() => {
    const blocker = findActiveBlocker();
    return !blocker || window.confirm(blocker.message());
  }, [findActiveBlocker]);

  const navigate = useCallback((nextRoute: RouteId) => {
    if (nextRoute === routeRef.current) return true;
    if (!confirmNavigation()) return false;
    acceptedHashRef.current = nextRoute;
    window.location.hash = formatHash(nextRoute);
    return true;
  }, [confirmNavigation]);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(window.history.state, '', formatHash(routeRef.current));
    }

    const handleHashChange = () => {
      const nextRoute = parseHash();
      if (nextRoute === routeRef.current) {
        acceptedHashRef.current = null;
        return;
      }
      if (acceptedHashRef.current === nextRoute) {
        acceptedHashRef.current = null;
        acceptRoute(nextRoute);
        return;
      }
      if (confirmNavigation()) {
        acceptRoute(nextRoute);
        return;
      }

      // hashchange 发生时 URL 已改变；恢复当前路由，并跳过恢复动作自身的二次确认。
      acceptedHashRef.current = routeRef.current;
      window.location.hash = formatHash(routeRef.current);
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!findActiveBlocker()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [acceptRoute, confirmNavigation, findActiveBlocker]);

  const context = useMemo<RouterContextValue>(() => ({
    route,
    navigate,
    registerBlocker,
  }), [navigate, registerBlocker, route]);

  return <RouterContext.Provider value={context}>{children}</RouterContext.Provider>;
}

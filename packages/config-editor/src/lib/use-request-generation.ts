/** 本文件把最新请求代际守卫绑定到 React 组件生命周期。 */
import { useEffect, useRef } from 'react';
import { LatestRequestGuard } from './request-generation';

export function useLatestRequestGuard(): LatestRequestGuard {
  const guardRef = useRef<LatestRequestGuard | null>(null);
  if (!guardRef.current) {
    guardRef.current = new LatestRequestGuard();
  }
  const guard = guardRef.current;

  useEffect(() => {
    guard.activate();
    return () => guard.deactivate();
  }, [guard]);

  return guard;
}

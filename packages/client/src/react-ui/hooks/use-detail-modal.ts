/**
 * useDetailModal hook
 * 
 * React 面板使用此 hook 打开/关闭详情弹层。
 * 底层操作 overlayStore。
 */
import { useCallback } from 'react';
import { openDetailModal, closeDetailModal } from '../overlays/overlay-store';
import type { ReactNode } from 'react';

export interface DetailModalPayload {
  title: string;
  subtitle?: string;
  hint?: string;
  body: ReactNode;
}

export function useDetailModal() {
  const open = useCallback((payload: DetailModalPayload) => {
    openDetailModal({
      title: payload.title,
      subtitle: payload.subtitle,
      hint: payload.hint,
      body: payload.body,
    });
  }, []);

  const close = useCallback(() => {
    closeDetailModal();
  }, []);

  return { open, close };
}

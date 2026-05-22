/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
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

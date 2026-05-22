/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { useCallback, useRef, useEffect } from 'react';
import { FloatingTooltip } from '../../ui/floating-tooltip';

/** Tooltip 内容 */
export interface TooltipPayload {
  title: string;
  lines?: string[];
  html?: string;
}

/** 返回 show/hide 方法，组件卸载时自动清理 */
export function useFloatingTooltip(className = 'floating-tooltip') {
  const tooltipRef = useRef<FloatingTooltip | null>(null);

  // 懒初始化 tooltip 实例
  const getTooltip = useCallback(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = new FloatingTooltip(className);
    }
    return tooltipRef.current;
  }, [className]);

  // 组件卸载时隐藏 tooltip
  useEffect(() => {
    return () => {
      tooltipRef.current?.hide(true);
    };
  }, []);

  const show = useCallback((payload: TooltipPayload, event: React.MouseEvent | MouseEvent) => {
    const tooltip = getTooltip();
    const e = event as MouseEvent;
    tooltip.show(payload.title, payload.lines ?? [], e.clientX, e.clientY);
  }, [getTooltip]);

  const hide = useCallback(() => {
    tooltipRef.current?.hide();
  }, []);

  const hideImmediate = useCallback(() => {
    tooltipRef.current?.hide(true);
  }, []);

  return { show, hide, hideImmediate };
}

/**
 * useFloatingTooltip hook
 * 
 * React 面板使用此 hook 显示/隐藏浮动 tooltip。
 * 底层复用现有的 FloatingTooltip 单例（原生 DOM 实现），
 * 避免重复实现 tooltip 定位逻辑。
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

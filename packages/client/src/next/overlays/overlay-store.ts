import type { ReactNode } from 'react';
import { createExternalStore } from '../stores/create-external-store';
/**
 * NextToastKind：统一结构类型，保证协议与运行时一致性。
 */


export type NextToastKind = 'system' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
/**
 * NextToastEntry：定义接口结构约束，明确可交付字段含义。
 */


export interface NextToastEntry {
/**
 * id：ID标识。
 */

  id: number;  
  /**
 * kind：kind相关字段。
 */

  kind: NextToastKind;  
  /**
 * message：message相关字段。
 */

  message: string;
}
/**
 * NextDetailModalState：定义接口结构约束，明确可交付字段含义。
 */


export interface NextDetailModalState {
/**
 * open：open相关字段。
 */

  open: boolean;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: string;  
  /**
 * hint：hint相关字段。
 */

  hint?: string;  
  /**
 * body：body相关字段。
 */

  body?: ReactNode;
}
/**
 * NextTooltipState：定义接口结构约束，明确可交付字段含义。
 */


export interface NextTooltipState {
/**
 * visible：可见相关字段。
 */

  visible: boolean;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * lines：line相关字段。
 */

  lines: string[];  
  /**
 * clientX：clientX相关字段。
 */

  clientX: number;  
  /**
 * clientY：clientY相关字段。
 */

  clientY: number;
}
/**
 * NextOverlayState：定义接口结构约束，明确可交付字段含义。
 */


export interface NextOverlayState {
/**
 * detailModal：详情弹层相关字段。
 */

  detailModal: NextDetailModalState;  
  /**
 * tooltip：提示相关字段。
 */

  tooltip: NextTooltipState;  
  /**
 * toasts：toast相关字段。
 */

  toasts: NextToastEntry[];
}

const INITIAL_OVERLAY_STATE: NextOverlayState = {
  detailModal: {
    open: false,
    title: '',
  },
  tooltip: {
    visible: false,
    title: '',
    lines: [],
    clientX: 0,
    clientY: 0,
  },
  toasts: [],
};

let toastIdSeed = 1;

export const overlayStore = createExternalStore<NextOverlayState>(INITIAL_OVERLAY_STATE);
/**
 * openNextDetailModal：执行openNext详情弹层相关逻辑。
 * @param input Omit<NextDetailModalState, 'open'> 输入参数。
 * @returns 无返回值，直接更新openNext详情弹层相关状态。
 */


export function openNextDetailModal(input: Omit<NextDetailModalState, 'open'>): void {
  overlayStore.patchState({
    detailModal: {
      ...input,
      open: true,
    },
  });
}
/**
 * closeNextDetailModal：执行closeNext详情弹层相关逻辑。
 * @returns 无返回值，直接更新closeNext详情弹层相关状态。
 */


export function closeNextDetailModal(): void {
  overlayStore.patchState({
    detailModal: {
      open: false,
      title: '',
    },
  });
}
/**
 * showNextTooltip：执行showNext提示相关逻辑。
 * @param title string 参数说明。
 * @param lines string[] 参数说明。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @returns 无返回值，直接更新showNext提示相关状态。
 */


export function showNextTooltip(title: string, lines: string[], clientX: number, clientY: number): void {
  overlayStore.patchState({
    tooltip: {
      visible: true,
      title,
      lines,
      clientX,
      clientY,
    },
  });
}
/**
 * moveNextTooltip：执行moveNext提示相关逻辑。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @returns 无返回值，直接更新moveNext提示相关状态。
 */


export function moveNextTooltip(clientX: number, clientY: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const { tooltip } = overlayStore.getState();
  if (!tooltip.visible) {
    return;
  }
  overlayStore.patchState({
    tooltip: {
      ...tooltip,
      clientX,
      clientY,
    },
  });
}
/**
 * hideNextTooltip：执行hideNext提示相关逻辑。
 * @returns 无返回值，直接更新hideNext提示相关状态。
 */


export function hideNextTooltip(): void {
  overlayStore.patchState({
    tooltip: {
      visible: false,
      title: '',
      lines: [],
      clientX: 0,
      clientY: 0,
    },
  });
}
/**
 * showNextToast：执行showNextToast相关逻辑。
 * @param message string 参数说明。
 * @param kind NextToastKind 参数说明。
 * @param durationMs 参数说明。
 * @returns 无返回值，直接更新showNextToast相关状态。
 */


export function showNextToast(message: string, kind: NextToastKind = 'system', durationMs = 2500): void {
  const id = toastIdSeed;
  toastIdSeed += 1;
  const nextToast: NextToastEntry = { id, kind, message };
  const previous = overlayStore.getState().toasts;
  overlayStore.patchState({ toasts: [...previous, nextToast] });
  window.setTimeout(() => {
    const current = overlayStore.getState().toasts;
    overlayStore.patchState({
      toasts: current.filter((toast) => toast.id !== id),
    });
  }, Math.max(800, durationMs));
}

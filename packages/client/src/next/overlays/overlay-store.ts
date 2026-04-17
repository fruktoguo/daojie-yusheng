import type { ReactNode } from 'react';
import { createExternalStore } from '../stores/create-external-store';

export type NextToastKind = 'system' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';

export interface NextToastEntry {
  id: number;
  kind: NextToastKind;
  message: string;
}

export interface NextDetailModalState {
  open: boolean;
  title: string;
  subtitle?: string;
  hint?: string;
  body?: ReactNode;
}

export interface NextTooltipState {
  visible: boolean;
  title: string;
  lines: string[];
  clientX: number;
  clientY: number;
}

export interface NextOverlayState {
  detailModal: NextDetailModalState;
  tooltip: NextTooltipState;
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

export function openNextDetailModal(input: Omit<NextDetailModalState, 'open'>): void {
  overlayStore.patchState({
    detailModal: {
      ...input,
      open: true,
    },
  });
}

export function closeNextDetailModal(): void {
  overlayStore.patchState({
    detailModal: {
      open: false,
      title: '',
    },
  });
}

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

export function moveNextTooltip(clientX: number, clientY: number): void {
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

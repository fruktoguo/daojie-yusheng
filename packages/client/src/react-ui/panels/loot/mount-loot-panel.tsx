/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LootWindowState } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  LootPanelContent,
  getLootModalMeta,
  lootPanelStore,
  setLootPanelCallbacks,
} from './LootPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactLootPanel(): boolean {
  return isReactPanelEnabled('loot');
}

export function syncReactLootPanelState(input: {
  windowState: LootWindowState | null;
  suppressAutoOpen?: boolean;
}): void {
  lootPanelStore.patchState({
    windowState: input.windowState,
    suppressAutoOpen: input.suppressAutoOpen ?? false,
  });
}

export function setReactLootPanelCallbacks(callbacks: {
  onTake?: (sourceId: string, itemKey: string) => void;
  onTakeAll?: (sourceId: string) => void;
  onStartGather?: (sourceId: string, itemKey: string) => void;
  onCancelGather?: () => void;
  onStopHarvest?: () => void;
  onManualClose?: () => void;
}): void {
  setLootPanelCallbacks(callbacks);
}

export function resolveReactLootModalMeta(windowState: LootWindowState): {
  title: string;
  subtitle: string;
  hint: string;
  variantClass: string;
} {
  return getLootModalMeta(windowState);
}

export function isReactLootPanelMounted(): boolean {
  return root !== null && host !== null;
}

export function mountReactLootPanel(body: HTMLElement, signal?: AbortSignal): void {
  unmountReactLootPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'loot';
  body.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <LootPanelContent />
    </StrictMode>,
  );
  signal?.addEventListener('abort', unmountReactLootPanel, { once: true });
}

export function unmountReactLootPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

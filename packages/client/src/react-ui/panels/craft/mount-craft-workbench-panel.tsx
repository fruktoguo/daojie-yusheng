/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  CraftWorkbenchPanel,
  craftWorkbenchStore,
  setCraftWorkbenchAfterContentRender,
  type ReactCraftWorkbenchState,
} from './CraftWorkbenchPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactCraftWorkbenchPanel(): boolean {
  return isReactPanelEnabled('craft');
}

export function syncReactCraftWorkbenchState(state: Partial<ReactCraftWorkbenchState>): void {
  const current = craftWorkbenchStore.getState();
  const hasChanged = Object.entries(state).some(([key, value]) => {
    return !Object.is(current[key as keyof ReactCraftWorkbenchState], value);
  });
  if (!hasChanged) {
    return;
  }
  craftWorkbenchStore.patchState(state);
}

export function getReactCraftWorkbenchState(): ReactCraftWorkbenchState {
  return craftWorkbenchStore.getState();
}

export function setReactCraftWorkbenchAfterContentRender(callback: (() => void) | null): void {
  setCraftWorkbenchAfterContentRender(callback);
}

export function mountReactCraftWorkbenchPanel(body: HTMLElement): boolean {
  if (!shouldUseReactCraftWorkbenchPanel()) {
    return false;
  }
  if (host?.isConnected && body.contains(host)) {
    return true;
  }
  unmountReactCraftWorkbenchPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host react-panel-host--craft';
  host.dataset.reactPanel = 'craft';
  body.replaceChildren(host);
  root = createRoot(host);
  flushSync(() => {
    root?.render(
      <StrictMode>
        <CraftWorkbenchPanel />
      </StrictMode>,
    );
  });
  return true;
}

export function unmountReactCraftWorkbenchPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  setReactCraftWorkbenchAfterContentRender(null);
}

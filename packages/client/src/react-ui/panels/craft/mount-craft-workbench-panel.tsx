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

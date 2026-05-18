import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  ActionPanel,
  actionPanelStore,
  setActionPanelAfterContentRender,
  type ReactActionPanelState,
} from './ActionPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactActionPanel(): boolean {
  return isReactPanelEnabled('action');
}

export function syncReactActionPanelState(state: ReactActionPanelState): boolean {
  const current = actionPanelStore.getState();
  if (current.contentKey === state.contentKey && current.html === state.html) {
    return false;
  }
  if (host?.isConnected) {
    flushSync(() => {
      actionPanelStore.setState(state);
    });
    return true;
  }
  actionPanelStore.setState(state);
  return true;
}

export function isReactActionPanelMounted(): boolean {
  return host?.isConnected === true;
}

export function setReactActionPanelAfterContentRender(callback: (() => void) | null): void {
  setActionPanelAfterContentRender(callback);
}

export function mountReactActionPanel(): boolean {
  if (!shouldUseReactActionPanel()) {
    return false;
  }
  const pane = document.getElementById('pane-action');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactActionPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'action';
  pane.replaceChildren(host);
  root = createRoot(host);
  flushSync(() => {
    root?.render(
      <StrictMode>
        <ActionPanel />
      </StrictMode>,
    );
  });
  return true;
}

export function unmountReactActionPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  setReactActionPanelAfterContentRender(null);
}

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  InventoryPanel,
  inventoryPanelStore,
  setInventoryPanelCallbacks,
  type ReactInventoryPanelState,
} from './InventoryPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactInventoryPanel(): boolean {
  return isReactPanelEnabled('inventory');
}

export function syncReactInventoryPanelState(state: ReactInventoryPanelState): void {
  inventoryPanelStore.patchState(state);
}

export function setReactInventoryPanelCallbacks(callbacks: Parameters<typeof setInventoryPanelCallbacks>[0]): void {
  setInventoryPanelCallbacks(callbacks);
}

export function mountReactInventoryPanel(): boolean {
  if (!shouldUseReactInventoryPanel()) {
    return false;
  }
  const pane = document.getElementById('pane-inventory');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactInventoryPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'inventory';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <InventoryPanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactInventoryPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

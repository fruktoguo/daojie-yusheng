import type { BodyTrainingState } from '@mud/shared';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  BodyTrainingPanel,
  bodyTrainingPanelStore,
  setBodyTrainingCallbacks,
} from './BodyTrainingPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactBodyTrainingPanel(): boolean {
  return isReactPanelEnabled('body-training');
}

export function mountReactBodyTrainingPanel(): boolean {
  if (!shouldUseReactBodyTrainingPanel()) {
    return false;
  }
  const pane = document.getElementById('pane-body-training');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactBodyTrainingPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'body-training';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <BodyTrainingPanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactBodyTrainingPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

export function syncReactBodyTrainingPanelState(input: {
  bodyTraining: BodyTrainingState;
  foundation: number;
}): void {
  bodyTrainingPanelStore.patchState(input);
}

export function setReactBodyTrainingCallbacks(callbacks: {
  onInfuse?: ((foundationSpent: number) => void) | null;
}): void {
  setBodyTrainingCallbacks(callbacks);
}

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import { GmPanel, gmPanelStore, setGmPanelCallbacks } from './GmPanel';
import type { C2S_GmUpdatePlayer, S2C_GmState, Suggestion } from '@mud/shared';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactGmPanel(): boolean {
  return isReactPanelEnabled('gm');
}

export function mountReactGmPanel(): boolean {
  if (!shouldUseReactGmPanel()) {
    return false;
  }
  const pane = document.getElementById('pane-gm');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactGmPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'gm';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <GmPanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactGmPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

export function syncReactGmPanelState(input: {
  gmState: S2C_GmState | null;
  suggestions: Suggestion[];
}): void {
  gmPanelStore.patchState(input);
}

export function setReactGmPanelCallbacks(callbacks: {
  onRefresh?: () => void;
  onResetSelf?: () => void;
  onCycleZoom?: () => void;
  onSpawnBots?: (count: number) => void;
  onRemoveBots?: (playerIds?: string[], all?: boolean) => void;
  onUpdatePlayer?: (payload: C2S_GmUpdatePlayer) => void;
  onResetPlayer?: (playerId: string) => void;
  onResetHeavenGate?: (playerId: string) => void;
  onMarkSuggestionCompleted?: (id: string) => void;
  onRemoveSuggestion?: (id: string) => void;
}): void {
  setGmPanelCallbacks(callbacks);
}

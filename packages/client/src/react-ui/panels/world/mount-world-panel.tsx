import { StrictMode } from 'react';
import type { ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MapMeta, PlayerState } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import { TianjiPanel, WorldPanel, setWorldPanelCallbacks, worldPanelStore } from './WorldPanel';

const mountedRoots = new Map<'map-intel' | 'tianji', { root: Root; host: HTMLDivElement }>();

export function shouldUseReactWorldPanel(): boolean {
  return isReactPanelEnabled('world');
}

export function syncReactWorldPanelState(input: { player: PlayerState | null; mapMeta: MapMeta | null }): void {
  worldPanelStore.patchState({
    player: input.player,
    mapMeta: input.mapMeta,
  });
}

export function setReactWorldPanelCallbacks(callbacks: {
  onOpenLeaderboard?: () => void;
  onOpenWorldSummary?: () => void;
}): void {
  setWorldPanelCallbacks(callbacks);
}

export function mountReactWorldPanels(): void {
  mountPane('map-intel', 'pane-map-intel', WorldPanel);
  mountPane('tianji', 'pane-tianji', TianjiPanel);
}

export function unmountReactWorldPanels(): void {
  for (const key of mountedRoots.keys()) {
    unmountPane(key);
  }
}

function mountPane(key: 'map-intel' | 'tianji', paneId: string, Component: ComponentType): void {
  if (mountedRoots.has(key)) {
    return;
  }
  const pane = document.getElementById(paneId);
  if (!pane) {
    return;
  }
  pane.replaceChildren();
  const host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = key === 'map-intel' ? 'world-map-intel' : 'world-tianji';
  pane.append(host);
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <Component />
    </StrictMode>,
  );
  mountedRoots.set(key, { root, host });
}

function unmountPane(key: 'map-intel' | 'tianji'): void {
  const entry = mountedRoots.get(key);
  if (!entry) {
    return;
  }
  entry.root.unmount();
  entry.host.remove();
  mountedRoots.delete(key);
}

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlayerState, TechniqueState } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  TechniquePanel,
  setTechniquePanelCallbacks,
  techniquePanelStore,
} from './TechniquePanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactTechniquePanel(): boolean {
  return isReactPanelEnabled('technique');
}

export function syncReactTechniquePanelState(input: {
  techniques: TechniqueState[];
  cultivatingTechId?: string;
  previewPlayer?: PlayerState;
}): void {
  techniquePanelStore.patchState({
    techniques: input.techniques,
    cultivatingTechId: input.cultivatingTechId,
    previewPlayer: input.previewPlayer ?? null,
  });
}

export function setReactTechniquePanelCallbacks(callbacks: {
  onCultivate?: (techId: string | null) => void;
  onToggleSkills?: (techId: string, enabled: boolean) => void;
  onOpenDetail?: (techId: string) => void;
}): void {
  setTechniquePanelCallbacks(callbacks);
}

export function mountReactTechniquePanel(): boolean {
  if (!shouldUseReactTechniquePanel()) {
    return false;
  }
  const pane = document.getElementById('pane-technique');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactTechniquePanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'technique';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <TechniquePanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactTechniquePanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
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
  pendingComprehensions?: PlayerState['pendingTechniqueComprehensions'];
  cultivatingTechId?: string;
  previewPlayer?: PlayerState;
}): void {
  techniquePanelStore.patchState({
    techniques: input.techniques,
    pendingComprehensions: input.pendingComprehensions ?? [],
    cultivatingTechId: input.cultivatingTechId,
    previewPlayer: input.previewPlayer ?? null,
  });
}

export function setReactTechniquePanelCallbacks(callbacks: {
  onCultivate?: (techId: string | null) => void;
  onToggleSkills?: (techId: string, enabled: boolean) => void;
  onOpenDetail?: (techId: string) => void;
  onStartTransmission?: (learnerPlayerId: string, techId: string) => void;
  onCancelTransmission?: (techId: string) => void;
  getTransmissionTargets?: () => Array<{ playerId: string; name: string }>;
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

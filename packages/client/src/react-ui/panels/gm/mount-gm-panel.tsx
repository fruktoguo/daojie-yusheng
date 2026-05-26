/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import { GmPanel, gmPanelStore, setGmPanelCallbacks } from './GmPanel';
import type { C2S_GmUpdatePlayer, S2C_GmState } from '@mud/shared';

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
}): void {
  setGmPanelCallbacks(callbacks);
}

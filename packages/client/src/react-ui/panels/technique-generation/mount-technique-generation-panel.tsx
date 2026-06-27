/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  TechniqueGenerationPanel,
  techniqueGenerationStore,
  setTechniqueGenerationCallbacks,
  type TechniqueGenerationPanelState,
} from './TechniqueGenerationPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function openTechniqueGenerationPanel(container: HTMLElement): boolean {
  if (host?.isConnected && container.contains(host)) {
    techniqueGenerationStore.patchState({ visible: true });
    return true;
  }
  unmountTechniqueGenerationPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host react-panel-host--technique-generation';
  host.dataset.reactPanel = 'technique-generation';
  container.appendChild(host);
  root = createRoot(host);
  flushSync(() => {
    root?.render(
      <StrictMode>
        <TechniqueGenerationPanel />
      </StrictMode>,
    );
  });
  techniqueGenerationStore.patchState({ visible: true });
  return true;
}

export function closeTechniqueGenerationPanel(): void {
  techniqueGenerationStore.patchState({ visible: false });
}

export function unmountTechniqueGenerationPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

export function syncTechniqueGenerationState(state: Partial<TechniqueGenerationPanelState>): void {
  techniqueGenerationStore.patchState(state);
}

export function getTechniqueGenerationSelectedItemSpend(): number {
  return techniqueGenerationStore.getState().selectedItemSpend;
}

export { setTechniqueGenerationCallbacks, techniqueGenerationStore };

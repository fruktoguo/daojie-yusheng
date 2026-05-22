/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import { EquipmentPanel } from './EquipmentPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactEquipmentPanel(): boolean {
  return isReactPanelEnabled('equipment');
}

export function mountReactEquipmentPanel(): boolean {
  if (!shouldUseReactEquipmentPanel()) {
    return false;
  }
  const pane = document.getElementById('pane-equipment');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactEquipmentPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'equipment';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <EquipmentPanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactEquipmentPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { S2C_AttrUpdate } from '@mud/shared';
import type { AttrTab } from '../../../constants/ui/attr-panel';
import type { AttrPanelSnapshot } from '../../../ui/panels/attr-panel';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  AttrPanel,
  attrPanelStore,
  setAttrPanelCallbacks,
} from './AttrPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactAttrPanel(): boolean {
  return isReactPanelEnabled('attr');
}

export function syncReactAttrPanelState(input: {
  snapshot: AttrPanelSnapshot;
  activeTab: AttrTab;
  rawData?: S2C_AttrUpdate | null;
}): void {
  attrPanelStore.patchState({
    panes: input.snapshot.panes,
    activeTab: input.activeTab,
    rawData: input.rawData ?? null,
  });
}

export function setReactAttrPanelCallbacks(callbacks: {
  onRequestDetail?: () => void;
  onOpenCraftSkill?: (key: string) => void;
  onBindCraftSkill?: (key: string) => void;
  onOpenSpecialDetails?: () => void;
  onCloseSpecialDetails?: () => void;
  onSwitchTab?: (tab: AttrTab) => void;
}): void {
  setAttrPanelCallbacks(callbacks);
}

export function mountReactAttrPanel(): boolean {
  if (!shouldUseReactAttrPanel()) {
    return false;
  }
  const pane = document.getElementById('pane-attr');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactAttrPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'attr';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <AttrPanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactAttrPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

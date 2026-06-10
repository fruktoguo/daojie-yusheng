/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Inventory, QuestState } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  QuestPanel,
  questPanelStore,
  setQuestPanelCallbacks,
} from './QuestPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactQuestPanel(): boolean {
  return isReactPanelEnabled('quest');
}

export function syncReactQuestPanelState(input: {
  quests: QuestState[];
  inventory: Inventory | null;
}): void {
  questPanelStore.patchState(input);
}

export function setReactQuestPanelCallbacks(callbacks: {
  onNavigateQuest?: (questId: string) => void;
  onOpenDetail?: (questId: string) => void;
  onOpenGuideFlow?: (flowId: string) => void;
}): void {
  setQuestPanelCallbacks(callbacks);
}

export function mountReactQuestPanel(): boolean {
  if (!shouldUseReactQuestPanel()) {
    return false;
  }
  if (root && host?.isConnected) {
    return true;
  }
  const pane = document.getElementById('pane-quest');
  if (!pane) {
    return false;
  }
  unmountReactQuestPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'quest';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <QuestPanel />
    </StrictMode>,
  );
  return true;
}

export function unmountReactQuestPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

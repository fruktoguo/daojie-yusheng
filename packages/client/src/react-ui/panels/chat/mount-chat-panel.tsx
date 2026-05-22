/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import { ChatPanel } from './ChatPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactChatPanel(): boolean {
  return isReactPanelEnabled('chat');
}

export function mountReactChatPanel(container: HTMLElement): boolean {
  if (!shouldUseReactChatPanel()) {
    return false;
  }
  unmountReactChatPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host react-panel-host--chat';
  host.dataset.reactPanel = 'chat';
  container.replaceChildren(host);
  root = createRoot(host);
  flushSync(() => {
    root?.render(
      <StrictMode>
        <ChatPanel />
      </StrictMode>,
    );
  });
  return true;
}

export function unmountReactChatPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

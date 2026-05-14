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

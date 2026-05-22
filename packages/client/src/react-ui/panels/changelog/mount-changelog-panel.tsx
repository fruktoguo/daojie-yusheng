/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import { ChangelogPanelContent } from './ChangelogPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactChangelogPanel(): boolean {
  return isReactPanelEnabled('changelog');
}

export function mountReactChangelogPanel(body: HTMLElement, signal?: AbortSignal): void {
  unmountReactChangelogPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'changelog';
  body.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <ChangelogPanelContent />
    </StrictMode>,
  );
  signal?.addEventListener('abort', unmountReactChangelogPanel, { once: true });
}

export function unmountReactChangelogPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

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

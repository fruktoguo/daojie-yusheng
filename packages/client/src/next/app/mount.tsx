import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getViewportRoot } from '../../ui/responsive-viewport';
import { registerReactUiNextToggleApi, isReactUiNextEnabled } from '../bridge/feature-flag';
import { nextUiBridge } from '../bridge/next-ui-bridge';
import { shellStore } from '../stores/shell-store';
import { NextUiRoot } from './NextUiRoot';
import '../styles/index.css';

let root: Root | null = null;

function ensureHost(doc: Document): HTMLElement {
  const existing = doc.getElementById('react-ui-next-root');
  if (existing) {
    return existing;
  }
  const host = doc.createElement('div');
  host.id = 'react-ui-next-root';
  host.className = 'next-ui-root-host';
  (getViewportRoot(doc) ?? doc.body).appendChild(host);
  return host;
}

export function mountNextUi(win: Window = window): void {
  if (root) {
    return;
  }

  registerReactUiNextToggleApi(win);
  const enabled = isReactUiNextEnabled(win);
  shellStore.patchState({ enabled });
  const host = ensureHost(win.document);

  root = createRoot(host);
  root.render(
    <StrictMode>
      <NextUiRoot />
    </StrictMode>,
  );
  nextUiBridge.syncMounted(true);
  nextUiBridge.syncEnabled(enabled);
}

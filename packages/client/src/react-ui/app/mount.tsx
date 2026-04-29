import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getViewportRoot } from '../../ui/responsive-viewport';
import { registerReactUiToggleApi, isReactUiEnabled } from '../bridge/feature-flag';
import { reactUiBridge } from '../bridge/react-ui-bridge';
import { shellStore } from '../stores/shell-store';
import { ReactUiRoot } from './ReactUiRoot';
import '../styles/index.css';

let root: Root | null = null;
/**
 * ensureHost：执行ensureHost相关逻辑。
 * @param doc Document 参数说明。
 * @returns 返回ensureHost。
 */


function ensureHost(doc: Document): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const existing = doc.getElementById('react-ui-root');
  if (existing) {
    return existing;
  }
  const host = doc.createElement('div');
  host.id = 'react-ui-root';
  host.className = 'react-ui-root-host';
  (getViewportRoot(doc) ?? doc.body).appendChild(host);
  return host;
}
/**
 * mountReactUi：执行mountReactUi相关逻辑。
 * @param win Window 参数说明。
 * @returns 无返回值，直接更新mountReactUi相关状态。
 */


export function mountReactUi(win: Window = window): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (root) {
    return;
  }

  registerReactUiToggleApi(win);
  const enabled = isReactUiEnabled(win);
  shellStore.patchState({ enabled });
  const host = ensureHost(win.document);

  root = createRoot(host);
  root.render(
    <StrictMode>
      <ReactUiRoot />
    </StrictMode>,
  );
  reactUiBridge.syncMounted(true);
  reactUiBridge.syncEnabled(enabled);
}

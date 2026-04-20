import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getViewportRoot } from '../../ui/responsive-viewport';
import { registerReactUiNextToggleApi, isReactUiNextEnabled } from '../bridge/feature-flag';
import { nextUiBridge } from '../bridge/next-ui-bridge';
import { shellStore } from '../stores/shell-store';
import { NextUiRoot } from './NextUiRoot';
import '../styles/index.css';

let root: Root | null = null;
/**
 * ensureHost：执行ensureHost相关逻辑。
 * @param doc Document 参数说明。
 * @returns 返回ensureHost。
 */


function ensureHost(doc: Document): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * mountNextUi：执行mountNextUi相关逻辑。
 * @param win Window 参数说明。
 * @returns 无返回值，直接更新mountNextUi相关状态。
 */


export function mountNextUi(win: Window = window): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AccountRedeemCodesRes } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  SettingsPanel,
  setSettingsPanelCallbacks,
  settingsPanelStore,
} from './SettingsPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactSettingsPanel(): boolean {
  return isReactPanelEnabled('settings');
}

export function syncReactSettingsPanelState(input: {
  accountName: string;
  playerId: string;
  displayName: string;
  roleName: string;
}): void {
  settingsPanelStore.patchState(input);
}

export function setReactSettingsPanelCallbacks(callbacks: {
  onDisplayNameUpdated?: (displayName: string) => void;
  onRoleNameUpdated?: (roleName: string) => void;
  redeemCodes?: (codes: string[]) => Promise<AccountRedeemCodesRes>;
  onLogout?: () => void;
}): void {
  setSettingsPanelCallbacks(callbacks);
}

export function mountReactSettingsPanel(body: HTMLElement, signal?: AbortSignal): void {
  unmountReactSettingsPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'settings';
  body.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <SettingsPanel />
    </StrictMode>,
  );
  signal?.addEventListener('abort', unmountReactSettingsPanel, { once: true });
}

export function unmountReactSettingsPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AuctionHouseTab } from '@mud/shared';
import {
  MarketPanel,
  setMarketPanelCallbacks,
} from './MarketPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function setReactMarketPanelCallbacks(callbacks: {
  onOpenMarket?: () => void;
  onOpenAuction?: (tab: AuctionHouseTab) => void;
  onOpenTransmission?: () => void;
  onOpenHeavenlyDaoShop?: () => void;
  onOpenTechniqueGeneration?: () => void;
}): void {
  setMarketPanelCallbacks(callbacks);
}

export function mountReactMarketPanel(): boolean {
  const pane = document.getElementById('pane-market');
  if (!pane) {
    return false;
  }
  if (host?.isConnected) {
    return true;
  }
  unmountReactMarketPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'market';
  pane.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <MarketPanel />
    </StrictMode>,
  );
  return true;
}

function unmountReactMarketPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Inventory, PlayerState, S2C_MarketUpdate } from '@mud/shared';
import type { AuctionHouseTab } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  MarketPanel,
  marketPanelStore,
  setMarketPanelCallbacks,
} from './MarketPanel';

type AuctionStats = {
  activeLots: number;
  myBids: number;
  myConsignments: number;
  storageCount: number;
  feed: Array<{ status: string; name: string; meta: string }>;
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactMarketPanel(): boolean {
  return isReactPanelEnabled('market');
}

export function syncReactMarketPanelState(input: {
  marketUpdate: S2C_MarketUpdate | null;
  inventory: Inventory | null;
  player: PlayerState | null;
  auctionStats: AuctionStats;
  totalListings: number;
  currentPage: number;
  totalPages: number;
}): void {
  marketPanelStore.patchState({
    marketUpdate: input.marketUpdate,
    listings: [],
    myOrders: input.marketUpdate?.myOrders.map((order) => ({
      orderId: order.id,
      itemName: order.item.name,
      kind: order.side,
      quantity: order.remainingQuantity,
      unitPrice: order.unitPrice,
      filled: 0,
    })) ?? [],
    auctionStats: input.auctionStats,
    inventory: input.inventory,
    player: input.player,
    totalListings: input.totalListings,
    currentPage: input.currentPage,
    totalPages: input.totalPages,
  });
}

export function setReactMarketPanelCallbacks(callbacks: {
  onRequestMarket?: () => void;
  onOpenModal?: () => void;
  onOpenAuction?: (tab: AuctionHouseTab) => void;
  onOpenAuctionConsign?: () => void;
}): void {
  setMarketPanelCallbacks(callbacks);
}

export function mountReactMarketPanel(): boolean {
  if (!shouldUseReactMarketPanel()) {
    return false;
  }
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

export function unmountReactMarketPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

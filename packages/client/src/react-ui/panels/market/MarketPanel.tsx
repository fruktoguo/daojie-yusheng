/**
 * 本文件负责 市场 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback } from 'react';
import type { S2C_MarketUpdate, ItemType, EquipSlot, Inventory, PlayerState, AuctionHouseTab } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

type MarketCategoryFilter = 'all' | ItemType;

interface MarketListingView {
  itemKey: string;
  name: string;
  count: number;
  unitPrice: number;
  sellerName?: string;
  itemType?: ItemType;
  equipSlot?: EquipSlot;
}

interface MarketOrderView {
  orderId: string;
  itemName: string;
  kind: 'buy' | 'sell';
  quantity: number;
  unitPrice: number;
  filled: number;
}

interface AuctionStats {
  activeLots: number;
  myBids: number;
  myConsignments: number;
  storageCount: number;
  feed: Array<{ status: string; name: string; meta: string }>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface MarketPanelState {
  marketUpdate: S2C_MarketUpdate | null;
  listings: MarketListingView[];
  myOrders: MarketOrderView[];
  auctionStats: AuctionStats;
  inventory: Inventory | null;
  player: PlayerState | null;
  totalListings: number;
  currentPage: number;
  totalPages: number;
}

export const { store: marketPanelStore, useStore: useMarketPanelStore } = createPanelStore<MarketPanelState>({
  marketUpdate: null,
  listings: [],
  myOrders: [],
  auctionStats: { activeLots: 0, myBids: 0, myConsignments: 0, storageCount: 0, feed: [] },
  inventory: null,
  player: null,
  totalListings: 0,
  currentPage: 1,
  totalPages: 1,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface MarketPanelCallbacks {
  onRequestMarket: (() => void) | null;
  onRequestListings: ((page: number, category?: MarketCategoryFilter) => void) | null;
  onOpenModal: (() => void) | null;
  onOpenAuction: ((tab: AuctionHouseTab) => void) | null;
  onOpenAuctionConsign: (() => void) | null;
  onOpenHeavenlyDaoShop: (() => void) | null;
  onBuyHeavenlyDaoShopItem: ((itemId: string, quantity: number) => void) | null;
  onCreateSellOrder: ((slotIndex: number, quantity: number, unitPrice: number) => void) | null;
  onCreateBuyOrder: ((itemKey: string, quantity: number, unitPrice: number) => void) | null;
  onCancelOrder: ((orderId: string) => void) | null;
  onClaimStorage: (() => void) | null;
}

const callbacks: MarketPanelCallbacks = {
  onRequestMarket: null,
  onRequestListings: null,
  onOpenModal: null,
  onOpenAuction: null,
  onOpenAuctionConsign: null,
  onOpenHeavenlyDaoShop: null,
  onBuyHeavenlyDaoShopItem: null,
  onCreateSellOrder: null,
  onCreateBuyOrder: null,
  onCancelOrder: null,
  onClaimStorage: null,
};

export function setMarketPanelCallbacks(cbs: Partial<MarketPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Main Component (Summary Pane) ──────────────────────────────────────────

export const MarketPanel = memo(function MarketPanel() {
  const handleOpenMarket = useCallback(() => {
    callbacks.onRequestMarket?.();
    callbacks.onOpenModal?.();
  }, []);

  const handleOpenAuction = useCallback((tab: AuctionHouseTab) => {
    callbacks.onRequestMarket?.();
    callbacks.onOpenAuction?.(tab);
  }, []);

  const handleOpenHeavenlyDaoShop = useCallback(() => {
    callbacks.onOpenHeavenlyDaoShop?.();
  }, []);

  return (
    <div className="market-pane-wrapper">
      <div className="panel-section market-pane ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('market.pane.title', undefined)}</div>
        <div className="market-pane-entry-actions">
          <button className="small-btn" type="button" onClick={handleOpenMarket}>
            坊市
          </button>
          <button className="small-btn" type="button" onClick={() => handleOpenAuction('participate')}>
            拍卖行
          </button>
          <button className="small-btn" type="button" onClick={handleOpenHeavenlyDaoShop}>
            天道商店
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * 本文件负责 市场 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback } from 'react';
import {
  HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID,
  HEAVENLY_DAO_SHOP_ITEMS,
  type S2C_MarketUpdate,
  type ItemType,
  type EquipSlot,
  type Inventory,
  type PlayerState,
  type AuctionHouseTab,
} from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { formatDisplayInteger } from '../../../utils/number';
import { getPlayerOwnedItemCount } from '../../../utils/player-wallet';
import { getLocalItemTemplate } from '../../../content/local-templates';
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

interface AuctionFeedEntry {
  status: string;
  name: string;
  meta: string;
}

interface AuctionStats {
  activeLots: number;
  myBids: number;
  myConsignments: number;
  storageCount: number;
  feed: AuctionFeedEntry[];
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
  const { marketUpdate, auctionStats, totalListings, myOrders, player, inventory } = useMarketPanelStore();

  const listedCount = totalListings || marketUpdate?.listedItems?.length || 0;
  const orderCount = myOrders.length || marketUpdate?.myOrders?.length || 0;
  const storageCount = marketUpdate?.storage?.items?.reduce((sum, item) => sum + item.count, 0) ?? 0;

  const handleOpenMarket = useCallback(() => {
    callbacks.onRequestMarket?.();
    callbacks.onOpenModal?.();
  }, []);

  const handleOpenAuction = useCallback((tab: AuctionHouseTab) => {
    callbacks.onRequestMarket?.();
    callbacks.onOpenAuction?.(tab);
  }, []);

  const handleOpenConsign = useCallback(() => {
    callbacks.onRequestMarket?.();
    callbacks.onOpenAuctionConsign?.();
  }, []);

  return (
    <div className="market-pane-wrapper">
      {/* 坊市摘要 */}
      <div className="panel-section market-pane ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('market.pane.title', undefined)}</div>
        <div className="market-pane-copy ui-form-copy">{t('market.pane.hint', undefined)}</div>
        <div className="market-pane-stats">
          <div className="market-pane-stat">
            <strong>{formatDisplayInteger(listedCount)}</strong>
            <span>{t('market.pane.stat.listed', undefined)}</span>
          </div>
          <div className="market-pane-stat">
            <strong>{formatDisplayInteger(orderCount)}</strong>
            <span>{t('market.pane.stat.orders', undefined)}</span>
          </div>
          <div className="market-pane-stat">
            <strong>{formatDisplayInteger(storageCount)}</strong>
            <span>{t('market.pane.stat.storage', undefined)}</span>
          </div>
        </div>
        <button className="small-btn" type="button" onClick={handleOpenMarket}>
          {t('market.pane.open', undefined)}
        </button>
      </div>

      {/* 拍卖行摘要 */}
      <div className="panel-section market-pane auction-pane ui-surface-pane ui-surface-pane--stack">
        <div className="market-pane-headline">
          <div className="panel-section-title">{t('market.auction.summary.title', undefined)}</div>
          <div className="market-pane-headline-actions">
            <button className="small-btn ghost" type="button" onClick={handleOpenConsign}>
              {t('market.auction.action.create', undefined)}
            </button>
            <button className="small-btn ghost" type="button" onClick={() => handleOpenAuction('participate')}>
              {t('market.auction.open', undefined)}
            </button>
          </div>
        </div>
        <div className="market-pane-copy ui-form-copy">{t('market.auction.summary.copy', undefined)}</div>
        <div className="auction-pane-cards">
          <button className="auction-pane-card ui-surface-card ui-surface-card--compact" type="button" onClick={() => handleOpenAuction('participate')}>
            <span>{t('market.auction.card.participate', undefined)}</span>
            <strong>{formatDisplayInteger(auctionStats.activeLots)}</strong>
            <small>{t('market.auction.card.my-bids', { count: formatDisplayInteger(auctionStats.myBids) })}</small>
          </button>
          <button className="auction-pane-card ui-surface-card ui-surface-card--compact" type="button" onClick={() => handleOpenAuction('mine')}>
            <span>{t('market.auction.card.mine', undefined)}</span>
            <strong>{formatDisplayInteger(auctionStats.myConsignments)}</strong>
            <small>{t('market.auction.card.storage-count', { count: formatDisplayInteger(auctionStats.storageCount) })}</small>
          </button>
        </div>
        <AuctionFeed feed={auctionStats.feed} />
      </div>

      <HeavenlyDaoShop player={player} inventory={inventory} />
    </div>
  );
});

const HeavenlyDaoShop = memo(function HeavenlyDaoShop({ player, inventory }: { player: PlayerState | null; inventory: Inventory | null }) {
  const currencyName = getLocalItemTemplate(HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID)?.name ?? '功德';
  const owned = getPlayerOwnedItemCount(player, inventory, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID);
  return (
    <div className="panel-section market-pane heavenly-dao-shop-pane ui-surface-pane ui-surface-pane--stack">
      <div className="market-pane-headline">
        <div className="panel-section-title">天道商店</div>
        <div className="market-pane-headline-actions">
          <span className="market-pane-copy ui-form-copy">持有 {currencyName}：{formatDisplayInteger(owned)}</span>
        </div>
      </div>
      <div className="auction-pane-feed">
        {HEAVENLY_DAO_SHOP_ITEMS.map((entry) => {
          const template = getLocalItemTemplate(entry.itemId);
          const itemName = template?.name ?? entry.itemId;
          const countText = entry.count > 1 ? ` x${formatDisplayInteger(entry.count)}` : '';
          return (
            <div key={entry.itemId} className="auction-pane-feed-row">
              <span>{itemName}{countText}</span>
              <strong>{formatDisplayInteger(entry.price)} {currencyName}</strong>
              <button
                className="small-btn ghost"
                type="button"
                disabled={owned < entry.price}
                onClick={() => callbacks.onBuyHeavenlyDaoShopItem?.(entry.itemId, 1)}
              >
                购买
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Auction Feed ────────────────────────────────────────────────────────────

const AuctionFeed = memo(function AuctionFeed({ feed }: { feed: AuctionFeedEntry[] }) {
  if (feed.length === 0) {
    return <div className="auction-pane-feed"><div className="empty-hint">{t('market.auction.feed.empty', undefined)}</div></div>;
  }
  return (
    <div className="auction-pane-feed">
      {feed.map((entry, i) => (
        <div key={`${entry.status}-${entry.name}-${i}`} className="auction-pane-feed-row">
          <span>{entry.status}</span>
          <strong>{entry.name}</strong>
          <small>{entry.meta}</small>
        </div>
      ))}
    </div>
  );
});

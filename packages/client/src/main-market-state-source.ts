import {
  Inventory,
  NEXT_S2C_MarketItemBook,
  NEXT_S2C_MarketListings,
  NEXT_S2C_MarketOrders,
  NEXT_S2C_MarketStorage,
  NEXT_S2C_MarketTradeHistory,
  NEXT_S2C_MarketUpdate,
  PlayerState,
  SyncedItemStack,
} from '@mud/shared-next';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { MarketPanel } from './ui/panels/market-panel';

type MainMarketStateSourceOptions = {
  socket: Pick<
    SocketSocialEconomySender,
    | 'sendRequestMarket'
    | 'sendRequestMarketListings'
    | 'sendRequestMarketItemBook'
    | 'sendRequestMarketTradeHistory'
    | 'sendCreateMarketSellOrder'
    | 'sendCreateMarketBuyOrder'
    | 'sendCancelMarketOrder'
    | 'sendClaimMarketStorage'
  >;
  getPlayer: () => PlayerState | null;
  hydrateInventoryItem: (item: SyncedItemStack) => Inventory['items'][number];
};

export type MainMarketStateSource = ReturnType<typeof createMainMarketStateSource>;

export function createMainMarketStateSource(options: MainMarketStateSourceOptions) {
  const marketPanel = new MarketPanel();

  marketPanel.setCallbacks({
    onRequestMarket: () => options.socket.sendRequestMarket(),
    onRequestListings: (payload) => options.socket.sendRequestMarketListings(payload),
    onRequestItemBook: (itemKey) => options.socket.sendRequestMarketItemBook(itemKey),
    onRequestTradeHistory: (page) => options.socket.sendRequestMarketTradeHistory(page),
    onCreateSellOrder: (slotIndex, quantity, unitPrice) => options.socket.sendCreateMarketSellOrder(slotIndex, quantity, unitPrice),
    onCreateBuyOrder: (itemKey, quantity, unitPrice) => options.socket.sendCreateMarketBuyOrder(itemKey, quantity, unitPrice),
    onCancelOrder: (orderId) => options.socket.sendCancelMarketOrder(orderId),
    onClaimStorage: () => options.socket.sendClaimMarketStorage(),
  });

  return {
    initFromPlayer(player: PlayerState): void {
      marketPanel.initFromPlayer(player);
    },

    syncInventory(inventory: Inventory): void {
      marketPanel.syncInventory(inventory);
    },

    clear(): void {
      marketPanel.clear();
    },

    handleMarketUpdate(data: NEXT_S2C_MarketUpdate): void {
      const player = options.getPlayer();
      if (player) {
        player.marketStorage = data.storage;
      }
      marketPanel.updateMarket(data);
    },

    handleMarketListings(data: NEXT_S2C_MarketListings): void {
      marketPanel.updateListings(data);
    },

    handleMarketOrders(data: NEXT_S2C_MarketOrders): void {
      marketPanel.updateOrders(data);
    },

    handleMarketStorage(data: NEXT_S2C_MarketStorage): void {
      const player = options.getPlayer();
      if (player) {
        player.marketStorage = {
          items: data.items.map((entry) => options.hydrateInventoryItem(entry.item)),
        };
      }
      marketPanel.updateStorage(data);
    },

    handleMarketItemBook(data: NEXT_S2C_MarketItemBook): void {
      marketPanel.updateItemBook(data);
    },

    handleMarketTradeHistory(data: NEXT_S2C_MarketTradeHistory): void {
      marketPanel.updateTradeHistory(data);
    },
  };
}

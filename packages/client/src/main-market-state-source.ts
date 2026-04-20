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
/**
 * MainMarketStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMarketStateSourceOptions = {
/**
 * socket：对象字段。
 */

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
  /**
 * getPlayer：对象字段。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * hydrateInventoryItem：对象字段。
 */

  hydrateInventoryItem: (item: SyncedItemStack) => Inventory['items'][number];
};
/**
 * MainMarketStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainMarketStateSource = ReturnType<typeof createMainMarketStateSource>;
/**
 * createMainMarketStateSource：构建并返回目标对象。
 * @param options MainMarketStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


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
  /**
 * initFromPlayer：初始化并准备运行时基础状态。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */

    initFromPlayer(player: PlayerState): void {
      marketPanel.initFromPlayer(player);
    },    
    /**
 * syncInventory：执行核心业务逻辑。
 * @param inventory Inventory 参数说明。
 * @returns void。
 */


    syncInventory(inventory: Inventory): void {
      marketPanel.syncInventory(inventory);
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      marketPanel.clear();
    },    
    /**
 * handleMarketUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MarketUpdate 原始数据。
 * @returns void。
 */


    handleMarketUpdate(data: NEXT_S2C_MarketUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (player) {
        player.marketStorage = data.storage;
      }
      marketPanel.updateMarket(data);
    },    
    /**
 * handleMarketListings：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MarketListings 原始数据。
 * @returns void。
 */


    handleMarketListings(data: NEXT_S2C_MarketListings): void {
      marketPanel.updateListings(data);
    },    
    /**
 * handleMarketOrders：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MarketOrders 原始数据。
 * @returns void。
 */


    handleMarketOrders(data: NEXT_S2C_MarketOrders): void {
      marketPanel.updateOrders(data);
    },    
    /**
 * handleMarketStorage：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MarketStorage 原始数据。
 * @returns void。
 */


    handleMarketStorage(data: NEXT_S2C_MarketStorage): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (player) {
        player.marketStorage = {
          items: data.items.map((entry) => options.hydrateInventoryItem(entry.item)),
        };
      }
      marketPanel.updateStorage(data);
    },    
    /**
 * handleMarketItemBook：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MarketItemBook 原始数据。
 * @returns void。
 */


    handleMarketItemBook(data: NEXT_S2C_MarketItemBook): void {
      marketPanel.updateItemBook(data);
    },    
    /**
 * handleMarketTradeHistory：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MarketTradeHistory 原始数据。
 * @returns void。
 */


    handleMarketTradeHistory(data: NEXT_S2C_MarketTradeHistory): void {
      marketPanel.updateTradeHistory(data);
    },
  };
}

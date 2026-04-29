import {
  Inventory,
  PlayerState,
  S2C_MarketItemBook,
  S2C_MarketListings,
  S2C_MarketOrders,
  S2C_MarketStorage,
  S2C_MarketTradeHistory,
  S2C_MarketUpdate,
  SyncedItemStack,
} from '@mud/shared';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { MarketPanel } from './ui/panels/market-panel';
/**
 * MainMarketStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMarketStateSourceOptions = {
/**
 * socket：socket相关字段。
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
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;
  /**
 * hydrateInventoryItem：hydrate背包道具相关字段。
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
 * @returns 无返回值，直接更新Main坊市状态来源相关状态。
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
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */

    initFromPlayer(player: PlayerState): void {
      marketPanel.initFromPlayer(player);
    },
    /**
 * syncInventory：处理背包并更新相关状态。
 * @param inventory Inventory 参数说明。
 * @returns 无返回值，直接更新背包相关状态。
 */


    syncInventory(inventory: Inventory): void {
      marketPanel.syncInventory(inventory);
    },
    /**
 * syncPlayerContext：处理玩家上下文并更新相关状态。
 * @param player PlayerState | undefined 玩家对象。
 * @returns 无返回值，直接更新玩家上下文相关状态。
 */

    syncPlayerContext(player?: PlayerState): void {
      marketPanel.syncPlayerContext(player);
    },
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      marketPanel.clear();
    },
    /**
 * handleMarketUpdate：处理坊市Update并更新相关状态。
 * @param data S2C_MarketUpdate 原始数据。
 * @returns 无返回值，直接更新坊市Update相关状态。
 */


    handleMarketUpdate(data: S2C_MarketUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (player) {
        player.marketStorage = data.storage;
      }
      marketPanel.updateMarket(data);
    },
    /**
 * handleMarketListings：读取坊市Listing并返回结果。
 * @param data S2C_MarketListings 原始数据。
 * @returns 无返回值，直接更新坊市Listing相关状态。
 */


    handleMarketListings(data: S2C_MarketListings): void {
      marketPanel.updateListings(data);
    },
    /**
 * handleMarketOrders：处理坊市订单并更新相关状态。
 * @param data S2C_MarketOrders 原始数据。
 * @returns 无返回值，直接更新坊市订单相关状态。
 */


    handleMarketOrders(data: S2C_MarketOrders): void {
      marketPanel.updateOrders(data);
    },
    /**
 * handleMarketStorage：处理坊市Storage并更新相关状态。
 * @param data S2C_MarketStorage 原始数据。
 * @returns 无返回值，直接更新坊市Storage相关状态。
 */


    handleMarketStorage(data: S2C_MarketStorage): void {
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
 * handleMarketItemBook：处理坊市道具Book并更新相关状态。
 * @param data S2C_MarketItemBook 原始数据。
 * @returns 无返回值，直接更新坊市道具Book相关状态。
 */


    handleMarketItemBook(data: S2C_MarketItemBook): void {
      marketPanel.updateItemBook(data);
    },
    /**
 * handleMarketTradeHistory：判断坊市Trade历史是否满足条件。
 * @param data S2C_MarketTradeHistory 原始数据。
 * @returns 无返回值，直接更新坊市TradeHistory相关状态。
 */


    handleMarketTradeHistory(data: S2C_MarketTradeHistory): void {
      marketPanel.updateTradeHistory(data);
    },
  };
}

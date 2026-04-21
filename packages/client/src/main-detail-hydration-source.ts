import {
  clonePlainValue,
  getTileTraversalCost,
  type GroundItemPileView,
  type Inventory,
  type LootWindowState,
  type NEXT_S2C_LootWindowUpdate,
  type NEXT_S2C_NpcShop,
  type SyncedItemStack,
  type Tile,
} from '@mud/shared-next';
/**
 * MainDetailHydrationSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainDetailHydrationSourceOptions = {
/**
 * hydrateSyncedItemStack：hydrateSynced道具Stack相关字段。
 */

  hydrateSyncedItemStack: (item: SyncedItemStack, previous?: Inventory['items'][number]) => Inventory['items'][number];
};
/**
 * MainDetailHydrationSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainDetailHydrationSource = ReturnType<typeof createMainDetailHydrationSource>;
/**
 * createMainDetailHydrationSource：构建并返回目标对象。
 * @param options MainDetailHydrationSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main详情Hydration来源相关状态。
 */


export function createMainDetailHydrationSource(options: MainDetailHydrationSourceOptions) {
  return {  
  /**
 * cloneJson：构建Json。
 * @param value T 参数说明。
 * @returns 返回Json。
 */

    cloneJson<T>(value: T): T {
      return clonePlainValue(value);
    },    
    /**
 * hydrateSyncedItemStack：处理hydrateSynced道具Stack并更新相关状态。
 * @param item SyncedItemStack 道具。
 * @param previous Inventory['items'][number] 参数说明。
 * @returns 返回hydrateSynced道具Stack数值。
 */


    hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
      return options.hydrateSyncedItemStack(item, previous);
    },    
    /**
 * hydrateLootWindowState：执行hydrate掉落窗口状态相关逻辑。
 * @param window NEXT_S2C_LootWindowUpdate['window'] 参数说明。
 * @returns 返回hydrate掉落窗口状态。
 */


    hydrateLootWindowState(window: NEXT_S2C_LootWindowUpdate['window']): LootWindowState | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!window) {
        return null;
      }
      return {
        tileX: window.tileX,
        tileY: window.tileY,
        title: window.title,
        sources: window.sources.map((source) => ({
          sourceId: source.sourceId,
          kind: source.kind,
          title: source.title,
          desc: source.desc,
          grade: source.grade,
          searchable: source.searchable,
          search: source.search ? clonePlainValue(source.search) : undefined,
          emptyText: source.emptyText,
          variant: source.variant,
          herb: source.herb ? clonePlainValue(source.herb) : undefined,
          destroyed: source.destroyed,
          items: source.items.map((entry) => ({
            itemKey: entry.itemKey,
            item: options.hydrateSyncedItemStack(entry.item),
          })),
        })),
      };
    },    
    /**
 * hydrateNpcShopResponse：执行hydrateNPCShopResponse相关逻辑。
 * @param data NEXT_S2C_NpcShop 原始数据。
 * @returns 无返回值，直接更新hydrateNPCShopResponse相关状态。
 */


    hydrateNpcShopResponse(data: NEXT_S2C_NpcShop) {
      return {
        npcId: data.npcId,
        error: data.error,
        shop: data.shop
          ? {
              npcId: data.shop.npcId,
              npcName: data.shop.npcName,
              dialogue: data.shop.dialogue,
              currencyItemId: data.shop.currencyItemId,
              currencyItemName: data.shop.currencyItemName,
              items: data.shop.items.map((entry) => ({
                itemId: entry.itemId,
                unitPrice: entry.unitPrice,
                remainingQuantity: entry.remainingQuantity,
                stockLimit: entry.stockLimit,
                refreshAt: entry.refreshAt,
                item: options.hydrateSyncedItemStack(entry.item),
              })),
            }
          : null,
      };
    },    
    /**
 * formatTraversalCost：规范化或转换Traversal消耗。
 * @param tile Tile 参数说明。
 * @returns 返回Traversal消耗。
 */


    formatTraversalCost(tile: Tile): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!tile.walkable) {
        return '无法通行';
      }
      return `${getTileTraversalCost(tile.type)} 点/格`;
    },
  };
}

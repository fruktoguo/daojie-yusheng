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

type MainDetailHydrationSourceOptions = {
  hydrateSyncedItemStack: (item: SyncedItemStack, previous?: Inventory['items'][number]) => Inventory['items'][number];
};

export type MainDetailHydrationSource = ReturnType<typeof createMainDetailHydrationSource>;

export function createMainDetailHydrationSource(options: MainDetailHydrationSourceOptions) {
  return {
    cloneJson<T>(value: T): T {
      return clonePlainValue(value);
    },

    hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
      return options.hydrateSyncedItemStack(item, previous);
    },

    hydrateLootWindowState(window: NEXT_S2C_LootWindowUpdate['window']): LootWindowState | null {
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
          items: source.items.map((entry) => ({
            itemKey: entry.itemKey,
            item: options.hydrateSyncedItemStack(entry.item),
          })),
        })),
      };
    },

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

    formatTraversalCost(tile: Tile): string {
      if (!tile.walkable) {
        return '无法通行';
      }
      return `${getTileTraversalCost(tile.type)} 点/格`;
    },
  };
}

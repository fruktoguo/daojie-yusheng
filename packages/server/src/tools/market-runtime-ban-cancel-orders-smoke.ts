import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

type RuntimeItem = Record<string, unknown> & { itemId: string; count: number };

async function main(): Promise<void> {
  const bannedPlayerId = 'player:market-ban-cancel';
  const bidderPlayerId = 'player:market-ban-bidder';
  const bidderPlayer = {
    playerId: bidderPlayerId,
    inventory: { items: [] as RuntimeItem[] },
    wallet: { balances: [] as Array<Record<string, unknown>> },
  };
  const persistedMutations: Array<Record<string, unknown>> = [];
  const service = new MarketRuntimeService(
    {
      normalizeItem(item: RuntimeItem) {
        return {
          ...item,
          count: Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1,
          name: typeof item?.name === 'string' ? item.name : item.itemId,
        };
      },
      getItemName(itemId: string) {
        if (itemId === 'spirit_stone') {
          return '灵石';
        }
        if (itemId === 'rat_tail') {
          return '鼠尾';
        }
        if (itemId === 'iron_sword') {
          return '铁剑';
        }
        return itemId;
      },
      createItem(itemId: string, count = 1) {
        if (itemId === 'iron_sword') {
          return { itemId, count, name: '铁剑', type: 'equipment', equipSlot: 'weapon', enhanceLevel: 0 };
        }
        return { itemId, count, name: itemId === 'spirit_stone' ? '灵石' : itemId };
      },
    } as never,
    {
      getPlayer(requestedPlayerId: string) {
        return requestedPlayerId === bidderPlayerId ? bidderPlayer : null;
      },
      snapshot(requestedPlayerId: string) {
        return requestedPlayerId === bidderPlayerId ? structuredClone(bidderPlayer) : null;
      },
      canReceiveInventoryItem() {
        return true;
      },
      receiveInventoryItem(requestedPlayerId: string, item: RuntimeItem) {
        if (requestedPlayerId !== bidderPlayerId) {
          throw new Error(`unexpected receiveInventoryItem player: ${requestedPlayerId}`);
        }
        const existing = bidderPlayer.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
          existing.count += item.count;
        } else {
          bidderPlayer.inventory.items.push({ ...item });
        }
      },
      restoreSnapshot(snapshot: { playerId?: string }) {
        if (snapshot?.playerId !== bidderPlayerId) {
          return;
        }
        bidderPlayer.inventory.items = structuredClone((snapshot as typeof bidderPlayer).inventory.items);
        bidderPlayer.wallet.balances = structuredClone((snapshot as typeof bidderPlayer).wallet.balances);
      },
    } as never,
    {
      async loadStorageForPlayer() {
        return { items: [] };
      },
      async persistMutation(input: Record<string, unknown>) {
        persistedMutations.push(structuredClone(input));
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
  );

  const ratTail = (service as unknown as { toFullItem(item: RuntimeItem): RuntimeItem }).toFullItem({ itemId: 'rat_tail', count: 2, name: '鼠尾' });
  const sword = (service as unknown as { toFullItem(item: RuntimeItem): RuntimeItem }).toFullItem({
    itemId: 'iron_sword',
    count: 1,
    name: '铁剑',
    type: 'equipment',
    equipSlot: 'weapon',
    enhanceLevel: 0,
  });
  const ratTailKey = (service as unknown as { buildItemKey(item: RuntimeItem): string }).buildItemKey(ratTail);
  const swordKey = (service as unknown as { buildItemKey(item: RuntimeItem): string }).buildItemKey(sword);
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [
    {
      version: 1,
      id: 'order:ban:sell',
      ownerId: bannedPlayerId,
      side: 'sell',
      status: 'open',
      itemKey: ratTailKey,
      item: ratTail,
      remainingQuantity: 2,
      unitPrice: 4,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      version: 1,
      id: 'order:ban:buy',
      ownerId: bannedPlayerId,
      side: 'buy',
      status: 'open',
      itemKey: ratTailKey,
      item: { ...ratTail, count: 1 },
      remainingQuantity: 3,
      unitPrice: 5,
      createdAt: 2,
      updatedAt: 2,
    },
    {
      version: 1,
      id: 'order:ban:auction',
      ownerId: bannedPlayerId,
      side: 'sell',
      status: 'open',
      itemKey: swordKey,
      item: sword,
      remainingQuantity: 1,
      unitPrice: 20,
      createdAt: 3,
      updatedAt: 3,
      auction: {
        version: 1,
        mode: 'auction',
        buyoutPrice: 30,
        startAtMs: 3,
        normalDurationSeconds: 3600,
        endAtMs: Date.now() + 3600_000,
        maxEndAtMs: Date.now() + 7200_000,
        bids: [
          {
            bidderId: bidderPlayerId,
            bidderLabel: '竞拍者',
            unitPrice: 22,
            createdAt: 4,
            reservedCost: 22,
          },
        ],
      },
    },
  ];
  (service as unknown as { hydrateAuctionStateFromOpenOrders(): void }).hydrateAuctionStateFromOpenOrders();

  const result = await service.cancelOpenOrdersForBannedPlayer(bannedPlayerId) as {
    affectedPlayerIds: string[];
    cancelledOrderIds: string[];
  };

  assert.deepEqual(result.cancelledOrderIds.sort(), ['order:ban:auction', 'order:ban:buy', 'order:ban:sell']);
  assert.equal(result.affectedPlayerIds.includes(bannedPlayerId), true);
  assert.equal(result.affectedPlayerIds.includes(bidderPlayerId), true);
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.length, 0);
  assert.equal(persistedMutations.length, 1);

  const mutation = persistedMutations[0] as {
    deleteOrderIds: string[];
    upsertStorages: Array<{ playerId: string; storage: { items: RuntimeItem[] } }>;
  };
  assert.deepEqual(mutation.deleteOrderIds.sort(), ['order:ban:auction', 'order:ban:buy', 'order:ban:sell']);
  const bannedStorage = mutation.upsertStorages.find((entry) => entry.playerId === bannedPlayerId)?.storage;
  assert.ok(bannedStorage, 'expected banned player market storage to be persisted');
  assert.equal(bannedStorage.items.find((entry) => entry.itemId === 'rat_tail')?.count, 2);
  assert.equal(bannedStorage.items.find((entry) => entry.itemId === 'spirit_stone')?.count, 15);
  assert.equal(bannedStorage.items.find((entry) => entry.itemId === 'iron_sword')?.count, 1);
  assert.equal(bidderPlayer.inventory.items.find((entry) => entry.itemId === 'spirit_stone')?.count, 22);

  console.log('market-runtime-ban-cancel-orders-smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

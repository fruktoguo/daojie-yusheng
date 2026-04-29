// @ts-nocheck
import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

async function main(): Promise<void> {
  const sellerId = 'player:market-buy-seller';
  const buyerId = 'player:market-buy-buyer';
  const durableCalls: Array<Record<string, unknown>> = [];
  const sellerPlayer = {
    playerId: sellerId,
    runtimeOwnerId: 'runtime:seller',
    sessionEpoch: 9,
    instanceId: 'instance:market-buy',
    inventory: { items: [{ itemId: 'rat_tail', count: 4, name: '鼠尾' }] },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 3, frozenBalance: 0, version: 1 }] },
  };
  const buyerPlayer = {
    playerId: buyerId,
    runtimeOwnerId: 'runtime:buyer',
    sessionEpoch: 7,
    instanceId: 'instance:market-buy',
    inventory: { items: [] as Array<Record<string, unknown>> },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 12, frozenBalance: 0, version: 1 }] },
  };
  const runtimePlayers = new Map([[sellerId, sellerPlayer], [buyerId, buyerPlayer]]);
  const service = new MarketRuntimeService(
    {
      normalizeItem(item: Record<string, unknown>) {
        return { ...item, count: Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1 };
      },
      getItemName(itemId: string) {
        return itemId === 'rat_tail' ? '鼠尾' : itemId;
      },
    } as never,
    {
      peekInventoryItem(requestedPlayerId: string, slotIndex: number) {
        return requestedPlayerId === sellerId && slotIndex === 0 ? { itemId: 'rat_tail', count: 4, name: '鼠尾' } : null;
      },
      snapshot(requestedPlayerId: string) {
        return runtimePlayers.has(requestedPlayerId) ? structuredClone(runtimePlayers.get(requestedPlayerId)) : null;
      },
      getPlayerOrThrow(requestedPlayerId: string) {
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player) {
          throw new Error(`unexpected player ${requestedPlayerId}`);
        }
        return player;
      },
      getPlayer(requestedPlayerId: string) {
        return runtimePlayers.get(requestedPlayerId) ?? null;
      },
      replaceInventoryItems(requestedPlayerId: string, items: Array<Record<string, unknown>>) {
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player) {
          throw new Error(`unexpected replaceInventoryItems args: ${requestedPlayerId}`);
        }
        player.inventory.items = items.map((entry) => ({ ...entry }));
        return player;
      },
      canAffordWallet() {
        return true;
      },
      debitWallet(requestedPlayerId: string, walletType: string, amount: number) {
        if (requestedPlayerId !== buyerId || walletType !== 'spirit_stone') {
          throw new Error(`unexpected debit args: ${JSON.stringify({ requestedPlayerId, walletType, amount })}`);
        }
        buyerPlayer.wallet.balances[0].balance -= amount;
        return buyerPlayer;
      },
      creditWallet(requestedPlayerId: string, walletType: string, amount: number) {
        if (walletType !== 'spirit_stone') {
          throw new Error(`unexpected credit walletType: ${walletType}`);
        }
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player) {
          throw new Error(`unexpected credit args: ${requestedPlayerId}`);
        }
        player.wallet.balances[0].balance += amount;
        return player;
      },
      restoreSnapshot(snapshot: Record<string, unknown>) {
        if (snapshot?.playerId && runtimePlayers.has(String(snapshot.playerId))) {
          runtimePlayers.set(String(snapshot.playerId), structuredClone(snapshot));
        }
      },
    } as never,
    {
      persistMutation() {
        return undefined;
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async settleMarketBuyNow(input: Record<string, unknown>) {
        durableCalls.push({ ...input });
        return { ok: true, alreadyCommitted: false };
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(requestedInstanceId: string) {
        if (requestedInstanceId !== 'instance:market-buy') {
          return null;
        }
        return { assigned_node_id: 'node:market-buy', ownership_epoch: 12 };
      },
    } as never,
  );

  const orderItem = (service as unknown as { toFullItem(item: Record<string, unknown>): Record<string, unknown> }).toFullItem({ itemId: 'rat_tail', count: 1, name: '鼠尾' });
  const itemKey = (service as unknown as { buildItemKey(item: Record<string, unknown>): string }).buildItemKey(orderItem);
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [
    {
      version: 1,
      id: 'order:sell:1',
      ownerId: sellerId,
      side: 'sell',
      status: 'open',
      itemKey,
      item: orderItem,
      remainingQuantity: 2,
      unitPrice: 3,
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  const result = await service.buyNow(buyerId, { itemKey, quantity: 2 });
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:buyer');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 7);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:market-buy');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:market-buy');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 12);
  assert.equal(buyerPlayer.wallet.balances[0].balance, 6);
  assert.equal(buyerPlayer.inventory.items[0]?.count ?? 0, 2);
  assert.equal(sellerPlayer.wallet.balances[0].balance, 9);
  assert.equal(sellerPlayer.inventory.items[0].count, 2);
  assert.equal(result.notices.some((entry) => entry.playerId === buyerId), true);
  console.log(JSON.stringify({ ok: true, case: 'market-runtime-buy-now' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

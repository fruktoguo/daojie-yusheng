// @ts-nocheck
import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

async function main(): Promise<void> {
  const sellerId = 'player:market-sell-seller';
  const buyerId = 'player:market-sell-buyer';
  const durableCalls: Array<Record<string, unknown>> = [];
  const sellerPlayer = {
    playerId: sellerId,
    runtimeOwnerId: 'runtime:seller',
    sessionEpoch: 11,
    instanceId: 'instance:market-sell',
    inventory: { items: [{ itemId: 'rat_tail', count: 3, name: '鼠尾' }] },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 2, frozenBalance: 0, version: 1 }] },
  };
  const buyerPlayer = {
    playerId: buyerId,
    runtimeOwnerId: 'runtime:buyer',
    sessionEpoch: 5,
    instanceId: 'instance:market-sell',
    inventory: { items: [] as Array<Record<string, unknown>> },
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
        if (requestedPlayerId !== sellerId || slotIndex !== 0) {
          return null;
        }
        return { itemId: 'rat_tail', count: 3, name: '鼠尾' };
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
      restoreSnapshot(snapshot: Record<string, unknown>) {
        if (snapshot?.playerId && runtimePlayers.has(String(snapshot.playerId))) {
          runtimePlayers.set(String(snapshot.playerId), structuredClone(snapshot));
        }
      },
      splitInventoryItem(requestedPlayerId: string, slotIndex: number, quantity: number) {
        if (requestedPlayerId !== sellerId || slotIndex !== 0 || quantity !== 2) {
          throw new Error(`unexpected split args: ${JSON.stringify({ requestedPlayerId, slotIndex, quantity })}`);
        }
        const player = runtimePlayers.get(requestedPlayerId)!;
        player.inventory.items[0].count = Number(player.inventory.items[0].count ?? 0) - Number(quantity);
        return { itemId: 'rat_tail', count: 2, name: '鼠尾' };
      },
      creditWallet(requestedPlayerId: string, walletType: string, amount = 1) {
        if (requestedPlayerId !== sellerId || walletType !== 'spirit_stone') {
          throw new Error(`unexpected credit args: ${JSON.stringify({ requestedPlayerId, walletType, amount })}`);
        }
        sellerPlayer.wallet.balances[0].balance += amount;
        return sellerPlayer;
      },
      canReceiveInventoryItem() {
        return true;
      },
      receiveInventoryItem(requestedPlayerId: string, item: Record<string, unknown>) {
        if (requestedPlayerId !== buyerId) {
          throw new Error(`unexpected receive args: ${JSON.stringify({ requestedPlayerId, item })}`);
        }
        const normalizedCount = Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1;
        const existing = buyerPlayer.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
          existing.count = Number(existing.count ?? 0) + normalizedCount;
        } else {
          buyerPlayer.inventory.items.push({ ...item, count: normalizedCount });
        }
        return buyerPlayer;
      },
      restoreSnapshot(snapshot: Record<string, unknown>) {
        if (snapshot?.playerId && runtimePlayers.has(String(snapshot.playerId))) {
          runtimePlayers.set(String(snapshot.playerId), structuredClone(snapshot));
        }
      },
    } as never,
    {
      async persistMutation() {
        return undefined;
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async settleMarketSellNow(input: Record<string, unknown>) {
        durableCalls.push({ ...input });
        return { ok: true, alreadyCommitted: false };
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(requestedInstanceId: string) {
        if (requestedInstanceId !== 'instance:market-sell') {
          return null;
        }
        return { assigned_node_id: 'node:market-sell', ownership_epoch: 13 };
      },
    } as never,
  );
  const orderItem = (service as unknown as { toFullItem(item: Record<string, unknown>): Record<string, unknown> }).toFullItem({ itemId: 'rat_tail', count: 3, name: '鼠尾' });
  const itemKey = (service as unknown as { buildItemKey(item: Record<string, unknown>): string }).buildItemKey(orderItem);
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [
    {
      version: 1,
      id: 'order:buy:1',
      ownerId: buyerId,
      side: 'buy',
      status: 'open',
      itemKey,
      item: orderItem,
      remainingQuantity: 2,
      unitPrice: 3,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const result = await service.sellNow(sellerId, { slotIndex: 0, quantity: 2 });
  assert.equal(result.notices.some((entry) => entry.playerId === sellerId), true);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:seller');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 11);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:market-sell');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:market-sell');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 13);
  assert.equal(sellerPlayer.wallet.balances[0].balance, 8);
  assert.equal(sellerPlayer.inventory.items[0].count, 1);
  assert.equal(buyerPlayer.inventory.items[0]?.count ?? 0, 2);
  console.log(JSON.stringify({ ok: true, case: 'market-runtime-sell-now' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

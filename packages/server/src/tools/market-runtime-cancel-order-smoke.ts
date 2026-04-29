// @ts-nocheck
import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

async function main(): Promise<void> {
  const playerId = 'player:market-cancel-seller';
  const durableCalls: Array<Record<string, unknown>> = [];
  const runtimePlayer = {
    playerId,
    runtimeOwnerId: 'runtime:cancel',
    sessionEpoch: 14,
    instanceId: 'instance:market-cancel',
    inventory: { items: [] as Array<Record<string, unknown>> },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 5, frozenBalance: 0, version: 1 }] },
  };
  const runtimePlayers = new Map([[playerId, runtimePlayer]]);
  const service = new MarketRuntimeService(
    {
      normalizeItem(item: Record<string, unknown>) {
        return {
          ...item,
          count: Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1,
        };
      },
      getItemName(itemId: string) {
        return itemId === 'rat_tail' ? '鼠尾' : itemId;
      },
    } as never,
    {
      snapshot(requestedPlayerId: string) {
        return runtimePlayers.has(requestedPlayerId) ? structuredClone(runtimePlayers.get(requestedPlayerId)) : null;
      },
      replaceInventoryItems(requestedPlayerId: string, items: Array<Record<string, unknown>>) {
        if (requestedPlayerId !== playerId) {
          throw new Error(`unexpected replaceInventoryItems args: ${JSON.stringify({ requestedPlayerId, items })}`);
        }
        runtimePlayer.inventory.items = items.map((entry) => ({ ...entry }));
        return runtimePlayer;
      },
      creditWallet() {
        throw new Error('sell-side durable cancel should not credit wallet in runtime fallback path');
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
      async settleMarketCancelOrder(input: Record<string, unknown>) {
        durableCalls.push({ ...input });
        return { ok: true, alreadyCommitted: false };
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(requestedInstanceId: string) {
        if (requestedInstanceId !== 'instance:market-cancel') {
          return null;
        }
        return { assigned_node_id: 'node:market-cancel', ownership_epoch: 19 };
      },
    } as never,
  );

  const orderItem = (service as unknown as { toFullItem(item: Record<string, unknown>): Record<string, unknown> }).toFullItem({ itemId: 'rat_tail', count: 2, name: '鼠尾' });
  const itemKey = (service as unknown as { buildItemKey(item: Record<string, unknown>): string }).buildItemKey(orderItem);
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [
    {
      version: 1,
      id: 'order:sell:cancel:1',
      ownerId: playerId,
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

  const result = await service.cancelOrder(playerId, { orderId: 'order:sell:cancel:1' });
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:cancel');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 14);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:market-cancel');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:market-cancel');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 19);
  assert.equal(durableCalls[0]?.side, 'sell');
  assert.equal(runtimePlayer.inventory.items[0]?.itemId, 'rat_tail');
  assert.equal(runtimePlayer.inventory.items[0]?.count ?? 0, 2);
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.length, 0);
  assert.equal(result.notices.some((entry) => entry.playerId === playerId), true);
  console.log(JSON.stringify({ ok: true, case: 'market-runtime-cancel-order' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

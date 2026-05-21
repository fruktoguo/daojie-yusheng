// @ts-nocheck
import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

async function main(): Promise<void> {
  const playerId = 'player:market-cancel-seller';
  const durableCalls: Array<Record<string, unknown>> = [];
  const presenceSaves: Array<Record<string, unknown>> = [];
  const runtimePlayer = {
    playerId,
    runtimeOwnerId: 'runtime:cancel:14',
    sessionEpoch: 14,
    sessionId: 'session:market-cancel',
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
      describePersistencePresence(requestedPlayerId: string) {
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player) {
          return null;
        }
        return {
          online: true,
          inWorld: true,
          lastHeartbeatAt: 1000,
          offlineSinceAt: null,
          runtimeOwnerId: player.runtimeOwnerId,
          sessionEpoch: player.sessionEpoch,
          transferState: null,
          transferTargetNodeId: null,
        };
      },
      ensureRuntimeSessionFenceAtLeast(requestedPlayerId: string, sessionEpochFloor: number) {
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player) {
          return null;
        }
        player.sessionEpoch = Math.max(Number(player.sessionEpoch ?? 0), Math.trunc(Number(sessionEpochFloor))) + 1;
        player.runtimeOwnerId = `runtime:cancel:${player.sessionEpoch}`;
        return {
          runtimeOwnerId: player.runtimeOwnerId,
          sessionEpoch: player.sessionEpoch,
        };
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
    null,
    null,
    {
      isEnabled() {
        return true;
      },
      async loadPlayerPresence(requestedPlayerId: string) {
        if (requestedPlayerId !== playerId) {
          return null;
        }
        return {
          playerId,
          online: true,
          inWorld: true,
          lastHeartbeatAt: 900,
          offlineSinceAt: null,
          runtimeOwnerId: null,
          sessionEpoch: 461,
          transferState: null,
          transferTargetNodeId: null,
        };
      },
      async savePlayerPresence(requestedPlayerId: string, presence: Record<string, unknown>) {
        presenceSaves.push({ playerId: requestedPlayerId, ...presence });
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
  assert.equal(presenceSaves.length, 1);
  assert.equal(presenceSaves[0]?.runtimeOwnerId, 'runtime:cancel:462');
  assert.equal(presenceSaves[0]?.sessionEpoch, 462);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, 'runtime:cancel:462');
  assert.equal(durableCalls[0]?.expectedSessionEpoch, 462);
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

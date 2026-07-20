import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

type SmokeItem = {
  itemId: string;
  count: number;
  name: string;
  type?: string;
  itemInstanceId?: string;
};

type SmokePlayer = {
  playerId: string;
  sessionId: string;
  runtimeOwnerId: string;
  sessionEpoch: number;
  instanceId: string;
  inventory: { capacity: number; items: SmokeItem[] };
  wallet: { balances: unknown[] };
};

async function main(): Promise<void> {
  const onlineSellerId = 'player:auction-expiry:online';
  const offlineSellerId = 'player:auction-expiry:offline';
  const onlinePlayer: SmokePlayer = {
    playerId: onlineSellerId,
    sessionId: 'session:auction-expiry:online',
    runtimeOwnerId: 'runtime:auction-expiry:online',
    sessionEpoch: 7,
    instanceId: 'instance:auction-expiry',
    inventory: { capacity: 20, items: [] },
    wallet: { balances: [] },
  };
  const now = Date.now();
  const persistedMutations: Array<Record<string, unknown>> = [];
  const openOrders = [
    buildExpiredAuctionOrder({
      orderId: 'order:auction-expiry:online',
      ownerId: onlineSellerId,
      item: {
        itemId: 'iron_sword',
        count: 1,
        name: '铁剑',
        type: 'equipment',
        itemInstanceId: '11111111-1111-4111-8111-111111111111',
      },
      now,
    }),
    buildExpiredAuctionOrder({
      orderId: 'order:auction-expiry:offline',
      ownerId: offlineSellerId,
      item: {
        itemId: 'jade_armor',
        count: 1,
        name: '玉甲',
        type: 'equipment',
        itemInstanceId: '22222222-2222-4222-8222-222222222222',
      },
      now,
    }),
  ];

  const service = new MarketRuntimeService(
    {
      normalizeItem(item: SmokeItem) {
        return { ...item, count: Math.max(1, Math.trunc(Number(item.count) || 1)) };
      },
      createItem(itemId: string, count = 1) {
        return { itemId, count, name: itemId };
      },
      getItemName(itemId: string) {
        return itemId === 'iron_sword' ? '铁剑' : itemId === 'jade_armor' ? '玉甲' : itemId;
      },
      listItemTemplates() {
        return [];
      },
      getItemSortLevel() {
        return 0;
      },
    } as never,
    {
      getPlayer(playerId: string) {
        return playerId === onlineSellerId ? onlinePlayer : null;
      },
      snapshot(playerId: string) {
        return playerId === onlineSellerId ? structuredClone(onlinePlayer) : null;
      },
      describePersistencePresence(playerId: string) {
        return playerId === onlineSellerId
          ? {
              online: true,
              runtimeOwnerId: onlinePlayer.runtimeOwnerId,
              sessionEpoch: onlinePlayer.sessionEpoch,
            }
          : null;
      },
      canReceiveInventoryItem(playerId: string) {
        return playerId === onlineSellerId;
      },
      receiveInventoryItem(playerId: string, item: SmokeItem) {
        assert.equal(playerId, onlineSellerId);
        onlinePlayer.inventory.items.push({ ...item });
      },
      replaceInventoryItems(playerId: string, items: SmokeItem[]) {
        assert.equal(playerId, onlineSellerId);
        onlinePlayer.inventory.items = items.map((item) => ({ ...item }));
      },
      replaceWalletBalances() {},
      async runExclusiveAssetMutation<T>(_playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
        return action();
      },
    } as never,
    {
      async loadOpenOrders() {
        return structuredClone(openOrders);
      },
      async loadTradeHistory() {
        return [];
      },
      async loadStorageForPlayer(playerId: string) {
        return playerId === offlineSellerId
          ? { items: [{ itemId: 'rat_tail', count: 2, name: '鼠尾' }] }
          : { items: [] };
      },
      async persistMutation(input: Record<string, unknown>) {
        persistedMutations.push(structuredClone(input));
      },
    } as never,
    { isEnabled: () => false } as never,
    { isEnabled: () => false } as never,
  );

  await service.reloadFromPersistence();
  const identityProbe = {
    itemId: 'iron_sword',
    count: 1,
    name: '铁剑',
    type: 'equipment',
    itemInstanceId: '33333333-3333-4333-8333-333333333333',
  };
  const ordinaryOrderItem = (service as unknown as {
    toOrderItem(item: SmokeItem): SmokeItem;
  }).toOrderItem(identityProbe);
  const escrowOrderItem = (service as unknown as {
    toEscrowOrderItem(item: SmokeItem): SmokeItem;
  }).toEscrowOrderItem(identityProbe);
  assert.equal(ordinaryOrderItem.itemInstanceId, undefined, '普通坊市订单必须脱去卖家实例身份');
  assert.equal(
    escrowOrderItem.itemInstanceId,
    identityProbe.itemInstanceId,
    '拍卖/传法台托管必须保留原实例身份',
  );
  const result = await service.settleExpiredAuctionLots();

  assert.ok(result, '首次到期结算必须返回资产变更');
  assert.equal(onlinePlayer.inventory.items.length, 1);
  assert.equal(onlinePlayer.inventory.items[0]?.itemInstanceId, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(
    service.getStorage(offlineSellerId).items.map((item) => [item.itemId, item.count]),
    [['jade_armor', 1], ['rat_tail', 2]],
  );
  assert.equal((service as unknown as { openOrders: unknown[] }).openOrders.length, 0);
  assert.equal((service as unknown as { auctionTimingByItemKey: Map<string, unknown> }).auctionTimingByItemKey.size, 0);
  assert.equal((service as unknown as { auctionBidsByItemKey: Map<string, unknown> }).auctionBidsByItemKey.size, 0);

  const expiryNotices = result.notices.filter(
    (entry) => entry.structured?.key === 'notice.market.auction.expired-returned',
  );
  assert.deepEqual(expiryNotices.map((entry) => entry.playerId).sort(), [offlineSellerId, onlineSellerId]);
  assert.equal(expiryNotices.find((entry) => entry.playerId === onlineSellerId)?.structured?.vars?.itemName, '铁剑');
  assert.equal(expiryNotices.find((entry) => entry.playerId === offlineSellerId)?.structured?.vars?.quantity, 1);

  assert.equal(persistedMutations.length, 1);
  const persisted = persistedMutations[0] as {
    deleteOrderIds: string[];
    upsertStorages: Array<{ playerId: string; storage: { items: SmokeItem[] } }>;
  };
  assert.deepEqual(
    persisted.deleteOrderIds.sort(),
    ['order:auction-expiry:offline', 'order:auction-expiry:online'],
  );
  assert.equal(
    persisted.upsertStorages.find((entry) => entry.playerId === offlineSellerId)?.storage.items
      .some((item) => item.itemInstanceId === '22222222-2222-4222-8222-222222222222'),
    true,
  );

  const repeated = await service.settleExpiredAuctionLots();
  assert.equal(repeated, null, '重复结算不得再次返还已结束拍品');
  assert.equal(onlinePlayer.inventory.items.length, 1);
  assert.equal(service.getStorage(offlineSellerId).items.length, 2);
  assert.equal(persistedMutations.length, 1);

  console.log(JSON.stringify({ ok: true, case: 'market-auction-expiry-return' }, null, 2));
}

function buildExpiredAuctionOrder(input: {
  orderId: string;
  ownerId: string;
  item: SmokeItem;
  now: number;
}): Record<string, unknown> {
  return {
    version: 1,
    id: input.orderId,
    ownerId: input.ownerId,
    side: 'sell',
    status: 'open',
    itemKey: input.item.itemId,
    item: input.item,
    remainingQuantity: input.item.count,
    unitPrice: 10,
    createdAt: input.now - 10_000,
    updatedAt: input.now - 10_000,
    auction: {
      version: 1,
      mode: 'auction',
      buyoutPrice: 20,
      startAtMs: input.now - 10_000,
      normalDurationSeconds: 1,
      endAtMs: input.now - 9_000,
      maxEndAtMs: input.now - 9_000,
      bids: [],
    },
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

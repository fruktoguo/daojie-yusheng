import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

interface TestItem {
  itemId: string;
  count: number;
  name?: string;
  type?: string;
  itemInstanceId?: string;
}

interface TestPlayer {
  playerId: string;
  runtimeOwnerId: string;
  sessionEpoch: number;
  instanceId: string;
  inventory: { items: TestItem[] };
  wallet: { balances: Array<{ walletType: string; balance: number; frozenBalance: number; version: number }> };
}

async function main(): Promise<void> {
  const buyerId = 'player:durable-market:buyer';
  const sellerId = 'player:durable-market:seller';
  const alternateSellerId = 'player:durable-market:alternate-seller';
  const players = new Map<string, TestPlayer>([
    [buyerId, buildPlayer(buyerId, 'runtime:buyer', 7, [
      { itemId: 'spirit_stone', count: 12, name: '灵石', type: 'material', itemInstanceId: 'stone:buyer' },
    ])],
    [sellerId, buildPlayer(sellerId, 'runtime:seller', 9, [
      { itemId: 'rat_tail', count: 4, name: '鼠尾', type: 'material', itemInstanceId: 'tail:seller:remaining' },
    ])],
    [alternateSellerId, buildPlayer(alternateSellerId, 'runtime:alternate-seller', 11, [
      { itemId: 'rat_tail', count: 8, name: '鼠尾', type: 'material', itemInstanceId: 'tail:alternate' },
    ])],
  ]);
  const durableCalls: Array<Record<string, unknown>> = [];
  const committedOperations = new Map<string, Record<string, unknown>>();
  let persistedOpenOrders: Array<Record<string, unknown>> = [];
  let persistedTradeHistory: Array<Record<string, unknown>> = [];
  const persistedStorageByPlayerId = new Map<string, TestItem[]>();
  let loseNextCommitAcknowledgement = true;
  const assetLockCalls: string[][] = [];
  let assetLockDepth = 0;
  let activeAssetLockPlayerIds = new Set<string>();
  let fallbackPersistenceCalls = 0;

  const playerRuntime = {
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    getPlayerOrThrow(playerId: string) {
      const player = players.get(playerId);
      if (!player) throw new Error(`missing player ${playerId}`);
      return player;
    },
    snapshot(playerId: string) {
      const player = players.get(playerId);
      return player ? structuredClone(player) : null;
    },
    async runExclusiveAssetMutation<T>(playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
      assetLockCalls.push(Array.from(playerIds).sort());
      const previousLocks = activeAssetLockPlayerIds;
      activeAssetLockPlayerIds = new Set(playerIds);
      assetLockDepth += 1;
      try {
        return await action();
      } finally {
        assetLockDepth -= 1;
        activeAssetLockPlayerIds = previousLocks;
      }
    },
    hasActiveAssetMutationLocks(playerIds: readonly string[]) {
      return assetLockDepth > 0 && playerIds.every((playerId) => activeAssetLockPlayerIds.has(playerId));
    },
    canAffordWallet(playerId: string, walletType: string, amount: number) {
      return countItem(players.get(playerId), walletType) >= amount;
    },
    debitWallet(playerId: string, walletType: string, amount: number) {
      const player = requirePlayer(players, playerId);
      consumeItem(player.inventory.items, walletType, amount);
      syncWallet(player);
      return player;
    },
    creditWallet(playerId: string, walletType: string, amount: number) {
      const player = requirePlayer(players, playerId);
      receiveItem(player.inventory.items, { itemId: walletType, count: amount, name: walletType });
      syncWallet(player);
      return player;
    },
    canReceiveInventoryItem() {
      return true;
    },
    receiveInventoryItem(playerId: string, item: TestItem) {
      const player = requirePlayer(players, playerId);
      receiveItem(player.inventory.items, item);
      syncWallet(player);
      return player;
    },
    replaceInventoryItems(playerId: string, items: TestItem[]) {
      assert.ok(assetLockDepth > 0, '市场回滚玩家背包必须发生在参与玩家资产锁内');
      const player = requirePlayer(players, playerId);
      player.inventory.items = items.map((item) => ({ ...item }));
      syncWallet(player);
      return player;
    },
    replaceWalletBalances(playerId: string, balances: TestPlayer['wallet']['balances']) {
      assert.ok(assetLockDepth > 0, '市场回滚玩家钱包必须发生在参与玩家资产锁内');
      const player = requirePlayer(players, playerId);
      player.wallet.balances = balances.map((entry) => ({ ...entry }));
      return player;
    },
  };

  const service = new MarketRuntimeService(
    {
      normalizeItem(item: TestItem) {
        return { ...item };
      },
      createItem(itemId: string, count = 1) {
        return { itemId, count, name: itemId === 'rat_tail' ? '鼠尾' : itemId, type: 'material' };
      },
      getItemName(itemId: string) {
        return itemId === 'rat_tail' ? '鼠尾' : itemId;
      },
      listItemTemplates() {
        return [];
      },
      getItemSortLevel() {
        return 0;
      },
    } as never,
    playerRuntime as never,
    {
      async persistMutation() {
        fallbackPersistenceCalls += 1;
      },
      async loadOpenOrders() {
        return structuredClone(persistedOpenOrders);
      },
      async loadTradeHistory() {
        return structuredClone(persistedTradeHistory);
      },
      async loadStorageForPlayer(playerId: string) {
        return { items: structuredClone(persistedStorageByPlayerId.get(playerId) ?? []) };
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async settleMarketMutation(input: Record<string, unknown>) {
        durableCalls.push(structuredClone(input));
        const operationId = String(input.operationId ?? '');
        if (committedOperations.has(operationId)) {
          return { ok: true, alreadyCommitted: true };
        }
        const operationPayload = {
          request: input.payload ?? {},
          expectedOrders: input.expectedOrders ?? [],
          playerMutations: input.playerMutations ?? [],
          upsertOrders: input.upsertOrders ?? [],
          deleteOrderIds: input.deleteOrderIds ?? [],
          tradeRecords: input.tradeRecords ?? [],
          banUser: input.banUser ?? null,
        };
        committedOperations.set(operationId, structuredClone(operationPayload));
        const deletedOrderIds = new Set(
          Array.isArray(input.deleteOrderIds) ? input.deleteOrderIds.map(String) : [],
        );
        persistedOpenOrders = persistedOpenOrders.filter((order) => !deletedOrderIds.has(String(order.id ?? '')));
        for (const order of Array.isArray(input.upsertOrders) ? input.upsertOrders : []) {
          const normalizedOrder = structuredClone(order) as Record<string, unknown>;
          persistedOpenOrders = persistedOpenOrders.filter((entry) => entry.id !== normalizedOrder.id);
          persistedOpenOrders.push(normalizedOrder);
        }
        if (Array.isArray(input.tradeRecords)) {
          persistedTradeHistory.unshift(...structuredClone(input.tradeRecords) as Array<Record<string, unknown>>);
        }
        for (const mutation of Array.isArray(input.playerMutations) ? input.playerMutations : []) {
          const playerId = String((mutation as { playerId?: unknown }).playerId ?? '');
          const storageItems = (mutation as { nextMarketStorageItems?: TestItem[] }).nextMarketStorageItems;
          if (playerId && Array.isArray(storageItems)) {
            persistedStorageByPlayerId.set(playerId, structuredClone(storageItems));
          }
        }
        if (loseNextCommitAcknowledgement) {
          loseNextCommitAcknowledgement = false;
          // DurableOperationService 已在内部确认这是当前调用的 COMMIT，仍返回本次成功语义。
          return { ok: true, alreadyCommitted: false };
        }
        return { ok: true, alreadyCommitted: false };
      },
      async isOperationCommitted(operationId: string) {
        return committedOperations.has(operationId);
      },
      async getOperationReplay(operationId: string) {
        const payload = committedOperations.get(operationId) ?? null;
        return {
          operation: payload ? { operation_id: operationId, payload_jsonb: structuredClone(payload) } : null,
          outboxEvents: [],
          assetAuditLogs: [],
        };
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
  );

  const orderItem = (service as unknown as {
    toFullItem(item: TestItem): TestItem;
  }).toFullItem({ itemId: 'rat_tail', count: 1, name: '鼠尾', type: 'material' });
  const itemKey = (service as unknown as {
    buildItemKey(item: TestItem): string;
  }).buildItemKey(orderItem);
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [{
    version: 1,
    id: 'order:durable:sell:1',
    ownerId: sellerId,
    side: 'sell',
    status: 'open',
    itemKey,
    item: orderItem,
    remainingQuantity: 2,
    unitPrice: 3,
    createdAt: 1,
    updatedAt: 1,
  }];
  persistedOpenOrders = structuredClone(
    (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders,
  );
  const result = await service.buyNow(buyerId, {
    itemKey,
    quantity: 2,
    operationId: 'smoke-buy-now',
  });

  assert.equal(durableCalls.length, 1);
  assert.equal(fallbackPersistenceCalls, 0);
  assert.deepEqual(assetLockCalls, [[buyerId, sellerId].sort()]);
  assert.equal(countItem(players.get(buyerId), 'spirit_stone'), 6);
  assert.equal(countItem(players.get(buyerId), 'rat_tail'), 2);
  assert.equal(countItem(players.get(sellerId), 'rat_tail'), 4);
  assert.equal(countItem(players.get(sellerId), 'spirit_stone'), 6);
  assert.equal((service as unknown as { openOrders: unknown[] }).openOrders.length, 0);
  assert.equal(result.notices.some((notice: { playerId?: string }) => notice.playerId === buyerId), true);
  assert.notEqual(result.alreadyCommitted, true);

  const mutation = durableCalls[0] ?? {};
  assert.equal(mutation.operationType, 'market_buy_now');
  assert.deepEqual(mutation.deleteOrderIds, ['order:durable:sell:1']);
  assert.deepEqual(mutation.expectedOrders, [{
    orderId: 'order:durable:sell:1',
    exists: true,
    status: 'open',
    remainingQuantity: 2,
    updatedAtMs: 1,
  }]);
  assert.equal(Array.isArray(mutation.tradeRecords) ? mutation.tradeRecords.length : 0, 1);
  const playerMutations = Array.isArray(mutation.playerMutations)
    ? mutation.playerMutations as Array<{ playerId?: string; nextInventoryItems?: TestItem[] }>
    : [];
  const buyerMutation = playerMutations.find((entry) => entry.playerId === buyerId);
  const sellerMutation = playerMutations.find((entry) => entry.playerId === sellerId);
  assert.equal(countItem({ inventory: { items: buyerMutation?.nextInventoryItems ?? [] } }, 'spirit_stone'), 6);
  assert.equal(countItem({ inventory: { items: buyerMutation?.nextInventoryItems ?? [] } }, 'rat_tail'), 2);
  assert.equal(countItem({ inventory: { items: sellerMutation?.nextInventoryItems ?? [] } }, 'rat_tail'), 4);
  assert.equal(countItem({ inventory: { items: sellerMutation?.nextInventoryItems ?? [] } }, 'spirit_stone'), 6);

  const buyerAfterLaterMutation = structuredClone(requirePlayer(players, buyerId));
  receiveItem(buyerAfterLaterMutation.inventory.items, { itemId: 'later_reward', count: 3, name: '后续奖励' });
  syncWallet(buyerAfterLaterMutation);
  const sellerAfterLaterMutation = structuredClone(requirePlayer(players, sellerId));
  receiveItem(sellerAfterLaterMutation.inventory.items, { itemId: 'later_reward', count: 5, name: '后续奖励' });
  syncWallet(sellerAfterLaterMutation);
  players.set(buyerId, structuredClone(buyerAfterLaterMutation));
  players.set(sellerId, structuredClone(sellerAfterLaterMutation));
  const alternateSellerBeforeReplay = structuredClone(requirePlayer(players, alternateSellerId));
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [{
    version: 1,
    id: 'order:durable:sell:alternate',
    ownerId: alternateSellerId,
    side: 'sell',
    status: 'open',
    itemKey,
    item: orderItem,
    remainingQuantity: 2,
    unitPrice: 3,
    createdAt: 1,
    updatedAt: 1,
  }];

  const replayResult = await service.buyNow(buyerId, {
    itemKey,
    quantity: 2,
    operationId: 'smoke-buy-now',
  });

  assert.equal(durableCalls.length, 2);
  assert.equal(fallbackPersistenceCalls, 0);
  assert.deepEqual(requirePlayer(players, buyerId), buyerAfterLaterMutation);
  assert.deepEqual(requirePlayer(players, sellerId), sellerAfterLaterMutation);
  assert.deepEqual(requirePlayer(players, alternateSellerId), alternateSellerBeforeReplay);
  assert.equal((service as unknown as { openOrders: Array<{ id?: string }> }).openOrders.length, 1);
  assert.deepEqual(assetLockCalls.at(-1), [alternateSellerId, buyerId].sort());
  assert.equal(replayResult.alreadyCommitted, true);
  assert.match(String(replayResult.notices[0]?.text ?? ''), /已经处理/);

  proveRestoreRebuildsSpecialLotIndexes(service, orderItem);

  console.log(JSON.stringify({
    ok: true,
    case: 'market-runtime-durable-mutation',
    answers: '普通坊市成交在单一 durable mutation 中提交订单、成交和双方资产；当前 COMMIT 回包丢失保留本次成功语义，历史 operationId 重放则在当前参与者锁内撤销本次乐观计划，不回灌旧 operation 快照。',
  }, null, 2));
}

function proveRestoreRebuildsSpecialLotIndexes(service: MarketRuntimeService, item: TestItem): void {
  const internals = service as unknown as {
    openOrders: Array<Record<string, unknown>>;
    auctionClientKeyToLotKey: Map<string, string>;
    transmissionClientKeyToLotKey: Map<string, string>;
    createMutationContext(): unknown;
    restoreMutationContext(context: unknown): void;
    buildAuctionLotKey(order: unknown): string;
    buildClientAuctionLotKey(key: string): string;
    resolveAuctionLotKey(key: string): string;
    buildTransmissionLotKey(order: unknown): string;
    buildClientTransmissionLotKey(key: string): string;
    resolveTransmissionLotKey(key: string): string;
  };
  const auctionOrder = {
    id: 'order:auction:restore',
    ownerId: 'player:auction',
    side: 'sell',
    status: 'open',
    item: { ...item },
    remainingQuantity: 1,
    unitPrice: 5,
    createdAt: 1,
    updatedAt: 1,
    auction: { mode: 'auction', endsAt: Date.now() + 60_000 },
  };
  const transmissionOrder = {
    id: 'order:transmission:restore',
    ownerId: 'player:transmission',
    side: 'sell',
    status: 'open',
    item: { ...item },
    remainingQuantity: 1,
    unitPrice: 7,
    createdAt: 1,
    updatedAt: 1,
    listingMode: 'transmission',
  };
  internals.openOrders = [auctionOrder, transmissionOrder];
  const context = internals.createMutationContext();
  const auctionLotKey = internals.buildAuctionLotKey(auctionOrder);
  const auctionClientKey = internals.buildClientAuctionLotKey(auctionLotKey);
  const transmissionLotKey = internals.buildTransmissionLotKey(transmissionOrder);
  const transmissionClientKey = internals.buildClientTransmissionLotKey(transmissionLotKey);

  internals.openOrders = [];
  internals.auctionClientKeyToLotKey.set(auctionClientKey, 'auction:stale');
  internals.transmissionClientKeyToLotKey.set(transmissionClientKey, 'transmission:stale');
  internals.restoreMutationContext(context);

  assert.equal(internals.resolveAuctionLotKey(auctionClientKey), auctionLotKey);
  assert.equal(internals.resolveTransmissionLotKey(transmissionClientKey), transmissionLotKey);
}

function buildPlayer(
  playerId: string,
  runtimeOwnerId: string,
  sessionEpoch: number,
  items: TestItem[],
): TestPlayer {
  const player: TestPlayer = {
    playerId,
    runtimeOwnerId,
    sessionEpoch,
    instanceId: 'instance:market:durable',
    inventory: { items: items.map((item) => ({ ...item })) },
    wallet: { balances: [] },
  };
  syncWallet(player);
  return player;
}

function requirePlayer(players: Map<string, TestPlayer>, playerId: string): TestPlayer {
  const player = players.get(playerId);
  if (!player) throw new Error(`missing player ${playerId}`);
  return player;
}

function countItem(player: { inventory?: { items?: TestItem[] } } | null | undefined, itemId: string): number {
  return (player?.inventory?.items ?? [])
    .filter((item) => item.itemId === itemId)
    .reduce((total, item) => total + item.count, 0);
}

function receiveItem(items: TestItem[], item: TestItem): void {
  const existing = items.find((entry) => entry.itemId === item.itemId);
  if (existing) {
    existing.count += item.count;
  }
  else {
    items.push({ ...item });
  }
}

function consumeItem(items: TestItem[], itemId: string, amount: number): void {
  let remaining = amount;
  for (let index = 0; index < items.length && remaining > 0; index += 1) {
    const item = items[index];
    if (item?.itemId !== itemId) continue;
    const consumed = Math.min(item.count, remaining);
    item.count -= consumed;
    remaining -= consumed;
    if (item.count <= 0) {
      items.splice(index, 1);
      index -= 1;
    }
  }
  if (remaining > 0) throw new Error(`insufficient ${itemId}`);
}

function syncWallet(player: TestPlayer): void {
  const balance = countItem(player, 'spirit_stone');
  player.wallet.balances = balance > 0
    ? [{ walletType: 'spirit_stone', balance, frozenBalance: 0, version: 1 }]
    : [];
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

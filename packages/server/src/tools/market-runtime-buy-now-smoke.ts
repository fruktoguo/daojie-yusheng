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
          return {
            itemId,
            count,
            name: '铁剑',
            type: 'equipment',
            equipSlot: 'weapon',
            enhanceLevel: 0,
          };
        }
        return {
          itemId,
          count,
          name: itemId === 'rat_tail' ? '鼠尾' : itemId,
        };
      },
      listItemTemplates() {
        return [];
      },
      getItemSortLevel() {
        return 0;
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
        if (walletType !== 'spirit_stone') {
          throw new Error(`unexpected debit args: ${JSON.stringify({ requestedPlayerId, walletType, amount })}`);
        }
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player?.wallet?.balances?.[0]) {
          throw new Error(`unexpected debit player: ${requestedPlayerId}`);
        }
        player.wallet.balances[0].balance -= amount;
        return player;
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
      canReceiveInventoryItem() {
        return true;
      },
      receiveInventoryItem(requestedPlayerId: string, item: Record<string, unknown>) {
        const player = runtimePlayers.get(requestedPlayerId);
        if (!player) {
          throw new Error(`unexpected receive args: ${JSON.stringify({ requestedPlayerId, item })}`);
        }
        const normalizedCount = Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1;
        const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
          existing.count = Number(existing.count ?? 0) + normalizedCount;
        } else {
          player.inventory.items.push({ ...item, count: normalizedCount });
        }
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
      // 该 smoke 专门保护非原子 fallback 路径的正确性（durable 路径由 durable-operation-smoke 单独覆盖）。
      // 启用 durable 后 buyNow 默认会走原子事务，如果这里 isEnabled 返回 true 会绕开 fallback assert。
      isEnabled() {
        return false;
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
  assert.equal(durableCalls.length, 0);
  assert.equal(buyerPlayer.wallet.balances[0].balance, 6);
  assert.equal(buyerPlayer.inventory.items[0]?.count ?? 0, 2);
  assert.equal(sellerPlayer.inventory.items[0].count, 4);
  assert.equal(sellerPlayer.inventory.items.find((entry) => entry.itemId === 'spirit_stone')?.count ?? 0, 6);
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.length, 0);
  assert.equal(result.notices.some((entry) => entry.playerId === buyerId), true);
  const buyerMarketHistory = await service.buildTradeHistoryPage(buyerId, 1, 'market');
  const buyerAuctionHistory = await service.buildTradeHistoryPage(buyerId, 1, 'auction');
  assert.equal(buyerMarketHistory.records.length, 1);
  assert.equal(buyerMarketHistory.records[0]?.source, 'market');
  assert.equal(buyerAuctionHistory.records.length, 0);

  buyerPlayer.wallet.balances[0].balance = 30;
  buyerPlayer.inventory.items = [];
  sellerPlayer.inventory.items = [{ itemId: 'rat_tail', count: 4, name: '鼠尾' }];
  (service as unknown as { tradeHistory: Array<Record<string, unknown>> }).tradeHistory = [];
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [
    {
      version: 1,
      id: 'order:auction:1',
      ownerId: sellerId,
      side: 'sell',
      status: 'open',
      itemKey,
      item: orderItem,
      remainingQuantity: 1,
      unitPrice: 4,
      createdAt: 2,
      updatedAt: 2,
      auction: {
        version: 1,
        mode: 'auction',
        buyoutPrice: 6,
        startAtMs: Date.now(),
        normalDurationSeconds: 3600,
        endAtMs: Date.now() + 3600_000,
        maxEndAtMs: Date.now() + 7200_000,
        bids: [],
      },
    },
  ];
  (service as unknown as { hydrateAuctionStateFromOpenOrders(): void }).hydrateAuctionStateFromOpenOrders();

  const marketListing = service.buildMarketListingsPage({ page: 1, pageSize: 20, category: 'all' });
  assert.equal(marketListing.items.some((entry: Record<string, unknown>) => entry.itemId === 'rat_tail' && Number(entry.sellQuantity ?? 0) > 0), false);
  assert.equal(service.buildMarketOrders(sellerId).orders.length, 0);
  assert.equal(service.buildMarketUpdate(sellerId).myOrders.length, 0);

  const auctionBuyNow = await service.buyNow(buyerId, { itemKey, quantity: 1 });
  assert.equal(auctionBuyNow.notices.some((entry) => String(entry.text ?? '').includes('当前没有可买入的挂售')), true);
  assert.equal(buyerPlayer.wallet.balances[0].balance, 30);
  assert.equal(buyerPlayer.inventory.items.length, 0);
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders[0]?.remainingQuantity, 1);

  await service.createBuyOrder(buyerId, { itemKey, quantity: 1, unitPrice: 6 });
  assert.equal(buyerPlayer.inventory.items.length, 0);
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.some((order) => order.id === 'order:auction:1' && order.remainingQuantity === 1), true);
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.some((order) => order.side === 'buy' && order.ownerId === buyerId), true);

  sellerPlayer.wallet.balances[0].balance = 30;
  await service.createBuyOrder(sellerId, { itemKey, quantity: 1, unitPrice: 6 });
  assert.equal((service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.some((order) => order.side === 'buy' && order.ownerId === sellerId), true);

  buyerPlayer.wallet.balances[0].balance = 100;
  const enhancedBuyOrderResult = await service.createBuyOrder(buyerId, { itemKey: 'iron_sword#5', quantity: 1, unitPrice: 8 });
  assert.equal(enhancedBuyOrderResult.notices.some((entry) => String(entry.text ?? '').includes('求购的物品不存在')), false);
  const enhancedBuyOrder = (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.find((order) =>
    order.side === 'buy'
    && order.ownerId === buyerId
    && (order.item as Record<string, unknown> | undefined)?.itemId === 'iron_sword'
    && Number((order.item as Record<string, unknown> | undefined)?.enhanceLevel ?? 0) === 5
  );
  assert.ok(enhancedBuyOrder);
  const duplicateEnhancedBuyOrderResult = await service.createBuyOrder(buyerId, { itemKey: 'iron_sword#5', quantity: 1, unitPrice: 8 });
  assert.equal(duplicateEnhancedBuyOrderResult.notices.some((entry) => String(entry.text ?? '').includes('不能重复求购')), true);
  const enhancedBuyOrders = (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders.filter((order) =>
    order.side === 'buy'
    && order.ownerId === buyerId
    && (order.item as Record<string, unknown> | undefined)?.itemId === 'iron_sword'
    && Number((order.item as Record<string, unknown> | undefined)?.enhanceLevel ?? 0) === 5
  );
  assert.equal(enhancedBuyOrders.length, 1);

  console.log(JSON.stringify({ ok: true, case: 'market-runtime-buy-now' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

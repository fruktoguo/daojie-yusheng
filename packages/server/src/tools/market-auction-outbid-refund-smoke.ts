import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

type SmokeItem = {
  itemId: string;
  count: number;
  name?: string;
  type?: string;
  itemInstanceId?: string;
};

type SmokeWalletBalance = {
  walletType: string;
  balance: number;
  frozenBalance: number;
  version: number;
};

type SmokePlayer = {
  playerId: string;
  name: string;
  sessionId: string | null;
  runtimeOwnerId: string;
  sessionEpoch: number;
  instanceId: string;
  inventory: { capacity: number; items: SmokeItem[] };
  wallet: { balances: SmokeWalletBalance[] };
};

async function main(): Promise<void> {
  const sellerId = 'player:auction-outbid:seller';
  const previousBidderId = 'player:auction-outbid:previous';
  const nextBidderId = 'player:auction-outbid:next';
  const offlineHangingBidderId = 'player:auction-outbid:offline-hanging';
  const players = new Map<string, SmokePlayer>([
    [sellerId, buildPlayer(sellerId, '寄拍者', [])],
    [previousBidderId, buildPlayer(previousBidderId, '前竞拍者', [
      { itemId: 'rat_tail', count: 1, name: '鼠尾', itemInstanceId: 'previous:rat-tail' },
    ], 1)],
    [nextBidderId, buildPlayer(nextBidderId, '新竞拍者', [
      { itemId: 'spirit_stone', count: 100, name: '灵石', itemInstanceId: 'next:spirit-stone' },
    ])],
    [offlineHangingBidderId, {
      ...buildPlayer(offlineHangingBidderId, '离线挂机竞拍者', [
        { itemId: 'rat_tail', count: 1, name: '鼠尾', itemInstanceId: 'offline:rat-tail' },
      ], 1),
      sessionId: null,
    }],
  ]);
  let previousCapacityChecks = 0;

  const service = new MarketRuntimeService(
    {
      normalizeItem(item: SmokeItem) {
        return { ...item, count: Math.max(1, Math.trunc(Number(item.count) || 1)) };
      },
      createItem(itemId: string, count = 1) {
        return { itemId, count, name: itemId === 'spirit_stone' ? '灵石' : itemId };
      },
      getItemName(itemId: string) {
        if (itemId === 'spirit_stone') {
          return '灵石';
        }
        if (itemId === 'iron_sword') {
          return '铁剑';
        }
        return itemId;
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
        return players.get(playerId) ?? null;
      },
      snapshot(playerId: string) {
        const player = players.get(playerId);
        return player ? structuredClone(player) : null;
      },
      describePersistencePresence(playerId: string) {
        const player = players.get(playerId);
        return player ? {
          online: Boolean(player.sessionId),
          inWorld: true,
          runtimeOwnerId: player.runtimeOwnerId,
          sessionEpoch: player.sessionEpoch,
        } : null;
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
      canReceiveInventoryItem(playerId: string) {
        if (playerId === previousBidderId) {
          previousCapacityChecks += 1;
          return false;
        }
        return true;
      },
      receiveInventoryItem(playerId: string, item: SmokeItem) {
        const player = requirePlayer(players, playerId);
        const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
          existing.count += item.count;
        } else {
          player.inventory.items.push({ ...item });
        }
        syncWallet(player);
        return player;
      },
      replaceInventoryItems(playerId: string, items: SmokeItem[]) {
        const player = requirePlayer(players, playerId);
        player.inventory.items = items.map((item) => ({ ...item }));
        syncWallet(player);
        return player;
      },
      replaceWalletBalances(playerId: string, balances: SmokeWalletBalance[]) {
        const player = requirePlayer(players, playerId);
        player.wallet.balances = balances.map((entry) => ({ ...entry }));
        return player;
      },
      async runExclusiveAssetMutation<T>(_playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
        return action();
      },
    } as never,
    {
      async loadStorageForPlayer() {
        return { items: [] };
      },
      async persistMutation() {
        return undefined;
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

  const orderItem = (service as unknown as {
    toFullItem(item: SmokeItem): SmokeItem;
  }).toFullItem({
    itemId: 'iron_sword',
    count: 1,
    name: '铁剑',
    type: 'equipment',
    itemInstanceId: 'auction:iron-sword',
  });
  const now = Date.now();
  const order = {
    version: 1,
    id: 'order:auction:outbid-refund',
    ownerId: sellerId,
    side: 'sell',
    status: 'open',
    itemKey: 'unused-for-auction',
    item: orderItem,
    remainingQuantity: 1,
    unitPrice: 10,
    createdAt: now,
    updatedAt: now,
    auction: {
      version: 1,
      mode: 'auction',
      buyoutPrice: 30,
      startAtMs: now,
      normalDurationSeconds: 3600,
      endAtMs: now + 3_600_000,
      maxEndAtMs: now + 7_200_000,
      bids: [{
        bidderId: previousBidderId,
        bidderLabel: '前竞拍者',
        unitPrice: 10,
        createdAt: now,
        reservedCost: 10,
      }],
    },
  };
  (service as unknown as { openOrders: Array<Record<string, unknown>> }).openOrders = [order];
  (service as unknown as { hydrateAuctionStateFromOpenOrders(): void }).hydrateAuctionStateFromOpenOrders();
  const lotKey = (service as unknown as { buildAuctionLotKey(value: unknown): string }).buildAuctionLotKey(order);
  const nextBid = (service as unknown as { getAuctionMinimumBidPrice(value: number): number }).getAuctionMinimumBidPrice(10);

  const result = await service.placeAuctionBid(nextBidderId, {
    itemKey: lotKey,
    unitPrice: nextBid,
    operationId: 'operation:auction-outbid-refund',
  });

  const previousPlayer = requirePlayer(players, previousBidderId);
  assert.equal(previousCapacityChecks, 0, '冻结资产返还不应再走普通背包容量判断');
  assert.equal(previousPlayer.inventory.items.length, 2, '满背包时冻结灵石仍应直接回包');
  assert.equal(previousPlayer.inventory.items.find((item) => item.itemId === 'spirit_stone')?.count, 10);
  assert.equal(service.getStorage(previousBidderId).items.length, 0, '被超价退款不应进入坊市托管仓');

  const notice = result.notices.find((entry) => entry.playerId === previousBidderId);
  assert.equal(notice?.kind, 'system');
  assert.equal(notice?.structured?.key, 'notice.market.auction.outbid-refunded-inventory');
  assert.equal(notice?.structured?.vars?.itemName, '铁剑');
  assert.equal(notice?.structured?.vars?.currencyName, 'spirit_stone');
  assert.equal(notice?.structured?.vars?.refundAmount, 10);
  assert.equal(result.affectedPlayerIds.includes(previousBidderId), true);

  const offlineContext = service.createMutationContext();
  const offlineDestination = service.refundOutbidAuctionReserveToPlayer(
    offlineHangingBidderId,
    7,
    offlineContext,
  );
  const offlinePlayer = requirePlayer(players, offlineHangingBidderId);
  assert.equal(offlineDestination, 'inventory');
  assert.equal(offlinePlayer.inventory.items.find((item) => item.itemId === 'spirit_stone')?.count, 7);
  assert.equal(service.getStorage(offlineHangingBidderId).items.length, 0);

  console.log(JSON.stringify({ ok: true, case: 'market-auction-outbid-refund' }, null, 2));
}

function buildPlayer(
  playerId: string,
  name: string,
  items: SmokeItem[],
  capacity = 20,
): SmokePlayer {
  const player: SmokePlayer = {
    playerId,
    name,
    sessionId: `socket:${playerId}`,
    runtimeOwnerId: `runtime:${playerId}`,
    sessionEpoch: 1,
    instanceId: 'instance:auction-outbid-refund',
    inventory: { capacity, items: items.map((item) => ({ ...item })) },
    wallet: { balances: [] },
  };
  syncWallet(player);
  return player;
}

function requirePlayer(players: Map<string, SmokePlayer>, playerId: string): SmokePlayer {
  const player = players.get(playerId);
  if (!player) {
    throw new Error(`缺少 smoke 玩家：${playerId}`);
  }
  return player;
}

function countItem(player: SmokePlayer | undefined, itemId: string): number {
  return player?.inventory.items.reduce(
    (total, item) => total + (item.itemId === itemId ? item.count : 0),
    0,
  ) ?? 0;
}

function consumeItem(items: SmokeItem[], itemId: string, amount: number): void {
  let remaining = amount;
  for (let index = items.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const item = items[index];
    if (!item || item.itemId !== itemId) {
      continue;
    }
    const consumed = Math.min(item.count, remaining);
    item.count -= consumed;
    remaining -= consumed;
    if (item.count <= 0) {
      items.splice(index, 1);
    }
  }
  if (remaining > 0) {
    throw new Error(`smoke 扣除失败：${itemId} 缺少 ${remaining}`);
  }
}

function syncWallet(player: SmokePlayer): void {
  const balance = countItem(player, 'spirit_stone');
  player.wallet.balances = [{
    walletType: 'spirit_stone',
    balance,
    frozenBalance: 0,
    version: 1,
  }];
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

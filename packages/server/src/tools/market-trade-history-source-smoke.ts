import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

async function main(): Promise<void> {
  const buyerId = 'player:market-history-buyer';
  const sellerId = 'player:market-history-seller';
  const service = new MarketRuntimeService(
    {
      getItemName(itemId: string) {
        return itemId === 'rat_tail' ? '鼠尾' : itemId;
      },
      normalizeItem(item: Record<string, unknown>) {
        return { ...item, count: Math.max(1, Math.trunc(Number(item.count ?? 1))) };
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  (service as unknown as { tradeHistory: Array<Record<string, unknown>> }).tradeHistory = [
    {
      version: 1,
      id: 'trade:auction',
      source: 'auction',
      buyerId,
      sellerId,
      itemId: 'rat_tail',
      quantity: 1,
      unitPrice: 9,
      createdAt: 3,
    },
    {
      version: 1,
      id: 'trade:market',
      source: 'market',
      buyerId,
      sellerId,
      itemId: 'rat_tail',
      quantity: 2,
      unitPrice: 3,
      createdAt: 2,
    },
    {
      version: 1,
      id: 'trade:legacy',
      buyerId,
      sellerId,
      itemId: 'rat_tail',
      quantity: 1,
      unitPrice: 1,
      createdAt: 1,
    },
  ];

  const marketHistory = await service.buildTradeHistoryPage(buyerId, 1, 'market');
  const auctionHistory = await service.buildTradeHistoryPage(buyerId, 1, 'auction');

  assert.equal(marketHistory.source, 'market');
  assert.deepEqual(marketHistory.records.map((entry) => entry.id), ['trade:market', 'trade:legacy']);
  assert.deepEqual(marketHistory.records.map((entry) => entry.source), ['market', 'market']);
  assert.equal(auctionHistory.source, 'auction');
  assert.deepEqual(auctionHistory.records.map((entry) => entry.id), ['trade:auction']);
  assert.deepEqual(auctionHistory.records.map((entry) => entry.source), ['auction']);

  console.log(JSON.stringify({ ok: true, case: 'market-trade-history-source' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
    {
      getPlayer() {
        return null;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const auctionRecords = Array.from({ length: 25 }, (_, offset) => {
    const sequence = 25 - offset;
    return {
      version: 1,
      id: `trade:auction:${sequence}`,
      source: 'auction',
      buyerId,
      sellerId,
      itemId: 'rat_tail',
      itemName: '鼠尾',
      buyerName: '买家甲',
      sellerName: '卖家乙',
      quantity: sequence,
      unitPrice: 9,
      createdAt: 100 + sequence,
    };
  });

  (service as unknown as { tradeHistory: Array<Record<string, unknown>> }).tradeHistory = [
    ...auctionRecords,
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
  const auctionMinePage1 = await service.buildTradeHistoryPage(buyerId, 1, 'auction');
  const auctionMinePage2 = await service.buildTradeHistoryPage(buyerId, 2, 'auction', 'mine');
  const auctionAllHistory = await service.buildTradeHistoryPage('player:observer', 99, 'auction', 'all');

  assert.equal(marketHistory.source, 'market');
  assert.equal(marketHistory.scope, 'mine');
  assert.deepEqual(marketHistory.records.map((entry) => entry.id), ['trade:market', 'trade:legacy']);
  assert.deepEqual(marketHistory.records.map((entry) => entry.source), ['market', 'market']);
  assert.equal(auctionMinePage1.source, 'auction');
  assert.equal(auctionMinePage1.scope, 'mine');
  assert.equal(auctionMinePage1.pageSize, 20);
  assert.equal(auctionMinePage1.totalVisible, 25);
  assert.equal(auctionMinePage1.records.length, 20);
  assert.equal(auctionMinePage1.records[0]?.id, 'trade:auction:25');
  assert.deepEqual(auctionMinePage1.records.map((entry) => entry.source), Array.from({ length: 20 }, () => 'auction'));
  assert.equal(auctionMinePage2.records.length, 5);
  assert.equal(auctionMinePage2.records[0]?.id, 'trade:auction:5');
  assert.equal(auctionAllHistory.source, 'auction');
  assert.equal(auctionAllHistory.scope, 'all');
  assert.equal(auctionAllHistory.page, 1);
  assert.equal(auctionAllHistory.pageSize, 20);
  assert.equal(auctionAllHistory.totalVisible, 20);
  assert.equal(auctionAllHistory.records.length, 20);
  assert.equal(auctionAllHistory.records[0]?.buyerLabel, '买家甲');
  assert.equal(auctionAllHistory.records[0]?.sellerLabel, '卖家乙');

  console.log(JSON.stringify({ ok: true, case: 'market-trade-history-source' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

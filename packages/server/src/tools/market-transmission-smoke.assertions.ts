/**
 * 传法台冒烟的断言主体，与依赖装配分离以控制单文件长度。
 */
import assert from 'node:assert/strict';

import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';

type LooseRecord = Record<string, unknown>;

type MarketInternals = {
  openOrders: LooseRecord[];
  toFullItem(item: LooseRecord): LooseRecord;
  buildTransmissionListingsPage(playerId: string, payload: LooseRecord): { items: LooseRecord[]; counts: { participate: number; mine: number } };
  buyTransmissionLot(playerId: string, payload: LooseRecord): Promise<{ notices: LooseRecord[] }>;
};

type MarketFacade = {
  createSellOrder(playerId: string, payload: LooseRecord): Promise<{ notices: LooseRecord[] }>;
  createBuyOrder(playerId: string, payload: LooseRecord): Promise<{ notices: LooseRecord[] }>;
  buildMarketListingsPage(payload: LooseRecord): { items: LooseRecord[] };
  buildMarketOrders(playerId: string): { orders: LooseRecord[] };
  buildTradeHistoryPage(playerId: string, page: number, source: string): Promise<{ records: LooseRecord[] }>;
};

type Ctx = {
  sellerId: string;
  buyerId: string;
  sellerPlayer: { inventory: { items: LooseRecord[] }; wallet: { balances: Array<{ balance: number }> } };
  buyerPlayer: { inventory: { items: LooseRecord[] }; wallet: { balances: Array<{ balance: number }> } };
};

function noticeText(result: { notices: LooseRecord[] }): string {
  return result.notices.map((entry) => String(entry.text ?? '')).join(' | ');
}

export async function runTransmissionAssertions(
  service: MarketFacade,
  internals: MarketInternals,
  ctx: Ctx,
): Promise<void> {
  const { sellerId, buyerId, sellerPlayer, buyerPlayer } = ctx;

  // 回归：toFullItem 必须保留功法身份，否则残卷一进市场就变空书。
  const projected = internals.toFullItem({ itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID, count: 1, learnTechniqueId: 'gen_aaa', learnTechniqueMaxLevel: 3 });
  assert.equal(projected.learnTechniqueId, 'gen_aaa', 'toFullItem 丢失了 learnTechniqueId');
  assert.equal(projected.learnTechniqueMaxLevel, 3, 'toFullItem 丢失了 learnTechniqueMaxLevel');

  // 1. 残卷不能挂进普通坊市 order-book。
  const marketSell = await service.createSellOrder(sellerId, { itemRef: { itemInstanceId: 'seller-scroll-a' }, quantity: 1, unitPrice: 10, listingMode: 'market' });
  assert.ok(noticeText(marketSell).includes('不能在普通坊市交易'), `残卷竟然挂上了普通坊市：${noticeText(marketSell)}`);
  assert.equal(internals.openOrders.length, 0);

  // 2. 残卷不能被求购：求购单的物品由模板重建，成交必交付空书。
  const buyOrder = await service.createBuyOrder(buyerId, { itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID, quantity: 1, unitPrice: 10 });
  assert.ok(noticeText(buyOrder).includes('不能在普通坊市交易'), `残卷竟然可以求购：${noticeText(buyOrder)}`);
  assert.equal(internals.openOrders.length, 0);

  // 3. 普通坊市目录不再把残卷模板铺成条目（这是「模板被挂上市场」的表象）。
  const listing = service.buildMarketListingsPage({ page: 1, pageSize: 20, category: 'all' });
  assert.equal(listing.items.some((entry) => entry.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID), false, '残卷模板仍出现在普通坊市目录');

  // 4. 传法台只收残卷，且拒绝已丢失功法身份的空书。
  const wrongItem = await service.createSellOrder(sellerId, { itemRef: { itemInstanceId: 'seller-rat-tail' }, quantity: 1, unitPrice: 5, listingMode: 'transmission' });
  assert.ok(noticeText(wrongItem).includes('只流通自创功法残卷'), noticeText(wrongItem));
  const emptyBook = await service.createSellOrder(sellerId, { itemRef: { itemInstanceId: 'seller-empty-book' }, quantity: 1, unitPrice: 5, listingMode: 'transmission' });
  assert.ok(noticeText(emptyBook).includes('残缺不全'), noticeText(emptyBook));
  assert.equal(internals.openOrders.length, 0);

  // 5. 两卷不同功法的残卷各自寄售，必须是两条独立的单。
  const consignA = await service.createSellOrder(sellerId, { itemRef: { itemInstanceId: 'seller-scroll-a' }, quantity: 1, unitPrice: 12, listingMode: 'transmission' });
  assert.ok(noticeText(consignA).includes('传法台寄售'), noticeText(consignA));
  await service.createSellOrder(sellerId, { itemRef: { itemInstanceId: 'seller-scroll-b' }, quantity: 1, unitPrice: 20, listingMode: 'transmission' });
  assert.equal(internals.openOrders.length, 2, '同 itemId 的两卷残卷被合并成了一条挂单');
  assert.equal(internals.openOrders.every((order) => order.listingMode === 'transmission'), true);

  // 6. 传法台单不得泄漏进普通坊市的目录、盘口与「我的挂单」。
  const listingAfter = service.buildMarketListingsPage({ page: 1, pageSize: 20, category: 'all' });
  assert.equal(listingAfter.items.some((entry) => Number(entry.sellQuantity ?? 0) > 0), false, '传法台单泄漏进了普通坊市目录');
  assert.equal(service.buildMarketOrders(sellerId).orders.length, 0, '传法台单泄漏进了普通坊市「我的挂单」');

  // 7. 传法台列表：一卷一单，买家视角两卷都可见，卖家视角 mine=2。
  const page = internals.buildTransmissionListingsPage(buyerId, { tab: 'participate', page: 1, pageSize: 10, query: '' });
  assert.equal(page.items.length, 2);
  assert.equal(page.counts.participate, 2);
  const minePage = internals.buildTransmissionListingsPage(sellerId, { tab: 'mine', page: 1, pageSize: 10, query: '' });
  assert.equal(minePage.items.length, 2);
  // 预览物品必须带功法身份，客户端悬浮详情才能展示这卷记载的是哪门功法。
  assert.equal(page.items.every((entry) => Boolean((entry.item as LooseRecord | undefined)?.learnTechniqueId)), true, '传法台预览物品缺少 learnTechniqueId');

  // 8. 不能求取自己的寄售。
  const lotA = page.items.find((entry) => Number(entry.price) === 12);
  assert.ok(lotA, '未找到售价 12 的传法台拍品');
  const selfBuy = await internals.buyTransmissionLot(sellerId, { itemKey: lotA.itemKey });
  assert.ok(noticeText(selfBuy).includes('不能求取自己'), noticeText(selfBuy));

  // 9. 核心：一口价买入后，买家拿到的残卷仍带 learnTechniqueId（可正常学习）。
  const buyerBalanceBefore = buyerPlayer.wallet.balances[0].balance;
  const bought = await internals.buyTransmissionLot(buyerId, { itemKey: lotA.itemKey });
  assert.ok(noticeText(bought).includes('传法台求得'), noticeText(bought));
  const received = buyerPlayer.inventory.items.find((item) => item.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID);
  assert.ok(received, '买家没有收到功法残卷');
  assert.equal(received.learnTechniqueId, 'gen_aaa', '买家收到的是空书：learnTechniqueId 在成交链路被剥离');
  assert.equal(received.learnTechniqueMaxLevel, 3, '买家收到的残卷丢失了 learnTechniqueMaxLevel');
  // 坊市扣款走钱包，入账走背包灵石物品（与 buy-now 链路一致）。
  assert.equal(buyerPlayer.wallet.balances[0].balance, buyerBalanceBefore - 12);
  const sellerIncome = sellerPlayer.inventory.items.find((item) => item.itemId === 'spirit_stone');
  assert.equal(Number(sellerIncome?.count ?? 0), 12, '卖家未收到传法台成交灵石');

  // 10. 成交后该 lot 下架，另一卷不受影响。
  assert.equal(internals.openOrders.length, 1, '成交后传法台单未下架，或误伤了另一卷');
  assert.equal((internals.openOrders[0].item as LooseRecord).learnTechniqueId, 'gen_bbb');

  // 11. 成交记录归属传法台，不混入普通坊市。
  const transmissionHistory = await service.buildTradeHistoryPage(buyerId, 1, 'transmission');
  assert.equal(transmissionHistory.records.length, 1);
  assert.equal(transmissionHistory.records[0]?.source, 'transmission');
  const marketHistory = await service.buildTradeHistoryPage(buyerId, 1, 'market');
  assert.equal(marketHistory.records.length, 0, '传法台成交被错误记成普通坊市成交');
}

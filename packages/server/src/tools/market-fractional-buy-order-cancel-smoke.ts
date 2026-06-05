import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import { MarketPersistenceService } from '../persistence/market-persistence.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

installSmokeTimeout(__filename);

const playerId = 'player:market-fractional-buy';
const orderId = 'order:market:fractional-buy:1';
const quantity = 3_000_000;
const unitPrice = 0.01;
const expectedRefund = 30_000;

type FakeQueryRow = Record<string, unknown>;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createMarketPersistenceService(): MarketPersistenceService & {
  persistMutation: (input: Record<string, unknown>) => Promise<void>;
} {
  const rawPayload = {
    version: 1,
    id: orderId,
    ownerId: playerId,
    side: 'buy',
    status: 'open',
    itemKey: 'rat_tail',
    item: {
      itemId: 'rat_tail',
      count: 1,
      name: '鼠尾',
    },
    remainingQuantity: quantity,
    createdAt: 1,
    updatedAt: 1,
    // 模拟线上坏 raw_payload：unitPrice 丢失，旧读链会被持久化层静默洗成 1。
  };
  const openOrderRow: FakeQueryRow = {
    order_id: orderId,
    owner_id: playerId,
    side: 'buy',
    status: 'open',
    item_key: 'rat_tail',
    item_id: 'rat_tail',
    remaining_quantity: quantity,
    unit_price: unitPrice,
    created_at_ms: 1,
    updated_at_ms: 1,
    raw_payload: rawPayload,
  };
  const service = new MarketPersistenceService(null) as MarketPersistenceService & {
    enabled: boolean;
    pool: {
      query: (sql: string) => Promise<{ rows: FakeQueryRow[] }>;
    };
    persistMutation: (input: Record<string, unknown>) => Promise<void>;
  };
  service.enabled = true;
  service.pool = {
    async query(sql: string): Promise<{ rows: FakeQueryRow[] }> {
      const normalized = normalizeSql(sql);
      if (normalized.includes('FROM server_market_order')) {
        return { rows: [openOrderRow] };
      }
      if (normalized.includes('FROM server_market_trade_history')) {
        return { rows: [] };
      }
      if (normalized.includes('FROM player_market_storage_item')) {
        return { rows: [] };
      }
      throw new Error(`unexpected fake market persistence query: ${normalized}`);
    },
  };
  return service;
}

function createMarketRuntimeService(
  marketPersistenceService: MarketPersistenceService & {
    persistMutation: (input: Record<string, unknown>) => Promise<void>;
  },
) {
  const persistedMutations: Array<Record<string, unknown>> = [];
  marketPersistenceService.persistMutation = async (input: Record<string, unknown>) => {
    persistedMutations.push(structuredClone(input));
  };
  const service = new MarketRuntimeService(
    {
      normalizeItem(item: Record<string, unknown>) {
        const itemId = typeof item?.itemId === 'string' ? item.itemId : 'unknown_item';
        const count = Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1;
        return {
          ...item,
          itemId,
          count,
          name: typeof item?.name === 'string'
            ? item.name
            : (itemId === 'spirit_stone' ? '灵石' : itemId === 'rat_tail' ? '鼠尾' : itemId),
          type: typeof item?.type === 'string' ? item.type : 'material',
        };
      },
      getItemName(itemId: string) {
        if (itemId === 'spirit_stone') {
          return '灵石';
        }
        if (itemId === 'rat_tail') {
          return '鼠尾';
        }
        return itemId;
      },
      createItem(itemId: string, count = 1) {
        return {
          itemId,
          count,
          name: itemId === 'spirit_stone' ? '灵石' : itemId === 'rat_tail' ? '鼠尾' : itemId,
          type: 'material',
        };
      },
    } as never,
    {
      getPlayer() {
        return null;
      },
      snapshot() {
        return null;
      },
      restoreSnapshot() {
        return undefined;
      },
    } as never,
    marketPersistenceService as never,
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
    null,
    null,
    null,
  );
  return {
    service,
    persistedMutations,
  };
}

async function main(): Promise<void> {
  const marketPersistenceService = createMarketPersistenceService();
  const loadedOrders = await marketPersistenceService.loadOpenOrders();
  assert.equal(loadedOrders.length, 1);
  assert.equal(loadedOrders[0]?.unitPrice, unitPrice, 'open order reload must trust structured unit_price instead of broken raw_payload');

  const { service, persistedMutations } = createMarketRuntimeService(marketPersistenceService);
  await service.reloadFromPersistence();

  assert.equal(service.openOrders.length, 1);
  assert.equal(service.openOrders[0]?.unitPrice, unitPrice, 'runtime reload must keep fractional buy order price');
  assert.equal(service.buildMarketUpdate(playerId).myOrders[0]?.unitPrice, unitPrice, 'player market panel must not show 1 spirit stone after reload');

  const result = await service.cancelOrder(playerId, { orderId });
  assert.equal(service.openOrders.length, 0);
  assert.equal(result.notices.some((entry) => entry.playerId === playerId), true);

  const refundedStorage = service.buildMarketUpdate(playerId).storage;
  assert.equal(
    refundedStorage.items.find((entry) => entry.itemId === 'spirit_stone')?.count ?? 0,
    expectedRefund,
    'fractional buy order cancel must only refund the original reserved spirit stones',
  );

  assert.equal(persistedMutations.length, 1);
  const mutation = persistedMutations[0] as {
    deleteOrderIds?: string[];
    upsertStorages?: Array<{ playerId: string; storage: { items: Array<{ itemId: string; count: number }> } }>;
  };
  assert.deepEqual(mutation.deleteOrderIds, [orderId]);
  assert.equal(
    mutation.upsertStorages?.find((entry) => entry.playerId === playerId)?.storage.items.find((entry) => entry.itemId === 'spirit_stone')?.count ?? 0,
    expectedRefund,
  );

  console.log('market-fractional-buy-order-cancel-smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

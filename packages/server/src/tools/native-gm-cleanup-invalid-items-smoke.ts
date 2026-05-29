/**
 * 本文件是可执行验证工具，覆盖服务端启动、持久化或运行时链路的最小回归场景。
 *
 * 维护时要让验证数据可控、可清理，并避免依赖线上外部服务。
 */
import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { NativeGmPlayerService } from '../http/native/native-gm-player.service';

const contentTemplateRepository = new ContentTemplateRepository();
contentTemplateRepository.onModuleInit();

let marketStorage = {
  items: [
    { item: { itemId: 'fate_stone', count: 1, itemInstanceId: 'market-valid-fate-stone' } },
    { item: { itemId: 'fate_stone.qizhen_crossing', count: 1, itemInstanceId: 'market-invalid-qizhen-fate-stone' } },
    { item: { itemId: 'fate_stone.yunlai_town', count: 1, itemInstanceId: 'market-invalid-yunlai-fate-stone' } },
  ],
};
const marketRuntimeService = {
  async ensureStorageHydrated(playerId: string) {
    assert.equal(playerId, 'player:gm-cleanup-invalid-items-smoke');
  },
  getStorage(playerId: string) {
    assert.equal(playerId, 'player:gm-cleanup-invalid-items-smoke');
    return marketStorage;
  },
  async runExclusiveMarketMutation(playerId: string, callback: (context: Record<string, never>) => unknown) {
    assert.equal(playerId, 'player:gm-cleanup-invalid-items-smoke');
    return callback({});
  },
  setStorage(playerId: string, nextStorage: typeof marketStorage) {
    assert.equal(playerId, 'player:gm-cleanup-invalid-items-smoke');
    marketStorage = nextStorage;
  },
};

const service = new NativeGmPlayerService(
  contentTemplateRepository,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  marketRuntimeService as never,
  {} as never,
  {} as never,
);

const cleanupInvalidItemsFromSnapshot = (
  service as unknown as {
    cleanupInvalidItemsFromSnapshot(snapshot: Record<string, unknown>): {
      inventoryStacksRemoved: number;
      marketStorageStacksRemoved: number;
      equipmentRemoved: number;
    };
  }
).cleanupInvalidItemsFromSnapshot.bind(service);
const cleanupInvalidMarketStorage = (
  service as unknown as {
    cleanupInvalidMarketStorage(playerId: string): Promise<{
      marketStorageStacksRemoved: number;
    }>;
  }
).cleanupInvalidMarketStorage.bind(service);

async function main(): Promise<void> {
  const snapshot = {
    inventory: {
      revision: 3,
      items: [
        { itemId: 'fate_stone', count: 1, itemInstanceId: 'valid-fate-stone' },
        { itemId: 'fate_stone.qizhen_crossing', count: 1, itemInstanceId: 'invalid-qizhen-fate-stone' },
        { itemId: 'fate_stone.yunlai_town', count: 1, itemInstanceId: 'invalid-yunlai-fate-stone' },
        { itemId: 'equip.copper_array_plate', count: 1, itemInstanceId: 'valid-legacy-array-plate' },
      ],
    },
    equipment: {
      revision: 5,
      slots: [
        {
          slot: 'weapon',
          item: { itemId: 'fate_stone.qizhen_crossing', count: 1, itemInstanceId: 'invalid-equipped-fate-stone' },
        },
        {
          slot: 'accessory',
          item: { itemId: 'equip.copper_array_plate', count: 1, itemInstanceId: 'valid-equipped-array-plate' },
        },
      ],
    },
  };

  const summary = cleanupInvalidItemsFromSnapshot(snapshot);

  assert.deepEqual(summary, {
    inventoryStacksRemoved: 2,
    marketStorageStacksRemoved: 0,
    equipmentRemoved: 1,
  });
  assert.deepEqual(
    (snapshot.inventory.items as Array<{ itemId: string }>).map((item) => item.itemId),
    ['fate_stone', 'equip.copper_array_plate'],
  );
  assert.equal(snapshot.inventory.revision, 4);
  assert.equal((snapshot.equipment.slots as Array<{ item: unknown }>)[0]?.item, null);
  assert.equal((snapshot.equipment.slots as Array<{ item: { itemId: string } | null }>)[1]?.item?.itemId, 'equip.copper_array_plate');
  assert.equal(snapshot.equipment.revision, 6);

  const marketSummary = await cleanupInvalidMarketStorage('player:gm-cleanup-invalid-items-smoke');
  assert.deepEqual(marketSummary, { marketStorageStacksRemoved: 2 });
  assert.deepEqual(
    marketStorage.items.map((entry) => entry.item.itemId),
    ['fate_stone'],
  );

  console.log(JSON.stringify({
    ok: true,
    case: 'native-gm-cleanup-invalid-items',
    removed: {
      ...summary,
      marketStorageStacksRemoved: marketSummary.marketStorageStacksRemoved,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

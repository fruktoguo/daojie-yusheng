import assert from 'node:assert/strict';

import { WorldRuntimeItemGroundService } from '../runtime/world/world-runtime-item-ground.service';

interface TestItem {
  itemId: string;
  itemInstanceId: string;
  count: number;
  name: string;
  type: string;
}

interface TestPlayer {
  playerId: string;
  x: number;
  y: number;
  instanceId: string;
  runtimeOwnerId: string;
  sessionEpoch: number;
  inventory: { revision: number; items: TestItem[] };
  persistentRevision: number;
  selfRevision: number;
  dirtyDomains: Set<string>;
  suppressImmediateDomainPersistence: boolean;
}

function createHarness(options: { durableFailure?: boolean; immediateDurableSuccess?: boolean } = {}) {
  const player: TestPlayer = {
    playerId: 'player:ground-drop',
    x: 1,
    y: 1,
    instanceId: 'instance:ground-drop',
    runtimeOwnerId: 'runtime:ground-drop:1',
    sessionEpoch: 8,
    inventory: {
      revision: 3,
      items: [{
        itemId: 'rat_tail',
        itemInstanceId: 'item:rat-tail',
        count: 3,
        name: '鼠尾',
        type: 'material',
      }],
    },
    persistentRevision: 5,
    selfRevision: 7,
    dirtyDomains: new Set(['presence']),
    suppressImmediateDomainPersistence: false,
  };
  const groundItems: TestItem[] = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  const log: string[] = [];
  let persistenceHoldCount = 0;
  let resolveDurable = () => {};

  const playerRuntime = {
    contentTemplateRepository: {
      normalizeItem(item: TestItem) {
        return { ...item };
      },
    },
    getPlayerOrThrow() {
      return player;
    },
    async runExclusiveAssetMutation<T>(_playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
      log.push('asset-lock');
      return action();
    },
    splitInventoryItemByInstanceId(_playerId: string, itemInstanceId: string, count: number) {
      const item = player.inventory.items.find((entry) => entry.itemInstanceId === itemInstanceId);
      if (!item || item.count < count) throw new Error('missing inventory item');
      item.count -= count;
      if (item.count === 0) player.inventory.items = player.inventory.items.filter((entry) => entry !== item);
      player.inventory.revision += 1;
      player.persistentRevision += 1;
      player.selfRevision += 1;
      player.dirtyDomains.add('inventory');
      return { ...item, count };
    },
    replaceInventoryItems(_playerId: string, items: TestItem[]) {
      player.inventory.items = items.map((item) => ({ ...item }));
      player.inventory.revision += 1;
      player.persistentRevision += 1;
      player.selfRevision += 1;
      player.dirtyDomains.add('inventory');
      return player;
    },
  };

  const instance = {
    meta: { ownershipEpoch: 5 },
    toTileIndex(x: number, y: number) {
      assert.deepEqual([x, y], [1, 1]);
      return 4;
    },
    dropGroundItem(x: number, y: number, item: TestItem) {
      assert.deepEqual([x, y], [1, 1]);
      groundItems.push({ ...item });
      return { sourceId: 'g:4' };
    },
    captureGroundTileItemsForAssetMutation(tileIndex: number) {
      assert.equal(tileIndex, 4);
      return groundItems.map((item) => ({ ...item }));
    },
    restoreGroundTileItemsForAssetMutation(tileIndex: number, items: TestItem[]) {
      assert.equal(tileIndex, 4);
      groundItems.splice(0, groundItems.length, ...items.map((item) => ({ ...item })));
    },
    acquirePersistenceDomainHold(domain: string) {
      assert.equal(domain, 'ground_item');
      persistenceHoldCount += 1;
      return () => {
        persistenceHoldCount -= 1;
      };
    },
  };

  const lootService = {
    async runExclusiveLootSourceMutation<T>(instanceId: string, sourceId: string, action: () => Promise<T> | T): Promise<T> {
      assert.equal(instanceId, player.instanceId);
      assert.equal(sourceId, 'g:4');
      log.push('source-lock');
      return action();
    },
    async syncCurrentPresenceFence(playerId: string) {
      assert.equal(playerId, player.playerId);
      log.push('presence-fence');
      return true;
    },
    buildDurableGroundSourceMutation(_instance: unknown, instanceId: string, sourceId: string) {
      assert.equal(instanceId, player.instanceId);
      assert.equal(sourceId, 'g:4');
      return {
        kind: 'ground_tile',
        instanceId,
        ownershipEpoch: 5,
        flushLedgerVersion: 101,
        flushLedgerPayload: {
          kind: 'instance_domain_state',
          domain: 'ground_item',
          payload: {
            fullReplace: false,
            tileIndices: [4],
            entries: [{ tileIndex: 4, items: groundItems.map((item) => ({ ...item })) }],
          },
          revision: 101,
          domainRevisions: { ground_item: 1 },
          stagedDomains: ['ground_item'],
          stagingGenerationId: 'durable-source:ground_item:101',
        },
        tileIndex: 4,
        remainingItems: groundItems.map((item) => ({ ...item })),
      };
    },
  };

  const deps = {
    getPlayerLocationOrThrow() {
      return { instanceId: player.instanceId };
    },
    getInstanceRuntimeOrThrow() {
      return instance;
    },
    worldRuntimeLootContainerService: lootService,
    durableOperationService: {
      isEnabled() {
        return true;
      },
      grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(structuredClone(input));
        if (options.durableFailure) return Promise.reject(new Error('forced durable failure'));
        if (options.immediateDurableSuccess) return Promise.resolve();
        return new Promise<void>((resolve) => {
          resolveDurable = resolve;
        });
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        assert.equal(instanceId, player.instanceId);
        return {
          assigned_node_id: 'node:ground-drop',
          lease_token: 'lease:ground-drop:5',
          ownership_epoch: 5,
        };
      },
    },
    refreshQuestStates() {
      log.push('quest-refresh');
    },
    queuePlayerNotice() {
      log.push('notice');
    },
  };

  return {
    service: new WorldRuntimeItemGroundService(playerRuntime as never),
    player,
    groundItems,
    durableCalls,
    log,
    deps,
    resolveDurable: () => resolveDurable(),
    getPersistenceHoldCount: () => persistenceHoldCount,
  };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function testSuccessfulDropCommitsSourceAndInventoryTogether(): Promise<void> {
  const harness = createHarness();
  const pending = harness.service.dispatchDropItem(
    harness.player.playerId,
    'item:rat-tail',
    2,
    harness.deps as never,
  );
  await nextTurn();

  assert.equal(harness.getPersistenceHoldCount(), 1);
  assert.equal(harness.player.inventory.items[0]?.count, 1);
  assert.equal(harness.groundItems[0]?.count, 2);
  assert.deepEqual(harness.log, ['asset-lock', 'source-lock', 'presence-fence']);
  assert.equal(harness.durableCalls.length, 1);
  assert.equal(harness.durableCalls[0]?.inventoryAction, 'remove');
  assert.equal(harness.durableCalls[0]?.sourceType, 'ground_drop');
  assert.equal(harness.durableCalls[0]?.expectedAssignedNodeId, 'node:ground-drop');
  assert.equal(harness.durableCalls[0]?.expectedLeaseToken, 'lease:ground-drop:5');
  assert.equal(harness.durableCalls[0]?.expectedOwnershipEpoch, 5);
  assert.deepEqual(harness.durableCalls[0]?.sourceMutation, {
    kind: 'ground_tile',
    instanceId: harness.player.instanceId,
    ownershipEpoch: 5,
    flushLedgerVersion: 101,
    flushLedgerPayload: {
      kind: 'instance_domain_state',
      domain: 'ground_item',
      payload: {
        fullReplace: false,
        tileIndices: [4],
        entries: [{ tileIndex: 4, items: harness.groundItems }],
      },
      revision: 101,
      domainRevisions: { ground_item: 1 },
      stagedDomains: ['ground_item'],
      stagingGenerationId: 'durable-source:ground_item:101',
    },
    tileIndex: 4,
    remainingItems: harness.groundItems,
  });

  harness.resolveDurable();
  await pending;
  assert.equal(harness.getPersistenceHoldCount(), 0);
  assert.deepEqual(harness.log, ['asset-lock', 'source-lock', 'presence-fence', 'quest-refresh', 'notice']);
}

async function testFailedDropRestoresExactRuntimeState(): Promise<void> {
  const harness = createHarness({ durableFailure: true });
  const inventoryBefore = structuredClone(harness.player.inventory);
  const persistentRevisionBefore = harness.player.persistentRevision;
  const selfRevisionBefore = harness.player.selfRevision;
  const dirtyDomainsBefore = [...harness.player.dirtyDomains];

  await assert.rejects(
    () => harness.service.dispatchDropItem(
      harness.player.playerId,
      'item:rat-tail',
      2,
      harness.deps as never,
    ),
    /forced durable failure/,
  );

  assert.deepEqual(harness.player.inventory, inventoryBefore);
  assert.equal(harness.player.persistentRevision, persistentRevisionBefore);
  assert.equal(harness.player.selfRevision, selfRevisionBefore);
  assert.deepEqual([...harness.player.dirtyDomains], dirtyDomainsBefore);
  assert.deepEqual(harness.groundItems, []);
  assert.equal(harness.getPersistenceHoldCount(), 0);
  assert.equal(harness.log.includes('quest-refresh'), false);
  assert.equal(harness.log.includes('notice'), false);
}

async function testRepeatedRuntimeRevisionUsesDistinctOperationIds(): Promise<void> {
  const harness = createHarness({ immediateDurableSuccess: true });

  await harness.service.dispatchDropItem(
    harness.player.playerId,
    'item:rat-tail',
    2,
    harness.deps as never,
  );
  harness.player.inventory.revision = 3;
  await harness.service.dispatchDropItem(
    harness.player.playerId,
    'item:rat-tail',
    1,
    harness.deps as never,
  );

  assert.equal(harness.durableCalls.length, 2);
  const firstOperationId = String(harness.durableCalls[0]?.operationId ?? '');
  const secondOperationId = String(harness.durableCalls[1]?.operationId ?? '');
  assert.match(firstOperationId, /^ground-drop:player:ground-drop:instance:ground-drop:[0-9a-f-]{36}$/);
  assert.match(secondOperationId, /^ground-drop:player:ground-drop:instance:ground-drop:[0-9a-f-]{36}$/);
  assert.notEqual(firstOperationId, secondOperationId);
  assert.notEqual(harness.durableCalls[0]?.sourceRefId, harness.durableCalls[1]?.sourceRefId);
}

async function main(): Promise<void> {
  await testSuccessfulDropCommitsSourceAndInventoryTogether();
  await testFailedDropRestoresExactRuntimeState();
  await testRepeatedRuntimeRevisionUsesDistinctOperationIds();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-ground-drop-durable',
    answers: '地面丢弃在玩家锁和来源锁内把背包删除与地面 tile 快照交给同一 durable transaction；每次玩家丢弃意图使用独立 operation ID，同一物品和运行态 revision 重用也不会误判为旧事务重放；失败会精确恢复背包、地面和 revision/dirty。',
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

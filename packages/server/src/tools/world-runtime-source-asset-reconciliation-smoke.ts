import assert from 'node:assert/strict';

import {
  DurableOperationCommitOutcomeUnknownError,
  DurableOperationService,
} from '../persistence/durable-operation.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import {
  isDurableCommitOutcomeUnknownError,
  reconcileDurableInventoryCommitOutcome,
  type DurableInventoryMutationClient,
  type DurableInventoryMutationRequest,
} from '../runtime/world/durable-source-asset-reconciliation.helpers';
import { WorldRuntimeItemGroundService } from '../runtime/world/world-runtime-item-ground.service';
import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';

function createInstance(instanceId: string): MapInstanceRuntime {
  return new MapInstanceRuntime({
    instanceId,
    template: {
      id: instanceId,
      name: '来源资产一致性烟测',
      width: 3,
      height: 3,
      tiles: ['...', '...', '...'],
      baseAuraByTile: new Int32Array(9),
      portals: [],
      npcs: [],
      monsters: [],
      safeZones: [],
      landmarks: [],
      containers: [],
      auras: [],
      spawnPoint: { x: 1, y: 1 },
    },
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '来源资产一致性烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
}

function createRequest(): DurableInventoryMutationRequest {
  return {
    operationId: 'op:source-reconciliation',
    playerId: 'player:source-reconciliation',
    sourceType: 'ground_take',
    sourceRefId: 'g:4:rat_tail#0',
    nextInventoryItems: [{
      itemId: 'rat_tail',
      itemInstanceId: 'item:rat-tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        itemInstanceId: 'item:rat-tail',
        count: 2,
      },
    }],
  };
}

async function testCommittedOutcomeUsesReplayAfterState(): Promise<void> {
  const request = createRequest();
  let replayReadCount = 0;
  const durable: DurableInventoryMutationClient = {
    async grantInventoryItems(): Promise<void> {
      throw new Error('已提交时不应再次执行 mutation');
    },
    async getOperationStatus(): Promise<'committed'> {
      return 'committed';
    },
    async getOperationReplay(): Promise<{ operation: Record<string, unknown> }> {
      replayReadCount += 1;
      return {
        operation: {
          payload_jsonb: {
            sourceType: request.sourceType,
            sourceRefId: request.sourceRefId,
            nextInventoryItems: request.nextInventoryItems,
          },
        },
      };
    },
  };

  const result = await reconcileDurableInventoryCommitOutcome(durable, request);
  assert.equal(result.outcome, 'committed');
  if (result.outcome !== 'committed') {
    throw new Error('unexpected reconciliation outcome');
  }
  assert.equal(replayReadCount, 1);
  assert.deepEqual(result.inventoryItems, [{
    itemId: 'rat_tail',
    itemInstanceId: 'item:rat-tail',
    count: 2,
  }]);
}

async function testUnreachableStatusRemainsUnknown(): Promise<void> {
  let mutationCalls = 0;
  const durable: DurableInventoryMutationClient = {
    async grantInventoryItems(): Promise<void> {
      mutationCalls += 1;
    },
    async getOperationStatus(): Promise<null> {
      throw new Error('database unavailable');
    },
  };
  const result = await reconcileDurableInventoryCommitOutcome(durable, createRequest());
  assert.equal(result.outcome, 'unknown');
  assert.equal(mutationCalls, 0);
}

async function testShutdownDoesNotStartAnotherReconciliationQuery(): Promise<void> {
  let statusCalls = 0;
  let mutationCalls = 0;
  let replayCalls = 0;
  const durable: DurableInventoryMutationClient = {
    isShuttingDown: () => true,
    async grantInventoryItems(): Promise<void> {
      mutationCalls += 1;
    },
    async getOperationStatus(): Promise<null> {
      statusCalls += 1;
      return null;
    },
    async getOperationReplay(): Promise<{ operation: null }> {
      replayCalls += 1;
      return { operation: null };
    },
  };

  const result = await reconcileDurableInventoryCommitOutcome(durable, createRequest());
  assert.equal(result.outcome, 'unknown');
  assert.equal(statusCalls, 0);
  assert.equal(mutationCalls, 0);
  assert.equal(replayCalls, 0);
}

async function testCommitResponseFailureGetsDedicatedError(): Promise<void> {
  const service = new DurableOperationService(null, null);
  const queries: string[] = [];
  let clientDestroyed = false;
  const client = {
    async query(sql: string): Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }> {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      queries.push(normalized);
      if (normalized === 'COMMIT') {
        service.beginShutdown();
        throw new Error('connection lost after commit send');
      }
      if (normalized.includes('FROM durable_operation_log') && normalized.includes('FOR UPDATE')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalized.includes('FROM player_presence') && normalized.includes('FOR UPDATE')) {
        return {
          rowCount: 1,
          rows: [{ runtime_owner_id: 'runtime:source-smoke', session_epoch: 3 }],
        };
      }
      if (normalized.includes('player_id <> $1')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release(destroy?: boolean): void {
      clientDestroyed ||= destroy === true;
    },
  };
  const mutableService = service as unknown as {
    pool: { connect(): Promise<typeof client> };
    enabled: boolean;
  };
  mutableService.pool = { async connect(): Promise<typeof client> { return client; } };
  mutableService.enabled = true;

  let caught: unknown = null;
  try {
    await service.grantInventoryItems({
      operationId: 'op:commit-outcome-smoke',
      playerId: 'player:commit-outcome-smoke',
      expectedRuntimeOwnerId: 'runtime:source-smoke',
      expectedSessionEpoch: 3,
      sourceType: 'smoke_grant',
      sourceRefId: 'source:smoke',
      grantedItems: [{ itemId: 'rat_tail', count: 1, rawPayload: { itemId: 'rat_tail', count: 1 } }],
      nextInventoryItems: [{
        itemId: 'rat_tail',
        itemInstanceId: 'item-commit-outcome-smoke',
        count: 1,
        rawPayload: { itemId: 'rat_tail', itemInstanceId: 'item-commit-outcome-smoke', count: 1 },
      }],
    });
  }
  catch (error) {
    caught = error;
  }
  assert.equal(
    caught instanceof DurableOperationCommitOutcomeUnknownError,
    true,
    `应抛出 COMMIT 结果不确定错误，实际为：${caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)}`,
  );
  assert.equal(isDurableCommitOutcomeUnknownError(caught), true);
  assert.equal(queries.includes('ROLLBACK'), false);
  assert.equal(clientDestroyed, true);
}

function testConcurrentGroundChangesSurvivePreciseRollback(): void {
  const instance = createInstance('public:source-ground-smoke');
  instance.dropGroundItem(1, 1, {
    itemId: 'rat_tail',
    count: 2,
    expiresAtTick: 100,
    groundExpiresAtMs: Date.now() + 100_000,
  });
  const beforeTake = instance.captureGroundTileItemsForAssetMutation(4);
  const source = instance.getGroundPileBySourceId('g:4');
  const itemKey = source?.items[0]?.itemKey;
  assert.equal(typeof itemKey, 'string');
  const taken = instance.takeGroundItem('g:4', itemKey as string, 1, 1);
  assert.equal(taken?.count, 2);

  // 模拟 durable 等待期间的战斗掉落与同签名掉落。
  instance.dropGroundItem(1, 1, { itemId: 'wolf_fang', count: 1 });
  instance.dropGroundItem(1, 1, { itemId: 'rat_tail', count: 3 });
  instance.restoreGroundItemsAfterFailedAssetTake(4, beforeTake);

  const afterRestore = instance.captureGroundTileItemsForAssetMutation(4);
  assert.equal(afterRestore.find((item) => item.itemId === 'rat_tail')?.count, 5);
  assert.equal(afterRestore.find((item) => item.itemId === 'wolf_fang')?.count, 1);

  // 模拟本次丢弃失败；只移除本次新增数量，不能覆盖同 await 窗口的新掉落。
  instance.dropGroundItem(1, 1, { itemId: 'spirit_stone', count: 2 });
  instance.dropGroundItem(1, 1, { itemId: 'ore', count: 1 });
  instance.removeGroundItemsAfterFailedAssetDrop(4, [{ itemId: 'spirit_stone', count: 2 }]);
  const afterDropRollback = instance.captureGroundTileItemsForAssetMutation(4);
  assert.equal(afterDropRollback.some((item) => item.itemId === 'spirit_stone'), false);
  assert.equal(afterDropRollback.find((item) => item.itemId === 'ore')?.count, 1);
  assert.equal(afterDropRollback.find((item) => item.itemId === 'wolf_fang')?.count, 1);
}

async function testDropServiceDoesNotOverwriteConcurrentCombatDrop(): Promise<void> {
  const instance = createInstance('public:source-drop-service-smoke');
  const player = {
    playerId: 'player:source-drop-service-smoke',
    x: 1,
    y: 1,
    instanceId: instance.meta.instanceId,
    runtimeOwnerId: 'runtime-source-drop-service-smoke',
    sessionEpoch: 2,
    inventory: {
      revision: 1,
      items: [{
        itemId: 'rat_tail',
        itemInstanceId: 'item-source-drop-service-smoke',
        count: 1,
        name: '鼠尾',
        type: 'material',
      }],
    },
    persistentRevision: 1,
    selfRevision: 1,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
  };
  let rejectDurable: (error: Error) => void = () => undefined;
  let durableStarted = false;
  const playerRuntime = {
    contentTemplateRepository: { normalizeItem: (item: Record<string, unknown>) => ({ ...item }) },
    getPlayerOrThrow: () => player,
    async runExclusiveAssetMutation<T>(_ids: readonly string[], action: () => Promise<T> | T): Promise<T> {
      return action();
    },
    splitInventoryItemByInstanceId(_playerId: string, itemInstanceId: string, count: number) {
      const item = player.inventory.items.find((entry) => entry.itemInstanceId === itemInstanceId);
      if (!item || item.count < count) {
        throw new Error('missing inventory item');
      }
      item.count -= count;
      if (item.count === 0) {
        player.inventory.items = player.inventory.items.filter((entry) => entry !== item);
      }
      player.inventory.revision += 1;
      player.persistentRevision += 1;
      player.selfRevision += 1;
      player.dirtyDomains.add('inventory');
      return { ...item, count };
    },
    replaceInventoryItems(_playerId: string, items: typeof player.inventory.items) {
      player.inventory.items = items.map((item) => ({ ...item }));
      return player;
    },
  };
  const lootService = {
    async runExclusiveLootSourceMutation<T>(
      _instanceId: string,
      _sourceId: string,
      action: () => Promise<T> | T,
    ): Promise<T> {
      return action();
    },
    async syncCurrentPresenceFence(): Promise<boolean> {
      return true;
    },
    buildDurableGroundSourceMutation(
      targetInstance: MapInstanceRuntime,
      instanceId: string,
      sourceId: string,
    ) {
      const tileIndex = Number(sourceId.slice(2));
      return {
        kind: 'ground_tile',
        instanceId,
        tileIndex,
        remainingItems: targetInstance.captureGroundTileItemsForAssetMutation(tileIndex),
      };
    },
  };
  const deps = {
    getPlayerLocationOrThrow: () => ({ instanceId: instance.meta.instanceId }),
    getInstanceRuntime: () => instance,
    getInstanceRuntimeOrThrow: () => instance,
    worldRuntimeLootContainerService: lootService,
    durableOperationService: {
      isEnabled: () => true,
      grantInventoryItems(): Promise<void> {
        durableStarted = true;
        return new Promise<void>((_resolve, reject) => {
          rejectDurable = reject;
        });
      },
    },
    instanceCatalogService: { isEnabled: () => false },
    refreshQuestStates(): void {},
    queuePlayerNotice(): void {},
  };
  const service = new WorldRuntimeItemGroundService(playerRuntime as never);
  const pendingDrop = service.dispatchDropItem(
    player.playerId,
    'item-source-drop-service-smoke',
    1,
    deps as never,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(durableStarted, true);

  instance.dropGroundItem(1, 1, { itemId: 'wolf_fang', count: 1 });
  rejectDurable(new Error('forced durable failure'));
  await assert.rejects(() => pendingDrop, /forced durable failure/);

  const groundItems = instance.captureGroundTileItemsForAssetMutation(4);
  assert.equal(groundItems.some((item) => item.itemId === 'rat_tail'), false);
  assert.equal(groundItems.find((item) => item.itemId === 'wolf_fang')?.count, 1);
  assert.equal(player.inventory.items.find((item) => item.itemId === 'rat_tail')?.count, 1);
}

function testExpiredGroundItemIsNotResurrected(): void {
  const instance = createInstance('public:source-expiry-smoke');
  instance.dropGroundItem(1, 1, {
    itemId: 'expired_leaf',
    count: 1,
    expiresAtTick: 1,
    groundExpiresAtMs: Date.now() + 1_000,
  });
  const beforeTake = instance.captureGroundTileItemsForAssetMutation(4);
  const source = instance.getGroundPileBySourceId('g:4');
  const itemKey = source?.items[0]?.itemKey;
  assert.equal(typeof itemKey, 'string');
  instance.takeGroundItem('g:4', itemKey as string, 1, 1);
  instance.tick = 1;
  assert.equal(instance.restoreGroundItemsAfterFailedAssetTake(4, beforeTake), false);
  assert.equal(instance.getGroundPileBySourceId('g:4'), null);

  const dropInstance = createInstance('public:source-drop-expiry-smoke');
  dropInstance.dropGroundItem(1, 1, {
    itemId: 'expired_drop',
    count: 2,
    expiresAtTick: 1,
    groundExpiresAtMs: Date.now() + 1_000,
  });
  const expiredDrop = dropInstance.captureGroundTileItemsForAssetMutation(4);
  dropInstance.tick = 1;
  dropInstance.advanceGroundItemExpiry(1);
  dropInstance.dropGroundItem(1, 1, { itemId: 'expired_drop', count: 3 });
  dropInstance.removeGroundItemsAfterFailedAssetDrop(4, expiredDrop);
  assert.equal(
    dropInstance.captureGroundTileItemsForAssetMutation(4)
      .find((item) => item.itemId === 'expired_drop')?.count,
    3,
  );
}

function testConcurrentContainerRefreshSurvivesRollback(): void {
  const service = new WorldRuntimeLootContainerService({} as never, {} as never, null);
  const instanceId = 'public:source-container-smoke';
  const removedEntry = {
    item: { itemId: 'rat_tail', count: 2 },
    createdTick: 1,
    visible: true,
  };
  const stateBefore = {
    sourceId: `container:${instanceId}:chest`,
    containerId: 'chest',
    entries: [{ ...removedEntry, item: { ...removedEntry.item } }],
    generatedAtTick: 1,
    refreshAtTick: 10,
    activeSearch: undefined,
  };
  const currentState = {
    ...stateBefore,
    entries: [] as typeof stateBefore.entries,
  };
  service.markContainerPersistenceDirty(instanceId);
  const sourceRevisionAfterMutation = service.getContainerPersistenceRevision(instanceId);

  // 模拟 tick 刷新：新增内容并推进 revision。
  currentState.entries.push({
    item: { itemId: 'wolf_fang', count: 1 },
    createdTick: 2,
    visible: true,
  });
  service.markContainerPersistenceDirty(instanceId);
  const runtimeInstance = { worldRevision: 0 };
  service.restoreContainerSourceAfterFailedTake(
    instanceId,
    currentState,
    stateBefore,
    [removedEntry],
    sourceRevisionAfterMutation,
    { getInstanceRuntime: () => runtimeInstance },
    { x: 1, y: 1 },
  );

  assert.equal(currentState.entries.find((entry) => entry.item.itemId === 'rat_tail')?.item.count, 2);
  assert.equal(currentState.entries.find((entry) => entry.item.itemId === 'wolf_fang')?.item.count, 1);
  assert.equal(service.getDirtyInstanceIds().has(instanceId), true);
}

async function main(): Promise<void> {
  await testCommittedOutcomeUsesReplayAfterState();
  await testUnreachableStatusRemainsUnknown();
  await testShutdownDoesNotStartAnotherReconciliationQuery();
  await testCommitResponseFailureGetsDedicatedError();
  testConcurrentGroundChangesSurvivePreciseRollback();
  await testDropServiceDoesNotOverwriteConcurrentCombatDrop();
  testExpiredGroundItemIsNotResurrected();
  testConcurrentContainerRefreshSurvivesRollback();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-source-asset-reconciliation',
    answers: 'COMMIT 回包不确定会先按 operation status/replay 收敛背包后态；无法确认时保持 unknown 而不逆回滚。地面与容器普通失败只逆转本次来源变更，等待期间的战斗掉落、同签名掉落、容器刷新与自然过期均被保留。',
  }));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

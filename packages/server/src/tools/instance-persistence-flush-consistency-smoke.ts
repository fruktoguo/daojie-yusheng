import assert from 'node:assert/strict';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';
import { WorldRuntimePersistenceStateService } from '../runtime/world/world-runtime-persistence-state.service';

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function createInstance(): MapInstanceRuntime {
  return new MapInstanceRuntime({
    instanceId: 'public:instance-flush-consistency-smoke',
    template: {
      id: 'instance-flush-consistency-smoke',
      name: '实例刷盘一致性烟测',
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
    displayName: '实例刷盘一致性烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
}

async function testInFlightMutationKeepsDirtyAndDurableWaits(): Promise<void> {
  const instance = createInstance();
  const instanceId = instance.meta.instanceId;
  const firstWriteStarted = createDeferred();
  const firstWriteGate = createDeferred();
  const writes: Array<{ tileIndices: number[]; counts: number[] }> = [];
  let writeCount = 0;
  const lootService = new WorldRuntimeLootContainerService({} as never, {} as never, null);
  const persistence = {
    isEnabled: () => true,
    async replaceGroundItemTiles(
      _instanceId: string,
      tileIndices: number[],
      entries: Array<{ items?: Array<{ count?: number }> }>,
    ): Promise<void> {
      writeCount += 1;
      writes.push({
        tileIndices: [...tileIndices],
        counts: entries.flatMap((entry) => entry.items ?? []).map((item) => Number(item.count ?? 0)),
      });
      if (writeCount === 1) {
        firstWriteStarted.resolve();
        await firstWriteGate.promise;
      }
    },
    async saveInstanceRecoveryWatermark(): Promise<void> {},
  };
  const deps = {
    getInstanceRuntime: (targetInstanceId: string) => targetInstanceId === instanceId ? instance : null,
    isInstanceLeaseWritable: () => true,
    instanceDomainPersistenceService: persistence,
    instanceCatalogService: null,
    worldRuntimeLootContainerService: lootService,
  };
  const service = new WorldRuntimePersistenceStateService();

  instance.dropGroundItem(1, 1, { itemId: 'rat_tail', count: 1 });
  const firstFlush = service.flushInstanceDomains(instanceId, ['ground_item'], deps as never);
  await firstWriteStarted.promise;

  // tick 内同一 dirty key 在 IO 期间再次变化；旧快照完成后不得把它清掉。
  instance.dropGroundItem(1, 1, { itemId: 'rat_tail', count: 1 });
  let durableStarted = false;
  const durableMutation = instance.runExclusivePersistenceDomainMutation(['ground_item'], async () => {
    durableStarted = true;
  });
  await nextTurn();
  assert.equal(durableStarted, false);

  firstWriteGate.resolve();
  await firstFlush;
  await durableMutation;

  assert.equal(durableStarted, true);
  assert.equal(instance.getDirtyDomains().has('ground_item'), true);
  assert.equal(instance.buildGroundPersistenceDelta().entries[0]?.items[0]?.count, 2);
  assert.deepEqual(writes[0], { tileIndices: [4], counts: [1] });

  await service.flushInstanceDomains(instanceId, ['ground_item'], deps as never);
  assert.deepEqual(writes[1], { tileIndices: [4], counts: [2] });
  assert.equal(instance.getDirtyDomains().has('ground_item'), false);
}

async function testQueuedFlushRechecksUnresolvedFenceAfterDomainLock(): Promise<void> {
  const instance = createInstance();
  const instanceId = instance.meta.instanceId;
  const durableStarted = createDeferred();
  const releaseDurable = createDeferred();
  let unresolved = false;
  let writeCount = 0;
  const service = new WorldRuntimePersistenceStateService();
  const deps = {
    getInstanceRuntime: (targetInstanceId: string) => targetInstanceId === instanceId ? instance : null,
    isInstanceLeaseWritable: () => true,
    durableOperationService: {
      isInstanceCommitOutcomeUnresolved(targetInstanceId: string) {
        return targetInstanceId === instanceId && unresolved;
      },
    },
    instanceDomainPersistenceService: {
      isEnabled: () => true,
      async replaceGroundItemTiles(): Promise<void> {
        writeCount += 1;
      },
      async saveInstanceRecoveryWatermark(): Promise<void> {},
    },
    instanceCatalogService: null,
    worldRuntimeLootContainerService: new WorldRuntimeLootContainerService({} as never, {} as never, null),
  };

  instance.dropGroundItem(1, 1, { itemId: 'rat_tail', count: 1 });
  const durableMutation = instance.runExclusivePersistenceDomainMutation(['ground_item'], async () => {
    durableStarted.resolve();
    await releaseDurable.promise;
  });
  await durableStarted.promise;

  const queuedFlush = service.flushInstanceDomains(instanceId, ['ground_item'], deps as never);
  await nextTurn();
  unresolved = true;
  releaseDurable.resolve();
  await durableMutation;

  await assert.rejects(
    queuedFlush,
    /instance_flush_blocked_by_unresolved_durable_commit/,
  );
  assert.equal(writeCount, 0);
  assert.equal(instance.getDirtyDomains().has('ground_item'), true);
}

function testContainerRevisionGuard(): void {
  const lootService = new WorldRuntimeLootContainerService({} as never, {} as never, null);
  const instanceId = 'public:container-revision-smoke';
  lootService.markContainerPersistenceDirty(instanceId);
  const snapshotRevision = lootService.getContainerPersistenceRevision(instanceId);
  lootService.markContainerPersistenceDirty(instanceId);

  assert.equal(lootService.clearPersisted(instanceId, snapshotRevision), false);
  assert.equal(lootService.getDirtyInstanceIds().has(instanceId), true);
  assert.equal(
    lootService.clearPersisted(instanceId, lootService.getContainerPersistenceRevision(instanceId)),
    true,
  );
  assert.equal(lootService.getDirtyInstanceIds().has(instanceId), false);
}

function testBatchSnapshotRevisionGuard(): void {
  const instance = createInstance();
  const instanceId = instance.meta.instanceId;
  const service = new WorldRuntimePersistenceStateService();
  const deps = {
    getInstanceRuntime: (targetInstanceId: string) => targetInstanceId === instanceId ? instance : null,
    isInstanceLeaseWritable: () => true,
    instanceDomainPersistenceService: { isEnabled: () => true },
  };

  instance.setTileResourceValueByIndex('ore', 4, 5);
  const staleDeltas = service.buildDomainDeltaBatch(
    'tile_resource',
    [instanceId],
    deps as never,
  );
  assert.equal(staleDeltas[0]?.upserts[0]?.value, 5);
  instance.setTileResourceValueByIndex('ore', 4, 6);
  service.markDomainBatchPersisted(
    'tile_resource',
    [instanceId],
    staleDeltas,
    deps as never,
  );
  assert.equal(instance.getDirtyDomains().has('tile_resource'), true);

  const currentDeltas = service.buildDomainDeltaBatch(
    'tile_resource',
    [instanceId],
    deps as never,
  );
  assert.equal(currentDeltas[0]?.upserts[0]?.value, 6);
  service.markDomainBatchPersisted(
    'tile_resource',
    [instanceId],
    currentDeltas,
    deps as never,
  );
  assert.equal(instance.getDirtyDomains().has('tile_resource'), false);
}

function testStagedDeltaRemainsCumulativeUntilPersisted(): void {
  const instance = createInstance();
  const generationId = 'instance-persistence-flush-consistency-smoke';

  instance.setTileResourceValueByIndex('ore', 1, 5);
  const firstSnapshot = instance.capturePersistenceDomainFlushSnapshot(['tile_resource']);
  instance.markPersistenceDomainsStaged(['tile_resource'], firstSnapshot, generationId);

  assert.equal(instance.getDirtyDomains().has('tile_resource'), false);
  assert.deepEqual(
    instance.buildTileResourcePersistenceDelta().upserts.map((entry) => [entry.tileIndex, entry.value]),
    [[1, 5]],
    '转入 ledger 后仍须保留尚未真实落库的增量键',
  );

  instance.setTileResourceValueByIndex('ore', 2, 7);
  const secondSnapshot = instance.capturePersistenceDomainFlushSnapshot(['tile_resource']);
  const cumulativeDelta = instance.buildTileResourcePersistenceDelta(secondSnapshot);
  assert.deepEqual(
    cumulativeDelta.upserts.map((entry) => [entry.tileIndex, entry.value]),
    [[1, 5], [2, 7]],
    '覆盖 ledger 的新版 payload 必须包含旧版未落库键和本次新键',
  );

  instance.markPersistenceDomainsStaged(['tile_resource'], secondSnapshot, generationId);
  instance.markPersistenceDomainsPersisted(['tile_resource'], secondSnapshot);
  assert.equal(instance.getDirtyDomains().has('tile_resource'), false);
  assert.deepEqual(instance.buildTileResourcePersistenceDelta().upserts, []);
}

async function main(): Promise<void> {
  await testInFlightMutationKeepsDirtyAndDurableWaits();
  await testQueuedFlushRechecksUnresolvedFenceAfterDomainLock();
  testContainerRevisionGuard();
  testBatchSnapshotRevisionGuard();
  testStagedDeltaRemainsCumulativeUntilPersisted();
  console.log(JSON.stringify({
    ok: true,
    case: 'instance-persistence-flush-consistency',
    answers: '普通实例 flush 与 durable 来源事务共用实例分域串行边界；IO 期间同一 dirty key 再次变化时旧快照不会清除新 dirty；增量域转入 ledger 后保留累计脏键，后续 payload 覆盖不会丢失上一版尚未落库的键；容器域同样使用 revision 守卫。',
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

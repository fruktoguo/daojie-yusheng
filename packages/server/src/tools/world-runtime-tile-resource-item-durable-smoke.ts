import assert from 'node:assert/strict';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function createDeferred(): Deferred {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createInstance(instanceId: string): MapInstanceRuntime {
  const instance = new MapInstanceRuntime({
    instanceId,
    template: {
      id: 'tile-resource-item-durable-smoke',
      name: '地块资源资产烟测',
      width: 5,
      height: 5,
      tiles: ['.....', '.....', '.....', '.....', '.....'],
      baseAuraByTile: new Int32Array(25),
      portals: [],
      npcs: [],
      monsters: [],
      safeZones: [],
      safeZoneMask: new Uint8Array(25),
      landmarks: [],
      containers: [],
      auras: [],
      spawnPoint: { x: 0, y: 0 },
      spawnX: 0,
      spawnY: 0,
    },
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '地块资源资产烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.meta.assignedNodeId = 'node:tile-resource-smoke';
  instance.meta.leaseToken = `lease:${instanceId}`;
  instance.meta.ownershipEpoch = 7;
  instance.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
  instance.meta.runtimeStatus = 'running';
  return instance;
}

function createPlayerRuntime(player: Record<string, any>): Record<string, any> {
  return {
    playerDomainPersistenceService: {
      isEnabled: () => true,
      async loadPlayerPresence() {
        return { runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch };
      },
      async savePlayerPresence() {},
    },
    peekInventoryItemByInstanceId(_playerId: string, itemInstanceId: string) {
      return player.inventory.items.find((entry: Record<string, unknown>) => entry.itemInstanceId === itemInstanceId) ?? null;
    },
    getPlayerOrThrow() {
      return player;
    },
    async runExclusiveAssetMutation(_playerIds: string[], action: () => Promise<unknown>) {
      return action();
    },
    describePersistencePresence() {
      return {
        runtimeOwnerId: player.runtimeOwnerId,
        sessionEpoch: player.sessionEpoch,
        online: true,
        inWorld: true,
        instanceId: player.instanceId,
      };
    },
    getSessionFence() {
      return { runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch };
    },
    replaceInventoryItems(_playerId: string, items: Array<Record<string, unknown>>) {
      player.inventory.items = items.map((entry) => ({ ...entry }));
      player.inventory.revision += 1;
    },
  };
}

function createDeps(
  instance: MapInstanceRuntime,
  durable: Record<string, any>,
  notices: Array<Record<string, any>>,
): Record<string, any> {
  return {
    durableOperationService: durable,
    getPlayerLocationOrThrow() {
      return { instanceId: instance.meta.instanceId };
    },
    getInstanceRuntimeOrThrow() {
      return instance;
    },
    isInstanceLeaseWritable() {
      return true;
    },
    refreshQuestStates() {},
    queuePlayerNotice(playerId: string, text: string, kind: string, _castId: unknown, _combat: unknown, structured: unknown) {
      notices.push({ playerId, text, kind, structured });
    },
  };
}

async function testCommitAppliesBothDomainsAfterConfirmation(): Promise<void> {
  const instance = createInstance('public:tile-resource-item-commit');
  instance.setTileResourceValueByIndex('ore', 6, 3);
  const oldSnapshot = instance.capturePersistenceDomainFlushSnapshot(['tile_resource']);
  instance.markPersistenceDomainsStaged(['tile_resource'], oldSnapshot, 'tile-resource-smoke-generation');

  const player = {
    playerId: 'player:tile-resource-item-commit',
    runtimeOwnerId: 'runtime:tile-resource-item-commit',
    sessionEpoch: 5,
    instanceId: instance.meta.instanceId,
    x: 3,
    y: 3,
    inventory: {
      revision: 4,
      items: [{
        itemId: 'stone.blood_essence',
        itemInstanceId: 'item:blood-essence:commit',
        count: 3,
        name: '血精石',
        allowBatchUse: true,
        tileResourceGains: [{ resourceKey: 'sha.refined.neutral', amount: 10 }],
      }],
    },
  };
  const playerRuntime = createPlayerRuntime(player);
  const commitEntered = createDeferred();
  const releaseCommit = createDeferred();
  let durableInput: Record<string, any> | null = null;
  const durable = {
    isEnabled: () => true,
    async grantInventoryItems(input: Record<string, any>) {
      durableInput = input;
      commitEntered.resolve();
      await releaseCommit.promise;
      return { ok: true, alreadyCommitted: false };
    },
  };
  const notices: Array<Record<string, any>> = [];
  const service = new WorldRuntimeUseItemService({ getLearnTechniqueId: () => null } as never, {} as never, playerRuntime as never);
  const pending = service.dispatchUseItem(
    player.playerId,
    'item:blood-essence:commit',
    createDeps(instance, durable, notices),
    { count: 2 },
  );
  await commitEntered.promise;

  assert.equal(player.inventory.items[0]?.count, 3, 'COMMIT 确认前不得先扣运行态背包');
  assert.equal(instance.getTileResource('sha.refined.neutral', 3, 3), 0, 'COMMIT 确认前不得先增加运行态地块资源');
  assert.equal(instance.isPersistenceDomainHeld('tile_resource'), true);
  assert.equal(durableInput?.expectedLeaseToken, instance.meta.leaseToken);
  assert.equal(durableInput?.expectedOwnershipEpoch, 7);
  assert.equal(durableInput?.sourceMutation?.flushLedgerVersion > 0, true);
  assert.deepEqual(
    durableInput?.sourceMutation?.upserts.map((entry: Record<string, unknown>) => [entry.resourceKey, entry.tileIndex, entry.value]),
    [['ore', 6, 3], ['sha.refined.neutral', 18, 20]],
    '强事务必须一并接管旧 staging 增量与本次资源后态',
  );
  assert.equal(durableInput?.nextInventoryItems[0]?.count, 1);

  releaseCommit.resolve();
  await pending;

  assert.equal(player.inventory.items[0]?.count, 1);
  assert.equal(instance.getTileResource('sha.refined.neutral', 3, 3), 20);
  assert.equal(instance.getDirtyDomains().has('tile_resource'), false);
  assert.equal(instance.buildTileResourcePersistenceDelta().upserts.length, 0);
  assert.equal(instance.isPersistenceDomainHeld('tile_resource'), false);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.structured?.key, 'notice.item.tile-sha-used-batch');
  assert.deepEqual(notices[0]?.structured?.vars, {
    itemName: '血精石',
    count: 2,
    nextValue: 20,
  });
}

async function testFailedCommitLeavesBothDomainsUntouched(): Promise<void> {
  const instance = createInstance('public:tile-resource-item-failed');
  const player = {
    playerId: 'player:tile-resource-item-failed',
    runtimeOwnerId: 'runtime:tile-resource-item-failed',
    sessionEpoch: 3,
    instanceId: instance.meta.instanceId,
    x: 3,
    y: 3,
    inventory: {
      revision: 1,
      items: [{
        itemId: 'stone.blood_essence',
        itemInstanceId: 'item:blood-essence:failed',
        count: 1,
        name: '血精石',
        allowBatchUse: true,
        tileResourceGains: [{ resourceKey: 'sha.refined.neutral', amount: 10 }],
      }],
    },
  };
  const playerRuntime = createPlayerRuntime(player);
  const service = new WorldRuntimeUseItemService({ getLearnTechniqueId: () => null } as never, {} as never, playerRuntime as never);
  await assert.rejects(
    service.dispatchUseItem(
      player.playerId,
      'item:blood-essence:failed',
      createDeps(instance, {
        isEnabled: () => true,
        async grantInventoryItems() {
          throw new Error('simulated_tile_resource_commit_failure');
        },
      }, []),
      { count: 1 },
    ),
    /simulated_tile_resource_commit_failure/,
  );
  assert.equal(player.inventory.items[0]?.count, 1);
  assert.equal(instance.getTileResource('sha.refined.neutral', 3, 3), 0);
  assert.equal(instance.isPersistenceDomainHeld('tile_resource'), false);
}

async function testProductionDatabaseModeRejectsVolatileFallback(): Promise<void> {
  const previousServerDatabaseUrl = process.env.SERVER_DATABASE_URL;
  const previousRuntimeEnv = process.env.SERVER_RUNTIME_ENV;
  process.env.SERVER_DATABASE_URL = 'postgres://configured.invalid/production';
  process.env.SERVER_RUNTIME_ENV = 'production';
  try {
    const instance = createInstance('public:tile-resource-item-fail-closed');
    const player = {
      playerId: 'player:tile-resource-item-fail-closed',
      runtimeOwnerId: 'runtime:tile-resource-item-fail-closed',
      sessionEpoch: 1,
      instanceId: instance.meta.instanceId,
      x: 3,
      y: 3,
      inventory: {
        revision: 1,
        items: [{
          itemId: 'stone.blood_essence',
          itemInstanceId: 'item:blood-essence:fail-closed',
          count: 1,
          name: '血精石',
          allowBatchUse: true,
          tileResourceGains: [{ resourceKey: 'sha.refined.neutral', amount: 10 }],
        }],
      },
    };
    const service = new WorldRuntimeUseItemService(
      { getLearnTechniqueId: () => null } as never,
      {} as never,
      createPlayerRuntime(player) as never,
    );
    await assert.rejects(
      service.dispatchUseItem(
        player.playerId,
        'item:blood-essence:fail-closed',
        createDeps(instance, { isEnabled: () => false }, []),
        { count: 1 },
      ),
      /地块资源资产事务暂不可用/,
    );
    assert.equal(player.inventory.items[0]?.count, 1);
    assert.equal(instance.getTileResource('sha.refined.neutral', 3, 3), 0);
  } finally {
    if (previousServerDatabaseUrl === undefined) delete process.env.SERVER_DATABASE_URL;
    else process.env.SERVER_DATABASE_URL = previousServerDatabaseUrl;
    if (previousRuntimeEnv === undefined) delete process.env.SERVER_RUNTIME_ENV;
    else process.env.SERVER_RUNTIME_ENV = previousRuntimeEnv;
  }
}

async function main(): Promise<void> {
  await testCommitAppliesBothDomainsAfterConfirmation();
  await testFailedCommitLeavesBothDomainsUntouched();
  await testProductionDatabaseModeRejectsVolatileFallback();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-tile-resource-item-durable',
    answers: '地块资源物品在玩家资产锁、实例分域锁与 persistence hold 内先规划背包和累计资源后态；COMMIT 确认前不改运行态，成功后一次应用并发送结构化通知，普通失败保持两域不变；生产数据库模式下 durable 未就绪会失败关闭。',
    excludes: '不证明真实 PostgreSQL 事务、COMMIT 回包丢失或跨进程 worker 竞争；由 tile-resource-use-durable DB smoke 覆盖。',
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

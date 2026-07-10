import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { applyDurableInventoryGrant } from '../runtime/world/world-runtime-inventory-grant.helpers';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function main(): Promise<void> {
  await proveCommitBeforeRuntimeApply();
  await proveFailureKeepsRuntimeSnapshot();
  console.log(JSON.stringify({
    ok: true,
    guarantees: [
      '通用背包发放的 next snapshot 在玩家资产串行区内计算',
      'durable 未完成时不暴露 next runtime snapshot',
      'durable 失败时保留原运行态',
    ],
  }, null, 2));
}

async function proveCommitBeforeRuntimeApply(): Promise<void> {
  const harness = createHarness();
  const pending = applyDurableInventoryGrant({
    ...harness.input,
    buildNextInventoryItems(currentItems: Array<Record<string, unknown>>) {
      currentItems.push({ itemId: 'rat_tail', count: 2 });
      return currentItems;
    },
  });
  await nextTurn();

  assert.equal(harness.durableCalls.length, 1);
  assert.equal(harness.player.inventory.items.length, 0);
  assert.equal(harness.replaceCalls.length, 0);

  harness.deferred.resolve({ ok: true });
  assert.equal(await pending, true);
  assert.equal(harness.replaceCalls.length, 1);
  assert.equal(harness.player.inventory.items[0]?.itemId, 'rat_tail');
  assert.equal(harness.player.inventory.items[0]?.count, 2);
  assert.deepEqual(harness.assetMutationCalls, [[harness.player.playerId]]);
}

async function proveFailureKeepsRuntimeSnapshot(): Promise<void> {
  const harness = createHarness();
  let failureHookCount = 0;
  const pending = applyDurableInventoryGrant({
    ...harness.input,
    buildNextInventoryItems(currentItems: Array<Record<string, unknown>>) {
      currentItems.push({ itemId: 'rat_tail', count: 2 });
      return currentItems;
    },
    onFailure() {
      failureHookCount += 1;
    },
  });
  await nextTurn();
  harness.deferred.reject(new Error('simulated_inventory_grant_failure'));
  await assert.rejects(() => pending, /simulated_inventory_grant_failure/);
  assert.equal(harness.player.inventory.items.length, 0);
  assert.equal(harness.replaceCalls.length, 0);
  assert.equal(failureHookCount, 1);
  assert.equal(harness.player.suppressImmediateDomainPersistence, false);
}

function createHarness() {
  const player = {
    playerId: 'player:inventory-grant-serialization',
    runtimeOwnerId: 'runtime:inventory-grant-serialization',
    sessionEpoch: 7,
    instanceId: null,
    inventory: {
      items: [] as Array<Record<string, unknown>>,
    },
    suppressImmediateDomainPersistence: false,
  };
  const durableCalls: Array<Record<string, unknown>> = [];
  const replaceCalls: Array<Array<Record<string, unknown>>> = [];
  const assetMutationCalls: Array<readonly string[]> = [];
  const deferred = createDeferred<{ ok: boolean }>();
  let assetMutationDepth = 0;
  const playerRuntimeService = {
    async runExclusiveAssetMutation<T>(playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
      assetMutationCalls.push([...playerIds]);
      assetMutationDepth += 1;
      try {
        return await action();
      } finally {
        assetMutationDepth -= 1;
      }
    },
    replaceInventoryItems(playerId: string, items: Array<Record<string, unknown>>) {
      assert.equal(playerId, player.playerId);
      assert.equal(assetMutationDepth, 1);
      const nextItems = items.map((entry) => ({ ...entry }));
      replaceCalls.push(nextItems);
      player.inventory.items = nextItems;
      return player;
    },
  };
  const durableOperationService = {
    async grantInventoryItems(input: Record<string, unknown>) {
      assert.equal(assetMutationDepth, 1);
      assert.equal(player.inventory.items.length, 0);
      durableCalls.push(input);
      return deferred.promise;
    },
  };
  return {
    player,
    durableCalls,
    replaceCalls,
    assetMutationCalls,
    deferred,
    input: {
      playerId: player.playerId,
      player,
      playerRuntimeService,
      durableOperationService,
      instanceCatalogService: null,
      operationId: 'op:inventory-grant-serialization',
      sourceType: 'smoke_grant',
      sourceRefId: 'smoke',
      grantedItems: [{ itemId: 'rat_tail', count: 2 }],
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

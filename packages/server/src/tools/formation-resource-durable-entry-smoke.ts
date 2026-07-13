import assert from 'node:assert/strict';

import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';

const playerId = 'player:formation-resource-durable';
const instanceId = 'real:formation-resource-durable';
const diskItemInstanceId = '11111111-1111-4111-8111-111111111111';
const productionGuardDiskItemInstanceId = '22222222-2222-4222-8222-222222222222';

async function main(): Promise<void> {
  const player = {
    playerId,
    runtimeOwnerId: 'runtime:formation-resource-durable',
    sessionEpoch: 7,
    templateId: 'formation_resource_smoke',
    instanceId,
    x: 4,
    y: 5,
    qi: 1_000_000,
    maxQi: 1_000_000,
    inventory: {
      revision: 3,
      capacity: 24,
      items: [
        {
          itemId: 'formation_disk.mortal',
          itemInstanceId: diskItemInstanceId,
          count: 1,
          name: '凡品阵盘',
          formationDiskTier: 'mortal',
          formationDiskMultiplier: 1,
        },
        { itemId: 'spirit_stone', count: 500, name: '灵石', type: 'currency' },
      ],
    },
    wallet: {
      balances: [{ walletType: 'spirit_stone', balance: 1, frozenBalance: 0, version: 4 }],
    },
  };
  const durableCalls: Array<Record<string, any>> = [];
  let releaseFirstCommit: (() => void) | null = null;
  let rejectNextCommit = false;
  const firstCommitGate = new Promise<void>((resolve) => {
    releaseFirstCommit = resolve;
  });
  const durableOperationService = {
    isEnabled: () => true,
    async commitFormationResourceMutation(input: Record<string, any>) {
      durableCalls.push(input);
      if (durableCalls.length === 1) {
        await firstCommitGate;
      }
      if (rejectNextCommit) {
        rejectNextCommit = false;
        throw new Error('simulated_formation_durable_failure');
      }
      return {
        ok: true,
        alreadyCommitted: false,
        action: input.action,
        formationInstanceId: input.formationWrite.formationInstanceId,
      };
    },
  };
  const notices: unknown[] = [];
  const playerRuntimeService = {
    playerDomainPersistenceService: null,
    getPlayerOrThrow(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return player;
    },
    getSessionFence(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return { runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch };
    },
    peekInventoryItemByInstanceId(targetPlayerId: string, itemInstanceId: string) {
      assert.equal(targetPlayerId, playerId);
      return player.inventory.items.find((entry) => entry.itemInstanceId === itemInstanceId) ?? null;
    },
    canAffordWallet(targetPlayerId: string, itemId: string, amount: number) {
      assert.equal(targetPlayerId, playerId);
      return player.inventory.items
        .filter((entry) => entry.itemId === itemId)
        .reduce((total, entry) => total + entry.count, 0) >= amount;
    },
    buildPersistenceSnapshot(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return {
        version: 1,
        savedAt: 100,
        placement: { instanceId, templateId: player.templateId, x: player.x, y: player.y, facing: 1 },
        vitals: { hp: 100, maxHp: 100, qi: player.qi, maxQi: player.maxQi },
        inventory: {
          revision: player.inventory.revision,
          capacity: player.inventory.capacity,
          items: player.inventory.items.map((entry) => ({ ...entry })),
        },
        wallet: { balances: player.wallet.balances.map((entry) => ({ ...entry })) },
      };
    },
    replaceInventoryItems(targetPlayerId: string, items: Array<Record<string, any>>) {
      assert.equal(targetPlayerId, playerId);
      player.inventory.items = items.map((entry) => ({ ...entry })) as typeof player.inventory.items;
      player.inventory.revision += 1;
      const spiritStoneBalance = player.inventory.items
        .filter((entry) => entry.itemId === 'spirit_stone')
        .reduce((total, entry) => total + entry.count, 0);
      player.wallet.balances = spiritStoneBalance > 0
        ? [{ walletType: 'spirit_stone', balance: spiritStoneBalance, frozenBalance: 0, version: 5 }]
        : [];
    },
    setVitals(targetPlayerId: string, input: { qi?: number }) {
      assert.equal(targetPlayerId, playerId);
      if (Number.isFinite(input.qi)) {
        player.qi = Math.max(0, Math.trunc(Number(input.qi)));
      }
    },
    enqueueNotice(_targetPlayerId: string, notice: unknown) {
      notices.push(notice);
    },
    runExclusiveAssetMutation(_playerIds: string[], action: () => unknown) {
      return action();
    },
  };
  let dispersedQi = 0;
  const instance = {
    meta: {
      instanceId,
      kind: 'public',
      linePreset: 'real',
      assignedNodeId: 'node:formation-resource',
      ownershipEpoch: 9,
    },
    template: { width: 16, height: 16 },
    worldRevision: 1,
    getPlayerPosition: () => ({ x: 4, y: 5 }),
    isInBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16,
    disperseQiAt(_x: number, _y: number, amount: number) {
      dispersedQi += amount;
    },
  };
  const deps = {
    getPlayerLocationOrThrow: () => ({ instanceId, x: 4, y: 5 }),
    getInstanceRuntime: (targetInstanceId: string) => targetInstanceId === instanceId ? instance : null,
    isInstanceLeaseWritable: (targetInstance: unknown) => targetInstance === instance,
    refreshPlayerContextActions: () => undefined,
  };
  const service = new WorldRuntimeFormationService(
    { getFormationTemplate: () => null },
    playerRuntimeService as never,
    null,
    durableOperationService as never,
  );
  let ordinaryPersistCalls = 0;
  service.persistFormationSnapshotSoon = () => {
    ordinaryPersistCalls += 1;
  };

  const deployPromise = Promise.resolve(service.dispatchCreateFormation(playerId, {
    formationId: 'spirit_gathering',
    itemInstanceId: diskItemInstanceId,
    spiritStoneCount: 100,
  }, deps));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(durableCalls.length, 1);
  assert.equal(service.listRuntimeFormations(instanceId).length, 0, 'durable 返回前不得暴露阵法运行态');
  assert.equal(player.inventory.items.length, 2, 'durable 返回前不得扣除背包资产');
  assert.equal(player.qi, 1_000_000, 'durable 返回前不得扣除灵力');
  assert.equal(dispersedQi, 0, 'durable 返回前不得向地图扩散灵力');

  releaseFirstCommit?.();
  const formation = await deployPromise;
  const deployInput = durableCalls[0];
  assert.equal(deployInput.action, 'deploy');
  assert.equal(deployInput.expectFormationAbsent, true);
  assert.equal(deployInput.expectedAssignedNodeId, 'node:formation-resource');
  assert.equal(deployInput.expectedOwnershipEpoch, 9);
  assert.equal(deployInput.nextPlayerSnapshot.inventory.items.length, 1);
  assert.equal(deployInput.nextPlayerSnapshot.inventory.items[0]?.itemId, 'spirit_stone');
  assert.equal(deployInput.nextPlayerSnapshot.inventory.items[0]?.count, 400);
  assert.equal(deployInput.nextPlayerSnapshot.wallet.balances[0]?.balance, 400);
  assert.ok(deployInput.nextPlayerSnapshot.vitals.qi < 1_000_000);
  assert.equal(service.listRuntimeFormations(instanceId).length, 1);
  assert.equal(player.inventory.items.length, 1);
  assert.equal(player.inventory.items[0]?.count, 400);
  assert.equal(player.wallet.balances[0]?.balance, 400);
  assert.equal(ordinaryPersistCalls, 0, 'durable 后态不得再次走普通阵法 writer');
  assert.ok(dispersedQi > 0);

  const beforeRefillBudget = Number(formation.remainingSpiritStoneBudget);
  const beforeRefillQi = player.qi;
  const beforeRefillUpdatedAt = formation.updatedAt;
  await service.dispatchRefillFormation(playerId, {
    formationInstanceId: formation.id,
    spiritStoneCount: 10,
    qiAmount: 5,
  }, deps);
  const refillInput = durableCalls[1];
  assert.equal(refillInput.action, 'refill');
  assert.equal(refillInput.expectedFormationUpdatedAtMs, beforeRefillUpdatedAt);
  assert.equal(player.wallet.balances[0]?.balance, 390);
  assert.equal(player.qi, beforeRefillQi - 5);
  assert.equal(Number(formation.remainingSpiritStoneBudget), beforeRefillBudget + 10);

  const failedInventory = JSON.stringify(player.inventory.items);
  const failedQi = player.qi;
  const failedBudget = formation.remainingSpiritStoneBudget;
  rejectNextCommit = true;
  await assert.rejects(
    service.dispatchRefillFormation(playerId, {
      formationInstanceId: formation.id,
      spiritStoneCount: 5,
      qiAmount: 3,
    }, deps),
    /simulated_formation_durable_failure/,
  );
  assert.equal(JSON.stringify(player.inventory.items), failedInventory);
  assert.equal(player.qi, failedQi);
  assert.equal(formation.remainingSpiritStoneBudget, failedBudget);

  const previousRuntimeEnv = process.env.SERVER_RUNTIME_ENV;
  const previousDatabaseUrl = process.env.SERVER_DATABASE_URL;
  try {
    player.inventory.items.push({
      itemId: 'formation_disk.mortal',
      itemInstanceId: productionGuardDiskItemInstanceId,
      count: 1,
      name: '凡品阵盘',
      formationDiskTier: 'mortal',
      formationDiskMultiplier: 1,
    });
    process.env.SERVER_RUNTIME_ENV = 'production';
    process.env.SERVER_DATABASE_URL = 'postgresql://formation-production-guard.invalid/db';
    const productionService = new WorldRuntimeFormationService(
      { getFormationTemplate: () => null },
      playerRuntimeService as never,
    );
    assert.throws(
      () => productionService.dispatchCreateFormation(playerId, {
        formationId: 'spirit_gathering',
        itemInstanceId: productionGuardDiskItemInstanceId,
        spiritStoneCount: 100,
      }, deps),
      /阵法资产事务暂不可用/,
    );
  }
  finally {
    if (previousRuntimeEnv === undefined) delete process.env.SERVER_RUNTIME_ENV;
    else process.env.SERVER_RUNTIME_ENV = previousRuntimeEnv;
    if (previousDatabaseUrl === undefined) delete process.env.SERVER_DATABASE_URL;
    else process.env.SERVER_DATABASE_URL = previousDatabaseUrl;
  }

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '布阵与补给在 durable 返回前不修改玩家、地图或阵法运行态。',
      'durable 输入同时携带 inventory/wallet/vitals、formation 与实例 lease/epoch fence。',
      '事务失败不扣资产、不增加阵法资源，生产 durable 缺失时失败关闭。',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

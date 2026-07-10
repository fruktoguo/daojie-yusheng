import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeController } from '../runtime/world/world-runtime.controller';

async function main(): Promise<void> {
  const playerId = 'player:wallet-route-smoke';
  const runtimePlayer = {
    playerId,
    runtimeOwnerId: `runtime-owner:${playerId}`,
    sessionEpoch: 7,
    wallet: {
      balances: [
        {
          walletType: 'spirit_stone',
          balance: 10,
          frozenBalance: 0,
          version: 1,
        },
      ],
    },
    inventory: {
      items: [] as Array<Record<string, unknown>>,
      capacity: 16,
      revision: 0,
    },
  };
  const durableCalls: Array<Record<string, unknown>> = [];
  const inventoryGrantCalls: Array<Record<string, unknown>> = [];
  const assetMutationCalls: Array<readonly string[]> = [];
  let assetMutationDepth = 0;
  const controller = new WorldRuntimeController(
    {
      worldRuntimePlayerLocationService: {
        getPlayerLocation(requestedPlayerId: string) {
          return requestedPlayerId === playerId ? { instanceId: 'instance:wallet-route' } : null;
        },
      },
      instanceCatalogService: {
        isEnabled() {
          return true;
        },
        async loadInstanceCatalog(requestedInstanceId: string) {
          if (requestedInstanceId !== 'instance:wallet-route') {
            return null;
          }
          return {
            assigned_node_id: 'node:wallet-route',
            ownership_epoch: 9,
          };
        },
      },
    } as never,
    {} as never,
    {} as never,
    {
      contentTemplateRepository: {
        createItem(itemId: string, count: number) {
          return itemId === 'rat_tail'
            ? { itemId, count, name: '鼠尾', type: 'material' }
            : null;
        },
      },
      async runExclusiveAssetMutation<T>(playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
        assetMutationCalls.push([...playerIds]);
        assetMutationDepth += 1;
        try {
          return await action();
        } finally {
          assetMutationDepth -= 1;
        }
      },
      getPlayerOrThrow(requestedPlayerId: string) {
        if (requestedPlayerId !== playerId) {
          throw new Error(`unexpected player ${requestedPlayerId}`);
        }
        return runtimePlayer;
      },
      creditWallet(requestedPlayerId: string, walletType: string, amount = 1) {
        assert.equal(assetMutationDepth, 1, '钱包运行态应用必须位于资产串行区');
        if (requestedPlayerId !== playerId || walletType !== 'spirit_stone') {
          throw new Error(`unexpected creditWallet args: ${JSON.stringify({ requestedPlayerId, walletType, amount })}`);
        }
        runtimePlayer.wallet.balances[0].balance += amount;
        return runtimePlayer;
      },
      debitWallet(requestedPlayerId: string, walletType: string, amount = 1) {
        assert.equal(assetMutationDepth, 1, '钱包运行态应用必须位于资产串行区');
        if (requestedPlayerId !== playerId || walletType !== 'spirit_stone') {
          throw new Error(`unexpected debitWallet args: ${JSON.stringify({ requestedPlayerId, walletType, amount })}`);
        }
        runtimePlayer.wallet.balances[0].balance -= amount;
        return runtimePlayer;
      },
      replaceInventoryItems(requestedPlayerId: string, items: Array<Record<string, unknown>>) {
        assert.equal(requestedPlayerId, playerId);
        assert.equal(assetMutationDepth, 1, '背包运行态应用必须位于资产串行区');
        assert.equal(inventoryGrantCalls.length, 1, '必须先完成 durable 提交再应用运行态');
        runtimePlayer.inventory.items = items.map((entry) => ({ ...entry }));
        runtimePlayer.inventory.revision += 1;
        return runtimePlayer;
      },
    } as never,
    {} as never,
    {} as never,
    {
      isEnabled() {
        return true;
      },
      mutatePlayerWallet(input: Record<string, unknown>) {
        assert.equal(assetMutationDepth, 1, 'durable 钱包提交必须位于资产串行区');
        durableCalls.push(input);
      },
      grantInventoryItems(input: Record<string, unknown>) {
        assert.equal(assetMutationDepth, 1, 'durable 背包提交必须位于资产串行区');
        assert.equal(runtimePlayer.inventory.items.length, 0, 'durable 提交前不得暴露 next runtime snapshot');
        inventoryGrantCalls.push(input);
      },
    } as never,
    { getMetrics: () => ({}) } as never,
  );

  const creditResult = await controller.creditWallet(playerId, { walletType: 'spirit_stone', amount: 4 });
  assert.equal(creditResult.player.wallet.balances[0].balance, 14);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.playerId, playerId);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, runtimePlayer.runtimeOwnerId);
  assert.equal(durableCalls[0]?.expectedSessionEpoch, runtimePlayer.sessionEpoch);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:wallet-route');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:wallet-route');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 9);
  assert.equal(durableCalls[0]?.walletType, 'spirit_stone');
  assert.equal(durableCalls[0]?.action, 'credit');
  assert.equal(durableCalls[0]?.delta, 4);

  const debitResult = await controller.debitWallet(playerId, { walletType: 'spirit_stone', amount: 3 });
  assert.equal(debitResult.player.wallet.balances[0].balance, 11);
  assert.equal(durableCalls.length, 2);
  assert.equal(durableCalls[1]?.action, 'debit');
  assert.equal(durableCalls[1]?.delta, 3);
  assert.equal(durableCalls[1]?.expectedAssignedNodeId, 'node:wallet-route');
  assert.equal(durableCalls[1]?.expectedOwnershipEpoch, 9);
  assert.equal(durableCalls[1]?.nextWalletBalances && Array.isArray(durableCalls[1]?.nextWalletBalances), true);

  const grantResult = await controller.grantItem(playerId, { itemId: 'rat_tail', count: 2 });
  assert.equal(grantResult.player.inventory.items.length, 1);
  assert.equal(grantResult.player.inventory.items[0]?.itemId, 'rat_tail');
  assert.equal(grantResult.player.inventory.items[0]?.count, 2);
  assert.equal(inventoryGrantCalls.length, 1);
  assert.equal(inventoryGrantCalls[0]?.sourceType, 'gm_grant');
  assert.equal(inventoryGrantCalls[0]?.expectedAssignedNodeId, 'node:wallet-route');
  assert.equal(inventoryGrantCalls[0]?.expectedOwnershipEpoch, 9);
  assert.deepEqual(assetMutationCalls, [[playerId], [playerId], [playerId]]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        durableCallCount: durableCalls.length,
        inventoryGrantCallCount: inventoryGrantCalls.length,
        creditBalance: creditResult.player.wallet.balances[0].balance,
        debitBalance: debitResult.player.wallet.balances[0].balance,
        answers: 'WorldRuntimeController 的 wallet HTTP 路由已接入 DurableOperationService，并在同一玩家资产串行区内带上 runtimeOwnerId/sessionEpoch/instanceId/assignedNodeId/ownershipEpoch 完成 durable 记账后再回写运行态钱包',
        excludes: '不证明真实 HTTP server、数据库提交或 outbox worker 集群',
        completionMapping: 'release:proof:wallet-route',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

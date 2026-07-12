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
      items: [{ itemId: 'spirit_stone', count: 10, name: '灵石', type: 'currency' }] as Array<Record<string, unknown>>,
      capacity: 16,
      revision: 0,
    },
  };
  const walletInventoryCalls: Array<Record<string, unknown>> = [];
  const inventoryGrantCalls: Array<Record<string, unknown>> = [];
  const runtimeOnlyFallbackCalls: Array<Record<string, unknown>> = [];
  const committedOperations = new Map<string, Record<string, unknown>>();
  const assetMutationCalls: Array<readonly string[]> = [];
  let assetMutationDepth = 0;
  let durableEnabled = true;
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
          if (itemId === 'rat_tail') {
            return { itemId, count, name: '鼠尾', type: 'material' };
          }
          if (itemId === 'spirit_stone') {
            return { itemId, count, name: '灵石', type: 'currency' };
          }
          if (itemId === 'pill.minor_heal') {
            return { itemId, count, name: '小还丹', type: 'consumable' };
          }
          return null;
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
        runtimeOnlyFallbackCalls.push({ action: 'credit', amount });
        return runtimePlayer;
      },
      debitWallet(requestedPlayerId: string, walletType: string, amount = 1) {
        assert.equal(assetMutationDepth, 1, '钱包运行态应用必须位于资产串行区');
        if (requestedPlayerId !== playerId || walletType !== 'spirit_stone') {
          throw new Error(`unexpected debitWallet args: ${JSON.stringify({ requestedPlayerId, walletType, amount })}`);
        }
        runtimeOnlyFallbackCalls.push({ action: 'debit', amount });
        return runtimePlayer;
      },
      replaceInventoryItems(requestedPlayerId: string, items: Array<Record<string, unknown>>) {
        assert.equal(requestedPlayerId, playerId);
        assert.equal(assetMutationDepth, 1, '背包运行态应用必须位于资产串行区');
        assert.equal(walletInventoryCalls.length + inventoryGrantCalls.length > 0, true, '必须先完成 durable 提交再应用运行态');
        runtimePlayer.inventory.items = items.map((entry) => ({ ...entry }));
        runtimePlayer.inventory.revision += 1;
        const spiritStoneCount = runtimePlayer.inventory.items
          .filter((entry) => entry.itemId === 'spirit_stone')
          .reduce((total, entry) => total + Number(entry.count ?? 0), 0);
        runtimePlayer.wallet.balances = spiritStoneCount > 0
          ? [{ walletType: 'spirit_stone', balance: spiritStoneCount, frozenBalance: 0, version: 2 }]
          : [];
        return runtimePlayer;
      },
    } as never,
    {} as never,
    {} as never,
    {
      isEnabled() {
        return durableEnabled;
      },
      async getOperationReplay(operationId: string) {
        return {
          operation: committedOperations.get(operationId) ?? null,
          outboxEvents: [],
          assetAuditLogs: [],
        };
      },
      grantInventoryItems(input: Record<string, unknown>) {
        assert.equal(assetMutationDepth, 1, 'durable 背包提交必须位于资产串行区');
        if (input.sourceType === 'gm_wallet') {
          walletInventoryCalls.push(input);
        } else {
          inventoryGrantCalls.push(input);
        }
        committedOperations.set(String(input.operationId), {
          status: 'committed',
          payload_jsonb: {
            sourceType: input.sourceType,
            sourceRefId: input.sourceRefId,
          },
        });
        return { ok: true, alreadyCommitted: false };
      },
    } as never,
    { getMetrics: () => ({}) } as never,
  );

  await assert.rejects(
    () => controller.creditWallet(playerId, {
      walletType: 'spirit_stone',
      amount: 0,
      requestId: 'wallet-zero',
    }),
    /钱包变更参数无效/,
  );
  await assert.rejects(
    () => controller.grantItem(playerId, {
      itemId: 'rat_tail',
      count: 2_147_483_648,
      requestId: 'inventory-overflow',
    }),
    /背包发放参数无效/,
  );
  await assert.rejects(
    () => controller.grantItem(playerId, {
      itemId: 'rat_tail',
      count: 1,
      requestId: 'invalid request id',
    }),
    /requestId 无效/,
  );

  const creditResult = await controller.creditWallet(playerId, {
    walletType: 'spirit_stone',
    amount: 4,
    requestId: 'wallet-credit-1',
  });
  assert.equal(creditResult.player.wallet.balances[0].balance, 14);
  const creditBalanceAfterCommit = creditResult.player.wallet.balances[0].balance;
  assert.equal(creditResult.requestId, 'wallet-credit-1');
  assert.equal(walletInventoryCalls.length, 1);
  assert.equal(walletInventoryCalls[0]?.playerId, playerId);
  assert.equal(walletInventoryCalls[0]?.expectedRuntimeOwnerId, runtimePlayer.runtimeOwnerId);
  assert.equal(walletInventoryCalls[0]?.expectedSessionEpoch, runtimePlayer.sessionEpoch);
  assert.equal(walletInventoryCalls[0]?.expectedInstanceId, 'instance:wallet-route');
  assert.equal(walletInventoryCalls[0]?.expectedAssignedNodeId, 'node:wallet-route');
  assert.equal(walletInventoryCalls[0]?.expectedOwnershipEpoch, 9);
  assert.equal(walletInventoryCalls[0]?.sourceType, 'gm_wallet');
  assert.equal(walletInventoryCalls[0]?.sourceRefId, 'credit:spirit_stone:x4');
  assert.equal(walletInventoryCalls[0]?.inventoryAction, 'grant');
  assert.equal((walletInventoryCalls[0]?.nextInventoryItems as Array<Record<string, unknown>>)[0]?.count, 14);

  const replayedCredit = await controller.creditWallet(playerId, {
    walletType: 'spirit_stone',
    amount: 4,
    requestId: 'wallet-credit-1',
  });
  assert.equal(replayedCredit.player.wallet.balances[0].balance, 14);
  assert.equal(walletInventoryCalls.length, 1, '相同 requestId 精确重放不得重复提交资产事务');
  await assert.rejects(
    () => controller.creditWallet(playerId, {
      walletType: 'spirit_stone',
      amount: 5,
      requestId: 'wallet-credit-1',
    }),
    /requestId 已被不同参数使用/,
  );
  assert.equal(replayedCredit.player.wallet.balances[0].balance, 14);

  const debitResult = await controller.debitWallet(playerId, {
    walletType: 'spirit_stone',
    amount: 3,
    requestId: 'wallet-debit-1',
  });
  assert.equal(debitResult.player.wallet.balances[0].balance, 11);
  assert.equal(walletInventoryCalls.length, 2);
  assert.equal(walletInventoryCalls[1]?.inventoryAction, 'remove');
  assert.equal(walletInventoryCalls[1]?.sourceRefId, 'debit:spirit_stone:x3');
  assert.equal(walletInventoryCalls[1]?.expectedAssignedNodeId, 'node:wallet-route');
  assert.equal(walletInventoryCalls[1]?.expectedOwnershipEpoch, 9);
  assert.equal((walletInventoryCalls[1]?.nextInventoryItems as Array<Record<string, unknown>>)[0]?.count, 11);

  const grantResult = await controller.grantItem(playerId, {
    itemId: 'rat_tail',
    count: 2,
    requestId: 'inventory-grant-1',
  });
  assert.equal(grantResult.player.inventory.items.length, 2);
  assert.equal(grantResult.player.inventory.items[1]?.itemId, 'rat_tail');
  assert.equal(grantResult.player.inventory.items[1]?.count, 2);
  assert.equal(inventoryGrantCalls.length, 1);
  assert.equal(inventoryGrantCalls[0]?.sourceType, 'gm_grant');
  assert.equal(inventoryGrantCalls[0]?.sourceRefId, 'gm:rat_tail:x2');
  assert.equal(inventoryGrantCalls[0]?.expectedAssignedNodeId, 'node:wallet-route');
  assert.equal(inventoryGrantCalls[0]?.expectedOwnershipEpoch, 9);

  const replayedGrant = await controller.grantItem(playerId, {
    itemId: 'rat_tail',
    count: 2,
    requestId: 'inventory-grant-1',
  });
  assert.equal(replayedGrant.player.inventory.items[1]?.count, 2);
  assert.equal(inventoryGrantCalls.length, 1);
  await assert.rejects(
    () => controller.grantItem(playerId, {
      itemId: 'rat_tail',
      count: 3,
      requestId: 'inventory-grant-1',
    }),
    /requestId 已被不同参数使用/,
  );
  runtimePlayer.inventory.capacity = 2;
  await assert.rejects(
    () => controller.grantItem(playerId, {
      itemId: 'pill.minor_heal',
      count: 1,
      requestId: 'inventory-capacity-full',
    }),
    /背包空间不足/,
  );

  const previousRuntimeEnv = process.env.SERVER_RUNTIME_ENV;
  try {
    process.env.SERVER_RUNTIME_ENV = 'production';
    await assert.rejects(
      () => controller.creditWallet(playerId, {
        walletType: 'spirit_stone',
        amount: 1,
      }),
      /生产资产请求必须提供 requestId/,
    );
    durableEnabled = false;
    await assert.rejects(
      () => controller.creditWallet(playerId, {
        walletType: 'spirit_stone',
        amount: 1,
        requestId: 'wallet-production-disabled',
      }),
      /已拒绝运行态钱包变更/,
    );
    await assert.rejects(
      () => controller.grantItem(playerId, {
        itemId: 'rat_tail',
        count: 1,
        requestId: 'inventory-production-disabled',
      }),
      /已拒绝运行态背包发放/,
    );
  } finally {
    durableEnabled = true;
    if (previousRuntimeEnv === undefined) {
      delete process.env.SERVER_RUNTIME_ENV;
    } else {
      process.env.SERVER_RUNTIME_ENV = previousRuntimeEnv;
    }
  }
  assert.equal(runtimeOnlyFallbackCalls.length, 0);
  assert.deepEqual(assetMutationCalls, Array.from({ length: 10 }, () => [playerId]));

  console.log(
    JSON.stringify(
      {
        ok: true,
        walletInventoryCallCount: walletInventoryCalls.length,
        inventoryGrantCallCount: inventoryGrantCalls.length,
        creditBalance: creditBalanceAfterCommit,
        debitBalance: debitResult.player.wallet.balances[0].balance,
        answers: 'WorldRuntimeController 的 wallet credit/debit 与 grant-item 统一写背包真源，带 session/instance lease fence；调用方 requestId 可精确重放且参数冲突会拒绝；生产 durable 不可用时失败关闭，不会只改易失运行态',
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

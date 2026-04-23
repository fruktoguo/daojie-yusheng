import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeController } from '../runtime/world/world-runtime.controller';

async function main(): Promise<void> {
  const playerId = 'player:inventory-route-smoke';
  const runtimePlayer = {
    playerId,
    runtimeOwnerId: `runtime-owner:${playerId}`,
    sessionEpoch: 8,
    inventory: {
      items: [] as Array<Record<string, unknown>>,
      revision: 0,
    },
    persistentRevision: 0,
    selfRevision: 0,
    dirtyDomains: new Set<string>(),
    suppressImmediateDomainPersistence: false,
  };
  const durableCalls: Array<Record<string, unknown>> = [];
  let shouldFail = false;
  const controller = new WorldRuntimeController(
    {
      worldRuntimePlayerLocationService: {
        getPlayerLocation(requestedPlayerId: string) {
          return requestedPlayerId === playerId ? { instanceId: 'instance:inventory-route' } : null;
        },
      },
      instanceCatalogService: {
        isEnabled() {
          return true;
        },
        async loadInstanceCatalog(requestedInstanceId: string) {
          if (requestedInstanceId !== 'instance:inventory-route') {
            return null;
          }
          return {
            assigned_node_id: 'node:inventory-route',
            ownership_epoch: 10,
          };
        },
      },
    } as never,
    {} as never,
    {} as never,
    {
      getPlayerOrThrow(requestedPlayerId: string) {
        if (requestedPlayerId !== playerId) {
          throw new Error(`unexpected player ${requestedPlayerId}`);
        }
        return runtimePlayer;
      },
      grantItem(requestedPlayerId: string, itemId: string, count = 1) {
        if (requestedPlayerId !== playerId || itemId !== 'rat_tail') {
          throw new Error(`unexpected grantItem args: ${JSON.stringify({ requestedPlayerId, itemId, count })}`);
        }
        const existing = runtimePlayer.inventory.items.find((entry) => entry.itemId === itemId);
        if (existing) {
          existing.count = Number(existing.count ?? 0) + count;
        } else {
          runtimePlayer.inventory.items.push({ itemId, name: '鼠尾', count, type: 'material' });
        }
        runtimePlayer.inventory.revision += 1;
        runtimePlayer.persistentRevision += 1;
        runtimePlayer.selfRevision += 1;
        runtimePlayer.dirtyDomains = new Set(['inventory']);
        return runtimePlayer;
      },
      playerProgressionService: {
        refreshPreview() {},
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async grantInventoryItems(input: Record<string, unknown>) {
        durableCalls.push(input);
        if (shouldFail) {
          throw new Error('durable inventory grant failed');
        }
        return {
          ok: true,
          alreadyCommitted: false,
          grantedCount: 2,
          sourceType: 'gm_grant',
        };
      },
    } as never,
  );

  const result = await controller.grantItem(playerId, { itemId: 'rat_tail', count: 2 });
  assert.equal(result.player.inventory.items.length, 1);
  assert.equal(result.player.inventory.items[0]?.itemId, 'rat_tail');
  assert.equal(result.player.inventory.items[0]?.count, 2);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.playerId, playerId);
  assert.equal(durableCalls[0]?.expectedRuntimeOwnerId, runtimePlayer.runtimeOwnerId);
  assert.equal(durableCalls[0]?.expectedSessionEpoch, runtimePlayer.sessionEpoch);
  assert.equal(durableCalls[0]?.expectedInstanceId, 'instance:inventory-route');
  assert.equal(durableCalls[0]?.expectedAssignedNodeId, 'node:inventory-route');
  assert.equal(durableCalls[0]?.expectedOwnershipEpoch, 10);
  assert.equal(durableCalls[0]?.sourceType, 'gm_grant');
  assert.equal(durableCalls[0]?.sourceRefId, 'gm:rat_tail');
  assert.equal((durableCalls[0]?.grantedItems as Array<Record<string, unknown>>)?.[0]?.itemId, 'rat_tail');

  shouldFail = true;
  await assert.rejects(() => controller.grantItem(playerId, { itemId: 'rat_tail', count: 1 }), /durable inventory grant failed/);
  assert.equal(runtimePlayer.inventory.items[0]?.count, 2);
  assert.equal(runtimePlayer.inventory.revision, 1);
  assert.equal(runtimePlayer.persistentRevision, 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        durableCallCount: durableCalls.length,
        inventoryCount: runtimePlayer.inventory.items[0]?.count,
        answers: 'WorldRuntimeController 的 grantItem HTTP 路由已接入 DurableOperationService.grantInventoryItems，并会带上 runtimeOwnerId/sessionEpoch/instanceId/assignedNodeId/ownershipEpoch 进行 durable 发物后再保留运行态库存变更',
        excludes: '不证明真实 HTTP server、数据库提交或更泛化的 quest/redeem 奖励事务化',
        completionMapping: 'replace-ready:proof:inventory-route',
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

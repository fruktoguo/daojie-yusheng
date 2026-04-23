import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

function createService() {
  const markCalls: string[][] = [];
  const bumpCalls: string[] = [];
  const durableCalls: Array<Record<string, unknown>> = [];
  const replaceInventoryCalls: Array<Array<Record<string, unknown>>> = [];
  const player = {
    playerId: 'player:market-storage',
    persistentRevision: 7,
    dirtyDomains: new Set<string>(),
  };
  const playerSnapshot = {
    playerId: player.playerId,
    runtimeOwnerId: 'runtime:player:market-storage:9',
    sessionEpoch: 9,
    instanceId: 'instance:market-storage:1',
    inventory: {
      capacity: 24,
      items: [] as Array<Record<string, unknown>>,
    },
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
    snapshot(playerId: string) {
      return playerId === player.playerId
        ? {
            ...playerSnapshot,
            inventory: {
              capacity: playerSnapshot.inventory.capacity,
              items: playerSnapshot.inventory.items.map((entry) => ({ ...entry })),
            },
          }
        : null;
    },
    replaceInventoryItems(_playerId: string, items: Array<Record<string, unknown>>) {
      replaceInventoryCalls.push(items.map((entry) => ({ ...entry })));
    },
    markPersistenceDirtyDomains(_target: unknown, domains: Iterable<string>) {
      markCalls.push(Array.from(domains));
    },
    bumpPersistentRevision(target: { persistentRevision: number }) {
      target.persistentRevision += 1;
      bumpCalls.push('bump');
    },
  };
  const service = new MarketRuntimeService(
    {
      normalizeItem(item: Record<string, unknown>) {
        return {
          ...item,
          count: Number.isFinite(Number(item?.count ?? 0)) ? Math.max(1, Math.trunc(Number(item.count))) : 1,
        };
      },
      getItemName(itemId: string) {
        return itemId === 'spirit_stone' ? '灵石' : itemId;
      },
    } as never,
    playerRuntimeService as never,
    {} as never,
    {
      isEnabled() {
        return true;
      },
      async claimMarketStorage(input: Record<string, unknown>) {
        durableCalls.push({ ...input });
        return {
          ok: true,
          alreadyCommitted: false,
          movedCount: Number(input?.movedCount ?? 0),
          remainingCount: Number(input?.remainingCount ?? 0),
        };
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog(instanceId: string) {
        if (instanceId !== playerSnapshot.instanceId) {
          return null;
        }
        return {
          assigned_node_id: 'node:market-storage',
          ownership_epoch: 7,
        };
      },
    } as never,
  );
  return {
    service: service as unknown as {
      createMutationContext: () => {
        storageSnapshotByPlayerId: Map<string, { items: Array<Record<string, unknown>> }>;
        dirtyStoragePlayerIds: Set<string>;
      };
      setStorage: (
        playerId: string,
        storage: { items: Array<Record<string, unknown>> },
        context: {
          storageSnapshotByPlayerId: Map<string, { items: Array<Record<string, unknown>> }>;
          dirtyStoragePlayerIds: Set<string>;
        },
      ) => void;
      claimStorage: (playerId: string) => Promise<{
        affectedPlayerIds: string[];
        notices: Array<{ playerId: string; text: string; kind: string }>;
      }>;
      storageByPlayerId: Map<string, { items: Array<Record<string, unknown>> }>;
    },
    player,
    playerSnapshot,
    markCalls,
    bumpCalls,
    durableCalls,
    replaceInventoryCalls,
  };
}

async function main(): Promise<void> {
  const harness = createService();
  const context = harness.service.createMutationContext();

  harness.service.setStorage(
    harness.player.playerId,
    {
      items: [
        {
          itemId: 'spirit_stone',
          count: 2,
        },
      ],
    },
    context,
  );

  assert.ok(context.dirtyStoragePlayerIds.has(harness.player.playerId), 'expected market mutation context to track dirty storage player');
  assert.equal(harness.markCalls.length, 0, `expected no player dirty domains, got ${JSON.stringify(harness.markCalls)}`);
  assert.equal(harness.bumpCalls.length, 0, `expected no player persistentRevision bump, got ${JSON.stringify(harness.bumpCalls)}`);
  assert.equal(harness.player.persistentRevision, 7, `expected persistentRevision unchanged, got ${harness.player.persistentRevision}`);
  harness.service.storageByPlayerId.set(harness.player.playerId, {
    items: [
      {
        itemId: 'spirit_stone',
        count: 2,
      },
    ],
  });
  const claimResult = await harness.service.claimStorage(harness.player.playerId);
  assert.equal(harness.durableCalls.length, 1, `expected durable claim call, got ${JSON.stringify(harness.durableCalls)}`);
  assert.deepEqual(
    {
      expectedInstanceId: harness.durableCalls[0]?.expectedInstanceId,
      expectedAssignedNodeId: harness.durableCalls[0]?.expectedAssignedNodeId,
      expectedOwnershipEpoch: harness.durableCalls[0]?.expectedOwnershipEpoch,
    },
    {
      expectedInstanceId: harness.playerSnapshot.instanceId,
      expectedAssignedNodeId: 'node:market-storage',
      expectedOwnershipEpoch: 7,
    },
  );
  assert.equal(harness.replaceInventoryCalls.length, 1, `expected runtime inventory replace after durable claim, got ${JSON.stringify(harness.replaceInventoryCalls)}`);
  assert.equal(claimResult.notices.length, 1, `expected single market claim notice, got ${JSON.stringify(claimResult)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'MarketRuntimeService 的托管仓内存变更现在只进入坊市持久化上下文，不再把在线玩家打上 market_storage dirty 或推进 player persistentRevision；claimStorage 也会把 instanceId/assignedNodeId/ownershipEpoch 透传到 durable claim 主链',
        completionMapping: 'replace-ready:proof:with-db.market-storage-runtime-boundary',
      },
      null,
      2,
    ),
  );
}

void main();

import assert from 'node:assert/strict';

import { DurableOperationService } from '../persistence/durable-operation.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

type SmokePlayer = {
  playerId: string;
  sessionId: string | null;
  runtimeOwnerId: string | null;
  sessionEpoch: number;
  inventory?: { items: unknown[] };
  wallet?: { balances: unknown[] };
  instanceId?: string | null;
};

type SmokePresenceRow = {
  runtime_owner_id: string | null;
  session_epoch: number;
};

async function main(): Promise<void> {
  const offlinePlayerId = 'player:market-offline-recipient';
  const onlinePlayerId = 'player:market-online-recipient';
  const received: Array<{ playerId: string; itemId: string; count: number }> = [];
  const flushed: string[] = [];
  const players = new Map<string, SmokePlayer>([
    [offlinePlayerId, { playerId: offlinePlayerId, sessionId: null, runtimeOwnerId: null, sessionEpoch: 0 }],
    [onlinePlayerId, { playerId: onlinePlayerId, sessionId: 'socket:online', runtimeOwnerId: 'runtime:online:1', sessionEpoch: 1 }],
  ]);

  const service = new MarketRuntimeService(
    {} as never,
    {
      getPlayer(playerId: string) {
        return players.get(playerId) ?? null;
      },
      snapshot(playerId: string) {
        const player = players.get(playerId);
        return player ? structuredClone(player) : null;
      },
      canReceiveInventoryItem() {
        return true;
      },
      receiveInventoryItem(playerId: string, item: Record<string, unknown>) {
        received.push({
          playerId,
          itemId: String(item.itemId),
          count: Math.max(1, Math.trunc(Number(item.count ?? 1))),
        });
      },
      describePersistencePresence(playerId: string) {
        const player = players.get(playerId);
        if (!player) {
          return null;
        }
        return {
          online: Boolean(player.sessionId),
          inWorld: true,
          runtimeOwnerId: typeof player.runtimeOwnerId === 'string' ? player.runtimeOwnerId : null,
          sessionEpoch: Number.isFinite(Number(player.sessionEpoch)) ? Number(player.sessionEpoch) : null,
        };
      },
    } as never,
    {} as never,
    { isEnabled() { return false; } } as never,
    {} as never,
    {
      async flushPlayer(playerId: string) {
        flushed.push(playerId);
      },
    } as never,
  );

  const offlineContext = service.createMutationContext();
  service.deliverItemToPlayer(offlinePlayerId, { itemId: 'rat_tail', count: 2 }, offlineContext);

  assert.deepEqual(received, []);
  assert.deepEqual(Array.from(offlineContext.onlinePlayerSnapshots.keys()), []);
  assert.equal(service.storageByPlayerId.get(offlinePlayerId)?.items[0]?.itemId, 'rat_tail');
  assert.equal(service.storageByPlayerId.get(offlinePlayerId)?.items[0]?.count, 2);

  const onlineContext = service.createMutationContext();
  service.deliverItemToPlayer(onlinePlayerId, { itemId: 'rat_tail', count: 3 }, onlineContext);
  await service.flushAffectedPlayersAfterMutation(onlineContext);

  assert.deepEqual(received, [{ playerId: onlinePlayerId, itemId: 'rat_tail', count: 3 }]);
  assert.deepEqual(Array.from(onlineContext.onlinePlayerSnapshots.keys()), [onlinePlayerId]);
  assert.deepEqual(flushed, [onlinePlayerId]);
  await assertDurableMarketMutationAllowsRuntimeEpochAhead();
  await assertDurableMarketMutationRejectsStaleRuntimeEpoch();
  await assertDurableMarketMutationRejectsSameEpochOwnerMismatch();
  await assertMarketRuntimeCommitSyncsPresenceBeforeDurableMutation();

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'MarketRuntimeService 只把拥有 runtimeOwnerId/sessionEpoch 的运行态玩家纳入在线快照和成交后即时 flush；无 session fence 的离线运行态收货方会进入坊市托管仓，不再被当作在线玩家改背包或触发 stale-owner flush。',
        completionMapping: 'release:proof:market-runtime-session-fence',
      },
      null,
      2,
    ),
  );
}

async function assertDurableMarketMutationAllowsRuntimeEpochAhead(): Promise<void> {
  const { service, presenceRows, queryLog } = createDurableOperationServiceWithPresence({
    runtime_owner_id: 'runtime:online:1',
    session_epoch: 1,
  });
  const result = await service.settleMarketMutation({
    operationId: 'market-session-fence-runtime-ahead',
    playerId: 'player:market-session-fence',
    expectedRuntimeOwnerId: 'runtime:online:2',
    expectedSessionEpoch: 2,
    operationType: 'market_create_sell_order',
    upsertOrders: [buildSmokeOrder('order:runtime-ahead')],
  });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyCommitted, false);
  assert.deepEqual(presenceRows[0], {
    runtime_owner_id: 'runtime:online:2',
    session_epoch: 2,
  });
  assert.equal(queryLog.some((entry) => entry.includes('INSERT INTO player_presence')), true);
}

async function assertDurableMarketMutationRejectsStaleRuntimeEpoch(): Promise<void> {
  const { service } = createDurableOperationServiceWithPresence({
    runtime_owner_id: 'runtime:online:3',
    session_epoch: 3,
  });
  await assert.rejects(
    () => service.settleMarketMutation({
      operationId: 'market-session-fence-runtime-stale',
      playerId: 'player:market-session-fence',
      expectedRuntimeOwnerId: 'runtime:online:2',
      expectedSessionEpoch: 2,
      operationType: 'market_create_sell_order',
      upsertOrders: [buildSmokeOrder('order:runtime-stale')],
    }),
    /player_session_fencing_conflict:market_mutation/,
  );
}

async function assertDurableMarketMutationRejectsSameEpochOwnerMismatch(): Promise<void> {
  const { service } = createDurableOperationServiceWithPresence({
    runtime_owner_id: 'runtime:online:old',
    session_epoch: 2,
  });
  await assert.rejects(
    () => service.settleMarketMutation({
      operationId: 'market-session-fence-owner-mismatch',
      playerId: 'player:market-session-fence',
      expectedRuntimeOwnerId: 'runtime:online:new',
      expectedSessionEpoch: 2,
      operationType: 'market_create_sell_order',
      upsertOrders: [buildSmokeOrder('order:owner-mismatch')],
    }),
    /player_session_fencing_conflict:market_mutation/,
  );
}

async function assertMarketRuntimeCommitSyncsPresenceBeforeDurableMutation(): Promise<void> {
  const playerId = 'player:market-runtime-sync-fence';
  const player: SmokePlayer = {
    playerId,
    sessionId: 'socket:runtime-sync',
    runtimeOwnerId: 'runtime:market:new',
    sessionEpoch: 4,
    inventory: { items: [{ itemId: 'spirit_stone', count: 9 }] },
    wallet: { balances: [{ walletType: 'spirit_stone', balance: 9 }] },
    instanceId: 'instance:market',
  };
  const presenceSaves: Array<{ playerId: string; input: { runtimeOwnerId?: string | null; sessionEpoch?: number | null } }> = [];
  const durableInputs: Array<{ expectedRuntimeOwnerId?: string | null; expectedSessionEpoch?: number | null }> = [];
  const service = new MarketRuntimeService(
    {} as never,
    {
      snapshot(targetPlayerId: string) {
        return targetPlayerId === playerId ? structuredClone(player) : null;
      },
      describePersistencePresence(targetPlayerId: string) {
        return targetPlayerId === playerId
          ? {
              online: true,
              inWorld: true,
              runtimeOwnerId: player.runtimeOwnerId,
              sessionEpoch: player.sessionEpoch,
            }
          : null;
      },
    } as never,
    {} as never,
    {
      isEnabled() {
        return true;
      },
      async settleMarketMutation(input: { expectedRuntimeOwnerId?: string | null; expectedSessionEpoch?: number | null }) {
        durableInputs.push(input);
        return { ok: true, alreadyCommitted: false };
      },
    } as never,
    {
      async getInstanceLeaseContext() {
        return null;
      },
    } as never,
    null,
    null,
    {
      isEnabled() {
        return true;
      },
      async loadPlayerPresence() {
        return {
          runtimeOwnerId: 'runtime:market:old',
          sessionEpoch: 3,
        };
      },
      async savePlayerPresence(savedPlayerId: string, input: { runtimeOwnerId?: string | null; sessionEpoch?: number | null }) {
        presenceSaves.push({ playerId: savedPlayerId, input });
      },
    } as never,
  );

  const context = service.createMutationContext();
  const committed = await service.commitDurableMarketMutationIfAvailable(
    context,
    playerId,
    'market_create_sell_order',
    { operationId: 'runtime-sync-fence' },
  );

  assert.equal(committed, true);
  assert.equal(presenceSaves.length, 1);
  assert.equal(presenceSaves[0]?.playerId, playerId);
  assert.equal(presenceSaves[0]?.input.runtimeOwnerId, 'runtime:market:new');
  assert.equal(presenceSaves[0]?.input.sessionEpoch, 4);
  assert.equal(durableInputs.length, 1);
  assert.equal(durableInputs[0]?.expectedRuntimeOwnerId, 'runtime:market:new');
  assert.equal(durableInputs[0]?.expectedSessionEpoch, 4);
  assert.equal(context.skipPersistence, true);
}

function buildSmokeOrder(orderId: string): Record<string, unknown> {
  const now = Date.now();
  return {
    id: orderId,
    ownerId: 'player:market-session-fence',
    side: 'sell',
    status: 'open',
    itemKey: `${orderId}:rat_tail`,
    item: { itemId: 'rat_tail', count: 1 },
    remainingQuantity: 1,
    unitPrice: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createDurableOperationServiceWithPresence(presenceRow: SmokePresenceRow): {
  service: DurableOperationService;
  presenceRows: SmokePresenceRow[];
  queryLog: string[];
} {
  const presenceRows = [structuredClone(presenceRow)];
  const queryLog: string[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      const normalizedSql = String(sql);
      queryLog.push(normalizedSql.replace(/\s+/g, ' ').trim());
      if (normalizedSql.includes('FROM durable_operation_log') && normalizedSql.includes('SELECT status')) {
        return { rowCount: 0, rows: [] };
      }
      if (normalizedSql.includes('FROM player_presence')) {
        return { rowCount: presenceRows.length, rows: presenceRows };
      }
      if (normalizedSql.includes('INSERT INTO player_presence')) {
        presenceRows[0] = {
          runtime_owner_id: typeof params?.[1] === 'string' ? params[1] : null,
          session_epoch: Number(params?.[2] ?? 0),
        };
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const service = new DurableOperationService(null as never, null as never);
  Object.defineProperty(service, 'enabled', { value: true, configurable: true });
  Object.defineProperty(service, 'pool', {
    value: {
    async connect() {
      return client;
    },
    },
    configurable: true,
  });
  return { service, presenceRows, queryLog };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

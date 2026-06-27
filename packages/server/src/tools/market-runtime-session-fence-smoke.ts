// @ts-nocheck
import assert from 'node:assert/strict';

import { MarketRuntimeService } from '../runtime/market/market-runtime.service';

async function main(): Promise<void> {
  const offlinePlayerId = 'player:market-offline-recipient';
  const onlinePlayerId = 'player:market-online-recipient';
  const received: Array<{ playerId: string; itemId: string; count: number }> = [];
  const flushed: string[] = [];
  const players = new Map<string, Record<string, unknown>>([
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

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

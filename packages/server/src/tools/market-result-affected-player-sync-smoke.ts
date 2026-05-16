// @ts-nocheck
import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';
import { WorldClientEventService } from '../network/world-client-event.service';

async function main(): Promise<void> {
  const emitted: Array<{ playerId: string; event: string; payload: unknown }> = [];
  const sockets = new Map<string, { emit: (event: string, payload: unknown) => void }>();
  for (const playerId of ['player:subscriber', 'player:affected']) {
    sockets.set(playerId, {
      emit(event: string, payload: unknown) {
        emitted.push({ playerId, event, payload });
      },
    });
  }

  const service = new WorldClientEventService(
    { getSummary: async () => ({}) },
    {
      buildMarketOrders(playerId: string) {
        return { playerId, kind: 'orders' };
      },
      buildMarketStorage(playerId: string) {
        return { playerId, kind: 'storage' };
      },
      buildMarketListingsPage(request: unknown) {
        return { request, kind: 'listings' };
      },
      buildAuctionListingsPage(playerId: string, request: unknown) {
        return { playerId, request, kind: 'auctionListings' };
      },
      buildMarketUpdate(playerId: string) {
        return { playerId, kind: 'update' };
      },
    },
    {
      getPlayer(playerId: string) {
        return { playerId, sessionId: `session:${playerId}` };
      },
      enqueueNotice() {
        return undefined;
      },
    },
    { getAll: () => [] },
    {
      getSocketByPlayerId(playerId: string) {
        return sockets.get(playerId) ?? null;
      },
    },
    { openLootWindow: () => ({ window: null }) },
  );

  await service.flushMarketResult(
    new Set(['player:subscriber']),
    {
      affectedPlayerIds: ['player:affected'],
      notices: [],
    },
    {
      marketListingRequests: new Map([['player:subscriber', { page: 3 }]]),
      auctionListingRequests: new Map([['player:subscriber', { tab: 'mine', page: 2 }]]),
      marketTradeHistoryRequests: new Map(),
    },
  );

  const affectedEvents = emitted.filter((entry) => entry.playerId === 'player:affected').map((entry) => entry.event);
  assert.deepEqual(
    affectedEvents,
    [
      S2C.MarketOrders,
      S2C.MarketStorage,
      S2C.MarketListings,
      S2C.AuctionListings,
      S2C.MarketUpdate,
    ],
  );
  const affectedListing = emitted.find((entry) => entry.playerId === 'player:affected' && entry.event === S2C.MarketListings);
  assert.deepEqual((affectedListing?.payload as { request?: unknown } | undefined)?.request, { page: 1 });
  const subscriberEvents = emitted.filter((entry) => entry.playerId === 'player:subscriber').map((entry) => entry.event);
  assert.deepEqual(subscriberEvents, [S2C.MarketListings, S2C.AuctionListings, S2C.MarketUpdate]);

  console.log(JSON.stringify({ ok: true, case: 'market-result-affected-player-sync' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

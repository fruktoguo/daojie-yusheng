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
      buildTransmissionListingsPage(playerId: string, request: unknown) {
        return { playerId, request, kind: 'transmissionListings' };
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
    {
      getSocketByPlayerId(playerId: string) {
        return sockets.get(playerId) ?? null;
      },
    },
    { openLootWindow: () => ({ window: null }) },
    { getAll: () => [] },
  );

  await service.flushMarketResult(
    new Set(['player:subscriber']),
    {
      affectedPlayerIds: ['player:affected'],
      notices: [],
      transmissionListingsChanged: true,
    },
    {
      marketListingRequests: new Map([['player:subscriber', { page: 3 }]]),
      auctionListingRequests: new Map([['player:subscriber', { tab: 'mine', page: 2 }]]),
      transmissionListingRequests: new Map([['player:subscriber', { tab: 'participate', page: 4, sort: 'newest' }]]),
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
  assert.deepEqual(subscriberEvents, [S2C.MarketListings, S2C.AuctionListings, S2C.TransmissionListings, S2C.MarketUpdate]);
  const subscriberTransmission = emitted.find((entry) => entry.playerId === 'player:subscriber' && entry.event === S2C.TransmissionListings);
  assert.deepEqual(
    (subscriberTransmission?.payload as { request?: unknown } | undefined)?.request,
    { tab: 'participate', page: 4, sort: 'newest' },
  );

  emitted.length = 0;
  await service.flushMarketResult(
    new Set(['player:subscriber']),
    { affectedPlayerIds: [], notices: [] },
    {
      marketListingRequests: new Map(),
      auctionListingRequests: new Map(),
      transmissionListingRequests: new Map([['player:subscriber', { page: 4 }]]),
      marketTradeHistoryRequests: new Map(),
    },
  );
  assert.equal(
    emitted.some((entry) => entry.event === S2C.TransmissionListings),
    false,
    '普通坊市变更不应连带推送传法台分页',
  );

  console.log(JSON.stringify({ ok: true, case: 'market-result-affected-player-sync' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// @ts-nocheck

const assert = require('node:assert/strict');

const { S2C } = require('@mud/shared');
const { WorldGatewayBuildingHelper } = require('../network/world-gateway-building.helper');

function createClient(log = [], id = 'socket:building') {
  return {
    id,
    emit(event, payload) {
      log.push(['emit', event, payload]);
    },
  };
}

function createHelper(log = [], options = {}) {
  const playerId = options.playerId ?? 'player:building';
  const results = {
    place: options.placeResult ?? { ok: true, requestId: 'build:req:1' },
    deconstruct: options.deconstructResult ?? { ok: true, requestId: 'deconstruct:req:1' },
  };
  return new WorldGatewayBuildingHelper(
    {
      requirePlayerId(client) {
        log.push(['requirePlayerId', client.id]);
        return playerId;
      },
    },
    {
      handleBuildPlaceIntent(inputPlayerId, payload) {
        log.push(['handleBuildPlaceIntent', inputPlayerId, payload?.requestId ?? null]);
        return results.place;
      },
      handleBuildDeconstructIntent(inputPlayerId, payload) {
        log.push(['handleBuildDeconstructIntent', inputPlayerId, payload?.requestId ?? null]);
        return results.deconstruct;
      },
      buildCurrentRoomSummaryPatch(inputPlayerId) {
        log.push(['buildCurrentRoomSummaryPatch', inputPlayerId]);
        return { instanceId: 'sect:building:main', revision: 2, adds: [], updates: [], removes: [] };
      },
    },
    {
      emitGatewayError(client, code, error) {
        log.push(['emitGatewayError', client.id, code, error instanceof Error ? error.message : String(error)]);
      },
    },
    {
      emitDeltaSync(inputPlayerId, client) {
        log.push(['emitDeltaSync', inputPlayerId, client.id]);
      },
    },
  );
}

function testBuildPlacePushesDeltaAfterSuccess() {
  const log = [];
  const helper = createHelper(log);
  const client = createClient(log);

  helper.handleBuildPlaceIntent(client, { requestId: 'build:req:1' });

  assert.deepEqual(log, [
    ['requirePlayerId', 'socket:building'],
    ['handleBuildPlaceIntent', 'player:building', 'build:req:1'],
    ['emit', S2C.BuildResult, { ok: true, requestId: 'build:req:1' }],
    ['buildCurrentRoomSummaryPatch', 'player:building'],
    ['emit', S2C.RoomSummaryPatch, { instanceId: 'sect:building:main', revision: 2, adds: [], updates: [], removes: [] }],
    ['emitDeltaSync', 'player:building', 'socket:building'],
  ]);
}

function testBuildDeconstructPushesDeltaAfterSuccess() {
  const log = [];
  const helper = createHelper(log);
  const client = createClient(log);

  helper.handleBuildDeconstruct(client, { requestId: 'deconstruct:req:1' });

  assert.deepEqual(log, [
    ['requirePlayerId', 'socket:building'],
    ['handleBuildDeconstructIntent', 'player:building', 'deconstruct:req:1'],
    ['emit', S2C.BuildResult, { ok: true, requestId: 'deconstruct:req:1' }],
    ['buildCurrentRoomSummaryPatch', 'player:building'],
    ['emit', S2C.RoomSummaryPatch, { instanceId: 'sect:building:main', revision: 2, adds: [], updates: [], removes: [] }],
    ['emitDeltaSync', 'player:building', 'socket:building'],
  ]);
}

function testFailedBuildDoesNotPushDelta() {
  const log = [];
  const helper = createHelper(log, {
    deconstructResult: { ok: false, requestId: 'deconstruct:req:missing', reason: 'building_not_found' },
  });
  const client = createClient(log);

  helper.handleBuildDeconstruct(client, { requestId: 'deconstruct:req:missing' });

  assert.deepEqual(log, [
    ['requirePlayerId', 'socket:building'],
    ['handleBuildDeconstructIntent', 'player:building', 'deconstruct:req:missing'],
    ['emit', S2C.BuildResult, { ok: false, requestId: 'deconstruct:req:missing', reason: 'building_not_found' }],
  ]);
}

testBuildPlacePushesDeltaAfterSuccess();
testBuildDeconstructPushesDeltaAfterSuccess();
testFailedBuildDoesNotPushDelta();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-building-helper' }, null, 2));

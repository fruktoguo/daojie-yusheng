// @ts-nocheck

const assert = require('node:assert/strict');

const { S2C } = require('@mud/shared');
const { WorldGatewayInventoryHelper } = require('../network/world-gateway-inventory.helper');

function createGateway(log = [], playerId = 'player:1') {
  const runtime = {
    worldRuntimeCommandIntakeFacadeService: {
      enqueueTakeGround(inputPlayerId, sourceId, itemKey, deps) {
        log.push(['enqueueTakeGround', inputPlayerId, sourceId, itemKey, deps === runtime]);
      },
      enqueueTakeGroundAll(inputPlayerId, sourceId, deps) {
        log.push(['enqueueTakeGroundAll', inputPlayerId, sourceId, deps === runtime]);
      },
      enqueueStartTechniqueActivity(inputPlayerId, kind, payload, deps) {
        log.push(['enqueueStartTechniqueActivity', inputPlayerId, kind, payload, deps === runtime]);
      },
      enqueueCancelTechniqueActivity(inputPlayerId, kind, deps) {
        log.push(['enqueueCancelTechniqueActivity', inputPlayerId, kind, deps === runtime]);
      },
    },
  };
  return {
    gatewayGuardHelper: {
      requirePlayerId() {
        return playerId;
      },
    },
    playerRuntimeService: {
      clearLootWindow(inputPlayerId) {
        log.push(['clearLootWindow', inputPlayerId]);
      },
    },
    worldClientEventService: {
      markProtocol(client, protocol) {
        log.push(['markProtocol', client.id, protocol]);
      },
      emitGatewayError(client, code, error) {
        log.push(['emitGatewayError', client.id, code, error instanceof Error ? error.message : String(error)]);
      },
    },
    worldRuntimeService: runtime,
  };
}

function createClient(log = [], id = 'socket:1') {
  return {
    id,
    emit(event, payload) {
      log.push(['emit', event, payload]);
    },
  };
}

function testInventoryGatherRouting() {
  const log = [];
  const gateway = createGateway(log);
  const helper = new WorldGatewayInventoryHelper(gateway);
  const client = createClient(log);

  helper.handleTakeGround(client, { sourceId: 'ground:1', itemKey: 'item:1', takeAll: false });
  helper.handleTakeGround(client, { sourceId: 'container:1', takeAll: true });
  helper.handleStartGather(client, { sourceId: 'container:inst:herb', itemKey: 'item:herb' });
  helper.handleCancelGather(client, {});
  helper.handleStopLootHarvest(client, {});

  assert.deepEqual(log, [
    ['enqueueTakeGround', 'player:1', 'ground:1', 'item:1', true],
    ['enqueueTakeGroundAll', 'player:1', 'container:1', true],
    ['markProtocol', 'socket:1', 'mainline'],
    ['enqueueStartTechniqueActivity', 'player:1', 'gather', { sourceId: 'container:inst:herb', itemKey: 'item:herb' }, true],
    ['markProtocol', 'socket:1', 'mainline'],
    ['enqueueCancelTechniqueActivity', 'player:1', 'gather', true],
    ['clearLootWindow', 'player:1'],
    ['emit', S2C.LootWindowUpdate, { window: null }],
  ]);
}

function testInventoryGatewayErrors() {
  const log = [];
  const gateway = createGateway(log);
  gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity = () => {
    throw new Error('start gather failed');
  };
  gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity = () => {
    throw new Error('cancel gather failed');
  };
  const helper = new WorldGatewayInventoryHelper(gateway);
  const client = createClient(log);

  helper.handleStartGather(client, { sourceId: 'container:inst:herb' });
  helper.handleCancelGather(client, {});

  assert.deepEqual(log, [
    ['markProtocol', 'socket:1', 'mainline'],
    ['emitGatewayError', 'socket:1', 'START_GATHER_FAILED', 'start gather failed'],
    ['markProtocol', 'socket:1', 'mainline'],
    ['emitGatewayError', 'socket:1', 'CANCEL_GATHER_FAILED', 'cancel gather failed'],
  ]);
}

testInventoryGatherRouting();
testInventoryGatewayErrors();

console.log(JSON.stringify({ ok: true, case: 'world-gateway-inventory-helper' }, null, 2));

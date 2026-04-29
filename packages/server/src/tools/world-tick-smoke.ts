// @ts-nocheck

const assert = require('node:assert/strict');

const { gameplayConstants } = require('@mud/shared');
const { WorldTickService } = require('../runtime/tick/world-tick.service');

async function testAwaitsAdvanceFrameBeforeSyncFlush() {
  const log = [];
  let resolveFrame = () => {};

  const service = new WorldTickService(
    {
      flushQueuedStatePushes() {
        log.push('flushQueuedStatePushes');
      },
    },
    {
      isRuntimeMaintenanceActive() {
        return false;
      },
    },
    {
      getMapTickSpeed(mapId) {
        log.push(['getMapTickSpeed', mapId]);
        return 1;
      },
    },
    {
      advanceFrame(frameDurationMs, getMapTickSpeed) {
        log.push(['advanceFrame:start', frameDurationMs, getMapTickSpeed('instance:1')]);
        return new Promise((resolve) => {
          resolveFrame = () => {
            log.push('advanceFrame:resolved');
            resolve(undefined);
          };
        });
      },
      recordSyncFlushDuration(durationMs) {
        log.push(['recordSyncFlushDuration', typeof durationMs]);
      },
    },
    {
      flushConnectedPlayers() {
        log.push('flushConnectedPlayers');
      },
    },
  );

  const tickPromise = service.runTickOnce();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(log, [
    ['getMapTickSpeed', 'instance:1'],
    ['advanceFrame:start', gameplayConstants.WORLD_TICK_INTERVAL_MS, 1],
  ]);

  resolveFrame();
  await tickPromise;

  assert.deepEqual(log, [
    ['getMapTickSpeed', 'instance:1'],
    ['advanceFrame:start', gameplayConstants.WORLD_TICK_INTERVAL_MS, 1],
    'advanceFrame:resolved',
    'flushConnectedPlayers',
    ['recordSyncFlushDuration', 'number'],
    'flushQueuedStatePushes',
  ]);
}

async function testTickInFlightPreventsReentry() {
  const log = [];
  let resolveFrame = () => {};

  const service = new WorldTickService(
    {
      flushQueuedStatePushes() {
        log.push('flushQueuedStatePushes');
      },
    },
    {
      isRuntimeMaintenanceActive() {
        return false;
      },
    },
    {
      getMapTickSpeed() {
        return 1;
      },
    },
    {
      advanceFrame() {
        log.push('advanceFrame:start');
        return new Promise((resolve) => {
          resolveFrame = () => {
            log.push('advanceFrame:resolved');
            resolve(undefined);
          };
        });
      },
      recordSyncFlushDuration() {
        log.push('recordSyncFlushDuration');
      },
    },
    {
      flushConnectedPlayers() {
        log.push('flushConnectedPlayers');
      },
    },
  );

  const first = service.runTickOnce();
  await new Promise((resolve) => setImmediate(resolve));
  const second = service.runTickOnce();
  await second;

  assert.deepEqual(log, ['advanceFrame:start']);

  resolveFrame();
  await first;

  assert.deepEqual(log, [
    'advanceFrame:start',
    'advanceFrame:resolved',
    'flushConnectedPlayers',
    'recordSyncFlushDuration',
    'flushQueuedStatePushes',
  ]);
}

async function testMaintenanceSkipsFrameAndSync() {
  const log = [];

  const service = new WorldTickService(
    {
      flushQueuedStatePushes() {
        log.push('flushQueuedStatePushes');
      },
    },
    {
      isRuntimeMaintenanceActive() {
        log.push('isRuntimeMaintenanceActive');
        return true;
      },
    },
    {
      getMapTickSpeed() {
        log.push('getMapTickSpeed');
        return 1;
      },
    },
    {
      advanceFrame() {
        log.push('advanceFrame');
      },
      recordSyncFlushDuration() {
        log.push('recordSyncFlushDuration');
      },
    },
    {
      flushConnectedPlayers() {
        log.push('flushConnectedPlayers');
      },
    },
  );

  await service.runTickOnce();
  assert.deepEqual(log, ['isRuntimeMaintenanceActive']);
}

Promise.resolve()
  .then(() => testAwaitsAdvanceFrameBeforeSyncFlush())
  .then(() => testTickInFlightPreventsReentry())
  .then(() => testMaintenanceSkipsFrameAndSync())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-tick' }, null, 2));
  });

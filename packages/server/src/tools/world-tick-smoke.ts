import assert from 'node:assert/strict';

import { gameplayConstants } from '@mud/shared';

import { WorldTickService } from '../runtime/tick/world-tick.service';

type TickLogEntry = string | [string, number | string];
function runTickOnce(service: WorldTickService): Promise<void> {
  return (service as unknown as { runTickOnce(): Promise<void> }).runTickOnce();
}

function createEventBus(log: TickLogEntry[]) {
  return {
    flushTick(): void {
      log.push('flushEventBus');
    },
  };
}

async function testAwaitsAdvanceFrameBeforeSyncFlush(): Promise<void> {
  const log: TickLogEntry[] = [];
  let resolveFrame = (): void => {};

  const service = new WorldTickService(
    createEventBus(log),
    {
      isRuntimeMaintenanceActive(): boolean {
        return false;
      },
    },
    {
      getMapTickSpeed(mapId: string): number {
        log.push(['getMapTickSpeed', mapId]);
        return 1;
      },
    },
    {
      advanceFrame(frameDurationMs: number, getMapTickSpeed: (mapId: string) => number): Promise<void> {
        log.push(['advanceFrame:start', frameDurationMs]);
        log.push(['tickSpeed', getMapTickSpeed('instance:1')]);
        return new Promise((resolve) => {
          resolveFrame = () => {
            log.push('advanceFrame:resolved');
            resolve();
          };
        });
      },
      recordSyncFlushDuration(durationMs: number): void {
        log.push(['recordSyncFlushDuration', typeof durationMs]);
      },
    },
    {
      flushConnectedPlayers(): void {
        log.push('flushConnectedPlayers');
      },
    },
  );

  const tickPromise = runTickOnce(service);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(log, [
    ['advanceFrame:start', gameplayConstants.WORLD_TICK_INTERVAL_MS],
    ['getMapTickSpeed', 'instance:1'],
    ['tickSpeed', 1],
  ]);

  resolveFrame();
  await tickPromise;

  assert.deepEqual(log, [
    ['advanceFrame:start', gameplayConstants.WORLD_TICK_INTERVAL_MS],
    ['getMapTickSpeed', 'instance:1'],
    ['tickSpeed', 1],
    'advanceFrame:resolved',
    'flushConnectedPlayers',
    ['recordSyncFlushDuration', 'number'],
    'flushEventBus',
  ]);
}

async function testTickInFlightPreventsReentry(): Promise<void> {
  const log: TickLogEntry[] = [];
  let resolveFrame = (): void => {};

  const service = new WorldTickService(
    createEventBus(log),
    {
      isRuntimeMaintenanceActive(): boolean {
        return false;
      },
    },
    {
      getMapTickSpeed(): number {
        return 1;
      },
    },
    {
      advanceFrame(): Promise<void> {
        log.push('advanceFrame:start');
        return new Promise((resolve) => {
          resolveFrame = () => {
            log.push('advanceFrame:resolved');
            resolve();
          };
        });
      },
      recordSyncFlushDuration(): void {
        log.push('recordSyncFlushDuration');
      },
    },
    {
      flushConnectedPlayers(): void {
        log.push('flushConnectedPlayers');
      },
    },
  );

  const first = runTickOnce(service);
  await new Promise((resolve) => setImmediate(resolve));
  const second = runTickOnce(service);
  await second;

  assert.deepEqual(log, ['advanceFrame:start']);

  resolveFrame();
  await first;

  assert.deepEqual(log, [
    'advanceFrame:start',
    'advanceFrame:resolved',
    'flushConnectedPlayers',
    'recordSyncFlushDuration',
    'flushEventBus',
  ]);
}

async function testMaintenanceSkipsFrameAndSync(): Promise<void> {
  const log: TickLogEntry[] = [];

  const service = new WorldTickService(
    createEventBus(log),
    {
      isRuntimeMaintenanceActive(): boolean {
        log.push('isRuntimeMaintenanceActive');
        return true;
      },
    },
    {
      getMapTickSpeed(): number {
        log.push('getMapTickSpeed');
        return 1;
      },
    },
    {
      advanceFrame(): void {
        log.push('advanceFrame');
      },
      recordSyncFlushDuration(): void {
        log.push('recordSyncFlushDuration');
      },
    },
    {
      flushConnectedPlayers(): void {
        log.push('flushConnectedPlayers');
      },
    },
  );

  await runTickOnce(service);
  assert.deepEqual(log, ['isRuntimeMaintenanceActive']);
}

async function testShutdownWaitsForInFlightTickAndBlocksNewTicks(): Promise<void> {
  const log: TickLogEntry[] = [];
  let resolveFrame = (): void => {};

  const service = new WorldTickService(
    createEventBus(log),
    {
      isRuntimeMaintenanceActive(): boolean {
        return false;
      },
    },
    {
      getMapTickSpeed(): number {
        return 1;
      },
    },
    {
      advanceFrame(): Promise<void> {
        log.push('advanceFrame:start');
        return new Promise((resolve) => {
          resolveFrame = () => {
            log.push('advanceFrame:resolved');
            resolve();
          };
        });
      },
      recordSyncFlushDuration(): void {
        log.push('recordSyncFlushDuration');
      },
    },
    {
      flushConnectedPlayers(): void {
        log.push('flushConnectedPlayers');
      },
    },
  );

  const tickPromise = runTickOnce(service);
  await new Promise((resolve) => setImmediate(resolve));
  const shutdownPromise = service.beforeApplicationShutdown();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, ['advanceFrame:start']);

  resolveFrame();
  await Promise.all([tickPromise, shutdownPromise]);
  await runTickOnce(service);

  assert.deepEqual(log, [
    'advanceFrame:start',
    'advanceFrame:resolved',
    'flushConnectedPlayers',
    'recordSyncFlushDuration',
    'flushEventBus',
  ]);
}

Promise.resolve()
  .then(() => testAwaitsAdvanceFrameBeforeSyncFlush())
  .then(() => testTickInFlightPreventsReentry())
  .then(() => testMaintenanceSkipsFrameAndSync())
  .then(() => testShutdownWaitsForInFlightTickAndBlocksNewTicks())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-tick' }, null, 2));
  });

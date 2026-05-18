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
      isMapPaused(_mapId: string): boolean {
        return false;
      },
    },
    {
      advanceFrame(frameDurationMs: number, _getMapTickSpeed: unknown): Promise<void> {
        log.push(['advanceFrame:start', frameDurationMs]);
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
  ]);

  resolveFrame();
  await tickPromise;

  assert.deepEqual(log, [
    ['advanceFrame:start', gameplayConstants.WORLD_TICK_INTERVAL_MS],
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
      isMapPaused(_mapId: string): boolean {
        return false;
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
      isMapPaused(_mapId: string): boolean {
        return false;
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
      isMapPaused(_mapId: string): boolean {
        return false;
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

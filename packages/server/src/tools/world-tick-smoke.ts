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
  const shutdownPromise = service.stopForShutdown();
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

async function testAcceleratedFramesUseScopedSyncAndKeepOneHertzGlobalFlush(): Promise<void> {
  const log: TickLogEntry[] = [];
  const instance = {
    meta: { instanceId: 'instance:accelerated', runtimeStatus: 'running', status: 'active' },
    tickSpeed: 10,
    paused: false,
  };
  const plan = { instanceId: 'instance:accelerated', instance, steps: 1, speed: 10 };
  const service = new WorldTickService(
    {
      flushTick(): void { log.push('flushEventBus'); },
      flushInstance(instanceId: string): void { log.push(['flushInstance', instanceId]); },
    },
    { isRuntimeMaintenanceActive(): boolean { return false; } },
    { getMapTickSpeed(): number { return 1; }, isMapPaused(): boolean { return false; } },
    {
      advanceFrame(): void { log.push('advanceFrame'); },
      recordSyncFlushDuration(): void { log.push('recordSyncFlushDuration'); },
      getInstanceRuntime(): typeof instance { return instance; },
    },
    {
      flushConnectedPlayers(): void { log.push('flushConnectedPlayers'); },
      flushPlayerIds(playerIds: Iterable<string>): void {
        log.push(['flushPlayerIds', Array.from(playerIds).sort().join(',')]);
      },
    },
    undefined,
    undefined,
    {
      collectDue(): Array<typeof plan> { return [plan]; },
      resolveNextDelayMs(): number { return 100; },
    } as never,
    { listInstancePlayerIds(): string[] { return ['player:accelerated']; } },
  );
  const internals = service as unknown as { lastFullSyncStartedAt: number };
  internals.lastFullSyncStartedAt = performance.now();
  await runTickOnce(service);
  assert.deepEqual(log, [
    'advanceFrame',
    ['flushPlayerIds', 'player:accelerated'],
    'recordSyncFlushDuration',
    ['flushInstance', 'instance:accelerated'],
  ]);

  log.length = 0;
  internals.lastFullSyncStartedAt = performance.now() - gameplayConstants.WORLD_TICK_INTERVAL_MS - 1;
  await runTickOnce(service);
  assert.deepEqual(log, [
    'advanceFrame',
    'flushConnectedPlayers',
    'recordSyncFlushDuration',
    'flushEventBus',
  ]);
}

async function testScheduleChangeImmediatelyReordersWakeTimer(): Promise<void> {
  let nextDelayMs = 1_000;
  let scheduleChangedListener: (() => void) | null = null;
  const scheduleService = {
    setScheduleChangedListener(listener: (() => void) | null): void {
      scheduleChangedListener = listener;
    },
    rebuild(): void {
      assert.equal(scheduleChangedListener, null, '启动重建 deadline 时不得提前安装监听器并创建重复 timer');
    },
    resolveNextDelayMs(): number { return nextDelayMs; },
    collectDue(): [] { return []; },
  };
  const service = new WorldTickService(
    { flushTick(): void {} },
    { isRuntimeMaintenanceActive(): boolean { return false; } },
    { getMapTickSpeed(): number { return 1; }, isMapPaused(): boolean { return false; } },
    {
      advanceFrame(): void {},
      recordSyncFlushDuration(): void {},
      listInstanceEntries(): [] { return []; },
      getInstanceRuntime(): null { return null; },
    },
    { flushConnectedPlayers(): void {} },
    undefined,
    undefined,
    scheduleService as never,
  );

  service.startForLifecycleCoordinator();
  const firstTimer = (service as unknown as { timer: ReturnType<typeof setTimeout> | null }).timer;
  assert.ok(firstTimer);
  assert.equal(typeof scheduleChangedListener, 'function');

  nextDelayMs = 100;
  (scheduleChangedListener as () => void)();
  const reorderedTimer = (service as unknown as { timer: ReturnType<typeof setTimeout> | null }).timer;
  assert.ok(reorderedTimer);
  assert.notEqual(reorderedTimer, firstTimer, '实例升速后必须立即替换旧的一秒唤醒定时器');

  await service.stopForShutdown();
  assert.equal(scheduleChangedListener, null, '关停后必须解除调度变更监听');
}

Promise.resolve()
  .then(() => testAwaitsAdvanceFrameBeforeSyncFlush())
  .then(() => testTickInFlightPreventsReentry())
  .then(() => testMaintenanceSkipsFrameAndSync())
  .then(() => testShutdownWaitsForInFlightTickAndBlocksNewTicks())
  .then(() => testAcceleratedFramesUseScopedSyncAndKeepOneHertzGlobalFlush())
  .then(() => testScheduleChangeImmediatelyReordersWakeTimer())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-tick' }, null, 2));
  });

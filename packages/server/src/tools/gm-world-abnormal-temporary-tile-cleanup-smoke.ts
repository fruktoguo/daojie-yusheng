import assert from 'node:assert/strict';

import { NativeGmWorldService } from '../http/native/native-gm-world.service';

type CleanupInstance = Record<string, unknown> & {
  tick: number;
  meta: { instanceId: string; persistent: boolean };
  removeAbnormalTemporaryTiles(currentTick?: number): { scanned: number; removed: number };
};

function createService(): {
  service: NativeGmWorldService;
  flushed: string[];
  calls: Array<[string, number | undefined]>;
} {
  const flushed: string[] = [];
  const calls: Array<[string, number | undefined]> = [];
  const service = Object.create(NativeGmWorldService.prototype) as NativeGmWorldService;
  const persistentAffected: CleanupInstance = {
    tick: 10,
    meta: { instanceId: 'public:affected', persistent: true },
    removeAbnormalTemporaryTiles(currentTick?: number): { scanned: number; removed: number } {
      calls.push(['public:affected', currentTick]);
      return { scanned: 2, removed: 3 };
    },
  };
  const persistentClean: CleanupInstance = {
    tick: 20,
    meta: { instanceId: 'public:clean', persistent: true },
    removeAbnormalTemporaryTiles(currentTick?: number): { scanned: number; removed: number } {
      calls.push(['public:clean', currentTick]);
      return { scanned: 1, removed: 0 };
    },
  };
  const nonPersistentAffected: CleanupInstance = {
    tick: 30,
    meta: { instanceId: 'line:affected', persistent: false },
    removeAbnormalTemporaryTiles(currentTick?: number): { scanned: number; removed: number } {
      calls.push(['line:affected', currentTick]);
      return { scanned: 1, removed: 2 };
    },
  };

  Reflect.set(service, 'mapPersistenceFlushService', {
    async flushInstance(instanceId: string): Promise<void> {
      flushed.push(instanceId);
    },
  });
  Reflect.set(service, 'worldRuntimeService', {
    listInstanceEntries(): Iterable<[string, Record<string, unknown>]> {
      const entries: Array<[string, Record<string, unknown>]> = [
        ['entry:affected', persistentAffected],
        ['entry:clean', persistentClean],
        ['entry:line', nonPersistentAffected],
      ];
      return entries.values();
    },
  });

  return { service, flushed, calls };
}

async function main(): Promise<void> {
  const { service, flushed, calls } = createService();
  const payload = await service.cleanupAbnormalTemporaryTiles();
  assert.deepEqual(payload, {
    ok: true,
    totalPlayers: 0,
    queuedRuntimePlayers: 0,
    updatedOfflinePlayers: 0,
    scannedInstances: 3,
    affectedInstances: 2,
    removedTemporaryTiles: 5,
    flushedInstances: 1,
  });
  assert.deepEqual(flushed, ['public:affected']);
  assert.deepEqual(calls, [
    ['public:affected', 10],
    ['public:clean', 20],
    ['line:affected', 30],
  ]);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-abnormal-temporary-tile-cleanup',
    removedTemporaryTiles: payload.removedTemporaryTiles,
    flushed,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

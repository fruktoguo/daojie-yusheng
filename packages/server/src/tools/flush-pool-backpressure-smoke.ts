import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';

function createFlushPoolBackpressureProvider(waitingCount: number) {
  return {
    getPoolStats(name: string) {
      if (name !== 'flush') {
        return { totalCount: 0, idleCount: 0, waitingCount: 0 };
      }
      return { totalCount: 8, idleCount: 0, waitingCount };
    },
  };
}

async function main(): Promise<void> {
  const playerPersistCalls: string[] = [];
  const mapFlushCalls: string[] = [];

  const playerRuntimeService = {
    listDirtyPlayers() {
      return ['player:backpressure'];
    },
    listDirtyPlayerDomains() {
      return new Map([['player:backpressure', new Set(['inventory'])]]);
    },
    buildPersistenceSnapshot() {
      return { version: 1, savedAt: Date.now() };
    },
    markPersisted() {
      playerPersistCalls.push('markPersisted');
    },
    describePersistencePresence() {
      return null;
    },
    getPersistenceRevision() {
      return 1;
    },
  };

  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async savePlayerSnapshotProjectionDomains(playerId: string) {
      playerPersistCalls.push(playerId);
    },
    async savePlayerPresence(playerId: string) {
      playerPersistCalls.push(`presence:${playerId}`);
    },
    async hasRecoveryWatermark() {
      return false;
    },
    async updatePlayerOfflineGainAccumulated() {
      return undefined;
    },
  };

  const mapRuntimeService = {
    listDirtyPersistentInstanceDomains() {
      return [
        { instanceId: 'map:backpressure', domains: ['tile_damage'] },
      ];
    },
    async flushInstanceDomains(instanceId: string) {
      mapFlushCalls.push(instanceId);
      return { skipped: false, persistedDomains: ['tile_damage'] };
    },
  };

  const backpressureProvider = createFlushPoolBackpressureProvider(5);

  const playerFlushService = new PlayerPersistenceFlushService(
    playerRuntimeService as never,
    playerDomainPersistenceService as never,
    undefined,
    backpressureProvider as never,
  );

  const mapFlushService = new MapPersistenceFlushService(
    mapRuntimeService as never,
    backpressureProvider as never,
    { reportMapFlush() { return undefined; } } as never,
  );

  await playerFlushService.flushDirtyPlayers();
  await mapFlushService.flushDirtyInstances();

  assert.deepEqual(playerPersistCalls, []);
  assert.deepEqual(mapFlushCalls, []);

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'flush-pool-backpressure',
        answers: 'flush 池 waitingCount 高于阈值时，玩家和地图 interval 刷盘会先退避，不再继续向 DB 提交写入。',
        excludes: '不证明真实 PG 压力曲线，只证明限流门控能拦住本轮刷盘。',
        completionMapping: 'persistence-root-fix.phase5.flush-backpressure',
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

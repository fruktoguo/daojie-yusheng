import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldSessionReaperService, WORLD_SESSION_REAPER_CONTRACT } from '../network/world-session-reaper.service';
import { WorldSessionService } from '../network/world-session.service';

async function main(): Promise<void> {
  const successProof = await runReaperSuccessProof();
  const retryProof = await runReaperRetryProof();
  const runtimeRetainAfterReaperProof = await runDetachedRuntimeRetainAfterReaperProof();
  const activeRuntimeRetainProof = await runActiveDetachedRuntimeRetainProof();

  console.log(
    JSON.stringify(
      {
        ok: true,
        successProof,
        retryProof,
        runtimeRetainAfterReaperProof,
        activeRuntimeRetainProof,
        answers:
          '已直接证明 detached session 过期后，reaper 会先 flushPlayer，再按当前 sessionEpoch 清本地 route，最后清 detached caches，但不会卸载玩家运行态或把离线挂机降级为普通离线；flush 失败时会重试且不会提前清 route/caches/runtime。',
        excludes: '不证明真实 socket 连接、gateway bootstrap 或跨节点 redirect，只证明 expired detached session 的 route cleanup 顺序与重试语义。',
        completionMapping: 'release:proof:world-session-reaper-route',
      },
      null,
      2,
    ),
  );
}

async function runReaperSuccessProof(): Promise<{
  playerId: string;
  flushed: string[];
  routeCleared: Array<[string, number | null]>;
  cleared: string[];
}> {
  const service = new WorldSessionService();
  (service as unknown as { sessionDetachExpireMs: number }).sessionDetachExpireMs = 0;

  const playerId = `reaper_route_ok_${Date.now().toString(36)}`;
  const socket = createMockSocket('reaper-route-ok');
  service.registerSocket(socket, playerId);
  service.rememberSessionEpoch(playerId, 7);

  const detachedBinding = service.unregisterSocket(socket.id);
  if (!detachedBinding || detachedBinding.connected) {
    throw new Error(`expected detached binding for reaper route success proof, got ${JSON.stringify(detachedBinding)}`);
  }

  await delay(20);

  const flushed: string[] = [];
  const routeCleared: Array<[string, number | null]> = [];
  const cleared: string[] = [];
  const steps: Array<[string, string] | [string, string, number | null]> = [];
  const reaper = new WorldSessionReaperService(
    service,
    {
      clearDetachedPlayerCaches(targetPlayerId: string) {
        steps.push(['clearDetachedPlayerCaches', targetPlayerId]);
        cleared.push(targetPlayerId);
      },
    } as never,
    {
      async flushPlayer(targetPlayerId: string) {
        steps.push(['flushPlayer', targetPlayerId]);
        flushed.push(targetPlayerId);
      },
    } as never,
    {
      async clearLocalRoute(targetPlayerId: string, sessionEpoch?: number | null) {
        steps.push(['clearLocalRoute', targetPlayerId, sessionEpoch ?? null]);
        routeCleared.push([targetPlayerId, sessionEpoch ?? null]);
      },
    } as never,
    {
      getPlayer() {
        return null;
      },
    } as never,
  );

  await reaper.reapExpiredSessions();

  assert.deepEqual(flushed, [playerId]);
  assert.deepEqual(routeCleared, [[playerId, 7]]);
  assert.deepEqual(cleared, [playerId]);
  assert.deepEqual(steps, [
    ['flushPlayer', playerId],
    ['clearLocalRoute', playerId, 7],
    ['clearDetachedPlayerCaches', playerId],
  ]);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.unloadIdleDetachedRuntimeAfterFlush, false);

  return { playerId, flushed, routeCleared, cleared };
}

async function runReaperRetryProof(): Promise<{
  playerId: string;
  flushAttempts: number;
  routeCleared: Array<[string, number | null]>;
  cleared: string[];
}> {
  const service = new WorldSessionService();
  (service as unknown as { sessionDetachExpireMs: number }).sessionDetachExpireMs = 0;

  const playerId = `reaper_route_retry_${Date.now().toString(36)}`;
  const socket = createMockSocket('reaper-route-retry');
  service.registerSocket(socket, playerId);
  service.rememberSessionEpoch(playerId, 11);

  const detachedBinding = service.unregisterSocket(socket.id);
  if (!detachedBinding || detachedBinding.connected) {
    throw new Error(`expected detached binding for reaper route retry proof, got ${JSON.stringify(detachedBinding)}`);
  }

  await delay(20);

  let flushAttempts = 0;
  const routeCleared: Array<[string, number | null]> = [];
  const cleared: string[] = [];
  const steps: Array<[string, string] | [string, string, number | null]> = [];
  const reaper = new WorldSessionReaperService(
    service,
    {
      clearDetachedPlayerCaches(targetPlayerId: string) {
        steps.push(['clearDetachedPlayerCaches', targetPlayerId]);
        cleared.push(targetPlayerId);
      },
    } as never,
    {
      async flushPlayer(targetPlayerId: string) {
        steps.push(['flushPlayer', targetPlayerId]);
        flushAttempts += 1;
        if (flushAttempts === 1) {
          throw new Error('simulated_flush_failure');
        }
      },
    } as never,
    {
      async clearLocalRoute(targetPlayerId: string, sessionEpoch?: number | null) {
        steps.push(['clearLocalRoute', targetPlayerId, sessionEpoch ?? null]);
        routeCleared.push([targetPlayerId, sessionEpoch ?? null]);
      },
    } as never,
    {
      getPlayer() {
        return null;
      },
    } as never,
  );

  await reaper.reapExpiredSessions();
  assert.equal(flushAttempts, 1);
  assert.deepEqual(routeCleared, []);
  assert.deepEqual(cleared, []);

  await reaper.reapExpiredSessions();
  assert.equal(flushAttempts, 2);
  assert.deepEqual(routeCleared, [[playerId, 11]]);
  assert.deepEqual(cleared, [playerId]);
  assert.deepEqual(steps, [
    ['flushPlayer', playerId],
    ['flushPlayer', playerId],
    ['clearLocalRoute', playerId, 11],
    ['clearDetachedPlayerCaches', playerId],
  ]);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.clearLocalRouteAfterFlush, true);

  return { playerId, flushAttempts, routeCleared, cleared };
}

async function runDetachedRuntimeRetainAfterReaperProof(): Promise<{
  playerId: string;
  disconnected: string[];
  removed: string[];
}> {
  const service = new WorldSessionService();
  (service as unknown as { sessionDetachExpireMs: number }).sessionDetachExpireMs = 0;

  const playerId = `reaper_runtime_retain_idle_${Date.now().toString(36)}`;
  const socket = createMockSocket('reaper-runtime-retain-idle');
  service.registerSocket(socket, playerId);
  service.rememberSessionEpoch(playerId, 13);
  const detachedBinding = service.unregisterSocket(socket.id);
  if (!detachedBinding || detachedBinding.connected) {
    throw new Error(`expected detached binding for idle runtime unload proof, got ${JSON.stringify(detachedBinding)}`);
  }

  await delay(20);

  const disconnected: string[] = [];
  const removed: string[] = [];
  const playerRuntimeService = {
    getPlayer() {
      return { sessionId: null };
    },
    removePlayerRuntime(targetPlayerId: string) {
      removed.push(targetPlayerId);
    },
  };
  const worldSyncService = createWorldSyncServiceForRuntimeRetainProof(disconnected, removed);
  const reaper = new WorldSessionReaperService(
    service,
    worldSyncService as never,
    { async flushPlayer() {} } as never,
    { async clearLocalRoute() {} } as never,
    playerRuntimeService as never,
  );

  await reaper.reapExpiredSessions();

  assert.deepEqual(disconnected, []);
  assert.deepEqual(removed, []);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.unloadIdleDetachedRuntimeAfterFlush, false);
  return { playerId, disconnected, removed };
}

async function runActiveDetachedRuntimeRetainProof(): Promise<{
  playerId: string;
  disconnected: string[];
  removed: string[];
}> {
  const service = new WorldSessionService();
  (service as unknown as { sessionDetachExpireMs: number }).sessionDetachExpireMs = 0;

  const playerId = `reaper_runtime_retain_${Date.now().toString(36)}`;
  const socket = createMockSocket('reaper-runtime-retain');
  service.registerSocket(socket, playerId);
  service.rememberSessionEpoch(playerId, 17);
  const detachedBinding = service.unregisterSocket(socket.id);
  if (!detachedBinding || detachedBinding.connected) {
    throw new Error(`expected detached binding for active runtime retain proof, got ${JSON.stringify(detachedBinding)}`);
  }

  await delay(20);

  const disconnected: string[] = [];
  const removed: string[] = [];
  const playerRuntimeService = {
    getPlayer() {
      return { sessionId: null };
    },
    removePlayerRuntime(targetPlayerId: string) {
      removed.push(targetPlayerId);
    },
  };
  const worldSyncService = createWorldSyncServiceForRuntimeRetainProof(disconnected, removed);
  const reaper = new WorldSessionReaperService(
    service,
    worldSyncService as never,
    { async flushPlayer() {} } as never,
    { async clearLocalRoute() {} } as never,
    playerRuntimeService as never,
  );

  await reaper.reapExpiredSessions();

  assert.deepEqual(disconnected, []);
  assert.deepEqual(removed, []);
  return { playerId, disconnected, removed };
}

function createWorldSyncServiceForRuntimeRetainProof(disconnected: string[], removed: string[]) {
  return {
    clearDetachedPlayerCaches() {
      return undefined;
    },
    unloadDetachedPlayerRuntime(playerId: string) {
      disconnected.push(playerId);
      removed.push(playerId);
      return true;
    },
  };
}

function createMockSocket(id: string) {
  return {
    id,
    emit() {
      return undefined;
    },
    disconnect() {
      return undefined;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldSessionReaperService, WORLD_SESSION_REAPER_CONTRACT } from '../network/world-session-reaper.service';
import { WorldSessionService } from '../network/world-session.service';

async function main(): Promise<void> {
  const successProof = await runReaperSuccessProof();
  const retryProof = await runReaperRetryProof();
  const idleRuntimeUnloadAfterReaperProof = await runDetachedRuntimeUnloadAfterReaperProof();
  const activeRuntimeRetainProof = await runActiveDetachedRuntimeRetainProof();
  const transferRoutePreserveProof = await runTransferRoutePreserveProof();
  const reconnectDuringFlushProof = await runReconnectDuringFlushProof();

  console.log(
    JSON.stringify(
      {
        ok: true,
        successProof,
        retryProof,
        idleRuntimeUnloadAfterReaperProof,
        activeRuntimeRetainProof,
        transferRoutePreserveProof,
        reconnectDuringFlushProof,
        answers:
          '已直接证明 detached session 过期后，reaper 会先 flushPlayer 和清网络缓存；idle runtime 卸载成功后才清 route，仍有离线任务时保留本节点 offline route 并延迟重检，任务结束后自动卸载；迁移中不会把同 epoch 目标 route 覆盖回源节点，flush 期间重连也不会被旧 binding 回收。',
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
  const unloaded: string[] = [];
  const steps: Array<[string, string] | [string, string, number | null]> = [];
  const reaper = new WorldSessionReaperService(
    service,
    {
      clearDetachedPlayerCaches(targetPlayerId: string) {
        steps.push(['clearDetachedPlayerCaches', targetPlayerId]);
        cleared.push(targetPlayerId);
      },
      unloadDetachedPlayerRuntime(targetPlayerId: string, options: { allowOfflineHangingDemotion?: boolean; reason?: string }) {
        steps.push(['unloadDetachedPlayerRuntime', targetPlayerId]);
        if (options?.allowOfflineHangingDemotion === true && options.reason === 'session_reaped') {
          unloaded.push(targetPlayerId);
          return true;
        }
        return false;
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
        return { sessionId: null, sessionEpoch: 7 };
      },
    } as never,
  );

  await reaper.reapExpiredSessions();

  assert.deepEqual(flushed, [playerId]);
  assert.deepEqual(routeCleared, [[playerId, 7]]);
  assert.deepEqual(cleared, [playerId]);
  assert.deepEqual(unloaded, [playerId]);
  assert.deepEqual(steps, [
    ['flushPlayer', playerId],
    ['clearDetachedPlayerCaches', playerId],
    ['unloadDetachedPlayerRuntime', playerId],
    ['clearLocalRoute', playerId, 7],
  ]);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.unloadIdleDetachedRuntimeAfterFlush, true);

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
  const unloaded: string[] = [];
  const steps: Array<[string, string] | [string, string, number | null]> = [];
  const reaper = new WorldSessionReaperService(
    service,
    {
      clearDetachedPlayerCaches(targetPlayerId: string) {
        steps.push(['clearDetachedPlayerCaches', targetPlayerId]);
        cleared.push(targetPlayerId);
      },
      unloadDetachedPlayerRuntime(targetPlayerId: string) {
        steps.push(['unloadDetachedPlayerRuntime', targetPlayerId]);
        unloaded.push(targetPlayerId);
        return true;
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
        return { sessionId: null, sessionEpoch: 11 };
      },
    } as never,
  );

  await reaper.reapExpiredSessions();
  assert.equal(flushAttempts, 1);
  assert.deepEqual(routeCleared, []);
  assert.deepEqual(cleared, []);
  assert.deepEqual(unloaded, []);

  await reaper.reapExpiredSessions();
  assert.equal(flushAttempts, 2);
  assert.deepEqual(routeCleared, [[playerId, 11]]);
  assert.deepEqual(cleared, [playerId]);
  assert.deepEqual(unloaded, [playerId]);
  assert.deepEqual(steps, [
    ['flushPlayer', playerId],
    ['flushPlayer', playerId],
    ['clearDetachedPlayerCaches', playerId],
    ['unloadDetachedPlayerRuntime', playerId],
    ['clearLocalRoute', playerId, 11],
  ]);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.clearLocalRouteAfterFlush, true);

  return { playerId, flushAttempts, routeCleared, cleared };
}

async function runDetachedRuntimeUnloadAfterReaperProof(): Promise<{
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
  const worldSyncService = createWorldSyncServiceForRuntimeRetainProof(disconnected, removed, true);
  const reaper = new WorldSessionReaperService(
    service,
    worldSyncService as never,
    { async flushPlayer() {} } as never,
    { async clearLocalRoute() {} } as never,
    playerRuntimeService as never,
  );

  await reaper.reapExpiredSessions();

  assert.deepEqual(disconnected, [playerId]);
  assert.deepEqual(removed, [playerId]);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.unloadIdleDetachedRuntimeAfterFlush, true);
  return { playerId, disconnected, removed };
}

async function runActiveDetachedRuntimeRetainProof(): Promise<{
  playerId: string;
  disconnected: string[];
  removed: string[];
  retainedRoutes: Array<[string, number, string]>;
  routeCleared: Array<[string, number | null]>;
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
  const retainedRoutes: Array<[string, number, string]> = [];
  const routeCleared: Array<[string, number | null]> = [];
  let runtimePresent = true;
  let canUnload = false;
  const playerRuntimeService = {
    getPlayer() {
      return runtimePresent ? { sessionId: null, sessionEpoch: 17 } : null;
    },
    canUnloadDetachedPlayerRuntime() {
      return canUnload;
    },
    removePlayerRuntime(targetPlayerId: string) {
      removed.push(targetPlayerId);
    },
  };
  const worldSyncService = {
    clearDetachedPlayerCaches() {
      return undefined;
    },
    unloadDetachedPlayerRuntime(targetPlayerId: string) {
      if (!canUnload) {
        return false;
      }
      disconnected.push(targetPlayerId);
      removed.push(targetPlayerId);
      runtimePresent = false;
      return true;
    },
  };
  const reaper = new WorldSessionReaperService(
    service,
    worldSyncService as never,
    { async flushPlayer() {} } as never,
    {
      async clearLocalRoute(targetPlayerId: string, sessionEpoch?: number | null) {
        routeCleared.push([targetPlayerId, sessionEpoch ?? null]);
      },
      async registerLocalRoute(input: { playerId: string; sessionEpoch: number; routeStatus: string }) {
        retainedRoutes.push([input.playerId, input.sessionEpoch, input.routeStatus]);
      },
    } as never,
    playerRuntimeService as never,
  );
  (reaper as unknown as { retainedRuntimeRecheckDelayMs: number }).retainedRuntimeRecheckDelayMs = 0;

  await reaper.reapExpiredSessions();

  assert.deepEqual(disconnected, []);
  assert.deepEqual(removed, []);
  assert.deepEqual(retainedRoutes, [[playerId, 17, 'offline']]);
  assert.deepEqual(routeCleared, []);

  canUnload = true;
  await reaper.reapExpiredSessions();

  assert.deepEqual(disconnected, [playerId]);
  assert.deepEqual(removed, [playerId]);
  assert.deepEqual(retainedRoutes, [[playerId, 17, 'offline']]);
  assert.deepEqual(routeCleared, [[playerId, 17]]);
  return { playerId, disconnected, removed, retainedRoutes, routeCleared };
}

async function runTransferRoutePreserveProof(): Promise<{
  playerId: string;
  retainedRoutes: Array<[string, number, string]>;
}> {
  const service = new WorldSessionService();
  (service as unknown as { sessionDetachExpireMs: number }).sessionDetachExpireMs = 0;

  const playerId = `reaper_transfer_route_${Date.now().toString(36)}`;
  const socket = createMockSocket('reaper-transfer-route');
  service.registerSocket(socket, playerId);
  service.rememberSessionEpoch(playerId, 19);
  const detachedBinding = service.unregisterSocket(socket.id);
  if (!detachedBinding || detachedBinding.connected) {
    throw new Error(`expected detached binding for transfer route proof, got ${JSON.stringify(detachedBinding)}`);
  }
  await delay(20);

  const retainedRoutes: Array<[string, number, string]> = [];
  const runtimePlayer = {
    sessionId: null,
    sessionEpoch: 19,
    transferState: 'in_transfer',
    transferTargetNodeId: 'node:target',
  };
  const reaper = new WorldSessionReaperService(
    service,
    {
      clearDetachedPlayerCaches() {},
      unloadDetachedPlayerRuntime() {
        return false;
      },
    } as never,
    { async flushPlayer() {} } as never,
    {
      async clearLocalRoute() {
        throw new Error('active_transfer_route_must_not_be_cleared');
      },
      async registerLocalRoute(input: { playerId: string; sessionEpoch: number; routeStatus: string }) {
        retainedRoutes.push([input.playerId, input.sessionEpoch, input.routeStatus]);
      },
    } as never,
    {
      getPlayer() {
        return runtimePlayer;
      },
      canUnloadDetachedPlayerRuntime() {
        return false;
      },
    } as never,
  );

  await reaper.reapExpiredSessions();

  assert.deepEqual(retainedRoutes, []);
  assert.equal(WORLD_SESSION_REAPER_CONTRACT.preserveAssignedRouteDuringTransfer, true);
  return { playerId, retainedRoutes };
}

async function runReconnectDuringFlushProof(): Promise<{
  playerId: string;
  replacementSessionId: string;
  destructiveCalls: string[];
}> {
  const service = new WorldSessionService();
  (service as unknown as { sessionDetachExpireMs: number }).sessionDetachExpireMs = 0;

  const playerId = `reaper_reconnect_flush_${Date.now().toString(36)}`;
  const socket = createMockSocket('reaper-reconnect-old');
  service.registerSocket(socket, playerId);
  service.rememberSessionEpoch(playerId, 23);
  const detachedBinding = service.unregisterSocket(socket.id);
  if (!detachedBinding || detachedBinding.connected) {
    throw new Error(`expected detached binding for reconnect-during-flush proof, got ${JSON.stringify(detachedBinding)}`);
  }

  let notifyFlushStarted!: () => void;
  const flushStarted = new Promise<void>((resolve) => {
    notifyFlushStarted = resolve;
  });
  let releaseFlush!: () => void;
  const flushGate = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });
  const destructiveCalls: string[] = [];
  const reaper = new WorldSessionReaperService(
    service,
    {
      clearDetachedPlayerCaches() {
        destructiveCalls.push('clearDetachedPlayerCaches');
      },
      unloadDetachedPlayerRuntime() {
        destructiveCalls.push('unloadDetachedPlayerRuntime');
        return true;
      },
    } as never,
    {
      async flushPlayer() {
        notifyFlushStarted();
        await flushGate;
      },
    } as never,
    {
      async clearLocalRoute() {
        destructiveCalls.push('clearLocalRoute');
      },
      async registerLocalRoute() {
        destructiveCalls.push('registerLocalRoute');
      },
    } as never,
    {
      getPlayer() {
        return { sessionId: 'replacement', sessionEpoch: 24 };
      },
    } as never,
  );

  const reap = reaper.reapExpiredSessions();
  await flushStarted;
  const replacementSocket = createMockSocket('reaper-reconnect-new');
  const replacementBinding = service.registerSocket(replacementSocket, playerId);
  releaseFlush();
  await reap;

  assert.equal(service.getBinding(playerId)?.sessionId, replacementBinding.sessionId);
  assert.equal(service.getBinding(playerId)?.connected, true);
  assert.deepEqual(destructiveCalls, []);
  return {
    playerId,
    replacementSessionId: replacementBinding.sessionId,
    destructiveCalls,
  };
}

function createWorldSyncServiceForRuntimeRetainProof(disconnected: string[], removed: string[], shouldUnload: boolean) {
  return {
    clearDetachedPlayerCaches() {
      return undefined;
    },
    unloadDetachedPlayerRuntime(playerId: string) {
      if (!shouldUnload) {
        return false;
      }
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

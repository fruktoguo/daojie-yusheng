import assert from 'node:assert/strict';

import { WorldGatewayPresenceHelper } from '../network/world-gateway-presence.helper';
import { WorldGatewayPlayerControlsHelper } from '../network/world-gateway-player-controls.helper';
import { WorldGateway } from '../network/world.gateway';
import { WorldSessionBootstrapPlayerInitService } from '../network/world-session-bootstrap-player-init.service';

async function verifyBootstrapPresenceImmediateWrite(): Promise<{
  loginWrites: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }>;
  persisted: string[];
}> {
  const loginWrites: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }> = [];
  const persisted: string[] = [];
  const service = new WorldSessionBootstrapPlayerInitService(
    {
      buildStarterPersistenceSnapshot() {
        return null;
      },
      async loadOrCreatePlayer() {
        return {
          instanceId: 'public:yunlai_town',
          templateId: 'yunlai_town',
          x: 32,
          y: 5,
        };
      },
      setIdentity() {
        return undefined;
      },
      describePersistencePresence() {
        return {
          online: true,
          inWorld: true,
          runtimeOwnerId: 'runtime:presence-login:1',
          sessionEpoch: 3,
          transferState: null,
          transferTargetNodeId: null,
          versionSeed: 1,
        };
      },
      markPersisted(playerId: string) {
        persisted.push(playerId);
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async loadProjectedSnapshot(_playerId: string, fallback: () => Promise<unknown>) {
        return fallback();
      },
      async savePlayerPresence(playerId: string, input: { online: boolean; inWorld: boolean; offlineSinceAt?: number | null }) {
        loginWrites.push({
          playerId,
          online: input.online,
          inWorld: input.inWorld,
          offlineSinceAt: input.offlineSinceAt ?? null,
        });
      },
      async savePlayerSnapshotProjectionDomains() {
        return undefined;
      },
    } as never,
    {
      async registerLocalRoute() {
        return undefined;
      },
    } as never,
    {
      async ensurePlayerMailbox() {
        return undefined;
      },
      async ensureWelcomeMail() {
        return undefined;
      },
    } as never,
    null,
  );

  await service.initializeBootstrapPlayer({
    playerId: 'presence:login',
    sessionId: 'sid:login',
    loadSnapshot: async () => null,
  });

  assert.deepEqual(loginWrites, [
    {
      playerId: 'presence:login',
      online: true,
      inWorld: true,
      offlineSinceAt: null,
    },
  ]);
  assert.deepEqual(persisted, ['presence:login']);
  return { loginWrites, persisted };
}

async function verifyOfflineGainBlockingPresenceStaysOfflineHanging(): Promise<{
  writes: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }>;
}> {
  const offlineSinceAt = 1_750_000_000_000;
  const writes: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }> = [];
  const persistence = {
    isEnabled() {
      return true;
    },
    async loadPlayerPresence() {
      return { sessionEpoch: 17 };
    },
    async savePlayerPresence(playerId: string, input: { online: boolean; inWorld: boolean; offlineSinceAt?: number | null }) {
      writes.push({
        playerId,
        online: input.online,
        inWorld: input.inWorld,
        offlineSinceAt: input.offlineSinceAt ?? null,
      });
    },
  };
  const runtime = {
    buildStarterPersistenceSnapshot() {
      return null;
    },
    async loadOrCreatePlayer() {
      return {
        instanceId: 'public:yunlai_town',
        templateId: 'yunlai_town',
        x: 32,
        y: 5,
      };
    },
    setIdentity() {
      return undefined;
    },
    describePersistencePresence() {
      return {
        online: false,
        inWorld: true,
        offlineSinceAt,
        runtimeOwnerId: null,
        sessionEpoch: 17,
        transferState: null,
        transferTargetNodeId: null,
        versionSeed: 1,
      };
    },
    markPersisted() {
      return undefined;
    },
    markHeartbeat() {
      return undefined;
    },
  };
  const bootstrap = new WorldSessionBootstrapPlayerInitService(
    runtime as never,
    persistence as never,
    { async registerLocalRoute() { return undefined; } } as never,
    {
      async ensurePlayerMailbox() { return undefined; },
      async ensureWelcomeMail() { return undefined; },
    } as never,
    null,
  );
  await bootstrap.initializeBootstrapPlayer({
    playerId: 'presence:offline-gain-blocking',
    sessionId: 'sid:offline-gain-blocking',
    deferOfflineGainSettlement: true,
    loadSnapshot: async () => null,
  });

  const presenceHelper = new WorldGatewayPresenceHelper(persistence as never, runtime as never);
  presenceHelper.handleHeartbeat({ data: { playerId: 'presence:offline-gain-blocking' } });
  await new Promise((resolve) => setImmediate(resolve));
  await presenceHelper.persistOfflinePresence({ playerId: 'presence:offline-gain-blocking' });

  assert.deepEqual(writes, [
    {
      playerId: 'presence:offline-gain-blocking',
      online: false,
      inWorld: true,
      offlineSinceAt,
    },
    {
      playerId: 'presence:offline-gain-blocking',
      online: false,
      inWorld: true,
      offlineSinceAt,
    },
    {
      playerId: 'presence:offline-gain-blocking',
      online: false,
      inWorld: true,
      offlineSinceAt,
    },
  ]);
  return { writes };
}

async function verifyOfflineGainAckPersistsFenceBeforeInitialSync(): Promise<{
  successOrder: string[];
  failedFlushErrorCode: string;
}> {
  const playerId = 'presence:offline-gain-ack';
  const sessionId = 'sid:offline-gain-ack';
  const order: string[] = [];
  const errors: Array<{ code: string; error: unknown }> = [];
  let lockActive = false;
  let shouldPersistPresence = true;
  let sessionActive = true;
  let supersedeAfterFlush = false;
  let ackResumesBlockingSession = true;
  let expectedReportIds = ['report:offline-gain'];

  const helper = new WorldGatewayPlayerControlsHelper({
    gatewayGuardHelper: {
      requirePlayerId() {
        return playerId;
      },
      requireActivePlayerId() {
        return sessionActive ? playerId : null;
      },
    },
    worldClientEventService: {
      emitGatewayError(_client: unknown, code: string, error: unknown) {
        errors.push({ code, error });
      },
    },
    playerDomainPersistenceService: {
      isEnabled() {
        return true;
      },
    },
    playerPersistenceFlushService: {
      async flushPlayerDomains(flushPlayerId: string, domains: Iterable<string>) {
        assert.equal(lockActive, true);
        assert.equal(flushPlayerId, playerId);
        assert.deepEqual(Array.from(domains), ['presence']);
        order.push('flush:presence');
        if (supersedeAfterFlush) {
          sessionActive = false;
        }
        return shouldPersistPresence;
      },
    },
    playerRuntimeService: {
      async runExclusiveAssetMutation<T>(playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
        assert.deepEqual(playerIds, [playerId]);
        assert.equal(lockActive, false);
        lockActive = true;
        order.push('lock:start');
        try {
          return await action();
        } finally {
          order.push('lock:end');
          lockActive = false;
        }
      },
      async acknowledgeOfflineGainReports(ackPlayerId: string, reportIds: string[], options: { sessionId?: string | null }) {
        assert.equal(lockActive, true);
        assert.equal(ackPlayerId, playerId);
        assert.deepEqual(reportIds, expectedReportIds);
        assert.equal(options.sessionId, sessionId);
        order.push('ack');
        return ackResumesBlockingSession;
      },
      getPlayer() {
        return {
          instanceId: 'public:yunlai_town',
          templateId: 'yunlai_town',
          x: 32,
          y: 5,
        };
      },
    },
    sessionBootstrapService: {
      connectBootstrapRuntimePlayer() {
        assert.equal(lockActive, false);
        order.push('runtime:connect');
      },
    },
    worldSyncService: {
      emitInitialSync() {
        assert.equal(lockActive, false);
        order.push('sync:initial');
      },
    },
  } as never);
  const client = {
    data: {
      playerId,
      sessionId,
    },
  } as never;

  await helper.handleAckOfflineGainReports(client, { reportIds: ['report:offline-gain'] });
  assert.deepEqual(order, [
    'lock:start',
    'ack',
    'flush:presence',
    'lock:end',
    'runtime:connect',
    'sync:initial',
  ]);
  assert.equal(errors.length, 0);
  const successOrder = [...order];

  order.length = 0;
  ackResumesBlockingSession = false;
  expectedReportIds = ['report:online'];
  await helper.handleAckOfflineGainReports(client, { reportIds: expectedReportIds });
  assert.deepEqual(order, [
    'lock:start',
    'ack',
    'lock:end',
  ], '普通在线收支 ACK 不得刷 presence 或重建首包');
  assert.equal(errors.length, 0);

  order.length = 0;
  ackResumesBlockingSession = true;
  expectedReportIds = ['report:offline-gain'];
  shouldPersistPresence = false;
  await helper.handleAckOfflineGainReports(client, { reportIds: ['report:offline-gain'] });
  assert.deepEqual(order, [
    'lock:start',
    'ack',
    'flush:presence',
    'lock:end',
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'ACK_OFFLINE_GAIN_REPORTS_FAILED');
  assert.match(String(errors[0]?.error), /offline_gain_session_presence_flush_failed/u);

  order.length = 0;
  shouldPersistPresence = true;
  sessionActive = true;
  supersedeAfterFlush = true;
  await helper.handleAckOfflineGainReports(client, { reportIds: ['report:offline-gain'] });
  assert.deepEqual(order, [
    'lock:start',
    'ack',
    'flush:presence',
    'lock:end',
  ]);
  assert.equal(errors.length, 1);

  return {
    successOrder,
    failedFlushErrorCode: errors[0]?.code ?? '',
  };
}

async function verifyGatewayHeartbeatAndDisconnectWrites(): Promise<{
  heartbeatWrites: number;
  disconnectWrites: number;
  flushCalls: string[];
  failedHeartbeatRetried: boolean;
  newerPresenceDirtyPreserved: boolean;
  disconnectFailureReported: boolean;
}> {
  const presenceWrites: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }> = [];
  const persisted: string[] = [];
  const flushCalls: string[] = [];
  let heartbeatCount = 0;
  let notReadyCount = 0;
  let presenceDomainRevision = 0;
  let runtimeRevision = 1;
  let failNextPresenceWrite = false;
  let blockedHeartbeatPlayerId = '';
  let releaseBlockedHeartbeatWrite: (() => void) | null = null;
  const blockedHeartbeatWrite = new Promise<void>((resolve) => {
    releaseBlockedHeartbeatWrite = resolve;
  });
  const playerRuntimeService = {
    markHeartbeat() {
      heartbeatCount += 1;
      presenceDomainRevision += 1;
    },
    describePersistencePresence() {
      return {
        online: true,
        inWorld: true,
        runtimeOwnerId: 'runtime:presence-heartbeat:2',
        sessionEpoch: 7,
        transferState: null,
        transferTargetNodeId: null,
        versionSeed: 1,
      };
    },
    markPersisted(playerId: string) {
      persisted.push(playerId);
    },
    getPersistenceRevision() {
      return runtimeRevision;
    },
    getPersistenceDomainRevision() {
      return presenceDomainRevision;
    },
    detachSession() {
      presenceDomainRevision += 1;
      runtimeRevision += 1;
      return undefined;
    },
  };
  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async savePlayerPresence(playerId: string, input: { online: boolean; inWorld: boolean; offlineSinceAt?: number | null }) {
      if (failNextPresenceWrite) {
        failNextPresenceWrite = false;
        throw new Error('presence_write_failed');
      }
      if (playerId === blockedHeartbeatPlayerId) {
        await blockedHeartbeatWrite;
      }
      presenceWrites.push({
        playerId,
        online: input.online,
        inWorld: input.inWorld,
        offlineSinceAt: input.offlineSinceAt ?? null,
      });
    },
  };
  const gateway = new WorldGateway(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    playerDomainPersistenceService as never,
    {
      async flushPlayer(playerId: string) {
        flushCalls.push(playerId);
      },
    } as never,
    playerRuntimeService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      worldRuntimePlayerSessionService: {
        detachPlayerSession() {},
      },
    } as never,
    {
      emitNotReady() {
        notReadyCount += 1;
      },
    } as never,
    {
      unregisterSocket() {
        return {
          playerId: 'presence:player',
          sessionId: 'sid:presence',
          socketId: null,
          resumed: false,
          connected: false,
          detachedAt: Date.now(),
          expireAt: Date.now() + 15_000,
        };
      },
    } as never,
    {
      async clearLocalRoute() {
        return undefined;
      },
    } as never,
    {} as never,
    {
      requirePlayerId(client: { data?: { playerId?: string } }) {
        const playerId = typeof client.data?.playerId === 'string' ? client.data.playerId : '';
        if (!playerId) {
          notReadyCount += 1;
          return null;
        }
        return playerId;
      },
    } as never,
    {} as never,
    {
      async clearDisconnectedPlayerState(binding: { playerId: string; connected: boolean }) {
        if (!binding.connected) {
          playerRuntimeService.detachSession();
        }
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new WorldGatewayPresenceHelper(playerDomainPersistenceService as never, playerRuntimeService as never) as never,
    {} as never,
    {} as never,
  );

  gateway.handleHeartbeat({ id: 'socket:bootstrap', data: {} } as never, {} as never);
  assert.equal(heartbeatCount, 0);
  assert.equal(notReadyCount, 1);

  const client = {
    id: 'socket:presence',
    data: {
      playerId: 'presence:player',
    },
  };

  await gateway.handleHeartbeat(client as never, {} as never);
  await gateway.handleHeartbeat(client as never, {} as never);

  assert.equal(heartbeatCount, 2);
  assert.deepEqual(presenceWrites, [
    {
      playerId: 'presence:player',
      online: true,
      inWorld: true,
      offlineSinceAt: null,
    },
  ]);
  assert.deepEqual(persisted, ['presence:player']);

  const failurePlayerId = 'presence:heartbeat-retry';
  const failedHeartbeatClient = {
    id: 'socket:presence-retry',
    data: { playerId: failurePlayerId },
  };
  failNextPresenceWrite = true;
  await gateway.handleHeartbeat(failedHeartbeatClient as never, {} as never);
  assert.equal(persisted.includes(failurePlayerId), false);
  assert.equal(gateway.gatewayPresenceHelper.shouldPersistHeartbeatPresence(failurePlayerId), true);
  await gateway.handleHeartbeat(failedHeartbeatClient as never, {} as never);
  assert.equal(persisted.includes(failurePlayerId), true);

  const racePlayerId = 'presence:heartbeat-disconnect-race';
  blockedHeartbeatPlayerId = racePlayerId;
  const raceHeartbeatPromise = gateway.handleHeartbeat({
    id: 'socket:presence-race',
    data: { playerId: racePlayerId },
  } as never, {} as never);
  playerRuntimeService.detachSession();
  releaseBlockedHeartbeatWrite?.();
  await raceHeartbeatPromise;
  assert.equal(persisted.includes(racePlayerId), false);

  await gateway.handleDisconnect({ id: 'socket:presence' } as never);

  const disconnectWrite = presenceWrites.find((entry) => entry.playerId === 'presence:player' && entry.online === false);
  assert.ok(disconnectWrite);
  assert.deepEqual(disconnectWrite, {
    playerId: 'presence:player',
    online: false,
    inWorld: true,
    offlineSinceAt: disconnectWrite.offlineSinceAt,
  });
  assert.ok(Number.isFinite(Number(disconnectWrite.offlineSinceAt)));
  assert.deepEqual(flushCalls, ['presence:player']);
  assert.deepEqual(persisted, ['presence:player', failurePlayerId]);

  failNextPresenceWrite = true;
  const failedDrain = await gateway.drainDetachedBinding({
    playerId: 'presence:disconnect-failure',
    sessionId: 'sid:disconnect-failure',
    socketId: null,
    resumed: false,
    connected: false,
    detachedAt: Date.now(),
    expireAt: Date.now() + 15_000,
  });
  assert.equal(failedDrain.presencePersisted, false);
  assert.equal(failedDrain.flushSucceeded, true);

  return {
    heartbeatWrites: 3,
    disconnectWrites: 1,
    flushCalls,
    failedHeartbeatRetried: true,
    newerPresenceDirtyPreserved: true,
    disconnectFailureReported: true,
  };
}

async function main(): Promise<void> {
  const bootstrap = await verifyBootstrapPresenceImmediateWrite();
  const offlineGainBlocking = await verifyOfflineGainBlockingPresenceStaysOfflineHanging();
  const offlineGainAck = await verifyOfflineGainAckPersistsFenceBeforeInitialSync();
  const gateway = await verifyGatewayHeartbeatAndDisconnectWrites();

  console.log(
    JSON.stringify(
      {
        ok: true,
        bootstrap,
        offlineGainBlocking,
        offlineGainAck,
        gateway,
        answers: 'player_presence 现已由登录 bootstrap、掉线和心跳节流小事务直接写入；离线收益 blocking 阶段始终保持 online=false/inWorld=true 并保留原 offlineSinceAt，因此重启恢复仍按离线挂机玩家处理；确认离线收益时会在玩家资产互斥区内先激活 session 并同步提交新 presence fence，成功后才连接 runtime 和下发 InitSession，提交失败则保持 fail closed',
        excludes: '不证明真实 socket 心跳频率、数据库写入耗时分布或多节点下的 heartbeat 协调',
        completionMapping: 'release:proof:player-presence-immediate-write',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

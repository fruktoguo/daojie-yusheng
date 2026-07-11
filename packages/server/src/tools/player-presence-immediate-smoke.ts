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
        assert.deepEqual(reportIds, ['report:offline-gain']);
        assert.equal(options.sessionId, sessionId);
        order.push('ack');
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
}> {
  const presenceWrites: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }> = [];
  const persisted: string[] = [];
  const flushCalls: string[] = [];
  let heartbeatCount = 0;
  let notReadyCount = 0;
  const playerRuntimeService = {
    markHeartbeat() {
      heartbeatCount += 1;
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
    detachSession() {
      return undefined;
    },
  };
  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async savePlayerPresence(playerId: string, input: { online: boolean; inWorld: boolean; offlineSinceAt?: number | null }) {
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
    {} as never,
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

  gateway.handleHeartbeat(client as never, {} as never);
  gateway.handleHeartbeat(client as never, {} as never);
  await new Promise((resolve) => setImmediate(resolve));

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

  await gateway.handleDisconnect({ id: 'socket:presence' } as never);

  assert.equal(presenceWrites.length, 2);
  assert.deepEqual(presenceWrites[1], {
    playerId: 'presence:player',
    online: false,
    inWorld: true,
    offlineSinceAt: presenceWrites[1]?.offlineSinceAt ?? null,
  });
  assert.ok(Number.isFinite(Number(presenceWrites[1]?.offlineSinceAt ?? NaN)));
  assert.deepEqual(flushCalls, ['presence:player']);
  assert.deepEqual(persisted, ['presence:player']);

  return {
    heartbeatWrites: 1,
    disconnectWrites: 1,
    flushCalls,
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

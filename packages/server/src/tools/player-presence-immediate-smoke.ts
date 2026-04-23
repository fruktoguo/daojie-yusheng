import assert from 'node:assert/strict';

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

async function verifyGatewayHeartbeatAndDisconnectWrites(): Promise<{
  heartbeatWrites: number;
  disconnectWrites: number;
  flushCalls: string[];
}> {
  const presenceWrites: Array<{ playerId: string; online: boolean; inWorld: boolean; offlineSinceAt: number | null }> = [];
  const persisted: string[] = [];
  const flushCalls: string[] = [];
  let heartbeatCount = 0;
  const gateway = new WorldGateway(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
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
    } as never,
    {
      async flushPlayer(playerId: string) {
        flushCalls.push(playerId);
      },
    } as never,
    {
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
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
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
  );

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
    inWorld: false,
    offlineSinceAt: presenceWrites[1]?.offlineSinceAt ?? null,
  });
  assert.ok(Number.isFinite(Number(presenceWrites[1]?.offlineSinceAt ?? NaN)));
  assert.deepEqual(flushCalls, ['presence:player']);
  assert.deepEqual(persisted, ['presence:player', 'presence:player']);

  return {
    heartbeatWrites: 1,
    disconnectWrites: 1,
    flushCalls,
  };
}

async function main(): Promise<void> {
  const bootstrap = await verifyBootstrapPresenceImmediateWrite();
  const gateway = await verifyGatewayHeartbeatAndDisconnectWrites();

  console.log(
    JSON.stringify(
      {
        ok: true,
        bootstrap,
        gateway,
        answers: 'player_presence 现已由登录 bootstrap、掉线和心跳节流小事务直接写入，不走普通 flush worker；重复 heartbeat 在节流窗口内不会重复直写',
        excludes: '不证明真实 socket 心跳频率、数据库写入耗时分布或多节点下的 heartbeat 协调',
        completionMapping: 'replace-ready:proof:player-presence-immediate-write',
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

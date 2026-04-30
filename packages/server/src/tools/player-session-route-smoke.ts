import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';
import { S2C } from '@mud/shared';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { WorldGatewayBootstrapHelper } from '../network/world-gateway-bootstrap.helper';
import { WorldGateway } from '../network/world.gateway';
import { WorldSessionBootstrapPlayerInitService } from '../network/world-session-bootstrap-player-init.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { NodeRegistryService } from '../persistence/node-registry.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';

const databaseUrl = resolveServerDatabaseUrl();
const PLAYER_SESSION_ROUTE_TABLE = 'player_session_route';
const NODE_REGISTRY_TABLE = 'node_registry';

async function main(): Promise<void> {
  const hookProof = await verifyHookWiring();
  const gatewayProof = await verifyGatewayRouteDecision();
  const databaseProof = await verifyDatabaseRouteLifecycle();

  console.log(
    JSON.stringify(
      {
        ok: true,
        hookProof,
        gatewayProof,
        databaseProof,
        answers: databaseProof.skipped
          ? '已验证 bootstrap 会注册本地 route，disconnect 进入 detached 窗口时不会提前清本地 route，gateway 会按 route 本地放行或拒绝错误节点；若带库，还会验证缺路由时按最低负载节点分配与路由持久化'
          : '已验证 bootstrap 会注册本地 route，disconnect 进入 detached 窗口时不会提前清本地 route，gateway 会按 route 本地放行或拒绝错误节点，并在 with-db 下验证缺路由时按最低负载节点分配与路由持久化',
        excludes: '不证明真实跨节点代理转发、transfer 协议、route heartbeat 或多节点 lease 协调',
        completionMapping: 'release:proof:player-session-route',
      },
      null,
      2,
    ),
  );
}

async function verifyHookWiring(): Promise<{
  bootstrapRegistered: boolean;
  disconnectPreservedRoute: boolean;
}> {
  const registerCalls: Array<{ playerId: string; sessionEpoch: number }> = [];
  const bootstrapPersistedCalls: string[] = [];
  const clearCalls: string[] = [];
  const disconnectPersistedCalls: string[] = [];

  const bootstrapService = new WorldSessionBootstrapPlayerInitService(
    {
      loadOrCreatePlayer: async () => ({
        instanceId: 'inst:public:yunlai_town',
        templateId: 'yunlai_town',
        x: 32,
        y: 5,
      }),
      setIdentity() {
        return undefined;
      },
      describePersistencePresence() {
        return {
          online: true,
          inWorld: true,
          runtimeOwnerId: 'runtime:route-smoke:1',
          sessionEpoch: 7,
        };
      },
      markPersisted(playerId: string) {
        bootstrapPersistedCalls.push(playerId);
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
      async savePlayerPresence() {
        return undefined;
      },
    } as never,
    {
      async registerLocalRoute(input: { playerId: string; sessionEpoch: number }) {
        registerCalls.push({ playerId: input.playerId, sessionEpoch: input.sessionEpoch });
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
  );

  await bootstrapService.initializeBootstrapPlayer({
    playerId: 'route_smoke_player',
    sessionId: 'sid:route-smoke',
    loadSnapshot: async () => null,
  });

  assert.deepEqual(registerCalls, [{ playerId: 'route_smoke_player', sessionEpoch: 7 }]);
  assert.deepEqual(bootstrapPersistedCalls, ['route_smoke_player']);

  const gateway = new WorldGateway(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      isEnabled() {
        return true;
      },
      async savePlayerPresence() {
        return undefined;
      },
    } as never,
    {
      async flushPlayer() {
        return undefined;
      },
    } as never,
    {
      detachSession() {
        return undefined;
      },
      describePersistencePresence() {
        return {
          online: true,
          inWorld: true,
          runtimeOwnerId: 'runtime:route-smoke:1',
          sessionEpoch: 7,
          transferState: null,
          transferTargetNodeId: null,
          versionSeed: 123,
        };
      },
      markPersisted(playerId: string) {
        disconnectPersistedCalls.push(playerId);
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
          playerId: 'route_smoke_player',
          sessionId: 'sid:route-smoke',
          socketId: null,
          resumed: false,
          connected: false,
          detachedAt: Date.now(),
          expireAt: Date.now() + 15_000,
        };
      },
    } as never,
    {
      async clearLocalRoute(playerId: string) {
        clearCalls.push(playerId);
      },
    } as never,
    {} as never,
  );

  await gateway.handleDisconnect({ id: 'socket:route-smoke' } as never);
  assert.deepEqual(clearCalls, []);
  assert.deepEqual(disconnectPersistedCalls, ['route_smoke_player']);

  return {
    bootstrapRegistered: true,
    disconnectPreservedRoute: true,
  };
}

async function verifyGatewayRouteDecision(): Promise<{
  localAllowed: boolean;
  remoteAssignedRejected: boolean;
  remoteConnectedRejected: boolean;
}> {
  const remoteErrors: Array<{ code: string; message: string; redirectNodeId?: string | null; redirectUrl?: string | null }> = [];
  let localBootstrapCalls = 0;
  let remoteAssignedBootstrapCalls = 0;
  let remoteConnectedBootstrapCalls = 0;
  const routeResolverStub = {
    __mode: 'local' as 'local' | 'remoteAssigned' | 'remoteConnected',
    async resolveBootstrapTarget(playerId: string) {
      if (playerId !== 'route_smoke_player') {
        throw new Error(`unexpected playerId: ${playerId}`);
      }
      if (routeResolverStub.__mode === 'remoteAssigned') {
        return {
          playerId,
          targetNodeId: 'node:remote-assigned',
          localNodeId: 'node:local',
          source: 'assigned' as const,
          routeStatus: 'assigned',
          sessionEpoch: 7,
          routePersisted: true,
          isLocalTarget: false,
          targetAddress: '127.0.0.1',
          targetPort: 13011,
          targetServerUrl: 'http://127.0.0.1:13011',
        };
      }
      if (routeResolverStub.__mode === 'remoteConnected') {
        return {
          playerId,
          targetNodeId: 'node:remote-connected',
          localNodeId: 'node:local',
          source: 'route' as const,
          routeStatus: 'connected',
          sessionEpoch: 7,
          routePersisted: true,
          isLocalTarget: false,
          targetAddress: '127.0.0.1',
          targetPort: 13011,
          targetServerUrl: 'http://127.0.0.1:13011',
        };
      }
      return {
        playerId,
        targetNodeId: 'node:local',
        localNodeId: 'node:local',
        source: 'assigned' as const,
        routeStatus: 'assigned',
        sessionEpoch: 1,
        routePersisted: true,
        isLocalTarget: true,
        targetAddress: '127.0.0.1',
        targetPort: 13001,
        targetServerUrl: 'http://127.0.0.1:13001',
      };
    },
  };

  const localClient = createBootstrapClient('socket:route:local');
  const remoteAssignedClient = createBootstrapClient('socket:route:remote-assigned');
  const remoteConnectedClient = createBootstrapClient('socket:route:remote-connected');
  const helper = new WorldGatewayBootstrapHelper({
    sessionBootstrapService: {
      pickSocketToken() {
        return 'token:route-smoke';
      },
      pickSocketGmToken() {
        return '';
      },
      inspectSocketRequestedSessionId() {
        return {
          sessionId: '',
          error: null,
        };
      },
      async authenticateSocketToken() {
        return {
          playerId: 'route_smoke_player',
          userId: 'user:route-smoke',
          authSource: 'mainline',
          persistedSource: 'mainline',
          playerName: 'route-smoke',
          displayName: 'route-smoke',
        };
      },
      resolveAuthenticatedBootstrapContractViolation() {
        return null;
      },
      pickSocketRequestedSessionId() {
        return '';
      },
      shouldAllowRequestedDetachedResume() {
        return true;
      },
      async bootstrapPlayerSession(client: { id: string }) {
        if (client.id === localClient.id) {
          localBootstrapCalls += 1;
        } else if (client.id === remoteAssignedClient.id) {
          remoteAssignedBootstrapCalls += 1;
        } else if (client.id === remoteConnectedClient.id) {
          remoteConnectedBootstrapCalls += 1;
        }
      },
    },
    worldClientEventService: {
      markProtocol(client: { data: Record<string, unknown> }, protocol: string) {
        client.data.protocol = protocol;
      },
      emitError(
        client: { emittedErrors: Array<{ code: string; message: string; redirectNodeId?: string | null; redirectUrl?: string | null }> },
        code: string,
        message: string,
        extra?: { redirectNodeId?: string | null; redirectUrl?: string | null },
      ) {
        client.emittedErrors.push({ code, message, ...(extra ?? {}) });
      },
    },
    playerSessionRouteService: routeResolverStub,
    gatewayGuardHelper: {
      rejectWhenNotReady() {
        return false;
      },
    },
    logger: {
      debug() {
        return undefined;
      },
      warn() {
        return undefined;
      },
    },
  } as never);

  await helper.handleConnection(localClient as never);
  assert.equal(localBootstrapCalls, 1);
  assert.equal(localClient.disconnectCalled, false);

  routeResolverStub.__mode = 'remoteAssigned';
  await helper.handleConnection(remoteAssignedClient as never);
  remoteErrors.push(...remoteAssignedClient.emittedErrors);
  assert.equal(remoteAssignedBootstrapCalls, 0);
  assert.equal(remoteAssignedClient.disconnectCalled, true);
  assert.equal(remoteErrors.length, 1);
  assert.equal(remoteErrors[0]?.code, 'AUTH_FAIL');
  assert.equal(remoteErrors[0]?.redirectNodeId, 'node:remote-assigned');
  assert.equal(remoteErrors[0]?.redirectUrl, 'http://127.0.0.1:13011');
  assert.match(remoteErrors[0]?.message ?? '', /node:remote-assigned/);

  routeResolverStub.__mode = 'remoteConnected';
  await helper.handleConnection(remoteConnectedClient as never);
  remoteErrors.push(...remoteConnectedClient.emittedErrors);
  assert.equal(remoteConnectedBootstrapCalls, 0);
  assert.equal(remoteConnectedClient.disconnectCalled, true);
  assert.equal(remoteErrors.length, 2);
  assert.equal(remoteErrors[1]?.code, 'AUTH_FAIL');
  assert.equal(remoteErrors[1]?.redirectNodeId, 'node:remote-connected');
  assert.equal(remoteErrors[1]?.redirectUrl, 'http://127.0.0.1:13011');
  assert.match(remoteErrors[1]?.message ?? '', /node:remote-connected/);

  return {
    localAllowed: true,
    remoteAssignedRejected: true,
    remoteConnectedRejected: true,
  };
}

async function verifyDatabaseRouteLifecycle(): Promise<{
  skipped: boolean;
  playerId?: string;
  nodeId?: string;
  sessionEpoch?: number;
  assignedNodeId?: string;
}> {
  if (!databaseUrl.trim()) {
    return { skipped: true };
  }

  const now = Date.now();
  const playerId = `route_smoke_${now.toString(36)}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const nodeRegistryService = new NodeRegistryService(provider);
  const playerSessionRouteService = new PlayerSessionRouteService(nodeRegistryService, provider);

  await nodeRegistryService.onModuleInit();
  await playerSessionRouteService.onModuleInit();

  if (!playerSessionRouteService.isEnabled()) {
    throw new Error('player-session-route service not enabled');
  }

  try {
    await cleanupRoute(pool, playerId);
    await cleanupNodeRows(pool, [nodeRegistryService.getNodeId(), 'node:remote']);
    await seedNodeRows(pool, [
      { nodeId: nodeRegistryService.getNodeId(), capacityWeight: 1, port: 13001 },
      { nodeId: 'node:remote', capacityWeight: 1, port: 13011 },
    ]);
    const runningNodeIds = await listRunningNodeIds(pool);
    for (const nodeId of runningNodeIds) {
      if (nodeId === 'node:remote') {
        continue;
      }
      await seedRouteRow(pool, { playerId: `${playerId}:busy:${nodeId}:a`, nodeId, sessionEpoch: 1, routeStatus: 'connected' });
      await seedRouteRow(pool, { playerId: `${playerId}:busy:${nodeId}:b`, nodeId, sessionEpoch: 1, routeStatus: 'connected' });
    }
    await seedRouteRow(pool, { playerId: `${playerId}:busy:a`, nodeId: nodeRegistryService.getNodeId(), sessionEpoch: 1, routeStatus: 'connected' });
    await seedRouteRow(pool, { playerId: `${playerId}:busy:b`, nodeId: nodeRegistryService.getNodeId(), sessionEpoch: 1, routeStatus: 'connected' });

    const assignedTarget = await playerSessionRouteService.resolveBootstrapTarget(playerId);
    assert.equal(assignedTarget.source, 'assigned');
    assert.equal(assignedTarget.targetNodeId, 'node:remote');
    assert.equal(assignedTarget.isLocalTarget, false);
    assert.equal(assignedTarget.targetServerUrl, 'http://127.0.0.1:13011');
    const assignedRow = await playerSessionRouteService.loadRoute(playerId);
    assert.ok(assignedRow);
    assert.equal(assignedRow.nodeId, 'node:remote');
    assert.equal(assignedRow.routeStatus, 'assigned');
    assert.equal(assignedRow.sessionEpoch, 1);

    const persistedAssignedTarget = await playerSessionRouteService.resolveBootstrapTarget(playerId);
    assert.equal(persistedAssignedTarget.source, 'assigned');
    assert.equal(persistedAssignedTarget.routeStatus, 'assigned');
    assert.equal(persistedAssignedTarget.targetNodeId, 'node:remote');
    assert.equal(persistedAssignedTarget.isLocalTarget, false);
    assert.equal(persistedAssignedTarget.targetServerUrl, 'http://127.0.0.1:13011');

    await playerSessionRouteService.registerLocalRoute({
      playerId,
      sessionEpoch: 5,
    });
    await playerSessionRouteService.registerLocalRoute({
      playerId,
      sessionEpoch: 4,
    });

    const firstRoute = await playerSessionRouteService.loadRoute(playerId);
    assert.ok(firstRoute);
    assert.equal(firstRoute.playerId, playerId);
    assert.equal(firstRoute.nodeId, nodeRegistryService.getNodeId());
    assert.equal(firstRoute.sessionEpoch, 5);
    assert.equal(firstRoute.routeStatus, 'connected');

    const row = await fetchSingleRow(
      pool,
      `SELECT player_id, node_id, session_epoch, route_status FROM ${PLAYER_SESSION_ROUTE_TABLE} WHERE player_id = $1`,
      [playerId],
    );
    assert.ok(row);
    assert.equal(String(row.player_id), playerId);
    assert.equal(String(row.node_id), nodeRegistryService.getNodeId());
    assert.equal(Number(row.session_epoch), 5);
    assert.equal(String(row.route_status), 'connected');

    await playerSessionRouteService.clearLocalRoute(playerId);
    const clearedRoute = await playerSessionRouteService.loadRoute(playerId);
    assert.equal(clearedRoute, null);

    return {
      skipped: false,
      playerId,
      nodeId: nodeRegistryService.getNodeId(),
      sessionEpoch: 5,
      assignedNodeId: 'node:remote',
    };
  } finally {
    await cleanupRoute(pool, playerId).catch(() => undefined);
    await cleanupRoute(pool, `${playerId}:busy:a`).catch(() => undefined);
    await cleanupRoute(pool, `${playerId}:busy:b`).catch(() => undefined);
    for (const suffix of ['a', 'b']) {
      const runningNodeIds = await listRunningNodeIds(pool).catch(() => []);
      for (const nodeId of runningNodeIds) {
        await cleanupRoute(pool, `${playerId}:busy:${nodeId}:${suffix}`).catch(() => undefined);
      }
    }
    await cleanupNodeRows(pool, [nodeRegistryService.getNodeId(), 'node:remote']).catch(() => undefined);
    await playerSessionRouteService.onModuleDestroy().catch(() => undefined);
    await nodeRegistryService.onModuleDestroy().catch(() => undefined);
    await provider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRoute(pool: Pool, playerId: string): Promise<void> {
  await pool.query(`DELETE FROM ${PLAYER_SESSION_ROUTE_TABLE} WHERE player_id = $1`, [playerId]);
}

async function seedNodeRows(
  pool: Pool,
  rows: Array<{ nodeId: string; capacityWeight: number; port: number }>,
): Promise<void> {
  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO ${NODE_REGISTRY_TABLE}(node_id, address, port, status, heartbeat_at, started_at, capacity_weight)
        VALUES ($1, $2, $3, 'running', now(), now(), $4)
        ON CONFLICT (node_id)
        DO UPDATE SET
          status = 'running',
          heartbeat_at = now(),
          capacity_weight = EXCLUDED.capacity_weight
      `,
      [row.nodeId, '127.0.0.1', row.port, row.capacityWeight],
    );
  }
}

async function cleanupNodeRows(pool: Pool, nodeIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM ${NODE_REGISTRY_TABLE} WHERE node_id = ANY($1::varchar[])`, [nodeIds]);
}

async function listRunningNodeIds(pool: Pool): Promise<string[]> {
  const result = await pool.query(`SELECT node_id FROM ${NODE_REGISTRY_TABLE} WHERE status = 'running' ORDER BY node_id ASC`);
  return Array.isArray(result.rows)
    ? result.rows
        .map((row) => (typeof row?.node_id === 'string' ? row.node_id.trim() : ''))
        .filter((nodeId) => nodeId.length > 0)
    : [];
}

async function seedRouteRow(
  pool: Pool,
  input: { playerId: string; nodeId: string; sessionEpoch: number; routeStatus: string },
): Promise<void> {
  await pool.query(
    `
      INSERT INTO ${PLAYER_SESSION_ROUTE_TABLE}(player_id, node_id, session_epoch, route_status, updated_at)
      VALUES ($1, $2, $3, $4, now())
    `,
    [input.playerId, input.nodeId, input.sessionEpoch, input.routeStatus],
  );
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await pool.query(sql, params);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

function createBootstrapClient(id: string) {
  return {
    id,
    data: {},
    handshake: {
      auth: {
        protocol: 'mainline',
      },
    },
    emittedErrors: [] as Array<{ code: string; message: string; redirectNodeId?: string | null; redirectUrl?: string | null }>,
    disconnectCalled: false,
    emit(event: string, payload: unknown) {
      if (event === S2C.Error && payload && typeof payload === 'object') {
        const code = typeof (payload as { code?: unknown }).code === 'string' ? (payload as { code: string }).code : '';
        const message = typeof (payload as { message?: unknown }).message === 'string' ? (payload as { message: string }).message : '';
        this.emittedErrors.push({ code, message });
      }
    },
    disconnect() {
      this.disconnectCalled = true;
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

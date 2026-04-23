import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { NodeRegistryService } from '../persistence/node-registry.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { WorldSessionBootstrapPlayerInitService } from '../network/world-session-bootstrap-player-init.service';

const databaseUrl = resolveServerDatabaseUrl();
const PLAYER_SESSION_ROUTE_TABLE = 'player_session_route';
const NODE_REGISTRY_TABLE = 'node_registry';

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 transfer 写出的 assigned route 会在目标节点 bootstrap 时升级为 connected route',
          excludes: '不证明真实 socket redirect、多节点 lease 协调或 transfer 完成后的 route 清理',
          completionMapping: 'replace-ready:proof:player-session-route.handoff',
        },
        null,
        2,
      ),
    );
    return;
  }

  const previousNodeId = process.env.SERVER_NODE_ID;
  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const playerId = `route_handoff_${Date.now().toString(36)}`;
  const localNodeId = 'node:local-handoff';
  const remoteNodeId = 'node:remote-handoff';
  const sessionEpoch = 8;

  try {
    process.env.SERVER_NODE_ID = localNodeId;
    const localNodeRegistry = new NodeRegistryService(provider);
    const localRouteService = new PlayerSessionRouteService(localNodeRegistry, provider);
    await localNodeRegistry.onModuleInit();
    await localRouteService.onModuleInit();

    process.env.SERVER_NODE_ID = remoteNodeId;
    const remoteNodeRegistry = new NodeRegistryService(provider);
    const remoteRouteService = new PlayerSessionRouteService(remoteNodeRegistry, provider);
    await remoteNodeRegistry.onModuleInit();
    await remoteRouteService.onModuleInit();

    await cleanupRoute(pool, playerId);
    await cleanupNodeRows(pool, [localNodeId, remoteNodeId]);
    await seedNodeRows(pool, [
      { nodeId: localNodeId, port: 13121 },
      { nodeId: remoteNodeId, port: 13122 },
    ]);

    await localRouteService.registerRoute({
      playerId,
      nodeId: remoteNodeId,
      sessionEpoch,
      routeStatus: 'assigned',
    });

    const assignedRoute = await remoteRouteService.loadRoute(playerId);
    assert.ok(assignedRoute);
    assert.equal(assignedRoute?.nodeId, remoteNodeId);
    assert.equal(assignedRoute?.routeStatus, 'assigned');
    assert.equal(assignedRoute?.sessionEpoch, sessionEpoch);

    const bootstrapService = new WorldSessionBootstrapPlayerInitService(
      {
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
            runtimeOwnerId: 'runtime:handoff:8',
            sessionEpoch,
          };
        },
        markPersisted() {
          return undefined;
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
      remoteRouteService,
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
      playerId,
      sessionId: 'sid:handoff',
      loadSnapshot: async () => null,
    });

    const connectedRoute = await remoteRouteService.loadRoute(playerId);
    assert.ok(connectedRoute);
    assert.equal(connectedRoute?.nodeId, remoteNodeId);
    assert.equal(connectedRoute?.routeStatus, 'connected');
    assert.equal(connectedRoute?.sessionEpoch, sessionEpoch);

    await localRouteService.clearLocalRoute(playerId, sessionEpoch);

    const routeAfterSourceCleanup = await remoteRouteService.loadRoute(playerId);
    assert.ok(routeAfterSourceCleanup);
    assert.equal(routeAfterSourceCleanup?.nodeId, remoteNodeId);
    assert.equal(routeAfterSourceCleanup?.routeStatus, 'connected');
    assert.equal(routeAfterSourceCleanup?.sessionEpoch, sessionEpoch);

    const target = await remoteRouteService.resolveBootstrapTarget(playerId);
    assert.equal(target.targetNodeId, remoteNodeId);
    assert.equal(target.isLocalTarget, true);
    assert.equal(target.routeStatus, 'connected');
    assert.equal(target.sessionEpoch, sessionEpoch);

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          sessionEpoch,
          answers: 'with-db 下已直接证明：源节点写出的 assigned route 会在目标节点 bootstrap 时被同一 session_epoch 升级为 connected route；随后源节点执行本地 route 清理也不会误删目标节点已接管的 remote route。',
          excludes: '不证明真实 socket redirect、多节点 lease 协调或 transfer 完成后的最终业务收尾',
          completionMapping: 'replace-ready:proof:player-session-route.handoff',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRoute(pool, playerId).catch(() => undefined);
    await cleanupNodeRows(pool, [localNodeId, remoteNodeId]).catch(() => undefined);
    await pool.end().catch(() => undefined);
    restoreEnv('SERVER_NODE_ID', previousNodeId);
  }
}

async function cleanupRoute(pool: Pool, playerId: string): Promise<void> {
  await pool.query(`DELETE FROM ${PLAYER_SESSION_ROUTE_TABLE} WHERE player_id = $1`, [playerId]);
}

async function seedNodeRows(
  pool: Pool,
  rows: Array<{ nodeId: string; port: number }>,
): Promise<void> {
  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO ${NODE_REGISTRY_TABLE}(node_id, address, port, status, heartbeat_at, started_at, capacity_weight)
        VALUES ($1, '127.0.0.1', $2, 'running', now(), now(), 1)
        ON CONFLICT (node_id)
        DO UPDATE SET
          address = EXCLUDED.address,
          port = EXCLUDED.port,
          status = 'running',
          heartbeat_at = now(),
          capacity_weight = EXCLUDED.capacity_weight
      `,
      [row.nodeId, row.port],
    );
  }
}

async function cleanupNodeRows(pool: Pool, nodeIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM ${NODE_REGISTRY_TABLE} WHERE node_id = ANY($1::varchar[])`, [nodeIds]);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
    return;
  }
  delete process.env[name];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

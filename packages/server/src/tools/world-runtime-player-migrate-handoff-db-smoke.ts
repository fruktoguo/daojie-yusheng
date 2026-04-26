import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { WorldSessionBootstrapPlayerInitService } from '../network/world-session-bootstrap-player-init.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { NodeRegistryService } from '../persistence/node-registry.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';

const databaseUrl = resolveServerDatabaseUrl();
const PLAYER_SESSION_ROUTE_TABLE = 'player_session_route';
const NODE_REGISTRY_TABLE = 'node_registry';

function createPlayerRuntimeService() {
  return new PlayerRuntimeService(
    {
      createStarterInventory() {
        return {
          capacity: DEFAULT_INVENTORY_CAPACITY,
          items: [],
        };
      },
      createDefaultEquipment() {
        return {};
      },
      normalizeItem(item: unknown) {
        return item;
      },
      hydrateTechniqueState(entry: unknown) {
        return entry;
      },
    } as never,
    {
      has(mapId: string) {
        return mapId === 'yunlai_town';
      },
      getOrThrow(mapId: string) {
        return {
          id: mapId,
          spawnX: 32,
          spawnY: 5,
        };
      },
      list() {
        return [
          {
            id: 'yunlai_town',
            spawnX: 32,
            spawnY: 5,
          },
        ];
      },
    } as never,
    {
      createInitialState() {
        return {
          stage: '炼气',
          baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          numericStats: createNumericStats(),
          ratioDivisors: createNumericRatioDivisors(),
        };
      },
      recalculate() {
        return undefined;
      },
    } as never,
    {
      initializePlayer() {
        return undefined;
      },
      refreshPreview() {
        return undefined;
      },
    } as never,
    undefined,
  );
}

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers:
            'with-db 下可验证 migratePlayerToNode bump 的新 session_epoch 会写成 assigned route，并在目标 bootstrap 时被同一 epoch 升级为 connected，随后源节点本地清理也不会误删 remote route',
          excludes: '不证明真实 socket redirect、多节点 lease 协调或 transfer 完成后的最终业务收尾',
          completionMapping: 'replace-ready:proof:with-db.world-runtime.player-migrate-handoff',
        },
        null,
        2,
      ),
    );
    return;
  }

  const previousNodeId = process.env.SERVER_NODE_ID;
  const localNodeId = 'node:migrate-handoff-local';
  const remoteNodeId = 'node:migrate-handoff-remote';
  const playerId = `player:migrate:handoff:${Date.now().toString(36)}`;
  const sessionId = `sid:migrate:handoff:${Date.now().toString(36)}`;

  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const playerRuntimeService = createPlayerRuntimeService();
  const flushCalls: string[] = [];

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
      { nodeId: localNodeId, port: 13131 },
      { nodeId: remoteNodeId, port: 13132 },
    ]);

    const runtimePlayer = playerRuntimeService.ensurePlayer(playerId, sessionId);
    const beforeSessionEpoch = runtimePlayer.sessionEpoch;

    const worldRuntime = Object.create(WorldRuntimeService.prototype) as {
      migratePlayerToNode(playerId: string, targetNodeId: string): Promise<{ ok: boolean; reason?: string }>;
      playerRuntimeService: ReturnType<typeof createPlayerRuntimeService>;
      playerPersistenceFlushService: { flushPlayer(playerId: string): Promise<void> };
      worldRuntimePlayerSessionService: {
        assignPlayerRoute(input: {
          playerId: string;
          nodeId: string;
          sessionEpoch: number;
          routeStatus?: string | null;
        }): Promise<void>;
      };
    };
    worldRuntime.playerRuntimeService = playerRuntimeService;
    worldRuntime.playerPersistenceFlushService = {
      async flushPlayer(playerId) {
        flushCalls.push(playerId);
      },
    };
    worldRuntime.worldRuntimePlayerSessionService = {
      assignPlayerRoute(input) {
        return localRouteService.registerRoute(input);
      },
    };

    const migrateResult = await worldRuntime.migratePlayerToNode(playerId, remoteNodeId);
    assert.deepEqual(migrateResult, { ok: true });
    assert.deepEqual(flushCalls, [playerId]);

    const transferredPlayer = playerRuntimeService.getPlayer(playerId);
    assert.ok(transferredPlayer);
    assert.ok((transferredPlayer?.sessionEpoch ?? 0) > beforeSessionEpoch);
    assert.equal(transferredPlayer?.transferState, 'in_transfer');
    assert.equal(transferredPlayer?.transferTargetNodeId, remoteNodeId);

    const assignedRoute = await remoteRouteService.loadRoute(playerId);
    assert.ok(assignedRoute);
    assert.equal(assignedRoute?.nodeId, remoteNodeId);
    assert.equal(assignedRoute?.routeStatus, 'assigned');
    assert.equal(assignedRoute?.sessionEpoch, transferredPlayer?.sessionEpoch);

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
            runtimeOwnerId: `runtime:${playerId}:${transferredPlayer?.sessionEpoch ?? 0}`,
            sessionEpoch: transferredPlayer?.sessionEpoch ?? null,
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
      sessionId: 'sid:bootstrap:handoff',
      loadSnapshot: async () => null,
    });

    const connectedRoute = await remoteRouteService.loadRoute(playerId);
    assert.ok(connectedRoute);
    assert.equal(connectedRoute?.nodeId, remoteNodeId);
    assert.equal(connectedRoute?.routeStatus, 'connected');
    assert.equal(connectedRoute?.sessionEpoch, transferredPlayer?.sessionEpoch);

    await localRouteService.clearLocalRoute(playerId, transferredPlayer?.sessionEpoch ?? null);

    const routeAfterSourceCleanup = await remoteRouteService.loadRoute(playerId);
    assert.ok(routeAfterSourceCleanup);
    assert.equal(routeAfterSourceCleanup?.nodeId, remoteNodeId);
    assert.equal(routeAfterSourceCleanup?.routeStatus, 'connected');
    assert.equal(routeAfterSourceCleanup?.sessionEpoch, transferredPlayer?.sessionEpoch);

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          flushCalls,
          beforeSessionEpoch,
          afterSessionEpoch: transferredPlayer?.sessionEpoch ?? null,
          answers:
            'with-db 下已直接证明：migratePlayerToNode 会先 flushPlayer，再用真实 beginTransfer bump session_epoch，把同一新 epoch 写成 assigned route；目标节点 bootstrap 会用同一 epoch 升级为 connected，随后源节点本地 route 清理也不会误删 remote route',
          excludes:
            '不证明真实 socket redirect、多节点 lease 协调或 transfer 完成后的最终业务收尾',
          completionMapping: 'replace-ready:proof:with-db.world-runtime.player-migrate-handoff',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRoute(pool, playerId).catch(() => undefined);
    await cleanupNodeRows(pool, [localNodeId, remoteNodeId]).catch(() => undefined);
    await pool.end().catch(() => undefined);
    if (typeof previousNodeId === 'string') {
      process.env.SERVER_NODE_ID = previousNodeId;
    } else {
      delete process.env.SERVER_NODE_ID;
    }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

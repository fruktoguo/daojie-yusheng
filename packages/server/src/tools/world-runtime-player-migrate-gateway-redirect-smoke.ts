import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';
import { createNumericRatioDivisors, createNumericStats, DEFAULT_INVENTORY_CAPACITY } from '@mud/shared';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { WorldGatewayBootstrapHelper } from '../network/world-gateway-bootstrap.helper';
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

function createBootstrapClient(socketId: string) {
  return {
    id: socketId,
    data: {
      protocol: 'mainline',
      bootstrapPromise: null,
    },
    handshake: {
      auth: {
        protocol: 'mainline',
        token: 'token:migrate-route',
      },
      query: {},
    },
    emittedErrors: [] as Array<{ code: string; message: string; redirectNodeId?: string | null; redirectUrl?: string | null }>,
    disconnectCalled: false,
    emit(event: string, payload: unknown) {
      if (event === S2C.Error && payload && typeof payload === 'object') {
        const code = typeof (payload as { code?: unknown }).code === 'string' ? (payload as { code: string }).code : '';
        const message = typeof (payload as { message?: unknown }).message === 'string' ? (payload as { message: string }).message : '';
        const redirectNodeId =
          typeof (payload as { redirectNodeId?: unknown }).redirectNodeId === 'string'
            ? (payload as { redirectNodeId: string }).redirectNodeId
            : null;
        const redirectUrl =
          typeof (payload as { redirectUrl?: unknown }).redirectUrl === 'string'
            ? (payload as { redirectUrl: string }).redirectUrl
            : null;
        this.emittedErrors.push({ code, message, redirectNodeId, redirectUrl });
      }
    },
    disconnect() {
      this.disconnectCalled = true;
    },
  };
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
            'with-db 下可验证 migratePlayerToNode 写出的 assigned route，会立刻让错误节点 gateway 返回 redirectNodeId/redirectUrl，而不会继续本地 bootstrap',
          excludes: '不证明目标节点 bootstrap 接管、真实 socket 重连完成或 transfer 最终业务收尾',
          completionMapping: 'replace-ready:proof:with-db.world-runtime.player-migrate-gateway-redirect',
        },
        null,
        2,
      ),
    );
    return;
  }

  const previousNodeId = process.env.SERVER_NODE_ID;
  const localNodeId = 'node:migrate-redirect-local';
  const remoteNodeId = 'node:migrate-redirect-remote';
  const playerId = `player:migrate:redirect:${Date.now().toString(36)}`;
  const sessionId = `sid:migrate:redirect:${Date.now().toString(36)}`;

  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  const playerRuntimeService = createPlayerRuntimeService();
  const flushCalls: string[] = [];

  try {
    process.env.SERVER_NODE_ID = localNodeId;
    const nodeRegistryService = new NodeRegistryService(provider);
    const playerSessionRouteService = new PlayerSessionRouteService(nodeRegistryService, provider);
    await nodeRegistryService.onModuleInit();
    await playerSessionRouteService.onModuleInit();

    await cleanupRoute(pool, playerId);
    await cleanupNodeRows(pool, [localNodeId, remoteNodeId]);
    await seedNodeRows(pool, [
      { nodeId: localNodeId, port: 13141 },
      { nodeId: remoteNodeId, port: 13142 },
    ]);

    const runtimePlayer = playerRuntimeService.ensurePlayer(playerId, sessionId);
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
      async flushPlayer(targetPlayerId) {
        flushCalls.push(targetPlayerId);
      },
    };
    worldRuntime.worldRuntimePlayerSessionService = {
      assignPlayerRoute(input) {
        return playerSessionRouteService.registerRoute(input);
      },
    };

    const migrateResult = await worldRuntime.migratePlayerToNode(playerId, remoteNodeId);
    assert.deepEqual(migrateResult, { ok: true });
    assert.deepEqual(flushCalls, [playerId]);
    assert.equal(runtimePlayer.sessionEpoch, 2);

    const client = createBootstrapClient('socket:migrate-redirect');
    let bootstrapCalls = 0;
    const helper = new WorldGatewayBootstrapHelper({
      sessionBootstrapService: {
        pickSocketToken() {
          return 'token:migrate-route';
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
            playerId,
            userId: `user:${playerId}`,
            authSource: 'mainline',
            persistedSource: 'mainline',
            playerName: 'migrate-redirect',
            displayName: 'migrate-redirect',
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
        async bootstrapPlayerSession() {
          bootstrapCalls += 1;
        },
      },
      worldClientEventService: {
        markProtocol(targetClient: { data: Record<string, unknown> }, protocol: string) {
          targetClient.data.protocol = protocol;
        },
        emitError(
          targetClient: { emittedErrors: Array<{ code: string; message: string; redirectNodeId?: string | null; redirectUrl?: string | null }> },
          code: string,
          message: string,
          extra?: { redirectNodeId?: string | null; redirectUrl?: string | null },
        ) {
          targetClient.emittedErrors.push({ code, message, ...(extra ?? {}) });
        },
      },
      playerSessionRouteService,
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

    await helper.handleConnection(client as never);

    assert.equal(bootstrapCalls, 0);
    assert.equal(client.disconnectCalled, true);
    assert.equal(client.emittedErrors.length, 1);
    assert.equal(client.emittedErrors[0]?.code, 'AUTH_FAIL');
    assert.equal(client.emittedErrors[0]?.redirectNodeId, remoteNodeId);
    assert.equal(client.emittedErrors[0]?.redirectUrl, 'http://127.0.0.1:13142');
    assert.match(client.emittedErrors[0]?.message ?? '', new RegExp(remoteNodeId));

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          flushCalls,
          assignedSessionEpoch: runtimePlayer.sessionEpoch,
          redirectNodeId: client.emittedErrors[0]?.redirectNodeId ?? null,
          redirectUrl: client.emittedErrors[0]?.redirectUrl ?? null,
          answers:
            'with-db 下已直接证明：WorldRuntimeService.migratePlayerToNode 写出的 assigned route，会立刻让错误节点 gateway 返回 redirectNodeId/redirectUrl，而不会继续本地 bootstrap',
          excludes:
            '不证明目标节点 bootstrap 接管、真实 socket 重连完成或 transfer 最终业务收尾',
          completionMapping: 'replace-ready:proof:with-db.world-runtime.player-migrate-gateway-redirect',
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

import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';
import { Pool } from 'pg';

import { installSmokeTimeout } from './smoke-timeout';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { NodeRegistryService } from '../persistence/node-registry.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();
const PLAYER_SESSION_ROUTE_TABLE = 'player_session_route';

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
            'with-db 下可验证 migratePlayerToNode 会先用真实 beginTransfer bump session_epoch，再把同一新 epoch 以 assigned route 写入 player_session_route',
          excludes: '不证明目标节点 bootstrap 接管、真实 socket redirect 或 transfer 完成后的最终 route 清理',
          completionMapping: 'replace-ready:proof:with-db.world-runtime.player-migrate-route',
        },
        null,
        2,
      ),
    );
    return;
  }

  const previousNodeId = process.env.SERVER_NODE_ID;
  const localNodeId = 'node:migrate-db-local';
  const remoteNodeId = 'node:migrate-db-remote';
  const playerId = `player:migrate:db:${Date.now().toString(36)}`;
  const sessionId = `sid:migrate:db:${Date.now().toString(36)}`;

  const pool = new Pool({ connectionString: databaseUrl });
  const provider = new DatabasePoolProvider();
  process.env.SERVER_NODE_ID = localNodeId;

  const nodeRegistryService = new NodeRegistryService(provider);
  const playerSessionRouteService = new PlayerSessionRouteService(nodeRegistryService, provider);
  const playerRuntimeService = createPlayerRuntimeService();
  const flushCalls: string[] = [];

  try {
    await nodeRegistryService.onModuleInit();
    await playerSessionRouteService.onModuleInit();
    await cleanupRoute(pool, playerId);

    const runtimePlayer = playerRuntimeService.ensurePlayer(playerId, sessionId);
    const beforeSessionEpoch = runtimePlayer.sessionEpoch;

    const service = Object.create(WorldRuntimeService.prototype) as {
      migratePlayerToNode(playerId: string, targetNodeId: string): Promise<{ ok: boolean; reason?: string }>;
      playerRuntimeService: ReturnType<typeof createPlayerRuntimeService>;
      playerPersistenceFlushService: { flushPlayer(playerId: string): Promise<void> };
      worldRuntimePlayerSessionService: { assignPlayerRoute: (input: {
        playerId: string;
        nodeId: string;
        sessionEpoch: number;
        routeStatus?: string | null;
      }) => Promise<void> };
    };
    service.playerRuntimeService = playerRuntimeService;
    service.playerPersistenceFlushService = {
      async flushPlayer(playerId) {
        flushCalls.push(playerId);
      },
    };
    service.worldRuntimePlayerSessionService = {
      assignPlayerRoute(input) {
        return playerSessionRouteService.registerRoute(input);
      },
    };

    const result = await service.migratePlayerToNode(playerId, remoteNodeId);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(flushCalls, [playerId]);

    const updatedPlayer = playerRuntimeService.getPlayer(playerId);
    assert.ok(updatedPlayer);
    assert.ok((updatedPlayer?.sessionEpoch ?? 0) > beforeSessionEpoch);
    assert.equal(updatedPlayer?.transferState, 'in_transfer');
    assert.equal(updatedPlayer?.transferTargetNodeId, remoteNodeId);

    const route = await playerSessionRouteService.loadRoute(playerId);
    assert.ok(route);
    assert.equal(route?.nodeId, remoteNodeId);
    assert.equal(route?.routeStatus, 'assigned');
    assert.equal(route?.sessionEpoch, updatedPlayer?.sessionEpoch);

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          flushCalls,
          beforeSessionEpoch,
          afterSessionEpoch: updatedPlayer?.sessionEpoch ?? null,
          answers:
            'with-db 下已直接证明：WorldRuntimeService.migratePlayerToNode 会先 flushPlayer，再用真实 PlayerRuntimeService.beginTransfer bump session_epoch，并把同一新 epoch 以 assigned route 写入 player_session_route',
          excludes:
            '不证明目标节点 bootstrap 接管、真实 socket redirect 或 transfer 完成后的最终 route 清理',
          completionMapping: 'replace-ready:proof:with-db.world-runtime.player-migrate-route',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRoute(pool, playerId).catch(() => undefined);
    await playerSessionRouteService.onModuleDestroy().catch(() => undefined);
    await nodeRegistryService.onModuleDestroy?.().catch(() => undefined);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

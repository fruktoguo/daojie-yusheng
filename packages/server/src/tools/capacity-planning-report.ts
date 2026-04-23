import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl, resolveServerDatabasePoolerUrl } from '../config/env-alias';

const databaseUrl = resolveServerDatabaseUrl();
const poolerUrl = resolveServerDatabasePoolerUrl();

const COUNTS = [
  { table: 'player_identity', label: 'playerIdentity', column: 'player_id' },
  { table: 'player_position_checkpoint', label: 'playerPositionCheckpoint', column: 'player_id' },
  { table: 'player_inventory_item', label: 'playerInventoryItem', column: 'player_id' },
  { table: 'player_market_storage_item', label: 'playerMarketStorageItem', column: 'player_id' },
  { table: 'player_wallet', label: 'playerWallet', column: 'player_id' },
  { table: 'player_active_job', label: 'playerActiveJob', column: 'player_id' },
  { table: 'player_mail', label: 'playerMail', column: 'player_id' },
  { table: 'instance_catalog', label: 'instanceCatalog', column: 'instance_id' },
  { table: 'instance_tile_resource_state', label: 'instanceTileResourceState', column: 'instance_id' },
  { table: 'instance_ground_item', label: 'instanceGroundItem', column: 'instance_id' },
  { table: 'instance_overlay_chunk', label: 'instanceOverlayChunk', column: 'instance_id' },
  { table: 'durable_operation_log', label: 'durableOperationLog', column: 'operation_id' },
] as const;

async function main(): Promise<void> {
  const summary: Record<string, unknown> = {
    ok: true,
    databaseUrlConfigured: databaseUrl.length > 0,
    poolerUrlConfigured: poolerUrl.length > 0,
    connectionBudget: {
      serverPoolMax: readPositiveIntEnv('SERVER_DATABASE_POOL_MAX', 'DATABASE_POOL_MAX', 24),
      serverPoolIdleTimeoutMs: readPositiveIntEnv('SERVER_DATABASE_POOL_IDLE_TIMEOUT_MS', 'DATABASE_POOL_IDLE_TIMEOUT_MS', 30_000),
      serverPoolConnectionTimeoutMs: readPositiveIntEnv('SERVER_DATABASE_POOL_CONNECTION_TIMEOUT_MS', 'DATABASE_POOL_CONNECTION_TIMEOUT_MS', 5_000),
    },
    nodeBudget: {
      desiredNodes: 4,
      pgBouncerTotalConnections: 120,
      redisConnectionsPerNode: 16,
      redisMode: 'sentinel-or-cluster',
    },
    estimation: {
      players: {
        '1k': estimatePlayers(1_000),
        '10k': estimatePlayers(10_000),
      },
      instances: {
        '1k': estimateInstances(1_000),
        '5k': estimateInstances(5_000),
      },
    },
  };

  if (!databaseUrl.length) {
    summary['skipped'] = true;
    summary['reason'] = 'SERVER_DATABASE_URL/DATABASE_URL missing';
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: poolerUrl || databaseUrl });
  try {
    const rows: Record<string, number> = {};
    for (const entry of COUNTS) {
      rows[entry.label] = await countRows(pool, entry.table, entry.column);
    }
    summary['tableCounts'] = rows;
    summary['recommendations'] = {
      playerFlushWorkerConvergence: 'keep player anchor / snapshot / state compaction split and cap concurrency to ledger',
      instanceFlushWorkerConvergence: 'keep tile / ground / container / monster / overlay split and allow TTL cleanup decoupling',
      redisWakeupMode: poolerUrl.length > 0 ? 'pooler-enabled' : 'direct-db-fallback',
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function estimatePlayers(totalPlayers: number): Record<string, number> {
  return {
    identity: totalPlayers,
    checkpoint: totalPlayers,
    inventoryItems: totalPlayers * 75,
    marketStorageItems: Math.trunc(totalPlayers * 12.5),
    wallet: totalPlayers * 3,
    activeJob: Math.trunc(totalPlayers * 0.35),
    mail: totalPlayers * 80,
  };
}

function estimateInstances(totalInstances: number): Record<string, number> {
  return {
    catalog: totalInstances,
    tileResourceState: totalInstances * 500,
    groundItem: totalInstances * 45,
    overlayChunk: totalInstances * 32,
    durableOperationLog: totalInstances * 120,
  };
}

async function countRows(pool: Pool, table: string, column: string): Promise<number> {
  const result = await pool.query<{ count?: unknown }>(`SELECT COUNT(*)::bigint AS count FROM ${table} WHERE ${column} IS NOT NULL`);
  return Math.max(0, Math.trunc(Number(result.rows[0]?.count ?? 0)));
}

function readPositiveIntEnv(primary: string, fallback: string, defaultValue: number): number {
  const raw = process.env[primary] ?? process.env[fallback];
  const parsed = raw == null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : defaultValue;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

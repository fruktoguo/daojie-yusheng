/**
 * 本文件是服务端冷路径运维工具入口，用于迁移、预检、清理或后台任务手动执行。
 *
 * 维护时要让脚本参数、失败退出码和副作用范围清晰，避免误操作生产数据。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { ensurePlayerAuthTable } from '../http/native/native-player-auth-store.service';
import { ensurePlayerIdentityTable } from '../persistence/player-identity-persistence.service';
import {
  PLAYER_DOMAIN_PROJECTED_TABLES,
  ensurePlayerDomainTables,
} from '../persistence/player-domain-persistence.service';

const SUMMARY_QUERY_REQUIRED_TABLES = [
  'player_recovery_watermark',
  'server_player_auth',
  'server_player_identity',
  'player_world_anchor',
  'player_position_checkpoint',
  'player_vitals',
  'player_attr_state',
  'player_combat_preferences',
] as const;

const LEGACY_PLAYER_SNAPSHOT_TABLE = 'server_player_snapshot';

interface DeployPreflightOptions {
  ensureCurrentSchema: boolean;
  applyTemporaryConversion: boolean;
}

interface DatabaseInspection {
  tables: Record<string, boolean>;
  playerDomainSchemaReady: boolean;
  playerDomainMissingTables: string[];
  legacyPlayerSnapshotRows: number;
  playerRecoveryWatermarkRows: number;
}

function parseArgs(argv: string[]): DeployPreflightOptions {
  return {
    ensureCurrentSchema: argv.includes('--ensure-current-schema'),
    applyTemporaryConversion: argv.includes('--apply-temporary-conversion'),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('missing SERVER_DATABASE_URL/DATABASE_URL');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const actions: Array<Record<string, unknown>> = [];
  try {
    const before = await inspectDatabase(pool);

    if (options.ensureCurrentSchema) {
      if (!before.tables.server_player_auth) {
        await ensurePlayerAuthTable(pool);
        actions.push({ type: 'ensure-current-player-auth-schema' });
      }
      if (!before.tables.server_player_identity) {
        await ensurePlayerIdentityTable(pool);
        actions.push({ type: 'ensure-current-player-identity-schema' });
      }
      if (!before.playerDomainSchemaReady) {
        await ensurePlayerDomainTables(pool);
        actions.push({ type: 'ensure-current-player-domain-schema' });
      }
    }

    const afterSchema = await inspectDatabase(pool);
    const needsLegacyPlayerMigration = shouldMigrateLegacyPlayerSnapshots(afterSchema);
    if (needsLegacyPlayerMigration && options.applyTemporaryConversion) {
      const migrationResult = runMigrationScript('import-legacy-persistence-once.js', [
        '--domains=player-domain',
        '--apply',
      ]);
      actions.push({
        type: 'temporary-legacy-player-domain-migration',
        status: migrationResult.status,
      });
    }

    const after = await inspectDatabase(pool);
    const remainingLegacyPlayerMigration = shouldMigrateLegacyPlayerSnapshots(after);
    const summaryMissingTables = SUMMARY_QUERY_REQUIRED_TABLES
      .filter((tableName) => !after.tables[tableName]);

    const ok = summaryMissingTables.length === 0
      && after.playerDomainMissingTables.length === 0
      && !remainingLegacyPlayerMigration;

    process.stdout.write(JSON.stringify({
      ok,
      mode: {
        ensureCurrentSchema: options.ensureCurrentSchema,
        applyTemporaryConversion: options.applyTemporaryConversion,
      },
      actions,
      before,
      after,
      checks: {
        summaryQueryReady: summaryMissingTables.length === 0,
        summaryMissingTables,
        playerDomainSchemaReady: after.playerDomainMissingTables.length === 0,
        playerDomainMissingTables: after.playerDomainMissingTables,
        needsLegacyPlayerMigration: remainingLegacyPlayerMigration,
      },
      temporaryRemovalNote: 'Remove this deploy preflight once the test and production databases are both confirmed on current-schema truth.',
    }, null, 2));
    process.stdout.write('\n');

    if (summaryMissingTables.length > 0) {
      throw new Error(`missing required GM summary tables: ${summaryMissingTables.join(', ')}`);
    }
    if (after.playerDomainMissingTables.length > 0) {
      throw new Error(`missing required player domain tables: ${after.playerDomainMissingTables.join(', ')}`);
    }
    if (remainingLegacyPlayerMigration) {
      throw new Error(options.applyTemporaryConversion
        ? 'legacy player snapshot migration did not converge'
        : 'legacy player snapshots detected but temporary conversion is disabled');
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function inspectDatabase(pool: Pool): Promise<DatabaseInspection> {
  const tableNames = Array.from(new Set([
    ...PLAYER_DOMAIN_PROJECTED_TABLES,
    ...SUMMARY_QUERY_REQUIRED_TABLES,
    LEGACY_PLAYER_SNAPSHOT_TABLE,
  ])).sort();
  const tableRows = await pool.query<{ name: string; exists: boolean }>(
    `
      SELECT name, to_regclass(name) IS NOT NULL AS exists
      FROM unnest($1::text[]) AS name
      ORDER BY name ASC
    `,
    [tableNames],
  );
  const tables = Object.fromEntries(tableRows.rows.map((row) => [row.name, row.exists === true]));
  const legacyPlayerSnapshotRows = tables[LEGACY_PLAYER_SNAPSHOT_TABLE]
    ? await countRows(pool, LEGACY_PLAYER_SNAPSHOT_TABLE)
    : 0;
  const playerRecoveryWatermarkRows = tables.player_recovery_watermark
    ? await countRows(pool, 'player_recovery_watermark')
    : 0;
  const playerDomainMissingTables = PLAYER_DOMAIN_PROJECTED_TABLES
    .filter((tableName) => !tables[tableName]);

  return {
    tables,
    playerDomainSchemaReady: playerDomainMissingTables.length === 0,
    playerDomainMissingTables,
    legacyPlayerSnapshotRows,
    playerRecoveryWatermarkRows,
  };
}

async function countRows(pool: Pool, tableName: string): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT count(*)::bigint AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

function shouldMigrateLegacyPlayerSnapshots(inspected: DatabaseInspection): boolean {
  return inspected.tables[LEGACY_PLAYER_SNAPSHOT_TABLE] === true
    && inspected.legacyPlayerSnapshotRows > 0
    && inspected.playerRecoveryWatermarkRows < inspected.legacyPlayerSnapshotRows;
}

function runMigrationScript(scriptName: string, args: string[]): ReturnType<typeof spawnSync> {
  const scriptPath = path.resolve(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with status ${result.status}`);
  }
  return result;
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.stderr.write('\n');
  process.exit(1);
});

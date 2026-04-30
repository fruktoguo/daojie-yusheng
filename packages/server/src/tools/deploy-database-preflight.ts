// @ts-nocheck

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

const { resolveServerDatabaseUrl } = require('../config/env-alias');
const {
  PLAYER_DOMAIN_PROJECTED_TABLES,
  ensurePlayerDomainTables,
} = require('../persistence/player-domain-persistence.service');

const SUMMARY_QUERY_REQUIRED_TABLES = [
  'player_recovery_watermark',
  'server_player_auth',
  'server_player_identity',
  'player_world_anchor',
  'player_position_checkpoint',
  'player_vitals',
  'player_attr_state',
  'player_combat_preferences',
];

const LEGACY_PLAYER_SNAPSHOT_TABLE = 'server_player_snapshot';

function parseArgs(argv) {
  return {
    ensureCurrentSchema: argv.includes('--ensure-current-schema'),
    applyTemporaryConversion: argv.includes('--apply-temporary-conversion'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('missing SERVER_DATABASE_URL/DATABASE_URL');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const actions = [];
  try {
    const before = await inspectDatabase(pool);

    if (options.ensureCurrentSchema && !before.playerDomainSchemaReady) {
      await ensurePlayerDomainTables(pool);
      actions.push({ type: 'ensure-current-player-domain-schema' });
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
        needsLegacyPlayerMigration: remainingLegacyPlayerMigration,
      },
      temporaryRemovalNote: 'Remove this deploy preflight once the test and production databases are both confirmed on current-schema truth.',
    }, null, 2));
    process.stdout.write('\n');

    if (summaryMissingTables.length > 0) {
      throw new Error(`missing required GM summary tables: ${summaryMissingTables.join(', ')}`);
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

async function inspectDatabase(pool) {
  const tableNames = Array.from(new Set([
    ...PLAYER_DOMAIN_PROJECTED_TABLES,
    ...SUMMARY_QUERY_REQUIRED_TABLES,
    LEGACY_PLAYER_SNAPSHOT_TABLE,
  ])).sort();
  const tableRows = await pool.query(
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

async function countRows(pool, tableName) {
  const result = await pool.query(`SELECT count(*)::bigint AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

function shouldMigrateLegacyPlayerSnapshots(inspected) {
  return inspected.tables[LEGACY_PLAYER_SNAPSHOT_TABLE] === true
    && inspected.legacyPlayerSnapshotRows > 0
    && inspected.playerRecoveryWatermarkRows < inspected.legacyPlayerSnapshotRows;
}

function runMigrationScript(scriptName, args) {
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

main().catch((error) => {
  process.stderr.write(error?.stack || String(error));
  process.stderr.write('\n');
  process.exit(1);
});

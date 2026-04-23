// @ts-nocheck

/**
 * 用途：统一清理 smoke / audit 生成的临时玩家，以及历史 guest_* 快照残留。
 */

Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SMOKE_ACCOUNT_PATTERNS = void 0;
exports.purgeSmokeTestArtifacts = purgeSmokeTestArtifacts;
exports.purgeSmokePlayerArtifactsByPlayerId = purgeSmokePlayerArtifactsByPlayerId;

const pg_1 = require("pg");

const env_alias_1 = require("../config/env-alias");

const PLAYER_AUTH_TABLE = 'server_player_auth';
const PLAYER_IDENTITY_TABLE = 'server_player_identity';
const PLAYER_IDENTITY_MIRROR_TABLE = 'player_identity';
const PLAYER_SNAPSHOT_TABLE = 'server_player_snapshot';
const INSTANCE_CATALOG_TABLE = 'instance_catalog';
const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';
const PERSISTENT_DOCUMENTS_TABLE = 'persistent_documents';
const PLAYER_SCOPED_MAINLINE_TABLES = [
  'player_flush_ledger',
  'player_presence',
  'player_session_route',
  'player_world_anchor',
  'player_position_checkpoint',
  'player_vitals',
  'player_progression_core',
  'player_attr_state',
  'player_body_training_state',
  'player_inventory_item',
  'player_profession_state',
  'player_alchemy_preset',
  'player_active_job',
  'player_logbook_message',
  'player_recovery_watermark',
  'player_mail_attachment',
  'player_mail',
  'player_mail_counter',
  'player_persistent_buff_state',
  'player_enhancement_record',
  'player_map_unlock',
  'player_equipment_slot',
  'player_technique_state',
  'player_quest_progress',
  'player_combat_preferences',
  'player_auto_battle_skill',
  'player_auto_use_item_rule',
  'durable_operation_log',
  'asset_audit_log',
  'outbox_event',
];
const LEGACY_USERS_TABLE = 'users';
const LEGACY_PLAYERS_TABLE = 'players';

const DEFAULT_GUEST_PLAYER_PATTERNS = Object.freeze([
  'guest_%',
  'proof_%',
  'bench_player_%',
  'bench_player',
  'bench_attacker',
  'bench_defender',
  'do_bench_%',
  'bench_multi_player_%',
  'bench_transfer_player_%',
]);

exports.DEFAULT_SMOKE_ACCOUNT_PATTERNS = Object.freeze([
  'acct_%',
  'atk_%',
  'bench_%',
  'def_%',
  'do_bench_%',
  'drp_%',
  'gc_%',
  'gmv_%',
  'gdb_%',
  'lot_%',
  'mai_%',
  'mcb_%',
  'mlt_%',
  'mrt_%',
  'msk_%',
  'ps_%',
  'na_%',
  'na_seed_%',
  'pg_%',
  'prc_%',
  'prs_%',
  'proof_%',
  'rdm_%',
  'rt_%',
  'shd_%',
]);

const DEFAULT_SMOKE_INSTANCE_PATTERNS = Object.freeze([
  'instance:%:lease',
  'public:bench_%',
]);

async function purgeSmokePlayerArtifactsByPlayerId(playerId, options = undefined) {
  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
  const serverUrl = normalizeBaseUrl(options?.serverUrl);
  const databaseUrl = normalizeDatabaseUrl(options?.databaseUrl);
  const result = {
    playerId: normalizedPlayerId,
    runtimeRemoved: false,
    runtimeDeleteError: '',
    deleted: {
      authRows: 0,
      identityRows: 0,
      snapshotRows: 0,
      legacyUserRows: 0,
      legacyPlayerRows: 0,
    },
  };

  if (!normalizedPlayerId) {
    return result;
  }

  if (serverUrl) {
    try {
      const response = await fetch(`${serverUrl}/runtime/players/${encodeURIComponent(normalizedPlayerId)}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        result.runtimeDeleteError = `runtime delete player failed: ${response.status} ${await response.text()}`;
      } else {
        result.runtimeRemoved = response.ok;
      }
    } catch (error) {
      result.runtimeDeleteError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!databaseUrl) {
    return result;
  }

  const pool = new pg_1.Pool({
    connectionString: databaseUrl,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userIds = new Set();
      const authRows = await safeQuery(client, `
        SELECT user_id
        FROM ${PLAYER_AUTH_TABLE}
        WHERE player_id = $1
      `, [normalizedPlayerId]);
      for (const row of authRows.rows ?? []) {
        const userId = typeof row?.user_id === 'string' ? row.user_id.trim() : '';
        if (userId) {
          userIds.add(userId);
        }
      }

      const identityRows = await safeQuery(client, `
        SELECT user_id
        FROM ${PLAYER_IDENTITY_TABLE}
        WHERE player_id = $1
      `, [normalizedPlayerId]);
      for (const row of identityRows.rows ?? []) {
        const userId = typeof row?.user_id === 'string' ? row.user_id.trim() : '';
        if (userId) {
          userIds.add(userId);
        }
      }

      result.deleted.snapshotRows = await deleteSnapshotRowsByPlayerIds(client, [normalizedPlayerId]);
      result.deleted.identityRows = await deleteIdentityRowsByPlayerIds(client, [normalizedPlayerId]);
      await deleteIdentityMirrorRowsByPlayerIds(client, [normalizedPlayerId]);
      result.deleted.authRows = await deleteAuthRowsByPlayerIds(client, [normalizedPlayerId]);
      await deleteMainlinePlayerScopedRows(client, [normalizedPlayerId]);
      result.deleted.legacyPlayerRows = await deleteLegacyPlayerRowsByPlayerIds(client, [normalizedPlayerId]);
      result.deleted.legacyUserRows = await deleteLegacyUserRowsByIds(client, [...userIds]);

      await client.query('COMMIT');
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => undefined);
  }

  return result;
}

async function purgeSmokeTestArtifacts(options = undefined) {
  const databaseUrl = normalizeDatabaseUrl(options?.databaseUrl);
  if (!databaseUrl) {
    return {
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      deleted: {
        authRows: 0,
        identityRows: 0,
        snapshotRows: 0,
        legacyUserRows: 0,
        legacyPlayerRows: 0,
      },
    };
  }

  const accountPatterns = normalizeLikePatterns(
    options?.accountPatterns,
    exports.DEFAULT_SMOKE_ACCOUNT_PATTERNS,
  );
  const guestPlayerPatterns = normalizeLikePatterns(
    options?.playerPatterns ?? options?.guestPlayerPatterns,
    DEFAULT_GUEST_PLAYER_PATTERNS,
  );
  const instancePatterns = normalizeLikePatterns(
    options?.instancePatterns,
    DEFAULT_SMOKE_INSTANCE_PATTERNS,
  );
  const dryRun = options?.dryRun === true;

  const pool = new pg_1.Pool({
    connectionString: databaseUrl,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const authTargets = await safeQuery(client, `
        SELECT user_id, player_id, username
        FROM ${PLAYER_AUTH_TABLE}
        WHERE username LIKE ANY($1::text[])
      `, [accountPatterns]);
      const identityTargets = await safeQuery(client, `
        SELECT user_id, player_id, username
        FROM ${PLAYER_IDENTITY_TABLE}
        WHERE username LIKE ANY($1::text[])
      `, [accountPatterns]);
      const directPlayerTargets = await findPlayerIdsByPatterns(client, guestPlayerPatterns);
      const orphanNativeTargets = await findOrphanNativePlayerIds(client);

      const userIds = collectDistinctStrings('user_id', authTargets.rows, identityTargets.rows);
      const playerIds = collectDistinctStrings('player_id', authTargets.rows, identityTargets.rows, directPlayerTargets.rows, orphanNativeTargets.rows);

      const deleted = {
        authRows: dryRun
          ? await countTableRowsByLikePatterns(client, PLAYER_AUTH_TABLE, 'username', accountPatterns)
          : await deleteAuthRowsByUsernamePatterns(client, accountPatterns),
        identityRows: dryRun
          ? await countTableRowsByLikePatterns(client, PLAYER_IDENTITY_TABLE, 'username', accountPatterns)
          : await deleteIdentityRowsByUsernamePatterns(client, accountPatterns),
        snapshotRows: dryRun
          ? await countSnapshotRows(client, playerIds, guestPlayerPatterns)
          : await deleteSnapshotRows(client, playerIds, guestPlayerPatterns),
        legacyUserRows: dryRun
          ? await countLegacyUserRows(client, userIds, accountPatterns)
          : await deleteLegacyUserRows(client, userIds, accountPatterns),
        legacyPlayerRows: dryRun
          ? await countLegacyPlayerRows(client, playerIds, userIds)
          : await deleteLegacyPlayerRows(client, playerIds, userIds),
        instanceRows: dryRun
          ? await countInstanceScopedRows(client, playerIds, instancePatterns)
          : await deleteInstanceScopedRows(client, playerIds, instancePatterns),
      };

      if (!dryRun) {
        await deleteIdentityMirrorRowsByUsernamePatterns(client, accountPatterns);
        await deleteMainlinePlayerScopedRows(client, playerIds);
      }

      if (dryRun) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }

      return {
        ok: true,
        dryRun,
        accountPatterns,
        guestPlayerPatterns,
        instancePatterns,
        matched: {
          authPlayers: authTargets.rowCount ?? 0,
          identityPlayers: identityTargets.rowCount ?? 0,
          orphanNativePlayers: orphanNativeTargets.rowCount ?? 0,
          distinctUserIds: userIds.length,
          distinctPlayerIds: playerIds.length,
        },
        deleted,
      };
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function normalizeBaseUrl(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.replace(/\/+$/, '');
}

function normalizeDatabaseUrl(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || (0, env_alias_1.resolveServerDatabaseUrl)().trim();
}

function normalizeLikePatterns(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) {
    return [...fallback];
  }
  return value
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter((entry) => entry.length > 0);
}

function collectDistinctStrings(fieldName, ...rowGroups) {
  const values = new Set();
  const normalizedFieldName = typeof fieldName === 'string' ? fieldName.trim() : '';
  if (!normalizedFieldName) {
    return [];
  }
  for (let index = 0; index < rowGroups.length; index += 1) {
    const rows = Array.isArray(rowGroups[index]) ? rowGroups[index] : [];
    for (const row of rows) {
      const value = typeof row?.[normalizedFieldName] === 'string' ? row[normalizedFieldName].trim() : '';
      if (value) {
        values.add(value);
      }
    }
  }
  return [...values];
}

async function deleteSnapshotRowsByPlayerIds(client, playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_SNAPSHOT_TABLE}
    WHERE player_id = ANY($1::text[])
    RETURNING player_id
  `, [playerIds]);
  return result.rowCount ?? 0;
}

async function deleteMainlinePlayerScopedRows(client, playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return;
  }
  for (const tableName of PLAYER_SCOPED_MAINLINE_TABLES) {
    const sql = tableName === 'outbox_event'
      ? `DELETE FROM ${tableName} WHERE partition_key = ANY($1::text[])`
      : `DELETE FROM ${tableName} WHERE player_id = ANY($1::text[])`;
    await safeQuery(client, sql, [playerIds]);
  }
}

async function findPlayerIdsByPatterns(client, playerPatterns) {
  if (!Array.isArray(playerPatterns) || playerPatterns.length === 0) {
    return { rows: [] };
  }
  return safeQuery(client, `
    SELECT DISTINCT player_id
    FROM (
      SELECT player_id FROM ${PLAYER_SNAPSHOT_TABLE} WHERE player_id LIKE ANY($1::text[])
      UNION
      SELECT player_id FROM player_presence WHERE player_id LIKE ANY($1::text[])
      UNION
      SELECT player_id FROM player_mail WHERE player_id LIKE ANY($1::text[])
      UNION
      SELECT player_id FROM player_mail_attachment WHERE player_id LIKE ANY($1::text[])
      UNION
      SELECT player_id FROM player_position_checkpoint WHERE player_id LIKE ANY($1::text[])
      UNION
      SELECT player_id FROM player_world_anchor WHERE player_id LIKE ANY($1::text[])
    ) AS matched_players
  `, [playerPatterns]);
}

async function findOrphanNativePlayerIds(client) {
  return safeQuery(client, `
    SELECT DISTINCT player_id
    FROM ${PLAYER_SNAPSHOT_TABLE} snapshot
    WHERE snapshot.player_id ~ '^p_[0-9a-fA-F-]{36}$'
      AND NOT EXISTS (
        SELECT 1
        FROM ${PLAYER_IDENTITY_TABLE} identity
        WHERE identity.player_id = snapshot.player_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ${PLAYER_AUTH_TABLE} auth
        WHERE auth.player_id = snapshot.player_id
      )
  `);
}

function buildDerivedLeaseInstanceKeys(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return [];
  }
  return playerIds
    .map((playerId) => typeof playerId === 'string' ? playerId.trim() : '')
    .filter((playerId) => playerId.length > 0)
    .map((playerId) => `instance:${playerId}:lease`);
}

async function countInstanceScopedRows(client, playerIds, instancePatterns) {
  const derivedKeys = buildDerivedLeaseInstanceKeys(playerIds);
  const catalogRows = await safeQuery(client, `
    SELECT COUNT(*)::int AS count
    FROM ${INSTANCE_CATALOG_TABLE}
    WHERE instance_id LIKE ANY($1::text[])
      OR shard_key LIKE ANY($1::text[])
      OR instance_id = ANY($2::text[])
      OR shard_key = ANY($2::text[])
  `, [instancePatterns, derivedKeys]);
  const flushLedgerRows = await safeQuery(client, `
    SELECT COUNT(*)::int AS count
    FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
    WHERE instance_id LIKE ANY($1::text[])
      OR instance_id = ANY($2::text[])
  `, [instancePatterns, derivedKeys]);
  const documentRows = await safeQuery(client, `
    SELECT COUNT(*)::int AS count
    FROM ${PERSISTENT_DOCUMENTS_TABLE}
    WHERE key LIKE ANY($1::text[])
      OR key = ANY($2::text[])
  `, [instancePatterns, derivedKeys]);
  return Number(catalogRows.rows?.[0]?.count ?? 0)
    + Number(flushLedgerRows.rows?.[0]?.count ?? 0)
    + Number(documentRows.rows?.[0]?.count ?? 0);
}

async function deleteInstanceScopedRows(client, playerIds, instancePatterns) {
  const derivedKeys = buildDerivedLeaseInstanceKeys(playerIds);
  const catalogRows = await safeQuery(client, `
    DELETE FROM ${INSTANCE_CATALOG_TABLE}
    WHERE instance_id LIKE ANY($1::text[])
      OR shard_key LIKE ANY($1::text[])
      OR instance_id = ANY($2::text[])
      OR shard_key = ANY($2::text[])
    RETURNING instance_id
  `, [instancePatterns, derivedKeys]);
  const flushLedgerRows = await safeQuery(client, `
    DELETE FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
    WHERE instance_id LIKE ANY($1::text[])
      OR instance_id = ANY($2::text[])
    RETURNING instance_id
  `, [instancePatterns, derivedKeys]);
  const documentRows = await safeQuery(client, `
    DELETE FROM ${PERSISTENT_DOCUMENTS_TABLE}
    WHERE key LIKE ANY($1::text[])
      OR key = ANY($2::text[])
    RETURNING key
  `, [instancePatterns, derivedKeys]);
  return (catalogRows.rowCount ?? 0) + (flushLedgerRows.rowCount ?? 0) + (documentRows.rowCount ?? 0);
}

async function deleteIdentityRowsByPlayerIds(client, playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_IDENTITY_TABLE}
    WHERE player_id = ANY($1::text[])
    RETURNING player_id
  `, [playerIds]);
  return result.rowCount ?? 0;
}

async function deleteAuthRowsByPlayerIds(client, playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_AUTH_TABLE}
    WHERE player_id = ANY($1::text[])
    RETURNING player_id
  `, [playerIds]);
  return result.rowCount ?? 0;
}

async function deleteLegacyPlayerRowsByPlayerIds(client, playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${LEGACY_PLAYERS_TABLE}
    WHERE id = ANY($1::text[])
    RETURNING id
  `, [playerIds]);
  return result.rowCount ?? 0;
}

async function deleteLegacyUserRowsByIds(client, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${LEGACY_USERS_TABLE}
    WHERE id::text = ANY($1::text[])
    RETURNING id
  `, [userIds]);
  return result.rowCount ?? 0;
}

async function deleteAuthRowsByUsernamePatterns(client, accountPatterns) {
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_AUTH_TABLE}
    WHERE username LIKE ANY($1::text[])
    RETURNING user_id
  `, [accountPatterns]);
  return result.rowCount ?? 0;
}

async function deleteIdentityRowsByUsernamePatterns(client, accountPatterns) {
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_IDENTITY_TABLE}
    WHERE username LIKE ANY($1::text[])
    RETURNING user_id
  `, [accountPatterns]);
  return result.rowCount ?? 0;
}

async function deleteIdentityMirrorRowsByPlayerIds(client, playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_IDENTITY_MIRROR_TABLE}
    WHERE player_id = ANY($1::text[])
    RETURNING player_id
  `, [playerIds]);
  return result.rowCount ?? 0;
}

async function deleteIdentityMirrorRowsByUsernamePatterns(client, accountPatterns) {
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_IDENTITY_MIRROR_TABLE}
    WHERE username LIKE ANY($1::text[])
    RETURNING user_id
  `, [accountPatterns]);
  return result.rowCount ?? 0;
}

async function deleteSnapshotRows(client, playerIds, guestPlayerPatterns) {
  const clauses = [];
  const params = [];
  if (playerIds.length > 0) {
    params.push(playerIds);
    clauses.push(`player_id = ANY($${params.length}::text[])`);
  }
  if (guestPlayerPatterns.length > 0) {
    params.push(guestPlayerPatterns);
    clauses.push(`player_id LIKE ANY($${params.length}::text[])`);
  }
  if (clauses.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${PLAYER_SNAPSHOT_TABLE}
    WHERE ${clauses.join(' OR ')}
    RETURNING player_id
  `, params);
  return result.rowCount ?? 0;
}

async function countSnapshotRows(client, playerIds, guestPlayerPatterns) {
  const clauses = [];
  const params = [];
  if (playerIds.length > 0) {
    params.push(playerIds);
    clauses.push(`player_id = ANY($${params.length}::text[])`);
  }
  if (guestPlayerPatterns.length > 0) {
    params.push(guestPlayerPatterns);
    clauses.push(`player_id LIKE ANY($${params.length}::text[])`);
  }
  if (clauses.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    SELECT count(*) AS count
    FROM ${PLAYER_SNAPSHOT_TABLE}
    WHERE ${clauses.join(' OR ')}
  `, params);
  return Number(result.rows?.[0]?.count ?? 0);
}

async function deleteLegacyUserRows(client, userIds, accountPatterns) {
  const clauses = [];
  const params = [];
  if (userIds.length > 0) {
    params.push(userIds);
    clauses.push(`id::text = ANY($${params.length}::text[])`);
  }
  if (accountPatterns.length > 0) {
    params.push(accountPatterns);
    clauses.push(`username LIKE ANY($${params.length}::text[])`);
  }
  if (clauses.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${LEGACY_USERS_TABLE}
    WHERE ${clauses.join(' OR ')}
    RETURNING id
  `, params);
  return result.rowCount ?? 0;
}

async function countLegacyUserRows(client, userIds, accountPatterns) {
  const clauses = [];
  const params = [];
  if (userIds.length > 0) {
    params.push(userIds);
    clauses.push(`id::text = ANY($${params.length}::text[])`);
  }
  if (accountPatterns.length > 0) {
    params.push(accountPatterns);
    clauses.push(`username LIKE ANY($${params.length}::text[])`);
  }
  if (clauses.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    SELECT count(*) AS count
    FROM ${LEGACY_USERS_TABLE}
    WHERE ${clauses.join(' OR ')}
  `, params);
  return Number(result.rows?.[0]?.count ?? 0);
}

async function deleteLegacyPlayerRows(client, playerIds, userIds) {
  const clauses = [];
  const params = [];
  if (playerIds.length > 0) {
    params.push(playerIds);
    clauses.push(`id = ANY($${params.length}::text[])`);
  }
  if (userIds.length > 0) {
    params.push(userIds);
    clauses.push(`"userId"::text = ANY($${params.length}::text[])`);
  }
  if (clauses.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    DELETE FROM ${LEGACY_PLAYERS_TABLE}
    WHERE ${clauses.join(' OR ')}
    RETURNING id
  `, params);
  return result.rowCount ?? 0;
}

async function countLegacyPlayerRows(client, playerIds, userIds) {
  const clauses = [];
  const params = [];
  if (playerIds.length > 0) {
    params.push(playerIds);
    clauses.push(`id = ANY($${params.length}::text[])`);
  }
  if (userIds.length > 0) {
    params.push(userIds);
    clauses.push(`"userId"::text = ANY($${params.length}::text[])`);
  }
  if (clauses.length === 0) {
    return 0;
  }
  const result = await safeQuery(client, `
    SELECT count(*) AS count
    FROM ${LEGACY_PLAYERS_TABLE}
    WHERE ${clauses.join(' OR ')}
  `, params);
  return Number(result.rows?.[0]?.count ?? 0);
}

async function countTableRowsByLikePatterns(client, tableName, columnName, patterns) {
  const result = await safeQuery(client, `
    SELECT count(*) AS count
    FROM ${tableName}
    WHERE ${columnName} LIKE ANY($1::text[])
  `, [patterns]);
  return Number(result.rows?.[0]?.count ?? 0);
}

async function safeQuery(client, sql, params = undefined) {
  try {
    return await client.query(sql, params);
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        rowCount: 0,
        rows: [],
      };
    }
    throw error;
  }
}

function isMissingTableError(error) {
  return Boolean(error && typeof error === 'object' && error.code === '42P01');
}

async function rollbackQuietly(client) {
  await client.query('ROLLBACK').catch(() => undefined);
}

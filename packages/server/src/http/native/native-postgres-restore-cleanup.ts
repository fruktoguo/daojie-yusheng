/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * 数据库恢复后清理工具。
 * 在 pg_restore 完成后执行必要的表结构补齐和数据迁移，
 * 确保恢复后的数据库与当前代码版本兼容。
 */
import { Pool, type PoolClient } from 'pg';

const SERVER_SECT_TABLE = 'server_sect';
const INSTANCE_FORMATION_STATE_TABLE = 'instance_formation_state';
const INSTANCE_CATALOG_TABLE = 'instance_catalog';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const PLAYER_PRESENCE_TABLE = 'player_presence';
const PLAYER_POSITION_CHECKPOINT_TABLE = 'player_position_checkpoint';
const PLAYER_OFFLINE_GAIN_SESSION_TABLE = 'player_offline_gain_session';
const INSTANCE_DOMAIN_INSTANCE_TABLES = [
  'instance_tile_resource_state',
  'instance_tile_cell',
  'instance_tile_damage_state',
  'instance_temporary_tile_state',
  'instance_checkpoint',
  'instance_recovery_watermark',
  'instance_ground_item',
  'instance_container_state',
  'instance_container_entry',
  'instance_container_timer',
  'instance_monster_runtime_state',
  'instance_event_state',
  'instance_overlay_chunk',
  'instance_building_cell',
  'instance_building_state',
  'instance_room_cell',
  'instance_room_state',
  'instance_fengshui_state',
];

export interface PostgresRestoreSectCleanupReport {
  validSectCount: number;
  formationRowsDeleted: number;
  catalogRowsDeleted: number;
  sectInstanceRowsDeleted: number;
  overlayChunksUpdated: number;
  overlayChunksDeleted: number;
  overlayPortalEntriesRemoved: number;
}

export interface PostgresRestorePlayerPresenceReconciliationReport {
  supported: boolean;
  seededRows: number;
  seededInWorldRows: number;
  seededOfflineRows: number;
}

export async function cleanupPostgresRestoreOrphanSectState(databaseUrl: string): Promise<PostgresRestoreSectCleanupReport> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
  try {
    return await cleanupPostgresRestoreOrphanSectStateWithClient(pool);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function cleanupPostgresRestoreOrphanSectStateWithClient(
  pool: Pick<Pool, 'connect'>,
): Promise<PostgresRestoreSectCleanupReport> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await cleanupPostgresRestoreOrphanSectStateInTransaction(client);
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 恢复显式触发后补齐缺失的玩家 presence 投影。
 * 已有 presence 不会被覆盖；离线起点优先沿用离线收益会话，其次使用位置存档时间。
 */
export async function reconcilePostgresRestoreMissingPlayerPresence(
  databaseUrl: string,
): Promise<PostgresRestorePlayerPresenceReconciliationReport> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
  try {
    return await reconcilePostgresRestoreMissingPlayerPresenceWithClient(pool);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function reconcilePostgresRestoreMissingPlayerPresenceWithClient(
  pool: Pick<Pool, 'connect'>,
): Promise<PostgresRestorePlayerPresenceReconciliationReport> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await reconcilePostgresRestoreMissingPlayerPresenceInTransaction(client);
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reconcilePostgresRestoreMissingPlayerPresenceInTransaction(
  client: PoolClient,
): Promise<PostgresRestorePlayerPresenceReconciliationReport> {
  const unsupportedReport: PostgresRestorePlayerPresenceReconciliationReport = {
    supported: false,
    seededRows: 0,
    seededInWorldRows: 0,
    seededOfflineRows: 0,
  };
  if (!(await hasTable(client, PLAYER_RECOVERY_WATERMARK_TABLE))
    || !(await hasColumn(client, PLAYER_RECOVERY_WATERMARK_TABLE, 'player_id'))
    || !(await hasPlayerPresenceReconciliationColumns(client))) {
    return unsupportedReport;
  }

  const hasPositionCheckpoint = await hasTable(client, PLAYER_POSITION_CHECKPOINT_TABLE)
    && await hasColumn(client, PLAYER_POSITION_CHECKPOINT_TABLE, 'player_id')
    && await hasColumn(client, PLAYER_POSITION_CHECKPOINT_TABLE, 'instance_id')
    && await hasColumn(client, PLAYER_POSITION_CHECKPOINT_TABLE, 'updated_at');
  const hasOfflineGainSession = await hasTable(client, PLAYER_OFFLINE_GAIN_SESSION_TABLE)
    && await hasColumn(client, PLAYER_OFFLINE_GAIN_SESSION_TABLE, 'player_id')
    && await hasColumn(client, PLAYER_OFFLINE_GAIN_SESSION_TABLE, 'started_at');
  const positionJoin = hasPositionCheckpoint
    ? `LEFT JOIN ${PLAYER_POSITION_CHECKPOINT_TABLE} position ON position.player_id = watermark.player_id`
    : '';
  const offlineGainJoin = hasOfflineGainSession
    ? `LEFT JOIN ${PLAYER_OFFLINE_GAIN_SESSION_TABLE} offline_gain ON offline_gain.player_id = watermark.player_id`
    : '';
  const inWorldExpression = hasPositionCheckpoint
    ? `position.player_id IS NOT NULL AND NULLIF(btrim(position.instance_id), '') IS NOT NULL`
    : 'false';
  const positionUpdatedAtExpression = hasPositionCheckpoint
    ? `floor(EXTRACT(EPOCH FROM position.updated_at) * 1000)::bigint`
    : 'NULL::bigint';
  const offlineGainStartedAtExpression = hasOfflineGainSession
    ? 'offline_gain.started_at'
    : 'NULL::bigint';

  const result = await client.query<{
    seeded_rows?: unknown;
    seeded_in_world_rows?: unknown;
    seeded_offline_rows?: unknown;
  }>(`
    WITH missing_presence AS (
      SELECT
        watermark.player_id,
        ${inWorldExpression} AS in_world,
        CASE
          WHEN ${inWorldExpression} THEN GREATEST(
            0::bigint,
            LEAST(
              COALESCE(
                ${offlineGainStartedAtExpression},
                ${positionUpdatedAtExpression},
                floor(EXTRACT(EPOCH FROM now()) * 1000)::bigint
              ),
              floor(EXTRACT(EPOCH FROM now()) * 1000)::bigint
            )
          )
          ELSE NULL::bigint
        END AS offline_since_at
      FROM ${PLAYER_RECOVERY_WATERMARK_TABLE} watermark
      LEFT JOIN ${PLAYER_PRESENCE_TABLE} presence ON presence.player_id = watermark.player_id
      ${positionJoin}
      ${offlineGainJoin}
      WHERE presence.player_id IS NULL
    ), inserted AS (
      INSERT INTO ${PLAYER_PRESENCE_TABLE}(
        player_id,
        online,
        in_world,
        last_heartbeat_at,
        offline_since_at,
        runtime_owner_id,
        session_epoch,
        transfer_state,
        transfer_target_node_id,
        updated_at
      )
      SELECT
        player_id,
        false,
        in_world,
        NULL,
        offline_since_at,
        NULL,
        1,
        NULL,
        NULL,
        now()
      FROM missing_presence
      ON CONFLICT (player_id) DO NOTHING
      RETURNING in_world
    )
    SELECT
      count(*)::int AS seeded_rows,
      count(*) FILTER (WHERE in_world)::int AS seeded_in_world_rows,
      count(*) FILTER (WHERE NOT in_world)::int AS seeded_offline_rows
    FROM inserted
  `);
  const row = result.rows?.[0];
  return {
    supported: true,
    seededRows: normalizeCount(row?.seeded_rows),
    seededInWorldRows: normalizeCount(row?.seeded_in_world_rows),
    seededOfflineRows: normalizeCount(row?.seeded_offline_rows),
  };
}

async function hasPlayerPresenceReconciliationColumns(client: PoolClient): Promise<boolean> {
  if (!(await hasTable(client, PLAYER_PRESENCE_TABLE))) {
    return false;
  }
  for (const columnName of [
    'player_id',
    'online',
    'in_world',
    'last_heartbeat_at',
    'offline_since_at',
    'runtime_owner_id',
    'session_epoch',
    'transfer_state',
    'transfer_target_node_id',
    'updated_at',
  ]) {
    if (!(await hasColumn(client, PLAYER_PRESENCE_TABLE, columnName))) {
      return false;
    }
  }
  return true;
}

async function cleanupPostgresRestoreOrphanSectStateInTransaction(
  client: PoolClient,
): Promise<PostgresRestoreSectCleanupReport> {
  const validSectIds = await loadValidSectIds(client);
  const report: PostgresRestoreSectCleanupReport = {
    validSectCount: validSectIds.size,
    formationRowsDeleted: 0,
    catalogRowsDeleted: 0,
    sectInstanceRowsDeleted: 0,
    overlayChunksUpdated: 0,
    overlayChunksDeleted: 0,
    overlayPortalEntriesRemoved: 0,
  };

  report.formationRowsDeleted += await deleteOrphanFormationRows(client, validSectIds);
  const overlayReport = await cleanupOrphanSectRuntimePortals(client, validSectIds);
  report.overlayChunksUpdated += overlayReport.overlayChunksUpdated;
  report.overlayChunksDeleted += overlayReport.overlayChunksDeleted;
  report.overlayPortalEntriesRemoved += overlayReport.overlayPortalEntriesRemoved;
  report.catalogRowsDeleted += await deleteOrphanCatalogRows(client, validSectIds);
  report.sectInstanceRowsDeleted += await deleteOrphanSectInstanceRows(client, validSectIds);

  return report;
}

async function loadValidSectIds(client: PoolClient): Promise<Set<string>> {
  if (!(await hasTable(client, SERVER_SECT_TABLE)) || !(await hasColumn(client, SERVER_SECT_TABLE, 'sect_id'))) {
    return new Set();
  }
  const result = await client.query(`SELECT sect_id FROM ${quoteIdentifier(SERVER_SECT_TABLE)}`);
  return new Set(
    (result.rows ?? [])
      .map((row) => normalizeString(row?.sect_id))
      .filter((sectId) => sectId.length > 0),
  );
}

async function deleteOrphanFormationRows(client: PoolClient, validSectIds: Set<string>): Promise<number> {
  if (!(await hasTable(client, INSTANCE_FORMATION_STATE_TABLE))) {
    return 0;
  }
  let deleted = 0;
  if (await hasColumn(client, INSTANCE_FORMATION_STATE_TABLE, 'owner_sect_id')) {
    deleted += await deleteRowsByOwnerSect(client, INSTANCE_FORMATION_STATE_TABLE, 'owner_sect_id', validSectIds);
  }
  if (await hasColumn(client, INSTANCE_FORMATION_STATE_TABLE, 'instance_id')) {
    deleted += await deleteRowsBySectInstance(client, INSTANCE_FORMATION_STATE_TABLE, validSectIds);
  }
  return deleted;
}

async function deleteOrphanCatalogRows(client: PoolClient, validSectIds: Set<string>): Promise<number> {
  if (!(await hasTable(client, INSTANCE_CATALOG_TABLE))) {
    return 0;
  }
  let deleted = 0;
  if (await hasColumn(client, INSTANCE_CATALOG_TABLE, 'owner_sect_id')) {
    deleted += await deleteRowsByOwnerSect(client, INSTANCE_CATALOG_TABLE, 'owner_sect_id', validSectIds);
  }
  if (await hasColumn(client, INSTANCE_CATALOG_TABLE, 'instance_id')) {
    deleted += await deleteRowsBySectInstance(client, INSTANCE_CATALOG_TABLE, validSectIds);
  }
  return deleted;
}

async function deleteOrphanSectInstanceRows(client: PoolClient, validSectIds: Set<string>): Promise<number> {
  let deleted = 0;
  for (const tableName of INSTANCE_DOMAIN_INSTANCE_TABLES) {
    if (!(await hasTable(client, tableName)) || !(await hasColumn(client, tableName, 'instance_id'))) {
      continue;
    }
    deleted += await deleteRowsBySectInstance(client, tableName, validSectIds);
  }
  return deleted;
}

async function deleteRowsByOwnerSect(
  client: PoolClient,
  tableName: string,
  ownerSectColumn: string,
  validSectIds: Set<string>,
): Promise<number> {
  const quotedTable = quoteIdentifier(tableName);
  const quotedColumn = quoteIdentifier(ownerSectColumn);
  if (validSectIds.size === 0) {
    const result = await client.query(`
      DELETE FROM ${quotedTable}
      WHERE NULLIF(btrim(${quotedColumn}), '') IS NOT NULL
    `);
    return Number(result.rowCount ?? 0);
  }
  const result = await client.query(
    `
      DELETE FROM ${quotedTable}
      WHERE NULLIF(btrim(${quotedColumn}), '') IS NOT NULL
        AND NOT (btrim(${quotedColumn}) = ANY($1::varchar[]))
    `,
    [[...validSectIds]],
  );
  return Number(result.rowCount ?? 0);
}

async function deleteRowsBySectInstance(
  client: PoolClient,
  tableName: string,
  validSectIds: Set<string>,
): Promise<number> {
  const quotedTable = quoteIdentifier(tableName);
  if (validSectIds.size === 0) {
    const result = await client.query(`
      DELETE FROM ${quotedTable}
      WHERE starts_with(instance_id, 'sect:')
    `);
    return Number(result.rowCount ?? 0);
  }
  const result = await client.query(
    `
      DELETE FROM ${quotedTable}
      WHERE starts_with(instance_id, 'sect:')
        AND NOT EXISTS (
          SELECT 1
          FROM unnest($1::varchar[]) AS valid_sect(sect_id)
          WHERE starts_with(instance_id, 'sect:' || valid_sect.sect_id || ':')
        )
    `,
    [[...validSectIds]],
  );
  return Number(result.rowCount ?? 0);
}

async function cleanupOrphanSectRuntimePortals(
  client: PoolClient,
  validSectIds: Set<string>,
): Promise<Pick<PostgresRestoreSectCleanupReport, 'overlayChunksUpdated' | 'overlayChunksDeleted' | 'overlayPortalEntriesRemoved'>> {
  const report = {
    overlayChunksUpdated: 0,
    overlayChunksDeleted: 0,
    overlayPortalEntriesRemoved: 0,
  };
  if (!(await hasTable(client, 'instance_overlay_chunk'))) {
    return report;
  }
  const requiredColumns = ['instance_id', 'patch_kind', 'chunk_key', 'patch_payload'];
  for (const column of requiredColumns) {
    if (!(await hasColumn(client, 'instance_overlay_chunk', column))) {
      return report;
    }
  }
  const result = await client.query(`
    SELECT instance_id, patch_kind, chunk_key, patch_payload
    FROM instance_overlay_chunk
    WHERE patch_kind = 'portal'
  `);
  for (const row of result.rows ?? []) {
    const payload = row?.patch_payload && typeof row.patch_payload === 'object' ? row.patch_payload : null;
    const portals = Array.isArray(payload?.portals) ? payload.portals : null;
    if (!portals) {
      continue;
    }
    const keptPortals = portals.filter((portal) => !isOrphanSectPortal(portal, validSectIds));
    const removed = portals.length - keptPortals.length;
    if (removed <= 0) {
      continue;
    }
    report.overlayPortalEntriesRemoved += removed;
    if (keptPortals.length === 0) {
      await client.query(
        `
          DELETE FROM instance_overlay_chunk
          WHERE instance_id = $1 AND patch_kind = $2 AND chunk_key = $3
        `,
        [row.instance_id, row.patch_kind, row.chunk_key],
      );
      report.overlayChunksDeleted += 1;
      continue;
    }
    await client.query(
      `
        UPDATE instance_overlay_chunk
        SET patch_payload = $4::jsonb, updated_at = now()
        WHERE instance_id = $1 AND patch_kind = $2 AND chunk_key = $3
      `,
      [
        row.instance_id,
        row.patch_kind,
        row.chunk_key,
        JSON.stringify({
          ...payload,
          portals: keptPortals,
        }),
      ],
    );
    report.overlayChunksUpdated += 1;
  }
  return report;
}

function isOrphanSectPortal(portal: unknown, validSectIds: Set<string>): boolean {
  if (!portal || typeof portal !== 'object') {
    return false;
  }
  const portalRecord = portal as Record<string, unknown>;
  const sectId = normalizeString(portalRecord.sectId);
  if (sectId) {
    return !validSectIds.has(sectId);
  }
  const targetInstanceId = normalizeString(portalRecord.targetInstanceId);
  const targetSectId = parseSectIdFromSectInstanceId(targetInstanceId);
  return Boolean(targetSectId) && !validSectIds.has(targetSectId);
}

function parseSectIdFromSectInstanceId(instanceId: string): string {
  if (!instanceId.startsWith('sect:') || !instanceId.endsWith(':main')) {
    return '';
  }
  return instanceId.slice('sect:'.length, -':main'.length);
}

async function hasTable(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query('SELECT to_regclass($1) AS relation_name', [tableName]);
  return Boolean(result.rows?.[0]?.relation_name);
}

async function hasColumn(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = ANY(current_schemas(false))
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName],
  );
  return Boolean(result.rows?.[0]?.exists);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

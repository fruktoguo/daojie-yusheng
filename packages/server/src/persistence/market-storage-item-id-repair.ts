import type { Pool, PoolClient } from 'pg';

const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const MARKET_STORAGE_ITEM_ID_REPAIR_SAMPLE_LIMIT = 10;

export interface MarketStorageItemIdRepairSample {
  playerId: string;
  slotIndex: number;
  oldStorageItemId: string;
  nextStorageItemId: string;
}

export interface MarketStorageItemIdRepairStats {
  mismatchedRows: number;
  affectedPlayers: number;
  invalidSlotRows: number;
  sample: MarketStorageItemIdRepairSample[];
}

export interface MarketStorageItemIdRepairResult {
  ok: true;
  before: MarketStorageItemIdRepairStats;
  after: MarketStorageItemIdRepairStats;
  repairedRows: number;
  repairedPlayers: number;
  repairedSample: MarketStorageItemIdRepairSample[];
  repairedAt: string;
}

type QueryableClient = Pick<PoolClient, 'query'>;

export async function readMarketStorageItemIdRepairStats(client: QueryableClient): Promise<MarketStorageItemIdRepairStats> {
  const summary = await client.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE slot_index >= 0
          AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
      )::bigint AS mismatched_rows,
      COUNT(DISTINCT player_id) FILTER (
        WHERE slot_index >= 0
          AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
      )::bigint AS affected_players,
      COUNT(*) FILTER (WHERE slot_index < 0)::bigint AS invalid_slot_rows
    FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
  `);
  const sample = await client.query(`
    SELECT
      player_id,
      slot_index,
      storage_item_id,
      ('market_storage:' || player_id || ':' || slot_index::text) AS next_storage_item_id
    FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
    WHERE slot_index >= 0
      AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
    ORDER BY player_id ASC, slot_index ASC, storage_item_id ASC
    LIMIT $1
  `, [MARKET_STORAGE_ITEM_ID_REPAIR_SAMPLE_LIMIT]);
  return {
    mismatchedRows: toNonNegativeInteger(summary.rows[0]?.mismatched_rows),
    affectedPlayers: toNonNegativeInteger(summary.rows[0]?.affected_players),
    invalidSlotRows: toNonNegativeInteger(summary.rows[0]?.invalid_slot_rows),
    sample: sample.rows.map((row) => ({
      playerId: String(row.player_id ?? ''),
      slotIndex: toInteger(row.slot_index),
      oldStorageItemId: String(row.storage_item_id ?? ''),
      nextStorageItemId: String(row.next_storage_item_id ?? ''),
    })),
  };
}

export async function repairMarketStorageItemIds(pool: Pool): Promise<MarketStorageItemIdRepairResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`LOCK TABLE ${PLAYER_MARKET_STORAGE_ITEM_TABLE} IN SHARE ROW EXCLUSIVE MODE`);
    const before = await readMarketStorageItemIdRepairStats(client);
    const repair = await client.query(`
      WITH candidates AS (
        SELECT
          storage_item_id AS old_storage_item_id,
          player_id,
          slot_index,
          ('market_storage:' || player_id || ':' || slot_index::text) AS next_storage_item_id
        FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
        WHERE slot_index >= 0
          AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
      ),
      updated AS (
        UPDATE ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
           SET storage_item_id = candidates.next_storage_item_id,
               updated_at = now()
          FROM candidates
         WHERE target.storage_item_id = candidates.old_storage_item_id
        RETURNING
          candidates.player_id,
          candidates.slot_index,
          candidates.old_storage_item_id,
          candidates.next_storage_item_id
      )
      SELECT
        COUNT(*)::bigint AS repaired_rows,
        COUNT(DISTINCT player_id)::bigint AS repaired_players,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'playerId', player_id,
              'slotIndex', slot_index,
              'oldStorageItemId', old_storage_item_id,
              'nextStorageItemId', next_storage_item_id
            )
            ORDER BY player_id ASC, slot_index ASC, old_storage_item_id ASC
          ) FILTER (WHERE player_id IS NOT NULL),
          '[]'::jsonb
        ) AS repaired_sample
      FROM updated
    `);
    const after = await readMarketStorageItemIdRepairStats(client);
    if (after.mismatchedRows > 0 || after.invalidSlotRows > 0) {
      await client.query('ROLLBACK');
      throw new Error(`market storage item id repair incomplete: mismatchedRows=${after.mismatchedRows} invalidSlotRows=${after.invalidSlotRows}`);
    }
    await client.query('COMMIT');
    const row = repair.rows[0] ?? {};
    return {
      ok: true,
      before,
      after,
      repairedRows: toNonNegativeInteger(row.repaired_rows),
      repairedPlayers: toNonNegativeInteger(row.repaired_players),
      repairedSample: parseRepairSample(row.repaired_sample),
      repairedAt: new Date().toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function parseRepairSample(value: unknown): MarketStorageItemIdRepairSample[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, MARKET_STORAGE_ITEM_ID_REPAIR_SAMPLE_LIMIT).map((entry) => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return {
      playerId: String(row.playerId ?? ''),
      slotIndex: toInteger(row.slotIndex),
      oldStorageItemId: String(row.oldStorageItemId ?? ''),
      nextStorageItemId: String(row.nextStorageItemId ?? ''),
    };
  });
}

function toNonNegativeInteger(value: unknown): number {
  return Math.max(0, toInteger(value));
}

function toInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

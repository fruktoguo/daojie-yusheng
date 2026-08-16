import type { Pool, PoolClient } from 'pg';

const PLAYER_FLUSH_LEDGER_TABLE = 'player_flush_ledger';
const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const STARTUP_STALL_QUARANTINE = 'startup_deterministic_stall';
const DELETED_RESIDUE_SAMPLE_LIMIT = 100;

export interface PlayerFlushStartupStallReleaseOptions {
  dryRun?: boolean;
}

export interface PlayerFlushStartupStallReleaseResult {
  ok: true;
  dryRun: boolean;
  playerId: string;
  skipped: boolean;
  skippedReason?: string;
  stalledLedgerRows: number;
  stalledDomains: string[];
  marketStorageResidueRows: number;
  deletedMarketStorageResidueRows: number;
  releasedLedgerRows: number;
  deletedResidueSample: Record<string, unknown>[];
  releasedAt: string;
}

type QueryableClient = Pick<PoolClient, 'query'>;

/**
 * 解除指定玩家的 startup_deterministic_stall 启动隔离，并把该玩家的
 * player_market_storage_item 残留投影行对齐到内存快照（空）。
 *
 * 语义与触发条件：
 * - 仅当该玩家存在 failure_category='startup_deterministic_stall' 且
 *   latest_version > flushed_version 的 ledger 行时才执行；否则返回 skipped，
 *   避免误删正常市场存储数据。
 * - 只解除 startup_deterministic_stall 类别，不触碰 startup_asset_conflict
 *   （资产归属争议必须人工核对）。
 * - 残留行删除与隔离解除在同一事务内提交；删除的行完整内容通过
 *   deletedResidueSample 返回，由调用方写入审计日志，可回查。
 * - dryRun 只读不改，返回执行前现状。
 */
export async function releasePlayerFlushStartupStall(
  pool: Pool,
  playerIdInput: string,
  options: PlayerFlushStartupStallReleaseOptions = {},
): Promise<PlayerFlushStartupStallReleaseResult> {
  const playerId = String(playerIdInput ?? '').trim();
  if (!playerId) {
    throw new Error('releasePlayerFlushStartupStall: playerId 为空');
  }
  if (playerId.length > 120) {
    throw new Error('releasePlayerFlushStartupStall: playerId 过长');
  }
  const dryRun = options.dryRun === true;
  const stalled = await pool.query(
    `SELECT domain
     FROM ${PLAYER_FLUSH_LEDGER_TABLE}
     WHERE player_id = $1
       AND failure_category = $2
       AND latest_version > flushed_version
     ORDER BY domain ASC`,
    [playerId, STARTUP_STALL_QUARANTINE],
  );
  const stalledRows = stalled.rows as Array<{ domain: unknown }>;
  const stalledDomains = stalledRows.map((row) => String(row.domain ?? '')).filter(Boolean).sort();
  const stalledLedgerRows = stalledRows.length;
  if (stalledLedgerRows === 0) {
    return {
      ok: true,
      dryRun,
      playerId,
      skipped: true,
      skippedReason: '该玩家没有 startup_deterministic_stall 隔离行，无需处理',
      stalledLedgerRows: 0,
      stalledDomains: [],
      marketStorageResidueRows: 0,
      deletedMarketStorageResidueRows: 0,
      releasedLedgerRows: 0,
      deletedResidueSample: [],
      releasedAt: new Date().toISOString(),
    };
  }
  const residues = await pool.query(
    `SELECT * FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
     WHERE player_id = $1
     ORDER BY slot_index ASC NULLS LAST, storage_item_id ASC NULLS LAST`,
    [playerId],
  );
  const residueRows = residues.rows as Record<string, unknown>[];
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      playerId,
      skipped: false,
      stalledLedgerRows,
      stalledDomains,
      marketStorageResidueRows: residueRows.length,
      deletedMarketStorageResidueRows: 0,
      releasedLedgerRows: 0,
      deletedResidueSample: [],
      releasedAt: new Date().toISOString(),
    };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let deletedMarketStorageResidueRows = 0;
    if (residueRows.length > 0) {
      const deleted = await client.query(
        `DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = $1`,
        [playerId],
      );
      deletedMarketStorageResidueRows = deleted.rowCount ?? 0;
    }
    const released = await client.query(
      `UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
       SET failure_category = NULL, updated_at = now()
       WHERE player_id = $1 AND failure_category = $2`,
      [playerId, STARTUP_STALL_QUARANTINE],
    );
    await client.query('COMMIT');
    return {
      ok: true,
      dryRun: false,
      playerId,
      skipped: false,
      stalledLedgerRows,
      stalledDomains,
      marketStorageResidueRows: residueRows.length,
      deletedMarketStorageResidueRows,
      releasedLedgerRows: released.rowCount ?? 0,
      deletedResidueSample: residueRows.slice(0, DELETED_RESIDUE_SAMPLE_LIMIT),
      releasedAt: new Date().toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** 只读查看某玩家当前隔离与残留现状（供 GM 诊断/审计复用）。 */
export async function readPlayerFlushStartupStallState(
  client: QueryableClient,
  playerId: string,
): Promise<{
  stalledLedgerRows: number;
  stalledDomains: string[];
  marketStorageResidueRows: number;
}> {
  const stalled = await client.query(
    `SELECT domain
     FROM ${PLAYER_FLUSH_LEDGER_TABLE}
     WHERE player_id = $1
       AND failure_category = $2
       AND latest_version > flushed_version
     ORDER BY domain ASC`,
    [playerId, STARTUP_STALL_QUARANTINE],
  );
  const stalledRows = stalled.rows as Array<{ domain: unknown }>;
  const residues = await client.query(
    `SELECT COUNT(*)::bigint AS row_count FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = $1`,
    [playerId],
  );
  return {
    stalledLedgerRows: stalledRows.length,
    stalledDomains: stalledRows.map((row) => String(row.domain ?? '')).filter(Boolean).sort(),
    marketStorageResidueRows: toNonNegativeInteger(residues.rows[0]?.row_count),
  };
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

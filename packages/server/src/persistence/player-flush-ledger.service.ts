import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

const PLAYER_FLUSH_LEDGER_TABLE = 'player_flush_ledger';
const FLUSH_LEDGER_LOCK_NAMESPACE = 42871;
const FLUSH_LEDGER_LOCK_KEY = 4001;

const CREATE_PLAYER_FLUSH_LEDGER_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_FLUSH_LEDGER_TABLE} (
    player_id varchar(100) NOT NULL,
    domain varchar(64) NOT NULL,
    latest_version bigint NOT NULL DEFAULT 0,
    flushed_version bigint NOT NULL DEFAULT 0,
    dirty_since_at timestamptz,
    next_attempt_at timestamptz,
    claimed_by varchar(120),
    claim_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, domain)
  )
`;

const CREATE_PLAYER_FLUSH_LEDGER_DOMAIN_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS player_flush_ledger_domain_idx
  ON ${PLAYER_FLUSH_LEDGER_TABLE}(domain, next_attempt_at, claim_until)
`;

const CREATE_PLAYER_FLUSH_LEDGER_DIRTY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS player_flush_ledger_dirty_idx
  ON ${PLAYER_FLUSH_LEDGER_TABLE}(dirty_since_at, next_attempt_at)
`;

@Injectable()
export class PlayerFlushLedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerFlushLedgerService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('player-flush-ledger') ?? null;
    if (!this.pool) {
      this.logger.log('player flush ledger 已禁用：未提供数据库连接');
      return;
    }
    try {
      await ensurePlayerFlushLedgerTable(this.pool);
      this.enabled = true;
      this.logger.log('player flush ledger 已启用');
    } catch (error: unknown) {
      this.logger.error(
        `初始化 player flush ledger 失败：${error instanceof Error ? error.stack || error.message : String(error)}`,
      );
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.enabled = false;
    if (this.pool) {
      const pool = this.pool;
      this.pool = null;
      await pool.end().catch(() => undefined);
    }
  }

  isEnabled(): boolean {
    return this.enabled && Boolean(this.pool);
  }

  async seedDirtyPlayers(input: {
    playerIds: string[];
    domain: string;
    latestVersion?: number;
  }): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const domain = normalizeRequiredString(input.domain);
    const playerIds = Array.isArray(input.playerIds)
      ? Array.from(new Set(input.playerIds.map((playerId) => normalizeRequiredString(playerId)).filter(Boolean)))
      : [];
    if (!domain || playerIds.length === 0) {
      return 0;
    }
    const latestVersion = normalizePositiveInteger(input.latestVersion, Date.now(), 0, Number.MAX_SAFE_INTEGER);
    const result = await this.pool.query(
      `
        INSERT INTO ${PLAYER_FLUSH_LEDGER_TABLE}(
          player_id, domain, latest_version, flushed_version, dirty_since_at,
          next_attempt_at, claimed_by, claim_until, updated_at
        )
        SELECT player_id, $2, $3, 0, now(), now(), NULL, NULL, now()
        FROM unnest($1::varchar[]) AS player_id
        ON CONFLICT (player_id, domain) DO UPDATE
        SET
          latest_version = GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
          dirty_since_at = COALESCE(${PLAYER_FLUSH_LEDGER_TABLE}.dirty_since_at, EXCLUDED.dirty_since_at),
          next_attempt_at = LEAST(
            COALESCE(${PLAYER_FLUSH_LEDGER_TABLE}.next_attempt_at, now()),
            COALESCE(EXCLUDED.next_attempt_at, now())
          ),
          updated_at = now()
        RETURNING player_id
      `,
      [playerIds, domain, latestVersion],
    );
    return result.rowCount ?? 0;
  }

  async claimReadyPlayers(input: {
    workerId: string;
    domain?: string;
    limit?: number;
    claimTtlMs?: number;
  }): Promise<Array<{ playerId: string; domain: string; latestVersion: number }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    if (!workerId) {
      return [];
    }
    const domain = normalizeRequiredString(input.domain);
    const limit = normalizePositiveInteger(input.limit, 32, 1, 256);
    const claimTtlMs = normalizePositiveInteger(input.claimTtlMs, 15_000, 1_000, 300_000);
    const domainFilter = domain ? 'AND domain = $4' : '';
    const queryParams = domain ? [workerId, claimTtlMs, limit, domain] : [workerId, claimTtlMs, limit];
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
          SET claimed_by = $1,
              claim_until = now() + ($2::bigint * interval '1 millisecond')
          WHERE (player_id, domain) IN (
            SELECT player_id, domain
            FROM ${PLAYER_FLUSH_LEDGER_TABLE}
            WHERE latest_version > flushed_version
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
              AND (claim_until IS NULL OR claim_until < now())
              ${domainFilter}
            ORDER BY dirty_since_at ASC NULLS LAST, updated_at ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          RETURNING player_id, domain, latest_version
        )
        SELECT player_id, domain, latest_version
        FROM claimed
        ORDER BY domain ASC, player_id ASC
      `,
      queryParams,
    );
    return Array.isArray(result.rows)
      ? (result.rows as Array<{ player_id?: unknown; domain?: unknown; latest_version?: unknown }>).map((row) => ({
          playerId: normalizeRequiredString(row.player_id),
          domain: normalizeRequiredString(row.domain),
          latestVersion: normalizePositiveInteger(row.latest_version, 0, 0, Number.MAX_SAFE_INTEGER),
        })).filter((row) => Boolean(row.playerId) && Boolean(row.domain))
      : [];
  }

  async markFlushed(input: {
    playerId: string;
    domain: string;
    flushedVersion?: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return false;
    }
    const flushedVersion = normalizePositiveInteger(input.flushedVersion, Date.now(), 0, Number.MAX_SAFE_INTEGER);
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET
          flushed_version = GREATEST(flushed_version, $3),
          dirty_since_at = CASE
            WHEN GREATEST(flushed_version, $3) >= latest_version THEN NULL
            ELSE dirty_since_at
          END,
          next_attempt_at = CASE
            WHEN GREATEST(flushed_version, $3) >= latest_version THEN NULL
            ELSE now()
          END,
          claimed_by = NULL,
          claim_until = NULL,
          updated_at = now()
        WHERE player_id = $1
          AND domain = $2
      `,
      [playerId, domain, flushedVersion],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markRetry(input: {
    playerId: string;
    domain: string;
    retryDelayMs?: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return false;
    }
    const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, 5_000, 250, 300_000);
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET
          next_attempt_at = now() + ($3::bigint * interval '1 millisecond'),
          claimed_by = NULL,
          claim_until = NULL,
          updated_at = now()
        WHERE player_id = $1
          AND domain = $2
      `,
      [playerId, domain, retryDelayMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listLedgerRows(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT
          player_id,
          domain,
          latest_version,
          flushed_version,
          dirty_since_at,
          next_attempt_at,
          claimed_by,
          claim_until,
          updated_at
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        ORDER BY domain ASC, player_id ASC
      `,
    );
    return Array.isArray(result.rows) ? (result.rows as Array<Record<string, unknown>>) : [];
  }
}

async function ensurePlayerFlushLedgerTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_lock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY]);
    await client.query(CREATE_PLAYER_FLUSH_LEDGER_TABLE_SQL);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = '${PLAYER_FLUSH_LEDGER_TABLE}'
            AND column_name = 'dirty_since_at'
            AND data_type = 'bigint'
        ) THEN
          ALTER TABLE ${PLAYER_FLUSH_LEDGER_TABLE}
          ALTER COLUMN dirty_since_at TYPE timestamptz
          USING CASE
            WHEN dirty_since_at IS NULL THEN NULL
            ELSE to_timestamp(dirty_since_at::double precision / 1000)
          END;
        END IF;
      END $$;
    `);
    await client.query(CREATE_PLAYER_FLUSH_LEDGER_DOMAIN_INDEX_SQL);
    await client.query(CREATE_PLAYER_FLUSH_LEDGER_DIRTY_INDEX_SQL);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

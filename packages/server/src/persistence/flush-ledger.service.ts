import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

const PLAYER_FLUSH_LEDGER_TABLE = 'player_flush_ledger';
const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';
const FLUSH_LEDGER_LOCK_NAMESPACE = 42871;
const FLUSH_LEDGER_LOCK_KEY = 4001;

@Injectable()
export class FlushLedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlushLedgerService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('flush-ledger') ?? null;
    if (!this.pool) {
      this.logger.log('刷盘 ledger 已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    try {
      await ensurePlayerFlushLedgerTable(this.pool);
      await ensureInstanceFlushLedgerTable(this.pool);
      this.enabled = true;
      this.logger.log('刷盘 ledger 已启用');
    } catch (error: unknown) {
      this.logger.error('刷盘 ledger 初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async upsertPlayerFlushLedger(input: {
    playerId: string;
    domain: string;
    latestVersion: number;
    flushedVersion?: number;
    dirtySinceAt?: string | null;
    nextAttemptAt?: string | null;
    claimedBy?: string | null;
    claimUntil?: string | null;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return;
    }
    await this.pool.query(
      `
        INSERT INTO ${PLAYER_FLUSH_LEDGER_TABLE}(
          player_id, domain, latest_version, flushed_version, dirty_since_at, next_attempt_at, claimed_by, claim_until, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        ON CONFLICT (player_id, domain)
        DO UPDATE SET
          latest_version = GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
          flushed_version = GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version),
          dirty_since_at = COALESCE(EXCLUDED.dirty_since_at, ${PLAYER_FLUSH_LEDGER_TABLE}.dirty_since_at),
          next_attempt_at = COALESCE(EXCLUDED.next_attempt_at, ${PLAYER_FLUSH_LEDGER_TABLE}.next_attempt_at),
          claimed_by = COALESCE(EXCLUDED.claimed_by, ${PLAYER_FLUSH_LEDGER_TABLE}.claimed_by),
          claim_until = COALESCE(EXCLUDED.claim_until, ${PLAYER_FLUSH_LEDGER_TABLE}.claim_until),
          updated_at = now()
      `,
      [
        playerId,
        domain,
        Math.max(0, Math.trunc(Number(input.latestVersion ?? 0))),
        Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0))),
        input.dirtySinceAt ?? null,
        input.nextAttemptAt ?? null,
        input.claimedBy ?? null,
        input.claimUntil ?? null,
      ],
    );
  }

  async upsertInstanceFlushLedger(input: {
    instanceId: string;
    domain: string;
    ownershipEpoch: number;
    latestVersion: number;
    flushedVersion?: number;
    dirtySinceAt?: string | null;
    nextAttemptAt?: string | null;
    claimedBy?: string | null;
    claimUntil?: string | null;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    if (!instanceId || !domain) {
      return;
    }
    await this.pool.query(
      `
        INSERT INTO ${INSTANCE_FLUSH_LEDGER_TABLE}(
          instance_id, domain, ownership_epoch, latest_version, flushed_version, dirty_since_at, next_attempt_at, claimed_by, claim_until, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (instance_id, domain, ownership_epoch)
        DO UPDATE SET
          latest_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
          flushed_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version),
          dirty_since_at = COALESCE(EXCLUDED.dirty_since_at, ${INSTANCE_FLUSH_LEDGER_TABLE}.dirty_since_at),
          next_attempt_at = COALESCE(EXCLUDED.next_attempt_at, ${INSTANCE_FLUSH_LEDGER_TABLE}.next_attempt_at),
          claimed_by = COALESCE(EXCLUDED.claimed_by, ${INSTANCE_FLUSH_LEDGER_TABLE}.claimed_by),
          claim_until = COALESCE(EXCLUDED.claim_until, ${INSTANCE_FLUSH_LEDGER_TABLE}.claim_until),
          updated_at = now()
      `,
      [
        instanceId,
        domain,
        Math.max(0, Math.trunc(Number(input.ownershipEpoch ?? 0))),
        Math.max(0, Math.trunc(Number(input.latestVersion ?? 0))),
        Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0))),
        input.dirtySinceAt ?? null,
        input.nextAttemptAt ?? null,
        input.claimedBy ?? null,
        input.claimUntil ?? null,
      ],
    );
  }

  async claimPlayerFlushLedger(input: {
    workerId: string;
    domain: string;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    const domain = normalizeRequiredString(input.domain);
    if (!workerId || !domain) {
      return [];
    }
    const limit = normalizePositiveInteger(input.limit, 32, 1, 200);
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
          SET claimed_by = $1,
              claim_until = now() + interval '5 second'
          WHERE (player_id, domain) IN (
            SELECT player_id, domain
            FROM ${PLAYER_FLUSH_LEDGER_TABLE}
            WHERE domain = $2
              AND latest_version > flushed_version
              AND (claim_until IS NULL OR claim_until < now())
            ORDER BY dirty_since_at ASC NULLS LAST, updated_at ASC, player_id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          RETURNING player_id, domain, latest_version, flushed_version, dirty_since_at, next_attempt_at, claimed_by, claim_until, updated_at
        )
        SELECT * FROM claimed
      `,
      [workerId, domain, limit],
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async claimInstanceFlushLedger(input: {
    workerId: string;
    domain: string;
    ownershipEpoch?: number | null;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    const domain = normalizeRequiredString(input.domain);
    if (!workerId || !domain) {
      return [];
    }
    const limit = normalizePositiveInteger(input.limit, 32, 1, 200);
    const parsedOwnershipEpoch = Number(input.ownershipEpoch);
    const hasOwnershipEpochFilter = Number.isFinite(parsedOwnershipEpoch) && parsedOwnershipEpoch >= 0;
    const ownershipEpoch = hasOwnershipEpochFilter ? Math.trunc(parsedOwnershipEpoch) : null;
    const ownershipEpochFilter = hasOwnershipEpochFilter ? 'AND ownership_epoch = $3' : '';
    const queryParams = hasOwnershipEpochFilter
      ? [workerId, domain, ownershipEpoch, limit]
      : [workerId, domain, limit];
    const limitParam = hasOwnershipEpochFilter ? '$4' : '$3';
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
          SET claimed_by = $1,
              claim_until = now() + interval '5 second'
          WHERE (instance_id, domain, ownership_epoch) IN (
            SELECT instance_id, domain, ownership_epoch
            FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
            WHERE domain = $2
              ${ownershipEpochFilter}
              AND latest_version > flushed_version
              AND (claim_until IS NULL OR claim_until < now())
            ORDER BY dirty_since_at ASC NULLS LAST, updated_at ASC, instance_id ASC
            LIMIT ${limitParam}
            FOR UPDATE SKIP LOCKED
          )
          RETURNING instance_id, domain, ownership_epoch, latest_version, flushed_version, dirty_since_at, next_attempt_at, claimed_by, claim_until, updated_at
        )
        SELECT * FROM claimed
      `,
      queryParams,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async markPlayerFlushLedgerFlushed(input: { playerId: string; domain: string; flushedVersion: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET flushed_version = GREATEST(flushed_version, $3),
            dirty_since_at = CASE WHEN GREATEST(flushed_version, $3) >= latest_version THEN NULL ELSE dirty_since_at END,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            updated_at = now()
        WHERE player_id = $1 AND domain = $2
      `,
      [playerId, domain, Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0)))],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markInstanceFlushLedgerFlushed(input: { instanceId: string; domain: string; ownershipEpoch: number; flushedVersion: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    if (!instanceId || !domain) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
        SET flushed_version = GREATEST(flushed_version, $4),
            dirty_since_at = CASE WHEN GREATEST(flushed_version, $4) >= latest_version THEN NULL ELSE dirty_since_at END,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            updated_at = now()
        WHERE instance_id = $1 AND domain = $2 AND ownership_epoch = $3
      `,
      [instanceId, domain, Math.max(0, Math.trunc(Number(input.ownershipEpoch ?? 0))), Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0)))],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listPlayerBacklogSummary(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT
          domain,
          COUNT(*)::bigint AS backlog_count,
          COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_count,
          COUNT(*) FILTER (WHERE claimed_by IS NOT NULL AND claim_until >= now())::bigint AS claimed_count,
          COUNT(*) FILTER (WHERE next_attempt_at IS NOT NULL AND next_attempt_at > now())::bigint AS delayed_count,
          COALESCE(MIN(next_attempt_at), MIN(updated_at)) AS oldest_pending_at
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        GROUP BY domain
        ORDER BY backlog_count DESC, domain ASC
      `,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listInstanceBacklogSummary(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT
          domain,
          ownership_epoch,
          COUNT(*)::bigint AS backlog_count,
          COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_count,
          COUNT(*) FILTER (WHERE claimed_by IS NOT NULL AND claim_until >= now())::bigint AS claimed_count,
          COUNT(*) FILTER (WHERE next_attempt_at IS NOT NULL AND next_attempt_at > now())::bigint AS delayed_count,
          COALESCE(MIN(next_attempt_at), MIN(updated_at)) AS oldest_pending_at
        FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
        GROUP BY domain, ownership_epoch
        ORDER BY backlog_count DESC, domain ASC, ownership_epoch ASC
      `,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listPlayerRecentThroughputSummary(input?: { windowSeconds?: number }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const windowSeconds = normalizePositiveInteger(input?.windowSeconds, 60, 1, 86_400);
    const result = await this.pool.query(
      `
        SELECT
          domain,
          COUNT(*)::bigint AS write_count,
          ROUND(COUNT(*)::numeric / NULLIF($1::numeric, 0), 6) AS writes_per_second,
          COALESCE(MAX(updated_at), MAX(COALESCE(dirty_since_at, TO_CHAR(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::timestamptz)) AS latest_updated_at
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        WHERE updated_at >= now() - ($1::bigint * interval '1 second')
        GROUP BY domain
        ORDER BY write_count DESC, domain ASC
      `,
      [windowSeconds],
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listInstanceRecentThroughputSummary(input?: { windowSeconds?: number }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const windowSeconds = normalizePositiveInteger(input?.windowSeconds, 60, 1, 86_400);
    const result = await this.pool.query(
      `
        SELECT
          domain,
          ownership_epoch,
          COUNT(*)::bigint AS write_count,
          ROUND(COUNT(*)::numeric / NULLIF($1::numeric, 0), 6) AS writes_per_second,
          COALESCE(MAX(updated_at), MAX(COALESCE(dirty_since_at, now()))) AS latest_updated_at
        FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
        WHERE updated_at >= now() - ($1::bigint * interval '1 second')
        GROUP BY domain, ownership_epoch
        ORDER BY write_count DESC, domain ASC, ownership_epoch ASC
      `,
      [windowSeconds],
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  private async safeClosePool(): Promise<void> {
    if (!this.pool) {
      this.enabled = false;
      return;
    }
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    await pool.end().catch(() => undefined);
  }
}

async function ensurePlayerFlushLedgerTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_lock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_FLUSH_LEDGER_TABLE} (
        player_id varchar(100) NOT NULL,
        domain varchar(64) NOT NULL,
        latest_version bigint NOT NULL DEFAULT 0,
        flushed_version bigint NOT NULL DEFAULT 0,
        dirty_since_at timestamptz NULL,
        next_attempt_at timestamptz NULL,
        claimed_by varchar(120) NULL,
        claim_until timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, domain)
      )
    `);
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_flush_ledger_domain_pending_idx
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(domain, latest_version, flushed_version, claim_until, dirty_since_at, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_flush_ledger_claim_idx
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(claimed_by, claim_until)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceFlushLedgerTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_lock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY + 1]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_FLUSH_LEDGER_TABLE} (
        instance_id varchar(100) NOT NULL,
        domain varchar(64) NOT NULL,
        ownership_epoch bigint NOT NULL DEFAULT 0,
        latest_version bigint NOT NULL DEFAULT 0,
        flushed_version bigint NOT NULL DEFAULT 0,
        dirty_since_at timestamptz NULL,
        next_attempt_at timestamptz NULL,
        claimed_by varchar(120) NULL,
        claim_until timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, domain, ownership_epoch)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_flush_ledger_domain_pending_idx
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(domain, ownership_epoch, latest_version, flushed_version, claim_until, dirty_since_at, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_flush_ledger_claim_idx
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(claimed_by, claim_until)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY + 1]).catch(() => undefined);
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

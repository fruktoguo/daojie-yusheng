import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

const OUTBOX_EVENT_TABLE = 'outbox_event';
const DEAD_LETTER_EVENT_TABLE = 'dead_letter_event';
const OUTBOX_CONSUMER_DEDUPE_TABLE = 'outbox_consumer_dedupe';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('outbox-dispatcher') ?? null;
    if (!this.pool) {
      this.logger.log('outbox dispatcher 已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    this.enabled = true;
    this.logger.log('outbox dispatcher 已启用');
    await ensureDeadLetterEventTable(this.pool);
    await ensureOutboxConsumerDedupeTable(this.pool);
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async claimReadyEvents(input: {
    dispatcherId: string;
    claimTtlMs?: number;
    limit?: number;
    topicPrefixes?: string[];
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const dispatcherId = normalizeRequiredString(input.dispatcherId);
    if (!dispatcherId) {
      return [];
    }
    const claimTtlMs = normalizePositiveInteger(input.claimTtlMs, 30_000, 1_000, 300_000);
    const limit = normalizePositiveInteger(input.limit, 32, 1, 200);
    const topicPrefixes = Array.isArray(input.topicPrefixes)
      ? input.topicPrefixes.map((prefix) => normalizeRequiredString(prefix)).filter(Boolean)
      : [];
    const topicFilterClause = topicPrefixes.length > 0 ? 'AND topic LIKE ANY($4::text[])' : '';
    const queryParams = topicPrefixes.length > 0
      ? [dispatcherId, claimTtlMs, limit, topicPrefixes.map((prefix) => `${prefix}%`)]
      : [dispatcherId, claimTtlMs, limit];
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${OUTBOX_EVENT_TABLE}
          SET status = 'claimed',
              claimed_by = $1,
              claim_until = now() + ($2::bigint * interval '1 millisecond')
          WHERE event_id IN (
            SELECT event_id
            FROM ${OUTBOX_EVENT_TABLE}
            WHERE status IN ('ready', 'claimed')
              AND (next_retry_at IS NULL OR next_retry_at <= now())
              AND (claim_until IS NULL OR claim_until < now())
              ${topicFilterClause}
            ORDER BY created_at ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          RETURNING event_id, operation_id, topic, partition_key, payload_jsonb, status, attempt_count, claimed_by, claim_until, created_at
        )
        SELECT * FROM claimed
        ORDER BY created_at ASC
      `,
      queryParams,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async markDelivered(eventId: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedEventId = normalizeRequiredString(eventId);
    if (!normalizedEventId) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${OUTBOX_EVENT_TABLE}
        SET status = 'delivered',
            delivered_at = now(),
            claim_until = NULL
        WHERE event_id = $1
      `,
      [normalizedEventId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(eventId: string, retryDelayMs: number, maxAttempts = 8): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedEventId = normalizeRequiredString(eventId);
    if (!normalizedEventId) {
      return false;
    }
    const normalizedRetryDelayMs = normalizePositiveInteger(retryDelayMs, 5_000, 250, 86_400_000);
    const normalizedMaxAttempts = normalizePositiveInteger(maxAttempts, 8, 1, 100);
    const result = await this.pool.query(
      `
        UPDATE ${OUTBOX_EVENT_TABLE}
        SET attempt_count = attempt_count + 1,
            status = CASE
              WHEN attempt_count + 1 >= $3 THEN 'dead_letter'
              ELSE 'ready'
            END,
            next_retry_at = CASE
              WHEN attempt_count + 1 >= $3 THEN NULL
              ELSE now() + ($2::bigint * interval '1 millisecond')
            END,
            claimed_by = NULL,
            claim_until = NULL
        WHERE event_id = $1
      `,
      [normalizedEventId, normalizedRetryDelayMs, normalizedMaxAttempts],
    );
    if ((result.rowCount ?? 0) > 0) {
      const deadLettered = await this.pool.query(
        `
          SELECT event_id, operation_id, topic, partition_key, payload_jsonb, status, attempt_count, created_at
          FROM ${OUTBOX_EVENT_TABLE}
          WHERE event_id = $1 AND status = 'dead_letter'
        `,
        [normalizedEventId],
      );
      if (Array.isArray(deadLettered.rows) && deadLettered.rows.length > 0) {
        await insertDeadLetterEvent(this.pool, deadLettered.rows[0] as Record<string, unknown>);
      }
    }
    return (result.rowCount ?? 0) > 0;
  }

  async claimConsumerDedupe(input: {
    eventId: string;
    operationId?: string | null;
    topic?: string | null;
    consumerId: string;
    claimTtlMs?: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return true;
    }
    const eventId = normalizeRequiredString(input.eventId);
    const operationId = normalizeRequiredString(input.operationId);
    const consumerId = normalizeRequiredString(input.consumerId);
    const topic = normalizeRequiredString(input.topic);
    if (!eventId || !consumerId) {
      return false;
    }
    const claimTtlMs = normalizePositiveInteger(input.claimTtlMs, 30_000, 1_000, 300_000);
    const keys = buildConsumerDedupeKeys(eventId, operationId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const dedupeKey of keys) {
        const claimed = await client.query(
          `
            INSERT INTO ${OUTBOX_CONSUMER_DEDUPE_TABLE}(
              dedupe_key, event_id, operation_id, topic, state, claimed_by, claim_until, delivered_at, updated_at
            )
            VALUES ($1, $2, $3, $4, 'processing', $5, now() + ($6::bigint * interval '1 millisecond'), NULL, now())
            ON CONFLICT (dedupe_key)
            DO UPDATE
              SET event_id = EXCLUDED.event_id,
                  operation_id = EXCLUDED.operation_id,
                  topic = EXCLUDED.topic,
                  state = 'processing',
                  claimed_by = EXCLUDED.claimed_by,
                  claim_until = EXCLUDED.claim_until,
                  updated_at = now()
            WHERE ${OUTBOX_CONSUMER_DEDUPE_TABLE}.state <> 'delivered'
              AND (${OUTBOX_CONSUMER_DEDUPE_TABLE}.claim_until IS NULL OR ${OUTBOX_CONSUMER_DEDUPE_TABLE}.claim_until < now())
            RETURNING dedupe_key
          `,
          [dedupeKey, eventId, operationId || null, topic || null, consumerId, claimTtlMs],
        );
        if ((claimed.rowCount ?? 0) <= 0) {
          await client.query('ROLLBACK');
          return false;
        }
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async markConsumerDedupeDelivered(input: {
    eventId: string;
    operationId?: string | null;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const eventId = normalizeRequiredString(input.eventId);
    const operationId = normalizeRequiredString(input.operationId);
    if (!eventId) {
      return;
    }
    const keys = buildConsumerDedupeKeys(eventId, operationId);
    await this.pool.query(
      `
        UPDATE ${OUTBOX_CONSUMER_DEDUPE_TABLE}
        SET state = 'delivered',
            claim_until = NULL,
            delivered_at = now(),
            updated_at = now()
        WHERE dedupe_key = ANY($1::varchar[])
      `,
      [keys],
    );
  }

  async releaseConsumerDedupe(input: {
    eventId: string;
    operationId?: string | null;
    consumerId?: string | null;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const eventId = normalizeRequiredString(input.eventId);
    const operationId = normalizeRequiredString(input.operationId);
    const consumerId = normalizeRequiredString(input.consumerId);
    if (!eventId) {
      return;
    }
    const keys = buildConsumerDedupeKeys(eventId, operationId);
    if (consumerId) {
      await this.pool.query(
        `
          DELETE FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE}
          WHERE dedupe_key = ANY($1::varchar[])
            AND state = 'processing'
            AND claimed_by = $2
        `,
        [keys, consumerId],
      );
      return;
    }
    await this.pool.query(
      `
        DELETE FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE}
        WHERE dedupe_key = ANY($1::varchar[])
          AND state = 'processing'
      `,
      [keys],
    );
  }

  async listRetryQueue(input?: {
    limit?: number;
    topicPrefixes?: string[];
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const limit = normalizePositiveInteger(input?.limit, 100, 1, 500);
    const topicPrefixes = Array.isArray(input?.topicPrefixes)
      ? input.topicPrefixes.map((prefix) => normalizeRequiredString(prefix)).filter(Boolean)
      : [];
    const topicFilterClause = topicPrefixes.length > 0 ? 'AND topic LIKE ANY($2::text[])' : '';
    const queryParams = topicPrefixes.length > 0
      ? [limit, topicPrefixes.map((prefix) => `${prefix}%`)]
      : [limit];
    const result = await this.pool.query(
      `
        SELECT
          event_id,
          operation_id,
          topic,
          partition_key,
          status,
          attempt_count,
          next_retry_at,
          claimed_by,
          claim_until,
          created_at
        FROM ${OUTBOX_EVENT_TABLE}
        WHERE status IN ('ready', 'claimed', 'dead_letter')
          ${topicFilterClause}
        ORDER BY
          CASE status WHEN 'dead_letter' THEN 2 ELSE 0 END,
          COALESCE(next_retry_at, created_at) ASC,
          created_at ASC
        LIMIT $1
      `,
      queryParams,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listRecentThroughputSummary(input?: { windowSeconds?: number }): Promise<{
    readyCount: number;
    claimedCount: number;
    deliveredCount: number;
    deadLetterCount: number;
    writesPerSecond: number;
    latestDeliveredAt: string | null;
  }> {
    if (!this.pool || !this.enabled) {
      return {
        readyCount: 0,
        claimedCount: 0,
        deliveredCount: 0,
        deadLetterCount: 0,
        writesPerSecond: 0,
        latestDeliveredAt: null,
      };
    }
    const windowSeconds = normalizePositiveInteger(input?.windowSeconds, 60, 1, 86_400);
    const result = await this.pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'ready')::bigint AS ready_count,
          COUNT(*) FILTER (WHERE status = 'claimed')::bigint AS claimed_count,
          COUNT(*) FILTER (WHERE status = 'delivered' AND COALESCE(delivered_at, created_at) >= now() - ($1::bigint * interval '1 second'))::bigint AS delivered_count,
          COUNT(*) FILTER (WHERE status = 'dead_letter' AND created_at >= now() - ($1::bigint * interval '1 second'))::bigint AS dead_letter_count,
          ROUND(COUNT(*) FILTER (WHERE status = 'delivered' AND COALESCE(delivered_at, created_at) >= now() - ($1::bigint * interval '1 second'))::numeric / NULLIF($1::numeric, 0), 6) AS writes_per_second,
          COALESCE(MAX(delivered_at), MAX(created_at)) AS latest_delivered_at
        FROM ${OUTBOX_EVENT_TABLE}
      `,
      [windowSeconds],
    );
    const row = Array.isArray(result.rows) ? (result.rows[0] as Record<string, unknown> | undefined) : undefined;
    return {
      readyCount: normalizePositiveInteger(row?.ready_count, 0, 0, Number.MAX_SAFE_INTEGER),
      claimedCount: normalizePositiveInteger(row?.claimed_count, 0, 0, Number.MAX_SAFE_INTEGER),
      deliveredCount: normalizePositiveInteger(row?.delivered_count, 0, 0, Number.MAX_SAFE_INTEGER),
      deadLetterCount: normalizePositiveInteger(row?.dead_letter_count, 0, 0, Number.MAX_SAFE_INTEGER),
      writesPerSecond: Number(row?.writes_per_second ?? 0) || 0,
      latestDeliveredAt: row?.latest_delivered_at ? String(row.latest_delivered_at) : null,
    };
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

async function ensureDeadLetterEventTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${DEAD_LETTER_EVENT_TABLE} (
      dead_letter_id bigserial PRIMARY KEY,
      event_id varchar(120) NOT NULL,
      operation_id varchar(120),
      topic varchar(200) NOT NULL,
      partition_key varchar(200) NOT NULL,
      payload_jsonb jsonb NOT NULL,
      status varchar(32) NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0,
      failed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dead_letter_event_topic_idx
    ON ${DEAD_LETTER_EVENT_TABLE}(topic, failed_at DESC)
  `);
}

async function ensureOutboxConsumerDedupeTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${OUTBOX_CONSUMER_DEDUPE_TABLE} (
      dedupe_key varchar(180) PRIMARY KEY,
      event_id varchar(120) NOT NULL,
      operation_id varchar(120),
      topic varchar(200),
      state varchar(32) NOT NULL DEFAULT 'processing',
      claimed_by varchar(120),
      claim_until timestamptz,
      delivered_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS outbox_consumer_dedupe_event_idx
    ON ${OUTBOX_CONSUMER_DEDUPE_TABLE}(event_id, updated_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS outbox_consumer_dedupe_operation_idx
    ON ${OUTBOX_CONSUMER_DEDUPE_TABLE}(operation_id, updated_at DESC)
    WHERE operation_id IS NOT NULL
  `);
}

function buildConsumerDedupeKeys(eventId: string, operationId: string): string[] {
  const keys = [`event:${eventId}`];
  if (operationId) {
    keys.push(`op:${operationId}`);
  }
  return keys;
}

async function insertDeadLetterEvent(pool: Pool, row: Record<string, unknown>): Promise<void> {
  const eventId = normalizeRequiredString(row.event_id);
  const topic = normalizeRequiredString(row.topic);
  const partitionKey = normalizeRequiredString(row.partition_key);
  if (!eventId || !topic || !partitionKey) {
    return;
  }
  await pool.query(
    `
      INSERT INTO ${DEAD_LETTER_EVENT_TABLE}(
        event_id, operation_id, topic, partition_key, payload_jsonb, status, attempt_count, failed_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), COALESCE($8::timestamptz, now()))
      ON CONFLICT DO NOTHING
    `,
    [
      eventId,
      row.operation_id ?? null,
      topic,
      partitionKey,
      JSON.stringify(row.payload_jsonb ?? {}),
      normalizeRequiredString(row.status) || 'dead_letter',
      normalizePositiveInteger(row.attempt_count, 0, 0, Number.MAX_SAFE_INTEGER),
      row.created_at ?? null,
    ],
  );
}

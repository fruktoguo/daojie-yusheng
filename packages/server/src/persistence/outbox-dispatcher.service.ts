/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { ensureBigintColumnType } from './schema-bigint-migration';

const OUTBOX_EVENT_TABLE = 'outbox_event';
const DEAD_LETTER_EVENT_TABLE = 'dead_letter_event';
const OUTBOX_CONSUMER_DEDUPE_TABLE = 'outbox_consumer_dedupe';
const OUTBOX_DEDUPE_KEY_MAX_LENGTH = 180;
const OUTBOX_CLAIM_BATCH_OWNER_MAX_LENGTH = 86;

export interface OutboxRetentionResult {
  deliveredEventsDeleted: number;
  consumerDedupeDeleted: number;
}

export type OutboxConsumerDedupeClaimStatus = 'claimed' | 'processing' | 'delivered' | 'stale';

export interface OutboxConsumerDedupeClaimResult {
  status: OutboxConsumerDedupeClaimStatus;
}

export type OutboxConsumerDedupeCompletionStatus = 'delivered' | 'processing' | 'missing';

/** Outbox 事件分发服务：认领、投递、重试、死信和去重 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('outbox-dispatcher') ?? null;
    if (!this.pool) {
      this.logger.log('发件箱调度器已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    this.enabled = true;
    this.logger.log('发件箱调度器已启用');
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
    const limit = normalizePositiveInteger(input.limit, 128, 1, 1024);
    const topicPrefixLikePatterns = buildTopicPrefixLikePatterns(input.topicPrefixes);
    const claimBatchOwner = buildOutboxClaimBatchOwner(dispatcherId);
    const topicFilterClause = topicPrefixLikePatterns.length > 0 ? 'AND topic LIKE ANY($4::text[])' : '';
    const queryParams = topicPrefixLikePatterns.length > 0
      ? [claimBatchOwner, claimTtlMs, limit, topicPrefixLikePatterns]
      : [claimBatchOwner, claimTtlMs, limit];
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${OUTBOX_EVENT_TABLE}
          SET status = 'claimed',
              claimed_by = $1 || ':' || md5(event_id),
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

  async markDelivered(input: { eventId: string; claimOwner: string }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedEventId = normalizeRequiredString(input.eventId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    if (!normalizedEventId || !claimOwner) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${OUTBOX_EVENT_TABLE}
        SET status = 'delivered',
            delivered_at = now(),
            next_retry_at = NULL,
            claimed_by = NULL,
            claim_until = NULL
        WHERE event_id = $1
          AND status = 'claimed'
          AND claimed_by = $2
      `,
      [normalizedEventId, claimOwner],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deferClaim(input: { eventId: string; claimOwner: string; retryDelayMs?: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedEventId = normalizeRequiredString(input.eventId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    if (!normalizedEventId || !claimOwner) {
      return false;
    }
    const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, 1_000, 250, 300_000);
    const result = await this.pool.query(
      `
        UPDATE ${OUTBOX_EVENT_TABLE}
        SET status = 'ready',
            next_retry_at = now() + ($3::bigint * interval '1 millisecond'),
            claimed_by = NULL,
            claim_until = NULL
        WHERE event_id = $1
          AND status = 'claimed'
          AND claimed_by = $2
      `,
      [normalizedEventId, claimOwner, retryDelayMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(input: {
    eventId: string;
    claimOwner: string;
    retryDelayMs: number;
    maxAttempts?: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedEventId = normalizeRequiredString(input.eventId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    if (!normalizedEventId || !claimOwner) {
      return false;
    }
    const normalizedRetryDelayMs = normalizePositiveInteger(input.retryDelayMs, 5_000, 250, 86_400_000);
    const normalizedMaxAttempts = normalizePositiveInteger(input.maxAttempts, 8, 1, 100);
    const dedupeKey = buildConsumerEventDedupeKey(normalizedEventId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `
          UPDATE ${OUTBOX_EVENT_TABLE}
          SET attempt_count = attempt_count + 1,
              status = CASE
                WHEN attempt_count + 1 >= $4 THEN 'dead_letter'
                ELSE 'ready'
              END,
              next_retry_at = CASE
                WHEN attempt_count + 1 >= $4 THEN NULL
                ELSE now() + ($3::bigint * interval '1 millisecond')
              END,
              claimed_by = NULL,
              claim_until = NULL
          WHERE event_id = $1
            AND status = 'claimed'
            AND claimed_by = $2
          RETURNING event_id, operation_id, topic, partition_key, payload_jsonb, status, attempt_count, created_at
        `,
        [normalizedEventId, claimOwner, normalizedRetryDelayMs, normalizedMaxAttempts],
      );
      await client.query(
        `
          DELETE FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE}
          WHERE dedupe_key = $1
            AND state = 'processing'
            AND claimed_by = $2
        `,
        [dedupeKey, claimOwner],
      );
      const transitioned = Array.isArray(result.rows)
        ? (result.rows[0] as Record<string, unknown> | undefined)
        : undefined;
      if (transitioned && normalizeRequiredString(transitioned.status) === 'dead_letter') {
        await insertDeadLetterEventWithClient(client, transitioned);
        const deletedSource = await client.query(
          `DELETE FROM ${OUTBOX_EVENT_TABLE} WHERE event_id = $1 AND status = 'dead_letter'`,
          [normalizedEventId],
        );
        if ((deletedSource.rowCount ?? 0) !== 1) {
          throw new Error(`outbox_dead_letter_source_delete_failed:${normalizedEventId}`);
        }
      }
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimConsumerDedupe(input: {
    eventId: string;
    operationId?: string | null;
    topic?: string | null;
    claimOwner: string;
    claimTtlMs?: number;
  }): Promise<OutboxConsumerDedupeClaimResult> {
    if (!this.pool || !this.enabled) {
      return { status: 'claimed' };
    }
    const eventId = normalizeRequiredString(input.eventId);
    const operationId = normalizeRequiredString(input.operationId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    const topic = normalizeRequiredString(input.topic);
    if (!eventId || !claimOwner) {
      return { status: 'processing' };
    }
    const claimTtlMs = normalizePositiveInteger(input.claimTtlMs, 30_000, 1_000, 300_000);
    const dedupeKey = buildConsumerEventDedupeKey(eventId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ownedClaim = await client.query(
        `
          SELECT event_id
          FROM ${OUTBOX_EVENT_TABLE}
          WHERE event_id = $1
            AND status = 'claimed'
            AND claimed_by = $2
          FOR UPDATE
        `,
        [eventId, claimOwner],
      );
      if ((ownedClaim.rowCount ?? 0) <= 0) {
        await client.query('COMMIT');
        return { status: 'stale' };
      }
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
                delivered_at = NULL,
                updated_at = now()
          WHERE ${OUTBOX_CONSUMER_DEDUPE_TABLE}.state = 'processing'
            AND (${OUTBOX_CONSUMER_DEDUPE_TABLE}.claim_until IS NULL OR ${OUTBOX_CONSUMER_DEDUPE_TABLE}.claim_until < now())
          RETURNING dedupe_key
        `,
        [dedupeKey, eventId, operationId || null, topic || null, claimOwner, claimTtlMs],
      );
      if ((claimed.rowCount ?? 0) > 0) {
        await client.query('COMMIT');
        return { status: 'claimed' };
      }
      const existing = await client.query(
        `SELECT state FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE} WHERE dedupe_key = $1 LIMIT 1`,
        [dedupeKey],
      );
      const state = normalizeRequiredString(existing.rows[0]?.state);
      await client.query('COMMIT');
      return { status: state === 'delivered' ? 'delivered' : 'processing' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 同时续租 outbox 事件与 consumer 去重 claim。
   * 两个 claim 必须仍由同一 owner 持有；任一侧丢失都会整体回滚，调用方不得再确认或重试该事件。
   */
  async renewConsumerClaims(input: {
    eventId: string;
    claimOwner: string;
    claimTtlMs?: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return true;
    }
    const eventId = normalizeRequiredString(input.eventId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    if (!eventId || !claimOwner) {
      return false;
    }
    const claimTtlMs = normalizePositiveInteger(input.claimTtlMs, 30_000, 1_000, 300_000);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const eventClaim = await client.query(
        `
          UPDATE ${OUTBOX_EVENT_TABLE}
          SET claim_until = now() + ($3::bigint * interval '1 millisecond')
          WHERE event_id = $1
            AND status = 'claimed'
            AND claimed_by = $2
        `,
        [eventId, claimOwner, claimTtlMs],
      );
      if ((eventClaim.rowCount ?? 0) !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      const dedupeClaim = await client.query(
        `
          UPDATE ${OUTBOX_CONSUMER_DEDUPE_TABLE}
          SET claim_until = now() + ($3::bigint * interval '1 millisecond'),
              updated_at = now()
          WHERE dedupe_key = $1
            AND state = 'processing'
            AND claimed_by = $2
        `,
        [buildConsumerEventDedupeKey(eventId), claimOwner, claimTtlMs],
      );
      if ((dedupeClaim.rowCount ?? 0) !== 1) {
        await client.query('ROLLBACK');
        return false;
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
    claimOwner: string;
  }): Promise<OutboxConsumerDedupeCompletionStatus> {
    if (!this.pool || !this.enabled) {
      return 'delivered';
    }
    const eventId = normalizeRequiredString(input.eventId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    if (!eventId || !claimOwner) {
      return 'missing';
    }
    const dedupeKey = buildConsumerEventDedupeKey(eventId);
    const result = await this.pool.query(
      `
        WITH updated AS (
          UPDATE ${OUTBOX_CONSUMER_DEDUPE_TABLE}
          SET state = 'delivered',
              claim_until = NULL,
              delivered_at = now(),
              updated_at = now()
          WHERE dedupe_key = $1
            AND state = 'processing'
            AND claimed_by = $2
          RETURNING state
        )
        SELECT state FROM updated
        UNION ALL
        SELECT state
        FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE}
        WHERE dedupe_key = $1
          AND NOT EXISTS (SELECT 1 FROM updated)
        LIMIT 1
      `,
      [dedupeKey, claimOwner],
    );
    const state = normalizeRequiredString(result.rows[0]?.state);
    if (state === 'delivered') {
      return 'delivered';
    }
    return state === 'processing' ? 'processing' : 'missing';
  }

  async releaseConsumerDedupe(input: {
    eventId: string;
    claimOwner: string;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const eventId = normalizeRequiredString(input.eventId);
    const claimOwner = normalizeRequiredString(input.claimOwner);
    if (!eventId || !claimOwner) {
      return false;
    }
    const result = await this.pool.query(
      `
        DELETE FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE}
        WHERE dedupe_key = $1
          AND state = 'processing'
          AND claimed_by = $2
      `,
      [buildConsumerEventDedupeKey(eventId), claimOwner],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listRetryQueue(input?: {
    limit?: number;
    topicPrefixes?: string[];
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const limit = normalizePositiveInteger(input?.limit, 100, 1, 500);
    const topicPrefixLikePatterns = buildTopicPrefixLikePatterns(input?.topicPrefixes);
    const topicFilterClause = topicPrefixLikePatterns.length > 0 ? 'AND topic LIKE ANY($2::text[])' : '';
    const queryParams = topicPrefixLikePatterns.length > 0
      ? [limit, topicPrefixLikePatterns]
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

  async retainDeliveredOutbox(input?: { retentionDays?: number; limit?: number }): Promise<OutboxRetentionResult> {
    if (!this.pool || !this.enabled) {
      return { deliveredEventsDeleted: 0, consumerDedupeDeleted: 0 };
    }
    const retentionDays = normalizePositiveInteger(input?.retentionDays, 7, 1, 3650);
    const limit = normalizePositiveInteger(input?.limit, 1000, 1, 10_000);
    const deliveredEventsDeleted = await deleteDeliveredOutboxEvents(this.pool, retentionDays, limit);
    const consumerDedupeDeleted = await deleteDeliveredConsumerDedupeRows(this.pool, retentionDays, limit);
    return { deliveredEventsDeleted, consumerDedupeDeleted };
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

async function deleteDeliveredOutboxEvents(pool: Pool, retentionDays: number, limit: number): Promise<number> {
  const result = await pool.query<{ deleted_count?: string | number }>(
    `
      WITH targets AS (
        SELECT ctid
        FROM ${OUTBOX_EVENT_TABLE}
        WHERE status = 'delivered'
          AND COALESCE(delivered_at, created_at) < now() - ($1::bigint * interval '1 day')
        ORDER BY COALESCE(delivered_at, created_at) ASC, event_id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      ),
      deleted AS (
        DELETE FROM ${OUTBOX_EVENT_TABLE} event
        USING targets
        WHERE event.ctid = targets.ctid
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS deleted_count FROM deleted
    `,
    [retentionDays, limit],
  );
  return normalizePositiveInteger(result.rows[0]?.deleted_count, 0, 0, Number.MAX_SAFE_INTEGER);
}

async function deleteDeliveredConsumerDedupeRows(pool: Pool, retentionDays: number, limit: number): Promise<number> {
  const result = await pool.query<{ deleted_count?: string | number }>(
    `
      WITH targets AS (
        SELECT ctid
        FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE} dedupe
        WHERE state = 'delivered'
          AND COALESCE(delivered_at, updated_at) < now() - ($1::bigint * interval '1 day')
          AND NOT EXISTS (
            SELECT 1
            FROM ${OUTBOX_EVENT_TABLE} event
            WHERE event.event_id = dedupe.event_id
              AND event.status <> 'delivered'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ${DEAD_LETTER_EVENT_TABLE} dead_letter
            WHERE dead_letter.event_id = dedupe.event_id
          )
        ORDER BY COALESCE(delivered_at, updated_at) ASC, dedupe_key ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      ),
      deleted AS (
        DELETE FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE} dedupe
        USING targets
        WHERE dedupe.ctid = targets.ctid
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS deleted_count FROM deleted
    `,
    [retentionDays, limit],
  );
  return normalizePositiveInteger(result.rows[0]?.deleted_count, 0, 0, Number.MAX_SAFE_INTEGER);
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
      event_id varchar(180) NOT NULL,
      operation_id varchar(180),
      topic varchar(200) NOT NULL,
      partition_key varchar(200) NOT NULL,
      payload_jsonb jsonb NOT NULL,
      status varchar(32) NOT NULL,
      attempt_count bigint NOT NULL DEFAULT 0,
      failed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS dead_letter_event_event_id_idx
    ON ${DEAD_LETTER_EVENT_TABLE}(event_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dead_letter_event_operation_idx
    ON ${DEAD_LETTER_EVENT_TABLE}(operation_id)
    WHERE operation_id IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dead_letter_event_topic_idx
    ON ${DEAD_LETTER_EVENT_TABLE}(topic, failed_at DESC)
  `);
  await ensureVarcharColumnLength(pool, DEAD_LETTER_EVENT_TABLE, 'event_id', 180);
  await ensureVarcharColumnLength(pool, DEAD_LETTER_EVENT_TABLE, 'operation_id', 180);
  await ensureVarcharColumnLength(pool, DEAD_LETTER_EVENT_TABLE, 'partition_key', 200);
  await ensureBigintColumnType(pool, DEAD_LETTER_EVENT_TABLE, 'attempt_count');
}

async function ensureOutboxConsumerDedupeTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${OUTBOX_CONSUMER_DEDUPE_TABLE} (
      dedupe_key varchar(180) PRIMARY KEY,
      event_id varchar(180) NOT NULL,
      operation_id varchar(180),
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
  await ensureVarcharColumnLength(pool, OUTBOX_CONSUMER_DEDUPE_TABLE, 'dedupe_key', 180);
  await ensureVarcharColumnLength(pool, OUTBOX_CONSUMER_DEDUPE_TABLE, 'event_id', 180);
  await ensureVarcharColumnLength(pool, OUTBOX_CONSUMER_DEDUPE_TABLE, 'operation_id', 180);
}

function buildConsumerEventDedupeKey(eventId: string): string {
  const normalizedEventId = normalizeRequiredString(eventId);
  const rawKey = `event:${normalizedEventId}`;
  if (rawKey.length <= OUTBOX_DEDUPE_KEY_MAX_LENGTH) {
    return rawKey;
  }
  return `event:sha256:${createHash('sha256').update(normalizedEventId).digest('hex')}`;
}

function buildOutboxClaimBatchOwner(dispatcherId: string): string {
  const token = randomUUID().replace(/-/gu, '');
  const rawOwner = `${dispatcherId}:${token}`;
  if (rawOwner.length <= OUTBOX_CLAIM_BATCH_OWNER_MAX_LENGTH) {
    return rawOwner;
  }
  const dispatcherDigest = createHash('sha256').update(dispatcherId).digest('hex').slice(0, 16);
  return `outbox-dispatcher:sha256:${dispatcherDigest}:${token}`;
}

function buildTopicPrefixLikePatterns(topicPrefixes?: readonly string[]): string[] {
  if (!Array.isArray(topicPrefixes) || topicPrefixes.length === 0) {
    return [];
  }
  const patterns: string[] = [];
  for (const prefix of topicPrefixes) {
    const normalized = normalizeRequiredString(prefix);
    if (normalized) {
      patterns.push(`${normalized}%`);
    }
  }
  return patterns;
}

async function insertDeadLetterEventWithClient(queryable: { query: Pool['query'] }, row: Record<string, unknown>): Promise<void> {
  const eventId = normalizeRequiredString(row.event_id);
  const topic = normalizeRequiredString(row.topic);
  const partitionKey = normalizeRequiredString(row.partition_key);
  if (!eventId || !topic || !partitionKey) {
    throw new Error('outbox_dead_letter_payload_invalid');
  }
  await queryable.query(
    `
      INSERT INTO ${DEAD_LETTER_EVENT_TABLE}(
        event_id, operation_id, topic, partition_key, payload_jsonb, status, attempt_count, failed_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), COALESCE($8::timestamptz, now()))
      ON CONFLICT (event_id)
      DO UPDATE SET
        operation_id = EXCLUDED.operation_id,
        topic = EXCLUDED.topic,
        partition_key = EXCLUDED.partition_key,
        payload_jsonb = EXCLUDED.payload_jsonb,
        status = EXCLUDED.status,
        attempt_count = GREATEST(${DEAD_LETTER_EVENT_TABLE}.attempt_count, EXCLUDED.attempt_count),
        failed_at = EXCLUDED.failed_at,
        created_at = LEAST(${DEAD_LETTER_EVENT_TABLE}.created_at, EXCLUDED.created_at)
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

async function ensureVarcharColumnLength(
  queryable: Pool,
  tableName: string,
  columnName: string,
  minLength: number,
): Promise<void> {
  assertSafeIdentifier(tableName);
  assertSafeIdentifier(columnName);
  const result = await queryable.query(
    `
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );
  const row = Array.isArray(result.rows) ? (result.rows[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) {
    return;
  }
  const dataType = typeof row.data_type === 'string' ? row.data_type : '';
  if (dataType === 'text') {
    return;
  }
  if (dataType !== 'character varying') {
    return;
  }
  const currentLength = Number(row.character_maximum_length ?? 0);
  if (Number.isFinite(currentLength) && currentLength >= minLength) {
    return;
  }
  await queryable.query(
    `ALTER TABLE ${quoteIdentifier(tableName)} ALTER COLUMN ${quoteIdentifier(columnName)} TYPE varchar(${minLength})`,
  );
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`unsafe_sql_identifier:${identifier}`);
  }
}

function quoteIdentifier(identifier: string): string {
  assertSafeIdentifier(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

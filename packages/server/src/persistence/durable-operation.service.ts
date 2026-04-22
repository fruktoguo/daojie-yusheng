import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import type { PersistedPlayerSnapshot } from './player-persistence.service';

const PLAYER_PRESENCE_TABLE = 'player_presence';
const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
const PLAYER_MAIL_TABLE = 'player_mail';
const PLAYER_MAIL_ATTACHMENT_TABLE = 'player_mail_attachment';
const PLAYER_MAIL_COUNTER_TABLE = 'player_mail_counter';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const PLAYER_SNAPSHOT_TABLE = 'server_player_snapshot';
const DURABLE_OPERATION_LOG_TABLE = 'durable_operation_log';
const OUTBOX_EVENT_TABLE = 'outbox_event';
const ASSET_AUDIT_LOG_TABLE = 'asset_audit_log';

export interface DurableInventoryItemSnapshot {
  itemId: string;
  count: number;
  rawPayload: unknown;
}

export interface ClaimMailAttachmentsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  mailIds: string[];
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextPlayerSnapshot: PersistedPlayerSnapshot;
}

export interface ClaimMailAttachmentsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  unreadCount: number;
  unclaimedCount: number;
}

@Injectable()
export class DurableOperationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DurableOperationService.name);
  private pool: Pool | null = null;
  private enabled = false;

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('强持久化事务服务已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
    });

    try {
      await ensureDurableOperationTables(this.pool);
      this.enabled = true;
      this.logger.log('强持久化事务服务已启用');
    } catch (error: unknown) {
      this.logger.error(
        '强持久化事务服务初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async claimMailAttachments(input: ClaimMailAttachmentsInput): Promise<ClaimMailAttachmentsResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }

    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
    const normalizedMailIds = Array.from(
      new Set(
        Array.isArray(input.mailIds)
          ? input.mailIds.map((mailId) => normalizeRequiredString(mailId)).filter(Boolean)
          : [],
      ),
    );
    if (!normalizedPlayerId || !normalizedOperationId || normalizedMailIds.length === 0) {
      throw new Error('invalid_claim_mail_attachments_input');
    }

    const now = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquirePlayerMailLock(client, normalizedPlayerId);

      const existingOperation = await client.query<{ status?: string }>(
        `
          SELECT status
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          FOR UPDATE
        `,
        [normalizedOperationId],
      );
      if (existingOperation.rowCount && existingOperation.rows[0]?.status === 'committed') {
        const existingCounters = await readMailCounters(client, normalizedPlayerId, now);
        await client.query('ROLLBACK');
        return {
          ok: true,
          alreadyCommitted: true,
          unreadCount: existingCounters.unreadCount,
          unclaimedCount: existingCounters.unclaimedCount,
        };
      }

      const presence = await client.query<{
        runtime_owner_id?: string;
        session_epoch?: string | number;
      }>(
        `
          SELECT runtime_owner_id, session_epoch
          FROM ${PLAYER_PRESENCE_TABLE}
          WHERE player_id = $1
          FOR UPDATE
        `,
        [normalizedPlayerId],
      );
      const presenceRow = presence.rows[0] ?? null;
      const persistedRuntimeOwnerId = normalizeRequiredString(presenceRow?.runtime_owner_id);
      const persistedSessionEpoch = Number(presenceRow?.session_epoch ?? 0);
      if (
        !persistedRuntimeOwnerId
        || persistedRuntimeOwnerId !== normalizeRequiredString(input.expectedRuntimeOwnerId)
        || !Number.isFinite(persistedSessionEpoch)
        || Math.trunc(persistedSessionEpoch) !== Math.max(1, Math.trunc(input.expectedSessionEpoch))
      ) {
        throw new Error(
          [
            'player_session_fencing_conflict',
            `expectedRuntimeOwnerId=${normalizeRequiredString(input.expectedRuntimeOwnerId) || 'null'}`,
            `expectedSessionEpoch=${Math.max(1, Math.trunc(input.expectedSessionEpoch))}`,
            `persistedRuntimeOwnerId=${persistedRuntimeOwnerId || 'null'}`,
            `persistedSessionEpoch=${Number.isFinite(persistedSessionEpoch) ? Math.trunc(persistedSessionEpoch) : 'null'}`,
          ].join(':'),
        );
      }

      if (existingOperation.rowCount === 0) {
        await client.query(
          `
            INSERT INTO ${DURABLE_OPERATION_LOG_TABLE}(
              operation_id,
              operation_type,
              aggregate_type,
              aggregate_id,
              player_id,
              runtime_owner_id,
              session_epoch,
              request_id,
              payload_jsonb,
              status,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
          `,
          [
            normalizedOperationId,
            'mail_claim',
            'player_mail',
            normalizedPlayerId,
            normalizedPlayerId,
            persistedRuntimeOwnerId,
            Math.trunc(persistedSessionEpoch),
            normalizedOperationId,
            JSON.stringify({ mailIds: normalizedMailIds }),
            'pending',
          ],
        );
      }

      const mailsResult = await client.query<{
        mail_id?: string;
        claimed_at?: string | number | null;
        deleted_at?: string | number | null;
        expire_at?: string | number | null;
      }>(
        `
          SELECT mail_id, claimed_at, deleted_at, expire_at
          FROM ${PLAYER_MAIL_TABLE}
          WHERE player_id = $1
            AND mail_id = ANY($2::varchar[])
          FOR UPDATE
        `,
        [normalizedPlayerId, normalizedMailIds],
      );
      if ((mailsResult.rowCount ?? 0) !== normalizedMailIds.length) {
        throw new Error('mail_claim_targets_missing');
      }
      for (const row of mailsResult.rows) {
        if (Number.isFinite(row.deleted_at) || Number.isFinite(row.claimed_at)) {
          throw new Error('mail_already_claimed_or_deleted');
        }
        const expireAt = Number(row.expire_at ?? 0);
        if (Number.isFinite(expireAt) && expireAt > 0 && expireAt <= now) {
          throw new Error('mail_already_expired');
        }
      }

      const attachmentsResult = await client.query<{ mail_id?: string }>(
        `
          SELECT mail_id
          FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
          WHERE mail_id = ANY($1::varchar[])
            AND claimed_at IS NULL
          FOR UPDATE
        `,
        [normalizedMailIds],
      );
      if ((attachmentsResult.rowCount ?? 0) === 0) {
        throw new Error('mail_claim_attachments_missing');
      }

      const counterBefore = await client.query<{ welcome_mail_delivered_at?: string | number | null }>(
        `
          SELECT welcome_mail_delivered_at
          FROM ${PLAYER_MAIL_COUNTER_TABLE}
          WHERE player_id = $1
          FOR UPDATE
        `,
        [normalizedPlayerId],
      );
      const welcomeMailDeliveredAt = normalizeOptionalInteger(
        counterBefore.rows[0]?.welcome_mail_delivered_at,
      );

      await replacePlayerInventoryItems(client, normalizedPlayerId, input.nextInventoryItems);

      await client.query(
        `
          UPDATE ${PLAYER_MAIL_ATTACHMENT_TABLE}
          SET
            claim_operation_id = $1,
            claimed_at = $2
          WHERE mail_id = ANY($3::varchar[])
            AND claimed_at IS NULL
        `,
        [normalizedOperationId, now, normalizedMailIds],
      );

      await client.query(
        `
          UPDATE ${PLAYER_MAIL_TABLE}
          SET
            read_at = COALESCE(read_at, $1),
            claimed_at = $1,
            mail_version = mail_version + 1,
            updated_at = now()
          WHERE player_id = $2
            AND mail_id = ANY($3::varchar[])
        `,
        [now, normalizedPlayerId, normalizedMailIds],
      );

      const counters = await readMailCounters(client, normalizedPlayerId, now);
      const unreadCount = counters.unreadCount;
      const unclaimedCount = counters.unclaimedCount;
      const latestMailAt = counters.latestMailAt;

      await client.query(
        `
          INSERT INTO ${PLAYER_MAIL_COUNTER_TABLE}(
            player_id,
            unread_count,
            unclaimed_count,
            latest_mail_at,
            counter_version,
            welcome_mail_delivered_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            unread_count = EXCLUDED.unread_count,
            unclaimed_count = EXCLUDED.unclaimed_count,
            latest_mail_at = EXCLUDED.latest_mail_at,
            counter_version = EXCLUDED.counter_version,
            welcome_mail_delivered_at = COALESCE(EXCLUDED.welcome_mail_delivered_at, ${PLAYER_MAIL_COUNTER_TABLE}.welcome_mail_delivered_at),
            updated_at = now()
        `,
        [normalizedPlayerId, unreadCount, unclaimedCount, latestMailAt, now, welcomeMailDeliveredAt],
      );

      await upsertPlayerSnapshot(client, normalizedPlayerId, input.nextPlayerSnapshot);

      await client.query(
        `
          INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
            player_id,
            inventory_version,
            mail_version,
            mail_counter_version,
            updated_at
          )
          VALUES ($1, $2, $3, $4, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
            mail_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_version, EXCLUDED.mail_version),
            mail_counter_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_counter_version, EXCLUDED.mail_counter_version),
            updated_at = now()
        `,
        [normalizedPlayerId, now, now, now],
      );

      await client.query(
        `
          INSERT INTO ${OUTBOX_EVENT_TABLE}(
            event_id,
            operation_id,
            topic,
            partition_key,
            payload_jsonb,
            status,
            attempt_count,
            next_retry_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
        `,
        [
          `outbox:${normalizedOperationId}`,
          normalizedOperationId,
          'player.mail.claimed',
          normalizedPlayerId,
          JSON.stringify({ playerId: normalizedPlayerId, mailIds: normalizedMailIds }),
          'ready',
          0,
        ],
      );

      await client.query(
        `
          INSERT INTO ${ASSET_AUDIT_LOG_TABLE}(
            log_id,
            operation_id,
            player_id,
            asset_type,
            asset_ref_id,
            action,
            delta_jsonb,
            before_jsonb,
            after_jsonb,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
        `,
        [
          `audit:${normalizedOperationId}`,
          normalizedOperationId,
          normalizedPlayerId,
          'mail_claim',
          normalizedPlayerId,
          'claim',
          JSON.stringify({ mailIds: normalizedMailIds }),
          JSON.stringify({}),
          JSON.stringify({ unreadCount, unclaimedCount }),
        ],
      );

      await client.query(
        `
          UPDATE ${DURABLE_OPERATION_LOG_TABLE}
          SET
            status = 'committed',
            committed_at = now()
          WHERE operation_id = $1
        `,
        [normalizedOperationId],
      );

      await client.query('COMMIT');
      return {
        ok: true,
        alreadyCommitted: false,
        unreadCount,
        unclaimedCount,
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async safeClosePool(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}

async function acquirePlayerMailLock(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

async function ensureDurableOperationTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireSchemaInitLock(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DURABLE_OPERATION_LOG_TABLE} (
        operation_id varchar(180) PRIMARY KEY,
        operation_type varchar(64) NOT NULL,
        aggregate_type varchar(64) NOT NULL,
        aggregate_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        runtime_owner_id varchar(120),
        session_epoch bigint,
        request_id varchar(180),
        payload_jsonb jsonb NOT NULL,
        status varchar(32) NOT NULL,
        error_code varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${OUTBOX_EVENT_TABLE} (
        event_id varchar(180) PRIMARY KEY,
        operation_id varchar(180) NOT NULL,
        topic varchar(120) NOT NULL,
        partition_key varchar(180) NOT NULL,
        payload_jsonb jsonb NOT NULL,
        status varchar(32) NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0,
        next_retry_at timestamptz,
        claimed_by varchar(120),
        claim_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        delivered_at timestamptz
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS outbox_event_status_retry_idx
      ON ${OUTBOX_EVENT_TABLE}(status, next_retry_at, created_at)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${ASSET_AUDIT_LOG_TABLE} (
        log_id varchar(180) PRIMARY KEY,
        operation_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        asset_type varchar(64) NOT NULL,
        asset_ref_id varchar(180) NOT NULL,
        action varchar(64) NOT NULL,
        delta_jsonb jsonb NOT NULL,
        before_jsonb jsonb NOT NULL,
        after_jsonb jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_TABLE} (
        mail_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        sender_type varchar(32) NOT NULL DEFAULT 'system',
        sender_label varchar(120) NOT NULL,
        template_id varchar(120),
        mail_type varchar(32) NOT NULL DEFAULT 'system',
        title varchar(240),
        body text,
        source_type varchar(64),
        source_ref_id varchar(180),
        metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        mail_version bigint NOT NULL DEFAULT 1,
        created_at bigint NOT NULL,
        expire_at bigint,
        first_seen_at bigint,
        read_at bigint,
        claimed_at bigint,
        deleted_at bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_player_idx
      ON ${PLAYER_MAIL_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_ATTACHMENT_TABLE} (
        attachment_id varchar(180) PRIMARY KEY,
        mail_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        attachment_kind varchar(32) NOT NULL DEFAULT 'item',
        item_id varchar(120),
        count integer,
        currency_type varchar(64),
        amount bigint,
        item_payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        claim_operation_id varchar(180),
        claimed_at bigint,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_attachment_mail_idx
      ON ${PLAYER_MAIL_ATTACHMENT_TABLE}(mail_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_COUNTER_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        unread_count integer NOT NULL DEFAULT 0,
        unclaimed_count integer NOT NULL DEFAULT 0,
        latest_mail_at bigint,
        counter_version bigint NOT NULL DEFAULT 0,
        welcome_mail_delivered_at bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_MAIL_COUNTER_TABLE}
      ADD COLUMN IF NOT EXISTS welcome_mail_delivered_at bigint
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_INVENTORY_ITEM_TABLE} (
        item_instance_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        slot_index integer NOT NULL,
        item_id varchar(120) NOT NULL,
        count integer NOT NULL,
        raw_payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(player_id, slot_index)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_PRESENCE_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        online boolean NOT NULL DEFAULT false,
        in_world boolean NOT NULL DEFAULT false,
        last_heartbeat_at bigint,
        offline_since_at bigint,
        runtime_owner_id varchar(120),
        session_epoch bigint NOT NULL DEFAULT 1,
        transfer_state varchar(32),
        transfer_target_node_id varchar(120),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_RECOVERY_WATERMARK_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        inventory_version bigint NOT NULL DEFAULT 0,
        mail_version bigint NOT NULL DEFAULT 0,
        mail_counter_version bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_SNAPSHOT_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        template_id varchar(120) NOT NULL,
        instance_id varchar(160),
        persisted_source varchar(32) NOT NULL,
        seeded_at bigint,
        saved_at bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        payload jsonb NOT NULL
      )
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function replacePlayerInventoryItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: DurableInventoryItemSnapshot[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      continue;
    }
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}::jsonb, now())`,
    );
    values.push(
      `inv:${playerId}:${index}`,
      playerId,
      index,
      itemId,
      Math.max(1, Math.trunc(Number(item.count ?? 1))),
      JSON.stringify(item.rawPayload ?? item),
    );
    parameterIndex += 6;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
        item_instance_id,
        player_id,
        slot_index,
        item_id,
        count,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function readMailCounters(
  client: import('pg').PoolClient,
  playerId: string,
  now: number,
): Promise<{
  unreadCount: number;
  unclaimedCount: number;
  latestMailAt: number | null;
}> {
  const counters = await client.query<{
    unread_count?: string | number;
    unclaimed_count?: string | number;
    latest_mail_at?: string | number | null;
  }>(
    `
      WITH visible_mail AS (
        SELECT mail_id, created_at, read_at
        FROM ${PLAYER_MAIL_TABLE}
        WHERE player_id = $1
          AND deleted_at IS NULL
          AND (expire_at IS NULL OR expire_at > $2)
      ),
      claimable_mail AS (
        SELECT DISTINCT attachment.mail_id
        FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
        JOIN visible_mail mail ON mail.mail_id = attachment.mail_id
        WHERE attachment.claimed_at IS NULL
      )
      SELECT
        COALESCE(SUM(CASE WHEN visible_mail.read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread_count,
        COALESCE((SELECT COUNT(*) FROM claimable_mail), 0) AS unclaimed_count,
        MAX(visible_mail.created_at) AS latest_mail_at
      FROM visible_mail
    `,
    [playerId, now],
  );
  const counterRow = counters.rows[0] ?? {};
  return {
    unreadCount: Math.max(0, Math.trunc(Number(counterRow.unread_count ?? 0))),
    unclaimedCount: Math.max(0, Math.trunc(Number(counterRow.unclaimed_count ?? 0))),
    latestMailAt: Number.isFinite(counterRow.latest_mail_at)
      ? Math.trunc(Number(counterRow.latest_mail_at))
      : null,
  };
}

async function upsertPlayerSnapshot(
  client: import('pg').PoolClient,
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
): Promise<void> {
  const templateId =
    typeof snapshot?.placement?.templateId === 'string' ? snapshot.placement.templateId.trim() : '';
  if (!templateId) {
    throw new Error('invalid_next_player_snapshot');
  }
  const instanceId =
    typeof snapshot?.placement?.instanceId === 'string' && snapshot.placement.instanceId.trim()
      ? snapshot.placement.instanceId.trim()
      : `public:${templateId}`;
  const savedAt = Number.isFinite(snapshot?.savedAt)
    ? Math.max(0, Math.trunc(Number(snapshot.savedAt)))
    : Date.now();
  await client.query(
    `
      INSERT INTO ${PLAYER_SNAPSHOT_TABLE}(
        player_id,
        template_id,
        instance_id,
        persisted_source,
        seeded_at,
        saved_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, NULL, $5, now(), $6::jsonb)
      ON CONFLICT (player_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        instance_id = EXCLUDED.instance_id,
        persisted_source = EXCLUDED.persisted_source,
        seeded_at = EXCLUDED.seeded_at,
        saved_at = EXCLUDED.saved_at,
        updated_at = now(),
        payload = EXCLUDED.payload
    `,
    [playerId, templateId, instanceId, 'native', savedAt, JSON.stringify(snapshot)],
  );
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

async function acquireSchemaInitLock(client: import('pg').PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [7100, 1]);
}

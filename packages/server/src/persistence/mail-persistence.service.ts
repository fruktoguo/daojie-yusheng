import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

const PLAYER_MAIL_TABLE = 'player_mail';
const PLAYER_MAIL_ATTACHMENT_TABLE = 'player_mail_attachment';
const PLAYER_MAIL_ARCHIVE_TABLE = 'player_mail_archive';
const PLAYER_MAIL_ATTACHMENT_ARCHIVE_TABLE = 'player_mail_attachment_archive';
const PLAYER_MAIL_COUNTER_TABLE = 'player_mail_counter';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const SAVE_MAILBOX_RETRY_LIMIT = 3;
const SAVE_MAILBOX_RETRY_BASE_DELAY_MS = 25;
const MAIL_BIGINT_COLUMNS_BY_TABLE = {
  [PLAYER_MAIL_ATTACHMENT_TABLE]: ['count'],
  [PLAYER_MAIL_ATTACHMENT_ARCHIVE_TABLE]: ['count'],
  [PLAYER_MAIL_COUNTER_TABLE]: ['unread_count', 'unclaimed_count'],
} as const;

interface MailAttachmentPayload {
  itemId: string;
  count: number;
}

interface MailArgPayload {
  kind: string;
  value?: unknown;
}

interface MailEntryPayload {
  version: 1;
  mailVersion: number;
  mailId: string;
  senderLabel: string;
  templateId: string | null;
  args: MailArgPayload[];
  fallbackTitle: string | null;
  fallbackBody: string | null;
  attachments: MailAttachmentPayload[];
  createdAt: number;
  updatedAt: number;
  expireAt: number | null;
  firstSeenAt: number | null;
  readAt: number | null;
  claimedAt: number | null;
  deletedAt: number | null;
}

interface MailboxPayload {
  version: 1;
  revision: number;
  welcomeMailDeliveredAt: number | null;
  mails: MailEntryPayload[];
}

interface StructuredMailRow {
  mail_id?: unknown;
  sender_label?: unknown;
  template_id?: unknown;
  title?: unknown;
  body?: unknown;
  metadata_jsonb?: unknown;
  mail_version?: unknown;
  created_at?: unknown;
  updated_at_ms?: unknown;
  expire_at?: unknown;
  first_seen_at?: unknown;
  read_at?: unknown;
  claimed_at?: unknown;
  deleted_at?: unknown;
}

interface StructuredAttachmentRow {
  mail_id?: unknown;
  item_id?: unknown;
  count?: unknown;
}

interface StructuredCounterRow {
  unread_count?: unknown;
  unclaimed_count?: unknown;
  latest_mail_at?: unknown;
  counter_version?: unknown;
  welcome_mail_delivered_at?: unknown;
}

/** 邮件持久化服务：结构化表为唯一真源。 */
@Injectable()
export class MailPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('邮件持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    const pool = new Pool({
      connectionString: databaseUrl,
    });

    try {
      await ensureStructuredMailTables(pool);
      this.pool = pool;
      this.enabled = true;
      this.logger.log('邮件持久化已启用（player_mail + player_mail_attachment + player_mail_counter + player_recovery_watermark）');
    } catch (error: unknown) {
      this.logger.error(
        '邮件持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      await pool.end().catch(() => undefined);
      this.pool = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async loadMailbox(playerId: string): Promise<MailboxPayload | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }

    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!normalizedPlayerId) {
      return null;
    }

    const client = await this.pool.connect();
    try {
      const mailResult = await client.query<StructuredMailRow>(
        `
          SELECT
            mail_id,
            sender_label,
            template_id,
            title,
            body,
            metadata_jsonb,
            mail_version,
            created_at,
            (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms,
            expire_at,
            first_seen_at,
            read_at,
            claimed_at,
            deleted_at
          FROM ${PLAYER_MAIL_TABLE}
          WHERE player_id = $1
          ORDER BY created_at DESC, mail_id DESC
        `,
        [normalizedPlayerId],
      );

      const counterResult = await client.query<StructuredCounterRow>(
        `
          SELECT
            unread_count,
            unclaimed_count,
            latest_mail_at,
            counter_version,
            welcome_mail_delivered_at
          FROM ${PLAYER_MAIL_COUNTER_TABLE}
          WHERE player_id = $1
          LIMIT 1
        `,
        [normalizedPlayerId],
      );

      if ((mailResult.rowCount ?? 0) > 0 || (counterResult.rowCount ?? 0) > 0) {
        const attachmentResult = await client.query<StructuredAttachmentRow>(
          `
            SELECT mail_id, item_id, count
            FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
            WHERE player_id = $1
            ORDER BY mail_id ASC, attachment_id ASC
          `,
          [normalizedPlayerId],
        );
        return buildMailboxFromStructuredRows(mailResult.rows, attachmentResult.rows, counterResult.rows[0] ?? null);
      }

      return null;
    } finally {
      client.release();
    }
  }

  async saveMailbox(playerId: string, mailbox: unknown): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const normalizedPlayerId = normalizeRequiredString(playerId);
    const normalizedMailbox = normalizeMailbox(mailbox);
    if (!normalizedPlayerId || !normalizedMailbox) {
      return;
    }

    const summary = summarizeMailbox(normalizedMailbox);

    for (let attempt = 1; attempt <= SAVE_MAILBOX_RETRY_LIMIT; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await acquirePlayerMailLock(client, normalizedPlayerId);
        await client.query(`DELETE FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} WHERE player_id = $1`, [normalizedPlayerId]);
        await client.query(`DELETE FROM ${PLAYER_MAIL_TABLE} WHERE player_id = $1`, [normalizedPlayerId]);

        const stableMailboxMails = sortMailsByStableKey(normalizedMailbox.mails);
        if (stableMailboxMails.length > 0) {
          await insertStructuredMails(client, normalizedPlayerId, stableMailboxMails);
          await insertStructuredAttachments(client, normalizedPlayerId, stableMailboxMails);
        }

        await upsertStructuredMailCounter(client, normalizedPlayerId, normalizedMailbox.revision, summary);
        await upsertMailRecoveryWatermark(
          client,
          normalizedPlayerId,
          computeMailboxMailVersion(normalizedMailbox.mails),
          normalizedMailbox.revision,
        );
        await client.query('COMMIT');
        return;
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < SAVE_MAILBOX_RETRY_LIMIT && isRetryableMailboxWriteError(error)) {
          await delay(SAVE_MAILBOX_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
  }

  async saveMailboxMutation(playerId: string, mailbox: unknown, affectedEntries: unknown[]): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const normalizedPlayerId = normalizeRequiredString(playerId);
    const normalizedMailbox = normalizeMailbox(mailbox);
    const normalizedAffectedEntries = Array.isArray(affectedEntries)
      ? affectedEntries
          .map((entry) => normalizeMailEntry(entry))
          .filter((entry): entry is MailEntryPayload => entry !== null)
      : [];
    if (!normalizedPlayerId || !normalizedMailbox) {
      return;
    }

    const summary = summarizeMailbox(normalizedMailbox);
    const affectedMailIds = Array.from(new Set(normalizedAffectedEntries.map((entry) => entry.mailId))).sort((left, right) =>
      left.localeCompare(right, 'zh-Hans-CN'),
    );

    for (let attempt = 1; attempt <= SAVE_MAILBOX_RETRY_LIMIT; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await acquirePlayerMailLock(client, normalizedPlayerId);

        const stableAffectedEntries = sortMailsByStableKey(normalizedAffectedEntries);
        if (stableAffectedEntries.length > 0) {
          await upsertStructuredMails(client, normalizedPlayerId, stableAffectedEntries);
          await replaceStructuredAttachmentsForMailIds(
            client,
            normalizedPlayerId,
            affectedMailIds,
            stableAffectedEntries,
          );
        }

        await upsertStructuredMailCounter(client, normalizedPlayerId, normalizedMailbox.revision, summary);
        await upsertMailRecoveryWatermark(
          client,
          normalizedPlayerId,
          computeMailboxMailVersion(normalizedMailbox.mails, normalizedAffectedEntries),
          normalizedMailbox.revision,
        );
        await client.query('COMMIT');
        return;
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < SAVE_MAILBOX_RETRY_LIMIT && isRetryableMailboxWriteError(error)) {
          await delay(SAVE_MAILBOX_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
  }

  async cleanupExpiredMails(limit = 64): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const normalizedLimit = Math.max(1, Math.trunc(Number(limit ?? 64)));
    const now = Date.now();
    const candidateRows = await this.pool.query<{ player_id?: unknown }>(
      `
        SELECT DISTINCT player_id
        FROM ${PLAYER_MAIL_TABLE}
        WHERE deleted_at IS NULL
          AND expire_at IS NOT NULL
          AND expire_at <= $1
        ORDER BY player_id ASC
        LIMIT $2
      `,
      [now, normalizedLimit],
    );
    let processed = 0;
    for (const row of candidateRows.rows) {
      const playerId = normalizeRequiredString(row.player_id);
      if (!playerId) {
        continue;
      }
      const mailbox = normalizeMailbox(await this.loadMailbox(playerId));
      if (!mailbox) {
        continue;
      }
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await acquirePlayerMailLock(client, playerId);
        const expiredRows = await client.query<{ mail_id?: unknown; mail_version?: unknown }>(
          `
            SELECT mail_id, mail_version
            FROM ${PLAYER_MAIL_TABLE}
            WHERE player_id = $1
              AND deleted_at IS NULL
              AND expire_at IS NOT NULL
              AND expire_at <= $2
          `,
          [playerId, now],
        );
        if ((expiredRows.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK');
          continue;
        }
        const expiredMailIds = new Set(
          expiredRows.rows
            .map((entry) => normalizeRequiredString(entry.mail_id))
            .filter((entry) => entry.length > 0),
        );
        const stableExpiredMailIds = Array.from(expiredMailIds).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        const archivePayload = mailbox.mails
          .filter((entry) => expiredMailIds.has(entry.mailId))
          .sort((left, right) => left.createdAt - right.createdAt || left.mailId.localeCompare(right.mailId, 'zh-Hans-CN'))
          .map((entry) => ({
            ...entry,
            deletedAt: now,
            updatedAt: now,
            mailVersion: Math.max(1, Math.trunc(Number(entry.mailVersion ?? 1)) + 1),
          }));
        const cleanedMails = mailbox.mails.map((entry) => {
          if (!expiredMailIds.has(entry.mailId)) {
            return entry;
          }
          return {
            ...entry,
            deletedAt: now,
            updatedAt: now,
            mailVersion: Math.max(1, Math.trunc(Number(entry.mailVersion ?? 1)) + 1),
          };
        });
        mailbox.mails = cleanedMails;
        mailbox.revision += 1;
        mailbox.mails = mailbox.mails
          .filter((entry) => entry.deletedAt == null && (entry.expireAt == null || entry.expireAt > now))
          .sort((left, right) => right.createdAt - left.createdAt || right.mailId.localeCompare(left.mailId));
        const maxMailVersion = mailbox.mails.reduce(
          (maxVersion, entry) => Math.max(maxVersion, Math.max(1, Math.trunc(Number(entry.mailVersion ?? 1)))),
          1,
        );
        await client.query(
          `
            UPDATE ${PLAYER_MAIL_TABLE}
            SET deleted_at = $2,
                mail_version = GREATEST(mail_version, $3),
                updated_at = now()
            WHERE player_id = $1
              AND deleted_at IS NULL
              AND expire_at IS NOT NULL
              AND expire_at <= $2
          `,
          [playerId, now, Math.max(1, maxMailVersion)],
        );
        if (archivePayload.length > 0) {
          await archiveExpiredMailRows(client, playerId, archivePayload, now);
        }
        await client.query(
          `
            DELETE FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
            WHERE player_id = $1
              AND mail_id = ANY($2::varchar[])
          `,
          [playerId, stableExpiredMailIds],
        );
        const summary = summarizeMailbox(mailbox);
        await upsertStructuredMailCounter(client, playerId, Math.max(1, maxMailVersion), {
          unreadCount: summary.unreadCount,
          unclaimedCount: summary.unclaimedCount,
          latestMailAt: summary.latestMailAt,
          welcomeMailDeliveredAt: summary.welcomeMailDeliveredAt,
        });
        await upsertMailRecoveryWatermark(
          client,
          playerId,
          Math.max(1, maxMailVersion),
          Math.max(1, mailbox.revision),
        );
        await client.query('COMMIT');
        processed += 1;
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.logger.warn(`邮件过期清理失败 playerId=${playerId}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
      } finally {
        client.release();
      }
    }
    return processed;
  }

  async purgeSoftDeletedMails(input?: { retentionDays?: number; limit?: number }): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const retentionDays = Math.max(1, Math.min(3650, Math.trunc(Number(input?.retentionDays ?? 30)) || 30));
    const limit = Math.max(1, Math.min(10_000, Math.trunc(Number(input?.limit ?? 500)) || 500));
    const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const candidateRows = await this.pool.query<{ player_id?: unknown }>(
      `
        SELECT DISTINCT player_id
        FROM ${PLAYER_MAIL_TABLE}
        WHERE deleted_at IS NOT NULL
          AND deleted_at <= $1
        ORDER BY player_id ASC
        LIMIT $2
      `,
      [threshold, limit],
    );
    let processed = 0;
    for (const row of candidateRows.rows) {
      const playerId = normalizeRequiredString(row.player_id);
      if (!playerId) {
        continue;
      }
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await acquirePlayerMailLock(client, playerId);
        const mailRows = await client.query<{ mail_id?: unknown }>(
          `
            SELECT mail_id
            FROM ${PLAYER_MAIL_TABLE}
            WHERE player_id = $1
              AND deleted_at IS NOT NULL
              AND deleted_at <= $2
            ORDER BY deleted_at ASC, mail_id ASC
          `,
          [playerId, threshold],
        );
        const mailIds = mailRows.rows
          .map((entry) => normalizeRequiredString(entry.mail_id))
          .filter((entry) => entry.length > 0)
          .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        if (mailIds.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }
        await client.query(
          `
            DELETE FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
            WHERE player_id = $1
              AND mail_id = ANY($2::varchar[])
          `,
          [playerId, mailIds],
        );
        await client.query(
          `
            DELETE FROM ${PLAYER_MAIL_TABLE}
            WHERE player_id = $1
              AND mail_id = ANY($2::varchar[])
          `,
          [playerId, mailIds],
        );
        processed += 1;
        await client.query('COMMIT');
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.logger.warn(`邮件软删清理失败 playerId=${playerId}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
      } finally {
        client.release();
      }
    }
    return processed;
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

async function ensureStructuredMailTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireSchemaInitLock(client);
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
        count bigint,
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
      CREATE INDEX IF NOT EXISTS player_mail_attachment_player_idx
      ON ${PLAYER_MAIL_ATTACHMENT_TABLE}(player_id, mail_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_ARCHIVE_TABLE} (
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
        archived_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_archive_player_idx
      ON ${PLAYER_MAIL_ARCHIVE_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_ATTACHMENT_ARCHIVE_TABLE} (
        attachment_id varchar(180) PRIMARY KEY,
        mail_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        attachment_kind varchar(32) NOT NULL DEFAULT 'item',
        item_id varchar(120),
        count bigint,
        currency_type varchar(64),
        amount bigint,
        item_payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        claim_operation_id varchar(180),
        claimed_at bigint,
        archived_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_attachment_archive_player_idx
      ON ${PLAYER_MAIL_ATTACHMENT_ARCHIVE_TABLE}(player_id, mail_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_COUNTER_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        unread_count bigint NOT NULL DEFAULT 0,
        unclaimed_count bigint NOT NULL DEFAULT 0,
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
    await ensureMailBigintColumnsWithClient(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_RECOVERY_WATERMARK_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        mail_version bigint NOT NULL DEFAULT 0,
        mail_counter_version bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS mail_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS mail_counter_version bigint NOT NULL DEFAULT 0
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureMailBigintColumnsWithClient(client: import('pg').PoolClient): Promise<void> {
  for (const [tableName, columns] of Object.entries(MAIL_BIGINT_COLUMNS_BY_TABLE)) {
    for (const column of columns) {
      await client.query(`
        ALTER TABLE ${tableName}
        ALTER COLUMN ${column} TYPE bigint USING ${column}::bigint
      `);
    }
  }
}

async function archiveExpiredMailRows(
  client: import('pg').PoolClient,
  playerId: string,
  expiredMailRows: Array<Record<string, unknown>>,
  now: number,
): Promise<void> {
  if (expiredMailRows.length === 0) {
    return;
  }
  const mailIds = expiredMailRows.map((entry) => normalizeRequiredString(entry.mailId)).filter((value) => value.length > 0);
  if (mailIds.length === 0) {
    return;
  }
  await client.query(
    `
      INSERT INTO ${PLAYER_MAIL_ARCHIVE_TABLE}(
        mail_id, player_id, sender_type, sender_label, template_id, mail_type,
        title, body, source_type, source_ref_id, metadata_jsonb, mail_version,
        created_at, expire_at, first_seen_at, read_at, claimed_at, deleted_at, archived_at
      )
      SELECT
        mail_id, player_id, sender_type, sender_label, template_id, mail_type,
        title, body, source_type, source_ref_id, metadata_jsonb, mail_version,
        created_at, expire_at, first_seen_at, read_at, claimed_at, deleted_at, now()
      FROM ${PLAYER_MAIL_TABLE}
      WHERE player_id = $1
        AND mail_id = ANY($2::varchar[])
      ON CONFLICT DO NOTHING
    `,
    [playerId, mailIds],
  );
  await client.query(
    `
      INSERT INTO ${PLAYER_MAIL_ATTACHMENT_ARCHIVE_TABLE}(
        attachment_id, mail_id, player_id, attachment_kind, item_id, count,
        currency_type, amount, item_payload_jsonb, claim_operation_id, claimed_at, archived_at
      )
      SELECT
        attachment_id, mail_id, player_id, attachment_kind, item_id, count,
        currency_type, amount, item_payload_jsonb, claim_operation_id, claimed_at, now()
      FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
      WHERE player_id = $1
        AND mail_id = ANY($2::varchar[])
      ON CONFLICT DO NOTHING
    `,
    [playerId, mailIds],
  );
}

function summarizeMailbox(mailbox: MailboxPayload): {
  unreadCount: number;
  unclaimedCount: number;
  latestMailAt: number | null;
  welcomeMailDeliveredAt: number | null;
} {
  const visibleMails = mailbox.mails.filter((entry) => {
    const expired = Number.isFinite(entry.expireAt) && Number(entry.expireAt) <= Date.now();
    return entry.deletedAt == null && !expired;
  });
  const unreadCount = visibleMails.reduce((count, entry) => count + (entry.readAt == null ? 1 : 0), 0);
  const unclaimedCount = visibleMails.reduce((count, entry) => {
    return count + (entry.attachments.length > 0 && entry.claimedAt == null ? 1 : 0);
  }, 0);
  const latestMailAt = visibleMails.reduce<number | null>((latest, entry) => {
    if (!Number.isFinite(entry.createdAt)) {
      return latest;
    }
    const createdAt = Math.trunc(Number(entry.createdAt));
    return latest == null ? createdAt : Math.max(latest, createdAt);
  }, null);
  const welcomeMailDeliveredAt =
    normalizeOptionalInteger(mailbox.welcomeMailDeliveredAt)
    ?? resolveWelcomeMailDeliveredAt(mailbox.mails);
  return {
    unreadCount,
    unclaimedCount,
    latestMailAt,
    welcomeMailDeliveredAt,
  };
}

function compactMailbox(mailbox: MailboxPayload): void {
  const normalized = normalizeMailbox(mailbox);
  if (!normalized) {
    mailbox.revision = Math.max(1, Math.trunc(Number(mailbox.revision ?? 1)));
    mailbox.welcomeMailDeliveredAt = normalizeOptionalInteger(mailbox.welcomeMailDeliveredAt);
    mailbox.mails = [];
    return;
  }
  mailbox.revision = normalized.revision;
  mailbox.welcomeMailDeliveredAt = normalized.welcomeMailDeliveredAt;
  mailbox.mails = normalized.mails;
}

function computeMailboxMailVersion(
  mails: MailEntryPayload[],
  extraEntries: MailEntryPayload[] = [],
): number {
  const combined = [...mails, ...extraEntries];
  return combined.reduce((maxVersion, entry) => {
    return Math.max(maxVersion, Math.max(1, Math.trunc(Number(entry?.mailVersion ?? 1))));
  }, 1);
}

async function upsertStructuredMailCounter(
  client: import('pg').PoolClient,
  playerId: string,
  revision: number,
  summary: {
    unreadCount: number;
    unclaimedCount: number;
    latestMailAt: number | null;
    welcomeMailDeliveredAt: number | null;
  },
): Promise<void> {
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
        welcome_mail_delivered_at = EXCLUDED.welcome_mail_delivered_at,
        updated_at = now()
    `,
    [
      playerId,
      summary.unreadCount,
      summary.unclaimedCount,
      summary.latestMailAt,
      Math.max(1, Math.trunc(Number(revision ?? 1))),
      summary.welcomeMailDeliveredAt,
    ],
  );
}

async function upsertMailRecoveryWatermark(
  client: import('pg').PoolClient,
  playerId: string,
  mailVersion: number,
  mailCounterVersion: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
        player_id,
        mail_version,
        mail_counter_version,
        updated_at
      )
      VALUES ($1, $2, $3, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        mail_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_version, EXCLUDED.mail_version),
        mail_counter_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_counter_version, EXCLUDED.mail_counter_version),
        updated_at = now()
    `,
    [
      playerId,
      Math.max(1, Math.trunc(Number(mailVersion ?? 1))),
      Math.max(1, Math.trunc(Number(mailCounterVersion ?? 1))),
    ],
  );
}

async function insertStructuredMails(
  client: import('pg').PoolClient,
  playerId: string,
  mails: MailEntryPayload[],
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;

  for (const entry of mails) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, 'system', $${parameterIndex + 2}, $${parameterIndex + 3}, 'system', $${parameterIndex + 4}, $${parameterIndex + 5}, NULL, NULL, $${parameterIndex + 6}::jsonb, $${parameterIndex + 7}, $${parameterIndex + 8}, $${parameterIndex + 9}, $${parameterIndex + 10}, $${parameterIndex + 11}, $${parameterIndex + 12}, $${parameterIndex + 13}, to_timestamp($${parameterIndex + 14}::double precision / 1000.0))`,
    );
    values.push(
      entry.mailId,
      playerId,
      entry.senderLabel,
      entry.templateId,
      entry.fallbackTitle,
      entry.fallbackBody,
      JSON.stringify({ args: entry.args }),
      Math.max(1, Math.trunc(Number(entry.mailVersion ?? 1))),
      Math.trunc(Number(entry.createdAt)),
      normalizeOptionalInteger(entry.expireAt),
      normalizeOptionalInteger(entry.firstSeenAt),
      normalizeOptionalInteger(entry.readAt),
      normalizeOptionalInteger(entry.claimedAt),
      normalizeOptionalInteger(entry.deletedAt),
      normalizeRequiredInteger(entry.updatedAt, Math.trunc(Number(entry.createdAt))),
    );
    parameterIndex += 15;
  }

  if (parameterIndex - 1 !== values.length) {
    throw new Error(`structured_mail_placeholder_mismatch:${parameterIndex - 1}:${values.length}`);
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_MAIL_TABLE}(
        mail_id,
        player_id,
        sender_type,
        sender_label,
        template_id,
        mail_type,
        title,
        body,
        source_type,
        source_ref_id,
        metadata_jsonb,
        mail_version,
        created_at,
        expire_at,
        first_seen_at,
        read_at,
        claimed_at,
        deleted_at,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function upsertStructuredMails(
  client: import('pg').PoolClient,
  playerId: string,
  mails: MailEntryPayload[],
): Promise<void> {
  if (mails.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;

  for (const entry of mails) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, 'system', $${parameterIndex + 2}, $${parameterIndex + 3}, 'system', $${parameterIndex + 4}, $${parameterIndex + 5}, NULL, NULL, $${parameterIndex + 6}::jsonb, $${parameterIndex + 7}, $${parameterIndex + 8}, $${parameterIndex + 9}, $${parameterIndex + 10}, $${parameterIndex + 11}, $${parameterIndex + 12}, $${parameterIndex + 13}, to_timestamp($${parameterIndex + 14}::double precision / 1000.0))`,
    );
    values.push(
      entry.mailId,
      playerId,
      entry.senderLabel,
      entry.templateId,
      entry.fallbackTitle,
      entry.fallbackBody,
      JSON.stringify({ args: entry.args }),
      Math.max(1, Math.trunc(Number(entry.mailVersion ?? 1))),
      Math.trunc(Number(entry.createdAt)),
      normalizeOptionalInteger(entry.expireAt),
      normalizeOptionalInteger(entry.firstSeenAt),
      normalizeOptionalInteger(entry.readAt),
      normalizeOptionalInteger(entry.claimedAt),
      normalizeOptionalInteger(entry.deletedAt),
      normalizeRequiredInteger(entry.updatedAt, Math.trunc(Number(entry.createdAt))),
    );
    parameterIndex += 15;
  }

  if (parameterIndex - 1 !== values.length) {
    throw new Error(`structured_mail_upsert_placeholder_mismatch:${parameterIndex - 1}:${values.length}`);
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_MAIL_TABLE}(
        mail_id,
        player_id,
        sender_type,
        sender_label,
        template_id,
        mail_type,
        title,
        body,
        source_type,
        source_ref_id,
        metadata_jsonb,
        mail_version,
        created_at,
        expire_at,
        first_seen_at,
        read_at,
        claimed_at,
        deleted_at,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
      ON CONFLICT (mail_id)
      DO UPDATE SET
        player_id = EXCLUDED.player_id,
        sender_type = EXCLUDED.sender_type,
        sender_label = EXCLUDED.sender_label,
        template_id = EXCLUDED.template_id,
        mail_type = EXCLUDED.mail_type,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        source_type = EXCLUDED.source_type,
        source_ref_id = EXCLUDED.source_ref_id,
        metadata_jsonb = EXCLUDED.metadata_jsonb,
        mail_version = EXCLUDED.mail_version,
        created_at = EXCLUDED.created_at,
        expire_at = EXCLUDED.expire_at,
        first_seen_at = EXCLUDED.first_seen_at,
        read_at = EXCLUDED.read_at,
        claimed_at = EXCLUDED.claimed_at,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    `,
    values,
  );
}

async function insertStructuredAttachments(
  client: import('pg').PoolClient,
  playerId: string,
  mails: MailEntryPayload[],
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;

  for (const mail of mails) {
    for (let index = 0; index < mail.attachments.length; index += 1) {
      const attachment = mail.attachments[index];
      const itemId = normalizeRequiredString(attachment.itemId);
      if (!itemId) {
        continue;
      }
      placeholders.push(
        `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, 'item', $${parameterIndex + 3}, $${parameterIndex + 4}, NULL, NULL, $${parameterIndex + 5}::jsonb, NULL, $${parameterIndex + 6}, now())`,
      );
      values.push(
        `mail_attachment:${mail.mailId}:${index}`,
        mail.mailId,
        playerId,
        itemId,
        Math.max(1, Math.trunc(Number(attachment.count ?? 1))),
        JSON.stringify(attachment),
        normalizeOptionalInteger(mail.claimedAt),
      );
      parameterIndex += 7;
    }
  }

  if (placeholders.length === 0) {
    return;
  }

  if (parameterIndex - 1 !== values.length) {
    throw new Error(`structured_mail_attachment_placeholder_mismatch:${parameterIndex - 1}:${values.length}`);
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_MAIL_ATTACHMENT_TABLE}(
        attachment_id,
        mail_id,
        player_id,
        attachment_kind,
        item_id,
        count,
        currency_type,
        amount,
        item_payload_jsonb,
        claim_operation_id,
        claimed_at,
        created_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replaceStructuredAttachmentsForMailIds(
  client: import('pg').PoolClient,
  playerId: string,
  mailIds: string[],
  mails: MailEntryPayload[],
): Promise<void> {
  const normalizedMailIds = Array.from(new Set(mailIds.map((mailId) => normalizeRequiredString(mailId)).filter(Boolean)));
  if (normalizedMailIds.length === 0) {
    return;
  }

  await client.query(
    `
      DELETE FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
      WHERE player_id = $1
        AND mail_id = ANY($2::varchar[])
    `,
    [playerId, normalizedMailIds],
  );

  const affectedMails = mails.filter((entry) => normalizedMailIds.includes(entry.mailId));
  if (affectedMails.length === 0) {
    return;
  }
  await insertStructuredAttachments(client, playerId, affectedMails);
}

function sortMailsByStableKey(mails: MailEntryPayload[]): MailEntryPayload[] {
  return mails
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt || left.mailId.localeCompare(right.mailId, 'zh-Hans-CN'));
}

function buildMailboxFromStructuredRows(
  mailRows: StructuredMailRow[],
  attachmentRows: StructuredAttachmentRow[],
  counterRow: StructuredCounterRow | null,
): MailboxPayload {
  const attachmentsByMailId = new Map<string, MailAttachmentPayload[]>();
  for (const attachmentRow of attachmentRows) {
    const mailId = normalizeRequiredString(attachmentRow.mail_id);
    const itemId = normalizeRequiredString(attachmentRow.item_id);
    if (!mailId || !itemId) {
      continue;
    }
    const attachment: MailAttachmentPayload = {
      itemId,
      count: Math.max(1, Math.trunc(Number(attachmentRow.count ?? 1))),
    };
    const list = attachmentsByMailId.get(mailId);
    if (list) {
      list.push(attachment);
    } else {
      attachmentsByMailId.set(mailId, [attachment]);
    }
  }

  const mails = mailRows
    .map((row): MailEntryPayload | null => {
      const mailId = normalizeRequiredString(row.mail_id);
      const senderLabel = normalizeRequiredString(row.sender_label);
      if (!mailId || !senderLabel) {
        return null;
      }
      const metadata = asRecord(row.metadata_jsonb);
      const args = normalizeMailArgs(metadata?.args);
      return {
        version: 1,
        mailVersion: Math.max(1, normalizeRequiredInteger(row.mail_version, 1)),
        mailId,
        senderLabel,
        templateId: normalizeOptionalString(row.template_id),
        args,
        fallbackTitle: normalizeOptionalString(row.title),
        fallbackBody: normalizeOptionalString(row.body),
        attachments: attachmentsByMailId.get(mailId) ?? [],
        createdAt: normalizeRequiredInteger(row.created_at, Date.now()),
        updatedAt: normalizeRequiredInteger(
          row.updated_at_ms,
          normalizeRequiredInteger(row.created_at, Date.now()),
        ),
        expireAt: normalizeOptionalInteger(row.expire_at),
        firstSeenAt: normalizeOptionalInteger(row.first_seen_at),
        readAt: normalizeOptionalInteger(row.read_at),
        claimedAt: normalizeOptionalInteger(row.claimed_at),
        deletedAt: normalizeOptionalInteger(row.deleted_at),
      };
    })
    .filter((entry): entry is MailEntryPayload => entry !== null)
    .sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId));

  const fallbackRevision = mails.reduce((maxRevision, entry) => {
    return Math.max(maxRevision, Math.max(1, Math.trunc(Number(entry.mailVersion ?? 1))));
  }, 1);

  return {
    version: 1,
    revision: Math.max(1, normalizeRequiredInteger(counterRow?.counter_version, fallbackRevision)),
    welcomeMailDeliveredAt:
      normalizeOptionalInteger(counterRow?.welcome_mail_delivered_at)
      ?? resolveWelcomeMailDeliveredAt(mails),
    mails,
  };
}

/** 规范化邮件箱载荷，过滤非法邮件并保持时间倒序。 */
function normalizeMailbox(raw: unknown): MailboxPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== 1) {
    return null;
  }
  return {
    version: 1,
    revision: Number.isFinite(candidate.revision)
      ? Math.max(1, Math.trunc(Number(candidate.revision ?? 1)))
      : 1,
    welcomeMailDeliveredAt: normalizeOptionalInteger(candidate.welcomeMailDeliveredAt),
    mails: Array.isArray(candidate.mails)
      ? candidate.mails
          .map((entry) => normalizeMailEntry(entry))
          .filter((entry): entry is MailEntryPayload => entry !== null)
          .sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId))
      : [],
  };
}

function normalizeMailEntry(raw: unknown): MailEntryPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    candidate.version !== 1
    || typeof candidate.mailId !== 'string'
    || typeof candidate.senderLabel !== 'string'
  ) {
    return null;
  }

  return {
    version: 1,
    mailVersion: normalizeRequiredInteger(candidate.mailVersion, 1),
    mailId: candidate.mailId,
    senderLabel: candidate.senderLabel,
    templateId: typeof candidate.templateId === 'string' ? candidate.templateId : null,
    args: normalizeMailArgs(candidate.args),
    fallbackTitle: typeof candidate.fallbackTitle === 'string' ? candidate.fallbackTitle : null,
    fallbackBody: typeof candidate.fallbackBody === 'string' ? candidate.fallbackBody : null,
    attachments: Array.isArray(candidate.attachments)
      ? candidate.attachments
          .filter((entry) => typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).itemId === 'string')
          .map((entry) => ({
            itemId: String((entry as Record<string, unknown>).itemId),
            count: Number.isFinite((entry as Record<string, unknown>).count)
              ? Math.max(1, Math.trunc(Number((entry as Record<string, unknown>).count ?? 1)))
              : 1,
          }))
      : [],
    createdAt: normalizeRequiredInteger(candidate.createdAt, Date.now()),
    updatedAt: normalizeRequiredInteger(candidate.updatedAt, Date.now()),
    expireAt: normalizeOptionalInteger(candidate.expireAt),
    firstSeenAt: normalizeOptionalInteger(candidate.firstSeenAt),
    readAt: normalizeOptionalInteger(candidate.readAt),
    claimedAt: normalizeOptionalInteger(candidate.claimedAt),
    deletedAt: normalizeOptionalInteger(candidate.deletedAt),
  };
}

function resolveWelcomeMailDeliveredAt(mails: MailEntryPayload[]): number | null {
  const welcomeEntry = mails.find((entry) => entry.templateId === 'mail.welcome.v1') ?? null;
  return welcomeEntry ? normalizeRequiredInteger(welcomeEntry.createdAt, Date.now()) : null;
}

function normalizeMailArgs(raw: unknown): MailArgPayload[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeMailArg(entry))
    .filter((entry): entry is MailArgPayload => entry !== null);
}

function normalizeMailArg(raw: unknown): MailArgPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const kind = normalizeRequiredString(candidate.kind);
  if (!kind) {
    return null;
  }

  return {
    kind,
    ...(Object.prototype.hasOwnProperty.call(candidate, 'value')
      ? { value: candidate.value }
      : null),
  };
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeRequiredString(value);
  return normalized ? normalized : null;
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function isRetryableMailboxWriteError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  return code === '40P01' || code === '40001';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.trunc(ms)));
  });
}

function normalizeRequiredInteger(value: unknown, fallback: number): number {
  if (value == null || value === '') {
    return Math.trunc(fallback);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : Math.trunc(fallback);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

async function acquireSchemaInitLock(client: import('pg').PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [7100, 1]);
}

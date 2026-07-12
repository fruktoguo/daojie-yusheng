/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 邮件持久化服务。
 * 管理 player_mail、player_mail_attachment、player_mail_counter、player_recovery_watermark 表，
 * 支持结构化邮件的全量/增量写入、过期清理、软删归档和恢复水位推进。
 * 使用 advisory lock 保证同一玩家邮箱的并发写入安全。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';
import { ensureBigintColumnsWithClient } from './schema-bigint-migration';

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
  [key: string]: unknown;
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

export interface BroadcastMailPersistenceResult {
  mailIds: string[];
  recipientCount: number;
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
  item_payload_jsonb?: unknown;
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

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('邮件持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    const sharedPool = this.databasePoolProvider?.getPool('mail') ?? null;
    if (!sharedPool) {
      this.logger.warn('邮件持久化已禁用：数据库连接池提供者未提供连接池');
      return;
    }

    try {
      await ensureStructuredMailTables(sharedPool);
      this.pool = sharedPool;
      this.enabled = true;
      this.logger.log('邮件持久化已启用（player_mail + player_mail_attachment + player_mail_counter + player_recovery_watermark）');
    } catch (error: unknown) {
      this.logger.error(
        '邮件持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      this.pool = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.releasePoolReference();
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
            SELECT mail_id, item_id, count, item_payload_jsonb
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

    for (let attempt = 1; attempt <= SAVE_MAILBOX_RETRY_LIMIT; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await acquirePlayerMailLock(client, normalizedPlayerId);

        const stableMailboxMails = sortMailsByStableKey(normalizedMailbox.mails);
        const currentFence = await loadMailboxWriteFence(client, normalizedPlayerId);
        if (currentFence.counterVersion > normalizedMailbox.revision) {
          this.logger.warn(
            `收到旧邮箱快照，仅合并单调状态：playerId=${normalizedPlayerId} currentRevision=${currentFence.counterVersion} incomingRevision=${normalizedMailbox.revision}`,
          );
        }
        if (stableMailboxMails.length > 0) {
          await upsertStructuredMails(client, normalizedPlayerId, stableMailboxMails);
          await upsertStructuredAttachments(client, normalizedPlayerId, stableMailboxMails);
        }
        // 邮件删除是单调软删除；普通快照不能以“未出现”判定删除，否则跨节点旧缓存会裁掉新邮件。
        const persistedCounter = await refreshStructuredMailCounter(
          client,
          normalizedPlayerId,
          normalizedMailbox.revision,
          normalizedMailbox.welcomeMailDeliveredAt,
        );
        await upsertMailRecoveryWatermark(
          client,
          normalizedPlayerId,
          computeMailboxMailVersion(normalizedMailbox.mails),
          persistedCounter.counterVersion,
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

        const persistedCounter = await refreshStructuredMailCounter(
          client,
          normalizedPlayerId,
          normalizedMailbox.revision,
          normalizedMailbox.welcomeMailDeliveredAt,
        );
        await upsertMailRecoveryWatermark(
          client,
          normalizedPlayerId,
          computeMailboxMailVersion(normalizedMailbox.mails, normalizedAffectedEntries),
          persistedCounter.counterVersion,
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

  /**
   * 以一次集合事务投递全服邮件。收件人锁、邮件、附件、计数和恢复水位要么全部提交，
   * 要么全部回滚；同一 batchId 重放使用确定性 mail_id，不会重复发放。
   */
  async saveBroadcastMail(
    playerIds: readonly string[],
    batchId: string,
    mail: unknown,
  ): Promise<BroadcastMailPersistenceResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('mail_persistence_disabled');
    }

    const normalizedPlayerIds = Array.from(new Set(
      (Array.isArray(playerIds) ? playerIds : [])
        .map((playerId) => normalizeRequiredString(playerId))
        .filter((playerId) => playerId.length > 0),
    )).sort(compareStableString);
    const normalizedBatchId = normalizeRequiredString(batchId);
    if (!normalizedBatchId) {
      throw new Error('mail_broadcast_batch_id_required');
    }
    if (normalizedBatchId.length > 180) {
      throw new Error(`mail_broadcast_batch_id_too_long:${normalizedBatchId.length}`);
    }
    if (normalizedPlayerIds.length === 0) {
      return { mailIds: [], recipientCount: 0 };
    }

    const mailIds = normalizedPlayerIds.map((playerId) => buildBroadcastMailId(normalizedBatchId, playerId));
    const normalizedMail = normalizeMailEntry({
      ...(asRecord(mail) ?? {}),
      version: 1,
      mailId: mailIds[0],
    });
    if (!normalizedMail) {
      throw new Error('mail_broadcast_payload_invalid');
    }
    if (normalizedMail.expireAt !== null && normalizedMail.expireAt <= Date.now()) {
      throw new Error('mail_broadcast_already_expired');
    }
    const payloadHash = buildBroadcastMailPayloadHash(normalizedMail);
    const recipientSetHash = buildBroadcastRecipientSetHash(normalizedPlayerIds);

    for (let attempt = 1; attempt <= SAVE_MAILBOX_RETRY_LIMIT; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await acquirePlayerMailLocks(client, normalizedPlayerIds);
        const insertedRows = await insertBroadcastMailRows(
          client,
          normalizedPlayerIds,
          mailIds,
          normalizedBatchId,
          normalizedMail,
          payloadHash,
          recipientSetHash,
        );
        if (insertedRows.length !== normalizedPlayerIds.length) {
          await assertBroadcastMailReplayCompatible(
            client,
            normalizedPlayerIds,
            mailIds,
            normalizedBatchId,
            payloadHash,
            recipientSetHash,
          );
        }
        if (insertedRows.length > 0) {
          await insertBroadcastMailAttachments(client, insertedRows, normalizedMail.attachments);
          const counterRows = await refreshBroadcastMailCounters(
            client,
            insertedRows.map((row) => row.playerId),
          );
          await upsertBroadcastMailRecoveryWatermarks(client, counterRows);
        }
        await client.query('COMMIT');
        return {
          mailIds,
          recipientCount: normalizedPlayerIds.length,
        };
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

    throw new Error('mail_broadcast_retry_exhausted');
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
        const persistedCounter = await refreshStructuredMailCounter(
          client,
          playerId,
          Math.max(1, mailbox.revision),
          mailbox.welcomeMailDeliveredAt,
        );
        await upsertMailRecoveryWatermark(
          client,
          playerId,
          Math.max(1, maxMailVersion),
          persistedCounter.counterVersion,
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

  private releasePoolReference(): void {
    this.pool = null;
    this.enabled = false;
  }
}

async function acquirePlayerMailLock(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

async function acquirePlayerMailLocks(
  client: import('pg').PoolClient,
  playerIds: readonly string[],
): Promise<void> {
  if (playerIds.length === 0) {
    return;
  }
  await client.query(
    `
      SELECT pg_advisory_xact_lock($1::integer, hashtext(recipient.player_id))
      FROM unnest($2::varchar[]) AS recipient(player_id)
      ORDER BY recipient.player_id ASC
    `,
    [7101, playerIds],
  );
}

interface InsertedBroadcastMailRow {
  playerId: string;
  mailId: string;
}

interface BroadcastMailCounterRow {
  playerId: string;
  counterVersion: number;
}

async function insertBroadcastMailRows(
  client: import('pg').PoolClient,
  playerIds: readonly string[],
  mailIds: readonly string[],
  batchId: string,
  mail: MailEntryPayload,
  payloadHash: string,
  recipientSetHash: string,
): Promise<InsertedBroadcastMailRow[]> {
  const result = await client.query<{ player_id?: unknown; mail_id?: unknown }>(
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
      SELECT
        recipient.mail_id,
        recipient.player_id,
        'system',
        $3,
        $4,
        'system',
        $5,
        $6,
        'gm_broadcast',
        $7,
        $8::jsonb,
        $9,
        $10,
        $11,
        NULL,
        NULL,
        NULL,
        NULL,
        to_timestamp($12::double precision / 1000.0)
      FROM unnest($1::varchar[], $2::varchar[]) AS recipient(player_id, mail_id)
      ON CONFLICT (mail_id) DO NOTHING
      RETURNING player_id, mail_id
    `,
    [
      playerIds,
      mailIds,
      mail.senderLabel,
      mail.templateId,
      mail.fallbackTitle,
      mail.fallbackBody,
      batchId,
      JSON.stringify({
        args: mail.args,
        broadcastBatchId: batchId,
        broadcastPayloadHash: payloadHash,
        broadcastRecipientSetHash: recipientSetHash,
      }),
      Math.max(1, Math.trunc(Number(mail.mailVersion ?? 1))),
      Math.trunc(Number(mail.createdAt)),
      normalizeOptionalInteger(mail.expireAt),
      normalizeRequiredInteger(mail.updatedAt, Math.trunc(Number(mail.createdAt))),
    ],
  );
  return result.rows.map((row) => ({
    playerId: normalizeRequiredString(row.player_id),
    mailId: normalizeRequiredString(row.mail_id),
  })).filter((row) => row.playerId.length > 0 && row.mailId.length > 0);
}

async function assertBroadcastMailReplayCompatible(
  client: import('pg').PoolClient,
  playerIds: readonly string[],
  mailIds: readonly string[],
  batchId: string,
  payloadHash: string,
  recipientSetHash: string,
): Promise<void> {
  const result = await client.query<{ compatible_count?: unknown }>(
    `
      SELECT COUNT(*)::bigint AS compatible_count
      FROM unnest($1::varchar[], $2::varchar[]) AS recipient(player_id, mail_id)
      INNER JOIN ${PLAYER_MAIL_TABLE} mail
        ON mail.player_id = recipient.player_id
       AND mail.mail_id = recipient.mail_id
       AND mail.source_type = 'gm_broadcast'
       AND mail.source_ref_id = $3
       AND mail.metadata_jsonb->>'broadcastPayloadHash' = $4
       AND mail.metadata_jsonb->>'broadcastRecipientSetHash' = $5
    `,
    [playerIds, mailIds, batchId, payloadHash, recipientSetHash],
  );
  const compatibleCount = Math.max(0, normalizeRequiredInteger(result.rows[0]?.compatible_count, 0));
  if (compatibleCount !== playerIds.length) {
    throw new Error(`mail_broadcast_batch_payload_conflict:${batchId}`);
  }
}

async function insertBroadcastMailAttachments(
  client: import('pg').PoolClient,
  insertedRows: readonly InsertedBroadcastMailRow[],
  attachments: readonly MailAttachmentPayload[],
): Promise<void> {
  if (insertedRows.length === 0 || attachments.length === 0) {
    return;
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
      SELECT
        'mail_attachment:' || recipient.mail_id || ':' || (attachment.ordinality - 1)::text,
        recipient.mail_id,
        recipient.player_id,
        'item',
        attachment.payload->>'itemId',
        GREATEST(1, (attachment.payload->>'count')::bigint),
        NULL,
        NULL,
        attachment.payload,
        NULL,
        NULL,
        now()
      FROM unnest($1::varchar[], $2::varchar[]) AS recipient(player_id, mail_id)
      CROSS JOIN LATERAL jsonb_array_elements($3::jsonb)
        WITH ORDINALITY AS attachment(payload, ordinality)
      ON CONFLICT (attachment_id) DO NOTHING
    `,
    [
      insertedRows.map((row) => row.playerId),
      insertedRows.map((row) => row.mailId),
      JSON.stringify(attachments),
    ],
  );
}

async function refreshBroadcastMailCounters(
  client: import('pg').PoolClient,
  playerIds: readonly string[],
): Promise<BroadcastMailCounterRow[]> {
  const now = Date.now();
  const result = await client.query<{ player_id?: unknown; counter_version?: unknown }>(
    `
      WITH target AS (
        SELECT player_id
        FROM unnest($1::varchar[]) AS recipient(player_id)
      ),
      summary AS (
        SELECT
          target.player_id,
          COALESCE(COUNT(mail.mail_id) FILTER (WHERE mail.read_at IS NULL), 0)::bigint AS unread_count,
          COALESCE(COUNT(mail.mail_id) FILTER (
            WHERE mail.claimed_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
                WHERE attachment.player_id = target.player_id
                  AND attachment.mail_id = mail.mail_id
                  AND attachment.claimed_at IS NULL
              )
          ), 0)::bigint AS unclaimed_count,
          MAX(mail.created_at) AS latest_mail_at
        FROM target
        LEFT JOIN ${PLAYER_MAIL_TABLE} mail
          ON mail.player_id = target.player_id
         AND mail.deleted_at IS NULL
         AND (mail.expire_at IS NULL OR mail.expire_at > $2)
        GROUP BY target.player_id
      ),
      next_counter AS (
        SELECT
          summary.player_id,
          summary.unread_count,
          summary.unclaimed_count,
          summary.latest_mail_at,
          COALESCE(current_counter.counter_version, 0) + 1 AS counter_version,
          current_counter.welcome_mail_delivered_at
        FROM summary
        LEFT JOIN ${PLAYER_MAIL_COUNTER_TABLE} current_counter
          ON current_counter.player_id = summary.player_id
      )
      INSERT INTO ${PLAYER_MAIL_COUNTER_TABLE}(
        player_id,
        unread_count,
        unclaimed_count,
        latest_mail_at,
        counter_version,
        welcome_mail_delivered_at,
        updated_at
      )
      SELECT
        player_id,
        unread_count,
        unclaimed_count,
        latest_mail_at,
        counter_version,
        welcome_mail_delivered_at,
        now()
      FROM next_counter
      ON CONFLICT (player_id)
      DO UPDATE SET
        unread_count = EXCLUDED.unread_count,
        unclaimed_count = EXCLUDED.unclaimed_count,
        latest_mail_at = EXCLUDED.latest_mail_at,
        counter_version = GREATEST(
          ${PLAYER_MAIL_COUNTER_TABLE}.counter_version + 1,
          EXCLUDED.counter_version
        ),
        welcome_mail_delivered_at = COALESCE(
          ${PLAYER_MAIL_COUNTER_TABLE}.welcome_mail_delivered_at,
          EXCLUDED.welcome_mail_delivered_at
        ),
        updated_at = now()
      RETURNING player_id, counter_version
    `,
    [playerIds, now],
  );
  return result.rows.map((row) => ({
    playerId: normalizeRequiredString(row.player_id),
    counterVersion: Math.max(1, normalizeRequiredInteger(row.counter_version, 1)),
  })).filter((row) => row.playerId.length > 0);
}

async function upsertBroadcastMailRecoveryWatermarks(
  client: import('pg').PoolClient,
  counterRows: readonly BroadcastMailCounterRow[],
): Promise<void> {
  if (counterRows.length === 0) {
    return;
  }
  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
        player_id,
        mail_version,
        mail_counter_version,
        updated_at
      )
      SELECT recipient.player_id, 1, recipient.counter_version, now()
      FROM unnest($1::varchar[], $2::bigint[]) AS recipient(player_id, counter_version)
      ON CONFLICT (player_id)
      DO UPDATE SET
        mail_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_version, EXCLUDED.mail_version),
        mail_counter_version = GREATEST(
          ${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_counter_version,
          EXCLUDED.mail_counter_version
        ),
        updated_at = now()
    `,
    [
      counterRows.map((row) => row.playerId),
      counterRows.map((row) => row.counterVersion),
    ],
  );
}

function buildBroadcastMailId(batchId: string, playerId: string): string {
  const batchHash = createHash('sha256').update(batchId, 'utf8').digest('hex').slice(0, 32);
  const playerHash = createHash('sha256').update(playerId, 'utf8').digest('hex').slice(0, 32);
  return `mail:b:${batchHash}:p:${playerHash}`;
}

function buildBroadcastMailPayloadHash(mail: MailEntryPayload): string {
  return createHash('sha256').update(stableMailJsonStringify({
    senderLabel: mail.senderLabel,
    templateId: mail.templateId,
    args: mail.args,
    fallbackTitle: mail.fallbackTitle,
    fallbackBody: mail.fallbackBody,
    attachments: mail.attachments,
    expireAt: mail.expireAt,
  }), 'utf8').digest('hex');
}

function buildBroadcastRecipientSetHash(playerIds: readonly string[]): string {
  return createHash('sha256').update(playerIds.join('\n'), 'utf8').digest('hex');
}

function compareStableString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableMailJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableMailJsonStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableMailJsonStringify(record[key])}`)
    .join(',')}}`;
}

async function loadMailboxWriteFence(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<{ counterVersion: number }> {
  const counterResult = await client.query<{ counter_version?: unknown }>(
    `SELECT counter_version FROM ${PLAYER_MAIL_COUNTER_TABLE} WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  return {
    counterVersion: Math.max(0, Math.trunc(Number(counterResult.rows[0]?.counter_version ?? 0) || 0)),
  };
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
  await ensureBigintColumnsWithClient(client, MAIL_BIGINT_COLUMNS_BY_TABLE);
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

function computeMailboxMailVersion(
  mails: MailEntryPayload[],
  extraEntries: MailEntryPayload[] = [],
): number {
  const combined = [...mails, ...extraEntries];
  return combined.reduce((maxVersion, entry) => {
    return Math.max(maxVersion, Math.max(1, Math.trunc(Number(entry?.mailVersion ?? 1))));
  }, 1);
}

/**
 * 在同一玩家邮箱事务锁内从结构化真源回算计数。
 * 不接受运行时缓存统计，避免跨节点旧快照把 durable claim 后的计数写回旧值。
 */
async function refreshStructuredMailCounter(
  client: import('pg').PoolClient,
  playerId: string,
  requestedRevision: number,
  incomingWelcomeMailDeliveredAt: number | null,
): Promise<{
  unreadCount: number;
  unclaimedCount: number;
  latestMailAt: number | null;
  counterVersion: number;
  welcomeMailDeliveredAt: number | null;
}> {
  const now = Date.now();
  const currentCounter = await client.query<{
    counter_version?: unknown;
    welcome_mail_delivered_at?: unknown;
  }>(
    `
      SELECT counter_version, welcome_mail_delivered_at
      FROM ${PLAYER_MAIL_COUNTER_TABLE}
      WHERE player_id = $1
      FOR UPDATE
    `,
    [playerId],
  );
  const aggregate = await client.query<{
    unread_count?: unknown;
    unclaimed_count?: unknown;
    latest_mail_at?: unknown;
  }>(
    `
      WITH visible_mail AS (
        SELECT mail_id, created_at, read_at, claimed_at
        FROM ${PLAYER_MAIL_TABLE}
        WHERE player_id = $1
          AND deleted_at IS NULL
          AND (expire_at IS NULL OR expire_at > $2)
      )
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE visible_mail.read_at IS NULL), 0) AS unread_count,
        COALESCE(COUNT(*) FILTER (
          WHERE visible_mail.claimed_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
              WHERE attachment.player_id = $1
                AND attachment.mail_id = visible_mail.mail_id
                AND attachment.claimed_at IS NULL
            )
        ), 0) AS unclaimed_count,
        MAX(visible_mail.created_at) AS latest_mail_at
      FROM visible_mail
    `,
    [playerId, now],
  );
  const currentCounterVersion = Math.max(
    0,
    Math.trunc(Number(currentCounter.rows[0]?.counter_version ?? 0) || 0),
  );
  const counterVersion = Math.max(
    currentCounterVersion + 1,
    Math.max(1, Math.trunc(Number(requestedRevision ?? 1) || 1)),
  );
  const row = aggregate.rows[0] ?? {};
  const welcomeMailDeliveredAt =
    normalizeOptionalInteger(currentCounter.rows[0]?.welcome_mail_delivered_at)
    ?? normalizeOptionalInteger(incomingWelcomeMailDeliveredAt);
  const summary = {
    unreadCount: Math.max(0, Math.trunc(Number(row.unread_count ?? 0) || 0)),
    unclaimedCount: Math.max(0, Math.trunc(Number(row.unclaimed_count ?? 0) || 0)),
    latestMailAt: normalizeOptionalInteger(row.latest_mail_at),
    welcomeMailDeliveredAt,
  };
  await upsertStructuredMailCounter(client, playerId, counterVersion, summary);
  return {
    ...summary,
    counterVersion,
  };
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
      WHERE ${PLAYER_MAIL_COUNTER_TABLE}.counter_version <= EXCLUDED.counter_version
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
        sender_type = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.sender_type
          ELSE ${PLAYER_MAIL_TABLE}.sender_type
        END,
        sender_label = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.sender_label
          ELSE ${PLAYER_MAIL_TABLE}.sender_label
        END,
        template_id = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.template_id
          ELSE ${PLAYER_MAIL_TABLE}.template_id
        END,
        mail_type = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.mail_type
          ELSE ${PLAYER_MAIL_TABLE}.mail_type
        END,
        title = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.title
          ELSE ${PLAYER_MAIL_TABLE}.title
        END,
        body = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.body
          ELSE ${PLAYER_MAIL_TABLE}.body
        END,
        source_type = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.source_type
          ELSE ${PLAYER_MAIL_TABLE}.source_type
        END,
        source_ref_id = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.source_ref_id
          ELSE ${PLAYER_MAIL_TABLE}.source_ref_id
        END,
        metadata_jsonb = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.metadata_jsonb
          ELSE ${PLAYER_MAIL_TABLE}.metadata_jsonb
        END,
        mail_version = GREATEST(${PLAYER_MAIL_TABLE}.mail_version, EXCLUDED.mail_version),
        expire_at = CASE
          WHEN ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version THEN EXCLUDED.expire_at
          ELSE ${PLAYER_MAIL_TABLE}.expire_at
        END,
        first_seen_at = COALESCE(${PLAYER_MAIL_TABLE}.first_seen_at, EXCLUDED.first_seen_at),
        read_at = COALESCE(${PLAYER_MAIL_TABLE}.read_at, EXCLUDED.read_at),
        claimed_at = COALESCE(${PLAYER_MAIL_TABLE}.claimed_at, EXCLUDED.claimed_at),
        deleted_at = COALESCE(${PLAYER_MAIL_TABLE}.deleted_at, EXCLUDED.deleted_at),
        updated_at = GREATEST(${PLAYER_MAIL_TABLE}.updated_at, EXCLUDED.updated_at)
      WHERE ${PLAYER_MAIL_TABLE}.player_id = EXCLUDED.player_id
        AND (
          ${PLAYER_MAIL_TABLE}.mail_version < EXCLUDED.mail_version
          OR (${PLAYER_MAIL_TABLE}.first_seen_at IS NULL AND EXCLUDED.first_seen_at IS NOT NULL)
          OR (${PLAYER_MAIL_TABLE}.read_at IS NULL AND EXCLUDED.read_at IS NOT NULL)
          OR (${PLAYER_MAIL_TABLE}.claimed_at IS NULL AND EXCLUDED.claimed_at IS NOT NULL)
          OR (${PLAYER_MAIL_TABLE}.deleted_at IS NULL AND EXCLUDED.deleted_at IS NOT NULL)
        )
    `,
    values,
  );
}

async function upsertStructuredAttachments(
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
        buildMailAttachmentId(mail.mailId, index),
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
    throw new Error(`structured_mail_attachment_upsert_placeholder_mismatch:${parameterIndex - 1}:${values.length}`);
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
      ON CONFLICT (attachment_id)
      DO UPDATE SET
        claim_operation_id = COALESCE(
          ${PLAYER_MAIL_ATTACHMENT_TABLE}.claim_operation_id,
          EXCLUDED.claim_operation_id
        ),
        claimed_at = COALESCE(${PLAYER_MAIL_ATTACHMENT_TABLE}.claimed_at, EXCLUDED.claimed_at)
      WHERE ${PLAYER_MAIL_ATTACHMENT_TABLE}.player_id = EXCLUDED.player_id
        AND ${PLAYER_MAIL_ATTACHMENT_TABLE}.mail_id = EXCLUDED.mail_id
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

  const affectedMails = mails.filter((entry) => normalizedMailIds.includes(entry.mailId));
  if (affectedMails.length === 0) {
    return;
  }
  // 附件是邮件创建时的不可变资产载荷。局部邮件状态写只做单调 upsert，
  // 禁止删除后重建，否则会清掉 durable claim 写入的 operationId 与 claimedAt。
  await upsertStructuredAttachments(client, playerId, affectedMails);
}

function buildMailAttachmentId(mailId: string, index: number): string {
  return `mail_attachment:${mailId}:${index}`;
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
    const rawPayload = asRecord(attachmentRow.item_payload_jsonb);
    const attachment: MailAttachmentPayload = {
      ...rawPayload,
      itemId,
      count: Math.max(1, Math.trunc(Number(attachmentRow.count ?? rawPayload.count ?? 1))),
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
          .map((entry) => normalizeMailAttachment(entry as Record<string, unknown>))
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

function normalizeMailAttachment(entry: Record<string, unknown>): MailAttachmentPayload {
  return {
    ...entry,
    itemId: String(entry.itemId).trim(),
    count: Number.isFinite(entry.count)
      ? Math.max(1, Math.trunc(Number(entry.count ?? 1)))
      : 1,
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

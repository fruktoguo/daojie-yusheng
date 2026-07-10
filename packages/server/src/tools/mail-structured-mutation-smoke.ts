import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { MailPersistenceService } from '../persistence/mail-persistence.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';

const databaseUrl = resolveServerDatabaseUrl();

const PLAYER_SCOPED_TABLES = [
  'player_mail_attachment',
  'player_mail',
  'player_mail_counter',
  'persistent_documents',
  'player_presence',
  'player_wallet',
  'player_inventory_item',
  'player_recovery_watermark',
] as const;

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下 MailRuntimeService 的 markRead/delete 会推进 player_mail.mail_version、player_mail_counter.counter_version，并把 deleted_at 写入结构化真源',
          excludes: '不证明邮件附件 durable claim、GM restore、真实客户端分页交互或跨节点并发写',
          completionMapping: 'release:proof:with-db.mail-structured-mutation',
        },
        null,
        2,
      ),
    );
    return;
  }

  const now = Date.now();
  const playerId = `mail_mut_${now.toString(36)}`;
  const stalePlayerId = `${playerId}_stale`;
  const pool = new Pool({ connectionString: databaseUrl });
  const contentTemplateRepository = new ContentTemplateRepository();
  const databasePoolProvider = new DatabasePoolProvider();
  const mailPersistence = new MailPersistenceService(databasePoolProvider);
  const durableOperation = new DurableOperationService();
  const runtime = new MailRuntimeService(
    contentTemplateRepository,
    {
      getPlayerOrThrow() {
        return {
          inventory: {
            capacity: 24,
            items: [],
          },
        };
      },
    } as never,
    mailPersistence,
    durableOperation,
    {
      isEnabled() {
        return false;
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
      async loadInstanceCatalog() {
        return null;
      },
    } as never,
  );

  contentTemplateRepository.onModuleInit();
  await mailPersistence.onModuleInit();
  if (!mailPersistence.isEnabled()) {
    throw new Error('mail-persistence service not enabled');
  }

  try {
    await cleanupPlayer(pool, playerId);

    await mailPersistence.saveMailbox(playerId, {
      version: 1,
      revision: 1,
      welcomeMailDeliveredAt: null,
      mails: [
        {
          version: 1,
          mailVersion: 1,
          mailId: `${playerId}:mail:old`,
          senderLabel: '系统',
          templateId: null,
          args: [],
          fallbackTitle: 'old',
          fallbackBody: 'old',
          attachments: [
            { itemId: 'rat_tail', count: 1 },
            { itemId: 'spirit_stone', count: 2 },
          ],
          createdAt: now,
          updatedAt: now,
          expireAt: null,
          firstSeenAt: null,
          readAt: null,
          claimedAt: null,
          deletedAt: null,
        },
        {
          version: 1,
          mailVersion: 1,
          mailId: `${playerId}:mail:stale`,
          senderLabel: '系统',
          templateId: null,
          args: [],
          fallbackTitle: 'stale',
          fallbackBody: 'stale',
          attachments: [{ itemId: 'old_leaf', count: 1 }],
          createdAt: now - 1,
          updatedAt: now - 1,
          expireAt: null,
          firstSeenAt: null,
          readAt: null,
          claimedAt: null,
          deletedAt: null,
        },
      ],
    });
    await mailPersistence.saveMailbox(playerId, {
      version: 1,
      revision: 2,
      welcomeMailDeliveredAt: null,
      mails: [
        {
          version: 1,
          mailVersion: 2,
          mailId: `${playerId}:mail:old`,
          senderLabel: '系统',
          templateId: null,
          args: [],
          fallbackTitle: 'old-updated',
          fallbackBody: 'old-updated',
          attachments: [{ itemId: 'rat_tail', count: 3 }],
          createdAt: now,
          updatedAt: now + 1,
          expireAt: null,
          firstSeenAt: null,
          readAt: null,
          claimedAt: null,
          deletedAt: null,
        },
      ],
    });
    const mergedMailRows = await fetchRows(
      pool,
      'SELECT mail_id, mail_version, title FROM player_mail WHERE player_id = $1 ORDER BY mail_id ASC',
      [playerId],
    );
    const mergedAttachmentRows = await fetchRows(
      pool,
      'SELECT attachment_id, mail_id, item_id, count FROM player_mail_attachment WHERE player_id = $1 ORDER BY attachment_id ASC',
      [playerId],
    );
    if (
      mergedMailRows.length !== 2
      || mergedMailRows[0]?.mail_id !== `${playerId}:mail:old`
      || Number(mergedMailRows[0]?.mail_version ?? 0) !== 2
      || mergedMailRows[0]?.title !== 'old-updated'
      || mergedMailRows[1]?.mail_id !== `${playerId}:mail:stale`
      || Number(mergedMailRows[1]?.mail_version ?? 0) !== 1
    ) {
      throw new Error(`unexpected saveMailbox merged mail rows: ${JSON.stringify(mergedMailRows)}`);
    }
    if (
      mergedAttachmentRows.length !== 3
      || mergedAttachmentRows[0]?.attachment_id !== `mail_attachment:${playerId}:mail:old:0`
      || mergedAttachmentRows[0]?.item_id !== 'rat_tail'
      || Number(mergedAttachmentRows[0]?.count ?? 0) !== 1
      || mergedAttachmentRows[1]?.attachment_id !== `mail_attachment:${playerId}:mail:old:1`
      || mergedAttachmentRows[1]?.item_id !== 'spirit_stone'
      || Number(mergedAttachmentRows[1]?.count ?? 0) !== 2
      || mergedAttachmentRows[2]?.attachment_id !== `mail_attachment:${playerId}:mail:stale:0`
      || mergedAttachmentRows[2]?.item_id !== 'old_leaf'
      || Number(mergedAttachmentRows[2]?.count ?? 0) !== 1
    ) {
      throw new Error(`unexpected saveMailbox merged attachment rows: ${JSON.stringify(mergedAttachmentRows)}`);
    }

    const mailId = await runtime.createDirectMail(playerId, {
      templateId: null,
      fallbackTitle: 'mail structured mutation smoke',
      fallbackBody: 'mail structured mutation smoke',
      attachments: [],
    });

    const createdMailRow = await fetchSingleRow(
      pool,
      'SELECT mail_version, read_at, deleted_at FROM player_mail WHERE mail_id = $1',
      [mailId],
    );
    const createdCounterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [playerId],
    );
    const createdWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT mail_version, mail_counter_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const createdLegacyRow = await fetchLegacyMailboxDocument(pool, playerId);
    if (
      !createdMailRow
      || Number(createdMailRow.mail_version) !== 1
      || createdMailRow.read_at != null
      || createdMailRow.deleted_at != null
    ) {
      throw new Error(`unexpected created player_mail row: ${JSON.stringify(createdMailRow)}`);
    }
    if (
      !createdCounterRow
      || Number(createdCounterRow.unread_count) !== 3
      || Number(createdCounterRow.unclaimed_count) !== 2
      || Number(createdCounterRow.counter_version) <= 0
    ) {
      throw new Error(`unexpected created player_mail_counter row: ${JSON.stringify(createdCounterRow)}`);
    }
    if (
      !createdWatermarkRow
      || Number(createdWatermarkRow.mail_version) < Number(createdMailRow?.mail_version ?? 0)
      || Number(createdWatermarkRow.mail_counter_version) <= 0
    ) {
      throw new Error(`unexpected created player_recovery_watermark row: ${JSON.stringify(createdWatermarkRow)}`);
    }
    if (createdLegacyRow != null) {
      throw new Error(`unexpected legacy persistent_documents row after create: ${JSON.stringify(createdLegacyRow)}`);
    }

    const markReadResult = await runtime.markRead(playerId, [mailId]);
    if (!markReadResult.ok) {
      throw new Error(`unexpected markRead result: ${JSON.stringify(markReadResult)}`);
    }

    const readMailRow = await fetchSingleRow(
      pool,
      'SELECT mail_version, read_at, deleted_at FROM player_mail WHERE mail_id = $1',
      [mailId],
    );
    const readCounterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [playerId],
    );
    const readWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT mail_version, mail_counter_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    if (
      !readMailRow
      || Number(readMailRow.mail_version) < 2
      || readMailRow.read_at == null
      || readMailRow.deleted_at != null
    ) {
      throw new Error(`unexpected read player_mail row: ${JSON.stringify(readMailRow)}`);
    }
    if (
      !readCounterRow
      || Number(readCounterRow.unread_count) !== 2
      || Number(readCounterRow.unclaimed_count) !== 2
      || Number(readCounterRow.counter_version) <= Number(createdCounterRow.counter_version ?? 0)
    ) {
      throw new Error(`unexpected read player_mail_counter row: ${JSON.stringify(readCounterRow)}`);
    }
    if (
      !readWatermarkRow
      || Number(readWatermarkRow.mail_version) < Number(readMailRow.mail_version ?? 0)
      || Number(readWatermarkRow.mail_counter_version) <= Number(createdWatermarkRow.mail_counter_version ?? 0)
    ) {
      throw new Error(`unexpected read player_recovery_watermark row: ${JSON.stringify(readWatermarkRow)}`);
    }

    const deleteResult = await runtime.deleteMails(playerId, [mailId]);
    if (!deleteResult.ok) {
      throw new Error(`unexpected delete result: ${JSON.stringify(deleteResult)}`);
    }

    const deletedMailRow = await fetchSingleRow(
      pool,
      'SELECT mail_version, read_at, deleted_at FROM player_mail WHERE mail_id = $1',
      [mailId],
    );
    const deletedCounterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [playerId],
    );
    const deletedWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT mail_version, mail_counter_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const deletedLegacyRow = await fetchLegacyMailboxDocument(pool, playerId);
    const summary = await runtime.getSummary(playerId);
    if (
      !deletedMailRow
      || Number(deletedMailRow.mail_version) <= Number(readMailRow.mail_version ?? 0)
      || deletedMailRow.read_at == null
      || deletedMailRow.deleted_at == null
    ) {
      throw new Error(`unexpected deleted player_mail row: ${JSON.stringify(deletedMailRow)}`);
    }
    if (
      !deletedCounterRow
      || Number(deletedCounterRow.unread_count) !== 2
      || Number(deletedCounterRow.unclaimed_count) !== 2
      || Number(deletedCounterRow.counter_version) <= Number(readCounterRow.counter_version ?? 0)
    ) {
      throw new Error(`unexpected deleted player_mail_counter row: ${JSON.stringify(deletedCounterRow)}`);
    }
    if (
      !deletedWatermarkRow
      || Number(deletedWatermarkRow.mail_version) < Number(deletedMailRow.mail_version ?? 0)
      || Number(deletedWatermarkRow.mail_counter_version) <= Number(readWatermarkRow.mail_counter_version ?? 0)
    ) {
      throw new Error(`unexpected deleted player_recovery_watermark row: ${JSON.stringify(deletedWatermarkRow)}`);
    }
    if (deletedLegacyRow != null) {
      throw new Error(`unexpected legacy persistent_documents row after delete: ${JSON.stringify(deletedLegacyRow)}`);
    }
    if (summary.unreadCount !== 2 || summary.claimableCount !== 2) {
      throw new Error(`unexpected runtime summary after delete: ${JSON.stringify(summary)}`);
    }

    await verifyCrossNodeStaleWritePreservesClaim(pool, mailPersistence, stalePlayerId, now + 100);

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          mailId,
          answers: 'with-db 下已验证邮箱快照仅做单调 upsert，旧节点同版本写不会回滚 durable claim、清掉附件 claim_operation_id 或删除更新邮件；markRead/delete 后计数和恢复水位在事务锁内单调推进',
          excludes: '不证明 GM restore 或真实客户端分页交互',
          completionMapping: 'release:proof:with-db.mail-structured-mutation',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await cleanupPlayer(pool, stalePlayerId).catch(() => undefined);
    await mailPersistence.onModuleDestroy().catch(() => undefined);
    await durableOperation.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function verifyCrossNodeStaleWritePreservesClaim(
  pool: Pool,
  mailPersistence: MailPersistenceService,
  playerId: string,
  now: number,
): Promise<void> {
  const mailId = `${playerId}:mail:claim`;
  const newerMailId = `${playerId}:mail:newer`;
  const claimOperationId = `mail-claim-smoke:${playerId}`;
  const staleEntry = {
    version: 1,
    mailVersion: 2,
    mailId,
    senderLabel: '系统',
    templateId: null,
    args: [],
    fallbackTitle: 'stale claim',
    fallbackBody: 'stale claim',
    attachments: [{ itemId: 'spirit_stone', count: 8 }],
    createdAt: now,
    updatedAt: now + 1,
    expireAt: null,
    firstSeenAt: null,
    readAt: null,
    claimedAt: null,
    deletedAt: null,
  };

  await cleanupPlayer(pool, playerId);
  await mailPersistence.saveMailbox(playerId, {
    version: 1,
    revision: 1,
    welcomeMailDeliveredAt: null,
    mails: [{ ...staleEntry, mailVersion: 1, updatedAt: now }],
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
    await client.query(
      `
        UPDATE player_mail_attachment
        SET claim_operation_id = $1, claimed_at = $2
        WHERE player_id = $3 AND mail_id = $4
      `,
      [claimOperationId, now + 1, playerId, mailId],
    );
    await client.query(
      `
        UPDATE player_mail
        SET read_at = $1, claimed_at = $1, mail_version = 2, updated_at = now()
        WHERE player_id = $2 AND mail_id = $3
      `,
      [now + 1, playerId, mailId],
    );
    await client.query(
      `
        INSERT INTO player_mail(
          mail_id, player_id, sender_type, sender_label, mail_type, title, body,
          metadata_jsonb, mail_version, created_at, updated_at
        )
        VALUES ($1, $2, 'system', '系统', 'system', '新节点邮件', '新节点邮件', '{}'::jsonb, 1, $3, now())
      `,
      [newerMailId, playerId, now + 2],
    );
    await client.query(
      `
        UPDATE player_mail_counter
        SET unread_count = 1, unclaimed_count = 0, latest_mail_at = $2,
            counter_version = 200, updated_at = now()
        WHERE player_id = $1
      `,
      [playerId, now + 2],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  // 模拟另一节点保留的旧快照：邮件版本与 durable claim 相同，但完全不知道已领取状态和新邮件。
  await mailPersistence.saveMailbox(playerId, {
    version: 1,
    revision: 2,
    welcomeMailDeliveredAt: null,
    mails: [staleEntry],
  });
  await mailPersistence.saveMailboxMutation(
    playerId,
    {
      version: 1,
      revision: 3,
      welcomeMailDeliveredAt: null,
      mails: [],
    },
    [{ ...staleEntry, mailVersion: 3, updatedAt: now + 3, deletedAt: now + 3 }],
  );

  const mailRows = await fetchRows(
    pool,
    'SELECT mail_id, mail_version, read_at, claimed_at, deleted_at FROM player_mail WHERE player_id = $1 ORDER BY mail_id ASC',
    [playerId],
  );
  const attachmentRow = await fetchSingleRow(
    pool,
    'SELECT claim_operation_id, claimed_at FROM player_mail_attachment WHERE player_id = $1 AND mail_id = $2',
    [playerId, mailId],
  );
  const counterRow = await fetchSingleRow(
    pool,
    'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
    [playerId],
  );
  const claimedMail = mailRows.find((row) => row.mail_id === mailId) ?? null;
  if (
    mailRows.length !== 2
    || !claimedMail
    || claimedMail.read_at == null
    || claimedMail.claimed_at == null
    || claimedMail.deleted_at == null
    || !attachmentRow
    || attachmentRow.claim_operation_id !== claimOperationId
    || attachmentRow.claimed_at == null
    || !counterRow
    || Number(counterRow.unread_count) !== 1
    || Number(counterRow.unclaimed_count) !== 0
    || Number(counterRow.counter_version) <= 200
  ) {
    throw new Error(`cross-node stale mail write regressed durable state: ${JSON.stringify({ mailRows, attachmentRow, counterRow })}`);
  }
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const tableName of PLAYER_SCOPED_TABLES) {
      if (tableName === 'persistent_documents') {
        const legacyTable = await client.query("SELECT to_regclass('public.persistent_documents') AS table_name");
        if (legacyTable.rows[0]?.table_name) {
          await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_mailboxes_v1', playerId]);
        }
        continue;
      }
      await client.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE player_id = $1`, [playerId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function fetchSingleRow(pool: Pool, sql: string, values: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await pool.query(sql, values);
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return (result.rows[0] ?? null) as Record<string, unknown> | null;
}

async function fetchRows(pool: Pool, sql: string, values: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(sql, values);
  return (result.rows ?? []) as Array<Record<string, unknown>>;
}

async function fetchLegacyMailboxDocument(pool: Pool, playerId: string): Promise<Record<string, unknown> | null> {
  const legacyTable = await pool.query("SELECT to_regclass('public.persistent_documents') AS table_name");
  if (!legacyTable.rows[0]?.table_name) {
    return null;
  }
  return fetchSingleRow(
    pool,
    'SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2',
    ['server_mailboxes_v1', playerId],
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { ContentTemplateRepository } from '../content/content-template.repository';
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
          completionMapping: 'replace-ready:proof:with-db.mail-structured-mutation',
        },
        null,
        2,
      ),
    );
    return;
  }

  const now = Date.now();
  const playerId = `mail_mut_${now.toString(36)}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const contentTemplateRepository = new ContentTemplateRepository();
  const mailPersistence = new MailPersistenceService();
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
    const createdLegacyRow = await fetchSingleRow(
      pool,
      'SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2',
      ['server_mailboxes_v1', playerId],
    );
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
      || Number(createdCounterRow.unread_count) !== 1
      || Number(createdCounterRow.unclaimed_count) !== 0
      || Number(createdCounterRow.counter_version) <= 0
    ) {
      throw new Error(`unexpected created player_mail_counter row: ${JSON.stringify(createdCounterRow)}`);
    }
    if (
      !createdWatermarkRow
      || Number(createdWatermarkRow.mail_version) !== 1
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
      || Number(readCounterRow.unread_count) !== 0
      || Number(readCounterRow.unclaimed_count) !== 0
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
    const deletedLegacyRow = await fetchSingleRow(
      pool,
      'SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2',
      ['server_mailboxes_v1', playerId],
    );
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
      || Number(deletedCounterRow.unread_count) !== 0
      || Number(deletedCounterRow.unclaimed_count) !== 0
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
    if (summary.unreadCount !== 0 || summary.claimableCount !== 0) {
      throw new Error(`unexpected runtime summary after delete: ${JSON.stringify(summary)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          mailId,
          answers: 'with-db 下已验证 MailRuntimeService 的 markRead/delete 会推进 player_mail.mail_version、player_mail_counter.counter_version，并同步推进 player_recovery_watermark.mail_version/mail_counter_version，且 deleted_at 会写入结构化真源',
          excludes: '不证明邮件附件 durable claim、GM restore、真实客户端分页交互或跨节点并发写',
          completionMapping: 'replace-ready:proof:with-db.mail-structured-mutation',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await mailPersistence.onModuleDestroy().catch(() => undefined);
    await durableOperation.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const tableName of PLAYER_SCOPED_TABLES) {
      if (tableName === 'persistent_documents') {
        await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_mailboxes_v1', playerId]);
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

function quoteIdentifier(identifier: string): string {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

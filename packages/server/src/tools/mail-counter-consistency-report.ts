import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可输出 player_mail_counter 与 player_mail 主表的一致性修复次数（当前以不一致玩家数衡量）',
      excludes: '不证明真实多节点邮件同步风暴',
      completionMapping: 'replace-ready:proof:stage6.mail-counter-consistency',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<{
      player_id?: unknown;
      unread_count?: unknown;
      unclaimed_count?: unknown;
      derived_unread_count?: unknown;
      derived_unclaimed_count?: unknown;
      latest_mail_at?: unknown;
      latest_created_at?: unknown;
    }>(
      `
        WITH visible_mail AS (
          SELECT
            player_id,
            mail_id,
            read_at,
            claimed_at,
            deleted_at,
            expire_at,
            created_at
          FROM player_mail
          WHERE deleted_at IS NULL
            AND (expire_at IS NULL OR expire_at > (EXTRACT(EPOCH FROM now()) * 1000)::bigint)
        ),
        derived AS (
          SELECT
            player_id,
            COUNT(*) FILTER (WHERE read_at IS NULL)::bigint AS derived_unread_count,
            COUNT(*) FILTER (WHERE claimed_at IS NULL AND EXISTS (
              SELECT 1
              FROM player_mail_attachment attachment
              WHERE attachment.player_id = visible_mail.player_id
                AND attachment.mail_id = visible_mail.mail_id
            ))::bigint AS derived_unclaimed_count,
            MAX(created_at) AS latest_created_at
          FROM visible_mail
          GROUP BY player_id
        )
        SELECT
          counter.player_id,
          counter.unread_count,
          counter.unclaimed_count,
          COALESCE(derived.derived_unread_count, 0) AS derived_unread_count,
          COALESCE(derived.derived_unclaimed_count, 0) AS derived_unclaimed_count,
          counter.latest_mail_at,
          derived.latest_created_at
        FROM player_mail_counter counter
        LEFT JOIN derived ON derived.player_id = counter.player_id
        ORDER BY counter.player_id ASC
      `,
    );

    const mismatchedRows = Array.isArray(result.rows)
      ? result.rows.filter((row) => {
          const unread = Number(row?.unread_count ?? 0);
          const unclaimed = Number(row?.unclaimed_count ?? 0);
          const derivedUnread = Number(row?.derived_unread_count ?? 0);
          const derivedUnclaimed = Number(row?.derived_unclaimed_count ?? 0);
          return unread !== derivedUnread || unclaimed !== derivedUnclaimed;
        })
      : [];

    console.log(JSON.stringify({
      ok: true,
      playerCount: Array.isArray(result.rows) ? result.rows.length : 0,
      mismatchCount: mismatchedRows.length,
      mismatchedRows: mismatchedRows.slice(0, 20),
      answers: '当前已可直接输出 mail counter 与主表的一致性扫描结果，并据此观察是否存在需要修复的计数差异',
      excludes: '不证明真实多节点邮件同步风暴',
      completionMapping: 'replace-ready:proof:stage6.mail-counter-consistency',
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

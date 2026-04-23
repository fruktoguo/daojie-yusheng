import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../config/env-alias';

const TABLES = [
  {
    name: 'player_mail',
    columns: ['mail_id', 'player_id', 'sender_type', 'sender_label', 'template_id', 'mail_type', 'title', 'body', 'source_type', 'source_ref_id', 'metadata_jsonb', 'mail_version', 'created_at', 'expire_at', 'first_seen_at', 'read_at', 'claimed_at', 'deleted_at', 'updated_at'],
    indexes: ['player_mail_player_idx'],
  },
  {
    name: 'player_mail_attachment',
    columns: ['attachment_id', 'mail_id', 'player_id', 'attachment_kind', 'item_id', 'count', 'currency_type', 'amount', 'item_payload_jsonb', 'claim_operation_id', 'claimed_at', 'created_at'],
    indexes: ['player_mail_attachment_mail_idx', 'player_mail_attachment_player_idx'],
  },
  {
    name: 'player_mail_counter',
    columns: ['player_id', 'unread_count', 'unclaimed_count', 'latest_mail_at', 'counter_version', 'welcome_mail_delivered_at', 'updated_at'],
    indexes: [],
  },
] as const;

type TableReport = {
  table: string;
  exists: boolean;
  missingColumns: string[];
  missingIndexes: string[];
};

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl().trim();
  if (!databaseUrl) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'database_disabled' }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const reports: TableReport[] = [];
    for (const table of TABLES) {
      const exists = await hasTable(pool, table.name);
      if (!exists) {
        reports.push({
          table: table.name,
          exists: false,
          missingColumns: [...table.columns],
          missingIndexes: [...table.indexes],
        });
        continue;
      }
      const columns = await listTableColumns(pool, table.name);
      const indexes = await listTableIndexes(pool, table.name);
      reports.push({
        table: table.name,
        exists: true,
        missingColumns: table.columns.filter((column) => !columns.has(column)),
        missingIndexes: table.indexes.filter((index) => !indexes.has(index)),
      });
    }

    const schemaHealthy = reports.every((report) => report.exists && report.missingColumns.length === 0 && report.missingIndexes.length === 0);
    console.log(JSON.stringify({
      ok: true,
      schemaHealthy,
      tables: reports,
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function hasTable(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1
    `,
    [tableName],
  );
  return (result.rowCount ?? 0) > 0;
}

async function listTableColumns(pool: Pool, tableName: string): Promise<Set<string>> {
  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function listTableIndexes(pool: Pool, tableName: string): Promise<Set<string>> {
  const result = await pool.query<{ indexname: string }>(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
    `,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.indexname));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

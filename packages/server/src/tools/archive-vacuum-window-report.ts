import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { RuntimeMaintenanceService } from '../runtime/world/runtime-maintenance.service';
import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

const TABLES = [
  { table: 'player_mail_archive', label: 'playerMailArchive' },
  { table: 'player_mail_attachment_archive', label: 'playerMailAttachmentArchive' },
  { table: 'asset_audit_log_archive', label: 'assetAuditLogArchive' },
] as const;

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  const poolerUrl = resolveServerDatabasePoolerUrl();
  const maintenanceService = new RuntimeMaintenanceService();
  const maintenanceActive = maintenanceService.isRuntimeMaintenanceActive();
  const summary: Record<string, unknown> = {
    ok: true,
    maintenanceActive,
    databaseUrlConfigured: databaseUrl.length > 0,
    poolerUrlConfigured: poolerUrl.length > 0,
    recommendations: {
      archiveWindow: maintenanceActive
        ? '当前已处于维护态，可优先执行归档与 vacuum'
        : '建议在 maintenance 窗口或低峰期执行归档与 vacuum',
      vacuumMode: '优先使用 pg_repack / autovacuum 调参窗口，避免长时间锁表',
      archiveSplit: '邮件归档、审计归档、TTL 清理应分批执行，避免单次膨胀过大',
    },
  };

  if (!databaseUrl.length) {
    summary['skipped'] = true;
    summary['reason'] = 'SERVER_DATABASE_URL/DATABASE_URL missing';
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: poolerUrl || databaseUrl });
  try {
    const counts: Record<string, number> = {};
    for (const entry of TABLES) {
      counts[entry.label] = await countRows(pool, entry.table);
    }
    summary['archiveTableCounts'] = counts;
    summary['vacuumWindow'] = {
      suggestedWindow: maintenanceActive ? 'now' : 'maintenance-or-low-traffic',
      hotTableCount: counts.playerMailArchive + counts.playerMailAttachmentArchive + counts.assetAuditLogArchive,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function countRows(pool: Pool, table: string): Promise<number> {
  const result = await pool.query<{ count?: unknown }>(`SELECT COUNT(*)::bigint AS count FROM ${table}`);
  return Math.max(0, Math.trunc(Number(result.rows[0]?.count ?? 0)));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

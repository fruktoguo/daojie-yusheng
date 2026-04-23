import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

type PartitionRow = {
  table: string;
  target: string;
  rationale: string;
};

const PARTITIONS: PartitionRow[] = [
  { table: 'player_inventory_item', target: 'hash(player_id)', rationale: '按玩家隔离热库存写入，避免单玩家背压扩散到全表' },
  { table: 'player_market_storage_item', target: 'hash(player_id)', rationale: '按玩家隔离仓储与交易缓存写入' },
  { table: 'player_wallet', target: 'hash(player_id)', rationale: '按玩家隔离强事务货币写入' },
  { table: 'player_active_job', target: 'hash(player_id)', rationale: '按玩家隔离 job 状态与恢复写入' },
  { table: 'player_mail / player_mail_attachment', target: 'hash(player_id) or hash(mail_id)', rationale: '按玩家或 mail_id 分散收件箱热点' },
  { table: 'player_flush_ledger', target: 'hash(player_id)', rationale: '按玩家隔离 flush ledger 认领与状态更新' },
  { table: 'instance_ground_item', target: 'hash(instance_id)', rationale: '按实例隔离掉落物频繁变更' },
  { table: 'instance_tile_resource_state', target: 'hash(instance_id)', rationale: '按实例隔离地形资源热格子写入' },
  { table: 'instance_overlay_chunk', target: 'hash(instance_id)', rationale: '按实例隔离洞府/门禁/改图 overlay 热写' },
  { table: 'instance_flush_ledger', target: 'hash(instance_id)', rationale: '按实例隔离 flush ledger 认领与状态更新' },
  { table: 'durable_operation_log / outbox_event / asset_audit_log', target: 'created_at month', rationale: '按月切分操作日志、outbox 与审计热表，便于冷热分离和清理' },
];

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  const poolerUrl = resolveServerDatabasePoolerUrl();
  const summary: Record<string, unknown> = {
    ok: true,
    databaseUrlConfigured: databaseUrl.length > 0,
    poolerUrlConfigured: poolerUrl.length > 0,
    partitionTargets: PARTITIONS,
    recommendations: {
      migrationOrder: '先 mail / audit 月分区与归档，再 player / instance hash 分区，再 ledger 分区',
      hotTableFocus: 'player_wallet, player_mail, instance_tile_resource_state, durable_operation_log',
      caution: '当前仅提供策略报告，不自动执行分区重建或数据搬迁',
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
    for (const entry of PARTITIONS) {
      const baseTable = entry.table.split(' / ')[0].trim();
      counts[baseTable] = await countRows(pool, baseTable);
    }
    summary['tableCounts'] = counts;
    summary['notes'] = {
      existingIndexCoverage: '当前表已具备查询/claim 索引，但仍需实际分区迁移才能降低热表膨胀',
      strategyOnly: true,
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

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

interface PartitionPlanEntry {
  table: string;
  partitionKey: string;
  status: 'recommended' | 'existing-archive' | 'deferred';
  reason: string;
}

const PARTITION_PLAN: PartitionPlanEntry[] = [
  { table: 'player_inventory_item', partitionKey: 'hash(player_id)', status: 'recommended', reason: '按玩家隔离背包高频写' },
  { table: 'player_market_storage_item', partitionKey: 'hash(player_id)', status: 'recommended', reason: '按玩家隔离市场仓储高频写' },
  { table: 'player_wallet', partitionKey: 'hash(player_id)', status: 'recommended', reason: '按玩家隔离强事务货币写' },
  { table: 'player_active_job', partitionKey: 'hash(player_id)', status: 'recommended', reason: '按玩家隔离活跃任务状态' },
  { table: 'player_mail / player_mail_attachment', partitionKey: 'hash(player_id) or hash(mail_id)', status: 'recommended', reason: '按玩家隔离邮件热点与附件领取' },
  { table: 'player_flush_ledger', partitionKey: 'hash(player_id)', status: 'recommended', reason: '按玩家隔离 flush ledger 队列' },
  { table: 'instance_ground_item', partitionKey: 'hash(instance_id)', status: 'recommended', reason: '按实例隔离地面掉落物' },
  { table: 'instance_tile_resource_state', partitionKey: 'hash(instance_id)', status: 'recommended', reason: '按实例隔离地块资源热写' },
  { table: 'instance_overlay_chunk', partitionKey: 'hash(instance_id)', status: 'recommended', reason: '按实例隔离 overlay chunk 热写' },
  { table: 'instance_flush_ledger', partitionKey: 'hash(instance_id)', status: 'recommended', reason: '按实例隔离 flush ledger 队列' },
  { table: 'durable_operation_log / outbox_event', partitionKey: 'created_at month', status: 'recommended', reason: '按月切日志与 outbox，便于冷热分离' },
  { table: 'asset_audit_log', partitionKey: 'created_at month', status: 'existing-archive', reason: '已有 archive 热冷分层入口，建议继续走月归档路径' },
];

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  const poolerUrl = resolveServerDatabasePoolerUrl();
  const summary: Record<string, unknown> = {
    ok: true,
    databaseUrlConfigured: databaseUrl.length > 0,
    poolerUrlConfigured: poolerUrl.length > 0,
    partitionPlan: PARTITION_PLAN,
    recommendations: {
      migrationOrder: '先 mail / audit 月归档，再 player hash 分区，再 instance hash 分区，再 durable/outbox 月分区',
      risk: '正式分区迁移需要表重建与数据搬迁，当前仅输出策略与规模基线，不自动执行 DDL',
      hotSpotFocus: 'player_wallet, player_mail, instance_tile_resource_state, durable_operation_log',
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
    for (const entry of PARTITION_PLAN) {
      const baseTable = entry.table.split(' / ')[0].trim();
      counts[baseTable] = await countRows(pool, baseTable);
    }
    summary['tableCounts'] = counts;
    summary['notes'] = {
      currentState: 'phase 4.5.1 remains a strategy/report checkpoint only',
      partitionByHashRequiresMigration: true,
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

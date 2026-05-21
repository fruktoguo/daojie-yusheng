import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

const LEDGER_TABLES = ['player_flush_ledger', 'instance_flush_ledger'] as const;
const PLAYER_DOMAIN_JSONB_COLUMNS = [
  { table: 'player_inventory_item', column: 'raw_payload', meaning: 'item detail fallback; 主字段已列化' },
  { table: 'player_market_storage_item', column: 'raw_payload', meaning: 'market item detail fallback; 主字段已列化' },
  { table: 'player_equipment_slot', column: 'raw_payload', meaning: 'equipment detail fallback; 主字段已列化' },
  { table: 'player_active_job', column: 'detail_jsonb', meaning: 'craft/enhancement job low-frequency detail' },
  { table: 'player_attr_state', column: 'base_attrs_payload', meaning: 'attribute projection detail' },
  { table: 'player_attr_state', column: 'bonus_entries_payload', meaning: 'attribute projection detail' },
  { table: 'player_attr_state', column: 'realm_payload', meaning: 'realm detail' },
  { table: 'player_attr_state', column: 'heaven_gate_payload', meaning: 'breakthrough detail' },
  { table: 'player_attr_state', column: 'spiritual_roots_payload', meaning: 'root detail' },
  { table: 'player_quest_progress', column: 'raw_payload', meaning: 'quest detail fallback' },
  { table: 'player_persistent_buff_state', column: 'raw_payload', meaning: 'buff detail fallback' },
] as const;
const PLAYER_FLUSH_DOMAIN_CLASSIFICATION = [
  { domain: 'presence', ledgerPayload: 'narrow', writeGranularity: 'single-row upsert' },
  { domain: 'world_anchor', ledgerPayload: 'domain-snapshot', writeGranularity: 'single-row replace' },
  { domain: 'position_checkpoint', ledgerPayload: 'domain-snapshot', writeGranularity: 'single-row replace' },
  { domain: 'vitals', ledgerPayload: 'domain-snapshot', writeGranularity: 'single-row replace' },
  { domain: 'progression', ledgerPayload: 'domain-snapshot', writeGranularity: 'progression core replace' },
  { domain: 'body_training', ledgerPayload: 'domain-snapshot', writeGranularity: 'body training replace' },
  { domain: 'profession', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'alchemy_preset', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'active_job', ledgerPayload: 'domain-snapshot', writeGranularity: 'single-row nullable replace' },
  { domain: 'enhancement_record', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'attr', ledgerPayload: 'domain-snapshot', writeGranularity: 'single-row replace' },
  { domain: 'wallet', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'market_storage', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'map_unlock', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'inventory', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set; candidate for item-level diff' },
  { domain: 'equipment', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key slot set' },
  { domain: 'technique', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'buff', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set with explicit empty overwrite' },
  { domain: 'quest', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'combat_pref', ledgerPayload: 'domain-snapshot', writeGranularity: 'single-row nullable replace' },
  { domain: 'auto_battle_skill', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'auto_use_item_rule', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
  { domain: 'logbook', ledgerPayload: 'domain-snapshot', writeGranularity: 'stale-key row set' },
] as const;

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '已提供玩家刷盘 payload 体积审计入口；无 DB 时输出静态域分类，with-db 下统计 ledger payload_jsonb 分布、retention 候选与玩家域 JSONB 列大小。',
      staticDomainClassification: PLAYER_FLUSH_DOMAIN_CLASSIFICATION,
      jsonbColumns: PLAYER_DOMAIN_JSONB_COLUMNS,
      completionMapping: 'player-flush-payload-report',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const ledgerPayloadStats = [];
    const retentionCandidates = [];
    const relationSizes = [];
    for (const table of LEDGER_TABLES) {
      if (!await tableExists(pool, table)) continue;
      ledgerPayloadStats.push(...await loadLedgerPayloadStats(pool, table));
      retentionCandidates.push(...await loadRetentionCandidates(pool, table));
      relationSizes.push(await loadRelationSize(pool, table));
    }
    const jsonbColumnStats = [];
    for (const entry of PLAYER_DOMAIN_JSONB_COLUMNS) {
      if (await columnExists(pool, entry.table, entry.column)) {
        jsonbColumnStats.push({ ...entry, ...await loadJsonbColumnStats(pool, entry.table, entry.column) });
      }
    }
    console.log(JSON.stringify({
      ok: true,
      answers: '玩家 flush ledger 已可按 domain 观察 payload_jsonb 体积分布；玩家分域表可按 JSONB 细节列观察真实膨胀来源，区分 ledger 中转 payload 与分域持久化真源。',
      staticDomainClassification: PLAYER_FLUSH_DOMAIN_CLASSIFICATION,
      ledgerPayloadStats,
      retentionCandidates,
      relationSizes,
      jsonbColumnStats,
      completionMapping: 'player-flush-payload-report',
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [table]);
  return result.rows[0]?.exists === true;
}

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2',
    [table, column],
  );
  return (result.rowCount ?? 0) > 0;
}

async function loadLedgerPayloadStats(pool: Pool, table: string): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(`
    SELECT $1::text AS table_name, domain, COUNT(*)::bigint AS row_count,
      COUNT(*) FILTER (WHERE payload_jsonb IS NOT NULL)::bigint AS payload_rows,
      COALESCE(MAX(pg_column_size(payload_jsonb)), 0)::bigint AS max_payload_bytes,
      COALESCE(ROUND(AVG(pg_column_size(payload_jsonb)))::bigint, 0)::bigint AS avg_payload_bytes,
      COALESCE(percentile_disc(0.95) WITHIN GROUP (ORDER BY pg_column_size(payload_jsonb)), 0)::bigint AS p95_payload_bytes
    FROM ${quoteIdentifier(table)}
    GROUP BY domain
    ORDER BY p95_payload_bytes DESC, max_payload_bytes DESC, domain ASC
  `, [table]);
  return result.rows as Array<Record<string, unknown>>;
}

async function loadRetentionCandidates(pool: Pool, table: string): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(`
    SELECT $1::text AS table_name,
      COUNT(*) FILTER (WHERE latest_version <= flushed_version AND payload_jsonb IS NOT NULL)::bigint AS completed_payload_rows,
      COUNT(*) FILTER (WHERE latest_version <= flushed_version)::bigint AS completed_rows,
      COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_rows
    FROM ${quoteIdentifier(table)}
  `, [table]);
  return result.rows as Array<Record<string, unknown>>;
}

async function loadRelationSize(pool: Pool, table: string): Promise<Record<string, unknown>> {
  const result = await pool.query('SELECT $1::text AS table_name, pg_total_relation_size($1::regclass)::bigint AS total_bytes', [table]);
  return result.rows[0] as Record<string, unknown>;
}

async function loadJsonbColumnStats(pool: Pool, table: string, column: string): Promise<Record<string, unknown>> {
  const result = await pool.query(`
    SELECT COUNT(*)::bigint AS row_count,
      COUNT(*) FILTER (WHERE ${quoteIdentifier(column)} IS NOT NULL)::bigint AS non_null_rows,
      COALESCE(MAX(pg_column_size(${quoteIdentifier(column)})), 0)::bigint AS max_bytes,
      COALESCE(ROUND(AVG(pg_column_size(${quoteIdentifier(column)})))::bigint, 0)::bigint AS avg_bytes,
      COALESCE(percentile_disc(0.95) WITHIN GROUP (ORDER BY pg_column_size(${quoteIdentifier(column)})), 0)::bigint AS p95_bytes
    FROM ${quoteIdentifier(table)}
  `);
  return result.rows[0] as Record<string, unknown>;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

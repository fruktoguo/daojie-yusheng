import { installSmokeTimeout } from './smoke-timeout.js';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';

import { AppModule } from '../app.module';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { resolveServerDatabaseUrl } from '../config/env-alias';

const CORE_COLUMNAR_TABLES = [
  {
    table: 'player_presence',
    requiredColumns: ['player_id', 'runtime_owner_id', 'session_epoch', 'online', 'in_world'],
    allowedJsonColumns: [],
  },
  {
    table: 'player_wallet',
    requiredColumns: ['player_id', 'wallet_type', 'balance', 'frozen_balance', 'version'],
    allowedJsonColumns: [],
  },
  {
    table: 'player_world_anchor',
    requiredColumns: ['player_id', 'respawn_template_id', 'respawn_x', 'respawn_y', 'last_safe_template_id'],
    allowedJsonColumns: [],
  },
  {
    table: 'player_position_checkpoint',
    requiredColumns: ['player_id', 'instance_id', 'x', 'y', 'facing', 'checkpoint_kind'],
    allowedJsonColumns: [],
  },
  {
    table: 'player_vitals',
    requiredColumns: ['player_id', 'hp', 'max_hp', 'qi', 'max_qi'],
    allowedJsonColumns: [],
  },
  {
    table: 'player_progression_core',
    requiredColumns: ['player_id', 'foundation', 'combat_exp', 'bone_age_base_years', 'life_elapsed_ticks'],
    allowedJsonColumns: [],
  },
  {
    table: 'player_inventory_item',
    requiredColumns: ['player_id', 'item_id', 'count', 'raw_payload'],
    allowedJsonColumns: ['raw_payload'],
  },
  {
    table: 'player_market_storage_item',
    requiredColumns: ['player_id', 'item_id', 'count', 'raw_payload'],
    allowedJsonColumns: ['raw_payload'],
  },
  {
    table: 'player_equipment_slot',
    requiredColumns: ['player_id', 'slot_type', 'item_instance_id', 'item_id', 'raw_payload'],
    allowedJsonColumns: ['raw_payload'],
  },
  {
    table: 'player_active_job',
    requiredColumns: ['player_id', 'job_run_id', 'job_type', 'status', 'detail_jsonb'],
    allowedJsonColumns: ['detail_jsonb'],
  },
] as const;

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '用于验证玩家域核心热表已经采用列式主字段 + 局部 JSONB 的落盘口径。',
          excludes: '不证明数据库不可用、也不证明全量迁移。',
          completionMapping: 'replace-ready:proof:player-columnar-schema-report',
        },
        null,
        2,
      ),
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pool = app.get(DatabasePoolProvider).getPool('player-columnar-schema');
  assert(pool, 'database pool should be available for player schema report');

  try {
    const results = [];
    for (const table of CORE_COLUMNAR_TABLES) {
      const columns = await loadColumns(pool, table.table);
      const jsonColumns = columns.filter((column) => column.data_type === 'jsonb');
      const missingColumns = table.requiredColumns.filter((column) => !columns.some((entry) => entry.column_name === column));
      const unexpectedJsonColumns = jsonColumns
        .map((column) => column.column_name)
        .filter((column) => !table.allowedJsonColumns.includes(column as never));
      results.push({
        table: table.table,
        exists: columns.length > 0,
        missingColumns,
        jsonColumns: jsonColumns.map((column) => column.column_name),
        unexpectedJsonColumns,
        directColumnShape: missingColumns.length === 0 && unexpectedJsonColumns.length === 0,
      });
    }
    const healthy = results.every((entry) => entry.exists && entry.directColumnShape);
    assert(healthy, 'core player schema should remain columnar with only explicit JSONB detail fields');

    console.log(
      JSON.stringify(
        {
          ok: true,
          schemaHealthy: healthy,
          results,
          answers: '玩家域核心热表已采用列式主字段 + 局部 JSONB 细节字段，JSONB 只出现在少数兼容/低频细节列上',
          excludes: '不证明所有衍生表都没有 JSONB，仅证明计划中的核心热表口径已落地',
          completionMapping: 'replace-ready:proof:stage1.player-columnar-schema',
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function loadColumns(pool: Pool, tableName: string): Promise<Array<{ column_name: string; data_type: string }>> {
  const result = await pool.query(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName],
  );
  return Array.isArray(result.rows)
    ? result.rows.map((row) => ({
        column_name: typeof row.column_name === 'string' ? row.column_name : '',
        data_type: typeof row.data_type === 'string' ? row.data_type : '',
      })).filter((row) => row.column_name.length > 0)
    : [];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

/**
 * 迁移脚本：删除已废弃的 server_gm_map_config 表。
 * tickSpeed/paused/scale/offsetTicks 已迁移到实例级 checkpoint。
 *
 * 用法：pnpm --filter @mud/server migrate:drop-gm-map-config
 */
import { Pool } from 'pg';

const TABLE_NAME = 'server_gm_map_config';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
    ?? process.env.SERVER_DATABASE_URL
    ?? 'postgresql://localhost:5432/daojie_yusheng';

  const pool = new Pool({ connectionString, max: 2 });
  try {
    const checkResult = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS "exists"`,
      [TABLE_NAME],
    );
    const exists = checkResult.rows[0]?.exists === true;
    if (!exists) {
      console.log(`表 ${TABLE_NAME} 不存在，无需迁移。`);
      return;
    }
    // 备份数据到日志
    const dataResult = await pool.query(`SELECT * FROM ${TABLE_NAME}`);
    if (dataResult.rows.length > 0) {
      console.log(`备份 ${TABLE_NAME} 数据（${dataResult.rows.length} 条）：`);
      console.log(JSON.stringify(dataResult.rows, null, 2));
    }
    await pool.query(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
    console.log(`已删除表 ${TABLE_NAME}。tickSpeed 已迁移到实例 checkpoint。`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('迁移失败：', error);
  process.exitCode = 1;
});

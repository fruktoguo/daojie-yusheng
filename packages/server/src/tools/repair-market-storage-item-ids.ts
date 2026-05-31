import { Pool } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';
import { repairMarketStorageItemIds } from '../persistence/market-storage-item-id-repair';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('SERVER_DATABASE_URL 未配置，无法修复坊市托管仓 storage_item_id');
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const result = await repairMarketStorageItemIds(pool);
    console.log(JSON.stringify({
      ok: true,
      answers: '已执行 GM 一次性坊市托管仓 storage_item_id 迁移修复，修复后 mismatchedRows 和 invalidSlotRows 必须为 0。',
      result,
      completionMapping: 'gm:shortcut:repair-market-storage-item-ids',
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

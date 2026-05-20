/**
 * 启动期数据库配置加载器。
 * 在 NestFactory.create 之前执行，将 server_gm_config 表中的值写入 process.env。
 * 容错设计：DB 不可用时静默跳过，回退到 env 原有值或注册表默认值。
 */
import { Pool } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from './env-alias';
import { GAME_CONFIG_DESCRIPTOR_MAP } from './game-config-registry';

const CONNECT_TIMEOUT_MS = 3000;
const QUERY_TIMEOUT_MS = 5000;
const GM_CONFIG_TABLE = 'server_gm_config';

/**
 * 从数据库加载游戏配置并注入 process.env。
 * 仅覆盖注册表中存在的 key；DB 不可用时静默跳过。
 * @returns 成功加载的配置项数量，-1 表示跳过。
 */
export async function bootstrapLoadDbConfig(): Promise<number> {
  const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    return -1;
  }

  let pool: Pool | null = null;
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 1000,
    });

    const result = await Promise.race([
      pool.query(`SELECT key, value FROM ${GM_CONFIG_TABLE}`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('bootstrap config query timeout')), QUERY_TIMEOUT_MS),
      ),
    ]);

    let count = 0;
    if (Array.isArray(result.rows)) {
      for (const row of result.rows as Array<{ key: string; value: string }>) {
        if (GAME_CONFIG_DESCRIPTOR_MAP.has(row.key)) {
          process.env[row.key] = row.value;
          count += 1;
        }
      }
    }
    return count;
  } catch {
    // DB 不可用（无连接、表不存在等）：静默跳过
    return -1;
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}

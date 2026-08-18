/**
 * 本文件负责服务端运行配置的解析或角色判断，是启动期配置边界的一部分。
 *
 * 维护时要让默认值对生产环境友好，并避免把临时本地配置误当作线上真源。
 */
/**
 * 启动期数据库配置加载器。
 * 在 NestFactory.create 之前执行，将 server_gm_config 表中的值写入 process.env。
 * 容错设计：DB 不可用时静默跳过，回退到 env 原有值或注册表默认值。
 */
import { Pool, type PoolConfig } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from './env-alias';
import {
  GAME_CONFIG_DESCRIPTOR_MAP,
  validateGameConfigValue,
} from './game-config-registry';

const CONNECT_TIMEOUT_MS = 3000;
const QUERY_TIMEOUT_MS = 5000;
const GM_CONFIG_TABLE = 'server_gm_config';

export function buildBootstrapDbConfigPoolOptions(databaseUrl: string): PoolConfig {
  return {
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 1000,
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  };
}

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
    pool = new Pool(buildBootstrapDbConfigPoolOptions(databaseUrl));

    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        pool.query(`SELECT key, value FROM ${GM_CONFIG_TABLE}`),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('bootstrap config query timeout')), QUERY_TIMEOUT_MS);
          timeoutHandle.unref();
        }),
      ]);

      let count = 0;
      if (Array.isArray(result.rows)) {
        for (const row of result.rows) {
          const resolved = resolveBootstrapGameConfigRow(row);
          if (!resolved) continue;
          if (resolved.validationError) {
            console.warn(`[启动配置] 已忽略数据库中的无效配置 ${resolved.key}：${resolved.validationError}`);
            continue;
          }
          process.env[resolved.key] = resolved.value;
          count += 1;
        }
      }
      return count;
    } finally {
      clearTimeout(timeoutHandle);
    }

  } catch {
    // DB 不可用（无连接、表不存在等）：静默跳过
    return -1;
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}

export interface BootstrapGameConfigRowResolution {
  key: string;
  value: string;
  validationError: string | null;
}

/** 只接受注册表内且通过当前 schema 校验的数据库配置行。 */
export function resolveBootstrapGameConfigRow(row: unknown): BootstrapGameConfigRowResolution | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as { key?: unknown; value?: unknown };
  const key = typeof record.key === 'string' ? record.key.trim() : '';
  const descriptor = key ? GAME_CONFIG_DESCRIPTOR_MAP.get(key) : null;
  if (!descriptor || typeof record.value !== 'string') return null;
  return {
    key,
    value: record.value,
    validationError: validateGameConfigValue(descriptor, record.value),
  };
}

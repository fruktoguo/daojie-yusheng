import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { readTrimmedEnv, resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

@Injectable()
export class DatabasePoolProvider implements OnModuleDestroy {
  private readonly logger = new Logger(DatabasePoolProvider.name);
  private readonly pools = new Map<string, Pool>();

  getPool(name = 'default'): Pool | null {
    const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      return null;
    }
    const existing = this.pools.get(name);
    if (existing) {
      return existing;
    }
    const pool = new Pool({
      connectionString: databaseUrl,
      max: resolveDatabasePoolMax(),
      idleTimeoutMillis: resolveDatabasePoolIdleTimeoutMillis(),
      connectionTimeoutMillis: resolveDatabasePoolConnectionTimeoutMillis(),
    });
    this.pools.set(name, pool);
    return pool;
  }

  async onModuleDestroy(): Promise<void> {
    const pools = Array.from(this.pools.values());
    this.pools.clear();
    await Promise.all(
      pools.map(async (pool) => {
        await pool.end().catch((error: unknown) => {
          this.logger.warn(`关闭数据库连接池失败：${error instanceof Error ? error.message : String(error)}`);
        });
      }),
    );
  }
}

function resolveDatabasePoolMax(): number {
  return normalizePositiveIntegerEnv('SERVER_DATABASE_POOL_MAX', 'DATABASE_POOL_MAX', 24, 1, 50);
}

function resolveDatabasePoolIdleTimeoutMillis(): number {
  return normalizePositiveIntegerEnv('SERVER_DATABASE_POOL_IDLE_TIMEOUT_MS', 'DATABASE_POOL_IDLE_TIMEOUT_MS', 30_000, 1_000, 300_000);
}

function resolveDatabasePoolConnectionTimeoutMillis(): number {
  return normalizePositiveIntegerEnv('SERVER_DATABASE_POOL_CONNECTION_TIMEOUT_MS', 'DATABASE_POOL_CONNECTION_TIMEOUT_MS', 5_000, 250, 60_000);
}

function normalizePositiveIntegerEnv(primary: string, fallback: string, defaultValue: number, min: number, max: number): number {
  const rawValue = readTrimmedEnv(primary, fallback);
  if (!rawValue) {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

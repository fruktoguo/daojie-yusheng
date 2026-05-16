/**
 * 数据库连接池提供者。
 * 全进程共享同一个 PostgreSQL 连接池实例，按"作用域名"打标用于诊断/日志。
 *
 * 历史教训：曾经按 name 分别懒创建 pool，每个 max=24，几十个 scope 累加后远超
 * PostgreSQL 默认 max_connections=100，启动期就触发 "sorry, too many clients already"。
 * 现在统一收敛到单池预算（max=24，可通过 SERVER_DATABASE_POOL_MAX 调整），保证 scope 数量
 * 增加不会撑爆 PG。需要独立连接池配置（如 statement_timeout）的服务必须自行 new Pool 旁路，
 * 不要再扩 DatabasePoolProvider 的 scope 维度。
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { readTrimmedEnv, resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

/** 数据库连接池提供者：进程内共享单一 pg Pool 实例，name 仅做标签。 */
@Injectable()
export class DatabasePoolProvider implements OnModuleDestroy {
  private readonly logger = new Logger(DatabasePoolProvider.name);
  /** 单一共享池：所有 scope 共用一份连接预算。 */
  private sharedPool: Pool | null = null;
  /** 已注册的 scope 名集合，用于日志可观测和 dispose 时打印。 */
  private readonly registeredScopes = new Set<string>();

  /**
   * 获取共享连接池。
   * @param name 仅做诊断标签，不会创建独立池；首次出现时打日志。
   * @returns 共享 Pool；无数据库 URL 时返回 null。
   */
  getPool(name = 'default'): Pool | null {
    const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      return null;
    }
    if (!this.registeredScopes.has(name)) {
      this.registeredScopes.add(name);
      this.logger.debug(`DatabasePoolProvider scope 已挂载到共享池：${name}`);
    }
    if (this.sharedPool) {
      return this.sharedPool;
    }
    this.sharedPool = new Pool({
      connectionString: databaseUrl,
      max: resolveDatabasePoolMax(),
      idleTimeoutMillis: resolveDatabasePoolIdleTimeoutMillis(),
      connectionTimeoutMillis: resolveDatabasePoolConnectionTimeoutMillis(),
    });
    this.logger.log(`DatabasePoolProvider 共享池已创建：max=${resolveDatabasePoolMax()} idleTimeoutMs=${resolveDatabasePoolIdleTimeoutMillis()} connectTimeoutMs=${resolveDatabasePoolConnectionTimeoutMillis()}`);
    return this.sharedPool;
  }

  /** 模块销毁时关闭共享池。 */
  async onModuleDestroy(): Promise<void> {
    const pool = this.sharedPool;
    this.sharedPool = null;
    this.registeredScopes.clear();
    if (!pool) {
      return;
    }
    await pool.end().catch((error: unknown) => {
      this.logger.warn(`关闭数据库连接池失败：${error instanceof Error ? error.message : String(error)}`);
    });
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

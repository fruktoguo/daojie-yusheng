/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { readTrimmedEnv, resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';
import { isTransientPostgresError } from './pg-error-utils';

export type DatabasePoolGroup = 'runtimeCritical' | 'flush' | 'outbox' | 'gmDiagnostics';

export interface DatabasePoolStatsSnapshot {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface DatabasePoolStatsByGroup {
  runtimeCritical: DatabasePoolStatsSnapshot | null;
  flush: DatabasePoolStatsSnapshot | null;
  outbox: DatabasePoolStatsSnapshot | null;
  gmDiagnostics: DatabasePoolStatsSnapshot | null;
}

const DEFAULT_POOL_MAX: Record<DatabasePoolGroup, number> = {
  runtimeCritical: 16,
  flush: 16,
  outbox: 4,
  gmDiagnostics: 2,
};

const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_POOL_STATEMENT_TIMEOUT_MS: Record<DatabasePoolGroup, number> = {
  runtimeCritical: 10_000,
  flush: 10_000,
  outbox: 10_000,
  gmDiagnostics: 30_000,
};
const DEFAULT_POOL_QUERY_TIMEOUT_MS: Record<DatabasePoolGroup, number> = {
  runtimeCritical: 12_000,
  flush: 12_000,
  outbox: 12_000,
  gmDiagnostics: 35_000,
};
const DEFAULT_POOL_LOCK_TIMEOUT_MS: Record<DatabasePoolGroup, number> = {
  runtimeCritical: 5_000,
  flush: 5_000,
  outbox: 5_000,
  gmDiagnostics: 10_000,
};

@Injectable()
export class DatabasePoolProvider implements OnModuleDestroy {
  private readonly logger = new Logger(DatabasePoolProvider.name);
  private readonly pools = new Map<DatabasePoolGroup, Pool>();
  private readonly registeredScopes = new Set<string>();

  getPool(name = 'default'): Pool | null {
    const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      return null;
    }
    const group = resolveDatabasePoolGroup(name);
    const scopeKey = `${group}:${name}`;
    if (!this.registeredScopes.has(scopeKey)) {
      this.registeredScopes.add(scopeKey);
      this.logger.debug(`数据库连接池作用域已挂载到 ${group} 池：${name}`);
    }
    const cached = this.pools.get(group);
    if (cached) {
      return cached;
    }
    const pool = new Pool({
      connectionString: databaseUrl,
      max: resolveDatabasePoolMax(group),
      idleTimeoutMillis: resolveDatabasePoolIdleTimeoutMillis(group),
      connectionTimeoutMillis: resolveDatabasePoolConnectionTimeoutMillis(group),
      statement_timeout: resolveDatabasePoolStatementTimeoutMillis(group),
      query_timeout: resolveDatabasePoolQueryTimeoutMillis(group),
      lock_timeout: resolveDatabasePoolLockTimeoutMillis(group),
    });
    // pg 会通过 Pool 的 error 事件上报空闲连接断开；没有监听器时 EventEmitter 会直接终止进程。
    pool.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (isTransientPostgresError(error)) {
        this.logger.warn(`数据库连接池 ${group} 捕获瞬态空闲连接错误，已淘汰失效连接并等待自动重连：${message}`);
        return;
      }
      this.logger.error(
        `数据库连接池 ${group} 捕获非瞬态空闲连接错误：${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
    this.pools.set(group, pool);
    this.logger.log(
      `数据库连接池 ${group} 已创建：最大连接=${resolveDatabasePoolMax(group)} 空闲超时=${resolveDatabasePoolIdleTimeoutMillis(group)}ms 连接超时=${resolveDatabasePoolConnectionTimeoutMillis(group)}ms SQL超时=${resolveDatabasePoolStatementTimeoutMillis(group)}ms 锁超时=${resolveDatabasePoolLockTimeoutMillis(group)}ms`,
    );
    return pool;
  }

  getPoolStats(name = 'default'): DatabasePoolStatsSnapshot | null {
    return snapshotPool(this.pools.get(resolveDatabasePoolGroup(name)) ?? null);
  }

  getAllPoolStats(): DatabasePoolStatsByGroup {
    return {
      runtimeCritical: snapshotPool(this.pools.get('runtimeCritical') ?? null),
      flush: snapshotPool(this.pools.get('flush') ?? null),
      outbox: snapshotPool(this.pools.get('outbox') ?? null),
      gmDiagnostics: snapshotPool(this.pools.get('gmDiagnostics') ?? null),
    };
  }

  async getLockWaitSummary(limit = 5): Promise<{
    waitingCount: number;
    samples: Array<{ pid: number; waitEventType: string | null; waitEvent: string | null; state: string | null; ageMs: number; query: string }>;
    checkedAt: number;
  } | null> {
    const pool = this.getPool('gm-diagnostics');
    if (!pool) {
      return null;
    }
    const normalizedLimit = Math.max(1, Math.min(20, Math.trunc(Number(limit) || 5)));
    const result = await pool.query(
      `SELECT pid,
              wait_event_type,
              wait_event,
              state,
              EXTRACT(EPOCH FROM (now() - COALESCE(query_start, state_change, now()))) * 1000 AS age_ms,
              LEFT(regexp_replace(COALESCE(query, ''), '\\s+', ' ', 'g'), 240) AS query,
              COUNT(*) OVER() AS total_count
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
        ORDER BY COALESCE(query_start, state_change, now()) ASC
        LIMIT $1`,
      [normalizedLimit],
    );
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return {
      waitingCount: rows.length > 0 ? Math.max(0, Math.trunc(Number(rows[0]?.total_count) || rows.length)) : 0,
      samples: rows.map((row) => ({
        pid: Math.trunc(Number((row as any).pid) || 0),
        waitEventType: typeof (row as any).wait_event_type === 'string' ? (row as any).wait_event_type : null,
        waitEvent: typeof (row as any).wait_event === 'string' ? (row as any).wait_event : null,
        state: typeof (row as any).state === 'string' ? (row as any).state : null,
        ageMs: Math.max(0, Math.round(Number((row as any).age_ms) || 0)),
        query: typeof (row as any).query === 'string' ? (row as any).query : '',
      })),
      checkedAt: Date.now(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    const pools = Array.from(this.pools.values());
    this.pools.clear();
    this.registeredScopes.clear();
    await Promise.all(
      pools.map(async (pool) => pool.end().catch((error: unknown) => {
        this.logger.warn(`关闭数据库连接池失败：${error instanceof Error ? error.message : String(error)}`);
      })),
    );
  }
}

export function resolveDatabasePoolGroup(name: string): DatabasePoolGroup {
  const normalized = (name || 'default').trim().toLowerCase();
  if (!normalized) {
    return 'runtimeCritical';
  }
  if (normalized.includes('combat-audit')) {
    return 'flush';
  }
  if (normalized.includes('outbox')) {
    return 'outbox';
  }
  if (normalized.includes('player-domain')
    || normalized.includes('instance-domain')
    || normalized.includes('player-snapshot')
    || normalized.includes('flush-ledger')
    || normalized.includes('player-flush-ledger')
    || normalized.includes('player-counters')
    || normalized.includes('player_counters')
    || normalized.includes('time-chamber')
    || normalized.includes('party-runtime')
    || normalized.includes('scheduler-state')
    || normalized.includes('instance-catalog')
    || normalized.includes('mail')
    || normalized.includes('market')
    || normalized.includes('social')
    || normalized.includes('chat')
    || normalized.includes('treasure-vault')
    || normalized.includes('activity')
    || normalized.includes('redeem-code')
    || normalized.includes('gm-config')
    || normalized.includes('gm-runtime-flag')
    || normalized.includes('ai-provider-config')
    || normalized.includes('technique-generation')
    || normalized.includes('gm-audit-log')
    || normalized.includes('node-registry')
    || normalized.includes('durable-operation')
    || normalized.includes('tongtian')
    || normalized.includes('player-identity')) {
    return 'flush';
  }
  if (normalized.startsWith('gm-') || normalized.includes('gm-') || normalized.includes('gm_')) {
    return 'gmDiagnostics';
  }
  return 'runtimeCritical';
}

function resolveDatabasePoolMax(group: DatabasePoolGroup): number {
  return normalizePositiveIntegerEnv(
    `SERVER_DATABASE_POOL_${groupToEnvSuffix(group)}_MAX`,
    `DATABASE_POOL_${groupToEnvSuffix(group)}_MAX`,
    DEFAULT_POOL_MAX[group],
    1,
    50,
  );
}

function resolveDatabasePoolIdleTimeoutMillis(group: DatabasePoolGroup): number {
  return normalizePositiveIntegerEnv(
    `SERVER_DATABASE_POOL_${groupToEnvSuffix(group)}_IDLE_TIMEOUT_MS`,
    `DATABASE_POOL_${groupToEnvSuffix(group)}_IDLE_TIMEOUT_MS`,
    DEFAULT_POOL_IDLE_TIMEOUT_MS,
    1_000,
    300_000,
  );
}

function resolveDatabasePoolConnectionTimeoutMillis(group: DatabasePoolGroup): number {
  return normalizePositiveIntegerEnv(
    `SERVER_DATABASE_POOL_${groupToEnvSuffix(group)}_CONNECTION_TIMEOUT_MS`,
    `DATABASE_POOL_${groupToEnvSuffix(group)}_CONNECTION_TIMEOUT_MS`,
    DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
    250,
    60_000,
  );
}

function resolveDatabasePoolStatementTimeoutMillis(group: DatabasePoolGroup): number {
  return normalizePositiveIntegerEnv(
    `SERVER_DATABASE_POOL_${groupToEnvSuffix(group)}_STATEMENT_TIMEOUT_MS`,
    `DATABASE_POOL_${groupToEnvSuffix(group)}_STATEMENT_TIMEOUT_MS`,
    DEFAULT_POOL_STATEMENT_TIMEOUT_MS[group],
    250,
    120_000,
  );
}

function resolveDatabasePoolQueryTimeoutMillis(group: DatabasePoolGroup): number {
  return normalizePositiveIntegerEnv(
    `SERVER_DATABASE_POOL_${groupToEnvSuffix(group)}_QUERY_TIMEOUT_MS`,
    `DATABASE_POOL_${groupToEnvSuffix(group)}_QUERY_TIMEOUT_MS`,
    DEFAULT_POOL_QUERY_TIMEOUT_MS[group],
    250,
    120_000,
  );
}

function resolveDatabasePoolLockTimeoutMillis(group: DatabasePoolGroup): number {
  return normalizePositiveIntegerEnv(
    `SERVER_DATABASE_POOL_${groupToEnvSuffix(group)}_LOCK_TIMEOUT_MS`,
    `DATABASE_POOL_${groupToEnvSuffix(group)}_LOCK_TIMEOUT_MS`,
    DEFAULT_POOL_LOCK_TIMEOUT_MS[group],
    100,
    60_000,
  );
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

function snapshotPool(pool: Pool | null): DatabasePoolStatsSnapshot | null {
  if (!pool) {
    return null;
  }
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

function groupToEnvSuffix(group: DatabasePoolGroup): string {
  switch (group) {
    case 'runtimeCritical': return 'RUNTIME_CRITICAL';
    case 'flush': return 'FLUSH';
    case 'outbox': return 'OUTBOX';
    case 'gmDiagnostics': return 'GM_DIAGNOSTICS';
    default: return 'RUNTIME_CRITICAL';
  }
}

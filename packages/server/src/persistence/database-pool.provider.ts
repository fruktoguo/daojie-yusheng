/**
 * 数据库连接池提供者。
 * 将不同用途的数据库访问拆到独立 pool，避免 flush / outbox / GM 查询互相挤占。
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { readTrimmedEnv, resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

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
  runtimeCritical: 12,
  flush: 8,
  outbox: 2,
  gmDiagnostics: 2,
};

const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 5_000;

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
    });
    this.pools.set(group, pool);
    this.logger.log(
      `DatabasePoolProvider ${group} 池已创建：max=${resolveDatabasePoolMax(group)} idleTimeoutMs=${resolveDatabasePoolIdleTimeoutMillis(group)} connectTimeoutMs=${resolveDatabasePoolConnectionTimeoutMillis(group)}`,
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
  if (normalized.includes('outbox')) {
    return 'outbox';
  }
  if (normalized.startsWith('gm-') || normalized.includes('gm-') || normalized.includes('gm_')) {
    return 'gmDiagnostics';
  }
  if (normalized.includes('player-domain')
    || normalized.includes('instance-domain')
    || normalized.includes('player-snapshot')
    || normalized.includes('flush-ledger')
    || normalized.includes('player-flush-ledger')
    || normalized.includes('player-counters')
    || normalized.includes('instance-catalog')
    || normalized.includes('mail')
    || normalized.includes('market')
    || normalized.includes('redeem-code')
    || normalized.includes('suggestion')
    || normalized.includes('combat-audit')
    || normalized.includes('gm-runtime-flag')
    || normalized.includes('ai-provider-config')
    || normalized.includes('gm-audit-log')
    || normalized.includes('node-registry')
    || normalized.includes('durable-operation')
    || normalized.includes('tongtian')
    || normalized.includes('player-identity')) {
    return 'flush';
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

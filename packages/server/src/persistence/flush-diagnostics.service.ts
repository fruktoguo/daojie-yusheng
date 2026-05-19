/**
 * 刷盘诊断采集器。
 * 收集玩家/地图 flush 每轮的计时分解，供 GM 性能页展示。
 * 只保留最近一轮的快照 + 滚动统计（p50/p95/max），不做持久化。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DatabasePoolProvider, type DatabasePoolStatsByGroup, type DatabasePoolStatsSnapshot } from './database-pool.provider';

/** 玩家 flush 单轮诊断。 */
export interface PlayerFlushDiagnostics {
  /** 脏玩家数。 */
  dirtyPlayerCount: number;
  /** domain 计数摘要，如 { inventory: 3, equipment: 2 }。 */
  domainCounts: Record<string, number>;
  /** 构造 snapshot 耗时 ms。 */
  buildSnapshotMs: number;
  /** worker submit 耗时 ms（未启用时为 0）。 */
  workerSubmitMs: number;
  /** DB 写入耗时 ms。 */
  dbWriteMs: number;
  /** markPersisted 耗时 ms。 */
  markPersistedMs: number;
  /** 整轮耗时 ms。 */
  totalMs: number;
  /** 时间戳。 */
  timestamp: number;
}

/** 地图 flush 单轮诊断。 */
export interface MapFlushDiagnostics {
  /** 脏实例数。 */
  dirtyInstanceCount: number;
  /** 实际持久化实例数。 */
  persistedInstanceCount: number;
  /** domain 计数摘要。 */
  domainCounts: Record<string, number>;
  /** 被合并窗口延迟的 domain 数量。 */
  coalescedDomainCount?: number;
  /** delta 构造耗时 ms。 */
  deltaConstructMs: number;
  /** 各 domain DB 写入耗时 ms。 */
  dbWriteMs: number;
  /** watermark 写入耗时 ms。 */
  watermarkMs: number;
  /** 整轮耗时 ms。 */
  totalMs: number;
  /** 时间戳。 */
  timestamp: number;
}
/** PG pool 状态快照。 */
export interface PgPoolStats {
  /** 池中总连接数。 */
  totalCount: number;
  /** 空闲连接数。 */
  idleCount: number;
  /** 等待获取连接的请求数。 */
  waitingCount: number;
}

/** PG lock wait 摘要。 */
export interface PgLockWaitSummary {
  waitingCount: number;
  samples: Array<{
    pid: number;
    waitEventType: string | null;
    waitEvent: string | null;
    state: string | null;
    ageMs: number;
    query: string;
  }>;
  checkedAt: number;
  error?: string;
}

/** 刷盘诊断聚合快照，供 GM 页消费。 */
export interface FlushDiagnosticsSnapshot {
  player: PlayerFlushDiagnostics | null;
  map: MapFlushDiagnostics | null;
  pgPool: PgPoolStats | null;
  pgPools: DatabasePoolStatsByGroup | null;
  pgLockWait: PgLockWaitSummary | null;
}

const HISTORY_SIZE = 60;
const LOCK_WAIT_REFRESH_INTERVAL_MS = 1_000;

@Injectable()
export class FlushDiagnosticsService {
  private playerHistory: PlayerFlushDiagnostics[] = [];
  private mapHistory: MapFlushDiagnostics[] = [];
  private latestPlayer: PlayerFlushDiagnostics | null = null;
  private latestMap: MapFlushDiagnostics | null = null;
  private latestPgLockWait: PgLockWaitSummary | null = null;
  private lockWaitRefreshInFlight = false;
  private lastLockWaitRefreshAt = 0;

  constructor(
    @Optional() @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider?: DatabasePoolProvider,
  ) {}

  /** 玩家 flush 完成后上报。 */
  reportPlayerFlush(diag: PlayerFlushDiagnostics): void {
    this.latestPlayer = diag;
    this.playerHistory.push(diag);
    if (this.playerHistory.length > HISTORY_SIZE) {
      this.playerHistory.shift();
    }
    this.refreshPgLockWaitSummary();
  }

  /** 地图 flush 完成后上报。 */
  reportMapFlush(diag: MapFlushDiagnostics): void {
    this.latestMap = diag;
    this.mapHistory.push(diag);
    if (this.mapHistory.length > HISTORY_SIZE) {
      this.mapHistory.shift();
    }
    this.refreshPgLockWaitSummary();
  }

  /** 获取当前诊断快照。 */
  getSnapshot(): FlushDiagnosticsSnapshot {
    this.refreshPgLockWaitSummary();
    return {
      player: this.latestPlayer,
      map: this.latestMap,
      pgPool: this.databasePoolProvider?.getPoolStats('runtimeCritical') ?? null,
      pgPools: this.databasePoolProvider?.getAllPoolStats() ?? null,
      pgLockWait: this.latestPgLockWait,
    };
  }

  /** 获取玩家 flush 滚动统计。 */
  getPlayerStats(): { p50Ms: number; p95Ms: number; maxMs: number; count: number } {
    return computePercentiles(this.playerHistory.map((d) => d.totalMs));
  }

  /** 获取地图 flush 滚动统计。 */
  getMapStats(): { p50Ms: number; p95Ms: number; maxMs: number; count: number } {
    return computePercentiles(this.mapHistory.map((d) => d.totalMs));
  }

  private refreshPgLockWaitSummary(): void {
    if (!this.databasePoolProvider || this.lockWaitRefreshInFlight) {
      return;
    }
    const now = Date.now();
    if (now - this.lastLockWaitRefreshAt < LOCK_WAIT_REFRESH_INTERVAL_MS) {
      return;
    }
    this.lockWaitRefreshInFlight = true;
    this.lastLockWaitRefreshAt = now;
    void this.databasePoolProvider.getLockWaitSummary(5)
      .then((summary) => {
        if (summary) {
          this.latestPgLockWait = summary;
        }
      })
      .catch((error: unknown) => {
        this.latestPgLockWait = {
          waitingCount: 0,
          samples: [],
          checkedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        };
      })
      .finally(() => {
        this.lockWaitRefreshInFlight = false;
      });
  }
}

function computePercentiles(values: number[]): { p50Ms: number; p95Ms: number; maxMs: number; count: number } {
  if (values.length === 0) {
    return { p50Ms: 0, p95Ms: 0, maxMs: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return { p50Ms: Math.round(p50), p95Ms: Math.round(p95), maxMs: Math.round(max), count: sorted.length };
}

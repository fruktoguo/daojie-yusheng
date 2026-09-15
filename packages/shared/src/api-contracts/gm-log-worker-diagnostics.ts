/**
 * GM 日志、Worker 监控与诊断领域契约。
 *
 * 包含服务端控制台日志级别/条目/读取响应、worker 运行时状态/拓扑/告警、
 * 容量诊断（连接池/锁等待/flush 耗时/失败摘要）、worker 监控响应，
 * 以及 GM 诊断查询请求/结果集/响应。
 */
/** GM 服务端控制台日志级别。 */
export type GmServerLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';

/** GM 服务端控制台日志单行记录。 */
export interface GmServerLogEntry {
/**
 * seq：日志递增序号。
 */

  seq: number;
  /**
 * at：日志采集时间。
 */

  at: string;
  /**
 * level：日志级别。
 */

  level: GmServerLogLevel;
  /**
 * line：日志文本。
 */

  line: string;
}

/** GM 服务端控制台日志读取响应。 */
export interface GmServerLogsRes {
/**
 * entries：日志行集合。
 */

  entries: GmServerLogEntry[];
  /**
 * nextBeforeSeq：继续向上翻时使用的游标。
 */

  nextBeforeSeq?: number;
  /**
 * hasMore：是否还有更早日志。
 */

  hasMore: boolean;
  /**
 * limit：本次读取行数上限。
 */

  limit: number;
  /**
 * bufferSize：当前内存缓冲行数。
 */

  bufferSize: number;
}

/** GM worker 监控状态。 */
export type GmWorkerStatus = 'active' | 'pending' | 'idle' | 'warn' | 'error' | 'unknown';

/** GM worker 监控分类。 */
export type GmWorkerKind = 'player_flush' | 'instance_flush' | 'outbox' | 'database_backup' | 'cleanup';

export interface GmWorkerRuntimeRow {
  id: string;
  label: string;
  enabled: boolean;
  running: boolean;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  processedCount: number;
}

export interface GmWorkerTopology {
  currentRole: string;
  recommendedTopology: string;
  apiRoleExpected: boolean;
  workerRoleExpected: boolean;
  localWorkers: GmWorkerRuntimeRow[];
  note?: string;
}

/** GM worker 单项工作状态。 */
export interface GmWorkerRow {
/**
 * id：worker 稳定 ID。
 */

  id: string;
  /**
 * label：GM 展示名称。
 */

  label: string;
  /**
 * kind：worker 分类。
 */

  kind: GmWorkerKind;
  /**
 * status：当前状态。
 */

  status: GmWorkerStatus;
  /**
 * domain：账本或工作域。
 */

  domain?: string;
  /**
 * ownershipEpoch：实例 ownership epoch。
 */

  ownershipEpoch?: number;
  /**
 * pendingCount：待处理数量。
 */

  pendingCount: number;
  /**
 * claimedCount：当前被认领数量。
 */

  claimedCount: number;
  /**
 * delayedCount：延迟重试数量。
 */

  delayedCount: number;
  /**
 * writeCount：统计窗口内完成/写入数量。
 */

  writeCount: number;
  /**
 * writesPerSecond：统计窗口内吞吐。
 */

  writesPerSecond: number;
  backlogGrowthPerSecond?: number;
  /**
 * deadLetterCount：死信数量。
 */

  deadLetterCount?: number;
  /**
 * oldestPendingAt：最早待处理时间。
 */

  oldestPendingAt?: string | null;
  /**
 * latestUpdatedAt：最近更新时间。
 */

  latestUpdatedAt?: string | null;
  /**
 * note：补充说明。
 */

  note?: string;
  enabled?: boolean;
  running?: boolean;
  lastHeartbeatAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  processedCount?: number;
  runtimeRole?: string;
  /** stalePayloadCount：payload 为空的积压记录数（worker 无法处理，需等玩家上线重新 stage）。 */
  stalePayloadCount?: number;
}

/** GM worker 告警项。 */
export interface GmWorkerAlert {
/**
 * workerId：关联 worker ID。
 */

  workerId: string;
  /**
 * level：告警等级。
 */

  level: 'warn' | 'error';
  /**
 * reason：告警原因。
 */

  reason: string;
  /**
 * count：相关数量。
 */

  count?: number;
}

/** GM worker 容量诊断：数据库连接池快照。 */
export interface GmWorkerPoolStats {
/**
 * totalCount：池中连接总数。
 */

  totalCount: number;
  /**
 * idleCount：空闲连接数。
 */

  idleCount: number;
  /**
 * waitingCount：等待连接数。
 */

  waitingCount: number;
}

/** GM worker 容量诊断：PostgreSQL 锁等待摘要。 */
export interface GmWorkerLockWaitSummary {
/**
 * waitingCount：当前锁等待数量。
 */

  waitingCount: number;
  /**
 * checkedAt：采样时间戳。
 */

  checkedAt: number;
  /**
 * error：锁等待采样错误。
 */

  error?: string;
}

/** GM worker 容量诊断：最近 flush 耗时。 */
export interface GmWorkerFlushCapacity {
/**
 * totalMs：最近一轮总耗时。
 */

  totalMs: number;
  /**
 * dbWriteMs：最近一轮 DB 写入耗时。
 */

  dbWriteMs: number;
  /**
 * entityCount：玩家数或实例数。
 */

  entityCount: number;
  /**
 * domainCounts：domain 写入计数。
 */

  domainCounts: Record<string, number>;
  /**
 * coalescedDomainCount：被合并窗口延迟的 domain 数。
 */

  coalescedDomainCount?: number;
}

/** GM worker 容量诊断：失败摘要。 */
export interface GmWorkerFailureCapacity {
/**
 * total：内存窗口内失败总数。
 */

  total: number;
  /**
 * byCategory：按失败分类统计。
 */

  byCategory: Record<string, number>;
  /**
 * byDomain：按 scope/domain 统计。
 */

  byDomain: Record<string, number>;
}

/** GM worker 容量诊断。 */
export interface GmWorkerCapacity {
/**
 * pgPools：按用途拆分的数据库连接池状态。
 */

  pgPools?: {
    runtimeCritical?: GmWorkerPoolStats | null;
    flush?: GmWorkerPoolStats | null;
    outbox?: GmWorkerPoolStats | null;
    gmDiagnostics?: GmWorkerPoolStats | null;
  } | null;
  /**
 * pgLockWait：PostgreSQL 锁等待摘要。
 */

  pgLockWait?: GmWorkerLockWaitSummary | null;
  /**
 * player：最近玩家 flush 容量指标。
 */

  player?: GmWorkerFlushCapacity | null;
  /**
 * map：最近地图 flush 容量指标。
 */

  map?: GmWorkerFlushCapacity | null;
  /**
 * failures：flush 失败窗口摘要。
 */

  failures?: GmWorkerFailureCapacity | null;
}

/** GM worker 监控响应。 */
export interface GmWorkerStateRes {
/**
 * generatedAt：采样生成时间。
 */

  generatedAt: string;
  /**
 * windowSeconds：吞吐统计窗口。
 */

  windowSeconds: number;
  /**
 * rows：worker 状态列表。
 */

  rows: GmWorkerRow[];
  /**
 * alerts：告警列表。
 */

  alerts: GmWorkerAlert[];
  /**
 * sources：本次采样的数据源状态。
 */

  sources: {
    flushLedgerEnabled: boolean;
    outboxEnabled: boolean;
    backupWorkerHeartbeatActive: boolean;
    runtimeRole?: string;
    backgroundWorkerCount?: number;
  };
  /**
 * capacity：flush worker 容量和反压诊断。
 */

  capacity?: GmWorkerCapacity;
  topology?: GmWorkerTopology;
  scheduler?: {
    initialized: boolean;
    stopping: boolean;
    barrier: Record<string, unknown> | null;
    tasks: Array<{
      id: string;
      kind: string;
      scope: string;
      priority: string;
      enabled: boolean;
      running: boolean;
      paused: boolean;
      status: string;
      lastHeartbeatAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastFailure: string | null;
      processedCount: number;
      nextRunAt: string | null;
      backlogCount: number;
      lastDurationMs: number;
      runCount: number;
      failureCount: number;
      nodeId?: string;
      runtimeRole?: string;
      snapshotUpdatedAt?: string;
    }>;
    governor?: {
      availableParallelism: number;
      cpuReserve: number;
      flushPoolWaiting: number;
      lockWaitCount: number;
      backlogCount: number;
      backlogPressureLevel: 'low' | 'medium' | 'high' | 'critical';
    } | null;
  } | null;
  /**
 * note：补充说明。
 */

  note?: string;
}

/** GM 诊断查询请求。 */
export interface GmDiagnosticsQueryReq {
/**
 * command：GM 诊断指令。
 */

  command: string;
  /**
 * limit：结果行数上限。
 */

  limit?: number;
  /**
 * confirm：确认执行写操作（exec 命令需要此标志为 true）。
 */

  confirm?: boolean;
}

/** GM 诊断查询结果集。 */
export interface GmDiagnosticsResultSet {
/**
 * title：结果集标题。
 */

  title: string;
  /**
 * columns：列名集合。
 */

  columns: string[];
  /**
 * rows：结果行集合。
 */

  rows: Array<Record<string, unknown>>;
  /**
 * rowCount：返回行数。
 */

  rowCount: number;
  /**
 * truncated：是否被行数上限截断。
 */

  truncated: boolean;
}

/** GM 诊断查询响应。 */
export interface GmDiagnosticsQueryRes {
/**
 * ok：是否执行成功。
 */

  ok: boolean;
  /**
 * command：规范化后的指令。
 */

  command: string;
  /**
 * executedAt：执行时间。
 */

  executedAt: string;
  /**
 * durationMs：耗时毫秒。
 */

  durationMs: number;
  /**
 * resultSets：结果集集合。
 */

  resultSets: GmDiagnosticsResultSet[];
  /**
 * message：提示或错误信息。
 */

  message?: string;
  /**
 * warnings：安全限制或截断提示。
 */

  warnings?: string[];
}


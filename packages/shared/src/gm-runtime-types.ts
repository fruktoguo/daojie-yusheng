/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** GM 玩家列表里的单条摘要。 */
export interface GmPlayerSummary {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
  /**
 * accountName：account名称名称或显示文本。
 */

  accountName?: string;
  /**
 * mapId：地图ID标识。
 */

  mapId: string;
  /**
 * mapName：地图名称名称或显示文本。
 */

  mapName: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * hp：hp相关字段。
 */

  hp: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp: number;
  /**
 * dead：dead相关字段。
 */

  dead: boolean;
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle: boolean;
  /**
 * isBot：启用开关或状态标识。
 */

  isBot: boolean;
}

/** GM 网络大包开发态样本。 */
export interface GmNetworkLargePayloadSample {
/**
 * event：socket事件名称。
 */

  event: string;
  /**
 * bytes：payload字节数。
 */

  bytes: number;
  /**
 * packetBytes：事件名+payload的估算字节数。
 */

  packetBytes: number;
  /**
 * recordedAt：记录时间戳。
 */

  recordedAt: number;
  /**
 * body：JSON序列化后的包体内容。
 */

  body: string;
}

/** GM 网络流量按业务桶拆分的统计项。 */
export interface GmNetworkBucket {
/**
 * key：key标识。
 */

  key: string;
  /**
 * label：label名称或显示文本。
 */

  label: string;
  /**
 * bytes：byte相关字段。
 */

  bytes: number;
  /**
 * count：数量或计量字段。
 */

  count: number;
  /**
 * largePayloadCount：开发态捕获到的大包数量。
 */

  largePayloadCount?: number;
  /**
 * largePayloadBytes：开发态捕获到的大包payload总字节。
 */

  largePayloadBytes?: number;
  /**
 * largePayloadSamples：开发态捕获到的最近大包样本。
 */

  largePayloadSamples?: GmNetworkLargePayloadSample[];
}

/** GM CPU 分段统计项。 */
export interface GmCpuSectionSnapshot {
/**
 * key：key标识。
 */

  key: string;
  /**
 * label：label名称或显示文本。
 */

  label: string;
  /**
 * totalMs：totalM相关字段。
 */

  totalMs: number;
  /**
 * percent：percent相关字段。
 */

  percent: number;
  /**
 * count：数量或计量字段。
 */

  count: number;
  /**
 * avgMs：avgM相关字段。
 */

  avgMs: number;
}

/** GM 主线程 / Worker 窗口占用估算。 */
export interface GmCpuThreadingSnapshot {
  mainThread: {
    utilizationPercent: number;
    activeMs: number;
    idleMs: number;
  };
  workerThreads: {
    activeWorkers: number;
    inFlight: number;
    completedTasks: number;
    fallbackTasks: number;
    windowDurationMs: number;
    windowAvgMs: number;
  };
}

/** GM CPU / 内存 / 负载快照。 */
export interface GmCpuSnapshot {
/**
 * cores：core相关字段。
 */

  cores: number;
  /**
 * loadAvg1m：loadAvg1m相关字段。
 */

  loadAvg1m: number;
  /**
 * loadAvg5m：loadAvg5m相关字段。
 */

  loadAvg5m: number;
  /**
 * loadAvg15m：loadAvg15m相关字段。
 */

  loadAvg15m: number;
  /**
 * processUptimeSec：processUptimeSec相关字段。
 */

  processUptimeSec: number;
  /**
 * systemUptimeSec：systemUptimeSec相关字段。
 */

  systemUptimeSec: number;
  /**
 * userCpuMs：userCpuM相关字段。
 */

  userCpuMs: number;
  /**
 * systemCpuMs：systemCpuM相关字段。
 */

  systemCpuMs: number;
  /**
 * rssMb：rssMb相关字段。
 */

  rssMb: number;
  /**
 * heapUsedMb：heapUsedMb相关字段。
 */

  heapUsedMb: number;
  /**
 * heapTotalMb：heapTotalMb相关字段。
 */

  heapTotalMb: number;
  /**
 * externalMb：externalMb相关字段。
 */

  externalMb: number;
  /**
 * profileStartedAt：profileStartedAt相关字段。
 */

  profileStartedAt: number;
  /**
 * profileElapsedSec：profileElapsedSec相关字段。
 */

  profileElapsedSec: number;
  /**
 * breakdown：breakdown相关字段。
 */

  breakdown: GmCpuSectionSnapshot[];
  threading?: GmCpuThreadingSnapshot;
}

/** GM 运行态内存域估算项。 */
export interface GmMemoryDomainEstimateSnapshot {
/**
 * key：key标识。
 */

  key: string;
  /**
 * label：label名称或显示文本。
 */

  label: string;
  /**
 * bytes：byte相关字段。
 */

  bytes: number;
  /**
 * count：数量或计量字段。
 */

  count: number;
  /**
 * avgBytes：avgByte相关字段。
 */

  avgBytes: number;
}

/** GM 实例内存估算项。 */
export interface GmMemoryInstanceEstimateSnapshot {
/**
 * instanceId：instanceID标识。
 */

  instanceId: string;
  /**
 * label：label名称或显示文本。
 */

  label: string;
  /**
 * bytes：byte相关字段。
 */

  bytes: number;
  /**
 * playerBytes：playerByte相关字段。
 */

  playerBytes: number;
  /**
 * monsterBytes：monsterByte相关字段。
 */

  monsterBytes: number;
  /**
 * instanceBytes：instanceByte相关字段。
 */

  instanceBytes: number;
  /**
 * playerCount：数量或计量字段。
 */

  playerCount: number;
  /**
 * monsterCount：数量或计量字段。
 */

  monsterCount: number;
}

/** GM V8 heap space 快照项。 */
export interface GmV8HeapSpaceSnapshot {
/**
 * name：V8 heap space 名称。
 */

  name: string;
  /**
 * sizeBytes：当前 space 总容量。
 */

  sizeBytes: number;
  /**
 * usedBytes：当前 space 已用容量。
 */

  usedBytes: number;
  /**
 * availableBytes：当前 space 可用容量。
 */

  availableBytes: number;
  /**
 * physicalBytes：当前 space 物理占用。
 */

  physicalBytes: number;
}

/** GM 运行态内存画像快照。 */
export interface GmMemoryEstimateSnapshot {
/**
 * mode：mode相关字段。
 */

  mode: string;
  /**
 * generatedAt：generatedAt相关字段。
 */

  generatedAt: number;
  /**
 * cacheTtlMs：cacheTtlM相关字段。
 */

  cacheTtlMs: number;
  /**
 * rssBytes：rssByte相关字段。
 */

  rssBytes: number;
  /**
 * coveredBytes：coveredByte相关字段。
 */

  coveredBytes: number;
  /**
 * uncoveredBytes：uncoveredByte相关字段。
 */

  uncoveredBytes: number;
  /**
 * coveragePercent：coveragePercent相关字段。
 */

  coveragePercent: number;
  /**
 * domains：集合字段。
 */

  domains: GmMemoryDomainEstimateSnapshot[];
  /**
 * topInstances：集合字段。
 */

  topInstances: GmMemoryInstanceEstimateSnapshot[];
  /**
 * heapSpaces：V8 heap space 分解。
 */

  heapSpaces: GmV8HeapSpaceSnapshot[];
}

/** GM 生成 Heap Snapshot 结果。 */
export interface GmHeapSnapshotRes {
/**
 * ok：操作是否成功；in-memory 失败时为 false 并附 reason。
 */

  ok: boolean;
  /**
 * reason：失败原因（仅 ok=false 时存在）。
 */

  reason?: string;
  /**
 * error：失败错误信息。
 */

  error?: string;
  /**
 * hint：失败时给运维的下一步提示。
 */

  hint?: string;
  /**
 * path：服务端生成的 heapsnapshot 文件路径（仅落盘模式有值；in-memory 模式不存在）。
 */

  path?: string;
  /**
 * bytes：文件大小（仅落盘模式）。
 */

  bytes?: number;
  /**
 * durationMs：生成耗时。
 */

  durationMs?: number;
  /**
 * generatedAt：生成时间。
 */

  generatedAt?: number;
  /** summaryPath：服务端生成的摘要 JSON 文件路径（仅落盘模式）。 */
  summaryPath?: string;
  /** summaryBytes：摘要 JSON 文件大小（字节，仅落盘模式）。 */
  summaryBytes?: number;
  /** summaryDurationMs：摘要解析耗时（毫秒，仅落盘模式）。 */
  summaryDurationMs?: number;
  /** summaryError：摘要解析失败时的错误信息；成功时为 null/undefined。 */
  summaryError?: string | null;
  /** summary：摘要 JSON 内容（topByBytes / topByCount / diffSincePrevious 等结构）。 */
  summary?: GmHeapSnapshotSummary | null;
}

/** GM 读取最近一次 Heap Snapshot 摘要的响应。 */
export interface GmHeapSnapshotSummaryRes {
  /** ok：是否成功；false 时附 reason / hint 提示。 */
  ok: boolean;
  /** reason：失败原因（如 "no_summary_yet"）。 */
  reason?: string;
  /** hint：失败时给运维的下一步提示。 */
  hint?: string;
  /** fileName：摘要文件名（仅 ok=true 时存在）。 */
  fileName?: string;
  /** bytes：摘要文件大小。 */
  bytes?: number;
  /** summary：摘要 JSON 内容。 */
  summary?: GmHeapSnapshotSummary;
}

/** 单次内存用量快照，单位为字节。 */
export interface GmMemoryUsageBytesSnapshot {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

/** GM 手动 GC 诊断响应。 */
export interface GmManualGcRes {
  ok: boolean;
  reason?: 'in_progress' | 'cooldown' | 'gc_failed';
  error?: string;
  hint?: string;
  triggeredAt?: number;
  durationMs?: number;
  cooldownMs?: number;
  cooldownRemainingMs?: number;
  before?: GmMemoryUsageBytesSnapshot;
  after?: GmMemoryUsageBytesSnapshot;
  delta?: GmMemoryUsageBytesSnapshot;
}

/** Heap Snapshot 摘要中按 constructor 维度的统计条目。 */
export interface GmHeapSnapshotConstructorStat {
  /** 构造函数或 V8 类型名（显示名）。 */
  name: string;
  /** V8 节点类型（hidden/array/string/object/code/closure/...）。 */
  nodeType: string;
  /** 该 constructor 节点数量。 */
  count: number;
  /** self_size 累加，单位 byte。 */
  selfSizeBytes: number;
  /** 原始 V8 name 字段（截断到 64 字节），用于区分同 nodeType 下不同 nameIdx 的条目。 */
  rawName?: string;
}

/** Heap Snapshot 摘要 JSON 结构（与 server-side HeapSnapshotSummary 对齐）。 */
export interface GmHeapSnapshotSummary {
  /** generatedAtMs：摘要生成时间戳。 */
  generatedAtMs: number;
  /** parseDurationMs：解析耗时（毫秒）。 */
  parseDurationMs: number;
  /** snapshotFileBytes：源 .heapsnapshot 文件大小。 */
  snapshotFileBytes: number;
  /** declaredNodeCount：V8 写入时声明的节点数。 */
  declaredNodeCount: number;
  /** parsedNodeCount：实际解析到的节点数。 */
  parsedNodeCount: number;
  /** parsedStringCount：实际解析到的字符串数。 */
  parsedStringCount: number;
  /** totalSelfSizeBytes：所有节点 self_size 累加。 */
  totalSelfSizeBytes: number;
  /** topByBytes：按 self_size 倒序前 N。 */
  topByBytes: GmHeapSnapshotConstructorStat[];
  /** topByCount：按 count 倒序前 N。 */
  topByCount: GmHeapSnapshotConstructorStat[];
  /** diffSincePrevious：与上一次 summary 的对比（仅在存在上一份时输出）。 */
  diffSincePrevious?: {
    intervalMs: number;
    totalSelfSizeDeltaBytes: number;
    previousAtMs: number;
    previousFileName: string;
    topGrowingByBytes: Array<{
      name: string;
      nodeType: string;
      countDelta: number;
      sizeDeltaBytes: number;
    }>;
  };
}

/** 路径搜索失败原因统计。 */
export interface GmPathfindingFailureBucket {
/**
 * reason：reason相关字段。
 */

  reason: string;
  /**
 * label：label名称或显示文本。
 */

  label: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 路径搜索运行统计快照。 */
export interface GmPathfindingSnapshot {
/**
 * statsStartedAt：statStartedAt相关字段。
 */

  statsStartedAt: number;
  /**
 * statsElapsedSec：statElapsedSec相关字段。
 */

  statsElapsedSec: number;
  /**
 * workerCount：数量或计量字段。
 */

  workerCount: number;
  /**
 * runningWorkers：runningWorker相关字段。
 */

  runningWorkers: number;
  /**
 * idleWorkers：idleWorker相关字段。
 */

  idleWorkers: number;
  /**
 * peakRunningWorkers：peakRunningWorker相关字段。
 */

  peakRunningWorkers: number;
  /**
 * queueDepth：queueDepth相关字段。
 */

  queueDepth: number;
  /**
 * peakQueueDepth：peakQueueDepth相关字段。
 */

  peakQueueDepth: number;
  /**
 * enqueued：enqueued相关字段。
 */

  enqueued: number;
  /**
 * dispatched：dispatched相关字段。
 */

  dispatched: number;
  /**
 * completed：completed相关字段。
 */

  completed: number;
  /**
 * succeeded：succeeded相关字段。
 */

  succeeded: number;
  /**
 * failed：failed相关字段。
 */

  failed: number;
  /**
 * cancelled：cancelled相关字段。
 */

  cancelled: number;
  /**
 * droppedPending：droppedPending相关字段。
 */

  droppedPending: number;
  /**
 * droppedStaleResults：droppedStale结果相关字段。
 */

  droppedStaleResults: number;
  /**
 * avgQueueMs：avgQueueM相关字段。
 */

  avgQueueMs: number;
  /**
 * maxQueueMs：maxQueueM相关字段。
 */

  maxQueueMs: number;
  /**
 * avgRunMs：avgRunM相关字段。
 */

  avgRunMs: number;
  /**
 * maxRunMs：maxRunM相关字段。
 */

  maxRunMs: number;
  /**
 * avgExpandedNodes：avgExpandedNode相关字段。
 */

  avgExpandedNodes: number;
  /**
 * maxExpandedNodes：maxExpandedNode相关字段。
 */

  maxExpandedNodes: number;
  /**
 * failureReasons：failureReason相关字段。
 */

  failureReasons: GmPathfindingFailureBucket[];
}

/** tick 调度运行统计快照。 */
export interface GmTickSnapshot {
/**
 * lastMapId：last地图ID标识。
 */

  lastMapId: string | null;
  /**
 * lastMs：lastM相关字段。
 */

  lastMs: number;
  /**
 * windowElapsedSec：窗口ElapsedSec相关字段。
 */

  windowElapsedSec: number;
  /**
 * windowTickCount：数量或计量字段。
 */

  windowTickCount: number;
  /**
 * windowTotalMs：窗口TotalM相关字段。
 */

  windowTotalMs: number;
  /**
 * windowAvgMs：窗口AvgM相关字段。
 */

  windowAvgMs: number;
  /**
 * windowBusyPercent：窗口BusyPercent相关字段。
 */

  windowBusyPercent: number;
}

/** 单轮 flush 诊断快照。 */
export interface GmFlushDiagnosticsSnapshot {
  player: GmPlayerFlushDiagnostics | null;
  map: GmMapFlushDiagnostics | null;
  pgPool: GmPgPoolStats | null;
  pgPools?: GmPgPoolsSnapshot | null;
  pgLockWait: GmPgLockWaitSummary | null;
}

export interface GmPlayerFlushDiagnostics {
  dirtyPlayerCount: number;
  domainCounts: Record<string, number>;
  buildSnapshotMs: number;
  workerSubmitMs: number;
  dbWriteMs: number;
  markPersistedMs: number;
  totalMs: number;
  timestamp: number;
}

export interface GmMapFlushDiagnostics {
  dirtyInstanceCount: number;
  persistedInstanceCount: number;
  domainCounts: Record<string, number>;
  coalescedDomainCount?: number;
  deltaConstructMs: number;
  dbWriteMs: number;
  watermarkMs: number;
  totalMs: number;
  timestamp: number;
}

export interface GmPgPoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface GmPgPoolsSnapshot {
  runtimeCritical: GmPgPoolStats | null;
  flush: GmPgPoolStats | null;
  outbox: GmPgPoolStats | null;
  gmDiagnostics: GmPgPoolStats | null;
}

export interface GmPgLockWaitSummary {
  waitingCount: number;
  samples: Array<{ pid: number; waitEventType: string | null; waitEvent: string | null; state: string | null; ageMs: number; query: string }>;
  checkedAt: number;
  error?: string;
}

export interface GmFlushStatsSummary {
  player: { p50Ms: number; p95Ms: number; maxMs: number; count: number };
  map: { p50Ms: number; p95Ms: number; maxMs: number; count: number };
}

/** GM 总性能快照。 */
export interface GmPerformanceSnapshot {
/**
 * cpuPercent：cpuPercent相关字段。
 */

  cpuPercent: number;
  /**
 * memoryMb：memoryMb相关字段。
 */

  memoryMb: number;
  /**
 * tickMs：tickM相关字段。
 */

  tickMs: number;
  /**
 * tick：tick相关字段。
 */

  tick: GmTickSnapshot;
  /**
 * cpu：cpu相关字段。
 */

  cpu: GmCpuSnapshot;
  /**
 * memoryEstimate：memoryEstimate相关字段。
 */

  memoryEstimate: GmMemoryEstimateSnapshot;
  /**
 * pathfinding：pathfinding相关字段。
 */

  pathfinding: GmPathfindingSnapshot;
  /**
 * networkStatsEnabled：网络统计是否已启用。
 */

  networkStatsEnabled?: boolean;
  /**
 * networkPayloadCaptureEnabled：网络大包详情采样是否已启用。
 */

  networkPayloadCaptureEnabled?: boolean;
  /**
 * networkStatsStartedAt：networkStatStartedAt相关字段。
 */

  networkStatsStartedAt: number;
  /**
 * networkStatsElapsedSec：networkStatElapsedSec相关字段。
 */

  networkStatsElapsedSec: number;
  /**
 * networkInBytes：networkInByte相关字段。
 */

  networkInBytes: number;
  /**
 * networkOutBytes：networkOutByte相关字段。
 */

  networkOutBytes: number;
  /**
 * networkInBuckets：networkInBucket相关字段。
 */

  networkInBuckets: GmNetworkBucket[];
  /**
 * networkOutBuckets：networkOutBucket相关字段。
 */

  networkOutBuckets: GmNetworkBucket[];
  /** Worker Pool 多线程指标（Phase 0-5） */
  workerPool?: GmWorkerPoolAllMetrics | null;
  /** 玩家/地图刷盘与 PG 诊断指标。 */
  flushDiagnostics?: GmFlushDiagnosticsSnapshot | null;
  /** 玩家/地图刷盘滚动统计。 */
  flushStats?: GmFlushStatsSummary | null;
}

/** Worker Pool 全量指标（四个池） */
export interface GmWorkerPoolAllMetrics {
  encoding: GmWorkerPoolMetrics;
  instance: GmWorkerPoolMetrics;
  persistence: GmWorkerPoolMetrics;
  leaderboard: GmWorkerPoolMetrics;
}

/** 单个 Worker Pool 的指标快照 */
export interface GmWorkerPoolMetrics {
  totalSubmitted: number;
  totalCompleted: number;
  totalTimedOut: number;
  totalFailed: number;
  totalFallback: number;
  p50Ms: number;
  p95Ms: number;
  totalDurationMs?: number;
  recentTotalDurationMs?: number;
  recentTaskCount?: number;
  avgMs?: number;
  inFlight: number;
  activeWorkers: number;
}

/** GM 状态推送视图。 */
export interface GmStateView {
/**
 * players：集合字段。
 */

  players: GmPlayerSummary[];
  /**
 * mapIds：地图ID相关字段。
 */

  mapIds: string[];
  /**
 * botCount：数量或计量字段。
 */

  botCount: number;
  /**
 * perf：perf相关字段。
 */

  perf: GmPerformanceSnapshot;
}

/** GM 玩家列表里的单条摘要。 */
export interface GmPlayerSummary {
/**
 * id：GmPlayerSummary 内部字段。
 */

  id: string;  
  /**
 * name：GmPlayerSummary 内部字段。
 */

  name: string;  
  /**
 * roleName：GmPlayerSummary 内部字段。
 */

  roleName: string;  
  /**
 * displayName：GmPlayerSummary 内部字段。
 */

  displayName: string;  
  /**
 * accountName：GmPlayerSummary 内部字段。
 */

  accountName?: string;  
  /**
 * mapId：GmPlayerSummary 内部字段。
 */

  mapId: string;  
  /**
 * mapName：GmPlayerSummary 内部字段。
 */

  mapName: string;  
  /**
 * x：GmPlayerSummary 内部字段。
 */

  x: number;  
  /**
 * y：GmPlayerSummary 内部字段。
 */

  y: number;  
  /**
 * hp：GmPlayerSummary 内部字段。
 */

  hp: number;  
  /**
 * maxHp：GmPlayerSummary 内部字段。
 */

  maxHp: number;  
  /**
 * dead：GmPlayerSummary 内部字段。
 */

  dead: boolean;  
  /**
 * autoBattle：GmPlayerSummary 内部字段。
 */

  autoBattle: boolean;  
  /**
 * isBot：GmPlayerSummary 内部字段。
 */

  isBot: boolean;
}

/** GM 网络流量按业务桶拆分的统计项。 */
export interface GmNetworkBucket {
/**
 * key：GmNetworkBucket 内部字段。
 */

  key: string;  
  /**
 * label：GmNetworkBucket 内部字段。
 */

  label: string;  
  /**
 * bytes：GmNetworkBucket 内部字段。
 */

  bytes: number;  
  /**
 * count：GmNetworkBucket 内部字段。
 */

  count: number;
}

/** GM CPU 分段统计项。 */
export interface GmCpuSectionSnapshot {
/**
 * key：GmCpuSectionSnapshot 内部字段。
 */

  key: string;  
  /**
 * label：GmCpuSectionSnapshot 内部字段。
 */

  label: string;  
  /**
 * totalMs：GmCpuSectionSnapshot 内部字段。
 */

  totalMs: number;  
  /**
 * percent：GmCpuSectionSnapshot 内部字段。
 */

  percent: number;  
  /**
 * count：GmCpuSectionSnapshot 内部字段。
 */

  count: number;  
  /**
 * avgMs：GmCpuSectionSnapshot 内部字段。
 */

  avgMs: number;
}

/** GM CPU / 内存 / 负载快照。 */
export interface GmCpuSnapshot {
/**
 * cores：GmCpuSnapshot 内部字段。
 */

  cores: number;  
  /**
 * loadAvg1m：GmCpuSnapshot 内部字段。
 */

  loadAvg1m: number;  
  /**
 * loadAvg5m：GmCpuSnapshot 内部字段。
 */

  loadAvg5m: number;  
  /**
 * loadAvg15m：GmCpuSnapshot 内部字段。
 */

  loadAvg15m: number;  
  /**
 * processUptimeSec：GmCpuSnapshot 内部字段。
 */

  processUptimeSec: number;  
  /**
 * systemUptimeSec：GmCpuSnapshot 内部字段。
 */

  systemUptimeSec: number;  
  /**
 * userCpuMs：GmCpuSnapshot 内部字段。
 */

  userCpuMs: number;  
  /**
 * systemCpuMs：GmCpuSnapshot 内部字段。
 */

  systemCpuMs: number;  
  /**
 * rssMb：GmCpuSnapshot 内部字段。
 */

  rssMb: number;  
  /**
 * heapUsedMb：GmCpuSnapshot 内部字段。
 */

  heapUsedMb: number;  
  /**
 * heapTotalMb：GmCpuSnapshot 内部字段。
 */

  heapTotalMb: number;  
  /**
 * externalMb：GmCpuSnapshot 内部字段。
 */

  externalMb: number;  
  /**
 * profileStartedAt：GmCpuSnapshot 内部字段。
 */

  profileStartedAt: number;  
  /**
 * profileElapsedSec：GmCpuSnapshot 内部字段。
 */

  profileElapsedSec: number;  
  /**
 * breakdown：GmCpuSnapshot 内部字段。
 */

  breakdown: GmCpuSectionSnapshot[];
}

/** 路径搜索失败原因统计。 */
export interface GmPathfindingFailureBucket {
/**
 * reason：GmPathfindingFailureBucket 内部字段。
 */

  reason: string;  
  /**
 * label：GmPathfindingFailureBucket 内部字段。
 */

  label: string;  
  /**
 * count：GmPathfindingFailureBucket 内部字段。
 */

  count: number;
}

/** 路径搜索运行统计快照。 */
export interface GmPathfindingSnapshot {
/**
 * statsStartedAt：GmPathfindingSnapshot 内部字段。
 */

  statsStartedAt: number;  
  /**
 * statsElapsedSec：GmPathfindingSnapshot 内部字段。
 */

  statsElapsedSec: number;  
  /**
 * workerCount：GmPathfindingSnapshot 内部字段。
 */

  workerCount: number;  
  /**
 * runningWorkers：GmPathfindingSnapshot 内部字段。
 */

  runningWorkers: number;  
  /**
 * idleWorkers：GmPathfindingSnapshot 内部字段。
 */

  idleWorkers: number;  
  /**
 * peakRunningWorkers：GmPathfindingSnapshot 内部字段。
 */

  peakRunningWorkers: number;  
  /**
 * queueDepth：GmPathfindingSnapshot 内部字段。
 */

  queueDepth: number;  
  /**
 * peakQueueDepth：GmPathfindingSnapshot 内部字段。
 */

  peakQueueDepth: number;  
  /**
 * enqueued：GmPathfindingSnapshot 内部字段。
 */

  enqueued: number;  
  /**
 * dispatched：GmPathfindingSnapshot 内部字段。
 */

  dispatched: number;  
  /**
 * completed：GmPathfindingSnapshot 内部字段。
 */

  completed: number;  
  /**
 * succeeded：GmPathfindingSnapshot 内部字段。
 */

  succeeded: number;  
  /**
 * failed：GmPathfindingSnapshot 内部字段。
 */

  failed: number;  
  /**
 * cancelled：GmPathfindingSnapshot 内部字段。
 */

  cancelled: number;  
  /**
 * droppedPending：GmPathfindingSnapshot 内部字段。
 */

  droppedPending: number;  
  /**
 * droppedStaleResults：GmPathfindingSnapshot 内部字段。
 */

  droppedStaleResults: number;  
  /**
 * avgQueueMs：GmPathfindingSnapshot 内部字段。
 */

  avgQueueMs: number;  
  /**
 * maxQueueMs：GmPathfindingSnapshot 内部字段。
 */

  maxQueueMs: number;  
  /**
 * avgRunMs：GmPathfindingSnapshot 内部字段。
 */

  avgRunMs: number;  
  /**
 * maxRunMs：GmPathfindingSnapshot 内部字段。
 */

  maxRunMs: number;  
  /**
 * avgExpandedNodes：GmPathfindingSnapshot 内部字段。
 */

  avgExpandedNodes: number;  
  /**
 * maxExpandedNodes：GmPathfindingSnapshot 内部字段。
 */

  maxExpandedNodes: number;  
  /**
 * failureReasons：GmPathfindingSnapshot 内部字段。
 */

  failureReasons: GmPathfindingFailureBucket[];
}

/** tick 调度运行统计快照。 */
export interface GmTickSnapshot {
/**
 * lastMapId：GmTickSnapshot 内部字段。
 */

  lastMapId: string | null;  
  /**
 * lastMs：GmTickSnapshot 内部字段。
 */

  lastMs: number;  
  /**
 * windowElapsedSec：GmTickSnapshot 内部字段。
 */

  windowElapsedSec: number;  
  /**
 * windowTickCount：GmTickSnapshot 内部字段。
 */

  windowTickCount: number;  
  /**
 * windowTotalMs：GmTickSnapshot 内部字段。
 */

  windowTotalMs: number;  
  /**
 * windowAvgMs：GmTickSnapshot 内部字段。
 */

  windowAvgMs: number;  
  /**
 * windowBusyPercent：GmTickSnapshot 内部字段。
 */

  windowBusyPercent: number;
}

/** GM 总性能快照。 */
export interface GmPerformanceSnapshot {
/**
 * cpuPercent：GmPerformanceSnapshot 内部字段。
 */

  cpuPercent: number;  
  /**
 * memoryMb：GmPerformanceSnapshot 内部字段。
 */

  memoryMb: number;  
  /**
 * tickMs：GmPerformanceSnapshot 内部字段。
 */

  tickMs: number;  
  /**
 * tick：GmPerformanceSnapshot 内部字段。
 */

  tick: GmTickSnapshot;  
  /**
 * cpu：GmPerformanceSnapshot 内部字段。
 */

  cpu: GmCpuSnapshot;  
  /**
 * pathfinding：GmPerformanceSnapshot 内部字段。
 */

  pathfinding: GmPathfindingSnapshot;  
  /**
 * networkStatsStartedAt：GmPerformanceSnapshot 内部字段。
 */

  networkStatsStartedAt: number;  
  /**
 * networkStatsElapsedSec：GmPerformanceSnapshot 内部字段。
 */

  networkStatsElapsedSec: number;  
  /**
 * networkInBytes：GmPerformanceSnapshot 内部字段。
 */

  networkInBytes: number;  
  /**
 * networkOutBytes：GmPerformanceSnapshot 内部字段。
 */

  networkOutBytes: number;  
  /**
 * networkInBuckets：GmPerformanceSnapshot 内部字段。
 */

  networkInBuckets: GmNetworkBucket[];  
  /**
 * networkOutBuckets：GmPerformanceSnapshot 内部字段。
 */

  networkOutBuckets: GmNetworkBucket[];
}

/** GM 状态推送视图。 */
export interface GmStateView {
/**
 * players：GmStateView 内部字段。
 */

  players: GmPlayerSummary[];  
  /**
 * mapIds：GmStateView 内部字段。
 */

  mapIds: string[];  
  /**
 * botCount：GmStateView 内部字段。
 */

  botCount: number;  
  /**
 * perf：GmStateView 内部字段。
 */

  perf: GmPerformanceSnapshot;
}

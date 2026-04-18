/** GM 玩家列表里的单条摘要。 */
export interface GmPlayerSummary {
  id: string;
  name: string;
  roleName: string;
  displayName: string;
  accountName?: string;
  mapId: string;
  mapName: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  autoBattle: boolean;
  isBot: boolean;
}

/** GM 网络流量按业务桶拆分的统计项。 */
export interface GmNetworkBucket {
  key: string;
  label: string;
  bytes: number;
  count: number;
}

/** GM CPU 分段统计项。 */
export interface GmCpuSectionSnapshot {
  key: string;
  label: string;
  totalMs: number;
  percent: number;
  count: number;
  avgMs: number;
}

/** GM CPU / 内存 / 负载快照。 */
export interface GmCpuSnapshot {
  cores: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  processUptimeSec: number;
  systemUptimeSec: number;
  userCpuMs: number;
  systemCpuMs: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  profileStartedAt: number;
  profileElapsedSec: number;
  breakdown: GmCpuSectionSnapshot[];
}

/** 路径搜索失败原因统计。 */
export interface GmPathfindingFailureBucket {
  reason: string;
  label: string;
  count: number;
}

/** 路径搜索运行统计快照。 */
export interface GmPathfindingSnapshot {
  statsStartedAt: number;
  statsElapsedSec: number;
  workerCount: number;
  runningWorkers: number;
  idleWorkers: number;
  peakRunningWorkers: number;
  queueDepth: number;
  peakQueueDepth: number;
  enqueued: number;
  dispatched: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  droppedPending: number;
  droppedStaleResults: number;
  avgQueueMs: number;
  maxQueueMs: number;
  avgRunMs: number;
  maxRunMs: number;
  avgExpandedNodes: number;
  maxExpandedNodes: number;
  failureReasons: GmPathfindingFailureBucket[];
}

/** tick 调度运行统计快照。 */
export interface GmTickSnapshot {
  lastMapId: string | null;
  lastMs: number;
  windowElapsedSec: number;
  windowTickCount: number;
  windowTotalMs: number;
  windowAvgMs: number;
  windowBusyPercent: number;
}

/** GM 总性能快照。 */
export interface GmPerformanceSnapshot {
  cpuPercent: number;
  memoryMb: number;
  tickMs: number;
  tick: GmTickSnapshot;
  cpu: GmCpuSnapshot;
  pathfinding: GmPathfindingSnapshot;
  networkStatsStartedAt: number;
  networkStatsElapsedSec: number;
  networkInBytes: number;
  networkOutBytes: number;
  networkInBuckets: GmNetworkBucket[];
  networkOutBuckets: GmNetworkBucket[];
}

/** GM 状态推送视图。 */
export interface GmStateView {
  players: GmPlayerSummary[];
  mapIds: string[];
  botCount: number;
  perf: GmPerformanceSnapshot;
}

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
 * pathfinding：pathfinding相关字段。
 */

  pathfinding: GmPathfindingSnapshot;  
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

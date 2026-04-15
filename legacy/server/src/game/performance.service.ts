/**
 * 性能监控服务：采集 CPU、内存、tick 耗时、网络流量统计
 */
import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { GmNetworkBucket, GmPerformanceSnapshot } from '@mud/shared';
import { PathfindingTaskResult } from './pathfinding/pathfinding.types';

/** NetworkBucketCounter：定义该接口的能力与字段约束。 */
interface NetworkBucketCounter {
/** label：定义该变量以承载业务值。 */
  label: string;
/** bytes：定义该变量以承载业务值。 */
  bytes: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** CpuSectionCounter：定义该接口的能力与字段约束。 */
interface CpuSectionCounter {
/** label：定义该变量以承载业务值。 */
  label: string;
/** totalMs：定义该变量以承载业务值。 */
  totalMs: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** PathfindingFailureCounter：定义该接口的能力与字段约束。 */
interface PathfindingFailureCounter {
/** reason：定义该变量以承载业务值。 */
  reason: string;
/** label：定义该变量以承载业务值。 */
  label: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** PathfindingStatsState：定义该接口的能力与字段约束。 */
interface PathfindingStatsState {
/** startedAt：定义该变量以承载业务值。 */
  startedAt: number;
/** workerCount：定义该变量以承载业务值。 */
  workerCount: number;
/** runningWorkers：定义该变量以承载业务值。 */
  runningWorkers: number;
/** peakRunningWorkers：定义该变量以承载业务值。 */
  peakRunningWorkers: number;
/** queueDepth：定义该变量以承载业务值。 */
  queueDepth: number;
/** peakQueueDepth：定义该变量以承载业务值。 */
  peakQueueDepth: number;
/** enqueued：定义该变量以承载业务值。 */
  enqueued: number;
/** dispatched：定义该变量以承载业务值。 */
  dispatched: number;
/** completed：定义该变量以承载业务值。 */
  completed: number;
/** succeeded：定义该变量以承载业务值。 */
  succeeded: number;
/** failed：定义该变量以承载业务值。 */
  failed: number;
/** cancelled：定义该变量以承载业务值。 */
  cancelled: number;
/** droppedPending：定义该变量以承载业务值。 */
  droppedPending: number;
/** droppedStaleResults：定义该变量以承载业务值。 */
  droppedStaleResults: number;
/** totalQueueMs：定义该变量以承载业务值。 */
  totalQueueMs: number;
/** maxQueueMs：定义该变量以承载业务值。 */
  maxQueueMs: number;
/** totalRunMs：定义该变量以承载业务值。 */
  totalRunMs: number;
/** maxRunMs：定义该变量以承载业务值。 */
  maxRunMs: number;
/** totalExpandedNodes：定义该变量以承载业务值。 */
  totalExpandedNodes: number;
/** maxExpandedNodes：定义该变量以承载业务值。 */
  maxExpandedNodes: number;
/** failureReasons：定义该变量以承载业务值。 */
  failureReasons: Map<string, PathfindingFailureCounter>;
}

@Injectable()
/** PerformanceService：封装相关状态与行为。 */
export class PerformanceService {
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = process.hrtime.bigint();
  private lastTickMs = 0;
/** lastTickMapId：定义该变量以承载业务值。 */
  private lastTickMapId: string | null = null;
  private cpuProfileStartedAt = Date.now();
  private tickWindowCount = 0;
  private tickWindowTotalMs = 0;
  private networkStatsStartedAt = Date.now();
  private totalNetworkInBytes = 0;
  private totalNetworkOutBytes = 0;
  private readonly networkInBuckets = new Map<string, NetworkBucketCounter>();
  private readonly networkOutBuckets = new Map<string, NetworkBucketCounter>();
  private readonly cpuSections = new Map<string, CpuSectionCounter>();
  private pathfindingStats = this.createPathfindingStatsState();

  /** 记录单次 tick 耗时 */
  recordTick(mapId: string, elapsedMs: number) {
    this.lastTickMs = elapsedMs;
    this.lastTickMapId = mapId;
    if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
      this.tickWindowCount += 1;
      this.tickWindowTotalMs += elapsedMs;
    }
  }

  /** 记录入站网络字节数 */
  recordNetworkInBytes(bytes: number, key = 'unknown', label = key): void {
    this.totalNetworkInBytes += this.recordNetworkBytes(this.networkInBuckets, bytes, key, label);
  }

  /** 记录出站网络字节数 */
  recordNetworkOutBytes(bytes: number, key = 'unknown', label = key): void {
    this.totalNetworkOutBytes += this.recordNetworkBytes(this.networkOutBuckets, bytes, key, label);
  }

  private recordNetworkBytes(
    buckets: Map<string, NetworkBucketCounter>,
    bytes: number,
    key: string,
    label: string,
  ): number {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return 0;
    }
/** safeBytes：定义该变量以承载业务值。 */
    const safeBytes = Math.floor(bytes);
/** bucket：定义该变量以承载业务值。 */
    const bucket = buckets.get(key) ?? { label, bytes: 0, count: 0 };
    bucket.label = label;
    bucket.bytes += safeBytes;
    bucket.count += 1;
    buckets.set(key, bucket);
    return safeBytes;
  }

/** buildBucketSnapshot：执行对应的业务逻辑。 */
  private buildBucketSnapshot(buckets: Map<string, NetworkBucketCounter>): GmNetworkBucket[] {
    return [...buckets.entries()]
      .map(([key, bucket]) => ({
        key,
        label: bucket.label,
        bytes: bucket.bytes,
        count: bucket.count,
      }))
      .sort((left, right) => {
        if (right.bytes !== left.bytes) {
          return right.bytes - left.bytes;
        }
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return left.label.localeCompare(right.label, 'zh-CN');
      });
  }

/** recordCpuSection：执行对应的业务逻辑。 */
  recordCpuSection(elapsedMs: number, key = 'unknown', label = key): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return;
    }
/** section：定义该变量以承载业务值。 */
    const section = this.cpuSections.get(key) ?? { label, totalMs: 0, count: 0 };
    section.label = label;
    section.totalMs += elapsedMs;
    section.count += 1;
    this.cpuSections.set(key, section);
  }

/** buildCpuBreakdownSnapshot：处理当前场景中的对应操作。 */
  private buildCpuBreakdownSnapshot() {
/** totalTrackedMs：定义该变量以承载业务值。 */
    const totalTrackedMs = [...this.cpuSections.values()].reduce((sum, section) => sum + section.totalMs, 0);
    return [...this.cpuSections.entries()]
      .map(([key, section]) => ({
        key,
        label: section.label,
        totalMs: Number(section.totalMs.toFixed(2)),
        percent: totalTrackedMs > 0 ? Number(((section.totalMs / totalTrackedMs) * 100).toFixed(1)) : 0,
        count: section.count,
        avgMs: section.count > 0 ? Number((section.totalMs / section.count).toFixed(3)) : 0,
      }))
      .sort((left, right) => {
        if (right.totalMs !== left.totalMs) {
          return right.totalMs - left.totalMs;
        }
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return left.label.localeCompare(right.label, 'zh-CN');
      });
  }

/** resetNetworkStats：执行对应的业务逻辑。 */
  resetNetworkStats(): void {
    this.networkStatsStartedAt = Date.now();
    this.totalNetworkInBytes = 0;
    this.totalNetworkOutBytes = 0;
    this.networkInBuckets.clear();
    this.networkOutBuckets.clear();
  }

/** resetCpuStats：执行对应的业务逻辑。 */
  resetCpuStats(): void {
    this.cpuProfileStartedAt = Date.now();
    this.lastTickMs = 0;
    this.lastTickMapId = null;
    this.cpuSections.clear();
  }

/** resetPathfindingStats：执行对应的业务逻辑。 */
  resetPathfindingStats(): void {
/** previous：定义该变量以承载业务值。 */
    const previous = this.pathfindingStats;
    this.pathfindingStats = this.createPathfindingStatsState();
    this.pathfindingStats.workerCount = previous.workerCount;
    this.pathfindingStats.runningWorkers = previous.runningWorkers;
    this.pathfindingStats.queueDepth = previous.queueDepth;
    this.pathfindingStats.peakRunningWorkers = previous.runningWorkers;
    this.pathfindingStats.peakQueueDepth = previous.queueDepth;
  }

/** setPathfindingQueueDepth：执行对应的业务逻辑。 */
  setPathfindingQueueDepth(queueDepth: number): void {
/** normalized：定义该变量以承载业务值。 */
    const normalized = Math.max(0, Math.floor(queueDepth));
    this.pathfindingStats.queueDepth = normalized;
    this.pathfindingStats.peakQueueDepth = Math.max(this.pathfindingStats.peakQueueDepth, normalized);
  }

/** setPathfindingWorkerState：执行对应的业务逻辑。 */
  setPathfindingWorkerState(workerCount: number, runningWorkers: number): void {
/** normalizedWorkers：定义该变量以承载业务值。 */
    const normalizedWorkers = Math.max(0, Math.floor(workerCount));
/** normalizedRunning：定义该变量以承载业务值。 */
    const normalizedRunning = Math.max(0, Math.min(normalizedWorkers, Math.floor(runningWorkers)));
    this.pathfindingStats.workerCount = normalizedWorkers;
    this.pathfindingStats.runningWorkers = normalizedRunning;
    this.pathfindingStats.peakRunningWorkers = Math.max(this.pathfindingStats.peakRunningWorkers, normalizedRunning);
  }

/** recordPathfindingEnqueued：执行对应的业务逻辑。 */
  recordPathfindingEnqueued(count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    this.pathfindingStats.enqueued += Math.floor(count);
  }

/** recordPathfindingPendingDropped：执行对应的业务逻辑。 */
  recordPathfindingPendingDropped(count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    this.pathfindingStats.droppedPending += Math.floor(count);
  }

/** recordPathfindingStaleResultDropped：执行对应的业务逻辑。 */
  recordPathfindingStaleResultDropped(count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    this.pathfindingStats.droppedStaleResults += Math.floor(count);
  }

/** recordPathfindingDispatched：执行对应的业务逻辑。 */
  recordPathfindingDispatched(waitMs: number): void {
    this.pathfindingStats.dispatched += 1;
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      return;
    }
    this.pathfindingStats.totalQueueMs += waitMs;
    this.pathfindingStats.maxQueueMs = Math.max(this.pathfindingStats.maxQueueMs, waitMs);
  }

/** recordPathfindingCompleted：执行对应的业务逻辑。 */
  recordPathfindingCompleted(result: PathfindingTaskResult): void {
    this.pathfindingStats.completed += 1;
    if (Number.isFinite(result.elapsedMs) && result.elapsedMs > 0) {
      this.pathfindingStats.totalRunMs += result.elapsedMs;
      this.pathfindingStats.maxRunMs = Math.max(this.pathfindingStats.maxRunMs, result.elapsedMs);
    }
    if (Number.isFinite(result.expandedNodes) && result.expandedNodes >= 0) {
      this.pathfindingStats.totalExpandedNodes += result.expandedNodes;
      this.pathfindingStats.maxExpandedNodes = Math.max(this.pathfindingStats.maxExpandedNodes, result.expandedNodes);
    }

    if (result.status === 'success') {
      this.pathfindingStats.succeeded += 1;
      return;
    }

    if (result.reason === 'cancelled') {
      this.pathfindingStats.cancelled += 1;
    } else {
      this.pathfindingStats.failed += 1;
    }

/** bucket：定义该变量以承载业务值。 */
    const bucket = this.pathfindingStats.failureReasons.get(result.reason) ?? {
      reason: result.reason,
      label: this.getPathfindingFailureLabel(result.reason),
      count: 0,
    };
    bucket.count += 1;
    this.pathfindingStats.failureReasons.set(result.reason, bucket);
  }

/** createPathfindingStatsState：执行对应的业务逻辑。 */
  private createPathfindingStatsState(): PathfindingStatsState {
    return {
      startedAt: Date.now(),
      workerCount: 0,
      runningWorkers: 0,
      peakRunningWorkers: 0,
      queueDepth: 0,
      peakQueueDepth: 0,
      enqueued: 0,
      dispatched: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      droppedPending: 0,
      droppedStaleResults: 0,
      totalQueueMs: 0,
      maxQueueMs: 0,
      totalRunMs: 0,
      maxRunMs: 0,
      totalExpandedNodes: 0,
      maxExpandedNodes: 0,
      failureReasons: new Map<string, PathfindingFailureCounter>(),
    };
  }

/** getPathfindingFailureLabel：执行对应的业务逻辑。 */
  private getPathfindingFailureLabel(reason: string): string {
    switch (reason) {
      case 'cancelled':
        return '已取消';
      case 'step_limit':
        return '超出展开上限';
      case 'path_too_long':
        return '路径过长';
      case 'target_too_far':
        return '目标过远';
      case 'invalid_goal':
        return '目标非法';
      case 'no_path':
      default:
        return '无路可达';
    }
  }

/** buildPathfindingSnapshot：处理当前场景中的对应操作。 */
  private buildPathfindingSnapshot() {
/** stats：定义该变量以承载业务值。 */
    const stats = this.pathfindingStats;
/** elapsedSec：定义该变量以承载业务值。 */
    const elapsedSec = Math.max(0, (Date.now() - stats.startedAt) / 1000);
/** completed：定义该变量以承载业务值。 */
    const completed = Math.max(0, stats.completed);
/** dispatched：定义该变量以承载业务值。 */
    const dispatched = Math.max(0, stats.dispatched);
    return {
      statsStartedAt: stats.startedAt,
      statsElapsedSec: Number(elapsedSec.toFixed(1)),
      workerCount: stats.workerCount,
      runningWorkers: stats.runningWorkers,
      idleWorkers: Math.max(0, stats.workerCount - stats.runningWorkers),
      peakRunningWorkers: stats.peakRunningWorkers,
      queueDepth: stats.queueDepth,
      peakQueueDepth: stats.peakQueueDepth,
      enqueued: stats.enqueued,
      dispatched: stats.dispatched,
      completed: stats.completed,
      succeeded: stats.succeeded,
      failed: stats.failed,
      cancelled: stats.cancelled,
      droppedPending: stats.droppedPending,
      droppedStaleResults: stats.droppedStaleResults,
      avgQueueMs: dispatched > 0 ? Number((stats.totalQueueMs / dispatched).toFixed(2)) : 0,
      maxQueueMs: Number(stats.maxQueueMs.toFixed(2)),
      avgRunMs: completed > 0 ? Number((stats.totalRunMs / completed).toFixed(2)) : 0,
      maxRunMs: Number(stats.maxRunMs.toFixed(2)),
      avgExpandedNodes: completed > 0 ? Number((stats.totalExpandedNodes / completed).toFixed(1)) : 0,
      maxExpandedNodes: stats.maxExpandedNodes,
      failureReasons: [...stats.failureReasons.values()]
        .sort((left, right) => {
          if (right.count !== left.count) {
            return right.count - left.count;
          }
          return left.label.localeCompare(right.label, 'zh-CN');
        })
        .map((bucket) => ({
          reason: bucket.reason,
          label: bucket.label,
          count: bucket.count,
        })),
    };
  }

  /** 生成当前性能快照（CPU、内存、tick 耗时、网络统计） */
  getSnapshot(): GmPerformanceSnapshot {
/** now：定义该变量以承载业务值。 */
    const now = process.hrtime.bigint();
/** cpuUsage：定义该变量以承载业务值。 */
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
/** elapsedMicros：定义该变量以承载业务值。 */
    const elapsedMicros = Number(now - this.lastCpuTime) / 1000;
/** cpuMicros：定义该变量以承载业务值。 */
    const cpuMicros = cpuUsage.user + cpuUsage.system;
/** tickWindowElapsedMs：定义该变量以承载业务值。 */
    const tickWindowElapsedMs = Math.max(0, Number(now - this.lastCpuTime) / 1_000_000);
/** tickWindowElapsedSec：定义该变量以承载业务值。 */
    const tickWindowElapsedSec = tickWindowElapsedMs / 1000;
/** tickWindowTotalMs：定义该变量以承载业务值。 */
    const tickWindowTotalMs = this.tickWindowTotalMs;
/** tickWindowCount：定义该变量以承载业务值。 */
    const tickWindowCount = this.tickWindowCount;

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;
    this.tickWindowCount = 0;
    this.tickWindowTotalMs = 0;

/** cpuPercent：定义该变量以承载业务值。 */
    const cpuPercent = elapsedMicros > 0
      ? Math.max(0, Math.min(100, (cpuMicros / elapsedMicros) * 100))
      : 0;
/** cpuTotals：定义该变量以承载业务值。 */
    const cpuTotals = process.cpuUsage();
/** memoryUsage：定义该变量以承载业务值。 */
    const memoryUsage = process.memoryUsage();
/** memoryMb：定义该变量以承载业务值。 */
    const memoryMb = memoryUsage.rss / (1024 * 1024);
    const [loadAvg1m, loadAvg5m, loadAvg15m] = os.loadavg();
/** cpuProfileElapsedSec：定义该变量以承载业务值。 */
    const cpuProfileElapsedSec = Math.max(0, (Date.now() - this.cpuProfileStartedAt) / 1000);
/** networkStatsElapsedSec：定义该变量以承载业务值。 */
    const networkStatsElapsedSec = Math.max(0, (Date.now() - this.networkStatsStartedAt) / 1000);

    return {
      cpuPercent: Number(cpuPercent.toFixed(1)),
      memoryMb: Number(memoryMb.toFixed(1)),
      tickMs: Number(this.lastTickMs.toFixed(1)),
      tick: {
        lastMapId: this.lastTickMapId,
        lastMs: Number(this.lastTickMs.toFixed(1)),
        windowElapsedSec: Number(tickWindowElapsedSec.toFixed(1)),
        windowTickCount: tickWindowCount,
        windowTotalMs: Number(tickWindowTotalMs.toFixed(1)),
        windowAvgMs: tickWindowCount > 0 ? Number((tickWindowTotalMs / tickWindowCount).toFixed(2)) : 0,
        windowBusyPercent: tickWindowElapsedMs > 0
          ? Number(Math.max(0, Math.min(100, (tickWindowTotalMs / tickWindowElapsedMs) * 100)).toFixed(1))
          : 0,
      },
      cpu: {
        cores: os.cpus().length,
        loadAvg1m: Number(loadAvg1m.toFixed(2)),
        loadAvg5m: Number(loadAvg5m.toFixed(2)),
        loadAvg15m: Number(loadAvg15m.toFixed(2)),
        processUptimeSec: Number(process.uptime().toFixed(1)),
        systemUptimeSec: Number(os.uptime().toFixed(1)),
        userCpuMs: Number((cpuTotals.user / 1000).toFixed(1)),
        systemCpuMs: Number((cpuTotals.system / 1000).toFixed(1)),
        rssMb: Number((memoryUsage.rss / (1024 * 1024)).toFixed(1)),
        heapUsedMb: Number((memoryUsage.heapUsed / (1024 * 1024)).toFixed(1)),
        heapTotalMb: Number((memoryUsage.heapTotal / (1024 * 1024)).toFixed(1)),
        externalMb: Number((memoryUsage.external / (1024 * 1024)).toFixed(1)),
        profileStartedAt: this.cpuProfileStartedAt,
        profileElapsedSec: Number(cpuProfileElapsedSec.toFixed(1)),
        breakdown: this.buildCpuBreakdownSnapshot(),
      },
      pathfinding: this.buildPathfindingSnapshot(),
      networkStatsStartedAt: this.networkStatsStartedAt,
      networkStatsElapsedSec: Number(networkStatsElapsedSec.toFixed(1)),
      networkInBytes: this.totalNetworkInBytes,
      networkOutBytes: this.totalNetworkOutBytes,
      networkInBuckets: this.buildBucketSnapshot(this.networkInBuckets),
      networkOutBuckets: this.buildBucketSnapshot(this.networkOutBuckets),
    };
  }
}


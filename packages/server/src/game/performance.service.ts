/**
 * 性能监控服务：采集 CPU、内存、tick 耗时、网络流量统计
 */
import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { GmNetworkBucket, GmPerformanceSnapshot } from '@mud/shared';
import { PathfindingTaskResult } from './pathfinding/pathfinding.types';

interface NetworkBucketCounter {
  label: string;
  bytes: number;
  count: number;
}

interface CpuSectionCounter {
  label: string;
  totalMs: number;
  count: number;
}

interface PathfindingFailureCounter {
  reason: string;
  label: string;
  count: number;
}

interface PathfindingStatsState {
  startedAt: number;
  workerCount: number;
  runningWorkers: number;
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
  totalQueueMs: number;
  maxQueueMs: number;
  totalRunMs: number;
  maxRunMs: number;
  totalExpandedNodes: number;
  maxExpandedNodes: number;
  failureReasons: Map<string, PathfindingFailureCounter>;
}

@Injectable()
export class PerformanceService {
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = process.hrtime.bigint();
  private lastTickMs = 0;
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
    const safeBytes = Math.floor(bytes);
    const bucket = buckets.get(key) ?? { label, bytes: 0, count: 0 };
    bucket.label = label;
    bucket.bytes += safeBytes;
    bucket.count += 1;
    buckets.set(key, bucket);
    return safeBytes;
  }

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

  recordCpuSection(elapsedMs: number, key = 'unknown', label = key): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return;
    }
    const section = this.cpuSections.get(key) ?? { label, totalMs: 0, count: 0 };
    section.label = label;
    section.totalMs += elapsedMs;
    section.count += 1;
    this.cpuSections.set(key, section);
  }

  private buildCpuBreakdownSnapshot() {
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

  resetNetworkStats(): void {
    this.networkStatsStartedAt = Date.now();
    this.totalNetworkInBytes = 0;
    this.totalNetworkOutBytes = 0;
    this.networkInBuckets.clear();
    this.networkOutBuckets.clear();
  }

  resetCpuStats(): void {
    this.cpuProfileStartedAt = Date.now();
    this.lastTickMs = 0;
    this.lastTickMapId = null;
    this.cpuSections.clear();
  }

  resetPathfindingStats(): void {
    const previous = this.pathfindingStats;
    this.pathfindingStats = this.createPathfindingStatsState();
    this.pathfindingStats.workerCount = previous.workerCount;
    this.pathfindingStats.runningWorkers = previous.runningWorkers;
    this.pathfindingStats.queueDepth = previous.queueDepth;
    this.pathfindingStats.peakRunningWorkers = previous.runningWorkers;
    this.pathfindingStats.peakQueueDepth = previous.queueDepth;
  }

  setPathfindingQueueDepth(queueDepth: number): void {
    const normalized = Math.max(0, Math.floor(queueDepth));
    this.pathfindingStats.queueDepth = normalized;
    this.pathfindingStats.peakQueueDepth = Math.max(this.pathfindingStats.peakQueueDepth, normalized);
  }

  setPathfindingWorkerState(workerCount: number, runningWorkers: number): void {
    const normalizedWorkers = Math.max(0, Math.floor(workerCount));
    const normalizedRunning = Math.max(0, Math.min(normalizedWorkers, Math.floor(runningWorkers)));
    this.pathfindingStats.workerCount = normalizedWorkers;
    this.pathfindingStats.runningWorkers = normalizedRunning;
    this.pathfindingStats.peakRunningWorkers = Math.max(this.pathfindingStats.peakRunningWorkers, normalizedRunning);
  }

  recordPathfindingEnqueued(count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    this.pathfindingStats.enqueued += Math.floor(count);
  }

  recordPathfindingPendingDropped(count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    this.pathfindingStats.droppedPending += Math.floor(count);
  }

  recordPathfindingStaleResultDropped(count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    this.pathfindingStats.droppedStaleResults += Math.floor(count);
  }

  recordPathfindingDispatched(waitMs: number): void {
    this.pathfindingStats.dispatched += 1;
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      return;
    }
    this.pathfindingStats.totalQueueMs += waitMs;
    this.pathfindingStats.maxQueueMs = Math.max(this.pathfindingStats.maxQueueMs, waitMs);
  }

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

    const bucket = this.pathfindingStats.failureReasons.get(result.reason) ?? {
      reason: result.reason,
      label: this.getPathfindingFailureLabel(result.reason),
      count: 0,
    };
    bucket.count += 1;
    this.pathfindingStats.failureReasons.set(result.reason, bucket);
  }

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

  private buildPathfindingSnapshot() {
    const stats = this.pathfindingStats;
    const elapsedSec = Math.max(0, (Date.now() - stats.startedAt) / 1000);
    const completed = Math.max(0, stats.completed);
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
    const now = process.hrtime.bigint();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    const elapsedMicros = Number(now - this.lastCpuTime) / 1000;
    const cpuMicros = cpuUsage.user + cpuUsage.system;
    const tickWindowElapsedMs = Math.max(0, Number(now - this.lastCpuTime) / 1_000_000);
    const tickWindowElapsedSec = tickWindowElapsedMs / 1000;
    const tickWindowTotalMs = this.tickWindowTotalMs;
    const tickWindowCount = this.tickWindowCount;

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;
    this.tickWindowCount = 0;
    this.tickWindowTotalMs = 0;

    const cpuPercent = elapsedMicros > 0
      ? Math.max(0, Math.min(100, (cpuMicros / elapsedMicros) * 100))
      : 0;
    const cpuTotals = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const memoryMb = memoryUsage.rss / (1024 * 1024);
    const [loadAvg1m, loadAvg5m, loadAvg15m] = os.loadavg();
    const cpuProfileElapsedSec = Math.max(0, (Date.now() - this.cpuProfileStartedAt) / 1000);
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

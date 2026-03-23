/**
 * 性能监控服务：采集 CPU、内存、tick 耗时、网络流量统计
 */
import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { GmNetworkBucket, GmPerformanceSnapshot } from '@mud/shared';

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

@Injectable()
export class PerformanceService {
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = process.hrtime.bigint();
  private lastTickMs = 0;
  private cpuProfileStartedAt = Date.now();
  private networkStatsStartedAt = Date.now();
  private totalNetworkInBytes = 0;
  private totalNetworkOutBytes = 0;
  private readonly networkInBuckets = new Map<string, NetworkBucketCounter>();
  private readonly networkOutBuckets = new Map<string, NetworkBucketCounter>();
  private readonly cpuSections = new Map<string, CpuSectionCounter>();

  /** 记录单次 tick 耗时 */
  recordTick(elapsedMs: number) {
    this.lastTickMs = elapsedMs;
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
    this.cpuSections.clear();
  }

  /** 生成当前性能快照（CPU、内存、tick 耗时、网络统计） */
  getSnapshot(): GmPerformanceSnapshot {
    const now = process.hrtime.bigint();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    const elapsedMicros = Number(now - this.lastCpuTime) / 1000;
    const cpuMicros = cpuUsage.user + cpuUsage.system;

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;

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
      networkStatsStartedAt: this.networkStatsStartedAt,
      networkStatsElapsedSec: Number(networkStatsElapsedSec.toFixed(1)),
      networkInBytes: this.totalNetworkInBytes,
      networkOutBytes: this.totalNetworkOutBytes,
      networkInBuckets: this.buildBucketSnapshot(this.networkInBuckets),
      networkOutBuckets: this.buildBucketSnapshot(this.networkOutBuckets),
    };
  }
}

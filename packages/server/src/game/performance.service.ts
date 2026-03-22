/**
 * 性能监控服务：采集 CPU、内存、tick 耗时、网络流量统计
 */
import { Injectable } from '@nestjs/common';
import { GmNetworkBucket, GmPerformanceSnapshot } from '@mud/shared';

interface NetworkBucketCounter {
  label: string;
  bytes: number;
  count: number;
}

@Injectable()
export class PerformanceService {
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = process.hrtime.bigint();
  private lastTickMs = 0;
  private totalNetworkInBytes = 0;
  private totalNetworkOutBytes = 0;
  private readonly networkInBuckets = new Map<string, NetworkBucketCounter>();
  private readonly networkOutBuckets = new Map<string, NetworkBucketCounter>();

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
    const memoryMb = process.memoryUsage().rss / (1024 * 1024);

    return {
      cpuPercent: Number(cpuPercent.toFixed(1)),
      memoryMb: Number(memoryMb.toFixed(1)),
      tickMs: Number(this.lastTickMs.toFixed(1)),
      networkInBytes: this.totalNetworkInBytes,
      networkOutBytes: this.totalNetworkOutBytes,
      networkInBuckets: this.buildBucketSnapshot(this.networkInBuckets),
      networkOutBuckets: this.buildBucketSnapshot(this.networkOutBuckets),
    };
  }
}

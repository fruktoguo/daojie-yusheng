/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * 认证限流服务。
 * 基于内存滑动窗口实现 IP + 主体（账号名哈希）双维度限流，
 * 覆盖注册、登录、刷新和 GM 登录四个场景。
 */
import { createHash } from 'node:crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { resolveNativeRequestIp } from './native-request-ip';

/** 限流作用域：对应不同认证入口。 */
type RateLimitScope = 'register' | 'login' | 'refresh' | 'gmLogin';

/** 单个作用域的限流配置。 */
interface RateLimitConfig {
  /** 滑动窗口时长（毫秒）。 */
  windowMs: number;
  /** 触发封禁后的封禁时长（毫秒）。 */
  blockMs: number;
  /** 同一 IP 允许的最大失败次数。 */
  maxIpFailures: number;
  /** 同一主体允许的最大失败次数。 */
  maxSubjectFailures: number;
  /** 触发限流时返回的错误消息。 */
  message: string;
}

/** 单个限流桶的运行时状态。 */
interface RateLimitBucket {
  /** 当前窗口内累计失败次数。 */
  failures: number;
  /** 封禁截止时间戳（0 表示未封禁）。 */
  blockedUntil: number;
  /** 最后一次触碰时间戳，用于窗口过期判断。 */
  lastTouchedAt: number;
}

const RATE_LIMIT_CONFIG: Record<RateLimitScope, RateLimitConfig> = {
  register: { windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000, maxIpFailures: 8, maxSubjectFailures: 4, message: '注册尝试过于频繁，请稍后再试。' },
  login: { windowMs: 10 * 60 * 1000, blockMs: 30 * 1000, maxIpFailures: 12, maxSubjectFailures: 6, message: '登录尝试过于频繁，请稍后再试。' },
  refresh: { windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000, maxIpFailures: 20, maxSubjectFailures: 10, message: '刷新登录态过于频繁，请稍后再试。' },
  gmLogin: { windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000, maxIpFailures: 6, maxSubjectFailures: 4, message: 'GM 登录尝试过于频繁，请稍后再试。' },
};
const RATE_LIMIT_BUCKET_PRUNE_INTERVAL_MS = 60_000;
const RATE_LIMIT_BUCKET_MAX_COUNT = 50_000;
/** 认证限流服务：内存滑动窗口 + IP/主体双维度。 */
@Injectable()
export class NativeAuthRateLimitService {
  /** 所有限流桶，key 格式为 `scope:dimension:value`。 */
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastPrunedAt = 0;

  /** 检查当前请求是否已被封禁，被封禁时直接抛出 429。 */
  assertAllowed(scope: RateLimitScope, request: any, subject?: string): void {

    const config = RATE_LIMIT_CONFIG[scope];
    this.assertBucketAllowed(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config);
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.assertBucketAllowed(this.buildKey(scope, 'subject', normalizedSubject), config);
  }

  /** 登录/注册成功后清除对应失败计数。 */
  recordSuccess(scope: RateLimitScope, request: any, subject?: string): void {

    this.clearBucket(this.buildKey(scope, 'ip', this.resolveRequestIp(request)));
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.clearBucket(this.buildKey(scope, 'subject', normalizedSubject));
  }

  /** 登录/注册失败后累计 IP 和主体两个维度的失败计数。 */
  recordFailure(scope: RateLimitScope, request: any, subject?: string): void {

    const config = RATE_LIMIT_CONFIG[scope];
    this.registerFailure(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config.maxIpFailures, config);
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.registerFailure(this.buildKey(scope, 'subject', normalizedSubject), config.maxSubjectFailures, config);
  }

  /** 从请求头和 socket 信息中提取客户端 IP。 */
  private resolveRequestIp(request: any): string {
    return resolveNativeRequestIp(request, { fallback: 'unknown' }) || 'unknown';
  }  
  /** 检查指定桶是否处于封禁状态。 */
  private assertBucketAllowed(key: string, config: RateLimitConfig): void {

    const bucket = this.readBucket(key, config.windowMs);
    if (bucket.blockedUntil > Date.now()) throw new HttpException(config.message, HttpStatus.TOO_MANY_REQUESTS);
  }  
  /** 累计失败次数，达到阈值时设置封禁截止时间。 */
  private registerFailure(key: string, maxFailures: number, config: RateLimitConfig): void {

    const now = Date.now();
    this.pruneBuckets(now);
    const bucket = this.readBucket(key, config.windowMs);
    bucket.failures += 1;
    bucket.lastTouchedAt = now;
    if (bucket.failures >= maxFailures) bucket.blockedUntil = now + config.blockMs;
    this.buckets.set(key, bucket);
  }  
  /** 清除指定桶。 */
  private clearBucket(key: string): void {
    this.buckets.delete(key);
  }  
  /** 读取桶状态，窗口过期时自动重置。 */
  private readBucket(key: string, windowMs: number): RateLimitBucket {

    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current) return { failures: 0, blockedUntil: 0, lastTouchedAt: now };
    if (current.blockedUntil <= now && now - current.lastTouchedAt >= windowMs) {
      this.buckets.delete(key);
      return { failures: 0, blockedUntil: 0, lastTouchedAt: now };
    }
    current.lastTouchedAt = now;
    return current;
  }  
  /** 周期清理过期桶并在异常高基数下按最旧访问裁剪。 */
  private pruneBuckets(now: number): void {
    if (now - this.lastPrunedAt < RATE_LIMIT_BUCKET_PRUNE_INTERVAL_MS && this.buckets.size <= RATE_LIMIT_BUCKET_MAX_COUNT) {
      return;
    }
    this.lastPrunedAt = now;
    for (const [key, bucket] of this.buckets) {
      const scope = key.split(':', 1)[0] as RateLimitScope;
      const config = RATE_LIMIT_CONFIG[scope];
      if (!config) {
        this.buckets.delete(key);
        continue;
      }
      if (bucket.blockedUntil <= now && now - bucket.lastTouchedAt >= config.windowMs) {
        this.buckets.delete(key);
      }
    }
    if (this.buckets.size <= RATE_LIMIT_BUCKET_MAX_COUNT) {
      return;
    }
    const overflow = this.buckets.size - RATE_LIMIT_BUCKET_MAX_COUNT;
    // 改单遍 K-max-heap：在 N 条 entry 中筛出 lastTouchedAt 最旧的 K=overflow 条，
    // 时间复杂度 O(N log K)，避免 N=50k 时 sort+slice 的 O(N log N)（~10-30ms 阻塞）。
    const oldestKeys = selectOldestBucketKeys(this.buckets, overflow);
    for (const key of oldestKeys) {
      this.buckets.delete(key);
    }
  }
  /** 构建桶的唯一 key：`scope:dimension:value`。 */
  private buildKey(scope: RateLimitScope, dimension: 'ip' | 'subject', value: string): string {
    return `${scope}:${dimension}:${value}`;
  }  
  /** 将主体标识规范化并截断哈希，避免存储原始账号名。 */
  private normalizeSubject(subject?: string): string {

    const normalized = typeof subject === 'string' ? subject.trim().toLowerCase() : '';
    if (!normalized) return '';
    return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  }
}

/**
 * 单遍 K-max-heap：返回 buckets 中 lastTouchedAt 最旧的 keepCount 个 key。
 * 时间复杂度 O(N log K)，N=buckets.size、K=keepCount。
 * 当 K 远小于 N 时（典型场景：overflow ≪ 50000）相比 sort+slice 的 O(N log N) 更省 CPU。
 *
 * 使用 max-heap 保留当前最旧的 K 条 lastTouchedAt：堆顶是这 K 条里最新的一条；
 * 遍历到下一条 entry 时如果比堆顶更旧，就 pop 堆顶 push 新条目。
 */
function selectOldestBucketKeys(buckets: Map<string, RateLimitBucket>, keepCount: number): string[] {
  if (keepCount <= 0 || buckets.size === 0) {
    return [];
  }
  if (keepCount >= buckets.size) {
    // 等价于全部 evict，避免无意义的堆维护成本。
    return Array.from(buckets.keys());
  }
  const heap: { key: string; touchedAt: number }[] = [];
  for (const [key, bucket] of buckets) {
    const touchedAt = bucket.lastTouchedAt;
    if (heap.length < keepCount) {
      heap.push({ key, touchedAt });
      siftHeapUp(heap, heap.length - 1);
      continue;
    }
    if (touchedAt < heap[0].touchedAt) {
      heap[0] = { key, touchedAt };
      siftHeapDown(heap, 0);
    }
  }
  return heap.map((entry) => entry.key);
}

/** max-heap 上移，保持堆顶为最大 touchedAt（即"K 条最旧条目"中最不旧的那条）。 */
function siftHeapUp(heap: { key: string; touchedAt: number }[], startIndex: number): void {
  let index = startIndex;
  while (index > 0) {
    const parentIndex = (index - 1) >>> 1;
    if (heap[parentIndex].touchedAt >= heap[index].touchedAt) {
      return;
    }
    const tmp = heap[parentIndex];
    heap[parentIndex] = heap[index];
    heap[index] = tmp;
    index = parentIndex;
  }
}

/** max-heap 下移，根据子节点选择更大的 touchedAt 维持堆性质。 */
function siftHeapDown(heap: { key: string; touchedAt: number }[], startIndex: number): void {
  const length = heap.length;
  let index = startIndex;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let largestIndex = index;
    if (leftIndex < length && heap[leftIndex].touchedAt > heap[largestIndex].touchedAt) {
      largestIndex = leftIndex;
    }
    if (rightIndex < length && heap[rightIndex].touchedAt > heap[largestIndex].touchedAt) {
      largestIndex = rightIndex;
    }
    if (largestIndex === index) {
      return;
    }
    const tmp = heap[largestIndex];
    heap[largestIndex] = heap[index];
    heap[index] = tmp;
    index = largestIndex;
  }
}

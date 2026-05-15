/**
 * 认证限流服务。
 * 基于内存滑动窗口实现 IP + 主体（账号名哈希）双维度限流，
 * 覆盖注册、登录、刷新和 GM 登录四个场景。
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

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
/** 认证限流服务：内存滑动窗口 + IP/主体双维度。 */
@Injectable()
export class NativeAuthRateLimitService {
  /** 所有限流桶，key 格式为 `scope:dimension:value`。 */
  private readonly buckets = new Map<string, RateLimitBucket>();

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

    const forwardedFor = request?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) return forwardedFor.split(',')[0]?.trim() || 'unknown';
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) return String(forwardedFor[0] ?? '').trim() || 'unknown';
    const candidates = [request?.ip, request?.socket?.remoteAddress, request?.connection?.remoteAddress];
    for (const value of candidates) if (typeof value === 'string' && value.trim()) return value.trim();
    return 'unknown';
  }  
  /** 检查指定桶是否处于封禁状态。 */
  private assertBucketAllowed(key: string, config: RateLimitConfig): void {

    const bucket = this.readBucket(key, config.windowMs);
    if (bucket.blockedUntil > Date.now()) throw new HttpException(config.message, HttpStatus.TOO_MANY_REQUESTS);
  }  
  /** 累计失败次数，达到阈值时设置封禁截止时间。 */
  private registerFailure(key: string, maxFailures: number, config: RateLimitConfig): void {

    const now = Date.now();
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

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

type RateLimitScope = 'register' | 'login' | 'refresh' | 'gmLogin';

interface RateLimitConfig {
  windowMs: number;
  blockMs: number;
  maxIpFailures: number;
  maxSubjectFailures: number;
  message: string;
}

interface RateLimitBucket {
  failures: number;
  blockedUntil: number;
  lastTouchedAt: number;
}

const RATE_LIMIT_CONFIG: Record<RateLimitScope, RateLimitConfig> = {
  register: { windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000, maxIpFailures: 8, maxSubjectFailures: 4, message: '注册尝试过于频繁，请稍后再试。' },
  login: { windowMs: 10 * 60 * 1000, blockMs: 20 * 60 * 1000, maxIpFailures: 12, maxSubjectFailures: 6, message: '登录尝试过于频繁，请稍后再试。' },
  refresh: { windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000, maxIpFailures: 20, maxSubjectFailures: 10, message: '刷新登录态过于频繁，请稍后再试。' },
  gmLogin: { windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000, maxIpFailures: 6, maxSubjectFailures: 4, message: 'GM 登录尝试过于频繁，请稍后再试。' },
};

@Injectable()
export class NextAuthRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();

  /** 进入业务前先检查当前请求是否已处于封禁窗口。 */
  assertAllowed(scope: RateLimitScope, request: any, subject?: string): void {
    const config = RATE_LIMIT_CONFIG[scope];
    this.assertBucketAllowed(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config);
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.assertBucketAllowed(this.buildKey(scope, 'subject', normalizedSubject), config);
  }

  /** 登录/注册成功后清掉对应失败窗口，避免把成功会话也卡住。 */
  recordSuccess(scope: RateLimitScope, request: any, subject?: string): void {
    this.clearBucket(this.buildKey(scope, 'ip', this.resolveRequestIp(request)));
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.clearBucket(this.buildKey(scope, 'subject', normalizedSubject));
  }

  /** 登录/注册失败后同时累计 IP 与账号/主体两个维度。 */
  recordFailure(scope: RateLimitScope, request: any, subject?: string): void {
    const config = RATE_LIMIT_CONFIG[scope];
    this.registerFailure(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config.maxIpFailures, config);
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.registerFailure(this.buildKey(scope, 'subject', normalizedSubject), config.maxSubjectFailures, config);
  }

  /** 从反向代理头和 socket 信息里提取客户端地址。 */
  private resolveRequestIp(request: any): string {
    const forwardedFor = request?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) return forwardedFor.split(',')[0]?.trim() || 'unknown';
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) return String(forwardedFor[0] ?? '').trim() || 'unknown';
    const candidates = [request?.ip, request?.socket?.remoteAddress, request?.connection?.remoteAddress];
    for (const value of candidates) if (typeof value === 'string' && value.trim()) return value.trim();
    return 'unknown';
  }

  private assertBucketAllowed(key: string, config: RateLimitConfig): void {
    const bucket = this.readBucket(key, config.windowMs);
    if (bucket.blockedUntil > Date.now()) throw new HttpException(config.message, HttpStatus.TOO_MANY_REQUESTS);
  }

  private registerFailure(key: string, maxFailures: number, config: RateLimitConfig): void {
    const now = Date.now();
    const bucket = this.readBucket(key, config.windowMs);
    bucket.failures += 1;
    bucket.lastTouchedAt = now;
    if (bucket.failures >= maxFailures) bucket.blockedUntil = now + config.blockMs;
    this.buckets.set(key, bucket);
  }

  private clearBucket(key: string): void {
    this.buckets.delete(key);
  }

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

  private buildKey(scope: RateLimitScope, dimension: 'ip' | 'subject', value: string): string {
    return `${scope}:${dimension}:${value}`;
  }

  private normalizeSubject(subject?: string): string {
    const normalized = typeof subject === 'string' ? subject.trim().toLowerCase() : '';
    if (!normalized) return '';
    return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  }
}

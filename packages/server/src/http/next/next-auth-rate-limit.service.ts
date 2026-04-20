import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
/**
 * RateLimitScope：统一结构类型，保证协议与运行时一致性。
 */


type RateLimitScope = 'register' | 'login' | 'refresh' | 'gmLogin';
/**
 * RateLimitConfig：定义接口结构约束，明确可交付字段含义。
 */


interface RateLimitConfig {
/**
 * windowMs：窗口M相关字段。
 */

  windowMs: number;  
  /**
 * blockMs：blockM相关字段。
 */

  blockMs: number;  
  /**
 * maxIpFailures：maxIpFailure相关字段。
 */

  maxIpFailures: number;  
  /**
 * maxSubjectFailures：maxSubjectFailure相关字段。
 */

  maxSubjectFailures: number;  
  /**
 * message：message相关字段。
 */

  message: string;
}
/**
 * RateLimitBucket：定义接口结构约束，明确可交付字段含义。
 */


interface RateLimitBucket {
/**
 * failures：failure相关字段。
 */

  failures: number;  
  /**
 * blockedUntil：blockedUntil相关字段。
 */

  blockedUntil: number;  
  /**
 * lastTouchedAt：lastTouchedAt相关字段。
 */

  lastTouchedAt: number;
}

const RATE_LIMIT_CONFIG: Record<RateLimitScope, RateLimitConfig> = {
  register: { windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000, maxIpFailures: 8, maxSubjectFailures: 4, message: '注册尝试过于频繁，请稍后再试。' },
  login: { windowMs: 10 * 60 * 1000, blockMs: 20 * 60 * 1000, maxIpFailures: 12, maxSubjectFailures: 6, message: '登录尝试过于频繁，请稍后再试。' },
  refresh: { windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000, maxIpFailures: 20, maxSubjectFailures: 10, message: '刷新登录态过于频繁，请稍后再试。' },
  gmLogin: { windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000, maxIpFailures: 6, maxSubjectFailures: 4, message: 'GM 登录尝试过于频繁，请稍后再试。' },
};
/**
 * NextAuthRateLimitService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NextAuthRateLimitService {
/**
 * buckets：bucket相关字段。
 */

  private readonly buckets = new Map<string, RateLimitBucket>();

  /** 进入业务前先检查当前请求是否已处于封禁窗口。 */
  assertAllowed(scope: RateLimitScope, request: any, subject?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const config = RATE_LIMIT_CONFIG[scope];
    this.assertBucketAllowed(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config);
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.assertBucketAllowed(this.buildKey(scope, 'subject', normalizedSubject), config);
  }

  /** 登录/注册成功后清掉对应失败窗口，避免把成功会话也卡住。 */
  recordSuccess(scope: RateLimitScope, request: any, subject?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.clearBucket(this.buildKey(scope, 'ip', this.resolveRequestIp(request)));
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.clearBucket(this.buildKey(scope, 'subject', normalizedSubject));
  }

  /** 登录/注册失败后同时累计 IP 与账号/主体两个维度。 */
  recordFailure(scope: RateLimitScope, request: any, subject?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const config = RATE_LIMIT_CONFIG[scope];
    this.registerFailure(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config.maxIpFailures, config);
    const normalizedSubject = this.normalizeSubject(subject);
    if (normalizedSubject) this.registerFailure(this.buildKey(scope, 'subject', normalizedSubject), config.maxSubjectFailures, config);
  }

  /** 从反向代理头和 socket 信息里提取客户端地址。 */
  private resolveRequestIp(request: any): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const forwardedFor = request?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) return forwardedFor.split(',')[0]?.trim() || 'unknown';
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) return String(forwardedFor[0] ?? '').trim() || 'unknown';
    const candidates = [request?.ip, request?.socket?.remoteAddress, request?.connection?.remoteAddress];
    for (const value of candidates) if (typeof value === 'string' && value.trim()) return value.trim();
    return 'unknown';
  }  
  /**
 * assertBucketAllowed：执行assertBucketAllowed相关逻辑。
 * @param key string 参数说明。
 * @param config RateLimitConfig 参数说明。
 * @returns 无返回值，直接更新assertBucketAllowed相关状态。
 */


  private assertBucketAllowed(key: string, config: RateLimitConfig): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const bucket = this.readBucket(key, config.windowMs);
    if (bucket.blockedUntil > Date.now()) throw new HttpException(config.message, HttpStatus.TOO_MANY_REQUESTS);
  }  
  /**
 * registerFailure：判断registerFailure是否满足条件。
 * @param key string 参数说明。
 * @param maxFailures number 参数说明。
 * @param config RateLimitConfig 参数说明。
 * @returns 无返回值，直接更新registerFailure相关状态。
 */


  private registerFailure(key: string, maxFailures: number, config: RateLimitConfig): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const now = Date.now();
    const bucket = this.readBucket(key, config.windowMs);
    bucket.failures += 1;
    bucket.lastTouchedAt = now;
    if (bucket.failures >= maxFailures) bucket.blockedUntil = now + config.blockMs;
    this.buckets.set(key, bucket);
  }  
  /**
 * clearBucket：执行clearBucket相关逻辑。
 * @param key string 参数说明。
 * @returns 无返回值，直接更新clearBucket相关状态。
 */


  private clearBucket(key: string): void {
    this.buckets.delete(key);
  }  
  /**
 * readBucket：读取Bucket并返回结果。
 * @param key string 参数说明。
 * @param windowMs number 参数说明。
 * @returns 返回Bucket。
 */


  private readBucket(key: string, windowMs: number): RateLimitBucket {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * buildKey：构建并返回目标对象。
 * @param scope RateLimitScope 参数说明。
 * @param dimension 'ip' | 'subject' 参数说明。
 * @param value string 参数说明。
 * @returns 返回Key。
 */


  private buildKey(scope: RateLimitScope, dimension: 'ip' | 'subject', value: string): string {
    return `${scope}:${dimension}:${value}`;
  }  
  /**
 * normalizeSubject：规范化或转换Subject。
 * @param subject string 参数说明。
 * @returns 返回Subject。
 */


  private normalizeSubject(subject?: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof subject === 'string' ? subject.trim().toLowerCase() : '';
    if (!normalized) return '';
    return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  }
}

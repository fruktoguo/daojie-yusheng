"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextAuthRateLimitService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const RATE_LIMIT_CONFIG = {
    register: {
        windowMs: 10 * 60 * 1000,
        blockMs: 30 * 60 * 1000,
        maxIpFailures: 8,
        maxSubjectFailures: 4,
        message: '注册尝试过于频繁，请稍后再试。',
    },
    login: {
        windowMs: 10 * 60 * 1000,
        blockMs: 20 * 60 * 1000,
        maxIpFailures: 12,
        maxSubjectFailures: 6,
        message: '登录尝试过于频繁，请稍后再试。',
    },
    refresh: {
        windowMs: 10 * 60 * 1000,
        blockMs: 15 * 60 * 1000,
        maxIpFailures: 20,
        maxSubjectFailures: 10,
        message: '刷新登录态过于频繁，请稍后再试。',
    },
    gmLogin: {
        windowMs: 15 * 60 * 1000,
        blockMs: 30 * 60 * 1000,
        maxIpFailures: 6,
        maxSubjectFailures: 4,
        message: 'GM 登录尝试过于频繁，请稍后再试。',
    },
};
let NextAuthRateLimitService = class NextAuthRateLimitService {
    buckets = new Map();
    /** 进入业务前先检查当前请求是否已处于封禁窗口。 */
    assertAllowed(scope, request, subject) {
        const config = RATE_LIMIT_CONFIG[scope];
        this.assertBucketAllowed(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config);
        const normalizedSubject = this.normalizeSubject(subject);
        if (normalizedSubject) {
            this.assertBucketAllowed(this.buildKey(scope, 'subject', normalizedSubject), config);
        }
    }
    /** 登录/注册成功后清掉对应失败窗口，避免把成功会话也卡住。 */
    recordSuccess(scope, request, subject) {
        this.clearBucket(this.buildKey(scope, 'ip', this.resolveRequestIp(request)));
        const normalizedSubject = this.normalizeSubject(subject);
        if (normalizedSubject) {
            this.clearBucket(this.buildKey(scope, 'subject', normalizedSubject));
        }
    }
    /** 登录/注册失败后同时累计 IP 与账号/主体两个维度。 */
    recordFailure(scope, request, subject) {
        const config = RATE_LIMIT_CONFIG[scope];
        this.registerFailure(this.buildKey(scope, 'ip', this.resolveRequestIp(request)), config.maxIpFailures, config);
        const normalizedSubject = this.normalizeSubject(subject);
        if (normalizedSubject) {
            this.registerFailure(this.buildKey(scope, 'subject', normalizedSubject), config.maxSubjectFailures, config);
        }
    }
    /** 从反向代理头和 socket 信息里提取客户端地址。 */
    resolveRequestIp(request) {
        const forwardedFor = request?.headers?.['x-forwarded-for'];
        if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
            return forwardedFor.split(',')[0]?.trim() || 'unknown';
        }
        if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
            return String(forwardedFor[0] ?? '').trim() || 'unknown';
        }
        const candidates = [
            request?.ip,
            request?.socket?.remoteAddress,
            request?.connection?.remoteAddress,
        ];
        for (const value of candidates) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return 'unknown';
    }
    assertBucketAllowed(key, config) {
        const bucket = this.readBucket(key, config.windowMs);
        if (bucket.blockedUntil > Date.now()) {
            throw new common_1.HttpException(config.message, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    registerFailure(key, maxFailures, config) {
        const now = Date.now();
        const bucket = this.readBucket(key, config.windowMs);
        bucket.failures += 1;
        bucket.lastTouchedAt = now;
        if (bucket.failures >= maxFailures) {
            bucket.blockedUntil = now + config.blockMs;
        }
        this.buckets.set(key, bucket);
    }
    clearBucket(key) {
        this.buckets.delete(key);
    }
    readBucket(key, windowMs) {
        const now = Date.now();
        const current = this.buckets.get(key);
        if (!current) {
            return {
                failures: 0,
                blockedUntil: 0,
                lastTouchedAt: now,
            };
        }
        if (current.blockedUntil <= now && now - current.lastTouchedAt >= windowMs) {
            this.buckets.delete(key);
            return {
                failures: 0,
                blockedUntil: 0,
                lastTouchedAt: now,
            };
        }
        current.lastTouchedAt = now;
        return current;
    }
    buildKey(scope, dimension, value) {
        return `${scope}:${dimension}:${value}`;
    }
    normalizeSubject(subject) {
        const normalized = typeof subject === 'string' ? subject.trim().toLowerCase() : '';
        if (!normalized) {
            return '';
        }
        return (0, node_crypto_1.createHash)('sha256').update(normalized).digest('hex').slice(0, 24);
    }
};
exports.NextAuthRateLimitService = NextAuthRateLimitService;
exports.NextAuthRateLimitService = NextAuthRateLimitService = __decorate([
    (0, common_1.Injectable)()
], NextAuthRateLimitService);

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldLegacyJwtService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
/**
 * Legacy JWT（JSON Web Token）服务
 *
 * 负责验证Legacy系统的JWT令牌，支持HS256签名算法
 */
let WorldLegacyJwtService = class WorldLegacyJwtService {
    /** JWT密钥，从环境变量读取，默认为开发环境密钥 */
    jwtSecret = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';
    /**
     * 验证JWT令牌载荷
     * @param token JWT令牌
     * @returns 验证结果，包含载荷和失败原因
     */
    validateTokenPayload(token) {
        const segments = token.split('.');
        if (segments.length !== 3) {
            return { payload: null, reason: 'malformed_segments' };
        }
        const [encodedHeader, encodedPayload, encodedSignature] = segments;
        const header = parseJwtSegment(encodedHeader);
        const payload = parseJwtSegment(encodedPayload);
        if (!header || !payload) {
            return { payload: null, reason: 'invalid_json_segment' };
        }
        if (header.alg !== 'HS256' || header.typ !== 'JWT') {
            return { payload: null, reason: 'invalid_header' };
        }
        const expectedSignature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', this.jwtSecret)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest());
        const left = Buffer.from(encodedSignature);
        const right = Buffer.from(expectedSignature);
        if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right)) {
            return { payload: null, reason: 'invalid_signature' };
        }
        const now = Math.floor(Date.now() / 1000);
        if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp < now) {
            return { payload: null, reason: 'expired' };
        }
        if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now) {
            return { payload: null, reason: 'not_yet_valid' };
        }
        return { payload, reason: null };
    }
};
exports.WorldLegacyJwtService = WorldLegacyJwtService;
exports.WorldLegacyJwtService = WorldLegacyJwtService = __decorate([
    (0, common_1.Injectable)()
], WorldLegacyJwtService);
/**
 * 解析JWT分段
 * @param segment JWT分段字符串
 * @returns 解析后的对象，失败返回null
 */
function parseJwtSegment(segment) {
    try {
        const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');
        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
}
/**
 * Base64 URL安全解码
 * @param value Base64 URL编码的字符串
 * @returns 标准Base64编码的字符串
 */
function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
/**
 * Base64 URL安全编码
 * @param value Buffer对象
 * @returns Base64 URL编码的字符串
 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

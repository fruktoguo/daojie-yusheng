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
// TODO(next:T24): 当玩家 token 真源彻底不再依赖 legacy JWT 后，删除这个兼容验签服务与 JWT_SECRET 回退口径。

/** 兼容 legacy JWT 的验证服务，用于 legacy 鉴权流程回传 payload。 */
let WorldLegacyJwtService = class WorldLegacyJwtService {
    jwtSecret = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';

    /** 校验 token 头部/载荷/签名及时效，返回详细失败原因。 */
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
function base64UrlDecode(value) {

    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');

    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}


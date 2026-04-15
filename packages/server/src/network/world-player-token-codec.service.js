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
exports.WorldPlayerTokenCodecService = void 0;

const common_1 = require("@nestjs/common");

const node_crypto_1 = require("node:crypto");

const player_token_verify_1 = require("../auth/player-token-verify");

const ACCESS_KIND = 'access';

const REFRESH_KIND = 'refresh';

const ACCESS_EXPIRES_FALLBACK_SECONDS = 15 * 60;

const REFRESH_EXPIRES_FALLBACK_SECONDS = 30 * 24 * 60 * 60;

const NEXT_TOKEN_ISSUER = 'server-next';

const NEXT_TOKEN_VERSION = 1;

const PLAYER_TOKEN_SECRET_ENV_KEYS = [
    'SERVER_NEXT_PLAYER_TOKEN_SECRET',
    'NEXT_PLAYER_TOKEN_SECRET',
    'JWT_SECRET',
];

/** 玩家令牌编解码服务：负责签发和验证 next 访问/刷新令牌。 */
let WorldPlayerTokenCodecService = class WorldPlayerTokenCodecService {
    /** 读取到的可用签名密钥列表。 */
    secrets;
    /** 当前签名主密钥。 */
    signingSecret;
    constructor() {
        this.secrets = resolvePlayerTokenSecrets();
        this.signingSecret = this.secrets[0] ?? 'daojie-yusheng-dev-secret';
    }
    /** 校验访问令牌。 */
    validateAccessToken(token) {
        return this.validateToken(token, ACCESS_KIND);
    }
    /** 校验刷新令牌。 */
    validateRefreshToken(token) {
        return this.validateToken(token, REFRESH_KIND);
    }
    /** 签发访问令牌。 */
    issueAccessToken(payload) {
        return this.issueToken(payload, ACCESS_KIND, readPositiveIntEnv('SERVER_NEXT_AUTH_ACCESS_TOKEN_EXPIRES_IN', ACCESS_EXPIRES_FALLBACK_SECONDS));
    }
    /** 签发刷新令牌。 */
    issueRefreshToken(payload) {
        return this.issueToken(payload, REFRESH_KIND, readPositiveIntEnv('SERVER_NEXT_AUTH_REFRESH_TOKEN_EXPIRES_IN', REFRESH_EXPIRES_FALLBACK_SECONDS));
    }
    /** 验证令牌签名和载荷类型。 */
    validateToken(token, expectedKind) {

        const normalizedToken = typeof token === 'string' ? token.trim() : '';
        if (!normalizedToken) {
            return null;
        }
        for (const secret of this.secrets) {
            const result = (0, player_token_verify_1.verifyPlayerTokenPayloadDetailed)(normalizedToken, secret);
            const payload = normalizeValidatedPayload(result?.payload, expectedKind);
            if (payload) {
                return payload;
            }
        }
        return null;
    }
    /** 生成带签名的 JWT 字符串。 */
    issueToken(payload, kind, expiresInSeconds) {

        const normalizedSub = String(payload?.sub ?? '').trim();

        const normalizedUsername = String(payload?.username ?? '').trim();
        if (!normalizedSub || !normalizedUsername) {
            throw new Error('player token payload missing sub or username');
        }

        const normalizedDisplayName = normalizeOptionalString(payload?.displayName);

        const normalizedPlayerId = normalizeOptionalString(payload?.playerId);

        const normalizedPlayerName = normalizeOptionalString(payload?.playerName);

        const now = Math.floor(Date.now() / 1000);

        const header = base64UrlEncode(Buffer.from(JSON.stringify({
            alg: 'HS256',
            typ: 'JWT',
        }), 'utf8'));

        const body = base64UrlEncode(Buffer.from(JSON.stringify({
            iss: NEXT_TOKEN_ISSUER,
            aud: 'player',
            ver: NEXT_TOKEN_VERSION,
            kind,
            scope: kind,
            sub: normalizedSub,
            username: normalizedUsername,
            ...(normalizedDisplayName ? { displayName: normalizedDisplayName } : {}),
            ...(normalizedPlayerId ? { playerId: normalizedPlayerId } : {}),
            ...(normalizedPlayerName ? { playerName: normalizedPlayerName } : {}),
            iat: now,
            nbf: now,
            exp: now + Math.max(60, Math.trunc(expiresInSeconds)),
        }), 'utf8'));

        const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', this.signingSecret)
            .update(`${header}.${body}`)
            .digest());
        return `${header}.${body}.${signature}`;
    }
};
exports.WorldPlayerTokenCodecService = WorldPlayerTokenCodecService;
exports.WorldPlayerTokenCodecService = WorldPlayerTokenCodecService = __decorate([
    (0, common_1.Injectable)()
], WorldPlayerTokenCodecService);
function resolvePlayerTokenSecrets() {

    const secrets = [];
    for (const key of PLAYER_TOKEN_SECRET_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
        if (value && !secrets.includes(value)) {
            secrets.push(value);
        }
    }
    if (secrets.length === 0) {
        secrets.push('daojie-yusheng-dev-secret');
    }
    return secrets;
}
function normalizeValidatedPayload(payload, expectedKind) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    if (payload.role === 'gm') {
        return null;
    }

    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    if (!sub || !username) {
        return null;
    }

    const issuer = normalizeOptionalString(payload.iss);
    if (issuer && issuer !== NEXT_TOKEN_ISSUER) {
        return null;
    }

    const version = payload.ver;
    if (version !== undefined && Math.trunc(Number(version)) !== NEXT_TOKEN_VERSION) {
        return null;
    }

    const kind = normalizeTokenKind(payload.kind, payload.scope);
    if (expectedKind === ACCESS_KIND && kind === REFRESH_KIND) {
        return null;
    }
    if (expectedKind === REFRESH_KIND && kind !== REFRESH_KIND) {
        return null;
    }
    return payload;
}
function normalizeTokenKind(kindValue, scopeValue) {

    const kind = typeof kindValue === 'string' ? kindValue.trim().toLowerCase() : '';
    if (kind === ACCESS_KIND || kind === REFRESH_KIND) {
        return kind;
    }

    const scope = typeof scopeValue === 'string' ? scopeValue.trim().toLowerCase() : '';
    if (scope === REFRESH_KIND) {
        return REFRESH_KIND;
    }
    return ACCESS_KIND;
}
function normalizeOptionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
function readPositiveIntEnv(name, fallback) {

    const raw = Number(process.env[name] ?? Number.NaN);
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}



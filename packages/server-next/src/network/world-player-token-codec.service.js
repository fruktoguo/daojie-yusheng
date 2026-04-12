"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
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
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** world_player_token_compat_1：定义该变量以承载业务值。 */
const world_player_token_compat_1 = require("./world-player-token-compat");
/** ACCESS_KIND：定义该变量以承载业务值。 */
const ACCESS_KIND = 'access';
/** REFRESH_KIND：定义该变量以承载业务值。 */
const REFRESH_KIND = 'refresh';
/** ACCESS_EXPIRES_FALLBACK_SECONDS：定义该变量以承载业务值。 */
const ACCESS_EXPIRES_FALLBACK_SECONDS = 15 * 60;
/** REFRESH_EXPIRES_FALLBACK_SECONDS：定义该变量以承载业务值。 */
const REFRESH_EXPIRES_FALLBACK_SECONDS = 30 * 24 * 60 * 60;
/** NEXT_TOKEN_ISSUER：定义该变量以承载业务值。 */
const NEXT_TOKEN_ISSUER = 'server-next';
/** NEXT_TOKEN_VERSION：定义该变量以承载业务值。 */
const NEXT_TOKEN_VERSION = 1;
/** PLAYER_TOKEN_SECRET_ENV_KEYS：定义该变量以承载业务值。 */
const PLAYER_TOKEN_SECRET_ENV_KEYS = [
    'SERVER_NEXT_PLAYER_TOKEN_SECRET',
    'NEXT_PLAYER_TOKEN_SECRET',
    'JWT_SECRET',
];
/** WorldPlayerTokenCodecService：定义该变量以承载业务值。 */
let WorldPlayerTokenCodecService = class WorldPlayerTokenCodecService {
    secrets;
    signingSecret;
/** 构造函数：执行实例初始化流程。 */
    constructor() {
        this.secrets = resolvePlayerTokenSecrets();
        this.signingSecret = this.secrets[0] ?? 'daojie-yusheng-dev-secret';
    }
/** validateAccessToken：执行对应的业务逻辑。 */
    validateAccessToken(token) {
        return this.validateToken(token, ACCESS_KIND);
    }
/** validateRefreshToken：执行对应的业务逻辑。 */
    validateRefreshToken(token) {
        return this.validateToken(token, REFRESH_KIND);
    }
/** issueAccessToken：执行对应的业务逻辑。 */
    issueAccessToken(payload) {
        return this.issueToken(payload, ACCESS_KIND, readPositiveIntEnv('SERVER_NEXT_AUTH_ACCESS_TOKEN_EXPIRES_IN', ACCESS_EXPIRES_FALLBACK_SECONDS));
    }
/** issueRefreshToken：执行对应的业务逻辑。 */
    issueRefreshToken(payload) {
        return this.issueToken(payload, REFRESH_KIND, readPositiveIntEnv('SERVER_NEXT_AUTH_REFRESH_TOKEN_EXPIRES_IN', REFRESH_EXPIRES_FALLBACK_SECONDS));
    }
/** validateToken：执行对应的业务逻辑。 */
    validateToken(token, expectedKind) {
/** normalizedToken：定义该变量以承载业务值。 */
        const normalizedToken = typeof token === 'string' ? token.trim() : '';
        if (!normalizedToken) {
            return null;
        }
        for (const secret of this.secrets) {
            const result = (0, world_player_token_compat_1.verifyPlayerTokenPayloadDetailed)(normalizedToken, secret);
            const payload = normalizeValidatedPayload(result?.payload, expectedKind);
            if (payload) {
                return payload;
            }
        }
        return null;
    }
/** issueToken：执行对应的业务逻辑。 */
    issueToken(payload, kind, expiresInSeconds) {
/** normalizedSub：定义该变量以承载业务值。 */
        const normalizedSub = String(payload?.sub ?? '').trim();
/** normalizedUsername：定义该变量以承载业务值。 */
        const normalizedUsername = String(payload?.username ?? '').trim();
        if (!normalizedSub || !normalizedUsername) {
            throw new Error('player token payload missing sub or username');
        }
/** normalizedDisplayName：定义该变量以承载业务值。 */
        const normalizedDisplayName = normalizeOptionalString(payload?.displayName);
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = normalizeOptionalString(payload?.playerId);
/** normalizedPlayerName：定义该变量以承载业务值。 */
        const normalizedPlayerName = normalizeOptionalString(payload?.playerName);
/** now：定义该变量以承载业务值。 */
        const now = Math.floor(Date.now() / 1000);
/** header：定义该变量以承载业务值。 */
        const header = base64UrlEncode(Buffer.from(JSON.stringify({
            alg: 'HS256',
            typ: 'JWT',
        }), 'utf8'));
/** body：定义该变量以承载业务值。 */
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
/** signature：定义该变量以承载业务值。 */
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
/** resolvePlayerTokenSecrets：执行对应的业务逻辑。 */
function resolvePlayerTokenSecrets() {
/** secrets：定义该变量以承载业务值。 */
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
/** normalizeValidatedPayload：执行对应的业务逻辑。 */
function normalizeValidatedPayload(payload, expectedKind) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    if (payload.role === 'gm') {
        return null;
    }
/** sub：定义该变量以承载业务值。 */
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
/** username：定义该变量以承载业务值。 */
    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    if (!sub || !username) {
        return null;
    }
/** issuer：定义该变量以承载业务值。 */
    const issuer = normalizeOptionalString(payload.iss);
    if (issuer && issuer !== NEXT_TOKEN_ISSUER) {
        return null;
    }
/** version：定义该变量以承载业务值。 */
    const version = payload.ver;
    if (version !== undefined && Math.trunc(Number(version)) !== NEXT_TOKEN_VERSION) {
        return null;
    }
/** kind：定义该变量以承载业务值。 */
    const kind = normalizeTokenKind(payload.kind, payload.scope);
    if (expectedKind === ACCESS_KIND && kind === REFRESH_KIND) {
        return null;
    }
    if (expectedKind === REFRESH_KIND && kind !== REFRESH_KIND) {
        return null;
    }
    return payload;
}
/** normalizeTokenKind：执行对应的业务逻辑。 */
function normalizeTokenKind(kindValue, scopeValue) {
/** kind：定义该变量以承载业务值。 */
    const kind = typeof kindValue === 'string' ? kindValue.trim().toLowerCase() : '';
    if (kind === ACCESS_KIND || kind === REFRESH_KIND) {
        return kind;
    }
/** scope：定义该变量以承载业务值。 */
    const scope = typeof scopeValue === 'string' ? scopeValue.trim().toLowerCase() : '';
    if (scope === REFRESH_KIND) {
        return REFRESH_KIND;
    }
    return ACCESS_KIND;
}
/** normalizeOptionalString：执行对应的业务逻辑。 */
function normalizeOptionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
/** readPositiveIntEnv：执行对应的业务逻辑。 */
function readPositiveIntEnv(name, fallback) {
/** raw：定义该变量以承载业务值。 */
    const raw = Number(process.env[name] ?? Number.NaN);
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}
/** base64UrlEncode：执行对应的业务逻辑。 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

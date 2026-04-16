"use strict";
/**
 * 用途：为 smoke 脚本生成玩家身份与访问令牌。
 */
// TODO(next:T25): 在 player token 真源和验收口径彻底定稿后，收掉这里对 JWT_SECRET 历史别名的沿用，保持 smoke helper 与正式 token contract 同步。

Object.defineProperty(exports, "__esModule", { value: true });
exports.createSmokePlayerIdentity = void 0;
const node_crypto_1 = require("node:crypto");
const ACCESS_KIND = 'access';
/**
 * 记录next令牌issuer。
 */
const NEXT_TOKEN_ISSUER = 'server-next';
/**
 * 记录next令牌version。
 */
const NEXT_TOKEN_VERSION = 1;
/**
 * 记录accessexpiresseconds。
 */
const ACCESS_EXPIRES_SECONDS = 15 * 60;
/**
 * 记录玩家令牌secret环境变量keys。
 */
const PLAYER_TOKEN_SECRET_ENV_KEYS = [
    'SERVER_NEXT_PLAYER_TOKEN_SECRET',
    'NEXT_PLAYER_TOKEN_SECRET',
    'JWT_SECRET',
];
/**
 * 创建smoke 校验玩家identity。
 */
function createSmokePlayerIdentity(playerId, options = undefined) {
/**
 * 记录normalized玩家ID。
 */
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
        throw new Error('smoke playerId is required');
    }
/**
 * 记录normalizedlabel。
 */
    const normalizedLabel = typeof options?.label === 'string' && options.label.trim()
        ? options.label.trim()
        : 'smoke';
/**
 * 记录normalizedseed。
 */
    const normalizedSeed = sanitizeForTokenId(normalizedPlayerId);
/**
 * 记录userID。
 */
    const userId = typeof options?.userId === 'string' && options.userId.trim()
        ? options.userId.trim()
        : `${normalizedLabel}_user_${normalizedSeed}`;
/**
 * 记录username。
 */
    const username = typeof options?.username === 'string' && options.username.trim()
        ? options.username.trim()
        : `${normalizedLabel}_${normalizedSeed}`;
/**
 * 记录显示信息名称。
 */
    const displayName = typeof options?.displayName === 'string' && options.displayName.trim()
        ? options.displayName.trim()
        : normalizedPlayerId;
/**
 * 记录玩家名称。
 */
    const playerName = typeof options?.playerName === 'string' && options.playerName.trim()
        ? options.playerName.trim()
        : displayName;
    return {
        userId,
        username,
        displayName,
        playerName,
        playerId: normalizedPlayerId,
        token: issuePlayerAccessToken({
            sub: userId,
            username,
            displayName,
            playerId: normalizedPlayerId,
            playerName,
        }),
    };
}
exports.createSmokePlayerIdentity = createSmokePlayerIdentity;
/**
 * 处理issue玩家access令牌。
 */
function issuePlayerAccessToken(payload) {
/**
 * 记录now。
 */
    const now = Math.floor(Date.now() / 1000);
/**
 * 记录secret。
 */
    const secret = resolveSigningSecret();
/**
 * 记录header。
 */
    const header = base64UrlEncode(Buffer.from(JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
    }), 'utf8'));
/**
 * 记录请求体。
 */
    const body = base64UrlEncode(Buffer.from(JSON.stringify({
        iss: NEXT_TOKEN_ISSUER,
        aud: 'player',
        ver: NEXT_TOKEN_VERSION,
        kind: ACCESS_KIND,
        scope: ACCESS_KIND,
        sub: payload.sub,
        username: payload.username,
        displayName: payload.displayName,
        playerId: payload.playerId,
        playerName: payload.playerName,
        iat: now,
        nbf: now,
        exp: now + ACCESS_EXPIRES_SECONDS,
    }), 'utf8'));
/**
 * 记录signature。
 */
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${header}.${body}`)
        .digest());
    return `${header}.${body}.${signature}`;
}
/**
 * 解析signingsecret。
 */
function resolveSigningSecret() {
    for (const key of PLAYER_TOKEN_SECRET_ENV_KEYS) {
/**
 * 记录价值。
 */
        const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
        if (value) {
            return value;
        }
    }
    return 'daojie-yusheng-dev-secret';
}
/**
 * 处理sanitizefor令牌ID。
 */
function sanitizeForTokenId(value) {
/**
 * 记录sanitized。
 */
    const sanitized = String(value)
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return sanitized || `player_${Date.now().toString(36)}`;
}
/**
 * 处理base64URLencode。
 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

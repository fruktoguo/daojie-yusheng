"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSmokePlayerIdentity = void 0;
const node_crypto_1 = require("node:crypto");
const ACCESS_KIND = 'access';
const NEXT_TOKEN_ISSUER = 'server-next';
const NEXT_TOKEN_VERSION = 1;
const ACCESS_EXPIRES_SECONDS = 15 * 60;
const PLAYER_TOKEN_SECRET_ENV_KEYS = [
    'SERVER_NEXT_PLAYER_TOKEN_SECRET',
    'NEXT_PLAYER_TOKEN_SECRET',
    'JWT_SECRET',
];
function createSmokePlayerIdentity(playerId, options = undefined) {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
        throw new Error('smoke playerId is required');
    }
    const normalizedLabel = typeof options?.label === 'string' && options.label.trim()
        ? options.label.trim()
        : 'smoke';
    const normalizedSeed = sanitizeForTokenId(normalizedPlayerId);
    const userId = typeof options?.userId === 'string' && options.userId.trim()
        ? options.userId.trim()
        : `${normalizedLabel}_user_${normalizedSeed}`;
    const username = typeof options?.username === 'string' && options.username.trim()
        ? options.username.trim()
        : `${normalizedLabel}_${normalizedSeed}`;
    const displayName = typeof options?.displayName === 'string' && options.displayName.trim()
        ? options.displayName.trim()
        : normalizedPlayerId;
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
function issuePlayerAccessToken(payload) {
    const now = Math.floor(Date.now() / 1000);
    const secret = resolveSigningSecret();
    const header = base64UrlEncode(Buffer.from(JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
    }), 'utf8'));
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
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${header}.${body}`)
        .digest());
    return `${header}.${body}.${signature}`;
}
function resolveSigningSecret() {
    for (const key of PLAYER_TOKEN_SECRET_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
        if (value) {
            return value;
        }
    }
    return 'daojie-yusheng-dev-secret';
}
function sanitizeForTokenId(value) {
    const sanitized = String(value)
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return sanitized || `player_${Date.now().toString(36)}`;
}
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

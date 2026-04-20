import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { verifyPlayerTokenPayloadDetailed } from '../auth/player-token-verify';

const ACCESS_KIND = 'access';
const REFRESH_KIND = 'refresh';
const ACCESS_EXPIRES_FALLBACK_SECONDS = 15 * 60;
const REFRESH_EXPIRES_FALLBACK_SECONDS = 30 * 24 * 60 * 60;
const NEXT_TOKEN_ISSUER = 'server-next';
const NEXT_TOKEN_VERSION = 1;
const PLAYER_TOKEN_SECRET_ENV_KEYS = [
  'SERVER_NEXT_PLAYER_TOKEN_SECRET',
  'NEXT_PLAYER_TOKEN_SECRET',
] as const;
const DEFAULT_DEV_PLAYER_TOKEN_SECRET = 'daojie-yusheng-dev-secret';
const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);

type TokenKind = typeof ACCESS_KIND | typeof REFRESH_KIND;

interface TokenPayloadInput {
  sub?: unknown;
  username?: unknown;
  displayName?: unknown;
  playerId?: unknown;
  playerName?: unknown;
}

export interface ValidatedPlayerTokenPayload extends Record<string, unknown> {
  sub: string;
  username: string;
  iss?: string;
  ver?: unknown;
  kind?: unknown;
  scope?: unknown;
  role?: unknown;
  displayName?: string;
  playerId?: string;
  playerName?: string;
}

/** 玩家令牌编解码服务：负责签发和验证 next 访问/刷新令牌。 */
@Injectable()
export class WorldPlayerTokenCodecService {
  /** 读取到的可用签名密钥列表。 */
  private readonly secrets: string[];

  /** 当前签名主密钥。 */
  private readonly signingSecret: string;

  constructor() {
    this.secrets = resolvePlayerTokenSecrets();
    this.signingSecret = this.secrets[0];
  }

  /** 校验访问令牌。 */
  validateAccessToken(token: string): ValidatedPlayerTokenPayload | null {
    return this.validateToken(token, ACCESS_KIND);
  }

  /** 校验刷新令牌。 */
  validateRefreshToken(token: string): ValidatedPlayerTokenPayload | null {
    return this.validateToken(token, REFRESH_KIND);
  }

  /** 签发访问令牌。 */
  issueAccessToken(payload: TokenPayloadInput): string {
    return this.issueToken(payload, ACCESS_KIND, readPositiveIntEnv('SERVER_NEXT_AUTH_ACCESS_TOKEN_EXPIRES_IN', ACCESS_EXPIRES_FALLBACK_SECONDS));
  }

  /** 签发刷新令牌。 */
  issueRefreshToken(payload: TokenPayloadInput): string {
    return this.issueToken(payload, REFRESH_KIND, readPositiveIntEnv('SERVER_NEXT_AUTH_REFRESH_TOKEN_EXPIRES_IN', REFRESH_EXPIRES_FALLBACK_SECONDS));
  }

  /** 验证令牌签名和载荷类型。 */
  private validateToken(token: string, expectedKind: TokenKind): ValidatedPlayerTokenPayload | null {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) {
      return null;
    }

    for (const secret of this.secrets) {
      const result = verifyPlayerTokenPayloadDetailed(normalizedToken, secret);
      const payload = normalizeValidatedPayload(result.payload, expectedKind);
      if (payload) {
        return payload;
      }
    }

    return null;
  }

  /** 生成带签名的 JWT 字符串。 */
  private issueToken(payload: TokenPayloadInput, kind: TokenKind, expiresInSeconds: number): string {
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

    const signature = base64UrlEncode(
      createHmac('sha256', this.signingSecret)
        .update(`${header}.${body}`)
        .digest(),
    );

    return `${header}.${body}.${signature}`;
  }
}

function resolvePlayerTokenSecrets(): string[] {
  const secrets: string[] = [];

  for (const key of PLAYER_TOKEN_SECRET_ENV_KEYS) {
    const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
    if (value && !secrets.includes(value)) {
      secrets.push(value);
    }
  }

  if (secrets.length > 0) {
    return secrets;
  }

  if (!isDevelopmentLikeEnv()) {
    throw new Error('非开发环境必须配置 SERVER_NEXT_PLAYER_TOKEN_SECRET / NEXT_PLAYER_TOKEN_SECRET，禁止回退内置开发密钥。');
  }

  secrets.push(DEFAULT_DEV_PLAYER_TOKEN_SECRET);
  return secrets;
}

function isDevelopmentLikeEnv(): boolean {
  const runtimeEnv = String(process.env.SERVER_NEXT_RUNTIME_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}

function normalizeValidatedPayload(payload: Record<string, unknown> | null, expectedKind: TokenKind): ValidatedPlayerTokenPayload | null {
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

  return payload as ValidatedPlayerTokenPayload;
}

function normalizeTokenKind(kindValue: unknown, scopeValue: unknown): TokenKind {
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

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? Number.NaN);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}

function base64UrlEncode(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

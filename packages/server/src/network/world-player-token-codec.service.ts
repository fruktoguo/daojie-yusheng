import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { verifyPlayerTokenPayloadDetailed } from '../auth/player-token-verify';

const ACCESS_KIND = 'access';
const REFRESH_KIND = 'refresh';
const ACCESS_EXPIRES_FALLBACK_SECONDS = 15 * 60;
const REFRESH_EXPIRES_FALLBACK_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_ISSUER = 'server';
const TOKEN_VERSION = 1;
const PLAYER_TOKEN_SECRET_ENV_KEYS = [
  'SERVER_PLAYER_TOKEN_SECRET',
  'JWT_SECRET',
] as const;
const DEFAULT_DEV_PLAYER_TOKEN_SECRET = 'daojie-yusheng-dev-secret';
const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);
/**
 * TokenKind：统一结构类型，保证协议与运行时一致性。
 */


type TokenKind = typeof ACCESS_KIND | typeof REFRESH_KIND;
/**
 * TokenPayloadInput：定义接口结构约束，明确可交付字段含义。
 */


interface TokenPayloadInput {
/**
 * sub：sub相关字段。
 */

  sub?: unknown;  
  /**
 * username：username名称或显示文本。
 */

  username?: unknown;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: unknown;  
  /**
 * playerId：玩家ID标识。
 */

  playerId?: unknown;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName?: unknown;
}
/**
 * ValidatedPlayerTokenPayload：定义接口结构约束，明确可交付字段含义。
 */


export interface ValidatedPlayerTokenPayload extends Record<string, unknown> {
/**
 * sub：sub相关字段。
 */

  sub: string;  
  /**
 * username：username名称或显示文本。
 */

  username: string;  
  /**
 * iss：启用开关或状态标识。
 */

  iss?: string;  
  /**
 * ver：ver相关字段。
 */

  ver?: unknown;  
  /**
 * kind：kind相关字段。
 */

  kind?: unknown;  
  /**
 * scope：scope相关字段。
 */

  scope?: unknown;  
  /**
 * role：role相关字段。
 */

  role?: unknown;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: string;  
  /**
 * playerId：玩家ID标识。
 */

  playerId?: string;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName?: string;
}

/** 玩家令牌编解码服务：负责签发和验证 next 访问/刷新令牌。 */
@Injectable()
export class WorldPlayerTokenCodecService {
  /** 读取到的可用签名密钥列表。 */
  private readonly secrets: string[];

  /** 当前签名主密钥。 */
  private readonly signingSecret: string;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


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
    return this.issueToken(payload, ACCESS_KIND, readPositiveIntEnv('SERVER_AUTH_ACCESS_TOKEN_EXPIRES_IN', ACCESS_EXPIRES_FALLBACK_SECONDS));
  }

  /** 签发刷新令牌。 */
  issueRefreshToken(payload: TokenPayloadInput): string {
    return this.issueToken(payload, REFRESH_KIND, readPositiveIntEnv('SERVER_AUTH_REFRESH_TOKEN_EXPIRES_IN', REFRESH_EXPIRES_FALLBACK_SECONDS));
  }

  /** 验证令牌签名和载荷类型。 */
  private validateToken(token: string, expectedKind: TokenKind): ValidatedPlayerTokenPayload | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      iss: TOKEN_ISSUER,
      aud: 'player',
      ver: TOKEN_VERSION,
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
/**
 * resolvePlayerTokenSecrets：规范化或转换玩家TokenSecret。
 * @returns 返回玩家TokenSecret列表。
 */


function resolvePlayerTokenSecrets(): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    throw new Error('非开发环境必须配置 SERVER_PLAYER_TOKEN_SECRET；JWT_SECRET 仅作为旧本地配置兼容，禁止回退内置开发密钥。');
  }

  secrets.push(DEFAULT_DEV_PLAYER_TOKEN_SECRET);
  return secrets;
}
/**
 * isDevelopmentLikeEnv：判断DevelopmentLikeEnv是否满足条件。
 * @returns 返回是否满足DevelopmentLikeEnv条件。
 */


function isDevelopmentLikeEnv(): boolean {
  const runtimeEnv = String(process.env.SERVER_RUNTIME_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}
/**
 * normalizeValidatedPayload：读取Validated载荷并返回结果。
 * @param payload Record<string, unknown> | null 载荷参数。
 * @param expectedKind TokenKind 参数说明。
 * @returns 返回Validated载荷。
 */


function normalizeValidatedPayload(payload: Record<string, unknown> | null, expectedKind: TokenKind): ValidatedPlayerTokenPayload | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  if (issuer && issuer !== TOKEN_ISSUER) {
    return null;
  }

  const version = payload.ver;
  if (version !== undefined && Math.trunc(Number(version)) !== TOKEN_VERSION) {
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
/**
 * normalizeTokenKind：规范化或转换TokenKind。
 * @param kindValue unknown 参数说明。
 * @param scopeValue unknown 参数说明。
 * @returns 返回TokenKind。
 */


function normalizeTokenKind(kindValue: unknown, scopeValue: unknown): TokenKind {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeOptionalString：规范化或转换OptionalString。
 * @param value unknown 参数说明。
 * @returns 返回OptionalString。
 */


function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
/**
 * readPositiveIntEnv：读取PositiveIntEnv并返回结果。
 * @param name string 参数说明。
 * @param fallback number 参数说明。
 * @returns 返回PositiveIntEnv。
 */


function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? Number.NaN);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}
/**
 * base64UrlEncode：执行base64UrlEncode相关逻辑。
 * @param value Buffer 参数说明。
 * @returns 返回base64UrlEncode。
 */


function base64UrlEncode(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

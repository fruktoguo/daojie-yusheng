/**
 * BotTokenService：bot 一次性登录 token 的签发与校验。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §6.2、§9。
 *
 * 安全要点：
 * - token 用 HS256 + base64url 编码，与玩家主线 player token 保持同一风格
 * - 签发密钥来自环境变量 SERVER_BOT_TOKEN_SECRET（缺失时 issue 会拒绝）
 * - 是否允许签发 / 验证由 SERVER_BOT_LOGIN_ENABLED=1 显式开启；prod 默认关闭
 * - token 一次签发即绑定 playerId（含前缀 `bot_`），不能跨 actor 复用
 * - exp 单位秒（与 JWT 规范一致），TTL 上限 24 小时（防止误配置长寿 token）
 *
 * 第 1 批阶段：HTTP 路由调用 issue；第 2 批 WS Hello 路径调用 verify 完成 bot 登录。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { EPHEMERAL_BOT_ID_PREFIX } from '@mud/shared';

import { readTrimmedEnv } from '../config/env-alias';

/** 签发密钥环境变量名称。 */
const BOT_TOKEN_SECRET_ENV = 'SERVER_BOT_TOKEN_SECRET';
/** 全局开关环境变量名称（关闭时 issue/verify 一律拒绝）。 */
const BOT_LOGIN_ENABLED_ENV = 'SERVER_BOT_LOGIN_ENABLED';
/** 默认 TTL（秒）：2 小时。 */
const DEFAULT_TTL_SEC = 2 * 60 * 60;
/** TTL 上限（秒）：24 小时，避免误配置生成永久 token。 */
const MAX_TTL_SEC = 24 * 60 * 60;
/** Token 版本号，未来格式变更时递增。 */
const BOT_TOKEN_VERSION = 1;

/** Bot token 载荷结构。 */
export interface BotTokenPayload {
  /** 协议版本。 */
  v: number;
  /** Bot playerId（前缀 `bot_`）。 */
  pid: string;
  /** 关联蓝图 ID；可选。 */
  bp: string | null;
  /** Token kind，固定 `bot`。 */
  k: 'bot';
  /** 签发时间（秒，UNIX 时间戳）。 */
  iat: number;
  /** 失效时间（秒）。 */
  exp: number;
}

/** Token 校验结果。 */
export interface BotTokenVerificationResult {
  /** 校验是否通过。 */
  ok: boolean;
  /** 校验通过时返回的载荷；失败时为 null。 */
  payload: BotTokenPayload | null;
  /** 失败原因，便于诊断与日志。 */
  reason: BotTokenVerificationFailureReason | null;
}

/** Token 校验失败原因枚举。 */
export type BotTokenVerificationFailureReason =
  | 'feature_disabled'
  | 'secret_missing'
  | 'malformed'
  | 'invalid_payload'
  | 'invalid_signature'
  | 'expired'
  | 'wrong_kind'
  | 'wrong_player_id_prefix';

/** 签发请求体。 */
export interface BotTokenIssueInput {
  /** 目标 bot playerId（必须以 `bot_` 开头）。 */
  playerId: string;
  /** 关联蓝图 ID；可空。 */
  blueprintId: string | null;
  /** TTL（秒），缺省为默认 2 小时。 */
  ttlSec?: number;
}

/** 签发结果。 */
export interface BotTokenIssueResult {
  /** 编码后的 token 字符串。 */
  token: string;
  /** Token 失效时间（毫秒，便于直接给前端）。 */
  expiresAtMs: number;
  /** 实际使用的 TTL（秒）。 */
  ttlSec: number;
}

@Injectable()
export class BotTokenService {
  private readonly logger = new Logger(BotTokenService.name);

  /** Bot 登录是否启用（对应环境变量 SERVER_BOT_LOGIN_ENABLED）。 */
  isFeatureEnabled(): boolean {
    return readTrimmedEnv(BOT_LOGIN_ENABLED_ENV) === '1';
  }

  /** 签发 bot 登录 token；feature disabled 或 secret 缺失时抛错。 */
  issue(input: BotTokenIssueInput): BotTokenIssueResult {
    if (!this.isFeatureEnabled()) {
      throw new Error('bot login feature 未启用：请设置 SERVER_BOT_LOGIN_ENABLED=1');
    }
    const secret = this.readSecretOrThrow();

    const playerId = (input.playerId ?? '').trim();
    if (!playerId.startsWith(EPHEMERAL_BOT_ID_PREFIX)) {
      throw new Error(`BotTokenService.issue: playerId ${playerId} 缺少前缀 ${EPHEMERAL_BOT_ID_PREFIX}`);
    }
    const ttlSec = clampTtlSec(input.ttlSec);
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: BotTokenPayload = {
      v: BOT_TOKEN_VERSION,
      pid: playerId,
      bp: input.blueprintId,
      k: 'bot',
      iat: nowSec,
      exp: nowSec + ttlSec,
    };
    const encodedPayload = encodeBase64UrlJson(payload);
    const signature = base64UrlEncode(
      createHmac('sha256', secret).update(encodedPayload).digest(),
    );
    return {
      token: `${encodedPayload}.${signature}`,
      expiresAtMs: payload.exp * 1000,
      ttlSec,
    };
  }

  /** 校验 token 并返回载荷；任何校验失败都返回 ok=false + reason，不抛异常。 */
  verify(token: string): BotTokenVerificationResult {
    if (!this.isFeatureEnabled()) {
      return { ok: false, payload: null, reason: 'feature_disabled' };
    }
    const secret = readTrimmedEnv(BOT_TOKEN_SECRET_ENV);
    if (!secret) {
      return { ok: false, payload: null, reason: 'secret_missing' };
    }
    if (typeof token !== 'string' || token.length === 0) {
      return { ok: false, payload: null, reason: 'malformed' };
    }
    const segments = token.split('.');
    if (segments.length !== 2) {
      return { ok: false, payload: null, reason: 'malformed' };
    }
    const [encodedPayload, encodedSignature] = segments;
    const expectedSignature = base64UrlEncode(
      createHmac('sha256', secret).update(encodedPayload).digest(),
    );
    const left = Buffer.from(encodedSignature);
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return { ok: false, payload: null, reason: 'invalid_signature' };
    }
    const payload = decodeBase64UrlJson<BotTokenPayload>(encodedPayload);
    if (!payload || typeof payload.pid !== 'string' || typeof payload.exp !== 'number') {
      return { ok: false, payload: null, reason: 'invalid_payload' };
    }
    if (payload.k !== 'bot') {
      return { ok: false, payload: null, reason: 'wrong_kind' };
    }
    if (!payload.pid.startsWith(EPHEMERAL_BOT_ID_PREFIX)) {
      return { ok: false, payload: null, reason: 'wrong_player_id_prefix' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) {
      return { ok: false, payload: null, reason: 'expired' };
    }
    return { ok: true, payload, reason: null };
  }

  /** 读取签发密钥；缺失时抛错并日志告警。 */
  private readSecretOrThrow(): string {
    const secret = readTrimmedEnv(BOT_TOKEN_SECRET_ENV);
    if (!secret) {
      this.logger.error(`bot token 签发失败：未配置 ${BOT_TOKEN_SECRET_ENV}`);
      throw new Error(`bot token 签发密钥未配置：请设置 ${BOT_TOKEN_SECRET_ENV}`);
    }
    return secret;
  }
}

/** 限制 TTL 范围，避免误配置。 */
function clampTtlSec(input: number | undefined): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return DEFAULT_TTL_SEC;
  }
  const ttl = Math.trunc(input);
  if (ttl <= 0) {
    return DEFAULT_TTL_SEC;
  }
  return Math.min(ttl, MAX_TTL_SEC);
}

/** base64url 编码 JSON。 */
function encodeBase64UrlJson(value: unknown): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(value), 'utf8'));
}

/** base64url 解码 JSON；失败返回 null。 */
function decodeBase64UrlJson<T>(encoded: string): T | null {
  try {
    const decoded = Buffer.from(base64UrlDecode(encoded), 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** base64url 解码（补齐 padding）。 */
function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}

/** base64url 编码（去 padding，规范字符替换）。 */
function base64UrlEncode(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

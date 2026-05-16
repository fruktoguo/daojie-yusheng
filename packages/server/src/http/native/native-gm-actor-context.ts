/**
 * GM 操作 actor 上下文。
 *
 * N45 落地：所有 GM 写操作必须携带最小可识别的 actor 上下文，落 gm_audit_log。
 * GM 当前是单密码登录、多操作员共用 token —— 所以"actor 标识"实际可识别的维度有：
 *  - tokenRev：token 的密码版本号（rev），区分多次改密后的 token 实例；
 *  - ip：请求来源 IP（受 SERVER_TRUSTED_PROXIES 控制是否信任 X-Forwarded-For）；
 *  - userAgent：请求 User-Agent；
 *  - receivedAt：请求接收时间戳（毫秒）。
 *
 * 由 NativeGmAuthGuard 在 canActivate 内提取并挂到 request.gmActor，下游 controller
 * 仅需 @Req() 后调用 extractGmActor(request) 取出。
 */

import type { GmAuthValidationResult } from '../../runtime/gm/runtime-gm-auth.service';

/** GM actor 上下文：用于 audit_log 的 actor 字段。 */
export interface GmActorContext {
  tokenRev: string | null;
  ip: string | null;
  userAgent: string | null;
  receivedAt: number;
}

/** 用于本工具的最小 request 形状；不绑定具体 HTTP 框架。 */
interface GmActorRequestLike {
  headers?: Record<string, unknown>;
  ip?: unknown;
  gmActor?: GmActorContext;
}

/**
 * 从请求中提取 GM actor 上下文。
 * - 优先读取 Guard 已挂载的 request.gmActor；
 * - 缺失时按"宽松模式"从 headers 直接构造（用于尚未走 Guard 的内部调用）。
 */
export function extractGmActor(request: unknown): GmActorContext {
  const req = (request as GmActorRequestLike | null | undefined) ?? null;
  if (req?.gmActor && typeof req.gmActor === 'object') {
    return normalizeActor(req.gmActor);
  }
  return buildActorFromRequest(req);
}

/** Guard 内调用：用 token 校验结果 + request 构造 actor 并挂到 request.gmActor。 */
export function attachGmActor(
  request: unknown,
  validation: GmAuthValidationResult | null,
): GmActorContext {
  const req = (request as GmActorRequestLike | null | undefined) ?? null;
  const actor: GmActorContext = {
    tokenRev: validation?.ok ? (validation.rev ?? null) : null,
    ...buildActorFromRequest(req),
  };
  if (req && typeof req === 'object') {
    (req as { gmActor?: GmActorContext }).gmActor = actor;
  }
  return actor;
}

/** 不依赖 token 校验结果，仅根据 headers 构造 actor（用于无 token 的运维诊断回退）。 */
function buildActorFromRequest(req: GmActorRequestLike | null): GmActorContext {
  const headers = (req?.headers ?? {}) as Record<string, unknown>;
  const userAgent = pickString(headers['user-agent']).slice(0, 255) || null;
  const forwardedFor = pickString(headers['x-forwarded-for']);
  const trustedProxies = (process.env.SERVER_TRUSTED_PROXIES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const useForwardedFor = trustedProxies.length > 0
    || process.env.SERVER_TRUST_PROXY === '1'
    || process.env.SERVER_TRUST_PROXY === 'true';
  const forwardedIp = useForwardedFor && forwardedFor ? forwardedFor.split(',')[0]?.trim() : '';
  const ip = (forwardedIp || pickString(req?.ip) || pickString(headers['x-real-ip']) || '').slice(0, 80) || null;
  return {
    tokenRev: null,
    ip,
    userAgent,
    receivedAt: Date.now(),
  };
}

function normalizeActor(actor: GmActorContext): GmActorContext {
  return {
    tokenRev: actor.tokenRev ?? null,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    receivedAt: Number.isFinite(actor.receivedAt) ? actor.receivedAt : Date.now(),
  };
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

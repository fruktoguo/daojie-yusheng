import { createHmac, timingSafeEqual } from 'node:crypto';

interface JwtHeader extends Record<string, unknown> {
  alg?: unknown;
  typ?: unknown;
}

export interface PlayerTokenPayloadVerificationResult {
  payload: Record<string, unknown> | null;
  reason: string | null;
}

/** 校验 JWT 载荷与签名，并输出失败原因，供鉴权栈判定拒绝原因。 */
export function verifyPlayerTokenPayloadDetailed(token: string, secret: string): PlayerTokenPayloadVerificationResult {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return { payload: null, reason: 'malformed_segments' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseJwtSegment<JwtHeader>(encodedHeader);
  const payload = parseJwtSegment<Record<string, unknown>>(encodedPayload);
  if (!header || !payload) {
    return { payload: null, reason: 'invalid_json_segment' };
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    return { payload: null, reason: 'invalid_header' };
  }

  const expectedSignature = base64UrlEncode(
    createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest(),
  );
  const left = Buffer.from(encodedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { payload: null, reason: 'invalid_signature' };
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  const nbf = typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) ? payload.nbf : null;
  if (exp !== null && exp < now) {
    return { payload: null, reason: 'expired' };
  }

  if (nbf !== null && nbf > now) {
    return { payload: null, reason: 'not_yet_valid' };
  }

  return { payload, reason: null };
}

/** 解析 JWT 分段 JSON，失败时返回 null 供上层统一错误分支。 */
function parseJwtSegment<T extends Record<string, unknown>>(segment: string): T | null {
  try {
    const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' ? (value as T) : null;
  } catch {
    return null;
  }
}

/** base64url 解码并补齐 padding。 */
function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}

/** base64url 编码工具（JWT 规范字符替换与去 padding）。 */
function base64UrlEncode(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

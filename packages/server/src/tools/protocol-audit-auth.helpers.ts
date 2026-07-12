/**
 * 协议审计账号、角色名与令牌载荷的无状态辅助。
 */

type AnyRecord = Record<string, any>;

export function parseJwtPayload(token: unknown): AnyRecord | null {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function buildFallbackPlayerId(userId: unknown): string {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized ? `p_${normalized}` : '';
}

export function buildUniqueDisplayName(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return String.fromCodePoint(0x4e00 + (hash % (0x9fff - 0x4e00 + 1)));
}

function buildAuditHash(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

export function buildAuditToken(seed: string, maxLength: number, attempt: number): string {
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const suffix = attempt > 0 ? attempt.toString(36) : '';
  let token = normalized + buildAuditHash(`${seed}:${attempt}`) + suffix;
  if (!token) {
    token = `audit${buildAuditHash(seed)}`;
  }
  return token.slice(-maxLength);
}

export function buildUniqueAuditAccountName(seed: string, attempt: number): string {
  return `acct_${buildAuditToken(seed, 15, attempt)}`;
}

export function buildUniqueAuditRoleName(seed: string, attempt: number): string {
  const suffix = buildAuditToken(`${seed}:role:${process.pid}:${Date.now()}`, 6, attempt);
  return `审${suffix}`.slice(0, 7);
}

export function isRegisterConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('称号已存在')
    || message.includes('显示名称已存在')
    || message.includes('账号已存在');
}

import { isIP } from 'node:net';

export interface NativeRequestIpLike {
  headers?: Record<string, unknown>;
  ip?: unknown;
  socket?: { remoteAddress?: unknown };
  connection?: { remoteAddress?: unknown };
}

export interface NativeRequestIpOptions {
  fallback?: string;
}

interface NormalizedCidr {
  base: number;
  mask: number;
}

interface TrustedProxyPolicy {
  trustAll: boolean;
  exact: Set<string>;
  cidrs: NormalizedCidr[];
}

const DEFAULT_TRUSTED_PROXY_ENTRIES = Object.freeze([
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::1',
]);

const DISABLED_TRUSTED_PROXY_VALUE_SET = new Set(['0', 'false', 'off', 'none']);

/** 按可信代理配置解析玩家真实 IP；未命中可信代理时只使用直连来源。 */
export function resolveNativeRequestIp(
  request: NativeRequestIpLike | null | undefined,
  options: NativeRequestIpOptions = {},
): string {
  const fallback = options.fallback ?? '';
  const directIp = normalizeIp(
    pickString(request?.ip)
      || pickString(request?.socket?.remoteAddress)
      || pickString(request?.connection?.remoteAddress),
  );
  const trustedProxyPolicy = resolveTrustedProxyPolicy();
  if (isTrustedProxyIp(directIp, trustedProxyPolicy)) {
    const headers = (request?.headers ?? {}) as Record<string, unknown>;
    const forwardedIp = resolveForwardedClientIp(readHeader(headers, 'x-forwarded-for'), trustedProxyPolicy);
    if (forwardedIp) return forwardedIp;
    const realIp = normalizeIp(readHeader(headers, 'x-real-ip'));
    if (realIp) return realIp;
  }
  return directIp || fallback;
}

function resolveTrustedProxyPolicy(): TrustedProxyPolicy {
  const trustProxy = typeof process.env.SERVER_TRUST_PROXY === 'string'
    ? process.env.SERVER_TRUST_PROXY.trim().toLowerCase()
    : '';
  const trustedProxies = parseTrustedProxies();
  return {
    trustAll: trustProxy === '1' || trustProxy === 'true',
    ...trustedProxies,
  };
}

function isTrustedProxyIp(directIp: string, policy: TrustedProxyPolicy): boolean {
  if (policy.trustAll) return true;
  const trustedProxies = policy;
  if (trustedProxies.exact.size === 0 && trustedProxies.cidrs.length === 0) {
    return false;
  }
  if (!directIp) return false;
  if (trustedProxies.exact.has(directIp)) return true;
  const directIpNumber = ipv4ToNumber(directIp);
  if (directIpNumber === null) return false;
  return trustedProxies.cidrs.some((cidr) => (directIpNumber & cidr.mask) === (cidr.base & cidr.mask));
}

/** 从右向左剥离可信代理，返回离服务端最近的非可信来源，避免客户端伪造链首地址。 */
function resolveForwardedClientIp(value: string, policy: TrustedProxyPolicy): string {
  const forwardedIps = value
    .split(',')
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);
  if (forwardedIps.length === 0) return '';
  if (policy.trustAll) return forwardedIps[0];
  for (let index = forwardedIps.length - 1; index >= 0; index -= 1) {
    if (!isTrustedProxyIp(forwardedIps[index], policy)) {
      return forwardedIps[index];
    }
  }
  return forwardedIps[0];
}

function parseTrustedProxies(): { exact: Set<string>; cidrs: NormalizedCidr[] } {
  const exact = new Set<string>();
  const cidrs: NormalizedCidr[] = [];
  const configuredValue = typeof process.env.SERVER_TRUSTED_PROXIES === 'string'
    ? process.env.SERVER_TRUSTED_PROXIES.trim()
    : '';
  const entries = configuredValue
    ? configuredValue.split(',').map((entry) => entry.trim()).filter(Boolean)
    : DEFAULT_TRUSTED_PROXY_ENTRIES;
  if (entries.length === 1 && DISABLED_TRUSTED_PROXY_VALUE_SET.has(entries[0].toLowerCase())) {
    return { exact, cidrs };
  }
  for (const entry of entries) {
    const slashIndex = entry.indexOf('/');
    if (slashIndex > 0) {
      const baseIp = normalizeIp(entry.slice(0, slashIndex));
      const prefixLength = Number(entry.slice(slashIndex + 1));
      const base = ipv4ToNumber(baseIp);
      if (base !== null && Number.isInteger(prefixLength) && prefixLength >= 0 && prefixLength <= 32) {
        const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
        cidrs.push({ base, mask });
      }
      continue;
    }
    const normalized = normalizeIp(entry);
    if (normalized) exact.add(normalized);
  }
  return { exact, cidrs };
}

function readHeader(headers: Record<string, unknown>, name: string): string {
  const lower = name.toLowerCase();
  const upper = name.toUpperCase();
  const value = headers[lower] ?? headers[upper] ?? headers[name];
  if (Array.isArray(value)) return value.map((entry) => pickString(entry)).find(Boolean) ?? '';
  return pickString(value);
}

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withoutIpv4MappedPrefix = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (isIP(withoutIpv4MappedPrefix)) return withoutIpv4MappedPrefix;
  return '';
}

function ipv4ToNumber(value: string): number | null {
  if (isIP(value) !== 4) return null;
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

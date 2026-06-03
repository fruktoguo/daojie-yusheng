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
  if (shouldTrustProxyHeaders(directIp)) {
    const headers = (request?.headers ?? {}) as Record<string, unknown>;
    const forwardedIp = normalizeIp(firstForwardedIp(readHeader(headers, 'x-forwarded-for')));
    if (forwardedIp) return forwardedIp;
    const realIp = normalizeIp(readHeader(headers, 'x-real-ip'));
    if (realIp) return realIp;
  }
  return directIp || fallback;
}

function shouldTrustProxyHeaders(directIp: string): boolean {
  if (process.env.SERVER_TRUST_PROXY === '1' || process.env.SERVER_TRUST_PROXY === 'true') {
    return true;
  }
  const trustedProxies = parseTrustedProxies();
  if (trustedProxies.exact.size === 0 && trustedProxies.cidrs.length === 0) {
    return false;
  }
  if (!directIp) return false;
  if (trustedProxies.exact.has(directIp)) return true;
  const directIpNumber = ipv4ToNumber(directIp);
  if (directIpNumber === null) return false;
  return trustedProxies.cidrs.some((cidr) => (directIpNumber & cidr.mask) === (cidr.base & cidr.mask));
}

function parseTrustedProxies(): { exact: Set<string>; cidrs: NormalizedCidr[] } {
  const exact = new Set<string>();
  const cidrs: NormalizedCidr[] = [];
  const entries = (process.env.SERVER_TRUSTED_PROXIES ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
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

function firstForwardedIp(value: string): string {
  return value.split(',').map((entry) => entry.trim()).find(Boolean) ?? '';
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

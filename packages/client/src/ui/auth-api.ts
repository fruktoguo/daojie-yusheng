/**
 * 认证与账号 HTTP API 封装
 * 负责 token 存取、登录/注册/刷新请求、账号信息修改
 */

import {
  ACCESS_TOKEN_STORAGE_KEY,
  AccountUpdateDisplayNameReq,
  AccountUpdateDisplayNameRes,
  AccountUpdatePasswordReq,
  AccountUpdateRoleNameReq,
  AccountUpdateRoleNameRes,
  AuthRefreshReq,
  AuthTokenRes,
  DisplayNameAvailabilityRes,
  REFRESH_TOKEN_STORAGE_KEY,
} from '@mud/shared-next';
import {
  ACCOUNT_API_BASE_PATH,
  AUTH_API_BASE_PATH,
} from '../constants/api';

export {
  ACCESS_TOKEN_STORAGE_KEY as ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_STORAGE_KEY as REFRESH_TOKEN_KEY,
};

/** HTTP 请求失败时抛出，携带状态码 */
export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** 请求 JSON 接口时使用的配置项，支持方法、请求体、访问令牌和中断信号。 */
type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
};

let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

/** 读取当前可用的 sessionStorage；受限环境下回退到内存态。 */
function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** 从 sessionStorage 读取 accessToken */
export function getAccessToken(): string | null {
  const storage = getSessionStorage();
  return storage?.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? memoryAccessToken;
}

/** 从当前 accessToken 读取账号名 */
export function getCurrentAccountName(): string | null {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }
  return extractAccountName(parseJwtPayload(accessToken));
}

/** 从 sessionStorage 读取 refreshToken */
export function getRefreshToken(): string | null {
  const storage = getSessionStorage();
  return storage?.getItem(REFRESH_TOKEN_STORAGE_KEY) ?? memoryRefreshToken;
}

/** 将 token 对写入 sessionStorage，不再跨浏览器重启长期驻留。 */
export function storeTokens(data: AuthTokenRes): void {
  memoryAccessToken = data.accessToken;
  memoryRefreshToken = data.refreshToken;
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  storage.setItem(ACCESS_TOKEN_STORAGE_KEY, data.accessToken);
  storage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
}

/** 清除当前会话中的 token */
export function clearStoredTokens(): void {
  memoryAccessToken = null;
  memoryRefreshToken = null;
  const storage = getSessionStorage();
  storage?.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  storage?.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

/** 通用 JSON 请求，自动处理 body 序列化与 Bearer 鉴权 */
export async function requestJson<TResponse>(url: string, options: RequestOptions = {}): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new RequestError(await readError(res), res.status);
  }

  if (res.status === 204) {
    return undefined as TResponse;
  }
  return res.json() as Promise<TResponse>;
}

/** 用 refreshToken 换取新 token 对 */
export function restoreTokens(refreshToken: string): Promise<AuthTokenRes> {
  return requestJson<AuthTokenRes>(`${AUTH_API_BASE_PATH}/refresh`, {
    method: 'POST',
    body: { refreshToken } satisfies AuthRefreshReq,
  });
}

/** 检查显示名称是否可用 */
export function checkDisplayNameAvailability(
  displayName: string,
  signal?: AbortSignal,
): Promise<DisplayNameAvailabilityRes> {
  const params = new URLSearchParams({ displayName });
  return requestJson<DisplayNameAvailabilityRes>(`${AUTH_API_BASE_PATH}/display-name/check?${params.toString()}`, { signal });
}

/** 修改密码 */
export function updatePassword(
  accessToken: string,
  body: AccountUpdatePasswordReq,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(`${ACCOUNT_API_BASE_PATH}/password`, {
    method: 'POST',
    body,
    accessToken,
  });
}

/** 修改显示名称 */
export function updateDisplayName(
  accessToken: string,
  body: AccountUpdateDisplayNameReq,
): Promise<AccountUpdateDisplayNameRes> {
  return requestJson<AccountUpdateDisplayNameRes>(`${ACCOUNT_API_BASE_PATH}/display-name`, {
    method: 'POST',
    body,
    accessToken,
  });
}

/** 修改角色名称 */
export function updateRoleName(
  accessToken: string,
  body: AccountUpdateRoleNameReq,
): Promise<AccountUpdateRoleNameRes> {
  return requestJson<AccountUpdateRoleNameRes>(`${ACCOUNT_API_BASE_PATH}/role-name`, {
    method: 'POST',
    body,
    accessToken,
  });
}

/** readError：处理read错误。 */
async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json() as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join('，');
    }
    if (data.message) {
      return data.message;
    }
  } catch {
    // noop
  }
  return '请求失败';
}

/** JWT 里用于提取账号名的负载字段。 */
type AuthTokenPayload = {
  username?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  sub?: string;
};

/** extractAccountName：处理extract账号名称。 */
function extractAccountName(payload: AuthTokenPayload | null): string | null {
  if (!payload) {
    return null;
  }
  return payload.username
    ?? payload.preferred_username
    ?? payload.upn
    ?? payload.name
    ?? payload.sub
    ?? null;
}

/** parseJwtPayload：解析Jwt载荷。 */
function parseJwtPayload(token: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as { username?: string };
  } catch {
    return null;
  }
}

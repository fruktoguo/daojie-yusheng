/**
 * 认证与账号 HTTP API 封装
 * 负责 token 存取、登录/注册/刷新请求、账号信息修改
 */

import {
  AccountUpdateDisplayNameReq,
  AccountUpdateDisplayNameRes,
  AccountUpdatePasswordReq,
  AccountUpdateRoleNameReq,
  AccountUpdateRoleNameRes,
  AuthRefreshReq,
  AuthTokenRes,
  DisplayNameAvailabilityRes,
} from '@mud/shared';

export const ACCESS_TOKEN_KEY = 'accessToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';

/** HTTP 请求失败时抛出，携带状态码 */
export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
};

/** 从 localStorage 读取 accessToken */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** 从 localStorage 读取 refreshToken */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** 将 token 对写入 localStorage */
export function storeTokens(data: AuthTokenRes): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
}

/** 清除 localStorage 中的 token */
export function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
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
  return requestJson<AuthTokenRes>('/auth/refresh', {
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
  return requestJson<DisplayNameAvailabilityRes>(`/auth/display-name/check?${params.toString()}`, { signal });
}

/** 修改密码 */
export function updatePassword(
  accessToken: string,
  body: AccountUpdatePasswordReq,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>('/account/password', {
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
  return requestJson<AccountUpdateDisplayNameRes>('/account/display-name', {
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
  return requestJson<AccountUpdateRoleNameRes>('/account/role-name', {
    method: 'POST',
    body,
    accessToken,
  });
}

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

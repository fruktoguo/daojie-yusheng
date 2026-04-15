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
} from '@mud/shared';

export {
  ACCESS_TOKEN_STORAGE_KEY as ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_STORAGE_KEY as REFRESH_TOKEN_KEY,
};

/** HTTP 请求失败时抛出，携带状态码 */
export class RequestError extends Error {
/** constructor：处理当前场景中的对应操作。 */
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** RequestOptions：定义该类型的结构与数据语义。 */
type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
};

const DEVICE_ID_STORAGE_KEY = 'mud:device-id:v1';

/** 从 localStorage 读取 accessToken */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

/** 从当前 accessToken 读取账号名 */
export function getCurrentAccountName(): string | null {
/** accessToken：定义该变量以承载业务值。 */
  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }
  return parseJwtPayload(accessToken)?.username ?? null;
}

/** 从 localStorage 读取 refreshToken */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

/** 将 token 对写入 localStorage */
export function storeTokens(data: AuthTokenRes): void {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, data.accessToken);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
}

/** 清除 localStorage 中的 token */
export function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

/** 获取客户端长期 deviceId，不存在则生成 */
export function getClientDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
  if (existing) {
    return existing;
  }
  const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

/** 通用 JSON 请求，自动处理 body 序列化与 Bearer 鉴权 */
export async function requestJson<TResponse>(url: string, options: RequestOptions = {}): Promise<TResponse> {
/** headers：定义该变量以承载业务值。 */
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }
  headers['X-Device-Id'] = getClientDeviceId();

/** res：定义该变量以承载业务值。 */
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
/** body：定义该变量以承载业务值。 */
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
    body: { refreshToken, deviceId: getClientDeviceId() } satisfies AuthRefreshReq,
  });
}

/** 检查显示名称是否可用 */
export function checkDisplayNameAvailability(
  displayName: string,
  signal?: AbortSignal,
): Promise<DisplayNameAvailabilityRes> {
/** params：定义该变量以承载业务值。 */
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

/** readError：执行对应的业务逻辑。 */
async function readError(res: Response): Promise<string> {
  try {
/** data：定义该变量以承载业务值。 */
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

/** parseJwtPayload：执行对应的业务逻辑。 */
function parseJwtPayload(token: string): { username?: string } | null {
/** parts：定义该变量以承载业务值。 */
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
/** normalized：定义该变量以承载业务值。 */
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
/** padded：定义该变量以承载业务值。 */
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
/** binary：定义该变量以承载业务值。 */
    const binary = window.atob(padded);
/** bytes：定义该变量以承载业务值。 */
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
/** json：定义该变量以承载业务值。 */
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as { username?: string };
  } catch {
    return null;
  }
}

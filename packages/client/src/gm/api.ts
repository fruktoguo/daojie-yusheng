/**
 * gm/api.ts —— GM 工具链 API 路径构建与请求封装。
 *
 * 从 gm.ts 抽取：buildGm*ApiPath 纯路径构建器、request/requestBlob 请求封装、token 存取。
 * request/requestBlob 通过工厂函数注入 token getter 和 401 回调，避免直接依赖 gm.ts 模块状态。
 */

import {
  GM_ACCESS_TOKEN_STORAGE_KEY,
} from '@mud/shared';
import {
  GM_API_BASE_PATH,
  GM_AUTH_API_BASE_PATH,
} from '../constants/api';
import { t } from '../ui/i18n';

// ── 路径构建器（纯函数） ──

export function buildGmStateApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/state?${params.toString()}`;
}

export function buildGmPlayersApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/players?${params.toString()}`;
}

export function buildGmPlayerApiPath(playerId: string): string {
  return `${GM_API_BASE_PATH}/players/${encodeURIComponent(playerId)}`;
}

export function buildGmGeneratedTechniquesApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/generated-techniques?${params.toString()}`;
}

export function buildGmGeneratedTechniqueDetailApiPath(id: string): string {
  return `${GM_API_BASE_PATH}/generated-techniques/${encodeURIComponent(id)}`;
}

export function buildGmTechniqueGenerationJobsApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/technique-generation/jobs?${params.toString()}`;
}

export function buildGmTechniqueGenerationJobDetailApiPath(id: string): string {
  return `${GM_API_BASE_PATH}/technique-generation/jobs/${encodeURIComponent(id)}`;
}

export function buildGmDatabaseBackupDownloadApiPath(backupId: string): string {
  return `${GM_API_BASE_PATH}/database/backups/${encodeURIComponent(backupId)}/download`;
}

export function buildGmServerLogsApiPath(beforeSeq: number | undefined, serverLogPageSize: number): string {
  const params = new URLSearchParams({ limit: String(serverLogPageSize) });
  if (beforeSeq !== undefined) {
    params.set('before', String(beforeSeq));
  }
  return `${GM_API_BASE_PATH}/logs?${params.toString()}`;
}

export function buildGmWorkersApiPath(): string {
  return `${GM_API_BASE_PATH}/workers`;
}

export function buildGmEnvironmentCheckApiPath(): string {
  return `${GM_API_BASE_PATH}/environment/check`;
}

export function buildGmDiagnosticsQueryApiPath(): string {
  return `${GM_API_BASE_PATH}/diagnostics/query`;
}

// ── Token 存取 ──

export function getGmToken(): string {
  return sessionStorage.getItem(GM_ACCESS_TOKEN_STORAGE_KEY) ?? '';
}

export function setGmToken(value: string): void {
  sessionStorage.setItem(GM_ACCESS_TOKEN_STORAGE_KEY, value);
}

export function clearGmToken(): void {
  sessionStorage.removeItem(GM_ACCESS_TOKEN_STORAGE_KEY);
}

// ── 请求封装（工厂模式） ──

const GM_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface GmRequestDeps {
  getToken: () => string;
  onUnauthorized: (message: string) => void;
}

export function createGmRequest(deps: GmRequestDeps) {
  async function request<T>(path: string, init: RequestInit = {}, timeoutMs: number = GM_DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (deps.getToken()) {
      headers.set('Authorization', `Bearer ${deps.getToken()}`);
    }
    const controller = new AbortController();
    const externalSignal = init.signal ?? null;
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    let timedOut = false;
    const timeoutHandle = timeoutMs > 0
      ? window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
      : null;
    let response: Response;
    try {
      response = await fetch(path, { ...init, headers, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        const seconds = Math.max(1, Math.round(timeoutMs / 1000)).toString();
        throw new Error(t('gm.request.timeout', { seconds }));
      }
      throw error;
    } finally {
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    if (response.status === 401 && path !== `${GM_AUTH_API_BASE_PATH}/login`) {
      deps.onUnauthorized(t('gm.request.login-expired'));
      throw new Error(t('gm.request.expired'));
    }
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'message' in data
        ? String((data as { message: unknown }).message)
        : typeof data === 'string' && data.trim().length > 0
          ? data
          : t('gm.request.failed');
      throw new Error(message);
    }
    return data as T;
  }
  return request;
}

export function createGmRequestBlob(deps: GmRequestDeps) {
  async function requestBlob(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    if (deps.getToken()) {
      headers.set('Authorization', `Bearer ${deps.getToken()}`);
    }
    const response = await fetch(path, { ...init, headers });
    if (response.status === 401) {
      deps.onUnauthorized(t('gm.request.login-expired'));
      throw new Error(t('gm.request.expired'));
    }
    if (!response.ok) {
      throw new Error((await response.text()).trim() || t('gm.request.failed'));
    }
    return response;
  }
  return requestBlob;
}

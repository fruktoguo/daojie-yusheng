/**
 * 前端构建版本探测与自动强制刷新。
 * 只轮询低频版本文件，不进入游戏高频同步链路。
 */

import {
  CLIENT_BUILD_FORCED_RELOAD_COOLDOWN_MS,
  CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY,
  CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY,
  CLIENT_BUILD_POLL_INTERVAL_MS,
  CLIENT_BUILD_RELOAD_DELAY_MS,
  CLIENT_BUILD_RELOAD_TIME_QUERY_KEY,
  CLIENT_BUILD_RELOAD_VERSION_QUERY_KEY,
  CLIENT_BUILD_REQUEST_TIMEOUT_MS,
  CLIENT_BUILD_VERSION_PATH,
} from './constants/ui/update';

/** ClientBuildVersionResponse：版本检查响应。 */
type ClientBuildVersionResponse = {
/**
 * buildId：对象字段。
 */

  buildId?: string;  
  /**
 * builtAt：对象字段。
 */

  builtAt?: string;
};

/** StartClientVersionReloadOptions：版本检查启动时的回调选项。 */
type StartClientVersionReloadOptions = {
/**
 * onBeforeReload：对象字段。
 */

  onBeforeReload?: (nextBuildId: string) => void;
};

/** pollTimer：poll Timer。 */
let pollTimer: number | null = null;
/** pollStarted：poll Started。 */
let pollStarted = false;
/** checkInFlight：检查In Flight。 */
let checkInFlight = false;
let pollOptions: StartClientVersionReloadOptions = {};

/** clearPollTimer：清理Poll Timer。 */
function clearPollTimer(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    /** pollTimer：poll Timer。 */
    pollTimer = null;
  }
}

/** scheduleNextPoll：调度新版Poll。 */
function scheduleNextPoll(delayMs = CLIENT_BUILD_POLL_INTERVAL_MS): void {
  clearPollTimer();
  pollTimer = window.setTimeout(() => {
    void runClientBuildCheck(pollOptions);
  }, delayMs);
}

/** readSessionStorage：处理read会话存储。 */
function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** writeSessionStorage：处理write会话存储。 */
function writeSessionStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // noop
  }
}

/** hasRecentForcedReload：判断是否Recent Forced重载。 */
function hasRecentForcedReload(nextBuildId: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const lastBuildId = readSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY);
  if (lastBuildId !== nextBuildId) {
    return false;
  }
  const lastReloadAtRaw = readSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY);
  const lastReloadAt = Number(lastReloadAtRaw);
  if (!Number.isFinite(lastReloadAt) || lastReloadAt <= 0) {
    return false;
  }
  return Date.now() - lastReloadAt < CLIENT_BUILD_FORCED_RELOAD_COOLDOWN_MS;
}

/** markForcedReload：标记Forced重载。 */
function markForcedReload(nextBuildId: string): void {
  writeSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY, nextBuildId);
  writeSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY, String(Date.now()));
}

/** buildForcedReloadUrl：构建Forced重载URL。 */
function buildForcedReloadUrl(nextBuildId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(CLIENT_BUILD_RELOAD_VERSION_QUERY_KEY, nextBuildId);
  url.searchParams.set(CLIENT_BUILD_RELOAD_TIME_QUERY_KEY, String(Date.now()));
  return url.toString();
}

/** fetchLatestBuildId：处理fetch Latest Build ID。 */
async function fetchLatestBuildId(): Promise<string | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, CLIENT_BUILD_REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(CLIENT_BUILD_VERSION_PATH, window.location.origin);
    url.searchParams.set('_ts', String(Date.now()));
    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as ClientBuildVersionResponse;
    return typeof payload.buildId === 'string' && payload.buildId.length > 0 ? payload.buildId : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** runClientBuildCheck：处理run客户端Build检查。 */
async function runClientBuildCheck(options?: StartClientVersionReloadOptions): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (import.meta.env.DEV || checkInFlight) {
    return;
  }

  clearPollTimer();
  /** checkInFlight：检查In Flight。 */
  checkInFlight = true;

  try {
    if (document.visibilityState === 'hidden') {
      return;
    }

    const latestBuildId = await fetchLatestBuildId();
    if (!latestBuildId || latestBuildId === __APP_BUILD_ID__ || hasRecentForcedReload(latestBuildId)) {
      return;
    }

    options?.onBeforeReload?.(latestBuildId);
    markForcedReload(latestBuildId);
    window.setTimeout(() => {
      window.location.replace(buildForcedReloadUrl(latestBuildId));
    }, CLIENT_BUILD_RELOAD_DELAY_MS);
  } finally {
    /** checkInFlight：检查In Flight。 */
    checkInFlight = false;
    scheduleNextPoll();
  }
}

/** startClientVersionReload：启动客户端版本重载。 */
export function startClientVersionReload(options: StartClientVersionReloadOptions = {}): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (pollStarted || import.meta.env.DEV) {
    return;
  }

  /** pollStarted：poll Started。 */
  pollStarted = true;
  /** pollOptions：poll选项。 */
  pollOptions = options;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void runClientBuildCheck(pollOptions);
    }
  });

  void runClientBuildCheck(pollOptions);
}

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

type ClientBuildVersionResponse = {
  buildId?: string;
  builtAt?: string;
};

type StartClientVersionReloadOptions = {
  onBeforeReload?: (nextBuildId: string) => void;
};

let pollTimer: number | null = null;
let pollStarted = false;
let checkInFlight = false;
let pollOptions: StartClientVersionReloadOptions = {};

/** clearPollTimer：清理并清空临时数据。 */
function clearPollTimer(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}


function scheduleNextPoll(delayMs = CLIENT_BUILD_POLL_INTERVAL_MS): void {
  clearPollTimer();
  pollTimer = window.setTimeout(() => {
    void runClientBuildCheck(pollOptions);
  }, delayMs);
}


function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}


function writeSessionStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // noop
  }
}

/** hasRecentForcedReload：判断并返回条件结果。 */
function hasRecentForcedReload(nextBuildId: string): boolean {
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


function markForcedReload(nextBuildId: string): void {
  writeSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY, nextBuildId);
  writeSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY, String(Date.now()));
}

function buildForcedReloadUrl(nextBuildId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(CLIENT_BUILD_RELOAD_VERSION_QUERY_KEY, nextBuildId);
  url.searchParams.set(CLIENT_BUILD_RELOAD_TIME_QUERY_KEY, String(Date.now()));
  return url.toString();
}


async function fetchLatestBuildId(): Promise<string | null> {
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


async function runClientBuildCheck(options?: StartClientVersionReloadOptions): Promise<void> {
  if (import.meta.env.DEV || checkInFlight) {
    return;
  }

  clearPollTimer();
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
    checkInFlight = false;
    scheduleNextPoll();
  }
}


export function startClientVersionReload(options: StartClientVersionReloadOptions = {}): void {
  if (pollStarted || import.meta.env.DEV) {
    return;
  }

  pollStarted = true;
  pollOptions = options;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void runClientBuildCheck(pollOptions);
    }
  });

  void runClientBuildCheck(pollOptions);
}


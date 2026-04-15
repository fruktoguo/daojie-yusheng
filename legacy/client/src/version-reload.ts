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

/** ClientBuildVersionResponse：定义该类型的结构与数据语义。 */
type ClientBuildVersionResponse = {
  buildId?: string;
  builtAt?: string;
};

/** StartClientVersionReloadOptions：定义该类型的结构与数据语义。 */
type StartClientVersionReloadOptions = {
  onBeforeReload?: (nextBuildId: string) => void;
};

/** pollTimer：定义该变量以承载业务值。 */
let pollTimer: number | null = null;
/** pollStarted：定义该变量以承载业务值。 */
let pollStarted = false;
/** checkInFlight：定义该变量以承载业务值。 */
let checkInFlight = false;
/** pollOptions：定义该变量以承载业务值。 */
let pollOptions: StartClientVersionReloadOptions = {};

/** clearPollTimer：执行对应的业务逻辑。 */
function clearPollTimer(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/** scheduleNextPoll：执行对应的业务逻辑。 */
function scheduleNextPoll(delayMs = CLIENT_BUILD_POLL_INTERVAL_MS): void {
  clearPollTimer();
  pollTimer = window.setTimeout(() => {
    void runClientBuildCheck(pollOptions);
  }, delayMs);
}

/** readSessionStorage：执行对应的业务逻辑。 */
function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** writeSessionStorage：执行对应的业务逻辑。 */
function writeSessionStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // noop
  }
}

/** hasRecentForcedReload：执行对应的业务逻辑。 */
function hasRecentForcedReload(nextBuildId: string): boolean {
/** lastBuildId：定义该变量以承载业务值。 */
  const lastBuildId = readSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY);
  if (lastBuildId !== nextBuildId) {
    return false;
  }
/** lastReloadAtRaw：定义该变量以承载业务值。 */
  const lastReloadAtRaw = readSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY);
/** lastReloadAt：定义该变量以承载业务值。 */
  const lastReloadAt = Number(lastReloadAtRaw);
  if (!Number.isFinite(lastReloadAt) || lastReloadAt <= 0) {
    return false;
  }
  return Date.now() - lastReloadAt < CLIENT_BUILD_FORCED_RELOAD_COOLDOWN_MS;
}

/** markForcedReload：执行对应的业务逻辑。 */
function markForcedReload(nextBuildId: string): void {
  writeSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY, nextBuildId);
  writeSessionStorage(CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY, String(Date.now()));
}

/** buildForcedReloadUrl：执行对应的业务逻辑。 */
function buildForcedReloadUrl(nextBuildId: string): string {
/** url：定义该变量以承载业务值。 */
  const url = new URL(window.location.href);
  url.searchParams.set(CLIENT_BUILD_RELOAD_VERSION_QUERY_KEY, nextBuildId);
  url.searchParams.set(CLIENT_BUILD_RELOAD_TIME_QUERY_KEY, String(Date.now()));
  return url.toString();
}

/** fetchLatestBuildId：执行对应的业务逻辑。 */
async function fetchLatestBuildId(): Promise<string | null> {
/** controller：定义该变量以承载业务值。 */
  const controller = new AbortController();
/** timeoutId：定义该变量以承载业务值。 */
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, CLIENT_BUILD_REQUEST_TIMEOUT_MS);

  try {
/** url：定义该变量以承载业务值。 */
    const url = new URL(CLIENT_BUILD_VERSION_PATH, window.location.origin);
    url.searchParams.set('_ts', String(Date.now()));
/** response：定义该变量以承载业务值。 */
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
/** payload：定义该变量以承载业务值。 */
    const payload = await response.json() as ClientBuildVersionResponse;
    return typeof payload.buildId === 'string' && payload.buildId.length > 0 ? payload.buildId : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** runClientBuildCheck：执行对应的业务逻辑。 */
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

/** latestBuildId：定义该变量以承载业务值。 */
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

/** startClientVersionReload：执行对应的业务逻辑。 */
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


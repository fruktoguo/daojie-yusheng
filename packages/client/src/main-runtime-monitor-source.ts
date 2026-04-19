import type { GameTimeState } from '@mud/shared-next';
import {
  CONNECTION_RECOVERY_RETRY_MS,
  CURRENT_TIME_REFRESH_MS,
  GAME_TIME_PHASES,
  SERVER_PING_INTERVAL_MS,
  SOCKET_PING_TIMEOUT_MS,
} from '@mud/shared-next';
import {
  MAP_FPS_SAMPLE_INTERVAL_MS,
  MAP_FPS_SAMPLE_WINDOW_SIZE,
} from './constants/ui/performance';
import type { MapRuntime } from './game-map/runtime/map-runtime';
import type { SocketRuntimeSender } from './network/socket-send-runtime';

type FpsSampleStats = {
  fps: number | null;
  low: number | null;
  onePercentLow: number | null;
};

type MainRuntimeMonitorSourceOptions = {
  mapRuntime: Pick<MapRuntime, 'setTickDurationMs'>;
  connection: Pick<import('./network/socket').SocketManager, 'connected' | 'reconnect'>;
  runtimeSender: Pick<SocketRuntimeSender, 'sendPing'>;
  login: {
    hasRefreshToken: () => boolean;
    restoreSession: () => Promise<boolean>;
    getAccessToken: () => string | null;
  };
  documentRef: Document;
  windowRef: Window;
  locationHost: string;
  syncEstimatedServerTickInterval: (dtMs: number) => void;
  showToast: (message: string) => void;
  onBeforeVersionReload: () => void;
};

type MainRuntimeMonitorElements = {
  currentTimeEl: HTMLElement | null;
  currentTimePhaseEl: HTMLElement | null;
  currentTimeHourAEl: HTMLElement | null;
  currentTimeHourBEl: HTMLElement | null;
  currentTimeDotEl: HTMLElement | null;
  currentTimeMinAEl: HTMLElement | null;
  currentTimeMinBEl: HTMLElement | null;
  tickRateEl: HTMLElement | null;
  tickRateIntEl: HTMLElement | null;
  tickRateDotEl: HTMLElement | null;
  tickRateFracAEl: HTMLElement | null;
  tickRateFracBEl: HTMLElement | null;
  fpsRateEl: HTMLElement | null;
  fpsValueEl: HTMLElement | null;
  fpsLowValueEl: HTMLElement | null;
  fpsOnePercentValueEl: HTMLElement | null;
  pingLatencyEl: HTMLElement | null;
  pingUnitEl: HTMLElement | null;
  pingHundredsEl: HTMLElement | null;
  pingTensEl: HTMLElement | null;
  pingOnesEl: HTMLElement | null;
};

export type MainRuntimeMonitorSource = ReturnType<typeof createMainRuntimeMonitorSource>;

export function createMainRuntimeMonitorSource(
  options: MainRuntimeMonitorSourceOptions,
  elements: MainRuntimeMonitorElements,
) {
  let connectionRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let connectionRecoveryPromise: Promise<void> | null = null;
  let pingTimer: ReturnType<typeof setTimeout> | null = null;
  let pingRequestSerial = 0;
  let pendingSocketPing:
    | {
        serial: number;
        clientAt: number;
        timeoutId: ReturnType<typeof setTimeout>;
      }
    | null = null;
  let currentTimeState: GameTimeState | null = null;
  let currentTimeStateSyncedAt = performance.now();
  let currentTimeTickIntervalMs = 1000;
  let currentTimeIntervalId: number | null = null;
  let fpsMonitorFrameRequestId: number | null = null;
  let fpsMonitorEnabled = false;
  let fpsSampleFrameCount = 0;
  let fpsSampleStartedAt = performance.now();
  let fpsLastFrameAt = 0;
  let fpsFrameDurations: number[] = [];
  let fpsFrameDurationWriteIndex = 0;

  function formatFpsMetric(value: number | null): string {
    if (value === null) {
      return '---';
    }
    return String(Math.min(999, Math.max(0, Math.round(value)))).padStart(3, '0');
  }

  function renderFpsStats(stats: FpsSampleStats): void {
    if (elements.fpsValueEl) {
      elements.fpsValueEl.textContent = formatFpsMetric(stats.fps);
    }
    if (elements.fpsLowValueEl) {
      elements.fpsLowValueEl.textContent = formatFpsMetric(stats.low);
    }
    if (elements.fpsOnePercentValueEl) {
      elements.fpsOnePercentValueEl.textContent = formatFpsMetric(stats.onePercentLow);
    }
    if (elements.fpsRateEl) {
      elements.fpsRateEl.setAttribute(
        'title',
        stats.fps === null
          ? '客户端当前渲染帧率未采样'
          : `客户端当前渲染帧率约 ${Math.round(stats.fps)} FPS，LOW ${Math.round(stats.low ?? stats.fps)}，1% LOW ${Math.round(stats.onePercentLow ?? stats.fps)}`,
      );
    }
  }

  function resetFpsMonitorSamples(now = performance.now()): void {
    fpsSampleFrameCount = 0;
    fpsSampleStartedAt = now;
    fpsLastFrameAt = 0;
    fpsFrameDurations = [];
    fpsFrameDurationWriteIndex = 0;
  }

  function appendFpsFrameDuration(frameDurationMs: number): void {
    const safeDuration = Math.max(1, frameDurationMs);
    if (fpsFrameDurations.length < MAP_FPS_SAMPLE_WINDOW_SIZE) {
      fpsFrameDurations.push(safeDuration);
      fpsFrameDurationWriteIndex = fpsFrameDurations.length % MAP_FPS_SAMPLE_WINDOW_SIZE;
      return;
    }
    fpsFrameDurations[fpsFrameDurationWriteIndex] = safeDuration;
    fpsFrameDurationWriteIndex = (fpsFrameDurationWriteIndex + 1) % MAP_FPS_SAMPLE_WINDOW_SIZE;
  }

  function resolveFpsLowStats(): Pick<FpsSampleStats, 'low' | 'onePercentLow'> {
    if (fpsFrameDurations.length === 0) {
      return { low: null, onePercentLow: null };
    }
    const sortedDurations = [...fpsFrameDurations].sort((left, right) => right - left);
    const slowestDuration = sortedDurations[0] ?? null;
    const onePercentCount = Math.max(1, Math.ceil(sortedDurations.length * 0.01));
    let onePercentTotalDuration = 0;
    for (let index = 0; index < onePercentCount; index += 1) {
      onePercentTotalDuration += sortedDurations[index] ?? 0;
    }
    return {
      low: slowestDuration === null ? null : 1000 / slowestDuration,
      onePercentLow: onePercentTotalDuration > 0 ? 1000 / (onePercentTotalDuration / onePercentCount) : null,
    };
  }

  function tickFpsMonitor(now: number): void {
    if (!fpsMonitorEnabled) {
      fpsMonitorFrameRequestId = null;
      return;
    }

    if (fpsLastFrameAt > 0) {
      const frameDuration = now - fpsLastFrameAt;
      if (frameDuration <= 1000) {
        appendFpsFrameDuration(frameDuration);
      } else {
        resetFpsMonitorSamples(now);
      }
    }
    fpsLastFrameAt = now;
    fpsSampleFrameCount += 1;

    const elapsed = now - fpsSampleStartedAt;
    if (elapsed >= MAP_FPS_SAMPLE_INTERVAL_MS) {
      const averageFps = fpsSampleFrameCount * 1000 / elapsed;
      const lowStats = resolveFpsLowStats();
      renderFpsStats({
        fps: averageFps,
        low: lowStats.low,
        onePercentLow: lowStats.onePercentLow,
      });
      fpsSampleFrameCount = 0;
      fpsSampleStartedAt = now;
    }

    fpsMonitorFrameRequestId = options.windowRef.requestAnimationFrame(tickFpsMonitor);
  }

  function startFpsMonitor(): void {
    if (
      fpsMonitorEnabled ||
      !elements.fpsRateEl ||
      !elements.fpsValueEl ||
      !elements.fpsLowValueEl ||
      !elements.fpsOnePercentValueEl
    ) {
      return;
    }
    fpsMonitorEnabled = true;
    elements.fpsRateEl.hidden = false;
    resetFpsMonitorSamples();
    renderFpsStats({ fps: null, low: null, onePercentLow: null });
    fpsMonitorFrameRequestId = options.windowRef.requestAnimationFrame(tickFpsMonitor);
  }

  function stopFpsMonitor(): void {
    fpsMonitorEnabled = false;
    if (fpsMonitorFrameRequestId !== null) {
      options.windowRef.cancelAnimationFrame(fpsMonitorFrameRequestId);
      fpsMonitorFrameRequestId = null;
    }
    resetFpsMonitorSamples();
    renderFpsStats({ fps: null, low: null, onePercentLow: null });
    if (elements.fpsRateEl) {
      elements.fpsRateEl.hidden = true;
    }
  }

  function syncFpsMonitorVisibility(showFpsMonitor: boolean): void {
    if (showFpsMonitor) {
      startFpsMonitor();
      return;
    }
    stopFpsMonitor();
  }

  function renderTickRate(seconds: number): void {
    const [integer, fraction] = seconds.toFixed(2).split('.');
    if (elements.tickRateIntEl) elements.tickRateIntEl.textContent = integer;
    if (elements.tickRateDotEl) elements.tickRateDotEl.textContent = '.';
    if (elements.tickRateFracAEl) elements.tickRateFracAEl.textContent = fraction[0] ?? '0';
    if (elements.tickRateFracBEl) elements.tickRateFracBEl.textContent = fraction[1] ?? '0';
  }

  function resolveDisplayedLocalTicks(state: GameTimeState | null, now = performance.now()): number | null {
    if (!state) {
      return null;
    }
    const dayLength = Math.max(1, state.dayLength);
    const timeScale = Number.isFinite(state.timeScale) && state.timeScale >= 0 ? state.timeScale : 1;
    const tickIntervalMs = Math.max(1, currentTimeTickIntervalMs);
    const elapsedMs = Math.max(0, now - currentTimeStateSyncedAt);
    const elapsedTicks = elapsedMs / tickIntervalMs * timeScale;
    return ((state.localTicks + elapsedTicks) % dayLength + dayLength) % dayLength;
  }

  function resolveDisplayedPhaseLabel(state: GameTimeState, localTicks: number): string {
    const phase = GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick);
    return phase?.label ?? state.phaseLabel;
  }

  function renderCurrentTime(state: GameTimeState | null, now = performance.now()): void {
    const localTicks = resolveDisplayedLocalTicks(state, now);
    const totalMinutes = localTicks === null
      ? null
      : Math.floor((localTicks / Math.max(1, state?.dayLength ?? 1)) * 24 * 60);
    const hours = totalMinutes === null ? '--' : String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const minutes = totalMinutes === null ? '--' : String(totalMinutes % 60).padStart(2, '0');
    const phaseLabel = state && localTicks !== null ? resolveDisplayedPhaseLabel(state, localTicks) : '未明';
    if (elements.currentTimeHourAEl) elements.currentTimeHourAEl.textContent = hours[0] ?? '-';
    if (elements.currentTimeHourBEl) elements.currentTimeHourBEl.textContent = hours[1] ?? '-';
    if (elements.currentTimeDotEl) elements.currentTimeDotEl.textContent = ':';
    if (elements.currentTimeMinAEl) elements.currentTimeMinAEl.textContent = minutes[0] ?? '-';
    if (elements.currentTimeMinBEl) elements.currentTimeMinBEl.textContent = minutes[1] ?? '-';
    if (elements.currentTimePhaseEl) elements.currentTimePhaseEl.textContent = phaseLabel;
    if (elements.currentTimeEl) {
      elements.currentTimeEl.setAttribute('title', state ? `${phaseLabel} ${hours}:${minutes}` : '当前时间未同步');
    }
  }

  function syncCurrentTimeState(state: GameTimeState | null): void {
    currentTimeState = state;
    currentTimeStateSyncedAt = performance.now();
    renderCurrentTime(currentTimeState, currentTimeStateSyncedAt);
  }

  function syncCurrentTimeTickInterval(dtMs: number | null | undefined): void {
    if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }
    currentTimeTickIntervalMs = dtMs;
    options.syncEstimatedServerTickInterval(dtMs);
    options.mapRuntime.setTickDurationMs(Math.max(1, Math.round(dtMs * 0.5)));
  }

  function renderPingLatency(latencyMs: number | null, status = '毫秒'): void {
    const digits = (() => {
      if (latencyMs === null) {
        return ['-', '-', '-'];
      }
      const rounded = String(Math.min(999, Math.max(0, Math.round(latencyMs))));
      if (rounded.length >= 3) {
        return rounded.split('');
      }
      if (rounded.length === 2) {
        return ['·', rounded[0], rounded[1]];
      }
      return ['·', '·', rounded[0] ?? '0'];
    })();
    if (elements.pingHundredsEl) elements.pingHundredsEl.textContent = digits[0] ?? '-';
    if (elements.pingTensEl) elements.pingTensEl.textContent = digits[1] ?? '-';
    if (elements.pingOnesEl) elements.pingOnesEl.textContent = digits[2] ?? '-';
    if (elements.pingUnitEl) elements.pingUnitEl.textContent = status;
    if (elements.pingLatencyEl) {
      const title = latencyMs === null
        ? `当前域名 ${options.locationHost} 的服务器延迟${status === '离线' ? '不可用' : `状态：${status}`}`
        : `当前域名 ${options.locationHost} 上游戏连接往返约 ${Math.round(latencyMs)}ms`;
      elements.pingLatencyEl.setAttribute('title', title);
    }
  }

  async function waitFor(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      options.windowRef.setTimeout(resolve, ms);
    });
  }

  async function recoverConnection(forceRefresh = false): Promise<void> {
    if (connectionRecoveryPromise) {
      return connectionRecoveryPromise;
    }
    connectionRecoveryPromise = (async () => {
      if (options.documentRef.visibilityState === 'hidden') {
        return;
      }
      if (options.connection.connected || !options.login.hasRefreshToken()) {
        return;
      }

      const accessToken = forceRefresh ? null : options.login.getAccessToken();
      if (accessToken) {
        options.connection.reconnect(accessToken);
        await waitFor(CONNECTION_RECOVERY_RETRY_MS);
        if (options.connection.connected) {
          return;
        }
      }

      await options.login.restoreSession();
    })().finally(() => {
      connectionRecoveryPromise = null;
    });
    return connectionRecoveryPromise;
  }

  function scheduleConnectionRecovery(delayMs = 0, forceRefresh = false): void {
    if (connectionRecoveryTimer !== null) {
      options.windowRef.clearTimeout(connectionRecoveryTimer);
    }
    connectionRecoveryTimer = options.windowRef.setTimeout(() => {
      connectionRecoveryTimer = null;
      void recoverConnection(forceRefresh);
    }, delayMs);
  }

  function clearPendingSocketPing(): void {
    if (!pendingSocketPing) {
      return;
    }
    options.windowRef.clearTimeout(pendingSocketPing.timeoutId);
    pendingSocketPing = null;
  }

  function markSocketPingTimeout(serial: number): void {
    if (!pendingSocketPing || pendingSocketPing.serial !== serial) {
      return;
    }
    pendingSocketPing = null;
    renderPingLatency(null, options.connection.connected ? '超时' : '离线');
  }

  function sampleServerPing(): void {
    if (options.documentRef.visibilityState === 'hidden') {
      return;
    }
    clearPendingSocketPing();
    if (!navigator.onLine) {
      renderPingLatency(null, '断网');
      return;
    }
    if (!options.connection.connected) {
      renderPingLatency(null, options.login.hasRefreshToken() ? '重连' : '离线');
      return;
    }
    const serial = ++pingRequestSerial;
    const clientAt = performance.now();
    options.runtimeSender.sendPing(clientAt);
    const timeoutId = options.windowRef.setTimeout(() => {
      markSocketPingTimeout(serial);
    }, SOCKET_PING_TIMEOUT_MS);
    pendingSocketPing = { serial, clientAt, timeoutId };
  }

  function stopPingLoop(): void {
    if (pingTimer !== null) {
      options.windowRef.clearTimeout(pingTimer);
      pingTimer = null;
    }
    clearPendingSocketPing();
  }

  function scheduleNextPing(delayMs = SERVER_PING_INTERVAL_MS): void {
    if (pingTimer !== null) {
      options.windowRef.clearTimeout(pingTimer);
    }
    pingTimer = options.windowRef.setTimeout(() => {
      pingTimer = null;
      sampleServerPing();
      scheduleNextPing(SERVER_PING_INTERVAL_MS);
    }, delayMs);
  }

  function restartPingLoop(immediate = true): void {
    stopPingLoop();
    if (options.documentRef.visibilityState === 'hidden') {
      return;
    }
    if (!immediate) {
      scheduleNextPing();
      return;
    }
    sampleServerPing();
    scheduleNextPing(SERVER_PING_INTERVAL_MS);
  }

  function handlePong(data: { clientAt: number }): void {
    if (!pendingSocketPing || data.clientAt !== pendingSocketPing.clientAt) {
      return;
    }
    options.windowRef.clearTimeout(pendingSocketPing.timeoutId);
    pendingSocketPing = null;
    renderPingLatency(performance.now() - data.clientAt);
  }

  function initialize(showFpsMonitor: boolean): void {
    renderTickRate(1);
    syncFpsMonitorVisibility(showFpsMonitor);
    renderCurrentTime(null);
    renderPingLatency(null, '待测');
    if (currentTimeIntervalId !== null) {
      options.windowRef.clearInterval(currentTimeIntervalId);
    }
    currentTimeIntervalId = options.windowRef.setInterval(() => {
      if (!currentTimeState) {
        return;
      }
      renderCurrentTime(currentTimeState);
    }, CURRENT_TIME_REFRESH_MS);
  }

  return {
    initialize,
    handleVersionReloadBefore: options.onBeforeVersionReload,
    syncFpsMonitorVisibility,
    syncCurrentTimeState,
    syncCurrentTimeTickInterval,
    getCurrentTimeState(): GameTimeState | null {
      return currentTimeState;
    },
    renderPingLatency,
    clearPendingSocketPing,
    scheduleConnectionRecovery,
    restartPingLoop,
    stopPingLoop,
    handlePong,
    getDocumentVisibilityState(): DocumentVisibilityState {
      return options.documentRef.visibilityState;
    },
  };
}

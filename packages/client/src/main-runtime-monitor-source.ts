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
/**
 * FpsSampleStats：统一结构类型，保证协议与运行时一致性。
 */


type FpsSampleStats = {
/**
 * fps：对象字段。
 */

  fps: number | null;  
  /**
 * low：对象字段。
 */

  low: number | null;  
  /**
 * onePercentLow：对象字段。
 */

  onePercentLow: number | null;
};
/**
 * MainRuntimeMonitorSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeMonitorSourceOptions = {
/**
 * mapRuntime：对象字段。
 */

  mapRuntime: Pick<MapRuntime, 'setTickDurationMs'>;  
  /**
 * connection：对象字段。
 */

  connection: Pick<import('./network/socket').SocketManager, 'connected' | 'reconnect'>;  
  /**
 * runtimeSender：对象字段。
 */

  runtimeSender: Pick<SocketRuntimeSender, 'sendPing'>;  
  /**
 * login：对象字段。
 */

  login: {  
  /**
 * hasRefreshToken：对象字段。
 */

    hasRefreshToken: () => boolean;    
    /**
 * restoreSession：对象字段。
 */

    restoreSession: () => Promise<boolean>;    
    /**
 * getAccessToken：对象字段。
 */

    getAccessToken: () => string | null;
  };  
  /**
 * documentRef：对象字段。
 */

  documentRef: Document;  
  /**
 * windowRef：对象字段。
 */

  windowRef: Window;  
  /**
 * locationHost：对象字段。
 */

  locationHost: string;  
  /**
 * syncEstimatedServerTickInterval：对象字段。
 */

  syncEstimatedServerTickInterval: (dtMs: number) => void;  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;  
  /**
 * onBeforeVersionReload：对象字段。
 */

  onBeforeVersionReload: () => void;
};
/**
 * MainRuntimeMonitorElements：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeMonitorElements = {
/**
 * currentTimeEl：对象字段。
 */

  currentTimeEl: HTMLElement | null;  
  /**
 * currentTimePhaseEl：对象字段。
 */

  currentTimePhaseEl: HTMLElement | null;  
  /**
 * currentTimeHourAEl：对象字段。
 */

  currentTimeHourAEl: HTMLElement | null;  
  /**
 * currentTimeHourBEl：对象字段。
 */

  currentTimeHourBEl: HTMLElement | null;  
  /**
 * currentTimeDotEl：对象字段。
 */

  currentTimeDotEl: HTMLElement | null;  
  /**
 * currentTimeMinAEl：对象字段。
 */

  currentTimeMinAEl: HTMLElement | null;  
  /**
 * currentTimeMinBEl：对象字段。
 */

  currentTimeMinBEl: HTMLElement | null;  
  /**
 * tickRateEl：对象字段。
 */

  tickRateEl: HTMLElement | null;  
  /**
 * tickRateIntEl：对象字段。
 */

  tickRateIntEl: HTMLElement | null;  
  /**
 * tickRateDotEl：对象字段。
 */

  tickRateDotEl: HTMLElement | null;  
  /**
 * tickRateFracAEl：对象字段。
 */

  tickRateFracAEl: HTMLElement | null;  
  /**
 * tickRateFracBEl：对象字段。
 */

  tickRateFracBEl: HTMLElement | null;  
  /**
 * fpsRateEl：对象字段。
 */

  fpsRateEl: HTMLElement | null;  
  /**
 * fpsValueEl：对象字段。
 */

  fpsValueEl: HTMLElement | null;  
  /**
 * fpsLowValueEl：对象字段。
 */

  fpsLowValueEl: HTMLElement | null;  
  /**
 * fpsOnePercentValueEl：对象字段。
 */

  fpsOnePercentValueEl: HTMLElement | null;  
  /**
 * pingLatencyEl：对象字段。
 */

  pingLatencyEl: HTMLElement | null;  
  /**
 * pingUnitEl：对象字段。
 */

  pingUnitEl: HTMLElement | null;  
  /**
 * pingHundredsEl：对象字段。
 */

  pingHundredsEl: HTMLElement | null;  
  /**
 * pingTensEl：对象字段。
 */

  pingTensEl: HTMLElement | null;  
  /**
 * pingOnesEl：对象字段。
 */

  pingOnesEl: HTMLElement | null;
};
/**
 * MainRuntimeMonitorSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainRuntimeMonitorSource = ReturnType<typeof createMainRuntimeMonitorSource>;
/**
 * createMainRuntimeMonitorSource：构建并返回目标对象。
 * @param options MainRuntimeMonitorSourceOptions 选项参数。
 * @param elements MainRuntimeMonitorElements 参数说明。
 * @returns 函数返回值。
 */


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
    /**
 * serial：对象字段。
 */

        serial: number;        
        /**
 * clientAt：对象字段。
 */

        clientAt: number;        
        /**
 * timeoutId：对象字段。
 */

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
  /**
 * formatFpsMetric：执行核心业务逻辑。
 * @param value number | null 参数说明。
 * @returns string。
 */


  function formatFpsMetric(value: number | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (value === null) {
      return '---';
    }
    return String(Math.min(999, Math.max(0, Math.round(value)))).padStart(3, '0');
  }  
  /**
 * renderFpsStats：执行核心业务逻辑。
 * @param stats FpsSampleStats 参数说明。
 * @returns void。
 */


  function renderFpsStats(stats: FpsSampleStats): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * resetFpsMonitorSamples：执行核心业务逻辑。
 * @param now 参数说明。
 * @returns void。
 */


  function resetFpsMonitorSamples(now = performance.now()): void {
    fpsSampleFrameCount = 0;
    fpsSampleStartedAt = now;
    fpsLastFrameAt = 0;
    fpsFrameDurations = [];
    fpsFrameDurationWriteIndex = 0;
  }  
  /**
 * appendFpsFrameDuration：执行核心业务逻辑。
 * @param frameDurationMs number 参数说明。
 * @returns void。
 */


  function appendFpsFrameDuration(frameDurationMs: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const safeDuration = Math.max(1, frameDurationMs);
    if (fpsFrameDurations.length < MAP_FPS_SAMPLE_WINDOW_SIZE) {
      fpsFrameDurations.push(safeDuration);
      fpsFrameDurationWriteIndex = fpsFrameDurations.length % MAP_FPS_SAMPLE_WINDOW_SIZE;
      return;
    }
    fpsFrameDurations[fpsFrameDurationWriteIndex] = safeDuration;
    fpsFrameDurationWriteIndex = (fpsFrameDurationWriteIndex + 1) % MAP_FPS_SAMPLE_WINDOW_SIZE;
  }  
  /**
 * resolveFpsLowStats：执行核心业务逻辑。
 * @returns Pick<FpsSampleStats, 'low' | 'onePercentLow'>。
 */


  function resolveFpsLowStats(): Pick<FpsSampleStats, 'low' | 'onePercentLow'> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * tickFpsMonitor：执行核心业务逻辑。
 * @param now number 参数说明。
 * @returns void。
 */


  function tickFpsMonitor(now: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * startFpsMonitor：执行核心业务逻辑。
 * @returns void。
 */


  function startFpsMonitor(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * stopFpsMonitor：执行核心业务逻辑。
 * @returns void。
 */


  function stopFpsMonitor(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * syncFpsMonitorVisibility：执行核心业务逻辑。
 * @param showFpsMonitor boolean 参数说明。
 * @returns void。
 */


  function syncFpsMonitorVisibility(showFpsMonitor: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (showFpsMonitor) {
      startFpsMonitor();
      return;
    }
    stopFpsMonitor();
  }  
  /**
 * renderTickRate：执行核心业务逻辑。
 * @param seconds number 参数说明。
 * @returns void。
 */


  function renderTickRate(seconds: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const [integer, fraction] = seconds.toFixed(2).split('.');
    if (elements.tickRateIntEl) elements.tickRateIntEl.textContent = integer;
    if (elements.tickRateDotEl) elements.tickRateDotEl.textContent = '.';
    if (elements.tickRateFracAEl) elements.tickRateFracAEl.textContent = fraction[0] ?? '0';
    if (elements.tickRateFracBEl) elements.tickRateFracBEl.textContent = fraction[1] ?? '0';
  }  
  /**
 * resolveDisplayedLocalTicks：执行核心业务逻辑。
 * @param state GameTimeState | null 状态对象。
 * @param now 参数说明。
 * @returns number | null。
 */


  function resolveDisplayedLocalTicks(state: GameTimeState | null, now = performance.now()): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * resolveDisplayedPhaseLabel：执行核心业务逻辑。
 * @param state GameTimeState 状态对象。
 * @param localTicks number 参数说明。
 * @returns string。
 */


  function resolveDisplayedPhaseLabel(state: GameTimeState, localTicks: number): string {
    const phase = GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick);
    return phase?.label ?? state.phaseLabel;
  }  
  /**
 * renderCurrentTime：执行核心业务逻辑。
 * @param state GameTimeState | null 状态对象。
 * @param now 参数说明。
 * @returns void。
 */


  function renderCurrentTime(state: GameTimeState | null, now = performance.now()): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * syncCurrentTimeState：执行核心业务逻辑。
 * @param state GameTimeState | null 状态对象。
 * @returns void。
 */


  function syncCurrentTimeState(state: GameTimeState | null): void {
    currentTimeState = state;
    currentTimeStateSyncedAt = performance.now();
    renderCurrentTime(currentTimeState, currentTimeStateSyncedAt);
  }  
  /**
 * syncCurrentTimeTickInterval：执行核心业务逻辑。
 * @param dtMs number | null | undefined 参数说明。
 * @returns void。
 */


  function syncCurrentTimeTickInterval(dtMs: number | null | undefined): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }
    currentTimeTickIntervalMs = dtMs;
    options.syncEstimatedServerTickInterval(dtMs);
    options.mapRuntime.setTickDurationMs(Math.max(1, Math.round(dtMs * 0.5)));
  }  
  /**
 * renderPingLatency：执行核心业务逻辑。
 * @param latencyMs number | null 参数说明。
 * @param status 参数说明。
 * @returns void。
 */


  function renderPingLatency(latencyMs: number | null, status = '毫秒'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * waitFor：执行核心业务逻辑。
 * @param ms number 参数说明。
 * @returns Promise<void>。
 */


  async function waitFor(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      options.windowRef.setTimeout(resolve, ms);
    });
  }  
  /**
 * recoverConnection：执行核心业务逻辑。
 * @param forceRefresh 参数说明。
 * @returns Promise<void>。
 */


  async function recoverConnection(forceRefresh = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * scheduleConnectionRecovery：执行核心业务逻辑。
 * @param delayMs 参数说明。
 * @param forceRefresh 参数说明。
 * @returns void。
 */


  function scheduleConnectionRecovery(delayMs = 0, forceRefresh = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (connectionRecoveryTimer !== null) {
      options.windowRef.clearTimeout(connectionRecoveryTimer);
    }
    connectionRecoveryTimer = options.windowRef.setTimeout(() => {
      connectionRecoveryTimer = null;
      void recoverConnection(forceRefresh);
    }, delayMs);
  }  
  /**
 * clearPendingSocketPing：执行核心业务逻辑。
 * @returns void。
 */


  function clearPendingSocketPing(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!pendingSocketPing) {
      return;
    }
    options.windowRef.clearTimeout(pendingSocketPing.timeoutId);
    pendingSocketPing = null;
  }  
  /**
 * markSocketPingTimeout：执行核心业务逻辑。
 * @param serial number 参数说明。
 * @returns void。
 */


  function markSocketPingTimeout(serial: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!pendingSocketPing || pendingSocketPing.serial !== serial) {
      return;
    }
    pendingSocketPing = null;
    renderPingLatency(null, options.connection.connected ? '超时' : '离线');
  }  
  /**
 * sampleServerPing：执行核心业务逻辑。
 * @returns void。
 */


  function sampleServerPing(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * stopPingLoop：执行核心业务逻辑。
 * @returns void。
 */


  function stopPingLoop(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (pingTimer !== null) {
      options.windowRef.clearTimeout(pingTimer);
      pingTimer = null;
    }
    clearPendingSocketPing();
  }  
  /**
 * scheduleNextPing：执行核心业务逻辑。
 * @param delayMs 参数说明。
 * @returns void。
 */


  function scheduleNextPing(delayMs = SERVER_PING_INTERVAL_MS): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (pingTimer !== null) {
      options.windowRef.clearTimeout(pingTimer);
    }
    pingTimer = options.windowRef.setTimeout(() => {
      pingTimer = null;
      sampleServerPing();
      scheduleNextPing(SERVER_PING_INTERVAL_MS);
    }, delayMs);
  }  
  /**
 * restartPingLoop：执行核心业务逻辑。
 * @param immediate 参数说明。
 * @returns void。
 */


  function restartPingLoop(immediate = true): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * handlePong：处理事件并驱动执行路径。
 * @param data { clientAt: number } 原始数据。
 * @returns void。
 */


  function handlePong(data: {  
  /**
 * clientAt：对象字段。
 */
 clientAt: number }): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!pendingSocketPing || data.clientAt !== pendingSocketPing.clientAt) {
      return;
    }
    options.windowRef.clearTimeout(pendingSocketPing.timeoutId);
    pendingSocketPing = null;
    renderPingLatency(performance.now() - data.clientAt);
  }  
  /**
 * initialize：初始化并准备运行时基础状态。
 * @param showFpsMonitor boolean 参数说明。
 * @returns void。
 */


  function initialize(showFpsMonitor: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * getCurrentTimeState：按给定条件读取/查询数据。
 * @returns GameTimeState | null。
 */

    getCurrentTimeState(): GameTimeState | null {
      return currentTimeState;
    },
    renderPingLatency,
    clearPendingSocketPing,
    scheduleConnectionRecovery,
    restartPingLoop,
    stopPingLoop,
    handlePong,    
    /**
 * getDocumentVisibilityState：按给定条件读取/查询数据。
 * @returns DocumentVisibilityState。
 */

    getDocumentVisibilityState(): DocumentVisibilityState {
      return options.documentRef.visibilityState;
    },
  };
}

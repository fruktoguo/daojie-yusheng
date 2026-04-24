import type { GameTimeState } from '@mud/shared';
import {
  CONNECTION_RECOVERY_RETRY_MS,
  CURRENT_TIME_REFRESH_MS,
  GAME_TIME_PHASES,
  SERVER_PING_INTERVAL_MS,
  SOCKET_PING_TIMEOUT_MS,
} from '@mud/shared';
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
 * fps：fp相关字段。
 */

  fps: number | null;  
  /**
 * low：low相关字段。
 */

  low: number | null;  
  /**
 * onePercentLow：onePercentLow相关字段。
 */

  onePercentLow: number | null;
};
/**
 * MainRuntimeMonitorSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeMonitorSourceOptions = {
/**
 * mapRuntime：地图运行态引用。
 */

  mapRuntime: Pick<MapRuntime, 'setTickDurationMs'>;  
  /**
 * connection：connection相关字段。
 */

  connection: Pick<import('./network/socket').SocketManager, 'connected' | 'reconnect'>;  
  /**
 * runtimeSender：运行态Sender相关字段。
 */

  runtimeSender: Pick<SocketRuntimeSender, 'sendPing'>;  
  /**
 * login：login相关字段。
 */

  login: {  
  /**
 * hasRefreshToken：启用开关或状态标识。
 */

    hasRefreshToken: () => boolean;    
    /**
 * restoreSession：restoreSession相关字段。
 */

    restoreSession: () => Promise<boolean>;    
    /**
 * getAccessToken：AccessToken标识。
 */

    getAccessToken: () => string | null;
  };  
  /**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;  
  /**
 * windowRef：窗口Ref相关字段。
 */

  windowRef: Window;  
  /**
 * locationHost：位置Host相关字段。
 */

  locationHost: string;  
  /**
 * syncEstimatedServerTickInterval：EstimatedServertickInterval相关字段。
 */

  syncEstimatedServerTickInterval: (dtMs: number) => void;  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;  
  /**
 * onBeforeVersionReload：onBeforeVersionReload相关字段。
 */

  onBeforeVersionReload: () => void;
};
/**
 * MainRuntimeMonitorElements：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeMonitorElements = {
/**
 * currentTimeEl：current时间El相关字段。
 */

  currentTimeEl: HTMLElement | null;  
  /**
 * currentTimePhaseEl：current时间PhaseEl相关字段。
 */

  currentTimePhaseEl: HTMLElement | null;  
  /**
 * currentTimeHourAEl：current时间HourAEl相关字段。
 */

  currentTimeHourAEl: HTMLElement | null;  
  /**
 * currentTimeHourBEl：current时间HourBEl相关字段。
 */

  currentTimeHourBEl: HTMLElement | null;  
  /**
 * currentTimeDotEl：current时间DotEl相关字段。
 */

  currentTimeDotEl: HTMLElement | null;  
  /**
 * currentTimeMinAEl：current时间MinAEl相关字段。
 */

  currentTimeMinAEl: HTMLElement | null;  
  /**
 * currentTimeMinBEl：current时间MinBEl相关字段。
 */

  currentTimeMinBEl: HTMLElement | null;  
  /**
 * tickRateEl：tickRateEl相关字段。
 */

  tickRateEl: HTMLElement | null;  
  /**
 * tickRateIntEl：tickRateIntEl相关字段。
 */

  tickRateIntEl: HTMLElement | null;  
  /**
 * tickRateDotEl：tickRateDotEl相关字段。
 */

  tickRateDotEl: HTMLElement | null;  
  /**
 * tickRateFracAEl：tickRateFracAEl相关字段。
 */

  tickRateFracAEl: HTMLElement | null;  
  /**
 * tickRateFracBEl：tickRateFracBEl相关字段。
 */

  tickRateFracBEl: HTMLElement | null;  
  /**
 * fpsRateEl：fpRateEl相关字段。
 */

  fpsRateEl: HTMLElement | null;  
  /**
 * fpsValueEl：fp值El相关字段。
 */

  fpsValueEl: HTMLElement | null;  
  /**
 * fpsLowValueEl：fpLow值El相关字段。
 */

  fpsLowValueEl: HTMLElement | null;  
  /**
 * fpsOnePercentValueEl：fpOnePercent值El相关字段。
 */

  fpsOnePercentValueEl: HTMLElement | null;  
  /**
 * pingLatencyEl：pingLatencyEl相关字段。
 */

  pingLatencyEl: HTMLElement | null;  
  /**
 * pingUnitEl：pingUnitEl相关字段。
 */

  pingUnitEl: HTMLElement | null;  
  /**
 * pingHundredsEl：pingHundredEl相关字段。
 */

  pingHundredsEl: HTMLElement | null;  
  /**
 * pingTensEl：pingTenEl相关字段。
 */

  pingTensEl: HTMLElement | null;  
  /**
 * pingOnesEl：pingOneEl相关字段。
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
 * @returns 无返回值，直接更新Main运行态Monitor来源相关状态。
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
 * serial：serial相关字段。
 */

        serial: number;        
        /**
 * clientAt：clientAt相关字段。
 */

        clientAt: number;        
        /**
 * timeoutId：超时ID标识。
 */

        timeoutId: ReturnType<typeof setTimeout>;
      }
    | null = null;
  let currentTimeState: GameTimeState | null = null;
  let currentTimeStateSyncedAt = performance.now();
  let currentTimeTickIntervalMs = 1000;
  let currentTimeIntervalId: number | null = null;
  let fpsMonitorEnabled = false;
  let fpsSampleFrameCount = 0;
  let fpsSampleStartedAt = performance.now();
  let fpsLastFrameAt = 0;
  let fpsFrameDurations: number[] = [];
  let fpsFrameDurationWriteIndex = 0;  
  /**
 * formatFpsMetric：规范化或转换FpMetric。
 * @param value number | null 参数说明。
 * @returns 返回FpMetric。
 */


  function formatFpsMetric(value: number | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (value === null) {
      return '---';
    }
    return String(Math.min(999, Math.max(0, Math.round(value)))).padStart(3, '0');
  }  
  /**
 * renderFpsStats：执行FpStat相关逻辑。
 * @param stats FpsSampleStats 参数说明。
 * @returns 无返回值，直接更新FpStat相关状态。
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
 * resetFpsMonitorSamples：执行resetFpMonitorSample相关逻辑。
 * @param now 参数说明。
 * @returns 无返回值，直接更新resetFpMonitorSample相关状态。
 */


  function resetFpsMonitorSamples(now = performance.now()): void {
    fpsSampleFrameCount = 0;
    fpsSampleStartedAt = now;
    fpsLastFrameAt = 0;
    fpsFrameDurations = [];
    fpsFrameDurationWriteIndex = 0;
  }  
  /**
 * appendFpsFrameDuration：执行appendFp帧耗时相关逻辑。
 * @param frameDurationMs number 参数说明。
 * @returns 无返回值，直接更新appendFp帧Duration相关状态。
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
 * resolveFpsLowStats：规范化或转换FpLowStat。
 * @returns 返回FpLowStat。
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
 * recordFpsMonitorFrame：记录真实渲染帧并更新 FPS 采样。
 * @param now number 参数说明。
 * @returns 无返回值，直接更新 FPS 采样相关状态。
 */

  function recordFpsMonitorFrame(now: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!fpsMonitorEnabled) {
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
  }  
  /**
 * startFpsMonitor：执行开始FpMonitor相关逻辑。
 * @returns 无返回值，直接更新startFpMonitor相关状态。
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
  }  
  /**
 * stopFpsMonitor：执行stopFpMonitor相关逻辑。
 * @returns 无返回值，直接更新stopFpMonitor相关状态。
 */


  function stopFpsMonitor(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    fpsMonitorEnabled = false;
    resetFpsMonitorSamples();
    renderFpsStats({ fps: null, low: null, onePercentLow: null });
    if (elements.fpsRateEl) {
      elements.fpsRateEl.hidden = true;
    }
  }  
  /**
 * syncFpsMonitorVisibility：判断FpMonitor可见性是否满足条件。
 * @param showFpsMonitor boolean 参数说明。
 * @returns 无返回值，直接更新FpMonitor可见性相关状态。
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
 * renderTickRate：执行tickRate相关逻辑。
 * @param seconds number 参数说明。
 * @returns 无返回值，直接更新tickRate相关状态。
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
 * resolveDisplayedLocalTicks：判断DisplayedLocaltick是否满足条件。
 * @param state GameTimeState | null 状态对象。
 * @param now 参数说明。
 * @returns 返回DisplayedLocaltick数值。
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
 * resolveDisplayedPhaseLabel：判断Displayed阶段Label是否满足条件。
 * @param state GameTimeState 状态对象。
 * @param localTicks number 参数说明。
 * @returns 返回DisplayedPhaseLabel。
 */


  function resolveDisplayedPhaseLabel(state: GameTimeState, localTicks: number): string {
    const phase = GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick);
    return phase?.label ?? state.phaseLabel;
  }  
  /**
 * renderCurrentTime：执行当前时间相关逻辑。
 * @param state GameTimeState | null 状态对象。
 * @param now 参数说明。
 * @returns 无返回值，直接更新Current时间相关状态。
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
 * syncCurrentTimeState：处理当前时间状态并更新相关状态。
 * @param state GameTimeState | null 状态对象。
 * @returns 无返回值，直接更新Current时间状态相关状态。
 */


  function syncCurrentTimeState(state: GameTimeState | null): void {
    currentTimeState = state;
    currentTimeStateSyncedAt = performance.now();
    renderCurrentTime(currentTimeState, currentTimeStateSyncedAt);
  }  
  /**
 * syncCurrentTimeTickInterval：处理当前时间tickInterval并更新相关状态。
 * @param dtMs number | null | undefined 参数说明。
 * @returns 无返回值，直接更新Current时间tickInterval相关状态。
 */


  function syncCurrentTimeTickInterval(dtMs: number | null | undefined): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }
    currentTimeTickIntervalMs = dtMs;
    options.syncEstimatedServerTickInterval(dtMs);
    options.mapRuntime.setTickDurationMs(dtMs);
  }  
  /**
 * renderPingLatency：执行PingLatency相关逻辑。
 * @param latencyMs number | null 参数说明。
 * @param status 参数说明。
 * @returns 无返回值，直接更新PingLatency相关状态。
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
 * waitFor：执行waitFor相关逻辑。
 * @param ms number 参数说明。
 * @returns 返回 Promise，完成后得到waitFor。
 */


  async function waitFor(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      options.windowRef.setTimeout(resolve, ms);
    });
  }  
  /**
 * recoverConnection：执行recoverConnection相关逻辑。
 * @param forceRefresh 参数说明。
 * @returns 返回 Promise，完成后得到recoverConnection。
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
 * scheduleConnectionRecovery：执行scheduleConnectionRecovery相关逻辑。
 * @param delayMs 参数说明。
 * @param forceRefresh 参数说明。
 * @returns 无返回值，直接更新scheduleConnectionRecovery相关状态。
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
 * clearPendingSocketPing：执行clear待处理SocketPing相关逻辑。
 * @returns 无返回值，直接更新clearPendingSocketPing相关状态。
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
 * markSocketPingTimeout：处理SocketPing超时并更新相关状态。
 * @param serial number 参数说明。
 * @returns 无返回值，直接更新SocketPing超时相关状态。
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
 * sampleServerPing：执行sampleServerPing相关逻辑。
 * @returns 无返回值，直接更新sampleServerPing相关状态。
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
 * stopPingLoop：执行stopPingLoop相关逻辑。
 * @returns 无返回值，直接更新stopPingLoop相关状态。
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
 * scheduleNextPing：执行scheduleNextPing相关逻辑。
 * @param delayMs 参数说明。
 * @returns 无返回值，直接更新scheduleNextPing相关状态。
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
 * restartPingLoop：执行restartPingLoop相关逻辑。
 * @param immediate 参数说明。
 * @returns 无返回值，直接更新restartPingLoop相关状态。
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
 * handlePong：处理Pong并更新相关状态。
 * @param data { clientAt: number } 原始数据。
 * @returns 无返回值，直接更新Pong相关状态。
 */


  function handlePong(data: {  
  /**
 * clientAt：clientAt相关字段。
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
 * initialize：执行initialize相关逻辑。
 * @param showFpsMonitor boolean 参数说明。
 * @returns 无返回值，直接更新initialize相关状态。
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
    recordFpsMonitorFrame,
    syncFpsMonitorVisibility,
    syncCurrentTimeState,
    syncCurrentTimeTickInterval,    
    /**
 * getCurrentTimeState：读取当前时间状态。
 * @returns 返回Current时间状态。
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
 * getDocumentVisibilityState：读取Document可见性状态。
 * @returns 返回Document可见性状态。
 */

    getDocumentVisibilityState(): DocumentVisibilityState {
      return options.documentRef.visibilityState;
    },
  };
}

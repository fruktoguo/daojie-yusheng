/**
 * 客户端主线程运行态 profiler。
 *
 * 只在 Pixi profiler 显式启用时采样，用于解释 RAF 之前的 socket、delta 消费和 UI 副作用耗时。
 */

export const RUNTIME_PROFILE_METRIC_KEYS = [
  'socket.syncEnvelope',
  'socket.worldDelta',
  'socket.selfDelta',
  'socket.panelDelta',
  'socket.decodeSyncEnvelope',
  'socket.decodeEventWorldDelta',
  'socket.decodeEventSelfDelta',
  'socket.decodeEventPanelDelta',
  'socket.decodeWorldDelta',
  'socket.decodeSelfDelta',
  'socket.decodePanelDelta',
  'socket.handleWorldDelta',
  'socket.handleSelfDelta',
  'socket.handlePanelDelta',
  'runtime.handleWorldDelta',
  'runtime.applyWorldDelta',
  'runtime.deferEventBus',
  'runtime.handleSelfDelta',
  'runtime.handlePanelDelta',
  'runtime.flushDeferredSideEffects',
  'runtime.delta.handleWorldDelta',
  'runtime.delta.buildWorldDeltaInput',
  'runtime.delta.applyWorldDeltaToRuntime',
  'runtime.delta.finalizeWorldDelta',
  'runtime.delta.handleSelfDelta',
  'runtime.delta.applySelfDeltaToRuntime',
  'runtime.delta.finalizeSelfDelta',
  'runtime.delta.handlePanelDelta',
] as const;

export type RuntimeProfileMetricKey = typeof RUNTIME_PROFILE_METRIC_KEYS[number];
export type RuntimeProfileFrameMetrics = Record<RuntimeProfileMetricKey, number>;

interface RuntimeProfilerState {
  frameMetrics: RuntimeProfileFrameMetrics;
}

declare global {
  interface Window {
    __mudRuntimeProfilerEnabled?: boolean;
  }
}

let state: RuntimeProfilerState | null = null;
let enabled = false;

export function createRuntimeProfileFrameMetrics(): RuntimeProfileFrameMetrics {
  return Object.fromEntries(RUNTIME_PROFILE_METRIC_KEYS.map((key) => [key, 0])) as RuntimeProfileFrameMetrics;
}

export function setRuntimeProfilerEnabled(enabled: boolean): void {
  setRuntimeProfilerActive(enabled);
}

function setRuntimeProfilerActive(nextEnabled: boolean): void {
  enabled = nextEnabled;
  if (typeof window !== 'undefined') {
    if (nextEnabled) {
      window.__mudRuntimeProfilerEnabled = true;
    } else {
      delete window.__mudRuntimeProfilerEnabled;
    }
  }
  if (nextEnabled) {
    state = state ?? { frameMetrics: createRuntimeProfileFrameMetrics() };
    return;
  }
  state = null;
}

export function resetRuntimeProfileFrameMetrics(): void {
  if (!isRuntimeProfilerEnabled()) {
    state = null;
    return;
  }
  state = { frameMetrics: createRuntimeProfileFrameMetrics() };
}

export function isRuntimeProfilerEnabled(): boolean {
  return enabled;
}

export function startRuntimeProfileMetric(): number {
  return enabled ? performance.now() : 0;
}

export function endRuntimeProfileMetric(key: RuntimeProfileMetricKey, startedAt: number): void {
  if (!enabled || startedAt <= 0) {
    return;
  }
  recordRuntimeProfileMetric(key, performance.now() - startedAt);
}

export function profileRuntimeMeasure<T>(key: RuntimeProfileMetricKey, callback: () => T): T {
  if (!enabled) {
    return callback();
  }
  const startedAt = performance.now();
  try {
    return callback();
  } finally {
    recordRuntimeProfileMetric(key, performance.now() - startedAt);
  }
}

export function recordRuntimeProfileMetric(key: RuntimeProfileMetricKey, elapsedMs: number): void {
  if (!enabled || elapsedMs <= 0) {
    return;
  }
  const activeState = state ?? { frameMetrics: createRuntimeProfileFrameMetrics() };
  state = activeState;
  activeState.frameMetrics[key] += elapsedMs;
}

export function consumeRuntimeProfileFrameMetrics(): RuntimeProfileFrameMetrics {
  if (!enabled) {
    return createRuntimeProfileFrameMetrics();
  }
  const activeState = state ?? { frameMetrics: createRuntimeProfileFrameMetrics() };
  state = { frameMetrics: createRuntimeProfileFrameMetrics() };
  return { ...activeState.frameMetrics };
}

/**
 * 本文件负责 Pixi 主世界 profiler 的状态、窗口与全局诊断句柄生命周期。
 *
 * 渲染适配器只上报耗时和计数；启停、发布与销毁统一在这里收口，避免诊断句柄
 * 在地图运行时销毁后继续持有整个渲染器对象图。
 */
import {
  consumeBrowserProfileFrameDiagnostics,
  consumeRuntimeProfileFrameMetrics,
  resetRuntimeProfileFrameMetrics,
  setRuntimeProfilerEnabled,
} from '../../debug/runtime-profiler';
import {
  createPixiProfileCounters,
  createPixiProfileFrameCounters,
  createPixiProfileFrameMetrics,
  createPixiProfileMetrics,
  PIXI_PROFILE_LOG_INTERVAL_MS,
  PIXI_PROFILE_METRIC_KEYS,
  PixiProfilerWindow,
  type PixiProfileCounterKey,
  type PixiProfileFrameSample,
  type PixiProfileFrameSchedule,
  type PixiProfileMetricKey,
  type PixiProfileRendererState,
  type PixiProfileSnapshot,
  type PixiProfileState,
} from './pixi-profiler-window';

declare global {
  interface Window {
    __mudPixiProfile?: PixiProfileSnapshot;
    __mudPixiProfileReset?: () => void;
  }
}

export class PixiRenderProfiler {
  private enabled = false;
  private state: PixiProfileState | null = null;
  private profileWindow: PixiProfilerWindow | null = null;

  constructor(private readonly buildRendererState: () => PixiProfileRendererState) {}

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    setRuntimeProfilerEnabled(enabled);
    if (enabled) {
      this.refresh();
      return;
    }
    this.clear();
  }

  refresh(): void {
    if (!this.enabled) {
      if (this.state || this.profileWindow) {
        this.clear();
      }
      return;
    }
    if (this.state) return;
    if (!this.profileWindow) {
      this.profileWindow = new PixiProfilerWindow();
      this.profileWindow.mount();
    }
    this.state = this.createState();
    if (typeof window !== 'undefined') {
      window.__mudPixiProfileReset = () => this.reset();
    }
  }

  reset(): void {
    if (!this.enabled) {
      this.state = null;
      return;
    }
    this.state = this.createState();
    resetRuntimeProfileFrameMetrics();
    this.profileWindow?.reset();
    this.publish(true);
  }

  destroy(): void {
    this.enabled = false;
    setRuntimeProfilerEnabled(false);
    this.clear();
  }

  isActive(): boolean {
    return this.state !== null;
  }

  start(): number {
    return this.state ? performance.now() : 0;
  }

  end(key: PixiProfileMetricKey, startedAt: number): void {
    const state = this.state;
    if (!state || startedAt <= 0) return;
    const elapsed = performance.now() - startedAt;
    const metric = state.metrics[key];
    metric.count += 1;
    metric.totalMs += elapsed;
    metric.maxMs = Math.max(metric.maxMs, elapsed);
    metric.lastMs = elapsed;
    state.frameMetrics[key] += elapsed;
  }

  count(key: PixiProfileCounterKey, count = 1): void {
    const state = this.state;
    if (!state) return;
    state.counters[key] += count;
    state.frameCounters[key] += count;
  }

  setCounter(key: PixiProfileCounterKey, count: number): void {
    const state = this.state;
    if (!state) return;
    state.counters[key] = count;
    state.frameCounters[key] = count;
  }

  recordFrame(frameAtMs: number, schedule: PixiProfileFrameSchedule): void {
    const state = this.state;
    if (!state) return;
    state.frameIndex += 1;
    const previousFrameAt = state.lastFrameAt;
    const frameIntervalMs = previousFrameAt > 0 ? Math.max(0, frameAtMs - previousFrameAt) : 0;
    state.lastFrameAt = frameAtMs;
    const sample: PixiProfileFrameSample = {
      index: state.frameIndex,
      atMs: frameAtMs,
      frameIntervalMs,
      frameFps: frameIntervalMs > 0 ? 1000 / frameIntervalMs : null,
      schedule,
      totalMs: state.frameMetrics.renderFrame,
      metrics: { ...state.frameMetrics },
      runtimeMetrics: consumeRuntimeProfileFrameMetrics(),
      browser: consumeBrowserProfileFrameDiagnostics(frameAtMs),
      counters: { ...state.frameCounters },
      renderer: this.buildRendererState(),
    };
    state.lastFrameSample = sample;
    this.profileWindow?.recordFrame(sample);
    state.frameMetrics = createPixiProfileFrameMetrics();
    state.frameCounters = createPixiProfileFrameCounters();
  }

  publish(force = false): void {
    const state = this.state;
    if (!state || typeof window === 'undefined') return;
    const now = performance.now();
    if (!force && now - state.lastPublishedAt < PIXI_PROFILE_LOG_INTERVAL_MS) return;
    state.lastPublishedAt = now;
    const metrics = Object.fromEntries(PIXI_PROFILE_METRIC_KEYS.map((key) => {
      const metric = state.metrics[key];
      return [key, {
        count: metric.count,
        totalMs: Number(metric.totalMs.toFixed(3)),
        maxMs: Number(metric.maxMs.toFixed(3)),
        lastMs: Number(metric.lastMs.toFixed(3)),
        avgMs: metric.count > 0 ? Number((metric.totalMs / metric.count).toFixed(3)) : 0,
      }];
    })) as PixiProfileSnapshot['metrics'];
    window.__mudPixiProfile = {
      enabled: true,
      startedAt: state.startedAt,
      elapsedMs: Number((now - state.startedAt).toFixed(3)),
      metrics,
      counters: { ...state.counters },
      renderer: this.buildRendererState(),
      latestFrame: state.lastFrameSample,
    };
  }

  private createState(): PixiProfileState {
    return {
      startedAt: performance.now(),
      lastPublishedAt: 0,
      lastFrameAt: 0,
      frameIndex: 0,
      metrics: createPixiProfileMetrics(),
      counters: createPixiProfileCounters(),
      frameMetrics: createPixiProfileFrameMetrics(),
      frameCounters: createPixiProfileFrameCounters(),
      lastFrameSample: null,
    };
  }

  private clear(): void {
    this.state = null;
    this.profileWindow?.destroy();
    this.profileWindow = null;
    this.clearPublishedState();
  }

  private clearPublishedState(): void {
    if (typeof window === 'undefined') return;
    delete window.__mudPixiProfile;
    delete window.__mudPixiProfileReset;
  }
}

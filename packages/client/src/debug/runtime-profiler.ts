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
  'runtime.delta.panel.attr',
  'runtime.delta.panel.inventory',
  'runtime.delta.panel.equipment',
  'runtime.delta.panel.technique',
  'runtime.delta.panel.artifact',
  'runtime.delta.panel.actions',
  'runtime.delta.panel.buff',
] as const;

export type RuntimeProfileMetricKey = typeof RUNTIME_PROFILE_METRIC_KEYS[number];
export type RuntimeProfileFrameMetrics = Record<RuntimeProfileMetricKey, number>;

export interface BrowserProfileLongTaskSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  latestStartMs: number;
  latestDurationMs: number;
}

export interface BrowserProfileAnimationFrameSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  totalBlockingMs: number;
  maxBlockingMs: number;
  totalScriptMs: number;
  maxScriptMs: number;
  totalStyleLayoutMs: number;
  maxStyleLayoutMs: number;
  latestStartMs: number;
  latestDurationMs: number;
}

export interface BrowserProfileEventLoopDelaySummary {
  count: number;
  totalDelayMs: number;
  maxDelayMs: number;
  latestStartMs: number;
  latestDelayMs: number;
}

export interface BrowserProfileEventTimingSummary {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  totalProcessingMs: number;
  maxProcessingMs: number;
  latestStartMs: number;
  latestDurationMs: number;
  latestName: string;
}

export interface BrowserProfileResourceInitiatorSummary {
  type: string;
  count: number;
  totalDurationMs: number;
}

export interface BrowserProfileResourceSummary {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  transferSizeBytes: number;
  decodedBodySizeBytes: number;
  slowestName: string;
  slowestInitiatorType: string;
  initiators: BrowserProfileResourceInitiatorSummary[];
}

export interface BrowserProfileMemorySnapshot {
  usedJSHeapSizeBytes: number;
  totalJSHeapSizeBytes: number;
  jsHeapSizeLimitBytes: number;
}

export interface BrowserProfileFrameDiagnostics {
  sampledAtMs: number;
  elapsedSinceLastSampleMs: number;
  documentHidden: boolean;
  visibilityState: DocumentVisibilityState | 'unknown';
  longTasks: BrowserProfileLongTaskSummary;
  animationFrames: BrowserProfileAnimationFrameSummary;
  eventLoopDelays: BrowserProfileEventLoopDelaySummary;
  eventTimings: BrowserProfileEventTimingSummary;
  resources: BrowserProfileResourceSummary;
  memory: BrowserProfileMemorySnapshot | null;
}

interface RuntimeProfilerState {
  frameMetrics: RuntimeProfileFrameMetrics;
}

interface BrowserProfilerState {
  startedAt: number;
  lastSampledAt: number;
  longTaskObserver: PerformanceObserver | null;
  animationFrameObserver: PerformanceObserver | null;
  eventTimingObserver: PerformanceObserver | null;
  eventLoopProbeTimer: number | null;
  eventLoopProbeExpectedAt: number;
  pendingLongTasks: BrowserProfileObservedEntry[];
  pendingAnimationFrames: BrowserProfileObservedEntry[];
  pendingEventLoopDelays: BrowserProfileObservedEntry[];
  pendingEventTimings: BrowserProfileObservedEntry[];
  resourceCursor: number;
}

interface BrowserProfileObservedEntry {
  startTime: number;
  duration: number;
  name?: string;
  blockingDuration?: number;
  scriptDuration?: number;
  styleLayoutDuration?: number;
  processingDuration?: number;
}

interface PerformanceMemoryLike {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

type PerformanceEntryRecord = PerformanceEntry & Record<string, unknown>;

declare global {
  interface Window {
    __mudRuntimeProfilerEnabled?: boolean;
  }
}

let state: RuntimeProfilerState | null = null;
let browserState: BrowserProfilerState | null = null;
let enabled = false;

const EVENT_LOOP_PROBE_INTERVAL_MS = 8;
const EVENT_LOOP_DELAY_THRESHOLD_MS = 8;

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
    browserState = browserState ?? createBrowserProfilerState();
    return;
  }
  state = null;
  stopBrowserProfiler();
}

export function resetRuntimeProfileFrameMetrics(): void {
  if (!isRuntimeProfilerEnabled()) {
    state = null;
    stopBrowserProfiler();
    return;
  }
  state = { frameMetrics: createRuntimeProfileFrameMetrics() };
  resetBrowserProfileDiagnostics();
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

export function consumeBrowserProfileFrameDiagnostics(sampledAtMs = performance.now()): BrowserProfileFrameDiagnostics {
  if (!enabled) {
    return createEmptyBrowserProfileFrameDiagnostics(sampledAtMs, 0);
  }
  const activeState = browserState ?? createBrowserProfilerState();
  browserState = activeState;
  const now = sampledAtMs;
  const elapsedSinceLastSampleMs = Math.max(0, now - activeState.lastSampledAt);
  activeState.lastSampledAt = now;
  const longTasks = summarizeLongTasks(activeState.pendingLongTasks);
  const animationFrames = summarizeAnimationFrames(activeState.pendingAnimationFrames);
  const eventLoopDelays = summarizeEventLoopDelays(activeState.pendingEventLoopDelays);
  const eventTimings = summarizeEventTimings(activeState.pendingEventTimings);
  activeState.pendingLongTasks = [];
  activeState.pendingAnimationFrames = [];
  activeState.pendingEventLoopDelays = [];
  activeState.pendingEventTimings = [];
  return {
    sampledAtMs: now,
    elapsedSinceLastSampleMs,
    documentHidden: typeof document !== 'undefined' ? document.hidden : false,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    longTasks,
    animationFrames,
    eventLoopDelays,
    eventTimings,
    resources: consumeResourceSummary(activeState),
    memory: readMemorySnapshot(),
  };
}

function createBrowserProfilerState(): BrowserProfilerState {
  const now = performance.now();
  const nextState: BrowserProfilerState = {
    startedAt: now,
    lastSampledAt: now,
    longTaskObserver: null,
    animationFrameObserver: null,
    eventTimingObserver: null,
    eventLoopProbeTimer: null,
    eventLoopProbeExpectedAt: now + EVENT_LOOP_PROBE_INTERVAL_MS,
    pendingLongTasks: [],
    pendingAnimationFrames: [],
    pendingEventLoopDelays: [],
    pendingEventTimings: [],
    resourceCursor: getResourceTimingEntries().length,
  };
  nextState.longTaskObserver = createProfileObserver('longtask', (entry) => {
    const activeState = browserState;
    if (!activeState || activeState.longTaskObserver !== nextState.longTaskObserver) return;
    activeState.pendingLongTasks.push({
      startTime: entry.startTime,
      duration: sanitizeProfileNumber(entry.duration),
    });
  });
  nextState.animationFrameObserver = createProfileObserver('long-animation-frame', (entry) => {
    const activeState = browserState;
    if (!activeState || activeState.animationFrameObserver !== nextState.animationFrameObserver) return;
    activeState.pendingAnimationFrames.push(extractAnimationFrameEntry(entry));
  });
  nextState.eventTimingObserver = createProfileObserver('event', (entry) => {
    const activeState = browserState;
    if (!activeState || activeState.eventTimingObserver !== nextState.eventTimingObserver) return;
    activeState.pendingEventTimings.push(extractEventTimingEntry(entry));
  }, { durationThreshold: 0 });
  nextState.eventLoopProbeTimer = startEventLoopProbe(nextState);
  return nextState;
}

function resetBrowserProfileDiagnostics(): void {
  if (!enabled) {
    stopBrowserProfiler();
    return;
  }
  const activeState = browserState ?? createBrowserProfilerState();
  const now = performance.now();
  activeState.lastSampledAt = now;
  activeState.pendingLongTasks = [];
  activeState.pendingAnimationFrames = [];
  activeState.pendingEventLoopDelays = [];
  activeState.pendingEventTimings = [];
  activeState.eventLoopProbeExpectedAt = now + EVENT_LOOP_PROBE_INTERVAL_MS;
  activeState.resourceCursor = getResourceTimingEntries().length;
  browserState = activeState;
}

function stopBrowserProfiler(): void {
  browserState?.longTaskObserver?.disconnect();
  browserState?.animationFrameObserver?.disconnect();
  browserState?.eventTimingObserver?.disconnect();
  if (browserState?.eventLoopProbeTimer !== null && browserState?.eventLoopProbeTimer !== undefined && typeof window !== 'undefined') {
    window.clearInterval(browserState.eventLoopProbeTimer);
  }
  browserState = null;
}

function createProfileObserver(
  type: string,
  consumeEntry: (entry: PerformanceEntryRecord) => void,
  extraOptions?: Record<string, unknown>,
): PerformanceObserver | null {
  if (typeof PerformanceObserver === 'undefined' || !isPerformanceEntryTypeSupported(type)) {
    return null;
  }
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        consumeEntry(entry as PerformanceEntryRecord);
      }
    });
    observer.observe({ type, buffered: true, ...extraOptions } as PerformanceObserverInit);
    return observer;
  } catch {
    return null;
  }
}

function startEventLoopProbe(ownerState: BrowserProfilerState): number | null {
  if (typeof window === 'undefined') {
    return null;
  }
  ownerState.eventLoopProbeExpectedAt = performance.now() + EVENT_LOOP_PROBE_INTERVAL_MS;
  return window.setInterval(() => {
    const activeState = browserState;
    if (!activeState || activeState !== ownerState) {
      return;
    }
    const now = performance.now();
    const delay = Math.max(0, now - activeState.eventLoopProbeExpectedAt);
    if (delay >= EVENT_LOOP_DELAY_THRESHOLD_MS) {
      activeState.pendingEventLoopDelays.push({
        startTime: activeState.eventLoopProbeExpectedAt,
        duration: delay,
      });
    }
    activeState.eventLoopProbeExpectedAt = now + EVENT_LOOP_PROBE_INTERVAL_MS;
  }, EVENT_LOOP_PROBE_INTERVAL_MS);
}

function isPerformanceEntryTypeSupported(type: string): boolean {
  const supported = PerformanceObserver.supportedEntryTypes;
  return Array.isArray(supported) ? supported.includes(type) : true;
}

function extractAnimationFrameEntry(entry: PerformanceEntryRecord): BrowserProfileObservedEntry {
  const duration = sanitizeProfileNumber(entry.duration);
  const startTime = sanitizeProfileNumber(entry.startTime);
  const endTime = startTime + duration;
  const scriptDuration = sanitizeProfileNumber(entry.scriptDuration) || sumScriptDurations(entry.scripts);
  const styleLayoutStart = sanitizeProfileNumber(entry.styleAndLayoutStart);
  const styleLayoutDuration = styleLayoutStart > 0 && styleLayoutStart < endTime
    ? Math.max(0, endTime - styleLayoutStart)
    : sanitizeProfileNumber(entry.styleLayoutDuration);
  return {
    startTime,
    duration,
    blockingDuration: sanitizeProfileNumber(entry.blockingDuration),
    scriptDuration,
    styleLayoutDuration,
  };
}

function extractEventTimingEntry(entry: PerformanceEntryRecord): BrowserProfileObservedEntry {
  const startTime = sanitizeProfileNumber(entry.startTime);
  const processingStart = sanitizeProfileNumber(entry.processingStart);
  const processingEnd = sanitizeProfileNumber(entry.processingEnd);
  const processingDuration = processingEnd > processingStart ? processingEnd - processingStart : 0;
  return {
    name: typeof entry.name === 'string' ? entry.name : '',
    startTime,
    duration: sanitizeProfileNumber(entry.duration),
    processingDuration,
  };
}

function sumScriptDurations(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const script of value) {
    if (!script || typeof script !== 'object') continue;
    total += sanitizeProfileNumber((script as Record<string, unknown>).duration);
  }
  return total;
}

function summarizeLongTasks(entries: BrowserProfileObservedEntry[]): BrowserProfileLongTaskSummary {
  const summary: BrowserProfileLongTaskSummary = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    latestStartMs: 0,
    latestDurationMs: 0,
  };
  for (const entry of entries) {
    const duration = sanitizeProfileNumber(entry.duration);
    summary.count += 1;
    summary.totalMs += duration;
    summary.maxMs = Math.max(summary.maxMs, duration);
    if (entry.startTime >= summary.latestStartMs) {
      summary.latestStartMs = entry.startTime;
      summary.latestDurationMs = duration;
    }
  }
  return roundLongTaskSummary(summary);
}

function summarizeAnimationFrames(entries: BrowserProfileObservedEntry[]): BrowserProfileAnimationFrameSummary {
  const summary: BrowserProfileAnimationFrameSummary = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    totalBlockingMs: 0,
    maxBlockingMs: 0,
    totalScriptMs: 0,
    maxScriptMs: 0,
    totalStyleLayoutMs: 0,
    maxStyleLayoutMs: 0,
    latestStartMs: 0,
    latestDurationMs: 0,
  };
  for (const entry of entries) {
    const duration = sanitizeProfileNumber(entry.duration);
    const blockingDuration = sanitizeProfileNumber(entry.blockingDuration);
    const scriptDuration = sanitizeProfileNumber(entry.scriptDuration);
    const styleLayoutDuration = sanitizeProfileNumber(entry.styleLayoutDuration);
    summary.count += 1;
    summary.totalMs += duration;
    summary.maxMs = Math.max(summary.maxMs, duration);
    summary.totalBlockingMs += blockingDuration;
    summary.maxBlockingMs = Math.max(summary.maxBlockingMs, blockingDuration);
    summary.totalScriptMs += scriptDuration;
    summary.maxScriptMs = Math.max(summary.maxScriptMs, scriptDuration);
    summary.totalStyleLayoutMs += styleLayoutDuration;
    summary.maxStyleLayoutMs = Math.max(summary.maxStyleLayoutMs, styleLayoutDuration);
    if (entry.startTime >= summary.latestStartMs) {
      summary.latestStartMs = entry.startTime;
      summary.latestDurationMs = duration;
    }
  }
  return roundAnimationFrameSummary(summary);
}

function summarizeEventLoopDelays(entries: BrowserProfileObservedEntry[]): BrowserProfileEventLoopDelaySummary {
  const summary: BrowserProfileEventLoopDelaySummary = {
    count: 0,
    totalDelayMs: 0,
    maxDelayMs: 0,
    latestStartMs: 0,
    latestDelayMs: 0,
  };
  for (const entry of entries) {
    const duration = sanitizeProfileNumber(entry.duration);
    summary.count += 1;
    summary.totalDelayMs += duration;
    summary.maxDelayMs = Math.max(summary.maxDelayMs, duration);
    if (entry.startTime >= summary.latestStartMs) {
      summary.latestStartMs = entry.startTime;
      summary.latestDelayMs = duration;
    }
  }
  return roundEventLoopDelaySummary(summary);
}

function summarizeEventTimings(entries: BrowserProfileObservedEntry[]): BrowserProfileEventTimingSummary {
  const summary: BrowserProfileEventTimingSummary = {
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    totalProcessingMs: 0,
    maxProcessingMs: 0,
    latestStartMs: 0,
    latestDurationMs: 0,
    latestName: '',
  };
  for (const entry of entries) {
    const duration = sanitizeProfileNumber(entry.duration);
    const processingDuration = sanitizeProfileNumber(entry.processingDuration);
    summary.count += 1;
    summary.totalDurationMs += duration;
    summary.maxDurationMs = Math.max(summary.maxDurationMs, duration);
    summary.totalProcessingMs += processingDuration;
    summary.maxProcessingMs = Math.max(summary.maxProcessingMs, processingDuration);
    if (entry.startTime >= summary.latestStartMs) {
      summary.latestStartMs = entry.startTime;
      summary.latestDurationMs = duration;
      summary.latestName = entry.name ?? '';
    }
  }
  return roundEventTimingSummary(summary);
}

function consumeResourceSummary(activeState: BrowserProfilerState): BrowserProfileResourceSummary {
  const entries = getResourceTimingEntries();
  const newEntries = entries.slice(activeState.resourceCursor);
  activeState.resourceCursor = entries.length;
  const initiators = new Map<string, BrowserProfileResourceInitiatorSummary>();
  let count = 0;
  let totalDurationMs = 0;
  let maxDurationMs = 0;
  let transferSizeBytes = 0;
  let decodedBodySizeBytes = 0;
  let slowestName = '';
  let slowestInitiatorType = '';
  for (const entry of newEntries) {
    const duration = sanitizeProfileNumber(entry.duration);
    const initiatorType = entry.initiatorType || 'other';
    count += 1;
    totalDurationMs += duration;
    maxDurationMs = Math.max(maxDurationMs, duration);
    transferSizeBytes += sanitizeProfileNumber(entry.transferSize);
    decodedBodySizeBytes += sanitizeProfileNumber(entry.decodedBodySize);
    const initiator = initiators.get(initiatorType) ?? { type: initiatorType, count: 0, totalDurationMs: 0 };
    initiator.count += 1;
    initiator.totalDurationMs += duration;
    initiators.set(initiatorType, initiator);
    if (duration >= maxDurationMs) {
      slowestName = shortenResourceName(entry.name);
      slowestInitiatorType = initiatorType;
    }
  }
  return {
    count,
    totalDurationMs: roundProfileNumber(totalDurationMs),
    maxDurationMs: roundProfileNumber(maxDurationMs),
    transferSizeBytes: Math.round(transferSizeBytes),
    decodedBodySizeBytes: Math.round(decodedBodySizeBytes),
    slowestName,
    slowestInitiatorType,
    initiators: [...initiators.values()]
      .map((entry) => ({
        type: entry.type,
        count: entry.count,
        totalDurationMs: roundProfileNumber(entry.totalDurationMs),
      }))
      .sort((left, right) => right.totalDurationMs - left.totalDurationMs || right.count - left.count)
      .slice(0, 6),
  };
}

function getResourceTimingEntries(): PerformanceResourceTiming[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return [];
  }
  return performance.getEntriesByType('resource') as PerformanceResourceTiming[];
}

function readMemorySnapshot(): BrowserProfileMemorySnapshot | null {
  if (typeof performance === 'undefined') return null;
  const memory = (performance as Performance & { memory?: PerformanceMemoryLike }).memory;
  if (!memory) return null;
  return {
    usedJSHeapSizeBytes: Math.round(sanitizeProfileNumber(memory.usedJSHeapSize)),
    totalJSHeapSizeBytes: Math.round(sanitizeProfileNumber(memory.totalJSHeapSize)),
    jsHeapSizeLimitBytes: Math.round(sanitizeProfileNumber(memory.jsHeapSizeLimit)),
  };
}

function createEmptyBrowserProfileFrameDiagnostics(sampledAtMs: number, elapsedSinceLastSampleMs: number): BrowserProfileFrameDiagnostics {
  return {
    sampledAtMs,
    elapsedSinceLastSampleMs,
    documentHidden: false,
    visibilityState: 'unknown',
    longTasks: summarizeLongTasks([]),
    animationFrames: summarizeAnimationFrames([]),
    eventLoopDelays: summarizeEventLoopDelays([]),
    eventTimings: summarizeEventTimings([]),
    resources: {
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      transferSizeBytes: 0,
      decodedBodySizeBytes: 0,
      slowestName: '',
      slowestInitiatorType: '',
      initiators: [],
    },
    memory: null,
  };
}

function roundLongTaskSummary(summary: BrowserProfileLongTaskSummary): BrowserProfileLongTaskSummary {
  return {
    count: summary.count,
    totalMs: roundProfileNumber(summary.totalMs),
    maxMs: roundProfileNumber(summary.maxMs),
    latestStartMs: roundProfileNumber(summary.latestStartMs),
    latestDurationMs: roundProfileNumber(summary.latestDurationMs),
  };
}

function roundAnimationFrameSummary(summary: BrowserProfileAnimationFrameSummary): BrowserProfileAnimationFrameSummary {
  return {
    count: summary.count,
    totalMs: roundProfileNumber(summary.totalMs),
    maxMs: roundProfileNumber(summary.maxMs),
    totalBlockingMs: roundProfileNumber(summary.totalBlockingMs),
    maxBlockingMs: roundProfileNumber(summary.maxBlockingMs),
    totalScriptMs: roundProfileNumber(summary.totalScriptMs),
    maxScriptMs: roundProfileNumber(summary.maxScriptMs),
    totalStyleLayoutMs: roundProfileNumber(summary.totalStyleLayoutMs),
    maxStyleLayoutMs: roundProfileNumber(summary.maxStyleLayoutMs),
    latestStartMs: roundProfileNumber(summary.latestStartMs),
    latestDurationMs: roundProfileNumber(summary.latestDurationMs),
  };
}

function roundEventLoopDelaySummary(summary: BrowserProfileEventLoopDelaySummary): BrowserProfileEventLoopDelaySummary {
  return {
    count: summary.count,
    totalDelayMs: roundProfileNumber(summary.totalDelayMs),
    maxDelayMs: roundProfileNumber(summary.maxDelayMs),
    latestStartMs: roundProfileNumber(summary.latestStartMs),
    latestDelayMs: roundProfileNumber(summary.latestDelayMs),
  };
}

function roundEventTimingSummary(summary: BrowserProfileEventTimingSummary): BrowserProfileEventTimingSummary {
  return {
    count: summary.count,
    totalDurationMs: roundProfileNumber(summary.totalDurationMs),
    maxDurationMs: roundProfileNumber(summary.maxDurationMs),
    totalProcessingMs: roundProfileNumber(summary.totalProcessingMs),
    maxProcessingMs: roundProfileNumber(summary.maxProcessingMs),
    latestStartMs: roundProfileNumber(summary.latestStartMs),
    latestDurationMs: roundProfileNumber(summary.latestDurationMs),
    latestName: summary.latestName,
  };
}

function shortenResourceName(name: string): string {
  if (!name) return '';
  try {
    const url = new URL(name, typeof location !== 'undefined' ? location.href : undefined);
    return `${url.pathname}${url.search}`.slice(-160);
  } catch {
    return name.slice(-160);
  }
}

function sanitizeProfileNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundProfileNumber(value: number): number {
  return Number(value.toFixed(3));
}

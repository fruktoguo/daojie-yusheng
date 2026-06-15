/**
 * 本文件属于客户端地图渲染诊断模块，负责 Pixi 主世界 profiling 独立窗口。
 *
 * 诊断 UI 只在本地 profiling 开关启用时挂载，不参与服务端权威逻辑和正常渲染路径。
 */

import {
  type BrowserProfileFrameDiagnostics,
  RUNTIME_PROFILE_METRIC_KEYS,
  type RuntimeProfileFrameMetrics,
  type RuntimeProfileMetricKey,
} from '../../debug/runtime-profiler';

export type PixiProfileMetricKey =
  | 'syncScene'
  | 'syncEntities'
  | 'formationRangeCache'
  | 'worldOverlays'
  | 'renderFrame'
  | 'camera'
  | 'terrainChunks'
  | 'terrainSignature'
  | 'terrainRebuild'
  | 'terrainFog'
  | 'pathLayer'
  | 'entityViews'
  | 'threatArrows'
  | 'effects'
  | 'timeOverlay'
  | 'appRender';

export type PixiProfileCounterKey =
  | 'frames'
  | 'syncScenes'
  | 'visibleChunks'
  | 'terrainChunkSignatureHits'
  | 'terrainChunkSignatures'
  | 'terrainChunkRebuilds'
  | 'runtimeTileSprites'
  | 'dualGridSprites'
  | 'pathCells'
  | 'fadingPathCells'
  | 'groundPiles'
  | 'entities';

export interface PixiProfileMetric {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

export interface PixiProfileState {
  startedAt: number;
  lastPublishedAt: number;
  lastFrameAt: number;
  frameIndex: number;
  metrics: Record<PixiProfileMetricKey, PixiProfileMetric>;
  counters: Record<PixiProfileCounterKey, number>;
  frameMetrics: Record<PixiProfileMetricKey, number>;
  frameCounters: Record<PixiProfileCounterKey, number>;
  lastFrameSample: PixiProfileFrameSample | null;
}

export interface PixiProfileSnapshot {
  enabled: true;
  startedAt: number;
  elapsedMs: number;
  metrics: Record<PixiProfileMetricKey, PixiProfileMetric & { avgMs: number }>;
  counters: Record<PixiProfileCounterKey, number>;
  renderer: PixiProfileRendererState;
  latestFrame: PixiProfileFrameSample | null;
}

export interface PixiProfileRendererState {
  terrainChunks: number;
  cachedTerrainChunks: number;
  terrainCachedContainers: number;
  terrainChunkChildren: number;
  entities: number;
  groundChildren: number;
  entityChildren: number;
  effectChildren: number;
  screenChildren: number;
  pathChildren: number;
  floatingTexts: number;
  attackTrails: number;
  warningZones: number;
  runtimeTileTextures: number;
  runtimeAtlasTextures: number;
  runtimeEntityTextures: number;
  runtimeTileTextureRequests: number;
  runtimeEntityTextureRequests: number;
  runtimeTileManifestState: 'idle' | 'loading' | 'loaded' | 'error';
  backbufferWidth: number;
  backbufferHeight: number;
  backbufferPixels: number;
}

export interface PixiProfileFrameSchedule {
  rafIntervalMs: number;
  rafCallbacks: number;
  skippedRafCallbacks: number;
  targetFps: number;
  targetIntervalMs: number;
  rafCallbackPreRenderMs: number;
  rafCallbackActiveMs: number;
  scheduleLateMs: number;
  rafTargetGapMs: number;
  missedTargetFrames: number;
}

export interface PixiProfileFrameSample {
  index: number;
  atMs: number;
  frameIntervalMs: number;
  frameFps: number | null;
  schedule: PixiProfileFrameSchedule;
  totalMs: number;
  metrics: Record<PixiProfileMetricKey, number>;
  runtimeMetrics: RuntimeProfileFrameMetrics;
  browser: BrowserProfileFrameDiagnostics;
  counters: Record<PixiProfileCounterKey, number>;
  renderer: PixiProfileRendererState;
}

export const PIXI_PROFILE_LOG_INTERVAL_MS = 3000;
export const PIXI_PROFILE_HISTORY_SIZE = 240;

export const PIXI_PROFILE_METRIC_KEYS: PixiProfileMetricKey[] = [
  'syncScene',
  'syncEntities',
  'formationRangeCache',
  'worldOverlays',
  'renderFrame',
  'camera',
  'terrainChunks',
  'terrainSignature',
  'terrainRebuild',
  'terrainFog',
  'pathLayer',
  'entityViews',
  'threatArrows',
  'effects',
  'timeOverlay',
  'appRender',
];

export const PIXI_PROFILE_COUNTER_KEYS: PixiProfileCounterKey[] = [
  'frames',
  'syncScenes',
  'visibleChunks',
  'terrainChunkSignatureHits',
  'terrainChunkSignatures',
  'terrainChunkRebuilds',
  'runtimeTileSprites',
  'dualGridSprites',
  'pathCells',
  'fadingPathCells',
  'groundPiles',
  'entities',
];

const METRIC_LABELS: Record<PixiProfileMetricKey, string> = {
  syncScene: 'syncScene',
  syncEntities: 'syncEntities',
  formationRangeCache: 'formationRange',
  worldOverlays: 'worldOverlays',
  renderFrame: 'renderFrame',
  camera: 'camera',
  terrainChunks: 'terrainChunks',
  terrainSignature: 'terrainSignature',
  terrainRebuild: 'terrainRebuild',
  terrainFog: 'terrainFog',
  pathLayer: 'pathLayer',
  entityViews: 'entityViews',
  threatArrows: 'threatArrows',
  effects: 'effects',
  timeOverlay: 'timeOverlay',
  appRender: 'appRender',
};

const COUNTER_LABELS: Record<PixiProfileCounterKey, string> = {
  frames: 'frames',
  syncScenes: 'syncScenes',
  visibleChunks: 'visibleChunks',
  terrainChunkSignatureHits: 'signatureHits',
  terrainChunkSignatures: 'signatures',
  terrainChunkRebuilds: 'chunkRebuilds',
  runtimeTileSprites: 'runtimeSprites',
  dualGridSprites: 'dualGridSprites',
  pathCells: 'pathCells',
  fadingPathCells: 'fadingPathCells',
  groundPiles: 'groundPiles',
  entities: 'entities',
};

const RUNTIME_METRIC_LABELS: Record<RuntimeProfileMetricKey, string> = {
  'socket.syncEnvelope': 'socket.syncEnvelope',
  'socket.worldDelta': 'socket.worldDelta',
  'socket.selfDelta': 'socket.selfDelta',
  'socket.panelDelta': 'socket.panelDelta',
  'socket.decodeSyncEnvelope': 'socket.decodeSyncEnvelope',
  'socket.decodeEventWorldDelta': 'socket.decodeEventWorldDelta',
  'socket.decodeEventSelfDelta': 'socket.decodeEventSelfDelta',
  'socket.decodeEventPanelDelta': 'socket.decodeEventPanelDelta',
  'socket.decodeWorldDelta': 'socket.decodeWorldDelta',
  'socket.decodeSelfDelta': 'socket.decodeSelfDelta',
  'socket.decodePanelDelta': 'socket.decodePanelDelta',
  'socket.handleWorldDelta': 'socket.handleWorldDelta',
  'socket.handleSelfDelta': 'socket.handleSelfDelta',
  'socket.handlePanelDelta': 'socket.handlePanelDelta',
  'runtime.handleWorldDelta': 'runtime.handleWorldDelta',
  'runtime.applyWorldDelta': 'runtime.applyWorldDelta',
  'runtime.deferEventBus': 'runtime.deferEventBus',
  'runtime.handleSelfDelta': 'runtime.handleSelfDelta',
  'runtime.handlePanelDelta': 'runtime.handlePanelDelta',
  'runtime.flushDeferredSideEffects': 'runtime.flushDeferredSideEffects',
  'runtime.delta.handleWorldDelta': 'runtime.delta.handleWorldDelta',
  'runtime.delta.buildWorldDeltaInput': 'runtime.delta.buildWorldDeltaInput',
  'runtime.delta.applyWorldDeltaToRuntime': 'runtime.delta.applyWorldDeltaToRuntime',
  'runtime.delta.finalizeWorldDelta': 'runtime.delta.finalizeWorldDelta',
  'runtime.delta.handleSelfDelta': 'runtime.delta.handleSelfDelta',
  'runtime.delta.applySelfDeltaToRuntime': 'runtime.delta.applySelfDeltaToRuntime',
  'runtime.delta.finalizeSelfDelta': 'runtime.delta.finalizeSelfDelta',
  'runtime.delta.handlePanelDelta': 'runtime.delta.handlePanelDelta',
  'runtime.delta.panel.attr': 'runtime.delta.panel.attr',
  'runtime.delta.panel.inventory': 'runtime.delta.panel.inventory',
  'runtime.delta.panel.equipment': 'runtime.delta.panel.equipment',
  'runtime.delta.panel.technique': 'runtime.delta.panel.technique',
  'runtime.delta.panel.artifact': 'runtime.delta.panel.artifact',
  'runtime.delta.panel.actions': 'runtime.delta.panel.actions',
  'runtime.delta.panel.buff': 'runtime.delta.panel.buff',
};

interface ProfileOffenderRow {
  group: 'pixi' | 'runtime' | 'browser' | 'resource' | 'gap';
  name: string;
  value: number;
  count: number;
}

export function createPixiProfileMetric(): PixiProfileMetric {
  return { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
}

export function createPixiProfileMetrics(): Record<PixiProfileMetricKey, PixiProfileMetric> {
  return Object.fromEntries(PIXI_PROFILE_METRIC_KEYS.map((key) => [key, createPixiProfileMetric()])) as Record<PixiProfileMetricKey, PixiProfileMetric>;
}

export function createPixiProfileCounters(): Record<PixiProfileCounterKey, number> {
  return Object.fromEntries(PIXI_PROFILE_COUNTER_KEYS.map((key) => [key, 0])) as Record<PixiProfileCounterKey, number>;
}

export function createPixiProfileFrameMetrics(): Record<PixiProfileMetricKey, number> {
  return Object.fromEntries(PIXI_PROFILE_METRIC_KEYS.map((key) => [key, 0])) as Record<PixiProfileMetricKey, number>;
}

export function createPixiProfileFrameCounters(): Record<PixiProfileCounterKey, number> {
  return Object.fromEntries(PIXI_PROFILE_COUNTER_KEYS.map((key) => [key, 0])) as Record<PixiProfileCounterKey, number>;
}

export class PixiProfilerWindow {
  private root: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private summaryEl: HTMLElement | null = null;
  private detailBodyEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private latestBtn: HTMLButtonElement | null = null;
  private pauseBtn: HTMLButtonElement | null = null;
  private copyBtn: HTMLButtonElement | null = null;
  private samples: PixiProfileFrameSample[] = [];
  private selectedSample: PixiProfileFrameSample | null = null;
  private followLatest = true;
  private paused = false;
  private graphDragging = false;
  private windowDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private pendingRender = false;
  private copyFeedbackTimer: number | null = null;

  mount(): void {
    if (this.root || typeof document === 'undefined') return;
    const root = document.createElement('section');
    root.className = 'pixi-profiler-window';
    root.setAttribute('aria-label', 'Pixi profiler');
    root.innerHTML = `
      <div class="pixi-profiler-header">
        <div class="pixi-profiler-title">
          <span>Pixi Profiler</span>
          <strong data-profile-summary>-- ms</strong>
        </div>
        <div class="pixi-profiler-actions">
          <button type="button" data-profile-pause aria-pressed="false" title="Pause profiler updates">Pause</button>
          <button type="button" data-profile-latest>Latest</button>
          <button type="button" data-profile-copy title="Copy selected frame details">Copy</button>
        </div>
      </div>
      <div class="pixi-profiler-graph-shell">
        <canvas class="pixi-profiler-graph" width="720" height="180"></canvas>
      </div>
      <div class="pixi-profiler-counters" data-profile-counters></div>
      <div class="pixi-profiler-detail">
        <table>
          <thead><tr><th>Step</th><th>ms</th></tr></thead>
          <tbody data-profile-detail></tbody>
        </table>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.header = root.querySelector('.pixi-profiler-header');
    this.canvas = root.querySelector<HTMLCanvasElement>('.pixi-profiler-graph');
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.summaryEl = root.querySelector('[data-profile-summary]');
    this.detailBodyEl = root.querySelector('[data-profile-detail]');
    this.counterEl = root.querySelector('[data-profile-counters]');
    this.latestBtn = root.querySelector<HTMLButtonElement>('[data-profile-latest]');
    this.pauseBtn = root.querySelector<HTMLButtonElement>('[data-profile-pause]');
    this.copyBtn = root.querySelector<HTMLButtonElement>('[data-profile-copy]');
    this.bindEvents();
    this.renderNow();
  }

  destroy(): void {
    if (this.copyFeedbackTimer !== null) {
      window.clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
    this.root?.remove();
    this.root = null;
    this.header = null;
    this.canvas = null;
    this.ctx = null;
    this.summaryEl = null;
    this.detailBodyEl = null;
    this.counterEl = null;
    this.latestBtn = null;
    this.pauseBtn = null;
    this.copyBtn = null;
    this.samples = [];
    this.selectedSample = null;
    this.paused = false;
    this.pendingRender = false;
  }

  reset(): void {
    this.samples = [];
    this.selectedSample = null;
    this.followLatest = true;
    this.paused = false;
    this.scheduleRender();
  }

  recordFrame(sample: PixiProfileFrameSample): void {
    this.mount();
    if (this.paused) return;
    this.samples.push(sample);
    if (this.samples.length > PIXI_PROFILE_HISTORY_SIZE) {
      this.samples.splice(0, this.samples.length - PIXI_PROFILE_HISTORY_SIZE);
    }
    if (this.followLatest || !this.selectedSample) {
      this.selectedSample = sample;
      this.followLatest = true;
    } else if (!this.samples.includes(this.selectedSample)) {
      this.selectedSample = this.samples[0] ?? null;
    }
    this.scheduleRender();
  }

  private bindEvents(): void {
    this.latestBtn?.addEventListener('click', () => {
      this.followLatest = true;
      this.selectedSample = this.samples[this.samples.length - 1] ?? null;
      this.scheduleRender();
    });
    this.pauseBtn?.addEventListener('click', () => {
      this.togglePaused();
    });
    this.copyBtn?.addEventListener('click', () => {
      void this.copySelectedSample();
    });
    this.header?.addEventListener('pointerdown', (event) => {
      if (!(event.target instanceof Element) || event.target.closest('button')) return;
      const root = this.root;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      this.windowDragging = true;
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      this.header?.setPointerCapture(event.pointerId);
    });
    this.header?.addEventListener('pointermove', (event) => {
      if (!this.windowDragging || !this.root) return;
      const maxLeft = Math.max(0, window.innerWidth - this.root.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - this.root.offsetHeight);
      const left = Math.max(0, Math.min(maxLeft, event.clientX - this.dragOffsetX));
      const top = Math.max(0, Math.min(maxTop, event.clientY - this.dragOffsetY));
      this.root.style.left = `${left}px`;
      this.root.style.top = `${top}px`;
      this.root.style.right = 'auto';
      this.root.style.bottom = 'auto';
    });
    this.header?.addEventListener('pointerup', (event) => {
      this.windowDragging = false;
      this.header?.releasePointerCapture(event.pointerId);
    });
    this.canvas?.addEventListener('pointerdown', (event) => {
      this.graphDragging = true;
      this.canvas?.setPointerCapture(event.pointerId);
      this.selectSampleAt(event.clientX);
    });
    this.canvas?.addEventListener('pointermove', (event) => {
      if (!this.graphDragging) return;
      this.selectSampleAt(event.clientX);
    });
    this.canvas?.addEventListener('pointerup', (event) => {
      this.graphDragging = false;
      this.canvas?.releasePointerCapture(event.pointerId);
    });
  }

  private selectSampleAt(clientX: number): void {
    if (!this.canvas || this.samples.length === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const index = Math.min(this.samples.length - 1, Math.max(0, Math.round(ratio * (this.samples.length - 1))));
    this.selectedSample = this.samples[index] ?? null;
    this.followLatest = false;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.pendingRender) return;
    this.pendingRender = true;
    requestAnimationFrame(() => {
      this.pendingRender = false;
      this.renderNow();
    });
  }

  private renderNow(): void {
    this.drawGraph();
    this.renderSummary();
    this.renderCounters();
    this.renderDetail();
    this.renderActionState();
  }

  private drawGraph(): void {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#facc15';
    ctx.fillText('frame', width - 92, 13);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('render', width - 48, 13);
    const samples = this.samples;
    const selected = this.selectedSample;
    const maxMs = Math.max(16.7, 33.3, ...samples.map((sample) => Math.max(sample.totalMs, sample.frameIntervalMs)));
    this.drawReferenceLine(ctx, width, height, maxMs, 16.7, '#334155', '16.7');
    this.drawReferenceLine(ctx, width, height, maxMs, 33.3, '#475569', '33.3');
    if (samples.length > 1) {
      ctx.beginPath();
      samples.forEach((sample, index) => {
        const x = index * width / Math.max(1, samples.length - 1);
        const y = height - (sample.frameIntervalMs / maxMs) * (height - 20) - 10;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      samples.forEach((sample, index) => {
        const x = index * width / Math.max(1, samples.length - 1);
        const y = height - (sample.totalMs / maxMs) * (height - 20) - 10;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        const x = index * width / Math.max(1, samples.length - 1);
        const y = height - (sample.frameIntervalMs / maxMs) * (height - 20) - 10;
        const hot = sample.frameIntervalMs >= 33.3;
        ctx.fillStyle = hot ? '#f97316' : '#22c55e';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    if (selected) {
      const selectedIndex = Math.max(0, samples.indexOf(selected));
      const x = selectedIndex * width / Math.max(1, samples.length - 1);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  private drawReferenceLine(ctx: CanvasRenderingContext2D, width: number, height: number, maxMs: number, value: number, color: string, label: string): void {
    const y = height - (value / maxMs) * (height - 20) - 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(label, 6, Math.max(12, y - 3));
  }

  private renderSummary(): void {
    if (!this.summaryEl) return;
    const selected = this.selectedSample;
    const latest = this.samples[this.samples.length - 1] ?? null;
    if (!selected) {
      this.summaryEl.textContent = this.paused ? '-- ms paused' : '-- ms';
      return;
    }
    const suffix = this.paused ? `paused #${selected.index}` : (this.followLatest || selected === latest ? 'live' : `#${selected.index}`);
    const frameFps = selected.frameFps === null ? '--fps' : `${formatNumber(selected.frameFps)}fps`;
    const budget = computeFrameBudget(selected);
    const offender = buildTopOffenders(selected)[0];
    const offenderText = offender ? `${offender.group}:${offender.name} ${formatMs(offender.value)}` : 'no offender';
    this.summaryEl.textContent = `${formatMs(selected.frameIntervalMs)} frame / ${formatMs(budget.callbackActiveMs)} active / ${formatMs(budget.callbackUnprofiledMs)} callback gap / ${formatMs(budget.intervalUnattributedMs)} interval ${frameFps} ${offenderText} ${suffix}`;
  }

  private renderActionState(): void {
    if (this.pauseBtn) {
      this.pauseBtn.textContent = this.paused ? 'Resume' : 'Pause';
      this.pauseBtn.setAttribute('aria-pressed', this.paused ? 'true' : 'false');
      this.pauseBtn.title = this.paused ? 'Resume profiler updates' : 'Pause profiler updates';
    }
    if (this.copyBtn) {
      this.copyBtn.disabled = !this.selectedSample;
    }
  }

  private renderCounters(): void {
    if (!this.counterEl) return;
    const sample = this.selectedSample;
    if (!sample) {
      this.counterEl.textContent = '';
      return;
    }
    const entries: Array<[string, number]> = [
      ['chunks', sample.counters.visibleChunks],
      ['hits', sample.counters.terrainChunkSignatureHits],
      ['sigs', sample.counters.terrainChunkSignatures],
      ['rebuild', sample.counters.terrainChunkRebuilds],
      ['dual', sample.counters.dualGridSprites],
      ['sprites', sample.counters.runtimeTileSprites],
      ['entities', sample.counters.entities],
      ['cached', sample.renderer.cachedTerrainChunks],
      ['children', sample.renderer.terrainChunkChildren],
      ['textures', sample.renderer.runtimeTileTextures],
      ['long', sample.browser.longTasks.count],
      ['loaf', sample.browser.animationFrames.count],
      ['res', sample.browser.resources.count],
      ['heapMB', sample.browser.memory ? sample.browser.memory.usedJSHeapSizeBytes / 1024 / 1024 : 0],
      ['fps', sample.frameFps ?? 0],
      ['raf', sample.schedule.rafCallbacks],
    ];
    this.counterEl.innerHTML = entries
      .map(([label, value]) => `<span><b>${escapeHtml(label)}</b>${formatNumber(value)}</span>`)
      .join('');
  }

  private renderDetail(): void {
    if (!this.detailBodyEl) return;
    const sample = this.selectedSample;
    if (!sample) {
      this.detailBodyEl.innerHTML = '<tr><td colspan="2">No samples</td></tr>';
      return;
    }
    const metricRows = PIXI_PROFILE_METRIC_KEYS
      .map((key) => ({ key, value: sample.metrics[key] }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value);
    const runtimeRows = RUNTIME_PROFILE_METRIC_KEYS
      .map((key) => ({ key, value: sample.runtimeMetrics[key] }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value);
    const counterRows = PIXI_PROFILE_COUNTER_KEYS
      .map((key) => ({ key, value: sample.counters[key] }))
      .filter((entry) => entry.value > 0);
    const runtimeTotalMs = getTopLevelRuntimeMs(sample);
    const budget = computeFrameBudget(sample);
    const offenderRows = buildTopOffenders(sample);
    const resourceInitiatorRows = sample.browser.resources.initiators;
    const memory = sample.browser.memory;
    const unprofiledScheduleLateMs = Math.max(0, sample.schedule.scheduleLateMs - runtimeTotalMs);
    this.detailBodyEl.innerHTML = [
      `<tr class="pixi-profiler-selected-row"><td>frame #${sample.index}</td><td>${formatMs(sample.totalMs)}</td></tr>`,
      `<tr><td>frame interval</td><td>${formatMs(sample.frameIntervalMs)}</td></tr>`,
      `<tr><td>frame fps</td><td>${sample.frameFps === null ? '--' : formatNumber(sample.frameFps)}</td></tr>`,
      `<tr><td>profiled total</td><td>${formatMs(budget.profiledMs)}</td></tr>`,
      `<tr><td>callback active</td><td>${formatMs(budget.callbackActiveMs)}</td></tr>`,
      `<tr><td>callback coverage</td><td>${formatPercent(budget.callbackCoverageRatio)}</td></tr>`,
      `<tr><td>callback unprofiled gap</td><td>${formatMs(budget.callbackUnprofiledMs)}</td></tr>`,
      `<tr><td>interval unattributed</td><td>${formatMs(budget.intervalUnattributedMs)}</td></tr>`,
      `<tr><td>raw rAF interval</td><td>${formatMs(sample.schedule.rafIntervalMs)}</td></tr>`,
      `<tr><td>rAF callbacks</td><td>${formatNumber(sample.schedule.rafCallbacks)}</td></tr>`,
      `<tr><td>skipped rAF callbacks</td><td>${formatNumber(sample.schedule.skippedRafCallbacks)}</td></tr>`,
      `<tr><td>target fps</td><td>${formatNumber(sample.schedule.targetFps)}</td></tr>`,
      `<tr><td>target interval</td><td>${formatMs(sample.schedule.targetIntervalMs)}</td></tr>`,
      `<tr><td>rAF pre-render</td><td>${formatMs(sample.schedule.rafCallbackPreRenderMs)}</td></tr>`,
      `<tr><td>rAF target gap</td><td>${formatMs(sample.schedule.rafTargetGapMs)}</td></tr>`,
      `<tr><td>missed target frames</td><td>${formatNumber(sample.schedule.missedTargetFrames)}</td></tr>`,
      `<tr><td>schedule late</td><td>${formatMs(sample.schedule.scheduleLateMs)}</td></tr>`,
      `<tr><td>runtime profiled</td><td>${formatMs(runtimeTotalMs)}</td></tr>`,
      `<tr><td>schedule late unprofiled</td><td>${formatMs(unprofiledScheduleLateMs)}</td></tr>`,
      `<tr class="pixi-profiler-section-row"><td colspan="2">top offenders</td></tr>`,
      ...offenderRows.map((entry) => `<tr><td>${escapeHtml(`${entry.group}.${entry.name}${entry.count > 1 ? ` x${entry.count}` : ''}`)}</td><td>${formatMs(entry.value)}</td></tr>`),
      `<tr class="pixi-profiler-section-row"><td colspan="2">browser main thread</td></tr>`,
      `<tr><td>document hidden</td><td>${sample.browser.documentHidden ? 'yes' : 'no'}</td></tr>`,
      `<tr><td>visibility</td><td>${escapeHtml(sample.browser.visibilityState)}</td></tr>`,
      `<tr><td>sample window</td><td>${formatMs(sample.browser.elapsedSinceLastSampleMs)}</td></tr>`,
      `<tr><td>long task count</td><td>${formatNumber(sample.browser.longTasks.count)}</td></tr>`,
      `<tr><td>long task total</td><td>${formatMs(sample.browser.longTasks.totalMs)}</td></tr>`,
      `<tr><td>long task max</td><td>${formatMs(sample.browser.longTasks.maxMs)}</td></tr>`,
      `<tr><td>animation frame count</td><td>${formatNumber(sample.browser.animationFrames.count)}</td></tr>`,
      `<tr><td>animation frame total</td><td>${formatMs(sample.browser.animationFrames.totalMs)}</td></tr>`,
      `<tr><td>animation frame max</td><td>${formatMs(sample.browser.animationFrames.maxMs)}</td></tr>`,
      `<tr><td>animation frame blocking</td><td>${formatMs(sample.browser.animationFrames.totalBlockingMs)}</td></tr>`,
      `<tr><td>animation frame script</td><td>${formatMs(sample.browser.animationFrames.totalScriptMs)}</td></tr>`,
      `<tr><td>animation frame style/layout</td><td>${formatMs(sample.browser.animationFrames.totalStyleLayoutMs)}</td></tr>`,
      `<tr><td>event loop delay count</td><td>${formatNumber(sample.browser.eventLoopDelays.count)}</td></tr>`,
      `<tr><td>event loop delay total</td><td>${formatMs(sample.browser.eventLoopDelays.totalDelayMs)}</td></tr>`,
      `<tr><td>event loop delay max</td><td>${formatMs(sample.browser.eventLoopDelays.maxDelayMs)}</td></tr>`,
      `<tr><td>event timing count</td><td>${formatNumber(sample.browser.eventTimings.count)}</td></tr>`,
      `<tr><td>event timing total</td><td>${formatMs(sample.browser.eventTimings.totalDurationMs)}</td></tr>`,
      `<tr><td>event timing max</td><td>${formatMs(sample.browser.eventTimings.maxDurationMs)}</td></tr>`,
      `<tr><td>event timing processing</td><td>${formatMs(sample.browser.eventTimings.totalProcessingMs)}</td></tr>`,
      `<tr><td>latest event</td><td>${escapeHtml(sample.browser.eventTimings.latestName || '--')}</td></tr>`,
      `<tr class="pixi-profiler-section-row"><td colspan="2">resources & memory</td></tr>`,
      `<tr><td>resource count</td><td>${formatNumber(sample.browser.resources.count)}</td></tr>`,
      `<tr><td>resource total duration</td><td>${formatMs(sample.browser.resources.totalDurationMs)}</td></tr>`,
      `<tr><td>resource max duration</td><td>${formatMs(sample.browser.resources.maxDurationMs)}</td></tr>`,
      `<tr><td>resource transfer</td><td>${formatBytes(sample.browser.resources.transferSizeBytes)}</td></tr>`,
      `<tr><td>resource decoded</td><td>${formatBytes(sample.browser.resources.decodedBodySizeBytes)}</td></tr>`,
      `<tr><td>slowest resource</td><td title="${escapeHtml(sample.browser.resources.slowestName)}">${escapeHtml(sample.browser.resources.slowestInitiatorType || '--')}</td></tr>`,
      ...resourceInitiatorRows.map((entry) => `<tr><td>${escapeHtml(`resource.${entry.type} x${entry.count}`)}</td><td>${formatMs(entry.totalDurationMs)}</td></tr>`),
      `<tr><td>heap used</td><td>${memory ? formatBytes(memory.usedJSHeapSizeBytes) : '--'}</td></tr>`,
      `<tr><td>heap total</td><td>${memory ? formatBytes(memory.totalJSHeapSizeBytes) : '--'}</td></tr>`,
      `<tr><td>heap limit</td><td>${memory ? formatBytes(memory.jsHeapSizeLimitBytes) : '--'}</td></tr>`,
      `<tr class="pixi-profiler-section-row"><td colspan="2">pixi render</td></tr>`,
      ...metricRows.map((entry) => `<tr><td>${escapeHtml(METRIC_LABELS[entry.key])}</td><td>${formatMs(entry.value)}</td></tr>`),
      `<tr class="pixi-profiler-section-row"><td colspan="2">runtime/socket</td></tr>`,
      ...runtimeRows.map((entry) => `<tr><td>${escapeHtml(RUNTIME_METRIC_LABELS[entry.key])}</td><td>${formatMs(entry.value)}</td></tr>`),
      `<tr class="pixi-profiler-section-row"><td colspan="2">counters</td></tr>`,
      ...counterRows.map((entry) => `<tr class="pixi-profiler-counter-row"><td>${escapeHtml(COUNTER_LABELS[entry.key])}</td><td>${formatNumber(entry.value)}</td></tr>`),
      `<tr class="pixi-profiler-section-row"><td colspan="2">renderer state</td></tr>`,
      ...buildRendererRows(sample.renderer).map(([key, value]) => `<tr class="pixi-profiler-counter-row"><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`),
    ].join('');
  }

  private togglePaused(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.followLatest = false;
      this.selectedSample = this.selectedSample ?? this.samples[this.samples.length - 1] ?? null;
    } else {
      this.followLatest = true;
      this.selectedSample = this.samples[this.samples.length - 1] ?? this.selectedSample;
    }
    this.scheduleRender();
  }

  private async copySelectedSample(): Promise<void> {
    const sample = this.selectedSample;
    if (!sample) return;
    const copied = await copyTextToClipboard(formatFrameSampleForClipboard(sample));
    this.showCopyFeedback(copied);
  }

  private showCopyFeedback(copied: boolean): void {
    const button = this.copyBtn;
    if (!button) return;
    if (this.copyFeedbackTimer !== null) {
      window.clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
    button.textContent = copied ? 'Copied' : 'Failed';
    button.classList.toggle('is-copy-ok', copied);
    button.classList.toggle('is-copy-failed', !copied);
    this.copyFeedbackTimer = window.setTimeout(() => {
      if (!this.copyBtn) return;
      this.copyBtn.textContent = 'Copy';
      this.copyBtn.classList.remove('is-copy-ok', 'is-copy-failed');
      this.copyFeedbackTimer = null;
    }, 1200);
  }
}

function formatFrameSampleForClipboard(sample: PixiProfileFrameSample): string {
  const metricRows = PIXI_PROFILE_METRIC_KEYS
    .map((key) => ({ key, value: sample.metrics[key] }))
    .sort((left, right) => right.value - left.value);
  const runtimeRows = RUNTIME_PROFILE_METRIC_KEYS
    .map((key) => ({ key, value: sample.runtimeMetrics[key] }))
    .sort((left, right) => right.value - left.value);
  const counterRows = PIXI_PROFILE_COUNTER_KEYS
    .map((key) => ({ key, value: sample.counters[key] }));
  const runtimeTotalMs = getTopLevelRuntimeMs(sample);
  const budget = computeFrameBudget(sample);
  const topOffenders = buildTopOffenders(sample);
  const memory = sample.browser.memory;
  const unprofiledScheduleLateMs = Math.max(0, sample.schedule.scheduleLateMs - runtimeTotalMs);

  return [
    'meta\tvalue',
    'profilerVersion\t5',
    `capturedAtMs\t${Number(performance.now().toFixed(3))}`,
    `devicePixelRatio\t${typeof window === 'undefined' ? '' : Number(window.devicePixelRatio.toFixed(3))}`,
    `viewport\t${typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`}`,
    `userAgent\t${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
    `visibilityState\t${sample.browser.visibilityState}`,
    '',
    'summary\tvalue',
    `frame\t${sample.index}`,
    `atMs\t${Number(sample.atMs.toFixed(3))}`,
    `frameIntervalMs\t${Number(sample.frameIntervalMs.toFixed(3))}`,
    `frameFps\t${sample.frameFps === null ? '' : Number(sample.frameFps.toFixed(3))}`,
    `profiledMs\t${Number(budget.profiledMs.toFixed(3))}`,
    `callbackActiveMs\t${Number(budget.callbackActiveMs.toFixed(3))}`,
    `callbackCoverageRatio\t${Number(budget.callbackCoverageRatio.toFixed(3))}`,
    `callbackUnprofiledMs\t${Number(budget.callbackUnprofiledMs.toFixed(3))}`,
    `intervalUnattributedMs\t${Number(budget.intervalUnattributedMs.toFixed(3))}`,
    `profileCoverageRatio\t${Number(budget.callbackCoverageRatio.toFixed(3))}`,
    `frameUnprofiledMs\t${Number(budget.intervalUnattributedMs.toFixed(3))}`,
    `rawRafIntervalMs\t${Number(sample.schedule.rafIntervalMs.toFixed(3))}`,
    `rafCallbacks\t${sample.schedule.rafCallbacks}`,
    `skippedRafCallbacks\t${sample.schedule.skippedRafCallbacks}`,
    `targetFps\t${sample.schedule.targetFps}`,
    `targetIntervalMs\t${Number(sample.schedule.targetIntervalMs.toFixed(3))}`,
    `rafCallbackPreRenderMs\t${Number(sample.schedule.rafCallbackPreRenderMs.toFixed(3))}`,
    `rafCallbackActiveMs\t${Number(sample.schedule.rafCallbackActiveMs.toFixed(3))}`,
    `rafTargetGapMs\t${Number(sample.schedule.rafTargetGapMs.toFixed(3))}`,
    `missedTargetFrames\t${Number(sample.schedule.missedTargetFrames.toFixed(3))}`,
    `scheduleLateMs\t${Number(sample.schedule.scheduleLateMs.toFixed(3))}`,
    `totalMs\t${Number(sample.totalMs.toFixed(3))}`,
    `runtimeProfiledMs\t${Number(runtimeTotalMs.toFixed(3))}`,
    `scheduleLateUnprofiledMs\t${Number(unprofiledScheduleLateMs.toFixed(3))}`,
    '',
    'topOffenders',
    'rank\tgroup\tname\tms\tcount',
    ...topOffenders.map((entry, index) => `${index + 1}\t${entry.group}\t${entry.name}\t${Number(entry.value.toFixed(3))}\t${entry.count}`),
    '',
    'browser\tvalue',
    `documentHidden\t${sample.browser.documentHidden ? 'true' : 'false'}`,
    `sampleWindowMs\t${Number(sample.browser.elapsedSinceLastSampleMs.toFixed(3))}`,
    `longTaskCount\t${sample.browser.longTasks.count}`,
    `longTaskTotalMs\t${Number(sample.browser.longTasks.totalMs.toFixed(3))}`,
    `longTaskMaxMs\t${Number(sample.browser.longTasks.maxMs.toFixed(3))}`,
    `animationFrameCount\t${sample.browser.animationFrames.count}`,
    `animationFrameTotalMs\t${Number(sample.browser.animationFrames.totalMs.toFixed(3))}`,
    `animationFrameMaxMs\t${Number(sample.browser.animationFrames.maxMs.toFixed(3))}`,
    `animationFrameBlockingMs\t${Number(sample.browser.animationFrames.totalBlockingMs.toFixed(3))}`,
    `animationFrameScriptMs\t${Number(sample.browser.animationFrames.totalScriptMs.toFixed(3))}`,
    `animationFrameStyleLayoutMs\t${Number(sample.browser.animationFrames.totalStyleLayoutMs.toFixed(3))}`,
    `eventLoopDelayCount\t${sample.browser.eventLoopDelays.count}`,
    `eventLoopDelayTotalMs\t${Number(sample.browser.eventLoopDelays.totalDelayMs.toFixed(3))}`,
    `eventLoopDelayMaxMs\t${Number(sample.browser.eventLoopDelays.maxDelayMs.toFixed(3))}`,
    `eventLoopDelayLatestMs\t${Number(sample.browser.eventLoopDelays.latestDelayMs.toFixed(3))}`,
    `eventTimingCount\t${sample.browser.eventTimings.count}`,
    `eventTimingTotalMs\t${Number(sample.browser.eventTimings.totalDurationMs.toFixed(3))}`,
    `eventTimingMaxMs\t${Number(sample.browser.eventTimings.maxDurationMs.toFixed(3))}`,
    `eventTimingProcessingMs\t${Number(sample.browser.eventTimings.totalProcessingMs.toFixed(3))}`,
    `eventTimingMaxProcessingMs\t${Number(sample.browser.eventTimings.maxProcessingMs.toFixed(3))}`,
    `eventTimingLatestName\t${sample.browser.eventTimings.latestName}`,
    `eventTimingLatestDurationMs\t${Number(sample.browser.eventTimings.latestDurationMs.toFixed(3))}`,
    '',
    'resources\tvalue',
    `resourceCount\t${sample.browser.resources.count}`,
    `resourceTotalDurationMs\t${Number(sample.browser.resources.totalDurationMs.toFixed(3))}`,
    `resourceMaxDurationMs\t${Number(sample.browser.resources.maxDurationMs.toFixed(3))}`,
    `resourceTransferBytes\t${sample.browser.resources.transferSizeBytes}`,
    `resourceDecodedBytes\t${sample.browser.resources.decodedBodySizeBytes}`,
    `slowestResourceType\t${sample.browser.resources.slowestInitiatorType}`,
    `slowestResourceName\t${sample.browser.resources.slowestName}`,
    '',
    'resourceInitiators',
    'type\tcount\ttotalDurationMs',
    ...sample.browser.resources.initiators.map((entry) => `${entry.type}\t${entry.count}\t${Number(entry.totalDurationMs.toFixed(3))}`),
    '',
    'memory\tbytes',
    `usedJSHeapSize\t${memory?.usedJSHeapSizeBytes ?? ''}`,
    `totalJSHeapSize\t${memory?.totalJSHeapSizeBytes ?? ''}`,
    `jsHeapSizeLimit\t${memory?.jsHeapSizeLimitBytes ?? ''}`,
    '',
    'metric\tms',
    ...metricRows.map((entry) => `${METRIC_LABELS[entry.key]}\t${Number(entry.value.toFixed(3))}`),
    '',
    'runtime\tms',
    ...runtimeRows.map((entry) => `${RUNTIME_METRIC_LABELS[entry.key]}\t${Number(entry.value.toFixed(3))}`),
    '',
    'counter\tvalue',
    ...counterRows.map((entry) => `${COUNTER_LABELS[entry.key]}\t${Math.round(entry.value)}`),
    '',
    'renderer\tvalue',
    ...buildRendererRows(sample.renderer).map(([key, value]) => `${key}\t${value}`),
  ].join('\n');
}

function getTopLevelRuntimeMs(sample: PixiProfileFrameSample): number {
  return (sample.runtimeMetrics['socket.decodeSyncEnvelope'] ?? 0)
    + (sample.runtimeMetrics['socket.syncEnvelope'] ?? 0)
    + (sample.runtimeMetrics['socket.decodeEventWorldDelta'] ?? 0)
    + (sample.runtimeMetrics['socket.worldDelta'] ?? 0)
    + (sample.runtimeMetrics['socket.decodeEventSelfDelta'] ?? 0)
    + (sample.runtimeMetrics['socket.selfDelta'] ?? 0)
    + (sample.runtimeMetrics['socket.decodeEventPanelDelta'] ?? 0)
    + (sample.runtimeMetrics['socket.panelDelta'] ?? 0)
    + (sample.runtimeMetrics['runtime.flushDeferredSideEffects'] ?? 0);
}

function computeFrameBudget(sample: PixiProfileFrameSample): {
  profiledMs: number;
  callbackActiveMs: number;
  callbackUnprofiledMs: number;
  callbackCoverageRatio: number;
  intervalUnattributedMs: number;
} {
  const runtimeMs = getTopLevelRuntimeMs(sample);
  const profiledMs = Math.max(0, sample.totalMs) + runtimeMs;
  const callbackActiveMs = Math.max(0, sample.schedule.rafCallbackActiveMs);
  const pixiProfiledMs = Math.max(0, sample.totalMs);
  const callbackUnprofiledMs = Math.max(0, callbackActiveMs - pixiProfiledMs);
  const callbackCoverageRatio = callbackActiveMs > 0 ? Math.min(1, pixiProfiledMs / callbackActiveMs) : 0;
  const frameMs = Math.max(0, sample.frameIntervalMs);
  const intervalUnattributedMs = Math.max(0, frameMs - runtimeMs - callbackActiveMs);
  return {
    profiledMs,
    callbackActiveMs,
    callbackUnprofiledMs,
    callbackCoverageRatio,
    intervalUnattributedMs,
  };
}

function buildTopOffenders(sample: PixiProfileFrameSample): ProfileOffenderRow[] {
  const offenders: ProfileOffenderRow[] = [
    ...PIXI_PROFILE_METRIC_KEYS.map((key) => ({
      group: 'pixi' as const,
      name: METRIC_LABELS[key],
      value: sample.metrics[key],
      count: sample.metrics[key] > 0 ? 1 : 0,
    })),
    ...RUNTIME_PROFILE_METRIC_KEYS.map((key) => ({
      group: 'runtime' as const,
      name: RUNTIME_METRIC_LABELS[key],
      value: sample.runtimeMetrics[key],
      count: sample.runtimeMetrics[key] > 0 ? 1 : 0,
    })),
  ];
  const budget = computeFrameBudget(sample);
  if (budget.callbackUnprofiledMs > 0) {
    offenders.push({ group: 'gap', name: 'raf.callbackUnprofiled', value: budget.callbackUnprofiledMs, count: 1 });
  }
  if (budget.intervalUnattributedMs > 0) {
    offenders.push({ group: 'gap', name: 'raf.intervalUnattributed', value: budget.intervalUnattributedMs, count: 1 });
  }
  if (sample.schedule.rafTargetGapMs > 0) {
    offenders.push({
      group: 'gap',
      name: 'raf.targetGap',
      value: sample.schedule.rafTargetGapMs,
      count: Math.max(1, Math.round(sample.schedule.missedTargetFrames)),
    });
  }
  if (sample.schedule.skippedRafCallbacks > 0) {
    offenders.push({
      group: 'gap',
      name: 'mapRuntime.skippedRaf',
      value: sample.schedule.skippedRafCallbacks * sample.schedule.targetIntervalMs,
      count: sample.schedule.skippedRafCallbacks,
    });
  }
  if (sample.browser.longTasks.totalMs > 0) {
    offenders.push({
      group: 'browser',
      name: 'longTasks.total',
      value: sample.browser.longTasks.totalMs,
      count: sample.browser.longTasks.count,
    });
  }
  if (sample.browser.animationFrames.totalBlockingMs > 0) {
    offenders.push({
      group: 'browser',
      name: 'animationFrame.blocking',
      value: sample.browser.animationFrames.totalBlockingMs,
      count: sample.browser.animationFrames.count,
    });
  }
  if (sample.browser.eventLoopDelays.maxDelayMs > 0) {
    offenders.push({
      group: 'browser',
      name: 'eventLoopDelay.max',
      value: sample.browser.eventLoopDelays.maxDelayMs,
      count: sample.browser.eventLoopDelays.count,
    });
  }
  if (sample.browser.eventTimings.maxProcessingMs > 0) {
    offenders.push({
      group: 'browser',
      name: sample.browser.eventTimings.latestName
        ? `event.${sample.browser.eventTimings.latestName}.processing`
        : 'event.processing',
      value: sample.browser.eventTimings.maxProcessingMs,
      count: sample.browser.eventTimings.count,
    });
  }
  if (sample.browser.resources.maxDurationMs > 0) {
    offenders.push({
      group: 'resource',
      name: sample.browser.resources.slowestInitiatorType || 'resource.max',
      value: sample.browser.resources.maxDurationMs,
      count: sample.browser.resources.count,
    });
  }
  return offenders
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value || right.count - left.count)
    .slice(0, 10);
}

function buildRendererRows(renderer: PixiProfileRendererState): Array<[string, string]> {
  return [
    ['terrainChunks', formatNumber(renderer.terrainChunks)],
    ['cachedTerrainChunks', formatNumber(renderer.cachedTerrainChunks)],
    ['terrainCacheRatio', renderer.terrainChunks > 0 ? formatPercent(renderer.cachedTerrainChunks / renderer.terrainChunks) : '--'],
    ['terrainCachedContainers', formatNumber(renderer.terrainCachedContainers)],
    ['terrainChunkChildren', formatNumber(renderer.terrainChunkChildren)],
    ['entities', formatNumber(renderer.entities)],
    ['groundChildren', formatNumber(renderer.groundChildren)],
    ['entityChildren', formatNumber(renderer.entityChildren)],
    ['effectChildren', formatNumber(renderer.effectChildren)],
    ['screenChildren', formatNumber(renderer.screenChildren)],
    ['pathChildren', formatNumber(renderer.pathChildren)],
    ['floatingTexts', formatNumber(renderer.floatingTexts)],
    ['attackTrails', formatNumber(renderer.attackTrails)],
    ['warningZones', formatNumber(renderer.warningZones)],
    ['runtimeTileTextures', formatNumber(renderer.runtimeTileTextures)],
    ['runtimeAtlasTextures', formatNumber(renderer.runtimeAtlasTextures)],
    ['runtimeEntityTextures', formatNumber(renderer.runtimeEntityTextures)],
    ['runtimeTileTextureRequests', formatNumber(renderer.runtimeTileTextureRequests)],
    ['runtimeEntityTextureRequests', formatNumber(renderer.runtimeEntityTextureRequests)],
    ['runtimeTileManifestState', renderer.runtimeTileManifestState],
    ['backbufferWidth', formatNumber(renderer.backbufferWidth)],
    ['backbufferHeight', formatNumber(renderer.backbufferHeight)],
    ['backbufferPixels', formatNumber(renderer.backbufferPixels)],
    ['backbufferBytes', formatBytes(renderer.backbufferPixels * 4)],
  ];
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof document === 'undefined') return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 回退到 textarea 复制。
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function formatMs(value: number): string {
  return `${Number(value.toFixed(value >= 10 ? 1 : 2))}ms`;
}

function formatNumber(value: number): string {
  return String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0B';
  if (value >= 1024 * 1024) return `${Number((value / 1024 / 1024).toFixed(1))}MB`;
  if (value >= 1024) return `${Number((value / 1024).toFixed(1))}KB`;
  return `${Math.round(value)}B`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

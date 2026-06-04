/**
 * 本文件属于客户端地图渲染诊断模块，负责 Pixi 主世界 profiling 独立窗口。
 *
 * 诊断 UI 只在本地 profiling 开关启用时挂载，不参与服务端权威逻辑和正常渲染路径。
 */

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
  frameIndex: number;
  metrics: Record<PixiProfileMetricKey, PixiProfileMetric>;
  counters: Record<PixiProfileCounterKey, number>;
  frameMetrics: Record<PixiProfileMetricKey, number>;
  frameCounters: Record<PixiProfileCounterKey, number>;
}

export interface PixiProfileSnapshot {
  enabled: true;
  startedAt: number;
  elapsedMs: number;
  metrics: Record<PixiProfileMetricKey, PixiProfileMetric & { avgMs: number }>;
  counters: Record<PixiProfileCounterKey, number>;
  renderer: PixiProfileRendererState;
}

export interface PixiProfileRendererState {
  terrainChunks: number;
  entities: number;
  runtimeTileTextures: number;
  runtimeTileManifestState: 'idle' | 'loading' | 'loaded' | 'error';
}

export interface PixiProfileFrameSample {
  index: number;
  atMs: number;
  totalMs: number;
  metrics: Record<PixiProfileMetricKey, number>;
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
    const samples = this.samples;
    const selected = this.selectedSample;
    const maxMs = Math.max(16.7, 33.3, ...samples.map((sample) => sample.totalMs));
    this.drawReferenceLine(ctx, width, height, maxMs, 16.7, '#334155', '16.7');
    this.drawReferenceLine(ctx, width, height, maxMs, 33.3, '#475569', '33.3');
    if (samples.length > 1) {
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
        const y = height - (sample.totalMs / maxMs) * (height - 20) - 10;
        const hot = sample.totalMs >= 33.3;
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
    this.summaryEl.textContent = `${formatMs(selected.totalMs)} ${suffix}`;
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
      ['textures', sample.renderer.runtimeTileTextures],
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
    const counterRows = PIXI_PROFILE_COUNTER_KEYS
      .map((key) => ({ key, value: sample.counters[key] }))
      .filter((entry) => entry.value > 0);
    this.detailBodyEl.innerHTML = [
      `<tr class="pixi-profiler-selected-row"><td>frame #${sample.index}</td><td>${formatMs(sample.totalMs)}</td></tr>`,
      ...metricRows.map((entry) => `<tr><td>${escapeHtml(METRIC_LABELS[entry.key])}</td><td>${formatMs(entry.value)}</td></tr>`),
      ...counterRows.map((entry) => `<tr class="pixi-profiler-counter-row"><td>${escapeHtml(COUNTER_LABELS[entry.key])}</td><td>${formatNumber(entry.value)}</td></tr>`),
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
  const counterRows = PIXI_PROFILE_COUNTER_KEYS
    .map((key) => ({ key, value: sample.counters[key] }));

  return [
    `frame\t${sample.index}`,
    `atMs\t${Number(sample.atMs.toFixed(3))}`,
    `totalMs\t${Number(sample.totalMs.toFixed(3))}`,
    '',
    'metric\tms',
    ...metricRows.map((entry) => `${METRIC_LABELS[entry.key]}\t${Number(entry.value.toFixed(3))}`),
    '',
    'counter\tvalue',
    ...counterRows.map((entry) => `${COUNTER_LABELS[entry.key]}\t${Math.round(entry.value)}`),
    '',
    'renderer\tvalue',
    `terrainChunks\t${sample.renderer.terrainChunks}`,
    `entities\t${sample.renderer.entities}`,
    `runtimeTileTextures\t${sample.renderer.runtimeTileTextures}`,
    `runtimeTileManifestState\t${sample.renderer.runtimeTileManifestState}`,
  ].join('\n');
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

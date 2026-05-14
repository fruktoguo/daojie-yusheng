/**
 * RuntimeEventBus 指标收集与暴露服务。
 * 不落库，仅暴露给 metrics endpoint / GM 面板。
 *
 * 职责：
 * - 每 tick 收集 queue/flush/drop/merge 计数
 * - 维护队列水位快照
 * - 维护 flush 耗时滑动窗口（P99）
 * - 聚合丢弃日志（每 10 秒一次 warn）
 */

import { Injectable, Logger } from '@nestjs/common';

/** flush 耗时滑动窗口大小（最近 N 次 flush）。 */
const FLUSH_DURATION_WINDOW = 120;

/** 丢弃日志聚合间隔（毫秒）。 */
const DROP_LOG_INTERVAL_MS = 10_000;

// ─── 公开指标接口 ───

export interface EventBusMetrics {
  // 计数器（每 tick 重置）
  tickQueuedTotal: number;
  tickFlushedTotal: number;
  tickDroppedTotal: number;
  tickMergedTotal: number;

  // 分类计数
  queuedByMethod: Record<string, number>;
  droppedByMethod: Record<string, number>;

  // 队列水位（flush 前快照）
  maxPlayerQueueSize: number;
  maxInstanceQueueSize: number;
  activePlayerQueues: number;
  activeInstanceQueues: number;

  // 耗时
  flushDurationMs: number;
  flushDurationP99Ms: number;
}

// ─── 服务实现 ───

@Injectable()
export class RuntimeEventBusMetricsService {
  private readonly logger = new Logger(RuntimeEventBusMetricsService.name);

  // ─── 每 tick 计数器（recordTick 后重置） ───
  private _tickQueuedTotal = 0;
  private _tickFlushedTotal = 0;
  private _tickDroppedTotal = 0;
  private _tickMergedTotal = 0;

  private _queuedByMethod: Record<string, number> = {};
  private _droppedByMethod: Record<string, number> = {};

  // ─── 队列水位 ───
  private _maxPlayerQueueSize = 0;
  private _maxInstanceQueueSize = 0;
  private _activePlayerQueues = 0;
  private _activeInstanceQueues = 0;

  // ─── flush 耗时 ───
  private _lastFlushDurationMs = 0;
  private readonly _flushDurationHistory: number[] = [];

  // ─── 丢弃日志聚合 ───
  private _dropAccumulator = 0;
  private _dropTopSources: Record<string, number> = {};
  private _lastDropLogAt = 0;

  // ═══════════════════════════════════════════════════════════════
  // 入队计数（由 RuntimeEventBusService 调用）
  // ═══════════════════════════════════════════════════════════════

  recordQueued(method: string, count = 1): void {
    this._tickQueuedTotal += count;
    this._queuedByMethod[method] = (this._queuedByMethod[method] ?? 0) + count;
  }

  recordDropped(method: string, count = 1): void {
    this._tickDroppedTotal += count;
    this._droppedByMethod[method] = (this._droppedByMethod[method] ?? 0) + count;
    this._dropAccumulator += count;
    this._dropTopSources[method] = (this._dropTopSources[method] ?? 0) + count;
  }

  recordMerged(method: string, count = 1): void {
    this._tickMergedTotal += count;
    // merged 也算 queued
    this._tickQueuedTotal += count;
    this._queuedByMethod[method] = (this._queuedByMethod[method] ?? 0) + count;
  }

  // ═══════════════════════════════════════════════════════════════
  // flush 阶段（由 flushTick 调用）
  // ═══════════════════════════════════════════════════════════════

  /** flush 前记录队列水位快照。 */
  recordWatermark(
    activePlayerQueues: number,
    activeInstanceQueues: number,
    maxPlayerQueueSize: number,
    maxInstanceQueueSize: number,
  ): void {
    this._activePlayerQueues = activePlayerQueues;
    this._activeInstanceQueues = activeInstanceQueues;
    this._maxPlayerQueueSize = maxPlayerQueueSize;
    this._maxInstanceQueueSize = maxInstanceQueueSize;
  }

  /** flush 完成后记录耗时和 flushed 总数。 */
  recordFlush(durationMs: number, flushedTotal: number): void {
    this._tickFlushedTotal = flushedTotal;
    this._lastFlushDurationMs = roundMs(durationMs);
    this._flushDurationHistory.push(this._lastFlushDurationMs);
    if (this._flushDurationHistory.length > FLUSH_DURATION_WINDOW) {
      this._flushDurationHistory.splice(0, this._flushDurationHistory.length - FLUSH_DURATION_WINDOW);
    }

    // 告警日志
    if (durationMs > 100) {
      this.logger.warn(
        `flushTick took ${roundMs(durationMs)}ms — watermark: ${this._activePlayerQueues} players, ${this._activeInstanceQueues} instances`,
      );
    }

    // 丢弃聚合日志
    this.maybeLogDrops();
  }

  // ═══════════════════════════════════════════════════════════════
  // tick 结束重置
  // ═══════════════════════════════════════════════════════════════

  /** tick 结束后重置每 tick 计数器。在 recordFlush 之后调用。 */
  resetTick(): void {
    this._tickQueuedTotal = 0;
    this._tickFlushedTotal = 0;
    this._tickDroppedTotal = 0;
    this._tickMergedTotal = 0;
    this._queuedByMethod = {};
    this._droppedByMethod = {};
  }

  // ═══════════════════════════════════════════════════════════════
  // 查询（暴露给 metrics endpoint / GM 面板）
  // ═══════════════════════════════════════════════════════════════

  getMetrics(): EventBusMetrics {
    return {
      tickQueuedTotal: this._tickQueuedTotal,
      tickFlushedTotal: this._tickFlushedTotal,
      tickDroppedTotal: this._tickDroppedTotal,
      tickMergedTotal: this._tickMergedTotal,
      queuedByMethod: { ...this._queuedByMethod },
      droppedByMethod: { ...this._droppedByMethod },
      maxPlayerQueueSize: this._maxPlayerQueueSize,
      maxInstanceQueueSize: this._maxInstanceQueueSize,
      activePlayerQueues: this._activePlayerQueues,
      activeInstanceQueues: this._activeInstanceQueues,
      flushDurationMs: this._lastFlushDurationMs,
      flushDurationP99Ms: this.computeP99(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 内部工具
  // ═══════════════════════════════════════════════════════════════

  private computeP99(): number {
    const arr = this._flushDurationHistory;
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1);
    return sorted[idx];
  }

  private maybeLogDrops(): void {
    if (this._dropAccumulator === 0) return;
    const now = Date.now();
    if (now - this._lastDropLogAt < DROP_LOG_INTERVAL_MS) return;

    // top 3 sources
    const top3 = Object.entries(this._dropTopSources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([method, count]) => `${method}:${count}`)
      .join(', ');

    this.logger.warn(
      `Dropped ${this._dropAccumulator} events in last ${Math.round((now - (this._lastDropLogAt || now)) / 1000)}s — top sources: ${top3}`,
    );

    this._dropAccumulator = 0;
    this._dropTopSources = {};
    this._lastDropLogAt = now;
  }
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
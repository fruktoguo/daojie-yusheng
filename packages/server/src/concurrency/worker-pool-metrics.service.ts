/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * Worker Pool 指标采集服务。
 * 记录各 pool 的任务数、p50/p95 耗时、超时数、异常数。
 * 接入 RuntimeGmStateService 的 GM 性能页。
 */
import { Injectable } from '@nestjs/common';
import type { WorkerPoolMetrics } from './worker-task.types';

/** Pool 类型标识 */
export type PoolKind = 'encoding' | 'instance' | 'persistence';

/** 内部指标状态 */
interface PoolMetricsState {
  totalSubmitted: number;
  totalCompleted: number;
  totalTimedOut: number;
  totalFailed: number;
  totalFallback: number;
  inFlight: number;
  activeWorkers: number;
  /** 最近 N 个任务耗时（用于计算 p50/p95） */
  recentDurations: number[];
}

const RECENT_WINDOW = 100;

@Injectable()
export class WorkerPoolMetricsService {
  private readonly pools = new Map<PoolKind, PoolMetricsState>();

  constructor() {
    for (const kind of ['encoding', 'instance', 'persistence'] as PoolKind[]) {
      this.pools.set(kind, this.createEmptyState());
    }
  }

  /** 记录任务提交 */
  recordSubmit(pool: PoolKind): void {
    const state = this.getState(pool);
    state.totalSubmitted += 1;
    state.inFlight += 1;
  }

  /** 记录任务完成 */
  recordComplete(pool: PoolKind, durationMs: number): void {
    const state = this.getState(pool);
    state.totalCompleted += 1;
    state.inFlight = Math.max(0, state.inFlight - 1);
    this.pushDuration(state, durationMs);
  }

  /** 记录任务超时 */
  recordTimeout(pool: PoolKind): void {
    const state = this.getState(pool);
    state.totalTimedOut += 1;
    state.inFlight = Math.max(0, state.inFlight - 1);
  }

  /** 记录任务失败 */
  recordFailed(pool: PoolKind): void {
    const state = this.getState(pool);
    state.totalFailed += 1;
    state.inFlight = Math.max(0, state.inFlight - 1);
  }

  /** 记录 fallback 到主线程 */
  recordFallback(pool: PoolKind): void {
    const state = this.getState(pool);
    state.totalFallback += 1;
  }

  /** 设置活跃 worker 数 */
  setActiveWorkers(pool: PoolKind, count: number): void {
    this.getState(pool).activeWorkers = count;
  }

  /** 获取指定 pool 的指标快照 */
  getMetrics(pool: PoolKind): WorkerPoolMetrics {
    const state = this.getState(pool);
    const sorted = [...state.recentDurations].sort((a, b) => a - b);
    return {
      totalSubmitted: state.totalSubmitted,
      totalCompleted: state.totalCompleted,
      totalTimedOut: state.totalTimedOut,
      totalFailed: state.totalFailed,
      totalFallback: state.totalFallback,
      p50Ms: this.percentile(sorted, 0.5),
      p95Ms: this.percentile(sorted, 0.95),
      inFlight: state.inFlight,
      activeWorkers: state.activeWorkers,
    };
  }

  /** 获取所有 pool 的指标（供 GM 性能页） */
  getAllMetrics(): Record<PoolKind, WorkerPoolMetrics> {
    return {
      encoding: this.getMetrics('encoding'),
      instance: this.getMetrics('instance'),
      persistence: this.getMetrics('persistence'),
    };
  }

  // ─── 内部方法 ────────────────────────────────────────────────

  private getState(pool: PoolKind): PoolMetricsState {
    return this.pools.get(pool)!;
  }

  private createEmptyState(): PoolMetricsState {
    return {
      totalSubmitted: 0,
      totalCompleted: 0,
      totalTimedOut: 0,
      totalFailed: 0,
      totalFallback: 0,
      inFlight: 0,
      activeWorkers: 0,
      recentDurations: [],
    };
  }

  private pushDuration(state: PoolMetricsState, durationMs: number): void {
    state.recentDurations.push(durationMs);
    if (state.recentDurations.length > RECENT_WINDOW) {
      state.recentDurations.shift();
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}

/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable } from '@nestjs/common';

const TICK_METRIC_WINDOW_SIZE = 60;

/** 单帧各阶段耗时（毫秒） */
export interface TickPhaseDurations {
  resetFrameEffectsMs: number;
  planInstanceStepsMs: number;
  preTickMaterializationMs: number;
  pendingCommandsMs: number;
  systemCommandsMs: number;
  workerPrecomputeMs: number;
  instanceTicksMs: number;
  postTickCleanupMs: number;
  playerAdvanceMs: number;
}

export type TickPhaseDurationHistory = {
  [Key in keyof TickPhaseDurations]: number[];
};

/** 单帧内更细粒度 tick 段统计。count 表示本帧执行次数。 */
export interface TickSectionDurationSample {
  totalMs: number;
  count: number;
}

export type TickSectionDurations = Record<string, TickSectionDurationSample>;
export type TickSectionDurationHistory = Record<string, TickSectionDurationSample[]>;
export type TickMetricSummaryByKey = Record<string, { totalMs: number; count: number; sampleCount: number }>;

const TICK_PHASE_KEYS: ReadonlyArray<keyof TickPhaseDurations> = [
  'resetFrameEffectsMs',
  'planInstanceStepsMs',
  'preTickMaterializationMs',
  'pendingCommandsMs',
  'systemCommandsMs',
  'workerPrecomputeMs',
  'instanceTicksMs',
  'postTickCleanupMs',
  'playerAdvanceMs',
];

const EMPTY_TICK_PHASE_DURATIONS: Readonly<TickPhaseDurations> = Object.freeze({
  resetFrameEffectsMs: 0,
  planInstanceStepsMs: 0,
  preTickMaterializationMs: 0,
  pendingCommandsMs: 0,
  systemCommandsMs: 0,
  workerPrecomputeMs: 0,
  instanceTicksMs: 0,
  postTickCleanupMs: 0,
  playerAdvanceMs: 0,
});

/** 帧性能指标收集器，同时维护最近 60 帧窗口和自重置以来累计值。 */
@Injectable()
export class WorldRuntimeMetricsService {
  lastTickDurationMs = 0;
  lastSyncFlushDurationMs = 0;
  lastTickPhaseDurations: TickPhaseDurations = { ...EMPTY_TICK_PHASE_DURATIONS };
  tickDurationHistoryMs: number[] = [];
  syncFlushDurationHistoryMs: number[] = [];
  tickPhaseDurationHistoryMs: TickPhaseDurationHistory = createTickPhaseDurationHistory();
  lastTickSectionDurations: TickSectionDurations = {};
  tickSectionDurationHistoryMs: TickSectionDurationHistory = {};
  cumulativeTickDurationMs = 0;
  cumulativeTickFrameCount = 0;
  cumulativeSyncFlushDurationMs = 0;
  cumulativeSyncFlushCount = 0;
  cumulativeTickPhaseSummaries: TickMetricSummaryByKey = createTickPhaseCumulativeSummaries();
  cumulativeTickSectionSummaries: TickMetricSummaryByKey = {};

  resetCpuPerfCounters(): void {
    this.tickDurationHistoryMs = [];
    this.syncFlushDurationHistoryMs = [];
    this.tickPhaseDurationHistoryMs = createTickPhaseDurationHistory();
    this.lastTickSectionDurations = {};
    this.tickSectionDurationHistoryMs = {};
    this.cumulativeTickDurationMs = 0;
    this.cumulativeTickFrameCount = 0;
    this.cumulativeSyncFlushDurationMs = 0;
    this.cumulativeSyncFlushCount = 0;
    this.cumulativeTickPhaseSummaries = createTickPhaseCumulativeSummaries();
    this.cumulativeTickSectionSummaries = {};
  }

  recordIdleFrame(startedAt: number): void {
    this.lastTickPhaseDurations = { ...EMPTY_TICK_PHASE_DURATIONS };
    this.lastTickSectionDurations = {};
    this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
    pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
    pushTickPhaseDurationHistory(this.tickPhaseDurationHistoryMs, this.lastTickPhaseDurations);
    this.cumulativeTickDurationMs = roundDurationMs(this.cumulativeTickDurationMs + this.lastTickDurationMs);
    this.cumulativeTickFrameCount += 1;
    addTickPhaseCumulativeSummaries(this.cumulativeTickPhaseSummaries, this.lastTickPhaseDurations);
  }

  recordFrameResult(
    startedAt: number,
    phaseDurations: TickPhaseDurations,
    sectionDurations: TickSectionDurations = {},
  ): void {
    this.lastTickPhaseDurations = {
      resetFrameEffectsMs: roundDurationMs(phaseDurations.resetFrameEffectsMs),
      planInstanceStepsMs: roundDurationMs(phaseDurations.planInstanceStepsMs),
      preTickMaterializationMs: roundDurationMs(phaseDurations.preTickMaterializationMs),
      pendingCommandsMs: roundDurationMs(phaseDurations.pendingCommandsMs),
      systemCommandsMs: roundDurationMs(phaseDurations.systemCommandsMs),
      workerPrecomputeMs: roundDurationMs(phaseDurations.workerPrecomputeMs),
      instanceTicksMs: roundDurationMs(phaseDurations.instanceTicksMs),
      postTickCleanupMs: roundDurationMs(phaseDurations.postTickCleanupMs),
      playerAdvanceMs: roundDurationMs(phaseDurations.playerAdvanceMs),
    };
    this.lastTickSectionDurations = normalizeSectionDurations(sectionDurations);
    this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
    pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
    pushTickPhaseDurationHistory(this.tickPhaseDurationHistoryMs, this.lastTickPhaseDurations);
    pushTickSectionDurationHistory(this.tickSectionDurationHistoryMs, this.lastTickSectionDurations);
    this.cumulativeTickDurationMs = roundDurationMs(this.cumulativeTickDurationMs + this.lastTickDurationMs);
    this.cumulativeTickFrameCount += 1;
    addTickPhaseCumulativeSummaries(this.cumulativeTickPhaseSummaries, this.lastTickPhaseDurations);
    addTickSectionCumulativeSummaries(this.cumulativeTickSectionSummaries, this.lastTickSectionDurations);
  }

  recordSyncFlushDuration(durationMs: number): void {
    this.lastSyncFlushDurationMs = roundDurationMs(durationMs);
    pushDurationMetric(this.syncFlushDurationHistoryMs, this.lastSyncFlushDurationMs);
    this.cumulativeSyncFlushDurationMs = roundDurationMs(this.cumulativeSyncFlushDurationMs + this.lastSyncFlushDurationMs);
    this.cumulativeSyncFlushCount += 1;
  }
}

function roundDurationMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pushDurationMetric(history: number[], value: number): void {
  history.push(value);
  if (history.length > TICK_METRIC_WINDOW_SIZE) {
    history.splice(0, history.length - TICK_METRIC_WINDOW_SIZE);
  }
}

function createTickPhaseDurationHistory(): TickPhaseDurationHistory {
  return {
    resetFrameEffectsMs: [],
    planInstanceStepsMs: [],
    preTickMaterializationMs: [],
    pendingCommandsMs: [],
    systemCommandsMs: [],
    workerPrecomputeMs: [],
    instanceTicksMs: [],
    postTickCleanupMs: [],
    playerAdvanceMs: [],
  };
}

function createTickPhaseCumulativeSummaries(): TickMetricSummaryByKey {
  const result: TickMetricSummaryByKey = {};
  for (const key of TICK_PHASE_KEYS) {
    result[key] = { totalMs: 0, count: 0, sampleCount: 0 };
  }
  return result;
}

function pushTickPhaseDurationHistory(history: TickPhaseDurationHistory, durations: TickPhaseDurations): void {
  for (const key of TICK_PHASE_KEYS) {
    pushDurationMetric(history[key], durations[key]);
  }
}

function normalizeSectionDurations(input: TickSectionDurations): TickSectionDurations {
  const normalized: TickSectionDurations = {};
  for (const [key, sample] of Object.entries(input)) {
    const totalMs = roundDurationMs(Math.max(0, Number(sample?.totalMs) || 0));
    const count = Math.max(0, Math.trunc(Number(sample?.count) || 0));
    if (totalMs <= 0 && count <= 0) {
      continue;
    }
    normalized[key] = { totalMs, count };
  }
  return normalized;
}

function addTickPhaseCumulativeSummaries(summaries: TickMetricSummaryByKey, durations: TickPhaseDurations): void {
  for (const key of TICK_PHASE_KEYS) {
    const value = roundDurationMs(Math.max(0, Number(durations[key]) || 0));
    const current = summaries[key] ?? { totalMs: 0, count: 0, sampleCount: 0 };
    current.totalMs = roundDurationMs(current.totalMs + value);
    current.sampleCount += 1;
    if (value > 0) {
      current.count += 1;
    }
    summaries[key] = current;
  }
}

function addTickSectionCumulativeSummaries(summaries: TickMetricSummaryByKey, durations: TickSectionDurations): void {
  for (const [key, sample] of Object.entries(durations)) {
    const totalMs = roundDurationMs(Math.max(0, Number(sample?.totalMs) || 0));
    const count = Math.max(0, Math.trunc(Number(sample?.count) || 0));
    const current = summaries[key] ?? { totalMs: 0, count: 0, sampleCount: 0 };
    current.totalMs = roundDurationMs(current.totalMs + totalMs);
    current.count += count;
    current.sampleCount += 1;
    summaries[key] = current;
  }
}

function pushTickSectionDurationHistory(history: TickSectionDurationHistory, durations: TickSectionDurations): void {
  for (const [key, sample] of Object.entries(durations)) {
    const bucket = history[key] ?? [];
    bucket.push(sample);
    if (bucket.length > TICK_METRIC_WINDOW_SIZE) {
      bucket.splice(0, bucket.length - TICK_METRIC_WINDOW_SIZE);
    }
    history[key] = bucket;
  }
}

export const OFFLINE_GAIN_REPORT_MIN_DURATION_MS = 60_000;

/** 早于 2020 年的 startedAt 视为损坏或测试占位值，不能据此制造超长离线报告。 */
const MIN_TRUSTED_OFFLINE_GAIN_STARTED_AT_MS = Date.UTC(2020, 0, 1);

export interface OfflineGainDurationSession {
  startedAt?: unknown;
  accumulatedDurationMs?: unknown;
}

/**
 * 解析离线收益报告时长。
 *
 * 正常情况下使用实际推进的逻辑 tick 累计；只有逻辑累计尚未达到报告门槛、但可信墙钟
 * 离线时长已经达到门槛时才回退墙钟，避免调度积压让合法报告被错误过滤。该时长只决定
 * 报告展示与阻塞门槛，不参与收益计算。
 */
export function resolveOfflineGainReportDurationMs(
  session: OfflineGainDurationSession | null | undefined,
  endedAt: unknown,
  minimumDurationMs = OFFLINE_GAIN_REPORT_MIN_DURATION_MS,
): number {
  const thresholdMs = normalizeDurationMs(minimumDurationMs);
  const startedAt = normalizeDurationMs(session?.startedAt);
  const normalizedEndedAt = Math.max(startedAt, normalizeDurationMs(endedAt));
  const elapsedDurationMs = Math.max(0, normalizedEndedAt - startedAt);
  const hasAccumulatedDuration = hasFiniteDurationValue(session?.accumulatedDurationMs);
  const accumulatedDurationMs = hasAccumulatedDuration
    ? normalizeDurationMs(session?.accumulatedDurationMs)
    : 0;

  if (thresholdMs > 0 && accumulatedDurationMs >= thresholdMs) {
    return accumulatedDurationMs;
  }

  const hasTrustedWallClock = startedAt >= MIN_TRUSTED_OFFLINE_GAIN_STARTED_AT_MS;
  if (thresholdMs > 0 && elapsedDurationMs >= thresholdMs && hasTrustedWallClock) {
    return elapsedDurationMs;
  }

  if (accumulatedDurationMs > 0) {
    return accumulatedDurationMs;
  }
  if (thresholdMs > 0 && elapsedDurationMs >= thresholdMs && !hasTrustedWallClock) {
    return 0;
  }
  return elapsedDurationMs;
}

function normalizeDurationMs(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function hasFiniteDurationValue(value: unknown): boolean {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
    return false;
  }
  return Number.isFinite(Number(value));
}

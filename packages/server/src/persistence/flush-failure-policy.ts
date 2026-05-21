export type FlushFailureCategory =
  | 'db_connection_timeout'
  | 'db_deadlock_or_serialization'
  | 'unique_or_constraint_conflict'
  | 'lease_invalidated'
  | 'empty_overwrite_guard'
  | 'invalid_payload'
  | 'unsupported_domain'
  | 'unknown';

export interface ClassifiedFlushFailure {
  category: FlushFailureCategory;
  message: string;
  code?: string | null;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  globalBackoffMs: number;
  invariantViolation: boolean;
}

const MESSAGE_LIMIT = 360;

export function classifyFlushFailure(error: unknown): ClassifiedFlushFailure {
  const message = summarizeFlushFailureMessage(error);
  const code = extractErrorCode(error);
  const normalized = `${code ?? ''} ${message}`.toLowerCase();

  if (
    normalized.includes('timeout exceeded when trying to connect')
    || normalized.includes('connection timeout')
    || normalized.includes('connect etimedout')
    || normalized.includes('pool timeout')
    || code === 'ETIMEDOUT'
  ) {
    return buildFailure('db_connection_timeout', message, code, 15_000, 300_000, 10_000, false);
  }

  if (
    code === '40P01'
    || code === '40001'
    || normalized.includes('deadlock detected')
    || normalized.includes('could not serialize access')
  ) {
    return buildFailure('db_deadlock_or_serialization', message, code, 5_000, 120_000, 0, false);
  }

  if (
    code === '23505'
    || code === '23503'
    || code === '23514'
    || normalized.includes('unique constraint')
    || normalized.includes('duplicate key')
    || normalized.includes('item_instance_id conflict')
    || normalized.includes('conflict outside player scope')
  ) {
    return buildFailure('unique_or_constraint_conflict', message, code, 30_000, 900_000, 0, true);
  }

  if (
    normalized.includes('lease')
    || normalized.includes('ownership')
    || normalized.includes('租约已失效')
  ) {
    return buildFailure('lease_invalidated', message, code, 5_000, 120_000, 0, false);
  }

  if (
    normalized.includes('refused_empty_overwrite')
    || normalized.includes('empty overwrite')
    || normalized.includes('空覆盖')
  ) {
    return buildFailure('empty_overwrite_guard', message, code, 60_000, 900_000, 0, true);
  }

  if (
    normalized.includes('invalid')
    || normalized.includes('非法')
    || normalized.includes('拒绝写入')
    || normalized.includes('duplicate item_instance_id')
    || normalized.includes('duplicate slot')
  ) {
    return buildFailure('invalid_payload', message, code, 60_000, 900_000, 0, true);
  }

  if (normalized.includes('player_domain_delta_required')) {
    return buildFailure('unsupported_domain', message, code, 60_000, 600_000, 0, true);
  }

  return buildFailure('unknown', message, code, 10_000, 300_000, 0, false);
}

export function resolveFlushRetryDelayMs(failure: ClassifiedFlushFailure, attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.min(16, Math.trunc(Number(attempt) || 1)));
  const exponential = failure.retryBaseDelayMs * (2 ** (normalizedAttempt - 1));
  return Math.min(failure.retryMaxDelayMs, exponential);
}

function buildFailure(
  category: FlushFailureCategory,
  message: string,
  code: string | null | undefined,
  retryBaseDelayMs: number,
  retryMaxDelayMs: number,
  globalBackoffMs: number,
  invariantViolation: boolean,
): ClassifiedFlushFailure {
  return {
    category,
    message,
    code: code ?? null,
    retryBaseDelayMs,
    retryMaxDelayMs,
    globalBackoffMs,
    invariantViolation,
  };
}

function summarizeFlushFailureMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message || error.stack || String(error)
    : String(error);
  return raw.replace(/\s+/gu, ' ').trim().slice(0, MESSAGE_LIMIT) || 'unknown flush failure';
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) {
    return code.trim();
  }
  return null;
}

/**
 * 本文件属于持久化边界，负责 flush 运行时、兼容转换或失败策略等数据可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和数据库真源，避免在 tick 内直接引入阻塞 IO。
 */
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

/**
 * 启动期 durable payload 重放中判定"确定性不可恢复"的玩家数据错误。
 *
 * 这类错误重试永远无法成功（payload 与数据库投影/运行时 fence 不一致、payload 结构非法、
 * 空覆盖守卫拒绝等），若在启动重放中按普通失败重试，会导致 pending 永不消减、
 * durable_payload_replay_stalled 直接阻断整个服务端启动（单玩家数据坏 → 全服不可用）。
 *
 * 判定规则：
 * - 既有三类 fence 不完整错误（payload 缺 owner/epoch 且无法裁定）→ 确定性不可恢复；
 * - 失败分类为 invariantViolation 且属于数据类（空覆盖守卫 / 非法载荷 / 唯一约束冲突 /
 *   不支持的领域）→ 确定性不可恢复；
 * - 环境类错误（连接超时、死锁/序列化、租约失效、未知）→ 可重试，不算不可恢复。
 */
export function isNonRecoverableReplayPlayerPayloadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  if (message.startsWith('player_snapshot_projection_incomplete_fence:')
    || message.startsWith('player_snapshot_projection_presence_loader_unavailable:')
    || message.startsWith('player_presence_incomplete_fence:')) {
    return true;
  }
  const failure = classifyFlushFailure(error);
  return failure.invariantViolation === true && (
    failure.category === 'empty_overwrite_guard'
    || failure.category === 'invalid_payload'
    || failure.category === 'unique_or_constraint_conflict'
    || failure.category === 'unsupported_domain'
  );
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

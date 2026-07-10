/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/** PostgreSQL 错误判断工具。 */

const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available / lock_timeout
  '57014', // query_canceled / statement_timeout
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '57P05', // idle_session_timeout
  '58030', // io_error
]);

const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
]);

const TRANSIENT_POSTGRES_ERROR_MESSAGES = [
  'canceling statement due to lock timeout',
  'canceling statement due to statement timeout',
  'connection terminated unexpectedly',
  'connection timeout',
  'could not obtain lock',
  'could not serialize access',
  'deadlock detected',
  'query read timeout',
  'server closed the connection unexpectedly',
  'socket hang up',
  'terminating connection due to administrator command',
  'timeout exceeded when trying to connect',
];

/**
 * 判断一次 PostgreSQL 失败是否可在保持幂等与业务锁边界的前提下重试。
 * 仅包含锁竞争、事务并发、查询超时与连接中断；约束、身份和业务冲突不得降级为瞬态错误。
 */
export function isTransientPostgresError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 16) {
    const candidate = pending.shift();
    if (typeof candidate === 'string') {
      if (matchesTransientPostgresMessage(candidate)) return true;
      continue;
    }
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    const record = candidate as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code.trim().toUpperCase() : '';
    if (
      TRANSIENT_POSTGRES_ERROR_CODES.has(code)
      || TRANSIENT_NETWORK_ERROR_CODES.has(code)
      || /^08[A-Z0-9]{3}$/.test(code)
    ) {
      return true;
    }
    if (typeof record.message === 'string' && matchesTransientPostgresMessage(record.message)) {
      return true;
    }

    if (record.cause !== undefined) {
      pending.push(record.cause);
    }
    if (candidate instanceof AggregateError) {
      pending.push(...candidate.errors);
    }
  }

  return false;
}

export function isRelationMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('does not exist') || (error as any).code === '42P01';
}

function matchesTransientPostgresMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return TRANSIENT_POSTGRES_ERROR_MESSAGES.some((fragment) => normalized.includes(fragment));
}

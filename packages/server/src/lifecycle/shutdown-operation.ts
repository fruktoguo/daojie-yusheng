/**
 * 关停阶段向下游传递的协作式取消上下文。
 * deadlineAt 使用绝对时间，避免多层调用各自重新计算超时而突破总预算。
 */
export interface ShutdownOperationOptions {
  deadlineAt?: number;
  signal?: AbortSignal;
}

export class ShutdownOperationCancelledError extends Error {
  constructor(readonly operation: string, readonly deadlineAt: number | null) {
    super(`shutdown_operation_cancelled:${operation}`);
    this.name = 'ShutdownOperationCancelledError';
  }
}

/** 在派发下一批写入前调用；一旦截止或取消就立即中止。 */
export function assertShutdownOperationActive(
  options: ShutdownOperationOptions | null | undefined,
  operation: string,
): void {
  const deadlineAt = normalizeShutdownDeadlineAt(options?.deadlineAt);
  if (options?.signal?.aborted || (deadlineAt !== null && Date.now() >= deadlineAt)) {
    throw new ShutdownOperationCancelledError(operation, deadlineAt);
  }
}

export function isShutdownOperationCancelled(error: unknown): boolean {
  return error instanceof ShutdownOperationCancelledError
    || (error instanceof Error && error.name === 'AbortError');
}

/**
 * 等待一个已派发操作时响应 signal/deadline。
 * 调用方在超时后不得继续派发写入；底层数据库查询仍由连接池 query timeout 负责最终收敛。
 */
export async function waitForShutdownOperation<T>(
  operationPromise: Promise<T>,
  options: ShutdownOperationOptions | null | undefined,
  operation: string,
): Promise<T> {
  assertShutdownOperationActive(options, operation);
  const deadlineAt = normalizeShutdownDeadlineAt(options?.deadlineAt);
  const signal = options?.signal;
  if (!signal && deadlineAt === null) {
    return operationPromise;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  const cancellation = new Promise<never>((_resolve, reject) => {
    const rejectCancelled = () => reject(new ShutdownOperationCancelledError(operation, deadlineAt));
    if (signal) {
      abortListener = rejectCancelled;
      signal.addEventListener('abort', rejectCancelled, { once: true });
    }
    if (deadlineAt !== null) {
      timer = setTimeout(rejectCancelled, Math.max(1, deadlineAt - Date.now()));
      timer.unref?.();
    }
  });

  // 超时返回后底层 promise 可能稍晚才因 pg query timeout 收敛，显式挂接拒绝处理避免未处理拒绝。
  void operationPromise.catch(() => undefined);
  try {
    return await Promise.race([operationPromise, cancellation]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
  }
}

export function normalizeShutdownDeadlineAt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

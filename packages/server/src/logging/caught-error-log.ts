import { HttpException } from '@nestjs/common';

export type CaughtErrorLogLevel = 'debug' | 'warn' | 'error';

export interface CaughtErrorLogger {
  debug?(message: string): void;
  warn?(message: string): void;
  error?(message: string, stack?: string): void;
}

/**
 * 对已捕获异常统一分级：
 * - 4xx 是调用方输入、状态或玩法规则拒绝，只保留调试诊断；
 * - 5xx 表示已知的服务退化，保留告警；
 * - 其他异常没有稳定恢复语义，按程序错误记录。
 */
export function resolveCaughtErrorLogLevel(
  error: unknown,
  options: { expected?: boolean } = {},
): CaughtErrorLogLevel {
  if (options.expected === true) {
    return 'debug';
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return status >= 400 && status < 500 ? 'debug' : 'warn';
  }
  return 'error';
}

/** DEBUG 被关闭时直接静默，不能再提升为 LOG/WARN 制造噪音。 */
export function emitCaughtErrorLog(
  logger: CaughtErrorLogger | null | undefined,
  message: string,
  error: unknown,
  options: { expected?: boolean } = {},
): CaughtErrorLogLevel {
  const level = resolveCaughtErrorLogLevel(error, options);
  if (level === 'debug') {
    logger?.debug?.(message);
    return level;
  }
  if (level === 'warn') {
    logger?.warn?.(message);
    return level;
  }
  const stack = error instanceof Error ? error.stack : undefined;
  if (typeof logger?.error === 'function') {
    logger.error(message, stack);
  } else {
    // 兼容少量旧测试夹具；生产 Logger 始终提供 error。
    logger?.warn?.(message);
  }
  return level;
}

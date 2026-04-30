import { ConsoleLogger, type LogLevel } from '@nestjs/common';

import { captureServerLogLine } from './console-log-buffer';

/** 日期片段补零，统一日志时间格式。 */
function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}
/**
 * formatDateTime：规范化或转换Date时间。
 * @param date Date 参数说明。
 * @returns 返回Date时间。
 */


function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/** 统一服务端日志时间格式（yyyy-MM-dd HH:mm:ss）。 */
export class DateConsoleLogger extends ConsoleLogger {
  /** 使用服务内置时间格式替换默认时间戳。 */
  getTimestamp(): string {
    return formatDateTime(new Date());
  }

  /** 捕获 Nest 直接写 stdout/stderr 的日志，供 GM 日志页读取。 */
  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    messages.forEach((message) => {
      const pidMessage = this.formatPid(process.pid);
      const contextMessage = this.formatContext(context);
      const timestampDiff = this.updateAndGetTimestampDiff();
      const formattedLogLevel = logLevel.toUpperCase().padStart(7, ' ');
      const formattedMessage = this.formatMessage(
        logLevel,
        message,
        pidMessage,
        formattedLogLevel,
        contextMessage,
        timestampDiff,
      );
      captureServerLogLine(logLevel, formattedMessage);
      process[writeStreamType ?? 'stdout'].write(formattedMessage);
    });
  }

  /** 捕获 error 级别附带的堆栈输出。 */
  protected printStackTrace(stack: string): void {
    if (!stack) {
      return;
    }
    captureServerLogLine('error', stack);
    process.stderr.write(`${stack}\n`);
  }
}

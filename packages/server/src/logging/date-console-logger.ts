/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { ConsoleLogger, type LogLevel } from '@nestjs/common';

import { captureServerLogLine, isLogLevelEnabled } from './console-log-buffer';

/** 日期片段补零 */
function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}
/** 格式化日期为 yyyy-MM-dd HH:mm:ss */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 启动期静默的 NestJS 内部 context 列表。
 * 这些 context 在启动时会产生大量路由/模块注册日志，只计数不输出。
 */
const STARTUP_QUIET_CONTEXTS = new Set([
  'RoutesResolver',
  'RouterExplorer',
  'WebSocketsController',
  'InstanceLoader',
]);

/** 启动期静默计数器 */
interface StartupQuietCounters {
  routes: number;
  websockets: number;
  modules: number;
}

/** 统一服务端日志时间格式（yyyy-MM-dd HH:mm:ss）。 */
export class DateConsoleLogger extends ConsoleLogger {
  private startupQuietMode = true;
  private readonly startupCounters: StartupQuietCounters = {
    routes: 0,
    websockets: 0,
    modules: 0,
  };

  /** 使用服务内置时间格式替换默认时间戳。 */
  getTimestamp(): string {
    return formatDateTime(new Date());
  }

  /**
   * 结束启动静默模式并输出汇总。
   * 由 main.ts 在 app.listen 成功后调用。
   */
  flushStartupSummary(): void {
    if (!this.startupQuietMode) return;
    this.startupQuietMode = false;

    const parts: string[] = [];
    if (this.startupCounters.modules > 0) {
      parts.push(`${this.startupCounters.modules} 个模块`);
    }
    if (this.startupCounters.routes > 0) {
      parts.push(`${this.startupCounters.routes} 个 HTTP 路由`);
    }
    if (this.startupCounters.websockets > 0) {
      parts.push(`${this.startupCounters.websockets} 个 WebSocket 消息`);
    }

    if (parts.length > 0) {
      this.log(`已注册 ${parts.join('、')}`);
    }
  }

  /** 捕获 Nest 直接写 stdout/stderr 的日志，供 GM 日志页读取。 */
  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    if (!isLogLevelEnabled(logLevel)) return;

    // 启动期静默：对指定 context 只计数不输出
    if (this.startupQuietMode && logLevel === 'log' && STARTUP_QUIET_CONTEXTS.has(context)) {
      for (const message of messages) {
        const text = typeof message === 'string' ? message : '';
        if (context === 'RouterExplorer' && text.includes('Mapped')) {
          this.startupCounters.routes += 1;
        } else if (context === 'WebSocketsController' && text.includes('subscribed')) {
          this.startupCounters.websockets += 1;
        } else if (context === 'InstanceLoader') {
          this.startupCounters.modules += 1;
        }
        // RoutesResolver 不单独计数，它只是 controller 声明行
      }
      return;
    }

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
    if (!isLogLevelEnabled('error')) return;
    captureServerLogLine('error', stack);
    process.stderr.write(`${stack}\n`);
  }
}

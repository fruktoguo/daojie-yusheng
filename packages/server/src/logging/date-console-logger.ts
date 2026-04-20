import { ConsoleLogger } from '@nestjs/common';

/** 日期片段补零，统一日志时间格式。 */
function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}
/**
 * formatDateTime：执行核心业务逻辑。
 * @param date Date 参数说明。
 * @returns string。
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
}

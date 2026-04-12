import { ConsoleLogger } from '@nestjs/common';

/** padDatePart：执行对应的业务逻辑。 */
function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

/** formatDateTime：执行对应的业务逻辑。 */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/** DateConsoleLogger：封装相关状态与行为。 */
export class DateConsoleLogger extends ConsoleLogger {
  protected getTimestamp(): string {
    return formatDateTime(new Date());
  }
}


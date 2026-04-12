import { ConsoleLogger } from '@nestjs/common';

/** padDatePart：执行对应的业务逻辑。 */
function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

/** formatDateTime：执行对应的业务逻辑。 */
function formatDateTime(date: Date): string {
/** year：定义该变量以承载业务值。 */
  const year = date.getFullYear();
/** month：定义该变量以承载业务值。 */
  const month = padDatePart(date.getMonth() + 1);
/** day：定义该变量以承载业务值。 */
  const day = padDatePart(date.getDate());
/** hours：定义该变量以承载业务值。 */
  const hours = padDatePart(date.getHours());
/** minutes：定义该变量以承载业务值。 */
  const minutes = padDatePart(date.getMinutes());
/** seconds：定义该变量以承载业务值。 */
  const seconds = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/** DateConsoleLogger：封装相关状态与行为。 */
export class DateConsoleLogger extends ConsoleLogger {
/** getTimestamp：执行对应的业务逻辑。 */
  protected getTimestamp(): string {
    return formatDateTime(new Date());
  }
}


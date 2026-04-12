"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateConsoleLogger = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** padDatePart：执行对应的业务逻辑。 */
function padDatePart(value) {
    return String(value).padStart(2, '0');
}
/** formatDateTime：执行对应的业务逻辑。 */
function formatDateTime(date) {
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
/** DateConsoleLogger：定义该类及其职责。 */
class DateConsoleLogger extends common_1.ConsoleLogger {
/** getTimestamp：执行对应的业务逻辑。 */
    getTimestamp() {
        return formatDateTime(new Date());
    }
}
exports.DateConsoleLogger = DateConsoleLogger;
//# sourceMappingURL=date-console-logger.js.map

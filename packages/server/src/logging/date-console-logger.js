"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateConsoleLogger = void 0;

const common_1 = require("@nestjs/common");

/** 日期片段补零，统一日志时间格式。 */
function padDatePart(value) {
    return String(value).padStart(2, '0');
}
function formatDateTime(date) {

    const year = date.getFullYear();

    const month = padDatePart(date.getMonth() + 1);

    const day = padDatePart(date.getDate());

    const hours = padDatePart(date.getHours());

    const minutes = padDatePart(date.getMinutes());

    const seconds = padDatePart(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/** 统一服务端日志时间格式（yyyy-MM-dd HH:mm:ss）。 */
class DateConsoleLogger extends common_1.ConsoleLogger {
    /** 使用服务内置时间格式替换默认时间戳。 */
    getTimestamp() {
        return formatDateTime(new Date());
    }
}
exports.DateConsoleLogger = DateConsoleLogger;
//# sourceMappingURL=date-console-logger.js.map



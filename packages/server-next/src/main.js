"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** core_1：定义该变量以承载业务值。 */
const core_1 = require("@nestjs/core");
/** app_module_1：定义该变量以承载业务值。 */
const app_module_1 = require("./app.module");
/** date_console_logger_1：定义该变量以承载业务值。 */
const date_console_logger_1 = require("./logging/date-console-logger");
/** bootstrap：执行对应的业务逻辑。 */
async function bootstrap() {
/** logger：定义该变量以承载业务值。 */
    const logger = new date_console_logger_1.DateConsoleLogger('Bootstrap');
/** app：定义该变量以承载业务值。 */
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger });
    app.enableShutdownHooks();
    app.enableCors();
/** port：定义该变量以承载业务值。 */
    const port = Number(process.env.SERVER_NEXT_PORT ?? 13001);
/** host：定义该变量以承载业务值。 */
    const host = process.env.SERVER_NEXT_HOST ?? '0.0.0.0';
    await app.listen(port, host);
    logger.log(`Server Next running on http://${host}:${port}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map

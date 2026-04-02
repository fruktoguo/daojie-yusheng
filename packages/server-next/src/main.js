"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableShutdownHooks();
    app.enableCors();
    const port = Number(process.env.SERVER_NEXT_PORT ?? 13001);
    const host = process.env.SERVER_NEXT_HOST ?? '0.0.0.0';
    await app.listen(port, host);
    console.log(`Server Next running on http://${host}:${port}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map

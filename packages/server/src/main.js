"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** core_1：定义该变量以承载业务值。 */
const core_1 = require("@nestjs/core");
/** node_child_process_1：定义该变量以承载业务值。 */
const node_child_process_1 = require("node:child_process");
/** node_fs_1：定义该变量以承载业务值。 */
const node_fs_1 = require("node:fs");
/** app_module_1：定义该变量以承载业务值。 */
const app_module_1 = require("./app.module");
/** date_console_logger_1：定义该变量以承载业务值。 */
const date_console_logger_1 = require("./logging/date-console-logger");
/** PORT_CONFLICT_SAMPLE_ATTEMPTS：定义该变量以承载业务值。 */
const PORT_CONFLICT_SAMPLE_ATTEMPTS = 12;
/** PORT_CONFLICT_SAMPLE_INTERVAL_MS：定义该变量以承载业务值。 */
const PORT_CONFLICT_SAMPLE_INTERVAL_MS = 100;
/** readCommandOutput：执行对应的业务逻辑。 */
function readCommandOutput(command, args) {
    try {
/** result：定义该变量以承载业务值。 */
        const result = (0, node_child_process_1.spawnSync)(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
/** stdout：定义该变量以承载业务值。 */
        const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
/** stderr：定义该变量以承载业务值。 */
        const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
        if (stdout) {
            return stdout;
        }
        if (stderr) {
            return `[stderr] ${stderr}`;
        }
        if (typeof result.status === 'number') {
            return `[exit ${result.status}] no output`;
        }
        return '[no output]';
    }
    catch (error) {
        return `[failed] ${error instanceof Error ? error.message : String(error)}`;
    }
}
/** sleep：执行对应的业务逻辑。 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** isLikelyWsl：执行对应的业务逻辑。 */
function isLikelyWsl() {
    if (process.platform !== 'linux') {
        return false;
    }
    if (process.env.WSL_INTEROP || process.env.WSL_DISTRO_NAME) {
        return true;
    }
    try {
/** version：定义该变量以承载业务值。 */
        const version = (0, node_fs_1.readFileSync)('/proc/version', 'utf8');
        return /microsoft/i.test(version);
    }
    catch (_error) {
        return false;
    }
}
/** readWindowsExcludedPortRanges：执行对应的业务逻辑。 */
function readWindowsExcludedPortRanges() {
    if (!isLikelyWsl()) {
        return [];
    }
/** output：定义该变量以承载业务值。 */
    const output = readCommandOutput('cmd.exe', ['/c', 'netsh interface ipv4 show excludedportrange protocol=tcp']);
    if (!output || output.startsWith('[failed]')) {
        return [];
    }
/** ranges：定义该变量以承载业务值。 */
    const ranges = [];
    for (const line of output.split(/\r?\n/)) {
/** match：定义该变量以承载业务值。 */
        const match = line.match(/^\s*(\d+)\s+(\d+)\s*(\*)?\s*$/);
        if (!match) {
            continue;
        }
        ranges.push({
            start: Number(match[1]),
            end: Number(match[2]),
            managed: Boolean(match[3]),
        });
    }
    return ranges;
}
/** resolveExcludedPortHint：执行对应的业务逻辑。 */
function resolveExcludedPortHint(port) {
/** range：定义该变量以承载业务值。 */
    const range = readWindowsExcludedPortRanges().find((entry) => port >= entry.start && port <= entry.end);
    if (!range) {
        return '';
    }
    return `Detected Windows excluded TCP port range ${range.start}-${range.end}${range.managed ? ' (managed)' : ''} covering ${port}. If you are running inside WSL, choose another port such as SERVER_NEXT_PORT=13020.`;
}
/** capturePortConflictSample：执行对应的业务逻辑。 */
function capturePortConflictSample(port) {
/** lsofOutput：定义该变量以承载业务值。 */
    const lsofOutput = readCommandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
/** ssOutput：定义该变量以承载业务值。 */
    const ssOutput = readCommandOutput('ss', ['-ltnp', `( sport = :${port} )`]);
/** fuserOutput：定义该变量以承载业务值。 */
    const fuserOutput = readCommandOutput('fuser', ['-v', '-n', 'tcp', String(port)]);
    return {
        lsofOutput,
        ssOutput,
        fuserOutput,
        text: [
            `lsof -nP -iTCP:${port} -sTCP:LISTEN`,
            lsofOutput,
            `ss -ltnp '( sport = :${port} )'`,
            ssOutput,
            `fuser -v -n tcp ${port}`,
            fuserOutput,
        ].join('\n'),
    };
}
/** hasUsefulPortConflictEvidence：执行对应的业务逻辑。 */
function hasUsefulPortConflictEvidence(sample) {
    return (sample.lsofOutput && sample.lsofOutput !== '[exit 1] no output')
        || (sample.fuserOutput && sample.fuserOutput !== '[exit 1] no output')
        || (sample.ssOutput
            && sample.ssOutput !== 'State Recv-Q Send-Q Local Address:Port Peer Address:PortProcess'
            && sample.ssOutput !== '[exit 1] no output');
}
/** collectPortConflictDiagnostics：执行对应的业务逻辑。 */
async function collectPortConflictDiagnostics(port) {
/** samples：定义该变量以承载业务值。 */
    const samples = [];
    for (let index = 0; index < PORT_CONFLICT_SAMPLE_ATTEMPTS; index += 1) {
/** sample：定义该变量以承载业务值。 */
        const sample = capturePortConflictSample(port);
        samples.push(`[sample ${index + 1}/${PORT_CONFLICT_SAMPLE_ATTEMPTS}]\n${sample.text}`);
        if (hasUsefulPortConflictEvidence(sample)) {
            return samples.join('\n\n');
        }
        if (index + 1 < PORT_CONFLICT_SAMPLE_ATTEMPTS) {
            await sleep(PORT_CONFLICT_SAMPLE_INTERVAL_MS);
        }
    }
    return samples.join('\n\n');
}
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
    try {
        await app.listen(port, host);
    }
    catch (error) {
        if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
/** diagnostics：定义该变量以承载业务值。 */
            const diagnostics = await collectPortConflictDiagnostics(port);
/** excludedPortHint：定义该变量以承载业务值。 */
            const excludedPortHint = resolveExcludedPortHint(port);
            logger.error(`server-next 绑定 ${host}:${port} 时发生端口冲突${excludedPortHint ? `\n${excludedPortHint}` : ''}\n${diagnostics}`);
        }
        await app.close().catch(() => undefined);
        throw error;
    }
    logger.log(`服务端已运行于 http://${host}:${port}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map

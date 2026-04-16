"use strict";
/**
 * 用途：编排执行 server-next smoke 冒烟验证套件。
 */

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
/**
 * 记录ownkeys。
 */
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
/**
 * 记录ar。
 */
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
/**
 * 累计当前结果。
 */
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
/**
 * 记录net。
 */
const net = __importStar(require("node:net"));
/**
 * 记录path路径。
 */
const path = __importStar(require("node:path"));
const env_alias_1 = require("../config/env-alias");
/**
 * 记录包根目录。
 */
const packageRoot = path.resolve(__dirname, '..', '..');
/**
 * 记录构建产物目录。
 */
const distRoot = path.join(packageRoot, 'dist');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = path.join(distRoot, 'main.js');
/**
 * 保存命令行参数。
 */
const cliArgs = process.argv.slice(2);
/**
 * 记录include持久化。
 */
const includePersistence = cliArgs.includes('--include-persistence');
/**
 * 记录requirelegacy认证。
 */
/**
 * 记录用户指定的用例名称。
 */
const selectedCaseNames = readOptionValues(cliArgs, '--case');
/**
 * 汇总可执行的 smoke 用例。
 */
const smokeCases = [
    { name: 'readiness-gate', scriptFile: 'readiness-gate-smoke.js', standalone: true },
    { name: 'session', scriptFile: 'session-smoke.js' },
    { name: 'runtime', scriptFile: 'runtime-smoke.js' },
    { name: 'progression', scriptFile: 'progression-smoke.js' },
    { name: 'combat', scriptFile: 'combat-smoke.js' },
    { name: 'loot', scriptFile: 'loot-smoke.js' },
    { name: 'next-auth-bootstrap', scriptFile: 'next-auth-bootstrap-smoke.js' },
    { name: 'next-auth-bootstrap-mainline', scriptFile: 'next-auth-bootstrap-smoke.js' },
    { name: 'next-auth-bootstrap-migration', scriptFile: 'next-auth-bootstrap-smoke.js' },
    { name: 'gm-next', scriptFile: 'gm-next-smoke.js' },
    { name: 'redeem-code', scriptFile: 'redeem-code-smoke.js' },
    { name: 'monster-runtime', scriptFile: 'monster-runtime-smoke.js' },
    { name: 'monster-combat', scriptFile: 'monster-combat-smoke.js' },
    { name: 'monster-ai', scriptFile: 'monster-ai-smoke.js' },
    { name: 'monster-skill', scriptFile: 'monster-skill-smoke.js' },
    { name: 'monster-reset', scriptFile: 'monster-reset-smoke.js' },
    { name: 'monster-loot', scriptFile: 'monster-loot-smoke.js' },
    { name: 'player-recovery', scriptFile: 'player-recovery-smoke.js' },
    { name: 'player-respawn', scriptFile: 'player-respawn-smoke.js' },
    { name: 'persistence', scriptFile: 'persistence-smoke.js', standalone: true },
    { name: 'gm-database', scriptFile: 'gm-database-smoke.js', standalone: true },
];
const LONG_RUNNING_SMOKE_TIMEOUT_MS = '20000';
const LONG_RUNNING_SMOKE_CASES = new Set([
    'session',
    'next-auth-bootstrap',
    'next-auth-bootstrap-mainline',
    'next-auth-bootstrap-migration',
    'monster-runtime',
    'monster-combat',
    'monster-ai',
    'monster-skill',
    'monster-reset',
    'monster-loot',
]);
function resolveSmokeGateLabel() {
    return hasDatabaseUrl() ? 'with-db' : 'local';
}
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
/**
 * 记录cases。
 */
    const cases = resolveSelectedCases();
    const gate = resolveSmokeGateLabel();
/**
 * 汇总执行结果。
 */
    const results = [];
    process.stdout.write(`[server-next smoke] gate=${gate}\n`);
    process.stdout.write(`[server-next smoke] cases=${cases.map((entry) => entry.name).join(', ')}\n`);
    for (const entry of cases) {
        if ((entry.name === 'persistence' || entry.name === 'gm-database') && !hasDatabaseUrl()) {
            results.push({
                name: entry.name,
                durationMs: 0,
                skipped: true,
            });
            continue;
        }
/**
 * 记录casestartedat。
 */
        const caseStartedAt = Date.now();
        process.stdout.write(`\n[server-next smoke] running ${entry.name}\n`);
        if (entry.standalone) {
            await runStandaloneSmoke(entry);
        }
        else {
            await runIsolatedSmoke(entry);
        }
        results.push({
            name: entry.name,
            durationMs: Date.now() - caseStartedAt,
        });
    }
    process.stdout.write(`\n[server-next smoke] summary\n`);
    for (const result of results) {
        process.stdout.write(`- ${result.name}: ${result.skipped ? 'skipped' : `${result.durationMs}ms`}\n`);
    }
    process.stdout.write(`[server-next smoke] boundary=${gate === 'with-db' ? 'includes local + database smoke cases selected in this run' : 'local/no-db smoke only; this does not prove persistence, shadow, or destructive flows'}\n`);
    process.stdout.write(`[server-next smoke] total ${Date.now() - startedAt}ms\n`);
}
/**
 * 运行isolatedsmoke 校验。
 */
async function runIsolatedSmoke(entry) {
/**
 * 记录端口。
 */
    const port = await allocateFreePort();
/**
 * 记录base地址。
 */
    const baseUrl = `http://127.0.0.1:${port}`;
/**
 * 记录extra环境变量。
 */
    const extraEnv = resolveCaseExtraEnv(entry);
/**
 * 记录服务端。
 */
    const server = await startServer(port, extraEnv);
    try {
        const requireReady = hasDatabaseUrl() && entry.name !== 'readiness-gate';
        await waitForHealth(baseUrl, 12_000, {
            requireReady,
        });
        await runNodeScript(path.join(distRoot, 'tools', entry.scriptFile), {
            SERVER_NEXT_URL: baseUrl,
            ...extraEnv,
        });
    }
    finally {
        await stopServer(server);
        cleanupCaseExtraEnv(extraEnv);
    }
}
/**
 * 运行standalonesmoke 校验。
 */
async function runStandaloneSmoke(entry) {
/**
 * 记录端口。
 */
    const port = await allocateFreePort();
/**
 * 记录extra环境变量。
 */
    const extraEnv = resolveCaseExtraEnv(entry);
    try {
        await runNodeScript(path.join(distRoot, 'tools', entry.scriptFile), {
            SERVER_NEXT_SMOKE_PORT: String(port),
            ...extraEnv,
        });
    }
    finally {
        cleanupCaseExtraEnv(extraEnv);
    }
}
/**
 * 启动服务端。
 */
async function startServer(port, extraEnv = {}) {
/**
 * 记录allowunreadytraffic。
 */
    const allowUnreadyTraffic = !hasDatabaseUrl();
/**
 * 记录子进程。
 */
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: packageRoot,
        env: {
            ...process.env,
            ...extraEnv,
            SERVER_NEXT_PORT: String(port),
            SERVER_NEXT_RUNTIME_HTTP: '1',
            ...(allowUnreadyTraffic
                ? {
                    SERVER_NEXT_ALLOW_UNREADY_TRAFFIC: '1',
                    SERVER_NEXT_SMOKE_ALLOW_UNREADY: '1',
                }
                : {}),
        },
        stdio: 'inherit',
    });
    child.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
            process.stderr.write(`[server-next smoke] server exited unexpectedly: code=${code} signal=${signal ?? 'none'}\n`);
        }
    });
    return child;
}
/**
 * 停止服务端。
 */
async function stopServer(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await Promise.race([
        waitForExit(child),
        new Promise((resolve) => {
            setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                    child.kill('SIGKILL');
                }
                resolve();
            }, 4_000);
        }),
    ]);
}
/**
 * 等待forexit。
 */
async function waitForExit(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    await new Promise((resolve) => {
        child.once('exit', () => resolve());
    });
}
/**
 * 运行节点script。
 */
async function runNodeScript(scriptPath, extraEnv) {
    await new Promise((resolve, reject) => {
/**
 * 记录子进程。
 */
        const child = (0, node_child_process_1.spawn)('node', [scriptPath], {
            cwd: packageRoot,
            env: {
                ...process.env,
                ...extraEnv,
            },
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`script ${path.basename(scriptPath)} failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
        });
    });
}
/**
 * 解析已选值cases。
 */
function resolveSelectedCases() {
/**
 * 记录cases。
 */
    const cases = smokeCases.filter((entry) => {
        if (entry.name === 'persistence' || entry.name === 'gm-database') {
            return includePersistence;
        }
        return true;
    });
    if (selectedCaseNames.length === 0) {
        return cases;
    }
/**
 * 记录已选值。
 */
    const selected = new Set(selectedCaseNames);
/**
 * 记录resolved。
 */
    const resolved = cases.filter((entry) => selected.has(entry.name));
    if (resolved.length !== selected.size) {
/**
 * 记录known。
 */
        const known = new Set(cases.map((entry) => entry.name));
/**
 * 记录unknown。
 */
        const unknown = [...selected].filter((name) => !known.has(name));
        throw new Error(`unknown smoke case: ${unknown.join(', ')}`);
    }
    return resolved;
}
/**
 * 解析caseextra环境变量。
 */
function resolveCaseExtraEnv(entry) {
/**
 * 记录extra环境变量。
 */
    const extraEnv = {};
/**
 * 记录数据库地址。
 */
    const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
    if (databaseUrl) {
        extraEnv.SERVER_NEXT_DATABASE_URL = databaseUrl;
    }
    if (entry.name === 'gm-next'
        || entry.name === 'redeem-code'
        || entry.name === 'persistence'
        || entry.name === 'gm-database'
        || entry.name === 'next-auth-bootstrap'
        || entry.name === 'next-auth-bootstrap-mainline'
        || entry.name === 'next-auth-bootstrap-migration') {
        extraEnv.SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT = '1';
    }
    if (entry.name === 'session') {
        extraEnv.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS = '4000';
    }
    if (entry.name === 'next-auth-bootstrap'
        || entry.name === 'next-auth-bootstrap-mainline'
        || entry.name === 'next-auth-bootstrap-migration') {
        extraEnv.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS = '4000';
        extraEnv.SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = '0';
        extraEnv.NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL = '0';
        if (entry.name === 'next-auth-bootstrap-mainline') {
            extraEnv.NEXT_AUTH_BOOTSTRAP_PROFILE = 'mainline';
        }
        else if (entry.name === 'next-auth-bootstrap-migration') {
            extraEnv.NEXT_AUTH_BOOTSTRAP_PROFILE = 'migration';
        }
/**
 * 记录tracesuffix。
 */
        const traceSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        extraEnv.NEXT_AUTH_TRACE_ENABLED = '1';
        extraEnv.SERVER_NEXT_AUTH_TRACE_ENABLED = '1';
        extraEnv.NEXT_AUTH_TRACE_FILE = path.join(packageRoot, '.runtime', `next-auth-trace-${traceSuffix}.jsonl`);
    }
    if (LONG_RUNNING_SMOKE_CASES.has(entry.name)) {
        extraEnv.SERVER_NEXT_SMOKE_TIMEOUT_MS = LONG_RUNNING_SMOKE_TIMEOUT_MS;
    }
    return extraEnv;
}
/**
 * 清理caseextra环境变量。
 */
function cleanupCaseExtraEnv(extraEnv) {
/**
 * 记录trace文件。
 */
    const traceFile = typeof extraEnv.NEXT_AUTH_TRACE_FILE === 'string' ? extraEnv.NEXT_AUTH_TRACE_FILE.trim() : '';
    if (!traceFile) {
        return;
    }
    try {
        path.isAbsolute(traceFile) && require('node:fs').rmSync(traceFile, { force: true });
    }
    catch {
        // ignore trace cleanup failures
    }
}
/**
 * 等待for健康状态。
 */
async function waitForHealth(baseUrl, timeoutMs, options = {}) {
/**
 * 记录require就绪状态。
 */
    const requireReady = options.requireReady === true;
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        try {
/**
 * 记录response。
 */
            const response = await fetch(`${baseUrl}/health`);
            if (response.ok) {
                return;
            }
            if (!requireReady && response.status === 503) {
                return;
            }
        }
        catch {
            // ignore startup race
        }
        await delay(100);
    }
    throw new Error(`server health timeout: ${baseUrl}`);
}
/**
 * 判断是否已数据库URL。
 */
function hasDatabaseUrl() {
    return Boolean((0, env_alias_1.resolveServerNextDatabaseUrl)());
}
/**
 * 读取optionvalues。
 */
function readOptionValues(args, name) {
/**
 * 记录values。
 */
    const values = [];
    for (let index = 0; index < args.length; index += 1) {
/**
 * 记录当前值。
 */
        const current = args[index];
        if (current === name) {
/**
 * 记录next。
 */
            const next = args[index + 1];
            if (typeof next === 'string' && next.length > 0) {
                values.push(next);
                index += 1;
            }
            continue;
        }
        if (current.startsWith(`${name}=`)) {
/**
 * 记录价值。
 */
            const value = current.slice(name.length + 1).trim();
            if (value) {
                values.push(value);
            }
        }
    }
    return values;
}
/**
 * 分配free端口。
 */
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
/**
 * 记录服务端。
 */
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
/**
 * 记录address。
 */
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('failed to allocate free port')));
                return;
            }
            const { port } = address;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=smoke-suite.js.map

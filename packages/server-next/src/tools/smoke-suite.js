"use strict";
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
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const net = __importStar(require("node:net"));
const path = __importStar(require("node:path"));
const packageRoot = path.resolve(__dirname, '..', '..');
const distRoot = path.join(packageRoot, 'dist');
const serverEntry = path.join(distRoot, 'main.js');
const cliArgs = process.argv.slice(2);
const includePersistence = cliArgs.includes('--include-persistence');
const requireLegacyAuth = cliArgs.includes('--require-legacy-auth');
const selectedCaseNames = readOptionValues(cliArgs, '--case');
const smokeCases = [
    { name: 'session', scriptFile: 'session-smoke.js' },
    { name: 'runtime', scriptFile: 'runtime-smoke.js' },
    { name: 'progression', scriptFile: 'progression-smoke.js' },
    { name: 'combat', scriptFile: 'combat-smoke.js' },
    { name: 'loot', scriptFile: 'loot-smoke.js' },
    { name: 'legacy-auth', scriptFile: 'legacy-auth-smoke.js' },
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
async function main() {
    const startedAt = Date.now();
    const cases = resolveSelectedCases();
    const results = [];
    for (const entry of cases) {
        if ((entry.name === 'persistence' || entry.name === 'gm-database') && !hasDatabaseUrl()) {
            results.push({
                name: entry.name,
                durationMs: 0,
                skipped: true,
            });
            continue;
        }
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
    process.stdout.write(`[server-next smoke] total ${Date.now() - startedAt}ms\n`);
}
async function runIsolatedSmoke(entry) {
    const port = await allocateFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = await startServer(port);
    try {
        await waitForHealth(baseUrl, 12_000, {
            requireReady: hasDatabaseUrl(),
        });
        await runNodeScript(path.join(distRoot, 'tools', entry.scriptFile), {
            SERVER_NEXT_URL: baseUrl,
            ...resolveCaseExtraEnv(entry),
        });
    }
    finally {
        await stopServer(server);
    }
}
async function runStandaloneSmoke(entry) {
    const port = await allocateFreePort();
    await runNodeScript(path.join(distRoot, 'tools', entry.scriptFile), {
        SERVER_NEXT_SMOKE_PORT: String(port),
        ...resolveCaseExtraEnv(entry),
    });
}
async function startServer(port) {
    const allowUnreadyTraffic = !hasDatabaseUrl();
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: packageRoot,
        env: {
            ...process.env,
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
async function waitForExit(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    await new Promise((resolve) => {
        child.once('exit', () => resolve());
    });
}
async function runNodeScript(scriptPath, extraEnv) {
    await new Promise((resolve, reject) => {
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
function resolveSelectedCases() {
    const cases = smokeCases.filter((entry) => {
        if (entry.name === 'persistence' || entry.name === 'gm-database') {
            return includePersistence;
        }
        return true;
    });
    if (selectedCaseNames.length === 0) {
        return cases;
    }
    const selected = new Set(selectedCaseNames);
    const resolved = cases.filter((entry) => selected.has(entry.name));
    if (resolved.length !== selected.size) {
        const known = new Set(cases.map((entry) => entry.name));
        const unknown = [...selected].filter((name) => !known.has(name));
        throw new Error(`unknown smoke case: ${unknown.join(', ')}`);
    }
    return resolved;
}
function resolveCaseExtraEnv(entry) {
    if (entry.name === 'legacy-auth' && requireLegacyAuth) {
        return {
            SERVER_NEXT_LEGACY_AUTH_REQUIRED: '1',
        };
    }
    return {};
}
async function waitForHealth(baseUrl, timeoutMs, options = {}) {
    const requireReady = options.requireReady === true;
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        try {
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
function hasDatabaseUrl() {
    const databaseUrl = process.env.SERVER_NEXT_DATABASE_URL ?? '';
    return databaseUrl.trim().length > 0;
}
function readOptionValues(args, name) {
    const values = [];
    for (let index = 0; index < args.length; index += 1) {
        const current = args[index];
        if (current === name) {
            const next = args[index + 1];
            if (typeof next === 'string' && next.length > 0) {
                values.push(next);
                index += 1;
            }
            continue;
        }
        if (current.startsWith(`${name}=`)) {
            const value = current.slice(name.length + 1).trim();
            if (value) {
                values.push(value);
            }
        }
    }
    return values;
}
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
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

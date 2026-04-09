"use strict";
/**
 * 用途：执行 readiness-gate 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
/**
 * 记录包根目录。
 */
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
/**
 * 记录当前值端口。
 */
let currentPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3312);
/**
 * 记录base地址。
 */
let baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录服务端。
 */
    let server = await startServer({ allowUnreadyTraffic: false });
/**
 * 记录bypass玩家ID。
 */
    let bypassPlayerId = '';
    try {
/**
 * 记录健康状态。
 */
        const health = await waitForHealth(503);
/**
 * 记录rejection。
 */
        const rejection = await expectNextSocketRejected();
        if (health?.readiness?.maintenance?.active === true) {
            throw new Error(`expected maintenance inactive for not-ready gate, got ${JSON.stringify(health.readiness.maintenance)}`);
        }
        if (health?.readiness?.database?.configured !== false) {
            throw new Error(`expected database.configured=false, got ${JSON.stringify(health?.readiness?.database ?? null)}`);
        }
        if (rejection.code !== 'SERVER_NOT_READY') {
            throw new Error(`expected SERVER_NOT_READY, got ${JSON.stringify(rejection)}`);
        }
    }
    finally {
        await stopServer(server);
    }
    server = await startServer({ allowUnreadyTraffic: true });
    try {
/**
 * 记录健康状态。
 */
        const health = await waitForHealth(503);
/**
 * 记录bypass。
 */
        const bypass = await expectNextSocketBootstrapped();
        bypassPlayerId = bypass.playerId;
        if (health?.readiness?.ok !== false) {
            throw new Error(`expected readiness.ok=false under bypass, got ${JSON.stringify(health?.readiness ?? null)}`);
        }
        console.log(JSON.stringify({
            ok: true,
            playerId: bypass.playerId,
            gate: {
                healthStatus: 503,
                rejectionCode: 'SERVER_NOT_READY',
            },
            bypass: {
                healthStatus: 503,
                sessionId: bypass.sessionId,
                events: bypass.events,
            },
        }, null, 2));
    }
    finally {
        if (bypassPlayerId) {
            await deletePlayer(bypassPlayerId).catch(() => undefined);
        }
        await stopServer(server);
    }
}
/**
 * 启动服务端。
 */
async function startServer(options) {
    currentPort = await allocateFreePort();
    baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 记录子进程。
 */
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: packageRoot,
        env: {
            ...process.env,
            SERVER_NEXT_PORT: String(currentPort),
            SERVER_NEXT_RUNTIME_HTTP: '1',
            SERVER_NEXT_DATABASE_URL: '',
            DATABASE_URL: '',
            ...(options.allowUnreadyTraffic
                ? {
                    SERVER_NEXT_ALLOW_UNREADY_TRAFFIC: '1',
                    SERVER_NEXT_SMOKE_ALLOW_UNREADY: '1',
                }
                : {
                    SERVER_NEXT_ALLOW_UNREADY_TRAFFIC: '0',
                    SERVER_NEXT_SMOKE_ALLOW_UNREADY: '0',
                }),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => process.stdout.write(String(chunk)));
    child.stderr?.on('data', (chunk) => process.stderr.write(String(chunk)));
    return child;
}
/**
 * 停止服务端。
 */
async function stopServer(child) {
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await new Promise((resolve) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
        }, 4000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}
/**
 * 等待for健康状态。
 */
async function waitForHealth(expectedStatus) {
/**
 * 记录last请求体。
 */
    let lastBody = null;
    await waitForCondition(async () => {
        try {
/**
 * 记录response。
 */
            const response = await fetch(`${baseUrl}/health`);
            lastBody = await response.json();
            return response.status === expectedStatus;
        }
        catch {
            return false;
        }
    }, 10000);
    return lastBody;
}
/**
 * 处理expectnextsocketrejected。
 */
async function expectNextSocketRejected() {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            protocol: 'next',
        },
    });
/**
 * 记录errorpayload。
 */
    let errorPayload = null;
/**
 * 记录disconnected。
 */
    let disconnected = false;
    try {
        socket.on(shared_1.NEXT_S2C.Error, (payload) => {
            errorPayload = payload;
        });
        socket.on('disconnect', () => {
            disconnected = true;
        });
        await onceConnected(socket);
        await waitForCondition(() => errorPayload !== null && disconnected, 5000);
        return {
            code: String(errorPayload?.code ?? ''),
            message: String(errorPayload?.message ?? ''),
        };
    }
    finally {
        socket.close();
    }
}
/**
 * 处理expectnextsocketbootstrapped。
 */
async function expectNextSocketBootstrapped() {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            protocol: 'next',
        },
    });
/**
 * 记录events。
 */
    const events = [];
/**
 * 记录玩家ID。
 */
    let playerId = '';
/**
 * 记录会话ID。
 */
    let sessionId = '';
    try {
        socket.on(shared_1.NEXT_S2C.Error, (payload) => {
            throw new Error(`unexpected next error under readiness bypass: ${JSON.stringify(payload)}`);
        });
        socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
            playerId = String(payload?.pid ?? '');
            sessionId = String(payload?.sid ?? '');
            events.push('initSession');
        });
        socket.on(shared_1.NEXT_S2C.MapEnter, () => {
            events.push('mapEnter');
        });
        socket.on(shared_1.NEXT_S2C.Bootstrap, () => {
            events.push('bootstrap');
        });
        await onceConnected(socket);
        socket.emit(shared_1.NEXT_C2S.Hello, {
            mapId: 'yunlai_town',
            preferredX: 32,
            preferredY: 5,
        });
        await waitForCondition(() => playerId.length > 0 && sessionId.length > 0 && events.includes('mapEnter') && events.includes('bootstrap'), 5000);
        return {
            playerId,
            sessionId,
            events,
        };
    }
    finally {
        socket.close();
    }
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 处理onceconnected。
 */
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
/**
 * 分配free端口。
 */
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
/**
 * 记录服务端。
 */
        const server = (0, node_net_1.createServer)();
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

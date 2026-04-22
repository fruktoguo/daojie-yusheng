// @ts-nocheck

/**
 * 用途：基准测试 first-package 链路性能。
 */

const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { join, resolve } = require("node:path");
const io = require("socket.io-client");
const shared = require("@mud/shared");

/**
 * 记录包根目录。
 */
const packageRoot = resolve(__dirname, "..", "..");
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = join(packageRoot, "dist", "main.js");
/**
 * 记录当前值端口。
 */
let currentPort = Number(process.env.SERVER_BENCH_PORT ?? 3219);
/**
 * 记录base地址。
 */
let baseUrl = `http://127.0.0.1:${currentPort}`;

/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录服务端。
 */
  const server = await startServer();
  try {
    await waitForHealth({ expectedStatus: 200, expectMaintenance: false });
/**
 * 记录metrics。
 */
    const metrics = await measureHandshake();
    console.log(JSON.stringify({ ok: true, ...metrics }, null, 2));
  } finally {
    await stopServer(server);
  }
}

/**
 * 启动服务端。
 */
async function startServer() {
  currentPort = await allocateFreePort();
  baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 记录子进程。
 */
  const child = spawn("node", [serverEntry], {
    cwd: packageRoot,
    env: {
      ...process.env,
      SERVER_PORT: String(currentPort),
      SERVER_RUNTIME_HTTP: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(String(chunk)));
  child.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));
  return child;
}

/**
 * 停止服务端。
 */
async function stopServer(child) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!child) {
    return;
  }
  if (child.killed || child.exitCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await new Promise((resolve) => {
/**
 * 记录timer。
 */
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * 等待for健康状态。
 */
async function waitForHealth(options) {
  await waitForCondition(async () => {
    try {
/**
 * 记录response。
 */
      const response = await fetch(`${baseUrl}/health`);
      if (response.status !== options.expectedStatus) {
        return false;
      }
/**
 * 记录请求体。
 */
      const body = await response.json().catch(() => null);
/**
 * 记录active。
 */
      const active = body?.readiness?.maintenance?.active === true;
      return options.expectMaintenance ? active : !active;
    } catch {
      return false;
    }
  }, 10000);
}

/**
 * 处理measurehandshake。
 */
async function measureHandshake() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
  const socket = io(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { protocol: "mainline" },
  });
  try {
/**
 * 记录start。
 */
    const start = Date.now();
    await onceConnected(socket);
/**
 * 记录events。
 */
    const events = {};
/**
 * 记录listener。
 */
    const listener = (event, payload) => {
      events[event] = { timestamp: Date.now(), size: JSON.stringify(payload).length };
    };
    socket.on(shared.S2C.InitSession, (payload) => listener("InitSession", payload));
    socket.on(shared.S2C.Bootstrap, (payload) => listener("Bootstrap", payload));
    socket.on(shared.S2C.MapStatic, (payload) => listener("MapStatic", payload));
    socket.emit(shared.C2S.Hello, {
      mapId: "yunlai_town",
      preferredX: 32,
      preferredY: 5,
    });
    await waitForCondition(() => events.MapStatic, 5000);
/**
 * 记录bootstraptime。
 */
    const bootstrapTime = events.Bootstrap.timestamp - start;
/**
 * 记录地图statictime。
 */
    const mapStaticTime = events.MapStatic.timestamp - start;
    return {
      bootstrapLatencyMs: bootstrapTime,
      mapStaticLatencyMs: mapStaticTime,
      bootstrapSize: events.Bootstrap.size,
      mapStaticSize: events.MapStatic.size,
    };
  } finally {
    socket.close();
  }
}

/**
 * 处理onceconnected。
 */
async function onceConnected(socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (socket.connected) {
    return;
  }
  await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
  const startedAt = Date.now();
  while (true) {
/**
 * 记录data。
 */
    const data = await predicate();
    if (data) {
      return data;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("waitFor timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
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
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
/**
 * 记录addr。
 */
      const addr = server.address();
/**
 * 记录端口。
 */
      const port = typeof addr === "object" ? addr.port : 0;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

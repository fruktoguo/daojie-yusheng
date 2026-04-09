"use strict";
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { join, resolve } = require("node:path");
const io = require("socket.io-client");
const shared = require("@mud/shared-next");

const packageRoot = resolve(__dirname, "..", "..");
const serverEntry = join(packageRoot, "dist", "main.js");
let currentPort = Number(process.env.SERVER_NEXT_BENCH_PORT ?? 3219);
let baseUrl = `http://127.0.0.1:${currentPort}`;

async function main() {
  const server = await startServer();
  try {
    await waitForHealth({ expectedStatus: 200, expectMaintenance: false });
    const metrics = await measureHandshake();
    console.log(JSON.stringify({ ok: true, ...metrics }, null, 2));
  } finally {
    await stopServer(server);
  }
}

async function startServer() {
  currentPort = await allocateFreePort();
  baseUrl = `http://127.0.0.1:${currentPort}`;
  const child = spawn("node", [serverEntry], {
    cwd: packageRoot,
    env: {
      ...process.env,
      SERVER_NEXT_PORT: String(currentPort),
      SERVER_NEXT_RUNTIME_HTTP: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(String(chunk)));
  child.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));
  return child;
}

async function stopServer(child) {
  if (!child) {
    return;
  }
  if (child.killed || child.exitCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await new Promise((resolve) => {
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

async function waitForHealth(options) {
  await waitForCondition(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status !== options.expectedStatus) {
        return false;
      }
      const body = await response.json().catch(() => null);
      const active = body?.readiness?.maintenance?.active === true;
      return options.expectMaintenance ? active : !active;
    } catch {
      return false;
    }
  }, 10000);
}

async function measureHandshake() {
  const socket = io(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { protocol: "next" },
  });
  try {
    const start = Date.now();
    await onceConnected(socket);
    const events = {};
    const listener = (event, payload) => {
      events[event] = { timestamp: Date.now(), size: JSON.stringify(payload).length };
    };
    socket.on(shared.NEXT_S2C.InitSession, (payload) => listener("InitSession", payload));
    socket.on(shared.NEXT_S2C.Bootstrap, (payload) => listener("Bootstrap", payload));
    socket.on(shared.NEXT_S2C.MapStatic, (payload) => listener("MapStatic", payload));
    socket.emit(shared.NEXT_C2S.Hello, {
      mapId: "yunlai_town",
      preferredX: 32,
      preferredY: 5,
    });
    await waitForCondition(() => events.MapStatic, 5000);
    const bootstrapTime = events.Bootstrap.timestamp - start;
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

async function onceConnected(socket) {
  if (socket.connected) {
    return;
  }
  await new Promise((resolve, reject) => {
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

async function waitForCondition(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (true) {
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

async function allocateFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
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

"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const distEntry = path.join(projectRoot, "dist/main.js");
const tscBin = path.resolve(projectRoot, "../../node_modules/.pnpm/node_modules/typescript/bin/tsc");

let shuttingDown = false;
let serverProcess = null;
let serverGeneration = 0;
let watchReady = false;

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hours = padDatePart(now.getHours());
  const minutes = padDatePart(now.getMinutes());
  const seconds = padDatePart(now.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function log(message) {
  process.stdout.write(`[${getTimestamp()}] [server-next dev] ${message}\n`);
}

function forwardWithCapture(stream, onText) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    process.stdout.write(chunk);
    onText(chunk);
  });
}

function stopServer(onStopped) {
  const child = serverProcess;
  if (!child || child.exitCode !== null) {
    serverProcess = null;
    onStopped?.();
    return;
  }

  let finished = false;
  const done = () => {
    if (finished) {
      return;
    }
    finished = true;
    if (serverProcess === child) {
      serverProcess = null;
    }
    onStopped?.();
  };

  child.once("exit", done);
  child.kill("SIGTERM");

  const forceKillTimer = setTimeout(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }, 3000);
  forceKillTimer.unref();
}

function startServer() {
  if (shuttingDown) {
    return;
  }
  const generation = ++serverGeneration;
  log(`启动 server-next 进程 #${generation}`);
  const child = spawn(process.execPath, [distEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  serverProcess = child;
  child.on("exit", (code, signal) => {
    if (serverProcess === child) {
      serverProcess = null;
    }
    if (shuttingDown) {
      return;
    }
    log(`server-next 进程 #${generation} 已退出 (code=${code ?? "null"}, signal=${signal ?? "none"})`);
  });
}

function restartServer(reason) {
  if (shuttingDown) {
    return;
  }
  log(`${reason}，重启 server-next...`);
  stopServer(() => startServer());
}

function shutdown(tscWatcher) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log("正在停止热更新进程...");

  if (tscWatcher.exitCode === null) {
    tscWatcher.kill("SIGTERM");
  }
  stopServer(() => {
    process.exit(0);
  });
}

const tscWatcher = spawn(process.execPath, [tscBin, "-w", "-p", "tsconfig.json", "--preserveWatchOutput"], {
  cwd: projectRoot,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

const handleWatcherText = (text) => {
  if (!text.includes("Found 0 errors.")) {
    return;
  }
  if (!watchReady) {
    watchReady = true;
    log("TypeScript 监听已就绪，后续编译成功会自动重启 server-next");
    return;
  }
  restartServer("检测到源码编译完成");
};

forwardWithCapture(tscWatcher.stdout, handleWatcherText);
forwardWithCapture(tscWatcher.stderr, handleWatcherText);

tscWatcher.on("exit", (code, signal) => {
  if (shuttingDown) {
    return;
  }
  log(`TypeScript 监听进程退出 (code=${code ?? "null"}, signal=${signal ?? "none"})`);
  shutdown(tscWatcher);
});

process.on("SIGINT", () => shutdown(tscWatcher));
process.on("SIGTERM", () => shutdown(tscWatcher));

startServer();

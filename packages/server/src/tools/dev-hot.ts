// @ts-nocheck

/**
 * 用途：监听编译结果并热重启 server-next 开发进程。
 */

import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..", "..");
const distEntry = path.join(projectRoot, "dist/main.js");
const tscBin = path.resolve(projectRoot, "../../node_modules/.pnpm/node_modules/typescript/bin/tsc");

let shuttingDown = false;
let serverProcess: import("node:child_process").ChildProcess | null = null;
let serverGeneration = 0;
let watchReady = false;
/**
 * padDatePart：执行核心业务逻辑。
 * @param value number 参数说明。
 * @returns 函数返回值。
 */


function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
/**
 * getTimestamp：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


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
/**
 * log：执行核心业务逻辑。
 * @param message string 参数说明。
 * @returns 函数返回值。
 */


function log(message: string) {
  process.stdout.write(`[${getTimestamp()}] [server-next dev] ${message}\n`);
}
/**
 * forwardWithCapture：执行核心业务逻辑。
 * @param stream NodeJS.ReadableStream 参数说明。
 * @param onText (text: string) => void 参数说明。
 * @returns 函数返回值。
 */


function forwardWithCapture(stream: NodeJS.ReadableStream, onText: (text: string) => void) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    process.stdout.write(chunk);
    onText(chunk);
  });
}
/**
 * stopServer：执行核心业务逻辑。
 * @param onStopped () => void 参数说明。
 * @returns 函数返回值。
 */


function stopServer(onStopped?: () => void) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * startServer：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function startServer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * restartServer：执行核心业务逻辑。
 * @param reason string 参数说明。
 * @returns 函数返回值。
 */


function restartServer(reason: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (shuttingDown) {
    return;
  }
  log(`${reason}，重启 server-next...`);
  stopServer(() => startServer());
}
/**
 * shutdown：执行核心业务逻辑。
 * @param tscWatcher import("node:child_process").ChildProcess 参数说明。
 * @returns 函数返回值。
 */


function shutdown(tscWatcher: import("node:child_process").ChildProcess) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

const handleWatcherText = (text: string) => {
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
forwardWithCapture(tscWatcher.stderr, (text) => {
  if (text.trim()) {
    process.stderr.write(text);
  }
});

tscWatcher.on("exit", (code, signal) => {
  if (shuttingDown) {
    return;
  }
  log(`TypeScript 监听已退出 (code=${code ?? "null"}, signal=${signal ?? "none"})`);
  stopServer(() => {
    process.exit(code ?? 1);
  });
});

process.on("SIGINT", () => shutdown(tscWatcher));
process.on("SIGTERM", () => shutdown(tscWatcher));

startServer();

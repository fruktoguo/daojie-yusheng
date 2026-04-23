// @ts-nocheck

/**
 * 用途：监听编译结果并热重启 server 开发进程。
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
let expectedServerExitPid: number | null = null;
let restartTimer: NodeJS.Timeout | null = null;
const recentUnexpectedExitAt: number[] = [];
const shouldClearConsoleOnRestart =
  process.stdout.isTTY && process.env.SERVER_DEV_CLEAR_CONSOLE_ON_RESTART !== "0";
/**
 * padDatePart：处理padDatePart并更新相关状态。
 * @param value number 参数说明。
 * @returns 无返回值，直接更新padDatePart相关状态。
 */


function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
/**
 * getTimestamp：读取Timestamp。
 * @returns 无返回值，完成Timestamp的读取/组装。
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
 * log：执行log相关逻辑。
 * @param message string 参数说明。
 * @returns 无返回值，直接更新log相关状态。
 */


function log(message: string) {
  process.stdout.write(`[${getTimestamp()}] [server dev] ${message}\n`);
}

/**
 * clearConsoleForRestart：在交互终端下清理当前控制台和滚动回溯。
 */
function clearConsoleForRestart() {
  if (!shouldClearConsoleOnRestart) {
    return;
  }
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}

/**
 * printServerSessionBanner：打印当前 server 会话头，避免多次重启日志混在一起。
 */
function printServerSessionBanner(generation: number) {
  log("=========================================");
  log(`server 热更新会话 #${generation}`);
  log(`entry: ${distEntry}`);
  log("=========================================");
}

/**
 * clearRestartTimer：清理未执行的自动重启定时器。
 */
function clearRestartTimer() {
  if (!restartTimer) {
    return;
  }
  clearTimeout(restartTimer);
  restartTimer = null;
}

/**
 * computeRestartDelayMs：按近期异常退出频率给出重启退避时间。
 */
function computeRestartDelayMs() {
  const now = Date.now();
  while (recentUnexpectedExitAt.length > 0 && now - (recentUnexpectedExitAt[0] ?? now) > 30_000) {
    recentUnexpectedExitAt.shift();
  }
  recentUnexpectedExitAt.push(now);
  return recentUnexpectedExitAt.length >= 3 ? 5_000 : 1_000;
}

/**
 * scheduleAutoRestart：为异常退出安排自动拉起，避免开发脚本挂死。
 */
function scheduleAutoRestart(reason: string) {
  if (shuttingDown) {
    return;
  }
  clearRestartTimer();
  const delayMs = computeRestartDelayMs();
  log(`${reason}，${delayMs}ms 后自动重启 server`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startServer();
  }, delayMs);
  restartTimer.unref();
}
/**
 * forwardWithCapture：执行forwardWithCapture相关逻辑。
 * @param stream NodeJS.ReadableStream 参数说明。
 * @param onText (text: string) => void 参数说明。
 * @returns 无返回值，直接更新forwardWithCapture相关状态。
 */


function forwardWithCapture(stream: NodeJS.ReadableStream, onText: (text: string) => void) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    process.stdout.write(chunk);
    onText(chunk);
  });
}
/**
 * stopServer：执行stopServer相关逻辑。
 * @param onStopped () => void 参数说明。
 * @returns 无返回值，直接更新stopServer相关状态。
 */


function stopServer(onStopped?: () => void) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const child = serverProcess;
  if (!child || child.exitCode !== null) {
    serverProcess = null;
    expectedServerExitPid = null;
    onStopped?.();
    return;
  }
  clearRestartTimer();
  expectedServerExitPid = child.pid ?? null;

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
 * startServer：执行开始Server相关逻辑。
 * @returns 无返回值，直接更新startServer相关状态。
 */


function startServer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (shuttingDown) {
    return;
  }
  clearRestartTimer();
  const generation = ++serverGeneration;
  clearConsoleForRestart();
  printServerSessionBanner(generation);
  log(`启动 server 进程 #${generation}`);

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
    const isExpectedExit = expectedServerExitPid !== null && expectedServerExitPid === (child.pid ?? null);
    if (isExpectedExit) {
      expectedServerExitPid = null;
    }
    if (shuttingDown) {
      return;
    }
    log(`server 进程 #${generation} 已退出 (code=${code ?? "null"}, signal=${signal ?? "none"})`);
    if (!isExpectedExit) {
      scheduleAutoRestart(`server 进程 #${generation} 异常退出`);
    }
  });
}
/**
 * restartServer：执行restartServer相关逻辑。
 * @param reason string 参数说明。
 * @returns 无返回值，直接更新restartServer相关状态。
 */


function restartServer(reason: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (shuttingDown) {
    return;
  }
  clearRestartTimer();
  log(`${reason}，重启 server...`);
  stopServer(() => startServer());
}
/**
 * shutdown：执行shutdown相关逻辑。
 * @param tscWatcher import("node:child_process").ChildProcess 参数说明。
 * @returns 无返回值，直接更新shutdown相关状态。
 */


function shutdown(tscWatcher: import("node:child_process").ChildProcess) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  clearRestartTimer();
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
    log("TypeScript 监听已就绪，后续编译成功会自动重启 server");
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

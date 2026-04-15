"use strict";

/**
 * 用途：监听编译结果并热重启 server-next 开发进程。
 */

const { spawn } = require("node:child_process");
/** path：定义该变量以承载业务值。 */
const path = require("node:path");

/** projectRoot：定义该变量以承载业务值。 */
const projectRoot = path.resolve(__dirname, "..");
/** distEntry：定义该变量以承载业务值。 */
const distEntry = path.join(projectRoot, "dist/main.js");
/**
 * 记录tscbin。
 */
const tscBin = path.resolve(projectRoot, "../../node_modules/.pnpm/node_modules/typescript/bin/tsc");

/**
 * 记录shuttingdown。
 */
let shuttingDown = false;
/**
 * 记录服务端进程。
 */
let serverProcess = null;
/**
 * 记录服务端generation。
 */
let serverGeneration = 0;
/**
 * 记录watch就绪状态。
 */
let watchReady = false;

/**
 * 处理paddatepart。
 */
function padDatePart(value) {
  return String(value).padStart(2, "0");
}

/**
 * 获取timestamp。
 */
function getTimestamp() {
/**
 * 记录now。
 */
  const now = new Date();
/**
 * 记录year。
 */
  const year = now.getFullYear();
/**
 * 记录month。
 */
  const month = padDatePart(now.getMonth() + 1);
/**
 * 记录day。
 */
  const day = padDatePart(now.getDate());
/**
 * 记录hours。
 */
  const hours = padDatePart(now.getHours());
/**
 * 记录minutes。
 */
  const minutes = padDatePart(now.getMinutes());
/**
 * 记录seconds。
 */
  const seconds = padDatePart(now.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 处理log。
 */
function log(message) {
  process.stdout.write(`[${getTimestamp()}] [server-next dev] ${message}\n`);
}

/**
 * 转发withcapture。
 */
function forwardWithCapture(stream, onText) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    process.stdout.write(chunk);
    onText(chunk);
  });
}

/**
 * 停止服务端。
 */
function stopServer(onStopped) {
/**
 * 记录子进程。
 */
  const child = serverProcess;
  if (!child || child.exitCode !== null) {
    serverProcess = null;
    onStopped?.();
    return;
  }

/**
 * 记录finished。
 */
  let finished = false;
/**
 * 记录done。
 */
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

/**
 * 记录forcekilltimer。
 */
  const forceKillTimer = setTimeout(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }, 3000);
  forceKillTimer.unref();
}

/**
 * 启动服务端。
 */
function startServer() {
  if (shuttingDown) {
    return;
  }
/**
 * 记录generation。
 */
  const generation = ++serverGeneration;
  log(`启动 server-next 进程 #${generation}`);
/** child：定义该变量以承载业务值。 */
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

/** restartServer：执行对应的业务逻辑。 */
function restartServer(reason) {
  if (shuttingDown) {
    return;
  }
  log(`${reason}，重启 server-next...`);
  stopServer(() => startServer());
}

/**
 * 处理shutdown。
 */
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

/**
 * 记录tsc监听器。
 */
const tscWatcher = spawn(process.execPath, [tscBin, "-w", "-p", "tsconfig.json", "--preserveWatchOutput"], {
  cwd: projectRoot,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

/**
 * 记录handle监听器text。
 */
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

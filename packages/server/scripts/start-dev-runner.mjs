#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(SCRIPT_DIR, '..');
const DIST_DIR = path.join(SERVER_ROOT, 'dist');
const SERVER_ENTRY_PATH = path.join(DIST_DIR, 'main.js');
const DEV_WATCH_PAUSE_REQUEST_PATH = path.join(SERVER_ROOT, 'data', 'backups', 'database', '_meta', 'dev-watch-pause.json');
const POLL_INTERVAL_MS = 500;
const RESTART_DEBOUNCE_MS = 800;
const STOP_TIMEOUT_MS = 10_000;
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const DEFAULT_SERVER_PORT = 3000;
const DEFAULT_SERVER_HOST = '0.0.0.0';

let shuttingDown = false;
let restartingServer = false;
let buildWatchProcess = null;
let serverProcess = null;
let restartRequested = false;
let restartReason = '';
let lastChangeDetectedAt = 0;
let pauseLogUntil = 0;
let distFingerprint = null;

function log(message) {
  process.stdout.write(`[dev-runner] ${message}\n`);
}

function warn(message) {
  process.stderr.write(`[dev-runner] ${message}\n`);
}

function readPauseWindow() {
  try {
    const raw = fs.readFileSync(DEV_WATCH_PAUSE_REQUEST_PATH, 'utf8');
    const data = JSON.parse(raw);
    const pauseUntilTime = new Date(String(data.pauseUntil ?? '')).getTime();
    if (!Number.isFinite(pauseUntilTime)) {
      return null;
    }
    return {
      pauseUntilTime,
      reason: typeof data.reason === 'string' ? data.reason : 'database-maintenance',
    };
  } catch {
    return null;
  }
}

function getActivePauseWindow() {
  const pause = readPauseWindow();
  if (!pause) {
    return null;
  }
  return pause.pauseUntilTime > Date.now() ? pause : null;
}

function collectDistFingerprint() {
  if (!fs.existsSync(SERVER_ENTRY_PATH)) {
    return null;
  }
  const stack = [DIST_DIR];
  let maxMtimeMs = 0;
  let fileCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stats = fs.statSync(fullPath);
      fileCount += 1;
      maxMtimeMs = Math.max(maxMtimeMs, stats.mtimeMs);
    }
  }

  return `${fileCount}:${Math.floor(maxMtimeMs)}`;
}

function sameFingerprint(left, right) {
  return left === right;
}

function getServerPort() {
  const parsed = Number(process.env.PORT ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SERVER_PORT;
}

function getServerHost() {
  return process.env.HOST || DEFAULT_SERVER_HOST;
}

function findListeningPid(port) {
  if (process.platform === 'win32') {
    return null;
  }
  const result = spawnSync('lsof', ['-tiTCP:' + String(port), '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  const pid = result.stdout.trim().split(/\s+/u)[0] ?? '';
  return pid || null;
}

async function assertServerPortAvailable() {
  const host = getServerHost();
  const port = getServerPort();
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      probe.close();
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        const pid = findListeningPid(port);
        reject(new Error(`开发服务启动失败: ${host}:${port} 已被占用${pid ? `，监听 PID=${pid}` : ''}`));
        return;
      }
      reject(error);
    });
    probe.once('listening', () => {
      probe.close(() => resolve());
    });
    probe.listen(port, host);
  });
}

async function runInitialBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn(PNPM_COMMAND, ['exec', 'nest', 'build'], {
      cwd: SERVER_ROOT,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`初始构建失败，退出码 ${code ?? 'unknown'}`));
    });
  });
}

function startBuildWatch() {
  buildWatchProcess = spawn(PNPM_COMMAND, ['exec', 'nest', 'build', '--watch'], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
  });
  buildWatchProcess.on('error', (error) => {
    warn(`构建监听进程异常退出: ${error instanceof Error ? error.message : String(error)}`);
    shutdown(1);
  });
  buildWatchProcess.on('close', (code) => {
    if (shuttingDown) {
      return;
    }
    warn(`构建监听进程已退出，退出码 ${code ?? 'unknown'}`);
    shutdown(code ?? 1);
  });
}

function startServerProcess() {
  if (!fs.existsSync(SERVER_ENTRY_PATH)) {
    throw new Error(`未找到服务端入口 ${SERVER_ENTRY_PATH}`);
  }
  serverProcess = spawn(process.execPath, [SERVER_ENTRY_PATH], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  serverProcess.on('error', (error) => {
    warn(`服务进程启动失败: ${error instanceof Error ? error.message : String(error)}`);
  });
  serverProcess.on('close', (code, signal) => {
    const exitedDuringRestart = restartingServer;
    serverProcess = null;
    if (shuttingDown || exitedDuringRestart) {
      return;
    }
    warn(`服务进程已退出: code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });
}

async function stopServerProcess() {
  if (!serverProcess) {
    return;
  }
  const child = serverProcess;
  await new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      resolve();
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      finish();
    }, STOP_TIMEOUT_MS);
    child.once('close', () => {
      clearTimeout(timer);
      finish();
    });
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    } else {
      clearTimeout(timer);
      finish();
    }
  });
}

async function restartServer(reason) {
  if (restartingServer || shuttingDown) {
    return;
  }
  restartingServer = true;
  try {
    log(`应用服务端热重启: ${reason}`);
    await stopServerProcess();
    startServerProcess();
  } finally {
    restartingServer = false;
  }
}

function requestRestart(reason) {
  restartRequested = true;
  restartReason = reason;
  lastChangeDetectedAt = Date.now();
}

async function tick() {
  if (shuttingDown) {
    return;
  }
  const nextFingerprint = collectDistFingerprint();
  if (nextFingerprint && !sameFingerprint(nextFingerprint, distFingerprint)) {
    if (distFingerprint !== null) {
      requestRestart('检测到服务端构建产物变更');
    }
    distFingerprint = nextFingerprint;
  }
  if (!restartRequested || restartingServer) {
    return;
  }
  const pauseWindow = getActivePauseWindow();
  if (pauseWindow) {
    if (Date.now() >= pauseLogUntil) {
      const secondsLeft = Math.max(1, Math.ceil((pauseWindow.pauseUntilTime - Date.now()) / 1000));
      log(`数据库维护窗口生效，延迟热重启 ${secondsLeft}s，原因: ${pauseWindow.reason}`);
      pauseLogUntil = Date.now() + 5_000;
    }
    return;
  }
  if (Date.now() - lastChangeDetectedAt < RESTART_DEBOUNCE_MS) {
    return;
  }
  restartRequested = false;
  pauseLogUntil = 0;
  await restartServer(restartReason || '构建完成');
}

async function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (buildWatchProcess && buildWatchProcess.exitCode === null) {
    buildWatchProcess.kill('SIGTERM');
  }
  await stopServerProcess();
  process.exit(code);
}

async function main() {
  log('开始执行一次性构建...');
  await runInitialBuild();
  await assertServerPortAvailable();
  distFingerprint = collectDistFingerprint();
  startServerProcess();
  startBuildWatch();
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS).unref();
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});

main().catch((error) => {
  warn(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

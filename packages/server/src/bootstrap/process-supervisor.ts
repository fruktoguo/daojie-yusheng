/**
 * 生产服务进程监督器。
 *
 * 监督器只负责子进程生命周期、心跳和 liveness 探测，不加载 Nest、运行时或持久化模块。
 */
import { fork, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join, resolve } from 'node:path';

const SUPERVISOR_CHILD_ENV = 'SERVER_PROCESS_SUPERVISOR_CHILD';
const SUPERVISOR_GENERATION_ENV = 'SERVER_PROCESS_SUPERVISOR_GENERATION';
const SUPERVISOR_RESTART_CONTEXT_ENV = 'SERVER_PROCESS_SUPERVISOR_RESTART_CONTEXT';
const SUPERVISOR_MESSAGE_SOURCE = 'server-process-supervisor-child';
const DEVELOPMENT_ENVS = new Set(['development', 'dev', 'local', 'test']);

interface SupervisorChildMessage {
  source: typeof SUPERVISOR_MESSAGE_SOURCE;
  type: 'heartbeat' | 'ready';
  at: number;
  pid: number;
}

interface ChildMemorySnapshot {
  rssMb: number | null;
  peakRssMb: number | null;
}

interface SupervisorRestartContext extends ChildMemorySnapshot {
  generation: number;
  reason: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  startedAt: string;
  readyAt: string | null;
  exitedAt: string;
  uptimeMs: number;
  consecutiveFailures: number;
}

interface ProcessSupervisorConfig {
  startupTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  livenessIntervalMs: number;
  livenessTimeoutMs: number;
  livenessFailureThreshold: number;
  restartBaseDelayMs: number;
  restartMaxDelayMs: number;
  stableWindowMs: number;
  recoveryStopTimeoutMs: number;
  shutdownStopTimeoutMs: number;
  journalPath: string;
  journalMaxBytes: number;
  journalRetainBytes: number;
  probeHost: string;
  probePort: number;
  probeEnabled: boolean;
}

export interface RunServerProcessSupervisorOptions {
  entryPath: string;
  config?: Partial<ProcessSupervisorConfig>;
}

/** 开发/测试默认直启应用，未声明环境按生产口径启用监督器。 */
export function shouldRunServerProcessSupervisor(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[SUPERVISOR_CHILD_ENV] === '1') {
    return false;
  }
  const explicit = parseOptionalBoolean(env.SERVER_PROCESS_SUPERVISOR_ENABLED);
  if (explicit !== null) {
    return explicit;
  }
  const runtimeEnv = String(env.SERVER_RUNTIME_ENV ?? env.APP_ENV ?? env.NODE_ENV ?? '').trim().toLowerCase();
  return !DEVELOPMENT_ENVS.has(runtimeEnv);
}

/** 子进程向父监督器发送轻量心跳；非监督模式下为空操作。 */
export function startServerProcessSupervisorHeartbeat(): () => void {
  if (process.env[SUPERVISOR_CHILD_ENV] !== '1' || typeof process.send !== 'function') {
    return () => undefined;
  }
  preferSupervisedChildAsOomVictim();
  const intervalMs = readBoundedInteger(
    process.env.SERVER_PROCESS_SUPERVISOR_HEARTBEAT_INTERVAL_MS,
    2_000,
    100,
    60_000,
  );
  const sendHeartbeat = () => sendSupervisorChildMessage('heartbeat');
  sendHeartbeat();
  const timer = setInterval(sendHeartbeat, intervalMs);
  timer.unref();
  const stop = () => clearInterval(timer);
  process.once('disconnect', stop);
  return stop;
}

/** Nest 应用完成 init/listen 后通知父监督器开放 liveness 探测。 */
export function notifyServerProcessSupervisorReady(): void {
  sendSupervisorChildMessage('ready');
}

/** 启动常驻父进程；只有收到容器停止信号时才正常返回。 */
export async function runServerProcessSupervisor(options: RunServerProcessSupervisorOptions): Promise<void> {
  const config = { ...resolveProcessSupervisorConfig(process.env), ...options.config };
  const supervisor = new ServerProcessSupervisor(resolve(options.entryPath), config);
  await supervisor.run();
}

class ServerProcessSupervisor {
  private child: ChildProcess | null = null;
  private generation = 0;
  private childStartedAt = 0;
  private childReadyAt: number | null = null;
  private lastHeartbeatAt = 0;
  private lastMemory: ChildMemorySnapshot = { rssMb: null, peakRssMb: null };
  private consecutiveFailures = 0;
  private livenessFailures = 0;
  private livenessInFlight = false;
  private recoveryReason: string | null = null;
  private shuttingDown = false;
  private finished = false;
  private recentRestartContexts: SupervisorRestartContext[] = [];
  private startupTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private livenessTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private forceStopTimer: NodeJS.Timeout | null = null;
  private resolveRun: (() => void) | null = null;
  private journalWarningShown = false;

  constructor(
    private readonly entryPath: string,
    private readonly config: ProcessSupervisorConfig,
  ) {}

  run(): Promise<void> {
    return new Promise<void>((resolveRun) => {
      this.resolveRun = resolveRun;
      this.record('supervisor_started', '进程监督器已启动', {
        entryPath: this.entryPath,
        role: resolveRuntimeRole(process.env),
        probeEnabled: this.config.probeEnabled,
      });
      process.on('SIGTERM', this.handleSigterm);
      process.on('SIGINT', this.handleSigint);
      process.on('SIGUSR2', this.handleManualRestart);
      this.startChild();
    });
  }

  private readonly handleSigterm = () => this.beginShutdown('SIGTERM');
  private readonly handleSigint = () => this.beginShutdown('SIGINT');
  private readonly handleManualRestart = () => this.requestRecovery('manual_signal_SIGUSR2');

  private startChild(): void {
    if (this.shuttingDown) {
      return;
    }
    this.clearChildTimers();
    this.generation += 1;
    this.childStartedAt = Date.now();
    this.childReadyAt = null;
    this.lastHeartbeatAt = this.childStartedAt;
    this.lastMemory = { rssMb: null, peakRssMb: null };
    this.livenessFailures = 0;
    this.recoveryReason = null;

    const child = fork(this.entryPath, process.argv.slice(2), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        [SUPERVISOR_CHILD_ENV]: '1',
        [SUPERVISOR_GENERATION_ENV]: String(this.generation),
        [SUPERVISOR_RESTART_CONTEXT_ENV]: this.recentRestartContexts.length > 0
          ? JSON.stringify(this.recentRestartContexts.slice(-8))
          : '',
      },
      execArgv: process.execArgv.filter((arg) => !arg.startsWith('--inspect')),
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    this.child = child;
    child.on('message', (message) => this.handleChildMessage(child, message));
    child.once('error', (error) => {
      this.record('child_process_error', '子进程创建或通信失败', {
        generation: this.generation,
        error: error.message,
      });
    });
    child.once('close', (code, signal) => this.handleChildClose(child, code, signal));

    this.record('child_started', '已启动服务端子进程', {
      generation: this.generation,
      childPid: child.pid ?? null,
    });
    this.startupTimer = setTimeout(
      () => this.requestRecovery('startup_timeout'),
      this.config.startupTimeoutMs,
    );
    this.startupTimer.unref();
    this.heartbeatTimer = setInterval(
      () => this.checkChildHeartbeat(child),
      Math.min(this.config.heartbeatIntervalMs, 1_000),
    );
    this.heartbeatTimer.unref();
  }

  private handleChildMessage(child: ChildProcess, message: unknown): void {
    if (child !== this.child || !isSupervisorChildMessage(message)) {
      return;
    }
    this.lastHeartbeatAt = Math.max(this.lastHeartbeatAt, message.at);
    if (message.type !== 'ready' || this.childReadyAt !== null) {
      return;
    }
    this.childReadyAt = Date.now();
    this.clearTimer('startupTimer');
    this.record('child_ready', '服务端子进程已就绪', {
      generation: this.generation,
      childPid: message.pid,
      startupMs: this.childReadyAt - this.childStartedAt,
    });
    if (this.config.probeEnabled) {
      this.livenessTimer = setInterval(
        () => void this.probeChildLiveness(child),
        this.config.livenessIntervalMs,
      );
      this.livenessTimer.unref();
    }
  }

  private checkChildHeartbeat(child: ChildProcess): void {
    if (child !== this.child || this.recoveryReason || this.shuttingDown) {
      return;
    }
    if (child.pid) {
      this.lastMemory = readLinuxProcessMemory(child.pid);
    }
    if (Date.now() - this.lastHeartbeatAt > this.config.heartbeatTimeoutMs) {
      this.requestRecovery('heartbeat_timeout');
    }
  }

  private async probeChildLiveness(child: ChildProcess): Promise<void> {
    if (child !== this.child || this.livenessInFlight || this.recoveryReason || this.shuttingDown) {
      return;
    }
    this.livenessInFlight = true;
    try {
      const ok = await probeLiveness(this.config);
      if (child !== this.child || this.recoveryReason || this.shuttingDown) {
        return;
      }
      if (ok) {
        if (this.livenessFailures > 0) {
          this.record('liveness_recovered', '子进程 liveness 已恢复', {
            generation: this.generation,
            previousFailures: this.livenessFailures,
          });
        }
        this.livenessFailures = 0;
        return;
      }
      this.livenessFailures += 1;
      if (this.livenessFailures === 1) {
        this.record('liveness_failed', '子进程 liveness 探测失败', {
          generation: this.generation,
          threshold: this.config.livenessFailureThreshold,
        });
      }
      if (this.livenessFailures >= this.config.livenessFailureThreshold) {
        this.requestRecovery('liveness_failure_threshold');
      }
    } finally {
      this.livenessInFlight = false;
    }
  }

  private requestRecovery(reason: string): void {
    if (this.shuttingDown || this.recoveryReason) {
      return;
    }
    const child = this.child;
    if (!child) {
      this.scheduleRestart(reason);
      return;
    }
    this.recoveryReason = reason;
    this.clearMonitoringTimers();
    this.record('recovery_triggered', '触发服务端子进程恢复', {
      generation: this.generation,
      childPid: child.pid ?? null,
      reason,
      ...this.lastMemory,
    });
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGTERM');
      this.forceStopTimer = setTimeout(() => {
        if (child === this.child && child.exitCode === null) {
          this.record('child_force_killed', '恢复排空超时，强制结束子进程', {
            generation: this.generation,
            childPid: child.pid ?? null,
            reason,
          });
          child.kill('SIGKILL');
        }
      }, this.config.recoveryStopTimeoutMs);
      this.forceStopTimer.unref();
    }
  }

  private handleChildClose(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    if (child !== this.child) {
      return;
    }
    this.child = null;
    this.clearChildTimers();
    if (this.shuttingDown) {
      this.record('child_stopped', '服务端子进程已随监督器停止', {
        generation: this.generation,
        code,
        signal,
      });
      this.finish();
      return;
    }

    const now = Date.now();
    if (this.childReadyAt !== null && now - this.childReadyAt >= this.config.stableWindowMs) {
      this.consecutiveFailures = 0;
    }
    this.consecutiveFailures += 1;
    const context: SupervisorRestartContext = {
      generation: this.generation,
      reason: this.recoveryReason ?? 'unexpected_exit',
      code,
      signal,
      startedAt: new Date(this.childStartedAt).toISOString(),
      readyAt: this.childReadyAt === null ? null : new Date(this.childReadyAt).toISOString(),
      exitedAt: new Date(now).toISOString(),
      uptimeMs: Math.max(0, now - this.childStartedAt),
      consecutiveFailures: this.consecutiveFailures,
      ...this.lastMemory,
    };
    this.recentRestartContexts.push(context);
    this.recentRestartContexts = this.recentRestartContexts.slice(-8);
    this.record('child_exited', '服务端子进程异常退出', { ...context });
    this.scheduleRestart(context.reason);
  }

  private scheduleRestart(reason: string): void {
    if (this.shuttingDown || this.restartTimer) {
      return;
    }
    const exponent = Math.max(0, Math.min(this.consecutiveFailures - 1, 20));
    const delayMs = Math.min(
      this.config.restartMaxDelayMs,
      this.config.restartBaseDelayMs * (2 ** exponent),
    );
    this.record('restart_scheduled', '已安排服务端子进程重启', {
      reason,
      delayMs,
      consecutiveFailures: this.consecutiveFailures,
    });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startChild();
    }, delayMs);
  }

  private beginShutdown(signal: 'SIGTERM' | 'SIGINT'): void {
    if (this.shuttingDown) {
      if (this.child?.exitCode === null) {
        this.child.kill('SIGKILL');
      }
      return;
    }
    this.shuttingDown = true;
    this.clearTimer('restartTimer');
    this.clearMonitoringTimers();
    this.record('supervisor_stopping', '进程监督器正在停止', { signal });
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.finish();
      return;
    }
    child.kill(signal);
    this.forceStopTimer = setTimeout(() => {
      if (child === this.child && child.exitCode === null) {
        this.record('child_force_killed', '容器停止排空超时，强制结束子进程', {
          generation: this.generation,
          childPid: child.pid ?? null,
          reason: signal,
        });
        child.kill('SIGKILL');
      }
    }, this.config.shutdownStopTimeoutMs);
    this.forceStopTimer.unref();
  }

  private finish(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.clearChildTimers();
    process.off('SIGTERM', this.handleSigterm);
    process.off('SIGINT', this.handleSigint);
    process.off('SIGUSR2', this.handleManualRestart);
    this.record('supervisor_stopped', '进程监督器已停止', null);
    this.resolveRun?.();
  }

  private clearMonitoringTimers(): void {
    this.clearTimer('startupTimer');
    this.clearTimer('heartbeatTimer');
    this.clearTimer('livenessTimer');
  }

  private clearChildTimers(): void {
    this.clearMonitoringTimers();
    this.clearTimer('forceStopTimer');
    this.livenessInFlight = false;
  }

  private clearTimer(name: 'startupTimer' | 'heartbeatTimer' | 'livenessTimer' | 'restartTimer' | 'forceStopTimer'): void {
    const timer = this[name];
    if (timer) {
      clearTimeout(timer);
      this[name] = null;
    }
  }

  private record(type: string, message: string, details: Record<string, unknown> | null): void {
    const event = {
      at: new Date().toISOString(),
      type,
      message,
      supervisorPid: process.pid,
      generation: this.generation,
      ...(details ?? {}),
    };
    console.log(`[进程监督] ${message} ${JSON.stringify(event)}`);
    try {
      appendSupervisorJournal(event, this.config);
    } catch (error) {
      if (!this.journalWarningShown) {
        this.journalWarningShown = true;
        console.warn('[进程监督] 事件日志写入失败：', error instanceof Error ? error.message : String(error));
      }
    }
  }
}

function resolveProcessSupervisorConfig(env: NodeJS.ProcessEnv): ProcessSupervisorConfig {
  const heartbeatIntervalMs = readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_HEARTBEAT_INTERVAL_MS, 2_000, 100, 60_000);
  const restartBaseDelayMs = readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_RESTART_BASE_DELAY_MS, 1_000, 10, 60_000);
  const journalRoot = String(env.SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR ?? '').trim() || '/var/lib/server';
  const journalMaxBytes = readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_JOURNAL_MAX_BYTES, 512 * 1024, 16 * 1024, 16 * 1024 * 1024);
  const runtimeRole = resolveRuntimeRole(env);
  const journalIdentity = sanitizeJournalIdentity(String(env.SERVER_NODE_ID ?? '').trim() || runtimeRole);
  return {
    startupTimeoutMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_STARTUP_TIMEOUT_MS, 180_000, 1_000, 30 * 60_000),
    heartbeatIntervalMs,
    heartbeatTimeoutMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_HEARTBEAT_TIMEOUT_MS, 30_000, heartbeatIntervalMs * 3, 10 * 60_000),
    livenessIntervalMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_LIVENESS_INTERVAL_MS, 5_000, 250, 60_000),
    livenessTimeoutMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_LIVENESS_TIMEOUT_MS, 3_000, 100, 30_000),
    livenessFailureThreshold: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_LIVENESS_FAILURE_THRESHOLD, 6, 1, 100),
    restartBaseDelayMs,
    restartMaxDelayMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_RESTART_MAX_DELAY_MS, 30_000, restartBaseDelayMs, 10 * 60_000),
    stableWindowMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_STABLE_WINDOW_MS, 300_000, 1_000, 60 * 60_000),
    recoveryStopTimeoutMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_RECOVERY_STOP_TIMEOUT_MS, 10_000, 100, 60_000),
    shutdownStopTimeoutMs: readBoundedInteger(env.SERVER_PROCESS_SUPERVISOR_SHUTDOWN_STOP_TIMEOUT_MS, 27_000, 1_000, 120_000),
    journalPath: resolve(String(env.SERVER_PROCESS_SUPERVISOR_JOURNAL_PATH ?? '').trim() || join(journalRoot, `process-supervisor-${journalIdentity}.jsonl`)),
    journalMaxBytes,
    journalRetainBytes: Math.floor(journalMaxBytes / 2),
    probeHost: String(env.SERVER_PROCESS_SUPERVISOR_PROBE_HOST ?? '').trim() || '127.0.0.1',
    probePort: readBoundedInteger(env.SERVER_PORT, 13_001, 1, 65_535),
    probeEnabled: runtimeRole !== 'worker',
  };
}

function sendSupervisorChildMessage(type: SupervisorChildMessage['type']): void {
  if (process.env[SUPERVISOR_CHILD_ENV] !== '1' || typeof process.send !== 'function' || !process.connected) {
    return;
  }
  const message: SupervisorChildMessage = {
    source: SUPERVISOR_MESSAGE_SOURCE,
    type,
    at: Date.now(),
    pid: process.pid,
  };
  try {
    process.send(message);
  } catch {
    // 父进程已退出时，子进程交由容器生命周期回收。
  }
}

function isSupervisorChildMessage(value: unknown): value is SupervisorChildMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const message = value as Partial<SupervisorChildMessage>;
  return message.source === SUPERVISOR_MESSAGE_SOURCE
    && (message.type === 'heartbeat' || message.type === 'ready')
    && typeof message.at === 'number'
    && typeof message.pid === 'number';
}

async function probeLiveness(config: ProcessSupervisorConfig): Promise<boolean> {
  return new Promise<boolean>((resolveProbe) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolveProbe(ok);
    };
    const req = request({
      host: config.probeHost,
      port: config.probePort,
      path: '/live',
      method: 'GET',
      agent: false,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        if (body.length <= 4_096) body += chunk;
      });
      response.on('end', () => {
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          finish(false);
          return;
        }
        try {
          const parsed = JSON.parse(body) as { alive?: { ok?: boolean } };
          finish(parsed.alive?.ok === true);
        } catch {
          finish(false);
        }
      });
      response.once('aborted', () => finish(false));
      response.once('error', () => finish(false));
    });
    req.setTimeout(config.livenessTimeoutMs, () => req.destroy(new Error('liveness_timeout')));
    req.once('error', () => finish(false));
    req.end();
  });
}

function appendSupervisorJournal(event: Record<string, unknown>, config: ProcessSupervisorConfig): void {
  mkdirSync(dirname(config.journalPath), { recursive: true });
  try {
    if (statSync(config.journalPath).size > config.journalMaxBytes) {
      const raw = readFileSync(config.journalPath);
      const start = Math.max(0, raw.length - config.journalRetainBytes);
      const newline = raw.indexOf(0x0a, start);
      writeFileSync(config.journalPath, raw.subarray(newline >= 0 ? newline + 1 : start));
    }
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  }
  appendFileSync(config.journalPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' });
}

function readLinuxProcessMemory(pid: number): ChildMemorySnapshot {
  if (process.platform !== 'linux') {
    return { rssMb: null, peakRssMb: null };
  }
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    return {
      rssMb: readProcStatusMb(status, 'VmRSS'),
      peakRssMb: readProcStatusMb(status, 'VmHWM'),
    };
  } catch {
    return { rssMb: null, peakRssMb: null };
  }
}

function readProcStatusMb(status: string, key: string): number | null {
  const match = status.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, 'm'));
  return match ? Math.round((Number(match[1]) / 1_024) * 100) / 100 : null;
}

function preferSupervisedChildAsOomVictim(): void {
  if (process.platform !== 'linux') {
    return;
  }
  const score = readBoundedInteger(process.env.SERVER_PROCESS_SUPERVISOR_CHILD_OOM_SCORE_ADJ, 500, 0, 1_000);
  try {
    writeFileSync('/proc/self/oom_score_adj', String(score));
  } catch {
    // 部分容器运行时禁止调整 OOM 分值；监督与重启能力不依赖该优化。
  }
}

function resolveRuntimeRole(env: NodeJS.ProcessEnv): 'api' | 'worker' | 'all' {
  const role = String(env.SERVER_RUNTIME_ROLE ?? env.DAOJIE_RUNTIME_ROLE ?? '').trim().toLowerCase();
  return role === 'worker' || role === 'all' ? role : 'api';
}

function parseOptionalBoolean(value: string | undefined): boolean | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function readBoundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function sanitizeJournalIdentity(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'server';
}

function hasErrorCode(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

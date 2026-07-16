import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installSmokeTimeout } from './smoke-timeout';
import { shouldRunServerProcessSupervisor } from '../bootstrap/process-supervisor';

installSmokeTimeout(__filename);

const fixtureEntry = join(__dirname, 'process-supervisor-fixture.js');

async function main(): Promise<void> {
  assert.equal(shouldRunServerProcessSupervisor({ SERVER_RUNTIME_ENV: 'production' }), true);
  assert.equal(shouldRunServerProcessSupervisor({ SERVER_RUNTIME_ENV: 'test' }), false);
  assert.equal(shouldRunServerProcessSupervisor({ SERVER_PROCESS_SUPERVISOR_ENABLED: '0' }), false);
  assert.equal(shouldRunServerProcessSupervisor({}), true);

  const crash = await runCase('crash-once');
  assert.match(crash.output, /"type":"child_exited"/);
  assert.match(crash.output, /"code":17/);
  assert.match(crash.output, /generation=2 ready context=/);
  assert.match(crash.output, /"reason":"unexpected_exit"/);

  const heartbeat = await runCase('heartbeat-timeout-once');
  assert.match(heartbeat.output, /"type":"recovery_triggered"/);
  assert.match(heartbeat.output, /"reason":"heartbeat_timeout"/);
  assert.match(heartbeat.output, /generation=2 ready context=/);

  const liveness = await runCase('liveness-timeout-once');
  assert.match(liveness.output, /"type":"liveness_failed"/);
  assert.match(liveness.output, /"reason":"liveness_failure_threshold"/);
  assert.match(liveness.output, /generation=2 ready context=/);

  console.log(JSON.stringify({
    ok: true,
    cases: ['unexpected_exit_restart', 'heartbeat_timeout_restart', 'liveness_failure_restart', 'signal_forwarding', 'restart_context_journal'],
  }, null, 2));
}

async function runCase(mode: 'crash-once' | 'heartbeat-timeout-once' | 'liveness-timeout-once'): Promise<{ output: string }> {
  const tempRoot = mkdtempSync(join(tmpdir(), `server-process-supervisor-${mode}-`));
  const journalPath = join(tempRoot, 'events.jsonl');
  const port = await allocateFreePort();
  const logs: string[] = [];
  let child: ChildProcess | null = null;
  try {
    child = spawn(process.execPath, [fixtureEntry], {
      env: {
        ...process.env,
        SERVER_RUNTIME_ENV: 'production',
        SERVER_RUNTIME_ROLE: mode === 'liveness-timeout-once' ? 'api' : 'worker',
        SERVER_PORT: String(port),
        SERVER_PROCESS_SUPERVISOR_SMOKE_MODE: mode,
        SERVER_PROCESS_SUPERVISOR_HEARTBEAT_INTERVAL_MS: '100',
        SERVER_PROCESS_SUPERVISOR_HEARTBEAT_TIMEOUT_MS: '350',
        SERVER_PROCESS_SUPERVISOR_STARTUP_TIMEOUT_MS: '1000',
        SERVER_PROCESS_SUPERVISOR_RESTART_BASE_DELAY_MS: '20',
        SERVER_PROCESS_SUPERVISOR_RESTART_MAX_DELAY_MS: '50',
        SERVER_PROCESS_SUPERVISOR_STABLE_WINDOW_MS: '1000',
        SERVER_PROCESS_SUPERVISOR_RECOVERY_STOP_TIMEOUT_MS: '100',
        SERVER_PROCESS_SUPERVISOR_SHUTDOWN_STOP_TIMEOUT_MS: '500',
        SERVER_PROCESS_SUPERVISOR_LIVENESS_INTERVAL_MS: '250',
        SERVER_PROCESS_SUPERVISOR_LIVENESS_TIMEOUT_MS: '100',
        SERVER_PROCESS_SUPERVISOR_LIVENESS_FAILURE_THRESHOLD: '2',
        SERVER_PROCESS_SUPERVISOR_JOURNAL_PATH: journalPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr?.on('data', (chunk) => logs.push(String(chunk)));

    await waitFor(() => logs.join('').includes('generation=2 ready context='), 5_000);
    const exit = waitForExit(child);
    child.kill('SIGTERM');
    const result = await Promise.race([
      exit,
      delay(2_000).then(() => ({ code: null, signal: 'TIMEOUT' })),
    ]);
    assert.notEqual(result.signal, 'TIMEOUT', `${mode} 监督进程未按时退出：${logs.join('')}`);
    assert.equal(result.code, 0, `${mode} 监督进程退出码异常：${logs.join('')}`);

    const output = `${logs.join('')}\n${readFileSync(journalPath, 'utf8')}`;
    return { output };
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL');
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  throw new Error(`等待监督夹具超时：${timeoutMs}ms`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function allocateFreePort(): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) resolvePort(address.port);
        else reject(new Error('无法分配监督 smoke 端口'));
      });
    });
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

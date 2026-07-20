/** 进程监督 smoke 专用夹具，不加载 Nest 或任何持久化依赖。 */
import { createServer } from 'node:http';

import {
  notifyServerProcessSupervisorReady,
  reportServerProcessFatalAndExit,
  runServerProcessSupervisor,
  startServerProcessSupervisorHeartbeat,
} from '../bootstrap/process-supervisor';

const generation = Number(process.env.SERVER_PROCESS_SUPERVISOR_GENERATION ?? 0);
const mode = String(process.env.SERVER_PROCESS_SUPERVISOR_SMOKE_MODE ?? 'crash-once');
const isChild = process.env.SERVER_PROCESS_SUPERVISOR_CHILD === '1';

if (isChild) {
  runFixtureChild();
} else {
  void runServerProcessSupervisor({ entryPath: __filename }).catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}

function runFixtureChild(): void {
  if (mode === 'crash-once' && generation === 1) {
    setTimeout(() => process.exit(17), 40);
    return;
  }
  if (mode === 'fatal-once' && generation === 1) {
    setTimeout(() => reportServerProcessFatalAndExit('unhandled_rejection', new Error('fixture fatal rejection')), 40);
    return;
  }
  if (mode === 'heartbeat-timeout-once' && generation === 1) {
    sendFixtureMessage('ready');
    setInterval(() => undefined, 1_000);
    return;
  }
  if (mode === 'liveness-timeout-once' && generation === 1) {
    startServerProcessSupervisorHeartbeat();
    notifyServerProcessSupervisorReady();
    setInterval(() => undefined, 1_000);
    return;
  }
  if (mode === 'liveness-timeout-once') {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, alive: { ok: true } }));
    });
    server.listen(Number(process.env.SERVER_PORT), '127.0.0.1', () => {
      startServerProcessSupervisorHeartbeat();
      notifyServerProcessSupervisorReady();
      printReady();
    });
    return;
  }
  startServerProcessSupervisorHeartbeat();
  notifyServerProcessSupervisorReady();
  printReady();
  setInterval(() => undefined, 1_000);
}

function printReady(): void {
  console.log(`[监督夹具] generation=${generation} ready context=${process.env.SERVER_PROCESS_SUPERVISOR_RESTART_CONTEXT ?? ''}`);
}

function sendFixtureMessage(type: 'heartbeat' | 'ready'): void {
  process.send?.({
    source: 'server-process-supervisor-child',
    type,
    at: Date.now(),
    pid: process.pid,
  });
}

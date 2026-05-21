import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { S2C } from '@mud/shared';
import { io, type Socket } from 'socket.io-client';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { installSmokeTimeout } from './smoke-timeout';
import { decodeSmokePayload } from './smoke-payload';
import { flushRegisteredSmokePlayers, registerAndLoginSmokePlayer } from './smoke-player-auth';
import {
  assertNoActiveInstanceLeasesForSmoke,
  resolveSmokeForceReclaimEnv,
  resolveSmokeServerNodeEnv,
} from './smoke-live-db-lease-guard';
import { createStableDistSnapshot, resolveToolDistRoot, resolveToolPackageRoot } from './stable-dist';

installSmokeTimeout(__filename);

const packageRoot = resolveToolPackageRoot(__dirname);
const ownedDistSnapshot = process.env.SERVER_TOOL_DIST_ROOT ? null : createStableDistSnapshot({ label: 'shutdown-signal-path-smoke', packageRoot });
const distRoot = ownedDistSnapshot?.distRoot ?? resolveToolDistRoot(__dirname, packageRoot);
const repoRoot = resolve(packageRoot, '..', '..');
const serverEntry = join(distRoot, 'main.js');
const databaseUrl = resolveServerDatabaseUrl();
const instanceId = 'public:yunlai_town';
const serverNodeId = `shutdown-signal-path-smoke:${process.pid}`;

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'SERVER_DATABASE_URL/DATABASE_URL missing' }, null, 2));
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  let server: RunningServer | null = null;
  try {
    server = await startServer();
    await waitForHealth(server.baseUrl);
    const auth = await registerAndLoginSmokePlayer(server.baseUrl, { accountPrefix: 'shutdown_signal_path' });
    const socket = await connectPlayer(server.baseUrl, auth.accessToken);
    const before = await readPresenceAndLease(pool, auth.playerId);
    if (before.presenceOnline !== true) {
      throw new Error(`signal path smoke expected online before shutdown: ${JSON.stringify(before)}`);
    }
    await stopServer(server);
    const logs = serverLogs(server);
    server = null;
    socket.close();
    const after = await readPresenceAndLease(pool, auth.playerId);
    if (after.presenceOnline !== false || after.offlineSinceAt == null || after.inWorld !== true) {
      throw new Error(`signal path smoke presence not drained: ${JSON.stringify(after)}`);
    }
    if (after.assignedNodeId !== null || after.leaseToken !== null || after.leaseExpireAt !== null) {
      throw new Error(`signal path smoke lease not released: ${JSON.stringify(after)}`);
    }
    if (!logs.includes('关闭 drain 完成') && !logs.includes('关闭 drain 降级完成')) {
      throw new Error(`signal path smoke missing shutdown completion log: ${logs}`);
    }
    if (logs.includes('Cannot use a pool after calling end on the pool')) {
      throw new Error(`signal path smoke observed pool-after-end warning: ${logs}`);
    }
    if (logs.includes('关闭前阵法刷盘失败')) {
      throw new Error(`signal path smoke observed late formation flush warning: ${logs}`);
    }
    if (logs.includes('通天塔进度落库跳过：连接池已关闭')) {
      throw new Error(`signal path smoke observed late tongtian warning: ${logs}`);
    }
    console.log(JSON.stringify({ ok: true, playerId: auth.playerId, before, after }, null, 2));
  } finally {
    if (server) {
      await stopServer(server).catch(() => undefined);
    }
    await flushRegisteredSmokePlayers().catch(() => undefined);
    await pool.end().catch(() => undefined);
    ownedDistSnapshot?.cleanup?.();
  }
}

async function startServer(): Promise<RunningServer> {
  const port = await getFreePort();
  const logs: string[] = [];
  await assertNoActiveInstanceLeasesForSmoke({
    databaseUrl,
    context: 'shutdown signal path smoke',
  });
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVER_PORT: String(port),
      SERVER_DATABASE_URL: databaseUrl,
      ...resolveSmokeServerNodeEnv(databaseUrl, serverNodeId),
      SERVER_FORCE_RECLAIM_STALE_LEASES: resolveSmokeForceReclaimEnv(databaseUrl),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr?.on('data', (chunk) => logs.push(String(chunk)));
  child.once('exit', (code, signal) => {
    if (code && code !== 0) {
      logs.push(`server exited code=${code} signal=${signal ?? ''}`);
    }
  });
  return { child, baseUrl: `http://127.0.0.1:${port}`, get logs() { return logs.join(''); } };
}

async function stopServer(server: RunningServer): Promise<void> {
  if (server.child.exitCode != null) {
    return;
  }
  const exit = new Promise<void>((resolveExit) => server.child.once('exit', () => resolveExit()));
  server.child.kill('SIGTERM');
  await Promise.race([exit, delay(30_000).then(() => { server.child.kill('SIGKILL'); })]);
}

async function connectPlayer(baseUrl: string, token: string): Promise<Socket> {
  const socket = io(baseUrl, { path: '/socket.io', transports: ['websocket'], forceNew: true, auth: { token, protocol: 'mainline' } });
  const init = waitForSocketEvent(socket, S2C.InitSession);
  await init;
  return socket;
}

async function readPresenceAndLease(pool: Pool, playerId: string): Promise<Record<string, unknown>> {
  const presence = await pool.query(`SELECT online, in_world, offline_since_at FROM player_presence WHERE player_id = $1`, [playerId]);
  const lease = await pool.query(`SELECT assigned_node_id, lease_token, lease_expire_at FROM instance_catalog WHERE instance_id = $1`, [instanceId]);
  return {
    presenceOnline: presence.rows[0]?.online ?? null,
    inWorld: presence.rows[0]?.in_world ?? null,
    offlineSinceAt: presence.rows[0]?.offline_since_at ?? null,
    assignedNodeId: lease.rows[0]?.assigned_node_id ?? null,
    leaseToken: lease.rows[0]?.lease_token ?? null,
    leaseExpireAt: lease.rows[0]?.lease_expire_at ?? null,
  };
}

async function waitForHealth(baseUrl: string): Promise<void> {
  await waitForCondition(async () => {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  }, 60_000);
}

function waitForSocketEvent(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error(`socket event timeout: ${event}`)), 15_000);
    socket.once(event, (payload) => { clearTimeout(timer); resolveEvent(decodeSmokePayload(payload)); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
}

async function waitForCondition(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate().catch(() => false)) return;
    await delay(250);
  }
  throw new Error(`waitForCondition timeout after ${timeoutMs}ms`);
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('port unavailable')));
    });
    server.once('error', reject);
  });
}

function serverLogs(server: RunningServer | null): string {
  return server ? server.logs : '';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

interface RunningServer {
  child: ChildProcess;
  baseUrl: string;
  logs: string;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

/**
 * 验证正常关机时玩家 presence 会下线，且本节点实例 lease 会释放。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { S2C } from '@mud/shared';

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
const ownedDistSnapshot = process.env.SERVER_TOOL_DIST_ROOT ? null : createStableDistSnapshot({ label: 'shutdown-drain-smoke', packageRoot });
const distRoot = ownedDistSnapshot?.distRoot ?? resolveToolDistRoot(__dirname, packageRoot);
const repoRoot = resolve(packageRoot, '..', '..');
const serverEntry = join(distRoot, 'main.js');
const databaseUrl = resolveServerDatabaseUrl();
const instanceId = 'public:yunlai_town';
const serverNodeId = `shutdown-drain-smoke:${process.pid}`;

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
    const auth = await registerAndLoginSmokePlayer(server.baseUrl, { accountPrefix: 'shutdown_drain' });
    const socket = await connectPlayer(server.baseUrl, auth.accessToken);
    const before = await readPresenceAndLease(pool, auth.playerId);
    if (before.presenceOnline !== true) {
      throw new Error(`shutdown drain smoke expected online before shutdown: ${JSON.stringify(before)}`);
    }
    await triggerShutdownDrain(server.baseUrl);
    await stopServer(server);
    server = null;
    socket.close();
    const after = await readPresenceAndLease(pool, auth.playerId);
    if (after.presenceOnline !== false || after.offlineSinceAt == null || after.inWorld !== true) {
      throw new Error(`shutdown drain smoke presence not drained: ${JSON.stringify(after)}`);
    }
    if (isLeaseHeldBySmokeNode(after)) {
      throw new Error(`shutdown drain smoke lease not released: ${JSON.stringify(after)}`);
    }
    server = await startServer();
    await waitForHealth(server.baseUrl);
    if (server.logs.includes(`实例 ${instanceId} lease fencing 命中但仍有在线玩家`) && server.logs.includes(auth.playerId)) {
      throw new Error('shutdown drain smoke observed lease fencing for smoke player after restart');
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
    context: 'shutdown drain smoke',
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
      SERVER_ALLOW_LOCAL_SHUTDOWN_DRAIN: '1',
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

async function triggerShutdownDrain(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/shutdown-drain`, { method: 'POST' }).catch((error) => {
    throw new Error(`shutdown drain request failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!response.ok) {
    throw new Error(`shutdown drain request failed: status=${response.status}`);
  }
}

async function stopServer(server: RunningServer): Promise<void> {
  if (server.child.exitCode != null) {
    return;
  }
  const exit = new Promise<void>((resolveExit) => server.child.once('exit', () => resolveExit()));
  server.child.kill('SIGTERM');
  await Promise.race([exit, delay(20_000).then(() => { server.child.kill('SIGKILL'); })]);
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

function isLeaseHeldBySmokeNode(snapshot: Record<string, unknown>): boolean {
  const assignedNodeId = typeof snapshot.assignedNodeId === 'string' ? snapshot.assignedNodeId.trim() : '';
  const leaseToken = typeof snapshot.leaseToken === 'string' ? snapshot.leaseToken.trim() : '';
  return assignedNodeId === serverNodeId || leaseToken.startsWith(`${serverNodeId}:${instanceId}:`);
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

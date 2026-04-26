import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { NodeRegistryRuntimeService } from '../persistence/node-registry-runtime.service';
import { NodeRegistryService } from '../persistence/node-registry.service';

const databaseUrl = resolveServerDatabaseUrl();
const NODE_REGISTRY_TABLE = 'node_registry';

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证节点运行时会在启动时注册本节点、心跳维持 running，并在销毁时标记 dead',
          excludes: '不证明多节点分配策略、lease 接管、跨节点 transfer 或 split-brain',
          completionMapping: 'replace-ready:proof:with-db.node-registry-runtime',
        },
        null,
        2,
      ),
    );
    return;
  }

  const previousHost = process.env.SERVER_HOST;
  const previousPort = process.env.SERVER_PORT;
  const previousPublicHost = process.env.SERVER_PUBLIC_HOST;
  const previousPublicPort = process.env.SERVER_PUBLIC_PORT;
  const previousHeartbeatInterval = process.env.SERVER_NODE_HEARTBEAT_INTERVAL_MS;
  const previousSuspectAfter = process.env.SERVER_NODE_SUSPECT_AFTER_MS;
  const previousDeadAfter = process.env.SERVER_NODE_DEAD_AFTER_MS;

  process.env.SERVER_HOST = '127.0.0.1';
  process.env.SERVER_PORT = '13101';
  process.env.SERVER_PUBLIC_HOST = '127.0.0.1';
  process.env.SERVER_PUBLIC_PORT = '13101';
  process.env.SERVER_NODE_HEARTBEAT_INTERVAL_MS = '1000';
  process.env.SERVER_NODE_SUSPECT_AFTER_MS = '2000';
  process.env.SERVER_NODE_DEAD_AFTER_MS = '5000';

  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const nodeRegistryService = new NodeRegistryService(databasePoolProvider);
  const runtimeService = new NodeRegistryRuntimeService(nodeRegistryService);

  await nodeRegistryService.onModuleInit();
  await runtimeService.onModuleInit();

  const nodeId = nodeRegistryService.getNodeId();

  try {
    const registeredRow = await fetchNodeRow(pool, nodeId);
    if (!registeredRow || registeredRow.status !== 'running' || registeredRow.address !== '127.0.0.1' || Number(registeredRow.port) !== 13101) {
      throw new Error(`unexpected registered node row: ${JSON.stringify(registeredRow)}`);
    }

    await waitFor(1200);
    const heartbeatedRow = await fetchNodeRow(pool, nodeId);
    if (!heartbeatedRow || heartbeatedRow.status !== 'running' || !heartbeatedRow.heartbeat_at) {
      throw new Error(`unexpected heartbeated node row: ${JSON.stringify(heartbeatedRow)}`);
    }

    await runtimeService.onModuleDestroy();
    const deregisteredRow = await fetchNodeRow(pool, nodeId);
    if (!deregisteredRow || deregisteredRow.status !== 'dead') {
      throw new Error(`unexpected deregistered node row: ${JSON.stringify(deregisteredRow)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          nodeId,
          answers: 'with-db 下已验证 NodeRegistryRuntimeService 会在启动时注册本节点、周期性心跳维持 running，并在销毁时把 node_registry.status 标记为 dead',
          excludes: '不证明多节点分配策略、lease 接管、跨节点 transfer 或 split-brain',
          completionMapping: 'replace-ready:proof:with-db.node-registry-runtime',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupNodeRow(pool, nodeId).catch(() => undefined);
    await nodeRegistryService.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
    restoreEnv('SERVER_HOST', previousHost);
    restoreEnv('SERVER_PORT', previousPort);
    restoreEnv('SERVER_PUBLIC_HOST', previousPublicHost);
    restoreEnv('SERVER_PUBLIC_PORT', previousPublicPort);
    restoreEnv('SERVER_NODE_HEARTBEAT_INTERVAL_MS', previousHeartbeatInterval);
    restoreEnv('SERVER_NODE_SUSPECT_AFTER_MS', previousSuspectAfter);
    restoreEnv('SERVER_NODE_DEAD_AFTER_MS', previousDeadAfter);
  }
}

async function fetchNodeRow(pool: Pool, nodeId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(
    `SELECT node_id, address, port, status, heartbeat_at FROM ${NODE_REGISTRY_TABLE} WHERE node_id = $1 LIMIT 1`,
    [nodeId],
  );
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

async function cleanupNodeRow(pool: Pool, nodeId: string): Promise<void> {
  await pool.query(`DELETE FROM ${NODE_REGISTRY_TABLE} WHERE node_id = $1`, [nodeId]);
}

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
    return;
  }
  delete process.env[name];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

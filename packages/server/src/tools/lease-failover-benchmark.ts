import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { NodeRegistryService } from '../persistence/node-registry.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';

const DEFAULT_INSTANCE_COUNT = 100;
const DEFAULT_CONCURRENCY = 16;
const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可验证节点故障场景下 lease 接管的时延与成功率，并作为阶段 7.4 的故障注入起点报告',
      excludes: '不证明真实多节点 socket 导流、生产级 kill -9 节点或 split-brain',
      completionMapping: 'release:proof:stage7.lease-failover',
    }, null, 2));
    return;
  }

  const instanceCount = normalizePositiveInteger(readEnvNumber('LEASE_FAILOVER_INSTANCE_COUNT'), DEFAULT_INSTANCE_COUNT, 1, 1000);
  const concurrency = normalizePositiveInteger(readEnvNumber('LEASE_FAILOVER_CONCURRENCY'), DEFAULT_CONCURRENCY, 1, 128);

  const pool = new Pool({ connectionString: databaseUrl });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const worldRuntimeService = app.get(WorldRuntimeService);
  const nodeRegistryService = app.get(NodeRegistryService);
  const localNodeId = nodeRegistryService.getNodeId();
  const nodeId = `node:bench-dead:${Date.now().toString(36)}`;
  const instanceIds = Array.from({ length: instanceCount }, (_, index) => `line:yunlai_town:peaceful:${200 + index}`);

  try {
    await seedDeadNode(pool, nodeId);
    await seedRecoverableInstances(pool, instanceIds, nodeId);
    await seedDeadNodeCatalogs(pool, instanceIds, nodeId);

    const startedAt = performance.now();
    await worldRuntimeService.claimRecoverableCatalogInstances();
    const totalMs = performance.now() - startedAt;

    const recoveredCount = instanceIds.filter((instanceId) => Boolean(worldRuntimeService.getInstanceRuntime(instanceId))).length;
    assert.equal(recoveredCount, instanceCount);

    console.log(JSON.stringify({
      ok: true,
      instanceCount,
      concurrency,
      localNodeId,
      deadNodeId: nodeId,
      totalMs: round6(totalMs),
      avgMsPerInstance: round6(totalMs / instanceCount),
      answers: totalMs < 60_000
        ? `已跑通 ${instanceCount} 个过期 lease 的自动接管，阶段 7.4 故障注入项的本地基线满足 <60s 目标`
        : `已跑通 ${instanceCount} 个过期 lease 的自动接管，但总耗时超过 60s，需要进一步优化`,
      excludes: '不证明真实多节点通信故障注入或 split-brain',
      completionMapping: 'release:proof:stage7.lease-failover',
    }, null, 2));
  } finally {
    await cleanupLeaseFailoverRows(pool, instanceIds, nodeId).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function seedDeadNode(pool: Pool, nodeId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO node_registry(node_id, address, port, status, heartbeat_at, started_at, capacity_weight)
      VALUES ($1, '127.0.0.1', 11923, 'dead', now() - interval '10 minute', now() - interval '10 minute', 1)
      ON CONFLICT (node_id)
      DO UPDATE SET
        address = EXCLUDED.address,
        port = EXCLUDED.port,
        status = EXCLUDED.status,
        heartbeat_at = EXCLUDED.heartbeat_at,
        capacity_weight = EXCLUDED.capacity_weight
    `,
    [nodeId],
  );
}

async function seedRecoverableInstances(pool: Pool, instanceIds: string[], nodeId: string): Promise<void> {
  for (const instanceId of instanceIds) {
    await pool.query(
      `
        INSERT INTO instance_catalog(
          instance_id, template_id, instance_type, persistent_policy,
          status, runtime_status,
          assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
          shard_key, route_domain, created_at, last_active_at
        )
        VALUES (
          $1, 'yunlai_town', 'public', 'persistent',
          'active', 'leased',
          $2, $3, now() - interval '5 second', 7,
          $1, 'peaceful', now(), now()
        )
        ON CONFLICT (instance_id)
        DO UPDATE SET
          template_id = EXCLUDED.template_id,
          instance_type = EXCLUDED.instance_type,
          persistent_policy = EXCLUDED.persistent_policy,
          status = EXCLUDED.status,
          runtime_status = EXCLUDED.runtime_status,
          assigned_node_id = EXCLUDED.assigned_node_id,
          lease_token = EXCLUDED.lease_token,
          lease_expire_at = EXCLUDED.lease_expire_at,
          ownership_epoch = EXCLUDED.ownership_epoch,
          shard_key = EXCLUDED.shard_key,
          route_domain = EXCLUDED.route_domain,
          last_active_at = EXCLUDED.last_active_at
      `,
      [instanceId, nodeId, `lease:${instanceId}`],
    );
  }
}

async function seedDeadNodeCatalogs(pool: Pool, instanceIds: string[], nodeId: string): Promise<void> {
  await pool.query(
    `UPDATE instance_catalog SET status = 'active', runtime_status = 'leased', assigned_node_id = $2, lease_token = concat('lease:', instance_id), lease_expire_at = now() - interval '5 second' WHERE instance_id = ANY($1::varchar[])`,
    [instanceIds, nodeId],
  );
}

async function cleanupLeaseFailoverRows(pool: Pool, instanceIds: string[], nodeId: string): Promise<void> {
  await pool.query(`DELETE FROM instance_catalog WHERE instance_id = ANY($1::varchar[])`, [instanceIds]).catch(() => undefined);
  await pool.query(`DELETE FROM node_registry WHERE node_id = $1`, [nodeId]).catch(() => undefined);
}

function readEnvNumber(name: string): number | null {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePositiveInteger(value: number | null, defaultValue: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  const normalized = Math.trunc(value as number);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

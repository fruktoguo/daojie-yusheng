import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import { NodeRegistryService } from '../persistence/node-registry.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可输出节点 lease 健康、冲突与接管视图，并作为阶段 6.1 的 lease 指标入口',
      excludes: '不证明真实多节点 kill -9 或 split-brain',
      completionMapping: 'replace-ready:proof:stage6.lease-health',
    }, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const nodeRegistry = app.get(NodeRegistryService);
    const instanceCatalog = app.get(InstanceCatalogService);
    const nodes = await nodeRegistry.listNodes();
    const instances = await instanceCatalog.listInstanceCatalogEntries();
    const nodeById = new Map(nodes.map((entry) => [entry.nodeId, entry]));
    const now = Date.now();

    const leaseRows = instances.map((entry) => {
      const instanceId = typeof entry.instance_id === 'string' ? entry.instance_id.trim() : '';
      const assignedNodeId = typeof entry.assigned_node_id === 'string' ? entry.assigned_node_id.trim() : '';
      const leaseExpireAt = entry.lease_expire_at ? new Date(String(entry.lease_expire_at)).getTime() : 0;
      const status = typeof entry.status === 'string' ? entry.status.trim() : '';
      const runtimeStatus = typeof entry.runtime_status === 'string' ? entry.runtime_status.trim() : '';
      const assignedNode = assignedNodeId ? nodeById.get(assignedNodeId) ?? null : null;
      const nodeHealthy = assignedNode?.status === 'running' || assignedNode?.status === 'online';
      const leaseExpired = Number.isFinite(leaseExpireAt) && leaseExpireAt > 0 ? leaseExpireAt < now : true;
      const takeoverEligible = (status === 'active' || status === 'leased' || runtimeStatus === 'leased')
        && (!assignedNodeId || leaseExpired)
        && (typeof entry.persistent_policy === 'string' ? entry.persistent_policy === 'persistent' || entry.persistent_policy === 'long_lived' : false);
      const leaseConflict = Boolean(assignedNodeId) && !nodeHealthy && !leaseExpired;
      return {
        instanceId,
        assignedNodeId: assignedNodeId || null,
        status,
        runtimeStatus,
        leaseExpireAt: leaseExpireAt > 0 ? new Date(leaseExpireAt).toISOString() : null,
        nodeHealthy,
        leaseExpired,
        leaseConflict,
        takeoverEligible,
      };
    });

    const conflictRows = leaseRows.filter((row) => row.leaseConflict);
    const takeoverRows = leaseRows.filter((row) => row.takeoverEligible);
    const suspectNodes = nodes.filter((entry) => entry.status === 'suspect');
    const deadNodes = nodes.filter((entry) => entry.status === 'dead');

    console.log(JSON.stringify({
      ok: true,
      nodeCount: nodes.length,
      runningNodeCount: nodes.filter((entry) => entry.status === 'running').length,
      suspectNodeCount: suspectNodes.length,
      deadNodeCount: deadNodes.length,
      leaseConflictCount: conflictRows.length,
      takeoverEligibleCount: takeoverRows.length,
      takeoverExamples: takeoverRows.slice(0, 10),
      conflictExamples: conflictRows.slice(0, 10),
      answers: '当前可读 lease 健康视图已覆盖 node_registry + instance_catalog，可直接看到 lease 冲突与接管候选',
      excludes: '不证明真实多节点通信故障注入或 split-brain',
      completionMapping: 'replace-ready:proof:stage6.lease-health',
    }, null, 2));
  } finally {
    await app.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

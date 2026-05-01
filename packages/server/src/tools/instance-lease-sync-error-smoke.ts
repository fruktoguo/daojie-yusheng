// @ts-nocheck

const assert = require('node:assert/strict');

const { syncAllInstanceLeases } = require('../runtime/world/world-runtime-instance-lease.helpers');

async function main() {
  const warnings = [];
  const instance = {
    meta: {
      assignedNodeId: 'instance-lease-sync-error-smoke:local',
      leaseToken: 'lease:smoke:local',
      leaseExpireAt: new Date(Date.now() + 30_000).toISOString(),
      ownershipEpoch: 1,
      runtimeStatus: 'leased',
      status: 'active',
      persistentPolicy: 'persistent',
    },
  };
  const runtime = {
    logger: {
      warn(message) {
        warnings.push(String(message));
      },
    },
    nodeRegistryService: {
      getNodeId() {
        return 'instance-lease-sync-error-smoke:local';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async renewInstanceLease() {
        throw new Error('simulated pg lease renewal timeout');
      },
      async listInstanceCatalogEntries() {
        return [];
      },
    },
    listInstanceEntries() {
      return [['public:smoke_instance', instance]];
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:smoke_instance' ? instance : null;
    },
  };

  await syncAllInstanceLeases(runtime);

  assert.equal(instance.meta.runtimeStatus, 'leased');
  assert.equal(instance.meta.status, 'active');
  assert.ok(warnings.some((message) => message.includes('simulated pg lease renewal timeout')));

  console.log(JSON.stringify({
    ok: true,
    containedLeaseSyncError: true,
    runtimeStatus: instance.meta.runtimeStatus,
    answers: '实例 lease 周期同步遇到 PostgreSQL 续约异常时会记录并继续，不再把异常冒泡到进程级 unhandled rejection',
    excludes: '不证明真实 PostgreSQL 网络质量、跨节点 failover、Swarm 调度或生产数据库锁等待来源',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// @ts-nocheck

const assert = require('node:assert/strict');

const {
  fenceInstanceRuntime,
  syncAllInstanceLeases,
  syncInstanceLease,
} = require('../runtime/world/world-runtime-instance-lease.helpers');

async function main() {
  const contained = await verifyLeaseSyncErrorContained();
  const degraded = await verifyLocalLeaseDegradeAndRecover();

  console.log(JSON.stringify({
    ok: true,
    containedLeaseSyncError: contained.containedLeaseSyncError,
    degradedLeaseRecovered: degraded.degradedLeaseRecovered,
    answers: '实例 lease 周期同步遇到 PostgreSQL 续约异常时会记录并继续；本节点 lease 过期时真实写路径进入 lease_degraded 保活，不卸载实例，catalog 续约恢复后重新变为 leased',
    excludes: '不证明真实 PostgreSQL 网络质量、跨节点 failover、Swarm 调度或生产数据库锁等待来源',
  }, null, 2));
}

async function verifyLeaseSyncErrorContained() {
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

  return {
    containedLeaseSyncError: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

async function verifyLocalLeaseDegradeAndRecover() {
  const warnings = [];
  let deleted = false;
  const instance = {
    meta: {
      assignedNodeId: 'instance-lease-sync-error-smoke:local',
      leaseToken: 'lease:smoke:expired-local',
      leaseExpireAt: new Date(Date.now() - 30_000).toISOString(),
      ownershipEpoch: 3,
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
      error(message) {
        throw new Error(`unexpected fence error log: ${message}`);
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
        return true;
      },
      async listInstanceCatalogEntries() {
        return [];
      },
    },
    worldRuntimeInstanceStateService: {
      deleteInstanceRuntime() {
        deleted = true;
      },
    },
    worldRuntimeTickProgressService: {
      clearInstance() {},
    },
    worldRuntimeLootContainerService: {
      removeInstanceState() {},
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:expired_local_lease' ? instance : null;
    },
  };

  fenceInstanceRuntime(runtime, 'public:expired_local_lease', 'advance_frame_lease_check_failed');
  assert.equal(deleted, false);
  assert.equal(instance.meta.runtimeStatus, 'lease_degraded');
  assert.equal(instance.meta.status, 'active');
  assert.ok(warnings.some((message) => message.includes('续租降级')));

  await syncInstanceLease(runtime, 'public:expired_local_lease');
  assert.equal(instance.meta.runtimeStatus, 'leased');
  assert.equal(instance.meta.status, 'active');
  assert.ok(Date.parse(instance.meta.leaseExpireAt) > Date.now());

  return {
    degradedLeaseRecovered: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';

import {
  claimRecoverableCatalogInstances,
  syncAllInstanceLeases,
} from '../runtime/world/world-runtime-instance-lease.helpers';

async function main(): Promise<void> {
  const previousForce = process.env.SERVER_FORCE_RECLAIM_STALE_LEASES;
  const previousRuntimeEnv = process.env.SERVER_RUNTIME_ENV;
  process.env.SERVER_FORCE_RECLAIM_STALE_LEASES = '1';
  process.env.SERVER_RUNTIME_ENV = 'development';
  try {
    const periodicProof = await verifyPeriodicSyncDoesNotForceReclaim();
    const startupProof = await verifyStartupRecoveryStillCanForceReclaim();
    console.log(JSON.stringify({
      ok: true,
      periodicProof,
      startupProof,
      answers: '实例 lease 周期同步不会把 dev/local 的 force reclaim 泄漏到常规续租；启动恢复显式传入 allowForceReclaim 时仍可强制接管旧租约',
      excludes: '不证明真实 PostgreSQL 锁等待、跨节点 socket 迁移或生产节点故障转移，只证明运行时 lease 同步分支选择',
    }, null, 2));
  } finally {
    restoreEnv('SERVER_FORCE_RECLAIM_STALE_LEASES', previousForce);
    restoreEnv('SERVER_RUNTIME_ENV', previousRuntimeEnv);
  }
}

async function verifyPeriodicSyncDoesNotForceReclaim(): Promise<{
  forceClaimCalls: number;
  normalClaimCalls: number;
  runtimeFenced: boolean;
}> {
  const instanceId = 'tower:tongtian:layer:30';
  const catalogRow = {
    instance_id: instanceId,
    template_id: 'tongtian_tower_layer_30',
    persistent_policy: 'persistent',
    status: 'active',
    runtime_status: 'leased',
    assigned_node_id: 'node:remote',
    lease_token: 'lease:remote:valid',
    lease_expire_at: new Date(Date.now() + 60_000).toISOString(),
    ownership_epoch: 7,
  };
  let deleted = false;
  let forceClaimCalls = 0;
  let normalClaimCalls = 0;
  const instance = {
    meta: {
      instanceId,
      assignedNodeId: 'node:remote',
      leaseToken: 'lease:remote:valid',
      leaseExpireAt: catalogRow.lease_expire_at,
      ownershipEpoch: 7,
      runtimeStatus: 'leased',
      status: 'active',
      persistentPolicy: 'persistent',
    },
    listPlayerIds() {
      return [];
    },
  };
  const runtime = {
    logger: {
      warn() {},
      error() {},
    },
    nodeRegistryService: {
      getNodeId() {
        return 'node:local';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async renewInstanceLease() {
        return false;
      },
      async claimInstanceLease() {
        normalClaimCalls += 1;
        return { ok: false, ownershipEpoch: null };
      },
      async forceClaimInstanceLease() {
        forceClaimCalls += 1;
        return { ok: true, ownershipEpoch: 8 };
      },
      async loadInstanceCatalog() {
        return catalogRow;
      },
      async listInstanceCatalogEntries() {
        return [catalogRow];
      },
    },
    listInstanceEntries() {
      return deleted ? [] : [[instanceId, instance]];
    },
    getInstanceRuntime(candidateInstanceId: string) {
      return !deleted && candidateInstanceId === instanceId ? instance : null;
    },
    worldRuntimeInstanceStateService: {
      deleteInstanceRuntime(candidateInstanceId: string) {
        if (candidateInstanceId === instanceId) {
          deleted = true;
        }
      },
    },
    worldRuntimeTickProgressService: {
      clearInstance() {},
    },
    worldRuntimeLootContainerService: {
      removeInstanceState() {},
    },
    runtimeEventBusService: {
      discardInstance() {},
    },
    worldRuntimeFormationService: {
      releaseInstance() {},
    },
  };

  await syncAllInstanceLeases(runtime);

  assert.equal(forceClaimCalls, 0);
  assert.equal(normalClaimCalls, 0);
  assert.equal(deleted, true);
  assert.equal(instance.meta.runtimeStatus, 'fenced');
  assert.equal(instance.meta.status, 'lease_lost');

  return {
    forceClaimCalls,
    normalClaimCalls,
    runtimeFenced: true,
  };
}

async function verifyStartupRecoveryStillCanForceReclaim(): Promise<{
  claimedCount: number;
  forceClaimCalls: number;
  createdInstanceId: string;
}> {
  const instanceId = 'line:yunlai_town:peaceful:77';
  const catalogRow = {
    instance_id: instanceId,
    template_id: 'yunlai_town',
    instance_type: 'public',
    persistent_policy: 'persistent',
    status: 'active',
    runtime_status: 'leased',
    assigned_node_id: 'node:remote',
    lease_token: 'lease:remote:valid',
    lease_expire_at: new Date(Date.now() + 60_000).toISOString(),
    ownership_epoch: 4,
    route_domain: 'peaceful',
    shard_key: instanceId,
  };
  let forceClaimCalls = 0;
  let createdInstanceId = '';
  const runtime = {
    logger: {
      log() {},
      warn() {},
    },
    nodeRegistryService: {
      getNodeId() {
        return 'node:local';
      },
    },
    templateRepository: {
      has(templateId: string) {
        return templateId === 'yunlai_town';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async listInstanceCatalogEntries() {
        return [catalogRow];
      },
      async forceClaimInstanceLease() {
        forceClaimCalls += 1;
        return { ok: true, ownershipEpoch: 5 };
      },
      async claimInstanceLease() {
        throw new Error('startup recovery should use force claim for valid remote dev lease');
      },
    },
    getInstanceRuntime() {
      return null;
    },
    createInstance(input: { instanceId: string }) {
      createdInstanceId = input.instanceId;
      return {};
    },
    worldRuntimeLootContainerService: {
      hydrateContainerStates() {},
    },
    instanceDomainPersistenceService: {
      isEnabled() {
        return false;
      },
    },
  };

  const claimedCount = await claimRecoverableCatalogInstances(runtime, { allowForceReclaim: true });

  assert.equal(claimedCount, 1);
  assert.equal(forceClaimCalls, 1);
  assert.equal(createdInstanceId, instanceId);

  return {
    claimedCount,
    forceClaimCalls,
    createdInstanceId,
  };
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

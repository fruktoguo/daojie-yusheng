// @ts-nocheck

const assert = require('node:assert/strict');

const {
  fenceInstanceRuntime,
  syncAllInstanceLeases,
  syncInstanceLease,
  syncManagedInstanceRegistration,
} = require('../runtime/world/world-runtime-instance-lease.helpers');

async function main() {
  const contained = await verifyLeaseSyncErrorContained();
  const degraded = await verifyLocalLeaseDegradeAndRecover();
  const reclaimed = await verifyMissingCatalogLeaseIsReclaimed();
  const periodicFailed = await verifyLocalLeaseSyncFailureDegrades();
  const startupDeferred = await verifyManagedLeaseSyncIsDeferredWhileStartupGateClosed();
  const towerTemplate = await verifyTowerCatalogTemplateIsRestoredBeforeQuarantine();
  const missingTemplate = await verifyMissingTemplateCatalogIsQuarantined();

  console.log(JSON.stringify({
    ok: true,
    containedLeaseSyncError: contained.containedLeaseSyncError,
    degradedLeaseRecovered: degraded.degradedLeaseRecovered,
    missingCatalogLeaseReclaimed: reclaimed.missingCatalogLeaseReclaimed,
    localLeaseSyncFailureDegraded: periodicFailed.localLeaseSyncFailureDegraded,
    managedLeaseSyncDeferredDuringStartup: startupDeferred.managedLeaseSyncDeferredDuringStartup,
    towerTemplateRestored: towerTemplate.towerTemplateRestored,
    missingTemplateQuarantined: missingTemplate.missingTemplateQuarantined,
    answers: '实例 lease 周期同步遇到 PostgreSQL 续约异常时会记录并继续；本节点 lease 过期时真实写路径进入 lease_degraded 保活，不卸载实例，catalog 续约恢复后重新变为 leased；启动写门关闭时托管实例注册不会抢先续租；实例目录引用已退役地图模板时会隔离为 template_missing 并清掉 lease，不反复接管',
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

async function verifyMissingCatalogLeaseIsReclaimed() {
  const warnings = [];
  const instance = {
    meta: {
      assignedNodeId: 'instance-lease-sync-error-smoke:local',
      leaseToken: 'lease:smoke:runtime-local',
      leaseExpireAt: new Date(Date.now() + 30_000).toISOString(),
      ownershipEpoch: 20,
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
        return false;
      },
      async claimInstanceLease() {
        return { ok: true, ownershipEpoch: 21 };
      },
      async loadInstanceCatalog() {
        return {
          assigned_node_id: null,
          lease_token: null,
          lease_expire_at: null,
          ownership_epoch: 20,
          runtime_status: 'template_missing',
          status: 'active',
        };
      },
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'tower:tongtian:layer:31' ? instance : null;
    },
  };

  await syncInstanceLease(runtime, 'tower:tongtian:layer:31');

  assert.equal(instance.meta.runtimeStatus, 'leased');
  assert.equal(instance.meta.status, 'active');
  assert.equal(instance.meta.assignedNodeId, 'instance-lease-sync-error-smoke:local');
  assert.notEqual(instance.meta.leaseToken, 'lease:smoke:runtime-local');
  assert.equal(instance.meta.ownershipEpoch, 21);
  assert.ok(warnings.some((message) => message.includes('重新接管')));

  return {
    missingCatalogLeaseReclaimed: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

async function verifyLocalLeaseSyncFailureDegrades() {
  const warnings = [];
  const errors = [];
  let deleted = false;
  const instance = {
    meta: {
      assignedNodeId: 'instance-lease-sync-error-smoke:local',
      leaseToken: 'lease:smoke:local-valid',
      leaseExpireAt: new Date(Date.now() + 30_000).toISOString(),
      ownershipEpoch: 7,
      runtimeStatus: 'leased',
      status: 'active',
      persistentPolicy: 'persistent',
    },
    listPlayerIds() {
      return ['player:online'];
    },
  };
  const runtime = {
    logger: {
      warn(message) {
        warnings.push(String(message));
      },
      error(message) {
        errors.push(String(message));
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
        return false;
      },
      async claimInstanceLease() {
        return { ok: false, ownershipEpoch: null };
      },
      async loadInstanceCatalog() {
        return {
          assigned_node_id: null,
          lease_token: null,
          lease_expire_at: null,
          ownership_epoch: 7,
        };
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
      return instanceId === 'tower:tongtian:layer:30' ? instance : null;
    },
  };

  await syncInstanceLease(runtime, 'tower:tongtian:layer:30');

  assert.equal(deleted, false);
  assert.deepEqual(errors, []);
  assert.equal(instance.meta.runtimeStatus, 'lease_degraded');
  assert.equal(instance.meta.status, 'active');
  assert.ok(warnings.some((message) => message.includes('续租降级')));

  return {
    localLeaseSyncFailureDegraded: true,
    runtimeStatus: instance.meta.runtimeStatus,
  };
}

async function verifyManagedLeaseSyncIsDeferredWhileStartupGateClosed() {
  let upserted = false;
  let leaseSyncTouched = false;
  const instance = {
    kind: 'public',
    template: { id: 'startup_bootstrap_map' },
    meta: {
      persistentPolicy: 'persistent',
      runtimeStatus: 'running',
      status: 'active',
    },
  };
  const runtime = {
    logger: {
      warn(message) {
        throw new Error(`unexpected managed registration warning: ${message}`);
      },
    },
    startupBarrierService: {
      isInstanceWritable(instanceId) {
        assert.equal(instanceId, 'public:startup_bootstrap_map');
        return false;
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async upsertInstanceCatalog(input) {
        upserted = input.instanceId === 'public:startup_bootstrap_map';
        return true;
      },
      async renewInstanceLease() {
        leaseSyncTouched = true;
        throw new Error('startup gate should defer managed lease renew');
      },
      async claimInstanceLease() {
        leaseSyncTouched = true;
        throw new Error('startup gate should defer managed lease claim');
      },
      async loadInstanceCatalog() {
        leaseSyncTouched = true;
        throw new Error('startup gate should defer managed lease load');
      },
    },
    nodeRegistryService: {
      getNodeId() {
        return 'instance-lease-sync-error-smoke:local';
      },
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:startup_bootstrap_map' ? instance : null;
    },
  };

  syncManagedInstanceRegistration(runtime, 'public:startup_bootstrap_map', instance);
  await waitForDeferredRegistration();

  assert.equal(upserted, true);
  assert.equal(leaseSyncTouched, false);

  return {
    managedLeaseSyncDeferredDuringStartup: true,
  };
}

async function verifyTowerCatalogTemplateIsRestoredBeforeQuarantine() {
  const marked = [];
  const restored = [];
  const created = [];
  const catalogEntry = {
    instance_id: 'tower:tongtian:layer:41',
    template_id: 'tongtian_tower_layer_41',
    instance_type: 'tower',
    persistent_policy: 'persistent',
    status: 'active',
    runtime_status: 'template_missing',
    assigned_node_id: null,
    lease_token: null,
    lease_expire_at: null,
    ownership_epoch: 11,
  };
  const templates = new Set();
  const runtime = {
    logger: {
      log() {},
      warn() {},
    },
    nodeRegistryService: {
      getNodeId() {
        return 'instance-lease-sync-error-smoke:local';
      },
    },
    templateRepository: {
      has(templateId) {
        return templates.has(templateId);
      },
    },
    worldRuntimeTongtianTowerService: {
      restoreCatalogTowerTemplate(entry) {
        restored.push(entry.instance_id);
        templates.add(entry.template_id);
        return true;
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async listInstanceCatalogEntries() {
        return [catalogEntry];
      },
      async claimInstanceLease() {
        return { ok: true, ownershipEpoch: 12 };
      },
      async markInstanceTemplateMissing(input) {
        marked.push(input);
        return true;
      },
    },
    listInstanceEntries() {
      return [];
    },
    getInstanceRuntime() {
      return null;
    },
    createInstance(input) {
      created.push(input);
      return {
        meta: {
          instanceId: input.instanceId,
          ownershipEpoch: input.ownershipEpoch,
        },
      };
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

  const claimed = await syncAllInstanceLeases(runtime);

  assert.equal(claimed, undefined);
  assert.deepEqual(marked, []);
  assert.deepEqual(restored, ['tower:tongtian:layer:41']);
  assert.equal(created[0]?.instanceId, 'tower:tongtian:layer:41');

  return {
    towerTemplateRestored: true,
  };
}

async function verifyMissingTemplateCatalogIsQuarantined() {
  const warnings = [];
  const marked = [];
  const catalogEntry = {
    instance_id: 'public:removed_map',
    template_id: 'removed_map',
    persistent_policy: 'persistent',
    status: 'active',
    runtime_status: 'leased',
    assigned_node_id: 'old-node',
    lease_token: 'old-lease',
    lease_expire_at: new Date(Date.now() - 10_000).toISOString(),
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
    templateRepository: {
      has(templateId) {
        return templateId !== 'removed_map';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async listInstanceCatalogEntries() {
        return [catalogEntry];
      },
      async markInstanceTemplateMissing(input) {
        marked.push(input);
        catalogEntry.status = 'active';
        catalogEntry.runtime_status = 'template_missing';
        catalogEntry.assigned_node_id = null;
        catalogEntry.lease_token = null;
        catalogEntry.lease_expire_at = null;
        return true;
      },
      async claimInstanceLease() {
        throw new Error('missing template catalog entry must not claim lease');
      },
    },
    listInstanceEntries() {
      return [];
    },
    getInstanceRuntime() {
      return null;
    },
  };

  await syncAllInstanceLeases(runtime);
  assert.deepEqual(marked, [{ instanceId: 'public:removed_map', templateId: 'removed_map' }]);
  assert.equal(catalogEntry.runtime_status, 'template_missing');
  assert.equal(catalogEntry.assigned_node_id, null);
  assert.equal(catalogEntry.lease_token, null);
  assert.equal(catalogEntry.lease_expire_at, null);
  assert.ok(warnings.some((message) => message.includes('已标记为待内容恢复')));

  const warningCount = warnings.length;
  await syncAllInstanceLeases(runtime);
  assert.equal(marked.length, 1);
  assert.equal(warnings.length, warningCount);

  return {
    missingTemplateQuarantined: true,
    runtimeStatus: catalogEntry.runtime_status,
  };
}

function waitForDeferredRegistration() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

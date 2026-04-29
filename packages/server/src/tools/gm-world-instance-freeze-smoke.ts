// @ts-nocheck

/**
 * 用途：执行 GM 实例冻结/解冻写入命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  let frozen = false;
  const runtime = {
    meta: {
      assignedNodeId: 'node:self',
      leaseToken: 'lease:abc',
      leaseExpireAt: '2026-04-23T00:00:30.000Z',
      ownershipEpoch: 7,
      runtimeStatus: 'leased',
      status: 'active',
    },
  };
  const service = Object.create(NativeGmWorldService.prototype);
  service.playerPersistenceFlushService = { async flushPlayer() {} };
  service.mapPersistenceFlushService = { async flushInstance() {} };
  service.outboxDispatcherService = { async listRetryQueue() { return []; } };
  service.nodeRegistryService = {
    isEnabled() { return true; },
    getNodeId() { return 'node:self'; },
    listNodes() { return Promise.resolve([]); },
  };
  service.worldRuntimeService = {
    getRuntimeSummary() { return {}; },
    getInstanceLeaseStatus(instanceId) {
      return Promise.resolve({
        instanceId,
        nodeId: 'node:self',
        runtime: runtime.meta,
        catalog: runtime.meta,
        writable: !frozen,
      });
    },
    freezeInstanceWriting(instanceId) {
      frozen = true;
      runtime.meta.runtimeStatus = 'fenced';
      runtime.meta.status = 'lease_lost';
    },
    unfreezeInstanceWriting(instanceId) {
      frozen = false;
      runtime.meta.runtimeStatus = 'leased';
      runtime.meta.status = 'active';
      return { ok: true };
    },
    async rebuildPersistentInstance() {
      return { ok: true };
    },
    listInstances() { return []; },
    getInstance() { return null; },
    getPlayerLocation() { return null; },
    createInstance() { return { snapshot() { return {}; } }; },
    playerRuntimeService: { getPlayer() { return null; } },
    worldRuntimeGmQueueService: { hasPendingRespawns() { return false; }, hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: false }; } },
  };
  return {
    service,
    runtime,
    isFrozen: () => frozen,
  };
}

async function main() {
  const { service, isFrozen, runtime } = createService();
  service.freezeInstanceWriting('instance:shadow-town');
  assert.equal(isFrozen(), true);
  assert.equal(runtime.meta.runtimeStatus, 'fenced');
  const unfreeze = service.unfreezeInstanceWriting('instance:shadow-town');
  assert.deepEqual(unfreeze, { ok: true });
  assert.equal(isFrozen(), false);
  assert.equal(runtime.meta.runtimeStatus, 'leased');
  assert.equal(runtime.meta.status, 'active');
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-instance-freeze',
    instanceId: 'instance:shadow-town',
    frozen: false,
    runtime,
  }, null, 2));
}

main();

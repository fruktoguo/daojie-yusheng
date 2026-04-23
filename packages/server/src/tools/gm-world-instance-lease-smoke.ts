// @ts-nocheck

/**
 * 用途：执行 GM 实例 lease / owner 命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
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
        runtime: {
          assignedNodeId: 'node:self',
          leaseToken: 'lease:abc',
          leaseExpireAt: '2026-04-23T00:00:30.000Z',
          ownershipEpoch: 7,
          runtimeStatus: 'leased',
          status: 'active',
        },
        catalog: {
          assignedNodeId: 'node:self',
          leaseToken: 'lease:abc',
          leaseExpireAt: '2026-04-23T00:00:30.000Z',
          ownershipEpoch: 7,
          runtimeStatus: 'leased',
          status: 'active',
        },
        writable: true,
      });
    },
    freezeInstanceWriting() {},
    unfreezeInstanceWriting() { return { ok: true }; },
    async rebuildPersistentInstance() { return { ok: true }; },
    listInstances() { return []; },
    getInstance() { return null; },
    getPlayerLocation() { return null; },
    createInstance() { return { snapshot() { return {}; } }; },
    playerRuntimeService: { getPlayer() { return null; } },
    worldRuntimeGmQueueService: { hasPendingRespawns() { return false; }, hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: false }; } },
  };
  return service;
}

async function main() {
  const service = createService();
  const payload = await service.getInstanceLeaseStatus('instance:shadow-town');
  assert.equal(payload.instanceId, 'instance:shadow-town');
  assert.equal(payload.nodeId, 'node:self');
  assert.equal(payload.writable, true);
  assert.equal(payload.runtime?.assignedNodeId, 'node:self');
  assert.equal(payload.catalog?.ownershipEpoch, 7);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-instance-lease',
    lease: payload,
  }, null, 2));
}

main();
